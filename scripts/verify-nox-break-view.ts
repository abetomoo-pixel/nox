// verify:nox-break-view（★起票170＝相談役 11/26 の便 M の M2-8・起票162 も閉じる）— 休憩を勤怠に出す。DB に触れない純関数と画面の配線の照合（書込なし）。
//   (1) 1 日の休憩：時刻（開始〜終了・翌の書き方）・合計の分（給与と同じ数＝日の窓の分があればそれ・時間から引かない店は生の和）
//   (2) 閉じていない休憩の扱い（0214 を読んだ答え）：その営業日の休憩中の退勤は DB が断る（'on break'）。それでも退勤が入った日は休憩開始〜退勤を休憩（退勤の時刻で終了扱い）・今日は「休憩中」・退勤も無い過去の日は「終了も退勤も記録なし」
//   (3) 人ごと・月の合計・直しの初期値（生の時刻）・break_set の断りの日本語・シフトの画面の「休憩中」
//   (4) 明細：休憩を引いた人だけ時間の行の下に「勤務 ○ 時間（休憩 ○ 分を除く）」（0 円の注記・合計と差引は変わらない）
//   (5) 配線：店長の勤怠の表・/mine の今月の勤怠一覧・シフトの今日タブ・直し（break_set）・給与の collect → core → 明細。旗 false は読まない
import fs from "node:fs";
import {
  breakDayViewOf, breakDayViewsOf, breakDayViewOfAdj, breakSpanTextOf, breakDaySummaryOf, breakMonthTotalOf, breakMonthLabelOf, breakEditSpansOf,
  breakSetErrJa, onBreakCastIdsOf, punchBreakNoteExtraOf, workHoursBreakLineOf, breakHmJa, BREAK_OPEN_JA, BREAK_NOT_COUNTED_NOTE, ON_BREAK_BADGE, PUNCH_BREAK_NOTE_KIND, type BreakRaw,
} from "../lib/nox/punch/break-view";
import { dayWindowOf, minOfBizDay } from "../lib/nox/punch/day-window";
import { breakdownLinesOf, type BreakdownPayLike } from "../lib/nox/payroll/breakdown-lines";
import { attendanceDayRowsOf } from "../lib/nox/payroll/attendance-sheet";
import { breakEditErrOf, breakSetRowsOf } from "../lib/nox/punch/break-edit";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); };
const J = (x: unknown) => JSON.stringify(x);
/** 営業日 bd の 0〜47 時の 'HH:MM' → ISO（JST） */
const at = (bd: string, hm: string) => { const [h, m] = hm.split(":").map(Number); return new Date(Date.parse(`${bd}T00:00:00+09:00`) + (h * 60 + m) * 60_000).toISOString(); };
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const D = "2026-11-20", TODAY = "2026-11-26";

// ── (1) 1 日の休憩 ──
const v1 = breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "23:00"), endedAt: at(D, "23:15") }, { startedAt: at(D, "21:00"), endedAt: at(D, "21:30") }], outHm: "25:00", todayBiz: TODAY, counted: true });
ok("(1-1) 時刻は開始の順・分は 1 回ずつ・合計は和（30＋15＝45）・閉じている", !!v1 && J(v1.spans) === J([{ startHm: "21:00", endHm: "21:30", min: 30 }, { startHm: "23:00", endHm: "23:15", min: 15 }]) && v1.totalMin === 45 && v1.open === "none", v1);
const v1b = breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "24:50"), endedAt: at(D, "25:20") }], outHm: "26:00", todayBiz: TODAY, counted: true });
ok("(1-2) 締めをまたぐ休憩は翌の書き方（翌00:50〜翌01:20（30 分））", !!v1b && breakSpanTextOf(v1b.spans[0]) === "翌00:50〜翌01:20（30 分）" && breakHmJa("25:20") === "翌01:20" && breakHmJa("21:00") === "21:00", v1b && breakSpanTextOf(v1b.spans[0]));
const w = dayWindowOf(hm("20:07"), hm("25:52"), { rounding: { unit: 15, mode: "staff_favor" }, breaks: [{ startMin: hm("22:05"), endMin: hm("22:40") }] });
const v1c = breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "22:05"), endedAt: at(D, "22:40") }], outHm: "25:52", todayBiz: TODAY, counted: true, appliedMin: w?.breakMin ?? null });
ok("(1-3) 合計の分は給与と同じ数（丸めた休憩＝22:15〜22:30 の 15 分・生の 35 分ではない）・時刻は生のまま", !!w && w.breakMin === 15 && !!v1c && v1c.totalMin === 15 && v1c.spans[0].min === 35 && breakSpanTextOf(v1c.spans[0]) === "22:05〜22:40（35 分）", [w, v1c]);
const v1d = breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "22:05"), endedAt: at(D, "22:40") }], outHm: "25:52", todayBiz: TODAY, counted: false, appliedMin: 15 });
ok("(1-4) 時間から引かない店（確定シフトどおり・打刻しない）は生の和・counted=false（画面に注を出す）", !!v1d && v1d.totalMin === 35 && v1d.counted === false && BREAK_NOT_COUNTED_NOTE.includes("引いていません"), v1d);
ok("(1-5) 行が無い日は null（休憩の無い日は何も出さない）", breakDayViewOf({ bizDate: D, breaks: [], outHm: "25:00", todayBiz: TODAY, counted: true }) === null);
ok("(1-6) 見出し：1 回は「休憩 30 分」・2 回は「休憩 45 分（2 回）」", breakDaySummaryOf(breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "21:00"), endedAt: at(D, "21:30") }], outHm: "25:00", todayBiz: TODAY, counted: true })!) === "休憩 30 分" && breakDaySummaryOf(v1!) === "休憩 45 分（2 回）");

