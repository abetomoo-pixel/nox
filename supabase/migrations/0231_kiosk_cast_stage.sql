-- 0231_kiosk_cast_stage.sql（0231 の作り直し・相談役 11/27 12:10 の線引き・Agoora に確認中＝起草だけ・貼らない（合図は相談役））
-- 翻訳元: 本番の pg_get_functiondef（2026-11-27T02:59:41.613Z 読取・docs/tmp/kiosk_cast_stage_1127/live/・read.mjs）＋生成器 gen-0231.mjs（アンカー置換・数が 1 でなければ止まる）。前の起草 docs/tmp/kiosk_cast_stage_1126/（11/26・当てていない）を置き換える。
--   積んだ相手：check_line_set_customer は 0227 の後の本文（本番 11:58:19 適用・md5 c6936b8ef923c9825030ed162a8543bc）／check_set_ext_rule は 0234 の後の本文（docs/tmp/pay_guard_1126/new/check_set_ext_rule.sql・md5 5721b32329443f3f8dca8bf185e7bee1）／check_move_seat は 0242 の後の本文（docs/tmp/seat_down_1126/new/check_move_seat.sql・md5 b1b742fc50b691b5ad91eb1a6171687e）。
--   当てる順＝全体の最後（READY.md 2 節）。後の組（0235 決め f・0244・0237・0238・0239c）と 0236d・0241g・0228 は 0231 の 23 本を作り直さない（READY.md の重なりの表）。
-- 中身（関数 23 本を作り直し＋新しい内部の関数 1 本）:
--   ★1 新しい内部の関数 assert_cast_register_level2()：auth の cast で段階 2 未満なら 'forbidden'（check_close・check_pay・receipt_issue と同じ判定）。4 ロール revoke・grant なし（原則 8：冒頭の null guard）。
--   ★2 段階 2（会計まで）を求める 16 本：役の柵の直後に perform assert_cast_register_level2()＝check_remove_line・check_set_people・check_extension_add・check_set_ext_rule・check_move_seat・check_add_seat・check_remove_seat・check_line_set_group・check_set_nominations・check_dohan_add・check_shimei_add・check_customer_remove・bottle_keep_register・print_enqueue・check_referral_set・check_referral_remove。
--   ★3 中で分ける 3 本：check_add_line＝p_product_id が無い形（額を送る形）だけ段階 2／check_open＝段階 1 の cast は区分とルールを本人の指定から受けず、サーバがレジの画面の初めの区分（初回料金でない有効な区分の並びの先頭）を選ぶ／
--      check_line_set_customer＝p_keep true（ボトルの会計前のキープ）は段階 2（段階 1 はお客様を付けるだけ）。
--   ★4 自分の卓だけの店の柵（auth_cast_check_allowed）を cast の枝に足す：check_set_people・check_move_seat・check_remove_line・check_line_set_group・check_set_nominations・check_add_seat・check_remove_seat・check_customer_add・check_customer_remove・check_line_set_customer・bottle_keep_out・bottle_keep_register（購入行のある登録だけ）。
--   ★5 auth_cast_close_ok（裁定513-1）：最後の行に auth_cast_register_level() >= 2（daily_report_close・report_can_close・register_cast_roster・daily_reports の RLS に一度に効く）。
--   ★6 kiosk_person_claim（裁定511-11・#44）：キャストの枝の段階の条件 ≥2 → ≥1（前の 0231 の中身）。
--   段階 1 に残す物（触らない）：check_time_charge_apply・読むだけの 5 本（check_customer_names・kiosk_check_keeps・pricing_categories_for_register・register_cast_roster・register_open_categories）。
--   署名・SECURITY DEFINER・search_path・ACL・監査（各関数の audit_log_write）は変えない（ACL は今の文で言い直すだけ）。check_close・check_pay・receipt_issue は触らない。
-- 当てる順（相談役 11/27 13:20）＝0236d → 0241g → 0234 → 0242 → 0235（決め f）→ 0244 → 0237 → 0238 → 0239c（0236d の上）→ 0231（全体の最後）。
-- 関数 527（全部を当てた後）→ 528（新しい内部の関数 1 本）・表 133・ポリシー 152（pg_policy・全スキーマ）は変わらない。
-- 検証クエリ: docs/tmp/kiosk_cast_stage_1127/0231_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）・事前確認 0231_precheck.sql（返りが貼り先証明の 1 行だけなら貼る）
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 assert_cast_register_level2（新しい内部の関数・4 ロール revoke・grant なし） ═══
CREATE FUNCTION public.assert_cast_register_level2()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0231（相談役 11/27 12:10・#158・#170）: 内部専用（public・anon・authenticated・service_role を revoke・grant なし）。
--   check_close・check_pay・receipt_issue と同じ判定（auth の cast で店のレジ使用の段階が 2＝会計まで 未満なら 'forbidden'）を 1 本に。段階 2 の操作の RPC が役の柵の直後に perform する。
--   cast 以外（owner／manager／staff）・店の端末の腕（auth_role() が null）には効かない＝今までどおり。
--   原則 8：auth_* を自ら読む＝冒頭の null guard（呼び元と同じく auth の会社か店の端末のどちらかが要る）。
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then raise exception 'forbidden'; end if;
end $function$;
revoke execute on function public.assert_cast_register_level2() from public, anon, authenticated, service_role;

-- ═══ ★2 段階 2: check_remove_line（fence(v_chk.id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_remove_line(p_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_paycnt int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_remove_line');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(v_chk.id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  delete from public.bottle_keeps where check_line_id = p_line_id and status = 'pending';   -- ★0191（M-30）: 行を消すと pending のキープも消す（active は残す＝開栓済み）
  delete from public.check_lines where id = p_line_id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_remove_line', 'check_lines:' || p_line_id::text,
    to_jsonb(v_line), null, v_chk.store_id);
end $function$;
revoke execute on function public.check_remove_line(p_line_id uuid) from public, anon;
grant execute on function public.check_remove_line(p_line_id uuid) to authenticated;

-- ═══ ★2 段階 2: check_set_people（fence(p_check_id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_set_people(p_check_id uuid, p_people integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_paycnt int; v_units int; v_mode text;  -- ★mig0097
  v_join text; v_added int; v_sort int; v_frozen boolean := false;  -- ★2 0173（裁定386）
  v_before jsonb;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_set_people');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- person 制の units 変動＝入金後の合計変動を塞ぐ（apply/shimei と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  v_before := to_jsonb(v_chk);

  -- ★mig0097 R2-7b: 2段 apply（auto 店のみ）。①旧 units で経過ブロックを生成・凍結→②people 更新→
  --   ③進行中ブロックのみ新 units で upsert。放置伝票（apply 未発生のまま複数ブロック経過）でも
  --   変更前ブロックが旧人数で確定する＝時点起算の厳密化（設計書 v1.1 正本）
  -- ★2 0173（裁定386）: セット終了後（started_at＋set_min 経過）の人数変更＝セット料金を引き直さない（checks.set_frozen＝apply／manual 再計算の対象外）。
  --   ＋は店設定 join_mode＝'join_set'（既定）なら合流セット行（人数単位・増えた人数×セット単価・time_auto=false）／'extend_only' なら延長だけ（apply が人数に追随）。−は不変。
  select coalesce(nullif(s.settings_json->>'join_mode', ''), 'join_set') into v_join from public.stores s where s.id = v_chk.store_id;
  if coalesce(v_chk.set_frozen, false) then
    v_frozen := true;
  elsif coalesce(v_chk.time_end, 'extend') <> 'unlimited'   -- ★0210（相談役 11/25）: 時間無制限は「終わらない」＝セットの凍結に入らない（人数の変更はセットの行に追随）
    and coalesce(v_chk.set_min, 0) > 0 and now() >= v_chk.started_at + make_interval(mins => v_chk.set_min)
     and p_people is distinct from v_chk.people then
    v_frozen := true;
    update public.checks set set_frozen = true where id = p_check_id;
  end if;
  if v_frozen and v_join = 'join_set' and coalesce(p_people, 1) > coalesce(v_chk.people, 1)
     and coalesce(v_chk.set_unit, v_chk.time_per) = 'person' and coalesce(v_chk.set_fee, 0) > 0 then
    v_added := coalesce(p_people, 1) - coalesce(v_chk.people, 1);
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, all_in)   -- ★0210: +all_in
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'set', 'A',
            case when v_chk.set_price_mode = 'all_in' then '合流 初回料金(' || v_chk.set_min || '分) 税・サ込' else '合流セット(' || v_chk.set_min || '分)' end, v_chk.set_fee, v_added, v_chk.set_fee * v_added,   -- ★0210: 込みの卓の合流は込みの額
            null, v_sort, false, 'set', coalesce(v_chk.set_price_mode, 'base') = 'all_in');
    perform public.check_recalc(p_check_id);
  end if;
  select s.time_mode into v_mode from public.stores s where s.id = v_chk.store_id;
  if v_mode = 'auto' then
    perform public.check_time_charge_apply(p_check_id);
  end if;

  update public.checks set people = p_people where id = p_check_id;

  -- 開卓時 set 行の即時追随（auto 店は次回 apply でも同値に収束＝二重権威にならない。
  --   manual 店はここが唯一の再計算点。行が無い（set額0 等）場合は何もしない）
  --   ★mig0130: 判定は set 実効単位(checks.set_unit・null=time_per フォールバック=現行同値)
  if v_mode = 'auto' then
    -- ③進行中ブロック＋set 行を新 units で再計算（set=全遡及・ext=時点起算は apply が担う）
    perform public.check_time_charge_apply(p_check_id);
  elsif not v_frozen and coalesce(v_chk.set_unit, v_chk.time_per) = 'person' then   -- ★2 0173: 凍結後は引き直さない
    v_units := coalesce(p_people, 1);
    update public.check_lines
       set qty = v_units, line_total = unit_price_snapshot * v_units
     where check_id = p_check_id and time_auto and fee_kind = 'set';
    perform public.check_recalc(p_check_id);
  end if;

  -- ★mig0130(裁定118-8): person 単位 vip_charge 行の人数追随(両モード共通)。
  --   apply は vip 行を触らない(裁定7)ためここが唯一の追随点。table 単位・vip なし伝票は不触。
  --   旧伝票=vip_charge_unit null=不触(現行同値)
  if v_chk.vip_charge_unit = 'person' then
    v_units := coalesce(p_people, 1);
    update public.check_lines
       set qty = v_units, line_total = unit_price_snapshot * v_units
     where check_id = p_check_id and time_auto and fee_kind = 'vip_charge';
    if found then perform public.check_recalc(p_check_id); end if;
  end if;

  perform public.audit_log_write('check_set_people', 'checks:' || p_check_id::text,
    v_before, (select to_jsonb(c) from public.checks c where c.id = p_check_id),
    v_chk.store_id);
end $function$;
revoke execute on function public.check_set_people(p_check_id uuid, p_people integer) from public, anon;
grant execute on function public.check_set_people(p_check_id uuid, p_people integer) to authenticated;

-- ═══ ★2 段階 2: check_extension_add（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_extension_add(p_check_id uuid, p_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_mode text; v_units int; v_sort int; v_paycnt int; v_id uuid;
  v_emin int; v_efee int;  -- ★mig0098 R2-1: 選択メニュー(null=既定スナップ)
  v_org uuid;
  v_seat_kind text; r_fee record; v_nom record; v_sort2 int; v_id2 uuid;  -- ★0124 裁定111-7
  v_eunit text; v_eunit_menu text;  -- ★mig0130: 実効単位(メニュー unit キー/ext_unit/time_per)
  v_pick jsonb;  -- ★0187（便 EXT）: 時間帯に合う行
  v_label text;  -- ★23 0175 v2（裁定408 系）: パターン名（延長行に併記・既定＝選択中 ext_rule_id の label）
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_extension_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  if coalesce(v_chk.time_end, 'extend') <> 'extend' then raise exception 'no extension'; end if;   -- ★0210（起票140）: 時間で終わり／時間無制限の初回の卓（店長以上が check_set_time_end で切り替えた後は通る）
  if v_chk.ext_min < 1 or v_chk.ext_fee < 0 or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;
  -- ★manual 専用(auto 店は check_time_charge_apply が権威=二重計上封じ)
  select time_mode into v_mode from public.stores where id = v_chk.store_id;
  if v_mode is distinct from 'manual' then raise exception 'auto mode'; end if;

  -- ★mig0098 R2-1: p_rule_id null=既定(checks スナップ ext_min/ext_fee=現行完全互換)。
  --   指定時は ext_menu_snap(開栓時凍結)から解決=live pricing_rules は読まない(凍結原則 R2-4)。
  --   snap に無い id・旧伝票(snap null)への指定は 'bad rule'
  --   ★mig0130: 単位も凍結値から=既定は checks.ext_unit・メニュー指定は項目の unit キー。
  --     旧 snap(unit キーなし)・旧伝票(ext_unit null)は time_per フォールバック=現行同値
  v_emin := v_chk.ext_min;
  v_efee := v_chk.ext_fee;
  v_eunit := coalesce(v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  if p_rule_id is not null then
    select (m.value->>'duration_min')::int, (m.value->>'amount')::int,
           nullif(m.value->>'unit', ''), m.value->>'label' into v_emin, v_efee, v_eunit_menu, v_label   -- ★23 v2: +label
      from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
     where (m.value->>'rule_id')::uuid = p_rule_id;
    if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then
      raise exception 'bad rule';
    end if;
    v_eunit := coalesce(v_eunit_menu, v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  end if;
  -- ★23 0175 v2（裁定408 系）: 既定（p_rule_id null）は選択中のパターン（checks.ext_rule_id）の label を併記（旧伝票＝null）
  if p_rule_id is null and v_chk.ext_rule_id is not null then
    select m.value->>'label' into v_label from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m where (m.value->>'rule_id')::uuid = v_chk.ext_rule_id;
  end if;
  -- ★0187（便 EXT・Agoora 確定 10/27（2））: 既定（p_rule_id null）＝この延長の開始時刻（＝今）の時間帯に合う行を凍結メニューから選ぶ（時間帯つき→選択中のパターン→既定）。
  --   0187 前に開いた伝票（band キーなしの凍結）・合う行なし＝v_pick null＝従来どおり（checks の ext_min／ext_fee／ext_rule_id の label）
  if p_rule_id is null then
    v_pick := public.ext_menu_pick(v_chk.ext_menu_snap, (select b.biz_min from public.biz_minutes_of(v_chk.store_id, now()) b), v_chk.ext_rule_id, null);
    if v_pick is not null and (v_pick->>'duration_min')::int >= 1 and (v_pick->>'amount')::int >= 0 then
      v_emin := (v_pick->>'duration_min')::int; v_efee := (v_pick->>'amount')::int;
      v_eunit := coalesce(nullif(v_pick->>'unit', ''), v_chk.ext_unit, v_chk.time_per); v_label := v_pick->>'label';
    end if;
  end if;
  -- ★mig0130: 防御深度(凍結値の妥当性)
  if v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_units := case when v_eunit = 'person' then coalesce(v_chk.people, 1) else 1 end;  -- ★mig0130: ext_unit 起点
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_lines where check_id = p_check_id;
  -- 1押し=1行(time_auto=false=部分ユニーク非対象・客確認の記録が行数で残る・取消は remove_line)
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto, fee_kind)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          case when v_label is null then '延長料金(' || v_emin || '分)' else '延長料金（' || v_label || '）' end, v_efee, v_units,   -- ★23 v2: パターン名を併記
          v_efee * v_units, null, v_sort, false, 'extension')
  returning id into v_id;

  -- ★0124 裁定111-7 判断D/E/G: 延長指名料。ext_shimei は指名料の性質=延長人数(v_units)非連動・qty=1/cast
  if (select st.ext_shimei_enabled from public.stores st where st.id = v_chk.store_id) then
    select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
    select * into r_fee from public.pricing_resolve_core(
      v_chk.store_id, v_chk.started_at, 'ext_shimei', v_seat_kind, null);  -- rank 非対応(判断D)
    if r_fee.amount is not null then  -- ルールヒットなし=課金しない(skip)
      for v_nom in select cast_id from public.check_nominations
                    where check_id = p_check_id and nom_kind = 'hon' and ended_at is null
                    order by position
      loop
        select coalesce(max(sort_order), 0) + 1 into v_sort2
          from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '延長指名料', r_fee.amount, 1, r_fee.amount, null, v_sort2, 'ext_shimei', v_nom.cast_id)
        returning id into v_id2;
        perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id2::text, null,
          (select to_jsonb(l) from public.check_lines l where l.id = v_id2), v_chk.store_id);
      end loop;
    end if;
  end if;

  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_extension_add(p_check_id uuid, p_rule_id uuid) from public, anon;
