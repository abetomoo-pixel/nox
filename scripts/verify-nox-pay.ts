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
 *  T8  控除 per 3種・罰金の撤去（fine 0＝精算調整へ）・ノルマ達成/未達（検知の純関数のみ・payOf では 0）
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
  payRulesFor, // ★0154 D2
  DEFAULT_SALES_BACK_TABLE, // ★0202f
} from "../lib/nox/pay";
import { roundYen } from "../lib/nox/money"; // ★0202f
import fs from "node:fs"; // ★0202f（collect の行の pin）
import { breakdownLinesOf } from "../lib/nox/payroll/breakdown-lines"; // ★0202f

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
  // ★periodDays＝計算期間の暦日数（源泉の 5,000円×日数・裁定23）。玲奈 fixture は 2026-07（31日）想定。
  //   出勤日数 REINA.days=22 とは別物（22 は fixedDedOf / normPenaltyOf 側で使う）。
  periodDays: 31,
  extrasTotal: 0, // 玲奈 fixture に出勤ボーナスは無い
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
eq("T1a withholding（periodDays=31・切捨）", reinaDoc.withholding, 117_241);
eq("T1a net（★0154 D3: ノルマ未達 16,500 の撤去で 1,117,059→1,133,559・wage 5170 は不変）", reinaDoc.net, 1_133_559);

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
eq("T1b normPenalty（★0154 D3 撤去＝0・検知の純関数 normPenaltyOf は T8 で係留）", reina.normPenalty, 0);
eq("T1b okuriDeduct", reina.okuriDeduct, 3500);
eq("T1b timePay（ゴールデン）", reina.timePay, 653_050);
eq("T1b gross（ゴールデン）", reina.gross, 1_387_150);
eq("T1b withholding（ゴールデン・periodDays=31・切捨）", reina.withholding, 125_802);
eq("T1b net（ゴールデン・★0154 D3: 1,192,348→1,208,848＝ノルマ未達 16,500 の撤去分・wage 5931／withholding 125802 は不変）", reina.net, 1_208_848);

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
eq("T7 委託 floor((500000−5000×22日※計算期間)×0.1021)＝端数ゼロで旧値と同値", withholdingOf(500_000, 22, "委託"), 39_819);
eq("T7 雇用=0", withholdingOf(500_000, 22, "雇用"), 0);
eq("T7 マイナスは 0 クランプ", withholdingOf(50_000, 22, "委託"), 0);

