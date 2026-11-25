// ★裁定326 追補3（便 M1-4・2026-09-30）: /mine 打刻カードの 3 状態を「当日営業日の自分の打刻」から導く純関数（DB を知らない）。
//   判定は RPC（0161 punch_seq_check）と同じ＝当日営業日の最終打刻が in なら「出勤中」・out なら「退勤済み」・無ければ「未出勤」。
//   前営業日以前の未閉鎖 in は当日の打刻に含まれない＝UI でも「未出勤」（RPC も塞がない）。渡す配列は呼び出し側が営業日窓で絞る（/mine の todayPunches）。
import { hmJstOf } from "./today-row";

export type PunchState = "none" | "open" | "closed";
export type TodayPunch = { type: string; punched_at: string };

/** 当日営業日の打刻列 → 状態と出勤時刻（順不同でよい・punched_at で最終を決める） */
export function punchStateOf(punches: readonly TodayPunch[]): { state: PunchState; inAt: string | null } {
  if (punches.length === 0) return { state: "none", inAt: null };
  let last = punches[0];
  for (const p of punches) if (Date.parse(p.punched_at) >= Date.parse(last.punched_at)) last = p;
  if (last.type === "in") return { state: "open", inAt: last.punched_at };
  return { state: "closed", inAt: null };
}

/** ボタンの活性: 未出勤＝出勤のみ／出勤中＝退勤と送り／退勤済み＝両方不活性 */
export function punchButtonsOf(state: PunchState): { inEnabled: boolean; outEnabled: boolean; okuriEnabled: boolean } {
  return { inEnabled: state === "none", outEnabled: state === "open", okuriEnabled: state === "open" };
}

/** ★起票158 の 1（2026-11-24 夜・相談役 N1）: 出すボタン＝出勤していないときは「出勤」だけ・出勤中は「退勤」だけ・退勤済みはどちらも出さない（押せないボタンを並べない） */
export function punchButtonsShownOf(state: PunchState): { in: boolean; out: boolean } {
  return { in: state === "none", out: state === "open" };
}
/** ★起票158 の 1: 端末（キオスク）のスタッフ＝今日の最後の打刻（kiosk_staff_list の last_kind）から。出勤中（最後が in）＝退勤だけ・それ以外＝出勤だけ
 *  （スタッフは同じ日に何回でも出勤し直せる＝staff_punch は最後が out なら in を通す＝退勤の後も出勤を出す）。キャストは状態を持たない＝両方（known＝false） */
export function kioskButtonsShownOf(lastKind: string | null | undefined, known: boolean): { in: boolean; out: boolean } {
  if (!known) return { in: true, out: true };
  return lastKind === "in" ? { in: false, out: true } : { in: true, out: false };
}

/** 補助文（出勤中は見出し横の「出勤中 HH:MM〜」＝punchHeadOf） */
export const PUNCH_STATE_NOTE: Record<PunchState, string | null> = {
  none: "出勤打刻がありません",
  open: null,
  closed: "本日は退勤済みです。修正は店にご連絡ください",
};

/** 見出し横の文言（出勤中だけ） */
export function punchHeadOf(state: PunchState, inAt: string | null): string | null {
  return state === "open" && inAt ? `出勤中 ${hmJstOf(inAt)}〜` : null;
}

/** ★M-85（2026-11-05）: /mine 打刻枠の先頭の 1 行＝今日の確定シフト。未出勤＝「今日の出勤 20:00〜翌02:00（あと 4 時間 30 分）」（残りは 15 分単位に丸め・開始を過ぎたら「開始から ○分 経過」）・
 *  出勤中＝「出勤 19:35（退勤予定 翌02:00）」・退勤済み＝「今日の出勤 20:00〜翌02:00（退勤済み）」・確定シフトが無い日＝「今日のシフトはありません」。hm は 0〜47 時（翌は hm47Ja と同じ表記）。 */
