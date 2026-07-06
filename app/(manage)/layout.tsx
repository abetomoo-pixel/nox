import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";

// 店側エリア（register/shift/report/master）の layout。auth_role() rpc は「ここで1回/リクエスト」のみ。
// cast は /mine へ（利便のためのリダイレクト・真の防御はパターン2 RLS＝checks 系 0行）。
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const isManagerUp = role === "owner" || role === "manager";
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
          <Link href="/register" style={{ color: "#fff" }}>レジ</Link>
          <Link href="/shift" style={{ color: "#fff" }}>シフト</Link>
          <Link href="/report" style={{ color: "#fff" }}>日報</Link>
          {isManagerUp && (
            <>
              <Link href="/payroll" style={{ color: "#fff" }}>給与</Link>
              <Link href="/master" style={{ color: "#fff" }}>マスタ</Link>
            </>
          )}
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#8f8f8f" }}>{role}</span>
        <form action="/auth/signout" method="post">
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
