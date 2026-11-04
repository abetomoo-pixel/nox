-- 0194_manager_open5.sql（裁定444 の「店長に開く 5」＋admin の CHECK 外し＋スタッフ給与の確定額（staff_labor_confirmed＝裁定445）＋キオスクの在庫タイル（kiosk_stock_levels）・2026-11-04 新 CC 起草＝下書き・未手貼り）
-- 翻訳元: live pg_get_functiondef（2026-11-04・0193 適用後）＋生成器 docs/tmp/gen_0194.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の表と RPC は生成器の文字列）
--   根拠＝台帳 裁定444（2026-11-04 確定・開く 5＝Agoora 確定）・裁定439（確定額の保存は 0194）・裁定445（確認 4 点＝内訳ごと凍結・時給は再計算・保存は 1 RPC・在庫は読取だけ）・相談役 11/03 ③（admin の CHECK 外しは 0194）・docs/tmp/k2_plan.md（在庫タイル）
-- 検証クエリ: 末尾 ===== verify =====（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- ★1 店長に開く（端末の発行・削除／領収書の店情報／スタッフ給与 run の状態） ★2 admin の CHECK 外し ★3 staff_labor_confirmed＋staff_attendance_confirm（4 引数） ★4 kiosk_stock_levels
-- ★教訓132（2026-11-04 採番）: 表の ALTER と稼働中の関数の CREATE OR REPLACE を 1 本で流す＝begin の直後に lock_timeout（待ち続けずに失敗し、単一トランザクションで無傷のまま貼り直せる）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 店長に開く（自店のこと）＝裁定444（2026-11-04 確定）の 5 のうち DDL の 4 関数（④ api/payroll/mark-paid・⑤ api/staff/update-email は route の判定だけ＝client 便） ═══
CREATE OR REPLACE FUNCTION public.kiosk_provision(p_auth_user_id uuid, p_store_id uuid, p_label text, p_purpose text DEFAULT 'punch'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0194（裁定444 ①）: 店長は自店の端末を発行（店ごと 3 台の上限は不変）
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  -- ★0192 M-47: p_purpose は受けて無視（列 purpose は既定 'punch' のまま書く＝CHECK は残す）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then
    raise exception 'bad target';
  end if;
  -- ★0190 M-29: 上限 3 台（無効は数えない）→ ★0192 M-47: 用途を数えない＝店ごと 3 台
  if (select count(*) from public.kiosk_devices k where k.store_id = p_store_id and k.is_active) >= 3 then
    raise exception 'device limit';
  end if;

  insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, purpose)
  values (v_org, p_store_id, p_auth_user_id, nullif(trim(coalesce(p_label,'')), ''), 'punch')
  returning id into v_id;

  perform public.audit_log_write('kiosk_provision', 'kiosk_devices:' || v_id::text,
    null, (select to_jsonb(k) from public.kiosk_devices k where k.id = v_id), p_store_id);
  return v_id;
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_delete(p_device_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0190 M-29 ⑤: 無効化済みの端末を削除（監査に残す・kiosk_sessions の行は先に消す・auth の削除は route）
declare
  v_org uuid := public.auth_org_id(); v_dev record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;   -- ★0194（裁定444 ①）: 店長は自店の端末を削除（無効化済みのものだけ＝従来どおり）
  select * into v_dev from public.kiosk_devices where id = p_device_id and org_id = v_org;
  if v_dev.id is null then raise exception 'not found'; end if;
  if public.auth_role() = 'manager' and v_dev.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- ★0194: 他店の端末は不可
  if v_dev.is_active then raise exception 'still active'; end if;
  delete from public.kiosk_sessions where device_id = p_device_id;
  delete from public.kiosk_devices where id = p_device_id;
  perform public.audit_log_write('kiosk_delete', 'kiosk_devices:' || p_device_id::text, to_jsonb(v_dev), null, v_dev.store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.set_store_receipt_profile(p_store_id uuid, p_address text, p_tel text, p_reg_no text, p_footer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := public.auth_org_id();
  v_store   record;
  v_addr    text := trim(coalesce(p_address, ''));
  v_tel     text := trim(coalesce(p_tel, ''));
  v_reg     text := trim(coalesce(p_reg_no, ''));
  v_footer  text := trim(coalesce(p_footer, ''));
  v_before  jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0194（裁定444 ②）: 店長は自店の領収書の店情報（住所・電話・登録番号・但し書き）を変えられる
  if length(v_addr) > 200 then raise exception 'bad address'; end if;
  if length(v_tel) > 50 then raise exception 'bad tel'; end if;
  if length(v_footer) > 200 then raise exception 'bad footer'; end if;
  if v_reg <> '' and v_reg !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  v_before := jsonb_build_object(
    'receipt_address', coalesce(v_store.settings_json->>'receipt_address', ''),
    'receipt_tel',     coalesce(v_store.settings_json->>'receipt_tel', ''),
    'invoice_reg_no',  coalesce(v_store.settings_json->>'invoice_reg_no', ''),
    'receipt_footer',  coalesce(v_store.settings_json->>'receipt_footer', '')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(settings_json, '{}'::jsonb),
               '{receipt_address}', to_jsonb(v_addr), true),
             '{receipt_tel}',     to_jsonb(v_tel),    true),
           '{invoice_reg_no}',  to_jsonb(v_reg),    true),
         '{receipt_footer}',  to_jsonb(v_footer), true)
   where id = p_store_id;
  perform public.audit_log_write('set_store_receipt_profile', 'stores:' || p_store_id::text,
    v_before,
    jsonb_build_object('receipt_address', v_addr, 'receipt_tel', v_tel,
                       'invoice_reg_no', v_reg, 'receipt_footer', v_footer),
    p_store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.staff_payroll_run_set_status(p_run_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★7 0175（裁定356）: スタッフ給与 run の確定＝open→finalized（finalized_at）→paid（paid_at）の前進のみ。owner のみ（店長自身の報酬を含むため）。audit
-- ★0194（裁定444 ③）: 自店の店長にも開く（キャストの給与確定＝decidePayrollAccess が manager 自店を通しているのと揃える）
declare
  v_org uuid := public.auth_org_id();
  v_row record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;   -- ★0194（裁定444 ③）: 店長は自店の run
  if p_status is null or p_status not in ('finalized','paid') then raise exception 'bad status'; end if;
  select * into v_row from public.staff_payroll_runs where id = p_run_id and org_id = v_org for update;
  if not found then raise exception 'not found'; end if;
  if public.auth_role() = 'manager' and v_row.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- ★0194: 他店の run は不可
  if p_status = 'finalized' and v_row.status <> 'open' then raise exception 'bad transition'; end if;
  if p_status = 'paid' and v_row.status <> 'finalized' then raise exception 'bad transition'; end if;
  update public.staff_payroll_runs
     set status = p_status,
         finalized_at = case when p_status = 'finalized' then now() else finalized_at end,
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where id = p_run_id;
  perform public.audit_log_write('staff_payroll_run_set_status', 'staff_payroll_runs:' || p_run_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', p_status), v_row.store_id);
end $function$;

-- ═══ ★2 既存の役割 admin（0175 ★28・本番 0 行）を memberships の CHECK から外す（相談役 11/03 ③の条件＝0193 では触らず 0194 で）＝行が残っていれば貼れない（単一トランザクションで無傷） ═══
do $$ begin
  if exists (select 1 from public.memberships where role = 'admin') then raise exception '0194: memberships に role=admin の行が % 件ある（本番 0 行の前提・先に役割を変える）', (select count(*) from public.memberships where role = 'admin'); end if;
end $$;
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role = any (array['owner','manager','staff','cast']));
CREATE OR REPLACE FUNCTION public.set_membership_role(p_membership_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★28 0175 v2（裁定425 候補・R-8）: 役割の変更＝staff／manager／admin。管理者の付与・解除はオーナー本人（auth_role_raw）だけ・staff↔manager はオーナーか管理者（auth_role()='owner'）。
--   owner／cast は対象外（オーナーの変更は owner_transfer・キャストは cast_*）。自分の役割は変えない。audit 'set_membership_role'（by_role＝本来の役割）。既存 staff_change_role（staff↔manager）は不変
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_raw  text := public.auth_role_raw();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;                                       -- owner か admin（auth_role は admin→owner）
  if p_new_role not in ('staff','manager','owner') then raise exception 'bad role'; end if;   -- ★0193: 管理者（owner）への変更／管理者からの変更も ★0194: admin は受けない（CHECK からも外した）
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_row.role not in ('staff','manager','owner') then raise exception 'bad target'; end if;   -- ★0193: owner も対象（cast は対象外） ★0194: admin の行は無い（本番 0 行・CHECK から外した）
  if (p_new_role = 'owner' or v_row.role = 'owner') and v_raw <> 'owner' then raise exception 'forbidden'; end if;   -- ★0193: 管理者の任命・解除は管理者（owner）だけ
  perform pg_advisory_xact_lock(hashtext('nox-owner:' || v_org::text));   -- ★0193: 2 人が互いを同時に下げる抜けを防ぐ（org 単位）
  if v_row.role = 'owner' and p_new_role <> 'owner' and not exists (select 1 from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active and m.id <> v_row.id) then raise exception 'last owner'; end if;
  if (p_new_role = 'admin' or v_row.role = 'admin') and v_raw <> 'owner' then raise exception 'forbidden'; end if;   -- 管理者の任命・解除はオーナーだけ
  if v_row.id = public.auth_membership_id() then raise exception 'self'; end if;
  if v_row.role = p_new_role then raise exception 'no change'; end if;
  update public.memberships set role = p_new_role where id = p_membership_id;
  if p_new_role = 'owner' or v_row.role = 'owner' then   -- ★0193: 管理者の増減は既存の管理者全員に知らせる
  -- 既存の管理者全員へ（管理者がいる店ごとに 1 件・宛先 'owners'＝管理者だけが読む）
  insert into public.notices (org_id, store_id, title, body, audience, pinned, created_by)
  select v_org, x.store_id, '管理者の変更', (select coalesce(u.name, '') from public.users u where u.id = v_row.user_id) || ' さんの役割が ' || case v_row.role when 'owner' then '管理者' when 'manager' then '店長' when 'staff' then 'スタッフ' else v_row.role end || ' から ' || case p_new_role when 'owner' then '管理者' when 'manager' then '店長' when 'staff' then 'スタッフ' else p_new_role end || ' に変わりました', 'owners', false, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active)
    from (select distinct m.store_id from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active) x;
  end if;
  perform public.audit_log_write('set_membership_role', 'memberships:' || p_membership_id::text,
    jsonb_build_object('role', v_row.role), jsonb_build_object('role', p_new_role, 'by_role', v_raw), v_row.store_id);
end $function$;

-- ═══ ★3 スタッフ給与の確定額の保存（裁定439・裁定445 ①②）＝月の確定（staff_attendance_confirm）と同じトランザクションで内訳ごと凍結・時給は RPC で再計算して一致・解除で消す ═══
create table if not exists public.staff_labor_confirmed (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  pay_kind text not null check (pay_kind in ('hourly','daily','monthly')),
  hourly integer not null default 0 check (hourly >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  time_pay integer not null default 0 check (time_pay >= 0),
  fixed integer not null default 0 check (fixed >= 0),
  monthly integer not null default 0 check (monthly >= 0),
  daily integer not null default 0 check (daily >= 0),
  days integer not null default 0 check (days >= 0),
  amount integer not null check (amount >= 0),
  deductions jsonb not null default '[]'::jsonb,
  calc_version text not null default '',
  confirmed_by uuid references public.users(id),
  confirmed_at timestamptz not null default now(),
  primary key (membership_id, period)
);
create index if not exists staff_labor_confirmed_store_period_idx on public.staff_labor_confirmed (store_id, period);
comment on table public.staff_labor_confirmed is '★0194（裁定439・445）: スタッフ給与のコストの確定額（店×月の勤怠の確定と同じトランザクションで凍結・解除で消す）。内訳＝時給／実働／時給分／固定手当／月給／日給／出勤日数・控除の内訳（deductions）・計算版（calc_version）。時給制は RPC が時給×実働を再計算して一致を確認（端数は settings_json.labor_rounding＝既定 down）';
alter table public.staff_labor_confirmed enable row level security;
drop policy if exists staff_labor_confirmed_select on public.staff_labor_confirmed;
create policy staff_labor_confirmed_select on public.staff_labor_confirmed for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and store_id = public.auth_store_id()) or membership_id = public.auth_membership_id()));
revoke all on table public.staff_labor_confirmed from public, anon, authenticated;
grant select on table public.staff_labor_confirmed to authenticated;
-- 旧署名（0192＝3 引数）を drop して 4 引数で作り直す（裁定445 ②＝arity 変更）＋ACL 再付与（0192 の client は 3 引数で呼ぶ＝p_labor の既定 null で従来どおり）
drop function if exists public.staff_attendance_confirm(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.staff_attendance_confirm(p_store_id uuid, p_period text, p_lock boolean, p_labor jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ勤怠の月の確定（p_lock=true＝owner／自店 manager）と解除（p_lock=false＝owner のみ）。audit 'staff_attendance_confirm'
-- ★0194（裁定445 ②）: p_lock=true のとき p_labor（スタッフ給与の確定額＝内訳つき）を同じトランザクションで凍結（staff_labor_confirmed・店×月を丸ごと置換）。解除で額も消す。
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
  r      record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_lock is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（相談役確認待ち・推奨案）: 解除も自店の店長に（audit で追える）
  v_had := exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period);
  if p_lock then
    insert into public.staff_attendance_locks (store_id, org_id, period, locked_by)
    values (p_store_id, v_org, p_period, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (store_id, period) do nothing;
    if p_labor is not null then   -- ★0194（裁定445 ②）: 確定と凍結を同一トランザクション（行＝{membership_id, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version}）
      if jsonb_typeof(p_labor) <> 'array' then raise exception 'bad labor'; end if;
      v_rnd := coalesce((select s.settings_json->>'labor_rounding' from public.stores s where s.id = p_store_id), 'down');
      if v_rnd not in ('down','up','round') then v_rnd := 'down'; end if;
      delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;
      for r in select * from jsonb_to_recordset(p_labor) as x(membership_id uuid, pay_kind text, hourly integer, minutes integer, time_pay integer, fixed integer, monthly integer, daily integer, days integer, amount integer, deductions jsonb, calc_version text) loop
        if r.membership_id is null or r.amount is null or r.pay_kind is null then raise exception 'bad labor row'; end if;
        if r.pay_kind not in ('hourly','daily','monthly') then raise exception 'bad pay_kind'; end if;
        if r.amount < 0 or r.amount > 99999999 or coalesce(r.minutes, 0) < 0 or coalesce(r.hourly, 0) < 0 or coalesce(r.fixed, 0) < 0 or coalesce(r.time_pay, 0) < 0 then raise exception 'bad amount'; end if;
        if r.deductions is not null and jsonb_typeof(r.deductions) <> 'array' then raise exception 'bad deductions'; end if;
        if not exists (select 1 from public.memberships m where m.id = r.membership_id and m.store_id = p_store_id and m.role in ('owner','manager','staff')) then raise exception 'bad membership'; end if;
        if r.pay_kind = 'hourly' then   -- ★裁定445 ①: 時給 × 実働 を再計算して一致（端数は店設定）
          v_calc := case v_rnd when 'up' then ceil(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) when 'round' then round(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) else floor(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) end;
          if coalesce(r.time_pay, -1) <> v_calc then raise exception 'labor mismatch: time_pay % <> % (hourly % x minutes % / 60, %)', r.time_pay, v_calc, r.hourly, r.minutes, v_rnd; end if;
          if r.amount <> v_calc + coalesce(r.fixed, 0) then raise exception 'labor mismatch: amount % <> time_pay % + fixed %', r.amount, v_calc, coalesce(r.fixed, 0); end if;
        end if;
        insert into public.staff_labor_confirmed (membership_id, org_id, store_id, period, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, confirmed_by)
        values (r.membership_id, v_org, p_store_id, p_period, r.pay_kind, coalesce(r.hourly, 0), coalesce(r.minutes, 0), coalesce(r.time_pay, 0), coalesce(r.fixed, 0), coalesce(r.monthly, 0), coalesce(r.daily, 0), coalesce(r.days, 0), r.amount, coalesce(r.deductions, '[]'::jsonb), coalesce(r.calc_version, ''), v_by);
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
revoke execute on function public.staff_attendance_confirm(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.staff_attendance_confirm(uuid, text, boolean, jsonb) to authenticated;

-- ═══ ★4 キオスクの在庫タイル＝在庫数の読取（docs/tmp/k2_plan.md 1・裁定445 ③＝読取だけ）。端末の店（auth_kiosk_register_store_id）・操作担当の解除あり（auth_kiosk_operator）・track_stock の品だけ・stock_logs の合計＝product_stock_totals と同じ式。書込（開栓・補充）の kiosk 腕は入れない ═══
CREATE OR REPLACE FUNCTION public.kiosk_stock_levels()
 RETURNS TABLE(product_id uuid, name text, category_id uuid, qty integer, reorder_point integer, sort_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0194: キオスクの在庫タイル（読取のみ）。端末の店の、在庫を数える品（track_stock）の現在庫＝stock_logs の合計（product_stock_totals と同じ式・sum は integer へ明示キャスト）。操作担当の解除（PIN）が無ければ forbidden
declare
  v_store uuid := public.auth_kiosk_register_store_id();
begin
  if v_store is null then raise exception 'forbidden'; end if;
  if public.auth_kiosk_operator() is null then raise exception 'forbidden'; end if;
  return query
  select p.id, p.name, p.category_id, coalesce(sum(l.delta), 0)::integer as qty, p.reorder_point, p.sort_order
    from public.products p
    left join public.stock_logs l on l.product_id = p.id and l.store_id = v_store
   where p.store_id = v_store and p.is_active and p.track_stock
   group by p.id, p.name, p.category_id, p.reorder_point, p.sort_order
   order by p.sort_order, p.name;
end $function$;
revoke execute on function public.kiosk_stock_levels() from public, anon;
grant execute on function public.kiosk_stock_levels() to authenticated;

commit;
-- ===== verify =====（手貼り後に SQL Editor で流す・読取だけ・先頭に貼り先証明）
-- select 'nox-project-proof' k, count(*)::text v from public.orgs
-- union all select 'functions', count(*)::text from pg_proc where pronamespace='public'::regnamespace
-- union all select 'tables', count(*)::text from pg_tables where schemaname='public'
-- union all select 'has 0194', count(*)::text from pg_proc where pronamespace='public'::regnamespace and prosrc like '%0194%'
-- union all select 'new fn kiosk_stock_levels', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_stock_levels'
-- union all select 'staff_attendance_confirm arity 4 (1)', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm' and pronargs=4
-- union all select 'staff_attendance_confirm arity 3 (0)', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm' and pronargs=3
-- union all select 'staff_labor_confirmed rls/policies/grants', (select relrowsecurity::text from pg_class where oid='public.staff_labor_confirmed'::regclass) || '/' || (select count(*)::text from pg_policies where tablename='staff_labor_confirmed') || '/' || (select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='staff_labor_confirmed' and grantee in ('anon','authenticated'))
-- union all select 'staff_labor_confirmed cols (17)', count(*)::text from information_schema.columns where table_schema='public' and table_name='staff_labor_confirmed'
-- union all select 'memberships_role_check without admin', count(*)::text from pg_constraint where conname='memberships_role_check' and pg_get_constraintdef(oid) not like '%admin%' and pg_get_constraintdef(oid) like '%cast%'
-- union all select 'admin rows', count(*)::text from public.memberships where role='admin'
-- union all select 'acl diff (new 1 + arity 4: anon f / auth t / service t)', count(*)::text from (values
--     ('kiosk_stock_levels()',false,true,true),
--     ('staff_attendance_confirm(uuid,text,boolean,jsonb)',false,true,true)
--   ) x(sig, an, au, sr)
--   where to_regprocedure('public.' || x.sig) is null
--      or has_function_privilege('anon', to_regprocedure('public.' || x.sig), 'execute') <> x.an
--      or has_function_privilege('authenticated', to_regprocedure('public.' || x.sig), 'execute') <> x.au
--      or has_function_privilege('service_role', to_regprocedure('public.' || x.sig), 'execute') <> x.sr
-- union all select 'md5 kiosk_provision', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '54135aa2' then ' =file' else ' ≠file(54135aa2)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_provision'
-- union all select 'md5 kiosk_delete', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '9d05ac36' then ' =file' else ' ≠file(9d05ac36)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_delete'
-- union all select 'md5 set_store_receipt_profile', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '06866803' then ' =file' else ' ≠file(06866803)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_store_receipt_profile'
-- union all select 'md5 staff_payroll_run_set_status', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'b1b8fdec' then ' =file' else ' ≠file(b1b8fdec)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_payroll_run_set_status'
-- union all select 'md5 set_membership_role', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '16fcc87e' then ' =file' else ' ≠file(16fcc87e)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_membership_role'
-- union all select 'md5 staff_attendance_confirm', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '9bb9a0be' then ' =file' else ' ≠file(9bb9a0be)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm'
-- union all select 'md5 kiosk_stock_levels', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '5c5a6c7d' then ' =file' else ' ≠file(5c5a6c7d)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_stock_levels';
