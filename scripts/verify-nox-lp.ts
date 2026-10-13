/*
 * verify:nox-lp — 裁定344（便 N1013b・2026-10-13）: LP（/lp）の係留（DB 不触・env 不要）。
 *   npm run verify:nox-lp。f0 104 段目。
 *  lp(1) app/lp/page.tsx: force-static・noindex（公開ゲートの後に index）・文言の出所＝DEMO_RESET_TIME_JA／DEMO_TERMS／DEMO_STORE_LABEL の import（二重化しない）・
 *        6 店カード＝DEMO_STORES.map・「この店で試す」＝/demo?store=<key>&role=owner・動画＝public/lp/<store>.mp4（無い間はポスター枠）・料金＝mailto・/terms へのリンクなし・スマホ 1 列（auto-fill）
 *  lp(2) demo-terms: demoInitialSelectionOf（未知の店／役割は無視・店なしなら役割も null）・demoBizOrderOf（初期選択の店を先頭）・DemoEntry は useSearchParams で ?store=&role= を読む
 *  lp(3) 配線: /demo page は DemoEntry を Suspense で包む・session.ts の isDemoSessionExemptPath("/lp")・robots.ts の allow に /lp
 */
import fs from "node:fs";
import { demoBizOrderOf, demoInitialSelectionOf, type DemoBiz, type DemoRole } from "../components/ui/demo-terms";
import { isDemoSessionExemptPath } from "../lib/nox/demo/session";
import { DEMO_STORES } from "../lib/nox/demo/seed";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// lp(1)
{
  const lp = src("app/lp/page.tsx");
  check("lp(1-1) force-static・noindex（robots index:false）", lp.includes('export const dynamic = "force-static";') && lp.includes("robots: { index: false, follow: false }"));
  check("lp(1-2) 文言の出所＝DEMO_RESET_TIME_JA／DEMO_STORES／DEMO_STORE_LABEL（seed.ts）・DEMO_TERMS（demo-terms.tsx）を import＝二重化しない",
    lp.includes('import { DEMO_RESET_TIME_JA, DEMO_STORES, DEMO_STORE_LABEL } from "@/lib/nox/demo/seed";') && lp.includes('import { DEMO_TERMS } from "@/lib/nox/demo/terms";') && src("components/ui/demo-terms.tsx").includes('import { DEMO_TERMS } from "@/lib/nox/demo/terms";\nexport { DEMO_TERMS };')
    && lp.includes("{DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}") && lp.includes("デモは{DEMO_RESET_TIME_JA}に初期化されます") && !/毎日 06:05/.test(lp));
  check("lp(1-3) 6 店カード＝DEMO_STORES.map・「この店で試す」＝/demo?store=<key>&role=owner・主 CTA＝/demo",
    lp.includes("const STORES = DEMO_STORES.map((s) => ({ key: s, ...DEMO_STORE_LABEL[s], video: videoSrcOf(s) }));") && lp.includes("href={`/demo?store=${s.key}&role=owner`}") && lp.includes(">この店で試す</Link>") && lp.includes('<Link href="/demo" style={{ ...t.btnGold'));
  check("lp(1-4) 動画＝public/lp/<store>.mp4（fs.existsSync・無い店はポスター枠 data-poster）", lp.includes('path.join(process.cwd(), "public", "lp", `${store}.mp4`)') && lp.includes("return fs.existsSync(p) ? `/lp/${store}.mp4` : null;") && lp.includes('data-poster="1"') && lp.includes("<video src={s.video} controls muted playsInline preload=\"none\""));
  check("lp(1-5) 料金＝mailto・/terms へのリンクなし・スマホ 1 列（auto-fill minmax）", lp.includes('const LP_CONTACT_MAILTO = "mailto:') && !lp.includes("export const LP_CONTACT_MAILTO") && lp.includes("href={LP_CONTACT_MAILTO}") && !/href="\/terms"/.test(lp) && lp.includes('gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"'));
  check("lp(1-6) 資格情報・外部リンクを置かない（http は無い・mailto のみ）", !/https?:\/\//.test(lp));
}

// lp(2)
{
  const biz: DemoBiz[] = DEMO_STORES.map((s) => ({ key: s, label: s, desc: "" }));
  const roles: DemoRole[] = [{ key: "owner", label: "オーナー", desc: "" }, { key: "cast", label: "キャスト", desc: "" }];
  check("lp(2-1) demoInitialSelectionOf: 店＋役割", JSON.stringify(demoInitialSelectionOf(biz, roles, "noir", "owner")) === JSON.stringify({ store: "noir", role: "owner" }));
  check("lp(2-2) 未知の店は無視（役割も null）・未知の役割は null・null は null", JSON.stringify(demoInitialSelectionOf(biz, roles, "xxx", "owner")) === JSON.stringify({ store: null, role: null })
    && JSON.stringify(demoInitialSelectionOf(biz, roles, "ace", "boss")) === JSON.stringify({ store: "ace", role: null }) && JSON.stringify(demoInitialSelectionOf(biz, roles, null, null)) === JSON.stringify({ store: null, role: null }));
  check("lp(2-3) demoBizOrderOf: 初期選択の店を先頭・他は元の並び・なしは元の並び", demoBizOrderOf(biz, "lily").map((b) => b.key).join(",") === "lily,muse,luna,noir,ace,nest" && demoBizOrderOf(biz, null).map((b) => b.key).join(",") === DEMO_STORES.join(","));
  const dt = src("components/ui/demo-terms.tsx");
  check("lp(2-4) DemoEntry: useSearchParams で ?store=&role=・初期選択の店は data-initial・役割ボタンは data-picked（入場は form POST のまま・同意必須のまま）",
    dt.includes('const sp = useSearchParams();') && dt.includes('demoInitialSelectionOf(biz, roles, sp?.get("store"), sp?.get("role"))') && dt.includes('data-initial={init.store === b.key ? "1" : undefined}') && dt.includes('data-picked={picked ? "1" : undefined}')
    && dt.includes('<input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}') && dt.includes("disabled={!agreed} aria-disabled={!agreed}"));
}

// lp(3)
{
  const demoPage = src("app/demo/page.tsx");
  check("lp(3-1) /demo page: DemoEntry を Suspense で包む（force-static のまま）", demoPage.includes("<Suspense fallback={null}><DemoEntry biz={STORES} roles={ROLES} kiosk={KIOSK} /></Suspense>") && demoPage.includes('export const dynamic = "force-static";'));
  check("lp(3-2) session.ts: /lp は期限切れ判定の対象外（/demo・/api/demo/ と同じ）・/dashboard は対象", isDemoSessionExemptPath("/lp") && isDemoSessionExemptPath("/demo") && !isDemoSessionExemptPath("/dashboard") && !isDemoSessionExemptPath("/lp2"));
  const robots = src("app/robots.ts");
  check("lp(3-3) robots.ts: allow に /lp（disallow / は不変）", robots.includes('allow: ["/$", "/demo", "/demo/", "/lp", "/lp/"]') && robots.includes('disallow: ["/"]'));
}

if (fails.length) { console.error(`✗ verify:nox-lp 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`LP（裁定344）: /lp 文言の出所・6 店カード・この店で試す・初期選択の純関数・exempt／robots ✓ ${pass}`);
