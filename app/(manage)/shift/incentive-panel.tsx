"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";

// #32 出勤インセンティブの発行/取消（manager+）。読みはパターン3（RLS 可視）、書きは RPC 経由の route。
// E8-4（mig0095）: reason（≤200字・任意）と対象キャスト（null=全員/uuid[]=選択）を追加。
//   受給者は「当日出勤者 ∩ 対象」＝出勤していない対象者は受給しない（確定額は給与確定時にサーバ算出）。
type Incentive = {
  id: string; biz_date: string; amount_mode: string; amount: number; status: string;
  reason: string | null; target_cast_ids: string[] | null;
};
type Cast = { id: string; name: string };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
const btnDark: React.CSSProperties = { ...t.btnGold, padding: "8px 16px" };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

export default function IncentivePanel({ storeId, casts }: { storeId: string; casts: Cast[] }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [rows, setRows] = useState<Incentive[]>([]);
  const [date, setDate] = useState(bizToday);
  const [mode, setMode] = useState<"per_head" | "pooled">("per_head");
  const [amount, setAmount] = useState(3000);
  // E8-4: 理由（任意）と対象（全員/選択）。picked は選択モードのときだけ送る。
  const [reason, setReason] = useState("");
  const [targetAll, setTargetAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_incentives")
      .select("id, biz_date, amount_mode, amount, status, reason, target_cast_ids")
      .eq("status", "published")
      .order("biz_date", { ascending: false })
      .limit(30);
    setRows((data ?? []) as Incentive[]);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function publish() {
    setMsg(null);
    if (!targetAll && picked.size === 0) {
      setMsg("対象キャストを1名以上選択してください（全員に発行する場合は「全員」を選択）");
      return;
    }
    const res = await fetch("/api/incentive/publish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeId, bizDate: date, amountMode: mode, amount,
        reason: reason.trim() === "" ? null : reason.trim(),
        targetCastIds: targetAll ? null : Array.from(picked),
      }),
    });
    const j = await res.json();
    setMsg(res.ok ? "発行しました" : `エラー(${res.status}): ${j.error ?? ""}`);
    if (res.ok) {
      setReason("");
      setTargetAll(true);
      setPicked(new Set());
      await load();
    }
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
  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";

  return (
    <section className="nox-cardtop" style={card}>
      <h2 style={secTitle}>出勤ボーナス（当日出勤者に給与へ加算・manager 以上）</h2>
      <Toast msg={msg} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
        <select value={mode} onChange={(e) => setMode(e.target.value as "per_head" | "pooled")} style={input}>
          <option value="per_head">定額/人（各受給者に同額）</option>
          <option value="pooled">プール按分（総額を受給者数で分配）</option>
        </select>
        <input type="number" value={amount} min={0} onChange={(e) => setAmount(Number.parseInt(e.target.value || "0", 10))} style={{ ...input, width: 100 }} />
        <span style={{ fontSize: 12, color: "var(--sub)" }}>円</span>
        <button style={btnDark} onClick={publish}>発行</button>
      </div>
      {/* E8-4: 理由（任意・200字まで＝RPC 'bad reason' と同じ上限） */}
      <div style={{ marginBottom: 8 }}>
        <input
          value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
          placeholder="理由（任意・200字まで。例: 週末増員 / イベント協力）"
          style={{ ...input, width: "100%", maxWidth: 420 }}
        />
      </div>
      {/* E8-4: 対象＝全員（null）/ 選択（uuid[]）。選択時はキャストのチェックチップ。 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "var(--sub)" }}>対象</span>
        <button style={targetAll ? btnDark : btnLight} onClick={() => setTargetAll(true)}>全員</button>
        <button style={!targetAll ? btnDark : btnLight} onClick={() => setTargetAll(false)}>
          選択{!targetAll && picked.size > 0 ? `（${picked.size}名）` : ""}
        </button>
      </div>
      {!targetAll && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {casts.map((c) => {
            const on = picked.has(c.id);
            return (
              <button key={c.id} onClick={() => togglePick(c.id)}
                style={on ? { ...btnDark, padding: "4px 10px" } : { ...btnLight, padding: "4px 10px" }}>
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0" }}>
        受給者＝当日の確定シフトに出勤した cast（遅刻含む・当欠除外）。対象を選択した場合は
        「出勤者のうち選択したキャストのみ」に配分されます（出勤していない対象者は受給しません）。
        確定額は給与確定時に算出。
      </p>
      {rows.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>発行済みなし</p>}
      {rows.map((r) => (
        <div key={r.id} className="nox-listrow" style={{ fontSize: 13, flexWrap: "wrap" }}>
          <span style={{ ...t.num, width: 100 }}>{r.biz_date}</span>
          <span style={{ width: 110 }}>{modeLabel(r.amount_mode)}</span>
          <span style={t.num}>¥{r.amount.toLocaleString()}</span>
          {/* E8-4: 対象と理由の併記（target null=全員・title に選択キャスト名） */}
          <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}
            title={r.target_cast_ids ? r.target_cast_ids.map(castName).join("、") : undefined}>
            {r.target_cast_ids ? `対象${r.target_cast_ids.length}名` : "全員"}
          </span>
          {r.reason && (
            <span style={{ fontSize: 11.5, color: "var(--v2-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>
              {r.reason}
            </span>
          )}
          <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => cancel(r.id)}>取消</button>
        </div>
      ))}
    </section>
  );
}
