/**
 * verify:nox-late — 裁定268（2026-09-17）遅刻分数の純関数 lib/nox/shift/late.ts の係留。DB 不触・純関数のみ。
 *   npm run verify:nox-late（env 不要）。f0 53 段目。
 *
 *  lateMinutesOf(startHm, inPunchHm, graceMin): number | null
 *   - 猶予以内 null／猶予ちょうど null／猶予+1 分 → 数値（開始からの差＝punch-match の late.min と同じ素値）
 *   - 打刻なし・開始なし・形式外 null／日跨ぎ（30 時間制の開始 25:30 と 24 時間表示の打刻 01:40）／早出 null／猶予 0
 *  逆テスト 1 本（手動・1 回）: late.ts の `diff > grace` を `diff > 0`（猶予を無視）にする → lt(1-1)・(1-2)・(3-3) が赤 → 戻す。
 */
import { lateMinutesOf } from "../lib/nox/shift/late";
import { LATE_GRACE_MIN_DEFAULT, matchPunches } from "../lib/nox/punch-match";
import { buildMatchInput } from "../lib/nox/punch-io";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const f = (s: string | null | undefined, i: string | null | undefined, g: number) => lateMinutesOf(s, i, g);

// (1) 猶予（既定 10）
check("lt(1-1) 猶予内（20:00 開始・20:05 打刻・猶予 10）→ null", f("20:00", "20:05", 10) === null, String(f("20:00", "20:05", 10)));
check("lt(1-2) 猶予ちょうど（20:10）→ null", f("20:00", "20:10", 10) === null, String(f("20:00", "20:10", 10)));
check("lt(1-3) 猶予+1（20:11）→ 11（開始からの差・grace を引かない）", f("20:00", "20:11", 10) === 11, String(f("20:00", "20:11", 10)));
check("lt(1-4) 大幅遅刻（21:30）→ 90", f("20:00", "21:30", 10) === 90, String(f("20:00", "21:30", 10)));
check("lt(1-5) 開始ちょうど（20:00）→ null", f("20:00", "20:00", 10) === null);
check("lt(1-6) 早出（19:50）→ null", f("20:00", "19:50", 10) === null);
check("lt(1-7) LATE_GRACE_MIN_DEFAULT（10）で 20:10 null・20:11 → 11", f("20:00", "20:10", LATE_GRACE_MIN_DEFAULT) === null && f("20:00", "20:11", LATE_GRACE_MIN_DEFAULT) === 11);

// (2) 欠損・形式外
check("lt(2-1) 打刻なし（null／undefined／空）→ null", f("20:00", null, 10) === null && f("20:00", undefined, 10) === null && f("20:00", "", 10) === null);
check("lt(2-2) 開始なし → null", f(null, "20:30", 10) === null && f("", "20:30", 10) === null);
check("lt(2-3) 形式外（'20時'・'2000'）→ null", f("20:00", "20時", 10) === null && f("2000", "20:30", 10) === null);
check("lt(2-4) 猶予が負／NaN は 0 扱い（20:01 → 1）", f("20:00", "20:01", -5) === 1 && f("20:00", "20:01", Number.NaN) === 1);

// (3) 猶予 0
check("lt(3-1) 猶予 0・開始ちょうど → null", f("20:00", "20:00", 0) === null);
check("lt(3-2) 猶予 0・+1 分 → 1", f("20:00", "20:01", 0) === 1);
check("lt(3-3) 猶予 5・+5 分 null・+6 分 → 6", f("20:00", "20:05", 5) === null && f("20:00", "20:06", 5) === 6);

// (4) 日跨ぎ（30 時間制の開始 vs 24 時間表示の打刻）
check("lt(4-1) 開始 25:30・打刻 01:40（24h 表示）・猶予 10 → null（+10）", f("25:30", "01:40", 10) === null);
check("lt(4-2) 開始 25:30・打刻 01:45 → 15", f("25:30", "01:45", 10) === 15, String(f("25:30", "01:45", 10)));
check("lt(4-3) 開始 25:30・打刻 25:45（30h 表示）→ 15（表記差で同値）", f("25:30", "25:45", 10) === 15);
check("lt(4-4) 開始 23:50・打刻 00:20 → 30", f("23:50", "00:20", 10) === 30, String(f("23:50", "00:20", 10)));
check("lt(4-5) 開始 25:30・打刻 01:00（早出）→ null", f("25:30", "01:00", 10) === null);
check("lt(4-6) 開始 20:00・打刻 23:59 → 239（同日・wrap しない）", f("20:00", "23:59", 10) === 239);

// (5) KPI との一致: punch-match の late 判定（h > lateGrace）と同じ境界＝同じ入力で late ⇔ lateMinutesOf ≠ null・min が一致
const iso = (hm: string) => `2026-09-17T${hm}:00+09:00`;
// shift-board todayCounts（817 行）と同じ組み立て＝buildMatchInput → matchPunches
const pm = (inHm: string, grace: number) => {
  const r = matchPunches({
    ...buildMatchInput({ punches: [{ punched_at: iso(inHm), type: "in" }], shifts: [{ date: "2026-09-17", start_hm: "20:00", end_hm: "23:00" }], attendance: [], cutoffHm: "06:00" }),
    config: { lateGraceMin: grace, close: "23:00" },
  });
  return r.days.find((d) => d.bizDate === "2026-09-17")?.final;
};
for (const [inHm, grace] of [["20:10", 10], ["20:11", 10], ["20:00", 0], ["20:01", 0], ["20:30", 10]] as const) {
  const fin = pm(inHm, grace);
  const n = f("20:00", inHm, grace);
  check(`lt(5) punch-match と同境界（in ${inHm}・猶予 ${grace}）: late ⇔ 数値・min 一致`,
    (fin?.type === "late") === (n !== null) && (fin?.type !== "late" || fin.min === n), JSON.stringify({ fin, n }));
}

if (fails.length) {
  console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const x of fails) console.log(` - ${x}`);
  process.exit(1);
}
console.log(`verify:nox-late ALL PASS (${pass} assertions)`);
console.log("遅刻分数(裁定268): 猶予内/ちょうど null・猶予+1 で数値（開始からの差）・欠損/形式外 null・猶予 0・日跨ぎ（30h 開始×24h 打刻）・punch-match と同境界");
