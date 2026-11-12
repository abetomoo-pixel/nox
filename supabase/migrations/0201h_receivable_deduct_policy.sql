-- 0201h_receivable_deduct_policy.sql（2026-11-12・裁定485＝売掛の控除は店の方針が cast_liability_allowed の店だけ・裁定293-1 の改め・起票130・貼らない＝合図は相談役）
-- ★1 receivable_mark_deduct＝店の receivable_policy が cast_liability_allowed でなければ 'cast liability not allowed'（customer_only／disabled の店ではキャストの報酬からの控除に回せない）
-- payroll_finalize は触らない（控除の印の付いた売掛を引く式は変えない）。本番の控除の印は 0 件（2026-11-12 読取）＝既存の印の扱いは不要。
-- client＝日報の売掛タブの「給与天引き」ボタンを方針が cast_liability_allowed の店だけに出す・'cast liability not allowed' の文言＝次の client 便。
-- 新設 0・表 0・作り直し 1（同じ署名・ACL 不変＝authenticated と service_role）。ほかの未適用の mig（0201c／0201e／0201g）とは関数が重ならない＝関数の数は変わらない。
-- 翻訳元: live pg_get_functiondef（2026-11-12・0201b 適用後・md5 58084f14＝0055 と同じ）＋生成器 docs/tmp/gen_0201h.cjs（アンカー置換 1 か所）。検証クエリ: docs/tmp/0201h_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';
-- ═══ ★1 receivable_mark_deduct ═══
CREATE OR REPLACE FUNCTION public.receivable_mark_deduct(p_receivable_id uuid, p_consent boolean, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recv  record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_recv from public.receivables where id = p_receivable_id;
  if v_recv.id is null or v_recv.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_recv.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★0201h（2026-11-12・裁定485）: 控除に回せるのは店の売掛の方針が cast_liability_allowed の店だけ（customer_only／disabled は断る＝状態冪等の return より前）
  if (select s.receivable_policy from public.stores s where s.id = v_recv.store_id) is distinct from 'cast_liability_allowed' then raise exception 'cast liability not allowed'; end if;
  -- 状態冪等: 既に天引き対象なら return（consent は初回のみ・再呼びで上書きしない）
  if v_recv.deduct_from_cast then return p_receivable_id; end if;
  -- 印付けは open かつ 責任 cast あり のみ（客のみ売掛は cast 天引き不可）
  if v_recv.status <> 'open' then raise exception 'not open'; end if;
  if v_recv.cast_id is null then raise exception 'no cast'; end if;
  -- ★差し替え1箇所（労基法・全額払い・本人同意・撤回）＝consent_ok 単一関数
  if not public.consent_ok(p_receivable_id, p_consent) then raise exception 'consent required'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.receivables
     set deduct_from_cast = true, consent_at = now(), consent_by = v_actor
   where id = p_receivable_id and status = 'open';

  perform public.audit_log_write('receivable_mark_deduct', 'receivables:' || p_receivable_id::text,
    jsonb_build_object('deduct_from_cast', false),
    jsonb_build_object('deduct_from_cast', true, 'consent_by', v_actor,
                       'note', nullif(trim(coalesce(p_note,'')),'')),
    v_recv.store_id);
  return p_receivable_id;
end $function$;
commit;
