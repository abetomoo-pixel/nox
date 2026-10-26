// ★便 X13-H H-8（2026-10-21）: /mine の「今期の時給」＝キャスト一覧・詳細と同じ値（給与プレビューの core＝computePayrollDraft→payOf の PayResult を currentWageOf で読む・別計算なし）。
//   get_cast_sales は本人のセッションで呼ぶ（RPC が cast を本人に限定）＝他キャストの売上は 0 で回るが、返すのは本人の行の時給・文言・根拠だけ。
//   プラン・店設定・cast_plan は cast の RLS で読めない＝admin（本人分だけを返す）。失敗しても /mine は止めない（null）。
import { nextWageLineOf, nextWageOfPay, type NextWagePayLike } from "@/lib/nox/payroll/next-wage"; // ★便 ON-4（C2-22）
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePayrollDraft } from "@/lib/nox/payroll/core";
import { currentWageOf, type CurrentWage } from "@/lib/nox/cast/current-wage";

export async function mineCurrentWageOf(castSession: SupabaseClient, castId: string, storeId: string, period: string, today: string): Promise<CurrentWage | null> {
  try {
    const admin = createAdminClient();
    const { data: cps } = await admin.from("cast_plan").select("plan_id, overrides_json, valid_from, valid_to").eq("cast_id", castId).order("valid_from", { ascending: false });
    const rows = (cps ?? []) as { plan_id: string; overrides_json: Record<string, unknown> | null; valid_from: string; valid_to: string | null }[];
    const cur = rows.find((r) => r.valid_from <= today && (r.valid_to === null || r.valid_to >= today)) ?? null;
    const { data: plan } = cur ? await admin.from("comp_plans").select("name, base, slide_period, slide_apply").eq("id", cur.plan_id).maybeSingle() : { data: null };
    const draft = await computePayrollDraft(admin, castSession, storeId, period, { previewDefaults: true });
    const me = draft.rows.find((r) => r.castId === castId);
    if (!me) return null;
    const cw = currentWageOf(me.pay as never, {
      planName: (plan?.name as string | undefined) ?? null, slidePeriod: plan?.slide_period, slideApply: plan?.slide_apply ?? null, today,
      planBase: (plan?.base as number | undefined) ?? null, rows: cur ? rows.filter((r) => r.plan_id === cur.plan_id) : [],
    });
    return { ...cw, next: nextWageLineOf(nextWageOfPay(me.pay as NextWagePayLike)) }; // ★便 ON-4（C2-22）: 給与と同じ PayResult から来期の時給見込み
  } catch {
    return null;
  }
}
