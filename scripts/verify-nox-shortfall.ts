/**
 * verify:nox-shortfall — 裁定324-3／324-4・追補2-2（0159 client 前倒し・便 L-2-2・2026-09-30）: 不就労控除の純関数 lib/nox/payroll/shortfall.ts の係留。DB 不触・env 不要。
 *   npm run verify:nox-shortfall。f0 81 段目。
 *
 *  shortfallRowsOf({ days, hourlyByDate, lateGraceMin, employment }) → 営業日ごとの {biz_date, target_shift_id, minutes_late, minutes_early, amount, basis, reason}
 *   - 遅刻のみ／早上がりのみ／両方／猶予内（0 行）／無断欠勤（in なし＝0 行）／保証時給中（その日の hourly＝保証額）／丸め（roundYen）／名称（雇用・委託）／out なし（早上がりは数えない）
 *  (11)〜(13) ★便 L-2-3: payTimeBasisOf（既定 punch・next_from の境界）・payOf の payTimeBasis 'shift'（出勤日の hours＝確定シフト時間・欠勤日は 0 のまま）・'punch'／未指定＝golden（玲奈 timePay 653,050）不変・buildPayInput は masters.payTimeBasis='shift' のときだけキーを足す
 *  逆テスト 1 本（手動・1 回）: shortfall.ts の `(late + early)) / 60` を `/ 30` にする → sf(1-1) が赤 → 戻す。逆テスト 2（L-2-3）: pay.ts の dailyBase の `input.payTimeBasis === "shift"` を `=== "punch"` にする → sf(12-1)／(12-3) が赤 → 戻す。
 */
import fs from "node:fs";
import { shortfallRowsOf, shortfallBasisOf, shortfallLabelOf } from "../lib/nox/payroll/shortfall";
import { roundYen } from "../lib/nox/money";
import { payOf } from "../lib/nox/pay"; // ★便 L-2-3: payTimeBasis 'shift'（確定シフト時間で時給計算）／'punch'＝golden 不変
import { payTimeBasisOf, PAY_TIME_BASIS_DEFAULT } from "../lib/nox/payroll/time-basis";
import { buildPayInput, type CastRaw, type StoreMasters } from "../lib/nox/payroll/assemble";
import { REINA_INPUT } from "./fixtures-pay";
import { isRpcMissing, shortfallSyncRowsOf } from "../lib/nox/payroll/shortfall-sync"; // ★便 L-2-4

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

const day = (o: Partial<Parameters<typeof shortfallRowsOf>[0]["days"][number]>) => ({ bizDate: "2026-09-10", shiftId: "s1", startHm: "20:00", endHm: "25:00", inHm: "20:00", outHm: "25:00", ...o });
const H = { "2026-09-10": 3000, "2026-09-11": 3000, "2026-09-12": 4500 };
const run = (days: ReturnType<typeof day>[], employment: "委託" | "雇用" | null = "雇用", grace = 10) => shortfallRowsOf({ days, hourlyByDate: H, lateGraceMin: grace, employment });

// (1) 遅刻のみ
const r1 = run([day({ inHm: "20:30" })]);
check("sf(1-1) 遅刻のみ（20:00 開始・20:30 打刻・猶予 10）→ 1 行・late 30・early 0・amount 1500＝3000×30÷60・basis「遅刻 30 分」・reason「不就労控除（遅刻 30 分）」・target_shift_id s1",
  r1.length === 1 && r1[0].minutes_late === 30 && r1[0].minutes_early === 0 && r1[0].amount === 1500 && r1[0].basis === "遅刻 30 分" && r1[0].reason === "不就労控除（遅刻 30 分）" && r1[0].target_shift_id === "s1" && r1[0].biz_date === "2026-09-10", JSON.stringify(r1));
