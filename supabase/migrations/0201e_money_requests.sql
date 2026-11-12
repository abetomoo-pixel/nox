-- 0201e_money_requests.sql（相談役 2026-11-11 の案 2＝お金と申請・貼らない＝合図は相談役）
-- 翻訳元: 本番の pg_get_functiondef とポリシー（0201 適用後・docs/tmp/dump_live0201e.mjs）＋生成器 docs/tmp/gen_0201e.cjs（既存はアンカー置換・行の途中にコメントを入れない＝教訓138）
-- 検証クエリ: docs/tmp/0201e_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- 前提＝0201b と 0201c の後（どちらとも関数が重ならない＝set_store_profile／set_store_receivable_policy／set_cast_sensitive／set_product 系は触らない）。
-- 関数 431 → 437（新設 6＝set_cast_close・auth_cast_register_active・auth_cast_close_ok・drink_claim_withdraw・reservation_withdraw・staff_my_work／作り直し 3＝daily_report_close・report_can_close・withholding_monthly_summary）・表 121 不変・列 memberships +1・ポリシー 6 本の作り直し・データ punches の lat／lng を null。
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 memberships.cast_can_close（裁定481＝キャストの日報の締めの許可・既定 false＝店が改めて許可するまで締められない） ═══
alter table public.memberships add column if not exists cast_can_close boolean not null default false;
comment on column public.memberships.cast_can_close is '★0201e（裁定481）: キャストの日報の締めの許可（キャストの行だけ意味を持つ・スタッフの can_close＝再締め・差異の承認とは別の列）';

