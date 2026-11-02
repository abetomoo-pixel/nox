/*
 * verify:nox-0192c — 0192（便 M5 の DB 側＋公開デモ cron の監査・2026-11-02 起草＝手貼り待ち）の client を MIG_0192_APPLIED の配下で先に入れた分の純関数と配線。
 *  (1) フラグ＝MIG_0192_APPLIED=true（2026-11-02 手貼り＝フラグ便）・mig0192On は override 可
 *  (2) ★1 スタッフ勤怠＝staffHmToIso（0〜47 域・翌暦日・形の不正は null）・staffDayRowsOf の区分（遅刻／当欠／早退・当欠は打刻が無くても行）
 *  (3) 配線＝★1／M-38 staff-work-panel・M-38 attendance-board・M-39 kiosk-pin-panel・M-49 store-profile-panel・M-34 availability-editor・★9 cron route＝どれも mig0192On() の配下
 *  (4) ★9 cron route＝demo_reset_mark_failed（service_role 専用 RPC）・audit_log_write_service を直に呼ばない・1 店でも失敗は HTTP 500
 *  使い方: npm run verify:nox-0192c（env 不要・DB 不触）
 */
import fs from "node:fs";
import { MIG_0192_APPLIED, mig0192On, __set0192ForTest } from "../lib/nox/rules-0175/flag";
import { STAFF_DAY_STATUS_LABEL, isStaffDayStatus, staffDayRowsOf, staffHmToIso } from "../lib/nox/staff/kintai";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── (1) フラグ ──
check("0192c(1-1) MIG_0192_APPLIED=true（2026-11-02 手貼り・verify 全行一致）・mig0192On は既定で true", MIG_0192_APPLIED === true && mig0192On() === true);
__set0192ForTest(true); const on = mig0192On(); __set0192ForTest(null);
check("0192c(1-2) override で true・解除で既定に戻る", on === true && mig0192On() === MIG_0192_APPLIED);

// ── (2) ★1 純関数 ──
check("0192c(2-1) staffHmToIso: 19:00＝当日 10:00Z・25:30＝翌暦日 01:30 JST・47:59 は可・48:00／19:60／形違いは null",
  staffHmToIso("2026-11-02", "19:00") === "2026-11-02T10:00:00.000Z" && staffHmToIso("2026-11-02", "25:30") === "2026-11-02T16:30:00.000Z"
  && staffHmToIso("2026-11-02", "47:59") !== null && staffHmToIso("2026-11-02", "48:00") === null && staffHmToIso("2026-11-02", "19:60") === null && staffHmToIso("2026-11-02", "7pm") === null);
const punches = [
  { membership_id: "m", biz_date: "2026-11-01", kind: "in", punched_at: "2026-11-01T10:00:00.000Z" },
  { membership_id: "m", biz_date: "2026-11-01", kind: "out", punched_at: "2026-11-01T16:00:00.000Z" },
] as Parameters<typeof staffDayRowsOf>[0];
const rows = staffDayRowsOf(punches, "2026-11-05", { "2026-11-01": "late", "2026-11-03": "absent" });
check("0192c(2-2) staffDayRowsOf: 区分を反映（11/01 遅刻）・当欠だけの日（11/03）も行を出す・区分なしの第 3 引数省略は従来どおり（late／absent／early すべて false）",
  rows.length === 2 && rows[0].late && !rows[0].absent && rows[1].bizDate === "2026-11-03" && rows[1].absent && rows[1].inHm === null
  && staffDayRowsOf(punches, "2026-11-05").every((r) => !r.late && !r.absent && !r.early), rows.map((r) => [r.bizDate, r.late, r.absent]));
check("0192c(2-3) 区分 4 つ（出勤／当欠／遅刻／早退）＝DB の CHECK と同じ集合・isStaffDayStatus", Object.keys(STAFF_DAY_STATUS_LABEL).join(",") === "present,absent,late,early" && isStaffDayStatus("absent") && !isStaffDayStatus("off"));

