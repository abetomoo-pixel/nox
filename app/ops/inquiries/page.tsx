// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: /ops/inquiries＝全社の問い合わせの一覧（会社・店・種類・件名・状態・最後の発言・未対応の印）。旗 MIG_0212_APPLIED の後ろ（false は 404）。
//   読むもの＝admin で ops_inquiries・orgs・stores（表は service_role に select だけ）。状態で絞る（?f=waiting 未対応／open 開いている／all 全部）。書くのは /api/ops/inquiries/[id]。
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import { mig0212On } from "@/lib/nox/rules-0175/flag";
import * as t from "@/lib/nox/ui/theme";
import OpsShell from "../ops-shell";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL, inquiryAtOf, inquiryClosedOf, inquiryNoOf, opsInquiryWaitingOf, type InquiryKind, type InquiryStatus } from "@/lib/nox/inquiry/labels";

export const dynamic = "force-dynamic";
type Row = { id: string; org_id: string; store_id: string; kind: string; subject: string; status: string; last_from: string; last_at: string; created_at: string };
const FILTERS: ReadonlyArray<readonly [string, string]> = [["waiting", "未対応"], ["open", "開いている"], ["all", "全部"]];

export default async function OpsInquiriesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const op = await requireOperatorPage();
  if (!mig0212On()) notFound();
  const f = (await searchParams).f ?? "waiting";
  const admin = createAdminClient();
  const [{ data: rows, error }, { data: orgs }, { data: stores }] = await Promise.all([
    admin.from("ops_inquiries").select("id, org_id, store_id, kind, subject, status, last_from, last_at, created_at").order("last_at", { ascending: false }).limit(300),
    admin.from("orgs").select("id, name"),
    admin.from("stores").select("id, name"),
  ]);
  const orgName = new Map(((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const storeName = new Map(((stores ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const all = (rows ?? []) as Row[];
  const waiting = all.filter(opsInquiryWaitingOf);
  const shown = f === "all" ? all : f === "open" ? all.filter((r) => !inquiryClosedOf(r.status)) : waiting;
  return (
    <OpsShell name={op.name}>
      <div style={{ maxWidth: 960, margin: "0 auto" }} data-ops-inquiries="1">
        <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>問い合わせ</h1>
        <p style={{ margin: "0 0 10px", fontSize: 14 }} data-ops-inquiry-waiting={waiting.length}>未対応 <b>{waiting.length}</b> 件（最後が店の発言で、対応済み・見送りでないもの）</p>
        <div className="nox-seg" role="group" aria-label="絞り込み" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          {FILTERS.map(([k, l]) => <Link key={k} href={`/ops/inquiries?f=${k}`} className={f === k ? "on" : ""} aria-current={f === k ? "page" : undefined} style={{ textDecoration: "none" }}>{l}</Link>)}
        </div>
        {error ? <p role="alert" style={{ color: "var(--bad)" }}>一覧を読めませんでした</p> : shown.length === 0 ? <p style={{ ...t.sub, fontSize: 13 }}>ありません</p> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {shown.map((r) => (
              <li key={r.id} data-ops-inquiry-row={r.id}>
                <Link href={`/ops/inquiries/${r.id}`} style={{ ...t.card, display: "grid", gap: 4, textDecoration: "none", color: "inherit", padding: "10px 12px" }}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                    {opsInquiryWaitingOf(r) && <span className="nox-stpill warn">未対応</span>}
                    <span className="nox-stpill">{INQUIRY_STATUS_LABEL[r.status as InquiryStatus] ?? r.status}</span>
                    <span className="nox-stpill">{INQUIRY_KIND_LABEL[r.kind as InquiryKind] ?? r.kind}</span>
                    <b style={{ overflowWrap: "anywhere" }}>{r.subject}</b>
                  </span>
                  <span style={{ ...t.sub, fontSize: 12 }}>{orgName.get(r.org_id) ?? "—"}・{storeName.get(r.store_id) ?? "—"}・番号 {inquiryNoOf(r.id)}・最後 {inquiryAtOf(r.last_at)}（{r.last_from === "ops" ? "運営" : "店"}）</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
