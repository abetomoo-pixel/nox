-- 0247_kiosk_arm_cast_level（相談役 11/27 18:05 の 3・Agoora の決め＝この文が貼られたこと・211 を含む・起草と試走まで・適用はしない）
--   決め：段階 1（注文のみ）のキャストは、店の端末に本人として入っても注文のみ。裁定516 の線を、入口が店の端末のときにもそろえる。
--   当たり：段階 2 未満の拒否（0231 の assert_cast_register_level2・check_open の中の分け・check_pay・check_close）は「auth の cast」にだけ効く。店の端末の腕（auth_role() が空・端末の店 ∧ 操作担当あり）は
--     操作中の人の役と段階を見ない。kiosk_login（0201r）は「レジか締めの許可 ∧ 店のレジ使用 ≥1」の cast も操作担当に通す＝段階 1 の cast が操作中の端末から、会計・席の移動・印刷などが関数としては通る。
--   中身：
--     ★1 新しい内部の関数 auth_cast_order_only()＝「いま操作しているのは段階 2 未満のキャストか」（本人のログインの cast／店の端末の腕で操作中の人が cast）。4 ロール revoke・grant なし。
--     ★2 assert_cast_register_level2（0231）の判定を ★1 に＝それを呼ぶ 18 か所（段階 2 を求める 16 本＋check_add_line の額を送る形＋check_line_set_customer のキープ）に一度に効く。STABLE を外す（★1 が auth_kiosk_operator を呼ぶ）。
--     ★3 check_open（0231 の後）の「段階 1 は区分とルールを指定から受けない」の条件を ★1 に。
--     ★4 check_pay（本番の今＝0234）・★5 check_close（0243（e）の後）の「注文のみの cast は不可」の 1 行を ★1 に。
--     どの関数も、変えるのは判定の 1 行だけ（金額の計算・按分・監査・署名・ACL は 1 字も変えない）。print_enqueue・ほかの 15 本は作り直さない（assert の中身が変わるだけ）。
--   変えないもの：表・列・索引・ポリシー・ほかの関数。操作中の人が店長・スタッフのとき、だれも操作していない端末、owner・manager・staff のログインの動き。
--   前提（当てる位置）：0231（assert・check_open）と 0243（e）（check_close）が当たった後。数は順の最後（0221 の後）で数えた＝関数 541 → 542・表 137・ポリシー 156。
--   翻訳元と前の md5（CR を除いた md5(prosrc)）：assert 1f8d52ec0d05859eb1430228ee11d865（0231 の後）・check_open 8b8f4b6c63ad3fb58c754a6903885655（0231 の後）・check_pay bb627cffdec2018406e760e289a0c8ee（本番の今）・check_close bc7c3c3ef8986b265dc3227d259038d9（0243（e）の後）。
--   当てた後の md5：auth_cast_order_only 692b008cb690b046461639da319d2872・assert 712ac074f7cff05c3a42eaa6a8610dd6・check_open 857d925df71447cb6a6b0651a57a031c・check_pay b5724328ce3b4d3bf8335918fb718dba・check_close d1d099b339b0e03ba0b6b33bbba6717e。
--   事前確認：docs/tmp/kiosk_arm_level_1127/0247_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/kiosk_arm_level_1127/0247_verify.sql。生成器 docs/tmp/kiosk_arm_level_1127/gen-0247.mjs。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 auth_cast_order_only（新しい内部の関数） ═══
CREATE FUNCTION public.auth_cast_order_only()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0247（相談役 11/27 18:05・Agoora の決め）: 内部専用（public・anon・authenticated・service_role を revoke・grant なし）。「いま操作しているのは、段階 2（会計まで）未満のキャストか」。
--   ① 本人のログイン（端末の本人セッションを含む）＝auth の cast で、店のレジ使用の段階が 2 未満（0231 までの判定と同じ）。
--   ② 店の端末の腕（auth_role() が空・端末の店あり）＝操作中の人（auth_kiosk_operator）がその店の有効な cast で、店のレジ使用の段階（settings_json.sys_cast_register）が 2 未満。
--   操作中の人が店長・スタッフのとき、だれも操作していないとき、owner・manager・staff のログインは false＝今までどおり（だれも操作していない端末は、各関数の役の柵が前から断る）。
--   段階 2 を求める関数（assert_cast_register_level2 を呼ぶ 16 本＋中で分ける 2 本・check_open・check_pay・check_close）がこの 1 つを見る＝入口が本人のログインでも店の端末でも同じ線（裁定516）。
--   原則 8：auth_* を自ら読む＝冒頭の null guard。VOLATILE（既定）＝auth_kiosk_operator が最後の操作の時刻を進めるため。
declare
  v_store uuid;
  v_op    uuid;
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() = 'cast' then return public.auth_cast_register_level() < 2; end if;
  if public.auth_role() is not null then return false; end if;
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null then return false; end if;
  v_op := public.auth_kiosk_operator();
  if v_op is null then return false; end if;
  return exists (select 1 from public.memberships m where m.user_id = v_op and m.store_id = v_store and m.is_active and m.role = 'cast')
     and coalesce((select (s.settings_json->>'sys_cast_register')::int from public.stores s where s.id = v_store), 0) < 2;
