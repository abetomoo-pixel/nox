import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import DashboardBoard from "./dashboard-board";

export const dynamic = "force-dynamic";

// ホーム（E5・裁定8 N1-a）。モック dashboard の翻訳＝KPI/承認待ち/本日の出勤キャスト/ランキング。
// 全カード既存 RPC・既存 RLS の読取のみ（DB 非改変）。staff は RLS/RPC ゲートの範囲で見える分だけ
// 表示される（fail-closed＝0行なら空・drink-claim-queue は 0件で自動非表示）。
// IP 管理カード（モック dashboard 先頭）は E3+E2（N1-d）で追加＝ここでは作らない。
// cast は (manage) layout が /mine へ戻すが、直 render 防止に page でも弾く（防御は二重・真の防御は RLS）。
export default async function DashboardPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const supabase = await createClient();
  // ★裁定192（B1・M6）: owner 閲覧切替＝limit(1) を外し RLS が返す全店（owner=org 全店／manager=自店 1 件）を渡す。
  //   切替は board 側の既存 state（storeId）で行い、F4 マルチ店舗切替（memberships 部分 unique）とは別層＝台帳に二層で記録。
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").order("name");
  const store = stores?.[0];
  const cutoffOf = (s: { settings_json: unknown } | undefined) => {
    const st = (s?.settings_json ?? {}) as Record<string, unknown>;
    return typeof st.biz_cutoff_hm === "string" && st.biz_cutoff_hm ? (st.biz_cutoff_hm as string) : "06:00";
  };
  // 段P/H2: photo_updated_at＝出勤チップ・ランキングのアバターを写真にする（null=写真なし＝頭文字）。
  //   ★裁定192: store_id を足して board 側で選択店に絞る（取得範囲＝RLS のまま）。
  const { data: casts } = await supabase
    .from("casts").select("id, name, photo_updated_at, store_id").eq("is_active", true).order("name");

  // 段H: home コマンドセンター化のショートカット（クイックアクション）＝既存ルートへの純ナビ。
  // role gate は (manage)/layout の nav と同一（逐語据置ラベル・ホーム/スタッフ/監査は除外）。
  // 顧客の staff∧can_crm 判定は nav と同型の既存 RPC 再利用（新規 RPC/集計なし＝表示ゲートのみ）。
  const isManagerUp = role === "owner" || role === "manager";
  let staffCrm = false;
  if (role === "staff") {
    const { data } = await supabase.rpc("auth_staff_can_crm");
    staffCrm = data === true;
  }
  // 段H2: アイコンはモック .qi の Unicode 字形を逐語（アイコンライブラリは導入しない＝裁定3・段N と同じ）。
  //   ★href/label/role ゲートは段H から1文字も変えない＝増えたのは icon だけ。
  const shortcuts: { href: string; label: string; icon: string }[] = [
    { href: "/register", label: "レジ", icon: "◻" },
    { href: "/shift", label: "シフト", icon: "☾" },
    { href: "/report", label: "日報", icon: "▤" },
    { href: "/notices", label: "お知らせ", icon: "◌" },
    ...(isManagerUp || staffCrm ? [{ href: "/customers", label: "顧客", icon: "◉" }] : []),
    ...(isManagerUp
      ? [
          { href: "/analytics", label: "分析", icon: "▲" },
          { href: "/payroll", label: "給与", icon: "¥" },
          { href: "/casts", label: "キャスト", icon: "♦" },
          { href: "/master", label: "マスタ", icon: "✦" },
        ]
      : []),
  ];

  return (
    <DashboardBoard
      storeId={store?.id ?? ""}
      storeName={store?.name ?? ""}
      cutoff={cutoffOf(store)}
      stores={((stores ?? []) as { id: string; name: string; settings_json: unknown }[]).map((s) => ({ id: s.id, name: s.name, cutoff: cutoffOf(s) }))}
      isOwner={role === "owner"}
      casts={(casts ?? []) as { id: string; name: string; photo_updated_at: string | null; store_id: string }[]}
      shortcuts={shortcuts}
    />
  );
}
