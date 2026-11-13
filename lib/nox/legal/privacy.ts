// ★2026-11-13（相談役【3】d・裁定499 候補）: プライバシーポリシー＝docs/legal/privacy_v0.5.md（Agoora の版・文言は変えない）を /privacy に出す。
//   公開は 0201f のフラグ便と同じか、そのあと。公開するまでは PRIVACY_PUBLISHED_ON を null にしておく＝ページは 404・リンクは出さない（URL を直接開いても出ない）。
//   公開の便で PRIVACY_PUBLISHED_ON に公開の日（'YYYY-MM-DD'・JST）を入れる＝本文の「制定日：{{公開日}}」に入る。
export const PRIVACY_PATH = "/privacy";
export const PRIVACY_SOURCE = "docs/legal/privacy_v0.5.md";
export const PRIVACY_VERSION = "0.5";
/** 公開の日（null＝公開していない）。 */
export const PRIVACY_PUBLISHED_ON: string | null = null;

export function privacyPublishedOf(publishedOn: string | null = PRIVACY_PUBLISHED_ON): boolean {
  return publishedOn !== null && /^\d{4}-\d{2}-\d{2}$/.test(publishedOn);
}

/** 'YYYY-MM-DD' → 「2026 年 11 月 20 日」 */
export function privacyDateJaOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

export type PrivacyBlock =
  | { kind: "h1" | "h2" | "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

/** Markdown（見出し・段落・箇条書き・表だけ）→ ブロック。{{公開日}} は publishedOn の和文に置き換える（null なら置き換えない） */
export function privacyBlocksOf(md: string, publishedOn: string | null = PRIVACY_PUBLISHED_ON): PrivacyBlock[] {
  const text = publishedOn ? md.replace(/\{\{公開日\}\}/g, privacyDateJaOf(publishedOn)) : md;
  const lines = text.replace(/\r/g, "").split("\n");
  const out: PrivacyBlock[] = [];
  const cells = (l: string): string[] => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "") continue;
    if (l.startsWith("# ")) { out.push({ kind: "h1", text: l.slice(2).trim() }); continue; }
    if (l.startsWith("## ")) { out.push({ kind: "h2", text: l.slice(3).trim() }); continue; }
    if (l.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) { items.push(lines[i].slice(2).trim()); i++; }
      i--; out.push({ kind: "ul", items }); continue;
    }
    if (l.trim().startsWith("|")) {
      const rowsRaw: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rowsRaw.push(lines[i]); i++; }
      i--;
      const head = cells(rowsRaw[0]);
      const body = rowsRaw.slice(1).filter((r) => !/^\s*\|?\s*-{3,}/.test(r)).map(cells);
      out.push({ kind: "table", head, rows: body });
      continue;
    }
    out.push({ kind: "p", text: l.trim() });
  }
  return out;
}
