// ★裁定303（2026-09-25）: 給与明細の「支給／控除」の行を作る単一の純関数（DB を知らない）。
//   303-1: 給与 run 明細の右パネル（preview の PayResult）と PayslipSlip（payslips.breakdown_json.pay）が同じ関数を使う＝同じ行・同じ順・同じ値。
//          残り物の行（「その他バック」「その他」）は作らない＝gross／控除計の各項を名前のある行で全部出す。
//   303-2: 時給行は報酬型に時給を含む cast（actual／shift_guarantee）では 0h でも出す（「時給 ¥n/h × 0h」）。雇用は常に出す。
//          fixed＝「固定給（按分）」・per_shift＝「1稼働 ¥n × k回」＝その報酬型の時間行として常に出す。非表示は「その報酬型に存在しない行」だけ。
//   303-3: 一覧の時間セル＝hoursCellOf（0h かつ日数>0 なら「打刻なし／不完全」（303 追補1 の文言）を薄字で・値は変えない）。
//   恒等（pay.ts と同じ）: net = gross − (fixedDed+fine+withholding+ar+adv+okuri+normPenalty+adjBefore+adjAfter) + adjustOverflow。
//   ★extras（出勤ボーナス等）は gross に内在（裁定26）＝行としては出すが合計に二重加算しない。
import type { FrozenAdjustment } from "./adjust";

export type BreakdownPayLike = {
  wage?: number; wHours?: number; timePay?: number;
  payRule?: { rule?: string; guaranteedHours?: number; fixedAmount?: number; calcDays?: number; periodDays?: number; perShiftAmount?: number; shiftCount?: number } | null;
  guarantee?: { spans: { from: string; to: string | null; base: number }[]; baseHours: number; basePay: number; guaHours: number; guaPay: number } | null;
  slideBasis?: { apply?: string; months: { month: string; prevMonth: string; sales: number; pts: number; salesWage: number; ptsWage: number }[] } | null;
  honBack?: number; jonaiBack?: number; dohanBack?: number;
  drinkBack?: number; champBack?: number; bottleBack?: number; calculatedBack?: number; salesBack?: number;
  customTotal?: number; cbacks?: { name?: string; amount?: number }[];
  achievementBonus?: number; guaranteeAdd?: number;
  gross?: number;
  fixedDed?: number; sanction?: { original?: number; applied?: number } | null; fine?: number; withholding?: number; normPenalty?: number;
  arDeduct?: number; advanceDeduct?: number; okuriDeduct?: number;
  adjBefore?: number; adjAfter?: number; adjustOverflow?: number;
  taxMode?: string; net?: number;
};
export type BreakdownExtra = { kind: string; amount: number; label?: string };
export type BreakdownLine = {
  key: string; label: string; amount: number;
  /** 内訳の内訳（「うち基本」等）＝合計に足さない */
  sub?: boolean;
  /** 情報行（スライドの段など）＝合計に足さない・金額列は参考値 */
  info?: boolean;
};
export type BreakdownInput = {
  pay: BreakdownPayLike;
  extras?: BreakdownExtra[];
  /** 凍結された調整控除（show_detail=true の行）。無ければ adjBefore／adjAfter の合計行だけ */
  adjustments?: { before: FrozenAdjustment[]; after: FrozenAdjustment[] };
  /** payslip 用: 渡されたら breakdown の ar／adv／okuri（deducted 合計）を優先（旧 slip と同じ出所・pa(7-6) の fixture は pay.arDeduct 0 で ar 400）。無ければ pay の arDeduct 等（給与右パネル） */
  deducted?: { ar?: number; adv?: number; okuri?: number };
  employment?: "委託" | "雇用" | null;
};
export type Breakdown = { earn: BreakdownLine[]; ded: BreakdownLine[]; earnTotal: number; dedTotal: number; net: number; whLabel: string; overflow: number };

const yen = (n: number) => "¥" + n.toLocaleString("en-US");
const z = (v: number | undefined | null) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 源泉行のラベル（凍結 taxMode・旧データは「源泉」） */
export function whLabelOf(taxMode: string | null | undefined): string {
  return taxMode === "委託" ? "源泉（報酬・料金）" : taxMode === "雇用" ? "源泉（給与）" : "源泉";
}

/** 時間行（303-2）＝報酬型ごとの 1 行。常に返す（0 でも出す） */
export function timeLineOf(pay: BreakdownPayLike): BreakdownLine {
  const rule = pay.payRule?.rule ?? "actual";
  const wage = z(pay.wage), h = z(pay.wHours), amt = z(pay.timePay);
  if (rule === "fixed") {
    const pr = pay.payRule ?? {};
    const prorate = pr.calcDays != null && pr.periodDays != null && pr.calcDays !== pr.periodDays ? `・${pr.calcDays}/${pr.periodDays} 日按分` : "";
    return { key: "timePay", label: `固定給${pr.fixedAmount != null ? ` ${yen(z(pr.fixedAmount))}` : ""}${prorate}`, amount: amt };
  }
  if (rule === "per_shift") {
    const pr = pay.payRule ?? {};
    return { key: "timePay", label: `1稼働 ${yen(z(pr.perShiftAmount))} × ${z(pr.shiftCount)}回`, amount: amt };
  }
  if (rule === "shift_guarantee") {
    return { key: "timePay", label: `時給 ${yen(wage)}/h × ${z(pay.payRule?.guaranteedHours ?? h)}h（シフト時間保証）`, amount: amt };
  }
  return { key: "timePay", label: `時給 ${yen(wage)}/h × ${h}h`, amount: amt };
}

