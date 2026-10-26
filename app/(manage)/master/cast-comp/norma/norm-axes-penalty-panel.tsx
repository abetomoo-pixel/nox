"use client";

// ★便 NR-1（裁定428 候補・2026-10-26）: ノルマ設定（店）パネル 1「軸と減額」＝採用する軸のチェックと、同じ行に未達の減額（定額／不足 1 単位ごと＋金額）。
//   保存は 1 つ（set_store_norm_axes → set_store_norm_config → set_penalty_config・各引数は常に全部明示＝原則7）。採用していない軸は減額を出さない。
//   説明は 1 行＋ⓘ（InfoNote）。390px＝4 軸のセグメントは 50／50・親幅いっぱい・金額欄も同じ幅・保存は中央（globals.css .nox-normax）。
//   遅刻・当欠の検知（閾値）はここに無い＝控除・送りタブ（PenaltyTab part="detect"）。純関数＝lib/nox/store/norm-panel.ts。
import { useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { InfoNote, SegmentTabs } from "@/components/ui/responsive-kit";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import type { NormPenaltyMode } from "@/lib/nox/pay";
import { NORM_AXES, NORM_AXIS_LABEL, normAxesArgsOf, type NormAxes, type ShimeiScope } from "@/lib/nox/store/norm-axes";
import { axisAmountOf, axisModeOf, axisSetAmountOf, axisSwitchModeOf, perUnitLabelOf } from "@/lib/nox/store/norm-panel";
import { compErrJa, penaltyArgsOf, type Penalty } from "../comp-sections";

const numWheelBlur = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

export default function NormAxesPenaltyPanel({ storeId, isOwner, initialAxes, initialShimeiScope, penalty, setPenalty, exists, setMsg, reload }: {
  storeId: string; isOwner: boolean; initialAxes: NormAxes; initialShimeiScope: ShimeiScope;
  penalty: Penalty; setPenalty: (p: Penalty) => void; exists: boolean; setMsg: (m: string) => void; reload: () => Promise<void>;
}) {
  const supabase = createClient();
  const [axes, setAxes] = useState<NormAxes>(initialAxes);
  const [shimeiScope, setShimeiScope] = useState<ShimeiScope>(initialShimeiScope);
  const [modeSel, setModeSel] = useState<Partial<Record<string, NormPenaltyMode>>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    // 1) 採用する軸（4 キー boolean を常に明示）
    const { error: e1 } = await supabase.rpc("set_store_norm_axes", { p_store_id: storeId, p_axes: normAxesArgsOf(axes) });
    if (e1) { setMsg(`保存に失敗: ${rpcErrJa(e1.message)}`); setBusy(false); return; }
    // 2) 旧 2 キー＋指名のカウント定義（3 値を常に明示）
    const { error: e2 } = await supabase.rpc("set_store_norm_config", { p_store_id: storeId, p_sales_enabled: axes.sales, p_shimei_enabled: axes.shimei, p_shimei_scope: shimeiScope });
    if (e2) { setMsg(`保存に失敗: ${rpcErrJa(e2.message)}`); setBusy(false); return; }
    // 3) 未達の減額（17 引数を常に明示・採用していない軸は現値＝0 のまま）
    const { error: e3 } = await supabase.rpc("set_penalty_config", penaltyArgsOf(storeId, penalty));
    setMsg(e3 ? compErrJa(e3.message) : "ノルマ設定（軸と減額）を保存しました");
    if (!e3) await reload();
    setBusy(false);
  }

  const onAxes = NORM_AXES.filter((k) => axes[k]);
  return (
    <section className="nox-cardtop nox-normax" style={t.card} data-norm-panel="axes" data-norm-axes={onAxes.join(",")}>
      <h2 style={t.cardTitle}>軸と減額</h2>
      <InfoNote text="採用した軸だけが、キャスト別の目標・待遇プランの既定・キャスト本人の進捗に出ます。未達の減額は給与の確定前に提案として出し、店が適用を選びます（委託は精算調整・雇用は懲戒減給の上限内）。定額か不足 1 単位ごとの 1 方式で、採用していない軸には減額を付けません。" style={{ margin: "0 0 10px" }} />
      {isOwner ? (
        <>
          <div className="nox-normax-head">
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={penalty.norm_on} disabled={busy} onChange={(e) => setPenalty({ ...penalty, norm_on: e.target.checked })} style={{ accentColor: "var(--gold)" }} /> 未達の減額を使う</label>
            <label style={{ fontSize: 13 }}>指名のカウント{" "}
              <SegSelect value={shimeiScope} onChange={(v) => setShimeiScope(v === "hon_jonai" ? "hon_jonai" : "hon")} options={[["hon", "本指名のみ"], ["hon_jonai", "場内+本指名"]] as const} />
            </label>
          </div>
          {NORM_AXES.map((ax) => {
            const on = axes[ax];
            const mode = axisModeOf(penalty, ax, modeSel[ax]);
            const amount = axisAmountOf(penalty, ax, mode);
            return (
              <div key={ax} className="nox-normax-row" data-norm-axis-row={ax} data-norm-axis-on={on ? "1" : "0"} data-penalty-mode={on ? mode : undefined}>
                <label className="nox-normax-ax" style={{ fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={on} disabled={busy} onChange={(e) => setAxes((a) => ({ ...a, [ax]: e.target.checked }))} style={{ accentColor: "var(--gold)" }} aria-label={`${NORM_AXIS_LABEL[ax]}ノルマを採用`} />
                  {" "}{NORM_AXIS_LABEL[ax]}
                </label>
                {on && penalty.norm_on ? (
                  <>
                    <div className="nox-normax-seg">
                      <SegmentTabs value={mode} ariaLabel={`${NORM_AXIS_LABEL[ax]}ノルマ 未達の減額の方式`} disabled={busy}
                        onChange={(m) => { setModeSel((x) => ({ ...x, [ax]: m })); setPenalty(axisSwitchModeOf(penalty, ax, m)); }}
                        options={[["flat", "定額"], ["per", perUnitLabelOf(ax, penalty.norm_sales_unit)]] as const} />
                    </div>
                    <label className="nox-normax-amt" style={{ fontSize: 12 }}>
                      <input type="number" min={0} value={amount} className="nox-numfield num" inputMode="numeric" onWheel={numWheelBlur} disabled={busy}
                        aria-label={`${NORM_AXIS_LABEL[ax]}ノルマ 未達の減額（${mode === "per" ? perUnitLabelOf(ax, penalty.norm_sales_unit) : "定額"}）`}
                        onChange={(e) => setPenalty(axisSetAmountOf(penalty, ax, mode, Number(e.target.value)))} /> 円
                    </label>
                    {ax === "sales" && mode === "per" && (
                      <label className="nox-normax-unit" style={{ fontSize: 12 }}>単位{" "}
                        <input type="number" min={1} value={penalty.norm_sales_unit} className="nox-numfield num" inputMode="numeric" onWheel={numWheelBlur} disabled={busy} aria-label="売上ノルマ 不足の単位（円）"
                          onChange={(e) => setPenalty({ ...penalty, norm_sales_unit: Math.max(1, Number(e.target.value) || 1) })} /> 円ごと
                      </label>
                    )}
                  </>
                ) : (
                  <span className="nox-normax-off" style={{ fontSize: 12, color: "var(--sub)" }}>{on ? "減額なし（「未達の減額を使う」で有効に）" : "不採用"}</span>
                )}
              </div>
            );
          })}
          {!exists && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "10px 0 0", textAlign: "center" }}>減額は未設定（既定値・保存で作成）</p>}
          <div className="nox-normax-save nox-actions">{/* ★便 BTN（今回の指摘）: 保存は中央（注記は上の行へ＝ボタンの位置をずらさない） */}
            <button type="button" onClick={() => void save()} disabled={busy} style={{ ...t.btnGold, ...t.btnSm }} data-norm-save="axes">保存</button>
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12, color: "var(--ink)", margin: 0 }}>
          現在: {NORM_AXES.map((k) => <span key={k}>{NORM_AXIS_LABEL[k]} <strong style={{ color: axes[k] ? "var(--ok)" : "var(--sub)" }}>{axes[k] ? "採用" : "不採用"}</strong>{" ／ "}</span>)}
          {"カウント: "}{shimeiScope === "hon_jonai" ? "場内+本指名" : "本指名のみ"}（切替はオーナーのみ）
        </p>
      )}
    </section>
  );
}
