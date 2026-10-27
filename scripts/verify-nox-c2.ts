/*
 * verify:nox-c2 — 便 SH-UI-c2（2026-10-23）: 勤怠一覧の編集と日別の算定給与ほか（純関数＋逐語 grep・env 不要・DB 段なし）。
 *   npm run verify:nox-c2
 *  (1) C2-3 日別の算定給与＝時給分（wdays の hourly×hours）・バック（per_count／rate）・罰金（target_shift_id／biz_date）・日計＝時給分＋バック−罰金・
 *      月のまとめ＝Σ日計＋月で決まる支給−控除＝差引支給額（玲奈 golden 5170／5931・源泉 117241／125802 の payOf 結果で検算）
 *  (2) C2-2 行の編集＝時刻修正→実働 h と日計が同じ関数で変わる・日を追加→行が増え日数 +1・取消→日計から消え行は取消済み・punch id／shift id・編集の送信内容・翌表記の入力
 *  (8) C2-13 HOME 要承認 (9) C2-14 payload (10) C2-15 税・サ料の保存 (11) C2-16 丸め（★29）(12)(13)(14) C2-17／18／19 シフト (15) C2-20 予約タブ (16) C2-21 ロゴ
 *  (4) C2-8 棚卸し（分類の群・既定値＝現在庫・±1・差分ありだけ送る）(5) C2-9 スライド行（段なし「—」／段あり上乗せ／保証中／確定済み／2 行）(6) C2-10 売上バック（率）＝sys_backs (7) C2-12 請求（税・サ込）
 *  (3) C2-1／C2-4／C2-6／C2-7 配線＝日付リンク（→今日タブ）なし・「この月のシフトを開く」1 本・確定済みは編集ボタンなし・390px の列・合計表の 4 列・狭い幅はシート・/mine は読取専用
 */
import fs from "node:fs";
import { payOf, type PayInput } from "../lib/nox/pay";
import { attendanceDayRowsOf, attendanceSummaryOf, attendanceCsvOf, hm47OfInput, isoOfBizHm, kintaiEditPlanOf, rowEditableOf, sheetRowCellsOf, SHEET_COLUMNS } from "../lib/nox/payroll/attendance-sheet";
import { dailyBacksOf, dailyFinesOf, dailyPayRowsOf, dailyWageOf, monthSummaryOf, castPayTotalsOf, sumCastPayTotalsOf, payTotalsNoteOf, yenCellOf, backsDetailTextOf, DAILY_PAY_COLUMNS } from "../lib/nox/payroll/daily-pay";
import { addShiftSpanOf, kintaiErrJa } from "../components/nox/kintai-edit";
import { actualValueOf, deltaOf, stepActualOf, stocktakeGroupsOf, stocktakePlanOf, stocktakeRowsOf } from "../lib/nox/stock/stocktake"; // ★C2-8
import { breakdownLinesOf, slideLinesOf, systemOfLineKey } from "../lib/nox/payroll/breakdown-lines"; // ★C2-9／C2-10
import { periodLabelOf } from "../lib/nox/payroll/slide";
import { approvalLineOf, bellLabelOf, missingOutOf, pendingTotalOf, rejectReasonOkOf, wishGroupsOf } from "../lib/nox/home/pending"; // ★C2-13
import { dueBreakdownOf, groupDueFull } from "../lib/nox/check-calc"; // ★C2-15／C2-16
import { dueSettingsOf, roundingRowShownOf } from "../lib/nox/rules-0175/rounding"; // ★C2-16
import { cellTextOf, fillOf, LEGEND_FILL, LEGEND_STAGE, noPlacingTextOf, periodMonthLabelOf, queueHeadTextOf, queueTotalTextOf, shortDaysInPeriodsOf } from "../lib/nox/shift/cal-cell"; // ★C2-17〜19
import { businessHoursStatus } from "../lib/nox/business-hours"; // ★C2-20
import { castBadgesOf } from "../lib/nox/register/reservation-badges"; // ★C2-20

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// ── (1) C2-3 日別の算定給与＝玲奈 golden（verify:nox-pay と同じ入力） ──
const P_HI = { base: 2000, honBack: 1500, jonaiBack: 500, dohanBack: 1000, salesSlide: [{ at: 80_000, wage: 4000 }, { at: 150_000, wage: 5500 }, { at: 250_000, wage: 7000 }], pointSlide: [] };
const REINA = { hon: 48, jonai: 30, dohan: 12, days: 22, sales: 1_850_000 };
const mockDaily = (c: typeof REINA, h: number) => Array.from({ length: c.days }, (_, i) => ({ d: i + 1, hours: h + (i % 3 === 0 ? 0.5 : 0) - (i % 7 === 6 ? 0.4 : 0), sales: Math.round(c.sales / c.days) }));
const REINA_INPUT: PayInput = {
  periodDays: 31, extrasTotal: 0, cast: REINA, daily: mockDaily(REINA, 5), plan: P_HI as unknown as PayInput["plan"],
  productBack: { drink: 122_500, champ: 68_000, bottle: 0 }, pointProducts: 110,
  customBackDefs: [{ id: "cb_kaikin", name: "皆勤手当", basis: "days", value: 300 }], metrics: { champCnt: 9, bottleCnt: 0 },
  deductions: [{ id: "send", name: "送り代", amount: 2000, per: "day" }], penalty: { fineAbsent: 10_000, fineLate: 3000, hoursPerShift: 5 },
  normConfig: { on: true, daysFlat: 5000, daysPer: 2000, dohanFlat: 3000, dohanPer: 1500 }, norm: { days: 24, dohan: 15 }, fine: { absentN: 0, lateN: 0 },
  arDeduct: 0, advanceDeduct: 0, okuriDeduct: 3500, taxMode: "委託",
} as unknown as PayInput;
const r = payOf(REINA_INPUT);
const period = "2026-10";
const wage = dailyWageOf(r.wdays, period);
// 日別のバック＝本数を日に割る（per_count＝Σ日＝月と同値）・商品バックは 2 日に置く
const backRows = [
  { bizDate: "2026-10-01", hon: 20, jonai: 10, dohan: 5, honAmt: 0, jonaiAmt: 0, drink: 100_000, champ: 50_000, bottle: 0, calc: 0 },
  { bizDate: "2026-10-02", hon: 28, jonai: 20, dohan: 7, honAmt: 0, jonaiAmt: 0, drink: 22_500, champ: 18_000, bottle: 0, calc: 0 },
];
const backs = dailyBacksOf(P_HI, backRows);
const fines = dailyFinesOf([
  { amount: 2000, reason: "遅刻", source: "sanction", biz_date: null, target_shift_id: "sh-03" },
  { amount: 1000, reason: "ノルマ未達", source: "shortfall", biz_date: "2026-10-05", target_shift_id: null },
  { amount: 5000, reason: "月の調整（日に紐づかない）", source: "sanction", biz_date: null, target_shift_id: null },
], new Map([["sh-03", "2026-10-03"]]));
const rows = dailyPayRowsOf({ dates: r.wdays.map((w) => `${period}-${String(w.d).padStart(2, "0")}`), wage, backs, fines });
const d1 = rows.find((x) => x.bizDate === "2026-10-01")!, d3 = rows.find((x) => x.bizDate === "2026-10-03")!, d5 = rows.find((x) => x.bizDate === "2026-10-05")!;
check("c2(1-1) 時給分＝その日の hourly×hours（wdays と同じ日・同じ時給）・Σ時給分と timePay の差は丸めの端数だけ（|差|≤ 日数）", rows.filter((x) => x.hours > 0).length === r.wdays.filter((w) => w.hours > 0).length && d1.hourly === r.wdays[0].hourly && d1.wage === Math.round(r.wdays[0].hourly * r.wdays[0].hours) && Math.abs(rows.reduce((a, x) => a + x.wage, 0) - r.timePay) <= r.wdays.length, J({ d1, timePay: r.timePay, sum: rows.reduce((a, x) => a + x.wage, 0) }));
check("c2(1-2) バック＝本指名 20×1,500＋場内 10×500＋同伴 5×1,000＋ドリンク 100,000＋シャンパン 50,000＝185,000（10/1）・Σバック＝月の honBack＋jonaiBack＋dohanBack＋drink＋champ（per_count は日に割っても同値）・内訳の文言",
  d1.backs.total === 20 * 1500 + 10 * 500 + 5 * 1000 + 100_000 + 50_000 && rows.reduce((a, x) => a + x.backs.total, 0) === r.honBack + r.jonaiBack + r.dohanBack + r.drinkBack + r.champBack + r.bottleBack && backsDetailTextOf(d1.backs) === "本指名 ¥30,000・場内 ¥5,000・同伴 ¥5,000・ドリンク ¥100,000・シャンパン ¥50,000", J({ total: d1.backs.total, sum: rows.reduce((a, x) => a + x.backs.total, 0), text: backsDetailTextOf(d1.backs) }));