// ── (3) 配線（フラグの配下） ──
const swp = src("app/(manage)/staff/staff-work-panel.tsx");
check("0192c(3-1) ★1／M-38 スタッフ: staff_attendance_set（p_punches は明示の boolean＝原則7）／staff_attendance_confirm／staff_punch_cancel_out・att＝mig0192On() && scope store",
  swp.includes(`const att = mig0192On() && scope === "store";`) && swp.includes(`supabase.rpc("staff_attendance_set"`) && swp.includes("p_punches: dayEdit.punches === true") && swp.includes(`supabase.rpc("staff_attendance_confirm"`) && swp.includes("p_lock: lock === true") && swp.includes(`supabase.rpc("staff_punch_cancel_out"`)
  && swp.includes(`if (mig0192On() && scope === "store") {`));
const ab = src("app/(manage)/payroll/attendance-board.tsx");
check("0192c(3-2) M-38 キャスト: 給与 › 勤怠に「今日の退勤を取り消す」＝punch_cancel_out・mig0192On() && todayOut", ab.includes(`rpc("punch_cancel_out", { p_cast_id: sel.castId })`) && ab.includes("{mig0192On() && todayOut && <button"));
const pin = src("app/(manage)/master/kiosk-pin-panel.tsx");
check("0192c(3-3) M-39 PIN の解除: staff_pin_unlock／cast_pin_unlock・スタッフの行は mig0192On() && locked・キャストの行は cast_pin_status（0192 配下）の行だけ", pin.includes(`rpc("staff_pin_unlock", { p_membership_id: id })`) && pin.includes(`rpc("cast_pin_unlock", { p_cast_id: id })`) && pin.includes(`{mig0192On() && locked && <button`) && pin.includes(`if (!mig0192On()) { setCastRows(null); return; }`));
const spp = src("app/(manage)/master/store-profile-panel.tsx");
check("0192c(3-4) M-49 店設定: kiosk_person_idle_minutes は mig0192On() のときだけ patch に載せる・欄も mig0192On() の配下・既定は kioskPersonIdleMinutesOf（10）",
  spp.includes("if (mig0192On() && form.kiosk_person_idle !== cur.kiosk_person_idle) out.kiosk_person_idle_minutes = Number(form.kiosk_person_idle);") && spp.includes(`{mig0192On() && (/* ★0192 M-49`) && spp.includes("kiosk_person_idle: String(kioskPersonIdleMinutesOf(sj))"));
const av = src("components/nox/availability-editor.tsx");
check("0192c(3-5) M-34 基本の働き方: 未発行＝!membershipId && mig0192On() && !bySelf のときだけ availability_set_cast（cast_id）・通知しない・発行済みは従来の availability_set",
  av.includes("const noAccount = !membershipId && mig0192On() && !bySelf;") && av.includes(`rpc("availability_set_cast", { p_cast_id: castId, ...availPatchOf(form) })`) && av.includes(`rpc("availability_set", { p_membership_id: membershipId, ...availPatchOf(form) })`) && av.includes("if (!membershipId) { setMsg("));

// ── (4) ★9 cron route ──
const cron = src("app/api/cron/demo-reset/route.ts");
check("0192c(4-1) cron の失敗の監査＝demo_reset_mark_failed（0192 未適用は console だけ）・audit_log_write_service を rpc で呼ばない",
  cron.includes(`admin.rpc("demo_reset_mark_failed", { p_org_id: orgId, p_reason: reason.slice(0, 200) })`) && cron.includes("if (!mig0192On()) {") && !cron.includes(`rpc("audit_log_write_service"`));
check("0192c(4-2) 1 店でも失敗したら ok:false＋HTTP 500（pg_net の job 結果が failed）", cron.includes("const ok = results.every((r) => r.ok);") && cron.includes("{ status: ok ? 200 : 500 }"));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-0192c ALL PASS (${pass} assertions)`);
console.log("0192 の client（MIG_0192_APPLIED 配下）: スタッフ勤怠の修正・確定／退勤の取消／PIN の解除／kiosk_person_idle_minutes／未発行キャストの基本の働き方／cron の失敗の監査（service 専用 RPC・1 店でも失敗は 500）");
