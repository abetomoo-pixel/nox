/*
 * verify:nox-master-top — 便 MC1（裁定330 マスタ整理 第 1 便・正本モック docs/handoff/mock/20261001/nox-master-consolidated.html・2026-10-01）: トップ 4 パネル × 9 入口・入口内タブ・旧 URL の解決（純関数＋逐語 grep・DB 不触・env 不要）。
 *   npm run verify:nox-master-top。
 *
 *  mt(1) lib/nox/master/nav.ts: 4 群（商品・料金／キャスト・報酬／店舗・運用／スタッフ・システム）・入口 9・在庫（/master/stock）は無い・端末・印刷は ownerOnly・URL は既存の page／?tab=／#hash のみ
 *  mt(2) resolveMasterNav: 旧トップ 17 href のうち在庫以外の 16 が入口に解決（/master/categories→商品管理／商品カテゴリ・?tab=rules→料金適用ルール・#secrets→権限・情報管理・#features→店舗設定／機能の公開・norma→報酬設定／ノルマ）・/master と /master/cast-comp と在庫は null・タブ無指定は先頭タブ
 *  mt(3) masterSearchHit: タブ名でも当たる（「カテゴリ」→商品管理・「ノルマ」→報酬設定）・空は全件・無関係は 0
 *  mt(4) master-board: MASTER_NAV から 4 パネルを描く・在庫カード／発注推奨の警告／fetchStockTotals は無い・件数は hubCountOf／hubStatusOf 経由・検索＝masterSearchHit・カード見出しの .nox-cardtitle／.nox-cardchev／.nox-carddesc は不変（306-15）
 *  mt(5) master-subnav: resolveMasterNav(pathname, search, hash)・hashchange を購読・群／入口の select 2 つ・入口内タブは .nox-seg の Link（on＝cur.tab）
 *  mt(6) 在庫画面＝発注推奨の警告（.nox-alert danger）を持つ／料金画面＝?tab= を読んで初期タブにする（内側のピルは不変）
 *  逆テスト 1 本（手動・1 回）: nav.ts の「席・卓」入口を外す→mt(1-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { MASTER_NAV, MASTER_OLD_HREFS, masterEntryCount, masterHasHref, masterSearchHit, resolveMasterNav } from "../lib/nox/master/nav";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const codeOf = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

// (1) 定義
const groups = MASTER_NAV.map((g) => g.label);
const entries = MASTER_NAV.flatMap((g) => g.pages);
check("mt(1-1) 4 群＝商品・料金／キャスト・報酬／店舗・運用／スタッフ・システム・入口 9（商品管理／料金・会計／報酬設定／紹介者・紹介料／店舗設定／席・卓／営業時間・定休日／端末・印刷／権限・情報管理）",
  JSON.stringify(groups) === JSON.stringify(["商品・料金", "キャスト・報酬", "店舗・運用", "スタッフ・システム"]) && masterEntryCount() === 9
  && JSON.stringify(entries.map((p) => p.label)) === JSON.stringify(["商品管理", "料金・会計", "報酬設定", "紹介者・紹介料", "店舗設定", "席・卓", "営業時間・定休日", "端末・印刷", "権限・情報管理"]), JSON.stringify(entries.map((p) => p.label)));
check("mt(1-2) 在庫（/master/stock）はナビに無い・端末・印刷だけ ownerOnly・紹介者は /master/referrers 1 回・入口と全タブの URL は /master 配下のみ（新 route 0）",
  !masterHasHref("/master/stock") && entries.filter((p) => p.ownerOnly).map((p) => p.label).join() === "端末・印刷" && entries.filter((p) => p.href === "/master/referrers").length === 1
  && entries.every((p) => p.href.startsWith("/master/") && (p.tabs ?? []).every((t) => t.href.startsWith("/master/"))));
const tabCount = Object.fromEntries(entries.map((p) => [p.label, p.tabs?.length ?? 0]));
check("mt(1-3) 入口内タブ: 商品管理 2（商品一覧／商品カテゴリ）・料金・会計 3（?tab=master／rules／checkout）・報酬設定 5（MC1 仮置き＝キャスト会計・報酬制度を含む）・店舗設定 2（店舗情報／機能の公開＝仮置き）・端末・印刷 3（#devices／#pins／#receipts）・権限・情報管理 1（#secrets）",
  tabCount["商品管理"] === 2 && tabCount["料金・会計"] === 3 && tabCount["報酬設定"] === 5 && tabCount["店舗設定"] === 2 && tabCount["端末・印刷"] === 3 && tabCount["権限・情報管理"] === 1
  && entries.find((p) => p.label === "料金・会計")!.tabs!.map((t) => t.href).join() === "/master/pricing?tab=master,/master/pricing?tab=rules,/master/pricing?tab=checkout", JSON.stringify(tabCount));

// (2) 旧 URL の解決
const r = (href: string) => { const h = href.indexOf("#"); const hash = h >= 0 ? href.slice(h) : ""; const nh = h >= 0 ? href.slice(0, h) : href; const q = nh.indexOf("?"); return resolveMasterNav(q >= 0 ? nh.slice(0, q) : nh, q >= 0 ? nh.slice(q) : "", hash); };
const lab = (href: string) => { const x = r(href); return x ? `${x.group.label}/${x.page.label}/${x.tab?.label ?? "-"}` : "null"; };
check("mt(2-1) 旧トップ 17 href: 在庫以外の 16 が入口に解決・在庫は null（営業メニューへ）", MASTER_OLD_HREFS.length === 17 && MASTER_OLD_HREFS.filter((h) => h !== "/master/stock").every((h) => r(h) !== null) && r("/master/stock") === null, MASTER_OLD_HREFS.map((h) => `${h}→${lab(h)}`).join(" "));
check("mt(2-2) 解決の形: categories→商品管理/商品カテゴリ・pricing?tab=rules→料金・会計/料金適用ルール・pricing（無指定）→料金マスタ・#secrets→権限・情報管理/機密・税務情報・#features→店舗設定/機能の公開・norma→報酬設定/ノルマ・system（無指定）→端末・印刷/打刻・レジ端末・register→報酬設定/キャスト会計（MC1 仮置き）",
  lab("/master/categories") === "商品・料金/商品管理/商品カテゴリ" && lab("/master/pricing?tab=rules") === "商品・料金/料金・会計/料金適用ルール" && lab("/master/pricing") === "商品・料金/料金・会計/料金マスタ"
  && lab("/master/system#secrets") === "スタッフ・システム/権限・情報管理/機密・税務情報" && lab("/master/system#features") === "店舗・運用/店舗設定/機能の公開" && lab("/master/cast-comp/norma") === "キャスト・報酬/報酬設定/ノルマ"
  && lab("/master/system") === "スタッフ・システム/端末・印刷/打刻・レジ端末" && lab("/master/cast-comp/register") === "キャスト・報酬/報酬設定/キャスト会計" && lab("/master/seats") === "店舗・運用/席・卓/-",
  [lab("/master/categories"), lab("/master/pricing?tab=rules"), lab("/master/pricing"), lab("/master/system#secrets"), lab("/master/system#features"), lab("/master/cast-comp/norma"), lab("/master/system"), lab("/master/cast-comp/register"), lab("/master/seats")].join(" | "));
check("mt(2-3) ナビ未登録＝null: /master・/master/cast-comp（概要）・/master/stock・/master/system#nope（hash 不一致は hash 無しの入口＝端末・印刷に落ちる）", r("/master") === null && r("/master/cast-comp") === null && r("/master/stock") === null && lab("/master/system#nope") === "スタッフ・システム/端末・印刷/-");

// (3) 検索
const pm = entries.find((p) => p.label === "商品管理")!, hs = entries.find((p) => p.label === "報酬設定")!, st = entries.find((p) => p.label === "席・卓")!;
check("mt(3-1) masterSearchHit: 「カテゴリ」→商品管理（タブ名）・「ノルマ」→報酬設定・「席」→席・卓・空は全件・無関係は 0", masterSearchHit(pm, "カテゴリ") && masterSearchHit(hs, "ノルマ") && masterSearchHit(st, "席") && !masterSearchHit(st, "カテゴリ") && entries.every((p) => masterSearchHit(p, "  ")) && entries.every((p) => !masterSearchHit(p, "zzz-none")));

// (4) master-board
const mb = src("app/(manage)/master/master-board.tsx"), mbC = codeOf(mb);
check("mt(4-1) master-board: MASTER_NAV.map で 4 パネル・検索＝masterSearchHit・在庫カード／発注推奨の警告／fetchStockTotals／lowStock は無い・件数は hubCountOf／hubStatusOf・.nox-cardtitle／.nox-cardchev／.nox-carddesc 不変・入口カードは Link（href＝入口の先頭）",
  mb.includes("{MASTER_NAV.map((g) => {") && mb.includes("masterSearchHit(p, hubSearch)") && !mbC.includes("/master/stock") && !mbC.includes("fetchStockTotals") && !mbC.includes("lowStock") && !mbC.includes("nox-alert")
  && mb.includes("hubCountOf(hubState, products.length)") && mb.includes("hubCountOf(hubState, seats.length)") && mb.includes("hubStatusOf(refState") && mb.includes('className="nox-cardtitle"') && mb.includes('className="nox-cardchev"') && mb.includes('className="nox-carddesc"')
  && mb.includes('<Link key={p.href} href={p.href} className="nox-fcard">') && mb.includes('from("referral_payouts").select("id", { count: "exact", head: true }).eq("status", "unpaid")') && !mb.includes("読込中"));

// (5) subnav
const sn = src("app/(manage)/master/master-subnav.tsx");
check("mt(5-1) master-subnav: resolveMasterNav(pathname, search, hash)・hashchange 購読・群／入口の select 2 つ・入口内タブ＝.nox-seg の Link（on＝cur.tab）・「マスタ」は /master への Link",
  sn.includes("resolveMasterNav(pathname, search, hash)") && sn.includes('window.addEventListener("hashchange", apply)') && (sn.match(/<select/g) ?? []).length === 2 && sn.includes('aria-label="入口を切り替え"')
  && sn.includes("const on = p.href === cur?.tab?.href;") && sn.includes('<Link href="/master" style={crumbRoot}>マスタ</Link>') && sn.includes('className="nox-seg"'));

// (6) 在庫画面・料金画面
const sb = src("app/(manage)/master/stock/stock-board.tsx"), pb = src("app/(manage)/master/pricing/pricing-board.tsx");
check("mt(6-1) stock-board: 発注推奨の警告（.nox-alert danger・reorder_point 判定）がトップから移っている／pricing-board: ?tab= を読み初期タブ（master／rules／checkout）にする・内側のピル 3 本は不変",
  sb.includes('className="nox-alert danger"') && sb.includes("p.reorder_point != null && (stock[p.id] ?? 0) <= (p.reorder_point ?? 0)") && sb.includes("在庫が発注基準を下回っている商品が")
  && pb.includes('useSearchParams()') && pb.includes('sp?.get("tab")') && pb.includes('useState<"master" | "rules" | "checkout">(initTab)') && pb.includes('[["master", "料金マスタ"], ["rules", "料金適用ルール"], ["checkout", "会計設定"]] as const'));

if (fails.length) {
  console.error(`verify:nox-master-top FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-master-top OK (${pass} checks)`);
console.log("マスタ整理 第 1 便（裁定330・MC1）: 4 群 9 入口・在庫はナビ外・旧 17 href の解決・検索はタブ名も・master-board／subnav の配線・在庫警告の移設・料金 ?tab");
