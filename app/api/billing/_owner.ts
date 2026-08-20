// 課金 route 共通の owner ガード（設計書 v1 §6「/billing は owner 限定」）。
//   ★billingGate は噛ませない（課金操作そのもの＝失効中でも復帰できる必要がある）。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OwnerCtx = { orgId: string; email: string | null };

/** owner でなければ NextResponse（401/403）を返す。owner なら org_id/email を返す。 */
export async function requireOwner(): Promise<NextResponse | OwnerCtx> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [{ data: role }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
  ]);
  if (role !== "owner") return NextResponse.json({ error: "請求の操作はオーナーのみ可能です" }, { status: 403 });
  if (typeof orgId !== "string" || !orgId) return NextResponse.json({ error: "組織を解決できませんでした" }, { status: 403 });
  return { orgId, email: user.email ?? null };
}

/** org の Stripe customer を確保（無ければ作成＋metadata.org_id を刻む＝webhook の org 解決2経路目）。 */
export async function ensureCustomer(orgId: string, email: string | null): Promise<string> {
  const { getStripe } = await import("@/lib/stripe/client");
  const { quantityOf, countStores } = await import("@/lib/billing/quantity");
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("org_billing").select("stripe_customer_id, status").eq("org_id", orgId).maybeSingle();
  const existing = billing?.stripe_customer_id as string | null | undefined;
  if (existing) return existing;

  const stripe = getStripe();
  const { data: org } = await admin.from("orgs").select("name").eq("id", orgId).maybeSingle();
  const customer = await stripe.customers.create({
    name: (org?.name as string | undefined) ?? undefined,
    email: email ?? undefined,
    metadata: { org_id: orgId }, // ★webhook の org 解決2経路目（設計書 §3）
  });
  // 即 org_billing へ書込（堅牢化＝webhook 前に customer→org を引けるようにする）
  await admin.from("org_billing").upsert({
    org_id: orgId,
    stripe_customer_id: customer.id,
    status: (billing?.status as string | undefined) ?? "inactive",
    quantity: quantityOf(await countStores(orgId)),
    updated_at: new Date().toISOString(),
  });
  return customer.id;
}
