import type { Metadata, Viewport } from "next";
import "./globals.css";

// 純増⑤ 段4: PWA 最小（manifest／アイコン／themeColor／appleWebApp）。
// ★Service Worker は導入しない（裁定＝docs/NOX_運用runbook.md ④）。
//   POS の整合性優先＝SW キャッシュは古い伝票・在庫・価格表を見せうる／会計はサーバ権威で
//   オフライン書込は冪等キー・在庫トリガ・バック計算の一貫性を壊す／kiosk は常時接続前提。
//   得られるもの＝「ホーム画面に追加」で standalone 全画面（タブレット常設運用）。
export const metadata: Metadata = {
  title: "NOX",
  description: "ナイトワーク向け 会計・シフト・報酬管理",
  manifest: "/manifest.json",
  applicationName: "NOX",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,          // iOS でホーム画面から全画面起動
    title: "NOX",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false }, // 伝票の数値が電話番号リンク化されるのを防ぐ
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0B0F",   // canonical --bg（globals.css .nox-dark と同値）
  viewportFit: "cover",    // env(safe-area-inset-*) を効かせる（段A のボトムシートが使用）
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
