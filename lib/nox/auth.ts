import { createClient } from "@/lib/supabase/server";

// セッションのロール取得（サーバ専用）。
// 各エリアの layout で「1回/リクエスト」だけ呼ぶ（F1f plan §2 の設計）。
// ここでの分岐は利便のためのリダイレクトであり、真の防御は RLS / RPC（DB 物理保証）。
export async function getSessionRole(): Promise<{ role: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null };
  const { data: role } = await supabase.rpc("auth_role");
  return { role: (role as string | null) ?? null };
}
