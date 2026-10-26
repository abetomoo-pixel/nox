// ★便 ON-4（2026-10-26・C2-22＝来期の時給見込み・Agoora 確定 10/26 ⑨）: 期の途中で「来期の時給見込み」を出す純関数（DB を知らない）。
//   計算は給与と同じ部品＝売上／pt スライドは slideAt（pay.ts）・報酬率軸（CANON）は payRatePctOf／payRateTierOf／directionOf／streakOf／normTierOf／normRequiredOf（canon.ts）。
//   ⑫（裁定418 差し替え）＝UP は決定時給に累積・不成立の期（連続 N 期に届かない／規定未達）は据え置き・査定は時給を変えない（支給率で総報酬に掛ける）。
//   表示先＝/mine の今期の時給の下・給与右パネルのスライド行の下（確定済みの明細には出さない）。一覧に列は足さない。スライドの無いプランは null。
import { slideAt, type Slide } from "@/lib/nox/pay";

export type { NextWage } from "@/lib/nox/rules-0175/canon";
import type { NextWage } from "@/lib/nox/rules-0175/canon";
export { canonNextWageOf } from "@/lib/nox/rules-0175/canon";
const yen = (n: number) => "¥" + Math.round(n).toLocaleString("en-US");

/** 売上（または pt）スライド＝今期の値で段 → 来期の時給（基本以上）・次の段まであと何円（pt は何 pt） */
export function slideNextWageOf(p: { base: number; slides: readonly Slide[]; value: number; axis: "sales" | "pt" }): NextWage | null {
  const tiers = [...p.slides].sort((a, b) => a.at - b.at);
  if (tiers.length === 0) return null;
  const wage = Math.max(p.base, slideAt(tiers, p.value));
  const nxt = tiers.find((t) => t.at > p.value && t.wage > wage) ?? null;
  return { axis: p.axis, wage, judge: p.axis === "sales" ? `売上 ${yen(p.value)}` : `pt ${p.value}`, toNext: nxt ? Math.max(0, Math.ceil(nxt.at - p.value)) : null, note: null };
}

/** 1 行の文（/mine と給与右パネルで同じ）＝「来期の時給見込み ¥n（今期の判定値 m・あと ¥k で次の段）」＋注記 */
export function nextWageLineOf(n: NextWage | null | undefined): { label: string; label2: string } | null {
  if (!n) return null;
  const tail = n.toNext === null ? "最上段" : n.axis === "pt" ? `あと ${n.toNext} pt で次の段` : `あと ${yen(n.toNext)} で次の段`;
  return { label: `来期の時給見込み ${yen(n.wage)}（今期の判定値 ${n.judge}・${tail}）`, label2: `${n.note ? `${n.note}・` : ""}${NEXT_WAGE_NOTE}` };
}
export const NEXT_WAGE_NOTE = "見込み＝確定値ではありません（期末の実績で決まります）";

/** PayResult 風の値から（給与右パネル・/mine の両方）。canon の見込み（pay.ts が rules0175 のときに積む）を優先・無ければ売上→pt スライド */
export type NextWagePayLike = {
  canon?: { forecast?: NextWage | null } | null;
  eplan?: { base?: number; salesSlide?: Slide[]; pointSlide?: Slide[] } | null;
  plan?: { base?: number; salesSlide?: Slide[]; pointSlide?: Slide[] } | null;
  slideBasis?: { apply?: string; months?: { month: string; sales: number; pts: number }[] } | null;
  wdays?: { sales?: number; pts?: number }[];
};
export function nextWageOfPay(p: NextWagePayLike | null | undefined, opts: { salesOn?: boolean; ptOn?: boolean } = {}): NextWage | null {
  if (!p) return null;
  if (p.canon?.forecast) return p.canon.forecast;
  const plan = p.eplan ?? p.plan ?? null;
  if (!plan) return null;
  const base = Number(plan.base ?? 0);
  const sb = p.slideBasis;
  const cur = sb?.months?.length ? sb.months[sb.months.length - 1] : null;
  const fromDays = (k: "sales" | "pts") => (p.wdays ?? []).reduce((a, w) => a + Number(w[k] ?? 0), 0);
  // 'next'（前月の累計で判定）＝months の sales は前月の値＝今期の値は日次の合計。それ以外＝months の値（期首〜今日の累計）
  const salesNow = sb?.apply === "next" || !cur ? fromDays("sales") : cur.sales;
  const ptsNow = sb?.apply === "next" || !cur ? fromDays("pts") : cur.pts;
  if ((opts.salesOn ?? true) && (plan.salesSlide?.length ?? 0) > 0) return slideNextWageOf({ base, slides: plan.salesSlide!, value: salesNow, axis: "sales" });
  if ((opts.ptOn ?? true) && (plan.pointSlide?.length ?? 0) > 0) return slideNextWageOf({ base, slides: plan.pointSlide!, value: ptsNow, axis: "pt" });
  return null;
}
