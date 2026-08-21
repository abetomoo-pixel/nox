import type { Metadata, Viewport } from "next";
import { Inter, Lora, Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import "./globals.css";

// ── DP2 T1（2026-08-21・裁定 DP0-6）: フォントを mock/pages-2026-08 準拠へ ──────────
//   旧 canonical（Outfit / Zen Kaku Gothic New / Cormorant Garamond）は **canonical から降格**。
//   新 canonical＝**sans = Inter + Noto Sans JP** ／ **serif = Lora + Noto Serif JP**。
//   ★serif はモックの2役（`Georgia,serif` ＝ブランド/見出し と、register-pos の
//     `"Yu Mincho","Hiragino Mincho ProN",serif` ＝帳票明朝）を **--font-serif の1本へ統合**（DP0-6）。
//   ★読込方式も変更: 旧実装は globals.css の `@import url(fonts.googleapis.com…)`＝
//     実行時にブラウザが Google へ取りに行く形だった。next/font/google は**ビルド時に
//     自前ホストへ取り込む**ため、実行時の外部リクエストと FOUT が消える。
//   ★和文2本は `subsets` を指定しない＝next/font が Google の CSS を**サブセット絞り込み無し**で
//     取得し、日本語の unicode-range チャンクを含む全ファイルを自前ホストする。
//     `subsets` を付けると latin だけになり**和文の字形が落ちる**（font-data の subsets に
//     "japanese" が無いため）。subsets 無し＝`preload: false` が必須（next の制約）。
//     和文は初期表示に必須ではなく、必要な字形だけが unicode-range で遅延取得される。
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});
const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
});
const notoSerifJP = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  display: "swap",
  preload: false,
});
// 4本の CSS 変数を <html> に載せる。合成（--font-sans / --font-serif）は globals.css の :root。
const fontVars = `${inter.variable} ${notoSansJP.variable} ${lora.variable} ${notoSerifJP.variable}`;

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
  themeColor: "#080808",   // canonical --bg（globals.css .nox-dark と同値・E4 群4 で新パレットへ追随。メタデータは CSS var 不可＝リテラル必須）
  viewportFit: "cover",    // env(safe-area-inset-*) を効かせる（段A のボトムシートが使用）
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
