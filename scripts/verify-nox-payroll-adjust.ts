/*
 * verify:nox-payroll-adjust — mig0146 payroll_adjustments（裁定258・run 別調整控除）の係留。
 *   npm run verify:nox-payroll-adjust（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）
 *   走数外（f0 では 49 段目に連結）。手貼り検証（docs/tmp/0146_post.txt・2026-09-15）と同じ形。
 *
 * 固定する項目（相談役ブロック 2026-09-15）:
 *  (1) 列 15（13＋★mig0148 source／carry_from_payslip_id）・CHECK 4（mode／amount 排他／reason trim 1..200／★source manual|carryover）・
 *      index 4+pk（★mig0148 部分 unique payroll_adjustments_carryover_uidx (run_id, cast_id) where source='carryover'）・RLS enabled・policy 1 本の using 式
 *  (2) grant: 表 authenticated=SELECT のみ・anon 0／関数 3 本（add／delete／★carryover_sync）authenticated=EXECUTE・anon 0（＋anon から RPC が BLOCKED）
 *  (3) FK 6 本（orgs／stores／payroll_runs ON DELETE CASCADE／casts／created_by→users／★carry_from_payslip_id→payslips ON DELETE SET NULL）
 *  (4) 署名 3 本（add／delete／★payroll_carryover_sync(uuid)→integer）・SECURITY DEFINER
 *  (5) 異常系 5（reason 空白／bad mode／fixed amount null／rate_bp 10001／run not draft）
 *      ＝Postgres 直結の 1 トランザクション内で NOX-VERIFY-A1 に仮 run（2099-01）を作り owner-a の JWT claims を emulate して呼び、
 *        最後に ROLLBACK（payroll_adjustments／2099-01 run／audit の残留 0 を assert）。正常 add 1 件で audit の actor=users.id・reason 保持も固定。
 *  money-core（check_close／check_pay／check_void）には非接触。
 *
 *  (0) 純関数（DB 非依存・裁定264・2026-09-15）＝ lib/nox/payroll/adjust.ts と payOf の合成:
 *      率 0/10000 境界と roundYen 1 回／複数率行が同一 gross（逐次適用しない＝258-2）／before・after の源泉差（264-6）／
 *      sanction cap の基底は生 gross（264-5）／net 0 床と超過額の恒等（258-8・264-11）／空配列で既存挙動と完全一致（回帰）／
 *      控除計の集約 totalDeductionsOf＝旧 5 箇所の式と逐語同値（264-3）／buildPayInput の行素通し（core 187 の pay0 に入る）。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { payOf, withholdingOf, type PayInput, type CompPlan, type PayResult } from "../lib/nox/pay";
import { adjustOf, adjustAmountOf, totalDeductionsOf, type AdjustmentRow, type DeductionParts } from "../lib/nox/payroll/adjust";
import { buildPayInput, type CastRaw, type StoreMasters } from "../lib/nox/payroll/assemble";
import { kpiOfDraftRows } from "../lib/nox/payroll/ui-calc";
import { payrollCsvCells, type PayrollCsvPay } from "../lib/nox/payroll/csv";
import { roundYen } from "../lib/nox/money";
import { parseAdjustAddBody, parseAdjustDeleteBody, pctToBp, bpToPct, adjustRpcStatus } from "../lib/nox/payroll/adjust-route";
import { decidePayrollAccess } from "../lib/nox/payroll/authz";
import { frozenAdjustmentsOf, frozenAdjustmentKeys, readFrozenAdjustments } from "../lib/nox/payroll/adjust";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PayslipSlip from "../components/payslip-slip";
// tsx は tsconfig の jsx:"preserve" を classic 変換で落とすため、部品（.tsx）の描画に React をグローバルへ置く（suite 内のみ・app 側は非改変）
(globalThis as { React?: typeof React }).React = React;

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL", "SEED_PASSWORD"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const T = "payroll_adjustments";
const ADD_ARGS = "p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text";
const DEL_ARGS = "p_id uuid, p_reason text";
const POLICY_QUAL = "((org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id())) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))";
const COLS = ["id", "org_id", "store_id", "run_id", "cast_id", "mode", "amount", "rate_bp", "before_withholding", "show_detail", "reason", "created_by", "created_at", "source", "carry_from_payslip_id"]; // ★mig0148: 末尾 2 列
const SYNC_ARGS = "p_run_id uuid"; // ★mig0148 payroll_carryover_sync

// ── (0) 純関数 fixture（DB 非依存）──
const PLAN: CompPlan = { id: "p", name: "test", base: 3000, honBack: 1000, jonaiBack: 500, dohanBack: 2000, salesSlide: [], pointSlide: [] };
const BASE: PayInput = {
  cast: { hon: 2, jonai: 1, dohan: 0, days: 10, sales: 300_000 },
  daily: Array.from({ length: 10 }, (_, i) => ({ d: i + 1, hours: 5, sales: 30_000 })),
  plan: PLAN,
  productBack: { drink: 0, champ: 0, bottle: 0 },
  pointProducts: 0,
  customBackDefs: [],
  deductions: [{ id: "d1", name: "厚生", amount: 5000, per: "month" }],
  penalty: { fineAbsent: 10000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 },
  norm: { days: 0, dohan: 0 },
  fine: { absentN: 0, lateN: 1 },
  arDeduct: 0, advanceDeduct: 0, okuriDeduct: 0,
  periodDays: 30,
  extrasTotal: 0,
  taxMode: "委託",
};
const row = (p: Partial<AdjustmentRow>): AdjustmentRow => ({
  castId: "c1", kind: "fixed", amount: null, rateBp: null, beforeWithholding: false, showDetail: true, reason: "test", ...p,
});
const fixed = (amount: number, before = false) => row({ kind: "fixed", amount, beforeWithholding: before });
const rate = (rateBp: number, before = false) => row({ kind: "rate", rateBp, beforeWithholding: before });
// 恒等式（264-11）: net = gross − totalDeductionsOf(pay) + adjustOverflow
const identityHolds = (p: PayResult) => p.net === p.gross - totalDeductionsOf(p) + p.adjustOverflow;

function pureChecks() {
  const base = payOf(BASE);
  const g = base.gross;
  check("pa(0-0) fixture: gross>0・withholding>0・net>0（源泉差が観測できる形）", g > 0 && base.withholding > 0 && base.net > 0, JSON.stringify({ g, wh: base.withholding, net: base.net }));

  // 率 0／10000 境界・roundYen 1 回
  check("pa(0-1a) rate_bp 0 → 0", adjustAmountOf(rate(0), g) === 0);
  check("pa(0-1b) rate_bp 10000 → gross そのもの", adjustAmountOf(rate(10000), g) === g);
  check("pa(0-1c) rate_bp 2000 on 161,500 → 32,300（20%）", adjustAmountOf(rate(2000), 161_500) === 32_300);
  check("pa(0-1d) 端数＝roundYen((gross×bp)/10000) 1 回（12,345×3,333bp＝4114.5885→4115／5×5000bp＝2.5→3）",
    adjustAmountOf(rate(3333), 12_345) === roundYen((12_345 * 3333) / 10000) && adjustAmountOf(rate(3333), 12_345) === 4115
    && adjustAmountOf(rate(5000), 5) === 3);
  check("pa(0-1e) fixed は amount そのまま（gross に依存しない）", adjustAmountOf(fixed(1234), g) === 1234 && adjustAmountOf(fixed(1234), 0) === 1234);
  const bad = (r: AdjustmentRow) => { try { adjustAmountOf(r, g); return false; } catch (e) { return /bad adjustment/.test((e as Error).message); } };
  check("pa(0-1f) 不正行は throw（rate_bp 10001／−1／小数・fixed 負／null・kind 不正）",
    bad(rate(10001)) && bad(rate(-1)) && bad(row({ kind: "rate", rateBp: 12.5 })) && bad(fixed(-1)) && bad(row({ kind: "fixed", amount: null }))
    && bad(row({ kind: "percent" as unknown as "rate", rateBp: 1 })));

  // 複数率行が同一 gross（逐次適用しない）
  {
    const r = adjustOf([rate(2000, true), rate(3000, true), fixed(1000, false)], 100_000);
    check("pa(0-2a) 率行 2000＋3000 on 100,000 → 50,000（逐次なら 44,000）・行別 20,000／30,000", r.before === 50_000 && r.rows[0].applied === 20_000 && r.rows[1].applied === 30_000, JSON.stringify(r));
    check("pa(0-2b) before/after は beforeWithholding で振り分け（after＝fixed 1,000）・rows は入力順", r.after === 1000 && r.rows.length === 3 && r.rows[2].applied === 1000);
    const rev = adjustOf([fixed(1000, false), rate(3000, true), rate(2000, true)], 100_000);
    check("pa(0-2c) 並べ替えても合計不変（258-2）", rev.before === 50_000 && rev.after === 1000);
    check("pa(0-2d) 空配列 → 0／0／[]", JSON.stringify(adjustOf([], 100_000)) === JSON.stringify({ before: 0, after: 0, rows: [] }));
  }

  // before／after の源泉差（264-6）・gross 不変（258-2）
  {
    const pb = payOf({ ...BASE, adjustments: [rate(2000, true)] });
    const pa = payOf({ ...BASE, adjustments: [rate(2000, false)] });
    const a = roundYen((g * 2000) / 10000);
    check("pa(0-3a) gross は調整で動かない（分母固定）", pb.gross === g && pa.gross === g);
    check("pa(0-3b) before: withholding＝withholdingOf(gross−before)・adjBefore＝20%", pb.withholding === withholdingOf(g - a, 30, "委託") && pb.adjBefore === a && pb.adjAfter === 0, JSON.stringify({ wh: pb.withholding, exp: withholdingOf(g - a, 30, "委託") }));
    check("pa(0-3c) after: withholding は従来どおり（生 gross）・adjAfter＝20%", pa.withholding === base.withholding && pa.adjAfter === a && pa.adjBefore === 0);
    check("pa(0-3d) 源泉差＝before の方が源泉が少ない（同額でも net が大きい）", pb.withholding < pa.withholding && pb.net > pa.net);
    check("pa(0-3e) 両者とも恒等式が閉じる（overflow 0）", identityHolds(pb) && identityHolds(pa) && pb.adjustOverflow === 0 && pa.adjustOverflow === 0);
    const big = payOf({ ...BASE, adjustments: [fixed(10_000_000, true)] });
    check("pa(0-3f) before が gross を超えても源泉対象額は 0 止め（withholding 0）", big.withholding === 0 && identityHolds(big));
    check("pa(0-3g) fixedDed／fine／normPenalty は調整で不変（fixedDed 前の割り込み）", pb.fixedDed === base.fixedDed && pb.fine === base.fine && pb.normPenalty === base.normPenalty);
  }

  // sanction cap の基底は生 gross（264-5）
  {
    const sanc: PayInput = { ...BASE, taxMode: "雇用", employment: "雇用", avgDailyWage: null,
      deductions: [...BASE.deductions, { id: "s", name: "減給", amount: 100_000, per: "month", kind: "sanction" }] };
    const s0 = payOf(sanc);
    const s1 = payOf({ ...sanc, adjustments: [rate(5000, true)] });
    check("pa(0-4a) sanction capTotal＝floor(生 gross/10)・before 50% でも不変", s0.sanction?.capTotal === Math.floor(g / 10) && s1.sanction?.capTotal === s0.sanction?.capTotal && s1.sanction?.applied === s0.sanction?.applied, JSON.stringify({ s0: s0.sanction, s1: s1.sanction }));
  }

  // net 0 床と超過額の恒等（258-8・264-11）
  {
    const over = payOf({ ...BASE, adjustments: [fixed(base.net + 1000, false)] });
    check("pa(0-5a) after が net を 1,000 超過 → net 0・adjustOverflow 1,000・adjAfter は全額", over.net === 0 && over.adjustOverflow === 1000 && over.adjAfter === base.net + 1000, JSON.stringify({ net: over.net, of: over.adjustOverflow }));
    check("pa(0-5b) 恒等 net = gross − 控除計 + adjustOverflow", identityHolds(over));
    const exact = payOf({ ...BASE, adjustments: [fixed(base.net, false)] });
    check("pa(0-5c) ちょうど net と同額 → net 0・overflow 0", exact.net === 0 && exact.adjustOverflow === 0 && identityHolds(exact));
    const mix = payOf({ ...BASE, adjustments: [rate(10000, true), fixed(500, false)] });
    check("pa(0-5d) before 100%＋after 500 → withholding 0・net 0・overflow＝引ききれない分・恒等", mix.withholding === 0 && mix.net === 0 && mix.adjustOverflow > 0 && identityHolds(mix), JSON.stringify({ net: mix.net, of: mix.adjustOverflow, before: mix.adjBefore }));
    // 既存の負 net（調整なし）は床を作らない＝回帰。調整を足しても既存の負値のまま・超過は全額保持
    const negIn: PayInput = { ...BASE, deductions: [{ id: "d9", name: "巨額", amount: 10_000_000, per: "month" }] };
    const neg0 = payOf(negIn);
    const neg1 = payOf({ ...negIn, adjustments: [fixed(100, false)] });
    check("pa(0-5e) 既存の負 net は調整なしで不変（overflow 0）・調整 100 を足しても net 不変で overflow 100・恒等", neg0.net < 0 && neg0.adjustOverflow === 0 && neg1.net === neg0.net && neg1.adjustOverflow === 100 && identityHolds(neg0) && identityHolds(neg1), JSON.stringify({ n0: neg0.net, n1: neg1.net, of: neg1.adjustOverflow }));
  }

  // 空配列で既存挙動と完全一致（回帰）
  {
    const empty = payOf({ ...BASE, adjustments: [] });
    const undef = payOf(BASE);
    check("pa(0-6a) adjustments 省略と [] は全キー同値", JSON.stringify(empty) === JSON.stringify(undef));
    check("pa(0-6b) 新キーは 0（adjBefore／adjAfter／adjustOverflow）", undef.adjBefore === 0 && undef.adjAfter === 0 && undef.adjustOverflow === 0);
    check("pa(0-6c) withholding＝withholdingOf(生 gross)・net＝gross−7 項（従来式）", undef.withholding === withholdingOf(g, 30, "委託")
      && undef.net === g - undef.fixedDed - undef.fine - undef.withholding - undef.arDeduct - undef.advanceDeduct - undef.okuriDeduct - undef.normPenalty && identityHolds(undef));
    check("pa(0-6d) 具体値: timePay 150,000／hon 2,000／jonai 500／salesBack 9,000／gross 161,500／withholding 1,174／net 152,326",
      undef.timePay === 150_000 && undef.honBack === 2000 && undef.jonaiBack === 500 && undef.salesBack === 9000 && g === 161_500 && undef.withholding === 1174 && undef.net === 152_326, JSON.stringify({ g, wh: undef.withholding, net: undef.net }));
  }

  // 控除計の集約（264-3）＝旧 5 箇所の式と逐語同値（旧式は置換前の文面をそのまま写経）
  {
    type P = DeductionParts & { sanction?: { applied?: number } | null };
    const z = (v: number | undefined) => v ?? 0;
    const oldCsv = (p: PayrollCsvPay) => p.fixedDed + p.fine + p.withholding + p.arDeduct + p.advanceDeduct + p.okuriDeduct + p.normPenalty;
    const oldBoard142 = (pay: P) => z(pay.fixedDed) + z(pay.fine) + z(pay.withholding) + z(pay.arDeduct) + z(pay.advanceDeduct) + z(pay.okuriDeduct) + z(pay.normPenalty);
    const oldBoard588 = (pay: P) => z(pay.fixedDed) + z(pay.fine) + z(pay.withholding) + z(pay.arDeduct) + z(pay.advanceDeduct) + z(pay.okuriDeduct) + z(pay.normPenalty);
    const oldUiCalc = (pay: P) => z(pay.fixedDed) + z(pay.fine) + z(pay.withholding) + z(pay.arDeduct) + z(pay.advanceDeduct) + z(pay.okuriDeduct) + z(pay.normPenalty);
    const oldPanel = (pay: P) => {
      const sanctionApplied = z(pay.sanction?.applied);
      const dedRows: [string, number][] = [
        ["源泉", z(pay.withholding)], ["送り", z(pay.okuriDeduct)], ["制裁", sanctionApplied],
        ["前借り", z(pay.advanceDeduct)], ["売掛", z(pay.arDeduct)],
        ["その他", z(pay.fixedDed) - sanctionApplied + z(pay.fine) + z(pay.normPenalty)],
      ];
      return dedRows.reduce((s, [, v]) => s + v, 0);
    };
    let seed = 20260915;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const keys = ["fixedDed", "fine", "withholding", "arDeduct", "advanceDeduct", "okuriDeduct", "normPenalty"] as const;
    let allEq = true, n = 0, detail = "";
    for (let i = 0; i < 500; i++) {
      const p: P = {};
      for (const k of keys) if (rnd(4) !== 0) p[k] = rnd(300_000); // 1/4 は欠落＝0 扱い
      const sanc = rnd(3) === 0 ? { applied: Math.min(z(p.fixedDed), rnd(50_000)) } : null;
      const full: PayrollCsvPay = { timePay: 0, honBack: 0, jonaiBack: 0, dohanBack: 0, drinkBack: 0, champBack: 0, bottleBack: 0, salesBack: 0, customTotal: 0, gross: 0,
        fixedDed: z(p.fixedDed), fine: z(p.fine), withholding: z(p.withholding), arDeduct: z(p.arDeduct), advanceDeduct: z(p.advanceDeduct), okuriDeduct: z(p.okuriDeduct), normPenalty: z(p.normPenalty) };
      const t = totalDeductionsOf(p);
      const ok = t === oldCsv(full) && t === oldBoard142(p) && t === oldBoard588(p) && t === oldUiCalc(p) && t === oldPanel({ ...p, sanction: sanc }) && t === totalDeductionsOf(full);
      if (!ok) { allEq = false; detail = JSON.stringify({ p, sanc, t }); break; }
      n++;
    }
    check(`pa(0-7a) totalDeductionsOf＝旧 5 式（CSV／board 142／board 588／ui-calc／右パネル Σ）と ${n} 例で完全一致（欠落キー・sanction 分解を含む）`, allEq && n === 500, detail);
    check("pa(0-7b) 新キー adjBefore／adjAfter を足す（旧 payslip は欠落＝0）", totalDeductionsOf({ fixedDed: 1, adjBefore: 10, adjAfter: 100 }) === 111 && totalDeductionsOf({}) === 0);
    // 呼び元の実体でも同値: csv の控除計セル（index 6）・kpiOfDraftRows.ded・PayResult 直渡し
    const pr = payOf({ ...BASE, adjustments: [rate(1000, true), fixed(700, false)] });
    const cells = payrollCsvCells({ castName: "x", taxMode: "委託", period: "2026-09", pay: pr as unknown as PayrollCsvPay, extrasTotal: 0, net: pr.net, paidTotal: 0 });
    const kpi = kpiOfDraftRows([{ net: pr.net, breakdown: { pay: pr, extras: [] } }]);
    check("pa(0-7c) csv 控除計セル＝kpiOfDraftRows.ded＝totalDeductionsOf(pay)（調整込み）・CSV 恒等「控除計＝総支給−差引」は overflow 0 のとき成立",
      cells[6] === totalDeductionsOf(pr) && kpi.ded === totalDeductionsOf(pr) && pr.adjustOverflow === 0 && (cells[8] as number) - (cells[9] as number) === cells[6], JSON.stringify({ c6: cells[6], kpi: kpi.ded, t: totalDeductionsOf(pr) }));
  }

  // buildPayInput の行素通し（core 187／205 の二段 payOf に同じ行が入る）
  {
    const raw: CastRaw = {
      castId: "c1", castName: "テスト", sales: 300_000, hon: 2, jonai: 1, dohan: 0, honShimeiAmt: 0, jonaiShimeiAmt: 0,
      daily: Array.from({ length: 10 }, (_, i) => ({ bizDate: `2026-09-${String(i + 1).padStart(2, "0")}`, sales: 30_000, hours: 5 })),
      productBack: { drink: 0, champ: 0, bottle: 0 }, calculatedBack: 0, pointProducts: 0, champCnt: 0, bottleCnt: 0,
      days: 10, lateN: 1, absentN: 0, anomalyCount: 0, plan: PLAN, norm: { days: 0, dohan: 0 }, taxProfileMode: "委託", employment: "委託", avgDailyWage: null,
    };
    const masters: StoreMasters = { penalty: BASE.penalty, normConfig: BASE.normConfig, deductions: BASE.deductions, customBackDefs: [] };
    const rows = [rate(2000, false)];
    const in0 = buildPayInput(raw, "委託", masters, 30, 0, 0, 0, 0);
    const in1 = buildPayInput({ ...raw, adjustments: rows }, "委託", masters, 30, 0, 0, 0, 0);
    check("pa(0-8a) adjustments 未指定 → []・指定 → 行をそのまま素通し", JSON.stringify(in0.adjustments) === "[]" && in1.adjustments === rows);
    const p0 = payOf(in0), p1 = payOf(in1);
    check("pa(0-8b) pay0（第 1 段）の net が調整分だけ減る＝available が減り ar/adv/okuri は残り budget（配分順序）", p0.net === base.net && p1.net === base.net - roundYen((g * 2000) / 10000) && identityHolds(p1), JSON.stringify({ p0: p0.net, p1: p1.net }));
    const p2 = payOf(buildPayInput({ ...raw, adjustments: rows }, "委託", masters, 30, 0, 1000, 500, 300));
    check("pa(0-8c) 第 2 段（ar/adv/okuri 確定額）でも同じ行が効く＝net が更に 1,800 減る・恒等", p2.net === p1.net - 1800 && p2.adjAfter === p1.adjAfter && identityHolds(p2));
  }
}

// ── (6) route 層（裁定264-7／264-8）: 入力整形の純関数＝route が RPC へ渡す前の 400 判定・%→bp・authz は既存純関数の写経 ──
function routeChecks() {
  const Z = "00000000-0000-0000-0000-000000000000";
  const okBody = { storeId: "s1", period: "2026-09", castId: Z, kind: "fixed", amount: 1000, beforeWithholding: true, showDetail: true, reason: "test" };
  const err = (b: unknown) => { const r = parseAdjustAddBody(b); return r.ok ? "(ok)" : `${r.status} ${r.error}`; };
  check("pa(6-1) add: 正常（fixed 1,000・源泉前・本人表示）→ ok・rateBp null", (() => { const r = parseAdjustAddBody(okBody); return r.ok && r.value.amount === 1000 && r.value.rateBp === null && r.value.reason === "test"; })(), err(okBody));
  check("pa(6-2) add: reason 空／空白のみ／201 字 → 400 reason required", err({ ...okBody, reason: "" }) === "400 reason required (1-200)" && err({ ...okBody, reason: "   " }) === "400 reason required (1-200)" && err({ ...okBody, reason: "x".repeat(201) }) === "400 reason required (1-200)", err({ ...okBody, reason: "   " }));
  check("pa(6-3) add: ratePct 100.01／−0.01／NaN／文字列 → 400（範囲外・型）", err({ ...okBody, kind: "rate", ratePct: 100.01 }) === "400 ratePct out of range (0-100)" && err({ ...okBody, kind: "rate", ratePct: -0.01 }) === "400 ratePct out of range (0-100)"
    && err({ ...okBody, kind: "rate", ratePct: Number.NaN }) === "400 ratePct required (number)" && err({ ...okBody, kind: "rate", ratePct: "12.5" }) === "400 ratePct required (number)", err({ ...okBody, kind: "rate", ratePct: 100.01 }));
  check("pa(6-4) add: %→bp＝Math.round(pct×100)（12.5→1250・0→0・100→10000・0.01→1・99.99→9999）・bpToPct は逆写像",
    (() => { const r = parseAdjustAddBody({ ...okBody, kind: "rate", ratePct: 12.5 }); return r.ok && r.value.rateBp === 1250 && r.value.amount === null; })()
    && pctToBp(0) === 0 && pctToBp(100) === 10000 && pctToBp(0.01) === 1 && pctToBp(99.99) === 9999 && bpToPct(1250) === 12.5 && bpToPct(1) === 0.01);
  check("pa(6-5) add: fixed の amount 負／小数／文字列／欠落 → 400", err({ ...okBody, amount: -1 }).startsWith("400 amount") && err({ ...okBody, amount: 1.5 }).startsWith("400 amount") && err({ ...okBody, amount: "1000" }).startsWith("400 amount") && err({ ...okBody, amount: undefined }).startsWith("400 amount"));
  check("pa(6-6) add: kind 不正／boolean 欠落（原則7＝明示値）／castId 非 uuid／period 不正 → 400", err({ ...okBody, kind: "percent" }).startsWith("400 kind") && err({ ...okBody, beforeWithholding: undefined }).startsWith("400 beforeWithholding") && err({ ...okBody, showDetail: "yes" }).startsWith("400 showDetail")
    && err({ ...okBody, castId: "abc" }).startsWith("400 castId") && err({ ...okBody, period: "2026-13" }).startsWith("400 period"));
  const derr = (b: unknown) => { const r = parseAdjustDeleteBody(b); return r.ok ? "(ok)" : `${r.status} ${r.error}`; };
  check("pa(6-7) delete: 正常 → ok／id 非 uuid → 400／reason 空 → 400", derr({ storeId: "s1", period: "2026-09", id: Z, reason: "del" }) === "(ok)" && derr({ storeId: "s1", period: "2026-09", id: "x", reason: "del" }).startsWith("400 id") && derr({ storeId: "s1", period: "2026-09", id: Z, reason: " " }) === "400 reason required (1-200)");
  check("pa(6-8) RPC エラー写像: forbidden→403・run not draft→409・not found→404・他→400", adjustRpcStatus("forbidden") === 403 && adjustRpcStatus("run not draft") === 409 && adjustRpcStatus("cast not found") === 404 && adjustRpcStatus("bad amount") === 400);
  check("pa(6-9) authz（guardPayroll の写経＝decidePayrollAccess）: staff／cast／null は forbidden・owner ok・manager 自店 ok／他店 forbidden",
    decidePayrollAccess("staff", "s1", "s1") === "forbidden" && decidePayrollAccess("cast", "s1", "s1") === "forbidden" && decidePayrollAccess(null, null, "s1") === "forbidden"
    && decidePayrollAccess("owner", null, "s1") === "ok" && decidePayrollAccess("manager", "s1", "s1") === "ok" && decidePayrollAccess("manager", "s2", "s1") === "forbidden");
}

// (6b) staff／cast が RPC を直接叩いても forbidden（route を迂回しても DB が拒む＝二重防御）
async function roleRpcChecks() {
  const Z = "00000000-0000-0000-0000-000000000000";
  for (const key of ["staffA1", "castA1a"] as const) {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: eIn } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    check(`pa(6-10) ${key} sign-in`, !eIn, eIn?.message);
    const r1 = await c.rpc("payroll_adjustment_add", { p_run_id: Z, p_cast_id: Z, p_mode: "fixed", p_amount: 1, p_rate_bp: null, p_before_withholding: true, p_show_detail: true, p_reason: "x" });
    check(`pa(6-11) ${key} payroll_adjustment_add → forbidden`, !!r1.error && r1.error.message.includes("forbidden"), r1.error?.message ?? "通ってしまった");
    const r2 = await c.rpc("payroll_adjustment_delete", { p_id: Z, p_reason: "x" });
    check(`pa(6-12) ${key} payroll_adjustment_delete → forbidden`, !!r2.error && r2.error.message.includes("forbidden"), r2.error?.message ?? "通ってしまった");
    await c.auth.signOut();
  }
}

// ── (7) 凍結形と明細の並び（裁定264-2／264-10／264-11・DB 非依存）──
const FROZEN_ROWS: AdjustmentRow[] = [
  { ...row({ kind: "fixed", amount: 1000, beforeWithholding: true, showDetail: true, reason: "SHOWN-B1" }) },
  { ...row({ kind: "rate", rateBp: 1000, beforeWithholding: true, showDetail: false, reason: "HIDDEN-X" }) },
  { ...row({ kind: "fixed", amount: 500, beforeWithholding: false, showDetail: true, reason: "SHOWN-A1" }) },
  { ...row({ kind: "fixed", amount: 200, beforeWithholding: true, showDetail: true, reason: "SHOWN-B2" }) },
  { ...row({ kind: "fixed", amount: 300, beforeWithholding: false, showDetail: false, reason: "HIDDEN-Y" }) },
];
function frozenChecks() {
  const f = frozenAdjustmentsOf(FROZEN_ROWS, 100_000);
  check("pa(7-1) 凍結形: show_detail=true の 3 行だけ入力順（B1 1,000 before・A1 500 after・B2 200 before）・false は合算 10,300（率 10%＝10,000＋300）",
    f.shown.length === 3 && f.shown[0].reason === "SHOWN-B1" && f.shown[0].amount === 1000 && f.shown[0].before_withholding === true
    && f.shown[1].reason === "SHOWN-A1" && f.shown[1].amount === 500 && f.shown[1].before_withholding === false
    && f.shown[2].reason === "SHOWN-B2" && f.shown[2].amount === 200 && f.shown[2].before_withholding === true && f.hiddenTotal === 10_300, JSON.stringify(f));
  const keys = frozenAdjustmentKeys(f.shown, f.hiddenTotal);
  const bd = { pay: { net: 1, gross: 2 }, extras: [], cast_name: "x", ...keys };
  const s = JSON.stringify(bd);
  check("pa(7-2) ★false の理由は breakdown_json の全文検索で 0 件（HIDDEN-X／HIDDEN-Y）・true の理由は 3 件・adjustments_hidden は数値", !s.includes("HIDDEN") && (s.match(/SHOWN-/g) ?? []).length === 3 && typeof (bd as { adjustments_hidden?: unknown }).adjustments_hidden === "number", s);
  const empty = frozenAdjustmentKeys([], 0);
  const bd0 = { pay: { net: 1 }, extras: [], cast_name: "x", ...empty };
  check("pa(7-3) 調整なし → キーを足さない＝従来の breakdown と完全一致（回帰）", JSON.stringify(empty) === "{}" && JSON.stringify(bd0) === JSON.stringify({ pay: { net: 1 }, extras: [], cast_name: "x" }) && !("adjustments" in bd0));
  const rd = readFrozenAdjustments(bd);
  check("pa(7-4) 読取: before＝[B1,B2]（入力順）・after＝[A1]・hidden 10,300／旧 payslip（キー欠落）は空・0／壊れた値は無視",
    rd.before.map((a) => a.reason).join(",") === "SHOWN-B1,SHOWN-B2" && rd.after.map((a) => a.reason).join(",") === "SHOWN-A1" && rd.hiddenTotal === 10_300
    && JSON.stringify(readFrozenAdjustments({ pay: {} })) === JSON.stringify({ before: [], after: [], hiddenTotal: 0 })
    && readFrozenAdjustments({ adjustments: [{ reason: "x" }, 5, null], adjustments_hidden: "9" }).before.length === 0 && readFrozenAdjustments({ adjustments: "x" }).hiddenTotal === 0);
  // 超過額（264-11）: pay の数値 1 キーのみ・理由は pay に一切入らない
  const over = payOf({ ...BASE, adjustments: FROZEN_ROWS.concat([fixed(10_000_000, false)]) });
  const payJson = JSON.stringify(over);
  check("pa(7-5) 超過額は pay.adjustOverflow（整数）1 キー・pay の JSON に理由（SHOWN／HIDDEN）は現れない", typeof over.adjustOverflow === "number" && Number.isInteger(over.adjustOverflow) && over.adjustOverflow > 0 && !payJson.includes("SHOWN") && !payJson.includes("HIDDEN") && identityHolds(over));
  // 明細の並び（264-2）: renderToStaticMarkup で PayslipSlip を描画し、行の出現順を機械で読む
  const pay = { ...payOf({ ...BASE, adjustments: FROZEN_ROWS }), fixedDed: 5000, fine: 3000, normPenalty: 700, withholding: 1174 };
  const html = renderToStaticMarkup(createElement(PayslipSlip, { slip: { period: "2026-09", net: 1, breakdown_json: { pay: { ...pay, adjustOverflow: 5000 }, extras: [], ...keys, ar: [{ action: "deducted", amount: 400 }] } } }));
  const idx = (s2: string) => html.indexOf(s2);
  const order = ["固定控除", "罰金", "SHOWN-B1", "SHOWN-B2", "源泉（報酬・料金）", "SHOWN-A1", "ノルマ未達", "売掛"].map(idx);
  check("pa(7-6) ★明細の並び＝固定控除→罰金→[before: B1,B2]→源泉→[after: A1]→ノルマ未達→売掛（before は源泉の直前・after は直後・同群は入力順）", order.every((v) => v >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order));
  check("pa(7-7) 明細に HIDDEN の理由も「超過」も出ない（264-10／264-11）・行の金額は凍結値（1,000／500／200）", !html.includes("HIDDEN") && !html.includes("超過") && html.includes("−¥1,000") && html.includes("−¥500") && html.includes("−¥200"));
  const html0 = renderToStaticMarkup(createElement(PayslipSlip, { slip: { period: "2026-09", net: 1, breakdown_json: { pay, extras: [] } } }));
  check("pa(7-8) 調整キーなしの旧 payslip は調整行を描かない（SHOWN 0 件）", !html0.includes("SHOWN"));
}

async function main() {
  pureChecks(); // (0) DB 非依存＝接続前に評価
  frozenChecks(); // (7) 凍結形・並び（DB 非依存）
  routeChecks(); // (6) route 入力整形・authz（DB 非依存）
  await roleRpcChecks(); // (6b) staff／cast の RPC 直叩き forbidden
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

  // ── (1) 表の形 ──
  {
    const cols = await q<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [T]);
    check("pa(1-1) 列 15（★mig0148 で 13→15）", cols.length === 15, `${cols.length}`);
    check("pa(1-2) 列名と順序", JSON.stringify(cols.map((c) => c.column_name)) === JSON.stringify(COLS), cols.map((c) => c.column_name).join(","));
    const cks = await q<{ conname: string; def: string }>(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid=('public.' || $1)::regclass and contype='c' order by conname`, [T]);
    check("pa(1-3) CHECK 4（★mig0148 で 3→4）", cks.length === 4, cks.map((c) => c.conname).join(","));
    const def = (n: string) => cks.find((c) => c.conname === n)?.def ?? "";
    check("pa(1-4) CHECK mode ∈ fixed/rate", /mode = ANY \(ARRAY\['fixed'::text, 'rate'::text\]\)/.test(def("payroll_adjustments_mode_ck")), def("payroll_adjustments_mode_ck"));
    check("pa(1-5) CHECK amount 排他（fixed: amount≥0∧rate_bp null／rate: rate_bp 0..10000∧amount null）",
      /mode = 'fixed'::text\) AND \(amount IS NOT NULL\) AND \(amount >= 0\) AND \(rate_bp IS NULL\)/.test(def("payroll_adjustments_amount_ck"))
      && /mode = 'rate'::text\) AND \(rate_bp IS NOT NULL\) AND \(\(rate_bp >= 0\) AND \(rate_bp <= 10000\)\) AND \(amount IS NULL\)/.test(def("payroll_adjustments_amount_ck")), def("payroll_adjustments_amount_ck"));
    check("pa(1-6) CHECK reason trim 1..200", /length\(TRIM\(BOTH FROM reason\)\) >= 1\) AND \(length\(TRIM\(BOTH FROM reason\)\) <= 200\)/.test(def("payroll_adjustments_reason_ck")), def("payroll_adjustments_reason_ck"));
    check("pa(1-6b) ★mig0148 CHECK source ∈ manual/carryover", /source = ANY \(ARRAY\['manual'::text, 'carryover'::text\]\)/.test(def("payroll_adjustments_source_ck")), def("payroll_adjustments_source_ck"));
    const idx = await q<{ indexname: string; indexdef: string }>(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename=$1 order by indexname`, [T]);
    check("pa(1-7) index 4+pk（★mig0148 で carryover_uidx 追加）", JSON.stringify(idx.map((i) => i.indexname)) === JSON.stringify(["payroll_adjustments_carryover_uidx", "payroll_adjustments_cast_idx", "payroll_adjustments_org_idx", "payroll_adjustments_pkey", "payroll_adjustments_run_idx"]), idx.map((i) => i.indexname).join(","));
    const uidxDef = idx.find((i) => i.indexname === "payroll_adjustments_carryover_uidx")?.indexdef ?? "";
    check("pa(1-7b) ★mig0148 carryover_uidx＝UNIQUE (run_id, cast_id) WHERE source='carryover'（manual 行には掛からない部分 unique）", /CREATE UNIQUE INDEX payroll_adjustments_carryover_uidx ON public\.payroll_adjustments USING btree \(run_id, cast_id\) WHERE \(source = 'carryover'::text\)/.test(uidxDef), uidxDef);
    const colDef = await q<{ column_name: string; data_type: string; column_default: string | null; is_nullable: string }>(`select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('source','carry_from_payslip_id') order by ordinal_position`, [T]);
    check("pa(1-11) ★mig0148 source text not null default 'manual'／carry_from_payslip_id uuid null", colDef.length === 2 && colDef[0].column_name === "source" && colDef[0].data_type === "text" && colDef[0].is_nullable === "NO" && colDef[0].column_default === "'manual'::text" && colDef[1].column_name === "carry_from_payslip_id" && colDef[1].data_type === "uuid" && colDef[1].is_nullable === "YES", JSON.stringify(colDef));
    const rls = await q<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid=('public.' || $1)::regclass`, [T]);
    check("pa(1-8) RLS enabled", rls[0]?.relrowsecurity === true);
    const pol = await q<{ policyname: string; cmd: string; roles: string; qual: string }>(
      `select p.policyname, p.cmd, p.roles::text as roles, pg_get_expr(pp.polqual, pp.polrelid) as qual
         from pg_policies p join pg_policy pp on pp.polname = p.policyname and pp.polrelid = ('public.' || $1)::regclass
        where p.schemaname='public' and p.tablename=$1`, [T]);
    check("pa(1-9) policy 1 本（select・authenticated）", pol.length === 1 && pol[0].cmd === "SELECT" && pol[0].roles === "{authenticated}", JSON.stringify(pol.map((p) => [p.policyname, p.cmd, p.roles])));
    check("pa(1-10) policy の using 式＝payroll_runs_select 同形（owner 全店∨自店 ∧ owner/manager 許可列挙）", pol[0]?.qual === POLICY_QUAL, pol[0]?.qual);
  }

  // ── (2) grant ──
  {
    const tg = await q<{ grantee: string; privs: string }>(`select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema='public' and table_name=$1 group by grantee`, [T]);
    const m = Object.fromEntries(tg.map((r) => [r.grantee, r.privs]));
    check("pa(2-1) 表 authenticated=SELECT のみ", m.authenticated === "SELECT", JSON.stringify(m));
    check("pa(2-2) 表 anon 0・PUBLIC 0", !m.anon && !m.PUBLIC, JSON.stringify(m));
    const fg = await q<{ proname: string; acl: string | null }>(`select proname, proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete','payroll_carryover_sync') order by proname`);
    check("pa(2-3) 関数 3 本（add／delete／★mig0148 carryover_sync）", fg.length === 3, fg.map((f) => f.proname).join(","));
    for (const f of fg) {
      const acl = f.acl ?? "";
      check(`pa(2-4) ${f.proname} authenticated=EXECUTE`, /authenticated=X/.test(acl), acl);
      check(`pa(2-5) ${f.proname} anon 0・public 0`, acl !== "" && !/anon=/.test(acl) && !/[{,]=X/.test(acl), acl);
    }
    // anon から能動 BLOCKED（permission denied for function）
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const z = "00000000-0000-0000-0000-000000000000";
    const r1 = await anon.rpc("payroll_adjustment_add", { p_run_id: z, p_cast_id: z, p_mode: "fixed", p_amount: 1, p_rate_bp: null, p_before_withholding: true, p_show_detail: true, p_reason: "x" });
    check("pa(2-6) anon payroll_adjustment_add BLOCKED", !!r1.error?.message?.includes("permission denied for function"), r1.error?.message ?? "(no error)");
    const r2 = await anon.rpc("payroll_adjustment_delete", { p_id: z, p_reason: "x" });
    check("pa(2-7) anon payroll_adjustment_delete BLOCKED", !!r2.error?.message?.includes("permission denied for function"), r2.error?.message ?? "(no error)");
    const r3 = await anon.rpc("payroll_carryover_sync", { p_run_id: z });
    check("pa(2-8) ★mig0148 anon payroll_carryover_sync BLOCKED", !!r3.error?.message?.includes("permission denied for function"), r3.error?.message ?? "(no error)");
  }

  // ── (3) FK ──
  {
    const fk = await q<{ conname: string; def: string }>(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid=('public.' || $1)::regclass and contype='f' order by conname`, [T]);
    const defs = fk.map((f) => f.def);
    check("pa(3-1) FK 6 本（★mig0148 で carry_from_payslip_id 追加）", fk.length === 6, fk.map((f) => f.conname).join(","));
    check("pa(3-7) ★mig0148 carry_from_payslip_id→payslips ON DELETE SET NULL", defs.some((d) => d === "FOREIGN KEY (carry_from_payslip_id) REFERENCES payslips(id) ON DELETE SET NULL"), defs.join(" | "));
    check("pa(3-2) org_id→orgs", defs.some((d) => d === "FOREIGN KEY (org_id) REFERENCES orgs(id)"));
    check("pa(3-3) store_id→stores", defs.some((d) => d === "FOREIGN KEY (store_id) REFERENCES stores(id)"));
    check("pa(3-4) run_id→payroll_runs ON DELETE CASCADE", defs.some((d) => d === "FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE"));
    check("pa(3-5) cast_id→casts", defs.some((d) => d === "FOREIGN KEY (cast_id) REFERENCES casts(id)"));
    check("pa(3-6) created_by→users", defs.some((d) => d === "FOREIGN KEY (created_by) REFERENCES users(id)"));
  }

  // ── (4) 署名 ──
  {
    const sig = await q<{ proname: string; args: string; ret: string; prosecdef: boolean }>(`select proname, pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as ret, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete','payroll_carryover_sync') order by proname`);
    const add = sig.find((s) => s.proname === "payroll_adjustment_add"), del = sig.find((s) => s.proname === "payroll_adjustment_delete"), sync = sig.find((s) => s.proname === "payroll_carryover_sync");
    check("pa(4-5) ★mig0148 carryover_sync の署名 (uuid)→integer", sync?.args === SYNC_ARGS && sync?.ret === "integer", `${sync?.args} → ${sync?.ret}`);
    check("pa(4-6) ★mig0148 carryover_sync SECURITY DEFINER", sync?.prosecdef === true);
    check("pa(4-1) add の署名 (uuid,uuid,text,integer,integer,boolean,boolean,text)→uuid", add?.args === ADD_ARGS && add?.ret === "uuid", `${add?.args} → ${add?.ret}`);
    check("pa(4-2) add SECURITY DEFINER", add?.prosecdef === true);
    check("pa(4-3) delete の署名 (uuid,text)→void", del?.args === DEL_ARGS && del?.ret === "void", `${del?.args} → ${del?.ret}`);
    check("pa(4-4) delete SECURITY DEFINER", del?.prosecdef === true);
  }

  // ── (5) 異常系（1 トランザクション・savepoint・最後に ROLLBACK）──
  {
    const ownerEmail = FIXTURE_USERS.ownerA.email;
    const u = await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [ownerEmail]);
    const st = await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]);
    check("pa(5-0) fixture: owner-a と A1 が引ける（seed:f0 済み）", u.length === 1 && st.length === 1, `users ${u.length}・stores ${st.length}`);
    if (u.length === 1 && st.length === 1) {
      const ownerUsersId = u[0].id, ownerAuthUid = u[0].auth_user_id, storeA1 = st[0].id, orgA = st[0].org_id;
      const cast = await q<{ id: string }>(`select id from public.casts where store_id = $1 and is_active order by created_at limit 1`, [storeA1]);
      const castId = cast[0]?.id;
      check("pa(5-0b) fixture: A1 の有効キャストが 1 人以上", !!castId);
      const before = (await q<{ adj: number; runs: number; audits: number }>(`select (select count(*)::int from public.payroll_adjustments) as adj, (select count(*)::int from public.payroll_runs where period='2099-01') as runs, (select count(*)::int from public.audit_logs where action like 'payroll_adjustment%') as audits`))[0];
      // (6c) 直 SELECT の RLS 実測用（裁定264-1 の読取経路＝新 RPC を作らない根拠・手順 2 実測 2026-09-15）
      const uidOf = async (key: "managerA1" | "staffA1" | "castA1a" | "managerB1") => (await q<{ auth_user_id: string }>(`select auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS[key].email]))[0]?.auth_user_id;
      const rlsUids = { managerA1: await uidOf("managerA1"), staffA1: await uidOf("staffA1"), castA1a: await uidOf("castA1a"), managerB1: await uidOf("managerB1") };
      await db.query("begin");
      try {
        const asOwner = async () => {
          await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerAuthUid, role: "authenticated" })]);
          await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerAuthUid]);
          await db.query(`set local role authenticated`);
        };
        const ADD = `select public.payroll_adjustment_add($1,$2,$3,$4,$5,$6,$7,$8) as id`;
        const expectErr = async (label: string, params: unknown[], expected: string) => {
          await db.query("savepoint sp");
          let got = "(no error)";
          try { await asOwner(); await db.query(ADD, params); } catch (e) { got = (e as Error).message; }
          await db.query("rollback to savepoint sp");
          check(`pa(5) ${label} → '${expected}'`, got === expected, `got '${got}'`);
        };
        await db.query("savepoint fixture");
        const run = await q<{ id: string }>(`insert into public.payroll_runs (org_id, store_id, period, status, created_by) values ($1,$2,'2099-01','draft',$3) returning id`, [orgA, storeA1, ownerUsersId]);
        const runId = run[0].id;
        await expectErr("reason 空白のみ", [runId, castId, "fixed", 1000, null, true, true, "   "], "reason required");
        await expectErr("mode 不正", [runId, castId, "percent", 1000, null, true, true, "test"], "bad mode");
        await expectErr("fixed で amount null", [runId, castId, "fixed", null, null, true, true, "test"], "bad amount");
        await expectErr("rate_bp 10001", [runId, castId, "rate", null, 10001, true, true, "test"], "bad amount");
        // 正常 add 1 件（rollback）＝audit の actor と reason
        await db.query("savepoint sp");
        let okId: string | null = null, okErr = "";
        try { await asOwner(); okId = (await q<{ id: string }>(ADD, [runId, castId, "rate", null, 2000, true, true, "test ok"]))[0].id; } catch (e) { okErr = (e as Error).message; }
        const au = okId ? await q<{ action: string; actor_user_id: string; store_id: string; reason: string }>(`select action, actor_user_id, store_id, reason from public.audit_logs where target = $1`, ["payroll_adjustments:" + okId]) : [];
        const row = okId ? await q<{ mode: string; rate_bp: number; amount: number | null; created_by: string }>(`select mode, rate_bp, amount, created_by from public.payroll_adjustments where id = $1`, [okId]) : [];
        // (6c) 直 SELECT の RLS: owner（asOwner 中）1・manager 自店 1・staff 0・cast 0・他店 manager 0（claims を差し替えて同一 savepoint 内で読む）
        const asUid = async (uid: string) => {
          await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
          await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
          await db.query(`set local role authenticated`);
        };
        const cnt = async () => okId ? (await q<{ n: number }>(`select count(*)::int as n from public.payroll_adjustments where id = $1`, [okId]))[0].n : -1;
        const seen: Record<string, number> = { owner: await cnt() };
        for (const [k, uid] of Object.entries(rlsUids)) { if (uid) { await asUid(uid); seen[k] = await cnt(); } else seen[k] = -2; }
        check("pa(6-13) 直 SELECT RLS: owner 1・manager 自店 1・staff 0・cast 本人 0・他店 manager 0（258-10）", seen.owner === 1 && seen.managerA1 === 1 && seen.staffA1 === 0 && seen.castA1a === 0 && seen.managerB1 === 0, JSON.stringify(seen));
        await db.query("rollback to savepoint sp");
        // (7b) /mine の経路＝payslips の直 SELECT を cast 本人で読み、凍結形に false の理由が無いことを DB 越しに確認（264-10）
        await db.query("savepoint sp7");
        try {
          await db.query("reset role");
          const castOfUser = await q<{ id: string }>(`select c.id from public.casts c join public.users u on u.id = c.user_id where u.email = $1 and c.store_id = $2 limit 1`, [FIXTURE_USERS.castA1a.email, storeA1]);
          const myCast = castOfUser[0]?.id;
          check("pa(7b-0) fixture: castA1a の cast 行が引ける", !!myCast);
          if (myCast) {
            const f = frozenAdjustmentsOf(FROZEN_ROWS, 100_000);
            const bd = { pay: { net: 0, gross: 0, adjustOverflow: 0 }, extras: [], cast_name: "x", ...frozenAdjustmentKeys(f.shown, f.hiddenTotal) };
            const ps = await q<{ id: string }>(`insert into public.payslips (org_id, store_id, run_id, cast_id, period, breakdown_json, net) values ($1,$2,$3,$4,'2099-01',$5,0) returning id`, [orgA, storeA1, runId, myCast, JSON.stringify(bd)]);
            if (rlsUids.castA1a) await asUid(rlsUids.castA1a);
            const mine = await q<{ breakdown_json: unknown; net: number }>(`select breakdown_json, net from public.payslips where id = $1`, [ps[0].id]);
            const txt = JSON.stringify(mine[0]?.breakdown_json ?? null);
            check("pa(7b-1) cast 本人は自分の payslip を読める（1 行）・凍結値に SHOWN 3 件・HIDDEN 0 件・adjustments_hidden 10,300", mine.length === 1 && (txt.match(/SHOWN-/g) ?? []).length === 3 && !txt.includes("HIDDEN") && txt.includes("\"adjustments_hidden\":10300"), txt);
            const adjAsCast = await q<{ n: number }>(`select count(*)::int as n from public.payroll_adjustments where run_id = $1`, [runId]);
            check("pa(7b-2) cast 本人は payroll_adjustments を 0 行（表の RLS）＝理由の到達経路は breakdown_json のみ", adjAsCast[0].n === 0);
          }
        } finally {
          await db.query("rollback to savepoint sp7");
        }
        check("pa(5+) 正常 add（rate 2000）が uuid を返す", !!okId, okErr);
        check("pa(5+) 行＝mode rate・rate_bp 2000・amount null・created_by=users.id", row[0]?.mode === "rate" && row[0]?.rate_bp === 2000 && row[0]?.amount === null && row[0]?.created_by === ownerUsersId, JSON.stringify(row[0] ?? null));
        check("pa(5+) audit 1 件 action/actor=users.id/store/reason", au.length === 1 && au[0].action === "payroll_adjustment_add" && au[0].actor_user_id === ownerUsersId && au[0].store_id === storeA1 && au[0].reason === "test ok", JSON.stringify(au[0] ?? null));
        // finalized な run → run not draft
        await db.query(`update public.payroll_runs set status='finalized', finalized_at=now() where id=$1`, [runId]);
        await expectErr("finalized な run へ add", [runId, castId, "fixed", 1000, null, true, true, "test"], "run not draft");
        await db.query("rollback to savepoint fixture");
      } finally {
        await db.query("rollback");
      }
      const after = (await q<{ adj: number; runs: number; audits: number }>(`select (select count(*)::int from public.payroll_adjustments) as adj, (select count(*)::int from public.payroll_runs where period='2099-01') as runs, (select count(*)::int from public.audit_logs where action like 'payroll_adjustment%') as audits`))[0];
      check("pa(5-9) ROLLBACK 後の残留＝実行前と同値（adjustments／2099-01 run／audit）", JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
    }
  }

  await db.end();
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-payroll-adjust ALL PASS (${pass} assertions)`);
  console.log("run 別調整控除(0146＋0148): 列 15・CHECK 4・index 4+pk（部分 unique）・RLS・policy using 式 / grant 表 SELECT のみ・関数 3 本 EXECUTE・anon 0＋BLOCKED / FK 6（cascade・set null）/ 署名 3・secdef / 異常系 5＋正常 add の audit（ROLLBACK・残留 0）");
  console.log("純関数(裁定264): 率 0/10000 境界・roundYen 1 回 / 複数率行が同一 gross / before・after の源泉差・sanction cap 生 gross / net 0 床と超過額の恒等 / 空配列回帰 / 控除計の集約＝旧 5 式と 500 例一致 / buildPayInput 素通し（二段 payOf）");
  console.log("route 層(裁定264-7/8): parse＝reason 空 400・ratePct 範囲外 400・%→bp Math.round・boolean 明示・delete parse / authz 写経（staff/cast forbidden）/ staff・cast の RPC 直叩き forbidden / 直 SELECT RLS（owner・manager 自店のみ）");
  console.log("凍結形と明細(裁定264-2/10/11): show_detail=true のみ理由付き・false は合算 1 キー（理由 0 件）・調整なしはキー無し（回帰）・超過は pay の整数 1 キー・明細の並び＝before 源泉直前／after 直後／入力順（renderToStaticMarkup）・cast 本人の直 SELECT に HIDDEN 0 件");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
