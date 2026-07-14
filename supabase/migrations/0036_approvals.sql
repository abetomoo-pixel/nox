-- 0036_approvals: F3c — 二重承認の土台②（approvals テーブル + RPC・0035 適用後が前提）
-- ★★ 非idempotent（create table + grant を含む）・再適用厳禁 ★★
-- ★★ 順序依存: 必ず 0035（kind='discount' 追加 + check_group_due 改修）の後に適用 ★★
--
-- 設計（相談役確定）:
--  - approvals は P2（会計世界＝checks の RLS に厳密に揃える・can_register ゲート込み・cast 0行）。
--  - 割引は「正の値の discount line」を check_lines へ直接 INSERT（add_line の 'bad price'/'bad kind' を経由回避）。
--    ★案X: line_total=amount(正)・unit_price_snapshot=amount(正)・kind='discount' ＝既存 CHECK(>=0) に抵触せず。
--    合計は改修済み check_group_due が kind='discount' を減算して反映（close の既存合計が拾う）。
--  - RPC3本: approval_request（申請=pending）/ approval_decide（承認=line挿入+却下）/ approval_direct（直接=申請即承認）。
--  - discount line 挿入は内部ヘルパー approval_apply に集約（decide/direct の2経路で同一ロジックを物理保証）。
--    approval_apply は内部専用（4ロール revoke・grant なし＝audit_log_write の流儀・SD 内部呼びのみ）。
--  - grant=mig0032 教訓4（authenticated への自動全権を明示 revoke・SELECT のみ・書込は RPC 経由）。
--  - created_by 系（requested_by/decided_by）は users.id（auth.uid()→users 解決＝checks/shifts と同慣行）。
--
-- 適用後の検証（"Success" だけ信用しない・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) テーブル+制約+RLS+grant を1結果セットで:
--      select
--        (select string_agg(conname,' | ' order by conname) from pg_constraint where conrelid='public.approvals'::regclass) as constraints,
--        (select string_agg(polname||':'||polcmd::text,' | ') from pg_policy where polrelid='public.approvals'::regclass) as policies,
--        (select string_agg(grantee||'='||privilege_type,', ') from information_schema.role_table_grants where table_name='approvals') as tbl_grants,
--        (select relrowsecurity from pg_class where oid='public.approvals'::regclass) as rls_enabled;
--   2) RPC4本の prosrc+ACL:
--      select p.proname, coalesce(array_to_string(p.proacl,','),'default') as acl
--        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname in ('approval_apply','approval_request','approval_decide','approval_direct') order by 1;
--      select pg_get_functiondef('approval_request(uuid, text, text, integer, text)'::regprocedure);
--      select pg_get_functiondef('approval_decide(uuid, boolean)'::regprocedure);
--      select pg_get_functiondef('approval_direct(uuid, text, text, integer, text)'::regprocedure);
--      select pg_get_functiondef('approval_apply(uuid)'::regprocedure);
--      （approval_apply は proacl に authenticated/anon/service_role が現れないこと＝内部専用）
--   3) notify pgrst, 'reload schema';
--   4) 動作アンカー（申請→承認で discount line 生成+合計反映・直接承認・却下・競合 not applicable・
--      amount 超過拒否・no such group・cast 0行・anon BLOCKED・authenticated 直書込遮断）は verify 段28 で実測。

begin;

-- ── テーブル: approvals（P2・checks の世界）──
create table public.approvals (
  id           uuid        not null default gen_random_uuid(),
  org_id       uuid        not null references public.orgs(id),
  store_id     uuid        not null references public.stores(id),
  check_id     uuid        not null references public.checks(id),
  pay_group    text        not null,
  type         text        not null,
  amount       integer     not null,
  status       text        not null default 'pending',
  line_id      uuid        references public.check_lines(id),  -- 承認時に挿入した discount line（approved 後に埋まる）
  reason       text,
  requested_by uuid        not null references public.users(id),
  decided_by   uuid        references public.users(id),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  constraint approvals_pkey primary key (id),
  constraint approvals_pay_group_check check (length(pay_group) >= 1 and length(pay_group) <= 20),
  constraint approvals_type_check check (type in ('discount','free')),
  constraint approvals_amount_check check (amount > 0),
  constraint approvals_status_check check (status in ('pending','approved','rejected')),
  constraint approvals_reason_check check (reason is null or length(reason) <= 200)
);

create index approvals_check_idx on public.approvals (check_id);

alter table public.approvals enable row level security;

-- SELECT（checks_select と同一述語・can_register ゲート込み・cast 0行）
create policy approvals_select on public.approvals
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() in ('owner','manager')
         or (public.auth_role() = 'staff' and public.auth_staff_can_register()))
  );

