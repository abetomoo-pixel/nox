-- 0200_notice_targets_staff_pay.sql（裁定470／M-129＝お知らせの「個別に選ぶ」・裁定471／M-130＝スタッフ給与の支払い済み → 経費の支払い記録）
-- 翻訳元: live pg_get_functiondef（notice_create_targets／notice_mark_read／notice_update／staff_attendance_confirm／demo_org_reset＝scratchpad/live0200・0199 適用後）＋生成器 docs/tmp/gen_0200.cjs（アンカー置換・手打ちは新設の表 1・関数 2 と policy だけ）
-- 検証クエリ: docs/tmp/0200_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- 順序＝0199（2026-11-10 適用済み）→ 0200（合図は相談役）。関数 422→424（新設 2・作り直し 5）・表 120→121（staff_labor_payments）・notices に列 1（staff_ids）・policy 1 作り直し。
-- ★1 notices: staff_ids uuid[]・audience の check に 'targets'・notices_select の作り直し（cast＝all／cast は cast_ids が null か本人・targets は本人を含むときだけ／staff＝all／cast／staff と targets の本人／manager＝owners 以外／owner＝全部）
-- ★2 notice_create_targets 6 引数（旧 4 引数は drop・ACL 再付与）★3 notice_mark_read ★4 notice_update ★5 staff_labor_payments ★6 staff_labor_mark_paid／staff_labor_unmark_paid ★7 staff_attendance_confirm（'paid period'）★8 demo_org_reset（wipe／load）
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 notices＝宛先のスタッフ（staff_ids）・audience 'targets'・RLS の作り直し ═══
alter table public.notices add column if not exists staff_ids uuid[];
comment on column public.notices.staff_ids is '★0200（裁定470）: 個別のお知らせ（audience=targets）の宛先のスタッフ＝memberships.id（manager／staff）。null＝宛先のスタッフなし。cast_ids と合わせて作成時点で固定';
comment on column public.notices.cast_ids is '宛先のキャスト（null＝audience の全員）。★0200: audience=targets の行は作成時点の宛先（本人を含む行だけ RLS で可視）';
alter table public.notices drop constraint if exists notices_audience_check;
alter table public.notices add constraint notices_audience_check check (audience in ('all','cast','staff','owners','targets'));
drop policy if exists notices_select on public.notices;
create policy notices_select on public.notices for select to authenticated
  using (
    org_id = public.auth_org_id() and store_id = public.auth_store_id()
    and case public.auth_role()
          when 'owner'   then true
          when 'manager' then audience <> 'owners'
          when 'staff'   then (audience in ('all','cast','staff') or (audience = 'targets' and staff_ids is not null and public.auth_membership_id() = any(staff_ids)))
          when 'cast'    then ((audience in ('all','cast') and (cast_ids is null or public.auth_cast_id() = any(cast_ids)))
                               or (audience = 'targets' and cast_ids is not null and public.auth_cast_id() = any(cast_ids)))
          else false
        end
  );
comment on policy notices_select on public.notices is '★0200（裁定470）: 個別（targets）は宛先に入っている本人だけ・区分は従来どおり（cast の all／cast は cast_ids が null か本人を含む行＝0176 のシフト未提出通知も RLS で絞る）・manager は owners 以外・owner は全部（自店）';

-- ═══ ★2 notice_create_targets（6 引数・旧 4 引数は drop・ACL 再付与） ═══
drop function if exists public.notice_create_targets(text, text, uuid[], date);
CREATE OR REPLACE FUNCTION public.notice_create_targets(p_title text, p_body text, p_cast_ids uuid[] DEFAULT NULL::uuid[], p_staff_ids uuid[] DEFAULT NULL::uuid[], p_pinned boolean DEFAULT false, p_until date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (e)）: 宛先つきのお知らせ＝notices.cast_ids（null＝従来の全員）。「未提出の人にお知らせを送る」。owner／manager・自店の有効なキャストだけ・1〜200 人・audit。
-- ★0200（裁定470・M-129）: 「個別に選ぶ」＝audience='targets'・宛先＝p_cast_ids（casts.id）と p_staff_ids（memberships.id＝manager／staff・自店・有効）の合計 1〜200 人・作成時点で固定（RLS と notice_mark_read が配列で判定）・p_pinned も選べる。
--   旧 4 引数（0176）は drop＝シフト画面の呼び方（p_title／p_body／p_cast_ids／p_until）は既定値で通る。
declare
  v_org uuid := public.auth_org_id();
  v_store uuid := public.auth_store_id();
  v_actor uuid; v_id uuid; v_title text; v_body text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  v_title := trim(coalesce(p_title, '')); if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, '')); if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  if coalesce(cardinality(p_cast_ids), 0) + coalesce(cardinality(p_staff_ids), 0) < 1 or coalesce(cardinality(p_cast_ids), 0) + coalesce(cardinality(p_staff_ids), 0) > 200 then raise exception 'bad targets'; end if;
  if exists (select 1 from unnest(coalesce(p_cast_ids, '{}'::uuid[])) x(id) where not exists (select 1 from public.casts c where c.id = x.id and c.org_id = v_org and c.store_id = v_store and c.is_active)) then raise exception 'bad targets'; end if;
  if exists (select 1 from unnest(coalesce(p_staff_ids, '{}'::uuid[])) x(id) where not exists (select 1 from public.memberships m where m.id = x.id and m.store_id = v_store and m.is_active and m.role in ('manager','staff'))) then raise exception 'bad targets'; end if;   -- ★0200: スタッフ＝自店の有効な manager／staff の membership
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by, cast_ids, staff_ids)
  values (v_org, v_store, v_title, v_body, 'targets', p_pinned, p_until, v_actor,
          case when coalesce(cardinality(p_cast_ids), 0) > 0 then (select array_agg(distinct x) from unnest(p_cast_ids) x) else null end,
          case when coalesce(cardinality(p_staff_ids), 0) > 0 then (select array_agg(distinct x) from unnest(p_staff_ids) x) else null end)
  returning id into v_id;
  perform public.audit_log_write('notice_create_targets', 'notices:' || v_id::text, null, jsonb_build_object('title', v_title, 'targets', coalesce(cardinality(p_cast_ids), 0) + coalesce(cardinality(p_staff_ids), 0), 'cast_targets', coalesce(cardinality(p_cast_ids), 0), 'staff_targets', coalesce(cardinality(p_staff_ids), 0), 'pinned', p_pinned, 'until', p_until), v_store);
  return v_id;
end $function$;
revoke execute on function public.notice_create_targets(text, text, uuid[], uuid[], boolean, date) from public, anon;
grant execute on function public.notice_create_targets(text, text, uuid[], uuid[], boolean, date) to authenticated;

