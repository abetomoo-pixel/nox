/*
 * verify:nox-shift-time — 日跨ぎ時刻の純関数スイート（DB 不要）。
 *   npm run verify:nox-shift-time
 *
 * 正本 lib/nox/shift-time.ts の網羅（mig0008 決定3 の規約）:
 *  - 跨ぎ判定（end<start／24h 超表記／境界 00:00・24:00・47:59）
 *  - spanMinutes の +24h 補正・「26:00」と「02:00」の両表記が同一結果
 *  - nominalSegment の翌日正規化（月末・年末跨ぎ含む）
 *  - fmtWin（翌表記）・fmtBand30（30時間制表示）
 */
import {
  hm2min,
  min2hm,
  crossesMidnight,
  spanMinutes,
  netMinutes,
  fmtWin,
  nominalSegment,
  fmtBand30,
} from "../lib/nox/shift-time";
import { addDays, bizDateRange, bizDateOf } from "../lib/nox/biz-date";

let pass = 0;
const fails: string[] = [];
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── hm2min / min2hm ──
eq("hm2min 00:00", hm2min("00:00"), 0);
eq("hm2min 23:59", hm2min("23:59"), 1439);
eq("hm2min 26:00（24h超表記）", hm2min("26:00"), 1560);
eq("hm2min 47:59（上限）", hm2min("47:59"), 2879);
eq("min2hm 1560 → 26:00", min2hm(1560), "26:00");

// ── crossesMidnight ──
eq("跨ぎ: 23:00→02:00", crossesMidnight("23:00", "02:00"), true);
eq("跨ぎ: 23:00→26:00（24h超表記）", crossesMidnight("23:00", "26:00"), true);
eq("同日: 20:00→23:00", crossesMidnight("20:00", "23:00"), false);
eq("退化: 00:00→00:00（同日0分）", crossesMidnight("00:00", "00:00"), false);
eq("境界: 00:00→24:00 は翌日", crossesMidnight("00:00", "24:00"), true);
eq("境界: 00:00→23:59 は同日", crossesMidnight("00:00", "23:59"), false);

// ── spanMinutes（+24h 補正・両表記一致）──
eq("span 同日 20:00→23:00 = 180", spanMinutes("20:00", "23:00"), 180);
eq("span 跨ぎ 23:00→02:00 = 180", spanMinutes("23:00", "02:00"), 180);
eq("span 24h超 23:00→26:00 = 180", spanMinutes("23:00", "26:00"), 180);
eq(
  "両表記の同一結果（26:00 ≡ 翌02:00）",
  spanMinutes("23:00", "26:00") === spanMinutes("23:00", "02:00"),
  true,
);
eq("span 退化 00:00→00:00 = 0", spanMinutes("00:00", "00:00"), 0);
eq("span 上限 00:00→47:59 = 2879", spanMinutes("00:00", "47:59"), 2879);
eq("span 22:30→25:15 = 165", spanMinutes("22:30", "25:15"), 165);
eq("span 境界 00:00→24:00 = 1440", spanMinutes("00:00", "24:00"), 1440);

// ── netMinutes ──
eq("net 180−60 = 120", netMinutes("23:00", "02:00", 60), 120);
eq("net 休憩過大は下限0", netMinutes("23:00", "02:00", 999), 0);
eq("net 休憩0", netMinutes("20:00", "23:00", 0), 180);

// ── fmtWin ──
eq("fmtWin 同日", fmtWin("20:00", "23:00"), "20:00–23:00");
eq("fmtWin 跨ぎ＝翌", fmtWin("23:00", "02:00"), "23:00–翌02:00");
eq("fmtWin 24h超は正規化して翌", fmtWin("23:00", "26:00"), "23:00–翌02:00");
eq("fmtWin from のみ", fmtWin("20:00", null), "20:00–");
eq("fmtWin to のみ", fmtWin(null, "23:00"), "–23:00");
eq("fmtWin 両方 null", fmtWin(null, null), "");

// ── nominalSegment（翌日正規化・月末/年末）──
eq(
  "seg 同日",
  nominalSegment("2026-07-01", "20:00", "23:00"),
  { start: "2026-07-01T20:00:00+09:00", end: "2026-07-01T23:00:00+09:00" },
);
eq(
  "seg 跨ぎ表記",
  nominalSegment("2026-07-01", "23:00", "02:00"),
  { start: "2026-07-01T23:00:00+09:00", end: "2026-07-02T02:00:00+09:00" },
);
eq(
  "seg 24h超表記（26:00 → 翌02:00 に正規化）",
  nominalSegment("2026-07-01", "23:00", "26:00"),
  { start: "2026-07-01T23:00:00+09:00", end: "2026-07-02T02:00:00+09:00" },
);
eq(
  "seg 月末跨ぎ",
  nominalSegment("2026-06-30", "23:00", "01:00").end,
  "2026-07-01T01:00:00+09:00",
);
eq(
  "seg 年末跨ぎ",
  nominalSegment("2026-12-31", "23:00", "01:00").end,
  "2027-01-01T01:00:00+09:00",
);
eq(
  "seg 境界 24:00 = 翌 00:00",
  nominalSegment("2026-07-01", "00:00", "24:00").end,
  "2026-07-02T00:00:00+09:00",
);

// ── fmtBand30（表示専用・30時間制）──
eq("band30 同日はそのまま", fmtBand30("20:00", "23:00"), "20:00–23:00");
eq("band30 跨ぎ表記は+24h 描画", fmtBand30("23:00", "02:00"), "23:00–26:00");
eq("band30 24h超表記はそのまま", fmtBand30("23:00", "26:00"), "23:00–26:00");

// ── biz-date（営業日境界・F1e・DB 側 daily_report_aggregate と同一規則）──
eq("addDays 月末", addDays("2026-06-30", 1), "2026-07-01");
eq("addDays 年末", addDays("2026-12-31", 1), "2027-01-01");
eq(
  "bizDateRange 2026-07-02/06:00",
  bizDateRange("2026-07-02", "06:00"),
  { startIso: "2026-07-02T06:00:00+09:00", endIso: "2026-07-03T06:00:00+09:00" },
);
eq("bizDateOf 境界内（D+1 05:59 → D）", bizDateOf("2026-07-03T05:59:00+09:00", "06:00"), "2026-07-02");
eq("bizDateOf 境界（D+1 06:00 → D+1）", bizDateOf("2026-07-03T06:00:00+09:00", "06:00"), "2026-07-03");
eq("bizDateOf UTC 入力の等価性（20:59Z=翌05:59JST）", bizDateOf("2026-07-02T20:59:00Z", "06:00"), "2026-07-02");
eq("bizDateOf cutoff 00:00 は暦日", bizDateOf("2026-07-03T00:00:00+09:00", "00:00"), "2026-07-03");

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
} else {
  console.log(`verify:nox-shift-time ALL PASS (${pass} assertions)`);
}
