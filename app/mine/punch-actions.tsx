"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";

// ★裁定317（便 X-9-3）: cast 本人は送りの発行（transport_issue_bulk＝owner／manager のみ）を呼べない＝金額ダイアログは出さず、「あり」の打刻だけ残す（締め前モーダルに未発行として出る）。器は 0158。
// ★0156（裁定309-9＝302-5・便 V-5）: okuri_mode='actual' の店だけ、退勤に「送り あり／なし」（既定なし）→ punch_self の p_okuri。
//   'flat'／未設定の店は出さない（p_okuri を送らない＝RPC の既定＝null）。in 打刻は従来どおり 3 引数。
export default function PunchActions({ okuriActual = false }: { okuriActual?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [okuri, setOkuri] = useState(false);

  async function punch(type: "in" | "out") {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("punch_self", type === "out" && okuriActual
      ? { p_type: type, p_lat: null, p_lng: null, p_okuri: okuri }
      : { p_type: type, p_lat: null, p_lng: null });
    setMsg(error ? "打刻に失敗しました" : type === "in" ? "出勤を打刻しました" : okuriActual && okuri ? "退勤を打刻しました（送り あり・金額は店が締めのときに確定します）" : "退勤を打刻しました");
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
