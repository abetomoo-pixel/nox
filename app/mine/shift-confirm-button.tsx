"use client";

// ★SD V2-3（mig0102・裁定⑥）: cast 本人の「確認する」＝shift_cast_confirm（proposed→confirmed 一方向）。
//   ★cast 初の shifts 書込 RPC。真の防御は RPC 側（auth_cast_id() 本人チェック・proposed のみ・
//     billing gate）＝ここは表示と1タップの操作面のみ。V1 検証済みの引数形（p_shift_id）と一字一致。
//   確定後は router.refresh() で server component（/mine）を再描画＝「確定」表示へ変わる。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ShiftConfirmButton({ shiftId }: { shiftId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("shift_cast_confirm", { p_shift_id: shiftId });
    setBusy(false);
    if (error) {
      const m = error.message ?? "";
      setErr(m.includes("bad status") ? "このシフトは確認できない状態です（更新してください）"
        : m.includes("billing locked") ? "現在このお店では操作できません（責任者にご確認ください）"
        : m.includes("forbidden") ? "権限がありません"
        : m);
      return;
    }
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button" disabled={busy} onClick={() => void confirm()}
        style={{
          fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          padding: "2px 10px", borderRadius: 999,
          border: "1px solid var(--gold)", background: "var(--goldface2)", color: "var(--champ)",
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? "確認中…" : "確認する"}
      </button>
      {err && <span style={{ fontSize: 11, color: "var(--bad)" }}>{err}</span>}
    </span>
  );
}
