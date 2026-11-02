"use client";

// ★便 OB-2 ⑧（2026-10-29）: 招待リンク（scripts/admin/create-org.mjs の inviteUserByEmail／generateLink）の戻り先＝パスワード設定。
//   招待リンクの形 3 つをすべて受ける: ①#access_token=…&refresh_token=…（implicit）→ setSession ②?code=…（PKCE）→ exchangeCodeForSession ③?token_hash=…&type=invite → verifyOtp。
//   セッションが取れたら本人がパスワードを決める（8〜72 字・2 回）→ POST /api/auth/invite-accept（admin.updateUserById・デモは 403） → /dashboard（(manage) layout が規約の同意→初期設定 STEP 1 へ送る）。
//   公開面（noindex は layout の metadata）。パスワードはレスポンスにもログにも出さない。
// ★便 M5 M-40 (a)（2026-10-30）: 見た目をアプリの暗いテーマに（nox-dark＋t.loginBg／t.lcard／t.input／t.btnGold／t.fieldLabel／t.sub＝/login と同じ器）。
//   論理・data-set-password-* 属性・文言は不変。エラーは Message（role=alert）に揃え、/login への導線は next/link の Link。
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { INVITE_PASSWORD_MIN, invitePasswordErrorOf } from "@/lib/nox/people/invite";
import * as t from "@/lib/nox/ui/theme";
import BrandLogo from "@/components/ui/brand-logo";
import { Message } from "@/components/ui/toast";

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

  const body: React.CSSProperties = { ...t.sub, fontSize: 13.5, lineHeight: 1.7 };
  return (
    <main className="nox-dark" style={t.loginBg} data-set-password="1">
      <div className="nox-lcardtop" style={t.lcard}>
        <h1 style={{ margin: "0 0 4px", display: "flex", justifyContent: "center" }} aria-label="NOX"><BrandLogo height={56} /></h1>
        <p style={{ textAlign: "center", color: "var(--sub)", fontSize: 12, margin: "6px 0 10px" }}>NOX へようこそ</p>
        {phase === "loading" && <p style={body} data-set-password-state="loading">招待を確認しています…</p>}
        {phase === "nosession" && (
          <div data-set-password-state="nosession">
            <p style={{ ...body, margin: "0 0 10px" }}>この招待リンクは使えません（期限切れか、すでに使われています）。運営に再発行を依頼してください。 <Link href="/login" style={{ color: "var(--gold)", fontWeight: 700 }}>ログイン画面へ</Link></p>
            {err && <Message kind="error" style={{ margin: 0 }}>{err}</Message>}
          </div>
        )}
        {(phase === "ready" || phase === "done") && (
          <>
            <p style={{ ...body, margin: "0 0 12px" }} data-set-password-state="ready">ログイン用のパスワードを決めてください。決めたら、お店の初期設定（9 ステップ）に進みます。</p>
            <form onSubmit={submit} style={{ display: "grid", gap: 12 }} data-set-password-form="1">
              <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>ログインID（メールアドレス）</span><input value={email} readOnly style={{ ...t.input, color: "var(--sub)" }} /></label>
              <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>パスワード（{INVITE_PASSWORD_MIN} 文字以上）</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={t.input} data-set-password-pw="1" /></label>
              <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>パスワード（確認）</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={INVITE_PASSWORD_MIN} required style={t.input} /></label>
              {err && <Message kind="error" style={{ margin: 0 }}>{err}</Message>}
              <button type="submit" disabled={busy || phase === "done"} data-set-password-submit="1" style={{ ...t.btnGold, width: "100%", minHeight: 48, marginTop: 6, fontSize: 15, opacity: busy ? 0.7 : 1 }}>
                {phase === "done" ? "設定しました。移動します…" : busy ? "設定中…" : "パスワードを決めて始める"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
