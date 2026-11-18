// ★2026-11-18 夜（相談役 ③）: 歩合・スライドの売上の基準（店の鍵 sales_basis＝'due' 請求額／'subtotal' 小計）と、既定の売上歩合を止める鍵（sales_back_default_off）。
//   0201q（2026-11-18 16:53 手貼り）で保存の口ができた。鍵が無い店は今までと 1 円も変わらない（get_cast_sales・既定の売上歩合のまま）。DB を知らない純関数。
export type SalesBasis = "due" | "subtotal";
export const SALES_BASIS_LABEL: Record<SalesBasis, string> = { due: "請求額（サ・税込み）", subtotal: "小計（税・サ料の前）" };
export function salesBasisOf(settings: Record<string, unknown> | null | undefined, on: boolean): SalesBasis {
  return on && settings?.sales_basis === "subtotal" ? "subtotal" : "due";
}
/** 売上を読む RPC＝小計の店は get_cast_sales_subtotal（0201q）・ほかは get_cast_sales（今まで） */
export const salesRpcOf = (basis: SalesBasis): "get_cast_sales" | "get_cast_sales_subtotal" => (basis === "subtotal" ? "get_cast_sales_subtotal" : "get_cast_sales");
/** 既定の売上歩合（3〜10%）を止めるか（店の鍵 sales_back_default_off＝true）。各種バック（sys_backs）の OFF とは別＝明細の行は隠さない */
export const salesBackDefaultOffOf = (settings: Record<string, unknown> | null | undefined, on: boolean): boolean => on && settings?.sales_back_default_off === true;
