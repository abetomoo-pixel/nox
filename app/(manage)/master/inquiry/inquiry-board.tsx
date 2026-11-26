"use client";

// ★0212（窓口の段 1・相談役 11/25 の決め【D7】）: 店の側の問い合わせの画面（送る・一覧・やりとり・返事）。
//   送れるのはオーナーと店長（2 店舗目の依頼はオーナーだけ）・ポイントはオーナーだけに見せる（会社ごと・「7pt／10pt」）・添付は作らない（写しは support@noxapp.jp へ）。
//   対応済みと見送りには返事できない（新しく送る）。開くと運営の返事を既読に（inquiry_mark_read）。真の防御は RPC と RLS。
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import MasterPageHead from "../master-page-head";
import { STORE_COPY_LABEL, STORE_COPY_NEVER, STORE_COPY_PARTS, type StoreCopyPart } from "@/lib/nox/ops/store-add";
import {
  INQUIRY_BIZ, INQUIRY_BIZ_LABEL, INQUIRY_BODY_MAX, INQUIRY_CLOSED_NOTE, INQUIRY_DEMO_NOTE, INQUIRY_KIND_LABEL, INQUIRY_NOTE_MAX, INQUIRY_START, INQUIRY_START_LABEL, INQUIRY_STATUS_LABEL, INQUIRY_SUBJECT_MAX,
  STORE_ADD_PRICE_NOTE, inquiryAtOf, inquiryAttachNoteOf, inquiryClosedOf, inquiryErrJa, inquiryFormErrOf, inquiryKindsFor, inquiryNoOf, inquiryPointTagOf, inquiryUnreadOf, pointsBalanceOf, pointsDisplayOf, storeAddAskErrOf,
  type InquiryKind, type InquiryStart, type InquiryStatus,
} from "@/lib/nox/inquiry/labels";

export type InquiryRow = { id: string; store_id: string; kind: string; subject: string; status: string; status_at: string; created_role: string; store_add: { name?: string; biz_type?: string; copy_from?: string | null; parts?: string[]; start?: string } | null; added_store_id: string | null; last_from: string; last_at: string; store_read_at: string | null; created_at: string };
export type InquiryMsg = { id: string; inquiry_id: string; from_ops: boolean; body: string; created_at: string };
type StoreRow = { id: string; name: string; setupDone: boolean };
const uuid = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, "0").slice(-8)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

