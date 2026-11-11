"use client";

// ★便 SH-UI-c2 C2-13（2026-10-23）: HOME の最上段「要承認 N 件」のカード（店長・オーナー）。
//   行＝割引・無料の申請（卓・伝票・額・理由・申請者・経過分＝行内で承認／却下＝レジの会計タブと同じ RPC approval_decide・却下は理由必須）／
//   シフト希望の未処理（期間・件数→③シフト配置のその期間）／ノルマ未達の減額の提案（キャスト・額→給与の要対応）／退勤記録なし（キャスト・日→勤怠のその行）。
//   0 件＝畳んで「要承認なし」の 1 行。スタッフ＝自分の申請の状態だけ 1 行。390px＝各行 2 行（1 行目 種別と相手・2 行目 額と操作）。
//   承認後は行が消え、レジ側（approvals の読取）も同じ RPC の結果＝同期。ベル（pending-bell）と同じ API＝数が一致。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import ReasonModal from "@/components/nox/reason-modal"; // ★裁定443 18-⑦: 却下の理由は Modal（申請の内容を見せる・window.prompt は使わない）
import { APPROVAL_STATUS_LABEL, RESERVATION_OVERDUE_MARK, approvalLineOf, bellLabelOf, rejectReasonOkOf, reservationLineOf, type PendingSummary } from "@/lib/nox/home/pending";
import ReservationDecide from "@/components/nox/reservation-decide"; // ★M-117: 予約の承認待ち（レジ › 予約と同じ部品）
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本

export const PENDING_CARD_ID = "pending-card";

