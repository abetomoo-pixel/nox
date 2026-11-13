-- 0201d_special_open.sql（2026-11-12・裁定478＝臨時営業／臨時休業を営業日で持つ・追加の決まり＝その営業日に卓が 1 つでもあれば臨時営業の登録は変更も取消もできない（2026-11-12 相談役）・貼らない＝合図は相談役）
-- ★1 store_special_days に price_dow（臨時営業の料金の曜日・営業時間と同じ 0＝日..6＝土・kind が open のときだけ）。本番の行は 0（2026-11-12 読取）。
-- ★2 store_day_has_checks（その営業日に卓があるか＝内部専用・4 ロール revoke）
-- ★3 biz_minutes_of＝曜日を決める 1 か所。臨時営業で price_dow があれば (price_dow + 6) % 7。pricing_resolve_core／ext_menu_build／延長・移動・時間課金はここを通る＝触らない。金額の式は変えない。
-- ★4 check_open＝既存の open の再利用の後に門（臨時休業＝'closed day'・定休日で臨時営業が無い＝'needs special open'）。reservation_to_check も check_open を通る。
-- ★5 set_store_special_day＝p_price_dow を足す（署名が変わる＝旧 6 引数を drop して作り直し・revoke／grant を付け直す）・過去の営業日＝'past day'・卓がある営業日の種類と曜日の変更＝'day has checks'・定休の曜日は 'bad price dow'
-- ★6 remove_store_special_day＝過去の営業日＝'past day'・卓がある営業日＝'day has checks'（同じ署名・ACL 不変）
-- ★7 register_special_open（新設・公開）＝当日の臨時営業の登録（owner／自店の manager／店の端末の操作者が店長以上）・監査 'register_special_open'
-- 列 +1・関数 +2（register_special_open・store_day_has_checks）・作り直し 4（set_store_special_day は drop＋create）・表 121 不変。
-- client（次の便）＝components/nox/special-days-panel.tsx:39 の p_price_dow・開卓のモーダルの臨時営業の問い・日報の印・lib/nox/register/open-estimate.ts の曜日（M-192 と同じ所）・errJa の文言。
-- 翻訳元: live pg_get_functiondef（2026-11-12・0201b 適用後＝関数 431／表 121・biz_minutes_of b0e1c1da／check_open 2917cd50／set_store_special_day c79f75e9／remove_store_special_day 7201f28a）＋生成器 docs/tmp/gen_0201d.cjs（アンカー置換）。
--   0201c／0201h／0201e／0201g は上の 4 本に触れない（2026-11-12 照合）。0201f／0201i は未起草＝事前確認の md5 で止める。
-- 検証クエリ: docs/tmp/0201d_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）・事前確認: docs/tmp/0201d_precheck.sql
begin;
set local lock_timeout = '10s';

-- ═══ ★1 store_special_days.price_dow ═══
alter table public.store_special_days add column price_dow smallint;
alter table public.store_special_days add constraint store_special_days_price_dow_check check (price_dow is null or (kind = 'open' and price_dow between 0 and 6));
comment on column public.store_special_days.price_dow is '★0201d（裁定478）: 臨時営業の料金の曜日（0＝日..6＝土＝store_business_hours.dow と同じ）。biz_minutes_of がこの曜日で料金ルールを探す。null＝その日の曜日のまま';

