"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function WishForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("26:00");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("shift_wish_submit", {
      p_date: date,
      p_start_hm: start,
      p_end_hm: end,
    });
    setMsg(error ? "提出に失敗しました（開始 00:00〜23:59・終了 00:00〜47:59）" : "希望を提出しました");
    setBusy(false);
    router.refresh();
  }

  const input: React.CSSProperties = { padding: 6, border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
      <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="開始 20:00" required style={{ ...input, width: 90 }} />
      <span style={{ fontSize: 13 }}>〜</span>
      <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="終了 26:00" required style={{ ...input, width: 90 }} />
      <button
        type="submit"
        disabled={busy}
        style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "#16161a", color: "#fff", cursor: "pointer" }}
      >
        提出
      </button>
      {msg && <span style={{ fontSize: 13, color: "#404040" }}>{msg}</span>}
    </form>
  );
}