grant execute on function public.check_extension_add(p_check_id uuid, p_rule_id uuid) to authenticated;

-- ═══ ★2 段階 2: check_set_ext_rule（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_set_ext_rule(p_check_id uuid, p_rule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0173（裁定385 追補）: 自動延長後の延長パターン切替＝checks.ext_min／ext_fee／ext_unit を ext_menu_snap の別パターンへ・
--   確定済み（time_auto）の延長ブロックは新単価で引き直す（qty＝人数／卓はそのまま・分数が違うパターンへの切替は単価だけ引き直し＝ブロック数は不変・仮決め）。
--   ゲート＝check_set_people と同型（owner／manager／staff can_register／cast can_register／kiosk 腕）。
declare
  v_chk record; v_org uuid; v_emin int; v_efee int; v_eunit text; v_before jsonb; v_n int;
  v_label text;  -- ★23 0175 v2（裁定408 系）: パターン名（延長行に併記）
  v_paycnt int;  -- ★0234（#41）: 入金の数
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_set_ext_rule');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_rule_id is null then raise exception 'bad rule'; end if;
  select * into v_chk from public.checks where id = p_check_id for update;   -- ★0234（#41）: 入金（check_pay も行を押さえる）と順に
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★0234（#41）: 入金の後は延長パターンを変えない＝伝票の額が動くほかの 9 本（check_time_charge_apply・check_set_people ほか）と同じ止め
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  select (m.value->>'duration_min')::int, (m.value->>'amount')::int, m.value->>'unit', m.value->>'label'
    into v_emin, v_efee, v_eunit, v_label   -- ★23 v2: +label
    from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
   where (m.value->>'rule_id')::uuid = p_rule_id;
  if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then raise exception 'bad rule'; end if;
  if v_eunit is not null and v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_before := to_jsonb(v_chk);
  update public.checks
     set ext_min = v_emin, ext_fee = v_efee, ext_unit = coalesce(v_eunit, ext_unit), ext_rule_id = p_rule_id   -- ★23 v2: 選択中のパターン
   where id = p_check_id;
  update public.check_lines
     set unit_price_snapshot = v_efee, line_total = v_efee * qty, name_snapshot = '延長料金（' || coalesce(v_label, v_emin || '分') || '）'   -- ★23 v2: パターン名を併記
   where check_id = p_check_id and time_auto and fee_kind = 'extension';
  get diagnostics v_n = row_count;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_set_ext_rule', 'checks:' || p_check_id::text,
    v_before || jsonb_build_object('repriced_blocks', v_n),
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;
revoke execute on function public.check_set_ext_rule(p_check_id uuid, p_rule_id uuid) from public, anon;
grant execute on function public.check_set_ext_rule(p_check_id uuid, p_rule_id uuid) to authenticated;

-- ═══ ★2 段階 2: check_move_seat（fence(p_check_id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_move_seat(p_check_id uuid, p_to_seat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_seat record; v_before jsonb;
  v_org uuid;  -- ★0057(2)
  -- ★0182（裁定427）: 席種が変わる移動の料金
  v_from record; v_st record; v_paid int; v_ext_n int; r_set record; r_vip record; v_sline record; v_delta int := 0;
  v_rate_old int; v_rate_new int; v_pre jsonb; v_g record; v_bx int; v_disc int; v_base int; v_moved boolean := false;
  v_ext_menu jsonb; v_dow2 int; v_bm2 int; v_settings2 jsonb; v_cutoff2 text; v_cut2 int; v_rule_name text; v_vname text; v_vid uuid; v_vunits int;
  v_from_kind text; v_to_kind text; v_snap_before jsonb; v_eline record; v_vip_ext int;
  v_pick jsonb;  -- ★0187（便 EXT）: 再凍結したメニューから今の時刻の行
  v_d2 int; v_blk int; v_keep_len boolean; v_new_rule uuid; v_new_fee int; v_new_min int; v_new_unit text; v_kfee int; v_keu int;  -- ★0242（裁定511-19・514-4）: 下へ移すとき
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_move_seat');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_to_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 移動先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active, s.kind into v_seat  -- ★0182: +kind
    from public.seats s where s.id = p_to_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  if p_to_seat_id = v_chk.seat_id then raise exception 'same seat'; end if;
  -- 占有チェック（ロック下＝コミット済み状態が確定）: 主席 open ∪ 追加席（自伝票の追加席も含めて拒否＝
  -- 主席との入替は「解除→移動」の2手・org 非限定＝物理占有はより厳しく見る）
  if exists (select 1 from public.checks where seat_id = p_to_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_to_seat_id) then
    raise exception 'seat occupied';
  end if;
  select s.kind into v_from from public.seats s where s.id = v_chk.seat_id;  -- ★0182: 移動元の席種
  v_before := to_jsonb(v_chk);
  begin
    update public.checks set seat_id = p_to_seat_id where id = p_check_id;
  exception when unique_violation then
    -- backstop（checks_one_open_per_seat）＝ロック迂回経路が万一あっても二重主席は構造不能
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_move_seat', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);

  -- ═══ ★0182（裁定427・C2-23）: 席種が変わるときの料金 ═══
  --   ⑤ 入金済みの卓は不変（裁定424 と同じ）／同種間＝不変／④ 下位へ＝VIP 料金の行は残す（返金しない）＝サ率だけ移動時点から新しい率。
  --   ③ サ率＝stores.service_rate_by_seat（0175 ★11・seats.kind がキー・小文字も可・無ければ店の率）を移動時点から。移動前に確定した行は旧率のまま
  --      ＝pay_group ごとに「移動時点の母数（割引後・手数料行を除く）」と「その母数×旧率」を checks.service_pre に凍結し、check_group_due が凍結額＋増分×新率で計算する。
  --   ① 上位へ（セット中＝延長行なし）＝通常セット行を VIP セット料金（pricing_resolve_core 'set'・seat_kind VIP・入店時刻で解決）の行に差し替える（置換・qty 据え置き）。
  --   ② 上位へ（延長中）＝入店時のセット行は変えない。移動した延長行（最後の延長行）から VIP 料金＝VIP 用の延長パターン（seat_kind VIP）があればそれ・無ければ 通常延長額＋（VIP セット−通常セット）（Agoora 確定 10/26 ①）。延長パターンも移動時点で再凍結＝以後の延長（check_extension_add）も VIP 額。
  --      VIP チャージ（vip_charge・入店 1 回）がまだ無ければ check_open と同じ形で 1 行（額>0 のみ）。
  v_from_kind := coalesce(v_from.kind, '卓'); v_to_kind := coalesce(v_seat.kind, '卓');
  select count(*) into v_paid from public.payments where check_id = p_check_id;
  if v_from_kind is distinct from v_to_kind and v_paid = 0 then
    select * into v_st from public.stores where id = v_chk.store_id;
    v_rate_old := v_chk.service_rate;
    v_rate_new := coalesce(nullif(trim(v_st.service_rate_by_seat->>v_to_kind), '')::int,
                           nullif(trim(v_st.service_rate_by_seat->>lower(v_to_kind)), '')::int,
                           v_st.service_rate);
    if v_rate_new < 0 or v_rate_new > 100 then v_rate_new := v_st.service_rate; end if;
    -- ③ 旧率の凍結（pay_group ごと・2 回目以降の移動は前回の凍結分に増分だけ足す）
    if v_rate_new is distinct from v_rate_old then
      v_pre := coalesce(v_chk.service_pre, '{}'::jsonb);
      for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id loop
        select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee' and not all_in), 0)::int,   -- ★0210: 込みの行はサ料の母数に入れない（check_group_due と同じ）
               coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int   -- ★0187（便 CASH）: 「合計から」の割引はサ料の母数に入れない
          into v_bx, v_disc
          from public.check_lines where check_id = p_check_id and pay_group = v_g.pay_group;
        if v_g.pay_group = 'A' then
          v_bx := v_bx + coalesce((select sum(r.amount) from public.check_referrals r where r.check_id = p_check_id and r.burden = 'customer'), 0)::int;
        end if;
        v_base := greatest(0, v_bx - v_disc);
        v_pre := v_pre || jsonb_build_object(v_g.pay_group, jsonb_build_object(
          'amount', coalesce((v_pre->v_g.pay_group->>'amount')::int, 0)
                    + round(greatest(0, v_base - coalesce((v_pre->v_g.pay_group->>'base')::int, 0)) * v_rate_old / 100.0)::int,
          'base', v_base));
      end loop;
      update public.checks set service_rate = v_rate_new, service_pre = v_pre where id = p_check_id;
      v_moved := true;
    end if;
    -- ①② 上位へ（VIP）
    if v_to_kind = 'VIP' then
      select * into r_set from public.pricing_resolve_core(v_chk.store_id, v_chk.started_at, 'set', 'VIP', null, v_chk.category_id);
      select count(*) into v_ext_n from public.check_lines where check_id = p_check_id and fee_kind = 'extension';
      if r_set.rule_id is not null and r_set.amount is not null then
        v_delta := case when coalesce(v_chk.first_visit, false) then 0 else greatest(0, r_set.amount - coalesce(v_chk.set_fee, 0)) end;   -- ★0210（相談役 11/25）: 初回の卓は差額を延長に足さない
        if v_ext_n = 0 and not coalesce(v_chk.first_visit, false) then   -- ★0210: 初回の卓はセットを VIP のセットに差し替えない（初回の約束の額を守る）
          select * into v_sline from public.check_lines
           where check_id = p_check_id and time_auto and fee_kind = 'set' and block_no = 0 limit 1;
          if v_sline.id is not null then
            select r.name into v_rule_name from public.pricing_rules r where r.id = r_set.rule_id;
            v_snap_before := to_jsonb(v_sline);
            update public.check_lines
               set unit_price_snapshot = r_set.amount, line_total = r_set.amount * qty,
                   name_snapshot = 'セット料金(' || coalesce(r_set.duration_min, v_chk.set_min) || '分)'
             where id = v_sline.id;
            update public.checks set set_fee = r_set.amount, set_rule_id = r_set.rule_id, set_rule_name = v_rule_name where id = p_check_id;
            perform public.audit_log_write('check_move_seat_set_line', 'check_lines:' || v_sline.id::text, v_snap_before,
              (select to_jsonb(l) from public.check_lines l where l.id = v_sline.id), v_chk.store_id);
            v_moved := true;
          end if;
        end if;
      end if;
      -- ② 延長パターンの再凍結（check_open の ext_menu_snap と鏡像・seat_kind VIP・区分＝伝票の凍結値・時刻＝今）
      select b.biz_dow, b.biz_min into v_dow2, v_bm2 from public.biz_minutes_of(v_chk.store_id, now()) b;
      v_settings2 := coalesce(v_st.settings_json, '{}'::jsonb);
      v_cutoff2 := coalesce(nullif(trim(v_settings2->>'biz_cutoff_hm'), ''), '06:00');
      v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
      -- ★0187（便 EXT）: VIP 用の延長パターンを時間帯を問わず全行（band つき）＝check_open と同じ部品（ext_menu_build・p_vip_only）
      v_ext_menu := public.ext_menu_build(v_chk.store_id, 'VIP', v_chk.category_id, now(), v_chk.ext_min, v_chk.time_per, true);
      v_pick := coalesce(public.ext_menu_pick(v_ext_menu, v_bm2, null, null), v_ext_menu->0);   -- ★0187: 既定＝今の時刻の時間帯に合う行（無ければ先頭＝従来）
      if jsonb_array_length(v_ext_menu) > 0 then
        update public.checks
           set ext_menu_snap = v_ext_menu,
               ext_rule_id = (v_pick->>'rule_id')::uuid,   -- ★0187: 今の時刻の行（従来＝先頭）
               ext_fee = (v_pick->>'amount')::int,
               ext_min = coalesce((v_pick->>'duration_min')::int, ext_min)
         where id = p_check_id;
        v_moved := true;
        v_vip_ext := (v_pick->>'amount')::int;   -- ★0187
      elsif v_delta > 0 then
        v_vip_ext := coalesce(v_chk.ext_fee, 0) + v_delta;
        update public.checks
           set ext_fee = ext_fee + v_delta,
               ext_menu_snap = (select coalesce(jsonb_agg(m.value || jsonb_build_object(
                                  'amount', (m.value->>'amount')::int + v_delta,
                                  'label', '延長 ' || (m.value->>'duration_min') || '分 ¥' || ((m.value->>'amount')::int + v_delta))), '[]'::jsonb)
                                 from jsonb_array_elements(coalesce(ext_menu_snap, '[]'::jsonb)) m)
         where id = p_check_id;
        v_moved := true;
      end if;
      -- ★Agoora 確定 10/26 ①: 延長中の移動＝移動した時点の延長行（最後の延長行）を VIP 額に置き換える（セット行は不変・それより前の延長行も不変）
      if v_ext_n > 0 and v_vip_ext is not null then
        select * into v_eline from public.check_lines
         where check_id = p_check_id and fee_kind = 'extension' order by sort_order desc, created_at desc limit 1;
        if v_eline.id is not null and v_eline.unit_price_snapshot < v_vip_ext then
          v_snap_before := to_jsonb(v_eline);
          update public.check_lines set unit_price_snapshot = v_vip_ext, line_total = v_vip_ext * qty, name_snapshot = name_snapshot || '（VIP）' where id = v_eline.id;
          perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before,
            (select to_jsonb(l) from public.check_lines l where l.id = v_eline.id), v_chk.store_id);
          v_moved := true;
        end if;
      end if;
      -- VIP チャージ（入店 1 回の行）＝無ければ 1 行（check_open と同じ形）
      select * into r_vip from public.pricing_resolve_core(v_chk.store_id, now(), 'vip_charge', 'VIP', null, v_chk.category_id);
      if r_vip.rule_id is not null and r_vip.amount is not null
         and not exists (select 1 from public.check_lines where check_id = p_check_id and fee_kind = 'vip_charge') then
        v_vunits := case when coalesce(r_vip.billing_unit, v_chk.time_per) = 'person' then coalesce(v_chk.people, 1) else 1 end;
        if r_vip.amount * v_vunits > 0 then
          select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, time_auto, fee_kind, block_no)
          values (v_org, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  coalesce(v_vname, 'VIPチャージ'), r_vip.amount, v_vunits, r_vip.amount * v_vunits,
                  null, 2, true, 'vip_charge', 0)
          returning id into v_vid;
          update public.checks set vip_charge_fee = r_vip.amount, vip_charge_unit = coalesce(r_vip.billing_unit, v_chk.time_per) where id = p_check_id;
          perform public.audit_log_write('check_move_seat_vip_line', 'check_lines:' || v_vid::text, null,
            (select to_jsonb(l) from public.check_lines l where l.id = v_vid), v_chk.store_id);
          v_moved := true;
        end if;
      end if;
    end if;
    -- ★0242（裁定511-19・514-4）: VIP から下の席へ（入金の無い卓だけ＝⑤）＝この先の延長と、移した時に進行中の延長の行を、移動先の席種の額にする（上へ移すときの ② の鏡）。
    --   移す前に終わった行（VIP のセット・終わった VIP の延長行・VIP チャージ）は変えない＝④ 返金しない。サ率は上の ③ のとおり移動時点から移動先の率。
    --   移動先の席種の延長パターンを今の時刻で再凍結（check_open と同じ部品 ext_menu_build）。パターンが無ければ店の基本の延長（stores.ext_fee・ext_rule_id は空・メニュー []）。
    --   延長の長さ（ext_min）：自動延長の店で延長に入った後（延長の行がある・セットの時間を過ぎた）は変えない＝ブロックの区切りを動かさない
    --     （区切りが変わると check_time_charge_apply がブロックを数え直し、終わったブロックの行を消す・引き直す）。額は移動先の同じ長さの行・無ければ移動先の今の行の額（1 ブロックの額）。
    --     セットの時間の中（延長の行が無い）と手動の店は移動先の長さにする（前の版と同じ）。延長の単位（ext_unit）は移動先の行に合わせる。
    if v_from_kind = 'VIP' and v_to_kind <> 'VIP' then
      select b.biz_min into v_bm2 from public.biz_minutes_of(v_chk.store_id, now()) b;
      v_d2 := greatest(0, floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int);   -- 経過（完了分）＝check_time_charge_apply と同じ数え方
      select count(*) into v_ext_n from public.check_lines where check_id = p_check_id and fee_kind = 'extension';
      v_keep_len := coalesce(v_st.time_mode, '') = 'auto' and (v_ext_n > 0 or v_d2 >= v_chk.set_min);
      v_ext_menu := public.ext_menu_build(v_chk.store_id, v_to_kind, v_chk.category_id, now(), v_st.ext_min, v_chk.time_per, false);
      if jsonb_array_length(v_ext_menu) > 0 then
        v_pick := coalesce(case when v_keep_len then public.ext_menu_pick(v_ext_menu, v_bm2, null, v_chk.ext_min) end,
                           public.ext_menu_pick(v_ext_menu, v_bm2, null, null), v_ext_menu->0);
        v_new_rule := (v_pick->>'rule_id')::uuid;
        v_new_fee  := (v_pick->>'amount')::int;
        v_new_min  := case when v_keep_len then v_chk.ext_min else coalesce((v_pick->>'duration_min')::int, v_st.ext_min) end;
        v_new_unit := coalesce(v_pick->>'unit', v_chk.time_per);
      else
        v_ext_menu := '[]'::jsonb; v_new_rule := null; v_new_fee := v_st.ext_fee;
        v_new_min  := case when v_keep_len then v_chk.ext_min else v_st.ext_min end;
        v_new_unit := v_chk.time_per;
      end if;
      update public.checks
         set ext_menu_snap = v_ext_menu, ext_rule_id = v_new_rule, ext_fee = v_new_fee, ext_min = v_new_min, ext_unit = v_new_unit
       where id = p_check_id;
      v_moved := true;
      -- 514-4: 移した時に進行中の延長の行も移動先の額（上へ移すときに最後の延長行を VIP 額にする 10/26 ① の鏡）。額 0 なら行を消す（額>0 のみ実体化）。
      if v_ext_n > 0 then
        v_keu := case when v_new_unit = 'person' then coalesce(v_chk.people, 1) else 1 end;
        if coalesce(v_st.time_mode, '') = 'auto' then
          -- 自動延長：今のブロック（check_time_charge_apply と同じ数え方・区切りは上で変えていない）の行だけ。終わったブロックの行は凍結のまま。
          --   額は check_time_charge_apply が進行中のブロックに付ける額と同じ（ブロックの始まりの時刻の時間帯・選んだ行・長さ＝区切り）
          v_blk := case when v_d2 <= v_chk.set_min then 0 else (v_d2 - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
          if v_blk > 0 and v_d2 < v_chk.set_min + v_blk * v_chk.ext_min then
            select * into v_eline from public.check_lines
             where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no = v_blk;
            if v_eline.id is not null then
              v_kfee := coalesce((public.ext_menu_pick(v_ext_menu,
                          (select b.biz_min from public.biz_minutes_of(v_chk.store_id, v_chk.started_at + make_interval(mins => v_chk.set_min + (v_blk - 1) * v_chk.ext_min)) b),
                          v_new_rule, v_new_min)->>'amount')::int, v_new_fee);
              if v_new_fee = 0 then v_kfee := 0; end if;   -- check_time_charge_apply（0242 ★2）と同じ：単価 0 の伝票は 0
              v_snap_before := to_jsonb(v_eline);
              if v_kfee * v_keu > 0 then
                update public.check_lines
                   set unit_price_snapshot = v_kfee, qty = v_keu, line_total = v_kfee * v_keu, name_snapshot = regexp_replace(name_snapshot, '（VIP）$', '')
                 where id = v_eline.id;
                perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before,
                  (select to_jsonb(l) from public.check_lines l where l.id = v_eline.id), v_chk.store_id);
              else
                delete from public.check_lines where id = v_eline.id;
                perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before, null, v_chk.store_id);
              end if;
            end if;
          end if;
        else
          -- 手動の店：最後の延長行（上へ移すときと同じ選び方）を、買った延長の時間の中（入店＋セット＋延長の行の数×長さ が今より後）で、移動先の額より高いときだけ
          select * into v_eline from public.check_lines
           where check_id = p_check_id and fee_kind = 'extension' order by sort_order desc, created_at desc limit 1;
          if v_eline.id is not null and not v_eline.time_auto and v_d2 < v_chk.set_min + v_ext_n * v_chk.ext_min and v_eline.unit_price_snapshot > v_new_fee then
            v_snap_before := to_jsonb(v_eline);
            if v_new_fee > 0 then
              update public.check_lines
                 set unit_price_snapshot = v_new_fee, line_total = v_new_fee * qty, name_snapshot = regexp_replace(name_snapshot, '（VIP）$', '')
               where id = v_eline.id;
              perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before,
                (select to_jsonb(l) from public.check_lines l where l.id = v_eline.id), v_chk.store_id);
            else
              delete from public.check_lines where id = v_eline.id;
              perform public.audit_log_write('check_move_seat_ext_line', 'check_lines:' || v_eline.id::text, v_snap_before, null, v_chk.store_id);
            end if;
          end if;
        end if;
      end if;
    end if;
    if v_moved then
      perform public.check_recalc(p_check_id);
      perform public.audit_log_write('check_move_seat_pricing', 'checks:' || p_check_id::text,
        jsonb_build_object('from_kind', v_from_kind, 'to_kind', v_to_kind, 'service_rate', v_rate_old, 'set_fee', v_chk.set_fee, 'ext_fee', v_chk.ext_fee, 'ext_rule_id', v_chk.ext_rule_id),
        (select jsonb_build_object('service_rate', ch.service_rate, 'service_pre', ch.service_pre, 'set_fee', ch.set_fee, 'set_rule_id', ch.set_rule_id, 'ext_fee', ch.ext_fee, 'ext_rule_id', ch.ext_rule_id, 'total', ch.total,
                                   'ext_min', ch.ext_min, 'ext_unit', ch.ext_unit)   -- ★0242: 下へ移した後の延長の単価の確かめ用
           from public.checks ch where ch.id = p_check_id),
        v_chk.store_id);
    end if;
  end if;
