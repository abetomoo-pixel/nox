/*
 * verify:nox-menu-grid — 便 GV-A（2026-10-14）裁定362（GV-10）メニュー一覧＝グリッド（<600 1 列・600〜899 2 列・≥900 3 列）・「›」なしの係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-menu-grid。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const nv = src("components/ui/nav.tsx"); const css = src("app/globals.css");
check("mg(1) nav: 項目の map は .nox-navsheet-grid で包む（メニュー節・設定節）・Modal は 760", (nv.match(/<div className="nox-navsheet-grid">/g) ?? []).length === 2 && nv.includes("<Modal onClose={closeSheet} maxWidth={760} scroll>"));
check("mg(2) CSS: 1 列→600 で 2 列→900 で 3 列・カード余白 0・「›」（.nox-navchev）は非表示・シート幅 760", css.includes(".nox-navsheet-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }") && css.includes("@media (min-width: 600px) { .nox-navsheet-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }") && css.includes("@media (min-width: 900px) { .nox-navsheet-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }") && css.includes(".nox-navsheet-grid .nox-navchev { display: none; }") && css.includes(".nox-navsheet { max-width: 760px; }"));
check("mg(3) カード全体がタップ対象（NavListRow は <Link className=\"nox-navsheet-i …\">）・説明 1 行（.nox-navdesc）は残す", src("components/ui/header-chips.tsx").includes('className={on ? "nox-navsheet-i nox-navrow on" : "nox-navsheet-i nox-navrow"}') && src("components/ui/header-chips.tsx").includes('<span className="nox-navdesc">'));

if (fails.length) { console.error(`✗ verify:nox-menu-grid 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-menu-grid OK (${pass} checks)`);
