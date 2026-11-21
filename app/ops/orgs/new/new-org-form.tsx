"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: テナント追加の欄（画面の案 §4）。押したら確かめ 1 回 → POST /api/ops/orgs → 詳細へ。結果の文は押したボタンの近く。
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { newOrgConfirmOf, newOrgFormErrOf, OPS_BIZ_TYPES, REFERRAL_FIELD_NOTE, TESTER_NOTE, type NewOrgForm } from "@/lib/nox/ops/labels";

const BLANK: NewOrgForm = { orgName: "", storeName: "", bizType: "", ownerEmail: "", agencyCode: "", tester: false };

export default function NewOrgFormView() {
  const router = useRouter();
  const [f, setF] = useState<NewOrgForm>(BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const err = newOrgFormErrOf(f);
  const set = (p: Partial<NewOrgForm>) => setF((x) => ({ ...x, ...p }));
  async function submit() {
    if (err) { setMsg({ ok: false, text: err }); return; }
    if (!window.confirm(newOrgConfirmOf(f))) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/ops/orgs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const j = (await r.json().catch(() => ({}))) as { orgId?: string; email?: string; error?: string };
    setBusy(false);
    if (!r.ok || !j.orgId) { setMsg({ ok: false, text: j.error ?? "うまくいきませんでした" }); return; }
    setMsg({ ok: true, text: `作成しました。${j.email} に招待を送りました` });
    router.push(`/ops/orgs/${j.orgId}`);
  }
  const lbl = (s: string, need = false) => <span style={t.fieldLabel}>{s}{need && <span style={{ color: "var(--bad)" }}>（必須）</span>}</span>;
  return (
    <section style={{ ...t.card, maxWidth: 560, margin: "0 auto" }} data-ops-new="1">
      <h1 style={{ ...t.cardTitle, fontSize: 16, margin: "0 0 12px" }}>テナントを追加</h1>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>{lbl("会社名", true)}<input value={f.orgName} maxLength={60} onChange={(e) => set({ orgName: e.target.value })} style={t.input} /></label>
        <label style={{ display: "grid", gap: 4 }}>{lbl("店名", true)}<input value={f.storeName} maxLength={60} onChange={(e) => set({ storeName: e.target.value })} style={t.input} /></label>
        <div style={{ display: "grid", gap: 4 }}>{lbl("業態", true)}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label="業態">
            {OPS_BIZ_TYPES.map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={f.bizType === k} data-ops-biz={k} onClick={() => set({ bizType: k })}
                style={{ ...(f.bizType === k ? t.btnGold : t.btnGhost), ...t.btnSm }}>{l}</button>
            ))}
          </div>
        </div>
        <label style={{ display: "grid", gap: 4 }}>{lbl("オーナーのメール", true)}<input type="email" value={f.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} style={t.input} autoComplete="off" /></label>
        <label style={{ display: "grid", gap: 4 }}>{lbl("紹介コード（任意）")}<input value={f.agencyCode} maxLength={40} onChange={(e) => set({ agencyCode: e.target.value })} style={t.input} />
          <span data-ops-referral-note="1" style={{ ...t.sub, fontSize: 11.5 }}>{REFERRAL_FIELD_NOTE}</span></label>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13 }}>
          <input type="checkbox" checked={f.tester} onChange={(e) => set({ tester: e.target.checked })} style={{ marginTop: 3 }} />
          <span>テスターの店（お試しの期限なし）<span style={{ ...t.sub, display: "block", fontSize: 11.5 }}>{TESTER_NOTE}</span></span>
        </label>
      </div>
      <div className="nox-actions" style={{ marginTop: 16 }}>
        <Link href="/ops" style={{ ...t.btnGhost, textDecoration: "none" }}>やめる</Link>
        <button type="button" style={t.btnGold} disabled={busy} onClick={() => void submit()} data-ops-create="1">{busy ? "作成中…" : "作成して招待を送る"}</button>
      </div>
      {msg && <div data-ops-new-msg={msg.ok ? "ok" : "err"}><Message kind={msg.ok ? "success" : "error"} style={{ margin: "10px 0 0" }}>{msg.text}</Message></div>}
    </section>
  );
}
