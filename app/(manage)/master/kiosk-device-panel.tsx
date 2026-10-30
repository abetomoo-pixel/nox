"use client";

// キオスク端末（打刻・レジ）の発行／無効化（owner 専用・mig0043）。
//
// ★M-11a（2026-08-27）: モック nox-staff-system-settings の2カラム構成へ追随
//   （左=登録端末の表／右=発行カード＋最近の操作。narrow は .nox-2col が1カラムへ落とす）。
//   ★fetch 先・POST body・RPC・引数・エラー文言・発行モーダルは DP1 P1 から逐語で不変＝表示と配置のみ。
//   ★モックの「最終アクセス」列は kiosk_devices に列が無いため出さない（教訓25・M-11b①へ起票済み）。
//   ★「最近の操作」の写像: audit after_json（= kiosk_devices 行）から purpose を読んで
//     「打刻端末を発行」「レジ端末を発行」「端末を無効化」へ日本語化。
//     ★「端末を有効化」の action は live に存在しない（kiosk_provision / kiosk_deactivate の2種のみ）＝出さない。
//     ★0190（2026-10-30）: kiosk_reactivate／kiosk_delete／kiosk_device_unbind／kiosk_device_bind が増えた＝「端末を有効化」「端末を削除」「端末の固定を解除」「端末を固定」。
//
// ★0190（裁定436 ①b／便 K ⑦ M-29 ⑤）: 列「端末の固定」（固定済＋「固定を解除」＝kiosk_device_unbind を owner セッションで直接／未固定）・
//   無効化した端末の操作＝「再発行して有効化」（route action reactivate＝reissue と同じ 1 回だけのモーダル）／「削除」（route action delete・Danger）・上限 3 台＝kioskDeviceLimit()。
//   フラグ false の間は従来どおり（列なし・注記のまま・上限 1 台の文言）。
//
// 発行/無効化は POST /api/kiosk/provision、一覧は GET 同 route
// （kiosk_devices は deny-all＝owner でも直 SELECT 不可のため route が唯一の管理用読み口）。
// 初期パスワードは cast 招待と同じ「一度だけ表示」モーダル。真の防御は RPC（owner 限定・1店1台・bad target）。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

import { Message } from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { useIsDemo } from "@/lib/nox/demo/context"; // ★便 M3 M-28 ③
import { kioskErrJa, kioskDeviceLimit } from "@/lib/nox/kiosk/device-errors"; // ★便 M3 M-29 ③: 英語の生文を日本語に // ★0190: 上限は kioskDeviceLimit()（3 台）
import { mig0190On } from "@/lib/nox/rules-0175/flag"; // ★0190（裁定436 ①b／M-29 ⑤）: 端末の固定の列・再発行して有効化・削除
type Store = { id: string; name: string };
// ★0190: bound＝device_fp の有無（route が boolean に写す・fp そのものは来ない）・bound_at／bound_ua＝初回ログインで束縛した日時と UA
type Device = { id: string; store_id: string; label: string | null; purpose: string; is_active: boolean; created_at: string; last_seen_at: string | null; bound: boolean; bound_at: string | null; bound_ua: string | null };
type ProvisionResult = { device_id: string; login_email: string; initial_password: string; reissued?: boolean; reactivated?: boolean };
const PURPOSE_LABEL: Record<string, string> = { punch: "打刻", register: "レジ" };
const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "スタッフ" };

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

