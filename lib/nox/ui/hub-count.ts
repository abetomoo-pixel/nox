// ★Z152（2026-09-25・Agoora 15:43 のスクショ）: /master 概要の件数カードは取得完了前に数値を描かない（「—」）。0 は取得完了後の実 0 だけ。
//   取得失敗は「—」＋薄字「取得できませんでした」。紹介者カード（referral_payouts の count）も同じ型に統一。
export type HubLoadState = "loading" | "ok" | "error";

/** 件数の表示: loading／error＝「—」（数値を出さない）・ok＝実数（0 を含む） */
export function hubCountOf(state: HubLoadState, n: number, unit = ""): { text: string; note: string | null } {
  if (state === "ok") return { text: `${n}${unit}`, note: null };
  return { text: "—", note: state === "error" ? "取得できませんでした" : null };
}

/** 状態行（● …）: loading／error は数値を含む文言を出さない */
export function hubStatusOf(state: HubLoadState, okText: string): string {
  if (state === "ok") return okText;
  return state === "error" ? "● 取得できませんでした" : "● —";
}
