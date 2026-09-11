/*
 * verify:nox-shift-gap — 裁定245（B4 追補）純関数テスト（DB 非依存・走数外・2026-09-11）。
 *   npm run verify:nox-shift-gap
 * 観点 2:
 *  1 gapOf: required 0／負→null・assigned>=required→null（充足済みはバッジなし）・不足 n・selected で −1・selected で 0 は「充足」（0 を返す）
 *  2 chunkOf: ids 0→[]・62→1 塊・63→[62,1]・108→[62,46]・順序保存・size 不正は throw
 */
import { gapOf, chunkOf } from "../lib/nox/shift/gap";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// ══ 1 gapOf ══
check("sg(1a) required 0／負→null（必要人数 未設定）", gapOf(0, 0, false) === null && gapOf(-1, 0, false) === null && gapOf(0, 3, true) === null);
check("sg(1b) assigned>=required→null（充足済み・selected でも null）", gapOf(3, 3, false) === null && gapOf(3, 5, false) === null && gapOf(3, 3, true) === null);
check("sg(1c) 不足 n＝required−assigned（4−1＝3・5−0＝5）", gapOf(4, 1, false) === 3 && gapOf(5, 0, false) === 5);
check("sg(1d) ★selected で −1（4−1 選択中＝2）", gapOf(4, 1, true) === 2);
check("sg(1e) ★selected で 0＝「充足」（3−2 選択中＝0・null ではない）", gapOf(3, 2, true) === 0);
check("sg(1f) selected は負にしない（base 1 → 0 が下限）", gapOf(1, 0, true) === 0);

// ══ 2 chunkOf ══
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);
check("sg(2a) ids 0→[]", chunkOf([], 62).length === 0);
check("sg(2b) 62→1 塊（62）", (() => { const c = chunkOf(ids(62), 62); return c.length === 1 && c[0].length === 62; })());
check("sg(2c) ★63→[62,1]", (() => { const c = chunkOf(ids(63), 62); return c.length === 2 && c[0].length === 62 && c[1].length === 1; })());
check("sg(2d) ★108（DEMO 2026-09）→[62,46]", (() => { const c = chunkOf(ids(108), 62); return c.length === 2 && c[0].length === 62 && c[1].length === 46; })(), JSON.stringify(chunkOf(ids(108), 62).map((c) => c.length)));
check("sg(2e) 順序保存（先頭 id0・62 番目 id61・63 番目 id62）", (() => { const c = chunkOf(ids(108), 62); return c[0][0] === "id0" && c[0][61] === "id61" && c[1][0] === "id62" && c[1][45] === "id107"; })());
check("sg(2f) 既定 size＝62・size 0 は throw", (() => { let threw = false; try { chunkOf(ids(3), 0); } catch { threw = true; } return threw && chunkOf(ids(63)).length === 2; })());

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-shift-gap ALL PASS (${pass} assertions)`);
console.log("裁定245(純関数): 不足 n＝required−assigned（未設定・充足済みは null・選択中は −1 で 0 は充足）／一括確定の 62 件分割（0・62・63・108・順序）");
