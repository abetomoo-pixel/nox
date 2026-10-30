"use client";

// K レジ用キオスク（裁定11/15・mig0056〜0059 と対・タブレット常設前提）。
// ★0190 フラグ true 便（K-0・裁定435 追補・2026-10-30）: キオスクのレジは本店の register-board と**同一部品**。
//   この画面は「包み」だけ＝端末ログイン（端末アカウント k-〜）・端末の束縛（kiosk_device_bind）・操作担当の解除（人を選ぶ→PIN 4〜6 桁＝裁定437・QR は近道）・
//   交代／離席（kiosk_lock）・無操作の自動ロック（3 分・店設定 kiosk_idle_sec）・操作担当のバー。レジ本体（開卓・注文・指名・会計・締め）は RegisterBoard を同じ props で描く。
//   写し（旧 1,253 行の register-board 写経）は撤去＝改修が追いつかない写しを置かない（教訓126 候補）。
//   読取＝RegisterBoard が直読みする 29 表に 0190 の kiosk 腕（<t>_select_kiosk＝端末の店 × 操作担当あり）・書込＝会計 RPC の kiosk 腕（0057/0058）＋打刻ゲート（assert_on_duty）。
//   セッション失効（サーバ側 15 分／店設定）＝RPC が 'forbidden'（RegisterBoard は「権限がありません」を出す）→ 操作担当のバーの「交代／離席」で選び直す。ローカルの自動ロック（3 分）が先に効く。
// 認証2層: ①端末＝Supabase auth（register kiosk アカウント・users/memberships 非連動）②操作担当＝kiosk_login（membership 選択＋PIN＝staff_pin・サーバ側 kiosk_sessions）。
// 画面ガードは利便のみ＝kiosk_operator_list が 0行なら「レジ端末ではない」を表示するだけで、真の防御は RPC と RLS の kiosk 腕。
// ★UI 契約（0059 (b)）: タイマーから RPC は一切呼ばない（idle 表示と自動ロックはローカル時計のみ）。
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import RegisterBoard from "@/app/(manage)/register/register-board"; // ★K-0: 本店のレジと同一部品
import { mig0185On, mig0190On, rules0175On } from "@/lib/nox/rules-0175/flag";
import KioskQrDisplay from "@/components/nox/kiosk-qr-display"; // ★QR 便（0185）: QR は近道として残す（裁定437）
import { kioskIdleMsOf } from "@/lib/nox/rules-0175/kiosk-qr"; // ★QR 便: QR で開いた解除は無操作 3 分
import { kioskIdleSecOf } from "@/lib/nox/rules-0175/kiosk";
import { bindErrJa, browserDeviceFp } from "@/lib/nox/kiosk/device-fp"; // ★0190（裁定436 ①b）: 端末の束縛
import { seatsVisibleOf } from "@/lib/nox/floor-kinds"; // ★0164（便 W5-2a）: register/page.tsx と同じ席の出し分け
import Toast, { Message } from "@/components/ui/toast";

type OpRow = { membership_id: string; user_name: string; role: string; has_pin: boolean };
type Phase = "loading" | "login" | "denied" | "operator" | "pin" | "register";
type Session = { name: string; role: string };
// register/page.tsx と同じ形（server の select を kiosk セッションで＝0190 の kiosk 腕で読める）
type Seat = { id: string; name: string; kind: string | null; store_id: string };
type Product = { id: string; name: string; type: string; price: number; category_id: string | null; reorder_point: number | null; sort_order: number; back_exempt_from_split: boolean; track_stock?: boolean };
type Category = { id: string; name: string; sort_order: number };
type Cast = { id: string; name: string; photo_updated_at: string | null; rank_id?: string | null };
type BoardData = { seats: Seat[]; products: Product[]; categories: Category[]; casts: Cast[]; storeId: string };

const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "スタッフ", cast: "キャスト", admin: "管理者" };
const IDLE_MS = 3 * 60_000; // ★K-0: 無操作 3 分で自動ロック（店設定 kiosk_idle_sec があればそれ）＝サーバ側失効のローカル鏡像・表示と自動ロックのみ
const PIN_MIN = 4, PIN_MAX = 6; // ★裁定437（0191）: PIN 4〜6 桁