export function todayShiftLineOf(p: { shift: { start_hm: string; end_hm: string } | null; state: PunchState; inAt: string | null; nowMs: number; bizToday: string }): string {
  const hm47 = (hm: string): string => { const [h, m] = hm.split(":").map(Number); return h >= 24 ? `翌${String(h - 24).padStart(2, "0")}:${String(m).padStart(2, "0")}` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
  if (!p.shift) return "今日のシフトはありません";
  const span = `${hm47(p.shift.start_hm)}〜${hm47(p.shift.end_hm)}`;
  if (p.state === "open" && p.inAt) return `出勤 ${hmJstOf(p.inAt)}（退勤予定 ${hm47(p.shift.end_hm)}）`;
  if (p.state === "closed") return `今日の出勤 ${span}（退勤済み）`;
  const [sh, sm] = p.shift.start_hm.split(":").map(Number);
  const startMs = Date.parse(`${p.bizToday}T00:00:00+09:00`) + (sh * 60 + sm) * 60_000;
  const diffMin = Math.round((startMs - p.nowMs) / 60_000);
  if (diffMin > 0) { const r = Math.round(diffMin / 15) * 15; const h = Math.floor(r / 60), m = r % 60; return `今日の出勤 ${span}（あと ${h > 0 ? `${h} 時間` : ""}${h > 0 && m > 0 ? " " : ""}${m > 0 || h === 0 ? `${m} 分` : ""}）`; }
  return `今日の出勤 ${span}（開始から ${-diffMin} 分 経過）`;
}

// ★0214（起票158 の 2 休憩の打刻・相談役 11/25 の D5）: 休憩のボタンの出し分け（DB を知らない純関数）。
//   出勤中＝「休憩」「退勤」・休憩中＝「休憩終了」だけ・未出勤＝「出勤」。休憩を使わない店は「休憩」を出さない（休憩中の人の「休憩終了」は OFF の後も出す）。
/** 端末が名前を押した時に読む状態（kiosk_break_state）。none＝未出勤・on＝出勤中・break＝休憩中・done＝今日の最後が退勤 */
export type KioskPersonState = "none" | "on" | "break" | "done";
export type BreakButtons = { in: boolean; out: boolean; breakStart: boolean; breakEnd: boolean };
/** 端末のボタン（旗 MIG_0214_APPLIED の後ろ）。st が null（読めない・旗 false）は今の出し分け（kioskButtonsShownOf）のまま。キャストは 1 営業日に 1 回だけ出勤（退勤の後は何も出さない）・スタッフは出勤し直せる */
export function kioskBreakButtonsOf(st: { state: KioskPersonState; breakEnabled: boolean } | null, o: { staff: boolean; lastKind?: string | null }): BreakButtons {
  if (!st) { const b = kioskButtonsShownOf(o.lastKind, o.staff); return { in: b.in, out: b.out, breakStart: false, breakEnd: false }; }
  if (st.state === "break") return { in: false, out: false, breakStart: false, breakEnd: true };
  if (st.state === "on") return { in: false, out: true, breakStart: st.breakEnabled, breakEnd: false };
  if (st.state === "done") return { in: o.staff, out: false, breakStart: false, breakEnd: false };
  return { in: true, out: false, breakStart: false, breakEnd: false };
}
/** 本人のスマホ（/mine）の状態に休憩中を足す：出勤中で閉じていない休憩がある＝break */
export type MinePunchState = PunchState | "break";
export const minePunchStateOf = (state: PunchState, openBreak: boolean): MinePunchState => (state === "open" && openBreak ? "break" : state);
/** /mine のボタン：出勤中＝退勤・送り・休憩（使う店）／休憩中＝休憩終了だけ */
export function mineBreakButtonsOf(state: MinePunchState, breakEnabled: boolean): { inEnabled: boolean; outEnabled: boolean; okuriEnabled: boolean; breakStart: boolean; breakEnd: boolean } {
  if (state === "break") return { inEnabled: false, outEnabled: false, okuriEnabled: false, breakStart: false, breakEnd: true };
  const b = punchButtonsOf(state);
  return { ...b, breakStart: state === "open" && breakEnabled, breakEnd: false };
}
export const BREAK_ACTION_LABEL = { start: "休憩", end: "休憩終了" } as const;
export const BREAK_DONE_LABEL = { start: "休憩に入りました", end: "休憩を終えました" } as const;
export const KIOSK_DONE_NOTE = "本日は退勤済みです（修正は店にご連絡ください）";
