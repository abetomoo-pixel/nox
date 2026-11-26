// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops/orgs/new＝テナントを追加。
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import OpsShell from "../../ops-shell";
import NewOrgFormView from "./new-org-form";
import { opsInquiryWaitingCountOf } from "@/lib/nox/ops/inquiry-waiting"; // ★M2-4: 上の帯の未対応の数

export const dynamic = "force-dynamic";

export default async function OpsNewOrgPage() {
  const op = await requireOperatorPage();
  return <OpsShell name={op.name} role={op.role} waiting={await opsInquiryWaitingCountOf()}><NewOrgFormView /></OpsShell>;
}
