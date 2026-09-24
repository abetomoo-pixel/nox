/*
 * verify:nox-wish-calendar — 便 AX（裁定290・2026-09-24）キャスト側 希望シフトのカレンダー化 lib/nox/mine/wish-calendar.ts の係留（純関数・DB 不触）。
 *   npm run verify:nox-wish-calendar（env 不要）。f0 69 段目。
 *
 *  (1) monthCellsOf／monthAfterOf／initialMonthOf: グリッドの形・月送り・最初に開く月（募集中の期間の開始月・無ければ today の月）
 *  (2) activeDaysOf: 募集中の期間内 ∧ 定休日でない ∧ 生きている希望（pending／accepted）が無い ∧ today 以降。periods null は全て非活性
 *  (3) toggleDay／setOverride／composeSubmissions: 選択の toggle・日別上書き・昇順・上書き > 一括
 *  (4) summarizeResults／selectionAfterSubmit: 「n/m 件を提出しました」・失敗日は残る・全成功 success／一部 warn／全失敗 error
 *  (5) wishMarkOf／isLiveWish／timesValid
 *  (6) 配線（逐語 grep）: wish-form が activeDaysOf／composeSubmissions／summarizeResults を通し、shift_wish_submit を逐次呼ぶ・旧 input type=date が無い
 *  逆テスト 1 本（手動・1 回）: activeDaysOf の `ymd < input.today` を `ymd <= input.today` にする→wc(2-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { activeDaysOf, composeSubmissions, initialMonthOf, isLiveWish, monthAfterOf, monthCellsOf, selectionAfterSubmit, setOverride, summarizeResults, timesValid, toggleDay, wishMarkOf } from "../lib/nox/mine/wish-calendar";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const T = "2026-10-05";
const P = [{ start_date: "2026-10-01", end_date: "2026-10-15", wish_deadline: "2026-09-25" }, { start_date: "2026-10-20", end_date: "2026-10-31", wish_deadline: null }];
const cells = monthCellsOf("2026-10");
// (1)
check("wc(1-1) monthCellsOf 2026-10: 先頭の空き 4（10/1 は木）・日数 31・末尾 10/31", cells.slice(0, 4).every((c) => c === null) && cells.filter(Boolean).length === 31 && cells[cells.length - 1] === "2026-10-31");
check("wc(1-2) monthAfterOf: 2026-12 +1＝2027-01・2026-01 −1＝2025-12", monthAfterOf("2026-12", 1) === "2027-01" && monthAfterOf("2026-01", -1) === "2025-12");
check("wc(1-3) initialMonthOf: 募集中の期間が未来なら開始月・今日を含むなら今日の月・無ければ今日の月", initialMonthOf([{ start_date: "2026-11-01", end_date: "2026-11-15", wish_deadline: null }], T) === "2026-11" && initialMonthOf(P, T) === "2026-10" && initialMonthOf(null, T) === "2026-10" && initialMonthOf([], "2026-12-01") === "2026-12");
// (2)
const wishes = [{ id: "w1", date: "2026-10-06", start_hm: "20:00", end_hm: "26:00", status: "pending" }, { id: "w2", date: "2026-10-07", start_hm: "20:00", end_hm: "26:00", status: "withdrawn" }, { id: "w3", date: "2026-10-08", start_hm: "20:00", end_hm: "26:00", status: "accepted" }, { id: "w4", date: "2026-10-09", start_hm: "20:00", end_hm: "26:00", status: "rejected" }];
const act = activeDaysOf({ periods: P, cells, wishes, closedDates: new Set(["2026-10-10"]), today: T });
check("wc(2-1) 活性: 期間内・today 以降（10/5 可・10/4 不可）・pending／accepted の日は不可・withdrawn／rejected の日は可・定休日不可・隙間（10/16〜19）不可", act.has("2026-10-05") && !act.has("2026-10-04") && !act.has("2026-10-06") && act.has("2026-10-07") && !act.has("2026-10-08") && act.has("2026-10-09") && !act.has("2026-10-10") && !act.has("2026-10-16") && act.has("2026-10-20") && act.has("2026-10-31"), [...act].join(","));
check("wc(2-2) periods null（RPC 未適用）＝全て非活性・[]＝全て非活性", activeDaysOf({ periods: null, cells, wishes: [], closedDates: new Set(), today: T }).size === 0 && activeDaysOf({ periods: [], cells, wishes: [], closedDates: new Set(), today: T }).size === 0);
// (3)
let sel = toggleDay({}, "2026-10-12");
sel = toggleDay(sel, "2026-10-05");
check("wc(3-1) toggleDay: 追加→2 日・再タップで解除", Object.keys(sel).length === 2 && Object.keys(toggleDay(sel, "2026-10-12")).join() === "2026-10-05");
sel = setOverride(sel, "2026-10-12", { start: "21:00", end: "25:00" });
check("wc(3-2) setOverride: 選択中の日だけ上書き・未選択日は無視", sel["2026-10-12"]?.start === "21:00" && setOverride(sel, "2026-10-30", { start: "1", end: "2" }) === sel);
const rows = composeSubmissions(sel, { start: "20:00", end: "26:00" });
check("wc(3-3) composeSubmissions: 昇順・上書き > 一括", JSON.stringify(rows) === JSON.stringify([{ date: "2026-10-05", start_hm: "20:00", end_hm: "26:00" }, { date: "2026-10-12", start_hm: "21:00", end_hm: "25:00" }]), JSON.stringify(rows));
// (4)
const res = [{ date: "2026-10-05", ok: true as const }, { date: "2026-10-12", ok: false as const, err: "この日の希望はすでに提出済みです" }];
const sum = summarizeResults(res);
check("wc(4-1) summarizeResults: 1/2 件・失敗 1・warn・文言", sum.ok === 1 && sum.total === 2 && sum.failed.length === 1 && sum.kind === "warn" && sum.text === "1/2 件を提出しました（1 件は提出できませんでした・赤い日を確認して再提出できます）", sum.text);
check("wc(4-2) 全成功 success「2/2 件を提出しました」・全失敗 error", summarizeResults([{ date: "a", ok: true }, { date: "b", ok: true }]).text === "2/2 件を提出しました" && summarizeResults([{ date: "a", ok: true }, { date: "b", ok: true }]).kind === "success" && summarizeResults([{ date: "a", ok: false, err: "x" }]).kind === "error");
check("wc(4-3) selectionAfterSubmit: 成功日を外し失敗日（上書きごと）を残す", JSON.stringify(selectionAfterSubmit(sel, res)) === JSON.stringify({ "2026-10-12": { start: "21:00", end: "25:00" } }));
// (5)
check("wc(5-1) wishMarkOf: pending 審査中／accepted 承認／rejected 却下／withdrawn・null は印なし", wishMarkOf("pending") === "審査中" && wishMarkOf("accepted") === "承認" && wishMarkOf("rejected") === "却下" && wishMarkOf("withdrawn") === null && wishMarkOf(null) === null);
check("wc(5-2) isLiveWish／timesValid（開始 00:00〜23:59・終了 00:00〜47:59）", isLiveWish("pending") && isLiveWish("accepted") && !isLiveWish("rejected") && timesValid({ start: "20:00", end: "26:00" }) && timesValid({ start: "23:59", end: "47:59" }) && !timesValid({ start: "24:00", end: "26:00" }) && !timesValid({ start: "20:00", end: "48:00" }) && !timesValid({ start: "2000", end: "26:00" }));
// (6)
const wf = fs.readFileSync("app/mine/wishes/wish-form.tsx", "utf8");
check("wc(6-1) wish-form: activeDaysOf／composeSubmissions／summarizeResults を通し、shift_wish_submit を逐次（for … of）呼ぶ", /activeDaysOf\(/.test(wf) && /composeSubmissions\(/.test(wf) && /summarizeResults\(/.test(wf) && /for \(const r of rows\) \{[\s\S]*?rpc\("shift_wish_submit"/.test(wf));
check("wc(6-2) wish-form: 旧 input type=date の単発フォームは撤去・月グリッドは nox-calgrid nox-calgrid--fit・提出済みの印は wishMarkOf", !/type="date"/.test(wf) && /className="nox-calgrid nox-calgrid--fit"/.test(wf) && /wishMarkOf\(/.test(wf));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-wish-calendar OK (${pass} checks)`);
