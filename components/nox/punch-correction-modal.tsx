"use client";

// ★0154 D1（2026-09-24・裁定294-2／295）: 今日タブ「修正」＝owner／manager の出退勤時刻の修正（裁定265 型モーダル・理由必須）。
//   punch_correction_request を呼ぶ＝owner／manager は同 tx で approved（申請＝確定・punches が更新される）。成功で onDone（行の再読込は呼び出し側）。
//   メッセージは裁定281 の型（Message・同じカード内）。RPC の英語はrpcErrJa で和文化。
import { useState } from "react";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { KIND_LABEL, requestArgsOf, requestInitOf, type PunchKind } from "@/lib/nox/shift/punch-correction";

export default function PunchCorrectionModal({ castId, castName, biz, kind, punchId, punchAtIso, shiftStartHm, shiftEndHm, term, onClose, onDone }: {
  castId: string; castName: string; biz: string; kind: PunchKind;
  punchId?: string | null; punchAtIso?: string | null; shiftStartHm?: string | null; shiftEndHm?: string | null;
  /** 用語（労働時間／稼働実績） */
  term: string;
  onClose: () => void; onDone: (text: string) => void;
}) {
  const supabase = createClient();
  const init = requestInitOf({ kind, biz, punchId, punchAtIso, shiftStartHm, shiftEndHm });
  const [hm, setHm] = useState(init.hm);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = KIND_LABEL[kind];

  async function submit() {
    if (busy) return;
    setErr(null);
    const a = requestArgsOf({ castId, punchId: init.punchId, biz, kind, hm, reason });
    if (!a.ok) { setErr(a.err); return; }
    setBusy(true);
    const { error } = await supabase.rpc("punch_correction_request", a.args);
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    onDone(`${castName} の${label}を ${hm} に修正しました（${term}の記録に反映されます）`);
    onClose();
  }

  const disabled = busy || reason.trim().length === 0 || hm.trim().length === 0;
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={430}>
      <div className="nox-formmodal-head">
        <strong>{label}の時刻を修正</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>
        {castName}・{biz}（{init.mode === "update" ? `現在 ${init.hm}` : "打刻なし＝新しく記録します"}）
      </p>
      <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>
        {label}時刻（HH:MM・翌日は 24:00〜47:59）
        <input value={hm} onChange={(e) => setHm(e.target.value)} placeholder={kind === "in" ? "20:00" : "26:00"} inputMode="numeric" maxLength={5} autoFocus style={{ ...t.input, width: "100%", marginTop: 4 }} />
      </label>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>理由は必須です（200 字まで・本人に表示され、監査に残ります）</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="例: 打刻忘れ（本人申告）" style={{ ...t.input, width: "100%" }} />
      {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
      <div className="nox-formmodal-foot">
        <button type="button" onClick={() => void submit()} disabled={disabled} style={{ ...t.btnGold, opacity: disabled ? 0.5 : 1 }}>{busy ? "修正中…" : "修正する"}</button>
        <button type="button" onClick={onClose} disabled={busy} style={t.btnGhost}>キャンセル</button>
      </div>
    </Modal>
  );
}
