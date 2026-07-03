/*
 * verify:nox-punch-match — 打刻突合純関数スイート（DB 不要・台帳 #20）。
 *   npm run verify:nox-punch-match
 *
 * 正本 docs/NOX_payOf_精密仕様_モック抽出.md §4.1/§4.2 の網羅:
 *  - モック vp/lx/ux 逐語ハーネスの実測21ケース（2026-07-03）をゴールデン固定。
 *    モックの不採用挙動（tx 捏造・Zu 翌非対応の fail-open・表示週窓）は
 *    「NOX の裁定後の値」でアンカーし、コメントにモック実測値を併記する。
 *  - 沈黙部 S1〜S6 の裁定（最初の in・孤立 out・raw/final 二段・0-47 域・期間走査・分粒度）
 *  - S3 status→final 対応表の5分岐（shukkin/dohan・late×punch 有無・absent・off・無し）
 *    ＋適用条件の限定（裁定追補 2026-07-03: shift 無しの attendance は final に昇格せず
 *    no_shift＋anomaly＝罰金は確定シフトの存在が前提）
 */
import {
  matchPunches,
  type PunchEvent,
  type PunchMatchConfig,
} from "../lib/nox/punch-match";

let pass = 0;
const fails: string[] = [];
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const CLOSE = "25:00"; // モック na.close='01:00' の 0-47 域表記
const cfg: PunchMatchConfig = { close: CLOSE }; // 既定 10/30/90（S7）
const D = "2026-07-08";
const D2 = "2026-07-09";
const shift = (bizDate: string, start = "20:00") => ({ bizDate, start, end: "25:00" });
const pin = (at: string): PunchEvent => ({ kind: "in", at });
const pout = (at: string): PunchEvent => ({ kind: "out", at });

// 1日だけ流すヘルパー
function one(events: PunchEvent[], opts?: { noShift?: boolean; att?: "shukkin" | "dohan" | "late" | "off" | "absent"; start?: string }) {
  return matchPunches({
    shifts: opts?.noShift ? [] : [shift(D, opts?.start ?? "20:00")],
    punches: events.length > 0 ? { [D]: events } : {},
    attendance: opts?.att ? [{ bizDate: D, status: opts.att }] : [],
    config: cfg,
  });
}

// ── A. 確定規則の境界（モック実測 A1〜A5 と同値） ──
{
  const r = one([pin("20:05")]);
  eq("A1 in 20:05 (h=5) → ok", r.days[0].raw.in, { type: "ok", act: "20:05" });
  eq("A1 counts", [r.lateN, r.absentN], [0, 0]);
}
eq("A2 in 20:10 (h=10 境界・strict でセーフ)", one([pin("20:10")]).days[0].raw.in, { type: "ok", act: "20:10" });
{
  const r = one([pin("20:11")]);
  eq("A3 in 20:11 (h=11) → late", r.days[0].raw.in, { type: "late", min: 11, act: "20:11" });
  eq("A3 lateN", r.lateN, 1);
}
eq("A4 in 19:30 (h=-30 早出) → ok", one([pin("19:30")]).days[0].raw.in, { type: "ok", act: "19:30" });
eq("A5 in 20:44 → late min=44（超過素値・grace を引かない）", one([pin("20:44")]).days[0].raw.in, {
  type: "late",
  min: 44,
  act: "20:44",
});

// ── B. in 無し → absent（モック B1。B2 の tx 捏造＝デモ足場は翻訳対象外＝入力に in が無ければ常に absent） ──
{
  const r = one([]);
  eq("B1 shift有り punch無し → absent", r.days[0].raw.in, { type: "absent" });
  eq("B1 absentN", r.absentN, 1);
  eq("B2 tx フォールバック不在（モック B2 は tx が in='20:02' を捏造して ok 化・NOX は absent 維持）", r.days[0].final, {
    type: "absent",
  });
}

// ── C. in-in（S1: 最初の in 採用＋anomaly。モック C2/C3 は上書き＝最後の in で late60・不採用） ──
{
  const r = one([pin("20:36"), pin("21:00")]);
  eq("C1 最初の in 20:36 を採用 → late min=36", r.days[0].raw.in, { type: "late", min: 36, act: "20:36" });
  eq("C2 anomaly 'in_in'", r.days[0].anomalies, ["in_in"]);
}
eq(
  "C3 イベント順序に非依存（時刻昇順ソート後に最初の in）",
  one([pin("21:00"), pin("20:36")]).days[0].raw.in,
  { type: "late", min: 36, act: "20:36" },
);

