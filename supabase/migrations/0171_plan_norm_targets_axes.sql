-- 0171_plan_norm_targets_axes.sql
-- マイグレーション名: 0171_plan_norm_targets_axes（裁定347＝プラン既定の目標 4 軸＋GV-2＝ノルマの採用軸・便 N1013b 起草・2026-10-13・★起草のみ＝適用は相談役の裁定後に Agoora 手貼り＝0170 の後）
-- 生成器: docs/tmp/gen_0171.mjs（手打ち禁止）。写経元＝docs/tmp/0171_set_comp_plan_live.sql（live pg_get_functiondef＝set_comp_plan md5 1cddaa0e・2026-10-13 読取）。★以外は 1 バイト不変
--
-- 器:
--   ★1 comp_plans.norm_days_target／norm_dohan_target／norm_sales_target／norm_shimei_target integer null＝プラン既定の目標（null＝継承なし＝現状）。cast_norms（キャスト別）は不変＝client が「プランの既定→キャスト別で上書き」を解く（0171 適用後の便）。
--   ★2 set_comp_plan: 29 引数（末尾 4 つ default null）。負値は 'bad norm_target'。insert／update に 4 列。25 引数版は drop（overload 罠＝C12 設計書 §3）。既存 client（25 引数）は default で通る。
--   ★3 stores.settings_json.norm_axes＝{"days":bool,"dohan":bool,"sales":bool,"shimei":bool}（欠損＝ON）。書込は新 RPC set_store_norm_axes（owner／manager 自店・4 キー boolean のみ・他キー拒否・audit_log_write）＝set_store_profile の白名単（0164 v_keys）は触らない。
--       読取は client（lib/nox/store/norm-axes.ts 予定）＝OFF の軸を /mine ノルマカード・キャスト別ノルマ目標の列・キャスト詳細の入力口から消す（GV-2）。
--
-- 名簿・suite への影響（適用後の便で反映）: 関数 +1（set_store_norm_axes＝307）・'billing locked' +1（158）・anon-guard に 1 本（anon BLOCKED）・grants（公開 secdef の全数走査＝新関数は authenticated のみ）・0158 の md5 pin（set_comp_plan 1cddaa0e→4fa34575）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='comp_plans' and column_name like 'norm_%_target' order by 1;   -- 4 行・integer・YES
--   select count(*) filter (where norm_days_target is null and norm_dohan_target is null and norm_sales_target is null and norm_shimei_target is null) as unchanged, count(*) as total from public.comp_plans;   -- unchanged＝total
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname='set_comp_plan';                                                    -- 1 行・末尾が p_norm_shimei_target integer（25 引数版は無い）
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_comp_plan';                                                    -- 4fa34575
--   select proacl::text from pg_proc where proname='set_store_norm_axes';                                                                        -- authenticated／service_role のみ（anon なし）
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 307／83
begin;

-- ★1 comp_plans のプラン既定の目標 4 軸（既存行は null＝継承なし＝読み替えなし）
alter table public.comp_plans add column if not exists norm_days_target integer null;
alter table public.comp_plans add column if not exists norm_dohan_target integer null;
alter table public.comp_plans add column if not exists norm_sales_target integer null;
alter table public.comp_plans add column if not exists norm_shimei_target integer null;
alter table public.comp_plans drop constraint if exists comp_plans_norm_targets_check;
alter table public.comp_plans add constraint comp_plans_norm_targets_check check (
  (norm_days_target is null or norm_days_target >= 0) and (norm_dohan_target is null or norm_dohan_target >= 0)
  and (norm_sales_target is null or norm_sales_target >= 0) and (norm_shimei_target is null or norm_shimei_target >= 0));
