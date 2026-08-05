-- =====================================================================
-- NOX mig0078  在庫集約 RPC（product_stock_totals）
--
-- 目的:
--   現在庫（stock_logs の Σdelta）を DB 側で集約して返す。
--
-- 背景（裁定O）:
--   現行 lib/nox/master/queries.ts の fetchStockTotals は stock_logs を
--   全件 select してから JS で畳んでいる。CLUB NOX は7日で246件＝
--   実運用で月1000件規模になり、早期に破綻する。
--   ★同じ集計をレジ画面 (register-board.tsx) が独自実装で持っており、
--     そちらは営業中に開く＝マスタより頻度が高い。呼び出し元は
--     マスタ6箇所＋レジ1箇所の計7箇所を一度に差し替える。
--
-- 方式の選定:
--   view（security_invoker）ではなく returns table の集計 RPC を採る。
--   NOX に view の前例はゼロ（pg_views 0行）だが、returns table の
--   集計 RPC は15本あり、RLS の効かせ方・grant・検証の型が確立している。
--   新しい概念を1つ増やすより既存の型を踏む方が安い。
--
-- ★型の昇格（教訓12 / 0075→0076 の再発防止）:
--   sum(integer) は Postgres で bigint に昇格するため、returns table の
--   宣言が integer だと「1行でも返した瞬間」に
--   structure of query does not match function result type で失敗する。
--   0行では発火しない潜伏バグになるので ::integer を明示キャストする。
--   （0076 はこれと同型の是正＝sum(bigint)→numeric 昇格だった）
--
-- 冪等性: create or replace のみ＝再適用可。ただし手貼りは1回とする。
-- スキーマ変更なし（additive・関数1本）。
-- =====================================================================


-- ---------------------------------------------------------------------
-- product_stock_totals(p_store_id uuid default null)
--   returns table(product_id uuid, qty integer)
--
--   p_store_id = null のとき:
--     owner   … org 全体
--     manager … 自店のみ（auth_store_id() を暗黙適用）
--   p_store_id 指定のとき:
--     owner   … 同 org ならその店
--     manager … 自店のみ許可（他店は forbidden）
--
--   在庫ログが1件も無い商品は行を返さない。
--   呼び出し側は従来どおり `?? 0` で埋める（現行 fetchStockTotals と同挙動）。
--
--   読み取り専用のため audit は書かない。
-- ---------------------------------------------------------------------
create or replace function public.product_stock_totals(
  p_store_id uuid default null
)
returns table(product_id uuid, qty integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid := public.auth_store_id();
  v_scope uuid;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- cast は在庫を見ない（stock_logs_select の (auth_role() <> 'cast') と揃える）
  if v_role = 'cast' then raise exception 'forbidden'; end if;

  if v_role = 'owner' then
    -- owner: 指定があればその店（同 org 限定）、なければ org 全体（null=絞らない）
    if p_store_id is not null then
      if not exists (select 1 from public.stores s
                      where s.id = p_store_id and s.org_id = v_org) then
        raise exception 'forbidden';
      end if;
      v_scope := p_store_id;
    else
      v_scope := null;
    end if;
  elsif v_role = 'manager' then
    -- manager: 自店のみ。指定が自店と食い違えば拒否
    if v_store is null then raise exception 'forbidden'; end if;
    if p_store_id is not null and p_store_id <> v_store then
      raise exception 'forbidden';
    end if;
    v_scope := v_store;
  else
    raise exception 'forbidden';
  end if;

  return query
  select l.product_id,
         -- ★sum(integer) は bigint に昇格する。宣言 integer と食い違うと
         --   1行返した瞬間に落ちる（0行では発火しない）。明示キャスト必須。
         sum(l.delta)::integer as qty
    from public.stock_logs l
   where l.org_id = v_org
     and (v_scope is null or l.store_id = v_scope)
   group by l.product_id;
end $$;

revoke execute on function public.product_stock_totals(uuid) from public, anon;
grant  execute on function public.product_stock_totals(uuid) to authenticated;

notify pgrst, 'reload schema';
