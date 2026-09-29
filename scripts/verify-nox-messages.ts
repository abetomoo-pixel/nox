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
import { HM_FORMAT_ERR, normalizeHHMM } from "../lib/nox/time/hhmm"; // ★裁定318（便 X-9-2）
import { okuriAmountOf, okuriDefaultAmountOf, okuriDefaultNoteOf } from "../lib/nox/shift/okuri-default"; // ★裁定317（便 X-9-3）

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

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-messages ALL PASS (${pass} assertions)`);
console.log("メッセージ表示の型(裁定281): 記号／role／トークン／文言→種別の純関数 / 素の描画 0 の許可列挙 pin / shift-board のカード内表示と残留解消");
