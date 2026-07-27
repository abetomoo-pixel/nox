import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { TabBar, type NavGroup } from "@/components/ui/nav";
import * as t from "@/lib/nox/ui/theme";

// 店側エリア（register/shift/report/master）の layout。auth_role() rpc は「ここで1回/リクエスト」のみ。
// cast は原則 /mine へ（利便のためのリダイレクト・真の防御はパターン2 RLS＝checks 系 0行）。
// F3g: キャスト会計（mig0039）＝有効 cast（auth_cast_can_register）のみ /register を許可し、
//   shift/report/master 等は引き続き /mine へ。真の防御は会計 RLS/RPC の cast 2段ゲート（ここは表示制御）。
// D1a: 配下ページを .nox-dark 化したためシェルもダーク化（DS2'＝中間状態を作らない）。給与/マスタ tab は
//   isManagerUp のみ（staff 非表示＝真の防御は各 RPC の service_role/owner 限定・ここは表示ナビ）。
// F3b-A: 顧客 tab は owner/manager＋staff∧can_crm（server 導出・真の防御は customer_* RPC の可視ガード）。
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  const supabase = await createClient();

  // F3g: cast のエリア制御。有効 cast は /register のみ通し、他パスは /mine へ。
  let castReg = false;
  if (role === "cast") {
    const pathname = (await headers()).get("x-pathname") ?? "";
    const onRegister = pathname === "/register" || pathname.startsWith("/register/");
    if (onRegister) {
      const { data } = await supabase.rpc("auth_cast_can_register");
      castReg = data === true;
    }
    if (!(onRegister && castReg)) redirect("/mine");
  }

  const isManagerUp = role === "owner" || role === "manager";
  let staffCrm = false;
  if (role === "staff") {
    const { data } = await supabase.rpc("auth_staff_can_crm");
    staffCrm = data === true;
  }
  // ★UI刷新v2 段N（正本 nox-nav-redesign-mock-v2.html）: 5群構成へ再編。
  //   ★ルート/URL/ページ実体/role ゲートは完全不変＝並び・群見出し・ラベルだけを変えた
  //     （項目集合も現行と同一。モックの「受付/イベント/ポイント/権限設定/ヘルプ」等は作らない）。
  //   群見出しは表示のみ（クリック不可・折り畳みなし）。ホームは群外の先頭。
  //   有効 cast はレジのみ（他タブは踏んでも layout が /mine へ戻す＝混乱を避け1本に絞る）＝従来どおり。
  const groups: NavGroup[] = role === "cast"
    ? [{ label: null, items: [{ href: "/register", label: "レジ" }] }]
    : [
        { label: null, items: [{ href: "/dashboard", label: "ホーム" }] },
        { label: "営業", items: [
          { href: "/register", label: "レジ" },
          { href: "/report", label: "日報" },
        ] },
        { label: "スタッフ", items: [
          { href: "/shift", label: "シフト" },
          // 文言統一（Agoora 裁定確定）: 「女の子」→「キャスト」
          ...(isManagerUp ? [{ href: "/casts", label: "キャスト" }, { href: "/staff", label: "スタッフ" }, { href: "/payroll", label: "給与" }] : []),
        ] },
        { label: "顧客", items: [
          ...(isManagerUp || staffCrm ? [{ href: "/customers", label: "顧客" }] : []),
        ] },
        { label: "分析", items: [
          ...(isManagerUp ? [{ href: "/analytics", label: "分析" }] : []),
        ] },
        { label: "店舗", items: [
          ...(isManagerUp ? [{ href: "/master", label: "マスタ" }] : []),
          { href: "/notices", label: "お知らせ" },
          // 監査ログは owner 限定（RLS も owner 限定＝mig0002・非 owner は 0行。ここは表示ナビ）
          ...(role === "owner" ? [{ href: "/audit", label: "監査" }] : []),
        ] },
      ].filter((g) => g.items.length > 0); // 権限で空になった群は見出しごと出さない
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
        {/* 段N: SP（≤899）はボトムタブ4本（ホーム/レジ/シフト/キャスト）＋「その他」シート。
            900+ は群見出しつきサイドバー。cast は項目が レジ 1本のみ＝その他は出ない（従来と同一）。 */}
        <TabBar groups={groups} spPriority={["/dashboard", "/register", "/shift", "/casts"]} />
      </div>
    </div>
  );
}
