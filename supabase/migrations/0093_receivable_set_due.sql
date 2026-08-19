-- ═══════════════════════════════════════════════════════════════════════════
-- mig0093: receivable_set_due（売掛 期日管理 #12 の書込経路）自己検証版
--   背景: mig0092 で receivables.due を追加したが、RLS 書込ポリシーなし＝RPC 専任のまま
--         setter が存在しない。本 RPC が唯一の書込経路。
--   billing gate なし＝裁定どおり（事実記録＝ゲート除外。receivable_collect＝清算除外と同列）
--   ★再適用可（create or replace＋ACL 再適用のみ・DDL なし）
--   ★notify pgrst はファイル外・手貼り後に単発
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.receivable_set_due(p_receivable_id uuid, p_due date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_recv record;
begin
  -- null-guard-first（規範形）
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;

  -- gate（org 照合 → owner/manager 自店＝receivable_collect と同型）
  select * into v_recv from public.receivables where id = p_receivable_id;
  if v_recv.id is null or v_recv.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_recv.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- open のみ（collected/deducted/voided の期日変更は無意味＝拒否）
  if v_recv.status <> 'open' then raise exception 'not open'; end if;

  -- 無変更は無音 return（audit を汚さない。p_due null＝期日クリアも正当な値）
  if v_recv.due is not distinct from p_due then return; end if;

  update public.receivables set due = p_due where id = p_receivable_id;

  perform public.audit_log_write('receivable_set_due', 'receivables:' || p_receivable_id::text,
    jsonb_build_object('due', v_recv.due),
    jsonb_build_object('due', p_due),
    v_recv.store_id);
end $function$;

revoke execute on function public.receivable_set_due(uuid, date) from public, anon;
grant  execute on function public.receivable_set_due(uuid, date) to authenticated, service_role;

commit;
