-- 0174_comp_norm_staff.sql — 裁定390／起票110／394／395＋kiosk スタッフ群（P172 Q-4）＋デモ payload（P172 Q-8）（便 M173・2026-10-16 起草・適用は Agoora 手貼り・**0173 の後**）
-- 翻訳元: live（nox 本番 ref hiqbfagmkrdpmlqhkmsu・2026-10-16 読取＝docs/tmp/0173_live.json）の関数定義に★差分（生成器 docs/tmp/gen_0174.mjs・手打ちなし）。0173 と同じ関数は触らない。
--   ★1 390 スライド段数: comp_plan_slide_check の上限 3→10（sales_slide／point_slide は jsonb 配列のまま・既存 ≤3 段は有効）
--   ★2 110 達成ボーナスの多段: comp_plan_components.params.thresholds の各要素に amount（既存行＝コンポーネントの amount を写す＝移行 SQL・set_comp_component は params を object としてしか見ない＝不変）
--   ★3 394 ノルマ未達の減額 4 軸: penalty_config +norm_shimei_flat／norm_shimei_per／norm_sales_flat／norm_sales_per／norm_sales_unit（既定 10000）・set_penalty_config 17 引数（旧 12 引数 drop・新 5 引数は既定あり）
--   ★4 395 スライドの判定タイミング: comp_plans.slide_apply text null（next／current・null＝店設定 slide_apply に従う）・set_comp_plan 30 引数（旧 29 引数 drop）
--   ★5 kiosk スタッフ群: kiosk_staff_list()（打刻端末＝purpose 'punch'・自店の manager／staff・当営業日の最後の打刻）・staff_punch(p_membership_id, p_pin, p_kind)（staff_pin の crypt 照合・ロック閾値＝店設定・順序検査・staff_punches 書込・audit_logs 直 insert）
--   ★6 デモ payload: demo_org_reset の c_wipe／c_load に staff_contracts／staff_punches／staff_payroll_runs／terms_acceptances（memberships の後に投入・先に削除）
--   既存データの書換え＝★2 の thresholds（achievement_bonus 行・amount 無しの要素にだけ足す）のみ。slide_apply は null（既定＝店設定＝golden 不変・デモ ACE は payload で 'next'）。
-- 検証（Success の後・形で見る）: 末尾 ===== verify ===== のクエリ 10 本（貼り先証明・列・引数・md5 6 本・proacl・移行行数・名簿 314／87／160）。
-- md5 pin（prosrc・\r 除去・先頭 8 桁）＝写経元: comp_plan_slide_check cb12b4a9・set_penalty_config e69dc51f・set_comp_plan 4fa34575・demo_org_reset a4bd6a18・kiosk_punch 5a1d5f10・kiosk_login 819e0c5c
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ 列 ═════════════════════════════════════════════════════════════════════
-- ★3 394
alter table public.penalty_config add column if not exists norm_shimei_flat integer not null default 0 check (norm_shimei_flat >= 0);
alter table public.penalty_config add column if not exists norm_shimei_per integer not null default 0 check (norm_shimei_per >= 0);
alter table public.penalty_config add column if not exists norm_sales_flat integer not null default 0 check (norm_sales_flat >= 0);
alter table public.penalty_config add column if not exists norm_sales_per integer not null default 0 check (norm_sales_per >= 0);
alter table public.penalty_config add column if not exists norm_sales_unit integer not null default 10000 check (norm_sales_unit >= 1);
-- ★4 395
alter table public.comp_plans add column if not exists slide_apply text check (slide_apply is null or slide_apply in ('next','current'));

-- ═══ ★2 110 移行（achievement_bonus の thresholds 各要素に amount＝コンポーネントの amount・amount 持ちの要素は不変） ═══
update public.comp_plan_components c
   set params = jsonb_set(c.params, '{thresholds}',
                          (select coalesce(jsonb_agg(case when e ? 'amount' then e else e || jsonb_build_object('amount', c.amount) end), '[]'::jsonb)
                             from jsonb_array_elements(c.params->'thresholds') e)),
       updated_at = now()
 where c.kind = 'achievement_bonus'
   and jsonb_typeof(c.params->'thresholds') = 'array'
   and exists (select 1 from jsonb_array_elements(c.params->'thresholds') e where not (e ? 'amount'));

