"use client";

// 顧客一覧ボード（F3b-A 塊1）。一覧＝customer_list_summary RPC（可視スコープ・churn 判定とも RPC 内確定＝
// アプリ側で再判定しない）。絞り込み（churn/検索）はクライアント側・店絞りは owner のみ p_store_id 再取得。
// 行タップ＝顧客詳細（塊2）への遷移構造。書込ボタンなし（登録/編集/担当割当は塊2）。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Store = { id: string; name: string };
type Cast = { id: string; name: string };
type Row = {
  customer_id: string; name: string; furigana: string | null; cast_id: string | null;
  is_active: boolean; visits: number; last_visit: string | null; total_spend: number;
  active_bottles: number; open_receivable: number; days_since: number | null;
  churn_tier: "none" | "mid" | "high";
};
type Tier = "all" | "high" | "mid";

const yen = (n: number) => "¥" + n.toLocaleString();
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
const input: React.CSSProperties = { ...t.input, padding: "8px 10px", fontSize: 13 };
const segBtn = (on: boolean): React.CSSProperties => ({
  ...t.btnGhost, ...t.btnSm,
  ...(on ? { background: "linear-gradient(135deg,var(--gold2),#B8893A)", color: "#0B0B0F", border: 0, fontWeight: 800 } : {}),
});
// churn pill: high=赤 / mid=黄（gold2）/ none=pill なし（無印）
const churnPill = (tier: "mid" | "high"): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
  color: tier === "high" ? "var(--bad)" : "var(--gold2)",
  background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
});

function fmtLastVisit(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

export default function CustomersBoard({
  isOwner, stores, casts,
}: {
  isOwner: boolean; stores: Store[]; casts: Cast[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [storeSel, setStoreSel] = useState(""); // owner のみ・'' = 全店（p_store_id null）
  const [tier, setTier] = useState<Tier>("all");
  const [q, setQ] = useState("");

  const castName = useMemo(() => {
    const m = new Map(casts.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "フリー");
  }, [casts]);

  const load = useCallback(async () => {
    const supabase = createClient();
    setErr(null);
    const { data, error } = await supabase.rpc("customer_list_summary", { p_store_id: storeSel || null });
    if (error) { setErr(`読み込みに失敗: ${error.message}`); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }, [storeSel]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim();
    return rows.filter((r) =>
      (tier === "all" || r.churn_tier === tier) &&
      (needle === "" || r.name.includes(needle) || (r.furigana ?? "").includes(needle)),
    );
  }, [rows, tier, q]);

  const highCount = rows.filter((r) => r.churn_tier === "high").length;
  const midCount = rows.filter((r) => r.churn_tier === "mid").length;

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>顧客</h1>
        <p style={t.pheadP}>来店状況と離反リスク（60日/30日）</p>
      </div>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>顧客一覧</h2>

        {isOwner && stores.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, width: "100%" }}>
              <option value="">全店</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
          <button style={segBtn(tier === "all")} onClick={() => setTier("all")}>全て</button>
          <button style={segBtn(tier === "high")} onClick={() => setTier("high")}>離反リスク高（{highCount}）</button>
          <button style={segBtn(tier === "mid")} onClick={() => setTier("mid")}>中（{midCount}）</button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前・ふりがなで検索"
          style={{ ...input, width: "100%", marginBottom: 4 }}
        />

        {err && <p style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 700 }}>{err}</p>}
        {!err && filtered.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>該当する顧客がいません</p>}

        {filtered.map((r) => (
          <Link
            key={r.customer_id}
            href={`/customers/${r.customer_id}`}
            style={{ display: "block", textDecoration: "none", color: "inherit", padding: "9px 0", borderBottom: "1px solid var(--line)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</span>
              {r.furigana && <span style={{ fontSize: 11, color: "var(--sub)" }}>{r.furigana}</span>}
              <span style={{ marginLeft: "auto" }}>
                {r.churn_tier === "high" && <span style={churnPill("high")}>離反リスク高</span>}
                {r.churn_tier === "mid" && <span style={churnPill("mid")}>離反リスク中</span>}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3 }}>
              担当 {castName(r.cast_id)}・来店 <span style={t.num}>{r.visits}</span>回・
              {r.last_visit
                ? (r.churn_tier === "none"
                    ? <>最終 {fmtLastVisit(r.last_visit)}（<span style={t.num}>{r.days_since}</span>日前）</>
                    : <><span style={{ ...t.num, color: r.churn_tier === "high" ? "var(--bad)" : "var(--gold2)" }}>{r.days_since}</span>日未再来</>)
                : "来店なし"}
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 12.5, marginTop: 3, flexWrap: "wrap" }}>
              <span style={{ ...t.num, color: "var(--champ)", fontWeight: 700 }}>{yen(r.total_spend)}</span>
              {r.active_bottles > 0 && <span style={{ color: "var(--sub)" }}>ボトル <span style={t.num}>{r.active_bottles}</span></span>}
              {r.open_receivable > 0 && <span style={{ color: "var(--bad)" }}>売掛 <span style={t.num}>{yen(r.open_receivable)}</span></span>}
            </div>
          </Link>
        ))}

        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
          {filtered.length}件{tier !== "all" || q ? `（全${rows.length}件）` : ""}・休眠中の顧客は表示されません
        </p>
      </section>
    </div>
  );
}
