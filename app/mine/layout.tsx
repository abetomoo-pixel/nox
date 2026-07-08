import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { TabBar, type NavItem } from "@/components/ui/nav";
import * as t from "@/lib/nox/ui/theme";

// cast エリアの layout。auth_role() rpc は「ここで1回/リクエスト」のみ（F1f plan §2）。
// リダイレクトは利便のため・真の防御は RLS/RPC（cast 以外がすり抜けても DB は cast データを返さない…の逆も同様）。
export default async function MineLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "cast") redirect("/register");
  const items: NavItem[] = [
    { href: "/mine", label: "マイ" },
    { href: "/mine/wishes", label: "希望" },
    { href: "/mine/ranking", label: "ランキング" },
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
