// ★裁定303（2026-09-25）: 給与明細の「支給／控除」の行を作る単一の純関数（DB を知らない）。
//   303-1: 給与 run 明細の右パネル（preview の PayResult）と PayslipSlip（payslips.breakdown_json.pay）が同じ関数を使う＝同じ行・同じ順・同じ値。
//          残り物の行（「その他バック」「その他」）は作らない＝gross／控除計の各項を名前のある行で全部出す。
//   303-2: 時給行は報酬型に時給を含む cast（actual／shift_guarantee）では 0h でも出す（「時給 ¥n/h × 0h」）。雇用は常に出す。
//          fixed＝「固定給（按分）」・per_shift＝「1稼働 ¥n × k回」＝その報酬型の時間行として常に出す。非表示は「その報酬型に存在しない行」だけ。
//   303-3: 一覧の時間セル＝hoursCellOf（0h かつ日数>0 なら「打刻なし／不完全」（303 追補1 の文言）を薄字で・値は変えない）。
//   恒等（pay.ts と同じ）: net = gross − (fixedDed+fine+withholding+ar+adv+okuri+normPenalty+adjBefore+adjAfter) + adjustOverflow。
//   ★extras（出勤ボーナス等）は gross に内在（裁定26）＝行としては出すが合計に二重加算しない。
import { nextWageLineOf, nextWageOfPay, type NextWagePayLike } from "@/lib/nox/payroll/next-wage"; // ★便 ON-4（C2-22）
import { periodLabelOf } from "./slide"; // ★裁定338（0168・便 P168）
import type { FrozenAdjustment } from "./adjust";
import { wageSpanLabelOf, wageSpansOf } from "./wage-spans"; // ★便 PR-1 R-2（裁定416）: 時給の区間行

