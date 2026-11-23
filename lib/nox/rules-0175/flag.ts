// ★連続便 3 便 P175-prep（2026-10-23）: 0175 v2（CANON 型ほか）の client を先行実装し、本番に 0175 が適用されるまで眠らせるフラグ。
//   RULES_0175_APPLIED＝false のあいだ: 新しい列・RPC・店設定キーは読まない／書かない・計算は従来経路（golden 不変）・店設定の新項目は出ない。
//   P175（Agoora 手貼り＝verify_0175_0176.sql の ok 列が全部 true）の後に true へ＝1 行の変更（この定数だけ）。0177 の送り 4 方式も同じ場所に置く。
//   suite（verify-nox-p175prep）は「false で golden 不変」「true の client 段を fixture で」の両方を見る＝値は関数で読み、テストから差し替えられる形にする。
export const RULES_0175_APPLIED = true; // ★便 ON-1（2026-10-26）: 0175 v2（sha16 3979b9fcf596acb7）を Agoora が 10/26 に手貼り＝verify_0175_0176.sql 全 true（関数数 367・表数 104）→ true
/** ★裁定414（0177）: 送りの 4 方式（'store'／'none'）＝P177 後に true（deduction-panel・profiles・給与右パネルの送りセルが読む） */
export const OKURI_4WAY_APPLIED = true;
/** ★裁定414 追補（0180）: 送りの定額徴収の距離区分（最大 3 段）とキャストの送り区分＝P180 後に true（店設定・キャスト詳細・退勤の既定額が読む） */
export const OKURI_TIERS_APPLIED = true; // ★便 0180（2026-10-27）: 0180（sha16 57a84a11276ba974）を Agoora が手貼り＝verify 全一致・3 本の md5 がファイルと一致→ true

/** 読み口（テストで上書きできる）。本番コードは必ずこの関数を通す＝grep で「眠らせた箇所」を数えられる */
let override0175: boolean | null = null;
export function rules0175On(): boolean { return override0175 ?? RULES_0175_APPLIED; }
export function __setRules0175ForTest(v: boolean | null): void { override0175 = v; }
let overrideOkuri: boolean | null = null;
export function okuri4wayOn(): boolean { return overrideOkuri ?? OKURI_4WAY_APPLIED; }
export function __setOkuri4wayForTest(v: boolean | null): void { overrideOkuri = v; }
let overrideTiers: boolean | null = null;
export function okuriTiersOn(): boolean { return overrideTiers ?? OKURI_TIERS_APPLIED; }
/** ★便 ON-4（2026-10-26・裁定427＝C2-23）: 0182（席移動で席種が変わるときの料金＝check_move_seat／check_group_due）を Agoora が手貼りしたら true。false の間はレジの席移動は従来どおり（確認ダイアログも出さない） */
export const SEAT_MOVE_PRICING_APPLIED = true; // ★便 0182（2026-10-27）: 0182（sha16 454bf43a4c790086）を Agoora が手貼り＝verify 全一致・2 本の md5 がファイルと一致・既存 checks の service_pre 全件 {}→ true
let overrideSeatMove: boolean | null = null;
export function seatMovePricingOn(): boolean { return overrideSeatMove ?? SEAT_MOVE_PRICING_APPLIED; }
export function __setSeatMovePricingForTest(v: boolean | null): void { overrideSeatMove = v; }
/** ★便 M（2026-10-26）: 0183（裁定429 シフト権限・M-4 新規客の予約・M-7 ノルマ未達の意思保存）を Agoora が手貼りしたら true（3 つとも同じ mig＝1 本のフラグ） */
export const MIG_0183_APPLIED = true; // ★2026-10-27: 0183（sha16 f7a98b59338ce400）を Agoora が手貼り＝verify 全一致・19 本の md5 がファイルと一致→ true
let override0183: boolean | null = null;
export function mig0183On(): boolean { return override0183 ?? MIG_0183_APPLIED; }
export function __set0183ForTest(v: boolean | null): void { override0183 = v; }
export function __setOkuriTiersForTest(v: boolean | null): void { overrideTiers = v; }
/** ★QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫）: 0185（キオスクの QR の向きを逆に＝キオスクが QR を出す・スマホで読む）を Agoora が手貼りしたら true。false の間はキオスクは PIN だけ・/kq は 404・/mine の入口は出ない */
export const MIG_0185_APPLIED = true; // ★便 0185（2026-10-27）: 0185（sha16 a00055c966c294e1）を Agoora が手貼り＝verify 全一致・8 本の md5 がファイルと一致・PIN だけの解除が本番で通る→ true
let override0185: boolean | null = null;
export function mig0185On(): boolean { return override0185 ?? MIG_0185_APPLIED; }
export function __set0185ForTest(v: boolean | null): void { override0185 = v; }
/** ★便 W-10（2026-10-26）: 0186（特別日・既定に従うへ戻す・納付記録の取消・監査ログの出力の記録）を Agoora が手貼りしたら true。false の間はその 4 つの入口を出さない（準備中の表示もしない） */
export const MIG_0186_APPLIED = true; // ★2026-10-27: 0186（sha16 15143fd04f488674）を Agoora が手貼り＝verify 全一致・7 本の md5 がファイルと一致→ true
let override0186: boolean | null = null;
export function mig0186On(): boolean { return override0186 ?? MIG_0186_APPLIED; }
export function __set0186ForTest(v: boolean | null): void { override0186 = v; }
/** ★0187（便 CASH＋便 EXT・2026-10-27 夜）: 0187（現金割引の基準＝合計から／小計から・check_pay の p_disc_rate／p_disc_amount・延長パターンの凍結を全行に）を Agoora が手貼りしたら true。
 *  false の間＝入金モーダルの割引欄・店設定「支払方法の調整」・延長のご案内・M-17 の割引の内訳は出ない（割引は RPC が従来どおり自動で立てる）・check_pay に p_disc_* を送らない（旧 11 引数のまま） */