check("c2(1-3) 罰金・減額＝target_shift_id→その日（10/3 ¥2,000 遅刻）・biz_date→その日（10/5 ¥1,000）・日に紐づかない行は日別に出ない（月のまとめ）・日計＝時給分＋バック−罰金", d3.fine === 2000 && d3.fineNotes[0] === "遅刻（¥2,000）" && d5.fine === 1000 && rows.reduce((a, x) => a + x.fine, 0) === 3000 && d3.total === d3.wage + d3.backs.total - 2000, J({ d3, d5 }));
const month = monthSummaryOf({ gross: r.gross, net: r.net, rows });
check("c2(1-4) 月のまとめ＝Σ日計＋月で決まる支給−控除＝差引支給額（玲奈 golden net ＝ payOf と同じ・恒等 identityOk）・差引の行は「差引支給額（現時点）」・確定済みは「（確定）」",
  month.identityOk && month.sumDaily + month.rows[0].amount - month.rows[1].amount === r.net && month.rows[2].amount === r.net && month.rows[2].label === "差引支給額（現時点）" && monthSummaryOf({ gross: r.gross, net: r.net, rows, frozen: true }).rows[2].label === "差引支給額（確定）", J({ sumDaily: month.sumDaily, rows: month.rows, net: r.net }));
check("c2(1-5) 玲奈 golden＝payOf の net は verify:nox-pay と同じ値（源泉 125802 の経路）・gross は Σ(時給分＋バック)＋月で決まる支給", r.net > 0 && r.gross === rows.reduce((a, x) => a + x.wage + x.backs.total, 0) + month.rows[0].amount, J({ net: r.net, gross: r.gross }));
const totals = castPayTotalsOf(rows, r.net, false);
check("c2(1-6) C2-6 合計表の 4 列＝時給分｜バック｜罰金・減額｜現時点の差引支給（＝net）・合計行は人ごとの和・注記「現時点（10/23 まで）」／「確定」・表示 ¥ と —", totals.wage === rows.reduce((a, x) => a + x.wage, 0) && totals.fine === 3000 && totals.net === r.net && sumCastPayTotalsOf([totals, totals, null]).net === r.net * 2 && !sumCastPayTotalsOf([totals, { ...totals, frozen: true }]).frozen && payTotalsNoteOf(false, "2026-10-23") === "現時点（10/23 まで）" && payTotalsNoteOf(true, "2026-10-23") === "確定" && yenCellOf(0) === "—" && yenCellOf(2000, { neg: true }) === "−¥2,000" && yenCellOf(12_300) === "¥12,300", J(totals));