// ── T8 控除・罰金（撤去）・ノルマ ─────────────────────────────
eq("T8 per=day+month（2000×22+5000）", fixedDedOf(REINA_INPUT.deductions, 22, 0), 49_000);
eq("T8 per=rate（売上100,000×3%）", fixedDedOf([{ id: "r", name: "率控除", amount: 3, per: "rate" }], 22, 100_000), 3000);
{
  // ★0154 D3（裁定293-3）: 罰金の自動計算は撤去＝回数を入れても fine 0・net は変わらない。減額は精算調整（source='settlement'）の行で
  const withFine = payOf({ ...REINA_INPUT, fine: { absentN: 2, lateN: 1 } });
  eq("T8 罰金は撤去（回数 2／1 でも fine 0・net 不変）", `${withFine.fine}/${withFine.net === reina.net}`, "0/true");
  const settle = payOf({ ...REINA_INPUT, fine: { absentN: 2, lateN: 1 }, adjustments: [{ castId: "c", kind: "fixed", amount: 23_000, rateBp: null, beforeWithholding: false, showDetail: true, reason: "遅刻精算" }] });
  eq("T8 精算調整（源泉後・23000）＝adjAfter 23000・net は 23000 減", `${settle.adjAfter}/${reina.net - settle.net}`, "23000/23000");
  eq("T8 ノルマ未達も payOf では 0（normPenaltyOf は検知の純関数として残す）", `${withFine.normPenalty}/${reina.normPenalty}`, "0/0");
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
  eq("T10 days 達成（★0154 D3: sim でも normPenalty は常に 0）", sim.normPenalty, 0);
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

// ── ★C1/C2 挙動段（裁定96・mig0114/0115）: components 結線の純関数 assert ──
//   受け入れ条件（⑤）: components 空は上の玲奈 golden が既に証明（5931/125802 pin 無更新）。
{
  const basePlan: CompPlan = {
    id: "p", name: "comp-test", base: 0, honBack: 0, jonaiBack: 0, dohanBack: 0,
    salesSlide: [], pointSlide: [],
  };
  const baseInput = {
    cast: { hon: 0, jonai: 0, dohan: 0, days: 1, sales: 100_000 },
    daily: [{ d: 1, hours: 10, sales: 100_000 }],
    plan: basePlan,
    productBack: { drink: 0, champ: 0, bottle: 0 },
    pointProducts: 0,
    customBackDefs: [],
    deductions: [],
    penalty: { fineAbsent: 0, fineLate: 0, hoursPerShift: 8 },
    normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 },
    norm: { days: 0, dohan: 0 },
    fine: { absentN: 0, lateN: 0 },
    arDeduct: 0, advanceDeduct: 0, okuriDeduct: 0,
    periodDays: 31, extrasTotal: 0, taxMode: "委託" as const,
    salesBackTable: [], // 既定テーブルの売上バック（3%）を殺し、判定値を components だけにする
  };
  // base=0 なので timePay=0・バック 0 ＝ grossBase 0 の素の器（判定値が components だけで決まる）
  const g0 = payOf({ ...baseInput, plan: basePlan });
  eq("C96 components 空＝加算 0（achievementBonus）", g0.achievementBonus, 0);
  eq("C96 components 空＝加算 0（guaranteeAdd）", g0.guaranteeAdd, 0);

  const G = (amount: number): CompPlan => ({ ...basePlan, components: [
    { kind: "guarantee_min", mode: "amount", amount, rate: null, params: { period: "month" }, priority: 100 },
  ] });
  // guarantee 発動（grossBase 0 < 120000 → 差額 120000）
  const gOn = payOf({ ...baseInput, plan: G(120_000) });
  eq("C96 ★guarantee 発動＝差額補填（add=120000・gross=120000）", gOn.guaranteeAdd, 120_000);
  eq("C96 guarantee は控除前総支給＝源泉は床適用後の gross から", gOn.gross, 120_000);
  // 非発動境界（gross ちょうど＝加算 0）: base スライドで grossBase を作るのは重いので extras で作る
  const gEdge = payOf({ ...baseInput, extrasTotal: 120_000, plan: G(120_000) });
  eq("C96 guarantee 非発動境界（gross==保証 → add 0）", gEdge.guaranteeAdd, 0);

  const AB = (target: never[] | null, amount: number): CompPlan => ({ ...basePlan, components: [
    { kind: "achievement_bonus", mode: "amount", amount, rate: null,
      params: { thresholds: [{ pct: 100, amount }] } /* ★便 P173 T-2: {pct, amount} に一本化 */, priority: 90 },
  ] });
  // 達成（sales 100000 >= target 80000）／未達（target 150000）／target 0 不適用
  eq("C96 ★achievement 達成＝加算", payOf({ ...baseInput, salesTarget: 80_000, plan: AB(null, 30_000) }).achievementBonus, 30_000);
  eq("C96 achievement 未達＝0", payOf({ ...baseInput, salesTarget: 150_000, plan: AB(null, 30_000) }).achievementBonus, 0);
  eq("C96 ★target 0/なしは不適用（sales があっても 0）", payOf({ ...baseInput, salesTarget: 0, plan: AB(null, 30_000) }).achievementBonus, 0);

  // ★便 P173 T-2（起票110・0174 ★2）＋★裁定404: 多段＝目標×pct/100 に届いた段のうち最上段の amount（max＝既定・payOf は max 固定・sales 100,000）。sum は bonus-tiers 単体で assert（p173 9-1）。旧形は amount＝コンポーネントの amount（後方互換）
  const ABM = (thresholds: unknown[], amount = 10_000): CompPlan => ({ ...basePlan, components: [
    { kind: "achievement_bonus", mode: "amount", amount, rate: null, params: { thresholds }, priority: 90 },
  ] });
  const TIERS3 = [{ pct: 100, amount: 10_000 }, { pct: 120, amount: 20_000 }, { pct: 150, amount: 30_000 }];
  eq("T2-1 ★多段 max: 目標 80,000＝100%（80,000）と 120%（96,000）に到達・150%（120,000）は未達＝最上段 120% の 20,000", payOf({ ...baseInput, salesTarget: 80_000, plan: ABM(TIERS3) }).achievementBonus, 20_000);
  eq("T2-2 ★多段 max: 目標 50,000＝3 段とも到達＝最上段 150% の 30,000", payOf({ ...baseInput, salesTarget: 50_000, plan: ABM(TIERS3) }).achievementBonus, 30_000);
  eq("T2-3 多段: 目標 120,000＝1 段も届かない＝0", payOf({ ...baseInput, salesTarget: 120_000, plan: ABM(TIERS3) }).achievementBonus, 0);
  eq("T2-4 多段: 段の並びが逆でも同値（pct 昇順に並べ直す）", payOf({ ...baseInput, salesTarget: 80_000, plan: ABM(TIERS3.slice().reverse()) }).achievementBonus, 20_000);
  eq("T2-5 ★後方互換: 旧形 {pct}＝amount はコンポーネントの amount（30,000）", payOf({ ...baseInput, salesTarget: 80_000, plan: ABM([{ pct: 100 }], 30_000) }).achievementBonus, 30_000);
  eq("T2-6 後方互換: 旧形 {pct, add}＝add は読まない（amount＝コンポーネントの 30,000）", payOf({ ...baseInput, salesTarget: 80_000, plan: ABM([{ pct: 100, add: 99_999 }], 30_000) }).achievementBonus, 30_000);
  eq("T2-7 thresholds なし／空＝100% の 1 段（コンポーネントの amount）", payOf({ ...baseInput, salesTarget: 80_000, plan: ABM([], 30_000) }).achievementBonus, 30_000);
  eq("T2-8 max は金額でなく達成率の最上段（120% 5,000 ＜ 100% 20,000 でも 120% の 5,000）", payOf({ ...baseInput, salesTarget: 80_000, plan: ABM([{ pct: 100, amount: 20_000 }, { pct: 120, amount: 5_000 }]) }).achievementBonus, 5_000);

  // ★適用順の直接判別: 保証 100000・bonus 30000・extras 80000。
  //   bonus 込み総額 110000 >= 100000 → guarantee add=0（=bonus 後判定でしか出ない値。
  //   もし bonus 前に床を張る誤実装なら add=20000・gross=130000 になる）
  const order = payOf({ ...baseInput, extrasTotal: 80_000, salesTarget: 80_000, plan: {
    ...basePlan, components: [
      { kind: "achievement_bonus", mode: "amount", amount: 30_000, rate: null, params: { thresholds: [{ pct: 100, amount: 30_000 }] }, priority: 90 },
      { kind: "guarantee_min", mode: "amount", amount: 100_000, rate: null, params: { period: "month" }, priority: 100 },
    ],
  } });
  eq("C96 ★適用順＝guarantee はボーナス込み総額に床（add 0・gross=110000）", order.gross, 110_000);
  eq("C96 適用順の直接判別（guaranteeAdd=0）", order.guaranteeAdd, 0);

  // rate モードは明示スキップ（黙殺しない）・is_active=false は除外
  const skip = payOf({ ...baseInput, plan: { ...basePlan, components: [
    { kind: "guarantee_min", mode: "rate", amount: null, rate: 50, params: {}, priority: 100 },
    { kind: "guarantee_min", mode: "amount", amount: 90_000, rate: null, params: {}, priority: 110, is_active: false },
  ] } });
  eq("C96 ★rate モードは compSkipped に記録（金額へは不算入）", JSON.stringify(skip.compSkipped), JSON.stringify(["guarantee_min:rate"]));
  eq("C96 is_active=false は除外（guaranteeAdd 0）", skip.guaranteeAdd, 0);
}


