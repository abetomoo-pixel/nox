"use client";

// ★2026-11-16（B6・店舗設定の作り直し＝試作 index6.html の「i」）: 項目の横の ⓘ＝押すと補足が開く（もう一度押すと閉じる）。
//   補足は最小限にして項目の横に置く（画面の文字を減らす）。キーボードでも開ける（button）・読み上げは aria-expanded。
import { useId, useState, type ReactNode } from "react";

export default function InfoTip({ children, label = "説明" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="nox-infotip" aria-expanded={open} aria-controls={id} aria-label={label} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }} data-infotip="1">i</button>
      {open && <span id={id} className="nox-infotip-body" role="note">{children}</span>}
    </>
  );
}