// ── (2) C2-2 編集＝同じ関数で行が変わる ──
const P = (d: string, hm: string, id: string) => ({ id, punched_at: d + "T" + hm + ":00+09:00", type: "in" as const });
const O = (d: string, hm: string, id: string) => ({ id, punched_at: d + "T" + hm + ":00+09:00", type: "out" as const });
const shifts = ["2026-10-01", "2026-10-02", "2026-10-03"].map((date, i) => ({ id: `sh-${i + 1}`, date, start_hm: "20:00", end_hm: "25:00" }));
const base = { shifts, attendance: [], cutoffHm: "06:00", closeHm: "25:00", grace: { lateGrace: 10, earlyGrace: 30, overGrace: 30 }, payTimeBasis: "punch" as const, todayBiz: "2026-10-05", periodStart: "2026-10-01", periodEnd: "2026-10-05" };
const punches0 = [P("2026-10-01", "20:33", "p1"), O("2026-10-02", "01:00", "p2"), P("2026-10-02", "20:00", "p3"), O("2026-10-03", "01:00", "p4")];
const rows0 = attendanceDayRowsOf({ ...base, punches: punches0 });
const r01 = rows0.find((x) => x.bizDate === "2026-10-01")!;
check("c2(2-1) 行の punch id（最初の in・最後の out）と shift id・10/1 は 20:33 で遅刻（猶予 10 分）・実働 4.5h", r01.inPunchId === "p1" && r01.outPunchId === "p2" && r01.shiftId === "sh-1" && r01.late && r01.hours === 4.5 && !r01.cancelled, J({ in: r01.inPunchId, out: r01.outPunchId, shift: r01.shiftId, late: r01.late, hours: r01.hours }));
// 時刻修正＝出を 20:33→20:00（同じ関数で再計算）
const punches1 = [P("2026-10-01", "20:00", "p1"), O("2026-10-02", "01:00", "p2"), P("2026-10-02", "20:00", "p3"), O("2026-10-03", "01:00", "p4")];
const rows1 = attendanceDayRowsOf({ ...base, punches: punches1 });
const r11 = rows1.find((x) => x.bizDate === "2026-10-01")!;
const wageOf = (rs: typeof rows1) => dailyWageOf(rs.filter((x) => !x.future && x.hours > 0).map((x) => ({ d: Number(x.bizDate.slice(8)), hours: x.hours, hourly: 2000 })), period);
check("c2(2-2) ①時刻修正→遅刻の印が消え・実働 4.5→5.0h・日計（時給分）が 9,000→10,000 に同じ関数で変わる・給与の実働（attendanceSummaryOf）も 10.0h", !r11.late && r11.hours === 5 && wageOf(rows0).get("2026-10-01")!.wage === 9000 && wageOf(rows1).get("2026-10-01")!.wage === 10_000 && attendanceSummaryOf(rows1, "2026-10-05").hours === 10, J({ late: r11.late, h: r11.hours, w0: wageOf(rows0).get("2026-10-01"), w1: wageOf(rows1).get("2026-10-01") }));
// 日を追加＝10/4 に確定シフト＋出／退（飛び入り）
const rows2 = attendanceDayRowsOf({ ...base, shifts: [...shifts, { id: "sh-4", date: "2026-10-04", start_hm: "21:00", end_hm: "26:00" }], punches: [...punches1, P("2026-10-04", "21:00", "p5"), O("2026-10-05", "02:00", "p6")] });
check("c2(2-3) ②日を追加→行が増え（10/4）・給与の日数が 2→3（final ok／late）・追加するシフト＝出 21:00〜退 翌02:00（出だけなら +5h・出が 24 時以降は 23:59 に丸める）", rows2.filter((x) => x.inHm).length === 3 && attendanceSummaryOf(rows2, "2026-10-05").days === 3 && attendanceSummaryOf(rows1, "2026-10-05").days === 2 && J(addShiftSpanOf("21:00", "26:00")) === J({ start: "21:00", end: "26:00" }) && J(addShiftSpanOf("21:00", null)) === J({ start: "21:00", end: "26:00" }) && addShiftSpanOf("24:30", null).start === "23:59", J({ n: rows2.filter((x) => x.inHm).length, days: attendanceSummaryOf(rows2, "2026-10-05").days }));
// 取消＝打刻を削除（店の修正に after null）・シフトを外す→行は取消済み・日計から消える
const rows3 = attendanceDayRowsOf({ ...base, shifts: shifts.filter((s) => s.date !== "2026-10-01"), punches: punches1.filter((p) => p.id !== "p1" && p.id !== "p2"), corrections: [
  { punch_id: null, biz_date: "2026-10-01", kind: "in", before_at: "2026-10-01T20:00:00+09:00", after_at: null, reason: "取消: 本人の申し出", decision: "approved", decided_by_name: "デモ 店長", decided_at: "2026-10-05T12:00:00+09:00" },
  { punch_id: null, biz_date: "2026-10-01", kind: "out", before_at: "2026-10-02T01:00:00+09:00", after_at: null, reason: "取消: 本人の申し出", decision: "approved", decided_by_name: "デモ 店長", decided_at: "2026-10-05T12:00:00+09:00" },
] });
const r31 = rows3.find((x) => x.bizDate === "2026-10-01")!;
check("c2(2-4) ③取消→行は「取消済み」で残り（店の修正 2 件・打刻なし・シフトなし）・日計から消える（時給分 0）・日数 1・編集不可・CSV の備考は「取消済み」", r31.cancelled && r31.corrections.length === 2 && !r31.inHm && !r31.shift && !wageOf(rows3).has("2026-10-01") && attendanceSummaryOf(rows3, "2026-10-05").days === 1 && !rowEditableOf(r31, false) && sheetRowCellsOf(r31)[9].startsWith("取消済み"), J({ cancelled: r31.cancelled, days: attendanceSummaryOf(rows3, "2026-10-05").days }));
check("c2(2-5) ⑤確定済みの月は編集不可（rowEditableOf false）・未来日も不可・通常の行は可", !rowEditableOf(r11, true) && !rowEditableOf({ ...r11, future: true }, false) && rowEditableOf(r11, false));
const plan = kintaiEditPlanOf(r01, { inHm: "20:00", outHm: "25:00", status: "shukkin", reason: "修正" }, { status: "late", reason: null });
check("c2(2-6) 編集の送信内容＝変わった項目だけ（出 p1→20:00・退は 25:00 で同じ→送らない・区分 late→shukkin）・ISO は JST（翌01:30＝翌日 01:30+09:00）・入力「翌01:30」「25:30」「20:00」・不正は undefined",
  plan.corrections.length === 1 && plan.corrections[0].kind === "in" && plan.corrections[0].punchId === "p1" && plan.corrections[0].afterIso === new Date("2026-10-01T20:00:00+09:00").toISOString() && plan.attendance?.status === "shukkin"
  && isoOfBizHm("2026-10-01", "25:30") === new Date("2026-10-02T01:30:00+09:00").toISOString() && isoOfBizHm("2026-10-01", "48:00") === null && hm47OfInput("翌01:30") === "25:30" && hm47OfInput("25:30") === "25:30" && hm47OfInput("20:00") === "20:00" && hm47OfInput("") === null && hm47OfInput("abc") === undefined && hm47OfInput("48:00") === undefined, J(plan));
const planDel = kintaiEditPlanOf(r01, { inHm: "20:33", outHm: null, status: null, reason: null }, { status: "late", reason: null });
check("c2(2-7) 退を空にする＝削除（p2・after null）・punch が無い側を空のままは送らない・RPC の例外の日本語（out of biz window／forbidden）", planDel.corrections.length === 1 && planDel.corrections[0].kind === "out" && planDel.corrections[0].punchId === "p2" && planDel.corrections[0].afterIso === null && kintaiEditPlanOf({ ...r01, outHm: null, outPunchId: null }, { inHm: "20:33", outHm: null, status: null, reason: null }, { status: "late", reason: null }).corrections.length === 0 && kintaiErrJa("out of biz window").includes("営業日") && kintaiErrJa("forbidden").includes("店長"));
const csv = attendanceCsvOf({ storeName: "CLUB ACE", period, castName: "ひなの", exportedAt: "2026/10/23 18:00" }, rows1.filter((x) => !x.future).map((x) => ({ ...x, pay: rows.find((p) => p.bizDate === x.bizDate) })), { withPay: true });
check("c2(2-8) CSV・印刷用にも同じ列＝従来の 10 列＋時給分｜バック｜罰金・減額｜日計（withPay）・従来呼び出し（withPay なし）は 10 列のまま", csv.split("\r\n")[1] === [...SHEET_COLUMNS, ...DAILY_PAY_COLUMNS].join(",") && csv.split("\r\n")[2].split(",").length === 14 && attendanceCsvOf({ storeName: "A", period, castName: "B", exportedAt: "x" }, rows1).split("\r\n")[1] === SHEET_COLUMNS.join(","), csv.split("\r\n").slice(0, 3).join(" | "));

