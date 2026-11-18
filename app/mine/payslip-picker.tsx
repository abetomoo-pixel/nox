"use client";

import { Children, useState, type ReactNode } from "react";
import * as t from "@/lib/nox/ui/theme";
import PrintPayslipButton from "./print-payslip-button";
import { slipPeriodOptionLabelOf } from "@/lib/nox/payroll/list";

// ★2026-11-18 夜（相談役 ⑥ C-4）: 確定給与明細の期の選択。今までは直近の数期の明細を縦に全部並べ、「印刷 / PDFで保存」も全部を刷っていた
//   （ファイル名は直近の期）。ここでは期を 1 つ選んで見せ、印刷も選んでいる期だけに効かせる。
//   期＝payslips の行（確定・支払済みの期だけ＝確定を取り消すと行は消える）・開いたときは直近（並びは期の新しい順）。
//   選んでいない期は display:none＝画面にも印刷にも出ない（印刷の隔離は今までどおり .nox-print）。明細の描画（PayslipSlip）は server 側のまま＝children で受ける。
export default function MinePayslipPicker({ periods, fileTitles, children }: { periods: string[]; fileTitles: string[]; children: ReactNode }) {
  const [sel, setSel] = useState(0);
  const items = Children.toArray(children);
  const cur = Math.min(sel, Math.max(0, items.length - 1));
  return (
    <>
      <div className="nox-noprint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 11 }} data-mine-slip-bar="1">
        {periods.length > 1 && (
          <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--sub)" }}>
            期
            <select value={cur} onChange={(e) => setSel(Number(e.target.value))} aria-label="明細の期" data-mine-slip-period="1"
              style={{ ...t.input, width: "auto", padding: "6px 9px", fontSize: 13 }}>
              {periods.map((p, i) => <option key={`${p}:${i}`} value={i}>{slipPeriodOptionLabelOf(p, i === 0)}</option>)}
            </select>
          </label>
        )}
        <span style={{ marginLeft: "auto" }}><PrintPayslipButton fileTitle={fileTitles[cur] ?? null} /></span>
      </div>
      <div style={{ marginTop: 11 }}>
        {items.map((c, i) => (
          <div key={i} style={i === cur ? undefined : { display: "none" }} data-mine-slip={periods[i] ?? ""} data-mine-slip-on={i === cur ? "1" : "0"}>{c}</div>
        ))}
      </div>
    </>
  );
}
