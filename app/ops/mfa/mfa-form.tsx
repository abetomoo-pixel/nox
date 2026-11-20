"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: MFA（TOTP）。登録が無ければ enroll（QR と手入力のキー）→ 6 桁で verify・あれば challenge → 6 桁で verify。済んだら aal2 → /ops。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Phase = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string } | { kind: "error"; text: string };

export default function OpsMfaForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void (async () => {
      const mfa = createClient().auth.mfa;
      const { data, error } = await mfa.listFactors();
      if (error) { setPhase({ kind: "error", text: "認証アプリの状態を読めませんでした" }); return; }
      const verified = (data?.totp ?? []).find((f) => f.status === "verified");
      if (verified) { setPhase({ kind: "verify", factorId: verified.id }); return; }
      for (const f of data?.all ?? []) if (f.factor_type === "totp" && f.status !== "verified") await mfa.unenroll({ factorId: f.id });   // 途中で止めた登録を消してから出し直す
      const en = await mfa.enroll({ factorType: "totp", friendlyName: "NOX 運営" });
      if (en.error || !en.data) { setPhase({ kind: "error", text: "認証アプリの登録を始められませんでした" }); return; }
      setPhase({ kind: "enroll", factorId: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret });
    })();
  }, []);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind !== "enroll" && phase.kind !== "verify") return;
    if (!/^\d{6}$/.test(code)) { setErr("6 桁の数字を入れてください"); return; }
    setBusy(true); setErr(null);
    const mfa = createClient().auth.mfa;
    const ch = await mfa.challenge({ factorId: phase.factorId });
    if (ch.error || !ch.data) { setBusy(false); setErr("確かめを始められませんでした"); return; }
    const v = await mfa.verify({ factorId: phase.factorId, challengeId: ch.data.id, code });
    setBusy(false);
    if (v.error) { setErr("コードが違います"); return; }
    router.replace("/ops");
    router.refresh();
  }
  return (
    <main className="nox-dark" style={t.loginBg} data-ops-mfa={phase.kind}>
      <div className="nox-lcardtop" style={t.lcard}>
        {phase.kind === "loading" && <p style={{ textAlign: "center" }}>読み込み中…</p>}
        {phase.kind === "error" && <p role="alert" style={{ textAlign: "center", color: "var(--bad)" }}>{phase.text}</p>}
        {(phase.kind === "enroll" || phase.kind === "verify") && (
          <form onSubmit={onSubmit}>
            <h1 style={{ margin: "0 0 8px", textAlign: "center", fontSize: 17 }}>{phase.kind === "enroll" ? "認証アプリを登録します" : "6 桁のコードを入れてください"}</h1>
            {phase.kind === "enroll" && (
              <>
                <p style={{ ...t.sub, fontSize: 12, textAlign: "center" }}>Google Authenticator などのアプリで QR を読み取ってください</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={phase.qr} alt="認証アプリの QR" width={180} height={180} style={{ display: "block", margin: "8px auto", background: "#fff", borderRadius: 8 }} />
                <p style={{ ...t.sub, fontSize: 11, textAlign: "center", wordBreak: "break-all" }}>手入力のキー：<span className="num">{phase.secret}</span></p>
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={t.fieldLabel} htmlFor="ops-code">6 桁のコード</label>
              <input id="ops-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ ...t.input, marginTop: 5, letterSpacing: 4, textAlign: "center" }} />
            </div>
            {err && <p role="alert" style={{ color: "var(--bad)", fontSize: 12.5, margin: "10px 0 0", textAlign: "center" }}>{err}</p>}
            <div className="nox-actions" style={{ marginTop: 16 }}>
              <button type="submit" style={{ ...t.btnGold, minWidth: 160 }} disabled={busy}>{busy ? "確認中…" : phase.kind === "enroll" ? "登録する" : "確かめる"}</button>
            </div>
            {phase.kind === "verify" && <p style={{ ...t.sub, fontSize: 11, textAlign: "center", marginTop: 12 }}>アプリを失くしたときは、Supabase の管理画面で登録を消してください（手順書）</p>}
          </form>
        )}
      </div>
    </main>
  );
}
