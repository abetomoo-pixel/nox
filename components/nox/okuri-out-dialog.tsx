"use client";

// ★裁定317（2026-09-29・便 X-9-3）: 退勤の「送り」金額ダイアログ（owner／manager の退勤＝/shift 今日タブ）。
//   既定＝店設定 okuri_base_amount → 同 cast の直近 transport 額 → 空欄（必須）。金額は変更可。
//   確定＝呼び出し側が 退勤打刻（punch_proxy p_okuri=true）→ transport_issue_bulk 1 件（idem＝punch id）を順に呼ぶ（本部品は金額を返すだけ）。
//   メッセージは裁定281 の型（Message）。RPC 追加 0。
import { useState } from "react";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-11-6: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { okuriAmountOf, okuriDefaultNoteOf, type OkuriDefault } from "@/lib/nox/shift/okuri-default";

export default function OkuriOutDialog({ castName, def, busy, error, onConfirm, onClose, mode = "outAndIssue", onOutOnly }: {
  castName: string;
  /** 既定値（呼び出し側が店設定と直近の送りから決める） */
  def: OkuriDefault;
  busy: boolean;
  error?: string | null;
  onConfirm: (amount: number) => void;
  onClose: () => void;
  /** ★裁定357（GV-5・便 N1014 A-6）: outAndIssue＝退勤＋送り（従来）／issueOnly＝退勤後の送りだけ（営業日内） */
  mode?: "outAndIssue" | "issueOnly";
  /** ★裁定357: 「退勤」から開いたとき（実費の店・当日未発行）＝「退勤のみ」の 2 択を出す */
  onOutOnly?: () => void;
}) {
  const [raw, setRaw] = useState(def.amount != null ? String(def.amount) : "");
  const amount = okuriAmountOf(raw);
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={430}>
      <div className="nox-formmodal-head">
        <strong>{mode === "issueOnly" ? "送りの発行" : onOutOnly ? "退勤" : "送りの金額"}</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p style={{ fontSize: 12.5, margin: "0 0 10px" }} data-okuri-mode={mode}>
        {mode === "issueOnly" ? `${castName} の送り実費を発行します（退勤は記録済み）。` : onOutOnly ? `${castName} の退勤を記録します。本日の送りは未発行です＝送りを発行して退勤しますか？` : `${castName} の退勤を記録し、送り実費を発行します。`}
      </p>
      <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>
        金額
        <span style={{ display: "block", marginTop: 4 }}>
          <MoneyInput value={raw} onChange={setRaw} disabled={busy} /* ★便 GV-C C-14b（GV-61）: 既定値あり＝autofocus なし（キーボードで「送りを発行して退勤」が隠れる） */ placeholder="例: 1,500" ariaLabel="送りの金額" width="100%" />
        </span>
      </label>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px", lineHeight: 1.7 }}>
        {okuriDefaultNoteOf(def)}。送りは給与の控除（送り実費）として記録され、日報の現金支払に集計されます。
      </p>
      {error && <div style={{ marginTop: 8 }}><Message kind="error">{error}</Message></div>}
      <div className="nox-formmodal-foot">
        <button type="button" style={{ ...t.btnPrimary56, opacity: busy || amount === null ? 0.5 : 1 }} disabled={busy || amount === null} data-okuri-confirm="1"
          onClick={() => { if (amount !== null) onConfirm(amount); }}>{busy ? "記録中…" : mode === "issueOnly" ? "送りを発行" : onOutOnly ? "送りを発行して退勤" : "確定して退勤"}</button>
        {onOutOnly && (/* ★裁定357: 2 択＝「退勤のみ」（送りは発行しない・営業日内なら後から「送り」で発行できる） */
          <button type="button" style={t.btnSecondary48} disabled={busy} onClick={onOutOnly} data-okuri-outonly="1">退勤のみ</button>
        )}
        <button type="button" style={t.btnSecondary48} disabled={busy} onClick={onClose}>キャンセル</button>
      </div>
    </Modal>
  );
}
