/*
 * verify:nox-cast-stats — B6-12 指名・出勤・集中度・商品／時間の純関数テスト（DB 非依存・走数外・裁定 B6-12／B6-10 ③・2026-09-11）。
 *   npm run verify:nox-cast-stats
 * 観点 4:
 *  1 top3ShareOf: 行 0→null／1 行／2 行／3 行超（上位 3 のみ）／同率／浮動小数の端数（小数 1 桁）／総和 0（呼び出し側が [] を渡す＝null）
 *  2 presentDaysOf: shukkin／dohan／late を数え off／absent を除外・同一 cast の複数日＝人日加算・cast 1・空→0/0
 *  3 productTimeOf: product＝drink＋champ＋bottle・time＝time・product＋time＋other＝5 分類の総和（sumCategories と結線）
 *  4 nomStoreOf: 1 行の整形・null 値は 0・行なし→null
 */
import { top3ShareOf, presentDaysOf, productTimeOf, nomStoreOf, PRESENT_STATUSES } from "../lib/nox/analytics/cast-stats";
import { sumCategories } from "../lib/nox/analytics/category-map";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ══ 1 top3ShareOf ══
check("cs(1a) 行 0→null（ランキング無し・総和 0 は呼び出し側が [] を渡す）", top3ShareOf([]) === null);
check("cs(1b) 1 行＝その行の %（100）／2 行＝2 行の合計（60.5＋39.5＝100）", top3ShareOf([{ pct: 100 }]) === 100 && top3ShareOf([{ pct: 60.5 }, { pct: 39.5 }]) === 100);
check("cs(1c) ★3 行超＝上位 3 のみ（45.3・25・17.2・12.5 → 87.5）・並びに依存しない（昇順で渡しても同じ）",
  top3ShareOf([{ pct: 45.3 }, { pct: 25 }, { pct: 17.2 }, { pct: 12.5 }]) === 87.5 && top3ShareOf([{ pct: 12.5 }, { pct: 17.2 }, { pct: 25 }, { pct: 45.3 }]) === 87.5,
  String(top3ShareOf([{ pct: 12.5 }, { pct: 17.2 }, { pct: 25 }, { pct: 45.3 }])));
check("cs(1d) 同率＝どの 3 行を取っても合計は同じ（30・30・30・10 → 90）", top3ShareOf([{ pct: 30 }, { pct: 30 }, { pct: 30 }, { pct: 10 }]) === 90);
check("cs(1e) 浮動小数の端数を小数 1 桁へ（33.3＋33.3＋33.3＝99.9・0.1＋0.2＋0.3＝0.6）", top3ShareOf([{ pct: 33.3 }, { pct: 33.3 }, { pct: 33.3 }, { pct: 0.1 }]) === 99.9 && top3ShareOf([{ pct: 0.1 }, { pct: 0.2 }, { pct: 0.3 }]) === 0.6);

// ══ 2 presentDaysOf ══
const att = [
  { cast_id: "c1", status: "shukkin" }, { cast_id: "c1", status: "dohan" }, { cast_id: "c1", status: "late" },   // 同一 cast 3 日
  { cast_id: "c2", status: "shukkin" },
  { cast_id: "c3", status: "off" }, { cast_id: "c4", status: "absent" },                                          // 除外
  { cast_id: "c2", status: "off" },                                                                              // c2 の休み＝人日に入れない
];
check("cs(2a) ★人日＝shukkin／dohan／late の行数（4）・distinct cast＝2（c1・c2）", eq(presentDaysOf(att), { days: 4, casts: 2 }), JSON.stringify(presentDaysOf(att)));
check("cs(2b) off／absent は 0（両方しか無ければ 0/0）・空→0/0", eq(presentDaysOf([{ cast_id: "x", status: "off" }, { cast_id: "y", status: "absent" }]), { days: 0, casts: 0 }) && eq(presentDaysOf([]), { days: 0, casts: 0 }));
check("cs(2c) 未知 status は数えない（fail-closed）・PRESENT_STATUSES は 3 値固定", eq(presentDaysOf([{ cast_id: "x", status: "unknown" }]), { days: 0, casts: 0 }) && eq([...PRESENT_STATUSES], ["shukkin", "dohan", "late"]));

// ══ 3 productTimeOf（sumCategories と結線）══
const lines = [
  { kind: "set", fee_kind: "set", amount: 60_000 }, { kind: "time", fee_kind: "extension", amount: 20_000 }, { kind: "charge", fee_kind: "vip_charge", amount: 5_000 },
  { kind: "drink", fee_kind: null, amount: 30_000 }, { kind: "champ", fee_kind: null, amount: 80_000 }, { kind: "bottle", fee_kind: null, amount: 40_000 },
  { kind: "charge", fee_kind: "hon_shimei", amount: 6_000 }, { kind: "discount", fee_kind: null, amount: -3_000 },
];
const sums = sumCategories(lines);
const pt = productTimeOf(sums);
check("cs(3a) ★商品売上（明細）＝drink＋champ＋bottle（150,000）／時間料金（明細）＝time＋set＋extension＋vip_charge（85,000）", eq(pt, { product: 150_000, time: 85_000 }), JSON.stringify(pt));
check("cs(3b) ★product＋time＋other＝5 分類の総和（150,000＋85,000＋6,000＝241,000＝sums.total・discount 3,000 は外）", pt.product + pt.time + sums.cats.other === sums.total && sums.total === 241_000 && sums.discount === 3_000);
check("cs(3c) 空＝0/0", eq(productTimeOf(sumCategories([])), { product: 0, time: 0 }));

// ══ 4 nomStoreOf ══
check("cs(4a) 1 行の整形（12／8／3）", eq(nomStoreOf({ hon_count: 12, jonai_count: 8, dohan_count: 3 }), { hon: 12, jonai: 8, dohan: 3 }));
check("cs(4b) null 値は 0・行なし（null／undefined）→null", eq(nomStoreOf({ hon_count: null, jonai_count: 2, dohan_count: null }), { hon: 0, jonai: 2, dohan: 0 }) && nomStoreOf(null) === null && nomStoreOf(undefined) === null);

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-cast-stats ALL PASS (${pass} assertions)`);
console.log("B6-12 指名・出勤・集中度・商品/時間(純関数): 上位3の構成%合計・出勤扱い shukkin/dohan/late の人日と cast 数・商品/時間の分離と総和一致・店合計指名の整形");
