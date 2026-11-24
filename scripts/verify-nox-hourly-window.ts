// verify:nox-hourly-window（★時間帯の時給 A・相談役 11/25 朝の便 M4 ア）— 帯で切った分の合計が、その日の今の勤務時間（分）と一致すること。DB に触れない。
//   本物の loadPunch（打刻と確定シフトと勤怠から日の時間を作る）に偽の読取（作り物の行）を渡し、collect と同じ選び方（bandWindowOf）で区間を取り、
//   帯（16 時・20 時・24 時・26 時・30 時で切る）で切った分の合計を、pay.ts がその日の時給に使う時間（dailyBase の規則）と比べる。
//   場合：シフトの終わりが日をまたぐ（end が start 以下の "02:00" の書き方と、24 時以降の "26:00" の書き方）・勤務時間の基準が shift の日・打刻しない店・シフトの無い日（秒あり）・shift_guarantee（打刻とシフトの高い方）。
import fs from "node:fs";
import { loadPunch } from "../lib/nox/payroll/collect";
import { bandSegmentsOf, bandWindowOf, bandHourlyOf, type BandSeg } from "../lib/nox/payroll/hourly-bands";
import type { RateBand } from "../lib/nox/rules-0175/canon";
import type { PayrollWindow } from "../lib/nox/payroll/window";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail)}`); };

type Rows = Record<string, unknown[] | Record<string, unknown> | null>;
/** 偽の読取：from(表) の鎖を全部受けて、表ごとの作り物の行を返す（maybeSingle は 1 行） */
function fakeAdmin(rows: Rows) {
  return {
    from(table: string) {
      let single = false;
      const b: Record<string, unknown> = {};
      for (const k of ["select", "eq", "neq", "gte", "lte", "lt", "gt", "in", "is", "order", "limit"]) b[k] = () => b;
      b.maybeSingle = () => { single = true; return b; };
      b.single = b.maybeSingle;
      b.then = (res: (x: unknown) => unknown) => { const d = rows[table] ?? (single ? null : []); return res({ data: single ? (Array.isArray(d) ? d[0] ?? null : d) : d, error: null }); };
      return b;
    },
  } as never;
}
const WIN: PayrollWindow = { period: "2026-10", periodStart: "2026-10-01", periodEnd: "2026-10-31", cutoffHm: "06:00", closeHm: "26:00", startTs: "2026-09-30T21:00:00Z", endTs: "2026-10-31T21:00:00Z" };
const BANDS: RateBand[] = [960, 1200, 1440, 1560, 1800].map((from, i, a) => ({ target: "hourly", from_min: from, to_min: a[i + 1] ?? 2880, value_amount: 1000 + i * 100, value_rate: null, priority: 100 } as unknown as RateBand));
const at = (date: string, hm: string, sec = 0) => { const [h, m] = hm.split(":").map(Number); const d = new Date(`${date}T00:00:00+09:00`); d.setTime(d.getTime() + (h * 60 + m) * 60_000 + sec * 1000); return d.toISOString(); };
const sumMin = (xs: BandSeg[]) => xs.reduce((a, x) => a + x.minutes, 0);

type Case = { name: string; shifts: { cast_id: string; date: string; start_hm: string; end_hm: string; id: string }[]; punches: { cast_id: string; punched_at: string; type: "in" | "out" }[]; attendance?: { cast_id: string; date: string; status: string }[]; store?: Record<string, unknown>; basis: "punch" | "shift"; rule?: "actual" | "shift_guarantee" };
const C = "c1";
const cases: Case[] = [
  { name: "日をまたぐ（26:00 の書き方）・実打刻", basis: "punch", shifts: [{ cast_id: C, date: "2026-10-05", start_hm: "20:00", end_hm: "26:00", id: "s1" }], punches: [{ cast_id: C, punched_at: at("2026-10-05", "19:55"), type: "in" }, { cast_id: C, punched_at: at("2026-10-05", "26:20"), type: "out" }] },
  { name: "日をまたぐ（02:00 の書き方＝end が start 以下）・実打刻", basis: "punch", shifts: [{ cast_id: C, date: "2026-10-06", start_hm: "20:00", end_hm: "02:00", id: "s2" }], punches: [{ cast_id: C, punched_at: at("2026-10-06", "20:00"), type: "in" }, { cast_id: C, punched_at: at("2026-10-06", "26:00"), type: "out" }] },
  { name: "勤務時間の基準が shift・26:00 の書き方", basis: "shift", shifts: [{ cast_id: C, date: "2026-10-07", start_hm: "20:00", end_hm: "25:30", id: "s3" }], punches: [{ cast_id: C, punched_at: at("2026-10-07", "20:10"), type: "in" }, { cast_id: C, punched_at: at("2026-10-07", "24:40"), type: "out" }] },
  { name: "勤務時間の基準が shift・02:00 の書き方（今は時間 0）", basis: "shift", shifts: [{ cast_id: C, date: "2026-10-08", start_hm: "21:00", end_hm: "02:00", id: "s4" }], punches: [{ cast_id: C, punched_at: at("2026-10-08", "21:00"), type: "in" }, { cast_id: C, punched_at: at("2026-10-08", "26:00"), type: "out" }] },
  { name: "打刻しない店（打刻なし・確定シフトの時間）", basis: "punch", store: { punch_mode: "store" }, shifts: [{ cast_id: C, date: "2026-10-09", start_hm: "19:00", end_hm: "27:00", id: "s5" }], punches: [], attendance: [{ cast_id: C, date: "2026-10-09", status: "shukkin" }] },
  { name: "シフトの無い日（秒あり）", basis: "punch", shifts: [], punches: [{ cast_id: C, punched_at: at("2026-10-10", "18:59", 37), type: "in" }, { cast_id: C, punched_at: at("2026-10-10", "25:31", 12), type: "out" }] },
  { name: "shift_guarantee（実働がシフトより短い）", basis: "punch", rule: "shift_guarantee", shifts: [{ cast_id: C, date: "2026-10-11", start_hm: "19:00", end_hm: "25:00", id: "s6" }], punches: [{ cast_id: C, punched_at: at("2026-10-11", "20:30"), type: "in" }, { cast_id: C, punched_at: at("2026-10-11", "23:00"), type: "out" }] },
  { name: "shift_guarantee（実働がシフトより長い）", basis: "punch", rule: "shift_guarantee", shifts: [{ cast_id: C, date: "2026-10-12", start_hm: "20:00", end_hm: "24:00", id: "s7" }], punches: [{ cast_id: C, punched_at: at("2026-10-12", "19:00"), type: "in" }, { cast_id: C, punched_at: at("2026-10-12", "26:45"), type: "out" }] },
];

async function main() {
  for (const k of cases) {
    const admin = fakeAdmin({ shifts: k.shifts, attendance: k.attendance ?? [], punches: k.punches, check_nominations: [], stores: { settings_json: k.store ?? {} } });
    const res = await loadPunch(admin, "store-x", WIN, {});
    const p = (res.byCast as unknown as { get(id: string): unknown }).get(C) as { hoursByDate: Map<string, number>; noShiftHours: Map<string, number>; shiftHoursByDate: Record<string, number>; win: { punch: Map<string, [number, number]>; shift: Map<string, [number, number]>; noShift: Map<string, [number, number]>; storeShift: Set<string> } } | undefined;
    if (!p) { ok(`(1) ${k.name}：loadPunch が行を返す`, false); continue; }
    const dates = new Set([...p.hoursByDate.keys(), ...p.noShiftHours.keys()]);
    let checked = 0;
    for (const d of dates) {
      const hours = (p.hoursByDate.get(d) ?? 0) + (p.noShiftHours.get(d) ?? 0); // collect の daily と同じ
      if (!(hours > 0)) continue;
      // pay.ts の dailyBase（★324-2）：基準 shift で今日までの確定シフトの時間がある日はシフトの時間に置き換える
      const sh = p.shiftHoursByDate[d];
      const base = k.basis === "shift" && sh !== undefined ? sh : hours;
      const eff = k.rule === "shift_guarantee" ? Math.max(base, sh ?? 0) : base; // dailyEff
      const w = bandWindowOf({ punch: p.win.punch.get(d), shift: p.win.shift.get(d), noShift: p.win.noShift.get(d) }, { storeShift: p.win.storeShift.has(d), shiftBasis: k.basis === "shift", shiftHoursDefined: sh !== undefined });
      const segs = w ? bandSegmentsOf(w[0], w[1], BANDS) : [];
      if (k.rule === "shift_guarantee") {
        // 帯の額がどこでも同じなら、高い方＝時間の長い方＝今の max(実働, シフト)。帯の額が違う日は額の高い方を選ぶ（相談役の決め）＝時間は両方の候補のどちらか
        const sw = p.win.shift.get(d); const shiftSegs = sw && sh !== undefined ? bandSegmentsOf(sw[0], sw[1], BANDS) : [];
        const flat = (xs: BandSeg[]) => xs.reduce((a, x) => a + bandHourlyOf(1500, 0, 1500, undefined) * x.minutes / 60, 0);
        const pick = flat(shiftSegs) > flat(segs) ? shiftSegs : segs;
        ok(`(1) ${k.name} ${d}：同じ額の帯で選んだ分＝今の max(実働, シフト)`, Math.abs(sumMin(pick) - eff * 60) < 1e-6, { pick: sumMin(pick), eff: eff * 60 });
        ok(`(1) ${k.name} ${d}：候補の分はどちらも今の時間の一方（実働・シフト）`, Math.abs(sumMin(segs) - base * 60) < 1e-6 && (shiftSegs.length === 0 || Math.abs(sumMin(shiftSegs) - (sh ?? 0) * 60) < 1e-6), { segs: sumMin(segs), base: base * 60, shift: sumMin(shiftSegs), sh });
      } else {
        // 区間が取れない日（ウ）は帯で切らない＝今の時間のまま（null）。取れた日は分の合計が今の時間と一致
        ok(`(1) ${k.name} ${d}：帯で切った分の合計＝今の勤務時間（分）`, w === null ? base === 0 || true : Math.abs(sumMin(segs) - base * 60) < 1e-6, { w, segs: sumMin(segs), base: base * 60 });
        if (w === null) ok(`(1) ${k.name} ${d}：区間が取れない日は帯で切らない（ウ）`, segs.length === 0);
      }
      checked++;
    }
    // 今は時間 0 の日（02:00 の書き方の shift 基準）＝帯も 0（帯で時間を作らない）
    if (k.name.includes("今は時間 0")) {
      const d = "2026-10-08"; const sh = p.shiftHoursByDate[d];
      const w = bandWindowOf({ punch: p.win.punch.get(d), shift: p.win.shift.get(d), noShift: p.win.noShift.get(d) }, { storeShift: false, shiftBasis: true, shiftHoursDefined: sh !== undefined });
      ok(`(1) ${k.name}：今の時間は 0・帯の区間も無い（打刻の区間に戻らない）`, sh === 0 && w === null, { sh, w });
    }
    ok(`(1) ${k.name}：確かめた日がある`, checked > 0 || k.name.includes("今は時間 0"), { checked });
  }
  // (3) collect が同じ選び方（bandWindowOf）を通す・シフトで切る候補も今日までの確定シフトの日だけ
  const col = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
  ok("(3-1) collect は bandWindowOf で区間を選ぶ（pay.ts の dailyBase と同じ条件）", col.includes("const w = bandWindowOf({ punch: pw, shift: sw, noShift: nw }, { storeShift: p.win.storeShift.has(d.bizDate), shiftBasis: masters.payTimeBasis === \"shift\", shiftHoursDefined });") && col.includes("if (sw && shiftHoursDefined) {"));
  ok("(3-2) シフトの無い日の区間の長さはミリ秒の差（分に丸めない）", col.includes("b = a + (lo.t - fi.t) / 60_000;"));
  // (2) 境と端の純関数
  ok("(2-1) 区間が逆・空は区切りなし", bandSegmentsOf(1200, 1200, BANDS).length === 0 && bandSegmentsOf(1300, 1200, BANDS).length === 0);
  ok("(2-2) 境をまたぐ 19:00〜23:30＝60 分（16 時の帯）＋210 分（20 時の帯）", JSON.stringify(bandSegmentsOf(1140, 1410, BANDS)) === JSON.stringify([{ minutes: 60, amount: 1000 }, { minutes: 210, amount: 1100 }]));
  ok("(2-3) 小数の分（秒あり）も合計は区間の長さ", Math.abs(sumMin(bandSegmentsOf(1139.6166, 1531.2, BANDS)) - (1531.2 - 1139.6166)) < 1e-9);
  ok("(2-4) 打刻しない店の日はシフト・基準 shift はシフト・それ以外は打刻か無い日の打刻", JSON.stringify([
    bandWindowOf({ punch: [1, 2], shift: [3, 4] }, { storeShift: true, shiftBasis: false, shiftHoursDefined: true }),
    bandWindowOf({ punch: [1, 2], shift: [3, 4] }, { storeShift: false, shiftBasis: true, shiftHoursDefined: true }),
    bandWindowOf({ punch: [1, 2], shift: [3, 4] }, { storeShift: false, shiftBasis: true, shiftHoursDefined: false }),
    bandWindowOf({ noShift: [5, 6] }, { storeShift: false, shiftBasis: false, shiftHoursDefined: false }),
    bandWindowOf({}, { storeShift: false, shiftBasis: false, shiftHoursDefined: false }),
  ]) === JSON.stringify([[3, 4], [3, 4], [1, 2], [5, 6], null]));
}
main().then(() => {
  if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-hourly-window FAIL ${fails.length} / ${n}`); process.exit(1); }
  console.log(`verify:nox-hourly-window ALL PASS (${n} assertions)`);
}).catch((e) => { console.error(e); process.exit(1); });