// ── T11（旧 紹介料の gross 加算・裁定272-2）は 0152（裁定298-10）で撤去＝紹介料は給与に載せない（referral_payouts へ）。番号は欠番のまま
{
}

// ── T12 ★夜間便 N3（裁定287-5）: 保証時給の営業日単位適用（guaranteeByDay＝d→base・無指定は従来と 1 バイト同値）
//   逆テスト＝pay.ts wageDetail の `const base = gBase ?? (eplan.base || 0);` を `const base = eplan.base || 0;` にする→T12-1 赤・戻して緑
{
  const P_G: CompPlan = { id: "p_g", name: "保証検証", base: 3000, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [{ at: 100_000, wage: 5000 }], pointSlide: [] };
  const daily = [1, 2, 3, 4].map((d) => ({ d, hours: 5, sales: 30_000 }));
  const baseIn: PayInput = { ...REINA_INPUT, cast: { hon: 0, jonai: 0, dohan: 0, days: 4, sales: 120_000 }, daily, plan: P_G, pointProducts: 0, customBackDefs: [], deductions: [], periodDays: 30, extrasTotal: 0 };
  const g0 = payOf(baseIn);
  eq("T12-0 保証なし＝guarantee キー無し・wage 3000", `${g0.wage}/${"guarantee" in g0}`, "3000/false");
  const gAll = payOf({ ...baseIn, guaranteeByDay: { 1: 4000, 2: 4000, 3: 4000, 4: 4000 }, guaranteeSpans: [{ from: "2026-07-01", to: "2026-07-31", base: 4000 }] });
  eq("T12-1 期の全日が保証 4000→wage 4000・保証 20h ¥80,000・基本 0h", `${gAll.wage}/${gAll.guarantee?.guaHours}/${gAll.guarantee?.guaPay}/${gAll.guarantee?.baseHours}/${gAll.guarantee?.basePay}`, "4000/20/80000/0/0");
  const gEnd = payOf({ ...baseIn, guaranteeByDay: { 1: 4000, 2: 4000 }, guaranteeSpans: [{ from: "2026-07-01", to: "2026-07-02", base: 4000 }] });
  eq("T12-2 期の途中で保証が切れる（1〜2 日）→ 保証 10h ¥40,000・基本 10h ¥30,000・wage 3500", `${gEnd.wage}/${gEnd.guarantee?.guaPay}/${gEnd.guarantee?.basePay}/${gEnd.timePay}`, "3500/40000/30000/70000");
  const gStart = payOf({ ...baseIn, guaranteeByDay: { 3: 4000, 4: 4000 }, guaranteeSpans: [{ from: "2026-07-03", to: null, base: 4000 }] });
  eq("T12-3 期の途中から保証が始まる（3〜4 日）→ 同額の鏡像・wdays の hourly は 3000,3000,4000,4000", `${gStart.timePay}/${gStart.wdays.map((d) => d.hourly).join(",")}`, "70000/3000,3000,4000,4000");
  const gLow = payOf({ ...baseIn, guaranteeByDay: { 1: 2500, 2: 2500, 3: 2500, 4: 2500 }, guaranteeSpans: [{ from: "2026-07-01", to: null, base: 2500 }] });
  eq("T12-4 保証額が基本より低い（2500）→ 基本 3000 が採られる（max）・保証区分の時間は数える", `${gLow.wage}/${gLow.wdays[0].hourly}/${gLow.guarantee?.guaHours}`, "3000/3000/20");
  const gSlide = payOf({ ...baseIn, daily: [{ d: 1, hours: 5, sales: 120_000 }, { d: 2, hours: 5, sales: 30_000 }], cast: { ...baseIn.cast, days: 2 }, guaranteeByDay: { 1: 4000, 2: 4000 }, guaranteeSpans: [{ from: "2026-07-01", to: null, base: 4000 }] });
  eq("T12-5 スライドが保証を上回る日（売上 120k→5000）＝スライド採用・basis 売上・保証区分にも時間が入る", `${gSlide.wdays[0].hourly}/${gSlide.wdays[0].basis}/${gSlide.wdays[1].hourly}/${gSlide.guarantee?.guaHours}`, "5000/売上/4000/10");
  const reinaAgain = payOf(REINA_INPUT);
  eq("T12-6 golden 不変（玲奈 5931／125802・guarantee キー無し）", `${reinaAgain.wage}/${reinaAgain.withholding}/${"guarantee" in reinaAgain}`, "5931/125802/false");
}