comment on column public.comp_plans.norm_days_target is '0171（裁定347）: プラン既定の出勤日数目標（null＝継承なし）。キャスト別 cast_norms が上書き。';
comment on column public.comp_plans.norm_dohan_target is '0171（裁定347）: プラン既定の同伴目標（null＝継承なし）。';
comment on column public.comp_plans.norm_sales_target is '0171（裁定347）: プラン既定の売上目標（円・null＝継承なし）。';
comment on column public.comp_plans.norm_shimei_target is '0171（裁定347）: プラン既定の指名目標（本＋場内・null＝継承なし）。';

-- ★2 set_comp_plan 29 引数（25 引数版は drop・★以外は live 1cddaa0e の 1 バイト不変）
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[]);
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text, p_slide_basis text DEFAULT 'sales'::text, p_slide_rank_ids uuid[] DEFAULT '{}'::uuid[], p_norm_days_target integer DEFAULT NULL::integer, p_norm_dohan_target integer DEFAULT NULL::integer, p_norm_sales_target integer DEFAULT NULL::integer, p_norm_shimei_target integer DEFAULT NULL::integer)
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
  -- ★0171（裁定347）: プラン既定の目標 4 軸＝null（継承なし）か 0 以上
  if (p_norm_days_target is not null and p_norm_days_target < 0) or (p_norm_dohan_target is not null and p_norm_dohan_target < 0)
     or (p_norm_sales_target is not null and p_norm_sales_target < 0) or (p_norm_shimei_target is not null and p_norm_shimei_target < 0) then raise exception 'bad norm_target'; end if;
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
       slide_basis, slide_rank_ids,  -- ★0170
       norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target)  -- ★0171
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate,
       p_product_back_mode, p_product_back_rate, p_product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       p_product_back_fixed_hon, p_product_back_fixed_jonai, p_product_back_fixed_free,  -- ★7 0153
       p_slide_period,  -- ★0168
       p_slide_basis, p_slide_rank_ids,  -- ★0170
       p_norm_days_target, p_norm_dohan_target, p_norm_sales_target, p_norm_shimei_target)  -- ★0171
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
          slide_basis = p_slide_basis, slide_rank_ids = p_slide_rank_ids,
          norm_days_target = p_norm_days_target, norm_dohan_target = p_norm_dohan_target, norm_sales_target = p_norm_sales_target, norm_shimei_target = p_norm_shimei_target  -- ★0171                       -- ★0170
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

-- ★2-5 grants（0170 と同じ＝public／anon revoke・authenticated＋service_role）
revoke all on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer) to authenticated, service_role;


-- ★3 set_store_norm_axes（GV-2）: ノルマの採用軸＝stores.settings_json.norm_axes（4 キー boolean・欠損＝ON）
create or replace function public.set_store_norm_axes(p_store_id uuid, p_axes jsonb)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_store record; v_k text; v_before jsonb; v_after jsonb; v_settings jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if p_axes is null or jsonb_typeof(p_axes) <> 'object' then raise exception 'bad axes'; end if;
  for v_k in select jsonb_object_keys(p_axes) loop
    if v_k not in ('days','dohan','sales','shimei') then raise exception 'bad axes'; end if;
    if jsonb_typeof(p_axes -> v_k) <> 'boolean' then raise exception 'bad type'; end if;
  end loop;
  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);
  v_before := jsonb_build_object('norm_axes', v_settings -> 'norm_axes');
  v_settings := jsonb_set(v_settings, '{norm_axes}', coalesce(v_settings -> 'norm_axes', '{}'::jsonb) || p_axes, true);
  v_after := jsonb_build_object('norm_axes', v_settings -> 'norm_axes');
  update public.stores set settings_json = v_settings where id = p_store_id and org_id = public.auth_org_id();
  perform public.audit_log_write('set_store_norm_axes', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end
$fn$;
revoke all on function public.set_store_norm_axes(uuid, jsonb) from public, anon;
grant execute on function public.set_store_norm_axes(uuid, jsonb) to authenticated, service_role;

commit;
-- ===== end 0171 =====
