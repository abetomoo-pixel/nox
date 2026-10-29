// ★0188（裁定433・2026-10-29・MIG_0188_APPLIED の client）: 源泉の税率表（運営側・店ごとではない）の TS 鏡＝DB を知らない純関数。
//   正本＝public.withholding_rates（0188 ★1・authenticated は SELECT だけ・行の追加は mig）。ここは「同じ 6 行」の写し＝明細・プレビュー・CSV・シミュの係数が
//   支払日で行を選ぶ（裁定433 ①＝計算期間ではなく支払った日）。率は 2 世代とも 1021 bp＝golden 不変（2027-01-01 の行は内訳だけ違う）。
//   計算＝withholding_calc（0188 ★2）と同式・整数（1 円未満切捨て・裁定431 ②）:
//     hostess＝floor((課税額 − 5,000×日数) × 1021 ÷ 10000)／other_204＝floor((min(課税額, 100 万)×1021 ＋ 超える部分×2042) ÷ 10000)／salesperson＝floor((累計 − 12 万×月数)×1021 ÷ 10000)
//   表の行が本番で増えたら（税理士 T19 の回答など）この写しも同じ mig の client 便で足す（suite verify:nox-0188 が本番の行数・率と突合）。

export type WithholdingRateKind = "hostess" | "other_204" | "salesperson";
export type WithholdingRateRow = {
  kind: WithholdingRateKind;
  /** 適用開始日（YYYY-MM-DD）＝支払日がこの日以降の行のうち最新を使う */
  validFrom: string;
  /** 率（bp＝1021＝10.21%） */
  rateBp: number;
  /** 控除（hostess＝5,000／日・salesperson＝120,000／月・other_204＝なし） */
  deduction: number | null;
  deductionUnit: "day" | "month" | null;
  /** 1 回の支払金額の閾値（other_204＝1,000,000）と超える部分の率（2042） */
  threshold: number | null;
  overRateBp: number | null;
  /** 内訳（表示用・所得税／復興特別所得税／防衛特別所得税の bp） */
  breakdown: { income_tax_bp: number; reconstruction_bp: number; defense_bp?: number };
};

/** 0188 ★1 の初期 6 行（kind × valid_from 2013-01-01／2027-01-01）＝本番と同じ順・同じ値 */
export const WITHHOLDING_RATES: readonly WithholdingRateRow[] = [
  { kind: "hostess", validFrom: "2013-01-01", rateBp: 1021, deduction: 5000, deductionUnit: "day", threshold: null, overRateBp: null, breakdown: { income_tax_bp: 1000, reconstruction_bp: 21 } },
  { kind: "hostess", validFrom: "2027-01-01", rateBp: 1021, deduction: 5000, deductionUnit: "day", threshold: null, overRateBp: null, breakdown: { income_tax_bp: 1000, reconstruction_bp: 11, defense_bp: 10 } },
  { kind: "other_204", validFrom: "2013-01-01", rateBp: 1021, deduction: null, deductionUnit: null, threshold: 1000000, overRateBp: 2042, breakdown: { income_tax_bp: 1000, reconstruction_bp: 21 } },
  { kind: "other_204", validFrom: "2027-01-01", rateBp: 1021, deduction: null, deductionUnit: null, threshold: 1000000, overRateBp: 2042, breakdown: { income_tax_bp: 1000, reconstruction_bp: 11, defense_bp: 10 } },
  { kind: "salesperson", validFrom: "2013-01-01", rateBp: 1021, deduction: 120000, deductionUnit: "month", threshold: null, overRateBp: null, breakdown: { income_tax_bp: 1000, reconstruction_bp: 21 } },
  { kind: "salesperson", validFrom: "2027-01-01", rateBp: 1021, deduction: 120000, deductionUnit: "month", threshold: null, overRateBp: null, breakdown: { income_tax_bp: 1000, reconstruction_bp: 11, defense_bp: 10 } },
];

/** 支払日（YYYY-MM-DD・省略＝今日）で行を選ぶ＝withholding_rate_of と同じ（valid_from ≤ 支払日 の最新・無ければ null） */
export function withholdingRateOf(kind: WithholdingRateKind, payDate?: string | null): WithholdingRateRow | null {
  const d = payDate && /^\d{4}-\d{2}-\d{2}$/.test(payDate) ? payDate : todayYmd();
  let hit: WithholdingRateRow | null = null;
  for (const r of WITHHOLDING_RATES) if (r.kind === kind && r.validFrom <= d && (!hit || r.validFrom > hit.validFrom)) hit = r;
  return hit;
}
const todayYmd = (): string => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

/** withholding_calc の鏡＝整数（bigint 相当の安全域＝課税額は 2^53 未満の整数）・行が無ければ null（RPC は 'no withholding rate'） */
export function withholdingCalcOf(kind: WithholdingRateKind | "manual" | "none" | null | undefined, taxable: number, days: number, payDate?: string | null): number | null {
  if (!kind || kind === "manual" || kind === "none") return 0;
  const r = withholdingRateOf(kind, payDate);
  if (!r) return null;
  const t = Math.max(0, Math.trunc(Number.isFinite(taxable) ? taxable : 0));
  const base = Math.max(0, t - (r.deduction === null ? 0 : r.deduction * Math.max(0, Math.trunc(Number.isFinite(days) ? days : 0))));
  const under = r.threshold === null ? base : Math.min(base, r.threshold);
  const over = base - under;
  const x = under * r.rateBp + over * (r.overRateBp ?? r.rateBp);
  return (x - (x % 10000)) / 10000;
}

/** 率の表示「10.21%」（bp→小数 2 桁・末尾 0 は残す） */
export const rateBpTextOf = (bp: number): string => `${(bp / 100).toFixed(2)}%`;
/** 給与画面の読取表示「源泉の率 10.21%（2027-01-01 から内訳変更）」＝次の世代の行があればその開始日を添える */
export function withholdingRateNoteOf(kind: WithholdingRateKind, payDate?: string | null): string | null {
  const r = withholdingRateOf(kind, payDate);
  if (!r) return null;
  const next = WITHHOLDING_RATES.filter((x) => x.kind === kind && x.validFrom > r.validFrom).sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0];
  return `源泉の率 ${rateBpTextOf(r.rateBp)}${next ? `（${next.validFrom} から内訳変更）` : ""}`;
}
