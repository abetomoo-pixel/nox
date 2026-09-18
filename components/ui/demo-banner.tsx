"use client";

// ★夜間便 N7-2（裁定273-6／276・2026-09-18）: デモ環境の帯＋「初期状態に戻す」（POST /api/demo/reset）。
//   見た目は課金失効バナーと同じ .nox-alert（新色・新クラスなし）。成否は帯の下の Message（裁定281）。10 分未満の再実行は 429 の残り分数を出す。
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import { Message, type MessageKind } from "@/components/ui/toast";

export const DEMO_BANNER_MSG = "デモ環境です。入力内容は他の閲覧者にも見えます。個人情報を入力しないでください。毎朝 5 時に初期化されます";

export default function DemoBanner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: MessageKind; text: string } | null>(null);

  async function reset() {
    if (busy) return;
    if (!confirm("このデモ環境を初期状態に戻します。入力した内容はすべて消えます。よろしいですか？")) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; remainingMinutes?: number; mode?: string };
      if (!res.ok) { setMsg({ kind: res.status === 429 ? "warn" : "error", text: j.error ?? "初期化できませんでした" }); return; }
      setMsg({ kind: "success", text: "初期状態に戻しました" });
      router.refresh();
    } catch {
      setMsg({ kind: "error", text: "初期化できませんでした（通信エラー）" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="nox-alert" role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ minWidth: 0, flex: 1 }}>{DEMO_BANNER_MSG}</span>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm, whiteSpace: "nowrap", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void reset()}>
          {busy ? "初期化中…" : "初期状態に戻す"}
        </button>
      </div>
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)} style={{ margin: "6px 0 0" }}>{msg.text}</Message>}
    </div>
  );
}
