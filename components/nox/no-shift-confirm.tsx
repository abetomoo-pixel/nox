"use client";

// ★便 M-14 ②（2026-10-26・Agoora）: 勤怠の「シフト無し出勤」の行から「シフトとして確定」＝採用・確定のシフトを作る（shift_set＝当日追加配置と同じ RPC・過去日も可）→時給分が付く。
//   既定の時間＝打刻の出〜退（addShiftSpanOf＝0-23 域に丸め）・店の枠（その曜日の営業時間）から選び直し可・手入力も可。確定済みの月は呼び出し側が出さない。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import HmInput from "@/components/ui/hm-input";
import { hmRangeErrorOf, normalizeHHMM } from "@/lib/nox/time/hhmm";
import { hm47Ja, noShiftSpanOptionsOf, type AttendanceDayRow } from "@/lib/nox/payroll/attendance-sheet";
import type { BusinessHourRow } from "@/lib/nox/business-hours";
import { kintaiErrJa } from "@/components/nox/kintai-edit";

export default function NoShiftConfirm({ castId, castName, row, bhRows, onClose, onSaved }: {
  castId: string; castName: string; row: AttendanceDayRow; bhRows: BusinessHourRow[];
  onClose: () => void; onSaved: (msg: string) => void | Promise<void>;
}) {
  const opts = noShiftSpanOptionsOf(row, bhRows);
  const [pick, setPick] = useState(0);
  const [start, setStart] = useState(opts[0]?.start ?? "20:00");
  const [end, setEnd] = useState(opts[0]?.end ?? "26:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const md = row.bizDate.slice(5).replace("-", "/");

  function choose(i: number) { setPick(i); setStart(opts[i].start); setEnd(opts[i].end); setErr(null); }
  async function save() {
    const s = normalizeHHMM(start), e = normalizeHHMM(end);
    const rangeErr = hmRangeErrorOf(start) ?? hmRangeErrorOf(end);
    if (rangeErr || !s || !e) { setErr(rangeErr ?? "時刻は「20:00」の形で入力してください"); return; }
    const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
    if (toMin(e) <= toMin(s)) { setErr("終了は開始より後にしてください（翌日は 26:00 の形）"); return; }
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc("shift_set", { p_id: null, p_cast_id: castId, p_date: row.bizDate, p_start_hm: s, p_end_hm: e, p_status: "confirmed", p_override_reason: "シフト無し出勤を勤怠から確定" });
    setBusy(false);
    if (error) { setErr(/duplicate/.test(error.message) ? "この日にはすでにシフトがあります（画面を再読込してください）" : /closed day/.test(error.message) ? "その日は定休日です" : kintaiErrJa(error.message)); return; }
    await onSaved(`${castName} の ${md} をシフトとして確定しました（時給分が付きます）`);
  }

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={420} scroll>
      <div data-no-shift-confirm={row.bizDate} style={{ padding: "4px 2px" }}>
        <h3 style={{ ...t.cardTitle, margin: "0 0 8px" }}>{castName}：{md} をシフトとして確定</h3>
        <p style={{ ...t.sub, margin: "0 0 10px" }}>打刻 {hm47Ja(row.inHm)}〜{row.outHm ? hm47Ja(row.outHm) : "（退勤なし）"}・採用・確定のシフトを作ります</p>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }} role="radiogroup" aria-label="シフトの時間">
          {opts.map((o, i) => (
            <label key={o.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, minHeight: 40 }}>
              <input type="radio" name="ns-span" checked={pick === i} onChange={() => choose(i)} data-no-shift-span={o.key} />
              {o.label}（{o.start}〜{hm47Ja(o.end)}）
            </label>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <label style={t.fieldLabel}>開始<HmInput value={start} onChange={setStart} style={t.input} ariaLabel="開始" /></label>
          <label style={t.fieldLabel}>終了<HmInput value={end} onChange={setEnd} style={t.input} ariaLabel="終了" /></label>
        </div>
        {err && <div style={{ marginBottom: 8 }}><Message kind="error">{err}</Message></div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => void save()} style={{ ...t.btnGold, minHeight: 44, opacity: busy ? 0.7 : 1 }} data-no-shift-confirm-go="1">シフトとして確定</button>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...t.btnGhost, minHeight: 44 }}>キャンセル</button>
        </div>
      </div>
    </Modal>
  );
}
