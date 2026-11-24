"use client";

// ★便 ON-3（2026-10-26・0176 ★2＝I-1）: 招待の受諾フォーム＝本人がパスワードを決める（8〜72 字・2 回）→ POST /api/staff/invite/accept → 成功＝cookie 付きで /dashboard へ。
//   ★起票157（相談役 11/24 夜 N2）: 白地 → アプリの暗いテーマ（/auth/set-password と同じ t.input／t.fieldLabel／t.btnGold・エラーは Message）。論理と data-invite-* は不変。エラーは route の語を日本語に（inviteErrJa）。
import { useState } from "react";
import { INVITE_PASSWORD_MIN, inviteErrJa, invitePasswordErrorOf } from "@/lib/nox/people/invite";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";

export default function AcceptForm({ token, email }: { token: string; email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }} data-invite-form="1">
      <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>ログインID（メールアドレス）</span>
        <input value={email} readOnly style={{ ...t.input, color: "var(--sub)" }} />
      </label>
      <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>パスワード（{INVITE_PASSWORD_MIN} 文字以上）</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={t.input} data-invite-pw="1" />
      </label>
      <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>パスワード（確認）</span>
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={t.input} />
      </label>
      {err && <Message kind="error" style={{ margin: 0 }}>{err}</Message>}
      {done && <Message kind="success" style={{ margin: 0 }}>{done}</Message>}
      <button type="submit" disabled={busy || !!done} data-invite-submit="1" style={{ ...t.btnGold, width: "100%", minHeight: 48, marginTop: 6, fontSize: 15, opacity: busy ? 0.7 : 1 }}>
        {busy ? "登録中…" : "パスワードを決めて登録する"}
      </button>
    </form>
  );
}
