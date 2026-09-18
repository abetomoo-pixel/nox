/*
 * verify:nox-open-periods — 夜間便 N5（裁定287-2・2026-09-18）キャスト側の募集期間の案内と日付の可否 lib/nox/shift/open-periods.ts の係留（純関数・DB 不触）。
 *   npm run verify:nox-open-periods（env 不要）。f0 63 段目。
 *
 *  (1) periodNoticeOf: 期間なし→none／締切前あり→open（M/D〜M/D のシフト希望を受付中（締切 M/D））／すべて締切超過→past_deadline
 *  (2) deadlinePassed: 締切当日は受付中・翌日から超過・締切なしは超過しない
 *  (3) isDateSelectable: 両端含む・隙間は不可・期間なしは不可（DB の fail-closed と同じ）・形式外は不可
 *  (4) dateBoundsOf: 最小 start／最大 end・期間なしは null
 *  (5) 配線（逐語 grep）: wish-form が shift_open_periods_mine を呼び RPC 不在で null（従来どおり）に落とす・期間外は送らない・
 *      'period_not_open' の写像・shift-board の募集中の成功文言
 *  逆テスト 1 本（手動・1 回）: deadlinePassed の `<` を `<=` にする→op(2-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { dateBoundsOf, deadlinePassed, isDateSelectable, periodLineOf, periodNoticeOf, type OpenPeriod } from "../lib/nox/shift/open-periods";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const T = "2026-09-18";
const A: OpenPeriod = { start_date: "2026-09-16", end_date: "2026-09-30", wish_deadline: "2026-09-15" }; // 締切超過
const B: OpenPeriod = { start_date: "2026-10-01", end_date: "2026-10-15", wish_deadline: "2026-09-25" }; // 受付中
const C: OpenPeriod = { start_date: "2026-10-16", end_date: "2026-10-31", wish_deadline: null };         // 締切なし＝受付中

// (1)
check("op(1-1) 期間なし→none「現在、募集中の期間はありません」", JSON.stringify(periodNoticeOf([], T)) === JSON.stringify({ kind: "none", text: "現在、募集中の期間はありません" }));
check("op(1-2) 受付中 1 つ→open「10/1〜10/15 のシフト希望を受付中（締切 9/25）」", JSON.stringify(periodNoticeOf([B], T)) === JSON.stringify({ kind: "open", text: "10/1〜10/15 のシフト希望を受付中（締切 9/25）" }), periodNoticeOf([B], T).text);
check("op(1-3) 締切超過だけ→past_deadline「締切を過ぎています（店舗に相談してください）」", JSON.stringify(periodNoticeOf([A], T)) === JSON.stringify({ kind: "past_deadline", text: "締切を過ぎています（店舗に相談してください）" }));
check("op(1-4) 超過＋受付中→open（受付中だけを start 順に「／」で連ねる・締切なしは括弧なし）", periodNoticeOf([C, A, B], T).kind === "open" && periodNoticeOf([C, A, B], T).text === "10/1〜10/15 のシフト希望を受付中（締切 9/25） ／ 10/16〜10/31 のシフト希望を受付中", periodNoticeOf([C, A, B], T).text);
check("op(1-5) periodLineOf 締切なし", periodLineOf(C) === "10/16〜10/31 のシフト希望を受付中");
// (2)
check("op(2-1) 締切当日は受付中・翌日から超過", !deadlinePassed(B, "2026-09-25") && deadlinePassed(B, "2026-09-26"));
check("op(2-2) 締切なしは超過しない・過去の締切は超過", !deadlinePassed(C, "2027-01-01") && deadlinePassed(A, T));
// (3)
check("op(3-1) 両端含む（9/16・9/30 可・9/15・10/16 は A だけなら不可）", isDateSelectable([A], "2026-09-16") && isDateSelectable([A], "2026-09-30") && !isDateSelectable([A], "2026-09-15") && !isDateSelectable([A], "2026-10-16"));
check("op(3-2) 複数期間の隙間は不可（A=〜9/30・C=10/16〜 → 10/5 不可・10/20 可）", !isDateSelectable([A, C], "2026-10-05") && isDateSelectable([A, C], "2026-10-20"));
check("op(3-3) 期間なし・形式外は不可", !isDateSelectable([], "2026-09-18") && !isDateSelectable([A], "") && !isDateSelectable([A], "2026-9-18"));
check("op(3-4) 締切超過の期間の日も可（DB は締切で拒否しない＝0103 裁定43 と同じ・案内だけ）", isDateSelectable([A], T));
// (4)
check("op(4-1) dateBoundsOf 最小 start／最大 end", JSON.stringify(dateBoundsOf([C, A, B])) === JSON.stringify({ min: "2026-09-16", max: "2026-10-31" }));
check("op(4-2) dateBoundsOf 期間なし→null", dateBoundsOf([]) === null);
// (5)
const wf = fs.readFileSync("app/mine/wishes/wish-form.tsx", "utf8");
check("op(5-1) wish-form: shift_open_periods_mine を呼び、RPC 不在は null（従来どおり）・他の失敗は []（募集なし）", /supabase\.rpc\("shift_open_periods_mine"\)/.test(wf) && /setPeriods\(isRpcMissingError\(error\.message\) \? null : \[\]\)/.test(wf));
check("op(5-2) wish-form: 案内は Message（締切超過＝warn）・periods が null なら出さない", /const notice = periods \? periodNoticeOf\(periods, today\) : null;/.test(wf) && /<Message kind=\{notice\.kind === "past_deadline" \? "warn" : "info"\}/.test(wf));
check("op(5-3) wish-form: 日付は min／max＋期間外は送らない（outside）", /min=\{bounds\?\.min\} max=\{bounds\?\.max\}/.test(wf) && /if \(outside\) \{ setMsg\(\{ kind: "error", text: "この日は募集期間外です" \}\); return; \}/.test(wf) && /disabled=\{busy \|\| closedDay \|\| outside\}/.test(wf));
check("op(5-4) wish-form: 失敗は rpcErrJa 経由（'closed day'／'bad time' は従来文言）・'period_not_open'＝「この日は募集期間外です」", /: rpcErrJa\(error\.message\) \}/.test(wf) && rpcErrJa("period_not_open") === "この日は募集期間外です" && /提出済み/.test(rpcErrJa("duplicate wish")));
const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("op(5-5) shift-board: 募集中で保存したとき「キャストのマイページに希望提出の案内が表示されます」を足す", /\(pStatus === "open" \? "。キャストのマイページに希望提出の案内が表示されます" : ""\)/.test(sb));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-open-periods OK (${pass} checks)`);
