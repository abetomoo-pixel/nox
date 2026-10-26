// ★便 ON-4（2026-10-26・裁定427＝C2-23・0182 起草）: 席移動で席種が変わるときの料金の純関数（DB を知らない）。
//   DB 側（check_move_seat＝0182）が ①上位へ（セット中）＝セット行を VIP セット料金に差し替え ②上位へ（延長中）＝延長パターンを再凍結（VIP 用／無ければ通常＋差額）
//   ③サ率は移動時点から新しい率（移動前の行は旧率で凍結） ④下位へ＝VIP 料金の行は残す ⑤入金済みは不変 を行う。ここは確認ダイアログの文（フラグ SEAT_MOVE_PRICING_APPLIED＝true のときだけ出す）。
export type SeatKindChange = "up" | "down" | "same";
const rankOf = (kind: string | null | undefined): number => (kind === "VIP" ? 2 : 1); // 卓／カウンター＝同格・VIP＝上位

export function seatKindChangeOf(fromKind: string | null | undefined, toKind: string | null | undefined): SeatKindChange {
  const a = rankOf(fromKind), b = rankOf(toKind);
  return a === b ? "same" : b > a ? "up" : "down";
}
/** 確認ダイアログの文（null＝確認なし＝同種間・入金済み） */
export function seatMoveConfirmTextOf(p: { change: SeatKindChange; hasExtension: boolean; paid: boolean; toKind: string | null | undefined; serviceRateTo: number | null }): string | null {
  if (p.paid || p.change === "same") return null;
  const rate = p.serviceRateTo !== null ? `サービス料は移動時点から ${p.serviceRateTo}%（移動前の分は今の率のまま）。` : "サービス料は移動時点から移動先の率（移動前の分は今の率のまま）。";
  if (p.change === "up") {
    return p.hasExtension
      ? `${p.toKind ?? "VIP"} 席へ移動します。入店時のセット料金はそのまま、この先の延長から VIP の延長料金になります。${rate}よろしいですか？`
      : `${p.toKind ?? "VIP"} 席へ移動します。セット料金の行を VIP のセット料金に差し替えます（追加ではなく置換）。${rate}よろしいですか？`;
  }
  return `${p.toKind ?? "通常"} 席へ移動します。VIP 料金の行はそのまま残ります（返金はありません）。${rate}よろしいですか？`;
}
/** 移動先の率＝stores.service_rate_by_seat（seats.kind がキー・小文字も可）→無ければ店の率 */
export function serviceRateForSeatOf(bySeat: Record<string, unknown> | null | undefined, kind: string | null | undefined, storeRate: number | null): number | null {
  const k = kind ?? "卓";
  const raw = bySeat?.[k] ?? bySeat?.[k.toLowerCase()];
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : storeRate;
}