export function breakdownLinesOf(input: BreakdownInput): Breakdown {
  const p = input.pay;
  const earn: BreakdownLine[] = [];
  const push = (key: string, label: string, amount: number, opts: { keepZero?: boolean; sub?: boolean; info?: boolean } = {}) => {
    if (amount === 0 && !opts.keepZero) return;
    earn.push({ key, label, amount, ...(opts.sub ? { sub: true } : {}), ...(opts.info ? { info: true } : {}) });
  };
  // 時間（303-2＝常に出す）
  earn.push(timeLineOf(p));
  if (p.guarantee) {
    push("guaBase", `　うち基本（${p.guarantee.baseHours}h）`, z(p.guarantee.basePay), { keepZero: true, sub: true });
    push("guaPay", `　うち保証 ${p.guarantee.spans.map((s) => `${md(s.from)}〜${s.to ? md(s.to) : ""} ${yen(s.base)}`).join("／")}（${p.guarantee.guaHours}h）`, z(p.guarantee.guaPay), { keepZero: true, sub: true });
  }
  if (p.slideBasis?.months?.length) {
    for (const m of p.slideBasis.months) {
      push(`slide-${m.month}`, `　スライド ${Number(m.month.slice(5, 7))}月分＝前月（${Number(m.prevMonth.slice(5, 7))}月）売上 ${yen(m.sales)}→時給 ${yen(m.salesWage)}／pt ${m.pts}→${yen(m.ptsWage)}`, Math.max(m.salesWage, m.ptsWage), { keepZero: true, info: true });
    }
  }
  push("honBack", "本指名バック", z(p.honBack));
  push("jonaiBack", "場内指名バック", z(p.jonaiBack));
  push("dohanBack", "同伴バック", z(p.dohanBack));
  push("drinkBack", "ドリンクバック", z(p.drinkBack));
  push("champBack", "シャンパンバック", z(p.champBack));
  push("bottleBack", "ボトルバック", z(p.bottleBack));
  push("calculatedBack", "商品バック（プラン率／固定）", z(p.calculatedBack));
  push("salesBack", "売上歩合", z(p.salesBack));
  if (Array.isArray(p.cbacks) && p.cbacks.length > 0) {
    for (const [i, c] of p.cbacks.entries()) push(`cback-${i}`, c.name ? `自由設計バック（${c.name}）` : "自由設計バック", z(c.amount));
    const rest = z(p.customTotal) - p.cbacks.reduce((a, c) => a + z(c.amount), 0);
    if (rest !== 0) push("customRest", "自由設計バック", rest);
  } else {
    push("customTotal", "自由設計バック", z(p.customTotal));
  }
  push("achievementBonus", "達成ボーナス", z(p.achievementBonus));
  push("guaranteeAdd", "最低保証加算", z(p.guaranteeAdd));
  for (const [i, e] of (input.extras ?? []).entries()) push(`extra-${i}`, e.label ?? (e.kind === "attendance_bonus" ? "出勤ボーナス" : e.kind), z(e.amount));

  const ded: BreakdownLine[] = [];
  const dpush = (key: string, label: string, amount: number) => { if (amount > 0) ded.push({ key, label, amount }); };
  const applied = z(p.sanction?.applied), original = z(p.sanction?.original);
  dpush("fixedDed", "固定控除", z(p.fixedDed) - applied);
  dpush("sanction", original > applied ? `懲戒減給（原額 ${yen(original)} → 法定上限適用）` : "懲戒減給", applied);
  dpush("fine", "精算調整（旧: 罰金）", z(p.fine));
  const adjB = input.adjustments?.before ?? [], adjA = input.adjustments?.after ?? [];
  for (const [i, a] of adjB.entries()) dpush(`adj-b${i}`, a.reason || "調整控除（源泉前）", z(a.amount));
  dpush("adjBeforeHidden", adjB.length ? "調整控除（源泉前・明細非表示）" : "調整控除（源泉前）", z(p.adjBefore) - adjB.reduce((s, a) => s + z(a.amount), 0));
  dpush("withholding", whLabelOf(p.taxMode), z(p.withholding));
  for (const [i, a] of adjA.entries()) dpush(`adj-a${i}`, a.reason || "調整控除（源泉後）", z(a.amount));
  dpush("adjAfterHidden", adjA.length ? "調整控除（源泉後・明細非表示）" : "調整控除（源泉後）", z(p.adjAfter) - adjA.reduce((s, a) => s + z(a.amount), 0));
  dpush("normPenalty", "ノルマ未達", z(p.normPenalty));
  dpush("ar", "売掛", input.deducted?.ar != null ? z(input.deducted.ar) : z(p.arDeduct));
  dpush("adv", "前借り", input.deducted?.adv != null ? z(input.deducted.adv) : z(p.advanceDeduct));
  dpush("okuri", "送り", input.deducted?.okuri != null ? z(input.deducted.okuri) : z(p.okuriDeduct));

  const earnTotal = earn.filter((l) => !l.sub && !l.info).reduce((s, l) => s + l.amount, 0);
  const dedTotal = ded.reduce((s, l) => s + l.amount, 0);
  const overflow = z(p.adjustOverflow);
  return { earn, ded, earnTotal, dedTotal, net: earnTotal - dedTotal + overflow, whLabel: whLabelOf(p.taxMode), overflow };
}

/** 303-3: 一覧の時間セル。0h かつ日数>0 は「打刻なし／不完全」の注記（303 追補1）（値は変えない）。hours が無ければ "-" */
export function hoursCellOf(wHours: number | null | undefined, days: number): { text: string; note: string | null } {
  if (wHours == null) return { text: "-", note: null };
  return { text: `${wHours}h`, note: wHours === 0 && days > 0 ? "打刻なし／不完全" : null };
}
