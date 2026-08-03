import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import CastsBoard from "./casts-board";

export const dynamic = "force-dynamic";

// キャスト管理（F3d 体入採用 UI・owner/manager のみ）。staff/cast は nav 非表示＋直打ちリダイレクト
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
  // F3g' castログイン招待（mig0041）: cast の結線状態（user_id の有無のみ・RLS 自動スコープ）。
  // 段P: photo_updated_at（null=写真なし。実体パスは規約導出＝URL は保存しない）。
  // 段C2: is_active フィルタを client 側の「在籍/退店済み」タブで行うため .eq("is_active", true) を外した
  //   （RLS スコープは不変＝取れる範囲は従来どおり自店/自 org）。
  const { data: loginCasts } = await supabase
    .from("casts")
    .select("id, name, user_id, photo_updated_at, is_active, store_id, left_on")
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

// 段C2: 退店済み（is_active=false）も取ってフィルタで出し分けるため is_active/store_id を追加。
// mig0074: left_on（退店日・date "YYYY-MM-DD"）。null=在籍中（CHECK casts_active_left_on_chk で is_active と一対一）。
export type CastLogin = { id: string; name: string; user_id: string | null; photo_updated_at: string | null; is_active: boolean; store_id: string; left_on: string | null };
