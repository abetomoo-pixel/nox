// ★便 P175-prep（2026-10-23）: 0175 v2 の列・表を読む collect の補助＝RULES_0175_APPLIED=true のときだけ呼ばれる（false では import されても実行されない＝列が無い本番で落ちない）。
//   P-1 cast_rate_history／P-2 cancelled_at／P-5 CANON 文脈（comp_plans の拡張列・plan_norm_tiers・slide_decisions・availability_terms・店設定）。
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateHistoryRow } from "@/lib/nox/rules-0175/rate-history";
import type { CanonCtx, NormTier, PayRateTier, SlideDirection } from "@/lib/nox/rules-0175/canon";
import { dohanBandBackOf, type RateBand } from "@/lib/nox/rules-0175/canon"; // ★便 ON-2（CANON ④）: 同伴バックの時間帯
const nextDayOf = (ymd: string): string => { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }; // ★便 ON-2: 期末の翌日（営業日 06:00 まで）
import { salesSubtotalModeOf } from "@/lib/nox/rules-0175/settings";

export type Rules0175Store = { settings: Record<string, unknown> | null; plans: Map<string, { pay_rate_tiers: PayRateTier[]; slide_streak_n: number; reward_axis: string | null; assess_grace_months: number; slide_basis: string; slide_period: string }> };

/** 店のプラン拡張列と店設定（1 回）。フラグ true 専用 */
export async function loadRules0175Store(admin: SupabaseClient, storeId: string): Promise<Rules0175Store> {
  const [st, pl] = await Promise.all([
    admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle(),
    admin.from("comp_plans").select("id, pay_rate_tiers, slide_streak_n, reward_axis, assess_grace_months, slide_basis, slide_period").eq("store_id", storeId),
  ]);
  if (st.error) throw new Error(`stores(0175): ${st.error.message}`);
  if (pl.error) throw new Error(`comp_plans(0175): ${pl.error.message}`);
  const plans = new Map<string, Rules0175Store["plans"] extends Map<string, infer V> ? V : never>();
  for (const p of (pl.data ?? []) as Record<string, unknown>[]) plans.set(p.id as string, { pay_rate_tiers: (p.pay_rate_tiers as PayRateTier[]) ?? [], slide_streak_n: Number(p.slide_streak_n ?? 1), reward_axis: (p.reward_axis as string | null) ?? null, assess_grace_months: Number(p.assess_grace_months ?? 0), slide_basis: String(p.slide_basis ?? "sales"), slide_period: String(p.slide_period ?? "monthly") });
  return { settings: (st.data?.settings_json as Record<string, unknown> | null) ?? null, plans };
}

/** P-1: 期と重なる時給の履歴（cast 別） */
export async function loadRateHistory(admin: SupabaseClient, storeId: string, periodStart: string, periodEnd: string): Promise<Map<string, RateHistoryRow[]>> {
  const { data, error } = await admin.from("cast_rate_history").select("cast_id, kind, rate, valid_from, valid_to").eq("store_id", storeId)
    .lte("valid_from", periodEnd).or(`valid_to.is.null,valid_to.gte.${periodStart}`).order("valid_from");
  if (error) throw new Error(`cast_rate_history: ${error.message}`);
  const m = new Map<string, RateHistoryRow[]>();
  for (const r of (data ?? []) as (RateHistoryRow & { cast_id: string })[]) (m.get(r.cast_id) ?? m.set(r.cast_id, []).get(r.cast_id)!).push({ kind: r.kind, rate: r.rate, valid_from: r.valid_from, valid_to: r.valid_to });
  return m;
}

