// ★便 D 裁定455-3（2026-11-05）: 勤怠の修正モーダル（kintai-edit）で遅刻／当欠を付けた後の自動登録（client）。
//   額＝stores.settings_json.settlement_presets の late／absent の既定額（0＝登録しない）・委託だけ（雇用は制裁＝別経路）・同じ日の同じ名称が当期にあれば二重に登録しない。
//   登録＝payroll_run_create（当期の draft・既存があれば返る）→ payroll_adjustment_add（source 'settlement'・basis＝ひな形の契約根拠・target_shift_id＝その日のシフト）。
//   失敗は勤怠の保存を止めない（戻り値の注記を保存メッセージに添える）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPenaltyArgsOf, autoPenaltyReasonOf, presetsOf } from "./settlement";
import { mig0206On } from "@/lib/nox/rules-0175/flag"; // ★0206 v2（起票146・相談役 11/24 2:20 の判断 5）
import { employmentAtPeriodOf, type EmploymentRow } from "./employment-at";
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本

export type AutoPenaltyResult = { kind: "added"; amount: number; text: string } | { kind: "skipped"; why: "no_amount" | "employee" | "exists" | "run_not_draft" } | { kind: "error"; text: string };

export async function applyAutoPenalty(supabase: SupabaseClient, input: { storeId: string; castId: string; biz: string; shiftId: string | null; target: "late" | "absent" }): Promise<AutoPenaltyResult> {
  const [{ data: st }, { data: c }] = await Promise.all([
    supabase.from("stores").select("settings_json").eq("id", input.storeId).maybeSingle(),
    supabase.from("casts").select("employment").eq("id", input.castId).maybeSingle(),
  ]);
  const preset = presetsOf((st?.settings_json ?? {}) as Record<string, unknown>).find((p) => p.target === input.target);
  if (!preset || preset.amount <= 0) return { kind: "skipped", why: "no_amount" };
  // ★0206 v2: 旗が true のとき、区分はその給与期（営業日の月）の期首に有効な区分（collect と同じ純関数）。false＝今と同じ（今の値）
  let emp = ((c as { employment?: string | null } | null)?.employment ?? null) as "委託" | "雇用" | null;
  if (mig0206On()) {
    const ps = `${input.biz.slice(0, 7)}-01`;
    const pe = new Date(Date.UTC(Number(ps.slice(0, 4)), Number(ps.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const { data: er } = await supabase.from("cast_employment").select("employment, valid_from, valid_to").eq("cast_id", input.castId).lte("valid_from", pe);
    const rows: EmploymentRow[] = ((er ?? []) as { employment: "委託" | "雇用"; valid_from: string; valid_to: string | null }[]).map((r) => ({ employment: r.employment, validFrom: r.valid_from, validTo: r.valid_to }));
    emp = employmentAtPeriodOf(rows, ps, pe, emp);
  }
  if (emp === "雇用") return { kind: "skipped", why: "employee" };
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
  if (error) return { kind: "error", text: errJa(error.message) };
  return { kind: "added", amount: preset.amount, text: `${reason} ¥${preset.amount.toLocaleString()} を精算調整に登録` };
}
