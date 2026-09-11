/*
 * verify:nox-compare — B6-11 比較（前月比・前年同月比）の純関数テスト（DB 非依存・走数外・裁定 B6-11／B6-10 ②・2026-09-11）。
 *   npm run verify:nox-compare
 * 観点 5:
 *  1 diffOf amount／count: 通常値（小数 1 桁 %）・負・cur 0・prev 0（分母 0→pct null・abs は残る）・prev null／cur null／両 null
 *  2 diffOf rate: pct 常に null・abs は pt 差（浮動小数の端数を 1 桁へ丸め）・null
 *  3 prevMonthOf: 年跨ぎ（2026-01→2025-12）・通常・閏年 2 月（2024-03→2024-02・日付は 1 日固定＝末日に依存しない）
 *  4 prevYearMonthOf: 2026-09→2025-09・1 月・閏年 2 月（2024-02→2023-02）・閏日を含む月からの −12
 *  5 表示例の再現（+12,300（+4.6%）／−1.2pt）
 */
import { diffOf, prevMonthOf, prevYearMonthOf } from "../lib/nox/analytics/compare";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ══ 1 amount／count ══
check("cp(1a) amount 通常値＝abs 整数差・pct 小数 1 桁（279,300 vs 267,000 → +12,300／+4.6%）", eq(diffOf(279_300, 267_000, "amount"), { abs: 12_300, pct: 4.6 }), JSON.stringify(diffOf(279_300, 267_000, "amount")));
check("cp(1b) amount 負（250,000 vs 267,000 → −17,000／−6.4%）", eq(diffOf(250_000, 267_000, "amount"), { abs: -17_000, pct: -6.4 }));
check("cp(1c) count 通常値（52 組 vs 48 組 → +4／+8.3%）", eq(diffOf(52, 48, "count"), { abs: 4, pct: 8.3 }));
check("cp(1d) cur 0（0 vs 267,000 → −267,000／−100%）", eq(diffOf(0, 267_000, "amount"), { abs: -267_000, pct: -100 }));
check("cp(1e) ★prev 0＝分母 0→pct null・abs は残る（12,300 vs 0 → +12,300／null）", eq(diffOf(12_300, 0, "amount"), { abs: 12_300, pct: null }));
check("cp(1f) cur 0 かつ prev 0（0 vs 0 → 0／null）", eq(diffOf(0, 0, "count"), { abs: 0, pct: null }));
check("cp(1g) ★prev null→abs／pct とも null（比較月データなし＝「—」）", eq(diffOf(279_300, null, "amount"), { abs: null, pct: null }));
check("cp(1h) cur null／両 null→null", eq(diffOf(null, 267_000, "count"), { abs: null, pct: null }) && eq(diffOf(null, null, "amount"), { abs: null, pct: null }));
check("cp(1i) 同値→0／0%", eq(diffOf(100, 100, "amount"), { abs: 0, pct: 0 }));

// ══ 2 rate ══
check("cp(2a) ★rate は pct 常に null・abs は pt 差（67.3 vs 66.1 → +1.2pt・浮動小数 1.2000000000000028 を丸める）", eq(diffOf(67.3, 66.1, "rate"), { abs: 1.2, pct: null }), JSON.stringify(diffOf(67.3, 66.1, "rate")));
check("cp(2b) rate 負（30.5 vs 31.7 → −1.2pt）・prev 0 でも pt 差（5.0 vs 0 → +5pt・pct null）", eq(diffOf(30.5, 31.7, "rate"), { abs: -1.2, pct: null }) && eq(diffOf(5.0, 0, "rate"), { abs: 5, pct: null }));
check("cp(2c) rate null（未確定・目標未設定＝「—」）", eq(diffOf(null, 66.1, "rate"), { abs: null, pct: null }) && eq(diffOf(67.3, null, "rate"), { abs: null, pct: null }));

// ══ 3 prevMonthOf ══
check("cp(3a) ★年跨ぎ 2026-01→2025-12", prevMonthOf("2026-01") === "2025-12", prevMonthOf("2026-01"));
check("cp(3b) 通常 2026-09→2026-08・2026-12→2026-11", prevMonthOf("2026-09") === "2026-08" && prevMonthOf("2026-12") === "2026-11");
check("cp(3c) ★閏年 2 月（2024-03→2024-02・2025-03→2025-02＝末日 29／28 に依存しない）", prevMonthOf("2024-03") === "2024-02" && prevMonthOf("2025-03") === "2025-02");

// ══ 4 prevYearMonthOf ══
check("cp(4a) ★2026-09→2025-09", prevYearMonthOf("2026-09") === "2025-09", prevYearMonthOf("2026-09"));
check("cp(4b) 1 月 2026-01→2025-01・12 月 2026-12→2025-12", prevYearMonthOf("2026-01") === "2025-01" && prevYearMonthOf("2026-12") === "2025-12");
check("cp(4c) ★閏年 2 月 2024-02→2023-02・閏年末日を含む月から 2025-02→2024-02", prevYearMonthOf("2024-02") === "2023-02" && prevYearMonthOf("2025-02") === "2024-02");
check("cp(4d) 前月・前年同月の合成（2026-01 の前年同月の前月＝2024-12）", prevMonthOf(prevYearMonthOf("2026-01")) === "2024-12");

// ══ 5 表示例 ══
{
  const d = diffOf(279_300, 267_000, "amount");
  const s = `${d.abs! > 0 ? "+" : ""}${d.abs!.toLocaleString()}（${d.pct! > 0 ? "+" : ""}${d.pct}%）`;
  const r = diffOf(66.1, 67.3, "rate");
  const rs = `${r.abs! < 0 ? "−" : "+"}${Math.abs(r.abs!).toFixed(1)}pt`;
  check("cp(5a) 表示例＝「+12,300（+4.6%）」／「−1.2pt」", s === "+12,300（+4.6%）" && rs === "−1.2pt", s + " / " + rs);
}

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-compare ALL PASS (${pass} assertions)`);
console.log("B6-11 比較(純関数): amount/count の差分と小数1桁%・prev 0 は pct null・null は「—」・rate は pt 差のみ・前月/前年同月は addMonths 同式（年跨ぎ・閏年）");
