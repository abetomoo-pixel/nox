// ★裁定374（GV-B W-4・2026-10-15）: /casts のカードと詳細に出す「今期の時給」と「ノルマ達成状況」の純関数。
//   今期の時給＝給与プレビュー（/api/payroll/preview・core→payOf）の PayResult から読むだけ（別計算を作らない）。
//     ・時給＝wdays の最後の営業日の hourly（営業日が無ければ pay.wage）・基準＝その日の basis（保証／売上／pt／基本）
//     ・判定期間＝プランの slide_period（月次／半月／日次）とプランの slide_apply（next＝前月の累計／current＝当期の累計・★便 X13-H H-8 で店の値は読まない）
//     ・印＝保証中（pay.guarantee の span が今日を含む）／体験入店（プラン名）
//   ノルマ達成状況＝/mine の進捗カードと同じ cardAxesOf（lib/nox/mine/quota）の結果から「達成／進行中／未達」を 1 語に畳む。
import { SLIDE_PERIOD_LABEL, slidePeriodOf, type SlidePeriod } from "@/lib/nox/payroll/slide";
import type { CardAxis } from "@/lib/nox/mine/quota";
import { wageNowOf, type WageNow } from "./wage-now"; // ★便 P174 T-5（GV-55／56）: 今の時給の解決は 1 本
import type { PlanRowLike } from "./guarantee";
import { daysInMonthOf } from "../month"; // ★便 X13-H H-9: 暦月の日付は 1 か所で

export type WageDayLike = { d?: number; hours?: number; hourly?: number; basis?: string; sales?: number; pts?: number };
type SlideStep = { at: number; wage: number };
export type PreviewPayLike = {
  wage?: number; wHours?: number; wdays?: WageDayLike[];
  guarantee?: { spans?: { from: string; to: string | null; base: number }[] } | null;
  slideBasis?: { apply?: string; months?: { month: string; sales: number; pts: number }[] } | null;
  eplan?: { salesSlide?: SlideStep[]; pointSlide?: SlideStep[] } | null;
  plan?: { name?: string } | null;
};
export type CurrentWage = { hourly: number; basis: string; periodLabel: string; basisLine: string | null; /* ★便 X13-H H-8: 根拠 1 行 */ guarantee: boolean; trial: boolean; hours: number; now?: WageNow; next?: { label: string; label2: string } | null /* ★便 ON-4（C2-22）: 来期の時給見込み（/mine） */ };

export const WAGE_BASIS_LABEL: Record<string, string> = { "保証": "保証", "売上": "売上段", "pt": "pt 段", "基本": "基本", "固定": "固定" };

/** 今期の時給（プレビューの PayResult から）。today＝暦日 YYYY-MM-DD（保証中の判定） */
//   ★便 P174 T-5（GV-55／56）: rows（cast_plan の行）を渡すと wageNowOf で時給・接尾・保証を解決（カード「¥3,200 保証（10/18 まで）」／「¥2,200 基本」）。
//   rows なし＝従来の読み方（プレビューの最終営業日）＝互換。
/** ★便 X13-H H-8: 判定タイミング（プランの slide_apply・null＝当期の累計） */
export type SlideTiming = "next" | "current";
export const slideTimingOf = (v: unknown): SlideTiming => (v === "next" ? "next" : "current");
/** 「前月の累計」「当日までの累計」…＝判定期間とタイミングをそのまま言葉に */
export function slideTimingPhraseOf(period: SlidePeriod, apply: SlideTiming): string {
  if (apply === "next") return period === "half" ? "前の半月の累計" : "前月の累計";
  return period === "monthly" ? "当月の累計" : period === "half" ? "この半月の累計" : "当日までの累計";
}
/** 「月次・前月の累計で判定」（段の語＝売上段／pt 段は呼び出し側の basis） */
export const slideJudgeLabelOf = (period: SlidePeriod, apply: SlideTiming): string => `${SLIDE_PERIOD_LABEL[period]}・${slideTimingPhraseOf(period, apply)}で判定`;
/** 時給の下の根拠 1 行＝「前月売上 ¥1,230,000（按分後）→ 2 段」／段に届かない＝「… → 段なし（基本時給）」。スライドの段が無いプランは null。
 *  値＝プレビューの判定材料（slideBasis.months の最後＝期間累計／前期）→ 無ければ営業日の値（日次）。段＝プランの段（昇順）で値以上の数。 */
