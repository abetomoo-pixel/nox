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

// (2) 許可列挙型 pin（素の描画 0）
// 除外: 共通部品自身／kiosk の打刻結果画面（app/kiosk/page.tsx L233 `{result.message}`＝全画面の結果表示・裁定11 の kiosk 面＝メッセージ枠ではない）
const EXCLUDE = new Set(["components/ui/toast.tsx", "app/kiosk/page.tsx"]);
const ROOTS = ["app", "components"];
const RAW = /<(p|span|div|small|b|strong)[^>]*>\{[A-Za-z]*(msg|Msg|err|Err|error|Error|notice|Notice|message|Message)[A-Za-z]*\}<\/\1>/g;
// ★便 AB-2: オブジェクトのプロパティ経由（{msg.text}／{result.message} 等）の素の描画も検出（U の識別子条件を素通りした register-board の 4 箇所ほか）
const RAW_PROP = /<(p|span|div|small|b|strong)[^>]*>\{[A-Za-z]+\.(text|message|msg)\}<\/\1>/g;
const COLOR_BRANCH = /color:\s*[A-Za-z]*(msg|Msg|err|Err)[A-Za-z]*\.(includes|startsWith)\([^)]*\)\s*\?\s*"var\(--(bad|ok|danger[^"]*|success[^"]*)\)"/g;
const BARE = /^\s*\{(msg|err|error|notice)\}\s*$/;
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
  for (const m of src.matchAll(COLOR_BRANCH)) hits.push(`${f}: 色分岐 ${m[0].slice(0, 80)}`);
  src.split("\n").forEach((l, i) => { if (BARE.test(l)) { const prev = src.split("\n")[i - 1] ?? ""; if (!/Message|Toast/.test(prev)) hits.push(`${f}:${i + 1}: 素の ${l.trim()}`); } });
}
check(`ms(2-1) 素の <p>／<span> でのメッセージ直接描画＝0（走査 ${files.length} ファイル・除外 ${EXCLUDE.size}）`, hits.length === 0, hits.slice(0, 10).join(" | "));
const toastSrc = fs.readFileSync("components/ui/toast.tsx", "utf8");
check("ms(2-2) Toast は Message を経由（kind 未指定は messageKindOf）・Message は role と data-message-kind を持つ", /messageKindOf\(msg\)/.test(toastSrc) && /role=\{messageRole\(kind\)\}/.test(toastSrc) && /data-message-kind=\{kind\}/.test(toastSrc));
const shiftSrc = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("ms(2-3) shift-board: 期間フォームの成否はカード内（pMsg→Message）・タブ切替で共有 msg と pMsg を消す（281-3／281-4）", /useEffect\(\(\) => \{ setMsg\(null\); setPMsg\(null\); \}, \[tab\]\)/.test(shiftSrc) && /\{pMsg && <Message kind=\{pMsg\.kind\}/.test(shiftSrc) && /overlappingPeriods\(/.test(shiftSrc));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-messages ALL PASS (${pass} assertions)`);
console.log("メッセージ表示の型(裁定281): 記号／role／トークン／文言→種別の純関数 / 素の描画 0 の許可列挙 pin / shift-board のカード内表示と残留解消");
