// ★0203 版 2（相談役 11/23 14:10 の ■2-a）: 1 店目から 2 店目へ写すときの「写す鍵・写す列の名簿」（DB を知らない定数）。
//   part＝どの写しのときに写すか（pricing 料金／comp 待遇／settings 店舗設定／hours 営業時間）・null＝写さない（店ごと・会社で 1 つ・端末・LINE・位置・印）。
//   名簿に無い鍵は写さない。SQL（0203 の store_copy_settings）の名簿はこのファイルと同じであること（検査 nox-multi-store が突き合わせる）。
//   鍵を足したのに名簿に入れ忘れたら赤（検査が set_store_profile の白名単・本番の settings_json の鍵・コードの読取の鍵を全部この名簿と照らす）。
import type { StoreCopyPart } from "@/lib/nox/ops/store-add";

/** needs＝★版 3（相談役 11/23 16:40 の ■2-c）: 対になる値（端末・同意・LINE・位置・シフト）を写さないのに、設定だけ写すもの＝表に印を付ける（移すかは相談役が決める） */
export type CopyClass = { part: StoreCopyPart | null; why: string; needs?: string };

/** stores.settings_json の鍵 */
export const STORE_SETTING_KEYS: Readonly<Record<string, CopyClass>> = {
  // ── 店ごと・印（写さない） ──
  name: { part: null, why: "店名＝店ごと（運営が店を足すときに入れる）" },
  short: { part: null, why: "店の略称＝店ごと" },
  store_code: { part: null, why: "店のコード＝店ごと" },
  display_name: { part: null, why: "表示名＝店ごと" },
  biz_type: { part: null, why: "業態＝運営が店を足すときに入れる" },
  setup_done: { part: null, why: "初期設定の印＝店ごと" },
  contract_ack_rev: { part: null, why: "契約の版＝店ごとに改める" },
  use_vip: { part: null, why: "VIP 席の有無＝席は写さない（2 店目の席から決める）" },
  use_counter: { part: null, why: "カウンター席の有無＝席は写さない" },
  pay_day: { part: null, why: "支払日＝会社で 1 つ（orgs.pay_day・set_org_pay_day）" },
  receipt_address: { part: null, why: "領収書の住所＝店ごと" },
  receipt_tel: { part: null, why: "領収書の電話＝店ごと" },
  // ── 端末・LINE・位置（写さない） ──
  cast_register_device: { part: null, why: "キャストのレジ端末＝端末は店ごと" },
  kiosk_features: { part: null, why: "キオスクの機能＝端末は店ごと" },
  kiosk_idle_sec: { part: null, why: "キオスクの待ち時間＝端末は店ごと" },
  kiosk_person_idle_minutes: { part: null, why: "キオスクの本人の待ち時間＝端末は店ごと" },
  printer_enabled: { part: null, why: "プリンタ＝端末は店ごと" },
  line_notify: { part: null, why: "LINE の知らせ＝LINE は店ごと" },
  punch_lat: { part: null, why: "打刻の位置＝店ごと" },
  punch_lng: { part: null, why: "打刻の位置＝店ごと" },
  punch_radius_m: { part: null, why: "打刻の位置の半径＝店ごと" },
  punch_round_consent_version: { part: null, why: "丸めの同意の版＝店ごとに同意を取る" },
  // ── 料金（pricing） ──
  join_mode: { part: "pricing", why: "合流の料金の付け方" },
  service_rate_by_seat: { part: "pricing", why: "席種ごとのサービス料" },
  // ── 待遇（comp） ──
  sys_hourly: { part: "comp", why: "制度：時給" }, sys_backs: { part: "comp", why: "制度：バック" }, sys_sales_rate: { part: "comp", why: "制度：売上歩合" },
  sys_points: { part: "comp", why: "制度：ポイント" }, sys_sales_slide: { part: "comp", why: "制度：売上スライド" }, sys_point_slide: { part: "comp", why: "制度：ポイントスライド" },
  sys_norms: { part: "comp", why: "制度：ノルマ" }, sys_penalties: { part: "comp", why: "制度：罰金" }, sys_bonus: { part: "comp", why: "制度：賞与" },
  sys_wage_cut_rule: { part: "comp", why: "制度：減給の決まり" }, sys_drink_count_back: { part: "comp", why: "制度：ドリンクの杯数バック" },
  sys_staff_discount: { part: "comp", why: "制度：スタッフ割" }, sys_cast_register: { part: "comp", why: "制度：キャストのレジ使用", needs: "キャストのレジ端末（cast_register_device）と店の端末＝写さない。端末が無い間は使えない" },
  cast_register_enabled: { part: "comp", why: "キャストのレジ使用（旧鍵・sys_cast_register と対）" },
  staff_discount_cap: { part: "comp", why: "スタッフ割の上限" },
  reward_axis: { part: "comp", why: "報酬の軸" }, sales_basis: { part: "comp", why: "売上の基準" }, sales_back_default_off: { part: "comp", why: "既定の売上歩合を止める" },
  sales_split: { part: "comp", why: "売上の按分" }, sales_subtotal_mode: { part: "comp", why: "小計の扱い" }, sales_subtotal_includes_shimei: { part: "comp", why: "小計に指名料を含める" },
  slide_apply: { part: "comp", why: "スライドの適用" }, norm_axes: { part: "comp", why: "ノルマの軸" }, bonus_tier_mode: { part: "comp", why: "賞与の段" },
  kind_back_rate: { part: "comp", why: "種別ごとのバック率" }, pt_rules_default: { part: "comp", why: "ポイントの既定" },
  trial_guarantee_days: { part: "comp", why: "体入の保証日数" }, trial_wage: { part: "comp", why: "体入の時給" }, trial_back: { part: "comp", why: "体入のバック" },
  default_plan_id: { part: "comp", why: "既定のプラン（写した後の ID に付け替える）" },
  pay_time_basis: { part: "comp", why: "時給の時間の基準" }, pay_time_basis_next: { part: "comp", why: "時間の基準の次の値" }, pay_time_basis_next_from: { part: "comp", why: "時間の基準の切替日" },
  withholding_default_cast: { part: "comp", why: "キャストの源泉の既定" }, withholding_default_staff: { part: "comp", why: "スタッフの源泉の既定" },
  mid_pay: { part: "comp", why: "途中払い" },
  sales_norm_enabled: { part: "comp", why: "売上ノルマ（旧鍵）" }, shimei_norm_enabled: { part: "comp", why: "指名ノルマ（旧鍵）" }, shimei_norm_scope: { part: "comp", why: "指名の数え方" },
  // ── 店舗設定（settings） ──
  billing_mode: { part: "settings", why: "会計の方式" }, ext_shimei_enabled: { part: "pricing", why: "延長の指名（列と同じ）" }, dohan_auto_hon: { part: "pricing", why: "同伴を本指名に（列と同じ）" },
  show_open_status: { part: "settings", why: "営業中の表示" }, shift_cast_confirm: { part: "settings", why: "シフトのキャスト確認" }, shift_auto_confirm_hours: { part: "settings", why: "シフトの自動確定" },
  settlement_presets: { part: "settings", why: "精算の既定" }, settlement_cycle: { part: "settings", why: "精算方式" }, settlement_week_close_dow: { part: "settings", why: "週締めの曜日" },
  settlement_pay_days_after: { part: "settings", why: "週払いの支払日" }, settlement_close_day: { part: "settings", why: "締め日（月末固定・鍵だけ）" }, daily_pay_cap_tiers: { part: "settings", why: "日払いの上限" },
  customer_purpose: { part: "settings", why: "顧客情報の利用目的" }, customer_retention_years: { part: "settings", why: "顧客情報の保存年数" }, mynumber_retention_years: { part: "settings", why: "マイナンバーの保存年数" },
  okuri_base_amount: { part: "settings", why: "送りの定額" }, okuri_flat_tiers: { part: "settings", why: "送りの距離区分" }, okuri_mode: { part: "settings", why: "送りの方式" },
  invoice_registered_on: { part: "settings", why: "インボイスの登録日（同じ法人）" }, invoice_reg_no: { part: "settings", why: "登録番号（同じ法人・領収書の表記）" }, receipt_footer: { part: "settings", why: "領収書の下の文" },
  payment_methods: { part: "settings", why: "支払い方法" }, punch_methods: { part: "settings", why: "打刻の方法", needs: "店の端末（キオスク）＝写さない。端末が無い間は本人と代理の打刻だけ使える" }, punch_enforce: { part: null, why: "★版 3 打刻の強制＝写さない（位置を写さないので、方式が位置のまま強制だけ写ると店の設定の保存が毎回 range required で止まる）" },
  punch_restrict_mode: { part: null, why: "★版 3 打刻の制限の方式＝写さない（Wi-Fi・位置の値を写さない＝2 店目は制限なしで始める・「店の端末だけ」を写すと端末の無い 2 店目で本人の打刻が全部止まる）" }, punch_require_shift: { part: "settings", why: "シフトの無い打刻", needs: "シフト＝写さない。「止める」を写すと、2 店目で確定のシフトを作るまで本人の出勤の打刻が止まる" },
  punch_round_unit: { part: null, why: "★版 3 勤務時間の丸めの単位＝写さない（丸めは店ごとに同意を取る・同意の版は写さない＝2 店目は丸めない（1 分）で始まる）" }, punch_round_mode: { part: null, why: "★版 3 勤務時間の丸め方＝写さない（同上）" }, punch_mode: { part: "settings", why: "打刻する店かどうか" },
  pay_fee_rates: { part: "settings", why: "支払い手数料" }, pay_discount_rates: { part: "settings", why: "支払い割引" }, pay_discount_base: { part: "settings", why: "割引の基準" },
  cash_float_default: { part: "settings", why: "釣り銭の既定" }, register_window_before_min: { part: "settings", why: "レジの前の時間" }, register_window_after_min: { part: "settings", why: "レジの後の時間" },
  cast_register_scope: { part: "settings", why: "会計できる卓", needs: "キャストのレジ端末＝写さない（キャストのレジ使用と同じ）" }, duty_gate: { part: "settings", why: "出勤の柵（読まれていない鍵）" },
  ar_enabled: { part: "settings", why: "売掛（receivable_policy と対）" }, pin_lock_max_fail: { part: "settings", why: "PIN のロックの回数" }, pin_lock_minutes: { part: "settings", why: "PIN のロックの時間" },
  payslip_visibility: { part: "settings", why: "マイページ：給与明細の表示" }, drink_claim: { part: "settings", why: "マイページ：ドリンク申告" }, punch_correction_request: { part: "settings", why: "マイページ：打刻の修正申請" },
  ranking: { part: "settings", why: "マイページ：ランキング" }, ranking_show_others: { part: "settings", why: "マイページ：ほかのキャストの表示" }, reservation_request: { part: "settings", why: "マイページ：予約の申請" },
  shift_request_mode: { part: "settings", why: "マイページ：シフト希望の方式" }, contract_ack: { part: "settings", why: "マイページ：契約の確認を出す", needs: "契約の版（contract_ack_rev）＝写さない。2 店目で版を決めるまで確認の画面の版が空" },
  // ── 営業時間（hours） ──
  biz_cutoff_hm: { part: "hours", why: "営業日の切替時刻" }, close_hm: { part: "hours", why: "閉店の時刻" },
};

