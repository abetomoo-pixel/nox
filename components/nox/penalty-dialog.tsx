"use client";

// ★便 X13-H H-16（裁定410・2026-10-21）: 遅刻・当欠の罰金ダイアログ（送りと同じ形）。今日タブで店が遅刻／当欠を記録したとき、委託キャストにだけ出す。
//   金額＝精算調整のひな形（委託）の該当行の既定額（減額・0 円可・増額不可）・既定額から変えたら理由必須。
//   確定＝payroll_adjustment_add（source 'settlement'・basis＝ひな形の契約根拠・target_shift_id＝その日のシフト・audit は RPC）。罰金なし＝勤怠の記録だけ（閉じる）。
//   同じシフトに同じ種別の罰金が既にあれば二重に出さず「既に ¥n を記録済み」（変更・取消の RPC は無い＝0175・給与画面へ）。当期の draft run が無ければ登録できない（既存の精算調整と同じ）。
import { useEffect, useState } from "react";
import Link from "next/link";
import MoneyInput from "@/components/ui/money-input";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { presetsOf, penaltyArgsOf, penaltyAmountErrOf, settlementReasonOf, type SettlementPreset } from "@/lib/nox/payroll/settlement";

export type PenaltyTarget = "late" | "absent";
export const PENALTY_TITLE: Record<PenaltyTarget, string> = { late: "遅刻の罰金", absent: "当欠の罰金" };

export default function PenaltyDialog({ storeId, castId, castName, biz, shiftId, target, onClose, onDone }: {
  storeId: string; castId: string; castName: string; biz: string; shiftId: string | null; target: PenaltyTarget;
  onClose: () => void; onDone: (text: string) => void;
}) {
  const supabase = createClient();
  const [preset, setPreset] = useState<SettlementPreset | null | undefined>(undefined);
  const [run, setRun] = useState<{ id: string; status: string } | null | undefined>(undefined);
  const [existing, setExisting] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
      const p = presetsOf((data?.settings_json ?? null) as Record<string, unknown> | null).find((x) => x.target === target) ?? null;
      const { data: r } = await supabase.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", biz.slice(0, 7)).maybeSingle();
      let ex: number | null = null;
      if (p && shiftId) {
        const { data: aj } = await supabase.from("payroll_adjustments").select("amount, reason").eq("target_shift_id", shiftId).eq("source", "settlement");
        const hit = ((aj ?? []) as { amount: number | null; reason: string }[]).find((a) => a.reason.startsWith(settlementReasonOf(p, biz)));
        ex = hit ? Number(hit.amount ?? 0) : null;
      }
      if (!alive) return;
      setPreset(p); setRun(r ? { id: r.id as string, status: r.status as string } : null); setExisting(ex);
      if (p) setAmount(String(p.amount));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, castId, shiftId, target, biz]);

  const md = `${Number(biz.slice(5, 7))}/${Number(biz.slice(8, 10))}`;
  const n = Number(amount.replace(/[,，¥￥\s]/g, "") || 0);
  const amountErr = preset ? penaltyAmountErrOf(preset.amount, n, reason) : null;
  const runNg = run === null ? "当期の給与が未作成です（給与画面でプレビューを 1 回押すと作成されます）" : run && run.status !== "draft" ? "当期の給与は確定済みのため登録できません" : null;

  async function confirm() {
    if (busy || !preset || !run || runNg || amountErr) return;
    const a = penaltyArgsOf({ runId: run.id, castId, preset, amount: n, biz, shiftId, reason });
    if (!a.ok) { setErr(a.err); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("payroll_adjustment_add", a.args);
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    onDone(`${castName} の${PENALTY_TITLE[target]} ¥${n.toLocaleString()} を精算調整に記録しました`);
    onClose();
  }

  const loading = preset === undefined || run === undefined;
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={430}>
      <div className="nox-formmodal-head" data-penalty-dialog={target}>
        <strong>{PENALTY_TITLE[target]}（{castName}・{md}）</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      {loading ? <p style={{ fontSize: 12, color: "var(--sub)" }}>読み込み中…</p> : !preset ? (
        <Message kind="warn">精算調整のひな形（委託）に{target === "late" ? "遅刻" : "当欠"}の行がありません（報酬制度の精算調整のひな形で設定）。勤怠の記録だけ残しました。</Message>
      ) : existing !== null ? (
        <p style={{ fontSize: 13, margin: "0 0 10px" }} data-penalty-existing="1">既に ¥{existing.toLocaleString()} を記録済みです（このシフト・{preset.name}）。変更・取消は<Link href="/payroll" className="nox-link">給与画面</Link>の精算調整から。</p>
      ) : (
        <>
          {preset.amount === 0 && <Message kind="info" style={{ margin: "0 0 8px" }}>既定額が未設定です（報酬制度の精算調整のひな形で設定）。0 円で記録することもできます。</Message>}
          <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>金額（既定 ¥{preset.amount.toLocaleString()}・減額と 0 円は可）
            <span style={{ display: "block", marginTop: 4 }}><MoneyInput value={amount} onChange={setAmount} disabled={busy} width="100%" ariaLabel="罰金の金額" invalid={!!amountErr && amountErr.startsWith("既定額")} /></span>
          </label>
          {n !== preset.amount && (
            <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>理由（既定額から変えたときは必須）
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} disabled={busy} style={{ ...t.input, width: "100%", marginTop: 4 }} data-penalty-reason="1" placeholder="例: 事前連絡があったため減額" />
            </label>
          )}
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px" }}>根拠（明細に載ります）: {preset.basis || "（未設定）"}・時給の減少とは別の行です。</p>
          {amountErr && <Message kind="error">{amountErr}</Message>}
          {runNg && <Message kind="warn">{runNg}</Message>}
          {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
        </>
      )}
      <div className="nox-formmodal-foot">
        {preset && existing === null && !loading && (
          <button type="button" style={{ ...t.btnPrimary56, opacity: busy || !!amountErr || !!runNg ? 0.5 : 1 }} disabled={busy || !!amountErr || !!runNg} data-penalty-confirm="1" onClick={() => void confirm()}>{busy ? "記録中…" : "罰金を確定"}</button>
        )}
        <button type="button" style={t.btnSecondary48} disabled={busy} onClick={onClose} data-penalty-none="1">{preset && existing === null ? "罰金なしで記録" : "閉じる"}</button>
      </div>
    </Modal>
  );
}
