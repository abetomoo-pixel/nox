-- 0156_daily_pay_advance.sql
-- 裁定309（2026-09-28・§8 未裁定 10 件）のうち 0156 の器＝309-6（T9 日払い）／309-7（年越し過払債権＝貸付残高一覧）／309-8（300 追補1 run 別控除上書き）／309-9（302-5 退勤連動＝punches.okuri）
--   ＋起票 84／85 の同乗（kiosk_register_state ar_enabled／get_cast_mynumber_masked の廃棄 2 列）＝2026-09-28 起草（CC 写経・便 T-2）。番号 0156 は 0155・0157 の後に手貼り（番号順に依存しない）。
-- 写経元（★以外は 1 バイト不変＝改行コードを除く（299-11）・docs/tmp/gen_0156.mjs が docs/tmp/0156_live.json（pg_get_functiondef・2026-09-28T06:0x Z）から機械生成・md5 は $$ 内の先頭 8 桁・CR 除去）:
--   punch_self（live 83224474）→ 期待 f2c9b923（★4＝+p_okuri・v_okuri・insert +okuri・旧 3 引数署名は drop）
--   punch_proxy（live 5d057673）→ 期待 83f2a99f（★4 同型・旧 3 引数署名は drop）
--   kiosk_punch（live 13e534f4）→ 期待 b31ff8fa（★4 同型・旧 3 引数署名は drop・search_path public,extensions 不変）
--   kiosk_register_state（live fed8245b）→ 期待 e01d2b83（★6＝jsonb に 'ar_enabled' 1 キー・署名不変）
--   新設 9 本の期待 md5（$$ 内・CR 除去）: okuri_default_of 434e69d9／daily_pay_issue bac429f9／daily_pays_of_run da3d45a0／payroll_run_deduction_override_set bfc5fdb4／payroll_run_deduction_override_clear 86badf90／payroll_run_deduction_overrides_of a33a2b30／okuri_today_summary e61e5dd9／advances_open_balance 724d7551／cast_mynumber_discard_status e5a00d20
--   不触の md5 控え（live 2026-09-28）: get_cast_mynumber_masked 6f401f45（309 追補2 (f)＝署名・戻り text 不変）／transport_issue_bulk 9d10c990／adv_issue b8568921／adv_cancel 8ff4572b／payroll_carryover_sync 59d06f2a／
--     payroll_finalize f1c27f08／payroll_mark_paid 409c9770／payment_record_add d9d7d442／payroll_adjustment_add 0feabfac／period_bounds 96e10e9a／biz_date_of 196c453f／punch_correction_request 302a9d19／punch_correction_apply 47853cfe
--   ★1  daily_pays（org・store・cast・biz_date・gross・withholding・withholding_category・net・paid_by・idem_key unique・created_at）＝RLS advances 同型（cast は本人行のみ）・grant SELECT のみ
--       ＋ daily_pay_issue(p_cast_id, p_biz_date, p_gross, p_idem_key) returns jsonb（owner∨manager 自店・billing ゲートあり＝A4・源泉＝月次 run と同式を日数 1 で写経＝floor(max(0, gross − 5,000) × 0.1021)（309 追補2 (c)）・
--         雇用は 0＋warn 'T10 pending'・paid period ガード・冪等＝同キー再送は既存行・audit）
--       ＋ daily_pays_of_run(p_run_id) returns table(cast_id, paid_total, withholding_total, n)（run 期間内の cast 別合計・owner∨manager・STABLE）
--   ★2  月次 run が読む器＝★1 の daily_pays_of_run と同一関数（collect.ts はこの戻りを「日払い済み」＝支給後控除行（支払済額）と源泉の既徴収額に写す＝手貼り後の client 便・payroll_* の署名不変・専用 run なし・payment_records 不触）
--   ★3  payroll_run_deduction_overrides（run_id×cast_id×deduction_id unique・enabled・amount_override・set_by・set_at）＝RLS deductions 同型＋cast 不可視・grant SELECT のみ
--       ＋ payroll_run_deduction_override_set／_clear（draft の run のみ・owner∨manager 自店・非ゲート＝B(e) payroll_adjustment 同型・audit）＋ payroll_run_deduction_overrides_of（読取・STABLE）。finalize は不触（凍結は breakdown_json）
--   ★4  punches.okuri boolean（null 可）＋ okuri_default_of（内部ヘルパー・4 ロール revoke）＝p_okuri 明示があればそれ・無ければ out かつ okuri_mode='actual' の店で false・それ以外 null
--       ＋ punch_self／punch_proxy／kiosk_punch の out に p_okuri（default null＝既存呼出互換・旧署名 drop＝教訓48）
--       ＋ okuri_today_summary(p_store_id, p_biz_date)＝okuri=true の out 打刻のうち未発行（transport.idem_key＝md5(punch_id‖':'‖cast_id)::uuid が無い）の行・base_amount＝settings okuri_base_amount。transport_issue_bulk は不触（p_idem_key に punch_id を渡す運用＝各件 idem が punch 単位で決まる）
--   ★5  advances_open_balance(p_store_id)（cast 別 open 合計＝amount−deducted_amount・件数・最古 advanced_on・owner∨manager・STABLE）。表・adv_cancel・payroll_carryover_sync は不触
--   ★6  同乗＝kiosk_register_state 'ar_enabled'（起票84）
--   ★6b 同乗＝cast_mynumber_discard_status(p_cast_id) returns table(mynumber_deleted_at, mynumber_deletion_method, has_mynumber)（起票85・309 追補2 (f)＝owner／manager 自店／cast 本人・audit なし＝値を返さない・B(f)・STABLE）。
--       get_cast_mynumber_masked は不触（署名・戻り text・md5 6f401f45 不変）
--   ★7  revoke／grant（既存と同型・内部専用は 4 ロール revoke）
--
-- 起草判断＝裁定309 追補2 で確定（2026-09-28・Agoora・(a)(b)(d)(e)(g)(h) 起草どおり・(c)(f) 改稿・(e) 補足）:
--   (a) punches.okuri の既定（309-9「settings_json.okuri_mode から導く」）: 0156_pre (d) に okuri_mode の意味の記述が無く、0019／0157 の実装から確定＝'flat'（既定・定額＝給与側で処理）／'actual'（実費入力＝transport_issue／bulk が受理）。
--       既定＝p_okuri 明示がなければ、out 打刻かつ okuri_mode='actual' の店では false（申告が無ければ送りなし）・'flat'／未設定の店と in 打刻では null（打刻では扱わない）。列は null 可。
--   (b) ★1 の読取 daily_pays_of_run が ★2 の collect 用 RPC を兼ねる（同一関数・cast 別 paid_total／withholding_total／n）。run の期間＝coalesce(period_start／period_end, period_bounds(period))。
--   (c) 日払いの源泉＝月次 run と同式（lib/nox/pay.ts withholdingOf＝委託のみ floor(max(0, gross − 5,000 × periodDays) × 0.1021)・雇用 0・DB 関数は無く TS）を日数 1 で写経＝
--       floor(greatest(0, gross − 5000)::double precision × 0.1021)（double precision＝TS の Number と同じ IEEE754・Math.floor と同値）。源泉区分＝cast_tax_profiles.mode（行が無ければ '委託'）・
--       withholding_category はその文字列。paid period ガード（adv_issue 同型）・biz_date 未来日は拒否しない。
--   (d) 控除上書きの set／clear は 'run not draft' で draft 以外を拒否・理由は不要（audit に before／after）。deduction は run の店の行のみ（'bad deduction'）・cast も run の店（'bad cast'）。
--   (e) okuri_today_summary は「未発行のみ」の行（punch 単位）を返し、件数・合計（n×base_amount）は client 側で出す。base_amount は okuri_base_amount 未設定なら null＝client が行ごとに金額入力（追補2 補足）。
--       transport への結線は既存 transport_issue_bulk（okuri_mode='actual' の店のみ受理＝'flat' の店は表示のみ）。
--   (f) get_cast_mynumber_masked は不触。廃棄記録は新設 cast_mynumber_discard_status（owner／manager 自店／cast 本人・audit なし・値を返さない）で読む＝rls F2d の張り替え不要。
--   (g) 旧署名 3 本の drop＝DB 内に punch_self／punch_proxy／kiosk_punch を呼ぶ関数なし（突合 s1 で prosrc 全走査）。anon-guard の probe は名前指定＝互換。
--   (h) daily_pays／overrides の RLS＝金額系（daily_pays は advances 同型＝cast 本人行のみ・overrides は deductions 同型＋role<>'cast'＝給与内部）。
--
-- 名簿・suite への影響（手貼り後の client 便で張り替え・本 mig は DB のみ）:
--   全数 274→283（+9＝okuri_default_of→B(a)・daily_pay_issue→A4（ゲート内蔵）・daily_pays_of_run／payroll_run_deduction_overrides_of／okuri_today_summary／advances_open_balance／cast_mynumber_discard_status→B(f)・
--   payroll_run_deduction_override_set／_clear→B(e)）・billing 対象 144→145・anon-guard probe +8（内部 1 本は grants G29 型）・grants G4d +7／G4c 内部 +1／G9 列集合 punches 14・新表 2・
--   rls F2d は不変（masked 不触）・punch 系 probe の署名 4 引数・store-systems 不変・payroll suite は collect 結線後（client 便）に。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   select proname, pg_get_function_identity_arguments(oid), pg_get_function_result(oid), prosecdef, proacl, md5(replace(prosrc, E'\r', '')) from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('punch_self','punch_proxy','kiosk_punch','kiosk_register_state','cast_mynumber_discard_status','okuri_default_of','daily_pay_issue',
--       'daily_pays_of_run','payroll_run_deduction_override_set','payroll_run_deduction_override_clear','payroll_run_deduction_overrides_of','okuri_today_summary','advances_open_balance') order by 1;  -- 13 行（旧署名は消えている）
--   select proname, md5(replace(prosrc, E'\r', '')) from pg_proc where pronamespace='public'::regnamespace and proname='get_cast_mynumber_masked';                                 -- 6f401f45（不触）
--   select table_name, count(*) from information_schema.columns where table_schema='public' and table_name in ('daily_pays','payroll_run_deduction_overrides','punches') group by 1 order by 1;   -- daily_pays 12／overrides 10／punches 14
--   select tablename, policyname from pg_policies where tablename in ('daily_pays','payroll_run_deduction_overrides') order by 1;                                                      -- 2 行（select）
--   -- 動作＝突合 docs/tmp/q0928_ag_0156.mjs（BEGIN…ROLLBACK・便 T-3）・suite の張り替えは手貼り後

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 daily_pays（日払い・裁定309-6）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.daily_pays (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id),
  store_id             uuid not null references public.stores(id),
  cast_id              uuid not null references public.casts(id),
  biz_date             date not null,
  gross                integer not null check (gross > 0),
  withholding          integer not null default 0 check (withholding >= 0),
  withholding_category text not null,                       -- cast_tax_profiles.mode の写し（'委託'／'雇用'）
  net                  integer not null check (net >= 0),
  paid_by              uuid not null references public.users(id),
  idem_key             uuid not null unique,
  created_at           timestamptz not null default now(),
  constraint daily_pays_net_ck check (net = gross - withholding)
);
create index if not exists daily_pays_store_date_idx on public.daily_pays (store_id, biz_date);
create index if not exists daily_pays_cast_date_idx  on public.daily_pays (cast_id, biz_date);

