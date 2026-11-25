// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: /master/inquiry＝運営への問い合わせ（オーナーと店長）。旗 MIG_0212_APPLIED の後ろ（false は /master へ）。
//   読むもの＝利用者の client（RLS）で ops_inquiries・ops_inquiry_messages（オーナーは会社の全部・店長は自店の 2 店舗目以外）・ops_point_entries（オーナーだけ）・店の一覧（2 店舗目の写し元）。
//   送る＝POST /api/inquiry（運営へのメールは route）。返事＝inquiry_reply・開いたら inquiry_mark_read（画面から RPC を直に）。デモの会社は送るボタンを出さない（関数も断る）。
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import { currentStoreIdOf } from "@/lib/nox/store/current-server";
import { mig0212On } from "@/lib/nox/rules-0175/flag";
import InquiryBoard, { type InquiryRow, type InquiryMsg } from "./inquiry-board";

export const dynamic = "force-dynamic";

export default async function MasterInquiryPage({ searchParams }: { searchParams: Promise<{ id?: string; kind?: string }> }) {
  await managePageGate();
  if (!mig0212On()) redirect("/master");
  const { role } = await getSessionRole();
  if (role !== "owner" && role !== "manager") redirect("/dashboard");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: orgId }, storeId] = await Promise.all([supabase.rpc("auth_org_id"), currentStoreIdOf(supabase)]);
  const [{ data: org }, { data: stores }, { data: rows }, { data: msgs }, { data: points }] = await Promise.all([
    orgId ? supabase.from("orgs").select("is_demo").eq("id", orgId as string).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("stores").select("id, name, settings_json").order("name"),
    supabase.from("ops_inquiries").select("id, store_id, kind, subject, status, status_at, created_role, store_add, added_store_id, last_from, last_at, store_read_at, created_at").order("last_at", { ascending: false }).limit(200),
    supabase.from("ops_inquiry_messages").select("id, inquiry_id, from_ops, body, created_at").order("created_at", { ascending: true }).limit(2000),
    role === "owner" ? supabase.from("ops_point_entries").select("inquiry_id, kind, delta") : Promise.resolve({ data: [] }),
  ]);
  const storeRows = ((stores ?? []) as { id: string; name: string; settings_json: Record<string, unknown> | null }[]).map((s) => ({ id: s.id, name: s.name, setupDone: s.settings_json?.setup_done === true }));
  return (
    <InquiryBoard
      role={role}
      isDemo={org?.is_demo === true}
      storeId={(storeId as string | null) ?? storeRows[0]?.id ?? null}
      stores={storeRows}
      rows={(rows ?? []) as InquiryRow[]}
      messages={(msgs ?? []) as InquiryMsg[]}
      points={role === "owner" ? ((points ?? []) as { inquiry_id: string | null; kind: string; delta: number }[]) : null}
      openId={typeof sp.id === "string" ? sp.id : null}
      startKind={sp.kind === "store_add" && role === "owner" ? "store_add" : null}
    />
  );
}
