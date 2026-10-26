// ★便 BTN（2026-10-26・Agoora）: 主ボタン中央の機械判定＝ブラウザ内で走る判定関数（verify-nox-actions-center が page.evaluate に渡す）。DB を知らない。
//   主操作ボタン＝data-primary を持つか、地の色が --primary のボタン（青塗り）。組＝同じ親の中に並ぶボタン（補助ボタンを含む）の外接矩形。
//   判定＝組の中心 x が親カード（.nox-panel／.nox-card／.nox-inset／モーダルの本体／section／form）の内側の中心 x ±8px 以内。
//   例外（裁定＝便 BTN ①）: 表の行内（table）・ヘッダー右上のツール（data-tools／.nox-phead-tools／ページ見出しの行）・モーダル下部の固定バー（position fixed／sticky）・
//   セグメント／タブ（.nox-seg・role=tablist＝選択状態の表示）・行内のスイッチ（.nox-onoff＝ON／OFF の状態）・ナビゲーション（nav／aside）・幅いっぱいのボタン（組の幅 ≥ カードの内幅 −16px＝中央と同じ）・許可列挙（data-actions-exempt＝理由つき）。
export type ActionsCenterHit = { text: string; reason: string | null; dx: number; ok: boolean; path: string };

/** page.evaluate に渡す関数（シリアライズされる＝外の変数を参照しない） */
export function actionsCenterProbe(tol: number): ActionsCenterHit[] {
  // --primary は .nox-dark などで上書きされる＝ボタンの親の中で解決する（親ごとに 1 回）
  const primCache = new Map<Element, string>();
  const primOf = (host: Element): string => {
    const hit = primCache.get(host); if (hit !== undefined) return hit;
    const probe = document.createElement("span"); probe.style.background = "var(--primary)"; probe.style.position = "absolute"; probe.style.width = "1px"; probe.style.height = "1px";
    host.appendChild(probe); const v = getComputedStyle(probe).backgroundColor; probe.remove(); primCache.set(host, v); return v;
  };
  const vis = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const pathOf = (el: Element): string => {
    const parts: string[] = []; let e: Element | null = el;
    for (let i = 0; e && i < 4; i++, e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""));
    return parts.join(" > ");
  };
  const fixedAncestor = (el: Element): boolean => { for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "fixed" || p === "sticky") return true; } return false; };
  const out: ActionsCenterHit[] = [];
  const btns = [...document.querySelectorAll("button, a")].filter((b) => vis(b) && (b.hasAttribute("data-primary") || (!!b.parentElement && getComputedStyle(b).backgroundColor === primOf(b.parentElement))));
  const seen = new Set<Element>();
  for (const b of btns) {
    const text = (b.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    const exempt = b.closest("[data-actions-exempt]");
    let reason: string | null = null;
    if (exempt) reason = `許可: ${exempt.getAttribute("data-actions-exempt")}`;
    else if (b.closest("table")) reason = "表の行内";
    else if (b.closest(".nox-seg, [role=tablist], [role=tab]")) reason = "セグメント／タブ";
    else if (b.closest(".nox-onoffwrap, .nox-onoff")) reason = "行内のスイッチ（ON／OFF）";
    else if (b.closest("[data-tools], .nox-phead-tools, .nox-tb, header")) reason = "ヘッダーのツール";
    else if (b.closest("nav, aside, [role=navigation]")) reason = "ナビゲーション";
    else if (fixedAncestor(b)) reason = "固定バー";
    const row = b.parentElement!;
    if (seen.has(row)) continue;
    seen.add(row);
    const group = [...row.children].filter((c) => (c.tagName === "BUTTON" || c.tagName === "A") && vis(c));
    const rects = group.map((g) => g.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
    const card = b.closest(".nox-panel, .nox-card, .nox-inset, .nox-modal-card, [data-card], section, form, [role=dialog]") ?? document.body;
    const cr = card.getBoundingClientRect(); const cs = getComputedStyle(card);
    const cl = cr.left + parseFloat(cs.paddingLeft || "0") + parseFloat(cs.borderLeftWidth || "0");
    const crr = cr.right - parseFloat(cs.paddingRight || "0") - parseFloat(cs.borderRightWidth || "0");
    const dx = Math.round((left + right) / 2 - (cl + crr) / 2);
    if (!reason && right - left >= crr - cl - 16) reason = "幅いっぱい";
    out.push({ text, reason, dx, ok: reason !== null || Math.abs(dx) <= tol, path: pathOf(row) });
  }
  return out;
}
