"use client";

import * as t from "@/lib/nox/ui/theme";

// D2: /mine は server component ゆえ window.print の client ボタンを切り出し。
// nox-noprint＝印刷時は自身を消す（globals.css @media print）。押下でブラウザ印刷→「PDFで保存」も可。
// ★M-183（2026-11-12）: 印刷中だけ document.title を「給与明細_年月_店名_本人の名前」に＝PDF のファイル名（NOX.pdf にしない）
export default function PrintPayslipButton({ fileTitle }: { fileTitle?: string | null }) {
  const print = () => {
    if (!fileTitle) { window.print(); return; }
    const prev = document.title;
    const done = () => { document.title = prev; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    document.title = fileTitle;
    window.setTimeout(() => window.print(), 50);
  };
  return (
    <button
      type="button"
      className="nox-noprint"
      onClick={print}
      style={{ ...t.btnGhost, ...t.btnSm }}
    >
      印刷 / PDFで保存
    </button>
  );
}
