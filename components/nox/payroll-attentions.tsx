"use client";

// ★裁定315（0158・便 AB-2）: 給与画面の「要対応」＝確定後の打刻修正（payroll_attentions）。確定済み／支払済みの run にだけ出る。
//   読取＝payroll_attentions_of(run_id)（owner／manager 自店）。「解決」＝理由は任意→payroll_attention_resolve。
//   「翌期の調整へ」＝翌期の当該 cast の調整入力を開く（種別と備考を prefill・金額は人が決める）＝遷移は呼び出し側（onCarry）。
//   解決済みは折りたたみ。メッセージは裁定281 の型（同じカード内）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { attentionCanCarry, attentionCarryOf, attentionLineOf, splitAttentions, type AttentionCarry, type AttentionRow } from "@/lib/nox/payroll/attention";

export default function PayrollAttentions({ runId, runPeriod, onCarry }: { runId: string; runPeriod: string; onCarry: (c: AttentionCarry) => void }) {
  const supabase = createClient();
  const [rows, setRows] = useState<AttentionRow[] | null>(null);
  const [target, setTarget] = useState<string | null>(null); // 解決の理由を入力中の行
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("payroll_attentions_of", { p_run_id: runId });
    if (error) { setRows([]); setMsg({ kind: "error", text: `要対応の読み込みに失敗しました（${rpcErrJa(error.message)}）` }); return; }
    setRows((data ?? []) as AttentionRow[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  useEffect(() => { setRows(null); setTarget(null); setMsg(null); void load(); }, [load]);

  async function resolve(id: string) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = reason.trim();
    const { error } = await supabase.rpc("payroll_attention_resolve", { p_id: id, p_reason: r.length > 0 ? r : null });
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: rpcErrJa(error.message) }); return; }
    setTarget(null); setReason("");
    setMsg({ kind: "success", text: "解決済みにしました" });
    void load();
  }

  if (!rows || rows.length === 0) return msg ? <Message kind={msg.kind}>{msg.text}</Message> : null;
  const { open, resolved } = splitAttentions(rows);
  return (
    <section className="nox-cardtop" style={{ ...t.card, fontSize: 12.5 }} aria-label="要対応（打刻）">
      {/* ★0161（裁定327・便 M1-5）: kind 2 種（確定後の打刻修正／未閉鎖の出勤）を同じ器で。open_punch は「翌期の調整へ」を出さず、修正申請で閉じて「解決」 */}
      <strong style={{ color: open.length > 0 ? "var(--danger-ink)" : "var(--ink)" }}>要対応（打刻）{open.length > 0 ? `（${open.length} 件）` : "（なし）"}</strong>
      <p style={{ color: "var(--sub)", margin: "4px 0 6px" }}>確定後の打刻修正: 確定済みの給与は変わりません。差額は翌期の調整で扱います。／未閉鎖の出勤: 前営業日以前の退勤がありません。店側の打刻修正で退勤を入れ、「解決」を押してください。</p>
      {open.map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid var(--line2)", padding: "8px 0" }}>
          <div style={{ overflowWrap: "anywhere" }}>{attentionLineOf(r)}</div>
          {target === r.id ? (
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="理由（任意・200 字まで）" style={{ ...t.input, width: "100%" }} autoFocus />
              <div className="nox-actions" style={{ justifyContent: "flex-start", gap: 8 }}>
                <button type="button" onClick={() => void resolve(r.id)} disabled={busy} style={{ ...t.btnGold, ...t.btnSm, opacity: busy ? 0.5 : 1 }}>{busy ? "記録中…" : "解決済みにする"}</button>
                <button type="button" onClick={() => { setTarget(null); setReason(""); }} disabled={busy} style={{ ...t.btnGhost, ...t.btnSm }}>キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="nox-actions" style={{ justifyContent: "flex-start", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {attentionCanCarry(r) && <button type="button" onClick={() => onCarry(attentionCarryOf(r, runPeriod))} disabled={busy} style={{ ...t.btnGold, ...t.btnSm }}>翌期の調整へ</button>}
              <button type="button" onClick={() => { setMsg(null); setReason(""); setTarget(r.id); }} disabled={busy} style={{ ...t.btnGhost, ...t.btnSm }}>解決</button>
            </div>
          )}
        </div>
      ))}
      {msg && <div style={{ marginTop: 6 }}><Message kind={msg.kind}>{msg.text}</Message></div>}
      {resolved.length > 0 && (
        <details style={{ borderTop: "1px solid var(--line2)", paddingTop: 6, marginTop: 4 }}>
          <summary style={{ cursor: "pointer", color: "var(--sub)" }}>解決済み {resolved.length} 件</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--sub)" }}>
            {resolved.map((r) => <li key={r.id} style={{ overflowWrap: "anywhere" }}>{attentionLineOf(r)}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
