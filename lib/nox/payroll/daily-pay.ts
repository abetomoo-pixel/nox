// ★便 SH-UI-c2 C2-3（2026-10-23）: 日別の算定給与（純関数・DB を知らない）。
//   時給分＝その日の rate(d)×実働 h＝pay.ts wageDetail の wdays（hourly＝max(保証, 段, 基本)）をそのまま日に写す（PR-1 の wage-spans と同じ系列）。
//   バック＝本指名・場内・同伴（per_count＝本数×単価／rate＝その日の指名料行×%）＋ドリンク・シャンパン・ボトル（check_cast_backs の凍結値を営業日で合算）＋plan 方式の凍結 Σ。
//   罰金・減額＝payroll_adjustments のうち日に紐づく行（I-3 制裁＝target_shift_id／I-5 ノルマ未達＝biz_date）。
//   日計＝時給分＋バック−罰金。月でしか決まらない項目（スライドの判定・源泉・固定控除・前借り・送り・売上バック・手当・丸め）は日に割らず
//   「月のまとめ」＝①月で決まる支給（gross−Σ(時給分＋バック)）②控除（(gross−net)−Σ罰金）③差引＝net。恒等: Σ日計＋①−②＝net（suite で golden と突合）。
import { roundYen } from "../money";

export type WageDayLike = { d: number; hours: number; hourly: number };
export type DailyBackInput = { bizDate: string; hon: number; jonai: number; dohan: number; honAmt: number; jonaiAmt: number; drink: number; champ: number; bottle: number; calc: number };
export type BackPlanLike = { honBack: number; jonaiBack: number; dohanBack: number; honBackMode?: "per_count" | "rate"; honBackRate?: number | null; jonaiBackMode?: "per_count" | "rate"; jonaiBackRate?: number | null };
export type DailyFineInput = { amount: number; reason: string; source: string; biz_date?: string | null; target_shift_id?: string | null };
export type DailyBacks = { hon: number; jonai: number; dohan: number; drink: number; champ: number; bottle: number; calc: number; total: number };
export type DailyPayRow = { bizDate: string; hours: number; hourly: number | null; wage: number; backs: DailyBacks; fine: number; fineNotes: string[]; total: number };
export type MonthSummaryRow = { key: "month_adj" | "deductions" | "net"; label: string; amount: number };
export type MonthSummary = { rows: MonthSummaryRow[]; sumDaily: number; identityOk: boolean; frozen: boolean };

export const BACK_LABEL: Record<keyof Omit<DailyBacks, "total">, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", drink: "ドリンク", champ: "シャンパン", bottle: "ボトル", calc: "商品（プラン）" };

/** 'YYYY-MM' ＋ 日番号 → 'YYYY-MM-DD' */
export const bizDateOfD = (period: string, d: number): string => `${period}-${String(d).padStart(2, "0")}`;

/** 時給分（日別）＝roundYen(hourly×hours)。hours 0 の日は 0（行は作らない） */
export function dailyWageOf(wdays: readonly WageDayLike[], period: string): Map<string, { hours: number; hourly: number; wage: number }> {
  const m = new Map<string, { hours: number; hourly: number; wage: number }>();
  for (const w of wdays) {
    if (!(w.hours > 0)) continue;
    const k = bizDateOfD(period, w.d);
    const cur = m.get(k) ?? { hours: 0, hourly: w.hourly, wage: 0 };
    cur.hours += w.hours; cur.hourly = w.hourly; cur.wage = roundYen(cur.hourly * cur.hours);
    m.set(k, cur);
  }
  return m;
}

/** バック（日別）＝pay.ts の指名バック式を日に写す（rate は日ごとに roundYen＝月の 1 回丸めとの差は「月のまとめ」が吸収） */
export function dailyBacksOf(plan: BackPlanLike | null, rows: readonly DailyBackInput[]): Map<string, DailyBacks> {
  const m = new Map<string, DailyBacks>();
  for (const r of rows) {
    const hon = plan ? (plan.honBackMode === "rate" ? roundYen((r.honAmt * (plan.honBackRate ?? 0)) / 100) : r.hon * plan.honBack) : 0;
    const jonai = plan ? (plan.jonaiBackMode === "rate" ? roundYen((r.jonaiAmt * (plan.jonaiBackRate ?? 0)) / 100) : r.jonai * plan.jonaiBack) : 0;
    const dohan = plan ? r.dohan * plan.dohanBack : 0;
    const cur = m.get(r.bizDate) ?? { hon: 0, jonai: 0, dohan: 0, drink: 0, champ: 0, bottle: 0, calc: 0, total: 0 };
    cur.hon += hon; cur.jonai += jonai; cur.dohan += dohan; cur.drink += r.drink; cur.champ += r.champ; cur.bottle += r.bottle; cur.calc += r.calc;
    cur.total = cur.hon + cur.jonai + cur.dohan + cur.drink + cur.champ + cur.bottle + cur.calc;
    m.set(r.bizDate, cur);
  }
  return m;
}

/** 罰金・減額（日別）＝biz_date があればその日・無ければ target_shift_id→シフトの日。どちらも無い行（月の調整）は対象外 */
export function dailyFinesOf(adjs: readonly DailyFineInput[], shiftDateById: ReadonlyMap<string, string>): Map<string, { amount: number; notes: string[] }> {
  const m = new Map<string, { amount: number; notes: string[] }>();
  for (const a of adjs) {
    const d = a.biz_date ?? (a.target_shift_id ? shiftDateById.get(a.target_shift_id) ?? null : null);
    if (!d || !(a.amount > 0)) continue;
    const cur = m.get(d) ?? { amount: 0, notes: [] };
    cur.amount += a.amount; cur.notes.push(`${a.reason}（¥${a.amount.toLocaleString("en-US")}）`);
    m.set(d, cur);
  }
  return m;
}

