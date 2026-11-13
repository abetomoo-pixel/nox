"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PUNCH_PENDING_EVENT, PUNCH_PENDING_TEXT } from "@/lib/nox/shift/punch-pending";

// ★2026-11-13 通しの確かめの C（相談役【3】a）: 打刻の直後、サーバーで描いた古い行（今日のシフトの 1 行・レジの理由の 1 行）を「反映中…」に替える。
//   PunchActions が打刻の成功から読み直し（router.refresh）が終わるまで PUNCH_PENDING_EVENT を投げる＝C-2（入金の後の古い額）と同じ直し方。
export default function PunchPending({ children, attr }: { children: ReactNode; attr?: string }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setPending(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(PUNCH_PENDING_EVENT, on);
    return () => window.removeEventListener(PUNCH_PENDING_EVENT, on);
  }, []);
  if (!pending) return <>{children}</>;
  return <p className="nox-pstate" data-mine-punch-pending={attr ?? "1"} style={{ margin: "0 0 6px", color: "var(--sub)" }}>{PUNCH_PENDING_TEXT}</p>;
}
