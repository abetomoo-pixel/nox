// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops/orgs/[id]＝テナントの詳細（オーナー・経路・導入・導入の状況・運営の記録）。
//   読むもの＝ops_org_list の 1 行（運営者の確かめつき）と ops_audit_logs（この会社・新しい順 20 件・経路の履歴 5 件）。書くのは /api/ops/orgs/[id]/*。
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import type { OpsOrgRow } from "@/lib/nox/ops/labels";
import OpsShell from "../../ops-shell";
import { mig0202bOn, mig0203On, mig0207On } from "@/lib/nox/rules-0175/flag";
import { supportAskShownOf, type SupportAskRow } from "@/lib/nox/support/support-ask"; // ★0207
import { assistGateOf } from "@/lib/nox/ops/assist";
import OrgDetail, { type OpsLogRow } from "./org-detail";
import type { OpsBilling, OpsStoreSetup } from "@/lib/nox/ops/view"; // ★起票153・154

export const dynamic = "force-dynamic";

export default async function OpsOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const op = await requireOperatorPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const admin = createAdminClient();
  const { data: rows } = await admin.rpc("ops_org_list", { p_ops: op.authUserId });
  const row = ((rows ?? []) as OpsOrgRow[]).find((r) => r.org_id === id);
  if (!row) notFound();
  const { data: logs } = await admin.from("ops_audit_logs").select("id, at, ops_user_id, action, before_json, after_json, reason").eq("org_id", id).order("at", { ascending: false }).limit(20);
  const { data: ops } = await admin.from("ops_operators").select("auth_user_id, name");
  const nameOf = new Map(((ops ?? []) as { auth_user_id: string; name: string }[]).map((o) => [o.auth_user_id, o.name]));
  const logRows: OpsLogRow[] = ((logs ?? []) as { id: string; at: string; ops_user_id: string; action: string; before_json: unknown; after_json: unknown; reason: string | null }[])
    .map((l) => ({ id: l.id, at: l.at, who: nameOf.get(l.ops_user_id) ?? "運営", action: l.action, before: l.before_json, after: l.after_json, reason: l.reason }));
  // ★枝 night1121-ops-v2（0202b 版 4・旗 MIG_0202B_APPLIED の後ろ）: 導入を代行する（書けるか＝導入中か、オーナーのサポート許可の間・デモは不可）
  let assist: { ok: boolean; reason: string | null } | null = null;
  if (mig0202bOn()) {
    const [{ data: org }, { data: grant }] = await Promise.all([
      admin.from("orgs").select("is_demo").eq("id", id).maybeSingle(),
      admin.from("ops_support_grants").select("expires_at").eq("org_id", id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    assist = org?.is_demo === true ? null : assistGateOf({ onboarding_state: row.onboarding_state, is_demo: false, support_until: (grant?.expires_at as string | undefined) ?? null }, new Date());   // デモの会社には入口を出さない（代行の関数もデモを止める）
  }
  // ★0203（■2-a）: 店を追加＝会社の店の一覧（デモは出さない）
  let stores: { id: string; name: string; setupDone: boolean }[] | null = null;
  // ★起票153（2026-11-24）: 導入の状況に「どの店の話か」＝店ごとの初期設定（済み／途中 STEP n／未着手）＝下書きの STEP を読む（読むだけ）
  const [{ data: orgRow }, { data: stAll }, { data: drafts }, { data: bill }] = await Promise.all([
    admin.from("orgs").select("is_demo").eq("id", id).maybeSingle(),
    admin.from("stores").select("id, name, settings_json, created_at").eq("org_id", id).order("created_at"),
    admin.from("setup_drafts").select("store_id, data").eq("org_id", id),
    admin.from("org_billing").select("status, trial_ends_at, current_period_end, quantity, cancel_at_period_end, stripe_customer_id, stripe_subscription_id").eq("org_id", id).maybeSingle(),
  ]);
  const stepOf = new Map(((drafts ?? []) as { store_id: string; data: { S?: { step?: unknown } } | null }[]).map((d) => [d.store_id, typeof d.data?.S?.step === "number" ? (d.data.S.step as number) : null]));
  const storeSetups: OpsStoreSetup[] = ((stAll ?? []) as { id: string; name: string; settings_json: Record<string, unknown> | null }[]).map((r) => ({ id: r.id, name: r.name, setupDone: r.settings_json?.setup_done === true, draftStep: stepOf.get(r.id) ?? null }));
  if (mig0203On()) stores = orgRow?.is_demo === true ? null : storeSetups.map((s) => ({ id: s.id, name: s.name, setupDone: s.setupDone })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  // ★起票154（2026-11-24）: 契約のカード＝org_billing にある値だけ（キーの有無だけ＝Stripe の ID は画面に出さない）
  const b = bill as { status: string | null; trial_ends_at: string | null; current_period_end: string | null; quantity: number | null; cancel_at_period_end: boolean | null; stripe_customer_id: string | null; stripe_subscription_id: string | null } | null;
  const billing: OpsBilling | null = b ? { status: b.status, trial_ends_at: b.trial_ends_at, current_period_end: b.current_period_end, quantity: b.quantity, cancel_at_period_end: b.cancel_at_period_end, has_customer: !!b.stripe_customer_id, has_subscription: !!b.stripe_subscription_id } : null;
  // ★0207（相談役 11/25 朝の便 M3）: 開いている頼み（頼みの後に許可が出ていれば済んだもの＝出さない）
  let supportAsk: SupportAskRow | null = null;
  if (mig0207On()) {
    const [{ data: req }, { data: lastGrant }] = await Promise.all([
      admin.from("ops_support_requests").select("id, requested_at, message").eq("org_id", id).is("closed_at", null).maybeSingle(),
      admin.from("ops_support_grants").select("granted_at").eq("org_id", id).order("granted_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    supportAsk = supportAskShownOf(req as SupportAskRow | null, (lastGrant?.granted_at as string | undefined) ?? null);
  }
  return <OpsShell name={op.name} role={op.role}><OrgDetail supportAsk={supportAsk} row={row} logs={logRows} nowIso={new Date().toISOString()} assist={assist} stores={stores} storeSetups={storeSetups} billing={billing} /></OpsShell>;
}
