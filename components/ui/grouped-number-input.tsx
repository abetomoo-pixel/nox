"use client";

// ★便 X13-G W-12 ④: 数字の入力欄を 3 桁区切りで表示する共通部品（保存値・親の値は数字のままで変えない）。
//   MoneyInput（右に「円」）を使わない欄（件数と金額が混ざる欄・入金のキーパッド欄など）用。数字以外は捨てる・inputMode numeric。
import type { CSSProperties } from "react";
import * as t from "@/lib/nox/ui/theme";

/** 表示用＝数字だけを取り出して 3 桁区切り（空は空のまま） */
export function groupedDigitsOf(v: string | number | null | undefined): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d === "" ? "" : Number(d).toLocaleString("ja-JP");
}

export default function GroupedNumberInput({ value, onChange, placeholder, disabled, style, ariaLabel, className }: {
  value: string | number | null | undefined;
  /** 数字だけの文字列（空＝未入力）で返す */
  onChange: (digits: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input inputMode="numeric" value={groupedDigitsOf(value)} placeholder={placeholder} disabled={disabled} aria-label={ariaLabel}
      className={className ? `num ${className}` : "num"} data-grouped="1"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      style={{ ...t.input, textAlign: "right", ...style }} />
  );
}
