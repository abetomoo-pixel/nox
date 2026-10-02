/*
 * verify:nox-master-top — 便 MC1／MC2（裁定330＋追補1 マスタ整理・正本モック docs/handoff/mock/20261001/nox-master-consolidated.html・2026-10-01）: トップ 4 パネル × 9 入口・入口内タブ・旧 URL の解決（純関数＋逐語 grep・DB 不触・env 不要）。
 *   npm run verify:nox-master-top。
 *
 *  mt(1) lib/nox/master/nav.ts: 4 群・入口 9・在庫（/master/stock）は無い・端末・印刷は ownerOnly・タブ構成（MC2）＝商品管理 2／料金・会計 3／報酬設定 3／店舗設定 2（利用機能・店舗情報）／端末・印刷 3／権限・情報管理 3（キャスト会計の許可・データ管理・機密情報）
 *  mt(2) resolveMasterNav: 旧トップ 17 href＝在庫以外の 16 が入口に解決（alias＝報酬制度ページ・system#features → 店舗設定／利用機能・register → 権限／キャスト会計の許可）・在庫は null（営業メニュー）・タブ無指定は先頭タブ・hash 不一致は null
 *  mt(3) masterSearchHit: タブ名でも当たる・空は全件・無関係は 0
 *  mt(4) master-board: MASTER_NAV から 4 パネル・在庫カード／発注推奨／fetchStockTotals は無い・件数は hubCountOf／hubStatusOf・.nox-cardtitle 等は不変
 *  mt(5) master-subnav: resolveMasterNav(pathname, search, hash)・hashchange・select 2・.nox-seg の Link
 *  mt(6) 在庫画面＝発注推奨の警告／料金画面＝?tab= を読み・内側ピル無し（MC2）・「ルールで設定」は URL で切替
 *  mt(7) 店舗設定ページ＝?tab=features／info／data（storeProfileTabOf）・利用機能＝SystemsBoard＋ar／timeBasis＋FeatureFlagsPanel（owner）＋MineSettingsPanel・店舗情報＝profile／shift・データ管理＝data／StoreProfilePanel の sections（既定＝全節）／system ページに機能の公開タブは無い
 *  逆テスト 1 本（手動・1 回）: nav.ts の「席・卓」入口を外す→mt(1-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { MASTER_NAV, MASTER_OLD_HREFS, masterEntryCount, masterHasHref, masterSearchHit, resolveMasterNav, storeProfileTabOf } from "../lib/nox/master/nav";

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
check("mt(1-2) 在庫（/master/stock）はナビに無い（alias にも無い）・端末・印刷だけ ownerOnly・紹介者は /master/referrers 1 回・入口と全タブ・alias の URL は /master 配下のみ（新 route 0）",
  !masterHasHref("/master/stock") && entries.filter((p) => p.ownerOnly).map((p) => p.label).join() === "端末・印刷" && entries.filter((p) => p.href === "/master/referrers").length === 1
  && entries.every((p) => p.href.startsWith("/master/") && (p.tabs ?? []).every((t) => t.href.startsWith("/master/") && (t.aliases ?? []).every((a) => a.startsWith("/master/")))));
const tabsOf = (label: string) => entries.find((p) => p.label === label)?.tabs ?? [];
check("mt(1-3) タブ構成（MC2）: 商品管理 2・料金・会計 3（?tab=master／rules／checkout）・報酬設定 3（待遇プラン／控除・送り／ノルマ＝仮置きは無い）・店舗設定 2（利用機能 ?tab=features（alias 2＝報酬制度ページ・system#features）／店舗情報 ?tab=info）・端末・印刷 3・権限・情報管理 3（キャスト会計の許可／データ管理 ?tab=data／機密情報 #secrets）",
  tabsOf("商品管理").length === 2 && tabsOf("料金・会計").map((t) => t.href).join() === "/master/pricing?tab=master,/master/pricing?tab=rules,/master/pricing?tab=checkout"
  && tabsOf("報酬設定").map((t) => t.label).join() === "待遇プラン,控除・送り,ノルマ"
  && tabsOf("店舗設定").map((t) => `${t.label}:${t.href}`).join() === "利用機能:/master/store-profile?tab=features,店舗情報:/master/store-profile?tab=info"
  && JSON.stringify(tabsOf("店舗設定")[0].aliases) === JSON.stringify(["/master/cast-comp/systems", "/master/system#features"])
  && tabsOf("端末・印刷").length === 3 && tabsOf("権限・情報管理").map((t) => `${t.label}:${t.href}`).join() === "キャスト会計の許可:/master/cast-comp/register,データ管理:/master/store-profile?tab=data,機密情報:/master/system#secrets"
  && entries.find((p) => p.label === "権限・情報管理")?.href === "/master/cast-comp/register", JSON.stringify(entries.map((p) => [p.label, (p.tabs ?? []).map((t) => t.href)])));

// (2) 旧 URL の解決
const r = (href: string) => { const h = href.indexOf("#"); const hash = h >= 0 ? href.slice(h) : ""; const nh = h >= 0 ? href.slice(0, h) : href; const q = nh.indexOf("?"); return resolveMasterNav(q >= 0 ? nh.slice(0, q) : nh, q >= 0 ? nh.slice(q) : "", hash); };
const lab = (href: string) => { const x = r(href); return x ? `${x.group.label}/${x.page.label}/${x.tab?.label ?? "-"}` : "null"; };
check("mt(2-1) 旧トップ 17 href: 在庫以外の 16 が入口に解決・在庫は null（営業メニューへ＝ナビ外）", MASTER_OLD_HREFS.length === 17 && MASTER_OLD_HREFS.filter((h) => h !== "/master/stock").every((h) => r(h) !== null) && r("/master/stock") === null, MASTER_OLD_HREFS.map((h) => `${h}→${lab(h)}`).join(" "));
check("mt(2-2) 解決の形（MC2）: categories→商品管理/商品カテゴリ・pricing?tab=rules→料金適用ルール・pricing（無指定）→料金マスタ・cast-comp/systems（alias）→店舗設定/利用機能・system#features（alias）→店舗設定/利用機能・store-profile（無指定）→店舗設定/利用機能・store-profile?tab=info→店舗情報・store-profile?tab=data→権限・情報管理/データ管理・register→権限・情報管理/キャスト会計の許可・#secrets→権限・情報管理/機密情報・norma→報酬設定/ノルマ・system（無指定）→端末・印刷/打刻・レジ端末",
  lab("/master/categories") === "商品・料金/商品管理/商品カテゴリ" && lab("/master/pricing?tab=rules") === "商品・料金/料金・会計/料金適用ルール" && lab("/master/pricing") === "商品・料金/料金・会計/料金マスタ"
  && lab("/master/cast-comp/systems") === "店舗・運用/店舗設定/利用機能" && lab("/master/system#features") === "店舗・運用/店舗設定/利用機能" && lab("/master/store-profile") === "店舗・運用/店舗設定/利用機能"
  && lab("/master/store-profile?tab=info") === "店舗・運用/店舗設定/店舗情報" && lab("/master/store-profile?tab=data") === "スタッフ・システム/権限・情報管理/データ管理"
  && lab("/master/cast-comp/register") === "スタッフ・システム/権限・情報管理/キャスト会計の許可" && lab("/master/system#secrets") === "スタッフ・システム/権限・情報管理/機密情報"
  && lab("/master/cast-comp/norma") === "キャスト・報酬/報酬設定/ノルマ" && lab("/master/system") === "スタッフ・システム/端末・印刷/打刻・レジ端末" && lab("/master/seats") === "店舗・運用/席・卓/-",
  [lab("/master/cast-comp/systems"), lab("/master/system#features"), lab("/master/store-profile"), lab("/master/store-profile?tab=info"), lab("/master/store-profile?tab=data"), lab("/master/cast-comp/register"), lab("/master/system#secrets"), lab("/master/system")].join(" | "));
check("mt(2-3) ナビ未登録＝null: /master・/master/cast-comp（概要）・/master/stock／hash 不一致（/master/system#nope）は端末・印刷でタブ null／?tab 不一致（/master/store-profile?tab=x）は店舗設定でタブ null",
  r("/master") === null && r("/master/cast-comp") === null && r("/master/stock") === null && lab("/master/system#nope") === "スタッフ・システム/端末・印刷/-" && lab("/master/store-profile?tab=x") === "店舗・運用/店舗設定/-",
  [lab("/master/system#nope"), lab("/master/store-profile?tab=x")].join(" | "));

// (3) 検索
const pm = entries.find((p) => p.label === "商品管理")!, hs = entries.find((p) => p.label === "報酬設定")!, st = entries.find((p) => p.label === "席・卓")!, ss = entries.find((p) => p.label === "店舗設定")!;
check("mt(3-1) masterSearchHit: 「カテゴリ」→商品管理（タブ名）・「ノルマ」→報酬設定・「利用機能」→店舗設定・「席」→席・卓・空は全件・無関係は 0", masterSearchHit(pm, "カテゴリ") && masterSearchHit(hs, "ノルマ") && masterSearchHit(ss, "利用機能") && masterSearchHit(st, "席") && !masterSearchHit(st, "カテゴリ") && entries.every((p) => masterSearchHit(p, "  ")) && entries.every((p) => !masterSearchHit(p, "zzz-none")));

// (4) master-board
const mb = src("app/(manage)/master/master-board.tsx"), mbC = codeOf(mb);
check("mt(4-1) master-board: MASTER_NAV.map で 4 パネル・検索＝masterSearchHit・在庫カード／発注推奨の警告／fetchStockTotals／lowStock は無い・件数は hubCountOf／hubStatusOf・.nox-cardtitle／.nox-cardchev／.nox-carddesc 不変・入口カードは Link・店舗設定「2タブ」・権限・情報管理「3タブ」",
  mb.includes("{MASTER_NAV.map((g) => {") && mb.includes("masterSearchHit(p, hubSearch)") && !mbC.includes("/master/stock") && !mbC.includes("fetchStockTotals") && !mbC.includes("lowStock") && !mbC.includes("nox-alert")
  && mb.includes("hubCountOf(hubState, products.length)") && mb.includes("hubCountOf(hubState, seats.length)") && mb.includes("hubStatusOf(refState") && mb.includes('className="nox-cardtitle"') && mb.includes('className="nox-cardchev"') && mb.includes('className="nox-carddesc"')
  && mb.includes('<Link key={p.href} href={p.href} className="nox-fcard">') && mb.includes('case "/master/store-profile":\n        return { count: "2タブ"') && mb.includes('case "/master/cast-comp/register":\n        return { count: "3タブ"') && !mb.includes("読込中"));

// (5) subnav
const sn = src("app/(manage)/master/master-subnav.tsx");
check("mt(5-1) master-subnav: resolveMasterNav(pathname, search, hash)・hashchange 購読・群／入口の select 2 つ・入口内タブ＝.nox-seg の Link（on＝cur.tab）・「マスタ」は /master への Link",
  sn.includes("resolveMasterNav(pathname, search, hash)") && sn.includes('window.addEventListener("hashchange", apply)') && (sn.match(/<select/g) ?? []).length === 2 && sn.includes('aria-label="入口を切り替え"')
  && sn.includes("const on = p.href === cur?.tab?.href;") && sn.includes('<Link href="/master" style={crumbRoot}>マスタ</Link>') && sn.includes('className="nox-seg"'));

// (6) 在庫画面・料金画面
const sb = src("app/(manage)/master/stock/stock-board.tsx"), pb = src("app/(manage)/master/pricing/pricing-board.tsx"), pbC = codeOf(pb);
check("mt(6-1) stock-board: 発注推奨の警告（.nox-alert danger・reorder_point 判定）／pricing-board: ?tab= を読み初期タブ・内側ピル（.nox-pillbar）は無い（MC2）・「ルールで設定」は router.push(?tab=rules)・内容の 3 分岐（tab === ）は不変",
  sb.includes('className="nox-alert danger"') && sb.includes("p.reorder_point != null && (stock[p.id] ?? 0) <= (p.reorder_point ?? 0)")
  && pb.includes("useSearchParams()") && pb.includes('sp?.get("tab")') && pb.includes('useState<"master" | "rules" | "checkout">(initTab)') && !pbC.includes("nox-pillbar") && !pbC.includes('["master", "料金マスタ"], ["rules", "料金適用ルール"]')
  && pb.includes('router.push("/master/pricing?tab=rules")') && pb.includes('{tab === "rules" && (') && pb.includes('{tab === "master" && (') && pb.includes('{tab === "checkout" && ('));

// (7) 店舗設定ページ・パネルの節・system
const spp = src("app/(manage)/master/store-profile/page.tsx"), spn = src("app/(manage)/master/store-profile-panel.tsx"), syp = src("app/(manage)/master/system/page.tsx"), sypC = codeOf(syp);
check("mt(7-1) storeProfileTabOf: features 既定・info／data はそのまま・未知は features", storeProfileTabOf(undefined) === "features" && storeProfileTabOf("info") === "info" && storeProfileTabOf("data") === "data" && storeProfileTabOf("x") === "features" && storeProfileTabOf(null) === "features");
check("mt(7-2) store-profile page: ?tab＝storeProfileTabOf・利用機能＝SystemsBoard＋StoreProfilePanel sections ar／timeBasis＋FeatureFlagsPanel（owner）＋MineSettingsPanel・店舗情報＝sections profile／shift・データ管理＝sections data・住所／インボイスは端末・印刷への注記（二重編集なし）",
  spp.includes("storeProfileTabOf((await searchParams).tab)") && spp.includes('{tab === "features" && (') && spp.includes("<SystemsBoard storeId={systems.storeId}") && spp.includes('sections={["ar", "timeBasis"]}') && spp.includes("{isOwner && <FeatureFlagsPanel stores={stores} />}") && spp.includes("<MineSettingsPanel stores={stores} />")
  && spp.includes('{tab === "info" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["profile", "shift"]} />}') && spp.includes('{tab === "data" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["data"]} />}') && spp.includes("レシート・プリンタ」で編集します"));
check("mt(7-3) StoreProfilePanel: sections（既定＝全節 5）・profile＝店舗名／略称／店舗コード／表示名／送りの基本額・data＝利用目的／保持年数／操作ログ注記・timeBasis／shift／ar は節ごと・RPC と patchOf は不変（set_store_profile 1 回・set_store_pay_time_basis 1 回）",
  spn.includes('const ALL_SECTIONS: StoreProfileSection[] = ["profile", "data", "timeBasis", "shift", "ar"];') && spn.includes('{on("profile") && field("name", "店舗名"') && spn.includes('{on("data") && field("customer_purpose"') && spn.includes('{on("timeBasis") && <section') && spn.includes('{on("shift") && <section') && spn.includes('{isOwner && on("ar") && (')
  && (spn.match(/rpc\("set_store_profile"/g) ?? []).length === 1 && (spn.match(/rpc\("set_store_pay_time_basis"/g) ?? []).length === 1 && spn.includes(">勤務時間の計算基準</h2>"));
check("mt(7-4) system page: 機能の公開タブは無い（店舗設定 ＞ 利用機能へ・案内行＋リンク）・devices／pins／receipts／secrets は不変", !sypC.includes('key: "features"') && !sypC.includes("<FeatureFlagsPanel") && syp.includes('href="/master/store-profile?tab=features"') && sypC.includes('key: "devices"') && sypC.includes('key: "pins"') && sypC.includes('key: "receipts"') && sypC.includes('key: "secrets"'));

if (fails.length) {
  console.error(`verify:nox-master-top FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-master-top OK (${pass} checks)`);
console.log("マスタ整理（裁定330・MC1／MC2）: 4 群 9 入口・タブ構成・在庫はナビ外・旧 17 href の解決（alias）・検索・master-board／subnav の配線・在庫警告の移設・料金 ?tab（内側ピル無し）・店舗設定 3 面・system に機能の公開なし");
