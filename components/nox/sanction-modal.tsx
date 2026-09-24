"use client";

// ★0154 D5（2026-09-24・裁定293-3／294-6／295）: 懲戒減給（雇用のみ・裁定265 型モーダル）。就業規則根拠のチェック必須・額・理由
//   → payroll_adjustment_add(source='sanction')。上限は RPC（'sanction cap'＝和文「1 件は平均賃金の半額・当期合計は賃金総額の 1/10 まで」）。
//   常時注記「上限内でも適法とは限りません」。当 run に payslip が無い（推計基底）ときは理由に「（推計基底）」を付す。
import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { NOTE_ESTIMATED, NOTE_SANCTION_CAP, NOTE_SANCTION_LEGAL, sanctionArgsOf, sanctionErrJa } from "@/lib/nox/payroll/sanction";

export default function SanctionModal({ runId, castId, castName, onClose, onDone }: {
  runId: string; castId: string; castName: string; onClose: () => void; onDone: (text: string) => void;
}) {
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [basis, setBasis] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [estimated, setEstimated] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // 当 run の payslip（再確定前の凍結値）があればそれが総額上限の基底・無ければ推計（295-2）
      const { data } = await supabase.from("payslips").select("id").eq("run_id", runId).eq("cast_id", castId).maybeSingle();
      if (alive) setEstimated(!data);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, castId]);

  async function submit() {
    if (busy) return;
    setErr(null);
    const n = Number(amount.replace(/[,，¥￥\s]/g, ""));
    const a = sanctionArgsOf({ runId, castId, amount: n, reason, basisChecked: checked, basis, estimated: estimated === true });
    if (!a.ok) { setErr(a.err); return; }
    setBusy(true);
    const { error } = await supabase.rpc("payroll_adjustment_add", a.args);
    setBusy(false);
    if (error) { setErr(sanctionErrJa(error.message) ?? rpcErrJa(error.message)); return; }
    onDone(`${castName} の懲戒減給（¥${n.toLocaleString()}）を登録しました${estimated ? NOTE_ESTIMATED : ""}`);
    onClose();
  }

  const disabled = busy || !checked || amount.trim() === "" || reason.trim() === "" || basis.trim() === "";
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={460}>
      <div className="nox-formmodal-head">
        <strong>懲戒減給を登録（雇用）</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p style={{ fontSize: 12.5, margin: "0 0 8px" }}>{castName}{estimated === true ? <span style={{ marginLeft: 6, color: "var(--gold)" }}>{NOTE_ESTIMATED}＝当期の給与が未確定のため上限は平均賃金×暦日数で推計します</span> : null}</p>
      <Message kind="warn">{NOTE_SANCTION_LEGAL}</Message>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 8px" }}>{NOTE_SANCTION_CAP}</p>
      <label style={{ display: "block", fontSize: 12.5, marginBottom: 6 }}>
        <input type="checkbox" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} /> 就業規則に懲戒減給の根拠があることを確認した（必須）
      </label>
      <input value={basis} onChange={(e) => setBasis(e.target.value)} maxLength={200} disabled={busy} placeholder="根拠（就業規則 第○条・懲戒事由）" style={{ ...t.input, width: "100%", marginBottom: 6 }} />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" disabled={busy} placeholder="額（円）" style={{ ...t.input, width: "100%", marginBottom: 6 }} />
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} disabled={busy} placeholder="理由（明細に出ます・200 字まで）" style={{ ...t.input, width: "100%" }} />
      {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
      <div className="nox-formmodal-foot">
        <button type="button" onClick={() => void submit()} disabled={disabled} style={{ ...t.btnGold, opacity: disabled ? 0.5 : 1 }}>{busy ? "登録中…" : "登録する"}</button>
        <button type="button" onClick={onClose} disabled={busy} style={t.btnGhost}>キャンセル</button>
      </div>
    </Modal>
  );
}
