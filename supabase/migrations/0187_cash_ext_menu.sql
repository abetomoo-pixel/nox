-- 0187_cash_ext_menu.sql — 便 CASH＋便 EXT＋remove_store_special_day の課金ゲート（2026-10-27 起草・Agoora 確定 10/27（1）（2）（5）（6））
-- 翻訳元: live pg_get_functiondef（2026-10-27 16:0x／17:3x・0180〜0186 適用後）＋生成器 docs/tmp/gen_0187.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換）。
--   ★1 便 EXT: 凍結メニュー＝その営業日の曜日・席種の延長パターンを時間帯を問わず全行（band つき）＝ext_menu_build（新設・内部）。延長を足すとき＝延長の開始時刻の時間帯に合う行＝ext_menu_pick（新設・内部）。
--      check_open／check_move_seat（VIP の再凍結）／check_extension_add（手動・行の指定はその行）／check_time_charge_apply（自動・ブロックごと）。0187 前に開いた伝票（band キーなしの凍結）は従来の選び方。
--   ★2 便 CASH: 割引の基準＝店設定 pay_discount_base（total＝合計から・既定／subtotal＝小計から＝T15 の回答待ちの仮置き）。合計から＝税・サ込みの残額×率を「最後に」引く（fee_kind 'pay_discount_total'＝check_group_due が丸めた合計から引いてから店の丸め規則でもう一度丸める＝お支払額が丸め単位の倍数・事後承認 ② Agoora 10/27）。
--      小計から＝税・サの前の小計×率（従来の割引行＝fee_kind 'pay_discount'）。今の割引（合計×率をサ・税の前に引く＝過大）を直す。入金ごとの上書き＝check_pay +p_disc_rate／p_disc_amount（DROP→CREATE）。
--      入金済みの伝票の額は変えない（過去の行を書き換えない・再計算しない＝既存の 'pay_discount' 行は従来どおりサ・税の前）。紹介料の母数・席移動の凍結サ料の母数は「合計から」の割引を入れない。
--   ★3 remove_store_special_day に課金ゲート（set_store_special_day と揃える）。
-- 営業中に貼ってよいか: 営業時間外に貼る（check_lines の CHECK 差し替えで表のロック＝伝票の書き込みが数秒待たされる・check_pay の DROP→CREATE の間は入金が失敗する）。
-- 検証（Success の後）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ① check_lines.fee_kind に 'pay_discount_total'（合計から の割引） ═══
alter table public.check_lines drop constraint if exists check_lines_fee_kind_check;
alter table public.check_lines add constraint check_lines_fee_kind_check check (fee_kind is null or fee_kind in ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge','pay_fee','pay_discount','pay_discount_total'));

-- ═══ ② 内部ヘルパー 2 本（新設・4 ロール revoke） ═══
CREATE OR REPLACE FUNCTION public.ext_menu_build(p_store_id uuid, p_seat_kind text, p_category_id uuid, p_at timestamp with time zone, p_ext_min integer, p_time_per text, p_vip_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0187（便 EXT・Agoora 確定 10/27（2））: 延長パターンの凍結メニュー＝その営業日の曜日・その席種（p_vip_only＝VIP 用だけ）・区分の行を「時間帯を問わず」全部。
--   各項目に band（営業日の分＝締めの時刻より前は +1440・時間帯なし＝null）を持たせる＝ext_menu_pick が延長の開始時刻で行を選ぶ。
--   band キーの有無が「新しい形」の印（0187 前の凍結＝band キーなし＝ext_menu_pick は null＝従来の選び方に戻る）。並びは従来と同じ（既定→priority→区分一致→作成順）。
declare
  v_dow int; v_bm int; v_settings jsonb; v_cutoff text; v_cut int; v_menu jsonb;
begin
  select b.biz_dow, b.biz_min into v_dow, v_bm from public.biz_minutes_of(p_store_id, p_at) b;
  select s.settings_json into v_settings from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
  select coalesce(jsonb_agg(jsonb_build_object(
           'rule_id', r.id,
           'duration_min', coalesce(r.duration_min, p_ext_min),
           'amount', r.amount,
           'unit', coalesce(r.billing_unit, p_time_per),
           'is_default', r.is_default_ext,
           'label', '延長 ' || coalesce(r.duration_min, p_ext_min) || '分 ¥' || r.amount,
           'band', case when r.time_from_min is null then null else jsonb_build_object(
                     'from', case when r.time_from_min < v_cut then r.time_from_min + 1440 else r.time_from_min::int end,
                     'to',   case when r.time_to_min <= v_cut then r.time_to_min + 1440 else r.time_to_min::int end) end)
         order by r.is_default_ext desc, r.priority asc, (r.category_id is not null) desc, r.created_at asc, r.id asc), '[]'::jsonb)
    into v_menu
    from public.pricing_rules r
   where r.store_id = p_store_id
     and r.is_active
     and r.fee_kind = 'extension'
     and (case when p_vip_only then r.seat_kind = 'VIP' else (r.seat_kind is null or r.seat_kind = coalesce(p_seat_kind, '卓')) end)
     and (r.rank_id is null)
     and (r.category_id is null or r.category_id = p_category_id)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow) & 1) = 1);
  return v_menu;
end $function$;

CREATE OR REPLACE FUNCTION public.ext_menu_pick(p_snap jsonb, p_bm integer, p_prefer uuid, p_dur integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
-- ★0187（便 EXT）: 凍結メニューから「その時刻（営業日の分）の時間帯に合う行」を 1 つ選ぶ。
--   優先＝①時間帯つきの行（その時刻に合う具体的な行＝便 EXT の目的）②選択中のパターン（p_prefer＝checks.ext_rule_id）③既定 ④メニューの順。p_dur＝長さを揃える（自動延長のブロック＝選んだパターンの長さ）。
--   ★開卓時の ext_rule_id は自動の既定（時間帯なしの既定行が多い）＝これを①にすると時間帯の行が選ばれない＝時間帯を①にする。行の指定（check_extension_add の p_rule_id）はこの関数を通らずその行。
--   新しい形でない凍結（band キーなし＝0187 前に開いた伝票）・合う行なし＝null（呼び出し側は従来の選び方に戻る）。
  select m.value
    from jsonb_array_elements(coalesce(p_snap, '[]'::jsonb)) with ordinality as m(value, ord)
   where m.value ? 'band'
     and (m.value->'band' = 'null'::jsonb
          or ((m.value->'band'->>'from')::int <= p_bm and p_bm < (m.value->'band'->>'to')::int))
     and (p_dur is null or (m.value->>'duration_min')::int = p_dur)
   order by (m.value->'band' <> 'null'::jsonb) desc,
            ((m.value->>'rule_id')::uuid is not distinct from p_prefer) desc,
            coalesce((m.value->>'is_default')::boolean, false) desc,
            m.ord asc
   limit 1
$function$;
revoke execute on function public.ext_menu_build(uuid, text, uuid, timestamp with time zone, integer, text, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.ext_menu_pick(jsonb, integer, uuid, integer) from public, anon, authenticated, service_role;

-- ═══ ③ check_open ═══
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
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
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
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit)  -- ★mig0130
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu, public.auth_membership_id(),   -- ★3 0173
          r_ext.rule_id,   -- ★23 v2
          v_bts, v_pd, v_trnd,  -- ★mig0113
          p_category_id, v_cat_name,  -- ★mig0128
          r_set.rule_id, v_rule_name,  -- ★mig0129
          v_sunit, v_eunit, v_vfee, v_vunit)  -- ★mig0130
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
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            'セット料金(' || v_smin || '分)', v_sfee, v_units, v_sfee * v_units,
            null, 1, true, 'set', 0);  -- ★mig0098 R2-7c: null 再生産の停止（0097b 吸収の本命側）
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

-- ═══ ④ check_move_seat ═══
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
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_to_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
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
        select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee'), 0)::int,
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
        v_delta := greatest(0, r_set.amount - coalesce(v_chk.set_fee, 0));
        if v_ext_n = 0 then
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
    if v_moved then
      perform public.check_recalc(p_check_id);
      perform public.audit_log_write('check_move_seat_pricing', 'checks:' || p_check_id::text,
        jsonb_build_object('from_kind', v_from_kind, 'to_kind', v_to_kind, 'service_rate', v_rate_old, 'set_fee', v_chk.set_fee, 'ext_fee', v_chk.ext_fee, 'ext_rule_id', v_chk.ext_rule_id),
        (select jsonb_build_object('service_rate', ch.service_rate, 'service_pre', ch.service_pre, 'set_fee', ch.set_fee, 'set_rule_id', ch.set_rule_id, 'ext_fee', ch.ext_fee, 'ext_rule_id', ch.ext_rule_id, 'total', ch.total)
           from public.checks ch where ch.id = p_check_id),
        v_chk.store_id);
    end if;
  end if;
end $function$;

-- ═══ ⑤ check_extension_add ═══
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
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
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