/** stores の列（settings_json 以外） */
export const STORE_COLUMNS: Readonly<Record<string, CopyClass>> = {
  id: { part: null, why: "店の ID" }, org_id: { part: null, why: "会社" }, name: { part: null, why: "店名" }, short: { part: null, why: "略称" },
  settings_json: { part: null, why: "鍵ごとに上の名簿で決める" }, created_at: { part: null, why: "作った時刻" }, updated_at: { part: null, why: "直した時刻" },
  pay_day: { part: null, why: "会社で 1 つ（set_org_pay_day が全店にそろえる）" }, use_vip: { part: null, why: "席は写さない" }, use_counter: { part: null, why: "席は写さない" },
  trade_name: { part: null, why: "屋号＝店ごと（写したときは 2 店目の店名を入れる）" },
  punch_lat: { part: null, why: "位置" }, punch_lng: { part: null, why: "位置" }, punch_radius_m: { part: null, why: "位置" }, punch_allow_ip: { part: null, why: "Wi-Fi（IP）" },
  line_config: { part: null, why: "LINE" }, line_monthly_limit: { part: null, why: "LINE" },
  open_time: { part: "hours", why: "開店の時刻" },
  hon_fee: { part: "pricing", why: "本指名料" }, jonai_fee: { part: "pricing", why: "場内指名料" }, dohan_fee: { part: "pricing", why: "同伴料" }, service_rate: { part: "pricing", why: "サービス料" },
  card_tax_rate: { part: "pricing", why: "カード手数料" }, round_unit: { part: "pricing", why: "会計の端数の単位" }, round_mode: { part: "pricing", why: "会計の端数の丸め方" },
  set_min: { part: "pricing", why: "セットの分" }, set_fee: { part: "pricing", why: "セットの料金" }, ext_min: { part: "pricing", why: "延長の分" }, ext_fee: { part: "pricing", why: "延長の料金" },
  time_mode: { part: "pricing", why: "延長の付け方" }, time_per: { part: "pricing", why: "時間の数え方" }, dohan_auto_hon: { part: "pricing", why: "同伴を本指名に" }, ext_shimei_enabled: { part: "pricing", why: "延長の指名" },
  service_rate_by_seat: { part: "pricing", why: "席種ごとのサービス料" },
  business_tax_status: { part: "settings", why: "課税事業者（同じ法人）" }, price_display: { part: "settings", why: "税込・税別の表示" }, invoice_status: { part: "settings", why: "インボイス（同じ法人）" },
  invoice_reg_no: { part: "settings", why: "登録番号（同じ法人）" }, invoice_registered_on: { part: "settings", why: "登録日（同じ法人）" }, tax_rounding: { part: "settings", why: "税の端数" },
  card_surcharge_rate: { part: "settings", why: "カードの上乗せ" }, receivable_policy: { part: "settings", why: "売掛" }, tax_inclusive_display: { part: "settings", why: "税込の表示（旧）" },
  payment_methods: { part: "settings", why: "支払い方法" }, punch_methods: { part: "settings", why: "打刻の方法", needs: "店の端末＝写さない" }, punch_enforce: { part: null, why: "★版 3 打刻の強制＝写さない（鍵と同じ）" },
  punch_restrict_mode: { part: null, why: "★版 3 打刻の制限の方式＝写さない（鍵と同じ）" }, punch_require_shift: { part: "settings", why: "シフトの無い打刻", needs: "シフト＝写さない" }, punch_round_unit: { part: null, why: "★版 3 丸め＝写さない（鍵と同じ）" },
  punch_round_mode: { part: null, why: "★版 3 丸め＝写さない（鍵と同じ）" }, manager_punch_enabled: { part: "settings", why: "店長の打刻" },
  legal_name: { part: "settings", why: "法人名（同じ法人）" }, receipt_default_desc: { part: "settings", why: "領収書の但し書き" },
};

export const copyKeysOf = (part: StoreCopyPart): string[] => Object.entries(STORE_SETTING_KEYS).filter(([, v]) => v.part === part).map(([k]) => k).sort();
export const copyColumnsOf = (part: StoreCopyPart): string[] => Object.entries(STORE_COLUMNS).filter(([, v]) => v.part === part).map(([k]) => k).sort();
