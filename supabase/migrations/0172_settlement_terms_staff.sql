-- 0172_settlement_terms_staff.sql
-- マイグレーション名: 0172_settlement_terms_staff（裁定349＝日払い settlement／advance＋店設定・351＝利用規約の同意・355／356＝スタッフの器・380＝自動確定時間・381＝スタッフの電話・LINE ID／メール無し登録・便 GV-B 起草・2026-10-15・★起草のみ＝適用は相談役の裁定後に Agoora 手貼り＝0171 の後）
-- 生成器: docs/tmp/gen_0172.mjs（手打ち禁止）。写経元＝docs/tmp/0172_live.json（live pg_get_functiondef・2026-10-14 読取＝daily_pay_issue 7e9d29d0／daily_pays_of_run b81e8659／set_store_profile 2e7b4963／staff_create e69adbe4／staff_update_profile f6633371）。★以外は 1 バイト不変
--
-- 器:
--   ★1 daily_pays.kind text not null default 'settlement' check (settlement／advance)。既存行は settlement（現行＝発行時に 1 日分控除）。daily_pay_issue は 5 引数（p_kind default 'settlement'・advance＝控除なし）＝4 引数版は drop（overload 罠）。
--      daily_pays_of_run は戻り型に kind 別 3 列（settlement_gross／settlement_withholding／advance_gross）を末尾に足す（既存 4 列は不変＝drop→create）。期間精算から settlement を除く計算は client（lib/nox/payroll）の次便＝本 mig は材料だけ。
--   ★2 cast_tax_profiles.dependents_form boolean not null default false＋dependents_form_on date null（扶養控除等申告書＝提出あり甲／なし乙の判定材料）＋set_cast_dependents_form(p_cast_id, p_submitted, p_on)（owner／manager 自店・audit）。
--   ★3 stores.settings_json に 3 キー＝settlement_cycle（monthly／half／weekly／daily・源泉の暦日数）・mid_pay（none／advance）・shift_auto_confirm_hours（整数 0〜168・0＝しない）＝set_store_profile の白名単＋検証（owner 限定は不変）。自動確定の実行器は別起票。
--   ★4 terms_acceptances（id・org_id・terms_version・accepted_at・accepted_by）unique(org_id, terms_version)・RLS SELECT＝owner の自 org・grant SELECT のみ。
--      terms_accept(p_version)（owner・冪等＝同 version は既存 id を返す・billing lock は見ない＝開通前でも同意できる・audit）／terms_accepted_version_ok(p_version)（authenticated・デモ org は常に true・無所属 false）＝(manage)/layout の開通ゲートが読む。
--   ★5 staff_contracts（membership_id unique・contract_kind employee／parttime／contractor・hourly・fixed_allowance・tax_class 甲／乙・withholding_rate 既定 0・invoice／reg_no）／staff_punches（membership_id・biz_date・kind in／out・punched_at・source kiosk／manual）／staff_payroll_runs（store_id×period unique・status open／finalized／paid）＝器のみ（書込 RPC は裁定356 確定後）。RLS SELECT＝owner 自 org／manager 自店／本人（memberships→users.auth_user_id）。
--   ★6 memberships.tel text null・line_id text null。staff_create は 7 引数（p_tel／p_line_id default null・p_email null＝合成 s-xxxxxxxx@o-xxxxxxxx.nox.local）＝5 引数版は drop。staff_update_profile は 4 引数（null＝変更なし・''＝消す）＝2 引数版は drop。route（/api/staff/create・update-email）は従来の引数名で通る。
--   ★7 W-7 の候補 RPC＝不要（共通モーダルは customer_list_summary＋customers で足りた）。PIN hash＝staff_pin（membership_id PK）が既にある＝memberships には足さない。
--
-- 名簿・suite への影響（適用後の便で反映）: 関数 +3（set_cast_dependents_form・terms_accept・terms_accepted_version_ok＝311）・'billing locked' +1（159＝set_cast_dependents_form。terms_accept は見ない）・テーブル +4（terms_acceptances・staff_contracts・staff_punches・staff_payroll_runs＝87）
--   ・anon-guard に 3 本（anon BLOCKED）・grants（新 4 表＝authenticated SELECT のみ・公開 secdef は authenticated のみ）・md5 pin 5 本（下の検証クエリの値）・daily-pay suite（kind・advance＝withholding 0）・rls（staff_* の本人行）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='daily_pays' and column_name='kind';   -- 1 行・text・'settlement'::text
--   select kind, count(*) from public.daily_pays group by 1;                                                                                     -- settlement だけ（既存行）
--   select column_name, data_type from information_schema.columns where table_schema='public' and table_name='cast_tax_profiles' and column_name like 'dependents_form%' order by 1;   -- 2 行（boolean・date）
--   select column_name from information_schema.columns where table_schema='public' and table_name='memberships' and column_name in ('tel','line_id') order by 1;   -- 2 行
--   select tablename from pg_tables where schemaname='public' and tablename in ('terms_acceptances','staff_contracts','staff_punches','staff_payroll_runs') order by 1;   -- 4 行
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('daily_pay_issue','staff_create','staff_update_profile') order by 1;   -- 各 1 行（p_kind／p_tel, p_line_id が末尾・旧版なし）
--   select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname in ('daily_pay_issue','daily_pays_of_run','set_store_profile','staff_create','staff_update_profile') order by 1;
--     -- daily_pay_issue 94f989f9／daily_pays_of_run 37ff6ed0／set_store_profile 67e96c04／staff_create 8c2fef04／staff_update_profile b710ebae
--   select proname, proacl::text from pg_proc where proname in ('set_cast_dependents_form','terms_accept','terms_accepted_version_ok','daily_pay_issue','daily_pays_of_run','staff_create','staff_update_profile') order by 1;   -- 7 行・authenticated／service_role のみ（anon なし）
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 311／87
begin;

-- ═══ ★1 daily_pays.kind（裁定349）＝settlement（日次精算・1 日分控除）／advance（前払・仮払・控除なし）
alter table public.daily_pays add column if not exists kind text not null default 'settlement';
alter table public.daily_pays drop constraint if exists daily_pays_kind_check;
alter table public.daily_pays add constraint daily_pays_kind_check check (kind in ('settlement','advance'));