-- ═══ 旧署名の drop（overload 罠） ═════════════════════════════════════════════
drop function if exists public.set_penalty_config(uuid, integer, integer, numeric, boolean, integer, integer, integer, integer, integer, integer, integer);
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer);

-- ═══ comp_plan_slide_check ═══
CREATE OR REPLACE FUNCTION public.comp_plan_slide_check(p_slide jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_len  int;
  v_i    int;
  v_elem jsonb;
  v_at   numeric;
  v_wage numeric;
  v_prev numeric := null;
begin
  if p_slide is null or jsonb_typeof(p_slide) <> 'array' then raise exception 'bad slide'; end if;
  v_len := jsonb_array_length(p_slide);
  if v_len > 10 then raise exception 'bad slide'; end if;   -- ★1 0174（裁定390）: 段数 1〜10（旧 3）。昇順 strict・整数 ≥0 は不変・時給の単調増加は UI の警告のみ
  for v_i in 0 .. v_len - 1 loop
    v_elem := p_slide -> v_i;
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad slide'; end if;
    if (select count(*) from jsonb_object_keys(v_elem)) <> 2
       or v_elem -> 'at' is null or v_elem -> 'wage' is null then
      raise exception 'bad slide';
    end if;
    if jsonb_typeof(v_elem -> 'at') <> 'number' or jsonb_typeof(v_elem -> 'wage') <> 'number' then
      raise exception 'bad slide';
    end if;
    v_at   := (v_elem ->> 'at')::numeric;
    v_wage := (v_elem ->> 'wage')::numeric;
    if v_at < 0 or v_at <> trunc(v_at) or v_wage < 0 or v_wage <> trunc(v_wage) then
      raise exception 'bad slide';
    end if;
    if v_prev is not null and v_at <= v_prev then raise exception 'bad slide'; end if; -- 昇順 strict
    v_prev := v_at;
  end loop;
end $function$;
revoke execute on function public.comp_plan_slide_check(jsonb) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres} を踏襲）