export default function InquiryBoard({ role, isDemo, storeId, stores, rows, messages, points, openId, startKind }: {
  role: string | null; isDemo: boolean; storeId: string | null; stores: StoreRow[]; rows: InquiryRow[]; messages: InquiryMsg[];
  /** オーナーだけ（店長は null＝出さない） */ points: { inquiry_id: string | null; kind: string; delta: number }[] | null; openId: string | null; startKind: "store_add" | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const kinds = inquiryKindsFor(role);
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const ready = stores.filter((s) => s.setupDone);
  // ── 送る ──
  const [kind, setKind] = useState<InquiryKind>(startKind ?? "request");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saName, setSaName] = useState("");
  const [saBiz, setSaBiz] = useState("");
  const [saFrom, setSaFrom] = useState(ready[0]?.id ?? "");
  const [saParts, setSaParts] = useState<StoreCopyPart[]>([...STORE_COPY_PARTS]);
  const [saStart, setSaStart] = useState<InquiryStart | "">("");
  const [idemKey, setIdemKey] = useState(uuid);
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ at: string; ok: boolean; text: string } | null>(null);
  const storeAdd = kind === "store_add";
  const whyNot = storeAdd
    ? storeAddAskErrOf({ name: saName, biz_type: saBiz, copy_from: saFrom || null, parts: saFrom ? saParts : [], start: saStart, note: body, storeNames: stores.map((s) => s.name) })
    : inquiryFormErrOf({ kind, subject, body });
  async function send() {
    if (whyNot || !storeId) return;
    setBusy("send"); setOut(null);
    const payload = storeAdd
      ? { kind, storeId, idemKey, subject: "", body: body.trim(), storeAdd: { name: saName.trim(), biz_type: saBiz, copy_from: saFrom || null, parts: saFrom ? saParts : [], start: saStart } }
      : { kind, storeId, idemKey, subject: subject.trim(), body: body.trim() };
    const r = await fetch("/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
    setBusy(null);
    if (!r.ok || !j.id) { setOut({ at: "send", ok: false, text: j.error ?? "送れませんでした" }); return; }
    setOut({ at: "send", ok: true, text: `送りました（番号 ${inquiryNoOf(j.id)}）。運営の返事は要承認（🔔）に届きます。` });
    setSubject(""); setBody(""); setSaName(""); setSaBiz(""); setSaStart(""); setIdemKey(uuid());
    setOpen(j.id);
    router.refresh();
  }
  // ── 一覧とやりとり ──
  const [open, setOpen] = useState<string | null>(openId);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState(uuid);
  const cur = rows.find((r) => r.id === open) ?? null;
  const thread = cur ? messages.filter((m) => m.inquiry_id === cur.id) : [];
  const pointRows = (id: string) => (points ?? []).filter((p) => p.inquiry_id === id);
  async function openRow(r: InquiryRow) {
    setOpen(r.id); setReply(""); setReplyKey(uuid()); setOut(null);
    if (inquiryUnreadOf(r)) {
      const { error } = await supabase.rpc("inquiry_mark_read", { p_inquiry: r.id });
      if (!error) router.refresh();
    }
  }
  async function sendReply() {
    if (!cur) return;
    const v = reply.trim();
    if (v.length < 1 || v.length > INQUIRY_BODY_MAX) { setOut({ at: "reply", ok: false, text: `返事は 1〜${INQUIRY_BODY_MAX} 字です` }); return; }
    setBusy("reply"); setOut(null);
    // ★F1（相談役 11/25）: 返事も route を通す（返事の後に運営へメール）
    const res = await fetch("/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reply", inquiryId: cur.id, body: v, idemKey: replyKey }) }).catch(() => null);
    const j = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string };
    setBusy(null);
    if (!res || !res.ok || !j.ok) { setOut({ at: "reply", ok: false, text: j.error ?? inquiryErrJa("") }); return; }
    setOut({ at: "reply", ok: true, text: "返事を送りました" }); setReply(""); setReplyKey(uuid());
    router.refresh();
  }
  const pts = points ? pointsDisplayOf(pointsBalanceOf(points)) : null;
  const ptsText = pts ? pts.text : "";
  const msgAt = (at: string) => out && out.at === at && <div style={{ marginTop: 6 }}><Message kind={out.ok ? "success" : "error"}>{out.text}</Message></div>;
  const sec: React.CSSProperties = { ...t.card, marginBottom: 12 };

  return (
    <div data-inquiry-board="1">
      <MasterPageHead title="運営への問い合わせ" count={rows.length} desc="要望・不具合・質問を NOX の運営に送れます。運営の返事は要承認（🔔）に届きます。" />
      {pts && <p style={{ margin: "0 0 12px", fontSize: 14 }} data-inquiry-points={pts.now}>ポイント <b className="num">{ptsText}</b></p>}{/* オーナーだけ・区切りの意味の文は段 1 では出さない */}

      {isDemo ? <div style={{ marginBottom: 12 }}><Message kind="warn">{INQUIRY_DEMO_NOTE}</Message></div> : (
        <section style={sec} aria-label="新しく送る" data-inquiry-form={kind}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 8px" }}>新しく送る</h2>
          <div className="nox-seg" role="group" aria-label="種類" style={{ flexWrap: "wrap", marginBottom: 10 }}>
            {kinds.map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)} data-inquiry-kind={k}>{INQUIRY_KIND_LABEL[k]}</button>)}
          </div>
          {!storeAdd ? (
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>件名（{INQUIRY_SUBJECT_MAX} 字まで）</span><input value={subject} maxLength={INQUIRY_SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} style={t.input} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>内容（{INQUIRY_BODY_MAX} 字まで）</span><textarea value={body} maxLength={INQUIRY_BODY_MAX} rows={5} onChange={(e) => setBody(e.target.value)} style={{ ...t.input, width: "100%", boxSizing: "border-box", resize: "vertical" }} /></label>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }} data-inquiry-store-add="1">
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>店名（40 字まで）</span><input value={saName} maxLength={40} onChange={(e) => setSaName(e.target.value)} style={t.input} /></label>
              <div style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>業態</span>
                <div className="nox-seg" role="group" aria-label="業態" style={{ flexWrap: "wrap" }}>{INQUIRY_BIZ.map(([k, l]) => <button key={k} type="button" className={saBiz === k ? "on" : ""} aria-pressed={saBiz === k} onClick={() => setSaBiz(k)}>{l}</button>)}</div>
              </div>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>設定を写す元の店（初期設定が済んだ店）</span>
                <select value={saFrom} onChange={(e) => setSaFrom(e.target.value)} style={t.input}><option value="">写さない</option>{ready.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              {saFrom && (
                <div style={{ display: "grid", gap: 6 }}>
                  {STORE_COPY_PARTS.map((p) => (
                    <label key={p} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                      <input type="checkbox" checked={saParts.includes(p)} onChange={() => setSaParts((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]))} style={{ marginTop: 3 }} />
                      <span><b>{STORE_COPY_LABEL[p].name}</b><span style={{ display: "block", color: "var(--sub)", fontSize: 11.5 }}>{STORE_COPY_LABEL[p].what}</span></span>
                    </label>))}
                  <p style={{ ...t.sub, fontSize: 11.5, margin: 0 }}>{STORE_COPY_NEVER}</p>
                </div>
              )}
              <div style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>始めたい時期</span>
                <div className="nox-seg" role="group" aria-label="始めたい時期" style={{ flexWrap: "wrap" }}>{INQUIRY_START.map((k) => <button key={k} type="button" className={saStart === k ? "on" : ""} aria-pressed={saStart === k} onClick={() => setSaStart(k)}>{INQUIRY_START_LABEL[k]}</button>)}</div>
              </div>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>ひとこと（任意・{INQUIRY_NOTE_MAX} 字まで）</span><textarea value={body} maxLength={INQUIRY_NOTE_MAX} rows={2} onChange={(e) => setBody(e.target.value)} style={{ ...t.input, width: "100%", boxSizing: "border-box", resize: "vertical" }} /></label>
              <p style={{ margin: 0, fontSize: 13 }} data-inquiry-price-note="1">{STORE_ADD_PRICE_NOTE}</p>
            </div>
          )}
          <p style={{ ...t.sub, fontSize: 12, margin: "8px 0 0" }} data-inquiry-attach-note="1">{inquiryAttachNoteOf(null)}</p>
          <div className="nox-actions" style={{ marginTop: 10 }}><button type="button" style={t.btnGold} disabled={busy === "send" || !!whyNot || !storeId} onClick={() => void send()} data-inquiry-send="1">{busy === "send" ? "送信中…" : "送る"}</button></div>
          {whyNot && busy !== "send" && <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0", textAlign: "center" }} data-inquiry-why="1">{whyNot}</p>}
          {msgAt("send")}
        </section>
      )}

      <section style={sec} aria-label="送った問い合わせ">
        <h2 style={{ ...t.cardTitle, margin: "0 0 8px" }}>送った問い合わせ</h2>
        {rows.length === 0 ? <p style={{ ...t.sub, fontSize: 12.5, margin: 0 }}>まだありません</p> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {rows.map((r) => {
              const tag = points ? inquiryPointTagOf(pointRows(r.id)) : null;
              const unread = inquiryUnreadOf(r);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => void openRow(r)} aria-expanded={open === r.id} data-inquiry-row={r.id} data-inquiry-unread={unread ? "1" : "0"}
                    style={{ ...t.btnGhost, width: "100%", textAlign: "left", display: "grid", gap: 2, padding: "8px 10px", ...(open === r.id ? { borderColor: "var(--primary)" } : {}) }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                      <span className="nox-stpill">{INQUIRY_STATUS_LABEL[r.status as InquiryStatus] ?? r.status}</span>
                      <span className="nox-stpill">{INQUIRY_KIND_LABEL[r.kind as InquiryKind] ?? r.kind}</span>
                      {unread && <span className="nox-stpill warn" data-inquiry-unread-mark="1">運営から返事</span>}
                      {tag && <span className="nox-stpill ok">{tag}</span>}
                      <b style={{ overflowWrap: "anywhere" }}>{r.subject}</b>
                    </span>
                    <span style={{ ...t.sub, fontSize: 11.5 }}>{storeName.get(r.store_id) ?? "—"}・番号 {inquiryNoOf(r.id)}・最後 {inquiryAtOf(r.last_at)}（{r.last_from === "ops" ? "運営" : "店"}）</span>
                  </button>
                </li>);
            })}
          </ul>
        )}
      </section>

      {cur && (
        <section style={sec} aria-label="やりとり" data-inquiry-thread={cur.id}>
          <h2 style={{ ...t.cardTitle, margin: "0 0 4px", overflowWrap: "anywhere" }}>{cur.subject}</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "0 0 8px" }}>{INQUIRY_KIND_LABEL[cur.kind as InquiryKind] ?? cur.kind}・{INQUIRY_STATUS_LABEL[cur.status as InquiryStatus] ?? cur.status}・番号 {inquiryNoOf(cur.id)}</p>
          {cur.kind === "store_add" && cur.store_add && (
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: "0 0 10px", fontSize: 13 }} data-inquiry-store-add-detail="1">
              <dt style={t.sub}>店名</dt><dd style={{ margin: 0 }}>{cur.store_add.name ?? "—"}</dd>
              <dt style={t.sub}>業態</dt><dd style={{ margin: 0 }}>{INQUIRY_BIZ_LABEL[cur.store_add.biz_type ?? ""] ?? "—"}</dd>
              <dt style={t.sub}>設定を写す元の店</dt><dd style={{ margin: 0 }}>{cur.store_add.copy_from ? storeName.get(cur.store_add.copy_from) ?? "—" : "写さない"}</dd>
              {(cur.store_add.parts?.length ?? 0) > 0 && <><dt style={t.sub}>写すもの</dt><dd style={{ margin: 0 }}>{(cur.store_add.parts ?? []).map((p) => STORE_COPY_LABEL[p as StoreCopyPart]?.name ?? p).join("・")}</dd></>}
              <dt style={t.sub}>始めたい時期</dt><dd style={{ margin: 0 }}>{INQUIRY_START_LABEL[(cur.store_add.start ?? "") as InquiryStart] ?? "—"}</dd>
            </dl>
          )}
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {thread.map((m) => (
              <li key={m.id} data-inquiry-msg={m.from_ops ? "ops" : "store"} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", ...(m.from_ops ? { borderColor: "var(--primary)" } : {}) }}>
                <div style={{ ...t.sub, fontSize: 11.5, marginBottom: 2 }}>{m.from_ops ? "運営" : "店"}・{inquiryAtOf(m.created_at)}</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
              </li>
            ))}
          </ul>
          <p style={{ ...t.sub, fontSize: 12, margin: "8px 0 0" }}>{inquiryAttachNoteOf(cur.id)}</p>
          {inquiryClosedOf(cur.status) || isDemo ? <div style={{ marginTop: 8 }}><Message kind="info">{isDemo ? INQUIRY_DEMO_NOTE : INQUIRY_CLOSED_NOTE}</Message></div> : (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>返事（{INQUIRY_BODY_MAX} 字まで）</span>
                <textarea value={reply} maxLength={INQUIRY_BODY_MAX} rows={3} onChange={(e) => setReply(e.target.value)} style={{ ...t.input, width: "100%", boxSizing: "border-box", resize: "vertical" }} data-inquiry-reply-text="1" />
              </label>
              <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={t.btnGold} disabled={busy === "reply" || reply.trim().length === 0} onClick={() => void sendReply()} data-inquiry-reply="1">{busy === "reply" ? "送信中…" : "返事を送る"}</button></div>
            </div>
          )}
          {msgAt("reply")}
        </section>
      )}
    </div>
  );
}