drop function if exists public.daily_pay_issue(uuid, date, integer, uuid);   -- ★1 0172: 4 引数版（overload 罠）
CREATE OR REPLACE FUNCTION public.daily_pay_issue(p_cast_id uuid, p_biz_date date, p_gross integer, p_idem_key uuid, p_kind text DEFAULT 'settlement'::text)   -- ★1 0172（裁定349）: p_kind settlement／advance
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
  --   floor(max(0, gross − 5,000 × 1) × 0.1021)・double precision（TS の Number と同じ IEEE754）・1 円未満切捨て（309 追補2 (c)）。雇用＝0（T10 回答まで）＋warn
  select coalesce(t.mode, '委託') into v_mode from (select 1) x left join public.cast_tax_profiles t on t.cast_id = p_cast_id;
  if p_kind = 'advance' then
    v_wh := 0; v_warn := null;   -- ★1 0172（裁定349）: 前払・仮払＝控除なし（期の精算で控除）
  elsif v_mode = '雇用' then
    v_wh := 0; v_warn := 'T10 pending';
  else
    v_wh := floor(greatest(0, p_gross - 5000)::double precision * 0.1021)::int; v_warn := null;
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_pays (org_id, store_id, cast_id, biz_date, gross, withholding, withholding_category, net, paid_by, idem_key, settle_period, kind)   -- ★1 0158: +settle_period・★1 0172: +kind
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_biz_date, p_gross, v_wh, v_mode, p_gross - v_wh, v_actor, p_idem_key, v_settle, p_kind)   -- ★1 0172
  returning * into v_row;
  perform public.audit_log_write('daily_pay_issue', 'daily_pays:' || v_row.id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross, 'withholding', v_wh,
                       'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn,
                       'settle_period', v_settle, 'carried_to', v_carry, 'kind', p_kind), v_cast.store_id);   -- ★1 0158・★1 0172: +kind
  return jsonb_build_object('id', v_row.id, 'cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross,
    'withholding', v_wh, 'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn, 'replay', false,
    'settle_period', v_settle, 'carried_to', v_carry, 'kind', p_kind);   -- ★1 0158・★1 0172: +kind
end $function$;
revoke execute on function public.daily_pay_issue(uuid, date, integer, uuid, text) from public, anon;
grant execute on function public.daily_pay_issue(uuid, date, integer, uuid, text) to authenticated, service_role;

drop function if exists public.daily_pays_of_run(uuid);   -- ★1 0172: 戻り型の変更＝drop→create
CREATE OR REPLACE FUNCTION public.daily_pays_of_run(p_run_id uuid)
 RETURNS TABLE(cast_id uuid, paid_total integer, withholding_total integer, n integer, settlement_gross integer, settlement_withholding integer, advance_gross integer)   -- ★1 0172: kind 別（期間精算から settlement を除く材料＝client は次便）
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select d.cast_id, sum(d.gross)::int, sum(d.withholding)::int, count(*)::int,
           coalesce(sum(d.gross) filter (where d.kind = 'settlement'), 0)::int, coalesce(sum(d.withholding) filter (where d.kind = 'settlement'), 0)::int, coalesce(sum(d.gross) filter (where d.kind = 'advance'), 0)::int   -- ★1 0172
      from public.daily_pays d
     where d.store_id = v_run.store_id
       and coalesce(d.settle_period, to_char(d.biz_date, 'YYYY-MM')) = v_run.period   -- ★1 0158（裁定312）: 期の文字列一致（繰り下げた日払いは翌期の run が拾う・旧: biz_date between v_from and v_to）
     group by d.cast_id
     order by d.cast_id;
end $function$;
revoke execute on function public.daily_pays_of_run(uuid) from public, anon;
grant execute on function public.daily_pays_of_run(uuid) to authenticated, service_role;

-- ═══ ★2 扶養控除等申告書（裁定349＝雇用の甲／乙）
alter table public.cast_tax_profiles add column if not exists dependents_form boolean not null default false;
alter table public.cast_tax_profiles add column if not exists dependents_form_on date null;

create or replace function public.set_cast_dependents_form(p_cast_id uuid, p_submitted boolean, p_on date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org   uuid := public.auth_org_id();
  v_cast  record;
  v_old   record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_submitted is null then raise exception 'bad submitted'; end if;   -- 原則7: boolean は明示値
  select id, org_id, store_id into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  select dependents_form, dependents_form_on into v_old from public.cast_tax_profiles where cast_id = p_cast_id;
  if not found then raise exception 'no tax profile'; end if;   -- 税区分（mode）が先＝set_cast_tax_profile で作る
  update public.cast_tax_profiles
     set dependents_form = p_submitted, dependents_form_on = case when p_submitted then p_on else null end, updated_at = now()
   where cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_dependents_form', 'cast_tax_profiles:' || p_cast_id::text,
    jsonb_build_object('dependents_form', v_old.dependents_form, 'dependents_form_on', v_old.dependents_form_on),
    jsonb_build_object('dependents_form', p_submitted, 'dependents_form_on', case when p_submitted then p_on else null end),
    v_cast.store_id);
end $function$;
revoke execute on function public.set_cast_dependents_form(uuid, boolean, date) from public, anon;
grant execute on function public.set_cast_dependents_form(uuid, boolean, date) to authenticated, service_role;

