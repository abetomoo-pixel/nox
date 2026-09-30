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