-- ═══ set_penalty_config ═══
CREATE OR REPLACE FUNCTION public.set_penalty_config(p_store_id uuid, p_fine_absent integer, p_fine_late integer, p_hours_per_shift numeric, p_norm_on boolean, p_norm_days_flat integer, p_norm_days_per integer, p_norm_dohan_flat integer, p_norm_dohan_per integer, p_late_grace_min integer, p_early_grace_min integer, p_over_grace_min integer, p_norm_shimei_flat integer DEFAULT 0, p_norm_shimei_per integer DEFAULT 0, p_norm_sales_flat integer DEFAULT 0, p_norm_sales_per integer DEFAULT 0, p_norm_sales_unit integer DEFAULT 10000)   -- ★3 0174（裁定394）: 指名／売上の 2 軸（定額／不足 1 単位ごと・売上の単位は円＝既定 1 万円）。既定値は EX-1 までの旧 12 引数呼びの互換＝UI は明示値を渡す（規約7）
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
  if p_fine_absent is null or p_fine_absent < 0 then raise exception 'bad fine_absent'; end if;
  if p_fine_late is null or p_fine_late < 0 then raise exception 'bad fine_late'; end if;
  if p_hours_per_shift is null or p_hours_per_shift <= 0 or p_hours_per_shift > 24 then raise exception 'bad hours_per_shift'; end if;
  if p_norm_on is null then raise exception 'bad norm_on'; end if;
  if p_norm_days_flat is null or p_norm_days_flat < 0 then raise exception 'bad norm_days_flat'; end if;
  if p_norm_days_per is null or p_norm_days_per < 0 then raise exception 'bad norm_days_per'; end if;
  if p_norm_dohan_flat is null or p_norm_dohan_flat < 0 then raise exception 'bad norm_dohan_flat'; end if;
  if p_norm_dohan_per is null or p_norm_dohan_per < 0 then raise exception 'bad norm_dohan_per'; end if;
  if p_late_grace_min is null or p_late_grace_min < 0 then raise exception 'bad late_grace_min'; end if;
  if p_early_grace_min is null or p_early_grace_min < 0 then raise exception 'bad early_grace_min'; end if;
  if p_over_grace_min is null or p_over_grace_min < 0 then raise exception 'bad over_grace_min'; end if;
  -- ★3 0174（裁定394）: 4 軸＝373 と同じく片方のみ（定額 or 不足 1 単位ごと）＝両方 >0 は 'bad norm_*'・採用 OFF の軸は UI が 0 を送る
  if p_norm_shimei_flat is null or p_norm_shimei_flat < 0 then raise exception 'bad norm_shimei_flat'; end if;
  if p_norm_shimei_per is null or p_norm_shimei_per < 0 then raise exception 'bad norm_shimei_per'; end if;
  if p_norm_sales_flat is null or p_norm_sales_flat < 0 then raise exception 'bad norm_sales_flat'; end if;
  if p_norm_sales_per is null or p_norm_sales_per < 0 then raise exception 'bad norm_sales_per'; end if;
  if p_norm_sales_unit is null or p_norm_sales_unit < 1 then raise exception 'bad norm_sales_unit'; end if;
  if p_norm_shimei_flat > 0 and p_norm_shimei_per > 0 then raise exception 'bad norm_shimei'; end if;
  if p_norm_sales_flat > 0 and p_norm_sales_per > 0 then raise exception 'bad norm_sales'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;

  select to_jsonb(pc) into v_before from public.penalty_config pc where pc.store_id = p_store_id;
  insert into public.penalty_config
    (org_id, store_id, fine_absent, fine_late, hours_per_shift, norm_on,
     norm_days_flat, norm_days_per, norm_dohan_flat, norm_dohan_per,
     late_grace_min, early_grace_min, over_grace_min,   -- 0174: 末尾 ')' → ','
     norm_shimei_flat, norm_shimei_per, norm_sales_flat, norm_sales_per, norm_sales_unit)   -- ★3 0174
  values
    (public.auth_org_id(), p_store_id, p_fine_absent, p_fine_late, p_hours_per_shift, p_norm_on,
     p_norm_days_flat, p_norm_days_per, p_norm_dohan_flat, p_norm_dohan_per,
     p_late_grace_min, p_early_grace_min, p_over_grace_min,   -- 0174: 末尾 ')' → ','
     p_norm_shimei_flat, p_norm_shimei_per, p_norm_sales_flat, p_norm_sales_per, p_norm_sales_unit)   -- ★3 0174
  on conflict (store_id) do update
    set fine_absent = excluded.fine_absent, fine_late = excluded.fine_late,
        hours_per_shift = excluded.hours_per_shift, norm_on = excluded.norm_on,
        norm_days_flat = excluded.norm_days_flat, norm_days_per = excluded.norm_days_per,
        norm_dohan_flat = excluded.norm_dohan_flat, norm_dohan_per = excluded.norm_dohan_per,
        late_grace_min = excluded.late_grace_min, early_grace_min = excluded.early_grace_min,
        over_grace_min = excluded.over_grace_min,   -- 0174: 末尾 ',' を足す
        norm_shimei_flat = excluded.norm_shimei_flat, norm_shimei_per = excluded.norm_shimei_per,   -- ★3 0174
        norm_sales_flat = excluded.norm_sales_flat, norm_sales_per = excluded.norm_sales_per, norm_sales_unit = excluded.norm_sales_unit   -- ★3 0174
  returning id into v_id;
  select to_jsonb(pc) into v_after from public.penalty_config pc where pc.id = v_id;
  perform public.audit_log_write('set_penalty_config', 'penalty_config:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_penalty_config(uuid, integer, integer, numeric, boolean, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.set_penalty_config(uuid, integer, integer, numeric, boolean, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) to authenticated;

-- ═══ set_comp_plan ═══
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text, p_slide_basis text DEFAULT 'sales'::text, p_slide_rank_ids uuid[] DEFAULT '{}'::uuid[], p_norm_days_target integer DEFAULT NULL::integer, p_norm_dohan_target integer DEFAULT NULL::integer, p_norm_sales_target integer DEFAULT NULL::integer, p_norm_shimei_target integer DEFAULT NULL::integer, p_slide_apply text DEFAULT NULL::text)   -- ★4 0174（裁定395）: next＝前期の実績で当期の時給／current＝当期の累計／null＝店設定 slide_apply に従う
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
  -- ★4 0174（裁定395）: 判定タイミング＝null（店設定に従う）／next／current
  if p_slide_apply is not null and p_slide_apply not in ('next','current') then raise exception 'bad slide_apply'; end if;
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
       norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target,  -- ★0171（0174: 末尾 ')' → ','）
       slide_apply)  -- ★4 0174（裁定395）
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate,
       p_product_back_mode, p_product_back_rate, p_product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       p_product_back_fixed_hon, p_product_back_fixed_jonai, p_product_back_fixed_free,  -- ★7 0153
       p_slide_period,  -- ★0168
       p_slide_basis, p_slide_rank_ids,  -- ★0170
       p_norm_days_target, p_norm_dohan_target, p_norm_sales_target, p_norm_shimei_target,  -- ★0171（0174: 末尾 ')' → ','）
       p_slide_apply)  -- ★4 0174（裁定395）
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
          norm_days_target = p_norm_days_target, norm_dohan_target = p_norm_dohan_target, norm_sales_target = p_norm_sales_target, norm_shimei_target = p_norm_shimei_target,  -- ★0171（0174: 末尾 ',' を足す）
          slide_apply = p_slide_apply  -- ★4 0174（裁定395）                       -- ★0170
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text) to authenticated;

