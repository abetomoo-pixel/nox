"use client";

// ★0190 フラグ true 便（裁定435）: キオスクのタイル「report」の行き先＝案内画面（本体は K client 第 2 便）。共通部品 components/nox/kiosk-feature-page.tsx。
import KioskFeaturePage from "@/components/nox/kiosk-feature-page";

export default function Page() {
  return <KioskFeaturePage feature="report" />;
}
