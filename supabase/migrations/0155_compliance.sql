-- 0155_compliance.sql
-- 裁定309（2026-09-28・§8 未裁定 10 件・P-4 live 読取 02:15Z 基準）のうち 0155 の器＝309-1（売掛の店設定）／309-2（audit 7 年保持）／309-3（マイナンバー廃棄）／
--   309-4（顧客匿名化）／309-5（referral_payouts_unpaid を B(f) へ＝307-1）／309-10（kiosk_check_keeps）＝2026-09-28 起草（CC 写経・便 Q-2）。309-6〜9 は 0156。
--   番号 0155 は 0157 の後に手貼り（番号順に依存しない・0157→0153・0154→0152 の前例）。
-- 写経元（★以外は 1 バイト不変＝改行コードを除く（299-11）・docs/tmp/gen_0155.mjs で機械生成・md5 は $$ 内の先頭 8 桁・CR 除去）:
--   check_pay＝0140_day_closed_gate.sql（live e4088d7d）→ 期待 05ca579b（★3＝1 行挿入）
--   set_store_profile＝0153_customers_keep.sql（live e9bb2b66・0154 版 e1048e17 は 0153 の前に手貼り＝旧）→ 期待 86a7a86b（★4＝白名単 +1・declare +1・ブロック +8 行＋空行 1＝301→312 行）
--   referral_payouts_unpaid＝live 全文（docs/tmp/0155_pre.md【DB】(e)・b0f96a2b）→ 期待 4340d19f（★11＝ゲート行 1 行除去）
--   ar_policy_ok＝0055_b6_ar_collections.sql（live fea61f3c・`select true;` の空フック）→ 期待 d7b0bfcb（★2＝本体差替・署名／proacl 不変＝4 ロール revoke）
--   不触の md5 控え（live 2026-09-28T02:15Z）: get_cast_mynumber 20163586（proacl postgres, service_role）／get_cast_mynumber_masked 6f401f45／receivable_collect 46af248c／
--     customer_* 9 本（accfb2a6／ab424336／d02f065a／4fc94eb6／8a0c30c7／57f44d0c／3371b5dc／36bc688d／1c2a1097）／audit_log_write_service 430ce125
--   ★1  stores.settings_json.ar_enabled＝true を既存全店に明示 UPDATE（live 4 店＝NOX-DEMO 1／NOX-VERIFY-A 2／NOX-VERIFY-B 1・保持店 0）＋ do ブロックで全店埋まりを assert
--   ★2  ar_policy_ok 本体差替（store の settings_json->>'ar_enabled' が 'true' のときのみ true・店が無い／キーが無い＝false＝新規店の既定「不可」）
--   ★3  check_pay 結線（ar 分岐の receivables INSERT 直前に `if not ar_policy_ok(...) then raise 'ar disabled'`＝0055:165 の指示逐語）
--   ★4  set_store_profile 白名単 +1（ar_enabled boolean・show_open_status の 4 行型・owner 限定は関数冒頭で既に担保）
--   ★5  audit_purge()（service_role のみ・at < now()-7年 を org ごとに削除し action 'audit_purge' の行に件数・最古・最新・cutoff を残す・戻り jsonb）
--   ★6  cast_sensitive +3 列（mynumber_deleted_at timestamptz／mynumber_deleted_by uuid→users／mynumber_deletion_method text・別表なし・ポリシー 0／grant 0 は不変）
--   ★7  cast_mynumber_discard(p_cast_id, p_reason)（owner のみ・mynumber_enc=null＋3 列＋audit reason・平文は触らない＝復号しない）
--   ★8  cast_mynumber_discard_candidates(p_store_id null=全店)（owner・退店日の翌年 1/1 起算 7 年経過＋mynumber_enc 非 null）
--   ★9  customer_anonymize(p_customer_id, p_reason)（owner のみ・name '削除済み顧客'・furigana／tel／birthday／prefs／memo null・is_active=false・anonymized_at=now()・FK は残す・
--        customer_notes は同時削除＝件数のみ after_json 'notes_deleted'（309 追補1 (d)））
--   ★10 customer_anonymize_candidates(p_store_id null=全店)（owner・retention_until 到来＋未匿名化）
--   ★11 referral_payouts_unpaid ゲート行除去（A4→B(f)・billing 145→144）
--   ★12 kiosk_check_keeps(p_check_id)（check_customer_names と同一露出＝顧客名＋active キープのボトル名のみ・kiosk 腕あり＝裁定11 の例外を明示・STABLE＝309 追補1）
--   ★13 revoke／grant
--   新設 6 本の期待 md5（$$ 内・CR 除去）: audit_purge f2946b95／cast_mynumber_discard 3c2d917d／cast_mynumber_discard_candidates e285a272／customer_anonymize 11b4f43b／customer_anonymize_candidates d1ce4ace／kiosk_check_keeps b68a8e0c
--
-- 起草判断＝裁定309 追補1 で確定（2026-09-28・Agoora・(a)(b)(c)(e)(f)(g) 起草どおり・(d) 改稿）:
--   (a) audit_purge は org ごとに 1 行を書く（audit_logs.org_id NOT NULL のため「全体で 1 行」は書けない）。削除 0 件の org は行を書かない。actor null・reason 'retention 7y'。
--       テナント JWT（auth.uid() 非 null）からの呼出は遮断＝二重防御（grant は service_role のみ）。
--   (b) cast_mynumber_discard／customer_anonymize は billing_writable_of のゲートを持たない（法定の廃棄・保持期限は課金停止中も履行＝裁定261 の読取例外を廃棄系に拡張）。
--       名簿の区分（B(f) 相当の「非ゲート書込」新区分か A か）は名簿追補時に裁定。
--   (c) customer_anonymize は owner のみ（309-4 は権限未記載・候補一覧 RPC の owner と同格・cast_mynumber_discard と揃える）。
--   (d) customer_notes（0094・FK cascade）は customer_anonymize で同時削除＝309 追補1（本文は audit に残さない・件数のみ after_json 'notes_deleted'）。
--   (e) cast_mynumber_discard は mynumber_enc が null の cast を 'no mynumber' で拒否（廃棄記録は実体があった場合のみ）。mynumber_deletion_method は定数 'overwrite_null'（暗号文の null 上書き）。
--   (f) 廃棄候補一覧は「cast_sensitive に行があり mynumber_enc 非 null」の退店 cast のみ（廃棄済みは出さない）。全 cast の廃棄履歴は別便の閲覧 RPC。
--   (g) ★3 の結線位置＝receivables INSERT 直前（0055:165 の指示逐語）。payments 行の insert 後だが raise で関数全体がロールバック＝結果は同じ。
--
-- 名簿・suite への影響（手貼り後の client 便で張り替え・本 mig は DB のみ）:
--   全数 268→274（+6＝audit_purge／cast_mynumber_discard／cast_mynumber_discard_candidates／customer_anonymize／customer_anonymize_candidates／kiosk_check_keeps）・
--   billing 対象 145→144（referral_payouts_unpaid A4→B(f)）・anon-guard probe +6・grants G4d +6・G9 cast_sensitive 8→11 列・
--   receivable-policy／ar-partial／payroll の売掛 fixture は ★1 で全店 true ゆえ不変（新規店を作る suite（setup 66 段）は ar 未使用＝影響なし）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl, md5(replace(prosrc, E'\r', '')) from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('check_pay','set_store_profile','referral_payouts_unpaid','ar_policy_ok','audit_purge',
--       'cast_mynumber_discard','cast_mynumber_discard_candidates','customer_anonymize','customer_anonymize_candidates','kiosk_check_keeps',
--       'get_cast_mynumber','get_cast_mynumber_masked') order by 1;                                                 -- 12 行・md5 は上の期待値／不触控えと一致
--   select count(*) filter (where settings_json->>'ar_enabled' = 'true'), count(*) from public.stores;              -- 4 | 4
--   select column_name from information_schema.columns where table_schema='public' and table_name='cast_sensitive' and column_name like 'mynumber_del%' order by 1;   -- 3 行
--   select relacl from pg_class where relname='cast_sensitive';                                                     -- authenticated を含まない（0015 T1a 不変）
--   -- 動作＝突合 docs/tmp/q0928_ag_0155.mjs（BEGIN…ROLLBACK・本便 Q-3 で NG 0・期待 md5 4 本一致・ROLLBACK 後 live 不変）・suite の張り替えは手貼り後

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 stores.settings_json.ar_enabled＝true（既存全店に明示・裁定309-1）
-- ══════════════════════════════════════════════════════════════
update public.stores
   set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{ar_enabled}', 'true'::jsonb, true)
 where not (coalesce(settings_json, '{}'::jsonb) ? 'ar_enabled');                                          -- live 4 行（保持店 0）

