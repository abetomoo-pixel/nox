"use client";

// ★2026-11-22（相談役 14:10 の 3・裁定478）: シフト作成の ③配置 の日のモーダルで、臨時営業・臨時休業を前もって登録／取消する。
//   店長以上だけ（呼び出し側が isManagerUp で出す＝真の防御は set_store_special_day／remove_store_special_day の owner／自店 manager）。過去の日は出さない（RPC は 'past day'）。
//   臨時営業＝料金と必要人数を何曜日と同じにするか（定休日以外・既定の選択なし）→ その曜日の営業時間で登録。臨時休業＝シフトが入っていれば人数を出して確かめる。
//   マスタ › 営業時間・定休日の「特別営業日・臨時休業」の一覧と同じ表（どちらで登録しても同じものが出る）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { errJa } from "@/lib/nox/errors";
import { DOW_JA } from "@/lib/nox/business-hours-special";
import type { BusinessHourRow } from "@/lib/nox/business-hours";
import { CLOSE_KEEP_NOTE, CLOSE_REMOVE_NOTE, CLOSE_SHIFT_CHOICES, closeAskOf, closeDoneTextOf, openDowChoicesOf, openHoursOfDow, specialDayActionOf, type ShiftSpecialDay } from "@/lib/nox/shift/special-day";