// (2) 早上がりのみ（猶予なし）
const r2 = run([day({ outHm: "24:40" })]);
check("sf(2-1) 早上がりのみ（25:00 終了・24:40 退勤）→ early 20・late 0・amount 1000・basis「早上がり 20 分」", r2.length === 1 && r2[0].minutes_early === 20 && r2[0].minutes_late === 0 && r2[0].amount === 1000 && r2[0].basis === "早上がり 20 分", JSON.stringify(r2));
check("sf(2-2) 早上がり 1 分でも行が出る（猶予なし）", run([day({ outHm: "24:59" })])[0]?.minutes_early === 1);
// (3) 両方
const r3 = run([day({ inHm: "20:15", outHm: "24:30" })]);
check("sf(3-1) 両方（遅刻 15・早上がり 30）→ amount 2250＝3000×45÷60・basis「遅刻 15 分・早上がり 30 分」", r3.length === 1 && r3[0].minutes_late === 15 && r3[0].minutes_early === 30 && r3[0].amount === 2250 && r3[0].basis === "遅刻 15 分・早上がり 30 分", JSON.stringify(r3));
// (4) 猶予内
check("sf(4-1) 猶予内（20:10・猶予 10）と定刻退勤 → 0 行", run([day({ inHm: "20:10" })]).length === 0);
check("sf(4-2) 猶予 0 で 20:01 → late 1", run([day({ inHm: "20:01" })], "雇用", 0)[0]?.minutes_late === 1);
// (5) 無断欠勤
check("sf(5-1) 無断欠勤（確定シフトあり・in なし）→ 0 行（支給なし＝控除ではない）", run([day({ inHm: null, outHm: null })]).length === 0);
check("sf(5-2) out なし（in はある）→ 早上がりは数えない（遅刻分だけ）", JSON.stringify(run([day({ inHm: "20:20", outHm: null })]).map((r) => [r.minutes_late, r.minutes_early])) === JSON.stringify([[20, 0]]));
// (6) 保証時給中＝その日の hourly（hourlyByDate に入っている値）
const r6 = run([day({ bizDate: "2026-09-12", shiftId: "s3", inHm: "20:30" })]);
check("sf(6-1) 保証時給中（hourly 4500）→ amount 2250＝4500×30÷60", r6.length === 1 && r6[0].amount === 2250 && r6[0].target_shift_id === "s3", JSON.stringify(r6));
check("sf(6-2) hourly が無い日（0）→ 行を出さない", run([day({ bizDate: "2026-09-30", inHm: "20:30" })]).length === 0);
// (7) 丸め＝roundYen（3000×7÷60＝350・3000×1÷60＝50・1234×7÷60＝143.97→roundYen）
check("sf(7-1) 丸めは roundYen（1234×7÷60）", shortfallRowsOf({ days: [day({ inHm: "20:17" })], hourlyByDate: { "2026-09-10": 1234 }, lateGraceMin: 10, employment: "雇用" })[0]?.amount === roundYen((1234 * 17) / 60));
// (8) 名称
check("sf(8-1) 委託（null 含む）は「報酬調整（契約）（…）」・雇用は「不就労控除（…）」", run([day({ inHm: "20:30" })], "委託")[0]?.reason === "報酬調整（契約）（遅刻 30 分）" && run([day({ inHm: "20:30" })], null)[0]?.reason === "報酬調整（契約）（遅刻 30 分）" && shortfallLabelOf("雇用") === "不就労控除");
check("sf(8-2) shortfallBasisOf: 0・0 → ''／遅刻のみ／早上がりのみ／両方", shortfallBasisOf(0, 0) === "" && shortfallBasisOf(5, 0) === "遅刻 5 分" && shortfallBasisOf(0, 7) === "早上がり 7 分" && shortfallBasisOf(5, 7) === "遅刻 5 分・早上がり 7 分");
// (9) 複数日・確定シフトなし
const r9 = run([day({ inHm: "20:30" }), day({ bizDate: "2026-09-11", shiftId: "s2", inHm: "20:00", outHm: "24:00" }), day({ bizDate: "2026-09-12", shiftId: "", inHm: "21:00" })]);
check("sf(9-1) 複数日は日ごと 1 行（9/10 遅刻・9/11 早上がり 60）・確定シフトなし（shiftId 空）は出さない", r9.length === 2 && r9[0].biz_date === "2026-09-10" && r9[1].biz_date === "2026-09-11" && r9[1].amount === 3000, JSON.stringify(r9.map((r) => [r.biz_date, r.amount])));
// (10) 日跨ぎ（30h 表記の終了 25:00 に対する 24h 表記の退勤 00:30）
check("sf(10-1) 日跨ぎ: 退勤 00:30（24h 表示）→ early 30", run([day({ outHm: "00:30" })])[0]?.minutes_early === 30);

// (11) ★裁定324-1／324-2（便 L-2-3）: payTimeBasisOf＝既定 'punch'・next は期の初日 ≥ next_from のときだけ・不正値は既定
check("sf(11-1) payTimeBasisOf: 欠損／null／不正値 → 'punch'（既定）", payTimeBasisOf(null, "2026-10-01") === "punch" && payTimeBasisOf({}, "2026-10-01") === "punch" && payTimeBasisOf({ pay_time_basis: "daily" }, "2026-10-01") === "punch" && PAY_TIME_BASIS_DEFAULT === "punch");
check("sf(11-2) 現行 'shift'・next なし → 'shift'", payTimeBasisOf({ pay_time_basis: "shift" }, "2026-10-01") === "shift");
check("sf(11-3) next 'shift'・next_from 2026-11-01: 期の初日 10/01 → 'punch'（現行）・11/01 → 'shift'・12/01 → 'shift'（settings は書き換えない＝比較で吸収）",
  payTimeBasisOf({ pay_time_basis: "punch", pay_time_basis_next: "shift", pay_time_basis_next_from: "2026-11-01" }, "2026-10-01") === "punch"
  && payTimeBasisOf({ pay_time_basis: "punch", pay_time_basis_next: "shift", pay_time_basis_next_from: "2026-11-01" }, "2026-11-01") === "shift"
  && payTimeBasisOf({ pay_time_basis: "punch", pay_time_basis_next: "shift", pay_time_basis_next_from: "2026-11-01" }, "2026-12-01") === "shift");
