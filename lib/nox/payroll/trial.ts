// ★裁定490（2026-11-13 Agoora 確定の 12 点・0201l の後＝2026-11-16 結線）: 体入の期間と体入の日（集める側の純関数・DB を知らない）。
//   collect が casts の行と店の設定から体入の期間を決め、日ごとの集計から payOf の trialWageByDay・trialBackExclude の材料を作る。
//   payOf（lib/nox/pay.ts）の式は変えない＝ここで作るキーが無ければ従来と 1 バイト同値。
import { TRIAL_KIND } from "../cast/trial-flow";
import type { Metrics, TrialBackExclude } from "../pay";

export type TrialCastRow = {
  kind?: string | null; is_active?: boolean | null;
  trial_started_on?: string | null; joined_on?: string | null; created_at?: string | null;
  trial_ends_on?: string | null; trial_wage?: number | null; left_on?: string | null;
};
/** 体入の期間（end null＝まだ続いている） */
export type TrialRange = { start: string; end: string | null };

/** timestamptz → JST の日付（YYYY-MM-DD） */
export function jstDateOf(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 体入の開始日＝trial_started_on → joined_on → created_at（JST）（12 点の 8） */
export function trialStartOf(c: TrialCastRow): string | null {
  return c.trial_started_on ?? c.joined_on ?? (c.created_at ? jstDateOf(c.created_at) : null);
}

/**
 * 体入の期間（無ければ null）。
 * - 終わる日＝casts.trial_ends_on（0201l）。null で区分が体入かつ在籍中＝まだ続いている（end null）。null で区分が体入でない＝体入の日は無い。
 * - 終わる日が開始日より前＝体入の日は無い。
 * - ★B2-2（2026-11-16 相談役）: 終わる日が null・区分が体入・在籍でない（「見送り」でなく「退店」で外した体入＝cast_leave は trial_ends_on を書かない）＝退店日があれば開始日〜退店日を体入の期間。退店日も無ければ体入の日は無い（従来の式）。
 */
export function trialRangeOf(c: TrialCastRow): TrialRange | null {
  const start = trialStartOf(c);
  if (!start) return null;
  const end = c.trial_ends_on ?? null;
  if (end === null) {
    if (c.kind !== TRIAL_KIND) return null;
    if (c.is_active === true) return { start, end: null };
    const left = c.left_on ?? null;   // ★B2-2: 退店で外した体入＝退店日まで
    return left !== null && left >= start ? { start, end: left } : null;
  }
  return end < start ? null : { start, end };
}

export function inTrialRange(r: TrialRange, ymd: string): boolean {
  return ymd >= r.start && (r.end === null || ymd <= r.end);
}

/** 体入の時給＝本人（casts.trial_wage）＞店（settings_json.trial_wage）。どちらも無ければ null（12 点の 2・5） */
export function trialWageOf(castWage: number | null | undefined, storeWage: number | null | undefined): number | null {
  if (typeof castWage === "number" && Number.isInteger(castWage) && castWage >= 0) return castWage;
  if (typeof storeWage === "number" && Number.isInteger(storeWage) && storeWage >= 0) return storeWage;
  return null;
}

/** 日ごとの集計（collect が営業日で積む）。無い日は 0 */
export type TrialDaySource = {
  sales: { bizDate: string; sales: number; hon: number; jonai: number; dohan: number }[];
  shimeiAmt: Map<string, { hon: number; jonai: number }>;                                        // bizDate → 指名料（率バックの母数）
  backs: Map<string, { drink: number; champ: number; bottle: number; pt: number; calc: number }>;   // bizDate → 商品バック・pt 商品・calculatedBack
  champBottle: Map<string, { champCnt: number; bottleCnt: number }>;                               // bizDate → 本数
};

export type TrialRaw = {
  wage: number;
  dates: string[];               // 体入の時給を当てる日＝体入の期間の中で出勤した日（実働 > 0）＝内訳の体入の日数（(c)）
  exclude?: TrialBackExclude;    // バック「なし」のときだけ＝体入の期間の営業日の分（出勤の有無を問わない＝売上・指名はその日に付いた分）
};

/**
 * cast 1 人の体入の材料（体入の時給が無い・期間が期に掛からない＝null）。
 * daily＝CastRaw.daily（営業日・売上・実働）。back＝店の trial_back（none のときだけ除外を作る）。
 */
export function trialRawOf(
  range: TrialRange | null,
  wage: number | null,
  back: "same" | "none",
  daily: readonly { bizDate: string; hours: number }[],
  src: TrialDaySource,
): TrialRaw | null {
  if (!range || wage === null) return null;
  // 期の営業日（実働・売上・指名・商品のどれか）に体入の期間が掛からない＝体入の式を当てない（除外を 0 で作らない）
  const touches = daily.some((d) => inTrialRange(range, d.bizDate)) || src.sales.some((r) => inTrialRange(range, r.bizDate))
    || [...src.shimeiAmt.keys(), ...src.backs.keys(), ...src.champBottle.keys()].some((d) => inTrialRange(range, d));
  if (!touches) return null;
  const dates = daily.filter((d) => d.hours > 0 && inTrialRange(range, d.bizDate)).map((d) => d.bizDate);
  let exclude: TrialBackExclude | undefined;
  if (back === "none") {
    const inR = (d: string) => inTrialRange(range, d);
    const x = { hon: 0, jonai: 0, dohan: 0, honShimeiAmt: 0, jonaiShimeiAmt: 0, drink: 0, champ: 0, bottle: 0, calculated: 0, sales: 0 };
    const m: Partial<Metrics> = { hon: 0, jonai: 0, dohan: 0, sales: 0, pt: 0, champCnt: 0, bottleCnt: 0, days: dates.length };
    for (const r of src.sales) if (inR(r.bizDate)) { x.hon += r.hon; x.jonai += r.jonai; x.dohan += r.dohan; x.sales += r.sales; }
    for (const [d, v] of src.shimeiAmt) if (inR(d)) { x.honShimeiAmt += v.hon; x.jonaiShimeiAmt += v.jonai; }
    for (const [d, v] of src.backs) if (inR(d)) { x.drink += v.drink; x.champ += v.champ; x.bottle += v.bottle; x.calculated += v.calc; m.pt! += v.pt; }
    for (const [d, v] of src.champBottle) if (inR(d)) { m.champCnt! += v.champCnt; m.bottleCnt! += v.bottleCnt; }
    m.hon = x.hon; m.jonai = x.jonai; m.dohan = x.dohan; m.sales = x.sales;
    exclude = { ...x, metrics: m };
  }
  if (dates.length === 0 && !exclude) return null;
  return { wage, dates, ...(exclude ? { exclude } : {}) };
}

/** 体入の期間が期の営業日に掛かるか（体入の時給が未設定の注意を出すかの判定＝12 点の 2） */
export function trialTouchesOf(range: TrialRange | null, daily: readonly { bizDate: string; hours: number; sales: number }[]): boolean {
  return !!range && daily.some((d) => (d.hours > 0 || d.sales > 0) && inTrialRange(range, d.bizDate));
}
