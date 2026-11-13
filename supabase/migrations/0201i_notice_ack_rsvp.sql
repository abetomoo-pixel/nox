-- 0201i_notice_ack_rsvp.sql（2026-11-12・裁定486＋追補＝お知らせの「確認しました」と出欠・貼らない＝合図は相談役）
-- ★2026-11-13 夕 直し（相談役）: notice_audience_has のスタッフの条件から 'cast' を外した（キャスト宛のお知らせでスタッフは確認する側に入らない・notices_select は変えない＝スタッフはキャスト宛も読める）
-- ★1 notices に 4 列＝rsvp（出欠を取る）・rsvp_at（日時）・rsvp_place（場所・任意・120 字まで）・rsvp_due（回答の締切・任意・日時以前）＋check 1 本
-- ★2 新しい表 notice_responses（確認と出欠を 1 行に）＝PK (notice_id, subject_kind, subject_id)・subject_kind 'cast'（casts.id）｜'membership'（memberships.id）
--     標準型＝create → 索引 → RLS（select 1 本＝本人の行／owner は org／manager は自店）→ revoke all from public, anon, authenticated → grant select to authenticated
-- ★3 notice_audience_has（内部・4 ロール revoke）＝「この人はこのお知らせの宛先か」＝notices_select（0200）の RLS と同じ式（キャストの腕・スタッフの腕＝all／cast／staff と targets の本人）
--     ＋manager は targets の staff_ids に入っているときだけ（作る側＝区分のお知らせでは確認する側に入れない）・owner は入れない。区分＝いま在籍の人・targets＝作成時の人（配列で固定）
-- ★4 notice_ack（本人・非ゲート）＝「確認しました」＝acked_at を初回だけ・冪等・audit は初回だけ
-- ★5 notice_rsvp（本人・非ゲート）＝'yes'／'no'・押すと acked_at も付く・締切（無ければ開催の日時）を過ぎたら 'rsvp closed'・答えの変更は締切まで・同じ答えの再送は何もしない・audit は変わったときだけ
-- ★6 notice_set_rsvp（owner／自店の manager・課金ゲート＝notice_create と同じ）＝作成の後に出欠の設定（notice_create の署名は変えない）・OFF は回答 0 件のときだけ
-- ★7 notice_response_status（owner／自店の manager・読取）＝宛先の母集合 × 回答＝人ごとの 1 行（区分・id・名前・在籍・確認・出欠）
-- ★8 demo_org_reset＝c_wipe の先頭と c_load の notices の後に notice_responses（c_load 84→85・c_wipe 91→92）
-- 既存の cast_notice_reads・notice_mark_read は残す（読むのをやめるのは client 便）。出欠は勤怠・給与につなげない。本人のシフトのカレンダーは RLS で読む（notices の 4 列＋notice_responses の本人の行）。
-- 数＝関数 +5（新設 5・作り直し 1）・表 +1（notice_responses）・notices の列 +4。ほかの未適用の mig（0201c／0201h／0201e／0201g）は notice 系と demo_org_reset に触れない（0201f は未起草＝貼る前に確かめる）。
-- 翻訳元: live pg_get_functiondef（2026-11-12・demo_org_reset md5 f3a12f49＝0200b 適用後）＋生成器 docs/tmp/gen_0201i.cjs（アンカー 2 か所）・notices_select（0200）・notice_mark_read（0200 版 md5 0fbc1d2b）・notice_update（md5 631e1388）。
-- 検証クエリ: docs/tmp/0201i_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
begin;
set local lock_timeout = '10s';
-- ═══ ★1 notices の 4 列 ═══
alter table public.notices add column rsvp boolean not null default false;
alter table public.notices add column rsvp_at timestamptz;
alter table public.notices add column rsvp_place text;
alter table public.notices add column rsvp_due timestamptz;
alter table public.notices add constraint notices_rsvp_ck check (
  (rsvp = false and rsvp_at is null and rsvp_place is null and rsvp_due is null)
  or (rsvp = true and rsvp_at is not null and (rsvp_due is null or rsvp_due <= rsvp_at)
      and (rsvp_place is null or char_length(rsvp_place) between 1 and 120)));
