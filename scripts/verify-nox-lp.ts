/*
 * verify:nox-lp — 裁定344（便 N1013b・2026-10-13）: LP（/lp）の係留（DB 不触・env 不要）。
 *   npm run verify:nox-lp。f0 104 段目。
 *  lp(1) app/lp/page.tsx: force-static・noindex（公開ゲートの後に index）・文言の出所＝DEMO_RESET_TIME_JA／DEMO_TERMS／DEMO_STORE_LABEL の import（二重化しない）・
 *        6 店カード＝LP_ORDER（モック v3 の順・DEMO_STORES と同じ集合）・「オーナーで試す」「店長で試す」＝/demo?store=<key>&role=owner|manager・
 *        上段＝public/lp/<store>.mp4 → <store>.jpg → ポスター枠・料金＝mailto・/terms へのリンクなし・スマホ 1 列（auto-fill）
 *        ★便 M5 M-41（2026-10-30）: モック v3（nox_lp_mock_v3.html）への差し替え＝ヒーロー・チップ（見た目だけ）・4 つの立場・できること・これから・雇用・委託・FAQ（details）・OG 画像の meta
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

// lp(1) ★LP v4（2026-11-04 夜の自走便 4）: 正本＝docs/handoff/lp/NOX-LP.html（Agoora 11/02）＝ヒーロー／01 つながる／02 画面で見る（4 枚）／03 立場＋FAQ／料金 29,800／問い合わせ（プレビュー）／6 店（店長・キャストでログイン）／フッター
{
  const lp = src("app/lp/page.tsx"), cl = src("components/nox/lp-v4-client.tsx"), css = src("app/lp/lp-v4.css");
  check("lp(1-v4-1) 構成＝.lpv4 配下・9 節（hero／features／examples／立場＋FAQ／contact／inquiry／stores）・ロゴは BrandLogo・CSS は .lpv4 に閉じ込め（:root／body の素の行なし）",
    lp.includes('<div className="lpv4">') && lp.includes('id="features"') && lp.includes('id="examples"') && lp.includes('id="contact"') && lp.includes('id="inquiry"') && lp.includes('id="stores"') && lp.includes('import "./lp-v4.css";')
    && (lp.match(/<BrandLogo /g) ?? []).length === 2 && !/^(:root|body|html)\s*\{/m.test(css) && css.includes(".lpv4{") && css.includes(".lpv4 .store-grid{"));
  check("lp(1-v4-2) 「オーナー」→「管理者」（立場 4＝管理者／店長／スタッフ／キャスト）・文言は HTML 逐語（ヒーロー・01 の 3 列・02 の 4 枚・FAQ 5・料金 29,800 円／月（税込）・年払い）",
    lp.includes('{ dev: "PC / iPad", name: "管理者", body: "待遇・設定から給与、分析、月報まで。店全体を把握。" }') && !/オーナー/.test(lp) && (lp.match(/name: "/g) ?? []).length === 4
    && lp.includes("伝票の1杯から、<br />月末の給与まで。") && lp.includes("営業から締めまで、<br />つながる店舗管理。") && (lp.match(/no: "0[1-4] \//g) ?? []).length === 4 && (lp.match(/\["[^"]+？", \[/g) ?? []).length === 5
    && lp.includes("const LP_PRICE_MONTHLY = 29800;") && lp.includes("<b>円／月（税込）</b>") && lp.includes("年払いの割引もあります"));
  check("lp(1-v4-3) 6 店カード＝LP_ORDER（ace,luna,noir,muse,nest,lily＝DEMO_STORES と同じ集合）・「店長でログイン」「キャストでログイン」＝/demo?store=<key>&role=manager|cast・帯＝DEMO_RESET_TIME_JA・条文＝DEMO_TERMS（二重化しない）",
    (() => { const m = /const LP_ORDER: readonly DemoStore\[\] = \[([^\]]+)\];/.exec(lp); const order = m ? m[1].split(",").map((x) => x.trim().replace(/"/g, "")) : []; return order.join(",") === "ace,luna,noir,muse,nest,lily" && [...order].sort().join(",") === [...DEMO_STORES].sort().join(","); })()
    && lp.includes("href={`/demo?store=${s.key}&role=manager`}>店長でログイン") && lp.includes("href={`/demo?store=${s.key}&role=cast`}>キャストでログイン") && lp.includes("デモは{DEMO_RESET_TIME_JA}に初期化。") && !/毎日 06:05/.test(lp)
    && lp.includes("{DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}") && lp.includes('import { DEMO_TERMS } from "@/lib/nox/demo/terms";'));
  check("lp(1-v4-4) 画面 4 枚＝public/lp/v4（register／shift／cast／payroll）＋hero.jpg・拡大＝dialog（client）・問い合わせ＝プレビュー（送信しない＝fetch／mailto なし・確認→完了の 2 画面）・page は force-static・noindex・use client なし（page）",
    ["screen-register", "screen-shift", "screen-cast", "screen-payroll"].every((n) => lp.includes(`/lp/v4/${n}.png`) && fs.existsSync(`public/lp/v4/${n}.png`)) && fs.existsSync("public/lp/v4/hero.jpg") && lp.includes('openGraph: { images: ["/lp/v4/hero.jpg"] }')
    && cl.includes("ref.current?.showModal()") && cl.includes('data-lp-form="confirm"') && cl.includes('data-lp-form="done"') && !/fetch\(|mailto:/.test(cl) && cl.includes("プレビュー用") === false && lp.includes("プレビュー用フォームです。入力内容は送信・保存されません。")
    && lp.includes('export const dynamic = "force-static";') && lp.includes("robots: { index: false, follow: false }") && !/^"use client";?\s*$/m.test(lp) && /^"use client";/.test(cl));
  check("lp(1-v4-5) 資格情報・外部リンクを置かない（http は無い）・/terms へのリンクなし", !/https?:\/\//.test(lp) && !/href="\/terms"/.test(lp) && !/https?:\/\//.test(cl));
}
// lp(1) 旧（M-41 v3）＝v4 で置換済み
if (false) {
  const lp = src("app/lp/page.tsx");
  check("lp(1-1) force-static・noindex（robots index:false）・OG 画像＝/lp/og.jpg（meta だけ・static のまま＝\"use client\" なし）",
    lp.includes('export const dynamic = "force-static";') && lp.includes("robots: { index: false, follow: false }") && lp.includes('openGraph: { images: ["/lp/og.jpg"] }') && !/^"use client";?\s*$/m.test(lp));
  check("lp(1-2) 文言の出所＝DEMO_RESET_TIME_JA／DEMO_STORES／DEMO_STORE_LABEL（seed.ts）・DEMO_TERMS（demo-terms.tsx）を import＝二重化しない（帯・ヒーロー・FAQ の「毎日 06:05」は定数から）",
    lp.includes('import { DEMO_RESET_TIME_JA, DEMO_STORES, DEMO_STORE_LABEL, type DemoStore } from "@/lib/nox/demo/seed";') && lp.includes('import { DEMO_TERMS } from "@/lib/nox/demo/terms";') && src("components/ui/demo-terms.tsx").includes('import { DEMO_TERMS } from "@/lib/nox/demo/terms";\nexport { DEMO_TERMS };')
    && lp.includes("{DEMO_TERMS.map((s) => <li key={s}>{s}</li>)}") && lp.includes("デモは{DEMO_RESET_TIME_JA}に初期化されます") && !/毎日 06:05/.test(lp)
    && lp.includes("デモ環境・{DEMO_RESET_TIME_JA}に初期化。入力内容は他の閲覧者にも見えます。個人情報を入力しないでください") && lp.includes("`デモ環境・${DEMO_RESET_TIME_JA}に初期化。入力内容は他の閲覧者にも見えます。個人情報を入力しないでください`"));
  {
    const m = /const LP_ORDER: readonly DemoStore\[\] = \[([^\]]+)\];/.exec(lp);
    const order = (m?.[1] ?? "").split(",").filter(Boolean).map((x) => x.trim().replace(/"/g, ""));
    check("lp(1-3) 6 店カード＝LP_ORDER（モック v3 の順 ace,luna,noir,muse,nest,lily＝DEMO_STORES と同じ集合）・「オーナーで試す」「店長で試す」＝/demo?store=<key>&role=owner|manager（MUSE／NEST／LILY は店長が先）・主 CTA「デモ店舗を選ぶ」＝/demo",
      order.join(",") === "ace,luna,noir,muse,nest,lily" && [...order].sort().join(",") === [...DEMO_STORES].sort().join(",")
      && lp.includes("const STORES = LP_ORDER.map((s) => ({ key: s, label: DEMO_STORE_LABEL[s], ...LP_STORE_COPY[s], video: videoSrcOf(s), image: imageSrcOf(s) }));")
      && lp.includes("href={`/demo?store=${s.key}&role=owner`}") && lp.includes("href={`/demo?store=${s.key}&role=manager`}") && lp.includes(">オーナーで試す</Link>") && lp.includes(">店長で試す</Link>")
      && /muse: \{[^}]*primary: "manager"/.test(lp) && /nest: \{[^}]*primary: "manager"/.test(lp) && /lily: \{[^}]*primary: "manager"/.test(lp) && /ace: \{[^}]*primary: "owner"/.test(lp)
      && lp.includes('<Link href="/demo" style={{ ...t.btnGold, ...btn }}>デモ店舗を選ぶ</Link>') && lp.includes("伝票の1杯から、<br />月末の給与まで。"));
  }
  check("lp(1-4) 上段＝public/lp/<store>.mp4（fs.existsSync）→ <store>.jpg（<img alt 1280×800・動画の poster にも）→ ポスター枠 data-poster",
    lp.includes('path.join(process.cwd(), "public", "lp", `${store}.mp4`)') && lp.includes("return fs.existsSync(p) ? `/lp/${store}.mp4` : null;")
    && lp.includes('path.join(process.cwd(), "public", "lp", `${store}.jpg`)') && lp.includes("return fs.existsSync(p) ? `/lp/${store}.jpg` : null;")
    && lp.includes('data-poster="1"') && lp.includes("<video src={s.video} poster={s.image ?? undefined} controls muted playsInline preload=\"none\"") && lp.includes("<img src={s.image} alt={s.alt} loading=\"lazy\" width={1280} height={800}"));
  check("lp(1-5) 料金＝mailto（器なし・金額の行は出さない）・/terms へのリンクなし・スマホ 1 列（auto-fill／auto-fit minmax）・主ボタンは .nox-actions",
    lp.includes('const LP_CONTACT_MAILTO = "mailto:') && !lp.includes("export const LP_CONTACT_MAILTO") && lp.includes("href={LP_CONTACT_MAILTO}") && !/href="\/terms"/.test(lp) && !/月額/.test(lp)
    && lp.includes('gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"') && lp.includes('gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))"') && lp.includes('<div className="nox-actions" style={{ marginTop: "auto", paddingTop: 4 }}>'));
  check("lp(1-6) 資格情報・外部リンクを置かない（http は無い・mailto のみ）", !/https?:\/\//.test(lp));
  check("lp(1-7) モック v3 の節が揃う（チップ 7＝見た目だけ・4 つの立場・できること 3 列・これから 3 群・雇用・委託の注記 3・FAQ 5＝details・フッター）",
    lp.includes('const LP_CHIPS: readonly string[] = ["すべて", "売上で時給が上がる", "指名で時給が上がる", "半月で判定する", "時給は固定", "日払いがある", "休み希望だけ集める"];')
    && lp.includes("給与の決め方が違う、6つのデモ店舗") && lp.includes("どの店にも「体験入店」の待遇があり、1名が期限付きの保証時給で入っています。")
    && lp.includes("立場ごとに、見える画面が変わります") && lp.split("{ name: \"").length - 1 === 4
    && lp.includes("営業中の入力が、そのまま締めにつながる") && lp.split("when: \"").length - 1 === 3 && lp.includes('["監査ログ", "誰がいつ何を変えたかが残ります。伝票の修正や設定の変更も追えます。"]')
    && lp.includes("これから加わる機能") && lp.includes('"給与計算の自動確定"') && lp.includes("雇用のキャストも、<br />業務委託のキャストも") && lp.includes('"源泉徴収の扱いは、税理士などの専門家にご確認ください。"')
    && lp.includes("よくある質問") && lp.split("<details key={q}").length - 1 === 1 && lp.split('["').length - 1 >= 5 && lp.includes('["料金はいくらですか", "料金はお問い合わせください。店の運用をうかがってご案内します。"]')
    && lp.includes("導入と料金のご相談") && lp.includes("<span>NOX　運営　株式会社Agoora</span>") && lp.includes("<span>© 2026 Agoora</span>") && lp.includes('<Link href="/demo" className="nox-link">デモ</Link>'));
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
    dt.includes('useEffect(() => { const u = new URLSearchParams(window.location.search); setQ({ store: u.get("store"), role: u.get("role") }); }, []);') && dt.includes("demoInitialSelectionOf(biz, roles, q.store, q.role)") && !dt.includes("useSearchParams()") && dt.includes('data-initial={init.store === b.key ? "1" : undefined}') && dt.includes('data-picked={picked ? "1" : undefined}')
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
