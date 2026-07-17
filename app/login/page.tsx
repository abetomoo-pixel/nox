"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: eSign } = await supabase.auth.signInWithPassword({ email, password });
    if (eSign) {
      setError("メールアドレスまたはパスワードが違います");
      setBusy(false);
      return;
    }
    // ロールで着地先を分ける（真の防御は RLS/RPC・これは利便のための振り分け）。
    // E5（裁定8）: cast 以外の着地はホーム（モックのログイン後遷移と同型）。
    const { data: role } = await supabase.rpc("auth_role");
    router.replace(role === "cast" ? "/mine" : "/dashboard");
    router.refresh();
  }

  return (
    <main className="nox-dark" style={t.loginBg}>
      <div className="nox-lcardtop" style={t.lcard}>
        <div style={t.logo}>
          <span style={{ fontFamily: t.font.brand, fontWeight: 700, fontSize: 24, color: "var(--champ)", lineHeight: 1 }}>N</span>
        </div>
        <h1 style={{ ...t.brand, fontSize: 30, textAlign: "center", margin: 0 }}>NOX</h1>
        <p style={{ textAlign: "center", color: "var(--sub)", fontSize: 12, margin: "6px 0 2px" }}>ナイトワーク経営 管理</p>

        <form onSubmit={onSubmit}>
          <div style={{ marginTop: 14 }}>
            <label style={t.fieldLabel}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              style={{ ...t.input, marginTop: 5 }}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={t.fieldLabel}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ ...t.input, marginTop: 5 }}
            />
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--bad)", fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} style={{ ...t.btnGold, width: "100%", marginTop: 18, opacity: busy ? 0.7 : 1 }}>
            {busy ? "確認中…" : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
