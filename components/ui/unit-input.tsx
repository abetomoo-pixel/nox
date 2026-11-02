"use client";

// ★便 M5b M-50（2026-11-02）: 単位つき数値入力の共通部品＝正本 docs/handoff/mock/setup_v5.html の .unit（入力欄と単位の箱が一体の枠）。
//   ¥ は入力欄の左の箱（pre）・円／分／席／卓／% などは右の箱（unit）。同じ欄に ¥ と 円 を両方付けない（pre があれば unit の「円」は描かない）。
//   数値は右寄せ。値は文字列のまま親へ（検証・RPC は呼び出し側）。見た目は globals.css の .nox-unit（新トークン 0）。
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";

export type UnitInputProps = {
  value: string | number; onChange: (v: string) => void;
  /** 左の箱（¥ など） */
  pre?: string;
  /** 右の箱（円・分・% など）。pre が「¥」のときの「円」は描かない（二重表記の禁止） */
  unit?: string;
  /** 枠全体の幅（未指定は親に合わせる） */
  width?: number | string;
  invalid?: boolean;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  type?: "text" | "number";
  min?: number; max?: number; step?: number;
  placeholder?: string; disabled?: boolean; autoFocus?: boolean; ariaLabel?: string; className?: string;
  /** 入力欄の追加 style（枠の style は frameStyle） */
  style?: CSSProperties; frameStyle?: CSSProperties;
  /** 中央寄せ（人数など）。既定は右寄せ */
  center?: boolean;
  onBlur?: () => void;
};

export default function UnitInput({ value, onChange, pre, unit, width, invalid = false, inputMode = "decimal", type = "text", min, max, step, placeholder, disabled, autoFocus, ariaLabel, className, style, frameStyle, center = false, onBlur }: UnitInputProps) {
  const right = pre === "¥" && unit === "円" ? undefined : unit;
  return (
    <span className={`nox-unit${invalid ? " is-invalid" : ""}${disabled ? " is-disabled" : ""}`} style={{ width, ...frameStyle }}>
      {pre && <em className="pre" aria-hidden="true">{pre}</em>}
      <input value={value} type={type} inputMode={inputMode} min={min} max={max} step={step} autoComplete="off" placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
        aria-label={ariaLabel} aria-invalid={invalid ? true : undefined} className={className ? `num ${className}` : "num"}
        style={{ textAlign: center ? "center" : "right", ...style }} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {right && <em aria-hidden="true">{right}</em>}
    </span>
  );
}

/** ★M-50: 既存の入力（input／MoneyInput／GroupedNumberInput）を同じ枠に入れる包み。pre＝左の箱・post＝右の箱。
 *  中の入力の枠線・背景は .nox-unit の CSS が消す（呼び出し側の t.input をそのまま残してよい）。MoneyInput（¥ つき）を包むときは pre を渡さない */
export function UnitBox({ pre, post, children, width, invalid = false }: { pre?: string; post?: string; children: ReactNode; width?: number | string; invalid?: boolean }) {
  return (
    <span className={`nox-unit nox-unitbox${invalid ? " is-invalid" : ""}`} style={{ width }}>
      {pre && <em className="pre" aria-hidden="true">{pre}</em>}
      {children}
      {post && <em aria-hidden="true">{post}</em>}
    </span>
  );
}
