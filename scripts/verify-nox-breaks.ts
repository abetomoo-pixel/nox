// verify:nox-breaks（★0214 起票158 の 2 休憩の打刻・相談役 11/25 の D5・版 2＝F4）— 純関数と配線の照合＋DB は旗 MIG_0214_APPLIED が true のときだけ（BEGIN … ROLLBACK）。DB の動き（順序・柵・PIN・直し）の全部は docs/tmp/break_1125/v2/try-0214.mts。
//   (1) ボタンの出し分け（端末＝名前を押した時の状態・/mine）＝出勤中は「休憩」「退勤」・休憩中は「休憩終了」だけ・使わない店は「休憩」を出さない・読めないときは今のまま
//   (2) スタッフの時間（中抜けの対ごとに休憩を引く・丸め）・旗 false（dayAdj なし）は今の式
//   (3) 店の直し（行の止め・ISO）・要対応の 1 行・断りの和文
//   (4) 配線（端末・/mine・店舗設定・勤怠の表の直し・給与の要対応・写す鍵・デモの名簿）
//   (5) ★版 2 DB（旗 true のときだけ・NOX_SKIP_DB=1 で飛ばす）：前の営業日の閉じ忘れの休憩がある人（キャストとスタッフ）が今日の出勤 → 休憩 → 休憩終了 → 退勤を通せる
import fs from "node:fs";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { pgTx } from "./fixtures-pgtx";
import { dayAdjOfSource } from "../lib/nox/punch/day-adj-load";
import { dayWindowOf } from "../lib/nox/punch/day-window";
import { kioskBreakButtonsOf, kioskButtonsShownOf, mineBreakButtonsOf, minePunchStateOf, punchButtonsOf } from "../lib/nox/shift/punch-state";
import { staffHoursOf, staffOpenBreakDatesOf } from "../lib/nox/staff/pay";
import { breakEditErrOf, breakSetRowsOf, breakEditRowsOf } from "../lib/nox/punch/break-edit";
import { openBreakSummaryOf } from "../lib/nox/payroll/view";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";
import { STORE_SETTING_KEYS } from "../lib/nox/ops/store-copy-keys";
import * as flag from "../lib/nox/rules-0175/flag";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail)}`); };
const J = (x: unknown) => JSON.stringify(x);

// ── (1) ボタン ──
const K = (state: "none" | "on" | "break" | "done", breakEnabled: boolean, staff = false) => kioskBreakButtonsOf({ state, breakEnabled }, { staff });
ok("(1-1) 端末：未出勤＝出勤だけ", J(K("none", true)) === J({ in: true, out: false, breakStart: false, breakEnd: false }));
ok("(1-2) 端末：出勤中＝休憩と退勤（使う店）・退勤だけ（使わない店）", J(K("on", true)) === J({ in: false, out: true, breakStart: true, breakEnd: false }) && J(K("on", false)) === J({ in: false, out: true, breakStart: false, breakEnd: false }));
ok("(1-3) 端末：休憩中＝休憩終了だけ（OFF にした後も終了は出す）", J(K("break", true)) === J({ in: false, out: false, breakStart: false, breakEnd: true }) && J(K("break", false)) === J(K("break", true)));
ok("(1-4) 端末：退勤の後＝キャストは何も出さない（1 営業日に 1 回）・スタッフは出勤し直せる", J(K("done", true)) === J({ in: false, out: false, breakStart: false, breakEnd: false }) && K("done", true, true).in === true);
ok("(1-5) 端末：状態が読めない（旗 false）＝今の出し分け（キャストは両方・スタッフは今日の打刻）", J(kioskBreakButtonsOf(null, { staff: false })) === J({ ...kioskButtonsShownOf(null, false), breakStart: false, breakEnd: false }) && J(kioskBreakButtonsOf(null, { staff: true, lastKind: "in" })) === J({ in: false, out: true, breakStart: false, breakEnd: false }));
ok("(1-6) /mine：出勤中で閉じていない休憩＝break・それ以外は今の状態", minePunchStateOf("open", true) === "break" && minePunchStateOf("open", false) === "open" && minePunchStateOf("closed", true) === "closed");
ok("(1-7) /mine：休憩中＝休憩終了だけ（退勤・送りも押せない）・出勤中＝今のボタン＋休憩（使う店）", J(mineBreakButtonsOf("break", true)) === J({ inEnabled: false, outEnabled: false, okuriEnabled: false, breakStart: false, breakEnd: true }) && J(mineBreakButtonsOf("open", true)) === J({ ...punchButtonsOf("open"), breakStart: true, breakEnd: false }) && mineBreakButtonsOf("open", false).breakStart === false && mineBreakButtonsOf("none", true).breakStart === false);

// ── (2) スタッフ ──
const at = (h: number, m: number) => new Date(Date.parse("2026-11-20T00:00:00+09:00") + (h * 60 + m) * 60_000).toISOString();
const P = [{ membership_id: "m1", biz_date: "2026-11-20", kind: "in" as const, punched_at: at(20, 0) }, { membership_id: "m1", biz_date: "2026-11-20", kind: "out" as const, punched_at: at(22, 0) },
  { membership_id: "m1", biz_date: "2026-11-20", kind: "in" as const, punched_at: at(23, 0) }, { membership_id: "m1", biz_date: "2026-11-20", kind: "out" as const, punched_at: at(25, 7) }];
const h0 = staffHoursOf(P), hN = staffHoursOf(P, () => null);
ok("(2-1) dayAdj なし・null は今の式（中抜けの対の和＝247 分）", h0[0].minutes === 247 && J(h0) === J(hN), h0);
const hB = staffHoursOf(P, () => ({ rounding: null, breaks: [{ startMin: 21 * 60, endMin: 21 * 60 + 30 }, { startMin: 24 * 60, endMin: 24 * 60 + 15 }] }));
ok("(2-2) 休憩は対ごとの窓で引く（30 分＋15 分＝202 分）", hB[0].minutes === 202, hB);
const hR = staffHoursOf(P, () => ({ rounding: { unit: 15, mode: "staff_favor" }, breaks: [] }));
ok("(2-3) 丸め（15 分・働く人に有利）は対ごとに出勤と退勤を丸める（20:00〜22:00・23:00〜25:15＝255 分）", hR[0].minutes === 255, hR);
// ★版 2（F4）: 閉じ忘れの休憩は「その営業日」だけに効く（次の営業日に漏れない）・その日に退勤があれば休憩開始〜退勤を休憩にして要対応（openBreak）
const atD = (d: string, h: number, m: number) => new Date(Date.parse(`${d}T00:00:00+09:00`) + (h * 60 + m) * 60_000).toISOString();
const srcOB = { rules: [], breaks: [{ castId: "c1", membershipId: null, bizDate: "2026-11-20", startedAt: atD("2026-11-20", 23, 0), endedAt: null }, { castId: "c1", membershipId: null, bizDate: "2026-11-21", startedAt: atD("2026-11-21", 22, 0), endedAt: atD("2026-11-21", 22, 30) }] };
const adjOB = dayAdjOfSource(srcOB, {});
const wPrev = dayWindowOf(20 * 60, 25 * 60, adjOB("c1", "2026-11-20")), wToday = dayWindowOf(20 * 60, 25 * 60, adjOB("c1", "2026-11-21"));
ok("(2-4) ★版 2 前の営業日の閉じ忘れはその日だけ（休憩開始 23:00〜退勤 25:00＝120 分・要対応）・次の日は自分の休憩だけ（30 分・要対応なし）", J(adjOB("c1", "2026-11-21")?.breaks) === J([{ startMin: 22 * 60, endMin: 22 * 60 + 30 }]) && !!wPrev && wPrev.breakMin === 120 && wPrev.openBreak && !!wToday && wToday.breakMin === 30 && !wToday.openBreak, { wPrev, wToday });

// ── (3) 直し・要対応・和文 ──
ok("(3-1) 直しの行の止め：形・逆・重なり・理由・10 回まで", breakEditErrOf([{ start: "22:00", end: "22:30" }], "忘れ") === null && breakEditErrOf([{ start: "2200", end: "22:30" }], "x") !== null && breakEditErrOf([{ start: "22:30", end: "22:00" }], "x") !== null
  && breakEditErrOf([{ start: "22:00", end: "23:00" }, { start: "22:30", end: "23:30" }], "x") === "休憩の時間が重なっています" && breakEditErrOf([], " ") === "直す理由を入れてください" && breakEditErrOf(Array.from({ length: 11 }, () => ({ start: "22:00", end: "22:10" })), "x") !== null);
// ★G3（相談役 11/25）: スタッフの閉じ忘れの休憩＝キャストと同じ見方（休憩開始〜その対の退勤を休憩）・同じ要対応の 1 行
const hO = staffHoursOf(P, () => ({ rounding: null, breaks: [{ startMin: 21 * 60, endMin: null }] }));
ok("(2-5) ★G3 スタッフの閉じ忘れの休憩は休憩開始〜その対の退勤（20:00〜21:00＋23:00〜25:07＝187 分・中抜けの後の対は休憩にしない）・その日に印・無い日はキーなし（旗 false の今と同じ形）", hO[0].minutes === 187 && hO[0].openBreak === true && J(staffOpenBreakDatesOf(hO)) === J(["2026-11-20"]) && !("openBreak" in h0[0]) && !("openBreak" in hB[0]) && staffOpenBreakDatesOf(hB).length === 0, hO);
const obS = openBreakSummaryOf([{ castName: "スタッフA", openBreakDates: staffOpenBreakDatesOf(hO) }]);
ok("(2-6) ★G3 スタッフの要対応の 1 行はキャストの給与の画面と同じ文（名前 月/日）", !!obS && obS.count === 1 && obS.text === openBreakSummaryOf([{ castName: "スタッフA", openBreakDates: ["2026-11-20"] }])!.text && obS.text.startsWith("休憩の終了の打刻が無い日が 1 件") && obS.text.includes("スタッフA 11/20"), obS);
ok("(3-1b) ★版 2 店の直しは終了が必須（空の終了は止める＝休憩中のまま残す直しは作らない）", breakEditErrOf([{ start: "22:00", end: "" }], "閉じ忘れ") !== null && breakEditErrOf([{ start: "22:00", end: "22:15" }], "閉じ忘れ") === null);
ok("(3-2) 直しの行は営業日の 0〜47 時から ISO（翌 1:30 は 25:30）・初期値は勤怠の表の休憩（終了なしは空）", J(breakSetRowsOf("2026-11-20", [{ start: "25:00", end: "25:30" }])) === J([{ started_at: "2026-11-20T16:00:00.000Z", ended_at: "2026-11-20T16:30:00.000Z" }]) && J(breakEditRowsOf([["22:00", null]])) === J([{ start: "22:00", end: "" }]), breakSetRowsOf("2026-11-20", [{ start: "25:00", end: "25:30" }]));
const ob = openBreakSummaryOf([{ castName: "A", openBreakDates: ["2026-11-03"] }, { castName: "B" }]);
ok("(3-3) 要対応の 1 行（閉じ忘れの休憩＝休憩開始から退勤まで）・無ければ null", !!ob && ob.count === 1 && ob.text.includes("A 11/3") && openBreakSummaryOf([{ castName: "B", openBreakDates: [] }]) === null);
const reasons = ["on break", "not on duty", "already on break", "not on break", "break disabled", "outside work", "overlap"];
ok("(3-4) 断りの英語は和文に（端末・本人・店の代理・直し）", reasons.every((r) => !/[a-z]{3}/.test(rpcErrJa(r))), reasons.map((r) => rpcErrJa(r)));

// ── (4) 配線 ──
const src = (p: string) => fs.readFileSync(p, "utf8");
const kiosk = src("app/kiosk/page.tsx"), act = src("app/mine/punch-actions.tsx"), mine = src("app/mine/page.tsx"), prof = src("app/(manage)/master/store-profile/page.tsx"), panel = src("app/(manage)/master/break-punch-panel.tsx");
const board = src("app/(manage)/payroll/attendance-board.tsx"), pboard = src("app/(manage)/payroll/payroll-board.tsx"), wiz = src("app/(manage)/setup/setup-wizard.tsx"), v5 = src("lib/nox/setup/v5.ts");
ok("(4-1) 端末：旗 true だけ名前を押した時に kiosk_break_state を読む・休憩は kiosk_break（PIN）", kiosk.includes('if (mig0214On()) void (async () => {') && kiosk.includes('supabase.rpc("kiosk_break_state"') && kiosk.includes('supabase.rpc("kiosk_break"') && kiosk.includes("kioskBreakButtonsOf(mig0214On() ? target.kstate ?? null : null"));
ok("(4-2) /mine：本人の休憩は break_self（位置の判定なし）・店の鍵と自分の閉じていない休憩は旗の後ろ", act.includes('rpc("break_self", { p_action: action })') && mine.includes("mig0214On() && ((myStore?.settings_json ?? {}) as Record<string, unknown>).break_punch === true") && mine.includes('.from("punch_breaks").select("id").eq("cast_id", meCast.id as string).eq("biz_date", bizToday).is("ended_at", null)'));   // ★版 2: 今日の営業日の休憩だけ（前の営業日の閉じ忘れで「休憩終了」だけにしない）
ok("(4-3) 店舗設定だけ（初期設定には出さない）・旗の後ろ・保存は set_break_punch", prof.includes("{tab === \"shift\" && mig0214On() && <BreakPunchPanel") && panel.includes('rpc("set_break_punch", { p_store_id: storeSel, p_on: on })') && !/break_punch|休憩の打刻/.test(wiz + v5));
ok("(4-4) 勤怠の表の日の直しに休憩（店だけ・旗の後ろ）・給与の画面に要対応の 1 行", board.includes('extra={mig0214On() && edit.mode === "edit" && edit.row.inHm ? <BreakEdit') && pboard.includes("openBreakSummaryOf(rows)"));
ok("(4-5) 2 店目に写す鍵：旗 false の間は 0203 の名簿どおり写さない（0214 が store_copy_settings に足す）", "break_punch" in STORE_SETTING_KEYS && STORE_SETTING_KEYS.break_punch.part === (flag.MIG_0214_APPLIED ? "settings" : null));
const swp = src("app/(manage)/staff/staff-work-panel.tsx");
ok("(4-7) ★G3 店の画面のスタッフの時間の所に要対応の 1 行（店の画面だけ・旗 true だけ・キャストと同じ openBreakSummaryOf）", swp.includes('{scope === "store" && mig0214On() && (() => { const ob = openBreakSummaryOf(rows.map((r) => ({ castName: r.name, openBreakDates: staffOpenBreakDatesOf(r.days) })));') && swp.includes("data-staff-open-break={ob.count}") && swp.split("openBreakSummaryOf(").length === 2);
ok("(4-6) 旗は true（★0214 版 2 を 2026-11-25 19:48:14 に本番適用・相談役 11/25 の便 G3）", flag.MIG_0214_APPLIED === true);

// ── (5) ★版 2 DB（旗 MIG_0214_APPLIED が true のときだけ・BEGIN … ROLLBACK＝残留 0・NOX_SKIP_DB=1 で飛ばす） ──
//   前の営業日に出勤（退勤なし）と閉じていない休憩がある人が、今日の出勤 → 休憩 → 休憩終了 → 退勤を通せる（キャスト＝端末の kiosk_punch／kiosk_break・スタッフ＝staff_punch／kiosk_break）。
//   試走の中の now() は 1 つ＝前の営業日の打刻は now() − 1 日。端末は試走の中だけ作る（ROLLBACK で消える）。
async function dbPart() {
  if (!flag.MIG_0214_APPLIED) { console.log("  (5) DB の段は旗 MIG_0214_APPLIED が false の間は飛ばす"); return; }
  const url = process.env.NOX_SKIP_DB === "1" ? undefined : (process.env.SUPABASE_DB_URL ?? (() => { try { const l = src(".env.local").split(/\r?\n/).find((x) => x.startsWith("SUPABASE_DB_URL=")); return l ? l.slice(16).replace(/^"|"$/g, "") : undefined; } catch { return undefined; } })());
  if (!url) { console.log("  (5) DB の段は飛ばす"); return; }
  const db = new pg.Client({ connectionString: url, application_name: "nox-verify-breaks" }); await db.connect();
  try {
    await db.query("begin");
    const tx = pgTx(db);
    const A1 = await tx.storeA1();
    const owner = await tx.uidOf("ownerA"), castU = await tx.uidOf("castA1a"), staffU = await tx.uidOf("staffA1");
    const cid = (await tx.castOf(A1.id, castU.id))!;
    const mem = (await tx.one<{ id: string }>("select id from memberships where user_id = $1 and store_id = $2", [staffU.id, A1.id])).id;
    const devUid = randomUUID();
    await tx.q("insert into kiosk_devices (org_id, store_id, auth_user_id, is_active) values ($1, $2, $3, true)", [A1.org_id, A1.id, devUid]);
    const dev = { auth_user_id: devUid };
    await tx.q("delete from cast_pin where cast_id = $1", [cid]);
    await tx.q("insert into cast_pin (cast_id, org_id, store_id, pin_hash) values ($1, $2, $3, extensions.crypt('1234', extensions.gen_salt('bf')))", [cid, A1.org_id, A1.id]);
    await tx.q("delete from staff_pin where membership_id = $1", [mem]);
    await tx.q("insert into staff_pin (membership_id, org_id, store_id, pin_hash) values ($1, $2, $3, extensions.crypt('1234', extensions.gen_salt('bf')))", [mem, A1.org_id, A1.id]);
    const on = await tx.as({ auth_user_id: owner.auth_user_id }, "select public.set_break_punch($1, true) v", [A1.id]);
    const bd = (await tx.one<{ d: string }>("select public.biz_date_of($1, now())::text d", [A1.id])).d;
    const bdPrev = (await tx.one<{ d: string }>("select public.biz_date_of($1, now() - interval '1 day')::text d", [A1.id])).d;
    await tx.q("delete from punch_breaks where cast_id = $1 or membership_id = $2", [cid, mem]);
    await tx.q("delete from punches where cast_id = $1 and punched_at >= now() - interval '4 days' and public.biz_date_of(store_id, punched_at) between $2::date - 1 and $2::date", [cid, bd]);
    await tx.q("delete from staff_punches where membership_id = $1 and biz_date between $2::date - 1 and $2::date", [mem, bd]);
    await tx.q("delete from staff_attendance_locks where store_id = $1 and period in (to_char($2::date, 'YYYY-MM'), to_char($2::date - 1, 'YYYY-MM'))", [A1.id, bd]);
    await tx.q("insert into punches (org_id, store_id, cast_id, type, punched_at, source) values ($1, $2, $3, 'in', now() - interval '1 day', 'kiosk')", [A1.org_id, A1.id, cid]);
    await tx.q("insert into staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source, created_by) values ($1, $2, $3, $4::date, 'in', now() - interval '1 day', 'kiosk', null)", [mem, A1.org_id, A1.id, bdPrev]);
    await tx.q("insert into punch_breaks (org_id, store_id, cast_id, membership_id, biz_date, started_at, source) values ($1, $2, $3, null, $5::date, now() - interval '1 day' + interval '1 minute', 'self'), ($1, $2, null, $4, $5::date, now() - interval '1 day' + interval '1 minute', 'kiosk')", [A1.org_id, A1.id, cid, mem, bdPrev]);
    ok("(5-0) 準備：休憩を使う店にした・前の営業日は今の 1 日前", on.ok && bdPrev < bd, { on: tx.errOf(on), bd, bdPrev });
    const jo = (r: Awaited<ReturnType<typeof tx.call>>) => (r.ok ? (r.rows[0]?.j as Record<string, unknown>)?.ok === true : false);
    const steps = async (label: string, calls: [string, unknown[]][]) => { const errs: string[] = []; for (const [sql, ps] of calls) { const r = await tx.as(dev, sql, ps); if (!jo(r)) errs.push(`${sql.slice(14, 40)} ${r.ok ? JSON.stringify(r.rows[0]) : r.err}`); } ok(label, errs.length === 0, errs); };
    await steps("(5-1) キャスト：前の営業日の閉じ忘れがあっても 出勤 → 休憩 → 休憩終了 → 退勤 が通る", [
      ["select public.kiosk_punch($1, '1234', 'in', null, null) j", [cid]], ["select public.kiosk_break($1, null, '1234', 'start') j", [cid]],
      ["select public.kiosk_break($1, null, '1234', 'end') j", [cid]], ["select public.kiosk_punch($1, '1234', 'out', null, null) j", [cid]]]);
    await steps("(5-2) スタッフ：前の営業日の閉じ忘れがあっても 出勤 → 休憩 → 休憩終了 → 退勤 が通る", [
      ["select public.staff_punch($1, '1234', 'in') j", [mem]], ["select public.kiosk_break(null, $1, '1234', 'start') j", [mem]],
      ["select public.kiosk_break(null, $1, '1234', 'end') j", [mem]], ["select public.staff_punch($1, '1234', 'out') j", [mem]]]);
    const left = await tx.one<{ prev: number; today: number }>("select count(*) filter (where biz_date = $3::date)::int prev, count(*) filter (where biz_date = $4::date)::int today from punch_breaks where (cast_id = $1 or membership_id = $2) and ended_at is null", [cid, mem, bdPrev, bd]);
    ok("(5-3) 今日の休憩は閉じた・前の営業日の閉じ忘れ 2 行はそのまま（店の直しで閉じる）", left.prev === 2 && left.today === 0, left);
  } finally { await db.query("rollback").catch(() => undefined); await db.end(); }
}
void dbPart().then(() => {
  if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-breaks FAIL ${fails.length} / ${n}`); process.exit(1); }
  console.log(`verify:nox-breaks ALL PASS (${n} assertions)`);
}, (e) => { console.error(`verify:nox-breaks ERROR ${(e as Error).message}`); process.exit(1); });
