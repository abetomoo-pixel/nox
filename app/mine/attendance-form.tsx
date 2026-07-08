"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

// cast セルフ連絡は遅刻/当欠のみ（RPC 側でも enforce＝attendance_set_self）。
export default function AttendanceForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<"late" | "absent">("late");
  const [eta, setEta] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("attendance_set_self", {
      p_date: date,
      p_status: status,
      p_eta: status === "late" && eta ? eta : null,
      p_reason: reason || null,
    });
    setMsg(error ? "送信に失敗しました（時刻は 00:00〜47:59 の HH:MM）" : "連絡を送信しました");
    setBusy(false);
    router.refresh();
  }

  const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
      <select value={status} onChange={(e) => setStatus(e.target.value as "late" | "absent")} style={input}>
        <option value="late">遅刻</option>
        <option value="absent">当欠</option>
      </select>
      {status === "late" && (
        <input
          placeholder="出勤見込み（例 25:30）"
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          style={{ ...input, width: 150 }}
        />
      )}
      <input
        placeholder="理由（任意）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...input, width: 160 }}
      />
      <button type="submit" disabled={busy} style={{ ...t.btnGold, padding: "8px 16px", opacity: busy ? 0.7 : 1 }}>
        送信
      </button>
      {msg && <span style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</span>}
    </form>
  );
}
