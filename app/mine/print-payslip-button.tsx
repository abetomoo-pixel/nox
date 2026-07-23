"use client";

import * as t from "@/lib/nox/ui/theme";

// D2: /mine は server component ゆえ window.print の client ボタンを切り出し。
// nox-noprint＝印刷時は自身を消す（globals.css @media print）。押下でブラウザ印刷→「PDFで保存」も可。
export default function PrintPayslipButton() {
  return (
    <button
      type="button"
      className="nox-noprint"
      onClick={() => window.print()}
      style={{ ...t.btnGhost, ...t.btnSm }}
    >
      印刷 / PDFで保存
    </button>
  );
}
