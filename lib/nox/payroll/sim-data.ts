// F2f シミュレーター用データ読み取り（server 側・RLS スコープ client を受け取る＝admin/service キー不使用）。
//   cast＝自分の割当プラン＋override・open 前借り/送り残（パターン1）。売掛(receivables)は読まない（(a) 裁定＝
//     パターン2 で cast 読取不可・確定明細参照へ誘導）。店＝店の active プラン全部・天引きなし。
//   マスタ（penalty/deductions/custom_back_defs）は RLS が店スコープ（cast も pattern3 で読める）＝store_id 明示不要。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompPlan, PlanOverride, Deduction, BackDef } from "../pay";
import type { StoreMasters } from "./assemble";

function mapPlan(p: Record<string, unknown>): CompPlan {
  return {
    id: p.id as string,
    name: p.name as string,
    base: p.base as number,
    honBack: p.hon_back as number,
    jonaiBack: p.jonai_back as number,
    dohanBack: p.dohan_back as number,
    salesSlide: (p.sales_slide ?? []) as CompPlan["salesSlide"],
    pointSlide: (p.point_slide ?? []) as CompPlan["pointSlide"],
  };
}

// ★ store_id を明示スコープする（owner の RLS は org 全店＝store_id を絞らないと multi-store で
//   penalty_config の maybeSingle が複数行エラー→null 劣化・他店 deductions/plan 混入する。collect.ts と同型に締める）。
async function loadMasters(sb: SupabaseClient, storeId: string): Promise<StoreMasters> {
  const [penR, dedR, cbR] = await Promise.all([
    sb.from("penalty_config").select("*").eq("store_id", storeId).maybeSingle(),
    sb.from("deductions").select("id, name, amount, per").eq("store_id", storeId).eq("is_active", true),
    sb.from("custom_back_defs").select("id, name, basis, value, cond_json").eq("store_id", storeId).eq("is_active", true),
  ]);
  for (const r of [penR, dedR, cbR]) if (r.error) throw new Error(`sim マスタ読み取り: ${r.error.message}`);
  const pen = penR.data as Record<string, unknown> | null;
  return {
    penalty: {
      fineAbsent: (pen?.fine_absent as number) ?? 0,
      fineLate: (pen?.fine_late as number) ?? 0,
      hoursPerShift: Number(pen?.hours_per_shift ?? 5),
    },
    normConfig: {
      on: (pen?.norm_on as boolean) ?? false,
      daysFlat: (pen?.norm_days_flat as number) ?? 0,
      daysPer: (pen?.norm_days_per as number) ?? 0,
      dohanFlat: (pen?.norm_dohan_flat as number) ?? 0,
      dohanPer: (pen?.norm_dohan_per as number) ?? 0,
    },
    deductions: ((dedR.data ?? []) as Record<string, unknown>[]).map((d) => ({
      id: d.id as string, name: d.name as string, amount: d.amount as number, per: d.per as Deduction["per"],
    })),
    customBackDefs: ((cbR.data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id as string, name: b.name as string, basis: b.basis as BackDef["basis"], value: b.value as number,
      cond: (b.cond_json ?? undefined) as BackDef["cond"],
    })),
  };
}

const PLAN_COLS = "id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide";

export type CastSimData = { plans: CompPlan[]; masters: StoreMasters; openAdv: number; openOkuri: number; override?: PlanOverride };
export type StoreSimData = { plans: CompPlan[]; masters: StoreMasters };

// cast: 自分の割当プラン（pattern1変形）＋override・open 前借り/送り残（pattern1・自分の行のみ）。
//   masters を store スコープで読むため自分の store_id を先に取る（cast の RLS は単一店だが store_id を明示して締める）。
export async function loadCastSimData(sb: SupabaseClient): Promise<CastSimData> {
  const { data: meRows } = await sb.from("casts").select("store_id").limit(1);
  const storeId = (meRows?.[0]?.store_id as string) ?? "";
  const masters = await loadMasters(sb, storeId);
  const { data: cp } = await sb.from("cast_plan").select("plan_id, overrides_json").maybeSingle();
  let plans: CompPlan[] = [];
  let override: PlanOverride | undefined;
  if (cp?.plan_id) {
    const { data: plan } = await sb.from("comp_plans").select(PLAN_COLS).eq("id", cp.plan_id as string).maybeSingle();
    if (plan) plans = [mapPlan(plan as Record<string, unknown>)];
    override = (cp.overrides_json ?? undefined) as PlanOverride;
  }
  const [advR, trR] = await Promise.all([
    sb.from("advances").select("amount, deducted_amount").eq("status", "open"),
    sb.from("transport").select("amount, deducted_amount").eq("status", "open"),
  ]);
  const sumRem = (rows: unknown) =>
    ((rows ?? []) as Record<string, unknown>[]).reduce((s, r) => s + ((r.amount as number) - ((r.deducted_amount as number) ?? 0)), 0);
  return { plans, masters, openAdv: sumRem(advR.data), openOkuri: sumRem(trR.data), override };
}

// store: 指定店の active プラン（owner は org 全店 RLS ゆえ store_id 明示必須）・天引きなし。
export async function loadStoreSimData(sb: SupabaseClient, storeId: string): Promise<StoreSimData> {
  const masters = await loadMasters(sb, storeId);
  const { data: rows, error } = await sb.from("comp_plans").select(PLAN_COLS).eq("store_id", storeId).eq("is_active", true).order("name");
  if (error) throw new Error(`sim plans: ${error.message}`);
  return { plans: ((rows ?? []) as Record<string, unknown>[]).map(mapPlan), masters };
}
