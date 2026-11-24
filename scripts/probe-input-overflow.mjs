// probe:input-overflow — ★起票156（2026-11-24・相談役の便【6】）: 入力欄の見切れの洗い出し。
//   全画面（店の側のページ＋?tab= の切り替え）で、欄の中の文字（値・空なら薄い文字）が欄の内側の幅を超えていないかを数える。PC（1280）と 375。
//   手元の dev（ポート 3200）を本番の DB で開く＝教訓160：ブラウザの側で GET／HEAD 以外は既定で止める（読む rpc も止まる＝欄の値は初期のまま）。
//   ログインは入力欄に打たない＝サーバ側の supabase-js でサインインして cookie だけ渡す（検査と同じ・トークンは出さない）。開いて見えている欄だけ（モーダルの中は数えない）。
//   使い方: node scripts/probe-input-overflow.mjs [幅…]（既定 1280 375）→ 一覧を標準出力と docs/tmp/input_overflow_<幅>.json に
process.loadEnvFile(".env.local");
import { chromium } from "playwright-core";
import { createServerClient } from "@supabase/ssr";
import fs from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3200";
const WIDTHS = process.argv.slice(2).map(Number).filter((n) => n > 0);
const PAGES = [
  "/dashboard", "/register", "/report", "/shift", "/casts", "/customers", "/payroll", "/staff", "/analytics", "/audit", "/billing", "/notices", "/receipts",
  "/master", "/master/products", "/master/categories", "/master/pricing", "/master/pricing?tab=rules", "/master/pricing?tab=checkout",
  "/master/cast-comp/plan", "/master/cast-comp/deduction", "/master/cast-comp/norma", "/master/cast-comp/register", "/master/referrers",
  "/master/seats", "/master/business-hours", "/master/stock", "/master/system",
  ...["info", "register", "shift", "pay", "mine", "tax", "data", "line"].map((t) => `/master/store-profile?tab=${t}`),
];
const jar = [];
const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false }, cookies: { getAll: () => jar, setAll: (cs) => { for (const c of cs) { const i = jar.findIndex((x) => x.name === c.name); if (i >= 0) jar.splice(i, 1); if (c.value) jar.push({ name: c.name, value: c.value }); } } } });
const { error } = await sb.auth.signInWithPassword({ email: process.env.PROBE_EMAIL ?? "nox-verify-owner-a@example.com", password: process.env.SEED_PASSWORD });
if (error) { console.error("サインインできない:", error.message); process.exit(1); }
const b = await chromium.launch({ channel: "msedge", headless: true });
let blocked = 0; const out = {};
for (const w of WIDTHS.length ? WIDTHS : [1280, 375]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: "/", sameSite: "Lax" })));
  const p = await ctx.newPage();
  await p.route("**/*", (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) ? r.continue() : (blocked++, r.abort())));
  const hits = [];
  for (const path of PAGES) {
    try { await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 }); await p.waitForTimeout(3500); } catch (e) { hits.push({ path, err: String(e.message).slice(0, 80) }); continue; }
    const found = await p.evaluate(() => {
      const cv = document.createElement("canvas").getContext("2d");
      const res = [];
      for (const el of document.querySelectorAll("input, textarea, select")) {
        const tp = (el.getAttribute("type") ?? "text").toLowerCase();
        if (["checkbox", "radio", "hidden", "range", "color", "file", "submit", "button"].includes(tp)) continue;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || el.closest("[role=dialog], dialog")) continue;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") continue;
        const isSel = el.tagName === "SELECT";
        const text = isSel ? (el.selectedOptions?.[0]?.text ?? "") : (el.value || el.getAttribute("placeholder") || "");
        if (!text) continue;
        cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const tw = Math.max(...text.split("\n").map((line) => cv.measureText(line).width));
        const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (isSel ? 18 : 0);
        if (el.tagName === "TEXTAREA" && cs.whiteSpace !== "nowrap") continue;   // 折り返す欄は数えない
        if (el.getAttribute("aria-label") === "今見ている店") continue; // 店の切り替えは狭い幅で … に省略する作り（上部バーの崩れの直し）
        if (tw > avail + 1) res.push({ kind: isSel ? "select" : el.value ? "value" : "placeholder", text: text.slice(0, 40), over: Math.round(tw - avail), w: Math.round(el.clientWidth), label: (el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.closest("label")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 30) });
      }
      return res;
    });
    for (const f of found) hits.push({ path, ...f });
  }
  out[w] = hits;
  fs.writeFileSync(`docs/tmp/input_overflow_${w}.json`, JSON.stringify(hits, null, 1));
  console.log(`== 幅 ${w}：はみ出し ${hits.filter((h) => !h.err).length} 件（開けなかった画面 ${hits.filter((h) => h.err).length}）`);
  for (const h of hits) console.log(h.err ? `  ${h.path} 開けない ${h.err}` : `  ${h.path}｜${h.kind}｜「${h.text}」｜${h.label}｜欄 ${h.w}px・はみ出し ${h.over}px`);
  await ctx.close();
}
console.log(`止めた通信 ${blocked}`);
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 4000))]);
process.exit(0);