// ── T13 ★夜間便 N3b（裁定288）: スライドの翌月反映（slideByDay＝d→前月合計・未指定は従来と 1 バイト同値）
//   逆テスト＝pay.ts wageDetail の `sb ? slideAt(eplan.salesSlide, sb.sales) : …` を `slideAt(eplan.salesSlide, r.sales)` にする→T13-1 赤・戻して緑
{
  const P_S: CompPlan = { id: "p_s", name: "翌月反映検証", base: 3000, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [{ at: 1_000_000, wage: 4000 }, { at: 2_000_000, wage: 5000 }], pointSlide: [{ at: 50, wage: 4500 }] };
  const daily = [1, 2, 3, 4].map((d) => ({ d, hours: 5, sales: 30_000 }));
  const baseIn: PayInput = { ...REINA_INPUT, cast: { hon: 0, jonai: 0, dohan: 0, days: 4, sales: 120_000 }, daily, plan: P_S, pointProducts: 0, customBackDefs: [], deductions: [], periodDays: 30, extrasTotal: 0 };
  const cur = payOf(baseIn);
  eq("T13-0 'current'／欠損（slideByDay なし）＝日次判定（30k は段なし→base 3000）・slideBasis キー無し", `${cur.wage}/${"slideBasis" in cur}`, "3000/false");
  const up = payOf({ ...baseIn, slideByDay: Object.fromEntries([1, 2, 3, 4].map((d) => [d, { month: "2026-07", sales: 1_200_000, pts: 10 }])) });
  eq("T13-1 前月実績 1.2M で段が上がる→全日 4000・slideBasis 1 月分（prevMonth 2026-06・salesWage 4000）", `${up.wage}/${up.slideBasis?.months.length}/${up.slideBasis?.months[0].prevMonth}/${up.slideBasis?.months[0].salesWage}`, "4000/1/2026-06/4000");
  const none = payOf({ ...baseIn, slideByDay: Object.fromEntries([1, 2, 3, 4].map((d) => [d, { month: "2026-07", sales: 0, pts: 0 }])) });
  eq("T13-2 前月実績なし（0）→最下段＝base 3000", `${none.wage}/${none.slideBasis?.months[0].salesWage}`, "3000/0");
  const half = payOf({ ...baseIn, slideByDay: { 1: { month: "2026-07", sales: 1_200_000, pts: 0 }, 2: { month: "2026-07", sales: 1_200_000, pts: 0 }, 3: { month: "2026-07", sales: 1_200_000, pts: 0 }, 4: { month: "2026-07", sales: 1_200_000, pts: 0 } } });
  eq("T13-3 半月の期でも同じ暦月なら前半・後半で同じ段（全日 4000）", half.wdays.map((d) => d.hourly).join(","), "4000,4000,4000,4000");
  const cross = payOf({ ...baseIn, slideByDay: { 1: { month: "2026-07", sales: 1_200_000, pts: 0 }, 2: { month: "2026-07", sales: 1_200_000, pts: 0 }, 3: { month: "2026-08", sales: 2_500_000, pts: 0 }, 4: { month: "2026-08", sales: 2_500_000, pts: 0 } } });
  eq("T13-4 期が月をまたぐ→営業日ごとにその月の前月で段（7 月分 4000・8 月分 5000）・slideBasis 2 月分", `${cross.wdays.map((d) => d.hourly).join(",")}/${cross.slideBasis?.months.length}`, "4000,4000,5000,5000/2");
  const gua = payOf({ ...baseIn, slideByDay: Object.fromEntries([1, 2, 3, 4].map((d) => [d, { month: "2026-07", sales: 1_200_000, pts: 0 }])), guaranteeByDay: { 1: 6000, 2: 6000 }, guaranteeSpans: [{ from: "2026-07-01", to: "2026-07-02", base: 6000 }] });
  eq("T13-5 保証（6000）が前月スライド（4000）を上回る日は保証・他の日はスライド", gua.wdays.map((d) => d.hourly).join(","), "6000,6000,4000,4000");
  const pts = payOf({ ...baseIn, slideByDay: Object.fromEntries([1, 2, 3, 4].map((d) => [d, { month: "2026-07", sales: 0, pts: 60 }])) });
  eq("T13-6 ポイントの月間閾値（50pt）でも段が決まる→4500", `${pts.wage}/${pts.slideBasis?.months[0].ptsWage}`, "4500/4500");
  const reinaAgain2 = payOf(REINA_INPUT);
  eq("T13-7 golden 不変（玲奈 5931／125802・slideBasis キー無し）", `${reinaAgain2.wage}/${reinaAgain2.withholding}/${"slideBasis" in reinaAgain2}`, "5931/125802/false");
}

// ── T14 ★0154 D2（裁定291 追補1 B／294-5）: 報酬型 pay_rule（actual／shift_guarantee／fixed／per_shift）＝timePay だけを置き換える・actual はキー無し
//   逆テスト＝pay.ts の `timePayRule +` を `wd.timePay +` にする→T14-3／T14-5／T14-7 赤・戻して緑
{
  const P_R: CompPlan = { id: "p_r", name: "報酬型", base: 2000, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [], pointSlide: [] };
  const daily = [{ d: 1, hours: 4, sales: 0 }, { d: 2, hours: 6, sales: 0 }, { d: 3, hours: 5, sales: 0 }];
  const base: PayInput = { ...REINA_INPUT, cast: { hon: 0, jonai: 0, dohan: 0, days: 3, sales: 0 }, daily, plan: P_R, pointProducts: 0, customBackDefs: [], deductions: [], periodDays: 30, extrasTotal: 0, taxMode: "雇用" };
  const a0 = payOf(base);
  eq("T14-1 actual（override 無し）＝timePay 2000×15h＝30000・payRule キー無し", `${a0.timePay}/${"payRule" in a0}`, "30000/false");
  const a1 = payOf({ ...base, override: { pay_rule: "actual" } });
  eq("T14-2 actual を明示しても同値・キー無し", `${a1.timePay}/${"payRule" in a1}`, "30000/false");
  const sg = payOf({ ...base, override: { pay_rule: "shift_guarantee" }, shiftHoursByDay: { 1: 6, 2: 5, 3: 5 } });
  eq("T14-3 shift_guarantee: 日ごと max(実働, シフト)＝6+6+5=17h→34000・guaranteedHours 17・timePayActual 30000・timePay 以外の項は不変", `${sg.timePay}/${sg.payRule?.guaranteedHours}/${sg.payRule?.timePayActual}/${sg.gross - sg.timePay === a0.gross - a0.timePay}`, "34000/17/30000/true");
  const sg0 = payOf({ ...base, override: { pay_rule: "shift_guarantee" } });
  eq("T14-4 shift_guarantee 境界: シフト時間の入力が無い＝実働と同値 30000（キーはある）", `${sg0.timePay}/${sg0.payRule?.rule}`, "30000/shift_guarantee");
  const fx = payOf({ ...base, override: { pay_rule: "fixed", fixed_amount: 300000 } });
  eq("T14-5 fixed: 期の定額 300000（按分なし＝calcPeriodDays 未指定）・timePay 以外の項は不変", `${fx.timePay}/${fx.payRule?.calcDays}/${fx.payRule?.periodDays}/${fx.gross - fx.timePay === a0.gross - a0.timePay}`, "300000/30/30/true");
  const fx2 = payOf({ ...base, override: { pay_rule: "fixed", fixed_amount: 300000 }, calcPeriodDays: 15 });
  const fx3 = payOf({ ...base, override: { pay_rule: "fixed", fixed_amount: 300000 }, calcPeriodDays: 10 });
  eq("T14-6 fixed 境界: 期中入店（15/30 日）＝暦日按分 150000・roundYen（300000×10/30＝100000）", `${fx2.timePay}/${fx3.timePay}`, "150000/100000");
  const ps = payOf({ ...base, override: { pay_rule: "per_shift", per_shift_amount: 12000 }, attendanceDays: 4 });
  eq("T14-7 per_shift: 出勤回数 4×12000＝48000（実働時間は使わない）・timePay 以外の項は不変", `${ps.timePay}/${ps.payRule?.shiftCount}/${ps.gross - ps.timePay === a0.gross - a0.timePay}`, "48000/4/true");
  const ps0 = payOf({ ...base, override: { pay_rule: "per_shift", per_shift_amount: 12000 } });
  const ps1 = payOf({ ...base, override: { pay_rule: "per_shift" } });
  eq("T14-8 per_shift 境界: attendanceDays 未指定＝cast.days（3）×12000＝36000・額 0 なら 0", `${ps0.timePay}/${ps1.timePay}`, "36000/0");
  eq("T14-9 payRulesFor: 雇用＝actual／shift_guarantee／fixed・委託／null＝actual／per_shift", `${payRulesFor("雇用").join(",")}|${payRulesFor("委託").join(",")}|${payRulesFor(null).join(",")}`, "actual,shift_guarantee,fixed|actual,per_shift|actual,per_shift");
  const reinaR = payOf(REINA_INPUT);
  eq("T14-10 golden 不変（玲奈 5931／125802・payRule キー無し）", `${reinaR.wage}/${reinaR.withholding}/${"payRule" in reinaR}`, "5931/125802/false");
}

