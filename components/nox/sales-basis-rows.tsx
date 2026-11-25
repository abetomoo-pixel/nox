"use client";
// ★2026-11-19 夜（相談役 ④＝枝に commit まで・push しない）: 店舗設定 › 給与（使う制度）に「歩合・スライドの売上の基準（請求額／小計）」と「既定の売上歩合を使う／使わない」。
//   保存＝親の onPatch（set_store_profile の patch・0201q の 2 鍵 sales_basis・sales_back_default_off・監査は RPC 側）。計算の式は変えない（collect が鍵を読むのは 11/19 朝の便から）。
//   切り替えは給与が変わる＝押す前に確かめる窓（次の締めから・段の額も見直す・確定済みの明細は変わらない）。報酬率の分母（sales_subtotal_mode）とは別の設定＝文言で分ける。
import { useState } from "react";
import OnOffSeg from "@/components/ui/on-off";
import SegSelect from "@/components/ui/seg-select";
import Modal from "@/components/ui/modal";
import * as t from "@/lib/nox/ui/theme";
import { mig0210On } from "@/lib/nox/rules-0175/flag"; // ★0210 版 3（相談役 11/25 の便 G【G4】④）: 小計に初回料金がどう入るか（旗の後ろ）
import { FIRST_VISIT_SALES_NOTE } from "@/lib/nox/payroll/sales-basis";
import { SALES_BASIS_CONFIRM_LINES_OF, SALES_BACK_DEFAULT_CONFIRM_LINES_OF, SALES_BASIS_CHOICE_LABEL, SALES_BASIS_ROW_NOTE, SALES_BACK_DEFAULT_ROW_NOTE, salesBasisOf, salesBackDefaultOffOf, type SalesBasis } from "@/lib/nox/payroll/sales-basis";

type Pending = { kind: "basis"; next: SalesBasis } | { kind: "default_back"; nextUse: boolean };

export default function SalesBasisRows({ settings, onPatch, readOnly = false, busy = false, on }: {
  settings: Record<string, unknown> | null | undefined;
  onPatch: (patch: Record<string, unknown>, label: string) => void | Promise<void>;
  readOnly?: boolean; busy?: boolean; on: boolean;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  if (!on) return null;
  const basis = salesBasisOf(settings, true);
  const useDefault = !salesBackDefaultOffOf(settings, true);
  const row: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)" };
  const lines = pending ? (pending.kind === "basis" ? SALES_BASIS_CONFIRM_LINES_OF(basis, pending.next) : SALES_BACK_DEFAULT_CONFIRM_LINES_OF(pending.nextUse)) : [];
  async function confirm() {
    const p = pending; setPending(null);
    if (!p) return;
    if (p.kind === "basis") await onPatch({ sales_basis: p.next }, `歩合・スライドの売上の基準を「${SALES_BASIS_CHOICE_LABEL[p.next]}」`);
    else await onPatch({ sales_back_default_off: !p.nextUse }, `既定の売上歩合を「${p.nextUse ? "使う" : "使わない"}」`);
  }
  return (
    <div data-sales-basis-rows="1">
      <div style={row} data-sales-basis={basis}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>歩合・スライドの売上の基準</div>
          <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{SALES_BASIS_ROW_NOTE}{mig0210On() ? FIRST_VISIT_SALES_NOTE : ""}</p>
        </div>
        <SegSelect value={basis} disabled={readOnly || busy} ariaLabel="歩合・スライドの売上の基準"
          onChange={(v) => { if (v !== basis) setPending({ kind: "basis", next: v as SalesBasis }); }}
          options={(["due", "subtotal"] as const).map((k) => [k, SALES_BASIS_CHOICE_LABEL[k]] as const)} />
      </div>
      <div style={row} data-sales-back-default={useDefault ? "1" : "0"}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>既定の売上歩合（3〜10%）</div>
          <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{SALES_BACK_DEFAULT_ROW_NOTE}</p>
        </div>
        {!readOnly ? <OnOffSeg value={useDefault} ariaLabel="既定の売上歩合" disabled={busy} onChange={(v) => { if ((v === true) !== useDefault) setPending({ kind: "default_back", nextUse: v === true }); }} />
          : <b style={{ color: useDefault ? "var(--ok)" : "var(--sub)" }}>{useDefault ? "使う" : "使わない"}</b>}
      </div>
      {pending && (
        <Modal onClose={() => setPending(null)} variant="dialog" opaque>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>給与の計算が変わります</h3>
          <div data-sales-basis-confirm="1" style={{ fontSize: 13, lineHeight: 1.7, overflowWrap: "anywhere" }}>
            {lines.map((l) => <p key={l} style={{ margin: "0 0 6px" }}>{l}</p>)}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" style={{ ...t.btnGhost }} onClick={() => setPending(null)}>やめる</button>
            <button type="button" style={{ ...t.btnGold }} data-sales-basis-confirm-yes="1" onClick={() => void confirm()}>切り替える</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
