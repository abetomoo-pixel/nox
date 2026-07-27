// デモ用フィクスチャ定義（seed:demo 専用・verify とは完全分離）。
// ★dev 専用。本番では実行しない（CLAUDE.md 規約・seed:f0 と同列）。
// prefix は「NOX-DEMO」系（verify の NOX-VERIFY-* と衝突しない）。

export const DEMO_ORG = "NOX-DEMO";
export const DEMO_STORE = "CLUB NOX";

/** owner は Agoora の既存 auth アカウントに結線する（新規 auth は作らない＝裁定(a)案） */
export const DEMO_OWNER_EMAIL = "abetomoo@gmail.com";
export const DEMO_OWNER_NAME = "阿部";

/** 黒服2名（can_register=true・1名のみ can_crm=true）。seed:demo が auth を作る＝SEED_PASSWORD */
export const DEMO_STAFF = [
  { email: "demo-staff1@example.com", name: "田中", perms: { can_register: true, can_crm: true, can_shift: true } },
  { email: "demo-staff2@example.com", name: "佐藤", perms: { can_register: true, can_crm: false, can_shift: false } },
] as const;

/** キャスト6名（comp は seed:f0 の型流用＝employment のみ・comp_plan は作らない） */
export const DEMO_CASTS = ["れいな", "ひなの", "みお", "さくら", "じゅり", "えま"] as const;

/** カテゴリ8本（sort_order 順）。「セット・チャージ」は商品0件＝空カテゴリの実例にもなる */
export const DEMO_CATEGORIES = [
  "グラス", "ボトル（焼酎）", "ボトル（ウイスキー）", "ボトル（ブランデー）",
  "シャンパン", "割りもの", "フード", "セット・チャージ",
] as const;
export type DemoCategory = (typeof DEMO_CATEGORIES)[number];

/**
 * 商品38件。
 *  - back: 基本は rate 10%（unit4 はシャンパンのみ＝指名種別ごとの単価）
 *  - cost: 売価の 20〜30%（100円丸め・null=原価未設定は作らない方針＝運用の見え方を確認するため全件に入れる）
 *  - reorder: ボトル/シャンパン系のみ 3〜5（グラス/割りもの/フードは null＝しきい無し）
 */
export type DemoProduct = {
  name: string; type: "drink" | "champ" | "bottle"; price: number; category: DemoCategory;
  cost: number; reorder: number | null; unit4?: { hon: number; jonai: number; dohan: number; free: number };
  honPt?: number;
};

const g = (name: string, price: number, cost: number): DemoProduct =>
  ({ name, type: "drink", price, category: "グラス", cost, reorder: null });
const sho = (name: string, price: number, cost: number, reorder: number): DemoProduct =>
  ({ name, type: "bottle", price, category: "ボトル（焼酎）", cost, reorder });
const wis = (name: string, price: number, cost: number, reorder: number): DemoProduct =>
  ({ name, type: "bottle", price, category: "ボトル（ウイスキー）", cost, reorder });
const bra = (name: string, price: number, cost: number, reorder: number): DemoProduct =>
  ({ name, type: "bottle", price, category: "ボトル（ブランデー）", cost, reorder });
// シャンパンは unit4（本指名/場内/同伴/フリーで単価が変わる＝unit4 モードの実例）＋本指名pt
const cha = (name: string, price: number, cost: number, reorder: number, u: [number, number, number, number], honPt: number): DemoProduct =>
  ({ name, type: "champ", price, category: "シャンパン", cost, reorder, unit4: { hon: u[0], jonai: u[1], dohan: u[2], free: u[3] }, honPt });
const wari = (name: string, price: number, cost: number): DemoProduct =>
  ({ name, type: "drink", price, category: "割りもの", cost, reorder: null });
const food = (name: string, price: number, cost: number): DemoProduct =>
  ({ name, type: "drink", price, category: "フード", cost, reorder: null });

export const DEMO_PRODUCTS: DemoProduct[] = [
  // グラス（7）
  g("ハウスウイスキー", 1500, 400), g("ハイボール", 1500, 400), g("焼酎水割り", 1500, 400),
  g("ビール", 1500, 400), g("レモンサワー", 1500, 400), g("カクテル", 2000, 500), g("ソフトドリンク", 1000, 200),
  // ボトル（焼酎）5
  sho("黒霧島", 12_000, 3000, 5), sho("茜霧島", 15_000, 4000, 4), sho("吉四六", 15_000, 4000, 4),
  sho("魔王", 35_000, 9000, 3), sho("森伊蔵", 80_000, 20_000, 3),
  // ボトル（ウイスキー）6
  wis("角瓶", 15_000, 4000, 5), wis("知多", 25_000, 6000, 4), wis("山崎NV", 60_000, 15_000, 3),
  wis("白州NV", 60_000, 15_000, 3), wis("響JH", 90_000, 22_000, 3), wis("マッカラン12年", 70_000, 18_000, 3),
  // ボトル（ブランデー）3
  bra("ヘネシーVS", 40_000, 10_000, 4), bra("ヘネシーXO", 120_000, 30_000, 3), bra("レミーXO", 120_000, 30_000, 3),
  // シャンパン（9・unit4）
  cha("モエ", 30_000, 8000, 5, [6000, 4500, 4500, 3000], 3),
  cha("ヴーヴイエロー", 40_000, 10_000, 4, [8000, 6000, 6000, 4000], 4),
  cha("ベルエポック", 140_000, 35_000, 3, [28_000, 21_000, 21_000, 14_000], 14),
  cha("ドンペリ", 130_000, 33_000, 3, [26_000, 19_500, 19_500, 13_000], 13),
  cha("ドンペリロゼ", 350_000, 88_000, 3, [70_000, 52_500, 52_500, 35_000], 35),
  cha("クリュッグ", 220_000, 55_000, 3, [44_000, 33_000, 33_000, 22_000], 22),
  cha("アルマンドゴールド", 260_000, 65_000, 3, [52_000, 39_000, 39_000, 26_000], 26),
  cha("ソウメイ", 140_000, 35_000, 3, [28_000, 21_000, 21_000, 14_000], 14),
  cha("エンジェルブラック", 260_000, 65_000, 3, [52_000, 39_000, 39_000, 26_000], 26),
  // 割りもの（4）
  wari("水", 800, 100), wari("炭酸", 800, 100), wari("お茶", 800, 100), wari("氷おかわり", 800, 100),
  // フード（4）
  food("ミックスナッツ", 1500, 400), food("チーズ盛り", 3000, 800), food("フルーツ盛り", 10_000, 2500), food("乾き物", 1500, 400),
];

/** 席8卓 */
export const DEMO_SEATS = [
  { name: "VIP1", kind: "VIP" as const, sort: 10 },
  { name: "VIP2", kind: "VIP" as const, sort: 20 },
  { name: "テーブル1", kind: "卓" as const, sort: 30 },
  { name: "テーブル2", kind: "卓" as const, sort: 40 },
  { name: "テーブル3", kind: "卓" as const, sort: 50 },
  { name: "テーブル4", kind: "卓" as const, sort: 60 },
  { name: "カウンター1", kind: "カウンター" as const, sort: 70 },
  { name: "カウンター2", kind: "カウンター" as const, sort: 80 },
];
