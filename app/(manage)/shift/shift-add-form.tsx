"use client";

// 手動シフト追加フォーム（SC-1・裁定42）。shift-board.tsx にインラインで書かれていたモーダルを
// **そのまま部品化**したもの。
//
// ★切り出しの範囲: 6 state（fCast/fDate/fStart/fEnd/fStatus）と派生2値（fShiftHours/fClosedDay）を
//   すべて内部へ移した。モーダルの開閉だけは親が持つ（open/onClose）＝どの面から開いたかを親が知る必要があるため。
// ★`addShift()` の **RPC 名・引数6本・順序・変数名は1文字も変えていない**
//   （sha256 152dd248…fb41 で移送前後を照合）。定休日の事前ブロックも同じ位置・同じ式のまま。
// ★保存成功後は `onSaved()` を呼ぶだけ＝`load()` は子から直接呼ばない（親が何を再取得するか決める）。
//
// ★SC-1 の追加分（裁定42）: 開始/終了の既定値を**その日付の曜日の営業時間**から引く。
//   引けないとき（曜日行が無い＝未設定／定休日）だけ従来のハードコード 20:00 / 26:00 に落ちる。
//   ★bhRows の `open_hm`（00:00〜23:59）/ `close_hm`（00:00〜47:59・30:00=翌06:00）は
//     shifts の `start_hm`/`end_hm` と **CHECK 正規表現が完全一致**＝**変換は不要**（実測で確認）。
//   日付を変えたときの追随は `timeTouched` 1本で決める＝ユーザーが時間欄を一度でも触ったら以降は追随しない。
//   モーダルを閉じると `timeTouched` はリセットされる（次に開いたときは再び営業時間から入る）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import SegSelect from "@/components/ui/seg-select";
import { shiftHoursStatus, fmtHoursLabel, type BusinessHourRow } from "@/lib/nox/business-hours";

type Cast = { id: string; name: string };

const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

// 既定の勤務時間（営業時間が引けないときのフォールバック＝従来のハードコード値）
const FALLBACK_START = "20:00";
const FALLBACK_END = "26:00";

/** その日付の曜日の営業時間を [start, end] で返す。引けなければ null。 */
function hoursOf(date: string, bhRows: BusinessHourRow[]): [string, string] | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const row = bhRows.find((r) => r.dow === dow);
  if (!row || row.is_closed || !row.open_hm || !row.close_hm) return null;
  return [row.open_hm, row.close_hm];
}

