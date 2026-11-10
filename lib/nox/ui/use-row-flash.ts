"use client";
// ★M-135（2026-11-10）: 保存の直後に「変わった所を一瞬強調」する共通の仕組み（products-board の highlightId を一般化）。
//   使い方: const { flashId, flash } = useRowFlash("prow-"); 行に id={`prow-${id}`} と className={flashId === id ? "nox-rowflash" : undefined}。
//   保存 → 一覧の再読込（await load()）→ 成功の文言 → flash(id) の順＝件数・一覧・文言が同じタイミングで変わる（文言だけ先に出さない）。
import { useCallback, useEffect, useState } from "react";

export const ROW_FLASH_MS = 1600;

export function useRowFlash(idPrefix: string) {
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!flashId) return;
    if (typeof document !== "undefined") document.getElementById(idPrefix + flashId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setFlashId(null), ROW_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId, idPrefix]);
  const flash = useCallback((id: string | null | undefined) => { if (id) setFlashId(id); }, []);
  return { flashId, flash };
}
