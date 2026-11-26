// ★起票65（相談役 11/26 22:10 夜便 N 改・段ア）: 「時給・最低保証」が OFF の店では「基本・保証」の節（プラン名の欄と作成のボタン）が描かれず、
//   新しい待遇プランを作れなかった。画面だけ＝描かれている最初の節（基本・保証 → 各種バック → スライド）でプランを作る。
//   送る値は今のまま（set_comp_plan は全部の値を一度に送る＝基本給は新しいプランの既定 0＝時給は付かない）。お金の式・関数は変えない。純関数。

/** savePlan の section 名（節の保存ボタンの「◯◯を保存」） */
export type PlanCreateSection = "基本給・保証" | "各種バック" | "スライド";

/** 新しいプランを作る節＝描かれている最初の節。どれも描かれなければ null（作れない） */
export function planCreateSectionOf(on: { base: boolean; backs: boolean; slides: boolean }): PlanCreateSection | null {
  return on.base ? "基本給・保証" : on.backs ? "各種バック" : on.slides ? "スライド" : null;
}

/** 新規プランの誘導の 1 文 */
export const planCreateGuideOf = (sec: PlanCreateSection | null): string =>
  sec ? `プラン名を入力して「${sec}を保存」を押すとプランが作成されます（他の節はその後に保存できます）。` : "この店の報酬制度では、ここから新しいプランを作れません（店舗設定 › 給与 の報酬制度を確かめてください）。";

/** 作る前にほかの節を保存しようとしたときの文 */
export const planSaveFirstOf = (sec: PlanCreateSection | null): string =>
  `先にプランを保存してください（${sec ?? "基本給・保証"}の保存でプランが作成されます）`;
