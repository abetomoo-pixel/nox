// ★便 D 裁定455-3（2026-11-05）: 勤怠の修正モーダル（kintai-edit）で遅刻／当欠を付けた後の自動登録（client）。
//   額＝stores.settings_json.settlement_presets の late／absent の既定額（0＝登録しない）・委託だけ（雇用は制裁＝別経路）・同じ日の同じ名称が当期にあれば二重に登録しない。
//   登録＝payroll_run_create（当期の draft・既存があれば返る）→ payroll_adjustment_add（source 'settlement'・basis＝ひな形の契約根拠・target_shift_id＝その日のシフト）。
//   失敗は勤怠の保存を止めない（戻り値の注記を保存メッセージに添える）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPenaltyArgsOf, autoPenaltyReasonOf, presetsOf } from "./settlement";

export type AutoPenaltyResult = { kind: "added"; amount: number; text: string } | { kind: "skipped"; why: "no_amount" | "employee" | "exists" | "run_not_draft" } | { kind: "error"; text: string };

export async function applyAutoPenalty(supabase: SupabaseClient, input: { storeId: string; castId: string; biz: string; shiftId: string | null; target: "late" | "absent" }): Promise<AutoPenaltyResult> {
  const [{ data: st }, { data: c }] = await Promise.all([
    supabase.from("stores").select("settings_json").eq("id", input.storeId).maybeSingle(),
    supabase.from("casts").select("employment").eq("id", input.castId).maybeSingle(),
  ]);
  const preset = presetsOf((st?.settings_json ?? {}) as Record<string, unknown>).find((p) => p.target === input.target);
  if (!preset || preset.amount <= 0) return { kind: "skipped", why: "no_amount" };
  if ((c as { employment?: string | null } | null)?.employment === "雇用") return { kind: "skipped", why: "employee" };
  const { data: rc, error: eRc } = await supabase.rpc("payroll_run_create", { p_store_id: input.storeId, p_period: input.biz.slice(0, 7) });
  if (eRc) return { kind: "error", text: eRc.message };
  const run = (Array.isArray(rc) ? rc[0] : rc) as { id: string; status: string } | null;
  if (!run) return { kind: "error", text: "run_create failed" };
  if (run.status !== "draft") return { kind: "skipped", why: "run_not_draft" };
  const reason = autoPenaltyReasonOf(input.target, input.biz);
  const { data: dup } = await supabase.from("payroll_adjustments").select("id").eq("run_id", run.id).eq("cast_id", input.castId).eq("source", "settlement").eq("reason", reason).limit(1);
  if ((dup ?? []).length > 0) return { kind: "skipped", why: "exists" };
  const a = autoPenaltyArgsOf({ runId: run.id, castId: input.castId, preset, target: input.target, biz: input.biz, shiftId: input.shiftId });
  if (!a.ok) return { kind: "error", text: a.err };
  const { error } = await supabase.rpc("payroll_adjustment_add", a.args);
  if (error) return { kind: "error", text: error.message };
  return { kind: "added", amount: preset.amount, text: `${reason} ¥${preset.amount.toLocaleString()} を精算調整に登録` };
}
