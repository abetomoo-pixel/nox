/*
 * verify:nox-lp-next — ★相談役 11/26 の便 L3（便 J＝LP の 1 回目）/lp-next。DB に触れない。
 *  (1) 今の /lp は 1 バイトも変えない＝app/lp/page.tsx・app/lp/lp-v4.css・components/nox/lp-v4-client.tsx の指紋が 2026-11-26（eec74a6a の時点）と同じ
 *  (2) /lp-next は noindex・robots の allow に /lp-next が無い
 *  (3) 料金の文は今の /lp の文のまま（月額 29,800・FAQ の文・「年払いの割引もあります」）・事業者の表記と特商法・プライバシーポリシーのリンク
 *  (4) 入れない物（導入実績・お客様の声・順位・No.1）が文に無い・写しは public/lp/next に全部ある（1 機能 1 枚）・主のボタンは /demo
 *  使い方: npm run verify:nox-lp-next
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { LPN_PILLARS, LPN_PRICE_MONTHLY, LPN_PRICE_FAQ, LPN_HERO } from "../lib/nox/lp/next-copy";

let ok = 0; const fails: string[] = [];
const expect = (label: string, cond: boolean, detail?: unknown) => { if (cond) ok++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

// (1)
const LP_PINS: Record<string, string> = {
  "app/lp/page.tsx": "7ad4af861997168cfcd8b23bdaf04f8bc4f30559f5414236facf64af966d5b4d",
  "app/lp/lp-v4.css": "b28b1c39e30a18f54f0565c6fcfe7e573c318e6ddd292801aa08f6113de08a7d",
  "components/nox/lp-v4-client.tsx": "5a1253ae20eb7473952945c8a09382b7409de6f71cd578019b6dca2384e35d87",
};
const got = Object.fromEntries(Object.keys(LP_PINS).map((f) => [f, sha(f)]));
expect("(1) 今の /lp の 3 ファイルの指紋が前と同じ（1 バイトも変えない）", Object.entries(LP_PINS).every(([f, h]) => got[f] === h), got);

// (2)
const page = fs.readFileSync("app/lp-next/page.tsx", "utf8");
const robots = fs.readFileSync("app/robots.ts", "utf8");
expect("(2-1) /lp-next は noindex・nofollow・静的", page.includes("robots: { index: false, follow: false }") && page.includes('export const dynamic = "force-static"'));
expect("(2-2) robots の allow に /lp-next が無い（disallow / に落ちる）", !robots.includes("/lp-next"));

// (3)
const lp = fs.readFileSync("app/lp/page.tsx", "utf8");
expect("(3-1) 料金＝今の /lp と同じ数字と文（29,800・FAQ の文・年払いの割引・円／月（税込）・1店舗あたりの月額料金）",
  LPN_PRICE_MONTHLY === 29800 && lp.includes("const LP_PRICE_MONTHLY = 29800;") && lp.includes(LPN_PRICE_FAQ)
  && ["年払いの割引もあります", "円／月（税込）", "1店舗あたりの月額料金"].every((x) => page.includes(x) && lp.includes(x)));
expect("(3-2) 事業者の表記・特商法・プライバシーポリシー・デモ利用の条文（今の /lp と同じ置き場から読む）",
  ["COMPANY_NAME", "TOKUSHOHO_HREF", "TOKUSHOHO_TITLE", "PRIVACY_PATH", "privacyPublishedOf()", "DEMO_TERMS", "DEMO_RESET_TIME_JA", "SUPPORT_EMAIL"].every((x) => page.includes(x)));

// (4)
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n"); // 注意書き（コメントの「入れない物」）は数えない
const copy = noComments(fs.readFileSync("lib/nox/lp/next-copy.ts", "utf8") + page);
const NG = ["導入実績", "お客様の声", "No.1", "ナンバーワン", "業界初", "唯一", "満足度", "実績多数"];
expect("(4-1) 入れない物（導入実績・お客様の声・順位・根拠の無い言い切り）が無い", NG.every((x) => !copy.includes(x)), NG.filter((x) => copy.includes(x)));
const shots = LPN_PILLARS.flatMap((p) => p.shots);
expect("(4-2) 写しは public/lp/next に全部ある・1 機能 1 枚（同じ写しを 2 度使わない）・柱は 4（＋デモの入口）",
  shots.length >= 8 && shots.every((s) => fs.existsSync(`public${s.src}`)) && new Set(shots.map((s) => s.src)).size === shots.length && LPN_PILLARS.length === 4, shots.map((s) => s.src));
expect("(4-3) 主のボタンは公開デモ（/demo）で中央（lpnx-cta）・2 か所", (page.match(/<div className="lpnx-cta"><Link className="lpnx-btn" href="\/demo"/g) ?? []).length === 2 && LPN_HERO.cta.includes("デモ"));

if (fails.length) { console.error(fails.map((f) => `  FAIL: ${f}`).join("\n")); console.error(`verify:nox-lp-next FAIL ${fails.length} / pass ${ok}`); process.exit(1); }
console.log(`verify:nox-lp-next ALL PASS (${ok} assertions)`);