check("sf(11-4) next_from が不正／欠損なら next を無視・next が不正なら現行", payTimeBasisOf({ pay_time_basis: "shift", pay_time_basis_next: "punch", pay_time_basis_next_from: "x" }, "2026-11-01") === "shift" && payTimeBasisOf({ pay_time_basis: "shift", pay_time_basis_next: "punch" }, "2026-11-01") === "shift" && payTimeBasisOf({ pay_time_basis: "punch", pay_time_basis_next: "daily", pay_time_basis_next_from: "2026-01-01" }, "2026-11-01") === "punch");
// (12) payOf の payTimeBasis: 出勤日（hours>0）だけ確定シフト時間に置き換え・欠勤日（hours 0）は 0 のまま・シフトが無い日は実働のまま
const golden = payOf(REINA_INPUT);
const punch = payOf({ ...REINA_INPUT, payTimeBasis: "punch" });
const shiftHoursByDay = Object.fromEntries(REINA_INPUT.daily.map((r) => [r.d, 6]));
const shiftEff = payOf({ ...REINA_INPUT, payTimeBasis: "shift", shiftHoursByDay });
const expectShift = payOf({ ...REINA_INPUT, daily: REINA_INPUT.daily.map((r) => (r.hours > 0 ? { ...r, hours: 6 } : r)) });
check("sf(12-1) 'shift'＝出勤日の hours を確定シフト時間（6h）に置き換えた計算と 1 バイト同値（timePay／wHours／wage／net）", shiftEff.timePay === expectShift.timePay && shiftEff.wHours === expectShift.wHours && shiftEff.wage === expectShift.wage && shiftEff.net === expectShift.net && shiftEff.timePay !== golden.timePay, JSON.stringify({ s: shiftEff.timePay, e: expectShift.timePay, g: golden.timePay }));
check("sf(12-2) 'punch'／未指定＝golden 不変（玲奈 timePay 653,050・net 1,208,848・wHours 110.1）", golden.timePay === 653050 && golden.net === 1208848 && golden.wHours === 110.1 && JSON.stringify(punch) === JSON.stringify(golden), JSON.stringify({ t: golden.timePay, n: golden.net, h: golden.wHours }));
const absent = payOf({ ...REINA_INPUT, payTimeBasis: "shift", daily: [{ d: 1, hours: 0, sales: 0 }, { d: 2, hours: 3, sales: 0 }], shiftHoursByDay: { 1: 5, 2: 5, 3: 5 } });
const absentExp = payOf({ ...REINA_INPUT, daily: [{ d: 1, hours: 0, sales: 0 }, { d: 2, hours: 5, sales: 0 }] });
check("sf(12-3) 無断欠勤（hours 0）はシフトがあっても 0 のまま・出勤日は 5h・シフトの無い日は実働（wHours 5.0）", absent.wHours === 5 && absent.timePay === absentExp.timePay && payOf({ ...REINA_INPUT, payTimeBasis: "shift", daily: [{ d: 1, hours: 3, sales: 0 }], shiftHoursByDay: {} }).wHours === 3, JSON.stringify({ h: absent.wHours, t: absent.timePay, e: absentExp.timePay }));
const sg = payOf({ ...REINA_INPUT, payTimeBasis: "shift", shiftHoursByDay, override: { pay_rule: "shift_guarantee" } });
check("sf(12-4) shift_guarantee との併用: 'shift' で hours＝6h に置換した後の max(実働, シフト)＝同じ 6h（timePay は sf(12-1) と同値）", sg.timePay === shiftEff.timePay, JSON.stringify({ sg: sg.timePay, s: shiftEff.timePay }));
// (13) buildPayInput: masters.payTimeBasis='shift' のときだけ PayInput にキーを足す（'punch'／未指定＝キーなし＝従来と 1 バイト同値）
const rawMin: CastRaw = {
  castId: "c1", castName: "テスト", sales: 0, hon: 0, jonai: 0, dohan: 0, honShimeiAmt: 0, jonaiShimeiAmt: 0,
  daily: [{ bizDate: "2026-09-10", sales: 0, hours: 3 }], productBack: { drink: 0, champ: 0, bottle: 0 }, calculatedBack: 0, pointProducts: 0, champCnt: 0, bottleCnt: 0,
  days: 1, lateN: 0, absentN: 0, anomalyCount: 0, plan: REINA_INPUT.plan, norm: { days: 0, dohan: 0 }, taxProfileMode: "委託", employment: "委託", avgDailyWage: null,
};
const mastersBase: StoreMasters = { penalty: REINA_INPUT.penalty, normConfig: REINA_INPUT.normConfig, deductions: [], customBackDefs: [] };
check("sf(13-1) buildPayInput: masters.payTimeBasis 'shift' → payTimeBasis: 'shift'／'punch'・未指定 → キーなし", buildPayInput(rawMin, "委託", { ...mastersBase, payTimeBasis: "shift" }, 30, 0).payTimeBasis === "shift" && !("payTimeBasis" in buildPayInput(rawMin, "委託", { ...mastersBase, payTimeBasis: "punch" }, 30, 0)) && !("payTimeBasis" in buildPayInput(rawMin, "委託", mastersBase, 30, 0)));
const collectSrc = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
check("sf(13-2) collect: stores.settings_json を読み payTimeBasisOf(…, win.periodStart) で解決・'shift' のときだけ masters にキーを足す", collectSrc.includes('admin.from("stores").select("settings_json").eq("id", storeId).maybeSingle()') && collectSrc.includes("payTimeBasisOf(((stR.data?.settings_json ?? null) as Record<string, unknown> | null), runPeriodStart ??") && collectSrc.includes("loadMasters(admin, storeId, win.period, win.periodEnd, win.periodStart)") && collectSrc.includes('...(basis === "shift" ? { payTimeBasis: "shift" as const } : {})'));

