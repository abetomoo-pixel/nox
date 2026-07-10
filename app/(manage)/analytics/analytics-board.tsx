"use client";

// 分析ボード（F3b-A 塊3）。月セレクタ1つ＋店セレクタ（payroll の期間選択パターン流用）。
// ①売上貢献＝get_cast_sales（日次・group due 按分ベース）をアプリ側で cast 合算→sales 降順。
// ②指名分析＝get_cast_ranking（伝票単位カウント・rank 済み・cast_name 込み）をそのまま表示。
// ★両者は集計軸が別（金額按分 vs 件数カウント）＝hon/jonai/dohan が一致しなくても正常。
//   ラベルで「売上貢献（按分）」「指名件数」を明確に分けて混同させない。
// 期間の同値性: sales は biz_date（cutoff 起点営業日）の月初〜月末・ranking は [月初 cutoff, 翌月初 cutoff)
// ＝同じ窓（biz_date ∈ 月 ⟺ started_at ∈ その窓）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Store = { id: string; name: string };
type Cast = { id: string; name: string };
type SalesRow = { cast_id: string; biz_date: string; sales: number; hon: number; jonai: number; dohan: number };
type RankRow = {
  rank: number; cast_id: string; cast_name: string;
  hon_count: number; jonai_count: number; dohan_count: number; is_self: boolean;
};

const yen = (n: number) => "¥" + n.toLocaleString();
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };

function lastDayOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

export default function AnalyticsBoard({
  stores, casts,
}: {
  stores: Store[]; casts: Cast[];
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const castName = useMemo(() => {
    const m = new Map(casts.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [casts]);

  const load = useCallback(async () => {
    if (!storeId || !/^\d{4}-\d{2}$/.test(period)) return;
    const supabase = createClient();
    setErr(null);
    const [rS, rR] = await Promise.all([
      supabase.rpc("get_cast_sales", { p_store_id: storeId, p_from: `${period}-01`, p_to: lastDayOf(period) }),
      supabase.rpc("get_cast_ranking", { p_store_id: storeId, p_period: period }),
    ]);
    if (rS.error || rR.error) {
      setErr(`読み込みに失敗: ${rS.error?.message ?? rR.error?.message}`);
      setSales([]); setRanking([]);
      return;
    }
    setSales((rS.data ?? []) as SalesRow[]);
    setRanking((rR.data ?? []) as RankRow[]);
  }, [storeId, period]);

  useEffect(() => { void load(); }, [load]);

  // 売上貢献: 日次を cast 単位に月次合算 → sales 降順（同額は名前昇順で決定的に）
  const salesRanking = useMemo(() => {
    const m = new Map<string, { sales: number; hon: number; jonai: number; dohan: number }>();
    for (const r of sales) {
      const a = m.get(r.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0 };
      a.sales += r.sales; a.hon += r.hon; a.jonai += r.jonai; a.dohan += r.dohan;
      m.set(r.cast_id, a);
    }
    return [...m.entries()]
      .map(([castId, a]) => ({ castId, name: castName(castId), ...a }))
      .sort((x, y) => y.sales - x.sales || x.name.localeCompare(y.name));
  }, [sales, castName]);

  const thNum: React.CSSProperties = { ...t.th, textAlign: "right" };
  const tdNum: React.CSSProperties = { ...t.td, textAlign: "right", fontFamily: t.font.num };

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>分析</h1>
        <p style={t.pheadP}>売上貢献と指名のキャスト別集計</p>
      </div>

      <section className="nox-cardtop" style={{ ...t.card, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        {stores.length > 1 && (
          <label style={t.fieldLabel}>
            店舗
            <br />
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...t.input, width: "auto", marginTop: 5 }}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label style={t.fieldLabel}>
          対象月（YYYY-MM）
          <br />
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...t.input, width: "auto", marginTop: 5 }} />
        </label>
      </section>

      {err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{err}</p>}

      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>売上貢献ランキング（{period}・按分ベース）</h2>
        {salesRanking.length === 0 && <p style={noneP}>該当なし（対象月に帰属売上のある伝票がありません）</p>}
        {salesRanking.length > 0 && (
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={t.th}>順位</th>
                <th style={t.th}>名前</th>
                <th style={thNum}>月間売上</th>
                <th style={thNum}>本</th>
                <th style={thNum}>場内</th>
                <th style={thNum}>同伴</th>
              </tr>
            </thead>
            <tbody>
              {salesRanking.map((r, i) => (
                <tr key={r.castId}>
                  <td style={{ ...t.td, fontFamily: t.font.num }}>{i + 1}</td>
                  <td style={t.td}>{r.name}</td>
                  <td style={{ ...tdNum, color: "var(--champ)", fontWeight: 700 }}>{yen(r.sales)}</td>
                  <td style={tdNum}>{r.hon}</td>
                  <td style={tdNum}>{r.jonai}</td>
                  <td style={tdNum}>{r.dohan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          ※卓合計（サ料込・丸め後）を在席指名の重みで按分した金額ベース。件数列は当該 cast が指名に載った伝票数。
        </p>
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>指名件数ランキング（{period}）</h2>
        {ranking.length === 0 && <p style={noneP}>該当なし（アクティブなキャストがいません）</p>}
        {ranking.length > 0 && (
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
              {ranking.map((r) => (
                <tr key={r.cast_id}>
                  <td style={{ ...t.td, fontFamily: t.font.num }}>{r.rank}</td>
                  <td style={t.td}>{r.cast_name}</td>
                  <td style={tdNum}>{r.hon_count}</td>
                  <td style={tdNum}>{r.jonai_count}</td>
                  <td style={tdNum}>{r.dohan_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          ※伝票単位の指名回数（金額とは別軸＝売上貢献の件数と一致しないことがあります）。
        </p>
      </section>
    </div>
  );
}
