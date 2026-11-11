"use client";

// ★0201b の前提・Agoora の確定（2026-11-11）: 店舗設定「売掛を使う」＝set_store_receivable_policy の 1 本（0201b の前は ar_enabled も書く＝lib/nox/store/receivable-switch.ts）。
//   ON＝お客様の売掛だけ（customer_only）・OFF＝disabled・cast_liability_allowed の店は ON のまま変えない。オーナーだけ（RPC も owner）。
import { useState } from "react";
import OnOffSeg from "@/components/ui/on-off";
import Toast from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { mig0201bOn } from "@/lib/nox/rules-0175/flag";
import { receivableSwitchCallsOf, receivableBadKeyIsOk } from "@/lib/nox/store/receivable-switch";
import { storeProfileErrJa } from "./store-flag-toggle";

export default function ReceivableSwitch({ storeId, initialOn, currentPolicy, isOwner, onSaved }: { storeId: string; initialOn: boolean; currentPolicy: string | null; isOwner: boolean; onSaved?: () => void | Promise<void> }) {
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function switchTo(next: boolean) {
    if (next === on || busy || !storeId) return;
    setBusy(true); setMsg(null);
    const supabase = createClient();
    for (const c of receivableSwitchCallsOf(next, currentPolicy, mig0201bOn())) {
      const { error } = await supabase.rpc(c.fn, { p_store_id: storeId, ...c.args });
      if (error && !receivableBadKeyIsOk(c, error.message)) { setBusy(false); setMsg(`保存に失敗: ${error.message.includes("bad receivable_policy") ? "売掛の設定の値が不正です" : storeProfileErrJa(error.message)}`); return; }
    }
    setBusy(false); setOn(next);
    setMsg(`売掛を使うを「${next ? "ON" : "OFF"}」にしました${next ? "（お客様の売掛だけ・キャストに負担させない）" : ""}`);
    await onSaved?.();
  }
  return (
    <div data-onoff-row="1" data-receivable-switch={on ? "on" : "off"} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>売掛を使う</div>
        <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>
          ON にすると、レジの支払方法に「売掛」が出ます（お客様の売掛だけ＝キャストに負担させません）。OFF の店はサーバ側でも売掛の入金を拒否します（既存の売掛の回収はそのまま行えます）。{currentPolicy === "cast_liability_allowed" ? "この店は「キャストに負担させる」設定です。" : ""}
        </p>
        {msg && <Toast msg={msg} style={{ margin: "6px 0 0" }} />}
      </div>
      {isOwner ? <OnOffSeg value={on} ariaLabel="売掛を使う" disabled={busy} onChange={(v) => void switchTo(v === true)} /> : <span className="num" style={{ fontSize: 13 }}>{on ? "ON" : "OFF"}</span>}
    </div>
  );
}
