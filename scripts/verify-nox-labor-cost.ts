/*
 * verify:nox-labor-cost — B6-4 人件費式の純関数テスト（DB 非依存・裁定 B6-4／B6-10 ①・2026-09-11）。
 *   npm run verify:nox-labor-cost
 * 観点 8:
 *  1 state: runs 空→none／final 無し→draft／finalized→final／paid も final 扱い（finalRunOf は最初の finalized／paid）
 *  2 gross: 確定 run の pay.gross 合計（凍結値を足すだけ）・pay 無し／gross 無しは 0・文字列 gross は Number() で現行どおり
 *  3 byCast: cast 別合計（同一 cast の複数行は加算）
 *  4 rate: 通常値（小数 1 桁）／売上 0→null／未確定（draft・none）→null／端数の丸め（Math.round(x*1000)/10）
 *  5 castLaborRatePct: 該当 cast なし→null・sales 0→null・final でない→null
 *  6 ★月報も小数 1 桁へ統一＝laborRatePct が 12.4 を返す固定（旧式の再現は置かない）
 */
import { finalRunOf, laborCostOf, laborRatePct, castLaborRatePct, slipGross, type LaborRun, type LaborSlip } from "../lib/nox/payroll/labor-cost";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const draftOnly: LaborRun[] = [{ id: "run-d", status: "draft" }];
const finRuns: LaborRun[] = [{ id: "run-d", status: "draft" }, { id: "run-f", status: "finalized" }];
const paidRuns: LaborRun[] = [{ id: "run-p", status: "paid" }];
const slips: LaborSlip[] = [
  { cast_id: "c1", breakdown_json: { pay: { gross: 300_000 } } },
  { cast_id: "c2", breakdown_json: { pay: { gross: 120_000 } } },
  { cast_id: "c1", breakdown_json: { pay: { gross: 5_000 } } },        // 同一 cast の 2 行目＝加算
  { cast_id: "c3", breakdown_json: { pay: {} } },                       // gross 無し＝0
  { cast_id: "c4", breakdown_json: null },                              // breakdown 無し＝0
  { cast_id: "c5", breakdown_json: { pay: { gross: "1500" as unknown as number } } }, // 文字列＝Number() で 1500（現行保存）
];

// ══ 1 state ══
check("lc(1a) runs 空→none・gross 0・byCast 空", (() => { const r = laborCostOf([], []); return r.state === "none" && r.gross === 0 && r.byCast.size === 0; })());
check("lc(1b) final 無し→draft・gross 0（slips を渡しても無視）", (() => { const r = laborCostOf(draftOnly, slips); return r.state === "draft" && r.gross === 0 && r.byCast.size === 0; })());
check("lc(1c) finalized→final・finalRunOf は draft を飛ばして run-f", laborCostOf(finRuns, slips).state === "final" && finalRunOf(finRuns)?.id === "run-f");
check("lc(1d) ★paid も final 扱い（支払済み化後も人件費は確定値）", laborCostOf(paidRuns, slips).state === "final" && finalRunOf(paidRuns)?.id === "run-p");

// ══ 2 gross ══
const lc = laborCostOf(finRuns, slips);
check("lc(2a) gross＝pay.gross 合計（300,000＋120,000＋5,000＋0＋0＋1,500＝426,500）", lc.gross === 426_500, String(lc.gross));
check("lc(2b) slipGross: pay 無し／breakdown null／文字列 gross の現行挙動（0／0／1500）",
  slipGross({ cast_id: "x", breakdown_json: { pay: {} } }) === 0 && slipGross({ cast_id: "x", breakdown_json: null }) === 0
  && slipGross({ cast_id: "x", breakdown_json: { pay: { gross: "1500" } } }) === 1500);

// ══ 3 byCast ══
check("lc(3a) byCast＝cast 別合計（c1 305,000／c2 120,000／c3 0／c4 0／c5 1,500・5 cast）",
  lc.byCast.size === 5 && lc.byCast.get("c1") === 305_000 && lc.byCast.get("c2") === 120_000 && lc.byCast.get("c3") === 0 && lc.byCast.get("c5") === 1_500,
  JSON.stringify([...lc.byCast]));

// ══ 4 rate ══
check("lc(4a) 通常値＝小数 1 桁 %（426,500 ÷ 1,387,150＝30.7）", laborRatePct("final", 426_500, 1_387_150) === 30.7, String(laborRatePct("final", 426_500, 1_387_150)));
check("lc(4b) 売上 0→null（ゼロ除算しない）・負も null", laborRatePct("final", 426_500, 0) === null && laborRatePct("final", 426_500, -1) === null);
check("lc(4c) 未確定（draft／none）→null（gross が 0 でも売上があっても）", laborRatePct("draft", 0, 100) === null && laborRatePct("none", 0, 100) === null && laborRatePct("draft", 999, 100) === null);
check("lc(4d) 端数＝Math.round(x*1000)/10（1/3→33.3・2/3→66.7・0.05%境界 12.35→12.4 側は JS の round に従う）",
  laborRatePct("final", 1, 3) === 33.3 && laborRatePct("final", 2, 3) === 66.7 && laborRatePct("final", 1_235, 10_000) === 12.4);

// ══ 5 castLaborRatePct ══
check("lc(5a) cast 別＝c1 305,000 ÷ 1,000,000＝30.5／該当 cast なし→null／sales 0→null／final でない→null",
  castLaborRatePct("final", lc.byCast, "c1", 1_000_000) === 30.5 && castLaborRatePct("final", lc.byCast, "zz", 1_000_000) === null
  && castLaborRatePct("final", lc.byCast, "c1", 0) === null && castLaborRatePct("draft", lc.byCast, "c1", 1_000_000) === null);

// ══ 6 月報の丸め統一 ══
check("lc(6a) ★月報も小数 1 桁へ統一（124,000 ÷ 1,000,000＝12.4・旧整数 % の 12 ではない＝Agoora 判断 2026-09-11）", laborRatePct("final", 124_000, 1_000_000) === 12.4);

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-labor-cost ALL PASS (${pass} assertions)`);
console.log("B6-4 人件費(純関数): state none/draft/final・paid も final・gross＝pay.gross 凍結値の和・byCast・率は final∧sales>0 のみ小数 1 桁（月報も統一）");
