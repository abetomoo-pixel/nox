/*
 * verify:nox-0194c — 0194（2026-11-04 Agoora 手貼り・verify 19 行一致）のフラグ true 便の client（裁定444 ④⑤・裁定445 ①②③④・裁定446）。
 *  (1) MIG_0194_APPLIED=true・override／(2) 店長に開く＝mark-paid route（manager 自店）・update-email（decideEmailAccess・自店の staff だけ）・kiosk/provision route（manager 自店＝GET の絞り・発行は自店・reissue は自店）・
 *  master/system の端末・レシートのタブ／(3) 確定額の凍結＝staffLaborRowOf（時給＝timePay＋fixed＝gross・RPC の再計算と同じ式）・staff-work-panel が確定時に p_labor を送り確定後は凍結額・月報は staff_labor_confirmed／
 *  (4) キオスクの在庫タイル＝READY・包み・KioskInventoryView（kiosk_stock_levels）／(5) live（関数 410・表 116・staff_attendance_confirm 4 引数・staff_labor_confirmed 17 列）
 *  使い方: npm run verify:nox-0194c（(5) だけ .env.local・DB は読取）
 */
import fs from "node:fs";
import pg from "pg";
import { MIG_0194_APPLIED, mig0194On, __set0194ForTest } from "../lib/nox/rules-0175/flag";
import { decideEmailAccess, decideEmailTarget, decideOwnerAccess } from "../lib/nox/staff/update-email";
import { markPaidEnabled } from "../lib/nox/payroll/list";
import { KIOSK_FEATURE_READY } from "../lib/nox/rules-0175/kiosk";
import { staffLaborRowOf, STAFF_LABOR_CALC_VERSION } from "../lib/nox/staff/labor";
import { staffPayOf } from "../lib/nox/staff/pay";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1)
check("0194c(1-1) MIG_0194_APPLIED=true（2026-11-04 手貼り・verify 19 行一致）・override", (MIG_0194_APPLIED as boolean) === true && mig0194On() === true && (__set0194ForTest(false), !mig0194On()) && (__set0194ForTest(null), mig0194On()));
// (2) 店長に開く
check("0194c(2-1) ④ 給与の支払済み化＝markPaidEnabled は 0194 後は manager も（finalized だけ）・フラグ false は従来・route は mig0194On() && manager を通す（guardPayroll＝自店）",
  markPaidEnabled("manager", "finalized") && !markPaidEnabled("manager", "draft") && !markPaidEnabled("staff", "finalized") && (__set0194ForTest(false), !markPaidEnabled("manager", "finalized")) && (__set0194ForTest(null), true)
  && src("app/api/payroll/mark-paid/route.ts").includes('if (g.role !== "owner" && !(mig0194On() && g.role === "manager")) return NextResponse.json({ error: "forbidden" }, { status: 403 });'));
check("0194c(2-2) ⑤ スタッフのメール変更＝decideEmailAccess（manager は 0194 後だけ）・decideEmailTarget の actor（店長は自店の staff だけ＝店長・他店は 403）・decideOwnerAccess は不変・route が actor を渡す",
  decideEmailAccess("manager", "org", true).ok && !decideEmailAccess("manager", "org", false).ok && decideEmailAccess("owner", "org", false).ok && !decideEmailAccess("staff", "org", true).ok && !decideOwnerAccess("manager", "org").ok
  && decideEmailTarget({ found: true, sameOrg: true, role: "staff", storeId: "s1" }, { role: "manager", storeId: "s1" }).ok
  && !decideEmailTarget({ found: true, sameOrg: true, role: "staff", storeId: "s2" }, { role: "manager", storeId: "s1" }).ok
  && !decideEmailTarget({ found: true, sameOrg: true, role: "manager", storeId: "s1" }, { role: "manager", storeId: "s1" }).ok
  && decideEmailTarget({ found: true, sameOrg: true, role: "manager", storeId: "s9" }, { role: "owner", storeId: null }).ok
  && src("app/api/staff/update-email/route.ts").includes("decideEmailAccess(role, orgId, mig0194On())") && src("app/api/staff/update-email/route.ts").includes("actor: g.actor") && src("lib/nox/staff/update-email.ts").includes('.select("role, store_id")'));
