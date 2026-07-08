"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

export default function WithdrawButton({ wishId }: { wishId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("shift_wish_withdraw", { p_wish_id: wishId });
    setBusy(false);
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