// ── D. 孤立 out（S2: absent 維持＋anomaly。モック D1 と同値・D3 の out 独立判定も同値） ──
{
  const r = one([pout("26:05")]);
  eq("D1 out有り in無し → absent（out を出勤の証拠と認めない）", r.days[0].raw.in, { type: "absent" });
  eq("D2 anomaly 'orphan_out'", r.days[0].anomalies, ["orphan_out"]);
  eq("D3 孤立 out 自体の退勤照合は独立に ok（26:05 vs close 25:00 → g=65）", r.days[0].raw.out, {
    type: "ok",
    out: "26:05",
  });
  eq("D absentN", r.absentN, 1);
}

// ── E. out 忘れ → 翌日 in（モック E1/E2: noout で終わり・翌日は塞がらない＝3層モデル） ──
{
  const r = matchPunches({
    shifts: [shift(D), shift(D2)],
    punches: { [D]: [pin("20:00")], [D2]: [pin("20:02")] },
    attendance: [],
    config: cfg,
  });
  eq("E1 当日 out 無し → raw.out noout（罰金非接続）", r.days[0].raw.out, { type: "noout" });
  eq("E2 翌日の in は独立に ok（塞がらない）", r.days[1].raw.in, { type: "ok", act: "20:02" });
  eq("E3 counts（noout は数えない）", [r.lateN, r.absentN], [0, 0]);
}

// ── F. shift×punch の非対称（モック F1/F2 と同値） ──
{
  const r = one([pin("20:00"), pout("25:00")], { noShift: true });
  eq("F1 shift無し punch有り → no_shift（不算入）", r.days[0].raw.in, { type: "no_shift" });
  eq("F1 counts", [r.lateN, r.absentN], [0, 0]);
}
eq("F2 shift有り punch無し（attendance も無し）→ absent", one([]).days[0].final, { type: "absent" });

// ── G. 0-47 域比較（S4。モック G1/G2 は fail-open で ok 化＝不採用）・ux 境界（G6〜G9 と同値） ──
{
  const r = one([pin("25:30")]); // 深夜 01:30 着＝営業日帰属後 25:30（モック G1 は h=-1110 で ok に化けた）
  eq("G1 深夜着 25:30 → late min=330（fail-open 不採用）", r.days[0].raw.in, { type: "late", min: 330, act: "25:30" });
}
eq("G2 24h 超の in 24:10 → late min=250（0-47 域で単調）", one([pin("24:10")]).days[0].raw.in, {
  type: "late",
  min: 250,
  act: "24:10",
});
eq("G6 out 24:30 vs close 25:00（g=-30 境界）→ ok", one([pin("20:00"), pout("24:30")]).days[0].raw.out, {
  type: "ok",
  out: "24:30",
});
eq("G7 out 24:29（g=-31）→ early min=31", one([pin("20:00"), pout("24:29")]).days[0].raw.out, {
  type: "early",
  min: 31,
  out: "24:29",
});
eq("G8 out 26:30（g=90 境界）→ ok", one([pin("20:00"), pout("26:30")]).days[0].raw.out, {
  type: "ok",
  out: "26:30",
});
eq("G9 out 26:31（g=91）→ over min=91", one([pin("20:00"), pout("26:31")]).days[0].raw.out, {
  type: "over",
  min: 91,
  out: "26:31",
});

// ── H. 集計窓は呼び出し側＝渡された日だけを裁く（S5。モックの表示週 be 依存 quirk は不採用） ──
{
  const week1 = matchPunches({
    shifts: [shift("2026-07-08"), shift("2026-07-09")],
    punches: { "2026-07-08": [pin("20:30")], "2026-07-09": [pin("20:00")] },
    attendance: [],
    config: cfg,
  });
  eq("H1 期間スライス1（8日 late30・9日 ok）→ lateN=1", [week1.lateN, week1.absentN], [1, 0]);
  const week2 = matchPunches({
    shifts: [shift("2026-07-15")],
    punches: { "2026-07-15": [pin("20:04")] },
    attendance: [],
    config: cfg,
  });
  eq("H2 期間スライス2（15日 ok のみ）→ 8日の遅刻は混入しない", [week2.lateN, week2.absentN], [0, 0]);
  eq("H3 days は bizDate 昇順", week1.days.map((d) => d.bizDate), ["2026-07-08", "2026-07-09"]);
}

