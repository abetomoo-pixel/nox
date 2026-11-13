import type { Metadata } from "next";
import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import * as t from "@/lib/nox/ui/theme";
import { PRIVACY_PUBLISHED_ON, PRIVACY_SOURCE, PRIVACY_VERSION, privacyBlocksOf, privacyPublishedOf } from "@/lib/nox/legal/privacy";

// ★2026-11-13（相談役【3】d）: プライバシーポリシー＝docs/legal/privacy_v0.5.md を build 時に読んで静的に出す（/terms と同じ force-static）。
//   公開は 0201f のフラグ便と同じか、そのあと＝それまでは PRIVACY_PUBLISHED_ON が null＝404（URL を直接開いても出ない・リンクも出さない）。
export const metadata: Metadata = {
  title: "NOX プライバシーポリシー",
};
export const dynamic = "force-static";

function privacyMd(): string {
  return fs.readFileSync(path.join(process.cwd(), ...PRIVACY_SOURCE.split("/")), "utf8");
}

const cell = { border: "1px solid var(--line)", padding: "6px 8px", verticalAlign: "top" as const, textAlign: "left" as const };

export default function PrivacyPage() {
  if (!privacyPublishedOf()) notFound();
  const blocks = privacyBlocksOf(privacyMd(), PRIVACY_PUBLISHED_ON);
  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", padding: "20px 16px" }} data-privacy-page="1" data-privacy-version={PRIVACY_VERSION}>
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.8, fontSize: 14 }}>
        {blocks.map((b, i) => {
          if (b.kind === "h1") return <h1 key={i} style={{ fontSize: 20, fontWeight: 900, margin: "0 0 14px" }}>{b.text}</h1>;
          if (b.kind === "h2") return <h2 key={i} style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 6px", color: "var(--champ)" }}>{b.text}</h2>;
          if (b.kind === "ul") return <ul key={i} style={{ margin: "0 0 8px", paddingLeft: 22 }}>{b.items.map((s, j) => <li key={j}>{s}</li>)}</ul>;
          if (b.kind === "table") return (
            <div key={i} style={{ overflowX: "auto", margin: "0 0 10px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead><tr>{b.head.map((h, j) => <th key={j} style={{ ...cell, fontWeight: 800 }}>{h}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={cell}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
          return <p key={i} style={{ margin: "0 0 8px" }}>{b.text ?? ""}</p>; // ポリシーの本文＝メッセージではない（/terms と同じ形）
        })}
      </article>
    </main>
  );
}