/** 相対時刻（N分前／N時間前／N日前／それ以前は M/D） */
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export default function KioskDevicePanel({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<"punch" | "register">("punch");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [issued, setIssued] = useState<(ProvisionResult & { purpose: "punch" | "register" }) | null>(null);
  const [copied, setCopied] = useState(false);
  // E8-5 staff#4: 端末設定の監査履歴（audit_logs は既に記録済み＝画面側の読取追加のみ・直近10件）
  // ★M-11a: after_json（kiosk_devices 行）から purpose を読んで写像に使う。actor はロール名で出す。
  const isDemo = useIsDemo(); // ★便 M3 M-28 ③
  const [kioskAudit, setKioskAudit] = useState<{ id: string; action: string; target: string; at: string; after_json: Record<string, unknown> | null; actor_user_id: string | null }[]>([]);
  const [roleByUser, setRoleByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void supabase.from("audit_logs").select("id, action, target, at, after_json, actor_user_id")
      .in("action", ["kiosk_provision", "kiosk_deactivate", "kiosk_reactivate", "kiosk_delete", "kiosk_device_unbind", "kiosk_device_bind"]) // ★0190: 有効化・削除・固定の解除・固定（端末自身が bind＝audit_log_write_service）
      .order("at", { ascending: false }).limit(10)
      .then(({ data }) => { if (alive) setKioskAudit((data ?? []) as typeof kioskAudit); });
    // actor → ロール名（memberships はこの owner の可視範囲・active のみ採用）
    void supabase.from("memberships").select("user_id, role, is_active")
      .then(({ data }) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        for (const r of (data ?? []) as { user_id: string; role: string; is_active: boolean }[]) {
          if (r.is_active && !m[r.user_id]) m[r.user_id] = r.role;
        }
        setRoleByUser(m);
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/kiosk/provision");
      if (!res.ok) return;
      const j = (await res.json()) as { devices: Device[] };
      setDevices(j.devices ?? []);
    } catch {
      /* 一覧は補助表示＝失敗しても操作系は生きる */
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function provision() {
    if (!storeId || busy) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/kiosk/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "provision", storeId, label: label || null, purpose, idemKey: crypto.randomUUID() }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(kioskErrJa(res.status, j.error, PURPOSE_LABEL[purpose] ?? purpose)); return; } // ★便 M3 M-29 ③
      setIssued({ ...(j as ProvisionResult), purpose }); setCopied(false); setLabel("");
      await reload();
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(d: Device) {
    if (busy) return;
    if (!confirm(`${storeName(d.store_id)} のキオスク端末（${PURPOSE_LABEL[d.purpose] ?? d.purpose}）を無効化しますか？（この端末では利用できなくなります）`)) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/kiosk/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deactivate", deviceId: d.id }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(kioskErrJa(res.status, j.error, PURPOSE_LABEL[d.purpose] ?? d.purpose)); return; } // ★便 M3 M-29 ③
      setMsg("端末を無効化しました");
      await reload();
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // ★便 M3 M-29 ②: 認証情報を再発行（旧い PW は即時無効・新しい ID／PASS を発行時と同じモーダルで 1 回だけ）
  async function reissue(d: Device) {
    if (busy) return;
    if (!confirm(`${storeName(d.store_id)} のキオスク端末（${d.label ?? PURPOSE_LABEL[d.purpose] ?? d.purpose}）の認証情報を再発行しますか？（今のパスワードはすぐ使えなくなります）`)) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/kiosk/provision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reissue", deviceId: d.id }) });
      const j = await res.json();
      if (!res.ok) { setMsg(kioskErrJa(res.status, j.error, PURPOSE_LABEL[d.purpose] ?? d.purpose)); return; }
      setIssued({ ...(j as ProvisionResult), purpose: d.purpose === "register" ? "register" : "punch" }); setCopied(false);
      setMsg("認証情報を再発行しました（新しいパスワードはこの画面だけ）");
      await reload();
    } catch (e) { setMsg(`通信エラー: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  // ★0190（裁定436 ①b）: 端末の固定を解除＝kiosk_device_unbind（owner・device_fp を null に・audit）。次のログインで端末が kiosk_device_bind で固定し直す。
  //   route を介さず owner セッションで RPC を直接呼ぶ（admin 権限は要らない＝RPC の org／owner 照合が本体）。
  async function unbind(d: Device) {
    if (busy) return;
    if (!confirm(`${storeName(d.store_id)} のキオスク端末（${d.label ?? PURPOSE_LABEL[d.purpose] ?? d.purpose}）の固定を解除しますか？（次にログインした端末に固定し直されます）`)) return;
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.rpc("kiosk_device_unbind", { p_device_id: d.id });
      if (error) { setMsg(kioskErrJa(500, error.message, PURPOSE_LABEL[d.purpose] ?? d.purpose)); return; }
      setMsg("端末の固定を解除しました（次のログインで固定し直されます）");
      await reload();
    } catch (e) { setMsg(`通信エラー: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  // ★0190 M-29 ⑤: 無効化した端末を「再発行して有効化」＝route action reactivate（kiosk_reactivate→unban＋新 PW）。結果は reissue と同じモーダル（PW は 1 回だけ）
  async function reactivate(d: Device) {
    if (busy) return;
    if (!confirm(`${storeName(d.store_id)} のキオスク端末（${d.label ?? PURPOSE_LABEL[d.purpose] ?? d.purpose}）を再発行して有効化しますか？（新しいパスワードを 1 回だけ表示します・上限は店舗×用途ごとに ${kioskDeviceLimit()} 台）`)) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/kiosk/provision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reactivate", deviceId: d.id }) });
      const j = await res.json();
      if (!res.ok) { setMsg(kioskErrJa(res.status, j.error, PURPOSE_LABEL[d.purpose] ?? d.purpose)); return; }
      setIssued({ ...(j as ProvisionResult), purpose: d.purpose === "register" ? "register" : "punch" }); setCopied(false);
      setMsg("端末を有効化しました（新しいパスワードはこの画面だけ）");
      await reload();
    } catch (e) { setMsg(`通信エラー: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  // ★0190 M-29 ⑤: 無効化済みの端末を削除＝route action delete（kiosk_delete→auth deleteUser）。履歴は audit_logs（'kiosk_delete'・before_json に行）に残る
  async function deleteDevice(d: Device) {
    if (busy) return;
    if (!confirm(`${storeName(d.store_id)} のキオスク端末（${d.label ?? PURPOSE_LABEL[d.purpose] ?? d.purpose}）を削除しますか？（端末アカウントも消えます・履歴は監査ログに残ります）`)) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/kiosk/provision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", deviceId: d.id }) });
      const j = await res.json();
      if (!res.ok) { setMsg(kioskErrJa(res.status, j.error, PURPOSE_LABEL[d.purpose] ?? d.purpose)); return; }
      setMsg("端末を削除しました");
      await reload();
    } catch (e) { setMsg(`通信エラー: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  async function copyIssued() {
    if (!issued) return;
    await navigator.clipboard.writeText(`${issued.login_email}\n${issued.initial_password}`);
    setCopied(true);
  }

  // 監査行の写像（A-6 実測: action は kiosk_provision / kiosk_deactivate の2種のみ）
  const auditLabel = (a: { action: string; after_json: Record<string, unknown> | null }): string => {
    const p = typeof a.after_json?.purpose === "string" ? (a.after_json.purpose as string) : null;
    if (a.action === "kiosk_provision") {
      return p === "register" ? "レジ端末を発行" : p === "punch" ? "打刻端末を発行" : "端末を発行";
    }
    // ★0190: 有効化・削除・固定の解除・固定（端末自身）
    if (a.action === "kiosk_reactivate") return "端末を有効化";
    if (a.action === "kiosk_delete") return "端末を削除";
    if (a.action === "kiosk_device_unbind") return "端末の固定を解除";
    if (a.action === "kiosk_device_bind") return "端末を固定";
    return "端末を無効化";
  };
  // ★0190: 列＝端末／用途／端末の固定（フラグ true のみ）／最終アクセス／状態／操作
  const columns = mig0190On() ? ["端末", "用途", "端末の固定", "最終アクセス", "状態", "操作"] : ["端末", "用途", "最終アクセス", "状態", "操作"];
  const actorLabel = (uid: string | null): string => {
    const role = uid ? roleByUser[uid] : undefined;
    return role ? (ROLE_LABEL[role] ?? role) : "—";
  };

  return (
    <div>
      <div className="nox-2col nox-2col--32">
        {/* ── 左: 登録端末（主カード） ── */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 style={h3}>登録端末</h3>
            <span className="nox-stpill" style={{ marginLeft: "auto" }} data-kiosk-kpi="1">{devices.length} 台登録・有効 {devices.filter((d) => d.is_active).length}</span>{/* ★便 M3 M-29 ⑥: KPI は一覧と同じ元 */}
          </div>
          <p style={sub}>店舗で使用できる打刻・レジ端末</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                  {columns.map((h) => (
                    <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <tr><td colSpan={columns.length} style={{ padding: 8, color: "var(--sub)" }} data-kiosk-empty={isDemo ? "demo" : "none"}>{isDemo ? "デモ環境では端末を発行できません" : "（発行済みの端末はありません）"}</td></tr>
                )}{/* ★便 M3 M-28 ③ */}
                {devices.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden style={{
                          width: 24, height: 24, borderRadius: 6, display: "inline-grid", placeItems: "center",
                          background: "var(--bg2)", border: "1px solid var(--line2)", color: "var(--champ)", fontWeight: 800, fontSize: 11,
                        }}>{d.purpose === "register" ? "R" : "T"}</span>
                        <span>
                          <b>{d.label ?? (PURPOSE_LABEL[d.purpose] ?? d.purpose)}</b>
                          <small style={{ display: "block", color: "var(--sub)" }}>{storeName(d.store_id)}</small>
                        </span>
                      </span>
                    </td>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>{PURPOSE_LABEL[d.purpose] ?? d.purpose}</td>
                    {/* ★0190（裁定436 ①b）: 端末の固定＝初回ログインで端末が device_fp を束縛（kiosk_device_bind）。別の端末からは 'device bound'。解除は owner（kiosk_device_unbind）＝次のログインで固定し直す */}
                    {mig0190On() && (
                      <td style={{ padding: 6, whiteSpace: "nowrap" }} data-kiosk-bound={d.bound ? "1" : "0"}>
                        {d.bound ? (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} title={d.bound_ua ?? undefined}>
                            <span>固定済{d.bound_at ? `（${relTime(d.bound_at)}）` : ""}</span>
                            <button style={btn} disabled={busy} onClick={() => void unbind(d)} data-kiosk-unbind={d.id}>固定を解除</button>
                          </span>
                        ) : <span style={{ color: "var(--sub)" }}>未固定（初回ログインで固定）</span>}
                      </td>
                    )}
                    {/* ★最終アクセス（モックの5列構成・相対表記）: 打刻端末は kiosk_punch 成功時（mig0109）・
                        レジ端末は kiosk_login 成功時（mig0108）に last_seen_at が入る。未打刻/未ログインは null＝「—」。
                        IP は出さない（モックの端末表に列が無い＝裁定 2026-08-28。API も返していない）。 */}
                    <td style={{ padding: 6, whiteSpace: "nowrap", color: d.last_seen_at ? undefined : "var(--sub)" }}>
                      {d.last_seen_at ? relTime(d.last_seen_at) : "—"}
                    </td>
                    <td style={{ padding: 6, color: d.is_active ? "var(--ok)" : "var(--sub)" }}>{d.is_active ? "有効" : "無効"}</td>
                    <td style={{ padding: 6 }}>
                      {d.is_active && (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                          <button style={btn} disabled={busy} onClick={() => void reissue(d)} data-kiosk-reissue={d.id}>認証情報を再発行</button>{/* ★便 M3 M-29 ② */}
                          <button style={btn} disabled={busy} onClick={() => void deactivate(d)}>無効化</button>
                        </span>
                      )}
                      {!d.is_active && mig0190On() && (/* ★0190 M-29 ⑤: 無効化した端末＝「再発行して有効化」（kiosk_reactivate＋unban＋新 PW）／「削除」（kiosk_delete＋deleteUser・Danger＝staff-board の在籍を解除と同じ色） */
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                          <button style={btn} disabled={busy} onClick={() => void reactivate(d)} data-kiosk-reactivate={d.id}>再発行して有効化</button>
                          <button style={{ ...btn, color: "var(--danger)", border: "1px solid var(--danger-bd)" }} disabled={busy} onClick={() => void deleteDevice(d)} data-kiosk-delete={d.id}>削除</button>
                        </span>
                      )}
                      {!d.is_active && !mig0190On() && <span style={{ fontSize: 11, color: "var(--sub)" }} data-kiosk-inactive-ops="0190">再発行して有効化・削除＝0190 の後</span>}{/* ★便 M3 M-29 ⑤: RPC が無い（kiosk_reactivate／kiosk_delete＝0190）＝置かない（フラグ false の間だけ） */}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {msg && (/^(端末を無効化しました|認証情報を再発行しました|端末を有効化しました|端末を削除しました|端末の固定を解除しました)/.test(msg) ? <div style={{ margin: "8px 0 0" }}><Message kind="success">{msg}</Message></div> : <div style={{ margin: "8px 0 0" }}><Message kind="error">{msg}</Message></div>)}{/* ★便 M3 M-29: 成功＝緑の帯・失敗＝赤 */}
        </section>

        {/* ── 右: 発行カード＋最近の操作 ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h3 style={h3}>端末アカウントを発行</h3>
            </div>
            <p style={sub}>認証情報は発行時に一度だけ表示されます（上限＝店舗×用途ごとに {kioskDeviceLimit()} 台）</p>{/* ★0190: 3 台（無効は数えない） */}
            <p style={{ ...t.alert, fontSize: 11.5, margin: "0 0 10px" }}>
              安全な運用：端末ごとに専用アカウントを発行し、共有しないでください。
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {/* ★M-11b 4-f: 店舗／用途はモック同様の横並び（narrow は auto-fit で1カラムへ落ちる） */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>店舗</span>
                  <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={inp}>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>用途</span>
                  <SegSelect value={purpose} onChange={(v) => setPurpose(v === "register" ? "register" : "punch")}
                    options={[["punch", "打刻（タイムレコーダー）"], ["register", "レジ（会計）"]] as const} />
                  <span style={{ fontSize: 10.5, color: "var(--sub)" }}>
                    打刻＝名前選択＋PIN（「キャスト管理」で設定）／レジ＝操作担当選択＋PIN（「操作担当PIN」タブで設定）。
                  </span>
                </label>
              </div>
              <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>端末ラベル（任意）</span>
                <input placeholder="例: 入口タブレット" value={label} onChange={(e) => setLabel(e.target.value)} style={inp} />
              </label>
              <div className="nox-actions">
                <button onClick={() => void provision()} disabled={busy || !storeId} style={btnOn}>アカウントを発行</button>
              </div>
            </div>
          </section>

          {/* E8-5 staff#4: 端末設定の監査履歴（発行・無効化＝audit_logs 直近10件・読取のみ。全量は /audit へ） */}
          {kioskAudit.length > 0 && (
            <section className="nox-cardtop" style={card}>
              <h3 style={h3}>最近の操作</h3>
              <p style={sub}>端末設定の監査履歴（直近10件）</p>
              {kioskAudit.map((a) => (
                <div key={a.id} title={a.target}
                  style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: "var(--ink)" }}>{auditLabel(a)}</b>
                    <small style={{ display: "block", color: "var(--sub)" }}>{actorLabel(a.actor_user_id)}が実行</small>
                  </span>
                  <span className="num" style={{ marginLeft: "auto", color: "var(--v2-muted)", whiteSpace: "nowrap" }}>{relTime(a.at)}</span>
                </div>
              ))}
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>すべての履歴は「操作履歴」ページ（権限・端末ビュー）で確認できます。</p>
            </section>
          )}
        </div>
      </div>

      {/* 発行結果モーダル（PW は一度だけ表示＝cast 招待と同パターン） */}
      {issued && (
        <Modal onClose={() => setIssued(null)}>
            <h3 style={h3}>{issued.reactivated ? "端末を再発行して有効化しました" : issued.reissued ? "認証情報を再発行しました" : "キオスク端末を発行しました"}</h3>{/* ★0190: reactivate も同じモーダル */}
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{issued.login_email}</span></div>
              <div style={t.bdRow}><span style={t.bdKey}>初期パスワード</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{issued.initial_password}</span></div>
            </div>
            <p style={{ ...t.alert, marginBottom: 10 }}>
              このパスワードは再表示できません。端末のブラウザで {issued.purpose === "register" ? "/kiosk-register" : "/kiosk"} を開いてログインしてください。
            </p>
            <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
              <button style={btn} onClick={() => void copyIssued()}>{copied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
              <button style={btnOn} onClick={() => setIssued(null)}>閉じる</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
