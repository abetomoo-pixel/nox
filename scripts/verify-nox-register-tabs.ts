/*
 * verify:nox-register-tabs — 便 GV-A（2026-10-14）裁定360（GV-8）伝票の「注文／指名・席／会計」＝3 分割セグメントの係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-register-tabs。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const rb = src("app/(manage)/register/register-board.tsx"); const css = src("app/globals.css");
check("rt(1) .nox-dtabs--seg（data-dtabs-seg）・キー／ラベル／切替ハンドラは不変・アイコン DTAB_ICON・会計は .pay", rb.includes('<div className="nox-dtabs nox-dtabs--seg" data-dtabs-seg="1">') && rb.includes('{([["order", "注文"], ["nom", "指名・席"], ["pay", "会計"]] as const).map(([k, label]) => (') && rb.includes("onClick={() => setDtab(k)}>{DTAB_ICON[k]}{label}</button>") && rb.includes('const DTAB_ICON: Record<"order" | "nom" | "pay", React.ReactNode> = {'));
check("rt(2) CSS: 等幅（flex 1 1 0）・高さ 1.5 倍（min-height 52）・選択中 金塗り・未選択 枠のみ・会計は主ボタン色（青塗り）", css.includes(".nox-dtabs.nox-dtabs--seg button { flex: 1 1 0; min-width: 0; min-height: 52px;") && css.includes(".nox-dtabs.nox-dtabs--seg button.on { background: var(--gold); border-color: var(--gold); color: #000; }") && css.includes(".nox-dtabs.nox-dtabs--seg button.pay.on { background: var(--primary); border-color: var(--primary); color: #fff; }"));
check("rt(3) セグメントは伝票上部の sticky 器（.nox-regsticky）の中＝操作バーの直下", rb.indexOf('data-regsticky="1"') > 0 && rb.indexOf('data-regsticky="1"') < rb.indexOf('data-dtabs-seg="1"') && rb.includes("</div>{/* /nox-regsticky */}"));

if (fails.length) { console.error(`✗ verify:nox-register-tabs 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-register-tabs OK (${pass} checks)`);