end $function$;
revoke execute on function public.check_move_seat(p_check_id uuid, p_to_seat_id uuid) from public, anon;
grant execute on function public.check_move_seat(p_check_id uuid, p_to_seat_id uuid) to authenticated;

-- ═══ ★2 段階 2: check_add_seat（fence(p_check_id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_add_seat(p_check_id uuid, p_seat_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_seat record; v_actor uuid; v_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_add_seat');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 追加先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  -- 占有チェック（ロック下）: 主席 open（自伝票の主席もここで拒否）∪ 追加席
  if exists (select 1 from public.checks where seat_id = p_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_seat_id) then
    raise exception 'seat occupied';
  end if;
  -- ★0057(4): actor＝operator 優先
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  begin
    insert into public.check_seats (org_id, store_id, check_id, seat_id, created_by)
    values (v_chk.org_id, v_chk.store_id, p_check_id, p_seat_id, v_actor)
    returning id into v_id;
  exception when unique_violation then
    -- backstop（check_seats_seat_occupancy）
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_add_seat', 'check_seats:' || v_id::text, null,
    (select to_jsonb(cs) from public.check_seats cs where cs.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_add_seat(p_check_id uuid, p_seat_id uuid) from public, anon;
grant execute on function public.check_add_seat(p_check_id uuid, p_seat_id uuid) to authenticated;

-- ═══ ★2 段階 2: check_remove_seat（fence(p_check_id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_remove_seat(p_check_id uuid, p_seat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_row record;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_remove_seat');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_seat_id = v_chk.seat_id then raise exception 'home seat'; end if;
  select * into v_row from public.check_seats
    where check_id = p_check_id and seat_id = p_seat_id;
  if v_row.id is null then raise exception 'not found'; end if;
  delete from public.check_seats where id = v_row.id;
  perform public.audit_log_write('check_remove_seat', 'check_seats:' || v_row.id::text,
    to_jsonb(v_row), null, v_chk.store_id);
end $function$;
revoke execute on function public.check_remove_seat(p_check_id uuid, p_seat_id uuid) from public, anon;
grant execute on function public.check_remove_seat(p_check_id uuid, p_seat_id uuid) to authenticated;

-- ═══ ★2 段階 2: check_line_set_group（fence(v_chk.id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_line_set_group(p_line_id uuid, p_group text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_paycnt int; v_before jsonb; v_org uuid;
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_line_set_group');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_group is null or p_group !~ '^[A-F]$' then raise exception 'bad group'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(v_chk.id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 時間自動行は A 固定（apply の upsert 構造と衝突するため移動不可）
  if v_line.time_auto then raise exception 'time line'; end if;

  v_before := to_jsonb(v_line);
  update public.check_lines set pay_group = p_group where id = p_line_id;
  perform public.check_recalc(v_line.check_id);
  perform public.audit_log_write('check_line_set_group', 'check_lines:' || p_line_id::text,
    v_before, (select to_jsonb(l) from public.check_lines l where l.id = p_line_id),
    v_chk.store_id);
end $function$;
revoke execute on function public.check_line_set_group(p_line_id uuid, p_group text) from public, anon;
grant execute on function public.check_line_set_group(p_line_id uuid, p_group text) to authenticated;

-- ═══ ★2 段階 2: check_set_nominations（fence(p_check_id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
  v_kind text; v_dohan boolean; v_auto boolean; v_summary text;  -- ★0119 裁定100
  -- ★0124 裁定111
  v_prev jsonb; v_old jsonb; v_old_kind text; v_old_dohan boolean;
  v_old_prev text; v_old_chg timestamptz;  -- ★0169（裁定341）: 場内→本指名の切替記録（旧行から引継ぎ）
  v_ended boolean; v_ended_at timestamptz;
  v_active_cnt int := 0; v_sumw_active numeric := 0;
  v_paycnt int; v_dohan_fee int; v_seat_kind text;
  v_fee_kind text; v_name text; v_price int; r_fee record;
  v_sort int; v_lid uuid; v_dcnt int; v_oldqty int; v_qty int;
  v_line_changed boolean := false; v_derived jsonb := '[]'::jsonb;
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_set_nominations');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight, 'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  -- ★0124 判断A'/C: 旧名簿を cast 別に退避(キー欠落=既存値保持・ended_at 引継ぎ・遷移検知の基準)
  select coalesce(jsonb_object_agg(cast_id::text, jsonb_build_object(
           'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at,
           'created_at', created_at)), '{}'::jsonb)  -- ★0169: 旧行の切替記録も退避・★5 0175（便 S 起票）: 着席の時刻（created_at）も退避
    into v_prev
    from public.check_nominations where check_id = p_check_id;

  select count(*) into v_paycnt from public.payments where check_id = p_check_id;  -- ★0124: 派生時のみの保守側ガード用
  select st.dohan_auto_hon, st.dohan_fee into v_auto, v_dohan_fee
    from public.stores st where st.id = v_chk.store_id;  -- ★0119/★0124
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;  -- ★0124 判断C: check_shimei_add と同型の席種解決

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 0 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;  -- ★0123 裁定110: 0 を許可(小数は拒否)

    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    if exists (select 1 from public.check_nominations where check_id = p_check_id and cast_id = v_cast_id) then
      raise exception 'dup cast';  -- 名簿は 1伝票×1キャスト 1行(種別・同伴・ended は行の属性)
    end if;

    v_old := v_prev -> v_cast_id::text;  -- null=新規 cast
    v_old_kind  := coalesce(v_old ->> 'nom_kind', 'free');
    v_old_dohan := coalesce((v_old ->> 'is_dohan')::boolean, false);
    v_old_prev := v_old ->> 'prev_kind'; v_old_chg := (v_old ->> 'kind_changed_at')::timestamptz;  -- ★0169

    -- ★0124 判断A'/C: キー欠落=既存値保持(新規 cast は free/false)。kiosk の free 落ち既存バグ是正
    if v_elem ? 'nom_kind' then
      v_kind := v_elem ->> 'nom_kind';
      if v_kind is null or v_kind not in ('hon','jonai','free') then raise exception 'bad nom_kind'; end if;
    else
      v_kind := v_old_kind;
    end if;
    if v_elem ? 'is_dohan' then
      if jsonb_typeof(v_elem -> 'is_dohan') <> 'boolean' then raise exception 'bad is_dohan'; end if;
      v_dohan := (v_elem ->> 'is_dohan')::boolean;
    else
      v_dohan := v_old_dohan;
    end if;
    if coalesce(v_auto, false) and v_dohan and v_kind = 'free' then v_kind := 'hon'; end if; -- 同伴時の本指名自動付与(jonai 明示は昇格しない)

    -- ★0124 判断A': ended キー欠落=既存値保持・true=旧値引継ぎ(なければ now())・false=解除
    if v_elem ? 'ended' then
      if jsonb_typeof(v_elem -> 'ended') <> 'boolean' then raise exception 'bad ended'; end if;
      v_ended := (v_elem ->> 'ended')::boolean;
      if v_ended then
        v_ended_at := coalesce((v_old ->> 'ended_at')::timestamptz, now());
      else
        v_ended_at := null;
      end if;
    else
      v_ended_at := (v_old ->> 'ended_at')::timestamptz;
    end if;
    if v_ended_at is null then
      v_active_cnt := v_active_cnt + 1;
      v_sumw_active := v_sumw_active + v_w;
    end if;

    -- ★0121 裁定107: 種別と weight(金額按分)は独立(裁定105)
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan, ended_at, prev_kind, kind_changed_at, created_at)  -- ★0169・★5 0175: +created_at
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos, v_kind, v_dohan, v_ended_at,
            case when v_old_kind = 'jonai' and v_kind = 'hon' then 'jonai' else v_old_prev end,   -- ★0169（裁定341）: 場内→本指名の切替＝旧区分と時刻を記録（他の遷移は引継ぎ）
            case when v_old_kind = 'jonai' and v_kind = 'hon' then now() else v_old_chg end,
            coalesce((v_old ->> 'created_at')::timestamptz, now()));   -- ★5 0175（便 S 起票）: 全置換でも着席ログの時刻＝旧行の created_at を引き継ぐ（新規 cast は now()）
    v_pos := v_pos + 1;

    -- ★0124 判断C: 種別の遷移ベース派生(reconcile なし=明細側で取消した行は復活しない=裁定111-4)
    if v_kind is distinct from v_old_kind then
      if v_old_kind in ('hon','jonai') then
        if v_paycnt > 0 then raise exception 'has payments'; end if;
        delete from public.check_lines
         where check_id = p_check_id and cast_id = v_cast_id
           and fee_kind = case v_old_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
        if found then
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'remove', 'cast_id', v_cast_id,
            'fee_kind', case v_old_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end);
        end if;
      end if;
      if v_kind in ('hon','jonai') then
        v_fee_kind := case v_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
        if not exists (select 1 from public.check_lines
                        where check_id = p_check_id and cast_id = v_cast_id and fee_kind = v_fee_kind) then  -- 既存あれば追加しない(裁定111-1)
          if v_paycnt > 0 then raise exception 'has payments'; end if;
          -- 価格解決=check_shimei_add と同一(live・started_at 凍結軸・現在席・rank)
          select * into r_fee from public.pricing_resolve_core(
            v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
          if r_fee.amount is not null then
            v_price := r_fee.amount;
          else
            select case when v_kind = 'hon' then st.hon_fee else st.jonai_fee end
              into v_price from public.stores st where st.id = v_chk.store_id;
          end if;
          v_name := case v_kind when 'hon' then '本指名料' else '場内指名料' end;
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, fee_kind, cast_id)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, v_cast_id)
          returning id into v_lid;
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'add', 'cast_id', v_cast_id,
            'fee_kind', v_fee_kind, 'line_id', v_lid);
        end if;
      end if;
    end if;

    -- ★0124 判断C/H: 同伴の遷移ベース派生(裁定111-2)。dohan_count=行内人数ステッパー(既定1)
    v_qty := null;
    if v_elem ? 'dohan_count' then
      if jsonb_typeof(v_elem -> 'dohan_count') <> 'number' then raise exception 'bad count'; end if;
      if (v_elem ->> 'dohan_count')::numeric <> trunc((v_elem ->> 'dohan_count')::numeric)
         or (v_elem ->> 'dohan_count')::numeric <= 0 then raise exception 'bad count'; end if;
      v_qty := (v_elem ->> 'dohan_count')::numeric::int;
    end if;
    if v_dohan and not v_old_dohan then
      if not exists (select 1 from public.check_lines
                      where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan') then
        if v_paycnt > 0 then raise exception 'has payments'; end if;
        v_price := coalesce(v_chk.dohan_fee, v_dohan_fee);  -- check_dohan_add と同一(snap 優先)
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '同伴料', v_price, coalesce(v_qty, 1), v_price * coalesce(v_qty, 1), null, v_sort, 'dohan', v_cast_id)
        returning id into v_lid;
        v_line_changed := true;
        v_derived := v_derived || jsonb_build_object('op', 'add', 'cast_id', v_cast_id,
          'fee_kind', 'dohan', 'line_id', v_lid, 'qty', coalesce(v_qty, 1));
      end if;
    elsif (not v_dohan) and v_old_dohan then
      if v_paycnt > 0 then raise exception 'has payments'; end if;
      delete from public.check_lines
       where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
      if found then
        v_line_changed := true;
        v_derived := v_derived || jsonb_build_object('op', 'remove', 'cast_id', v_cast_id, 'fee_kind', 'dohan');
      end if;
    elsif v_dohan and v_old_dohan and v_qty is not null then
      select count(*) into v_dcnt from public.check_lines
       where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
      if v_dcnt = 1 then  -- ★判断H: ちょうど1本のときのみ qty 同期(取消済み・複数行は no-op)
        select id, qty into v_lid, v_oldqty from public.check_lines
         where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
        if v_oldqty <> v_qty then
          if v_paycnt > 0 then raise exception 'has payments'; end if;
          update public.check_lines set qty = v_qty, line_total = unit_price_snapshot * v_qty where id = v_lid;
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'qty', 'cast_id', v_cast_id,
            'fee_kind', 'dohan', 'line_id', v_lid, 'qty', v_qty);
        end if;
      end if;
    end if;
  end loop;

  -- ★0124 判断B: active(ended 除く)行が有るのに按分合計 0 は拒否(裁定110 の趣旨を active に対して維持)。全員 ended=許可(按分なし)
  if v_active_cnt > 0 and v_sumw_active = 0 then raise exception 'bad weight'; end if;

  if v_line_changed then perform public.check_recalc(p_check_id); end if;  -- ★0124: 派生で明細が動いたときのみ

  v_summary := public.nom_type_summary(p_check_id);  -- ★0119: checks.nom_type は派生サマリ(正本は名簿行)
  update public.checks set nom_type = v_summary where id = p_check_id;

  v_after := jsonb_build_object('nom_type', v_summary, 'nominations', p_nominations, 'derived', v_derived,
    'kind_switch', (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at) order by position), '[]'::jsonb)
                      from public.check_nominations where check_id = p_check_id and kind_changed_at is not null));  -- ★0169: 監査 after に切替記録（場内→本指名）
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;
revoke execute on function public.check_set_nominations(p_check_id uuid, p_nominations jsonb) from public, anon;
grant execute on function public.check_set_nominations(p_check_id uuid, p_nominations jsonb) to authenticated;

