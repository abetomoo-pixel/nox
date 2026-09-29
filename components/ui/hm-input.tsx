"use client";

// ★裁定318（2026-09-29・便 X-9-2）: 時刻入力の共通部品。HHMM／HH:MM／H:MM／HH を受け、blur 時に 'HH:MM' へ正規化して欄に戻す。
//   翌日（24〜47 時）も同じ。スマホは inputmode=numeric（数字キーボード）。検証は呼び出し側が正規化後の値で行う（normalizeHHMM が null＝不正）。
//   表示と入力だけの部品＝RPC・意味づけは呼び出し側。新トークン 0。
import type { CSSProperties } from "react";
import { normalizeHHMM } from "@/lib/nox/time/hhmm";

export default function HmInput({ value, onChange, maxHour = 47, placeholder, disabled, required, autoFocus, style, ariaLabel, className }: {
  value: string; onChange: (v: string) => void;
  /** 時の上限（既定 47＝翌日まで）。当日だけの欄は 23 */
  maxHour?: number;
  placeholder?: string; disabled?: boolean; required?: boolean; autoFocus?: boolean;
  style?: CSSProperties; ariaLabel?: string; className?: string;
}) {
  return (
    <input value={value} inputMode="numeric" maxLength={5} autoComplete="off"
      placeholder={placeholder} disabled={disabled} required={required} autoFocus={autoFocus}
      aria-label={ariaLabel} className={className} style={style}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => { const n = normalizeHHMM(e.target.value, maxHour); if (n !== null && n !== e.target.value) onChange(n); }} />
  );
}
