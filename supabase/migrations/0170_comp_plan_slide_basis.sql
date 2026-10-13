-- 0170_comp_plan_slide_basis.sql
-- マイグレーション名: 0170_comp_plan_slide_basis（裁定343＝C5 判定基準／対象＝案 A・便 W5-2a 起草・2026-10-13・適用は Agoora 手貼り＝0169 の後）
-- 生成器: docs/tmp/gen_0170.mjs（手打ち禁止）。写経元＝docs/tmp/0170_set_comp_plan_live.sql（live pg_get_functiondef＝set_comp_plan md5 3ebd1624・2026-10-13 読取）。★以外は 1 バイト不変（299-11）。
--
-- 器（裁定343＝docs/tmp/w52_plan.md R-2 案 A・338 の判定期間（slide_period）とは直交＝3 軸は独立）:
--   ★1 comp_plans.slide_basis text not null default 'sales' check in ('sales','hon_count','dohan_count')＝売上スライドの判定基準。
--        sales＝自分の按分後売上（現行）／hon_count＝本指名の件数／dohan_count＝同伴の件数。ポイントスライドは pts のまま。既存 21 行は 'sales'（読み替えなし）。
--      comp_plans.slide_rank_ids uuid[] not null default '{}'＝対象（空＝全員（現行）／要素＝cast_ranks.id＝そのランクのキャストだけスライド・他は base）。
--   ★2 set_comp_plan: 25 引数（末尾 p_slide_basis text default 'sales'・p_slide_rank_ids uuid[] default '{}'）。NULL は 'bad slide_basis'／'bad slide_rank_ids'（教訓100）。
--        rank id は自店の有効な cast_ranks だけ（重複・他店・停止中は拒否）。insert／update に 2 列。23 引数版は drop（overload 罠＝C12 設計書 §3）。
--        既存 client（23 引数で呼ぶ）は default で通る＝W5-2b までの過渡も壊れない。
--   ★3 grants: 25 引数版に public／anon revoke・authenticated＋service_role grant（0168 と同じ）。名簿不変（名前不変＝A7・関数 306／'billing locked' 157）。
--
-- 計算（lib）と UI は適用後の便 W5-2b: collect.ts（basis が hon_count／dohan_count なら salesByCast の件数を期間累計に・castRank で対象外は slide なし）→assemble slideInputOf→pay.ts（slideAt は数値比較のまま）→core.ts 凍結形に basis／rank 対象→breakdown-lines の文言。
-- demo 表への影響: comp_plans に NOT NULL 列が増える＝demo_org_reset の jsonb_populate_recordset は欠けた列を NULL にする（default は効かない）ため、payload の comp_plans 行に slide_basis／slide_rank_ids を持たせる（gen-demo＝W5-2b で先行投入・列が無い間は無視される）。
--
-- 名簿・suite への影響（手貼り後の便 W5-2b で反映）: 関数 306 不変（drop＋create＝名前不変）。表 83 不変。'billing locked' 157 不変。
--   pin が変わる suite: 0158（set_comp_plan の md5 控え＝あれば）／grants（署名変更＝G4d の対象外・公開 secdef の全数走査は不変）／anon-guard（set_comp_plan の probe 引数は 23 のまま可）／338（UI の pin は W5-2b で張替え）。
--   md5 pin 候補＝set_comp_plan 3ebd1624→1cddaa0e（本文の生成値・手貼り後に live で再計算して確定）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name in ('slide_basis','slide_rank_ids') order by 1;   -- 2 行・NO／'sales'::text・'{}'::uuid[]
--   select pg_get_constraintdef(oid) from pg_constraint where conname='comp_plans_slide_basis_check';                                               -- CHECK ((slide_basis = ANY (ARRAY['sales','hon_count','dohan_count'])))
--   select count(*) filter (where slide_basis='sales' and slide_rank_ids='{}') as unchanged, count(*) as total from public.comp_plans;          -- unchanged＝total（既存は全部 sales・全員）
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname='set_comp_plan';                                                    -- 1 行・末尾が p_slide_rank_ids uuid[]（23 引数版は無い）
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_comp_plan';                                                    -- 1cddaa0e（手貼り案内の値）
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 306／83
begin;

