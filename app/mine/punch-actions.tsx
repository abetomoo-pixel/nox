"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";

export default function PunchActions() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function punch(type: "in" | "out") {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("punch_self", { p_type: type, p_lat: null, p_lng: null });
    setMsg(error ? "打刻に失敗しました" : type === "in" ? "出勤を打刻しました" : "退勤を打刻しました");
    setBusy(false);
    router.refresh();
  }

  return (
    /* 段0R 第3陣: モック .punchrow＝2カラムの大ボタン（スマホの親指操作前提・16px/15px）。
       ★送る打刻 RPC も引数も disabled 条件も文言も1文字も変えていない（見た目のみ）。 */
    <div>
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
