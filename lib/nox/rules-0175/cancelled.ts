// ★便 P175-prep P-2（0175 v2 ★4）: 取消済み（cancelled_at）の行を給与・日報・不整合の件数から除外し、一覧では「取消済み（種別）」と出す純関数。
//   フラグ false＝列が無い（0175 前）ので呼び出し側は cancelled_at を select せず、ここも通らない。
export type CancellableRow = { cancelled_at?: string | null; cancel_reason?: string | null; kind?: string | null; source?: string | null };

/** 計算・集計に使う行＝cancelled_at が null のものだけ */
export function activeRowsOf<T extends CancellableRow>(rows: readonly T[]): T[] { return rows.filter((r) => !r.cancelled_at); }
export const isCancelledOf = (r: CancellableRow): boolean => !!r.cancelled_at;

export const ADJUST_KIND_LABEL: Record<string, string> = { late: "遅刻", absent: "当欠", norm_shortfall: "ノルマ未達", other: "その他" };
export const DAILY_PAY_KIND_LABEL: Record<string, string> = { settlement: "日次精算", advance: "前払" };

/** 一覧の状態の語＝「取消済み（遅刻）」「取消済み（日次精算）」。取消でなければ null */
export function cancelledLabelOf(r: CancellableRow, labels: Record<string, string> = ADJUST_KIND_LABEL): string | null {
  if (!r.cancelled_at) return null;
  const k = r.kind ? labels[r.kind] ?? r.kind : null;
  return k ? `取消済み（${k}）` : "取消済み";
}

/** 日報の現金支払・不整合の件数など「件数」を数えるとき＝取消済みを除いた数 */
export const activeCountOf = (rows: readonly CancellableRow[]): number => rows.filter((r) => !r.cancelled_at).length;
