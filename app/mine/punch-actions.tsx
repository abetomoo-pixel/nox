"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { okuriSelfPlanOf, okuriResultTextOf, OKURI_PENDING_NOTE } from "@/lib/nox/shift/okuri-self";
import { PUNCH_STATE_NOTE, punchButtonsOf, type PunchState } from "@/lib/nox/shift/punch-state";

// ★裁定326 追補3（便 M1-4・2026-09-30）: 3 状態（未出勤／出勤中／退勤済み）は page.tsx が当日営業日の自分の打刻から punchStateOf で導き state を渡す（新規 fetch 0）。
//   未出勤＝出勤 活性（主）・退勤 不活性・送り 不活性・補助文「出勤打刻がありません」／出勤中＝出勤 不活性・退勤 活性（主）・送り 活性／退勤済み＝両方不活性・補助文「本日は退勤済みです…」。
//   RPC 拒否（0161: 'already in'／'already out'／'no open punch'）は rpcErrJa の和文を出し router.refresh() で状態を再読取（画面と DB がずれた場合の自己回復）。本人取消は無し。
// ★裁定319（0158・便 AB-5）: 送り あり＝punch_self(p_okuri=true)→transport_issue_self(punch_id)。金額は店の送りの基本額をサーバが決める＝表示のみ（変更不可）。
//   基本額が未設定の店は発行せず「送りは店が締めで確定します」。発行に失敗しても打刻は残る（締め前モーダルに未発行として出る）。

// ★裁定317（便 X-9-3）: cast 本人は送りの発行（transport_issue_bulk＝owner／manager のみ）を呼べない＝金額ダイアログは出さず、「あり」の打刻だけ残す（締め前モーダルに未発行として出る）。器は 0158。
// ★0156（裁定309-9＝302-5・便 V-5）: okuri_mode='actual' の店だけ、退勤に「送り あり／なし」（既定なし）→ punch_self の p_okuri。
//   'flat'／未設定の店は出さない（p_okuri を送らない＝RPC の既定＝null）。in 打刻は従来どおり 3 引数。
export default function PunchActions({ okuriActual = false, okuriBase = null, state = "none" }: { okuriActual?: boolean; okuriBase?: number | null; state?: PunchState }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [okuri, setOkuri] = useState(false);
  const plan = okuriSelfPlanOf(okuriActual ? { okuri_mode: "actual", okuri_base_amount: okuriBase } : null);
  const btn = punchButtonsOf(state);
  const note = PUNCH_STATE_NOTE[state];

  async function punch(type: "in" | "out") {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: punchId, error } = await supabase.rpc("punch_self", type === "out" && okuriActual
      ? { p_type: type, p_lat: null, p_lng: null, p_okuri: okuri }
      : { p_type: type, p_lat: null, p_lng: null });
    let outcome: "issued" | "pending" | "none" = "none";
    if (!error && type === "out" && okuriActual && okuri) {
      outcome = "pending";
      if (plan.issue && typeof punchId === "string") {
        const { error: eT } = await supabase.rpc("transport_issue_self", { p_punch_id: punchId });
        if (!eT) outcome = "issued";
      }
    }
    // ★326 追補3: 拒否は和文（327＝すでに出勤打刻があります／本日は退勤済みです／出勤打刻がありません）・成功も拒否も refresh で状態を再読取
    setMsg(error ? rpcErrJa(error.message) : type === "in" ? "出勤を打刻しました" : okuriResultTextOf(okuriActual && okuri, outcome, plan.amount));
    if (!error && type === "out") setOkuri(false);
    setBusy(false);
    router.refresh();
  }

  return (
    /* 段0R 第3陣: モック .punchrow＝2カラムの大ボタン（スマホの親指操作前提・16px/15px）。
       ★送る打刻 RPC も引数も文言も変えていない。★0156: actual 店のみ送りトグルを足す。★326 追補3: disabled は 3 状態（punchButtonsOf）で決める */
    <div>
      {okuriActual && (
        <div className="nox-seg nox-punchseg" role="group" aria-label="送り" style={{ marginBottom: 8, width: "fit-content", opacity: btn.okuriEnabled ? 1 : 0.5 }}>{/* ★M3-1: disabled は not-allowed・hover で色が変わらない（globals.css） */}
          <button type="button" className={!okuri ? "on" : ""} disabled={busy || !btn.okuriEnabled} onClick={() => setOkuri(false)}>送り なし</button>
          <button type="button" className={okuri ? "on" : ""} disabled={busy || !btn.okuriEnabled} onClick={() => setOkuri(true)}>送り あり</button>
        </div>
      )}
      {okuriActual && okuri && btn.okuriEnabled && (
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>
          {plan.amount !== null ? <>送り <b className="num" style={{ color: "var(--ink)" }}>¥{plan.amount.toLocaleString()}</b>（金額は店の設定です）</> : OKURI_PENDING_NOTE}
        </p>
      )}
      <div className="nox-punchrow">
        <button className="nox-punchbtn" style={{ ...(btn.inEnabled ? t.btnGold : t.btnGhost), padding: 16, fontSize: 15, opacity: busy || !btn.inEnabled ? 0.55 : 1 }} disabled={busy || !btn.inEnabled} onClick={() => punch("in")} aria-disabled={!btn.inEnabled}>
          出勤
        </button>
        <button className="nox-punchbtn" style={{ ...(btn.outEnabled ? t.btnGold : t.btnGhost), padding: 16, fontSize: 15, opacity: busy || !btn.outEnabled ? 0.55 : 1 }} disabled={busy || !btn.outEnabled} onClick={() => punch("out")} aria-disabled={!btn.outEnabled}>
          退勤
        </button>
      </div>
      {note && <p className="nox-pstate" style={{ marginTop: 8 }}>{note}</p>}
      <Toast msg={msg} />
    </div>
  );
}