do $$
begin
  if exists (select 1 from public.stores where coalesce(settings_json->>'ar_enabled', '') not in ('true','false')) then
    raise exception 'ar_enabled backfill incomplete';                                                     -- ★1 全店に boolean が入ったことを tx 内で assert
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★2 ar_policy_ok 本体差替（署名・STABLE・SECURITY DEFINER・4 ロール revoke は 0055 のまま）
--    店が無い／キーが無い／'false' → false（新規店の既定「不可」＝coalesce）
-- ══════════════════════════════════════════════════════════════
create or replace function public.ar_policy_ok(p_store_id uuid, p_amount int)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (s.settings_json->>'ar_enabled')::boolean from public.stores s where s.id = p_store_id), false);
$$;

-- ══════════════════════════════════════════════════════════════
-- ★3 check_pay（0140 逐語＋ar 分岐 receivables INSERT 直前に 1 行）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount, p_tendered, p_idem_key, v_actor, v_detail)
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id), v_chk.store_id);

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    if not public.ar_policy_ok(v_chk.store_id, p_amount) then raise exception 'ar disabled'; end if;   -- ★3 0155（裁定309-1）: 0055:165 の 1 行＝店設定 ar_enabled=false なら売掛不可
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★4 set_store_profile（0153 逐語＋白名単 'ar_enabled'＋boolean ブロック）
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
                             'slide_apply',                                                               -- ★4 0151: 裁定287-4 の 1 キー（0154 ★7: 末尾 '];' → ','）
                             'settlement_presets',                                                        -- ★7 0154: 裁定294-7 の 1 キー（0153 ★5: 末尾 '];' → ','）
                             'customer_purpose','customer_retention_years',                               -- ★5 0153: 裁定305-11／293-4 の 2 キー（0155 ★4: 末尾 '];' → ','）
                             'ar_enabled'];                                                               -- ★4 0155: 裁定309-1 の 1 キー（boolean・新規店の既定は false＝ar_policy_ok の coalesce）
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
  v_presets  jsonb;     -- ★7 0154: settlement_presets（配列・最大 10）
  v_pe       jsonb;     -- ★7 0154: settlement_presets の要素
  v_purpose  text;      -- ★5 0153: customer_purpose（display_name と同型・≤200）
  v_years    numeric;   -- ★5 0153: customer_retention_years（整数 1〜10）
  v_ar       boolean;   -- ★4 0155: ar_enabled（show_open_status と同型）
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

  if p_patch ? 'settlement_presets' then                                                                   -- ★7 0154（裁定294-7）: 配列・最大 10・要素 {code,name,amount,basis,target}
    v_presets := p_patch->'settlement_presets';                                                            -- ★7
    if jsonb_typeof(v_presets) <> 'array' or jsonb_array_length(v_presets) > 10 then raise exception 'bad type'; end if;   -- ★7
    for v_pe in select e from jsonb_array_elements(v_presets) e loop                                       -- ★7
      if jsonb_typeof(v_pe) <> 'object'                                                                    -- ★7
         or coalesce(jsonb_typeof(v_pe->'code'), '') <> 'string' or length(trim(v_pe->>'code')) = 0       -- ★7: 欠損（null）も拒否
         or coalesce(jsonb_typeof(v_pe->'name'), '') <> 'string'                                           -- ★7
         or coalesce(jsonb_typeof(v_pe->'amount'), '') <> 'number'                                         -- ★7
         or (v_pe->>'amount')::numeric < 0 or (v_pe->>'amount')::numeric <> trunc((v_pe->>'amount')::numeric)   -- ★7: 整数 ≥0
         or coalesce(jsonb_typeof(v_pe->'basis'), '') <> 'string'                                          -- ★7
         or coalesce(jsonb_typeof(v_pe->'target'), '') <> 'string'                                         -- ★7
         or (v_pe->>'target') not in ('late','absent','early','other') then                                -- ★7
        raise exception 'bad type';                                                                        -- ★7
      end if;                                                                                              -- ★7
    end loop;                                                                                              -- ★7
    v_before   := v_before || jsonb_build_object('settlement_presets', coalesce(v_settings->'settlement_presets', '[]'::jsonb));   -- ★7
    v_after    := v_after  || jsonb_build_object('settlement_presets', v_presets);                         -- ★7
    v_settings := jsonb_set(v_settings, '{settlement_presets}', v_presets, true);                          -- ★7
  end if;                                                                                                  -- ★7

  if p_patch ? 'customer_purpose' then                                                                     -- ★5 0153（裁定305-11／293-4）: display_name ブロックと同型
    if jsonb_typeof(p_patch->'customer_purpose') <> 'string' then raise exception 'bad type'; end if;      -- ★5
    v_purpose := trim(p_patch->>'customer_purpose');                                                       -- ★5
    if length(v_purpose) > 200 then raise exception 'bad customer_purpose'; end if;                        -- ★5
    v_before   := v_before || jsonb_build_object('customer_purpose', coalesce(v_settings->>'customer_purpose', ''));   -- ★5
    v_after    := v_after  || jsonb_build_object('customer_purpose', v_purpose);                           -- ★5
    v_settings := jsonb_set(v_settings, '{customer_purpose}', to_jsonb(v_purpose), true);                  -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'customer_retention_years' then                                                             -- ★5 0153（裁定305-11）: 整数 1〜10（settlement_presets の数値検査の型）
    if jsonb_typeof(p_patch->'customer_retention_years') <> 'number' then raise exception 'bad type'; end if;   -- ★5
    v_years := (p_patch->>'customer_retention_years')::numeric;                                            -- ★5
    if v_years < 1 or v_years > 10 or v_years <> trunc(v_years) then raise exception 'bad customer_retention_years'; end if;   -- ★5
    v_before   := v_before || jsonb_build_object('customer_retention_years', coalesce((v_settings->>'customer_retention_years')::int, 5));   -- ★5: 既定 5
    v_after    := v_after  || jsonb_build_object('customer_retention_years', v_years::int);                -- ★5
    v_settings := jsonb_set(v_settings, '{customer_retention_years}', to_jsonb(v_years::int), true);       -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'ar_enabled' then                                                                               -- ★4 0155（裁定309-1）: ar_enabled（show_open_status の 4 行型を写経・owner 限定は関数冒頭で担保）
    if jsonb_typeof(p_patch->'ar_enabled') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_ar := (p_patch->>'ar_enabled')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('ar_enabled',                                                  -- ★4
                    coalesce(v_settings->>'ar_enabled', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('ar_enabled', v_ar);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{ar_enabled}', to_jsonb(v_ar), true);                                  -- ★4
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

-- ══════════════════════════════════════════════════════════════
-- ★5 audit_purge（service_role のみ・保持 7 年固定・org ごとに削除＋記録 1 行・裁定309-2）
--    実行は手動（cron は Vercel Pro 後に起票）。live は at < now()-7年 の行 0＝初回は削除 0・記録 0。
-- ══════════════════════════════════════════════════════════════
create or replace function public.audit_purge()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cutoff timestamptz := now() - interval '7 years';
  v_org    record;
  v_n      int;
  v_oldest timestamptz;
  v_newest timestamptz;
  v_total  int := 0;
  v_orgs   int := 0;
begin
  -- 二重防御: grant は service_role のみ＋テナント JWT（auth.uid() 非 null）からの呼出は遮断
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  for v_org in select id from public.orgs order by id loop
    with d as (
      delete from public.audit_logs where org_id = v_org.id and at < v_cutoff returning at
    )
    select count(*)::int, min(at), max(at) into v_n, v_oldest, v_newest from d;
    if v_n > 0 then
      -- 記録は削除後に書く（at=now() ゆえ本 purge の対象にならない）・件数・最古・最新・cutoff のみ（本文は残さない）
      perform public.audit_log_write_service(v_org.id, null, 'audit_purge', 'audit_logs', null,
        jsonb_build_object('deleted', v_n, 'oldest', v_oldest, 'newest', v_newest, 'cutoff', v_cutoff),
        null, 'retention 7y');
      v_total := v_total + v_n;
      v_orgs  := v_orgs + 1;
    end if;
  end loop;
  return jsonb_build_object('cutoff', v_cutoff, 'orgs', v_orgs, 'deleted', v_total);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★6 cast_sensitive +3 列（廃棄記録・別表なし・裁定309-3）。ポリシー 0／grant 0（0015 T1a）は不変＝列追加で relacl は動かない。
-- ══════════════════════════════════════════════════════════════
alter table public.cast_sensitive add column if not exists mynumber_deleted_at      timestamptz;
alter table public.cast_sensitive add column if not exists mynumber_deleted_by      uuid references public.users(id);
alter table public.cast_sensitive add column if not exists mynumber_deletion_method text;

-- ══════════════════════════════════════════════════════════════
-- ★7 cast_mynumber_discard（owner のみ・復号しない＝search_path は public のみ・平文は関数内に現れない）
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_mynumber_discard(p_cast_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast   record;
  v_cs     record;
  v_actor  uuid;
  v_reason text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;                              -- owner のみ（309-3）
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) > 200 then raise exception 'bad reason'; end if;            -- 理由必須（≤200）
  select id, org_id, store_id into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  select cast_id, mynumber_enc into v_cs from public.cast_sensitive where cast_id = p_cast_id for update;
  if v_cs.cast_id is null or v_cs.mynumber_enc is null then raise exception 'no mynumber'; end if;         -- 起草判断 (e)
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.cast_sensitive
     set mynumber_enc             = null,
         mynumber_deleted_at      = now(),
         mynumber_deleted_by      = v_actor,
         mynumber_deletion_method = 'overwrite_null',
         updated_at               = now()
   where cast_id = p_cast_id;
  -- 監査（値は記録しない・有無と方法のみ・reason 列に理由）
  perform public.audit_log_write('cast_mynumber_discard', 'cast_sensitive:' || p_cast_id::text,
    jsonb_build_object('mynumber_set', true),
    jsonb_build_object('mynumber_set', false, 'method', 'overwrite_null'),
    v_cast.store_id, v_reason);
  return p_cast_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★8 cast_mynumber_discard_candidates（owner・退店日の翌年 1/1 起算 7 年経過＋mynumber_enc 非 null・自動削除なし）
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_mynumber_discard_candidates(p_store_id uuid default null)
returns table(cast_id uuid, store_id uuid, name text, left_on date, due_on date)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  return query
    select c.id, c.store_id, c.name, c.left_on,
           (make_date(extract(year from c.left_on)::int + 1, 1, 1) + interval '7 years')::date
      from public.casts c
      join public.cast_sensitive cs on cs.cast_id = c.id
     where c.org_id = public.auth_org_id()
       and (p_store_id is null or c.store_id = p_store_id)
       and c.left_on is not null
       and make_date(extract(year from c.left_on)::int + 1, 1, 1) + interval '7 years' <= current_date
       and cs.mynumber_enc is not null
     order by c.left_on, c.name;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★9 customer_anonymize（owner のみ・物理削除なし・FK（check_customers／receivables／check_lines／reservations）は残す・customer_notes は同時削除・裁定309-4／309 追補1 (d)）
-- ══════════════════════════════════════════════════════════════
create or replace function public.customer_anonymize(p_customer_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cu     record;
  v_reason text;
  v_notes  int;   -- 309 追補1 (d): 同時削除した customer_notes の件数
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;                              -- 起草判断 (c)
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) > 200 then raise exception 'bad reason'; end if;
  select id, org_id, store_id, anonymized_at into v_cu from public.customers where id = p_customer_id for update;
  if v_cu.id is null or v_cu.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if v_cu.anonymized_at is not null then raise exception 'already anonymized'; end if;
  delete from public.customer_notes where customer_id = p_customer_id;                                   -- 309 追補1 (d): 本文は audit に残さない
  get diagnostics v_notes = row_count;
  update public.customers
     set name          = '削除済み顧客',
         furigana      = null,
         tel           = null,
         birthday      = null,
         prefs         = null,
         memo          = null,
         is_active     = false,
         anonymized_at = now(),
         updated_at    = now()
   where id = p_customer_id;
  -- 監査（個人情報の値は before にも残さない・消したフィールド名のみ・reason 列に理由）
  perform public.audit_log_write('customer_anonymize', 'customers:' || p_customer_id::text,
    null,
    jsonb_build_object('anonymized_at', now(),
                       'fields', to_jsonb(array['name','furigana','tel','birthday','prefs','memo','is_active']),
                       'notes_deleted', v_notes),
    v_cu.store_id, v_reason);
  return p_customer_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★10 customer_anonymize_candidates（owner・retention_until 到来＋未匿名化・自動化なし）
-- ══════════════════════════════════════════════════════════════
create or replace function public.customer_anonymize_candidates(p_store_id uuid default null)
returns table(customer_id uuid, store_id uuid, name text, last_visit_at timestamptz, retention_until date, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  return query
    select cu.id, cu.store_id, cu.name, cu.last_visit_at, cu.retention_until, cu.is_active
      from public.customers cu
     where cu.org_id = public.auth_org_id()
       and (p_store_id is null or cu.store_id = p_store_id)
       and cu.anonymized_at is null
       and cu.retention_until is not null
       and cu.retention_until <= current_date
     order by cu.retention_until, cu.name;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★11 referral_payouts_unpaid（live 逐語からゲート行 1 行を除去＝A4→B(f)・裁定307-1／309-5）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.referral_payouts_unpaid(p_store_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(payout_id uuid, referrer_id uuid, referrer_name text, referrer_kind text, withholding_category text, check_id uuid, biz_date date, amount integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.referrer_id, r.name, r.kind, r.withholding_category, p.check_id, p.biz_date, p.amount
      from public.referral_payouts p
      join public.referrers r on r.id = p.referrer_id
     where p.store_id = p_store_id and p.status = 'unpaid'
       and (p_from is null or p.biz_date >= p_from)
       and (p_to   is null or p.biz_date <= p_to)
     order by p.biz_date, r.name, p.created_at;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★12 kiosk_check_keeps（check_customer_names（0153 ★15）と同一の露出＝顧客名＋active キープのボトル名のみ・kiosk 腕を足す＝裁定309-10）
--     電話・メモ・誕生日・グレードは返さない（裁定11 顧客系非開示の例外を本 RPC に限定）。ゲート行なし（305-4 と同じ B(f)）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_check_keeps(p_check_id uuid)
returns table(customer_id uuid, pos integer, name text, bottle_names text[])   -- pos＝check_customers.position（予約語回避・0153 ★15 と同じ）
language plpgsql stable security definer set search_path = public as $$       -- STABLE＝309 追補1
declare
  v_chk record;
  v_org uuid;
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_check_id is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（309-10）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  return query
    select cc.customer_id, cc.position, cu.name,
           coalesce((select array_agg(coalesce(b.bottle_name, p.name) order by b.opened_at)
                       from public.bottle_keeps b join public.products p on p.id = b.product_id
                      where b.customer_id = cc.customer_id and b.status = 'active'), '{}'::text[])
      from public.check_customers cc join public.customers cu on cu.id = cc.customer_id
     where cc.check_id = p_check_id
     order by cc.position;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★13 revoke／grant（既存の proacl を再掲・新設は同型・内部専用は 4 ロール revoke・service 専用は service_role のみ）
-- ══════════════════════════════════════════════════════════════
revoke execute on function public.ar_policy_ok(uuid, int) from public, anon, authenticated, service_role;   -- 0055 のまま（postgres のみ）
revoke all on function public.check_pay(uuid,text,integer,text,integer,uuid,text) from public, anon;
grant execute on function public.check_pay(uuid,text,integer,text,integer,uuid,text) to authenticated, service_role;
revoke all on function public.set_store_profile(uuid,jsonb) from public, anon;
grant execute on function public.set_store_profile(uuid,jsonb) to authenticated, service_role;
revoke all on function public.referral_payouts_unpaid(uuid,date,date) from public, anon;
grant execute on function public.referral_payouts_unpaid(uuid,date,date) to authenticated, service_role;
revoke all on function public.audit_purge() from public, anon, authenticated;
grant execute on function public.audit_purge() to service_role;                                            -- service 専用（billing_writable_of 0087 と同型）
revoke all on function public.cast_mynumber_discard(uuid,text) from public, anon;
grant execute on function public.cast_mynumber_discard(uuid,text) to authenticated, service_role;
revoke all on function public.cast_mynumber_discard_candidates(uuid) from public, anon;
grant execute on function public.cast_mynumber_discard_candidates(uuid) to authenticated, service_role;
revoke all on function public.customer_anonymize(uuid,text) from public, anon;
grant execute on function public.customer_anonymize(uuid,text) to authenticated, service_role;
revoke all on function public.customer_anonymize_candidates(uuid) from public, anon;
grant execute on function public.customer_anonymize_candidates(uuid) to authenticated, service_role;
revoke all on function public.kiosk_check_keeps(uuid) from public, anon;
grant execute on function public.kiosk_check_keeps(uuid) to authenticated, service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl, md5(replace(prosrc, E'\r', '')) from pg_proc
  where pronamespace='public'::regnamespace and proname in ('check_pay','set_store_profile','referral_payouts_unpaid','ar_policy_ok','audit_purge',
    'cast_mynumber_discard','cast_mynumber_discard_candidates','customer_anonymize','customer_anonymize_candidates','kiosk_check_keeps',
    'get_cast_mynumber','get_cast_mynumber_masked') order by 1;
select column_name from information_schema.columns where table_schema='public' and table_name='cast_sensitive' and column_name like 'mynumber_del%' order by 1;
select relacl from pg_class where relname='cast_sensitive';
select count(*) filter (where settings_json->>'ar_enabled' = 'true') as ar_true, count(*) as stores from public.stores;
