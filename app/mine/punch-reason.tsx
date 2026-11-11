"use client";

// ★0201（裁定474・2026-11-11 フラグ便）: ハードの店で範囲外・位置が取れない＝理由を書けば打刻できる（記録に残る＝geo_override）。
//   打刻ボタン（punch-actions.tsx）には金額の入力欄を置かない約束（verify:nox-messages ms(2-21)）＝理由の欄はこの部品に分ける。
import * as t from "@/lib/nox/ui/theme";

export default function PunchReason({ type, value, onChange, busy, onSubmit }: { type: "in" | "out"; value: string; onChange: (v: string) => void; busy: boolean; onSubmit: () => void }) {
  return (
    <div data-punch-reason={type} style={{ marginTop: 8, display: "grid", gap: 6 }}>
      <label style={{ fontSize: 12.5, color: "var(--sub)" }}>理由（お店の記録に残ります）
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder="例：店の前で電波が弱い" style={{ ...t.input, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
      </label>
      <button type="button" style={{ ...t.btnGold, opacity: busy || !value.trim() ? 0.55 : 1 }} disabled={busy || !value.trim()} onClick={onSubmit}>
        理由を書いて{type === "in" ? "出勤" : "退勤"}を打刻
      </button>
    </div>
  );
}
