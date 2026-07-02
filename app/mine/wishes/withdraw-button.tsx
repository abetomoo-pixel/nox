"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      style={{
        marginLeft: "auto", padding: "2px 10px", fontSize: 12, borderRadius: 6,
        border: "1px solid #e0e0e0", background: "#fff", cursor: "pointer",
      }}
    >
      取り下げ
    </button>
  );
}