end $function$;
revoke execute on function public.auth_cast_order_only() from public, anon, authenticated, service_role;

-- ═══ ★2 assert_cast_register_level2（作り直し・判定を ★1 に・STABLE を外す） ═══
CREATE OR REPLACE FUNCTION public.assert_cast_register_level2()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0231（相談役 11/27 12:10・#158・#170）: 内部専用（public・anon・authenticated・service_role を revoke・grant なし）。
--   check_close・check_pay・receipt_issue と同じ判定（auth の cast で店のレジ使用の段階が 2＝会計まで 未満なら 'forbidden'）を 1 本に。段階 2 の操作の RPC が役の柵の直後に perform する。
--   cast 以外（owner／manager／staff）・店の端末の腕（auth_role() が null）には効かない＝今までどおり。
--   原則 8：auth_* を自ら読む＝冒頭の null guard（呼び元と同じく auth の会社か店の端末のどちらかが要る）。
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then raise exception 'forbidden'; end if;
  if public.auth_cast_order_only() then raise exception 'forbidden'; end if;   -- ★0247（相談役 11/27 18:05・Agoora の決め）: 判定を auth_cast_order_only に（本人のログインの cast に加えて、店の端末の腕で操作中の人が cast のときも段階 2 未満なら断る）。前＝auth の cast のときだけ見ていた
end $function$;
revoke execute on function public.assert_cast_register_level2() from public, anon, authenticated, service_role;

-- ═══ ★3 check_open（作り直し・0231 の後の本文・判定の 1 行） ═══
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
  if public.auth_cast_order_only() then   -- ★0247（相談役 11/27 18:05・Agoora の決め）: 店の端末の腕で操作中の人が段階 2 未満の cast のときも、区分とルールを指定から受けない（前＝auth の cast だけ）
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

