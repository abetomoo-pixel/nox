-- サンプル diff: check_void（規則C・引数=public.auth_org_id()）
-- 追加行: if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if public.auth_org_id() is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Cアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
   SET search_path TO 'public'
  AS $function$
  declare
    v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
    v_pending_claims jsonb;  -- 【F3f】
  begin
    if public.auth_org_id() is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
    if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
    select * into v_chk from public.checks where id = p_check_id;
    if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
    if not (public.auth_role() = 'owner'
            or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
      raise exception 'forbidden';
    end if;

-- ── 変換後 全文 ──
CREATE OR REPLACE FUNCTION public.check_void(p_check_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）の売掛があれば void 拒否（宙吊り/幻影防止＝条件3＋partial）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 【F3f】void 時 pending claim 自動 reject（宙吊り防止＝receivables 'voided' と同型思想・approved は残置＝
  --        給与除外は collect.ts の void フィルタが単一責任点）
  update public.drink_claims
     set status = 'rejected', decided_by = v_actor, decided_at = now()
   where check_id = p_check_id and status = 'pending';
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$

