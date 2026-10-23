"use client";

// ★便 P175-prep P-3（裁定418 CANON 型・0175 v2 ★3／★11 店設定キー）: 「使う制度」の下に出る 0175 の店設定＝ドリンクバック ON／OFF・売上小計の範囲・支払サイクル（週払いの締め曜日と支払までの日数）・税の既定（新規店＝外税）。
//   RULES_0175_APPLIED=false の間は systems-board が mount しない（白名単に無いキーは set_store_profile が 'bad key'）。保存＝親の onPatch（set_store_profile の patch・audit は RPC 側）。
import OnOffSeg from "@/components/ui/on-off";
import * as t from "@/lib/nox/ui/theme";
import { DOW_LABEL, NEW_STORE_PRICE_DISPLAY_0175, SALES_SUBTOTAL_MODE_LABEL, STORE_KEYS_0175, drinkCountBackOn, payCycleOf, payCycleTextOf, salesSubtotalModeOf } from "@/lib/nox/rules-0175/settings";

type Ssm = keyof typeof SALES_SUBTOTAL_MODE_LABEL;

export default function StoreRules0175Panel({ settings, payDay = null, onPatch, readOnly = false, busy = false }: {
  settings: Record<string, unknown> | null | undefined;
  payDay?: number | null;
  onPatch: (patch: Record<string, unknown>, label: string) => void | Promise<void>;
  readOnly?: boolean; busy?: boolean;
}) {
  const drinkOn = drinkCountBackOn(settings);
  const ssm = salesSubtotalModeOf(settings);
  const cyc = payCycleOf(settings, payDay);
  const row: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)" };
  return (
    <div data-rules-0175-panel="1">
      <div data-onoff-row="1" data-drink-count-back={drinkOn ? "1" : "0"} style={row}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>ドリンクバック（本数で払う）</div>
          <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>OFF の店はドリンクのバック設定と「誰のドリンクか」の記録を出しません（CANON 型＝OFF）。</p>
        </div>
        {!readOnly ? <OnOffSeg value={drinkOn} ariaLabel="ドリンクバック" disabled={busy} onChange={(v) => void onPatch({ [STORE_KEYS_0175.drinkCountBack]: v === true }, `ドリンクバックを「${v === true ? "ON" : "OFF"}」`)} />
          : <b style={{ color: drinkOn ? "var(--ok)" : "var(--sub)" }}>{drinkOn ? "ON" : "OFF"}</b>}
      </div>
      <div style={row} data-sales-subtotal-mode={ssm}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>売上小計の範囲</div>
          <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>報酬率やバックの母数にする売上。会計額か、税・サービス料と割引を除いた小計か。</p>
        </div>
        <select value={ssm} disabled={readOnly || busy} aria-label="売上小計の範囲" style={{ ...t.input, width: "auto" }}
          onChange={(e) => void onPatch({ [STORE_KEYS_0175.salesSubtotalMode]: e.target.value }, `売上小計の範囲を「${SALES_SUBTOTAL_MODE_LABEL[e.target.value as Ssm]}」`)}>
          {(Object.keys(SALES_SUBTOTAL_MODE_LABEL) as Ssm[]).map((k) => <option key={k} value={k}>{SALES_SUBTOTAL_MODE_LABEL[k]}</option>)}
        </select>
      </div>
      <div style={row} data-pay-cycle={cyc.cycle}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>支払サイクル</div>
          <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{payCycleTextOf(cyc)}（週払いの店は締め曜日と支払までの日数をここで）</p>
        </div>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select value={cyc.weekCloseDow ?? ""} disabled={readOnly || busy} aria-label="週の締め曜日" style={{ ...t.input, width: "auto" }}
            onChange={(e) => void onPatch({ [STORE_KEYS_0175.weekCloseDow]: e.target.value === "" ? null : Number(e.target.value) }, "週の締め曜日を変更")}>
            <option value="">締め曜日なし（月払い）</option>
            {DOW_LABEL.map((d, i) => <option key={i} value={i}>{d}曜締め</option>)}
          </select>
          <input type="number" min={0} max={31} value={cyc.payDaysAfter ?? ""} disabled={readOnly || busy || cyc.weekCloseDow === null} aria-label="締めから支払までの日数" placeholder="日数" style={{ ...t.input, width: 64 }}
            onChange={(e) => void onPatch({ [STORE_KEYS_0175.payDaysAfter]: e.target.value === "" ? null : Number(e.target.value) }, "支払までの日数を変更")} />
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "8px 0 0" }}>新規店の税の既定＝{NEW_STORE_PRICE_DISPLAY_0175 === "tax_excluded" ? "外税" : "内税"}（既存店の表示は変わりません）</p>
    </div>
  );
}