// ── (3) 配線（逐語） ──
{
  const row = src("components/nox/kintai-row.tsx"), ab = src("app/(manage)/payroll/attendance-board.tsx"), ed = src("components/nox/kintai-edit.tsx"), mine = src("app/mine/page.tsx"), css = src("app/globals.css"), bs = src("components/ui/bottom-sheet.tsx"), ks = src("lib/nox/payroll/kintai-sheet.ts"), api = src("app/api/attendance/sheet/route.ts");
  check("c2(3-1) C2-1 日付の遷移（→今日タブ）を撤去＝kintai-row に /shift?store= のリンクなし・日付は編集ボタン（data-kintai-edit）・シフトへの導線は表の右上「この月のシフトを開く」1 本（data-kintai-shift-link）", !row.includes("/shift?store=") && row.includes('data-kintai-edit="1"') && ab.includes('data-kintai-shift-link={publishedMonth ? "fixed" : "make"}') /* ★便 M-10: 飛び先＝確定シフト（公開前は ③配置）の同月・ボタン風 */ && ab.includes("この月のシフトを開く") && (ab.match(/data-kintai-shift-link=/g) ?? []).length === 1);
  check("c2(3-2) C2-2 編集・追加・取消＝既存 RPC（punch_correction_request／attendance_set／shift_set confirmed／shift_remove）・理由必須・確定済みの月は編集ボタンが出ない（canEdit＝!finalized・rowEditableOf）・/mine は読取専用（onEdit なし・従来の行）",
    ed.includes('"punch_correction_request"') && ed.includes('"attendance_set"') && ed.includes('p_status: "confirmed"') && ed.includes('"shift_remove"') && ed.includes("理由を入れてください") && ab.includes("const canEdit = !finalized;") && ab.includes("onEdit={canEdit && rowEditableOf(r, finalized) ? (row) => setEdit({ mode: \"edit\", row }) : null}") && ab.includes('{canEdit && <button type="button" style={{ ...t.btnGold, ...t.btnSm }} data-kintai-add="1"') && mine.includes("<KintaiRow key={r.bizDate} r={r} withBy={false} link={false} />") && !mine.includes("onEdit="));
  check("c2(3-3) C2-3 日別の列＝KintaiHead withPay（時給分｜バック｜罰金・減額｜日計）・月のまとめの tfoot（data-kintai-month）・builder は computePayrollDraft（給与と同じ）＋確定済みは payslips の凍結値・API は builder 1 本", row.includes('KINTAI_PAY_HEADS = ["時給分", "バック", "罰金・減額", "日計"]') && ab.includes('data-kintai-month="1"') && ks.includes("computePayrollDraft(admin, managerClient, storeId, period, { previewDefaults: true })") && ks.includes('from("payslips")') && api.includes("buildKintaiSheet(g.admin, g.supabase, g.storeId, g.period)") && mine.includes("buildKintaiSheet(createAdminClient(), supabase, myStore.id as string, month, { castId: meCast.id as string })"));
  check("c2(3-4) C2-4 390px＝日付・出／退・日計の 3 列（確定シフト・店の修正・区分・実働・送り・備考と日計以外の金額列が .opt）・編集は Modal（≤900 はシート）", row.includes("const OPT = new Set([1, 4, 5, 6, 7, 8]);") && row.includes('className={i === 3 ? "pay" : "opt pay"}') && ed.includes("<Modal onClose={() => { if (!busy) onClose(); }} maxWidth={460} scroll>") && css.includes(".nox-kintai .nox-kintai-table .opt { display: none; }"));
  check("c2(3-5) C2-6 合計表＝4 列（data-kintai-sum-head wage／backs／fine／net）・合計行（data-kintai-sum-net-total）・390px は キャスト｜日数｜現時点の差引（.nox-kintai-sum .opt を隠す・▸ で残り）・注記", ["wage", "backs", "fine", "net"].every((k) => ab.includes(`data-kintai-sum-head="${k}"`)) && ab.includes("data-kintai-sum-net-total={total.pay.net}") && css.includes(".nox-kintai .nox-kintai-sum .opt { display: none; }") && ab.includes("data-kintai-sum-toggle={c.castId}") && ab.includes("payTotalsNoteOf(finalized, sheet.todayBiz)"));
  check("c2(3-6) C2-7 1,024px 未満は画面下のシート（BottomSheet・高さ 90%・取っ手・閉じる・CSV／印刷用は上端の actions）・以上は従来の下の表（useNarrow(1024)）", ab.includes("const narrow = useNarrow(1024);") && ab.includes("{sheet && sel && narrow && (") && ab.includes('<BottomSheet onClose={() => setCastId(null)} title={detailTitle} actions={detailActions} testId="kintai">') && bs.includes('height: "90%"') && bs.includes('data-sheet-close="1"') && bs.includes("max-width: ${max - 1}px"));
}

// ── (4) C2-8 棚卸しの 390px ──
{
  const cats = [{ id: "c1", name: "ウイスキー", sort_order: 1 }, { id: "c2", name: "焼酎", sort_order: 2 }];
  const prods = [{ id: "p1", name: "山崎", type: "bottle", is_active: true, category_id: "c1", sort_order: 1 }, { id: "p2", name: "響", type: "bottle", is_active: true, category_id: "c1", sort_order: 2 }, { id: "p3", name: "黒霧島", type: "bottle", is_active: true, category_id: "c2", sort_order: 1 }, { id: "p4", name: "無効の品", type: "bottle", is_active: false, category_id: "c2", sort_order: 2 }];
  const stock = { p1: 10, p2: 3, p3: 7, p4: 1 };
  const rows = stocktakeRowsOf(prods, stock, cats);
  const groups = stocktakeGroupsOf(rows);
  check("c2(4-1) C2-8 分類見出しの数＝分類の数（2）・各群の行＝その分類の商品・無効は「無効の商品も表示」で群に入る", groups.length === 2 && groups.map((g) => g.categoryName).join("/") === "ウイスキー/焼酎" && groups[0].rows.length === 2 && groups[1].rows.length === 1 && stocktakeGroupsOf(stocktakeRowsOf(prods, stock, cats, { showInactive: true }))[1].rows.length === 2, J(groups.map((g) => [g.categoryName, g.rows.length])));
  check("c2(4-2) C2-8 実数の既定値＝現在庫（差分 0）・＋で差分 +1・−で −1・0 未満にしない・整数でない入力は差分 null", actualValueOf(undefined, 10) === 10 && deltaOf(undefined, 10) === 0 && stepActualOf(undefined, 10, 1) === "11" && deltaOf("11", 10) === 1 && stepActualOf("1", 5, -1) === "0" && stepActualOf("0", 5, -1) === "0" && deltaOf("3.5", 10) === null && stepActualOf("abc", 7, 1) === "8");
  check("c2(4-3) C2-8 記録で差分ありの行だけ送る＝既定（未入力）と現在庫と同じ入力は送らない", J(stocktakePlanOf(prods, stock, { p1: "10", p2: "5", p3: "" }).map((r) => [r.id, r.delta])) === J([["p2", 2]]));
  const st = src("app/(manage)/master/stock/stock-board.tsx"), css = src("app/globals.css");
  check("c2(4-4) C2-8 配線＝分類はグループ見出し行（商品行に挟まない）・2 行カード（col-name／col-actual／col-delta・現在庫は 1 行目に）・−／＋長押し（400ms 後 120ms）・固定バー「記録する（差分あり N 件）」・「無効の商品も表示（n 件）」・説明は「？」・在庫を持たない注記は見出し下", st.includes('data-stocktake-group-head="1"') && !st.includes("{r.head && <span") && st.includes('className="nox-st-cur num"') && st.includes("setTimeout(() => { timer.current.i = setInterval(onStep, 120); }, 400)") && st.includes("記録する（差分あり ${tPlan.length} 件）") && st.includes("無効の商品も表示（{inactiveCount} 件）") && st.includes('data-stocktake-help="1"') && st.includes("data-stocktake-unmanaged={unmanaged}") && css.includes(".nox-stocktake .nox-st-bar { position: fixed;") && css.includes(".nox-stocktake .nox-sttable td.col-cur { display: none; }"));
}

