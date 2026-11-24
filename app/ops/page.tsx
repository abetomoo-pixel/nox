// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops＝テナント一覧（ops_org_list＝会社ごとの導入の状況・金額や業務の列は返さない）。
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import type { OpsOrgRow } from "@/lib/nox/ops/labels";
import OpsShell from "./ops-shell";
import OrgList from "./org-list";

export const dynamic = "force-dynamic";

export default async function OpsHomePage() {
  const op = await requireOperatorPage();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ops_org_list", { p_ops: op.authUserId });
  // ★起票154（2026-11-24）: 契約の列＝org_billing の解約の予定と次の請求日（読むだけ・DB にある値だけ）
  const { data: bills } = await admin.from("org_billing").select("org_id, cancel_at_period_end, current_period_end");
  const billing = Object.fromEntries(((bills ?? []) as { org_id: string; cancel_at_period_end: boolean | null; current_period_end: string | null }[]).map((b) => [b.org_id, { cancel_at_period_end: b.cancel_at_period_end, current_period_end: b.current_period_end }]));
  return (
    <OpsShell name={op.name}>
      {error ? <p role="alert" style={{ color: "var(--bad)" }}>一覧を読めませんでした</p> : <OrgList rows={(data ?? []) as OpsOrgRow[]} billing={billing} nowIso={new Date().toISOString()} />}
    </OpsShell>
  );
}
