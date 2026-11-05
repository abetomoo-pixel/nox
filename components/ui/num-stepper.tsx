"use client";

// ★便 D M-107（2026-11-05・Agoora 実機）: 数のステッパー（−／＋＋直接入力）。シフトの必要人数（便 A M-76）と同じ型を部品に。min〜max に丸める・空は min。
import type { CSSProperties } from "react";
import * as t from "@/lib/nox/ui/theme";

export function clampStep(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(v) ? Math.trunc(v) : min)); }

export default function NumStepper({ value, onChange, min = 0, max = 99, unit, ariaLabel, disabled, width = 44, style, dataKey = "data-num-stepper" }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; unit?: string; ariaLabel: string; disabled?: boolean; width?: number; style?: CSSProperties; dataKey?: string;
}) {
  const btn: CSSProperties = { ...t.btnGhost, ...t.btnSm, padding: "4px 10px", minWidth: 32 };
  const data = { [dataKey]: String(value) } as Record<string, string>;
  return (
    <span {...data} style={{ display: "inline-flex", alignItems: "center", gap: 4, ...style }}>
      <button type="button" style={btn} disabled={disabled || value <= min} onClick={() => onChange(clampStep(value - 1, min, max))} aria-label={`${ariaLabel} を 1 減らす`}>−</button>
      <input inputMode="numeric" value={String(value)} aria-label={ariaLabel} disabled={disabled}
        onChange={(e) => { const s = e.target.value.replace(/[^0-9]/g, ""); onChange(s === "" ? min : clampStep(Number(s), min, max)); }}
        style={{ ...t.input, width, padding: "4px 6px", textAlign: "center" }} className="num" />
      <button type="button" style={btn} disabled={disabled || value >= max} onClick={() => onChange(clampStep(value + 1, min, max))} aria-label={`${ariaLabel} を 1 増やす`}>＋</button>
      {unit && <span style={{ fontSize: 12.5 }}>{unit}</span>}
    </span>
  );
}
