"use client";
// ★便 SH-UI-c2 C2-8（棚卸しの −／＋）→★便 2 M-17 追補（2026-10-29・カード手数料の率の ±）で共通部品に: 押すと 1 段・長押しで連続（400ms 後に 120ms ごと）。タップ目安 40px。
//   見た目は呼び出し側の className／style で（棚卸し＝.nox-st-btn・手数料＝.nox-step-btn）。onContextMenu を止めて長押しのメニューを出さない。
import { useRef, type CSSProperties } from "react";

export default function StepBtn({ label, onStep, disabled, testId, ariaLabel, className, style, dataAttr }: {
  label: string; onStep: () => void; disabled?: boolean; testId?: string; ariaLabel?: string; className?: string; style?: CSSProperties;
  /** data-* 属性の名前（既定 data-stocktake-step＝C2-8 の suite の pin を保つ） */ dataAttr?: string;
}) {
  const timer = useRef<{ t: ReturnType<typeof setTimeout> | null; i: ReturnType<typeof setInterval> | null }>({ t: null, i: null });
  const stop = () => { if (timer.current.t) clearTimeout(timer.current.t); if (timer.current.i) clearInterval(timer.current.i); timer.current = { t: null, i: null }; };
  const start = () => { stop(); timer.current.t = setTimeout(() => { timer.current.i = setInterval(onStep, 120); }, 400); };
  const extra: Record<string, string | undefined> = { [dataAttr ?? "data-stocktake-step"]: testId };
  return (
    <button type="button" className={className ?? "nox-st-btn"} aria-label={ariaLabel ?? (label === "−" ? "1 減らす" : "1 増やす")} disabled={disabled} {...extra}
      onClick={onStep} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      style={style ?? { width: 40, height: 34, borderRadius: 8, border: "1px solid var(--line2)", background: "var(--card2)", color: "var(--ink)", fontSize: 16, fontWeight: 800, touchAction: "manipulation", userSelect: "none" }}>{label}</button>
  );
}
