"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";

// #32 出勤インセンティブの発行/取消（manager+）。読みはパターン3（RLS 可視）、書きは RPC 経由の route。
type Incentive = { id: string; biz_date: string; amount_mode: string; amount: number; status: string };

const card: React.CSSProperties = { border: "1px solid #ebebeb", borderRadius: 8, padding: 14, background: "#fff", marginBottom: 14 };
const input: React.CSSProperties = { padding: 6, border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 };
const btnDark: React.CSSProperties = { padding: "6px 14px", borderRadius: 6, border: "none", background: "#16161a", color: "#fff", cursor: "pointer", fontSize: 13 };
const btnLight: React.CSSProperties = { padding: "4px 10px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", cursor: "pointer", fontSize: 12 };

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
    <section style={card}>
      <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>出勤ボーナス（当日出勤者に給与へ加算・manager 以上）</h2>
      {msg && <p style={{ fontSize: 13, color: "#404040" }}>{msg}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
        <select value={mode} onChange={(e) => setMode(e.target.value as "per_head" | "pooled")} style={input}>
          <option value="per_head">定額/人（各受給者に同額）</option>
          <option value="pooled">プール按分（総額を受給者数で分配）</option>
        </select>
        <input type="number" value={amount} min={0} onChange={(e) => setAmount(Number.parseInt(e.target.value || "0", 10))} style={{ ...input, width: 100 }} />
        <span style={{ fontSize: 12, color: "#8f8f8f" }}>円</span>
        <button style={btnDark} onClick={publish}>発行</button>
      </div>
      <p style={{ fontSize: 12, color: "#8f8f8f", margin: "4px 0" }}>
        受給者＝当日の確定シフトに出勤した cast（遅刻含む・当欠除外）。確定額は給与確定時に算出。
      </p>
      {rows.length === 0 && <p style={{ fontSize: 13, color: "#8f8f8f" }}>発行済みなし</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f4f4f5", fontSize: 13 }}>
          <span style={{ width: 100 }}>{r.biz_date}</span>
          <span style={{ width: 110 }}>{modeLabel(r.amount_mode)}</span>
          <span>¥{r.amount.toLocaleString()}</span>
          <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => cancel(r.id)}>取消</button>
        </div>
      ))}
    </section>
  );
}
