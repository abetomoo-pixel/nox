/*
 * verify:nox-labor-forecast — 予想人件費 純関数スイート（DB 不要・段S-2 設計正本 §2）。
 *   npm run verify:nox-labor-forecast
 *
 * 正本 lib/nox/labor-forecast.ts の網羅:
 *  - 基本形（保証時給×シフト時間）
 *  - スライド解決（at=0 段の採用・at>0 段は売上ゼロの予定段階では発火しない・売上/pt の max）
 *    ＝wageDetail 再利用の実証（採用規則が payOf と同一関数で解かれる）
 *  - override 反映（applyOverride 再利用＝cast_plan.overrides_json の base 上書きが効く）
 *  - 日跨ぎ LAST（「26:00」表記と「02:00」跨ぎ表記の同値・end==start は 0 分）
 *  - comp 未設定混在（0円カウント・unknownComp は cast 人数・頭数は byBand から隠さない）
 *  - confirmed+planned 混在（status は金額に影響しない＝入力に載せても無視される）
 *  - 0人日＝0円
 *  - ★丸め regime（cast ごと roundYen の整数和＝payOf 規約。全体1回丸めなら 7498 になる入力で 7497 を固定）
 *  - ★golden 1本（固定入力→固定合計 55233。payOf 既存 golden 54400/wage5931 とは別系統・非接触）
 */
import { forecastDay, type ForecastComp } from "../lib/nox/labor-forecast";
import type { CompPlan } from "../lib/nox/pay";

let pass = 0;
const fails: string[] = [];
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// プラン雛形（スライド無し・保証のみ）。バック単価は時給に無関係＝予測にも無関係（§1 含めない）。
function plan(base: number, over?: Partial<CompPlan>): CompPlan {
  return {
    id: "p", name: "テスト", base,
    honBack: 3000, jonaiBack: 1000, dohanBack: 2000,
    salesSlide: [], pointSlide: [],
    ...over,
  };
}
const comp = (p: CompPlan, override?: ForecastComp["override"]): ForecastComp => ({ plan: p, override });

// ── 基本形 ──
{
  const r = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "26:00" }],
    { a: comp(plan(3000)) },
  );
  eq("基本形 total（3000×6h）", r.total, 18000);
  eq("基本形 totalMinutes", r.totalMinutes, 360);
  eq("基本形 byBand", r.byBand, [{ startHm: "20:00", endHm: "26:00", minutes: 360, heads: 1, amount: 18000 }]);
  eq("基本形 unknownComp", r.unknownComp, 0);
}

// ── スライド解決（wageDetail 再利用の実証）──
{
  // at=0 段は売上ゼロでも有効＝保証 3000 より高い 3500 を採用
  const r1 = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "26:00" }],
    { a: comp(plan(3000, { salesSlide: [{ at: 0, wage: 3500 }, { at: 100_000, wage: 4000 }] })) },
  );
  eq("売上スライド at=0 段を採用（3500×6h）", r1.total, 21000);
  // at>0 のみのスライドは予定段階（売上ゼロ）では発火しない＝保証に落ちる
  const r2 = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "26:00" }],
    { a: comp(plan(3000, { salesSlide: [{ at: 100_000, wage: 5000 }] })) },
  );
  eq("at>0 段は発火せず保証（3000×6h）", r2.total, 18000);
  // pointSlide の at=0 段も同様に採用
  const r3 = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "26:00" }],
    { a: comp(plan(3000, { pointSlide: [{ at: 0, wage: 3200 }] })) },
  );
  eq("ptスライド at=0 段を採用（3200×6h）", r3.total, 19200);
  // 売上 3500 vs pt 3600 vs 保証 3000 → max=3600（wageDetail の採用規則そのまま）
  const r4 = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "26:00" }],
    { a: comp(plan(3000, { salesSlide: [{ at: 0, wage: 3500 }], pointSlide: [{ at: 0, wage: 3600 }] })) },
  );
  eq("売上/pt/保証の max（3600×6h）", r4.total, 21600);
}

// ── override 反映（applyOverride 再利用）──
{
  const r = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "26:00" }],
    { a: comp(plan(2800), { base: 3200 }) },
  );
  eq("override base 3200 を採用（3200×6h）", r.total, 19200);
}

// ── 日跨ぎ LAST ──
{
  const r1 = forecastDay(
    [{ castId: "a", startHm: "22:00", endHm: "26:00" }],
    { a: comp(plan(3000)) },
  );
  const r2 = forecastDay(
    [{ castId: "a", startHm: "22:00", endHm: "02:00" }],
    { a: comp(plan(3000)) },
  );
  eq("24h超表記 22:00–26:00（4h）", r1.total, 12000);
  eq("跨ぎ表記 22:00–02:00 は同値", r2.total, r1.total);
  const r3 = forecastDay(
    [{ castId: "a", startHm: "23:00", endHm: "29:00" }],
    { a: comp(plan(3000)) },
  );
  eq("深夜 LAST 23:00–29:00（6h）", r3.total, 18000);
  const r0 = forecastDay(
    [{ castId: "a", startHm: "20:00", endHm: "20:00" }],
    { a: comp(plan(3000)) },
  );
  eq("end==start は 0分＝0円", { total: r0.total, min: r0.totalMinutes }, { total: 0, min: 0 });
}