-- ═══ ★4 check_pay（作り直し・本番の今の本文・判定の 1 行） ═══
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text, p_fee_key text DEFAULT NULL::text, p_fee_rate numeric DEFAULT NULL::numeric, p_fee_on boolean DEFAULT true, p_fee_amount integer DEFAULT NULL::integer, p_disc_rate numeric DEFAULT NULL::numeric, p_disc_amount integer DEFAULT NULL::integer)
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
  v_fkey text; v_rate numeric := 0; v_fee int := 0; v_fee_eff int := 0; v_due2 int; v_sort int; v_fid uuid; v_settings jsonb;  -- ★6 0173（裁定393）・★1 0175: v_rate は numeric（小数 1 桁）
  v_store_rate numeric := 0; v_override boolean := false;  -- ★1 0175（裁定393 追補2）: 店設定の率・店設定と異なる率／OFF
  v_dkey text; v_drate numeric := 0; v_disc int := 0; v_did uuid;
  v_dbase text := 'total'; v_dnet int := 0; v_dman boolean := false;  -- ★0187（便 CASH）: 割引の基準（total＝合計から・subtotal＝小計から）・小計・指定額  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（393 の裏返し＝別キー pay_discount_rates）
  v_fee_source text := 'auto';  -- ★21 0175 v2（裁定393 追補4）: auto（店の率）／none／manual（この入金だけの額）
  v_mem uuid;  -- ★3 0173（裁定389）: 操作者の membership
  v_aeff int := 0;  -- ★0210（起票140）: 税・サ込みの額（割引を引いた後）＝支払方法の割引の母数から除く
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_pay');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
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

  -- ★0234（#173・入金の二度押し）: 伝票の行を押さえてから残額を見る＝同じ伝票への入金は 1 本ずつ（後の 1 本は前の入金を数えてから残額を見る・同じ冪等キーの再送は前の id を返す）
  select * into v_chk from public.checks where id = p_check_id for update;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  if public.auth_cast_order_only() then raise exception 'forbidden'; end if;   -- ★0247（相談役 11/27 18:05・Agoora の決め）: 店の端末の腕で操作中の人が段階 2 未満の cast のときも入金不可（前＝auth の cast だけ）   -- ★25 0175 v2（裁定420）: 「注文のみ」の cast は入金不可
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
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（例 現金計 10% OFF）＝店設定 pay_discount_rates の率>0 なら、この方法で払う残額に対する割引行を立てて due を下げる（p_fee_on=false は割引も止める＝「上乗せ／割引を適用しない」）
  if p_fee_on then
    v_dkey := case when p_method = 'cash' then 'cash' when p_method = 'card' then 'card' when p_method = 'other' then coalesce(p_fee_key, 'other') else null end;
    if v_dkey is not null then
      if v_settings is null then select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id; end if;
      v_drate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_discount_rates'->>v_dkey, '')::numeric, 0);
      -- ★0187（便 CASH・Agoora 確定 10/27＋補遺）: 入金ごとの割引の上書き＝率を指定（p_disc_rate）／額を指定（p_disc_amount・0＝なし）＝M-6 のカード手数料と同じ形
      if p_disc_rate is not null and (p_disc_rate < 0 or p_disc_rate > 100) then raise exception 'bad disc_rate'; end if;
      if p_disc_amount is not null and (p_disc_amount < 0 or p_disc_amount > v_due - v_paid) then raise exception 'bad disc_amount'; end if;
      if p_disc_rate is not null then v_drate := p_disc_rate; end if;
      v_dbase := case when coalesce(v_settings, '{}'::jsonb)->>'pay_discount_base' = 'subtotal' then 'subtotal' else 'total' end;   -- ★0187: 既定＝合計から（T15 の回答待ちの仮置き）
      if p_disc_amount is not null then
        v_dman := true; v_disc := p_disc_amount;   -- 額を指定（0＝なし）
      elsif v_drate > 0 then
        if v_dbase = 'subtotal' then
          -- 小計から＝税・サの前の小計（未入金分の比で按分）× 率＝割引行はサ・税の前に効く（従来の行の扱い）
          select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee' and not all_in), 0)::int   -- ★0210: 込みの行は小計からの割引の母数に入れない
               - coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int
            into v_dnet from public.check_lines where check_id = p_check_id and pay_group = v_grp;
          v_disc := round(greatest(0, v_dnet)::numeric * (v_due - v_paid) / greatest(v_due, 1) * v_drate / 100.0)::int;
        else
          -- 合計から＝税・サ込みの残額 × 率＝最後に引く（check_group_due が丸めた合計から引いてから店の丸め規則でもう一度丸める＝事後承認 ②）
          -- ★0210（相談役 11/25）: 支払方法の割引は込みの額に掛けない＝込みの額（割引を引いた後）を除いた分の比で残額に掛ける。込みの行が無い伝票は今と同じ式
          select greatest(0, coalesce(sum(line_total) filter (where kind <> 'discount' and all_in), 0)::int
                 - greatest(0, coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int
                             - coalesce(sum(line_total) filter (where kind <> 'discount' and not all_in), 0)::int
                             - case when v_grp = 'A' then coalesce((select sum(r.amount) from public.check_referrals r where r.check_id = p_check_id and r.burden = 'customer'), 0)::int else 0 end))
            into v_aeff from public.check_lines where check_id = p_check_id and pay_group = v_grp;
          if v_aeff > 0 then
            v_disc := round(greatest(0, v_due - v_aeff)::numeric * (v_due - v_paid) / greatest(v_due, 1) * v_drate / 100.0)::int;
          else
            v_disc := round((v_due - v_paid) * v_drate / 100.0)::int;
          end if;
        end if;
      end if;
      if v_disc > 0 then
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'discount', v_grp,
                  (case v_dkey when 'cash' then '現金割引' when 'card' then 'カード割引' when 'emoney' then '電子マネー割引' else '決済割引' end)
                  || case when v_dman then '（指定）' else ' ' || rtrim(rtrim(to_char(v_drate, 'FM990.0'), '0'), '.') || '%' end
                  || case when v_dbase = 'subtotal' then '（小計から）' else '' end,
                  v_disc, 1, v_disc, null, v_sort, false, case when v_dbase = 'subtotal' then 'pay_discount' else 'pay_discount_total' end, 'taxable_10', case when v_dman then null else v_drate end)
          returning id into v_did;
          perform public.check_recalc(p_check_id);
          v_due := public.check_group_due(p_check_id, v_grp);
      end if;
    end if;
  end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  -- ★6 0173（裁定393）: 支払方法別の手数料＝店設定 pay_fee_rates（card／emoney／other・cash／ar は対象外・欠損＝0）。
  --   手数料＝round(p_amount×率/100)（1 円未満四捨五入・併用時はその方法で入金する分だけ）→ 伝票行（kind 'charge'・fee_kind 'pay_fee'・同じ pay_group・内税対象）
  --   → check_recalc → 受取額（payments.amount）＝p_amount＋due の増分（丸め単位に従う）。キャスト売上（cast_sales_aggregate）は除外・日報は pay_fee_total。
  if p_method in ('card','other') then
    v_fkey := coalesce(p_fee_key, case when p_method = 'card' then 'card' else 'other' end);
    if v_fkey not in ('card','emoney','other') then raise exception 'bad fee_key'; end if;
    if (p_method = 'card') <> (v_fkey = 'card') then raise exception 'bad fee_key'; end if;
    select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id;
    v_store_rate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_fee_rates'->>v_fkey, '')::numeric, 0);
    -- ★1 0175（裁定393 追補2）: 入金モーダルの「手数料を上乗せ ON／OFF」と率（0〜100・小数 1 桁）。null＝店設定。OFF／0% なら手数料行なし。店設定と異なる率／OFF は audit（操作者付き）
    if p_fee_on is null then raise exception 'bad fee_on'; end if;
    if p_fee_rate is not null and (p_fee_rate < 0 or p_fee_rate > 100 or p_fee_rate <> round(p_fee_rate, 1)) then raise exception 'bad fee_rate'; end if;
    v_rate := case when not p_fee_on then 0 else coalesce(p_fee_rate, v_store_rate) end;
    -- ★21 0175 v2（裁定393 追補4）: 入金ごとの上書き＝p_fee_amount（null＝自動／0＝なし／正＝指定額・残額まで）。p_fee_on=false は 0 と同じ
    if p_fee_amount is not null and (p_fee_amount < 0 or p_fee_amount > v_due - v_paid) then raise exception 'bad fee_amount'; end if;
    -- ★24 0175 v2（裁定421 候補）: 手数料の「なし／指定」＝cast は不可・staff は sys_staff_discount=1 かつ カット額（店の率の手数料 − 指定額）が staff_discount_cap 以内
    if p_fee_amount is not null and public.auth_role() = 'cast' then raise exception 'forbidden'; end if;
    if p_fee_amount is not null and public.auth_role() = 'staff' then
      if coalesce((coalesce(v_settings, '{}'::jsonb)->>'sys_staff_discount')::int, 0) <> 1 then raise exception 'forbidden'; end if;
      if round(p_amount * v_store_rate / 100.0)::int - p_fee_amount > coalesce((coalesce(v_settings, '{}'::jsonb)->>'staff_discount_cap')::int, 0) then raise exception 'over cap'; end if;
    end if;
    v_fee_source := case when (p_fee_amount is not null and p_fee_amount = 0) or not p_fee_on then 'none'
                         when p_fee_amount is not null then 'manual' else 'auto' end;
    if v_fee_source <> 'auto' then v_rate := 0; end if;
    v_override := (not p_fee_on and v_store_rate > 0) or (p_fee_rate is not null and p_fee_rate <> v_store_rate)
                  or v_fee_source = 'manual' or (v_fee_source = 'none' and p_fee_amount is not null and v_store_rate > 0);
    if v_rate > 0 or v_fee_source = 'manual' then
      v_fee := case when v_fee_source = 'manual' then p_fee_amount else round(p_amount * v_rate / 100.0)::int end;
      if v_fee > 0 then
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)   -- ★1 0175: +fee_rate（適用率の記録）
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', v_grp,
                (case v_fkey when 'card' then 'カード手数料 ' when 'emoney' then '電子マネー手数料 ' else '決済手数料 ' end) || (case when v_fee_source = 'manual' then '（指定）' else rtrim(rtrim(to_char(v_rate, 'FM990.0'), '0'), '.') || '%' end),   -- ★1 0175: 小数 1 桁（10 → '10%'・3.5 → '3.5%'）
                v_fee, 1, v_fee, null, v_sort, false, 'pay_fee', 'taxable_10', case when v_fee_source = 'manual' then null else v_rate end)   -- ★21 v2: 指定額は率なし
        returning id into v_fid;
        perform public.check_recalc(p_check_id);
        v_due2 := public.check_group_due(p_check_id, v_grp);
        v_fee_eff := greatest(0, v_due2 - v_due);
      end if;
    end if;
  end if;

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  v_mem := public.auth_membership_id();   -- ★3 0173（裁定389）: kiosk は null
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail, by_membership, fee_amount, fee_source)   -- ★3 0173: +by_membership・★21 v2: +fee_amount／fee_source
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount + v_fee_eff, p_tendered, p_idem_key, v_actor, v_detail, v_mem, v_fee, v_fee_source)   -- ★6 0173: 受取額＝入金額＋手数料（due の増分）
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id) || jsonb_build_object('pay_fee', v_fee, 'pay_fee_eff', v_fee_eff, 'pay_fee_rate', v_rate, 'pay_fee_line_id', v_fid,
      'pay_fee_on', p_fee_on, 'pay_fee_store_rate', v_store_rate, 'pay_fee_override', v_override,
      'pay_fee_amount', v_fee, 'pay_fee_source', v_fee_source,   -- ★21 v2
      'pay_discount', v_disc, 'pay_discount_rate', v_drate, 'pay_discount_line_id', v_did, 'pay_discount_base', v_dbase, 'pay_discount_manual', v_dman), v_chk.store_id);   -- ★6 0173: 手数料の痕跡・★1 0175: ON／OFF・店設定の率・上書きの有無・★11 v2: 割引
  if v_override then   -- ★1 0175（裁定393 追補2）: 店設定と異なる率／OFF は別の audit 行（操作者＝by_membership・kiosk は null）
    perform public.audit_log_write('pay_fee_override', 'payments:' || v_id::text,
      jsonb_build_object('store_rate', v_store_rate), jsonb_build_object('fee_on', p_fee_on, 'fee_rate', v_rate, 'fee_amount', v_fee, 'fee_source', v_fee_source, 'by_membership', v_mem), v_chk.store_id);   -- ★21 v2: 実額と source
  end if;

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


