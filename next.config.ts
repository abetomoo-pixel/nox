import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ★出力先を環境変数で切り替え可能にする（既定は .next＝従来どおり）。
  //   dev サーバ稼働中に `next build` を同じ .next へ流すと、dev が配っている
  //   /_next/static/css・JS チャンクが本番出力で上書きされて 404 になり、
  //   画面が「完全に無スタイル＋クライアント取得が走らず 0 件」に見える（2026-07-27 実障害）。
  //   検証ビルドは `NEXT_DIST_DIR=.next-build npx next build` のように別ディレクトリへ出す。
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
