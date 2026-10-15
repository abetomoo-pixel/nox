/*
 * verify:nox-today-layout — 便 GV-A（2026-10-14）裁定358（GV-6）今日タブの右カラムは ≥1280 だけ横並びの係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-today-layout。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const sb = src("app/(manage)/shift/shift-board.tsx"); const css = src("app/globals.css");
check("tl(1) shift-board: 今日タブの 2 列＝.nox-2col.nox-2col--today（右カラム＝時間帯別の充足＋出勤ボーナス）", sb.includes('<div className="nox-2col nox-2col--today">') && sb.includes("{/* 右カラム（モック .stack）＝時間帯別の充足 ＋ 出勤ボーナス */}"));
check("tl(2) CSS: --today は 1 列が既定・≥1280 で 1fr 380px（900〜1279 は表の下）", css.includes(".nox-2col.nox-2col--today { grid-template-columns: 1fr; }") && css.includes("@media (min-width: 1280px) { .nox-2col.nox-2col--today { grid-template-columns: 1fr 380px; } }"));
check("tl(3) 表の確定時間は 1 行（c-conf・nowrap 列）・操作ボタンは .nox-rowops（折り返し可）", sb.includes('<td className="num c-conf" data-label="確定">') && sb.includes('<span className="nox-rowops">'));

if (fails.length) { console.error(`✗ verify:nox-today-layout 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-today-layout OK (${pass} checks)`);