-- ═══ ★2 set_cast_close（オーナーと自店の店長・キャストの行だけ・監査） ═══
create or replace function public.set_cast_close(p_membership_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := public.auth_org_id(); v_m record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_membership_id is null or p_on is null then raise exception 'bad args'; end if;
  select m.id, m.store_id, m.role, m.cast_can_close, s.org_id into v_m from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_m.id is null or v_m.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_m.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if v_m.role <> 'cast' then raise exception 'not a cast'; end if;
  update public.memberships set cast_can_close = p_on, updated_at = now() where id = p_membership_id;
  perform public.audit_log_write('set_cast_close', 'memberships:' || p_membership_id::text, jsonb_build_object('cast_can_close', v_m.cast_can_close), jsonb_build_object('cast_can_close', p_on), v_m.store_id);
end $function$;
revoke execute on function public.set_cast_close(uuid, boolean) from public, anon;
grant execute on function public.set_cast_close(uuid, boolean) to authenticated;

-- ═══ ★3 auth_cast_register_active（キャストのレジ ∧ 出勤中＝伝票の読取の判定・案 B）／auth_cast_close_ok（＋締めの許可） ═══
create or replace function public.auth_cast_register_active()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- ★0201e ★3（相談役 11/11 の 4＝案 B）: 退勤後のキャストは伝票を読めない＝レジの許可（auth_cast_can_register）∧ 今日の営業日に出勤中（on_duty_of＝打刻する店は最後が in・打刻しない店は確定シフトの窓）
  select coalesce(public.auth_cast_can_register()
    and public.on_duty_of('cast', public.auth_cast_id(), public.auth_store_id(), public.biz_date_of(public.auth_store_id(), now())), false)
$function$;
revoke execute on function public.auth_cast_register_active() from public, anon;
grant execute on function public.auth_cast_register_active() to authenticated;

create or replace function public.auth_cast_close_ok(p_store_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- ★0201e ★3（裁定481）: キャストの締め＝自店 ∧ 締めの許可（memberships.cast_can_close）∧ レジの許可 ∧ 出勤中
  select coalesce(p_store_id = public.auth_store_id()
    and exists (select 1 from public.memberships m where m.id = public.auth_membership_id() and m.is_active and m.role = 'cast' and m.cast_can_close)
    and public.auth_cast_register_active(), false)
$function$;
revoke execute on function public.auth_cast_close_ok(uuid) from public, anon;
grant execute on function public.auth_cast_close_ok(uuid) to authenticated;

-- ═══ ★4 daily_report_close（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.daily_report_close(p_store_id uuid, p_biz_date date, p_expense integer DEFAULT 0, p_cash_payout integer DEFAULT 0, p_cash_float integer DEFAULT 0, p_counted_cash integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int; v_ar int;
  v_ar_card int; v_ar_other int;  -- ★D45
  v_refcash int := 0;  -- ★17 0152（裁定298-10）: 当日現金払いの紹介料（渡した額＝amount−withholding）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if coalesce(p_expense, -1) < 0 or coalesce(p_cash_payout, -1) < 0 or coalesce(p_cash_float, -1) < 0 then
    raise exception 'bad amount';
  end if;
  if p_counted_cash is not null and p_counted_cash < 0 then raise exception 'bad amount'; end if;
  -- E1 mig0051: 税率は stores.card_tax_rate 列読み（列 CHECK 0..100 が構造保証・既定 5 は列 default と同値）
  select org_id, settings_json, card_tax_rate into v_owner, v_settings, v_rate
    from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'cast' and p_store_id = public.auth_store_id() and public.auth_cast_close_ok(p_store_id))) then
    -- ★0201e ★4（裁定481）: キャストは「締めの許可（cast_can_close）∧ レジの許可 ∧ 出勤中」だけ（auth_cast_close_ok）
    raise exception 'forbidden';
  end if;
  -- ★0201e ★4（裁定481・相談役 11/11 の 9）: キャストが締められるのは今日の営業日だけ（営業日の区切りを過ぎた前日分は店長が締める）
  if public.auth_role() = 'cast' and p_biz_date <> public.biz_date_of(p_store_id, now()) then raise exception 'biz date passed'; end if;

  -- 冪等: 同一 (store, biz_date) の既存行＝同一キーなら成功・別キーは reclose を促す
  select * into v_exist from public.daily_reports
    where store_id = p_store_id and biz_date = p_biz_date;
  if v_exist.id is not null then
    if p_idem_key is not null and v_exist.close_idem_key = p_idem_key then return v_exist.id; end if;
    raise exception 'already closed';
  end if;

  -- 設定スナップショット（cutoff 既定 06:00＝json のまま／税率＝列読み・raise は防御深度で残置）
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_rate < 0 then
    raise exception 'bad store settings';
  end if;

  v_agg := public.daily_report_aggregate(p_store_id, p_biz_date, v_cutoff, v_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45
  -- ★17 0152（裁定298-10）: paid_via 'cash_daily' の紹介料＝支払日時の営業日で集計（渡した額＝amount−withholding）
  select coalesce(sum(amount - withholding), 0)::int into v_refcash
    from public.referral_payouts
   where store_id = p_store_id and status = 'paid' and paid_via = 'cash_daily'
     and public.biz_date_of(p_store_id, paid_at) = p_biz_date;

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  --   ★D45: card/other 回収は理論在高に加算しない（式不変）。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0) - v_refcash) end;   -- ★17 0152（要裁定(1)）: 紹介料の当日現金払いはドロワーから出た額

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
     ar_collected_card, ar_collected_other,  -- ★D45
     referral_cash_payout,  -- ★17 0152（0173: 末尾 ')' → ','）
     set_ext_nom, products, pay_fee_total, closed_by_membership)  -- ★4／★6／★3 0173（裁定391／393／389）
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor,
     v_ar_card, v_ar_other,  -- ★D45
     v_refcash,  -- ★17 0152（0173: 末尾 ')' → ','）
     (v_agg->>'set_ext_nom')::int, (v_agg->>'products')::int, (v_agg->>'pay_fee_total')::int, public.auth_membership_id())  -- ★4／★6／★3 0173
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ═══ ★4 report_can_close（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.report_can_close(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (public.auth_role() = 'owner'
       and exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = public.auth_org_id()))
    or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
    or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_close())
    or (public.auth_role() = 'cast' and p_store_id = public.auth_store_id() and public.auth_cast_close_ok(p_store_id)),   -- ★3 0173（裁定389）: ON のキャストは日次の締め（close だけ＝reclose／cash_diff_approve は呼び元で cast 拒否）
    false)
$function$;

