"use client";

// ★便 GV-C C-12（ex_plan_20261016・(a)）: 画面に戻ったとき／タブが見えたとき／見えている間は 60 秒ごとに load を呼び直す。
//   隠れている間は間隔を止める・実行中の重複呼びは抑止。DB は読むだけ（各画面の load をそのまま包む）。
import { useEffect, useRef } from "react";

export const LIVE_RELOAD_INTERVAL_MS = 60_000;

export function useLiveReload(load: () => unknown | Promise<unknown>, opts: { onFocus?: boolean; onVisible?: boolean; intervalMs?: number; pauseWhenHidden?: boolean } = {}) {
  const { onFocus = true, onVisible = true, intervalMs = LIVE_RELOAD_INTERVAL_MS, pauseWhenHidden = true } = opts;
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    let inFlight = false;
    const run = async () => {
      if (inFlight) return;
      if (pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden") return;
      inFlight = true;
      try { await ref.current(); } finally { inFlight = false; }
    };
    const onF = () => { void run(); };
    const onV = () => { if (document.visibilityState === "visible") void run(); };
    if (onFocus) window.addEventListener("focus", onF);
    if (onVisible) document.addEventListener("visibilitychange", onV);
    const id = intervalMs > 0 ? window.setInterval(() => { void run(); }, intervalMs) : null;
    return () => {
      if (onFocus) window.removeEventListener("focus", onF);
      if (onVisible) document.removeEventListener("visibilitychange", onV);
      if (id != null) window.clearInterval(id);
    };
  }, [onFocus, onVisible, intervalMs, pauseWhenHidden]);
}
