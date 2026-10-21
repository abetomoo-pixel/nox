"use client";

// ★便 X13-I I-5（裁定410 追補・2026-10-21）: 給与プレビューの要対応＝ノルマ未達の減額の提案。
//   委託＝「適用」で精算調整の行（payroll_adjustment_add・source 'settlement'・理由「ノルマ未達（10月・指名 不足 12 回）」・明細に出す・時給の減少とは別行・audit は RPC）／「除外」は理由必須（理由の記録先は 0175＝この画面の中だけ）。
//   雇用＝別の見出し「ノルマ未達の懲戒減給（雇用・労基法 91 条の上限内）」＝91 条でキャップした額を懲戒減給（source 'sanction'）で登録。就業規則の定めが無い店・平均賃金が算定できないキャストは提案なしで案内だけ。
//   金額は減額可・増額不可。取消／変更は給与画面の調整控除（既存）。確定（finalize）は提案を自動では入れない＝適用した行だけが入る。
import { useState } from "react";
import MoneyInput from "@/components/ui/money-input";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { normApplyErrOf, normReasonOf, type NormProposal } from "@/lib/nox/payroll/norm-proposal";

export type NormProposalRow = { castId: string; castName: string; normProposal: NormProposal & { applied?: number } };
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default function NormProposals({ rows, runId, period, onDone }: { rows: NormProposalRow[]; runId: string | null; period: string; onDone: (text: string) => void | Promise<void> }) {
  const contractor = rows.filter((r) => r.normProposal.employment === "委託");
  const employee = rows.filter((r) => r.normProposal.employment === "雇用");
  if (rows.length === 0) return null;
  const sum = (rs: NormProposalRow[]) => rs.reduce((s, r) => s + (r.normProposal.applied ? 0 : r.normProposal.proposed), 0);
  return (
    <div data-norm-proposals="1" style={{ marginTop: 10, display: "grid", gap: 10 }}>
      {contractor.length > 0 && (
        <div>
          <strong style={{ color: "var(--champ)" }} data-norm-summary="1">ノルマ未達 {contractor.length} 名・提案額 合計 {yen(sum(contractor))}</strong>
          <span style={{ ...t.sub, marginLeft: 8 }}>委託キャストのみ。適用した分だけ精算調整の行になります（確定前の提案）。</span>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>{contractor.map((r) => <ProposalRow key={r.castId} r={r} runId={runId} period={period} onDone={onDone} />)}</div>
        </div>
      )}
      {employee.length > 0 && (
        <div>
          <strong style={{ color: "var(--champ)" }}>ノルマ未達の懲戒減給（雇用・労基法 91 条の上限内）</strong>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>{employee.map((r) => <ProposalRow key={r.castId} r={r} runId={runId} period={period} onDone={onDone} />)}</div>
        </div>
      )}
    </div>
  );
}

function ProposalRow({ r, runId, period, onDone }: { r: NormProposalRow; runId: string | null; period: string; onDone: (text: string) => void | Promise<void> }) {
  const supabase = createClient();
  const p = r.normProposal;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(p.proposed));
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState("");
  const [excluded, setExcluded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(amount.replace(/[,，¥￥\s]/g, "") || 0);
  const amtErr = normApplyErrOf(p.proposed, n);
  const usable = p.status === "ok";

  async function apply() {
    if (!runId || busy || amtErr) return;
    setBusy(true); setErr(null);
    const isEmp = p.employment === "雇用";
    const { error } = await supabase.rpc("payroll_adjustment_add", {
      p_run_id: runId, p_cast_id: r.castId, p_mode: "fixed", p_amount: n, p_rate_bp: null, p_before_withholding: true, p_show_detail: true,
      p_reason: normReasonOf(period, p.items), p_source: isEmp ? "sanction" : "settlement",
      p_basis: isEmp ? "就業規則の減給の定め（ノルマ未達）・労基法 91 条の上限内" : "店のノルマ設定（ノルマ未達の減額）", p_target_shift_id: null,
    });
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    setOpen(false);
    await onDone(`${r.castName} のノルマ未達の${isEmp ? "懲戒減給" : "減額"} ${yen(n)} を適用しました`);
  }

  return (
    <div className="nox-inset" data-norm-row={r.castId} style={{ padding: "8px 12px", fontSize: 13 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>{r.castName}</b>
        {p.applied ? <span className="nox-stpill ok">適用済み {yen(p.applied)}</span>
          : excluded ? <span className="nox-stpill">除外（{excluded}）</span>
          : usable ? <span className="num">提案 {yen(p.proposed)}{p.capped ? `（計算 ${yen(p.total)}）` : ""}</span>
          : <span style={{ color: "var(--sub)" }}>{p.note}</span>}
        {!p.applied && !excluded && usable && <button type="button" className="nox-rowbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen((v) => !v)} data-norm-open={r.castId}>{open ? "閉じる" : "内訳"}</button>}
      </div>
      {open && (
        <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{p.items.map((x) => <li key={x.axis} className="num">{x.text}</li>)}</ul>
          {p.note && <span style={{ fontSize: 12, color: "var(--gold2)" }}>{p.note}</span>}
          {!excluding ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <MoneyInput value={amount} onChange={setAmount} disabled={busy} width={140} ariaLabel="適用する額" invalid={!!amtErr} />
              <button type="button" style={t.btnGold} disabled={busy || !!amtErr || !runId} onClick={() => void apply()} data-norm-apply={r.castId}>適用</button>
              <button type="button" style={t.btnGhost} disabled={busy} onClick={() => setExcluding(true)} data-norm-exclude={r.castId}>除外</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} placeholder="除外の理由（必須）" style={{ ...t.input, flex: "1 1 200px" }} aria-label="除外の理由" />
              <button type="button" style={t.btnGhost} disabled={!reason.trim()} onClick={() => { setExcluded(reason.trim()); setOpen(false); }} data-norm-exclude-ok={r.castId}>除外する</button>
              <button type="button" style={t.btnGhost} onClick={() => setExcluding(false)}>戻る</button>
            </div>
          )}
          {amtErr && <Message kind="error">{amtErr}</Message>}
          {!runId && <Message kind="warn">当期の給与が未作成です（プレビューのあと給与の下書きが作られると適用できます）</Message>}
          {err && <Message kind="error">{err}</Message>}
        </div>
      )}
    </div>
  );
}
