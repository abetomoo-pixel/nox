/*
 * verify:nox-cell-names — 便 AU3（2026-09-24・週末バックログ 3）確定シフトの月セルの名前合成 lib/nox/shift/cell-names.ts の係留（純関数・DB 不触）。
 *   npm run verify:nox-cell-names（env 不要）。f0 68 段目。
 *
 *  (1) cellNamesOf: 先頭 3 名＋「他 n」・3 名以下は他なし・0 名・max 指定・max 0
 *  (2) 配線（逐語 grep）: 確定シフトの月セルが cellNamesOf を通し、時刻は ≤899 で隠すクラス（nox-cald-t）・グリッドは nox-calgrid--fit
 *  (3) CSS: globals.css に .nox-calgrid--fit（≤899＝repeat(7, minmax(0, 1fr))）と .nox-cald-t の非表示規則がある
 *  逆テスト 1 本（手動・1 回）: cellNamesOf の `names.slice(0, m)` を `names.slice(0, m + 1)` にする→cn(1-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { cellNamesOf } from "../lib/nox/shift/cell-names";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const N = ["れいな", "みお", "さくら", "あい", "ゆき"];
// (1)
check("cn(1-1) 5 名→先頭 3 名＋他2", JSON.stringify(cellNamesOf(N)) === JSON.stringify({ shown: ["れいな", "みお", "さくら"], rest: 2, restLabel: "他2" }));
check("cn(1-2) 3 名→3 名・他なし／2 名→2 名／0 名→空", cellNamesOf(N.slice(0, 3)).restLabel === null && cellNamesOf(N.slice(0, 3)).shown.length === 3 && cellNamesOf(N.slice(0, 2)).shown.length === 2 && cellNamesOf([]).shown.length === 0 && cellNamesOf([]).rest === 0);
check("cn(1-3) max 指定（2）→2 名＋他3・max 0→0 名＋他5・負は 0 扱い", cellNamesOf(N, 2).restLabel === "他3" && cellNamesOf(N, 0).shown.length === 0 && cellNamesOf(N, 0).rest === 5 && cellNamesOf(N, -1).shown.length === 0);
// (2)
const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("cn(2-1) shift-board: 確定シフトの月セルは cellNamesOf（3 名＋他 n）・時刻は nox-cald-t・グリッドは nox-calgrid--fit", /cellNamesOf\(/.test(sb) && /className="nox-cald-t num"/.test(sb) && /className="nox-calgrid nox-calgrid--fit"/.test(sb));
// (3)
const css = fs.readFileSync("app/globals.css", "utf8");
check("cn(3-1) globals.css: ≤899 で .nox-calgrid--fit＝repeat(7, minmax(0, 1fr))・.nox-cald-t 非表示・セルは min-width 0", /@media \(max-width: 899px\) \{[^}]*\.nox-calgrid--fit \{ grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/.test(css) && /\.nox-calgrid--fit \.nox-cald-t \{ display: none; \}/.test(css) && /\.nox-calgrid--fit > \.nox-cald \{ min-width: 0; overflow: hidden; \}/.test(css));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-cell-names OK (${pass} checks)`);