export const ZERO_BACKS: DailyBacks = { hon: 0, jonai: 0, dohan: 0, drink: 0, champ: 0, bottle: 0, calc: 0, total: 0 };

/** 日別の行＝dates（表の行の日付）∪ 時給分／バック／罰金のある日。並びは日付昇順 */
export function dailyPayRowsOf(input: { dates: readonly string[]; wage: ReadonlyMap<string, { hours: number; hourly: number; wage: number }>; backs: ReadonlyMap<string, DailyBacks>; fines: ReadonlyMap<string, { amount: number; notes: string[] }> }): DailyPayRow[] {
  const dates = new Set<string>([...input.dates, ...input.wage.keys(), ...input.backs.keys(), ...input.fines.keys()]);
  return [...dates].sort().map((bizDate) => {
    const w = input.wage.get(bizDate), b = input.backs.get(bizDate) ?? ZERO_BACKS, f = input.fines.get(bizDate);
    const wage = w?.wage ?? 0, fine = f?.amount ?? 0;
    return { bizDate, hours: w?.hours ?? 0, hourly: w?.hourly ?? null, wage, backs: b, fine, fineNotes: f?.notes ?? [], total: wage + b.total - fine };
  });
}

/** 月のまとめ＝①月で決まる支給 ②控除 ③差引。恒等 Σ日計＋①−②＝net を identityOk で返す（suite が golden と突合） */
export function monthSummaryOf(input: { gross: number; net: number; rows: readonly DailyPayRow[]; frozen?: boolean }): MonthSummary {
  const sumWageBacks = input.rows.reduce((a, r) => a + r.wage + r.backs.total, 0);
  const sumFine = input.rows.reduce((a, r) => a + r.fine, 0);
  const sumDaily = input.rows.reduce((a, r) => a + r.total, 0);
  const monthAdj = input.gross - sumWageBacks;
  const deductions = (input.gross - input.net) - sumFine;
  const rows: MonthSummaryRow[] = [
    { key: "month_adj", label: "月で決まる支給（スライド調整・売上バック・手当・丸め）", amount: monthAdj },
    { key: "deductions", label: "控除（固定・源泉・前借り・送り・月の調整）", amount: deductions },
    { key: "net", label: input.frozen ? "差引支給額（確定）" : "差引支給額（現時点）", amount: input.net },
  ];
  return { rows, sumDaily, identityOk: sumDaily + monthAdj - deductions === input.net, frozen: !!input.frozen };
}

/** 表示＝「¥12,300」・0 は「—」（罰金は「−¥2,000」） */
export const yenCellOf = (n: number, opts: { neg?: boolean } = {}): string => (n === 0 ? "—" : `${opts.neg ? "−" : n < 0 ? "−" : ""}¥${Math.abs(n).toLocaleString("en-US")}`);

/** バックの内訳（ホバー／折りたたみ）＝0 の種別は出さない */
export const backsDetailTextOf = (b: DailyBacks): string =>
  (Object.keys(BACK_LABEL) as (keyof typeof BACK_LABEL)[]).filter((k) => b[k] !== 0).map((k) => `${BACK_LABEL[k]} ¥${b[k].toLocaleString("en-US")}`).join("・") || "—";

/** 1 人の表の列（CSV・印刷も同じ順・attendance-sheet の SHEET_COLUMNS の後ろに足す） */
export const DAILY_PAY_COLUMNS = ["時給分", "バック", "罰金・減額", "日計"] as const;
export const dailyPayCellsOf = (p: DailyPayRow | null | undefined): string[] => (p ? [String(p.wage), String(p.backs.total), String(p.fine), String(p.total)] : ["", "", "", ""]);

/** 合計表（人ごと）の 4 列＝時給分｜バック｜罰金・減額｜現時点の差引支給（＝給与画面の同じ人の net） */
export type CastPayTotals = { wage: number; backs: number; fine: number; net: number; frozen: boolean };
export const castPayTotalsOf = (rows: readonly DailyPayRow[], net: number, frozen: boolean): CastPayTotals =>
  ({ wage: rows.reduce((a, r) => a + r.wage, 0), backs: rows.reduce((a, r) => a + r.backs.total, 0), fine: rows.reduce((a, r) => a + r.fine, 0), net, frozen });
export const sumCastPayTotalsOf = (list: readonly (CastPayTotals | null | undefined)[]): CastPayTotals => {
  const xs = list.filter((x): x is CastPayTotals => !!x);
  return { wage: xs.reduce((a, x) => a + x.wage, 0), backs: xs.reduce((a, x) => a + x.backs, 0), fine: xs.reduce((a, x) => a + x.fine, 0), net: xs.reduce((a, x) => a + x.net, 0), frozen: xs.length > 0 && xs.every((x) => x.frozen) };
};
/** 注記＝未確定の月は「現時点（10/23 まで）」・確定済みは「確定」 */
export const payTotalsNoteOf = (frozen: boolean, todayBiz: string): string => (frozen ? "確定" : `現時点（${Number(todayBiz.slice(5, 7))}/${Number(todayBiz.slice(8, 10))} まで）`);