export const MIG_0187_APPLIED = true; // ★2026-10-29: 0187（sha16 15037e893c142cad）を Agoora が手貼り＝verify 全一致（md5 11 本・関数 382→384・check_pay 13 引数・★0187 11 本）・mig を流さない t0187 20/20→ true
let override0187: boolean | null = null;
export function mig0187On(): boolean { return override0187 ?? MIG_0187_APPLIED; }
export function __set0187ForTest(v: boolean | null): void { override0187 = v; }
/** ★0188（裁定433 税率表＋裁定434 源泉区分 4 つ・2026-10-29 起草）: Agoora が手貼りしたら true。false の間＝区分 other_204 の選択肢・税率表の読取・日払いの種別の出し分け（settlement は daily の店だけ）・pay.ts の税率表参照は出さない／読まない */
export const MIG_0188_APPLIED = true; // ★2026-10-29: 0188（sha16 d9fceaa24e2e93ac）を Agoora が手貼り＝verify 全行一致（md5 5 本・calc 4 値・CHECK 4 区分・表 6 行 SELECT のみ）・mig を流さない t0188 14/14（関数 386・表 111）→ true
let override0188: boolean | null = null;
export function mig0188On(): boolean { return override0188 ?? MIG_0188_APPLIED; }
export function __set0188ForTest(v: boolean | null): void { override0188 = v; }
/** ★0189（M-16 の翌表記＝staffing_needs の時間帯を翌 24:00 まで・2026-10-29 起草）: Agoora が手貼りしたら true。false の間＝必要人数の時間帯の選択肢は 24:00 まで（翌の選択肢を出さない） */
export const MIG_0189_APPLIED = true; // ★2026-10-29: 0189（sha16 c6a8dab6a32a6c81）を Agoora が手貼り＝verify 全行一致（md5 b394d912・CHECK to_min ≤ 2880・50 行 bad 0・ACL 3 ロール）・mig を流さない t0189 4/4→ true
let override0189: boolean | null = null;
export function mig0189On(): boolean { return override0189 ?? MIG_0189_APPLIED; }
export function __set0189ForTest(v: boolean | null): void { override0189 = v; }
/** ★0190（裁定436 打刻ゲート・端末の束縛・退店の失効＋便 K ⑥〜⑧＝RLS kiosk 腕 29 本・上限 3 台・ロック 10 分・2026-10-30 12:08 に本番へ適用＝事故適用を受け入れ＝例外）: true の間＝
 *  レジの 'off duty' の文言・店舗設定の打刻ゲートのスイッチ・端末の束縛（device_fp を kiosk_login／unlock／qr_secret／qr_poll に送り、端末ログイン直後に kiosk_device_bind）・端末一覧の固定の解除／再発行して有効化／削除・
 *  キオスクのレジ＝register-board の包み（K-0）・人を選ぶ→PIN 4〜6 桁（K-1）・435 タイル・退店 route の ban。false なら 0190 前の挙動（入口 4 本の新引数は DEFAULT NULL＝送らない） */
export const MIG_0190_APPLIED = true; // ★2026-10-30: 0190（sha16 6a73e1109a39b996）＝本番の 40 関数 md5 がファイルと 40／40 一致・verify 51 行差 0（handpaste_0190.md）→ true
let override0190: boolean | null = null;
export function mig0190On(): boolean { return override0190 ?? MIG_0190_APPLIED; }
export function __set0190ForTest(v: boolean | null): void { override0190 = v; }
/** ★0191（便 OB-2 ⑤＝初期設定 v5 の器なし項目・2026-10-30 14 時台に Agoora が手貼り＝verify 17 行差 0・md5 set_store_profile b074a4bf／check_remove_line e34ebf23・関数 394・表 112）: true の間＝
 *  初期設定 v5 の「後で（マスタから）」を実保存に（店設定 kind_back_rate／withholding_default_cast／withholding_default_staff／cash_float_default／settlement_close_day・shift_request_mode 'store'・商品の場内／フリー個別 p_back_rate_by_kind）・PIN 4〜6 桁・下書き setup_drafts。false なら 0191 前の挙動 */
