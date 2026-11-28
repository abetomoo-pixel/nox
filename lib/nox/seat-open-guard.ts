// ★起票60（相談役 11/26 22:10 夜便 N 改・段ア）: 開いている伝票がある席の「有効」を外すと、レジのフロア（有効な席だけを並べる）から
//   伝票ごと見えなくなり、会計も日報の締めもできなくなった。画面だけで止める（set_seat は変えない＝関数の止めは別の便）。
//   純関数（DB を知らない）。数は席の画面が checks（主席）と check_seats（足した席）から数えて渡す。

/** 席の窓の保存を止める理由（null＝止めない）。外す（有効でなくする）保存で、その席に会計前の伝票が 1 件以上あるときだけ止める */
export function seatDeactivateBlockOf(p: { seatId: string | null; nextActive: boolean; openChecks: number }): string | null {
  if (p.seatId === null || p.nextActive || p.openChecks <= 0) return null;
  return `この席には会計前の伝票が ${p.openChecks} 件あります。会計を済ませてから「有効」を外してください（外すとレジのフロアに出なくなります）。`;
}


/** ★0248（起票60 の関数の側）: set_seat が断ったとき（`seat has open checks`）の文。画面の確かめと保存の間に伝票が開いたとき・ほかの画面から保存したときに出る。null＝この断りではない */
export function seatOpenChecksErrJa(message: string): string | null {
  return message.includes("seat has open checks") ? "この席には会計前の伝票があります。会計を済ませてから「有効」を外してください（外すとレジのフロアに出なくなります）。" : null;
}
