/*
 * verify:nox-gvd — 便 GV-D（2026-10-26）: docs/demo/gvd_20261023.md の直す 9 件（#1・#2・#3・#5・#6・#7・#8・#9・#14）。DB 不触（逐語 grep）。
 *  #11／#12＝C2-8 で済・#4／#10／#13＝残す（相談役案）。390 のタップの目安 40px は CSS の変数 1 つ（--nox-btnsm-h）とセグメントの min-height。
 */
import fs from "node:fs";
import { btnSm } from "../lib/nox/ui/theme";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const css = src("app/globals.css");

check("gvd(1) #1 給与 390 の期ヘッダー＝締め／計算基準／暫定の 3 つに data-payroll-headtag・600px 以下は折り返す", (src("app/(manage)/payroll/payroll-board.tsx").match(/data-payroll-headtag="1"/g) ?? []).length === 3 && css.includes("[data-payroll-headtag] { white-space: normal !important; max-width: 100%; }"));
check("gvd(2) #2 日報の追加 KPI＝列数は class（店長 3 列・オーナー 4 列）・641px 以下は 2 列", src("app/(manage)/report/report-board.tsx").includes('<div className={`nox-repsum${isOwner ? "" : " three"}`} data-repsum-extra="1">') && css.includes(".nox-repsum.three { grid-template-columns: repeat(3, 1fr); }") && css.includes(".nox-repsum.three { grid-template-columns: repeat(2, 1fr); } }"));
check("gvd(3) #3 シフト今日の「退勤」＝min-height 40", src("app/(manage)/shift/shift-board.tsx").includes('<button type="button" data-gvd-out="1" style={{ ...btnDark, padding: "4px 12px", fontSize: 12, minHeight: 40, opacity: outOn ? 1 : 0.5 }}'));
check("gvd(5) #5 セグメント＝600px 以下は min-height 40（button／a とも中央）", css.includes(".nox-seg button, .nox-seg a { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }"));
check("gvd(6) #6／#8 取り下げ／#9 この店で試す／#14 分析の設定＝btnSm の min-height が変数（600px 以下 40px・広い幅は auto）", btnSm.minHeight === "var(--nox-btnsm-h, auto)" && css.includes(":root { --nox-btnsm-h: 40px; }"));
check("gvd(7) #7 スタッフの権限ピル＝役職で固定／退店済みは表示専用の灰ピル（span・ro）・押せるのはスタッフの有効な行だけ（button）", src("app/(manage)/staff/staff-board.tsx").includes('<span key={k} className={`nox-perm ro ${m[k] ? "on" : ""}`} data-perm-ro="1"') && css.includes(".nox-perm.ro { cursor: default; border-color: var(--v2-line);"));
check("gvd(8) #8 月送り ‹ ›＝40×40（MonthNav＝/mine の希望・シフトの配置で共用）", src("components/nox/month-nav.tsx").includes("const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm, minWidth: 40, minHeight: 40 };"));

if (fails.length) { console.error(`verify:nox-gvd FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-gvd OK ${pass} checks（GV-D 直す 9 件）`);
