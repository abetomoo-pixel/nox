// ★便 X13-I I-5（裁定410 追補・2026-10-21）: ノルマ未達の減額の「提案」（純関数・DB を知らない）。
//   検知が有効（penalty_config.norm_on）かつ店が採用している軸だけ・未達の軸ごとに「定額」か「不足 1 件（売上は単位）ごと」（裁定373 の 1 方式）。
//   委託＝提案額のまま（店が適用→精算調整の行・source 'settlement'・増額不可）。
//   雇用＝懲戒減給（労基法 91 条）＝1 回＝平均賃金の半額・当期合計＝賃金総額の 1/10（既存の懲戒減給の合計を引いた残り）でキャップ。平均賃金が算定できない（前 3 か月の確定期なし）＝算定不能。
//   就業規則に減給の定めがある店だけ雇用の提案を出す（店設定の保存先は 0176＝今は常に「定めの記録なし」）。
export type NormAxis4 = "days" | "dohan" | "shimei" | "sales";
export type NormPenalty4 = { on: boolean; days: { flat: number; per: number }; dohan: { flat: number; per: number }; shimei: { flat: number; per: number }; sales: { flat: number; per: number; unit: number } };
export type NormProposalItem = { axis: NormAxis4; target: number; actual: number; short: number; amount: number; text: string };
export type NormProposal = {
  employment: "委託" | "雇用";
  items: NormProposalItem[];
  total: number; // 計算額の合計
  proposed: number; // 提案額（委託＝total・雇用＝上限でキャップ）
  capped: boolean; // 雇用で上限に当たった
  cap: number | null; // 雇用の上限（1 回・当期残りの小さいほう）
  status: "ok" | "incalculable" | "no_rule"; // 雇用＝算定不能／就業規則の定めなし
  note: string | null;
};
const AXIS_LABEL: Record<NormAxis4, string> = { days: "出勤日数", dohan: "同伴", shimei: "指名", sales: "売上" };
const UNIT: Record<NormAxis4, string> = { days: "日", dohan: "本", shimei: "回", sales: "" };
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/** 1 軸の提案（未達でなければ null）。per＞0＝不足ごと・それ以外は定額（どちらも 0＝null） */
export function normAxisItemOf(axis: NormAxis4, target: number, actual: number, cfg: NormPenalty4): NormProposalItem | null {
  if (!(target > 0) || actual >= target) return null;
  const c = cfg[axis] as { flat: number; per: number; unit?: number };
  const per = c.per > 0 ? c.per : 0, flat = c.flat > 0 ? c.flat : 0;
  if (per === 0 && flat === 0) return null;
  const shortRaw = target - actual;
  if (axis === "sales") {
    const unit = Math.max(1, (cfg.sales.unit || 10000));
    if (per > 0) { const n = Math.ceil(shortRaw / unit); return { axis, target, actual, short: shortRaw, amount: n * per, text: `売上 不足 ${yen(shortRaw)}（${yen(unit)} ごとに ${n}）× ${yen(per)} ＝ ${yen(n * per)}` }; }
    return { axis, target, actual, short: shortRaw, amount: flat, text: `売上 不足 ${yen(shortRaw)}（定額）＝ ${yen(flat)}` };
  }
  if (per > 0) return { axis, target, actual, short: shortRaw, amount: shortRaw * per, text: `${AXIS_LABEL[axis]} 不足 ${shortRaw} ${UNIT[axis]} × ${yen(per)} ＝ ${yen(shortRaw * per)}` };
  return { axis, target, actual, short: shortRaw, amount: flat, text: `${AXIS_LABEL[axis]} 不足 ${shortRaw} ${UNIT[axis]}（定額）＝ ${yen(flat)}` };
}

export function normProposalOf(input: {
  cfg: NormPenalty4; axes: Record<NormAxis4, boolean>;
  targets: Partial<Record<NormAxis4, number | null>>; actual: Record<NormAxis4, number>;
  employment: "委託" | "雇用" | null;
  /** 雇用: 平均賃金（直近 3 確定期・null＝算定不能） */ avgDailyWage?: number | null;
  /** 雇用: 当期の賃金総額（支給合計） */ gross?: number;
  /** 雇用: 当期に既に記録した懲戒減給の合計 */ sanctionSoFar?: number;
  /** 雇用: 就業規則に減給の定めがある（店設定・保存先は 0176） */ hasWorkRule?: boolean;
}): NormProposal | null {
  if (!input.cfg.on || !input.employment) return null;
  const items = (["days", "dohan", "shimei", "sales"] as NormAxis4[])
    .filter((a) => input.axes[a])
    .map((a) => normAxisItemOf(a, Number(input.targets[a] ?? 0), Number(input.actual[a] ?? 0), input.cfg))
    .filter((x): x is NormProposalItem => !!x);
  if (items.length === 0) return null;
  const total = items.reduce((s, x) => s + x.amount, 0);
  if (input.employment === "委託") return { employment: "委託", items, total, proposed: total, capped: false, cap: null, status: "ok", note: null };
  if (!input.hasWorkRule) return { employment: "雇用", items, total, proposed: 0, capped: false, cap: null, status: "no_rule", note: "就業規則に定めがある場合のみ使えます" };
  if (input.avgDailyWage == null || !(input.avgDailyWage > 0)) return { employment: "雇用", items, total, proposed: 0, capped: false, cap: null, status: "incalculable", note: "算定不能（平均賃金の算出に前 3 か月の賃金が必要です）" };
  const capEach = Math.floor(input.avgDailyWage / 2);
  const capLeft = Math.max(0, Math.floor((input.gross ?? 0) / 10) - (input.sanctionSoFar ?? 0));
  const cap = Math.min(capEach, capLeft);
  const capped = total > cap;
  return { employment: "雇用", items, total, proposed: capped ? cap : total, capped, cap, status: "ok", note: capped ? `上限で ${yen(cap)} に制限（1 回＝平均賃金の半額 ${yen(capEach)}・当期合計＝賃金総額の 1/10 の残り ${yen(capLeft)}）` : null };
}

/** 適用の金額検査（増額不可・0 以上の整数） */
export function normApplyErrOf(proposed: number, amount: number): string | null {
  if (!Number.isInteger(amount) || amount < 0) return "金額は 0 円以上の整数で入力してください";
  if (amount > proposed) return `提案額（${yen(proposed)}）より多くはできません`;
  return null;
}
/** 精算調整（委託）の理由＝「ノルマ未達（10月・指名 不足 12 回）」（明細に載る・内訳は先頭 2 軸まで） */
export function normReasonOf(period: string, items: readonly NormProposalItem[]): string {
  const m = Number(period.slice(5, 7));
  const parts = items.map((x) => (x.axis === "sales" ? `売上 不足 ${yen(x.short)}` : `${AXIS_LABEL[x.axis]} 不足 ${x.short} ${UNIT[x.axis]}`));
  return `ノルマ未達（${m}月・${parts.join("・")}）`.slice(0, 200);
}
export const NORM_REASON_PREFIX = "ノルマ未達（";
