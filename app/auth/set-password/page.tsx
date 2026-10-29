"use client";

// ★便 OB-2 ⑧（2026-10-29）: 招待リンク（scripts/admin/create-org.mjs の inviteUserByEmail／generateLink）の戻り先＝パスワード設定。
//   招待リンクの形 3 つをすべて受ける: ①#access_token=…&refresh_token=…（implicit）→ setSession ②?code=…（PKCE）→ exchangeCodeForSession ③?token_hash=…&type=invite → verifyOtp。
//   セッションが取れたら本人がパスワードを決める（8〜72 字・2 回）→ POST /api/auth/invite-accept（admin.updateUserById・デモは 403） → /dashboard（(manage) layout が規約の同意→初期設定 STEP 1 へ送る）。
//   公開面（白地・アプリのテーマ外・noindex は layout の metadata）。パスワードはレスポンスにもログにも出さない。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INVITE_PASSWORD_MIN, invitePasswordErrorOf } from "@/lib/nox/people/invite";

type Phase = "loading" | "ready" | "nosession" | "done";

export default function SetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string>("");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const q = new URLSearchParams(window.location.search);
        if (hash.get("access_token") && hash.get("refresh_token")) {
          const { error } = await supabase.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
        } else if (q.get("code")) {
          const { error } = await supabase.auth.exchangeCodeForSession(q.get("code")!);
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
        } else if (q.get("token_hash")) {
          const type = (q.get("type") ?? "invite") as "invite" | "magiclink" | "recovery" | "email";
          const { error } = await supabase.auth.verifyOtp({ token_hash: q.get("token_hash")!, type });
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        if (!user) { setPhase("nosession"); return; }
        setEmail(user.email ?? ""); setPhase("ready");
      } catch (e) { if (alive) { setErr((e as Error).message); setPhase("nosession"); } }
    })();
    return () => { alive = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = invitePasswordErrorOf(pw, pw2); if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    // client は auth.updateUser を呼ばない（demo-guard dg(6-1)）＝route が本人の admin.updateUserById・デモは 403
    const res = await fetch("/api/auth/invite-accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) { setErr(j.error ?? `設定に失敗しました（${res.status}）`); setBusy(false); return; }
    setPhase("done");
    window.location.href = "/dashboard";
  }

  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f7", color: "#1a1a1a", display: "grid", placeItems: "start center", padding: "32px 16px", fontFamily: "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif" };
  const card: React.CSSProperties = { width: "100%", maxWidth: 440, background: "#fff", border: "1px solid #e3e3e8", borderRadius: 14, padding: "22px 20px", boxShadow: "0 2px 12px rgba(0,0,0,.05)" };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 15, padding: "10px 12px", border: "1px solid #cfd0d6", borderRadius: 9, background: "#fff", color: "#1a1a1a" };
  return (
    <main style={wrap} data-set-password="1">
      <div style={card}>
        <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>NOX へようこそ</h1>
        {phase === "loading" && <p style={{ fontSize: 13.5, color: "#555" }} data-set-password-state="loading">招待を確認しています…</p>}
        {phase === "nosession" && (
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#555" }} data-set-password-state="nosession">この招待リンクは使えません（期限切れか、すでに使われています）。運営に再発行を依頼してください。{err ? <><br /><span style={{ color: "#b3261e" }}>{err}</span></> : null} <a href="/login" style={{ color: "#2b5fd9" }}>ログイン画面へ</a></p>
        )}
        {(phase === "ready" || phase === "done") && (
          <>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#555", margin: "0 0 12px" }} data-set-password-state="ready">ログイン用のパスワードを決めてください。決めたら、お店の初期設定（9 ステップ）に進みます。</p>
            <form onSubmit={submit} style={{ display: "grid", gap: 10 }} data-set-password-form="1">
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>ログインID（メールアドレス）<input value={email} readOnly style={{ ...input, background: "#f3f3f6" }} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>パスワード（{INVITE_PASSWORD_MIN} 文字以上）<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={input} data-set-password-pw="1" /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "#555" }}>パスワード（確認）<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={input} /></label>
              {err && <div role="alert" style={{ margin: 0, fontSize: 13, color: "#b3261e", fontWeight: 700 }}>{err}</div>}
              <div className="nox-actions">
                <button type="submit" disabled={busy || phase === "done"} data-set-password-submit="1" style={{ minHeight: 48, minWidth: 240, fontSize: 15, fontWeight: 800, borderRadius: 10, border: 0, background: "#1a1a1a", color: "#fff", opacity: busy ? 0.6 : 1, cursor: "pointer" }}>
                  {phase === "done" ? "設定しました。移動します…" : busy ? "設定中…" : "パスワードを決めて始める"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
