/*
 * verify:nox-pay — payOf 純関数の全項目網羅テスト（DB 不要）。
 *   npm run verify:nox-pay
 *
 * 構成（BANZEN verify:* の構造を踏襲・assert 失敗で exit 1）:
 *  T1  玲奈ケース回帰（モック seed 忠実・加重時給 5170 / 総 110.1h / 売上0・pt7・保証15）
 *      ＋ gross/net のゴールデン固定（移植直後の出力をスナップショット）
 *  T2  階段関数 slideAt（at 境界・最後にマッチした段・無マッチ0）
 *  T3  override 反映（eplan/hasOv）
 *  T4  商品バック rate/unit4 両モード
 *  T5  売上バック率の境界（400k/800k/1.5M）
 *  T6  自由バック basis/cond（未達0・達成加算）
 *  T7  源泉（委託式・max0 クランプ・雇用0）
 *  T8  控除 per 3種・罰金・ノルマ達成/未達
 *  T9  net 恒等式＋全金額整数（浮動小数禁止）
 *  T10 シミュレーター（係数 1−源泉率・days 上書きは timePay 不変）
 *
 * 玲奈 seed の出典: mock/nox-nightwork-app.html
 *   fl[0]（days22/hon48/jonai30/dohan12/sales1,850,000）・p_hi・Jc[1]（Ci=110pt/G1 drink122,500 champ68,000）
 *   Li（送り2000/day・厚生5000/month）・zu（当欠10000/遅刻3000/シフト5h）・ot（on/5000+2000/3000+1500）
 *   hi[エース]（ノルマ days24/dohan15）・mm（皆勤300/日・シャンパン8本30000・売上150万2%）
 *   Et=Jc（champCnt=8+1=9・bottleCnt=0）・Ei（送り実費 3500）・N="委託"
 */
import {
  payOf,
  slideAt,
  applyOverride,
  productBackOf,
  allocateQty,
  salesRateOf,
  customBacks,
  withholdingOf,
  fixedDedOf,
  normPenaltyOf,
  simAddedPay,
  castPts,
  type CompPlan,
  type DailyRecord,
  type PayInput,
  type Product,
  type Metrics,
} from "../lib/nox/pay";

