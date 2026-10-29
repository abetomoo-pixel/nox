-- 0188_withholding_rates_kinds.sql — 裁定433（源泉の税率表）＋裁定434（源泉区分 4 つ・other_fee 廃止）＋日払いの settlement は daily の店だけ（DB でも）＋外交員報酬の直書き撤去（2026-10-29 起草・Agoora 確定 10/27（2）・税理士 T11／T17 の最終確認待ち＝違いが出たらその点だけ改める）
-- 翻訳元: live pg_get_functiondef（2026-10-29・0186 適用後）＋生成器 docs/tmp/gen_0188.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換）。
--   ★1 裁定433: 税率表 withholding_rates（運営側・kind×valid_from・率 bp・控除（日／月）・閾値と超過率・内訳 jsonb）＋読み口 withholding_rate_of（支払日の行）＋withholding_calc（整数計算＝裁定431 ②）。初期行＝2013-01-01／2027-01-01 の 2 世代×3 区分。
--   ★2 裁定434: 区分 none／hostess／other_204／manual（other_fee 廃止＝CHECK と set_withholding_kind・既存値は本番で全員 null＝影響 0）。委託スタッフの既定 none は client（TS の既定）。
--   ★3 daily_pay_issue: kind 'settlement' は settlement_cycle＝'daily' の店だけ（'settlement not allowed'）・区分（withholding_kind）を読む・税額は withholding_calc（hostess は従来と同値）・戻りと audit に withholding_kind。
--   ★4 referral_payout_pay: 外交員報酬（salesperson）の 120,000／1021 の直書きを税率表から（従来と同値）。
--   残る直書き＝lib/nox/pay.ts・money.ts（withholding1021Of）＝MIG_0188_APPLIED の client 便で税率表を読む形に（golden 不変を確かめる）。デモ LILY の日払い 4 件（settlement・monthly の店）は gen-demo の payload で advance に（client 便）。
-- 営業中に貼ってよいか: 営業中でも可（表の新設と CHECK の差し替え＝cast_tax_profiles／staff_contracts は小さい・daily_pay_issue と referral_payout_pay の CREATE OR REPLACE は一瞬）。ただし日払いの発行中は避ける。
-- 検証（Success の後）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ① 税率表 ═══
create table if not exists public.withholding_rates (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('hostess','other_204','salesperson')),   -- 裁定434 の区分（none／manual は行を持たない）＋外交員（紹介者・referrers.withholding_category 'salesperson'）
  valid_from    date not null,                                                           -- 適用開始日＝支払日で行を選ぶ（裁定433 ①）
  rate_bp       integer not null check (rate_bp between 0 and 10000),                    -- 率（bp・1021＝10.21%）
  deduction     integer check (deduction is null or deduction >= 0),                     -- hostess＝5,000（1 日あたり）・salesperson＝120,000（1 月あたり）・other_204＝null
  deduction_unit text check (deduction_unit is null or deduction_unit in ('day','month')),
  threshold     integer check (threshold is null or threshold >= 0),                     -- other_204＝1,000,000（1 回の支払金額のうちここまで rate_bp・超える部分 over_rate_bp）
  over_rate_bp  integer check (over_rate_bp is null or over_rate_bp between 0 and 10000),
  breakdown     jsonb not null default '{}'::jsonb,                                      -- 表示用の内訳（所得税／復興特別所得税／防衛特別所得税の bp・裁定433 ②）
  note          text,
  created_at    timestamptz not null default now(),
  unique (kind, valid_from)
);
create index if not exists withholding_rates_kind_from_idx on public.withholding_rates (kind, valid_from desc);
alter table public.withholding_rates enable row level security;
drop policy if exists withholding_rates_select on public.withholding_rates;
create policy withholding_rates_select on public.withholding_rates for select to authenticated using (true);   -- 運営側の表＝店は読取のみ（書込ポリシーなし・行の追加は mig＝裁定433 ③）
revoke all on table public.withholding_rates from public, anon, authenticated;
grant select on table public.withholding_rates to authenticated;
insert into public.withholding_rates (kind, valid_from, rate_bp, deduction, deduction_unit, threshold, over_rate_bp, breakdown, note) values
  ('hostess',     '2013-01-01', 1021, 5000,   'day',   null,    null, '{"income_tax_bp":1000,"reconstruction_bp":21}'::jsonb,                 '所得税 10%＋復興特別所得税 0.21%・5,000 円×計算期間の日数を控除（所得税法 204 条 1 項 6 号）'),
  ('hostess',     '2027-01-01', 1021, 5000,   'day',   null,    null, '{"income_tax_bp":1000,"reconstruction_bp":11,"defense_bp":10}'::jsonb, '2027-01-01 から内訳変更（合計 10.21% は不変の見込み・税理士 T19 待ち）'),
  ('other_204',   '2013-01-01', 1021, null,   null,    1000000, 2042, '{"income_tax_bp":1000,"reconstruction_bp":21}'::jsonb,                 '1 回の支払金額のうち 100 万円以下 10.21%・超える部分 20.42%'),
  ('other_204',   '2027-01-01', 1021, null,   null,    1000000, 2042, '{"income_tax_bp":1000,"reconstruction_bp":11,"defense_bp":10}'::jsonb, '2027-01-01 から内訳変更'),
  ('salesperson', '2013-01-01', 1021, 120000, 'month', null,    null, '{"income_tax_bp":1000,"reconstruction_bp":21}'::jsonb,                 '外交員報酬＝同月の支払累計から 12 万円を控除して 10.21%（紹介者・0152 裁定298-7）'),
  ('salesperson', '2027-01-01', 1021, 120000, 'month', null,    null, '{"income_tax_bp":1000,"reconstruction_bp":11,"defense_bp":10}'::jsonb, '2027-01-01 から内訳変更')
