"use client";

// ★2026-11-22（相談役 17:50 の 2-a）: LINE Developers に貼る 2 つの URL（LIFF エンドポイント・Webhook）＝店の側（店舗設定 ＞ LINE 連携の「詳しい設定」）と
//   運営の代行（/ops/orgs/[id]/assist の ② LINE 連携）が同じ部品で出す。値は店の ID とサイトの origin から作る純関数（liffEntryUrlOf／webhookUrlOf）＝DB を読まない。
//   origin は呼び出し側で siteOriginOf を通した値を渡す（bend(1-4)＝発行する URL は site 固定の 1 値）。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { liffEntryUrlOf, webhookUrlOf } from "@/lib/nox/line/liff-endpoint";

/** 2 つの URL と、LINE の側のどこに貼るか（1 行ずつ） */
export const LINE_URL_ROWS = [
  { k: "liff", name: "LIFF エンドポイント URL", where: "LINE Developers の LINE ログインチャネル ＞ LIFF ＞ エンドポイント URL に貼る（サイズ Full・Scope openid）" },
  { k: "webhook", name: "Webhook URL", where: "LINE Developers の Messaging API チャネル ＞ Messaging API 設定 ＞ Webhook URL に貼る（Webhook の利用 ON・公式アカウントの応答メッセージ OFF）" },
] as const;

export default function LineUrls({ origin, storeId }: { origin: string; storeId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, v: string) => { void navigator.clipboard?.writeText(v).then(() => setCopied(k)).catch(() => undefined); };
  return (
    <>
      {LINE_URL_ROWS.map(({ k, name, where }) => {
        const v = k === "liff" ? liffEntryUrlOf(origin, storeId) : webhookUrlOf(origin, storeId);
        return (
          <div key={k} style={{ display: "grid", gap: 2, fontSize: 12 }} data-line-url-row={k}>
            <span style={{ color: "var(--ink)", fontWeight: 700 }}>{name}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><code style={{ fontSize: 11.5, wordBreak: "break-all" }} data-line-url={k}>{v}</code><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => copy(k, v)}>{copied === k ? "コピーしました ✓" : "コピー"}</button></span>
            <span style={{ color: "var(--sub)", fontSize: 11.5 }} data-line-url-where={k}>{where}</span>
          </div>
        );
      })}
    </>
  );
}