-- ═══ ★2 段階 2: check_dohan_add（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_dohan_add(p_check_id uuid, p_cast_id uuid, p_count integer DEFAULT 1, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid; v_sort int; v_paycnt int; v_price int;
  v_org uuid; v_cast record; v_dup uuid;  -- ★0119 裁定100/102
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_dohan_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
  if p_cast_id is null then raise exception 'cast required'; end if;  -- ★0119 裁定100 A-5: 同伴料は cast 必須
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  -- ★0119 裁定102: 同キー再送は既存行を返す
  if p_idem_key is not null then
    select id into v_dup from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- キャスト検証（同 org・同店・在籍）＝check_shimei_add と同型
  select c.id, c.store_id, c.is_active into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  select coalesce(v_chk.dohan_fee, st.dohan_fee) into v_price
    from public.stores st where st.id = v_chk.store_id;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          '同伴料', v_price, p_count, v_price * p_count, null, v_sort, 'dohan', p_cast_id, p_idem_key)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_dohan_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_dohan_add(p_check_id uuid, p_cast_id uuid, p_count integer, p_idem_key uuid) from public, anon;
grant execute on function public.check_dohan_add(p_check_id uuid, p_cast_id uuid, p_count integer, p_idem_key uuid) to authenticated;

-- ═══ ★2 段階 2: check_shimei_add（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_cast record; v_id uuid; v_sort int; v_paycnt int;
  v_seat_kind text; v_fee_kind text; v_name text; v_price int;
  v_org uuid; r_fee record; v_dup uuid;  -- ★0119 裁定102
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_shimei_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_kind is null or p_kind not in ('hon','jonai') then raise exception 'bad kind'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  -- ★0119 裁定102: 同キー再送（連打・リトライ）は既存行を返す＝行は指名事実1回の記録（unique は張らない）
  if p_idem_key is not null then
    select id into v_dup from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  -- キャスト検証（同 org・伝票の店と同店・在籍）★A1: is_active は CC 照合対象
  select c.id, c.store_id, c.rank_id, c.is_active into v_cast
    from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;

  -- 席種＝伝票の現在席（席移動後はその席の料率＝運用整合）・時間軸＝started_at（凍結）
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
  v_fee_kind := case p_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
  select * into r_fee from public.pricing_resolve_core(
    v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
  if r_fee.amount is not null then
    v_price := r_fee.amount;
  else
    select case when p_kind = 'hon' then st.hon_fee else st.jonai_fee end
      into v_price from public.stores st where st.id = v_chk.store_id;
  end if;
  v_name := case p_kind when 'hon' then '本指名料' else '場内指名料' end;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, p_cast_id, p_idem_key)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  -- audit: 行 jsonb（name_snapshot は料金名・cast は id のみ＝PII なし既存流儀）
  perform public.audit_log_write('check_shimei_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text, p_idem_key uuid) from public, anon;
grant execute on function public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text, p_idem_key uuid) to authenticated;

