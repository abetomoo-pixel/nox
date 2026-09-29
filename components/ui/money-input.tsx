"use client";

// ★便 X-11-6（2026-09-29）: 金額欄の共通部品 MoneyInput。
//   数字のみ・inputmode=numeric・欄の右に「円」のサフィックス・表示は 3 桁区切り・値は整数（円）の数字列（親の state はこれまでどおり文字列）。
//   ラベルは呼び出し側で「金額」に統一（括弧の（円）は付けない＝単位は欄の右の「円」）。
//   表示と入力だけの部品＝検証・RPC は呼び出し側。新トークン 0。
import type { CSSProperties } from "react";
import { moneyDigitsOf, moneyDisplayOf } from "@/lib/nox/ui/money";
import * as t from "@/lib/nox/ui/theme";

export default function MoneyInput({ value, onChange, placeholder, disabled, autoFocus, style, ariaLabel, className, width, invalid = false }: {
  /** 整数（円）の数字列（空＝未入力）。number を渡してもよい */
  value: string | number; onChange: (digits: string) => void;
  placeholder?: string; disabled?: boolean; autoFocus?: boolean;
  /** 入力欄の style（幅は width で渡す） */
  style?: CSSProperties; ariaLabel?: string; className?: string;
  /** 欄全体（入力＋円）の幅。未指定は入力欄の style.width を使う */
  width?: number | string;
  invalid?: boolean;
}) {
  const w = width ?? style?.width;
  return (
    <span className="nox-money" style={{ display: "inline-flex", alignItems: "center", gap: 4, width: w, maxWidth: "100%", verticalAlign: "middle" }}>
      <input value={moneyDisplayOf(value)} inputMode="numeric" autoComplete="off" placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
        aria-label={ariaLabel} aria-invalid={invalid ? true : undefined} className={className ? `num ${className}` : "num"}
        style={{ ...t.input, ...style, width: w ? "100%" : style?.width, minWidth: 0, flex: w ? "1 1 auto" : undefined, textAlign: "right", ...(invalid ? { borderColor: "var(--bad)" } : {}) }}
        onChange={(e) => onChange(moneyDigitsOf(e.target.value))} />
      <span aria-hidden="true" style={{ fontSize: 12, color: "var(--sub)", flex: "0 0 auto" }}>円</span>
    </span>
  );
}
