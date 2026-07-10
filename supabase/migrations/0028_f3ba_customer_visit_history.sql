-- 0028_f3ba_customer_visit_history: F3b-A 塊2-1 — 顧客詳細の来店履歴 RPC（customer_visit_history）
--
-- 手本・裁定参照:
--  - 可視ガードは customer_summary（mig0023・live pg_get_functiondef を 2026-07-10 取得し正本化）と
--    完全同型: owner=org 全店 / manager=自店 / staff=自店∧can_crm / cast=担当客のみ（customers.cast_id）。
--    checks 直 SELECT は can_register 軸（mig0022・cast 遮断）のため、CRM 軸（can_crm）への
--    橋渡しを definer で行う＝この RPC が存在理由。
--  - 対象は status='closed' のみ（設計ロックの推奨採用＝確定した来店。open は未確定・'void' は取消。
--    ★live 実測: checks.status の実値は 'void'（'voided' ではない）と 'closed' の2値）。
--  - nom_casts は text[]（check_nominations.position 順・casts join は is_active 不問＝
--    退店 cast も履歴の事実として名前を出す）。指名なし伝票は null。
--  - check_id を返却に含める（設計ロック外の追加・UI の行キー用途。cast は checks 直 SELECT 0行の
--    ままで id 知識のみ＝これを使って到達できる面は manager 系 RPC ゲートが別途守る）。
--  - status 列は現状 'closed' 固定だが返す（将来 open を含める判断をしても返却形が不変）。
--  - 読み取り専用＝audit_log_write 対象外（get_cast_ranking/get_cast_sales 前例）。stable。
--  - 原則8: org 自衛条件（v_org）を checks/seats/check_nominations/casts の全参照に自ら含める。
--  - LIMIT 20 固定（ページングは将来要件・引数にしない）。
--  - 存在オラクル封じ: 他 org / 不在 customer は 'not found'（customer_summary 同型）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   -- 0) 貼り先証明（nox プロジェクトであること・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) 定義実測（可視ガード4分岐・status='closed'・limit 20 が入っていること）
--   select pg_get_functiondef(p.oid) from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'customer_visit_history';
--   -- 2) ACL 実測（authenticated のみ・anon/public が現れないこと）
--   select p.proname, r.rolname from pg_proc p
--    join aclexplode(p.proacl) a on true
--    join pg_roles r on r.oid = a.grantee
--    where p.proname = 'customer_visit_history';
--   -- 3) overload 残りなし（1行）
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'customer_visit_history';
--   -- 4) PostgREST スキーマキャッシュ更新（0027 で手順化）
--   notify pgrst, 'reload schema';
--   -- 5) 動作アンカー（JWT が要るため SQL Editor では不可）: verify:nox-anon-guard 段20 で実測
--   --    （anon BLOCKED・権限マトリクス・cast 非担当 forbidden・LIMIT 20・実データ照合）。

begin;

-- ══════════════════════════════════════════════════════════════
-- customer_visit_history（来店履歴・直近20件・closed のみ）
-- ══════════════════════════════════════════════════════════════
create or replace function public.customer_visit_history(p_customer_id uuid)
returns table (
  check_id   uuid,
  visited_at timestamptz,   -- checks.started_at
  total      integer,       -- 伝票確定額（checks.total＝サーバ再計算済み）
  seat_name  text,          -- 卓名（seats.name）
  nom_casts  text[],        -- 指名 cast 名（position 順・指名なし=null・退店 cast も表示）
  status     text           -- 現状 'closed' 固定（将来 open 追加でも返却形不変）
) language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cust public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_cust from public.customers where id = p_customer_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 可視ガード（customer_summary 同型＝RLS と同じ判定を RPC 内で再現・definer 迂回の物理保証）
  if not (
    (v_role = 'owner')
    or (v_role = 'manager' and v_cust.store_id = public.auth_store_id())
    or (v_role = 'staff' and public.auth_staff_can_crm() and v_cust.store_id = public.auth_store_id())
    or (v_role = 'cast'  and v_cust.cast_id = public.auth_cast_id())   -- 担当客のみ
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    c.id,
    c.started_at,
    c.total,
    s.name,
    (select array_agg(ca.name order by n.position)
       from public.check_nominations n
       join public.casts ca on ca.id = n.cast_id and ca.org_id = v_org
      where n.check_id = c.id and n.org_id = v_org),
    c.status
  from public.checks c
  left join public.seats s on s.id = c.seat_id and s.org_id = v_org
  where c.customer_id = p_customer_id
    and c.org_id = v_org
    and c.status = 'closed'
  order by c.started_at desc
  limit 20;
end $$;

revoke execute on function public.customer_visit_history(uuid) from public, anon;
grant  execute on function public.customer_visit_history(uuid) to authenticated;

commit;
