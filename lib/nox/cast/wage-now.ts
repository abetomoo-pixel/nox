// ★便 P174 T-5（GV-55／GV-56・ex_plan R-11）: 「今の時給」の解決を 1 本に（一覧カード・詳細・/mine の印が同じ関数）。DB を知らない純関数。
//   保存先＝cast_plan の行（valid_from／valid_to・overrides_json {base, guarantee: true}）＝期限付き保証は 3 行形（set_cast_guarantee）。
//   base＝待遇プランの基本時給 → 非保証行の overrides.base（個別上書き）。guarantee＝今日を含む保証行（guaranteeStateOf）。
//   hourly＝max(スライドの段の時給（最後の営業日が売上／pt 段のとき）, 保証額, base)。
//   接尾＝保証が効いている＝「保証（M/D まで）」／売上段／pt 段／それ以外＝「基本」（GV-55＝保証行が無いのに「保証」と出ていた）。
import { guaranteeStateOf, mdOf, type PlanRowLike } from "./guarantee";

export type WageSuffix = "guarantee" | "sales" | "pt" | "base";
export type WageNow = {
  base: number;                                                   // 基本時給（プラン→非保証の個別上書き）
  guarantee: { amount: number; to: string | null; daysLeft: number | null } | null; // 今日を含む保証
  hourly: number;                                                 // 今の時給
  suffix: WageSuffix;
  suffixLabel: string;                                            // 「保証（10/18 まで）」「売上段」「pt 段」「基本」
  overridden: boolean;                                            // 非保証のキーで個別上書きがあるか（「個別上書きあり」の判定）
};

const ovOf = (r: PlanRowLike): Record<string, unknown> => (r.overrides_json && typeof r.overrides_json === "object" ? (r.overrides_json as Record<string, unknown>) : {});
const isG = (r: PlanRowLike) => ovOf(r).guarantee === true;

/** 今日に効く非保証行（無ければ今日より前に始まった最後の非保証行・それも無ければ最初の非保証行） */
export function baseRowOf(rows: readonly PlanRowLike[], today: string): PlanRowLike | null {
  const ng = rows.filter((r) => !isG(r)).slice().sort((a, b) => (a.valid_from < b.valid_from ? -1 : a.valid_from > b.valid_from ? 1 : 0));
  return ng.find((r) => r.valid_from <= today && (r.valid_to === null || today <= r.valid_to))
    ?? [...ng].reverse().find((r) => r.valid_from <= today)
    ?? ng[0] ?? null;
}

export function wageNowOf(input: { planBase: number | null | undefined; rows: readonly PlanRowLike[]; today: string; lastDay?: { hourly?: number; basis?: string } | null }): WageNow {
  const br = baseRowOf(input.rows, input.today);
  const ov = br ? ovOf(br) : {};
  const base = Math.max(0, Math.round(typeof ov.base === "number" ? (ov.base as number) : Number(input.planBase ?? 0)));
  const overridden = Object.keys(ov).some((k) => k !== "guarantee");
  const st = guaranteeStateOf(input.rows, input.today);
  const guarantee = st.current ? { amount: st.current.base, to: st.current.to, daysLeft: st.daysLeft } : null;
  const lb = input.lastDay?.basis;
  const slide = lb === "売上" || lb === "pt" ? Math.max(0, Math.round(Number(input.lastDay?.hourly ?? 0))) : 0;
  const hourly = Math.max(slide, guarantee?.amount ?? 0, base);
  const suffix: WageSuffix = guarantee && guarantee.amount >= slide && guarantee.amount >= base ? "guarantee"
    : slide > base && slide === hourly ? (lb === "pt" ? "pt" : "sales")
    : "base";
  const suffixLabel = suffix === "guarantee" ? `保証${guarantee?.to ? `（${mdOf(guarantee.to)} まで）` : ""}` : suffix === "sales" ? "売上段" : suffix === "pt" ? "pt 段" : "基本";
  return { base, guarantee, hourly, suffix, suffixLabel, overridden };
}