comment on column public.notices.rsvp is '★0201i（裁定486）: 出欠を取るお知らせ。true のとき rsvp_at 必須';
comment on column public.notices.rsvp_at is '★0201i（裁定486）: 出欠を取る予定の日時（本人のシフトのカレンダーにも出す）。締切が無いときはこの日時まで回答を変えられる';
comment on column public.notices.rsvp_place is '★0201i（裁定486）: 場所（任意・120 字まで）';
comment on column public.notices.rsvp_due is '★0201i（裁定486）: 回答の締切（任意・rsvp_at 以前）。過ぎたら notice_rsvp は rsvp closed';

-- ═══ ★2 notice_responses ═══
create table public.notice_responses (
  notice_id       uuid not null references public.notices(id) on delete cascade,
  subject_kind    text not null check (subject_kind in ('cast','membership')),
  subject_id      uuid not null,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  store_id        uuid not null references public.stores(id) on delete cascade,
  acked_at        timestamptz not null default now(),
  rsvp            text check (rsvp in ('yes','no')),
  rsvp_updated_at timestamptz,
  primary key (notice_id, subject_kind, subject_id),
  constraint notice_responses_rsvp_ck check ((rsvp is null) = (rsvp_updated_at is null))
);
comment on table public.notice_responses is '★0201i（裁定486）: お知らせの「確認しました」（acked_at）と出欠（rsvp）。本人＝cast は casts.id・スタッフと店長は memberships.id。書くのは notice_ack／notice_rsvp だけ';
create index notice_responses_subject_idx on public.notice_responses (subject_kind, subject_id);
create index notice_responses_store_idx on public.notice_responses (store_id);
alter table public.notice_responses enable row level security;
create policy notice_responses_select on public.notice_responses for select to authenticated
  using (org_id = public.auth_org_id() and (
    (subject_kind = 'cast' and subject_id = public.auth_cast_id())
    or (subject_kind = 'membership' and subject_id = public.auth_membership_id())
    or public.auth_role() = 'owner'
    or (public.auth_role() = 'manager' and store_id = public.auth_store_id())));
revoke all on table public.notice_responses from public, anon, authenticated;
grant select on table public.notice_responses to authenticated;

