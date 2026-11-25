// ★起票159（0213・勤務時間の丸め）＋起票158 の 2（0214・休憩の打刻）（相談役 11/25 の D4・D5）: 1 日の勤務の窓を作る純関数（DB を知らない）。
//   丸め・休憩・時間帯の時給（hourly-bands の bandWindowOf／bandSegmentsOf）が同じ窓を読む＝給与（collect）・勤怠の表（attendance-sheet）・/mine が同じ数になる。
//   軸＝営業日の中の分（0〜47 時・締めより前は +24 時間＝打刻とシフトと同じ）。秒は切り捨ててから丸める（NOX の今の数え方＝liftPunchAt の S6）。
//   丸めの向き（BANZEN makanai-shift/lib/attendance.ts 107〜111 行と同じ）：働く人に有利＝出勤 切り下げ・退勤 切り上げ・休憩の開始 切り上げ・休憩の終了 切り下げ／店に有利＝その逆／四捨五入＝全部近いほう（ちょうど半分は切り上げ）。
//   出勤と退勤は別々に丸める（合計は丸めない）。丸めで前後が逆になったら直前の時刻にそろえる（0 分・負にしない）。
//   当てない（null を渡す）：単位 1 の店・勤務時間の基準が確定シフト（'shift'）の店・打刻しない店（punch_mode 'store'）・その日に効く丸めの行が無い日。
//   遅刻・早退・不足の控除は生の時刻のまま（この関数は時間を数える所だけ）。退勤の無い日は窓なし（0 時間のまま）。
//   休憩：閉じていない休憩（終了の打刻なし）は退勤までを休憩にする（openBreak＝要対応に 1 行）。窓の外の休憩は切る・重なりは 1 つにまとめる。
import type { PunchRoundMode } from "./round-form";
import { min2hm } from "../shift-time";

export type PunchRounding = { unit: number; mode: PunchRoundMode };
export type RoundKind = "in" | "out" | "break_start" | "break_end";
/** 丸めの履歴の 1 行（punch_round_rules＝0213）。effective_from の営業日から効く */
export type RoundRule = { effective_from: string; unit: number; mode: PunchRoundMode };
/** 休憩の 1 区間（営業日の分・endMin null＝休憩中＝閉じていない） */
export type BreakSpan = { startMin: number; endMin: number | null };
export type DayAdj = { rounding: PunchRounding | null; breaks: readonly BreakSpan[] };
export type DayWindow = { inMin: number; outMin: number; segs: [number, number][]; workMin: number; breakMin: number; openBreak: boolean };

const DIR: Record<PunchRoundMode, Record<RoundKind, "floor" | "ceil" | "round">> = {
  staff_favor: { in: "floor", out: "ceil", break_start: "ceil", break_end: "floor" },
  store_favor: { in: "ceil", out: "floor", break_start: "floor", break_end: "ceil" },
  nearest: { in: "round", out: "round", break_start: "round", break_end: "round" },
};

/** 営業日の分を丸める（単位 1 以下・null は素通し） */
export function roundMinOf(min: number, kind: RoundKind, r: PunchRounding | null | undefined): number {
  if (!r || !(r.unit > 1)) return min;
  const u = r.unit, d = DIR[r.mode]?.[kind] ?? "round";
  return d === "floor" ? Math.floor(min / u) * u : d === "ceil" ? Math.ceil(min / u) * u : Math.round(min / u) * u;
}
/** 'HH:MM'（0〜47 時）を丸めた 'HH:MM' */
export const roundHmOf = (hm: string, kind: RoundKind, r: PunchRounding | null | undefined): string => {
  const [h, m] = hm.split(":").map(Number);
  return min2hm(roundMinOf(h * 60 + m, kind, r));
};

/** その営業日に効く丸め（effective_from ≦ 営業日の最後の行）。行が無い・単位 1 は null（丸めない） */
export function roundingAtOf(rules: readonly RoundRule[], bizDate: string): PunchRounding | null {
  let pick: RoundRule | null = null;
  for (const r of rules) if (r.effective_from <= bizDate && (!pick || r.effective_from > pick.effective_from)) pick = r;
  return pick && pick.unit > 1 ? { unit: pick.unit, mode: pick.mode } : null;
}
/** 丸め・休憩を時間に当てる店か（確定シフトどおりの店・打刻しない店は当てない＝シフトの無い日も） */
export const dayAdjAppliesOf = (o: { payTimeBasis?: string | null; punchMode?: string | null }): boolean => o.payTimeBasis !== "shift" && o.punchMode !== "store";

/** 営業日 bizDate（'YYYY-MM-DD'）の 0 時（JST）からの分（秒は切り捨て）＝0〜47 時の軸。休憩の開始・終了を同じ営業日の軸に載せる（締めをまたいでも帰属の営業日で数える） */
export function minOfBizDay(atIso: string, bizDate: string): number {
  const base = Date.parse(`${bizDate}T00:00:00+09:00`);
  return Math.floor((Date.parse(atIso) - base) / 60_000);
}

/** 1 日の勤務の窓。in・out のどちらかが無い日は null（0 時間）。adj の丸め・休憩が無ければ [in, out] そのまま（今の dayWorkedHours と同じ分） */
export function dayWindowOf(inMin: number | null, outMin: number | null, adj: Partial<DayAdj> | null = null): DayWindow | null {
  if (inMin === null || outMin === null) return null;
  const r = adj?.rounding ?? null;
  const a = roundMinOf(inMin, "in", r);
  let b = roundMinOf(outMin, "out", r);
  if (b < a) b = a;                                                   // 順序の締め（負にしない）
  let openBreak = false;
  const spans: [number, number][] = [];
  for (const br of adj?.breaks ?? []) {
    let s = roundMinOf(br.startMin, "break_start", r);
    let e: number;
    if (br.endMin === null) { openBreak = true; e = b; } else e = roundMinOf(br.endMin, "break_end", r);
    s = Math.max(a, Math.min(b, s));
    e = Math.max(s, Math.min(b, e));                                  // 窓の外は切る・逆は 0 分
    if (e > s) spans.push([s, e]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const sp of spans) { const last = merged[merged.length - 1]; if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]); else merged.push([sp[0], sp[1]]); }
  const segs: [number, number][] = [];
  let cur = a;
  for (const [s, e] of merged) { if (s > cur) segs.push([cur, s]); cur = Math.max(cur, e); }
  if (b > cur) segs.push([cur, b]);
  const workMin = segs.reduce((x, [s, e]) => x + (e - s), 0);
  const breakMin = merged.reduce((x, [s, e]) => x + (e - s), 0);
  return { inMin: a, outMin: b, segs, workMin, breakMin, openBreak };
}

/** 窓の表示（勤怠の表のセル）＝丸めた時刻が生と違う日だけ「20:07→20:15」 */
export const roundedCellOf = (rawHm: string, roundedHm: string | null | undefined, fmt: (hm: string) => string = (x) => x): string =>
  roundedHm && roundedHm !== rawHm ? `${fmt(rawHm)}→${fmt(roundedHm)}` : fmt(rawHm);
