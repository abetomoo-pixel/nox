"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

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

  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <button style={{ ...t.btnGold, padding: "10px 24px", fontSize: 14, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => punch("in")}>
          出勤
        </button>
        <button style={{ ...t.btnGhost, padding: "10px 24px", fontSize: 14, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => punch("out")}>
          退勤
        </button>
      </div>
      {msg && <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>}
    </div>
  );
}
