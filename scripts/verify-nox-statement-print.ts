/*
 * verify:nox-statement-print — 便 GV-A（2026-10-14）裁定366（GV-14）報酬明細＝1 人 1 カード・手取り帯 黒地金枠金文字・印刷 1 人 1 ページの係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-statement-print。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const ps = src("components/payslip-slip.tsx"); const th = src("lib/nox/ui/theme.ts"); const css = src("app/globals.css");
check("sp(1) payslip-slip: 見出し＝名前 22px（slipName）左・月と契約区分チップ右（.ps-meta）・カード間 24px（compact も）", (ps.match(/<span className="ps-name" style=\{t\.slipName\}>\{castName \?\? slip\.period\}<\/span>/g) ?? []).length === 2 && ps.includes('<span className="ps-meta"') && (ps.match(/marginBottom: 24 \}\}>/g) ?? []).length === 2 && !ps.includes("`${castName}　${slip.period}`"));
check("sp(2) theme: slipHd＝flex 両端・slipName 22px・slipSec 薄灰（var(--line)）・slipFoot＝黒地・金 2px 枠・金文字・slipFootVal 28px 太字 右寄せ", th.includes("export const slipName: CSSProperties = { fontSize: 22, fontWeight: 800,") && th.includes('export const slipSec: CSSProperties = { fontWeight: 800, fontSize: 12, background: "var(--line)",') && th.includes('background: "#000", color: "var(--gold)", border: "2px solid var(--gold)"') && th.includes("export const slipFootVal: CSSProperties = { fontFamily: font.num, fontSize: 28, fontWeight: 800, fontVariantNumeric: \"tabular-nums\", textAlign: \"right\", marginLeft: \"auto\" };"));
check("sp(3) CSS: .nox-payslip 外周 1px 枠・印刷は 1 人 1 ページ（.nox-print-page break-after）・@media print の .ps-foot も黒地金枠金文字（print-color-adjust exact）＝PDF も同じ", css.includes(".nox-payslip { border: 1px solid var(--line2); border-radius: 12px; padding: 12px 14px; }") && css.includes(".nox-print-page { break-after: page; page-break-after: always; }") && css.includes(".ps-foot { background: #000 !important; color: #c9a24a !important; border: 2px solid #c9a24a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }"));

if (fails.length) { console.error(`✗ verify:nox-statement-print 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-statement-print OK (${pass} checks)`);
