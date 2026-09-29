"use client";

// ★裁定318（2026-09-29・便 X-9-2）→ 追補（便 X-10-3）: 時刻入力の共通部品＝入力マスク。
//   数字のみ・最大 4 桁・2 桁で ':' 自動挿入・5 桁目は無視・貼り付けも同形に整形（全角も半角へ）。
//   時 00〜47（maxHour で 23 に絞れる）／分 00〜59 の範囲外はその場で赤＋文言。送信の非活性は呼び出し側が hmRangeErrorOf で判定する。
//   blur では 'HH'／'HH:' を 'HH:00' に補う。送信時の normalizeHHMM は呼び出し側に残す（二重防御）。スマホは inputmode=numeric。
//   表示と入力だけの部品＝RPC・意味づけは呼び出し側。新トークン 0。
import type { CSSProperties } from "react";
import { Message } from "@/components/ui/toast";
import { hmRangeErrorOf, maskHHMM, normalizeHHMM } from "@/lib/nox/time/hhmm";

export default function HmInput({ value, onChange, maxHour = 47, placeholder, disabled, required, autoFocus, style, ariaLabel, className }: {
  value: string; onChange: (v: string) => void;
  /** 時の上限（既定 47＝翌日まで）。当日だけの欄は 23 */
  maxHour?: number;
  placeholder?: string; disabled?: boolean; required?: boolean; autoFocus?: boolean;
  style?: CSSProperties; ariaLabel?: string; className?: string;
}) {
  const rangeErr = hmRangeErrorOf(value, maxHour);
  return (
    <span className="nox-hminput" style={{ display: "inline-flex", flexDirection: "column", verticalAlign: "top", width: style?.width, flex: style?.flex }}>
      <input value={value} inputMode="numeric" maxLength={5} autoComplete="off"
        placeholder={placeholder} disabled={disabled} required={required} autoFocus={autoFocus}
        aria-label={ariaLabel} aria-invalid={rangeErr ? true : undefined} className={className}
        style={{ ...style, width: style?.width ? "100%" : undefined, ...(rangeErr ? { borderColor: "var(--bad)", color: "var(--bad)" } : {}) }}
        onChange={(e) => {
          const it = (e.nativeEvent as InputEvent).inputType ?? "";
          onChange(maskHHMM(e.target.value, value, it.startsWith("delete")));
        }}
        onBlur={(e) => { const n = normalizeHHMM(e.target.value, maxHour); if (n !== null && n !== e.target.value) onChange(n); }} />
      {/* 裁定281: 文言は共通部品 Message（error＝role alert）を通す */}
      {rangeErr && <Message kind="error" style={{ fontSize: 11, padding: "2px 6px", marginTop: 2, whiteSpace: "nowrap" }}>{rangeErr}</Message>}
    </span>
  );
}
