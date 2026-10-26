"use client";

// ★便 ON-3（2026-10-26・0176 ★2＝I-1）: 招待の受諾フォーム＝本人がパスワードを決める（8〜72 字・2 回）→ POST /api/staff/invite/accept → 成功＝cookie 付きで /dashboard へ。
//   公開面（白地）＝アプリのテーマ外。エラーは route の語を日本語に（inviteErrJa）。
import { useState } from "react";
import { INVITE_PASSWORD_MIN, inviteErrJa, invitePasswordErrorOf } from "@/lib/nox/people/invite";

export default function AcceptForm({ token, email }: { token: string; email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 15, padding: "10px 12px", border: "1px solid #cfd0d6", borderRadius: 9, background: "#fff", color: "#1a1a1a" };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = invitePasswordErrorOf(pw, pw2);
    if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/staff/invite/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; dest?: string; error?: string; signedIn?: boolean };
      if (!res.ok || !j.ok) { setErr(inviteErrJa(j.error ?? `登録に失敗しました（${res.status}）`)); setBusy(false); return; }
      setDone(j.signedIn === false ? "登録しました。ログイン画面からお入りください。" : "登録しました。画面を移動します…");
      window.location.href = j.dest ?? "/dashboard";
    } catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }} data-invite-form="1">
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>ログインID（メールアドレス）
        <input value={email} readOnly style={{ ...input, background: "#f3f3f6" }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>パスワード（{INVITE_PASSWORD_MIN} 文字以上）
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={input} data-invite-pw="1" />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>パスワード（確認）
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={input} />
      </label>
      {/* 公開面（白地・アプリのテーマ外）＝Message 部品は使わず role=alert の div（verify-nox-messages の対象は <p>／<span>） */}
      {err && <div role="alert" style={{ margin: 0, fontSize: 13, color: "#b3261e", fontWeight: 700 }}>{err}</div>}
      {done && <div role="status" style={{ margin: 0, fontSize: 13, color: "#1b7f3a", fontWeight: 700 }}>{done}</div>}
      <button type="submit" disabled={busy || !!done} data-invite-submit="1" style={{ minHeight: 48, fontSize: 15, fontWeight: 800, borderRadius: 10, border: 0, background: "#1a1a1a", color: "#fff", opacity: busy ? 0.6 : 1 }}>
        {busy ? "登録中…" : "パスワードを決めて登録する"}
      </button>
    </form>
  );
}