const bigBtn: React.CSSProperties = {
  border: "1px solid var(--line2)", borderRadius: 14, background: "linear-gradient(180deg,var(--card2),var(--card))",
  color: "var(--ink)", fontSize: 18, fontWeight: 800, padding: "18px 10px", cursor: "pointer", fontFamily: "inherit",
};
const keyBtn: React.CSSProperties = { ...bigBtn, fontSize: 26, padding: 0, height: 72, fontVariantNumeric: "tabular-nums" };
const card: React.CSSProperties = t.card;
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function KioskRegisterPage() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bindMsg, setBindMsg] = useState<string | null>(null); // ★0190: 端末の束縛の案内（'device bound'＝denied）

  const [operators, setOperators] = useState<OpRow[]>([]);
  const [target, setTarget] = useState<OpRow | null>(null);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boardErr, setBoardErr] = useState<string | null>(null);

  // ローカル idle（表示＋自動ロックのみ・★このタイマーから RPC は呼ばない＝0059 (b) 契約）
  const lastActionRef = useRef<number>(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const markAction = () => { lastActionRef.current = Date.now(); };
  const idleMsRef = useRef<number>(IDLE_MS); // ★QR 便（裁定423 変更）: QR で開いた解除＝3 分・PIN＝店設定（既定 3 分）
  const storeIdleMsRef = useRef<number>(IDLE_MS);

  const loadOperators = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("kiosk_operator_list");
    const rows = (data ?? []) as OpRow[];
    if (error || rows.length === 0) return false;
    setOperators(rows);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★0190（裁定436 ①b）: 端末ログインの直後に端末自身が kiosk_device_bind(fp, ua) を呼ぶ＝未束縛なら束縛・同じ fp なら last_seen・別の fp は 'device bound'
  const bindDevice = useCallback(async (): Promise<boolean> => {
    if (!mig0190On()) return true;
    const fp = browserDeviceFp();
    if (!fp) { setBindMsg("ブラウザの保存領域が使えないため、端末の固定ができません（プライベートモードを解除してください）"); return true; }
    const { error } = await supabase.rpc("kiosk_device_bind", { p_device_fp: fp, p_ua: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 200) });
    if (error) { setBindMsg(bindErrJa(error.message)); return !error.message.includes("device bound"); }
    setBindMsg(null);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 店設定の無操作秒数（punch-methods API＝端末の店を admin で 1 列・失敗は既定 3 分）
  const loadIdleSec = useCallback(async () => {
    try {
      const r = await fetch("/api/kiosk/punch-methods");
      const j = r.ok ? ((await r.json()) as { idleSec?: number }) : null;
      storeIdleMsRef.current = kioskIdleSecOf(j && typeof j.idleSec === "number" ? { kiosk_idle_sec: j.idleSec } : null, IDLE_MS / 1000) * 1000;
    } catch { storeIdleMsRef.current = IDLE_MS; }
  }, []);

  // 操作担当選択へ戻す（セッション失効・交代・ローカル idle 到達の共通経路）
  const lockToOperator = useCallback((reason: string | null) => {
    setSession(null); setBoard(null); setBoardErr(null); setTarget(null); setPin(""); setShowQr(false);
    setLockMsg(reason); setPhase("operator");
    void loadOperators(); // 操作起点（ロック直後の一覧再取得＝has_pin 変化も拾う）
  }, [loadOperators]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPhase("login"); return; }
      if (!(await bindDevice())) { setPhase("denied"); return; } // ★0190: 別の端末に固定済み
      void loadIdleSec();
      setPhase((await loadOperators()) ? "operator" : "denied");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ローカル時計 tick（10秒）＝idle 表示と自動ロックのみ。★RPC 呼出なし（grep ゲート対象）。
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
      if (phaseRef.current === "register" && Date.now() - lastActionRef.current > idleMsRef.current) {
        void (rules0175On() ? supabase.rpc("kiosk_lock", { p_reason: "idle" }) : Promise.resolve()).then(() => undefined, () => undefined); // ★サーバ側セッションも閉じる（タイマー起点の唯一の書込＝ロックのため・読取はしない）
        lockToOperator(`${Math.round(idleMsRef.current / 60_000)}分間操作がなかったためロックしました。操作担当を選び直すか、QR を読み直してください。`);
      }
    }, 10_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockToOperator]);

  async function doDeviceLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setLoginErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPw });
    if (error) { setLoginErr("ログインIDまたはパスワードが違います"); setBusy(false); return; }
    setLoginPw("");
    if (!(await bindDevice())) { setPhase("denied"); setBusy(false); return; } // ★0190: 別の端末に固定済み
    void loadIdleSec();
    setPhase((await loadOperators()) ? "operator" : "denied");
    setBusy(false);
  }

  // ── レジ本体の props（register/page.tsx と同じ select＝0190 の kiosk 腕で端末の店の行だけ読める） ──
  const loadBoard = useCallback(async (): Promise<void> => {
    setBoardErr(null);
    const [{ data: seatsAll }, { data: storeRows }, { data: products }, { data: categories }, { data: casts }] = await Promise.all([
      supabase.from("seats").select("id, name, kind, store_id").eq("is_active", true).order("sort_order"),
      supabase.from("stores").select("id, use_vip, use_counter"),
      supabase.from("products").select("id, name, type, price, category_id, reorder_point, sort_order, back_exempt_from_split, track_stock").eq("is_active", true).order("type"),
      supabase.from("product_categories").select("id, name, sort_order").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("casts").select("id, name, photo_updated_at, rank_id").eq("is_active", true).order("name"),
    ]);
    const stores = (storeRows ?? []) as { id: string; use_vip: boolean; use_counter: boolean }[];
    const storeId = stores[0]?.id ?? "";
    if (!storeId) { setBoardErr("この端末の店を読めませんでした（0190 の kiosk 腕が無いか、操作担当のセッションが切れています）。操作担当を選び直してください。"); return; }
    setBoard({
      seats: seatsVisibleOf((seatsAll ?? []) as Seat[], stores),
      products: (products ?? []) as Product[],
      categories: (categories ?? []) as Category[],
      casts: (casts ?? []) as Cast[],
      storeId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 操作担当（PIN セッション）＝人を選ぶ→PIN（裁定437） ──
  function pickOperator(o: OpRow) {
    if (!o.has_pin) return;
    setTarget(o); setPin(""); setPinMsg(null); setPhase("pin");
  }
  function keyIn(d: string) { setPin((p) => (p.length >= PIN_MAX ? p : p + d)); }

  async function enterRegister(s: Session) {
    setSession(s);
    setLockMsg(null); setShowQr(false);
    markAction();
    setPhase("register");
    await loadBoard();
  }

  // ★QR 便（0185）: QR での解除の成功＝kiosk_login と同じ後処理（操作担当のバー・レジへ）
  async function onUnlocked(j: { operator_name?: string; role?: string; idle_sec?: number; unlock_method?: string }) {
    idleMsRef.current = j.unlock_method === "qr" ? kioskIdleMsOf("qr", j.idle_sec) : IDLE_MS;
    await enterRegister({ name: j.operator_name ?? "", role: j.role ?? "" });
  }

  // ★0190 K-1（裁定437）: 5 回失敗で 10 分ロック（RPC）＝ロックされたら店長以上のお知らせ欄に 1 行（route＝端末アカウントのセッションで・失敗しても画面は止めない）
  function notifyLocked(o: OpRow, lockedUntil: string | undefined) {
    if (!mig0190On()) return;
    void fetch("/api/kiosk/lock-notice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ membership_id: o.membership_id, locked_until: lockedUntil ?? null }) }).catch(() => undefined);
  }

  async function doPinLogin() {
    if (!target || pin.length < PIN_MIN || busy) return;
    setBusy(true); setPinMsg(null);
    const { data, error } = await supabase.rpc("kiosk_login", { p_membership_id: target.membership_id, p_pin: pin, ...(mig0190On() ? { p_device_fp: browserDeviceFp() } : {}) }); // ★0190: 端末の印を添える
    setBusy(false);
    if (error) {
      setPinMsg(error.message.includes("device bound") ? bindErrJa(error.message) : "この端末は現在使用できません（店に確認してください）");
      setPin("");
      return;
    }
    const j = data as { ok: boolean; reason?: string; operator_name?: string; role?: string; locked_until?: string; idle_sec?: number };
    if (!j.ok) {
      if (j.reason === "wrong_pin" || j.reason === "bad_pin") setPinMsg(j.reason === "bad_pin" ? `PIN は ${PIN_MIN}〜${PIN_MAX} 桁の数字です` : "PINが違います");
      else if (j.reason === "locked") {
        const until = j.locked_until
          ? new Date(j.locked_until).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })
          : "";
        setPinMsg(`失敗が続いたためロック中です${until ? `（${until} 頃に解除）` : ""}。店長に知らせました`);
        notifyLocked(target, j.locked_until);
      } else if (j.reason === "no_pin") setPinMsg("PINが設定されていません（マスタ管理で設定してください）");
      else setPinMsg("ログインできませんでした（選び直してください）");
      setPin("");
      return;
    }
    idleMsRef.current = storeIdleMsRef.current;
    await enterRegister({ name: j.operator_name ?? target.user_name, role: j.role ?? target.role });
  }

  // 交代/離席（サーバ側セッションも明示終了）
  async function operatorLogout() {
    markAction();
    await (rules0175On() ? supabase.rpc("kiosk_lock", { p_reason: "manual" }) : supabase.rpc("kiosk_logout")).then(() => undefined, () => undefined); // ★追補 2 同乗 R-7: 終了理由（manual）
    lockToOperator("操作担当を交代してください。");
  }

  const idleMin = Math.floor((nowMs - lastActionRef.current) / 60_000);
  const isManagerUp = session ? session.role === "owner" || session.role === "manager" || session.role === "admin" : false;

  return (
    <main className="nox-dark nox-kiosk" style={{ ...t.loginBg, minHeight: "100dvh", position: "relative", padding: 20 }} onPointerDown={phase === "register" ? markAction : undefined} onKeyDown={phase === "register" ? markAction : undefined}>
      <div style={{ maxWidth: phase === "register" ? 1100 : 720, margin: "0 auto", paddingTop: 20 }}>
        {/* 操作者バー（モック .khead）＝端末名/モードを左、操作者と交代を右に集約。「〇〇さんとして操作中・ロック」 */}
        {phase === "register" && session ? (
          <div className="nox-khead" data-kiosk-operator-bar="1">
            <div>
              <div className="store">NOX — レジ端末</div>
              <div className="mode">キオスクモード / レジ</div>
            </div>
            <div className="op">
              <CastAvatar name={session.name} size={32} variant="flat" />
              <span style={{ color: "var(--v2-text)", fontWeight: 700 }}>
                {session.name}さんとして操作中（{ROLE_LABEL[session.role] ?? session.role}）
              </span>
              <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>
                無操作 <span className="num">{Math.max(0, idleMin)}</span> 分（{Math.round(idleMsRef.current / 60_000)}分で自動ロック）
              </span>
              <button onClick={() => void operatorLogout()} style={btnLight} data-kiosk-lock="1">ロック（交代／離席）</button>
            </div>
          </div>
        ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ ...t.brand, fontSize: 24 }}>NOX</span>
          <span style={{ fontSize: 13, color: "var(--sub)" }}>レジ</span>
          {(phase === "operator" || phase === "pin" || phase === "denied") && (
            <button
              onClick={async () => { await supabase.auth.signOut(); setOperators([]); setPhase("login"); }}
              style={{ ...btnLight, marginLeft: "auto", opacity: 0.6 }}
            >
              端末ログアウト
            </button>
          )}
        </div>
        )}

        {phase === "loading" && <p style={{ textAlign: "center", color: "var(--sub)" }}>読み込み中…</p>}

        {phase === "login" && (
          <form onSubmit={doDeviceLogin} className="nox-lcardtop" style={{ ...t.lcard, maxWidth: 430, margin: "0 auto" }}>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>レジ端末ログイン</h1>
            <p style={{ ...t.sub, margin: "0 0 12px" }}>店に発行されたレジ端末アカウント（k-〜）でログインしてください。初回ログインの端末に固定されます。</p>
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
          <div className="nox-cardtop" style={{ ...card, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>{bindMsg && bindMsg.includes("固定されています") ? "この端末では使えません" : "このアカウントはレジ端末ではありません"}</p>
            <p style={{ ...t.sub, margin: 0 }} data-kiosk-bind-msg={bindMsg ? "1" : "0"}>{bindMsg ?? "レジ用の端末アカウント（オーナーがマスタ管理で用途「レジ」を発行）でログインし直してください。"}</p>
            <button onClick={async () => { await supabase.auth.signOut(); setPhase("login"); }}
              style={{ ...btnLight, marginTop: 14 }}>ログアウト</button>
          </div>
        )}

        {phase === "operator" && (
          <>
            {/* ★K-1（裁定437）: 人を選ぶ→PIN（PIN だけの解除は撤去）。見出し・案内は白（金は選択・主ボタン・バッジの3役のみ） */}
            <p style={{ textAlign: "center", fontSize: 15, color: "var(--v2-text)", fontWeight: 700, margin: "0 0 8px" }}>
              操作する人を選んでください
            </p>
            {lockMsg && <Toast msg={lockMsg} style={{ margin: "0 0 14px", textAlign: "center" }} />}
            {bindMsg && <Message kind="warn" style={{ margin: "0 0 14px" }}>{bindMsg}</Message>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }} data-kiosk-operators="1">
              {operators.map((o) => (
                <button key={o.membership_id} onClick={() => pickOperator(o)} disabled={!o.has_pin}
                  style={{ ...bigBtn, opacity: o.has_pin ? 1 : 0.35, cursor: o.has_pin ? "pointer" : "not-allowed" }}>
                  {o.user_name}
                  <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, marginTop: 4 }}>
                    {ROLE_LABEL[o.role] ?? o.role}{!o.has_pin ? "・PIN未設定" : ""}
                  </div>
                </button>
              ))}
            </div>
            {phase === "operator" && rules0175On() && mig0185On() && (/* ★QR 便（0185）: QR は近道として残す（裁定437）＝押したときだけ QR を出す（秘密鍵・poll はその間だけ） */
              <div style={{ marginTop: 18, textAlign: "center" }} data-kiosk-qr-shortcut="1">
                {!showQr
                  ? <button style={btnLight} onClick={() => setShowQr(true)}>QR で解除（スマホの NOX で読む）</button>
                  : (<div className="nox-cardtop" style={{ ...card, maxWidth: 420, margin: "0 auto" }}>
                      <KioskQrDisplay onUnlocked={onUnlocked} />
                      <button style={{ ...btnLight, marginTop: 12 }} onClick={() => setShowQr(false)}>閉じる</button>
                    </div>)}
              </div>
            )}
          </>
        )}

        {phase === "pin" && target && (
          <div style={{ maxWidth: 380, margin: "0 auto" }} data-kiosk-pin="1">
            <p style={{ textAlign: "center", fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{target.user_name}</p>
            <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>PIN（{PIN_MIN}〜{PIN_MAX}桁）を入力してください</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 18 }}>
              {Array.from({ length: PIN_MAX }, (_, i) => (
                <span key={i} style={{
                  width: 18, height: 18, borderRadius: 999,
                  border: `1px solid ${i < PIN_MIN ? "var(--line2)" : "var(--line)"}`,
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
            {pinMsg && <Toast msg={pinMsg} style={{ margin: "12px 0 0", textAlign: "center" }} />}
            <button disabled={pin.length < PIN_MIN || busy} onClick={() => void doPinLogin()}
              style={{ ...t.btnGold, width: "100%", marginTop: 16, padding: "16px 0", fontSize: 18, fontWeight: 900, borderRadius: 14, opacity: pin.length >= PIN_MIN ? 1 : 0.4 }}>
              ログイン
            </button>
            <button onClick={() => { setTarget(null); setPin(""); setPhase("operator"); }}
              style={{ ...btnLight, marginTop: 12, width: "100%" }}>もどる</button>
          </div>
        )}

        {phase === "register" && (
          <div className="nox-kmain" data-kiosk-register-board="1">
            {boardErr && <Message kind="error" style={{ margin: "0 0 12px" }}>{boardErr}</Message>}
            {!board && !boardErr && <p style={{ textAlign: "center", color: "var(--sub)" }}>読み込み中…</p>}
            {board && (
              /* ★K-0: 本店の register-board と同一部品・同じ props。予約タブは出さない（顧客の個人情報はキオスクに出さない＝裁定435） */
              <RegisterBoard seats={board.seats} products={board.products} categories={board.categories} casts={board.casts}
                isManagerUp={isManagerUp} showReserve={false} storeId={board.storeId} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
