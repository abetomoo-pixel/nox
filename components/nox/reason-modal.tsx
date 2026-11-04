"use client";

// ★裁定443 18-⑦（2026-11-04 確定・事後承認 B）: window.prompt で理由を取っていた 4 か所（日払いの取消・申請の却下・納付記録の取消・出勤不可）を
//   確認の Modal に＝対象（金額と相手）を見せてから理由を入れる。register-board の取消モーダル・payroll-board の削除理由モーダル（裁定265）と同じ型
//   （既存 Modal＝.nox-formmodal-*・空／空白のみは送信 disabled・Esc と背景タップは onCancel・busy 中は閉じない）。
import { useState } from "react";
import Modal from "@/components/ui/modal";
import * as t from "@/lib/nox/ui/theme";

export default function ReasonModal({ title, lines, note, required = true, maxLen = 200, placeholder, submitLabel, danger = false, busy = false, onCancel, onSubmit, testId }: {
  /** 見出し（例: 日払いを取り消す） */ title: string;
  /** 対象の行（ラベル・値）＝金額と相手を必ず見せる */ lines: ReadonlyArray<readonly [string, string]>;
  /** 補足（例: 元に戻せません） */ note?: string;
  /** 理由を必須にする（既定 true・出勤不可だけ任意） */ required?: boolean;
  maxLen?: number; placeholder?: string;
  /** 送信ボタンの文言（例: 取り消す） */ submitLabel: string;
  /** 取消系＝赤枠のゴースト（payroll-board の削除と同じ） */ danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
  testId?: string;
}) {
  const [reason, setReason] = useState("");
  const empty = reason.trim().length === 0;
  const disabled = busy || (required && empty);
  const close = () => { if (!busy) onCancel(); };
  return (
    <Modal onClose={close} maxWidth={430}>
      <div className="nox-formmodal-head" data-reason-modal={testId ?? "1"}>
        <strong>{title}</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={close}>×</button>
      </div>
      <div style={{ display: "grid", gap: 2, margin: "4px 0 10px" }}>
        {lines.map(([k, v]) => (
          <div key={k} style={t.bdRow}><span style={t.bdKey}>{k}</span><span style={{ ...t.bdVal, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }} data-reason-line={k}>{v}</span></div>
        ))}
      </div>
      {note && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>{note}</p>}
      <label style={{ display: "grid", gap: 4 }}>
        <span style={t.fieldLabel}>理由{required ? `（必須・${maxLen} 字まで）` : `（任意・${maxLen} 字まで）`}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={maxLen} disabled={busy} autoFocus
          placeholder={placeholder ?? (required ? "例: 入力誤り" : "")} style={{ ...t.input, width: "100%" }} aria-label="理由" data-reason-input="1" />
      </label>
      <div className="nox-formmodal-foot">
        <button type="button" style={t.btnGhost} disabled={busy} onClick={close}>キャンセル</button>
        <button type="button" onClick={() => void onSubmit(reason.trim().slice(0, maxLen))} disabled={disabled} data-reason-submit="1"
          style={danger ? { ...t.btnGhost, border: "1px solid var(--bad)", color: "var(--bad)", opacity: disabled ? 0.5 : 1 } : { ...t.btnGold, opacity: disabled ? 0.6 : 1 }}>{busy ? "処理中…" : submitLabel}</button>
      </div>
    </Modal>
  );
}
