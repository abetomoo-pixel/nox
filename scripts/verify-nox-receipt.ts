/* verify:nox-receipt — レシート XML 生成純関数のゴールデン（F4b-1）。
 *   npm run verify:nox-receipt（DB 不要・純関数のみ）
 *
 * 各ケースで (a) XML 全文の sha256 を pin（1文字でも動けば検知＝ゴールデン）＋
 * (b) 意味 assert（税額・合計・登録番号行有無・再発行・エスケープ・pay_group 分離）の二段構え。
 * 金額の期待値は check_group_due と同式の手計算（コメントに算式）。
 * ★全品 10% 内税前提（receipt.ts 冒頭）＝軽減 8% を足すときは F5 でゴールデン更新。
 */
import { createHash } from "node:crypto";
import {
  buildReceiptXml, displayWidth, escXml, jstStamp, taxOf,
  type ReceiptInput, type ReceiptLine, type ReceiptPayment,
} from "../lib/nox/receipt";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// ── 共通フィクスチャ ──────────────────────────────────────────
const STORE = {
  name: "CLUB NOX 歌舞伎町",
  address: "東京都新宿区歌舞伎町1-2-3 NOXビル5F",
  tel: "03-1234-5678",
  reg_no: "T1234567890123",
  footer: "またのご来店をお待ちしております",
};
const CHECK = {
  id: "bdc9debc-d167-4d3d-bbb8-a51459d6a4b9", // 伝票番号 = bdc9debc-A
  closed_at: "2026-07-16T14:30:00+09:00", // JST 2026/07/16 14:30
  nom_type: "hon",
};
const LINES_A: ReceiptLine[] = [
  { name_snapshot: "セット料金", qty: 1, unit_price_snapshot: 5000, line_total: 5000, kind: "set" },
  { name_snapshot: "キャストドリンク", qty: 2, unit_price_snapshot: 1500, line_total: 3000, kind: "drink" },
];
const CASH_8800: ReceiptPayment[] = [{ method: "cash", amount: 8800, tendered: 10000 }];

// T1 通常: gross 8000・net 8000・サ料10%=800・調整0・合計8800・税=floor(8800×10/110)=800
const t1: ReceiptInput = {
  store: STORE, check: CHECK, payGroup: "A",
  lines: LINES_A, payments: CASH_8800,
  serviceRate: 10, groupDue: 8800, isReprint: false,
};
// T2 割引: gross 8000−割引500＝net 7500・サ料750・8250→down 100 で 8200・調整−50・税=745
const t2: ReceiptInput = {
  ...t1,
  lines: [...LINES_A, { name_snapshot: "初回クーポン", qty: 1, unit_price_snapshot: 500, line_total: 500, kind: "discount" }],
  payments: [{ method: "cash", amount: 8200, tendered: 10000 }],
  groupDue: 8200,
};
// T3 割り勘 B: B の明細のみ・gross 3000・サ料300・合計3300・税=300
const t3: ReceiptInput = {
  store: STORE, check: CHECK, payGroup: "B",
  lines: [{ name_snapshot: "セットB", qty: 1, unit_price_snapshot: 3000, line_total: 3000, kind: "set" }],
  payments: [{ method: "card", amount: 3300, tendered: null }],
  serviceRate: 10, groupDue: 3300, isReprint: false,
};
// T4 再発行（T1 と同伝票・isReprint=true）
const t4: ReceiptInput = { ...t1, isReprint: true };
// T5 reg_no 空（未登録店＝登録番号行なし・住所/電話/フッタも空で最小ヘッダ）
const t5: ReceiptInput = {
  ...t1,
  store: { name: "CLUB NOX", address: "", tel: "", reg_no: "", footer: "" },
};
// T6 エスケープ: name_snapshot に XML 特殊文字
const t6: ReceiptInput = {
  ...t1,
  lines: [{ name_snapshot: `A&B<C>"D'E`, qty: 1, unit_price_snapshot: 8000, line_total: 8000, kind: "custom" }],
};
// T7 カード払い（tendered null＝お預かり/お釣り行なし）
const t7: ReceiptInput = { ...t1, payments: [{ method: "card", amount: 8800, tendered: null }] };

