"use client";

// ノルマ設定（店・mig0042）: 売上/指名ノルマの採用トグル×2＋指名カウント定義セレクト。
// settings_json（sales_norm_enabled/shimei_norm_enabled/shimei_norm_scope）を owner のみ切替
// （set_store_norm_config・cast-register-panel と同じ店フラグ雛形）。manager は現在値のみ。
// 裁定: ノルマ未達は表示のみ（罰金非接続）＝このフラグは /mine 進捗カードの出し分けにだけ効く。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type ShimeiScope = "hon" | "hon_jonai";

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

export default function NormConfigPanel({
  storeId, isOwner, initialSalesEnabled, initialShimeiEnabled, initialShimeiScope,
}: {
  storeId: string;
  isOwner: boolean;
  initialSalesEnabled: boolean;
  initialShimeiEnabled: boolean;
  initialShimeiScope: ShimeiScope;
}) {
  const supabase = createClient();
  const [salesEnabled, setSalesEnabled] = useState(initialSalesEnabled);
  const [shimeiEnabled, setShimeiEnabled] = useState(initialShimeiEnabled);
  const [shimeiScope, setShimeiScope] = useState<ShimeiScope>(initialShimeiScope);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (busy) return;
    setBusy(true); setMsg("");
    // 3値を常に明示送信（原則7＝部分 null で黙って既定値に戻さない・RPC も全引数 null 拒否）
    const { error } = await supabase.rpc("set_store_norm_config", {
      p_store_id: storeId,
      p_sales_enabled: salesEnabled,
      p_shimei_enabled: shimeiEnabled,
      p_shimei_scope: shimeiScope,
    });
    setMsg(error ? `エラー: ${error.message}` : "ノルマ設定を保存しました");
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 720, marginTop: 24 }}>
      <h2 style={h2}>ノルマ設定（店）</h2>
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>売上・指名ノルマの採用</h3>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          採用した軸だけがキャスト本人のマイページに進捗表示されます（未達は表示のみ・罰金には接続されません）。
          目標値そのものは「報酬設計マスタ → ノルマ」でキャスト×月ごとに設定します。
        </p>
        {isOwner ? (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" checked={salesEnabled} onChange={(e) => setSalesEnabled(e.target.checked)} style={{ accentColor: "#C9A24A" }} />
              {" "}売上ノルマを採用
            </label>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" checked={shimeiEnabled} onChange={(e) => setShimeiEnabled(e.target.checked)} style={{ accentColor: "#C9A24A" }} />
              {" "}指名ノルマを採用
            </label>
            <label style={{ fontSize: 13 }}>
              指名のカウント{" "}
              <select value={shimeiScope} onChange={(e) => setShimeiScope(e.target.value === "hon_jonai" ? "hon_jonai" : "hon")} style={inp}>
                <option value="hon">本指名のみ</option>
                <option value="hon_jonai">場内+本指名</option>
              </select>
            </label>
            <button onClick={() => void save()} disabled={busy} style={btn}>保存</button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--ink)", margin: 0 }}>
            現在: 売上ノルマ <strong style={{ color: salesEnabled ? "var(--ok)" : "var(--sub)" }}>{salesEnabled ? "採用" : "不採用"}</strong>
            {" ／ "}指名ノルマ <strong style={{ color: shimeiEnabled ? "var(--ok)" : "var(--sub)" }}>{shimeiEnabled ? "採用" : "不採用"}</strong>
            {"（カウント: "}{shimeiScope === "hon_jonai" ? "場内+本指名" : "本指名のみ"}{"）"}
            <span style={{ color: "var(--sub)" }}>　※切替は owner のみ可能です。</span>
          </p>
        )}
        {msg && <p style={{ fontSize: 12, color: msg.startsWith("エラー") ? "var(--bad)" : "var(--ok)", margin: "8px 0 0" }}>{msg}</p>}
      </section>
    </div>
  );
}
