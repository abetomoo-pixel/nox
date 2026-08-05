-- =====================================================================
-- NOX mig0080  商品一括登録 RPC（product_bulk_insert）【_r2】
--
-- _r2 での改訂（2026-08-05 CC live DDL 照合の差分反映・初版は手貼り未実施）:
--   A2. product_costs INSERT に org_id / store_id を追加（NOT NULL・default なし）
--   A3. product_categories INSERT に org_id を追加（同上）
--   A4. audit_log_write を live 署名
--       (p_action, p_target, p_before, p_after, p_store_id) に合わせ
--       named notation で呼ぶ（p_after にサマリ・p_store_id に対象店）
--   A1（products 11列）は照合一致のため不変。
--
-- 根拠: 裁定J（BANZEN 0086 同型・SaaS launch 前必須＝新規テナントの
--   40件手打ち問題の解消）＋ 2026-08-05 プリフライト戻りの裁定5点。
--
-- 裁定の反映:
--   - CSV 5列（表示カテゴリ・商品名・会計区分・価格・原価）。
--     会計区分の日本語ラベル→3値トークン変換は client パーサの仕事。
--     ★RPC は 'drink'/'champ'/'bottle' のみ受ける（サーバ=enum 権威）
--   - 既定値: back_mode='rate'・back_value=0・hon_pt=0・
--     back_exempt_from_split=false・reorder_point=null
--     （金に効く設定はゼロで入れて店が後から明示設定）
--   - 無効カテゴリと同名 → raise 'duplicate name'
--     （set_product_category の既存挙動と統一。client 側で保存前に案内）
--   - audit は1操作1行（商品名一覧＋type別件数＋作成カテゴリ。PII なし）
--   - 上限: カテゴリ30・商品300（client/RPC 二重・RPC 権威）
--   - 検証ループと DML 完全分離・単一トランザクション＝部分成功なし
--   - エラーは短い英字トークンのみ（行番号は client パーサ担当）
--   - 同名商品は重複許容（unique 制約なし・警告は client バナーのみ）
--   - カテゴリ空欄は category_id null（未分類）
--   - 未存在カテゴリは自動作成（同 store 末尾 sort_order max+1）
--
-- 冪等性: create or replace のみ＝再適用可。ただし手貼りは1回とする。
-- スキーマ変更なし（関数1本の新設・additive）。
-- =====================================================================


create or replace function public.product_bulk_insert(
  p_store_id uuid,
  p_items    jsonb
)
returns jsonb
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
  v_item   jsonb;
  v_name   text;
  v_type   text;
  v_num    numeric;
  v_cat    text;
  v_cat_names text[] := '{}';
  v_cat_lc    text[] := '{}';
  v_created   text[] := '{}';
  v_names     text[] := '{}';
  v_map    jsonb := '{}'::jsonb;   -- lower(カテゴリ名) -> id
  v_cat_id uuid;
  v_active boolean;
  v_sort   int;
  v_pid    uuid;
  v_drink  int := 0;
  v_champ  int := 0;
  v_bottle int := 0;
  i        int;
