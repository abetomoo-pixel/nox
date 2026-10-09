// ★夜間便 N3b（裁定288・2026-09-18）: スライドの基準と適用月＝純関数（DB を知らない）。
//   slide_apply='next'（翌月反映）: 段の判定に使う実績＝「その営業日が属する暦月の前月」の売上合計／ポイント合計（閾値は月間合計）。
//   'current' または欠損・不正値: 現行どおり（営業日ごとの売上・ポイント＝閾値は 1 日あたり）。既存店と golden は不変。
export type SlideApply = "next" | "current";

/** stores.settings_json.slide_apply → 'next' のときだけ 'next'。欠損・不正値は 'current'（288-4） */
export function slideApplyOf(settings: unknown): SlideApply {
  const v = settings && typeof settings === "object" ? (settings as Record<string, unknown>).slide_apply : undefined;
  return v === "next" ? "next" : "current";
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export const monthOf = (ymd: string): string => ymd.slice(0, 7);

/** 'YYYY-MM' の前月 */
export function prevMonthOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 'YYYY-MM' の末日 'YYYY-MM-DD'（暦月） */
export function lastDayOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${ym}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 期（start〜end・'YYYY-MM-DD'）に含まれる暦月の一覧（昇順・重複なし）＝期が月をまたげば 2 つ以上 */
export function monthsInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = monthOf(start);
  const last = monthOf(end);
  while (cur <= last) { out.push(cur); cur = nextMonthOf(cur); if (out.length > 24) break; }
  return out;
}
export function nextMonthOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ★裁定338＋追補1（0168・便 P168・2026-10-09）: スライドの判定期間（プラン列 comp_plans.slide_period）。
//   monthly＝月の累計売上（按分後）／pt で段を決め、その月の全勤務時間に適用。half＝1〜15 日（H1）／16〜末日（H2）の累計で同じ。daily＝その日（現状）。
//   確定時は期間全体の累計で段確定・プレビューは期首〜今日の累計で暫定（provisional）。slide_apply='next'（店設定）は「前の期間の累計」として両立。pay.ts は不変。
export type SlidePeriod = "monthly" | "half" | "daily";
export const slidePeriodOf = (v: unknown): SlidePeriod => (v === "monthly" || v === "half" ? v : "daily");
export type SlideTotals = Record<string, { sales: number; pts: number }>;

/** 期間キー: monthly→'YYYY-MM'・half→'YYYY-MM-H1'（1〜15）／'YYYY-MM-H2'（16〜末）・daily→'YYYY-MM-DD' */
export function periodKeyOf(ymd: string, period: SlidePeriod): string {
  if (period === "monthly") return ymd.slice(0, 7);
  if (period === "half") return `${ymd.slice(0, 7)}-${Number(ymd.slice(8, 10)) <= 15 ? "H1" : "H2"}`;
  return ymd;
}
/** 期間キー→暦日の範囲（両端含む） */
export function periodRangeOfKey(key: string): { start: string; end: string } {
  if (/^\d{4}-\d{2}$/.test(key)) return { start: `${key}-01`, end: lastDayOf(key) };
  if (/^\d{4}-\d{2}-H[12]$/.test(key)) { const ym = key.slice(0, 7); return key.endsWith("H1") ? { start: `${ym}-01`, end: `${ym}-15` } : { start: `${ym}-16`, end: lastDayOf(ym) }; }
  return { start: key, end: key };
}
/** 前の期間（'next' 用）: monthly＝前月／H1＝前月の H2／H2＝同月の H1／daily＝前日 */
export function prevPeriodKeyOf(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) return prevMonthOf(key);
  if (/^\d{4}-\d{2}-H[12]$/.test(key)) { const ym = key.slice(0, 7); return key.endsWith("H2") ? `${ym}-H1` : `${prevMonthOf(ym)}-H2`; }
  const d = new Date(Date.parse(`${key}T00:00:00Z`) - 86_400_000);
  return d.toISOString().slice(0, 10);
}
/** 期（start〜end）に含まれる期間キー（昇順・重複なし） */
export function periodKeysInRange(start: string, end: string, period: SlidePeriod): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const k = periodKeyOf(new Date(t).toISOString().slice(0, 10), period);
    if (out[out.length - 1] !== k) out.push(k);
    if (out.length > 120) break;
  }
  return out;
}
/** 表示ラベル: '2026-10'→'10月'・H1→'10月前半（1〜15日）'・H2→'10月後半（16〜末日）'・日→'10/9' */
export function periodLabelOf(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) return `${Number(key.slice(5, 7))}月`;
  if (/^\d{4}-\d{2}-H[12]$/.test(key)) return `${Number(key.slice(5, 7))}月${key.endsWith("H1") ? "前半（1〜15日）" : "後半（16〜末日）"}`;
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}
export const SLIDE_PERIOD_LABEL: Record<SlidePeriod, string> = { monthly: "月次", half: "半月", daily: "日次" };
/** 判定の説明文（UI 共通・「翌日以降」は使わない） */
export function slideDescOf(period: SlidePeriod, basis: "yen" | "pt", next: boolean): string {
  const what = basis === "yen" ? "売上（按分後）" : "ポイント";
  if (period === "monthly") return next ? `前月の累計${what}で段を決め、当月の時給に適用します。` : `月の累計${what}で段を決め、その月の時給に適用します。`;
  if (period === "half") return next ? `前の半月の累計${what}で段を決め、当半月の時給に適用します。` : `1〜15 日・16〜末日の累計${what}で段を決め、その半月の時給に適用します。`;
  return next ? `前月の${what}の合計で段を決め、当月の時給に適用します。` : `その日の${what}で段を決め、その日の時給に適用します。`;
}
/** 青ピルの文（判定期間） */
export function slidePillOf(period: SlidePeriod, next: boolean): string {
  const p = SLIDE_PERIOD_LABEL[period];
  return period === "daily" ? (next ? "判定期間: 日次（前月基準＝店設定 slide_apply）" : "判定期間: 日次（その日の売上・ポイント）") : `判定期間: ${p}（${next ? "前の期間" : "期間"}の累計・確定で段確定／プレビューは暫定）`;
}
/** 入力欄の単位ラベル */
export function slideAtLabelOf(period: SlidePeriod, basis: "yen" | "pt"): string {
  const w = period === "monthly" ? "月の累計" : period === "half" ? "半月の累計" : "1 日の";
  return basis === "yen" ? `以上（${w}売上）` : `pt 以上（${w}）`;
}
/** 凍結形（breakdown_json.slideBasis）: pay.ts が作る 'next' 形の months を期間形へ（apply＝期間・provisional＝期首〜今日の暫定・prevMonth＝元の期間キー） */
export function slideBasisForPeriodOf(basis: { months: { month: string; prevMonth: string; sales: number; pts: number; salesWage: number; ptsWage: number }[] }, period: SlidePeriod, provisional: boolean, next: boolean) {
  return { apply: period, provisional, months: basis.months.map((m) => ({ ...m, prevMonth: next ? prevPeriodKeyOf(m.month) : m.month })) };
}
