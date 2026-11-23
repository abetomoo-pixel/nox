// ★0203（2 号店の段 1・相談役 21:40 の ■2-b）: 1 店目から写すときの初期設定の確定の計画（DB を知らない純関数）。
//   確定の最初に store_copy_settings で写す → 写した part の群（step.group）の段は飛ばす。
//   残る店舗設定の段の patch は、写した part の鍵を外す（写した値を雛形で上書きしない・下の applyCopyToPlan）。
import type { V5Step } from "@/lib/nox/setup/v5";
import { PART_GROUP, STORE_COPY_PARTS, type StoreCopyPart } from "@/lib/nox/ops/store-add";

export const COMP_PATCH_KEYS = ["norm_axes", "slide_apply", "trial_guarantee_days", "trial_wage", "bonus_tier_mode", "kind_back_rate", "sales_back_default_off", "sales_basis", "sales_split", "sales_subtotal_mode", "pay_time_basis", "payslip_visibility", "default_plan_id"] as const;

export const copyPartsOf = (v: unknown): StoreCopyPart[] => (Array.isArray(v) ? v.filter((p): p is StoreCopyPart => (STORE_COPY_PARTS as readonly string[]).includes(String(p))) : []);

export function applyCopyToPlan(steps: readonly V5Step[], parts: readonly StoreCopyPart[]): V5Step[] {
  if (parts.length === 0) return [...steps];
  const skip = new Set(parts.map((p) => PART_GROUP[p]));
  if (parts.includes("products")) skip.add("overrides"); // ★12:00 の ■2-d（通しの試走で見つけた）: 商品を写したら、雛形のバックで写した商品を上書きする段（products_overrides）も飛ばす
  const out = steps.filter((st) => !skip.has(st.group));
  // ★12:00 の ■2-d（通しの試走で見つけた）: 飛ばさずに残る店舗設定の段（完了の段＝setup_done・slide_apply・settlement_presets）も、写した値を雛形で上書きしない。
  //   待遇を写したら制度の鍵（sys_*）と待遇の鍵を外す・店舗設定を写したら待遇の鍵と完了の印（setup_done）以外を外す。
  const comp = parts.includes("comp"), settings = parts.includes("settings");
  if (!comp && !settings) return out;
  const isComp = (k: string) => k.startsWith("sys_") || (COMP_PATCH_KEYS as readonly string[]).includes(k);
  return out.map((st) => {
    if (st.rpc !== "set_store_profile" || !st.args || typeof st.args.p_patch !== "object" || st.args.p_patch === null) return st;
    const patch = { ...(st.args.p_patch as Record<string, unknown>) };
    for (const k of Object.keys(patch)) if (k !== "setup_done" && ((comp && isComp(k)) || (settings && !isComp(k)))) delete patch[k];
    return { ...st, args: { ...st.args, p_patch: patch } };
  });
}

/** ★0203（■2-c）: 2 店以上の会社の初期設定は、会社で 1 つのもの（支払日）を店の patch で書かない（会社の値のまま） */
export function stripOrgLevelKeys(steps: readonly V5Step[]): V5Step[] {
  return steps.map((st) => {
    if (st.rpc !== "set_store_profile" || !st.args || typeof st.args.p_patch !== "object" || st.args.p_patch === null || !("pay_day" in (st.args.p_patch as Record<string, unknown>))) return st;
    const patch = { ...(st.args.p_patch as Record<string, unknown>) }; delete patch.pay_day;
    return { ...st, args: { ...st.args, p_patch: patch } };
  });
}

/** ★0203（12:00 の ■2-b）: 写した待遇のプランを、キャストの登録の既定（基本・体験入店）に結ぶ＝store_copy_settings が返す ID の付け替えの対応で結ぶ（名前で探さない）。
 *  基本＝1 店目の既定のプラン（default_plan_id）の写し。無ければ 1 店目で最初に作ったプラン（有効なもの）の写し。
 *  体験入店＝基本の次に作ったプラン（有効なもの）の写し（初期設定は「基本プラン」→「体験入店」の順に作る）。1 店目でプランの名前を変えてあっても同じ所に結ぶ。 */
export type CopiedPlan = { src: string; dst: string; active?: boolean };
export function copiedPlanIdsOf(res: unknown): { basic: string | null; trial: string | null } | null {
  const r = (res ?? {}) as { plans?: unknown; default_src?: unknown };
  if (!Array.isArray(r.plans) || r.plans.length === 0) return null;
  const plans = (r.plans as CopiedPlan[]).filter((p) => typeof p?.src === "string" && typeof p?.dst === "string");
  if (plans.length === 0) return null;
  const act = plans.filter((p) => p.active !== false);
  const pool = act.length ? act : plans;
  const def = typeof r.default_src === "string" ? plans.find((p) => p.src === r.default_src) ?? null : null;
  const basic = def ?? pool[0];
  const trial = pool.find((p) => p.src !== basic.src) ?? null;
  return { basic: basic.dst, trial: trial?.dst ?? null };
}
