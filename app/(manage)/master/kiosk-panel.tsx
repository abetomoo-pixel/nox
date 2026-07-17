"use client";

// F4a キオスク端末管理（owner 専用・mig0043）。発行/無効化は POST /api/kiosk/provision、
// 一覧は GET 同 route（kiosk_devices は deny-all＝owner でも直 SELECT 不可のため route が唯一の管理用読み口）。
// 初期パスワードは cast 招待と同じ「一度だけ表示」モーダル。真の防御は RPC（owner 限定・1店1台・bad target）。
import { useCallback, useEffect, useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

type Store = { id: string; name: string };
type Device = { id: string; store_id: string; label: string | null; is_active: boolean; created_at: string };
type ProvisionResult = { device_id: string; login_email: string; initial_password: string };

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

export default function KioskPanel({ stores }: { stores: Store[] }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [issued, setIssued] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

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
        body: JSON.stringify({ action: "provision", storeId, label: label || null, idemKey: crypto.randomUUID() }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(`エラー(${res.status}): ${j.error ?? ""}`); return; }
      setIssued(j as ProvisionResult); setCopied(false); setLabel("");
      await reload();
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(d: Device) {
    if (busy) return;
    if (!confirm(`${storeName(d.store_id)} のキオスク端末を無効化しますか？（この端末では打刻できなくなります）`)) return;
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

  return (
    <div style={{ maxWidth: 720, marginTop: 24 }}>
      <h2 style={h2}>キオスク打刻端末</h2>

      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>端末アカウントの発行（1店1台）</h3>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          店に置くタブレット用のログインアカウントを発行します。端末では名前選択＋PIN（4桁）で打刻します
          （PIN は「女の子管理」で設定）。初期パスワードは発行時に一度だけ表示されます。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={inp}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input placeholder="ラベル（例: 入口タブレット・任意）" value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inp, width: 200 }} />
          <button onClick={() => void provision()} disabled={busy || !storeId} style={btnOn}>発行</button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["店舗", "ラベル", "状態", "操作"].map((h) => (
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
                  <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{storeName(d.store_id)}</td>
                  <td style={{ padding: 6 }}>{d.label ?? "—"}</td>
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

      {/* 発行結果モーダル（PW は一度だけ表示＝cast 招待と同パターン） */}
      {issued && (
        <Modal onClose={() => setIssued(null)}>
            <h3 style={h3}>キオスク端末を発行しました</h3>
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{issued.login_email}</span></div>
              <div style={t.bdRow}><span style={t.bdKey}>初期パスワード</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{issued.initial_password}</span></div>
            </div>
            <p style={{ ...t.alert, marginBottom: 10 }}>このパスワードは再表示できません。端末のブラウザで /kiosk を開いてログインしてください。</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn} onClick={() => void copyIssued()}>{copied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
              <button style={btnOn} onClick={() => setIssued(null)}>閉じる</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
