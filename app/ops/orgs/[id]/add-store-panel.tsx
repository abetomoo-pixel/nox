"use client";

// ★0203（2 号店の段 1・相談役 21:40 の ■2-a・b）: 運営コンソール＝会社に店を足す（業態・写し元・写すもの）。旗の後ろ（出すかは page が決める）。
//   足した店は初期設定の前。写すものは 2 店目の初期設定の下書きに入れるだけ＝確定はオーナーが 2 店目の /setup で行う（今の代行と同じ形）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { STORE_COPY_LABEL, STORE_COPY_NEVER, STORE_COPY_PARTS, type StoreCopyPart } from "@/lib/nox/ops/store-add";

const BIZ: ReadonlyArray<readonly [string, string]> = [["cabaret", "キャバクラ"], ["girlsbar", "ガールズバー"], ["snack", "スナック"], ["lounge", "ラウンジ"], ["bar", "バー"], ["host", "ホストクラブ"]];

export default function AddStorePanel({ orgId, stores }: { orgId: string; stores: { id: string; name: string; setupDone: boolean }[] }) {
  const router = useRouter();
  const ready = stores.filter((s) => s.setupDone);
  const [name, setName] = useState("");
  const [biz, setBiz] = useState("");
  const [from, setFrom] = useState(ready[0]?.id ?? "");
  const [parts, setParts] = useState<StoreCopyPart[]>([...STORE_COPY_PARTS]);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (p: StoreCopyPart) => setParts((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  async function add() {
    setBusy(true); setOut(null);
    const r = await fetch(`/api/ops/orgs/${orgId}/stores`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), bizType: biz, copyFrom: from || null, parts: from ? parts : [] }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) { setOut({ ok: false, text: j.error ?? "店を足せませんでした" }); return; }
    setOut({ ok: true, text: `${name.trim()} を足しました（初期設定の前）。オーナーが 2 店目の初期設定で確定します。` }); setName(""); router.refresh();
  }
  return (
    <section style={{ ...t.card, display: "grid", gap: 10 }} aria-label="店を追加" data-ops-add-store="1">
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>店を追加</h2>
      <p style={{ ...t.sub, fontSize: 12, margin: 0, lineHeight: 1.7 }}>同じ会社の 2 店目を足します。足した店は初期設定の前です。給与の締め日と支払日は会社で 1 つです。</p>
      <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>店名</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} style={t.input} /></label>
      <div style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>業態</span>
        <div className="nox-seg" role="group" aria-label="業態" style={{ flexWrap: "wrap" }}>{BIZ.map(([k, l]) => <button key={k} type="button" className={biz === k ? "on" : ""} aria-pressed={biz === k} onClick={() => setBiz(k)}>{l}</button>)}</div>
      </div>
      <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>設定を写す元の店（初期設定が済んだ店）</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)} style={t.input}><option value="">写さない</option>{ready.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </label>
      {from && (
        <div style={{ display: "grid", gap: 6 }} data-ops-copy-parts="1">
          {STORE_COPY_PARTS.map((p) => (
            <label key={p} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input type="checkbox" checked={parts.includes(p)} onChange={() => toggle(p)} style={{ marginTop: 3 }} />
              <span><b>{STORE_COPY_LABEL[p].name}</b><span style={{ display: "block", color: "var(--sub)", fontSize: 11.5 }}>{STORE_COPY_LABEL[p].what}</span></span>
            </label>))}
          <p style={{ ...t.sub, fontSize: 11.5, margin: 0 }}>{STORE_COPY_NEVER}写した後は店ごとに別々です。</p>
        </div>
      )}
      <div className="nox-actions"><button type="button" style={t.btnGold} disabled={busy || !name.trim() || !biz || (!!from && parts.length === 0)} onClick={() => void add()} data-ops-add-store-btn="1">{busy ? "足しています…" : "店を追加"}</button></div>
      {out && <Message kind={out.ok ? "success" : "error"}>{out.text}</Message>}
    </section>
  );
}
