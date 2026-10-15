/*
 * verify:nox-sidebar-rail — 便 GV-A（2026-10-14）裁定361（GV-9）サイドバー＝900〜1279 はアイコンのレール・≥1280 全幅・手動トグル・/register /floor はドロワーの係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-sidebar-rail。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const sn = src("components/ui/side-nav.tsx"); const nv = src("components/ui/nav.tsx"); const css = src("app/globals.css");
check("sr(1) side-nav: mode＝drawerRoute（/register /floor）→hidden／pref（localStorage nox.sidenav・try/catch）→wide（matchMedia 1280）→full／rail・aside に is-rail／is-hidden・title＝ラベル", sn.includes('window.localStorage.getItem("nox.sidenav")') && sn.includes('window.matchMedia("(min-width: 1280px)")') && sn.includes('const drawerRoute = path === "/register" || path.startsWith("/register/") || path === "/floor" || path.startsWith("/floor/");') && sn.includes('const mode: "full" | "rail" | "hidden" = drawerRoute ? "hidden" : (pref ?? (wide ? "full" : "rail"));') && sn.includes('data-side-mode={mode}') && sn.includes("title={it.label}"));
check("sr(2) 手動トグル（data-side-toggle・localStorage setItem try/catch）・≡（data-nav-burger）は OPEN_MENU_EVENT の drawer 節を開く", sn.includes('data-side-toggle="1"') && sn.includes('window.localStorage.setItem("nox.sidenav", next)') && sn.includes('data-nav-burger="1"') && sn.includes('new CustomEvent(OPEN_MENU_EVENT, { detail: { section: "drawer" } })') && nv.includes('const sheetGroups = section === "drawer" ? groups : menuGroups;') && nv.includes("{sheetGroups.map((g, gi) => ("));
check("sr(3) CSS: レール 64px（.nox-layout:has(> .nox-side.is-rail)）・ラベル非表示・現在地は金・hidden は 1 列・≡ は ≥901 だけ・<900 は下部ナビのまま（.nox-side は display none）", css.includes(".nox-layout:has(> .nox-side.is-rail) { grid-template-columns: 64px minmax(0, 1fr); }") && css.includes(".nox-side.is-rail .brand > div, .nox-side.is-rail .group, .nox-side.is-rail a > span { display: none; }") && css.includes(".nox-side.is-rail a.active { color: var(--gold);") && css.includes(".nox-layout:has(> .nox-side.is-hidden) { grid-template-columns: minmax(0, 1fr); }") && css.includes("@media (min-width: 901px) { .nox-navburger.show { display: inline-flex;") && css.includes("  .nox-side { display: none; }"));

if (fails.length) { console.error(`✗ verify:nox-sidebar-rail 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-sidebar-rail OK (${pass} checks)`);