-- ═══ ★3 店設定 3 キー（裁定349＝精算方式・途中払い／裁定380＝自動確定時間）＝set_store_profile の白名単＋検証
CREATE OR REPLACE FUNCTION public.set_store_profile(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm',   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）
                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）
                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1
                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）
                             'slide_apply',                                                               -- ★4 0151: 裁定287-4 の 1 キー（0154 ★7: 末尾 '];' → ','）
                             'settlement_presets',                                                        -- ★7 0154: 裁定294-7 の 1 キー（0153 ★5: 末尾 '];' → ','）
                             'customer_purpose','customer_retention_years',                               -- ★5 0153: 裁定305-11／293-4 の 2 キー（0155 ★4: 末尾 '];' → ','）
                             'ar_enabled',                                                                -- ★4 0155: 裁定309-1 の 1 キー（boolean・新規店の既定は false＝ar_policy_ok の coalesce）（0158 ★4: 末尾 '];' → ','）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             'invoice_registered_on','pay_day','tax_inclusive_display','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours'];   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間
  v_k        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_name     text;
  v_short    text;
  v_code     text;
  v_disp     text;
  v_ext      boolean;
  v_dohan    boolean;
  v_open     boolean;
  v_confirm  boolean;
  v_settings jsonb;
  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）
  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）
  v_setup_done boolean;   -- ★4 0147: setup_done（show_open_status と同型）
  v_s_hourly boolean;   -- ★4 0147: sys_hourly（show_open_status と同型）
  v_s_backs  boolean;   -- ★4 0147: sys_backs（show_open_status と同型）
  v_s_sales_rate boolean;   -- ★4 0147: sys_sales_rate（show_open_status と同型）
  v_s_points boolean;   -- ★4 0147: sys_points（show_open_status と同型）
  v_s_sales_slide boolean;   -- ★4 0147: sys_sales_slide（show_open_status と同型）
  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）
  v_s_norms  boolean;   -- ★4 0147: sys_norms（show_open_status と同型）
  v_s_penalties boolean;   -- ★4 0147: sys_penalties（show_open_status と同型）
  v_s_bonus  boolean;   -- ★4 0147: sys_bonus（show_open_status と同型）
  v_slide    text;      -- ★4 0151: slide_apply（enum text 2 値・biz_type と同型）
  v_presets  jsonb;     -- ★7 0154: settlement_presets（配列・最大 10）
  v_pe       jsonb;     -- ★7 0154: settlement_presets の要素
  v_purpose  text;      -- ★5 0153: customer_purpose（display_name と同型・≤200）
  v_years    numeric;   -- ★5 0153: customer_retention_years（整数 1〜10）
  v_ar       boolean;   -- ★4 0155: ar_enabled（show_open_status と同型）
  v_okb      numeric;   -- ★4 0158: okuri_base_amount（整数 0〜99999）
  v_inv_on   date;      -- ★2 0164: invoice_registered_on（'YYYY-MM-DD' か null）
  v_pay_day  numeric;   -- ★2 0164: pay_day（整数 1〜31）
  v_tax_inc  boolean;   -- ★2 0164: tax_inclusive_display
  v_use_vip  boolean;   -- ★2 0164: use_vip
  v_use_ctr  boolean;   -- ★2 0164: use_counter
  v_paym     jsonb;     -- ★2 0164: payment_methods（object・cash／card／emoney／qr・boolean・cash は true）
  v_punch    jsonb;     -- ★2 0164: punch_methods（object・self／proxy／kiosk・boolean・1 つ以上 true）
  v_jk       text;      -- ★2 0164: jsonb の検査用キー
  v_cycle    text;      -- ★3 0172: settlement_cycle（enum text 4 値・slide_apply と同型）
  v_midpay   text;      -- ★3 0172: mid_pay（enum text 2 値）
  v_autoh    numeric;   -- ★3 0172: shift_auto_confirm_hours（整数 0〜168・0＝自動確定しない）
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json,   -- ★2 0164: 列を 7 つ続ける
         invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods   -- ★2 0164: before の現値
    into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  -- 白名単外のキーは黙って無視せず拒否
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;

  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);

  -- ── 列側 ────────────────────────────────────────────────
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;
    v_name := trim(p_patch->>'name');
    if length(v_name) < 1 or length(v_name) > 50 then raise exception 'bad name'; end if;
    v_before := v_before || jsonb_build_object('name', v_store.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;

  if p_patch ? 'short' then
    if jsonb_typeof(p_patch->'short') <> 'string' then raise exception 'bad type'; end if;
    v_short := trim(p_patch->>'short');
    if length(v_short) > 20 then raise exception 'bad short'; end if;
    if v_short = '' then v_short := null; end if;   -- 空欄は null（列は null 可）
    v_before := v_before || jsonb_build_object('short', v_store.short);
    v_after  := v_after  || jsonb_build_object('short', v_short);
  end if;

  if p_patch ? 'ext_shimei_enabled' then
    if jsonb_typeof(p_patch->'ext_shimei_enabled') <> 'boolean' then raise exception 'bad type'; end if;
    v_ext := (p_patch->>'ext_shimei_enabled')::boolean;
    v_before := v_before || jsonb_build_object('ext_shimei_enabled', v_store.ext_shimei_enabled);
    v_after  := v_after  || jsonb_build_object('ext_shimei_enabled', v_ext);
  end if;

  if p_patch ? 'dohan_auto_hon' then
    if jsonb_typeof(p_patch->'dohan_auto_hon') <> 'boolean' then raise exception 'bad type'; end if;
    v_dohan := (p_patch->>'dohan_auto_hon')::boolean;
    v_before := v_before || jsonb_build_object('dohan_auto_hon', v_store.dohan_auto_hon);
    v_after  := v_after  || jsonb_build_object('dohan_auto_hon', v_dohan);
  end if;

  -- ── settings_json 側 ───────────────────────────────────
  if p_patch ? 'store_code' then
    if jsonb_typeof(p_patch->'store_code') <> 'string' then raise exception 'bad type'; end if;
    v_code := trim(p_patch->>'store_code');
    if length(v_code) > 20 then raise exception 'bad store_code'; end if;
    v_before   := v_before || jsonb_build_object('store_code', coalesce(v_settings->>'store_code', ''));
    v_after    := v_after  || jsonb_build_object('store_code', v_code);
    v_settings := jsonb_set(v_settings, '{store_code}', to_jsonb(v_code), true);
  end if;

  if p_patch ? 'display_name' then
    if jsonb_typeof(p_patch->'display_name') <> 'string' then raise exception 'bad type'; end if;
    v_disp := trim(p_patch->>'display_name');
    if length(v_disp) > 50 then raise exception 'bad display_name'; end if;
    v_before   := v_before || jsonb_build_object('display_name', coalesce(v_settings->>'display_name', ''));
    v_after    := v_after  || jsonb_build_object('display_name', v_disp);
    v_settings := jsonb_set(v_settings, '{display_name}', to_jsonb(v_disp), true);
  end if;

  if p_patch ? 'show_open_status' then
    if jsonb_typeof(p_patch->'show_open_status') <> 'boolean' then raise exception 'bad type'; end if;
    v_open := (p_patch->>'show_open_status')::boolean;
    v_before   := v_before || jsonb_build_object('show_open_status',
                    coalesce(v_settings->>'show_open_status', '') = 'true');
    v_after    := v_after  || jsonb_build_object('show_open_status', v_open);
    v_settings := jsonb_set(v_settings, '{show_open_status}', to_jsonb(v_open), true);
  end if;

  if p_patch ? 'shift_cast_confirm' then
    if jsonb_typeof(p_patch->'shift_cast_confirm') <> 'boolean' then raise exception 'bad type'; end if;
    v_confirm := (p_patch->>'shift_cast_confirm')::boolean;
    v_before   := v_before || jsonb_build_object('shift_cast_confirm',
                    coalesce(v_settings->>'shift_cast_confirm', '') = 'true');
    v_after    := v_after  || jsonb_build_object('shift_cast_confirm', v_confirm);
    v_settings := jsonb_set(v_settings, '{shift_cast_confirm}', to_jsonb(v_confirm), true);
  end if;

  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────
  if p_patch ? 'biz_type' then                                                                             -- ★2 0147
    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）
    v_biz := p_patch->>'biz_type';                                                                         -- ★2
    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）
    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2
    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2
    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2
  end if;                                                                                                  -- ★2

  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147
    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）
    v_bill := p_patch->>'billing_mode';                                                                    -- ★3
    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）
    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3
    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3
    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3
  end if;                                                                                                  -- ★3

  if p_patch ? 'setup_done' then                                                                               -- ★4 0147: setup_done（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'setup_done') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_setup_done := (p_patch->>'setup_done')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('setup_done',                                                  -- ★4
                    coalesce(v_settings->>'setup_done', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('setup_done', v_setup_done);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{setup_done}', to_jsonb(v_setup_done), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_hourly' then                                                                               -- ★4 0147: sys_hourly（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_hourly') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_hourly := (p_patch->>'sys_hourly')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_hourly',                                                  -- ★4
                    coalesce(v_settings->>'sys_hourly', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_hourly', v_s_hourly);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_hourly}', to_jsonb(v_s_hourly), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_backs' then                                                                               -- ★4 0147: sys_backs（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_backs') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_backs := (p_patch->>'sys_backs')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_backs',                                                  -- ★4
                    coalesce(v_settings->>'sys_backs', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_backs', v_s_backs);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_backs}', to_jsonb(v_s_backs), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_rate' then                                                                               -- ★4 0147: sys_sales_rate（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_rate') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_rate := (p_patch->>'sys_sales_rate')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_rate',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_rate', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_rate', v_s_sales_rate);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_rate}', to_jsonb(v_s_sales_rate), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_points' then                                                                               -- ★4 0147: sys_points（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_points') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_points := (p_patch->>'sys_points')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_points',                                                  -- ★4
                    coalesce(v_settings->>'sys_points', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_points', v_s_points);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_points}', to_jsonb(v_s_points), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_slide' then                                                                               -- ★4 0147: sys_sales_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_slide := (p_patch->>'sys_sales_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_slide', v_s_sales_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_slide}', to_jsonb(v_s_sales_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_point_slide' then                                                                               -- ★4 0147: sys_point_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_point_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_point_slide := (p_patch->>'sys_point_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_point_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_point_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_point_slide', v_s_point_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_norms' then                                                                               -- ★4 0147: sys_norms（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_norms') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_norms := (p_patch->>'sys_norms')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_norms',                                                  -- ★4
                    coalesce(v_settings->>'sys_norms', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_norms', v_s_norms);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_norms}', to_jsonb(v_s_norms), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_penalties' then                                                                               -- ★4 0147: sys_penalties（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_penalties') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_penalties := (p_patch->>'sys_penalties')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_penalties',                                                  -- ★4
                    coalesce(v_settings->>'sys_penalties', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_penalties', v_s_penalties);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_penalties}', to_jsonb(v_s_penalties), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_bonus' then                                                                               -- ★4 0147: sys_bonus（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_bonus') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_bonus := (p_patch->>'sys_bonus')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_bonus',                                                  -- ★4
                    coalesce(v_settings->>'sys_bonus', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_bonus', v_s_bonus);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_bonus}', to_jsonb(v_s_bonus), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'slide_apply' then                                                                          -- ★4 0151（裁定287-4）: biz_type ブロックと同型
    if jsonb_typeof(p_patch->'slide_apply') <> 'string' then raise exception 'bad type'; end if;           -- ★4
    v_slide := p_patch->>'slide_apply';                                                                    -- ★4
    if v_slide is null or v_slide not in ('next','current') then raise exception 'bad slide_apply'; end if; -- ★4（'bad biz_type' と同型）
    v_before   := v_before || jsonb_build_object('slide_apply', coalesce(v_settings->>'slide_apply', ''));  -- ★4
    v_after    := v_after  || jsonb_build_object('slide_apply', v_slide);                                  -- ★4
    v_settings := jsonb_set(v_settings, '{slide_apply}', to_jsonb(v_slide), true);                         -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'settlement_presets' then                                                                   -- ★7 0154（裁定294-7）: 配列・最大 10・要素 {code,name,amount,basis,target}
    v_presets := p_patch->'settlement_presets';                                                            -- ★7
    if jsonb_typeof(v_presets) <> 'array' or jsonb_array_length(v_presets) > 10 then raise exception 'bad type'; end if;   -- ★7
    for v_pe in select e from jsonb_array_elements(v_presets) e loop                                       -- ★7
      if jsonb_typeof(v_pe) <> 'object'                                                                    -- ★7
         or coalesce(jsonb_typeof(v_pe->'code'), '') <> 'string' or length(trim(v_pe->>'code')) = 0       -- ★7: 欠損（null）も拒否
         or coalesce(jsonb_typeof(v_pe->'name'), '') <> 'string'                                           -- ★7
         or coalesce(jsonb_typeof(v_pe->'amount'), '') <> 'number'                                         -- ★7
         or (v_pe->>'amount')::numeric < 0 or (v_pe->>'amount')::numeric <> trunc((v_pe->>'amount')::numeric)   -- ★7: 整数 ≥0
         or coalesce(jsonb_typeof(v_pe->'basis'), '') <> 'string'                                          -- ★7
         or coalesce(jsonb_typeof(v_pe->'target'), '') <> 'string'                                         -- ★7
         or (v_pe->>'target') not in ('late','absent','early','other') then                                -- ★7
        raise exception 'bad type';                                                                        -- ★7
      end if;                                                                                              -- ★7
    end loop;                                                                                              -- ★7
    v_before   := v_before || jsonb_build_object('settlement_presets', coalesce(v_settings->'settlement_presets', '[]'::jsonb));   -- ★7
    v_after    := v_after  || jsonb_build_object('settlement_presets', v_presets);                         -- ★7
    v_settings := jsonb_set(v_settings, '{settlement_presets}', v_presets, true);                          -- ★7
  end if;                                                                                                  -- ★7

  if p_patch ? 'customer_purpose' then                                                                     -- ★5 0153（裁定305-11／293-4）: display_name ブロックと同型
    if jsonb_typeof(p_patch->'customer_purpose') <> 'string' then raise exception 'bad type'; end if;      -- ★5
    v_purpose := trim(p_patch->>'customer_purpose');                                                       -- ★5
    if length(v_purpose) > 200 then raise exception 'bad customer_purpose'; end if;                        -- ★5
    v_before   := v_before || jsonb_build_object('customer_purpose', coalesce(v_settings->>'customer_purpose', ''));   -- ★5
    v_after    := v_after  || jsonb_build_object('customer_purpose', v_purpose);                           -- ★5
    v_settings := jsonb_set(v_settings, '{customer_purpose}', to_jsonb(v_purpose), true);                  -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'customer_retention_years' then                                                             -- ★5 0153（裁定305-11）: 整数 1〜10（settlement_presets の数値検査の型）
    if jsonb_typeof(p_patch->'customer_retention_years') <> 'number' then raise exception 'bad type'; end if;   -- ★5
    v_years := (p_patch->>'customer_retention_years')::numeric;                                            -- ★5
    if v_years < 1 or v_years > 10 or v_years <> trunc(v_years) then raise exception 'bad customer_retention_years'; end if;   -- ★5
    v_before   := v_before || jsonb_build_object('customer_retention_years', coalesce((v_settings->>'customer_retention_years')::int, 5));   -- ★5: 既定 5
    v_after    := v_after  || jsonb_build_object('customer_retention_years', v_years::int);                -- ★5
    v_settings := jsonb_set(v_settings, '{customer_retention_years}', to_jsonb(v_years::int), true);       -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'ar_enabled' then                                                                               -- ★4 0155（裁定309-1）: ar_enabled（show_open_status の 4 行型を写経・owner 限定は関数冒頭で担保）
    if jsonb_typeof(p_patch->'ar_enabled') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_ar := (p_patch->>'ar_enabled')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('ar_enabled',                                                  -- ★4
                    coalesce(v_settings->>'ar_enabled', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('ar_enabled', v_ar);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{ar_enabled}', to_jsonb(v_ar), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'okuri_base_amount' then                                                                    -- ★4 0158（裁定317）: 整数 0〜99999（customer_retention_years の数値検査の型）
    if jsonb_typeof(p_patch->'okuri_base_amount') <> 'number' then raise exception 'bad type'; end if;       -- ★4 0158
    v_okb := (p_patch->>'okuri_base_amount')::numeric;                                                       -- ★4 0158
    if v_okb < 0 or v_okb > 99999 or v_okb <> trunc(v_okb) then raise exception 'bad okuri_base_amount'; end if;   -- ★4 0158
    v_before   := v_before || jsonb_build_object('okuri_base_amount', coalesce(nullif(trim(v_settings->>'okuri_base_amount'), '')::int, 0));   -- ★4 0158: 既定 0（未設定）
    v_after    := v_after  || jsonb_build_object('okuri_base_amount', v_okb::int);                           -- ★4 0158
    v_settings := jsonb_set(v_settings, '{okuri_base_amount}', to_jsonb(v_okb::int), true);                  -- ★4 0158
  end if;                                                                                                  -- ★4 0158

  -- ── ★2 0164: 列側 7 キー（裁定331 C 5 項目＋334 フロア機能） ──────────
  if p_patch ? 'invoice_registered_on' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'invoice_registered_on') = 'null' then v_inv_on := null;                       -- ★2 0164: null＝未登録／不明
    elsif jsonb_typeof(p_patch->'invoice_registered_on') <> 'string' or (p_patch->>'invoice_registered_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad type';   -- ★2 0164
    else v_inv_on := (p_patch->>'invoice_registered_on')::date; end if;                                      -- ★2 0164
    v_before := v_before || jsonb_build_object('invoice_registered_on', v_store.invoice_registered_on);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('invoice_registered_on', v_inv_on);                           -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'pay_day' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'pay_day') <> 'number' then raise exception 'bad type'; end if;                 -- ★2 0164
    v_pay_day := (p_patch->>'pay_day')::numeric;                                                             -- ★2 0164
    if v_pay_day < 1 or v_pay_day > 31 or v_pay_day <> trunc(v_pay_day) then raise exception 'bad pay_day'; end if;   -- ★2 0164
    v_before := v_before || jsonb_build_object('pay_day', v_store.pay_day);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('pay_day', v_pay_day::int);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'tax_inclusive_display' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'tax_inclusive_display') <> 'boolean' then raise exception 'bad type'; end if;  -- ★2 0164
    v_tax_inc := (p_patch->>'tax_inclusive_display')::boolean;                                               -- ★2 0164
    v_before := v_before || jsonb_build_object('tax_inclusive_display', v_store.tax_inclusive_display);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('tax_inclusive_display', v_tax_inc);                          -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_vip' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'use_vip') <> 'boolean' then raise exception 'bad type'; end if;                -- ★2 0164
    v_use_vip := (p_patch->>'use_vip')::boolean;                                                             -- ★2 0164
    v_before := v_before || jsonb_build_object('use_vip', v_store.use_vip);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_vip', v_use_vip);                                        -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_counter' then                                                                          -- ★2 0164
    if jsonb_typeof(p_patch->'use_counter') <> 'boolean' then raise exception 'bad type'; end if;            -- ★2 0164
    v_use_ctr := (p_patch->>'use_counter')::boolean;                                                         -- ★2 0164
    v_before := v_before || jsonb_build_object('use_counter', v_store.use_counter);                          -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_counter', v_use_ctr);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'payment_methods' then                                                                      -- ★2 0164
    v_paym := p_patch->'payment_methods';                                                                    -- ★2 0164
    if jsonb_typeof(v_paym) <> 'object' then raise exception 'bad type'; end if;                             -- ★2 0164
    for v_jk in select jsonb_object_keys(v_paym) loop                                                        -- ★2 0164
      if v_jk not in ('cash','card','emoney','qr') or jsonb_typeof(v_paym->v_jk) <> 'boolean' then raise exception 'bad payment_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    if coalesce((v_paym->>'cash')::boolean, true) <> true then raise exception 'bad payment_methods'; end if;   -- ★2 0164: 現金は常に使う
    v_paym := v_store.payment_methods || v_paym;                                                             -- ★2 0164: 無いキーは現値のまま
    v_before := v_before || jsonb_build_object('payment_methods', v_store.payment_methods);                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('payment_methods', v_paym);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'punch_methods' then                                                                        -- ★2 0164
    v_punch := p_patch->'punch_methods';                                                                     -- ★2 0164
    if jsonb_typeof(v_punch) <> 'object' then raise exception 'bad type'; end if;                            -- ★2 0164
    for v_jk in select jsonb_object_keys(v_punch) loop                                                       -- ★2 0164
      if v_jk not in ('self','proxy','kiosk') or jsonb_typeof(v_punch->v_jk) <> 'boolean' then raise exception 'bad punch_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    v_punch := v_store.punch_methods || v_punch;                                                             -- ★2 0164: 無いキーは現値のまま
    if not (coalesce((v_punch->>'self')::boolean, false) or coalesce((v_punch->>'proxy')::boolean, false) or coalesce((v_punch->>'kiosk')::boolean, false)) then raise exception 'bad punch_methods'; end if;   -- ★2 0164: 1 つ以上
    v_before := v_before || jsonb_build_object('punch_methods', v_store.punch_methods);                      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('punch_methods', v_punch);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164

  -- ★3 0172（裁定349）: 精算方式＝monthly／half／weekly／daily（源泉の暦日数＝lib/nox/pay.ts periodDays が読む・既定 monthly＝欠損時）
  if p_patch ? 'settlement_cycle' then                                                                     -- ★3 0172
    if jsonb_typeof(p_patch->'settlement_cycle') <> 'string' then raise exception 'bad type'; end if;      -- ★3 0172
    v_cycle := p_patch->>'settlement_cycle';                                                               -- ★3 0172
    if v_cycle is null or v_cycle not in ('monthly','half','weekly','daily') then raise exception 'bad settlement_cycle'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('settlement_cycle', coalesce(v_settings->>'settlement_cycle', ''));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('settlement_cycle', v_cycle);                             -- ★3 0172
    v_settings := jsonb_set(v_settings, '{settlement_cycle}', to_jsonb(v_cycle), true);                    -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定349）: 途中払い＝none／advance（advance＝前払・仮払の口を出す・既定 none）
  if p_patch ? 'mid_pay' then                                                                              -- ★3 0172
    if jsonb_typeof(p_patch->'mid_pay') <> 'string' then raise exception 'bad type'; end if;               -- ★3 0172
    v_midpay := p_patch->>'mid_pay';                                                                       -- ★3 0172
    if v_midpay is null or v_midpay not in ('none','advance') then raise exception 'bad mid_pay'; end if;  -- ★3 0172
    v_before   := v_before || jsonb_build_object('mid_pay', coalesce(v_settings->>'mid_pay', ''));         -- ★3 0172
    v_after    := v_after  || jsonb_build_object('mid_pay', v_midpay);                                     -- ★3 0172
    v_settings := jsonb_set(v_settings, '{mid_pay}', to_jsonb(v_midpay), true);                            -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定380）: 送り返しの自動確定時間＝整数 0〜168（0＝自動確定しない・既定 0＝欠損時）。実行器（cron／RPC）は別起票＝ここは設定の器だけ
  if p_patch ? 'shift_auto_confirm_hours' then                                                             -- ★3 0172
    if jsonb_typeof(p_patch->'shift_auto_confirm_hours') <> 'number' then raise exception 'bad type'; end if;   -- ★3 0172
    v_autoh := (p_patch->>'shift_auto_confirm_hours')::numeric;                                            -- ★3 0172
    if v_autoh <> floor(v_autoh) or v_autoh < 0 or v_autoh > 168 then raise exception 'bad shift_auto_confirm_hours'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('shift_auto_confirm_hours', coalesce((v_settings->>'shift_auto_confirm_hours')::numeric, 0));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('shift_auto_confirm_hours', v_autoh::int);                -- ★3 0172
    v_settings := jsonb_set(v_settings, '{shift_auto_confirm_hours}', to_jsonb(v_autoh::int), true);       -- ★3 0172
  end if;                                                                                                  -- ★3 0172

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    invoice_registered_on = case when p_patch ? 'invoice_registered_on' then v_inv_on  else invoice_registered_on end,   -- ★2 0164
    pay_day            = case when p_patch ? 'pay_day'            then v_pay_day::int else pay_day end,                   -- ★2 0164
    tax_inclusive_display = case when p_patch ? 'tax_inclusive_display' then v_tax_inc else tax_inclusive_display end,   -- ★2 0164
    use_vip            = case when p_patch ? 'use_vip'            then v_use_vip else use_vip end,                        -- ★2 0164
    use_counter        = case when p_patch ? 'use_counter'        then v_use_ctr else use_counter end,                    -- ★2 0164
    payment_methods    = case when p_patch ? 'payment_methods'    then v_paym    else payment_methods end,                -- ★2 0164
    punch_methods      = case when p_patch ? 'punch_methods'      then v_punch   else punch_methods end,                  -- ★2 0164
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- ═══ ★4 利用規約の同意（裁定351）
create table if not exists public.terms_acceptances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  terms_version text not null,
  accepted_at   timestamptz not null default now(),
  accepted_by   uuid not null references public.users(id),
  unique (org_id, terms_version)
);
alter table public.terms_acceptances enable row level security;
drop policy if exists terms_acceptances_select on public.terms_acceptances;
create policy terms_acceptances_select on public.terms_acceptances for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() = 'owner');
revoke all on table public.terms_acceptances from public, anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

create or replace function public.terms_accept(p_version text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org   uuid := public.auth_org_id();
  v_user  uuid;
  v_id    uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 同意は owner（店舗・法人単位）
  if p_version is null or length(trim(p_version)) = 0 or length(p_version) > 40 then raise exception 'bad version'; end if;
  -- billing lock は見ない＝開通前（未課金）でも同意できる（裁定351 の開通ゲート）
  select id into v_id from public.terms_acceptances where org_id = v_org and terms_version = trim(p_version);
  if v_id is not null then return v_id; end if;   -- 冪等
  select id into v_user from public.users where auth_user_id = auth.uid() and is_active;
  if v_user is null then raise exception 'forbidden'; end if;
  insert into public.terms_acceptances (org_id, terms_version, accepted_by) values (v_org, trim(p_version), v_user) returning id into v_id;
  perform public.audit_log_write('terms_accept', 'terms_acceptances:' || v_id::text, null,
    jsonb_build_object('org_id', v_org, 'terms_version', trim(p_version), 'accepted_by', v_user), null);
  return v_id;
end $function$;
revoke execute on function public.terms_accept(text) from public, anon;
grant execute on function public.terms_accept(text) to authenticated, service_role;

create or replace function public.terms_accepted_version_ok(p_version text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.auth_org_id() is null then false
    when exists (select 1 from public.orgs o where o.id = public.auth_org_id() and o.is_demo) then true   -- デモ org は除外（裁定351）
    else exists (select 1 from public.terms_acceptances t where t.org_id = public.auth_org_id() and t.terms_version = p_version)
  end;
$function$;
revoke execute on function public.terms_accepted_version_ok(text) from public, anon;
grant execute on function public.terms_accepted_version_ok(text) to authenticated, service_role;

-- ═══ ★5 スタッフの契約・打刻・給与 run（裁定355／356＝器のみ・書込 RPC は 356 確定後）
create table if not exists public.staff_contracts (
  id               uuid primary key default gen_random_uuid(),
  membership_id    uuid not null unique references public.memberships(id) on delete cascade,
  org_id           uuid not null references public.orgs(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  contract_kind    text not null default 'parttime' check (contract_kind in ('employee','parttime','contractor')),
  hourly           integer not null default 0 check (hourly >= 0),
  fixed_allowance  integer not null default 0 check (fixed_allowance >= 0),
  tax_class        text null check (tax_class in ('甲','乙')),
  withholding_rate numeric not null default 0 check (withholding_rate >= 0 and withholding_rate <= 100),   -- 委託の源泉率（T11 確定まで 0）
  invoice          text null,
  reg_no           text null,
  valid_from       date null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists staff_contracts_store_idx on public.staff_contracts (store_id);
alter table public.staff_contracts enable row level security;
drop policy if exists staff_contracts_select on public.staff_contracts;
create policy staff_contracts_select on public.staff_contracts for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner'
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
              or exists (select 1 from public.memberships m join public.users u on u.id = m.user_id
                          where m.id = staff_contracts.membership_id and u.auth_user_id = auth.uid())));
revoke all on table public.staff_contracts from public, anon, authenticated;
grant select on table public.staff_contracts to authenticated;

create table if not exists public.staff_punches (
  id             uuid primary key default gen_random_uuid(),
  membership_id  uuid not null references public.memberships(id) on delete cascade,
  org_id         uuid not null references public.orgs(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  biz_date       date not null,
  kind           text not null check (kind in ('in','out')),
  punched_at     timestamptz not null default now(),
  source         text not null default 'kiosk' check (source in ('kiosk','manual')),
  created_by     uuid null references public.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists staff_punches_store_date_idx on public.staff_punches (store_id, biz_date);
create index if not exists staff_punches_membership_date_idx on public.staff_punches (membership_id, biz_date);
alter table public.staff_punches enable row level security;
drop policy if exists staff_punches_select on public.staff_punches;
create policy staff_punches_select on public.staff_punches for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner'
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
              or exists (select 1 from public.memberships m join public.users u on u.id = m.user_id
                          where m.id = staff_punches.membership_id and u.auth_user_id = auth.uid())));
revoke all on table public.staff_punches from public, anon, authenticated;
grant select on table public.staff_punches to authenticated;

create table if not exists public.staff_payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  period        text not null,
  period_start  date null,
  period_end    date null,
  status        text not null default 'open' check (status in ('open','finalized','paid')),
  finalized_at  timestamptz null,
  paid_at       timestamptz null,
  created_at    timestamptz not null default now(),
  unique (store_id, period)
);
alter table public.staff_payroll_runs enable row level security;
drop policy if exists staff_payroll_runs_select on public.staff_payroll_runs;
create policy staff_payroll_runs_select on public.staff_payroll_runs for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and store_id = public.auth_store_id())));
revoke all on table public.staff_payroll_runs from public, anon, authenticated;
grant select on table public.staff_payroll_runs to authenticated;

