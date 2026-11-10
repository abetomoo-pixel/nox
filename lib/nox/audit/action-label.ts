// ★M-150（2026-11-10 夜便・外部レビュー 2 回目）: 監査の操作名を業務の言葉に（辞書 1 本）。内部の操作名と ID は画面の「技術詳細」に畳む。
//   個別の辞書（よく出る操作）→ 無ければ語の組み合わせ（対象＋動作）→ それも無ければ「その他の操作」。純関数＝verify:nox-night1110 の単体対象。
const EXACT: Record<string, string> = {
  check_open: "伝票を開いた（開卓）", check_add_line: "注文を追加", check_remove_line: "注文を取り消し", check_set_nominations: "指名を設定", check_pay: "入金",
  check_close: "会計を確定", check_void: "伝票を取り消し", check_set_people: "人数を変更", check_extension_add: "延長を追加", check_shimei_add: "指名料を追加",
  check_dohan_add: "同伴料を追加", check_move_seat: "席を移動", check_add_seat: "相席を追加", check_merge: "伝票を統合", check_time_charge_apply: "時間料金を計算",
  check_customer_add: "伝票にお客様を追加", check_customer_remove: "伝票のお客様を外す", check_line_set_group: "明細の会計グループを変更", check_referral_set: "紹介を設定",
  check_add_referral: "紹介を追加", check_open_set_line: "開卓のセット料金", off_duty_exempt: "出勤前の操作（店長以上）", receipt_issue: "領収書を発行", receipt_issue_void: "領収書を取り消し",
  bottle_keep_register: "ボトルキープを登録", bottle_keep_out: "ボトルキープを出庫", receivable_open: "売掛を計上", receivable_collect: "売掛を回収", receivable_set_due: "売掛の期日を変更",
  payment_record_add: "支払いを記録", approval_request: "割引などを申請", approval_approve: "申請を承認", approval_reject: "申請を却下", approval_direct: "割引などを直接適用",
  daily_report_close: "日報を締めた", daily_report_reclose: "日報を締め直し", report_reopen: "日報の締めを解除", cash_diff_approve: "現金差異を承認",
  read_cast_sensitive: "キャストの機微情報を閲覧", read_staff_sensitive: "スタッフの機微情報を閲覧", cast_create_sensitive: "キャストの機微情報を登録", set_cast_tax_profile: "キャストの税の設定",
  cast_create: "キャストを登録", cast_invite: "キャストを招待", cast_leave: "キャストの退店", set_cast_plan: "待遇プランを設定", set_cast_guarantee: "保証時給を設定", set_cast_pin: "キャストの PIN を設定",
  set_cast_register: "キャストのレジ使用を設定", set_cast_photo: "キャストの写真を変更", set_cast_norm: "キャストのノルマを設定", cast_contract_ack: "キャストが契約を確認",
  staff_create: "スタッフを登録", staff_deactivate: "スタッフの在籍を外す", staff_reactivate: "スタッフを復帰", staff_update_profile: "スタッフの情報を変更", staff_change_role: "スタッフの役職を変更",
  staff_transfer_store: "スタッフの店舗を移動", set_staff_perms: "スタッフの権限を変更", set_staff_pin: "スタッフの PIN を設定",
  trial_register: "体験入店を登録", trial_hire: "体験入店から本採用", trial_reject: "体験入店を見送り", trial_update: "体験入店を変更",
  shift_set: "シフトを設定", shift_propose: "シフトを提案", shift_bulk_set_daily: "シフトをまとめて設定", shift_confirm_bulk: "シフトをまとめて確定", shift_remove: "シフトを削除",
  shift_wish_submit: "シフト希望を提出", shift_wish_decide: "シフト希望を判断", shift_period_set: "シフトの期間を設定", shift_period_auto_close: "シフトの期間を自動で締め",
  staff_shift_propose: "スタッフのシフトを提案", staff_shift_confirm: "スタッフのシフトを確定", staff_shift_cancel: "スタッフのシフトを取り消し", staff_shift_override: "スタッフのシフトを上書き",
  staff_pattern_set: "スタッフの勤務パターン", set_staffing_need: "必要人数を設定", staffing_need_remove: "必要人数を削除", attendance_set: "出欠を設定", attendance_set_self: "本人が出欠を連絡",
  attendance_contact_log: "出欠の連絡を記録", punch_self: "本人のスマホで打刻", punch_proxy: "代理で打刻", kiosk_punch: "端末で打刻", punch_open_attention: "退勤なしの打刻に注意",
  punch_correction_request: "打刻の修正を申請", punch_correction_apply: "打刻を修正", payroll_run_create: "給与の期を作成", payroll_finalize: "給与を確定", payroll_reopen: "給与の確定を解除",
  payroll_mark_paid: "給与を支払い済みに", payroll_adjustment_add: "給与の調整を追加", payroll_adjustment_delete: "給与の調整を削除", set_deduction: "控除を設定", transport_issue: "送りを記録",
  set_comp_plan: "待遇プランを変更", set_comp_component: "待遇の項目を変更", set_custom_back_def: "独自のバックを設定", delete_cast_rank: "キャストのランクを削除",
  drink_claim_submit: "ドリンクの申告", drink_claim_submit_proxy: "ドリンクを代理で申告", drink_claim_approve: "ドリンクの申告を承認", drink_claim_reject: "ドリンクの申告を却下",
  customer_register: "お客様を登録", customer_update: "お客様の情報を変更", customer_assign_cast: "お客様の担当を設定", customer_set_grade: "お客様のランクを設定",
  customer_note_add: "お客様のメモを追加", customer_note_remove: "お客様のメモを削除", customer_anonymize: "お客様の情報を匿名化",
  reservation_create: "予約を登録", reservation_update: "予約を変更", reservation_set_status: "予約の状態を変更", reservation_to_check: "予約から開卓", reservation_request_guest: "お客様からの予約の申請",
  set_product: "商品を登録・変更", set_product_active: "商品の有効・無効", set_product_category: "商品のカテゴリ", product_stock_add: "在庫を入庫", set_seat: "席を設定",
  set_store_profile: "店舗設定を変更", set_store_business_hours: "営業時間を変更", set_store_time_pricing: "時間料金を変更", set_store_pricing: "料金を変更", set_store_tax_config: "税の設定を変更",
  set_store_okuri_mode: "送りの方式を変更", set_store_okuri_base: "送りの基準額を変更", set_store_line_limit: "LINE の送信上限を変更", set_store_line_config: "LINE の設定を変更", set_line_secret: "LINE の鍵を設定",
  set_store_mine_settings: "マイページの設定を変更", set_store_norm_config: "ノルマの設定を変更", set_store_cast_register: "店のキャストのレジ使用", store_sales_target_set: "売上目標を設定",
  set_printer_config: "プリンタの設定", rotate_store_token: "店の公開用の鍵を作り直し", flag_toggle: "機能の ON／OFF", set_referrer: "紹介者を設定",
  kiosk_login: "端末でログイン", kiosk_lock: "端末をロック", kiosk_provision: "端末を発行", kiosk_device_bind: "端末を固定", kiosk_device_unbind: "端末の固定を解除", kiosk_deactivate: "端末を無効化", kiosk_reactivate: "端末を有効化",
  kiosk_qr_open: "QR 打刻を開始", kiosk_qr_claim: "QR で打刻", kiosk_qr_secret: "QR の鍵を更新", kiosk_person_claim: "端末で本人のログイン", kiosk_person_end: "端末の本人のログインを終了",
  notice_create: "お知らせを作成", notice_update: "お知らせを変更", notice_delete: "お知らせを削除", notice_mark_read: "お知らせを既読", line_bind_token_create: "LINE 連携のコードを発行", bind_line: "LINE を連携", line_link_remove: "LINE の連携を解除",
  terms_accept: "利用規約に同意", create_org: "会社を作成（運営）", add_store: "店舗を追加（運営）", "demo.reset": "デモを初期化", seed_marker: "検証用のデータ",
  set_penalty_config: "罰金・減額の設定を変更", check_remove_seat: "相席を解除",
  adv_issue: "前借りを発行", adv_cancel: "前借りを取り消し", incentive_publish: "出勤奨励を公開", incentive_cancel: "出勤奨励を取り消し", print_enqueue: "印刷を依頼", cast_rejoin: "キャストが再入店", kiosk_logout: "端末でログアウト",
  read_cast_mynumber: "マイナンバーを閲覧", read_cast_mynumber_masked: "マイナンバーを閲覧（伏せ字）", cast_loan_grant: "貸付を発行", cast_loan_repay: "貸付の返済", cast_mynumber_discard: "マイナンバーを廃棄",
  staff_labor_mark_paid: "スタッフ給与を支払い済みに", staff_labor_unmark_paid: "スタッフ給与の支払い済みを取り消し", set_user_photo: "写真を変更", staff_attendance_confirm: "スタッフの勤怠を確定",
};
const NOUN: [RegExp, string][] = [
  [/^check_/, "伝票"], [/^receipt/, "領収書"], [/^receivable/, "売掛"], [/^bottle_keep/, "ボトルキープ"], [/^approval/, "申請"], [/^daily_report|^report_/, "日報"],
  [/^cast_|_cast_/, "キャスト"], [/^staff_|_staff_/, "スタッフ"], [/^shift|_shift/, "シフト"], [/^punch|_punch/, "打刻"], [/^payroll|_payroll/, "給与"], [/^customer/, "お客様"],
  [/^reservation/, "予約"], [/product/, "商品"], [/^set_store_|^store_/, "店舗設定"], [/^kiosk/, "端末"], [/^notice/, "お知らせ"], [/line/, "LINE"], [/^trial/, "体験入店"], [/^drink_claim/, "ドリンクの申告"],
];
const VERB: [RegExp, string][] = [[/_create$|^create_/, "作成"], [/_add$/, "追加"], [/_remove$|_delete$/, "削除"], [/^set_|_set$/, "設定"], [/_update$/, "変更"], [/_void$/, "取り消し"], [/_approve$/, "承認"], [/_reject$/, "却下"], [/_confirm/, "確定"], [/_cancel$/, "取り消し"]];
/** 監査の操作名 → 業務の言葉。 */
export function auditActionJa(action: string | null | undefined): string {
  if (!action) return "その他の操作";
  if (EXACT[action]) return EXACT[action];
  const noun = NOUN.find(([re]) => re.test(action))?.[1];
  const verb = VERB.find(([re]) => re.test(action))?.[1];
  if (noun && verb) return `${noun}を${verb}`;
  if (noun) return `${noun}の操作`;
  return "その他の操作";
}
/** 検索の対象の文字列＝業務の言葉・内部の操作名・対象・変更前後（卓名・領収書番号・キャスト名などが入っていれば当たる）。 */
export function auditSearchTextOf(l: { action?: string | null; target?: string | null; before_json?: unknown; after_json?: unknown }, extra: string[] = []): string {
  const j = (x: unknown) => { try { return x == null ? "" : JSON.stringify(x); } catch { return ""; } };
  return [auditActionJa(l.action), l.action ?? "", l.target ?? "", j(l.before_json), j(l.after_json), ...extra].join(" ").toLowerCase();
}