// ── T15 ★裁定490（2026-11-13 Agoora 確定・案 B）: 体入の時給（trialWageByDay）とバック「なし」（trialBackExclude）＝省略できるキー・無ければ従来と 1 バイト同値
//   逆テスト（手動・1 回）＝pay.ts の「tw !== undefined ? (…) : Math.max(bySales, byPts, base)」の体入の側を Math.max(tw, base) にする→T15-2 赤・戻して緑
{
  // T15-0／0b: golden 不変（キーが無い・空のキー）
  const g1 = payOf(REINA_INPUT), g1a = payOf({ ...REINA_INPUT, pointProducts: 0 });
  eq("T15-0 golden 不変＝T1b 5931／125802・T1a 5170／117241・trial キー無し", `${g1.wage}/${g1.withholding}/${"trial" in g1}/${g1a.wage}/${g1a.withholding}/${"trial" in g1a}`, "5931/125802/false/5170/117241/false");
  eq("T15-0b 空のキー（trialWageByDay: {}）は無いのと同じ（JSON が 1 バイトも変わらない）", JSON.stringify(payOf({ ...REINA_INPUT, trialWageByDay: {} })) === JSON.stringify(payOf(REINA_INPUT)), true);
  // 共通＝base 2,500・売上スライド [800k→3,000]・指名 1,000／500／1,500（per_count）・4 日×5h
  const P15: CompPlan = { id: "p15", name: "T15", base: 2500, honBack: 1000, jonaiBack: 500, dohanBack: 1500, salesSlide: [{ at: 800000, wage: 3000 }], pointSlide: [] };
  const daily15 = [1, 2, 3, 4].map((d) => ({ d, hours: 5, sales: 900000 }));
  const base15: PayInput = { ...REINA_INPUT, cast: { hon: 8, jonai: 4, dohan: 2, days: 4, sales: 3600000 }, daily: daily15, plan: P15, override: undefined, pointProducts: 0, customBackDefs: [], deductions: [], periodDays: 30, extrasTotal: 0, productBack: { drink: 2000, champ: 0, bottle: 0 }, guaranteeByDay: undefined, guaranteeSpans: undefined, salesBackTable: [], salesTarget: 0 };
  const allDays = (w: number) => ({ 1: w, 2: w, 3: w, 4: w });
  const r0 = payOf(base15);
  eq("T15-前提 体入なし＝毎日売上スライド 3,000×20h＝60,000", `${r0.timePay}/${"trial" in r0}`, "60000/false");
  const r1 = payOf({ ...base15, trialWageByDay: allDays(3000) });
  eq("T15-1 全日・体入 3,000＝60,000・バックは今と同じ（指名 8×1,000＋4×500＋2×1,500＝13,000）・trial 4 日 20h", `${r1.timePay}/${r1.honBack + r1.jonaiBack + r1.dohanBack}/${r1.trial?.days}/${r1.trial?.hours}/${r1.trial?.backNone}`, "60000/13000/4/20/false");
  const r2 = payOf({ ...base15, trialWageByDay: allDays(2000) });
  eq("T15-2 全日・体入 2,000（base より低い）＝2,000 に下がる（置き換え・max にしない）・スライドも使わない（R）＝40,000・basis 体入", `${r2.timePay}/${r2.wbasis["体入"]}/${r2.wdays.every((w) => w.trial === true && w.hourly === 2000)}`, "40000/4/true");
  const r3 = payOf({ ...base15, trialWageByDay: allDays(2000), guaranteeByDay: allDays(3200) });
  eq("T15-3 全日・体入 2,000＋保証 3,200＝3,200（保証が勝つ・打ち消さない）＝64,000・basis 保証", `${r3.timePay}/${r3.wbasis["保証"]}`, "64000/4");
  const r4 = payOf({ ...base15, trialWageByDay: allDays(3500), guaranteeByDay: allDays(3200) });
  eq("T15-4 全日・体入 3,500＋保証 3,200＝3,500（高いほう）＝70,000", r4.timePay, 70000);
  const r5 = payOf({ ...base15, trialWageByDay: { 1: 2000, 2: 2000 } });
  eq("T15-5 1〜2 日だけ体入 2,000・3〜4 日はスライド 3,000＝(2,000＋2,000＋3,000＋3,000)×5h＝50,000・日ごとの時給", `${r5.timePay}/${r5.wdays.map((w) => w.hourly).join(",")}/${r5.trial?.days}`, "50000/2000,2000,3000,3000/2");
  const exNone = { hon: 8, jonai: 4, dohan: 2, honShimeiAmt: 0, jonaiShimeiAmt: 0, drink: 2000, champ: 0, bottle: 0, calculated: 0, sales: 3600000 };
  const r6 = payOf({ ...base15, trialWageByDay: allDays(2000), trialBackExclude: exNone });
  eq("T15-6 全日・バックなし＝指名・商品・売上歩合を 0（per_count）・売上の合計と pt は減らさない・trial.backNone", `${r6.honBack}/${r6.jonaiBack}/${r6.dohanBack}/${r6.drinkBack}/${r6.salesBack}/${r6.gross}/${r6.trial?.backNone}`, "0/0/0/0/0/40000/true");
  const r6b = payOf({ ...base15, trialWageByDay: { 1: 2000, 2: 2000 }, trialBackExclude: { ...exNone, hon: 4, jonai: 2, dohan: 1, drink: 1000, sales: 1800000 } });
  eq("T15-6b 1〜2 日だけバックなし＝体入の日の本数だけ引く（(8−4)×1,000＋(4−2)×500＋(2−1)×1,500＝6,500・商品 2,000−1,000＝1,000）", `${r6b.honBack + r6b.jonaiBack + r6b.dohanBack}/${r6b.drinkBack}`, "6500/1000");
  const PR: CompPlan = { ...P15, honBackMode: "rate", honBackRate: 10, jonaiBackMode: "rate", jonaiBackRate: 10 };
  const r7 = payOf({ ...base15, plan: PR, cast: { ...base15.cast, honShimeiAmt: 30000, jonaiShimeiAmt: 10000 }, trialWageByDay: { 1: 2000, 2: 2000 }, trialBackExclude: { ...exNone, honShimeiAmt: 15005, jonaiShimeiAmt: 5000, hon: 4, jonai: 2, dohan: 1, drink: 1000, sales: 1800000 } });
  eq("T15-7 rate のバックなし＝母数から体入の日の指名料を引いて Σ のあと 1 回丸め（(30,000−15,005)×10%＝1,499.5→1,500・(10,000−5,000)×10%＝500）", `${r7.honBack}/${r7.jonaiBack}`, "1500/500");
  const r8 = payOf({ ...base15, calculatedBack: 5000, trialWageByDay: allDays(2000), trialBackExclude: { ...exNone, calculated: 3000 } });
  eq("T15-8 商品バックの凍結値（calculatedBack）も体入の日の分を引く＝5,000−3,000＝2,000", r8.calculatedBack, 2000);
  const r9 = payOf({ ...base15, trialWageByDay: allDays(2200) });
  eq("T15-9 体入の日に売上スライドが当たっても使わない（R・Agoora 確定）＝2,200×20h＝44,000", r9.timePay, 44000);
  const r10 = payOf({ ...base15, trialWageByDay: allDays(2000), trialBackExclude: exNone, taxMode: "委託" });
  const r10n = payOf({ ...base15, trialWageByDay: allDays(2000), taxMode: "委託" });
  eq("T15-10 源泉＝新しい総支給で計算（バックなしの方が総支給が少ない＝源泉も少ないか同じ）", r10.gross < r10n.gross && r10.withholding <= r10n.withholding, true);
  const r11 = payOf({ ...base15, payTimeBasis: "shift", shiftHoursByDay: { 1: 6, 2: 6, 3: 6, 4: 6 }, trialWageByDay: allDays(2000) });
  eq("T15-11 勤務時間の基準 shift と体入が両方効く＝2,000×24h＝48,000", r11.timePay, 48000);
  const sb = { month: "2026-10", sales: 3600000, pts: 0 };
  const r12 = payOf({ ...base15, slideByDay: { 3: sb, 4: sb }, trialWageByDay: { 1: 2200, 2: 2200 } });
  eq("T15-12（裁定490-11）体入の間の売上は本採用のあとのスライドの段に入る＝体入の日はスライドなし 2,200・3〜4 日は前の月の合計で 3,000", r12.wdays.map((w) => w.hourly).join(","), "2200,2200,3000,3000");
  // ★B2-3（2026-11-16 相談役）: 自由設計の定額のバック（basis flat）＝バックなしで出勤した日が全部体入の日なら 0・混ざる期は残す・バックなしでなければ残す
  //   逆テスト（手動・1 回）＝pay.ts の allTrialFlat0 の every を some にする→T15-13b 赤・戻して緑
  const FLAT = [{ id: "f1", name: "定額", basis: "flat" as const, value: 5000 }, { id: "s1", name: "売上", basis: "sales" as const, value: 1 }];
  const r13 = payOf({ ...base15, customBackDefs: FLAT, trialWageByDay: allDays(2000), trialBackExclude: { ...exNone, metrics: { sales: 3600000 } } });
  eq("T15-13 全日体入・バックなし＝定額 0・売上 1% も母数 0 で 0", `${r13.cbacks.map((c) => c.amount).join(",")}/${r13.customTotal}`, "0,0/0");
  const r13b = payOf({ ...base15, customBackDefs: FLAT, trialWageByDay: { 1: 2000, 2: 2000 }, trialBackExclude: { ...exNone, hon: 4, jonai: 2, dohan: 1, drink: 1000, sales: 1800000, metrics: { sales: 1800000 } } });
  eq("T15-13b 体入の日と本採用の日が混ざる期＝定額 5,000 は残す・売上 1% は本採用の日の分（1,800,000×1%＝18,000）", r13b.cbacks.map((c) => c.amount).join(","), "5000,18000");
  const r13c = payOf({ ...base15, customBackDefs: FLAT, trialWageByDay: allDays(2000) });
  eq("T15-13c 全日体入でもバック「同じ」（除外なし）＝定額 5,000 は残す", r13c.cbacks[0].amount, 5000);
  const r13d = payOf({ ...base15, customBackDefs: FLAT });
  eq("T15-13d 体入なし＝定額 5,000（従来）", r13d.cbacks[0].amount, 5000);
}


