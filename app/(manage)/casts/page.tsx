import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import CastsBoard from "./casts-board";

export const dynamic = "force-dynamic";

// 女の子管理（F3d 体入採用 UI・owner/manager のみ）。staff/cast は nav 非表示＋直打ちリダイレクト
// （真の防御は trials RLS owner/manager 限定＋trial_*/cast_create RPC ゲート）。
// 一覧は trials の直接 SELECT（RLS: owner=org 全店/manager=自店）。stores も同スコープ＝登録先候補。
export default async function CastsPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  if (role !== "owner" && role !== "manager") redirect("/register");
  const { data: trials } = await supabase
    .from("trials")
    .select("id, store_id, name, real_name, birthday, tier, rating, documents, memo, status, trial_date")
    .eq("status", "trial")
    .order("created_at", { ascending: false });
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  // F3g' castログイン招待（mig0041）: 在籍 cast の結線状態（user_id の有無のみ・RLS 自動スコープ）。
  const { data: loginCasts } = await supabase
    .from("casts")
    .select("id, name, user_id")
    .eq("is_active", true)
    .order("name");
  return (
    <CastsBoard
      isOwner={role === "owner"}
      stores={(stores ?? []) as { id: string; name: string }[]}
      myStoreId={(myStoreId as string | null) ?? ""}
      initialTrials={(trials ?? []) as Trial[]}
      initialLoginCasts={(loginCasts ?? []) as CastLogin[]}
    />
  );
}

export type Trial = {
  id: string; store_id: string; name: string; real_name: string | null; birthday: string | null;
  tier: string | null; rating: number | null; documents: Record<string, boolean> | null;
  memo: string | null; status: string; trial_date: string | null;
};

export type CastLogin = { id: string; name: string; user_id: string | null };