// ── (2) 閉じていない休憩 ──
const v2a = breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "23:00"), endedAt: null }], outHm: "25:00", todayBiz: TODAY, counted: true, appliedMin: dayWindowOf(hm("20:00"), hm("25:00"), { rounding: null, breaks: [{ startMin: hm("23:00"), endMin: null }] })?.breakMin ?? null });
ok("(2-1) 終えずに退勤＝退勤の時刻で終了扱い（23:00〜退勤 25:00＝120 分・日の窓 openBreak と同じ数）・文言", !!v2a && v2a.open === "closed_at_out" && v2a.totalMin === 120 && v2a.spans[0].min === 120 && breakDaySummaryOf(v2a) === "休憩 120 分・休憩を終えずに退勤（退勤の時刻で終了扱い）" && BREAK_OPEN_JA.closed_at_out === "休憩を終えずに退勤（退勤の時刻で終了扱い）", v2a && breakDaySummaryOf(v2a));
ok("(2-2) 時刻の 1 行は「23:00〜（終了なし）」", !!v2a && breakSpanTextOf(v2a.spans[0]) === "23:00〜（終了なし）");
const v2b = breakDayViewOf({ bizDate: TODAY, breaks: [{ startedAt: at(TODAY, "21:00"), endedAt: at(TODAY, "21:20") }, { startedAt: at(TODAY, "23:00"), endedAt: null }], outHm: null, todayBiz: TODAY, counted: true });
ok("(2-3) 今日・退勤なし＝休憩中（開始の時刻を添える・済んだ分は合計に）", !!v2b && v2b.open === "on_break" && v2b.totalMin === 20 && breakDaySummaryOf(v2b) === "休憩中（23:00〜）・休憩 20 分", v2b && breakDaySummaryOf(v2b));
const v2c = breakDayViewOf({ bizDate: D, breaks: [{ startedAt: at(D, "23:00"), endedAt: null }], outHm: null, todayBiz: TODAY, counted: true });
ok("(2-4) 過去の日・退勤なし＝終了も退勤も記録なし（店の直しで終了を入れる＝break_set は終了が必須）", !!v2c && v2c.open === "no_out" && v2c.totalMin === 0 && breakDaySummaryOf(v2c).includes(BREAK_OPEN_JA.no_out) && breakEditErrOf([{ start: "23:00", end: "" }], "閉じ忘れ") !== null, v2c);
const sql = fs.readFileSync("supabase/migrations/0214_punch_breaks.sql", "utf8");
ok("(2-5) 0214 の答えの根拠：休憩中の退勤は断る（punch_seq_check の 'on break'）・閉じ忘れは休憩開始〜退勤を休憩（計算の側）・直しは終了が必須",
  sql.includes("raise exception 'on break'") && sql.includes("閉じ忘れ（休憩終了の無いまま退勤が入った日）は休憩開始から退勤までを休憩にして要対応に 1 行") && sql.includes("if v_r.s is null or v_r.e is null or v_r.e <= v_r.s then raise exception 'bad row'"));

