"use client";

// ★0214（起票158 の 2・相談役 11/25 の D5）: 勤怠の表の日の編集に「休憩」（店だけ・その日の休憩を全部入れ替える＝break_set・理由は必須・確定後は給与の要対応に積む）。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { createClient } from "@/lib/supabase/client";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { breakEditErrOf, breakEditRowsOf, breakSetRowsOf, type BreakEditRow } from "@/lib/nox/punch/break-edit";

export default function BreakEdit({ castId, bizDate, spans, onSaved }: { castId: string; bizDate: string; spans?: [string, string | null][]; onSaved: (msg: string) => void }) {
  const [rows, setRows] = useState<BreakEditRow[]>(() => breakEditRowsOf(spans));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const e = breakEditErrOf(rows, reason);
    if (e) { setMsg(e); return; }
    setBusy(true);
    const { error } = await createClient().rpc("break_set", { p_cast_id: castId, p_membership_id: null, p_biz_date: bizDate, p_rows: breakSetRowsOf(bizDate, rows), p_reason: reason.trim() });
    setBusy(false);
    if (error) { setMsg(rpcErrJa(error.message)); return; }
    onSaved(rows.length ? `休憩を ${rows.length} 回にしました` : "休憩を消しました");
  }
  return (
    <section className="nox-inset" style={{ padding: "10px 12px", marginTop: 10, display: "grid", gap: 8 }} data-break-edit="1">
      <span style={t.fieldLabel}>休憩（店の直し）</span>
      {rows.length === 0 && <p style={{ ...t.sub, margin: 0 }}>この日の休憩はありません</p>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input className="nox-input" inputMode="numeric" value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} placeholder="22:00" aria-label="休憩の始まり" style={{ width: 90 }} />
          <span>〜</span>
          <input className="nox-input" inputMode="numeric" value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} placeholder="22:30" aria-label="休憩の終わり" style={{ width: 90 }} />
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>消す</button>
        </div>
      ))}
      <div><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setRows([...rows, { start: "", end: "" }])} disabled={rows.length >= 10}>＋ 休憩を足す</button></div>
      <input className="nox-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="直す理由（必須）" aria-label="直す理由" />
      <div className="nox-actions" style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" style={{ ...t.btnGold, minWidth: 140 }} disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "休憩を保存"}</button>
      </div>
      {msg && <Message kind="error">{msg}</Message>}
    </section>
  );
}