-- ═══ demo_org_reset ═══
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_notice_reads','cast_pin','cast_plan',   -- ★8 0160（326-9）: +cast_notice_reads（casts・notices より先に消す）
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','payroll_run_deduction_overrides','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_attentions','daily_pays','payroll_adjustments','payslips',   -- ★6 0159（起票92）: +3 表（overrides は deductions より先に消す＝FK deduction_id）
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','cast_contract_acks','cast_quotas','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances','memberships','stores'];   -- ★8 0160: +cast_quotas（casts より先に消す）・★5 0162: +cast_contract_acks（casts より先に消す）・★6 0174: +4 表（0172 の staff 3 表＋terms_acceptances＝memberships より先に消す・FK membership_id）
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  -- ★6 0174: +4 表（0172 の staff 3 表＋terms_acceptances＝memberships の直後に投入）
  c_load constant text[] := array[
    'stores','memberships','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','cast_quotas','cast_contract_acks','staff_shift_wishes','shift_wishes','shift_periods','seats','products',   -- ★8 0160: +cast_quotas（casts の後）・★5 0162: +cast_contract_acks（casts の後）
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_notice_reads','cast_norms',   -- ★8 0160: +cast_notice_reads（casts・notices の後）
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;
revoke execute on function public.demo_org_reset(uuid, jsonb, text) from public, anon, authenticated, service_role;   -- 内部専用（live ACL {postgres=X/postgres,service_role=X/postgres} を踏襲）
grant execute on function public.demo_org_reset(uuid, jsonb, text) to service_role;

-- ═══ kiosk_staff_list（新設・★5） ═══
CREATE OR REPLACE FUNCTION public.kiosk_staff_list()
 RETURNS TABLE(membership_id uuid, user_name text, role text, has_pin boolean, last_kind text, last_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ★5 0174（P172 Q-4 の積み残し）: 打刻端末（kiosk_devices purpose 'punch'）から読める自店のスタッフ（manager／staff・cast は kiosk_cast_list）。
  --   last_kind／last_at＝当営業日の最後の打刻（UI の出勤中／退勤済みの表示）。
  select m.id, u.name, m.role,
         exists (select 1 from public.staff_pin p where p.membership_id = m.id),
         (select sp.kind from public.staff_punches sp
           where sp.membership_id = m.id and sp.biz_date = public.biz_date_of(m.store_id, now())
           order by sp.punched_at desc limit 1),
         (select sp.punched_at from public.staff_punches sp
           where sp.membership_id = m.id and sp.biz_date = public.biz_date_of(m.store_id, now())
           order by sp.punched_at desc limit 1)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where m.store_id = public.auth_kiosk_store_id()
    and m.is_active and u.is_active
    and m.role in ('manager','staff')
  order by u.name
$function$;
revoke execute on function public.kiosk_staff_list() from public, anon;
grant execute on function public.kiosk_staff_list() to authenticated;

-- ═══ staff_punch（新設・★5） ═══
CREATE OR REPLACE FUNCTION public.staff_punch(p_membership_id uuid, p_pin text, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★5 0174（P172 Q-4 の積み残し）: 打刻端末からのスタッフ打刻＝kiosk_punch（cast）と kiosk_login（staff_pin の照合・ロック閾値＝店設定）の合成。
--   順序検査＝当営業日の最後の打刻が in なら out だけ・無いか out なら in だけ（'already in'／'not in'）。source 'kiosk'・created_by null。
declare
  v_device   public.kiosk_devices;
  v_mem      record;
  v_pin      public.staff_pin;
  v_ip       text;
  v_id       uuid;
  v_newfail  integer;
  v_settings jsonb;
  v_max      integer;
  v_lock     interval;
  v_bd       date;
  v_last     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 15));
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_login 逐語）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象＝自店 active の manager／staff（他店／他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active and m.role in ('manager','staff');
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'staff_punch',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 端末の最終アクセス → 順序検査 → 記録
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  v_bd := public.biz_date_of(v_device.store_id, now());
  select sp.kind into v_last from public.staff_punches sp
   where sp.membership_id = p_membership_id and sp.biz_date = v_bd
   order by sp.punched_at desc limit 1;
  if p_kind = 'in' and v_last = 'in' then raise exception 'already in'; end if;
  if p_kind = 'out' and (v_last is null or v_last = 'out') then raise exception 'not in'; end if;

  insert into public.staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source, created_by)
  values (p_membership_id, v_device.org_id, v_device.store_id, v_bd, p_kind, now(), 'kiosk', null)
  returning id into v_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'staff_punch',
     'staff_punches:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'kind', p_kind, 'biz_date', v_bd, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_id, 'punched_at', now(), 'biz_date', v_bd,
                            'operator_name', v_mem.user_name, 'kind', p_kind);
