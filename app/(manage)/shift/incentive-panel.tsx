"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";

// #32 出勤インセンティブの発行/取消（manager+）。読みはパターン3（RLS 可視）、書きは RPC 経由の route。
type Incentive = { id: string; biz_date: string; amount_mode: string; amount: number; status: string };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
const btnDark: React.CSSProperties = { ...t.btnGold, padding: "8px 16px" };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };

export default function IncentivePanel({ storeId }: { storeId: string }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [rows, setRows] = useState<Incentive[]>([]);
  const [date, setDate] = useState(bizToday);
  const [mode, setMode] = useState<"per_head" | "pooled">("per_head");
  const [amount, setAmount] = useState(3000);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_incentives")
      .select("id, biz_date, amount_mode, amount, status")
      .eq("status", "published")
      .order("biz_date", { ascending: false })
      .limit(30);
    setRows((data ?? []) as Incentive[]);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function publish() {
    setMsg(null);
    const res = await fetch("/api/incentive/publish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, bizDate: date, amountMode: mode, amount }),
    });
    const j = await res.json();
    setMsg(res.ok ? "発行しました" : `エラー(${res.status}): ${j.error ?? ""}`);
    if (res.ok) await load();
  }

  async function cancel(id: string) {
    if (!confirm("この出勤ボーナスを取り消しますか？")) return;
    setMsg(null);
    const res = await fetch("/api/incentive/cancel", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ incentiveId: id }),
    });
    const j = await res.json();
    setMsg(res.ok ? "取り消しました" : `エラー(${res.status}): ${j.error ?? ""}`);
    if (res.ok) await load();
  }

  const modeLabel = (m: string) => (m === "per_head" ? "定額/人" : "プール按分");

  return (
    <section className="nox-cardtop" style={card}>
      <h2 style={secTitle}>出勤ボーナス（当日出勤者に給与へ加算・manager 以上）</h2>
      {msg && <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
        <select value={mode} onChange={(e) => setMode(e.target.value as "per_head" | "pooled")} style={input}>
          <option value="per_head">定額/人（各受給者に同額）</option>
          <option value="pooled">プール按分（総額を受給者数で分配）</option>
        </select>
        <input type="number" value={amount} min={0} onChange={(e) => setAmount(Number.parseInt(e.target.value || "0", 10))} style={{ ...input, width: 100 }} />
        <span style={{ fontSize: 12, color: "var(--sub)" }}>円</span>
        <button style={btnDark} onClick={publish}>発行</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0" }}>
        受給者＝当日の確定シフトに出勤した cast（遅刻含む・当欠除外）。確定額は給与確定時に算出。
      </p>
      {rows.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>発行済みなし</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <span style={{ ...t.num, width: 100 }}>{r.biz_date}</span>
          <span style={{ width: 110 }}>{modeLabel(r.amount_mode)}</span>
          <span style={t.num}>¥{r.amount.toLocaleString()}</span>
          <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => cancel(r.id)}>取消</button>
        </div>
      ))}
    </section>
  );
}