// ── (5) C2-9 スライド行の表記 ──
{
  const tiers = [{ at: 300_000, wage: 2000 }, { at: 600_000, wage: 2500 }];
  const base = { eplan: { base: 1800, salesSlide: tiers, pointSlide: [] }, wHours: 8 };
  const none = slideLinesOf({ ...base, slideBasis: { apply: "monthly", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 211_604, pts: 0, salesWage: 1800, ptsWage: 0 }] } });
  check("c2(5-1) C2-9 ①段に届いていない＝「スライド 10月（暫定・期首〜今日）」＋「売上 ¥211,604 → 段なし・基本時給 ¥1,800 のまま」・金額欄「—」・情報行", none.length === 1 && none[0].label === `スライド ${periodLabelOf("2026-10")}（暫定・期首〜今日）` && none[0].label2 === "売上 ¥211,604 → 段なし・基本時給 ¥1,800 のまま" && none[0].amountText === "—" && none[0].amount === 0 && none[0].info === true, J(none));
  const hit = slideLinesOf({ ...base, wdays: [{ d: 1, hours: 5, hourly: 2000, basis: "売上" }, { d: 2, hours: 3, hourly: 1800, basis: "保証" }], slideBasis: { apply: "monthly", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 350_000, pts: 0, salesWage: 2000, ptsWage: 0 }] } });
  check("c2(5-2) C2-9 ②届いた＝「→ 段 1（時給 ¥2,000・+¥200/h）」・金額欄＝上乗せの合計（+¥200 × 段の日の実働 5h＝¥1,000）", hit[0]!.label2 === "売上 ¥350,000 → 段 1（時給 ¥2,000・+¥200/h）" && hit[0]!.amount === 1000 && hit[0]!.amountText === undefined, J(hit));
  const gua = slideLinesOf({ ...base, guarantee: { spans: [{ from: "2026-10-01", to: "2026-10-24", base: 3200 }], baseHours: 0, basePay: 0, guaHours: 10, guaPay: 32_000 }, slideBasis: { apply: "monthly", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 350_000, pts: 0, salesWage: 2000, ptsWage: 0 }] } });
  check("c2(5-3) C2-9 ③保証中＝「…→ 段 1（時給 ¥2,000・+¥200/h）・保証 ¥3,200（10/24 まで）が優先」", !!gua[0]!.label2 && gua[0]!.label2!.endsWith("・保証 ¥3,200（10/24 まで）が優先") && gua[0]!.label2!.includes("→ 段 1（時給 ¥2,000・+¥200/h）"), gua[0]!.label2);
  const frozen = slideLinesOf({ ...base, slideBasis: { apply: "monthly", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 211_604, pts: 0, salesWage: 1800, ptsWage: 0 }] } }, { frozen: true });
  const next = slideLinesOf({ ...base, slideBasis: { apply: "next", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 211_604, pts: 0, salesWage: 1800, ptsWage: 0 }] } });
  const half = slideLinesOf({ ...base, slideBasis: { apply: "half", months: [{ month: "2026-10", prevMonth: "2026-10", sales: 100_000, pts: 0, salesWage: 1800, ptsWage: 0 }] } }, { frozen: true });
  check("c2(5-4) C2-9 ④確定済み＝「暫定」を外し判定基準を 1 語（月の累計／前月の累計／半月の累計）", frozen[0].label === `スライド ${periodLabelOf("2026-10")}（月の累計）` && next[0].label === `スライド ${periodLabelOf("2026-10")}（前月の累計）` && half[0].label.endsWith("（半月の累計）") && !frozen[0].label.includes("暫定"), J([frozen[0].label, next[0].label, half[0].label]));
  const bd = breakdownLinesOf({ pay: { wage: 1800, timePay: 14_400, ...base, slideBasis: { apply: "monthly", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 211_604, pts: 0, salesWage: 1800, ptsWage: 0 }] }, gross: 14_400, net: 14_400 }, period: "2026-10" });
  const sl = bd.earn.find((l) => l.key === "slide-2026-10");
  check("c2(5-5) C2-9 breakdownLinesOf（右パネル・/mine・明細 PDF が同じ関数）＝スライド行は情報行（合計に足さない）・label2 と「—」・段なしでも出る（スライド ON）・日次は従来どおり", !!sl && sl.info === true && sl.label2 === "売上 ¥211,604 → 段なし・基本時給 ¥1,800 のまま" && sl.amountText === "—" && bd.earnTotal === 14_400 && slideLinesOf({ ...base, slideBasis: { apply: "daily", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 1, pts: 0, salesWage: 0, ptsWage: 0 }] } }).length === 0, J(sl));
  const pb = src("app/(manage)/payroll/payroll-board.tsx"), ps = src("components/payslip-slip.tsx"), css = src("app/globals.css");
  check("c2(5-6) C2-9 ⑤配線＝右パネルと明細の行が label2（.nox-bd-l2＝≤430px で 2 行目・折り返さない）と amountText を描く・明細は frozen・右パネルは run の確定で frozen", pb.includes('<span className="nox-bd-l2" data-bd-l2="1">{extra.label2}</span>') && pb.includes("{ label2: ln.label2, amountText: ln.amountText }") && pb.includes('frozen: runInfo?.status === "finalized" || runInfo?.status === "paid"') && ps.includes("breakdownLinesOf({ frozen: true,") && ps.includes('data-bd-l2="1"') && css.includes("@media (max-width: 430px) { .nox-bd-l2 { display: block;"));
}

// ── (6) C2-10 裁定412 の残り＝売上歩合を各種バックへ ──
{
  const bl = src("lib/nox/payroll/breakdown-lines.ts"), col = src("lib/nox/payroll/collect.ts");
  const bd = breakdownLinesOf({ pay: { wage: 1800, wHours: 1, timePay: 1800, honBack: 100, salesBack: 6348, gross: 8248, net: 8248 }, systems: { sys_backs: true, sys_sales_rate: false } });
  const bdOff = breakdownLinesOf({ pay: { wage: 1800, wHours: 1, timePay: 1800, salesBack: 0, gross: 1800, net: 1800 }, systems: { sys_backs: false } });
  check("c2(6-1) C2-10 行名「売上バック（率）」＝各種バックの並び（本指名バックの直後群）・出し分けは sys_backs（sys_sales_rate は読まない）・各種バック OFF なら 0 の行は出ない・collect の売上率テーブルの出し分けも sys_backs", systemOfLineKey("salesBack") === "sys_backs" && bd.earn.some((l) => l.key === "salesBack" && l.label === "売上バック（率）") && bd.earn.findIndex((l) => l.key === "salesBack") > bd.earn.findIndex((l) => l.key === "honBack") && !bdOff.earn.some((l) => l.key === "salesBack") && !bl.includes('"sys_sales_rate"') && col.includes('"sys_backs") ? {} : { salesBackTable: [] }'), J(bd.earn.map((l) => [l.key, l.label])));
}

// ── (7) C2-12 会計タブ「①請求を確認」の列見出し ──
{
  const rb = src("app/(manage)/register/register-board.tsx"), kr = src("app/kiosk-register/page.tsx");
  check("c2(7-1) C2-12 見出し＝外税の店「請求（税・サ込）」・内税の店「請求（サ込・内税）」（伝票の凍結値 price_display で判定）・値は明細の「合計（税込）」と同じ due（gi.due）・キオスクも同じ", rb.includes('data-due-head="1">{check?.price_display === "tax_excluded" && (check?.business_tax_status ?? "taxable") === "taxable" ? "請求（税・サ込）" : "請求（サ込・内税）"}') && rb.includes('<div className="nox-sumrow total" data-sum-total="1"><span>合計（税込）</span>') && rb.includes("{yen(gi.due)}") && kr.includes('"請求（税・サ込）" : "請求（サ込・内税）"') && !rb.includes("請求（サ料込）</th>") && !kr.includes("請求（サ料込）</th>"));
}