// ── (3) 人ごと・月・直し・断り・シフトの画面 ──
const C = "cast-a", C2 = "cast-b";
const raw: BreakRaw[] = [
  { castId: C, membershipId: null, bizDate: "2026-11-21", startedAt: at("2026-11-21", "22:00"), endedAt: at("2026-11-21", "22:30") },
  { castId: C, membershipId: null, bizDate: D, startedAt: at(D, "23:00"), endedAt: null },
  { castId: C2, membershipId: null, bizDate: D, startedAt: at(D, "21:00"), endedAt: at(D, "21:10") },
  { castId: null, membershipId: "mem-1", bizDate: D, startedAt: at(D, "21:00"), endedAt: at(D, "21:10") },
];
const views = breakDayViewsOf(raw, C, (bd) => ({ outHm: bd === D ? "25:00" : "26:00", appliedMin: null }), TODAY, true);
ok("(3-1) 人ごと＝その人の行だけ・日付の昇順・日ごとの退勤で閉じ忘れを判定", views.length === 2 && views[0].bizDate === D && views[0].open === "closed_at_out" && views[1].bizDate === "2026-11-21" && views[1].totalMin === 30, views);
const tot = breakMonthTotalOf(views);
ok("(3-2) 月の合計＝日の合計の和（120＋30）・日数 2・終了なし 1 日・見出し", tot.min === 150 && tot.days === 2 && tot.openN === 1 && breakMonthLabelOf(tot) === "休憩 計 150 分（2 日）・終了なし 1 日" && breakMonthLabelOf(breakMonthTotalOf([])) === null, tot);
ok("(3-3) 直しの初期値＝生の時刻（終了なしは null）＝時間から引かない店でも今の休憩を消さない", J(breakEditSpansOf(views[0])) === J([["23:00", null]]) && breakEditSpansOf(null) === undefined);
ok("(3-4) 直しの行は営業日の 0〜47 時から ISO（同じ日の 23:00〜25:00）", J(breakSetRowsOf(D, [{ start: "23:00", end: "25:00" }])) === J([{ started_at: at(D, "23:00"), ended_at: at(D, "25:00") }]));
const errs: [string, string][] = [["reason required", "直す理由を入れてください"], ["overlap", "休憩の時間が重なっています"], ["outside work", "休憩は出勤から退勤のあいだに入れてください"], ["not on duty", "この日は出勤の打刻が無いため休憩を入れられません"], ["bad rows", "休憩は 10 回までです"], ["bad row", "休憩の時刻を確かめてください（終わりは始まりより後・終了は必須）"], ["confirmed", "確定済みの月のため直せません"], ["forbidden", "権限がありません（オーナーか自店の店長だけ直せます）"]];
ok("(3-5) break_set の断り＝休憩の言葉（共通の写像の「他の期間と重なっています」「確定済みの取消には理由が必要です」にしない）・知らない語は null（共通へ）", errs.every(([e, ja]) => breakSetErrJa(e) === ja) && breakSetErrJa("something else") === null && breakSetErrJa(null) === null, errs.map(([e]) => breakSetErrJa(e)));
ok("(3-6) 0214 の break_set が raise する語は全部写る", ["forbidden", "billing locked", "bad row", "reason required", "bad rows", "confirmed", "not on duty", "outside work", "overlap"].every((e) => sql.includes(`raise exception '${e}'`) && breakSetErrJa(e) !== null));
const ob = onBreakCastIdsOf([{ cast_id: "a", ended_at: null }, { cast_id: "b", ended_at: "2026-11-26T14:00:00Z" }, { cast_id: null, ended_at: null }, { cast_id: "c", ended_at: null }], new Set(["c"]));
ok("(3-7) シフトの画面の「休憩中」＝閉じていない行の cast（閉じた行・スタッフ・退勤のある人は出さない）", J([...ob]) === J(["a"]) && ON_BREAK_BADGE === "休憩中");
const adjRow = attendanceDayRowsOf({ punches: [{ id: "p1", punched_at: at(D, "20:00"), type: "in" }, { id: "p2", punched_at: at(D, "25:00"), type: "out" }], shifts: [{ id: "s1", date: D, start_hm: "20:00", end_hm: "25:00" }], attendance: [], cutoffHm: "06:00", closeHm: "26:00", todayBiz: TODAY, dayAdj: () => ({ rounding: null, breaks: [{ startMin: minOfBizDay(at(D, "22:00"), D), endMin: minOfBizDay(at(D, "22:30"), D) }, { startMin: hm("24:00"), endMin: null }] }) })[0];
const va = breakDayViewOfAdj(adjRow);
ok("(3-8) 勤怠の表の行（adj.breaks）からも同じ見え方（/mine の今月の勤怠の表）＝合計は adj.breakMin（30＋60）・閉じ忘れ", !!va && va.totalMin === 90 && adjRow.adj?.breakMin === 90 && va.open === "closed_at_out" && J(va.spans.map(breakSpanTextOf)) === J(["22:00〜22:30（30 分）", "翌00:00〜（終了なし）"]), [va, adjRow.adj]);
ok("(3-9) 休憩の無い行は null（今と同じ＝何も出さない）", breakDayViewOfAdj({ bizDate: D, outHm: "25:00" }) === null && breakDayViewOfAdj({ bizDate: D, outHm: "25:00", adj: { breakMin: 0, openBreak: false } }) === null);