-- ═══ ★3 notice_mark_read（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.notice_mark_read(p_notice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid := public.auth_cast_id();
  v_row  record;
  v_n    record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if v_cast is null then raise exception 'no cast for caller'; end if;                      -- ★6 cast セルフ専用（非ゲート＝既読のみ）
  select c.org_id, c.store_id into v_row from public.casts c where c.id = v_cast;
  select n.id, n.org_id, n.store_id, n.audience, n.cast_ids into v_n from public.notices n where n.id = p_notice_id;   -- ★0200: cast_ids も読む
  if v_n.id is null or v_n.org_id <> v_row.org_id or v_n.store_id <> v_row.store_id then raise exception 'forbidden'; end if;   -- ★6 自店だけ
  -- ★0200（裁定470）: 宛先の検査＝all／cast は cast_ids が null か本人を含むとき・targets は本人を含むときだけ（staff 向け・owners は不可）
  if not ((v_n.audience in ('all','cast') and (v_n.cast_ids is null or v_cast = any(v_n.cast_ids)))
          or (v_n.audience = 'targets' and v_n.cast_ids is not null and v_cast = any(v_n.cast_ids))) then raise exception 'forbidden'; end if;
  insert into public.cast_notice_reads (cast_id, notice_id, org_id, store_id)
  values (v_cast, p_notice_id, v_row.org_id, v_row.store_id)
  on conflict (cast_id, notice_id) do nothing;                                              -- ★6 冪等（2 回目は何もしない・audit も 1 回目だけ）
  if found then
    perform public.audit_log_write('notice_mark_read', 'notices:' || p_notice_id::text, null,
      jsonb_build_object('cast_id', v_cast, 'notice_id', p_notice_id), v_row.store_id);
  end if;
end $function$;

-- ═══ ★4 notice_update（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.notice_update(p_notice_id uuid, p_title text, p_body text, p_audience text, p_pinned boolean, p_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.notices; v_before jsonb; v_title text; v_body text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  -- 検証（create と同一）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if v_row.audience = 'targets' then   -- ★0200（裁定470）: 個別のお知らせは作成時点の宛先で固定＝区分には戻さない（cast_ids／staff_ids は触らない）
    if p_audience is distinct from 'targets' then raise exception 'bad audience'; end if;
  elsif p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  v_before := to_jsonb(v_row);
  update public.notices
     set title = v_title, body = v_body, audience = p_audience, pinned = p_pinned, until = p_until
   where id = p_notice_id;
  perform public.audit_log_write('notice_update', 'notices:' || p_notice_id::text, v_before,
    (select to_jsonb(n) from public.notices n where n.id = p_notice_id), v_row.store_id);
end $function$;

-- ═══ ★5 staff_labor_payments＝スタッフ給与の支払い記録（店×月 1 行＝裁定471） ═══
create table if not exists public.staff_labor_payments (
  store_id uuid not null references public.stores(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  paid_on date not null,
  method text not null check (method in ('cash','transfer')),
  amount integer not null check (amount >= 0),
  headcount integer not null check (headcount >= 0),
  note text,
  idem_key text,
  paid_by uuid references public.users(id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (store_id, period)
);
create index if not exists staff_labor_payments_org_period_idx on public.staff_labor_payments (org_id, period);
comment on table public.staff_labor_payments is '★0200（裁定471）: スタッフ給与の支払い記録（店×月 1 行）。amount＝支払い時の staff_labor_confirmed.amount の合計（総支給額のスナップショット・事業主負担の社保は含めない）。月報の経費一覧に「給与（スタッフ）」として出す（利益には含めない＝損益の人件費は確定額の 1 本）。取消＝行の削除（経費の行も消える）。支払い済みの月は確定の解除・再確定が不可（paid period）';
alter table public.staff_labor_payments enable row level security;
drop policy if exists staff_labor_payments_select on public.staff_labor_payments;
create policy staff_labor_payments_select on public.staff_labor_payments for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or (public.auth_role() in ('manager','staff') and store_id = public.auth_store_id())));
revoke all on table public.staff_labor_payments from public, anon, authenticated;
grant select on table public.staff_labor_payments to authenticated;

-- ═══ ★6 staff_labor_mark_paid／staff_labor_unmark_paid（店長以上・自店・冪等・audit） ═══
create or replace function public.staff_labor_mark_paid(p_store_id uuid, p_period text, p_paid_on date, p_method text, p_idem_key text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
-- ★0200（裁定471・M-130）: スタッフ給与の「支払い済みにする」＝店×月 1 行（支払日・支払方法＝現金／振込）。確定（staff_attendance_locks＋staff_labor_confirmed ≥1 行）が前提。
--   額＝確定額の合計（サーバ再計算・client の額は受け取らない）。冪等＝同じ p_idem_key の再送は既存の行を返す（別キーで既に支払い済み＝'already paid'）。操作と取消は店長以上（owner＝全店・manager＝自店）。
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_by   uuid := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  v_row  public.staff_labor_payments;
  v_amount bigint; v_n integer;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_paid_on is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_method is null or p_method not in ('cash','transfer') then raise exception 'bad method'; end if;
  if p_note is not null and length(p_note) > 200 then raise exception 'bad note'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  select * into v_row from public.staff_labor_payments where store_id = p_store_id and period = p_period;
  if v_row.store_id is not null then
    if p_idem_key is not null and v_row.idem_key = p_idem_key then
      return jsonb_build_object('ok', true, 'replay', true, 'amount', v_row.amount, 'headcount', v_row.headcount, 'paid_on', v_row.paid_on, 'method', v_row.method);
    end if;
    raise exception 'already paid';
  end if;
  if not exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period) then raise exception 'not confirmed'; end if;
  select coalesce(sum(c.amount), 0), count(*) into v_amount, v_n from public.staff_labor_confirmed c where c.store_id = p_store_id and c.period = p_period;
  if v_n < 1 then raise exception 'not confirmed'; end if;
  if v_amount > 2147483647 then raise exception 'bad amount'; end if;
  insert into public.staff_labor_payments (store_id, org_id, period, paid_on, method, amount, headcount, note, idem_key, paid_by)
  values (p_store_id, v_org, p_period, p_paid_on, p_method, v_amount::integer, v_n, nullif(trim(p_note), ''), p_idem_key, v_by)
  returning * into v_row;
  perform public.audit_log_write('staff_labor_mark_paid', 'stores:' || p_store_id::text || ':' || p_period, null,
    jsonb_build_object('paid_on', p_paid_on, 'method', p_method, 'amount', v_row.amount, 'headcount', v_row.headcount, 'note', v_row.note), p_store_id);
  return jsonb_build_object('ok', true, 'replay', false, 'amount', v_row.amount, 'headcount', v_row.headcount, 'paid_on', v_row.paid_on, 'method', v_row.method);
end $function$;
revoke execute on function public.staff_labor_mark_paid(uuid, text, date, text, text, text) from public, anon;
grant execute on function public.staff_labor_mark_paid(uuid, text, date, text, text, text) to authenticated;

create or replace function public.staff_labor_unmark_paid(p_store_id uuid, p_period text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
-- ★0200（裁定471・M-130）: 支払い済みの取消＝行の削除（月報の経費一覧の「給与（スタッフ）」の行も消える）。店長以上（owner＝全店・manager＝自店）。audit に消した額。
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.staff_labor_payments;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  delete from public.staff_labor_payments where store_id = p_store_id and period = p_period returning * into v_row;
  if v_row.store_id is null then raise exception 'not paid'; end if;
  perform public.audit_log_write('staff_labor_unmark_paid', 'stores:' || p_store_id::text || ':' || p_period,
    jsonb_build_object('paid_on', v_row.paid_on, 'method', v_row.method, 'amount', v_row.amount, 'headcount', v_row.headcount), null, p_store_id);
end $function$;
revoke execute on function public.staff_labor_unmark_paid(uuid, text) from public, anon;
grant execute on function public.staff_labor_unmark_paid(uuid, text) to authenticated;

-- ═══ ★7 staff_attendance_confirm（同じ署名・ACL 不変＝支払い済みの月は 'paid period'） ═══
CREATE OR REPLACE FUNCTION public.staff_attendance_confirm(p_store_id uuid, p_period text, p_lock boolean, p_labor jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ勤怠の月の確定（p_lock=true＝owner／自店 manager）と解除（p_lock=false＝owner のみ）。audit 'staff_attendance_confirm'
-- ★0194（裁定445 ②）: p_lock=true のとき p_labor（スタッフ給与の確定額＝内訳つき）を同じトランザクションで凍結（staff_labor_confirmed・店×月を丸ごと置換）。解除で額も消す。
-- ★0200（裁定471）: 支払い済み（staff_labor_payments に行）の月は解除も再確定も 'paid period'＝先に支払い済みを取り消す。
--   時給制の行は時給×実働を再計算して一致を確認（裁定445 ①・端数は店設定 settings_json.labor_rounding＝down（既定・切捨て＝staffPayOf の floorYen）／up／round）
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_had  boolean;
  v_by   uuid := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  v_rnd  text;
  v_n    integer := 0;
  v_total bigint := 0;
  v_calc integer;
  v_allow bigint;   -- ★0195（裁定450 の 6）: allowances の合計
  r      record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_lock is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（相談役確認待ち・推奨案）: 解除も自店の店長に（audit で追える）
  if exists (select 1 from public.staff_labor_payments p where p.store_id = p_store_id and p.period = p_period) then raise exception 'paid period'; end if;   -- ★0200（裁定471）: 支払い済みの月は解除も再確定も不可（先に staff_labor_unmark_paid）
  v_had := exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period);
  if p_lock then
    insert into public.staff_attendance_locks (store_id, org_id, period, locked_by)
    values (p_store_id, v_org, p_period, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (store_id, period) do nothing;
    if p_labor is not null then   -- ★0194（裁定445 ②）: 確定と凍結を同一トランザクション（行＝{membership_id, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, allowances}＝★0195 allowances＝固定手当の内訳 [{name, amount}]・Σ amount＝fixed を RPC が検証（裁定450 の 6））
      if jsonb_typeof(p_labor) <> 'array' then raise exception 'bad labor'; end if;
      v_rnd := coalesce((select s.settings_json->>'labor_rounding' from public.stores s where s.id = p_store_id), 'down');
      if v_rnd not in ('down','up','round') then v_rnd := 'down'; end if;
      delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;
      for r in select * from jsonb_to_recordset(p_labor) as x(membership_id uuid, pay_kind text, hourly integer, minutes integer, time_pay integer, fixed integer, monthly integer, daily integer, days integer, amount integer, deductions jsonb, calc_version text, allowances jsonb) loop
        if r.membership_id is null or r.amount is null or r.pay_kind is null then raise exception 'bad labor row'; end if;
        if r.pay_kind not in ('hourly','daily','monthly') then raise exception 'bad pay_kind'; end if;
        if r.amount < 0 or r.amount > 99999999 or coalesce(r.minutes, 0) < 0 or coalesce(r.hourly, 0) < 0 or coalesce(r.fixed, 0) < 0 or coalesce(r.time_pay, 0) < 0 then raise exception 'bad amount'; end if;
        if r.deductions is not null and jsonb_typeof(r.deductions) <> 'array' then raise exception 'bad deductions'; end if;
        if r.allowances is not null and jsonb_typeof(r.allowances) <> 'array' then raise exception 'bad allowances'; end if;   -- ★0195（M-80 追記②）
        if not exists (select 1 from public.memberships m where m.id = r.membership_id and m.store_id = p_store_id and m.role in ('owner','manager','staff')) then raise exception 'bad membership'; end if;
        -- ★0195（裁定450 の 6）: 固定手当の内訳 allowances の月額の合計＝fixed（client の合計を信用しない・裁定445 ①と同じ型・pay_kind に関係なく全行）
        if exists (select 1 from jsonb_array_elements(coalesce(r.allowances, '[]'::jsonb)) x where jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'amount') <> 'number' or (x->>'amount')::numeric < 0 or (x->>'amount')::numeric <> floor((x->>'amount')::numeric) or coalesce(length(trim(x->>'name')), 0) = 0) then raise exception 'bad allowances'; end if;
        select coalesce(sum((x->>'amount')::bigint), 0) into v_allow from jsonb_array_elements(coalesce(r.allowances, '[]'::jsonb)) x;
        if v_allow <> coalesce(r.fixed, 0) then raise exception 'labor mismatch: fixed % <> sum(allowances) %', coalesce(r.fixed, 0), v_allow; end if;
        if r.pay_kind = 'hourly' then   -- ★裁定445 ①: 時給 × 実働 を再計算して一致（端数は店設定）
          v_calc := case v_rnd when 'up' then ceil(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) when 'round' then round(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) else floor(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) end;
          if coalesce(r.time_pay, -1) <> v_calc then raise exception 'labor mismatch: time_pay % <> % (hourly % x minutes % / 60, %)', r.time_pay, v_calc, r.hourly, r.minutes, v_rnd; end if;
          if r.amount <> v_calc + coalesce(r.fixed, 0) then raise exception 'labor mismatch: amount % <> time_pay % + fixed %', r.amount, v_calc, coalesce(r.fixed, 0); end if;
        end if;
        insert into public.staff_labor_confirmed (membership_id, org_id, store_id, period, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, confirmed_by, allowances)
        values (r.membership_id, v_org, p_store_id, p_period, r.pay_kind, coalesce(r.hourly, 0), coalesce(r.minutes, 0), coalesce(r.time_pay, 0), coalesce(r.fixed, 0), coalesce(r.monthly, 0), coalesce(r.daily, 0), coalesce(r.days, 0), r.amount, coalesce(r.deductions, '[]'::jsonb), coalesce(r.calc_version, ''), v_by, coalesce(r.allowances, '[]'::jsonb));   -- ★0195: 固定手当の内訳も凍結
        v_n := v_n + 1; v_total := v_total + r.amount;
      end loop;
    end if;
  else
    delete from public.staff_attendance_locks where store_id = p_store_id and period = p_period;
    delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;   -- ★0194（裁定445 ②）: 解除＝確定額も消す（見込みに戻る）
  end if;
  perform public.audit_log_write('staff_attendance_confirm', 'stores:' || p_store_id::text || ':' || p_period,
    jsonb_build_object('locked', v_had), jsonb_build_object('locked', p_lock, 'labor_rows', v_n, 'labor_total', v_total), p_store_id);   -- ★0194: 凍結の人数と合計も
end $function$;

-- ═══ ★8 demo_org_reset（service_role だけ・ACL 不変＝wipe／load に staff_labor_confirmed／staff_labor_payments） ═══
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
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
    'stores','memberships','staff_labor_confirmed','staff_labor_payments','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances',   -- ★0200 ★8: 確定額 → 支払い記録（memberships の直後＝FK membership_id）'referrers','cast_ranks','staff_shift_patterns','product_categories','casts','cast_quotas','cast_contract_acks','staff_shift_wishes','shift_wishes','shift_periods','seats','products',   -- ★8 0160: +cast_quotas（casts の後）・★5 0162: +cast_contract_acks（casts の後）
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
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


-- ═══ ★9 裁定472: assert_on_duty（内部専用・ACL 不変＝duty_gate の例外を廃止） ═══
CREATE OR REPLACE FUNCTION public.assert_on_duty(p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0190（裁定436 ①a・相談役案）: レジの check_* の冒頭で、操作者の当日の出勤打刻を確かめる。
--   本人の解決＝kiosk 腕（auth_kiosk_operator＝操作担当の users.id→memberships／casts）か auth 腕（auth_role／auth_cast_id／auth_membership_id）。
--   店長以上（owner／manager・admin は auth_role で owner）は免除＝打刻が無いときだけ audit に 'off_duty_exempt' の印。★0200（裁定472）: 店設定 duty_gate の例外は廃止＝打刻する店は出勤中だけ・打刻しない店は確定シフトの窓（on_duty_of）。
--   cast／staff が打刻なし＝'off duty'（client の文言＝「出勤の打刻がありません。店の端末で打刻してから操作してください」）。
declare
  v_op uuid; v_store uuid; v_role text; v_kind text; v_sid uuid; v_biz date;
begin
  v_op := public.auth_kiosk_operator();
  if v_op is not null then
    v_store := public.auth_kiosk_register_store_id();
    select m.id, m.role into v_sid, v_role from public.memberships m where m.user_id = v_op and m.store_id = v_store and m.is_active limit 1;
    if v_role = 'cast' then
      v_kind := 'cast'; select c.id into v_sid from public.casts c where c.user_id = v_op and c.store_id = v_store and c.is_active limit 1;
    else
      v_kind := 'staff';
    end if;
  else
    v_role := public.auth_role(); v_store := public.auth_store_id();
    if v_role = 'cast' then v_kind := 'cast'; v_sid := public.auth_cast_id();
    else v_kind := 'staff'; v_sid := public.auth_membership_id(); end if;
  end if;
  if v_store is null then return; end if;   -- ★0200（裁定472）: duty_gate=false でも通さない（裁定455 の例外の廃止）
  v_biz := public.biz_date_of(v_store, now());
  if public.on_duty_of(v_kind, v_sid, v_store, v_biz) then return; end if;
  if v_role in ('owner', 'manager', 'admin') then
    perform public.audit_log_write('off_duty_exempt', p_action, null, jsonb_build_object('role', v_role, 'biz_date', v_biz, 'subject_kind', v_kind, 'subject_id', v_sid), v_store);
    return;
  end if;
  raise exception 'off duty';
end $function$;

-- ═══ ★10 裁定472: receipt_issue／bottle_keep_register に出勤中の柵（同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.receipt_issue(p_check_id uuid, p_amount integer DEFAULT NULL::integer, p_recipient text DEFAULT NULL::text, p_proviso text DEFAULT NULL::text, p_biz_date date DEFAULT NULL::date, p_reissue_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := public.auth_org_id();
  v_role    text := public.auth_role();
  v_chk     record;
  v_actor   uuid;
  v_issued  int;
  v_amt     int;
  v_recip   text;
  v_prov    text;
  v_sname   text;
  v_cutoff  text;
  v_bdate   date;
  v_expires date;
  v_serial  int;
  v_id      uuid;
  v_token   uuid;
  v_try     int;
  v_old     record;   -- ★2 0175（裁定402）: 再発行の元の行
  v_mem     uuid;     -- ★2 0175: 操作者の membership
  v_tb      jsonb;    -- ★26 0175 v2（裁定422 候補）: 税率ごとの内訳
  v_snap    jsonb;    -- ★26: 発行者（法人名・屋号・店名・住所・電話・登録番号＝登録事業者のみ）
  v_pm      text;     -- ★26: 支払方法（cash／card／other／mixed＝印紙の判定）
  v_hash    text;     -- ★26: 改変検知（sha256）
  v_s10 int := 0; v_s8 int := 0; v_sx int := 0; v_stot int := 0; v_a10 int := 0; v_a8 int := 0; v_ax int := 0;  -- ★26: 税率別の構成比と按分
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象伝票（FOR UPDATE＝同一伝票の並行発行を一列化＝Σamount ガードの競合封鎖）
  select * into v_chk from public.checks where id = p_check_id for update;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_on_duty('receipt_issue');   -- ★0200（裁定472）: 出勤中だけ（店長以上は免除）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_chk.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register() and public.auth_cast_register_level() >= 2)) then   -- ★25 0175 v2（裁定420）: 「会計まで」の cast は領収書も
    raise exception 'forbidden';
  end if;
  -- 発行は会計済み伝票のみ（open/void は不可）
  if v_chk.status <> 'closed' then raise exception 'not closed'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  v_mem := public.auth_membership_id();   -- ★2 0175（裁定402）: 発行者（users）と操作者（membership）を記録
  -- ★2 0175（裁定402）: 再発行＝元の行は同じ伝票のもの（取消済みでも元にできる）。未取消なら同一トランザクションで自動取消（void_note に理由）
  if p_reissue_of is not null then
    select * into v_old from public.receipt_issues where id = p_reissue_of for update;
    if v_old.id is null or v_old.check_id <> p_check_id then raise exception 'bad reissue_of'; end if;
    if not v_old.voided then
      update public.receipt_issues
         set voided = true, void_note = '再発行のため取消', voided_at = now(), voided_by = v_actor
       where id = p_reissue_of;
    end if;
  end if;
  -- ★2 0175（裁定402）: 日付の訂正＝元の取引日が既定・未来日は不可
  if p_biz_date is not null and p_biz_date > (now() at time zone 'Asia/Tokyo')::date then raise exception 'bad biz_date'; end if;

  -- 宛名・但し書き（trim・空は null・長さは CHECK と同値を関数側でも）
  v_recip := nullif(trim(coalesce(p_recipient, '')), '');
  v_prov  := coalesce(nullif(trim(coalesce(p_proviso, '')), ''),
                      (select nullif(trim(coalesce(s.receipt_default_desc, '')), '') from public.stores s where s.id = v_chk.store_id),
                      'ご飲食代として');   -- ★26 0175 v2（裁定422 候補）: 但し書きの既定＝店設定→「ご飲食代として」
  if v_recip is not null and length(v_recip) > 100 then raise exception 'bad recipient'; end if;
  if v_prov  is not null and length(v_prov)  > 100 then raise exception 'bad proviso';  end if;

  -- 金額（null=残額。Σ既発行（非void）＋今回 ≤ checks.total）
  select coalesce(sum(amount), 0)::int into v_issued
    from public.receipt_issues where check_id = p_check_id and not voided;
  -- ★0179（便 ON-1・2026-10-26）: 0175 ★2 の欠陥＝未代入の record v_old を CASE の中で参照（plpgsql は式の準備時にフィールドを解決するため分岐に入らなくても「record "v_old" is not assigned yet」）→ 再発行のときだけ v_old を読む
  if p_reissue_of is not null then v_amt := coalesce(p_amount, v_old.amount);   -- 再発行の既定＝元の行の金額（取消後の Σ に入る）
  else v_amt := coalesce(p_amount, v_chk.total - v_issued); end if;
  if v_amt <= 0 or v_issued + v_amt > v_chk.total then raise exception 'bad amount'; end if;

  -- 発行時スナップショット（店名・取引日＝closed_at の営業日・cutoff は core と同イディオム）
  select s.name,
         coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
    into v_sname, v_cutoff
    from public.stores s where s.id = v_chk.store_id;
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_bdate := coalesce(p_biz_date, (timezone('Asia/Tokyo', coalesce(v_chk.closed_at, v_chk.started_at))
              - (v_cutoff || ':00')::interval)::date);   -- ★2 0175（裁定402）: 訂正日があればそれ

  -- ★26 0175 v2（裁定422 候補）: 税率別の内訳＝伝票の行を税区分で集計（割引は負）し、受領額（v_amt＝税込）を構成比で按分→税率ごとに 1 回丸め（店の tax_rounding・check_tax_round と同じ流儀）
  select coalesce(sum(case when tax_category = 'taxable_10' then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0),
         coalesce(sum(case when tax_category = 'taxable_8'  then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0),
         coalesce(sum(case when coalesce(tax_category, '') not in ('taxable_10','taxable_8') then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0)
    into v_s10, v_s8, v_sx
    from public.check_lines where check_id = p_check_id;
  v_stot := v_s10 + v_s8 + v_sx;
  if v_stot <= 0 then v_a10 := v_amt; v_a8 := 0; v_ax := 0;
  else v_a10 := round(v_amt * v_s10::numeric / v_stot)::int; v_a8 := round(v_amt * v_s8::numeric / v_stot)::int; v_ax := v_amt - v_a10 - v_a8; end if;
  v_tb := '[]'::jsonb;
  if v_a10 > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 10, 'amount_incl', v_a10,
      'tax', (case coalesce(v_chk.tax_rounding, 'floor') when 'ceil' then ceil(v_a10 * 10.0 / 110.0) when 'round' then round(v_a10 * 10.0 / 110.0) else floor(v_a10 * 10.0 / 110.0) end)::int,
      'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  if v_a8 > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 8, 'amount_incl', v_a8,
      'tax', (case coalesce(v_chk.tax_rounding, 'floor') when 'ceil' then ceil(v_a8 * 8.0 / 108.0) when 'round' then round(v_a8 * 8.0 / 108.0) else floor(v_a8 * 8.0 / 108.0) end)::int,
      'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  if v_ax > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 0, 'amount_incl', v_ax, 'tax', 0, 'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  -- ★26: 発行者＝発行時点の店（登録番号は invoice_status='registered' のときだけ・未登録は null＝公開面は行ごと出さない）
  select jsonb_build_object('legal_name', nullif(trim(coalesce(s.legal_name, '')), ''), 'trade_name', nullif(trim(coalesce(s.trade_name, '')), ''), 'store_name', s.name,
                            'address', nullif(trim(coalesce(s.settings_json->>'receipt_address', '')), ''), 'tel', nullif(trim(coalesce(s.settings_json->>'receipt_tel', '')), ''),
                            'reg_no', case when s.invoice_status = 'registered' then nullif(trim(coalesce(s.invoice_reg_no, '')), '') else null end)
    into v_snap from public.stores s where s.id = v_chk.store_id;
  -- ★26: 支払方法＝伝票の入金が 1 種なら cash／card／other・複数なら mixed・無し（売掛等）は other
  select case when count(*) = 0 then 'other' when count(distinct method) = 1 then (case min(method) when 'cash' then 'cash' when 'card' then 'card' else 'other' end) else 'mixed' end
    into v_pm from public.payments where check_id = p_check_id;

  -- 有効期限 = 発行日（JST）+ 90日（正本B②・R2-9）
  v_expires := (now() at time zone 'Asia/Tokyo')::date + 90;

  -- ★2 0175: v_actor は上（再発行の取消の前）で読んだ

  -- ★R2-10 改訂: serial = max+1 を UNIQUE(store_id, serial) 衝突リトライ≤3 で採番（NOX 初の
  --   ループイディオム。max+1 の FOR UPDATE は範囲読み＝ファントムで直列化しない（0053 注記）ため
  --   一意制約に当てて弾き直す。begin..exception をループ内に置く＝サブトランザクション単位で捕捉）
  v_id := null;
  for v_try in 1..3 loop
    begin
      select coalesce(max(serial), 0) + 1 into v_serial
        from public.receipt_issues where store_id = v_chk.store_id;
      insert into public.receipt_issues
        (org_id, store_id, check_id, serial, amount, recipient, proviso,
         store_name_snap, biz_date, issued_by, expires_on, reissue_of, by_membership,   -- ★2 0175
         tax_breakdown, issuer_snapshot, payment_method)   -- ★26 v2
      values
        (v_chk.org_id, v_chk.store_id, p_check_id, v_serial, v_amt, v_recip, v_prov,
         v_sname, v_bdate, v_actor, v_expires, p_reissue_of, v_mem,
         v_tb, v_snap, v_pm)
      returning id, token into v_id, v_token;
      exit;
    exception when unique_violation then
      v_id := null;  -- 他店同時発行と衝突＝採り直し
    end;
  end loop;
  if v_id is null then raise exception 'busy'; end if;
  -- ★26 0175 v2（裁定422 候補）: 改変検知＝凍結した内容の sha256（番号・金額・宛名・但し書き・取引日・発行時刻・税内訳・発行者・支払方法）。以後は再発行（新番号＋元の行を取消）以外で変えない
  select encode(sha256(convert_to(jsonb_build_object('serial', v_serial, 'amount', v_amt, 'recipient', v_recip, 'proviso', v_prov, 'biz_date', v_bdate,
                                                     'issued_at', ri.issued_at, 'tax_breakdown', v_tb, 'issuer', v_snap, 'payment_method', v_pm)::text, 'UTF8')), 'hex')
    into v_hash from public.receipt_issues ri where ri.id = v_id;
  update public.receipt_issues set issued_hash = v_hash where id = v_id;

  -- 監査（token は記録しない＝公開アクセス鍵を audit へ漏らさない）
  perform public.audit_log_write('receipt_issue', 'receipt_issues:' || v_id::text, null,
    jsonb_build_object('check_id', p_check_id, 'serial', v_serial, 'amount', v_amt,
                       'recipient', v_recip, 'proviso', v_prov,
                       'biz_date', v_bdate, 'expires_on', v_expires,
                       'reissue_of', p_reissue_of, 'by_membership', v_mem, 'biz_date_corrected', p_biz_date is not null,   -- ★2 0175
                       'tax_breakdown', v_tb, 'payment_method', v_pm, 'issued_hash', v_hash),   -- ★26 v2
    v_chk.store_id);

  return jsonb_build_object('id', v_id, 'serial', v_serial, 'token', v_token,
                            'amount', v_amt, 'expires_on', v_expires, 'biz_date', v_bdate,
                            'store_name', v_sname, 'reissue_of', p_reissue_of,   -- ★2 0175
                            'proviso', v_prov, 'tax_breakdown', v_tb, 'issuer_snapshot', v_snap, 'payment_method', v_pm, 'issued_hash', v_hash);   -- ★26 v2
end $function$;
CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text, p_bottle_name text DEFAULT NULL::text, p_check_line_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text, p_tag_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
  v_line      record;  -- ★16 0153: 購入行（p_check_line_id）
  v_tag       text;    -- ★22 0175 v2（裁定419）: タグ名（空＝「{顧客名} {ボトル名}」を自動生成）
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_status is null or p_status not in ('active','pending') then raise exception 'bad status'; end if;   -- ★5 0173（裁定392）

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  perform public.assert_on_duty('bottle_keep_register');   -- ★0200（裁定472）: 出勤中だけ（店長以上は免除）
  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  -- ★mig0094: 追加3列の入力検証（CHECK と同値・エラー文言を関数側で統一）
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;

  -- ★16 0153（305-6）: ボトル名（≤60・空→null）
  if p_bottle_name is not null and length(p_bottle_name) > 60 then raise exception 'bad bottle_name'; end if;
  -- ★16 0153: 購入行との紐づけ＝同店・同商品の行で、その行の伝票に紐づく顧客に限る（'bad line'／'not on check'）→ 行の注文者を持ち主にする（要裁定 (2)）
  if p_check_line_id is not null then
    select l.id, l.check_id, l.store_id, l.product_id into v_line from public.check_lines l where l.id = p_check_line_id and l.org_id = v_org;
    if v_line.id is null or v_line.store_id <> p_store_id or v_line.product_id is distinct from p_product_id then raise exception 'bad line'; end if;
    if not exists (select 1 from public.check_customers cc where cc.check_id = v_line.check_id and cc.customer_id = p_customer_id) then raise exception 'not on check'; end if;
    update public.check_lines set customer_id = p_customer_id where id = p_check_line_id;
  end if;
  -- ★22 0175 v2（裁定419）: タグ名＝入力（≤60）か既定「{顧客名} {ボトル名}」（ボトル名は p_bottle_name→商品名）
  if p_tag_label is not null and length(p_tag_label) > 60 then raise exception 'bad tag_label'; end if;
  v_tag := nullif(trim(coalesce(p_tag_label, '')), '');
  if v_tag is null then
    select left(cu.name || ' ' || coalesce(nullif(trim(coalesce(p_bottle_name, '')), ''), v_prod.name), 60) into v_tag from public.customers cu where cu.id = p_customer_id;
  end if;
  -- ★5 0173（裁定392）: status＝p_status（'active'／'pending'）
  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no, bottle_name, check_line_id, tag_label)   -- ★16: 末尾 ')' → ', bottle_name)'（0158 ★7: +check_line_id）
  values (v_org, p_store_id, p_customer_id, p_product_id, p_status, now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no, nullif(trim(coalesce(p_bottle_name, '')), ''), p_check_line_id, v_tag)   -- ★16（0158 ★7: 購入行との紐づけ＝裁定314）
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ═══ ★16 共通関数＝キオスクの本人セッション中か（相談役 11/10＝auth_cast_can_register と auth_register_access の 2 か所から呼ぶ・内部専用）＝ended_at が null ∧ last_seen_at が店の kiosk_person_idle_minutes（既定 10・1〜120）以内 ═══
create or replace function public.kiosk_person_active_of(p_membership_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- ★0200: 本人セッション中の判定＝1 本。last_seen_at は claim と kiosk_person_touch（本人セッションの画面の 1 分ごとの heartbeat＝route /api/kiosk/person-touch＝service_role）が更新・無操作の終了は kiosk_person_end が ended_at を立てる
  select exists (
    select 1 from public.kiosk_sessions ks join public.stores st on st.id = ks.store_id
     where ks.membership_id = p_membership_id and ks.person_auth_session and ks.ended_at is null
       and ks.last_seen_at > now() - make_interval(mins => greatest(1, least(120, coalesce((st.settings_json->>'kiosk_person_idle_minutes')::int, 10))))
  )
$function$;
revoke execute on function public.kiosk_person_active_of(uuid) from public, anon, authenticated, service_role;

-- ═══ ★17 kiosk_person_touch＝本人セッションの heartbeat（service_role だけ＝route /api/kiosk/person-touch が本人の auth・cookie の session_id・端末の束縛 device_fp で呼ぶ＝kiosk_person_claim と同じ型・authenticated には EXECUTE を付けない＝本人のスマホから「セッション中」を作れない・audit なし＝auth_kiosk_operator の last_seen_at 更新と同型） ═══
create or replace function public.kiosk_person_touch(p_session_id uuid, p_auth_user uuid, p_device_fp text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  if p_session_id is null or p_auth_user is null or p_device_fp is null or length(p_device_fp) = 0 then return false; end if;
  update public.kiosk_sessions ks set last_seen_at = now()
   where ks.id = p_session_id and ks.person_auth_session and ks.ended_at is null
     and exists (select 1 from public.kiosk_devices d where d.id = ks.device_id and d.is_active and d.device_fp = p_device_fp)   -- 端末の束縛（claim と同じ）
     and ks.membership_id in (select m.id from public.memberships m join public.users u on u.id = m.user_id where u.auth_user_id = p_auth_user and m.is_active);
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;
revoke execute on function public.kiosk_person_touch(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_person_touch(uuid, uuid, text) to service_role;

-- ═══ ★12 裁定472: auth_register_access＝スマホのレジに入れるか（client の /mine ナビと /register の入場が同じ真実を読む・on_duty_of は内部専用のまま） ═══
create or replace function public.auth_register_access()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
-- ★0200（裁定472／473）: 本人の役割で {allowed, reason, role}。owner／manager／admin＝常に可。cast＝段階 >0 ∧ can_register（'not_allowed'）→ 端末（'store_device'＝店端末のみでキオスクの本人セッション中でない）→ 出勤中（'off_duty'＝打刻する店は最終打刻 in・打刻しない店は確定シフトの窓か今日だけ許可）。staff＝can_register → 出勤中。
declare
  v_role text := public.auth_role();
  v_store uuid := public.auth_store_id();
  v_mem uuid := public.auth_membership_id();
  v_cast uuid; v_dev text; v_kiosk boolean;
begin
  if public.auth_org_id() is null or v_role is null or v_store is null then return jsonb_build_object('allowed', false, 'reason', 'forbidden', 'role', v_role); end if;
  if v_role in ('owner','manager','admin') then return jsonb_build_object('allowed', true, 'reason', null, 'role', v_role); end if;
  if v_role = 'cast' then
    v_cast := public.auth_cast_id();
    if not (public.auth_cast_register_level() > 0 and (select coalesce(m.can_register, false) from public.memberships m where m.id = v_mem)) then return jsonb_build_object('allowed', false, 'reason', 'not_allowed', 'role', v_role); end if;
    v_dev := coalesce((select s.settings_json->>'cast_register_device' from public.stores s where s.id = v_store), 'store_device');
    v_kiosk := public.kiosk_person_active_of(v_mem);   -- ★16 共通関数（ended_at null ∧ last_seen_at が店の kiosk_person_idle_minutes 以内）
    if v_dev <> 'own_phone' and not v_kiosk then return jsonb_build_object('allowed', false, 'reason', 'store_device', 'role', v_role); end if;
    if not public.on_duty_of('cast', v_cast, v_store, public.biz_date_of(v_store, now())) then return jsonb_build_object('allowed', false, 'reason', 'off_duty', 'role', v_role); end if;
    return jsonb_build_object('allowed', true, 'reason', null, 'role', v_role);
  end if;
  if v_role = 'staff' then
    if not public.auth_staff_can_register() then return jsonb_build_object('allowed', false, 'reason', 'not_allowed', 'role', v_role); end if;
    if not public.on_duty_of('staff', v_mem, v_store, public.biz_date_of(v_store, now())) then return jsonb_build_object('allowed', false, 'reason', 'off_duty', 'role', v_role); end if;
    return jsonb_build_object('allowed', true, 'reason', null, 'role', v_role);
  end if;
  return jsonb_build_object('allowed', false, 'reason', 'forbidden', 'role', v_role);
end $function$;
revoke execute on function public.auth_register_access() from public, anon;
grant execute on function public.auth_register_access() to authenticated;

-- ═══ ★11 裁定473: set_store_profile（白名単 +cast_register_scope・旧キー cast_register_enabled を書かない＝同じ署名・ACL 不変） ═══
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
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours',   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間（0173 ★7: 末尾 '];' → ','）
                             'join_mode','cast_register_device','pay_fee_rates','trial_guarantee_days','default_plan_id',   -- ★7 0173: 裁定386／389／393／396 の 5 キー（0175 ★3: 末尾 '];' → ','）
                             'sys_wage_cut_rule','bonus_tier_mode','sales_split','pt_rules_default',                         -- ★3 0175: X13-I ②（就業規則に減給の定め）・裁定404（達成ボーナスの段）・409（売上の分け方）・405（店の既定 pt ルール）
                             'punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m',                 -- ★8 0175（398 打刻設定・列側）
                             'punch_require_shift','punch_round_unit','punch_round_mode','punch_round_consent_version',       -- ★8 0175（398）: 同意版は列に書かず punch_round_consents に 1 行（v2: 末尾 '];' → ','）
                             'service_rate_by_seat','pay_discount_rates','sys_drink_count_back','sales_subtotal_mode','sales_subtotal_includes_shimei',   -- ★11 0175 v2（CN-R ②③⑨⑩）
                             'settlement_week_close_dow','settlement_pay_days_after','daily_pay_cap_tiers',
                             'sys_staff_discount','staff_discount_cap','sys_cast_register',
                             'kiosk_features','kiosk_idle_sec','kiosk_person_idle_minutes',   -- ★0192 M-49
                             'okuri_flat_tiers',
                             'pay_discount_base',
                             'duty_gate',
                             'kind_back_rate','withholding_default_cast','withholding_default_staff','cash_float_default','settlement_close_day',
                             'punch_mode','register_window_before_min','register_window_after_min',
                             'line_notify',
                             'cast_register_scope'];   -- ★0200（裁定473）: 会計できる卓＝all（既定）／own   -- ★0199（裁定459・M-114）: LINE 通知の種類ごとの ON／OFF（object）   -- ★0197（裁定455 の 1・5）: 打刻の 3 択目（'punch'／'store'）と確定シフトの前後の窓（分）   -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目   -- ★0190（裁定436）: 打刻ゲート（boolean・既定 true＝false の店はレジの check_* で打刻を見ない）   -- ★0187（便 CASH）: 現金割引の基準（total＝合計から・既定／subtotal＝小計から）   -- ★1 0180（裁定414 追補）: 送り 定額の距離区分（配列・最大 3・{code,name,amount}）                                                                -- ★27 0175 v2 追補 2 同乗 R-7（裁定423 候補）                                     -- ★24／★25 0175 v2 追補 2（裁定421 候補・裁定420）                   -- ★11 0175 v2（CN-R ⑳ 週払い・日払いの上限）
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
  v_join     text;      -- ★2 0173: join_mode（enum text 2 値）
  v_crdev    text;      -- ★3 0173: cast_register_device（enum text 2 値）
  v_pfr      jsonb;     -- ★6 0173: pay_fee_rates（object・card／emoney／other・整数 0〜100）
  v_pfk      text;      -- ★6 0173: jsonb の検査用キー
  v_pfv      numeric;   -- ★6 0173: 率の検査用
  v_tgd      numeric;   -- ★7 0173: trial_guarantee_days（整数 1〜90）
  v_dpid     uuid;      -- ★7 0173: default_plan_id（自店の有効な comp_plans.id）
  v_wcr      boolean;   -- ★3 0175: sys_wage_cut_rule（show_open_status と同型）
  v_btm      text;      -- ★3 0175: bonus_tier_mode（enum text 2 値 max／sum）
  v_split    text;      -- ★3 0175: sales_split（enum text 2 値 prorate／equal）
  v_ptr      jsonb;     -- ★3 0175: pt_rules_default（object・pt_rules_check）
  v_penf     boolean;   -- ★8 0175: punch_enforce
  v_pmode    text;      -- ★8 0175: punch_restrict_mode（5 値）
  v_plat     double precision;   -- ★8 0175: punch_lat（-90〜90・null 可）
  v_plng     double precision;   -- ★8 0175: punch_lng（-180〜180・null 可）
  v_prad     numeric;   -- ★8 0175: punch_radius_m（整数 10〜100000・null 可）
  v_preq     text;      -- ★8 0175: punch_require_shift（off／warn／block）
  v_prunit   numeric;   -- ★8 0175: punch_round_unit（1／5／10／15／30）
  v_prmode   text;      -- ★8 0175: punch_round_mode（staff_favor／store_favor／nearest）
  v_pcv      text;      -- ★8 0175: punch_round_consent_version
  v_actor    uuid;      -- ★8 0175: 同意ログの changed_by
  v_srs      jsonb;     -- ★11 v2: service_rate_by_seat
  v_pdr      jsonb;     -- ★11 v2: pay_discount_rates
  v_sdcb     boolean;   -- ★11 v2: sys_drink_count_back
  v_ssm      text;      -- ★11 v2: sales_subtotal_mode
  v_ssis     boolean;   -- ★11 v2: sales_subtotal_includes_shimei
  v_wcd      numeric;   -- ★11 v2: settlement_week_close_dow
  v_pda      numeric;   -- ★11 v2: settlement_pay_days_after
  v_dct      jsonb;     -- ★11 v2: daily_pay_cap_tiers
  v_ssd      numeric;   -- ★24 v2 追補 2: sys_staff_discount（0 承認制／1 上限内は即時／2 不可）
  v_sdc      numeric;   -- ★24 v2 追補 2: staff_discount_cap（円・上限内は即時の上限）
  v_scr      numeric;   -- ★25 v2 追補 2: sys_cast_register（0 OFF／1 注文のみ／2 会計まで）
  v_scope    text;      -- ★0200（裁定473）: cast_register_scope
  v_kf       jsonb;     -- ★27 v2 R-7: kiosk_features {punch, register, shift}
  v_pdb      text;      -- ★0187: pay_discount_base
  v_dg       boolean;   -- ★0190: duty_gate
  v_oft      jsonb;     -- ★1 0180: okuri_flat_tiers（配列・最大 3）
  v_oe       jsonb;     -- ★1 0180: okuri_flat_tiers の要素
  v_ocodes   text[] := '{}';   -- ★1 0180: code の重複検査
  v_kis      numeric;   -- ★27 v2 R-7: kiosk_idle_sec（60〜900・既定 180）
  v_kpi      numeric;   -- ★0192 M-49: kiosk_person_idle_minutes（1〜120・既定 10＝キオスクの本人でログインの無操作で戻す分）
  v_pmd      text;      -- ★0197: punch_mode（'punch'＝既定／'store'＝打刻しない・店が勤怠を付ける）
  v_rwb      numeric;   -- ★0197: register_window_before_min（0〜240・既定 30）
  v_rwa      numeric;   -- ★0197: register_window_after_min（0〜240・既定 60）
  v_kbr      jsonb;     -- ★0191: kind_back_rate {hon, jonai, free}（整数 0〜100）
  v_wdc      text;      -- ★0191: withholding_default_cast（hostess／none）
  v_wds      text;      -- ★0191: withholding_default_staff（none／other_204）
  v_cfd      numeric;   -- ★0191: cash_float_default（整数 0〜9,999,999）
  v_scd      numeric;   -- ★0191: settlement_close_day（15／20／25／31＝末日）
  v_prevh    numeric;   -- ★11 v2: 表の昇順検査
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json,   -- ★2 0164: 列を 7 つ続ける
         invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods,   -- ★2 0164: before の現値（0175 ★8: 末尾 ','）
         punch_enforce, punch_restrict_mode, punch_lat, punch_lng, punch_radius_m, punch_require_shift, punch_round_unit, punch_round_mode,   -- ★8 0175（398）: 列側 8 の現値（v2: 末尾 ','）
         service_rate_by_seat   -- ★11 0175 v2（CN-R ②）
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

  if p_patch ? 'duty_gate' then   -- ★0190（裁定436・相談役案）: 打刻ゲート＝既定 ON（キオスク端末が 0 台の店は client が注意を出す）
    if jsonb_typeof(p_patch->'duty_gate') <> 'boolean' then raise exception 'bad type'; end if;
    v_dg := (p_patch->>'duty_gate')::boolean;
    v_before   := v_before || jsonb_build_object('duty_gate', coalesce((v_settings->>'duty_gate')::boolean, true));
    v_after    := v_after  || jsonb_build_object('duty_gate', v_dg);
    v_settings := jsonb_set(v_settings, '{duty_gate}', to_jsonb(v_dg), true);
  end if;
  if p_patch ? 'pay_discount_base' then   -- ★0187（便 CASH・Agoora 確定 10/27）: 割引対象＝合計から（既定）／小計から（税理士 T15 の回答待ちの仮置き）
    if jsonb_typeof(p_patch->'pay_discount_base') <> 'string' then raise exception 'bad type'; end if;
    v_pdb := p_patch->>'pay_discount_base';
    if v_pdb is null or v_pdb not in ('total','subtotal') then raise exception 'bad pay_discount_base'; end if;
    v_before   := v_before || jsonb_build_object('pay_discount_base', coalesce(v_settings->>'pay_discount_base', 'total'));
    v_after    := v_after  || jsonb_build_object('pay_discount_base', v_pdb);
    v_settings := jsonb_set(v_settings, '{pay_discount_base}', to_jsonb(v_pdb), true);
  end if;

  if p_patch ? 'okuri_flat_tiers' then                                                                   -- ★1 0180（裁定414 追補）: 定額徴収の距離区分＝配列・最大 3・要素 {code,name,amount}（settlement_presets と同型）
    v_oft := p_patch->'okuri_flat_tiers';                                                                -- ★1
    if jsonb_typeof(v_oft) <> 'array' or jsonb_array_length(v_oft) > 3 then raise exception 'bad type'; end if;   -- ★1: 最大 3 段
    v_ocodes := '{}';                                                                                     -- ★1
    for v_oe in select e from jsonb_array_elements(v_oft) e loop                                          -- ★1
      if jsonb_typeof(v_oe) <> 'object'                                                                   -- ★1
         or coalesce(jsonb_typeof(v_oe->'code'), '') <> 'string' or length(trim(v_oe->>'code')) = 0 or length(v_oe->>'code') > 32   -- ★1
         or coalesce(jsonb_typeof(v_oe->'name'), '') <> 'string' or length(trim(v_oe->>'name')) = 0 or length(v_oe->>'name') > 40   -- ★1
         or coalesce(jsonb_typeof(v_oe->'amount'), '') <> 'number'                                        -- ★1
         or (v_oe->>'amount')::numeric < 0 or (v_oe->>'amount')::numeric <> trunc((v_oe->>'amount')::numeric) then   -- ★1: 整数 ≥0
        raise exception 'bad type';                                                                       -- ★1
      end if;                                                                                             -- ★1
      if (v_oe->>'code') = any (v_ocodes) then raise exception 'bad type'; end if;                        -- ★1: code 一意
      v_ocodes := v_ocodes || (v_oe->>'code');                                                            -- ★1
    end loop;                                                                                             -- ★1
    v_before   := v_before || jsonb_build_object('okuri_flat_tiers', coalesce(v_settings->'okuri_flat_tiers', '[]'::jsonb));   -- ★1
    v_after    := v_after  || jsonb_build_object('okuri_flat_tiers', v_oft);                              -- ★1
    v_settings := jsonb_set(v_settings, '{okuri_flat_tiers}', v_oft, true);                               -- ★1
  end if;                                                                                                 -- ★1

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

  -- ★2 0173（裁定386）: 途中合流＝join_set（セット終了後の＋は合流セット行・既定）／extend_only（延長のみ）
  if p_patch ? 'join_mode' then                                                                            -- ★2 0173
    if jsonb_typeof(p_patch->'join_mode') <> 'string' then raise exception 'bad type'; end if;             -- ★2 0173
    v_join := p_patch->>'join_mode';                                                                       -- ★2 0173
    if v_join is null or v_join not in ('join_set','extend_only') then raise exception 'bad join_mode'; end if;   -- ★2 0173
    v_before   := v_before || jsonb_build_object('join_mode', coalesce(v_settings->>'join_mode', ''));     -- ★2 0173
    v_after    := v_after  || jsonb_build_object('join_mode', v_join);                                     -- ★2 0173
    v_settings := jsonb_set(v_settings, '{join_mode}', to_jsonb(v_join), true);                            -- ★2 0173
  end if;                                                                                                  -- ★2 0173
  -- ★3 0173（裁定389）: キャストのレジ端末＝store_device（店端末のみ＝kiosk_devices purpose 'register' の登録を流用・既定）／own_phone（自分のスマホからも）。cast_register_enabled（set_store_cast_register）が ON のときだけ効く
  if p_patch ? 'cast_register_device' then                                                                 -- ★3 0173
    if jsonb_typeof(p_patch->'cast_register_device') <> 'string' then raise exception 'bad type'; end if;  -- ★3 0173
    v_crdev := p_patch->>'cast_register_device';                                                           -- ★3 0173
    if v_crdev is null or v_crdev not in ('store_device','own_phone') then raise exception 'bad cast_register_device'; end if;   -- ★3 0173
    v_before   := v_before || jsonb_build_object('cast_register_device', coalesce(v_settings->>'cast_register_device', ''));   -- ★3 0173
    v_after    := v_after  || jsonb_build_object('cast_register_device', v_crdev);                         -- ★3 0173
    v_settings := jsonb_set(v_settings, '{cast_register_device}', to_jsonb(v_crdev), true);                -- ★3 0173
  end if;                                                                                                  -- ★3 0173
  -- ★6 0173（裁定393）: 支払方法別の手数料率＝object {card, emoney, other}（整数 0〜100・cash／ar は持たない・欠損キー＝0＝手数料なし。UI の新規店の初期値がカード 10）
  if p_patch ? 'pay_fee_rates' then                                                                        -- ★6 0173
    if jsonb_typeof(p_patch->'pay_fee_rates') <> 'object' then raise exception 'bad type'; end if;         -- ★6 0173
    v_pfr := p_patch->'pay_fee_rates';                                                                     -- ★6 0173
    for v_pfk in select jsonb_object_keys(v_pfr) loop                                                      -- ★6 0173
      if v_pfk not in ('card','emoney','other') then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      if jsonb_typeof(v_pfr->v_pfk) <> 'number' then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      v_pfv := (v_pfr->>v_pfk)::numeric;                                                                   -- ★6 0173
      if v_pfv <> floor(v_pfv) or v_pfv < 0 or v_pfv > 100 then raise exception 'bad pay_fee_rates'; end if;   -- ★6 0173
    end loop;                                                                                              -- ★6 0173
    v_before   := v_before || jsonb_build_object('pay_fee_rates', coalesce(v_settings->'pay_fee_rates', '{}'::jsonb));   -- ★6 0173
    v_after    := v_after  || jsonb_build_object('pay_fee_rates', v_pfr);                                  -- ★6 0173
    v_settings := jsonb_set(v_settings, '{pay_fee_rates}', v_pfr, true);                                   -- ★6 0173
  end if;                                                                                                  -- ★6 0173
  -- ★7 0173（裁定396）: 体入の保証日数＝整数 1〜90（既定 3＝欠損時・「体入を追加」の期限付き保証の日数）
  if p_patch ? 'trial_guarantee_days' then                                                                 -- ★7 0173
    if jsonb_typeof(p_patch->'trial_guarantee_days') <> 'number' then raise exception 'bad type'; end if;  -- ★7 0173
    v_tgd := (p_patch->>'trial_guarantee_days')::numeric;                                                  -- ★7 0173
    if v_tgd <> floor(v_tgd) or v_tgd < 1 or v_tgd > 90 then raise exception 'bad trial_guarantee_days'; end if;   -- ★7 0173
    v_before   := v_before || jsonb_build_object('trial_guarantee_days', coalesce((v_settings->>'trial_guarantee_days')::numeric, 3));   -- ★7 0173
    v_after    := v_after  || jsonb_build_object('trial_guarantee_days', v_tgd::int);                      -- ★7 0173
    v_settings := jsonb_set(v_settings, '{trial_guarantee_days}', to_jsonb(v_tgd::int), true);             -- ★7 0173
  end if;                                                                                                  -- ★7 0173
  -- ★7 0173（裁定396）: 本採用（体入→在籍）時の既定プラン＝自店の有効な comp_plans.id（null＝未設定＝UI は切替しない）
  if p_patch ? 'default_plan_id' then                                                                      -- ★7 0173
    if jsonb_typeof(p_patch->'default_plan_id') = 'null' then                                              -- ★7 0173
      v_dpid := null;                                                                                      -- ★7 0173
    else                                                                                                   -- ★7 0173
      if jsonb_typeof(p_patch->'default_plan_id') <> 'string' then raise exception 'bad type'; end if;     -- ★7 0173
      begin v_dpid := (p_patch->>'default_plan_id')::uuid; exception when others then raise exception 'bad default_plan_id'; end;   -- ★7 0173
      if not exists (select 1 from public.comp_plans c where c.id = v_dpid and c.store_id = p_store_id and c.org_id = v_org and c.is_active) then   -- ★7 0173
        raise exception 'bad default_plan_id';                                                             -- ★7 0173
      end if;                                                                                              -- ★7 0173
    end if;                                                                                                -- ★7 0173
    v_before   := v_before || jsonb_build_object('default_plan_id', v_settings->'default_plan_id');        -- ★7 0173
    v_after    := v_after  || jsonb_build_object('default_plan_id', v_dpid);                               -- ★7 0173
    v_settings := jsonb_set(v_settings, '{default_plan_id}', coalesce(to_jsonb(v_dpid), 'null'::jsonb), true);   -- ★7 0173
  end if;                                                                                                  -- ★7 0173

  -- ★3 0175（X13-I ②・便 SH-UI-a A-1）: 就業規則に減給の定めがある（雇用のノルマ未達の懲戒減給の提案を出す）＝boolean・既定 false＝欠損時
  if p_patch ? 'sys_wage_cut_rule' then
    if jsonb_typeof(p_patch->'sys_wage_cut_rule') <> 'boolean' then raise exception 'bad type'; end if;
    v_wcr := (p_patch->>'sys_wage_cut_rule')::boolean;
    v_before   := v_before || jsonb_build_object('sys_wage_cut_rule', coalesce((v_settings->>'sys_wage_cut_rule')::boolean, false));
    v_after    := v_after  || jsonb_build_object('sys_wage_cut_rule', v_wcr);
    v_settings := jsonb_set(v_settings, '{sys_wage_cut_rule}', to_jsonb(v_wcr), true);
  end if;
  -- ★3 0175（裁定404）: 達成ボーナス多段の計算＝max（到達した最上段のみ・既定＝欠損時）／sum（到達した全段の合計）
  if p_patch ? 'bonus_tier_mode' then
    if jsonb_typeof(p_patch->'bonus_tier_mode') <> 'string' then raise exception 'bad type'; end if;
    v_btm := p_patch->>'bonus_tier_mode';
    if v_btm is null or v_btm not in ('max','sum') then raise exception 'bad bonus_tier_mode'; end if;
    v_before   := v_before || jsonb_build_object('bonus_tier_mode', coalesce(v_settings->>'bonus_tier_mode', 'max'));
    v_after    := v_after  || jsonb_build_object('bonus_tier_mode', v_btm);
    v_settings := jsonb_set(v_settings, '{bonus_tier_mode}', to_jsonb(v_btm), true);
  end if;
  -- ★3 0175（裁定409）: 複数指名の卓の売上の分け方＝prorate（伝票ごとの分配率・既定＝欠損時）／equal（指名した全員で等分＝cast_sales_aggregate が ratio_weight>0 を 1 と読む）
  if p_patch ? 'sales_split' then
    if jsonb_typeof(p_patch->'sales_split') <> 'string' then raise exception 'bad type'; end if;
    v_split := p_patch->>'sales_split';
    if v_split is null or v_split not in ('prorate','equal') then raise exception 'bad sales_split'; end if;
    v_before   := v_before || jsonb_build_object('sales_split', coalesce(v_settings->>'sales_split', 'prorate'));
    v_after    := v_after  || jsonb_build_object('sales_split', v_split);
    v_settings := jsonb_set(v_settings, '{sales_split}', to_jsonb(v_split), true);
  end if;
  -- ★3 0175（裁定405）: 店の既定 pt 付与ルール（新規プランがコピーする）＝object（pt_rules_check と同じ形）
  if p_patch ? 'pt_rules_default' then
    if jsonb_typeof(p_patch->'pt_rules_default') <> 'object' then raise exception 'bad type'; end if;
    v_ptr := p_patch->'pt_rules_default';
    perform public.pt_rules_check(v_ptr);
    v_before   := v_before || jsonb_build_object('pt_rules_default', coalesce(v_settings->'pt_rules_default', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pt_rules_default', v_ptr);
    v_settings := jsonb_set(v_settings, '{pt_rules_default}', v_ptr, true);
  end if;

  -- ★8 0175（398 打刻設定＝BZ-R）: 列側 8 キー。判定は TS（route /api/punch/self）・DB は値の形だけ見る（BANZEN と同じ）
  if p_patch ? 'punch_enforce' then
    if jsonb_typeof(p_patch->'punch_enforce') <> 'boolean' then raise exception 'bad type'; end if;
    v_penf := (p_patch->>'punch_enforce')::boolean;
    v_before := v_before || jsonb_build_object('punch_enforce', v_store.punch_enforce);
    v_after  := v_after  || jsonb_build_object('punch_enforce', v_penf);
  end if;
  if p_patch ? 'punch_restrict_mode' then
    if jsonb_typeof(p_patch->'punch_restrict_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmode := p_patch->>'punch_restrict_mode';
    if v_pmode is null or v_pmode not in ('gps','ip','either','both','tablet') then raise exception 'bad punch_restrict_mode'; end if;
    v_before := v_before || jsonb_build_object('punch_restrict_mode', v_store.punch_restrict_mode);
    v_after  := v_after  || jsonb_build_object('punch_restrict_mode', v_pmode);
  end if;
  if p_patch ? 'punch_lat' then
    if jsonb_typeof(p_patch->'punch_lat') not in ('number','null') then raise exception 'bad type'; end if;
    v_plat := (p_patch->>'punch_lat')::double precision;
    if v_plat is not null and (v_plat < -90 or v_plat > 90) then raise exception 'bad punch_lat'; end if;
    v_before := v_before || jsonb_build_object('punch_lat', v_store.punch_lat);
    v_after  := v_after  || jsonb_build_object('punch_lat', v_plat);
  end if;
  if p_patch ? 'punch_lng' then
    if jsonb_typeof(p_patch->'punch_lng') not in ('number','null') then raise exception 'bad type'; end if;
    v_plng := (p_patch->>'punch_lng')::double precision;
    if v_plng is not null and (v_plng < -180 or v_plng > 180) then raise exception 'bad punch_lng'; end if;
    v_before := v_before || jsonb_build_object('punch_lng', v_store.punch_lng);
    v_after  := v_after  || jsonb_build_object('punch_lng', v_plng);
  end if;
  if p_patch ? 'punch_radius_m' then
    if jsonb_typeof(p_patch->'punch_radius_m') not in ('number','null') then raise exception 'bad type'; end if;
    v_prad := (p_patch->>'punch_radius_m')::numeric;
    if v_prad is not null and (v_prad <> floor(v_prad) or v_prad < 10 or v_prad > 100000) then raise exception 'bad punch_radius_m'; end if;
    v_before := v_before || jsonb_build_object('punch_radius_m', v_store.punch_radius_m);
    v_after  := v_after  || jsonb_build_object('punch_radius_m', v_prad::int);
  end if;
  if p_patch ? 'punch_require_shift' then
    if jsonb_typeof(p_patch->'punch_require_shift') <> 'string' then raise exception 'bad type'; end if;
    v_preq := p_patch->>'punch_require_shift';
    if v_preq is null or v_preq not in ('off','warn','block') then raise exception 'bad punch_require_shift'; end if;
    v_before := v_before || jsonb_build_object('punch_require_shift', v_store.punch_require_shift);
    v_after  := v_after  || jsonb_build_object('punch_require_shift', v_preq);
  end if;
  -- ★8 0175（398）: 勤務時間の丸め＝単位 1／5／10／15／30 と方向。単位を 1 より大きくする・方向を変える＝同意版（punch_round_consent_version）必須→punch_round_consents に 1 行（append-only）
  if p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then
    v_prunit := coalesce((p_patch->>'punch_round_unit')::numeric, v_store.punch_round_unit);
    v_prmode := coalesce(p_patch->>'punch_round_mode', v_store.punch_round_mode);
    if p_patch ? 'punch_round_unit' and jsonb_typeof(p_patch->'punch_round_unit') <> 'number' then raise exception 'bad type'; end if;
    if p_patch ? 'punch_round_mode' and jsonb_typeof(p_patch->'punch_round_mode') <> 'string' then raise exception 'bad type'; end if;
    if v_prunit is null or v_prunit not in (1,5,10,15,30) then raise exception 'bad punch_round_unit'; end if;
    if v_prmode is null or v_prmode not in ('staff_favor','store_favor','nearest') then raise exception 'bad punch_round_mode'; end if;
    if v_prunit::int <> v_store.punch_round_unit or v_prmode <> v_store.punch_round_mode then
      v_pcv := nullif(trim(coalesce(p_patch->>'punch_round_consent_version', '')), '');
      if v_prunit > 1 and v_pcv is null then raise exception 'consent required'; end if;
      select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
      insert into public.punch_round_consents (org_id, store_id, changed_by, old_unit, old_mode, new_unit, new_mode, consent_version)
      values (v_org, p_store_id, v_actor, v_store.punch_round_unit, v_store.punch_round_mode, v_prunit::int, v_prmode, v_pcv);
      v_before := v_before || jsonb_build_object('punch_round_unit', v_store.punch_round_unit, 'punch_round_mode', v_store.punch_round_mode);
      v_after  := v_after  || jsonb_build_object('punch_round_unit', v_prunit::int, 'punch_round_mode', v_prmode, 'punch_round_consent_version', v_pcv);
    end if;
  end if;
  -- ★8 0175（398）: ハード×位置を使う方法は位置と半径が必須（BANZEN の保存検証を DB にも）。Wi-Fi の必須は UI（store_wifi_add は別 RPC）
  if coalesce(v_penf, v_store.punch_enforce) and coalesce(v_pmode, v_store.punch_restrict_mode) in ('gps','both')
     and (coalesce(v_plat, v_store.punch_lat) is null or coalesce(v_plng, v_store.punch_lng) is null or coalesce(v_prad, v_store.punch_radius_m) is null) then
    raise exception 'range required';
  end if;

  -- ★11 0175 v2（CN-R ②）: 卓種別のサービス率＝object {"VIP":35}（席種 卓／カウンター／VIP・0〜100 の整数・無い席種は service_rate）＝列側。checks への凍結は開卓時に席種で選ぶ（check_open＝P175）
  if p_patch ? 'service_rate_by_seat' then
    if jsonb_typeof(p_patch->'service_rate_by_seat') <> 'object' then raise exception 'bad type'; end if;
    v_srs := p_patch->'service_rate_by_seat';
    for v_jk in select jsonb_object_keys(v_srs) loop
      if v_jk not in ('卓','カウンター','VIP') or jsonb_typeof(v_srs->v_jk) <> 'number' then raise exception 'bad service_rate_by_seat'; end if;
      if (v_srs->>v_jk)::numeric < 0 or (v_srs->>v_jk)::numeric > 100 or (v_srs->>v_jk)::numeric <> floor((v_srs->>v_jk)::numeric) then raise exception 'bad service_rate_by_seat'; end if;
    end loop;
    v_before := v_before || jsonb_build_object('service_rate_by_seat', v_store.service_rate_by_seat);
    v_after  := v_after  || jsonb_build_object('service_rate_by_seat', v_srs);
  end if;
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引＝object {cash, card, emoney, other}（%・0〜100・小数 1 桁・393 の pay_fee_rates の裏返し＝別キー）。check_pay が cash 等で割引行（fee_kind 'pay_discount'）を立てる
  if p_patch ? 'pay_discount_rates' then
    if jsonb_typeof(p_patch->'pay_discount_rates') <> 'object' then raise exception 'bad type'; end if;
    v_pdr := p_patch->'pay_discount_rates';
    for v_jk in select jsonb_object_keys(v_pdr) loop
      if v_jk not in ('cash','card','emoney','other') or jsonb_typeof(v_pdr->v_jk) <> 'number' then raise exception 'bad pay_discount_rates'; end if;
      if (v_pdr->>v_jk)::numeric < 0 or (v_pdr->>v_jk)::numeric > 100 or (v_pdr->>v_jk)::numeric <> round((v_pdr->>v_jk)::numeric, 1) then raise exception 'bad pay_discount_rates'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('pay_discount_rates', coalesce(v_settings->'pay_discount_rates', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pay_discount_rates', v_pdr);
    v_settings := jsonb_set(v_settings, '{pay_discount_rates}', v_pdr, true);
  end if;
  -- ★11 0175 v2（CN-R ⑨）: ドリンクバック（本数）の店スイッチ＝既定 true。false＝設定項目・レジの「誰のドリンクか」を出さず、ドリンクは小計の一部として指名種別の率で返る
  if p_patch ? 'sys_drink_count_back' then
    if jsonb_typeof(p_patch->'sys_drink_count_back') <> 'boolean' then raise exception 'bad type'; end if;
    v_sdcb := (p_patch->>'sys_drink_count_back')::boolean;
    v_before   := v_before || jsonb_build_object('sys_drink_count_back', coalesce((v_settings->>'sys_drink_count_back')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sys_drink_count_back', v_sdcb);
    v_settings := jsonb_set(v_settings, '{sys_drink_count_back}', to_jsonb(v_sdcb), true);
  end if;
  -- ★11 0175 v2（CN-R ⑩）: 「売上小計」の範囲＝due（今＝サ料込・丸め後・手数料除く）／pre_tax_service（税サ前・割引前・セット含む）＋指名料を含む（既定 true）
  if p_patch ? 'sales_subtotal_mode' then
    if jsonb_typeof(p_patch->'sales_subtotal_mode') <> 'string' then raise exception 'bad type'; end if;
    v_ssm := p_patch->>'sales_subtotal_mode';
    if v_ssm is null or v_ssm not in ('due','pre_tax_service') then raise exception 'bad sales_subtotal_mode'; end if;
    v_before   := v_before || jsonb_build_object('sales_subtotal_mode', coalesce(v_settings->>'sales_subtotal_mode', 'due'));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_mode', v_ssm);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_mode}', to_jsonb(v_ssm), true);
  end if;
  if p_patch ? 'sales_subtotal_includes_shimei' then
    if jsonb_typeof(p_patch->'sales_subtotal_includes_shimei') <> 'boolean' then raise exception 'bad type'; end if;
    v_ssis := (p_patch->>'sales_subtotal_includes_shimei')::boolean;
    v_before   := v_before || jsonb_build_object('sales_subtotal_includes_shimei', coalesce((v_settings->>'sales_subtotal_includes_shimei')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_includes_shimei', v_ssis);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_includes_shimei}', to_jsonb(v_ssis), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 週払い）: settlement_cycle 'weekly' のときの締日（曜日 0〜6）と支払日（締日から n 日後 0〜31）。monthly は pay_day（既存）
  if p_patch ? 'settlement_week_close_dow' then
    if jsonb_typeof(p_patch->'settlement_week_close_dow') <> 'number' then raise exception 'bad type'; end if;
    v_wcd := (p_patch->>'settlement_week_close_dow')::numeric;
    if v_wcd <> floor(v_wcd) or v_wcd < 0 or v_wcd > 6 then raise exception 'bad settlement_week_close_dow'; end if;
    v_before   := v_before || jsonb_build_object('settlement_week_close_dow', v_settings->'settlement_week_close_dow');
    v_after    := v_after  || jsonb_build_object('settlement_week_close_dow', v_wcd::int);
    v_settings := jsonb_set(v_settings, '{settlement_week_close_dow}', to_jsonb(v_wcd::int), true);
  end if;
  if p_patch ? 'settlement_pay_days_after' then
    if jsonb_typeof(p_patch->'settlement_pay_days_after') <> 'number' then raise exception 'bad type'; end if;
    v_pda := (p_patch->>'settlement_pay_days_after')::numeric;
    if v_pda <> floor(v_pda) or v_pda < 0 or v_pda > 31 then raise exception 'bad settlement_pay_days_after'; end if;
    v_before   := v_before || jsonb_build_object('settlement_pay_days_after', v_settings->'settlement_pay_days_after');
    v_after    := v_after  || jsonb_build_object('settlement_pay_days_after', v_pda::int);
    v_settings := jsonb_set(v_settings, '{settlement_pay_days_after}', to_jsonb(v_pda::int), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 日払いの上限）: 勤務時間で上限が変わる表＝array [{hours_min, cap}]（hours_min 昇順・cap 円・最大 10 段・空＝上限なし）。daily_pay_issue が p_worked_hours で読む
  -- ★24 0175 v2（裁定421 候補）: スタッフの割引・手数料カット＝0 承認制（既定）／1 上限内は即時／2 不可。上限＝staff_discount_cap（円・整数 ≥0）
  if p_patch ? 'sys_staff_discount' then
    if jsonb_typeof(p_patch->'sys_staff_discount') <> 'number' then raise exception 'bad type'; end if;
    v_ssd := (p_patch->>'sys_staff_discount')::numeric;
    if v_ssd <> floor(v_ssd) or v_ssd < 0 or v_ssd > 2 then raise exception 'bad sys_staff_discount'; end if;
    v_before   := v_before || jsonb_build_object('sys_staff_discount', v_settings->'sys_staff_discount');
    v_after    := v_after  || jsonb_build_object('sys_staff_discount', v_ssd::int);
    v_settings := jsonb_set(v_settings, '{sys_staff_discount}', to_jsonb(v_ssd::int), true);
  end if;
  if p_patch ? 'staff_discount_cap' then
    if jsonb_typeof(p_patch->'staff_discount_cap') <> 'number' then raise exception 'bad type'; end if;
    v_sdc := (p_patch->>'staff_discount_cap')::numeric;
    if v_sdc <> floor(v_sdc) or v_sdc < 0 or v_sdc > 10000000 then raise exception 'bad staff_discount_cap'; end if;
    v_before   := v_before || jsonb_build_object('staff_discount_cap', v_settings->'staff_discount_cap');
    v_after    := v_after  || jsonb_build_object('staff_discount_cap', v_sdc::int);
    v_settings := jsonb_set(v_settings, '{staff_discount_cap}', to_jsonb(v_sdc::int), true);
  end if;
  -- ★25 0175 v2（裁定420）: キャストのレジ使用＝0 OFF／1 注文のみ／2 会計まで（旧 cast_register_enabled は互換で残す＝set_store_cast_register が両方を書く）
  if p_patch ? 'sys_cast_register' then
    if jsonb_typeof(p_patch->'sys_cast_register') <> 'number' then raise exception 'bad type'; end if;
    v_scr := (p_patch->>'sys_cast_register')::numeric;
    if v_scr <> floor(v_scr) or v_scr < 0 or v_scr > 2 then raise exception 'bad sys_cast_register'; end if;
    v_before   := v_before || jsonb_build_object('sys_cast_register', v_settings->'sys_cast_register');   -- ★0200（裁定473）: 旧キー cast_register_enabled は廃止（書かない・消す）
    v_after    := v_after  || jsonb_build_object('sys_cast_register', v_scr::int);
    v_settings := jsonb_set(v_settings, '{sys_cast_register}', to_jsonb(v_scr::int), true) - 'cast_register_enabled';
  end if;
  -- ★27 0175 v2（裁定423 候補）: キオスクで使える機能＝{punch, register, shift}（boolean・無いキーは true）・無操作で自動ロックする秒数（60〜900・既定 180）
  if p_patch ? 'kiosk_features' then
    if jsonb_typeof(p_patch->'kiosk_features') <> 'object' then raise exception 'bad type'; end if;
    v_kf := p_patch->'kiosk_features';
    if exists (select 1 from jsonb_each(v_kf) e where e.key not in ('punch','register','shift') or jsonb_typeof(e.value) <> 'boolean') then raise exception 'bad kiosk_features'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_features', v_settings->'kiosk_features');
    v_after    := v_after  || jsonb_build_object('kiosk_features', v_kf);
    v_settings := jsonb_set(v_settings, '{kiosk_features}', v_kf, true);
  end if;
  if p_patch ? 'kiosk_idle_sec' then
    if jsonb_typeof(p_patch->'kiosk_idle_sec') <> 'number' then raise exception 'bad type'; end if;
    v_kis := (p_patch->>'kiosk_idle_sec')::numeric;
    if v_kis <> floor(v_kis) or v_kis < 60 or v_kis > 900 then raise exception 'bad kiosk_idle_sec'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_idle_sec', v_settings->'kiosk_idle_sec');
    v_after    := v_after  || jsonb_build_object('kiosk_idle_sec', v_kis::int);
    v_settings := jsonb_set(v_settings, '{kiosk_idle_sec}', to_jsonb(v_kis::int), true);
  end if;
  if p_patch ? 'punch_mode' then   -- ★0197（裁定455 の 1）: 打刻の 3 択目＝'store' のとき punch_methods は無視（白名単は触らない）
    if jsonb_typeof(p_patch->'punch_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmd := p_patch->>'punch_mode';
    if v_pmd is null or v_pmd not in ('punch','store') then raise exception 'bad punch_mode'; end if;
    v_before   := v_before || jsonb_build_object('punch_mode', coalesce(v_settings->>'punch_mode', 'punch'));
    v_after    := v_after  || jsonb_build_object('punch_mode', v_pmd);
    v_settings := jsonb_set(v_settings, '{punch_mode}', to_jsonb(v_pmd), true);
  end if;
  if p_patch ? 'register_window_before_min' then   -- ★0197（裁定455 の 5）: 確定シフトの開始の何分前からレジを開けるか
    if jsonb_typeof(p_patch->'register_window_before_min') <> 'number' then raise exception 'bad type'; end if;
    v_rwb := (p_patch->>'register_window_before_min')::numeric;
    if v_rwb <> floor(v_rwb) or v_rwb < 0 or v_rwb > 240 then raise exception 'bad register_window_before_min'; end if;
    v_before   := v_before || jsonb_build_object('register_window_before_min', v_settings->'register_window_before_min');
    v_after    := v_after  || jsonb_build_object('register_window_before_min', v_rwb::int);
    v_settings := jsonb_set(v_settings, '{register_window_before_min}', to_jsonb(v_rwb::int), true);
  end if;
  if p_patch ? 'register_window_after_min' then   -- ★0197（裁定455 の 5）: 終了の何分後まで
    if jsonb_typeof(p_patch->'register_window_after_min') <> 'number' then raise exception 'bad type'; end if;
    v_rwa := (p_patch->>'register_window_after_min')::numeric;
    if v_rwa <> floor(v_rwa) or v_rwa < 0 or v_rwa > 240 then raise exception 'bad register_window_after_min'; end if;
    v_before   := v_before || jsonb_build_object('register_window_after_min', v_settings->'register_window_after_min');
    v_after    := v_after  || jsonb_build_object('register_window_after_min', v_rwa::int);
    v_settings := jsonb_set(v_settings, '{register_window_after_min}', to_jsonb(v_rwa::int), true);
  end if;
  if p_patch ? 'kiosk_person_idle_minutes' then   -- ★0192 M-49（kiosk_idle_sec と同型）
    if jsonb_typeof(p_patch->'kiosk_person_idle_minutes') <> 'number' then raise exception 'bad type'; end if;
    v_kpi := (p_patch->>'kiosk_person_idle_minutes')::numeric;
    if v_kpi <> floor(v_kpi) or v_kpi < 1 or v_kpi > 120 then raise exception 'bad kiosk_person_idle_minutes'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_person_idle_minutes', v_settings->'kiosk_person_idle_minutes');
    v_after    := v_after  || jsonb_build_object('kiosk_person_idle_minutes', v_kpi::int);
    v_settings := jsonb_set(v_settings, '{kiosk_person_idle_minutes}', to_jsonb(v_kpi::int), true);
  end if;
  if p_patch ? 'daily_pay_cap_tiers' then
    if jsonb_typeof(p_patch->'daily_pay_cap_tiers') <> 'array' then raise exception 'bad type'; end if;
    v_dct := p_patch->'daily_pay_cap_tiers';
    if jsonb_array_length(v_dct) > 10 then raise exception 'bad daily_pay_cap_tiers'; end if;
    v_prevh := null;
    for v_pe in select * from jsonb_array_elements(v_dct) loop
      if jsonb_typeof(v_pe) <> 'object' or jsonb_typeof(v_pe->'hours_min') <> 'number' or jsonb_typeof(v_pe->'cap') <> 'number' then raise exception 'bad daily_pay_cap_tiers'; end if;
      if (v_pe->>'hours_min')::numeric < 0 or (v_pe->>'cap')::numeric < 0 or (v_pe->>'cap')::numeric <> floor((v_pe->>'cap')::numeric) then raise exception 'bad daily_pay_cap_tiers'; end if;
      if v_prevh is not null and (v_pe->>'hours_min')::numeric <= v_prevh then raise exception 'bad daily_pay_cap_tiers'; end if;
      v_prevh := (v_pe->>'hours_min')::numeric;
    end loop;
    v_before   := v_before || jsonb_build_object('daily_pay_cap_tiers', coalesce(v_settings->'daily_pay_cap_tiers', '[]'::jsonb));
    v_after    := v_after  || jsonb_build_object('daily_pay_cap_tiers', v_dct);
    v_settings := jsonb_set(v_settings, '{daily_pay_cap_tiers}', v_dct, true);
  end if;

  -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目（settings_json）
  if p_patch ? 'kind_back_rate' then
    if jsonb_typeof(p_patch->'kind_back_rate') <> 'object' then raise exception 'bad type'; end if;
    v_kbr := p_patch->'kind_back_rate';
    if exists (select 1 from jsonb_each(v_kbr) e where e.key not in ('hon','jonai','free') or jsonb_typeof(e.value) <> 'number' or (e.value::text)::numeric < 0 or (e.value::text)::numeric > 100 or (e.value::text)::numeric <> floor((e.value::text)::numeric)) then raise exception 'bad kind_back_rate'; end if;
    v_before   := v_before || jsonb_build_object('kind_back_rate', coalesce(v_settings->'kind_back_rate', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('kind_back_rate', v_kbr);
    v_settings := jsonb_set(v_settings, '{kind_back_rate}', v_kbr, true);
  end if;
  if p_patch ? 'withholding_default_cast' then
    if jsonb_typeof(p_patch->'withholding_default_cast') <> 'string' then raise exception 'bad type'; end if;
    v_wdc := p_patch->>'withholding_default_cast';
    if v_wdc is null or v_wdc not in ('hostess','none') then raise exception 'bad withholding_default_cast'; end if;
    v_before   := v_before || jsonb_build_object('withholding_default_cast', coalesce(v_settings->>'withholding_default_cast', 'hostess'));
    v_after    := v_after  || jsonb_build_object('withholding_default_cast', v_wdc);
    v_settings := jsonb_set(v_settings, '{withholding_default_cast}', to_jsonb(v_wdc), true);
  end if;
  if p_patch ? 'withholding_default_staff' then
    if jsonb_typeof(p_patch->'withholding_default_staff') <> 'string' then raise exception 'bad type'; end if;
    v_wds := p_patch->>'withholding_default_staff';
    if v_wds is null or v_wds not in ('none','other_204') then raise exception 'bad withholding_default_staff'; end if;
    v_before   := v_before || jsonb_build_object('withholding_default_staff', coalesce(v_settings->>'withholding_default_staff', 'none'));
    v_after    := v_after  || jsonb_build_object('withholding_default_staff', v_wds);
    v_settings := jsonb_set(v_settings, '{withholding_default_staff}', to_jsonb(v_wds), true);
  end if;
  if p_patch ? 'cash_float_default' then
    if jsonb_typeof(p_patch->'cash_float_default') <> 'number' then raise exception 'bad type'; end if;
    v_cfd := (p_patch->>'cash_float_default')::numeric;
    if v_cfd <> floor(v_cfd) or v_cfd < 0 or v_cfd > 9999999 then raise exception 'bad cash_float_default'; end if;
    v_before   := v_before || jsonb_build_object('cash_float_default', coalesce(v_settings->'cash_float_default', '0'::jsonb));
    v_after    := v_after  || jsonb_build_object('cash_float_default', v_cfd::int);
    v_settings := jsonb_set(v_settings, '{cash_float_default}', to_jsonb(v_cfd::int), true);
  end if;
  if p_patch ? 'settlement_close_day' then
    if jsonb_typeof(p_patch->'settlement_close_day') <> 'number' then raise exception 'bad type'; end if;
    v_scd := (p_patch->>'settlement_close_day')::numeric;
    if v_scd not in (15, 20, 25, 31) then raise exception 'bad settlement_close_day'; end if;
    v_before   := v_before || jsonb_build_object('settlement_close_day', coalesce(v_settings->'settlement_close_day', '31'::jsonb));
    v_after    := v_after  || jsonb_build_object('settlement_close_day', v_scd::int);
    v_settings := jsonb_set(v_settings, '{settlement_close_day}', to_jsonb(v_scd::int), true);
  end if;

  -- ★0199（裁定459・M-114）: LINE 通知の種類ごとの ON／OFF＝settings_json.line_notify＝{notice, shift_published, shift_changed, remind} の boolean だけ（client の lib/nox/line/notify-kinds.ts と同じ鍵名）。
  --   知らない鍵／boolean 以外／object 以外＝'bad line_notify'。送られた object で置換（鍵の欠けは client の既定＝お知らせだけ ON）。DB 既定値なし。
  if p_patch ? 'line_notify' then
    if jsonb_typeof(p_patch->'line_notify') <> 'object' then raise exception 'bad line_notify'; end if;
    for v_jk in select jsonb_object_keys(p_patch->'line_notify') loop
      if v_jk not in ('notice','shift_published','shift_changed','remind') or jsonb_typeof(p_patch->'line_notify'->v_jk) <> 'boolean' then raise exception 'bad line_notify'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('line_notify', coalesce(v_settings->'line_notify', 'null'::jsonb));
    v_after    := v_after  || jsonb_build_object('line_notify', p_patch->'line_notify');
    v_settings := jsonb_set(v_settings, '{line_notify}', p_patch->'line_notify', true);
  end if;

  -- ★0200（裁定473・M-131）: 会計できる卓＝cast_register_scope＝'all'（既定＝全卓）／'own'（自分が着卓中／指名されている卓だけ）。キャストの RPC と RLS は auth_cast_check_allowed で判定
  if p_patch ? 'cast_register_scope' then
    if jsonb_typeof(p_patch->'cast_register_scope') <> 'string' then raise exception 'bad type'; end if;
    v_scope := p_patch->>'cast_register_scope';
    if v_scope is null or v_scope not in ('all','own') then raise exception 'bad cast_register_scope'; end if;
    v_before   := v_before || jsonb_build_object('cast_register_scope', coalesce(v_settings->>'cast_register_scope', ''));
    v_after    := v_after  || jsonb_build_object('cast_register_scope', v_scope);
    v_settings := jsonb_set(v_settings, '{cast_register_scope}', to_jsonb(v_scope), true);
  end if;

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
    punch_enforce       = case when p_patch ? 'punch_enforce'       then v_penf  else punch_enforce end,                     -- ★8 0175（398）
    punch_restrict_mode = case when p_patch ? 'punch_restrict_mode' then v_pmode else punch_restrict_mode end,               -- ★8 0175
    punch_lat           = case when p_patch ? 'punch_lat'           then v_plat  else punch_lat end,                         -- ★8 0175
    punch_lng           = case when p_patch ? 'punch_lng'           then v_plng  else punch_lng end,                         -- ★8 0175
    punch_radius_m      = case when p_patch ? 'punch_radius_m'      then v_prad::int else punch_radius_m end,                -- ★8 0175
    punch_require_shift = case when p_patch ? 'punch_require_shift' then v_preq  else punch_require_shift end,               -- ★8 0175
    punch_round_unit    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prunit::smallint else punch_round_unit end,   -- ★8 0175
    punch_round_mode    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prmode else punch_round_mode end,   -- ★8 0175
    service_rate_by_seat = case when p_patch ? 'service_rate_by_seat' then v_srs else service_rate_by_seat end,                      -- ★11 0175 v2（CN-R ②）
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- ═══ ★13 裁定473: 設定を 1 か所に＝auth_cast_register_level／auth_cast_can_register の旧キー互換を外す・端末（店端末のみ）を RPC と RLS でも判定（M-131）・set_store_cast_register は drop・既存の店の旧キーを消す ═══
create or replace function public.auth_cast_register_level()
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  -- ★25 0175 v2（裁定420）: 自店の「キャストのレジ使用」の段階＝0 OFF／1 注文のみ／2 会計まで。cast 本人のセッション以外は 0
  -- ★0200（裁定473）: 旧 cast_register_enabled の互換を外す（正本は sys_cast_register だけ＝段階 ≠ 0 が「有効」）
  select coalesce((select coalesce((s.settings_json->>'sys_cast_register')::int, 0)
                     from public.memberships m
                     join public.users u on u.id = m.user_id
                     join public.stores s on s.id = m.store_id
                    where u.auth_user_id = auth.uid() and u.is_active and m.is_active and m.role = 'cast'
                    limit 1), 0)
$function$;
create or replace function public.auth_cast_can_register()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- ★25 0175 v2（裁定420）: 3 段階。★0200（裁定473・M-131）: 旧キー互換を外す＋操作端末＝own_phone でなければキオスクの本人セッション中（kiosk_person_active_of＝共通関数）だけ＝RPC 25 本と RLS に一度に効く
  select coalesce(m.can_register, false)
         and coalesce((s.settings_json->>'sys_cast_register')::int, 0) > 0
         and (coalesce(s.settings_json->>'cast_register_device', 'store_device') = 'own_phone'
              or public.kiosk_person_active_of(m.id))
  from public.memberships m
  join public.users u on u.id = m.user_id
  join public.stores s on s.id = m.store_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
    and m.role = 'cast'
$function$;
drop function if exists public.set_store_cast_register(uuid, boolean);   -- ★0200（裁定473）: 「店のキャスト会計 有効／無効」は廃止（段階 ≠ OFF＝有効）
-- 既存の店の値の移行＝sys_cast_register が無く旧キー true の店は段階 1（2026-11-10 の本番＝0 店）・旧キーは全店から消す（2 店＝どちらも sys あり＝値は不変）
update public.stores set settings_json = jsonb_set(settings_json, '{sys_cast_register}', '1'::jsonb, true) where not (settings_json ? 'sys_cast_register') and settings_json->>'cast_register_enabled' = 'true';
update public.stores set settings_json = settings_json - 'cast_register_enabled' where settings_json ? 'cast_register_enabled';

-- ═══ ★14 裁定473: auth_cast_check_allowed＝会計できる卓（all＝全卓／own＝自分が着卓中か指名されている卓だけ）＝RLS からも呼ぶ（authenticated 可・読むだけ） ═══
create or replace function public.auth_cast_check_allowed(p_check_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
-- ★0200（裁定473）: cast 以外＝true。cast＝店の cast_register_scope が 'own' なら、その伝票に本人の指名行（着卓中＝ended_at null、または free 以外の指名）があるときだけ true。p_check_id null（開卓）＝'own' の店では false
declare
  v_scope text; v_cast uuid;
begin
  select coalesce(s.settings_json->>'cast_register_scope', 'all') into v_scope
    from public.memberships m join public.users u on u.id = m.user_id join public.stores s on s.id = m.store_id
   where u.auth_user_id = auth.uid() and u.is_active and m.is_active and m.role = 'cast' limit 1;
  if v_scope is null or v_scope <> 'own' then return true; end if;
  if p_check_id is null then return false; end if;
  v_cast := public.auth_cast_id();
  return exists (select 1 from public.check_nominations n where n.check_id = p_check_id and n.cast_id = v_cast and (n.ended_at is null or coalesce(n.nom_kind, 'free') <> 'free'));
end $function$;
revoke execute on function public.auth_cast_check_allowed(uuid) from public, anon;
grant execute on function public.auth_cast_check_allowed(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_add_line');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    -- ★mig0070: back_exempt を凍結（経路の分岐もマスタ現価でなく伝票の凍結値で決める）
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt,
                                 'back_exempt', coalesce(v_prod.back_exempt_from_split, false));
  else
    if p_kind is null or p_kind not in ('set','time','charge','custom') then raise exception 'bad kind'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'bad price'; end if;
    v_kind := p_kind;
    v_name := trim(p_name);
    v_price := p_unit_price;
    v_back := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_product_id, v_kind, v_grp,
          v_name, v_price, p_qty, v_price * p_qty, v_back, v_sort)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_line', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text, p_fee_key text DEFAULT NULL::text, p_fee_rate numeric DEFAULT NULL::numeric, p_fee_on boolean DEFAULT true, p_fee_amount integer DEFAULT NULL::integer, p_disc_rate numeric DEFAULT NULL::numeric, p_disc_amount integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
  v_org uuid;  -- ★0057(2)
  v_fkey text; v_rate numeric := 0; v_fee int := 0; v_fee_eff int := 0; v_due2 int; v_sort int; v_fid uuid; v_settings jsonb;  -- ★6 0173（裁定393）・★1 0175: v_rate は numeric（小数 1 桁）
  v_store_rate numeric := 0; v_override boolean := false;  -- ★1 0175（裁定393 追補2）: 店設定の率・店設定と異なる率／OFF
  v_dkey text; v_drate numeric := 0; v_disc int := 0; v_did uuid;
  v_dbase text := 'total'; v_dnet int := 0; v_dman boolean := false;  -- ★0187（便 CASH）: 割引の基準（total＝合計から・subtotal＝小計から）・小計・指定額  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（393 の裏返し＝別キー pay_discount_rates）
  v_fee_source text := 'auto';  -- ★21 0175 v2（裁定393 追補4）: auto（店の率）／none／manual（この入金だけの額）
  v_mem uuid;  -- ★3 0173（裁定389）: 操作者の membership
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_pay');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then raise exception 'forbidden'; end if;   -- ★25 0175 v2（裁定420）: 「注文のみ」の cast は入金不可
  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（例 現金計 10% OFF）＝店設定 pay_discount_rates の率>0 なら、この方法で払う残額に対する割引行を立てて due を下げる（p_fee_on=false は割引も止める＝「上乗せ／割引を適用しない」）
  if p_fee_on then
    v_dkey := case when p_method = 'cash' then 'cash' when p_method = 'card' then 'card' when p_method = 'other' then coalesce(p_fee_key, 'other') else null end;
    if v_dkey is not null then
      if v_settings is null then select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id; end if;
      v_drate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_discount_rates'->>v_dkey, '')::numeric, 0);
      -- ★0187（便 CASH・Agoora 確定 10/27＋補遺）: 入金ごとの割引の上書き＝率を指定（p_disc_rate）／額を指定（p_disc_amount・0＝なし）＝M-6 のカード手数料と同じ形
      if p_disc_rate is not null and (p_disc_rate < 0 or p_disc_rate > 100) then raise exception 'bad disc_rate'; end if;
      if p_disc_amount is not null and (p_disc_amount < 0 or p_disc_amount > v_due - v_paid) then raise exception 'bad disc_amount'; end if;
      if p_disc_rate is not null then v_drate := p_disc_rate; end if;
      v_dbase := case when coalesce(v_settings, '{}'::jsonb)->>'pay_discount_base' = 'subtotal' then 'subtotal' else 'total' end;   -- ★0187: 既定＝合計から（T15 の回答待ちの仮置き）
      if p_disc_amount is not null then
        v_dman := true; v_disc := p_disc_amount;   -- 額を指定（0＝なし）
      elsif v_drate > 0 then
        if v_dbase = 'subtotal' then
          -- 小計から＝税・サの前の小計（未入金分の比で按分）× 率＝割引行はサ・税の前に効く（従来の行の扱い）
          select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee'), 0)::int
               - coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int
            into v_dnet from public.check_lines where check_id = p_check_id and pay_group = v_grp;
          v_disc := round(greatest(0, v_dnet)::numeric * (v_due - v_paid) / greatest(v_due, 1) * v_drate / 100.0)::int;
        else
          -- 合計から＝税・サ込みの残額 × 率＝最後に引く（check_group_due が丸めた合計から引いてから店の丸め規則でもう一度丸める＝事後承認 ②）
          v_disc := round((v_due - v_paid) * v_drate / 100.0)::int;
        end if;
      end if;
      if v_disc > 0 then
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'discount', v_grp,
                  (case v_dkey when 'cash' then '現金割引' when 'card' then 'カード割引' when 'emoney' then '電子マネー割引' else '決済割引' end)
                  || case when v_dman then '（指定）' else ' ' || rtrim(rtrim(to_char(v_drate, 'FM990.0'), '0'), '.') || '%' end
                  || case when v_dbase = 'subtotal' then '（小計から）' else '' end,
                  v_disc, 1, v_disc, null, v_sort, false, case when v_dbase = 'subtotal' then 'pay_discount' else 'pay_discount_total' end, 'taxable_10', case when v_dman then null else v_drate end)
          returning id into v_did;
          perform public.check_recalc(p_check_id);
          v_due := public.check_group_due(p_check_id, v_grp);
      end if;
    end if;
  end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  -- ★6 0173（裁定393）: 支払方法別の手数料＝店設定 pay_fee_rates（card／emoney／other・cash／ar は対象外・欠損＝0）。
  --   手数料＝round(p_amount×率/100)（1 円未満四捨五入・併用時はその方法で入金する分だけ）→ 伝票行（kind 'charge'・fee_kind 'pay_fee'・同じ pay_group・内税対象）
  --   → check_recalc → 受取額（payments.amount）＝p_amount＋due の増分（丸め単位に従う）。キャスト売上（cast_sales_aggregate）は除外・日報は pay_fee_total。
  if p_method in ('card','other') then
    v_fkey := coalesce(p_fee_key, case when p_method = 'card' then 'card' else 'other' end);
    if v_fkey not in ('card','emoney','other') then raise exception 'bad fee_key'; end if;
    if (p_method = 'card') <> (v_fkey = 'card') then raise exception 'bad fee_key'; end if;
    select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id;
    v_store_rate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_fee_rates'->>v_fkey, '')::numeric, 0);
    -- ★1 0175（裁定393 追補2）: 入金モーダルの「手数料を上乗せ ON／OFF」と率（0〜100・小数 1 桁）。null＝店設定。OFF／0% なら手数料行なし。店設定と異なる率／OFF は audit（操作者付き）
    if p_fee_on is null then raise exception 'bad fee_on'; end if;
    if p_fee_rate is not null and (p_fee_rate < 0 or p_fee_rate > 100 or p_fee_rate <> round(p_fee_rate, 1)) then raise exception 'bad fee_rate'; end if;
    v_rate := case when not p_fee_on then 0 else coalesce(p_fee_rate, v_store_rate) end;
    -- ★21 0175 v2（裁定393 追補4）: 入金ごとの上書き＝p_fee_amount（null＝自動／0＝なし／正＝指定額・残額まで）。p_fee_on=false は 0 と同じ
    if p_fee_amount is not null and (p_fee_amount < 0 or p_fee_amount > v_due - v_paid) then raise exception 'bad fee_amount'; end if;
    -- ★24 0175 v2（裁定421 候補）: 手数料の「なし／指定」＝cast は不可・staff は sys_staff_discount=1 かつ カット額（店の率の手数料 − 指定額）が staff_discount_cap 以内
    if p_fee_amount is not null and public.auth_role() = 'cast' then raise exception 'forbidden'; end if;
    if p_fee_amount is not null and public.auth_role() = 'staff' then
      if coalesce((coalesce(v_settings, '{}'::jsonb)->>'sys_staff_discount')::int, 0) <> 1 then raise exception 'forbidden'; end if;
      if round(p_amount * v_store_rate / 100.0)::int - p_fee_amount > coalesce((coalesce(v_settings, '{}'::jsonb)->>'staff_discount_cap')::int, 0) then raise exception 'over cap'; end if;
    end if;
    v_fee_source := case when (p_fee_amount is not null and p_fee_amount = 0) or not p_fee_on then 'none'
                         when p_fee_amount is not null then 'manual' else 'auto' end;
    if v_fee_source <> 'auto' then v_rate := 0; end if;
    v_override := (not p_fee_on and v_store_rate > 0) or (p_fee_rate is not null and p_fee_rate <> v_store_rate)
                  or v_fee_source = 'manual' or (v_fee_source = 'none' and p_fee_amount is not null and v_store_rate > 0);
    if v_rate > 0 or v_fee_source = 'manual' then
      v_fee := case when v_fee_source = 'manual' then p_fee_amount else round(p_amount * v_rate / 100.0)::int end;
      if v_fee > 0 then
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)   -- ★1 0175: +fee_rate（適用率の記録）
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', v_grp,
                (case v_fkey when 'card' then 'カード手数料 ' when 'emoney' then '電子マネー手数料 ' else '決済手数料 ' end) || (case when v_fee_source = 'manual' then '（指定）' else rtrim(rtrim(to_char(v_rate, 'FM990.0'), '0'), '.') || '%' end),   -- ★1 0175: 小数 1 桁（10 → '10%'・3.5 → '3.5%'）
                v_fee, 1, v_fee, null, v_sort, false, 'pay_fee', 'taxable_10', case when v_fee_source = 'manual' then null else v_rate end)   -- ★21 v2: 指定額は率なし
        returning id into v_fid;
        perform public.check_recalc(p_check_id);
        v_due2 := public.check_group_due(p_check_id, v_grp);
        v_fee_eff := greatest(0, v_due2 - v_due);
      end if;
    end if;
  end if;

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  v_mem := public.auth_membership_id();   -- ★3 0173（裁定389）: kiosk は null
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail, by_membership, fee_amount, fee_source)   -- ★3 0173: +by_membership・★21 v2: +fee_amount／fee_source
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount + v_fee_eff, p_tendered, p_idem_key, v_actor, v_detail, v_mem, v_fee, v_fee_source)   -- ★6 0173: 受取額＝入金額＋手数料（due の増分）
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id) || jsonb_build_object('pay_fee', v_fee, 'pay_fee_eff', v_fee_eff, 'pay_fee_rate', v_rate, 'pay_fee_line_id', v_fid,
      'pay_fee_on', p_fee_on, 'pay_fee_store_rate', v_store_rate, 'pay_fee_override', v_override,
      'pay_fee_amount', v_fee, 'pay_fee_source', v_fee_source,   -- ★21 v2
      'pay_discount', v_disc, 'pay_discount_rate', v_drate, 'pay_discount_line_id', v_did, 'pay_discount_base', v_dbase, 'pay_discount_manual', v_dman), v_chk.store_id);   -- ★6 0173: 手数料の痕跡・★1 0175: ON／OFF・店設定の率・上書きの有無・★11 v2: 割引
  if v_override then   -- ★1 0175（裁定393 追補2）: 店設定と異なる率／OFF は別の audit 行（操作者＝by_membership・kiosk は null）
    perform public.audit_log_write('pay_fee_override', 'payments:' || v_id::text,
      jsonb_build_object('store_rate', v_store_rate), jsonb_build_object('fee_on', p_fee_on, 'fee_rate', v_rate, 'fee_amount', v_fee, 'fee_source', v_fee_source, 'by_membership', v_mem), v_chk.store_id);   -- ★21 v2: 実額と source
  end if;

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    if not public.ar_policy_ok(v_chk.store_id, p_amount) then raise exception 'ar disabled'; end if;   -- ★3 0155（裁定309-1）: 0055:165 の 1 行＝店設定 ar_enabled=false なら売掛不可
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
  v_prev_kinds text[]; v_kind_chg timestamptz[]; v_k text;  -- ★0169（裁定341）: 場内→本指名の切替前に出た行は旧区分で計算（非遡及）
  v_bizdate date;                       -- ★0132 裁定113: 伝票営業日(started_at 起点)
  v_modes text[]; v_rates int[];        -- ★0132: cast 別の商品バック方式/率
  v_salesbase int[];                    -- ★0132: 同腕の按分売上母数(plan_rate/plan_fixed 監査用)
  v_units int[]; v_fixeds int[];        -- ★0133 裁定123: 同腕の按分本数Σ / cast 別の円/本固定額
  v_mode text; v_rate int; v_fixed int; -- ★0132/0133: 解決作業用
  v_ov jsonb[]; v_pf_hon int[]; v_pf_jonai int[]; v_pf_free int[]; v_fixedamt int[];   -- ★9 0153（305-12）: cast 別の overrides／プラン区分別／plan_fixed の凍結額
  v_ovj jsonb; v_pfh int; v_pfj int; v_pff int; v_reg text; v_funit int;               -- ★9 0153: 解決作業用
  v_years int;                                                                          -- ★9 0153（305-11）: customer_retention_years（既定 5）
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_close');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then raise exception 'forbidden'; end if;   -- ★0200（裁定473）: 「注文のみ」の cast は締め不可（check_pay と同型）
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足(∀g: paid(g) ≥ due(g))＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配(最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_kind='hon' の行のみ=裁定100)
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id),
         array_agg(nom_kind order by position, created_at, id),
         array_agg(is_dohan order by position, created_at, id),
         array_agg(prev_kind order by position, created_at, id),       -- ★0169
         array_agg(kind_changed_at order by position, created_at, id)  -- ★0169
    into v_cast_ids, v_weights, v_kinds, v_dohans, v_prev_kinds, v_kind_chg
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    if v_sumw > 0 then  -- ★0124 判断B: 全 weight 0(全員 ended 等)=按分なし(整数除算ガード)
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    v_salesbase := array_fill(0, array[v_n]);  -- ★0132
    v_units := array_fill(0, array[v_n]);      -- ★0133
    -- ★0132 裁定113: 伝票営業日(started_at)時点の cast_plan から商品バック方式を cast 別に解決。
    --   解決不能(割当なし)=既定 product_rule。重複有効行は valid_from 降順の先頭(決定的・close は止めない)。
    v_bizdate := public.biz_date_of(v_chk.store_id, v_chk.started_at);
    v_modes := array_fill('product_rule'::text, array[v_n]);
    v_rates := array_fill(0, array[v_n]);
    v_fixeds := array_fill(0, array[v_n]);     -- ★0133
    v_ov := array_fill('{}'::jsonb, array[v_n]); v_pf_hon := array_fill(null::int, array[v_n]); v_pf_jonai := array_fill(null::int, array[v_n]);   -- ★9 0153
    v_pf_free := array_fill(null::int, array[v_n]); v_fixedamt := array_fill(0, array[v_n]);                                                        -- ★9 0153
    for i in 1..v_n loop
      select p.product_back_mode, coalesce(p.product_back_rate, 0), coalesce(p.product_back_fixed, 0),
             coalesce(cp.overrides_json, '{}'::jsonb), p.product_back_fixed_hon, p.product_back_fixed_jonai, p.product_back_fixed_free   -- ★9 0153: 区分別の器を併読
        into v_mode, v_rate, v_fixed, v_ovj, v_pfh, v_pfj, v_pff
        from public.cast_plan cp
        join public.comp_plans p on p.id = cp.plan_id
       where cp.cast_id = v_cast_ids[i]
         and cp.org_id = v_chk.org_id
         and cp.valid_from <= v_bizdate
         and (cp.valid_to is null or cp.valid_to >= v_bizdate)
       order by cp.valid_from desc
       limit 1;
      if found then v_modes[i] := v_mode; v_rates[i] := v_rate; v_fixeds[i] := v_fixed;
        v_ov[i] := v_ovj; v_pf_hon[i] := v_pfh; v_pf_jonai[i] := v_pfj; v_pf_free[i] := v_pff;   -- ★9 0153
      end if;
    end loop;
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外(凍結値で判定・キー無し=false=按分対象)
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価(productBackOf と同一規則・凍結値)。★0119: unit4 はキャスト別キーで集計ループ内に解決
      if (v_line.back_snapshot ->> 'back_mode') is distinct from 'unit4' then
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配(床=整数除算・剰余降順→position 昇順)
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計(★0132: cast 別 mode で分岐。同一行集合・同一 v_alloc=同腕)
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          v_k := case when v_kind_chg[i] is not null and v_line.created_at < v_kind_chg[i] then coalesce(v_prev_kinds[i], v_kinds[i]) else v_kinds[i] end;  -- ★0169: 行の作成が切替より前＝旧区分（既出のドリンクは注文時点の率）
          if v_modes[i] = 'plan_rate' then
            -- ★0132: 売上按分のみ凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
          elsif v_modes[i] = 'plan_fixed' then
            -- ★0133: 売上按分(監査用)+按分本数を凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
            v_units[i] := v_units[i] + v_alloc[i];
            -- ★9 0153（305-12／296 追補2）: 1 本あたり固定額の解決順＝商品 unit4（back_mode='unit4'）→ cast_plan 区分別 → comp_plans 区分別 → 一律。同伴＝本指名（unit4 は自分の dohan キー）
            v_reg := public.nom_unit4_key(v_k, v_dohans[i]);
            v_funit := null;
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_funit := (v_line.back_snapshot -> 'unit4' ->> v_reg)::int;
            end if;
            if v_reg = 'dohan' then v_reg := 'hon'; end if;
            if v_funit is null then v_funit := (v_ov[i] ->> ('productBackFixed' || initcap(v_reg)))::int; end if;
            if v_funit is null then v_funit := case v_reg when 'hon' then v_pf_hon[i] when 'jonai' then v_pf_jonai[i] else v_pf_free[i] end; end if;
            if v_funit is null then v_funit := v_fixeds[i]; end if;
            v_fixedamt[i] := v_fixedamt[i] + v_funit * v_alloc[i];
          elsif v_modes[i] = 'product_rule' then
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_k, v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_k = 'hon' then  -- ★0119: pt は本指名キャストの行のみ（★0169: 行時点の区分）
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    -- ★0132/0133: mode 別の凍結書込(ゼロ専用行は作らない)
    for i in 1..v_n loop
      if v_modes[i] = 'plan_rate' then
        if v_pt[i] > 0 or v_salesbase[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_rate', v_salesbase[i],
                  round((v_salesbase[i]::numeric * v_rates[i]) / 100.0)::int);
        end if;
      elsif v_modes[i] = 'plan_fixed' then
        -- ★0133: 1本あたり固定額=按分本数Σ×固定額を凍結(plan_rate と同型・payOf 例外を廃止)
        if v_pt[i] > 0 or v_salesbase[i] > 0 or v_units[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_fixed', v_salesbase[i], v_fixedamt[i]);   -- ★9 0153: 区分別の解決額Σ（全部 null なら v_units×一律と同値＝従来）
        end if;
      else
        if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  v_drink[i], v_champ[i], v_bottle[i], v_pt[i],
                  'product_rule', null, null);
        end if;
      end if;
    end loop;
    end if;  -- ★0124 判断B ガード終端
  end if;

  -- ★14 0152（裁定298-10）: 紹介の凍結（frozen_at）＋ 未払 1 件（amount>0 のみ＝298-6 D11・unpaid・withholding 0・営業日＝started_at 起点）。二重 insert は not exists と unique(check_id) の二重化
  update public.check_referrals set frozen_at = now() where check_id = p_check_id and frozen_at is null;
  insert into public.referral_payouts (org_id, store_id, referrer_id, check_id, biz_date, amount, withholding, status)
  select r.org_id, r.store_id, r.referrer_id, r.check_id, public.biz_date_of(v_chk.store_id, v_chk.started_at), r.amount, 0, 'unpaid'
    from public.check_referrals r
   where r.check_id = p_check_id and r.amount > 0
     and not exists (select 1 from public.referral_payouts p where p.check_id = p_check_id);
  -- ★9 0153（305-11／293-4）: 伝票に紐づく顧客の last_visit_at＝now()・retention_until＝＋店設定 customer_retention_years（既定 5）
  select coalesce(nullif(s.settings_json->>'customer_retention_years', '')::int, 5) into v_years from public.stores s where s.id = v_chk.store_id;
  update public.customers cu
     set last_visit_at = now(), retention_until = (now() + make_interval(years => coalesce(v_years, 5)))::date, updated_at = now()
   where cu.id in (select cc.customer_id from public.check_customers cc where cc.check_id = p_check_id)
      or cu.id = v_chk.customer_id;
  -- ★5 0173（裁定392）: 会計でキープ確定＝この伝票の購入行に紐づく pending → active
  update public.bottle_keeps b
     set status = 'active', opened_at = now(), updated_at = now()
   where b.status = 'pending'
     and b.check_line_id in (select l.id from public.check_lines l where l.check_id = p_check_id);
  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;
CREATE OR REPLACE FUNCTION public.check_extension_add(p_check_id uuid, p_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_mode text; v_units int; v_sort int; v_paycnt int; v_id uuid;
  v_emin int; v_efee int;  -- ★mig0098 R2-1: 選択メニュー(null=既定スナップ)
  v_org uuid;
  v_seat_kind text; r_fee record; v_nom record; v_sort2 int; v_id2 uuid;  -- ★0124 裁定111-7
  v_eunit text; v_eunit_menu text;  -- ★mig0130: 実効単位(メニュー unit キー/ext_unit/time_per)
  v_pick jsonb;  -- ★0187（便 EXT）: 時間帯に合う行
  v_label text;  -- ★23 0175 v2（裁定408 系）: パターン名（延長行に併記・既定＝選択中 ext_rule_id の label）
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_extension_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  if v_chk.ext_min < 1 or v_chk.ext_fee < 0 or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;
  -- ★manual 専用(auto 店は check_time_charge_apply が権威=二重計上封じ)
  select time_mode into v_mode from public.stores where id = v_chk.store_id;
  if v_mode is distinct from 'manual' then raise exception 'auto mode'; end if;

  -- ★mig0098 R2-1: p_rule_id null=既定(checks スナップ ext_min/ext_fee=現行完全互換)。
  --   指定時は ext_menu_snap(開栓時凍結)から解決=live pricing_rules は読まない(凍結原則 R2-4)。
  --   snap に無い id・旧伝票(snap null)への指定は 'bad rule'
  --   ★mig0130: 単位も凍結値から=既定は checks.ext_unit・メニュー指定は項目の unit キー。
  --     旧 snap(unit キーなし)・旧伝票(ext_unit null)は time_per フォールバック=現行同値
  v_emin := v_chk.ext_min;
  v_efee := v_chk.ext_fee;
  v_eunit := coalesce(v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  if p_rule_id is not null then
    select (m.value->>'duration_min')::int, (m.value->>'amount')::int,
           nullif(m.value->>'unit', ''), m.value->>'label' into v_emin, v_efee, v_eunit_menu, v_label   -- ★23 v2: +label
      from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
     where (m.value->>'rule_id')::uuid = p_rule_id;
    if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then
      raise exception 'bad rule';
    end if;
    v_eunit := coalesce(v_eunit_menu, v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  end if;
  -- ★23 0175 v2（裁定408 系）: 既定（p_rule_id null）は選択中のパターン（checks.ext_rule_id）の label を併記（旧伝票＝null）
  if p_rule_id is null and v_chk.ext_rule_id is not null then
    select m.value->>'label' into v_label from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m where (m.value->>'rule_id')::uuid = v_chk.ext_rule_id;
  end if;
  -- ★0187（便 EXT・Agoora 確定 10/27（2））: 既定（p_rule_id null）＝この延長の開始時刻（＝今）の時間帯に合う行を凍結メニューから選ぶ（時間帯つき→選択中のパターン→既定）。
  --   0187 前に開いた伝票（band キーなしの凍結）・合う行なし＝v_pick null＝従来どおり（checks の ext_min／ext_fee／ext_rule_id の label）
  if p_rule_id is null then
    v_pick := public.ext_menu_pick(v_chk.ext_menu_snap, (select b.biz_min from public.biz_minutes_of(v_chk.store_id, now()) b), v_chk.ext_rule_id, null);
    if v_pick is not null and (v_pick->>'duration_min')::int >= 1 and (v_pick->>'amount')::int >= 0 then
      v_emin := (v_pick->>'duration_min')::int; v_efee := (v_pick->>'amount')::int;
      v_eunit := coalesce(nullif(v_pick->>'unit', ''), v_chk.ext_unit, v_chk.time_per); v_label := v_pick->>'label';
    end if;
  end if;
  -- ★mig0130: 防御深度(凍結値の妥当性)
  if v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_units := case when v_eunit = 'person' then coalesce(v_chk.people, 1) else 1 end;  -- ★mig0130: ext_unit 起点
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_lines where check_id = p_check_id;
  -- 1押し=1行(time_auto=false=部分ユニーク非対象・客確認の記録が行数で残る・取消は remove_line)
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto, fee_kind)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          case when v_label is null then '延長料金(' || v_emin || '分)' else '延長料金（' || v_label || '）' end, v_efee, v_units,   -- ★23 v2: パターン名を併記
          v_efee * v_units, null, v_sort, false, 'extension')
  returning id into v_id;

  -- ★0124 裁定111-7 判断D/E/G: 延長指名料。ext_shimei は指名料の性質=延長人数(v_units)非連動・qty=1/cast
  if (select st.ext_shimei_enabled from public.stores st where st.id = v_chk.store_id) then
    select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
    select * into r_fee from public.pricing_resolve_core(
      v_chk.store_id, v_chk.started_at, 'ext_shimei', v_seat_kind, null);  -- rank 非対応(判断D)
    if r_fee.amount is not null then  -- ルールヒットなし=課金しない(skip)
      for v_nom in select cast_id from public.check_nominations
                    where check_id = p_check_id and nom_kind = 'hon' and ended_at is null
                    order by position
      loop
        select coalesce(max(sort_order), 0) + 1 into v_sort2
          from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '延長指名料', r_fee.amount, 1, r_fee.amount, null, v_sort2, 'ext_shimei', v_nom.cast_id)
        returning id into v_id2;
        perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id2::text, null,
          (select to_jsonb(l) from public.check_lines l where l.id = v_id2), v_chk.store_id);
      end loop;
    end if;
  end if;

  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_cast record; v_id uuid; v_sort int; v_paycnt int;
  v_seat_kind text; v_fee_kind text; v_name text; v_price int;
  v_org uuid; r_fee record; v_dup uuid;  -- ★0119 裁定102
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_shimei_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_kind is null or p_kind not in ('hon','jonai') then raise exception 'bad kind'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- ★0119 裁定102: 同キー再送（連打・リトライ）は既存行を返す＝行は指名事実1回の記録（unique は張らない）
  if p_idem_key is not null then
    select id into v_dup from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  -- キャスト検証（同 org・伝票の店と同店・在籍）★A1: is_active は CC 照合対象
  select c.id, c.store_id, c.rank_id, c.is_active into v_cast
    from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;

  -- 席種＝伝票の現在席（席移動後はその席の料率＝運用整合）・時間軸＝started_at（凍結）
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
  v_fee_kind := case p_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
  select * into r_fee from public.pricing_resolve_core(
    v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
  if r_fee.amount is not null then
    v_price := r_fee.amount;
  else
    select case when p_kind = 'hon' then st.hon_fee else st.jonai_fee end
      into v_price from public.stores st where st.id = v_chk.store_id;
  end if;
  v_name := case p_kind when 'hon' then '本指名料' else '場内指名料' end;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, p_cast_id, p_idem_key)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  -- audit: 行 jsonb（name_snapshot は料金名・cast は id のみ＝PII なし既存流儀）
  perform public.audit_log_write('check_shimei_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.check_dohan_add(p_check_id uuid, p_cast_id uuid, p_count integer DEFAULT 1, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid; v_sort int; v_paycnt int; v_price int;
  v_org uuid; v_cast record; v_dup uuid;  -- ★0119 裁定100/102
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_dohan_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
  if p_cast_id is null then raise exception 'cast required'; end if;  -- ★0119 裁定100 A-5: 同伴料は cast 必須
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- ★0119 裁定102: 同キー再送は既存行を返す
  if p_idem_key is not null then
    select id into v_dup from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- キャスト検証（同 org・同店・在籍）＝check_shimei_add と同型
  select c.id, c.store_id, c.is_active into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  select coalesce(v_chk.dohan_fee, st.dohan_fee) into v_price
    from public.stores st where st.id = v_chk.store_id;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          '同伴料', v_price, p_count, v_price * p_count, null, v_sort, 'dohan', p_cast_id, p_idem_key)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_dohan_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.check_time_charge_apply(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_set_id uuid; v_ext_id uuid; v_k int;  -- ★mig0097: block ループ用
  v_org uuid;  -- ★0057(2)
  v_eunits int;  -- ★mig0130: ext 実効単位の units
  v_pick jsonb; v_fee_k int;  -- ★0187（便 EXT）: ブロックごとの額
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_time_charge_apply');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 裁定(c): 入金後に合計が動く経路を塞ぐ（check_remove_line と同じ保守側。
  -- check_add_line の非対称は裁定台帳に既知事項として記録済み＝今回は触らない）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 防御深度: スナップ5値の妥当性（checks 列 CHECK が正・型/列事故の検知用＝E1【決定1】流儀）
  -- ★mig0130: 実効単位2値も防御対象へ(null は time_per へ収束=旧伝票互換)
  if v_chk.set_min < 1 or v_chk.ext_min < 1 or v_chk.set_fee < 0 or v_chk.ext_fee < 0
     or v_chk.time_per not in ('table','person')
     or coalesce(v_chk.set_unit, v_chk.time_per) not in ('table','person')
     or coalesce(v_chk.ext_unit, v_chk.time_per) not in ('table','person') then
    raise exception 'bad time settings';
  end if;

  -- サーバ計算（モック Lp 写し・経過は「完了分」＝floor・浮動小数を金額に持ち込まない）
  -- ★mig0089: 式は改稿前と逐語同一＝金額不変（行の持ち方だけ分離）
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  -- ★mig0130: units 2系統化(set=set_unit・ext=ext_unit・null→time_per=現行同値)
  v_units  := case when coalesce(v_chk.set_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_eunits := case when coalesce(v_chk.ext_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  v_set_c := v_chk.set_fee * v_units;
  -- ★mig0097: v_ext_c は式では出せない（凍結ブロックの units は現況と異なり得る）＝
  --   行生成の後に Σline_total で実測確定し、v_total もそこで算出する

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_before
    from public.check_lines l where l.check_id = p_check_id and l.time_auto;

  -- ★mig0089: legacy 合算1行（fee_kind null）の移行吸収＝apply 自身が delete。
  --   closed 伝票は本 RPC が触れない（not open ガード）＝歴史は不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind is null;

  -- ★mig0097: 旧形式の合算 extension 行（block_no null）の移行吸収（0089 の fee_kind null 吸収と
  --   同型）。closed 伝票は本 RPC が触れない＝歴史不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no is null;

  -- ★mig0097b: check_open 由来の block_no null な set 行の移行吸収（extension null 吸収と対称）。
  --   3列ユニークは NULL distinct のため null set 行には効かず、放置すると block_no=0 行との
  --   二重化（set 額の過大計上）が起きる＝実バグの封鎖。null しか無い初回 apply でも、
  --   null+0 の二重化が既に起きた伝票でも、この delete→直後の 0 行 upsert で単一行へ収束する。
  --   check_open 側の block_no=0 化（再生産の停止）は 0098（R2-a・check_open 改稿）で実施。
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'set' and block_no is null;

  -- set 行（額>0 のみ実体化・0 なら既存 auto set 行を削除＝総額保存則）
  -- ★mig0097: block_no=0 固定（R2-7 改訂）・conflict 推論は3列。set=全遡及（現況 units）の意味論不変
  if coalesce(v_chk.set_frozen, false) then
    null;   -- ★2 0173（裁定386）: セット終了後に人数が変わった伝票＝セット行は凍結（引き直さない・削除もしない）
  elsif v_set_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            'セット料金(' || v_chk.set_min || '分)', v_chk.set_fee, v_units, v_set_c,
            null, v_sort, true, 'set', 0)
    on conflict (check_id, fee_kind, block_no) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot
    returning id into v_set_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'set';
  end if;

  -- extension 行（★mig0097 R2-7/R2-7b: ブロック単位＝終了済みは凍結・進行中のみ現況 units）
  --   時計逆行等で v_blocks を超えた行が残った場合は削除（決定性の維持）
  --   ★mig0130: ext の units は v_eunits(ext_unit 起点)
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension'
     and block_no is not null and block_no > v_blocks;

  if v_blocks = 0 or v_chk.ext_fee = 0 then
    -- ブロックなし or 単価0＝額>0 のみ実体化原則（0089 の else 分岐と同義）
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  else
    for v_k in 1..v_blocks loop
      -- ★0187（便 EXT・Agoora 確定 10/27（2））: このブロックの開始時刻（入店＋セット＋前のブロック）の時間帯に合う行の額（長さ＝ext_min の行だけ・時間帯つき→選択中のパターン→既定）。
      --   0187 前に開いた伝票（band キーなし）・合う行なし＝従来の ext_fee
      v_pick := public.ext_menu_pick(v_chk.ext_menu_snap, (select b.biz_min from public.biz_minutes_of(v_chk.store_id, v_chk.started_at + make_interval(mins => v_chk.set_min + (v_k - 1) * v_chk.ext_min)) b), v_chk.ext_rule_id, v_chk.ext_min);
      v_fee_k := coalesce((v_pick->>'amount')::int, v_chk.ext_fee);
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_lines where check_id = p_check_id;
      if v_d >= v_chk.set_min + v_k * v_chk.ext_min then
        -- 終了済みブロック＝凍結（既存行 do nothing 不触・無ければ現況 units で初回生成＝R2-7b）
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do nothing;
      else
        -- 進行中ブロック（k=v_blocks のみ到達）＝現況 units で upsert
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do update
           set unit_price_snapshot = excluded.unit_price_snapshot,
               qty                 = excluded.qty,
               line_total          = excluded.line_total,
               name_snapshot       = excluded.name_snapshot;
      end if;
    end loop;
    select l.id into v_ext_id from public.check_lines l
     where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension'
     order by l.block_no desc limit 1;
  end if;

  -- ★mig0097: ext は行実測で確定（凍結行の units 混在を正しく合算）
  select coalesce(sum(l.line_total), 0)::int into v_ext_c from public.check_lines l
   where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension';
  v_total := v_set_c + v_ext_c;

    perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_time_charge_apply', 'checks:' || p_check_id::text,
    v_before,
    (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
       from public.check_lines l where l.check_id = p_check_id and l.time_auto),
    v_chk.store_id);

  return jsonb_build_object('elapsed_min', v_d, 'units', v_units, 'blocks', v_blocks,
                            'set_c', v_set_c, 'ext_c', v_ext_c, 'total', v_total,
                            'set_line_id', v_set_id, 'ext_line_id', v_ext_id,
                            'ext_units', v_eunits);  -- ★mig0130: 追加キー('units' は set 側で据え置き)
end $function$;
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid, p_set_rule_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
  v_units int;  -- ★0089
  v_dow2 smallint; v_bm2 int; v_cut2 int; v_settings2 jsonb; v_cutoff2 text; v_seatk text;  -- ★mig0098
  v_ext_menu jsonb;  -- ★mig0098 R2-1: 延長メニュー凍結
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 税設定の凍結
  v_cat_name text;  -- ★mig0128(裁定116-2): 区分名の凍結用
  v_rule_name text;  -- ★mig0129(裁定119): 適用ルール名の凍結用
  r_vip record; v_vfee int; v_vunit text; v_vname text; v_vunits int; v_vid uuid;  -- ★mig0130(裁定118): vip_charge
  v_sunit text; v_eunit text;  -- ★mig0130: set/ext の実効課金単位(rule.billing_unit ?? time_per)
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_open');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.service_rate_by_seat,   -- ★1 0181（CANON ②）: 卓種別のサービス率（0175 ★11 の列・{"VIP": 35} の形＝seats.kind がキー）
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee,
         st.business_tax_status, st.price_display, st.tax_rounding  -- ★mig0113
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id() and public.auth_cast_check_allowed(null)   -- ★0200（裁定473）: 会計できる卓＝own の店では cast は開卓不可（開卓時は指名が無い）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★mig0128(裁定116-2): 区分検証(同 org・同店・active のみ)。null=全区分=現行同値。
  --   配置は既存 open 再利用の後=区分は「新規開栓の凍結時」にのみ意味を持つ
  --   (再利用返却の冪等挙動は不変)。名称も同時取得=checks へ凍結(マスタ改名は非遡及)
  if p_category_id is not null then
    select pc.name into v_cat_name
      from public.pricing_categories pc
     where pc.id = p_category_id
       and pc.org_id = v_org
       and pc.store_id = v_seat.store_id
       and pc.is_active;
    if v_cat_name is null then raise exception 'bad category'; end if;
  end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  --   ★mig0128: 区分を3呼びすべてへ引渡し(裁定116-2・区分も開栓凍結=裁定117)
  --   ★mig0130(裁定118): 4呼び目=vip_charge(VIP 限定は seat_kind 条件で表現=特殊分岐なし)
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',        v_seat.kind, null, p_category_id);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension',  v_seat.kind, null, p_category_id);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',      v_seat.kind, null, p_category_id);
  select * into r_vip from public.pricing_resolve_core(v_seat.store_id, now(), 'vip_charge', v_seat.kind, null, p_category_id);  -- ★mig0130

  -- ★mig0098 R2-5: 開卓時ルール手動選択（override）。null=自動一致（現行完全互換）。
  --   検証: 同店・fee_kind='set'・is_active（他店/他種/無効は 'bad rule'）。選び直し不可＝
  --   開卓やり直し（void→再開卓）の現行運用（設計書 R2-5）
  --   ★mig0128: override は明示選択につき区分フィルタ不適用（区分違いのルールも指名可）
  --   ★mig0130: billing_unit も指名ルールから取得(select へ追加)
  if p_set_rule_id is not null then
    select r.amount as amount, r.duration_min as duration_min, r.id as rule_id,
           r.billing_unit as billing_unit into r_set
      from public.pricing_rules r
     where r.id = p_set_rule_id and r.store_id = v_seat.store_id
       and r.fee_kind = 'set' and r.is_active;
    if r_set.rule_id is null then raise exception 'bad rule'; end if;
  end if;

  -- ★mig0129(裁定119): 適用セットルールの凍結。r_set.rule_id は自動解決 or override 確定値。
  --   name null ルールは null 凍結(UI 非表示規則)・フォールバック(rule_id null)は両列 null
  --   =0129 以前の既存伝票と同表現(区別しない・「基本料金」誤表示経路を作らない)
  if r_set.rule_id is not null then
    select r.name into v_rule_name
      from public.pricing_rules r
     where r.id = r_set.rule_id;
  end if;

  -- ★mig0098 R2-1/R2-2/R2-4: 延長メニュー全件を開栓時に凍結（priority 順・limit なし）。
  --   ★鏡像規律: 下の where は pricing_resolve_core（extension・rank null 呼び）と同一式。
  --     core は limit 1・こちらは全件列挙という差のみ。条件を変えるときは必ず同時改修
  --     （core 側は pin 保全のため不触＝相互参照は本コメントと R2 設計書 v1.1 が正）
  --   ★mig0128(教訓52): 区分条件・区分優先順を core と同時挿入(鏡像2点セット)。
  --     以後 resolve 条件を変えるときは core+本 where の同時改修が必須
  --   ★mig0130: 各項目へ unit キー(実効単位=rule.billing_unit ?? time_per)を凍結追加
  select b.biz_dow, b.biz_min into v_dow2, v_bm2
    from public.biz_minutes_of(v_seat.store_id, now()) b;
  select s.settings_json into v_settings2 from public.stores s where s.id = v_seat.store_id;
  v_cutoff2 := coalesce(nullif(trim(coalesce(v_settings2, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
  v_seatk := coalesce(v_seat.kind, '卓');
  -- ★0187（便 EXT・Agoora 確定 10/27（2））: 凍結メニュー＝その営業日の曜日・席種の延長パターンを時間帯を問わず全行（band つき）＝ext_menu_build（check_move_seat と同じ部品）。
  --   開卓時の既定（ext_fee／ext_min／ext_rule_id＝r_ext）は従来どおり今の時刻で解決＝開卓後に店の設定を変えてもこの卓の料金は動かない（凍結）
  v_ext_menu := public.ext_menu_build(v_seat.store_id, v_seatk, p_category_id, now(), v_seat.ext_min, v_seat.time_per, false);

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  --   ★mig0113: 税設定3値を同スナップへ追補（非遡及＝open 中伝票は旧税設定）
  --   ★mig0128: 区分2値（category_id/category_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0129: 適用ルール2値（set_rule_id/set_rule_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0130: 単位系4値（set_unit/ext_unit/vip_charge_fee/vip_charge_unit）を同スナップへ追補
  --     (実効単位=rule.billing_unit ?? time_per・vip はルール0件=両値 null=dohan_fee 同型)
  v_rate := v_seat.service_rate;
  -- ★1 0181（裁定418 ②・便 ON-2・2026-10-26）: 卓種別のサービス率＝stores.service_rate_by_seat（jsonb・キーは seats.kind そのまま／小文字も可）があればそれを凍結（無ければ店の率＝従来）
  if v_seat.service_rate_by_seat is not null and jsonb_typeof(v_seat.service_rate_by_seat) = 'object' then
    v_rate := coalesce(nullif(trim(v_seat.service_rate_by_seat->>v_seat.kind), '')::int,
                       nullif(trim(v_seat.service_rate_by_seat->>lower(v_seat.kind)), '')::int,
                       v_seat.service_rate);
    if v_rate < 0 or v_rate > 100 then v_rate := v_seat.service_rate; end if;
  end if;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  v_bts  := v_seat.business_tax_status;  -- ★mig0113
  v_pd   := v_seat.price_display;        -- ★mig0113
  v_trnd := v_seat.tax_rounding;         -- ★mig0113
  v_sunit := coalesce(r_set.billing_unit, v_tper);  -- ★mig0130
  v_eunit := coalesce(r_ext.billing_unit, v_tper);  -- ★mig0130
  v_vfee  := r_vip.amount;  -- ★mig0130: 0行=null(dohan 同型)
  v_vunit := case when r_vip.rule_id is not null
                  then coalesce(r_vip.billing_unit, v_tper) end;  -- ★mig0130
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0113: 防御深度（列 CHECK が正・型変更/削除事故の検知用）
  if v_bts not in ('taxable','exempt') or v_pd not in ('tax_included','tax_excluded')
     or v_trnd not in ('floor','round','ceil') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0130: 防御深度(単位2値)
  if v_sunit not in ('person','table') or v_eunit not in ('person','table') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id, ext_menu_snap, opened_by_membership,   -- ★3 0173（裁定389）: 操作者の membership（cast 含む・kiosk は null）
                             ext_rule_id,   -- ★23 0175 v2（裁定408 系）: 開卓時の既定パターン（凍結メニューの既定＝r_ext.rule_id・無ければ null）
                             business_tax_status, price_display, tax_rounding,  -- ★mig0113
                             category_id, category_name,  -- ★mig0128
                             set_rule_id, set_rule_name,  -- ★mig0129
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit)  -- ★mig0130
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu, public.auth_membership_id(),   -- ★3 0173
          r_ext.rule_id,   -- ★23 v2
          v_bts, v_pd, v_trnd,  -- ★mig0113
          p_category_id, v_cat_name,  -- ★mig0128
          r_set.rule_id, v_rule_name,  -- ★mig0129
          v_sunit, v_eunit, v_vfee, v_vunit)  -- ★mig0130
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  -- ★10 0153（裁定305-1）: 開栓時の顧客＝check_customers の position 0（checks.customer_id と併存＝同値）
  if p_customer_id is not null then
    insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
    values (v_org, v_seat.store_id, v_id, p_customer_id, 0, v_actor);
  end if;
  -- ★mig0089: 開卓時に set 行を自動挿入（両モード共通・額>0 のみ＝時間課金を使わない
  --   店は現行同値）。auto 店は以後 check_time_charge_apply が同行を upsert 再計算。
  --   ★mig0130: units は set 実効単位(v_sunit)起点(既存店=billing_unit null→time_per=現行同値)
  v_units := case when v_sunit = 'person' then coalesce(p_people, 1) else 1 end;
  if v_sfee * v_units > 0 then
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            'セット料金(' || v_smin || '分)', v_sfee, v_units, v_sfee * v_units,
            null, 1, true, 'set', 0);  -- ★mig0098 R2-7c: null 再生産の停止（0097b 吸収の本命側）
    perform public.check_recalc(v_id);
    -- ★_r2: 行単位 audit（原則6）。manual 店は apply が来ない＝ここが唯一の書込記録
    perform public.audit_log_write('check_open_set_line',
      'check_lines:' || (select l.id::text from public.check_lines l
                          where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      null,
      (select to_jsonb(l) from public.check_lines l
        where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      v_seat.store_id);
  end if;
  -- ★mig0130(裁定118): vip_charge 行の開栓時1回生成(額>0 のみ実体化・apply 非対象=裁定7)。
  --   kind='charge'・time_auto=true・block_no=0(0097b 教訓: null block_no の再生産禁止・
  --   部分ユニーク3列 (check_id,fee_kind,block_no) where time_auto と整合)・
  --   名称=coalesce(ルール名,'VIPチャージ')。back_snapshot=null=給与不干渉
  if r_vip.rule_id is not null then
    v_vunits := case when v_vunit = 'person' then coalesce(p_people, 1) else 1 end;
    if v_vfee * v_vunits > 0 then
      select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
      insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                      name_snapshot, unit_price_snapshot, qty, line_total,
                                      back_snapshot, sort_order, time_auto, fee_kind, block_no)
      values (v_org, v_seat.store_id, v_id, null, 'charge', 'A',
              coalesce(v_vname, 'VIPチャージ'), v_vfee, v_vunits, v_vfee * v_vunits,
              null, 2, true, 'vip_charge', 0)
      returning id into v_vid;
      perform public.check_recalc(v_id);
      -- 行単位 audit(原則6・set 行と同型=apply が来ない行につき唯一の書込記録)
      perform public.audit_log_write('check_open_vip_line',
        'check_lines:' || v_vid::text, null,
        (select to_jsonb(l) from public.check_lines l where l.id = v_vid),
        v_seat.store_id);
    end if;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id)
      || case when p_set_rule_id is not null
              then jsonb_build_object('override_rule_id', p_set_rule_id)
              else '{}'::jsonb end,
    v_seat.store_id);
  return v_id;
end $function$;

-- ═══ ★15 裁定473: RLS＝'own' の店では cast に本人の卓だけ（checks／check_lines／check_nominations） ═══
drop policy if exists checks_select on public.checks;
create policy checks_select on public.checks for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager')
              or (public.auth_role() = 'staff' and public.auth_staff_can_register())
              or (public.auth_role() = 'cast' and public.auth_cast_can_register() and public.auth_cast_check_allowed(id))));
drop policy if exists check_lines_select on public.check_lines;
create policy check_lines_select on public.check_lines for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager')
              or (public.auth_role() = 'staff' and public.auth_staff_can_register())
              or (public.auth_role() = 'cast' and public.auth_cast_can_register() and public.auth_cast_check_allowed(check_id))));
drop policy if exists check_nominations_select on public.check_nominations;
create policy check_nominations_select on public.check_nominations for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager')
              or (public.auth_role() = 'staff' and public.auth_staff_can_register())
              or (public.auth_role() = 'cast' and public.auth_cast_can_register() and public.auth_cast_check_allowed(check_id))));

commit;
