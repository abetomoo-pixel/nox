"use client";

// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: 運営の問い合わせ 1 件の画面。返事（受付は確認中に）・状態（見送りは理由が要る）・ポイント（不具合 1〜3・要望 1〜5・1 件に 1 回）・取り消し（理由が要る）・
//   2 店舗目の依頼は「店を追加」（依頼の中身を初期値に・押すと依頼は対応済み＝店の側に運営の 1 行）。ボタンは中央・結果の文は押したボタンの近く・保存の後は読み直す。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import AddStorePanel from "../../orgs/[id]/add-store-panel";
import { STORE_COPY_LABEL, type StoreCopyPart } from "@/lib/nox/ops/store-add";
import {
  INQUIRY_BIZ_LABEL, INQUIRY_BODY_MAX, INQUIRY_KIND_LABEL, INQUIRY_NOTE_MAX, INQUIRY_START_LABEL, INQUIRY_STATUSES, INQUIRY_STATUS_LABEL,
  inquiryAtOf, inquiryNoOf, inquiryPointMaxOf, opsInquiryMailLogOf, pointsBalanceOf, pointsDisplayOf, type InquiryKind, type InquiryStart, type InquiryStatus,
} from "@/lib/nox/inquiry/labels";

export type OpsInquiry = { id: string; org_id: string; store_id: string; kind: string; subject: string; status: string; status_at: string; created_role: string; store_add: { name?: string; biz_type?: string; copy_from?: string | null; parts?: string[]; start?: string } | null; added_store_id: string | null; last_from: string; last_at: string; store_read_at: string | null; created_at: string };
export type OpsInquiryMsg = { id: string; from_ops: boolean; body: string; created_at: string; who?: string };
export type OpsPointRow = { id: string; inquiry_id: string | null; kind: string; delta: number; reason: string | null; ops_user_id: string; created_at: string; who?: string };
const uuid = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, "0").slice(-8)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

/** ★相談役 11/26 の便 M2-5: 運営者あてのお知らせメールの記録（ops_audit_logs の ops.inquiry.mail・宛先の運営者ごとに 1 行） */
export type OpsInquiryMailRow = { id: string; at: string; who: string; after: Record<string, unknown> };

