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
//
// 発行/無効化は POST /api/kiosk/provision、一覧は GET 同 route
// （kiosk_devices は deny-all＝owner でも直 SELECT 不可のため route が唯一の管理用読み口）。
// 初期パスワードは cast 招待と同じ「一度だけ表示」モーダル。真の防御は RPC（owner 限定・1店1台・bad target）。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

type Store = { id: string; name: string };
type Device = { id: string; store_id: string; label: string | null; purpose: string; is_active: boolean; created_at: string };
type ProvisionResult = { device_id: string; login_email: string; initial_password: string };
const PURPOSE_LABEL: Record<string, string> = { punch: "打刻", register: "レジ" };
const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "黒服" };

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
  const [kioskAudit, setKioskAudit] = useState<{ id: string; action: string; target: string; at: string; after_json: Record<string, unknown> | null; actor_user_id: string | null }[]>([]);
  const [roleByUser, setRoleByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void supabase.from("audit_logs").select("id, action, target, at, after_json, actor_user_id")
      .in("action", ["kiosk_provision", "kiosk_deactivate"])
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
      if (!res.ok) { setMsg(`エラー(${res.status}): ${j.error ?? ""}`); return; }
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
      if (!res.ok) { setMsg(`エラー(${res.status}): ${j.error ?? ""}`); return; }
      setMsg("端末を無効化しました");
      await reload();
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
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
    return "端末を無効化";
  };
  const actorLabel = (uid: string | null): string => {
    const role = uid ? roleByUser[uid] : undefined;
    return role ? (ROLE_LABEL[role] ?? role) : "—";
  };

  return (
    <div>
      <div className="nox-2col">
        {/* ── 左: 登録端末（主カード） ── */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 style={h3}>登録端末</h3>
            <span className="nox-stpill" style={{ marginLeft: "auto" }}>{devices.length}台</span>
          </div>
          <p style={sub}>店舗で使用できる打刻・レジ端末</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                  {["端末", "用途", "状態", "操作"].map((h) => (
                    <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 8, color: "var(--sub)" }}>（発行済みの端末はありません）</td></tr>
                )}
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
                    <td style={{ padding: 6, color: d.is_active ? "var(--ok)" : "var(--sub)" }}>{d.is_active ? "有効" : "無効"}</td>
                    <td style={{ padding: 6 }}>
                      {d.is_active && (
                        <button style={btn} disabled={busy} onClick={() => void deactivate(d)}>無効化</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {msg && <p style={{ fontSize: 12, color: msg.startsWith("エラー") || msg.startsWith("通信") ? "var(--bad)" : "var(--ok)", margin: "8px 0 0" }}>{msg}</p>}
        </section>

        {/* ── 右: 発行カード＋最近の操作 ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h3 style={h3}>端末アカウントを発行</h3>
              <span className="nox-stpill" style={{ marginLeft: "auto" }}>OWNER</span>
            </div>
            <p style={sub}>認証情報は発行時に一度だけ表示されます</p>
            <p style={{ ...t.alert, fontSize: 11.5, margin: "0 0 10px" }}>
              安全な運用：端末ごとに専用アカウントを発行し、共有しないでください。
            </p>
            <div style={{ display: "grid", gap: 8 }}>
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
              <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>端末ラベル（任意）</span>
                <input placeholder="例: 入口タブレット" value={label} onChange={(e) => setLabel(e.target.value)} style={inp} />
              </label>
              <div style={{ textAlign: "right" }}>
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
            <h3 style={h3}>キオスク端末を発行しました</h3>
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{issued.login_email}</span></div>
              <div style={t.bdRow}><span style={t.bdKey}>初期パスワード</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{issued.initial_password}</span></div>
            </div>
            <p style={{ ...t.alert, marginBottom: 10 }}>
              このパスワードは再表示できません。端末のブラウザで {issued.purpose === "register" ? "/kiosk-register" : "/kiosk"} を開いてログインしてください。
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn} onClick={() => void copyIssued()}>{copied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
              <button style={btnOn} onClick={() => setIssued(null)}>閉じる</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