export const MIG_0191_APPLIED = true; // ★2026-10-30: 0191（sha16 e5106a9fe0b75a17＝0190 適用後の live から再生成）を Agoora が手貼り＝verify 全行一致→ true
let override0191: boolean | null = null;
export function mig0191On(): boolean { return override0191 ?? MIG_0191_APPLIED; }
export function __set0191ForTest(v: boolean | null): void { override0191 = v; }
/** ★0192（便 M5 の読取で起草＝2026-10-30 夕・未手貼り）: cast_pin_status（M-45 キャストのキオスク PIN の状態＝マスタ › システムの一覧）・staff_punch の既定ロック 10 分（M-46・裁定437）・
 *  退勤の取消（M-38）・PIN ロックの解除 RPC（M-39）・スタッフ日別勤怠の修正・確定。false の間は client は従来（キャストの行は「0192 の適用後」の 1 行だけ）。手貼り＋verify 一致で true。 */
export const MIG_0192_APPLIED = true; // ★2026-11-02: 0192（sha16 241f742c8476fd08）を Agoora が手貼り＝verify 45 行が期待値と全行一致（関数 403・表 114・acl diff 0・md5 28 本 =file）→ true
let override0192: boolean | null = null;
export function mig0192On(): boolean { return override0192 ?? MIG_0192_APPLIED; }
export function __set0192ForTest(v: boolean | null): void { override0192 = v; }

/** ★0193（2026-11-02 夜の自走便＝下書き・未手貼り）: 役割の見直し（表示＝管理者／店長／スタッフ・肩書・役割の変更と最後の管理者の柵）・個人情報の権限（店長＝自店の本名・住所・電話・口座・マイナンバーは末尾 4 桁）・店長に開く操作（プリンタ・端末の停止／再開／固定の解除・勤怠の確定の解除）。false の間は client は従来。手貼り＋verify 一致で true。 */
export const MIG_0193_APPLIED = true;
let override0193: boolean | null = null;
export function mig0193On(): boolean { return override0193 ?? MIG_0193_APPLIED; }
export function __set0193ForTest(v: boolean | null): void { override0193 = v; }

/** ★0194（2026-11-04 新 CC 起草・裁定444／439／445・Agoora が同日手貼り＝verify 19 行が期待値と全行一致・関数 410・表 116）: 店長に開く 5（端末の発行・削除／領収書の店情報／スタッフ給与 run の状態／給与の支払済み化／スタッフのメール変更）・
 *  admin の CHECK 外し・スタッフ給与の確定額の凍結（staff_attendance_confirm の p_labor＝staff_labor_confirmed）・キオスクの在庫タイル（kiosk_stock_levels）。false の間は client は従来（店長は owner 限定の画面を見ない・確定額は送らない・在庫タイルは案内）。 */
export const MIG_0194_APPLIED = true; // ★2026-11-04: 0194（sha16 c6ab2b20dc9b6167）を Agoora が手貼り（1 回で Success）＝verify 19 行が期待値と全行一致 → true
let override0194: boolean | null = null;
export function mig0194On(): boolean { return override0194 ?? MIG_0194_APPLIED; }
export function __set0194ForTest(v: boolean | null): void { override0194 = v; }

/** ★0195（2026-11-05 Agoora 手貼り＝verify 21 行（貼り先証明を含む）が期待値と全行一致・関数 416・表 119・裁定447 差し替え版＋M-73＋裁定447 ④＋M-77 ②③＋M-80 追記②＋裁定450 の 6）:
 *  日ごとの控除ルール（deductions.day_rule always／pick・cast_day_deductions＋cast_day_deductions_set＝kiosk 腕あり）・単位 pay_rate／種別 other（set_deduction 10 引数）・キャスト別の適用（deduction_rule_casts＋set／get）・
 *  LINE の block（line_links.blocked_at＋line_link_block＝service_role／line_link_remove）・スタッフの固定手当の複数行（staff_allowances＋staff_allowances_set・staff_labor_confirmed.allowances＝Σ＝fixed を RPC が検証）。
 *  false の間は client は従来（9 引数の set_deduction は無い＝10 引数の DEFAULT で従来どおり・新画面は出さない）。 */
export const MIG_0195_APPLIED = true; // ★2026-11-05: 0195（sha16 90ed3a2656aed407）を Agoora が手貼り（本文 1 回 Run・事前確認は後になった）＝verify 21 行が期待値と全行一致・md5 8b319af5／3fea3e3f 一致 → true
let override0195: boolean | null = null;
export function mig0195On(): boolean { return override0195 ?? MIG_0195_APPLIED; }
export function __set0195ForTest(v: boolean | null): void { override0195 = v; }

