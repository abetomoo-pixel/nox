// ★裁定319／319 追補1（0158・便 AB-4／AB-5）: 退勤時の「送り あり」を本人（/mine）・打刻端末（/kiosk）から発行するときの判定（純関数・DB を知らない）。
//   金額は店設定の送りの基本額（okuri_base_amount）をサーバが決める＝画面は表示だけ（変更不可）。
//   okuri_mode='flat'（一律）の店は口を出さない。基本額が未設定（null／0）の店は発行せず、打刻の「送り あり」だけ残す（店が締めで確定）。
export const OKURI_PENDING_NOTE = "送りは店が締めで確定します";

export type OkuriState = { okuri_mode?: unknown; okuri_base_amount?: unknown } | null | undefined;
export type OkuriSelfPlan = {
  /** 退勤の前に「送り あり／なし」を聞くか（actual の店だけ） */
  ask: boolean;
  /** 「あり」のとき送り実費を発行するか（基本額が正の整数のときだけ） */
  issue: boolean;
  /** 表示する金額（発行しないときは null） */
  amount: number | null;
};

export function okuriSelfPlanOf(state: OkuriState): OkuriSelfPlan {
  if (!state || state.okuri_mode !== "actual") return { ask: false, issue: false, amount: null };
  const b = state.okuri_base_amount;
  const amount = typeof b === "number" && Number.isInteger(b) && b > 0 ? b : null;
  return { ask: true, issue: amount !== null, amount };
}

/** 退勤後の文言。issued＝送り実費の発行が通った／pending＝発行しない・できなかった（店が締めで確定） */
export function okuriResultTextOf(okuri: boolean, outcome: "issued" | "pending" | "none", amount: number | null): string {
  if (!okuri || outcome === "none") return "退勤を打刻しました";
  if (outcome === "issued" && amount !== null) return `退勤を打刻しました（送り ¥${amount.toLocaleString()} を記録しました）`;
  return `退勤を打刻しました（${OKURI_PENDING_NOTE}）`;
}
