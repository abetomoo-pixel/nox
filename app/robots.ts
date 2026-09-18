import type { MetadataRoute } from "next";

// ★夜間便 N7-7（裁定273／277・2026-09-18）: robots＝LP（/）と /demo 以外は disallow。/demo 自身は metadata で noindex（入口は辿れるが索引しない）。
//   管理画面・マイページ・API・公開領収書（/r/…）は索引対象外。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/$", "/demo", "/demo/"], disallow: ["/"] },
    ],
  };
}