-- ═══ ★2 段階 2: check_customer_remove（fence(p_check_id)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_customer_remove(p_check_id uuid, p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_org uuid := public.auth_org_id(); v_row public.check_customers; v_lines int; v_first uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_customer_remove');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_check_id is null or p_customer_id is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select * into v_row from public.check_customers where check_id = p_check_id and customer_id = p_customer_id;
  if v_row.id is null then raise exception 'not on check'; end if;
  -- 305-3: その顧客が注文者の行は null に戻す（拒否しない）
  update public.check_lines set customer_id = null where check_id = p_check_id and customer_id = p_customer_id;
  get diagnostics v_lines = row_count;
  delete from public.check_customers where id = v_row.id;
  -- position 詰め直し（unique(check_id, position) を避けるため 2 段＝一旦 +1000 して並べ直す）
  update public.check_customers c set position = c.position + 1000 where c.check_id = p_check_id;   -- position は予約語（POSITION()）＝式では別名で参照する
  update public.check_customers c
     set position = r.rn - 1
    from (select x.id, row_number() over (order by x.position) rn from public.check_customers x where x.check_id = p_check_id) r
   where c.id = r.id;
  -- 305-3: position 0 が繰り上がったら checks.customer_id も追従（誰もいなければ null）
  select f0.customer_id into v_first from public.check_customers f0 where f0.check_id = p_check_id and f0.position = 0;
  update public.checks set customer_id = v_first where id = p_check_id and customer_id is distinct from v_first;
  perform public.audit_log_write('check_customer_remove', 'check_customers:' || v_row.id::text, to_jsonb(v_row),
    jsonb_build_object('lines_cleared', v_lines, 'new_first_customer', v_first), v_chk.store_id);
end $function$;
revoke execute on function public.check_customer_remove(p_check_id uuid, p_customer_id uuid) from public, anon;
grant execute on function public.check_customer_remove(p_check_id uuid, p_customer_id uuid) to authenticated;

-- ═══ ★2 段階 2: bottle_keep_register（fence(line)・gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text, p_bottle_name text DEFAULT NULL::text, p_check_line_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text, p_tag_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
  v_line      record;  -- ★16 0153: 購入行（p_check_line_id）
  v_tag       text;    -- ★22 0175 v2（裁定419）: タグ名（空＝「{顧客名} {ボトル名}」を自動生成）
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_status is null or p_status not in ('active','pending') then raise exception 'bad status'; end if;   -- ★5 0173（裁定392）

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  perform public.assert_on_duty('bottle_keep_register');   -- ★0200（裁定472）: 出勤中だけ（店長以上は免除）
  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and (p_check_line_id is null or public.auth_cast_check_allowed((select l.check_id from public.check_lines l where l.id = p_check_line_id and l.org_id = v_org)))   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ（購入行のある登録だけ＝伝票の無い登録は卓が無い）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  -- ★mig0094: 追加3列の入力検証（CHECK と同値・エラー文言を関数側で統一）
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;

  -- ★16 0153（305-6）: ボトル名（≤60・空→null）
  if p_bottle_name is not null and length(p_bottle_name) > 60 then raise exception 'bad bottle_name'; end if;
  -- ★16 0153: 購入行との紐づけ＝同店・同商品の行で、その行の伝票に紐づく顧客に限る（'bad line'／'not on check'）→ 行の注文者を持ち主にする（要裁定 (2)）
  if p_check_line_id is not null then
    select l.id, l.check_id, l.store_id, l.product_id into v_line from public.check_lines l where l.id = p_check_line_id and l.org_id = v_org;
    if v_line.id is null or v_line.store_id <> p_store_id or v_line.product_id is distinct from p_product_id then raise exception 'bad line'; end if;
    if not exists (select 1 from public.check_customers cc where cc.check_id = v_line.check_id and cc.customer_id = p_customer_id) then raise exception 'not on check'; end if;
    update public.check_lines set customer_id = p_customer_id where id = p_check_line_id;
  end if;
  -- ★22 0175 v2（裁定419）: タグ名＝入力（≤60）か既定「{顧客名} {ボトル名}」（ボトル名は p_bottle_name→商品名）
  if p_tag_label is not null and length(p_tag_label) > 60 then raise exception 'bad tag_label'; end if;
  v_tag := nullif(trim(coalesce(p_tag_label, '')), '');
  if v_tag is null then
    select left(cu.name || ' ' || coalesce(nullif(trim(coalesce(p_bottle_name, '')), ''), v_prod.name), 60) into v_tag from public.customers cu where cu.id = p_customer_id;
  end if;
  -- ★5 0173（裁定392）: status＝p_status（'active'／'pending'）
  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no, bottle_name, check_line_id, tag_label)   -- ★16: 末尾 ')' → ', bottle_name)'（0158 ★7: +check_line_id）
  values (v_org, p_store_id, p_customer_id, p_product_id, p_status, now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no, nullif(trim(coalesce(p_bottle_name, '')), ''), p_check_line_id, v_tag)   -- ★16（0158 ★7: 購入行との紐づけ＝裁定314）
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text, p_remaining_pct integer, p_expires_on date, p_shelf_no text, p_bottle_name text, p_check_line_id uuid, p_status text, p_tag_label text) from public, anon;
grant execute on function public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text, p_remaining_pct integer, p_expires_on date, p_shelf_no text, p_bottle_name text, p_check_line_id uuid, p_status text, p_tag_label text) to authenticated;

