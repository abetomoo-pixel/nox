"use client";

// ★0162 ★4（裁定326 追補7-6・便 M5-2・2026-10-01）: /mine 初回表示の契約確認画面（cast セルフ）。
//   server（page.tsx）が cast_contract_ack_needed() を読み、needed=true のときだけ本部品を描く（最上部・他カードより先）。
//   「確認しました」→ cast_contract_ack_self()（冪等・audit は 1 回目だけ）→ router.refresh() で page が needed=false を読み直し消える。
//   文面は lib/nox/mine/contract-ack.ts（料金マスタの既存文面を逐語）。失敗は Message（rpcErrJa）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { CONTRACT_ACK_BUTTON, CONTRACT_ACK_DONE, CONTRACT_ACK_LINES, CONTRACT_ACK_NOTE, CONTRACT_ACK_TITLE } from "@/lib/nox/mine/contract-ack";

export default function ContractAckGate() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ack() {
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc("cast_contract_ack_self");
      if (error) { setErr(rpcErrJa(error.message)); return; }
      setDone(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="nox-panel" style={{ marginBottom: 14, borderColor: "var(--gold-bd)" }} aria-live="polite">
      <h3>{CONTRACT_ACK_TITLE}</h3>
      {CONTRACT_ACK_LINES.map((l) => (
        <p key={l} style={{ fontSize: 13, color: "var(--ink)", margin: "6px 0" }}>{l}</p>
      ))}
      <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>{CONTRACT_ACK_NOTE}</p>
      {err && <Message kind="error" style={{ margin: "8px 0 0" }}>{err}</Message>}
      {done && <Message kind="success" style={{ margin: "8px 0 0" }}>{CONTRACT_ACK_DONE}</Message>}
      <div className="nox-actions" style={{ marginTop: 10 }}>
        <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || done} onClick={() => void ack()}>
          {busy ? "記録中…" : CONTRACT_ACK_BUTTON}
        </button>
      </div>
    </section>
  );
}
