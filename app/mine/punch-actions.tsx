"use client";

import { useEffect, useState, useTransition } from "react";
import { mig0196On, mig0198On, mig0201On } from "@/lib/nox/rules-0175/flag"; // ★便 D M-103（0196 まで非表示）★0198（裁定461）: 本人は選べない ★0201: route
import { overridableOf, selfPunch, selfPunchErrJa } from "@/lib/nox/punch/self-client"; // ★0201（裁定474）: 本人のスマホ打刻は route
import PunchReason from "./punch-reason";
import { DAY_DED_PICK_HEAD, dayDedPickLabelOf, dayDedPickRowsOf, dayDedAppliedTextOf, type DayDedPickRule, type DayDedApplied } from "@/lib/nox/payroll/day-ded-pick"; // ★便 D M-103 ★0198（裁定461 ②）
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { okuriSelfPlanOf, okuriResultTextOf, OKURI_PENDING_NOTE, OKURI_ZERO_NOTE } from "@/lib/nox/shift/okuri-self";
import { okuriOutTextOf, type OkuriMode } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）: 方式の 1 文
import { PUNCH_STATE_NOTE, punchButtonsOf, punchButtonsShownOf, minePunchStateOf, mineBreakButtonsOf, BREAK_ACTION_LABEL, BREAK_DONE_LABEL, type PunchState } from "@/lib/nox/shift/punch-state";
import { mig0214On } from "@/lib/nox/rules-0175/flag"; // ★0214（休憩）: 旗 false＝今のまま
import { PUNCH_PENDING_EVENT, punchStateAfterOf, punchStateShownOf } from "@/lib/nox/shift/punch-pending"; // ★2026-11-13（相談役【3】a）: 打刻の直後に古い状態を見せない

// ★裁定326 追補3（便 M1-4・2026-09-30）: 3 状態（未出勤／出勤中／退勤済み）は page.tsx が当日営業日の自分の打刻から punchStateOf で導き state を渡す（新規 fetch 0）。
//   未出勤＝出勤 活性（主）・退勤 不活性・送り 不活性・補助文「出勤打刻がありません」／出勤中＝出勤 不活性・退勤 活性（主）・送り 活性／退勤済み＝両方不活性・補助文「本日は退勤済みです…」。
//   RPC 拒否（0161: 'already in'／'already out'／'no open punch'）は rpcErrJa の和文を出し router.refresh() で状態を再読取（画面と DB がずれた場合の自己回復）。本人取消は無し。
// ★裁定319（0158・便 AB-5）: 送り あり＝punch_self(p_okuri=true)→transport_issue_self(punch_id)。金額は店の送りの基本額をサーバが決める＝表示のみ（変更不可）。
//   基本額が未設定の店は発行せず「送りは店が締めで確定します」。発行に失敗しても打刻は残る（締め前モーダルに未発行として出る）。

