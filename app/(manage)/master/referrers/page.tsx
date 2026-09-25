import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ReferrersBoard, { type Referrer, type MemberOpt } from "./referrers-board";

export const dynamic = "force-dynamic";

// 紹介者マスタ＋紹介料の支払一覧（mig0152・裁定280-2／292-3／298-5／298-6・2026-09-25）。
// ★ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御は set_referrer／referral_payout_pay／referral_payouts_pay_bulk／referral_payouts_unpaid の RPC 側
//   （owner ∨ manager 自店・課金ゲート）と 3 表の SELECT RLS（cast 0 行）。
// 取得は「このページが描くのに要る分だけ」: referrers（一覧・編集）＋ memberships（staff 紹介者の所属候補・cast を除く）＋ storeId。
export default async function MasterReferrersPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id").order("name").limit(1);
  const storeId = (stores?.[0]?.id as string | undefined) ?? "";
  const { data: referrers } = await supabase
    .from("referrers")
    .select("id, kind, membership_id, name, contact, withholding_category, is_active")
    .eq("store_id", storeId)
    .order("is_active", { ascending: false })
    .order("name");
  const { data: mems } = await supabase
    .from("memberships")
    .select("id, role, users(name)")
    .eq("store_id", storeId)
    .eq("is_active", true);
  const members: MemberOpt[] = ((mems ?? []) as { id: string; role: string; users: { name: string } | { name: string }[] | null }[])
    .filter((m) => m.role !== "cast")
    .map((m) => ({ id: m.id, role: m.role, name: Array.isArray(m.users) ? (m.users[0]?.name ?? "") : (m.users?.name ?? "") }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <ReferrersBoard
      storeId={storeId}
      isManagerUp={isManagerUp}
      initial={(referrers ?? []) as Referrer[]}
      members={members}
    />
  );
}