const prov = src("app/api/kiosk/provision/route.ts"), sys = src("app/(manage)/master/system/page.tsx");
check("0194c(2-3) ① 端末の発行・削除＝provision route は 0194 後に manager（自店）を通す・GET は自店の端末だけ・発行は自店だけ（auth user を作る前に止める）・reissue は自店の端末だけ",
  prov.includes('const isManager = mig0194On() && role === "manager" && !!storeId;') && prov.includes("managerStoreId: isManager ? (storeId as string) : null") && prov.includes("(r.data ?? []).filter((d) => d.store_id === g.managerStoreId)")
  && prov.includes("if (g.managerStoreId && storeId !== g.managerStoreId) return NextResponse.json({ error: \"forbidden\" }, { status: 403 });") && prov.split("dev.store_id !== g.managerStoreId").length === 2 /* reissue（RPC を通らない）だけ・reactivate／deactivate／delete は RPC が自店を照合 */);
check("0194c(2-4) ①② master/system＝端末・レシートのタブを店長にも（isOwner0194・店長は自店の 1 店だけ・台数も自店）・InvoiceProfileFields（発行者）は管理者のまま",
  sys.includes('const isOwner0194 = (role: string | null | undefined): boolean => role === "owner" || (mig0194On() && role === "manager");') && sys.includes("const canDevices = isOwner0194(role);") && sys.includes("if (canDevices) {") && sys.includes("if (canDevices && storeId) {")
  && sys.includes("(isOwner ? (allStores ?? []) : (allStores ?? []).filter((s2) => s2.id === storeId))") && sys.includes('.eq("org_id", orgId).eq("store_id", storeId ?? "")') && src("app/(manage)/master/printer-panel.tsx").includes("<InvoiceProfileFields storeId={storeId} isOwner={isOwner} />"));
// (3) 確定額の凍結
const c = { membership_id: "m", contract_kind: "parttime" as const, hourly: 1300, fixed_allowance: 0, tax_class: null, pay_kind: "hourly" };
const pay = staffPayOf(c, [{ bizDate: "2026-11-01", minutes: 301, open: false }, { bizDate: "2026-11-02", minutes: 300, open: false }]);
const row = staffLaborRowOf("m", c, pay);
check("0194c(3-1) ① staffLaborRowOf＝時給 1,300×601 分＝time_pay 13,021（floorYen＝RPC の down と同じ）・amount＝time_pay＋fixed＝gross・days 2・calc_version", pay.timePay === 13021 && row.time_pay === 13021 && row.amount === pay.gross && row.amount === 13021 && row.minutes === 601 && row.days === 2 && row.pay_kind === "hourly" && row.hourly === 1300 && row.calc_version === STAFF_LABOR_CALC_VERSION, row);
const payM = staffPayOf({ ...c, contract_kind: "employee", hourly: 0, fixed_allowance: 300000 }, [{ bizDate: "2026-11-01", minutes: 480, open: false }]);
const rowM = staffLaborRowOf("m", { pay_kind: "monthly", hourly: 0, fixed_allowance: 300000, monthly: 300000 }, payM);
check("0194c(3-2) 月給の行＝pay_kind monthly・amount＝gross（RPC は再計算しない）・hourly 0", rowM.pay_kind === "monthly" && rowM.amount === payM.gross && rowM.hourly === 0 && rowM.monthly === 300000, rowM);
const swp = src("app/(manage)/staff/staff-work-panel.tsx");
check("0194c(3-3) ② staff-work-panel＝確定のときだけ店の全員分の p_labor を同じ RPC で送る（解除は従来）・labor mismatch の文言・確定後は凍結額（staff_labor_confirmed）を支給見込みの列に「確定額」",
  swp.includes("const p_labor = mig0194On() && lock ? rows.filter((x) => x.m.store_id === r.m.store_id && x.contract && x.pay).map((x) => staffLaborRowOf(x.m.id, x.contract!, x.pay!)) : null;")
  && swp.includes('supabase.rpc("staff_attendance_confirm", { p_store_id: r.m.store_id, p_period: month, p_lock: lock === true, ...(p_labor ? { p_labor } : {}) })') && swp.includes('error.message.includes("labor mismatch")')
  && swp.includes('supabase.from("staff_labor_confirmed").select("membership_id, amount, time_pay").eq("period", month)') && swp.includes("data-staff-frozen={r.m.id}"));
