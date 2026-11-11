"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

/** ★M-162: 希望の提出・取り下げの後に、フォーム（カレンダー・日付の詳細）が読み直す合図 */
export const WISHES_CHANGED_EVENT = "nox:wishes-changed";

export default function WithdrawButton({ wishId }: { wishId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("shift_wish_withdraw", { p_wish_id: wishId });
    setBusy(false);
    // ★M-162（2026-11-11）: 一覧（サーバ）だけでなく、カレンダー・日付の詳細（フォームが自分で読む）とノルマの集計も同時に読み直す＝フォームに知らせる
    if (!error && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(WISHES_CHANGED_EVENT, { detail: { withdrawn: wishId } }));
    router.refresh();
  }

  return (
    <button
      onClick={withdraw}
      disabled={busy}
      style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto", padding: "3px 11px", opacity: busy ? 0.7 : 1 }}
    >
      取り下げ
    </button>
  );
}
