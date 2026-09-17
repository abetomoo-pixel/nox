"use client";

// ★裁定269／270-2: 店舗の「使う制度」9 行のトグル＝マスタ「報酬制度」と初期設定 STEP 3 が同じ器で使う純部品。
//   props は settings（現値）・onChange（切替の依頼）・usage（制度ごとの使用中 cast 数）の 3 つだけ＝データ取得を中に持たない。
//   269-3: 使用中 n>0 の制度は OFF 不可（OFF ボタン disabled＋理由 1 行）。ON への切替は常に可。
//   切替 UI は store-flag-toggle（.nox-seg OFF／ON）の写経＝裁定244 の例外（中央化しない）。新トークン 0。
import { SYSTEM_DESCS, SYSTEM_KEYS, SYSTEM_LABELS, isSystemOn, type StoreSettings, type SystemKey } from "@/lib/nox/store-systems";

export default function StoreSystemsPanel({
  settings, onChange, usage, readOnly = false, busyKey = null,
}: {
  settings: StoreSettings;
  /** 切替の依頼（保存は呼び出し側＝set_store_profile の 1 キー patch）。readOnly のときは呼ばれない */
  onChange: (key: SystemKey, next: boolean) => void | Promise<void>;
  /** 269-3: 制度ごとの使用中 cast 数（systemUsageOf の結果） */
  usage: Record<SystemKey, number>;
  /** owner 以外＝現在値のみ表示 */
  readOnly?: boolean;
  /** 保存中のキー（そのキーのボタンだけ disabled） */
  busyKey?: SystemKey | null;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {SYSTEM_KEYS.map((k) => {
        const on = isSystemOn(settings, k);
        const n = usage[k] ?? 0;
        const lockOff = n > 0; // 269-3
        const busy = busyKey === k;
        return (
          <div key={k} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ minWidth: 0, flex: "1 1 260px" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{SYSTEM_LABELS[k]}</div>
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{SYSTEM_DESCS[k]}</p>
              <p style={{ fontSize: 11.5, margin: "4px 0 0", color: lockOff ? "var(--champ)" : "var(--sub)" }}>
                使用中 <b className="num">{n}</b> 名
                {lockOff && <span style={{ marginLeft: 6 }}>（キャスト個別の設定があるため OFF にできません）</span>}
              </p>
            </div>
            {!readOnly ? (
              <div className="nox-seg" role="group" aria-label={SYSTEM_LABELS[k]}>
                <button type="button" className={!on ? "on" : ""} disabled={busy || lockOff || !on}
                  title={lockOff ? "使用中のキャストがいるため OFF にできません" : undefined}
                  onClick={() => void onChange(k, false)}>OFF</button>
                <button type="button" className={on ? "on" : ""} disabled={busy || on} onClick={() => void onChange(k, true)}>ON</button>
              </div>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <b style={{ color: on ? "var(--ok)" : "var(--sub)" }}>{on ? "ON" : "OFF"}</b>
                <span className="nox-stpill">オーナーのみ変更できます</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
