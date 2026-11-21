// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops/orgs/[id]＝テナントの詳細（オーナー・経路・導入・導入の状況・運営の記録）。
//   読むもの＝ops_org_list の 1 行（運営者の確かめつき）と ops_audit_logs（この会社・新しい順 20 件・経路の履歴 5 件）。書くのは /api/ops/orgs/[id]/*。
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import type { OpsOrgRow } from "@/lib/nox/ops/labels";
import OpsShell from "../../ops-shell";
import { mig0202bOn } from "@/lib/nox/rules-0175/flag";
import { assistGateOf } from "@/lib/nox/ops/assist";
import OrgDetail, { type OpsLogRow } from "./org-detail";

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
  return <OpsShell name={op.name}><OrgDetail row={row} logs={logRows} nowIso={new Date().toISOString()} assist={assist} /></OpsShell>;
}
