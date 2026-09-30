// 給与ドラフト計算のオーケストレーション（プレビュー／確定が同じ core を通る）。
// 窓解決 → 対象 cast 収集 → cast ごとに buildPayInput → payOf → net 恒等（B）→ PreviewRow[]。
// 確定前ガード（blockers）: cast_plan 未設定（no_plan）／cast_tax_profiles 未登録（no_tax）。
//   プレビューは既定 '委託' で試算しつつ blocker を警告返し。確定は blocker があれば route が 422（論点2）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { payOf, type PayResult, type TaxMode } from "../pay";
import { allocDue } from "../sales-alloc"; // #32 pooled の最大剰余法（sales 按分と同一の整数分配・純関数）
import { takeHomeFloor } from "../money"; // F2e-1 手取り0下限（social gate TODO）
import { resolvePayrollWindow, periodDaysBetween } from "./window";
import { collectPeriod, loadPayrollAdjustments, loadDailyPays, loadDeductionOverrides } from "./collect"; // ★0156: 日払い済み・run 別控除上書き
import { shortfallRowsOf, type ShortfallRow } from "./shortfall"; // ★裁定324-3／324-4（便 L-2-4）: 不就労控除の行（'shift' の店だけ・route が payroll_shortfall_sync へ渡す）
import { LATE_GRACE_MIN_DEFAULT } from "../punch-match";
import { frozenAdjustmentsOf, type FrozenAdjustment } from "./adjust"; // 裁定264-10: 凍結形（show_detail=true の行だけ理由を持つ）
import { buildPayInput, applyDeductionOverrides, type Extra, type DeductionOverride } from "./assemble";

// 天引きの消し込み計画（finalize に同梱＝receivable/advance/transport 遷移の指示）
export type ArDeducted = { receivable_id: string; amount: number };
export type ArCarried = { receivable_id: string };
// F2e-2 前借り（advances・繰越あり）／送り実費（transport・繰越なし＝carried は無い）
export type AdvDeducted = { advance_id: string; amount: number };
export type AdvCarried = { advance_id: string };
export type OkuriDeducted = { transport_id: string; amount: number };

export type PreviewRow = {
  castId: string;
  castName: string;
  net: number;
  pay: PayResult;
  extras: Extra[]; // #32 出勤インセンティブの attendance_bonus 行（無ければ空）
  anomalyCount: number;
  missingOutDates: string[]; // ★N3 AV-4: 退勤の記録が無い勤務（表示のみ）
  calcPeriodStart?: string; calcPeriodEnd?: string; // ★0154 D6（294-8）: 計算期間（finalize が payslips.calc_period_* へ写す）
  taxMode: TaxMode;
  arDeducted: ArDeducted[]; // F2e-1: 今期天引きする receivable と額
  arCarried: ArCarried[]; // F2e-1: 今期引かず翌 period へ繰越する receivable
  arDeductTotal: number; // 今期売掛天引き合計
  arCarriedTotal: number; // 売掛繰越合計（残額）
  advDeducted: AdvDeducted[]; // F2e-2: 今期天引きする前借りと額
  advCarried: AdvCarried[]; // F2e-2: 今期引かず翌 period へ繰越する前借り
  advDeductTotal: number; // 今期前借り天引き合計
  advCarriedTotal: number; // 前借り繰越合計（残額）
  okuriDeducted: OkuriDeducted[]; // F2e-2: 今期天引きする送り実費と額（繰越なし＝carried 無し）
  okuriDeductTotal: number; // 今期送り実費天引き合計
  // ★裁定264-10: 凍結する調整行（show_detail=true のみ・入力順）と、false 行の合算額（理由は持たない）
  adjustmentsShown: FrozenAdjustment[];
  adjustmentsHiddenTotal: number;
  // ★0156（裁定309-6／309-8・便 V-2）: 日払い済み（gross 合計・源泉既徴収・件数）と適用した控除上書き（breakdown_json に凍結）
  dailyPaidGross: number;
  dailyWithheld: number;
  dailyN: number;
  deductionOverridesApplied: DeductionOverride[];
};
export type Blocker = { castId: string; castName: string; reason: "no_plan" | "no_tax" | "no_employment" };
// ★裁定98: 確定は止めないが人が見るべき事象（blocker と別枠・warnEmptyPool は IncentiveSummary 側に温存）
export type PayrollWarning = {
  castId: string;
  castName: string;
  kind: "sanction_capped" | "sanction_contractor" | "avg_wage_provisional" | "daily_withholding_exceeds"; // ★0156: 日払いの既徴収源泉が当期源泉を超えた（源泉は 0 で止める・起票）
  detail: string;
};
// 可視化: incentive ごとの総配分額・受給者数（受給者0の pooled は警告・ブロックしない）
export type IncentiveSummary = {
  id: string;
  bizDate: string;
  amountMode: "per_head" | "pooled";
  amount: number;
  recipientCount: number;
  distributedTotal: number;
  warnEmptyPool: boolean;
};
export type PayrollDraft = { rows: PreviewRow[]; blockers: Blocker[]; warnings: PayrollWarning[]; incentives: IncentiveSummary[]; period: string; storeId: string;
  /** ★裁定324（便 L-2-4）: 店の勤務時間の計算基準（'shift' のときだけ shortfall を持つ・'punch'＝undefined） */
  payTimeBasis?: "shift"; shortfall?: { castId: string; rows: ShortfallRow[] }[] };