// RPC エラーの日本語化（shift_set 系・親から切り出した分だけ）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("closed day")) return "選択された日は定休日です";
  if (msg.includes("bad time")) return "時刻は 開始 00:00〜23:59・終了 00:00〜47:59 で入力してください";
  if (msg.includes("bad status")) return "状態の指定が不正です";
  if (msg.includes("duplicate")) return "この日にはすでにシフトがあります（1日1枠）";
  if (msg.includes("inactive cast")) return "このキャストは退店済みです";
  if (msg.includes("billing locked")) return "現在このお店では操作できません（責任者にご確認ください）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function ShiftAddForm({
  cast, bhRows, initialDate, initialStatus, open, onClose, onSaved,
}: {
  /** ★裁定108: キャスト選択の select 禁止＝対象キャストは親が確定して渡す（Picker 2段 or 行の＋直開き） */
  cast: Cast | null;
  bhRows: BusinessHourRow[];
  /** 開いたときの日付（今日タブ＝営業日の今日／カレンダー＝選択日） */
  initialDate: string;
  /** 開いたときの状態。今日タブ＝confirmed（当日その場で足すのは「もう入る人」・裁定42） */
  initialStatus: string;
  open: boolean;
  onClose: () => void;
  /** 登録が成功したときだけ呼ばれる（親が load() を回す） */
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [fDate, setFDate] = useState(initialDate);
  const [fStart, setFStart] = useState(FALLBACK_START);
  const [fEnd, setFEnd] = useState(FALLBACK_END);
  const [fStatus, setFStatus] = useState(initialStatus);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ★裁定42: 時間欄を人が触ったか。触っていない間だけ日付変更に追随する。
  const [timeTouched, setTimeTouched] = useState(false);

  // 開いた瞬間に親の初期値へ合わせ、時間は営業時間から入れ直す（timeTouched もリセット）
  useEffect(() => {
    if (!open) return;
    setFDate(initialDate);
    setFStatus(initialStatus);
    setMsg(null);
    setTimeTouched(false);
    const h = hoursOf(initialDate, bhRows);
    setFStart(h ? h[0] : FALLBACK_START);
    setFEnd(h ? h[1] : FALLBACK_END);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate, initialStatus]);

  // 日付を変えたら営業時間へ追随（★人が時間を触っていないときだけ）
  const changeDate = (v: string) => {
    setFDate(v);
    if (timeTouched) return;
    const h = hoursOf(v, bhRows);
    setFStart(h ? h[0] : FALLBACK_START);
    setFEnd(h ? h[1] : FALLBACK_END);
  };

  const fShiftHours = shiftHoursStatus(fDate, fStart, fEnd, bhRows);
  const fClosedDay = fShiftHours.status === "closed";
  const bhOfDay = hoursOf(fDate, bhRows);

  // ★移送: RPC 名・引数6本・順序は不変（★裁定108: p_cast_id の出所だけ select state → cast prop へ）
  async function addShift() {
    if (!cast) return;
    setMsg(null);
    // B-5②: 定休日は送信もしない（ボタン無効の保険・二層目は RPC 'closed day'＝段26-4 実測）
    if (shiftHoursStatus(fDate, fStart, fEnd, bhRows).status === "closed") { setMsg("選択された日は定休日です"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("shift_set", {
      p_id: null, p_cast_id: cast.id, p_date: fDate, p_start_hm: fStart, p_end_hm: fEnd, p_status: fStatus,
    });
    setBusy(false);
    if (error) { setMsg(`シフトの登録に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg(null);
    onSaved();
    onClose();
  }

  if (!open || !cast) return null;

  return (
    <Modal onClose={onClose} maxWidth={520} scroll>
      <div className="nox-modalhead">
        <h3 style={{ ...secTitle, margin: 0 }}>手動でシフトを追加</h3>
        <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={onClose}>×</button>
      </div>
      <div className="nox-modalbody">
        <div className="nox-field2">
          <div className="nox-field">
            <span className="lab">キャスト</span>
            {/* ★裁定108: select 廃止＝Picker（または行の＋）で確定済みのキャストを固定表示 */}
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--champ)", padding: "8px 0" }}>{cast.name}</span>
          </div>
          <div className="nox-field">
            <span className="lab">日付</span>
            <input type="date" value={fDate} onChange={(e) => changeDate(e.target.value)} style={{ ...input, width: "100%" }} />
          </div>
          <div className="nox-field">
            <span className="lab">開始</span>
            <input value={fStart} onChange={(e) => { setTimeTouched(true); setFStart(e.target.value); }} style={{ ...input, width: "100%" }} />
            <span className="hint">24時以降は 25:00 のように書けます。</span>
          </div>
          <div className="nox-field">
            <span className="lab">終了</span>
            <input value={fEnd} onChange={(e) => { setTimeTouched(true); setFEnd(e.target.value); }} style={{ ...input, width: "100%" }} />
          </div>
          <div className="nox-field full">
            <span className="lab">状態</span>
            <SegSelect value={fStatus} onChange={(v) => setFStatus(v)}
              options={[["planned", "予定"], ["proposed", "確認待ち"], ["confirmed", "確定"]] as const} />
          </div>
        </div>
        {/* ★裁定42: 既定値の出どころを画面に書く（勝手に入っている数字の説明） */}
        {bhOfDay && !timeTouched && (
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "10px 0 0" }}>
            この曜日の営業時間（{fmtHoursLabel(fShiftHours.row ?? { dow: 0, is_closed: false, open_hm: bhOfDay[0], close_hm: bhOfDay[1] })}）を入れています。
            直すとこのあと日付を変えても追随しません。
          </p>
        )}
        {!bhOfDay && !fClosedDay && (
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "10px 0 0" }}>
            この曜日の営業時間が未設定のため、既定の {FALLBACK_START}〜{FALLBACK_END} を入れています。
          </p>
        )}
        {fClosedDay && (
          <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "10px 0 0" }}>
            この日は定休日です（シフトを登録できません）
          </p>
        )}
        {fShiftHours.status === "outside" && fShiftHours.row && (
          <p style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, margin: "10px 0 0" }}>
            営業時間外です（営業 {fmtHoursLabel(fShiftHours.row)}）
          </p>
        )}
        {msg && (
          <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "10px 0 0" }}>{msg}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 17 }}>
          <button style={btnLight} onClick={onClose}>やめる</button>
          <button style={{ ...btnDark, opacity: fClosedDay || busy ? 0.45 : 1 }} disabled={fClosedDay || busy}
            onClick={() => void addShift()}>{busy ? "登録中…" : "登録"}</button>
        </div>
      </div>
    </Modal>
  );
}
