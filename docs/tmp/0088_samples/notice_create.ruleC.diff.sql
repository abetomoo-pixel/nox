-- サンプル diff: notice_create（規則C・引数=public.auth_org_id()）
-- 追加行: if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if public.auth_org_id() is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Cアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
   SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
  declare
    v_actor uuid; v_title text; v_body text; v_id uuid;
  begin
    if public.auth_org_id() is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
    if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
    -- 検証（title 空/長さ・body 空・audience・pinned 明示値）
    v_title := trim(coalesce(p_title, ''));
    if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
    v_body := trim(coalesce(p_body, ''));
    if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
    if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;

-- ── 変換後 全文 ──
CREATE OR REPLACE FUNCTION public.notice_create(p_title text, p_body text, p_audience text, p_pinned boolean, p_until date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid; v_title text; v_body text; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  -- 検証（title 空/長さ・body 空・audience・pinned 明示値）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by)
  values (public.auth_org_id(), public.auth_store_id(), v_title, v_body, p_audience, p_pinned, p_until, v_actor)
  returning id into v_id;
  perform public.audit_log_write('notice_create', 'notices:' || v_id::text, null,
    (select to_jsonb(n) from public.notices n where n.id = v_id), public.auth_store_id());
  return v_id;
end $function$

