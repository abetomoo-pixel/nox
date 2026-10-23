"use client";

// ★便 SH-UI-c C-2（2026-10-22）: 勤怠表（②）の 1 行＝店長側（attendance-board・修正者あり）と /mine（本人・修正者なし・金額なし）で同じ部品。
// ★便 SH-UI-c2 C2-1〜C2-4（2026-10-23）: 日付の遷移（→今日タブ）を撤去＝日付を押すとその行が編集で開く（onEdit・店長側だけ）。
//   日別の算定給与の列（時給分｜バック（内訳はホバー／折りたたみ）｜罰金・減額｜日計）＝r.pay（kintai-sheet が付ける・/mine も同じ）。
//   取消済み＝「取消済み」の印（薄く）。390px＝日付・出／退・日計の 3 列（.opt は隠す）＋行を押して残りを開く（globals.css .nox-kintai）。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { BASIS_MARK, correctionTextOf, flagsTextOf, hm47Ja, type AttendanceDayRow } from "@/lib/nox/payroll/attendance-sheet";
import { backsDetailTextOf, yenCellOf } from "@/lib/nox/payroll/daily-pay";

export const KINTAI_HEADS = ["日付", "確定シフト", "出", "退", "店の修正", "遅刻・当欠・早退", "実働", "送り", "備考"] as const;
export const KINTAI_PAY_HEADS = ["時給分", "バック", "罰金・減額", "日計"] as const;
/** 390px で隠す列（.opt）＝確定シフト・店の修正・区分・実働・送り・備考と、日計以外の金額列 */
const OPT = new Set([1, 4, 5, 6, 7, 8]);

export function KintaiHead({ withPay = false }: { withPay?: boolean }) {
  return (
    <thead><tr>
      {KINTAI_HEADS.map((h, i) => <th key={h} className={OPT.has(i) ? "opt" : undefined} style={{ ...t.th, textAlign: i === 6 ? "right" : "left" }}>{h}</th>)}
      {withPay && KINTAI_PAY_HEADS.map((h, i) => <th key={h} className={i === 3 ? "pay" : "opt pay"} style={{ ...t.th, textAlign: "right" }} data-kintai-pay-head={h}>{h}</th>)}
    </tr></thead>
  );
}

