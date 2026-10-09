/*
 * verify:nox-messages — 裁定281（メッセージ表示の型）の係留（純関数＋許可列挙型 pin・DB 不触・env 不要）。f0 61 段目。
 *  (1) components/ui/toast.tsx の純関数: messagePrefix（！／✓／△／なし）・messageRole（error=alert・他 status）・messageTokens（既存トークンのみ・新トークン 0）・
 *      messageKindOf（文言→種別: 失敗／エラー／できません…→error が success の語より優先・しました→success・他 info）
 *  (2) 許可列挙型 pin（裁定260）: エラー／結果の文言を共通部品（Toast／Message）を経由せず素の <p>／<span> で直接描画している箇所＝0。
 *      検査パターン＝ `<(p|span|div|small|b|strong)[^>]*>{<識別子>}</…>` で識別子が msg／err／error／notice／message を含むもの、
 *      および `color: <msg>.(includes|startsWith)(…) ? "var(--bad)"` 型の色分岐。除外リスト＝EXCLUDE（共通部品自身）。
 *  逆テスト 1 本（手動・1 回）: messageKindOf の ERROR_WORDS から「失敗」を外す→ms(1-6) 赤・戻して緑（git を使わない）。
 */
import fs from "node:fs";
import path from "node:path";
import { messageKindOf, messagePrefix, messageRole, messageTokens } from "../components/ui/toast";
import { rpcErrJa } from "../lib/nox/ui/rpc-err"; // ★N2-2（2026-09-18）: 生 RPC 語の共通写像
import { payStatusCellOf } from "../lib/nox/payroll/ui-calc"; // ★便 X-7: 状態列の文言（純関数）
import { paymentMethodLabelOf } from "../lib/nox/payroll/payment-method"; // ★裁定311-①
import { payoutDiffNoteOf, CASH_PAYOUT_LABELS } from "../lib/nox/report/cash-payout"; // ★裁定311-②／④
import { finalizeGuardOf, mdLabelOf } from "../lib/nox/payroll/finalize-guard"; // ★裁定316（便 X-8-13）
import { HM_FORMAT_ERR, hmRangeErrorOf, maskHHMM, normalizeHHMM } from "../lib/nox/time/hhmm"; // ★裁定318（便 X-9-2）・追補（便 X-10-3）
import { okuriAmountOf, okuriDefaultAmountOf, okuriDefaultNoteOf } from "../lib/nox/shift/okuri-default"; // ★裁定317（便 X-9-3）
import { candidatesOf, idleCandidatesOf, pageOf, searchCandidatesOf, lastVisitLabelOf } from "../lib/nox/register/customer-candidates"; // ★便 X-11-2b
import { castPickerOrder, offDutyToggleLabelOf } from "../lib/nox/register/cast-picker-order"; // ★裁定322
import { moneyDigitsOf, moneyDisplayOf, moneyValueOf } from "../lib/nox/ui/money"; // ★便 X-11-6
import { stocktakePlanOf, stocktakeRowsOf } from "../lib/nox/stock/stocktake"; // ★裁定323
import { attentionCarryOf, attentionLineOf, isFinalizedDay, nextPeriodOf, splitAttentions, POST_FINALIZE_NOTE, type AttentionRow } from "../lib/nox/payroll/attention"; // ★裁定315（便 AB-2／AB-3）
import { okuriSelfPlanOf, okuriResultTextOf, OKURI_PENDING_NOTE } from "../lib/nox/shift/okuri-self"; // ★裁定319（便 AB-4／AB-5）
import { keptLineIdsOf } from "../lib/nox/register/kept-lines"; // ★裁定314（便 AB-7）
import { carriedBulkNoteOf, carriedNoteOf, dailyPayPeriodNoteOf, dailyPayOverNoteOf } from "../lib/nox/payroll/advance-okuri"; // ★裁定312（便 AB-8）・起票93（便 X-12-2）
import { notEndedMessageOf } from "../lib/nox/payroll/finalize-guard"; // ★裁定316（便 AB-9）
import { popoverBoxOf, HEADER_H, POP_GAP } from "../lib/nox/ui/popover"; // ★起票94（便 X-12-3）

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// (1) 純関数
check("ms(1-1) messagePrefix: error ！／success ✓／warn △／info なし", messagePrefix("error") === "！" && messagePrefix("success") === "✓" && messagePrefix("warn") === "△" && messagePrefix("info") === "");
check("ms(1-2) messageRole: error=alert・success／warn／info=status", messageRole("error") === "alert" && messageRole("success") === "status" && messageRole("warn") === "status" && messageRole("info") === "status");
const tok = (["error", "success", "warn", "info"] as const).map((k) => messageTokens(k));
const KNOWN = /^var\(--(danger-bd|danger-soft|danger-ink|success|success-soft|warning|warning-soft|line2|card2|ink)\)$/;
check("ms(1-3) messageTokens: 4 種とも既存トークンのみ（新トークン 0）", tok.every((t) => KNOWN.test(t.border) && KNOWN.test(t.bg) && KNOWN.test(t.ink)), JSON.stringify(tok));
check("ms(1-4) error は赤系（danger）・success は緑系（success）・warn は黄系（warning）＝色だけでなく記号でも区別", /danger/.test(tok[0].bg) && /success/.test(tok[1].bg) && /warning/.test(tok[2].bg) && messagePrefix("error") !== messagePrefix("success"));
check("ms(1-5) messageKindOf: 成功の語→success（保存しました／コピーしました／完了）", messageKindOf("保存しました") === "success" && messageKindOf("コピーしました") === "success" && messageKindOf("取り込み完了") === "success");
check("ms(1-6) messageKindOf: 失敗の語は success の語より優先（保存に失敗しました→error）・できません／ください／権限／エラー→error", messageKindOf("保存に失敗しました") === "error" && messageKindOf("入金後は取り消しできません") === "error" && messageKindOf("金額を入力してください") === "error" && messageKindOf("権限がありません") === "error" && messageKindOf("エラー: forbidden") === "error");
check("ms(1-7) messageKindOf: 中立の文言→info", messageKindOf("履歴はありません。") === "info" && messageKindOf("読み込み中") === "info");
check("ms(1-8) messageKindOf: 生の RPC エラー語（bad name／not open／forbidden／billing locked／merge_conflict:money）→error（日本語化されない画面の保険）", messageKindOf("bad name") === "error" && messageKindOf("not open") === "error" && messageKindOf("forbidden") === "error" && messageKindOf("billing locked") === "error" && messageKindOf("merge_conflict:money") === "error");