-- ═══ ★2 段階 2: print_enqueue（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.print_enqueue(p_check_id uuid, p_pay_group text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_chk    record;
  v_cfg    public.printer_config;
  v_exists public.print_jobs;
  v_actor  uuid;
  v_reprint boolean;
  v_token  text;
  v_id     uuid;
  v_org    uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  -- check_close 4枝の逐語（live 0039 改修後の姿）
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（print_enqueue 足す＝確定②）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'closed' then raise exception 'not closed'; end if;
  if p_pay_group is null or not exists (
    select 1 from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group
  ) then raise exception 'bad pay_group'; end if;

  select c.* into v_cfg from public.printer_config c where c.store_id = v_chk.store_id;
  if not found or not v_cfg.printer_enabled then raise exception 'printer disabled'; end if;

  -- 二度押しガード: 既存 queued/printing はそのまま返す（二重印刷封じ）
  select j.* into v_exists from public.print_jobs j
   where j.check_id = p_check_id and j.pay_group = p_pay_group
     and j.status in ('queued','printing')
   order by j.created_at limit 1;
  if found then
    return jsonb_build_object('job_id', v_exists.id,
                              'is_reprint', v_exists.is_reprint,
                              'already_queued', true);
  end if;

  -- 再発行判定（failed/canceled は除外＝刷り直しに「再発行」を出さない）
  v_reprint := exists (
    select 1 from public.print_jobs j
     where j.check_id = p_check_id and j.pay_group = p_pay_group
       and j.status in ('printed','queued','printing')
  );

  -- ★0057(4): actor＝operator 優先
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  v_token := encode(gen_random_bytes(12), 'hex');  -- 24hex（unique が物理 backstop）

  insert into public.print_jobs
    (org_id, store_id, check_id, pay_group, status, is_reprint, print_token, created_by)
  values
    (v_chk.org_id, v_chk.store_id, p_check_id, p_pay_group, 'queued', v_reprint, v_token, v_actor)
  returning id into v_id;

  perform public.audit_log_write('print_enqueue', 'print_jobs:' || v_id::text,
    null,
    jsonb_build_object('check_id', p_check_id, 'pay_group', p_pay_group,
                       'is_reprint', v_reprint),
    v_chk.store_id);

  return jsonb_build_object('job_id', v_id, 'is_reprint', v_reprint, 'already_queued', false);
end $function$;
revoke execute on function public.print_enqueue(p_check_id uuid, p_pay_group text) from public, anon;
grant execute on function public.print_enqueue(p_check_id uuid, p_pay_group text) to authenticated;

-- ═══ ★2 段階 2: check_referral_set（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_referral_set(p_check_id uuid, p_referrer_id uuid, p_method text, p_value integer, p_burden text, p_idem_key uuid DEFAULT NULL::uuid, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid;   -- ★6
  v_org uuid;  -- ★0057(2)
  v_ref record; v_dup uuid;   -- ★6
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_referral_set');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_method is null or p_method not in ('set_rate','account_rate','fixed_per_person','fixed_per_group') then raise exception 'bad method'; end if;   -- ★6 CHECK 4 値逐語
  if p_value is null or p_value < 0 or (p_method in ('set_rate','account_rate') and p_value > 10000) then raise exception 'bad value'; end if;         -- ★6 rate＝bp（0〜10000）・fixed＝円
  if p_burden is null or p_burden not in ('customer','store') then raise exception 'bad burden'; end if;                                             -- ★6 CHECK 2 値逐語
  if p_memo is not null and length(p_memo) > 200 then raise exception 'bad memo'; end if;                                                            -- ★6
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  -- ★6 冪等（0148 ★5＝裁定102 の形）: 同キー再送は既存行を返す
  if p_idem_key is not null then
    select id into v_dup from public.check_referrals where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if exists (select 1 from public.check_referrals where check_id = p_check_id) then raise exception 'exists'; end if;   -- ★6（298-3）: 1 伝票 1 紹介＝付け替えは remove→set
  -- ★6 紹介者（自店・在籍）＝check_add_referral の cast 検証と同型
  select r.id, r.store_id, r.is_active into v_ref from public.referrers r where r.id = p_referrer_id and r.org_id = v_org;
  if v_ref.id is null or v_ref.store_id <> v_chk.store_id then raise exception 'bad referrer'; end if;
  if not v_ref.is_active then raise exception 'inactive referrer'; end if;
  if p_method = 'fixed_per_person' and v_chk.people is null then raise exception 'no people'; end if;   -- ★6（裁定299-1）: 人数を先に入れさせる（recalc 側は coalesce(people,1) で止めない）

  insert into public.check_referrals (org_id, store_id, check_id, referrer_id, method, value, burden, amount, memo, idem_key, created_by)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_referrer_id, p_method, p_value, p_burden, 0, nullif(trim(p_memo), ''), p_idem_key,
          coalesce(public.auth_kiosk_operator(), (select id from public.users where auth_user_id = auth.uid() and is_active)))   -- ★6 actor＝audit_log_write と同順
  returning id into v_id;
  perform public.referral_recalc(p_check_id);   -- ★6（298-1）: amount の現在値
  perform public.check_recalc(p_check_id);      -- ★6（298-9）: burden='customer' なら total が動く
  perform public.audit_log_write('check_referral_set', 'check_referrals:' || v_id::text, null,
    (select to_jsonb(r) from public.check_referrals r where r.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_referral_set(p_check_id uuid, p_referrer_id uuid, p_method text, p_value integer, p_burden text, p_idem_key uuid, p_memo text) from public, anon;
grant execute on function public.check_referral_set(p_check_id uuid, p_referrer_id uuid, p_method text, p_value integer, p_burden text, p_idem_key uuid, p_memo text) to authenticated;

-- ═══ ★2 段階 2: check_referral_remove（gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_referral_remove(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record; v_chk record; v_paycnt int;   -- ★7 v_line→v_row
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_referral_remove');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_row from public.check_referrals where check_id = p_check_id;                                    -- ★7 行＝伝票の紹介（1 伝票 1 紹介）
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_row.check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  perform public.assert_cast_register_level2();   -- ★0231（相談役 11/27 12:10）: 段階 2（会計まで）の操作＝「注文のみ」（段階 1）の cast は 'forbidden'（check_close・check_pay・receipt_issue と同じ判定を内部の関数 1 本に・cast 以外と店の端末の腕には効かない）
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  if v_row.frozen_at is not null then raise exception 'frozen'; end if;   -- ★7: 会計確定後は外せない
  delete from public.check_referrals where id = v_row.id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_referral_remove', 'check_referrals:' || v_row.id::text,
    to_jsonb(v_row), null, v_chk.store_id);
end $function$;
revoke execute on function public.check_referral_remove(p_check_id uuid) from public, anon;
grant execute on function public.check_referral_remove(p_check_id uuid) to authenticated;

-- ═══ ★3 中で分ける: check_add_line（split(product only)・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_add_line');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if p_product_id is null then perform public.assert_cast_register_level2(); end if;   -- ★0231（相談役 11/27 12:10）: 「注文のみ」（段階 1）の cast は商品を指定する形だけ＝額を送る形（set／time／charge／custom・カスタム明細・手数料）は段階 2
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    -- ★mig0070: back_exempt を凍結（経路の分岐もマスタ現価でなく伝票の凍結値で決める）
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt,
                                 'back_exempt', coalesce(v_prod.back_exempt_from_split, false));
  else
    if p_kind is null or p_kind not in ('set','time','charge','custom') then raise exception 'bad kind'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'bad price'; end if;
    v_kind := p_kind;
    v_name := trim(p_name);
    v_price := p_unit_price;
    v_back := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_product_id, v_kind, v_grp,
          v_name, v_price, p_qty, v_price * p_qty, v_back, v_sort)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_line', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_add_line(p_check_id uuid, p_product_id uuid, p_qty integer, p_kind text, p_pay_group text, p_name text, p_unit_price integer) from public, anon;
grant execute on function public.check_add_line(p_check_id uuid, p_product_id uuid, p_qty integer, p_kind text, p_pay_group text, p_name text, p_unit_price integer) to authenticated;

-- ═══ ★3 中で分ける: check_open（split(server default category・no rule)・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid, p_set_rule_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
  v_units int;  -- ★0089
  v_dow2 smallint; v_bm2 int; v_cut2 int; v_settings2 jsonb; v_cutoff2 text; v_seatk text;  -- ★mig0098
  v_ext_menu jsonb;  -- ★mig0098 R2-1: 延長メニュー凍結
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 税設定の凍結
  v_cat_name text;  -- ★mig0128(裁定116-2): 区分名の凍結用
  v_rule_name text;  -- ★mig0129(裁定119): 適用ルール名の凍結用
  r_vip record; v_vfee int; v_vunit text; v_vname text; v_vunits int; v_vid uuid;  -- ★mig0130(裁定118): vip_charge
  v_sunit text; v_eunit text;  -- ★mig0130: set/ext の実効課金単位(rule.billing_unit ?? time_per)
  -- ★0201d（裁定478）: 開卓の門の営業日
  v_bizd date;
  v_fv boolean := false; v_pmode text; v_tend text;   -- ★0210（起票140）: 初回・額の持ち方（base／all_in）・時間の終わり方（extend／end／unlimited）
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_open');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.service_rate_by_seat,   -- ★1 0181（CANON ②）: 卓種別のサービス率（0175 ★11 の列・{"VIP": 35} の形＝seats.kind がキー）
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee,
         st.business_tax_status, st.price_display, st.tax_rounding  -- ★mig0113
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id() and public.auth_cast_check_allowed(null)   -- ★0200（裁定473）: 会計できる卓＝own の店では cast は開卓不可（開卓時は指名が無い）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- ★0231（相談役 11/27 12:10・12:35 の 2）: 「注文のみ」（段階 1）の cast の開卓は、料金区分とルールを本人の指定から受けない（区分・ルールの指定は段階 2）。
  --   区分はサーバが、レジの画面が初めに選ぶ区分と同じ物を選ぶ（register-board の defaultOpenCategoryOf＝register_open_categories の並び（sort・name）で初回料金でない有効な区分の先頭・無ければ区分なし）。ルールは自動（優先順位）。
  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then
    p_set_rule_id := null;
    p_category_id := (select pc.id from public.pricing_categories pc
                       where pc.org_id = v_org and pc.store_id = v_seat.store_id and pc.is_active and not coalesce(pc.first_visit, false)
                       order by pc.sort, pc.name limit 1);
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★0201d（裁定478）: 定休日・臨時休業の営業日は新しく開卓できない（既存の open の再利用は上で返す＝門は新しく開くときだけ）。
  --   臨時休業（store_special_days.kind closed）＝'closed day'・定休日で臨時営業の登録が無い＝'needs special open'（店長以上は register_special_open で登録して開き直す・キャストとスタッフは止まる＝役割に依らず同じ例外・出し分けは client）
  v_bizd := public.biz_date_of(v_seat.store_id, now());
  if public.shift_is_closed_day(v_seat.store_id, v_bizd) then
    if exists (select 1 from public.store_special_days sd where sd.store_id = v_seat.store_id and sd.day = v_bizd and sd.kind = 'closed') then
      raise exception 'closed day';
    end if;
    raise exception 'needs special open';
  end if;

  -- ★mig0128(裁定116-2): 区分検証(同 org・同店・active のみ)。null=全区分=現行同値。
  --   配置は既存 open 再利用の後=区分は「新規開栓の凍結時」にのみ意味を持つ
  --   (再利用返却の冪等挙動は不変)。名称も同時取得=checks へ凍結(マスタ改名は非遡及)
  if p_category_id is not null then
    select pc.name into v_cat_name
      from public.pricing_categories pc
     where pc.id = p_category_id
       and pc.org_id = v_org
       and pc.store_id = v_seat.store_id
       and pc.is_active;
    if v_cat_name is null then raise exception 'bad category'; end if;
  end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  --   ★mig0128: 区分を3呼びすべてへ引渡し(裁定116-2・区分も開栓凍結=裁定117)
  --   ★mig0130(裁定118): 4呼び目=vip_charge(VIP 限定は seat_kind 条件で表現=特殊分岐なし)
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',        v_seat.kind, null, p_category_id);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension',  v_seat.kind, null, p_category_id);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',      v_seat.kind, null, p_category_id);
  select * into r_vip from public.pricing_resolve_core(v_seat.store_id, now(), 'vip_charge', v_seat.kind, null, p_category_id);  -- ★mig0130

  -- ★mig0098 R2-5: 開卓時ルール手動選択（override）。null=自動一致（現行完全互換）。
  --   検証: 同店・fee_kind='set'・is_active（他店/他種/無効は 'bad rule'）。選び直し不可＝
  --   開卓やり直し（void→再開卓）の現行運用（設計書 R2-5）
  --   ★mig0128: override は明示選択につき区分フィルタ不適用（区分違いのルールも指名可）
  --   ★mig0130: billing_unit も指名ルールから取得(select へ追加)
  if p_set_rule_id is not null then
    select r.amount as amount, r.duration_min as duration_min, r.id as rule_id,
           r.billing_unit as billing_unit into r_set
      from public.pricing_rules r
     where r.id = p_set_rule_id and r.store_id = v_seat.store_id
       and r.fee_kind = 'set' and r.is_active;
    if r_set.rule_id is null then raise exception 'bad rule'; end if;
  end if;

  -- ★mig0129(裁定119): 適用セットルールの凍結。r_set.rule_id は自動解決 or override 確定値。
  --   name null ルールは null 凍結(UI 非表示規則)・フォールバック(rule_id null)は両列 null
  --   =0129 以前の既存伝票と同表現(区別しない・「基本料金」誤表示経路を作らない)
  if r_set.rule_id is not null then
    select r.name into v_rule_name
      from public.pricing_rules r
     where r.id = r_set.rule_id;
  end if;

  -- ★0210（起票140・相談役 11/25）: 初回料金＝初回の区分（pricing_categories.first_visit）のセットの行が持つ 2 つの選択を開卓で凍結（非遡及）。
  --   区分が初回なら first_visit。セットの行（自動 or 手で選んだ行）が有効な初回の区分の行なら price_mode／time_end を写す（それ以外＝base／extend＝今と同じ）
  if p_category_id is not null then
    select coalesce(pc.first_visit, false) into v_fv from public.pricing_categories pc where pc.id = p_category_id;
  end if;
  if r_set.rule_id is not null then
    select r.price_mode, r.time_end into v_pmode, v_tend
      from public.pricing_rules r join public.pricing_categories pc on pc.id = r.category_id
     where r.id = r_set.rule_id and r.fee_kind = 'set' and pc.first_visit and pc.is_active;
    if found then v_fv := true; end if;
  end if;
  v_fv := coalesce(v_fv, false); v_pmode := coalesce(v_pmode, 'base'); v_tend := coalesce(v_tend, 'extend');

  -- ★mig0098 R2-1/R2-2/R2-4: 延長メニュー全件を開栓時に凍結（priority 順・limit なし）。
  --   ★鏡像規律: 下の where は pricing_resolve_core（extension・rank null 呼び）と同一式。
  --     core は limit 1・こちらは全件列挙という差のみ。条件を変えるときは必ず同時改修
  --     （core 側は pin 保全のため不触＝相互参照は本コメントと R2 設計書 v1.1 が正）
  --   ★mig0128(教訓52): 区分条件・区分優先順を core と同時挿入(鏡像2点セット)。
  --     以後 resolve 条件を変えるときは core+本 where の同時改修が必須
  --   ★mig0130: 各項目へ unit キー(実効単位=rule.billing_unit ?? time_per)を凍結追加
  select b.biz_dow, b.biz_min into v_dow2, v_bm2
    from public.biz_minutes_of(v_seat.store_id, now()) b;
  select s.settings_json into v_settings2 from public.stores s where s.id = v_seat.store_id;
  v_cutoff2 := coalesce(nullif(trim(coalesce(v_settings2, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
  v_seatk := coalesce(v_seat.kind, '卓');
  -- ★0187（便 EXT・Agoora 確定 10/27（2））: 凍結メニュー＝その営業日の曜日・席種の延長パターンを時間帯を問わず全行（band つき）＝ext_menu_build（check_move_seat と同じ部品）。
  --   開卓時の既定（ext_fee／ext_min／ext_rule_id＝r_ext）は従来どおり今の時刻で解決＝開卓後に店の設定を変えてもこの卓の料金は動かない（凍結）
  v_ext_menu := public.ext_menu_build(v_seat.store_id, v_seatk, p_category_id, now(), v_seat.ext_min, v_seat.time_per, false);

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  --   ★mig0113: 税設定3値を同スナップへ追補（非遡及＝open 中伝票は旧税設定）
  --   ★mig0128: 区分2値（category_id/category_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0129: 適用ルール2値（set_rule_id/set_rule_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0130: 単位系4値（set_unit/ext_unit/vip_charge_fee/vip_charge_unit）を同スナップへ追補
  --     (実効単位=rule.billing_unit ?? time_per・vip はルール0件=両値 null=dohan_fee 同型)
  v_rate := v_seat.service_rate;
  -- ★1 0181（裁定418 ②・便 ON-2・2026-10-26）: 卓種別のサービス率＝stores.service_rate_by_seat（jsonb・キーは seats.kind そのまま／小文字も可）があればそれを凍結（無ければ店の率＝従来）
  if v_seat.service_rate_by_seat is not null and jsonb_typeof(v_seat.service_rate_by_seat) = 'object' then
    v_rate := coalesce(nullif(trim(v_seat.service_rate_by_seat->>v_seat.kind), '')::int,
                       nullif(trim(v_seat.service_rate_by_seat->>lower(v_seat.kind)), '')::int,
                       v_seat.service_rate);
    if v_rate < 0 or v_rate > 100 then v_rate := v_seat.service_rate; end if;
  end if;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  v_bts  := v_seat.business_tax_status;  -- ★mig0113
  v_pd   := v_seat.price_display;        -- ★mig0113
  v_trnd := v_seat.tax_rounding;         -- ★mig0113
  v_sunit := coalesce(r_set.billing_unit, v_tper);  -- ★mig0130
  v_eunit := coalesce(r_ext.billing_unit, v_tper);  -- ★mig0130
  v_vfee  := r_vip.amount;  -- ★mig0130: 0行=null(dohan 同型)
  v_vunit := case when r_vip.rule_id is not null
                  then coalesce(r_vip.billing_unit, v_tper) end;  -- ★mig0130
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0113: 防御深度（列 CHECK が正・型変更/削除事故の検知用）
  if v_bts not in ('taxable','exempt') or v_pd not in ('tax_included','tax_excluded')
     or v_trnd not in ('floor','round','ceil') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0130: 防御深度(単位2値)
  if v_sunit not in ('person','table') or v_eunit not in ('person','table') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id, ext_menu_snap, opened_by_membership,   -- ★3 0173（裁定389）: 操作者の membership（cast 含む・kiosk は null）
                             ext_rule_id,   -- ★23 0175 v2（裁定408 系）: 開卓時の既定パターン（凍結メニューの既定＝r_ext.rule_id・無ければ null）
                             business_tax_status, price_display, tax_rounding,  -- ★mig0113
                             category_id, category_name,  -- ★mig0128
                             set_rule_id, set_rule_name,  -- ★mig0129
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit,  -- ★mig0130
                             first_visit, set_price_mode, time_end)  -- ★0210
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu, public.auth_membership_id(),   -- ★3 0173
          r_ext.rule_id,   -- ★23 v2
          v_bts, v_pd, v_trnd,  -- ★mig0113
          p_category_id, v_cat_name,  -- ★mig0128
          r_set.rule_id, v_rule_name,  -- ★mig0129
          v_sunit, v_eunit, v_vfee, v_vunit,  -- ★mig0130
          v_fv, v_pmode, v_tend)  -- ★0210
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  -- ★10 0153（裁定305-1）: 開栓時の顧客＝check_customers の position 0（checks.customer_id と併存＝同値）
  if p_customer_id is not null then
    insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
    values (v_org, v_seat.store_id, v_id, p_customer_id, 0, v_actor);
  end if;
  -- ★mig0089: 開卓時に set 行を自動挿入（両モード共通・額>0 のみ＝時間課金を使わない
  --   店は現行同値）。auto 店は以後 check_time_charge_apply が同行を upsert 再計算。
  --   ★mig0130: units は set 実効単位(v_sunit)起点(既存店=billing_unit null→time_per=現行同値)
  v_units := case when v_sunit = 'person' then coalesce(p_people, 1) else 1 end;
  if v_sfee * v_units > 0 then
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no, all_in)   -- ★0210: +all_in
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            case when v_pmode = 'all_in' then '初回料金(' || v_smin || '分) 税・サ込' else 'セット料金(' || v_smin || '分)' end, v_sfee, v_units, v_sfee * v_units,   -- ★0210: 行の名前（相談役 11/25）
            null, 1, true, 'set', 0, v_pmode = 'all_in');  -- ★mig0098 R2-7c: null 再生産の停止（0097b 吸収の本命側）
    perform public.check_recalc(v_id);
    -- ★_r2: 行単位 audit（原則6）。manual 店は apply が来ない＝ここが唯一の書込記録
    perform public.audit_log_write('check_open_set_line',
      'check_lines:' || (select l.id::text from public.check_lines l
                          where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      null,
      (select to_jsonb(l) from public.check_lines l
        where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      v_seat.store_id);
  end if;
  -- ★mig0130(裁定118): vip_charge 行の開栓時1回生成(額>0 のみ実体化・apply 非対象=裁定7)。
  --   kind='charge'・time_auto=true・block_no=0(0097b 教訓: null block_no の再生産禁止・
  --   部分ユニーク3列 (check_id,fee_kind,block_no) where time_auto と整合)・
  --   名称=coalesce(ルール名,'VIPチャージ')。back_snapshot=null=給与不干渉
  if r_vip.rule_id is not null then
    v_vunits := case when v_vunit = 'person' then coalesce(p_people, 1) else 1 end;
    if v_vfee * v_vunits > 0 then
      select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
      insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                      name_snapshot, unit_price_snapshot, qty, line_total,
                                      back_snapshot, sort_order, time_auto, fee_kind, block_no)
      values (v_org, v_seat.store_id, v_id, null, 'charge', 'A',
              coalesce(v_vname, 'VIPチャージ'), v_vfee, v_vunits, v_vfee * v_vunits,
              null, 2, true, 'vip_charge', 0)
      returning id into v_vid;
      perform public.check_recalc(v_id);
      -- 行単位 audit(原則6・set 行と同型=apply が来ない行につき唯一の書込記録)
      perform public.audit_log_write('check_open_vip_line',
        'check_lines:' || v_vid::text, null,
        (select to_jsonb(l) from public.check_lines l where l.id = v_vid),
        v_seat.store_id);
    end if;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id)
      || case when p_set_rule_id is not null
              then jsonb_build_object('override_rule_id', p_set_rule_id)
              else '{}'::jsonb end,
    v_seat.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_open(p_seat_id uuid, p_people integer, p_nom_type text, p_customer_id uuid, p_set_rule_id uuid, p_category_id uuid) from public, anon;