/** P-5: CANON 文脈（cast 別）＝プランの段・連続 N・規定・週の目安・免除・前期のログ・店の決定。reward_axis が pay_rate のプランだけ返す（他は undefined＝従来） */
export async function loadCanonCtx(admin: SupabaseClient, storeId: string, win: { period: string; periodStart: string; periodEnd: string; periodDays: number }, store: Rules0175Store,
  casts: { castId: string; planId: string | null; membershipId: string | null; joinedOn: string | null; days: number; hours: number; salesSubtotal: number }[]): Promise<Map<string, CanonCtx>> {
  const out = new Map<string, CanonCtx>();
  const planIds = [...new Set(casts.map((c) => c.planId).filter((x): x is string => !!x && store.plans.get(x)?.reward_axis === "pay_rate"))];
  if (planIds.length === 0) return out;
  const [nt, sd, at, rb, dn] = await Promise.all([
    admin.from("plan_norm_tiers").select("plan_id, week_days_min, week_days_max, days_required, hours_required").in("plan_id", planIds),
    admin.from("slide_decisions").select("plan_id, cast_id, period_key, direction, streak, applied_at, excluded_at").eq("store_id", storeId).in("plan_id", planIds),
    admin.from("availability_terms").select("membership_id, week_days_target").eq("store_id", storeId),
    // ★便 ON-2（CANON ④）: 同伴バックの時間帯（plan_rate_bands target 'dohan_back'）
    admin.from("plan_rate_bands").select("plan_id, target, from_min, to_min, value_amount, value_rate, priority").in("plan_id", planIds).eq("target", "dohan_back").eq("is_active", true),
    // ★便 ON-2（CANON ④）: 期間内の指名行（同伴の印と分配率・伝票の開始時刻と total）＝同伴伝票のそのキャスト分＝total × 自分の weight ÷ Σweight（cast_sales_aggregate の prorate と同型）
    admin.from("check_nominations").select("check_id, cast_id, ratio_weight, is_dohan, checks!inner(started_at, status, total, store_id)").eq("checks.store_id", storeId).not("checks.status", "in", "(void,merged)").gte("checks.started_at", `${win.periodStart}T00:00:00+09:00`).lt("checks.started_at", `${nextDayOf(win.periodEnd)}T06:00:00+09:00`),
  ]);
  for (const r of [nt, sd, at, rb, dn]) if (r.error) throw new Error(`0175 ctx: ${r.error.message}`);
  const bandsByPlan = new Map<string, RateBand[]>();
  for (const b of (rb.data ?? []) as (RateBand & { plan_id: string })[]) (bandsByPlan.get(b.plan_id) ?? bandsByPlan.set(b.plan_id, []).get(b.plan_id)!).push({ target: b.target, from_min: b.from_min, to_min: b.to_min, value_amount: b.value_amount, value_rate: b.value_rate, priority: b.priority });
  type Nom = { check_id: string; cast_id: string; ratio_weight: number | null; is_dohan: boolean | null; checks: { started_at: string; status: string; total: number | null } };
  const noms = (dn.data ?? []) as unknown as Nom[];
  const wSum = new Map<string, number>();
  for (const n of noms) wSum.set(n.check_id, (wSum.get(n.check_id) ?? 0) + Math.max(0, n.ratio_weight ?? 0));
  const dohanItemsByCast = new Map<string, { startMin: number; share: number }[]>();
  for (const n of noms) {
    if (!n.is_dohan) continue;
    const tot = wSum.get(n.check_id) ?? 0; const w = Math.max(0, n.ratio_weight ?? 0);
    const share = tot > 0 ? Math.round((n.checks.total ?? 0) * w / tot) : 0;
    const d = new Date(n.checks.started_at); const jst = new Date(d.getTime() + 9 * 3600_000); const startMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();
    (dohanItemsByCast.get(n.cast_id) ?? dohanItemsByCast.set(n.cast_id, []).get(n.cast_id)!).push({ startMin, share });
  }
  const tiersByPlan = new Map<string, NormTier[]>();
  for (const t of (nt.data ?? []) as (NormTier & { plan_id: string })[]) (tiersByPlan.get(t.plan_id) ?? tiersByPlan.set(t.plan_id, []).get(t.plan_id)!).push({ week_days_min: t.week_days_min, week_days_max: t.week_days_max, days_required: t.days_required, hours_required: Number(t.hours_required) });
  const weekByMem = new Map<string, number | null>();
  for (const a of (at.data ?? []) as { membership_id: string; week_days_target: number | null }[]) weekByMem.set(a.membership_id, a.week_days_target);
  type Dec = { plan_id: string; cast_id: string; period_key: string; direction: SlideDirection; streak: number; applied_at: string | null; excluded_at: string | null };
  const decs = (sd.data ?? []) as Dec[];
  for (const c of casts) {
    if (!c.planId) continue; const plan = store.plans.get(c.planId); if (!plan || plan.reward_axis !== "pay_rate") continue;
    const mine = decs.filter((d) => d.plan_id === c.planId && d.cast_id === c.castId).sort((a, b) => (a.period_key < b.period_key ? -1 : 1));
    const cur = mine.find((d) => d.period_key === win.period) ?? null;
    const prev = [...mine].reverse().find((d) => d.period_key < win.period) ?? null;
    out.set(c.castId, {
      tiers: plan.pay_rate_tiers, streakN: plan.slide_streak_n, prevLog: prev ? { direction: prev.direction, streak: prev.streak } : null,
      salesSubtotal: c.salesSubtotal, normTiers: tiersByPlan.get(c.planId) ?? [], weekTarget: c.membershipId ? weekByMem.get(c.membershipId) ?? null : null,
      periodDays: win.periodDays, actual: { days: c.days, hours: c.hours }, joinedOn: c.joinedOn, graceMonths: plan.assess_grace_months, periodEnd: win.periodEnd,
      decided: cur?.applied_at ? "apply" : cur?.excluded_at ? "exclude" : null,
      dohanBandBack: (bandsByPlan.get(c.planId)?.length ?? 0) > 0 ? dohanBandBackOf(bandsByPlan.get(c.planId)!, dohanItemsByCast.get(c.castId) ?? []) : undefined, // ★便 ON-2（CANON ④）
    });
  }
  return out;
}

