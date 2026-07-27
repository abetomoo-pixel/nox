import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { TabBar, type NavGroup } from "@/components/ui/nav";
import * as t from "@/lib/nox/ui/theme";

// cast エリアの layout。auth_role() rpc は「ここで1回/リクエスト」のみ（F1f plan §2）。
// リダイレクトは利便のため・真の防御は RLS/RPC（cast 以外がすり抜けても DB は cast データを返さない…の逆も同様）。
export default async function MineLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "cast") redirect("/register");
  // 段N: TabBar が群構造になったため1群（見出しなし）で渡す＝/mine の並び・挙動は完全に不変。
  //   spPriority は渡さない＝4項目をそのままボトムタブに並べる（従来どおり）。
  const groups: NavGroup[] = [{
    label: null,
    items: [
      { href: "/mine", label: "マイ" },
      { href: "/mine/wishes", label: "希望" },
      { href: "/mine/ranking", label: "ランキング" },
      { href: "/mine/notices", label: "お知らせ" },
    ],
  }];
  return (
    <div className="nox-dark" style={t.appBg}>
      <div style={t.wrap}>
        <header className="nox-topbar">
          <span style={t.brand}>NOX</span>
          <span style={{ marginLeft: "auto", ...t.rolePill }}>{t.roleLabelJa(role as string)}</span>
          <form action="/auth/signout" method="post" style={{ display: "flex" }}>
            <button type="submit" style={{ ...t.btnGhost, ...t.btnSm }}>ログアウト</button>
          </form>
        </header>
        <main className="nox-main">{children}</main>
        <TabBar groups={groups} />
      </div>
    </div>
  );
}
