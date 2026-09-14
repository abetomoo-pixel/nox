-- 0144_store_profile_setter.sql
-- 店舗設定 setter mig（小）＝ set_store_profile 新設（裁定 S9/S11/S12 の統合・台帳 3808/3816 行の停止理由を解消）
-- 起草: 相談役 2026-09-14。live dump（docs/tmp/setter_dump.txt・pg_get_functiondef 逐語）の
--       set_store_cast_register（boolean 1 キー型）と set_store_receipt_profile（複数キー型）を型として写経。
--
-- 目的:
--   店舗設定の書込 RPC が無いために止まっていた 3 件を一度に開ける。
--     ①N3 店舗設定「基本情報」タブ（店舗名／表示名／略称）
--     ②N4(b) ext_shimei_enabled／dohan_auto_hon の設定 UI
--     ③裁定245-1 の shift_cast_confirm（キャスト確認の任意化）
--
-- 形（裁定247 とは別・本 mig の設計判断）:
--   キー別 setter を 3 本増やすのではなく、白名単つきの patch 型 setter を 1 本置く。
--   以後の boolean 設定はこの白名単に 1 行足す補正 mig で済み、RPC 本数が増えない。
--   白名単 8 キー:
--     列側   name / short / ext_shimei_enabled / dohan_auto_hon
--     json側 store_code / display_name / show_open_status / shift_cast_confirm
--   p_patch に無いキーは触らない。白名単外のキーは 'bad key' で拒否（黙って無視しない）。
--
-- 権限:
--   owner 限定（settings_json 系 setter＝cast_register／okuri_mode と同格）。
--   billing_writable_of で課金ロックを見るのも既存 setter と同じ。
--
-- 非改修（宣言）:
--   - 既存の set_store_* 11 本は触らない（cast-register の付け替えもしない）。
--   - stores の RLS（stores_select のみ）・grant（authenticated＝SELECT のみ）は不変＝client から update する経路は作らない。
--   - money-core（check_pay／check_close／check_void）・report-layer（daily_report_*）は触らない。
--   - 既存の settings_json キー（live 走査 17 種）の意味は不変。show_open_status／store_code／display_name／shift_cast_confirm は新規キー。
--
-- 読み側の既定（client は select 直読・キー無しは既定値に倒す。本 mig では client を変えない）:
--   store_code=''／display_name=''／show_open_status=false／shift_cast_confirm=false（=== true 判定）。
--
-- 忘れると赤になるもの（教訓21）:
--   - verify:nox-billing 段47-1 は live の pg_proc 全数＝正本 A∪B を機械 assert するため、
--     set_store_profile を正本に登録しないと赤になる。本 mig の適用と同じレーンで登録すること。
--   - verify:nox-anon-guard の set_store_* 名簿に set_store_profile を追加する（忘れても赤にはならないが穴になる）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 1) 関数の存在と署名
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where pronamespace='public'::regnamespace and proname='set_store_profile';   -- 1 行 (uuid, jsonb)
--   -- 2) proacl（anon が無いこと・authenticated と service_role があること）
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile';
--   -- 3) 既存 setter 15 本の prosrc md5 が本 mig 前後で不変（ハッシュ照合・貼付前に控える）
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname like 'set\_store\_%' and proname <> 'set_store_profile' order by proname;   -- 11 行（貼付前の値と全一致）
--   -- 4) money-core 非改修（前後一致）
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('check_pay','check_close','check_void') order by proname;
--   -- 5) stores の grant と policy が不変
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name='stores' order by grantee, privilege_type;
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid='public.stores'::regclass;
--   -- 6) stores の列定義が不変（30 列・ext_shimei_enabled/dohan_auto_hon は NOT NULL default false）
--   select count(*) from information_schema.columns where table_schema='public' and table_name='stores';   -- 30
--   -- 7) 動作（JWT 要＝verify:nox-store-profile で実施）:
--   --    owner で 8 キーを 1 回ずつ／まとめて書けること・manager と cast は forbidden・
--   --    白名単外キーは bad key・型違いは bad type・patch に無いキーは不変・audit_logs に before/after が残ること。

begin;

-- ══════════════════════════════════════════════════════════════
-- set_store_profile（白名単つき patch setter・owner 限定）
--   列側 4 キー（name/short/ext_shimei_enabled/dohan_auto_hon）と
--   settings_json 側 4 キー（store_code/display_name/show_open_status/shift_cast_confirm）を
--   1 回の update でまとめて書く。p_patch に無いキーは触らない。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_store_profile(p_store_id uuid, p_patch jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm'];
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