check("0194c(3-4) ④ 月報＝確定済みの月は staff_labor_confirmed の合計（再計算しない）・凍結の行が無ければ見込みの式", src("app/(manage)/report/month-report.tsx").includes('supabase.from("staff_labor_confirmed").select("amount").eq("store_id", storeId).eq("period", period)') && src("app/(manage)/report/month-report.tsx").includes("if (mig0194On() && sl.confirmed) {"));
// (4) 在庫タイル
check("0194c(4-1) ③ 在庫タイル＝READY.inventory（★裁定469（M-128・2026-11-09）: 本店の /master/stock を PIN → 本人セッションで・/kiosk-inventory は /kiosk へ redirect・在庫の読取 view は削除）", KIOSK_FEATURE_READY.inventory === true && fs.readFileSync("app/kiosk-inventory/page.tsx", "utf8").includes('redirect("/kiosk");') && !fs.existsSync("components/nox/kiosk-views.tsx"));
// (5) live（読取）＝async の本体（tsx の cjs 出力は top-level await 不可）
async function main(): Promise<void> {
  let dbUrl = process.env.SUPABASE_DB_URL; if (!dbUrl) { try { process.loadEnvFile(".env.local"); } catch { /* no env */ } dbUrl = process.env.SUPABASE_DB_URL; }
  if (dbUrl) {
    const pc = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await pc.connect();
    try {
      const r = (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm' and pronargs=4) a4,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm' and pronargs=3) a3,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='staff_labor_confirmed') cols,
        (select count(*)::int from pg_constraint where conname='memberships_role_check' and pg_get_constraintdef(oid) not like '%admin%') chk,
        (select has_function_privilege('anon', 'public.kiosk_stock_levels()', 'execute')) anon_k`)).rows[0];
      check("0194c(5-1) live＝関数 410・表 116・staff_attendance_confirm は 4 引数だけ・staff_labor_confirmed 17 列・memberships_role_check に admin なし・kiosk_stock_levels は anon 不可", r.f === 442 /* ★0201g（作り直し 4・手貼りの後）: 440→442 */ /* ★0201c／h／e（2026-11-12）: 431→440 */ /* ★0201（2026-11-11 手貼り・+4＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set）: 427→431 */ /* ★0200（2026-11-10 手貼り・+6−1＝notice_create_targets 6 引数／staff_labor_mark_paid／unmark_paid／auth_register_access／auth_cast_check_allowed／kiosk_person_active_of／kiosk_person_touch・set_store_cast_register drop）: 422→427 */ /* ★0198（2026-11-09 手貼り・+3＝cast_loan_grant／cast_loan_repay／cast_day_applied_of）: 419→422 */ && r.t === 121 /* ★0200: 表 120→121＝staff_labor_payments */ /* ★0197（2026-11-06・+1＝register_day_grant_set・作り直し 2 本は ±0）: 418→419 */ /* 表 119→120＝register_day_grants */ /* ★0196（2026-11-06・+2＝kiosk_person_claim／kiosk_person_end・作り直し 9 本は ±0）: 416→418 */  /* ★0195（2026-11-05・+6＝cast_day_deductions_set／deduction_rule_cast_set／deduction_rule_casts_get／line_link_block／line_link_remove／staff_allowances_set・set_deduction は 10 引数に作り直し±0・staff_attendance_confirm ±0）: 410→416 */ && r.a4 === 1 && r.a3 === 0 && r.cols === 18 /* ★0200 後も 18 列（0194c 当時は 17＋allowances） */ /* ★0195: +allowances */ && r.chk === 1 && r.anon_k === false, r);
    } finally { await pc.end(); }
  } else console.log("(5) skipped: SUPABASE_DB_URL なし");
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0194c ALL PASS (${pass} assertions)`);
}
void main();
