// ★裁定340（便 X-13d-2a・2026-10-09・X-13-24）: 支払記録の UI 用の純関数（DB を知らない）。
//   ①行の「未払」→支払ダイアログ（支払日＝今日・方法 現金／振込／その他・金額＝残額が既定・部分支払可・メモ）
//   ②内訳パネルの手取りの下「支払を記録」（同じダイアログ）
//   ③未払カード「未払の全員を一括記録」＝方法と日付を 1 回選ぶ→確認→既存 RPC（payment_record_add＝/api/payment/record）を 1 人ずつ順に呼ぶ
//     （新規 RPC なし・途中で失敗した人は赤で残し成功分はそのまま＝裁定333 の流儀）。
import type { PaymentMethod } from "./payment-method";

export type PayLine = { castId: string; castName: string; net: number; paid: number };
export type PayDialogDraft = { amount: number; paidAt: string; method: PaymentMethod; note: string };

/** 残額（差引支給 − 支払済み・負は 0） */
export const remainingOf = (l: { net: number; paid: number }): number => Math.max(0, l.net - l.paid);

/** ダイアログの既定値＝残額・今日・現金・メモ空 */
export function payDialogDefaultsOf(l: { net: number; paid: number }, today: string): PayDialogDraft {
  return { amount: remainingOf(l), paidAt: today, method: "cash", note: "" };
}

/** ダイアログ入力の検証（RPC と同じ輪郭＝正の整数・残額以内・日付 YYYY-MM-DD）。null＝OK */
export function payDialogErrorOf(d: PayDialogDraft, l: { net: number; paid: number }): string | null {
  if (!Number.isInteger(d.amount) || d.amount <= 0) return "金額は 1 円以上の整数で入力してください";
  if (d.amount > remainingOf(l)) return `残額（${remainingOf(l).toLocaleString()} 円）を超えています`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.paidAt)) return "支払日を入力してください";
  if (d.note.length > 200) return "メモは 200 字までです";
  return null;
}

/** 一括記録の計画＝残額 > 0 の人だけ・各人の金額は残額 */
export function bulkPlanOf(lines: readonly PayLine[]): { items: { castId: string; castName: string; amount: number }[]; total: number } {
  const items = lines.filter((l) => remainingOf(l) > 0).map((l) => ({ castId: l.castId, castName: l.castName, amount: remainingOf(l) }));
  return { items, total: items.reduce((a, x) => a + x.amount, 0) };
}

/** 支払済み状態の更新（表示の再計算用＝実体は payment_records の再読込）。未知の cast は無視 */
export function applyPaidOf(map: ReadonlyMap<string, { net: number; paid: number }>, castId: string, amount: number): Map<string, { net: number; paid: number }> {
  const next = new Map(map);
  const cur = next.get(castId);
  if (cur) next.set(castId, { net: cur.net, paid: cur.paid + amount });
  return next;
}

/** 未支払合計＝Σ残額 */
export const unpaidTotalOf = (map: ReadonlyMap<string, { net: number; paid: number }>): number => [...map.values()].reduce((a, v) => a + remainingOf(v), 0);

export type BulkResult = { castId: string; castName: string; amount: number; ok: boolean; error?: string };
/** 一括の結果文＝成功 n／失敗 m（失敗は名前を列挙） */
export function bulkSummaryOf(results: readonly BulkResult[]): { okN: number; ngN: number; text: string } {
  const okN = results.filter((r) => r.ok).length, ng = results.filter((r) => !r.ok);
  const text = ng.length === 0 ? `${okN} 人の支払を記録しました` : `${okN} 人を記録・${ng.length} 人は失敗（${ng.map((r) => r.castName).join("・")}）＝失敗した人は行の「未払」から記録し直してください`;
  return { okN, ngN: ng.length, text };
}