-- ★1 comp_plans.slide_basis／slide_rank_ids（既存行は 'sales'・'{}'＝読み替えなし）
alter table public.comp_plans add column if not exists slide_basis text not null default 'sales';
alter table public.comp_plans drop constraint if exists comp_plans_slide_basis_check;
alter table public.comp_plans add constraint comp_plans_slide_basis_check check (slide_basis in ('sales','hon_count','dohan_count'));
alter table public.comp_plans add column if not exists slide_rank_ids uuid[] not null default '{}'::uuid[];
comment on column public.comp_plans.slide_basis is '0170（裁定343）: 売上スライドの判定基準。sales＝按分後売上（既定・現状）／hon_count＝本指名の件数／dohan_count＝同伴の件数。ポイントスライドは pts のまま。計算は lib（W5-2b）';
comment on column public.comp_plans.slide_rank_ids is '0170（裁定343）: スライドの対象ランク（cast_ranks.id の配列・空＝全員）。対象外のキャストはスライドなし＝base。判定は lib（W5-2b）';

-- ★2 set_comp_plan 25 引数（23 引数版は drop・★以外は live 3ebd1624 の 1 バイト不変）
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text);
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text, p_slide_basis text DEFAULT 'sales'::text, p_slide_rank_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad base'; end if;
  if p_hon_back is null or p_hon_back < 0 then raise exception 'bad hon_back'; end if;
  if p_jonai_back is null or p_jonai_back < 0 then raise exception 'bad jonai_back'; end if;
  if p_dohan_back is null or p_dohan_back < 0 then raise exception 'bad dohan_back'; end if;
  -- ★mig0086: 方式（円/本｜率）検証＝列 CHECK と同値を RPC 権威でも実施
  if p_hon_back_mode is null or p_hon_back_mode not in ('per_count','rate') then
    raise exception 'bad hon_back_mode';
  end if;
  if p_hon_back_rate is not null and (p_hon_back_rate < 0 or p_hon_back_rate > 100) then
    raise exception 'bad hon_back_rate';
  end if;
  if (p_hon_back_mode = 'rate') <> (p_hon_back_rate is not null) then
    raise exception 'bad hon_back_rate';
  end if;
  if p_jonai_back_mode is null or p_jonai_back_mode not in ('per_count','rate') then
    raise exception 'bad jonai_back_mode';
  end if;
  if p_jonai_back_rate is not null and (p_jonai_back_rate < 0 or p_jonai_back_rate > 100) then
    raise exception 'bad jonai_back_rate';
  end if;
  if (p_jonai_back_mode = 'rate') <> (p_jonai_back_rate is not null) then
    raise exception 'bad jonai_back_rate';
  end if;
  -- ★mig0115: dohan の方式検証（hon/jonai と同型・列 CHECK と二段）
  if p_dohan_back_mode is null or p_dohan_back_mode not in ('per_count','rate') then
    raise exception 'bad dohan_back_mode';
  end if;
  if p_dohan_back_rate is not null and (p_dohan_back_rate < 0 or p_dohan_back_rate > 100) then
    raise exception 'bad dohan_back_rate';
  end if;
  if (p_dohan_back_mode = 'rate') <> (p_dohan_back_rate is not null) then
    raise exception 'bad dohan_back_rate';
  end if;
  -- ★mig0115（裁定86-②）: dohan の率化は R-2b（同伴 cast_id 必須・分母の行由来化）まで封印。
  --   解錠は本ガード1行を外す RPC 差替のみ（mig 不要）
  if p_dohan_back_mode = 'rate' then
    raise exception 'dohan rate requires R-2b';
  end if;
  -- ★0134（裁定113/123）: 商品販売バック方式の検証＝列 CHECK（0132）と二段
  --   product_rule=商品ごと / plan_rate=売上×率 / plan_fixed=販売数×固定額（円/1点）
  if p_product_back_mode is null or p_product_back_mode not in ('product_rule','plan_rate','plan_fixed') then
    raise exception 'bad product_back_mode';
  end if;
  if p_product_back_rate is not null and (p_product_back_rate < 0 or p_product_back_rate > 100) then
    raise exception 'bad product_back_rate';
  end if;
  if (p_product_back_mode = 'plan_rate') <> (p_product_back_rate is not null) then
    raise exception 'bad product_back_rate';
  end if;
  if p_product_back_fixed is not null and p_product_back_fixed < 0 then
    raise exception 'bad product_back_fixed';
  end if;
  if (p_product_back_mode = 'plan_fixed') <> (p_product_back_fixed is not null) then
    raise exception 'bad product_back_fixed';
  end if;
  -- ★7 0153（296 追補2／305-12）: 区分別固定額＝null 可・≥0・plan_fixed のときだけ指定できる（null＝一律 product_back_fixed）
  if p_product_back_fixed_hon is not null and p_product_back_fixed_hon < 0 then raise exception 'bad product_back_fixed_hon'; end if;
  if p_product_back_fixed_jonai is not null and p_product_back_fixed_jonai < 0 then raise exception 'bad product_back_fixed_jonai'; end if;
  if p_product_back_fixed_free is not null and p_product_back_fixed_free < 0 then raise exception 'bad product_back_fixed_free'; end if;
  if p_product_back_mode <> 'plan_fixed' and (p_product_back_fixed_hon is not null or p_product_back_fixed_jonai is not null or p_product_back_fixed_free is not null) then
    raise exception 'bad product_back_fixed_hon';
  end if;
  -- ★0168（裁定338＋追補1）: 判定期間＝monthly（月次）／half（半月 1〜15／16〜末）／daily（同日）。NULL は明示に拒否（教訓100＝IN の CHECK は NULL を素通りする・default は引数省略時だけ効く）
  if p_slide_period is null or p_slide_period not in ('monthly','half','daily') then raise exception 'bad slide_period'; end if;
  -- ★0170（裁定343＝案 A）: 判定基準＝sales（按分後売上・現行）／hon_count（本指名の件数）／dohan_count（同伴の件数）。NULL は明示拒否（教訓100）。
  if p_slide_basis is null or p_slide_basis not in ('sales','hon_count','dohan_count') then raise exception 'bad slide_basis'; end if;
  -- ★0170: 対象＝空配列は全員・要素は自店の有効な cast_ranks.id だけ（重複・他店・停止中は 'bad slide_rank_ids'）。ランク変更は cast 側（casts.rank_id）に追随＝計算は lib。
  if p_slide_rank_ids is null then raise exception 'bad slide_rank_ids'; end if;
  if (select count(*) from unnest(p_slide_rank_ids) r(id)) <> (select count(distinct id) from unnest(p_slide_rank_ids) r(id)) then raise exception 'bad slide_rank_ids'; end if;
  if exists (select 1 from unnest(p_slide_rank_ids) r(id) where not exists (select 1 from public.cast_ranks k where k.id = r.id and k.store_id = p_store_id and k.is_active)) then raise exception 'bad slide_rank_ids'; end if;
  perform public.comp_plan_slide_check(p_sales_slide);
  perform public.comp_plan_slide_check(p_point_slide);
  -- store の org 照合＋ロール判定（owner のみ＝D3a）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★mig0104（裁定77）: 同店内の名前重複（大小無視）を拒否＝cast_ranks の duplicate name と同型
  if exists (select 1 from public.comp_plans c
              where c.store_id = p_store_id
                and lower(c.name) = lower(trim(p_name))
                and c.id is distinct from p_id) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.comp_plans
      (org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active,
       hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate,
       dohan_back_mode, dohan_back_rate,
       product_back_mode, product_back_rate, product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free,  -- ★7 0153
       slide_period,  -- ★0168
       slide_basis, slide_rank_ids)  -- ★0170
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate,
       p_product_back_mode, p_product_back_rate, p_product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       p_product_back_fixed_hon, p_product_back_fixed_jonai, p_product_back_fixed_free,  -- ★7 0153
       p_slide_period,  -- ★0168
       p_slide_basis, p_slide_rank_ids)  -- ★0170
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plans c
      where c.id = p_id and c.org_id = public.auth_org_id() and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plans
      set name = trim(p_name), base = p_base, hon_back = p_hon_back, jonai_back = p_jonai_back,
          dohan_back = p_dohan_back, sales_slide = p_sales_slide, point_slide = p_point_slide,
          is_active = coalesce(p_is_active, true),
          hon_back_mode = p_hon_back_mode, hon_back_rate = p_hon_back_rate,
          jonai_back_mode = p_jonai_back_mode, jonai_back_rate = p_jonai_back_rate,
          dohan_back_mode = p_dohan_back_mode, dohan_back_rate = p_dohan_back_rate,
          product_back_mode = p_product_back_mode, product_back_rate = p_product_back_rate,  -- ★0134
          product_back_fixed = p_product_back_fixed,                                         -- ★0134（0153 ★7: 末尾 ',' を足す）
          product_back_fixed_hon = p_product_back_fixed_hon, product_back_fixed_jonai = p_product_back_fixed_jonai,   -- ★7 0153
          product_back_fixed_free = p_product_back_fixed_free,                               -- ★7 0153
          slide_period = p_slide_period,                                                    -- ★0168（0170: 末尾 ',' を足す）
          slide_basis = p_slide_basis, slide_rank_ids = p_slide_rank_ids                       -- ★0170
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

-- ★3 grants（0168 と同じ＝public／anon revoke・authenticated＋service_role）
revoke all on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[]) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[]) to authenticated, service_role;

commit;
-- ===== end 0170 =====