// ── T16 ★0202f（ホストの骨格・2026-11-22・相談役 0:15 の ■3）: 歩合の段の表（commissionTiers）と日給の保証（guarantee_min の params.unit＝'day'）
//   逆テスト＝pay.ts の cTiers を常に null にする→T16-1 赤・unit の分岐を外す→T16-5 赤・戻して緑
{
  const TIERS = [{ at: 0, rate: 40 }, { at: 300_000, rate: 45 }, { at: 500_000, rate: 50 }, { at: 1_000_000, rate: 55 }, { at: 2_000_000, rate: 60 }, { at: 3_000_000, rate: 65 }];
  const P_T: CompPlan = { id: "p_t", name: "段の表", base: 0, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [], pointSlide: [], commissionTiers: TIERS };
  const daily = [1, 2, 3, 4].map((d) => ({ d, hours: 5, sales: 300_000 }));
  const base: PayInput = { ...REINA_INPUT, cast: { hon: 0, jonai: 0, dohan: 0, days: 4, sales: 1_234_567 }, daily, plan: P_T, pointProducts: 0, customBackDefs: [], deductions: [], periodDays: 30, extrasTotal: 0, productBack: { drink: 0, champ: 0, bottle: 0 }, salesTarget: 0 };
  const t1 = payOf(base);
  eq("T16-1 段の表＝売上の全額 × 届いた段の率（1,234,567 → 55%）・丸め 1 回（678,511.85 → roundYen）・sRate 0.55・凍結の形に表と率と母数", `${t1.salesBack}/${t1.sRate}/${t1.commission?.rate}/${t1.commission?.base}/${t1.commission?.tiers.length}`, `${roundYen((1_234_567 * 55) / 100)}/0.55/55/1234567/6`);
  const t2 = payOf({ ...base, salesBackTable: [] });
  eq("T16-2 店が既定の売上歩合を止めていても（salesBackTable []）段の表の人は表で払う", t2.salesBack, t1.salesBack);
  const t3 = payOf({ ...base, salesBackTable: DEFAULT_SALES_BACK_TABLE });
  eq("T16-3 既定の表を渡しても、段の表の人は既定の表を使わない（並べない）", t3.salesBack, t1.salesBack);
  const t4 = payOf({ ...base, plan: { ...P_T, commissionTiers: null } }), t4b = payOf({ ...base, plan: { ...P_T, commissionTiers: [] } });
  const { commissionTiers: _x, ...P_none } = P_T; void _x;
  const noPlan = (r: object): string => JSON.stringify({ ...r, plan: undefined, eplan: undefined }); // 結果の中のプランの写し（入力そのもの）を外して比べる
  const t4c = payOf({ ...base, plan: P_none as CompPlan });
  eq("T16-4 表が null・空・キー無し＝今のまま（既定の表で 7%・commission キー無し・3 つとも結果は 1 バイト同値＝入力の写しの plan／eplan を除く）", `${t4.salesBack}/${"commission" in t4}/${noPlan(t4) === noPlan(t4c)}/${noPlan(t4b) === noPlan(t4c)}`, `${roundYen(1_234_567 * 0.07)}/false/true/true`);
  eq("T16-4b 表の下限に届かない売上（最初の段が 100,000 から）＝0%", payOf({ ...base, cast: { ...base.cast, sales: 50_000 }, plan: { ...P_T, commissionTiers: [{ at: 100_000, rate: 40 }] } }).salesBack, 0);
  // 日給の保証（unit 'day'）：床＝額 × 出勤日数（attendanceDays）・全部を含めた総額と比べて高いほう（今の比べ方のまま）
  const G = (unit: string | null, amount: number): CompPlan => ({ id: "p_g2", name: "日給保証", base: 1000, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [], pointSlide: [], components: [{ kind: "guarantee_min", mode: "amount", amount, rate: null, params: unit ? { unit } : {}, priority: 100 }] as CompPlan["components"] });
  const gb: PayInput = { ...base, plan: G("day", 10_000), cast: { hon: 0, jonai: 0, dohan: 0, days: 4, sales: 0 }, daily: [1, 2, 3, 4].map((d) => ({ d, hours: 5, sales: 0 })), attendanceDays: 4 };
  const g1 = payOf(gb);
  eq("T16-5 床に届かない人＝時給 1,000 × 20h＝20,000 < 日給 10,000 × 出勤 4 日＝40,000 → 補填 20,000・guaranteeDay", `${g1.guaranteeAdd}/${g1.gross - g1.guaranteeAdd}/${g1.guaranteeDay?.perDay}/${g1.guaranteeDay?.days}/${g1.guaranteeDay?.floor}`, "20000/20000/10000/4/40000");
  const g2 = payOf({ ...gb, plan: G("day", 4_000) });
  eq("T16-6 床に届く人＝20,000 ≥ 4,000 × 4＝16,000 → 補填 0（guaranteeDay は残る＝明細の行は補填のときだけ）", `${g2.guaranteeAdd}/${g2.guaranteeDay?.floor}`, "0/16000");
  const g3 = payOf({ ...gb, cast: { ...gb.cast, days: 0 }, daily: [], attendanceDays: 0 });
  eq("T16-7 出勤 0 日の人＝床 0 → 補填 0・総支給 0", `${g3.guaranteeAdd}/${g3.gross}/${g3.guaranteeDay?.floor}`, "0/0/0");
  const gm = payOf({ ...gb, plan: G("month", 40_000) }), gn = payOf({ ...gb, plan: G(null, 40_000) });
  eq("T16-8 unit 'month' と unit なし＝今のまま（床＝額 40,000 → 補填 20,000・guaranteeDay キー無し・2 つは結果が 1 バイト同値＝入力の写しを除く）", `${gm.guaranteeAdd}/${"guaranteeDay" in gm}/${noPlan(gm) === noPlan(gn)}`, "20000/false/true");
  // T16-8b ★相談役 11/22 3:00：保証が 2 つの入力（画面では 1 つに限るが DB は止めない）＝額は今のまま（逐次の差額補填＝高い床が効く）・明細の日給の行は効いた床が日給のときだけ
  const G2 = (a: { unit: string | null; amount: number }, b: { unit: string | null; amount: number }): CompPlan => ({ ...G(null, 0), components: [a, b].map((x, i) => ({ kind: "guarantee_min", mode: "amount", amount: x.amount, rate: null, params: x.unit ? { unit: x.unit } : {}, priority: 100 + i })) as CompPlan["components"] });
  const two1 = payOf({ ...gb, plan: G2({ unit: "day", amount: 10_000 }, { unit: "month", amount: 30_000 }) }); // 床 40,000（日給）と 30,000（月）
  const two2 = payOf({ ...gb, plan: G2({ unit: "day", amount: 5_000 }, { unit: "month", amount: 30_000 }) });  // 床 20,000（日給）と 30,000（月）
  const two3 = payOf({ ...gb, plan: G2({ unit: "month", amount: 30_000 }, { unit: "day", amount: 10_000 }) }); // 順を入れ替え
  eq("T16-8b 保証が 2 つ：額は高い床（日給 40,000 → 補填 20,000／月 30,000 → 補填 10,000）・日給の行は効いた床が日給のときだけ・順を入れ替えても同じ",
    `${two1.guaranteeAdd}/${two1.guaranteeDay?.floor ?? "なし"}/${two2.guaranteeAdd}/${two2.guaranteeDay?.floor ?? "なし"}/${two3.guaranteeAdd}/${two3.guaranteeDay?.floor ?? "なし"}`, "20000/40000/10000/なし/20000/40000");
  const bl2b = breakdownLinesOf({ pay: two2 as unknown as Parameters<typeof breakdownLinesOf>[0]["pay"] }).earn.map((l) => l.label);
  eq("T16-8c 効いた床が月の額のとき＝明細に日給の行は出ない", bl2b.some((x) => x.includes("日給")), false);
  // 明細の行（凍結の pay から作る＝breakdownLinesOf）
  const bl = breakdownLinesOf({ pay: g1 as unknown as Parameters<typeof breakdownLinesOf>[0]["pay"] }).earn.map((l) => `${l.label}=${l.amount}`);
  eq("T16-9 明細：「最低保証加算」の下に「日給 ¥10,000 × 出勤 4 日（¥40,000）」の情報の行", bl.some((x) => x.startsWith("最低保証加算=20000")) && bl.some((x) => x.includes("日給 ¥10,000 × 出勤 4 日（¥40,000）")), true);
  const bl2 = breakdownLinesOf({ pay: { ...t1, salesBasis: "subtotal" } as unknown as Parameters<typeof breakdownLinesOf>[0]["pay"] }).earn.map((l) => l.label);
  eq("T16-10 明細：段の表の人は「売上歩合 55%（小計 ¥1,234,567 の 55%）」", bl2.some((x) => x === "売上歩合 55%（小計 ¥1,234,567 の 55%）"), true);
  const old = breakdownLinesOf({ pay: payOf(REINA_INPUT) as unknown as Parameters<typeof breakdownLinesOf>[0]["pay"] }).earn.map((l) => l.label);
  eq("T16-11 凍結済みの今の形（commission・guaranteeDay キー無し）の明細は今の行のまま（「売上バック（率）」・日給の行は出ない）", `${old.includes("売上バック（率）")}/${old.some((x) => x.includes("日給"))}`, "true/false");
  // T16-13／14 ★相談役 11/22 2:35 の ■1 A：店の鍵 sales_back_default_off と各種バック（sys_backs）の止めは、既定の表（3〜10%）だけを止める＝collect は salesBackTable を [] にするだけ（下の pin）。
  //   段の表の人は表で払う（4 通りとも同じ額）・表なしの人は今の main と同じ（止めが無いときだけ既定の表 7%・どちらかの止めで 0）
  const colSrc = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
  eq("T16-13a collect の止めの判定＝各種バックが ON かつ既定を止めていないときだけ既定の表・それ以外は salesBackTable []（ほかに売上歩合を止める所が無い）",
    colSrc.includes('...(isSystemOn((stR.data?.settings_json ?? null) as Record<string, unknown> | null, "sys_backs") && !salesBackDefaultOffOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()) ? {} : { salesBackTable: [] }),') && (colSrc.match(/salesBackTable/g) ?? []).length === 1, true);
  const tableFor = (sysBacksOn: boolean, defaultOff: boolean) => (sysBacksOn && !defaultOff ? {} : { salesBackTable: [] }); // collect の行の写し
  const combos: [boolean, boolean][] = [[true, false], [true, true], [false, false], [false, true]];
  const withT = combos.map(([on, off]) => payOf({ ...base, ...tableFor(on, off) }).salesBack);
  eq("T16-13 表あり × 各種バック ON／OFF × 既定の止め あり／なし の 4 通り＝どれも表の額（55%）", withT.join("/"), Array(4).fill(t1.salesBack).join("/"));
  const noT = combos.map(([on, off]) => payOf({ ...base, plan: P_none as CompPlan, ...tableFor(on, off) }).salesBack);
  eq("T16-14 表なしの 4 通り＝今の main と同じ（止めなし＝既定の表 7%・各種バック OFF か既定の止め＝0）", noT.join("/"), `${roundYen(1_234_567 * 0.07)}/0/0/0`);
  const rg = payOf(REINA_INPUT);
  eq("T16-12 golden 不変（玲奈 5931／125802・commission と guaranteeDay のキー無し）", `${rg.wage}/${rg.withholding}/${"commission" in rg}/${"guaranteeDay" in rg}`, "5931/125802/false/false");
}

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
