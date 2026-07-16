"use client";

// F4a キオスク打刻（mig0043 kiosk_punch/kiosk_cast_list と対・タブレット常設前提）。
// 認証は通常ログインと同じ Supabase auth（kiosk アカウント＝kiosk_devices 方式・users/memberships 非連動）。
// 画面ガードは利便のみ＝kiosk_cast_list が 0行なら「キオスク端末ではない」を表示するだけで、
// 真の防御は RPC（kiosk_punch は kiosk_devices 行必須・他は auth_org_id() null で全遮断＝mine/layout と同思想）。
// フロー: name-select（源氏名グリッド・PIN 未設定はグレーアウト）→ PIN pad（4桁マスク）→
//   出勤/退勤 大ボタン → 結果表示（ok=名前+時刻／wrong_pin=残回数非表示でシンプル／locked=解除時刻）→
//   数秒で name-select へ自動復帰。
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type KRow = { cast_id: string; cast_name: string; has_pin: boolean };
type Phase = "loading" | "login" | "denied" | "select" | "pin" | "result";
type PunchResult =
  | { kind: "ok"; name: string; type: "in" | "out"; time: string }
  | { kind: "ng"; message: string };

const RESULT_MS = 4000; // 結果表示 → name-select 自動復帰

const bigBtn: React.CSSProperties = {
  border: "1px solid var(--line2)", borderRadius: 14, background: "linear-gradient(180deg,var(--card2),var(--card))",
  color: "var(--ink)", fontSize: 20, fontWeight: 800, padding: "22px 10px", cursor: "pointer",
  fontFamily: "inherit",
};
const keyBtn: React.CSSProperties = {
  ...bigBtn, fontSize: 26, padding: 0, height: 72, fontVariantNumeric: "tabular-nums",
};