export default function PendingCard({ storeId, role }: { storeId: string; role: "owner" | "manager" | "staff" | string }) {
  const supabase = createClient();
  const [data, setData] = useState<PendingSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const load = useCallback(async () => {
    if (!storeId) return;
    const res = await fetch(`/api/home/pending?store=${encodeURIComponent(storeId)}&full=1`, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as PendingSummary & { error?: string };
    if (!res.ok) { setErr(j.error ?? `読み込めませんでした（${res.status}）`); return; }
    setErr(null); setData(j);
    window.dispatchEvent(new CustomEvent("nox:pending", { detail: { total: j.total } }));
  }, [storeId]);
  useEffect(() => { void load(); }, [load]);

  // ★裁定443 18-⑦（2026-11-04）: 却下の理由は ReasonModal（対象＝申請の見出しと内容を見せる）。承認は従来どおり即時
  const [rejectTarget, setRejectTarget] = useState<{ id: string; head: string; sub: string } | null>(null);
  async function decide(id: string, approve: boolean, reason: string | null = null) {
    if (!approve) {
      if (reason === null) return;
      if (!rejectReasonOkOf(reason)) { setMsg("却下の理由を 1〜200 字で入力してください"); return; }
    }
    setBusy(id); setMsg(null);
    const { error } = await supabase.rpc("approval_decide", { p_approval_id: id, p_approve: approve });
    setBusy(null);
    if (error) { setMsg(`処理できませんでした: ${errJa(error.message)}`); return; }
    setRejectTarget(null);
    setMsg(approve ? "承認しました（レジの明細に反映されます）" : `却下しました（理由: ${reason}）`);
    await load();
  }

  if (role === "staff") {
    const mine = data?.mine ?? [];
    return (
      <section id={PENDING_CARD_ID} className="nox-panel nox-pending" data-pending-card="staff" style={{ marginBottom: 14 }}>
        <h2 style={{ ...t.cardTitle, margin: "0 0 4px" }}>自分の申請</h2>
        {((data?.drinkClaims ?? 0) > 0 || (data?.reservations?.length ?? 0) > 0) && (/* ★M-170（2026-11-11 夜）: スタッフが処理できる承認待ち＝件数と行き先 */
          <ul style={{ margin: "0 0 8px", paddingLeft: 0, listStyle: "none" }} data-pending-staff-todo="1">
            {(data?.drinkClaims ?? 0) > 0 && <li className="nox-pending-row" data-pending-drink={data?.drinkClaims}><span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>ドリンク申告</span><span className="num">{data?.drinkClaims} 件</span></span><span className="nox-pending-l2"><a href="#drink-claim-queue" className="nox-link" style={{ fontSize: 12 }}>このページの申告の一覧へ ›</a></span></li>}
            {(data?.reservations?.length ?? 0) > 0 && <li className="nox-pending-row" data-pending-rsv-staff={data?.reservations?.length}><span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>予約の申請</span><span className="num">{data?.reservations?.length} 件</span></span><span className="nox-pending-l2"><Link href="/register" className="nox-link" style={{ fontSize: 12 }}>レジの予約で確認 ›</Link></span></li>}
          </ul>
        )}
        {mine.length === 0 ? <p style={{ ...t.sub, margin: 0 }}>申請はありません。</p> : (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>{mine.map((a) => { const l = approvalLineOf(a); return <li key={a.id} className="nox-pending-row" data-pending-mine={a.id}><span className="nox-pending-l1">{l.head}</span><span className="nox-pending-l2"><span className="nox-stpill" data-pending-status={a.status}>{APPROVAL_STATUS_LABEL[a.status ?? ""] ?? a.status}</span></span></li>; })}</ul>
        )}
      </section>
    );
  }
  const total = data?.total ?? 0;
  const none = !!data && total === 0 && (data.proposals?.length ?? 0) === 0;
  return (
    <section id={PENDING_CARD_ID} className="nox-panel nox-pending" data-pending-card="manager" data-pending-total={total} style={{ marginBottom: 14 }}>
      {rejectTarget && (/* ★裁定443 18-⑦ */
        <ReasonModal title="申請を却下する" testId="pending-reject" submitLabel="却下する" busy={busy === rejectTarget.id}
          lines={[["申請", rejectTarget.head], ["内容", rejectTarget.sub]]} placeholder="例: 金額が規定と違う"
          onCancel={() => setRejectTarget(null)} onSubmit={(reason) => decide(rejectTarget.id, false, reason)} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ ...t.cardTitle, margin: 0 }} data-pending-head="1">{data ? bellLabelOf(total) : "要承認"}</h2>
        {!none && data && <button type="button" className="nox-link" style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "畳む" : "開く"}</button>}
      </div>
      {err && <div style={{ marginTop: 6 }}><Message kind="error">{err}</Message></div>}
      {msg && <div style={{ marginTop: 6 }}><Message kind={/できません|入力して/.test(msg) ? "error" : "success"}>{msg}</Message></div>}
      {data && !none && open && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none" }}>
          {(data.reservations ?? []).map((r) => { const l = reservationLineOf(r); return (/* ★M-117（2026-11-06・便 F）: 予約の承認待ち＝先頭・1 件 1 行（種別・日時・客名・人数・担当・申請元）・時刻超過は印・承認／却下＝レジ › 予約と同じ部品 */
            <li key={r.id} className="nox-pending-row" data-pending-reservation={r.id} data-pending-overdue={l.overdue ? "1" : "0"}>
              <span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>予約の申請</span>{l.overdue && <span className="nox-stpill" style={{ marginRight: 6, color: "var(--bad)", borderColor: "var(--bad)" }} data-pending-overdue-mark="1">{RESERVATION_OVERDUE_MARK}</span>}{l.head}</span>
              <span className="nox-pending-l2"><span style={t.sub}>{l.sub}</span>
                <ReservationDecide r={r} onDone={async (d) => { setMsg(d === "approve" ? "承認しました（予約として確定）" : "却下しました"); await load(); }} onError={(m) => setMsg(`処理できませんでした: ${m}`)} />
              </span>
            </li>); })}
          {(data.drinkClaims ?? 0) > 0 && (/* ★M-170: ドリンク申告の承認待ち＝件数と行き先（承認はこのページの申告の一覧） */
            <li className="nox-pending-row" data-pending-drink={data.drinkClaims}>
              <span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>ドリンク申告</span><span className="num">{data.drinkClaims} 件</span></span>
              <span className="nox-pending-l2"><a href="#drink-claim-queue" className="nox-link" style={{ fontSize: 12 }}>このページの申告の一覧へ ›</a></span>
            </li>)}
          {data.approvals.map((a) => { const l = approvalLineOf(a); return (
            <li key={a.id} className="nox-pending-row" data-pending-approval={a.id}>
              <span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>割引・無料</span>{l.head}</span>
              <span className="nox-pending-l2"><span style={t.sub}>{l.sub}</span>
                <span className="nox-pending-acts">
                  <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy === a.id} onClick={() => void decide(a.id, true)} data-pending-approve={a.id}>承認</button>
                  <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy === a.id} onClick={() => setRejectTarget({ id: a.id, head: l.head, sub: l.sub })} data-pending-reject={a.id}>却下</button>
                </span>
              </span>
            </li>); })}
          {data.wishes.map((w) => (
            <li key={w.key} className="nox-pending-row" data-pending-wish={w.key}>
              <span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>シフト希望</span>{w.label}</span>
              <span className="nox-pending-l2"><span className="num">{w.n} 件</span><Link href={w.href} className="nox-link" style={{ fontSize: 12 }}>③シフト配置で確認 ›</Link></span>
            </li>
          ))}
          {data.proposals.map((p) => (
            <li key={p.castId} className="nox-pending-row" data-pending-proposal={p.castId}>
              <span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>ノルマ未達の提案</span>{p.castName}</span>
              <span className="nox-pending-l2"><span className="num">¥{p.amount.toLocaleString("en-US")}</span><Link href={`/payroll?store=${storeId}#attention`} className="nox-link" style={{ fontSize: 12 }}>給与の要対応へ ›</Link></span>
            </li>
          ))}
          {data.missingOut.map((m) => (
            <li key={`${m.castId}:${m.bizDate}`} className="nox-pending-row" data-pending-missing={`${m.castId}:${m.bizDate}`}>
              <span className="nox-pending-l1"><span className="nox-stpill" style={{ marginRight: 6 }}>退勤記録なし</span>{m.castName}</span>
              <span className="nox-pending-l2"><span className="num">{Number(m.bizDate.slice(5, 7))}/{Number(m.bizDate.slice(8, 10))}</span><Link href={`/payroll?tab=attendance&store=${storeId}&period=${m.bizDate.slice(0, 7)}&cast=${m.castId}`} className="nox-link" style={{ fontSize: 12 }}>勤怠のその行へ ›</Link></span>
            </li>
          ))}
        </ul>
      )}
      {data && none && <p style={{ ...t.sub, margin: "4px 0 0" }} data-pending-none="1">要承認なし</p>}
    </section>
  );
}
