import { roundYen } from "./money";

// 表示用の group 請求額計算（DB の check_round_amount / check_group_due と同一規則）。
// ★権威はサーバ: check_pay の残額検証・check_close の充足判定は DB 側が行う。
//   ここは UI の「残額表示」専用（ズレていれば RPC が exceeds balance / balance remaining で拒否する）。
export type CheckRoundSettings = {
  service_rate: number;
  round_unit: number;
  round_mode: "up" | "down" | "round" | string;
};

export function roundAmount(amount: number, unit: number, mode: string): number {
  if (unit <= 1) return Math.round(amount);
  const q = amount / unit;
  return (mode === "up" ? Math.ceil(q) : mode === "down" ? Math.floor(q) : Math.round(q)) * unit;
}

/** due(group) = Tp(Bx + round(Bx × service_rate%))。Bx=0 は 0。 */
export function groupDue(bx: number, s: CheckRoundSettings): number {
  if (bx === 0) return 0;
  return roundAmount(bx + roundYen((bx * s.service_rate) / 100), s.round_unit, s.round_mode);
}
