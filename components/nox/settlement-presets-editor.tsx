"use client";

// ★0154 D4（2026-09-24・裁定293 追補1-1／294-7）: 精算調整のひな形（settings_json.settlement_presets）の編集＝owner のみ・set_store_profile の 1 キー patch。
//   既定 3 件「遅刻／当欠／早退」（額 0・文は編集可）・最大 10 件・RPC の 'bad type' は和文。メッセージは裁定281 の型（同じカード内）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { DEFAULT_SETTLEMENT_PRESETS, TARGET_LABEL, presetsOf, validatePresets, type SettlementPreset, type SettlementTarget } from "@/lib/nox/payroll/settlement";

export default function SettlementPresetsEditor({ storeId, settings, readOnly, onSaved }: {
  storeId: string; settings: Record<string, unknown>; readOnly?: boolean; onSaved?: (list: SettlementPreset[]) => void;
}) {
  const supabase = createClient();
  const [list, setList] = useState<SettlementPreset[]>(() => presetsOf(settings));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "warn" | "info"; text: string } | null>(null);
  const set = (i: number, patch: Partial<SettlementPreset>) => setList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function save() {
    if (busy) return;
    const v = validatePresets(list);
    if (v) { setMsg({ kind: "error", text: v }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { settlement_presets: list } });
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: error.message.includes("bad type") ? "ひな形の形が正しくありません（額は整数・対象は遅刻／当欠／早退／その他）" : rpcErrJa(error.message) }); return; }
    setMsg({ kind: "success", text: `精算調整のひな形を保存しました（${list.length} 件）` });
    onSaved?.(list);
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
        委託キャストの遅刻・当欠・早退に対する減額のひな形です（契約に根拠がある場合のみ・額の既定は 0＝店が決めます）。
        雇用キャストには使いません（懲戒減給は給与画面・労基法 91 条の上限つき）。
      </p>
      <div className="nox-tablewrap plain">
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
          <thead><tr><th style={t.th}>名称</th><th style={t.th}>対象</th><th style={{ ...t.th, textAlign: "right" }}>既定額（円）</th><th style={t.th}>契約根拠の文（明細の basis）</th>{!readOnly && <th style={t.th}></th>}</tr></thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={p.code + i}>
                <td style={t.td}><input value={p.name} disabled={readOnly || busy} onChange={(e) => set(i, { name: e.target.value })} style={{ ...t.input, width: 110 }} /></td>
                <td style={t.td}>
                  <select value={p.target} disabled={readOnly || busy} onChange={(e) => set(i, { target: e.target.value as SettlementTarget })} style={{ ...t.input, width: "auto" }}>
                    {(Object.keys(TARGET_LABEL) as SettlementTarget[]).map((k) => <option key={k} value={k}>{TARGET_LABEL[k]}</option>)}
                  </select>
                </td>
                <td style={{ ...t.td, textAlign: "right" }}><input type="number" min={0} step={1} value={p.amount} disabled={readOnly || busy} onChange={(e) => set(i, { amount: Number(e.target.value) })} className="num" style={{ ...t.input, width: 100, textAlign: "right" }} /></td>
                <td style={t.td}><input value={p.basis} disabled={readOnly || busy} maxLength={200} onChange={(e) => set(i, { basis: e.target.value })} style={{ ...t.input, width: "100%", minWidth: 220 }} /></td>
                {!readOnly && <td style={t.td}><button type="button" className="nox-btn small ghost" disabled={busy || list.length <= 1} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>削除</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="nox-actions" style={{ marginTop: 8 }}>
          <button type="button" className="nox-btn small ghost" disabled={busy || list.length >= 10} onClick={() => setList((l) => [...l, { code: `c${Date.now().toString(36)}`, name: "その他", amount: 0, basis: "", target: "other" }])}>＋ ひな形を追加</button>
          <button type="button" className="nox-btn small ghost" disabled={busy} onClick={() => setList(DEFAULT_SETTLEMENT_PRESETS.map((p) => ({ ...p })))}>既定の 3 件に戻す</button>
          <button type="button" className="nox-btn small gold" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存する"}</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 8 }}><Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message></div>}
    </div>
  );
}
