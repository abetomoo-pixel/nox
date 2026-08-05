-- =====================================================================
-- NOX mig0079  product_stock_totals のロールスコープ是正（RLS 完全一致）
--
-- 背景（④d-1 着手前に CC が読み取り調査で検出・是正裁定 A）:
--   mig0078 は「stock_logs_select と揃える」意図でロール分岐を書いたが、
--   実際の RLS（mig0005）は cast のみ除外で staff は自店の行が見える。
--   0078 の else→forbidden は staff を落としており、レジ（staff 到達可）で
--   低在庫「残N」バッジが消える＝挙動変化になるため差し替え不可だった。
--
-- 是正方針: RPC のスコープを RLS（stock_logs_select）と完全一致させる。
--   owner   … org 全体（p_store_id 指定時は同 org のその店）
--   manager … 自店のみ（他店指定は forbidden）
--   staff   … 自店のみ（manager と同型）★今回追加
--   cast    … 0行 return ★forbidden から変更
--     理由: RLS は cast に「エラー」でなく「0行」を返す。RPC も0行で
--     揃えることで fetchStockTotals はエラー握りつぶしゼロの純粋な
--     drop-in になる（握りつぶしは本物の認証破綻も隠すため採らない）。
--
-- 変更範囲: role 分岐のみ。集計本体・::integer キャスト・grant/revoke は
--   0078 と同一（原本 sha256 f4cd83ea… の本文を基点に差分適用）。
--
-- 冪等性: create or replace のみ＝再適用可。ただし手貼りは1回とする。
-- スキーマ変更なし（関数1本の置換）。
-- =====================================================================


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

  -- cast は在庫を見ない。★RLS（stock_logs_select）は cast に0行を返すため
  --   RPC も forbidden でなく0行で揃える（呼び出し側の分岐を不要にする）
  if v_role = 'cast' then return; end if;

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
  elsif v_role in ('manager', 'staff') then
    -- manager/staff: 自店のみ。指定が自店と食い違えば拒否
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