alter table public.daily_pays enable row level security;
drop policy if exists daily_pays_select on public.daily_pays;
create policy daily_pays_select on public.daily_pays
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );
revoke all on table public.daily_pays from public, anon, authenticated;
grant select on table public.daily_pays to authenticated;

-- daily_pay_issue（owner∨manager 自店・billing ゲート＝A4・委託 10.21% 切捨て・雇用 0＋warn・paid period・冪等・audit）
create or replace function public.daily_pay_issue(p_cast_id uuid, p_biz_date date, p_gross integer, p_idem_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cast    record;
  v_actor   uuid;
  v_mode    text;
  v_wh      integer;
  v_warn    text;
  v_row     public.daily_pays;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_gross is null or p_gross <= 0 then raise exception 'bad amount'; end if;
  select id, org_id, store_id, is_active into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  -- 冪等（org／ロール照合の後）: 同キー再送は既存行を返す（別 cast のキー再利用は拒否）
  select * into v_row from public.daily_pays where idem_key = p_idem_key;
  if v_row.id is not null then
    if v_row.cast_id <> p_cast_id then raise exception 'bad idem key'; end if;
    return jsonb_build_object('id', v_row.id, 'cast_id', v_row.cast_id, 'biz_date', v_row.biz_date, 'gross', v_row.gross,
      'withholding', v_row.withholding, 'withholding_category', v_row.withholding_category, 'net', v_row.net, 'warn', null, 'replay', true);
  end if;
  -- paid 期間ガード（adv_issue 同型＝凍結済み期に stranded な日払いを作らない）
  if exists (select 1 from public.payroll_runs
             where store_id = v_cast.store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  -- 源泉区分＝cast_tax_profiles.mode（無ければ '委託'）。委託＝月次 run と同式（lib/nox/pay.ts withholdingOf）を日数 1 で写経＝
  --   floor(max(0, gross − 5,000 × 1) × 0.1021)・double precision（TS の Number と同じ IEEE754）・1 円未満切捨て（309 追補2 (c)）。雇用＝0（T10 回答まで）＋warn
  select coalesce(t.mode, '委託') into v_mode from (select 1) x left join public.cast_tax_profiles t on t.cast_id = p_cast_id;
  if v_mode = '雇用' then
    v_wh := 0; v_warn := 'T10 pending';
  else
    v_wh := floor(greatest(0, p_gross - 5000)::double precision * 0.1021)::int; v_warn := null;
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_pays (org_id, store_id, cast_id, biz_date, gross, withholding, withholding_category, net, paid_by, idem_key)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_biz_date, p_gross, v_wh, v_mode, p_gross - v_wh, v_actor, p_idem_key)
  returning * into v_row;
  perform public.audit_log_write('daily_pay_issue', 'daily_pays:' || v_row.id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross, 'withholding', v_wh,
                       'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn), v_cast.store_id);
  return jsonb_build_object('id', v_row.id, 'cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross,
    'withholding', v_wh, 'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn, 'replay', false);
end $$;

-- ★1／★2 daily_pays_of_run（run 期間内の cast 別合計＝collect が「日払い済み」控除行と源泉既徴収額に写す・owner∨manager・STABLE）
create or replace function public.daily_pays_of_run(p_run_id uuid)
returns table(cast_id uuid, paid_total integer, withholding_total integer, n integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_run   record;
  v_from  date;
  v_to    date;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select r.id, r.org_id, r.store_id, r.period, r.period_start, r.period_end into v_run from public.payroll_runs r where r.id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select coalesce(v_run.period_start, pb.period_start), coalesce(v_run.period_end, pb.period_end) into v_from, v_to
    from public.period_bounds(v_run.period) pb;
  return query
    select d.cast_id, sum(d.gross)::int, sum(d.withholding)::int, count(*)::int
      from public.daily_pays d
     where d.store_id = v_run.store_id and d.biz_date between v_from and v_to
     group by d.cast_id
     order by d.cast_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★3 payroll_run_deduction_overrides（run 別・cast 別の固定控除の上書き・裁定309-8＝300 追補1）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.payroll_run_deduction_overrides (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  run_id          uuid not null references public.payroll_runs(id) on delete cascade,
  cast_id         uuid not null references public.casts(id),
  deduction_id    uuid not null references public.deductions(id),
  enabled         boolean not null default true,
  amount_override integer check (amount_override is null or amount_override >= 0),
  set_by          uuid references public.users(id),
  set_at          timestamptz not null default now(),
  constraint payroll_run_deduction_overrides_uniq unique (run_id, cast_id, deduction_id)
);
create index if not exists payroll_run_deduction_overrides_run_idx on public.payroll_run_deduction_overrides (run_id, cast_id);

alter table public.payroll_run_deduction_overrides enable row level security;
drop policy if exists payroll_run_deduction_overrides_select on public.payroll_run_deduction_overrides;
create policy payroll_run_deduction_overrides_select on public.payroll_run_deduction_overrides
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );
revoke all on table public.payroll_run_deduction_overrides from public, anon, authenticated;
grant select on table public.payroll_run_deduction_overrides to authenticated;

create or replace function public.payroll_run_deduction_override_set(p_run_id uuid, p_cast_id uuid, p_deduction_id uuid, p_enabled boolean, p_amount_override integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run   record;
  v_actor uuid;
  v_id    uuid;
  v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  if p_amount_override is not null and p_amount_override < 0 then raise exception 'bad amount'; end if;
  select r.id, r.org_id, r.store_id, r.status into v_run from public.payroll_runs r where r.id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_run.status <> 'draft' then raise exception 'run not draft'; end if;
  if not exists (select 1 from public.casts c where c.id = p_cast_id and c.store_id = v_run.store_id) then raise exception 'bad cast'; end if;
  if not exists (select 1 from public.deductions d where d.id = p_deduction_id and d.store_id = v_run.store_id) then raise exception 'bad deduction'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  select to_jsonb(o) into v_before from public.payroll_run_deduction_overrides o
    where o.run_id = p_run_id and o.cast_id = p_cast_id and o.deduction_id = p_deduction_id;
  insert into public.payroll_run_deduction_overrides (org_id, store_id, run_id, cast_id, deduction_id, enabled, amount_override, set_by, set_at)
  values (v_run.org_id, v_run.store_id, p_run_id, p_cast_id, p_deduction_id, p_enabled, p_amount_override, v_actor, now())
  on conflict (run_id, cast_id, deduction_id) do update
    set enabled = excluded.enabled, amount_override = excluded.amount_override, set_by = excluded.set_by, set_at = now()
  returning id into v_id;
  perform public.audit_log_write('payroll_run_deduction_override_set', 'payroll_run_deduction_overrides:' || v_id::text,
    v_before, jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id, 'deduction_id', p_deduction_id, 'enabled', p_enabled, 'amount_override', p_amount_override),
    v_run.store_id);
  return v_id;
end $$;

create or replace function public.payroll_run_deduction_override_clear(p_run_id uuid, p_cast_id uuid, p_deduction_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_run    record;
  v_before jsonb;
  v_n      integer;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select r.id, r.org_id, r.store_id, r.status into v_run from public.payroll_runs r where r.id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_run.status <> 'draft' then raise exception 'run not draft'; end if;
  select to_jsonb(o) into v_before from public.payroll_run_deduction_overrides o
    where o.run_id = p_run_id and o.cast_id = p_cast_id and o.deduction_id = p_deduction_id;
  delete from public.payroll_run_deduction_overrides
   where run_id = p_run_id and cast_id = p_cast_id and deduction_id = p_deduction_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.audit_log_write('payroll_run_deduction_override_clear', 'payroll_run_deduction_overrides:' || coalesce(v_before->>'id', ''),
      v_before, null, v_run.store_id);
  end if;
  return v_n;
end $$;

create or replace function public.payroll_run_deduction_overrides_of(p_run_id uuid)
returns table(cast_id uuid, deduction_id uuid, enabled boolean, amount_override integer, set_by uuid, set_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_run record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select r.id, r.org_id, r.store_id into v_run from public.payroll_runs r where r.id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select o.cast_id, o.deduction_id, o.enabled, o.amount_override, o.set_by, o.set_at
      from public.payroll_run_deduction_overrides o
     where o.run_id = p_run_id
     order by o.cast_id, o.deduction_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★4 punches.okuri（退勤連動の送り・裁定309-9＝302-5）
-- ══════════════════════════════════════════════════════════════
alter table public.punches add column if not exists okuri boolean;   -- null＝未指定／対象外（in 打刻・'flat' の店）

-- okuri_default_of（内部ヘルパー・純関数＝呼び出し元の公開 RPC が二重防御済み＝原則8）
--   p_okuri 明示があればそれ。無ければ out 打刻かつ okuri_mode='actual' の店で false・それ以外は null（起草判断 (a)）
create or replace function public.okuri_default_of(p_store_id uuid, p_type text, p_okuri boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
           when p_okuri is not null then p_okuri
           when p_type = 'out' and coalesce(nullif(trim((select st.settings_json->>'okuri_mode' from public.stores st where st.id = p_store_id)), ''), 'flat') = 'actual' then false
           else null
         end;
$$;

-- punch_self／punch_proxy／kiosk_punch: 旧署名を drop（教訓48＝DB 内の呼び出し元は突合 s1 で 0 を確認）→ 4 引数版（p_okuri default null＝既存呼出互換）
drop function if exists public.punch_self(text, double precision, double precision);
CREATE OR REPLACE FUNCTION public.punch_self(p_type text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_row record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）: out 打刻の送り利用（既定＝okuri_default_of）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  v_okuri := public.okuri_default_of(v_row.store_id, p_type, p_okuri);  -- ★4 0156
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- 盲目記録（0008 決定1）: シーケンス検証なし・in-in/孤立 out も事実として残す
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri)  -- ★4 0156: +okuri
  values (v_row.org_id, v_row.store_id, v_cast, p_type, p_lat, p_lng, v_ip, 'self', v_okuri)
  returning id into v_id;
  perform public.audit_log_write('punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_row.store_id);
  return v_id;
end $function$;

drop function if exists public.punch_proxy(uuid, text, text);
CREATE OR REPLACE FUNCTION public.punch_proxy(p_cast_id uuid, p_type text, p_note text DEFAULT NULL::text, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  insert into public.punches (org_id, store_id, cast_id, type, ip, source, note, okuri)  -- ★4 0156: +okuri
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, v_ip, 'manager', p_note, v_okuri)
  returning id into v_id;
  perform public.audit_log_write('punch_proxy', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_cast.store_id);
  return v_id;
end $function$;

drop function if exists public.kiosk_punch(uuid, text, text);
CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
  v_okuri    boolean;  -- ★4 0156（裁定309-9）
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象 cast は自店 active のみ（他店/他 org は not_found＝存在オラクル封じ）
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.cast_pin p
    where p.cast_id = p_cast_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= 5 then
      update public.cast_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where cast_id = p_cast_id;
    else
      update public.cast_pin
         set fail_count = v_newfail, updated_at = now()
       where cast_id = p_cast_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
       'cast_pin:' || p_cast_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 盲目記録 INSERT（punch_self 逐語型・source='kiosk'）
  update public.cast_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where cast_id = p_cast_id;

  -- 0109: 打刻端末の最終アクセス（成功経路のみ・引き継ぎv18 §3 のとおり）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri)  -- ★4 0156: +okuri
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk', v_okuri)
  returning id into v_punch_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now());
end $function$;

-- okuri_today_summary（owner∨manager 自店・STABLE）: okuri=true の out 打刻のうち未発行のみ（transport.idem_key＝md5(punch_id‖':'‖cast_id)::uuid の有無で判定＝transport_issue_bulk(p_idem_key＝punch_id) の各件 idem と同式）
create or replace function public.okuri_today_summary(p_store_id uuid, p_biz_date date)
returns table(punch_id uuid, cast_id uuid, cast_name text, punched_at timestamptz, idem_key uuid, base_amount integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_store record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.cast_id, c.name, p.punched_at,
           md5(p.id::text || ':' || p.cast_id::text)::uuid,
           nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::int
      from public.punches p
      join public.casts c on c.id = p.cast_id
     where p.store_id = p_store_id and p.type = 'out' and p.okuri = true
       and public.biz_date_of(p_store_id, p.punched_at) = p_biz_date
       and not exists (select 1 from public.transport t
                        where t.store_id = p_store_id and t.idem_key = md5(p.id::text || ':' || p.cast_id::text)::uuid)
     order by p.punched_at;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★5 advances_open_balance（年末の貸付残高一覧・裁定309-7・owner∨manager・STABLE）
-- ══════════════════════════════════════════════════════════════
create or replace function public.advances_open_balance(p_store_id uuid)
returns table(cast_id uuid, cast_name text, open_total integer, n integer, oldest_on date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select a.cast_id, c.name, sum(a.amount - a.deducted_amount)::int, count(*)::int, min(a.advanced_on)
      from public.advances a
      join public.casts c on c.id = a.cast_id
     where a.store_id = p_store_id and a.status = 'open'
     group by a.cast_id, c.name
     order by c.name;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★6 同乗: kiosk_register_state（'ar_enabled'・起票84）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.kiosk_register_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'ar_enabled', coalesce((select (st.settings_json->>'ar_enabled')::boolean from public.stores st where st.id = v_store), false),  -- ★6 0156（起票84）: 売掛の店設定（0155 ar_policy_ok と同じ読み）
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                       order by s.sort_order)
        from public.seats s
       where s.store_id = v_store and s.is_active), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'sort_order', pc.sort_order)
                       order by pc.sort_order, pc.name)
        from public.product_categories pc
       where pc.store_id = v_store and pc.is_active), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price, 'category_id', p.category_id, 'sort_order', p.sort_order)
                       order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name)
        from public.products p
        left join public.product_categories pc on pc.id = p.category_id
       where p.store_id = v_store and p.is_active), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.casts c
       where c.store_id = v_store and c.is_active), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ck.id,
               'seat_id', ck.seat_id,
               'extra_seat_ids', coalesce((
                 select jsonb_agg(cs.seat_id order by cs.created_at)
                   from public.check_seats cs where cs.check_id = ck.id), '[]'::jsonb),
               'total', ck.total,
               'started_at', ck.started_at,
               'set_min', ck.set_min,
               'ext_min', ck.ext_min,
               'time_per', ck.time_per,
               'people', ck.people) order by ck.started_at)
        from public.checks ck
       where ck.store_id = v_store and ck.status = 'open'), '[]'::jsonb)
  );
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★6b 同乗: cast_mynumber_discard_status（起票85・309 追補2 (f)）＝廃棄記録の読取のみ（平文・暗号文・末尾 4 桁は返さない＝audit なし）
--     owner／manager 自店／cast 本人。get_cast_mynumber_masked は不触。
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_mynumber_discard_status(p_cast_id uuid)
returns table(mynumber_deleted_at timestamptz, mynumber_deletion_method text, has_mynumber boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cast record;
  v_role text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select c.id, c.org_id, c.store_id into v_cast from public.casts c where c.id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  v_role := public.auth_role();
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())
          or (v_role = 'cast' and public.auth_cast_id() = p_cast_id)) then
    raise exception 'forbidden';
  end if;
  return query
    select cs.mynumber_deleted_at, cs.mynumber_deletion_method, (cs.mynumber_enc is not null)
      from public.cast_sensitive cs
     where cs.cast_id = p_cast_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★7 revoke／grant（既存の proacl を再掲・新設は同型・内部専用は 4 ロール revoke）
