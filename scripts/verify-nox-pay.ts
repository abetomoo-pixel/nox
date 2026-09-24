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
      params: { thresholds: [{ pct: 100, add: amount }] }, priority: 90 },
  ] });
  // 達成（sales 100000 >= target 80000）／未達（target 150000）／target 0 不適用
  eq("C96 ★achievement 達成＝加算", payOf({ ...baseInput, salesTarget: 80_000, plan: AB(null, 30_000) }).achievementBonus, 30_000);
  eq("C96 achievement 未達＝0", payOf({ ...baseInput, salesTarget: 150_000, plan: AB(null, 30_000) }).achievementBonus, 0);
  eq("C96 ★target 0/なしは不適用（sales があっても 0）", payOf({ ...baseInput, salesTarget: 0, plan: AB(null, 30_000) }).achievementBonus, 0);

  // ★適用順の直接判別: 保証 100000・bonus 30000・extras 80000。
  //   bonus 込み総額 110000 >= 100000 → guarantee add=0（=bonus 後判定でしか出ない値。
  //   もし bonus 前に床を張る誤実装なら add=20000・gross=130000 になる）
  const order = payOf({ ...baseInput, extrasTotal: 80_000, salesTarget: 80_000, plan: {
    ...basePlan, components: [
      { kind: "achievement_bonus", mode: "amount", amount: 30_000, rate: null, params: { thresholds: [{ pct: 100, add: 30_000 }] }, priority: 90 },
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


// ── T11 紹介料 referralTotal（裁定272-2・0148）: 未指定＝0 で golden 不変・正値は gross に 1:1・恒等式 net = gross − 控除計 + overflow ──
{
  const ded = (p: ReturnType<typeof payOf>) => p.fixedDed + p.fine + p.withholding + p.arDeduct + p.advanceDeduct + p.okuriDeduct + p.normPenalty + p.adjBefore + p.adjAfter;
  const r0 = payOf(REINA_INPUT);
  eq("T11-1 referralTotal 未指定 → 0（golden gross 不変）", r0.referralTotal, 0);
  eq("T11-2 未指定と 0 明示は同値", payOf({ ...REINA_INPUT, referralTotal: 0 }).gross, r0.gross);
  const r1 = payOf({ ...REINA_INPUT, referralTotal: 12_000 });
  eq("T11-3 紹介料 12,000 → gross +12,000", r1.gross - r0.gross, 12_000);
  eq("T11-4 referralTotal を PayResult に持つ", r1.referralTotal, 12_000);
  eq("T11-5 恒等 net = gross − 控除計 + overflow", r1.net, r1.gross - ded(r1) + r1.adjustOverflow);
  eq("T11-6 複数行 Σ（3,000＋4,500＋2,500＝10,000）", payOf({ ...REINA_INPUT, referralTotal: 3_000 + 4_500 + 2_500 }).gross - r0.gross, 10_000);
  eq("T11-7 整数のまま（浮動小数なし）", Number.isInteger(r1.gross) && Number.isInteger(r1.net), true);
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
