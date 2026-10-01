import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { TabBar, type NavGroup } from "@/components/ui/nav";
import * as t from "@/lib/nox/ui/theme";
import { createClient } from "@/lib/supabase/server";
// ★夜間便 N7-2（裁定273-6）: cast のマイページにもデモの帯を出し、写真アップロードの導線を隠す
import DemoBanner from "@/components/ui/demo-banner";
import { DemoProvider } from "@/lib/nox/demo/context";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定326-8（便 M1-3）: ranking OFF の店はナビ項目を出さない
import { noticeNavLabelOf, unreadCountOf } from "@/lib/nox/mine/notice-unread"; // ★裁定326-6（便 M2-3）: お知らせ未読数「お知らせ（N）」
import { wishNavLabelOf } from "@/lib/nox/mine/wish-mode"; // ★裁定326-7（便 M4-1）: 「シフト希望」／'off_only' は「休み希望」

// cast エリアの layout。auth_role() rpc は「ここで1回/リクエスト」のみ（F1f plan §2）。
// リダイレクトは利便のため・真の防御は RLS/RPC（cast 以外がすり抜けても DB は cast データを返さない…の逆も同様）。
export default async function MineLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "cast") redirect("/register");
  const supabase = await createClient();
  const { data: orgRow } = await supabase.from("orgs").select("is_demo").limit(1).maybeSingle(); // ★N7-2
  const isDemo = orgRow?.is_demo === true;
  // ★326-8: 自店の settings_json（cast の RLS で自店 1 行が読める＝mig0106）→ mine_settings。ranking OFF ならナビからランキングを外す（ページ側は /mine へ redirect）
  const { data: storeRow } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const ms = mineSettingsOf(storeRow?.settings_json);
  // ★326-6（便 M2-3）: 未読＝可視のお知らせ（RLS＝自店・audience all|cast）− 自分の既読（cast_notice_reads・RLS 本人）。0 は文言だけ
  const [{ data: noticeRows }, { data: readRows }] = await Promise.all([
    supabase.from("notices").select("id"),
    supabase.from("cast_notice_reads").select("notice_id"),
  ]);
  const unread = unreadCountOf(((noticeRows ?? []) as { id: string }[]).map((r) => r.id), ((readRows ?? []) as { notice_id: string }[]).map((r) => r.notice_id));
  // 段N: TabBar が群構造になったため1群（見出しなし）で渡す＝/mine の並び・挙動は完全に不変。
  //   spPriority は渡さない＝4項目をそのままボトムタブに並べる（従来どおり）。
  const groups: NavGroup[] = [{
    label: null,
    items: [
      { href: "/mine", label: "マイ" },
      { href: "/mine/wishes", label: wishNavLabelOf(ms.shift_request_mode) },
      { href: "/mine/ranking", label: "ランキング" },
      { href: "/mine/notices", label: noticeNavLabelOf(unread) },
    ].filter((i) => i.href !== "/mine/ranking" || ms.ranking),
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
        <main className="nox-main">
          {isDemo && <DemoBanner />}{/* ★N7-2 ① */}
          <DemoProvider isDemo={isDemo}>{children}</DemoProvider>
        </main>
        <TabBar groups={groups} />
      </div>
    </div>
  );
}
