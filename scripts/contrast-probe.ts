// contrast-probe.ts（2026-11-21 夜）— 画面の「読める」の数え方（verify:nox-ops-contrast と verify:nox-shop-contrast で共通）。
//   文字のある全要素について、文字の色と実際の地（祖先の地の色・グラデの全色・透明度を重ねた最悪の組）の明るさの比を数える。基準 4.5（大きい文字＝24px 以上か 18.66px 以上の太字は 3.0）。
import fs from "node:fs";
export const docOf = (body: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fs.readFileSync("app/globals.css", "utf8")}</style></head><body>${body}</body></html>`;
// ── ブラウザの中で数える（文字のある要素ごとに、文字の色・地の候補・比）──
export type Probe = { sel: string; text: string; fg: string; bgs: string[]; ratio: number; need: number; size: number };
export const PROBE = `(() => {
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const allColors = (s) => (s.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(Boolean);
  const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + (c.a < 1 ? '/' + c.a.toFixed(2) : '');
  const out = [];
  const els = Array.from(document.body.querySelectorAll('*'));
  for (const el of els) {
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    const isField = (el.tagName === 'INPUT' && !['hidden', 'checkbox', 'radio'].includes(el.type) && el.value) || (el.tagName === 'SELECT');
    const text = own || (isField ? (el.value || (el.options && el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '')) : '');
    if (!text) continue;
    const cs = getComputedStyle(el); const rect = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
    let hidden = false; for (let p = el; p; p = p.parentElement) { if (getComputedStyle(p).display === 'none') { hidden = true; break; } } if (hidden) continue;
    // 地の候補：根から順に重ねる（グラデは全色を候補に・候補は 24 個まで）
    const chain = []; for (let p = el; p; p = p.parentElement) chain.unshift(p);
    let cands = [{ r: 255, g: 255, b: 255, a: 1 }];
    let opacity = 1;
    for (const p of chain) {
      const s = getComputedStyle(p); opacity *= Number(s.opacity);
      const grads = s.backgroundImage && s.backgroundImage !== 'none' ? allColors(s.backgroundImage) : [];
      const bc = parse(s.backgroundColor);
      if (bc && bc.a > 0) cands = cands.map((c) => over(bc, c));
      if (grads.length) { const n = []; for (const c of cands) for (const g of grads) n.push(over(g, c)); cands = n.slice(0, 24); }
    }
    let fg = parse(cs.color); fg = { ...fg, a: fg.a * opacity };
    let worst = Infinity;
    for (const c of cands) { const f = over(fg, c); worst = Math.min(worst, ratio(f, c)); }
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const sel = el.tagName.toLowerCase() + (el.getAttribute('data-ops-msg') ? '[msg]' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    out.push({ sel, text: text.slice(0, 24), fg: hex(parse(cs.color)) + (opacity < 1 ? ' op' + opacity.toFixed(2) : ''), bgs: [...new Set(cands.map(hex))].slice(0, 4), ratio: Math.round(worst * 100) / 100, need, size });
  }
  return { probes: out, docW: document.documentElement.scrollWidth, vw: window.innerWidth };
})()`;