-- ═══ ⑥ check_time_charge_apply ═══
CREATE OR REPLACE FUNCTION public.check_time_charge_apply(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_set_id uuid; v_ext_id uuid; v_k int;  -- ★mig0097: block ループ用
  v_org uuid;  -- ★0057(2)
  v_eunits int;  -- ★mig0130: ext 実効単位の units
  v_pick jsonb; v_fee_k int;  -- ★0187（便 EXT）: ブロックごとの額
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 裁定(c): 入金後に合計が動く経路を塞ぐ（check_remove_line と同じ保守側。
  -- check_add_line の非対称は裁定台帳に既知事項として記録済み＝今回は触らない）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 防御深度: スナップ5値の妥当性（checks 列 CHECK が正・型/列事故の検知用＝E1【決定1】流儀）
  -- ★mig0130: 実効単位2値も防御対象へ(null は time_per へ収束=旧伝票互換)
  if v_chk.set_min < 1 or v_chk.ext_min < 1 or v_chk.set_fee < 0 or v_chk.ext_fee < 0
     or v_chk.time_per not in ('table','person')
     or coalesce(v_chk.set_unit, v_chk.time_per) not in ('table','person')
     or coalesce(v_chk.ext_unit, v_chk.time_per) not in ('table','person') then
    raise exception 'bad time settings';
  end if;

  -- サーバ計算（モック Lp 写し・経過は「完了分」＝floor・浮動小数を金額に持ち込まない）
  -- ★mig0089: 式は改稿前と逐語同一＝金額不変（行の持ち方だけ分離）
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  -- ★mig0130: units 2系統化(set=set_unit・ext=ext_unit・null→time_per=現行同値)
  v_units  := case when coalesce(v_chk.set_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_eunits := case when coalesce(v_chk.ext_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  v_set_c := v_chk.set_fee * v_units;
  -- ★mig0097: v_ext_c は式では出せない（凍結ブロックの units は現況と異なり得る）＝
  --   行生成の後に Σline_total で実測確定し、v_total もそこで算出する

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_before
    from public.check_lines l where l.check_id = p_check_id and l.time_auto;

  -- ★mig0089: legacy 合算1行（fee_kind null）の移行吸収＝apply 自身が delete。
  --   closed 伝票は本 RPC が触れない（not open ガード）＝歴史は不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind is null;

  -- ★mig0097: 旧形式の合算 extension 行（block_no null）の移行吸収（0089 の fee_kind null 吸収と
  --   同型）。closed 伝票は本 RPC が触れない＝歴史不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no is null;

  -- ★mig0097b: check_open 由来の block_no null な set 行の移行吸収（extension null 吸収と対称）。
  --   3列ユニークは NULL distinct のため null set 行には効かず、放置すると block_no=0 行との
  --   二重化（set 額の過大計上）が起きる＝実バグの封鎖。null しか無い初回 apply でも、
  --   null+0 の二重化が既に起きた伝票でも、この delete→直後の 0 行 upsert で単一行へ収束する。
  --   check_open 側の block_no=0 化（再生産の停止）は 0098（R2-a・check_open 改稿）で実施。
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'set' and block_no is null;

  -- set 行（額>0 のみ実体化・0 なら既存 auto set 行を削除＝総額保存則）
  -- ★mig0097: block_no=0 固定（R2-7 改訂）・conflict 推論は3列。set=全遡及（現況 units）の意味論不変
  if coalesce(v_chk.set_frozen, false) then
    null;   -- ★2 0173（裁定386）: セット終了後に人数が変わった伝票＝セット行は凍結（引き直さない・削除もしない）
  elsif v_set_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            'セット料金(' || v_chk.set_min || '分)', v_chk.set_fee, v_units, v_set_c,
            null, v_sort, true, 'set', 0)
    on conflict (check_id, fee_kind, block_no) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot
    returning id into v_set_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'set';
  end if;

  -- extension 行（★mig0097 R2-7/R2-7b: ブロック単位＝終了済みは凍結・進行中のみ現況 units）
  --   時計逆行等で v_blocks を超えた行が残った場合は削除（決定性の維持）
  --   ★mig0130: ext の units は v_eunits(ext_unit 起点)
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension'
     and block_no is not null and block_no > v_blocks;

  if v_blocks = 0 or v_chk.ext_fee = 0 then
    -- ブロックなし or 単価0＝額>0 のみ実体化原則（0089 の else 分岐と同義）
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  else
    for v_k in 1..v_blocks loop
      -- ★0187（便 EXT・Agoora 確定 10/27（2））: このブロックの開始時刻（入店＋セット＋前のブロック）の時間帯に合う行の額（長さ＝ext_min の行だけ・時間帯つき→選択中のパターン→既定）。
      --   0187 前に開いた伝票（band キーなし）・合う行なし＝従来の ext_fee
      v_pick := public.ext_menu_pick(v_chk.ext_menu_snap, (select b.biz_min from public.biz_minutes_of(v_chk.store_id, v_chk.started_at + make_interval(mins => v_chk.set_min + (v_k - 1) * v_chk.ext_min)) b), v_chk.ext_rule_id, v_chk.ext_min);
      v_fee_k := coalesce((v_pick->>'amount')::int, v_chk.ext_fee);
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_lines where check_id = p_check_id;
      if v_d >= v_chk.set_min + v_k * v_chk.ext_min then
        -- 終了済みブロック＝凍結（既存行 do nothing 不触・無ければ現況 units で初回生成＝R2-7b）
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do nothing;
      else
        -- 進行中ブロック（k=v_blocks のみ到達）＝現況 units で upsert
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do update
           set unit_price_snapshot = excluded.unit_price_snapshot,
               qty                 = excluded.qty,
               line_total          = excluded.line_total,
               name_snapshot       = excluded.name_snapshot;
      end if;
    end loop;
    select l.id into v_ext_id from public.check_lines l
     where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension'
     order by l.block_no desc limit 1;
  end if;

  -- ★mig0097: ext は行実測で確定（凍結行の units 混在を正しく合算）
  select coalesce(sum(l.line_total), 0)::int into v_ext_c from public.check_lines l
   where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension';
  v_total := v_set_c + v_ext_c;

    perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_time_charge_apply', 'checks:' || p_check_id::text,
    v_before,
    (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
       from public.check_lines l where l.check_id = p_check_id and l.time_auto),
    v_chk.store_id);

  return jsonb_build_object('elapsed_min', v_d, 'units', v_units, 'blocks', v_blocks,
                            'set_c', v_set_c, 'ext_c', v_ext_c, 'total', v_total,
                            'set_line_id', v_set_id, 'ext_line_id', v_ext_id,
                            'ext_units', v_eunits);  -- ★mig0130: 追加キー('units' は set 側で据え置き)
end $function$;

-- ═══ ⑦ check_group_due（内部・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text, p_exclude_pay_fee boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_unit2 int; v_mode2 text;  -- ★0178: open のときだけ上書きする作業変数
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
  v_post int := 0;  -- ★0187（便 CASH）: 「合計から」の割引（fee_kind 'pay_discount_total'）＝最後に引く
  v_pf int := 0;   -- ★6 0173（裁定393）: 手数料行の合計（サ料の母数から除く・税の母数には乗る＝内税対象）
  v_pre_amt int := 0; v_pre_base int := 0;  -- ★0182（裁定427 ③）: 席移動前に凍結したサ料（pay_group ごと＝checks.service_pre）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- ★0182（裁定427 ③）: 席移動で率が変わった伝票＝移動前の母数（base）までは旧率で確定した額（amount）・それより先の増分だけ現在の率
  select coalesce((c.service_pre->p_pay_group->>'amount')::int, 0), coalesce((c.service_pre->p_pay_group->>'base')::int, 0)
    into v_pre_amt, v_pre_base
    from public.checks c where c.id = p_check_id;
  -- ★29 0175 v2（裁定424 候補・便 SH-UI-c2 C2-16）: 端数調整（丸め単位・丸め方）は凍結しない＝開いている伝票は店設定の現在値を読む（税率・サ料・外税／内税は凍結値のまま）。確定済み（closed）は凍結値＝確定時の額のまま
  -- ★0178（便 ON-1・2026-10-26）: 0175 ★29 の欠陥＝closed（該当行なし）のとき select … into が v_unit／v_mode を NULL にし、確定済み伝票の due が NULL（cast_sales_aggregate の g.due > 0 で売上 0・demo 6 店 5,176 件で実測）→ 行があるときだけ上書き
  select s.round_unit, s.round_mode into v_unit2, v_mode2
    from public.checks c join public.stores s on s.id = c.store_id
   where c.id = p_check_id and c.status = 'open';
  if found then v_unit := v_unit2; v_mode := v_mode2; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
     and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 0148 ★10 の referral 除外を削除（kind 'referral' は CHECK から撤去）・★6 0173: 除外指定
  if not p_exclude_pay_fee then
    select coalesce(sum(line_total), 0)::int into v_pf
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and fee_kind = 'pay_fee';   -- ★6 0173
  end if;
  -- ★12 0152（裁定298-9）: burden='customer' の紹介料は pay_group 'A' の小計（サ料・税の母数）に加算（burden='store' は乗らない）
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref
      from public.check_referrals
     where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount'
     and fee_kind is distinct from 'pay_discount_total';   -- ★0187: 「合計から」の割引は小計から引かない（下で最後に引く）
  select coalesce(sum(line_total), 0)::int into v_post
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount' and fee_kind = 'pay_discount_total';   -- ★0187
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  -- ★mig0113: 外税（tax_excluded × taxable のみ）。内税/exempt は下の従来行＝1バイト不変。
  --   規則（設計書 v1 §3 細則）: 税率別に check_tax_round を1回ずつ（伝票×税率×1回＝T5）。
  --   discount は taxable_10 基底へ適用（clamp・8% への按分は F5）。サ料は taxable_10 基底（T6）。
  --   exempt/out_of_scope 行は税 0。TS 鏡像: receipt.ts / check-calc.ts（三面鏡・同時改修）。
  if v_pd = 'tax_excluded' and v_bts = 'taxable' then
    select coalesce(sum(line_total) filter (where tax_category = 'taxable_10'), 0)::int,
           coalesce(sum(line_total) filter (where tax_category = 'taxable_8'),  0)::int
      into v_bx10, v_bx8
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
       and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 同上・★6 0173: 除外指定
    v_bx10 := v_bx10 + v_ref;                                              -- ★12 0152（裁定298-9）: taxable_10 の母数にも加算
    v_sv     := v_pre_amt + round(greatest(0, v_net - v_pf - v_pre_base) * v_rate / 100.0)::int;   -- サ料（★0182: 凍結額＋増分×現在率・service_pre が空なら従来と同式）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(greatest(0, public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode) - v_post), v_unit, v_mode);   -- ★0187（事後承認 ②・Agoora 10/27）: 丸めた合計から「合計から」の割引を引き、店の丸め規則でもう一度丸める＝お支払額が丸め単位の倍数
  end if;
  return public.check_round_amount(greatest(0, public.check_round_amount(v_net + v_pre_amt + round(greatest(0, v_net - v_pf - v_pre_base) * v_rate / 100.0), v_unit, v_mode) - v_post), v_unit, v_mode);   -- ★0187: 同上（内税）   -- ★0182: 同上（内税）
