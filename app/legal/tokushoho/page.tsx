import type { Metadata } from "next";
import Link from "next/link";
import * as t from "@/lib/nox/ui/theme";
import { TOKUSHOHO_ROWS, TOKUSHOHO_TITLE } from "@/lib/nox/legal/tokushoho";

// 特定商取引法に基づく表示（2026-11-10 確定文面＝lib/nox/legal/tokushoho.ts が正本）。ログイン不要の公開ページ（保護パスに入らない）。
export const metadata: Metadata = { title: `${TOKUSHOHO_TITLE}｜NOX` };
export const dynamic = "force-static";

export default function TokushohoPage() {
  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", padding: "20px 16px" }} data-tokushoho-page="1">
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.8, fontSize: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 14px" }}>{TOKUSHOHO_TITLE}</h1>
        <dl style={{ margin: 0, display: "grid", gap: 0, borderTop: "1px solid var(--line)" }} data-tokushoho-rows={TOKUSHOHO_ROWS.length}>
          {TOKUSHOHO_ROWS.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 11em) minmax(0, 1fr)", gap: "4px 16px", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <dt style={{ color: "var(--sub)", fontWeight: 700 }}>{k}</dt>
              <dd style={{ margin: 0, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{v}</dd>
            </div>
          ))}
        </dl>
        <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}><Link href="/lp" style={{ color: "var(--gold)" }}>NOX のご紹介</Link></p>
      </article>
    </main>
  );
}
