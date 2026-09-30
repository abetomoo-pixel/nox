/**
 * verify:nox-shortfall — 裁定324-3／324-4・追補2-2（0159 client 前倒し・便 L-2-2・2026-09-30）: 不就労控除の純関数 lib/nox/payroll/shortfall.ts の係留。DB 不触・env 不要。
 *   npm run verify:nox-shortfall。f0 81 段目。
 *
 *  shortfallRowsOf({ days, hourlyByDate, lateGraceMin, employment }) → 営業日ごとの {biz_date, target_shift_id, minutes_late, minutes_early, amount, basis, reason}
 *   - 遅刻のみ／早上がりのみ／両方／猶予内（0 行）／無断欠勤（in なし＝0 行）／保証時給中（その日の hourly＝保証額）／丸め（roundYen）／名称（雇用・委託）／out なし（早上がりは数えない）
 *  逆テスト 1 本（手動・1 回）: shortfall.ts の `(late + early)) / 60` を `/ 30` にする → sf(1-1) が赤 → 戻す。
 */
import { shortfallRowsOf, shortfallBasisOf, shortfallLabelOf } from "../lib/nox/payroll/shortfall";
import { roundYen } from "../lib/nox/money";

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

if (fails.length) {
  console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const x of fails) console.log(` - ${x}`);
  process.exit(1);
}
console.log(`verify:nox-shortfall ALL PASS (${pass} assertions)`);
console.log("不就労控除(324-3): 遅刻(猶予あり)×早上がり(猶予なし)×時給÷60 を roundYen・無断欠勤/猶予内/hourly 0 は行なし・雇用=不就労控除/委託=報酬調整（契約）・基準 shift と要約 basis");
