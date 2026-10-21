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

import { Message } from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
// ★裁定319／319 追補1（0158・便 AB-4）: 退勤の前に kiosk_punch_state を読み、送りの方式が実費（actual）の店だけ「送り あり／なし」を聞く。
//   あり＝kiosk_punch(p_okuri=true)→kiosk_transport_issue(punch_id)（金額はサーバが店の基本額で決める）。基本額が未設定の店は発行せず注記のみ。一律（flat）の店は口を出さない。
import { okuriSelfPlanOf, OKURI_PENDING_NOTE, type OkuriSelfPlan } from "@/lib/nox/shift/okuri-self";
import { okuriOutTextOf, okuriRecordedTextOf } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）: 方式の 1 文・「記録」
import { rpcErrJa } from "@/lib/nox/ui/rpc-err"; // ★裁定327（0161・便 M1-4）: 順序検査の拒否 3 語は端末にも同じ和文
type KRow = { cast_id: string; cast_name: string; has_pin: boolean; staff?: boolean }; // ★便 P174 T-6（355）: staff＝true は cast_id に membership_id（スタッフ群）
type SRow = { membership_id: string; user_name: string; role: string; has_pin: boolean; last_kind: string | null; last_at: string | null }; // ★便 P174 T-6: kiosk_staff_list（0174 ★5）
type Phase = "loading" | "login" | "denied" | "select" | "pin" | "okuri" | "result";
type PunchResult =
  | { kind: "ok"; name: string; type: "in" | "out"; time: string; note?: string }
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
  const [staffs, setStaffs] = useState<SRow[]>([]); // ★便 P174 T-6（355）: 打刻端末のスタッフ群（manager／staff・オーナーは対象外）
  const [group, setGroup] = useState<"cast" | "staff">("cast");
  const [target, setTarget] = useState<KRow | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [okuriPlan, setOkuriPlan] = useState<OkuriSelfPlan | null>(null);
  const [castPunchOff, setCastPunchOff] = useState(false); // ★便 X13-G W-23 ①: キャストの打刻を使わない店＝キャスト群を出さない（スタッフ群は今のまま）

  // kiosk_cast_list が唯一の読み口: 1行以上=キオスク端末（他ロール/非端末は 0行＝fail-closed）
  const loadList = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("kiosk_cast_list");
    const rows = (data ?? []) as KRow[];
    if (error || rows.length === 0) return false;
    setCasts(rows);
    // ★便 P174 T-6（355）: スタッフ群（打刻端末だけ・読めなければ空＝キャスト群のみ）
    const { data: sd, error: se } = await supabase.rpc("kiosk_staff_list");
    setStaffs(se ? [] : ((sd ?? []) as SRow[]));
    void fetch("/api/kiosk/punch-methods").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.castPunchOff === true) { setCastPunchOff(true); setGroup("staff"); } }).catch(() => {});
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
    setTarget(null); setPin(""); setResult(null); setOkuriPlan(null); setPhase("select");
    void loadList(); // has_pin 変化を拾う（安価な唯一の読み口）
  }

  function pick(c: KRow) {
    if (!c.has_pin) return;
    setTarget(c); setPin(""); setPhase("pin");
  }

  function keyIn(d: string) {
    setPin((p) => (p.length >= 4 ? p : p + d)); // 関数型更新（連打でも取りこぼさない）
  }

  /** 退勤: 実費の店なら先に「送り あり／なし」を聞く（読取に失敗したら聞かずに従来どおり打刻） */
  async function startOut() {
    if (!target || pin.length !== 4 || busy) return;
    if (target.staff) { void punch("out"); return; } // ★便 P174 T-6: スタッフは送りなし
    setBusy(true);
    const { data, error } = await supabase.rpc("kiosk_punch_state");
    setBusy(false);
    const plan = okuriSelfPlanOf(error ? null : (data as { okuri_mode?: unknown; okuri_base_amount?: unknown } | null));
    if (!plan.ask) { void punch("out"); return; }
    setOkuriPlan(plan); setPhase("okuri");
  }

  async function punch(type: "in" | "out", okuri?: boolean) {
    if (!target || pin.length !== 4 || busy) return;
    setBusy(true);
    const { data, error } = target.staff
      ? await supabase.rpc("staff_punch", { p_membership_id: target.cast_id, p_pin: pin, p_kind: type }) // ★便 P174 T-6（355・0174 ★5）
      : await supabase.rpc("kiosk_punch", okuri === undefined
        ? { p_cast_id: target.cast_id, p_pin: pin, p_type: type }
        : { p_cast_id: target.cast_id, p_pin: pin, p_type: type, p_okuri: okuri });
    // 送り あり: 基本額がある店だけ発行（失敗しても打刻は残る＝店が締めで確定）
    let note: string | undefined;
    const pj = data as { ok?: boolean; punch_id?: string } | null;
    if (!error && pj?.ok && type === "out" && okuri) {
      if (okuriPlan?.issue && pj.punch_id) {
        const { error: eT } = await supabase.rpc("kiosk_transport_issue", { p_punch_id: pj.punch_id });
        note = eT ? OKURI_PENDING_NOTE : okuriRecordedTextOf(okuriPlan.mode, okuriPlan.amount ?? 0); // ★裁定414: 方式の 1 文
      } else note = OKURI_PENDING_NOTE;
    }
    setBusy(false);
    let r: PunchResult;
    if (error) {
      // ★裁定327（0161）: kiosk_punch は順序検査を raise で返す（'already in'／'already out'／'no open punch'）＝rpcErrJa の和文。それ以外は従来の端末文言
      r = { kind: "ng", message: /already in|already out|no open punch/.test(error.message) ? rpcErrJa(error.message)
        : /not in/.test(error.message) ? "出勤の打刻がありません（先に出勤を打刻してください）" // ★便 P174 T-6: staff_punch の順序検査
        : "この端末は現在使用できません（店に確認してください）" };
    } else {
      const j = data as { ok: boolean; reason?: string; punched_at?: string; locked_until?: string };
      if (j.ok) {
        const time = new Date(j.punched_at ?? Date.now()).toLocaleTimeString("ja-JP", {
          timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
        });
        r = { kind: "ok", name: target.cast_name, type, time, note };
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
            {loginErr && <Message kind="error" style={{ margin: "10px 0 0" }}>{loginErr}</Message>}
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
            {castPunchOff && (
              <p data-kiosk-cast-off="1" style={{ textAlign: "center", fontSize: 13, color: "var(--sub)", margin: "0 0 12px" }}>この店ではキャストの出勤・退勤は店が記録します（キャストの打刻はありません）</p>
            )}
            {staffs.length > 0 && (/* ★便 P174 T-6（355）: キャスト群／スタッフ群の 2 段（スタッフがいる店だけ） */
              <div role="tablist" aria-label="打刻する人" data-kiosk-group={group} style={{ display: "flex", gap: 8, justifyContent: "center", margin: "0 0 14px" }}>
                {([["cast", "キャスト"], ["staff", "スタッフ"]] as const).filter(([k]) => !(castPunchOff && k === "cast")).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={group === k} onClick={() => setGroup(k)}
                    style={{ ...bigBtn, fontSize: 16, padding: "10px 22px", borderColor: group === k ? "var(--gold)" : "var(--line2)", color: group === k ? "var(--gold)" : "var(--ink)" }}>{label}</button>
                ))}
              </div>
            )}
            {group === "staff" && staffs.length > 0 ? (
              <div className="nox-kioskgrid" data-kiosk-grid="staff">
                {staffs.map((m) => (
                  <button key={m.membership_id} onClick={() => pick({ cast_id: m.membership_id, cast_name: m.user_name, has_pin: m.has_pin, staff: true })} disabled={!m.has_pin}
                    style={{ ...bigBtn, opacity: m.has_pin ? 1 : 0.35, cursor: m.has_pin ? "pointer" : "not-allowed" }}>
                    {m.user_name}
                    <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, marginTop: 4 }}>
                      {m.role === "manager" ? "店長" : "スタッフ"}{!m.has_pin ? "・PIN未設定" : m.last_kind === "in" ? "・出勤中" : m.last_kind === "out" ? "・退勤済み" : ""}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
            <div className="nox-kioskgrid" data-kiosk-grid="1">{/* ★GV-4（便 N1014 A-3）: 名前タイル＝≥900px 4 列・600〜899 3 列・それ未満 2 列（globals.css） */}
              {(castPunchOff ? [] : casts).map((c) => ( /* ★便 X13-G W-23: キャストの打刻を使わない店はキャストの名前を出さない */
                <button key={c.cast_id} onClick={() => pick(c)} disabled={!c.has_pin}
                  style={{ ...bigBtn, opacity: c.has_pin ? 1 : 0.35, cursor: c.has_pin ? "pointer" : "not-allowed" }}>
                  {c.cast_name}
                  {!c.has_pin && <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, marginTop: 4 }}>PIN未設定</div>}
                </button>
              ))}
            </div>
            )}
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
              <button disabled={pin.length !== 4 || busy} onClick={() => void startOut()}
                style={{ ...bigBtn, color: "var(--champ)", opacity: pin.length === 4 ? 1 : 0.4 }}>
                退勤
              </button>
            </div>
            <button onClick={backToSelect} style={{ ...t.btnGhost, ...t.btnSm, marginTop: 16, width: "100%" }}>もどる</button>
          </div>
        )}

        {phase === "okuri" && target && okuriPlan && (
          <div style={{ maxWidth: 380, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{target.cast_name}</p>
            <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>送りを使いますか</p>
            <p style={{ textAlign: "center", fontSize: 14, margin: "0 0 14px" }} data-okuri-text={okuriPlan.mode}>
              {okuriPlan.amount !== null ? okuriOutTextOf(okuriPlan.mode, okuriPlan.amount) : OKURI_PENDING_NOTE}{/* ★裁定414: 方式の 1 文 */}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button disabled={busy} onClick={() => void punch("out", true)}
                style={{ ...t.btnGold, padding: "20px 0", fontSize: 18, fontWeight: 900, borderRadius: 14 }}>送り あり</button>
              <button disabled={busy} onClick={() => void punch("out", false)} style={{ ...bigBtn, fontSize: 18 }}>送り なし</button>
            </div>
            <button onClick={() => { setOkuriPlan(null); setPhase("pin"); }} disabled={busy} style={{ ...t.btnGhost, ...t.btnSm, marginTop: 16, width: "100%" }}>もどる</button>
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
                {result.note && <p style={{ fontSize: 14, margin: "8px 0 0" }}>{result.note}</p>}
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
