// 給与ドラフト計算のオーケストレーション（プレビュー／確定が同じ core を通る）。
// 窓解決 → 対象 cast 収集 → cast ごとに buildPayInput → payOf → net 恒等（B）→ PreviewRow[]。
// 確定前ガード（blockers）: cast_plan 未設定（no_plan）／cast_tax_profiles 未登録（no_tax）。
//   プレビューは既定 '委託' で試算しつつ blocker を警告返し。確定は blocker があれば route が 422（論点2）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { payOf, type PayResult, type TaxMode } from "../pay";
import { allocDue } from "../sales-alloc"; // #32 pooled の最大剰余法（sales 按分と同一の整数分配・純関数）
import { takeHomeFloor } from "../money"; // F2e-1 手取り0下限（social gate TODO）
import { resolvePayrollWindow } from "./window";
import { collectPeriod } from "./collect";
import { buildPayInput, computeNet, type Extra } from "./assemble";

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
};
export type Blocker = { castId: string; castName: string; reason: "no_plan" | "no_tax" };
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
export type PayrollDraft = { rows: PreviewRow[]; blockers: Blocker[]; incentives: IncentiveSummary[]; period: string; storeId: string };

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
  const { casts, masters, incentives, recipientsByDate, receivablesByCast, advancesByCast, transportByCast } = await collectPeriod(admin, managerClient, storeId, win);

  // #32: cast の出勤インセンティブ extras を算出（受給者=final∈{ok,late}・確認1／pooled は最大剰余法・端数+1=cast_id 最小）。
  const incentiveExtrasFor = (castId: string): Extra[] => {
    const out: Extra[] = [];
    for (const inc of incentives) {
      const recips = recipientsByDate.get(inc.bizDate) ?? [];
      if (!recips.includes(castId)) continue; // 受給者のみ（シフト無し raw は recipientsByDate に不在）
      let amt: number;
      if (inc.amountMode === "per_head") {
        amt = inc.amount; // 定額（確定と一致）
      } else {
        // pooled: allocDue（weight=1・position=cast_id 昇順の索引＝端数 +1 は cast_id 最小へ）
        const parts = allocDue(inc.amount, recips.map((cid, i) => ({ castId: cid, weight: 1, position: i })));
        amt = parts.find((p) => p.castId === castId)?.part ?? 0;
      }
      out.push({ kind: "attendance_bonus", amount: amt, label: `出勤ボーナス ${inc.bizDate}`, source: inc.id });
    }
    return out;
  };

  const rows: PreviewRow[] = [];
  const blockers: Blocker[] = [];
  for (const c of casts) {
    if (!c.plan) {
      blockers.push({ castId: c.castId, castName: c.castName, reason: "no_plan" });
      continue; // プラン未設定は計算不能＝プレビューでも行を作らない
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
    const pay0 = payOf(buildPayInput(c, taxMode, masters, 0, 0, 0));
    const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
    const available = pay0.net + extrasTotal;
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

    const pay = payOf(buildPayInput(c, taxMode, masters, arPlan.deduct, advPlan.deduct, okuriPlan.deduct));
    const net = computeNet(pay, extras); // = available − (okuri+adv+ar)（pay.net が3天引き込み）
    // net 恒等（B・必須ステップ）: 凍結する net は必ず pay.net + Σextras を通す（クライアント値を使わない）。
    if (net !== pay.net + extras.reduce((s, e) => s + e.amount, 0)) {
      throw new Error(`net 恒等崩れ（cast ${c.castId}）`);
    }
    rows.push({
      castId: c.castId, castName: c.castName, net, pay, extras, anomalyCount: c.anomalyCount, taxMode,
      arDeducted, arCarried, arDeductTotal: arPlan.deduct, arCarriedTotal: arPlan.carriedTotal,
      advDeducted, advCarried, advDeductTotal: advPlan.deduct, advCarriedTotal: advPlan.carriedTotal,
      okuriDeducted, okuriDeductTotal: okuriPlan.deduct,
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
  return { rows, blockers, incentives: incentiveSummary, period, storeId };
}