// ── S3 status→final 対応表（5分岐・§4.2 の表と一字対応） ──
{
  const r = one([pin("20:30")], { att: "shukkin" }); // raw=late30
  eq("S3-1 shukkin: late を打ち消し → final ok", r.days[0].final, { type: "ok", act: "20:30" });
  eq("S3-1 raw は late のまま（二段・監査用）", r.days[0].raw.in, { type: "late", min: 30, act: "20:30" });
  eq("S3-1 anomaly 'attendance_conflict'", r.days[0].anomalies, ["attendance_conflict"]);
  eq("S3-1 counts（final 基準）", [r.lateN, r.absentN], [0, 0]);
}
{
  const r = one([], { att: "dohan" }); // raw=absent
  eq("S3-1b dohan: absent を打ち消し → final ok", r.days[0].final, { type: "ok", act: "" });
  eq("S3-1b counts", [r.lateN, r.absentN], [0, 0]);
}
{
  const r = one([pin("20:44")], { att: "late" }); // raw=late44
  eq("S3-2 late（punch有り）: min は punch 由来=44", r.days[0].final, { type: "late", min: 44, act: "20:44" });
  eq("S3-2 同 type のため conflict 無し", r.days[0].anomalies, []);
  eq("S3-2 lateN", r.lateN, 1);
}
{
  const r = one([], { att: "late" }); // raw=absent・punch 無し
  eq("S3-2b late（punch無し）: min=0（回数罰金のみ）", r.days[0].final, { type: "late", min: 0, act: "" });
  eq("S3-2b conflict あり（absent→late）", r.days[0].anomalies, ["attendance_conflict"]);
  eq("S3-2b counts", [r.lateN, r.absentN], [1, 0]);
}
{
  const r = one([pin("20:05")], { att: "absent" }); // raw=ok
  eq("S3-3 absent: punch があっても absent", r.days[0].final, { type: "absent" });
  eq("S3-3 conflict あり（ok→absent）", r.days[0].anomalies, ["attendance_conflict"]);
  eq("S3-3 absentN", r.absentN, 1);
}
{
  const r = one([], { att: "off" }); // raw=absent
  eq("S3-4 off: 店都合取り消し → final no_shift（罰金不算入）", r.days[0].final, { type: "no_shift" });
  eq("S3-4 counts", [r.lateN, r.absentN], [0, 0]);
}
{
  const r = one([pin("20:44")]); // attendance 無し
  eq("S3-5 status 無し: raw のまま（late44）", r.days[0].final, { type: "late", min: 44, act: "20:44" });
  eq("S3-5 conflict 無し", r.days[0].anomalies, []);
}

// ── S3 適用条件の限定（裁定追補: shift 無しの attendance は final に昇格しない） ──
{
  const r = one([], { noShift: true, att: "late" });
  eq("S3-6 shift無し att=late → final no_shift（lateN 不算入）", r.days[0].final, { type: "no_shift" });
  eq("S3-6 anomaly 'attendance_conflict'（UI 要確認表示の土台）", r.days[0].anomalies, ["attendance_conflict"]);
  eq("S3-6 counts", [r.lateN, r.absentN], [0, 0]);
}
{
  const r = one([], { noShift: true, att: "absent" });
  eq("S3-7 shift無し att=absent → final no_shift（absentN 不算入）", r.days[0].final, { type: "no_shift" });
  eq("S3-7 anomaly 記録", r.days[0].anomalies, ["attendance_conflict"]);
  eq("S3-7 counts", [r.lateN, r.absentN], [0, 0]);
}
{
  // shift 無し＋punch 有り＋attendance 有り＝raw は no_shift のまま・final も no_shift・anomaly は付く
  const r = one([pin("20:00"), pout("25:30")], { noShift: true, att: "shukkin" });
  eq("S3-8 shift無し punch有り att=shukkin → raw/final とも no_shift", [r.days[0].raw.in, r.days[0].final], [
    { type: "no_shift" },
    { type: "no_shift" },
  ]);
  eq("S3-8 anomaly 記録・counts 不算入", [r.days[0].anomalies, r.lateN, r.absentN], [["attendance_conflict"], 0, 0]);
}

// ── 総合（複合期間・payOf の fine 入力になる counts のゴールデン） ──
{
  const r = matchPunches({
    shifts: [shift("2026-07-01"), shift("2026-07-02"), shift("2026-07-03"), shift("2026-07-04"), shift("2026-07-05")],
    punches: {
      "2026-07-01": [pin("20:00"), pout("25:10")], // ok
      "2026-07-02": [pin("20:30")], // late30・noout
      "2026-07-03": [pout("24:00")], // 孤立 out → absent
      // 07-04: punch 無し → absent → attendance shukkin で打ち消し
      "2026-07-05": [pin("21:00"), pin("20:15"), pout("25:00")], // in-in → 最初 20:15 → late15
    },
    attendance: [{ bizDate: "2026-07-04", status: "shukkin" }],
    config: cfg,
  });
  eq("総合 lateN=2（07-02, 07-05）", r.lateN, 2);
  eq("総合 absentN=1（07-03 のみ・07-04 は打ち消し）", r.absentN, 1);
  eq(
    "総合 anomalies（07-03 orphan_out・07-04 conflict・07-05 in_in）",
    r.days.map((d) => d.anomalies),
    [[], [], ["orphan_out"], ["attendance_conflict"], ["in_in"]],
  );
  eq("総合 fine 入力（当欠1万・遅刻3千 → 16,000 円相当の回数）", [r.absentN * 10000 + r.lateN * 3000], [16000]);
}

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
} else {
  console.log(`verify:nox-punch-match ALL PASS (${pass} assertions)`);
}
