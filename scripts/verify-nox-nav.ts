/*
 * verify:nox-nav — 夜間便 N4（2026-09-24・裁定275 追補2）ナビの純関数 lib/nox/ui/nav-tabs.ts の係留（DB 不触・env 不要）。
 *   npm run verify:nox-nav。f0 71 段目。
 *
 *  (1) tabsFor(role): owner／manager／staff＝5 本「ホーム／レジ／日報／シフト／メニュー」・cast＝「レジ」1 本
 *  (2) splitNav: 優先 4 本の順・メニュー＝残り（群見出し保持）＋お知らせ（gear 群から移す）・歯車＝マスタ／監査／ご契約（お知らせ無し）・
 *      staff（gear＝お知らせのみ）は歯車 0・cast（レジ 1 本）はメニュー 0 歯車 0・spPriority 無し（/mine）は全項目が primary
 *  (3) activeHrefOf（最長一致）・userChipLabelOf（登録名｜役割・無ければメール・それも無ければ役割）
 *  (4) 配線（逐語 grep）: nav.tsx＝splitNav／MENU_LABEL／NavIcon（下タブ）・歯車 ⚙ は無い／header-chips＝HeaderGear／UserChip・ログアウト form POST /auth/signout／
 *      layout＝Link /dashboard（ロゴ＋店舗名）・HeaderGear＋UserChip・旧 rolePill／nox-tb-logout 無し・TabBar に gear 無し／CSS＝.nox-nav-bottom .nox-tab.on（上辺の線・太字）・.nox-navrow
 *  (5) ★便 U-2（2026-09-25・裁定300 の周辺）: マスタ第 2 ナビ MASTER_NAV＝キャスト・報酬群のタブ列（概要／待遇プラン／控除・送り／ノルマ／キャスト会計／報酬制度／紹介者）と
 *      店舗・端末群（席・卓／営業時間／スタッフ・システム＝紹介者は移動済み）・概要カード「キャスト・報酬」節の 6 枚（…報酬制度／紹介者・紹介料）・未払件数は referral_payouts の count（許可列挙・裁定260）
 *  逆テスト 1 本（手動・1 回）: MENU_FROM_GEAR を [] にする→nv(2-2) 赤・戻して緑／MASTER_NAV から「紹介者」を外す→nv(5-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { BOTTOM_PRIORITY, MENU_LABEL, activeHrefOf, splitNav, tabsFor, userChipLabelOf, type NavGroup } from "../lib/nox/ui/nav-tabs";
import { MASTER_NAV } from "../lib/nox/master/nav"; // ★U-2: マスタ第 2 ナビの許可列挙
import { hubCountOf, hubStatusOf } from "../lib/nox/ui/hub-count"; // ★Z152: 取得前は数値を描かない
import { OPEN_MENU_EVENT, hashTargetOf } from "../lib/nox/ui/nav-tabs"; // ★306-11

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// (1)
check("nv(1-1) tabsFor: owner／manager／staff＝ホーム／レジ／日報／シフト／メニュー（5 本）", ["owner", "manager", "staff"].every((r) => JSON.stringify(tabsFor(r)) === JSON.stringify(["ホーム", "レジ", "日報", "シフト", MENU_LABEL])));
check("nv(1-2) tabsFor: cast＝レジ 1 本", JSON.stringify(tabsFor("cast")) === JSON.stringify(["レジ"]));
// (2)
const ownerGroups: NavGroup[] = [
  { label: null, items: [{ href: "/dashboard", label: "ホーム" }] },
  { label: "営業", items: [{ href: "/register", label: "レジ" }, { href: "/report", label: "日報" }, { href: "/master/stock", label: "在庫" }] },
  { label: "スタッフ", items: [{ href: "/shift", label: "シフト" }, { href: "/casts", label: "キャスト" }, { href: "/staff", label: "スタッフ" }, { href: "/payroll", label: "給与" }] },
  { label: "顧客", items: [{ href: "/customers", label: "顧客" }] },
  { label: "分析", items: [{ href: "/analytics", label: "分析" }, { href: "/receipts", label: "領収書" }] },
  { label: "店舗", gear: true, items: [{ href: "/master", label: "マスタ" }, { href: "/notices", label: "お知らせ" }, { href: "/audit", label: "監査" }, { href: "/billing", label: "ご契約" }] },
];
const o = splitNav(ownerGroups, BOTTOM_PRIORITY);
check("nv(2-1) owner: 優先 4 本＝ホーム／レジ／日報／シフトの順", JSON.stringify(o.primary.map((i) => i.href)) === JSON.stringify(["/dashboard", "/register", "/report", "/shift"]));
check("nv(2-2) owner: メニュー＝在庫／キャスト／スタッフ／給与／顧客／分析／領収書＋お知らせ（群見出し保持・店舗群にお知らせ）", JSON.stringify(o.menuGroups.map((g) => [g.label, g.items.map((i) => i.href)])) === JSON.stringify([["営業", ["/master/stock"]], ["スタッフ", ["/casts", "/staff", "/payroll"]], ["顧客", ["/customers"]], ["分析", ["/analytics", "/receipts"]], ["店舗", ["/notices"]]]), JSON.stringify(o.menuGroups));
check("nv(2-3) owner: 歯車＝マスタ／監査／ご契約（お知らせは無い・gear=true）", JSON.stringify(o.gearGroups.map((g) => g.items.map((i) => i.href))) === JSON.stringify([["/master", "/audit", "/billing"]]) && o.gearGroups[0].gear === true);
const staffGroups: NavGroup[] = [
  { label: null, items: [{ href: "/dashboard", label: "ホーム" }] },
  { label: "営業", items: [{ href: "/register", label: "レジ" }, { href: "/report", label: "日報" }] },
  { label: "スタッフ", items: [{ href: "/shift", label: "シフト" }] },
  { label: "店舗", gear: true, items: [{ href: "/notices", label: "お知らせ" }] },
];
const st = splitNav(staffGroups, BOTTOM_PRIORITY);
check("nv(2-4) staff: 優先 4 本・メニュー＝お知らせだけ・歯車 0（ヘッダーの歯車は描かない）", st.primary.length === 4 && JSON.stringify(st.menuGroups) === JSON.stringify([{ label: "店舗", items: [{ href: "/notices", label: "お知らせ" }] }]) && st.gearGroups.length === 0);
const castSplit = splitNav([{ label: null, items: [{ href: "/register", label: "レジ" }] }], BOTTOM_PRIORITY);
check("nv(2-5) cast: レジ 1 本・メニュー 0・歯車 0", castSplit.primary.length === 1 && castSplit.menuGroups.length === 0 && castSplit.gearGroups.length === 0);
const mine = splitNav([{ label: null, items: [{ href: "/mine", label: "マイ" }, { href: "/mine/wishes", label: "希望" }, { href: "/mine/ranking", label: "ランキング" }, { href: "/mine/notices", label: "お知らせ" }] }]);
check("nv(2-6) /mine（spPriority 無し）: 4 本すべて primary・メニュー 0（従来どおり）", mine.primary.length === 4 && mine.menuGroups.length === 0 && mine.gearGroups.length === 0);
// (3)
check("nv(3-1) activeHrefOf: 最長一致（/mine/wishes は /mine と二重点灯しない・無関係は ''）", activeHrefOf("/mine/wishes", mine.primary) === "/mine/wishes" && activeHrefOf("/mine", mine.primary) === "/mine" && activeHrefOf("/register/x", ownerGroups.flatMap((g) => g.items)) === "/register" && activeHrepOfSafe());
function activeHrepOfSafe() { return activeHrefOf("/nothing", ownerGroups.flatMap((g) => g.items)) === ""; }
check("nv(3-2) userChipLabelOf: 登録名｜役割・登録名が無ければメール・どちらも無ければ役割のみ", userChipLabelOf({ name: "阿部", email: "a@x", roleJa: "オーナー" }) === "阿部｜オーナー" && userChipLabelOf({ name: " ", email: "a@x", roleJa: "店長" }) === "a@x｜店長" && userChipLabelOf({ name: null, email: null, roleJa: "黒服" }) === "黒服");
// (4)
const nav = fs.readFileSync("components/ui/nav.tsx", "utf8");
const hc = fs.readFileSync("components/ui/header-chips.tsx", "utf8");
const lay = fs.readFileSync("app/(manage)/layout.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const ic = fs.readFileSync("components/ui/nav-icons.tsx", "utf8");
check("nv(4-1) nav.tsx: splitNav で振り分け・5 本目は MENU_LABEL＋NavIcon(\"menu\")・下タブに歯車 ⚙ は無い・一覧型 NavListRow", /splitNav\(groups, spPriority\)/.test(nav) && /<NavIcon href="menu" \/>/.test(nav) && /\{MENU_LABEL\}/.test(nav) && !/⚙/.test(nav) && /<NavListRow /.test(nav) && /"menu": <>/.test(ic));
check("nv(4-2) header-chips: HeaderGear（⚙・gear 群 0 なら null）・UserChip（登録名｜役割→自分の情報＋ログアウト form POST /auth/signout）", /export function HeaderGear/.test(hc) && /if \(items\.length === 0\) return null;/.test(hc) && /⚙/.test(hc) && /export function UserChip/.test(hc) && /userChipLabelOf\(\{ name, email, roleJa \}\)/.test(hc) && /<form action="\/auth\/signout" method="post"/.test(hc) && /自分の情報/.test(hc));
check("nv(4-3) layout: ロゴは Link /dashboard＋店舗名（small）・右＝HeaderGear（splitNav の gearGroups）＋UserChip・旧 rolePill／nox-tb-logout は無い・TabBar に gear 無し・users 行の読取 1 本", /<Link href="\/dashboard" className="crumb nox-tb-brand"/.test(lay) && /<small>\{storeLabel\}<\/small>/.test(lay) && /<HeaderGear groups=\{splitNav\(groups/.test(lay) && /<UserChip name=\{meName\} email=\{meEmail\}/.test(lay) && !/t\.rolePill/.test(lay) && !/nox-tb-logout/.test(lay) && /<TabBar groups=\{groups\} spPriority=\{\["\/dashboard", "\/register", "\/report", "\/shift"\]\} hideSide \/>/.test(lay) && /from\("users"\)\.select\("name, email"\)\.eq\("auth_user_id"/.test(lay));
check("nv(4-4) CSS: 選択中の下タブ＝上辺の線＋太字（.nox-nav-bottom .nox-tab.on）・一覧型の行 .nox-navrow／.nox-navdesc／.nox-navchev・ヘッダーの口 .nox-hdrbtn・トークンのみ（新規 --変数 定義なし）", /\.nox-nav-bottom \.nox-tab\.on \{ border-top-color: var\(--primary-hover\); font-weight: 800; \}/.test(css) && /\.nox-navrow \.nox-navdesc/.test(css) && /\.nox-navrow \.nox-navchev/.test(css) && /\.nox-hdrbtn \{/.test(css) && !/N4[\s\S]{0,2500}--[a-z0-9-]+\s*:\s*[^;]+;\s*\/\*\s*新規/.test(css));

// (5) ★便 U-2: マスタ第 2 ナビと概要カード（許可列挙・裁定260）
const ccGrp = MASTER_NAV.find((g) => g.key === "cast-comp"), stGrp = MASTER_NAV.find((g) => g.key === "store");
check("nv(5-1) MASTER_NAV キャスト・報酬群のタブ列＝概要／待遇プラン／控除・送り／ノルマ／キャスト会計／報酬制度／紹介者（紹介者は報酬制度の隣・href /master/referrers）",
  JSON.stringify(ccGrp?.pages.map((p) => p.label)) === JSON.stringify(["概要", "待遇プラン", "控除・送り", "ノルマ", "キャスト会計", "報酬制度", "紹介者"]) && ccGrp?.pages[6]?.href === "/master/referrers", JSON.stringify(ccGrp?.pages.map((p) => p.label)));
check("nv(5-2) MASTER_NAV 店舗・端末群＝席・卓／営業時間／スタッフ・システム（紹介者は無い＝移動済み）・全群で /master/referrers は 1 回",
  JSON.stringify(stGrp?.pages.map((p) => p.label)) === JSON.stringify(["席・卓", "営業時間", "スタッフ・システム"]) && MASTER_NAV.flatMap((g) => g.pages).filter((p) => p.href === "/master/referrers").length === 1, JSON.stringify(stGrp?.pages.map((p) => p.label)));
const mb = fs.readFileSync("app/(manage)/master/master-board.tsx", "utf8");
const sec = mb.slice(mb.indexOf('sec: "キャスト・報酬"'), mb.indexOf('sec: "店舗・運用"'));
const titles = [...sec.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
check("nv(5-3) 概要カード「キャスト・報酬」節＝待遇プラン・報酬シミュレーター／控除・送りの設定／ノルマ設定／キャスト会計の許可／報酬制度／紹介者・紹介料（6 枚・許可列挙）",
  JSON.stringify(titles) === JSON.stringify(["待遇プラン・報酬シミュレーター", "控除・送りの設定", "ノルマ設定", "キャスト会計の許可", "報酬制度", "紹介者・紹介料"]), JSON.stringify(titles));
check("nv(5-5) ★Z152 hubCountOf／hubStatusOf: loading／error は「—」（数値なし）・error は「取得できませんでした」・ok は実数（0 を含む）", hubCountOf("loading", 5).text === "—" && hubCountOf("loading", 5).note === null && hubCountOf("error", 5).text === "—" && hubCountOf("error", 5).note === "取得できませんでした" && hubCountOf("ok", 0, "件").text === "0件" && hubCountOf("ok", 12).text === "12" && hubStatusOf("loading", "● 未払 3 件") === "● —" && hubStatusOf("error", "x") === "● 取得できませんでした" && hubStatusOf("ok", "● 未払 3 件") === "● 未払 3 件");
check("nv(5-6) ★Z152 配線: master-board の KPI 4 枚とカード件数は hubCountOf 経由（生の {products.length} 等を <strong> に描かない）・状態は hubStatusOf・紹介者の count は主取得と独立（try/catch の外）・「読込中」文言なし", (mb.match(/hubCountOf\(hubState, (products|categories|seats)\.length/g) || []).length >= 6 && mb.includes("hubCountOf(hubState, lowStock)") && !/<strong>\{(products|categories|seats)\.length\}/.test(mb) && !mb.includes("読込中") && mb.includes("hubStatusOf(refState") && mb.indexOf('setRefState("ok")') > mb.indexOf("} catch {"));
check("nv(6-1) ★306-11 hashTargetOf: 同じページのハッシュ→id・別ページ／ハッシュなし→null・OPEN_MENU_EVENT の名", hashTargetOf("/master/system#features", "/master/system") === "features" && hashTargetOf("/master/system#features", "/master") === null && hashTargetOf("/master", "/master") === null && OPEN_MENU_EVENT === "nox:open-menu");
{
  const hc = fs.readFileSync("components/ui/header-chips.tsx", "utf8");
  const nv2 = fs.readFileSync("components/ui/nav.tsx", "utf8");
  check("nv(6-2) ★306-11 ⚙: ≤899px は matchMedia で OPEN_MENU_EVENT を dispatch（ページ内パネル 0）・≥900px は現行 Modal＋hashTargetOf→scrollIntoView", hc.includes('window.matchMedia("(max-width: 899px)").matches') && hc.includes('new CustomEvent(OPEN_MENU_EVENT, { detail: { section: "settings" } })') && hc.includes("hashTargetOf(href, path)") && hc.includes("scrollIntoView(") && hc.includes("<Modal onClose={() => setOpen(false)} maxWidth={520} scroll>"));
  check("nv(6-3) ★306-11 メニューシート: 同一部品（Modal・NavListRow）に「設定」節（id nox-sheet-settings・gearGroups）・OPEN_MENU_EVENT を購読・戻る（popstate）／外側／×／Esc で閉じる（closeSheet＝history.back）", nv2.includes('id="nox-sheet-settings"') && nv2.includes("gearItems.map((it) => <NavListRow") && nv2.includes("window.addEventListener(OPEN_MENU_EVENT, onOpen)") && nv2.includes('window.addEventListener("popstate", onPop)') && nv2.includes("<Modal onClose={closeSheet} maxWidth={520} scroll>") && nv2.includes("window.history.back()"));
  const db2 = fs.readFileSync("app/(manage)/dashboard/dashboard-board.tsx", "utf8");
  const dp2 = fs.readFileSync("app/(manage)/dashboard/page.tsx", "utf8");
  const css2 = fs.readFileSync("app/globals.css", "utf8");
  check("nv(6-4) ★306-15／306-16 クイック操作タイル: NavIcon（href キー）・文字記号 icon 0（■☾▤◉▲¥♦✦◻◌）・タイルに「›」0", db2.includes("<NavIcon href={s.href} />") && !/icon: "/.test(dp2) && !/[■☾▤◉▲♦✦◻◌]/.test(dp2) && !/nox-quicktile">[\s\S]{0,300}›/.test(db2));
  check("nv(6-5) ★306-15 「›」の折返し禁止: マスタ概要カードは .nox-cardtitle＋.nox-cardchev（nowrap・h3 は flex）・説明は .nox-carddesc 1 行・メニュー行の .nox-navchev は nowrap", mb.includes('className="nox-cardtitle"') && mb.includes('className="nox-cardchev"') && mb.includes('className="nox-carddesc"') && css2.includes(".nox-grid3 h3 .nox-cardchev { flex: 0 0 auto; white-space: nowrap; }") && css2.includes(".nox-grid3 h3 { display: flex;") && css2.includes(".nox-navrow .nox-navchev { flex: 0 0 auto; white-space: nowrap; }"));
}
check("nv(5-4) 紹介者カード: href /master/referrers・バッジ「支払」・状態「未払 n 件」＝referral_payouts の unpaid count（head・fetch +1）・0 は「未払なし」",
  sec.includes('href: "/master/referrers"') && sec.includes('count: "支払"') && sec.includes("`● 未払 ${unpaidRef} 件`") && sec.includes('"● 未払なし"') && mb.includes('from("referral_payouts").select("id", { count: "exact", head: true }).eq("status", "unpaid")'));
if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-nav OK (${pass} checks)`);