// ── (8) C2-13 HOME の要承認 ──
{
  const ap = { id: "a1", checkId: "c1", seatName: "A3", payGroup: "A", type: "discount", amount: 10_000, reason: "常連", requestedBy: "林", createdAt: new Date(Date.now() - 12 * 60_000).toISOString() };
  const l = approvalLineOf(ap);
  check("c2(8-1) C2-13 申請の行＝「割引 ¥10,000・A3（伝票 A）」＋理由・申請者・経過分・ベルの数＝カードの見出し（申請＋希望＋退勤記録なし・提案は数えない）・0 は「要承認なし」", l.head === "割引 ¥10,000・A3（伝票 A）" && l.sub === "常連・申請 林・12 分前" && pendingTotalOf({ approvals: [ap], wishes: [{ key: "p", label: "x", n: 3, href: "", periodId: null }], missingOut: [{ castId: "c", castName: "n", bizDate: "2026-10-22" }] }) === 5 && bellLabelOf(5) === "要承認 5 件" && bellLabelOf(0) === "要承認なし", J(l));
  const wg = wishGroupsOf([{ date: "2026-11-02" }, { date: "2026-11-03" }, { date: "2026-12-01" }], [{ id: "p1", start_date: "2026-10-30", end_date: "2026-11-05" }], "st");
  check("c2(8-2) C2-13 シフト希望の未処理＝期間ごとの件数（10/30〜11/5 に 2・期間なしは月）・退勤記録なし＝in あり out なしの営業日（今日より前だけ）・却下の理由は 1〜200 字", wg.length === 2 && wg[0].label === "10/30〜11/5" && wg[0].n === 2 && wg[0].href === "/shift?store=st&date=2026-10-30&tab=queue" && wg[1].label === "12月（期間なし）"
    && J(missingOutOf([{ cast_id: "c1", type: "in", punched_at: "2026-10-22T20:00:00+09:00" }, { cast_id: "c2", type: "in", punched_at: "2026-10-22T20:00:00+09:00" }, { cast_id: "c2", type: "out", punched_at: "2026-10-23T01:00:00+09:00" }, { cast_id: "c1", type: "in", punched_at: "2026-10-23T20:00:00+09:00" }], "06:00", "2026-10-23", (id) => id).map((m) => [m.castId, m.bizDate])) === J([["c1", "2026-10-22"]]) && rejectReasonOkOf("理由") && !rejectReasonOkOf(" ") && !rejectReasonOkOf("x".repeat(201)), J(wg));
  const lay = src("app/(manage)/layout.tsx"), db = src("app/(manage)/dashboard/dashboard-board.tsx"), pc = src("components/nox/pending-card.tsx"), api = src("app/api/home/pending/route.ts"), css = src("app/globals.css");
  check("c2(8-3) C2-13 配線＝HOME 最上段に PendingCard（店長・オーナー＝種別ごとの行・承認／却下は approval_decide・却下は理由必須／スタッフ＝自分の申請）・上部バーのベル（cast 以外・同じ API）・行は 390px で 2 行・API は full=1 で提案", db.includes('<PendingCard storeId={curStoreId} role={isManagerUp ? "manager" : "staff"} />') && lay.includes('{role !== "cast" && <PendingBell storeId={null} />}') && pc.includes('supabase.rpc("approval_decide", { p_approval_id: id, p_approve: approve })') && pc.includes("rejectReasonOkOf(reason)") && pc.includes('data-pending-card="staff"') && pc.includes('data-pending-none="1"') && api.includes('url.searchParams.get("full") === "1"') && api.includes('.eq("status", "pending")') && css.includes("@media (max-width: 430px) { .nox-pending-row { display: block; }"));
}

// ── (9) C2-14 デモ payload（ACE 延長 3 本・伝票の延長単価＝開卓時のパターン） ──
{
  const ace = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> };
  const ext = ace.tables.pricing_rules.filter((r) => r.fee_kind === "extension");
  const fees = new Set(ace.tables.checks.map((c) => `${c.ext_min}/${c.ext_fee}`));
  const lines = ace.tables.check_lines.filter((l) => l.fee_kind === "extension");
  check("c2(9-1) C2-14 ACE の延長パターン＝3 本（平日通常 60 分 ¥13,000／VIP 30 分 ¥9,000／週末通常 30 分 ¥4,000）・伝票の ext_min／ext_fee＝その伝票の開卓時のパターン（60/13000・30/9000・30/4000 の 3 種だけ）・延長行の単価も同じ値", ext.length === 3 && ext.some((r) => r.duration_min === 60 && r.amount === 13000) && ext.some((r) => r.duration_min === 30 && r.amount === 9000) && ext.some((r) => r.duration_min === 30 && r.amount === 4000) && [...fees].sort().join(",") === "30/4000,30/9000,60/13000" && lines.length > 0 && lines.every((l) => [13000, 9000, 4000].includes(Number(l.unit_price_snapshot))), J({ ext: ext.map((r) => [r.name, r.duration_min, r.amount]), fees: [...fees], lines: lines.length }));
}

// ── (10) C2-15 店設定「税・サービス料」の保存 ──
{
  const pb = src("app/(manage)/master/pricing/pricing-board.tsx"), pp = src("app/(manage)/master/pricing-panel.tsx");
  check("c2(10-1) C2-15 保存ボタンはブロックの直下に 1 つ「税・サービス料を保存」（サ料率＝PricingPanel の save→税設定＝set_store_tax_config の順）・旧「税設定を保存」の別カードは無い・免税＝インボイスの SegSelect を無効・注記はボタンの横・バッジは taxBase.pd", pb.includes('data-tax-save="1"') && pb.includes(">税・サービス料を保存</button>") && !pb.includes(">税設定を保存</button>") && pb.includes("const ok = serviceSaveRef.current ? await serviceSaveRef.current() : true;") && pb.includes('disabled={tBts !== "taxable"} ariaLabel="インボイス"') && pb.includes("税設定の保存は、開卓済みの伝票に影響しません") && pb.includes('data-tax-mode={taxBase.pd === "tax_excluded" ? "excluded" : "included"}') && pb.includes("p_price_display: tPd,") && pp.includes("if (saveRef) saveRef.current = save;") && pp.includes("{!hideSave && <div"));
  const inc = groupDueFull([{ line_total: 10_000, kind: "charge" }], { service_rate: 10, round_unit: 1, round_mode: "down", price_display: "tax_included" });
  const exc = groupDueFull([{ line_total: 10_000, kind: "charge" }], { service_rate: 10, round_unit: 1, round_mode: "down", price_display: "tax_excluded", business_tax_status: "taxable" });
  check("c2(10-2) C2-15 新規開卓の伝票＝price_display の凍結値で計算が変わる（内税 11,000／外税 12,100＝税 1,100）・既存の伝票は凍結値のまま（別の行）", inc === 11_000 && exc === 12_100, J([inc, exc]));
}

