-- 0206 本体（単一トランザクション）
-- 0206_cast_employment 版 2（起票146 の案・相談役 11/23 23:10 の ■2・11/24 2:20 の ■3・2026-11-24 起草・**案まで＝相談役が本体を読んでから main・未適用**）
-- 版 2 で足したもの: 6. payroll_adjustment_add の区分の判定を、その給与期の期首に有効な区分に（auto-penalty は画面の側＝旗 MIG_0206_APPLIED の後ろで同じ純関数）
-- 翻訳元: cast_plan（表の形・RLS・部分 unique）と、本番の set_cast_employment（2026-11-24 読取＝docs/tmp/fn_set_cast_employment_1124.sql）
-- 何を: 契約区分の履歴の表 cast_employment を作り、set_cast_employment が行を書く（前の行を閉じて新しい行を足す）。
--   給与の計算（collect）は、期首に有効な行を読む（無ければ期の中で最も早い行・履歴が無い人は casts.employment＝今と同じ）＝旗 MIG_0206_APPLIED。
--   casts.employment／employment_valid_from は今までどおり「最後に決めた値」を持つ（画面の表示と、ほかの読み手はそのまま＝起票146 の一覧）。
-- 貼る前: 0206_precheck.sql（読むだけ）・貼った後: 0206_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）

begin;
set local lock_timeout = '5s';

