// ★起票170（相談役 11/26 の便 M の M2-8・起票162 も閉じる）: 休憩を勤怠に出す（純関数・DB を知らない）。
//   材料＝punch_breaks の行（0214）。1 日の休憩の時刻（開始〜終了）・合計の分・閉じていない休憩の扱いを、店長の勤怠の表・/mine・シフトの画面・明細が同じ言葉で出す。
//   合計の分＝給与と同じ数（日の窓 dayWindowOf が引いた分＝勤怠の表の adj.breakMin）があればそれ・無い日（退勤なし・時間から引かない店）は生の時刻の和。
//   閉じていない休憩（ended_at null）の扱い（0214 を読んだ答え）：
//     その営業日の休憩中の退勤は DB が断る（punch_seq_check／staff_punch の 'on break'＝先に「休憩終了」）。
//     それでも退勤が入った日（店の時刻修正などで退勤を足した日）は、計算の側で休憩開始〜退勤を休憩にする（dayWindowOf の openBreak・給与の要対応に 1 行）
//     ＝画面は「休憩を終えずに退勤（退勤の時刻で終了扱い）」。退勤も無い過去の日は「休憩の終了も退勤も記録なし」（店の直し break_set は終了が必須＝直しで閉じる）。
import { minOfBizDay } from "./day-window";
import { hm2min, min2hm } from "../shift-time";

/** punch_breaks の 1 行（day-adj-load の DayAdjSource.breaks と同じ形） */
export type BreakRaw = { castId: string | null; membershipId: string | null; bizDate: string; startedAt: string; endedAt: string | null };
/** 閉じていない休憩の扱い：none＝全部閉じている・on_break＝今日の休憩中・closed_at_out＝終えずに退勤（退勤の時刻で終了扱い）・no_out＝終了も退勤も無い過去の日 */
export type BreakOpenKind = "none" | "on_break" | "closed_at_out" | "no_out";
/** 休憩の 1 回（営業日の 0〜47 時の 'HH:MM'・終了なし＝null・分は数えられないとき null） */
export type BreakSpanView = { startHm: string; endHm: string | null; min: number | null };
/** 1 人 1 営業日の休憩。counted＝勤務時間から引く店（確定シフトどおり・打刻しない店は false） */
export type BreakDayView = { bizDate: string; spans: BreakSpanView[]; totalMin: number; open: BreakOpenKind; counted: boolean };

export const BREAK_OPEN_JA: Record<Exclude<BreakOpenKind, "none">, string> = {
  on_break: "休憩中",
  closed_at_out: "休憩を終えずに退勤（退勤の時刻で終了扱い）",
  no_out: "休憩の終了も退勤も記録なし（店の直しで終了を入れてください）",
};
export const BREAK_NOT_COUNTED_NOTE = "この店は確定シフトどおり（または打刻しない）の計算のため、休憩は勤務時間から引いていません";

/** 0〜47 時の 'HH:MM' → 「翌01:30」（24 時以上）。勤怠の表の hm47Ja と同じ書き方 */
export const breakHmJa = (hm: string): string => { const m = hm2min(hm); return m >= 1440 ? `翌${min2hm(m % 1440)}` : hm; };

