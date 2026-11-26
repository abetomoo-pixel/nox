"use client";

// ★0217（起票167・相談役 11/26 の便 L1）: 延長指名（ON／OFF）と延長指名料の額（店で一律の 1 つ）。料金マスタの「指名・同伴料金」の枠の中（同伴の本指名自動付与の下）。
//   ON／OFF＝set_store_profile（オーナーだけ・今のまま）。ON のときだけすぐ下に金額の欄と中央の保存（set_ext_shimei_fee・オーナーと自店の店長）。
//   ON なのに額が無い店は「金額が未設定です」。欄は 1 円以上（0 と空は保存させない）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import MoneyInput from "@/components/ui/money-input";
import Toast from "@/components/ui/toast";
import StoreFlagToggle from "../store-flag-toggle";
import { EXT_SHIMEI_AUTO_NOTE, EXT_SHIMEI_DESC, EXT_SHIMEI_LABEL, EXT_SHIMEI_UNSET_JA, extShimeiErrJa, extShimeiInputErrOf } from "@/lib/nox/pricing/ext-shimei";

export default function ExtShimeiCard({ storeId, isOwner, initialOn, initialAmount, autoMode }: {
  storeId: string; isOwner: boolean; initialOn: boolean; initialAmount: number | null; autoMode: boolean;
}) {
  const supabase = createClient();
  const [on, setOn] = useState(initialOn);
  const [saved, setSaved] = useState<number | null>(initialAmount);
  const [val, setVal] = useState<string>(initialAmount != null && initialAmount > 0 ? String(initialAmount) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function save() {
    if (busy) return;
    const bad = extShimeiInputErrOf(val);
    if (bad) { setMsg({ text: bad, bad: true }); return; }
    setBusy(true); setMsg(null);
    const amount = Number(val);
    const { error } = await supabase.rpc("set_ext_shimei_fee", { p_store_id: storeId, p_amount: amount });
    setBusy(false);
    if (error) { setMsg({ text: `保存に失敗: ${extShimeiErrJa(error.message)}`, bad: true }); return; }
    setSaved(amount);
    setMsg({ text: `延長指名料を ¥${amount.toLocaleString("ja-JP")} にしました`, bad: false });
  }

  return (
    <div data-ext-shimei-card="1">
      <StoreFlagToggle storeId={storeId} flagKey="ext_shimei_enabled" isOwner={isOwner} initial={initialOn}
        label={EXT_SHIMEI_LABEL} desc={EXT_SHIMEI_DESC} onSaved={(next) => { setOn(next); setMsg(null); }} />
      {on && (
        <div data-ext-shimei-amount="1" style={{ marginTop: 10 }}>
          {saved == null && (
            <p data-ext-shimei-unset="1" style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 700, color: "var(--gold2)" }}>{EXT_SHIMEI_UNSET_JA}</p>
          )}
          <label style={{ display: "grid", gap: 4 }}>
            <span style={t.fieldLabel}>延長指名料（延長 1 回ごと・本指名 1 人につき）</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <MoneyInput value={val} onChange={setVal} placeholder="例 1000" ariaLabel="延長指名料" width={140} disabled={busy} />
              <span style={{ fontSize: 13 }}>円</span>
            </span>
          </label>
          {autoMode && <p data-ext-shimei-auto="1" style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--sub)" }}>{EXT_SHIMEI_AUTO_NOTE}</p>}
          <Toast msg={msg?.text ?? null} kind={msg ? (msg.bad ? "error" : "success") : undefined} style={{ margin: "8px 0 0" }} />
          <div className="nox-actions" style={{ marginTop: 12 }}>{/* ★裁定244: フォーム直下の保存＝中央 */}
            <button style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void save()}>延長指名料を保存</button>
          </div>
        </div>
      )}
    </div>
  );
}
