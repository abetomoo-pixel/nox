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
export const MIG_0187_APPLIED = false;
let override0187: boolean | null = null;
export function mig0187On(): boolean { return override0187 ?? MIG_0187_APPLIED; }
export function __set0187ForTest(v: boolean | null): void { override0187 = v; }
/** ★0188（裁定433 税率表＋裁定434 源泉区分 4 つ・2026-10-29 起草）: Agoora が手貼りしたら true。false の間＝区分 other_204 の選択肢・税率表の読取・日払いの種別の出し分け（settlement は daily の店だけ）・pay.ts の税率表参照は出さない／読まない */
export const MIG_0188_APPLIED = false;
let override0188: boolean | null = null;
export function mig0188On(): boolean { return override0188 ?? MIG_0188_APPLIED; }
export function __set0188ForTest(v: boolean | null): void { override0188 = v; }
/** ★0189（M-16 の翌表記＝staffing_needs の時間帯を翌 24:00 まで・2026-10-29 起草）: Agoora が手貼りしたら true。false の間＝必要人数の時間帯の選択肢は 24:00 まで（翌の選択肢を出さない） */
export const MIG_0189_APPLIED = false;
let override0189: boolean | null = null;
export function mig0189On(): boolean { return override0189 ?? MIG_0189_APPLIED; }
export function __set0189ForTest(v: boolean | null): void { override0189 = v; }
