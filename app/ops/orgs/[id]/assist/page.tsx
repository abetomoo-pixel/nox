// ★導入の代行 版 2（2026-11-21 夜・枝 night1121-ops-v2・旗 MIG_0202B_APPLIED の後ろ＝false は 404）: /ops/orgs/[id]/assist＝1 歩ずつ（初期設定の下書き → LINE 連携 4 段 → キャストの仮の登録）。
//   読むもの（admin・運営者の確かめの後）: 会社の 1 行（ops_org_list）・最初の店（名前・業態・LINE の鍵の有無だけ＝値は読まない）・下書き（updated_at・assisted・data）・サポート許可・仮の登録。
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import { mig0202bOn } from "@/lib/nox/rules-0175/flag";
import type { OpsOrgRow } from "@/lib/nox/ops/labels";
import OpsShell from "../../../ops-shell";
import AssistWizard, { type AssistProps } from "./assist-wizard";
import { opsInquiryWaitingCountOf } from "@/lib/nox/ops/inquiry-waiting"; // ★M2-4: 上の帯の未対応の数

export const dynamic = "force-dynamic";

export default async function OpsAssistPage({ params }: { params: Promise<{ id: string }> }) {
  if (!mig0202bOn()) notFound();
  const op = await requireOperatorPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const admin = createAdminClient();
  const { data: rows } = await admin.rpc("ops_org_list", { p_ops: op.authUserId });
  const row = ((rows ?? []) as OpsOrgRow[]).find((r) => r.org_id === id);
  if (!row) notFound();
  const [{ data: org }, { data: store }, { data: grant }] = await Promise.all([
    admin.from("orgs").select("is_demo").eq("id", id).maybeSingle(),
    admin.from("stores").select("id, name, settings_json, line_config").eq("org_id", id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    admin.from("ops_support_grants").select("expires_at").eq("org_id", id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!store) notFound();
  const [{ data: draft }, { data: prov }] = await Promise.all([
    admin.from("setup_drafts").select("data, updated_at, assisted").eq("store_id", store.id).maybeSingle(),
    admin.from("cast_provisionals").select("id, name, created_who, created_at, promoted_at, discarded_at").eq("store_id", store.id).order("created_at", { ascending: true }),
  ]);
  const lc = (store.line_config ?? {}) as Record<string, unknown>;
  const has = (k: string) => typeof lc[k] === "string" && (lc[k] as string).length > 0;
  const sj = (store.settings_json ?? {}) as Record<string, unknown>;
  const props: AssistProps = {
    orgId: id, orgName: row.org_name, onboardingState: row.onboarding_state, isDemo: org?.is_demo === true, supportUntil: (grant?.expires_at as string | undefined) ?? null,
    storeId: store.id as string, storeName: store.name as string, bizType: typeof sj.biz_type === "string" ? (sj.biz_type as string) : null, setupDone: sj.setup_done === true,
    draft: draft ? { updatedAt: draft.updated_at as string, assisted: draft.assisted ?? null, data: draft.data ?? null } : null,
    line: { login_channel_id: has("login_channel_id"), liff_id: has("liff_id"), bot_basic_id: has("bot_basic_id"), channel_secret_ref: has("channel_secret_ref"), access_token_ref: has("access_token_ref"), line_verified_at: has("line_verified_at") ? (lc.line_verified_at as string) : null },
    provisionals: ((prov ?? []) as { id: string; name: string; created_who: string | null; created_at: string; promoted_at: string | null; discarded_at: string | null }[]),
    nowIso: new Date().toISOString(),
  };
  return <OpsShell name={op.name} role={op.role} waiting={await opsInquiryWaitingCountOf(admin)}><AssistWizard {...props} /></OpsShell>;
}
