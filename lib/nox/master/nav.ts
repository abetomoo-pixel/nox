// マスタ第2ナビの単一ソース（マスタIA再編 レーン①・裁定C → ★裁定330（マスタ整理・便 MC1・2026-10-01）で 3 層へ）。
//
// ★ここが唯一の定義。トップ（master-board の 4 パネル × 9 入口）・パンくず（群▾・入口▾）・入口内タブはすべてこの配列だけを見ている。
//   層＝群（4 パネル）→ 入口（9・モックの「9 入口」）→ タブ（既存の page／?tab=／#hash＝既存コンポーネントをそのまま配置・フォーム不変）。
//   URL は 1 本も変えない（旧 URL 維持＝旧カードの URL は該当する入口のタブとして解決される）。在庫（/master/stock）はマスタから外す（営業メニューの「在庫」へ）。
//   ★MC1 の仮決め（MC2 で動く）: キャスト会計／報酬制度は「報酬設定」のタブに仮置き（MC2 で権限・店舗設定へ）・機能の公開は「店舗設定」のタブに仮置き（MC2 で利用機能へ）・
//     「権限・情報管理」は機密・税務情報の 1 タブ（MC2 でキャスト会計・データ管理が入る）。
//
// 退化時の描画契約:
//   - 入口のタブが 2 つ未満 → タブ行そのものを出さない
//   - 現在パスがどの入口にも一致しない → resolveMasterNav が null＝パンくずは「マスタ」のみ（/master・/master/cast-comp 概要・/master/stock）
export type MasterNavTab = { label: string; href: string };
export type MasterNavPage = { label: string; href: string; desc: string; tabs?: MasterNavTab[]; ownerOnly?: boolean };
export type MasterNavGroup = { key: string; label: string; desc: string; pages: MasterNavPage[] };

export const MASTER_NAV: MasterNavGroup[] = [
  {
    key: "products",
    label: "商品・料金",
    desc: "お客様に提供する商品と料金",
    pages: [
      { label: "商品管理", href: "/master/products", desc: "商品一覧・商品カテゴリ",
        tabs: [{ label: "商品一覧", href: "/master/products" }, { label: "商品カテゴリ", href: "/master/categories" }] },
      { label: "料金・会計", href: "/master/pricing", desc: "料金マスタ・適用ルール・会計設定",
        tabs: [{ label: "料金マスタ", href: "/master/pricing?tab=master" }, { label: "料金適用ルール", href: "/master/pricing?tab=rules" }, { label: "会計設定", href: "/master/pricing?tab=checkout" }] },
    ],
  },
  {
    key: "cast-comp",
    label: "キャスト・報酬",
    desc: "報酬の条件と紹介料",
    pages: [
      { label: "報酬設定", href: "/master/cast-comp/plan", desc: "待遇プラン・控除・送り・ノルマ",
        tabs: [
          { label: "待遇プラン", href: "/master/cast-comp/plan" }, { label: "控除・送り", href: "/master/cast-comp/deduction" }, { label: "ノルマ", href: "/master/cast-comp/norma" },
          { label: "キャスト会計", href: "/master/cast-comp/register" }, // ★MC1 仮置き（MC2 で「権限・情報管理 ＞ 操作権限」へ）
          { label: "報酬制度", href: "/master/cast-comp/systems" }, // ★MC1 仮置き（MC2 で「店舗設定 ＞ 利用機能」へ）
        ] },
      { label: "紹介者・紹介料", href: "/master/referrers", desc: "紹介者の登録・紹介料の支払" }, // ★0152（裁定280-2／298-5）・便 U-2: 外部への支払を含むため待遇プランに混ぜない
    ],
  },
  {
    key: "store",
    label: "店舗・運用",
    desc: "利用機能と店舗の営業設定",
    pages: [
      { label: "店舗設定", href: "/master/store-profile", desc: "利用機能・店舗情報",
        tabs: [{ label: "店舗情報", href: "/master/store-profile" }, { label: "機能の公開", href: "/master/system#features" }] }, // ★MC1 仮置き（MC2 で利用機能／店舗情報の 2 タブへ）
      { label: "席・卓", href: "/master/seats", desc: "卓・カウンター・VIPの登録" },
      { label: "営業時間・定休日", href: "/master/business-hours", desc: "曜日別の営業時間・シフト運用" },
    ],
  },
  {
    key: "system",
    label: "スタッフ・システム",
    desc: "端末・権限・情報の取り扱い",
    pages: [
      { label: "端末・印刷", href: "/master/system", desc: "打刻・レジ端末、レシート・プリンタ", ownerOnly: true,
        tabs: [{ label: "打刻・レジ端末", href: "/master/system#devices" }, { label: "操作担当PIN", href: "/master/system#pins" }, { label: "レシート・プリンタ", href: "/master/system#receipts" }] },
      { label: "権限・情報管理", href: "/master/system#secrets", desc: "キャスト会計の許可・データ管理",
        tabs: [{ label: "機密・税務情報", href: "/master/system#secrets" }] }, // ★MC1: 1 タブ（MC2 でキャスト会計の許可・データ管理が入る）
    ],
  },
];

