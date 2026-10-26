/*
 * verify:nox-w10 — 便 W-10（2026-10-26）: 「準備中」の作る 8／消す 17（docs/demo/w10_junbichu.md）。DB 不触（純関数＋逐語 grep＋0186 の形）。
 *  作る: #2 要確認の自動の拾い上げ・#5 取消の承認者と理由・#7 監査ログの CSV 出力＋出力の記録（0186）・#10 特別日（0186）・#12 同伴の率バック・#15 「既定に従う」へ戻す（0186）・#21 お知らせの LINE 配信・#22 納付記録の取消（0186）
 *  消す: 画面の「準備中」は 0（コメントを除く app／components の文字列）
 */
import fs from "node:fs";
import path from "node:path";
import { auditAlertsOf, auditCsvOf, auditExportErrorOf, voidApproverReasonOf } from "../lib/nox/audit/alerts";
import { isClosedDayOf, specialDayErrorOf, specialDayLineOf } from "../lib/nox/business-hours-special";
import { lineLinkKpiOf, noticeLineResultOf, noticeLineSubjectKindsOf, noticeLineTextOf } from "../lib/nox/line/notice-line";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// 消す＝画面の「準備中」0
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));
const visible = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");
const left = [...walk("app"), ...walk("components")].filter((f) => /準備中|未実装/.test(visible(src(f))));
check("w10(0-1) 画面の「準備中」「未実装」＝0（コメントを除く・app／components の .tsx）", left.length === 0, left);

// #2 要確認
const L = (o: Partial<{ id: string; action: string; target: string; at: string; before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null; reason: string | null }>) => ({ id: "x", action: "check_void", target: "checks:1", actor_user_id: "u", at: "2026-10-26T12:00:00Z", before_json: null, after_json: null, ...o });
const al = auditAlertsOf([L({ id: "a", after_json: { total: 60000 } }), L({ id: "b", after_json: { total: 49999 } }), L({ id: "c", action: "read_cast_sensitive", at: "2026-10-26T01:30:00Z" }), L({ id: "d", action: "read_cast_sensitive", at: "2026-10-26T13:00:00Z" })]);
check("w10(2-1) 要確認＝取消の伝票額 ¥50,000 以上（49,999 は出ない）・機微情報の閲覧が 6〜17 時台（JST 10:30 は出る・22:00 は出ない）", J(al.map((a) => [a.id, a.kind])) === J([["a", "high_void"], ["c", "off_hours_sensitive"]]), al);
const ab = src("app/(manage)/audit/audit-board.tsx");
check("w10(2-2) 配線＝直近 30 日の取消・機微アクセスを読んで auditAlertsOf・件数のピル", ab.includes("setAlerts(auditAlertsOf((data ?? []) as Log[]));") && ab.includes("data-audit-alerts={alerts.length}"));
// #5
check("w10(5-1) 取消の承認者と理由＝after_json の voided_by／void_reason（無ければ note・audit の reason）・一覧の列に出す", J(voidApproverReasonOf(L({ after_json: { voided_by: "u2", void_reason: " 打ち間違い " } }))) === J({ approverUserId: "u2", reason: "打ち間違い" }) && voidApproverReasonOf(L({ reason: "理由" })).reason === "理由" && voidApproverReasonOf(L({})).approverUserId === null && ab.includes("const v = voidApproverReasonOf(l);"));
// #7
const csv = auditCsvOf([L({ id: "e", action: "flag_toggle", target: "feature_flags:notify", reason: "試験, 運用", before_json: { a: 1 } })], () => "林", () => "ACE");
check("w10(7-1) 監査ログの CSV＝BOM・見出し 8 列・JST・カンマ入りは囲む・期間の逆と目的なしは止める・出力の記録（audit_export_record）の後にダウンロード（フラグ配下）", csv.startsWith("﻿日時,操作,対象,操作担当,店,理由,変更前,変更後\r\n2026-10-26 21:00:00,flag_toggle,feature_flags:notify,林,ACE,\"試験, 運用\"") && auditExportErrorOf("2026-10-26", "2026-10-01", "x") !== null && auditExportErrorOf("2026-10-01", "2026-10-26", " ") === "利用目的を入れてください" && auditExportErrorOf("2026-10-01", "2026-10-26", "税務") === null
  && ab.includes('supabase.rpc("audit_export_record", { p_from: exFrom, p_to: exTo, p_purpose: exPurpose.trim(), p_rows: rows.length, p_format: "csv" })') && ab.includes("{mig0186On() ? (<>"), csv.slice(0, 160));
