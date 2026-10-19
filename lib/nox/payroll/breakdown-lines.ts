// ★裁定303（2026-09-25）: 給与明細の「支給／控除」の行を作る単一の純関数（DB を知らない）。
//   303-1: 給与 run 明細の右パネル（preview の PayResult）と PayslipSlip（payslips.breakdown_json.pay）が同じ関数を使う＝同じ行・同じ順・同じ値。
//          残り物の行（「その他バック」「その他」）は作らない＝gross／控除計の各項を名前のある行で全部出す。
//   303-2: 時給行は報酬型に時給を含む cast（actual／shift_guarantee）では 0h でも出す（「時給 ¥n/h × 0h」）。雇用は常に出す。
//          fixed＝「固定給（按分）」・per_shift＝「1稼働 ¥n × k回」＝その報酬型の時間行として常に出す。非表示は「その報酬型に存在しない行」だけ。
//   303-3: 一覧の時間セル＝hoursCellOf（0h かつ日数>0 なら「打刻なし／不完全」（303 追補1 の文言）を薄字で・値は変えない）。
//   恒等（pay.ts と同じ）: net = gross − (fixedDed+fine+withholding+ar+adv+okuri+normPenalty+adjBefore+adjAfter) + adjustOverflow。
//   ★extras（出勤ボーナス等）は gross に内在（裁定26）＝行としては出すが合計に二重加算しない。
import { periodLabelOf } from "./slide"; // ★裁定338（0168・便 P168）
import type { FrozenAdjustment } from "./adjust";