export type BreakdownPayLike = {
  wage?: number; wHours?: number; timePay?: number;
  /** ★裁定432: 源泉区分（区分を渡した cast だけ）・指定額（あるときだけ）・社員の控除（入れた行だけ） */
  withholdingKind?: string; withholdingAuto?: number; withholdingOverride?: number;
  employeeDeductions?: { label: string; amount: number; kind?: string }[];
  /** ★便 ON-2（裁定418 CANON）: 報酬率の判定（pay.ts の canon＝rules0175 を渡した cast だけ）。行「報酬率 ○%→段」の元 */
  canon?: { pct: number | null; tierIdx: number | null; direction: "up" | "hold" | "assess"; applied: boolean; upAmount: number; payPct: number; streak: number; windowN: number } | null;
  payRule?: { rule?: string; guaranteedHours?: number; fixedAmount?: number; calcDays?: number; periodDays?: number; perShiftAmount?: number; shiftCount?: number } | null;
  guarantee?: { spans: { from: string; to: string | null; base: number }[]; baseHours: number; basePay: number; guaHours: number; guaPay: number } | null;
  wdays?: { d: number; hours: number; hourly: number; basis: string; gua?: boolean }[]; // ★便 PR-1 R-2（裁定416）: 営業日ごとの時給＝区間行の元（凍結 pay にも入っている）
  slideBasis?: { apply?: string; provisional?: boolean; months: { month: string; prevMonth: string; sales: number; pts: number; salesWage: number; ptsWage: number }[]; basis?: string; scope?: { rankIds: string[]; castRankId: string | null; excluded: boolean } } | null;
  /** ★便 SH-UI-c2 C2-9: 段の判定（基本時給・売上／pt の段）＝凍結 pay にも plan／eplan が入っている */
  eplan?: { base?: number; salesSlide?: { at: number; wage: number }[]; pointSlide?: { at: number; wage: number }[] } | null;
  plan?: { base?: number; salesSlide?: { at: number; wage: number }[]; pointSlide?: { at: number; wage: number }[] } | null; // ★裁定343: basis／scope
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
  /** ★便 SH-UI-c2 C2-9 ⑤: 結果の行（390px で 1 行に収まらないときは見出し行＋結果の行の 2 行＝途中で折り返さない） */
  label2?: string;
  /** ★便 SH-UI-c2 C2-9 ①: 金額欄の表示を置き換える（「—」＝¥0 を出さない） */
  amountText?: string;
};
export type BreakdownInput = {
  pay: BreakdownPayLike;
  extras?: BreakdownExtra[];
  /** 凍結された調整控除（show_detail=true の行）。無ければ adjBefore／adjAfter の合計行だけ */
  adjustments?: { before: FrozenAdjustment[]; after: FrozenAdjustment[] };
  /** payslip 用: 渡されたら breakdown の ar／adv／okuri（deducted 合計）を優先（旧 slip と同じ出所・pa(7-6) の fixture は pay.arDeduct 0 で ar 400）。無ければ pay の arDeduct 等（給与右パネル） */
  deducted?: { ar?: number; adv?: number; okuri?: number };
  /** ★裁定414（S-4 ④）: 送りの控除を方式で分けた額（分かるときだけ）。渡されたら「送り立替」「送り（定額）」の 2 行・無ければ従来の「送り」1 行 */
  okuriModes?: { actual: number; flat: number };
  employment?: "委託" | "雇用" | null;
  /** ★便 PR-1 R-2（裁定416）: 期（'YYYY-MM'）＝区間行の日付「10/1〜10/24」に使う。無ければ日付なし */
  period?: string | null;
  /** ★便 PR-1 R-2: 区間を必ず切る日番号（半月判定＝[16]＝判定日を境に 2 区間）。無ければ時給／区分の変化だけで切る */
  splitAtD?: number[];
  /** ★便 GV-C C-10（GV-53）: 店の利用機能（settings_json の sys_*）。渡すと OFF の制度の行は金額 0 なら省き・0 でなければ「（OFF の制度）」を付けて残す。未指定＝従来どおり */
  systems?: Record<string, unknown> | null;
  /** ★便 SH-UI-c2 C2-9 ④: 確定済みの月＝「暫定」を外し判定基準を 1 語で */
  frozen?: boolean;
};
/** ★便 GV-C C-10: 行キー → 制度（sys_*）。ここに無い行（時間・控除の多く・調整）は制度に依らない */
export function systemOfLineKey(key: string): string | null {
  if (["honBack", "jonaiBack", "dohanBack", "drinkBack", "champBack", "bottleBack", "calculatedBack", "customTotal", "customRest"].includes(key) || key.startsWith("cback-")) return "sys_backs";
  if (key === "salesBack") return "sys_backs"; // ★便 SH-UI-c2 C2-10（裁定412 の残り）: 売上歩合＝各種バックに統合（行名「売上バック（率）」・出し分けも sys_backs）
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

// ★便 SH-UI-c2 C2-9（2026-10-23）: 右パネルのスライド行の表記（計算は変えない）。
//   ①段に届いていない＝「スライド 10月（暫定・期首〜今日）」＋「売上 ¥211,604 → 段なし・基本時給 ¥1,800 のまま」・金額欄「—」
//   ②届いた＝「→ 段 2（時給 ¥2,000・+¥200/h）」・金額欄＝上乗せの合計（(段の時給−基本)×その日の実働 h の Σ＝wdays の basis 売上／ポイントの日）
//   ③保証中＝「→ 保証 ¥3,200（10/24 まで）が優先」（保証の時給が段の時給以上のとき）
//   ④確定済み＝「暫定」を外し判定基準を 1 語（前月の累計／月の累計／半月の累計）。⑤390px＝見出し行（label）＋結果の行（label2）＝renderer が 2 行に分ける。
//   /mine（PayslipSlip）も同じ関数＝同じ文言。
export type SlideLineInput = Pick<BreakdownPayLike, "slideBasis" | "eplan" | "plan" | "wdays" | "wHours" | "guarantee">;
export function slideLinesOf(p: SlideLineInput, opts: { frozen?: boolean; showSales?: boolean; showPt?: boolean } = {}): BreakdownLine[] {
  const sb = p.slideBasis; if (!sb?.months?.length) return [];
  const apply = sb.apply ?? "next";
  if (apply === "daily") return [];
  const plan = p.eplan ?? p.plan ?? null;
  const base = z(plan?.base);
  const tiers = [...(plan?.salesSlide ?? [])].sort((a, b) => a.at - b.at);
  const ptTiers = [...(plan?.pointSlide ?? [])].sort((a, b) => a.at - b.at);
  const basisWord = apply === "monthly" ? "月の累計" : apply === "half" ? "半月の累計" : "前月の累計";
  const bLabel = sb.basis === "hon_count" ? "本指名" : sb.basis === "dohan_count" ? "同伴" : null;
  const bVal = (v: number) => (bLabel ? `${bLabel} ${v} 件` : `売上 ${yen(v)}`);
  const showSales = opts.showSales ?? true, showPt = opts.showPt ?? true;
  const gua = p.guarantee && p.guarantee.guaHours > 0 && p.guarantee.spans.length > 0 ? p.guarantee.spans[p.guarantee.spans.length - 1] : null;
  const topUp = (wage: number) => {
    if (wage <= base) return 0;
    const days = (p.wdays ?? []).filter((w) => w.hours > 0 && (w.basis === "売上" || w.basis === "ポイント"));
    return Math.round(days.length > 0 ? days.reduce((a, w) => a + Math.max(0, w.hourly - base) * w.hours, 0) : (wage - base) * z(p.wHours));
  };
  const out: BreakdownLine[] = [];
  for (const m of sb.months) {
    const head = `スライド ${periodLabelOf(m.month)}（${opts.frozen || apply === "next" ? basisWord : `暫定・期首〜今日`}）`;
    const salesIdx = tiers.filter((t) => m.sales >= t.at).length;
    const ptIdx = ptTiers.filter((t) => m.pts >= t.at).length;
    const wage = Math.max(m.salesWage, m.ptsWage);
    const tiersKnown = !!plan && (tiers.length > 0 || ptTiers.length > 0); // 凍結形（旧 payslip）は段の表を持たないことがある＝時給だけで判定
    const hit = wage > base && (!tiersKnown || salesIdx > 0 || ptIdx > 0);
    const parts: string[] = [];
    if (showSales || m.salesWage > 0 || (!showPt && m.ptsWage === 0)) parts.push(bVal(m.sales));
    if ((showPt || m.ptsWage > 0) && ptTiers.length > 0) parts.push(`pt ${m.pts}`);
    let result: string;
    if (hit) {
      const idx = m.salesWage >= m.ptsWage ? salesIdx : ptIdx;
      result = idx > 0 ? `${parts.join("・")} → 段 ${idx}（時給 ${yen(wage)}・+${yen(wage - base)}/h）` : `${parts.join("・")} → 時給 ${yen(wage)}（+${yen(wage - base)}/h）`;
    } else result = `${parts.join("・")} → 段なし・基本時給 ${yen(base)} のまま`;
    if (gua && gua.base >= wage) result += `・保証 ${yen(gua.base)}（${gua.to ? md(gua.to) + " まで" : "期末まで"}）が優先`;
    out.push({ key: `slide-${m.month}`, label: head, label2: result, amount: hit ? topUp(wage) : 0, info: true, ...(hit ? {} : { amountText: "—" }) });
  }
  return out;
}

/** 源泉行のラベル（凍結 taxMode・旧データは「源泉」） */
export function whLabelOf(taxMode: string | null | undefined): string {
  return taxMode === "委託" ? "源泉（報酬・料金）" : taxMode === "雇用" ? "源泉（給与）" : "源泉";
}
/** ★裁定432: 区分があればその名（hostess＝ホステス報酬／other_fee＝報酬・料金）・指定額なら「（指定額）」。区分が無い旧データは whLabelOf のまま */
export function whLabel432Of(p: { taxMode?: string | null; withholdingKind?: string; withholdingOverride?: number }): string {
  const base = p.withholdingKind === "hostess" ? "源泉（ホステス報酬）" : p.withholdingKind === "other_fee" ? "源泉（報酬・料金）" : p.withholdingKind === "other_204" ? "源泉（その他 204 条）" : whLabelOf(p.taxMode); // ★0188（裁定434）: other_204
  return typeof p.withholdingOverride === "number" ? `${base.replace(/）$/, "")}・指定額）` : base;
}

/** ★便 PR-1 R-2（裁定416）: 時給の区間行。actual で wdays があり区間が 2 つ以上なら区間ごとに 1 行（Σ＝timePay）。それ以外は timeLineOf の 1 行 */
export function timeLinesOf(pay: BreakdownPayLike, opts: { period?: string | null; splitAtD?: number[] } = {}): BreakdownLine[] {
  const rule = pay.payRule?.rule ?? "actual";
  if (rule === "actual" && pay.wdays && pay.wdays.length > 0) {
    const spans = wageSpansOf(pay.wdays, { timePay: z(pay.timePay), splitAtD: opts.splitAtD });
    if (spans.length >= 2) return spans.map((s, i) => ({ key: `timePay-${i + 1}`, label: wageSpanLabelOf(s, opts.period, false), amount: s.pay }));
  }
  return [timeLineOf(pay)];
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
  // 時間（303-2＝常に出す）。★PR-1 R-2（裁定416）: 時給が変わる期は区間ごとの行（保証→基本・半月判定の判定日）＝そのときは「うち基本／うち保証」の補助行は出さない（区間行が代わり）
  const timeLines = timeLinesOf(p, { period: input.period, splitAtD: input.splitAtD });
  earn.push(...timeLines);
  if (p.guarantee && timeLines.length === 1) {
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
    // ★便 GV-C live（GV-53）: 売上／pt の片方だけ OFF の店は、OFF 側の値を出さない（段で時給が付いていれば出す）
    // ★便 SH-UI-c2 C2-9: 文言は slideLinesOf（段なし＝「—」・段あり＝上乗せ・保証中・確定済み・390px は 2 行）＝/mine と同じ
    const showSales = sysOn(sysK, "sys_sales_slide"), showPt = sysOn(sysK, "sys_point_slide") && sysOn(sysK, "sys_points");
    for (const ln of slideLinesOf(p, { frozen: input.frozen, showSales, showPt })) {
      if (slidesOff && ln.amount === 0) continue;
      earn.push(ln);
    }
  }
  // ★便 ON-2（CANON ⑥⑦）: 報酬率（時給分 ÷ 売上小計）→段・方向（UP／維持／査定）・適用か提案か＝情報行（金額は時給の履歴側に積む＝ここでは 0）
  if (p.canon && p.canon.pct !== null) {
    const dirWord = p.canon.direction === "up" ? "UP" : p.canon.direction === "assess" ? "査定" : "維持";
    const tierWord = p.canon.tierIdx !== null ? `段 ${p.canon.tierIdx + 1}` : "段なし";
    earn.push({ key: "slide-rate", label: `報酬率 ${p.canon.pct}% → ${tierWord}（${dirWord}${p.canon.direction === "up" && p.canon.upAmount > 0 ? ` +${yen(p.canon.upAmount)}/h` : p.canon.direction === "assess" && p.canon.payPct < 100 ? ` 支給率 ${p.canon.payPct}%` : ""}）`, label2: `${p.canon.applied ? "適用済み" : "提案＝店が適用を選ぶ"}・連続 ${p.canon.streak}／${p.canon.windowN} 期`, amount: 0, info: true, amountText: "—" });
  }
  // ★便 ON-4（C2-22・Agoora 確定 10/26 ⑨）: 来期の時給見込み＝スライド行の下に 1 行（確定済みの明細には出さない・金額 0）
  if (!input.frozen) { const nw = nextWageLineOf(nextWageOfPay(p as NextWagePayLike, { salesOn: sysOn(sysK, "sys_sales_slide"), ptOn: sysOn(sysK, "sys_point_slide") && sysOn(sysK, "sys_points") })); if (nw) earn.push({ key: "next-wage", label: nw.label, label2: nw.label2, amount: 0, info: true, amountText: "—" }); }
  push("honBack", "本指名バック", z(p.honBack));
  push("jonaiBack", "場内指名バック", z(p.jonaiBack));
  push("dohanBack", "同伴バック", z(p.dohanBack));
  push("drinkBack", "ドリンクバック", z(p.drinkBack));
  push("champBack", "シャンパンバック", z(p.champBack));
  push("bottleBack", "ボトルバック", z(p.bottleBack));
  push("calculatedBack", "商品バック（プラン率／固定）", z(p.calculatedBack));
  push("salesBack", "売上バック（率）", z(p.salesBack)); // ★便 SH-UI-c2 C2-10（裁定412 の残り）: 旧「売上歩合」＝各種バックの並び
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
  dpush("withholding", whLabel432Of(p), z(p.withholding)); // ★裁定432: 区分・指定額のラベル（旧データは従来どおり）
  for (const [i, a] of adjA.entries()) dpush(`adj-a${i}`, a.reason || "調整控除（源泉後）", z(a.amount));
  dpush("adjAfterHidden", adjA.length ? "調整控除（源泉後・明細非表示）" : "調整控除（源泉後）", z(p.adjAfter) - adjA.reduce((s, a) => s + z(a.amount), 0));
  dpush("normPenalty", "ノルマ未達", z(p.normPenalty));
  dpush("ar", "売掛", input.deducted?.ar != null ? z(input.deducted.ar) : z(p.arDeduct));
  dpush("adv", "前借り", input.deducted?.adv != null ? z(input.deducted.adv) : z(p.advanceDeduct));
  if (input.okuriModes) { dpush("okuriActual", "送り立替", z(input.okuriModes.actual)); dpush("okuriFlat", "送り（定額）", z(input.okuriModes.flat)); } // ★裁定414（S-4 ④）
  else dpush("okuri", "送り", input.deducted?.okuri != null ? z(input.deducted.okuri) : z(p.okuriDeduct));
  dpush("dailyPaid", "日払い済み", z(p.dailyPaidGross)); // ★0156（裁定309-6）: 支給後控除（無ければ 0＝行は出ない）
  for (const [i, e] of (p.employeeDeductions ?? []).entries()) dpush(`empDed-${i}`, e.label, z(e.amount)); // ★裁定432 ③: 社員の控除＝入れた項目だけ（明細 PDF・CSV・/mine も同じ行）

  const earnTotal = earn.filter((l) => !l.sub && !l.info).reduce((s, l) => s + l.amount, 0);
  const dedTotal = ded.reduce((s, l) => s + l.amount, 0);
  const overflow = z(p.adjustOverflow);
  return { earn, ded, earnTotal, dedTotal, net: earnTotal - dedTotal + overflow, whLabel: whLabel432Of(p), overflow };
}

/** 303-3: 一覧の時間セル。0h かつ日数>0 は「打刻なし／不完全」の注記（303 追補1）（値は変えない）。hours が無ければ "-" */
export function hoursCellOf(wHours: number | null | undefined, days: number): { text: string; note: string | null } {
  if (wHours == null) return { text: "-", note: null };
  return { text: `${wHours}h`, note: wHours === 0 && days > 0 ? "打刻なし／不完全" : null };
}
