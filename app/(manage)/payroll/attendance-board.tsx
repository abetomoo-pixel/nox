"use client";

// ★便 SH-UI-c C-2（2026-10-22）: 給与 →「勤怠」タブ（店長・オーナー）。
//   ①合計表＝人ごとに 出勤日数・実働 h・遅刻／当欠／早退・送り（数字は /api/attendance/sheet＝給与と同じ計算の値）。行を押すと②。
//   ②1 人 1 か月の表＝日付｜確定シフト｜実打刻 出／退（翌表記）｜店の修正（折りたたみ）｜遅刻／当欠／早退｜実働｜送り｜備考。
//   ⑤CSV（UTF-8 BOM・②の列・client で生成）・印刷用（A4 横・1 人 1 枚・店名と期間と出力日時）。
// ★便 SH-UI-c2 C2-1〜C2-7（2026-10-23）:
//   C2-1 日付の遷移（→今日タブ）を撤去＝日付を押すとその行が編集で開く。シフトへの導線は表の右上「この月のシフトを開く」1 本だけ。
//   C2-2 行の編集・追加・取消（店長・オーナー・未確定の月のみ＝確定済みは読取専用で「確定済み」の印）＝components/nox/kintai-edit（既存 RPC の組み合わせ）。
//   C2-3 日別の算定給与の列（時給分｜バック｜罰金・減額｜日計）＋表の下「月のまとめ」（月で決まる支給／控除／差引）＝Σ日計＋月のまとめ＝給与画面の差引支給額（同じ関数）。
//   C2-4 390px＝②は日付・出／退・日計の 3 列＋行を開いて残り・編集は全幅のシート（Modal）。
//   C2-6 合計表に 時給分｜バック｜罰金・減額｜現時点の差引支給（給与画面の同じ人と同じ値）・合計行・390px は キャスト｜日数｜現時点の差引の 3 列＋行を開いて残り。
//   C2-7 1,024px 未満＝②は画面下のシートで開く（CSV／印刷用はシートの上端）。1,024px 以上は従来どおり下に表。
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import BottomSheet, { useNarrow } from "@/components/ui/bottom-sheet";
import { attendanceCsvFileNameOf, attendanceCsvOf, BASIS_MARK, rowEditableOf, type AttendanceDayRow } from "@/lib/nox/payroll/attendance-sheet";
import { payTotalsNoteOf, sumCastPayTotalsOf, yenCellOf } from "@/lib/nox/payroll/daily-pay";
import type { KintaiCast, KintaiSheet } from "@/lib/nox/payroll/kintai-sheet";
import KintaiRow, { KintaiHead } from "@/components/nox/kintai-row";
import KintaiEdit from "@/components/nox/kintai-edit";
import { shiftMonthHrefOf } from "@/lib/nox/payroll/view";
import { monthLastDayOf } from "@/lib/nox/month"; // ★便 M-10: この月のシフトを開く＝公開済みなら確定シフト・無ければ ③配置（同月）
import { createClient } from "@/lib/supabase/client";

type Sheet = KintaiSheet;
type CastSheet = KintaiCast;

const ymNow = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const periodShift = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const jstNow = () => new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

// ②の表に出す行＝未来日を除き、打刻・確定シフト・当欠・店の修正・送り・日別の金額のどれかがある日（CSV も同じ行＝行数が表と同じ）
export const visibleRowsOf = (c: Pick<CastSheet, "rows">): AttendanceDayRow[] => c.rows.filter((r) => !r.future && (r.inHm || r.shift || r.absent || r.corrections.length > 0 || r.okuri.n > 0 || (r.pay && r.pay.total !== 0)));

