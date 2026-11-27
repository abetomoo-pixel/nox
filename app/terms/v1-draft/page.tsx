import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import * as t from "@/lib/nox/ui/theme";
import { termsBlocksOf } from "@/lib/nox/terms";

// ★2026-11-27（相談役 15:30・Agoora 15:24）: 利用規約 v1.0 の案の確認用ページ（弁護士確認中）。
//   docs/legal/terms_store_v1.0_draft.md を build 時に読んで /terms と同じ出し方で出す（頭の HTML のコメントは出さない・本文は変えない）。
//   どこからもリンクしない・noindex・ログインなしで開ける。/terms（v0.9）・lib/nox/terms.ts の版・同意の門・terms_acceptances は指さない＝変えない。
export const metadata: Metadata = {
  title: "NOX 店舗向け利用規約 v1.0（案・弁護士確認中）",
  robots: { index: false, follow: false },
};
export const dynamic = "force-static";

function draftMd(): string {
  const raw = fs.readFileSync(path.join(process.cwd(), "docs", "legal", "terms_store_v1.0_draft.md"), "utf8");
  return raw.replace(/^﻿?\s*<!--[\s\S]*?-->\s*/, ""); // 頭の HTML のコメント（社内の覚え）だけ外す
}

export default function TermsV1DraftPage() {
  const blocks = termsBlocksOf(draftMd());
  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", padding: "20px 16px" }} data-terms-draft-page="v1.0">
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.8, fontSize: 14 }}>
        <p role="note" data-terms-draft-banner="1" style={{ margin: "0 0 14px", padding: "10px 12px", border: "1px solid var(--bad)", borderRadius: 8, color: "var(--bad)", fontWeight: 800, fontSize: 14 }}>
          案・弁護士確認中（この文はまだ効力がありません）
        </p>
        {blocks.map((b, i) => {
          if (b.kind === "h1") return <h1 key={i} style={{ fontSize: 20, fontWeight: 900, margin: "0 0 14px" }}>{b.text}</h1>;
          if (b.kind === "h2") return <h2 key={i} style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 6px", color: "var(--champ)" }}>{b.text}</h2>;
          if (b.kind === "hr") return <hr key={i} style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />;
          if (b.kind === "ol") return <ol key={i} style={{ margin: "0 0 8px", paddingLeft: 22 }}>{b.items?.map((s, j) => <li key={j}>{s}</li>)}</ol>;
          if (b.kind === "ul") return <ul key={i} style={{ margin: "0 0 8px", paddingLeft: 22 }}>{b.items?.map((s, j) => <li key={j}>{s}</li>)}</ul>;
          return <p key={i} style={{ margin: "0 0 8px" }}>{b.text ?? ""}</p>; // 規約の案の本文＝メッセージではない（/terms と同じ形）
        })}
      </article>
    </main>
  );
}
