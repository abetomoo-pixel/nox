"use client";

// ★便 ON-3（2026-10-26・0176 ★5 (c)・裁定406「辞退で戻る」）: cast 本人の「辞退」＝shift_cast_decline（proposed→planned・理由は任意 200 字）。
//   shift-confirm-button（確認する）と対＝同じ行に並ぶ。真の防御は RPC（auth_cast_id 本人・proposed のみ）。確定後は router.refresh()。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { DECLINE_BUTTON, DECLINE_CONFIRM, DECLINE_DONE, DECLINE_REASON_MAX, declineErrJa, declineReasonErrorOf } from "@/lib/nox/shift/decline";

export default function ShiftDeclineButton({ shiftId }: { shiftId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function decline() {
    const v = declineReasonErrorOf(reason); if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("shift_cast_decline", { p_shift_id: shiftId, p_reason: reason.trim() || null });
    setBusy(false);
    if (error) { setErr(declineErrJa(error.message ?? "")); return; }
    setDone(true); setOpen(false);
    router.refresh();
  }

  if (done) return <span style={{ fontSize: 11.5, color: "var(--sub)" }} data-shift-declined="1">{DECLINE_DONE}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} data-shift-decline={shiftId}>
      {!open ? (
        <button type="button" disabled={busy} onClick={() => setOpen(true)} style={{ ...t.btnGhost, fontSize: 11.5, fontWeight: 700, padding: "2px 10px", borderRadius: 999 }}>{DECLINE_BUTTON}</button>
      ) : (
        <span style={{ display: "grid", gap: 6, flexBasis: "100%", padding: "6px 0" }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>{DECLINE_CONFIRM}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={DECLINE_REASON_MAX} placeholder="理由（任意）" style={{ ...t.input, width: "100%", padding: "8px 10px" }} data-shift-decline-reason="1" />
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void decline()} style={{ ...t.btnGold, fontSize: 12, padding: "6px 14px", borderRadius: 999 }}>{busy ? "送信中…" : "辞退する"}</button>
            <button type="button" disabled={busy} onClick={() => { setOpen(false); setErr(null); }} style={{ ...t.btnGhost, fontSize: 12, padding: "6px 14px", borderRadius: 999 }}>やめる</button>
          </span>
        </span>
      )}
      {err && <Message kind="error">{err}</Message>}
    </span>
  );
}
