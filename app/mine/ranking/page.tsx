import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";

export const dynamic = "force-dynamic";

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
  const period = bizDateOf(new Date().toISOString(), "06:00").slice(0, 7);
  // cast の可視 store は自店のみ（RLS）＝先頭行が自店
  const { data: stores } = await supabase.from("stores").select("id, name").limit(1);
  const store = stores?.[0];
  const { data } = store
    ? await supabase.rpc("get_cast_ranking", { p_store_id: store.id, p_period: period })
    : { data: [] as RankRow[] };
  const rows = (data ?? []) as RankRow[];

  const thNum: React.CSSProperties = { ...t.th, textAlign: "right" };
  const tdNum: React.CSSProperties = { ...t.td, textAlign: "right", fontFamily: t.font.num };

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>ランキング（{period}）</h1>
        <p style={t.pheadP}>指名件数によるランキングです。</p>
      </div>

      <section className="nox-cardtop" style={t.card}>
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
                <tr key={r.cast_id} style={{ background: r.is_self ? "#1B1710" : undefined }}>
                  <td style={{ ...t.td, fontFamily: t.font.num, color: selfColor, fontWeight: r.is_self ? 800 : 400 }}>{r.rank}</td>
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
      </section>
    </div>
  );
}