export default function KintaiRow({ r, withBy, onEdit, withPay = r.pay !== undefined }: { r: AttendanceDayRow; storeId?: string; withBy: boolean; link?: boolean; onEdit?: ((r: AttendanceDayRow) => void) | null; withPay?: boolean }) {
  const [open, setOpen] = useState(false);
  const flags = flagsTextOf(r);
  const hoursTxt = r.hours > 0 ? `${r.hours}h` : "—";
  const day = r.bizDate.slice(5).replace("-", "/");
  const editable = !!onEdit && !r.cancelled;
  const dateCell = editable
    ? <button type="button" className="nox-link num" data-kintai-date={r.bizDate} data-kintai-edit="1" onClick={(e) => { e.stopPropagation(); onEdit!(r); }} title="この日を編集">{day}</button>
    : <span className="num" data-kintai-date={r.bizDate}>{day}</span>;
  const p = r.pay ?? null;
  const dim: React.CSSProperties = r.cancelled ? { opacity: 0.55 } : {};
  return (
    <>
      <tr data-kintai-day={r.bizDate} data-missing-out={r.missingOut ? "1" : undefined} data-cancelled={r.cancelled ? "1" : undefined} style={{ cursor: "pointer", ...dim }} onClick={() => setOpen((v) => !v)}>
        <td style={t.td}>{dateCell}{r.cancelled && <span className="nox-stpill" style={{ marginLeft: 6 }} data-kintai-cancelled="1">取消済み</span>}</td>
        <td className="opt num" style={t.td}>{r.shift ? `${r.shift.start}–${hm47Ja(r.shift.end)}` : "—"}</td>
        <td className="num" style={t.td}>{hm47Ja(r.inHm)}</td>
        <td className="num" style={{ ...t.td, color: r.missingOut ? "var(--bad)" : undefined, fontWeight: r.missingOut ? 700 : undefined }}>{r.missingOut ? "退勤記録なし" : hm47Ja(r.outHm)}</td>
        <td className="opt" style={t.td}>{r.corrections.length > 0 ? (
          <details onClick={(e) => e.stopPropagation()} data-kintai-corr="1"><summary style={{ cursor: "pointer", color: "var(--champ)" }}>修正 {r.corrections.length} 件</summary>
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11.5 }}>{r.corrections.map((c, i) => <li key={i}>{correctionTextOf(c, withBy)}</li>)}</ul>
          </details>) : "—"}</td>
        <td className="opt" style={{ ...t.td, color: r.absent || r.late ? "var(--gold2)" : undefined }}>{flags || "—"}</td>
        <td className="opt num" style={{ ...t.td, textAlign: "right" }}>{hoursTxt}{r.hours > 0 && <span style={{ fontSize: 10.5, color: "var(--sub)", marginLeft: 4 }} data-kintai-basis={r.basis}>{BASIS_MARK[r.basis]}</span>}</td>
        <td className="opt" style={t.td}>{r.okuri.n > 0 ? `${r.okuri.n}${r.okuri.modes.length ? `（${r.okuri.modes.join("・")}）` : ""}` : "—"}</td>
        <td className="opt" style={{ ...t.td, fontSize: 12 }}>{r.note || "—"}</td>
        {withPay && (<>
          <td className="opt pay num" style={{ ...t.td, textAlign: "right" }} data-kintai-wage={p?.wage ?? 0}>{p ? yenCellOf(p.wage) : "—"}</td>
          <td className="opt pay num" style={{ ...t.td, textAlign: "right" }} data-kintai-backs={p?.backs.total ?? 0} title={p ? backsDetailTextOf(p.backs) : undefined}>{p ? yenCellOf(p.backs.total) : "—"}</td>
          <td className="opt pay num" style={{ ...t.td, textAlign: "right", color: p && p.fine > 0 ? "var(--bad)" : undefined }} data-kintai-fine={p?.fine ?? 0} title={p?.fineNotes.join("・") || undefined}>{p ? yenCellOf(p.fine, { neg: true }) : "—"}</td>
          <td className="pay num" style={{ ...t.td, textAlign: "right", fontWeight: 700 }} data-kintai-total={p?.total ?? 0}>{p ? yenCellOf(p.total) : "—"}</td>
        </>)}
      </tr>
      {open && (
        <tr className="nox-kintai-more" data-kintai-more={r.bizDate}><td colSpan={9 + (withPay ? 4 : 0)} style={{ ...t.td, fontSize: 12, color: "var(--sub)" }}>
          確定シフト {r.shift ? `${r.shift.start}–${hm47Ja(r.shift.end)}` : "—"}／実働 {hoursTxt}{r.hours > 0 ? `（${BASIS_MARK[r.basis]}）` : ""}／{flags || "遅刻・当欠・早退なし"}／送り {r.okuri.n > 0 ? `${r.okuri.n}（${r.okuri.modes.join("・")}）` : "なし"}／{r.corrections.length > 0 ? r.corrections.map((c) => correctionTextOf(c, withBy)).join(" / ") : "店の修正なし"}{r.note ? `／${r.note}` : ""}
          {withPay && p && <><br />時給分 {yenCellOf(p.wage)}{p.hourly ? `（¥${p.hourly.toLocaleString("en-US")}/h × ${p.hours}h）` : ""}／バック {yenCellOf(p.backs.total)}{p.backs.total !== 0 ? `（${backsDetailTextOf(p.backs)}）` : ""}／罰金・減額 {yenCellOf(p.fine, { neg: true })}{p.fineNotes.length ? `（${p.fineNotes.join("・")}）` : ""}／日計 {yenCellOf(p.total)}</>}
        </td></tr>
      )}
    </>
  );
}
