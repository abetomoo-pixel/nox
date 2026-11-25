"use client";
// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 自分の設定の欄。パスワードの変更＝今のパスワード・新しいパスワード 2 回 → POST /api/ops/me/password。
//   client は auth.updateUser を呼ばない（route が今のパスワードを確かめて、記録してから admin で変える）。ボタンは中央。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { opsPasswordChangeErrOf, opsRoleLabelOf } from "@/lib/nox/ops/operators";

export default function OpsMeForm({ name, email, role }: { name: string; email: string; role: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe = opsPasswordChangeErrOf({ current, password, password2 });
    if (fe) { setMsg({ ok: false, text: fe }); return; }
    setBusy(true); setMsg(null);
    const r = await fetch("/api/ops/me/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current, password, password2 }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "うまくいきませんでした。時間をおいてもう一度試してください" }); return; }
    setCurrent(""); setPassword(""); setPassword2("");
    setMsg({ ok: true, text: "パスワードを変えました（次のログインから新しいパスワードです）" });
  }
  const row = (k: string, v: string) => <p style={{ margin: "4px 0", fontSize: 13 }}><span style={{ ...t.sub, display: "inline-block", minWidth: 56 }}>{k}</span>{v}</p>;
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }} data-ops-me="1">
      <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>自分の設定</h1>
      <section style={{ ...t.card, marginBottom: 12 }} aria-label="自分">
        {row("名前", name)}{row("メール", email)}{row("役", opsRoleLabelOf(role))}
        <p style={{ ...t.sub, fontSize: 11.5, margin: "8px 0 0" }}>認証アプリを替えるときは、管理者に「認証アプリのリセット」を頼んでください</p>
      </section>
      <form style={t.card} onSubmit={(e) => void submit(e)} aria-label="パスワードの変更">
        <h2 style={{ ...t.cardTitle, margin: "0 0 10px" }}>パスワードを変える</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>今のパスワード</span><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" style={t.input} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>新しいパスワード（8〜72 字）</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={t.input} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={t.fieldLabel}>新しいパスワード（確認）</span><input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" style={t.input} /></label>
        </div>
        <div className="nox-actions" style={{ marginTop: 14 }}>
          <button type="submit" style={t.btnGold} disabled={busy} data-ops-me-password="1">{busy ? "確認中…" : "パスワードを変える"}</button>
        </div>
        {msg && <div data-ops-me-msg={msg.ok ? "ok" : "err"}><Message kind={msg.ok ? "success" : "error"} style={{ margin: "10px 0 0" }}>{msg.text}</Message></div>}
      </form>
    </div>
  );
}
