"use client";

// ★便 SH-UI-c2 C2-7（2026-10-23）: 狭い幅（1,024px 未満）の右パネル＝画面下から出るシート。背景は暗転・上端に取っ手と「閉じる」・高さ 90%・中はスクロール。
//   呼び出し側が幅で出し分ける（useNarrow）＝1,024px 以上は今の右パネル／インライン表示のまま（この部品は描かない）。
//   Esc と背景タップで閉じる・開いている間は背面をスクロールさせない（Modal と同じ流儀）。
import { useEffect, useState, type ReactNode } from "react";

/** 幅 < max のとき true（SSR は false＝広い前提で描き、マウント後に判定） */
export function useNarrow(max = 1024): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${max - 1}px)`);
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [max]);
  return narrow;
}

export default function BottomSheet({ onClose, title, actions, children, testId = "bottom-sheet" }: { onClose: () => void; title?: ReactNode; actions?: ReactNode; children: ReactNode; testId?: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div role="presentation" data-sheet-overlay="1" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.55)" }}>
      <div role="dialog" aria-modal="true" data-sheet={testId} onClick={(e) => e.stopPropagation()}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "90%", background: "var(--card)", color: "var(--ink)", borderRadius: "16px 16px 0 0", boxShadow: "0 -8px 30px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div data-sheet-head="1" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "8px 14px 6px", borderBottom: "1px solid var(--line)" }}>{/* ★便 M-2: 操作が多いときは 2 段目に（閉じるは右上のまま） */}
          <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: 6, width: 40, height: 4, marginLeft: -20, borderRadius: 2, background: "var(--line2)" }} />
          <div style={{ order: 1, fontSize: 13.5, fontWeight: 800, minWidth: 0, flex: 1, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <button type="button" data-sheet-close="1" onClick={onClose} style={{ order: 2, marginTop: 6, minHeight: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--card2)", color: "var(--ink)", fontWeight: 700, fontSize: 13 }}>閉じる</button>
          {actions && <div data-sheet-actions="1" style={{ order: 3, flexBasis: "100%", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>{actions}</div>}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "10px 14px 16px" }}>{children}</div>
      </div>
    </div>
  );
}
