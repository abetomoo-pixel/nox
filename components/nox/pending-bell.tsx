"use client";

// ★便 SH-UI-c2 C2-13 ④（2026-10-23）: 上部バー右上（アカウント横）のベル＝未処理の合計（/api/home/pending と同じ数＝カードの見出し）。
//   押すと HOME の要承認カードへ（HOME 上ならスクロール・他画面なら /dashboard#pending-card）。カードが承認／却下したら nox:pending イベントで数を更新。
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PENDING_CARD_ID } from "./pending-card";

export default function PendingBell({ storeId }: { storeId: string | null }) {
  const [n, setN] = useState<number | null>(null);
  const path = usePathname() ?? "";
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/home/pending${storeId ? `?store=${encodeURIComponent(storeId)}` : ""}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { total?: number };
        if (alive) setN(typeof j.total === "number" ? j.total : 0);
      } catch { /* 表示だけ＝失敗は印なし */ }
    };
    void load();
    const onEv = (e: Event) => { const d = (e as CustomEvent<{ total: number }>).detail; if (d && typeof d.total === "number") setN(d.total); };
    window.addEventListener("nox:pending", onEv);
    return () => { alive = false; window.removeEventListener("nox:pending", onEv); };
  }, [storeId, path]);
  const go = () => {
    if (path === "/dashboard" || path === "/") { document.getElementById(PENDING_CARD_ID)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    router.push(`/dashboard#${PENDING_CARD_ID}`);
  };
  return (
    <button type="button" className="nox-hdrbtn" onClick={go} aria-label={n ? `要承認 ${n} 件` : "要承認なし"} title={n ? `要承認 ${n} 件` : "要承認なし"} data-pending-bell={n ?? ""} style={{ position: "relative" }}>
      <span aria-hidden="true">🔔</span>
      {!!n && <span className="num" data-pending-bell-count={n} style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "var(--bad)", color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: "16px", textAlign: "center" }}>{n > 99 ? "99+" : n}</span>}
    </button>
  );
}