-- ══════════════════════════════════════════════════════════════
revoke all on function public.okuri_default_of(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.daily_pay_issue(uuid, date, integer, uuid) from public, anon;
grant execute on function public.daily_pay_issue(uuid, date, integer, uuid) to authenticated, service_role;
revoke all on function public.daily_pays_of_run(uuid) from public, anon;
grant execute on function public.daily_pays_of_run(uuid) to authenticated, service_role;
revoke all on function public.payroll_run_deduction_override_set(uuid, uuid, uuid, boolean, integer) from public, anon;
grant execute on function public.payroll_run_deduction_override_set(uuid, uuid, uuid, boolean, integer) to authenticated, service_role;
revoke all on function public.payroll_run_deduction_override_clear(uuid, uuid, uuid) from public, anon;
grant execute on function public.payroll_run_deduction_override_clear(uuid, uuid, uuid) to authenticated, service_role;
revoke all on function public.payroll_run_deduction_overrides_of(uuid) from public, anon;
grant execute on function public.payroll_run_deduction_overrides_of(uuid) to authenticated, service_role;
revoke all on function public.punch_self(text, double precision, double precision, boolean) from public, anon;
grant execute on function public.punch_self(text, double precision, double precision, boolean) to authenticated, service_role;
revoke all on function public.punch_proxy(uuid, text, text, boolean) from public, anon;
grant execute on function public.punch_proxy(uuid, text, text, boolean) to authenticated, service_role;
revoke all on function public.kiosk_punch(uuid, text, text, boolean) from public, anon;
grant execute on function public.kiosk_punch(uuid, text, text, boolean) to authenticated, service_role;
revoke all on function public.okuri_today_summary(uuid, date) from public, anon;
grant execute on function public.okuri_today_summary(uuid, date) to authenticated, service_role;
revoke all on function public.advances_open_balance(uuid) from public, anon;
grant execute on function public.advances_open_balance(uuid) to authenticated, service_role;
revoke all on function public.kiosk_register_state() from public, anon;
grant execute on function public.kiosk_register_state() to authenticated, service_role;
revoke all on function public.cast_mynumber_discard_status(uuid) from public, anon;
grant execute on function public.cast_mynumber_discard_status(uuid) to authenticated, service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, pg_get_function_identity_arguments(oid), pg_get_function_result(oid), prosecdef, proacl, md5(replace(prosrc, E'\r', '')) from pg_proc
  where pronamespace='public'::regnamespace and proname in ('punch_self','punch_proxy','kiosk_punch','kiosk_register_state','cast_mynumber_discard_status','okuri_default_of','daily_pay_issue',
    'daily_pays_of_run','payroll_run_deduction_override_set','payroll_run_deduction_override_clear','payroll_run_deduction_overrides_of','okuri_today_summary','advances_open_balance') order by 1;
select proname, md5(replace(prosrc, E'\r', '')) from pg_proc where pronamespace='public'::regnamespace and proname='get_cast_mynumber_masked';
select table_name, count(*) from information_schema.columns where table_schema='public' and table_name in ('daily_pays','payroll_run_deduction_overrides','punches') group by 1 order by 1;
select tablename, policyname from pg_policies where tablename in ('daily_pays','payroll_run_deduction_overrides') order by 1;
select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('punch_self','punch_proxy','kiosk_punch');
