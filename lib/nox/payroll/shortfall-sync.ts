// ★裁定324-4／追補2-2（0159 client 前倒し・便 L-2-4・2026-09-30）: preview → payroll_shortfall_sync(p_run_id, p_rows) の結線の純部分（DB を知らない）。
//   p_rows の形＝0159 の RPC が検証する {cast_id, biz_date, amount, target_shift_id, basis, reason}[]（amount 0 の行は RPC 側で delete 対象＝ここでは 0 も渡す）。
//   RPC 不在（0159 手貼り前）は「呼ばない」に倒す＝PostgREST の schema cache に無い関数は PGRST202／'Could not find the function' で返る＝isRpcMissing で判定し素通り。
import type { ShortfallRow } from "./shortfall";

export type ShortfallSyncRow = { cast_id: string; biz_date: string; amount: number; target_shift_id: string; basis: string; reason: string };

export function shortfallSyncRowsOf(shortfall: readonly { castId: string; rows: readonly ShortfallRow[] }[]): ShortfallSyncRow[] {
  const out: ShortfallSyncRow[] = [];
  for (const c of shortfall) for (const r of c.rows) out.push({ cast_id: c.castId, biz_date: r.biz_date, amount: r.amount, target_shift_id: r.target_shift_id, basis: r.basis, reason: r.reason });
  return out;
}

/** PostgREST が「関数が無い」で返したか（0159 手貼り前＝素通り・それ以外の error は本物） */
export function isRpcMissing(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "PGRST202" || /Could not find the function/i.test(err.message ?? "") || /schema cache/i.test(err.message ?? "");
}
