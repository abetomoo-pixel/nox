"use client";

// F4a キオスク端末管理（owner 専用・mig0043）。発行/無効化は POST /api/kiosk/provision、
// 一覧は GET 同 route（kiosk_devices は deny-all＝owner でも直 SELECT 不可のため route が唯一の管理用読み口）。
// 初期パスワードは cast 招待と同じ「一度だけ表示」モーダル。真の防御は RPC（owner 限定・1店1台・bad target）。
// K（mig0056）: 用途 'punch'（打刻）/'register'（レジ）＝1店1台×用途。レジ端末の操作担当 PIN
//   （set_staff_pin・membership 単位＝裁定11 確定③）の設定セクションを同居（staff_pin は deny-all＝
//   設定状況は読めない・上書き設定のみ。対象＝owner/manager/staff(can_register)＝RPC 側と同条件）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

type Store = { id: string; name: string };
type Device = { id: string; store_id: string; label: string | null; purpose: string; is_active: boolean; created_at: string };
type ProvisionResult = { device_id: string; login_email: string; initial_password: string };
type OpMember = { id: string; store_id: string; role: string; user_name: string };
const PURPOSE_LABEL: Record<string, string> = { punch: "打刻", register: "レジ" };
const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "黒服" };

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

export default function KioskPanel({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<"punch" | "register">("punch");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [issued, setIssued] = useState<(ProvisionResult & { purpose: "punch" | "register" }) | null>(null);
  const [copied, setCopied] = useState(false);
  // 操作担当 PIN（レジ端末）: 対象 membership 一覧＋行ごとの PIN 入力
  const [opMembers, setOpMembers] = useState<OpMember[]>([]);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinMsg, setPinMsg] = useState("");

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

  // 操作担当 PIN 対象＝owner/manager/staff(can_register)（set_staff_pin の bad target 条件と同一）。
  // memberships→users は2クエリでクライアント側結合（RLS: owner/manager の可視範囲で読める分だけ表示）。
  const loadOpMembers = useCallback(async () => {
    const { data: mems } = await supabase
      .from("memberships")
      .select("id, user_id, store_id, role, can_register, is_active");
    const eligible = (mems ?? []).filter(
      (m) => m.is_active && (m.role === "owner" || m.role === "manager" || (m.role === "staff" && m.can_register)),
    );
    const userIds = Array.from(new Set(eligible.map((m) => m.user_id as string)));
    const { data: us } = userIds.length
      ? await supabase.from("users").select("id, name").in("id", userIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const nameOf = (uid: string) => (us ?? []).find((u) => u.id === uid)?.name ?? "（不明）";
    setOpMembers(eligible.map((m) => ({
      id: m.id as string, store_id: m.store_id as string, role: m.role as string,
      user_name: nameOf(m.user_id as string),
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void reload(); void loadOpMembers(); }, [reload, loadOpMembers]);

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

  // set_staff_pin（mig0056・owner/manager 自店＝RPC 側が強制。PIN は保存せず送信のみ・上書き設定）
  async function setStaffPin(membershipId: string) {
    const p = (pinInputs[membershipId] ?? "").trim();
    if (!/^[0-9]{4}$/.test(p)) { setPinMsg("PIN は数字4桁で入力してください"); return; }
    setBusy(true); setPinMsg("");
    const { error } = await supabase.rpc("set_staff_pin", { p_membership_id: membershipId, p_pin: p });
    setBusy(false);
    if (error) {
      const m = error.message;
      setPinMsg(m.includes("bad pin") ? "PIN は数字4桁で入力してください"
        : m.includes("bad target") ? "この担当は PIN 設定の対象外です"
        : m.includes("inactive membership") ? "無効な担当です"
        : m.includes("not found") ? "担当が見つかりません"
        : m.includes("forbidden") ? "権限がありません（自店の担当のみ設定できます）" : m);
      return;
    }
    setPinInputs((v) => ({ ...v, [membershipId]: "" }));
    setPinMsg("PIN を設定しました（失敗回数・ロックもリセット）");
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

  return (
    <div style={{ maxWidth: 720, marginTop: 24 }}>
      <h2 style={h2}>キオスク端末（打刻・レジ）</h2>

      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>端末アカウントの発行（1店1台×用途）</h3>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          店に置くタブレット用のログインアカウントを発行します。用途「打刻」は名前選択＋PIN（4桁・「女の子管理」で設定）、
          用途「レジ」は操作担当選択＋PIN（4桁・下の「操作担当 PIN」で設定）です。初期パスワードは発行時に一度だけ表示されます。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={inp}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value === "register" ? "register" : "punch")} style={inp}>
            <option value="punch">打刻（タイムレコーダー）</option>
            <option value="register">レジ（会計）</option>
          </select>
          <input placeholder="ラベル（例: 入口タブレット・任意）" value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inp, width: 200 }} />
          <button onClick={() => void provision()} disabled={busy || !storeId} style={btnOn}>発行</button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["店舗", "用途", "ラベル", "状態", "操作"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 8, color: "var(--sub)" }}>（発行済みの端末はありません）</td></tr>
              )}
              {devices.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{storeName(d.store_id)}</td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{PURPOSE_LABEL[d.purpose] ?? d.purpose}</td>
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

      {/* 操作担当 PIN（レジ端末・set_staff_pin＝mig0056）。staff_pin は deny-all＝設定状況は表示できない
          （設定済みかは端末のログイン画面の「PIN未設定」表示で確認）。設定は常に上書き＝ロックも解除。 */}
      <section className="nox-cardtop" style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>操作担当 PIN（レジ端末）</h3>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          レジ端末で会計を操作する担当（オーナー・店長・会計権限のある黒服）の PIN（4桁）を設定します。
          設定は上書きで、PIN の失敗ロックも解除されます。設定済みかどうかはレジ端末のログイン画面で確認できます。
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["店舗", "担当", "役割", "PIN（4桁）", "操作"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opMembers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 8, color: "var(--sub)" }}>（対象の担当がいません）</td></tr>
              )}
              {opMembers.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{storeName(m.store_id)}</td>
                  <td style={{ padding: 6, fontWeight: 700 }}>{m.user_name}</td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{ROLE_LABEL[m.role] ?? m.role}</td>
                  <td style={{ padding: 6 }}>
                    <input
                      value={pinInputs[m.id] ?? ""} inputMode="numeric" maxLength={4} placeholder="0000"
                      onChange={(e) => setPinInputs((v) => ({ ...v, [m.id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }))}
                      style={{ ...inp, width: 70, fontVariantNumeric: "tabular-nums" }}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <button style={btnOn} disabled={busy || (pinInputs[m.id] ?? "").length !== 4}
                      onClick={() => void setStaffPin(m.id)}>設定</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pinMsg && <p style={{ fontSize: 12, color: pinMsg.includes("しました") ? "var(--ok)" : "var(--bad)", margin: "8px 0 0" }}>{pinMsg}</p>}
      </section>

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
