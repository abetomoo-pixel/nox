/*
 * verify:nox-mine-recon — 便 M2（2026-10-01・裁定326 本体＝/mine の再構成）の係留（純関数＋描画＋配線 grep・DB 不触・env 不要）。
 *   npm run verify:nox-mine-recon。f0 末尾に連結。
 *
 *  (1) quota（326-3）: quotaAxesOf＝目標 NULL／0 の項目は出ない・実績／目標・達成率 %（切捨て・100 超も出す・バーは 100 で止める）・達成判定／quotaMonthOptionsOf 今月・翌月（月初 date）／
 *      quotaFormOf（NULL＝空欄）／quotaArgsOf（空欄＝NULL・負数／小数／文字は err・カンマ除去）／quotaFormEquals／文言 2 種
 *  (2) 勤怠（326-5）: monthAttendanceRowsOf＝打刻のある日だけ・新しい日が先・in／out は営業日の 0-47 域（翌 2:00＝26:00）・実働は dayWorkedHours（確定シフトのある日だけ・退勤なしは 0）／hoursLabelOf／todayInOutLabelOf／closeHmOf 既定 25:00
 *  (3) 未読（326-6）: unreadIdsOf／unreadCountOf／noticeNavLabelOf（0 は「お知らせ」・n は「お知らせ（n）」）
 *  (4) 給与明細 3 モード（326-1）: PayslipSlip compact＝期ヘッダー＋手取りのみ（支給／控除／総支給の行なし）・通常＝支給の行あり・/mine は 'off' でカードごと出さず 'net_only' で compact
 *  (5) 配線（逐語 grep）: /mine page＝2 カード削除（SimulatorPanel／今月のバック／check_cast_backs／sim-data なし）・勤怠一覧（monthAttendanceRowsOf・details・mdLabelOf）・当日の出勤／退勤・
 *      月の打刻 1 本から当日分を絞る（旧 todayPunches fetch なし）・shifts は当月初から 1 本／norm-card＝「目標を設定」なし・quotaAxesOf／route＝cast_quotas を読み cast_norms・loadPunch を読まない・norm-set route は無い／
 *      layout＝未読数（notices・cast_notice_reads・noticeNavLabelOf）／notices page＝notice_mark_read＋「新着」／casts-board＝set_cast_quota（p_month＝quotaMonth・空欄 NULL）・今月／翌月・MoneyInput（売上）・Message／rpc-err 'bad quota'／'bad month'
 *  逆テスト 1 本（手動・1 回）: quotaAxesOf の `target <= 0` を `target < 0` にする→mr(1-1) 赤・戻して緑。
 */
import fs from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PayslipSlip from "../components/payslip-slip";
// tsx は tsconfig の jsx:"preserve" を classic 変換で落とすため、部品（.tsx）の描画に React をグローバルへ置く（suite 内のみ・app 側は非改変＝payroll-adjust と同型）
(globalThis as { React?: typeof React }).React = React;
import { QUOTA_EMPTY_NOTE, QUOTA_FORM_EMPTY, QUOTA_LABEL, QUOTA_PROGRESS_NOTE, quotaArgsOf, quotaAxesOf, quotaFmt, quotaFormEquals, quotaFormOf, quotaMonthOptionsOf } from "../lib/nox/mine/quota";
import { ATTENDANCE_MONTH_NOTE, closeHmOf, hoursLabelOf, monthAttendanceRowsOf, todayInOutLabelOf } from "../lib/nox/mine/attendance-month";
import { noticeNavLabelOf, unreadCountOf, unreadIdsOf, NOTICE_NEW_BADGE } from "../lib/nox/mine/notice-unread";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// (1) quota
const ax = quotaAxesOf({ hon: 10, jonai: null, dohan: 0, sales: 300000 }, { hon: 12, jonai: 5, dohan: 1, sales: 150000 });
check("mr(1-1) quotaAxesOf: NULL／0 の項目は出ない・本指名 12/10＝120%（バー 100）達成・売上 150,000/300,000＝50% 未達・並びは hon→sales", ax.length === 2 && ax[0].key === "hon" && ax[0].rate === 120 && ax[0].pct === 100 && ax[0].done && ax[1].key === "sales" && ax[1].rate === 50 && ax[1].pct === 50 && !ax[1].done, JSON.stringify(ax));
check("mr(1-2) quotaAxesOf: 全項目未設定／null／undefined → []・文言 2 種・quotaFmt（件・¥）", quotaAxesOf(null, { hon: 1, jonai: 1, dohan: 1, sales: 1 }).length === 0 && quotaAxesOf({ hon: null, jonai: null, dohan: null, sales: null }, { hon: 1, jonai: 1, dohan: 1, sales: 1 }).length === 0
  && QUOTA_EMPTY_NOTE === "店で目標が設定されるとここに進捗が出ます" && QUOTA_PROGRESS_NOTE.startsWith("※進捗の目安表示です") && quotaFmt("hon", 3) === "3件" && quotaFmt("sales", 1500) === "¥1,500" && Object.keys(QUOTA_LABEL).length === 4);
