/*
 * verify:nox-payroll — 給与確定サーバ TS（F2c-2）の DB 直・HTTP 無し係留。
 *   npm run verify:nox-payroll（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * route は薄いラッパなので core/pure を直接 import して係留（seed は本節内で admin 投入・NOX-VERIFY-pay* 命名・
 * 未来の空 period 2026-09/2026-10 に隔離・再実行冪等・dev 専用の建付け維持）。
 *
 * 係留（plan §7 の7項目＋確定拒否ガード）:
 *  1 PayInput 組み立ての正しさ（窓・cast.sales/hon・daily.hours・taxMode）
 *  2 champCnt ゴールデン（check_lines kind から集計・既知会計→champCnt=2）
 *  3 net 恒等（extras 空 ⇒ row.net===pay.net・computeNet 単体）
 *  4 権限拒否（decidePayrollAccess 純関数）
 *  5 プレビューが書き込まない（computePayrollDraft 前後で payroll_runs 件数不変）
 *  6 退職者 cast の確定（is_active=false でも対象列挙→finalize で payslip 生成）
 *  7 稼働ゼロ除外（売上も打刻も無い cast は行に出ない）
 *  8 確定拒否ガード（税区分未登録 cast 混在→blockers に no_tax・確定は route が 422）
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
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

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const manager = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: eSignIn } = await manager.auth.signInWithPassword({
    email: FIXTURE_USERS.managerA1.email,
    password: env.SEED_PASSWORD,
  });
  if (eSignIn) {
    console.error(`✗ managerA1 サインイン失敗（seed:f0 実行済みか確認）: ${eSignIn.message}`);
    process.exit(1);
  }

  const { data: store } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1Id = store!.id as string;
  const orgAId = store!.org_id as string;
  const { data: mgr } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = mgr!.id as string;

  const P = "2026-09"; // 完全期間（P1 完備＋P2 退職）
  const P2 = "2026-10"; // 税区分未登録（P3）
  const NAMES = ["NOX-VERIFY-payP1", "NOX-VERIFY-payP2", "NOX-VERIFY-payP3", "NOX-VERIFY-payNo"];
  const SEAT = "NOX-VERIFY-paySeat";
  const PLAN = "NOX-VERIFY-payPlan";

  // ── teardown（再実行冪等・start と end で呼ぶ）──
  async function teardown() {
    const { data: cs } = await admin.from("casts").select("id").eq("store_id", storeA1Id).in("name", NAMES);
    const castIds = (cs ?? []).map((r) => r.id as string);
    const { data: runs } = await admin.from("payroll_runs").select("id").eq("store_id", storeA1Id).in("period", [P, P2]);
    const runIds = (runs ?? []).map((r) => r.id as string);
    if (runIds.length) {
      await admin.from("payslips").delete().in("run_id", runIds);
      await admin.from("payroll_runs").delete().in("id", runIds);
    }
    const { data: seat } = await admin.from("seats").select("id").eq("store_id", storeA1Id).eq("name", SEAT);
    const seatId = seat?.[0]?.id as string | undefined;
    if (seatId) {
      const { data: chks } = await admin.from("checks").select("id").eq("seat_id", seatId);
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
    if (seatId) await admin.from("seats").delete().eq("id", seatId);
    await admin.from("comp_plans").delete().eq("store_id", storeA1Id).eq("name", PLAN);
  }
  await teardown();

  // ── seed ──────────────────────────────────────────────────────
  const mkCast = async (name: string, active: boolean) => {
    const { data } = await admin.from("casts").insert({ org_id: orgAId, store_id: storeA1Id, name, is_active: active }).select("id").single();
    return data!.id as string;
  };
  const p1 = await mkCast(NAMES[0], true);
  const p2 = await mkCast(NAMES[1], false); // 退職
  const p3 = await mkCast(NAMES[2], true);
  const pNo = await mkCast(NAMES[3], true); // 稼働ゼロ
  const { data: seatRow } = await admin.from("seats").insert({ org_id: orgAId, store_id: storeA1Id, name: SEAT, kind: "卓", sort_order: 0, is_active: true }).select("id").single();
  const seatId = seatRow!.id as string;
  const { data: planRow } = await admin.from("comp_plans").insert({
    org_id: orgAId, store_id: storeA1Id, name: PLAN, base: 5000, hon_back: 4000, jonai_back: 1500, dohan_back: 4000,
    sales_slide: [], point_slide: [], is_active: true,
  }).select("id").single();
  const planId = planRow!.id as string;
  // cast_plan: P1/P2/P3 に割当（P3 は plan あり・tax 無し＝no_tax blocker）
  for (const cid of [p1, p2, p3]) {
    await admin.from("cast_plan").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, plan_id: planId, overrides_json: {} });
  }
  // tax: P1/P2 のみ登録（P3 未登録）
  for (const cid of [p1, p2]) {
    await admin.from("cast_tax_profiles").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, mode: "委託" });
  }

  // 会計: P1 の champ 伝票（set10000＋champ4000×2）single nominee → sales=19800・champCnt=2
  const mkCheck = async (startedAt: string, nomCast: string, lines: { kind: string; unit: number; qty: number }[]) => {
    const { data: c } = await admin.from("checks").insert({
      org_id: orgAId, store_id: storeA1Id, seat_id: seatId, status: "closed",
      started_at: startedAt, closed_at: startedAt, nom_type: "hon", service_rate: 10, round_unit: 100, round_mode: "down", created_by: actorId,
    }).select("id").single();
    const checkId = c!.id as string;
    let sort = 0;
    for (const l of lines) {
      await admin.from("check_lines").insert({
        org_id: orgAId, store_id: storeA1Id, check_id: checkId, kind: l.kind, pay_group: "A",
        name_snapshot: l.kind, unit_price_snapshot: l.unit, qty: l.qty, line_total: l.unit * l.qty, sort_order: sort++,
      });
    }
    await admin.from("check_nominations").insert({ org_id: orgAId, store_id: storeA1Id, check_id: checkId, cast_id: nomCast, ratio_weight: 1, position: 0 });
    return checkId;
  };
  await mkCheck("2026-09-10T22:00:00+09:00", p1, [{ kind: "set", unit: 10000, qty: 1 }, { kind: "champ", unit: 4000, qty: 2 }]);
  await mkCheck("2026-09-12T22:00:00+09:00", p2, [{ kind: "set", unit: 10000, qty: 1 }]); // P2 退職・sales=11000

  // 打刻: P1（2026-09-10 shift 20:00-25:00・in 20:00 out 翌01:00＝hours5・ok）
  const mkPunchDay = async (cid: string, date: string, nextDay: string) => {
    await admin.from("shifts").insert({ org_id: orgAId, store_id: storeA1Id, cast_id: cid, date, start_hm: "20:00", end_hm: "25:00", status: "confirmed", created_by: actorId });
    await admin.from("punches").insert([
      { org_id: orgAId, store_id: storeA1Id, cast_id: cid, punched_at: `${date}T20:00:00+09:00`, type: "in", source: "manager" },
      { org_id: orgAId, store_id: storeA1Id, cast_id: cid, punched_at: `${nextDay}T01:00:00+09:00`, type: "out", source: "manager" },
    ]);
  };
  await mkPunchDay(p1, "2026-09-10", "2026-09-11");
  // P3（2026-10-05 打刻のみ・tax 無し）
  await mkPunchDay(p3, "2026-10-05", "2026-10-06");

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
    // buildPayInput の写像
    const input = buildPayInput(rawP1, rawP1.taxProfileMode ?? "委託", collected.masters);
    check("F2c-2 PayInput: cast.sales/hon/days・metrics.champCnt=2・taxMode・plan.base=5000",
      input.cast.sales === 19_800 && input.cast.hon === 1 && input.cast.days === 1 &&
      input.metrics?.champCnt === 2 && input.taxMode === "委託" && input.plan.base === 5000 && input.plan.honBack === 4000,
      JSON.stringify({ c: input.cast, m: input.metrics, t: input.taxMode, b: input.plan.base }));
    check("F2c-2 PayInput: 天引き3種=0（F2c 暫定）", input.arDeduct === 0 && input.advanceDeduct === 0 && input.okuriDeduct === 0);
  }

  // ── 3 net 恒等（computeNet 単体＋computePayrollDraft の row）──
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

  // draft の row: P1/P2 が計算され net===pay.net・稼働ゼロ pNo は不在
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

  // ── 8 確定拒否ガード（P2 期間＝P3 tax 未登録 → blockers no_tax）──
  const draft10 = await computePayrollDraft(admin, manager, storeA1Id, P2, { previewDefaults: false });
  const blkP3 = draft10.blockers.find((b) => b.castId === p3 && b.reason === "no_tax");
  check("F2c-2 確定拒否ガード: 税区分未登録 P3 が blockers(no_tax)（route は 422）", !!blkP3, JSON.stringify(draft10.blockers));
  check("F2c-2 確定拒否ガード: strict で P3 の行は作られない（税区分必須）", !draft10.rows.find((r) => r.castId === p3), "P3 行が出た");
  const draft10p = await computePayrollDraft(admin, manager, storeA1Id, P2, { previewDefaults: true });
  check("F2c-2 プレビューは既定委託で試算＋blocker 警告（P3 行あり・blocker も返る）",
    !!draft10p.rows.find((r) => r.castId === p3 && r.taxMode === "委託") && draft10p.blockers.some((b) => b.castId === p3),
    JSON.stringify({ rows: draft10p.rows.map((r) => r.castId), blk: draft10p.blockers }));

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