// (14) ★裁定324-4（便 L-2-4）: preview → payroll_shortfall_sync の結線＝p_rows の形・RPC 不在（PGRST202）は素通り・'shift' かつ draft run のときだけ 1 回
check("sf(14-1) shortfallSyncRowsOf: cast ごとの行を {cast_id, biz_date, amount, target_shift_id, basis, reason} に平坦化（0 も渡す＝RPC 側で delete）", JSON.stringify(shortfallSyncRowsOf([{ castId: "c1", rows: [{ biz_date: "2026-09-10", target_shift_id: "s1", minutes_late: 30, minutes_early: 0, amount: 1500, basis: "遅刻 30 分", reason: "不就労控除（遅刻 30 分）" }] }, { castId: "c2", rows: [] }])) === JSON.stringify([{ cast_id: "c1", biz_date: "2026-09-10", amount: 1500, target_shift_id: "s1", basis: "遅刻 30 分", reason: "不就労控除（遅刻 30 分）" }]));
check("sf(14-2) isRpcMissing: PGRST202／'Could not find the function'／schema cache → true・他の error／null → false", isRpcMissing({ code: "PGRST202", message: "x" }) && isRpcMissing({ message: "Could not find the function public.payroll_shortfall_sync(p_rows, p_run_id) in the schema cache" }) && !isRpcMissing({ code: "P0001", message: "bad row" }) && !isRpcMissing(null));
const prevSrc = fs.readFileSync("app/api/payroll/preview/route.ts", "utf8");
const coreSrc = fs.readFileSync("lib/nox/payroll/core.ts", "utf8");
check("sf(14-3) preview route: 'shift' かつ draft run のときだけ rpc(\"payroll_shortfall_sync\") を 1 回・RPC 不在は素通り（isRpcMissing）・本物の error は 500・core は masters.payTimeBasis==='shift' のときだけ shortfallRowsOf（hourly＝pay.wdays）", (prevSrc.match(/rpc\("payroll_shortfall_sync"/g) ?? []).length === 1 && prevSrc.includes('if (draft.payTimeBasis === "shift" && runRow && runRow.status === "draft") {') && prevSrc.includes("if (eSf && !isRpcMissing(eSf)) return NextResponse.json") && coreSrc.includes('if (masters.payTimeBasis === "shift" && c.shortfallDays?.length) {') && coreSrc.includes("for (const w of pay.wdays) hourlyByDate["));

if (fails.length) {
  console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const x of fails) console.log(` - ${x}`);
  process.exit(1);
}
console.log(`verify:nox-shortfall ALL PASS (${pass} assertions)`);
console.log("不就労控除(324-3): 遅刻(猶予あり)×早上がり(猶予なし)×時給÷60 を roundYen・無断欠勤/猶予内/hourly 0 は行なし・雇用=不就労控除/委託=報酬調整（契約）・基準 shift と要約 basis");