-- ── 1. 表（cast_plan と同じ形）
create table public.cast_employment (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  cast_id     uuid not null references public.casts(id) on delete cascade,   -- 人を消したら履歴も消える（verify の掃除が casts を消すため・cast_plan は掃除が先に消している）
  employment  text not null check (employment in ('委託','雇用')),
  valid_from  date not null,
  valid_to    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index cast_employment_cast_from_uidx on public.cast_employment (cast_id, valid_from);
create unique index cast_employment_current_uidx on public.cast_employment (cast_id) where valid_to is null;
create index cast_employment_store_idx on public.cast_employment (store_id);
create index cast_employment_org_idx on public.cast_employment (org_id);

-- ── 2. RLS（読むだけ・cast_plan と同じ＝店のスコープ＋キャストは本人の行だけ）
alter table public.cast_employment enable row level security;
create policy cast_employment_select on public.cast_employment for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager') or cast_id = public.auth_cast_id()));

-- ── 3. grant（SELECT だけ・TRUNCATE の穴を塞ぐ）
revoke all on table public.cast_employment from public, anon, authenticated;
grant select on table public.cast_employment to authenticated;

-- ── 4. 今の値から 1 行ずつ（契約区分がある人だけ・開始は入店日と作った日の早い方＝JST）
--   2026-11-24 の本番は employment_valid_from が全員 null・set_cast_employment の監査の記録も 0 件＝前の値がある人はいない（事前確認が確かめる）。
insert into public.cast_employment (org_id, store_id, cast_id, employment, valid_from)
select c.org_id, c.store_id, c.id, c.employment,
       least(coalesce(c.joined_on, (c.created_at at time zone 'Asia/Tokyo')::date), (c.created_at at time zone 'Asia/Tokyo')::date)
  from public.casts c
 where c.employment is not null;

-- ── 5. set_cast_employment：前の行を閉じて新しい行を足す（決まりは今と同じ＝月の 1 日だけ・最後に確定した期の翌日以降・owner だけ）
CREATE OR REPLACE FUNCTION public.set_cast_employment(p_cast_id uuid, p_employment text, p_valid_from date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_before      jsonb;
  v_after       jsonb;
  v_last_end    date;   -- ★9: 自店で最後に確定した期の末日
  v_cur         text;   -- ★0206: 履歴が無い人の今の値
  v_since       date;   -- ★0206: その始まり（入店日と作った日の早い方）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_employment is null or p_employment not in ('委託','雇用') then raise exception 'bad employment'; end if;   -- ★9（casts_employment_check と同じ 2 値）
  if p_valid_from is null or p_valid_from <> date_trunc('month', p_valid_from)::date then raise exception 'bad valid_from'; end if;   -- ★9: 給与期の初日のみ（要裁定(8)）
  -- cast の org 照合＋ロール判定（owner のみ＝294-9）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select max(coalesce(r.period_end, pb.period_end)) into v_last_end
    from public.payroll_runs r, lateral public.period_bounds(r.period) pb
   where r.store_id = v_cast_store and r.status in ('finalized','paid');
  if v_last_end is not null and p_valid_from <= v_last_end then raise exception 'period finalized'; end if;   -- ★9: 最後に確定した期の翌日以降・過去分は付け替えない

  select to_jsonb(c) into v_before from public.casts c where c.id = p_cast_id;
  -- ★0206: 履歴の行。最初の変更なら、今の値の行を先に作る（今の値がある人だけ・始まりは入店日と作った日の早い方・新しい行の前日まで）
  if not exists (select 1 from public.cast_employment where cast_id = p_cast_id) then
    select employment, least(coalesce(joined_on, (created_at at time zone 'Asia/Tokyo')::date), (created_at at time zone 'Asia/Tokyo')::date)
      into v_cur, v_since from public.casts where id = p_cast_id;
    if v_cur is not null and v_since < p_valid_from then
      insert into public.cast_employment (org_id, store_id, cast_id, employment, valid_from) values (v_cast_org, v_cast_store, p_cast_id, v_cur, v_since);
    end if;
  end if;
  -- ★0206: 新しい開始日以降に始まる行（まだ効いていない先の変更）は、この変更で置き換える＝確定した期より後だけ（上で確かめた）
  delete from public.cast_employment where cast_id = p_cast_id and valid_from >= p_valid_from;
  -- ★0206: 新しい開始日をまたぐ行を前日で閉じる
  update public.cast_employment set valid_to = p_valid_from - 1, updated_at = now()
   where cast_id = p_cast_id and valid_from < p_valid_from and (valid_to is null or valid_to >= p_valid_from);
  insert into public.cast_employment (org_id, store_id, cast_id, employment, valid_from) values (v_cast_org, v_cast_store, p_cast_id, p_employment, p_valid_from);

  update public.casts
     set employment = p_employment, employment_valid_from = p_valid_from, updated_at = now()
   where id = p_cast_id;
  select to_jsonb(c) || jsonb_build_object('cast_employment', (select jsonb_agg(jsonb_build_object('employment', e.employment, 'valid_from', e.valid_from, 'valid_to', e.valid_to) order by e.valid_from) from public.cast_employment e where e.cast_id = p_cast_id))
    into v_after from public.casts c where c.id = p_cast_id;
  perform public.audit_log_write('set_cast_employment', 'casts:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

-- ── 6. payroll_adjustment_add：区分（settlement＝委託だけ・sanction＝雇用だけ）を、その給与期の期首に有効な区分で判定（★0206 v2・本番の本体に 1 文を足しただけ・権限は CREATE OR REPLACE で保たれる）
CREATE OR REPLACE FUNCTION public.payroll_adjustment_add(p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text, p_source text DEFAULT 'manual'::text, p_basis text DEFAULT NULL::text, p_target_shift_id uuid DEFAULT NULL::uuid, p_kind text DEFAULT NULL::text, p_source_table text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_cast_st uuid;
  v_id      uuid;
  v_period  text;   -- ★6 0154: run の period（直近 3 期の境界）
  v_emp     text;   -- ★6 0154: casts.employment
  v_gross   bigint; -- ★6 0154: gross 合計（平均賃金の分子）→ 当期 gross
  v_days    int;    -- ★6 0154: 暦日数（平均賃金の分母）
  v_avg     int;    -- ★6 0154: 平均賃金（floor）
  v_sum     int;    -- ★6 0154: 当期の sanction 合計
  v_ps      date;   -- ★0206 v2: 給与期の初日（期首の区分）
  v_pe      date;   -- ★0206 v2: 給与期の末日
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;
  if p_mode is null or p_mode not in ('fixed','rate') then
    raise exception 'bad mode';
  end if;
  if p_mode = 'fixed' and (p_amount is null or p_amount < 0 or p_rate_bp is not null) then
    raise exception 'bad amount';
  end if;
  if p_mode = 'rate' and (p_rate_bp is null or p_rate_bp < 0 or p_rate_bp > 10000 or p_amount is not null) then
    raise exception 'bad amount';
  end if;
  if p_source is null or p_source not in ('manual','settlement','sanction') then                       -- ★6 0154（裁定294-6）: carryover は payroll_carryover_sync 専用
    raise exception 'bad source';                                                                       -- ★6
  end if;                                                                                               -- ★6
  if p_source in ('settlement','sanction') and (p_basis is null or length(trim(p_basis)) not between 1 and 200) then   -- ★6: basis 必須
    raise exception 'basis required';                                                                   -- ★6
  end if;                                                                                               -- ★6
  if p_target_shift_id is not null and not exists (select 1 from public.shifts s where s.id = p_target_shift_id and s.cast_id = p_cast_id) then   -- ★6
    raise exception 'shift not found';                                                                  -- ★6
  end if;                                                                                               -- ★6
  -- ★4 0175（裁定410・X13-I I-3）: 種別＝late／absent／norm_shortfall／other（null＝未分類）・元記録の参照＝source_table（shifts／attendance／punches）＋source_id（target_shift_id は shifts 固定のまま残す）
  if p_kind is not null and p_kind not in ('late','absent','norm_shortfall','other') then raise exception 'bad kind'; end if;
  if p_source_table is not null and p_source_table not in ('shifts','attendance','punches') then raise exception 'bad source_table'; end if;
  if (p_source_table is null) <> (p_source_id is null) then raise exception 'bad source_ref'; end if;

  select store_id, status, period into v_store, v_status, v_period                                     -- ★6 0154: period を併読
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  select store_id, employment into v_cast_st, v_emp                                                    -- ★6 0154: employment を併読
    from casts where id = p_cast_id and org_id = v_org;
  if not found then
    raise exception 'cast not found';
  end if;
  if v_cast_st is distinct from v_store then
    raise exception 'cast store mismatch';
  end if;
  -- ★0206 v2（起票146・相談役 11/24 2:20 の判断 5）: 区分＝その給与期の期首に有効な区分（cast_employment の行・無ければ期の中で最も早い行・
  --   履歴が無い人は casts.employment＝今と同じ）＝給与の下書き（collect）と同じ決まり（lib/nox/payroll/employment-at.ts）。
  select coalesce(r.period_start, pb.period_start), coalesce(r.period_end, pb.period_end) into v_ps, v_pe
    from public.payroll_runs r, lateral public.period_bounds(r.period) pb where r.id = p_run_id;
  v_emp := coalesce(
    (select e.employment from public.cast_employment e
      where e.cast_id = p_cast_id and e.valid_from <= v_ps and (e.valid_to is null or e.valid_to >= v_ps)
      order by e.valid_from desc limit 1),
    (select e.employment from public.cast_employment e
      where e.cast_id = p_cast_id and e.valid_from > v_ps and e.valid_from <= v_pe
      order by e.valid_from limit 1),
    v_emp);
  -- ★6 0154（裁定294-6）: settlement＝委託のみ・sanction＝雇用のみ＋労基法 91 条検査
  if p_source = 'settlement' and v_emp is distinct from '委託' then raise exception 'bad source for employment'; end if;   -- ★6
  if p_source = 'sanction' then                                                                         -- ★6
    if v_emp is distinct from '雇用' then raise exception 'bad source for employment'; end if;           -- ★6
    if p_mode <> 'fixed' then raise exception 'bad mode'; end if;                                       -- ★6: 1 件上限は額で比べる（要裁定(3)）
    -- ★6: 平均賃金＝直近 3 期（当期より前）の確定 payslip（finalized|paid）の gross 合計 ÷ 暦日数（calc_period_start／end・欠損は period_bounds）
    select coalesce(sum((ps.breakdown_json->'pay'->>'gross')::bigint), 0),                             -- ★6
           coalesce(sum(coalesce(ps.calc_period_end, pb.period_end) - coalesce(ps.calc_period_start, pb.period_start) + 1), 0)   -- ★6
      into v_gross, v_days                                                                              -- ★6
      from (select ps0.* from public.payslips ps0                                                       -- ★6
              join public.payroll_runs r0 on r0.id = ps0.run_id                                         -- ★6
             where ps0.cast_id = p_cast_id and r0.status in ('finalized','paid') and ps0.period < v_period   -- ★6
             order by ps0.period desc limit 3) ps,                                                      -- ★6
           lateral public.period_bounds(ps.period) pb;                                                  -- ★6
    if v_days = 0 then raise exception 'no basis for average wage'; end if;                             -- ★6（294-6）
    v_avg := floor(v_gross::numeric / v_days);                                                          -- ★6: 平均賃金（円未満切捨）
    if p_amount > v_avg / 2 then raise exception 'sanction cap'; end if;                                -- ★6: 1 件 ≦ floor(平均賃金/2)
    -- ★6: 当期 gross＝当 run の payslip（再確定前の凍結値）があればその pay.gross・無ければ平均賃金×当期暦日数（推計・要裁定(2)）
    select (ps.breakdown_json->'pay'->>'gross')::bigint into v_gross                                   -- ★6
      from public.payslips ps where ps.run_id = p_run_id and ps.cast_id = p_cast_id;                    -- ★6
    if v_gross is null then                                                                             -- ★6
      select v_avg::bigint * (coalesce(r.period_end, pb.period_end) - coalesce(r.period_start, pb.period_start) + 1) into v_gross   -- ★6
        from public.payroll_runs r, lateral public.period_bounds(r.period) pb where r.id = p_run_id;   -- ★6
    end if;                                                                                             -- ★6
    select coalesce(sum(a.amount), 0) into v_sum from public.payroll_adjustments a                      -- ★6
     where a.run_id = p_run_id and a.cast_id = p_cast_id and a.source = 'sanction';                     -- ★6
    if v_sum + p_amount > v_gross / 10 then raise exception 'sanction cap'; end if;                     -- ★6: 当期合計 ≦ floor(当期 gross/10)
  end if;                                                                                               -- ★6

  insert into payroll_adjustments(
    org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
    before_withholding, show_detail, reason, created_by,                                              -- ★6 0154: 末尾 ')' → ','
    source, basis, target_shift_id,                                                                   -- ★6 0154: 列 +3（0175 ★4: 末尾 ')' → ','）
    kind, source_table, source_id)                                                                    -- ★4 0175: 列 +3
  values (
    v_org, v_store, p_run_id, p_cast_id, p_mode,
    case when p_mode = 'fixed' then p_amount else null end,
    case when p_mode = 'rate'  then p_rate_bp else null end,
    coalesce(p_before_withholding, true),
    coalesce(p_show_detail, true),
    p_reason, v_actor,                                                                                 -- ★6 0154: 末尾 ')' → ','
    p_source, nullif(trim(p_basis), ''), p_target_shift_id,                                            -- ★6 0154（0175 ★4: 末尾 ')' → ','）
    p_kind, p_source_table, p_source_id)                                                               -- ★4 0175
  returning id into v_id;

  perform audit_log_write(
    'payroll_adjustment_add',
    'payroll_adjustments:' || v_id::text,
    null,
    jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id,
      'mode', p_mode, 'amount', p_amount, 'rate_bp', p_rate_bp,
      'before_withholding', coalesce(p_before_withholding, true),
      'show_detail', coalesce(p_show_detail, true),                                                   -- ★6 0154: 末尾 '),' → ','
      'source', p_source, 'basis', p_basis, 'target_shift_id', p_target_shift_id,                      -- ★6 0154（0175 ★4: 末尾 '),' → ','）
      'kind', p_kind, 'source_table', p_source_table, 'source_id', p_source_id),                        -- ★4 0175
    v_store,
    p_reason);

  return v_id;
end $function$;

commit;
