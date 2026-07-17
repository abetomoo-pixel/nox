import { roundYen } from "./money";

// 表示用の group 請求額計算（DB の check_round_amount / check_group_due と同一規則）。
// ★権威はサーバ: check_pay の残額検証・check_close の充足判定は DB 側が行う。
//   ここは UI の「残額表示」専用（ズレていれば RPC が exceeds balance / balance remaining で拒否する）。
//   F4b からレシート poll route（app/api/print/poll）も本鏡像で group_due を算出
//   （check_group_due の EXECUTE は postgres のみ＝service_role から呼べないため・closed 伝票は金額不変で決定的）。
// ★F5（軽減税率 8%）導入時の同時改修3点セット（台帳）:
//   check_group_due（DB）・本ファイル鏡像・receipt.ts（税率別内訳）を必ず同時に改修する
//   （どれか一方だけ触ると DB/表示/レシートの金額定義が乖離する）。
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
