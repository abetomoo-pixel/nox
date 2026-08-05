-- =====================================================================
-- NOX mig0081  商品並び順（products.sort_order ＋ product_reorder RPC）
--
-- 根拠: 商品マスタ群の残作業（Agoora 要望 2026-08-05）。
--   レジ/kiosk のカテゴリ内商品順は現在 .order("type") のみ＝実質不定
--   （プリフライト実測）。並び順を決定的にし、店が制御できるようにする。
--
-- 裁定の反映（2026-08-05）:
--   (1) スコープ＝カテゴリ内。category_id null（未分類）も1スコープ。
--       比較は is not distinct from。is_active 不問で全件要求（0077 同型）
--   (2) backfill＝カテゴリ内 created_at 順（同時刻は id）。
--       CSV 一括登録の行順・既存店の登録順がそのまま初期並びになる
--   (3) 一覧は平坦維持・∧∨は単一カテゴリ絞り込み時のみ。
--       主戦場はレジ/kiosk（kiosk の order by 改稿は 0082 で分離＝live 起点）
--
-- 構造: product_category_reorder（0077）同型＝
--   null guard → 配列検証（空/重複）→ 認可（owner∨manager自店・org 照合）
--   → 両方向件数検証（①全 id がスコープに実在 ②スコープ全行が配列に）
--   → before 収集 → unnest with ordinality 一括 UPDATE → after 収集 → audit
--
-- ★冪等性: 非冪等（add column が2回目で落ちる）。手貼りは1回・再貼り厳禁。
--   backfill の再実行は店が調整した並びを破壊するため、敢えて
--   if not exists を付けない（2回目は先頭で明示的に失敗させる）。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) 列追加（前例3テーブルと同形: integer NOT NULL DEFAULT 0）
-- ---------------------------------------------------------------------
alter table public.products
  add column sort_order integer not null default 0;


-- ---------------------------------------------------------------------
-- 2) backfill: カテゴリ内 created_at 順（同時刻は id で決定的に）
--    partition は (store_id, category_id)＝null カテゴリは店ごとに1群
-- ---------------------------------------------------------------------
with ranked as (
  select p.id,
         row_number() over (
           partition by p.store_id, p.category_id
           order by p.created_at, p.id
         ) as rn
    from public.products p
)
update public.products p
   set sort_order = r.rn
  from ranked r
 where r.id = p.id;


-- ---------------------------------------------------------------------
-- 3) product_reorder(p_store_id, p_category_id, p_ids)
--    カテゴリ単位の配列一括並び替え。p_category_id null = 未分類群。
--    呼び出し側は当該スコープの全商品 id（is_active 不問）を渡すこと。
-- ---------------------------------------------------------------------
create or replace function public.product_reorder(
  p_store_id    uuid,
  p_category_id uuid,
  p_ids         uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_store  uuid := public.auth_store_id();
  v_n      int;
  v_cnt    int;
  v_before jsonb;
  v_after  jsonb;
begin
  -- 二重防御①: 冒頭 null guard
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 配列検証: 空拒否・重複拒否（ordinality が非決定になるため）
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;

  -- 認可: owner ∨ manager 自店（org 照合は両ロールで明示）
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_store is null or p_store_id is distinct from v_store then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- カテゴリ実在（null=未分類は素通し・非 null は同店カテゴリ限定）
  if p_category_id is not null and not exists (
       select 1 from public.product_categories c
        where c.id = p_category_id and c.store_id = p_store_id) then
    raise exception 'forbidden';
  end if;

  -- ① 配列の全 id が同 org/store/スコープに実在
  select count(*) into v_cnt
    from public.products p
   where p.id = any(p_ids)
     and p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;

  -- ② スコープ全行が配列に含まれる（is_active 不問・0077 同型）
  select count(*) into v_cnt
    from public.products p
   where p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;

  -- audit 用 before
  select jsonb_agg(jsonb_build_object('id', p.id, 'sort_order', p.sort_order)
                   order by p.sort_order, p.id)
    into v_before
    from public.products p
   where p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;

  -- 一括 UPDATE（配列順 = 新しい sort_order）
  update public.products p
     set sort_order = u.ord
    from unnest(p_ids) with ordinality as u(id, ord)
   where p.id = u.id;

  -- audit 用 after
  select jsonb_agg(jsonb_build_object('id', p.id, 'sort_order', p.sort_order)
                   order by p.sort_order, p.id)
    into v_after
    from public.products p
   where p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;

  -- audit: 1操作1行・PII なし（0077 の疑似 target 流儀）
  perform public.audit_log_write(
    p_action   => 'product_reorder',
    p_target   => 'products:store:' || p_store_id::text
                  || ':category:' || coalesce(p_category_id::text, 'null'),
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $$;

revoke execute on function public.product_reorder(uuid, uuid, uuid[]) from public, anon;
grant  execute on function public.product_reorder(uuid, uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
