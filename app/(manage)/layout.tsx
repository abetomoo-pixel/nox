import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import Link from "next/link";
import { TabBar, type NavGroup } from "@/components/ui/nav";
import { HeaderGear, UserChip } from "@/components/ui/header-chips"; // ★N4（裁定275 追補2）: ヘッダー右＝歯車＋「登録名｜役割」
import { splitNav } from "@/lib/nox/ui/nav-tabs";
import SideNav from "@/components/ui/side-nav";
import BillingBanner from "@/components/ui/billing-banner";
// ★夜間便 N7-2（裁定273-6）: デモ org＝帯＋「初期状態に戻す」・/setup へ飛ばさない・導線（ご契約ほか）を隠す
import DemoBanner from "@/components/ui/demo-banner";
import { DemoProvider } from "@/lib/nox/demo/context";
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
  //   ★裁定269-5／270-1: 同じ読取に settings_json を足し、owner かつ setup_done !== true の店があれば /setup へ（1 条件・/setup 自身は除外）。
  //     manager／staff／cast は対象外。既存店は 0147 の埋め戻しで setup_done=true＝不変。
  const { data: storeRows } = await supabase.from("stores").select("name, settings_json").order("name");
  const storeLabel = (storeRows?.[0]?.name as string | undefined) ?? "店舗";
  // ★N7-2: デモ org の判定＝orgs.is_demo（RLS orgs_select＝自 org 1 行・読取 1 本。0149 ★1 の列）
  const { data: orgRow } = await supabase.from("orgs").select("is_demo").limit(1).maybeSingle();
  const isDemo = orgRow?.is_demo === true;
  if (role === "owner" && !isDemo) { // ★N7-2 ②: デモは setup_done に依らず /setup へ飛ばさない
    const pathname = (await headers()).get("x-pathname") ?? "";
    const needsSetup = (storeRows ?? []).some((r) => ((r.settings_json as Record<string, unknown> | null)?.setup_done) !== true);
    if (needsSetup && !(pathname === "/setup" || pathname.startsWith("/setup/"))) redirect("/setup");
  }

  const isManagerUp = role === "owner" || role === "manager";

  // 課金失効バナー（課金 app 設計書 v1 §6）＝zero-arg ラッパの否定で判定。
  //   ★org_billing の RLS SELECT は owner 限定（mig0087）＝行を読む実装だと owner にしか出ない。
  //     本ラッパは authenticated 全員に grant されており boolean しか返さない＝
  //     全ロールに告知でき、かつ課金情報は漏れない。述語は RPC ゲート94本と同一＝表示と実挙動が食い違わない。
  // ★N4（裁定275 追補2-2）: 「登録名｜役割」＝自分の users 行（RLS users_select＝auth_user_id = auth.uid() の 1 行・読取 1 本）
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: meRow } = await supabase.from("users").select("name, email").eq("auth_user_id", authUser?.id ?? "").maybeSingle();
  const meName = (meRow?.name as string | null) ?? null;
  const meEmail = (meRow?.email as string | null) ?? authUser?.email ?? null;
  const { data: billingWritable } = await supabase.rpc("auth_org_billing_writable");
  const billingLocked = billingWritable === false;
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
          // ★裁定275 追補（2026-09-18・z2）: 在庫は営業群（レジ・日報の下）＝≤899 の「その他」でも先頭側に出る（既存画面 /master/stock・URL 不変・manager 以上）
          ...(isManagerUp ? [{ href: "/master/stock", label: "在庫" }] : []),
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
        // ★裁定275（M12/M13）: 店舗群＝歯車の口（≤899 は歯車 Modal・900+ はサイドバー下部＝並びは従来どおり最後）。項目集合・role 条件は不変。
        { label: "店舗", gear: true, items: [
          ...(isManagerUp ? [{ href: "/master", label: "マスタ" }] : []),
          { href: "/notices", label: "お知らせ" },
          // 監査ログは owner 限定（RLS も owner 限定＝mig0002・非 owner は 0行。ここは表示ナビ）
          ...(role === "owner" ? [{ href: "/audit", label: "監査" }] : []),
          // 課金（設計書 §6）: owner 限定＝org_billing の RLS SELECT も owner 限定・route も requireOwner
          ...(role === "owner" && !isDemo ? [{ href: "/billing", label: "ご契約" }] : []), // ★N7-2 ③: デモは Stripe の導線を隠す
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
            {/* ★裁定275 追補2-2（N4）: ヘッダー左＝ロゴ（ホームへ）＋店舗名。900+ はサイドバーに同じ brand があるため CSS で隠す（同じ情報を 2 箇所に出さない＝仮決め） */}
            <Link href="/dashboard" className="crumb nox-tb-brand" aria-label="ホームへ"><span className="brandmark" aria-hidden="true">N</span><b>NOX</b><small>{storeLabel}</small></Link>
            <div className="acts">
              {/* ★裁定275 追補2-2（N4）: 右＝歯車（マスタ・監査・ご契約＝gear 群・cast／staff は項目 0＝描かない）＋「登録名｜役割」（自分の情報＋ログアウト）。POST /auth/signout は不変 */}
              <HeaderGear groups={splitNav(groups, ["/dashboard", "/register", "/report", "/shift"]).gearGroups} />
              <UserChip name={meName} email={meEmail} roleJa={t.roleLabelJa(role as string)} storeLabel={storeLabel} />
            </div>
          </header>
          <main className="nox-mainarea">
            {isDemo && <DemoBanner />}{/* ★N7-2 ①: デモ環境の帯＋初期状態に戻す */}
            {billingLocked && <BillingBanner isOwner={role === "owner"} />}
            <DemoProvider isDemo={isDemo}>{children}</DemoProvider>
          </main>
        </div>
      </div>
      {/* 段N: SP（≤899）はボトムタブ4本（ホーム/レジ/シフト/キャスト）＋「その他」シート。
          cast は項目が レジ 1本のみ＝その他は出ない（従来と同一）。 */}
      {/* ★裁定275 追補2-1（N4）: 下タブ 5 本＝ホーム／レジ／日報／シフト／メニュー（残り＋お知らせ）。歯車はヘッダー右へ */}
      <TabBar groups={groups} spPriority={["/dashboard", "/register", "/report", "/shift"]} hideSide />
    </div>
  );
}
