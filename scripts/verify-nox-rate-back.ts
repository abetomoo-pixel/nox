/*
 * verify:nox-rate-back — 率バック方式切替（mig0086・率バック設計 v1 裁定 i–vi）の係留（段45）。
 *   npm run verify:nox-rate-back（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * 観点（D3-4）:
 *  1 ★玲奈ゴールデン完全不変（T1a=5170 / T1b=5931 / withholding=125802）＋ per_count 構造 assert
 *    （mode 未指定＝'per_count' 明示と全一致・per_count は honShimeiAmt を読まない）
 *  2 rate 集計: Σ指名料行×% を roundYen 1回（裁定iv・行ごと丸めと区別できる金額で検証）・
 *    void 除外・open 伝票算入（0047 系列＝close 非依存）・他 cast 不算入・窓境界 [startTs, endTs)
 *  3 混在（hon=rate / jonai=per_count・裁定ii）＋裁定vi 系統分離
 *    （rate 側は check_nominations の本数に反応しない／per_count 側は指名料行に反応しない）
 *  4 override 原子性（ペア○・単独×＝RPC 負系）・排他 CHECK 負系・切替往復で円/本値残存（裁定v）・
 *    rate=0/100 端点・旧10引数 update の mode 戻り（既知挙動として固定）
 *  5 verify:f0 全走は本スイートの外（package.json の verify:f0 連鎖末尾に組み込み）
 *
 * fixture は段内動的生成（NOX-VERIFY-rb* 命名・period 2028-03 隔離）＋ finally 全消し。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { payOf, applyOverride, type CompPlan, type PayInput, type DailyRecord } from "../lib/nox/pay";
import { roundYen } from "../lib/nox/money";
import { resolvePayrollWindow } from "../lib/nox/payroll/window";
import { collectPeriod } from "../lib/nox/payroll/collect";
import { buildPayInput } from "../lib/nox/payroll/assemble";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// ══════════════════════════════════════════════════════════
// 1 純関数（DB なし）: 玲奈ゴールデン＋per_count 構造＋rate 純計算＋applyOverride 原子性
// ══════════════════════════════════════════════════════════

// ── 玲奈 fixture（verify-nox-pay.ts の逐語複製＝golden の独立再計測）──
function mockDaily(cast: { days: number; sales: number }, hoursPerShift = 5): DailyRecord[] {
  const t = [1.4, 1, 0.6, 1.1, 0.8, 1.2];
  const s = [1, 1.1, 0.85, 1, 0.9, 1.15];
  const o = cast.days;
  if (o <= 0) return [];
  let n = 0;
  const f: number[] = [];
  for (let L = 0; L < o; L++) {
    f.push(t[L % t.length]);
    n += t[L % t.length];
  }
  const out: DailyRecord[] = [];
  let p = 0;
  for (let L = 0; L < o; L++) {
    let M = Math.round((cast.sales * f[L]) / n);
    if (L === o - 1) M = Math.max(0, cast.sales - p);
    p += M;
    const w = Math.round(hoursPerShift * s[L % s.length] * 10) / 10;
    out.push({ d: L + 1, hours: w, sales: M });
  }
  return out;
}

const P_HI: CompPlan = {
  id: "p_hi",
  name: "特別待遇（高）",
  base: 5000,
  honBack: 4000,
  jonaiBack: 1500,
  dohanBack: 4000,
  salesSlide: [
    { at: 80_000, wage: 4000 },
    { at: 150_000, wage: 5500 },
    { at: 250_000, wage: 7000 },
  ],
  pointSlide: [
    { at: 5, wage: 4000 },
    { at: 10, wage: 5500 },
    { at: 16, wage: 7000 },
  ],
};

const REINA = { hon: 48, jonai: 30, dohan: 12, days: 22, sales: 1_850_000 };
const REINA_INPUT: PayInput = {
  periodDays: 31,
  extrasTotal: 0,
  cast: REINA,
  daily: mockDaily(REINA, 5),
  plan: P_HI,
  productBack: { drink: 122_500, champ: 68_000, bottle: 0 },
  pointProducts: 110,
  customBackDefs: [
    { id: "cb_kaikin", name: "皆勤手当", basis: "days", value: 300 },
    { id: "cb_champ", name: "シャンパン8本ボーナス", basis: "flat", value: 30_000, cond: { metric: "champCnt", min: 8 } },
    { id: "cb_sales", name: "売上150万達成2%", basis: "sales", value: 2, cond: { metric: "sales", min: 1_500_000 } },
  ],
  metrics: { champCnt: 9, bottleCnt: 0 },
  deductions: [
    { id: "send", name: "送り代", amount: 2000, per: "day" },
    { id: "kousei", name: "厚生費", amount: 5000, per: "month" },
  ],
  penalty: { fineAbsent: 10_000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: true, daysFlat: 5000, daysPer: 2000, dohanFlat: 3000, dohanPer: 1500 },
  norm: { days: 24, dohan: 15 },
  fine: { absentN: 0, lateN: 0 },
  arDeduct: 0,
  advanceDeduct: 0,
  okuriDeduct: 3500,
  taxMode: "委託",
};

function pureChecks() {
  // ── ★玲奈ゴールデン完全不変（mode 未指定＝per_count 経路）──
  const t1a = payOf({ ...REINA_INPUT, pointProducts: 0 });
  check("段45-1 ★T1a wage=5170（設計書ゴールデン不変）", t1a.wage === 5170, `got ${t1a.wage}`);
  check("段45-1 ★T1a withholding=117241", t1a.withholding === 117_241, `got ${t1a.withholding}`);
  const t1b = payOf(REINA_INPUT);
  check("段45-1 ★T1b wage=5931（モック忠実ゴールデン不変）", t1b.wage === 5931, `got ${t1b.wage}`);
  check("段45-1 ★T1b withholding=125802", t1b.withholding === 125_802, `got ${t1b.withholding}`);
  check("段45-1 ★T1b net=1192348", t1b.net === 1_192_348, `got ${t1b.net}`);
  // per_count 構造 assert: honBack/jonaiBack は本数×円/本のまま
  check("段45-1 per_count 構造: honBack=48×4000=192000", t1b.honBack === REINA.hon * P_HI.honBack && t1b.honBack === 192_000, `got ${t1b.honBack}`);
  check("段45-1 per_count 構造: jonaiBack=30×1500=45000", t1b.jonaiBack === REINA.jonai * P_HI.jonaiBack && t1b.jonaiBack === 45_000, `got ${t1b.jonaiBack}`);

  // ── mode 未指定 ≡ 'per_count' 明示（PayResult 全一致。plan/eplan は入力プランのエコーで
  //    明示4フィールドの有無だけ differ するため除外＝金額・内訳フィールドは全て比較対象）──
  const stripEcho = (r: Record<string, unknown>) => JSON.stringify({ ...r, plan: undefined, eplan: undefined });
  const explicitPlan: CompPlan = { ...P_HI, honBackMode: "per_count", honBackRate: null, jonaiBackMode: "per_count", jonaiBackRate: null };
  const rExplicit = payOf({ ...REINA_INPUT, plan: explicitPlan });
  check("段45-1 mode 未指定 ≡ 'per_count' 明示（plan エコー以外の PayResult 全一致）",
    stripEcho(rExplicit as unknown as Record<string, unknown>) === stripEcho(t1b as unknown as Record<string, unknown>), "結果が一致しない");

  // ── per_count は honShimeiAmt/jonaiShimeiAmt を読まない（母数を積んでも1円も動かない）──
  const rWithAmt = payOf({ ...REINA_INPUT, cast: { ...REINA, honShimeiAmt: 999_999, jonaiShimeiAmt: 999_999 } });
  check("段45-1 per_count は指名料母数を読まない（999999 を積んでも全一致）",
    JSON.stringify(rWithAmt) === JSON.stringify(t1b), "結果が動いた");

  // ── rate 純計算: Σ後 roundYen 1回（裁定iv・7503×50%=3751.5→3752）──
  const ratePlan: CompPlan = { ...P_HI, honBackMode: "rate", honBackRate: 50, jonaiBackMode: "rate", jonaiBackRate: 30 };
  const rRate = payOf({ ...REINA_INPUT, plan: ratePlan, cast: { ...REINA, honShimeiAmt: 7503, jonaiShimeiAmt: 3000 } });
  check("段45-1 rate 純計算: honBack=roundYen(7503×50%)=3752", rRate.honBack === 3752 && rRate.honBack === roundYen((7503 * 50) / 100), `got ${rRate.honBack}`);
  check("段45-1 rate 純計算: jonaiBack=roundYen(3000×30%)=900", rRate.jonaiBack === 900, `got ${rRate.jonaiBack}`);
  check("段45-1 rate でも dohanBack は円/本据え置き（裁定i・12×4000）", rRate.dohanBack === 48_000, `got ${rRate.dohanBack}`);
  // 端点 rate=0 / rate=100
  const r0 = payOf({ ...REINA_INPUT, plan: { ...ratePlan, honBackRate: 0 }, cast: { ...REINA, honShimeiAmt: 7503, jonaiShimeiAmt: 3000 } });
  check("段45-1 rate=0 端点: honBack=0", r0.honBack === 0, `got ${r0.honBack}`);
  const r100 = payOf({ ...REINA_INPUT, plan: { ...ratePlan, honBackRate: 100 }, cast: { ...REINA, honShimeiAmt: 7503, jonaiShimeiAmt: 3000 } });
  check("段45-1 rate=100 端点: honBack=7503（全額）", r100.honBack === 7503, `got ${r100.honBack}`);
  // 母数未指定（undefined）は 0 扱い＝rate プランでも指名料行なしはバック0円（裁定vi）
  const rNoAmt = payOf({ ...REINA_INPUT, plan: ratePlan });
  check("段45-1 rate＋母数 undefined → honBack=0/jonaiBack=0（裁定vi）", rNoAmt.honBack === 0 && rNoAmt.jonaiBack === 0, `got ${rNoAmt.honBack}/${rNoAmt.jonaiBack}`);

  // ── applyOverride ペア原子（TS 側・RPC と同輪郭）──
  const ovModeOnly = applyOverride(P_HI, { honBackMode: "rate" });
  check("段45-4 applyOverride: mode 単独（rate 値なし）は無視＝per_count のまま",
    ovModeOnly.eplan.honBackMode !== "rate" && ovModeOnly.eplan.honBackRate == null, JSON.stringify(ovModeOnly.eplan.honBackMode));
  const ovRateOnly = applyOverride(P_HI, { honBackRate: 50 });
  check("段45-4 applyOverride: rate 単独（mode なし）は無視", ovRateOnly.eplan.honBackMode !== "rate" && ovRateOnly.eplan.honBackRate == null, JSON.stringify(ovRateOnly.eplan));
  const ovPair = applyOverride(P_HI, { honBackMode: "rate", honBackRate: 50 });
  check("段45-4 applyOverride: ペア（mode+rate）は適用", ovPair.eplan.honBackMode === "rate" && ovPair.eplan.honBackRate === 50);
  const ovBackToPc = applyOverride(ratePlan, { honBackMode: "per_count", honBack: 2000 });
  check("段45-4 applyOverride: rate プランへ per_count ペアで戻せる（honBack=2000）",
    ovBackToPc.eplan.honBackMode === "per_count" && ovBackToPc.eplan.honBackRate === null && ovBackToPc.eplan.honBack === 2000, JSON.stringify(ovBackToPc.eplan));
  const ovPcOnly = applyOverride(ratePlan, { honBackMode: "per_count" });
  check("段45-4 applyOverride: per_count 単独（円/本値なし）は無視＝rate のまま",
    ovPcOnly.eplan.honBackMode === "rate" && ovPcOnly.eplan.honBackRate === 50, JSON.stringify(ovPcOnly.eplan));
  const ovJonaiPair = applyOverride(P_HI, { jonaiBackMode: "rate", jonaiBackRate: 25 });
  check("段45-4 applyOverride: jonai 同型（ペア適用・hon は不変）",
    ovJonaiPair.eplan.jonaiBackMode === "rate" && ovJonaiPair.eplan.jonaiBackRate === 25 && ovJonaiPair.eplan.honBackMode !== "rate", JSON.stringify(ovJonaiPair.eplan));
}

// ══════════════════════════════════════════════════════════
// 2/3/4 DB 係留（fixture 動的生成 → finally 全消し）
// ══════════════════════════════════════════════════════════

const CAST_NAMES = ["NOX-VERIFY-rbRate", "NOX-VERIFY-rbOther", "NOX-VERIFY-rbMix", "NOX-VERIFY-rbOv"];
const SEAT_NAME = "NOX-VERIFY-rbSeat";
const PLAN_NAMES = ["NOX-VERIFY-rbPlanRate", "NOX-VERIFY-rbPlanMix", "NOX-VERIFY-rbPlanTgl", "NOX-VERIFY-rbPlanNeg"];
const PERIOD = "2028-03"; // 他スイートと重ならない隔離 period

async function main() {
  pureChecks();

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: "managerA1" | "ownerA") => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) {
      console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
      process.exit(1);
    }
    return c;
  };
  const manager = await signIn("managerA1");
  const owner = await signIn("ownerA");

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeId = sA1!.id as string;
  const orgId = sA1!.org_id as string;
  const { data: mgr } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = mgr!.id as string;

  async function teardown() {
    const { data: seats } = await admin.from("seats").select("id").eq("name", SEAT_NAME);
    const seatIds = (seats ?? []).map((r) => r.id as string);
    if (seatIds.length) {
      const { data: chks } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const chkIds = (chks ?? []).map((r) => r.id as string);
      if (chkIds.length) {
        for (const t of ["check_cast_backs", "check_nominations", "check_lines"]) await admin.from(t).delete().in("check_id", chkIds);
        await admin.from("checks").delete().in("id", chkIds);
      }
    }
    const { data: cs } = await admin.from("casts").select("id").in("name", CAST_NAMES);
    const castIds = (cs ?? []).map((r) => r.id as string);
    if (castIds.length) {
      await admin.from("cast_plan").delete().in("cast_id", castIds);
      await admin.from("casts").delete().in("id", castIds);
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    await admin.from("comp_plans").delete().in("name", PLAN_NAMES);
  }
  await teardown();

  try {
    // ── seed ──
    const mkCast = async (name: string) => {
      const { data } = await admin.from("casts").insert({ org_id: orgId, store_id: storeId, name, is_active: true, left_on: null }).select("id").single();
      return data!.id as string;
    };
    const { data: seatR } = await admin.from("seats").insert({ org_id: orgId, store_id: storeId, name: SEAT_NAME, kind: "卓", sort_order: 0, is_active: true }).select("id").single();
    const seatId = seatR!.id as string;
    const mkPlan = async (name: string, cols: Record<string, unknown>) => {
      const { data, error } = await admin.from("comp_plans").insert({
        org_id: orgId, store_id: storeId, name, base: 5000, hon_back: 4000, jonai_back: 1500, dohan_back: 4000,
        sales_slide: [], point_slide: [], is_active: true, ...cols,
      }).select("id").single();
      if (error) throw new Error(`plan seed ${name}: ${error.message}`);
      return data!.id as string;
    };
    // rate プラン（hon 50% / jonai 30%・円/本値は保持＝裁定v）・混在プラン（hon=rate 50% / jonai=円/本）
    const planRate = await mkPlan(PLAN_NAMES[0], { hon_back_mode: "rate", hon_back_rate: 50, jonai_back_mode: "rate", jonai_back_rate: 30 });
    const planMix = await mkPlan(PLAN_NAMES[1], { hon_back_mode: "rate", hon_back_rate: 50, jonai_back_mode: "per_count", jonai_back_rate: null });

    const rbRate = await mkCast(CAST_NAMES[0]);
    const rbOther = await mkCast(CAST_NAMES[1]);
    const rbMix = await mkCast(CAST_NAMES[2]);
    const rbOv = await mkCast(CAST_NAMES[3]);
    await admin.from("cast_plan").insert([
      { org_id: orgId, store_id: storeId, cast_id: rbRate, plan_id: planRate, overrides_json: {} },
      { org_id: orgId, store_id: storeId, cast_id: rbOther, plan_id: planRate, overrides_json: {} },
      { org_id: orgId, store_id: storeId, cast_id: rbMix, plan_id: planMix, overrides_json: {} },
    ]);

    type FeeLine = { kind: string; total: number; feeKind?: string; castId?: string };
    const mkCheck = async (startedAt: string, status: "open" | "closed" | "void", nomCast: string | null, nomType: string, lines: FeeLine[]) => {
      const { data: c, error } = await admin.from("checks").insert({
        org_id: orgId, store_id: storeId, seat_id: seatId, status,
        started_at: startedAt, closed_at: status === "open" ? null : startedAt,
        nom_type: nomType, service_rate: 10, round_unit: 100, round_mode: "down", created_by: actorId,
      }).select("id").single();
      if (error) throw new Error(`check seed: ${error.message}`);
      const checkId = c!.id as string;
      let sort = 0;
      for (const l of lines) {
        const { error: eL } = await admin.from("check_lines").insert({
          org_id: orgId, store_id: storeId, check_id: checkId, kind: l.kind, pay_group: "A",
          name_snapshot: l.kind, unit_price_snapshot: l.total, qty: 1, line_total: l.total, sort_order: sort++,
          fee_kind: l.feeKind ?? null, cast_id: l.castId ?? null,
        });
        if (eL) throw new Error(`line seed: ${eL.message}`);
      }
      if (nomCast) {
        await admin.from("check_nominations").insert({ org_id: orgId, store_id: storeId, check_id: checkId, cast_id: nomCast, ratio_weight: 1, position: 0 });
      }
      return checkId;
    };

    // 窓解決（boundary fixture は窓の実タイムスタンプで作る＝cutoff 仮定を持ち込まない）
    const win = await resolvePayrollWindow(admin, storeId, PERIOD);

    // rbRate（rate×rate プラン）: closed 4001＋open 3001＋窓開始境界 501 が算入。void 9999・窓終端 11111・他cast 7777 は不算入。
    //   金額は「Σ後 roundYen 1回」を行ごと丸めと区別できる組（7503×50%=3751.5→3752≠行ごと 2001+1501+251=3753）。
    await mkCheck("2028-03-10T22:00:00+09:00", "closed", rbRate, "hon", [
      { kind: "set", total: 10_000 },
      { kind: "set", total: 4001, feeKind: "hon_shimei", castId: rbRate },
      { kind: "set", total: 3000, feeKind: "jonai_shimei", castId: rbRate },
    ]);
    await mkCheck("2028-03-15T22:00:00+09:00", "open", null, "hon", [
      { kind: "set", total: 3001, feeKind: "hon_shimei", castId: rbRate },
    ]);
    await mkCheck("2028-03-16T22:00:00+09:00", "void", null, "hon", [
      { kind: "set", total: 9999, feeKind: "hon_shimei", castId: rbRate },
    ]);
    await mkCheck(win.startTs, "closed", null, "hon", [
      { kind: "set", total: 501, feeKind: "hon_shimei", castId: rbRate },
    ]);
    await mkCheck(win.endTs, "closed", null, "hon", [
      { kind: "set", total: 11_111, feeKind: "hon_shimei", castId: rbRate },
    ]);
    // rbOther: 他 cast の指名料行（rbRate に混ざらない・rbOther 自身には算入）
    await mkCheck("2028-03-11T22:00:00+09:00", "closed", rbOther, "hon", [
      { kind: "set", total: 7777, feeKind: "hon_shimei", castId: rbOther },
    ]);
    // rbMix（hon=rate / jonai=円/本）: hon 本数1・jonai 本数1・hon_shimei 2000・jonai_shimei 8888（後者は per_count 側＝不使用）
    await mkCheck("2028-03-12T22:00:00+09:00", "closed", rbMix, "hon", [
      { kind: "set", total: 10_000 },
      { kind: "set", total: 2000, feeKind: "hon_shimei", castId: rbMix },
      { kind: "set", total: 8888, feeKind: "jonai_shimei", castId: rbMix },
    ]);
    await mkCheck("2028-03-13T22:00:00+09:00", "closed", rbMix, "jonai", [
      { kind: "set", total: 5000 },
    ]);

    // ── 2 collect: 母数集計（0047 系列・窓境界・帰属）──
    const collected = await collectPeriod(admin, manager, storeId, win);
    const rawRate = collected.casts.find((c) => c.castId === rbRate);
    check("段45-2 rbRate が収集される", !!rawRate, "raw 無し");
    if (rawRate) {
      check("段45-2 honShimeiAmt=7503（closed4001＋open3001＋窓開始501・void/窓終端/他cast 除外）",
        rawRate.honShimeiAmt === 7503, `got ${rawRate.honShimeiAmt}`);
      check("段45-2 jonaiShimeiAmt=3000", rawRate.jonaiShimeiAmt === 3000, `got ${rawRate.jonaiShimeiAmt}`);
      const input = buildPayInput(rawRate, "委託", collected.masters, 31, 0);
      const pay = payOf(input);
      check("段45-2 rate 給与: honBack=roundYen(7503×50%)=3752（Σ後1回丸め）", pay.honBack === 3752, `got ${pay.honBack}`);
      check("段45-2 rate 給与: 行ごと丸め（3753）とは一致しない＝丸めは Σ後 roundYen 1回（裁定iv）",
        pay.honBack !== 2001 + 1501 + 251, `行ごと丸めと同値になっている`);
      check("段45-2 rate 給与: jonaiBack=roundYen(3000×30%)=900", pay.jonaiBack === 900, `got ${pay.jonaiBack}`);
    }
    const rawOther = collected.casts.find((c) => c.castId === rbOther);
    check("段45-2 他 cast の母数は本人へ（rbOther honShimeiAmt=7777）", rawOther?.honShimeiAmt === 7777, `got ${rawOther?.honShimeiAmt}`);

    // ── 3 混在＋裁定vi 系統分離 ──
    const rawMix = collected.casts.find((c) => c.castId === rbMix);
    check("段45-3 rbMix が収集される", !!rawMix, "raw 無し");
    if (rawMix) {
      check("段45-3 本数系列: hon=1・jonai=1（check_nominations 由来）", rawMix.hon === 1 && rawMix.jonai === 1, `got hon=${rawMix.hon} jonai=${rawMix.jonai}`);
      check("段45-3 母数系列: honShimeiAmt=2000・jonaiShimeiAmt=8888（check_lines 由来）",
        rawMix.honShimeiAmt === 2000 && rawMix.jonaiShimeiAmt === 8888, `got ${rawMix.honShimeiAmt}/${rawMix.jonaiShimeiAmt}`);
      const payMix = payOf(buildPayInput(rawMix, "委託", collected.masters, 31, 0));
      check("段45-3 hon=rate: honBack=roundYen(2000×50%)=1000（本数1×4000 ではない＝裁定vi 系統分離）",
        payMix.honBack === 1000 && payMix.honBack !== 1 * 4000, `got ${payMix.honBack}`);
      check("段45-3 jonai=円/本: jonaiBack=1×1500=1500（指名料行8888 に反応しない＝裁定vi 系統分離）",
        payMix.jonaiBack === 1500, `got ${payMix.jonaiBack}`);
    }

    // ── 4a 排他 CHECK 負系（admin 直挿入・DB 最終防衛）──
    const insPlanNeg = async (cols: Record<string, unknown>) => {
      const { error } = await admin.from("comp_plans").insert({
        org_id: orgId, store_id: storeId, name: PLAN_NAMES[3], base: 5000, hon_back: 4000, jonai_back: 1500, dohan_back: 4000,
        sales_slide: [], point_slide: [], is_active: true, ...cols,
      });
      return error;
    };
    check("段45-4 CHECK 負系: hon mode='rate'＋rate null は拒否（排他）", !!(await insPlanNeg({ hon_back_mode: "rate", hon_back_rate: null })), "通ってしまった");
    check("段45-4 CHECK 負系: hon mode='per_count'＋rate=50 は拒否（排他）", !!(await insPlanNeg({ hon_back_mode: "per_count", hon_back_rate: 50 })), "通ってしまった");
    check("段45-4 CHECK 負系: hon rate=101 は拒否（0..100）", !!(await insPlanNeg({ hon_back_mode: "rate", hon_back_rate: 101 })), "通ってしまった");
    check("段45-4 CHECK 負系: hon mode='bogus' は拒否（2値）", !!(await insPlanNeg({ hon_back_mode: "bogus" })), "通ってしまった");
    check("段45-4 CHECK 負系: jonai mode='rate'＋rate null は拒否（jonai 同型）", !!(await insPlanNeg({ jonai_back_mode: "rate", jonai_back_rate: null })), "通ってしまった");

    // ── 4b set_comp_plan（owner・14引数）: 作成→rate 切替→往復→端点→負系→旧10引数の mode 戻り ──
    const planRow = async (id: string) =>
      (await admin.from("comp_plans").select("hon_back, hon_back_mode, hon_back_rate, jonai_back, jonai_back_mode, jonai_back_rate").eq("id", id).single()).data as Record<string, unknown>;
    const callPlan = (args: Record<string, unknown>) => owner.rpc("set_comp_plan", args);
    const base14 = (id: string | null, over: Record<string, unknown>) => ({
      p_id: id, p_store_id: storeId, p_name: PLAN_NAMES[2], p_base: 5000,
      p_hon_back: 4200, p_jonai_back: 1500, p_dohan_back: 4000,
      p_sales_slide: [], p_point_slide: [], p_is_active: true,
      p_hon_back_mode: "per_count", p_hon_back_rate: null, p_jonai_back_mode: "per_count", p_jonai_back_rate: null,
      ...over,
    });
    const { data: tglId, error: eCr } = await callPlan(base14(null, {}));
    check("段45-4 set_comp_plan 14引数で per_count 作成", !eCr && !!tglId, eCr?.message);
    const tgl = tglId as string;
    // rate へ切替（円/本値 4200 は据え置き送信）→ 円/本列残存（裁定v）
    const { error: eR1 } = await callPlan(base14(tgl, { p_hon_back_mode: "rate", p_hon_back_rate: 60 }));
    let row = await planRow(tgl);
    check("段45-4 rate 切替: mode='rate'・rate=60", !eR1 && row.hon_back_mode === "rate" && row.hon_back_rate === 60, eR1?.message ?? JSON.stringify(row));
    check("段45-4 ★切替後も円/本値 4200 が残存（裁定v）", row.hon_back === 4200, `got ${row.hon_back}`);
    // per_count へ戻す → 円/本値そのまま・rate は null
    const { error: eR2 } = await callPlan(base14(tgl, {}));
    row = await planRow(tgl);
    check("段45-4 往復: per_count へ戻して hon_back=4200 残存・rate=null",
      !eR2 && row.hon_back_mode === "per_count" && row.hon_back_rate === null && row.hon_back === 4200, eR2?.message ?? JSON.stringify(row));
    // 端点 0/100
    const { error: eE0 } = await callPlan(base14(tgl, { p_hon_back_mode: "rate", p_hon_back_rate: 0 }));
    check("段45-4 端点 rate=0 は許可", !eE0, eE0?.message);
    const { error: eE100 } = await callPlan(base14(tgl, { p_hon_back_mode: "rate", p_hon_back_rate: 100 }));
    check("段45-4 端点 rate=100 は許可", !eE100, eE100?.message);
    // 負系
    const { error: eN1 } = await callPlan(base14(tgl, { p_hon_back_mode: "rate", p_hon_back_rate: 101 }));
    check("段45-4 RPC 負系: rate=101 拒否", !!eN1, "通ってしまった");
    const { error: eN2 } = await callPlan(base14(tgl, { p_hon_back_mode: "rate", p_hon_back_rate: null }));
    check("段45-4 RPC 負系: mode='rate'＋rate null 拒否（排他）", !!eN2, "通ってしまった");
    const { error: eN3 } = await callPlan(base14(tgl, { p_hon_back_mode: "per_count", p_hon_back_rate: 50 }));
    check("段45-4 RPC 負系: mode='per_count'＋rate=50 拒否（排他）", !!eN3, "通ってしまった");
    const { error: eN4 } = await callPlan(base14(tgl, { p_jonai_back_mode: "bogus" }));
    check("段45-4 RPC 負系: jonai mode 不正値 拒否", !!eN4, "通ってしまった");
    // 旧10引数呼び（DEFAULT 'per_count'）→ rate プランの mode が戻る＝既知挙動として固定（設計 v1・D3 で UI は14引数化済み）
    await callPlan(base14(tgl, { p_hon_back_mode: "rate", p_hon_back_rate: 100 })); // まず rate 状態にする
    const { error: eOld } = await callPlan({
      p_id: tgl, p_store_id: storeId, p_name: PLAN_NAMES[2], p_base: 5000,
      p_hon_back: 4200, p_jonai_back: 1500, p_dohan_back: 4000,
      p_sales_slide: [], p_point_slide: [], p_is_active: true,
    });
    row = await planRow(tgl);
    check("段45-4 既知挙動: 旧10引数 update で mode は per_count へ戻る（値 4200 は消えない）",
      !eOld && row.hon_back_mode === "per_count" && row.hon_back_rate === null && row.hon_back === 4200, eOld?.message ?? JSON.stringify(row));

    // ── 4c set_cast_plan override 原子性（manager・8キー）──
    const callAssign = (overrides: Record<string, unknown>) =>
      manager.rpc("set_cast_plan", { p_cast_id: rbOv, p_plan_id: planRate, p_overrides: overrides });
    const { error: eA1 } = await callAssign({ honBackMode: "rate", honBackRate: 40 });
    check("段45-4 override 正系: {honBackMode:'rate', honBackRate:40} ペアは許可", !eA1, eA1?.message);
    const { data: cpRow } = await admin.from("cast_plan").select("overrides_json").eq("cast_id", rbOv).single();
    check("段45-4 override 保存内容: ペアがそのまま overrides_json に載る",
      JSON.stringify(cpRow?.overrides_json) === JSON.stringify({ honBackMode: "rate", honBackRate: 40 }), JSON.stringify(cpRow?.overrides_json));
    const { error: eA2 } = await callAssign({ honBackMode: "per_count", honBack: 1200 });
    check("段45-4 override 正系: {honBackMode:'per_count', honBack:1200} ペアは許可", !eA2, eA2?.message);
    const { error: eA3 } = await callAssign({ jonaiBackMode: "rate", jonaiBackRate: 25 });
    check("段45-4 override 正系: jonai ペアも許可", !eA3, eA3?.message);
    const { error: eA4 } = await callAssign({ honBack: 5000 });
    check("段45-4 override 正系: 値単独（方式キーなし）は従来どおり許可", !eA4, eA4?.message);
    const negCases: [string, Record<string, unknown>][] = [
      ["mode 単独（rate 値なし）", { honBackMode: "rate" }],
      ["rate 単独（mode なし）", { honBackRate: 40 }],
      ["per_count 単独（円/本値なし）", { honBackMode: "per_count" }],
      ["rate＋mode='per_count'（不整合）", { honBackMode: "per_count", honBack: 1200, honBackRate: 40 }],
      ["jonai mode 単独", { jonaiBackMode: "rate" }],
      ["jonai rate 単独", { jonaiBackRate: 25 }],
      ["rate>100", { honBackMode: "rate", honBackRate: 101 }],
      ["rate 非整数", { honBackMode: "rate", honBackRate: 40.5 }],
      ["mode 不正値", { honBackMode: "flat", honBack: 1200 }],
      ["未知キー", { foo: 1 }],
    ];
    for (const [label, ov] of negCases) {
      const { error } = await callAssign(ov);
      check(`段45-4 override 負系: ${label} は 'bad overrides'`, !!error?.message?.includes("bad overrides"), error?.message ?? "通ってしまった");
    }
  } finally {
    await teardown();
  }

  // ── 結果 ──
  if (fails.length) {
    console.error(`✗ verify:nox-rate-back FAIL ${fails.length}件 / PASS ${pass}件`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ verify:nox-rate-back PASS ${pass}件（玲奈ゴールデン 5170/5931・withholding 125802 不変を含む）`);
}

main().catch((e) => {
  console.error("✗ verify:nox-rate-back 実行エラー:", e);
  process.exit(1);
});
