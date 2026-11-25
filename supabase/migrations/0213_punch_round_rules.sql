-- 0213_punch_round_rules（起票159 勤務時間の丸めを給与に・相談役 11/25 の決め D4・起草と試走まで・適用はしない）
--   決め（相談役 11/25・Agoora）：丸めは「変えた営業日から」効く。それより前の日は前の丸めのまま。確定済みの期は変わらない（凍結）。
--     書けるのはオーナーだけ（店長は見るだけ）・課金の柵・監査・同意の版（単位が 1 より大きい変更は今の版 v1 の同意が要る。版が上がっても今の丸めは止めず、次の保存でチェックを求める）。
--   中身：
--     1. 表 punch_round_rules（店ごとの「いつから・何分・どの向き」の履歴・1 店 1 営業日 1 行・テーブル追加の標準型＝RLS は SELECT だけ・revoke all → grant select）。
--        行が無い営業日＝丸めない（今の店はどれも単位 1＝行 0 で始まる＝事前確認で丸めを使う店が 0 を確かめる）。
--     2. trigger 関数 punch_round_rules_track（stores の punch_round_unit／punch_round_mode が変わった時だけ、その店の今日の営業日の行を書く＝同じ営業日の中の直しはその日の行を上書き）。
--        履歴の書き手はこの 1 つだけ＝set_store_profile（初期設定・今の 3 キー）でも set_punch_round（店舗設定）でも同じ行になる。set_store_profile は張り替えない。
--     3. 書く関数 set_punch_round（オーナーだけ・課金の柵・同意の版 v1・punch_round_consents に 1 行・stores の 2 列・audit）。変更なしは何もしない（行も監査も増えない）。
--   翻訳元：0175（punch_round_consents・set_store_profile の丸めの段 ★8＝0201q 700〜717 行）・BANZEN 0107 set_punch_round_config（同意の版の決まり）。0208 set_cast_rank_shift_time（柵と監査の形）。
--   前提：関数 490・表 128（0211 の後＝2026-11-25 11 時台の本番の実測と同じ）。当てる直前に本番から数え直す（0212 が先に当たれば数が動く）。
--   数：関数 +2（set_punch_round・punch_round_rules_track）・表 +1（punch_round_rules）＝492・129。
--   検証クエリ：docs/tmp/round_1125/0213_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）。
begin;
set local lock_timeout = '10s';

-- ── 1. 表（標準型：表 → index → RLS → SELECT のポリシー → revoke all → grant select） ──
create table public.punch_round_rules (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  effective_from date not null,                                   -- この営業日から効く（店の締めの時刻で決めた営業日）
  unit           smallint not null check (unit in (1,5,10,15,30)),
  mode           text not null check (mode in ('staff_favor','store_favor','nearest')),
  changed_by     uuid null references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint punch_round_rules_store_day_uq unique (store_id, effective_from)
);
create index punch_round_rules_org_idx on public.punch_round_rules (org_id);
alter table public.punch_round_rules enable row level security;
create policy punch_round_rules_select on public.punch_round_rules for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));   -- 標準の店スコープ（自店のキャスト・スタッフも読める＝本人の勤怠の表が同じ丸めを読む）
revoke all on table public.punch_round_rules from public, anon, authenticated;
grant select on table public.punch_round_rules to authenticated;
comment on table public.punch_round_rules is '★0213（起票159）: 勤務時間の丸めの履歴（店ごと・effective_from の営業日から効く・1 店 1 営業日 1 行＝同じ日の直しは上書き）。書くのは stores の trigger（punch_round_rules_track）だけ。行の無い日＝丸めない';

-- ── 2. 履歴を書く trigger（内部専用・4 ロール revoke） ──
create or replace function public.punch_round_rules_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_bd    date;
  v_actor uuid;
