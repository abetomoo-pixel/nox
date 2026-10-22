"use client";

// ★便 SH-UI-c C-2（2026-10-22）: 給与 →「勤怠」タブ（店長・オーナー）。
//   ①合計表＝人ごとに 出勤日数・実働 h・遅刻／当欠／早退・送り（数字は /api/attendance/sheet＝給与と同じ計算の値）。行を押すと②。
//   ②1 人 1 か月の表＝日付｜確定シフト｜実打刻 出／退（翌表記）｜店の修正（折りたたみ＝修正者・時刻・元の値）｜遅刻／当欠／早退（連絡あり HH:MM）｜実働 h＋基準の印｜送り（方式）｜備考。
//     未退勤＝「退勤記録なし」を赤（給与の不整合と同じ件数）。日付を押すと今日タブのその日（過去日は読取専用）。
//   ⑤CSV（UTF-8 BOM・②の列・client で生成）・印刷用（A4 横・1 人 1 枚・店名と期間と出力日時）。
//   ⑥390px＝②は日付・出／退・実働の 3 列＋行を開いて残り（globals.css .nox-kintai）。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { attendanceCsvFileNameOf, attendanceCsvOf, BASIS_MARK, type AttendanceDayRow, type AttendanceSummary } from "@/lib/nox/payroll/attendance-sheet";
import KintaiRow, { KintaiHead } from "@/components/nox/kintai-row";

type CastSheet = { castId: string; castName: string; active: boolean; payroll: { hours: number; days: number; lateN: number; absentN: number; missingOutN: number; taxMode: string } | null; summary: AttendanceSummary; rows: AttendanceDayRow[] };
type Sheet = { period: string; storeId: string; storeName: string; basis: "punch" | "shift"; todayBiz: string; casts: CastSheet[] };

const ymNow = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const periodShift = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const jstNow = () => new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

