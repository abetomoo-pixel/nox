-- mig0091: check_line_set_group（明細の会計グループ付け替え・E8-1b F5）
-- 再適用可（create or replace＋ACL のみ）・手貼り1回
-- ★収蔵原本の由来: 相談役チャット掲出版ファイルは未受領のため、dev live の
--   pg_get_functiondef 逐語（LF 正規化・機械抽出＝0060/0082 方式・記憶再構成なし）を
--   本文とし、begin/commit・貼り先証明・ACL は 0090 と同型＋live proacl 実測
--   （postgres/authenticated/service_role の EXECUTE のみ）に一致させて包んだもの。
--   dev は Agoora 手貼り適用済み（2026-08-18・検証3/3緑）＝本ファイルの関数本文は
--   live prosrc と byte 一致（構造保証＋収蔵時に再突合を実測）。
-- 設計: open 中のみ・payments 0 のみ・グループは RPC 層 '^[A-F]$'（テーブル CHECK は
--   length 1..20 のまま＝後方互換）。time_auto 行は 'time line' 拒否＝自動時間料金は
--   会計A固定（apply の upsert 構造と衝突させない）。末尾 check_recalc＋audit。
-- 検証クエリ（適用後に別実行）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select prosrc from pg_proc where proname = 'check_line_set_group';
--   select proacl from pg_proc where proname = 'check_line_set_group';
--     -- 期待: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   notify pgrst, 'reload schema';

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

CREATE OR REPLACE FUNCTION public.check_line_set_group(p_line_id uuid, p_group text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_paycnt int; v_before jsonb; v_org uuid;
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_group is null or p_group !~ '^[A-F]$' then raise exception 'bad group'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 時間自動行は A 固定（apply の upsert 構造と衝突するため移動不可）
  if v_line.time_auto then raise exception 'time line'; end if;

  v_before := to_jsonb(v_line);
  update public.check_lines set pay_group = p_group where id = p_line_id;
  perform public.check_recalc(v_line.check_id);
  perform public.audit_log_write('check_line_set_group', 'check_lines:' || p_line_id::text,
    v_before, (select to_jsonb(l) from public.check_lines l where l.id = p_line_id),
    v_chk.store_id);
end $function$;

revoke all on function public.check_line_set_group(uuid, text) from public, anon;
grant execute on function public.check_line_set_group(uuid, text) to authenticated, service_role;

commit;
