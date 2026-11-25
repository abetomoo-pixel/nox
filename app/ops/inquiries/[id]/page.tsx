// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: /ops/inquiries/[id]＝問い合わせ 1 件（やりとり・返事・状態・ポイント・取り消し・2 店舗目は店を足す）。旗 MIG_0212_APPLIED の後ろ。
//   読むもの＝admin で ops_inquiries・ops_inquiry_messages・ops_point_entries（会社の残りと履歴）・orgs・stores・ops_operators（名前）。書くのは /api/ops/inquiries/[id]。
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import { mig0212On } from "@/lib/nox/rules-0175/flag";
import OpsShell from "../../ops-shell";
import OpsInquiryDetail, { type OpsInquiry, type OpsInquiryMsg, type OpsPointRow } from "./inquiry-detail";

export const dynamic = "force-dynamic";

export default async function OpsInquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const op = await requireOperatorPage();
  if (!mig0212On()) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const admin = createAdminClient();
  const { data: inq } = await admin.from("ops_inquiries").select("id, org_id, store_id, kind, subject, status, status_at, created_role, store_add, added_store_id, last_from, last_at, store_read_at, created_at").eq("id", id).maybeSingle();
  if (!inq) notFound();
  const row = inq as OpsInquiry;
  const [{ data: msgs }, { data: pts }, { data: org }, { data: stores }, { data: ops }] = await Promise.all([
    admin.from("ops_inquiry_messages").select("id, from_ops, author_ops_id, body, created_at").eq("inquiry_id", id).order("created_at", { ascending: true }),
    admin.from("ops_point_entries").select("id, inquiry_id, kind, delta, reason, ops_user_id, created_at").eq("org_id", row.org_id).order("created_at", { ascending: false }),
    admin.from("orgs").select("name, is_demo").eq("id", row.org_id).maybeSingle(),
    admin.from("stores").select("id, name, settings_json").eq("org_id", row.org_id).order("created_at"),
    admin.from("ops_operators").select("auth_user_id, name"),
  ]);
  const opName = new Map(((ops ?? []) as { auth_user_id: string; name: string }[]).map((o) => [o.auth_user_id, o.name]));
  const storeRows = ((stores ?? []) as { id: string; name: string; settings_json: Record<string, unknown> | null }[]).map((s) => ({ id: s.id, name: s.name, setupDone: s.settings_json?.setup_done === true }));
  return (
    <OpsShell name={op.name}>
      <OpsInquiryDetail
        row={row}
        orgName={(org?.name as string | undefined) ?? "—"}
        isDemo={org?.is_demo === true}
        stores={storeRows}
        messages={((msgs ?? []) as (OpsInquiryMsg & { author_ops_id: string | null })[]).map((m) => ({ ...m, who: m.from_ops ? opName.get(m.author_ops_id ?? "") ?? "運営" : "店" }))}
        points={((pts ?? []) as OpsPointRow[]).map((p) => ({ ...p, who: opName.get(p.ops_user_id) ?? "運営" }))}
      />
    </OpsShell>
  );
}
