-- =====================================================================
-- NOX mig0077  カテゴリ並び替え RPC ＋ 商品の有効/無効トグル RPC
--
-- 目的:
--   (1) product_category_reorder ... 配列一括で sort_order を 1..N に正規化
--   (2) set_product_active       ... is_active だけを更新
--
-- 背景（裁定K / 裁定L）:
--   既存 set_product / set_product_category には部分更新の口が無く、
--   並び替えや有効切替のつもりで呼ぶと name/price/cost/back_* を
--   全部再送することになり、他端末の編集を last-write-wins で巻き戻す。
--   ★BANZEN は seats で同じ2回呼び方式を採り、自ら「非原子スワップ」として
--     是正待ちに記録している（menu_category_reorder は最初から配列一括）。
--     NOX は最初から配列一括／専用トグルを採る。
--
-- 非対称の記録:
--   会計区分(type)の変更ロックは UI のみ。set_product は編集時も
--   type を無条件に上書きする（0069/0072 の UPDATE 分岐）。
--   check_lines.kind は明細追加時に凍結済みのため過去分は遡らない。
--
-- 冪等性: 本 migration は create or replace のみ＝再適用可。
--         ただし手貼りは1回とする。
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) product_category_reorder
--     引数の配列順そのものが順序。sort_order の値は受け取らない。
--     unnest with ordinality は 1 始まり＝結果は必ず 1..N の連番。
--     （現データは 8/10/20/.../80 と手入力の痕跡があるが正規化で消える）
-- ---------------------------------------------------------------------
create or replace function public.product_category_reorder(
  p_store_id uuid,
  p_ids      uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_n     int;
  v_in    int;
  v_all   int;
  v_before jsonb;
  v_after  jsonb;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;

  v_n := coalesce(array_length(p_ids, 1), 0);
  if v_n = 0 then raise exception 'bad ids'; end if;

  -- 配列内の重複を拒否（同一 id が2回来ると ordinality が非決定になる）
  if v_n <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'duplicate ids';
  end if;

  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★件数一致を両方向で検証（BANZEN は片方向のみ＝部分配列が通り旧値と衝突する）
  --   ①配列の全 id が同 org/store に実在すること
  select count(*) into v_in
    from public.product_categories pc
   where pc.id = any(p_ids)
     and pc.store_id = p_store_id
     and pc.org_id = public.auth_org_id();
  if v_in <> v_n then raise exception 'forbidden'; end if;

  --   ②同 org/store の全行が配列に含まれること（欠けを拒否）
  select count(*) into v_all
    from public.product_categories pc
   where pc.store_id = p_store_id
     and pc.org_id = public.auth_org_id();
  if v_all <> v_n then raise exception 'partial ids'; end if;

  -- 監査: 並び替え前後の (id, sort_order) 一覧を記録（PII なし）
  select jsonb_agg(jsonb_build_object('id', pc.id, 'sort_order', pc.sort_order) order by pc.sort_order, pc.name)
    into v_before
    from public.product_categories pc
   where pc.store_id = p_store_id and pc.org_id = public.auth_org_id();

  update public.product_categories pc
     set sort_order = t.ord
    from unnest(p_ids) with ordinality as t(id, ord)
   where pc.id = t.id
     and pc.store_id = p_store_id
     and pc.org_id = public.auth_org_id();

  select jsonb_agg(jsonb_build_object('id', pc.id, 'sort_order', pc.sort_order) order by pc.sort_order, pc.name)
    into v_after
    from public.product_categories pc
   where pc.store_id = p_store_id and pc.org_id = public.auth_org_id();

  perform public.audit_log_write(
    'product_category_reorder',
    'product_categories:store:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $$;

revoke execute on function public.product_category_reorder(uuid, uuid[]) from public, anon;
grant  execute on function public.product_category_reorder(uuid, uuid[]) to authenticated;


-- ---------------------------------------------------------------------
-- (2) set_product_active
--     is_active だけを更新する。name/price/cost/back_* に触れない。
--     audit の action 名を set_product と分ける＝一覧の1タップと
--     編集モーダルからの更新を監査上で区別できる。
--     updated_at は set_product と同じく明示 set しない（作法を揃える）。
-- ---------------------------------------------------------------------
create or replace function public.set_product_active(
  p_id        uuid,
  p_store_id  uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_id is null then raise exception 'bad id'; end if;
  if p_is_active is null then raise exception 'bad is_active'; end if;

  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(p) into v_before from public.products p
   where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
  if v_before is null then raise exception 'not found'; end if;

  update public.products
     set is_active = p_is_active
   where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;

  select to_jsonb(p) into v_after from public.products p where p.id = p_id;

  perform public.audit_log_write(
    'set_product_active', 'products:' || p_id::text, v_before, v_after, p_store_id);
  return p_id;
end $$;

revoke execute on function public.set_product_active(uuid, uuid, boolean) from public, anon;
grant  execute on function public.set_product_active(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
