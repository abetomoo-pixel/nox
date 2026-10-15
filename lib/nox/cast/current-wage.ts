// ★裁定374（GV-B W-4・2026-10-15）: /casts のカードと詳細に出す「今期の時給」と「ノルマ達成状況」の純関数。
//   今期の時給＝給与プレビュー（/api/payroll/preview・core→payOf）の PayResult から読むだけ（別計算を作らない）。
//     ・時給＝wdays の最後の営業日の hourly（営業日が無ければ pay.wage）・基準＝その日の basis（保証／売上／pt／基本）
//     ・判定期間＝プランの slide_period（月次／半月／日次）と店の slide_apply（next＝前期の実績で判定／current＝当期の累計）
//     ・印＝保証中（pay.guarantee の span が今日を含む）／体験入店（プラン名）
//   ノルマ達成状況＝/mine の進捗カードと同じ cardAxesOf（lib/nox/mine/quota）の結果から「達成／進行中／未達」を 1 語に畳む。
import { SLIDE_PERIOD_LABEL, slidePeriodOf } from "@/lib/nox/payroll/slide";
import type { CardAxis } from "@/lib/nox/mine/quota";

export type WageDayLike = { d?: number; hours?: number; hourly?: number; basis?: string };
export type PreviewPayLike = {
  wage?: number; wHours?: number; wdays?: WageDayLike[];
  guarantee?: { spans?: { from: string; to: string | null; base: number }[] } | null;
  slideBasis?: { apply?: string } | null;
  plan?: { name?: string } | null;
};
export type CurrentWage = { hourly: number; basis: string; periodLabel: string; guarantee: boolean; trial: boolean; hours: number };

export const WAGE_BASIS_LABEL: Record<string, string> = { "保証": "保証", "売上": "売上段", "pt": "pt 段", "基本": "基本", "固定": "固定" };

/** 今期の時給（プレビューの PayResult から）。today＝暦日 YYYY-MM-DD（保証中の判定） */
export function currentWageOf(pay: PreviewPayLike | null | undefined, opts: { planName?: string | null; slidePeriod?: unknown; today: string }): CurrentWage {
  const wdays = pay?.wdays ?? [];
  const last = wdays.length > 0 ? wdays[wdays.length - 1] : null;
  const hourly = Math.max(0, Math.round(Number(last?.hourly ?? pay?.wage ?? 0)));
  const basis = String(last?.basis ?? (pay?.guarantee ? "保証" : "基本"));
  const period = slidePeriodOf(opts.slidePeriod);
  const apply = pay?.slideBasis?.apply === "next" ? "前期の実績で判定" : "当期の累計で判定";
  const periodLabel = `${SLIDE_PERIOD_LABEL[period]}・${apply}`;
  const spans = pay?.guarantee?.spans ?? [];
  const guarantee = spans.some((s) => s.from <= opts.today && (s.to === null || s.to >= opts.today));
  const trial = (opts.planName ?? "") === "体験入店";
  return { hourly, basis, periodLabel, guarantee, trial, hours: Number(pay?.wHours ?? 0) };
}

export type NormStatus = "none" | "done" | "progress" | "behind";
export const NORM_STATUS_LABEL: Record<NormStatus, string> = { none: "目標なし", done: "達成", progress: "進行中", behind: "未達" };

/** 達成状況＝目標なし／達成（全軸 done）／未達（いずれかの軸が「月の経過率」より遅れ）／進行中。elapsed＝月の経過率 0〜1 */
export function castNormStatusOf(axes: readonly CardAxis[], elapsed: number): NormStatus {
  if (axes.length === 0) return "none";
  if (axes.every((a) => a.done)) return "done";
  const need = Math.max(0, Math.min(1, elapsed)) * 100;
  return axes.some((a) => a.pct < need - 1e-9) ? "behind" : "progress";
}

/** 月の経過率（暦日ベース）: today＝YYYY-MM-DD */
export function monthElapsedOf(today: string): number {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), d = Number(today.slice(8, 10));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return days > 0 ? Math.min(1, Math.max(0, d / days)) : 0;
}

/** 時給の段（絞り込み用）＝出現する時給の昇順ユニーク */
export const wageTiersOf = (wages: readonly number[]): number[] => [...new Set(wages.filter((w) => w > 0))].sort((a, b) => a - b);

/** 達成率（並び替え用）＝軸の pct 平均（目標なしは −1 で末尾） */
export const normRateOf = (axes: readonly CardAxis[]): number => (axes.length === 0 ? -1 : axes.reduce((a, x) => a + x.pct, 0) / axes.length);
