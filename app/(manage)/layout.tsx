import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { TabBar, type NavGroup } from "@/components/ui/nav";
import SideNav from "@/components/ui/side-nav";
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

  // 段0R その2: トップバーのサブ行に出す店名（aaa の .brand span）。既存 stores の RLS 読取1本。
  const { data: storeRows } = await supabase.from("stores").select("name").order("name").limit(1);
  const storeLabel = (storeRows?.[0]?.name as string | undefined) ?? "店舗";

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
          // 文言統一（Agoora 裁定確定）: 旧称を廃し「キャスト」表記に統一
          ...(isManagerUp ? [{ href: "/casts", label: "キャスト" }, { href: "/staff", label: "スタッフ" }, { href: "/payroll", label: "給与" }] : []),
        ] },
        { label: "顧客", items: [
          ...(isManagerUp || staffCrm ? [{ href: "/customers", label: "顧客" }] : []),
        ] },
        { label: "分析", items: [
          ...(isManagerUp ? [{ href: "/analytics", label: "分析" }] : []),
          // R2-c（mig0099）: 領収書の発行台帳（RLS select も owner/manager 自店＝表示ナビと二重）
          ...(isManagerUp ? [{ href: "/receipts", label: "領収書" }] : []),
        ] },
        { label: "店舗", items: [
          ...(isManagerUp ? [{ href: "/master", label: "マスタ" }] : []),
          { href: "/notices", label: "お知らせ" },
          // 監査ログは owner 限定（RLS も owner 限定＝mig0002・非 owner は 0行。ここは表示ナビ）
          ...(role === "owner" ? [{ href: "/audit", label: "監査" }] : []),
        ] },
      ].filter((g) => g.items.length > 0); // 権限で空になった群は見出しごと出さない
  return (
    /* ── E2（2026-08-17）: 共通シェルを mock/pages-2026-08 の骨格へ寄せた（presentation-only）──
       モック構造＝`.app{grid:238px minmax(0,1fr)}` の**左列にサイドバー（全高）**、
       **右列に topbar＋content** を積む（＝トップバーはサイドバーの右にだけ架かる）。
       これに合わせて DOM を `.nox-layout > (aside.nox-side | div.nox-mainwrap > header.nox-tb + main.nox-mainarea)`
       へ組み替え、ブランドを**トップバーからサイドバー上部へ移設**・サイドバー脚（.nox-sidefoot）を追加した。
       ★ルート・URL・role ゲート・nav の項目集合・groups の組み立ては1文字も変えていない
         （上の groups 計算・redirect・rpc 呼び出しは E2 で非改変＝差分は殻のみ）。
       ★≤900 は従来どおりサイドバーを CSS で隠し TabBar のボトムタブが出る。
         モックは SP でサイドバーを「アイコン列の上部固定バー」に変えるが、**NOX は既存の
         ボトムタブを維持する**＝ナビの構造そのものを変えないため（E2 の意図的な非追随・ガイド §8 に記録）。 */
    <div className="nox-dark" style={t.appBg}>
      <div className="nox-layout">
        {/* 900+ のサイドバー＝段N の5群をそのまま描く（モックに無い項目は作らない）。
            ★レーン④a-4: 現在地ハイライトとアイコンのため client 部品 SideNav へ切り出した。
              渡す groups は上で組んだものそのまま＝項目集合・順序・role ゲートは非改変。
            ★E2: ブランド（店名）と脚の表示だけを props で渡す＝ナビのロジックには触れない。 */}
        <SideNav groups={groups} storeLabel={storeLabel} />
        <div className="nox-mainwrap">
          <header className="nox-tb">
            {/* モック topbar は「左＝パンくず（営業 / レジ）・右＝管理者チップ（A 管理者 店名）」。
                ★NOX は各ページが自前の見出しを持ち、パンくずに相当するデータを持たないため**左は空**に留める
                  （パンくずを作るとナビの情報を増やすことになり E2 の presentation-only を外れる）。
                ★店名は**サイドバーの brand**（モックと同じ「N / NOX / CLUB NOX」）に置いたので
                  topbar には出さない＝同じ情報を2箇所に出さない。
                右は従来どおりロール表示＋ログアウト＝モックの管理者チップ位置と一致。 */}
            <div className="crumb" aria-hidden="true" />
            <div className="acts">
              <span style={t.rolePill}>{t.roleLabelJa(role as string)}</span>
              <form action="/auth/signout" method="post" style={{ display: "flex" }}>
                <button type="submit" className="nox-btn">ログアウト</button>
              </form>
            </div>
          </header>
          <main className="nox-mainarea">{children}</main>
        </div>
      </div>
      {/* 段N: SP（≤899）はボトムタブ4本（ホーム/レジ/シフト/キャスト）＋「その他」シート。
          cast は項目が レジ 1本のみ＝その他は出ない（従来と同一）。 */}
      <TabBar groups={groups} spPriority={["/dashboard", "/register", "/shift", "/casts"]} hideSide />
    </div>
  );
}
