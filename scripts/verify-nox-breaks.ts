// verify:nox-breaks（★0214 起票158 の 2 休憩の打刻・相談役 11/25 の D5）— DB に触れない純関数と配線の照合。DB の動き（順序・柵・PIN・直し）は docs/tmp/break_1125/try-0214.mts（BEGIN … ROLLBACK）。
//   (1) ボタンの出し分け（端末＝名前を押した時の状態・/mine）＝出勤中は「休憩」「退勤」・休憩中は「休憩終了」だけ・使わない店は「休憩」を出さない・読めないときは今のまま
//   (2) スタッフの時間（中抜けの対ごとに休憩を引く・丸め）・旗 false（dayAdj なし）は今の式
//   (3) 店の直し（行の止め・ISO）・要対応の 1 行・断りの和文
//   (4) 配線（端末・/mine・店舗設定・勤怠の表の直し・給与の要対応・写す鍵・デモの名簿）
import fs from "node:fs";
import { kioskBreakButtonsOf, kioskButtonsShownOf, mineBreakButtonsOf, minePunchStateOf, punchButtonsOf } from "../lib/nox/shift/punch-state";
import { staffHoursOf } from "../lib/nox/staff/pay";
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

// ── (3) 直し・要対応・和文 ──
ok("(3-1) 直しの行の止め：形・逆・重なり・理由・10 回まで", breakEditErrOf([{ start: "22:00", end: "22:30" }], "忘れ") === null && breakEditErrOf([{ start: "2200", end: "22:30" }], "x") !== null && breakEditErrOf([{ start: "22:30", end: "22:00" }], "x") !== null
  && breakEditErrOf([{ start: "22:00", end: "23:00" }, { start: "22:30", end: "23:30" }], "x") === "休憩の時間が重なっています" && breakEditErrOf([], " ") === "直す理由を入れてください" && breakEditErrOf(Array.from({ length: 11 }, () => ({ start: "22:00", end: "22:10" })), "x") !== null);
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
ok("(4-2) /mine：本人の休憩は break_self（位置の判定なし）・店の鍵と自分の閉じていない休憩は旗の後ろ", act.includes('rpc("break_self", { p_action: action })') && mine.includes("mig0214On() && ((myStore?.settings_json ?? {}) as Record<string, unknown>).break_punch === true") && mine.includes('.from("punch_breaks").select("id").eq("cast_id"'));
ok("(4-3) 店舗設定だけ（初期設定には出さない）・旗の後ろ・保存は set_break_punch", prof.includes("{tab === \"shift\" && mig0214On() && <BreakPunchPanel") && panel.includes('rpc("set_break_punch", { p_store_id: storeSel, p_on: on })') && !/break_punch|休憩の打刻/.test(wiz + v5));
ok("(4-4) 勤怠の表の日の直しに休憩（店だけ・旗の後ろ）・給与の画面に要対応の 1 行", board.includes('extra={mig0214On() && edit.mode === "edit" && edit.row.inHm ? <BreakEdit') && pboard.includes("openBreakSummaryOf(rows)"));
ok("(4-5) 2 店目に写す鍵：旗 false の間は 0203 の名簿どおり写さない（0214 が store_copy_settings に足す）", "break_punch" in STORE_SETTING_KEYS && STORE_SETTING_KEYS.break_punch.part === (flag.MIG_0214_APPLIED ? "settings" : null));
ok("(4-6) 旗は false（本番に表が無い間）", flag.MIG_0214_APPLIED === false);

if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-breaks FAIL ${fails.length} / ${n}`); process.exit(1); }
console.log(`verify:nox-breaks ALL PASS (${n} assertions)`);
