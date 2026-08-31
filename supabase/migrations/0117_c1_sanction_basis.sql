-- mig 0117 NOX: 裁定98 sanction 二層ガード（器）
--   deductions に根拠確認記録3列 + sanction 時の必須 CHECK
--   set_deduction 6→9引数化（p_kind / p_basis_confirmed / p_basis_note）
-- 底本: 2026-08-31 live pg_get_functiondef（set_deduction 6引数）逐語
-- 冪等: 可（列 if not exists・制約 drop→add・関数 drop→create）
-- 本番注意: 旧6引数署名を明示 DROP。4者 revoke → authenticated/service_role のみ grant。
begin;

-- 1. 器
alter table public.deductions
  add column if not exists basis_confirmed_at timestamptz,
  add column if not exists basis_confirmed_by uuid,
  add column if not exists basis_note text;

comment on column public.deductions.basis_confirmed_at is '裁定98: kind=sanction の根拠（就業規則/契約）確認日時';
comment on column public.deductions.basis_confirmed_by is '裁定98: 確認者 auth.uid()（FK なし・退会後も記録を残す）';
comment on column public.deductions.basis_note       is '裁定98: 確認内容（何を根拠としたか）≤400字';

alter table public.deductions drop constraint if exists deductions_sanction_basis_check;
alter table public.deductions add constraint deductions_sanction_basis_check
  check (
    kind <> 'sanction'
    or (basis_confirmed_at is not null
        and basis_confirmed_by is not null
        and basis_note is not null
        and length(trim(basis_note)) > 0)
  );

-- 2. RPC 差替（旧署名は明示 DROP＝別 overload を残さない）
drop function if exists public.set_deduction(uuid, uuid, text, integer, text, boolean);

create or replace function public.set_deduction(
  p_id uuid,
  p_store_id uuid,
  p_name text,
  p_amount integer,
  p_per text,
  p_is_active boolean,
  p_kind text,
  p_basis_confirmed boolean,
  p_basis_note text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner    uuid;
  v_id       uuid;
  v_before   jsonb;
  v_after    jsonb;
  v_cur_kind text;
  v_kind     text;
  v_at       timestamptz;
  v_by       uuid;
  v_note     text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_per not in ('day','month','rate') then raise exception 'bad per'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_per = 'rate' and p_amount > 100 then raise exception 'bad amount'; end if; -- rate は % 値（100 超は設定ミス）
  if p_kind is not null and p_kind not in
     ('unworked','sanction','statutory','agreed_cost','store_receivable','advance_settlement')
  then raise exception 'bad kind'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既存行（update 時）
  if p_id is not null then
    select to_jsonb(d), d.kind into v_before, v_cur_kind from public.deductions d
      where d.id = p_id and d.org_id = public.auth_org_id() and d.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
  end if;

  -- 教訓43: insert は default 'agreed_cost'・update で null は「不変」（黙戻りで kind を潰さない）
  v_kind := coalesce(p_kind, v_cur_kind, 'agreed_cost');

  -- 裁定98-A: sanction は保存のたびに根拠確認＋記録を必須化（雇用=就業規則／委託=契約）
  if v_kind = 'sanction' then
    if p_basis_confirmed is distinct from true then raise exception 'basis required'; end if;
    if p_basis_note is null or length(trim(p_basis_note)) = 0 then raise exception 'basis required'; end if;
    if length(p_basis_note) > 400 then raise exception 'bad basis note'; end if;
    v_by := auth.uid();
    if v_by is null then raise exception 'forbidden'; end if;
    v_at   := now();
    v_note := trim(p_basis_note);
  else
    v_at := null; v_by := null; v_note := null;
  end if;

  if p_id is null then
    insert into public.deductions
      (org_id, store_id, name, amount, per, is_active, kind, basis_confirmed_at, basis_confirmed_by, basis_note)
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_amount, p_per, coalesce(p_is_active, true),
       v_kind, v_at, v_by, v_note)
    returning id into v_id;
    v_before := null;
  else
    update public.deductions
      set name = trim(p_name), amount = p_amount, per = p_per, is_active = coalesce(p_is_active, true),
          kind = v_kind, basis_confirmed_at = v_at, basis_confirmed_by = v_by, basis_note = v_note
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  select to_jsonb(d) into v_after from public.deductions d where d.id = v_id;
  perform public.audit_log_write('set_deduction', 'deductions:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

-- 3. ACL（教訓43 追記: default privileges の自動 grant を4者 revoke → 必要分 grant）
revoke all on function public.set_deduction(uuid, uuid, text, integer, text, boolean, text, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_deduction(uuid, uuid, text, integer, text, boolean, text, boolean, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
