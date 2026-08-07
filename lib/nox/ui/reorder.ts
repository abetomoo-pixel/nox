// ∧∨ 並び替えの共用ヘルパー（料金UIレーン C2）。
//
// 対象 RPC は 0077/0081/0083 系の reorder（product_category_reorder / product_reorder /
// pricing_rule_reorder / cast_rank_reorder）＝いずれも「スコープ全件の id を並び替え後の順で
// 送る・サーバが 1..N に再採番・両方向検証（欠け=partial ids・混入=forbidden・重複=duplicate ids）」
// という同一契約を持つ。ここに集約するのは契約に由来する2点だけ:
//   (1) swapAdjacent … 隣接入れ替え後の「全件」配列を作る（境界外は null＝呼び出し側は何もしない）
//   (2) reorderErrJa … 両方向検証のエラートークン日本語化
// ★busy の形（boolean / busyId）・失敗時に再読込するか・成功後の反映方法は画面ごとに異なる
//   意図的な差（挙動不変の対象）なので、状態を内包するフックにはせず関数に留める。
//   D&D 化はこのヘルパーの上に後日共用部品として載せる（このレーンでは実装しない）。

/** 隣接入れ替え後の全件 id 配列。境界外（先頭を上へ等）は null を返す。 */
export function swapAdjacent(ids: string[], index: number, dir: -1 | 1): string[] | null {
  const j = index + dir;
  if (index < 0 || j < 0 || j >= ids.length || index >= ids.length) return null;
  const next = [...ids];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** reorder RPC 共通エラーの日本語化（未知トークンは原文のまま返す＝握りつぶさない）。 */
export function reorderErrJa(message: string | undefined): string {
  if (!message) return "不明なエラー";
  if (message.includes("partial ids")) return "一覧が古くなっています。再読込してください";
  if (message.includes("duplicate ids")) return "並び替えの内容が重複しています。再読込してください";
  if (message.includes("forbidden")) return "権限がありません";
  return message;
}
