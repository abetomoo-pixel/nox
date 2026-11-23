/*
 * verify:nox-emp-history — 起票146 の案（相談役 11/23 23:10 の ■2・枝 emp-history-1124 だけ・main に入れない）: 契約区分の開始日の月から効かせる。
 *  (A) 純関数 employmentAtPeriodOf：期首に有効な行・無ければ期の中で最も早い行・履歴が無い人は今の値（未設定は null）。待遇プランの選び方（collect の loadMasters）と同じ形。
 *  (B) 1 月から雇用に変えた人（10/01 から委託）：11 月・12 月は委託・1 月は雇用。直す前の形（casts.employment＝今の値）は 11 月・12 月も雇用＝赤。
 *  (C) 履歴が無い人は今と同じ（委託／雇用／null）＝デモと本番の今の人は全員これ（2026-11-24 の本番は employment_valid_from が全員 null）。
 *  (D) 期の途中に始まる行（新しく入った人）・期首に有効な行が 2 つは throw・区分が不正は throw。
 *  (E) 結線：collect は旗 mig0206On() のときだけ cast_employment を読む（旗は false＝今と 1 バイト同じ）。
 *  DB を使わない。使い方: npx tsx scripts/verify-nox-emp-history.ts
 */
import fs from "node:fs";
import { employmentAtPeriodOf, employmentByCastOf, type EmploymentRow } from "../lib/nox/payroll/employment-at";
import { MIG_0206_APPLIED } from "../lib/nox/rules-0175/flag";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const P: Record<"2026-11" | "2026-12" | "2027-01", [string, string]> = { "2026-11": ["2026-11-01", "2026-11-30"], "2026-12": ["2026-12-01", "2026-12-31"], "2027-01": ["2027-01-01", "2027-01-31"] };

// (B) set_cast_employment('雇用', '2027-01-01') の後の行（0206 の関数が作る形＝試走 try-0206 と同じ）
const toKoyo: EmploymentRow[] = [{ employment: "委託", validFrom: "2026-10-01", validTo: "2026-12-31" }, { employment: "雇用", validFrom: "2027-01-01", validTo: null }];
check("B 11 月は委託", employmentAtPeriodOf(toKoyo, ...P["2026-11"], "雇用") === "委託");
check("B 12 月は委託", employmentAtPeriodOf(toKoyo, ...P["2026-12"], "雇用") === "委託");
check("B 1 月は雇用", employmentAtPeriodOf(toKoyo, ...P["2027-01"], "雇用") === "雇用");
const before = (_rows: EmploymentRow[], _s: string, _e: string, now: "委託" | "雇用" | null) => now; // 直す前＝casts.employment（今の値）
check("B 直す前の形は 11 月・12 月も雇用（赤）", before(toKoyo, ...P["2026-11"], "雇用") === "雇用" && before(toKoyo, ...P["2026-12"], "雇用") === "雇用");
// 先の変更を重ねた（1 月から雇用・2 月から委託）＝関数は先の行を置き換えて閉じる
const twice: EmploymentRow[] = [{ employment: "委託", validFrom: "2026-10-01", validTo: "2026-12-31" }, { employment: "雇用", validFrom: "2027-01-01", validTo: "2027-01-31" }, { employment: "委託", validFrom: "2027-02-01", validTo: null }];
check("B 重ねた変更：12 月 委託・1 月 雇用・2 月 委託", employmentAtPeriodOf(twice, ...P["2026-12"], null) === "委託" && employmentAtPeriodOf(twice, ...P["2027-01"], null) === "雇用" && employmentAtPeriodOf(twice, "2027-02-01", "2027-02-28", null) === "委託");

// (C) 履歴が無い人
for (const now of ["委託", "雇用", null] as const) check(`C 履歴が無い人は今と同じ（${now ?? "未設定"}）`, employmentAtPeriodOf([], ...P["2026-11"], now) === now);
// 今の値から 1 行（0206 の 4. の形）＝どの期でも今と同じ
const one: EmploymentRow[] = [{ employment: "委託", validFrom: "2026-09-15", validTo: null }];
for (const k of Object.keys(P) as (keyof typeof P)[]) check(`C 今の値の 1 行は ${k} も委託`, employmentAtPeriodOf(one, ...P[k], "委託") === "委託");
check("C 1 行の始まりが期末より後（その期は fallback＝今の値）", employmentAtPeriodOf([{ employment: "雇用", validFrom: "2026-12-05", validTo: null }], ...P["2026-11"], "雇用") === "雇用");

// (D) 期の途中に始まる行・不正
check("D 期の途中に入った人（11/23 から雇用）＝11 月は雇用（期の中で最も早い行）", employmentAtPeriodOf([{ employment: "雇用", validFrom: "2026-11-23", validTo: null }], ...P["2026-11"], null) === "雇用");
check("D 期の途中で 2 つ（11/10 委託・11/20 雇用・期首は無し）＝最も早い委託", employmentAtPeriodOf([{ employment: "雇用", validFrom: "2026-11-20", validTo: null }, { employment: "委託", validFrom: "2026-11-10", validTo: "2026-11-19" }], ...P["2026-11"], null) === "委託");
check("D 期首より前に閉じた行は使わない（10 月で終わった委託・12 月から雇用＝11 月は fallback）", employmentAtPeriodOf([{ employment: "委託", validFrom: "2026-09-01", validTo: "2026-10-31" }, { employment: "雇用", validFrom: "2026-12-01", validTo: null }], ...P["2026-11"], "雇用") === "雇用");
let threw = false; try { employmentAtPeriodOf([{ employment: "委託", validFrom: "2026-10-01", validTo: null }, { employment: "雇用", validFrom: "2026-11-01", validTo: null }], ...P["2026-11"], null); } catch { threw = true; }
check("D 期首に有効な行が 2 つは throw（cast_plan と同じ）", threw);
let threw2 = false; try { employmentByCastOf([{ id: "c", employment: null }], [{ cast_id: "c", employment: "パート", valid_from: "2026-10-01", valid_to: null }], ...P["2026-11"]); } catch { threw2 = true; }
check("D 区分が不正は throw", threw2);
const m = employmentByCastOf([{ id: "a", employment: "雇用" }, { id: "b", employment: "委託" }, { id: "c", employment: null }], [{ cast_id: "a", employment: "委託", valid_from: "2026-10-01", valid_to: "2026-12-31" }, { cast_id: "a", employment: "雇用", valid_from: "2027-01-01", valid_to: null }], ...P["2026-12"]);
check("D cast 別：a は 12 月 委託・b（履歴なし）は今の委託・c は null", m.get("a") === "委託" && m.get("b") === "委託" && m.get("c") === null, Object.fromEntries(m));

// (E) 結線
const col = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
check("E collect は旗のときだけ cast_employment を読む", /if \(mig0206On\(\)\) \{\s*const \{ data: empRows[^\n]*from\("cast_employment"\)/.test(col));
check("E collect は employmentByCastOf で期首を win.periodStart・期末を win.periodEnd に渡す", col.includes("win.periodStart, win.periodEnd);\n") || col.includes("win.periodStart, win.periodEnd);\r\n"));
check("E 旗は false（案・本番は未適用）", MIG_0206_APPLIED === false);

if (fails.length) { console.error(`verify:nox-emp-history NG (${fails.length} fails / ${pass} pass)`); for (const f of fails) console.error("  ✗ " + f); process.exit(1); }
console.log(`verify:nox-emp-history OK (${pass} checks)`);
