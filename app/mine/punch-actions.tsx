"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PunchActions() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function punch(type: "in" | "out") {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("punch_self", { p_type: type, p_lat: null, p_lng: null });
    setMsg(error ? "打刻に失敗しました" : type === "in" ? "出勤を打刻しました" : "退勤を打刻しました");
    setBusy(false);
    router.refresh();
  }

  const btn: React.CSSProperties = {
    padding: "10px 24px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 14,
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <button style={{ ...btn, background: "#16161a", color: "#fff" }} disabled={busy} onClick={() => punch("in")}>
          出勤
        </button>
        <button style={{ ...btn, background: "#fff", border: "1px solid #e0e0e0" }} disabled={busy} onClick={() => punch("out")}>
          退勤
        </button>
      </div>
      {msg && <p style={{ fontSize: 13, color: "#404040" }}>{msg}</p>}
    </div>
  );
}