const mo = quotaMonthOptionsOf("2026-12");
check("mr(1-3) quotaMonthOptionsOf: 今月（月初 date）／翌月（年またぎ）", mo.length === 2 && mo[0][0] === "2026-12-01" && mo[0][1] === "今月（2026-12）" && mo[1][0] === "2027-01-01" && mo[1][1] === "翌月（2027-01）");
const f = quotaFormOf({ hon: 10, jonai: null, dohan: 0, sales: 300000 });
const a1 = quotaArgsOf({ hon: "10", jonai: "", dohan: "0", sales: "300,000" });
const a2 = quotaArgsOf({ hon: "-1", jonai: "", dohan: "", sales: "" });
const a3 = quotaArgsOf({ hon: "", jonai: "1.5", dohan: "", sales: "" });
const a4 = quotaArgsOf(QUOTA_FORM_EMPTY);
check("mr(1-4) quotaFormOf（NULL＝空欄・0 は '0'）／quotaArgsOf（空欄＝NULL・カンマ除去・負数／小数は err・全欄空は全 NULL）／quotaFormEquals", JSON.stringify(f) === JSON.stringify({ hon: "10", jonai: "", dohan: "0", sales: "300000" })
  && a1.ok && JSON.stringify(a1.args) === JSON.stringify({ p_hon: 10, p_jonai: null, p_dohan: 0, p_sales: 300000 }) && !a2.ok && a2.err.includes("本指名") && !a3.ok && a3.err.includes("場内") && a4.ok && Object.values(a4.args).every((v) => v === null)
  && quotaFormEquals(f, { ...f, sales: " 300000 " }) && !quotaFormEquals(f, { ...f, hon: "11" }), JSON.stringify([f, a1, a2, a3]));

// (2) 勤怠
const P = (d: string, hm: string, type: "in" | "out") => ({ punched_at: `${d}T${hm}:00+09:00`, type });
const rows = monthAttendanceRowsOf({
  punches: [P("2026-09-10", "20:00", "in"), P("2026-09-11", "02:00", "out"), P("2026-09-12", "19:30", "in"), P("2026-09-14", "21:00", "in"), P("2026-09-14", "23:00", "out")],
  shifts: [{ date: "2026-09-10", start_hm: "20:00", end_hm: "25:00" }],
  cutoffHm: "06:00", closeHm: "25:00",
});
check("mr(2-1) monthAttendanceRowsOf: 打刻のある 3 日・新しい日が先・9/10 は in 20:00／out 26:00（翌 2:00 の 0-47 域）実働 6h（確定シフトあり）・9/12 は退勤なし 0・9/14 はシフトなし＝実働 0（in 21:00／out 23:00 は出る）",
  rows.length === 3 && rows[0].bizDate === "2026-09-14" && rows[0].inHm === "21:00" && rows[0].outHm === "23:00" && rows[0].hours === 0
  && rows[1].bizDate === "2026-09-12" && rows[1].inHm === "19:30" && rows[1].outHm === null && rows[1].hours === 0
  && rows[2].bizDate === "2026-09-10" && rows[2].inHm === "20:00" && rows[2].outHm === "26:00" && rows[2].hours === 6, JSON.stringify(rows));
