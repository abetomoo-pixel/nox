/*
 * verify:nox-punch-match — 打刻突合純関数スイート（台帳 #20）＋★0154 (9) 打刻の修正申請の DB 段（SUPABASE_DB_URL・pg tx ROLLBACK）。
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
import { liftPunchAt, buildMatchInput } from "../lib/nox/punch-io";
import { Client } from "pg"; // ★0154 (9): DB 段（打刻の修正申請）
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx, ymdAdd } from "./fixtures-pgtx";

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

// ── IO 段（punch-io.ts・timestamptz→0-47 域持ち上げ・F2a-3）──
// cutoff 06:00。bizDateOf の既存規約: cutoff ちょうど（06:00:00）は当日側＝新しい営業日に帰属。
{
  const CO = "06:00";
  // 帰属＋分 floor＋0-47 域化の境界（liftPunchAt）
  eq("IO 通常 20:00→当日20:00", liftPunchAt("2026-07-08T20:00:00+09:00", CO), { bizDate: "2026-07-08", hm: "20:00" });
  eq("IO S4 深夜01:30→前営業日25:30", liftPunchAt("2026-07-09T01:30:00+09:00", CO), { bizDate: "2026-07-08", hm: "25:30" });
  eq("IO cutoff ちょうど06:00:00→当日側（新営業日06:00）", liftPunchAt("2026-07-09T06:00:00+09:00", CO), { bizDate: "2026-07-09", hm: "06:00" });
  eq("IO cutoff 直前05:59:59→前営業日・floor 秒切捨て・29:59", liftPunchAt("2026-07-09T05:59:59+09:00", CO), { bizDate: "2026-07-08", hm: "29:59" });
  eq("IO cutoff 直後06:01:00→当日06:01", liftPunchAt("2026-07-09T06:01:00+09:00", CO), { bizDate: "2026-07-09", hm: "06:01" });
  eq("IO S6 floor 秒切捨て 19:59:59→19:59", liftPunchAt("2026-07-08T19:59:59+09:00", CO), { bizDate: "2026-07-08", hm: "19:59" });
  eq("IO JST 日跨ぎ（22:00Z→翌JST07:00・UTC でなく JST 基準）", liftPunchAt("2026-07-08T22:00:00Z", CO), { bizDate: "2026-07-09", hm: "07:00" });
  // 別 cutoff（正本 biz-date.ts に委譲していることの裏取り）
  eq("IO cutoff 00:00 は暦日境界（00:00 据置）", liftPunchAt("2026-07-09T00:00:00+09:00", "00:00"), { bizDate: "2026-07-09", hm: "00:00" });

  // buildMatchInput → matchPunches 統合（深夜シフトが 0-47 域で正しく ok になる）
  const built = buildMatchInput({
    cutoffHm: CO,
    shifts: [
      { date: "2026-07-08", start_hm: "20:00", end_hm: "25:00" }, // 通常
      { date: "2026-07-09", start_hm: "25:00", end_hm: "30:00" }, // 深夜開始シフト
    ],
    attendance: [],
    punches: [
      { punched_at: "2026-07-08T20:30:00+09:00", type: "in" }, // biz 07-08 20:30 → late30
      { punched_at: "2026-07-08T20:29:59+09:00", type: "in" }, // 同日 in-in（先着 20:29 採用）
      { punched_at: "2026-07-10T01:05:00+09:00", type: "in" }, // biz 07-09 25:05 vs start25:00 → ok
    ],
  });
  eq("IO 統合: punches が営業日別に束ねられる", Object.keys(built.punches).sort(), ["2026-07-08", "2026-07-09"]);
  const res = matchPunches({ ...built, config: { close: "30:00" } });
  eq("IO 統合: 07-08 は先着 in 20:29 採用で late19・in_in anomaly", res.days[0].raw.in, { type: "late", min: 29, act: "20:29" });
  eq("IO 統合: 07-09 深夜 25:05 は 0-47 域比較で ok（fail-open せず）", res.days[1].raw.in, { type: "ok", act: "25:05" });
  eq("IO 統合: lateN=1/absentN=0", [res.lateN, res.absentN], [1, 0]);
}

// ── (9) ★mig0154（裁定294-1〜4／295・2026-09-24）: 打刻の修正申請＝AG 突合 d3／d4 の移植（pg tx で JWT emulate → ROLLBACK＝残留 0）──
//   request（cast 本人／owner・manager）→ decide（approve＝punches update／insert／delete・reject＝decide_reason 必須）→ ack（本人のみ）。
//   逆テスト 1 本（手動・1 回）: pm(9-5) の期待 'not pending' を 'pending' に書き換える→赤・戻して緑（RPC 側は触らない）。
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
async function dbChecks() {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const t = pgTx(db);
  try {
    const st = await t.storeA1();
    const owner = await t.uidOf("ownerA"), mgr = await t.uidOf("managerA1"), staffU = await t.uidOf("staffA1"), castA = await t.uidOf("castA1a"), castB = await t.uidOf("castA1b");
    const castAId = await t.castOf(st.id, castA.id), castBId = await t.castOf(st.id, castB.id);
    check("pm(9-0) fixture: A1／owner／manager／staff／cast A1a・A1b", !!st && !!owner && !!mgr && !!staffU && !!castAId && !!castBId);
    const snapSql = `select (select count(*)::int from public.punches where store_id=$1) pu, (select count(*)::int from public.punch_corrections where store_id=$1) pc, (select count(*)::int from public.payroll_runs where store_id=$1) pr, (select count(*)::int from public.audit_logs where org_id=$2) au`;
    const before = JSON.stringify(await t.one(snapSql, [st.id, st.org_id]));
    await db.query("begin");
    try {
      // fixture（pg・ROLLBACK で消える）: 確定済み run 2098-06（finalized）・2098-07（paid）＝'period finalized' 用・punches 2 本（営業日 bizToday−2）
      for (const [per, stt] of [["2098-06", "finalized"], ["2098-07", "paid"]]) {
        await db.query(`insert into public.payroll_runs (org_id, store_id, period, status, period_start, period_end, created_by) values ($1,$2,$3,$4,($3||'-01')::date,(($3||'-01')::date + interval '1 month' - interval '1 day')::date,$5)`, [st.org_id, st.id, per, stt, owner.id]);
      }
      const bizToday = (await t.one<{ d: string }>(`select public.staff_shift_biz_today($1)::text d`, [st.id])).d;
      const biz = ymdAdd(bizToday, -2);
      const inAt = biz + "T20:00:00+09:00", outAt = new Date(new Date(biz + "T00:00:00+09:00").getTime() + 26 * 3600e3).toISOString();
      const pIn = (await t.one<{ id: string }>(`insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1,$2,$3,$4,'in','self') returning id`, [st.org_id, st.id, castAId, inAt])).id;
      const pOut = (await t.one<{ id: string }>(`insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1,$2,$3,$4,'out','self') returning id`, [st.org_id, st.id, castAId, outAt])).id;
      const pInB = (await t.one<{ id: string }>(`insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) values ($1,$2,$3,$4,'in','self') returning id`, [st.org_id, st.id, castBId, inAt])).id;
      check("pm(9-1) fixture: 営業日窓＝out（翌 02:00）も同じ営業日", (await t.one<{ d: string }>(`select public.biz_date_of($1, $2::timestamptz)::text d`, [st.id, outAt])).d === biz, biz);
      const newIn = biz + "T20:30:00+09:00";
      const r1 = await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5) id`, [castAId, pIn, biz, newIn, "遅れて打刻"]);
      const id1 = r1.ok ? (r1.rows[0].id as string) : "";
      const row1 = id1 ? await t.one<Record<string, unknown>>(`select * from public.punch_corrections where id=$1`, [id1]) : null;
      check("pm(9-2) cast 本人の申請→pending 1 行（before_at＝元・after_at＝新・kind in・decided_at null）・punches は未変更", r1.ok && row1?.decision === "pending" && row1?.kind === "in" && row1?.decided_at === null && new Date(row1?.after_at as string).toISOString() === new Date(newIn).toISOString() && new Date((await t.one<{ punched_at: string }>(`select punched_at from public.punches where id=$1`, [pIn])).punched_at).toISOString() === new Date(inAt).toISOString(), t.errOf(r1));
      const e = [
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pIn, biz, newIn, "  "]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castBId, pInB, biz, newIn, "x"]),
        await t.as(staffU, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pIn, biz, newIn, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,null,'2098-06-15'::date,'in','2098-06-15T21:00:00+09:00'::timestamptz,$2)`, [castAId, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pIn, biz, bizToday + "T21:00:00+09:00", "x"]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,'out',$4::timestamptz,$5)`, [castAId, pIn, biz, newIn, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,null,$2::date,'in',null,$3)`, [castAId, biz, "x"]),
        await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5)`, [castAId, pInB, biz, newIn, "x"]),
      ].map(t.errOf);
      check("pm(9-3) 'reason required'／他人 'forbidden'／staff 非本人 'forbidden'／確定済み期 'period finalized'／窓外 'out of biz window'／kind 不一致 'bad type'／新規かつ削除 'invalid_input'／他人の punch 'punch not found'", JSON.stringify(e) === JSON.stringify(["reason required", "forbidden", "forbidden", "period finalized", "out of biz window", "bad type", "invalid_input", "punch not found"]), e.join(" / "));
      check("pm(9-4) pending の ack→'not decided'", t.errOf(await t.as(castA, `select public.punch_correction_ack($1,'confirmed')`, [id1])) === "not decided");
      const d1 = await t.as(mgr, `select public.punch_correction_decide($1,false,null)`, [id1]), d2 = await t.as(staffU, `select public.punch_correction_decide($1,true,null)`, [id1]), d3 = await t.as(castA, `select public.punch_correction_decide($1,true,null)`, [id1]);
      check("pm(9-5) rejected は理由必須 'reason required'・staff／cast の decide は 'forbidden'", t.errOf(d1) === "reason required" && t.errOf(d2) === "forbidden" && t.errOf(d3) === "forbidden", [d1, d2, d3].map(t.errOf).join(" / "));
      const au0 = (await t.one<{ n: number }>(`select count(*)::int n from public.audit_logs where org_id=$1 and action in ('punch_correction_decide','punch_correction_apply')`, [st.org_id])).n;
      const d4 = await t.as(mgr, `select public.punch_correction_decide($1,true,null)`, [id1]);
      const row1b = await t.one<Record<string, unknown>>(`select * from public.punch_corrections where id=$1`, [id1]);
      const pu1b = await t.one<{ punched_at: string; note: string }>(`select punched_at, note from public.punches where id=$1`, [pIn]);
      const au1 = (await t.one<{ n: number }>(`select count(*)::int n from public.audit_logs where org_id=$1 and action in ('punch_correction_decide','punch_correction_apply')`, [st.org_id])).n;
      const auR = await t.one<{ reason: string }>(`select reason from public.audit_logs where org_id=$1 and action='punch_correction_apply' and target=$2`, [st.org_id, "punches:" + pIn]);
      check("pm(9-6) manager 承認→approved・decided_by＝manager・punches.punched_at＝after_at・note＝punch_correction:<id>・audit decide＋apply（apply の reason＝申請理由）", d4.ok && row1b.decision === "approved" && row1b.decided_by === mgr.id && new Date(pu1b.punched_at).toISOString() === new Date(newIn).toISOString() && pu1b.note === "punch_correction:" + id1 && au1 === au0 + 2 && auR?.reason === "遅れて打刻", t.errOf(d4));
      check("pm(9-7) 二度目の decide→'not pending'", t.errOf(await t.as(mgr, `select public.punch_correction_decide($1,true,null)`, [id1])) === "not pending");
      const a1 = await t.as(castA, `select public.punch_correction_ack($1,'confirmed')`, [id1]), a2 = await t.as(castA, `select public.punch_correction_ack($1,'x')`, [id1]), a3 = await t.as(castB, `select public.punch_correction_ack($1,'disputed')`, [id1]), a4 = await t.as(owner, `select public.punch_correction_ack($1,'confirmed')`, [id1]), a5 = await t.as(castA, `select public.punch_correction_ack($1,'disputed')`, [id1]);
      const ackRow = await t.one<{ ack: string; ack_at: string | null }>(`select ack, ack_at from public.punch_corrections where id=$1`, [id1]);
      check("pm(9-8) ack: 本人 confirmed→disputed 上書き可・'bad ack'・他人 'forbidden'・owner（cast 行なし）'no cast for caller'", a1.ok && t.errOf(a2) === "bad ack" && t.errOf(a3) === "forbidden" && t.errOf(a4) === "no cast for caller" && a5.ok && ackRow.ack === "disputed" && ackRow.ack_at !== null, [a1, a2, a3, a4, a5].map(t.errOf).join(" / "));
      const rej = await t.as(castA, `select public.punch_correction_request($1,$2,$3::date,null,$4::timestamptz,$5) id`, [castAId, pOut, biz, new Date(new Date(outAt).getTime() + 1800e3).toISOString(), "退勤も"]);
      const rejId = rej.ok ? (rej.rows[0].id as string) : "";
      const dj = await t.as(owner, `select public.punch_correction_decide($1,false,'確認できず')`, [rejId]);
      const rejRow = await t.one<{ decision: string; decided_by: string; decide_reason: string | null }>(`select decision, decided_by, decide_reason from public.punch_corrections where id=$1`, [rejId]);
      const drApp = await t.one<{ decide_reason: string | null }>(`select decide_reason from public.punch_corrections where id=$1`, [id1]);
      check("pm(9-9) owner 却下（理由あり）→rejected・punches 不変・decide_reason 保存（295-1）・approved（理由なし）は null", rej.ok && dj.ok && rejRow.decision === "rejected" && rejRow.decided_by === owner.id && rejRow.decide_reason === "確認できず" && drApp.decide_reason === null && new Date((await t.one<{ punched_at: string }>(`select punched_at from public.punches where id=$1`, [pOut])).punched_at).toISOString() === new Date(outAt).toISOString(), `${t.errOf(rej)} / ${t.errOf(dj)}`);
      const rlsDr = await t.as(castA, `select decide_reason from public.punch_corrections where id=$1`, [rejId]), rlsDrB = await t.as(castB, `select decide_reason from public.punch_corrections where id=$1`, [rejId]);
      check("pm(9-10) 本人は RLS 越しに decide_reason を読める・他 cast は 0 行（295-1）", rlsDr.ok && rlsDr.rows.length === 1 && rlsDr.rows[0].decide_reason === "確認できず" && rlsDrB.ok && rlsDrB.rows.length === 0);
      const an = [await t.as("anon", `select public.punch_correction_request($1,null,$2::date,'in',$3::timestamptz,'x')`, [castAId, biz, newIn]), await t.as("anon", `select public.punch_correction_decide($1,true,null)`, [id1]), await t.as("anon", `select public.punch_correction_ack($1,'confirmed')`, [id1]), await t.as("anon", `select public.punch_correction_apply($1,null)`, [id1]), await t.as(owner, `select public.punch_correction_apply($1,null)`, [id1])];
      check("pm(9-11) anon は 3 本とも permission denied・apply は anon／owner（authenticated）とも permission denied（内部専用）", an.every((x) => !x.ok && /permission denied/.test(x.err)), an.map(t.errOf).join(" / "));
      const rls = [await t.as(castA, `select count(*)::int n from public.punch_corrections`), await t.as(castB, `select count(*)::int n from public.punch_corrections`), await t.as(mgr, `select count(*)::int n from public.punch_corrections`), await t.as(staffU, `select count(*)::int n from public.punch_corrections`)].map((r) => (r.ok ? r.rows[0].n : r.err));
      check("pm(9-12) RLS: cast A1a＝自分の 2 行・cast A1b＝0・manager＝2・staff＝0", JSON.stringify(rls) === JSON.stringify([2, 0, 2, 0]), rls.join(" / "));
      // owner／manager 直接＝申請＝確定・1 行（新規 insert／削除）
      const newOut = new Date(new Date(outAt).getTime() + 3600e3).toISOString();
      const puN0 = (await t.one<{ n: number }>(`select count(*)::int n from public.punches where cast_id=$1`, [castAId])).n;
      const o1 = await t.as(owner, `select public.punch_correction_request($1,null,$2::date,'out',$3::timestamptz,$4) id`, [castAId, biz, newOut, "退勤忘れ"]);
      const o1row = o1.ok ? await t.one<Record<string, unknown>>(`select * from public.punch_corrections where id=$1`, [o1.rows[0].id]) : null;
      const o1p = o1row?.punch_id ? await t.one<{ type: string; source: string; note: string; punched_at: string }>(`select type, source, note, punched_at from public.punches where id=$1`, [o1row.punch_id]) : null;
      check("pm(9-13) owner の新規申請→approved 1 行（decided_by＝owner・punch_id＝insert 行）・punches +1（type out・source manager・note punch_correction:<id>）", o1.ok && o1row?.decision === "approved" && o1row?.decided_by === owner.id && !!o1p && o1p.type === "out" && o1p.source === "manager" && o1p.note === "punch_correction:" + o1row?.id && new Date(o1p.punched_at).toISOString() === newOut && (await t.one<{ n: number }>(`select count(*)::int n from public.punches where cast_id=$1`, [castAId])).n === puN0 + 1, t.errOf(o1));
      const o2 = await t.as(mgr, `select public.punch_correction_request($1,$2,$3::date,null,null,$4) id`, [castAId, pOut, biz, "重複"]);
      const o2row = o2.ok ? await t.one<{ punch_id: string | null; before_at: string | null; decision: string }>(`select punch_id, before_at, decision from public.punch_corrections where id=$1`, [o2.rows[0].id]) : null;
      check("pm(9-14) manager の削除申請→approved・punches −1（元 out 行が消える）・punch_id は SET NULL・before_at は残る（295-4）", o2.ok && o2row?.decision === "approved" && o2row?.punch_id === null && o2row?.before_at !== null && (await t.one<{ n: number }>(`select count(*)::int n from public.punches where id=$1`, [pOut])).n === 0 && (await t.one<{ n: number }>(`select count(*)::int n from public.punches where cast_id=$1`, [castAId])).n === puN0, t.errOf(o2));
      check("pm(9-15) owner でも確定済み期（2098-07 paid）は 'period finalized'", t.errOf(await t.as(owner, `select public.punch_correction_request($1,null,'2098-07-10'::date,'in','2098-07-10T20:00:00+09:00'::timestamptz,'x')`, [castAId])) === "period finalized");
      // casts delete で連鎖（295-7＝demo c_wipe の順 punches→casts）
      const castT = (await t.one<{ id: string }>(`insert into public.casts (org_id, store_id, name, employment) values ($1,$2,'NOX-VERIFY-pm 連鎖','委託') returning id`, [st.org_id, st.id])).id;
      const o4 = await t.as(owner, `select public.punch_correction_request($1,null,$2::date,'in',$3::timestamptz,'連鎖テスト') id`, [castT, biz, newIn]);
      await t.asPg();
      await db.query(`delete from public.punches where cast_id=$1`, [castT]);
      const pcMid = await t.one<{ n: number; withp: number }>(`select count(*)::int n, count(punch_id)::int withp from public.punch_corrections where cast_id=$1`, [castT]);
      await db.query(`delete from public.casts where id=$1`, [castT]);
      const pcN1 = (await t.one<{ n: number }>(`select count(*)::int n from public.punch_corrections where cast_id=$1`, [castT])).n;
      check("pm(9-16) punches delete→punch_id SET NULL（行は残る）・casts delete→punch_corrections が CASCADE で 0 行（295-7）", o4.ok && pcMid.n === 1 && pcMid.withp === 0 && pcN1 === 0, `${t.errOf(o4)} mid=${JSON.stringify(pcMid)} after=${pcN1}`);
    } finally {
      await db.query("rollback");
    }
    const after = JSON.stringify(await t.one(snapSql, [st.id, st.org_id]));
    check("pm(9-17) ROLLBACK 後の残留＝実行前と同値（punches／punch_corrections／runs／audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

dbChecks().then(() => {
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-punch-match ALL PASS (${pass} assertions)`);
}).catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
