"use client";

// ★便 SH-UI-c2 C2-2（2026-10-23）: 勤怠表（1 人 1 か月）の行の編集・追加・取消（店長・オーナー・未確定の月だけ）。DB 変更 0＝既存 RPC の組み合わせ。
//   ①編集＝出／退の時刻（翌表記のまま入力）→ punch_correction_request（owner／manager は申請＝確定・理由必須・audit・修正者と元の値は「店の修正」列に残る）
//     区分（出勤／遅刻／当欠／休み／同伴）→ attendance_set（既存の区分 RPC・備考は reason）。早退は退の時刻から判定（区分ではない）。
//   ②追加＝「＋ 日を追加」で日付を選び、確定シフトが無い日は shift_set（当日追加配置と同じ RPC・status confirmed＝飛び入り出勤）でシフトを足してから出／退を入れる。
//     確定シフトがあり打刻が無い日（退勤記録なし）は同じ編集で埋める。
//   ③取消＝理由必須。打刻は削除（punch_correction_request の p_after_at null）・シフトは shift_remove・区分は休み（理由に「取消: …」）＝行は「取消済み」で残る（器 cancelled_at は無い＝0175 行き）。
//   編集後は呼び出し側が再読込＝合計行と給与画面の同じ数字が即時に一致（同じ関数）。≤900px は Modal がボトムシート（全幅）になる。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { hm47Ja, hm47OfInput, isoOfBizHm, kintaiEditPlanOf, type AttendanceDayRow } from "@/lib/nox/payroll/attendance-sheet";
import { hm2min, min2hm } from "@/lib/nox/shift-time";

export const ATT_STATUS_OPTIONS = [["", "変えない"], ["shukkin", "出勤"], ["late", "遅刻"], ["absent", "当欠"], ["off", "休み"], ["dohan", "同伴"]] as const;

/** RPC の例外→日本語（この画面で起きうるもの） */
export function kintaiErrJa(msg: string): string {
  if (/billing locked/.test(msg)) return "ご契約の手続きが必要です";
  if (/out of biz window/.test(msg)) return "その営業日の時間帯ではありません（営業日の切替をまたぐ時刻は入れられません）";
  if (/invalid_input/.test(msg)) return "入力が不足しています（時刻か理由）";
  if (/not_found|not found/.test(msg)) return "対象が見つかりません（画面を再読込してください）";
  if (/bad status/.test(msg)) return "区分が正しくありません";
  if (/unavailable|override/.test(msg)) return "その日は出勤できない日として登録されています（理由を入れて保存してください）";
  if (/forbidden/.test(msg)) return "権限がありません（店長・オーナーのみ）";
  return msg;
}

/** 追加するシフトの時間＝出の時刻（0-23 域に丸める）〜退の時刻（無ければ +5h・最大 47:59） */
export function addShiftSpanOf(inHm: string, outHm: string | null): { start: string; end: string } {
  const s = Math.min(hm2min(inHm), 23 * 60 + 59);
  const e = outHm ? Math.max(hm2min(outHm), s + 60) : s + 5 * 60;
  return { start: min2hm(s), end: min2hm(Math.min(e, 47 * 60 + 59)) };
}