/** 売上小計の範囲（⑩）＝店設定で due（会計額）か pre_tax_service（税サ前・割引前）。pre_tax_service の集計は check_lines（kind<>discount・pay_fee 除く）の Σ＝呼び出し側が渡す */
export const salesSubtotalModeOfStore = (store: Rules0175Store) => salesSubtotalModeOf(store.settings);

/** cast のメタ（membership_id・入店日）＝CANON 文脈の週の目安・免除に使う。フラグ true 専用 */
export async function loadCastMeta0175(admin: SupabaseClient, storeId: string, castIds: readonly string[]): Promise<Map<string, { membershipId: string | null; joinedOn: string | null }>> {
  const out = new Map<string, { membershipId: string | null; joinedOn: string | null }>();
  if (castIds.length === 0) return out;
  const [cs, ms] = await Promise.all([
    admin.from("casts").select("id, user_id, joined_on").in("id", castIds as string[]),
    admin.from("memberships").select("id, user_id").eq("store_id", storeId).eq("is_active", true), // ★便 ON-1（2026-10-26）: memberships に cast_id 列は無い（user × store）＝casts.user_id で結ぶ（本番 0175 後の初走で発覚）
  ]);
  if (cs.error) throw new Error(`casts(0175): ${cs.error.message}`);
  if (ms.error) throw new Error(`memberships(0175): ${ms.error.message}`);
  const memByUser = new Map<string, string>();
  for (const m of (ms.data ?? []) as { id: string; user_id: string | null }[]) if (m.user_id) memByUser.set(m.user_id, m.id);
  for (const c of (cs.data ?? []) as { id: string; user_id: string | null; joined_on: string | null }[]) out.set(c.id, { membershipId: (c.user_id && memByUser.get(c.user_id)) || null, joinedOn: c.joined_on });
  return out;
}
