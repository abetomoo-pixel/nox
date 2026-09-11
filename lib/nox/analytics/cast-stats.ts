// B6-12 指名・出勤・集中度・商品／時間の整形（純関数・DB 非依存・import なし・裁定 B6-12／B6-10 ③・2026-09-11）。
//   top3ShareOf   : 既存 salesRanking の構成 %（小数 1 桁）の上位 3 行の合計。行 0 → null。3 行未満は在る行の合計。
//   presentDaysOf : attendance 行のうち出勤扱い（shukkin／dohan／late）の人日と distinct cast 数。off／absent は数えない。
//                   ★出勤扱いの状態集合はここに集約（analytics attDays／dashboard 本日の出勤の直書きを置換・前後完全一致）。
//   productTimeOf : 既存 5 分類（category-map の CategorySums）から 商品売上（明細）＝drink＋champ＋bottle／時間料金（明細）＝time。
//                   time は categoryOf が kind time／set と fee_kind set／extension／vip_charge を吸収済み＝cats.time そのもの。
//   nomStoreOf    : get_store_nom_counts の 1 行（hon_count／jonai_count／dohan_count）の整形。行なし→null。
//   金額の再計算なし（既存 RPC・既存集計の出力を足すだけ）。

/** 出勤扱いの状態（B4／dashboard の語彙: shukkin＝出勤・dohan＝同伴・late＝遅刻）。off／absent は含めない。 */
export const PRESENT_STATUSES = ["shukkin", "dohan", "late"] as const;

/** 上位 3 行の構成 % 合計（小数 1 桁）。rows は構成 %（小数 1 桁）を持つ行。行 0 → null。並びは pct 降順で取る（同率は合計に影響しない）。 */
export function top3ShareOf(rows: readonly { pct: number }[]): number | null {
  if (rows.length === 0) return null;
  const top = [...rows].sort((a, b) => b.pct - a.pct).slice(0, 3);
  return Math.round(top.reduce((a, r) => a + r.pct, 0) * 10) / 10;
}

/** 出勤扱いの人日（行数）と distinct cast 数。同一 cast の複数日は人日に加算・cast は 1。 */
export function presentDaysOf(rows: readonly { cast_id: string; status: string }[]): { days: number; casts: number } {
  const present = (PRESENT_STATUSES as readonly string[]);
  const ids = new Set<string>();
  let days = 0;
  for (const r of rows) {
    if (!present.includes(r.status)) continue;
    days += 1;
    ids.add(r.cast_id);
  }
  return { days, casts: ids.size };
}

/** 商品売上（明細）＝drink＋champ＋bottle／時間料金（明細）＝time。product＋time＋other＝5 分類の総和（discount は外）。 */
export function productTimeOf(sums: { cats: { time: number; drink: number; champ: number; bottle: number; other: number } }): { product: number; time: number } {
  return { product: sums.cats.drink + sums.cats.champ + sums.cats.bottle, time: sums.cats.time };
}

/** get_store_nom_counts の 1 行を整形。行なし（null／undefined）→ null。値は Number() で整数化（null は 0）。 */
export function nomStoreOf(row: { hon_count: number | null; jonai_count: number | null; dohan_count: number | null } | null | undefined): { hon: number; jonai: number; dohan: number } | null {
  if (!row) return null;
  return { hon: Number(row.hon_count ?? 0), jonai: Number(row.jonai_count ?? 0), dohan: Number(row.dohan_count ?? 0) };
}
