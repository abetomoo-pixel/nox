import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";

// cast エリアの layout。auth_role() rpc は「ここで1回/リクエスト」のみ（F1f plan §2）。
// リダイレクトは利便のため・真の防御は RLS/RPC（cast 以外がすり抜けても DB は cast データを返さない…の逆も同様）。
export default async function MineLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "cast") redirect("/register");
  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          background: "#16161a",
          color: "#fff",
        }}
      >
        <strong>NOX</strong>
        <nav style={{ display: "flex", gap: 12, fontSize: 14 }}>
          <Link href="/mine" style={{ color: "#fff" }}>マイ</Link>
          <Link href="/mine/wishes" style={{ color: "#fff" }}>希望</Link>
          <Link href="/mine/ranking" style={{ color: "#fff" }}>ランキング</Link>
        </nav>
        <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
          <button
            type="submit"
            style={{ background: "none", border: "1px solid #555", color: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
          >
            ログアウト
          </button>
        </form>
      </header>
      <main style={{ padding: 16 }}>{children}</main>
    </div>
  );
}
