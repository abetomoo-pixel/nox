/*
 * verify:nox-m14 — 便 M-14（2026-10-26・Agoora）: 給与→勤怠の行から直す。DB 不触（純関数＋逐語 grep）。
 *  ① 退勤記録なし（出勤側も）を押すと時刻修正（今日タブと同じ PunchCorrectionModal＝punch_correction_request＝修正前後と理由を audit）→保存で再読込（実働・時給分・日計を再計算）・今日は「勤務中」
 *  ② シフト無し出勤の行に「シフトとして確定」（既定＝打刻の出〜退・店の営業時間から選び直し・手入力）→shift_set（採用・確定）＝時給分が付く・「当日追加配置」へのリンクは置き換え
 *  読取＝shift_set／punch_correction_request は過去日を拒まない（日付の下限なし）・確定済みの期は画面で開かない（rowEditableOf）＝DB の相乗りなし
 */
import fs from "node:fs";
import { kintaiOutCellOf, noShiftSpanOptionsOf } from "../lib/nox/payroll/attendance-sheet";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

check("m14(1-1) 退のセル＝今日は「勤務中」（赤字ではない）・過去日の退勤なしは「退勤記録なし」・それ以外は時刻",
  kintaiOutCellOf({ working: true, missingOut: false, outHm: null }).kind === "working" && kintaiOutCellOf({ working: true, missingOut: false, outHm: null }).text === "勤務中"
  && kintaiOutCellOf({ working: false, missingOut: true, outHm: null }).text === "退勤記録なし" && kintaiOutCellOf({ working: false, missingOut: false, outHm: "25:30" }).text === "翌01:30");
const sh = src("lib/nox/payroll/attendance-sheet.ts");
check("m14(1-2) 行の判定＝missingOut は今日を除く・working＝今日で出あり退なし・missingIn＝過去日で退だけある",
  sh.includes("missingOut: !!d && !future && bizDate !== input.todayBiz && d.raw.in.type !== \"no_shift\"") && sh.includes("working: bizDate === input.todayBiz && !!inHm && !outHm,") && sh.includes("missingIn: !future && bizDate !== input.todayBiz && !inHm && !!outHm,"));
const kr = src("components/nox/kintai-row.tsx"), ab = src("app/(manage)/payroll/attendance-board.tsx");
check("m14(1-3) 配線＝退勤／出勤記録なしはボタン（data-kintai-fix）→PunchCorrectionModal（今日タブと同じ部品）・保存で onSaved＝再読込・確定済みの月は押せない（rowEditableOf）",
  kr.includes('data-kintai-fix="out"') && kr.includes('data-kintai-fix="in"') && ab.includes('import PunchCorrectionModal from "@/components/nox/punch-correction-modal";') && ab.includes("<PunchCorrectionModal castId={sel.castId} castName={sel.castName} biz={fix.row.bizDate} kind={fix.kind}")
  && ab.includes("onFix={canEdit && rowEditableOf(r, finalized) ? (row, kind) => setFix({ row, kind }) : null}") && ab.includes("onDone={(text) => { setFix(null); void onSaved(text); }}"));
const op = noShiftSpanOptionsOf({ bizDate: "2026-10-04", inHm: "20:10", outHm: "25:40" }, [{ dow: 0, is_closed: false, open_hm: "20:00:00", close_hm: "01:00:00" }]);
const op2 = noShiftSpanOptionsOf({ bizDate: "2026-10-05", inHm: "23:30", outHm: null }, [{ dow: 1, is_closed: true, open_hm: null, close_hm: null }]);
check("m14(2-1) シフトとして確定の候補＝打刻の出〜退（既定）・店の営業時間（翌日またぎは 25:00 の形）・定休日は営業時間を出さない・退がなければ出＋5h",
  J(op) === J([{ key: "punch", label: "打刻の出〜退", start: "20:10", end: "25:40" }, { key: "store", label: "店の営業時間", start: "20:00", end: "25:00" }]) && J(op2) === J([{ key: "punch", label: "打刻の出〜退", start: "23:30", end: "28:30" }]), { op, op2 });
const nc = src("components/nox/no-shift-confirm.tsx");
check("m14(2-2) 配線＝シフト無し出勤の行は「シフトとして確定」（当日追加配置のリンクは置き換え）→NoShiftConfirm→shift_set（confirmed・理由つき）→再読込",
  kr.includes("data-kintai-no-shift-confirm={r.bizDate}") && !kr.includes("noShiftAddHrefOf") && !kr.includes("当日追加配置</a>") && ab.includes("<NoShiftConfirm castId={sel.castId} castName={sel.castName} row={nsConfirm} bhRows={bhRows}")
  && nc.includes('rpc("shift_set", { p_id: null, p_cast_id: castId, p_date: row.bizDate, p_start_hm: s, p_end_hm: e, p_status: "confirmed", p_override_reason: "シフト無し出勤を勤怠から確定" })') && ab.includes('from("store_business_hours").select("dow, is_closed, open_hm, close_hm")'));

if (fails.length) { console.error(`verify:nox-m14 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-m14 OK ${pass} checks（M-14 勤怠の行から直す）`);
