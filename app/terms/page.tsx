import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import * as t from "@/lib/nox/ui/theme";
import { TERMS_VERSION, TERMS_VERSION_LABEL, termsBlocksOf } from "@/lib/nox/terms";

// ★0172（裁定351・便 P172・2026-10-16）: 店舗向け利用規約＝docs/legal/terms_store_v0.9.md を build 時に読んで静的に出す（/lp と同じ force-static）。
//   弁護士確認前の雛形＝noindex・ナビにリンクを出さない（lp_plan L-2 ④）。本番 org の開通ゲート（/terms/accept）がここへ案内する。
export const metadata: Metadata = {
  title: `NOX 店舗向け利用規約 ${TERMS_VERSION_LABEL}`,
  robots: { index: false, follow: false },
};
export const dynamic = "force-static";

function termsMd(): string {
  return fs.readFileSync(path.join(process.cwd(), "docs", "legal", "terms_store_v0.9.md"), "utf8");
}

export default function TermsPage() {
  const blocks = termsBlocksOf(termsMd());
  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", padding: "20px 16px" }} data-terms-page="1">
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.8, fontSize: 14 }}>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }} data-terms-version={TERMS_VERSION}>版: {TERMS_VERSION_LABEL}</p>
        {blocks.map((b, i) => {
          if (b.kind === "h1") return <h1 key={i} style={{ fontSize: 20, fontWeight: 900, margin: "0 0 14px" }}>{b.text}</h1>;
          if (b.kind === "h2") return <h2 key={i} style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 6px", color: "var(--champ)" }}>{b.text}</h2>;
          if (b.kind === "hr") return <hr key={i} style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />;
          if (b.kind === "ol") return <ol key={i} style={{ margin: "0 0 8px", paddingLeft: 22 }}>{b.items?.map((s, j) => <li key={j}>{s}</li>)}</ol>;
          if (b.kind === "ul") return <ul key={i} style={{ margin: "0 0 8px", paddingLeft: 22 }}>{b.items?.map((s, j) => <li key={j}>{s}</li>)}</ul>;
          return <p key={i} style={{ margin: "0 0 8px" }}>{b.text ?? ""}</p>; // 規約の本文＝メッセージではない（ms(2-1) の RAW_PROP 形を避ける・E-16: JSX コメントは式の外に置かない）
        })}
        <p style={{ marginTop: 24 }}><Link href="/terms/accept" style={{ color: "var(--gold)" }}>同意画面へ</Link></p>
      </article>
    </main>
  );
}
