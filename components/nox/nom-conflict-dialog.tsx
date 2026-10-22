"use client";

// ★裁定415（2026-10-22・便 SH-UI-c S-7）: 指名かぶり＝他卓に着卓中のキャストを「指名・席」でタップしたとき。
//   指名は必ず入れる（この卓に本指名＝指名料が入る・他卓の伝票は変わらない）。席だけを聞く（B 案）＝
//   「指名だけ入れる（席は A3 のまま）」／「指名して A3 から付け回す」（＝S-6 の付け回し＝着席ログに退席・着席）／キャンセル。
//   どちらも A3 側の指名料・分配率は不変。文言と判定は lib/nox/register/seat-roster.ts nomConflictTextOf。
import Modal from "@/components/ui/modal";
import * as t from "@/lib/nox/ui/theme";
import { nomConflictTextOf } from "@/lib/nox/register/seat-roster";

export default function NomConflictDialog({ castName, fromSeat, toSeat, busy, onNomOnly, onNomAndMove, onClose }: {
  castName: string; fromSeat: string | null; toSeat: string | null; busy: boolean;
  /** 指名だけ入れる（席は他卓のまま） */ onNomOnly: () => void;
  /** 指名して他卓から付け回す（S-6） */ onNomAndMove: () => void;
  onClose: () => void;
}) {
  const tx = nomConflictTextOf(castName, fromSeat, toSeat);
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={440}>
      <div className="nox-formmodal-head">
        <strong>指名かぶり</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p style={{ fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.7 }} data-nom-conflict="1">{tx.lead}</p>
      <div style={{ display: "grid", gap: 8 }}>
        <button type="button" style={{ ...t.btnPrimary56, opacity: busy ? 0.5 : 1 }} disabled={busy} data-nom-conflict-only="1" onClick={onNomOnly}>{busy ? "記録中…" : tx.only}</button>
        <button type="button" style={t.btnSecondary48} disabled={busy} data-nom-conflict-move="1" onClick={onNomAndMove}>{tx.move}</button>
        <button type="button" style={t.btnSecondary48} disabled={busy} onClick={onClose}>キャンセル</button>
      </div>
    </Modal>
  );
}