// ── (11) C2-16 丸め設定は凍結しない（裁定424 候補・0175 v2 ★29） ──
{
  const lines = [{ line_total: 34_944, kind: "charge" }];
  const frozen = { service_rate: 10, round_unit: 1, round_mode: "down", price_display: "tax_included", status: "open" };
  const store = { round_unit: 100, round_mode: "up" };
  const sOn = dueSettingsOf(frozen, store, true), sOff = dueSettingsOf(frozen, store, false), sClosed = dueSettingsOf({ ...frozen, status: "closed" }, store, true);
  const bd = dueBreakdownOf(lines, sOn);
  check("c2(11-1) C2-16 丸め 100・切り上げ＝既存伝票の合計 ¥38,500・端数調整 ¥62 の行・丸め 1 なら行なし・入金ダイアログの請求額＝明細の合計（同じ due）・フラグ false と closed は凍結値のまま", groupDueFull(lines, sOn) === 38_500 && bd.rounding === 62 && roundingRowShownOf(bd.rounding) && !roundingRowShownOf(dueBreakdownOf(lines, sOff).rounding) && groupDueFull(lines, sOff) === 38_438 && sOff === frozen && sClosed.round_unit === 1, J({ on: groupDueFull(lines, sOn), bd, off: groupDueFull(lines, sOff) }));
  const rb = src("app/(manage)/register/register-board.tsx"), sql = src("docs/tmp/0175_rules_bundle_v2_draft.sql");
  check("c2(11-2) C2-16 配線＝レジの due と内訳は dueSettingsOf(check, estStore, rules0175On())・0175 v2 ★29＝check_group_due が開いている伝票で stores の丸めを読む（closed は凍結値）", rb.includes("groupDueFull(gl, dueSettingsOf(check, estStore, rules0175On()), refCustomer)") && rb.includes("dueBreakdownOf(gl, dueSettingsOf(check, estStore, rules0175On()), ref)") && sql.includes("from public.checks c join public.stores s on s.id = c.store_id\n   where c.id = p_check_id and c.status = 'open';") && sql.includes("★29 0175 v2（裁定424 候補"));
}