export default function ShiftSpecialDay({ storeId, ymd, bizToday, isManagerUp, weekdayClosed, special, bhRows, shiftCount, onChanged, onRemoveShifts }: {
  storeId: string; ymd: string; bizToday: string; isManagerUp: boolean; weekdayClosed: boolean; special: ShiftSpecialDay | null;
  bhRows: BusinessHourRow[]; shiftCount: number; onChanged: (text: string) => Promise<void> | void;
  /** ★2026-11-22（相談役 19:40 の 1-b）: その日のシフトを外す（今ある shift_remove・確定を外した人には今の shift_removed の知らせ）＝呼び出し側 */
  onRemoveShifts: () => Promise<{ removed: number; failed: number }>;
}) {
  const [closing, setClosing] = useState(false);
  const [shiftChoice, setShiftChoice] = useState<"remove" | "keep">("remove");
  const [asking, setAsking] = useState(false);
  const [dow, setDow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = specialDayActionOf({ ymd, bizToday, isManagerUp, weekdayClosed, special });
  const label = special?.kind === "open" ? `臨時営業${typeof special.price_dow === "number" ? `（料金と必要人数は${DOW_JA[special.price_dow]}曜と同じ）` : ""}` : special?.kind === "closed" ? "臨時休業" : weekdayClosed ? "定休日" : null;
  if (act.kind === "none" && !label) return null;

  async function call(fn: "set_store_special_day" | "remove_store_special_day", args: Record<string, unknown>, done: string) {
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    if (error) { setErr(/forbidden/.test(error.message) ? "権限がありません（店長・管理者のみ）" : errJa(error.message)); return; }
    setAsking(false); setDow(null);
    await onChanged(done);
  }
  const makeOpen = () => {
    if (dow === null) return;
    const h = openHoursOfDow(dow, bhRows);
    if (!h) { setErr(`${DOW_JA[dow]}曜の営業時間が未設定です（マスタ › 営業時間・定休日）`); return; }
    void call("set_store_special_day", { p_store_id: storeId, p_day: ymd, p_kind: "open", p_open_hm: h.open, p_close_hm: h.close, p_note: null, p_price_dow: dow }, `${ymd} を臨時営業にしました（${DOW_JA[dow]}曜と同じ）`);
  };
  const makeClosed = async () => {
    // ★2026-11-22（相談役 19:40 の 1-b）: 先に臨時休業を登録し、通ったら（外すを選んだときだけ）その日のシフトを外す
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc("set_store_special_day", { p_store_id: storeId, p_day: ymd, p_kind: "closed", p_open_hm: null, p_close_hm: null, p_note: null, p_price_dow: null });
    if (error) { setBusy(false); setErr(/forbidden/.test(error.message) ? "権限がありません（店長・管理者のみ）" : errJa(error.message)); return; }
    const r = shiftCount > 0 && shiftChoice === "remove" ? await onRemoveShifts() : null;
    setBusy(false); setClosing(false); setShiftChoice("remove");
    await onChanged(shiftCount > 0 ? closeDoneTextOf(ymd, r) : `${ymd} を臨時休業にしました`);
  };
  const undo = () => {
    const what = special?.kind === "open" ? "臨時営業" : "臨時休業";
    const extra = special?.kind === "open" && weekdayClosed && shiftCount > 0 ? `（この日に入っている ${shiftCount} 人のシフトは消えません。定休日に戻ります）` : special?.kind === "closed" ? "（臨時休業にしたときに外したシフトは戻りません）" : "";
    if (!window.confirm(`${ymd} の${what}を取り消しますか？${extra}`)) return;
    void call("remove_store_special_day", { p_store_id: storeId, p_day: ymd }, `${ymd} の${what}を取り消しました`);
  };
  const choices = openDowChoicesOf(bhRows);

  return (
    <div className="nox-inset" style={{ padding: "10px 12px", margin: "0 0 10px" }} data-shift-special={act.kind} data-shift-special-day={ymd}>
      {label && <p style={{ margin: 0, fontSize: 13, fontWeight: 700, textAlign: "center" }} data-shift-special-label="1">{label}</p>}
      {act.kind === "make_open" && !asking && (
        <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => { setAsking(true); setErr(null); }} data-shift-special-open="1">この日を臨時営業にする</button></div>
      )}
      {act.kind === "make_open" && asking && (
        <div style={{ marginTop: 8 }} data-shift-special-ask="1">
          <p style={{ margin: "0 0 6px", fontSize: 12.5, textAlign: "center" }}>料金と必要人数は何曜日と同じにしますか？</p>
          <div className="nox-seg" role="group" aria-label="料金と必要人数の曜日" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            {choices.map((d) => <button key={d} type="button" className={dow === d ? "on" : ""} aria-pressed={dow === d} onClick={() => setDow(d)} data-shift-special-dow={d}>{DOW_JA[d]}</button>)}
          </div>
          {dow !== null && (() => { const h = openHoursOfDow(dow, bhRows); return <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--sub)", textAlign: "center" }}>{h ? `営業時間は${DOW_JA[dow]}曜と同じ（${h.open}〜${h.close}）。` : ""}登録すると、この日の必要人数が出て配置できます。</p>; })()}
          <div className="nox-actions" style={{ marginTop: 8 }}>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setAsking(false); setDow(null); }}>やめる</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || dow === null} onClick={makeOpen} data-shift-special-save="1">臨時営業にする</button>
          </div>
        </div>
      )}
      {act.kind === "make_closed" && !closing && (
        <div className="nox-actions" style={{ marginTop: label ? 8 : 0 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setErr(null); if (shiftCount > 0) setClosing(true); else void makeClosed(); }} data-shift-special-close="1">この日を臨時休業にする</button></div>
      )}
      {act.kind === "make_closed" && closing && (/* ★2026-11-22（相談役 19:40 の 1-b）: 入っているシフトを外す／残す（既定は外す） */
        <div style={{ marginTop: 8 }} data-shift-special-closeask="1">
          <p style={{ margin: "0 0 6px", fontSize: 12.5, textAlign: "center" }}>{closeAskOf(ymd, shiftCount)}</p>
          <div className="nox-seg" role="group" aria-label="入っているシフト" style={{ justifyContent: "center" }}>
            {CLOSE_SHIFT_CHOICES.map(([k, l]) => <button key={k} type="button" className={shiftChoice === k ? "on" : ""} aria-pressed={shiftChoice === k} onClick={() => setShiftChoice(k)} data-shift-special-closechoice={k}>{k === "remove" ? `入っているシフト ${shiftCount} 人を${l}` : l}</button>)}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: shiftChoice === "keep" ? "var(--champ)" : "var(--sub)", textAlign: "center" }} data-shift-special-keepnote="1">「残す」：{CLOSE_KEEP_NOTE}</p>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--sub)", textAlign: "center" }} data-shift-special-closenote="1">{CLOSE_REMOVE_NOTE}</p>
          <div className="nox-actions" style={{ marginTop: 8 }}>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { setClosing(false); setShiftChoice("remove"); }}>やめる</button>
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void makeClosed()} data-shift-special-closesave="1">臨時休業にする</button>
          </div>
        </div>
      )}
      {(act.kind === "undo_open" || act.kind === "undo_closed") && (
        <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={undo} data-shift-special-undo="1">{act.kind === "undo_open" ? "臨時営業を取り消す" : "臨時休業を取り消す"}</button></div>
      )}
      {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
    </div>
  );
}