// #10
check("w10(10-1) 特別日＝一覧の 1 行・入力の検査（開店 0〜23 時・閉店は開店より後）・判定＝特別日が優先・配線（0186 フラグ配下）", specialDayLineOf({ day: "2026-12-31", kind: "closed", open_hm: null, close_hm: null, note: "年末" }) === "12/31 臨時休業（年末）" && specialDayLineOf({ day: "2027-01-01", kind: "open", open_hm: "19:00", close_hm: "26:00", note: null }) === "1/1 特別営業 19:00〜翌02:00"
  && specialDayErrorOf({ day: "2026-12-31", kind: "open", open_hm: "20:00", close_hm: "19:00" }) !== null && specialDayErrorOf({ day: "", kind: "closed", open_hm: "", close_hm: "" }) !== null && specialDayErrorOf({ day: "2026-12-31", kind: "open", open_hm: "20:00", close_hm: "26:00" }) === null
  && isClosedDayOf({ day: "x", kind: "open", open_hm: "20:00", close_hm: "25:00", note: null }, true) === false && isClosedDayOf(null, true) === true && src("app/(manage)/master/business-hours-panel.tsx").includes("{mig0186On() && storeSel && <SpecialDaysPanel storeId={storeSel} editable />}"));
// #12
const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx");
check("w10(12-1) 同伴の率バック＝2 択（円/本・率）・保存は p_dohan_back_mode／p_dohan_back_rate（0175 で解錠済み）", cs.includes('p_dohan_back_mode: dohanMode, p_dohan_back_rate: dohanMode === "rate" ? dohanRate : null,') && cs.includes("<SegSelect value={dohanMode} onChange={(v) => setDohanMode(v as BackModeRow)}") && !cs.includes('p_dohan_back_mode: "per_count", p_dohan_back_rate: null,'));
// #15
const ff = src("app/(manage)/master/feature-flags-panel.tsx");
check("w10(15-1) 「既定に従う」へ戻す＝flag_unset（0186 フラグ配下・false の間は上書き中の店に 3 択を出さない）", ff.includes('supabase.rpc("flag_unset", { p_key: key, p_store_id: storeId,') && ff.includes("threeWay={mig0186On() || r === null}"));
// #21
check("w10(21-1) お知らせの LINE＝対象→line_links の種類・本文「【店名】タイトル」・結果の文言・KPI（連携／未連携）・掲載の後に /api/line/notice",
  J(noticeLineSubjectKindsOf("all")) === J(["cast", "membership"]) && J(noticeLineSubjectKindsOf("staff")) === J(["membership"]) && noticeLineTextOf({ storeName: "ACE", title: " 休業 ", body: "本文" }) === "【ACE】休業\n\n本文"
  && noticeLineResultOf({ recipients: 3, sent: 2, failed: 1, skipped: 0 }) === "LINE を 2 人に送りました（1 人は送れませんでした）" && noticeLineResultOf({ recipients: 2, sent: 0, failed: 0, skipped: 0, demo: true }).includes("デモ")
  && J(lineLinkKpiOf(["c1", "c2"], ["m1"], [{ subject_kind: "cast", subject_id: "c1" }, { subject_kind: "membership", subject_id: "m9" }])) === J({ linked: 1, unlinked: 2 })
  && src("app/(manage)/notices/notices-board.tsx").includes('await fetch("/api/line/notice", { method: "POST"') && src("app/api/line/notice/route.ts").includes('if (!["owner", "manager"].includes(String(role))) return NextResponse.json({ error: "forbidden" }, { status: 403 });'));
// #22
const pt = src("app/(manage)/payroll/payment-tax-panel.tsx");
check("w10(22-1) 納付記録の取消＝理由必須・withholding_payment_cancel（0186 フラグ配下）", pt.includes('supabase.rpc("withholding_payment_cancel", { p_target_month: r.target_month, p_tax_category: r.tax_category, p_reason: reason.trim() })') && pt.includes("{mig0186On() && <button"));
// 0186 の形
const P = "supabase/migrations/0186_w10_make.sql"; const m = fs.existsSync(P) ? src(P) : "";
check("w10(0186) 0186＝単一トランザクション・貼り先証明・表 store_special_days（RLS・revoke all→select）・RPC 5 本（authenticated）・判定 2 本が特別日を先に見る（起草ファイルがあるときだけ）", m === "" || (m.includes("\nbegin;\nselect 'nox-project-proof', count(*) from public.orgs;") && m.includes("revoke all on table public.store_special_days from public, anon, authenticated;") && m.includes("grant select on table public.store_special_days to authenticated;")
  && ["set_store_special_day(uuid, date, text, text, text, text)", "remove_store_special_day(uuid, date)", "flag_unset(text, uuid, text)", "withholding_payment_cancel(text, text, text)", "audit_export_record(date, date, text, integer, text)"].every((f) => m.includes(`grant execute on function public.${f} to authenticated;`))
  && (m.match(/if v_sp is not null then return v_sp = 'closed'; end if;/g) ?? []).length === 2));
// フラグ
check("w10(flag) MIG_0186_APPLIED＝false（mjs と同値）", /export const MIG_0186_APPLIED = false;/.test(src("lib/nox/rules-0175/flag.ts")) && /export const MIG_0186_APPLIED = false;/.test(src("scripts/demo/rules-0175-flag.mjs")));

if (fails.length) { console.error(`verify:nox-w10 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-w10 OK ${pass} checks（W-10 準備中の作る 8・消す 17）`);