-- ═══ ★6 memberships の電話・LINE ID（裁定381）＋staff_create／staff_update_profile
alter table public.memberships add column if not exists tel text null;
alter table public.memberships add column if not exists line_id text null;

drop function if exists public.staff_create(uuid, text, text, uuid, text);   -- ★6 0172: 5 引数版（overload 罠）
CREATE OR REPLACE FUNCTION public.staff_create(p_auth_user_id uuid, p_email text, p_name text, p_store_id uuid, p_role text, p_tel text DEFAULT NULL::text, p_line_id text DEFAULT NULL::text)   -- ★6 0172（裁定381）: +電話・LINE ID
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_email    text;
  v_new_org  uuid;
  v_user     public.users;
  v_user_id  uuid;
  v_existing public.memberships;
  v_result   uuid;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 入力検証（route でも検証するが RPC でも二重に守る）
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  -- ★6 0172（裁定381）: メール無し登録＝合成 email（route の syntheticEmail と同形・送信不能予約ドメイン）。実 email は従来どおり検証
  if p_email is null or length(trim(p_email)) = 0 then
    p_email := 's-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) || '@o-' || substr(replace(v_org::text, '-', ''), 1, 8) || '.nox.local';
  end if;
  if length(p_email) > 255 then raise exception 'bad email'; end if;
  if p_tel is not null and length(trim(p_tel)) > 30 then raise exception 'bad tel'; end if;           -- ★6 0172
  if p_line_id is not null and length(trim(p_line_id)) > 40 then raise exception 'bad line_id'; end if;   -- ★6 0172
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_role not in ('staff','manager') then raise exception 'bad role'; end if;
  v_email := lower(trim(p_email));  -- 【12】正規化（auth 側の小文字化保存と揃える）

  -- 配属先 store が同一 org であること（越境封じ・stores 経由で org 照合・他 org は invalid store）
  select org_id into v_new_org from public.stores where id = p_store_id;
  if v_new_org is null or v_new_org <> v_org then raise exception 'invalid store'; end if;

  -- 権限差: owner=org 全店 staff/manager 作成可 / manager=自店 staff のみ作成可（論点3）
  if v_role = 'owner' then
    null;  -- owner は staff/manager どちらも org 内全店に作成可
  elsif v_role = 'manager' then
    if p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;  -- 自店のみ
    if p_role <> 'staff' then raise exception 'forbidden'; end if;                     -- manager は staff のみ（同格増殖封じ）
  else
    raise exception 'forbidden';  -- staff/cast は追加不可
  end if;

  -- ★既存 user 判定（UNIQUE(org_id, email) users レベル・確定D）。lower 比較（【12】）。
  select u.* into v_user
  from public.users u
  where u.org_id = v_org and lower(u.email) = v_email;

  if not found then
    -- 新規 user（通常ケース）: users INSERT（auth_user_id は route が生成したもの・
    -- 重複 auth uid は UNIQUE(auth_user_id) が 23505 で物理拒否＝【13】）
    insert into public.users (org_id, email, name, auth_user_id)
    values (v_org, v_email, trim(p_name), p_auth_user_id)
    returning id into v_user_id;
  else
    -- 既存 user（同 org 同 email）: users は作らない・名前/auth_user_id は上書きしない（【4】）
    v_user_id := v_user.id;
    -- 【11】inactive user は明示拒否（active membership を足しても auth ヘルパーが倒れたまま）
    if not v_user.is_active then raise exception 'inactive user'; end if;
    -- 【10】cast/owner 人材への staff/manager 追加付与を封じる
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.role not in ('staff','manager')
    ) then
      raise exception 'bad target';
    end if;
  end if;

  -- membership の出戻り分岐（UNIQUE(user_id, store_id) は active/inactive 問わず効く・Q-1 と同型）
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_user_id and m.store_id = p_store_id;

  if found then
    -- 【9】cast/owner 行の役職転換復帰を封じる（通常【10】が先に捕捉＝二重防御）
    if v_existing.role not in ('staff','manager') then raise exception 'bad target'; end if;
    -- 既存行あり: active なら重複追加＝拒否
    if v_existing.is_active then raise exception 'already member'; end if;
    -- ★1ユーザー1アクティブ: 他店に active があれば追加不可（先に異動/解除が要る）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.is_active
    ) then
      raise exception 'already active elsewhere';
    end if;
    -- 出戻り reactivate（フラグは既存値を維持＝Q-1 transfer と同じ・role は今回指定値）
    update public.memberships
       set is_active = true, role = p_role,
           tel = coalesce(nullif(trim(p_tel), ''), tel), line_id = coalesce(nullif(trim(p_line_id), ''), line_id)   -- ★6 0172: 指定があれば上書き
     where id = v_existing.id
     returning id into v_result;
  else
    -- ★1ユーザー1アクティブ: 既存 user が他店に active を持つなら新規 membership 追加不可
    --  （完全新規 user はここに来た時点で membership 0行＝素通り。二重防御は部分ユニーク index）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.is_active
    ) then
      raise exception 'already active elsewhere';
    end if;
    -- 新規 membership INSERT（フラグ default false = fail-closed・【6】）
    insert into public.memberships (user_id, store_id, role, is_active, tel, line_id)   -- ★6 0172
    values (v_user_id, p_store_id, p_role, true, nullif(trim(p_tel), ''), nullif(trim(p_line_id), ''))
    returning id into v_result;
  end if;

  -- audit（規約6・新規作成なので after のみ意味・before は生成情報の疑似 jsonb・【7】）
  perform public.audit_log_write('staff_create', 'memberships:' || v_result::text,
    jsonb_build_object('user_id', v_user_id, 'email', v_email, 'role', p_role, 'created', true),
    (select to_jsonb(m) from public.memberships m where m.id = v_result),
    p_store_id);

  return v_result;
