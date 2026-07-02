import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";

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

// ランキング（get_cast_ranking＝順位/件数のみ・金額列は RPC が構造的に返さない）。
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

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20 }}>ランキング（{period}）</h1>
      <p style={{ fontSize: 12, color: "#8f8f8f" }}>指名件数によるランキングです。</p>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, background: "#fff" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>順位</th>
            <th style={{ padding: 8 }}>名前</th>
            <th style={{ padding: 8 }}>本指名</th>
            <th style={{ padding: 8 }}>場内</th>
            <th style={{ padding: 8 }}>同伴</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.cast_id}
              style={{
                borderBottom: "1px solid #f4f4f5",
                background: r.is_self ? "#fdede7" : undefined,
                fontWeight: r.is_self ? 700 : 400,
              }}
            >
              <td style={{ padding: 8 }}>{r.rank}</td>
              <td style={{ padding: 8 }}>
                {r.cast_name}
                {r.is_self ? "（自分）" : ""}
              </td>
              <td style={{ padding: 8 }}>{r.hon_count}</td>
              <td style={{ padding: 8 }}>{r.jonai_count}</td>
              <td style={{ padding: 8 }}>{r.dohan_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
