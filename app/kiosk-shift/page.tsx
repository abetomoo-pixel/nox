"use client";

// ★K client 第 2 便（2026-11-02 夜）: キオスクのタイル「シフト」＝共通の包み components/nox/kiosk-workspace.tsx（端末ログイン→操作担当→本体）。
import KioskWorkspace from "@/components/nox/kiosk-workspace";

export default function Page() {
  return <KioskWorkspace feature="shift" />;
}
