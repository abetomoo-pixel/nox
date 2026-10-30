import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { createClient } from "@/lib/supabase/server";
import { mig0190On } from "@/lib/nox/rules-0175/flag";

export const dynamic = "force-dynamic";

// トップ（E5・裁定8）：F0 プレースホルダを解消し、ロール別の起点へ振り分けるだけの薄い入口。
// モックのログイン後遷移（cast→clock 相当・それ以外→dashboard）と同型。未ログインは /login。
// ★0190 フラグ true 便 K-4（2026-10-30）: 端末アカウント（users/memberships 非連動＝role null）は / を /kiosk（打刻端末）・/kiosk-register（レジ端末）へ。
//   判定＝kiosk_cast_list／kiosk_operator_list が 1 行以上（端末でなければ 0 行＝fail-closed・既存 RPC・読取 2 本）。ログインしていなければ従来どおり /login。
export default async function Home() {
  const { role } = await getSessionRole();
  if (!role) {
    if (mig0190On()) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ops } = await supabase.rpc("kiosk_operator_list");
        if (Array.isArray(ops) && ops.length > 0) redirect("/kiosk-register");
        const { data: casts } = await supabase.rpc("kiosk_cast_list");
        if (Array.isArray(casts) && casts.length > 0) redirect("/kiosk");
      }
    }
    redirect("/login");
  }
  redirect(role === "cast" ? "/mine" : "/dashboard");
}
