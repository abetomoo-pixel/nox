// ★0203（2 号店の段 1・相談役 21:40 の ■2-b）: 1 店目から写すときの初期設定の確定の計画（DB を知らない純関数）。
//   確定の最初に store_copy_settings で写す → 写した part の群（step.group）の段は飛ばす。
//   待遇（comp）を写して店舗設定（settings）を写さないときは、店舗設定の段の patch から制度の鍵（sys_*）と待遇の鍵を外す（写した値を雛形で上書きしない）。
import type { V5Step } from "@/lib/nox/setup/v5";
import { PART_GROUP, STORE_COPY_PARTS, type StoreCopyPart } from "@/lib/nox/ops/store-add";

export const COMP_PATCH_KEYS = ["norm_axes", "slide_apply", "trial_guarantee_days", "trial_wage", "bonus_tier_mode", "kind_back_rate", "sales_back_default_off", "sales_basis", "sales_split", "sales_subtotal_mode", "pay_time_basis", "payslip_visibility", "default_plan_id"] as const;

export const copyPartsOf = (v: unknown): StoreCopyPart[] => (Array.isArray(v) ? v.filter((p): p is StoreCopyPart => (STORE_COPY_PARTS as readonly string[]).includes(String(p))) : []);

export function applyCopyToPlan(steps: readonly V5Step[], parts: readonly StoreCopyPart[]): V5Step[] {
  if (parts.length === 0) return [...steps];
  const skip = new Set(parts.map((p) => PART_GROUP[p]));
  const out = steps.filter((st) => !skip.has(st.group));
  if (parts.includes("comp") && !parts.includes("settings")) {
    return out.map((st) => {
      if (st.rpc !== "set_store_profile" || !st.args || typeof st.args.p_patch !== "object" || st.args.p_patch === null) return st;
      const patch = { ...(st.args.p_patch as Record<string, unknown>) };
      for (const k of Object.keys(patch)) if (k.startsWith("sys_") || (COMP_PATCH_KEYS as readonly string[]).includes(k)) delete patch[k];
      return { ...st, args: { ...st.args, p_patch: patch } };
    });
  }
  return out;
}

/** ★0203（■2-c）: 2 店以上の会社の初期設定は、会社で 1 つのもの（支払日）を店の patch で書かない（会社の値のまま） */
export function stripOrgLevelKeys(steps: readonly V5Step[]): V5Step[] {
  return steps.map((st) => {
    if (st.rpc !== "set_store_profile" || !st.args || typeof st.args.p_patch !== "object" || st.args.p_patch === null || !("pay_day" in (st.args.p_patch as Record<string, unknown>))) return st;
    const patch = { ...(st.args.p_patch as Record<string, unknown>) }; delete patch.pay_day;
    return { ...st, args: { ...st.args, p_patch: patch } };
  });
}