/** ★0196（未起草・便 D で置き場だけ＝2026-11-05）: キオスクの便（裁定448 B 方式・453・§9＝M-103 の保存の腕＝cast_day_deductions_set の cast セルフ腕・kiosk_punch の p_day_deductions・
 *  kiosk_punch_state の day_rules・kiosk_operator_list の判定）。false の間は /mine とキオスクの出勤の「今日の控除」のチェックを出さない（UI は便 D で入れ済み）。 */
export const MIG_0196_APPLIED = true; // ★2026-11-06: 0196（sha16 baab7cbbc665ec4b・裁定456 の 1／457 で再生成）を Agoora が手貼り＝verify 22 行が期待値と全行一致・関数 418・表 119・本文 11 本の md5 一致 → true
let override0196: boolean | null = null;
export function mig0196On(): boolean { return override0196 ?? MIG_0196_APPLIED; }
export function __set0196ForTest(v: boolean | null): void { override0196 = v; }

/** ★0197（未起草・便 E で置き場＝2026-11-05）: 裁定455＝打刻の 3 択目 punch_mode（'store'＝打刻しない）・on_duty_of の確定シフトの窓・register_day_grants（今日だけ許可）。
 *  false の間は punchModeOf が常に 'punch'＝初期設定／店舗設定の 3 択目・レジの柵の文言・実働の分岐はどれも従来どおり。 */
/** ★0198（起草済み・2026-11-06 夜便レーン 3＝裁定458 前借りは「貸付」＋2026-11-07 裁定461／M-120 同乗）: comp_plans の同意の列・advances の本人確認（ack）・cast_loan_grant（p_pin）／cast_loan_repay・view cast_loans／cast_loan_balances・demo_org_reset の wipe 6 表
 *  ＋★6 裁定461＝cast_day_deductions_set の cast 本人経路を forbidden（staff の自店を店側に）・cast_day_applied_of（店が付けた今日の控除の見え方）・kiosk_punch の p_day_deductions は操作担当が解錠中だけ＋出勤の返りに day_applied。
 *  false の間は client の器（待遇プランの同意・貸付の入口の PIN・貸付台帳・代行の出勤直後の「今日の控除」・本人の表示だけ）を出さない＝手貼りは相談役の合図。 */
export const MIG_0198_APPLIED = true;
let override0198: boolean | null = null;
export function mig0198On(): boolean { return override0198 ?? MIG_0198_APPLIED; }
export function __set0198ForTest(v: boolean | null): void { override0198 = v; }

/** ★0199（起草済み・2026-11-09＝★1 裁定459／M-114 line_notify の白名単・★2 裁定466 kiosk_person_claim に cast）: 手貼りは 0198 → フラグ便 → 0199 の順＝相談役の合図。
 *  false の間は client の器（LINE 通知の種類ごとの保存ボタン・本人セッションの cast＝M-125）を出さない。 */
export const MIG_0199_APPLIED = true; // ★2026-11-10: 0199（sha16 a68669f112662a19）を Agoora が手貼り＝検証 9 行が期待値と全行一致（fn 422・set_store_profile 287f6800・kiosk_person_claim bb2f83f6）→ true
let override0199: boolean | null = null;
export function mig0199On(): boolean { return override0199 ?? MIG_0199_APPLIED; }
export function __set0199ForTest(v: boolean | null): void { override0199 = v; }

/** ★0200（起草済み・2026-11-10＝裁定470 お知らせの個別選択・471 スタッフ給与の支払い済み・472 スマホのレジは出勤中だけ・473 キャストのレジ設定を 1 か所に＝sha16 caa775c91eaa0e24）: 手貼りは相談役の合図。
 *  false の間は client の器（個別選択・支払い済み・会計できる卓・auth_register_access を使う入場判定・heartbeat）を出さない＝cast の出勤中・店端末のみの柵は client 側の判定で先に効かせる。 */
export const MIG_0200_APPLIED = true;
let override0200: boolean | null = null;
export function mig0200On(): boolean { return override0200 ?? MIG_0200_APPLIED; }
export function __set0200ForTest(v: boolean | null): void { override0200 = v; }

/** ★0201（裁定474＝打刻設定を BANZEN と同じ形に・M-133＝kiosk_login の 4〜6 桁と本人の PIN 変更・staff_pin_status の旧キー）: 2026-11-11 Agoora 手貼り＝sha16 ccf2d6d61e36da42・529 行・検証 17 行が全行一致（関数 431・表 121）。
 *  true＝本人のスマホ打刻は route /api/punch/self → punch_self_impl（位置は端末・IP はサーバー）・店舗設定の打刻設定の節・本人の PIN 変更・キオスクの出退勤の PIN 4〜6 桁。 */
