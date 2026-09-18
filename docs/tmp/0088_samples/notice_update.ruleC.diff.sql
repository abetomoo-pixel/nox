-- サンプル diff: notice_update（規則C・引数=public.auth_org_id()）
-- 追加行: if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if public.auth_org_id() is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Cアンカー PASS / 最初の DML より前 PASS

-- ── 該当箇所（±7行）──
   SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
  declare
    v_row public.notices; v_before jsonb; v_title text; v_body text;
  begin
    if public.auth_org_id() is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
    select * into v_row from public.notices where id = p_notice_id;
    if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
    if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then
      raise exception 'forbidden';
    end if;
    -- 検証（create と同一）
    v_title := trim(coalesce(p_title, ''));

-- ── 変換後 全文 ──
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
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  v_before := to_jsonb(v_row);
  update public.notices
     set title = v_title, body = v_body, audience = p_audience, pinned = p_pinned, until = p_until
   where id = p_notice_id;
  perform public.audit_log_write('notice_update', 'notices:' || p_notice_id::text, v_before,
    (select to_jsonb(n) from public.notices n where n.id = p_notice_id), v_row.store_id);
end $function$

