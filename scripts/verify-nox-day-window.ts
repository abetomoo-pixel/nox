// verify:nox-day-window（★0213 起票159 勤務時間の丸め・★0214 起票158 の 2 休憩・相談役 11/25 の D4・D5）— 日の窓の純関数と、給与（loadPunch）・勤怠の表・/mine が同じ窓を読むこと。DB に触れない。
//   (1) 丸めの向き（BANZEN と同じ表）・単位 1 は素通し・秒は切り捨ててから丸める・順序の締め
//   (2) 変えた営業日から効く（履歴の行）・当てない店（確定シフトどおり・打刻しない）
//   (3) 休憩（窓で割る・窓の外は切る・重なりはまとめる・閉じていない休憩は退勤まで）と丸めの組み合わせ
//   (4) 本物の loadPunch に偽の読取（作り物の行）＝旗 false と旗 true（履歴も休憩も無い）で結果が同じ・丸める店の 20:07→20:15・遅刻は生の時刻
//   (5) 勤怠の表（セル「20:07→20:15」・CSV は丸めた後の列を足す・丸めない店の CSV は今と同じ）・/mine の当月の表
//   (6) 配線（collect・勤怠の表・/mine・店舗設定・初期設定・デモの名簿）
import fs from "node:fs";
import { dayWindowOf, roundMinOf, roundHmOf, roundingAtOf, dayAdjAppliesOf, minOfBizDay, roundedCellOf, type PunchRounding } from "../lib/nox/punch/day-window";
import { dayAdjOfSource } from "../lib/nox/punch/day-adj-load";
import { loadPunch } from "../lib/nox/payroll/collect";
import { attendanceDayRowsOf, attendanceCsvOf, SHEET_COLUMNS, SHEET_ADJ_COLUMNS } from "../lib/nox/payroll/attendance-sheet";
import { monthAttendanceRowsOf } from "../lib/nox/mine/attendance-month";
import { bandSegmentsOf, bandSegmentsOfSpans } from "../lib/nox/payroll/hourly-bands";
import type { RateBand } from "../lib/nox/rules-0175/canon";
import type { PayrollWindow } from "../lib/nox/payroll/window";
import * as flag from "../lib/nox/rules-0175/flag";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail)}`); };
const J = (x: unknown) => JSON.stringify(x, (_k, v) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : v));
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const R = (unit: number, mode: PunchRounding["mode"]): PunchRounding => ({ unit, mode });

// ── (1) 丸めの向き ──
const in07 = hm("20:07");
const exp: Record<string, [number, number, number]> = { // 単位ごとの [働く人に有利, 四捨五入, 店に有利] の出勤
  "5": [hm("20:05"), hm("20:05"), hm("20:10")], "10": [hm("20:00"), hm("20:10"), hm("20:10")], "15": [hm("20:00"), hm("20:00"), hm("20:15")], "30": [hm("20:00"), hm("20:00"), hm("20:30")],
};
for (const [u, [sf, nr, st]] of Object.entries(exp)) {
  ok(`(1-1) 出勤 20:07 を ${u} 分`, roundMinOf(in07, "in", R(+u, "staff_favor")) === sf && roundMinOf(in07, "in", R(+u, "nearest")) === nr && roundMinOf(in07, "in", R(+u, "store_favor")) === st,
    [roundMinOf(in07, "in", R(+u, "staff_favor")), roundMinOf(in07, "in", R(+u, "nearest")), roundMinOf(in07, "in", R(+u, "store_favor"))]);
}
ok("(1-2) 退勤 翌 01:52（25:52）を 15 分＝働く人に有利 26:00・四捨五入 25:45・店に有利 25:45", roundHmOf("25:52", "out", R(15, "staff_favor")) === "26:00" && roundHmOf("25:52", "out", R(15, "nearest")) === "25:45" && roundHmOf("25:52", "out", R(15, "store_favor")) === "25:45");
ok("(1-3) 四捨五入のちょうど半分は切り上げ（20:07:30 は秒を切り捨てて 20:07＝15 分で 20:00・20:08 は 20:15）", roundMinOf(minOfBizDay("2026-11-24T11:07:30.000Z", "2026-11-24"), "in", R(15, "nearest")) === hm("20:00") && roundMinOf(hm("20:08"), "in", R(15, "nearest")) === hm("20:15") && roundMinOf(hm("20:30") - 15, "in", R(30, "nearest")) === hm("20:30"));
ok("(1-4) 秒は切り捨ててから丸める（退勤 20:00:30 を 15 分の切り上げ＝20:00・BANZEN なら 20:15）", roundMinOf(minOfBizDay("2026-11-24T11:00:30.000Z", "2026-11-24"), "out", R(15, "staff_favor")) === hm("20:00"));
ok("(1-5) 単位 1 と null は素通し", roundMinOf(in07, "in", R(1, "store_favor")) === in07 && roundMinOf(in07, "out", null) === in07);
ok("(1-6) 休憩の向き：働く人に有利＝開始 切り上げ・終了 切り下げ（休憩が短くなる）／店に有利＝逆", roundHmOf("22:07", "break_start", R(15, "staff_favor")) === "22:15" && roundHmOf("22:37", "break_end", R(15, "staff_favor")) === "22:30" && roundHmOf("22:07", "break_start", R(15, "store_favor")) === "22:00" && roundHmOf("22:37", "break_end", R(15, "store_favor")) === "22:45");
const wc = dayWindowOf(hm("20:01"), hm("20:09"), { rounding: R(15, "store_favor"), breaks: [] });
ok("(1-7) 順序の締め：店に有利で 20:01→20:09 を 15 分＝20:15→20:00 → 0 分（負にしない）", !!wc && wc.workMin === 0 && wc.inMin === hm("20:15") && wc.outMin === hm("20:15"), wc);
const wx = dayWindowOf(hm("23:58"), hm("29:07"), { rounding: R(30, "nearest"), breaks: [] });
ok("(1-8) 日をまたぐ 23:58→翌 05:07（29:07）を 30 分の四捨五入＝24:00→29:00＝5 時間", !!wx && wx.inMin === hm("24:00") && wx.outMin === hm("29:00") && wx.workMin === 300, wx);
ok("(1-9) 退勤の無い日は窓なし（0 時間のまま）", dayWindowOf(hm("20:00"), null, { rounding: R(15, "staff_favor"), breaks: [] }) === null);
const w0 = dayWindowOf(hm("20:07"), hm("25:52"), null);
ok("(1-10) 丸めも休憩も無ければ [出勤, 退勤] のまま（今の dayWorkedHours と同じ分）", !!w0 && w0.workMin === hm("25:52") - hm("20:07") && w0.segs.length === 1);

// ── (2) 変えた営業日から ──
const rules = [{ effective_from: "2026-11-20", unit: 15, mode: "nearest" as const }, { effective_from: "2026-11-25", unit: 1, mode: "nearest" as const }];
ok("(2-1) 履歴の行の前の日は丸めない・11/20〜24 は 15 分・11/25 から 1 分（丸めない）", roundingAtOf(rules, "2026-11-19") === null && J(roundingAtOf(rules, "2026-11-20")) === J(R(15, "nearest")) && J(roundingAtOf(rules, "2026-11-24")) === J(R(15, "nearest")) && roundingAtOf(rules, "2026-11-25") === null);
ok("(2-2) 当てない店＝確定シフトどおり・打刻しない（シフトの無い日も）", dayAdjAppliesOf({ payTimeBasis: "punch", punchMode: "punch" }) && !dayAdjAppliesOf({ payTimeBasis: "shift", punchMode: "punch" }) && !dayAdjAppliesOf({ payTimeBasis: "punch", punchMode: "store" }));
const fShift = dayAdjOfSource({ rules, breaks: [] }, { payTimeBasis: "shift" });
const fPunch = dayAdjOfSource({ rules, breaks: [{ castId: "c1", membershipId: null, bizDate: "2026-11-25", startedAt: "2026-11-25T13:00:00.000Z", endedAt: "2026-11-25T13:30:00.000Z" }] }, { payTimeBasis: "punch" });
ok("(2-3) dayAdjOfSource：確定シフトどおりの店は null・実打刻の店は丸め（11/22）と休憩（11/25・22:00〜22:30）", fShift("c1", "2026-11-22") === null && J(fPunch("c1", "2026-11-22")) === J({ rounding: R(15, "nearest"), breaks: [] }) && J(fPunch("c1", "2026-11-25")) === J({ rounding: null, breaks: [{ startMin: hm("22:00"), endMin: hm("22:30") }] }) && fPunch("c2", "2026-11-25") === null);
ok("(2-4) 休憩の時刻は帰属の営業日の軸（締めをまたぐ 06:30 も 30:30）", minOfBizDay("2026-11-25T21:30:00.000Z", "2026-11-25") === hm("30:30"));

// ── (3) 休憩 ──
const b1 = dayWindowOf(hm("20:00"), hm("25:00"), { rounding: null, breaks: [{ startMin: hm("22:00"), endMin: hm("22:30") }] });
ok("(3-1) 20:00〜翌 01:00 で 22:00〜22:30 の休憩＝4.5h・区間は 2 つ", !!b1 && b1.workMin === 270 && b1.breakMin === 30 && J(b1.segs) === J([[1200, 1320], [1350, 1500]]), b1);
const b2 = dayWindowOf(hm("20:00"), hm("25:00"), { rounding: null, breaks: [{ startMin: hm("19:00"), endMin: hm("20:30") }, { startMin: hm("24:45"), endMin: hm("26:00") }, { startMin: hm("22:00"), endMin: hm("22:30") }, { startMin: hm("22:15"), endMin: hm("23:00") }] });
ok("(3-2) 窓の外は切る・重なりはまとめる（20:00〜20:30・22:00〜23:00・24:45〜25:00＝105 分）", !!b2 && b2.breakMin == 105 && b2.workMin === 300 - 105, b2);
const b3 = dayWindowOf(hm("20:00"), hm("25:00"), { rounding: null, breaks: [{ startMin: hm("23:00"), endMin: null }] });
ok("(3-3) 閉じていない休憩（終了なし）＝退勤まで休憩・要対応の印", !!b3 && b3.workMin === 180 && b3.breakMin === 120 && b3.openBreak, b3);
const b4 = dayWindowOf(hm("20:07"), hm("25:52"), { rounding: R(15, "staff_favor"), breaks: [{ startMin: hm("22:07"), endMin: hm("22:37") }] });
ok("(3-4) 丸め（15 分・働く人に有利）と休憩：20:00〜26:00・休憩 22:15〜22:30＝15 分・5.75h", !!b4 && b4.inMin === hm("20:00") && b4.outMin === hm("26:00") && b4.breakMin === 15 && b4.workMin === 345, b4);
const BANDS: RateBand[] = [{ target: "hourly", from_min: 1200, to_min: 1320, value_amount: 1000, value_rate: null, priority: 100 }, { target: "hourly", from_min: 1320, to_min: 2880, value_amount: 1500, value_rate: null, priority: 100 }] as unknown as RateBand[];
const segsB = bandSegmentsOfSpans(b1!.segs, BANDS);
ok("(3-5) 帯は休憩で割った区間で切る（合計＝勤務の分・休憩の分は帯に入らない）＝20〜22 時 120 分 1000 円・22:30〜25:00 150 分 1500 円", segsB.reduce((a, s) => a + s.minutes, 0) === b1!.workMin && J(segsB) === J([{ minutes: 120, amount: 1000 }, { minutes: 150, amount: 1500 }]) && J(bandSegmentsOfSpans([[1200, 1500]], BANDS)) === J(bandSegmentsOf(1200, 1500, BANDS)), segsB);

// ── (4) 本物の loadPunch に偽の読取 ──
type Rows = Record<string, unknown[] | Record<string, unknown> | null>;
function fakeAdmin(rows: Rows) {
  return { from(table: string) { let single = false; const b: Record<string, unknown> = {}; for (const k of ["select", "eq", "neq", "gte", "lte", "lt", "gt", "in", "is", "order", "limit"]) b[k] = () => b; b.maybeSingle = () => { single = true; return b; }; b.single = b.maybeSingle; b.then = (res: (x: unknown) => unknown) => { const d = rows[table] ?? (single ? null : []); return res({ data: single ? (Array.isArray(d) ? d[0] ?? null : d) : d, error: null }); }; return b; } } as never;
}
const WIN: PayrollWindow = { period: "2026-10", periodStart: "2026-10-01", periodEnd: "2026-10-31", cutoffHm: "06:00", closeHm: "26:00", startTs: "2026-09-30T21:00:00Z", endTs: "2026-10-31T21:00:00Z" };
const at = (date: string, h: string, sec = 0) => new Date(Date.parse(`${date}T00:00:00+09:00`) + (hm(h) * 60 + sec) * 1000).toISOString();
const C = "c1";
const baseRows = (extra: Rows = {}): Rows => ({
  shifts: [{ cast_id: C, date: "2026-10-05", start_hm: "20:00", end_hm: "26:00", id: "s1" }, { cast_id: C, date: "2026-10-12", start_hm: "20:00", end_hm: "26:00", id: "s2" }, { cast_id: C, date: "2026-10-13", start_hm: "20:00", end_hm: "26:00", id: "s3" }],
  punches: [
    { cast_id: C, punched_at: at("2026-10-05", "20:07"), type: "in" }, { cast_id: C, punched_at: at("2026-10-05", "25:52"), type: "out" },
    { cast_id: C, punched_at: at("2026-10-12", "20:07", 41), type: "in" }, { cast_id: C, punched_at: at("2026-10-12", "25:52", 5), type: "out" },
    { cast_id: C, punched_at: at("2026-10-13", "20:12"), type: "in" }, { cast_id: C, punched_at: at("2026-10-13", "25:00"), type: "out" },
    { cast_id: C, punched_at: at("2026-10-14", "18:59", 37), type: "in" }, { cast_id: C, punched_at: at("2026-10-14", "25:31", 12), type: "out" }, // シフトの無い日（秒あり）
  ],
  attendance: [], check_nominations: [], stores: { settings_json: {} }, ...extra,
});
const pick = (res: Awaited<ReturnType<typeof loadPunch>>) => (res.byCast as unknown as Map<string, { hoursByDate: Map<string, number>; noShiftHours: Map<string, number>; lateN: number; win: { punch: Map<string, [number, number]>; noShift: Map<string, [number, number]>; punchSegs?: Map<string, [number, number][]> }; openBreakDates: string[] }>).get(C)!;
const G = { lateGrace: 10 };

async function main() {
  const fl = flag as unknown as { __set0213ForTest: (v: boolean | null) => void; __set0214ForTest: (v: boolean | null) => void };
  fl.__set0213ForTest(false); fl.__set0214ForTest(false);
  const off = await loadPunch(fakeAdmin(baseRows()), "store-x", WIN, G);
  fl.__set0213ForTest(true); fl.__set0214ForTest(true);
  const onEmpty = await loadPunch(fakeAdmin(baseRows()), "store-x", WIN, G);
  ok("(4-1) 旗 true でも履歴も休憩も無い店は、旗 false と 1 バイト同じ（時間・区間・遅刻・シフトの無い日のミリ秒の時間）", J(off) === J(onEmpty), [J(off).length, J(onEmpty).length]);
  const onUnit1 = await loadPunch(fakeAdmin(baseRows({ punch_round_rules: [{ effective_from: "2026-10-01", unit: 1, mode: "nearest" }] })), "store-x", WIN, G);
  ok("(4-2) 丸めない（単位 1）の行がある店も 1 バイト同じ", J(off) === J(onUnit1));
  const p0 = pick(off);
  const on15 = pick(await loadPunch(fakeAdmin(baseRows({ punch_round_rules: [{ effective_from: "2026-10-10", unit: 15, mode: "nearest" }] })), "store-x", WIN, G));
  ok("(4-3) 10/10 から 15 分・四捨五入：10/5 は前のまま（20:07〜25:52＝5.75h）・10/12（秒あり）は 20:00〜25:45＝5.75h・10/13 は 20:15〜25:00＝4.75h",
    on15.hoursByDate.get("2026-10-05") === p0.hoursByDate.get("2026-10-05") && Math.abs((on15.hoursByDate.get("2026-10-12") ?? 0) - 5.75) < 1e-9 && Math.abs((on15.hoursByDate.get("2026-10-13") ?? 0) - 4.75) < 1e-9 && J(on15.win.punch.get("2026-10-12")) === J([1200, 1545]),
    [...on15.hoursByDate.entries()]);
  ok("(4-4) 遅刻は生の時刻（10/13 の 20:12＝猶予 10 分を超えて遅刻・丸めた 20:15 ではない／10/12 の 20:07 は遅刻でない）＝丸めても遅刻の数は同じ", on15.lateN === p0.lateN && p0.lateN === 1, [on15.lateN, p0.lateN]);
  ok("(4-5) シフトの無い日（18:59:37〜25:31:12）を 15 分・四捨五入＝19:00〜25:30＝6.5h（秒は切り捨ててから丸める）", Math.abs((on15.noShiftHours.get("2026-10-14") ?? 0) - 6.5) < 1e-9 && J(on15.win.noShift.get("2026-10-14")) === J([1140, 1530]), [...on15.noShiftHours.entries()]);
  const shiftStore = pick(await loadPunch(fakeAdmin(baseRows({ stores: { settings_json: { pay_time_basis: "shift" } }, punch_round_rules: [{ effective_from: "2026-10-01", unit: 30, mode: "store_favor" }], punch_breaks: [{ cast_id: C, membership_id: null, biz_date: "2026-10-05", started_at: at("2026-10-05", "22:00"), ended_at: at("2026-10-05", "23:00") }] })), "store-x", WIN, G));
  const shiftStore0 = pick(await (async () => { fl.__set0213ForTest(false); fl.__set0214ForTest(false); const r = await loadPunch(fakeAdmin(baseRows({ stores: { settings_json: { pay_time_basis: "shift" } } })), "store-x", WIN, G); fl.__set0213ForTest(true); fl.__set0214ForTest(true); return r; })());
  ok("(4-6) 確定シフトどおりの店は丸めも休憩も効かない（シフトの無い日も）", J(shiftStore) === J(shiftStore0));
  const brk = pick(await loadPunch(fakeAdmin(baseRows({ punch_breaks: [{ cast_id: C, membership_id: null, biz_date: "2026-10-05", started_at: at("2026-10-05", "22:00"), ended_at: at("2026-10-05", "22:30") }, { cast_id: C, membership_id: null, biz_date: "2026-10-13", started_at: at("2026-10-13", "23:00"), ended_at: null }] })), "store-x", WIN, G));
  ok("(4-7) 休憩：10/5 は 30 分を引く（5.25h・区間 2 つ）・10/13 は閉じていない休憩＝23:00〜退勤 25:00 を休憩（2.8h）＋要対応の日", Math.abs((brk.hoursByDate.get("2026-10-05") ?? 0) - 5.25) < 1e-9 && brk.win.punchSegs?.get("2026-10-05")?.length === 2 && Math.abs((brk.hoursByDate.get("2026-10-13") ?? 0) - 2.8) < 1e-9 && J(brk.openBreakDates) === J(["2026-10-13"]), [[...brk.hoursByDate.entries()], brk.openBreakDates]);
  ok("(4-8) 休憩も丸めも無い cast は openBreakDates 空・区間の地図はキーなし（今と同じ）", J(p0.openBreakDates) === "[]" && !("punchSegs" in p0.win));
  fl.__set0213ForTest(null); fl.__set0214ForTest(null);

  // ── (5) 勤怠の表・/mine ──
  const sheetIn = { punches: [{ id: "p1", punched_at: at("2026-10-05", "20:07"), type: "in" as const }, { id: "p2", punched_at: at("2026-10-05", "25:52"), type: "out" as const }], shifts: [{ id: "s1", date: "2026-10-05", start_hm: "20:00", end_hm: "26:00" }], attendance: [], cutoffHm: "06:00", closeHm: "26:00", todayBiz: "2026-10-31" };
  const rowsPlain = attendanceDayRowsOf(sheetIn);
  const rowsAdj = attendanceDayRowsOf({ ...sheetIn, dayAdj: () => ({ rounding: R(15, "staff_favor"), breaks: [{ startMin: hm("22:00"), endMin: hm("22:30") }] }) });
  const r1 = rowsAdj[0];
  ok("(5-1) 勤怠の表：丸めた出／退（20:00・26:00）・休憩 30 分・時間は給与と同じ窓（5.5h）・生の出／退は残す", r1.inHm === "20:07" && r1.outHm === "25:52" && r1.adj?.inRoundedHm === "20:00" && r1.adj?.outRoundedHm === "26:00" && r1.adj?.breakMin === 30 && r1.hours === 5.5, r1);
  ok("(5-2) セルの文字は「20:07→20:15」（同じなら 1 つ）", roundedCellOf("20:07", "20:15") === "20:07→20:15" && roundedCellOf("20:15", "20:15") === "20:15" && roundedCellOf("20:15", undefined) === "20:15");
  ok("(5-3) 丸めない店の行にはキーが増えない（今と 1 バイト同じ）", !("adj" in rowsPlain[0]) && J(rowsPlain) === J(attendanceDayRowsOf({ ...sheetIn, dayAdj: () => null })));
  const meta = { storeName: "店", period: "2026-10", castName: "A", exportedAt: "2026-11-25 10:00" };
  const csvPlain = attendanceCsvOf(meta, rowsPlain), csvAdj = attendanceCsvOf(meta, rowsAdj);
  ok("(5-4) CSV：丸めない店は今の列のまま・丸める店は「丸めた後」と休憩の列を足す", csvPlain.split("\r\n")[1] === SHEET_COLUMNS.join(",") && csvAdj.split("\r\n")[1] === [...SHEET_COLUMNS, ...SHEET_ADJ_COLUMNS].join(",") && csvAdj.split("\r\n")[2].endsWith(",20:00,翌02:00,30") , [csvAdj.split("\r\n")[2]]);
  const mine = monthAttendanceRowsOf({ punches: sheetIn.punches.map((p) => ({ punched_at: p.punched_at, type: p.type })), shifts: sheetIn.shifts.map((s) => ({ date: s.date, start_hm: s.start_hm, end_hm: s.end_hm })), cutoffHm: "06:00", closeHm: "26:00", dayAdj: () => ({ rounding: R(15, "staff_favor"), breaks: [] }) });
  const mine0 = monthAttendanceRowsOf({ punches: sheetIn.punches.map((p) => ({ punched_at: p.punched_at, type: p.type })), shifts: sheetIn.shifts.map((s) => ({ date: s.date, start_hm: s.start_hm, end_hm: s.end_hm })), cutoffHm: "06:00", closeHm: "26:00" });
  ok("(5-5) /mine の当月の表も同じ窓（丸めた 20:00〜26:00＝6h）・丸めない店はキーが増えない", mine[0].hours === 6 && mine[0].inRoundedHm === "20:00" && mine[0].outRoundedHm === "26:00" && !("inRoundedHm" in mine0[0]), [mine[0], mine0[0]]);

  // ── (6) 配線 ──
  const src = (p: string) => fs.readFileSync(p, "utf8");
  const collect = src("lib/nox/payroll/collect.ts"), kintai = src("lib/nox/payroll/kintai-sheet.ts"), minePage = src("app/mine/page.tsx"), panel = src("app/(manage)/master/punch-round-panel.tsx"), prewipe = src("lib/nox/demo/prewipe.ts"), v5 = src("lib/nox/setup/v5.ts"), wiz = src("app/(manage)/setup/setup-wizard.tsx"), row = src("components/nox/kintai-row.tsx");
  ok("(6-1) collect：旗の後ろで読む（false＝EMPTY_DAY_ADJ）・丸め・休憩の無い日は今の 2 行のまま", collect.includes("mig0213On() || mig0214On() ? await loadDayAdjSource(admin, storeId, win.periodStart, win.periodEnd) : EMPTY_DAY_ADJ") && collect.includes("if (!adj) {\n      hoursByDate.set(d.bizDate, dayWorkedHours(d));"));
  ok("(6-2) 勤怠の表・/mine は collect と同じ読み方（loadDayAdjSource → dayAdjOfSource）", kintai.includes("dayAdjOfSource(mig0213On() || mig0214On() ? await loadDayAdjSource(admin, storeId, win.periodStart, win.periodEnd) : EMPTY_DAY_ADJ") && kintai.includes("dayAdj: (bd: string) => dayAdjF(c.id, bd)") && minePage.includes("dayAdjOfSource(await loadDayAdjSource(supabase"));
  ok("(6-3) 店舗設定：旗 true は set_punch_round（オーナーだけ）・旗 false は今の set_store_profile", panel.includes('if (mig0213On()) { // ★0213') && panel.includes('rpc("set_punch_round", punchRoundArgsOf(storeSel, form, consent))') && panel.includes('rpc("set_store_profile", { p_store_id: storeSel, p_patch: punchRoundPatchOf(form, consent) })'));
  ok("(6-4) 初期設定：店舗設定と同じ選び方（5 つの単位・向き 3 つ・既定は丸めない）", wiz.includes("options={PUNCH_ROUND_UNIT_OPTIONS}") && wiz.includes("options={PUNCH_ROUND_MODE_OPTIONS}") && v5.includes('punch_round_mode: S.punch.roundMode ?? "nearest"') && v5.includes('punch: { judge: "soft", how: "device", round: 1, gate: true }'));
  ok("(6-5) デモの名簿：新しい表は旗の後ろ（旗 false の間は表が無い＝消さない）", prewipe.includes('...(mig0213On() ? ["punch_round_rules"] : [])') && prewipe.includes('...(mig0214On() ? ["punch_breaks"] : [])'));
  ok("(6-6) 勤怠の表のセル：丸めた日は「20:07→20:15」・休憩の分", row.includes("roundedCellOf(r.inHm, r.adj.inRoundedHm, hm47Ja)") && row.includes("roundedCellOf(r.outHm, r.adj.outRoundedHm, hm47Ja)") && row.includes("data-kintai-break"));
  ok("(6-7) 旗は false（本番に表が無い間）", flag.MIG_0213_APPLIED === false && flag.MIG_0214_APPLIED === false);

  if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-day-window FAIL ${fails.length} / ${n}`); process.exit(1); }
  console.log(`verify:nox-day-window ALL PASS (${n} assertions)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
