/*
 * verify:nox-lp-next — ★相談役 11/26 の便 L3（便 J＝LP の 1 回目）/lp-next。DB に触れない。
 *  (1) 今の /lp は 1 バイトも変えない＝app/lp/page.tsx・app/lp/lp-v4.css・components/nox/lp-v4-client.tsx の指紋が 2026-11-26（eec74a6a の時点）と同じ
 *  (2) /lp-next は noindex・robots の allow に /lp-next が無い
 *  (3) 料金の文は今の /lp の文のまま（月額 29,800・FAQ の文・「年払いの割引もあります」）・事業者の表記と特商法・プライバシーポリシーのリンク
 *  (4) 入れない物（導入実績・お客様の声・順位・No.1）が文に無い・写しは public/lp/next に全部ある（1 機能 1 枚）・主のボタンは /demo
 *  (5) ★相談役 11/26 夜便 N の N4（LP の 2 回目）: 最初の画面の写真がある（400 KB 未満・ページが読む）・よくある質問（今の /lp の問いのまま・料金の答えは今の /lp の文のまま）・
 *      入れない物（立場の説明・開発中の機能・規約へのリンク・デモの店のカード）が無い・写しの幅と高さが実物と同じ・レジの写しはスマホの画面
 *  使い方: npm run verify:nox-lp-next
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { LPN_PILLARS, LPN_PRICE_MONTHLY, LPN_PRICE_FAQ, LPN_HERO, LPN_HERO_IMAGE, LPN_FAQ } from "../lib/nox/lp/next-copy";

let ok = 0; const fails: string[] = [];
const expect = (label: string, cond: boolean, detail?: unknown) => { if (cond) ok++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
/** JPEG の幅と高さ（SOF の印を読む・同期＝この検査は cjs で動く） */
const jpegSize = (f: string): { width: number; height: number } => { const b = fs.readFileSync(f); let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }; i += 2 + len; } return { width: 0, height: 0 }; };

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

// (5)
const heroFile = `public${LPN_HERO_IMAGE.src}`;
const heroMeta = fs.existsSync(heroFile) ? jpegSize(heroFile) : null;
expect("(5-1) 最初の画面の写真がある・400 KB 未満・幅と高さが一覧と同じ・ページが読む（alt は空＝飾り）",
  !!heroMeta && fs.statSync(heroFile).size < 400 * 1024 && heroMeta.width === LPN_HERO_IMAGE.w && heroMeta.height === LPN_HERO_IMAGE.h
  && page.includes("src={LPN_HERO_IMAGE.src}") && page.includes('className="lpnx-hero-media" aria-hidden="true"'),
  heroMeta ? { size: fs.statSync(heroFile).size, w: heroMeta.width, h: heroMeta.height } : "no file");
const lpFaqQs = [...lp.matchAll(/^\s*\["([^"]+？)", \[/gm)].map((m) => m[1]);
expect("(5-2) よくある質問＝4 問以上・問いは今の /lp の FAQ の問いのまま・料金の答えは今の /lp の文のまま（1 文字も変えない）・ページが出す",
  LPN_FAQ.length >= 4 && LPN_FAQ.every((f) => lpFaqQs.includes(f.q) && f.a.length > 0)
  && LPN_FAQ.some((f) => f.q === "料金はいくらですか？" && f.a.length === 1 && f.a[0] === "月額29,800円／店舗（税込）です。年払いの割引もあります。詳細はお問い合わせください。")
  && lp.includes('["料金はいくらですか？", ["月額29,800円／店舗（税込）です。年払いの割引もあります。詳細はお問い合わせください。"]]')
  && page.includes("LPN_FAQ.map(") && page.includes('data-lpnx-section="faq"'), { lpFaqQs, ours: LPN_FAQ.map((f) => f.q) });
const NG2 = ["利用規約", '"/terms"', "TERMS_PATH", "開発中", "提供時期", "それぞれの立場", "ROLES", "DEMO_STORES", "この店で試す", "店長でログイン", "キャストでログイン"];
expect("(5-3) 入れない物（立場の説明・開発中の機能・規約へのリンク・デモの店のカード）が文に無い", NG2.every((x) => !copy.includes(x)), NG2.filter((x) => copy.includes(x)));
const dims = shots.map((s) => { const m = jpegSize(`public${s.src}`); return { src: s.src, ok: m.width === s.w && m.height === s.h, w: m.width, h: m.height }; });
expect("(5-4) 写しの幅と高さ（一覧の w・h）が実物と同じ", dims.every((d) => d.ok), dims.filter((d) => !d.ok));
const reg = shots.find((s) => s.src === "/lp/next/register.jpg");
expect("(5-5) レジの写しはスマホの画面（縦長・phone）", !!reg && reg.phone === true && reg.h > reg.w, reg);

if (fails.length) { console.error(fails.map((f) => `  FAIL: ${f}`).join("\n")); console.error(`verify:nox-lp-next FAIL ${fails.length} / pass ${ok}`); process.exit(1); }
console.log(`verify:nox-lp-next ALL PASS (${ok} assertions)`);