export default function AttendanceBoard({ stores, initialStoreId, initialPeriod, initialCastId }: { stores: { id: string; name: string }[]; initialStoreId?: string | null; initialPeriod?: string | null; initialCastId?: string | null }) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(initialStoreId ?? stores[0]?.id ?? "");
  const [period, setPeriod] = useState(initialPeriod ?? ymNow());
  const [castId, setCastId] = useState<string | null>(initialCastId ?? null);
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId || !period) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/attendance/sheet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId, period }) });
    const j = (await res.json().catch(() => ({}))) as Sheet & { error?: string };
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? `読み込めませんでした（${res.status}）`); setSheet(null); return; }
    setSheet(j);
  }, [storeId, period]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { // URL に store／period／cast を写す（給与の右パネル・時間セルからの導線＝?tab=attendance&store&period&cast）
    const u = new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""); u.set("tab", "attendance"); u.set("store", storeId); u.set("period", period); if (castId) u.set("cast", castId); else u.delete("cast");
    router.replace(`/payroll?${u.toString()}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, period, castId]);

  const casts = useMemo(() => (sheet?.casts ?? []).filter((c) => q.trim() === "" || c.castName.includes(q.trim())), [sheet, q]);
  const sel = sheet?.casts.find((c) => c.castId === castId) ?? null;
  const storeName = stores.find((s) => s.id === storeId)?.name ?? sheet?.storeName ?? "";

  function downloadCsv(c: CastSheet) {
    const csv = attendanceCsvOf({ storeName, period, castName: c.castName, exportedAt: jstNow() }, c.rows.filter((r) => !r.future));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = attendanceCsvFileNameOf(storeName, period, c.castName); a.click(); URL.revokeObjectURL(a.href);
    setMsg(`${c.castName} の勤怠 CSV（${c.rows.filter((r) => !r.future).length} 行）を出力しました`);
  }

  const total = useMemo(() => {
    const cs = sheet?.casts ?? [];
    return { days: cs.reduce((a, c) => a + (c.payroll?.days ?? c.summary.days), 0), hours: Math.round(cs.reduce((a, c) => a + (c.payroll?.hours ?? c.summary.hours), 0) * 10) / 10, lateN: cs.reduce((a, c) => a + (c.payroll?.lateN ?? c.summary.lateN), 0), absentN: cs.reduce((a, c) => a + (c.payroll?.absentN ?? c.summary.absentN), 0), earlyN: cs.reduce((a, c) => a + c.summary.earlyN, 0), okuriN: cs.reduce((a, c) => a + c.summary.okuriN, 0) };
  }, [sheet]);

  return (
    <div className="nox-kintai" data-kintai="1">
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>{/* ★C-2 ⑤: 印刷用は A4 横（このタブだけ） */}
      <div className="nox-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCastId(null); }} style={{ ...t.input, width: "auto" }} aria-label="店舗">{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <span className="nox-seg" style={{ display: "inline-flex" }}>
          <button type="button" onClick={() => setPeriod(periodShift(period, -1))} aria-label="前の月">‹</button>
          <button type="button" className="on num" style={{ minWidth: 92 }}>{period.replace("-", "/")}</button>
          <button type="button" onClick={() => setPeriod(periodShift(period, 1))} aria-label="次の月">›</button>
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="人で絞る" aria-label="人で絞る" style={{ ...t.input, width: 140 }} />
        {sel && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setCastId(null)}>← 全員の合計表</button>}
        {sheet && <span style={{ fontSize: 11.5, color: "var(--sub)", marginLeft: "auto" }}>計算基準 {BASIS_MARK[sheet.basis]}・営業日の今日 {sheet.todayBiz}</span>}
      </div>
      {err && <div className="nox-noprint" style={{ marginBottom: 8 }}><Message kind="error">{err}</Message></div>}
      {msg && <div className="nox-noprint" style={{ marginBottom: 8 }}><Message kind="success">{msg}</Message></div>}
      {busy && !sheet && <p style={{ fontSize: 12.5, color: "var(--sub)" }}>読み込み中…</p>}

      {sheet && !sel && (
        <section className="nox-cardtop" style={t.card} data-kintai-summary="1">
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>勤怠の合計（{storeName}・{period.replace("-", "/")}）</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 8px" }}>出勤日数・実働 h・遅刻／当欠は給与画面と同じ数字（同じ計算）。行を押すと 1 人 1 か月の表。</p>
          <div style={{ overflowX: "auto" }}>
            <table className="nox-table" style={{ width: "100%" }}>
              <thead><tr><th style={t.th}>キャスト</th><th style={{ ...t.th, textAlign: "right" }}>出勤日数</th><th style={{ ...t.th, textAlign: "right" }}>実働 h</th><th style={{ ...t.th, textAlign: "right" }}>遅刻</th><th style={{ ...t.th, textAlign: "right" }}>当欠</th><th style={{ ...t.th, textAlign: "right" }}>早退</th><th style={{ ...t.th, textAlign: "right" }}>送り</th><th style={{ ...t.th, textAlign: "right" }}>退勤記録なし</th></tr></thead>
              <tbody>
                {casts.map((c) => (
                  <tr key={c.castId} data-kintai-row={c.castId} style={{ cursor: "pointer" }} onClick={() => setCastId(c.castId)}>
                    <td style={t.td}><button type="button" className="nox-link" data-kintai-open={c.castId}>{c.castName}</button>{c.payroll?.taxMode && <span className="nox-stpill" style={{ marginLeft: 6 }}>{c.payroll.taxMode}</span>}</td>
                    <td className="num" style={{ ...t.td, textAlign: "right" }}>{c.payroll?.days ?? c.summary.days}日</td>
                    <td className="num" style={{ ...t.td, textAlign: "right" }} data-kintai-hours={c.payroll?.hours ?? c.summary.hours}>{c.payroll?.hours ?? c.summary.hours}h</td>
                    <td className="num" style={{ ...t.td, textAlign: "right" }}>{c.payroll?.lateN ?? c.summary.lateN}</td>
                    <td className="num" style={{ ...t.td, textAlign: "right" }}>{c.payroll?.absentN ?? c.summary.absentN}</td>
                    <td className="num" style={{ ...t.td, textAlign: "right" }}>{c.summary.earlyN}</td>
                    <td className="num" style={{ ...t.td, textAlign: "right" }}>{c.summary.okuriN}</td>
                    <td className="num" style={{ ...t.td, textAlign: "right", color: (c.payroll?.missingOutN ?? c.summary.missingOutN) > 0 ? "var(--bad)" : undefined }}>{c.payroll?.missingOutN ?? c.summary.missingOutN}</td>
                  </tr>
                ))}
                {casts.length === 0 && <tr><td colSpan={8} style={{ ...t.td, color: "var(--sub)" }}>該当するキャストがいません</td></tr>}
              </tbody>
              <tfoot><tr><td style={{ ...t.td, fontWeight: 800 }}>合計</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.days}日</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.hours}h</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.lateN}</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.absentN}</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.earlyN}</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.okuriN}</td><td style={t.td} /></tr></tfoot>
            </table>
          </div>
        </section>
      )}

      {sheet && sel && (
        <div className="nox-printpage">
          <section className="nox-cardtop nox-print" style={t.card} data-kintai-detail={sel.castId}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <h3 style={{ ...t.cardTitle, margin: 0 }}>{sel.castName} の勤怠（{storeName}・{period.replace("-", "/")}）</h3>
              <span className="num" style={{ fontSize: 12.5, color: "var(--sub)" }} data-kintai-sel-total="1">出勤 {sel.payroll?.days ?? sel.summary.days} 日・実働 {sel.payroll?.hours ?? sel.summary.hours}h・遅刻 {sel.payroll?.lateN ?? sel.summary.lateN}・当欠 {sel.payroll?.absentN ?? sel.summary.absentN}・早退 {sel.summary.earlyN}・送り {sel.summary.okuriN}</span>
              <span className="nox-print-only" style={{ fontSize: 11, color: "var(--sub)" }}>出力 {jstNow()}</span>
              <span className="nox-noprint" style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-kintai-csv="1" onClick={() => downloadCsv(sel)}>CSV</button>
                <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-kintai-print="1" onClick={() => window.print()}>印刷用</button>
              </span>
            </div>
            <table className="nox-table nox-kintai-table" style={{ width: "100%" }}>
              <KintaiHead />
              <tbody>
                {sel.rows.filter((r) => !r.future && (r.inHm || r.shift || r.absent || r.corrections.length > 0 || r.okuri.n > 0)).map((r) => (
                  <KintaiRow key={r.bizDate} r={r} storeId={storeId} withBy />
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {sheet && !sel && stores.length > 0 && <p className="nox-noprint" style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 8 }}>CSV と印刷用は 1 人の表を開いてから。</p>}
    </div>
  );
}
