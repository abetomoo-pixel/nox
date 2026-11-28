// 日報の出し分けの純関数（DB を知らない）。フラグが false の間は従来どおり。
import { mig0201eOn, mig0201hOn } from "@/lib/nox/rules-0175/flag";

/** ★0201h（裁定485・2026-11-12）: 売掛タブの「給与天引き」は店の売掛の方針（stores.receivable_policy）が cast_liability_allowed（キャスト負担も可）のときだけ。
 *  RPC receivable_mark_deduct もそれ以外は 'cast liability not allowed' で断る。 */
export function canMarkDeductOf(policy: string | null | undefined): boolean {
  if (!mig0201hOn()) return true;
  return policy === "cast_liability_allowed";
}

/** ★決め 5（#38・Agoora 2026-11-28）: 日報の「売掛」タブを出すか＝店長以上で、「売掛を使う」が ON の店か、OFF の店でも未回収の売掛（status open）が 1 件でもある間（回収だけ）。
 *  設定の文「既存の売掛の回収はそのまま行えます」と合わせる（receivable_collect は OFF を見ない）。新しい売掛の入口（レジの支払方法「売掛」・日報の「売掛 本日発生」）は OFF のまま出さない。0 件になったらタブは出ない。 */
export const arTabShownOf = (isManagerUp: boolean, arOff: boolean, openCount: number): boolean => isManagerUp && (!arOff || openCount > 0);
/** ★決め 5（#38）: OFF の店で「売掛」タブを出しているときの注記 */
export const AR_COLLECT_ONLY_NOTE = "この店は「売掛を使う」が OFF です。残っている売掛の回収だけ行えます（新しい売掛は作れません）。すべて回収すると、このタブは出なくなります。";

/** ★0201e（裁定481・2026-11-12）: キャストの締め＝店が許可した人だけ（memberships.cast_can_close・既定 OFF）∧ 出勤中（auth_cast_close_ok）∧ 今日の営業日。
 *  report_can_close のキャストの枝と同じ判定（真の防御は RPC）。closeOk＝auth_cast_close_ok の結果。 */
export function castCloseOf(a: { isCast: boolean; closeOk: boolean; bizDate: string; todayBiz: string }): boolean {
  if (!a.isCast) return false;
  if (!mig0201eOn()) return true;
  return a.closeOk && a.bizDate === a.todayBiz;
}