begin
  -- 二重防御①: 冒頭 null guard
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 認可: owner ∨ manager 自店（set_product と同型・org 照合は両ロールで明示）
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

  -- 形と上限
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bad items';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 then raise exception 'bad items'; end if;
  if v_n > 300 then raise exception 'too many items'; end if;

  -- ===== 検証ループ（DML 一切なし・全件検証し切ってから書く）=====
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;

    v_name := trim(coalesce(v_item ->> 'name', ''));
    if length(v_name) < 1 or length(v_name) > 80 then
      raise exception 'bad name';
    end if;

    v_type := v_item ->> 'type';
    if v_type is null or v_type not in ('drink', 'champ', 'bottle') then
      raise exception 'bad type';
    end if;

    if v_item -> 'price' is null
       or jsonb_typeof(v_item -> 'price') <> 'number' then
      raise exception 'bad price';
    end if;
    v_num := (v_item ->> 'price')::numeric;
    if v_num < 0 or v_num <> trunc(v_num) then
      raise exception 'bad price';
    end if;

    if (v_item ? 'cost') and jsonb_typeof(v_item -> 'cost') <> 'null' then
      if jsonb_typeof(v_item -> 'cost') <> 'number' then
        raise exception 'bad cost';
      end if;
      v_num := (v_item ->> 'cost')::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then
        raise exception 'bad cost';
      end if;
    end if;

    -- カテゴリ: 空/null 可（未分類）。非空は distinct 収集（lower 比較）
    v_cat := nullif(trim(coalesce(v_item ->> 'category', '')), '');
    if v_cat is not null and not (lower(v_cat) = any (v_cat_lc)) then
      v_cat_names := array_append(v_cat_names, v_cat);
      v_cat_lc    := array_append(v_cat_lc, lower(v_cat));
    end if;
  end loop;

  if coalesce(array_length(v_cat_names, 1), 0) > 30 then
    raise exception 'too many categories';
  end if;

  -- ===== カテゴリ解決（unique (store_id, lower(name)) 前提）=====
  foreach v_cat in array v_cat_names loop
    v_cat_id := null;
    select c.id, c.is_active into v_cat_id, v_active
      from public.product_categories c
     where c.store_id = p_store_id
       and lower(c.name) = lower(v_cat);
    if v_cat_id is not null then
      -- ★無効カテゴリと同名: 暗黙の再利用も再有効化もしない（裁定1）
      if not v_active then raise exception 'duplicate name'; end if;
    else
      select coalesce(max(c.sort_order), 0) + 1 into v_sort
        from public.product_categories c
       where c.store_id = p_store_id;
      -- _r2: org_id を追加（NOT NULL・default なし）
      insert into public.product_categories (org_id, store_id, name, sort_order)
      values (v_org, p_store_id, v_cat, v_sort)
      returning id into v_cat_id;
      v_created := array_append(v_created, v_cat);
    end if;
    v_map := v_map || jsonb_build_object(lower(v_cat), v_cat_id::text);
  end loop;

  -- ===== INSERT ループ（既定値は裁定4）=====
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;
    v_name := trim(v_item ->> 'name');
    v_type := v_item ->> 'type';
    v_cat  := nullif(trim(coalesce(v_item ->> 'category', '')), '');
    v_cat_id := case when v_cat is null then null
                     else (v_map ->> lower(v_cat))::uuid end;

    insert into public.products
      (org_id, store_id, category_id, name, type, price,
       back_mode, back_value, hon_pt, back_exempt_from_split, reorder_point)
    values
      (v_org, p_store_id, v_cat_id, v_name, v_type,
       (v_item ->> 'price')::integer,
       'rate', 0, 0, false, null)
    returning id into v_pid;

    if (v_item ? 'cost') and jsonb_typeof(v_item -> 'cost') = 'number' then
      -- _r2: org_id / store_id を追加（NOT NULL・default なし）
      insert into public.product_costs (org_id, store_id, product_id, cost)
      values (v_org, p_store_id, v_pid, (v_item ->> 'cost')::integer);
    end if;

    v_names := array_append(v_names, v_name);
    if    v_type = 'drink' then v_drink  := v_drink  + 1;
    elsif v_type = 'champ' then v_champ  := v_champ  + 1;
    else                        v_bottle := v_bottle + 1;
    end if;
  end loop;

  -- ===== audit: 1操作1行（裁定2・PII なし）=====
  -- _r2: live 署名 (p_action, p_target, p_before, p_after, p_store_id) に整合。
  --      1操作1行のため単一 target は無い＝p_target/p_before は default(null)。
  perform public.audit_log_write(
    p_action   => 'product_bulk_insert',
    p_after    => jsonb_build_object(
                    'product_count',      v_n,
                    'by_type',            jsonb_build_object(
                                            'drink', v_drink, 'champ', v_champ,
                                            'bottle', v_bottle),
                    'categories_created', to_jsonb(coalesce(v_created, '{}'::text[])),
                    'products',           to_jsonb(v_names)),
    p_store_id => p_store_id
  );

  return jsonb_build_object(
    'products_created',   v_n,
    'categories_created', to_jsonb(coalesce(v_created, '{}'::text[])),
    'by_type',            jsonb_build_object(
                            'drink', v_drink, 'champ', v_champ,
                            'bottle', v_bottle)
  );
end $$;

revoke execute on function public.product_bulk_insert(uuid, jsonb) from public, anon;
grant  execute on function public.product_bulk_insert(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