// ── (4) 明細 ──
const pay = { wage: 3000, wHours: 4.5, timePay: 13500, gross: 13500 } as unknown as BreakdownPayLike;
const base = breakdownLinesOf({ frozen: true, pay, extras: [] });
const withNote = breakdownLinesOf({ frozen: true, pay, extras: [punchBreakNoteExtraOf({ min: 30, days: 1 })] });
const iTime = withNote.earn.findIndex((l) => l.key === "timePay"), iNote = withNote.earn.findIndex((l) => l.key === "break-note");
ok("(4-1) 休憩を引いた人だけ、時間の行のすぐ下に「勤務 4.5 時間（休憩 30 分を除く）」（金額なし・情報の行）", iTime >= 0 && iNote === iTime + 1 && withNote.earn[iNote].label === workHoursBreakLineOf(4.5, 30) && withNote.earn[iNote].label === "　勤務 4.5 時間（休憩 30 分を除く）" && withNote.earn[iNote].info === true && withNote.earn[iNote].amount === 0, withNote.earn);
ok("(4-2) 合計・差引は変わらない（0 円の注記）・注記の extras は別の行に重ねて出さない", withNote.earnTotal === base.earnTotal && withNote.net === base.net && withNote.earn.length === base.earn.length + 1 && !withNote.earn.some((l) => l.key.startsWith("extra-")), [base.earnTotal, withNote.earnTotal]);
const ex = punchBreakNoteExtraOf({ min: 45, days: 2 });
ok("(4-3) 注記の extras＝kind punch_break_note・0 円・分を持つ（凍結 breakdown_json に残る）", ex.kind === PUNCH_BREAK_NOTE_KIND && ex.amount === 0 && ex.minutes === 45 && ex.label === "勤務時間は休憩 45 分を除いています（2 日）");
ok("(4-4) 休憩の無い明細は 1 行も増えない（今と同じ）", J(breakdownLinesOf({ frozen: true, pay, extras: [] })) === J(base));

