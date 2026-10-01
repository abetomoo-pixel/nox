// ★起票95／裁定326 追補2-2（0160 staff_shift_patterns.disabled_from・staff_pattern_disable／enable・便 M4-3・2026-10-01）: 枠マスタの無効化の純関数（DB を知らない）。
//   無効化は「M/1 から」（月初固定・翌月以降だけ選べる）。有効／無効の実判定は RPC の staff_pattern_effective（disabled_from is null or > 営業日）＝client は表示の状態だけを決める。
import { nextPeriodOf } from "../payroll/attention";

/** 翌月以降の月初 n 個＝[値 'YYYY-MM-01', 表示 'M/1 から無効'] */
export function disableMonthOptionsOf(bizToday: string, n = 6): ReadonlyArray<readonly [string, string]> {
  const out: (readonly [string, string])[] = [];
  let ym = nextPeriodOf(bizToday.slice(0, 7));
  for (let i = 0; i < n; i++) { out.push([`${ym}-01`, `${Number(ym.slice(5, 7))}/1 から無効`]); ym = nextPeriodOf(ym); }
  return out;
}

export type PatternDisableState = { state: "active" | "scheduled" | "disabled"; label: string | null };

/** disabled_from と営業日から表示の状態: null＝active／未来＝scheduled（「M/1 から無効」）／当日以前＝disabled（「無効（M/1 から）」） */
export function patternDisableStateOf(disabledFrom: string | null | undefined, bizToday: string): PatternDisableState {
  if (!disabledFrom) return { state: "active", label: null };
  const md = `${Number(disabledFrom.slice(5, 7))}/${Number(disabledFrom.slice(8, 10))}`;
  return disabledFrom > bizToday ? { state: "scheduled", label: `${md} から無効` } : { state: "disabled", label: `無効（${md} から）` };
}

/** RPC の staff_pattern_effective と同じ条件（disabled_from is null or > 営業日） */
export const isPatternEnabledOn = (disabledFrom: string | null | undefined, day: string): boolean => !disabledFrom || disabledFrom > day;
