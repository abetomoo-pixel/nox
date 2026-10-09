-- 0168_comp_plan_slide_period.sql
-- マイグレーション名: 0168_comp_plan_slide_period（裁定338＋追補1＝売上スライド／ポイントスライドの判定期間・便 X-13d-2b 起草・2026-10-09・適用は Agoora 手貼り）
-- 生成器: scratchpad/gen_0168.py（手打ち禁止）。写経元＝docs/tmp/0153_set_comp_plan.sql（0153 ★7 の set_comp_plan 全文＝live md5 3fdd6e81）。★以外は 1 バイト不変（299-11）。
--
-- 器:
--   ★1 comp_plans.slide_period text not null default 'daily' check in ('monthly','half','daily')＝判定期間。既存行は 'daily'（読み替えなし＝現状の同日反映）。
--        monthly＝月の累計売上（按分後）／pt で段を決め、その月の全勤務時間に適用。half＝1〜15 日／16〜末日の累計で同じ。daily＝その日の売上で同日の時給（現状）。
--        確定時に段確定・プレビューは期首〜今日の累計で暫定（印）。slide_apply='next'（店設定・0151）は「前の期間の累計」として両立。ポイントスライドも同じ期間。
--        計算（lib: slide.ts 期間キー／collect 期間累計／assemble slideByDay・pay.ts 不変）と UI（3 択・青ピル・説明文 3 種・新規プランの初期値 monthly）は適用後の便 P168。
--   ★2 set_comp_plan: 23 引数（末尾 p_slide_period text default 'daily'）。NULL は 'bad slide_period'（教訓100）・値域外も同じ。insert／update に slide_period。
--        22 引数版は drop（overload 罠＝C12 設計書 §3）。既存 client（22 引数で呼ぶ）は default 'daily' で通る＝P168 までの過渡も壊れない。
--   ★3 grants: 23 引数版に public／anon revoke・authenticated＋service_role grant（0153 と同じ）。名簿不変（名前不変＝A7・関数 305／'billing locked' 156）。
--
-- demo 表への影響: comp_plans に NOT NULL 列が増える＝demo_org_reset の jsonb_populate_recordset は欠けた列を NULL にする（default は効かない）ため、
--   payload の comp_plans 行に slide_period を持たせる（gen-demo＝便 X-13d-2b で先行して ACE／NOIR 'monthly'・LUNA 'half'・他 'daily' を入れた＝列が無い間は無視される）。
--
-- 名簿・suite への影響（手貼り後の便 P168 で反映）: 関数 305 不変（drop＋create＝名前不変）。表 83 不変。
--   pin が変わる suite: 0158（set_comp_plan の md5 控えがあれば）／billing 不変（ゲート行の形は不変）／anon-guard（set_comp_plan の probe 引数は 22 のまま可）／grants（署名変更＝G4d の identity args）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name='slide_period';   -- text／NO／'daily'::text
--   select pg_get_constraintdef(oid) from pg_constraint where conname='comp_plans_slide_period_check';                                              -- CHECK ((slide_period = ANY (ARRAY['monthly','half','daily'])))
--   select count(*) filter (where slide_period='daily') as daily_count, count(*) as total from public.comp_plans;                                -- daily_count＝total（既存は全部 daily）
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname='set_comp_plan';                                                    -- 1 行・末尾が p_slide_period text（22 引数版は無い）
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_comp_plan';                                                    -- 新 md5（手貼り案内の値）
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 305／83
begin;

-- ★1 comp_plans.slide_period（既存行は 'daily'＝読み替えなし）
alter table public.comp_plans add column if not exists slide_period text not null default 'daily';
alter table public.comp_plans drop constraint if exists comp_plans_slide_period_check;
alter table public.comp_plans add constraint comp_plans_slide_period_check check (slide_period in ('monthly','half','daily'));
comment on column public.comp_plans.slide_period is '0168（裁定338）: スライドの判定期間。monthly＝月の累計／half＝1〜15・16〜末の累計／daily＝その日（既定・現状）。計算は lib（P168）';

-- ★2 set_comp_plan 23 引数（22 引数版は drop・★以外は 0153 ★7 の 1 バイト不変）
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text)
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
       slide_period)  -- ★0168
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate,
       p_product_back_mode, p_product_back_rate, p_product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       p_product_back_fixed_hon, p_product_back_fixed_jonai, p_product_back_fixed_free,  -- ★7 0153
       p_slide_period)  -- ★0168
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
          slide_period = p_slide_period                                                     -- ★0168
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

-- ★3 grants（0153 と同じ＝public／anon revoke・authenticated＋service_role）
revoke all on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text) to authenticated, service_role;

commit;
-- ===== end 0168 =====