// ★裁定98: sanction 系の blocker/warning 導出（純関数）。export＝verify が DB 非依存で判別的に係留するため
//   （allocateCategory と同じ建付け）。core 本体はこの2関数を経由する＝検証対象と実挙動が一致する。
export function employmentBlockerOf(
  c: { castId: string; castName: string; employment: "委託" | "雇用" | null },
  hasSanction: boolean,
): Blocker | null {
  // 店に active な sanction 控除があるとき、employment 未設定は二層のどちらを通すか決められない＝blocker。
  return hasSanction && c.employment == null
    ? { castId: c.castId, castName: c.castName, reason: "no_employment" }
    : null;
}

export function sanctionWarningsOf(
  c: { castId: string; castName: string; employment: "委託" | "雇用" | null },
  sanction: PayResult["sanction"],
): PayrollWarning[] {
  const out: PayrollWarning[] = [];
  if (!sanction || sanction.original <= 0) return out;
  if (c.employment === "雇用" && sanction.applied < sanction.original) {
    out.push({ castId: c.castId, castName: c.castName, kind: "sanction_capped",
      detail: `制裁控除 ${sanction.original}円 → ${sanction.applied}円（労基法91条: 1回≤平均賃金の半日分 ${sanction.capEach}円・総額≤賃金総額の1/10 ${sanction.capTotal}円）` });
  }
  if (c.employment === "委託") {
    out.push({ castId: c.castId, castName: c.castName, kind: "sanction_contractor",
      detail: `委託への制裁控除 ${sanction.applied}円（法定上限なし＝契約根拠の確認記録が適用条件・裁定98）` });
  }
  if (c.employment === "雇用" && sanction.provisional) {
    out.push({ castId: c.castId, castName: c.castName, kind: "avg_wage_provisional",
      detail: `平均賃金が暫定式（確定済み給与 0 期）＝当期 gross から概算 ${sanction.avgDailyWage}円/日で上限を計算` });
  }
  return out;
}

// カテゴリ共通の budget 引き当て（古い順に rem まで partial・各 item は deducted か carried の一方に1回＝重複なし）。
//   carryable=false（transport＝繰越なし）は rem 切れの残を carried にせず据置＝再回収しない（L4 裁定・台帳 #33）。
//   返り値 remAfter を次カテゴリへ渡すことで単一 budget を送り→前借り→売掛の順に消費する（L4 順序）。
//   export＝verify が floor cap（L2）と順序（L4）を DB 非依存で判別的に係留するため（takeHomeFloor()=0 でも判別可）。
export function allocateCategory(
  items: { id: string; remaining: number }[],
  rem: number,
  carryable: boolean,
): { deducted: { id: string; amount: number }[]; carried: { id: string }[]; deduct: number; carriedTotal: number; remAfter: number } {
  const deducted: { id: string; amount: number }[] = [];
  const carried: { id: string }[] = [];
  let deduct = 0;
  for (const it of items) {
    if (rem <= 0) { if (carryable) carried.push({ id: it.id }); continue; }
    const take = Math.min(it.remaining, rem); // 残額 budget まで（最後の1件は残 budget だけ partial）
    deducted.push({ id: it.id, amount: take });
    deduct += take;
    rem -= take;
  }
  const total = items.reduce((s, it) => s + it.remaining, 0);
  return { deducted, carried, deduct, carriedTotal: total - deduct, remAfter: rem };
}

