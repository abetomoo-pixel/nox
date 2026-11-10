"use client";

// ★便 X-11-6（2026-09-29）: 金額欄の共通部品 MoneyInput。
//   数字のみ・inputmode=numeric・表示は 3 桁区切り・値は整数（円）の数字列（親の state はこれまでどおり文字列）。
//   ラベルは呼び出し側で「金額」に統一（括弧の（円）は付けない＝単位は欄の箱）。
// ★便 M5b M-50（2026-11-02）: 正本 setup_v5.html の .unit の形＝入力欄と単位の箱が一体の枠（.nox-unit）。¥ は入力欄の左の箱・「円」は付けない（¥ と 円 を同じ欄に両方付けない）。数値は右寄せ。
//   表示と入力だけの部品＝検証・RPC は呼び出し側。新トークン 0。
import type { CSSProperties } from "react";
import { moneyDigitsOf, moneyDisplayOf } from "@/lib/nox/ui/money";

export default function MoneyInput({ value, onChange, placeholder, disabled, autoFocus, style, ariaLabel, className, width, invalid = false, onBlur }: {
  /** 整数（円）の数字列（空＝未入力）。number を渡してもよい */
  value: string | number; onChange: (digits: string) => void;
  placeholder?: string; disabled?: boolean; autoFocus?: boolean;
  /** 入力欄の style（幅は width で渡す） */
  style?: CSSProperties; ariaLabel?: string; className?: string;
  /** 欄全体（¥＋入力）の幅。未指定は入力欄の style.width を使う */
  width?: number | string;
  invalid?: boolean;
  /** ★M-155: 欄を離れたときに保存する画面用（任意） */
  onBlur?: () => void;
}) {
  const w = width ?? style?.width;
  // 枠は .nox-unit が持つ＝呼び出し側の t.input（枠線・背景・余白）は入力欄に重ねない（文字の大きさ・太さだけ引き継ぐ）
  const rest: CSSProperties = { fontSize: style?.fontSize, fontWeight: style?.fontWeight };
  return (
    <span className={`nox-unit nox-money${invalid ? " is-invalid" : ""}${disabled ? " is-disabled" : ""}`} style={{ width: w }}>
      <em className="pre" aria-hidden="true">¥</em>
      <input value={moneyDisplayOf(value)} inputMode="numeric" autoComplete="off" placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
        aria-label={ariaLabel} aria-invalid={invalid ? true : undefined} className={className ? `num ${className}` : "num"}
        style={{ ...rest, textAlign: "right" }}
        onChange={(e) => onChange(moneyDigitsOf(e.target.value))} onBlur={onBlur} />
    </span>
  );
}