export default function AttendanceBoard({ stores, initialStoreId, initialPeriod, initialCastId }: { stores: { id: string; name: string }[]; initialStoreId?: string | null; initialPeriod?: string | null; initialCastId?: string | null }) {
  const router = useRouter();
  const narrow = useNarrow(1024);
  const [storeId, setStoreId] = useState(initialStoreId ?? stores[0]?.id ?? "");
  const [period, setPeriod] = useState(initialPeriod ?? ymNow());
  const [castId, setCastId] = useState<string | null>(initialCastId ?? null);
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ mode: "edit"; row: AttendanceDayRow } | { mode: "add" } | null>(null);
  const [openCast, setOpenCast] = useState<string | null>(null); // ★C2-6 ⑤: 390px の合計表＝行を開いて残り
  // ★便 M-10: 表示中の月に公開済み（published）の期間があるか（RLS＝店スコープ）
  const [publishedMonth, setPublishedMonth] = useState(false);
  useEffect(() => { void (async () => {
    if (!storeId || !period) return;
    const from = `${period}-01`, to = monthLastDayOf(period); // ★x13h(1-2): 末日は lib/nox/month
    const { data } = await createClient().from("shift_periods").select("id").eq("store_id", storeId).eq("status", "published").lte("start_date", to).gte("end_date", from).limit(1);
    setPublishedMonth((data ?? []).length > 0);
  })(); }, [storeId, period]);

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
  const finalized = sheet?.finalized ?? false;
  const canEdit = !finalized; // 店長・オーナー（このタブに入れる役割）・確定済みの月は不可

  function downloadCsv(c: CastSheet) {
    const rows = visibleRowsOf(c);
    const csv = attendanceCsvOf({ storeName, period, castName: c.castName, exportedAt: jstNow() }, rows, { withPay: !!c.pay });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = attendanceCsvFileNameOf(storeName, period, c.castName); a.click(); URL.revokeObjectURL(a.href);
    setMsg(`${c.castName} の勤怠 CSV（${rows.length} 行）を出力しました`);
  }

  const total = useMemo(() => {
    const cs = sheet?.casts ?? [];
    return { days: cs.reduce((a, c) => a + (c.payroll?.days ?? c.summary.days), 0), hours: Math.round(cs.reduce((a, c) => a + (c.payroll?.hours ?? c.summary.hours), 0) * 10) / 10, lateN: cs.reduce((a, c) => a + (c.payroll?.lateN ?? c.summary.lateN), 0), absentN: cs.reduce((a, c) => a + (c.payroll?.absentN ?? c.summary.absentN), 0), earlyN: cs.reduce((a, c) => a + c.summary.earlyN, 0), okuriN: cs.reduce((a, c) => a + c.summary.okuriN, 0), missingOutN: cs.reduce((a, c) => a + (c.payroll?.missingOutN ?? c.summary.missingOutN), 0), pay: sumCastPayTotalsOf(cs.map((c) => c.pay?.totals)) };
  }, [sheet]);
  const payNote = sheet ? payTotalsNoteOf(finalized, sheet.todayBiz) : "";

  const onSaved = async (m: string) => { setEdit(null); setMsg(m); await load(); };

  // ── ②1 人 1 か月の表（下に描く／狭い幅はシートの中身） ──
  const detailActions = sel && (
    <>
      <Link href={shiftMonthHrefOf(period, publishedMonth)} style={{ ...t.btnGhost, ...t.btnSm, order: -1, textDecoration: "none", display: "inline-flex", alignItems: "center" }} data-kintai-shift-link={publishedMonth ? "fixed" : "make"}>この月のシフトを開く</Link>{/* ★便 M-10: 確定シフト（公開前は ③配置）の同月・ボタン風で左端 */}
      <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-kintai-csv="1" onClick={() => downloadCsv(sel)}>CSV</button>
      <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-kintai-print="1" onClick={() => window.print()}>印刷用</button>
      {canEdit && <button type="button" style={{ ...t.btnGold, ...t.btnSm }} data-kintai-add="1" onClick={() => setEdit({ mode: "add" })}>＋ 日を追加</button>}
    </>
  );
  const detailTable = sel && (
    <>
      <div className="nox-kintai-scroll" data-kintai-scroll="1" style={{ overflowX: "auto", maxWidth: "100%" }}>{/* ★便 M-2: 390px＝表だけ横スクロール（日付・出勤列が左にはみ出さない） */}
      <table className="nox-table nox-kintai-table" style={{ width: "100%" }}>
        <KintaiHead withPay={!!sel.pay} />
        <tbody>
          {visibleRowsOf(sel).map((r) => (
            <KintaiRow key={r.bizDate} r={r} castId={sel.castId} withBy withPay={!!sel.pay} onEdit={canEdit && rowEditableOf(r, finalized) ? (row) => setEdit({ mode: "edit", row }) : null} />
          ))}
        </tbody>
        {sel.pay && (
          <tfoot data-kintai-month="1">
            <tr><td colSpan={9} style={{ ...t.td, fontWeight: 800 }}>日計の合計</td><td className="opt pay" colSpan={3} style={t.td} /><td className="pay num" style={{ ...t.td, textAlign: "right", fontWeight: 800 }} data-kintai-sum-daily={sel.pay.month.sumDaily}>{yenCellOf(sel.pay.month.sumDaily)}</td></tr>
            {sel.pay.month.rows.map((m) => (
              <tr key={m.key} data-kintai-month-row={m.key}><td colSpan={9} style={{ ...t.td, color: m.key === "net" ? undefined : "var(--sub)", fontWeight: m.key === "net" ? 800 : 500 }}>{m.key === "net" ? m.label : `月のまとめ：${m.label}`}</td><td className="opt pay" colSpan={3} style={t.td} /><td className="pay num" style={{ ...t.td, textAlign: "right", fontWeight: m.key === "net" ? 800 : 500 }} data-kintai-month-amount={m.amount}>{m.key === "deductions" ? yenCellOf(m.amount, { neg: m.amount > 0 }) : yenCellOf(m.amount)}</td></tr>
            ))}
          </tfoot>
        )}
      </table>
      </div>
      {sel.pay && <p style={{ ...t.sub, margin: "6px 0 0" }} data-kintai-identity={sel.pay.month.identityOk ? "ok" : "ng"}>日計＝時給分（その日の時給×実働）＋バック−罰金・減額。月でしか決まらない項目（スライド・源泉・固定控除・前借り・送り・売上バック・手当）は「月のまとめ」に。Σ日計＋月のまとめ＝給与画面の差引支給額{sel.pay.frozen ? "（確定時の凍結値）" : "（現時点）"}。</p>}
      {!sel.pay && <p style={{ ...t.sub, margin: "6px 0 0" }}>この月の給与の計算対象ではありません（プラン未設定か稼働なし）＝日別の金額は出ません。</p>}
    </>
  );
  const detailTitle = sel && <>{sel.castName} の勤怠（{storeName}・{period.replace("-", "/")}）{finalized && <span className="nox-stpill" style={{ marginLeft: 6 }} data-kintai-finalized="1">確定済み</span>}</>;

  return (
    <div className="nox-kintai" data-kintai="1" data-kintai-finalized-month={finalized ? "1" : "0"}>
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>{/* ★C-2 ⑤: 印刷用は A4 横（このタブだけ） */}
      <div className="nox-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCastId(null); }} style={{ ...t.input, width: "auto" }} aria-label="店舗">{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <span className="nox-seg" style={{ display: "inline-flex" }}>
          <button type="button" onClick={() => setPeriod(periodShift(period, -1))} aria-label="前の月">‹</button>
          <button type="button" className="on num" style={{ minWidth: 92 }}>{period.replace("-", "/")}</button>
          <button type="button" onClick={() => setPeriod(periodShift(period, 1))} aria-label="次の月">›</button>
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="人で絞る" aria-label="人で絞る" style={{ ...t.input, width: 140 }} />
        {sel && !narrow && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setCastId(null)}>← 全員の合計表</button>}
        {sheet && <span style={{ fontSize: 11.5, color: "var(--sub)", marginLeft: "auto" }}>計算基準 {BASIS_MARK[sheet.basis]}・営業日の今日 {sheet.todayBiz}{finalized ? "・この月は確定済み（読取専用）" : ""}</span>}
      </div>
      {err && <div className="nox-noprint" style={{ marginBottom: 8 }}><Message kind="error">{err}</Message></div>}
      {msg && <div className="nox-noprint" style={{ marginBottom: 8 }}><Message kind="success">{msg}</Message></div>}
      {busy && !sheet && <p style={{ fontSize: 12.5, color: "var(--sub)" }}>読み込み中…</p>}

      {sheet && (!sel || narrow) && (
        <section className="nox-cardtop" style={t.card} data-kintai-summary="1">
          <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>勤怠の合計（{storeName}・{period.replace("-", "/")}）{finalized && <span className="nox-stpill" style={{ marginLeft: 6 }}>確定済み</span>}</h3>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 8px" }}>出勤日数・実働 h・遅刻／当欠・金額は給与画面と同じ数字（同じ計算）。行を押すと 1 人 1 か月の表。差引支給は{payNote}。</p>
          <div style={{ overflowX: "auto" }}>
            <table className="nox-table nox-kintai-sum" style={{ width: "100%" }}>
              <thead><tr><th style={t.th}>キャスト</th><th style={{ ...t.th, textAlign: "right" }}>出勤日数</th><th className="opt" style={{ ...t.th, textAlign: "right" }}>実働 h</th><th className="opt" style={{ ...t.th, textAlign: "right" }}>遅刻</th><th className="opt" style={{ ...t.th, textAlign: "right" }}>当欠</th><th className="opt" style={{ ...t.th, textAlign: "right" }}>早退</th><th className="opt" style={{ ...t.th, textAlign: "right" }}>送り</th><th className="opt" style={{ ...t.th, textAlign: "right" }}>退勤記録なし</th>
                <th className="opt" style={{ ...t.th, textAlign: "right" }} data-kintai-sum-head="wage">時給分</th><th className="opt" style={{ ...t.th, textAlign: "right" }} data-kintai-sum-head="backs">バック</th><th className="opt" style={{ ...t.th, textAlign: "right" }} data-kintai-sum-head="fine">罰金・減額</th><th style={{ ...t.th, textAlign: "right" }} data-kintai-sum-head="net">{finalized ? "差引支給（確定）" : "現時点の差引支給"}</th></tr></thead>
              <tbody>
                {casts.map((c) => (
                  <Fragment key={c.castId}>
                    <tr data-kintai-row={c.castId} style={{ cursor: "pointer" }} onClick={() => setCastId(c.castId)}>
                      <td style={t.td}><button type="button" className="nox-link" data-kintai-open={c.castId}>{c.castName}</button>{c.payroll?.taxMode && <span className="nox-stpill" style={{ marginLeft: 6 }}>{c.payroll.taxMode}</span>}
                        <button type="button" className="nox-kintai-sum-more nox-link" style={{ marginLeft: 6, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setOpenCast((v) => (v === c.castId ? null : c.castId)); }} aria-label="残りの項目を開く" data-kintai-sum-toggle={c.castId}>{openCast === c.castId ? "▾" : "▸"}</button></td>
                      <td className="num" style={{ ...t.td, textAlign: "right" }}>{c.payroll?.days ?? c.summary.days}日</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }} data-kintai-hours={c.payroll?.hours ?? c.summary.hours}>{c.payroll?.hours ?? c.summary.hours}h</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }}>{c.payroll?.lateN ?? c.summary.lateN}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }}>{c.payroll?.absentN ?? c.summary.absentN}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }}>{c.summary.earlyN}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }}>{c.summary.okuriN}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right", color: (c.payroll?.missingOutN ?? c.summary.missingOutN) > 0 ? "var(--bad)" : undefined }}>{c.payroll?.missingOutN ?? c.summary.missingOutN}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }} data-kintai-sum-wage={c.pay?.totals.wage ?? ""}>{c.pay ? yenCellOf(c.pay.totals.wage) : "—"}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right" }} data-kintai-sum-backs={c.pay?.totals.backs ?? ""}>{c.pay ? yenCellOf(c.pay.totals.backs) : "—"}</td>
                      <td className="opt num" style={{ ...t.td, textAlign: "right", color: c.pay && c.pay.totals.fine > 0 ? "var(--bad)" : undefined }} data-kintai-sum-fine={c.pay?.totals.fine ?? ""}>{c.pay ? yenCellOf(c.pay.totals.fine, { neg: true }) : "—"}</td>
                      <td className="num" style={{ ...t.td, textAlign: "right", fontWeight: 700 }} data-kintai-sum-net={c.pay?.net ?? ""}>{c.pay ? yenCellOf(c.pay.net) : "—"}</td>
                    </tr>
                    {openCast === c.castId && (
                      <tr className="nox-kintai-sum-detail" data-kintai-sum-more={c.castId}><td colSpan={12} style={{ ...t.td, fontSize: 12, color: "var(--sub)" }}>
                        実働 {c.payroll?.hours ?? c.summary.hours}h／遅刻 {c.payroll?.lateN ?? c.summary.lateN}・当欠 {c.payroll?.absentN ?? c.summary.absentN}・早退 {c.summary.earlyN}／送り {c.summary.okuriN}／退勤記録なし {c.payroll?.missingOutN ?? c.summary.missingOutN}
                        {c.pay && <>／時給分 {yenCellOf(c.pay.totals.wage)}・バック {yenCellOf(c.pay.totals.backs)}・罰金・減額 {yenCellOf(c.pay.totals.fine, { neg: true })}</>}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {casts.length === 0 && <tr><td colSpan={12} style={{ ...t.td, color: "var(--sub)" }}>該当するキャストがいません</td></tr>}
              </tbody>
              <tfoot><tr data-kintai-sum-total="1"><td style={{ ...t.td, fontWeight: 800 }}>合計</td><td className="num" style={{ ...t.td, textAlign: "right" }}>{total.days}日</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{total.hours}h</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{total.lateN}</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{total.absentN}</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{total.earlyN}</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{total.okuriN}</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{total.missingOutN}</td>
                <td className="opt num" style={{ ...t.td, textAlign: "right" }}>{yenCellOf(total.pay.wage)}</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{yenCellOf(total.pay.backs)}</td><td className="opt num" style={{ ...t.td, textAlign: "right" }}>{yenCellOf(total.pay.fine, { neg: true })}</td><td className="num" style={{ ...t.td, textAlign: "right", fontWeight: 800 }} data-kintai-sum-net-total={total.pay.net}>{yenCellOf(total.pay.net)}</td></tr></tfoot>
            </table>
          </div>
          <p className="nox-noprint" style={{ ...t.sub, marginTop: 8 }}>CSV と印刷用は 1 人の表を開いてから。差引支給＝給与画面の一覧の差引支給額と同じ関数・同じ値（{payNote}）。</p>
        </section>
      )}

      {sheet && sel && !narrow && (
        <div className="nox-printpage">
          <section className="nox-cardtop nox-print" style={t.card} data-kintai-detail={sel.castId}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <h3 style={{ ...t.cardTitle, margin: 0 }}>{detailTitle}</h3>
              <span className="num" style={{ fontSize: 12.5, color: "var(--sub)" }} data-kintai-sel-total="1">出勤 {sel.payroll?.days ?? sel.summary.days} 日・実働 {sel.payroll?.hours ?? sel.summary.hours}h・遅刻 {sel.payroll?.lateN ?? sel.summary.lateN}・当欠 {sel.payroll?.absentN ?? sel.summary.absentN}・早退 {sel.summary.earlyN}{sel.pay ? `・差引 ${yenCellOf(sel.pay.net)}` : ""}</span>
              <span className="nox-print-only" style={{ fontSize: 11, color: "var(--sub)" }}>出力 {jstNow()}</span>
              <span className="nox-noprint" style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{detailActions}</span>
            </div>
            {detailTable}
          </section>
        </div>
      )}
      {sheet && sel && narrow && (
        <BottomSheet onClose={() => setCastId(null)} title={detailTitle} actions={detailActions} testId="kintai">
          <div className="nox-printpage"><section className="nox-print" data-kintai-detail={sel.castId}>
            <p className="num" style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }} data-kintai-sel-total="1">出勤 {sel.payroll?.days ?? sel.summary.days} 日・実働 {sel.payroll?.hours ?? sel.summary.hours}h・遅刻 {sel.payroll?.lateN ?? sel.summary.lateN}・当欠 {sel.payroll?.absentN ?? sel.summary.absentN}{sel.pay ? `・差引 ${yenCellOf(sel.pay.net)}` : ""}</p>
            {detailTable}
          </section></div>
        </BottomSheet>
      )}
      {edit && sel && sheet && (
        <KintaiEdit storeId={storeId} castId={sel.castId} castName={sel.castName} row={edit.mode === "edit" ? edit.row : null}
          periodStart={sheet.periodStart} periodEnd={sheet.periodEnd} todayBiz={sheet.todayBiz} existingDates={visibleRowsOf(sel).map((r) => r.bizDate)}
          onClose={() => setEdit(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