// ── ゴールデン sha256（buildReceiptXml の出力全文・変更時はゴールデン更新を明示コミット）──
const GOLDEN: Record<string, { input: ReceiptInput; sha: string }> = {
  "T1 通常":       { input: t1, sha: "18d63cb6304b7ea1a68cd5a038e21ce8caa467b703209a6d46cb547e28d2be9c" },
  "T2 割引あり":   { input: t2, sha: "269cad8254e81bcda9f401b796766ad4c55761e7d9ab588dab9f91c8f01a53ec" },
  "T3 割り勘B":    { input: t3, sha: "9f4d611e128b0e0943a0bc121477dd27a435d10623ebafbd133ad5cefa9fb72a" },
  "T4 再発行":     { input: t4, sha: "a90859020d9d9b1484aa91dfeeb4bcfb00e6358c1efdf82c143ebf5cd6c2ed0a" },
  "T5 reg_no 空":  { input: t5, sha: "13e737ceda29651015679777c8b8e8aac9c14f19261596fc73188c2623fe4602" },
  "T6 エスケープ": { input: t6, sha: "dce1134ebac9a5f3c7e7fd263fb98dcd6ff099f010501088adaf40bd630ef935" },
  "T7 カード":     { input: t7, sha: "f37ce906b2e91a6b463b2dd1b7324372381ac19b68d2a7dfd61128ccad78edd0" },
};