on conflict (kind, valid_from) do nothing;

-- ═══ ② 読み口（内部専用＝4 ロール revoke） ═══
CREATE OR REPLACE FUNCTION public.withholding_rate_of(p_kind text, p_pay_date date)
 RETURNS public.withholding_rates
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
-- ★0188（裁定433 ①）: 支払日に有効な税率表の行（valid_from ≤ 支払日 の最新）。無ければ null
  select r.* from public.withholding_rates r
   where r.kind = p_kind and r.valid_from <= coalesce(p_pay_date, current_date)
   order by r.valid_from desc limit 1
$function$;
CREATE OR REPLACE FUNCTION public.withholding_calc(p_kind text, p_taxable integer, p_days integer, p_pay_date date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
-- ★0188（裁定433／434・裁定431 ②）: 源泉の税額＝整数計算・1 円未満切捨て。
--   hostess＝floor((課税額 − 5,000×日数) × 1021 ÷ 10000)（従来の withholding1021Of と同値＝golden 不変）
--   other_204＝floor((min(課税額, 100 万) × 1021 ＋ 超える部分 × 2042) ÷ 10000)（1 回の支払金額）
--   salesperson＝floor((課税額 − 12 万×月数) × 1021 ÷ 10000)（紹介者の外交員報酬）
--   manual／none＝0（給与＝NOX は税額を計算しない／対象外）。率は withholding_rates の支払日の行（直書きなし）
declare
  v_r public.withholding_rates; v_base bigint; v_under bigint; v_over bigint;
begin
  if p_kind is null or p_kind in ('manual','none') then return 0; end if;
  if p_kind not in ('hostess','other_204','salesperson') then raise exception 'bad kind'; end if;
  v_r := public.withholding_rate_of(p_kind, p_pay_date);
  if v_r.id is null then raise exception 'no withholding rate'; end if;
  v_base := greatest(0, coalesce(p_taxable, 0)::bigint - case when v_r.deduction is null then 0 else v_r.deduction::bigint * greatest(0, coalesce(p_days, 0)) end);
  v_under := case when v_r.threshold is null then v_base else least(v_base, v_r.threshold::bigint) end;
  v_over := v_base - v_under;
  return ((v_under * v_r.rate_bp + v_over * coalesce(v_r.over_rate_bp, v_r.rate_bp)) / 10000)::int;
end $function$;
revoke execute on function public.withholding_rate_of(text, date) from public, anon, authenticated, service_role;
revoke execute on function public.withholding_calc(text, integer, integer, date) from public, anon, authenticated, service_role;

-- ═══ ③ 区分の CHECK（4 区分） ═══
update public.cast_tax_profiles set withholding_kind = 'other_204' where withholding_kind = 'other_fee';
update public.staff_contracts set withholding_kind = 'other_204' where withholding_kind = 'other_fee';
alter table public.cast_tax_profiles drop constraint if exists cast_tax_profiles_withholding_kind_check;
alter table public.cast_tax_profiles add constraint cast_tax_profiles_withholding_kind_check check (withholding_kind is null or withholding_kind in ('hostess','other_204','manual','none'));
comment on column public.cast_tax_profiles.withholding_kind is '★0188（裁定434）: 源泉区分 none／hostess／other_204／manual（null＝既定＝委託 hostess／雇用 manual）';
alter table public.staff_contracts drop constraint if exists staff_contracts_withholding_kind_check;
alter table public.staff_contracts add constraint staff_contracts_withholding_kind_check check (withholding_kind is null or withholding_kind in ('hostess','other_204','manual','none'));
comment on column public.staff_contracts.withholding_kind is '★0188（裁定434）: 源泉区分 none／hostess／other_204／manual（null＝既定＝委託 none／雇用 manual＝client の既定・withholding_rate 列は読まない）';

-- ═══ ④ set_withholding_kind ═══
CREATE OR REPLACE FUNCTION public.set_withholding_kind(p_subject_kind text, p_subject_id uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0183 ★4（裁定432 ①）: 源泉区分の変更（null＝既定に戻す）。店長は自店・オーナーは org 内
declare
  v_store uuid; v_org uuid; v_before text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_kind is not null and p_kind not in ('hostess','other_204','manual','none') then raise exception 'bad kind'; end if;   -- ★0188（裁定434）: other_fee 廃止→その他 204 条（other_204）
  if p_subject_kind = 'cast' then
    select store_id, org_id, withholding_kind into v_store, v_org, v_before from public.cast_tax_profiles where cast_id = p_subject_id;
  elsif p_subject_kind = 'staff' then
    select store_id, org_id, withholding_kind into v_store, v_org, v_before from public.staff_contracts where membership_id = p_subject_id;
  else raise exception 'bad subject'; end if;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'not found'; end if;
  if public.auth_role() <> 'owner' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if p_subject_kind = 'cast' then
    update public.cast_tax_profiles set withholding_kind = p_kind, updated_at = now() where cast_id = p_subject_id;
  else
    update public.staff_contracts set withholding_kind = p_kind, updated_at = now() where membership_id = p_subject_id;
  end if;
  perform public.audit_log_write('set_withholding_kind', p_subject_kind || ':' || p_subject_id::text,
    jsonb_build_object('withholding_kind', v_before), jsonb_build_object('withholding_kind', p_kind), v_store);
end $function$;

-- ═══ ⑤ daily_pay_issue ═══
CREATE OR REPLACE FUNCTION public.daily_pay_issue(p_cast_id uuid, p_biz_date date, p_gross integer, p_idem_key uuid, p_kind text DEFAULT 'settlement'::text, p_worked_hours numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast    record;
  v_actor   uuid;
  v_mode    text;
  v_wh      integer;
  v_warn    text;
  v_row     public.daily_pays;
  v_settle  text;   -- ★1 0158（裁定312）: 控除する期（既定＝biz_date の月・当月が paid なら翌月）
  v_carry   text;   -- ★1 0158: 繰り下げ先（繰り下げたときだけ）
  v_kind    text;    -- ★0188（裁定434）: 源泉区分（withholding_kind・null＝既定＝委託 hostess／雇用 manual）
  v_cycle   text;    -- ★0188（裁定434 ④）: 店の精算方式（settlement_cycle・欠損＝monthly）
  v_cap     integer; -- ★20 0175 v2（CN-R ⑳ LunaNox）: 勤務時間で変わる日払いの上限（店設定 daily_pay_cap_tiers・p_worked_hours で読む）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_gross is null or p_gross <= 0 then raise exception 'bad amount'; end if;
  if p_kind is null or p_kind not in ('settlement','advance') then raise exception 'bad kind'; end if;   -- ★1 0172
  select id, org_id, store_id, is_active into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  -- ★0188（裁定434 ④・Agoora 確定 10/27（2））: kind 'settlement'（日次精算＝計算期間 1 日・5,000 円×1 日を控除）は settlement_cycle＝'daily' の店だけ。それ以外の店の日払いは 'advance'（前払・仮払＝その場で源泉なし・期の精算で源泉）だけ＝二重控除を DB でも防ぐ
  select coalesce(nullif(s.settings_json->>'settlement_cycle', ''), 'monthly') into v_cycle from public.stores s where s.id = v_cast.store_id;
  if p_kind = 'settlement' and v_cycle <> 'daily' then raise exception 'settlement not allowed'; end if;
  -- ★20 0175 v2（CN-R ⑳）: 上限の表（[{hours_min, cap}]・hours_min 昇順）があり p_worked_hours が渡されたら、hours_min ≤ 勤務時間 の最大段の cap を超える gross は 'over cap'。表が空／hours null＝上限なし（従来）
  if p_kind = 'settlement' then
    select (t->>'cap')::int into v_cap
      from public.stores s, jsonb_array_elements(coalesce(s.settings_json->'daily_pay_cap_tiers', '[]'::jsonb)) t
     where s.id = v_cast.store_id and p_worked_hours is not null and (t->>'hours_min')::numeric <= p_worked_hours
     order by (t->>'hours_min')::numeric desc limit 1;
    if v_cap is not null and p_gross > v_cap then raise exception 'over cap'; end if;
  end if;
  -- 冪等（org／ロール照合の後）: 同キー再送は既存行を返す（別 cast のキー再利用は拒否）
  select * into v_row from public.daily_pays where idem_key = p_idem_key;
  if v_row.id is not null then
    if v_row.cast_id <> p_cast_id then raise exception 'bad idem key'; end if;
    return jsonb_build_object('id', v_row.id, 'cast_id', v_row.cast_id, 'biz_date', v_row.biz_date, 'gross', v_row.gross,
      'withholding', v_row.withholding, 'withholding_category', v_row.withholding_category, 'net', v_row.net, 'warn', null, 'replay', true, 'kind', v_row.kind,   -- ★1 0172
      'settle_period', coalesce(v_row.settle_period, to_char(v_row.biz_date, 'YYYY-MM')),                                           -- ★1 0158
      'carried_to', case when v_row.settle_period is not null and v_row.settle_period <> to_char(v_row.biz_date, 'YYYY-MM') then v_row.settle_period end);   -- ★1 0158
  end if;
  -- paid 期間ガード（adv_issue 同型＝凍結済み期に stranded な日払いを作らない）
  v_settle := to_char(p_biz_date, 'YYYY-MM');   -- ★1 0158
  if exists (select 1 from public.payroll_runs
             where store_id = v_cast.store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    -- ★1 0158（裁定312）: 当月が支払済み＝翌月の給与から控除（settle_period＝翌月）。翌月も支払済みなら拒否
    v_carry := to_char((date_trunc('month', p_biz_date) + interval '1 month'), 'YYYY-MM');
    if exists (select 1 from public.payroll_runs
               where store_id = v_cast.store_id and period = v_carry and status = 'paid') then
      raise exception 'paid period';
    end if;
    v_settle := v_carry;
  end if;
  -- 源泉区分＝cast_tax_profiles.mode（無ければ '委託'）。委託＝月次 run と同式（lib/nox/pay.ts withholdingOf）を日数 1 で写経＝
  --   floor(max(0, gross − 5,000 × 1) × 1021 ÷ 10000)・整数（★0184 裁定431 ②・旧＝double precision の小数式）・1 円未満切捨て（309 追補2 (c)）。雇用＝0（T10 回答まで）＋warn
  -- ★0188（裁定434・裁定433）: 区分＝cast_tax_profiles.withholding_kind（null＝既定＝委託 hostess／雇用 manual）。税額＝withholding_calc（税率表の支払日＝biz_date の行・日数 1・直書きなし）
  select coalesce(t.mode, '委託'), coalesce(t.withholding_kind, case when t.mode = '雇用' then 'manual' else 'hostess' end)
    into v_mode, v_kind from (select 1) x left join public.cast_tax_profiles t on t.cast_id = p_cast_id;
  if p_kind = 'advance' then
    v_wh := 0; v_warn := null;   -- ★1 0172（裁定349）: 前払・仮払＝控除なし（期の精算で控除）
  elsif v_kind = 'manual' then
    v_wh := 0; v_warn := case when v_mode = '雇用' then 'T10 pending' else 'manual' end;   -- 給与＝NOX は税額を計算しない（従来の雇用と同じ warn）
  elsif v_kind = 'none' then
    v_wh := 0; v_warn := null;   -- 対象外
  else
    v_wh := public.withholding_calc(v_kind, p_gross, 1, p_biz_date); v_warn := null;   -- hostess＝floor((gross − 5,000×1)×1021÷10000)（従来と同値）・other_204＝1 回の支払金額の段階
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_pays (org_id, store_id, cast_id, biz_date, gross, withholding, withholding_category, net, paid_by, idem_key, settle_period, kind)   -- ★1 0158: +settle_period・★1 0172: +kind
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_biz_date, p_gross, v_wh, v_mode, p_gross - v_wh, v_actor, p_idem_key, v_settle, p_kind)   -- ★1 0172
  returning * into v_row;
  perform public.audit_log_write('daily_pay_issue', 'daily_pays:' || v_row.id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross, 'withholding', v_wh,
                       'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn,
                       'settle_period', v_settle, 'carried_to', v_carry, 'kind', p_kind, 'withholding_kind', v_kind, 'settlement_cycle', v_cycle), v_cast.store_id);   -- ★1 0158・★1 0172: +kind・★0188: +区分・精算方式
  return jsonb_build_object('id', v_row.id, 'cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross,
    'withholding', v_wh, 'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn, 'replay', false,
    'settle_period', v_settle, 'carried_to', v_carry, 'kind', p_kind, 'withholding_kind', v_kind);   -- ★1 0158・★1 0172: +kind・★0188: +区分
end $function$;

-- ═══ ⑥ referral_payout_pay ═══
CREATE OR REPLACE FUNCTION public.referral_payout_pay(p_payout_id uuid, p_paid_via text, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p record; v_actor uuid; v_cat text; v_month date;
  v_cum int := 0; v_wh_done int := 0; v_wh_total int := 0; v_wh int := 0;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_paid_via is null or p_paid_via not in ('cash_daily','monthly') then raise exception 'bad paid_via'; end if;   -- ★9 CHECK 2 値逐語
  select * into v_p from public.referral_payouts where id = p_payout_id for update;
  if v_p.id is null or v_p.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_p.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで paid 済みなら成功を返す（check_close の形）
  if v_p.status = 'paid' then
    if p_idem_key is not null and v_p.idem_key = p_idem_key then return p_payout_id; end if;
    raise exception 'already paid';
  end if;
  if v_p.status = 'voided' then raise exception 'voided'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  select withholding_category into v_cat from public.referrers where id = v_p.referrer_id;
  -- ★9（298-7・要裁定(6)）: salesperson＝同月（支払日時の JST 月）の当該紹介者への支払累計で (累計−120,000)×10.21% を floor し、既確定分との差分を本 payout に載せる（負なら 0）
  if v_cat = 'salesperson' then
    v_month := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
    select coalesce(sum(amount), 0)::int, coalesce(sum(withholding), 0)::int into v_cum, v_wh_done
      from public.referral_payouts
     where referrer_id = v_p.referrer_id and status = 'paid' and id <> v_p.id
       and date_trunc('month', (paid_at at time zone 'Asia/Tokyo'))::date = v_month;
    v_wh_total := public.withholding_calc('salesperson', v_cum + v_p.amount, 1, (now() at time zone 'Asia/Tokyo')::date);   -- ★0188（裁定433 ④）: 直書き（120,000・1021）を税率表（salesperson・支払日の行・1 月分の控除）から＝従来と同値
    v_wh := least(v_p.amount, greatest(0, v_wh_total - v_wh_done));
  else
    v_wh := 0;   -- employee＝給与側で源泉／none＝0
  end if;

  update public.referral_payouts
     set status = 'paid', paid_via = p_paid_via, paid_at = now(), paid_by = v_actor, withholding = v_wh, idem_key = p_idem_key
   where id = p_payout_id;
  perform public.audit_log_write('referral_payout_pay', 'referral_payouts:' || p_payout_id::text, to_jsonb(v_p),
    (select to_jsonb(p) from public.referral_payouts p where p.id = p_payout_id), v_p.store_id);
  return p_payout_id;
end $function$;

commit;

-- ===== verify =====（Success の後に貼る・SELECT のみ）
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all select 'withholding_rates rows', count(*)::text from public.withholding_rates
union all select 'withholding_rates acl (select only)', (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'withholding_rates' and grantee = 'authenticated')
union all select 'helpers 2 (acl postgres only)', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('withholding_rate_of','withholding_calc') and coalesce(proacl::text, '') = '{postgres=X/postgres}'
union all select 'calc hostess 20000x1', public.withholding_calc('hostess', 20000, 1, current_date)::text
union all select 'calc hostess 300000x31', public.withholding_calc('hostess', 300000, 31, current_date)::text
union all select 'calc other_204 1500000', public.withholding_calc('other_204', 1500000, 1, current_date)::text
union all select 'calc salesperson 200000', public.withholding_calc('salesperson', 200000, 1, current_date)::text
union all select 'kinds check (cast)', pg_get_constraintdef(oid) from pg_constraint where conname = 'cast_tax_profiles_withholding_kind_check'
union all select 'kinds check (staff)', pg_get_constraintdef(oid) from pg_constraint where conname = 'staff_contracts_withholding_kind_check'
union all select 'other_fee rows', (select count(*) from public.cast_tax_profiles where withholding_kind = 'other_fee')::text || '+' || (select count(*) from public.staff_contracts where withholding_kind = 'other_fee')::text
union all select 'has 0188 (4 fns)', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%★0188%' and proname in ('set_withholding_kind','daily_pay_issue','referral_payout_pay','withholding_calc')
union all select 'md5 ' || proname, left(md5(replace(prosrc, chr(13), '')), 8) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('withholding_rate_of','withholding_calc','set_withholding_kind','daily_pay_issue','referral_payout_pay')
order by 1;
-- ===== end 0188 =====