// (1b) ★N2-2: 生 RPC 語の共通写像 rpcErrJa（純関数）。逆テスト＝MAP の 'exceeds balance' 行を消す→ms(1b-1) 赤
check("ms(1b-1) rpcErrJa: 'bad name'／'exceeds balance'／'has payments' が利用者向けの日本語に", rpcErrJa("bad name") === "名前が長すぎるか、使えない文字が含まれています" && rpcErrJa("exceeds balance") === "入金額が残額を超えています" && /入金後は変更できません/.test(rpcErrJa("has payments")));
check("ms(1b-2) rpcErrJa: 写像に無い英字コードは「処理できませんでした（コード: xxx）」・日本語はそのまま・空は「処理できませんでした」", rpcErrJa("weird_code_x") === "処理できませんでした（コード: weird_code_x）" && rpcErrJa("保存に失敗しました") === "保存に失敗しました" && rpcErrJa(null) === "処理できませんでした");
check("ms(1b-3) rpcErrJa: 0151 の新語（reason required／biz_date_past／guarantee exists／bad valid_from／bad valid_to／period_not_open）", /理由/.test(rpcErrJa("reason required")) && /過去の営業日/.test(rpcErrJa("biz_date_past")) && /保証時給/.test(rpcErrJa("guarantee exists")) && /開始日/.test(rpcErrJa("bad valid_from")) && /終了日/.test(rpcErrJa("bad valid_to")) && rpcErrJa("period_not_open") === "この日は募集期間外です");
check("ms(1b-4) rpcErrJa: 写像後の文言は messageKindOf で error に倒れる（赤で出る）", ["bad name", "exceeds balance", "forbidden", "weird_code_x"].every((c) => messageKindOf(rpcErrJa(c)) === "error"));
// ★0155（裁定309・便 S-2）: 'ar disabled'（店設定 ar_enabled=false の売掛）は「この店では売掛を使えません」＝二重防御の文言。廃棄・匿名化の 2 語も同便で写像
check("ms(1b-5) rpcErrJa: 0155 の新語（ar disabled／no mynumber／already anonymized）が利用者向けの日本語に・error に倒れる", rpcErrJa("ar disabled") === "この店では売掛を使えません" && /マイナンバー/.test(rpcErrJa("no mynumber")) && /匿名化/.test(rpcErrJa("already anonymized")) && ["ar disabled", "no mynumber", "already anonymized"].every((c) => messageKindOf(rpcErrJa(c)) === "error"));
// ★0156（裁定309-6〜9・便 V）: 日払い（paid period）・控除上書き（bad enabled／bad deduction／bad cast）・送り一括（okuri not actual／duplicate cast）
check("ms(1b-6) rpcErrJa: 0156 の新語 6 語が利用者向けの日本語に・error に倒れる", /支払済み/.test(rpcErrJa("paid period")) && /ON／OFF/.test(rpcErrJa("bad enabled")) && /固定控除/.test(rpcErrJa("bad deduction")) && /所属/.test(rpcErrJa("bad cast")) && /定額/.test(rpcErrJa("okuri not actual")) && /2 回以上/.test(rpcErrJa("duplicate cast")) && ["paid period", "bad enabled", "bad deduction", "bad cast", "okuri not actual", "duplicate cast"].every((c) => messageKindOf(rpcErrJa(c)) === "error"));

