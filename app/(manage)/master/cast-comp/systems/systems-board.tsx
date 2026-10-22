"use client";

// マスタ「報酬制度」の client 側（裁定269）。保存は store-flag-toggle.tsx の switchTo を写経＝
//   set_store_profile に {sys_x: boolean} の 1 キー patch だけを渡す（他キーは触らない・新しい判定式なし）。
//   269-3（使用中は OFF 不可）の判定は部品（StoreSystemsPanel）の usage 表示と disabled に集約。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import StoreSystemsPanel from "@/components/nox/store-systems-panel";
import { storeProfileErrJa } from "../../store-flag-toggle";
import { SYSTEM_LABELS, WAGE_CUT_RULE_DESC, WAGE_CUT_RULE_KEY, WAGE_CUT_RULE_LABEL, WAGE_CUT_RULE_PENDING_NOTE, wageCutRuleOf, type SystemKey } from "@/lib/nox/store-systems"; // ★便 SH-UI-a A-1
import OnOffSeg from "@/components/ui/on-off";
// ★便 SH-UI-a A-1: 白名単（0175）の適用後に true＝切替を有効化（適用前は RPC が 'bad key'）
const WAGE_CUT_RULE_APPLIED = false;
import SettlementPresetsEditor from "@/components/nox/settlement-presets-editor"; // ★0154 D4: 精算調整のひな形

const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;

export default function SystemsBoard({ storeId, storeName, isOwner, initialSettings, usage }: {
  storeId: string; storeName: string; isOwner: boolean;
  initialSettings: Record<string, unknown>;
  usage: Record<SystemKey, number>;
}) {
  const supabase = createClient();
  const [settings, setSettings] = useState<Record<string, unknown>>(initialSettings);
  const [busyKey, setBusyKey] = useState<SystemKey | typeof WAGE_CUT_RULE_KEY | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(key: SystemKey, next: boolean) {
    if (busyKey || !storeId) return;
    setBusyKey(key); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { [key]: next } });
    setBusyKey(null);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setSettings((s) => ({ ...s, [key]: next }));
    setMsg(`${SYSTEM_LABELS[key]}を「${next ? "ON" : "OFF"}」にしました`);
  }

  // ★便 SH-UI-a A-1: 就業規則チェック＝1 キー patch（sys_* と同じ経路・audit は RPC）。適用前（白名単に無い）は 'bad key'＝和文で返す
  async function onWageCutRule(next: boolean) {
    if (busyKey || !storeId) return;
    setBusyKey(WAGE_CUT_RULE_KEY); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { [WAGE_CUT_RULE_KEY]: next } });
    setBusyKey(null);
    if (error) { setMsg(`保存に失敗: ${error.message.includes("bad key") ? WAGE_CUT_RULE_PENDING_NOTE : storeProfileErrJa(error.message)}`); return; }
    setSettings((s) => ({ ...s, [WAGE_CUT_RULE_KEY]: next }));
    setMsg(`${WAGE_CUT_RULE_LABEL}を「${next ? "ON" : "OFF"}」にしました`);
  }
  // ★便 X13-H H-7（裁定412）: 報酬の軸の切替＝複数キーを 1 回の set_store_profile で（他キーは触らない）
  async function onPatch(patch: Partial<Record<SystemKey, boolean>>, label: string) {
    if (busyKey || !storeId) return;
    setBusyKey("sys_backs"); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: patch });
    setBusyKey(null);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setSettings((s) => ({ ...s, ...patch }));
    setMsg(`${label}にしました`);
  }

  return (
    <div>
      <Toast msg={msg} />
      <div className="nox-pthead">
        <div className="nox-pthead-main">
          <div className="title"><h2>報酬制度</h2></div>
          <p className="desc">
            この店で使う制度を選びます。OFF にした制度は待遇プラン・控除・商品・マイページの該当する節が表示されなくなります
            （計算は変わりません＝キャスト個別の設定はそのまま残ります）。
          </p>
        </div>
      </div>
      <section className="nox-cardtop" style={card}>
        <h2 style={{ ...secTitle, margin: "0 0 4px" }}>使う制度{storeName ? `（${storeName}）` : ""}</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
          未設定の制度は ON として扱います。キャスト個別の設定（上書き・ノルマ目標）がある制度は OFF にできません。
        </p>
        <StoreSystemsPanel settings={settings} onChange={onChange} onPatch={onPatch} usage={usage} readOnly={!isOwner} busyKey={busyKey as SystemKey | null} />
        {/* ★便 SH-UI-a A-1（2026-10-22）: 就業規則に減給の定めがある（雇用の懲戒減給を使う）＝settings_json.sys_wage_cut_rule（sys_* と同じ 1 キー patch・audit）。ON で I-5 ④の雇用向け提案 */}
        {(() => { const on = wageCutRuleOf(settings); const busy = busyKey === WAGE_CUT_RULE_KEY; const canEdit = isOwner && WAGE_CUT_RULE_APPLIED; return (
          <div data-onoff-row="1" data-wage-cut-rule={on ? "1" : "0"} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)", marginTop: 6 }}>
            <div style={{ minWidth: 0, flex: "1 1 260px" }}>
              <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>{WAGE_CUT_RULE_LABEL}</div>
              <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{WAGE_CUT_RULE_DESC}</p>
              {!WAGE_CUT_RULE_APPLIED && <p className="nox-onoff-body" style={{ fontSize: 11.5, margin: "4px 0 0", color: "var(--champ)" }}>{WAGE_CUT_RULE_PENDING_NOTE}</p>}
            </div>
            {canEdit ? (
              <OnOffSeg value={on} ariaLabel={WAGE_CUT_RULE_LABEL} disabled={busy} onChange={(v) => void onWageCutRule(v === true)} />
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <b style={{ color: on ? "var(--ok)" : "var(--sub)" }}>{on ? "ON" : "OFF"}</b>
                {isOwner ? null : <span className="nox-stpill">オーナーのみ変更できます</span>}
              </span>
            )}
          </div>
        ); })()}
      </section>
      {/* ★0154 D4（裁定293 追補1-1／294-7）: 精算調整のひな形（settings_json.settlement_presets・owner のみ編集） */}
      <section className="nox-cardtop" style={card} id="settlement-presets">{/* ★便 X13-H H-15: 閾値パネルの「ひな形を開く」の飛び先 */}
        <h2 style={{ ...secTitle, margin: "0 0 4px" }}>精算調整のひな形（委託）</h2>
        <SettlementPresetsEditor storeId={storeId} settings={settings} readOnly={!isOwner} onSaved={(list) => setSettings((s) => ({ ...s, settlement_presets: list }))} />
      </section>
    </div>
  );
}