end $function$;
revoke execute on function public.staff_punch(uuid, text, text) from public, anon;
grant execute on function public.staff_punch(uuid, text, text) to authenticated;

commit;
-- ===== verify（Success の後に 1 つずつ・値ではなく形を見る） =====
-- 1 貼り先証明
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
-- 2 列（6 本）
select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public'
   and ((table_name='penalty_config' and column_name like 'norm_s%') or (table_name='comp_plans' and column_name='slide_apply')) order by 1, 2;   -- 6 行
-- 3 引数（各 1 行・旧版なし）
select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('set_penalty_config','set_comp_plan','kiosk_staff_list','staff_punch') order by 1;                                       -- 4 行（17 引数／30 引数／0／3）
-- 4 md5（6 本）
select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('comp_plan_slide_check','set_penalty_config','set_comp_plan','demo_org_reset','kiosk_staff_list','staff_punch') order by 1;
  -- comp_plan_slide_check 8aedb6d7
  -- set_penalty_config d6c05607
  -- set_comp_plan 21afb3f5
  -- demo_org_reset 3cdf7a30
  -- kiosk_staff_list 53e9d7a7
  -- staff_punch 250c61b0
-- 5 proacl（authenticated／service_role のみ・anon なし・demo_org_reset は既存 ACL のまま）
select proname, proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in ('comp_plan_slide_check','set_penalty_config','set_comp_plan','demo_org_reset','kiosk_staff_list','staff_punch') order by 1;   -- 6 行
-- 6 ★2 移行＝achievement_bonus の全要素に amount
select count(*) filter (where not exists (select 1 from jsonb_array_elements(params->'thresholds') e where not (e ? 'amount'))) migrated, count(*) total
  from public.comp_plan_components where kind = 'achievement_bonus';                                                                            -- migrated＝total（live 2／2）
-- 7 既存データ不変
select count(*) from public.comp_plans where slide_apply is not null;                                                                          -- 0
select count(*) from public.comp_plans where jsonb_array_length(sales_slide) > 3 or jsonb_array_length(point_slide) > 3;                       -- 0
-- 8 demo_org_reset の配列に 4 表
select proname from pg_proc where proname='demo_org_reset' and prosrc like '%''staff_contracts'',''staff_punches'',''staff_payroll_runs'',''terms_acceptances''%';   -- 1 行
-- 9 名簿
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions,
       (select count(*) from pg_tables where schemaname='public') tables,
       (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%') gated;                       -- 314／87／160
-- ===== end 0174 =====