export const MIG_0201_APPLIED = true;
let override0201: boolean | null = null;
export function mig0201On(): boolean { return override0201 ?? MIG_0201_APPLIED; }
export function __set0201ForTest(v: boolean | null): void { override0201 = v; }

/** ★0201b（起草済み・83d59c5b78778d2a を相談役 11/11 の指示で作り直す＝set_store_profile の白名単から tax_inclusive_display と ar_enabled を外す・set_store_receivable_policy が ar_enabled も書く）: 手貼りは相談役の合図。
 *  false の間＝売掛のスイッチは set_store_receivable_policy（列）と set_store_profile（ar_enabled）の 2 つを書く（0201b の前は RPC が ar_enabled を書かないため）。true＝RPC 1 本だけ（ar_enabled は白名単から外れる）。 */
export const MIG_0201B_APPLIED = true; // ★2026-11-12: 0201b（sha16 b0e1dad4982cfd9b・1,011 行）を Agoora が手貼り＝事前確認 1 行・検証 8 行が期待値と全行一致（fn 431・set_store_profile 376ea335・set_store_receivable_policy e7e0c1b8・set_cast_sensitive d5342c38）→ true
let override0201b: boolean | null = null;
export function mig0201bOn(): boolean { return override0201b ?? MIG_0201B_APPLIED; }
export function __set0201bForTest(v: boolean | null): void { override0201b = v; }

/** ★0201c（裁定480・484＝体入の条件と本採用／見送り・M-146＝新しい商品とカテゴリの既定）: 2026-11-12 Agoora 手貼り＝検証が全行一致。
 *  true＝店舗設定の体入の 2 キー（trial_wage・trial_back）・キャスト詳細の体入の個人の上書き（set_cast_trial）と本採用／見送り（cast_trial_decide）・商品のカテゴリの既定（set_product_category_defaults）。体入の時給を給与に当てる式は入れない。 */
export const MIG_0201C_APPLIED = true;
let override0201c: boolean | null = null;
export function mig0201cOn(): boolean { return override0201c ?? MIG_0201C_APPLIED; }
export function __set0201cForTest(v: boolean | null): void { override0201c = v; }

/** ★0201h（裁定485＝売掛の給与天引きは店の receivable_policy が cast_liability_allowed のときだけ）: 2026-11-12 Agoora 手貼り＝検証が全行一致。
 *  true＝日報の売掛タブの「給与天引き」は cast_liability_allowed の店だけに出す。 */
export const MIG_0201H_APPLIED = true;
let override0201h: boolean | null = null;
export function mig0201hOn(): boolean { return override0201h ?? MIG_0201H_APPLIED; }
export function __set0201hForTest(v: boolean | null): void { override0201h = v; }

/** ★0201e（裁定481＝キャストの締めは店が許可した人だけ・既定 OFF／取り下げ 2 つ／staff_my_work）＋0201e2（キオスクの伝票の読取の直し）: 2026-11-12 Agoora 手貼り＝検証が全行一致（関数 440）。
 *  true＝スタッフ管理の「締めの許可」（set_cast_close）・/mine の取り下げ（drink_claim_withdraw・reservation_withdraw）・スタッフ本人の勤怠（staff_my_work）。 */
export const MIG_0201E_APPLIED = true;
let override0201e: boolean | null = null;
export function mig0201eOn(): boolean { return override0201e ?? MIG_0201E_APPLIED; }
export function __set0201eForTest(v: boolean | null): void { override0201e = v; }

/** ★0201g（作り直し 4・M-156 PIN の重複／推測されやすい PIN／端末ごとのロック／本人の PIN の設定は 24 時間に 5 回／kiosk_staff_list の店長の打刻の許可／ハードの保存の検査／最後の Wi-Fi）: 手貼り＝検証 16 行が全行一致（関数 442）の後に true。
 *  client の文言（weak／taken／too_many・device_locked・pin weak／pin taken）は 28e5f8f9 で先に入れた（貼る前の DB は返さない）。 */
export const MIG_0201G_APPLIED = true;
let override0201g: boolean | null = null;
export function mig0201gOn(): boolean { return override0201g ?? MIG_0201G_APPLIED; }
export function __set0201gForTest(v: boolean | null): void { override0201g = v; }

/** ★0201f（案 1・裁定497-3／499-9）: マイナンバーをアプリ側で暗号化（Vercel の env 2 本）・廃棄の候補を裁定483 に。手貼り＝検証 22 行が全行一致の後に true。
 *  false の間は今のまま（画面の登録は set_cast_sensitive に平文・末尾 4 桁は get_cast_mynumber_masked(p_cast_id)・全桁と CSV は DB の復号）。
 *  true＝登録は /api/cast/mynumber/register（サーバーで暗号化）・末尾 4 桁は /api/cast/mynumber/last4・全桁と CSV はサーバーで復号・廃棄の候補の新しい列・店の年数。 */
