"use client";

// ★0154 D1（2026-09-24・裁定294-4／295-1）: /mine 本人の申請一覧（審査中／承認／却下・decide_reason 表示）＋承認分の確認（未確認／確認済み／異議あり→punch_correction_ack）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { ackLabelOf, ackOptionsOf, correctionSummaryOf, decisionLabelOf, type Ack, type CorrectionRow } from "@/lib/nox/shift/punch-correction";

export default function PunchCorrectionList({ rows, term }: { rows: CorrectionRow[]; term: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function ack(id: string, a: Ack) {
    if (busy) return;
    setMsg(null); setBusy(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("punch_correction_ack", { p_id: id, p_ack: a });
    setBusy(null);
    setMsg(error ? `送信できませんでした: ${rpcErrJa(error.message)}` : a === "confirmed" ? "確認しました" : "異議ありとして店に伝えました");
    if (!error) router.refresh();
  }

  if (rows.length === 0) return <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>{term}の修正申請はありません。</p>;
  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => {
          const opts = ackOptionsOf(r);
          const col = r.decision === "approved" ? "var(--ok)" : r.decision === "rejected" ? "var(--bad)" : "var(--gold)";
          return (
            <li key={r.id} className="nox-listrow" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12.5 }}>
              <span className="num" style={{ flex: "1 1 160px" }}>{correctionSummaryOf(r)}</span>
              <span style={{ color: col, fontWeight: 700 }}>{decisionLabelOf(r.decision)}</span>
              {r.decision === "rejected" && r.decide_reason && <span style={{ color: "var(--sub)" }}>理由: {r.decide_reason}</span>}
              {r.decision === "approved" && (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: r.ack === "disputed" ? "var(--bad)" : "var(--sub)" }}>{ackLabelOf(r.ack)}</span>
                  {opts.map((a) => (
                    <button key={a} type="button" disabled={busy === r.id || r.ack === a} onClick={() => void ack(r.id, a)}
                      style={{ ...(a === "confirmed" ? t.btnGold : t.btnGhost), ...t.btnSm, opacity: busy === r.id || r.ack === a ? 0.5 : 1 }}>
                      {a === "confirmed" ? "確認した" : "異議あり"}
                    </button>
                  ))}
                </span>
              )}
              <span style={{ color: "var(--sub)", fontSize: 11 }}>{r.reason}</span>
            </li>
          );
        })}
      </ul>
      <Toast msg={msg} />
    </div>
  );
}
