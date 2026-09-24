-- 0151_holes.sql
-- 裁定283（0151＝穴埋め 4 点）・287（設計）＝2026-09-18 起草（CC 写経・パス 1・便 AE）。
-- 写経元（live prosrc・docs/tmp/0151_holes_live.md 逐語）:
--   ★1 staff_shift_cancel   ＝ shift_remove（骨格・before/after null の audit）＋ staff_shift_confirm／override（gate・can_manage・biz_date 判定・6 引数 audit）
--   ★2 shift_open_periods_mine ＝ shift_wish_submit 冒頭の actor 行（auth_cast_id・casts.store_id）＋ set_cast_norm_self（header／revoke all … from public, anon／grant）
--   ★3 set_cast_guarantee   ＝ set_cast_plan（ガード・cast／plan 照合・role・audit を逐語。overrides 検証ループは p_overrides が無いため写さない・区間の扱いは★）
--   ★4 set_store_profile    ＝ live 全文（0147 適用後）を機械で写し、白名単 +1（'slide_apply'）・宣言 +1・検証ブロック +1（biz_type と同型）のみ★
--   ★5 revoke／grant: ★1＝0136/0137 の staff_shift_* と同形（revoke execute … from public, anon／grant … to authenticated, service_role）・
--       ★2＝0148 set_cast_norm_self と同形（revoke all … from public, anon）・★3＝0116 set_cast_plan と同形（revoke all … 2 行書き）・★4＝0147 と同形
--
-- 要裁定（起草時に列挙・**裁定289（2026-09-24）で確定**＝(1) 'not_found'／(6)(8) ①重なり OR ②valid_from > p_start の別保証行／(2)(3)(4)(5)(7) 起草どおり。本文は 289 に追従済）:
--   (1) ★1 'not found' の文言: 相談役指定は「写経元に合わせる」＝shift_remove は行不在を 'forbidden'（org 照合と同じ raise）で返し、staff_shift_confirm／override は
--       'not_found'。本起草は指定どおり 'not found'（空白区切り）。staff_* の既存文言 'not_found'（下線）と揃えるかは裁定待ち。
--   (2) ★2 cast 以外・未認証の呼び出し＝「0 行」（raise しない）で起草。shift_wish_submit は 'forbidden'／'no cast for caller' を raise する＝写経元と挙動が違う点。
--   (3) ★3 現在行 C が無いキャスト（cast_plan 0 行）＝'no plan' を raise（287 に記述なし・set_cast_plan は null なら insert する）。
--   (4) ★3 (a)(b) の保証行の overrides_json＝C の overrides_json に base／guarantee を上書き（C が保証行のときも C の他キーを継ぐ）。
--   (5) ★3 戻し行の base＝直前の非保証行が base キーを持つときだけ復元（持たなければ base キーを外す＝プランの基本時給に戻る）。
--   (6) ★3 'guarantee exists' の判定: 287 の逐語「p_start 以降に開始する別の保証行」を「valid_from >= p_start」で起草すると、現在行 C（valid_to null）は常に
--       最後の行のため C 以外に該当し得ず（set_cast_plan は未来日の行を作ると C を閉じてその行を現在行にする）、判定が空になる。AG d3-2（既存の保証期間の
--       途中に別の保証を入れる）で 'bad valid_from'（(c) 規則）が先に出た。本起草は「p_start 時点で有効な別の保証行（valid_to が null か p_start 以降・
--       C 自身は除く）」＝重なりの判定に読み替えた（要裁定(8)）。(b) の延長（C＝戻し行）は前の保証行の valid_to < p_start のため通る。
--   (7) ★2 の返す列＝shift_periods の live 定義（start_date date／end_date date／wish_deadline date）と一致＝注記なし。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   -- 1) 新 RPC 3 本＋set_store_profile: 署名・secdef・search_path・proacl（anon／PUBLIC なし）
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig, proacl from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('staff_shift_cancel','shift_open_periods_mine','set_cast_guarantee','set_store_profile') order by 1;
--   -- 2) set_store_profile の白名単 21 キー（'slide_apply' を含む）
--   select prosrc like '%''slide_apply''%' from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile';   -- t
--   -- 3) 不触の md5（money-core 3 本・check_group_due・billing_writable_of・他の set_store_* 12 本）が貼付前の控えと一致
--   -- 4) 動作＝suite（staff-shift／payroll／store-profile の張り替え＋新段）・ROLLBACK 実証は docs/tmp/0151_ag.md

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 staff_shift_cancel（裁定287-1）＝ shift_remove ＋ staff_shift_confirm／override の写経
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_shift_cancel(p_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  r public.staff_shifts%rowtype;
  v_before jsonb;
begin
  if p_id is null then raise exception 'invalid_input'; end if;
  select * into r from public.staff_shifts where id = p_id;
  if not found then raise exception 'not_found'; end if;                                       -- ★1: 文言は 'not_found'（裁定289-1＝staff_shift_confirm／override と同じ下線形）
  perform public.staff_shift_gate(r.store_id);
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if not public.staff_shift_can_manage(r.store_id) then raise exception 'forbidden'; end if;
  if r.biz_date < public.staff_shift_biz_today(r.store_id) then raise exception 'biz_date_past'; end if;
  if r.status = 'confirmed' and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason required'; end if;   -- ★1（裁定287-1）
  select to_jsonb(s) into v_before from public.staff_shifts s where s.id = p_id;
  delete from public.staff_shifts where id = p_id;                                             -- ★1: 行を delete（status 'cancelled' は足さない）
  perform public.audit_log_write('staff_shift_cancel', 'staff_shifts:' || p_id::text,
    v_before, null, r.store_id, p_reason);                                                     -- ★1: before＝行全体・after null・理由（staff_shift_override と同じ 6 引数形）
  return p_id;
end $$;
revoke execute on function public.staff_shift_cancel(uuid, text) from public, anon;
grant execute on function public.staff_shift_cancel(uuid, text) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★2 shift_open_periods_mine（裁定287-2）＝ shift_wish_submit 冒頭 ＋ set_cast_norm_self の型
-- ══════════════════════════════════════════════════════════════
create or replace function public.shift_open_periods_mine()
returns table(start_date date, end_date date, wish_deadline date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid; v_row record;
begin
  if public.auth_org_id() is null then return; end if;                                          -- ★2: cast 以外・未認証は 0 行（raise しない）
  v_cast := public.auth_cast_id();
  if v_cast is null then return; end if;                                                        -- ★2: 'no cast for caller' の代わりに 0 行
  select org_id, store_id into v_row from public.casts where id = v_cast;
  return query
    select p.start_date, p.end_date, p.wish_deadline
      from public.shift_periods p
     where p.store_id = v_row.store_id and p.status = 'open'
     order by p.start_date;
end $$;
revoke all on function public.shift_open_periods_mine() from public, anon;
grant execute on function public.shift_open_periods_mine() to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★3 set_cast_guarantee（裁定287-3）＝ set_cast_plan の写経（区間の扱いだけ★）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_cast_guarantee(p_cast_id uuid, p_amount integer, p_start date, p_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_c           public.cast_plan%rowtype;   -- ★3 0151: 現在行 C（valid_to is null・for update）
  v_prev        public.cast_plan%rowtype;   -- ★3 0151: C の直前の非保証行（guarantee が true でない・valid_from 降順の先頭）
  v_back_ov     jsonb;                       -- ★3 0151: 戻し行の overrides_json
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- ★3 0151（裁定287-3）: 引数検証（overrides 検証ループは p_overrides が無いため写さない）
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_start is null or p_start < current_date then raise exception 'bad valid_from'; end if;
  if p_end is null or p_end < p_start then raise exception 'bad valid_to'; end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★3 0151: 現在行 C（valid_to is null）を for update で特定。無ければ 'no plan'
  select * into v_c from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null
   for update;
  if v_c.id is null then raise exception 'no plan'; end if;
  -- plan の org/store 照合＋inactive 遮断（set_cast_plan と同じ・plan は C と同じ）
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = v_c.plan_id;   -- ★3 0151: plan は C と同じ
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;

  -- ★3 0151（裁定289-6）: 'guarantee exists'＝①p_start〜p_end と重なる別の保証行（valid_to null か valid_to >= p_start、かつ valid_from <= p_end）
  --   または ②valid_from > p_start の別の保証行（既存の予定より前に差し込めない）。C 自身は除く。延長＝前の保証行の valid_to < p_start かつ後続なし＝通る
  if exists (select 1 from public.cast_plan cp
              where cp.cast_id = p_cast_id and cp.id <> v_c.id
                and coalesce(cp.overrides_json->>'guarantee', '') = 'true'
                and (((cp.valid_to is null or cp.valid_to >= p_start) and cp.valid_from <= p_end)
                     or cp.valid_from > p_start)) then
    raise exception 'guarantee exists';
  end if;
  if p_start < v_c.valid_from then raise exception 'bad valid_from'; end if;   -- ★3 (c)

  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  -- ★3 0151: 戻し行の overrides_json＝C と同じ。C 自身が保証行なら guarantee を外し base を直前の非保証行の値に戻す（無ければ base キーを外す）
  if coalesce(v_c.overrides_json->>'guarantee', '') = 'true' then
    select * into v_prev from public.cast_plan cp
     where cp.cast_id = p_cast_id and cp.valid_from < v_c.valid_from
       and coalesce(cp.overrides_json->>'guarantee', '') <> 'true'
     order by cp.valid_from desc
     limit 1;
    v_back_ov := (v_c.overrides_json - 'guarantee') - 'base';
    if v_prev.id is not null and (v_prev.overrides_json ? 'base') then
      v_back_ov := v_back_ov || jsonb_build_object('base', v_prev.overrides_json->'base');
    end if;
  else
    v_back_ov := v_c.overrides_json;
  end if;

  if p_start > v_c.valid_from then
    -- ★3 (a): C を p_start-1 で閉じ、保証行を insert
    update public.cast_plan
       set valid_to = p_start - 1, updated_at = now()
     where id = v_c.id;
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from, valid_to)
    values (p_cast_id, v_cast_org, v_cast_store, v_c.plan_id,
            v_c.overrides_json || jsonb_build_object('base', p_amount, 'guarantee', true), p_start, p_end);
  else
    -- ★3 (b): p_start = C.valid_from＝C を保証行に書き換える
    update public.cast_plan
       set valid_to = p_end,
           overrides_json = v_c.overrides_json || jsonb_build_object('base', p_amount, 'guarantee', true),
           updated_at = now()
     where id = v_c.id;
  end if;
  -- ★3: 戻し行（valid_from = p_end+1・valid_to null・plan と overrides は C と同じ＝上の規則）
  insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
  values (p_cast_id, v_cast_org, v_cast_store, v_c.plan_id, v_back_ov, p_end + 1);

  select to_jsonb(cp) into v_after from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  perform public.audit_log_write('set_cast_guarantee', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

revoke all on function public.set_cast_guarantee(uuid, integer, date, date)
  from public, anon;
grant execute on function public.set_cast_guarantee(uuid, integer, date, date)
  to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★4 set_store_profile（裁定287-4）＝ live 全文の機械写経＋白名単 'slide_apply'・検証ブロック
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_store_profile(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm',   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）
                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）
                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1
                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）
                             'slide_apply'];                                                              -- ★4 0151: 裁定287-4 の 1 キー
  v_k        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_name     text;
  v_short    text;
  v_code     text;
  v_disp     text;
  v_ext      boolean;
  v_dohan    boolean;
  v_open     boolean;
  v_confirm  boolean;
  v_settings jsonb;
  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）
  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）
  v_setup_done boolean;   -- ★4 0147: setup_done（show_open_status と同型）
  v_s_hourly boolean;   -- ★4 0147: sys_hourly（show_open_status と同型）
  v_s_backs  boolean;   -- ★4 0147: sys_backs（show_open_status と同型）
  v_s_sales_rate boolean;   -- ★4 0147: sys_sales_rate（show_open_status と同型）
  v_s_points boolean;   -- ★4 0147: sys_points（show_open_status と同型）
  v_s_sales_slide boolean;   -- ★4 0147: sys_sales_slide（show_open_status と同型）
  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）
  v_s_norms  boolean;   -- ★4 0147: sys_norms（show_open_status と同型）
  v_s_penalties boolean;   -- ★4 0147: sys_penalties（show_open_status と同型）
  v_s_bonus  boolean;   -- ★4 0147: sys_bonus（show_open_status と同型）
  v_slide    text;      -- ★4 0151: slide_apply（enum text 2 値・biz_type と同型）
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json
    into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  -- 白名単外のキーは黙って無視せず拒否
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;

  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);

  -- ── 列側 ────────────────────────────────────────────────
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;
    v_name := trim(p_patch->>'name');
    if length(v_name) < 1 or length(v_name) > 50 then raise exception 'bad name'; end if;
    v_before := v_before || jsonb_build_object('name', v_store.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;

  if p_patch ? 'short' then
    if jsonb_typeof(p_patch->'short') <> 'string' then raise exception 'bad type'; end if;
    v_short := trim(p_patch->>'short');
    if length(v_short) > 20 then raise exception 'bad short'; end if;
    if v_short = '' then v_short := null; end if;   -- 空欄は null（列は null 可）
    v_before := v_before || jsonb_build_object('short', v_store.short);
    v_after  := v_after  || jsonb_build_object('short', v_short);
  end if;

  if p_patch ? 'ext_shimei_enabled' then
    if jsonb_typeof(p_patch->'ext_shimei_enabled') <> 'boolean' then raise exception 'bad type'; end if;
    v_ext := (p_patch->>'ext_shimei_enabled')::boolean;
    v_before := v_before || jsonb_build_object('ext_shimei_enabled', v_store.ext_shimei_enabled);
    v_after  := v_after  || jsonb_build_object('ext_shimei_enabled', v_ext);
  end if;

  if p_patch ? 'dohan_auto_hon' then
    if jsonb_typeof(p_patch->'dohan_auto_hon') <> 'boolean' then raise exception 'bad type'; end if;
    v_dohan := (p_patch->>'dohan_auto_hon')::boolean;
    v_before := v_before || jsonb_build_object('dohan_auto_hon', v_store.dohan_auto_hon);
    v_after  := v_after  || jsonb_build_object('dohan_auto_hon', v_dohan);
  end if;

  -- ── settings_json 側 ───────────────────────────────────
  if p_patch ? 'store_code' then
    if jsonb_typeof(p_patch->'store_code') <> 'string' then raise exception 'bad type'; end if;
    v_code := trim(p_patch->>'store_code');
    if length(v_code) > 20 then raise exception 'bad store_code'; end if;
    v_before   := v_before || jsonb_build_object('store_code', coalesce(v_settings->>'store_code', ''));
    v_after    := v_after  || jsonb_build_object('store_code', v_code);
    v_settings := jsonb_set(v_settings, '{store_code}', to_jsonb(v_code), true);
  end if;

  if p_patch ? 'display_name' then
    if jsonb_typeof(p_patch->'display_name') <> 'string' then raise exception 'bad type'; end if;
    v_disp := trim(p_patch->>'display_name');
    if length(v_disp) > 50 then raise exception 'bad display_name'; end if;
    v_before   := v_before || jsonb_build_object('display_name', coalesce(v_settings->>'display_name', ''));
    v_after    := v_after  || jsonb_build_object('display_name', v_disp);
    v_settings := jsonb_set(v_settings, '{display_name}', to_jsonb(v_disp), true);
  end if;

  if p_patch ? 'show_open_status' then
    if jsonb_typeof(p_patch->'show_open_status') <> 'boolean' then raise exception 'bad type'; end if;
    v_open := (p_patch->>'show_open_status')::boolean;
    v_before   := v_before || jsonb_build_object('show_open_status',
                    coalesce(v_settings->>'show_open_status', '') = 'true');
    v_after    := v_after  || jsonb_build_object('show_open_status', v_open);
    v_settings := jsonb_set(v_settings, '{show_open_status}', to_jsonb(v_open), true);
  end if;

  if p_patch ? 'shift_cast_confirm' then
    if jsonb_typeof(p_patch->'shift_cast_confirm') <> 'boolean' then raise exception 'bad type'; end if;
    v_confirm := (p_patch->>'shift_cast_confirm')::boolean;
    v_before   := v_before || jsonb_build_object('shift_cast_confirm',
                    coalesce(v_settings->>'shift_cast_confirm', '') = 'true');
    v_after    := v_after  || jsonb_build_object('shift_cast_confirm', v_confirm);
    v_settings := jsonb_set(v_settings, '{shift_cast_confirm}', to_jsonb(v_confirm), true);
  end if;

  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────
  if p_patch ? 'biz_type' then                                                                             -- ★2 0147
    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）
    v_biz := p_patch->>'biz_type';                                                                         -- ★2
    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）
    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2
    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2
    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2
  end if;                                                                                                  -- ★2

  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147
    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）
    v_bill := p_patch->>'billing_mode';                                                                    -- ★3
    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）
    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3
    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3
    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3
  end if;                                                                                                  -- ★3

  if p_patch ? 'setup_done' then                                                                               -- ★4 0147: setup_done（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'setup_done') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_setup_done := (p_patch->>'setup_done')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('setup_done',                                                  -- ★4
                    coalesce(v_settings->>'setup_done', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('setup_done', v_setup_done);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{setup_done}', to_jsonb(v_setup_done), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_hourly' then                                                                               -- ★4 0147: sys_hourly（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_hourly') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_hourly := (p_patch->>'sys_hourly')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_hourly',                                                  -- ★4
                    coalesce(v_settings->>'sys_hourly', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_hourly', v_s_hourly);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_hourly}', to_jsonb(v_s_hourly), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_backs' then                                                                               -- ★4 0147: sys_backs（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_backs') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_backs := (p_patch->>'sys_backs')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_backs',                                                  -- ★4
                    coalesce(v_settings->>'sys_backs', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_backs', v_s_backs);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_backs}', to_jsonb(v_s_backs), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_rate' then                                                                               -- ★4 0147: sys_sales_rate（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_rate') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_rate := (p_patch->>'sys_sales_rate')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_rate',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_rate', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_rate', v_s_sales_rate);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_rate}', to_jsonb(v_s_sales_rate), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_points' then                                                                               -- ★4 0147: sys_points（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_points') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_points := (p_patch->>'sys_points')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_points',                                                  -- ★4
                    coalesce(v_settings->>'sys_points', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_points', v_s_points);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_points}', to_jsonb(v_s_points), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_slide' then                                                                               -- ★4 0147: sys_sales_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_slide := (p_patch->>'sys_sales_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_slide', v_s_sales_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_slide}', to_jsonb(v_s_sales_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_point_slide' then                                                                               -- ★4 0147: sys_point_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_point_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_point_slide := (p_patch->>'sys_point_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_point_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_point_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_point_slide', v_s_point_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_norms' then                                                                               -- ★4 0147: sys_norms（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_norms') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_norms := (p_patch->>'sys_norms')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_norms',                                                  -- ★4
                    coalesce(v_settings->>'sys_norms', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_norms', v_s_norms);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_norms}', to_jsonb(v_s_norms), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_penalties' then                                                                               -- ★4 0147: sys_penalties（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_penalties') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_penalties := (p_patch->>'sys_penalties')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_penalties',                                                  -- ★4
                    coalesce(v_settings->>'sys_penalties', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_penalties', v_s_penalties);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_penalties}', to_jsonb(v_s_penalties), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_bonus' then                                                                               -- ★4 0147: sys_bonus（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_bonus') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_bonus := (p_patch->>'sys_bonus')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_bonus',                                                  -- ★4
                    coalesce(v_settings->>'sys_bonus', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_bonus', v_s_bonus);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_bonus}', to_jsonb(v_s_bonus), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'slide_apply' then                                                                          -- ★4 0151（裁定287-4）: biz_type ブロックと同型
    if jsonb_typeof(p_patch->'slide_apply') <> 'string' then raise exception 'bad type'; end if;           -- ★4
    v_slide := p_patch->>'slide_apply';                                                                    -- ★4
    if v_slide is null or v_slide not in ('next','current') then raise exception 'bad slide_apply'; end if; -- ★4（'bad biz_type' と同型）
    v_before   := v_before || jsonb_build_object('slide_apply', coalesce(v_settings->>'slide_apply', ''));  -- ★4
    v_after    := v_after  || jsonb_build_object('slide_apply', v_slide);                                  -- ★4
    v_settings := jsonb_set(v_settings, '{slide_apply}', to_jsonb(v_slide), true);                         -- ★4
  end if;                                                                                                  -- ★4

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

revoke execute on function public.set_store_profile(uuid, jsonb) from public, anon;
grant  execute on function public.set_store_profile(uuid, jsonb) to authenticated, service_role;

commit;

-- 手貼り末尾の確認（0147〜0149 と同形）:
-- select 'nox-project-proof', count(*) from public.orgs;                                                             -- 3
-- select proname, proacl from pg_proc where pronamespace='public'::regnamespace and proname in ('staff_shift_cancel','shift_open_periods_mine','set_cast_guarantee','set_store_profile') order by 1;
