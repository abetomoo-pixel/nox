import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";

export const dynamic = "force-dynamic";

// トップ（E5・裁定8）：F0 プレースホルダを解消し、ロール別の起点へ振り分けるだけの薄い入口。
// モックのログイン後遷移（cast→clock 相当・それ以外→dashboard）と同型。未ログインは /login。
export default async function Home() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  redirect(role === "cast" ? "/mine" : "/dashboard");
}
