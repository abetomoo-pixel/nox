// 日報の出し分けの純関数（DB を知らない）。フラグが false の間は従来どおり。
import { mig0201eOn, mig0201hOn } from "@/lib/nox/rules-0175/flag";

/** ★0201h（裁定485・2026-11-12）: 売掛タブの「給与天引き」は店の売掛の方針（stores.receivable_policy）が cast_liability_allowed（キャスト負担も可）のときだけ。
 *  RPC receivable_mark_deduct もそれ以外は 'cast liability not allowed' で断る。 */
export function canMarkDeductOf(policy: string | null | undefined): boolean {
  if (!mig0201hOn()) return true;
  return policy === "cast_liability_allowed";
}

/** ★0201e（裁定481・2026-11-12）: キャストの締め＝店が許可した人だけ（memberships.cast_can_close・既定 OFF）∧ 出勤中（auth_cast_close_ok）∧ 今日の営業日。
 *  report_can_close のキャストの枝と同じ判定（真の防御は RPC）。closeOk＝auth_cast_close_ok の結果。 */
export function castCloseOf(a: { isCast: boolean; closeOk: boolean; bizDate: string; todayBiz: string }): boolean {
  if (!a.isCast) return false;
  if (!mig0201eOn()) return true;
  return a.closeOk && a.bizDate === a.todayBiz;
}