// ── comp 未設定混在 ──
{
  const r = forecastDay(
    [
      { castId: "a", startHm: "20:00", endHm: "26:00" },
      { castId: "x", startHm: "20:00", endHm: "26:00" }, // comp 無し（2本）
      { castId: "x", startHm: "27:00", endHm: "28:00" },
    ],
    { a: comp(plan(3000)) },
  );
  eq("未設定は 0円（total は既知分のみ）", r.total, 18000);
  eq("unknownComp は cast 人数（シフト2本でも1人）", r.unknownComp, 1);
  eq("頭数は隠さない（同一バンド heads=2・金額は既知分のみ）", r.byBand[0], {
    startHm: "20:00", endHm: "26:00", minutes: 360, heads: 2, amount: 18000,
  });
  eq("totalMinutes は未設定分も含む", r.totalMinutes, 360 + 360 + 60);
}

// ── confirmed+planned 混在（status は金額に影響しない）──
{
  const withStatus = [
    { castId: "a", startHm: "20:00", endHm: "26:00", status: "confirmed" },
    { castId: "b", startHm: "21:00", endHm: "26:00", status: "planned" },
  ];
  const comps = { a: comp(plan(3000)), b: comp(plan(2800)) };
  const r = forecastDay(withStatus, comps);
  eq("confirmed+planned 混在（両方含める）", r.total, 18000 + 14000);
  const flipped = withStatus.map((s) => ({ ...s, status: s.status === "confirmed" ? "planned" : "confirmed" }));
  eq("status を入れ替えても不変", forecastDay(flipped, comps).total, r.total);
}

// ── 0人日 ──
{
  const r = forecastDay([], {});
  eq("0人日＝0円", r, { total: 0, totalMinutes: 0, byBand: [], unknownComp: 0 });
}

// ── ★丸め regime（cast ごと roundYen の整数和＝payOf 規約）──
{
  // 2999円/h × 100分 = 4998.33…→4998・2999円/h × 50分 = 2499.16…→2499。
  // cast 丸めの和 = 7497。全体を1回で丸めると roundYen(7497.5)=7498 になる入力＝regime の識別器。
  const r = forecastDay(
    [
      { castId: "a", startHm: "20:00", endHm: "21:40" },
      { castId: "b", startHm: "20:00", endHm: "20:50" },
    ],
    { a: comp(plan(2999)), b: comp(plan(2999)) },
  );
  eq("★cast 単位 roundYen の整数和（7497・全体丸めなら7498）", r.total, 7497);
}

// ── バンド集約（同一 start/end を束ねる）──
{
  const r = forecastDay(
    [
      { castId: "a", startHm: "20:00", endHm: "26:00" },
      { castId: "b", startHm: "20:00", endHm: "26:00" },
    ],
    { a: comp(plan(3000)), b: comp(plan(3500)) },
  );
  eq("同一バンドに束なる（heads=2・3000×6h+3500×6h）", r.byBand, [
    { startHm: "20:00", endHm: "26:00", minutes: 360, heads: 2, amount: 39000 },
  ]);
}

// ── ★golden（固定入力→固定合計。payOf 既存 golden 54400/wage5931 とは別系統）──
{
  const r = forecastDay(
    [
      { castId: "A", startHm: "20:00", endHm: "26:00" }, // 3500×6h=21000（salesSlide at=0）
      { castId: "B", startHm: "21:30", endHm: "26:00" }, // override base 3000×4.5h=13500
      { castId: "C", startHm: "22:00", endHm: "26:00" }, // comp 無し＝0円
      { castId: "D", startHm: "20:00", endHm: "25:30" }, // 3300×5.5h=18150（pointSlide at=0）
      { castId: "E", startHm: "21:00", endHm: "21:50" }, // 3100×50/60=2583.33…→2583
    ],
    {
      A: comp(plan(3000, { salesSlide: [{ at: 0, wage: 3500 }, { at: 100_000, wage: 4000 }] })),
      B: comp(plan(2800), { base: 3000 }),
      D: comp(plan(3000, { pointSlide: [{ at: 0, wage: 3300 }] })),
      E: comp(plan(3100)),
    },
  );
  eq("golden total = 55233", r.total, 55233);
  eq("golden totalMinutes = 1250", r.totalMinutes, 360 + 270 + 240 + 330 + 50);
  eq("golden unknownComp = 1", r.unknownComp, 1);
  eq("golden byBand（start昇順→end昇順・未設定バンドは heads1/amount0）", r.byBand, [
    { startHm: "20:00", endHm: "25:30", minutes: 330, heads: 1, amount: 18150 },
    { startHm: "20:00", endHm: "26:00", minutes: 360, heads: 1, amount: 21000 },
    { startHm: "21:00", endHm: "21:50", minutes: 50, heads: 1, amount: 2583 },
    { startHm: "21:30", endHm: "26:00", minutes: 270, heads: 1, amount: 13500 },
    { startHm: "22:00", endHm: "26:00", minutes: 240, heads: 1, amount: 0 },
  ]);
}

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
} else {
  console.log(`verify:nox-labor-forecast ALL PASS (${pass} assertions)`);
}
