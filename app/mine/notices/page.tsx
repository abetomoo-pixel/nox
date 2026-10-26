import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";
import { NOTICE_NEW_BADGE, unreadIdsOf } from "@/lib/nox/mine/notice-unread";
import { CAST_NOTIF_KIND_LABEL, NOTIF_EMPTY, NOTIF_NEW_BADGE, NOTIF_SECTION_TITLE, noticeVisibleToCastOf, notifWhenOf, type CastNotifKind, type CastNotifRow } from "@/lib/nox/people/notify-text"; // ★便 ON-3（0176 ★5 (d)(e)）: 通知・宛先つきお知らせ // ★裁定326-6（便 M2-3）: 開いたら既読（notice_mark_read）・開いた時点の未読に「新着」

export const dynamic = "force-dynamic";

/** 店設定の営業日切替時刻（stores.settings_json.biz_cutoff_hm・既定 '06:00'）。
 *  ★mig0106（起票#14）: cast の RLS でも自店1行は読める（stores_select の id=auth_store_id() 腕）。
 *    経路は app/(manage)/dashboard/page.tsx と同型。 */
async function loadCutoff(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
  return typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
}

// お知らせ（cast 側・読み取り専用）。RLS が store_id=auth_store_id() かつ audience in ('all','cast') の
// 行のみ返す＝audience/店の絞りは DB 側（client フィルタ不要・staff 宛は物理的に返らない）。
// 期限切れ（until<営業日）は運営側と同じく「期限切れ」バッジのみ（DB は保持・表示側判定＝0034 設計ロック）。
export default async function MineNoticesPage() {
  const supabase = await createClient();
  const bizToday = bizDateOf(new Date().toISOString(), await loadCutoff(supabase));
  const { data: notices } = await supabase
    .from("notices")
    .select("id, title, body, pinned, until, created_at, cast_ids") // ★便 ON-3（0176 ★5 (e)）: 宛先つき（cast_ids）
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  // ★便 ON-3: 宛先つきお知らせ＝本人を含む行だけ（null＝全員）。通知（cast_notifications・RLS 本人）＝開いたら既読（cast_notification_read・冪等）
  const { data: myCastId } = await supabase.rpc("auth_cast_id");
  const visibleNotices = ((notices ?? []) as { id: string; cast_ids?: string[] | null }[]).filter((n) => noticeVisibleToCastOf(n.cast_ids ?? null, (myCastId as string | null) ?? null));
  const { data: notifRows } = await supabase.from("cast_notifications").select("id, kind, body, ref, read_at, created_at").order("created_at", { ascending: false }).limit(50);
  const notifs = (notifRows ?? []) as CastNotifRow[];
  const newNotif = new Set(notifs.filter((n) => n.read_at === null).map((n) => n.id));
  await Promise.all([...newNotif].map((id) => supabase.rpc("cast_notification_read", { p_id: id })));
  // ★326-6: 既読の記録＝未読分だけ notice_mark_read（冪等・RPC 側で自店・audience を再検査・audit は初回だけ）。失敗しても表示は止めない
  const { data: readRows } = await supabase.from("cast_notice_reads").select("notice_id");
  const unreadIds = new Set(unreadIdsOf(visibleNotices.map((n) => n.id), ((readRows ?? []) as { notice_id: string }[]).map((r) => r.notice_id)));
  await Promise.all([...unreadIds].map((id) => supabase.rpc("notice_mark_read", { p_notice_id: id })));

  const title: React.CSSProperties = t.cardTitle;
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>お知らせ</h1>
        <p style={t.pheadP}>店舗からのお知らせ</p>
      </div>

      <section className="nox-cardtop" style={t.card} data-mine-notifs={notifs.length}>{/* ★便 ON-3（0176 ★5 (d)）: あなたへの通知（シフトの追加／取消／変更・確認のお願い・基本の働き方・催促） */}
        <h2 style={title}>{NOTIF_SECTION_TITLE}</h2>
        {notifs.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>{NOTIF_EMPTY}</p>}
        {notifs.map((n) => (
          <div key={n.id} data-mine-notif={n.kind} style={{ padding: "8px 0", borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {newNotif.has(n.id) && <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--champ)" }}>{NOTIF_NEW_BADGE}</span>}
              <span className="nox-stpill" style={{ fontSize: 10.5 }}>{CAST_NOTIF_KIND_LABEL[n.kind as CastNotifKind] ?? n.kind}</span>
              <span style={{ marginLeft: "auto", ...t.num, fontSize: 11.5, color: "var(--sub)" }}>{notifWhenOf(n.created_at)}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink)", margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{n.body}</p>
          </div>
        ))}
      </section>

      <section style={{ ...t.card, marginTop: 12 }}>
        <h2 style={title}>お知らせ</h2>
        {visibleNotices.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>お知らせはありません。</p>}
        {((notices ?? []) as { id: string; title: string; body: string; pinned: boolean | null; until: string | null; created_at: string; cast_ids?: string[] | null }[]).filter((n) => visibleNotices.some((v) => v.id === n.id)).map((n) => {
          const expired = !!n.until && (n.until as string) < bizToday;
          return (
            <div key={n.id as string} style={{ padding: "9px 0", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {n.pinned === true && <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--gold2)" }}>ピン</span>}
                {unreadIds.has(n.id as string) && <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--champ)" }}>{NOTICE_NEW_BADGE}</span>}{/* ★326-6: 開いた時点で未読だったもの */}
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{n.title as string}</span>
                {expired && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--bad)" }}>期限切れ</span>}
                <span style={{ marginLeft: "auto", ...t.num, fontSize: 11.5, color: "var(--sub)" }}>{when(n.created_at as string)}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--sub)", margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{n.body as string}</p>
              {n.until != null && <p style={{ ...t.num, fontSize: 11, color: "var(--sub)", margin: "3px 0 0" }}>掲載期限 {n.until as string}</p>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
