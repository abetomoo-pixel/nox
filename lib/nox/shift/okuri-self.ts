// ★裁定319／319 追補1（0158・便 AB-4／AB-5）: 退勤時の「送り あり」を本人（/mine）・打刻端末（/kiosk）から発行するときの判定（純関数・DB を知らない）。
//   金額は店設定の送りの基本額（okuri_base_amount）をサーバが決める＝画面は表示だけ（変更不可）。
//   okuri_mode='flat'（一律）の店は口を出さない。基本額が未設定（null／0）の店は発行せず、打刻の「送り あり」だけ残す（店が締めで確定）。
// ★裁定414（S-4・便 S）: 方式は 4 つ（actual／flat／store／none）＝'none' 以外で聞く。文言は方式の 1 文（okuri-mode.ts）。「発行」は使わない（「記録」）。
import { okuriAsks, okuriModeOf, okuriRecordedTextOf, type OkuriMode } from "./okuri-mode";
export const OKURI_PENDING_NOTE = "送りは店が締めで確定します";

export type OkuriState = { okuri_mode?: unknown; okuri_base_amount?: unknown } | null | undefined;
export type OkuriSelfPlan = {
  /** 退勤の前に「送り あり／なし」を聞くか（actual の店だけ） */
  ask: boolean;
  /** 「あり」のとき送り実費を発行するか（基本額が正の整数のときだけ） */
  issue: boolean;
  /** 表示する金額（記録しないときは null） */
  amount: number | null;
  /** ★裁定414: 店の方式（文言の出し分け） */
  mode: OkuriMode;
};

export function okuriSelfPlanOf(state: OkuriState): OkuriSelfPlan {
  const mode = okuriModeOf((state ?? null) as Record<string, unknown> | null);
  if (!state || !okuriAsks(mode)) return { ask: false, issue: false, amount: null, mode }; // ★裁定414: 'none' だけ聞かない（従来は actual だけ）
  const b = state.okuri_base_amount;
  const amount = typeof b === "number" && Number.isInteger(b) && b > 0 ? b : null;
  return { ask: true, issue: amount !== null, amount, mode };
}

/** 退勤後の文言。issued＝送り実費の発行が通った／pending＝発行しない・できなかった（店が締めで確定） */
export function okuriResultTextOf(okuri: boolean, outcome: "issued" | "pending" | "none", amount: number | null, mode: OkuriMode = "actual"): string {
  if (!okuri || outcome === "none") return "退勤を打刻しました";
  if (outcome === "issued" && amount !== null) return `退勤を打刻しました（${okuriRecordedTextOf(mode, amount)}）`; // ★裁定414: 方式の 1 文
  return `退勤を打刻しました（${OKURI_PENDING_NOTE}）`;
}