function main() {
  // 部品関数
  check("displayWidth: 半角=1", displayWidth("ABC12") === 5);
  check("displayWidth: 全角=2", displayWidth("あいう") === 6);
  check("displayWidth: 混在", displayWidth("¥1,000円") === 9, String(displayWidth("¥1,000円"))); // ¥=全角扱い(U+00A5>0x7F)=2+5半角+円2
  check("escXml: 5種すべて実体化", escXml(`&<>"'`) === "&amp;&lt;&gt;&quot;&apos;");
  check("jstStamp: JST 変換", jstStamp("2026-07-16T14:30:00+09:00") === "2026/07/16 14:30", jstStamp(CHECK.closed_at));
  check("jstStamp: UTC→JST", jstStamp("2026-07-16T05:30:00Z") === "2026/07/16 14:30");
  check("taxOf: floor(8800×10/110)=800", taxOf(8800) === 800);
  check("taxOf: floor(8200×10/110)=745", taxOf(8200) === 745, String(taxOf(8200)));
  check("taxOf: floor(3300×10/110)=300", taxOf(3300) === 300);

  const xml: Record<string, string> = {};
  for (const [label, g] of Object.entries(GOLDEN)) {
    xml[label] = buildReceiptXml(g.input);
    const h = sha(xml[label]);
    check(`${label} sha256 pin`, h === g.sha, `got ${h}`);
  }

  const x1 = xml["T1 通常"];
  // 意味 assert（T1）
  check("T1 ルート要素=ePOS-Print namespace", x1.startsWith(`<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">`) && x1.endsWith("</epos-print>"));
  check("T1 店名（倍角）", x1.includes(`<text dw="true" dh="true"/><text>CLUB NOX 歌舞伎町&#10;</text>`));
  check("T1 登録番号行あり", x1.includes("登録番号 T1234567890123"));
  check("T1 伝票番号=check_id 先頭8桁+group", x1.includes("No. bdc9debc-A"));
  check("T1 日時 JST", x1.includes("2026/07/16 14:30"));
  check("T1 明細 qty 表示（x2）", x1.includes("キャストドリンク x2") && x1.includes("¥3,000"));
  check("T1 小計 8000", x1.includes("小計") && x1.includes("¥8,000"));
  check("T1 サービス料(10%) 800", x1.includes("サービス料(10%)") && x1.includes("¥800"));
  check("T1 端数調整 行なし（調整0）", !x1.includes("端数調整"));
  check("T1 割引 行なし", !x1.includes("割引"));
  check("T1 合計 8800（倍角）＋内消費税10% 800", x1.includes("¥8,800") && x1.includes("（内消費税10%）") && x1.includes("¥800"));
  check("T1 現金・お預かり・お釣り", x1.includes("現金") && x1.includes("お預かり") && x1.includes("¥10,000") && x1.includes("お釣り") && x1.includes("¥1,200"));
  check("T1 フッタ", x1.includes("またのご来店をお待ちしております"));
  check("T1 再発行 表記なし", !x1.includes("再発行"));
  check("T1 nom_type 非印字（指名種別は出さない）", !x1.includes("hon") && !x1.includes("本指名"));
  check("T1 カット命令", x1.includes(`<feed line="3"/><cut type="feed"/>`));

  const x2 = xml["T2 割引あり"];
  check("T2 明細に割引マイナス表記", x2.includes("割引 初回クーポン") && x2.includes("-¥500"));
  check("T2 金額段: 小計8000/割引-500/サ料750/端数調整-50/合計8200",
    x2.includes("¥8,000") && x2.includes("サービス料(10%)") && x2.includes("¥750")
    && x2.includes("端数調整") && x2.includes("-¥50") && x2.includes("¥8,200"));
  check("T2 内消費税 745", x2.includes("¥745"));

  const x3 = xml["T3 割り勘B"];
  check("T3 伝票番号 = bdc9debc-B", x3.includes("No. bdc9debc-B"));
  check("T3 B の明細のみ（A の明細不在）", x3.includes("セットB") && !x3.includes("セット料金") && !x3.includes("キャストドリンク"));
  check("T3 合計 3300・税 300・カード", x3.includes("¥3,300") && x3.includes("¥300") && x3.includes("カード"));
  check("T3 お預かり行なし（tendered null）", !x3.includes("お預かり"));

  check("T4 再発行 表記あり", xml["T4 再発行"].includes("【再発行】"));

  const x5 = xml["T5 reg_no 空"];
  check("T5 登録番号行なし", !x5.includes("登録番号"));
  check("T5 住所/TEL/フッタ行なし", !x5.includes("TEL") && !x5.includes("東京都") && !x5.includes("お待ちして"));

  const x6 = xml["T6 エスケープ"];
  check("T6 特殊文字が実体参照化", x6.includes("A&amp;B&lt;C&gt;&quot;D&apos;E"));
  check("T6 生の < > がテキストに漏れない", !x6.includes(`>A&B<`));

  check("T7 カード 8800・お釣りなし", xml["T7 カード"].includes("カード") && !xml["T7 カード"].includes("お釣り"));

  // 幅の健全性: 全 <text> 行が 48 桁以内（明細・金額段の padLine 出力）
  for (const [label, x] of Object.entries(xml)) {
    const rows = [...x.matchAll(/<text>([^<]*)&#10;<\/text>/g)].map((m) => m[1]);
    const over = rows.filter((r) => displayWidth(r
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")) > 48);
    check(`${label} 全行 48 桁以内`, over.length === 0, JSON.stringify(over));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    // ゴールデン更新用に現在値を出す（意図した変更のときだけ書き換える）
    console.error("\n-- 現在の sha256（ゴールデン更新用） --");
    for (const [label, g] of Object.entries(GOLDEN)) console.error(`${label}: ${sha(buildReceiptXml(g.input))}`);
    process.exit(1);
  }
  console.log(`verify:nox-receipt ALL PASS (${pass} assertions)`);
  console.log(`T1 合計8800/税800・T2 割引→8200/税745/調整-50・T3 group B 3300/税300`);
}

main();
