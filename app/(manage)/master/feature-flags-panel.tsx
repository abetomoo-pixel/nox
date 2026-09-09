"use client";

// 機能の公開（C層①・mig0135・設計書 v1 §4・裁定182／C①-1〜3）。/master/system の「機能」タブ（owner のみ）。
//
// ★読取＝feature_flags を RLS 越しに select（org の全行を 1 クエリ）。切替＝flag_set(p_key, p_store_id or null, p_enabled, p_reason)
//   → 成功後に再読込。理由は任意（裁定C①-3）。エラー文は --danger-ink（裁定120）。
// ★表示 key＝staff_shift／reopen_flow の 2 つ（qr_order／notify は非表示＝裁定C①-2・器はある）。
// ★各 key＝[会社の既定 ON/OFF][店舗ごと: 既定に従う／ON／OFF]。店舗行なし＝「既定に従う」。
//   店舗行の削除 RPC は設計外（v1 §4）＝「既定に戻す」は置かず、注記「店舗の上書きは ON/OFF のみ」。
// ★flag_enabled の解決（店舗行→org 行→false）は RPC 側が正＝ここは行の有無と enabled を表示するだけ。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import SegSelect from "@/components/ui/seg-select";

type Store = { id: string; name: string };
type FlagRow = { id: string; store_id: string | null; key: string; enabled: boolean; updated_at: string };

// 裁定C①-1: key の表示名。裁定C①-2: ローンチ時に出すのは前 2 つ。
const VISIBLE_KEYS: Array<{ key: string; label: string; desc: string }> = [
  { key: "staff_shift", label: "黒服シフト", desc: "黒服・スタッフのシフトと勤務パターン（C層②）。" },
  { key: "reopen_flow", label: "締め解除フロー", desc: "締め解除・給与確定解除・現金差異承認・伝票統合の解除型（C層③）。" },
];

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };
const inp: React.CSSProperties = { ...t.input, width: 260, padding: "8px 10px", fontSize: 13 };

function errJa(m: string): string {
  return m.includes("forbidden") ? "権限がありません（オーナーのみ）"
    : m.includes("unknown_key") ? "不明な機能です"
    : m.includes("billing locked") ? "課金が停止中のため変更できません" : m;
}

export default function FeatureFlagsPanel({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("feature_flags")
      .select("id, store_id, key, enabled, updated_at").order("key").order("store_id", { nullsFirst: true });
    if (error) { setLoadErr(errJa(error.message)); return; }
    setLoadErr(null);
    setRows((data ?? []) as FlagRow[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const orgRow = (key: string) => rows.find((r) => r.key === key && r.store_id === null) ?? null;
  const storeRow = (key: string, storeId: string) => rows.find((r) => r.key === key && r.store_id === storeId) ?? null;

  async function setFlag(key: string, storeId: string | null, enabled: boolean, label: string) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("flag_set", {
      p_key: key, p_store_id: storeId, p_enabled: enabled, p_reason: reason.trim() === "" ? null : reason.trim(),
    });
    setBusy(false);
    if (error) { setMsg({ kind: "bad", text: `変更に失敗: ${errJa(error.message)}` }); return; }
    setMsg({ kind: "ok", text: `${label}を${enabled ? "ON" : "OFF"}にしました（監査に記録されます）` });
    setReason("");
    await load();
  }

  return (
    <section className="nox-cardtop" style={card}>
      <h3 style={h3}>機能の公開</h3>
      <p style={sub}>
        会社の既定を決め、店舗ごとに上書きできます。OFF の機能は導線ごと表示されません（準備中表示にはなりません）。
        切替は監査（flag_toggle）に記録されます。
      </p>
      {loadErr && <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--danger-ink)", margin: "0 0 10px" }}>{loadErr}</p>}
      <div className="nox-tablewrap">
        <table className="nox-table">
          <thead>
            <tr>
              <th>機能</th>
              <th>会社の既定</th>
              {stores.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {VISIBLE_KEYS.map((k) => {
              const o = orgRow(k.key);
              const orgOn = o?.enabled === true;
              return (
                <tr key={k.key}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{k.label}</div>
                    <div style={{ fontSize: 11, color: "var(--v2-muted)" }}>{k.desc}</div>
                  </td>
                  <td>
                    <SegSelect value={orgOn ? "on" : "off"} ariaLabel={`${k.label} 会社の既定`}
                      disabled={busy}
                      onChange={(v) => void setFlag(k.key, null, v === "on", `${k.label}（会社の既定）`)}
                      options={[["off", "OFF"], ["on", "ON"]] as const} />
                    {!o && <div style={{ fontSize: 10.5, color: "var(--v2-muted)", marginTop: 2 }}>未設定＝OFF</div>}
                  </td>
                  {stores.map((s) => {
                    const r = storeRow(k.key, s.id);
                    const val = r === null ? "inherit" : r.enabled ? "on" : "off";
                    return (
                      <td key={s.id}>
                        <SegSelect value={val} ariaLabel={`${k.label} ${s.name}`}
                          disabled={busy}
                          onChange={(v) => { if (v !== "inherit") void setFlag(k.key, s.id, v === "on", `${k.label}（${s.name}）`); }}
                          options={[["inherit", "既定に従う"], ["on", "ON"], ["off", "OFF"]] as const} />
                        {r !== null && (
                          <div style={{ fontSize: 10.5, color: "var(--v2-muted)", marginTop: 2 }}>
                            上書き中（既定 {orgOn ? "ON" : "OFF"}）
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <label style={{ fontSize: 12, color: "var(--sub)" }}>理由（任意）{" "}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 9月から黒服シフトを試験運用" style={inp} maxLength={200} />
        </label>
        <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>次の切替に添えて監査へ記録します。</span>
      </div>
      {msg && (
        <p style={{ fontSize: 12.5, fontWeight: 700, margin: "10px 0 0", color: msg.kind === "ok" ? "var(--ok)" : "var(--danger-ink)" }}>{msg.text}</p>
      )}
      <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
        ※店舗の上書きは ON／OFF のみです（一度上書きした店舗を「既定に従う」へ戻す操作は準備中）。
        ※QR 注文・通知の公開設定は準備中のため表示していません。
      </p>
    </section>
  );
}