check("mr(2-2) hoursLabelOf（6→6h・5.25→5.3h・0→—）／todayInOutLabelOf（null→出勤 —／退勤 —）／closeHmOf 既定 25:00・設定優先／注記", hoursLabelOf(6) === "6h" && hoursLabelOf(5.25) === "5.3h" && hoursLabelOf(0) === "—"
  && todayInOutLabelOf(null) === "出勤 —／退勤 —" && todayInOutLabelOf({ inHm: "20:00", outHm: null }) === "出勤 20:00／退勤 —" && closeHmOf({}) === "25:00" && closeHmOf({ close_hm: "24:00" }) === "24:00" && closeHmOf(null) === "25:00" && ATTENDANCE_MONTH_NOTE.includes("給与と同じ計算"));

// (3) 未読
check("mr(3-1) unreadIdsOf／unreadCountOf／noticeNavLabelOf（0→お知らせ・2→お知らせ（2））・NOTICE_NEW_BADGE", JSON.stringify(unreadIdsOf(["a", "b", "c"], ["b"])) === JSON.stringify(["a", "c"]) && unreadCountOf(["a", "b"], ["a", "b", "x"]) === 0 && unreadCountOf([], []) === 0
  && noticeNavLabelOf(0) === "お知らせ" && noticeNavLabelOf(2) === "お知らせ（2）" && NOTICE_NEW_BADGE === "新着");

// (4) 給与明細 3 モード
const slip = { period: "2026-09", net: 123456, breakdown_json: { pay: { wage: 3000, wHours: 10, timePay: 30000, gross: 50000, withholding: 5000, taxMode: "委託" }, extras: [] } };
const compactHtml = renderToStaticMarkup(createElement(PayslipSlip, { slip, compact: true }));
const fullHtml = renderToStaticMarkup(createElement(PayslipSlip, { slip }));
check("mr(4-1) PayslipSlip compact: 期・区分バッジ・手取り ¥123,456 だけ（支給／控除／総支給の行なし・nox-payslip-compact）／通常は支給の行と総支給あり",
  compactHtml.includes("2026-09") && compactHtml.includes("委託") && compactHtml.includes("手取り") && compactHtml.includes("¥123,456") && !compactHtml.includes("支給") && !compactHtml.includes("総支給") && compactHtml.includes("nox-payslip-compact")
  && fullHtml.includes("支給") && fullHtml.includes("総支給") && fullHtml.includes("¥123,456") && !fullHtml.includes("nox-payslip-compact"), compactHtml.slice(0, 300));

// (5) 配線
const src = (p: string) => fs.readFileSync(p, "utf8");
/** コメント（// 行・ブロック・JSX コメント）を除いたコード部分＝「無いこと」の pin はコード本体で見る（説明コメントに旧語が残るのは可） */
const codeOf = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");
const page = src("app/mine/page.tsx"), card = src("app/mine/norm-card.tsx"), route = src("app/api/mine/norm-progress/route.ts"), layout = src("app/mine/layout.tsx"), notices = src("app/mine/notices/page.tsx"), cb = src("app/(manage)/casts/casts-board.tsx");
const pageC = codeOf(page), cardC = codeOf(card), routeC = codeOf(route);
check("mr(5-1) /mine page: 2 カード削除（SimulatorPanel／今月のバック／check_cast_backs／sim-data＝コード部分に 0）・勤怠一覧（monthAttendanceRowsOf・<details・mdLabelOf・hoursLabelOf）・当日の出勤／退勤（todayInOutLabelOf）・月の打刻 1 本から当日分を絞る・shifts は当月初から 1 本（.limit(7) なし）",
  !pageC.includes("SimulatorPanel") && !pageC.includes("今月のバック（") && !pageC.includes("check_cast_backs") && !pageC.includes("sim-data") && page.includes("monthAttendanceRowsOf({") && page.includes("<details") && page.includes("mdLabelOf(r.bizDate)") && page.includes("hoursLabelOf(r.hours)")
  && page.includes("todayInOutLabelOf(todayRow)") && page.includes('.gte("punched_at", monthStartIso).lt("punched_at", monthEndIso)') && !page.includes('.gte("punched_at", bizStartIso)') && page.includes('.gte("date", `${month}-01`)\n    .order("date");') && !page.includes(".limit(7);") && (page.match(/from\("punches"\)/g) ?? []).length === 2);
