/*
 * verify:nox-ops-contrast — 運営コンソール 版 1 の「読める」の検査（2026-11-21 夕・相談役 16:15）。
 *  背景: 本番の /ops/orgs/[id] が、器（OpsShell）に店の暗い配色（.nox-dark）が無く、地は body の明るい色・文字は黒のまま・カードだけ暗い固定色＝カードの中の文字が読めなかった。
 *  作り: 運営の 5 画面（/ops/login・/ops/mfa（登録・6 桁）・/ops（一覧）・/ops/orgs/new・/ops/orgs/[id]）を、本物の部品（app/ops の tsx）を react-dom/server で静的に描き、
 *        app/globals.css を載せて Edge（playwright-core・channel msedge）に入れる。運営者のセッションも DB も使わない（本番に運営者を作らない・DB は読まない）。
 *        幅 375 と 1024・OS の表示設定 light と dark の 4 通りで写しを撮り（docs/tmp/ops_contrast/）、文字のある全要素について
 *        文字の色と実際の地（祖先の地の色・グラデの全色・透明度を重ねた最悪の組）の明るさの比を数える。
 *  合格: c(1) 全画面の全文字が 4.5 以上（大きい文字＝24px 以上か 18.66px 以上の太字は 3.0 以上）・押せない状態のボタンも数える（Agoora が「保存」を薄い灰色と見た）。
 *        c(2) light と dark で、全要素の文字の色と地の色が一字一致（OS の設定で見た目が変わらない）。
 *        c(3) 横のはみ出しが無い（文書の幅 ≤ 画面の幅）。
 *        c(4) 器の源：OpsShell の根に nox-dark と t.appBg・ログインと MFA の根に nox-dark（源の pin）。
 *        c(6) 検査が元の不具合を拾う（器の配色を外した詳細＝直す前の形は赤）。
 *        c(5) パスワードを決めた後の行き先：invite-accept が運営者（ops_operators の有効な行）だけ /ops/login・set-password は dest に従う（知らない値は /dashboard）。
 *  使い方: npm run verify:nox-ops-contrast（--keep で写しを残したまま・既定でも残す＝docs/tmp は scratch）
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { chromium, type Browser } from "playwright-core";
import OpsLoginForm from "../app/ops/login/login-form";
import OpsMfaForm from "../app/ops/mfa/mfa-form";
import OpsShell from "../app/ops/ops-shell";
import OrgList from "../app/ops/org-list";
import NewOrgFormView from "../app/ops/orgs/new/new-org-form";
import OrgDetail, { type OpsLogRow } from "../app/ops/orgs/[id]/org-detail";
import type { OpsOrgRow } from "../lib/nox/ops/labels";

(globalThis as { React?: unknown }).React = React; // tsx は tsconfig の jsx: preserve を古い形（React.createElement）で変換する＝部品の中の React を global で渡す
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else { fail++; console.log(`  FAIL: ${name}${detail ? ": " + detail : ""}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");
const OUT = "docs/tmp/ops_contrast";
fs.mkdirSync(OUT, { recursive: true });

// ── 見本の行（DB は読まない・金額の列は版 1 に無い）──
const base: OpsOrgRow = {
  org_id: "00000000-0000-4000-8000-000000000001", org_name: "TEST CLUB", kind: "tester", store_count: 1, billing_status: null, trial_ends_at: null, has_subscription: false,
  agency_code: null, onboarding_state: "onboarding", onboarding_done_at: null, owner_email: "owner@example.test", owner_invited_at: "2026-11-21T05:41:15Z", owner_accepted: false,
  setup_done_stores: 0, setup_step_max: 3, setup_draft_at: "2026-11-21T06:00:00Z", line_login_stores: 0, line_notify_stores: 0, line_richmenu_stores: 0, line_links: 0,
  cast_count: 0, staff_count: 0, last_used_at: null, created_at: "2026-11-21T05:41:16Z",
};
const rows: OpsOrgRow[] = [
  base,
  { ...base, org_id: "00000000-0000-4000-8000-000000000002", org_name: "CLUB 見本 お試し", kind: "trial", trial_ends_at: "2026-12-21T05:41:16Z", agency_code: "AG-001", onboarding_state: "done", onboarding_done_at: "2026-11-21T05:42:00Z", owner_accepted: true, setup_done_stores: 1, cast_count: 12, staff_count: 3, last_used_at: "2026-11-21T06:30:00Z" },
  { ...base, org_id: "00000000-0000-4000-8000-000000000003", org_name: "DEMO 見本", kind: "demo", owner_email: null, owner_invited_at: null, owner_accepted: null },
];
const logs: OpsLogRow[] = [
  { id: "l1", at: "2026-11-21T05:41:16Z", who: "Agoora", action: "ops.org.create", before: null, after: { org_name: "TEST CLUB" }, reason: null },
  { id: "l2", at: "2026-11-21T05:42:00Z", who: "Agoora", action: "ops.agency_code", before: { agency_code: null }, after: { agency_code: "AG-001" }, reason: null },
];
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const wrap = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));
const SCREENS: { key: string; html: string }[] = [
  { key: "login", html: wrap(React.createElement(OpsLoginForm)) },
  { key: "mfa-enroll", html: wrap(React.createElement(OpsMfaForm, { initial: { kind: "enroll", factorId: "f", qr: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret: "JBSWY3DPEHPK3PXP" } })) },
  { key: "mfa-verify", html: wrap(React.createElement(OpsMfaForm, { initial: { kind: "verify", factorId: "f" } })) },
  { key: "list", html: wrap(React.createElement(OpsShell, { name: "Agoora", children: React.createElement(OrgList, { rows }) })) },
  { key: "new", html: wrap(React.createElement(OpsShell, { name: "Agoora", children: React.createElement(NewOrgFormView) })) },
  { key: "detail", html: wrap(React.createElement(OpsShell, { name: "Agoora", children: React.createElement(OrgDetail, { row: base, logs }) })) },
  { key: "detail-done", html: wrap(React.createElement(OpsShell, { name: "Agoora", children: React.createElement(OrgDetail, { row: rows[1], logs }) })) },
];
const css = src("app/globals.css");
const docOf = (body: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`;

// ── ブラウザの中で数える（文字のある要素ごとに、文字の色・地の候補・比）──
type Probe = { sel: string; text: string; fg: string; bgs: string[]; ratio: number; need: number; size: number };
const PROBE = `(() => {
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

async function main() {
let browser: Browser | null = null;
try {
  // c(4)・c(5) 源の pin
  const shell = src("app/ops/ops-shell.tsx"), login = src("app/ops/login/login-form.tsx"), mfa = src("app/ops/mfa/mfa-form.tsx");
  check("c(4-1) OpsShell の根＝nox-dark＋nox-ops＋t.appBg（店の画面と同じ配色の決まり）", shell.includes('<div className="nox-dark nox-ops" data-ops-shell="1" style={t.appBg}>') && !shell.includes('background: "var(--bg)" }}>'));
  check("c(4-2) ログインと MFA の根＝nox-dark＋nox-ops（t.loginBg）", login.includes('<main className="nox-dark nox-ops" style={t.loginBg} data-ops-login="1">') && mfa.includes('<main className="nox-dark nox-ops" style={t.loginBg} data-ops-mfa={phase.kind}>'));
  const g = src("app/globals.css");
  check("c(4-5) /ops の中だけの上げ＝.nox-ops の青（--primary-hover）と押せないボタン（減光しない・灰色の地と --sub）・店の .nox-dark の値は変えていない",
    g.includes(".nox-ops { --primary: var(--primary-hover); }") && g.includes(".nox-ops button:disabled { opacity: 1; background: var(--card2) !important; border-color: var(--line2) !important; color: var(--sub) !important; }")
    && g.includes("  --primary: #2f7fe7;") && g.includes("button:disabled, .nox-btn:disabled { opacity: .45; cursor: not-allowed; }"));
  check("c(4-3) 配色を OS の設定で変える決まりが無い（prefers-color-scheme が globals.css と app/ops に無い）",
    !/prefers-color-scheme/.test(src("app/globals.css")) && ![shell, login, mfa, src("app/ops/org-list.tsx"), src("app/ops/orgs/new/new-org-form.tsx"), src("app/ops/orgs/[id]/org-detail.tsx")].some((s) => /prefers-color-scheme|colorScheme/.test(s)));
  check("c(4-4) MFA の initial は検査だけ（page.tsx は渡さない）", src("app/ops/mfa/page.tsx").includes("return <OpsMfaForm />;") && mfa.includes("if (initial) return;"));
  const ia = src("app/api/auth/invite-accept/route.ts"), sp = src("app/auth/set-password/page.tsx");
  check("c(5-1) invite-accept：パスワードを変えた後に運営者（有効な行）だけ /ops/login・それ以外は /dashboard",
    ia.includes('const { data: op } = await admin.from("ops_operators").select("auth_user_id").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();')
    && ia.includes('return NextResponse.json({ ok: true, dest: op ? "/ops/login" : "/dashboard" });')
    && ia.indexOf("updateUserById(user.id, { password })") < ia.indexOf('from("ops_operators")'));
  check("c(5-2) set-password：dest に従う（知らない値は /dashboard）", sp.includes('window.location.href = j.dest === "/ops/login" ? "/ops/login" : "/dashboard";'));
  check("c(5-3) /login と /auth/forgot は運営者を見ない（応答の差を作らない）", !/ops_operators|\/ops\//.test(src("app/login/page.tsx")) && !/ops_operators|\/ops\//.test(src("app/auth/forgot/page.tsx")));

  // c(1)〜c(3) 画面
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const summary: string[] = [];
  for (const sc of SCREENS) {
    const per: Record<string, Probe[]> = {};
    for (const w of [375, 1024]) {
      for (const scheme of ["light", "dark"] as const) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, locale: "ja-JP" });
        const page = await ctx.newPage();
        await page.setContent(docOf(sc.html), { waitUntil: "load" });
        const r = (await page.evaluate(PROBE)) as { probes: Probe[]; docW: number; vw: number };
        await page.screenshot({ path: path.join(OUT, `${sc.key}_${w}_${scheme}.png`), fullPage: true });
        await ctx.close();
        per[`${w}_${scheme}`] = r.probes;
        const bad = r.probes.filter((p) => p.ratio < p.need);
        check(`c(1) ${sc.key} ${w} ${scheme}：文字 ${r.probes.length} 個がすべて基準以上`, r.probes.length > 0 && bad.length === 0, bad.slice(0, 4).map((p) => `${p.sel}「${p.text}」${p.fg} on ${p.bgs.join("|")} = ${p.ratio}（要 ${p.need}）`).join(" ／ "));
        check(`c(3) ${sc.key} ${w} ${scheme}：横のはみ出し無し`, r.docW <= r.vw, `文書 ${r.docW} > 画面 ${r.vw}`);
        if (scheme === "light") summary.push(`${sc.key} ${w}：文字 ${r.probes.length}・最小の比 ${Math.min(...r.probes.map((p) => p.ratio)).toFixed(2)}`);
      }
      const a = JSON.stringify(per[`${w}_light`].map((p) => [p.sel, p.text, p.fg, p.bgs]));
      const b = JSON.stringify(per[`${w}_dark`].map((p) => [p.sel, p.text, p.fg, p.bgs]));
      check(`c(2) ${sc.key} ${w}：light と dark で文字と地の色が一致`, a === b);
    }
  }
  // c(6) 検査が元の不具合を拾うこと：器の配色（nox-dark nox-ops）を外した詳細の画面（11/21 16:15 に本番で見えた形）は赤になる
  {
    const broken = SCREENS.find((x) => x.key === "detail")!.html.replace('class="nox-dark nox-ops"', 'class=""');
    const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, colorScheme: "light", locale: "ja-JP" });
    const page = await ctx.newPage();
    await page.setContent(docOf(broken), { waitUntil: "load" });
    const r = (await page.evaluate(PROBE)) as { probes: Probe[] };
    await page.screenshot({ path: path.join(OUT, "detail_375_broken_before.png"), fullPage: true });
    await ctx.close();
    const bad = r.probes.filter((p) => p.ratio < p.need);
    const min = Math.min(...r.probes.map((p) => p.ratio));
    check("c(6) 器の配色を外した詳細（直す前の形）は赤＝検査が「読めない」を拾う", broken !== SCREENS.find((x) => x.key === "detail")!.html && bad.length >= 10 && min < 2, `外れ ${bad.length}・最小 ${min}`);
    summary.push(`直す前の形（detail 375）：外れ ${bad.length} 個・最小の比 ${min.toFixed(2)}`);
  }
  for (const s of summary) console.log(`  ${s}`);
  console.log(`  写し：${OUT}/（画面_幅_light|dark.png）`);
} catch (e) {
  fail++; console.log(`  FAIL: 例外 ${(e as Error).message}`);
} finally {
  if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
}
}
void main().then(() => {
if (fail) { console.log(`verify:nox-ops-contrast FAIL ${fail} / pass ${pass}`); process.exit(1); }
console.log(`verify:nox-ops-contrast OK (${pass} checks)`);
process.exit(0);
});