export type BreakdownPayLike = {
  wage?: number; wHours?: number; timePay?: number;
  payRule?: { rule?: string; guaranteedHours?: number; fixedAmount?: number; calcDays?: number; periodDays?: number; perShiftAmount?: number; shiftCount?: number } | null;
  guarantee?: { spans: { from: string; to: string | null; base: number }[]; baseHours: number; basePay: number; guaHours: number; guaPay: number } | null;
  slideBasis?: { apply?: string; provisional?: boolean; months: { month: string; prevMonth: string; sales: number; pts: number; salesWage: number; ptsWage: number }[]; basis?: string; scope?: { rankIds: string[]; castRankId: string | null; excluded: boolean } } | null; // ★裁定343: basis／scope
  honBack?: number; jonaiBack?: number; dohanBack?: number;
  drinkBack?: number; champBack?: number; bottleBack?: number; calculatedBack?: number; salesBack?: number;
  customTotal?: number; cbacks?: { name?: string; amount?: number }[];
  achievementBonus?: number; guaranteeAdd?: number;
  normTarget?: { sales: number; source: "override" | "plan" | null }; // ★裁定347 追補2（便 N1014 A-4）: 達成ボーナスの目標の出所（プラン既定から継承したときだけ凍結）
  gross?: number;
  fixedDed?: number; sanction?: { original?: number; applied?: number } | null; fine?: number; withholding?: number; normPenalty?: number;
  arDeduct?: number; advanceDeduct?: number; okuriDeduct?: number;
  adjBefore?: number; adjAfter?: number; adjustOverflow?: number;
  dailyPaidGross?: number; dailyWithheld?: number; dailyWithholdingShort?: number; // ★0156（裁定309-6）: 日払い済み（無ければ 0）
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
  /** ★便 GV-C C-10（GV-53）: 店の利用機能（settings_json の sys_*）。渡すと OFF の制度の行は金額 0 なら省き・0 でなければ「（OFF の制度）」を付けて残す。未指定＝従来どおり */
  systems?: Record<string, unknown> | null;
};
/** ★便 GV-C C-10: 行キー → 制度（sys_*）。ここに無い行（時間・控除の多く・調整）は制度に依らない */
export function systemOfLineKey(key: string): string | null {
  if (["honBack", "jonaiBack", "dohanBack", "drinkBack", "champBack", "bottleBack", "calculatedBack", "customTotal", "customRest"].includes(key) || key.startsWith("cback-")) return "sys_backs";
  if (key === "salesBack") return "sys_sales_rate";
  if (key === "achievementBonus") return "sys_bonus";
  if (key === "guaranteeAdd") return "sys_hourly";
  if (key === "normPenalty") return "sys_norms";
  if (key === "fine") return "sys_penalties";
  return null;
}
const sysOn = (systems: Record<string, unknown> | null | undefined, k: string | null): boolean => !systems || !k || systems[k] !== false;
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
  const sysK = input.systems ?? null;
  const slidesOff = !!sysK && sysK.sys_sales_slide === false && sysK.sys_point_slide === false;
  const push = (key: string, label: string, amount: number, opts: { keepZero?: boolean; sub?: boolean; info?: boolean } = {}) => {
    if (amount === 0 && !opts.keepZero) return;
    if (key.startsWith("slide") && slidesOff && amount === 0) return; // ★便 GV-C C-10: スライドの情報行＝売上／pt スライドが両方 OFF なら出さない
    const on = sysOn(sysK, systemOfLineKey(key));
    if (!on && amount === 0) return; // ★便 GV-C C-10: OFF の制度は 0 の行を出さない（keepZero でも）
    earn.push({ key, label: on ? label : `${label}（OFF の制度）`, amount, ...(opts.sub ? { sub: true } : {}), ...(opts.info ? { info: true } : {}) });
  };
  // 時間（303-2＝常に出す）
  earn.push(timeLineOf(p));
  if (p.guarantee) {
    push("guaBase", `　うち基本（${p.guarantee.baseHours}h）`, z(p.guarantee.basePay), { keepZero: true, sub: true });
    push("guaPay", `　うち保証 ${p.guarantee.spans.map((s) => `${md(s.from)}〜${s.to ? md(s.to) : ""} ${yen(s.base)}`).join("／")}（${p.guarantee.guaHours}h）`, z(p.guarantee.guaPay), { keepZero: true, sub: true });
  }
  // ★裁定343（0170・便 W5-2b）: 判定基準（件数）と対象（ランク）の印。対象外＝1 行「対象外」・daily＋件数＝営業日ごとの行を 1 行に畳む（件数は判定値）
  const sbBasis = p.slideBasis?.basis;
  const bLabel = sbBasis === "hon_count" ? "本指名" : sbBasis === "dohan_count" ? "同伴" : null;
  const bVal = (n: number) => (bLabel ? `${bLabel} ${n} 件` : `売上 ${yen(n)}`);
  if (p.slideBasis?.scope?.excluded) push("slide-scope", `　スライド＝対象外（このキャストのランクは対象ランクに含まれない＝基本率のまま）`, 0, { keepZero: true, info: true });
  else if (p.slideBasis?.months?.length && p.slideBasis.apply === "daily" && bLabel) {
    const ms = p.slideBasis.months;
    push("slide-daily", `　スライド 日次＝その日の${bLabel}の件数で段（${ms.length} 日・${ms.filter((m) => m.salesWage > 0).length} 日で段あり）${p.slideBasis.scope ? "・対象ランク" : ""}`, Math.max(...ms.map((m) => Math.max(m.salesWage, m.ptsWage))), { keepZero: true, info: true });
  } else if (p.slideBasis?.months?.length) {
    // ★便 GV-C live（GV-53）: 売上／pt の片方だけ OFF の店は、OFF 側の「→時給」を出さない（段で時給が付いていれば出す）
    const showSales = sysOn(sysK, "sys_sales_slide"), showPt = sysOn(sysK, "sys_point_slide") && sysOn(sysK, "sys_points");
    const slidePartsOf = (m: { sales: number; salesWage: number; pts: number; ptsWage: number }) => [
      showSales || m.salesWage > 0 || (!showPt && m.ptsWage === 0) ? `${bVal(m.sales)}→時給 ${yen(m.salesWage)}` : null,
      showPt || m.ptsWage > 0 ? `pt ${m.pts}→${yen(m.ptsWage)}` : null,
    ].filter(Boolean).join("／");
    for (const m of p.slideBasis.months) {
      // ★裁定338＋追補1（0168・便 P168）: monthly／half＝期間の累計（暫定の印）・'next'＝従来の前月表示
      const ap = p.slideBasis.apply;
      if (ap === "monthly" || ap === "half") push(`slide-${m.month}`, `　スライド ${periodLabelOf(m.month)}＝${ap === "monthly" ? "月" : "半月"}の累計${m.prevMonth !== m.month ? `（${periodLabelOf(m.prevMonth)} 基準）` : ""}${p.slideBasis.provisional ? "・暫定（期首〜今日）" : ""} ${slidePartsOf(m)}${p.slideBasis.scope ? "・対象ランク" : ""}`, Math.max(m.salesWage, m.ptsWage), { keepZero: true, info: true });
      else push(`slide-${m.month}`, `　スライド ${Number(m.month.slice(5, 7))}月分＝前月（${Number(m.prevMonth.slice(5, 7))}月）${slidePartsOf(m)}`, Math.max(m.salesWage, m.ptsWage), { keepZero: true, info: true });
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
  push("achievementBonus", p.normTarget?.source === "plan" ? `達成ボーナス（目標 ¥${p.normTarget.sales.toLocaleString()}＝プランの既定）` : "達成ボーナス", z(p.achievementBonus)); // ★裁定347 追補2: 既定から継承した目標は明細に出所を出す
  push("guaranteeAdd", "最低保証加算", z(p.guaranteeAdd));
  for (const [i, e] of (input.extras ?? []).entries()) push(`extra-${i}`, e.label ?? (e.kind === "attendance_bonus" ? "出勤ボーナス" : e.kind), z(e.amount));

  const ded: BreakdownLine[] = [];
  const dpush = (key: string, label: string, amount: number) => { if (amount > 0) ded.push({ key, label: sysOn(sysK, systemOfLineKey(key)) ? label : `${label}（OFF の制度）`, amount }); }; // ★便 GV-C C-10: 控除は 0 の行は従来どおり出さない・OFF の制度は印
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
  dpush("dailyPaid", "日払い済み", z(p.dailyPaidGross)); // ★0156（裁定309-6）: 支給後控除（無ければ 0＝行は出ない）

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
