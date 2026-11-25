"use client";

// ★0211 の便（相談役 11/25 D1）: パスワードを変える画面＝初期パスワードで入った人の最初のログイン（middleware がここへ送る）と、メール無しの人がいつでも自分で変える道。
//   器は /auth/set-password と同じ暗いテーマ（nox-dark・t.loginBg・t.lcard・ロゴ・t.input＝375 で 16px・t.btnGold）。POST /api/me/password（今のパスワードで確かめる）。
//   変えた後は元の行き先へ読み直す移動（middleware が新しい印を読む）。ログアウトはいつでもできる。
import { useEffect, useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import BrandLogo from "@/components/ui/brand-logo";
import { Message } from "@/components/ui/toast";
import { mustChangeNextOf, newPasswordErrOf } from "@/lib/nox/auth/must-change";

export default function ChangePasswordPage() {
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);
  const [next, setNext] = useState("/dashboard"); const [first, setFirst] = useState(false);
  useEffect(() => { const q = new URLSearchParams(window.location.search); setNext(mustChangeNextOf(q.get("next"))); setFirst(q.has("next")); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = newPasswordErrOf(cur, pw, pw2); if (v) { setErr(v); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/me/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: cur, next: pw }) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) { setErr(j.error === "forbidden (demo)" ? "デモではパスワードを変えられません" : j.error ?? "変えられませんでした"); setBusy(false); return; }
    setDone(true);
    window.location.href = next;
  }

  const body: React.CSSProperties = { ...t.sub, fontSize: 13.5, lineHeight: 1.7 };
  return (
    <main className="nox-dark" style={t.loginBg} data-change-password="1">
      <div className="nox-lcardtop" style={t.lcard}>
        <div style={{ display: "flex", justifyContent: "center", margin: "0 0 4px" }} aria-hidden="true"><BrandLogo height={56} /></div>
        <h1 style={{ textAlign: "center", color: "var(--sub)", fontSize: 13, fontWeight: 600, margin: "6px 0 12px" }}>パスワードを変える</h1>
        <p style={{ ...body, margin: "0 0 12px" }} data-change-password-first={first ? "1" : "0"}>
          {first ? "お店から渡された初期パスワードのままです。使い始める前に、自分だけが知っているパスワードに変えてください。" : "今のパスワードと、新しいパスワードを入れてください。"}
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }} data-change-password-form="1">
          <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>{first ? "渡された初期パスワード" : "今のパスワード"}</span><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required style={t.input} /></label>
          <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>新しいパスワード（8 文字以上）</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required style={t.input} /></label>
          <label style={{ display: "grid", gap: 5 }}><span style={t.fieldLabel}>新しいパスワード（確認）</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} required style={t.input} /></label>
          {err && <Message kind="error" style={{ margin: 0 }}>{err}</Message>}
          <button type="submit" disabled={busy || done} style={{ ...t.btnGold, width: "100%", minHeight: 48, marginTop: 6, fontSize: 15, opacity: busy ? 0.7 : 1 }} data-change-password-submit="1">
            {done ? "変えました。移動します…" : busy ? "変えています…" : "パスワードを変える"}
          </button>
        </form>
        <form action="/auth/signout" method="post" style={{ margin: "12px 0 0", textAlign: "center" }}><button type="submit" className="nox-link" style={{ ...body, fontSize: 12, background: "none", border: 0, color: "var(--gold)", cursor: "pointer" }}>ログアウトする</button></form>
      </div>
    </main>
  );
}
