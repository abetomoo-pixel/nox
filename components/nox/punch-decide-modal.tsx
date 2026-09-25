"use client";

// ★裁定297-1（2026-09-25・裁定295-1）: 今日タブ「未決裁 n 件」＝cast の打刻修正申請（pending）を店（owner／manager）が承認／却下する（裁定265 型モーダル・理由必須）。
//   punch_correction_decide（既存 RPC・新 RPC 0）を呼ぶ＝approve は punches へ反映・reject は理由が本人の /mine に出る（decide_reason）。
//   メッセージは裁定281 の型（Message・同じカード内）。RPC の英語は rpcErrJa で和文化。prompt は使わない。
import { useState } from "react";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { correctionSummaryOf, decideArgsOf, requestedLabelOf, type CorrectionRow } from "@/lib/nox/shift/punch-correction";

export default function PunchDecideModal({ row, castName, approve, onClose, onDone }: {
  row: CorrectionRow & { id: string }; castName: string; approve: boolean;
  onClose: () => void; onDone: (text: string) => void;
}) {
  const supabase = createClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const verb = approve ? "承認" : "却下";

  async function submit() {
    if (busy) return;
    setErr(null);
    const a = decideArgsOf({ id: row.id, approve, reason });
    if (!a.ok) { setErr(a.err); return; }
    setBusy(true);
    const { error } = await supabase.rpc("punch_correction_decide", a.args);
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    onDone(approve ? `${castName} の申請（${correctionSummaryOf(row)}）を承認しました（記録に反映されます）` : `${castName} の申請（${correctionSummaryOf(row)}）を却下しました（理由は本人に表示されます）`);
    onClose();
  }

  const disabled = busy || reason.trim().length === 0;
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={430}>
      <div className="nox-formmodal-head">
        <strong>修正申請を{verb}</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p style={{ fontSize: 12.5, margin: "0 0 6px" }}>{castName}・{correctionSummaryOf(row)}</p>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>本人の理由: {row.reason}（申請 {requestedLabelOf(row.requested_at)}）</p>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>{verb}の理由は必須です（200 字まで・本人に表示され、監査に残ります）</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus
        placeholder={approve ? "例: 打刻機の不調を確認" : "例: シフト記録と一致しないため"} style={{ ...t.input, width: "100%" }} />
      {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
      <div className="nox-formmodal-foot">
        <button type="button" onClick={() => void submit()} disabled={disabled}
          style={{ ...(approve ? t.btnGold : { ...t.btnGhost, color: "var(--bad)", border: "1px solid var(--bad)" }), opacity: disabled ? 0.5 : 1 }}>
          {busy ? `${verb}中…` : `${verb}する`}
        </button>
      </div>
    </Modal>
  );
}
