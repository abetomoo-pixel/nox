import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";

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
    .select("id, title, body, pinned, until, created_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const title: React.CSSProperties = t.cardTitle;
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>お知らせ</h1>
        <p style={t.pheadP}>店舗からのお知らせ</p>
      </div>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>お知らせ</h2>
        {(notices ?? []).length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>お知らせはありません。</p>}
        {(notices ?? []).map((n) => {
          const expired = !!n.until && (n.until as string) < bizToday;
          return (
            <div key={n.id as string} style={{ padding: "9px 0", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {n.pinned === true && <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--gold2)" }}>ピン</span>}
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
