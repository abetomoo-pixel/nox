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

// ★2026-11-19 夜（相談役 ④）: 店舗設定の画面の文言（枝 night1119-sales-basis-ui・push しない）。押す前に確かめる窓の文は相談役の指定の文を含む。
/** 切り替えのボタンの短い名前（375 の幅でも 1 行に収める） */
export const SALES_BASIS_CHOICE_LABEL: Record<SalesBasis, string> = { due: "請求額", subtotal: "小計" };
export const SALES_BASIS_ROW_NOTE = "歩合（売上の何％）とスライド（売上で時給の段が決まる）の判定に使う売上です。請求額＝お客様が払った額（税・サービス料込み）。小計＝サービス料を足す前の額です。税込みで値段を出しているお店は、税を含みます。"; // ★2026-11-20（相談役 ④）: 外税と内税で違わない書き方に・報酬率の母数の行は出さない（③）ので「別の設定」の文は外した
export const SALES_BACK_DEFAULT_ROW_NOTE = "売上に応じて 3〜10％ の歩合を付ける、NOX の既定の表です。使わない店は、お店で決めた歩合（各種バック・報酬プラン）だけが付きます。";
/** 売上の基準を切り替える前に出す文（from→to） */
export function SALES_BASIS_CONFIRM_LINES_OF(from: SalesBasis, to: SalesBasis): string[] {
  return [
    `歩合・スライドの売上の基準を「${SALES_BASIS_CHOICE_LABEL[from]}」から「${SALES_BASIS_CHOICE_LABEL[to]}」に切り替えます。`,
    "まだ確定していない期間から、歩合とスライドの判定に使う売上が変わります。段の額も見直してください。", // ★2026-11-20（相談役 ④）: 「次の締めから」→ 下書きの文と食い違わない語に
    to === "subtotal" ? "小計は請求額より小さくなります（サービス料の分。税を別に足しているお店は税の分も）。同じ段の額のままだと、段に届く人が減ります。" : "請求額は小計より大きくなります（サービス料の分。税を別に足しているお店は税の分も）。同じ段の額のままだと、段に届く人が増えます。",
    "確定済みの明細は変わりません。まだ締めていない期間の給与の下書きは、次に開いたときから新しい基準で計算します。",
  ];
}
/** 既定の売上歩合を使う／使わないを切り替える前に出す文 */
export function SALES_BACK_DEFAULT_CONFIRM_LINES_OF(nextUse: boolean): string[] {
  return [
    nextUse ? "既定の売上歩合（売上に応じて 3〜10％）を使います。" : "既定の売上歩合（売上に応じて 3〜10％）を使わないようにします。",
    nextUse ? "まだ確定していない期間から、売上歩合が付く人が増えます。" : "まだ確定していない期間から、既定の売上歩合が付かなくなります。お店で決めた歩合（各種バック・報酬プラン）は今のまま付きます。",
    "確定済みの明細は変わりません。まだ締めていない期間の給与の下書きは、次に開いたときから新しい設定で計算します。",
  ];
}