-- ═══ ★3 notice_audience_has（内部専用）═══
create or replace function public.notice_audience_has(p_notice_id uuid, p_kind text, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  -- ★0201i（裁定486）: 宛先の判定＝notices_select（0200）の RLS と同じ式。区分（all／cast／staff）＝いま在籍の人・targets＝作成時の配列（在籍を問わない）。
  --   キャストの腕＝all／cast は cast_ids が null か本人を含むとき・targets は cast_ids に本人。スタッフの腕＝all／cast／staff と targets の staff_ids に本人。
  --   manager は targets の staff_ids に入っているときだけ（区分のお知らせでは作る側）・owner は入れない。org 条件は自ら含める（再利用の集計ヘルパー＝CLAUDE.md 原則8）。
  select exists (
    select 1 from public.notices n
     where n.id = p_notice_id
       and ((p_kind = 'cast' and exists (
              select 1 from public.casts c
               where c.id = p_subject_id and c.org_id = n.org_id and c.store_id = n.store_id
                 and ((n.audience in ('all','cast') and c.is_active and (n.cast_ids is null or c.id = any(n.cast_ids)))
                      or (n.audience = 'targets' and n.cast_ids is not null and c.id = any(n.cast_ids)))))
         or (p_kind = 'membership' and exists (
              select 1 from public.memberships m join public.stores s on s.id = m.store_id
               where m.id = p_subject_id and m.store_id = n.store_id and s.org_id = n.org_id
                 and ((m.role = 'staff' and m.is_active and n.audience in ('all','staff'))
                      or (m.role in ('staff','manager') and n.audience = 'targets' and n.staff_ids is not null and m.id = any(n.staff_ids)))))))
$function$;
revoke execute on function public.notice_audience_has(uuid, text, uuid) from public, anon, authenticated, service_role;

-- ═══ ★4 notice_ack（本人・非ゲート）═══
create or replace function public.notice_ack(p_notice_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_kind text;
  v_sid  uuid;
  v_n    record;
  v_at   timestamptz;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  -- ★0201i（裁定486）: 本人＝キャストは casts.id・スタッフと店長は memberships.id（owner は確認する側に入れない）
  if v_role = 'cast' then v_kind := 'cast'; v_sid := public.auth_cast_id();
  elsif v_role in ('staff','manager') then v_kind := 'membership'; v_sid := public.auth_membership_id();
  else raise exception 'forbidden'; end if;
  if v_sid is null then raise exception 'forbidden'; end if;
  select n.id, n.org_id, n.store_id into v_n from public.notices n where n.id = p_notice_id;
  if v_n.id is null or v_n.org_id <> v_org then raise exception 'forbidden'; end if;   -- 存在オラクル封じ
  if not public.notice_audience_has(p_notice_id, v_kind, v_sid) then raise exception 'forbidden'; end if;   -- 宛先の外
  insert into public.notice_responses (notice_id, subject_kind, subject_id, org_id, store_id)
  values (p_notice_id, v_kind, v_sid, v_n.org_id, v_n.store_id)
  on conflict (notice_id, subject_kind, subject_id) do nothing;   -- 冪等（2 回目は何もしない・acked_at は初回のまま）
  if found then
    perform public.audit_log_write('notice_ack', 'notices:' || p_notice_id::text, null,
      jsonb_build_object('subject_kind', v_kind, 'subject_id', v_sid), v_n.store_id);
  end if;
  select r.acked_at into v_at from public.notice_responses r
   where r.notice_id = p_notice_id and r.subject_kind = v_kind and r.subject_id = v_sid;
  return v_at;
end $function$;
revoke execute on function public.notice_ack(uuid) from public, anon;
grant execute on function public.notice_ack(uuid) to authenticated;

-- ═══ ★5 notice_rsvp（本人・非ゲート）═══
create or replace function public.notice_rsvp(p_notice_id uuid, p_answer text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_kind text;
  v_sid  uuid;
  v_n    record;
  v_old  text;
  v_has  boolean;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if v_role = 'cast' then v_kind := 'cast'; v_sid := public.auth_cast_id();
  elsif v_role in ('staff','manager') then v_kind := 'membership'; v_sid := public.auth_membership_id();
  else raise exception 'forbidden'; end if;
  if v_sid is null then raise exception 'forbidden'; end if;
  select n.id, n.org_id, n.store_id, n.rsvp, n.rsvp_at, n.rsvp_due into v_n from public.notices n where n.id = p_notice_id;
  if v_n.id is null or v_n.org_id <> v_org then raise exception 'forbidden'; end if;
  if not public.notice_audience_has(p_notice_id, v_kind, v_sid) then raise exception 'forbidden'; end if;
  if not v_n.rsvp then raise exception 'not rsvp'; end if;
  if p_answer is null or p_answer not in ('yes','no') then raise exception 'bad answer'; end if;
  -- ★0201i（裁定486）: 回答は締切まで変えられる（締切が無いときは開催の日時まで）＝過ぎたら変えられない
  if now() > coalesce(v_n.rsvp_due, v_n.rsvp_at) then raise exception 'rsvp closed'; end if;
  select r.rsvp, true into v_old, v_has from public.notice_responses r
   where r.notice_id = p_notice_id and r.subject_kind = v_kind and r.subject_id = v_sid for update;
  if v_has and v_old is not distinct from p_answer then return p_answer; end if;   -- 同じ答えの再送は何もしない（audit も無し）
  insert into public.notice_responses (notice_id, subject_kind, subject_id, org_id, store_id, rsvp, rsvp_updated_at)
  values (p_notice_id, v_kind, v_sid, v_n.org_id, v_n.store_id, p_answer, now())
  on conflict (notice_id, subject_kind, subject_id) do update
     set rsvp = excluded.rsvp, rsvp_updated_at = excluded.rsvp_updated_at;   -- 押した時点で既読（acked_at は初回のまま・無ければ今）
  perform public.audit_log_write('notice_rsvp', 'notices:' || p_notice_id::text,
    jsonb_build_object('rsvp', v_old),
    jsonb_build_object('rsvp', p_answer, 'subject_kind', v_kind, 'subject_id', v_sid), v_n.store_id);
  return p_answer;
end $function$;
revoke execute on function public.notice_rsvp(uuid, text) from public, anon;
grant execute on function public.notice_rsvp(uuid, text) to authenticated;

-- ═══ ★6 notice_set_rsvp（owner／自店の manager・課金ゲート）═══
create or replace function public.notice_set_rsvp(p_notice_id uuid, p_on boolean, p_at timestamptz DEFAULT NULL::timestamptz, p_place text DEFAULT NULL::text, p_due timestamptz DEFAULT NULL::timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.notices; v_place text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;   -- 存在オラクル封じ
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;   -- notice_update と同じ
  if p_on is null then raise exception 'bad rsvp'; end if;   -- 原則7: boolean は UI から明示値
  if p_on then
    if v_row.audience = 'owners' then raise exception 'bad audience'; end if;
    if p_at is null then raise exception 'bad rsvp_at'; end if;
    if p_due is not null and p_due > p_at then raise exception 'bad rsvp_due'; end if;
    v_place := nullif(trim(coalesce(p_place, '')), '');
    if v_place is not null and char_length(v_place) > 120 then raise exception 'bad rsvp_place'; end if;
  else
    -- OFF は回答 0 件のときだけ（参加／不参加を押した人がいれば消さない）
    if exists (select 1 from public.notice_responses r where r.notice_id = p_notice_id and r.rsvp is not null) then raise exception 'rsvp answered'; end if;
    v_place := null;
  end if;
  update public.notices
     set rsvp = p_on,
         rsvp_at = case when p_on then p_at end,
         rsvp_place = v_place,
         rsvp_due = case when p_on then p_due end
   where id = p_notice_id;
  perform public.audit_log_write('notice_set_rsvp', 'notices:' || p_notice_id::text,
    jsonb_build_object('rsvp', v_row.rsvp, 'rsvp_at', v_row.rsvp_at, 'rsvp_place', v_row.rsvp_place, 'rsvp_due', v_row.rsvp_due),
    jsonb_build_object('rsvp', p_on, 'rsvp_at', case when p_on then p_at end, 'rsvp_place', v_place, 'rsvp_due', case when p_on then p_due end),
    v_row.store_id);
end $function$;
revoke execute on function public.notice_set_rsvp(uuid, boolean, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.notice_set_rsvp(uuid, boolean, timestamptz, text, timestamptz) to authenticated;

-- ═══ ★7 notice_response_status（owner／自店の manager・読取）═══
create or replace function public.notice_response_status(p_notice_id uuid)
returns table (subject_kind text, subject_id uuid, name text, is_active boolean, acked_at timestamptz, rsvp text, rsvp_updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_row public.notices;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  -- ★0201i（裁定486）: 母集合＝notice_audience_has が真の人（区分＝いま在籍の人・targets＝作成時の人＝退店済みも is_active=false で出す）× 回答（無ければ未確認・未回答）
  return query
  select p.k, p.id, p.nm, p.act, r.acked_at, r.rsvp, r.rsvp_updated_at
    from (select 'cast'::text k, c.id, c.name::text nm, c.is_active act
            from public.casts c
           where c.org_id = v_row.org_id and c.store_id = v_row.store_id
          union all
          select 'membership'::text, m.id, coalesce(u.name, '（名前なし）')::text, m.is_active
            from public.memberships m join public.users u on u.id = m.user_id
           where m.store_id = v_row.store_id) p
    left join public.notice_responses r
      on r.notice_id = p_notice_id and r.subject_kind = p.k and r.subject_id = p.id
   where public.notice_audience_has(p_notice_id, p.k, p.id)
   order by p.k, p.nm, p.id;
end $function$;
revoke execute on function public.notice_response_status(uuid) from public, anon;
grant execute on function public.notice_response_status(uuid) to authenticated;

-- ═══ ★8 demo_org_reset（c_wipe／c_load に notice_responses）═══
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    -- ★0201i（2026-11-12・裁定486）: お知らせの確認と出欠＝notices より先に消す（FK notice_id）
    'notice_responses',
    'staff_labor_payments','staff_labor_confirmed',   -- ★0200 ★8（裁定471）: 支払い記録 → 確定額の順（payments は confirmed より先・両方 memberships より先）＝prewipe から外す
    'cast_day_deductions','deduction_rule_casts','availability_terms','availability','register_day_grants','staff_allowances',   -- ★0198 ★5: 0195／0175 v2／0197 の表＝deductions・memberships・casts より先に消す（payload には無い＝load 一覧は不変）
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_notice_reads','cast_pin','cast_plan',   -- ★8 0160（326-9）: +cast_notice_reads（casts・notices より先に消す）
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','payroll_run_deduction_overrides','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_attentions','daily_pays','payroll_adjustments','payslips',   -- ★6 0159（起票92）: +3 表（overrides は deductions より先に消す＝FK deduction_id）
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','cast_contract_acks','cast_quotas','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances','memberships','stores'];   -- ★8 0160: +cast_quotas（casts より先に消す）・★5 0162: +cast_contract_acks（casts より先に消す）・★6 0174: +4 表（0172 の staff 3 表＋terms_acceptances＝memberships より先に消す・FK membership_id）
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  -- ★6 0174: +4 表（0172 の staff 3 表＋terms_acceptances＝memberships の直後に投入）
  c_load constant text[] := array[
    -- ★0200 ★8: 確定額 → 支払い記録（memberships の直後＝FK membership_id）／★0200b（2026-11-10）: このコメントを行頭へ移す（0200 は行の途中に差し込み、後ろの 12 表がコメントになっていた）
    'stores','memberships','staff_labor_confirmed','staff_labor_payments','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances',
    'referrers','cast_ranks','staff_shift_patterns','product_categories','casts','cast_quotas','cast_contract_acks','staff_shift_wishes','shift_wishes','shift_periods','seats','products',   -- ★8 0160: +cast_quotas（casts の後）・★5 0162: +cast_contract_acks（casts の後）
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
    -- ★0201i（2026-11-12・裁定486）: お知らせの確認と出欠＝notices・casts・memberships の後に投入
    'notice_responses',
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_notice_reads','cast_norms',   -- ★8 0160: +cast_notice_reads（casts・notices の後）
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
  v_cols     text;   -- ★7 0175（起票117）: payload に実在する列だけを列指定で insert
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        -- ★7 0175（起票117・E-20 と対）: jsonb_populate_recordset は列の既定値を使わない（無い鍵＝null）。payload の鍵 ∩ 表の列だけを列指定で insert＝無い列は表の既定値で埋まる
        select string_agg(format('%I', ks.k), ', ') into v_cols
          from (select distinct jsonb_object_keys(e) as k from jsonb_array_elements(p_payload->v_t) e) ks
          join information_schema.columns ic on ic.table_schema = 'public' and ic.table_name = v_t and ic.column_name = ks.k;
        if v_cols is null then raise exception 'bad payload'; end if;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_cols, v_cols, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;
commit;