-- ═══ ★5 伝票系 6 ポリシー（キャストの枝だけ auth_cast_register_active に・スタッフと店長以上は今のまま） ═══
drop policy if exists bottle_keeps_select on public.bottle_keeps;
create policy bottle_keeps_select on public.bottle_keeps for select to authenticated
  using (((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND ((auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((auth_role() = 'staff'::text) AND auth_staff_can_register()) OR ((auth_role() = 'cast'::text) AND auth_cast_register_active()))));
drop policy if exists check_lines_select on public.check_lines;
create policy check_lines_select on public.check_lines for select to authenticated
  using (((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND ((auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((auth_role() = 'staff'::text) AND auth_staff_can_register()) OR ((auth_role() = 'cast'::text) AND auth_cast_register_active() AND auth_cast_check_allowed(check_id)))));
drop policy if exists check_nominations_select on public.check_nominations;
create policy check_nominations_select on public.check_nominations for select to authenticated
  using (((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND ((auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((auth_role() = 'staff'::text) AND auth_staff_can_register()) OR ((auth_role() = 'cast'::text) AND auth_cast_register_active() AND auth_cast_check_allowed(check_id)))));
drop policy if exists check_seats_select on public.check_seats;
create policy check_seats_select on public.check_seats for select to public
  using (((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND ((auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((auth_role() = 'staff'::text) AND auth_staff_can_register()) OR ((auth_role() = 'cast'::text) AND auth_cast_register_active()))));
drop policy if exists checks_select on public.checks;
create policy checks_select on public.checks for select to authenticated
  using (((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND ((auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((auth_role() = 'staff'::text) AND auth_staff_can_register()) OR ((auth_role() = 'cast'::text) AND auth_cast_register_active() AND auth_cast_check_allowed(id)))));
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND ((auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((auth_role() = 'staff'::text) AND auth_staff_can_register()) OR ((auth_role() = 'cast'::text) AND auth_cast_register_active()))));

-- ═══ ★6 本人の取り下げ（M-164＝本人の行だけ・承認前（pending）だけ・状態は今ある値（void／cancelled）・監査・一覧に残る） ═══
create or replace function public.drink_claim_withdraw(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cid uuid := public.auth_cast_id(); v_cl record;
begin
  if public.auth_org_id() is null or v_cid is null then raise exception 'forbidden'; end if;
  if p_claim_id is null then raise exception 'bad args'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id for update;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() or v_cl.cast_id <> v_cid then raise exception 'forbidden'; end if;
  if v_cl.status <> 'pending' then raise exception 'not pending'; end if;
  update public.drink_claims set status = 'void', voided_by = (select u.id from public.users u where u.auth_user_id = auth.uid()), voided_at = now() where id = p_claim_id;
  perform public.audit_log_write('drink_claim_withdraw', 'drink_claims:' || p_claim_id::text, jsonb_build_object('status', v_cl.status), jsonb_build_object('status', 'void', 'by', 'self'), v_cl.store_id);
end $function$;
revoke execute on function public.drink_claim_withdraw(uuid) from public, anon;
grant execute on function public.drink_claim_withdraw(uuid) to authenticated;

create or replace function public.reservation_withdraw(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cid uuid := public.auth_cast_id(); v_r record;
begin
  if public.auth_org_id() is null or v_cid is null then raise exception 'forbidden'; end if;
  if p_reservation_id is null then raise exception 'bad args'; end if;
  select * into v_r from public.reservations where id = p_reservation_id for update;
  if v_r.id is null or v_r.org_id <> public.auth_org_id() or v_r.cast_id is distinct from v_cid or v_r.requested_by_cast is distinct from v_cid then raise exception 'forbidden'; end if;
  if v_r.status <> 'pending' then raise exception 'not pending'; end if;
  update public.reservations set status = 'cancelled', updated_at = now() where id = p_reservation_id;
  perform public.audit_log_write('reservation_withdraw', 'reservations:' || p_reservation_id::text, jsonb_build_object('status', v_r.status), jsonb_build_object('status', 'cancelled', 'by', 'self'), v_r.store_id);
end $function$;
revoke execute on function public.reservation_withdraw(uuid) from public, anon;
grant execute on function public.reservation_withdraw(uuid) to authenticated;

-- ═══ ★7 staff_my_work（スタッフと店長の本人の分だけ＝M-178・★1。読取＝監査なし（本人の自分の値）。金額は client の今の計算（lib）で出す＝SQL に給与の式を持たない） ═══
--   店の端末の本人セッション中（kiosk_person_active_of）は金額の項目（時給・手当・確定額・支払い）を返さない＝裁定435「給与は端末に出さない」・本人単位の判定（相談役 11/11 の 5＝安全側）。
create or replace function public.staff_my_work(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_mid uuid := public.auth_membership_id(); v_m record; v_hide boolean;
begin
  if public.auth_org_id() is null or v_mid is null then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'bad range'; end if;
  select m.id, m.store_id, m.role into v_m from public.memberships m where m.id = v_mid and m.is_active;
  if v_m.id is null or v_m.role not in ('manager', 'staff') then raise exception 'forbidden'; end if;
  v_hide := coalesce(public.kiosk_person_active_of(v_mid), false);
  return jsonb_build_object(
    'membership_id', v_mid,
    'amounts_hidden', v_hide,
    'contract', (select case when v_hide then jsonb_build_object('contract_kind', c.contract_kind, 'pay_kind', c.pay_kind, 'valid_from', c.valid_from)
                             else to_jsonb(c) - 'org_id' - 'store_id' - 'reg_no' end
                   from public.staff_contracts c where c.membership_id = v_mid),
    'punches', coalesce((select jsonb_agg(jsonb_build_object('biz_date', p.biz_date, 'kind', p.kind, 'punched_at', p.punched_at) order by p.punched_at)
                           from public.staff_punches p where p.membership_id = v_mid and p.biz_date between p_from and p_to), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('biz_date', a.biz_date, 'status', a.status) order by a.biz_date)
                              from public.staff_attendance_days a where a.membership_id = v_mid and a.biz_date between p_from and p_to), '[]'::jsonb),
    'allowances', case when v_hide then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('name', al.name, 'amount', al.amount) order by al.sort)
                              from public.staff_allowances al where al.membership_id = v_mid and al.is_active), '[]'::jsonb) end,
    'confirmed', coalesce((select jsonb_agg(case when v_hide then jsonb_build_object('period', lc.period, 'minutes', lc.minutes, 'days', lc.days, 'confirmed_at', lc.confirmed_at)
                                                 else to_jsonb(lc) - 'org_id' - 'store_id' - 'confirmed_by' end order by lc.period)
                             from public.staff_labor_confirmed lc where lc.membership_id = v_mid and lc.period between to_char(p_from, 'YYYY-MM') and to_char(p_to, 'YYYY-MM')), '[]'::jsonb),
    -- 本人の支払済み＝その月の店の支払いの記録があるか（金額・人数は返さない＝店全体の合計を見せない）。端末では返さない。
    'paid_periods', case when v_hide then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('period', lp.period, 'paid_on', lp.paid_on, 'method', lp.method) order by lp.period)
                              from public.staff_labor_payments lp where lp.store_id = v_m.store_id and lp.period between to_char(p_from, 'YYYY-MM') and to_char(p_to, 'YYYY-MM')
                                and exists (select 1 from public.staff_labor_confirmed lc where lc.membership_id = v_mid and lc.period = lp.period)), '[]'::jsonb) end
  );
end $function$;
revoke execute on function public.staff_my_work(date, date) from public, anon;
grant execute on function public.staff_my_work(date, date) to authenticated;

-- ═══ ★8 withholding_monthly_summary（同じ署名・ACL 不変＝日次精算の源泉を払った日の月に足す） ═══
CREATE OR REPLACE FUNCTION public.withholding_monthly_summary()
 RETURNS TABLE(target_month text, tax_category text, headcount integer, gross_total bigint, withholding_total bigint, deadline date, paid_on date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  return query
  select
    m.pay_month,
    m.cat,
    m.cnt,
    m.g,
    m.w,
    (to_date(m.pay_month || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '9 days')::date,
    wp.paid_on
  from (
    select
      x.pay_month,
      x.cat,
      sum(x.n)::integer as cnt,
      coalesce(sum(x.gross), 0)::bigint as g,
      coalesce(sum(x.wh), 0)::bigint as w
    from (
      -- ★0201e ★8（税理士の回答 ③・相談役 11/11）: 月末の残り＝支払済みにした月（今のまま）＋日次精算で引いた源泉＝実際に日払いをした日（daily_pays.biz_date）の月
      select to_char(r.paid_at at time zone 'Asia/Tokyo', 'YYYY-MM') as pay_month,
             coalesce(s.breakdown_json->'pay'->>'taxMode', '(未凍結)') as cat,
             1 as n,
             coalesce((s.breakdown_json->'pay'->>'gross')::bigint, 0) as gross,
             coalesce((s.breakdown_json->'pay'->>'withholding')::bigint, 0) as wh
        from public.payslips s
        join public.payroll_runs r on r.id = s.run_id
       where r.org_id = v_org
         and r.status = 'paid'
      union all
      -- ★0201e ★8（相談役 11/12）: 日次精算の区分＝払った時点の区分（daily_pays.withholding_category・NOT NULL・daily_pay_issue が cast_tax_profiles.mode＝委託／雇用 を書く）＝後から区分を変えても動かない
      select to_char(d.biz_date, 'YYYY-MM'),
             d.withholding_category,
             0,
             0,
             coalesce(d.withholding, 0)::bigint
        from public.daily_pays d
       where d.org_id = v_org
         and d.kind = 'settlement'
         and d.cancelled_at is null
         and coalesce(d.withholding, 0) > 0
    ) x
    group by 1, 2
  ) m
  left join public.withholding_payments wp
    on wp.org_id = v_org
   and wp.target_month = m.pay_month
   and wp.tax_category = m.cat
  order by m.pay_month desc, m.cat;
end $function$;

-- ═══ ★9 punches の座標（0201 以降は残さない・既存の行も消す＝lat／lng だけ・IP は残す＝相談役 11/11 の 6） ═══
update public.punches set lat = null, lng = null where lat is not null or lng is not null;

commit;
