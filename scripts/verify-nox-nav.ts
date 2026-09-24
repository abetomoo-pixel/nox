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
 *  逆テスト 1 本（手動・1 回）: MENU_FROM_GEAR を [] にする→nv(2-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { BOTTOM_PRIORITY, MENU_LABEL, activeHrefOf, splitNav, tabsFor, userChipLabelOf, type NavGroup } from "../lib/nox/ui/nav-tabs";

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

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-nav OK (${pass} checks)`);
