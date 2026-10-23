import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 3 R-8

// セッションのロール取得（サーバ専用）。
// React cache() でリクエスト内デデュープ＝layout と page の両方から呼んでも
// auth_role() rpc は「1回/リクエスト」を維持（F1f plan §2 の設計）。
// ここでの分岐は利便のためのリダイレクトであり、真の防御は RLS / RPC（DB 物理保証）。
// ★追補 3 R-8（裁定425 候補・0175 v2 ★28）: roleRaw＝本来の役割（admin）。フラグ true のとき auth_role_raw() を並行で 1 本足す（owner 限定 4 つと「管理者」の表示だけが使う）。
//   フラグ false＝従来どおり auth_role() 1 本・roleRaw は role と同じ。
export const getSessionRole = cache(async (): Promise<{ role: string | null; roleRaw: string | null }> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null, roleRaw: null };
  if (rules0175On()) {
    const [{ data: role }, { data: raw }] = await Promise.all([supabase.rpc("auth_role"), supabase.rpc("auth_role_raw")]);
    return { role: (role as string | null) ?? null, roleRaw: ((raw as string | null) ?? (role as string | null)) ?? null };
  }
  const { data: role } = await supabase.rpc("auth_role");
  return { role: (role as string | null) ?? null, roleRaw: (role as string | null) ?? null };
});
