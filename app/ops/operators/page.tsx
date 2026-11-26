// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: /ops/operators＝運営者の管理（管理者だけ・担当と旗 false は 404）。
//   読むもの＝ops_operator_list（管理者の確かめつき・auth は読むだけ）と運営者の記録（ops_audit_logs の ops.operator.*・会社に付かない・新しい順 50 件）。書くのは /api/ops/operators/*。
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorAdminPage } from "@/lib/nox/ops/require-operator";
import type { OpsOperatorLog, OpsOperatorRow } from "@/lib/nox/ops/operators";
import OpsShell from "../ops-shell";
import OperatorsBoard from "./operators-board";
import { opsInquiryWaitingCountOf } from "@/lib/nox/ops/inquiry-waiting"; // ★M2-4: 上の帯の未対応の数

export const dynamic = "force-dynamic";

export default async function OpsOperatorsPage() {
  const op = await requireOperatorAdminPage();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ops_operator_list", { p_ops: op.authUserId });
  const rows = (data ?? []) as OpsOperatorRow[];
  const { data: logs } = await admin.from("ops_audit_logs").select("id, at, ops_user_id, action, target, before_json, after_json, reason").like("action", "ops.operator.%").is("org_id", null).order("at", { ascending: false }).limit(50);
  const nameOf = new Map(rows.map((r) => [r.auth_user_id, r.name]));
  const logRows: OpsOperatorLog[] = ((logs ?? []) as { id: string; at: string; ops_user_id: string; action: string; target: string | null; before_json: unknown; after_json: unknown; reason: string | null }[])
    .map((l) => ({ id: l.id, at: l.at, who: nameOf.get(l.ops_user_id) ?? "運営", action: l.action, target: l.target ? (nameOf.get(l.target.replace(/^ops_operators:/, "")) ?? "（消した人）") : null, before: l.before_json, after: l.after_json, reason: l.reason }));
  return (
    <OpsShell name={op.name} role={op.role} waiting={await opsInquiryWaitingCountOf(admin)}>
      {error ? <p role="alert" style={{ color: "var(--bad)" }}>運営者の一覧を読めませんでした</p> : <OperatorsBoard rows={rows} logs={logRows} />}
    </OpsShell>
  );
}
