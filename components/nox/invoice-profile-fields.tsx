"use client";

// ★追補 2 同乗 R-6（裁定422 候補・0175 v2 ★26）: 店舗情報の「領収書の発行者」＝法人名・屋号・但し書きの既定（set_store_invoice_profile・owner）。
//   登録番号（T＋13 桁）は税設定（set_store_tax_config）のまま＝ここでは形式の確認だけ表示。RULES_0175_APPLIED=false の間は mount されない。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { DEFAULT_RECEIPT_DESC, regNoValidOf } from "@/lib/nox/rules-0175/invoice-receipt";

export default function InvoiceProfileFields({ storeId, isOwner }: { storeId: string; isOwner: boolean }) {
  const supabase = createClient();
  const [f, setF] = useState({ legal: "", trade: "", desc: "", regNo: "", regStatus: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("stores").select("legal_name, trade_name, receipt_default_desc, invoice_reg_no, invoice_status").eq("id", storeId).maybeSingle();
    const d = (data ?? {}) as Record<string, unknown>;
    setF({ legal: (d.legal_name as string | null) ?? "", trade: (d.trade_name as string | null) ?? "", desc: (d.receipt_default_desc as string | null) ?? "", regNo: (d.invoice_reg_no as string | null) ?? "", regStatus: (d.invoice_status as string | null) ?? "" });
  }, [supabase, storeId]);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (busy) return; setBusy(true); setMsg("");
    const { error } = await supabase.rpc("set_store_invoice_profile", { p_store_id: storeId, p_legal_name: f.legal.trim() || null, p_trade_name: f.trade.trim() || null, p_receipt_default_desc: f.desc.trim() || null });
    setBusy(false);
    setMsg(error ? `エラー: ${error.message}` : "領収書の発行者を保存しました");
  }
  return (
    <section className="nox-cardtop" style={{ ...t.card, marginBottom: 14 }} data-invoice-profile="1">
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>領収書の発行者（簡易インボイス）</h3>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ fontSize: 12.5 }}>法人名<br /><input value={f.legal} maxLength={100} disabled={!isOwner || busy} onChange={(e) => setF({ ...f, legal: e.target.value })} style={{ ...t.input, width: "100%" }} aria-label="法人名" /></label>
        <label style={{ fontSize: 12.5 }}>屋号<br /><input value={f.trade} maxLength={100} disabled={!isOwner || busy} onChange={(e) => setF({ ...f, trade: e.target.value })} style={{ ...t.input, width: "100%" }} aria-label="屋号" /></label>
        <label style={{ fontSize: 12.5 }}>但し書きの既定<br /><input value={f.desc} maxLength={100} placeholder={DEFAULT_RECEIPT_DESC} disabled={!isOwner || busy} onChange={(e) => setF({ ...f, desc: e.target.value })} style={{ ...t.input, width: "100%" }} aria-label="但し書きの既定" /></label>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "8px 0 0" }}>
        適格請求書登録番号＝{f.regStatus === "registered" ? (regNoValidOf(f.regNo) ? `${f.regNo}（登録事業者＝領収書に表示）` : `${f.regNo || "未入力"}（形式が T＋13 桁ではありません＝税設定で直してください）`) : "未登録（領収書に登録番号の行は出ません）"}。登録番号は料金・会計 › 税設定で。
      </p>
      <div className="nox-actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={!isOwner || busy} onClick={() => void save()}>保存</button>
      </div>
      <Toast msg={msg} />
    </section>
  );
}
