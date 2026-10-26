/*
 * verify:nox-actions-center — 便 BTN（2026-10-26・Agoora）: 主ボタン中央の機械判定（教訓122）。
 *  dev サーバ（NOX_UI_BASE・既定 http://localhost:3200＝無ければこの suite が next dev を起動して終わりに止める）に Edge（playwright-core・channel msedge）で入り、
 *  verify の fixture（NOX-VERIFY-A1 のオーナー／キャスト＝パスワードは .env.local の SEED_PASSWORD・localhost の dev だけ）でログインし、主要画面を 1,280 と 390 で開き、lib/nox/ui/actions-center-probe の判定を走らせる。
 *  画面＝マスタ全タブ（各ページのセグメントの ?tab= も辿る）・給与・勤怠・シフト各タブ・レジ・日報・/mine・キオスク（打刻／レジ＝端末ログイン前の画面＝fixture に端末が無い）。外れ（例外以外で |dx| > 8px）が 1 つでもあれば赤。
 *  fixture の org（NOX-VERIFY）は規約の同意（terms_acceptances）が無い＝管理画面が同意ページへ飛ぶ＝走査の間だけ同意の行を足し、終わりに必ず消す（DB 残留 0・教訓49＝teardown は失敗を投げる）。
 *  使い方: npm run verify:nox-actions-center（--list で全件・--report で違反の一覧だけ出して終了コード 0）
 */
import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { actionsCenterProbe, type ActionsCenterHit } from "../lib/nox/ui/actions-center-probe";
import { FIXTURE_USERS } from "./fixtures-f0";
import pg from "pg";
process.loadEnvFile(".env.local");

const BASE = process.env.NOX_UI_BASE ?? "http://localhost:3200";
const TOL = 8;
const LIST = process.argv.includes("--list");
const REPORT = process.argv.includes("--report");
const WIDTHS = [1280, 390] as const;
const OWNER_PAGES = [
  "/master", "/master/business-hours", "/master/cast-comp", "/master/cast-comp/deduction", "/master/cast-comp/norma", "/master/cast-comp/plan", "/master/cast-comp/register",
  "/master/cast-comp/systems", "/master/categories", "/master/pricing", "/master/products", "/master/referrers", "/master/seats", "/master/stock", "/master/store-profile", "/master/system",
  "/payroll", "/payroll?tab=attendance",
  "/shift?tab=today", "/shift?tab=make", "/shift?tab=roster", "/shift?tab=queue", "/shift?tab=submit", "/shift?tab=publish",
  "/register", "/report",
];
const CAST_PAGES = ["/mine", "/mine/wishes"];
const ONLY = process.env.NOX_UI_ONLY ?? null; // 例 NOX_UI_ONLY=/master/cast-comp/norma（1 画面だけ・オーナー）
const KIOSK_PAGES = ["/kiosk", "/kiosk-register"];

const bounded = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]); // Edge の close が戻らないことがある＝上限つき
async function up(): Promise<boolean> { try { const r = await fetch(`${BASE}/login`, { redirect: "manual" }); return r.status > 0; } catch { return false; } }
async function ensureServer(): Promise<ChildProcess | null> {
  if (await up()) return null;
  const port = new URL(BASE).port || "3200";
  const p = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", port], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await up()) return p; }
  p.kill(); throw new Error("dev サーバが起動しませんでした");
}
async function enter(page: Page, key: keyof typeof FIXTURE_USERS | null): Promise<void> {
  if (!key) return; // キオスク＝端末ログイン前の画面
  const host = new URL(BASE).hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) throw new Error("fixture のログインは localhost の dev だけ");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => !!document.querySelector("form") && Object.keys(document.querySelector("form") as object).some((k) => k.startsWith("__react")), null, { timeout: 60_000 }); // 水和の後に送る（前だと素の GET になる）
  const inputs = page.locator("form input");
  await inputs.nth(0).fill(FIXTURE_USERS[key].email);
  await inputs.nth(1).fill(process.env.SEED_PASSWORD ?? "");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.locator("form button[type=submit]").click()]);
}
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
}
async function tabsOf(page: Page, path: string): Promise<string[]> {
  const base = path.split("?")[0];
  return page.evaluate((b) => [...new Set([...document.querySelectorAll(".nox-seg a[href], [role=tablist] a[href]")].map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
    .filter((h) => h.startsWith(b + "?tab=") || h.startsWith(b + "?") && h.includes("tab=")))], base);
}

