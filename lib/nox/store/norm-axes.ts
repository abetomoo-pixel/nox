// ★裁定347／追補1・GV-2（0171・便 P171・2026-10-14）: ノルマの採用軸（店設定 settings_json.norm_axes）とプラン既定の目標（comp_plans.norm_*_target）の純関数。
//   軸＝days（出勤日数）／dohan（同伴）／sales（売上）／shimei（指名）。欠損＝ON（false のときだけ OFF＝isSystemOn と同じ流儀）。
//   目標の解決＝キャスト個別（cast_quotas の非 null）＞プラン既定（comp_plans.norm_*_target の非 null）＞なし。
//   cast_quotas の軸は hon／jonai／dohan／sales（0160）＝プラン既定の shimei は「指名のカウント」（shimei_norm_scope＝hon／hon_jonai・mig0042）で hon（＋jonai）へ写す。days は cast_quotas に無い＝/mine の進捗カードには出ない（勤怠一覧の出勤日数で見る）。
import type { Quota, QuotaKey } from "../mine/quota";

export const NORM_AXES = ["days", "dohan", "sales", "shimei"] as const;
export type NormAxis = (typeof NORM_AXES)[number];
export type NormAxes = Record<NormAxis, boolean>;
export const NORM_AXIS_LABEL: Record<NormAxis, string> = { days: "出勤日数", dohan: "同伴", sales: "売上", shimei: "指名" };
export const NORM_AXIS_UNIT: Record<NormAxis, string> = { days: "日", dohan: "回", sales: "円", shimei: "回" };
export const NORM_AXES_ALL_ON: NormAxes = { days: true, dohan: true, sales: true, shimei: true };

/** settings_json.norm_axes → 4 軸の ON/OFF（欠損・型違いは ON＝false のときだけ OFF） */
export function normAxesOf(settingsJson: unknown): NormAxes {
  const o = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? (settingsJson as Record<string, unknown>).norm_axes : null;
  const a = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  return { days: a.days !== false, dohan: a.dohan !== false, sales: a.sales !== false, shimei: a.shimei !== false };
}

/** set_store_norm_axes の p_axes（4 キー boolean を常に明示＝原則7） */
export const normAxesArgsOf = (a: NormAxes): Record<NormAxis, boolean> => ({ days: a.days, dohan: a.dohan, sales: a.sales, shimei: a.shimei });

export type ShimeiScope = "hon" | "hon_jonai";
/** 指名のカウント定義（settings_json.shimei_norm_scope・既定 hon） */
export const shimeiScopeOf = (settingsJson: unknown): ShimeiScope => ((settingsJson as Record<string, unknown> | null)?.shimei_norm_scope === "hon_jonai" ? "hon_jonai" : "hon");

/** cast_quotas の軸（hon／jonai／dohan／sales）のうち、採用軸で見せるもの。shimei OFF＝hon・jonai とも隠す。hon_jonai でないとき jonai は隠す */
export function quotaKeysOfAxes(axes: NormAxes, scope: ShimeiScope): QuotaKey[] {
  const out: QuotaKey[] = [];
  if (axes.shimei) { out.push("hon"); if (scope === "hon_jonai") out.push("jonai"); }
  if (axes.dohan) out.push("dohan");
  if (axes.sales) out.push("sales");
  return out;
}

export type PlanNormTargets = { norm_days_target?: number | null; norm_dohan_target?: number | null; norm_sales_target?: number | null; norm_shimei_target?: number | null };
export type NormTargets = Record<NormAxis, number | null>;
export const normTargetsOf = (p: PlanNormTargets | null | undefined): NormTargets => ({
  days: numOrNull(p?.norm_days_target), dohan: numOrNull(p?.norm_dohan_target), sales: numOrNull(p?.norm_sales_target), shimei: numOrNull(p?.norm_shimei_target),
});
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** プラン既定（4 軸）→ cast_quotas の形（hon／jonai／dohan／sales）。shimei は scope で hon（hon_jonai なら hon に全量・jonai は null＝カウントは hon＋jonai の合算で見る） */
export function planDefaultQuotaOf(t: NormTargets, axes: NormAxes): Quota {
  return {
    hon: axes.shimei ? t.shimei : null,
    jonai: null,
    dohan: axes.dohan ? t.dohan : null,
    sales: axes.sales ? t.sales : null,
  };
}

export type QuotaSource = "override" | "plan" | null;
export type ResolvedQuota = { quota: Quota; source: Record<QuotaKey, QuotaSource> };
/** 解決＝個別（cast_quotas の非 null）＞プラン既定＞なし。採用 OFF の軸は null（source null） */
export function resolveQuotaOf(planQuota: Quota, castQuota: Partial<Quota> | null | undefined, axes: NormAxes, scope: ShimeiScope): ResolvedQuota {
  const keys = new Set(quotaKeysOfAxes(axes, scope));
  const quota: Quota = { hon: null, jonai: null, dohan: null, sales: null };
  const source: Record<QuotaKey, QuotaSource> = { hon: null, jonai: null, dohan: null, sales: null };
  for (const k of ["hon", "jonai", "dohan", "sales"] as const) {
    if (!keys.has(k)) continue;
    const c = castQuota?.[k];
    if (typeof c === "number" && Number.isFinite(c)) { quota[k] = c; source[k] = "override"; continue; }
    const p = planQuota[k];
    if (typeof p === "number" && Number.isFinite(p)) { quota[k] = p; source[k] = "plan"; }
  }
  return { quota, source };
}

/** 個別上書きが 1 つでもあるか（印「個別」・「プランの既定に戻す」の活性） */
export const hasOverride = (r: ResolvedQuota): boolean => Object.values(r.source).some((s) => s === "override");

/** 4 軸の目標（cast_norms 型・0＝未設定）を既定で補う＝薄濃の表示用。override＝cast_norms の非 0・plan＝既定の非 null */
export function resolveNormTargetsOf(plan: NormTargets, cast: Partial<Record<NormAxis, number | null>> | null | undefined, axes: NormAxes): { value: NormTargets; source: Record<NormAxis, QuotaSource> } {
  const value: NormTargets = { days: null, dohan: null, sales: null, shimei: null };
  const source: Record<NormAxis, QuotaSource> = { days: null, dohan: null, sales: null, shimei: null };
  for (const k of NORM_AXES) {
    if (!axes[k]) continue;
    const c = cast?.[k];
    if (typeof c === "number" && Number.isFinite(c) && c > 0) { value[k] = c; source[k] = "override"; continue; }
    const p = plan[k];
    if (typeof p === "number" && Number.isFinite(p) && p > 0) { value[k] = p; source[k] = "plan"; }
  }
  return { value, source };
}
