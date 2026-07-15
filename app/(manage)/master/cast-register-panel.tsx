"use client";

// F3g キャスト会計（mig0039）UI。2段ゲート＝店フラグ（settings_json.cast_register_enabled・owner のみ）
// ∧ cast 別 can_register（membership・owner/manager）。両方 true のときだけ当該 cast がレジ会計を使える。
// 真の防御は会計 RLS/RPC の cast 2段ゲート（auth_cast_can_register）＝ここは操作 UI（RPC は二重に守る）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type CastRow = { id: string; name: string; membershipId: string | null; canRegister: boolean };

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };

export default function CastRegisterPanel({
  storeId, isOwner, initialEnabled, casts,
}: {
  storeId: string;
  isOwner: boolean;
  initialEnabled: boolean;
  casts: CastRow[];
}) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rows, setRows] = useState<CastRow[]>(casts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function switchStore(next: boolean) {
    if (next === enabled || busy) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_store_cast_register", { p_store_id: storeId, p_enabled: next });
    if (error) setMsg(`エラー: ${error.message}`);
    else { setEnabled(next); setMsg(`店のキャスト会計を「${next ? "有効" : "無効"}」にしました`); }
    setBusy(false);
  }

  async function toggleCast(row: CastRow) {
    if (busy || !row.membershipId) return;
    const next = !row.canRegister;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_cast_register", { p_membership_id: row.membershipId, p_can_register: next });
    if (error) setMsg(`エラー: ${error.message}`);
    else {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, canRegister: next } : r)));
      setMsg(`${row.name} のレジ会計を「${next ? "許可" : "不許可"}」にしました`);
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 720, marginTop: 24 }}>
      <h2 style={h2}>キャスト会計（レジ操作）</h2>

      {/* 店フラグ（owner のみ操作可・manager は現在値のみ） */}
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>店のキャスト会計</h3>
        <p style={{ fontSize: 13, margin: "4px 0" }}>
          現在: <strong style={{ color: enabled ? "var(--ok)" : "var(--sub)" }}>{enabled ? "有効（キャストにレジを開放）" : "無効（キャストはレジ操作不可）"}</strong>
        </p>
        {isOwner ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => void switchStore(false)} disabled={busy || !enabled} style={!enabled ? btnOn : btn}>無効</button>
            <button onClick={() => void switchStore(true)} disabled={busy || enabled} style={enabled ? btnOn : btn}>有効</button>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>※有効にしても、下の一覧で許可したキャストだけがレジを使えます（2段確認）。</span>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>※店のキャスト会計の切替は owner のみ可能です。</p>
        )}
      </section>

      {/* cast 別許可（owner/manager 操作可） */}
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>キャスト別のレジ会計許可</h3>
        {!enabled && (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
            ※店のキャスト会計が「無効」のため、ここで許可しても実際には使えません（店を有効にすると効きます）。
          </p>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["キャスト", "レジ会計"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 8, color: "var(--sub)" }}>（在籍キャストがいません）</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{r.name}</td>
                  <td style={{ padding: 6, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={r.canRegister}
                      disabled={busy || !r.membershipId}
                      onChange={() => void toggleCast(r)}
                      style={{ accentColor: "#C9A24A", cursor: "pointer" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {msg && <p style={{ fontSize: 12, color: msg.startsWith("エラー") ? "var(--bad)" : "var(--ok)", margin: "6px 0 0" }}>{msg}</p>}
    </div>
  );
}
