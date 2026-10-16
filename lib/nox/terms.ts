// ★0172（裁定351・便 P172・2026-10-16）: 店舗向け利用規約（雛形 v0.9）の版と同意ゲートの純関数。
//   正本の本文＝docs/legal/terms_store_v0.9.md（/terms が build 時に読む＝force-static・/lp の public/lp 読取と同じ土台）。
//   同意＝terms_acceptances（org 単位・owner・冪等）＝RPC terms_accept(p_version)／判定＝terms_accepted_version_ok(p_version)（デモ org は常に true）。
//   ゲートの置き場＝(manage)/layout の org 読取直後（裁定351 案のとおり）＝本番 org（is_demo=false）で未同意なら /terms/accept へ。
//   DB 不触・env 不要＝suite p172 が pin。

/** 現行の規約版（terms_acceptances.terms_version に入る値）。版を上げる＝再同意（第14条 2 項） */
export const TERMS_VERSION = "0.9";
/** 画面に出す版表示（雛形＝弁護士確認前） */
export const TERMS_VERSION_LABEL = "v0.9（雛形・弁護士確認前）";
export const TERMS_PATH = "/terms";
export const TERMS_ACCEPT_PATH = "/terms/accept";

/** 同意ゲート: 本番 org（isDemo=false）で現行版の同意が無ければ /terms/accept へ。デモ org・同意済み・/terms 配下は通す */
export function termsGateRedirectOf(isDemo: boolean, acceptedOk: boolean | null | undefined, pathname: string): string | null {
  if (isDemo) return null;
  if (acceptedOk === true) return null;
  if (pathname === TERMS_PATH || pathname.startsWith(TERMS_PATH + "/")) return null;
  return TERMS_ACCEPT_PATH;
}

/** 規約の md（docs/legal）→ 表示ブロック（h1／h2／段落／番号付き・箇条書き）。マークダウンの装飾（**・【】）は文字のまま＝太字だけ外す */
export type TermsBlock = { kind: "h1" | "h2" | "p" | "ol" | "ul" | "hr"; text?: string; items?: string[] };
export function termsBlocksOf(md: string): TermsBlock[] {
  const out: TermsBlock[] = [];
  const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").trim();
  let list: { kind: "ol" | "ul"; items: string[] } | null = null;
  const flush = () => { if (list) { out.push({ kind: list.kind, items: list.items }); list = null; } };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") { flush(); continue; }
    if (line.startsWith("# ")) { flush(); out.push({ kind: "h1", text: strip(line.slice(2)) }); continue; }
    if (line.startsWith("## ")) { flush(); out.push({ kind: "h2", text: strip(line.slice(3)) }); continue; }
    if (line.trim() === "---") { flush(); out.push({ kind: "hr" }); continue; }
    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    if (ol) { if (!list || list.kind !== "ol") { flush(); list = { kind: "ol", items: [] }; } list.items.push(strip(ol[2])); continue; }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if (!list || list.kind !== "ul") { flush(); list = { kind: "ul", items: [] }; } list.items.push(strip(ul[1])); continue; }
    flush(); out.push({ kind: "p", text: strip(line) });
  }
  flush();
  return out;
}
