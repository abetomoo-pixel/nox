-- mig0072: set_product v15 の ACL 是正（セキュリティ回帰の修復）
-- 前提: mig0069-0071 適用済み / 冪等（revoke/grant は再実行可）
--
-- ★背景（起草ミスの是正・2件目）:
--   mig0069 は引数追加＝新署名として set_product v15 を新規作成したが、
--   ACL 文（revoke/grant）を書いていなかった。新署名には Supabase の既定 grant が
--   付き直すため、anon/public に EXECUTE が付いた状態で運用に入っていた。
--   関数冒頭の auth_org_id() null ガード（二重防御①）が生きていたため実害はないが、
--   2層防御の外側（ACL）が剥がれた状態＝即時是正対象。
--   verify:nox-anon-guard がこの回帰を検知した（917/918）。
-- ★原則の再確認: revoke from public だけでは無効（anon に直 grant されるため）。
--   必ず public, anon の両方から revoke する。

begin;

revoke execute on function public.set_product(
  uuid, uuid, text, text, text, integer, integer, text, integer, jsonb,
  integer, boolean, integer, uuid, boolean
) from public, anon;

grant execute on function public.set_product(
  uuid, uuid, text, text, text, integer, integer, text, integer, jsonb,
  integer, boolean, integer, uuid, boolean
) to authenticated;

-- 適用後の状態を自己検証（想定外なら適用を失敗させる）
do $do$
declare v_anon boolean; v_pub boolean; v_auth boolean; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'set_product' and p.pronargs = 15;
  if v_oid is null then
    raise exception 'set_product v15 not found';
  end if;
  v_anon := has_function_privilege('anon', v_oid, 'EXECUTE');
  v_pub  := (select coalesce(bool_or(a.grantee = 0), false)
               from pg_proc p, aclexplode(p.proacl) a
              where p.oid = v_oid);
  v_auth := has_function_privilege('authenticated', v_oid, 'EXECUTE');
  if v_anon then raise exception 'anon still has EXECUTE'; end if;
  if v_pub then raise exception 'PUBLIC still has EXECUTE'; end if;
  if not v_auth then raise exception 'authenticated lost EXECUTE'; end if;
end
$do$;

commit;