/** 旧トップ（17 カード）の href → 新構成の入口・タブ（旧 URL 維持＝redirect は不要・解決表として suite が係留）。在庫は営業メニューへ。 */
export const MASTER_OLD_HREFS: readonly string[] = [
  "/master/products", "/master/categories", "/master/stock", "/master/pricing",
  "/master/cast-comp/plan", "/master/cast-comp/deduction", "/master/cast-comp/norma", "/master/cast-comp/register", "/master/cast-comp/systems", "/master/referrers",
  "/master/seats", "/master/store-profile", "/master/business-hours", "/master/system#features",
  "/master/system#devices", "/master/system#receipts", "/master/system#secrets",
];

export type MasterNavHit = { group: MasterNavGroup; page: MasterNavPage; tab: MasterNavTab | null };

const splitHref = (href: string): { path: string; query: string; hash: string } => {
  const h = href.indexOf("#"); const hash = h >= 0 ? href.slice(h + 1) : ""; const noHash = h >= 0 ? href.slice(0, h) : href;
  const q = noHash.indexOf("?"); const query = q >= 0 ? noHash.slice(q + 1) : ""; const path = q >= 0 ? noHash.slice(0, q) : noHash;
  return { path, query, hash };
};

/**
 * 現在位置（pathname＋search＋hash）に対応する群／入口／タブを解決する。
 *   入口＝path の最長一致。同じ path の入口が複数（/master/system＝端末・印刷／権限・情報管理）は hash で選ぶ（hash 付きの入口は hash 一致のときだけ・無ければ hash 無しの入口）。
 *   タブ＝入口のタブのうち path・query（tab=）・hash がすべて一致するもの（無ければ null＝入口の先頭扱いは呼び手）。
 *   該当なしは null（/master・/master/cast-comp・/master/stock＝ナビ未登録のパス。パンくずだけ出して破綻させない）。
 */
export function resolveMasterNav(pathname: string, search = "", hash = ""): MasterNavHit | null {
  const curHash = hash.replace(/^#/, "");
  const curQuery = search.replace(/^\?/, "");
  const curTab = new URLSearchParams(curQuery).get("tab") ?? "";
  // 候補＝入口の href と各タブの href のうち、hash と ?tab が現在と矛盾しないもの（hash 付きは hash 一致のときだけ・?tab 付きは tab 一致のときだけ）
  const tabQ = (x: { query: string }) => new URLSearchParams(x.query).get("tab") ?? "";
  const okWith = (x: { query: string; hash: string }) => (x.hash === "" || x.hash === curHash) && (tabQ(x) === "" || tabQ(x) === curTab);
  const hitPath = (x: string) => pathname === x || pathname.startsWith(x + "/");
  let best: { group: MasterNavGroup; page: MasterNavPage; score: number } | null = null;
  for (const group of MASTER_NAV) {
    for (const page of group.pages) {
      const cands = [splitHref(page.href), ...(page.tabs ?? []).map((t) => splitHref(t.href))].filter(okWith).filter((x) => hitPath(x.path));
      if (cands.length === 0) continue;
      // 長い path を優先・同じ長さなら現在の hash に当たった候補（hash 無しの入口より hash 付きの入口／タブ）を優先
      const score = Math.max(...cands.map((x) => x.path.length * 10 + (curHash !== "" && x.hash === curHash ? 5 : 0)));
      if (!best || score > best.score) best = { group, page, score };
    }
  }
  if (!best) return null;
  const tabs = best.page.tabs ?? [];
  const tab = tabs.find((t) => { const s = splitHref(t.href); return s.path === pathname && (new URLSearchParams(s.query).get("tab") ?? "") === curTab && s.hash === curHash; })
    // タブ無指定（?tab も #hash も無い）＝同じ path の先頭タブ（pricing の初期 "master"・system の先頭タブと同じ既定）。hash 不一致は先頭に落とさない（null）
    ?? (curTab === "" && curHash === "" ? tabs.find((t) => splitHref(t.href).path === pathname) ?? null : null);
  return { group: best.group, page: best.page, tab };
}

/** 入口の数・在庫の不在（suite とトップが同じ関数で数える） */
export const masterEntryCount = (): number => MASTER_NAV.reduce((n, g) => n + g.pages.length, 0);
export const masterHasHref = (href: string): boolean => MASTER_NAV.some((g) => g.pages.some((p) => p.href === href || (p.tabs ?? []).some((t) => t.href === href)));

/** トップの検索＝入口のラベル・説明・タブ名のいずれかに当たる（大小無視・空は全件） */
export function masterSearchHit(page: MasterNavPage, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return page.label.toLowerCase().includes(s) || page.desc.toLowerCase().includes(s) || (page.tabs ?? []).some((t) => t.label.toLowerCase().includes(s));
}
