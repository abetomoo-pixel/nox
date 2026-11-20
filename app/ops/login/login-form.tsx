"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: 運営者のログインの欄（ボタンは中央）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { LOGIN_FAIL_TEXT } from "@/lib/nox/ops/labels";

export default function OpsLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr(LOGIN_FAIL_TEXT); return; }
    router.replace("/ops/mfa");
    router.refresh();
  }
  return (
    <main className="nox-dark" style={t.loginBg} data-ops-login="1">
      <div className="nox-lcardtop" style={t.lcard}>
        <h1 style={{ margin: "0 0 4px", textAlign: "center", fontSize: 20 }}>NOX 運営</h1>
        <form onSubmit={onSubmit}>
          <div style={{ marginTop: 14 }}>
            <label style={t.fieldLabel} htmlFor="ops-email">メール</label>
            <input id="ops-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" style={{ ...t.input, marginTop: 5 }} />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={t.fieldLabel} htmlFor="ops-password">パスワード</label>
            <input id="ops-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" style={{ ...t.input, marginTop: 5 }} />
          </div>
          {err && <p role="alert" data-ops-login-err="1" style={{ color: "var(--bad)", fontSize: 12.5, margin: "10px 0 0", textAlign: "center" }}>{err}</p>}
          <div className="nox-actions" style={{ marginTop: 16 }}>
            <button type="submit" style={{ ...t.btnGold, minWidth: 160 }} disabled={busy}>{busy ? "確認中…" : "ログイン"}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