grant execute on function public.check_open(p_seat_id uuid, p_people integer, p_nom_type text, p_customer_id uuid, p_set_rule_id uuid, p_category_id uuid) to authenticated;

-- ═══ ★4 自分の卓の柵: check_customer_add（fence(p_check_id)・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_customer_add(p_check_id uuid, p_customer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_org uuid := public.auth_org_id(); v_pos int; v_id uuid; v_actor uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_customer_add');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_check_id is null or p_customer_id is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 顧客は同 org・同店（check_open の 'invalid customer' と同型）
  if not exists (select 1 from public.customers cu where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = v_chk.store_id) then
    raise exception 'invalid customer';
  end if;
  if exists (select 1 from public.check_customers where check_id = p_check_id and customer_id = p_customer_id) then raise exception 'exists'; end if;
  select coalesce(max(cc.position), -1) + 1 into v_pos from public.check_customers cc where cc.check_id = p_check_id;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
  values (v_org, v_chk.store_id, p_check_id, p_customer_id, v_pos, v_actor)
  returning id into v_id;
  -- 305-1: 最初の顧客＝checks.customer_id（併存・同値）
  if v_pos = 0 and v_chk.customer_id is null then
    update public.checks set customer_id = p_customer_id where id = p_check_id;
  end if;
  perform public.audit_log_write('check_customer_add', 'check_customers:' || v_id::text, null,
    (select to_jsonb(c) from public.check_customers c where c.id = v_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.check_customer_add(p_check_id uuid, p_customer_id uuid) from public, anon;
grant execute on function public.check_customer_add(p_check_id uuid, p_customer_id uuid) to authenticated;

-- ═══ ★4 自分の卓の柵: check_line_set_customer（fence(v_chk.id)・keep gate・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.check_line_set_customer(p_line_id uuid, p_customer_id uuid, p_keep boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_org uuid := public.auth_org_id();
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_line_set_customer');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_line_id is null then raise exception 'forbidden'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(v_chk.id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  -- ★0231（相談役 11/27 12:35 の 1・13:20 の 3）: ボトルのキープは段階 2＝「注文のみ」の cast は、キープの無い行にお客様を付けるだけ（p_keep false）。
  --   p_keep true（会計前のキープを作る・付け替える＝中の bottle_keep_register）と、キープの付いた行のお客様の付け替え・外し（p_keep false ではキープが前のお客様に残る）は丸ごと断る＝お客様だけ・キープだけが残る半分の道を作らない
  if (coalesce(p_keep, false) and p_customer_id is not null) or exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id) then perform public.assert_cast_register_level2(); end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_customer_id is not null and not exists (select 1 from public.check_customers where check_id = v_chk.id and customer_id = p_customer_id) then
    raise exception 'not on check';
  end if;
  update public.check_lines set customer_id = p_customer_id where id = p_line_id;
  -- ★5 0173（裁定392）: キープはレジで押した時点で顧客のキープ一覧に出る（status 'pending'＝会計前）。外す（customer null）と pending 行は消える。
  --   会計（check_close）で active・伝票取消（check_void）で削除。既に active の行がある購入行には作らない。
  if p_customer_id is null then
    delete from public.bottle_keeps where check_line_id = p_line_id and status = 'pending';
  elsif coalesce(p_keep, false) then
    if exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id and b.status = 'pending') then
      -- ★0227（#210）: 持ち主を付け替えたら、タグ名が前のお客様の既定（bottle_keep_register と同じ式＝left(顧客名 || ' ' || coalesce(ボトル名, 商品名), 60)）のままなら
      --   新しいお客様の既定に作り直す。手で付けたタグ名（既定と違う）は残す。式の中の b.customer_id は付け替える前の値（UPDATE の SET は前の行を読む）
      update public.bottle_keeps b set customer_id = p_customer_id, updated_at = now(),
        tag_label = coalesce((select left(nc.name || ' ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), pr.name), 60)
                                from public.customers oc, public.customers nc, public.products pr
                               where oc.id = b.customer_id and nc.id = p_customer_id and pr.id = b.product_id
                                 and b.tag_label = left(oc.name || ' ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), pr.name), 60)), b.tag_label)
       where b.check_line_id = p_line_id and b.status = 'pending';
    elsif not exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id) then
      if v_line.product_id is null then raise exception 'bad line'; end if;
      perform public.bottle_keep_register(p_store_id => v_chk.store_id, p_customer_id => p_customer_id, p_product_id => v_line.product_id,
                                          p_check_line_id => p_line_id, p_status => 'pending');
    end if;
  end if;
  perform public.audit_log_write('check_line_set_customer', 'check_lines:' || p_line_id::text,
    jsonb_build_object('customer_id', v_line.customer_id), jsonb_build_object('customer_id', p_customer_id), v_chk.store_id);
end $function$;
revoke execute on function public.check_line_set_customer(p_line_id uuid, p_customer_id uuid, p_keep boolean) from public, anon;
grant execute on function public.check_line_set_customer(p_line_id uuid, p_customer_id uuid, p_keep boolean) to authenticated;

-- ═══ ★4 自分の卓の柵: bottle_keep_out（fence(p_check_id)・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.bottle_keep_out(p_keep_id uuid, p_check_id uuid, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_keep record; v_pname text; v_id uuid; v_sort int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_keep_id is null or p_check_id is null or p_idem_key is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0231（相談役 11/27 12:10）: 自分の卓だけの店（cast_register_scope='own'）の柵＝check_add_line と同じ
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（305-7）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーの行があればその id を返す（check_lines.idem_key＝0119 の器）
  select id into v_id from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select b.*, p.name as product_name into v_keep from public.bottle_keeps b join public.products p on p.id = b.product_id
   where b.id = p_keep_id and b.org_id = v_org;
  if v_keep.id is null or v_keep.store_id <> v_chk.store_id then raise exception 'forbidden'; end if;
  if v_keep.status <> 'active' then raise exception 'keep not active'; end if;
  v_pname := coalesce(v_keep.bottle_name, v_keep.product_name);
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  -- kind 'keep_out'・qty 1・unit_price 0・line_total 0・back_snapshot null（バック 0）・product_id null（在庫は販売時に減算済み＝トリガ非発火）・印字名「キープ出し」
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order, customer_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'keep_out', 'A',
          'キープ出し ' || v_pname, 0, 1, 0, null, v_sort, v_keep.customer_id, p_idem_key)
  returning id into v_id;
  update public.bottle_keeps set last_used_at = now(), updated_at = now() where id = p_keep_id;   -- 305-5
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('bottle_keep_out', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id) || jsonb_build_object('keep_id', p_keep_id), v_chk.store_id);
  return v_id;
end $function$;
revoke execute on function public.bottle_keep_out(p_keep_id uuid, p_check_id uuid, p_idem_key uuid) from public, anon;
grant execute on function public.bottle_keep_out(p_keep_id uuid, p_check_id uuid, p_idem_key uuid) to authenticated;

-- ═══ ★5 裁定513-1: auth_cast_close_ok（513-1・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.auth_cast_close_ok(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ★0201e ★3（裁定481）: キャストの締め＝自店 ∧ 締めの許可（memberships.cast_can_close）∧ レジの許可 ∧ 出勤中
  select coalesce(p_store_id = public.auth_store_id()
    and exists (select 1 from public.memberships m where m.id = public.auth_membership_id() and m.is_active and m.role = 'cast' and m.cast_can_close)
    and public.auth_cast_register_active()
    and public.auth_cast_register_level() >= 2, false)   -- ★0231（裁定513-1）: 日報の締めはキャストのレジの段階 2（会計まで）以上だけ＝「注文のみ」の子は締めの許可があっても締められない
$function$;
revoke execute on function public.auth_cast_close_ok(p_store_id uuid) from public, anon;
grant execute on function public.auth_cast_close_ok(p_store_id uuid) to authenticated;

-- ═══ ★6 #44: kiosk_person_claim（stage>=1・head comment・同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.kiosk_person_claim(p_device_auth_user uuid, p_device_fp text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0196（裁定448 B 方式）: 端末の解除（kiosk_login／kiosk_unlock＝PIN）の後に route が呼ぶ＝その操作担当の本人 auth セッションを作ってよいかを判定し印を付ける。
--   service_role だけ（route が端末セッションで auth.uid を読んで p_device_auth_user に渡す）。束縛済みの端末だけ（未束縛＝'not bound'・fp 不一致＝'device bound'）。
--   役割＝manager／staff＋cast（★0199 裁定466＝can_register ∧ 店のレジ使用 ≥2＝会計まで・★0231 で ≥1＝注文のみから・帯のナビは client で /register だけ）。owner／admin＝管理者は通常ログイン。無操作＝店設定 kiosk_person_idle_minutes（M-49・既定 10）を戻りに。audit は service（actor＝本人）。
declare
  v_device record; v_s record; v_mem record; v_idle int;
begin
  if p_device_auth_user is null then raise exception 'forbidden'; end if;
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = p_device_auth_user and k.is_active;
  if v_device.id is null then raise exception 'forbidden'; end if;
  if v_device.device_fp is null then raise exception 'not bound'; end if;
  if p_device_fp is null or p_device_fp <> v_device.device_fp then raise exception 'device bound'; end if;
  select s.* into v_s from public.kiosk_sessions s
   where s.device_id = v_device.id and s.ended_at is null
     and s.last_seen_at > now() - make_interval(secs => coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900))
   order by s.started_at desc limit 1;
  if v_s.id is null then raise exception 'no session'; end if;
  select m.id, m.role, m.user_id, u.auth_user_id, m.can_register into v_mem from public.memberships m join public.users u on u.id = m.user_id   -- ★0199（裁定466）: can_register も読む
   where m.id = v_s.membership_id and m.is_active and u.is_active;
  if v_mem.id is null or v_mem.auth_user_id is null then raise exception 'forbidden'; end if;
  if not (v_mem.role in ('manager','staff')
          or (v_mem.role = 'cast' and coalesce(v_mem.can_register, false)
              and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = v_device.store_id), 0) >= 1)) then
    raise exception 'forbidden';   -- ★0199（裁定466）: 管理者は通常ログイン・cast は can_register ∧ 店のレジ使用（★0231 で ≥2 → ≥1）だけ本人セッション可
  end if;
  -- ★0231（裁定511-11・食い違い #44）: 「注文のみ」（段階 1）のキャストも端末の本人セッションを作れる（前は ≥2＝会計まで だけ）。操作端末の既定は「店端末のみ」＝前は注文のみの子がどこからもレジを使えなかった。
  --   段階 1 で通る物は相談役 11/27 12:10 の線引き（商品の注文・既定の開卓・お客様の付け・キープ出し・読むだけ・時間の反映）。段階 2 の操作は同じ 0231 で assert_cast_register_level2 が断る（会計・入金・領収書は前から）。
  --   kiosk_login／kiosk_unlock／kiosk_unlock_people は前から段階 ≥1 の cast を通す（0196 M-93）＝PIN の段とこの判定がそろう。
  v_idle := greatest(1, least(120, coalesce((select (st.settings_json->>'kiosk_person_idle_minutes')::int from public.stores st where st.id = v_device.store_id), 10)));
  update public.kiosk_sessions set person_auth_session = true, person_role = v_mem.role, last_seen_at = now() where id = v_s.id;
  perform public.audit_log_write_service(v_device.org_id, v_mem.user_id, 'kiosk_person_claim', 'kiosk_sessions:' || v_s.id::text, null,
    jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_mem.id, 'role', v_mem.role, 'idle_minutes', v_idle), v_device.store_id, 'kiosk');
  return jsonb_build_object('ok', true, 'session_id', v_s.id, 'auth_user_id', v_mem.auth_user_id, 'membership_id', v_mem.id, 'role', v_mem.role,
                            'store_id', v_device.store_id, 'org_id', v_device.org_id, 'device_id', v_device.id, 'idle_minutes', v_idle);
end $function$;
revoke execute on function public.kiosk_person_claim(p_device_auth_user uuid, p_device_fp text) from public, anon, authenticated;
grant execute on function public.kiosk_person_claim(p_device_auth_user uuid, p_device_fp text) to service_role;

commit;
