import type { Metadata } from "next";

// ★0190 フラグ true 便 K-4（2026-10-30）: 端末（キオスク）配下は別 manifest＝ホーム画面に「NOX 端末」として追加（start_url /kiosk・ショートカット＝出退勤／レジ）。
//   本店側（/manifest.json・start_url /）とは別のアプリとして並べられる＝端末のタブレットで本店の入口を出さない。
export const metadata: Metadata = { manifest: "/manifest-kiosk.json" };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
