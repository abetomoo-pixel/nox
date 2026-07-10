import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { TabBar, type NavItem } from "@/components/ui/nav";
import * as t from "@/lib/nox/ui/theme";

// 店側エリア（register/shift/report/master）の layout。auth_role() rpc は「ここで1回/リクエスト」のみ。
// cast は /mine へ（利便のためのリダイレクト・真の防御はパターン2 RLS＝checks 系 0行）。
// D1a: 配下ページを .nox-dark 化したためシェルもダーク化（DS2'＝中間状態を作らない）。給与/マスタ tab は
//   isManagerUp のみ（staff 非表示＝真の防御は各 RPC の service_role/owner 限定・ここは表示ナビ）。
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const isManagerUp = role === "owner" || role === "manager";
  const items: NavItem[] = [
    { href: "/register", label: "レジ" },
    { href: "/shift", label: "シフト" },
    { href: "/report", label: "日報" },
    ...(isManagerUp
      ? [
          { href: "/payroll", label: "給与" },
          { href: "/staff", label: "スタッフ" },
          { href: "/master", label: "マスタ" },
        ]
      : []),
  ];
  return (
    <div className="nox-dark" style={t.appBg}>
      <div style={t.wrap}>
        <header style={t.topBar}>
          <span style={t.brand}>NOX</span>
          <span style={{ marginLeft: "auto", ...t.rolePill }}>{t.roleLabelJa(role as string)}</span>
          <form action="/auth/signout" method="post" style={{ display: "flex" }}>
            <button type="submit" style={{ ...t.btnGhost, ...t.btnSm }}>ログアウト</button>
          </form>
        </header>
        <main style={t.main}>{children}</main>
        <TabBar items={items} />
      </div>
    </div>
  );
}