export default function OpsInquiryDetail({ row, orgName, isDemo, stores, messages, points, mails = [] }: { row: OpsInquiry; orgName: string; isDemo: boolean; stores: { id: string; name: string; setupDone: boolean; biz?: string | null }[]; messages: OpsInquiryMsg[]; points: OpsPointRow[]; mails?: OpsInquiryMailRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ at: string; ok: boolean; text: string } | null>(null);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState(uuid);
  const [status, setStatus] = useState<string>(row.status);
  const [statusReason, setStatusReason] = useState("");
  const [pt, setPt] = useState(1);
  const [ptReason, setPtReason] = useState("");
  const [rvReason, setRvReason] = useState("");
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const mine = points.filter((p) => p.inquiry_id === row.id);
  const granted = mine.find((p) => p.kind === "grant") ?? null;
  const revoked = mine.some((p) => p.kind === "revoke");
  const max = inquiryPointMaxOf(row.kind);
  const bal = pointsDisplayOf(pointsBalanceOf(points));
  async function post(at: string, body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(at); setOut(null);
    const r = await fetch(`/api/ops/inquiries/${row.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) { setOut({ at, ok: false, text: j.error ?? "うまくいきませんでした" }); return false; }
    setOut({ at, ok: true, text: okText });
    router.refresh();
    return true;
  }
  const msgAt = (at: string) => out && out.at === at && <div style={{ marginTop: 6 }} data-ops-msg={at}><Message kind={out.ok ? "success" : "error"}>{out.text}</Message></div>;
  const sec: React.CSSProperties = { ...t.card, marginBottom: 12 };
  const h2: React.CSSProperties = { ...t.cardTitle, margin: "0 0 8px" };
  const sa = row.store_add;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }} data-ops-inquiry={row.id}>
      <p style={{ margin: "0 0 6px", fontSize: 12.5 }}><Link href="/ops/inquiries" className="nox-link">‹ 問い合わせの一覧</Link></p>
      <h1 style={{ fontSize: 18, margin: "0 0 4px", overflowWrap: "anywhere" }}>{row.subject}</h1>
      <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 12px" }}>
        <Link href={`/ops/orgs/${row.org_id}`} className="nox-link">{orgName}</Link>・{storeName.get(row.store_id) ?? "—"}・{INQUIRY_KIND_LABEL[row.kind as InquiryKind] ?? row.kind}・{INQUIRY_STATUS_LABEL[row.status as InquiryStatus] ?? row.status}・番号 {inquiryNoOf(row.id)}・送った人 {row.created_role === "owner" ? "オーナー" : "店長"}
      </p>

      {row.kind === "store_add" && sa && (
        <section style={sec} aria-label="店舗の追加の依頼" data-ops-inquiry-store-add={row.added_store_id ? "added" : "open"}>
          <h2 style={h2}>店舗の追加の依頼</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: 0, fontSize: 13 }}>
            <dt style={t.sub}>店名</dt><dd style={{ margin: 0 }}>{sa.name ?? "—"}</dd>
            <dt style={t.sub}>業態</dt><dd style={{ margin: 0 }}>{INQUIRY_BIZ_LABEL[sa.biz_type ?? ""] ?? "—"}</dd>
            <dt style={t.sub}>設定を写す元の店</dt><dd style={{ margin: 0 }}>{sa.copy_from ? storeName.get(sa.copy_from) ?? "—" : "写さない"}</dd>
            {(sa.parts?.length ?? 0) > 0 && <><dt style={t.sub}>写すもの</dt><dd style={{ margin: 0 }}>{(sa.parts ?? []).map((p) => STORE_COPY_LABEL[p as StoreCopyPart]?.name ?? p).join("・")}</dd></>}
            <dt style={t.sub}>始めたい時期</dt><dd style={{ margin: 0 }}>{INQUIRY_START_LABEL[(sa.start ?? "") as InquiryStart] ?? "—"}</dd>
          </dl>
          {row.added_store_id ? <div style={{ marginTop: 10 }}><Message kind="success">店を足しました（{storeName.get(row.added_store_id) ?? "—"}・初期設定の前）</Message></div>
            : row.status === "declined" ? <div style={{ marginTop: 10 }}><Message kind="info">見送りにした依頼です</Message></div>
            : isDemo ? <div style={{ marginTop: 10 }}><Message kind="error">デモの会社には足せません</Message></div>
            : <div style={{ marginTop: 10 }}><AddStorePanel orgId={row.org_id} stores={stores} inquiryId={row.id} initial={{ name: sa.name ?? "", biz: sa.biz_type ?? "", from: sa.copy_from ?? null, parts: sa.parts ?? [] }} /></div>}
        </section>
      )}

      <section style={sec} aria-label="やりとり">
        <h2 style={h2}>やりとり</h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {messages.map((m) => (
            <li key={m.id} data-ops-inquiry-msg={m.from_ops ? "ops" : "store"} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", ...(m.from_ops ? { borderColor: "var(--primary)" } : {}) }}>
              <div style={{ ...t.sub, fontSize: 11.5, marginBottom: 2 }}>{m.from_ops ? `運営（${m.who ?? "運営"}）` : "店"}・{inquiryAtOf(m.created_at)}</div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
            </li>
          ))}
        </ul>
        <p style={{ ...t.sub, fontSize: 11.5, margin: "8px 0 0" }}>店が既読にした時刻：{row.store_read_at ? inquiryAtOf(row.store_read_at) : "—"}</p>
        <label style={{ display: "grid", gap: 4, marginTop: 10 }}><span style={t.fieldLabel}>返事（{INQUIRY_BODY_MAX} 字まで・受付なら確認中になります）</span>
          <textarea value={reply} maxLength={INQUIRY_BODY_MAX} rows={4} onChange={(e) => setReply(e.target.value)} style={{ ...t.input, width: "100%", boxSizing: "border-box", resize: "vertical" }} data-ops-inquiry-reply-text="1" />
        </label>
        <div className="nox-actions" style={{ marginTop: 8 }}>
          <button type="button" style={t.btnGold} disabled={!!busy || reply.trim().length === 0} data-ops-inquiry-reply="1"
            onClick={async () => { if (await post("reply", { action: "reply", body: reply, idemKey: replyKey }, "返事を送りました（店の要承認に届きます）")) { setReply(""); setReplyKey(uuid()); } }}>{busy === "reply" ? "送信中…" : "返事を送る"}</button>
        </div>
        {msgAt("reply")}
      </section>

      <section style={sec} aria-label="状態">
        <h2 style={h2}>状態</h2>
        <div className="nox-seg" role="group" aria-label="状態" style={{ flexWrap: "wrap" }}>
          {INQUIRY_STATUSES.map((s) => <button key={s} type="button" className={status === s ? "on" : ""} aria-pressed={status === s} onClick={() => setStatus(s)}>{INQUIRY_STATUS_LABEL[s]}</button>)}
        </div>
        <label style={{ display: "grid", gap: 4, marginTop: 8 }}><span style={t.fieldLabel}>理由（見送りは必ず・{INQUIRY_NOTE_MAX} 字まで・見送りの理由は運営の返事として店にも見えます）</span>
          <input value={statusReason} maxLength={INQUIRY_NOTE_MAX} onChange={(e) => setStatusReason(e.target.value)} style={t.input} />
        </label>
        <p style={{ ...t.sub, fontSize: 11.5, margin: "4px 0 0" }}>対応済み・見送りにすると、店は返事できなくなります（続きは新しく送る）。</p>
        <div className="nox-actions" style={{ marginTop: 8 }}>
          <button type="button" style={t.btnGold} disabled={!!busy || status === row.status || (status === "declined" && statusReason.trim().length === 0)} data-ops-inquiry-status="1"
            onClick={() => void post("status", { action: "status", status, reason: statusReason }, `状態を「${INQUIRY_STATUS_LABEL[status as InquiryStatus]}」にしました`)}>{busy === "status" ? "保存中…" : "状態を保存"}</button>
        </div>
        {msgAt("status")}
      </section>

      <section style={sec} aria-label="ポイント" data-ops-inquiry-points={granted ? (revoked ? "revoked" : "granted") : "none"}>
        <h2 style={h2}>ポイント（会社の残り {bal.text}）</h2>
        {max === 0 ? <p style={{ ...t.sub, fontSize: 12.5, margin: 0 }}>質問と店舗の追加の依頼にはポイントを付けません。</p> : !granted ? (
          isDemo ? <Message kind="error">デモの会社には付けられません</Message> : (
            <>
              <div className="nox-seg" role="group" aria-label="ポイントの数" style={{ flexWrap: "wrap" }}>
                {Array.from({ length: max }, (_, i) => i + 1).map((n) => <button key={n} type="button" className={pt === n ? "on" : ""} aria-pressed={pt === n} onClick={() => setPt(n)}>{n}pt</button>)}
              </div>
              <label style={{ display: "grid", gap: 4, marginTop: 8 }}><span style={t.fieldLabel}>理由（任意・{INQUIRY_NOTE_MAX} 字まで）</span><input value={ptReason} maxLength={INQUIRY_NOTE_MAX} onChange={(e) => setPtReason(e.target.value)} style={t.input} /></label>
              <p style={{ ...t.sub, fontSize: 11.5, margin: "4px 0 0" }}>付けられるのは 1 件に 1 回です（{INQUIRY_KIND_LABEL[row.kind as InquiryKind]}は 1〜{max}pt）。</p>
              <div className="nox-actions" style={{ marginTop: 8 }}>
                <button type="button" style={t.btnGold} disabled={!!busy || pt < 1 || pt > max} data-ops-inquiry-grant="1"
                  onClick={() => { if (window.confirm(`${pt}pt を付けます。付けられるのは 1 回です。よろしいですか`)) void post("points", { action: "points", points: pt, reason: ptReason }, `${pt}pt を付けました`); }}>{busy === "points" ? "保存中…" : "ポイントを付ける"}</button>
              </div>
            </>)
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13 }}>+{granted.delta}pt（{inquiryAtOf(granted.created_at)}・{granted.who ?? "運営"}{granted.reason ? `・${granted.reason}` : ""}）{revoked ? "＝取り消し済み" : ""}</p>
            {!revoked && (
              <>
                <label style={{ display: "grid", gap: 4, marginTop: 8 }}><span style={t.fieldLabel}>取り消しの理由（必ず・{INQUIRY_NOTE_MAX} 字まで）</span><input value={rvReason} maxLength={INQUIRY_NOTE_MAX} onChange={(e) => setRvReason(e.target.value)} style={t.input} /></label>
                <div className="nox-actions" style={{ marginTop: 8 }}>
                  <button type="button" style={t.btnGhost} disabled={!!busy || rvReason.trim().length === 0} data-ops-inquiry-revoke="1"
                    onClick={() => { if (window.confirm("ポイントを取り消します。付け直せません。よろしいですか")) void post("revoke", { action: "revoke", reason: rvReason }, "ポイントを取り消しました"); }}>{busy === "revoke" ? "保存中…" : "ポイントを取り消す"}</button>
                </div>
              </>)}
          </>
        )}
        {msgAt("points")}{msgAt("revoke")}
        {points.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 12.5 }}>この会社のポイントの履歴（{points.length} 件）</summary>
            <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4, fontSize: 12 }}>
              {points.map((p) => <li key={p.id} style={t.sub}>{inquiryAtOf(p.created_at)}　{p.delta > 0 ? `+${p.delta}` : p.delta}pt　{p.kind === "grant" ? "付与" : "取り消し"}　{p.who ?? "運営"}{p.reason ? `　${p.reason}` : ""}{p.inquiry_id ? <>　<Link href={`/ops/inquiries/${p.inquiry_id}`} className="nox-link">{inquiryNoOf(p.inquiry_id)}</Link></> : null}</li>)}
            </ul>
          </details>
        )}
      </section>

      {mails.length > 0 && (/* ★M2-5: 店からの新しい問い合わせ・返事を運営者へ知らせたメールの記録 */
        <details style={{ ...sec, marginBottom: 0 }} data-ops-inquiry-mails={mails.length}>
          <summary style={{ cursor: "pointer", fontSize: 12.5 }}>お知らせメールの記録（{mails.length} 件）</summary>
          <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4, fontSize: 12 }}>
            {mails.map((m) => <li key={m.id} style={t.sub}>{inquiryAtOf(m.at)}　{m.who}　{opsInquiryMailLogOf(m.after)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
