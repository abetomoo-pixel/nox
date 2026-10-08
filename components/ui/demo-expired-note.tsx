"use client";

// ★裁定328 追補4（便 D2-b・2026-10-08）: /demo?expired=1 のときだけ「24 時間が経過したため終了」の 1 行を出す（page は force-static のまま＝client で query を読む）。
import { useSearchParams } from "next/navigation";
import { DEMO_EXPIRED_JA } from "@/lib/nox/demo/session";

export default function DemoExpiredNote() {
  const sp = useSearchParams();
  if (sp.get("expired") !== "1") return null;
  return (
    <p role="status" style={{ fontSize: 13, color: "var(--v2-gold)", margin: "10px 0 0", lineHeight: 1.7 }}>{DEMO_EXPIRED_JA}</p>
  );
}