end $function$;

-- ═══ ⑧ check_pay（引数 +2＝DROP→CREATE・ACL を元に戻す＝authenticated／service_role） ═══
drop function if exists public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer);
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

  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then raise exception 'forbidden'; end if;   -- ★25 0175 v2（裁定420）: 「注文のみ」の cast は入金不可
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
          select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee'), 0)::int
               - coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int
            into v_dnet from public.check_lines where check_id = p_check_id and pay_group = v_grp;
          v_disc := round(greatest(0, v_dnet)::numeric * (v_due - v_paid) / greatest(v_due, 1) * v_drate / 100.0)::int;
        else
          -- 合計から＝税・サ込みの残額 × 率＝最後に引く（check_group_due が丸めた合計から引いてから店の丸め規則でもう一度丸める＝事後承認 ②）
          v_disc := round((v_due - v_paid) * v_drate / 100.0)::int;
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
revoke execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer, numeric, integer) from public, anon;
grant execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer, numeric, integer) to authenticated, service_role;

-- ═══ ⑨ set_store_profile ═══
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
                             'ar_enabled',                                                                -- ★4 0155: 裁定309-1 の 1 キー（boolean・新規店の既定は false＝ar_policy_ok の coalesce）（0158 ★4: 末尾 '];' → ','）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             'invoice_registered_on','pay_day','tax_inclusive_display','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours',   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間（0173 ★7: 末尾 '];' → ','）
                             'join_mode','cast_register_device','pay_fee_rates','trial_guarantee_days','default_plan_id',   -- ★7 0173: 裁定386／389／393／396 の 5 キー（0175 ★3: 末尾 '];' → ','）
                             'sys_wage_cut_rule','bonus_tier_mode','sales_split','pt_rules_default',                         -- ★3 0175: X13-I ②（就業規則に減給の定め）・裁定404（達成ボーナスの段）・409（売上の分け方）・405（店の既定 pt ルール）
                             'punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m',                 -- ★8 0175（398 打刻設定・列側）
                             'punch_require_shift','punch_round_unit','punch_round_mode','punch_round_consent_version',       -- ★8 0175（398）: 同意版は列に書かず punch_round_consents に 1 行（v2: 末尾 '];' → ','）
                             'service_rate_by_seat','pay_discount_rates','sys_drink_count_back','sales_subtotal_mode','sales_subtotal_includes_shimei',   -- ★11 0175 v2（CN-R ②③⑨⑩）
                             'settlement_week_close_dow','settlement_pay_days_after','daily_pay_cap_tiers',
                             'sys_staff_discount','staff_discount_cap','sys_cast_register',
                             'kiosk_features','kiosk_idle_sec',
                             'okuri_flat_tiers',
                             'pay_discount_base'];   -- ★0187（便 CASH）: 現金割引の基準（total＝合計から・既定／subtotal＝小計から）   -- ★1 0180（裁定414 追補）: 送り 定額の距離区分（配列・最大 3・{code,name,amount}）                                                                -- ★27 0175 v2 追補 2 同乗 R-7（裁定423 候補）                                     -- ★24／★25 0175 v2 追補 2（裁定421 候補・裁定420）                   -- ★11 0175 v2（CN-R ⑳ 週払い・日払いの上限）
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
  v_okb      numeric;   -- ★4 0158: okuri_base_amount（整数 0〜99999）
  v_inv_on   date;      -- ★2 0164: invoice_registered_on（'YYYY-MM-DD' か null）
  v_pay_day  numeric;   -- ★2 0164: pay_day（整数 1〜31）
  v_tax_inc  boolean;   -- ★2 0164: tax_inclusive_display
  v_use_vip  boolean;   -- ★2 0164: use_vip
  v_use_ctr  boolean;   -- ★2 0164: use_counter
  v_paym     jsonb;     -- ★2 0164: payment_methods（object・cash／card／emoney／qr・boolean・cash は true）
  v_punch    jsonb;     -- ★2 0164: punch_methods（object・self／proxy／kiosk・boolean・1 つ以上 true）
  v_jk       text;      -- ★2 0164: jsonb の検査用キー
  v_cycle    text;      -- ★3 0172: settlement_cycle（enum text 4 値・slide_apply と同型）
  v_midpay   text;      -- ★3 0172: mid_pay（enum text 2 値）
  v_autoh    numeric;   -- ★3 0172: shift_auto_confirm_hours（整数 0〜168・0＝自動確定しない）
  v_join     text;      -- ★2 0173: join_mode（enum text 2 値）
  v_crdev    text;      -- ★3 0173: cast_register_device（enum text 2 値）
  v_pfr      jsonb;     -- ★6 0173: pay_fee_rates（object・card／emoney／other・整数 0〜100）
  v_pfk      text;      -- ★6 0173: jsonb の検査用キー
  v_pfv      numeric;   -- ★6 0173: 率の検査用
  v_tgd      numeric;   -- ★7 0173: trial_guarantee_days（整数 1〜90）
  v_dpid     uuid;      -- ★7 0173: default_plan_id（自店の有効な comp_plans.id）
  v_wcr      boolean;   -- ★3 0175: sys_wage_cut_rule（show_open_status と同型）
  v_btm      text;      -- ★3 0175: bonus_tier_mode（enum text 2 値 max／sum）
  v_split    text;      -- ★3 0175: sales_split（enum text 2 値 prorate／equal）
  v_ptr      jsonb;     -- ★3 0175: pt_rules_default（object・pt_rules_check）
  v_penf     boolean;   -- ★8 0175: punch_enforce
  v_pmode    text;      -- ★8 0175: punch_restrict_mode（5 値）
  v_plat     double precision;   -- ★8 0175: punch_lat（-90〜90・null 可）
  v_plng     double precision;   -- ★8 0175: punch_lng（-180〜180・null 可）
  v_prad     numeric;   -- ★8 0175: punch_radius_m（整数 10〜100000・null 可）
  v_preq     text;      -- ★8 0175: punch_require_shift（off／warn／block）
  v_prunit   numeric;   -- ★8 0175: punch_round_unit（1／5／10／15／30）
  v_prmode   text;      -- ★8 0175: punch_round_mode（staff_favor／store_favor／nearest）
  v_pcv      text;      -- ★8 0175: punch_round_consent_version
  v_actor    uuid;      -- ★8 0175: 同意ログの changed_by
  v_srs      jsonb;     -- ★11 v2: service_rate_by_seat
  v_pdr      jsonb;     -- ★11 v2: pay_discount_rates
  v_sdcb     boolean;   -- ★11 v2: sys_drink_count_back
  v_ssm      text;      -- ★11 v2: sales_subtotal_mode
  v_ssis     boolean;   -- ★11 v2: sales_subtotal_includes_shimei
  v_wcd      numeric;   -- ★11 v2: settlement_week_close_dow
  v_pda      numeric;   -- ★11 v2: settlement_pay_days_after
  v_dct      jsonb;     -- ★11 v2: daily_pay_cap_tiers
  v_ssd      numeric;   -- ★24 v2 追補 2: sys_staff_discount（0 承認制／1 上限内は即時／2 不可）
  v_sdc      numeric;   -- ★24 v2 追補 2: staff_discount_cap（円・上限内は即時の上限）
  v_scr      numeric;   -- ★25 v2 追補 2: sys_cast_register（0 OFF／1 注文のみ／2 会計まで）
  v_kf       jsonb;     -- ★27 v2 R-7: kiosk_features {punch, register, shift}
  v_pdb      text;      -- ★0187: pay_discount_base
  v_oft      jsonb;     -- ★1 0180: okuri_flat_tiers（配列・最大 3）
  v_oe       jsonb;     -- ★1 0180: okuri_flat_tiers の要素
  v_ocodes   text[] := '{}';   -- ★1 0180: code の重複検査
  v_kis      numeric;   -- ★27 v2 R-7: kiosk_idle_sec（60〜900・既定 180）
  v_prevh    numeric;   -- ★11 v2: 表の昇順検査
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json,   -- ★2 0164: 列を 7 つ続ける
         invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods,   -- ★2 0164: before の現値（0175 ★8: 末尾 ','）
         punch_enforce, punch_restrict_mode, punch_lat, punch_lng, punch_radius_m, punch_require_shift, punch_round_unit, punch_round_mode,   -- ★8 0175（398）: 列側 8 の現値（v2: 末尾 ','）
         service_rate_by_seat   -- ★11 0175 v2（CN-R ②）
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

  if p_patch ? 'pay_discount_base' then   -- ★0187（便 CASH・Agoora 確定 10/27）: 割引対象＝合計から（既定）／小計から（税理士 T15 の回答待ちの仮置き）
    if jsonb_typeof(p_patch->'pay_discount_base') <> 'string' then raise exception 'bad type'; end if;
    v_pdb := p_patch->>'pay_discount_base';
    if v_pdb is null or v_pdb not in ('total','subtotal') then raise exception 'bad pay_discount_base'; end if;
    v_before   := v_before || jsonb_build_object('pay_discount_base', coalesce(v_settings->>'pay_discount_base', 'total'));
    v_after    := v_after  || jsonb_build_object('pay_discount_base', v_pdb);
    v_settings := jsonb_set(v_settings, '{pay_discount_base}', to_jsonb(v_pdb), true);
  end if;

  if p_patch ? 'okuri_flat_tiers' then                                                                   -- ★1 0180（裁定414 追補）: 定額徴収の距離区分＝配列・最大 3・要素 {code,name,amount}（settlement_presets と同型）
    v_oft := p_patch->'okuri_flat_tiers';                                                                -- ★1
    if jsonb_typeof(v_oft) <> 'array' or jsonb_array_length(v_oft) > 3 then raise exception 'bad type'; end if;   -- ★1: 最大 3 段
    v_ocodes := '{}';                                                                                     -- ★1
    for v_oe in select e from jsonb_array_elements(v_oft) e loop                                          -- ★1
      if jsonb_typeof(v_oe) <> 'object'                                                                   -- ★1
         or coalesce(jsonb_typeof(v_oe->'code'), '') <> 'string' or length(trim(v_oe->>'code')) = 0 or length(v_oe->>'code') > 32   -- ★1
         or coalesce(jsonb_typeof(v_oe->'name'), '') <> 'string' or length(trim(v_oe->>'name')) = 0 or length(v_oe->>'name') > 40   -- ★1
         or coalesce(jsonb_typeof(v_oe->'amount'), '') <> 'number'                                        -- ★1
         or (v_oe->>'amount')::numeric < 0 or (v_oe->>'amount')::numeric <> trunc((v_oe->>'amount')::numeric) then   -- ★1: 整数 ≥0
        raise exception 'bad type';                                                                       -- ★1
      end if;                                                                                             -- ★1
      if (v_oe->>'code') = any (v_ocodes) then raise exception 'bad type'; end if;                        -- ★1: code 一意
      v_ocodes := v_ocodes || (v_oe->>'code');                                                            -- ★1
    end loop;                                                                                             -- ★1
    v_before   := v_before || jsonb_build_object('okuri_flat_tiers', coalesce(v_settings->'okuri_flat_tiers', '[]'::jsonb));   -- ★1
    v_after    := v_after  || jsonb_build_object('okuri_flat_tiers', v_oft);                              -- ★1
    v_settings := jsonb_set(v_settings, '{okuri_flat_tiers}', v_oft, true);                               -- ★1
  end if;                                                                                                 -- ★1

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

  if p_patch ? 'okuri_base_amount' then                                                                    -- ★4 0158（裁定317）: 整数 0〜99999（customer_retention_years の数値検査の型）
    if jsonb_typeof(p_patch->'okuri_base_amount') <> 'number' then raise exception 'bad type'; end if;       -- ★4 0158
    v_okb := (p_patch->>'okuri_base_amount')::numeric;                                                       -- ★4 0158
    if v_okb < 0 or v_okb > 99999 or v_okb <> trunc(v_okb) then raise exception 'bad okuri_base_amount'; end if;   -- ★4 0158
    v_before   := v_before || jsonb_build_object('okuri_base_amount', coalesce(nullif(trim(v_settings->>'okuri_base_amount'), '')::int, 0));   -- ★4 0158: 既定 0（未設定）
    v_after    := v_after  || jsonb_build_object('okuri_base_amount', v_okb::int);                           -- ★4 0158
    v_settings := jsonb_set(v_settings, '{okuri_base_amount}', to_jsonb(v_okb::int), true);                  -- ★4 0158
  end if;                                                                                                  -- ★4 0158

  -- ── ★2 0164: 列側 7 キー（裁定331 C 5 項目＋334 フロア機能） ──────────
  if p_patch ? 'invoice_registered_on' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'invoice_registered_on') = 'null' then v_inv_on := null;                       -- ★2 0164: null＝未登録／不明
    elsif jsonb_typeof(p_patch->'invoice_registered_on') <> 'string' or (p_patch->>'invoice_registered_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad type';   -- ★2 0164
    else v_inv_on := (p_patch->>'invoice_registered_on')::date; end if;                                      -- ★2 0164
    v_before := v_before || jsonb_build_object('invoice_registered_on', v_store.invoice_registered_on);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('invoice_registered_on', v_inv_on);                           -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'pay_day' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'pay_day') <> 'number' then raise exception 'bad type'; end if;                 -- ★2 0164
    v_pay_day := (p_patch->>'pay_day')::numeric;                                                             -- ★2 0164
    if v_pay_day < 1 or v_pay_day > 31 or v_pay_day <> trunc(v_pay_day) then raise exception 'bad pay_day'; end if;   -- ★2 0164
    v_before := v_before || jsonb_build_object('pay_day', v_store.pay_day);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('pay_day', v_pay_day::int);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'tax_inclusive_display' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'tax_inclusive_display') <> 'boolean' then raise exception 'bad type'; end if;  -- ★2 0164
    v_tax_inc := (p_patch->>'tax_inclusive_display')::boolean;                                               -- ★2 0164
    v_before := v_before || jsonb_build_object('tax_inclusive_display', v_store.tax_inclusive_display);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('tax_inclusive_display', v_tax_inc);                          -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_vip' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'use_vip') <> 'boolean' then raise exception 'bad type'; end if;                -- ★2 0164
    v_use_vip := (p_patch->>'use_vip')::boolean;                                                             -- ★2 0164
    v_before := v_before || jsonb_build_object('use_vip', v_store.use_vip);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_vip', v_use_vip);                                        -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_counter' then                                                                          -- ★2 0164
    if jsonb_typeof(p_patch->'use_counter') <> 'boolean' then raise exception 'bad type'; end if;            -- ★2 0164
    v_use_ctr := (p_patch->>'use_counter')::boolean;                                                         -- ★2 0164
    v_before := v_before || jsonb_build_object('use_counter', v_store.use_counter);                          -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_counter', v_use_ctr);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'payment_methods' then                                                                      -- ★2 0164
    v_paym := p_patch->'payment_methods';                                                                    -- ★2 0164
    if jsonb_typeof(v_paym) <> 'object' then raise exception 'bad type'; end if;                             -- ★2 0164
    for v_jk in select jsonb_object_keys(v_paym) loop                                                        -- ★2 0164
      if v_jk not in ('cash','card','emoney','qr') or jsonb_typeof(v_paym->v_jk) <> 'boolean' then raise exception 'bad payment_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    if coalesce((v_paym->>'cash')::boolean, true) <> true then raise exception 'bad payment_methods'; end if;   -- ★2 0164: 現金は常に使う
    v_paym := v_store.payment_methods || v_paym;                                                             -- ★2 0164: 無いキーは現値のまま
    v_before := v_before || jsonb_build_object('payment_methods', v_store.payment_methods);                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('payment_methods', v_paym);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'punch_methods' then                                                                        -- ★2 0164
    v_punch := p_patch->'punch_methods';                                                                     -- ★2 0164
    if jsonb_typeof(v_punch) <> 'object' then raise exception 'bad type'; end if;                            -- ★2 0164
    for v_jk in select jsonb_object_keys(v_punch) loop                                                       -- ★2 0164
      if v_jk not in ('self','proxy','kiosk') or jsonb_typeof(v_punch->v_jk) <> 'boolean' then raise exception 'bad punch_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    v_punch := v_store.punch_methods || v_punch;                                                             -- ★2 0164: 無いキーは現値のまま
    if not (coalesce((v_punch->>'self')::boolean, false) or coalesce((v_punch->>'proxy')::boolean, false) or coalesce((v_punch->>'kiosk')::boolean, false)) then raise exception 'bad punch_methods'; end if;   -- ★2 0164: 1 つ以上
    v_before := v_before || jsonb_build_object('punch_methods', v_store.punch_methods);                      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('punch_methods', v_punch);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164

  -- ★3 0172（裁定349）: 精算方式＝monthly／half／weekly／daily（源泉の暦日数＝lib/nox/pay.ts periodDays が読む・既定 monthly＝欠損時）
  if p_patch ? 'settlement_cycle' then                                                                     -- ★3 0172
    if jsonb_typeof(p_patch->'settlement_cycle') <> 'string' then raise exception 'bad type'; end if;      -- ★3 0172
    v_cycle := p_patch->>'settlement_cycle';                                                               -- ★3 0172
    if v_cycle is null or v_cycle not in ('monthly','half','weekly','daily') then raise exception 'bad settlement_cycle'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('settlement_cycle', coalesce(v_settings->>'settlement_cycle', ''));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('settlement_cycle', v_cycle);                             -- ★3 0172
    v_settings := jsonb_set(v_settings, '{settlement_cycle}', to_jsonb(v_cycle), true);                    -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定349）: 途中払い＝none／advance（advance＝前払・仮払の口を出す・既定 none）
  if p_patch ? 'mid_pay' then                                                                              -- ★3 0172
    if jsonb_typeof(p_patch->'mid_pay') <> 'string' then raise exception 'bad type'; end if;               -- ★3 0172
    v_midpay := p_patch->>'mid_pay';                                                                       -- ★3 0172
    if v_midpay is null or v_midpay not in ('none','advance') then raise exception 'bad mid_pay'; end if;  -- ★3 0172
    v_before   := v_before || jsonb_build_object('mid_pay', coalesce(v_settings->>'mid_pay', ''));         -- ★3 0172
    v_after    := v_after  || jsonb_build_object('mid_pay', v_midpay);                                     -- ★3 0172
    v_settings := jsonb_set(v_settings, '{mid_pay}', to_jsonb(v_midpay), true);                            -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定380）: 送り返しの自動確定時間＝整数 0〜168（0＝自動確定しない・既定 0＝欠損時）。実行器（cron／RPC）は別起票＝ここは設定の器だけ
  if p_patch ? 'shift_auto_confirm_hours' then                                                             -- ★3 0172
    if jsonb_typeof(p_patch->'shift_auto_confirm_hours') <> 'number' then raise exception 'bad type'; end if;   -- ★3 0172
    v_autoh := (p_patch->>'shift_auto_confirm_hours')::numeric;                                            -- ★3 0172
    if v_autoh <> floor(v_autoh) or v_autoh < 0 or v_autoh > 168 then raise exception 'bad shift_auto_confirm_hours'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('shift_auto_confirm_hours', coalesce((v_settings->>'shift_auto_confirm_hours')::numeric, 0));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('shift_auto_confirm_hours', v_autoh::int);                -- ★3 0172
    v_settings := jsonb_set(v_settings, '{shift_auto_confirm_hours}', to_jsonb(v_autoh::int), true);       -- ★3 0172
  end if;                                                                                                  -- ★3 0172

  -- ★2 0173（裁定386）: 途中合流＝join_set（セット終了後の＋は合流セット行・既定）／extend_only（延長のみ）
  if p_patch ? 'join_mode' then                                                                            -- ★2 0173
    if jsonb_typeof(p_patch->'join_mode') <> 'string' then raise exception 'bad type'; end if;             -- ★2 0173
    v_join := p_patch->>'join_mode';                                                                       -- ★2 0173
    if v_join is null or v_join not in ('join_set','extend_only') then raise exception 'bad join_mode'; end if;   -- ★2 0173
    v_before   := v_before || jsonb_build_object('join_mode', coalesce(v_settings->>'join_mode', ''));     -- ★2 0173
    v_after    := v_after  || jsonb_build_object('join_mode', v_join);                                     -- ★2 0173
    v_settings := jsonb_set(v_settings, '{join_mode}', to_jsonb(v_join), true);                            -- ★2 0173
  end if;                                                                                                  -- ★2 0173
  -- ★3 0173（裁定389）: キャストのレジ端末＝store_device（店端末のみ＝kiosk_devices purpose 'register' の登録を流用・既定）／own_phone（自分のスマホからも）。cast_register_enabled（set_store_cast_register）が ON のときだけ効く
  if p_patch ? 'cast_register_device' then                                                                 -- ★3 0173
    if jsonb_typeof(p_patch->'cast_register_device') <> 'string' then raise exception 'bad type'; end if;  -- ★3 0173
    v_crdev := p_patch->>'cast_register_device';                                                           -- ★3 0173
    if v_crdev is null or v_crdev not in ('store_device','own_phone') then raise exception 'bad cast_register_device'; end if;   -- ★3 0173
    v_before   := v_before || jsonb_build_object('cast_register_device', coalesce(v_settings->>'cast_register_device', ''));   -- ★3 0173
    v_after    := v_after  || jsonb_build_object('cast_register_device', v_crdev);                         -- ★3 0173
    v_settings := jsonb_set(v_settings, '{cast_register_device}', to_jsonb(v_crdev), true);                -- ★3 0173
  end if;                                                                                                  -- ★3 0173
  -- ★6 0173（裁定393）: 支払方法別の手数料率＝object {card, emoney, other}（整数 0〜100・cash／ar は持たない・欠損キー＝0＝手数料なし。UI の新規店の初期値がカード 10）
  if p_patch ? 'pay_fee_rates' then                                                                        -- ★6 0173
    if jsonb_typeof(p_patch->'pay_fee_rates') <> 'object' then raise exception 'bad type'; end if;         -- ★6 0173
    v_pfr := p_patch->'pay_fee_rates';                                                                     -- ★6 0173
    for v_pfk in select jsonb_object_keys(v_pfr) loop                                                      -- ★6 0173
      if v_pfk not in ('card','emoney','other') then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      if jsonb_typeof(v_pfr->v_pfk) <> 'number' then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      v_pfv := (v_pfr->>v_pfk)::numeric;                                                                   -- ★6 0173
      if v_pfv <> floor(v_pfv) or v_pfv < 0 or v_pfv > 100 then raise exception 'bad pay_fee_rates'; end if;   -- ★6 0173
    end loop;                                                                                              -- ★6 0173
    v_before   := v_before || jsonb_build_object('pay_fee_rates', coalesce(v_settings->'pay_fee_rates', '{}'::jsonb));   -- ★6 0173
    v_after    := v_after  || jsonb_build_object('pay_fee_rates', v_pfr);                                  -- ★6 0173
    v_settings := jsonb_set(v_settings, '{pay_fee_rates}', v_pfr, true);                                   -- ★6 0173
  end if;                                                                                                  -- ★6 0173
  -- ★7 0173（裁定396）: 体入の保証日数＝整数 1〜90（既定 3＝欠損時・「体入を追加」の期限付き保証の日数）
  if p_patch ? 'trial_guarantee_days' then                                                                 -- ★7 0173
    if jsonb_typeof(p_patch->'trial_guarantee_days') <> 'number' then raise exception 'bad type'; end if;  -- ★7 0173
    v_tgd := (p_patch->>'trial_guarantee_days')::numeric;                                                  -- ★7 0173
    if v_tgd <> floor(v_tgd) or v_tgd < 1 or v_tgd > 90 then raise exception 'bad trial_guarantee_days'; end if;   -- ★7 0173
    v_before   := v_before || jsonb_build_object('trial_guarantee_days', coalesce((v_settings->>'trial_guarantee_days')::numeric, 3));   -- ★7 0173
    v_after    := v_after  || jsonb_build_object('trial_guarantee_days', v_tgd::int);                      -- ★7 0173
    v_settings := jsonb_set(v_settings, '{trial_guarantee_days}', to_jsonb(v_tgd::int), true);             -- ★7 0173
  end if;                                                                                                  -- ★7 0173
  -- ★7 0173（裁定396）: 本採用（体入→在籍）時の既定プラン＝自店の有効な comp_plans.id（null＝未設定＝UI は切替しない）
  if p_patch ? 'default_plan_id' then                                                                      -- ★7 0173
    if jsonb_typeof(p_patch->'default_plan_id') = 'null' then                                              -- ★7 0173
      v_dpid := null;                                                                                      -- ★7 0173
    else                                                                                                   -- ★7 0173
      if jsonb_typeof(p_patch->'default_plan_id') <> 'string' then raise exception 'bad type'; end if;     -- ★7 0173
      begin v_dpid := (p_patch->>'default_plan_id')::uuid; exception when others then raise exception 'bad default_plan_id'; end;   -- ★7 0173
      if not exists (select 1 from public.comp_plans c where c.id = v_dpid and c.store_id = p_store_id and c.org_id = v_org and c.is_active) then   -- ★7 0173
        raise exception 'bad default_plan_id';                                                             -- ★7 0173
      end if;                                                                                              -- ★7 0173
    end if;                                                                                                -- ★7 0173
    v_before   := v_before || jsonb_build_object('default_plan_id', v_settings->'default_plan_id');        -- ★7 0173
    v_after    := v_after  || jsonb_build_object('default_plan_id', v_dpid);                               -- ★7 0173
    v_settings := jsonb_set(v_settings, '{default_plan_id}', coalesce(to_jsonb(v_dpid), 'null'::jsonb), true);   -- ★7 0173
  end if;                                                                                                  -- ★7 0173

  -- ★3 0175（X13-I ②・便 SH-UI-a A-1）: 就業規則に減給の定めがある（雇用のノルマ未達の懲戒減給の提案を出す）＝boolean・既定 false＝欠損時
  if p_patch ? 'sys_wage_cut_rule' then
    if jsonb_typeof(p_patch->'sys_wage_cut_rule') <> 'boolean' then raise exception 'bad type'; end if;
    v_wcr := (p_patch->>'sys_wage_cut_rule')::boolean;
    v_before   := v_before || jsonb_build_object('sys_wage_cut_rule', coalesce((v_settings->>'sys_wage_cut_rule')::boolean, false));
    v_after    := v_after  || jsonb_build_object('sys_wage_cut_rule', v_wcr);
    v_settings := jsonb_set(v_settings, '{sys_wage_cut_rule}', to_jsonb(v_wcr), true);
  end if;
  -- ★3 0175（裁定404）: 達成ボーナス多段の計算＝max（到達した最上段のみ・既定＝欠損時）／sum（到達した全段の合計）
  if p_patch ? 'bonus_tier_mode' then
    if jsonb_typeof(p_patch->'bonus_tier_mode') <> 'string' then raise exception 'bad type'; end if;
    v_btm := p_patch->>'bonus_tier_mode';
    if v_btm is null or v_btm not in ('max','sum') then raise exception 'bad bonus_tier_mode'; end if;
    v_before   := v_before || jsonb_build_object('bonus_tier_mode', coalesce(v_settings->>'bonus_tier_mode', 'max'));
    v_after    := v_after  || jsonb_build_object('bonus_tier_mode', v_btm);
    v_settings := jsonb_set(v_settings, '{bonus_tier_mode}', to_jsonb(v_btm), true);
  end if;
  -- ★3 0175（裁定409）: 複数指名の卓の売上の分け方＝prorate（伝票ごとの分配率・既定＝欠損時）／equal（指名した全員で等分＝cast_sales_aggregate が ratio_weight>0 を 1 と読む）
  if p_patch ? 'sales_split' then
    if jsonb_typeof(p_patch->'sales_split') <> 'string' then raise exception 'bad type'; end if;
    v_split := p_patch->>'sales_split';
    if v_split is null or v_split not in ('prorate','equal') then raise exception 'bad sales_split'; end if;
    v_before   := v_before || jsonb_build_object('sales_split', coalesce(v_settings->>'sales_split', 'prorate'));
    v_after    := v_after  || jsonb_build_object('sales_split', v_split);
    v_settings := jsonb_set(v_settings, '{sales_split}', to_jsonb(v_split), true);
  end if;
  -- ★3 0175（裁定405）: 店の既定 pt 付与ルール（新規プランがコピーする）＝object（pt_rules_check と同じ形）
  if p_patch ? 'pt_rules_default' then
    if jsonb_typeof(p_patch->'pt_rules_default') <> 'object' then raise exception 'bad type'; end if;
    v_ptr := p_patch->'pt_rules_default';
    perform public.pt_rules_check(v_ptr);
    v_before   := v_before || jsonb_build_object('pt_rules_default', coalesce(v_settings->'pt_rules_default', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pt_rules_default', v_ptr);
    v_settings := jsonb_set(v_settings, '{pt_rules_default}', v_ptr, true);
  end if;

  -- ★8 0175（398 打刻設定＝BZ-R）: 列側 8 キー。判定は TS（route /api/punch/self）・DB は値の形だけ見る（BANZEN と同じ）
  if p_patch ? 'punch_enforce' then
    if jsonb_typeof(p_patch->'punch_enforce') <> 'boolean' then raise exception 'bad type'; end if;
    v_penf := (p_patch->>'punch_enforce')::boolean;
    v_before := v_before || jsonb_build_object('punch_enforce', v_store.punch_enforce);
    v_after  := v_after  || jsonb_build_object('punch_enforce', v_penf);
  end if;
  if p_patch ? 'punch_restrict_mode' then
    if jsonb_typeof(p_patch->'punch_restrict_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmode := p_patch->>'punch_restrict_mode';
    if v_pmode is null or v_pmode not in ('gps','ip','either','both','tablet') then raise exception 'bad punch_restrict_mode'; end if;
    v_before := v_before || jsonb_build_object('punch_restrict_mode', v_store.punch_restrict_mode);
    v_after  := v_after  || jsonb_build_object('punch_restrict_mode', v_pmode);
  end if;
  if p_patch ? 'punch_lat' then
    if jsonb_typeof(p_patch->'punch_lat') not in ('number','null') then raise exception 'bad type'; end if;
    v_plat := (p_patch->>'punch_lat')::double precision;
    if v_plat is not null and (v_plat < -90 or v_plat > 90) then raise exception 'bad punch_lat'; end if;
    v_before := v_before || jsonb_build_object('punch_lat', v_store.punch_lat);
    v_after  := v_after  || jsonb_build_object('punch_lat', v_plat);
  end if;
  if p_patch ? 'punch_lng' then
    if jsonb_typeof(p_patch->'punch_lng') not in ('number','null') then raise exception 'bad type'; end if;
    v_plng := (p_patch->>'punch_lng')::double precision;
    if v_plng is not null and (v_plng < -180 or v_plng > 180) then raise exception 'bad punch_lng'; end if;
    v_before := v_before || jsonb_build_object('punch_lng', v_store.punch_lng);
    v_after  := v_after  || jsonb_build_object('punch_lng', v_plng);
  end if;
  if p_patch ? 'punch_radius_m' then
    if jsonb_typeof(p_patch->'punch_radius_m') not in ('number','null') then raise exception 'bad type'; end if;
    v_prad := (p_patch->>'punch_radius_m')::numeric;
    if v_prad is not null and (v_prad <> floor(v_prad) or v_prad < 10 or v_prad > 100000) then raise exception 'bad punch_radius_m'; end if;
    v_before := v_before || jsonb_build_object('punch_radius_m', v_store.punch_radius_m);
    v_after  := v_after  || jsonb_build_object('punch_radius_m', v_prad::int);
  end if;
  if p_patch ? 'punch_require_shift' then
    if jsonb_typeof(p_patch->'punch_require_shift') <> 'string' then raise exception 'bad type'; end if;
    v_preq := p_patch->>'punch_require_shift';
    if v_preq is null or v_preq not in ('off','warn','block') then raise exception 'bad punch_require_shift'; end if;
    v_before := v_before || jsonb_build_object('punch_require_shift', v_store.punch_require_shift);
    v_after  := v_after  || jsonb_build_object('punch_require_shift', v_preq);
  end if;
  -- ★8 0175（398）: 勤務時間の丸め＝単位 1／5／10／15／30 と方向。単位を 1 より大きくする・方向を変える＝同意版（punch_round_consent_version）必須→punch_round_consents に 1 行（append-only）
  if p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then
    v_prunit := coalesce((p_patch->>'punch_round_unit')::numeric, v_store.punch_round_unit);
    v_prmode := coalesce(p_patch->>'punch_round_mode', v_store.punch_round_mode);
    if p_patch ? 'punch_round_unit' and jsonb_typeof(p_patch->'punch_round_unit') <> 'number' then raise exception 'bad type'; end if;
    if p_patch ? 'punch_round_mode' and jsonb_typeof(p_patch->'punch_round_mode') <> 'string' then raise exception 'bad type'; end if;
    if v_prunit is null or v_prunit not in (1,5,10,15,30) then raise exception 'bad punch_round_unit'; end if;
    if v_prmode is null or v_prmode not in ('staff_favor','store_favor','nearest') then raise exception 'bad punch_round_mode'; end if;
    if v_prunit::int <> v_store.punch_round_unit or v_prmode <> v_store.punch_round_mode then
      v_pcv := nullif(trim(coalesce(p_patch->>'punch_round_consent_version', '')), '');
      if v_prunit > 1 and v_pcv is null then raise exception 'consent required'; end if;
      select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
      insert into public.punch_round_consents (org_id, store_id, changed_by, old_unit, old_mode, new_unit, new_mode, consent_version)
      values (v_org, p_store_id, v_actor, v_store.punch_round_unit, v_store.punch_round_mode, v_prunit::int, v_prmode, v_pcv);
      v_before := v_before || jsonb_build_object('punch_round_unit', v_store.punch_round_unit, 'punch_round_mode', v_store.punch_round_mode);
      v_after  := v_after  || jsonb_build_object('punch_round_unit', v_prunit::int, 'punch_round_mode', v_prmode, 'punch_round_consent_version', v_pcv);
    end if;
  end if;
  -- ★8 0175（398）: ハード×位置を使う方法は位置と半径が必須（BANZEN の保存検証を DB にも）。Wi-Fi の必須は UI（store_wifi_add は別 RPC）
  if coalesce(v_penf, v_store.punch_enforce) and coalesce(v_pmode, v_store.punch_restrict_mode) in ('gps','both')
     and (coalesce(v_plat, v_store.punch_lat) is null or coalesce(v_plng, v_store.punch_lng) is null or coalesce(v_prad, v_store.punch_radius_m) is null) then
    raise exception 'range required';
  end if;

  -- ★11 0175 v2（CN-R ②）: 卓種別のサービス率＝object {"VIP":35}（席種 卓／カウンター／VIP・0〜100 の整数・無い席種は service_rate）＝列側。checks への凍結は開卓時に席種で選ぶ（check_open＝P175）
  if p_patch ? 'service_rate_by_seat' then
    if jsonb_typeof(p_patch->'service_rate_by_seat') <> 'object' then raise exception 'bad type'; end if;
    v_srs := p_patch->'service_rate_by_seat';
    for v_jk in select jsonb_object_keys(v_srs) loop
      if v_jk not in ('卓','カウンター','VIP') or jsonb_typeof(v_srs->v_jk) <> 'number' then raise exception 'bad service_rate_by_seat'; end if;
      if (v_srs->>v_jk)::numeric < 0 or (v_srs->>v_jk)::numeric > 100 or (v_srs->>v_jk)::numeric <> floor((v_srs->>v_jk)::numeric) then raise exception 'bad service_rate_by_seat'; end if;
    end loop;
    v_before := v_before || jsonb_build_object('service_rate_by_seat', v_store.service_rate_by_seat);
    v_after  := v_after  || jsonb_build_object('service_rate_by_seat', v_srs);
  end if;
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引＝object {cash, card, emoney, other}（%・0〜100・小数 1 桁・393 の pay_fee_rates の裏返し＝別キー）。check_pay が cash 等で割引行（fee_kind 'pay_discount'）を立てる
  if p_patch ? 'pay_discount_rates' then
    if jsonb_typeof(p_patch->'pay_discount_rates') <> 'object' then raise exception 'bad type'; end if;
    v_pdr := p_patch->'pay_discount_rates';
    for v_jk in select jsonb_object_keys(v_pdr) loop
      if v_jk not in ('cash','card','emoney','other') or jsonb_typeof(v_pdr->v_jk) <> 'number' then raise exception 'bad pay_discount_rates'; end if;
      if (v_pdr->>v_jk)::numeric < 0 or (v_pdr->>v_jk)::numeric > 100 or (v_pdr->>v_jk)::numeric <> round((v_pdr->>v_jk)::numeric, 1) then raise exception 'bad pay_discount_rates'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('pay_discount_rates', coalesce(v_settings->'pay_discount_rates', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pay_discount_rates', v_pdr);
    v_settings := jsonb_set(v_settings, '{pay_discount_rates}', v_pdr, true);
  end if;
  -- ★11 0175 v2（CN-R ⑨）: ドリンクバック（本数）の店スイッチ＝既定 true。false＝設定項目・レジの「誰のドリンクか」を出さず、ドリンクは小計の一部として指名種別の率で返る
  if p_patch ? 'sys_drink_count_back' then
    if jsonb_typeof(p_patch->'sys_drink_count_back') <> 'boolean' then raise exception 'bad type'; end if;
    v_sdcb := (p_patch->>'sys_drink_count_back')::boolean;
    v_before   := v_before || jsonb_build_object('sys_drink_count_back', coalesce((v_settings->>'sys_drink_count_back')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sys_drink_count_back', v_sdcb);
    v_settings := jsonb_set(v_settings, '{sys_drink_count_back}', to_jsonb(v_sdcb), true);
  end if;
  -- ★11 0175 v2（CN-R ⑩）: 「売上小計」の範囲＝due（今＝サ料込・丸め後・手数料除く）／pre_tax_service（税サ前・割引前・セット含む）＋指名料を含む（既定 true）
  if p_patch ? 'sales_subtotal_mode' then
    if jsonb_typeof(p_patch->'sales_subtotal_mode') <> 'string' then raise exception 'bad type'; end if;
    v_ssm := p_patch->>'sales_subtotal_mode';
    if v_ssm is null or v_ssm not in ('due','pre_tax_service') then raise exception 'bad sales_subtotal_mode'; end if;
    v_before   := v_before || jsonb_build_object('sales_subtotal_mode', coalesce(v_settings->>'sales_subtotal_mode', 'due'));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_mode', v_ssm);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_mode}', to_jsonb(v_ssm), true);
  end if;
  if p_patch ? 'sales_subtotal_includes_shimei' then
    if jsonb_typeof(p_patch->'sales_subtotal_includes_shimei') <> 'boolean' then raise exception 'bad type'; end if;
    v_ssis := (p_patch->>'sales_subtotal_includes_shimei')::boolean;
    v_before   := v_before || jsonb_build_object('sales_subtotal_includes_shimei', coalesce((v_settings->>'sales_subtotal_includes_shimei')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_includes_shimei', v_ssis);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_includes_shimei}', to_jsonb(v_ssis), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 週払い）: settlement_cycle 'weekly' のときの締日（曜日 0〜6）と支払日（締日から n 日後 0〜31）。monthly は pay_day（既存）
  if p_patch ? 'settlement_week_close_dow' then
    if jsonb_typeof(p_patch->'settlement_week_close_dow') <> 'number' then raise exception 'bad type'; end if;
    v_wcd := (p_patch->>'settlement_week_close_dow')::numeric;
    if v_wcd <> floor(v_wcd) or v_wcd < 0 or v_wcd > 6 then raise exception 'bad settlement_week_close_dow'; end if;
    v_before   := v_before || jsonb_build_object('settlement_week_close_dow', v_settings->'settlement_week_close_dow');
    v_after    := v_after  || jsonb_build_object('settlement_week_close_dow', v_wcd::int);
    v_settings := jsonb_set(v_settings, '{settlement_week_close_dow}', to_jsonb(v_wcd::int), true);
  end if;
  if p_patch ? 'settlement_pay_days_after' then
    if jsonb_typeof(p_patch->'settlement_pay_days_after') <> 'number' then raise exception 'bad type'; end if;
    v_pda := (p_patch->>'settlement_pay_days_after')::numeric;
    if v_pda <> floor(v_pda) or v_pda < 0 or v_pda > 31 then raise exception 'bad settlement_pay_days_after'; end if;
    v_before   := v_before || jsonb_build_object('settlement_pay_days_after', v_settings->'settlement_pay_days_after');
    v_after    := v_after  || jsonb_build_object('settlement_pay_days_after', v_pda::int);
    v_settings := jsonb_set(v_settings, '{settlement_pay_days_after}', to_jsonb(v_pda::int), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 日払いの上限）: 勤務時間で上限が変わる表＝array [{hours_min, cap}]（hours_min 昇順・cap 円・最大 10 段・空＝上限なし）。daily_pay_issue が p_worked_hours で読む
  -- ★24 0175 v2（裁定421 候補）: スタッフの割引・手数料カット＝0 承認制（既定）／1 上限内は即時／2 不可。上限＝staff_discount_cap（円・整数 ≥0）
  if p_patch ? 'sys_staff_discount' then
    if jsonb_typeof(p_patch->'sys_staff_discount') <> 'number' then raise exception 'bad type'; end if;
    v_ssd := (p_patch->>'sys_staff_discount')::numeric;
    if v_ssd <> floor(v_ssd) or v_ssd < 0 or v_ssd > 2 then raise exception 'bad sys_staff_discount'; end if;
    v_before   := v_before || jsonb_build_object('sys_staff_discount', v_settings->'sys_staff_discount');
    v_after    := v_after  || jsonb_build_object('sys_staff_discount', v_ssd::int);
    v_settings := jsonb_set(v_settings, '{sys_staff_discount}', to_jsonb(v_ssd::int), true);
  end if;
  if p_patch ? 'staff_discount_cap' then
    if jsonb_typeof(p_patch->'staff_discount_cap') <> 'number' then raise exception 'bad type'; end if;
    v_sdc := (p_patch->>'staff_discount_cap')::numeric;
    if v_sdc <> floor(v_sdc) or v_sdc < 0 or v_sdc > 10000000 then raise exception 'bad staff_discount_cap'; end if;
    v_before   := v_before || jsonb_build_object('staff_discount_cap', v_settings->'staff_discount_cap');
    v_after    := v_after  || jsonb_build_object('staff_discount_cap', v_sdc::int);
    v_settings := jsonb_set(v_settings, '{staff_discount_cap}', to_jsonb(v_sdc::int), true);
  end if;
  -- ★25 0175 v2（裁定420）: キャストのレジ使用＝0 OFF／1 注文のみ／2 会計まで（旧 cast_register_enabled は互換で残す＝set_store_cast_register が両方を書く）
  if p_patch ? 'sys_cast_register' then
    if jsonb_typeof(p_patch->'sys_cast_register') <> 'number' then raise exception 'bad type'; end if;
    v_scr := (p_patch->>'sys_cast_register')::numeric;
    if v_scr <> floor(v_scr) or v_scr < 0 or v_scr > 2 then raise exception 'bad sys_cast_register'; end if;
    v_before   := v_before || jsonb_build_object('sys_cast_register', v_settings->'sys_cast_register', 'cast_register_enabled', v_settings->'cast_register_enabled');
    v_after    := v_after  || jsonb_build_object('sys_cast_register', v_scr::int, 'cast_register_enabled', (v_scr > 0));
    v_settings := jsonb_set(jsonb_set(v_settings, '{sys_cast_register}', to_jsonb(v_scr::int), true), '{cast_register_enabled}', to_jsonb(v_scr > 0), true);
  end if;
  -- ★27 0175 v2（裁定423 候補）: キオスクで使える機能＝{punch, register, shift}（boolean・無いキーは true）・無操作で自動ロックする秒数（60〜900・既定 180）
  if p_patch ? 'kiosk_features' then
    if jsonb_typeof(p_patch->'kiosk_features') <> 'object' then raise exception 'bad type'; end if;
    v_kf := p_patch->'kiosk_features';
    if exists (select 1 from jsonb_each(v_kf) e where e.key not in ('punch','register','shift') or jsonb_typeof(e.value) <> 'boolean') then raise exception 'bad kiosk_features'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_features', v_settings->'kiosk_features');
    v_after    := v_after  || jsonb_build_object('kiosk_features', v_kf);
    v_settings := jsonb_set(v_settings, '{kiosk_features}', v_kf, true);
  end if;
  if p_patch ? 'kiosk_idle_sec' then
    if jsonb_typeof(p_patch->'kiosk_idle_sec') <> 'number' then raise exception 'bad type'; end if;
    v_kis := (p_patch->>'kiosk_idle_sec')::numeric;
    if v_kis <> floor(v_kis) or v_kis < 60 or v_kis > 900 then raise exception 'bad kiosk_idle_sec'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_idle_sec', v_settings->'kiosk_idle_sec');
    v_after    := v_after  || jsonb_build_object('kiosk_idle_sec', v_kis::int);
    v_settings := jsonb_set(v_settings, '{kiosk_idle_sec}', to_jsonb(v_kis::int), true);
  end if;
  if p_patch ? 'daily_pay_cap_tiers' then
    if jsonb_typeof(p_patch->'daily_pay_cap_tiers') <> 'array' then raise exception 'bad type'; end if;
    v_dct := p_patch->'daily_pay_cap_tiers';
    if jsonb_array_length(v_dct) > 10 then raise exception 'bad daily_pay_cap_tiers'; end if;
    v_prevh := null;
    for v_pe in select * from jsonb_array_elements(v_dct) loop
      if jsonb_typeof(v_pe) <> 'object' or jsonb_typeof(v_pe->'hours_min') <> 'number' or jsonb_typeof(v_pe->'cap') <> 'number' then raise exception 'bad daily_pay_cap_tiers'; end if;
      if (v_pe->>'hours_min')::numeric < 0 or (v_pe->>'cap')::numeric < 0 or (v_pe->>'cap')::numeric <> floor((v_pe->>'cap')::numeric) then raise exception 'bad daily_pay_cap_tiers'; end if;
      if v_prevh is not null and (v_pe->>'hours_min')::numeric <= v_prevh then raise exception 'bad daily_pay_cap_tiers'; end if;
      v_prevh := (v_pe->>'hours_min')::numeric;
    end loop;
    v_before   := v_before || jsonb_build_object('daily_pay_cap_tiers', coalesce(v_settings->'daily_pay_cap_tiers', '[]'::jsonb));
    v_after    := v_after  || jsonb_build_object('daily_pay_cap_tiers', v_dct);
    v_settings := jsonb_set(v_settings, '{daily_pay_cap_tiers}', v_dct, true);
  end if;

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    invoice_registered_on = case when p_patch ? 'invoice_registered_on' then v_inv_on  else invoice_registered_on end,   -- ★2 0164
    pay_day            = case when p_patch ? 'pay_day'            then v_pay_day::int else pay_day end,                   -- ★2 0164
    tax_inclusive_display = case when p_patch ? 'tax_inclusive_display' then v_tax_inc else tax_inclusive_display end,   -- ★2 0164
    use_vip            = case when p_patch ? 'use_vip'            then v_use_vip else use_vip end,                        -- ★2 0164
    use_counter        = case when p_patch ? 'use_counter'        then v_use_ctr else use_counter end,                    -- ★2 0164
    payment_methods    = case when p_patch ? 'payment_methods'    then v_paym    else payment_methods end,                -- ★2 0164
    punch_methods      = case when p_patch ? 'punch_methods'      then v_punch   else punch_methods end,                  -- ★2 0164
    punch_enforce       = case when p_patch ? 'punch_enforce'       then v_penf  else punch_enforce end,                     -- ★8 0175（398）
    punch_restrict_mode = case when p_patch ? 'punch_restrict_mode' then v_pmode else punch_restrict_mode end,               -- ★8 0175
    punch_lat           = case when p_patch ? 'punch_lat'           then v_plat  else punch_lat end,                         -- ★8 0175
    punch_lng           = case when p_patch ? 'punch_lng'           then v_plng  else punch_lng end,                         -- ★8 0175
    punch_radius_m      = case when p_patch ? 'punch_radius_m'      then v_prad::int else punch_radius_m end,                -- ★8 0175
    punch_require_shift = case when p_patch ? 'punch_require_shift' then v_preq  else punch_require_shift end,               -- ★8 0175
    punch_round_unit    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prunit::smallint else punch_round_unit end,   -- ★8 0175
    punch_round_mode    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prmode else punch_round_mode end,   -- ★8 0175
    service_rate_by_seat = case when p_patch ? 'service_rate_by_seat' then v_srs else service_rate_by_seat end,                      -- ★11 0175 v2（CN-R ②）
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- ═══ ⑩ referral_recalc（内部・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.referral_recalc(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_base int := 0; v_amt int := 0;
begin
  select cr.id, cr.method, cr.value, cr.frozen_at, c.people
    into r
    from public.check_referrals cr
    join public.checks c on c.id = cr.check_id and c.org_id = cr.org_id   -- ★8: org 条件は自ら含める（防御深度）
   where cr.check_id = p_check_id;
  if not found then return; end if;
  if r.frozen_at is not null then return; end if;   -- ★8: 会計確定後は触らない
  if r.method = 'set_rate' then
    -- ★8（298-1）: 母数＝kind='set' の line_total 合計（割引前・全 pay_group）・bp・floor
    select coalesce(sum(line_total), 0)::int into v_base from public.check_lines where check_id = p_check_id and kind = 'set';
    v_amt := floor(v_base * r.value / 10000.0)::int;
  elsif r.method = 'account_rate' then
    -- ★8（298-1）: 母数＝全 pay_group の割引後小計（kind<>'discount' − discount・vip_charge を含む・紹介料自身は行ではないので含まれない）・bp・floor
    select greatest(0, coalesce(sum(case when kind = 'discount' then -line_total else line_total end) filter (where fee_kind is distinct from 'pay_discount_total'), 0))::int into v_base   -- ★0187（便 CASH）: 「合計から」の割引は母数に入れない
      from public.check_lines where check_id = p_check_id;
    v_amt := floor(v_base * r.value / 10000.0)::int;
  elsif r.method = 'fixed_per_person' then
    v_amt := r.value * coalesce(r.people, 1);   -- ★8（要裁定(2)）: people null は 1 人扱い
  else
    v_amt := r.value;                            -- fixed_per_group
  end if;
  update public.check_referrals set amount = v_amt where id = r.id and amount is distinct from v_amt;
end $function$;

-- ═══ ⑪ remove_store_special_day ═══
CREATE OR REPLACE FUNCTION public.remove_store_special_day(p_store_id uuid, p_day date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★1（W-10 #10）: 特別日の削除（曜日の設定に戻る）
declare
  v_org uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;   -- ★0187: set_store_special_day と揃える（0186 締めの候補）
  select to_jsonb(d) into v_before from public.store_special_days d where d.store_id = p_store_id and d.day = p_day;
  if v_before is null then raise exception 'not found'; end if;
  delete from public.store_special_days where store_id = p_store_id and day = p_day;
  perform public.audit_log_write('remove_store_special_day', 'store_special_days:' || (v_before->>'id'), v_before, null, p_store_id);
end $function$;

commit;

-- ===== verify =====（Success の後に貼る・SELECT のみ）
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all select 'fee_kind check has pay_discount_total', (pg_get_constraintdef(oid) like '%pay_discount_total%')::text from pg_constraint where conname = 'check_lines_fee_kind_check'
union all select 'helpers 2 (acl postgres only)', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ext_menu_build','ext_menu_pick') and coalesce(proacl::text, '') = '{postgres=X/postgres}'
union all select 'check_pay args', string_agg(pronargs::text, ',') from pg_proc where pronamespace = 'public'::regnamespace and proname = 'check_pay'
union all select 'check_pay acl', proacl::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'check_pay'
union all select 'has 0187 (8 fns)', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%★0187%' and proname in ('check_open','check_move_seat','check_extension_add','check_time_charge_apply','check_group_due','check_pay','set_store_profile','referral_recalc','remove_store_special_day')
union all select 'md5 ' || proname, left(md5(replace(prosrc, chr(13), '')), 8) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ext_menu_build','ext_menu_pick','check_open','check_move_seat','check_extension_add','check_time_charge_apply','check_group_due','check_pay','set_store_profile','referral_recalc','remove_store_special_day')
order by 1;
-- ===== end 0187 =====