/** 1 人 1 営業日の休憩の見え方。行が無ければ null。outHm＝その日の最後の退勤（0〜47 時・無ければ null）・appliedMin＝給与と同じ数（勤怠の表の adj.breakMin・無ければ null） */
export function breakDayViewOf(input: { bizDate: string; breaks: readonly Pick<BreakRaw, "startedAt" | "endedAt">[]; outHm: string | null; todayBiz: string; counted: boolean; appliedMin?: number | null }): BreakDayView | null {
  if (input.breaks.length === 0) return null;
  const outMin = input.outHm ? hm2min(input.outHm) : null;
  const sorted = [...input.breaks].map((b) => ({ s: minOfBizDay(b.startedAt, input.bizDate), e: b.endedAt ? minOfBizDay(b.endedAt, input.bizDate) : null })).sort((a, b) => a.s - b.s);
  let anyOpen = false;
  const spans: BreakSpanView[] = sorted.map(({ s, e }) => {
    if (e === null) { anyOpen = true; return { startHm: min2hm(Math.max(0, s)), endHm: null, min: outMin !== null ? Math.max(0, outMin - s) : null }; }
    return { startHm: min2hm(Math.max(0, s)), endHm: min2hm(Math.max(0, e)), min: Math.max(0, e - s) };
  });
  const raw = spans.reduce((a, x) => a + (x.min ?? 0), 0);
  const open: BreakOpenKind = !anyOpen ? "none" : outMin !== null ? "closed_at_out" : input.bizDate >= input.todayBiz ? "on_break" : "no_out";
  const totalMin = input.counted && typeof input.appliedMin === "number" ? input.appliedMin : raw;
  return { bizDate: input.bizDate, spans, totalMin, open, counted: input.counted };
}

/** 1 人分（cast_id か membership_id）の営業日ごとの休憩（日付の昇順）。dayOf＝その日の退勤と給与と同じ分 */
export function breakDayViewsOf(breaks: readonly BreakRaw[], personId: string, dayOf: (bizDate: string) => { outHm: string | null; appliedMin?: number | null }, todayBiz: string, counted: boolean): BreakDayView[] {
  const byDate = new Map<string, BreakRaw[]>();
  for (const b of breaks) {
    if ((b.castId ?? b.membershipId) !== personId) continue;
    (byDate.get(b.bizDate) ?? byDate.set(b.bizDate, []).get(b.bizDate)!).push(b);
  }
  const out: BreakDayView[] = [];
  for (const d of [...byDate.keys()].sort()) {
    const info = dayOf(d);
    const v = breakDayViewOf({ bizDate: d, breaks: byDate.get(d)!, outHm: info.outHm, todayBiz, counted, appliedMin: info.appliedMin ?? null });
    if (v) out.push(v);
  }
  return out;
}

/** 勤怠の表の行（adj.breaks＝生の時刻・adj.breakMin・adj.openBreak）から作る見え方＝/mine の「今月の勤怠」の表など、休憩の行を別に読まない所の受け皿 */
export function breakDayViewOfAdj(r: { bizDate: string; outHm: string | null; adj?: { breakMin: number; openBreak: boolean; breaks?: [string, string | null][] } }): BreakDayView | null {
  const a = r.adj; if (!a || !a.breaks || a.breaks.length === 0) return null;
  const outMin = r.outHm ? hm2min(r.outHm) : null;
  const spans: BreakSpanView[] = [...a.breaks].sort((x, y) => hm2min(x[0]) - hm2min(y[0])).map(([s, e]) => ({ startHm: s, endHm: e, min: e !== null ? Math.max(0, hm2min(e) - hm2min(s)) : outMin !== null ? Math.max(0, outMin - hm2min(s)) : null }));
  const anyOpen = spans.some((x) => x.endHm === null);
  return { bizDate: r.bizDate, spans, totalMin: a.breakMin, open: !anyOpen ? "none" : outMin !== null ? "closed_at_out" : "no_out", counted: true };
}

/** 1 回の休憩の文字「22:00〜22:30（30 分）」「23:00〜（終了なし）」 */
export const breakSpanTextOf = (s: BreakSpanView): string =>
  `${breakHmJa(s.startHm)}〜${s.endHm ? breakHmJa(s.endHm) : "（終了なし）"}${s.min !== null && s.endHm ? `（${s.min} 分）` : ""}`;
