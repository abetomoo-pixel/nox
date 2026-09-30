// ★裁定314（0158・便 AB-7）: 明細行の「キープ済み」＝bottle_keeps.check_line_id がその行を指すキープがある（純関数・DB を知らない）。
//   0158 で bottle_keeps.check_line_id（FK・on delete set null）が入った＝注文者×商品×開栓日時の近似は使わない。
export function keptLineIdsOf(lineIds: readonly string[], keeps: readonly { check_line_id: string | null }[]): Set<string> {
  const have = new Set(keeps.map((k) => k.check_line_id).filter((v): v is string => typeof v === "string"));
  return new Set(lineIds.filter((id) => have.has(id)));
}