-- ═══ ★2 store_day_has_checks（内部専用） ═══
create or replace function public.store_day_has_checks(p_store_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- ★0201d（裁定478 追加の決まり）: その営業日（biz_date_of＝締めの時刻で切る）に卓（checks・状態を問わない＝取消・合流も含む）が 1 つでもあるか。
  --   started_at の前後の幅で索引（checks_store_started_idx）を使ってから営業日で絞る。
  select exists (
    select 1 from public.checks c
     where c.store_id = p_store_id
       and c.started_at >= ((p_day - 1)::timestamp at time zone 'Asia/Tokyo')
       and c.started_at <  ((p_day + 3)::timestamp at time zone 'Asia/Tokyo')
       and public.biz_date_of(c.store_id, c.started_at) = p_day)
$function$;
revoke execute on function public.store_day_has_checks(uuid, date) from public, anon, authenticated, service_role;

-- ═══ ★3 biz_minutes_of（同じ署名・ACL 不変＝内部専用） ═══
CREATE OR REPLACE FUNCTION public.biz_minutes_of(p_store_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(biz_dow smallint, biz_min integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_settings jsonb;
  v_cutoff   text;
  v_cut_min  integer;
  v_local    timestamp;
  v_clock    integer;
  v_bizdate  date;
  -- ★0201d（裁定478）: 臨時営業の料金の曜日（store_special_days.price_dow＝営業時間と同じ 0＝日..6＝土）
  v_pdow     smallint;
begin
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  if not found then raise exception 'forbidden'; end if;

  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad store settings';
  end if;
  v_cut_min := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;

  v_local := p_at at time zone 'Asia/Tokyo';
  v_clock := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;

  -- 営業日の暦日 = (現地時刻 - cutoff) の日付
  v_bizdate := (v_local - make_interval(mins => v_cut_min))::date;

  -- ★0201d（裁定478）: その営業日が臨時営業（kind open）で料金の曜日（price_dow）があれば、その曜日として料金ルールを探す（price_dow は 0＝日 → biz_dow は 0＝月 に変換＝(price_dow + 6) % 7）
  select ((sd.price_dow + 6) % 7)::smallint into v_pdow from public.store_special_days sd
   where sd.store_id = p_store_id and sd.day = v_bizdate and sd.kind = 'open' and sd.price_dow is not null;
  biz_dow := coalesce(v_pdow, (extract(isodow from v_bizdate)::int - 1)::smallint);  -- 0=月..6=日
  biz_min := case when v_clock < v_cut_min then v_clock + 1440 else v_clock end;
  return next;
end $function$;

-- ═══ ★4 check_open（同じ署名・ACL 不変） ═══
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

-- ═══ ★5 set_store_special_day（署名が変わる＝旧版を drop） ═══
drop function public.set_store_special_day(uuid, date, text, text, text, text);
CREATE OR REPLACE FUNCTION public.set_store_special_day(p_store_id uuid, p_day date, p_kind text, p_open_hm text DEFAULT NULL::text, p_close_hm text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_price_dow integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★1（W-10 #10）: 特別日の登録・変更（owner／manager 自店）
-- ★0201d（裁定478）: p_price_dow（臨時営業の料金の曜日・0＝日..6＝土）を足す・過去の営業日は編集できない・その営業日に卓があれば種類と料金の曜日は変えられない
declare
  v_org uuid; v_id uuid; v_before jsonb; v_uid uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if p_day is null then raise exception 'bad date'; end if;
  if p_kind is null or p_kind not in ('closed','open') then raise exception 'bad kind'; end if;
  if p_kind = 'open' and (p_open_hm is null or p_close_hm is null) then raise exception 'bad time'; end if;
  if p_note is not null and length(p_note) > 100 then raise exception 'bad note'; end if;
  -- ★0201d: 料金の曜日は臨時営業（open）だけ・0〜6・営業時間で定休の曜日は選べない
  if p_price_dow is not null and (p_kind <> 'open' or p_price_dow < 0 or p_price_dow > 6) then raise exception 'bad price dow'; end if;
  if p_price_dow is not null and coalesce((select bh.is_closed from public.store_business_hours bh where bh.store_id = p_store_id and bh.dow = p_price_dow), false) then raise exception 'bad price dow'; end if;
  -- ★0201d: 過去の営業日は編集できない（今日の営業日＝biz_date_of(now()) は編集できる）
  if p_day < public.biz_date_of(p_store_id, now()) then raise exception 'past day'; end if;
  select to_jsonb(d) into v_before from public.store_special_days d where d.store_id = p_store_id and d.day = p_day;
  -- ★0201d（裁定478 追加の決まり・2026-11-12）: その営業日に卓が 1 つでもあれば、種類（臨時営業／臨時休業）と料金の曜日は変えられない（同じ種類・同じ曜日のまま時刻とメモを直すのはよい）
  if ((v_before->>'kind') is distinct from p_kind or (v_before->>'price_dow')::int is distinct from p_price_dow)
     and public.store_day_has_checks(p_store_id, p_day) then
    raise exception 'day has checks';
  end if;
  select id into v_uid from public.users where auth_user_id = auth.uid();
  insert into public.store_special_days (org_id, store_id, day, kind, open_hm, close_hm, note, set_by, set_at, price_dow)
  values (v_org, p_store_id, p_day, p_kind, case when p_kind = 'open' then p_open_hm end, case when p_kind = 'open' then p_close_hm end, nullif(trim(coalesce(p_note, '')), ''), v_uid, now(), p_price_dow::smallint)
  on conflict (store_id, day) do update set kind = excluded.kind, open_hm = excluded.open_hm, close_hm = excluded.close_hm, note = excluded.note, set_by = excluded.set_by, set_at = now(), price_dow = excluded.price_dow
  returning id into v_id;
  perform public.audit_log_write('set_store_special_day', 'store_special_days:' || v_id::text, v_before,
    (select to_jsonb(d) from public.store_special_days d where d.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_store_special_day(uuid, date, text, text, text, text, integer) from public, anon;
grant execute on function public.set_store_special_day(uuid, date, text, text, text, text, integer) to authenticated;

-- ═══ ★6 remove_store_special_day（同じ署名・ACL 不変） ═══
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
  -- ★0201d（裁定478・追加の決まり 2026-11-12）: 過去の営業日は消せない・その営業日に卓が 1 つでもあれば消せない（臨時営業の取消も臨時休業の取消も）
  if p_day < public.biz_date_of(p_store_id, now()) then raise exception 'past day'; end if;
  if public.store_day_has_checks(p_store_id, p_day) then raise exception 'day has checks'; end if;
  delete from public.store_special_days where store_id = p_store_id and day = p_day;
  perform public.audit_log_write('remove_store_special_day', 'store_special_days:' || (v_before->>'id'), v_before, null, p_store_id);
end $function$;

-- ═══ ★7 register_special_open（新設） ═══
create or replace function public.register_special_open(p_store_id uuid, p_price_dow integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
-- ★0201d（裁定478）: 当日の臨時営業の登録＝定休日（または臨時休業）の今日の営業日に、店長以上が「料金は何曜日と同じか」を選んで開卓できるようにする。
--   営業日＝biz_date_of(now())。その日が定休日（shift_is_closed_day が true）のときだけ・同じ曜日で登録済みなら同じ id を返す（監査なし）。
--   人のセッション＝owner／自店の manager。店の端末（kiosk）＝端末の店で、操作者（auth_kiosk_operator）の在籍が owner／admin（同じ org の店）か自店の manager。キャストとスタッフは forbidden。
--   開店・閉店の時刻＝選んだ曜日の営業時間（無ければ 20:00〜25:00）。メモは触らない。
declare
  v_org uuid; v_store_org uuid; v_day date; v_id uuid; v_before jsonb; v_actor uuid;
  v_open text; v_close text; v_ok boolean := false;
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then raise exception 'forbidden'; end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select s.org_id into v_store_org from public.stores s where s.id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  if public.auth_org_id() is not null then
    v_ok := public.auth_role() = 'owner'
         or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id());
  elsif p_store_id = public.auth_kiosk_register_store_id() then
    v_actor := public.auth_kiosk_operator();
    v_ok := v_actor is not null and exists (
      select 1 from public.memberships m
        join public.users u on u.id = m.user_id
        join public.stores ms on ms.id = m.store_id
       where m.user_id = v_actor and m.is_active and u.is_active
         and ((m.role in ('owner','admin') and ms.org_id = v_org)
              or (m.role = 'manager' and m.store_id = p_store_id)));
  end if;
  if not coalesce(v_ok, false) then raise exception 'forbidden'; end if;
  if p_price_dow is null or p_price_dow < 0 or p_price_dow > 6 then raise exception 'bad price dow'; end if;
  if coalesce((select bh.is_closed from public.store_business_hours bh where bh.store_id = p_store_id and bh.dow = p_price_dow), false) then
    raise exception 'bad price dow';
  end if;
  v_day := public.biz_date_of(p_store_id, now());
  select to_jsonb(d) into v_before from public.store_special_days d where d.store_id = p_store_id and d.day = v_day;
  if (v_before->>'kind') = 'open' and (v_before->>'price_dow')::int = p_price_dow then
    return (v_before->>'id')::uuid;
  end if;
  if not public.shift_is_closed_day(p_store_id, v_day) then raise exception 'not closed day'; end if;
  select left(bh.open_hm, 5), left(bh.close_hm, 5) into v_open, v_close
    from public.store_business_hours bh where bh.store_id = p_store_id and bh.dow = p_price_dow;
  if v_open is null or v_close is null then v_open := '20:00'; v_close := '25:00'; end if;
  if v_actor is null then
    select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  end if;
  insert into public.store_special_days (org_id, store_id, day, kind, open_hm, close_hm, note, set_by, set_at, price_dow)
  values (v_org, p_store_id, v_day, 'open', v_open, v_close, null, v_actor, now(), p_price_dow::smallint)
  on conflict (store_id, day) do update set kind = 'open', open_hm = excluded.open_hm, close_hm = excluded.close_hm,
    set_by = excluded.set_by, set_at = now(), price_dow = excluded.price_dow
  returning id into v_id;
  perform public.audit_log_write('register_special_open', 'store_special_days:' || v_id::text, v_before,
    (select to_jsonb(d) from public.store_special_days d where d.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.register_special_open(uuid, integer) from public, anon;
grant execute on function public.register_special_open(uuid, integer) to authenticated;
commit;
