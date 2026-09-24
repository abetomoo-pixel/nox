/*
 * verify:nox-today-row — 便 AT2（2026-09-24・週末バックログ 1）/shift 今日タブの行の純関数 lib/nox/shift/today-row.ts の係留（DB 不触）。
 *   npm run verify:nox-today-row（env 不要）。f0 66 段目。
 *
 *  (1) isArrivedStatus: 出勤・遅刻・同伴＝true／休み・当欠・未記録・不明＝false
 *  (2) outButtonOf: 出勤区分の行にだけ出す・in 打刻なしは押せない・out 済みは押せない・canRecord=false は出さない
 *  (3) punchTimeLabel: in のみ「出勤 HH:MM」・in＋out「HH:MM → HH:MM」・なし null（偽の時刻を作らない）・out のみ「退勤 HH:MM」
 *  (4) hmJstOf／firstInLastOut: JST の HH:MM・最初の in／最後の out（punch-match S1 と同じ採用規則）・cast 別
 *  (5) 配線（逐語 grep）: shift-board が firstInLastOut／punchTimeLabel／outButtonOf を通し、見出しが M/D(曜)・表が stickyfirst
 *  (6) ★便 AY1（裁定291 追補1 A-3）: punchInAfterAtt＝出勤区分かつ in 打刻なしだけ true・休み／当欠 false・in 済みの区分変更 false／配線＝setAtt が成功後に punch_proxy 'in'
 *  逆テスト 2 本（手動・各 1 回）: isArrivedStatus から "late" を外す→tr(1-1)／(2-2) 赤・戻して緑／punchInAfterAtt の !hasIn を落とす→tr(6-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { firstInLastOut, hmJstOf, isArrivedStatus, outButtonOf, punchInAfterAtt, punchTimeLabel } from "../lib/nox/shift/today-row";
import { ackOptionsOf, correctionSummaryOf, disputedOf, hmOnBizOf, jstIsoOf, requestArgsOf, requestInitOf, termOf } from "../lib/nox/shift/punch-correction"; // ★0154 D1

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// (1)
check("tr(1-1) isArrivedStatus: shukkin／late／dohan＝true", isArrivedStatus("shukkin") && isArrivedStatus("late") && isArrivedStatus("dohan"));
check("tr(1-2) isArrivedStatus: off／absent／null／undefined／''／不明＝false", !isArrivedStatus("off") && !isArrivedStatus("absent") && !isArrivedStatus(null) && !isArrivedStatus(undefined) && !isArrivedStatus("") && !isArrivedStatus("x"));
// (2)
const ob = (attStatus: string | null, hasIn: boolean, hasOut = false, canRecord = true) => outButtonOf({ canRecord, attStatus, hasIn, hasOut });
check("tr(2-1) 出勤区分＋in 打刻あり＝出す・押せる", JSON.stringify([ob("shukkin", true).show, ob("shukkin", true).enabled]) === "[true,true]");
check("tr(2-2) 遅刻・同伴でも出す（in ありなら押せる）", ob("late", true).enabled && ob("dohan", true).enabled);
check("tr(2-3) 出勤区分だが in 打刻なし＝出すが押せない（orphan_out を作らない・title に案内）", ob("shukkin", false).show && !ob("shukkin", false).enabled && /出勤（in）の打刻がありません/.test(ob("shukkin", false).title));
check("tr(2-4) 休み・当欠・未記録＝出さない", !ob("off", true).show && !ob("absent", true).show && !ob(null, true).show);
check("tr(2-5) out 済み＝出すが押せない", ob("shukkin", true, true).show && !ob("shukkin", true, true).enabled);
check("tr(2-6) canRecord=false（先の日・staff）＝出さない", !ob("shukkin", true, false, false).show);
// (3)
check("tr(3-1) in のみ→「出勤 20:01」", punchTimeLabel("20:01", null) === "出勤 20:01");
check("tr(3-2) in＋out→「20:01 → 01:30」", punchTimeLabel("20:01", "01:30") === "20:01 → 01:30");
check("tr(3-3) 打刻なし→null（区分のみ表示・偽の時刻を作らない）", punchTimeLabel(null, null) === null && punchTimeLabel(undefined, undefined) === null && punchTimeLabel("", "") === null);
check("tr(3-4) out のみ（orphan）→「退勤 01:30」", punchTimeLabel(null, "01:30") === "退勤 01:30");
// (4)
check("tr(4-1) hmJstOf: 2026-09-24T11:01:30Z → 20:01（JST）・日跨ぎ 16:30Z → 01:30", hmJstOf("2026-09-24T11:01:30.000Z") === "20:01" && hmJstOf("2026-09-24T16:30:00Z") === "01:30");
const rows = [
  { cast_id: "a", type: "in" as const, punched_at: "2026-09-24T11:05:00Z" },
  { cast_id: "a", type: "in" as const, punched_at: "2026-09-24T11:01:00Z" }, // 早い方＝最初の in
  { cast_id: "a", type: "out" as const, punched_at: "2026-09-24T15:00:00Z" },
  { cast_id: "a", type: "out" as const, punched_at: "2026-09-24T16:30:00Z" }, // 遅い方＝最後の out
  { cast_id: "b", type: "out" as const, punched_at: "2026-09-24T12:00:00Z" }, // orphan
  { cast_id: "c", type: "in" as const, punched_at: "2026-09-24T12:00:00Z" },
];
const m = firstInLastOut(rows);
check("tr(4-2) firstInLastOut: a＝最初の in 20:01／最後の out 01:30（並び順に依らない）", m.get("a")?.inHm === "20:01" && m.get("a")?.outHm === "01:30");
check("tr(4-3) firstInLastOut: b＝out のみ・c＝in のみ・無い cast は undefined", m.get("b")?.inHm === null && m.get("b")?.outHm === "21:00" && m.get("c")?.inHm === "21:00" && m.get("c")?.outHm === null && m.get("z") === undefined);
check("tr(4-4) 空配列＝空 Map", firstInLastOut([]).size === 0);
// (5)
const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
check("tr(5-1) shift-board: firstInLastOut で in／out を持ち、表示は punchTimeLabel", /firstInLastOut\(/.test(sb) && /punchTimeLabel\(/.test(sb));
check("tr(5-2) shift-board: 退勤ボタンは outButtonOf（出勤区分の行だけ・in なしは disabled）", /outButtonOf\(\{ canRecord/.test(sb) && /ob\.show &&/.test(sb));
check("tr(5-3) shift-board: 今日タブの表は stickyfirst（名前列を左固定）・状態列は nowrap・見出しの日付は M/D(曜)", /className="nox-tablewrap stickyfirst"/.test(sb) && /mdDowOf\(todayDate\)/.test(sb) && /whiteSpace: "nowrap" \}\}>\{\/\* ★AT2-3: 「確定」[^*]*\*\/\}\s*<span className=\{`nox-stpill/.test(sb));
// (6) ★便 AY1
check("tr(6-1) punchInAfterAtt: 出勤・遅刻・同伴で in 打刻なし＝true", punchInAfterAtt({ status: "shukkin", hasIn: false }) && punchInAfterAtt({ status: "late", hasIn: false }) && punchInAfterAtt({ status: "dohan", hasIn: false }));
check("tr(6-2) punchInAfterAtt: in 打刻が既にあれば区分の変更でも false（増やさない）", !punchInAfterAtt({ status: "shukkin", hasIn: true }) && !punchInAfterAtt({ status: "late", hasIn: true }) && !punchInAfterAtt({ status: "dohan", hasIn: true }));
check("tr(6-3) punchInAfterAtt: 休み・当欠・未記録は in を書かない", !punchInAfterAtt({ status: "off", hasIn: false }) && !punchInAfterAtt({ status: "absent", hasIn: false }) && !punchInAfterAtt({ status: null, hasIn: false }) && !punchInAfterAtt({ status: "", hasIn: false }));
check("tr(6-4) shift-board: setAtt は attendance_set 成功後（!error）に punchInAfterAtt を通して punch_proxy 'in' を呼び、失敗は attendance を戻さず警告文で残す", /if \(!error && punchInAfterAtt\(\{ status, hasIn: !!punchIO\.get\(castId\)\?\.inHm \}\)\)/.test(sb) && /supabase\.rpc\("punch_proxy", \{ p_cast_id: castId, p_type: "in", p_note: null \}\)/.test(sb) && /出勤区分は記録しました。出勤の打刻に失敗/.test(sb) && !/attendance_set[\s\S]{0,400}p_status: null/.test(sb));
// (7) ★0154 D1（裁定294-1〜4／295-1）: 打刻の修正申請の純関数（申請の初期値・引数・ack の遷移・用語）
check("tr(7-1) termOf: 雇用＝労働時間／委託・null＝稼働実績", termOf("雇用") === "労働時間" && termOf("委託") === "稼働実績" && termOf(null) === "稼働実績");
check("tr(7-2) jstIsoOf: 営業日 9/22 20:00→11:00Z・26:00→翌 17:00Z（0-47 域）・形が違えば null", jstIsoOf("2026-09-22", "20:00") === "2026-09-22T11:00:00.000Z" && jstIsoOf("2026-09-22", "26:00") === "2026-09-22T17:00:00.000Z" && jstIsoOf("2026-09-22", "48:00") === null && jstIsoOf("x", "20:00") === null);
check("tr(7-3) hmOnBizOf: 営業日基準の HH:MM（翌 2:00＝26:00）・営業日なしは JST", hmOnBizOf("2026-09-22T17:00:00Z", "2026-09-22") === "26:00" && hmOnBizOf("2026-09-22T11:30:00Z", "2026-09-22") === "20:30" && hmOnBizOf("2026-09-22T17:00:00Z") === "02:00");
const initU = requestInitOf({ kind: "in", biz: "2026-09-22", punchId: "p1", punchAtIso: "2026-09-22T11:00:00Z", shiftStartHm: "19:00" });
const initI = requestInitOf({ kind: "out", biz: "2026-09-22", punchId: null, punchAtIso: null, shiftStartHm: "19:00", shiftEndHm: "26:00" });
check("tr(7-4) requestInitOf: 既存の打刻あり＝update（punch_id・時刻＝現在値）／無し＝insert（時刻＝確定シフトの終了）・シフト無しは空", initU.mode === "update" && initU.punchId === "p1" && initU.hm === "20:00" && initI.mode === "insert" && initI.punchId === null && initI.hm === "26:00" && requestInitOf({ kind: "in", biz: "2026-09-22" }).hm === "");
const ra = requestArgsOf({ castId: "c", punchId: null, biz: "2026-09-22", kind: "in", hm: "20:30", reason: " 打刻忘れ " });
check("tr(7-5) requestArgsOf: 理由 trim・時刻→ISO・punch_id null 可／理由空・201 字・時刻不正はエラー文", ra.ok && ra.args.p_after_at === "2026-09-22T11:30:00.000Z" && ra.args.p_reason === "打刻忘れ" && ra.args.p_punch_id === null && !requestArgsOf({ castId: "c", punchId: null, biz: "2026-09-22", kind: "in", hm: "20:30", reason: " " }).ok && !requestArgsOf({ castId: "c", punchId: null, biz: "2026-09-22", kind: "in", hm: "20:30", reason: "あ".repeat(201) }).ok && !requestArgsOf({ castId: "c", punchId: null, biz: "2026-09-22", kind: "in", hm: "9:00", reason: "x" }).ok);
check("tr(7-6) ackOptionsOf: approved＝confirmed／disputed・pending／rejected＝なし", JSON.stringify(ackOptionsOf({ decision: "approved" })) === JSON.stringify(["confirmed", "disputed"]) && ackOptionsOf({ decision: "pending" }).length === 0 && ackOptionsOf({ decision: "rejected" }).length === 0);
check("tr(7-7) disputedOf: approved ∧ disputed だけ", disputedOf([{ decision: "approved", ack: "disputed" }, { decision: "approved", ack: "confirmed" }, { decision: "rejected", ack: "disputed" }]).length === 1);
check("tr(7-8) correctionSummaryOf: 更新「出勤 9/22 20:00 → 20:30」・削除「→ 取消」・新規「（追加）」", correctionSummaryOf({ kind: "in", biz_date: "2026-09-22", before_at: "2026-09-22T11:00:00Z", after_at: "2026-09-22T11:30:00Z" }) === "出勤 9/22 20:00 → 20:30" && correctionSummaryOf({ kind: "out", biz_date: "2026-09-22", before_at: "2026-09-22T17:00:00Z", after_at: null }) === "退勤 9/22 26:00 → 取消" && correctionSummaryOf({ kind: "out", biz_date: "2026-09-22", before_at: null, after_at: "2026-09-22T17:00:00Z" }) === "退勤 9/22 26:00（追加）");
const mineP = fs.readFileSync("app/mine/page.tsx", "utf8");
check("tr(7-9) 配線: shift-board＝修正ボタン（canRecord・punchRef）→PunchCorrectionModal・異議あり warn（Message kind warn）／mine＝PunchCorrectionForm＋List・用語 termOf", /<PunchCorrectionModal castId=\{corr\.castId\}/.test(sb) && /\{KIND_LABEL\[k\]\}を修正/.test(sb) && /from\("punch_corrections"\)/.test(sb) && /出退勤の修正に「異議あり」が/.test(sb) && /<PunchCorrectionForm castId=/.test(mineP) && /<PunchCorrectionList rows=/.test(mineP) && /termOf\(/.test(mineP));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-today-row OK (${pass} checks)`);