/** 日の見出し「休憩 30 分」・休憩中は「休憩中（22:00〜）」・閉じ忘れは扱いを添える */
export function breakDaySummaryOf(v: BreakDayView): string {
  if (v.open === "on_break") { const o = v.spans.find((x) => x.endHm === null); return `休憩中（${o ? breakHmJa(o.startHm) : ""}〜）${v.totalMin > 0 ? `・休憩 ${v.totalMin} 分` : ""}`; }
  const base = `休憩 ${v.totalMin} 分${v.spans.length > 1 ? `（${v.spans.length} 回）` : ""}`;
  return v.open === "none" ? base : `${base}・${BREAK_OPEN_JA[v.open]}`;
}
/** 月（または期）の合計＝日の合計の和（未来日は無い前提）・休憩のあった日数 */
export function breakMonthTotalOf(views: readonly BreakDayView[]): { min: number; days: number; openN: number } {
  return { min: views.reduce((a, v) => a + v.totalMin, 0), days: views.filter((v) => v.spans.length > 0).length, openN: views.filter((v) => v.open === "closed_at_out" || v.open === "no_out").length };
}
export const breakMonthLabelOf = (t: { min: number; days: number; openN: number }): string | null =>
  t.days === 0 ? null : `休憩 計 ${t.min} 分（${t.days} 日）${t.openN > 0 ? `・終了なし ${t.openN} 日` : ""}`;
/** 店の直し（break_set の画面）の初期値＝生の時刻（終了なしは null） */
export const breakEditSpansOf = (v: BreakDayView | null | undefined): [string, string | null][] | undefined => (v ? v.spans.map((s) => [s.startHm, s.endHm] as [string, string | null]) : undefined);

/** break_set の断り（0214 の raise）→ 日本語。共通の写像（rpcErrJa）は 'overlap'／'reason required'／'bad row' を別の画面の言葉に写すため、休憩の直しはここを先に引く */
const BREAK_SET_ERR: Array<[RegExp, string]> = [
  [/reason required/, "直す理由を入れてください"],
  [/outside work/, "休憩は出勤から退勤のあいだに入れてください"],
  [/overlap/, "休憩の時間が重なっています"],
  [/not on duty/, "この日は出勤の打刻が無いため休憩を入れられません"],
  [/bad rows/, "休憩は 10 回までです"],
  [/bad row/, "休憩の時刻を確かめてください（終わりは始まりより後・終了は必須）"],
  [/confirmed/, "確定済みの月のため直せません"],
  [/billing locked/, "ご契約の状態により、この操作は現在できません"],
  [/forbidden/, "権限がありません（オーナーか自店の店長だけ直せます）"],
];
export function breakSetErrJa(msg: string | null | undefined): string | null {
  const m = String(msg ?? "");
  for (const [re, ja] of BREAK_SET_ERR) if (re.test(m)) return ja;
  return null;
}

/** シフトの画面の「休憩中」＝その営業日の閉じていない休憩がある cast（退勤のある人は除く＝閉じ忘れは勤怠の表で出す） */
export function onBreakCastIdsOf(rows: readonly { cast_id: string | null; ended_at: string | null }[], outCastIds: ReadonlySet<string> = new Set()): Set<string> {
  const s = new Set<string>();
  for (const r of rows) if (r.cast_id && r.ended_at === null && !outCastIds.has(r.cast_id)) s.add(r.cast_id);
  return s;
}
export const ON_BREAK_BADGE = "休憩中";

/** 明細の注記（0 円の extras・凍結 breakdown_json に残る）＝勤務の時間から休憩を引いた人だけ。丸めの注記（punch_round_note）と同じ形 */
export const PUNCH_BREAK_NOTE_KIND = "punch_break_note";
export const punchBreakNoteExtraOf = (n: { min: number; days: number }): { kind: string; amount: number; label: string; minutes: number } =>
  ({ kind: PUNCH_BREAK_NOTE_KIND, amount: 0, label: `勤務時間は休憩 ${n.min} 分を除いています（${n.days} 日）`, minutes: n.min });
/** 明細の時間の行の下の 1 行「勤務 5.5 時間（休憩 30 分を除く）」 */
export const workHoursBreakLineOf = (wHours: number, breakMin: number): string => `　勤務 ${Math.round(wHours * 10) / 10} 時間（休憩 ${breakMin} 分を除く）`;