// ★裁定317（便 X-9-3）: cast 本人は送りの発行（transport_issue_bulk＝owner／manager のみ）を呼べない＝金額ダイアログは出さず、「あり」の打刻だけ残す（締め前モーダルに未発行として出る）。器は 0158。
// ★0156（裁定309-9＝302-5・便 V-5）: okuri_mode='actual' の店だけ、退勤に「送り あり／なし」（既定なし）→ punch_self の p_okuri。
//   'flat'／未設定の店は出さない（p_okuri を送らない＝RPC の既定＝null）。in 打刻は従来どおり 3 引数。
export default function PunchActions({ okuriMode = "flat", okuriBase = null, okuriZero = false, state = "none", dayDedRules = [], bizToday = null, dayDedApplied = null, breakOn = false, onBreak = false }: { /** ★0214: 店が休憩の打刻を使う（settings_json.break_punch） */ breakOn?: boolean; /** ★0214: 今、閉じていない休憩がある（自分の punch_breaks） */ onBreak?: boolean; /** ★0198（裁定461 ②・M-120）: 店が付けた今日の控除（表示だけ・null＝出さない） */ dayDedApplied?: DayDedApplied[] | null; /** ★便 D M-103: 出勤時に聞く「その日に選ぶ」控除（0196 まで空） */ dayDedRules?: DayDedPickRule[]; bizToday?: string | null; /** ★裁定414: 店の送り方式（'none' 以外で「送り あり／なし」を出す） */ okuriMode?: OkuriMode; okuriBase?: number | null; /** ★0236（Agoora の決め 11/26 22:50）: 自分の送り区分の額が 0 円＝送りは記録しない */ okuriZero?: boolean; state?: PunchState }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [okuri, setOkuri] = useState(false);
  const [dayDedOn, setDayDedOn] = useState<Record<string, boolean>>({}); // ★便 D M-103: 既定 off
  const [needReason, setNeedReason] = useState<"in" | "out" | null>(null); // ★0201: 範囲外／位置が取れない＝理由を書いてもう一度
  const [reason, setReason] = useState("");
  const plan = okuriSelfPlanOf({ okuri_mode: okuriMode, okuri_base_amount: okuriBase });
  const okuriActual = plan.ask; // ★裁定414: 名前は従来のまま＝意味は「送りの導線を出す店」（'none' 以外）
  // ★2026-11-13（相談役【3】a）: 打刻が通ったら読み直しが終わるまで打刻の後の状態で描く・サーバーで描いた行は PunchPending が「反映中…」に替える
  const [optimistic, setOptimistic] = useState<{ from: PunchState; to: PunchState } | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const shown = punchStateShownOf(state, optimistic);
  const shownBtn = punchButtonsShownOf(shown); // ★起票158 の 1
  useEffect(() => { if (!refreshing) { setOptimistic(null); window.dispatchEvent(new CustomEvent(PUNCH_PENDING_EVENT, { detail: false })); } }, [refreshing]);
  const btn = punchButtonsOf(shown);
  const note = PUNCH_STATE_NOTE[shown];
  // ★0214（相談役 11/25 の D5）: 出勤中＝「休憩」「退勤」・休憩中＝「休憩終了」だけ（位置の判定はしない＝break_self を直接）。旗 false＝出さない
  const [breakLocal, setBreakLocal] = useState<boolean | null>(null);
  useEffect(() => { if (!refreshing) setBreakLocal(null); }, [refreshing]);
  const onBreakNow = mig0214On() && (breakLocal ?? onBreak) && shown === "open";
  const brk = mineBreakButtonsOf(minePunchStateOf(shown, onBreakNow), mig0214On() && breakOn);
  async function breakAction(action: "start" | "end") {
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("break_self", { p_action: action });
    setBusy(false);
    setMsg(error ? rpcErrJa(error.message) : BREAK_DONE_LABEL[action]);
    if (!error) setBreakLocal(action === "start");
    startRefresh(() => router.refresh());
  }

  async function punch(type: "in" | "out") {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    // ★0201（裁定474・フラグ便）: 本人のスマホ打刻は route（位置は端末・IP はサーバー・判定は punch_self_impl）。範囲外／位置が取れないは理由を書けば通る
    let punchId: unknown = null; let error: { message: string } | null = null;
    if (mig0201On()) {
      const r = await selfPunch({ type, okuri: type === "out" && okuriActual ? okuri : null, overrideReason: needReason && reason.trim() ? reason.trim() : null });
      if (r.ok) { punchId = r.punch_id; setNeedReason(null); setReason(""); }
      else {
        if (overridableOf(r.code)) setNeedReason(type);
        setMsg(selfPunchErrJa(r.code)); setBusy(false); return;
      }
    } else {
      const x = await supabase.rpc("punch_self", type === "out" && okuriActual
        ? { p_type: type, p_lat: null, p_lng: null, p_okuri: okuri }
        : { p_type: type, p_lat: null, p_lng: null });
      punchId = x.data; error = x.error;
    }
    // ★便 D M-103（保存は 0196 の cast セルフ腕）: 出勤と同時に「今日の控除」を送る（on の行だけ・失敗しても打刻は残る）
    let dedNote = "";
    if (!error && type === "in" && mig0196On() && !mig0198On() && bizToday) { // ★0198（裁定461 ②）: 本人は選べない＝送らない（cast 経路は forbidden）
      const rows = dayDedPickRowsOf(dayDedRules, dayDedOn);
      if (rows) { const { data: cid } = await supabase.rpc("auth_cast_id"); const { error: eD } = await supabase.rpc("cast_day_deductions_set", { p_cast_id: cid, p_biz_date: bizToday, p_rows: rows }); dedNote = eD ? "（今日の控除は記録できませんでした＝店に伝えてください）" : "（今日の控除を記録しました）"; }
    }
    let outcome: "issued" | "pending" | "none" | "zero" = "none";
    if (!error && type === "out" && okuriActual && okuri) {
      outcome = "pending";
      if (okuriZero) outcome = "zero";   // ★0236: 区分の額 0 円＝記録しない（関数も行を作らない）
      else if (plan.issue && typeof punchId === "string") {
        const { error: eT } = await supabase.rpc("transport_issue_self", { p_punch_id: punchId });
        if (!eT) outcome = "issued";
      }
    }
    // ★326 追補3: 拒否は和文（327＝すでに出勤打刻があります／本日は退勤済みです／出勤打刻がありません）・成功も拒否も refresh で状態を再読取
    setMsg(error ? rpcErrJa(error.message) : type === "in" ? `出勤を打刻しました${dedNote}` : okuriResultTextOf(okuriActual && okuri, outcome, plan.amount, plan.mode));
    if (!error && type === "out") setOkuri(false);
    setBusy(false);
    if (!error) { setOptimistic({ from: state, to: punchStateAfterOf(type) }); window.dispatchEvent(new CustomEvent(PUNCH_PENDING_EVENT, { detail: true })); }
    startRefresh(() => router.refresh());
  }

  return (
    /* 段0R 第3陣: モック .punchrow＝2カラムの大ボタン（スマホの親指操作前提・16px/15px）。
       ★送る打刻 RPC も引数も文言も変えていない。★0156: actual 店のみ送りトグルを足す。★326 追補3: disabled は 3 状態（punchButtonsOf）で決める */
    <div>
      {okuriActual && !onBreakNow && (
        <div className="nox-seg nox-punchseg" role="group" aria-label="送り" style={{ marginBottom: 8, width: "fit-content", opacity: btn.okuriEnabled ? 1 : 0.5 }}>{/* ★M3-1: disabled は not-allowed・hover で色が変わらない（globals.css） */}
          <button type="button" className={!okuri ? "on" : ""} disabled={busy || !btn.okuriEnabled} onClick={() => setOkuri(false)}>送り なし</button>
          <button type="button" className={okuri ? "on" : ""} disabled={busy || !btn.okuriEnabled} onClick={() => setOkuri(true)}>送り あり</button>
        </div>
      )}
      {okuriActual && okuri && btn.okuriEnabled && (
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>
          {okuriZero ? <span data-okuri-zero="1">{OKURI_ZERO_NOTE}</span> : plan.amount !== null ? <span data-okuri-text={plan.mode}>{okuriOutTextOf(plan.mode, plan.amount)}（金額は店の設定です）</span> : OKURI_PENDING_NOTE}{/* ★裁定414: 方式の 1 文・★0236: 区分の額 0 円 */}
        </p>
      )}
      {mig0198On() && dayDedApplied !== null && (/* ★0198（裁定461 ②・M-120）: 本人は選べない＝店が付けた今日の控除の表示だけ */
        <p data-mine-day-ded-applied={String(dayDedApplied.length)} style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>{dayDedAppliedTextOf(dayDedApplied)}</p>
      )}
      {mig0196On() && !mig0198On() && dayDedRules.length > 0 && btn.inEnabled && (/* ★便 D M-103: 出勤ボタンの上＝その店の pick ルールごとのチェック（既定 off）★0198 後は出さない */
        <div data-mine-day-ded="1" style={{ marginBottom: 8, display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>{DAY_DED_PICK_HEAD}</span>
          {dayDedRules.map((r) => (
            <div key={r.id} className="nox-seg nox-punchseg" role="group" aria-label={r.name} style={{ width: "fit-content" }}>{/* ★教訓133: ネイティブの checkbox は使わず 2 択のボタン */}
              <button type="button" className={!dayDedOn[r.id] ? "on" : ""} disabled={busy} onClick={() => setDayDedOn((m) => ({ ...m, [r.id]: false }))} data-mine-day-ded-rule={r.id} data-mine-day-ded-on="0">なし</button>
              <button type="button" className={dayDedOn[r.id] ? "on" : ""} disabled={busy} onClick={() => setDayDedOn((m) => ({ ...m, [r.id]: true }))} data-mine-day-ded-on="1">{dayDedPickLabelOf(r)}</button>
            </div>
          ))}
        </div>
      )}
      {/* ★起票158 の 1（2026-11-24 夜）: 出勤していないときは「出勤」だけ・出勤中は「退勤」だけ（退勤済みはどちらも出さない＝補助文だけ） */}
      {brk.breakEnd ? (/* ★0214: 休憩中は「休憩終了」だけ */
      <div className="nox-punchrow" data-punch-shown="break_end">
        <button className="nox-punchbtn" style={{ ...t.btnGold, padding: 16, fontSize: 15, opacity: busy ? 0.55 : 1 }} disabled={busy} onClick={() => void breakAction("end")} data-mine-break="end">{BREAK_ACTION_LABEL.end}</button>
      </div>) : (
      <div className="nox-punchrow" data-punch-shown={shownBtn.in ? "in" : shownBtn.out ? (brk.breakStart ? "out_break" : "out") : "none"}>
        {brk.breakStart && <button className="nox-punchbtn" style={{ ...t.btnGhost, padding: 16, fontSize: 15, opacity: busy ? 0.55 : 1 }} disabled={busy} onClick={() => void breakAction("start")} data-mine-break="start">{BREAK_ACTION_LABEL.start}</button>}
        {shownBtn.in && <button className="nox-punchbtn" style={{ ...(btn.inEnabled ? t.btnGold : t.btnGhost), padding: 16, fontSize: 15, opacity: busy || !btn.inEnabled ? 0.55 : 1 }} disabled={busy || !btn.inEnabled} onClick={() => punch("in")} aria-disabled={!btn.inEnabled}>
          出勤
        </button>}
        {shownBtn.out && <button className="nox-punchbtn" style={{ ...(btn.outEnabled ? t.btnGold : t.btnGhost), padding: 16, fontSize: 15, opacity: busy || !btn.outEnabled ? 0.55 : 1 }} disabled={busy || !btn.outEnabled} onClick={() => punch("out")} aria-disabled={!btn.outEnabled}>
          退勤
        </button>}
      </div>)}
      {needReason && <PunchReason type={needReason} value={reason} onChange={setReason} busy={busy} onSubmit={() => punch(needReason)} />/* ★0201（裁定474）: ハードの店で範囲外・位置が取れない＝理由を書けば打刻できる */}
      {note && <p className="nox-pstate" style={{ marginTop: 8 }}>{note}</p>}
      <Toast msg={msg} />
    </div>
  );
}