export const MIG_0201F_APPLIED = true; // ★2026-11-13 夕: 0201f（sha16 3a7e6d8272b2e0cb・1,197 行）を Agoora が手貼り＝検証 22 行が全行一致（関数 442・表 121・md5 71fdfaac／22106939／b9804c26／760820bc／4b4135d4）→ true
let override0201f: boolean | null = null;
export function mig0201fOn(): boolean { return override0201f ?? MIG_0201F_APPLIED; }
export function __set0201fForTest(v: boolean | null): void { override0201f = v; }

export const MIG_0197_APPLIED = true; // ★2026-11-06: 0197（sha16 f28f737489916c38）を Agoora が手貼り（06:53 UTC・本文 Success）＝verify 17 行が期待値と一致（unique は数え方の差・正本の式では 1）・関数 419・表 120・本文 3 本の md5 一致 → true
let override0197: boolean | null = null;
export function mig0197On(): boolean { return override0197 ?? MIG_0197_APPLIED; }
export function __set0197ForTest(v: boolean | null): void { override0197 = v; }

/** ★0201d（裁定478＝臨時営業／臨時休業を営業日で持つ・price_dow・register_special_open・check_open の門）: 2026-11-13 Agoora 手貼り＝検証 18 行が全行一致（関数 449・表 122）→ true。
 *  true＝開卓のモーダルの臨時営業の問い（店長以上）・キャストとスタッフの案内・特別日の「料金は何曜日と同じ」・日報の印・開卓の見込みの曜日。 */
export const MIG_0201D_APPLIED = true;
let override0201d: boolean | null = null;
export function mig0201dOn(): boolean { return override0201d ?? MIG_0201D_APPLIED; }
export function __set0201dForTest(v: boolean | null): void { override0201d = v; }

/** ★0201i（裁定486＋追補＝お知らせの「確認しました」と出欠）: 2026-11-13 夕 Agoora 手貼り＝検証 18 行が全行一致（関数 447・表 122）→ true。
 *  true＝受け取る側の「確認しました」／出欠（自動の既読をやめる）・作る側の「出欠を取る」と確認／出欠の一覧・ナビとホームの件数＝未確認・未回答・本人の出勤予定に出欠の予定。 */
export const MIG_0201I_APPLIED = true;
let override0201i: boolean | null = null;
export function mig0201iOn(): boolean { return override0201i ?? MIG_0201I_APPLIED; }
export function __set0201iForTest(v: boolean | null): void { override0201i = v; }

/** ★0201l（裁定490-7＝キャストの「体入の条件が終わる日」casts.trial_ends_on）: 2026-11-16 Agoora 手貼り＝検証 8 行が全行一致（関数 450・表 122・casts 21 列）→ true。
 *  true＝給与の集める側（collect）が体入の期間（開始〜trial_ends_on）を読み、体入の式（payOf の trialWageByDay・trialBackExclude＝裁定490）を当てる。false＝casts の体入の列を読まない＝従来と 1 バイト同値。 */
export const MIG_0201L_APPLIED = true;
let override0201l: boolean | null = null;
export function mig0201lOn(): boolean { return override0201l ?? MIG_0201L_APPLIED; }
export function __set0201lForTest(v: boolean | null): void { override0201l = v; }

/** ★0201m（裁定489・相談役■6＝端末のロック中に「名前を選んで入る」一覧 kiosk_unlock_people）: 2026-11-16 Agoora 手貼り＝検証 7 行が全行一致（関数 450・表 122）→ true。
 *  true＝一覧を kiosk_unlock_people（kiosk_login が通す人と同じ＝オーナー・管理者・店長・スタッフ・レジに入れるキャスト・PIN を設定した人）で読む。false＝従来の kiosk_staff_list（店長とスタッフ・has_pin で絞る）。 */
export const MIG_0201M_APPLIED = true;
let override0201m: boolean | null = null;
export function mig0201mOn(): boolean { return override0201m ?? MIG_0201M_APPLIED; }
export function __set0201mForTest(v: boolean | null): void { override0201m = v; }

/** ★0201n（2026-11-18 相談役 C・起票135 の続き＝レジの許可があるキャストが読める列を絞る）: 手貼り前＝false。
 *  true＝キャストの立場のときだけ、レジ（register/page.tsx）と日報（report-board.tsx）のキャストの一覧を register_cast_roster（5 列）で読む
 *  （貼った後は casts の RLS がキャストに自分の行しか返さない）。false＝従来どおり casts を直接読む（0201n の前の RLS＝同じ店の全員）。店長以上・スタッフは常に casts。 */
export const MIG_0201N_APPLIED = true;
let override0201n: boolean | null = null;
export function mig0201nOn(): boolean { return override0201n ?? MIG_0201N_APPLIED; }
export function __set0201nForTest(v: boolean | null): void { override0201n = v; }

