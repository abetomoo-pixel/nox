// ★0203（2 号店の段 1・相談役 21:40 の ■2-b）: 1 店目から写すときの初期設定の確定の計画（DB を知らない純関数）。
//   確定の最初に store_copy_settings で写す → 写した part の段は飛ばす・残る段の patch から写した鍵を外す（写した値を雛形で上書きしない）。
//   ★版 2（相談役 11/23 14:10 の ■2-a）: 鍵ごとの「写す／写さない」は名簿（lib/nox/ops/store-copy-keys.ts）で決める＝SQL の名簿と同じ。
//     店舗設定（settings）の群は丸ごと飛ばさない：店ごとの鍵（席の有無・キオスク・店名・初期設定の印）は 2 店目の入力のまま書く。
//     店舗設定の群の段は、書く中身の part で飛ばす（STEP_PART）。領収書の住所・電話は 2 店目のもの＝段は残し、写した登録番号と下の文を渡す。
import type { V5Step } from "@/lib/nox/setup/v5";
import { PART_GROUP, STORE_COPY_PARTS, type StoreCopyPart } from "@/lib/nox/ops/store-add";
import { STORE_SETTING_KEYS } from "@/lib/nox/ops/store-copy-keys";

export const copyPartsOf = (v: unknown): StoreCopyPart[] => (Array.isArray(v) ? v.filter((p): p is StoreCopyPart => (STORE_COPY_PARTS as readonly string[]).includes(String(p))) : []);

/** 店舗設定の群（group "settings"）の段のうち、set_store_profile 以外＝書く中身の part（その part を写したら段ごと飛ばす） */
export const SETTINGS_STEP_PART: Readonly<Record<string, StoreCopyPart>> = {
  set_store_okuri_mode: "settings", set_store_receivable_policy: "settings", set_store_norm_axes: "comp", set_store_tax_config: "settings",
  set_store_invoice_profile: "settings", set_store_mine_settings: "settings",
};
/** 写した後の 2 店目の値（領収書の段に渡す）＝確定の画面が写しの後に読む */
export type CopiedReceipt = { invoice_reg_no: string | null; receipt_footer: string | null };

export function applyCopyToPlan(steps: readonly V5Step[], parts: readonly StoreCopyPart[], copied?: CopiedReceipt | null): V5Step[] {
  if (parts.length === 0) return [...steps];
  const has = (p: StoreCopyPart) => parts.includes(p);
  const skip = new Set(parts.filter((p) => p !== "settings").map((p) => PART_GROUP[p]));
  if (has("products")) skip.add("overrides"); // ★12:00 の ■2-d: 商品を写したら、雛形のバックで写した商品を上書きする段（products_overrides）も飛ばす
  const out: V5Step[] = [];
  for (const st of steps) {
    if (skip.has(st.group)) continue;
    if (st.rpc && SETTINGS_STEP_PART[st.rpc] && has(SETTINGS_STEP_PART[st.rpc])) continue;
    if (st.rpc === "set_store_profile" && st.args && typeof st.args.p_patch === "object" && st.args.p_patch !== null) {
      const patch = { ...(st.args.p_patch as Record<string, unknown>) };
      for (const k of Object.keys(patch)) { const c = STORE_SETTING_KEYS[k]; if (c?.part && has(c.part)) delete patch[k]; }
      out.push({ ...st, args: { ...st.args, p_patch: patch } });
      continue;
    }
    if (st.rpc === "set_store_receipt_profile" && has("settings") && st.args) { // 住所・電話は 2 店目の入力・登録番号と下の文は写した値
      out.push({ ...st, args: { ...st.args, p_reg_no: copied?.invoice_reg_no ?? null, p_footer: copied?.receipt_footer ?? null } });
      continue;
    }
    out.push(st);
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

/** ★0203（12:00 の ■2-b）: 写した待遇のプランを、キャストの登録の既定に結ぶ＝store_copy_settings が返す ID の付け替えの対応で結ぶ（名前で探さない）。
 *  基本＝1 店目の既定のプラン（default_plan_id）の写し。無ければ 1 店目で最初に作った有効なプランの写し。
 *  ★版 2（相談役 11/23 14:10 の ■3）: 体験入店は結ばない（trial＝null）。1 店の初期設定は「その場で作った体験入店のプラン」を使い、店の設定には体験入店のプランの印が無い
 *    ＝1 店目の設定から分からない。2 店目の完了の画面でオーナーが選ぶ。 */
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
  return { basic: basic.dst, trial: null };
}

/** ★0203 版 2（■3）: 写したときの体験入店のプランの選び方の 1 行（完了の画面・選ばずに体入を登録したときの語） */
export const TRIAL_PICK_NOTE = "体験入店のプランを選んでください（1 店目の設定からは分からないため、写したプランから選びます）";
