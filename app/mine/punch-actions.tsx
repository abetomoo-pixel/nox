"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import { okuriSelfPlanOf, okuriResultTextOf, OKURI_PENDING_NOTE } from "@/lib/nox/shift/okuri-self";

// ★裁定319（0158・便 AB-5）: 送り あり＝punch_self(p_okuri=true)→transport_issue_self(punch_id)。金額は店の送りの基本額をサーバが決める＝表示のみ（変更不可）。
//   基本額が未設定の店は発行せず「送りは店が締めで確定します」。発行に失敗しても打刻は残る（締め前モーダルに未発行として出る）。

// ★裁定317（便 X-9-3）: cast 本人は送りの発行（transport_issue_bulk＝owner／manager のみ）を呼べない＝金額ダイアログは出さず、「あり」の打刻だけ残す（締め前モーダルに未発行として出る）。器は 0158。
// ★0156（裁定309-9＝302-5・便 V-5）: okuri_mode='actual' の店だけ、退勤に「送り あり／なし」（既定なし）→ punch_self の p_okuri。
//   'flat'／未設定の店は出さない（p_okuri を送らない＝RPC の既定＝null）。in 打刻は従来どおり 3 引数。
export default function PunchActions({ okuriActual = false, okuriBase = null }: { okuriActual?: boolean; okuriBase?: number | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [okuri, setOkuri] = useState(false);
  const plan = okuriSelfPlanOf(okuriActual ? { okuri_mode: "actual", okuri_base_amount: okuriBase } : null);

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
    setMsg(error ? "打刻に失敗しました" : type === "in" ? "出勤を打刻しました" : okuriResultTextOf(okuriActual && okuri, outcome, plan.amount));
    if (!error && type === "out") setOkuri(false);
    setBusy(false);
    router.refresh();
  }

  return (
    /* 段0R 第3陣: モック .punchrow＝2カラムの大ボタン（スマホの親指操作前提・16px/15px）。
       ★送る打刻 RPC も引数も disabled 条件も文言も1文字も変えていない（見た目のみ）。★0156: actual 店のみ送りトグルを足す */
    <div>
      {okuriActual && (
        <div className="nox-seg" role="group" aria-label="送り" style={{ marginBottom: 8, width: "fit-content" }}>
          <button type="button" className={!okuri ? "on" : ""} disabled={busy} onClick={() => setOkuri(false)}>送り なし</button>
          <button type="button" className={okuri ? "on" : ""} disabled={busy} onClick={() => setOkuri(true)}>送り あり</button>
        </div>
      )}
      {okuriActual && okuri && (
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>
          {plan.amount !== null ? <>送り <b className="num" style={{ color: "var(--ink)" }}>¥{plan.amount.toLocaleString()}</b>（金額は店の設定です）</> : OKURI_PENDING_NOTE}
        </p>
      )}
      <div className="nox-punchrow">
        <button style={{ ...t.btnGold, padding: 16, fontSize: 15, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => punch("in")}>
          出勤
        </button>
        <button style={{ ...t.btnGhost, padding: 16, fontSize: 15, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => punch("out")}>
          退勤
        </button>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
