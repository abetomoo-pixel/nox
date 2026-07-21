"use client";

// 料金設定（E1・裁定8 N1-b）。書込は set_store_pricing（mig0051）のみ＝原則7 で7値を常に明示送信。
// 現在値は stores 列（page が select して渡す）。owner/manager のみ（RPC 側も強制＝二重）。
// 指名料3種は「charge 明細の既定単価マスタ」＝会計への自動加算はしない（現行の手動明細構造を維持・
// 自動加算は golden 域＝別裁定）。cardTAX は現状 日報集計のみ適用（#25 値裁定前は会計加算しない）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast, { useToast } from "@/components/ui/toast";

export type Pricing = {
  hon_fee: number; jonai_fee: number; dohan_fee: number;
  service_rate: number; card_tax_rate: number; round_unit: number; round_mode: string;
};

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: 90, padding: "8px 10px", fontSize: 13 };

function errJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad pricing")) return "入力値が範囲外です（率0〜100・丸め単位1〜10000）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function PricingPanel({ storeId, initial }: { storeId: string; initial: Pricing }) {
  const supabase = createClient();
  const { msg, setMsg } = useToast();
  const [hon, setHon] = useState(initial.hon_fee);
  const [jonai, setJonai] = useState(initial.jonai_fee);
  const [dohan, setDohan] = useState(initial.dohan_fee);
  const [service, setService] = useState(initial.service_rate);
  const [cardTax, setCardTax] = useState(initial.card_tax_rate);
  const [unit, setUnit] = useState(initial.round_unit);
  const [mode, setMode] = useState(initial.round_mode);
  const [busy, setBusy] = useState(false);

  async function save() {
    setMsg(null);
    setBusy(true);
    // 原則7: 全値を明示送信（null を送らない＝coalesce リセットの余地を作らない）
    const { error } = await supabase.rpc("set_store_pricing", {
      p_store_id: storeId, p_hon_fee: hon, p_jonai_fee: jonai, p_dohan_fee: dohan,
      p_service_rate: service, p_card_tax_rate: cardTax, p_round_unit: unit, p_round_mode: mode,
    });
    setBusy(false);
    setMsg(error ? `保存に失敗: ${errJa(error.message)}` : "料金設定を保存しました");
  }

  const numField = (label: string, value: number, set: (n: number) => void, hint?: string) => (
    <label style={{ fontSize: 12, color: "var(--sub)" }}>
      {label}
      <input type="number" min={0} value={value} onChange={(e) => set(Number(e.target.value))} style={{ ...input, display: "block", marginTop: 4 }} />
      {hint && <span style={{ fontSize: 10.5, display: "block", marginTop: 2 }}>{hint}</span>}
    </label>
  );

  return (
    <section className="nox-cardtop" style={card}>
      <h2 style={t.cardTitle}>料金設定</h2>
      <Toast msg={msg} />
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 12px", lineHeight: 1.7 }}>
        次に開く伝票からスナップショットされます（開いている伝票・確定済み日報には遡及しません）。
        指名料は明細登録の既定単価・カードTAXは日報集計に使用します。
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        {numField("本指名料", hon, setHon, "円")}
        {numField("場内指名料", jonai, setJonai, "円")}
        {numField("同伴料", dohan, setDohan, "円")}
        {numField("サービス料率", service, setService, "%（会計に加算）")}
        {numField("カードTAX率", cardTax, setCardTax, "%（日報集計）")}
        {numField("丸め単位", unit, setUnit, "円（1〜10000）")}
        <label style={{ fontSize: 12, color: "var(--sub)" }}>
          丸め方
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...input, display: "block", marginTop: 4, width: 100 }}>
            <option value="down">切り捨て</option>
            <option value="up">切り上げ</option>
            <option value="round">四捨五入</option>
          </select>
        </label>
      </div>
      <button style={{ ...t.btnGold, ...t.btnSm, marginTop: 14 }} disabled={busy} onClick={save}>保存</button>
    </section>
  );
}