check("mr(5-2) /mine page: payslip_visibility 'off' でカードごと出さない・'net_only' は compact・注記の出し分け・廃棄済みはカードの外・drink_claim／ranking の出し分けは不変",
  page.includes('{ms.payslip_visibility !== "off" && (') && page.includes('compact={ms.payslip_visibility === "net_only"}') && page.includes('ms.payslip_visibility === "net_only" ? "※手取りと期のみの表示です') && page.includes("{discardYmd && <p className=\"nox-pstate\"") && page.includes("{ms.drink_claim && <DrinkClaimForm") && page.includes("{ms.ranking && myRank && ("));
check("mr(5-3) norm-card: 「目標を設定」なし・quotaAxesOf・QUOTA_EMPTY_NOTE／route: cast_quotas を読む・cast_norms／loadPunch／set_cast_norm_self を読まない（コード部分）／norm-set route は無い", !cardC.includes("目標を設定") && !cardC.includes("norm-set") && card.includes("quotaAxesOf(data.quota, data.actual)") && card.includes("QUOTA_EMPTY_NOTE")
  && route.includes('from("cast_quotas").select("hon, jonai, dohan, sales")') && !routeC.includes("cast_norms") && !routeC.includes("loadPunch") && !routeC.includes("set_cast_norm_self") && !fs.existsSync("app/api/mine/norm-set/route.ts"));
check("mr(5-4) layout: notices・cast_notice_reads を読み noticeNavLabelOf／notices page: 未読分に notice_mark_read・開いた時点の未読に「新着」", layout.includes('supabase.from("notices").select("id")') && layout.includes('supabase.from("cast_notice_reads").select("notice_id")') && layout.includes("label: noticeNavLabelOf(unread)")
  && notices.includes('supabase.rpc("notice_mark_read", { p_notice_id: id })') && notices.includes("unreadIds.has(n.id as string) && <span") && notices.includes("{NOTICE_NEW_BADGE}"));
check("mr(5-5) casts-board: 今月のノルマ節＝set_cast_quota（p_store_id／p_cast_id／p_month＝quotaMonth・quotaArgsOf）・今月／翌月（quotaMonthOptionsOf）・売上は MoneyInput・成否は Message・和文 rpcErrJa／rpc-err 'bad quota'／'bad month'",
  cb.includes('supabase.rpc("set_cast_quota", { p_store_id: c.store_id, p_cast_id: c.id, p_month: quotaMonth, ...a.args })') && cb.includes("quotaMonthOptionsOf(month)") && cb.includes('ariaLabel="売上の目標"') && cb.includes("<h3 style={{ ...secTitle, margin: \"0 0 6px\" }}>今月のノルマ</h3>") && cb.includes("{quotaMsg && <Message kind={quotaMsg.kind}")
  && rpcErrJa("bad quota") === "目標は 0 以上の整数で入力してください（空欄＝目標なし）" && rpcErrJa("bad month").startsWith("月の指定が正しくありません"));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-mine-recon OK (${pass} checks)`);
console.log("マイページ再構成(便 M2・裁定326): quota 達成率・月選択・入力検証 / 勤怠一覧（dayWorkedHours）・当日時刻 / 未読数 / 明細 3 モード（compact） / 配線（page・norm-card・route・layout・notices・casts-board）");