-- ═══ ★5 check_close（作り直し・0243（e）の後の本文・判定の 1 行） ═══
CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
  v_prev_kinds text[]; v_kind_chg timestamptz[]; v_k text;  -- ★0169（裁定341）: 場内→本指名の切替前に出た行は旧区分で計算（非遡及）
  v_bizdate date;                       -- ★0132 裁定113: 伝票営業日(started_at 起点)
  v_modes text[]; v_rates int[];        -- ★0132: cast 別の商品バック方式/率
  v_salesbase int[];                    -- ★0132: 同腕の按分売上母数(plan_rate/plan_fixed 監査用)
  v_units int[]; v_fixeds int[];        -- ★0133 裁定123: 同腕の按分本数Σ / cast 別の円/本固定額
  v_mode text; v_rate int; v_fixed int; -- ★0132/0133: 解決作業用
  v_ov jsonb[]; v_pf_hon int[]; v_pf_jonai int[]; v_pf_free int[]; v_fixedamt int[];   -- ★9 0153（305-12）: cast 別の overrides／プラン区分別／plan_fixed の凍結額
  v_ovj jsonb; v_pfh int; v_pfj int; v_pff int; v_reg text; v_funit int;               -- ★9 0153: 解決作業用
  v_years int;                                                                          -- ★9 0153（305-11）: customer_retention_years（既定 5）
  v_dcb_off boolean := false;                                                           -- ★0243（裁定511-21a）: ドリンクバック（本数で払う）が OFF の店
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_close');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if public.auth_cast_order_only() then raise exception 'forbidden'; end if;   -- ★0247（相談役 11/27 18:05・Agoora の決め）: 店の端末の腕で操作中の人が段階 2 未満の cast のときも会計の確定不可（前＝auth の cast だけ）   -- ★0200（裁定473）: 「注文のみ」の cast は締め不可（check_pay と同型）
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足(∀g: paid(g) ≥ due(g))＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配(最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_kind='hon' の行のみ=裁定100)
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id),
         array_agg(nom_kind order by position, created_at, id),
         array_agg(is_dohan order by position, created_at, id),
         array_agg(prev_kind order by position, created_at, id),       -- ★0169
         array_agg(kind_changed_at order by position, created_at, id)  -- ★0169
    into v_cast_ids, v_weights, v_kinds, v_dohans, v_prev_kinds, v_kind_chg
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    if v_sumw > 0 then  -- ★0124 判断B: 全 weight 0(全員 ended 等)=按分なし(整数除算ガード)
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    v_salesbase := array_fill(0, array[v_n]);  -- ★0132
    v_units := array_fill(0, array[v_n]);      -- ★0133
    -- ★0132 裁定113: 伝票営業日(started_at)時点の cast_plan から商品バック方式を cast 別に解決。
    --   解決不能(割当なし)=既定 product_rule。重複有効行は valid_from 降順の先頭(決定的・close は止めない)。
    v_bizdate := public.biz_date_of(v_chk.store_id, v_chk.started_at);
    -- ★0243（裁定511-21a）: 店の「ドリンクバック（本数で払う）」＝settings_json.sys_drink_count_back が JSON の false のときだけ OFF（画面の drinkCountBackOn と同じ判定・鍵なし＝ON）
    select coalesce(jsonb_typeof(s.settings_json->'sys_drink_count_back') = 'boolean' and (s.settings_json->>'sys_drink_count_back') = 'false', false)
      into v_dcb_off from public.stores s where s.id = v_chk.store_id;
    v_modes := array_fill('product_rule'::text, array[v_n]);
    v_rates := array_fill(0, array[v_n]);
    v_fixeds := array_fill(0, array[v_n]);     -- ★0133
    v_ov := array_fill('{}'::jsonb, array[v_n]); v_pf_hon := array_fill(null::int, array[v_n]); v_pf_jonai := array_fill(null::int, array[v_n]);   -- ★9 0153
    v_pf_free := array_fill(null::int, array[v_n]); v_fixedamt := array_fill(0, array[v_n]);                                                        -- ★9 0153
    for i in 1..v_n loop
      select p.product_back_mode, coalesce(p.product_back_rate, 0), coalesce(p.product_back_fixed, 0),
             coalesce(cp.overrides_json, '{}'::jsonb), p.product_back_fixed_hon, p.product_back_fixed_jonai, p.product_back_fixed_free   -- ★9 0153: 区分別の器を併読
        into v_mode, v_rate, v_fixed, v_ovj, v_pfh, v_pfj, v_pff
        from public.cast_plan cp
        join public.comp_plans p on p.id = cp.plan_id
       where cp.cast_id = v_cast_ids[i]
         and cp.org_id = v_chk.org_id
         and cp.valid_from <= v_bizdate
         and (cp.valid_to is null or cp.valid_to >= v_bizdate)
       order by cp.valid_from desc
       limit 1;
      if found then v_modes[i] := v_mode; v_rates[i] := v_rate; v_fixeds[i] := v_fixed;
        v_ov[i] := v_ovj; v_pf_hon[i] := v_pfh; v_pf_jonai[i] := v_pfj; v_pf_free[i] := v_pff;   -- ★9 0153
      end if;
    end loop;
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外(凍結値で判定・キー無し=false=按分対象)
         -- ★0243（裁定511-21a）: ドリンクバック OFF の店は、キャストドリンクも普通のドリンクと同じく按分する（OFF の店は「誰のドリンクか」を出さない＝前はどのキャストにも付かなかった）。
         --   「キャストに付ける」で付いた行（行に結び付いた承認済みの drink_claims）は除く＝同じ杯に 2 回付けない
         and (coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
              or (v_dcb_off and not exists (select 1 from public.drink_claims d
                                             where d.check_line_id = check_lines.id and d.status = 'approved')))
    loop
      -- 分配単価(productBackOf と同一規則・凍結値)。★0119: unit4 はキャスト別キーで集計ループ内に解決
      if (v_line.back_snapshot ->> 'back_mode') is distinct from 'unit4' then
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配(床=整数除算・剰余降順→position 昇順)
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計(★0132: cast 別 mode で分岐。同一行集合・同一 v_alloc=同腕)
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          v_k := case when v_kind_chg[i] is not null and v_line.created_at < v_kind_chg[i] then coalesce(v_prev_kinds[i], v_kinds[i]) else v_kinds[i] end;  -- ★0169: 行の作成が切替より前＝旧区分（既出のドリンクは注文時点の率）
          if v_modes[i] = 'plan_rate' then
            -- ★0132: 売上按分のみ凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
          elsif v_modes[i] = 'plan_fixed' then
            -- ★0133: 売上按分(監査用)+按分本数を凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
            v_units[i] := v_units[i] + v_alloc[i];
            -- ★9 0153（305-12／296 追補2）: 1 本あたり固定額の解決順＝商品 unit4（back_mode='unit4'）→ cast_plan 区分別 → comp_plans 区分別 → 一律。同伴＝本指名（unit4 は自分の dohan キー）
            v_reg := public.nom_unit4_key(v_k, v_dohans[i]);
            v_funit := null;
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_funit := (v_line.back_snapshot -> 'unit4' ->> v_reg)::int;
            end if;
            if v_reg = 'dohan' then v_reg := 'hon'; end if;
            if v_funit is null then v_funit := (v_ov[i] ->> ('productBackFixed' || initcap(v_reg)))::int; end if;
            if v_funit is null then v_funit := case v_reg when 'hon' then v_pf_hon[i] when 'jonai' then v_pf_jonai[i] else v_pf_free[i] end; end if;
            if v_funit is null then v_funit := v_fixeds[i]; end if;
            v_fixedamt[i] := v_fixedamt[i] + v_funit * v_alloc[i];
          elsif v_modes[i] = 'product_rule' then
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_k, v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_k = 'hon' then  -- ★0119: pt は本指名キャストの行のみ（★0169: 行時点の区分）
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    -- ★0132/0133: mode 別の凍結書込(ゼロ専用行は作らない)
    for i in 1..v_n loop
      if v_modes[i] = 'plan_rate' then
        if v_pt[i] > 0 or v_salesbase[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_rate', v_salesbase[i],
                  round((v_salesbase[i]::numeric * v_rates[i]) / 100.0)::int);
        end if;
      elsif v_modes[i] = 'plan_fixed' then
        -- ★0133: 1本あたり固定額=按分本数Σ×固定額を凍結(plan_rate と同型・payOf 例外を廃止)
        if v_pt[i] > 0 or v_salesbase[i] > 0 or v_units[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_fixed', v_salesbase[i], v_fixedamt[i]);   -- ★9 0153: 区分別の解決額Σ（全部 null なら v_units×一律と同値＝従来）
        end if;
      else
        if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  v_drink[i], v_champ[i], v_bottle[i], v_pt[i],
                  'product_rule', null, null);
        end if;
      end if;
    end loop;
    end if;  -- ★0124 判断B ガード終端
  end if;

  -- ★14 0152（裁定298-10）: 紹介の凍結（frozen_at）＋ 未払 1 件（amount>0 のみ＝298-6 D11・unpaid・withholding 0・営業日＝started_at 起点）。二重 insert は not exists と unique(check_id) の二重化
  update public.check_referrals set frozen_at = now() where check_id = p_check_id and frozen_at is null;
  insert into public.referral_payouts (org_id, store_id, referrer_id, check_id, biz_date, amount, withholding, status)
  select r.org_id, r.store_id, r.referrer_id, r.check_id, public.biz_date_of(v_chk.store_id, v_chk.started_at), r.amount, 0, 'unpaid'
    from public.check_referrals r
   where r.check_id = p_check_id and r.amount > 0
     and not exists (select 1 from public.referral_payouts p where p.check_id = p_check_id);
  -- ★9 0153（305-11／293-4）: 伝票に紐づく顧客の last_visit_at＝now()・retention_until＝＋店設定 customer_retention_years（既定 5）
  select coalesce(nullif(s.settings_json->>'customer_retention_years', '')::int, 5) into v_years from public.stores s where s.id = v_chk.store_id;
  update public.customers cu
     set last_visit_at = now(), retention_until = (now() + make_interval(years => coalesce(v_years, 5)))::date, updated_at = now()
   where cu.id in (select cc.customer_id from public.check_customers cc where cc.check_id = p_check_id)
      or cu.id = v_chk.customer_id;
  -- ★5 0173（裁定392）: 会計でキープ確定＝この伝票の購入行に紐づく pending → active
  update public.bottle_keeps b
     set status = 'active', opened_at = now(), updated_at = now()
   where b.status = 'pending'
     and b.check_line_id in (select l.id from public.check_lines l where l.check_id = p_check_id);
  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;
revoke execute on function public.check_close(uuid, uuid) from public, anon;
grant execute on function public.check_close(uuid, uuid) to authenticated;

commit;
