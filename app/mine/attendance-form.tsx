"use client";

import { useState } from "react";
import HmInput from "@/components/ui/hm-input"; // ★裁定318（便 X-9-2）: 時刻入力の共通部品（blur で HH:MM に正規化）
import { HM_FORMAT_ERR, hmRangeErrorOf, normalizeHHMM } from "@/lib/nox/time/hhmm";
import SegSelect from "@/components/ui/seg-select";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
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
    // ★裁定318: 出勤見込みは正規化後の値を送る（形が違えば送らずに知らせる）
    const etaN = status === "late" && eta ? normalizeHHMM(eta) : null;
    if (status === "late" && eta && !etaN) { setMsg(HM_FORMAT_ERR); return; }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("attendance_set_self", {
      p_date: date,
      p_status: status,
      p_eta: etaN,
      p_reason: reason || null,
    });
    setMsg(error ? "送信に失敗しました。時刻の形式を確認してください（例 2000・20:00）" : "連絡を送信しました");
    setBusy(false);
    router.refresh();
  }

  const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
      <SegSelect value={status} onChange={(v) => setStatus(v as "late" | "absent")}
            options={[["late", "遅刻"], ["absent", "当欠"]] as const} />
      {status === "late" && (
        <HmInput placeholder="出勤見込み（例 2530・25:30）" value={eta} onChange={setEta} ariaLabel="出勤見込み" style={{ ...input, width: 170 }} />
      )}
      <input
        placeholder="理由（任意）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...input, width: 160 }}
      />
      <button type="submit" disabled={busy || (status === "late" && hmRangeErrorOf(eta) !== null)} style={{ ...t.btnGold, padding: "8px 16px", opacity: busy || (status === "late" && hmRangeErrorOf(eta) !== null) ? 0.7 : 1 }}>{/* ★318 追補 */}
        送信
      </button>
      {msg && <Toast msg={msg} />}
    </form>
  );
}
