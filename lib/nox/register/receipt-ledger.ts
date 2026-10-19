// ★便 GV-C C-13（GV-59）: 台帳からの再発行（receipt_issue）のエラー文言。レジの発行と同じ語（残額は台帳では出さない）。
export function receiptReissueErrJa(m: string): string {
  if (m.includes("bad amount")) return "発行できる残額を超えています（この伝票は発行済みの合計が会計額に達しています。取消してから再発行してください）";
  if (m.includes("not closed")) return "会計済みの伝票のみ発行できます";
  if (m.includes("bad recipient")) return "宛名は100文字以内で入力してください";
  if (m.includes("bad proviso")) return "但し書きは100文字以内で入力してください";
  if (m.includes("forbidden")) return "権限がありません";
  return m;
}
