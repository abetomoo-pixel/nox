/*
 * verify:nox-reopen — C層③ 解除型統一（mig0138〜0141・設計書 v1 §5・裁定 C③-1〜19）の係留。
 *   npm run verify:nox-reopen（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 観点（設計書 v1 §5・相談役ブロック 3a〜3g）:
 *  3a flag off: report_reopen／cash_diff_approve／check_merge／payroll_reopen が 'feature_disabled:reopen_flow'・
 *     関所は無評価＝締め済み日の伝票に check_add_line が通る
 *  3b flag on（org 既定 ON）: 締め済み日に check_add_line／check_pay／check_void が 'day closed'・prosrc の perform 行 16 逐語
 *     （check_open は v_seat.store_id 版＝0141）・締めのない日の check_open は通る（0141 live）・report_reopen 後は通る・
 *     reclose(p_idem_key) 後に再び拒否・同一 idem の reclose 冪等・未解除で reclose は 'not_reopened'
 *  3c report_reopen: reason_required（null／空／201 字）・already_reopened・staff can_reopen=false → forbidden →
 *     set_staff_perms 7 引数で true → 可 → 戻す
 *  3d cash_diff_approve: not_counted・no_diff・already_approved・reason_required・staff∧can_close
 *  3e check_merge: 拒否 6（同一 id／別店／status／money／cast／pay_group）各 1 回・成功時 line／nomination／seat 数保存・
 *     from が merged＋merged_into・主席が into の check_seats に入る（org_id／store_id あり）・check_recalc 後の total 一致・同一 idem 再呼で into
 *  3f 監査: report_reopen／cash_diff_approve／check_merge／payroll_reopen の action 逐語と reason 保存
 *  3g set_staff_perms 7 引数: 6 boolean 明示で通る・いずれか null で 'bad flag'
 *
 * fixture（すべて verify org A・finally で全消し・money 非接触＝golden 不変）:
 *   - 座席: NOX-VERIFY-RO卓1〜4（A1）・NOX-VERIFY-RO卓A2（A2）を admin insert
 *   - 締め済み日 D1／D2／D3（2026-03-05／06／07・rls suite が作る A1 の今日／明日の日報とは無関係）を daily_reports へ直接 insert
 *   - 伝票: 締め済み日 D1 の open 伝票（関所検証用）・締めのない日 E（2026-04-01）の open 伝票 F／I／X(closed)／A2 伝票（merge 用）を
 *     pg 直結で insert（started_at を過去日に固定＝biz_date_of で当該営業日に落ちる）。line／nomination／seat は RPC で付ける
 *   - reopen_flow の org 既定行は 3b 冒頭で insert・finally で delete（前半＝flag off の検証は行なしで行う）
 *   - staffA1 の 6 perms は開始時の値を読んで finally で set_staff_perms（manager）により復元
 *   - payroll_runs（period 2031-03・A1）は run_create→finalize で作り finally で delete
 *   - audit_logs は開始時刻以降・org A・本 suite が発火させる action のみ delete
 * 逆張り（手動・2026-09-10 実施）: live の assert_day_open を一時 no-op 化→ 3b の 'day closed' 3 本が赤 → 0138 本文で復元。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null | undefined, s: string) => !!e?.message?.includes(s);

const SEATS = ["NOX-VERIFY-RO卓1", "NOX-VERIFY-RO卓2", "NOX-VERIFY-RO卓3", "NOX-VERIFY-RO卓4", "NOX-VERIFY-RO卓A2"];
const D1 = "2026-03-05", D2 = "2026-03-06", D3 = "2026-03-07"; // 締め済み日（fixture）
const E = "2026-04-01";                                          // 締めのない日（merge 用）
const PERIOD = "2031-03";
const REASON = "NOX-VERIFY reopen";
const R201 = "a".repeat(201);
const ACTIONS = ["report_reopen", "cash_diff_approve", "check_merge", "payroll_reopen", "daily_report_reclose", "set_staff_perms",
  "check_add_line", "check_add_seat", "check_set_nominations", "check_open", "check_void", "check_pay", "payroll_finalize", "payroll_run_create"];
const PERFORM_CHK = "perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));";
const PERFORM_OPEN = "perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));";

async function main() {
  const t0 = new Date().toISOString();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const staff = await signIn("staffA1");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

  const { data: sA1 } = await admin.from("stores").select("id, org_id, service_rate, round_unit, round_mode, card_tax_rate").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  const storeA1 = sA1!.id as string, storeA2 = sA2!.id as string, orgA = sA1!.org_id as string;
  const { data: uM } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const mgrUserId = uM!.id as string;
  const { data: mStaff } = await admin.from("memberships").select("id, can_register, can_crm, can_shift, can_view_backs, can_close, can_reopen")
    .eq("store_id", storeA1).eq("role", "staff").eq("user_id", (await admin.from("users").select("id").eq("email", FIXTURE_USERS.staffA1.email).single()).data!.id).single();
  const staffMem = mStaff!.id as string;
  const staffPerms0 = { p_can_register: mStaff!.can_register, p_can_crm: mStaff!.can_crm, p_can_shift: mStaff!.can_shift,
    p_can_view_backs: mStaff!.can_view_backs, p_can_close: mStaff!.can_close, p_can_reopen: mStaff!.can_reopen } as Record<string, boolean>;
  const { data: casts } = await admin.from("casts").select("id, name").eq("store_id", storeA1).eq("is_active", true).order("name");
  const castA = casts![0].id as string, castB = casts![1].id as string;

  const seatIds: string[] = [];
  const checkIds: string[] = [];
  let runId: string | null = null;

  async function teardown() {
    // 伝票（fixture id 精密削除・lines/noms/seats/payments は CASCADE でない表があるため先に消す）
    if (checkIds.length) {
      await admin.from("payments").delete().in("check_id", checkIds);
      await admin.from("check_nominations").delete().in("check_id", checkIds);
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("check_seats").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
    }
    await admin.from("daily_reports").delete().eq("store_id", storeA1).in("biz_date", [D1, D2, D3]);
    await admin.from("feature_flags").delete().eq("org_id", orgA).eq("key", "reopen_flow");
    if (runId) {
      await admin.from("payment_records").delete().eq("run_id", runId);
      await admin.from("payslips").delete().eq("run_id", runId);
      await admin.from("payroll_runs").delete().eq("id", runId);
    }
    const { data: oldRuns } = await admin.from("payroll_runs").select("id").eq("store_id", storeA1).eq("period", PERIOD);
    for (const r of oldRuns ?? []) {
      await admin.from("payslips").delete().eq("run_id", r.id);
      await admin.from("payroll_runs").delete().eq("id", r.id);
    }
    const { data: seats } = await admin.from("seats").select("id").in("name", SEATS);
    const ids = (seats ?? []).map((r) => r.id as string);
    if (ids.length) {
      await admin.from("check_seats").delete().in("seat_id", ids);
      await admin.from("checks").delete().in("seat_id", ids);
      await admin.from("seats").delete().in("id", ids);
    }
    await db.query(`delete from public.audit_logs where org_id = $1 and at >= $2 and action = any($3)`, [orgA, t0, ACTIONS]);
  }
  async function restoreStaffPerms() {
    const { error } = await mgr.rpc("set_staff_perms", { p_membership_id: staffMem, ...staffPerms0 });
    if (error) console.error(`[reopen teardown] set_staff_perms 復元: ${error.message}`);
  }
  await teardown();

  // ── fixture ──
  const mkSeat = async (store: string, name: string) => {
    const { data, error } = await admin.from("seats").insert({ org_id: orgA, store_id: store, name, is_active: true }).select("id").single();
    if (error) throw new Error("seat insert: " + error.message);
    seatIds.push(data!.id as string);
    return data!.id as string;
  };
  const mkCheck = async (store: string, seat: string, startedJst: string, status = "open") => {
    const r = await q<{ id: string }>(
      `insert into public.checks (org_id, store_id, seat_id, started_at, status, service_rate, round_unit, round_mode, created_by, closed_at)
       values ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9, case when $5 = 'closed' then $4::timestamptz + interval '1 hour' end) returning id`,
      [orgA, store, seat, startedJst, status, sA1!.service_rate, sA1!.round_unit, sA1!.round_mode, mgrUserId]);
    checkIds.push(r[0].id);
    return r[0].id;
  };
  const mkReport = async (biz: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from("daily_reports").insert({
      org_id: orgA, store_id: storeA1, biz_date: biz, biz_cutoff_hm: "06:00", card_tax_rate: sA1!.card_tax_rate, closed_by: mgrUserId, ...extra,
    }).select("id").single();
    if (error) throw new Error("daily_reports insert: " + error.message);
    return data!.id as string;
  };
  const report = async (biz: string) => (await admin.from("daily_reports").select("*").eq("store_id", storeA1).eq("biz_date", biz).single()).data as Record<string, unknown>;
  const addLine = (c: typeof mgr, id: string, price = 100, group = "A") =>
    c.rpc("check_add_line", { p_check_id: id, p_product_id: null, p_qty: 1, p_kind: "custom", p_pay_group: group, p_name: "NOX-VERIFY-RO", p_unit_price: price });

  const sD = await mkSeat(storeA1, SEATS[0]);   // 締め済み日 D1 の伝票の主席
  const sF = await mkSeat(storeA1, SEATS[1]);   // merge from の主席
  const sF2 = await mkSeat(storeA1, SEATS[2]);  // merge from の追加席
  const sI = await mkSeat(storeA1, SEATS[3]);   // merge into の主席
  const sA2seat = await mkSeat(storeA2, SEATS[4]);
  const repD1 = await mkReport(D1);
  await mkReport(D2);
  await mkReport(D3);
  const chkD = await mkCheck(storeA1, sD, `${D1}T22:00:00+09:00`);
  const chkF = await mkCheck(storeA1, sF, `${E}T22:00:00+09:00`);
  const chkI = await mkCheck(storeA1, sI, `${E}T22:10:00+09:00`);
  const chkX = await mkCheck(storeA1, sF2, `${E}T20:00:00+09:00`, "closed"); // status 拒否用（sF2 は後で add_seat に使う＝closed は占有しない）
  const chkA2 = await mkCheck(storeA2, sA2seat, `${E}T22:00:00+09:00`);
  {
    const bd = await q<{ d: string }>(`select public.biz_date_of($1, $2::timestamptz)::text as d`, [storeA1, `${D1}T22:00:00+09:00`]);
    check("ro(fx) 準備: 締め済み日 D1 の伝票の biz_date_of = D1（cutoff 06:00）", bd[0].d === D1, bd[0].d);
    const fl = await q<{ n: number }>(`select count(*)::int as n from public.feature_flags where org_id = $1 and key = 'reopen_flow'`, [orgA]);
    check("ro(fx) 準備: reopen_flow の行なし（flag off）", fl[0].n === 0, `got ${fl[0].n}`);
  }

  try {
    // ══ 3a flag off ══
    {
      const r1 = await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D1, p_reason: REASON });
      check("ro(3a-1) ★flag off: report_reopen は feature_disabled:reopen_flow", has(r1.error, "feature_disabled:reopen_flow"), r1.error?.message ?? "通ってしまった");
      const r2 = await mgr.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON });
      check("ro(3a-2) ★flag off: cash_diff_approve は feature_disabled:reopen_flow", has(r2.error, "feature_disabled:reopen_flow"), r2.error?.message ?? "通ってしまった");
      const r3 = await mgr.rpc("check_merge", { p_from_check_id: chkF, p_into_check_id: chkI, p_reason: REASON, p_idem_key: randomUUID() });
      check("ro(3a-3) ★flag off: check_merge は feature_disabled:reopen_flow", has(r3.error, "feature_disabled:reopen_flow"), r3.error?.message ?? "通ってしまった");
      // payroll_reopen（service 経路）: run_create→finalize で finalized run を作る
      const { data: rc, error: eRc } = await mgr.rpc("payroll_run_create", { p_store_id: storeA1, p_period: PERIOD });
      runId = ((rc ?? [])[0] as { id: string } | undefined)?.id ?? null;
      const ps = [{ cast_id: castA, net: 0, breakdown: { pay: { net: 0 }, extras: [] }, ar_deducted: [], ar_carried: [], adv_deducted: [], adv_carried: [], okuri_deducted: [] }];
      const { error: eFin } = await admin.rpc("payroll_finalize", { p_org_id: orgA, p_actor: mgrUserId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: ps });
      check("ro(3a-4) 準備: payroll run 2031-03 を finalize", !eRc && !!runId && !eFin, eRc?.message ?? eFin?.message);
      const r4 = await admin.rpc("payroll_reopen", { p_org_id: orgA, p_actor: mgrUserId, p_run_id: runId, p_idem_key: randomUUID(), p_reason: REASON });
      check("ro(3a-5) ★flag off: payroll_reopen（service）は feature_disabled:reopen_flow", has(r4.error, "feature_disabled:reopen_flow"), r4.error?.message ?? "通ってしまった");
      // 関所は無評価＝締め済み日 D1 の open 伝票に check_add_line が通る
      const { data: lid, error: eL } = await addLine(mgr, chkD);
      check("ro(3a-6) ★flag off: 締め済み日 D1 の伝票へ check_add_line が通る（関所無評価）", !eL && typeof lid === "string", eL?.message);
    }

    // ══ 3b flag on ══
    {
      const { error: eFlag } = await admin.from("feature_flags").insert({ org_id: orgA, store_id: null, key: "reopen_flow", enabled: true });
      check("ro(3b-0) fixture: reopen_flow を org 既定 ON", !eFlag, eFlag?.message);
      const eAdd = (await addLine(mgr, chkD)).error;
      check("ro(3b-1) ★締め済み日の check_add_line は day closed", has(eAdd, "day closed"), eAdd?.message ?? "通ってしまった");
      const ePay = (await mgr.rpc("check_pay", { p_check_id: chkD, p_method: "cash", p_amount: 100, p_pay_group: "A", p_tendered: null, p_idem_key: randomUUID(), p_method_detail: null })).error;
      check("ro(3b-2) ★締め済み日の check_pay は day closed", has(ePay, "day closed"), ePay?.message ?? "通ってしまった");
      const eVoid = (await mgr.rpc("check_void", { p_check_id: chkD, p_reason: "NOX-VERIFY" })).error;
      check("ro(3b-3) ★締め済み日の check_void は day closed", has(eVoid, "day closed"), eVoid?.message ?? "通ってしまった");
      // prosrc の perform 行 16 逐語（CR は除いて比較）
      const rows = await q<{ proname: string; src: string }>(
        `select proname, replace(prosrc, chr(13), '') as src from pg_proc where pronamespace = 'public'::regnamespace and proname like 'check\\_%' and prosrc like '%assert_day_open(%' order by proname`);
      const chk15 = rows.filter((r) => r.proname !== "check_open" && r.src.split(PERFORM_CHK).length === 2).map((r) => r.proname);
      const open = rows.find((r) => r.proname === "check_open");
      check("ro(3b-4) ★prosrc: v_chk 版の perform 行がちょうど 1 本ずつ入る関数 = 15", chk15.length === 15 && rows.length === 16, `got ${chk15.length}/${rows.length}: ${chk15.join(",")}`);
      check("ro(3b-5) ★prosrc: check_open は v_seat.store_id 版が 1 本・v_store なし（0141）",
        !!open && open.src.split(PERFORM_OPEN).length === 2 && !open.src.includes("v_store"), open ? "v_seat 版でない" : "check_open に perform なし");
      const callers = await q<{ n: number }>(`select count(*)::int as n from pg_proc where pronamespace='public'::regnamespace and proname <> 'assert_day_open' and prosrc like '%assert_day_open%'`);
      check("ro(3b-6) prosrc: assert_day_open の呼出関数 = 16", callers[0].n === 16, `got ${callers[0].n}`);
      // 締めのない日（A2・今日）の check_open は flag on でも通る＝0141 の live 実走
      const { data: cOpen, error: eOpen } = await owner.rpc("check_open", { p_seat_id: sA2seat, p_people: 1, p_nom_type: "free" });
      if (typeof cOpen === "string") checkIds.push(cOpen);
      check("ro(3b-7) ★flag on: 締めのない日の check_open が通る（0141＝v_seat.store_id で関所評価）", !eOpen && typeof cOpen === "string", eOpen?.message);
      // report_reopen → 通る → reclose → 再び拒否 → 冪等 → not_reopened
      const { data: rid, error: eRo } = await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D1, p_reason: REASON });
      check("ro(3b-8) ★report_reopen（manager 自店）が通り日報 id を返す", !eRo && rid === repD1, eRo?.message ?? String(rid));
      const rp1 = await report(D1);
      check("ro(3b-9) 解除中＝reopened_at 非 null・reopen_reason 保存・reclosed_at null", !!rp1.reopened_at && rp1.reopen_reason === REASON && rp1.reclosed_at === null, JSON.stringify({ r: rp1.reopened_at, c: rp1.reclosed_at }));
      const eDup = (await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D1, p_reason: REASON })).error;
      check("ro(3c-4) 解除中の report_reopen は already_reopened", has(eDup, "already_reopened"), eDup?.message ?? "通ってしまった");
      const { error: eL2 } = await addLine(mgr, chkD);
      check("ro(3b-10) ★解除後は締め済み日の check_add_line が通る", !eL2, eL2?.message);
      const K = randomUUID();
      const { data: rc1, error: eRc1 } = await mgr.rpc("daily_report_reclose", { p_report_id: repD1, p_force: true, p_idem_key: K });
      check("ro(3b-11) ★daily_report_reclose(p_idem_key・p_force) が通る", !eRc1 && rc1 === repD1, eRc1?.message ?? String(rc1));
      const rp2 = await report(D1);
      check("ro(3b-12) 再締め＝reclosed_at 非 null・reclose_idem_key 保存・reclosed_count 1", !!rp2.reclosed_at && rp2.reclose_idem_key === K && rp2.reclosed_count === 1, JSON.stringify({ c: rp2.reclosed_at, k: rp2.reclose_idem_key, n: rp2.reclosed_count }));
      const eL3 = (await addLine(mgr, chkD)).error;
      check("ro(3b-13) ★再締め後は再び day closed", has(eL3, "day closed"), eL3?.message ?? "通ってしまった");
      const { data: rc2, error: eRc2 } = await mgr.rpc("daily_report_reclose", { p_report_id: repD1, p_force: true, p_idem_key: K });
      const rp3 = await report(D1);
      check("ro(3b-14) 同一 idem の reclose は冪等（id 返却・reclosed_count 不変）", !eRc2 && rc2 === repD1 && rp3.reclosed_count === 1, eRc2?.message ?? JSON.stringify(rp3.reclosed_count));
      const eNR = (await mgr.rpc("daily_report_reclose", { p_report_id: repD1, p_force: true, p_idem_key: randomUUID() })).error;
      check("ro(3b-15) 未解除（再締め済み）で別 idem の reclose は not_reopened", has(eNR, "not_reopened"), eNR?.message ?? "通ってしまった");
    }

    // ══ 3c report_reopen: reason／staff can_reopen ══
    {
      const e1 = (await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D3, p_reason: null })).error;
      const e2 = (await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D3, p_reason: "   " })).error;
      const e3 = (await mgr.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D3, p_reason: R201 })).error;
      check("ro(3c-1) reason null は reason_required", has(e1, "reason_required"), e1?.message ?? "通ってしまった");
      check("ro(3c-2) reason 空白のみは reason_required", has(e2, "reason_required"), e2?.message ?? "通ってしまった");
      check("ro(3c-3) reason 201 字は reason_required", has(e3, "reason_required"), e3?.message ?? "通ってしまった");
      const eS = (await staff.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D3, p_reason: REASON })).error;
      check("ro(3c-5) ★staff（can_reopen=false）の report_reopen は forbidden", has(eS, "forbidden"), eS?.message ?? "通ってしまった");
      const { error: eP } = await mgr.rpc("set_staff_perms", { p_membership_id: staffMem, ...staffPerms0, p_can_reopen: true });
      check("ro(3c-6) manager の set_staff_perms 7 引数で can_reopen=true", !eP, eP?.message);
      const { data: rid3, error: eS2 } = await staff.rpc("report_reopen", { p_store_id: storeA1, p_biz_date: D3, p_reason: REASON });
      check("ro(3c-7) ★staff∧can_reopen の report_reopen が通る", !eS2 && typeof rid3 === "string", eS2?.message);
      await restoreStaffPerms();
      const { data: m } = await admin.from("memberships").select("can_close, can_reopen").eq("id", staffMem).single();
      check("ro(3c-8) perms 復元（can_close／can_reopen 元値）", m!.can_close === staffPerms0.p_can_close && m!.can_reopen === staffPerms0.p_can_reopen, JSON.stringify(m));
    }

    // ══ 3d cash_diff_approve ══
    {
      const e1 = (await mgr.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON })).error;
      check("ro(3d-1) counted_cash null は not_counted", has(e1, "not_counted"), e1?.message ?? "通ってしまった");
      await admin.from("daily_reports").update({ counted_cash: 1000, diff: 0 }).eq("store_id", storeA1).eq("biz_date", D2);
      const e2 = (await mgr.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON })).error;
      check("ro(3d-2) diff 0 は no_diff", has(e2, "no_diff"), e2?.message ?? "通ってしまった");
      await admin.from("daily_reports").update({ diff: 500 }).eq("store_id", storeA1).eq("biz_date", D2);
      const e3 = (await mgr.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: null })).error;
      check("ro(3d-3) reason null は reason_required", has(e3, "reason_required"), e3?.message ?? "通ってしまった");
      const { data: aid, error: e4 } = await mgr.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON });
      const rp = await report(D2);
      check("ro(3d-4) ★manager の承認が通り diff_reason／diff_approved_by／at が入る", !e4 && typeof aid === "string" && rp.diff_reason === REASON && !!rp.diff_approved_by && !!rp.diff_approved_at, e4?.message ?? JSON.stringify(rp.diff_reason));
      const e5 = (await mgr.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON })).error;
      check("ro(3d-5) 承認済みは already_approved", has(e5, "already_approved"), e5?.message ?? "通ってしまった");
      await admin.from("daily_reports").update({ diff_reason: null, diff_approved_by: null, diff_approved_at: null }).eq("store_id", storeA1).eq("biz_date", D2);
      const eS = (await staff.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON })).error;
      check("ro(3d-6) ★staff（can_close=false）は forbidden", has(eS, "forbidden"), eS?.message ?? "通ってしまった");
      await mgr.rpc("set_staff_perms", { p_membership_id: staffMem, ...staffPerms0, p_can_close: true });
      const { error: eS2 } = await staff.rpc("cash_diff_approve", { p_store_id: storeA1, p_biz_date: D2, p_reason: REASON });
      check("ro(3d-7) ★staff∧can_close の承認が通る", !eS2, eS2?.message);
      await restoreStaffPerms();
    }

    // ══ 3e check_merge ══
    {
      const merge = (from: string, into: string, k = randomUUID()) => mgr.rpc("check_merge", { p_from_check_id: from, p_into_check_id: into, p_reason: REASON, p_idem_key: k });
      // 準備: F に line 1・nomination A・追加席 sF2／I に line 1・nomination A（cast 衝突用）
      const { error: eL1 } = await addLine(mgr, chkF, 100);
      const { error: eL2 } = await addLine(mgr, chkI, 200);
      const nom = (c: string, cast: string) => mgr.rpc("check_set_nominations", { p_check_id: c, p_nominations: [{ cast_id: cast, weight: 1, nom_kind: "free", is_dohan: false, ended: false }] });
      const { error: eN1 } = await nom(chkF, castA);
      const { error: eN2 } = await nom(chkI, castA);
      const { error: eSeat } = await mgr.rpc("check_add_seat", { p_check_id: chkF, p_seat_id: sF2 });
      check("ro(3e-0) 準備: F/I に line・nomination・F に追加席（締めのない日 E は flag on でも通る）", !eL1 && !eL2 && !eN1 && !eN2 && !eSeat,
        [eL1, eL2, eN1, eN2, eSeat].map((e) => e?.message).filter(Boolean).join(" / "));
      const e1 = (await merge(chkF, chkF)).error;
      check("ro(3e-1) 拒否: 同一 id は forbidden", has(e1, "forbidden"), e1?.message ?? "通ってしまった");
      const e2 = (await merge(chkF, chkA2)).error;
      check("ro(3e-2) 拒否: 別店は forbidden", has(e2, "forbidden"), e2?.message ?? "通ってしまった");
      const e3 = (await merge(chkF, chkX)).error;
      check("ro(3e-3) 拒否: into が closed は merge_conflict:status", has(e3, "merge_conflict:status"), e3?.message ?? "通ってしまった");
      const { data: pay } = await admin.from("payments").insert({ org_id: orgA, store_id: storeA1, check_id: chkI, method: "cash", amount: 100, by_user_id: mgrUserId }).select("id").single();
      const e4 = (await merge(chkF, chkI)).error;
      check("ro(3e-4) 拒否: into に payment は merge_conflict:money", has(e4, "merge_conflict:money"), e4?.message ?? "通ってしまった");
      await admin.from("payments").delete().eq("id", pay!.id);
      const e5 = (await merge(chkF, chkI)).error;
      check("ro(3e-5) 拒否: 同一 cast の nomination は merge_conflict:cast", has(e5, "merge_conflict:cast"), e5?.message ?? "通ってしまった");
      await nom(chkI, castB);
      const { data: lB } = await addLine(mgr, chkF, 300, "B");
      const e6 = (await merge(chkF, chkI)).error;
      check("ro(3e-6) 拒否: pay_group B の line は merge_conflict:pay_group", has(e6, "merge_conflict:pay_group"), e6?.message ?? "通ってしまった");
      await admin.from("check_lines").delete().eq("id", lB);
      // 成功
      const cnt = async (t: string, c: string) => (await admin.from(t).select("id", { count: "exact", head: true }).eq("check_id", c)).count ?? -1;
      const before = { fl: await cnt("check_lines", chkF), fn: await cnt("check_nominations", chkF), fs: await cnt("check_seats", chkF), il: await cnt("check_lines", chkI), in: await cnt("check_nominations", chkI), is: await cnt("check_seats", chkI) };
      const K = randomUUID();
      const { data: mid, error: eM } = await merge(chkF, chkI, K);
      check("ro(3e-7) ★check_merge 成功＝into id を返す", !eM && mid === chkI, eM?.message ?? String(mid));
      const after = { il: await cnt("check_lines", chkI), in: await cnt("check_nominations", chkI), is: await cnt("check_seats", chkI), fl: await cnt("check_lines", chkF), fs: await cnt("check_seats", chkF) };
      check("ro(3e-8) ★line／nomination／seat が into へ移り数が保存される（from は 0）",
        after.il === before.il + before.fl && after.in === before.in + before.fn && after.is === before.is + before.fs + 1 && after.fl === 0 && after.fs === 0,
        JSON.stringify({ before, after }));
      const { data: fRow } = await admin.from("checks").select("status, merged_into, merge_idem_key").eq("id", chkF).single();
      check("ro(3e-9) ★from は status merged・merged_into=into・merge_idem_key 保存", fRow!.status === "merged" && fRow!.merged_into === chkI && fRow!.merge_idem_key === K, JSON.stringify(fRow));
      const seatRow = await q<{ org_id: string; store_id: string }>(`select org_id, store_id from public.check_seats where check_id = $1 and seat_id = $2`, [chkI, sF]);
      check("ro(3e-10) ★from の主席 sF が into の check_seats に入る（org_id／store_id あり＝0139）", seatRow.length === 1 && seatRow[0].org_id === orgA && seatRow[0].store_id === storeA1, JSON.stringify(seatRow));
      const t1 = (await admin.from("checks").select("total").eq("id", chkI).single()).data!.total as number;
      await db.query(`select public.check_recalc($1)`, [chkI]);
      const t2 = (await admin.from("checks").select("total").eq("id", chkI).single()).data!.total as number;
      const lineSum = (await q<{ s: number }>(`select coalesce(sum(line_total), 0)::int as s from public.check_lines where check_id = $1`, [chkI]))[0].s;
      check("ro(3e-11) ★into の total は check_recalc 済み（再 recalc で不変・line 合計 300 を含む）", t1 === t2 && lineSum === 300 && t1 >= lineSum, JSON.stringify({ t1, t2, lineSum }));
      const { data: mid2, error: eM2 } = await merge(chkF, chkI, K);
      check("ro(3e-12) 同一 idem の再呼は into を返す（冪等）", !eM2 && mid2 === chkI, eM2?.message ?? String(mid2));
      const eM3 = (await merge(chkF, chkI)).error;
      check("ro(3e-13) 別 idem の再呼は merge_conflict:status（from は merged）", has(eM3, "merge_conflict:status"), eM3?.message ?? "通ってしまった");
    }

    // ══ 3f 監査（action 逐語・reason 保存）＋ payroll_reopen（flag on）══
    {
      const e0 = (await admin.rpc("payroll_reopen", { p_org_id: orgA, p_actor: mgrUserId, p_run_id: runId, p_idem_key: randomUUID(), p_reason: null })).error;
      check("ro(3f-0) payroll_reopen reason null は reason_required", has(e0, "reason_required"), e0?.message ?? "通ってしまった");
      const { data: pr, error: ePr } = await admin.rpc("payroll_reopen", { p_org_id: orgA, p_actor: mgrUserId, p_run_id: runId, p_idem_key: randomUUID(), p_reason: REASON });
      check("ro(3f-1) ★flag on: payroll_reopen → 'reopened'", !ePr && pr === "reopened", ePr?.message ?? String(pr));
      const rows = await q<{ action: string; target: string; reason: string | null }>(
        `select action, target, reason from public.audit_logs where org_id = $1 and at >= $2 and action in ('report_reopen','cash_diff_approve','check_merge','payroll_reopen') order by at`, [orgA, t0]);
      const of = (a: string) => rows.filter((r) => r.action === a);
      check("ro(3f-2) ★audit report_reopen: 2 行（manager D1・staff D3）・target daily_reports:・reason 保存",
        of("report_reopen").length === 2 && of("report_reopen").every((r) => r.target.startsWith("daily_reports:") && r.reason === REASON), JSON.stringify(of("report_reopen")));
      check("ro(3f-3) ★audit cash_diff_approve: 2 行（manager・staff）・reason 保存",
        of("cash_diff_approve").length === 2 && of("cash_diff_approve").every((r) => r.target.startsWith("daily_reports:") && r.reason === REASON), JSON.stringify(of("cash_diff_approve")));
      check("ro(3f-4) ★audit check_merge: 1 行・target checks:<into>・reason 保存",
        of("check_merge").length === 1 && of("check_merge")[0].target === `checks:${chkI}` && of("check_merge")[0].reason === REASON, JSON.stringify(of("check_merge")));
      check("ro(3f-5) ★audit payroll_reopen: 1 行・target payroll_runs:<run>・reason 保存",
        of("payroll_reopen").length === 1 && of("payroll_reopen")[0].target === `payroll_runs:${runId}` && of("payroll_reopen")[0].reason === REASON, JSON.stringify(of("payroll_reopen")));
      const mj = await q<{ a: Record<string, unknown> }>(`select after_json as a from public.audit_logs where org_id = $1 and at >= $2 and action = 'check_merge'`, [orgA, t0]);
      check("ro(3f-6) audit check_merge の after_json に moved_lines 1／moved_nominations 1／moved_seats 1",
        mj.length === 1 && mj[0].a.moved_lines === 1 && mj[0].a.moved_nominations === 1 && mj[0].a.moved_seats === 1, JSON.stringify(mj[0]?.a));
    }

    // ══ 3g set_staff_perms 7 引数 ══
    {
      const { error: eOk } = await mgr.rpc("set_staff_perms", { p_membership_id: staffMem, ...staffPerms0 });
      check("ro(3g-1) 6 boolean 明示の set_staff_perms 7 引数が通る", !eOk, eOk?.message);
      const eNull = (await mgr.rpc("set_staff_perms", { p_membership_id: staffMem, ...staffPerms0, p_can_close: null })).error;
      check("ro(3g-2) ★p_can_close null は bad flag（規約7）", has(eNull, "bad flag"), eNull?.message ?? "通ってしまった");
      const eNull2 = (await mgr.rpc("set_staff_perms", { p_membership_id: staffMem, ...staffPerms0, p_can_reopen: null })).error;
      check("ro(3g-3) ★p_can_reopen null は bad flag", has(eNull2, "bad flag"), eNull2?.message ?? "通ってしまった");
      const pn = await q<{ pronargs: number }>(`select pronargs from pg_proc where pronamespace='public'::regnamespace and proname = 'set_staff_perms'`);
      check("ro(3g-4) set_staff_perms は 7 引数 1 本のみ（旧 5 引数 DROP 済み＝#63）", pn.length === 1 && pn[0].pronargs === 7, JSON.stringify(pn));
    }
  } finally {
    await restoreStaffPerms();
    await teardown();
  }
  {
    const left = await q<{ n: number }>(`select (select count(*) from public.seats where name = any($1)) + (select count(*) from public.daily_reports where store_id = $2 and biz_date = any($3::date[]))
      + (select count(*) from public.feature_flags where org_id = $4 and key = 'reopen_flow') + (select count(*) from public.payroll_runs where store_id = $2 and period = $5) as n`,
      [SEATS, storeA1, [D1, D2, D3], orgA, PERIOD]);
    check("ro(掃除) seats／daily_reports／flag／payroll_run が 0 件", Number(left[0].n) === 0, `left ${left[0].n}`);
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-reopen ALL PASS (${pass} assertions)`);
  console.log("解除型統一(0138〜0141): flag off 4 RPC 拒否+関所無評価 / flag on 関所 3 本+prosrc 16 逐語+0141 実走 / reopen→reclose 冪等 / reason 必須 / staff perms / cash_diff / merge 6 拒否+成功 / 監査 4 action / set_staff_perms 7 引数");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
