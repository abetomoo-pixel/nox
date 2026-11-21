// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops＝テナント一覧（ops_org_list＝会社ごとの導入の状況・金額や業務の列は返さない）。
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import type { OpsOrgRow } from "@/lib/nox/ops/labels";
import OpsShell from "./ops-shell";
import OrgList from "./org-list";

export const dynamic = "force-dynamic";

export default async function OpsHomePage() {
  const op = await requireOperatorPage();
  const { data, error } = await createAdminClient().rpc("ops_org_list", { p_ops: op.authUserId });
  return (
    <OpsShell name={op.name}>
      {error ? <p role="alert" style={{ color: "var(--bad)" }}>一覧を読めませんでした</p> : <OrgList rows={(data ?? []) as OpsOrgRow[]} />}
    </OpsShell>
  );
}
