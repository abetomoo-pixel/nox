"use client";

// ★裁定300（2026-09-25）: 前借り／送り実費の発行フォーム（共通部品）＝3 入口で同じ部品・同じ route（既存 RPC adv_issue／transport_issue・新 RPC 0）。
//   300-1: キャスト選択は共通 picker（裁定259）・金額／日付／メモ／発行は 1 段のフォーム行（.nox-issue-row・≤899px は 1 列＝M5 の型）。
//   300-2: castId を渡すとキャスト固定（picker は出さない）・readOnly（確定後）は入口を出さず注記のみ。
//   メッセージは裁定281 の型（Message・同じカード内・×で消す）。
import { useState } from "react";
import Picker from "@/components/nox/picker";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { ISSUE_DATE_LABEL, ISSUE_LABEL, issueBodyOf, issueErrJa, okuriEnabledOf, type IssueKind } from "@/lib/nox/payroll/advance-okuri";

export type IssueCast = { id: string; name: string };

export default function AdvanceOkuriForm({ storeId, casts, castId, castName, dateDefault, okuriMode, okuriBase = 0, readOnly = false, readOnlyNote, onIssued }: {
  storeId: string;
  /** picker の候補（castId 固定のときは未使用可） */
  casts: IssueCast[];
  /** 固定するキャスト（casts 詳細・給与明細）。未指定＝picker */
  castId?: string | null;
  castName?: string | null;
  /** 日付の既定（YYYY-MM-DD・呼び出し側が issueDateDefaultOf で決める） */
  dateDefault: string;
  /** 店の送り方式（'actual' のときだけ送り実費を有効化・未指定＝RPC に任せる） */
  okuriMode?: string | null;
  /** 送りベース額（プリフィル・0＝空） */
  okuriBase?: number;
  /** 確定後（finalized／paid）＝入口を出さない */
  readOnly?: boolean;
  readOnlyNote?: string;
  onIssued?: (kind: IssueKind, id: string) => void | Promise<void>;
}) {
  if (readOnly) {
    return <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>{readOnlyNote ?? "確定済みのため、前借り／送り実費の発行はできません（読取のみ）。"}</p>;
  }
  const okuriOn = okuriEnabledOf(okuriMode);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <IssueRow kind="advance" storeId={storeId} casts={casts} castId={castId} castName={castName} dateDefault={dateDefault} disabled={false}
        hint="給与から天引きされます（手取り不足時は翌月へ繰越）。残高の管理は次の段（0156）で追加します。" onIssued={onIssued} />
      <IssueRow kind="transport" storeId={storeId} casts={casts} castId={castId} castName={castName} dateDefault={dateDefault} disabled={!okuriOn} defaultAmount={okuriBase}
        hint={okuriOn ? "当月精算（繰越なし）。手取り不足で引き切れない残は再回収されません。" : "※送り方式が「実費」の店のみ発行できます（控除・送りで切替）。"} onIssued={onIssued} />
    </div>
  );
}

function IssueRow({ kind, storeId, casts, castId, castName, dateDefault, disabled, hint, defaultAmount, onIssued }: {
  kind: IssueKind; storeId: string; casts: IssueCast[]; castId?: string | null; castName?: string | null; dateDefault: string;
  disabled: boolean; hint: string; defaultAmount?: number; onIssued?: (kind: IssueKind, id: string) => void | Promise<void>;
}) {
  const prefill = defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "";
  const fixed = !!castId;
  const [pick, setPick] = useState<string | null>(castId ?? casts[0]?.id ?? null);
  const [amount, setAmount] = useState(prefill);
  const [date, setDate] = useState(dateDefault);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const label = ISSUE_LABEL[kind];

  async function submit() {
    if (busy || disabled) return;
    setMsg(null);
    const b = issueBodyOf({ kind, storeId, castId: fixed ? castId : pick, amount, date, note });
    if (!b.ok) { setMsg({ kind: "error", text: b.err }); return; }
    setBusy(true);
    try {
      const res = await fetch(b.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b.body) });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) { setMsg({ kind: "error", text: issueErrJa(res.status, j.error) }); return; }
      const who = fixed ? (castName ?? "") : (casts.find((c) => c.id === pick)?.name ?? "");
      setMsg({ kind: "success", text: `${who ? who + " の" : ""}${label} ${b.body.amount.toLocaleString("en-US")} 円を発行しました（${date}）` });
      setAmount(prefill); setNote("");
      if (j.id && onIssued) await onIssued(kind, j.id);
    } catch (e) {
      setMsg({ kind: "error", text: `通信エラー: ${(e as Error).message}` });
    } finally { setBusy(false); }
  }

  return (
    <section className="nox-cardtop" style={{ ...t.card, opacity: disabled ? 0.6 : 1, marginBottom: 0, paddingBottom: 16 }}>
      {/* ★301-4: 見出し→12→「キャスト」ラベル→6→picker→16→フォーム行→8→注記→カード下端 16（値は 4/8/12/16/24 のみ・ラベルと入力の間は全ラベル 6） */}
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 12px" }}>{label}の発行{fixed && castName ? `（${castName}）` : ""}</h3>
      {!fixed && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>キャスト</div>
          <Picker dense items={casts.map((c) => ({ id: c.id, label: c.name }))} value={pick} onPick={setPick} disabled={disabled} placeholder="キャストを検索" empty="（対象なし）" />
        </div>
      )}
      <div className="nox-issue-row">
        <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>金額(円)</span>
          <input type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={disabled} style={{ ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>{ISSUE_DATE_LABEL[kind]}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} style={{ ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>メモ</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} maxLength={200} style={{ ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 }} />
        </label>
        <button type="button" className="nox-btn" onClick={() => void submit()} disabled={busy || disabled} style={{ alignSelf: "end" }}>{busy ? "発行中…" : "発行"}</button>{/* 実行＝青塗り（裁定242） */}
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>{hint}</p>
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </section>
  );
}