-- grant（教訓4: authenticated への自動全権を明示 revoke・SELECT のみ・書込は RPC 経由）
revoke all on table public.approvals from public, anon;
grant select on table public.approvals to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.approvals from authenticated;

-- ── 内部ヘルパー: approval_apply（discount line 挿入 + recalc・decide/direct 共通）──
-- 内部専用（4ロール revoke・grant なし）。呼び出し元が auth・open・group・amount を検証済みの前提。
-- ★原則8: 行を書く内部関数のため冒頭 null guard を置く（防御深度）。
create or replace function public.approval_apply(p_approval_id uuid)
 returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ap record; v_sort int; v_line uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_ap from public.approvals where id = p_approval_id;
  if v_ap.id is null then raise exception 'not found'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_lines where check_id = v_ap.check_id;
  -- ★案X: 正の値の discount line（全 NOT NULL 列を充填=0077 教訓・product_id/back_snapshot は null）
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
      name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_ap.org_id, v_ap.store_id, v_ap.check_id, null, 'discount', v_ap.pay_group,
      case when v_ap.type = 'free' then '無料（承認済）' else '割引（承認済）' end,
      v_ap.amount, 1, v_ap.amount, null, v_sort)
  returning id into v_line;
  perform public.check_recalc(v_ap.check_id);   -- 改修済み check_group_due が割引後 total を確定
  return v_line;
end $$;
revoke execute on function public.approval_apply(uuid) from public, anon, authenticated, service_role;

-- ── RPC1: approval_request（申請=pending 作成・line 挿入なし）──
create or replace function public.approval_request(
  p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 申請は黒服 can_register 以上（会計書込ゲート＝check_add_line と同一）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  -- 割引前小計（既存 discount line は除外）
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;                    -- free は小計を焼付け
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status, reason, requested_by)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'pending',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor)
  returning id into v_id;
  perform public.audit_log_write('approval_request', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $$;
revoke execute on function public.approval_request(uuid, text, text, integer, text) from public, anon;
grant  execute on function public.approval_request(uuid, text, text, integer, text) to authenticated;

-- ── RPC2: approval_decide（owner/manager 承認/却下）──
create or replace function public.approval_decide(
  p_approval_id uuid, p_approve boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_ap record; v_actor uuid; v_before jsonb; v_cstatus text; v_line uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_ap from public.approvals where id = p_approval_id;
  if v_ap.id is null or v_ap.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_ap.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_ap.status <> 'pending' then raise exception 'already decided'; end if;
  v_before := to_jsonb(v_ap);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- 承認までに締められた/void 化された競合の防波堤（承認時点で check が open か再確認）
    select status into v_cstatus from public.checks where id = v_ap.check_id;
    if v_cstatus is null or v_cstatus <> 'open' then raise exception 'not applicable'; end if;
    v_line := public.approval_apply(p_approval_id);   -- discount line 挿入 + recalc（共通ヘルパー）
    update public.approvals
       set status = 'approved', line_id = v_line, decided_by = v_actor, decided_at = now()
     where id = p_approval_id;
    perform public.audit_log_write('approval_approve', 'approvals:' || p_approval_id::text, v_before,
      (select to_jsonb(a) from public.approvals a where a.id = p_approval_id), v_ap.store_id);
  else
    update public.approvals
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_approval_id;
    perform public.audit_log_write('approval_reject', 'approvals:' || p_approval_id::text, v_before,
      (select to_jsonb(a) from public.approvals a where a.id = p_approval_id), v_ap.store_id);
  end if;
end $$;
revoke execute on function public.approval_decide(uuid, boolean) from public, anon;
grant  execute on function public.approval_decide(uuid, boolean) to authenticated;

-- ── RPC3: approval_direct（owner/manager 直接＝申請即承認・1トランザクション）──
create or replace function public.approval_direct(
  p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid; v_line uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 直接承認は owner/manager のみ・自店
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 申請即承認: approved で INSERT → discount line 挿入 → line_id 記録（1トランザクション）
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status,
                                reason, requested_by, decided_by, decided_at)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'approved',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor, v_actor, now())
  returning id into v_id;
  v_line := public.approval_apply(v_id);           -- 共通ヘルパー（decide と同一 line 挿入）
  update public.approvals set line_id = v_line where id = v_id;
  perform public.audit_log_write('approval_direct', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $$;
revoke execute on function public.approval_direct(uuid, text, text, integer, text) from public, anon;
grant  execute on function public.approval_direct(uuid, text, text, integer, text) to authenticated;

commit;
