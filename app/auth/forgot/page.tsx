"use client";

// ★M-84（2026-11-05・デモデータ便に同乗）: /login の「パスワードをお忘れの方」＝メールを入れて Supabase の resetPasswordForEmail（redirectTo＝/auth/set-password）。
//   「送信しました」の文言は入力の有無（登録の有無）に関わらず同じ＝メールの有無を漏らさない。送信元・文面は Resend／SMTP 設定後に日本語テンプレで差し替える前提（Supabase の既定テンプレのまま）。
//   見た目は /login と同じ器（nox-dark＋t.loginBg／t.lcard）。デモ org のメールは Supabase が実際に送るため、デモ帯の案内は出さない（公開面・noindex は layout）。
import { useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/ui/brand-logo";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { FORGOT_SENT_TEXT } from "@/lib/nox/auth/forgot"; // ★page から定数を export しない（next build の制約）


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErr("メールアドレスの形式を確かめてください"); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/set-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(v, { redirectTo });
    setBusy(false);
    // 文言は結果に関わらず同じ（メールの有無を漏らさない）。送信の失敗（回数制限など）だけは別の文言
    if (error && /rate limit|too many/i.test(error.message)) { setErr("送信が集中しています。しばらく待ってからもう一度お試しください"); return; }
    setSent(true);
  }

  return (
    <main className="nox-dark" style={t.loginBg}>
      <div className="nox-lcardtop" style={t.lcard} data-forgot-page="1">
        <h1 style={{ margin: "0 0 4px", display: "flex", justifyContent: "center" }} aria-label="NOX"><BrandLogo height={56} /></h1>
        <p style={{ textAlign: "center", color: "var(--sub)", fontSize: 12, margin: "6px 0 2px" }}>パスワードの再設定</p>
        {sent ? (
          <div style={{ marginTop: 14 }} data-forgot-sent="1">
            <Message kind="success">{FORGOT_SENT_TEXT}</Message>
            <p style={{ ...t.sub, marginTop: 10 }}>メールのリンクを開くと、新しいパスワードを決める画面に進みます。</p>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <p style={{ ...t.sub, margin: "10px 0 0" }}>登録しているメールアドレスを入れてください。再設定の案内をお送りします。</p>
            <div style={{ marginTop: 14 }}>
              <label style={t.fieldLabel}>メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" style={{ ...t.input, marginTop: 5 }} data-forgot-email="1" />
            </div>
            {err && <Message kind="error" style={{ margin: "12px 0 0" }}>{err}</Message>}
            <button type="submit" disabled={busy} style={{ ...t.btnGold, width: "100%", marginTop: 18, opacity: busy ? 0.7 : 1 }} data-forgot-submit="1">{busy ? "送信中…" : "再設定の案内を送る"}</button>
          </form>
        )}
        <p style={{ textAlign: "center", marginTop: 14, fontSize: 12.5 }}><Link href="/login" className="nox-link">ログインに戻る</Link></p>
      </div>
    </main>
  );
}
