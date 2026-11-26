// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops＝テナント一覧（ops_org_list＝会社ごとの導入の状況・金額や業務の列は返さない）。
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import type { OpsOrgRow } from "@/lib/nox/ops/labels";
import OpsShell from "./ops-shell";
import OrgList from "./org-list";
import Link from "next/link";
import { mig0212On } from "@/lib/nox/rules-0175/flag"; // ★0212
import { opsInquiryWaitingByOrgOf } from "@/lib/nox/ops/inquiry-waiting"; // ★M2-4: 会社ごとの未対応（全社の数＝和）

export const dynamic = "force-dynamic";

export default async function OpsHomePage() {
  const op = await requireOperatorPage();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ops_org_list", { p_ops: op.authUserId });
  // ★起票154（2026-11-24）: 契約の列＝org_billing の解約の予定と次の請求日（読むだけ・DB にある値だけ）
  const { data: bills } = await admin.from("org_billing").select("org_id, cancel_at_period_end, current_period_end");
  const billing = Object.fromEntries(((bills ?? []) as { org_id: string; cancel_at_period_end: boolean | null; current_period_end: string | null }[]).map((b) => [b.org_id, { cancel_at_period_end: b.cancel_at_period_end, current_period_end: b.current_period_end }]));
  // ★0212（窓口の段 1）: 一覧の上に「問い合わせの未対応 N 件」の 1 行（最後が店の発言で閉じていないもの）
  //   ★相談役 11/26 の便 M2-4: 会社ごとの未対応（一覧の会社の行に赤い印）と上の帯の赤い数（全社の和）
  const waitingBy = mig0212On() ? await opsInquiryWaitingByOrgOf(admin) : null;
  const waiting: number | null = waitingBy ? Object.values(waitingBy).reduce((a, n) => a + n, 0) : null;
  return (
    <OpsShell name={op.name} role={op.role} waiting={waiting}>
      {waiting !== null && <p style={{ margin: "0 0 10px", fontSize: 14 }} data-ops-inquiry-waiting-top={waiting}><Link href="/ops/inquiries" className="nox-link">問い合わせの未対応 {waiting} 件 ›</Link></p>}
      {error ? <p role="alert" style={{ color: "var(--bad)" }}>一覧を読めませんでした</p> : <OrgList rows={(data ?? []) as OpsOrgRow[]} billing={billing} nowIso={new Date().toISOString()} waitingBy={waitingBy ?? {}} />}
    </OpsShell>
  );
}