export default function KintaiEdit({ castId, castName, row, periodStart, periodEnd, todayBiz, existingDates, onClose, onSaved }: {
  storeId?: string; castId: string; castName: string;
  /** null＝追加 */
  row: AttendanceDayRow | null;
  periodStart: string; periodEnd: string; todayBiz: string;
  existingDates: readonly string[];
  onClose: () => void; onSaved: (msg: string) => void | Promise<void>;
}) {
  const supabase = createClient();
  const add = row === null;
  const [date, setDate] = useState(row?.bizDate ?? (todayBiz <= periodEnd && todayBiz >= periodStart ? todayBiz : periodEnd));
  const [inTxt, setInTxt] = useState(row?.inHm ? hm47Ja(row.inHm) : "");
  const [outTxt, setOutTxt] = useState(row?.outHm ? hm47Ja(row.outHm) : "");
  const [status, setStatus] = useState<string>("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);

  const curStatus = row ? (row.absent ? "absent" : row.late ? "late" : null) : null;
  const md = (d: string) => d.slice(5).replace("-", "/");

  async function rpc(name: string, args: Record<string, unknown>): Promise<string | null> {
    const { error } = await supabase.rpc(name, args);
    return error ? kintaiErrJa(error.message) : null;
  }

  async function save() {
    setErr(null);
    const inHm = hm47OfInput(inTxt), outHm = hm47OfInput(outTxt);
    if (inHm === undefined || outHm === undefined) { setErr("時刻は「20:00」「翌01:30」（または 25:30）の形で入力してください"); return; }
    if (inHm && outHm && hm2min(outHm) <= hm2min(inHm)) { setErr("退は出より後の時刻にしてください（翌日は「翌01:30」）"); return; }
    if (add) {
      if (!date || date < periodStart || date > periodEnd) { setErr("この月の日付を選んでください"); return; }
      if (date > todayBiz) { setErr("未来の日は追加できません"); return; }
      if (existingDates.includes(date)) { setErr("その日はすでに表にあります。表の日付を押して編集してください"); return; }
      if (!inHm) { setErr("出の時刻を入れてください"); return; }
      if (reason.trim() === "") { setErr("理由を入れてください（飛び入り出勤 等）"); return; }
    } else if (reason.trim() === "" && (inHm !== (row!.inHm ?? null) || outHm !== (row!.outHm ?? null))) { setErr("時刻を変えるときは理由を入れてください"); return; }
    setBusy(true);
    try {
      if (add) {
        const span = addShiftSpanOf(inHm!, outHm);
        const e1 = await rpc("shift_set", { p_id: null, p_cast_id: castId, p_date: date, p_start_hm: span.start, p_end_hm: span.end, p_status: "confirmed", p_override_reason: reason.trim() || null });
        if (e1) { setErr(`シフトの追加に失敗: ${e1}`); return; }
        const e2 = await rpc("punch_correction_request", { p_cast_id: castId, p_punch_id: null, p_biz_date: date, p_kind: "in", p_after_at: isoOfBizHm(date, inHm), p_reason: reason.trim() });
        if (e2) { setErr(`出の記録に失敗: ${e2}`); return; }
        if (outHm) { const e3 = await rpc("punch_correction_request", { p_cast_id: castId, p_punch_id: null, p_biz_date: date, p_kind: "out", p_after_at: isoOfBizHm(date, outHm), p_reason: reason.trim() }); if (e3) { setErr(`退の記録に失敗: ${e3}`); return; } }
        if (status) { const e4 = await rpc("attendance_set", { p_cast_id: castId, p_date: date, p_status: status, p_eta: null, p_reason: note.trim() || null }); if (e4) { setErr(`区分の記録に失敗: ${e4}`); return; } }
        await onSaved(`${castName} の ${md(date)} を追加しました`);
        return;
      }
      const plan = kintaiEditPlanOf(row!, { inHm, outHm, status: status || null, reason: note.trim() || null }, { status: curStatus, reason: null });
      for (const c of plan.corrections) {
        if (c.punchId === null && c.afterIso === null) continue;
        const e = await rpc("punch_correction_request", { p_cast_id: castId, p_punch_id: c.punchId, p_biz_date: row!.bizDate, p_kind: c.kind, p_after_at: c.afterIso, p_reason: reason.trim() });
        if (e) { setErr(`${c.kind === "in" ? "出" : "退"}の修正に失敗: ${e}`); return; }
      }
      if (plan.attendance) { const e = await rpc("attendance_set", { p_cast_id: castId, p_date: row!.bizDate, p_status: plan.attendance.status, p_eta: null, p_reason: plan.attendance.reason }); if (e) { setErr(`区分の記録に失敗: ${e}`); return; } }
      if (plan.corrections.length === 0 && !plan.attendance) { setErr("変更がありません"); return; }
      await onSaved(`${castName} の ${md(row!.bizDate)} を保存しました`);
    } finally { setBusy(false); }
  }

  async function cancelDay() {
    setErr(null);
    if (reason.trim() === "") { setErr("取消の理由を入れてください"); return; }
    if (!confirm(`${castName} の ${md(row!.bizDate)} を取消しますか？（打刻は削除・シフトは外し・行は「取消済み」で残ります）`)) return;
    setBusy(true);
    try {
      for (const [kind, pid] of [["in", row!.inPunchId], ["out", row!.outPunchId]] as const) {
        if (!pid) continue;
        const e = await rpc("punch_correction_request", { p_cast_id: castId, p_punch_id: pid, p_biz_date: row!.bizDate, p_kind: kind, p_after_at: null, p_reason: `取消: ${reason.trim()}` });
        if (e) { setErr(`${kind === "in" ? "出" : "退"}の削除に失敗: ${e}`); return; }
      }
      if (row!.shiftId) { const e = await rpc("shift_remove", { p_id: row!.shiftId }); if (e) { setErr(`シフトの取消に失敗: ${e}`); return; } }
      const e2 = await rpc("attendance_set", { p_cast_id: castId, p_date: row!.bizDate, p_status: "off", p_eta: null, p_reason: `取消: ${reason.trim()}` });
      if (e2) { setErr(`区分の記録に失敗: ${e2}`); return; }
      await onSaved(`${castName} の ${md(row!.bizDate)} を取消しました`);
    } finally { setBusy(false); }
  }

  const lbl: React.CSSProperties = { ...t.fieldLabel, display: "block", marginBottom: 4 };
  const field: React.CSSProperties = { display: "grid", gap: 2, marginBottom: 10 };
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={460} scroll>
      <div data-kintai-edit-sheet={add ? "add" : row!.bizDate} style={{ padding: "4px 2px" }}>
        <h3 style={{ ...t.cardTitle, margin: "0 0 10px" }}>{add ? `${castName}：日を追加` : `${castName}：${md(row!.bizDate)} の編集`}</h3>
        {!add && row!.shift && <p style={{ ...t.sub, margin: "0 0 8px" }}>確定シフト {row!.shift.start}–{hm47Ja(row!.shift.end)}{row!.missingOut ? "・退勤記録なし（退を入れると埋まります）" : ""}</p>}
        {add && <div style={field}><label style={lbl}>日付</label><input type="date" value={date} min={periodStart} max={todayBiz < periodEnd ? todayBiz : periodEnd} onChange={(e) => setDate(e.target.value)} style={{ ...t.input, width: "auto" }} data-kintai-add-date="1" /><span style={t.sub}>確定シフトが無い日は、出〜退でシフトも足します（飛び入り出勤）</span></div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={field}><label style={lbl}>出</label><input value={inTxt} onChange={(e) => setInTxt(e.target.value)} placeholder="20:00" inputMode="numeric" style={t.input} data-kintai-in="1" aria-label="出の時刻" /></div>
          <div style={field}><label style={lbl}>退</label><input value={outTxt} onChange={(e) => setOutTxt(e.target.value)} placeholder="翌01:30" style={t.input} data-kintai-out="1" aria-label="退の時刻" /></div>
        </div>
        <div style={field}><label style={lbl}>区分</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...t.input, width: "auto" }} data-kintai-status="1" aria-label="区分">{ATT_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <span style={t.sub}>早退は退の時刻から判定します（区分ではありません）</span></div>
        <div style={field}><label style={lbl}>備考（区分の理由・本人の連絡）</label><input value={note} onChange={(e) => setNote(e.target.value)} style={t.input} data-kintai-note="1" maxLength={200} /></div>
        <div style={field}><label style={lbl}>{cancelMode ? "取消の理由（必須）" : "修正の理由（時刻を変えるときは必須・店の修正に残ります）"}</label><input value={reason} onChange={(e) => setReason(e.target.value)} style={t.input} data-kintai-reason="1" maxLength={200} placeholder={add ? "飛び入り出勤" : "打刻の忘れ 等"} /></div>
        {err && <div style={{ marginBottom: 8 }}><Message kind="error">{err}</Message></div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!cancelMode && <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void save()} data-kintai-save="1">{add ? "追加する" : "保存する"}</button>}
          {cancelMode && <button type="button" style={{ ...t.btnGold, ...t.btnSm, background: "var(--bad)" }} disabled={busy} onClick={() => void cancelDay()} data-kintai-cancel-confirm="1">この日を取消する</button>}
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={onClose}>やめる</button>
          {!add && !cancelMode && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto", color: "var(--bad)", borderColor: "var(--bad)" }} disabled={busy} onClick={() => setCancelMode(true)} data-kintai-cancel="1">取消…</button>}
          {cancelMode && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={busy} onClick={() => setCancelMode(false)}>取消をやめる</button>}
        </div>
      </div>
    </Modal>
  );
}
