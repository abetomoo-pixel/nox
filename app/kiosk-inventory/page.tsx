"use client";

// ★0190 フラグ true 便（裁定435）: キオスクのタイル「inventory」の行き先＝案内画面（本体は K client 第 2 便）。共通部品 components/nox/kiosk-feature-page.tsx。
// ★0194（裁定445 ③・2026-11-04）: 本体＝共通の包み KioskWorkspace（端末ログイン→操作担当→在庫の読取 kiosk_stock_levels）。フラグ false は案内のまま。
import KioskFeaturePage from "@/components/nox/kiosk-feature-page";
import KioskWorkspace from "@/components/nox/kiosk-workspace";
import { mig0194On } from "@/lib/nox/rules-0175/flag";

export default function Page() {
  return mig0194On() ? <KioskWorkspace feature="inventory" /> : <KioskFeaturePage feature="inventory" />;
}