// ── assert ────────────────────────────────────────────────────
let pass = 0;
const fails: string[] = [];
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fails.push(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── モック iS の翻訳（日次データ生成・テスト fixture 専用）──────
// 出典: mock/nox-nightwork-app.html function iS(a,e)
// 売上を固定ウェイト t で日割り（端数は最終日に寄せる）・労働時間は基準 h×ウェイト s。
function mockDaily(
  cast: { days: number; sales: number },
  hoursPerShift = 5,
): DailyRecord[] {
  const t = [1.4, 1, 0.6, 1.1, 0.8, 1.2];
  const s = [1, 1.1, 0.85, 1, 0.9, 1.15];
  const o = cast.days;
  if (o <= 0) return [];
  let n = 0;
  const f: number[] = [];
  for (let L = 0; L < o; L++) {
    f.push(t[L % t.length]);
    n += t[L % t.length];
  }
  const out: DailyRecord[] = [];
  let p = 0;
  for (let L = 0; L < o; L++) {
    let M = Math.round((cast.sales * f[L]) / n);
    if (L === o - 1) M = Math.max(0, cast.sales - p);
    p += M;
    const w = Math.round(hoursPerShift * s[L % s.length] * 10) / 10;
    out.push({ d: L + 1, hours: w, sales: M });
  }
  return out;
}

// ── モック seed（p_hi・玲奈）──────────────────────────────────
const P_HI: CompPlan = {
  id: "p_hi",
  name: "特別待遇（高）",
  base: 5000,
  honBack: 4000,
  jonaiBack: 1500,
  dohanBack: 4000,
  salesSlide: [
    { at: 80_000, wage: 4000 },
    { at: 150_000, wage: 5500 },
    { at: 250_000, wage: 7000 },
  ],
  pointSlide: [
    { at: 5, wage: 4000 },
    { at: 10, wage: 5500 },
    { at: 16, wage: 7000 },
  ],
};

const REINA = { hon: 48, jonai: 30, dohan: 12, days: 22, sales: 1_850_000 };
const REINA_INPUT: PayInput = {
  cast: REINA,
  daily: mockDaily(REINA, 5),
  plan: P_HI,
  productBack: { drink: 122_500, champ: 68_000, bottle: 0 }, // nS: 500*140+750*70 / 6000*8+20000*1
  pointProducts: 110, // dS: c_champ8*10 + c_tower1*30
  customBackDefs: [
    { id: "cb_kaikin", name: "皆勤手当", basis: "days", value: 300 },
    {
      id: "cb_champ",
      name: "シャンパン8本ボーナス",
      basis: "flat",
      value: 30_000,
      cond: { metric: "champCnt", min: 8 },
    },
    {
      id: "cb_sales",
      name: "売上150万達成2%",
      basis: "sales",
      value: 2,
      cond: { metric: "sales", min: 1_500_000 },
    },
  ],
  metrics: { champCnt: 9, bottleCnt: 0 }, // Et=Jc: c_champ8 + c_tower1
  deductions: [
    { id: "send", name: "送り代", amount: 2000, per: "day" },
    { id: "kousei", name: "厚生費", amount: 5000, per: "month" },
  ],
  penalty: { fineAbsent: 10_000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: true, daysFlat: 5000, daysPer: 2000, dohanFlat: 3000, dohanPer: 1500 },
  norm: { days: 24, dohan: 15 }, // hi[エース]
  fine: { absentN: 0, lateN: 0 },
  arDeduct: 0,
  advanceDeduct: 0,
  okuriDeduct: 3500, // Ei ok1
  taxMode: "委託",
};

// ── T1a 玲奈ケース回帰（設計書ゴールデン＝本指名商品pt を含めない）──
// 計算ロジック設計 §6 の「加重¥5,170・総110.1h・売上0/pt7/保証15」は
// pts = hon*3 + jonai*1 + dohan*2（本指名商品pt 除外）で計算された値
// （モック生コードの実行で確認済み: Ci=0 → 5170 / Ci=110 → 5931）。
// 精密仕様 §0.1 の式（本指名商品pt 加算）とゴールデン数値は設計書内で不整合。
// 実装は §0.1 の式（＝モック実コード）に従い、本ケースは pointProducts=0 で数値を検証する。
const reinaDoc = payOf({ ...REINA_INPUT, pointProducts: 0 });
eq("T1a wage（設計書ゴールデン 5170）", reinaDoc.wage, 5170);
eq("T1a wHours（110.1）", reinaDoc.wHours, 110.1);
eq("T1a wbasis 売上=0", reinaDoc.wbasis["売上"] ?? 0, 0);
eq("T1a wbasis ポイント=7", reinaDoc.wbasis["ポイント"], 7);
eq("T1a wbasis 保証=15", reinaDoc.wbasis["保証"], 15);
eq("T1a timePay", reinaDoc.timePay, 569_200);
eq("T1a gross", reinaDoc.gross, 1_303_300);
eq("T1a withholding", reinaDoc.withholding, 121_836);
eq("T1a net", reinaDoc.net, 1_112_464);

// ── T1b 玲奈ケース回帰（モック完全再現＝本指名商品pt 110 を含む）──
// mock/nox-nightwork-app.html の live 実装（Py + te・Ci[1]=110）と同値。
const reina = payOf(REINA_INPUT);
eq("T1b wage（モック忠実 5931）", reina.wage, 5931);
eq("T1b wHours（110.1）", reina.wHours, 110.1);
eq("T1b wbasis 売上=0", reina.wbasis["売上"] ?? 0, 0);
eq("T1b wbasis ポイント=18", reina.wbasis["ポイント"], 18);
eq("T1b wbasis 保証=4", reina.wbasis["保証"], 4);
eq("T1b honBack", reina.honBack, 192_000);
eq("T1b jonaiBack", reina.jonaiBack, 45_000);
eq("T1b dohanBack", reina.dohanBack, 48_000);
eq("T1b sRate", reina.sRate, 0.1);
eq("T1b salesBack", reina.salesBack, 185_000);
eq("T1b customTotal（6600+30000+37000）", reina.customTotal, 73_600);
eq("T1b fixedDed（送り2000×22+厚生5000）", reina.fixedDed, 49_000);
eq("T1b fine", reina.fine, 0);
eq("T1b normPenalty（days 9000 + dohan 7500）", reina.normPenalty, 16_500);
eq("T1b okuriDeduct", reina.okuriDeduct, 3500);
eq("T1b timePay（ゴールデン）", reina.timePay, 653_050);
eq("T1b gross（ゴールデン）", reina.gross, 1_387_150);
eq("T1b withholding（ゴールデン）", reina.withholding, 130_397);
eq("T1b net（ゴールデン）", reina.net, 1_187_753);

// ── T2 階段関数 ───────────────────────────────────────────────
eq("T2 at ちょうど（80k→4000）", slideAt(P_HI.salesSlide, 80_000), 4000);
eq("T2 at 未満（79,999→0）", slideAt(P_HI.salesSlide, 79_999), 0);
eq("T2 最上段（250k→7000）", slideAt(P_HI.salesSlide, 250_000), 7000);
eq("T2 中段（249,999→5500）", slideAt(P_HI.salesSlide, 249_999), 5500);
eq("T2 空スライド→0", slideAt([], 999_999), 0);
eq("T2 undefined→0", slideAt(undefined, 999_999), 0);

// ── T3 override ───────────────────────────────────────────────
{
  const { eplan, hasOv } = applyOverride(P_HI, { honBack: 5000, base: 5500 });
  eq("T3 override honBack", eplan.honBack, 5000);
  eq("T3 override base", eplan.base, 5500);
  eq("T3 非上書き項目は plan 値", eplan.jonaiBack, 1500);
  eq("T3 hasOv=true", hasOv, true);
  eq("T3 override なし hasOv=false", applyOverride(P_HI).hasOv, false);
}

// ── T4 商品バック rate/unit4 ──────────────────────────────────
const D_SHIMEI: Product = {
  id: "d_shimei", name: "指名ドリンク", price: 1500, cost: 300, rate: 50,
  backMode: "rate",
  unit4: { hon: 900, jonai: 750, dohan: 750, free: 600 },
  honPt: 2, type: "drink",
} as Product;
const C_CHAMP_U4: Product = { ...D_SHIMEI, id: "c_champ", price: 30_000, rate: 20, backMode: "unit4", unit4: { hon: 7000, jonai: 6000, dohan: 6000, free: 5000 }, type: "champ" };
eq("T4 rate モード（1500×50%×3）", productBackOf(D_SHIMEI, "free", 3), 2250);
eq("T4 unit4 hon（7000×2）", productBackOf(C_CHAMP_U4, "hon", 2), 14_000);
eq("T4 unit4 jonai（6000×1）", productBackOf(C_CHAMP_U4, "jonai", 1), 6000);
eq("T4 unit4 free（5000×1）", productBackOf(C_CHAMP_U4, "free", 1), 5000);

// ── T5 売上バック率の境界 ─────────────────────────────────────
eq("T5 1.5M→10%", salesRateOf(1_500_000), 0.1);
eq("T5 1,499,999→7%", salesRateOf(1_499_999), 0.07);
eq("T5 800k→7%", salesRateOf(800_000), 0.07);
eq("T5 799,999→5%", salesRateOf(799_999), 0.05);
eq("T5 400k→5%", salesRateOf(400_000), 0.05);
eq("T5 399,999→3%", salesRateOf(399_999), 0.03);
eq("T5 0→3%", salesRateOf(0), 0.03);

// ── T6 自由バック ─────────────────────────────────────────────
{
  const metrics: Metrics = { hon: 48, jonai: 30, dohan: 12, days: 22, sales: 1_850_000, pt: 110, champCnt: 9, bottleCnt: 0 };
  const defs = REINA_INPUT.customBackDefs;
  const r = customBacks(defs, metrics);
  eq("T6 days basis（22×300）", r[0].amount, 6600);
  eq("T6 flat cond 達成（9≥8）", r[1].amount, 30_000);
  eq("T6 sales basis 2%（1.85M）", r[2].amount, 37_000);
  const unmet = customBacks(defs, { ...metrics, champCnt: 7, sales: 1_400_000 });
  eq("T6 cond 未達 amount=0", unmet[1].amount, 0);
  eq("T6 cond 未達 met=false", unmet[1].met, false);
  eq("T6 sales cond 未達（1.4M<1.5M）=0", unmet[2].amount, 0);
}

// ── T7 源泉 ───────────────────────────────────────────────────
eq("T7 委託（(500000−110000)×0.1021）", withholdingOf(500_000, 22, "委託"), 39_819);
eq("T7 雇用=0", withholdingOf(500_000, 22, "雇用"), 0);
eq("T7 マイナスは 0 クランプ", withholdingOf(50_000, 22, "委託"), 0);

// ── T8 控除・罰金・ノルマ ─────────────────────────────────────
eq("T8 per=day+month（2000×22+5000）", fixedDedOf(REINA_INPUT.deductions, 22, 0), 49_000);
eq("T8 per=rate（売上100,000×3%）", fixedDedOf([{ id: "r", name: "率控除", amount: 3, per: "rate" }], 22, 100_000), 3000);
{
  const withFine = payOf({ ...REINA_INPUT, fine: { absentN: 2, lateN: 1 } });
  eq("T8 罰金（2×10000+1×3000）", withFine.fine, 23_000);
}
eq("T8 ノルマ未達（22/24・12/15）", normPenaltyOf(REINA_INPUT.normConfig, { days: 24, dohan: 15 }, 22, 12), 16_500);
eq("T8 ノルマ達成=0", normPenaltyOf(REINA_INPUT.normConfig, { days: 24, dohan: 15 }, 24, 15), 0);
eq("T8 norm.on=false=0", normPenaltyOf({ ...REINA_INPUT.normConfig, on: false }, { days: 24, dohan: 15 }, 0, 0), 0);

// ── T9 net 恒等式＋整数保証 ───────────────────────────────────
{
  const r = reina;
  eq(
    "T9 net 恒等式",
    r.net,
    r.gross - r.fixedDed - r.fine - r.withholding - r.arDeduct - r.advanceDeduct - r.okuriDeduct - r.normPenalty,
  );
  eq(
    "T9 gross 恒等式",
    r.gross,
    r.timePay + r.honBack + r.jonaiBack + r.dohanBack + r.drinkBack + r.champBack + r.bottleBack + r.salesBack + r.customTotal,
  );
  const moneyFields = [
    r.wage, r.timePay, r.honBack, r.jonaiBack, r.dohanBack, r.drinkBack, r.champBack,
    r.bottleBack, r.salesBack, r.customTotal, r.gross, r.fixedDed, r.fine, r.withholding,
    r.arDeduct, r.advanceDeduct, r.okuriDeduct, r.normPenalty, r.net,
  ];
  eq("T9 全金額フィールドが整数", moneyFields.every(Number.isInteger), true);
}

// ── T10 シミュレーター ────────────────────────────────────────
eq("T10 係数 委託（5170×5h×(1−0.1021)×3日）", simAddedPay(5170, 5, 3, "委託"), 69_633);
eq("T10 係数 雇用（源泉なし=1.0）", simAddedPay(5170, 5, 3, "雇用"), 77_550);
{
  const sim = payOf({ ...REINA_INPUT, sim: { days: 24 } });
  eq("T10 days 上書きで timePay 不変", sim.timePay, reina.timePay);
  eq("T10 days 上書きで fixedDed 連動（2000×24+5000）", sim.fixedDed, 53_000);
  eq("T10 days 達成で days ペナルティ消滅（dohan 7500 のみ）", sim.normPenalty, 7500);
  const simD = payOf({ ...REINA_INPUT, sim: { days: 24, dohan: 15 } });
  eq("T10 dohan 上書きで dohanBack 連動（15×4000）", simD.dohanBack, 60_000);
  eq("T10 全ノルマ達成で normPenalty=0", simD.normPenalty, 0);
}

// ── T11 allocateQty（最大剰余法・精密仕様 §2.2.1）────────────
eq("T11 3個を6:4（剰余8>2で先頭+1）", allocateQty(3, [6, 4]), [2, 1]);
eq("T11 1個を1:1（同値タイは先頭）", allocateQty(1, [1, 1]), [1, 0]);
eq("T11 7個を1:1:1（floor2×3+先頭1）", allocateQty(7, [1, 1, 1]), [3, 2, 2]);
eq("T11 割り切れは剰余配布なし", allocateQty(10, [3, 3, 4]), [3, 3, 4]);
eq("T11 単独指名は全量", allocateQty(5, [5]), [5]);
eq("T11 空 weights は空配列", allocateQty(3, []), []);
{
  const cases: Array<[number, number[]]> = [
    [3, [6, 4]], [1, [1, 1]], [7, [1, 1, 1]], [10, [3, 3, 4]], [11, [7, 2, 5]], [2, [9, 1]],
  ];
  eq(
    "T11 Σ分配 = qty（恒等・全ケース）",
    cases.every(([q, w]) => allocateQty(q, w).reduce((a, b) => a + b, 0) === q),
    true,
  );
}

// ── 結果 ──────────────────────────────────────────────────────
// castPts の確認（玲奈: 48*3+30+12*2+110 = 308）も含める
eq("補足 castPts（玲奈=308pt）", castPts(REINA, 110), 308);

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
} else {
  console.log(`verify:nox-pay ALL PASS (${pass} assertions)`);
  console.log(
    `玲奈ゴールデン: wage=${reina.wage} wHours=${reina.wHours} timePay=${reina.timePay} gross=${reina.gross} withholding=${reina.withholding} net=${reina.net}`,
  );
}
