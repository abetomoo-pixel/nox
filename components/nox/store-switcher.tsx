"use client";

// ★0203（2 号店の段 2・相談役 21:40 の ■2-e）: オーナーの「今見ている店」の切り替え（上部バー）。2 店以上の owner だけ・旗の後ろ（出すかは layout が決める）。
//   選ぶと POST /api/store/current（cookie だけ）→ 読み直す（今見ている店でサーバが読み直す＝読み直さない移動にしない）。初期設定の前の店には「初期設定の前」と出す。
import { useState } from "react";

export default function StoreSwitcher({ stores, currentId }: { stores: { id: string; name: string; setupDone: boolean }[]; currentId: string | null }) {
  const [busy, setBusy] = useState(false);
  async function pick(id: string) {
    if (!id || id === currentId) return;
    setBusy(true);
    const r = await fetch("/api/store/current", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId: id }) });
    if (r.ok) window.location.reload(); else setBusy(false);
  }
  return (
    <label className="nox-store-switch" data-store-switch="1" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
      <span style={{ color: "var(--sub)" }}>店</span>
      <select value={currentId ?? ""} disabled={busy} onChange={(e) => void pick(e.target.value)} aria-label="今見ている店" style={{ minHeight: 34, maxWidth: 200, borderRadius: 8, border: "1px solid var(--line2)", background: "var(--bg2)", color: "var(--ink)", padding: "4px 8px", font: "inherit" }}>
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.setupDone ? "" : "（初期設定の前）"}</option>)}
      </select>
    </label>
  );
}
