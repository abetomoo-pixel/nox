"use client";

// ★便 SH-UI-c C-2（2026-10-22）: 勤怠表（②）の 1 行＝店長側（attendance-board・修正者あり・日付は今日タブのその日へ）と /mine（本人・修正者なし・金額なし）で同じ部品。
//   390px＝日付・出／退・実働の 3 列（.opt は隠す）＋行を押して残りを開く（globals.css .nox-kintai）。未退勤＝「退勤記録なし」を赤。
import { useState } from "react";
import Link from "next/link";
import * as t from "@/lib/nox/ui/theme";
import { BASIS_MARK, correctionTextOf, flagsTextOf, hm47Ja, type AttendanceDayRow } from "@/lib/nox/payroll/attendance-sheet";

export const KINTAI_HEADS = ["日付", "確定シフト", "出", "退", "店の修正", "遅刻・当欠・早退", "実働", "送り", "備考"] as const;
export function KintaiHead() {
  return (
    <thead><tr>
      {KINTAI_HEADS.map((h, i) => <th key={h} className={[1, 4, 5, 7, 8].includes(i) ? "opt" : undefined} style={{ ...t.th, textAlign: i === 6 ? "right" : "left" }}>{h}</th>)}
    </tr></thead>
  );
}

export default function KintaiRow({ r, storeId, withBy, link = true }: { r: AttendanceDayRow; storeId?: string; withBy: boolean; link?: boolean }) {
  const [open, setOpen] = useState(false);
  const flags = flagsTextOf(r);
  const hoursTxt = r.hours > 0 ? `${r.hours}h` : "—";
  const day = r.bizDate.slice(5).replace("-", "/");
  const dateCell = link && storeId ? <Link href={`/shift?store=${storeId}&date=${r.bizDate}`} className="nox-link num" data-kintai-date={r.bizDate} onClick={(e) => e.stopPropagation()}>{day}</Link> : <span className="num">{day}</span>;
  return (
    <>
      <tr data-kintai-day={r.bizDate} data-missing-out={r.missingOut ? "1" : undefined} style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <td style={t.td}>{dateCell}</td>
        <td className="opt num" style={t.td}>{r.shift ? `${r.shift.start}–${hm47Ja(r.shift.end)}` : "—"}</td>
        <td className="num" style={t.td}>{hm47Ja(r.inHm)}</td>
        <td className="num" style={{ ...t.td, color: r.missingOut ? "var(--bad)" : undefined, fontWeight: r.missingOut ? 700 : undefined }}>{r.missingOut ? "退勤記録なし" : hm47Ja(r.outHm)}</td>
        <td className="opt" style={t.td}>{r.corrections.length > 0 ? (
          <details onClick={(e) => e.stopPropagation()} data-kintai-corr="1"><summary style={{ cursor: "pointer", color: "var(--champ)" }}>修正 {r.corrections.length} 件</summary>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11.5 }}>{r.corrections.map((c, i) => <li key={i}>{correctionTextOf(c, withBy)}</li>)}</ul>
          </details>) : "—"}</td>
        <td className="opt" style={{ ...t.td, color: r.absent || r.late ? "var(--gold2)" : undefined }}>{flags || "—"}</td>
        <td className="num" style={{ ...t.td, textAlign: "right" }}>{hoursTxt}{r.hours > 0 && <span style={{ fontSize: 10.5, color: "var(--sub)", marginLeft: 4 }} data-kintai-basis={r.basis}>{BASIS_MARK[r.basis]}</span>}</td>
        <td className="opt" style={t.td}>{r.okuri.n > 0 ? `${r.okuri.n}${r.okuri.modes.length ? `（${r.okuri.modes.join("・")}）` : ""}` : "—"}</td>
        <td className="opt" style={{ ...t.td, fontSize: 12 }}>{r.note || "—"}</td>
      </tr>
      {open && (
        <tr className="nox-kintai-more" data-kintai-more={r.bizDate}><td colSpan={9} style={{ ...t.td, fontSize: 12, color: "var(--sub)" }}>
          確定シフト {r.shift ? `${r.shift.start}–${hm47Ja(r.shift.end)}` : "—"}／{flags || "遅刻・当欠・早退なし"}／送り {r.okuri.n > 0 ? `${r.okuri.n}（${r.okuri.modes.join("・")}）` : "なし"}／{r.corrections.length > 0 ? r.corrections.map((c) => correctionTextOf(c, withBy)).join(" / ") : "店の修正なし"}{r.note ? `／${r.note}` : ""}
        </td></tr>
      )}
    </>
  );
}
