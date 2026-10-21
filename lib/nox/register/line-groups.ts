// ★便 GV-C C-4（裁定370 追補1）: 明細の表示＝同一商品の連続行は「×N」に集約（削除は 1 ずつ＝代表行は最後の行）・お客様チップは条件付き。DB を知らない純関数。
//   集約できる行＝商品行（product_id あり・時間行／料金行／割引／キープ取出しでない）かつボトル以外（キープは行ごと）かつキャストドリンク（除外＝行ごとに起票）でない。
//   同じとみなす＝商品・単価・お客様・会計グループが同じで、並びが連続していること（間に別の行が入れば別の集約）。
export type GroupableLine = { id: string; product_id?: string | null; time_auto?: boolean | null; fee_kind?: string | null; kind?: string | null;
  unit_price_snapshot: number; qty: number; line_total: number; customer_id?: string | null; pay_group?: string | null; back_snapshot?: { back_exempt?: boolean } | null };
export type LineGroup<L extends GroupableLine> = { rep: L; lines: L[]; qty: number; total: number };

export function isGroupableLine(l: GroupableLine): boolean {
  return !!l.product_id && !l.time_auto && !l.fee_kind && !["time", "discount", "keep_out", "charge", "bottle"].includes(l.kind ?? "") && l.back_snapshot?.back_exempt !== true;
}
const keyOf = (l: GroupableLine) => `${l.product_id}|${l.unit_price_snapshot}|${l.customer_id ?? ""}|${l.pay_group ?? ""}`;

export function groupLines<L extends GroupableLine>(lines: readonly L[]): LineGroup<L>[] {
  const out: LineGroup<L>[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && isGroupableLine(l) && isGroupableLine(last.rep) && keyOf(last.rep) === keyOf(l)) {
      last.lines.push(l); last.rep = l; last.qty += l.qty; last.total += l.line_total;
    } else out.push({ rep: l, lines: [l], qty: l.qty, total: l.line_total });
  }
  return out;
}

/** お客様チップを出す行＝ボトル行／伝票のお客様が 2 人以上／会計分割中／すでにお客様が付いている行（外したら消える） */
export function customerChipVisibleOf(l: { kind?: string | null; customer_id?: string | null }, ctx: { checkCustomers: number; splitOn: boolean }): boolean {
  return l.kind === "bottle" || ctx.checkCustomers >= 2 || ctx.splitOn || !!l.customer_id;
}

/** ★便 GV-C C-6（GV-44）: 「最近使った」＝この伝票の注文履歴＝商品行（セット・延長・料金・割引を除く）を新しい順・重複除去・最大 8 */
export function recentProductIdsOf(lines: readonly { product_id?: string | null; time_auto?: boolean | null; fee_kind?: string | null; kind?: string | null; created_at?: string | null }[], max = 8): string[] {
  const rows = lines.filter((l) => !!l.product_id && !l.time_auto && !l.fee_kind && !["time", "discount", "charge", "keep_out"].includes(l.kind ?? ""));
  const sorted = rows.map((l, i) => ({ l, i })).sort((a, b) => (b.l.created_at ?? "").localeCompare(a.l.created_at ?? "") || b.i - a.i);
  const out: string[] = [];
  for (const { l } of sorted) { if (!out.includes(l.product_id!)) out.push(l.product_id!); if (out.length >= max) break; }
  return out;
}

/** ★便 X13-G W-3: 伝票上部のお客様の 1 行＝1 人「K様」／2 人以上「K様 ほか n 名」／0 人は空 */
export function checkCustLineOf(names: readonly string[]): string {
  if (names.length === 0) return "";
  const head = /様$/.test(names[0]) ? names[0] : `${names[0]}様`; // ★live: 顧客名がすでに「様」で終わる（デモの「H様」など）ときは足さない
  return names.length === 1 ? head : `${head} ほか ${names.length - 1} 名`;
}
