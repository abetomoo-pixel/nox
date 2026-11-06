"use client";

// ★M-117（2026-11-06・便 F）: 予約の申請の「承認」「却下」＝レジ › 予約（reservation-panel）と同じ RPC reservation_decide（却下は理由必須＝ReasonModal）。
//   ホームの要承認の行と シフト › 今日タブの担当キャストの行で同じ部品を使う（二重実装しない）。承認後は onDone で呼び出し側が取得し直す（ベルは nox:pending で更新）。
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import ReasonModal from "@/components/nox/reason-modal";
import { RESERVATION_OPEN_REGISTER, rejectReasonOkOf, reservationLineOf, type PendingReservation } from "@/lib/nox/home/pending";

export function reservationDecideErrJa(msg: string): string {
  if (msg.includes("not pending")) return "この申請はすでに決裁済みです";
  if (msg.includes("bad reason")) return "理由は 200 字以内で入力してください";
  if (msg.includes("billing locked")) return "ご契約の状態により、この操作は現在できません";
  if (msg.includes("forbidden")) return "権限がありません（承認・却下は管理者・店長・顧客権限のあるスタッフ）";
  return msg;
}

export default function ReservationDecide({ r, compact = false, onDone, onError }: { r: PendingReservation; /** 今日タブ＝小さく（リンクなし） */ compact?: boolean; onDone: (decision: "approve" | "reject") => void | Promise<void>; onError?: (msg: string) => void }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(false);
  const line = reservationLineOf(r);
  async function decide(decision: "approve" | "reject", reason: string | null = null) {
    if (decision === "reject" && !rejectReasonOkOf(reason)) { onError?.("却下の理由を 1〜200 字で入力してください"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("reservation_decide", { p_reservation_id: r.id, p_decision: decision, p_reason: decision === "reject" ? reason : null });
    setBusy(false);
    if (error) { onError?.(reservationDecideErrJa(error.message)); return; }
    setReject(false);
    window.dispatchEvent(new CustomEvent("nox:reservation-decided", { detail: { id: r.id, decision } }));
    await onDone(decision);
  }
  return (
    <span className="nox-pending-acts" data-rsv-decide={r.id} style={compact ? { gap: 4 } : undefined}>
      {reject && (
        <ReasonModal title="予約の申請を却下する" testId="rsv-reject" submitLabel="却下する" busy={busy}
          lines={[["申請", line.head], ["担当・申請元", line.sub]]} placeholder="例: その日は満席のため"
          onCancel={() => setReject(false)} onSubmit={(reason) => void decide("reject", reason)} />
      )}
      <button type="button" className={compact ? "nox-rowbtn" : undefined} style={compact ? undefined : { ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void decide("approve")} data-rsv-approve={r.id}>承認</button>
      <button type="button" className={compact ? "nox-rowbtn" : undefined} style={compact ? undefined : { ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setReject(true)} data-rsv-reject={r.id}>却下</button>
      {!compact && <Link href={`/register?store=${r.storeId}&tab=reserve`} className="nox-link" style={{ fontSize: 12, whiteSpace: "nowrap" }} data-rsv-open="1">{RESERVATION_OPEN_REGISTER}</Link>}
    </span>
  );
}
