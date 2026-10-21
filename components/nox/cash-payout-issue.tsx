"use client";

// ★便 X13-G W-24 ②（2026-10-21）: 日報の締め「現金支払の内訳」の ＋発行。RPC 追加 0・新しい計算 0。
//   日払い＝キャスト詳細と同じ DailyPayForm（daily_pay_issue・源泉と手取りのプレビュー）をキャスト選択の後に出す。
//   前借り＝キャスト詳細と同じ AdvanceOkuriForm（adv_issue・picker 内蔵）の前借りの行だけ。
//   送り実費＝今日タブと同じ OkuriOutDialog（issueOnly）→ transport_issue_bulk 1 件（既定＝店設定の基本額 → 直近の送り → 空欄）。
//   営業日＝日報で表示中の営業日。発行後は onIssued で内訳を読み直す（合計とレジ内現金予定額が同時に変わる）。
import { useState } from "react";
import Modal from "@/components/ui/modal";
import Picker from "@/components/nox/picker";
import DailyPayForm from "@/components/nox/daily-pay-form";
import AdvanceOkuriForm from "@/components/nox/advance-okuri-form";
import OkuriOutDialog from "@/components/nox/okuri-out-dialog";
import { okuriDefaultAmountOf, type OkuriDefault } from "@/lib/nox/shift/okuri-default";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { createClient } from "@/lib/supabase/client";

export type PayoutIssueKind = "daily" | "advance" | "okuri";
export const PAYOUT_ISSUE_TITLE: Record<PayoutIssueKind, string> = { daily: "日払いの発行", advance: "前借りの発行", okuri: "送り実費の発行" };

export default function CashPayoutIssue({ kind, storeId, bizDate, casts, okuriBase, onIssued, onClose }: {
  kind: PayoutIssueKind;
  storeId: string;
  /** 日報で表示中の営業日（YYYY-MM-DD） */
  bizDate: string;
  casts: { id: string; name: string }[];
  /** 店設定 okuri_base_amount（送りの既定） */
  okuriBase?: unknown;
  onIssued: (text?: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [pick, setPick] = useState<string | null>(null);
  const [okuriDef, setOkuriDef] = useState<OkuriDefault | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (id: string | null) => casts.find((c) => c.id === id)?.name ?? "";
  const items = casts.map((c) => ({ id: c.id, label: c.name }));

  async function pickOkuri(castId: string) {
    setPick(castId); setErr(null);
    let last: number | null = null;
    if (okuriDefaultAmountOf(okuriBase, null).amount === null) {
      const { data } = await supabase.from("transport").select("amount").eq("cast_id", castId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1);
      last = ((data ?? []) as { amount: number }[])[0]?.amount ?? null;
    }
    setOkuriDef(okuriDefaultAmountOf(okuriBase, last));
  }
  async function issueOkuri(amount: number) {
    if (!pick || busy) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("transport_issue_bulk", { p_store_id: storeId, p_items: [{ cast_id: pick, amount, date: bizDate }], p_idem_key: crypto.randomUUID() });
    setBusy(false);
    if (error) { setErr(`送りの発行に失敗: ${rpcErrJa(error.message)}`); return; }
    await onIssued(`${nameOf(pick)} の送り ¥${amount.toLocaleString()} を発行しました`);
    onClose();
  }

  if (kind === "okuri" && pick && okuriDef) {
    return <OkuriOutDialog castName={nameOf(pick)} def={okuriDef} busy={busy} error={err} mode="issueOnly" lead={`${nameOf(pick)} の送り実費を発行します（営業日 ${bizDate}）。`}
      onConfirm={(a) => void issueOkuri(a)} onClose={onClose} />;
  }
  return (
    <Modal onClose={onClose} scroll maxWidth={520}>
      <div className="nox-formmodal-head" data-payout-issue={kind}>
        <strong>{PAYOUT_ISSUE_TITLE[kind]}（{bizDate}）</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={onClose}>×</button>
      </div>
      {kind === "advance" ? (
        <AdvanceOkuriForm storeId={storeId} casts={casts} dateDefault={bizDate} only="advance" onIssued={() => onIssued()} />
      ) : (
        <>
          <p style={{ fontSize: 12.5, margin: "0 0 6px", fontWeight: 700 }}>キャスト</p>
          <Picker items={items} value={pick} onPick={(id) => (kind === "okuri" ? void pickOkuri(id) : setPick(id))} onClear={() => setPick(null)} />
          {kind === "daily" && pick && (
            <div style={{ marginTop: 12 }}>
              <DailyPayForm key={pick} castId={pick} castName={nameOf(pick)} storeId={storeId} dateDefault={bizDate} onIssued={() => onIssued()} />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
