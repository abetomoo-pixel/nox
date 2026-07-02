"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    // ロールで着地先を分ける（真の防御は RLS/RPC・これは利便のための振り分け）
    const { data: role } = await supabase.rpc("auth_role");
    router.replace(role === "cast" ? "/mine" : "/register");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>NOX</h1>
      <p style={{ color: "#6b6b6b", marginTop: 0 }}>ログイン</p>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 12, color: "#6b6b6b" }}>メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={{ width: "100%", padding: 8, border: "1px solid #e0e0e0", borderRadius: 6 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 12, color: "#6b6b6b" }}>パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: "100%", padding: 8, border: "1px solid #e0e0e0", borderRadius: 6 }}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "#e5484d", fontSize: 13 }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: 10,
            background: "#16161a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>
    </main>
  );
}