begin
  if tg_op = 'UPDATE' and new.punch_round_unit = old.punch_round_unit and new.punch_round_mode = old.punch_round_mode then return null; end if;
  if tg_op = 'INSERT' and new.punch_round_unit = 1 then return null; end if;   -- 新しい店は既定 1（丸めない）＝行は要らない
  v_bd := public.biz_date_of(new.id, now());
  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active limit 1;
  insert into public.punch_round_rules (org_id, store_id, effective_from, unit, mode, changed_by)
  values (new.org_id, new.id, v_bd, new.punch_round_unit, new.punch_round_mode, v_actor)
  on conflict (store_id, effective_from) do update
    set unit = excluded.unit, mode = excluded.mode, changed_by = excluded.changed_by, updated_at = now();   -- 同じ営業日の中の直し＝その日の行を上書き（初期設定の入れ間違いをすぐ直してその日から効かせる）
  return null;
end $$;
revoke execute on function public.punch_round_rules_track() from public, anon, authenticated, service_role;
create trigger stores_punch_round_track
  after insert or update of punch_round_unit, punch_round_mode on public.stores
  for each row execute function public.punch_round_rules_track();

-- ── 3. 書く関数（オーナーだけ・課金の柵・同意の版・監査） ──
create or replace function public.set_punch_round(p_store_id uuid, p_unit integer, p_mode text, p_consent_version text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_store  public.stores;
  v_actor  uuid;
  v_pcv    text := nullif(trim(coalesce(p_consent_version, '')), '');
  v_cur    constant text := 'v1';   -- 今の同意の版（client の PUNCH_ROUND_CONSENT_VERSION と同じ・上げるときは mig で）
  v_bd     date;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;   -- 書けるのはオーナーだけ（店長は見るだけ）
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select s.* into v_store from public.stores s where s.id = p_store_id and s.org_id = v_org for update;
  if v_store.id is null then raise exception 'not found'; end if;
  if p_unit is null or p_unit not in (1,5,10,15,30) then raise exception 'bad punch_round_unit'; end if;
  if p_mode is null or p_mode not in ('staff_favor','store_favor','nearest') then raise exception 'bad punch_round_mode'; end if;
  v_bd := public.biz_date_of(p_store_id, now());
  if p_unit = v_store.punch_round_unit and p_mode = v_store.punch_round_mode then
    return jsonb_build_object('changed', false, 'unit', p_unit, 'mode', p_mode, 'effective_from', v_bd);   -- 変更なし＝何もしない（同意も要らない）
  end if;
  if p_unit > 1 and v_pcv is null then raise exception 'consent required'; end if;
  if p_unit > 1 and v_pcv <> v_cur then raise exception 'consent outdated'; end if;   -- 版が上がったら次の保存で今の版のチェックを求める（今の丸めは止めない）
  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  insert into public.punch_round_consents (org_id, store_id, changed_by, old_unit, old_mode, new_unit, new_mode, consent_version)
  values (v_org, p_store_id, v_actor, v_store.punch_round_unit, v_store.punch_round_mode, p_unit, p_mode, case when p_unit > 1 then v_pcv end);
  update public.stores set punch_round_unit = p_unit::smallint, punch_round_mode = p_mode, updated_at = now() where id = p_store_id;   -- 履歴の行は trigger（punch_round_rules_track）が今日の営業日で書く
  perform public.audit_log_write(p_action => 'set_punch_round', p_target => 'stores:' || p_store_id::text,
    p_before => jsonb_build_object('punch_round_unit', v_store.punch_round_unit, 'punch_round_mode', v_store.punch_round_mode),
    p_after  => jsonb_build_object('punch_round_unit', p_unit, 'punch_round_mode', p_mode, 'punch_round_consent_version', case when p_unit > 1 then v_pcv end, 'effective_from', v_bd),
    p_store_id => p_store_id);
  return jsonb_build_object('changed', true, 'unit', p_unit, 'mode', p_mode, 'effective_from', v_bd);
end $$;
revoke execute on function public.set_punch_round(uuid, integer, text, text) from public, anon;
grant execute on function public.set_punch_round(uuid, integer, text, text) to authenticated;

commit;