export function wageBasisLineOf(pay: PreviewPayLike | null | undefined, period: SlidePeriod, apply: SlideTiming): string | null {
  const sales = (pay?.eplan?.salesSlide ?? []).filter((s) => s.at > 0), pts = (pay?.eplan?.pointSlide ?? []).filter((s) => s.at > 0);
  const wdays = pay?.wdays ?? [];
  const last = wdays.length > 0 ? wdays[wdays.length - 1] : null;
  const axis: "sales" | "pts" | null = last?.basis === "ポイント" && pts.length > 0 ? "pts" : sales.length > 0 ? "sales" : pts.length > 0 ? "pts" : null;
  if (!axis) return null;
  const months = pay?.slideBasis?.months ?? [];
  const m = months.length > 0 ? months[months.length - 1] : null;
  const value = Math.max(0, Math.round(m ? (axis === "pts" ? m.pts : m.sales) : last ? Number((axis === "pts" ? last.pts : last.sales) ?? 0) : 0));
  const head = apply === "next" ? (period === "half" ? "前の半月の" : "前月") : period === "monthly" ? "当月累計の" : period === "half" ? "この半月の累計" : "当日の";
  const text = axis === "pts" ? `${head} pt ${value.toLocaleString("ja-JP")}` : `${head}売上 ¥${value.toLocaleString("ja-JP")}（按分後）`;
  const tier = [...(axis === "pts" ? pts : sales)].sort((a, b) => a.at - b.at).filter((s) => value >= s.at).length;
  return `${text}${axis === "pts" ? " " : ""}→ ${tier > 0 ? `${tier} 段` : "段なし（基本時給）"}`; // 「（按分後）→ 2 段」＝括弧の後は詰める
}

export function currentWageOf(pay: PreviewPayLike | null | undefined, opts: { planName?: string | null; slidePeriod?: unknown; slideApply?: unknown; today: string; planBase?: number | null; rows?: readonly PlanRowLike[] }): CurrentWage {
  const wdays = pay?.wdays ?? [];
  const last = wdays.length > 0 ? wdays[wdays.length - 1] : null;
  const hourly = Math.max(0, Math.round(Number(last?.hourly ?? pay?.wage ?? 0)));
  const basis = String(last?.basis ?? (pay?.guarantee ? "保証" : "基本"));
  const period = slidePeriodOf(opts.slidePeriod);
  // ★便 X13-H H-8: タイミングはプランの slide_apply（計算と同じ値）。旧＝pay.slideBasis.apply を見ていたが core が月次／半月で 'monthly'／'half' に書き換えるため常に「当期」になっていた
  const timing: SlideTiming = opts.slideApply !== undefined ? slideTimingOf(opts.slideApply) : slideTimingOf(pay?.slideBasis?.apply);
  const periodLabel = slideJudgeLabelOf(period, timing);
  const basisLine = wageBasisLineOf(pay, period, timing);
  const spans = pay?.guarantee?.spans ?? [];
  const guarantee = spans.some((s) => s.from <= opts.today && (s.to === null || s.to >= opts.today));
  const trial = (opts.planName ?? "") === "体験入店";
  if (opts.rows) {
    const now = wageNowOf({ planBase: opts.planBase ?? null, rows: opts.rows, today: opts.today, lastDay: last });
    return { hourly: now.hourly, basis: now.suffixLabel, periodLabel, basisLine, guarantee: now.guarantee !== null, trial, hours: Number(pay?.wHours ?? 0), now };
  }
  return { hourly, basis, periodLabel, basisLine, guarantee, trial, hours: Number(pay?.wHours ?? 0) };
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
  const days = daysInMonthOf(`${y}-${String(m).padStart(2, "0")}`);
  return days > 0 ? Math.min(1, Math.max(0, d / days)) : 0;
}

/** 時給の段（絞り込み用）＝出現する時給の昇順ユニーク */
export const wageTiersOf = (wages: readonly number[]): number[] => [...new Set(wages.filter((w) => w > 0))].sort((a, b) => a - b);

/** 達成率（並び替え用）＝軸の pct 平均（目標なしは −1 で末尾） */
export const normRateOf = (axes: readonly CardAxis[]): number => (axes.length === 0 ? -1 : axes.reduce((a, x) => a + x.pct, 0) / axes.length);
