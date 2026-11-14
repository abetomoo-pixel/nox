"use client";

// ★0201i（裁定486＋追補・2026-11-13 画面の便 2）: 受け取る側（キャスト・スタッフ）の「確認しました」と出欠（参加／不参加）。
//   notice_ack／notice_rsvp（本人・非ゲート・冪等）。押したあとは router.refresh() で server の描画（確認済み・答え・件数）へ。
//   締切（無ければ開催の日時）を過ぎたら「締切を過ぎました」＝ボタンを出さない（権威は RPC の 'rsvp closed'）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { errJa } from "@/lib/nox/errors";
import { Message } from "@/components/ui/toast"; // ★裁定281: メッセージは共通部品
import { NOTICE_ACK_BTN, NOTICE_ACKED, RSVP_CLOSED, RSVP_NO, RSVP_YES, noticeRespErrJa, rsvpClosedOf, rsvpLinesOf, type MyResponse, type NoticeRsvpCols, type RsvpAnswer } from "@/lib/nox/notices/response";

export default function NoticeRespond({ noticeId, n, mine, nowMs, onDone }: { noticeId: string; n: NoticeRsvpCols; mine: MyResponse; nowMs: number; /** client で読み直す画面（スタッフのお知らせ）＝router.refresh の代わり */ onDone?: () => void | Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [local, setLocal] = useState<MyResponse>(mine);
  const closed = rsvpClosedOf(n, nowMs);
  async function call(fn: "notice_ack" | "notice_rsvp", answer?: RsvpAnswer) {
    setBusy(true); setErr(null);
    const { error } = fn === "notice_ack"
      ? await createClient().rpc("notice_ack", { p_notice_id: noticeId })
      : await createClient().rpc("notice_rsvp", { p_notice_id: noticeId, p_answer: answer });
    setBusy(false);
    if (error) { setErr(noticeRespErrJa(error.message) || errJa(error.message)); return; }
    setLocal({ acked_at: local?.acked_at ?? new Date().toISOString(), rsvp: answer ?? local?.rsvp ?? null });
    if (onDone) await onDone(); else router.refresh();
  }
  const pill = (on: boolean): React.CSSProperties => ({ ...(on ? t.btnGold : t.btnGhost), ...t.btnSm, minWidth: 72 });
  return (
    <div style={{ marginTop: 6, display: "grid", gap: 6 }} data-notice-respond={noticeId}>
      {n.rsvp && (
        <div style={{ fontSize: 12.5, color: "var(--ink)", display: "grid", gap: 2 }} data-notice-rsvp-info="1">
          {rsvpLinesOf(n).map((l) => <span key={l} className="num">{l}</span>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }} data-notice-actions="1">{/* ★2026-11-14 Agoora: ボタンはセンター */}
        {n.rsvp ? (closed ? (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--sub)" }} data-notice-rsvp-closed="1">{RSVP_CLOSED}{local?.rsvp ? `（${local.rsvp === "yes" ? RSVP_YES : RSVP_NO}）` : ""}</span>
        ) : (
          <>
            <button type="button" style={pill(local?.rsvp === "yes")} disabled={busy} onClick={() => void call("notice_rsvp", "yes")} data-notice-rsvp="yes" aria-pressed={local?.rsvp === "yes"}>{RSVP_YES}</button>
            <button type="button" style={pill(local?.rsvp === "no")} disabled={busy} onClick={() => void call("notice_rsvp", "no")} data-notice-rsvp="no" aria-pressed={local?.rsvp === "no"}>{RSVP_NO}</button>
          </>
        )) : null}
        {local?.acked_at ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)" }} data-notice-acked="1">{NOTICE_ACKED}</span>
        ) : (
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void call("notice_ack")} data-notice-ack="1">{NOTICE_ACK_BTN}</button>
        )}
      </div>
      {err && <Message kind="error">{err}</Message>}
    </div>
  );
}
