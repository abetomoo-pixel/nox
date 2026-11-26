"use client";

// ★0203（2 号店の段 1・相談役 21:40 の ■2-a・b）: 運営コンソール＝会社に店を足す（業態・写し元・写すもの）。旗の後ろ（出すかは page が決める）。
//   足した店は初期設定の前。写すものは 2 店目の初期設定の下書きに入れるだけ＝確定はオーナーが 2 店目の /setup で行う（今の代行と同じ形）。
// ★相談役 11/26 の便 M2-2・M2-3・M2-6: 業態の初めの値＝依頼の中身・無ければ設定を写す元の店の業態（業態をまだ自分で選んでいなければ、写す元の店を替えると追う）。
//   足りない欄はその欄の横に赤で 1 行（ボタンの近くの理由の 1 行も赤）・欄の枠も赤。語は「同じ会社に店を足します」。
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { addStoreBlockedOf, addStoreFieldErrsOf, addStoreInitialBizOf, OPS_ERR_BORDER, OPS_ERR_TEXT_STYLE } from "@/lib/nox/ops/view"; // ★起票153・M2
import { STORE_COPY_LABEL, STORE_COPY_NEVER, STORE_COPY_PARTS, type StoreCopyPart } from "@/lib/nox/ops/store-add";

const BIZ: ReadonlyArray<readonly [string, string]> = [["cabaret", "キャバクラ"], ["girlsbar", "ガールズバー"], ["snack", "スナック"], ["lounge", "ラウンジ"], ["bar", "バー"], ["host", "ホストクラブ"]];
export type AddStoreSrc = { id: string; name: string; setupDone: boolean; /** ★M2-3: 店の業態（stores.settings_json.biz_type・無ければ null） */ biz?: string | null };

export default function AddStorePanel({ orgId, stores, initial, inquiryId }: { orgId: string; stores: AddStoreSrc[]; /** ★0212: 店舗の追加の依頼の中身を初期値に（運営は直してから押せる） */ initial?: { name: string; biz: string; from: string | null; parts: string[] } | null; /** ★0212: 依頼から足す（ops_inquiry_store_add＝2 回押しても店は 1 つ・依頼は対応済みに） */ inquiryId?: string | null }) {
  const router = useRouter();
  const ready = stores.filter((s) => s.setupDone);
  const bizOfStore = (id: string): string | null => ready.find((s) => s.id === id)?.biz ?? null;
  const initialFrom = initial ? (initial.from && ready.some((s) => s.id === initial.from) ? initial.from : "") : ready[0]?.id ?? "";
  const [name, setName] = useState(initial?.name ?? "");
  const [biz, setBiz] = useState(() => addStoreInitialBizOf({ requested: initial?.biz ?? null, fromBiz: initialFrom ? bizOfStore(initialFrom) : null }));
  const [bizTouched, setBizTouched] = useState(false);
  const [from, setFrom] = useState(initialFrom);
  const [parts, setParts] = useState<StoreCopyPart[]>(initial ? STORE_COPY_PARTS.filter((p) => initial.parts.includes(p)) : [...STORE_COPY_PARTS]);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const blocked = addStoreBlockedOf({ name, biz, from, parts: parts.length }); // ★起票153: 押せない理由（無ければ null）＝前と同じ条件
  const fe = addStoreFieldErrsOf({ name, biz, from, parts: parts.length }); // ★M2-3: 欄ごとの文
  const toggle = (p: StoreCopyPart) => setParts((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const pickFrom = (v: string) => { setFrom(v); if (!bizTouched && !initial?.biz) { const b = v ? bizOfStore(v) : null; if (b) setBiz(addStoreInitialBizOf({ fromBiz: b })); } };
  async function add() {
    setBusy(true); setOut(null);
    const r = inquiryId
      ? await fetch(`/api/ops/inquiries/${inquiryId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "store_add", name: name.trim(), bizType: biz, copyFrom: from || null, parts: from ? parts : [] }) }) // ★0212
      : await fetch(`/api/ops/orgs/${orgId}/stores`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), bizType: biz, copyFrom: from || null, parts: from ? parts : [] }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) { setOut({ ok: false, text: j.error ?? "店を足せませんでした" }); return; }
    setOut({ ok: true, text: `${name.trim()} を足しました（初期設定の前）。オーナーが足した店の初期設定で確定します。` }); setName(""); router.refresh();
  }
  const errLine = (msg: string | null, key: string) => (msg ? <div data-ops-add-store-field-err={key}><Message kind="error" style={{ margin: "4px 0 0" }}>{msg}</Message></div> : null) /* ★M2-2／M2-3: 欄のそばの不足は赤・共通の部品（verify:nox-messages） */;
  return (
    <section style={{ ...t.card, display: "grid", gap: 10 }} aria-label="店を追加" data-ops-add-store="1">
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>店を追加</h2>
      <p style={{ ...t.sub, fontSize: 12, margin: 0, lineHeight: 1.7 }}>同じ会社に店を足します。足した店は初期設定の前です。給与の締め日は月末です。支払日は店ごとに決められます（足した店は 1 店目と同じ日から始まり、あとで店の設定で変えられます）。</p>
      <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>店名</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} style={{ ...t.input, ...(fe.name ? { borderColor: OPS_ERR_BORDER } : {}) }} aria-invalid={!!fe.name} />
        {errLine(fe.name, "name")}</label>
      <div style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>業態</span>
        <div className="nox-seg" role="group" aria-label="業態" style={{ flexWrap: "wrap", ...(fe.biz ? { borderColor: OPS_ERR_BORDER } : {}) }} data-ops-add-store-biz={biz || "none"}>{BIZ.map(([k, l]) => <button key={k} type="button" className={biz === k ? "on" : ""} aria-pressed={biz === k} onClick={() => { setBiz(k); setBizTouched(true); }}>{l}</button>)}</div>
        {errLine(fe.biz, "biz")}
      </div>
      <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>設定を写す元の店（初期設定が済んだ店）</span>
        <select value={from} onChange={(e) => pickFrom(e.target.value)} style={t.input}><option value="">写さない</option>{ready.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </label>
      {from && (
        <div style={{ display: "grid", gap: 6 }} data-ops-copy-parts="1">
          {STORE_COPY_PARTS.map((p) => (
            <label key={p} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input type="checkbox" checked={parts.includes(p)} onChange={() => toggle(p)} style={{ marginTop: 3 }} />
              <span><b>{STORE_COPY_LABEL[p].name}</b><span style={{ display: "block", color: "var(--sub)", fontSize: 11.5 }}>{STORE_COPY_LABEL[p].what}</span></span>
            </label>))}
          {errLine(fe.parts, "parts")}
          <p style={{ ...t.sub, fontSize: 11.5, margin: 0 }}>{STORE_COPY_NEVER}写した後は店ごとに別々です。</p>
        </div>
      )}
      <div className="nox-actions"><button type="button" style={t.btnGold} disabled={busy || !!blocked} onClick={() => void add()} data-ops-add-store-btn="1">{busy ? "足しています…" : "店を追加"}</button></div>
      {blocked && !busy && <p style={{ ...OPS_ERR_TEXT_STYLE, textAlign: "center" }} data-ops-add-store-why="1">{blocked}</p>}{/* ★起票153（2026-11-24）: 押せない理由をボタンの近くに 1 行（★M2-2: 赤） */}
      {out && <Message kind={out.ok ? "success" : "error"}>{out.text}</Message>}
    </section>
  );
}