/** ★0201q（2026-11-18 16:53 Agoora 手貼り・検証 11 行一致）: set_store_profile の sales_basis・sales_back_default_off／get_cast_sales_subtotal／set_store_line_extra。
 *  true＝LINE の設定の画面がリッチメニューの ID と公式アカウントの ID を set_store_line_extra で保存する（相談役 夜便 ⑤）。
 *  給与の集める側（collect）が sales_basis・sales_back_default_off を読むのは別の便（相談役 夜便 ③＝commit まで・push しない）。 */
export const MIG_0201Q_APPLIED = true;
let override0201q: boolean | null = null;
export function mig0201qOn(): boolean { return override0201q ?? MIG_0201Q_APPLIED; }
export function __set0201qForTest(v: boolean | null): void { override0201q = v; }

/** ★0201r（2026-11-18 夜 起草・相談役 ②＝手貼り前＝false）: 店の端末の入口でキャストが cast_pin で入れる・ロックの既定 5 分（関数 7 本）・テーブルチャージ・連携のリンクの発行し直し。
 *  true＝PIN の設定の画面のロック時間の既定を 5 分に（false＝10 分）・端末のロック中の案内に「あと◯分で解除」を出す（false＝今の文言のまま）。 */
export const MIG_0201R_APPLIED = true; // ★2026-11-18 21:57:44 CC が本番に適用（Agoora の承認・相談役の指示＝手貼りの例外・指紋 3 つ照合・検証 8 行一致）
let override0201r: boolean | null = null;
export function mig0201rOn(): boolean { return override0201r ?? MIG_0201R_APPLIED; }
export function __set0201rForTest(v: boolean | null): void { override0201r = v; }

/** ★0201t（2026-11-19 夜 起草・相談役 ③＝起草と試走まで・手貼り前＝false）: PIN の重なりを照らしていない 3 つの経路（0201g より前・退店から戻した・許可を後から付けた）に印。
 *  true＝PIN の画面に pin_overlap_counts の件数（重なり・未照合）だけを出す（PIN・誰かは出さない）。false＝出さない（関数が無い）。 */
export const MIG_0201T_APPLIED = false;
let override0201t: boolean | null = null;
export function mig0201tOn(): boolean { return override0201t ?? MIG_0201T_APPLIED; }
export function __set0201tForTest(v: boolean | null): void { override0201t = v; }

/** ★0201u（2026-11-20 起草→同日 12:06:50 本番適用＝Agoora の承認で CC が適用・検証 7 行一致→true）: 送りの記録（transport_issue_bulk）を、シフトの許可（can_shift）があるスタッフにも自店だけ開く。
 *  true＝シフトの今日の画面で、シフトの許可があるスタッフにも「送り」と退勤の 2 択（送りを記録して退勤）を出す。false＝スタッフには出さない（退勤だけ）。 */
export const MIG_0201U_APPLIED = true;
let override0201u: boolean | null = null;
export function mig0201uOn(): boolean { return override0201u ?? MIG_0201U_APPLIED; }
export function __set0201uForTest(v: boolean | null): void { override0201u = v; }

/** ★0201v（2026-11-20 起草→同日 18:20:51 本番適用＝Agoora の承認（11/20 18:08 の決定 1）で CC が適用・検証 9 行一致→true）: 今日の送りの一覧（okuri_today_summary）を、自店のスタッフで締めの許可かシフトの許可がある人にも開く。
 *  true＝日報の締めの前の窓で、記録できない人（締めの許可だけのスタッフ）には金額の欄を出さず「記録しないで締める」・一覧を読めない人（締めの許可があるキャスト）には「このまま締める」。false＝今のまま（一覧の読取の失敗で止める）。 */
export const MIG_0201V_APPLIED = true;
let override0201v: boolean | null = null;
export function mig0201vOn(): boolean { return override0201v ?? MIG_0201V_APPLIED; }
export function __set0201vForTest(v: boolean | null): void { override0201v = v; }

/** ★0202a（運営コンソール 版 1・2026-11-20 起草・試走 64/64・本番は未適用＝相談役の読み直しの後）: 運営者の表と関数（ops_operators・ops_org_create ほか）。
 *  true＝/ops の画面と /api/ops/* を開く（requireOperator を通った運営者だけ）。false＝/ops の下と /api/ops/* は全部 404。0202a の適用と検証の後の便で true にする。 */
export const MIG_0202A_APPLIED = true; // ★2026-11-21 12:06:44 本番適用（Agoora の承認 11/20 23:39・CC が適用・検証 18 行とも期待値）＝相談役 11/21 12:10 の P3 で true
let override0202a: boolean | null = null;
export function mig0202aOn(): boolean { return override0202a ?? MIG_0202A_APPLIED; }
export function __set0202aForTest(v: boolean | null): void { override0202a = v; }

