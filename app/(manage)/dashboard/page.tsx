import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import DashboardBoard from "./dashboard-board";
import { registerVisibilityServerOf } from "@/lib/nox/register/register-visibility-server"; // ★M-158／M-159
import { deniedNoteOf } from "@/lib/nox/nav/denied"; // ★M-169
import PinSelfCard from "@/components/nox/pin-self-card"; // ★0201（M-133）
import Link from "next/link";
import { myStaffScheduleOf } from "@/lib/nox/staff/my-shift-server"; // ★M-160
import { mig0201On } from "@/lib/nox/rules-0175/flag";

export const dynamic = "force-dynamic";

// ホーム（E5・裁定8 N1-a）。モック dashboard の翻訳＝KPI/承認待ち/本日の出勤キャスト/ランキング。
// 全カード既存 RPC・既存 RLS の読取のみ（DB 非改変）。staff は RLS/RPC ゲートの範囲で見える分だけ
// 表示される（fail-closed＝0行なら空・drink-claim-queue は 0件で自動非表示）。
// IP 管理カード（モック dashboard 先頭）は E3+E2（N1-d）で追加＝ここでは作らない。
// cast は (manage) layout が /mine へ戻すが、直 render 防止に page でも弾く（防御は二重・真の防御は RLS）。
export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ denied?: string }> }) {
  const deniedNote = deniedNoteOf((await searchParams)?.denied); // ★M-169: 見られない画面を直接開いた＝理由を 1 行
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
  // ★裁定306-16: アイコンはメニューシートと同じ線画（NavIcon＝href キー）に統一＝文字記号の icon は撤去
  // ★M-158／M-159（2026-11-11・裁定472）: レジはナビと同じ 1 つの関数で出し分け（出勤していないスタッフには出さず、許可されていれば案内の 1 行）
  const regVis = await registerVisibilityServerOf(supabase, role);
  const shortcuts: { href: string; label: string }[] = [
    ...(regVis.show ? [{ href: "/register", label: "レジ" }] : []),
    { href: "/shift", label: "シフト" },
    { href: "/report", label: "日報" },
    { href: "/notices", label: "お知らせ" },
    ...(isManagerUp || staffCrm ? [{ href: "/customers", label: "顧客" }] : []),
    ...(isManagerUp
      ? [
          { href: "/analytics", label: "分析" },
          { href: "/payroll", label: "給与" },
          { href: "/casts", label: "キャスト" },
          { href: "/master", label: "マスタ" },
        ]
      : []),
  ];

  // ★M-160（2026-11-11）: スタッフ・店長のホームに「自分のシフト」（今日と今後の確定・自分の分だけの一覧へ）＝シフトの権限が無いスタッフにも出す
  const my = role === "staff" || role === "manager" ? await myStaffScheduleOf(supabase, cutoffOf(store)) : null;
  const myNext = my ? [...my.tabs[0].fixed, ...my.tabs[1].fixed].slice(0, 5) : [];
  return (
    <>
    {my && (
      <section className="nox-panel" data-my-shift-card={String(myNext.length)} style={{ marginBottom: 14 }}>
        <h3>自分のシフト<Link href="/shift/mine" className="nox-link" style={{ marginLeft: "auto", fontSize: 12 }}>一覧を見る</Link></h3>
        {myNext.length === 0 ? <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>確定したシフトはまだありません</p> : (
          <ul className="nox-schedlist">{myNext.map((x) => (
            <li key={x.id} className="nox-schedrow" data-sched="fixed"><span className="num d">{Number(x.date.slice(5, 7))}/{Number(x.date.slice(8, 10))}（{x.dow}）{x.date === my.today ? "・今日" : ""}</span><span className="num tm">{x.time}</span><span className="nox-stpill ok" style={{ fontSize: 10.5 }}>確定</span></li>
          ))}</ul>
        )}
      </section>
    )}
    <DashboardBoard
      storeId={store?.id ?? ""}
      storeName={store?.name ?? ""}
      cutoff={cutoffOf(store)}
      stores={((stores ?? []) as { id: string; name: string; settings_json: unknown }[]).map((s) => ({ id: s.id, name: s.name, cutoff: cutoffOf(s) }))}
      isOwner={role === "owner"}
      isManagerUp={isManagerUp} // ★N4-3
      casts={(casts ?? []) as { id: string; name: string; photo_updated_at: string | null; store_id: string }[]}
      shortcuts={shortcuts}
      registerNote={regVis.note}
      deniedNote={deniedNote}
    />
    {mig0201On() && (role === "staff" || role === "manager") && <section style={{ marginTop: 14 }}><PinSelfCard kind="staff" /></section>}{/* ★0201（M-133）: 本人の PIN 変更（店長・スタッフ＝staff_pin） */}
    </>
  );
}