export default function KioskPage() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [casts, setCasts] = useState<KRow[]>([]);
  const [target, setTarget] = useState<KRow | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // kiosk_cast_list が唯一の読み口: 1行以上=キオスク端末（他ロール/非端末は 0行＝fail-closed）
  const loadList = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("kiosk_cast_list");
    const rows = (data ?? []) as KRow[];
    if (error || rows.length === 0) return false;
    setCasts(rows);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPhase("login"); return; }
      setPhase((await loadList()) ? "select" : "denied");
    })();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setLoginErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPw });
    if (error) { setLoginErr("ログインIDまたはパスワードが違います"); setBusy(false); return; }
    setLoginPw("");
    setPhase((await loadList()) ? "select" : "denied");
    setBusy(false);
  }

  function backToSelect() {
    setTarget(null); setPin(""); setResult(null); setPhase("select");
    void loadList(); // has_pin 変化を拾う（安価な唯一の読み口）
  }

  function pick(c: KRow) {
    if (!c.has_pin) return;
    setTarget(c); setPin(""); setPhase("pin");
  }

  function keyIn(d: string) {
    setPin((p) => (p.length >= 4 ? p : p + d)); // 関数型更新（連打でも取りこぼさない）
  }

  async function punch(type: "in" | "out") {
    if (!target || pin.length !== 4 || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("kiosk_punch", { p_cast_id: target.cast_id, p_pin: pin, p_type: type });
    setBusy(false);
    let r: PunchResult;
    if (error) {
      r = { kind: "ng", message: "この端末は現在使用できません（店に確認してください）" };
    } else {
      const j = data as { ok: boolean; reason?: string; punched_at?: string; locked_until?: string };
      if (j.ok) {
        const time = new Date(j.punched_at ?? Date.now()).toLocaleTimeString("ja-JP", {
          timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
        });
        r = { kind: "ok", name: target.cast_name, type, time };
      } else if (j.reason === "wrong_pin") {
        r = { kind: "ng", message: "PINが違います" }; // 残回数はあえて出さない（シンプル・総当たりヒント回避）
      } else if (j.reason === "locked") {
        const until = j.locked_until
          ? new Date(j.locked_until).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })
          : "";
        r = { kind: "ng", message: `ロック中です${until ? `（${until} 頃に解除）` : ""}` };
      } else if (j.reason === "no_pin") {
        r = { kind: "ng", message: "PINが設定されていません（店に確認してください）" };
      } else {
        r = { kind: "ng", message: "打刻できませんでした（選び直してください）" };
      }
    }
    setResult(r); setPhase("result");
    timerRef.current = setTimeout(backToSelect, RESULT_MS);
  }

  const clock = (
    <div style={{ position: "absolute", top: 18, right: 22, fontSize: 13, color: "var(--sub)" }}>
      <button
        onClick={async () => { await supabase.auth.signOut(); setCasts([]); setPhase("login"); }}
        style={{ ...t.btnGhost, ...t.btnSm, opacity: 0.6 }}
      >
        端末ログアウト
      </button>
    </div>
  );

  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", position: "relative", padding: 20 }}>
      {phase !== "login" && clock}
      <div style={{ maxWidth: 720, margin: "0 auto", paddingTop: 26 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <span style={{ ...t.brand, fontSize: 26 }}>NOX</span>
          <span style={{ marginLeft: 12, fontSize: 13, color: "var(--sub)" }}>タイムレコーダー</span>
        </div>

        {phase === "loading" && <p style={{ textAlign: "center", color: "var(--sub)" }}>読み込み中…</p>}

        {phase === "login" && (
          <form onSubmit={doLogin} className="nox-lcardtop" style={{ ...t.lcard, maxWidth: 430, margin: "0 auto" }}>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>キオスク端末ログイン</h1>
            <p style={{ ...t.sub, margin: "0 0 12px" }}>店に発行された端末アカウント（k-〜）でログインしてください。</p>
            <label style={t.fieldLabel}>ログインID</label>
            <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required autoComplete="username"
              style={{ ...t.input, marginTop: 5, marginBottom: 12 }} />
            <label style={t.fieldLabel}>パスワード</label>
            <input type="password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} required
              autoComplete="current-password" style={{ ...t.input, marginTop: 5 }} />
            {loginErr && <p style={{ color: "var(--bad)", fontSize: 12.5, margin: "10px 0 0" }}>{loginErr}</p>}
            <button type="submit" disabled={busy} style={{ ...t.btnGold, width: "100%", marginTop: 14, padding: "13px 0", fontSize: 15 }}>
              {busy ? "確認中…" : "ログイン"}
            </button>
          </form>
        )}

        {phase === "denied" && (
          <div className="nox-cardtop" style={{ ...t.card, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>このアカウントはキオスク端末ではありません</p>
            <p style={{ ...t.sub, margin: 0 }}>端末アカウント（オーナーがマスタ管理で発行）でログインし直してください。</p>
            <button onClick={async () => { await supabase.auth.signOut(); setPhase("login"); }}
              style={{ ...t.btnGhost, marginTop: 14 }}>ログアウト</button>
          </div>
        )}

        {phase === "select" && (
          <>
            <p style={{ textAlign: "center", fontSize: 15, color: "var(--champ)", fontWeight: 700, margin: "0 0 16px" }}>
              名前を選んでください
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {casts.map((c) => (
                <button key={c.cast_id} onClick={() => pick(c)} disabled={!c.has_pin}
                  style={{ ...bigBtn, opacity: c.has_pin ? 1 : 0.35, cursor: c.has_pin ? "pointer" : "not-allowed" }}>
                  {c.cast_name}
                  {!c.has_pin && <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, marginTop: 4 }}>PIN未設定</div>}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "pin" && target && (
          <div style={{ maxWidth: 380, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{target.cast_name}</p>
            <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>PIN（4桁）を入力してください</p>
            {/* マスク表示（●）＝入力値そのものは画面に出さない */}
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 18 }}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{
                  width: 18, height: 18, borderRadius: 999,
                  border: "1px solid var(--line2)",
                  background: i < pin.length ? "var(--gold)" : "transparent",
                }} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} style={keyBtn} onClick={() => keyIn(d)}>{d}</button>
              ))}
              <button style={{ ...keyBtn, fontSize: 15, color: "var(--sub)" }} onClick={() => setPin("")}>クリア</button>
              <button style={keyBtn} onClick={() => keyIn("0")}>0</button>
              <button style={{ ...keyBtn, fontSize: 20, color: "var(--sub)" }} onClick={() => setPin((p) => p.slice(0, -1))}>⌫</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
              <button disabled={pin.length !== 4 || busy} onClick={() => void punch("in")}
                style={{ ...t.btnGold, padding: "20px 0", fontSize: 20, fontWeight: 900, borderRadius: 14, opacity: pin.length === 4 ? 1 : 0.4 }}>
                出勤
              </button>
              <button disabled={pin.length !== 4 || busy} onClick={() => void punch("out")}
                style={{ ...bigBtn, color: "var(--champ)", opacity: pin.length === 4 ? 1 : 0.4 }}>
                退勤
              </button>
            </div>
            <button onClick={backToSelect} style={{ ...t.btnGhost, ...t.btnSm, marginTop: 16, width: "100%" }}>もどる</button>
          </div>
        )}

        {phase === "result" && result && (
          <div className="nox-cardtop" style={{ ...t.card, textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
            {result.kind === "ok" ? (
              <>
                <p style={{ fontSize: 22, fontWeight: 900, color: "var(--champ)", margin: "6px 0" }}>
                  {result.type === "in" ? "出勤" : "退勤"}しました
                </p>
                <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>{result.name} さん</p>
                <p style={{ ...t.num, fontSize: 28, fontWeight: 700, margin: 0 }}>{result.time}</p>
              </>
            ) : (
              <p style={{ fontSize: 18, fontWeight: 800, margin: "10px 0" }}>{result.message}</p>
            )}
            <p style={{ ...t.sub, marginTop: 12 }}>まもなく最初の画面に戻ります</p>
            <button onClick={backToSelect} style={{ ...t.btnGhost, ...t.btnSm, marginTop: 8 }}>すぐ戻る</button>
          </div>
        )}
      </div>
    </main>
  );
}