/** ★0202b（導入の代行 版 4・2026-11-21 夜 起草・試走は本番 BEGIN…ROLLBACK・本番は未適用）: サポート許可・下書きの代行・LINE 連携の代行・キャストの仮の登録。
 *  true＝運営の「導入を代行する」・店の設定のサポート許可と「導入完了にする」・/setup の「運営が入力」の札と仮の登録の一覧・キャストの画面の「仮の登録」を出す。false＝全部出さない（0202b の関数と表が無い）。
 *  枝 night1121-ops-v2 だけ（push しない）。0202b の適用と検証の後の便で true にする。 */
export const MIG_0202B_APPLIED = true; // ★2026-11-21 21:57:12 本番適用（Agoora が認めた・CC が適用・検証 23 行とも期待値）＝相談役 22:10 の ■3 の通しの後に main へ
let override0202b: boolean | null = null;
export function mig0202bOn(): boolean { return override0202b ?? MIG_0202B_APPLIED; }
export function __set0202bForTest(v: boolean | null): void { override0202b = v; }

/** ★0202e（LINE 連携の確かめを LINE に聞く形に・2026-11-21 夜 起草・試走 19/19・本番は未適用）: onb_line_verify(…, p_result) と ops_org_list の受諾と LINE の確かめの日時。
 *  true＝運営の代行の LINE の 4 段目（確かめ）を押せる（route が Vault のトークンで LINE に聞く）・/ops の「何日前」を受諾と LINE にも出す。false＝押せない（「確かめは次の更新で使えます」）。
 *  枝 night1121-line-verify だけ（push しない）。0202e の適用と検証の後の便で true にする。 */
export const MIG_0202E_APPLIED = true; // ★2026-11-21 23:59:44 本番適用（Agoora が認めた・CC が適用・検証 9 行とも期待値）＝相談役 11/22 0:15 の ■2
let override0202e: boolean | null = null;
export function mig0202eOn(): boolean { return override0202e ?? MIG_0202E_APPLIED; }
export function __set0202eForTest(v: boolean | null): void { override0202e = v; }

/** ★0202f（ホストの骨格・2026-11-22 起草・相談役 0:15 の ■3＝起草と試走まで・本番は未適用）: comp_plans.commission_tiers（歩合の段の表）と guarantee_min の params.unit（'day'＝日給 × 出勤日数）。
 *  true＝collect が commission_tiers を読む・プランの編集の画面に段の表の欄。false＝読まない（列が無い）＝今の計算と 1 バイト同値。
 *  枝 night1122-host-core だけ（push しない）。式は相談役が前後の比べを読んでから合図。 */
export const MIG_0202F_APPLIED = true; // ★2026-11-22 03:02:33 本番適用（Agoora が認めた・CC が適用・検証 9 行とも期待値）＝相談役 11/22 3:00
let override0202f: boolean | null = null;
export function mig0202fOn(): boolean { return override0202f ?? MIG_0202F_APPLIED; }
export function __set0202fForTest(v: boolean | null): void { override0202f = v; }

/** ★0205 v2（起票145／147・相談役 11/24 2:20 の ■2・2026-11-24 起草・試走 36 件・本番は未適用）: 勤務と給与期の「今日」を営業日（biz_date_of）に・set_cast_plan の案 A（日付なし＝営業日の月の 1 日から・下限＝最後に確定した期の翌日）。
 *  true＝待遇の割当の日付の欄の空を「今月（YYYY 年 M 月）分から」・報酬型の保存の文に「（YYYY 年 M 月分から）」・プラン切替の日付の下限を最後に確定した期の翌日に。false＝今のまま（今日以降・空＝今すぐ）。
 *  枝 night1124-0205v2 だけ（push しない）。0205 の適用と検証の後の便で true にする。 */
export const MIG_0205_APPLIED = true; // ★相談役 11/24 4:10 の ■1：0205 版 2 の適用の後の便で true（適用の時刻は台帳）
let override0205: boolean | null = null;
export function mig0205On(): boolean { return override0205 ?? MIG_0205_APPLIED; }
export function __set0205ForTest(v: boolean | null): void { override0205 = v; }

/** ★0206（起票146 案・相談役 11/23 23:10 の ■2＝案まで・枝 emp-history-1124 だけ・main に入れない）: 契約区分の履歴 cast_employment。
 *  true のとき給与の集め（collect）は、期首に有効な契約区分の行を読む（無ければ期の中で最も早い行・履歴が無い人は casts.employment＝今と同じ）。
 *  false＝今と同じ（casts.employment を読む）。本番は未適用。 */
export const MIG_0206_APPLIED = true; // ★相談役 11/24 4:10 の ■2：0206 版 2 の適用の後の便で true（適用の時刻は台帳）
let override0206: boolean | null = null;
export function mig0206On(): boolean { return override0206 ?? MIG_0206_APPLIED; }
export function __set0206ForTest(v: boolean | null): void { override0206 = v; }