const results: { url: string; w: number; hit: ActionsCenterHit }[] = [];
async function scan(page: Page, url: string, w: number) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page);
  const hits = await page.evaluate(actionsCenterProbe, TOL);
  process.stderr.write(`  ${w} ${url} 組 ${hits.length}・違反 ${hits.filter((h) => !h.ok).length}
`);
  for (const h of hits) results.push({ url, w, hit: h });
}

async function main(): Promise<void> {
let server: ChildProcess | null = null; let browser: Browser | null = null;
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
let termsRow: string | null = null;
try {
  await db.connect();
  const own = (await db.query("select u.id, u.org_id from public.users u where u.email = $1", [FIXTURE_USERS.ownerA.email])).rows[0] as { id: string; org_id: string };
  const ver = (/export const TERMS_VERSION = \"([^\"]+)\"/.exec(fs.readFileSync("lib/nox/terms.ts", "utf8")) ?? [])[1];
  const has = (await db.query("select 1 from public.terms_acceptances where org_id = $1 and terms_version = $2", [own.org_id, ver])).rowCount;
  if (!has) termsRow = (await db.query("insert into public.terms_acceptances (org_id, terms_version, accepted_by) values ($1, $2, $3) returning id", [own.org_id, ver, own.id])).rows[0].id as string;
  server = await ensureServer();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const plan = ONLY ? [[(process.env.NOX_UI_USER ?? "ownerA") as "ownerA", [ONLY], false]] as const : [["ownerA", OWNER_PAGES, true], ["castA1a", CAST_PAGES, false], [null, KIOSK_PAGES, false]] as const;
  for (const [key, pages, follow] of plan) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      await ctx.addInitScript({ content: "window.__name = (f) => f;" }); // tsx（esbuild keepNames）が関数に付ける __name をページ側で無害に
      const page = await ctx.newPage();
      await enter(page, key);
      const done = new Set<string>();
      const queue = [...pages];
      while (queue.length) {
        const u = queue.shift()!; if (done.has(u)) continue; done.add(u);
        await scan(page, u, w);
        if (follow && u.startsWith("/master")) for (const t of await tabsOf(page, u)) if (!done.has(t) && done.size + queue.length < 80) queue.push(t);
      }
      await bounded(ctx.close(), 10_000);
    }
  }
} finally {
  if (browser) await bounded(browser.close().catch(() => undefined), 15_000);
  if (server) server.kill();
  if (termsRow) { const d = await db.query("delete from public.terms_acceptances where id = $1", [termsRow]); if (d.rowCount !== 1) throw new Error("teardown: 規約の同意の行を消せませんでした"); }
  await db.end().catch(() => undefined);
}
const bad = results.filter((r) => !r.hit.ok);
const ex = results.filter((r) => r.hit.reason);
const exKinds = [...new Set(ex.map((r) => r.hit.reason))];
if (LIST) for (const r of results) console.log(`${r.hit.ok ? "ok " : "NG "} ${r.w} ${r.url} dx=${r.hit.dx} [${r.hit.reason ?? "-"}] ${r.hit.text} :: ${r.hit.path}`);
console.log(`主ボタンの組 ${results.length}（画面 ${new Set(results.map((r) => r.url + "@" + r.w)).size}）・例外 ${ex.length}（${exKinds.join("／")}）・違反 ${bad.length}`);
for (const r of bad.slice(0, LIST ? 0 : 200)) console.log(` - ${r.w} ${r.url} dx=${r.hit.dx} 「${r.hit.text}」 :: ${r.hit.path}`);
if (bad.length && !REPORT) { console.error(`verify:nox-actions-center FAIL 違反 ${bad.length}`); process.exit(1); }
console.log(`verify:nox-actions-center OK ${results.length} checks（主ボタンの組・違反 ${bad.length}・例外 ${ex.length}）`);
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
