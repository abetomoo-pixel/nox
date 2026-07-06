// 給与ドラフト計算のオーケストレーション（プレビュー／確定が同じ core を通る）。
// 窓解決 → 対象 cast 収集 → cast ごとに buildPayInput → payOf → net 恒等（B）→ PreviewRow[]。
// 確定前ガード（blockers）: cast_plan 未設定（no_plan）／cast_tax_profiles 未登録（no_tax）。
//   プレビューは既定 '委託' で試算しつつ blocker を警告返し。確定は blocker があれば route が 422（論点2）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { payOf, type PayResult, type TaxMode } from "../pay";
import { allocDue } from "../sales-alloc"; // #32 pooled の最大剰余法（sales 按分と同一の整数分配・純関数）
import { resolvePayrollWindow } from "./window";
import { collectPeriod } from "./collect";
import { buildPayInput, computeNet, type Extra } from "./assemble";

export type PreviewRow = {
  castId: string;
  castName: string;
  net: number;
  pay: PayResult;
  extras: Extra[]; // #32 出勤インセンティブの attendance_bonus 行（無ければ空）
  anomalyCount: number;
  taxMode: TaxMode;
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

export async function computePayrollDraft(
  admin: SupabaseClient,
  managerClient: SupabaseClient,
  storeId: string,
  period: string,
  opts: { previewDefaults: boolean },
): Promise<PayrollDraft> {
  const win = await resolvePayrollWindow(admin, storeId, period);
  const { casts, masters, incentives, recipientsByDate } = await collectPeriod(admin, managerClient, storeId, win);

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
    const input = buildPayInput(c, taxMode, masters);
    const pay = payOf(input);
    const net = computeNet(pay, extras);
    // net 恒等（B・必須ステップ）: 凍結する net は必ず pay.net + Σextras を通す（クライアント値を使わない）。
    if (net !== pay.net + extras.reduce((s, e) => s + e.amount, 0)) {
      throw new Error(`net 恒等崩れ（cast ${c.castId}）`);
    }
    rows.push({ castId: c.castId, castName: c.castName, net, pay, extras, anomalyCount: c.anomalyCount, taxMode });
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
