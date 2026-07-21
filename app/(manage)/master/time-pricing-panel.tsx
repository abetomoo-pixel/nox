"use client";

// 時間料金設定（B4・裁定8 N1-b・裁定9）。書込は set_store_time_pricing（mig0052）のみ＝原則7 で6値を
// 常に明示送信（null を送らない）。現在値は stores 時間制列（page が select して渡す＝E1 と同型）。
// owner/manager のみ（RPC 側も owner∨manager 自店を強制＝二重）。PricingPanel とは別パネル
// （原則7＝1 RPC=1 パネル・PricingPanel は7値送信のまま無改修）。
// 注記2本: (a) 非遡及＝次に開く伝票から（PricingPanel と同文体）／(b) 裁定(e) 自動行は pay_group='A' 固定。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast, { useToast } from "@/components/ui/toast";

export type TimePricing = {
  set_min: number; set_fee: number; ext_min: number; ext_fee: number;
  time_mode: string; time_per: string;
};

const card: React.CSSProperties = t.card;
const yen = (n: number) => "¥" + n.toLocaleString();

const stepBtn: React.CSSProperties = {
  ...t.btnGhost, width: 30, height: 30, padding: 0, fontSize: 16, fontWeight: 700,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const segBtn = (on: boolean): React.CSSProperties => ({
  fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "8px 18px", borderRadius: 9, cursor: "pointer",
  border: on ? "1px solid var(--gold)" : "1px solid var(--line2)",
  background: on ? "linear-gradient(135deg,#1F1B12,#14120C)" : "transparent",
  color: on ? "var(--champ)" : "var(--sub)",
});

function errJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad time pricing")) return "入力値が範囲外です（分は1〜1440・金額は0以上）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function TimePricingPanel({ storeId, initial }: { storeId: string; initial: TimePricing }) {
  const supabase = createClient();
  const { msg, setMsg } = useToast();
  const [setMin, setSetMin] = useState(initial.set_min);
  const [setFee, setSetFee] = useState(initial.set_fee);
  const [extMin, setExtMin] = useState(initial.ext_min);
  const [extFee, setExtFee] = useState(initial.ext_fee);
  const [mode, setMode] = useState(initial.time_mode === "auto" ? "auto" : "manual");
  const [per, setPer] = useState(initial.time_per === "person" ? "person" : "table");
  const [busy, setBusy] = useState(false);

  async function save() {
    setMsg(null);
    setBusy(true);
    // 原則7: 全値を明示送信（null を送らない＝coalesce リセットの余地を作らない）
    const { error } = await supabase.rpc("set_store_time_pricing", {
      p_store_id: storeId, p_set_min: setMin, p_set_fee: setFee,
      p_ext_min: extMin, p_ext_fee: extFee, p_time_mode: mode, p_time_per: per,
    });
    setBusy(false);
    setMsg(error ? `保存に失敗: ${errJa(error.message)}` : "時間料金設定を保存しました");
  }

  // 分ステッパ（±15・UI 下限15/上限1440）＋金額ステッパ（±500・下限0）
  const minStepper = (value: number, set: (n: number) => void) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button" style={stepBtn} onClick={() => set(Math.max(15, value - 15))}>−</button>
      <span style={{ ...t.num, minWidth: 58, textAlign: "center", fontSize: 13 }}>{value}分</span>
      <button type="button" style={stepBtn} onClick={() => set(Math.min(1440, value + 15))}>＋</button>
    </div>
  );
  const feeStepper = (value: number, set: (n: number) => void) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button" style={stepBtn} onClick={() => set(Math.max(0, value - 500))}>−</button>
      <span style={{ ...t.num, minWidth: 72, textAlign: "center", fontSize: 13 }}>{yen(value)}</span>
      <button type="button" style={stepBtn} onClick={() => set(value + 500)}>＋</button>
    </div>
  );
  const row = (label: string, minEl: React.ReactNode, feeEl: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--sub)", minWidth: 84 }}>{label}</span>
      {minEl}
      {feeEl}
    </div>
  );

  return (
    <section className="nox-cardtop" style={card}>
      <h2 style={t.cardTitle}>時間料金設定（セット＋延長）</h2>
      <Toast msg={msg} />
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
        次に開く伝票から適用されます（開いている伝票・確定済み日報には遡及しません）。
        自動モードの時間料金は伝票グループ A に付きます（グループ分割の伝票は手動で調整してください）。
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--sub)", minWidth: 84 }}>時間制課金</span>
          <button type="button" style={segBtn(mode === "manual")} onClick={() => setMode("manual")}>手動</button>
          <button type="button" style={segBtn(mode === "auto")} onClick={() => setMode("auto")}>自動</button>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>自動＝経過から算出・手動＝明細行を手入力</span>
        </div>
        {row("セット料金", minStepper(setMin, setSetMin), feeStepper(setFee, setSetFee))}
        {row("延長料金", minStepper(extMin, setExtMin), feeStepper(extFee, setExtFee))}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--sub)", minWidth: 84 }}>単位</span>
          <button type="button" style={segBtn(per === "table")} onClick={() => setPer("table")}>卓</button>
          <button type="button" style={segBtn(per === "person")} onClick={() => setPer("person")}>名</button>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>卓＝1伝票あたり・名＝人数倍</span>
        </div>
      </div>
      <button style={{ ...t.btnGold, ...t.btnSm, marginTop: 16 }} disabled={busy} onClick={save}>保存</button>
    </section>
  );
}