end $function$;
revoke execute on function public.staff_create(uuid, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.staff_create(uuid, text, text, uuid, text, text, text) to authenticated, service_role;

drop function if exists public.staff_update_profile(uuid, text);   -- ★6 0172: 2 引数版（overload 罠）
CREATE OR REPLACE FUNCTION public.staff_update_profile(p_membership_id uuid, p_name text, p_tel text DEFAULT NULL::text, p_line_id text DEFAULT NULL::text)   -- ★6 0172（裁定381）: null＝変更なし・''＝消す
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_row      public.memberships;
  v_old_name text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_tel is not null and length(trim(p_tel)) > 30 then raise exception 'bad tel'; end if;           -- ★6 0172
  if p_line_id is not null and length(trim(p_line_id)) > 40 then raise exception 'bad line_id'; end if;   -- ★6 0172

  -- 対象 membership を org 照合（stores join・memberships に org_id 列なし）
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- audit の old は UPDATE 前に確保（規約6・束2 customer_update 同型）
  select name into v_old_name from public.users where id = v_row.user_id;

  update public.users set name = trim(p_name) where id = v_row.user_id;
  update public.memberships set tel = case when p_tel is null then tel else nullif(trim(p_tel), '') end,   -- ★6 0172
                                line_id = case when p_line_id is null then line_id else nullif(trim(p_line_id), '') end
   where id = p_membership_id;

  perform public.audit_log_write('staff_update_profile', 'memberships:' || p_membership_id::text,
    jsonb_build_object('user_id', v_row.user_id, 'old_name', v_old_name, 'old_tel', v_row.tel, 'old_line_id', v_row.line_id),   -- ★6 0172
    jsonb_build_object('user_id', v_row.user_id, 'new_name', trim(p_name), 'tel', p_tel, 'line_id', p_line_id),   -- ★6 0172
    v_row.store_id);
end $function$;
revoke execute on function public.staff_update_profile(uuid, text, text, text) from public, anon;
grant execute on function public.staff_update_profile(uuid, text, text, text) to authenticated, service_role;

commit;
-- ===== end 0172 =====