export async function computePayrollDraft(
  admin: SupabaseClient,
  managerClient: SupabaseClient,
  storeId: string,
  period: string,
  opts: { previewDefaults: boolean },
): Promise<PayrollDraft> {
  const win = await resolvePayrollWindow(admin, storeId, period);
  // ★源泉の「計算期間の日数」＝window の両端を含む暦日数（裁定23）。
  //   period_bounds が月初/月末を返すため 28〜31。写像は periodDaysBetween（裁定98 で関数化・過去期と共通）。
  const periodDays = periodDaysBetween(win.periodStart, win.periodEnd);
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    throw new Error(`periodDays 解決不能（period ${period} / ${win.periodStart}〜${win.periodEnd}）`);
  }
  const { casts, masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast } = await collectPeriod(admin, managerClient, storeId, win);
  // ★裁定258／264: run 別調整控除を cast に載せる（buildPayInput が両段の payOf へ素通し）。対象 cast（sales ∪ punch）に無い cast の行は計算に乗らない。
  const adjByCast = await loadPayrollAdjustments(admin, storeId, period);
  for (const c of casts) c.adjustments = adjByCast.get(c.castId) ?? [];
  // ★0156（裁定309-6／309-8・便 V-2）: 日払い済み（期間内 daily_pays の cast 別合計）と run 別控除上書きを cast に載せる（buildPayInput が両段の payOf へ素通し）。
  //   無い cast はキーを持たない＝従来と 1 バイト同値。
  const [dailyByCast, ovByCast] = await Promise.all([loadDailyPays(admin, storeId, win), loadDeductionOverrides(admin, storeId, period)]);
  for (const c of casts) {
    const dp = dailyByCast.get(c.castId); if (dp) c.dailyPaid = dp;
    const ov = ovByCast.get(c.castId); if (ov && ov.length) c.deductionOverrides = ov;
  }

  // #32: cast の出勤インセンティブ extras を算出（受給者=final∈{ok,late}・確認1／pooled は最大剰余法・端数+1=cast_id 最小）。
  const incentiveExtrasFor = (castId: string): Extra[] => {
    const out: Extra[] = [];
    for (const inc of incentives) {
      // E8-4（mig0095）: 対象指定あり＝受給者は「出勤受給者 ∩ 対象」（出勤していない対象者は受給しない＝
      //   現行の受給原則を維持）。targetCastIds=null は現行経路と完全同値（交差を作らない＝golden 構造保証）。
      const attended = recipientsByDate.get(inc.bizDate) ?? [];
      const recips = inc.targetCastIds === null
        ? attended
        : attended.filter((cid) => inc.targetCastIds!.includes(cid)); // 交差後も cast_id 昇順（attended が昇順ソート済み）
      if (!recips.includes(castId)) continue; // 受給者のみ（シフト無し raw は recipientsByDate に不在）
      let amt: number;
      if (inc.amountMode === "per_head") {
        amt = inc.amount; // 定額（確定と一致）
      } else {
        // pooled: allocDue（weight=1・position=交差後 cast_id 昇順の索引＝端数 +1 は cast_id 最小へ）
        const parts = allocDue(inc.amount, recips.map((cid, i) => ({ castId: cid, weight: 1, position: i })));
        amt = parts.find((p) => p.castId === castId)?.part ?? 0;
      }
      out.push({ kind: "attendance_bonus", amount: amt, label: `出勤ボーナス ${inc.bizDate}`, source: inc.id });
    }
    return out;
  };

  const rows: PreviewRow[] = [];
  const blockers: Blocker[] = [];
  const warnings: PayrollWarning[] = [];
  const shortfall: { castId: string; rows: ShortfallRow[] }[] = []; // ★324-3（便 L-2-4）
  // ★裁定98: 店に active な sanction 控除があるとき、employment 未設定の cast は二層のどちらを
  //   通すか決められない＝blocker（sanction が無ければ従来どおり・blocker なし）。
  const hasSanction = masters.deductions.some((d) => d.kind === "sanction");
  for (const c of casts) {
    if (!c.plan) {
      blockers.push({ castId: c.castId, castName: c.castName, reason: "no_plan" });
      continue; // プラン未設定は計算不能＝プレビューでも行を作らない
    }
    const eb = employmentBlockerOf(c, hasSanction);
    if (eb) {
      blockers.push(eb);
      continue; // 雇用/委託が決まらないと sanction の上限計算が定まらない＝行を作らない
    }
    let taxMode = c.taxProfileMode;
    if (!taxMode) {
      blockers.push({ castId: c.castId, castName: c.castName, reason: "no_tax" });
      if (!opts.previewDefaults) continue; // 確定は税区分必須（gate）＝行を作らない
      taxMode = "委託"; // プレビューのみ既定で試算表示（論点2）
    }
    const extras = incentiveExtrasFor(c.castId); // #32 attendance_bonus（無ければ空）

    // F2e-2 三カテゴリ天引き（二段 payOf・L4 順序＝送り→前借り→売掛・共通 budget を順に消費）:
    //  1) 全0 で pay0 → available = pay0.net + Σextras（インセンティブ込みの手取り）
    //  2) budget rem0 = max(0, available − takeHomeFloor())。allocateCategory を送り→前借り→売掛の順に呼び、
    //     remAfter を次へ渡す＝高優先カテゴリが先に budget を消費・売掛は残りだけ（transport は繰越なし）。
    //  3) 確定額（ar/adv/okuri）で再 payOf → net = available − (okuri+adv+ar) ≥ floor（L2）。
    //  ★裁定258／264: 調整控除（c.adjustments＝loadPayrollAdjustments）は buildPayInput が両段の PayInput に同じ行を載せる＝
    //    pay0 の時点で引かれ available が減る（配分順序は現状維持・ar/adv/okuri は残り budget で回る）。
    const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
    const pay0 = payOf(buildPayInput(c, taxMode, masters, periodDays, extrasTotal, 0, 0, 0));
    // ★extras は gross に入った（＝源泉後の pay0.net に既に反映）。外側での再加算は二重計上になるため撤去。
    const available = pay0.net;
    const rem0 = Math.max(0, available - takeHomeFloor());

    const trs = transportByCast.get(c.castId) ?? [];
    const advs = advancesByCast.get(c.castId) ?? [];
    const recvs = receivablesByCast.get(c.castId) ?? [];
    const okuriPlan = allocateCategory(trs, rem0, false); // 送り（繰越なし）を最優先で消費
    const advPlan = allocateCategory(advs, okuriPlan.remAfter, true); // 次に前借り（繰越あり）
    const arPlan = allocateCategory(recvs, advPlan.remAfter, true); // 最後に売掛（繰越あり）

    const okuriDeducted: OkuriDeducted[] = okuriPlan.deducted.map((x) => ({ transport_id: x.id, amount: x.amount }));
    const advDeducted: AdvDeducted[] = advPlan.deducted.map((x) => ({ advance_id: x.id, amount: x.amount }));
    const advCarried: AdvCarried[] = advPlan.carried.map((x) => ({ advance_id: x.id }));
    const arDeducted: ArDeducted[] = arPlan.deducted.map((x) => ({ receivable_id: x.id, amount: x.amount }));
    const arCarried: ArCarried[] = arPlan.carried.map((x) => ({ receivable_id: x.id }));

    const pay = payOf(buildPayInput(c, taxMode, masters, periodDays, extrasTotal, arPlan.deduct, advPlan.deduct, okuriPlan.deduct));
    const net = pay.net; // = available − (okuri+adv+ar)（pay.net が3天引き込み・extras は gross 側で計上済み）
    // net 恒等（B・必須ステップ）: 凍結する net は必ず payOf の結果そのものを通す（クライアント値を使わない）。
    if (net !== pay.net) {
      throw new Error(`net 恒等崩れ（cast ${c.castId}）`);
    }
    // ★裁定98: sanction 由来の警告（確定は止めない・blocker と別枠・導出は純関数）
    warnings.push(...sanctionWarningsOf(c, pay.sanction));
    // ★0156（裁定309-6）: 日払い時の源泉既徴収が当期源泉を超えた＝源泉 0 で止め、超過は warn（起票＝返金／翌期調整は裁定待ち）
    if ((pay.dailyWithholdingShort ?? 0) > 0) {
      warnings.push({ castId: c.castId, castName: c.castName, kind: "daily_withholding_exceeds",
        detail: `日払いで徴収済みの源泉 ${c.dailyPaid?.withheld ?? 0}円が当期の源泉を ${pay.dailyWithholdingShort}円 超えています（当期源泉は 0・超過分の扱いは要裁定）` });
    }
    const ovApplied = applyDeductionOverrides(masters.deductions, c.deductionOverrides).applied; // ★0156（309-8）: 凍結用（実際の適用は buildPayInput 内）
    // ★裁定264-10: 凍結形＝show_detail=true の行だけ理由付きで・false は合算額のみ（率の分母は pay.gross＝payOf と同一）
    const frozenAdj = frozenAdjustmentsOf(c.adjustments ?? [], pay.gross);
    // ★324-3／324-4（便 L-2-4）: 'shift' の店＝営業日ごとの不足分（遅刻＝猶予あり・早上がり＝猶予なし）×その日の時給（pay.wdays の hourly＝保証時給込み）
    if (masters.payTimeBasis === "shift" && c.shortfallDays?.length) {
      const hourlyByDate: Record<string, number> = {};
      for (const w of pay.wdays) hourlyByDate[`${period}-${String(w.d).padStart(2, "0")}`] = w.hourly;
      const sfRows = shortfallRowsOf({ days: c.shortfallDays, hourlyByDate, lateGraceMin: masters.lateGraceMin ?? LATE_GRACE_MIN_DEFAULT, employment: c.employment ?? null });
      shortfall.push({ castId: c.castId, rows: sfRows });
    }
    rows.push({
      castId: c.castId, castName: c.castName, net, pay, extras, anomalyCount: c.anomalyCount, missingOutDates: c.missingOutDates ?? [], taxMode,
      ...(c.calcPeriod ? { calcPeriodStart: c.calcPeriod.start, calcPeriodEnd: c.calcPeriod.end } : {}), // ★0154 D6
      arDeducted, arCarried, arDeductTotal: arPlan.deduct, arCarriedTotal: arPlan.carriedTotal,
      advDeducted, advCarried, advDeductTotal: advPlan.deduct, advCarriedTotal: advPlan.carriedTotal,
      okuriDeducted, okuriDeductTotal: okuriPlan.deduct,
      adjustmentsShown: frozenAdj.shown, adjustmentsHiddenTotal: frozenAdj.hiddenTotal,
      dailyPaidGross: c.dailyPaid?.gross ?? 0, dailyWithheld: c.dailyPaid?.withheld ?? 0, dailyN: c.dailyPaid?.n ?? 0, deductionOverridesApplied: ovApplied, // ★0156
    });
  }

  // 可視化サマリ: 総配分額＝per_head:amount×N／pooled:N>0?amount:0（受給者0の pooled は警告）
  const incentiveSummary: IncentiveSummary[] = incentives.map((inc) => {
    const n = (recipientsByDate.get(inc.bizDate) ?? []).length;
    const distributedTotal = inc.amountMode === "per_head" ? inc.amount * n : n > 0 ? inc.amount : 0;
    return {
      id: inc.id, bizDate: inc.bizDate, amountMode: inc.amountMode, amount: inc.amount,
      recipientCount: n, distributedTotal, warnEmptyPool: inc.amountMode === "pooled" && n === 0,
    };
  });
  return { rows, blockers, warnings, incentives: incentiveSummary, period, storeId, ...(masters.payTimeBasis === "shift" ? { payTimeBasis: "shift" as const, shortfall } : {}) }; // ★324（便 L-2-4）: 'punch' はキーなし
}
