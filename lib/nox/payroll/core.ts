// 給与ドラフト計算のオーケストレーション（プレビュー／確定が同じ core を通る）。
// 窓解決 → 対象 cast 収集 → cast ごとに buildPayInput → payOf → net 恒等（B）→ PreviewRow[]。
// 確定前ガード（blockers）: cast_plan 未設定（no_plan）／cast_tax_profiles 未登録（no_tax）。
//   プレビューは既定 '委託' で試算しつつ blocker を警告返し。確定は blocker があれば route が 422（論点2）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { payOf, type PayResult, type TaxMode } from "../pay";
import { resolvePayrollWindow } from "./window";
import { collectPeriod } from "./collect";
import { buildPayInput, computeNet, type Extra } from "./assemble";

export type PreviewRow = {
  castId: string;
  castName: string;
  net: number;
  pay: PayResult;
  extras: Extra[]; // F2c は空
  anomalyCount: number;
  taxMode: TaxMode;
};
export type Blocker = { castId: string; castName: string; reason: "no_plan" | "no_tax" };
export type PayrollDraft = { rows: PreviewRow[]; blockers: Blocker[]; period: string; storeId: string };

export async function computePayrollDraft(
  admin: SupabaseClient,
  managerClient: SupabaseClient,
  storeId: string,
  period: string,
  opts: { previewDefaults: boolean },
): Promise<PayrollDraft> {
  const win = await resolvePayrollWindow(admin, storeId, period);
  const { casts, masters } = await collectPeriod(admin, managerClient, storeId, win);

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
    const extras: Extra[] = []; // F2c 空配列（#32 出勤インセンティブ等は後続で織り込む）
    const input = buildPayInput(c, taxMode, masters);
    const pay = payOf(input);
    const net = computeNet(pay, extras);
    // net 恒等（B・必須ステップ）: 凍結する net は必ず pay.net + Σextras を通す（クライアント値を使わない）。
    if (net !== pay.net + extras.reduce((s, e) => s + e.amount, 0)) {
      throw new Error(`net 恒等崩れ（cast ${c.castId}）`);
    }
    rows.push({ castId: c.castId, castName: c.castName, net, pay, extras, anomalyCount: c.anomalyCount, taxMode });
  }
  return { rows, blockers, period, storeId };
}
