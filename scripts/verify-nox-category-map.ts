/*
 * verify:nox-category-map — 売上カテゴリ5分類の写像（lib/nox/analytics/category-map.ts）の単体検証。
 *   npm run verify:nox-category-map（DB 非依存・純関数のみ・★verify:f0 には入れない＝段53 の先行分。
 *   mig0096（T4 集計 RPC）到達時に段53 本体へ吸収し、RPC 出力→sumCategories の結線を実測で係留する）。
 *
 * assert:
 *  (1) kind 8値 × fee_kind 6値（null 含む）の全48組合せの帰属先を期待表と突合
 *      （正本＝E8-2 report-board の kindSums 写像と同値・fee_kind set/extension の将来耐性規則のみ追加）
 *  (2) 未知 kind の fail-safe（other 帰属・fee_kind set なら time）
 *  (3) discount の正値化（負値入力でも絶対値）
 *  (4) sumCategories の合成（live 実測形の混在リスト・total 恒等・nomFee 内訳・空リスト）
 */
import { categoryOf, sumCategories, CATEGORY_ORDER, CATEGORY_LABEL, type CategoryKey } from "../lib/nox/analytics/category-map";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// ── (1) 全組合せの期待表 ──
//   kind = check_lines_kind_check の8値（live CHECK 実測: set/time/charge/drink/champ/bottle/custom/discount）
//   fee_kind = check_lines_fee_kind_check の5値＋null
const KINDS = ["set", "time", "charge", "drink", "champ", "bottle", "custom", "discount"] as const;
const FEE_KINDS = [null, "set", "extension", "dohan", "hon_shimei", "jonai_shimei"] as const;

function expected(kind: string, feeKind: string | null): CategoryKey | "discount" {
  if (kind === "discount") return "discount"; // 値引きは fee_kind によらず別掲
  if (kind === "time" || kind === "set") return "time";
  if (kind === "drink") return "drink";
  if (kind === "champ") return "champ";
  if (kind === "bottle") return "bottle";
  // charge / custom: セット系 fee_kind のみ time（将来耐性）・他は指名・その他
  return feeKind === "set" || feeKind === "extension" ? "time" : "other";
}

for (const k of KINDS) {
  for (const f of FEE_KINDS) {
    const exp = expected(k, f);
    const got = categoryOf(k, f);
    check(`(1) categoryOf(${k}, ${f ?? "null"}) = ${exp}`, got === exp, `got ${got}`);
  }
}

// ── (2) 未知 kind の fail-safe ──
check("(2) 未知 kind → other", categoryOf("mystery", null) === "other", String(categoryOf("mystery", null)));
check("(2) 未知 kind + fee_kind=set → time（将来耐性規則）", categoryOf("mystery", "set") === "time");
check("(2) 未知 kind + fee_kind=hon_shimei → other", categoryOf("mystery", "hon_shimei") === "other");
check("(2) fee_kind 未指定（undefined）でも kind だけで解決", categoryOf("drink") === "drink");

// ── (3) discount の正値化 ──
{
  const s = sumCategories([
    { kind: "discount", fee_kind: null, amount: 500 },
    { kind: "discount", fee_kind: null, amount: -300 }, // CHECK 上は来ないが負値でも絶対値
  ]);
  check("(3) discount 正値化＝500+|-300|=800", s.discount === 800, String(s.discount));
  check("(3) discount は5分類の total に入らない", s.total === 0, String(s.total));
}

// ── (4) 合成（live 実測のクロス集計形を縮約した混在リスト）──
{
  const s = sumCategories([
    { kind: "set", fee_kind: null, amount: 5000 },            // セット商品行
    { kind: "time", fee_kind: "set", amount: 3000 },          // mig0089 分離のセット行
    { kind: "time", fee_kind: null, amount: 2000 },           // legacy time 行
    { kind: "charge", fee_kind: "hon_shimei", amount: 3000 }, // 指名料（本）
    { kind: "charge", fee_kind: "jonai_shimei", amount: 2000 },
    { kind: "charge", fee_kind: "dohan", amount: 4000 },
    { kind: "charge", fee_kind: null, amount: 10000 },        // fee_kind なし charge（live 1行実在）
    { kind: "drink", fee_kind: null, amount: 2500 },
    { kind: "champ", fee_kind: null, amount: 150000 },
    { kind: "bottle", fee_kind: null, amount: 40000 },
    { kind: "custom", fee_kind: null, amount: 1000 },
    { kind: "discount", fee_kind: null, amount: 1500 },
  ]);
  check("(4) time = 5000+3000+2000 = 10000", s.cats.time === 10000, String(s.cats.time));
  check("(4) drink = 2500", s.cats.drink === 2500);
  check("(4) champ = 150000", s.cats.champ === 150000);
  check("(4) bottle = 40000", s.cats.bottle === 40000);
  check("(4) other = 指名3本+無印charge+custom = 20000", s.cats.other === 20000, String(s.cats.other));
  check("(4) total = Σ5分類 = 222500（discount 除外）", s.total === 222500, String(s.total));
  check("(4) nomFee.hon = 3000", s.nomFee.hon === 3000);
  check("(4) nomFee.jonai = 2000", s.nomFee.jonai === 2000);
  check("(4) nomFee.dohan = 4000", s.nomFee.dohan === 4000);
  check("(4) nomFee 合計 ≤ other（無印 charge/custom は内訳外）", s.nomFee.hon + s.nomFee.jonai + s.nomFee.dohan <= s.cats.other);
  check("(4) discount = 1500", s.discount === 1500);
}
{
  const s = sumCategories([]);
  check("(4) 空リスト＝全0", s.total === 0 && s.discount === 0 && CATEGORY_ORDER.every((k) => s.cats[k] === 0));
}
check("(4) ラベル5種が CATEGORY_ORDER と1:1", CATEGORY_ORDER.length === 5 && CATEGORY_ORDER.every((k) => typeof CATEGORY_LABEL[k] === "string" && CATEGORY_LABEL[k].length > 0));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-category-map ALL PASS (${pass} assertions)`);