// ── (12)(13)(14) C2-17／C2-18／C2-19 シフト ──
{
  check("c2(12-1) C2-17 見出し＝「承認待ち 13 件（希望どおり 7・要調整 0・確認待ち 14）」・未処理 0 は「承認待ちなし」・右端「合計 27 件（未処理 13＋確認待ち 14）」・締切前の案内", queueHeadTextOf({ pending: 13, asIs: 7, adjust: 0, waiting: 14 }) === "承認待ち 13 件（希望どおり 7・要調整 0・確認待ち 14）" && queueHeadTextOf({ pending: 0, asIs: 0, adjust: 0, waiting: 14 }) === "承認待ちなし" && queueTotalTextOf(13, 14) === "合計 27 件（未処理 13＋確認待ち 14）" && noPlacingTextOf([{ start_date: "2026-10-30", end_date: "2026-11-05", wish_deadline: "2026-10-26" }]) === "締切前の期間が 1 つ（10/30〜11/5・締切 10/26）。締め切ると配置に移ります" && noPlacingTextOf([]) === null);
  const sb = src("app/(manage)/shift/shift-board.tsx");
  check("c2(12-2) C2-17 配線＝既定は畳む（queueOpen false・localStorage nox.shift.queueOpen）・押すと開く・一括採用の N＝集計「希望どおり」と同じ ids.length・「調整中を送り返す（N）」「放置分を代行確定（N）」は 0 で非表示・説明は「？」・一覧は開いたときだけ", sb.includes("const [queueOpen, setQueueOpen] = useState(false);") && sb.includes('localStorage.getItem("nox.shift.queueOpen") === "1"') && sb.includes('data-queue-toggle="1"') && sb.includes("希望どおり一括採用（{ids.length}件）") && sb.includes('["希望どおり", ids.length, "件"]') && sb.includes("調整中を送り返す（{planned.length}）") && sb.includes("この {planned.length + proposed.length} 件を確定") /* ★便 M-12 ③ */ && sb.includes("{isManagerUp && (planned.length > 0 || proposed.length > 0) && (") && sb.includes('data-queue-help="1"') && sb.includes("{queueOpen && (() => {\n          type Row = {") && sb.includes('data-shift-no-placing="1"'));
  check("c2(13-1) C2-18 ①＝期間の一覧とフォーム・「必要人数を設定」・凡例（進行の帯）だけ＝公開／作成中に戻す／④公開シフトへ／代行確定／集計 4／配置を組む は ① に無い・④にだけ「作成中に戻す」と公開ボタン・③に配置を組む（月カレンダー／スタッフ別・＋追加）と代行確定と集計・期間の行の導線・④の月名は期間の実日付", sb.includes('data-shift-period-card="1"') && !sb.includes("キャストシフト計画</h2>") && (sb.match(/>④ 公開シフトへ<\/button>/g) ?? []).length === 1 /* ③ の頭の CTA だけ */ && !sb.includes(">確定シフトへ</button>") && (sb.match(/>作成中に戻す<\/button>/g) ?? []).length === 1 && sb.includes('data-shift-to-draft="1"') && (sb.match(/data-shift-publish-btn="1"/g) ?? []).length === 1 && sb.includes('data-shift-plantools="1"') && sb.includes('data-shift-place-cal="1"') && sb.includes("{confirmCta}{/* ★裁定253 R12: 仮シフト＝KPI 4 枚の下 */}") && !sb.includes("{confirmCta}{/* ★裁定253 R12: シフト作成＝計画ヘッダ") && !sb.includes('<div className="l">配置済み</div>') && sb.includes('data-period-link="submit"') && sb.includes('data-period-link="queue"') && sb.includes('data-period-link="publish"') && sb.includes('data-shift-publish-month="1"') && periodMonthLabelOf("2026-10-23", "2026-10-29") === "2026年10月" && periodMonthLabelOf("2026-10-30", "2026-11-05") === "10/30〜11/5");
  const tx = cellTextOf({ assigned: 3, confirmed: 3, proposed: 1, planned: 0, required: 4 });
  const ok = cellTextOf({ assigned: 4, confirmed: 4, proposed: 0, planned: 0, required: 4 });
  const none = cellTextOf({ assigned: 0, confirmed: 0, proposed: 0, planned: 0, required: 0 });
  check("c2(14-1) C2-19 セルの文字＝地色クラス（充足／やや不足／不足／未設定）・中央「3/4（確認待ち 1）」＋「あと 1 名」・充足は「充足」・未設定は「未設定」のみ・不足日の集計は期間内のみ", tx.fill === "warn" && tx.center === "3/4" && tx.pending === "確認待ち 1" && tx.sub === "あと 1 名" && ok.fill === "ok" && ok.sub === "充足" && none.fill === "none" && none.center === "未設定" && none.sub === null && fillOf(2, 4) === "ng"
    && shortDaysInPeriodsOf(["2026-11-02", "2026-11-09"], (d) => (d === "2026-11-02" ? "open" : "none"), () => ({ assigned: 3, confirmed: 3, proposed: 0, planned: 0, required: 4 }), () => false) === 1 && LEGEND_STAGE.length === 5 && LEGEND_FILL.length === 4, J(tx));
  const cc = src("components/nox/shift-cal-cell.tsx"), css = src("app/globals.css");
  check("c2(14-2) C2-19 配線＝③のセルは CalCell（地色 fill-*・右上バッジ stg-*・中央 data-cal-center）・凡例 2 列（data-cal-legend・390px は 1 列）・確定シフトタブも同じ地色とバッジ・「手修正」「●=確定」「枠色は自動」の文字列がコードに残らない・色は CSS 変数（--cal-*／--stg-*）", sb.includes("<CalCell key={ymd} ymd={ymd} stat={st} stage={stage}") && sb.includes("<CalLegend style={{ margin: \"8px 0\" }} />") && sb.includes("nox-cald-bd stg-${periodCellStageOf(periodsAll, ymd, bizToday)}") && !sb.includes("手修正") && !sb.includes("●=確定") && !sb.includes("枠色は") && !sb.includes("自{auto}") && cc.includes('data-cal-badge={stage}') && cc.includes('data-cal-legend="1"') && css.includes("--cal-ok-bg: #1e4d33;") && css.includes(".nox-cald-bd.stg-open { background: var(--stg-open-bg); color: var(--stg-open-fg); }") && css.includes("@media (max-width: 430px) { .nox-callegend { grid-template-columns: 1fr; }"));
  // E-23 追補1: コントラスト 3 以上（地色×文字・バッジ×文字）
  const lum = (hex: string) => { const c = hex.replace("#", ""); const f = (i: number) => { const v = parseInt(c.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4); };
  const cr = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs: [string, string][] = [["#1e4d33", "#d9f5e3"], ["#5a4716", "#ffe9a8"], ["#5c2320", "#ffd6d3"], ["#2a2a33", "#c9c9d1"], ["#1f8f85", "#ffffff"], ["#2f7fe7", "#ffffff"], ["#22b8cf", "#0b1a1e"], ["#7fe0a0", "#0b2a16"], ["#6b7280", "#ffffff"]];
  check("c2(14-3) C2-19 ⑧ コントラスト 3 以上＝地色 4×文字・バッジ 5×文字の全組合せ（E-23 追補1）", pairs.every(([a, b]) => cr(a, b) >= 3), J(pairs.map(([a, b]) => [a, b, Math.round(cr(a, b) * 10) / 10])));
}

// ── (15) C2-20 レジ「予約」タブ ──
{
  const rows = [{ dow: 5, is_closed: false, open_hm: "20:00", close_hm: "25:00" }];
  const st = (iso: string) => businessHoursStatus(new Date(iso), rows, "06:00").status;
  check("c2(15-1) C2-20 ② 営業時間＝20:00 ちょうどは営業内・01:00（翌・終了ちょうど）は営業内・01:01 は時間外・19:59 は時間外（深夜またぎ＝営業日の曜日で判定）", st("2026-10-23T20:00:00+09:00") === "inside" && st("2026-10-24T01:00:00+09:00") === "inside" && st("2026-10-24T01:01:00+09:00") === "outside" && st("2026-10-23T19:59:00+09:00") === "outside", J([st("2026-10-23T20:00:00+09:00"), st("2026-10-24T01:00:00+09:00"), st("2026-10-24T01:01:00+09:00")]));
  const rows24 = [{ dow: 5, is_closed: false, open_hm: "20:00", close_hm: "01:00" }]; // live（ACE）＝終了を 24h 表記「01:00」で保存している店
  const st24 = (iso: string) => businessHoursStatus(new Date(iso), rows24, "06:00").status;
  check("c2(15-1b) C2-20 ② 終了が開始以下（\"01:00\" の 24h 表記）＝翌日扱い＝22:30 と 01:00 は営業内・01:01 は時間外（live の ACE で 22:30 が時間外になっていた）", st24("2026-10-23T22:30:00+09:00") === "inside" && st24("2026-10-24T01:00:00+09:00") === "inside" && st24("2026-10-24T01:01:00+09:00") === "outside" && st24("2026-10-23T19:59:00+09:00") === "outside", J([st24("2026-10-23T22:30:00+09:00"), st24("2026-10-24T01:00:00+09:00"), st24("2026-10-24T01:01:00+09:00")]));
  const bd = castBadgesOf({ shifts: [{ cast_id: "a", start_hm: "20:00" }, { cast_id: "c", start_hm: "21:00" }], attendance: [{ cast_id: "b", status: "off" }, { cast_id: "c", status: "shukkin" }], seated: [{ castId: "c", seatName: "A3" }], today: { punchedIn: new Set<string>(), out: new Set<string>(), nowMin: 0 } }); // ★便 M2 M-18: 着卓中は予約の日付が今日のときだけ
  check("c2(15-2) C2-20 ③ 担当のバッジ＝出勤予定 20:00／休み（薄く）／着卓中（A3）が優先・無い人はバッジなし", bd.get("a")?.label === "出勤予定 20:00" && bd.get("b")?.label === "休み" && bd.get("b")?.tone === "muted" && bd.get("c")?.label === "着卓中（A3）" && !bd.has("d"), J([...bd.entries()]));
  const rp = src("app/(manage)/register/reservation-panel.tsx"), css = src("app/globals.css");
  check("c2(15-3) C2-20 ①④ 配線＝1,024px 以上は 2 列（.nox-rsv-2col＝左 55／右 45・右は sticky）・1,024px 未満は縦 1 列・一覧の「編集」で右のフォームがその予約の編集（data-rsv-edit-form・「やめる」で新規に戻る）・未来店 0 は薄く・バッジは castBadges", rp.includes('data-rsv-layout={wide ? "2col" : "1col"}') && rp.includes("const wide = !useNarrow(1024);") && rp.includes("data-rsv-edit-form={editRow.id}") && rp.includes("{editId === r.id && r.status === \"booked\" && !wide && editBlockOf(r)}") && rp.includes(">やめる</button>") && rp.includes("data-rsv-overdue={kpiOverdue}") && rp.includes("badges={castBadges}") && css.includes(".nox-rsv-2col { display: grid; grid-template-columns: minmax(0, 55fr) minmax(0, 45fr);") && css.includes(".nox-rsv-2col > .nox-rsv-right { position: sticky; top: 72px; }"));
}

// ── (16) C2-21 明細の見出しロゴ ──
{
  const bl = src("components/ui/brand-logo.tsx"), ps = src("components/payslip-slip.tsx"), rc = src("components/nox/receipt-print.tsx"), css = src("app/globals.css");
  const sites = ["components/ui/side-nav.tsx", "app/(manage)/layout.tsx", "app/login/page.tsx", "app/demo/page.tsx", "app/lp/page.tsx", "app/mine/layout.tsx", "components/nox/receipt-print.tsx", "components/payslip-slip.tsx"];
  const singles = sites.filter((f) => f !== "components/payslip-slip.tsx").every((f) => !/<BrandLogo[^>]*\bprint\b/.test(src(f)));
  check("c2(16-1) C2-21 明細の見出し＝BrandLogo（print）の 2 枚は inline に display を持たない（CSS .nox-logo-screen＝block／.nox-logo-print＝none・印刷で反転）＝画面に 1 枚だけ・明細は 1 か所（height 22・左寄せ）・領収書は light 1 枚・A-2 の 8 か所のうち print は明細だけ", bl.includes("const printBase: CSSProperties = { ...base }; delete printBase.display;") && bl.includes('className="nox-logo-screen" style={printBase}') && css.includes(".nox-logo-screen { display: block; }") && css.includes(".nox-logo-print { display: none; }") && (ps.match(/<BrandLogo height=\{22\} print \/>/g) ?? []).length === 2 && rc.includes('<BrandLogo height={34} variant="light" />') && singles);
}

if (fails.length) { console.error(`verify:nox-c2 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-c2 OK ${pass} checks`);
