// ★夜間便 N4（2026-09-24・裁定275 追補2）: ナビの純関数（DB を知らない・React を知らない）。
//   1 下タブは 5 本「ホーム／レジ／日報／シフト／メニュー」（その他→メニュー・歯車は下タブから外す）。メニューにお知らせを置く。
//   2 歯車はヘッダー右（マスタ・監査・ご契約）。
//   ★ルート／URL／ページ実体／権限ゲートは非改変＝ここは並びと振り分けだけ（項目集合は (manage)/layout が role で組む）。
export type NavItem = { href: string; label: string };
export type NavGroup = { label: string | null; items: NavItem[]; gear?: boolean };

/** ≤899 の下タブに出す優先 4 本（裁定275 M13 の並び） */
export const BOTTOM_PRIORITY = ["/dashboard", "/register", "/report", "/shift"] as const;
export const MENU_LABEL = "メニュー";
export const GEAR_LABEL = "設定";
/** メニューに移す gear 群の項目（275 追補2-1: お知らせはメニュー） */
export const MENU_FROM_GEAR = ["/notices"] as const;

/** 一覧型（アイコン＋説明＋「›」）の説明文。無い href は説明なしで出る（項目が増えても壊れない） */
export const NAV_DESC: Record<string, string> = {
  "/dashboard": "今日の売上・出勤・お知らせ",
  "/register": "卓と伝票・会計",
  "/report": "日報の締めと現金・売掛",
  "/master/stock": "在庫の入出庫と棚卸",
  "/shift": "希望・配置・出勤記録",
  "/casts": "キャストの登録と報酬プラン",
  "/staff": "スタッフの登録と権限",
  "/payroll": "給与の確定・支払い・明細",
  "/customers": "顧客名簿と来店履歴",
  "/analytics": "売上・人件費の分析",
  "/receipts": "領収書の発行台帳",
  "/notices": "店からのお知らせ",
  "/master": "商品・料金・制度などの設定",
  "/audit": "操作の記録（オーナー）",
  "/billing": "ご契約とお支払い",
};

/** 下タブのラベル（role 別）。cast はレジ 1 本（有効 cast のみ (manage) に入れる＝従来）。 */
export function tabsFor(role: string): string[] {
  if (role === "cast") return ["レジ"];
  return ["ホーム", "レジ", "日報", "シフト", MENU_LABEL];
}

/** groups を ≤899 の 3 つに振り分ける: primary（優先順の最大 4 本）・menuGroups（残り＋gear 群から MENU_FROM_GEAR）・gearGroups（gear 群の残り）。
 *  spPriority 未指定＝非 gear の全項目を primary に（/mine の 4 本＝従来どおり・メニューは出ない）。 */
export function splitNav(groups: readonly NavGroup[], spPriority?: readonly string[]): { primary: NavItem[]; menuGroups: NavGroup[]; gearGroups: NavGroup[] } {
  const nonGear = groups.filter((g) => !g.gear);
  const flatNonGear = nonGear.flatMap((g) => g.items);
  const primary = spPriority
    ? spPriority.map((href) => flatNonGear.find((it) => it.href === href)).filter((x): x is NavItem => !!x).slice(0, 4)
    : flatNonGear;
  const isPrimary = (it: NavItem) => primary.some((p) => p.href === it.href);
  const menuGroups: NavGroup[] = nonGear
    .map((g) => ({ label: g.label, items: g.items.filter((it) => !isPrimary(it)) }))
    .filter((g) => g.items.length > 0);
  const gearGroups: NavGroup[] = [];
  for (const g of groups.filter((x) => x.gear)) {
    const toMenu = g.items.filter((it) => (MENU_FROM_GEAR as readonly string[]).includes(it.href));
    const stay = g.items.filter((it) => !(MENU_FROM_GEAR as readonly string[]).includes(it.href));
    if (toMenu.length > 0) menuGroups.push({ label: g.label, items: toMenu });
    if (stay.length > 0) gearGroups.push({ label: g.label, items: stay, gear: true });
  }
  return { primary, menuGroups, gearGroups };
}

/** 最長一致で active を 1 つに絞る（/mine と /mine/wishes の二重点灯を防ぐ＝TabBar／SideNav と同じ規則） */
export function activeHrefOf(path: string, items: readonly NavItem[]): string {
  return items.reduce<string>((best, it) => {
    const hit = path === it.href || path.startsWith(it.href + "/");
    if (!hit) return best;
    return it.href.length > best.length ? it.href : best;
  }, "");
}

/** ヘッダー右の「登録名｜役割」の表示文字（登録名が無ければメール・それも無ければ役割のみ） */
export function userChipLabelOf(input: { name: string | null | undefined; email: string | null | undefined; roleJa: string }): string {
  const n = (input.name ?? "").trim() || (input.email ?? "").trim();
  return n ? `${n}｜${input.roleJa}` : input.roleJa;
}
