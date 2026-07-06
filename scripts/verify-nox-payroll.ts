/*
 * verify:nox-payroll — 給与確定サーバ TS（F2c-2）の DB 直・HTTP 無し係留。
 *   npm run verify:nox-payroll（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * route は薄いラッパなので core/pure を直接 import して係留（seed は本節内で admin 投入・NOX-VERIFY-pay* 命名・
 * 未来の空 period 2026-09/2026-10 に隔離・再実行冪等・dev 専用の建付け維持）。
 *
 * 係留（plan §7 の7項目＋確定拒否ガード＋セルフレビュー確認2点）:
 *  1 PayInput 組み立ての正しさ（窓・cast.sales/hon・daily.hours・taxMode）
 *  2 champCnt ゴールデン（check_lines kind から集計・既知会計→champCnt=2）
 *  3 net 恒等（extras 空 ⇒ row.net===pay.net・computeNet 単体）
 *  4 権限拒否（decidePayrollAccess 純関数）
 *  5 プレビューが書き込まない（computePayrollDraft 前後で payroll_runs 件数不変）
 *  6 退職者 cast の確定（is_active=false でも対象列挙→finalize で payslip 生成）
 *  7 稼働ゼロ除外（売上も打刻も無い cast は行に出ない）
 *  8 確定拒否ガード（税区分未登録=no_tax／プラン未設定=no_plan を cast 名つき blockers・route は 422）
 *  9 get_cast_sales store スコープ（owner は org 内他店の全 cast 売上・manager は自店のみ＝確認1）
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";
import { payOf } from "../lib/nox/pay";
import { resolvePayrollWindow } from "../lib/nox/payroll/window";
import { collectPeriod } from "../lib/nox/payroll/collect";
import { buildPayInput, computeNet } from "../lib/nox/payroll/assemble";
import { computePayrollDraft } from "../lib/nox/payroll/core";
import { decidePayrollAccess } from "../lib/nox/payroll/authz";

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

const P = "2026-09"; // 完全期間（P1 完備＋P2 退職＋A2 owner×他店）
const P2 = "2026-10"; // 未登録（P3=no_tax・P4=no_plan）
const CAST_NAMES = [
  "NOX-VERIFY-payP1", "NOX-VERIFY-payP2", "NOX-VERIFY-payP3", "NOX-VERIFY-payP4", "NOX-VERIFY-payNo", "NOX-VERIFY-payA2",
  "NOX-VERIFY-payI1", "NOX-VERIFY-payI2", "NOX-VERIFY-payI3", "NOX-VERIFY-payI4", "NOX-VERIFY-payI5", // #32 incentive 係留用
];
const SEATS = ["NOX-VERIFY-paySeat", "NOX-VERIFY-paySeat2"];
const PLANS = ["NOX-VERIFY-payPlan", "NOX-VERIFY-payPlan2"];

async function main() {
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
  const storeA1Id = sA1!.id as string;
  const orgAId = sA1!.org_id as string;
  const { data: sA2 } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  const storeA2Id = sA2!.id as string;
  const { data: mgr } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = mgr!.id as string;

  // ── teardown（名前ベース・両店横断・再実行冪等）──
  async function teardown() {
    const { data: cs } = await admin.from("casts").select("id").in("name", CAST_NAMES);
    const castIds = (cs ?? []).map((r) => r.id as string);
    const { data: runs } = await admin.from("payroll_runs").select("id").in("period", [P, P2]).in("store_id", [storeA1Id, storeA2Id]);
    const runIds = (runs ?? []).map((r) => r.id as string);
    if (runIds.length) {
      await admin.from("payslips").delete().in("run_id", runIds);
      await admin.from("payroll_runs").delete().in("id", runIds);
    }
    const { data: seats } = await admin.from("seats").select("id").in("name", SEATS);
    const seatIds = (seats ?? []).map((r) => r.id as string);
    if (seatIds.length) {
      const { data: chks } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const chkIds = (chks ?? []).map((r) => r.id as string);
      if (chkIds.length) {
        for (const t of ["check_cast_backs", "check_nominations", "check_lines"]) await admin.from(t).delete().in("check_id", chkIds);
        await admin.from("checks").delete().in("id", chkIds);
      }
    }
    if (castIds.length) {
      for (const t of ["punches", "shifts", "attendance", "cast_plan", "cast_tax_profiles", "cast_norms"]) {
        await admin.from(t).delete().in("cast_id", castIds);
      }
      await admin.from("casts").delete().in("id", castIds);
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    await admin.from("comp_plans").delete().in("name", PLANS);
    // #32 incentive（2026-11 隔離）
    await admin.from("attendance_incentives").delete().eq("store_id", storeA1Id).gte("biz_date", "2026-11-01").lte("biz_date", "2026-11-30");
  }
  await teardown();

  // ── seed ──────────────────────────────────────────────────────
  const mkCast = async (name: string, active: boolean, storeId = storeA1Id) => {
    const { data } = await admin.from("casts").insert({ org_id: orgAId, store_id: storeId, name, is_active: active }).select("id").single();
    return data!.id as string;
  };
  const mkSeat = async (name: string, storeId: string) => {
    const { data } = await admin.from("seats").insert({ org_id: orgAId, store_id: storeId, name, kind: "卓", sort_order: 0, is_active: true }).select("id").single();
    return data!.id as string;
  };
  const mkPlan = async (name: string, storeId: string) => {
    const { data } = await admin.from("comp_plans").insert({
      org_id: orgAId, store_id: storeId, name, base: 5000, hon_back: 4000, jonai_back: 1500, dohan_back: 4000, sales_slide: [], point_slide: [], is_active: true,
    }).select("id").single();
    return data!.id as string;
  };
  const mkCheck = async (storeId: string, seatId: string, startedAt: string, nomCast: string, lines: { kind: string; unit: number; qty: number }[]) => {
    const { data: c } = await admin.from("checks").insert({
      org_id: orgAId, store_id: storeId, seat_id: seatId, status: "closed",
      started_at: startedAt, closed_at: startedAt, nom_type: "hon", service_rate: 10, round_unit: 100, round_mode: "down", created_by: actorId,
    }).select("id").single();
    const checkId = c!.id as string;
    let sort = 0;
    for (const l of lines) {
      await admin.from("check_lines").insert({
        org_id: orgAId, store_id: storeId, check_id: checkId, kind: l.kind, pay_group: "A",
        name_snapshot: l.kind, unit_price_snapshot: l.unit, qty: l.qty, line_total: l.unit * l.qty, sort_order: sort++,
      });
    }
    await admin.from("check_nominations").insert({ org_id: orgAId, store_id: storeId, check_id: checkId, cast_id: nomCast, ratio_weight: 1, position: 0 });
    return checkId;
  };
  const mkPunchDay = async (cid: string, date: string, nextDay: string, storeId = storeA1Id) => {
    await admin.from("shifts").insert({ org_id: orgAId, store_id: storeId, cast_id: cid, date, start_hm: "20:00", end_hm: "25:00", status: "confirmed", created_by: actorId });
    await admin.from("punches").insert([
      { org_id: orgAId, store_id: storeId, cast_id: cid, punched_at: `${date}T20:00:00+09:00`, type: "in", source: "manager" },
      { org_id: orgAId, store_id: storeId, cast_id: cid, punched_at: `${nextDay}T01:00:00+09:00`, type: "out", source: "manager" },
    ]);
  };

  // store A1: P1（完備）・P2（退職）・P3（no_tax）・P4（no_plan）・pNo（稼働ゼロ）
  const p1 = await mkCast(CAST_NAMES[0], true);
  const p2 = await mkCast(CAST_NAMES[1], false);
  const p3 = await mkCast(CAST_NAMES[2], true);
  const p4 = await mkCast(CAST_NAMES[3], true);
  const pNo = await mkCast(CAST_NAMES[4], true);
  const seatId = await mkSeat(SEATS[0], storeA1Id);
  const planId = await mkPlan(PLANS[0], storeA1Id);
  for (const cid of [p1, p2, p3]) await admin.from("cast_plan").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, plan_id: planId, overrides_json: {} });
  // p4 は plan 無し（no_plan blocker）。p1/p2 のみ tax 登録（p3=no_tax）。
  for (const cid of [p1, p2]) await admin.from("cast_tax_profiles").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, mode: "委託" });
  await mkCheck(storeA1Id, seatId, "2026-09-10T22:00:00+09:00", p1, [{ kind: "set", unit: 10000, qty: 1 }, { kind: "champ", unit: 4000, qty: 2 }]);
  await mkCheck(storeA1Id, seatId, "2026-09-12T22:00:00+09:00", p2, [{ kind: "set", unit: 10000, qty: 1 }]);
  await mkPunchDay(p1, "2026-09-10", "2026-09-11");
  await mkPunchDay(p3, "2026-10-05", "2026-10-06"); // no_tax（P2 期間）
  await mkPunchDay(p4, "2026-10-06", "2026-10-07"); // no_plan（P2 期間・plan 無し）

  // store A2: owner×他店 確認用（castA2 完備・sales 11000）
  const a2 = await mkCast(CAST_NAMES[5], true, storeA2Id);
  const seat2 = await mkSeat(SEATS[1], storeA2Id);
  const plan2 = await mkPlan(PLANS[1], storeA2Id);
  await admin.from("cast_plan").insert({ org_id: orgAId, store_id: storeA2Id, cast_id: a2, plan_id: plan2, overrides_json: {} });
  await admin.from("cast_tax_profiles").insert({ org_id: orgAId, store_id: storeA2Id, cast_id: a2, mode: "委託" });
  await mkCheck(storeA2Id, seat2, "2026-09-14T22:00:00+09:00", a2, [{ kind: "set", unit: 10000, qty: 1 }]);

  // ── #32 出勤インセンティブ 係留用 seed（store A1・period 2026-11 隔離）──
  const i1 = await mkCast(CAST_NAMES[6], true);
  const i2 = await mkCast(CAST_NAMES[7], true);
  const i3 = await mkCast(CAST_NAMES[8], true);
  const i4 = await mkCast(CAST_NAMES[9], true);
  const i5 = await mkCast(CAST_NAMES[10], true);
  for (const cid of [i1, i2, i3, i4, i5]) {
    await admin.from("cast_plan").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, plan_id: planId, overrides_json: {} });
    await admin.from("cast_tax_profiles").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, mode: "委託" });
  }
  // 打刻: I1（11-10,11-20 ok）・I2（11-20 ok・11-10 は shift+absent＝受給対象外）・I3（11-20 ok）・I4（11-30 cutoff跨ぎ ok）
  await mkPunchDay(i1, "2026-11-10", "2026-11-11");
  await mkPunchDay(i1, "2026-11-20", "2026-11-21");
  await mkPunchDay(i2, "2026-11-20", "2026-11-21");
  await admin.from("shifts").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: i2, date: "2026-11-10", start_hm: "20:00", end_hm: "25:00", status: "confirmed", created_by: actorId });
  await admin.from("attendance").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: i2, date: "2026-11-10", status: "absent", source: "manager" });
  await mkPunchDay(i3, "2026-11-20", "2026-11-21");
  await mkPunchDay(i1, "2026-11-22", "2026-11-23"); // 日ごと独立按分の2日目（I1,I3 の2人）
  await mkPunchDay(i3, "2026-11-22", "2026-11-23");
  await mkPunchDay(i4, "2026-11-30", "2026-12-01"); // in 20:00 / out 翌01:00＝biz 11-30（cutoff 跨ぎ・確認2）
  await mkCheck(storeA1Id, seatId, "2026-11-12T22:00:00+09:00", i5, [{ kind: "set", unit: 10000, qty: 1 }]); // I5 sales-only（punch 無し）
  const mkInc = async (bizDate: string, mode: "per_head" | "pooled", amount: number) => {
    const { data } = await admin.from("attendance_incentives").insert({
      org_id: orgAId, store_id: storeA1Id, biz_date: bizDate, kind: "bonus", amount_mode: mode, amount, status: "published", created_by: actorId,
    }).select("id").single();
    return data!.id as string;
  };
  const inc10 = await mkInc("2026-11-10", "per_head", 3000);
  const inc12 = await mkInc("2026-11-12", "per_head", 5000);
  const inc20 = await mkInc("2026-11-20", "pooled", 1000);
  const inc22 = await mkInc("2026-11-22", "pooled", 1000); // 2人（I1,I3）→ 500/500（11-20 の3人按分と独立）
  const inc25 = await mkInc("2026-11-25", "pooled", 800);
  const inc30 = await mkInc("2026-11-30", "per_head", 2000);

  // ── 1 窓解決（period_bounds 単一ソース）──
  const win = await resolvePayrollWindow(admin, storeA1Id, P);
  check("F2c-2 窓解決: 2026-09 → [09-01, 09-30]", win.periodStart === "2026-09-01" && win.periodEnd === "2026-09-30", JSON.stringify(win));

  // ── 1/2 PayInput 組み立て＋champCnt ゴールデン（collect→buildPayInput）──
  const collected = await collectPeriod(admin, manager, storeA1Id, win);
  const rawP1 = collected.casts.find((c) => c.castId === p1);
  check("F2c-2 対象列挙: P1 が収集される", !!rawP1, "P1 raw 無し");
  if (rawP1) {
    check("F2c-2 cast.sales=19800（set10000+champ8000→×1.1→丸め100）", rawP1.sales === 19_800, `got ${rawP1.sales}`);
    check("F2c-2 cast.hon=1（伝票単位・hon 帰属）", rawP1.hon === 1, `got ${rawP1.hon}`);
    check("F2c-2 cast.days=1（punch final ok）", rawP1.days === 1, `got ${rawP1.days}`);
    check("F2c-2 champCnt ゴールデン=2（check_lines kind='champ' の qty）", rawP1.champCnt === 2, `got ${rawP1.champCnt}`);
    check("F2c-2 daily: 1日・hours=5・sales=19800", rawP1.daily.length === 1 && rawP1.daily[0].hours === 5 && rawP1.daily[0].sales === 19_800, JSON.stringify(rawP1.daily));
    check("F2c-2 taxProfileMode=委託（P1 登録済み）", rawP1.taxProfileMode === "委託", `got ${rawP1.taxProfileMode}`);
    const input = buildPayInput(rawP1, rawP1.taxProfileMode ?? "委託", collected.masters);
    check("F2c-2 PayInput: cast.sales/hon/days・metrics.champCnt=2・taxMode・plan.base=5000",
      input.cast.sales === 19_800 && input.cast.hon === 1 && input.cast.days === 1 &&
      input.metrics?.champCnt === 2 && input.taxMode === "委託" && input.plan.base === 5000 && input.plan.honBack === 4000,
      JSON.stringify({ c: input.cast, m: input.metrics, t: input.taxMode, b: input.plan.base }));
    check("F2c-2 PayInput: 天引き3種=0（F2c 暫定）", input.arDeduct === 0 && input.advanceDeduct === 0 && input.okuriDeduct === 0);
  }

  // ── 3 net 恒等（computeNet 単体）──
  {
    const anyPay = payOf(buildPayInput(rawP1!, "委託", collected.masters));
    check("F2c-2 computeNet: extras 空 ⇒ net===pay.net", computeNet(anyPay, []) === anyPay.net, `${computeNet(anyPay, [])} vs ${anyPay.net}`);
    check("F2c-2 computeNet: extras 加算（+100）", computeNet(anyPay, [{ kind: "x", amount: 100 }]) === anyPay.net + 100);
  }

  // ── 5 プレビューが書き込まない（前後で payroll_runs 件数不変）──
  const runCount = async () => {
    const { count } = await admin.from("payroll_runs").select("id", { count: "exact", head: true }).eq("store_id", storeA1Id);
    return count ?? 0;
  };
  const before = await runCount();
  const draft = await computePayrollDraft(admin, manager, storeA1Id, P, { previewDefaults: true });
  const after = await runCount();
  check("F2c-2 プレビューが書き込まない（payroll_runs 件数不変）", before === after, `${before}→${after}`);

  const rowP1 = draft.rows.find((r) => r.castId === p1);
  const rowP2 = draft.rows.find((r) => r.castId === p2);
  check("F2c-2 net 恒等（row.net===pay.net・extras 空）", !!rowP1 && rowP1.net === rowP1.pay.net, JSON.stringify({ net: rowP1?.net, p: rowP1?.pay.net }));
  check("F2c-2 退職 cast P2 が対象に入る（is_active=false でも稼働で計上）", !!rowP2, "P2 row 無し");
  check("F2c-2 稼働ゼロ除外: pNo は行に出ない", !draft.rows.find((r) => r.castId === pNo), "pNo が出た");
  check("F2c-2 P（完全期間）は blockers 無し", draft.blockers.length === 0, JSON.stringify(draft.blockers));

  // ── 6 退職者 cast の確定（run_create→finalize で P2 payslip 生成）──
  const { data: rc } = await manager.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: P });
  const runId = ((rc ?? [])[0] as { id: string }).id;
  const strict = await computePayrollDraft(admin, manager, storeA1Id, P, { previewDefaults: false });
  const payslips = strict.rows.map((r) => ({ cast_id: r.castId, net: r.net, breakdown: { pay: r.pay, extras: r.extras } }));
  const { data: cnt, error: eFin } = await admin.rpc("payroll_finalize", {
    p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: payslips,
  });
  check("F2c-2 finalize 成功（P1+P2 の2件）", !eFin && cnt === 2, eFin?.message ?? `got ${cnt}`);
  const { data: ps } = await admin.from("payslips").select("cast_id").eq("run_id", runId);
  check("F2c-2 退職者 P2 の payslip が生成される", (ps ?? []).some((r) => r.cast_id === p2), JSON.stringify(ps));

  // ── 8 確定拒否ガード（P2 期間: P3=no_tax・P4=no_plan の両方が cast 名つき blockers）──
  const draft10 = await computePayrollDraft(admin, manager, storeA1Id, P2, { previewDefaults: false });
  const blkP3 = draft10.blockers.find((b) => b.castId === p3 && b.reason === "no_tax");
  const blkP4 = draft10.blockers.find((b) => b.castId === p4 && b.reason === "no_plan");
  check("F2c-2 確定拒否ガード: 税区分未登録 P3 が blockers(no_tax)＋cast 名", !!blkP3 && blkP3.castName === CAST_NAMES[2], JSON.stringify(draft10.blockers));
  check("F2c-2 確定拒否ガード: プラン未設定 P4 が blockers(no_plan)＋cast 名（確認2）", !!blkP4 && blkP4.castName === CAST_NAMES[3], JSON.stringify(draft10.blockers));
  check("F2c-2 確定拒否ガード: strict で P3/P4 の行は作られない", !draft10.rows.find((r) => r.castId === p3 || r.castId === p4), JSON.stringify(draft10.rows.map((r) => r.castId)));
  const draft10p = await computePayrollDraft(admin, manager, storeA1Id, P2, { previewDefaults: true });
  check("F2c-2 プレビューは既定委託で試算（P3 行あり・taxMode 委託）＋blocker 警告",
    !!draft10p.rows.find((r) => r.castId === p3 && r.taxMode === "委託") && draft10p.blockers.some((b) => b.castId === p3),
    JSON.stringify({ rows: draft10p.rows.map((r) => r.castId), blk: draft10p.blockers.map((b) => b.reason) }));
  check("F2c-2 プレビューでも no_plan(P4) は行に出ない（計算不能）", !draft10p.rows.find((r) => r.castId === p4), "P4 行が出た");

  // ── 9 get_cast_sales store スコープ（確認1: owner×他店）──
  {
    // owner（auth_store_id=STORE_A1）が STORE_A2 の売上を引ける（owner 分岐＝org 全店）
    const { data: oSales, error: eO } = await owner.rpc("get_cast_sales", { p_store_id: storeA2Id, p_from: "2026-09-01", p_to: "2026-09-30" });
    const a2Row = ((oSales ?? []) as { cast_id: string; sales: number }[]).find((r) => r.cast_id === a2);
    check("F2c-2 確認1: owner が他店(A2)の get_cast_sales を引ける（sales=11000）", !eO && a2Row?.sales === 11_000, eO?.message ?? JSON.stringify(oSales));
    // manager（A1）は他店 A2 を引けない（自店のみ）
    const { error: eM } = await manager.rpc("get_cast_sales", { p_store_id: storeA2Id, p_from: "2026-09-01", p_to: "2026-09-30" });
    check("F2c-2 確認1: manager は他店(A2) get_cast_sales 拒否（自店のみ）", !!eM?.message?.includes("forbidden"), eM?.message ?? "通ってしまった");
    // owner が他店 A2 を確定ドラフト計算（owner クライアント経路で全 cast 行が出る）
    const draftA2 = await computePayrollDraft(admin, owner, storeA2Id, P, { previewDefaults: false });
    const rowA2 = draftA2.rows.find((r) => r.castId === a2);
    check("F2c-2 確認1: owner×他店 の確定ドラフトに castA2 行（net===pay.net・blocker 無し）",
      !!rowA2 && rowA2.net === rowA2.pay.net && draftA2.blockers.length === 0, JSON.stringify({ row: !!rowA2, blk: draftA2.blockers }));
  }

  // ══════════════════════════════════════════════════════════
  // #32 出勤インセンティブ extras 結線の係留（period 2026-11）
  // ══════════════════════════════════════════════════════════
  {
    type Ext = { kind: string; amount: number; source?: string };
    const dI = await computePayrollDraft(admin, manager, storeA1Id, "2026-11", { previewDefaults: false });
    const rowOf = (cid: string) => dI.rows.find((r) => r.castId === cid);
    const extOf = (cid: string, src: string) => (rowOf(cid)?.extras as Ext[] | undefined)?.find((e) => e.source === src);

    // per_head 配分ゴールデン（I1 に 11-10 の ¥3000・attendance_bonus）
    const ex10 = extOf(i1, inc10);
    check("F2c-3 per_head 配分ゴールデン: I1 に ¥3000（11-10・attendance_bonus）", ex10?.amount === 3000 && ex10?.kind === "attendance_bonus", JSON.stringify(rowOf(i1)?.extras));

    // pooled 最大剰余法ゴールデン（I1/I2/I3 の 11-20 ¥1000 → 334/333/333・+1 は cast_id 最小）
    const shares = [i1, i2, i3].map((cid) => ({ cid, part: extOf(cid, inc20)?.amount ?? -1 }));
    const byCid = [...shares].sort((a, b) => (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : 0));
    check("F2c-3 pooled Σ保存=1000", shares.reduce((s, x) => s + x.part, 0) === 1000, JSON.stringify(shares));
    check("F2c-3 pooled 最大剰余法: 334/333/333・端数 +1 は cast_id 最小",
      byCid[0].part === 334 && byCid[1].part === 333 && byCid[2].part === 333, JSON.stringify(byCid));

    // pooled 日ごと独立按分（確認）: I1 が 11-20（3人）と 11-22（2人）を各日の人数で独立に受給・期間で混ざらない
    const d20 = extOf(i1, inc20)?.amount ?? -1; // 3人按分＝333 or 334
    const d22 = extOf(i1, inc22)?.amount ?? -1; // 2人均等＝500
    check("F2c-3 pooled 日ごと独立: I1 の 11-22 は 2人均等=500", d22 === 500, `got ${d22}`);
    check("F2c-3 pooled 日ごと独立: I1 の 11-20 は 3人按分∈{333,334}・11-22(500) と別値", (d20 === 333 || d20 === 334) && d20 !== d22, `d20=${d20} d22=${d22}`);
    const sum20 = [i1, i2, i3].reduce((s, cid) => s + (extOf(cid, inc20)?.amount ?? 0), 0);
    const sum22 = [i1, i3].reduce((s, cid) => s + (extOf(cid, inc22)?.amount ?? 0), 0);
    check("F2c-3 pooled 日ごと独立: 11-20 の Σ=1000・11-22 の Σ=1000（各日独立・混ざらない）", sum20 === 1000 && sum22 === 1000, `${sum20}/${sum22}`);
    const i1Bonuses = ((rowOf(i1)?.extras as Ext[] | undefined) ?? []).filter((e) => e.kind === "attendance_bonus");
    check("F2c-3 pooled 独立: I1 は attendance_bonus 3行（11-10:3000＋11-20＋11-22）・net に合算",
      i1Bonuses.length === 3 && i1Bonuses.reduce((s, e) => s + e.amount, 0) === 3000 + d20 + 500, JSON.stringify(i1Bonuses));
    const i3d20 = extOf(i3, inc20)?.amount ?? -1;
    check("F2c-3 pooled 独立: I3 も 11-20∈{333,334} と 11-22=500 を各日独立按分",
      (i3d20 === 333 || i3d20 === 334) && extOf(i3, inc22)?.amount === 500, JSON.stringify({ d20: i3d20, d22: extOf(i3, inc22)?.amount }));

    // 受給者判定: I5 は sales-only（11-12）で受給なし／I2 は 11-10 absent で受給なし・11-20 は受給あり
    check("F2c-3 受給者判定: I5 は sales-only で受給なし（11-12 の inc 無し）", !extOf(i5, inc12), JSON.stringify(rowOf(i5)?.extras));
    check("F2c-3 受給者判定: I2 は 11-10 absent で受給なし・11-20 pooled は受給あり",
      !extOf(i2, inc10) && !!extOf(i2, inc20), JSON.stringify(rowOf(i2)?.extras));

    // extras 経由 net 恒等（非空 extras で net===pay.net+Σextras）
    const rI1 = rowOf(i1)!;
    check("F2c-3 extras 経由 net 恒等: I1 net===pay.net+Σextras（非空）",
      rI1.extras.length > 0 && rI1.net === rI1.pay.net + (rI1.extras as Ext[]).reduce((s, e) => s + e.amount, 0),
      JSON.stringify({ net: rI1.net, p: rI1.pay.net, ex: rI1.extras }));

    // 可視化: per_head 総配分=amount×N・受給者0 pooled は警告＋0配分
    const sum10 = dI.incentives.find((s) => s.id === inc10);
    check("F2c-3 可視化: per_head 総配分=amount×N（3000×1）・受給1人", sum10?.distributedTotal === 3000 && sum10?.recipientCount === 1, JSON.stringify(sum10));
    const sum25 = dI.incentives.find((s) => s.id === inc25);
    check("F2c-3 受給者0 の pooled は警告＋0配分（11-25）", sum25?.warnEmptyPool === true && sum25?.recipientCount === 0 && sum25?.distributedTotal === 0, JSON.stringify(sum25));

    // 確認2: cutoff 跨ぎ 11-30 が 2026-11 に入り 2026-12 に入らない
    check("F2c-3 確認2: cutoff 跨ぎ 11-30 incentive が 2026-11 に入る（I4 +2000）", extOf(i4, inc30)?.amount === 2000, JSON.stringify(rowOf(i4)?.extras));
    const dDec = await computePayrollDraft(admin, manager, storeA1Id, "2026-12", { previewDefaults: false });
    check("F2c-3 確認2: 11-30 incentive は 2026-12 に入らない", !dDec.incentives.find((s) => s.id === inc30), JSON.stringify(dDec.incentives.map((s) => s.id)));

    // Y: 再確定で extras 更新＋旧値 audit 退避
    const { data: rcI } = await manager.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: "2026-11" });
    const runIId = ((rcI ?? [])[0] as { id: string }).id;
    const psI = dI.rows.map((r) => ({ cast_id: r.castId, net: r.net, breakdown: { pay: r.pay, extras: r.extras } }));
    await admin.rpc("payroll_finalize", { p_org_id: orgAId, p_actor: actorId, p_run_id: runIId, p_idem_key: randomUUID(), p_payslips: psI });
    const { data: psI1 } = await admin.from("payslips").select("breakdown_json").eq("run_id", runIId).eq("cast_id", i1).single();
    const bj1 = (psI1?.breakdown_json as { extras?: Ext[] }).extras ?? [];
    check("F2c-3 finalize で extras 凍結（I1 に 3000）", bj1.some((e) => e.amount === 3000 && e.source === inc10), JSON.stringify(bj1));
    // inc10 を cancel → 11-10 ¥1000 再発行 → 再確定
    await admin.from("attendance_incentives").update({ status: "cancelled" }).eq("id", inc10);
    const inc10b = await mkInc("2026-11-10", "per_head", 1000);
    const dI2 = await computePayrollDraft(admin, manager, storeA1Id, "2026-11", { previewDefaults: false });
    const psI2 = dI2.rows.map((r) => ({ cast_id: r.castId, net: r.net, breakdown: { pay: r.pay, extras: r.extras } }));
    await admin.rpc("payroll_finalize", { p_org_id: orgAId, p_actor: actorId, p_run_id: runIId, p_idem_key: randomUUID(), p_payslips: psI2 });
    const { data: psI1b } = await admin.from("payslips").select("breakdown_json").eq("run_id", runIId).eq("cast_id", i1).single();
    const bj1b = (psI1b?.breakdown_json as { extras?: Ext[] }).extras ?? [];
    check("F2c-3 再確定で extras 更新（I1 が 1000 へ・旧 3000 は消える）",
      bj1b.some((e) => e.amount === 1000 && e.source === inc10b) && !bj1b.some((e) => e.source === inc10), JSON.stringify(bj1b));
    const { data: audI } = await admin.from("audit_logs").select("before_json")
      .eq("action", "payroll_finalize").eq("target", "payroll_runs:" + runIId).order("at", { ascending: false }).limit(1);
    const retiredI = (audI?.[0]?.before_json as { retired_payslips?: unknown[] })?.retired_payslips ?? [];
    check("F2c-3 再確定 Y: audit retired に旧 extras（3000）を退避", retiredI.length > 0 && JSON.stringify(retiredI).includes("3000"), JSON.stringify(retiredI).slice(0, 160));

    // paid 期間ガード: run を paid にして publish/cancel を拒否
    await admin.rpc("payroll_mark_paid", { p_org_id: orgAId, p_actor: actorId, p_run_id: runIId, p_idem_key: randomUUID() });
    const { error: ePaidPub } = await manager.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: "2026-11-05", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000 });
    check("F2c-3 paid 期間 publish 拒否（paid period）", !!ePaidPub?.message?.includes("paid period"), ePaidPub?.message ?? "通ってしまった");
    const { error: ePaidCan } = await manager.rpc("incentive_cancel", { p_incentive_id: inc20 });
    check("F2c-3 paid 期間 cancel 拒否（paid period）", !!ePaidCan?.message?.includes("paid period"), ePaidCan?.message ?? "通ってしまった");

    // 掃除（payroll_runs/payslips の 2026-11 分）
    await admin.from("payslips").delete().eq("run_id", runIId);
    await admin.from("payroll_runs").delete().eq("id", runIId);
  }

  // ── 4 権限拒否（decidePayrollAccess 純関数）──
  check("F2c-2 authz: owner=ok", decidePayrollAccess("owner", "s2", "s1") === "ok");
  check("F2c-2 authz: manager 自店=ok", decidePayrollAccess("manager", "s1", "s1") === "ok");
  check("F2c-2 authz: manager 他店=forbidden", decidePayrollAccess("manager", "s1", "s2") === "forbidden");
  check("F2c-2 authz: staff=forbidden", decidePayrollAccess("staff", "s1", "s1") === "forbidden");
  check("F2c-2 authz: cast=forbidden", decidePayrollAccess("cast", "s1", "s1") === "forbidden");
  check("F2c-2 authz: null role=forbidden", decidePayrollAccess(null, null, "s1") === "forbidden");

  await teardown();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-payroll ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
