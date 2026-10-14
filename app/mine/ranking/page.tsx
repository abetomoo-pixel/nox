import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定326-8（便 M1-3）: ranking OFF の店は直 URL も /mine へ
import { castRankingModeOf } from "@/lib/nox/payroll/cast-sales"; // ★裁定346: off／self／top

export const dynamic = "force-dynamic";

/** 店設定の営業日切替時刻（stores.settings_json.biz_cutoff_hm・既定 '06:00'）。
 *  ★mig0106（起票#14）: cast の RLS でも自店1行は読める（stores_select の id=auth_store_id() 腕）。
 *    経路は app/(manage)/dashboard/page.tsx と同型。 */
async function loadCutoff(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
  return typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
}

type RankRow = {
  rank: number;
  cast_id: string;
  cast_name: string;
  hon_count: number;
  jonai_count: number;
  dohan_count: number;
  is_self: boolean;
};

// ランキング（get_cast_ranking＝順位/件数のみ・金額列は RPC が構造的に返さない＝¥ は一切出さない）。
export default async function RankingPage() {
  const supabase = await createClient();
  const period = bizDateOf(new Date().toISOString(), await loadCutoff(supabase)).slice(0, 7);
  // cast の可視 store は自店のみ（RLS）＝先頭行が自店
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").limit(1);
  const store = stores?.[0];
  const ms = mineSettingsOf(store?.settings_json);
  const rankMode = castRankingModeOf(ms); // ★裁定346: off／self／top（既存キー ranking・ranking_show_others から写像）
  if (rankMode === "off") redirect("/mine"); // ★326-8: ranking OFF＝ページを出さない
  const { data } = store
    ? await supabase.rpc("get_cast_ranking", { p_store_id: store.id, p_period: period })
    : { data: [] as RankRow[] };
  const allRows = (data ?? []) as RankRow[];
  // ★裁定346: self＝自分の行だけ（他人は名前も出さない）・top＝全員の名前と件数（金額は RPC が構造的に返さない）
  const rows = rankMode === "self" ? allRows.filter((r) => r.is_self) : allRows;
  // ★裁定346 追補1（0171・便 P171）: 売上軸の自分の順位＝get_cast_sales_rank（cast は自分の 1 行だけ＝他人の金額・順位は返らない・売上は給与と同じ按分）
  const { data: salesRank } = store ? await supabase.rpc("get_cast_sales_rank", { p_store_id: store.id, p_period: period }) : { data: null };
  const mySales = ((salesRank ?? []) as { rank: number; sales: number; is_self: boolean }[]).find((r) => r.is_self) ?? null;

  const thNum: React.CSSProperties = { ...t.th, textAlign: "right" };
  const tdNum: React.CSSProperties = { ...t.td, textAlign: "right", fontFamily: t.font.num };

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>ランキング（{period}）</h1>
        <p style={t.pheadP}>指名件数によるランキングです。{rankMode === "self" ? `（自分の順位のみ・${allRows.length}人中）` : ""}</p>{/* ★裁定346: self は他人の名前を出さない */}
        {mySales && (/* ★裁定346 追補1（0171）: 売上軸の自分の順位（self・top とも自分の行だけ・他人の金額は出ない） */
          <p style={{ fontSize: 13, margin: "6px 0 0" }} data-sales-rank={mySales.rank}>
            売上の順位: <b className="num">{mySales.rank}位</b> / {allRows.length}人中 <span style={{ color: "var(--sub)" }}>（自分の按分売上 ¥{mySales.sales.toLocaleString()}・他の人の額は出ません）</span>
          </p>
        )}
      </div>

      <section className="nox-cardtop" style={t.card}>
        <div className="nox-tablewrap plain">{/* ★M1 第 2 レーン（裁定251・2026-09-18）: 横スクロール容器 */}
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={t.th}>順位</th>
              <th style={t.th}>名前</th>
              <th style={thNum}>本指名</th>
              <th style={thNum}>場内</th>
              <th style={thNum}>同伴</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const selfColor = r.is_self ? "var(--champ)" : "var(--ink)";
              return (
                <tr key={r.cast_id} style={{ background: r.is_self ? "var(--goldface2)" : undefined }}>
                  {/* 段F: 順位メダル（top3=金銀銅・既存 rank のみ・新情報なし。自分行は行背景＋名前で強調） */}
                  <td style={t.td}><span className={`nox-medal ${r.rank === 1 ? "g1" : r.rank === 2 ? "g2" : r.rank === 3 ? "g3" : "gx"}`}>{r.rank}</span></td>
                  <td style={{ ...t.td, color: selfColor, fontWeight: r.is_self ? 700 : 400 }}>
                    {r.cast_name}
                    {r.is_self ? "（自分）" : ""}
                  </td>
                  <td style={tdNum}>{r.hon_count}</td>
                  <td style={tdNum}>{r.jonai_count}</td>
                  <td style={tdNum}>{r.dohan_count}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td style={{ ...t.td, color: "var(--sub)" }} colSpan={5}>データなし</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