// (2) 許可列挙型 pin（素の描画 0）
// 除外: 共通部品自身／kiosk の打刻結果画面（app/kiosk/page.tsx L233 `{result.message}`＝全画面の結果表示・裁定11 の kiosk 面＝メッセージ枠ではない）
const EXCLUDE = new Set(["components/ui/toast.tsx", "app/kiosk/page.tsx"]);
const ROOTS = ["app", "components"];
const RAW = /<(p|span|div|small|b|strong)[^>]*>\{[A-Za-z]*(msg|Msg|err|Err|error|Error|notice|Notice|message|Message)[A-Za-z]*\}<\/\1>/g;
// ★便 AB-2: オブジェクトのプロパティ経由（{msg.text}／{result.message} 等）の素の描画も検出（U の識別子条件を素通りした register-board の 4 箇所ほか）
const RAW_PROP = /<(p|span|div|small|b|strong)[^>]*>\{[A-Za-z]+\.(text|message|msg)\}<\/\1>/g;
const COLOR_BRANCH = /color:\s*[A-Za-z]*(msg|Msg|err|Err)[A-Za-z]*\.(includes|startsWith)\([^)]*\)\s*\?\s*"var\(--(bad|ok|danger[^"]*|success[^"]*)\)"/g;
const BARE = /^\s*\{(msg|err|error|notice)\}\s*$/;
// ★N2-2: 生の error.message を写像なしで表示 state に置く形（setMsg(error.message)／text: error.message／setMsg(error ? error.message : …)）＝0
const RAW_ERRMSG = /(setMsg|setErr|setError)\((error|e|err)\.message\)|text:\s*(error|e|err)\.message|setMsg\(error \? error\.message/g;
function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p.replace(/\\/g, "/"));
  }
}
const files: string[] = [];
for (const r of ROOTS) if (fs.existsSync(r)) walk(r, files);
const hits: string[] = [];
for (const f of files) {
  if (EXCLUDE.has(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(RAW)) hits.push(`${f}: ${m[0].slice(0, 80)}`);
  for (const m of src.matchAll(RAW_PROP)) hits.push(`${f}: prop ${m[0].slice(0, 80)}`);
  src.split("\n").forEach((l, i) => { if (/^\s*(\/\/|\*|\{\/\*)/.test(l)) return; for (const m of l.matchAll(RAW_ERRMSG)) hits.push(`${f}:${i + 1}: raw error.message ${m[0].slice(0, 80)}`); });
  for (const m of src.matchAll(COLOR_BRANCH)) hits.push(`${f}: 色分岐 ${m[0].slice(0, 80)}`);
  src.split("\n").forEach((l, i) => { if (BARE.test(l)) { const prev = src.split("\n")[i - 1] ?? ""; if (!/Message|Toast/.test(prev)) hits.push(`${f}:${i + 1}: 素の ${l.trim()}`); } });
}
check(`ms(2-1) 素の <p>／<span> でのメッセージ直接描画＝0（走査 ${files.length} ファイル・除外 ${EXCLUDE.size}）`, hits.length === 0, hits.slice(0, 10).join(" | "));
// ★裁定306-9（2026-09-25）: 画面上の「黒服」は「スタッフ」に統一＝app／components／lib の .ts／.tsx に「黒服」0（許可列挙＝台帳・docs のみ。コードの識別子（staff_*）は不変）
{
  const walk2 = (dir: string, out: string[]) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p2 = path.join(dir, e.name); if (e.isDirectory()) walk2(p2, out); else if (/\.tsx?$/.test(e.name)) out.push(p2.replace(/\\/g, "/")); } };
  const all: string[] = []; for (const r of ["app", "components", "lib"]) if (fs.existsSync(r)) walk2(r, all);
  const kuro = all.filter((f) => fs.readFileSync(f, "utf8").includes("黒服"));
  check(`ms(3-1) 306-9 用語統一: app／components／lib に「黒服」0（走査 ${all.length} ファイル）`, kuro.length === 0, kuro.slice(0, 8).join(", "));
}
const toastSrc = fs.readFileSync("components/ui/toast.tsx", "utf8");
check("ms(2-2) Toast は Message を経由（kind 未指定は messageKindOf）・Message は role と data-message-kind を持つ", /messageKindOf\(msg\)/.test(toastSrc) && /role=\{messageRole\(kind\)\}/.test(toastSrc) && /data-message-kind=\{kind\}/.test(toastSrc));
const shiftSrc = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("ms(2-3) shift-board: 期間フォームの成否はカード内（pMsg→Message）・タブ切替で共有 msg と pMsg を消す（281-3／281-4）", /useEffect\(\(\) => \{ setMsg\(null\); setPMsg\(null\); \}, \[tab\]\)/.test(shiftSrc) && /\{pMsg && <Message kind=\{pMsg\.kind\}/.test(shiftSrc) && /overlappingPeriods\(/.test(shiftSrc));

// ★裁定310（2026-09-28・便 X-2）: /shift 今日タブの「調整」モーダル＝タブ①出退勤（既定）／②確定シフトの時間。注記 2 文。行の「出勤を修正／退勤を修正」リンクは廃止（0）
check("ms(2-4) shift-board: 調整モーダルはタブ 2 つ（出退勤／確定シフトの時間）・注記『給与に反映されます』『打刻は変わりません・給与は動きません』・行の『を修正』リンク 0・修正は PunchCorrectionForm", /確定シフトの時間を調整/.test(shiftSrc) && /給与に反映されます/.test(shiftSrc) && /打刻は変わりません・給与は動きません/.test(shiftSrc) && !/{KIND_LABEL[k]}を修正/.test(shiftSrc) && !/PunchCorrectionModal/.test(shiftSrc) && /<PunchCorrectionForm/.test(shiftSrc) && /role="tablist" aria-label="調整の対象"/.test(shiftSrc));
// ★便 X-7（2026-09-28）: キャスト行「状態」＝run の status と整合（paid→支払済・部分払い→一部 ¥残・他→未払・cp なし→未確定）
check("ms(2-5) payStatusCellOf: paid→支払済／一部 ¥残（net−Σpaid）／未払／未確定／全額→支払済", payStatusCellOf("paid", { net: 100, paid: 0 }).label === "支払済" && payStatusCellOf("finalized", { net: 10000, paid: 4000 }).label === "一部 ¥6,000" && payStatusCellOf("finalized", { net: 100, paid: 0 }).label === "未払" && payStatusCellOf("draft", null).label === "未確定" && payStatusCellOf("finalized", { net: 100, paid: 100 }).label === "支払済" && payStatusCellOf("finalized", { net: 10000, paid: 4000 }).tone === "part");

// ★裁定311（2026-09-28・便 Y）: ①method 選択式（null／other→その他・cash→現金・transfer→振込・旧自由文はそのまま）②④注記「集計 ¥n と差 ±¥m」・内訳 4 語 ③履歴
const paySrc = fs.readFileSync("app/(manage)/payroll/payment-panel.tsx", "utf8");
const reportSrc = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
check("ms(2-6) 裁定311: paymentMethodLabelOf／payoutDiffNoteOf の文言・payment-panel は select（自由入力 placeholder 0）＋履歴・report-board は内訳 4 語＋注記",
  paymentMethodLabelOf(null) === "その他" && paymentMethodLabelOf("other") === "その他" && paymentMethodLabelOf("cash") === "現金" && paymentMethodLabelOf("transfer") === "振込" && paymentMethodLabelOf("振込済") === "振込済"
  && payoutDiffNoteOf(1000, 1000) === null && payoutDiffNoteOf(1000, 800) === "集計 ¥1,000 と差 −¥200" && payoutDiffNoteOf(1000, 1500) === "集計 ¥1,000 と差 +¥500"
  && paySrc.includes('<select value={pmethod[l.castId] ?? "cash"}') && !paySrc.includes("方法(振込等)") && paySrc.includes("支払履歴（{period}）") && paySrc.includes("paymentMethodLabelOf(h.method)")
  && reportSrc.includes("payoutDiffNoteOf(total, payout)") && reportSrc.includes("cashPayoutRowsOf(payoutParts)") && ["送り実費", "前借り", "日払い", "給与支払（現金）"].every((w) => Object.values(CASH_PAYOUT_LABELS).includes(w)));

// ★裁定313（2026-09-29・便 X-8-2）: 今日タブの行＝1 段。操作列は「時刻修正」「減額」・行内テキストリンク 0（精算調整を登録／を修正）・出勤記録は .nox-attrow
check("ms(2-7) 裁定313: shift-board 今日タブ＝時刻修正／減額ボタン・行内リンク 0・nox-attrow・退勤は同段・操作列は isManagerUp のときだけ",
  shiftSrc.includes(">時刻修正</button>") && shiftSrc.includes(">減額</button>") && !shiftSrc.includes("精算調整を登録</button>") && !/\{KIND_LABEL\[k\]\}を修正/.test(shiftSrc)
  && shiftSrc.includes('<div className="nox-attrow">') && shiftSrc.includes("{isManagerUp && <th>操作</th>}") && shiftSrc.includes("出勤（出勤・遅刻・同伴）を記録すると押せます"));
// ★裁定316（便 X-8-13）: 確定は期間終了の翌営業日から。文言と判定は純関数 1 本・API は 400 'period not ended'・rpcErrJa は error に倒れる
const finSrc = fs.readFileSync("app/api/payroll/finalize/route.ts", "utf8");
const payBoardSrc = fs.readFileSync("app/(manage)/payroll/payroll-board.tsx", "utf8");
const g930 = finalizeGuardOf("2026-09-30", "2026-09-30");
const g1001 = finalizeGuardOf("2026-09-30", "2026-10-01");
check("ms(2-8) 裁定316: finalizeGuardOf（期末当日＝不可・翌営業日＝可）・文言「期間終了（9/30）の翌日から確定できます」・route は run_create の前に 400・画面は確定ボタンを無効化",
  g930.ok === false && (g930 as { message: string }).message === "期間終了（9/30）の翌日から確定できます" && g1001.ok === true && finalizeGuardOf("2026-09-30", "2026-09-29").ok === false && mdLabelOf("2026-01-05") === "1/5"
  && messageKindOf(rpcErrJa("period not ended")) === "error" && /翌日から確定できます/.test(rpcErrJa("period not ended"))
  && finSrc.indexOf("finalizeGuardOf(win.periodEnd") > 0 && finSrc.indexOf("finalizeGuardOf(win.periodEnd") < finSrc.indexOf('rpc("payroll_run_create"')
  && payBoardSrc.includes("disabled={busy || !guard.ok || blockers.length > 0 || rows.length === 0}"));
// ★裁定314（便 X-8-10）・便 X-8-8／X-8-9: キープ・領収書 QR・取消して分け直す
const regSrc = fs.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
const keepSrc = fs.readFileSync("components/nox/line-keep-button.tsx", "utf8");
check("ms(2-9) 裁定314／X-8-8／X-8-9: ボトル行のキープ（bottle_keep_register・p_check_line_id・キープ済み・指名・席タブへ）・QR 全画面・取消して分け直す（receipt_issue_void）",
  regSrc.includes('l.kind === "bottle" && check && (') && regSrc.includes("<LineKeepButton") && regSrc.includes('onNeedCustomer={() => setDtab("nom")}')
  && keepSrc.includes('rpc("bottle_keep_register"') && keepSrc.includes("p_check_line_id: lineId") && keepSrc.includes("キープ済み") && keepSrc.includes("指名・席タブへ")
  && regSrc.includes('className="nox-rcpt-qr"') && regSrc.includes('className="nox-qrfull"') && regSrc.includes(">取消して分け直す</button>") && regSrc.includes('rpc("receipt_issue_void"')
  && messageKindOf("領収書の取消に失敗しました: 権限がありません（店長以上）") === "error" && messageKindOf("領収書を取り消しました。金額を入れて発行し直せます") === "success");

// ★裁定318（2026-09-29・便 X-9-2）: 時刻入力の正規化（HHMM／HH:MM／H:MM／HH・翌日 24〜47・全角→半角）と文言
const hmSrc = fs.readFileSync("components/ui/hm-input.tsx", "utf8");
check("ms(2-10) 裁定318: normalizeHHMM（2000→20:00・20:00・9:30→09:30・20→20:00・2530→25:30・47:59 可・48:00／20:60／abc／空は null・開始欄は 23 時まで）・文言・部品は inputMode numeric＋blur 正規化",
  normalizeHHMM("2000") === "20:00" && normalizeHHMM("20:00") === "20:00" && normalizeHHMM("9:30") === "09:30" && normalizeHHMM("20") === "20:00" && normalizeHHMM("900") === "09:00"
  && normalizeHHMM("2530") === "25:30" && normalizeHHMM("47:59") === "47:59" && normalizeHHMM("48:00") === null && normalizeHHMM("20:60") === null && normalizeHHMM("abc") === null && normalizeHHMM("") === null
  && normalizeHHMM("２０：３０") === "20:30" && normalizeHHMM("2530", 23) === null && normalizeHHMM("2359", 23) === "23:59"
  && HM_FORMAT_ERR === "時刻の形式が不正です（例 2000・20:00）" && messageKindOf(HM_FORMAT_ERR) === "error"
  && hmSrc.includes('inputMode="numeric"') && hmSrc.includes("onBlur=") && hmSrc.includes("normalizeHHMM(e.target.value, maxHour)")
  && !/HH:MM（00:00〜47:59）で入力してください|HH:MM 形式で入力してください/.test(fs.readFileSync("lib/nox/shift/punch-correction.ts", "utf8") + shiftSrc)
  && (shiftSrc.match(/<HmInput /g) ?? []).length === 4);
// ★裁定317（便 X-9-3）: 送りの既定額の順（店設定→直近の送り→空欄必須）・金額の検査・文言の種別・shift-board は「送り」→ダイアログ→punch_proxy(p_okuri true)→transport_issue_bulk(idem＝punch id)
const okuriDlgSrc = fs.readFileSync("components/nox/okuri-out-dialog.tsx", "utf8");
const reportSrc2 = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
check("ms(2-11) 裁定317: okuriDefaultAmountOf の順・okuriAmountOf・文言の種別・shift-board の配線・締め前モーダルの発行済み確認",
  JSON.stringify(okuriDefaultAmountOf(1500, 2000)) === JSON.stringify({ amount: 1500, source: "store" }) && JSON.stringify(okuriDefaultAmountOf(null, 2000)) === JSON.stringify({ amount: 2000, source: "last" })
  && JSON.stringify(okuriDefaultAmountOf(0, null)) === JSON.stringify({ amount: null, source: null }) && JSON.stringify(okuriDefaultAmountOf("1500", undefined)) === JSON.stringify({ amount: null, source: null })
  && okuriAmountOf("1500") === 1500 && okuriAmountOf(" 0 ") === null && okuriAmountOf("-5") === null && okuriAmountOf("1.5") === null && okuriAmountOf("") === null
  && /金額を入力してください/.test(okuriDefaultNoteOf({ amount: null, source: null })) && /店の送りベース額/.test(okuriDefaultNoteOf({ amount: 1, source: "store" })) && /前回の送り額/.test(okuriDefaultNoteOf({ amount: 1, source: "last" }))
  && messageKindOf("A の退勤は記録しました。送りの発行に失敗したため、送りは未発行です（x）。日報の締めの前に発行できます") === "error" && messageKindOf("A の退勤を記録し、送り ¥1,500 を発行しました") === "success"
  && shiftSrc.includes('p_type: "out", p_note: null, p_okuri: true') && shiftSrc.includes("p_idem_key: punchId as string") && shiftSrc.includes("<OkuriOutDialog") && !shiftSrc.includes("setOkuriMark")
  && shiftSrc.indexOf('p_okuri: true') < shiftSrc.indexOf('rpc("transport_issue_bulk"')
  && okuriDlgSrc.includes("確定して退勤") && reportSrc2.includes("発行済み {okuriIssued.n} 件・合計") && reportSrc2.includes("確認して締める"));

// ★裁定318 追補（2026-09-29・便 X-10-3）: 入力マスク（数字のみ・最大 4 桁・2 桁で ':'・5 桁目無視・貼り付けも同形・全角）と範囲外のその場判定・送信非活性
const hmUsers = ["components/nox/punch-correction-modal.tsx", "app/mine/punch-correction-form.tsx", "app/mine/attendance-form.tsx", "app/mine/wishes/wish-form.tsx", "app/(manage)/shift/day-add-panel.tsx", "app/(manage)/shift/shift-add-form.tsx", "app/(manage)/shift/shift-board.tsx"];
check("ms(2-12) 裁定318 追補: maskHHMM（2→2・20→20:・203→20:3・2030→20:30・20301→20:30・貼り付け 20:30／２０３０／9:30→09:30・英字は落とす）・削除（20:→2・20:3→20）・範囲外の文言（時／分・開始欄は 23 まで）・全経路で送信非活性",
  maskHHMM("2", "") === "2" && maskHHMM("20", "2") === "20:" && maskHHMM("20:3", "20:") === "20:3" && maskHHMM("20:30", "20:3") === "20:30" && maskHHMM("20:301", "20:30") === "20:30"
  && maskHHMM("20:30", "") === "20:30" && maskHHMM("２０３０", "") === "20:30" && maskHHMM("9:30", "") === "09:30" && maskHHMM("ab1c2", "") === "12:" && maskHHMM("", "2") === ""
  && maskHHMM("20", "20:", true) === "2" && maskHHMM("20:", "20:3", true) === "20" && maskHHMM("20:3", "20:30", true) === "20:3" && maskHHMM("203", "20", false) === "20:3"
  && hmRangeErrorOf("48:") === "時は 00〜47 で入力してください" && hmRangeErrorOf("47:59") === null && hmRangeErrorOf("20:6") === "分は 00〜59 で入力してください" && hmRangeErrorOf("20:59") === null
  && hmRangeErrorOf("24:", 23) === "時は 00〜23 で入力してください" && hmRangeErrorOf("23:59", 23) === null && hmRangeErrorOf("") === null && hmRangeErrorOf("2") === null
  && messageKindOf("時は 00〜47 で入力してください") === "error" && messageKindOf("分は 00〜59 で入力してください") === "error"
  && normalizeHHMM("20:") === "20:00" && normalizeHHMM("20:3") === null
  && hmSrc.includes("maskHHMM(e.target.value, value, it.startsWith(\"delete\"))") && hmSrc.includes("hmRangeErrorOf(value, maxHour)") && hmSrc.includes('<Message kind="error"')
  && hmUsers.every((f) => { const s2 = fs.readFileSync(f, "utf8"); return s2.includes("<HmInput ") && s2.includes("hmRangeErrorOf("); }));
// ★裁定320（便 X-10-2）: 領収書の分割発行 UI
check("ms(2-13) 裁定320: 分割して発行（行・最後の行は自動残額・行を追加・n 枚を発行・1 枚ずつ receipt_issue・失敗で停止）・取消して分け直す の後は分割 UI を開く・文言の種別",
  regSrc.includes(">分割して発行</button>") && regSrc.includes(">行を追加</button>") && regSrc.includes("枚を発行") && regSrc.includes("const splitAuto = remain - ") && regSrc.includes("if (error) { failed = rcptErrJa(error.message); break; }")
  && regSrc.includes("if (!failed) openSplit();") && regSrc.includes('className="nox-splitrow"')
  && messageKindOf("1 枚を発行しました。2 枚目の発行に失敗したため中止しました: 権限がありません") === "error" && messageKindOf("領収書を 3 枚発行しました") === "success");

// ★裁定321／便 X-11-2b／X-11-3（2026-09-29）: レジ顧客カード＝新規登録して追加・候補表示・文言の位置
const cardSrc = fs.readFileSync("components/nox/check-customers-card.tsx", "utf8");
const cs = candidatesOf(
  [{ id: "a", name: "青木", furigana: "あおき", tel: "090-1111-2222" }, { id: "b", name: "馬場", furigana: "ばば", tel: null }, { id: "c", name: "千葉", furigana: "ちば", tel: "03-5555-0000" }, { id: "d", name: "土井", furigana: "どい" }],
  [{ customer_id: "a", last_visit: "2026-09-01T12:00:00Z", cast_id: "k1", visits: 3 }, { customer_id: "b", last_visit: "2026-09-20T12:00:00Z", cast_id: "k2", visits: 1 }, { customer_id: "c", last_visit: null, cast_id: "k1", visits: 0 }],
  new Set(["d"]));
const idleC = idleCandidatesOf(cs, ["k1"]);
check("ms(2-14) 裁定321／X-11-2b: 候補（伝票の顧客は外す・最近来店は来店ありだけ降順・担当は重複なし）・検索（名前／ふりがな／電話の数字・最終来店の降順）・10 件ずつ・カードの配線と文言",
  cs.length === 3 && JSON.stringify(idleC.recent.map((c) => c.id)) === JSON.stringify(["b", "a"]) && JSON.stringify(idleC.mine.map((c) => c.id)) === JSON.stringify(["c"])
  && JSON.stringify(searchCandidatesOf(cs, "ば").map((c) => c.id)) === JSON.stringify(["b", "c"]) && JSON.stringify(searchCandidatesOf(cs, "5555").map((c) => c.id)) === JSON.stringify(["c"]) && searchCandidatesOf(cs, "").length === 0
  && JSON.stringify(searchCandidatesOf(cs, "09011").map((c) => c.id)) === JSON.stringify(["a"]) && pageOf(Array.from({ length: 25 }, (_, i) => i), 10).rows.length === 10 && pageOf(Array.from({ length: 25 }, (_, i) => i), 20).rest === 5
  && lastVisitLabelOf(null) === "来店なし" && lastVisitLabelOf("2026-09-20T12:00:00Z") === "最終 2026/9/20"
  && cardSrc.includes('rpc("customer_register"') && cardSrc.includes('rpc("check_customer_add", { p_check_id: checkId, p_customer_id: r1.data as string })') && cardSrc.includes("を登録して付けました") && cardSrc.includes(">新規登録して追加</button>")
  && cardSrc.includes("最近来店") && cardSrc.includes("担当キャストの顧客") && cardSrc.includes("さらに表示（残り") && !cardSrc.includes("<Picker") && cardSrc.includes('e.key === "ArrowDown"')
  && cardSrc.includes('{ kind: "success", text: `${name} を登録して付けました` }') && messageKindOf("顧客の新規登録に失敗: 登録する権限がありません（店長・顧客権限のあるスタッフから登録してください）") === "error" && messageKindOf("山田 を登録しましたが、伝票への追加に失敗: 権限がありません") === "error");
// ★裁定322（便 X-11-5）: レジのキャスト選択の並び（①接客中→②出勤中→③未出勤シフトあり→④未出勤・群の中は名前順）
const cpSrc = fs.readFileSync("components/nox/cast-picker.tsx", "utf8");
const ord = castPickerOrder([{ id: "1", name: "れい" }, { id: "2", name: "あい" }, { id: "3", name: "かな" }, { id: "4", name: "さき" }, { id: "5", name: "うた" }, { id: "6", name: "えま" }],
  { seatedIds: new Set(["4"]), servingIds: new Set(["1"]), punchedInIds: new Set(["3", "4", "6"]), shiftIds: new Set(["2", "3"]) });
check("ms(2-15) 裁定322: castPickerOrder（①さき・れい→②えま・かな→③あい→④うた）・working は①②・折りたたみの文言・CastPicker は grouped で lib の並びを使い既定チップ＝出勤中・register の 2 面に適用",
  JSON.stringify(ord.map((c) => c.name)) === JSON.stringify(["さき", "れい", "えま", "かな", "あい", "うた"]) && JSON.stringify(ord.map((c) => c.group)) === JSON.stringify([1, 1, 2, 2, 3, 4]) && ord.filter((c) => c.working).length === 4
  && offDutyToggleLabelOf(2, false) === "未出勤を表示（2 人）" && offDutyToggleLabelOf(2, true) === "未出勤を隠す（2 人）"
  && cpSrc.includes("castPickerOrder(base,") && cpSrc.includes('grouped && chips ? "working" : ""') && cpSrc.includes("offDutyToggleLabelOf(offDuty.length, offOpen)") && cpSrc.includes('"未出勤"')
  && (regSrc.match(/ grouped shiftIds=\{shiftIds\}/g) ?? []).length === 2 && regSrc.includes('from("shifts").select("cast_id")'));
// ★便 X-11-6: 金額欄の共通化（数字のみ・3 桁区切り・値は整数・右に「円」・ラベルは「金額」）
const MONEY_USERS = ["components/nox/advance-okuri-form.tsx", "components/nox/issue-bulk-form.tsx", "components/nox/daily-pay-form.tsx", "app/(manage)/shift/incentive-panel.tsx", "app/(manage)/payroll/payroll-board.tsx",
  "app/(manage)/payroll/payment-panel.tsx", "components/nox/okuri-out-dialog.tsx", "components/nox/settlement-modal.tsx", "components/nox/sanction-modal.tsx", "app/(manage)/report/report-board.tsx", "app/(manage)/register/register-board.tsx",
  // ★便 X-12-1（起票90・2026-09-30）: 残り 8 ファイル（料金・商品・待遇 2・シミュレーター・保証額／報酬型の額・売上目標・精算プリセット）＝41 箇所
  "app/(manage)/master/pricing/pricing-board.tsx", "app/(manage)/master/products/products-board.tsx", "app/(manage)/master/cast-comp/comp-sections.tsx", "app/(manage)/master/cast-comp/plan/plan-editor.tsx",
  "components/simulator-panel.tsx", "app/(manage)/casts/casts-board.tsx", "app/(manage)/analytics/analytics-board.tsx", "components/nox/settlement-presets-editor.tsx"];
const moneySrc = fs.readFileSync("components/ui/money-input.tsx", "utf8");
check("ms(2-16) X-11-6: moneyDigitsOf／moneyDisplayOf／moneyValueOf・MoneyInput（inputMode numeric・右に円）・置換 11 ファイルが MoneyInput を使い、括弧つきの「金額(円)」「金額（円）」「額（円）」が残っていない",
  moneyDigitsOf("1,500円") === "1500" && moneyDigitsOf("０１２３") === "123" && moneyDigitsOf("-5") === "5" && moneyDigitsOf("000") === "0" && moneyDigitsOf("") === "" && moneyDigitsOf("12345678901") === "123456789"
  && moneyDisplayOf("1500") === "1,500" && moneyDisplayOf("") === "" && moneyDisplayOf(1234567) === "1,234,567" && moneyValueOf("1,500") === 1500 && moneyValueOf("") === null
  && moneySrc.includes('inputMode="numeric"') && moneySrc.includes(">円</span>") && moneySrc.includes("moneyDisplayOf(value)")
  && MONEY_USERS.every((f) => { const s2 = fs.readFileSync(f, "utf8"); return s2.includes("<MoneyInput ") && !/金額\(円\)|金額（円）|金額（円・|額（円）|額（円・/.test(s2); }));
// ★裁定323（便 X-11-7）: 在庫の棚卸しは一覧型
const stockSrc = fs.readFileSync("app/(manage)/master/stock/stock-board.tsx", "utf8");
const stProducts = [{ id: "p1", name: "角", type: "bottle", is_active: true, category_id: "c2", sort_order: 2 }, { id: "p2", name: "ビール", type: "drink", is_active: true, category_id: "c1", sort_order: 1 },
  { id: "p3", name: "山崎", type: "bottle", is_active: false, category_id: "c2", sort_order: 1 }, { id: "p4", name: "お通し", type: "food", is_active: true, category_id: null, sort_order: 1 }, { id: "p5", name: "響", type: "bottle", is_active: true, category_id: "c2", sort_order: 1 }];
const stStock = { p1: 5, p2: 0, p3: 2, p5: 3 };
const stCats = [{ id: "c1", name: "ドリンク", sort_order: 1 }, { id: "c2", name: "ボトル", sort_order: 2 }];
const stRows = stocktakeRowsOf(stProducts, stStock, stCats);
check("ms(2-17) 裁定323: 行＝在庫管理ありの有効商品だけ・カテゴリ順（見出しは群の先頭）・無効も表示・絞り込み／記録する行＝整数で差分 ≠ 0／画面は一覧型（ProductCombo なし・n 件を記録・失敗で停止）",
  JSON.stringify(stRows.map((r) => r.name)) === JSON.stringify(["ビール", "響", "角"]) && JSON.stringify(stRows.map((r) => r.head)) === JSON.stringify([true, true, false]) && stRows[0].current === 0
  && JSON.stringify(stocktakeRowsOf(stProducts, stStock, stCats, { showInactive: true }).map((r) => r.name).sort()) === JSON.stringify(["ビール", "山崎", "響", "角"].sort()) && stocktakeRowsOf(stProducts, stStock, stCats, { showInactive: true })[3].name === "角" && stocktakeRowsOf(stProducts, stStock, stCats, { q: "角" }).length === 1
  && JSON.stringify(stocktakePlanOf(stProducts, stStock, { p1: "3", p2: "0", p5: "3.5", p4: "9", p3: " 4 " }).map((r) => [r.id, r.delta])) === JSON.stringify([["p1", -2], ["p3", 2]])
  && !stockSrc.includes("function ProductCombo") && !stockSrc.includes("<ProductCombo") && stockSrc.includes("件を記録") && stockSrc.includes("無効も表示") && stockSrc.includes("if (error) { failed = ") && stockSrc.includes("商品ページ")
  && messageKindOf("2 件を記録しました。次の行の記録に失敗したため中止しました（角: 権限がありません）") === "error" && messageKindOf("棚卸しを 3 件記録しました") === "success");

// ── 便 AB（0158 client・2026-09-30）──
// ★裁定315（便 AB-2）: 給与画面の要対応（確定後の打刻修正）
const atRow = (o: Partial<AttentionRow> & { detail: AttentionRow["detail"] }): AttentionRow => ({ id: "a1", cast_id: "c1", cast_name: "玲奈", kind: "post_finalize_punch", created_at: "2026-10-02T03:00:00+00:00", resolved_at: null, resolved_by: null, ...o });
const atUpd = atRow({ detail: { before: "2026-09-10T11:00:00+00:00", after: "2026-09-10T11:30:00+00:00", biz_date: "2026-09-10", punch_kind: "in" } });
const atIns = atRow({ id: "a2", detail: { before: null, after: "2026-09-10T17:00:00+00:00", biz_date: "2026-09-10", punch_kind: "out" } });
const atDone = atRow({ id: "a3", resolved_at: "2026-10-03T00:00:00+00:00", detail: { before: "2026-09-11T11:00:00+00:00", after: null, biz_date: "2026-09-11", punch_kind: "in" } });
const attSrc = fs.readFileSync("components/nox/payroll-attentions.tsx", "utf8");
const payBoardSrcAB = fs.readFileSync("app/(manage)/payroll/payroll-board.tsx", "utf8");
check("ms(2-18) 裁定315: 要対応の行「確定後の打刻修正: cast・日・出勤 hh:mm→hh:mm」（追加は なし→・翌 2:00 は 26:00・削除は →なし）・翌期と prefill（定額・備考 200 字まで）・解決済みの仕分け・画面は RPC 2 本＋解決済みの折りたたみ＋翌期の調整へ",
  attentionLineOf(atUpd) === "確定後の打刻修正: 玲奈・9/10・出勤 20:00→20:30" && attentionLineOf(atIns) === "確定後の打刻修正: 玲奈・9/10・退勤 なし→26:00" && attentionLineOf(atDone) === "確定後の打刻修正: 玲奈・9/11・出勤 20:00→なし"
  && nextPeriodOf("2026-09") === "2026-10" && nextPeriodOf("2026-12") === "2027-01"
  && JSON.stringify(attentionCarryOf(atUpd, "2026-09")) === JSON.stringify({ period: "2026-10", castId: "c1", castName: "玲奈", kind: "fixed", reason: "2026-09 確定後の打刻修正（9/10 出勤 20:00→20:30）の差額" })
  && attentionCarryOf(atUpd, "2026-09").reason.length <= 200
  && splitAttentions([atUpd, atDone, atIns]).open.map((r) => r.id).join(",") === "a1,a2" && splitAttentions([atUpd, atDone, atIns]).resolved.map((r) => r.id).join(",") === "a3"
  && attSrc.includes('rpc("payroll_attentions_of", { p_run_id: runId })') && attSrc.includes('rpc("payroll_attention_resolve", { p_id: id, p_reason: r.length > 0 ? r : null })') && attSrc.includes("<details") && attSrc.includes(">翌期の調整へ</button>") && attSrc.includes(">解決</button>")
  && payBoardSrcAB.includes("<PayrollAttentions runId={runInfo.id} runPeriod={period}") && !payBoardSrcAB.includes('(runInfo.status === "finalized" || runInfo.status === "paid") && (\n        <PayrollAttentions') // ★0161（便 M1-5）: open_punch は下書きの run にも出る＝status で絞らない
  && payBoardSrcAB.includes("setAdjForm((f) => ({ ...f, kind: c.kind, amount: \"\", pct: \"\", reason: c.reason }))") && messageKindOf("解決済みにしました") === "success");
// ★裁定315（便 AB-3）: 確定済み期の打刻修正は注記（赤エラーではない）・3 経路
const pcmSrc = fs.readFileSync("components/nox/punch-correction-modal.tsx", "utf8");
const minePcSrc = fs.readFileSync("app/mine/punch-correction-form.tsx", "utf8");
const minePageSrc = fs.readFileSync("app/mine/page.tsx", "utf8");
check("ms(2-19) 裁定315: 注記の文言・isFinalizedDay（月で判定）・注記は info（error に倒れない）・店側の修正フォーム（今日タブ①とモーダルが共用）と /mine の申請に出る・/mine は本人の明細がある期で判定",
  POST_FINALIZE_NOTE === "この日の給与は確定済みです。修正は記録され、差額は翌期の調整で扱います" && isFinalizedDay("2026-09-10", ["2026-09"]) && !isFinalizedDay("2026-10-01", ["2026-09"]) && !isFinalizedDay("", ["2026-09"])
  && pcmSrc.includes('<Message kind="info">{POST_FINALIZE_NOTE}</Message>') && pcmSrc.includes('.in("status", ["finalized", "paid"])') && shiftSrc.includes("<PunchCorrectionForm")
  && minePcSrc.includes("isFinalizedDay(date, finalizedPeriods) && <Message kind=\"info\">{POST_FINALIZE_NOTE}</Message>") && minePageSrc.includes("finalizedPeriods={((slips ?? []) as { period: string }[]).map((s) => s.period)}"));
// ★裁定319／追補1（便 AB-4／AB-5）: 送りの本人発行・打刻端末発行
const kioskSrc = fs.readFileSync("app/kiosk/page.tsx", "utf8");
const minePunchSrc = fs.readFileSync("app/mine/punch-actions.tsx", "utf8");
check("ms(2-20) 裁定319: okuriSelfPlanOf（flat／未設定は聞かない・actual＋基本額＝発行・actual＋基本額なし／0／小数＝聞くが発行しない）・文言（記録しました／送りは店が締めで確定します）",
  JSON.stringify(okuriSelfPlanOf({ okuri_mode: "flat", okuri_base_amount: 1500 })) === JSON.stringify({ ask: false, issue: false, amount: null }) && okuriSelfPlanOf(null).ask === false
  && JSON.stringify(okuriSelfPlanOf({ okuri_mode: "actual", okuri_base_amount: 1500 })) === JSON.stringify({ ask: true, issue: true, amount: 1500 })
  && [null, 0, 1500.5, "1500"].every((b) => JSON.stringify(okuriSelfPlanOf({ okuri_mode: "actual", okuri_base_amount: b })) === JSON.stringify({ ask: true, issue: false, amount: null }))
  && OKURI_PENDING_NOTE === "送りは店が締めで確定します" && okuriResultTextOf(true, "issued", 1500) === "退勤を打刻しました（送り ¥1,500 を記録しました）" && okuriResultTextOf(true, "pending", null) === "退勤を打刻しました（送りは店が締めで確定します）"
  && okuriResultTextOf(false, "none", null) === "退勤を打刻しました" && messageKindOf(okuriResultTextOf(true, "pending", null)) === "success" && messageKindOf(okuriResultTextOf(true, "issued", 1500)) === "success");
check("ms(2-21) 裁定319: /kiosk は退勤の前に kiosk_punch_state→あり／なし→kiosk_punch(p_okuri)→kiosk_transport_issue(punch_id)・/mine は punch_self→transport_issue_self・金額の入力欄は無い（表示のみ）",
  kioskSrc.indexOf('rpc("kiosk_punch_state")') > 0 && kioskSrc.indexOf('rpc("kiosk_punch_state")') < kioskSrc.indexOf('rpc("kiosk_punch",') && kioskSrc.includes("p_okuri: okuri }") && kioskSrc.includes('rpc("kiosk_transport_issue", { p_punch_id: pj.punch_id })')
  && kioskSrc.includes("onClick={() => void startOut()}") && kioskSrc.includes("if (!plan.ask) { void punch(\"out\"); return; }") && !kioskSrc.includes("MoneyInput")
  && minePunchSrc.includes('rpc("transport_issue_self", { p_punch_id: punchId })') && minePunchSrc.includes("okuriResultTextOf(okuriActual && okuri, outcome, plan.amount)") && !minePunchSrc.includes("MoneyInput") && !minePunchSrc.includes("<input"));
// ★裁定317（便 AB-6）・裁定314（便 AB-7）
const spSrc = fs.readFileSync("app/(manage)/master/store-profile-panel.tsx", "utf8");
check("ms(2-22) 裁定317／314: 店舗情報に「送りの基本額」（MoneyInput・数値で送る・空欄＝0・一律の店は非活性＋注記）・キープ済みの行＝check_line_id の一致（近似の読取を撤去）",
  spSrc.includes("<MoneyInput value={form.okuri_base_amount}") && spSrc.includes("!form.okuri_actual}") && spSrc.includes('out.okuri_base_amount = form.okuri_base_amount === "" ? 0 : Number(form.okuri_base_amount)') && spSrc.includes("送りの方式が「一律」の店では使いません")
  && [...keptLineIdsOf(["l1", "l2", "l3"], [{ check_line_id: "l2" }, { check_line_id: null }, { check_line_id: "x" }])].join(",") === "l2" && keptLineIdsOf(["l1"], []).size === 0
  && regSrc.includes('.from("bottle_keeps").select("check_line_id").in("check_line_id", targets.map((l) => l.id))') && !regSrc.includes('.gte("opened_at", check.started_at)'));
// ★裁定312（便 AB-8）・裁定316（便 AB-9）
const dpfSrc = fs.readFileSync("components/nox/daily-pay-form.tsx", "utf8");
const aofSrc = fs.readFileSync("components/nox/advance-okuri-form.tsx", "utf8");
const ibfSrc = fs.readFileSync("components/nox/issue-bulk-form.tsx", "utf8");
const finSrcAB = fs.readFileSync("app/api/payroll/finalize/route.ts", "utf8");
check("ms(2-23) 裁定312／316: 繰り下げの注記「翌月（YYYY-MM）の給与から控除」（同月・null は出さない・一括は うち n 件）・日払いは戻り carried_to・前借りは発行後に advances を再読・確定の文言は 1 本（DB の 'period not ended' も同じ 400）",
  carriedNoteOf("2026-10") === "翌月（2026-10）の給与から控除" && carriedNoteOf(null) === "" && carriedNoteOf(undefined) === ""
  && carriedBulkNoteOf("2026-09-15", ["2026-10"]) === "翌月（2026-10）の給与から控除" && carriedBulkNoteOf("2026-09-15", [null, "2026-09"]) === "" && carriedBulkNoteOf("2026-09-15", ["2026-10", null, "2026-10"]) === "うち 2 件は翌月（2026-10）の給与から控除"
  && dpfSrc.includes("carriedNoteOf(r.carried_to)") && aofSrc.includes('.from("advances").select("deduct_period").eq("id", j.id)') && ibfSrc.includes('.from("advances").select("deduct_period").in("id", j.ids)')
  && messageKindOf("玲奈 に日払い ¥10,000 を発行しました（源泉 ¥510・手取り ¥9,490）・翌月（2026-10）の給与から控除") === "success"
  && notEndedMessageOf("2026-09-30") === "期間終了（9/30）の翌日から確定できます" && finSrcAB.includes("eFin.message.includes(PERIOD_NOT_ENDED)") && finSrcAB.includes("notEndedMessageOf(win.periodEnd)")
  && payBoardSrcAB.includes("j.message ?? notEndedMessageOf(periodEndOf(period))"));

// ★起票93（裁定312・便 X-12-2）: 日払いフォームは支払済みの期でも発行できる＝「読取のみ」を撤去し、期の注記（paid＝翌月へ・finalized＝凍結明細に載らない）
const dpf2 = fs.readFileSync("components/nox/daily-pay-form.tsx", "utf8");
check("ms(2-24) 起票93: dailyPayPeriodNoteOf（paid＝info・翌月の文言は carriedNoteOf と同文／finalized＝warn／draft・null・不正な期＝null）・フォームに「読取のみ」の文言と readOnly prop が無い・payroll_runs を読んで Message で出す",
  dailyPayPeriodNoteOf("paid", "2026-09")?.kind === "info" && dailyPayPeriodNoteOf("paid", "2026-09")?.text === "この営業日の期（2026-09）は支払済みです。発行した日払いは翌月（2026-10）の給与から控除します"
  && dailyPayPeriodNoteOf("paid", "2026-12")?.text.includes("翌月（2027-01）") === true && dailyPayPeriodNoteOf("finalized", "2026-09")?.kind === "warn" && dailyPayPeriodNoteOf("draft", "2026-09") === null && dailyPayPeriodNoteOf(null, "2026-09") === null && dailyPayPeriodNoteOf("paid", "x") === null
  && !dpf2.includes("読取のみ") && !dpf2.includes("readOnly") && dpf2.includes('from("payroll_runs").select("status")') && dpf2.includes("{periodNote && <Message kind={periodNote.kind}>{periodNote.text}</Message>}"));

// ★起票94（便 X-12-3）: 歯車・自分の情報のポップオーバー＝ヘッダー直下に固定（上方向へ出さない）・高さ上限＝viewport−ヘッダー−余白×2（内部スクロール）・≤899 はシート
const modalSrc = fs.readFileSync("components/ui/modal.tsx", "utf8");
const chipsSrc = fs.readFileSync("components/ui/header-chips.tsx", "utf8");
const cssSrc = fs.readFileSync("app/globals.css", "utf8");
const box600 = popoverBoxOf(600);
check("ms(2-25) 起票94: 画面高 600px でポップオーバー上端（72）≥ ヘッダー下端（64）・max-height 520＝600−64−16・CSS .nox-modal-top（padding-top 72px／max-height calc(100vh − 80px)・min-width 901px の中）が純関数と同値・UserChip は variant=\"top\"（HeaderGear は X-13-22 で /master 直リンク＝1 本）・modal は top で overflow auto",
  box600.top === HEADER_H + POP_GAP && box600.top >= HEADER_H && box600.maxHeight === 600 - HEADER_H - POP_GAP * 2 && popoverBoxOf(200).maxHeight === 120
  && cssSrc.includes(`.nox-modal-top { align-items: flex-start; padding-top: ${HEADER_H + POP_GAP}px; }`) && cssSrc.includes(`.nox-modal-top .nox-modal-card { max-height: calc(100vh - ${HEADER_H + POP_GAP * 2}px); }`)
  && cssSrc.indexOf("@media (min-width: 901px) {\n  .nox-modal-top") > 0 && /\.nox-tb \{[^}]*height: 64px/.test(cssSrc)
  && (chipsSrc.match(/variant="top"/g) ?? []).length === 1 && !chipsSrc.includes("maxWidth={520} scroll>") && modalSrc.includes('(variant === "top" ? " nox-modal-top" : "")') && modalSrc.includes('variant === "drawer" || variant === "top" || scroll ? { overflow: "auto" as const }'));

// ★便 L-3-2（仮決め）: 日払いの過徴収 warn＝累計＋今回 > 見込み手取り（日払い前）→ warn・発行は止めない・プレビュー未取得は出さない
const dpf3 = fs.readFileSync("components/nox/daily-pay-form.tsx", "utf8");
check("ms(2-26) L-3-2: dailyPayOverNoteOf（30,000＋10,000 > 35,000 → 文言／＝ちょうどは出さない／expectedNet null・gross 0 は null）・フォームは preview を月ごとに読み Message warn・発行ボタンの disabled に overNote を使わない",
  dailyPayOverNoteOf(30000, 10000, 35000) === "当期の見込み手取り ¥35,000 を超えます（翌期で控除）" && dailyPayOverNoteOf(30000, 5000, 35000) === null && dailyPayOverNoteOf(0, 1000, null) === null && dailyPayOverNoteOf(0, 0, 100) === null && dailyPayOverNoteOf(0, 1000, -500) === "当期の見込み手取り ¥0 を超えます（翌期で控除）"
  && dpf3.includes('{overNote && <Message kind="warn">{overNote}</Message>}')
  && dpf3.includes('fetch("/api/payroll/preview"') && dpf3.includes("setExpectedNet(r ? r.net + (r.dailyPaidGross ?? 0) : null)") && !dpf3.includes("disabled={busy || gross == null || gross <= 0 || overNote"));

// ★0159（便 P-4）: rpc-err に raise 6 語（payroll_shortfall_sync／set_store_pay_time_basis）＝すべて error 種別に倒れる（生の英語が出ない）
check("ms(2-27) 0159: rpcErrJa の 6 語（bad row／bad cast／bad shift／runs exist／bad pay_time_basis／bad apply）が和文で error 種別・preview の probe（isRpcMissing）は撤去",
  ["bad row", "bad cast", "bad shift", "runs exist", "bad pay_time_basis", "bad apply"].every((w) => rpcErrJa(w) !== w && messageKindOf(rpcErrJa(w)) === "error")
  && rpcErrJa("runs exist").includes("次の期") && rpcErrJa("bad pay_time_basis").includes("確定シフトどおり") && !fs.readFileSync("app/api/payroll/preview/route.ts", "utf8").includes("isRpcMissing"));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-messages ALL PASS (${pass} assertions)`);
console.log("メッセージ表示の型(裁定281): 記号／role／トークン／文言→種別の純関数 / 素の描画 0 の許可列挙 pin / shift-board のカード内表示と残留解消");
