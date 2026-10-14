"use client";

// ノルマ設定（店）: ★GV-2／裁定347 追補1（0171・便 P171・2026-10-14）: 採用を 4 軸（出勤日数・同伴・売上・指名）に＝settings_json.norm_axes を set_store_norm_axes で書く（owner のみ・4 キー boolean を常に明示＝原則7）。
//   指名のカウント定義（shimei_norm_scope）は従来の set_store_norm_config（3 引数）で保存＝旧 2 キー（sales_norm_enabled／shimei_norm_enabled）は 4 軸の sales／shimei と同じ値で同期して送る（旧キーを読む箇所が残っても食い違わない）。
//   採用 OFF の軸は 3 画面（/mine ノルマカード・キャスト別ノルマ目標・キャスト詳細「今月のノルマ」）とプラン既定の入力口から消える（lib/nox/store/norm-axes.ts）。
//   裁定: ノルマ未達は表示のみ（報酬非接続＝★0154 D3 で罰金撤去）。
import { useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { NORM_AXES, NORM_AXIS_LABEL, normAxesArgsOf, type NormAxes, type ShimeiScope } from "@/lib/nox/store/norm-axes";

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };

export default function NormConfigPanel({
  storeId, isOwner, initialAxes, initialShimeiScope, legacy,
}: {
  storeId: string;
  isOwner: boolean;
  initialAxes: NormAxes;
  initialShimeiScope: ShimeiScope;
  /** 旧 2 キー（mig0042）の現在値＝表示には使わない・保存時に 4 軸の sales／shimei と同期して送る */
  legacy?: { salesEnabled: boolean; shimeiEnabled: boolean };
}) {
  const supabase = createClient();
  const [axes, setAxes] = useState<NormAxes>(initialAxes);
  const [shimeiScope, setShimeiScope] = useState<ShimeiScope>(initialShimeiScope);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  void legacy;

  async function save() {
    if (busy) return;
    setBusy(true); setMsg("");
    // ★0171: 4 軸＝set_store_norm_axes（4 キー boolean を常に明示）→ 旧 2 キー＋カウント定義＝set_store_norm_config（3 値を常に明示・原則7）
    const { error } = await supabase.rpc("set_store_norm_axes", { p_store_id: storeId, p_axes: normAxesArgsOf(axes) });
    if (error) { setMsg(`エラー: ${rpcErrJa(error.message)}`); setBusy(false); return; }
    const { error: e2 } = await supabase.rpc("set_store_norm_config", {
      p_store_id: storeId,
      p_sales_enabled: axes.sales,
      p_shimei_enabled: axes.shimei,
      p_shimei_scope: shimeiScope,
    });
    setMsg(e2 ? `エラー: ${rpcErrJa(e2.message)}` : "ノルマ設定を保存しました");
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={h2}>ノルマ設定（店）</h2>
      <section className="nox-cardtop" style={card} data-norm-axes={NORM_AXES.filter((k) => axes[k]).join(",")}>
        <h3 style={h3}>採用する軸（出勤日数・同伴・売上・指名）</h3>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          採用した軸だけが、待遇プランの既定目標・キャスト別ノルマ目標・キャスト詳細「今月のノルマ」・キャスト本人のマイページ（進捗）に出ます（未達は表示のみ・報酬には接続されません）。
          目標値はプランの既定（待遇プラン）とキャスト個別（キャスト詳細）で設定します。
        </p>
        {isOwner ? (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            {NORM_AXES.map((k) => (
              <label key={k} style={{ fontSize: 13 }}>
                <input type="checkbox" checked={axes[k]} onChange={(e) => setAxes((a) => ({ ...a, [k]: e.target.checked }))} style={{ accentColor: "var(--gold)" }} aria-label={`${NORM_AXIS_LABEL[k]}ノルマを採用`} />
                {" "}{NORM_AXIS_LABEL[k]}
              </label>
            ))}
            <label style={{ fontSize: 13 }}>
              指名のカウント{" "}
              <SegSelect value={shimeiScope} onChange={(v) => setShimeiScope(v === "hon_jonai" ? "hon_jonai" : "hon")}
            options={[["hon", "本指名のみ"], ["hon_jonai", "場内+本指名"]] as const} />
            </label>
            <button onClick={() => void save()} disabled={busy} style={btn}>保存</button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--ink)", margin: 0 }}>
            現在: {NORM_AXES.map((k) => <span key={k}>{NORM_AXIS_LABEL[k]} <strong style={{ color: axes[k] ? "var(--ok)" : "var(--sub)" }}>{axes[k] ? "採用" : "不採用"}</strong>{" ／ "}</span>)}
            {"カウント: "}{shimeiScope === "hon_jonai" ? "場内+本指名" : "本指名のみ"}
            <span style={{ color: "var(--sub)" }}>　※切替は owner のみ可能です。</span>
          </p>
        )}
        {msg && <Toast msg={msg} style={{ margin: "8px 0 0" }} />}
      </section>
    </div>
  );
}