// ── (5) 配線 ──
const src = (p: string) => fs.readFileSync(p, "utf8");
const ks = src("lib/nox/payroll/kintai-sheet.ts"), load = src("lib/nox/punch/break-view-load.ts"), kr = src("components/nox/kintai-row.tsx"), ab = src("app/(manage)/payroll/attendance-board.tsx"), be = src("components/nox/break-edit.tsx");
const mine = src("app/mine/page.tsx"), sb = src("app/(manage)/shift/shift-board.tsx"), col = src("lib/nox/payroll/collect.ts"), core = src("lib/nox/payroll/core.ts"), bl = src("lib/nox/payroll/breakdown-lines.ts"), ps = src("components/payslip-slip.tsx");
ok("(5-1) 読むだけ：休憩の行の読み込みは select だけ・旗 false は読まない・キャストの行だけ", load.includes('if (!mig0214On()) return [];') && load.includes('.from("punch_breaks").select("cast_id, membership_id, biz_date, started_at, ended_at")') && !/\.(insert|update|upsert|delete|rpc)\(/.test(load) && load.includes('.not("cast_id", "is", null)'));
ok("(5-2) 勤怠の表の組み立て：旗の後ろで休憩を読み、人ごとに breakDays（合計は adj.breakMin＝給与と同じ数）・休憩の無い人はキーなし",
  ks.includes("const breakRaw = mig0214On() ? await loadCastBreakRaw(admin, storeId, win.periodStart, win.periodEnd, opts.castId ?? null) : [];") && ks.includes("appliedMin: r?.adj ? r.adj.breakMin : null") && ks.includes("...(breakDays.length ? { breakDays } : {})")
  && ks.includes("dayAdjOfSource(mig0213On() || mig0214On() ? await loadDayAdjSource(admin, storeId, win.periodStart, win.periodEnd) : EMPTY_DAY_ADJ"));
ok("(5-3) 勤怠の表の 1 行：休憩の合計（開くと時刻）・閉じていない休憩の扱いの色・店長は「休憩を直す」（日の編集を開く）・390px は開いた行に",
  kr.includes("const bv = breakDay ?? breakDayViewOfAdj(r);") && kr.includes("data-kintai-break={bv.totalMin} data-kintai-break-open={bv.open}") && kr.includes("<summary style={{ cursor: \"pointer\" }}>{breakDaySummaryOf(bv)}</summary>")
  && kr.includes("data-kintai-break-edit={r.bizDate}>休憩を直す</button>") && kr.includes("data-kintai-more-break={bv.totalMin}") && kr.includes("data-kintai-break-not-counted"));
ok("(5-4) 店長の勤怠：行に breakDay・人ごとの合計（1 人の表の見出し 2 か所・合計表の開いた行）・直しの初期値は生の時刻・休憩の直しは今の柵のまま（旗・編集・出勤のある日）",
  ab.includes("breakDay={sel.breakDays?.find((b) => b.bizDate === r.bizDate) ?? null} />") && (ab.match(/data-kintai-sel-break="1"/g) ?? []).length === 2 && ab.includes("data-kintai-sum-break={c.castId}")
  && ab.includes('extra={mig0214On() && edit.mode === "edit" && edit.row.inHm ? <BreakEdit') && ab.includes("spans={editBreakSpans ?? edit.row.adj?.breaks}")
  && ab.includes('onEdit={canEdit && rowEditableOf(r, finalized) ? (row) => setEdit({ mode: "edit", row }) : null}'));
ok("(5-5) 休憩の直し＝break_set（理由は必須・監査は RPC）・断りは休憩の言葉を先に・全部消すときだけ確かめる",
  be.includes('rpc("break_set", { p_cast_id: castId, p_membership_id: null, p_biz_date: bizDate, p_rows: breakSetRowsOf(bizDate, rows), p_reason: reason.trim() })') && be.includes("setMsg(breakSetErrJa(error.message) ?? rpcErrJa(error.message))") && be.includes("を全部消しますか"));
ok("(5-6) /mine の今月の勤怠一覧：日ごとの休憩（押すと時刻）と月の合計・旗 false は空・読めない時は自分の行（RLS）・今月の勤怠の表は今の呼び出しのまま",
  mine.includes("const mineBreakDays: BreakDayView[] = !mig0214On() || !meCast || !myStore ? [] : kintaiBuilt ? (kintaiBuilt.casts[0]?.breakDays ?? [])") && mine.includes("loadCastBreakRaw(supabase, myStore.id as string") && mine.includes("data-mine-break={bv.totalMin} data-mine-break-open={bv.open}")
  && mine.includes('data-mine-break-total="1"') && mine.includes("<KintaiRow key={r.bizDate} r={r} withBy={false} link={false} />") && mine.includes("hoursLabelOf(r.hours)"));
ok("(5-7) シフトの今日タブ：「休憩中」＝その営業日の閉じていない休憩（読むだけ・旗の後ろ・退勤のある人は出さない）",
  sb.includes("if (mig0214On()) {") && sb.includes('.from("punch_breaks").select("cast_id, ended_at").eq("store_id", storeId).eq("biz_date", todayDate).is("ended_at", null)') && sb.includes("onBreakIds.has(s.cast_id) && !io?.outHm && <span className=\"nox-stpill warn\" data-on-break={s.cast_id}>{ON_BREAK_BADGE}</span>"));
ok("(5-8) 明細：collect は日の窓の breakMin を足すだけ（時間の計算は変えない）→ core が 0 円の注記 → 明細と給与の右パネルが同じ関数で時間の行の下に",
  col.includes("if (w && w.workMin > 0) noteBreak(w); // ★起票170") && col.includes("noteRound(adj); noteBreak(w); /* ★起票170 */") && col.includes("...(p && p.breakNote ? { punchBreakNote: p.breakNote } : {})")
  && core.includes("...(c.punchBreakNote ? [punchBreakNoteExtraOf(c.punchBreakNote)] : [])") && bl.includes("e.kind === PUNCH_BREAK_NOTE_KIND") && ps.includes("breakdownLinesOf({ frozen: true,"));
ok("(5-9) 時間の計算の式は今のまま（hoursByDate は日の窓の workMin・休憩の注記は 0 円）", col.includes("hoursByDate.set(d.bizDate, w ? w.workMin / 60 : 0);") && col.includes("if (w && w.workMin > 0) { noShiftHours.set(d, w.workMin / 60);") && ex.amount === 0);

if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-break-view NG ${fails.length}／${n}`); process.exit(1); }
console.log(`verify:nox-break-view OK ${n}`);
