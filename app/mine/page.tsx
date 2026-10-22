import Link from "next/link";
import KintaiRow, { KintaiHead } from "@/components/nox/kintai-row"; // ★便 SH-UI-c C-2 ④
import { attendanceDayRowsOf, attendanceSummaryOf } from "@/lib/nox/payroll/attendance-sheet";
import { payTimeBasisOf } from "@/lib/nox/payroll/time-basis";
import { createClient } from "@/lib/supabase/server";
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date";
import PayslipSlip from "@/components/payslip-slip";
import { okuriModeOf } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）
import { wageNowOf } from "@/lib/nox/cast/wage-now"; // ★便 P174 T-5（GV-55／56）
import { mineCurrentWageOf } from "@/lib/nox/mine/wage-server"; // ★便 X13-H H-8: 今期の時給（一覧・詳細と同じ値・文言・根拠）
import { ATTENDANCE_MONTH_NOTE, closeHmOf, hoursLabelOf, monthAttendanceRowsOf, todayInOutLabelOf } from "@/lib/nox/mine/attendance-month"; // ★裁定326-5（便 M2-1）: 勤怠時刻＋当月一覧（実働は dayWorkedHours）
import { nextPeriodOf } from "@/lib/nox/payroll/attention";
import { mdLabelOf } from "@/lib/nox/payroll/finalize-guard";
import ReservationRequestCard from "./reservation-request-card"; // ★裁定326-4（便 M3-2）: 予約申請（店設定 reservation_request ON のときだけ）
import ScheduleCard, { type ScheduleTab } from "./schedule-card"; // ★便 X13-G W-22: 出勤予定（今月／来月・確定と確認待ち）
import { daysCountOf, daysNormLineOf, scheduleOf, type ScheduleShift, type ScheduleWish } from "@/lib/nox/mine/schedule";
import { daysNormTargetsOf } from "@/lib/nox/mine/days-norm-server";
import { castRankingModeOf } from "@/lib/nox/payroll/cast-sales"; // ★裁定346: off／self／top
import * as t from "@/lib/nox/ui/theme";
import PunchActions from "./punch-actions";
import PunchCorrectionForm from "./punch-correction-form"; // ★0154 D1
import PunchCorrectionList from "./punch-correction-list"; // ★0154 D1
import { termOf, type CorrectionRow } from "@/lib/nox/shift/punch-correction";
import PhotoCard from "./photo-card";
import ContractAckGate from "./contract-ack-gate"; // ★0162 ★4（裁定326 追補7-6・便 M5-2）: 契約確認（店 ON かつ未記録のときだけ最上部）
import { contractAckGateOf } from "@/lib/nox/mine/contract-ack";
import AttendanceForm from "./attendance-form";
import { mineReportStateOf } from "@/lib/nox/shift/cast-report"; // ★便 X13-H H-17 ③
import NormCard from "./norm-card";
import DrinkClaimForm from "./drink-claim-form";
import PrintPayslipButton from "./print-payslip-button";
import { isSectionOn, type StoreSettings } from "@/lib/nox/store-systems"; // ★裁定269: 使う制度の出し分け
import { mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定326-8（便 M1-3）: mine_settings の出し分け（既存の自店読取に相乗り＝新規 fetch 0）
import { punchHeadOf, punchStateOf } from "@/lib/nox/shift/punch-state";
import { castPunchOffOf, opsProfileOf } from "@/lib/nox/store/ops-profile"; // ★0164（便 W5-2b）: punch_methods.self の出し分け // ★裁定326 追補3（便 M1-4）: 打刻カードの 3 状態（todayPunches から＝新規 fetch 0）

export const dynamic = "force-dynamic";

/** 店設定の営業日切替時刻（stores.settings_json.biz_cutoff_hm・既定 '06:00'）。
 *  ★mig0106（起票#14）: cast の RLS でも自店1行は読める（stores_select の id=auth_store_id() 腕）。
 *    経路は app/(manage)/dashboard/page.tsx と同型。 */
async function loadCutoff(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
  return typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
}

const yen = (n: number) => "¥" + n.toLocaleString();
const ATT_LABEL: Record<string, string> = {
  shukkin: "出勤", dohan: "同伴", late: "遅刻連絡", off: "休み", absent: "当欠連絡",
};

// cast マイページ。SELECT はパターン1テーブルのみ（RLS が自分の行だけ返す＝可視性の物理保証）。
export default async function MinePage() {
  const supabase = await createClient();
  const cutoff = await loadCutoff(supabase);
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const month = bizToday.slice(0, 7);

  // ★裁定326-2（便 M2-1）: 「今月のバック」「報酬シミュレーター」の 2 カードは削除（check_cast_backs の読取と sim-data の読取も外した）

  // ★0154 D1（裁定294／295）: 自分の cast 行（id・employment＝用語）・修正申請（RLS 本人・表が無ければ空）
  const { data: meCast } = await supabase.from("casts").select("id, employment").limit(1).maybeSingle();
  const term = termOf((meCast?.employment as string | null) ?? null);
  const { startIso: bizStartIso, endIso: bizEndIso } = bizDateRange(bizToday, cutoff);
  // ★裁定326-5（便 M2-1）: 当月の自分の打刻を 1 本で読む（勤怠一覧）→ 当日分はここから絞る（旧 todayPunches の fetch と置換＝新規 fetch 0）
  const nextMonth = nextPeriodOf(month);
  const { startIso: monthStartIso } = bizDateRange(`${month}-01`, cutoff);
  const { startIso: monthEndIso } = bizDateRange(`${nextMonth}-01`, cutoff);
  const { data: monthPunches } = await supabase.from("punches").select("id, type, punched_at").gte("punched_at", monthStartIso).lt("punched_at", monthEndIso).order("punched_at");
  const todayPunches = ((monthPunches ?? []) as { id: string; type: string; punched_at: string }[]).filter((p) => Date.parse(p.punched_at) >= Date.parse(bizStartIso) && Date.parse(p.punched_at) < Date.parse(bizEndIso));
  const { data: corrRows } = await supabase.from("punch_corrections").select("id, cast_id, punch_id, biz_date, kind, before_at, after_at, reason, decision, decide_reason, ack, ack_at, requested_at, decided_at").order("requested_at", { ascending: false }).limit(20);

  // 最終打刻(自分の行のみ)
  const { data: punches } = await supabase
    .from("punches")
    .select("type, punched_at")
    .order("punched_at", { ascending: false })
    .limit(1);
  const last = punches?.[0];

  // 直近の確定シフト（★326-5: 当月初からまとめて読み、直近 7 件はここから絞る・当月の確定分は勤怠一覧の実働計算に使う＝新規 fetch 0）
  const { data: shiftsAll } = await supabase
    .from("shifts")
    .select("id, date, start_hm, end_hm, status, wish_id") // ★SD V2-3: id 追加（shift_cast_confirm の対象特定）・★裁定345: wish_id（希望由来の印）
    .gte("date", `${month}-01`)
    .order("date");
  type ShiftLite = { id: string; date: string; start_hm: string; end_hm: string; status: string; wish_id: string | null };
  const monthConfirmedShifts = ((shiftsAll ?? []) as ShiftLite[]).filter((s) => s.status === "confirmed" && s.date < `${nextMonth}-01`);

  // 今月の勤怠
  const { data: att } = await supabase
    .from("attendance")
    .select("date, status, eta, source, reason, updated_at") // ★便 X13-H H-17 ③: 連絡の状態（本人＝self／店が記録）★便 SH-UI-c C-2 ④: 勤怠表の連絡時刻・備考
    .gte("date", `${month}-01`)
    .order("date", { ascending: false })
    .limit(62);

  // 今月の出勤ボーナス（attendance_incentives＝パターン3・店の published を可視）。
  // 受給は当日の確定シフト出勤（final∈{ok,late}）が条件・確定額は給与確定時。pooled は受給者数で変動＝暫定表示。
  const { data: incentives } = await supabase
    .from("attendance_incentives")
    .select("biz_date, amount_mode, amount")
    .eq("status", "published")
    .gte("biz_date", `${month}-01`)
    .order("biz_date", { ascending: false })
    .limit(20);

  // 確定済み給与明細（payslips＝金額系・cast 本人可視）。breakdown_json.ar の売掛天引き額を表示（F2e-1）。
  const { data: slips } = await supabase
    .from("payslips")
    .select("period, net, breakdown_json")
    .order("period", { ascending: false })
    .limit(6);
  // ★裁定414（S-4 ④）: 凍結明細の「送り」行を方式で読み分ける＝breakdown.okuri の transport_id → transport.mode（自分の行＝RLS パターン1・0177 前は mode 列が無い＝'actual' 扱い）
  const okuriIds = [...new Set((slips ?? []).flatMap((s) => (((s.breakdown_json as { okuri?: { transport_id?: string }[] } | null)?.okuri ?? []).map((e) => e.transport_id).filter((x): x is string => typeof x === "string"))))];
  const { data: trModes } = okuriIds.length > 0 ? await supabase.from("transport").select("*").in("id", okuriIds) : { data: null };
  const okuriModes: Record<string, string> = Object.fromEntries(((trModes ?? []) as { id: string; mode?: string | null }[]).map((r) => [r.id, r.mode ?? "actual"]));
  // breakdown_json の解釈と1件描画は共有 PayslipSlip へ移設（D2＝表示の移設のみ・数値ロジック非改変）。
  // ★裁定348 追補1（便 DM-1 D-2b）: 期限付き保証時給の印＝今日を含む cast_plan 行（自分の行＝RLS）の overrides_json.guarantee が true なら「保証時給（〜MM/DD）¥X」。期限切れは何も出さない（基本時給に戻る）
  const { data: guaRows } = meCast
    ? await supabase.from("cast_plan").select("overrides_json, valid_from, valid_to").eq("cast_id", meCast.id as string).lte("valid_from", bizToday).or(`valid_to.is.null,valid_to.gte.${bizToday}`).limit(3)
    : { data: null };
  // ★便 P174 T-5（GV-55／56・R-11 (c)）: 印は一覧カード・詳細と同じ wageNowOf の guarantee（今日を含む保証行）
  const guaNow = wageNowOf({ planBase: null, rows: ((guaRows ?? []) as { overrides_json: Record<string, unknown> | null; valid_from: string; valid_to: string | null }[]), today: bizToday }).guarantee;
  const guaLabel = guaNow ? `保証時給 ${yen(guaNow.amount)}${guaNow.to ? `（${Number(guaNow.to.slice(5, 7))}/${Number(guaNow.to.slice(8, 10))} まで）` : ""}` : null;

  // 段M2: 所属店（ヘッダ表示用）。cast の可視 store は自店のみ（RLS）＝先頭行が自店（/mine/ranking と同型）。
  const { data: myStores } = await supabase.from("stores").select("id, name, settings_json, punch_methods").limit(1); // ★裁定269: sys_* は既存の自店読取に列を足すだけ・★0164（便 W5-2b）: punch_methods（本人打刻の出し分け）
  const myStore = myStores?.[0];
  const mineWage = meCast && myStore ? await mineCurrentWageOf(supabase, meCast.id as string, myStore.id as string, bizToday.slice(0, 7), bizToday) : null; // ★便 X13-H H-8
  const ms = mineSettingsOf(myStore?.settings_json); // ★326-8: drink_claim／punch_correction_request／ranking の出し分け（reservation_request の申請カードは M3）
  // ★0162 ★4（便 M5-2）: 契約確認の要否＝店の contract_ack が ON のときだけ cast_contract_ack_needed()（cast セルフ・非ゲート）。読めなければ出さない（止めない）
  const { data: ackNeeded } = ms.contract_ack ? await supabase.rpc("cast_contract_ack_needed") : { data: null };
  const showContractAck = contractAckGateOf(ms.contract_ack, typeof ackNeeded === "boolean" ? ackNeeded : null);
  const ps = punchStateOf((todayPunches ?? []) as { type: string; punched_at: string }[]); // ★326 追補3: 当日営業日の自分の打刻 → 未出勤／出勤中／退勤済み
  // ★便 SH-UI-c C-2 ④: 「今月の勤怠」＝給与と同じ計算の表（lib/nox/payroll/attendance-sheet・自分の行＝RLS）。送りは transport の自分の行（mode は 0177 後）
  const { data: mineTransport } = await supabase.from("transport").select("*").gte("biz_date", `${month}-01`);
  const kintaiRows = attendanceDayRowsOf({
    punches: ((monthPunches ?? []) as { id: string; type: string; punched_at: string }[]).map((p) => ({ id: p.id, punched_at: p.punched_at, type: p.type as "in" | "out" })),
    shifts: monthConfirmedShifts.map((s) => ({ date: s.date, start_hm: s.start_hm, end_hm: s.end_hm })),
    attendance: ((att ?? []) as { date: string; status: string; eta: string | null; source: string | null; reason?: string | null; updated_at?: string | null }[]).map((a) => ({ date: a.date, status: a.status as "shukkin" | "dohan" | "late" | "off" | "absent", eta: a.eta, source: a.source, reason: a.reason ?? null, updated_at: a.updated_at ?? null })),
    corrections: ((corrRows ?? []) as { punch_id: string | null; biz_date: string; kind: "in" | "out"; before_at: string | null; after_at: string | null; reason: string; decision: string; decided_at: string | null }[]).map((c) => ({ ...c, decided_by_name: null })),
    transports: ((mineTransport ?? []) as Record<string, unknown>[]).map((tr) => ({ biz_date: tr.biz_date as string, amount: tr.amount as number, mode: (tr.mode as string | null | undefined) ?? null, status: tr.status as string })),
    cutoffHm: cutoff, closeHm: closeHmOf(myStore?.settings_json), payTimeBasis: payTimeBasisOf((myStore?.settings_json ?? null) as Record<string, unknown> | null, `${month}-01`), todayBiz: bizToday,
  }).filter((r) => !r.future && (r.inHm || r.shift || r.absent || r.corrections.length > 0 || r.okuri.n > 0)).reverse();
  const kintaiSum = attendanceSummaryOf(kintaiRows, bizToday);
  // ★326-5: 当月の勤怠一覧（日付・出勤・退勤・実働＝dayWorkedHours・確定シフトのある日だけ時間が出る）と当日の出勤・退勤時刻
  const attRows = monthAttendanceRowsOf({
    punches: ((monthPunches ?? []) as { type: string; punched_at: string }[]).map((p) => ({ punched_at: p.punched_at, type: p.type as "in" | "out" })),
    shifts: monthConfirmedShifts.map((s) => ({ date: s.date, start_hm: s.start_hm, end_hm: s.end_hm })),
    cutoffHm: cutoff, closeHm: closeHmOf(myStore?.settings_json),
  });
  const todayRow = attRows.find((r) => r.bizDate === bizToday) ?? null;
  // ★0156（起票85・便 V-7）: マイナンバーの廃棄状況（cast_mynumber_discard_status＝cast 本人・値は返さない・audit なし）。廃棄後だけ「廃棄済み YYYY-MM-DD」を出す
  const { data: discardRows } = meCast ? await supabase.rpc("cast_mynumber_discard_status", { p_cast_id: meCast.id as string }) : { data: null };
  const discard = ((discardRows ?? []) as { mynumber_deleted_at: string | null; mynumber_deletion_method: string | null; has_mynumber: boolean }[])[0];
  const discardYmd = discard?.mynumber_deleted_at ? new Date(discard.mynumber_deleted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) : null;

  // 段M2: 指名ランキングの★自分の行だけ（get_cast_ranking＝金額列を構造的に持たない既存 RPC・
  //   /mine/ranking が既に使っている経路と同一）。他キャストの数字は一切描画しない（順位と母数のみ）。
  const { data: rankAll } = myStore
    ? await supabase.rpc("get_cast_ranking", { p_store_id: myStore.id as string, p_period: month })
    : { data: null };
  type MyRank = { rank: number; hon_count: number; jonai_count: number; dohan_count: number; is_self: boolean };
  const rankRows = (rankAll ?? []) as MyRank[];
  const myRank = rankRows.find((r) => r.is_self) ?? null;

  // 自分指名の予約（F3a-3・read-only）。RLS が cast_id=auth_cast_id() の行のみ返す＝可視性の物理保証（段19-11）。
  // 表示は今営業日（06:00 起点）以降の booked のみ＝cast は予約に行動できないため過去/確定状態は出さない。
  // 客名は customers embed（cast は担当客のみ可視＝customers RLS）→不可視/フリー予約は guest_name フォールバック。
  const { data: rsv } = await supabase
    .from("reservations")
    .select("id, reserved_at, guest_name, party_size, nom_type, memo, customers(name)")
    .eq("status", "booked")
    .gte("reserved_at", `${bizToday}T06:00:00+09:00`)
    .order("reserved_at", { ascending: true });
  type RsvCustomer = { name: string } | { name: string }[] | null;
  // 名前が取れたら「◯◯ 様」・取れない（担当外客=RLS 不可視かつ guest_name なし）は敬称を重ねず「お客様」。
  const rsvName = (customers: RsvCustomer, guest: string | null): string => {
    const c = Array.isArray(customers) ? customers[0] : customers;
    const name = c?.name ?? guest;
    return name ? (/様$/.test(name) ? name : `${name} 様`) : "お客様"; // ★便 X13-G live: 顧客名が「様」で終わるときは足さない（「M様 様」）
  };
  const rsvWhen = (iso: string): string =>
    new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };

  // ★便 X13-G W-22: 出勤予定（今月／来月）＝自分のシフト（shiftsAll＝今月初から）と提出済みの希望（自分の行＝RLS）・出勤ノルマ（店が出勤日数の軸を採用＋ノルマがあるときだけ）
  const nextNext = nextPeriodOf(nextMonth);
  const { data: wishRows } = await supabase.from("shift_wishes").select("id, date, start_hm, end_hm, status, kind").gte("date", `${month}-01`).lt("date", `${nextNext}-01`);
  const workedThisMonth = new Set(((monthPunches ?? []) as { type: string; punched_at: string }[]).filter((x) => x.type === "in").map((x) => bizDateOf(x.punched_at, cutoff)).filter((d) => d.slice(0, 7) === month));
  const daysTargets = meCast?.id && myStores?.[0]?.id ? await daysNormTargetsOf(meCast.id as string, myStores[0].id as string, [month, nextMonth], bizToday) : { [month]: null, [nextMonth]: null };
  const scheduleTabs: ScheduleTab[] = ([[month, "今月"], [nextMonth, "来月"]] as const).map(([m, label]) => {
    const sc = scheduleOf({ shifts: (shiftsAll ?? []) as ScheduleShift[], wishes: (wishRows ?? []) as ScheduleWish[], month: m, today: bizToday });
    const cnt = daysCountOf({ workedDates: m === month ? workedThisMonth : new Set<string>(), schedule: sc });
    return { month: m, label, fixed: sc.fixed, pending: sc.pending, norm: daysNormLineOf({ target: daysTargets[m], worked: cnt.worked, fixedDays: cnt.fixedDays, pendingDays: cnt.pendingDays }) };
  });
  // ★便 X13-G W-22 ④: 売上の自分の順位（get_cast_sales_rank＝cast は自分の 1 行だけ・他人の金額と順位は返らない）
  const { data: salesRank } = myStore ? await supabase.rpc("get_cast_sales_rank", { p_store_id: myStore.id as string, p_period: month }) : { data: null };
  const mySales = ((salesRank ?? []) as { rank: number; sales: number; is_self: boolean }[]).find((r) => r.is_self) ?? null;

  const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
  const noteP: React.CSSProperties = { fontSize: 12, color: "var(--sub)", margin: 0 };
  const thL: React.CSSProperties = { textAlign: "left", fontWeight: 700, color: "var(--sub)", padding: "3px 0", borderBottom: "1px solid var(--line2)" };
  const thR: React.CSSProperties = { ...thL, textAlign: "right" };
  const tdL: React.CSSProperties = { padding: "3px 0", borderBottom: "1px solid var(--line2)" };
  const tdR: React.CSSProperties = { ...tdL, textAlign: "right" };

  return (
    /* 段0R 第3陣: モック正本どおりモバイルファースト1カラム（max-width 430・nox-minewrap）。
       印刷時は既存の .nox-main > * { max-width none } が幅を戻すため payslip の A4 印刷に影響しない。
       ページ見出しはモックどおり撤去＝.me ヘッダ（写真＋名前＋店）が先頭。 */
    <div className="nox-printpage nox-minewrap nox-mv1 nox-mv1-m">
      {/* 段P: プロフィール写真（本人スコープのみ・client 自己完結＝他カードの取得に影響しない）
          段M2: モックの .me ヘッダ（写真＋名前＋店）へ。店名は上で引いた自店を渡すだけ。 */}
      {showContractAck && <ContractAckGate />}{/* ★0162 ★4（便 M5-2）: 初回表示の契約確認＝記録済みは出さない・rev 更新で再表示 */}
      <PhotoCard storeName={myStore?.name as string | undefined} />

      {/* 段M2: 打刻はスマホで一番使うのでヘッダ直後へ（section の中身・PunchActions・最終打刻の
          文言はそのまま＝移設のみ）。 */}
      {castPunchOffOf(opsProfileOf(myStore as Record<string, unknown> | undefined).punch_methods) ? (
        <p className="nox-pstate" data-cast-punch-off="1" style={{ margin: "0 0 12px" }}>出勤・退勤は店が記録します</p>
      ) : (/* ★便 X13-G W-23 ①: キャストの打刻を使わない店は打刻カードを出さない */
      <section className="nox-panel">
        <h3>打刻{punchHeadOf(ps.state, ps.inAt) && <span className="num" style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "var(--ok)" }}>{punchHeadOf(ps.state, ps.inAt)}</span>}</h3>{/* ★326 追補3: 出勤中は見出し横に「出勤中 HH:MM〜」 */}
        {/* ★0164（便 W5-2b）: 店設定 punch_methods.self が OFF の店は本人打刻のボタンを出さない（RPC punch_self は拒否しない＝UI の出し分けだけ・裁定要） */}
        {opsProfileOf(myStore as Record<string, unknown> | undefined).punch_methods.self ? (
        <PunchActions state={ps.state} okuriMode={okuriModeOf((myStore?.settings_json ?? {}) as Record<string, unknown>)} /* ★裁定414（S-4）: 4 方式＝'none' 以外で導線 */
          okuriBase={typeof ((myStore?.settings_json ?? {}) as Record<string, unknown>).okuri_base_amount === "number" ? (((myStore?.settings_json ?? {}) as Record<string, unknown>).okuri_base_amount as number) : null} />
        ) : (
          <p className="nox-pstate" style={{ color: "var(--sub)" }}>この店はスマホからの打刻を使っていません（出退勤は店の代行か打刻端末で記録します）</p>
        )}{/* ★0156（裁定309-9）: actual 店のみ「送り あり／なし」 */}
        <p className="nox-pstate">
          最終打刻:{" "}
          {last
            ? `${last.type === "in" ? "出勤" : "退勤"}（${rsvWhen(last.punched_at as string)}）`
            : "なし"}
        </p>
        {/* ★裁定326-5（便 M2-1）: 当日の出勤・退勤時刻（M1 の状態表示は置き換えず追記）＋当月の勤怠一覧（折りたたみ・実働＝給与と同じ dayWorkedHours） */}
        <p className="nox-pstate num">{todayInOutLabelOf(todayRow)}</p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12.5, color: "var(--sub)", cursor: "pointer" }}>今月の勤怠一覧（{attRows.length} 日）</summary>
          {attRows.length === 0 ? <p style={{ ...noneP, marginTop: 6 }}>打刻なし</p> : (
            <table style={{ width: "100%", fontSize: 12.5, marginTop: 6, borderCollapse: "collapse" }}>
              <thead><tr><th style={thL}>日付</th><th style={thR}>出勤</th><th style={thR}>退勤</th><th style={thR}>実働</th></tr></thead>
              <tbody>
                {attRows.map((r) => (
                  <tr key={r.bizDate}>
                    <td className="num" style={tdL}>{mdLabelOf(r.bizDate)}</td>
                    <td className="num" style={tdR}>{r.inHm ?? "—"}</td>
                    <td className="num" style={tdR}>{r.outHm ?? "—"}</td>
                    <td className="num" style={tdR}>{hoursLabelOf(r.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ ...noteP, marginTop: 4 }}>{ATTENDANCE_MONTH_NOTE}</p>
        </details>
      </section>
      )}

      <section className="nox-panel">
        <h3>遅刻・当欠の連絡</h3>
        {(() => { const st = mineReportStateOf((((att ?? []) as { date: string; status: string; eta: string | null; source: string | null }[]).find((a) => a.date === bizToday) ?? null) ? { cast_id: "", ...(((att ?? []) as { date: string; status: string; eta: string | null; source: string | null }[]).find((a) => a.date === bizToday)!) } : null); return st ? <p className="nox-pstate" data-mine-report="1" style={{ margin: "0 0 8px" }}>{st}</p> : null; })()}{/* ★便 X13-H H-17 ③ */}
        <AttendanceForm defaultDate={bizToday} />
      </section>

      {/* ★便 X13-G W-22 ②⑤: 出勤予定（今月／来月・確定と確認待ち・募集中は出さない）＋出勤ノルマの不足（旧・直近の節は廃止） */}
      <ScheduleCard tabs={scheduleTabs} />

      {/* ノルマ進捗（mig0042・表示のみ）: 採用軸かつ目標>0 の軸だけ・全非表示ならカード自体出ない
          ★店が採用している軸のときだけ出る現行条件はそのまま（部品側の判定に一切触れていない）。 */}
      {isSectionOn((myStore?.settings_json ?? null) as StoreSettings, "mineNormCard") && <NormCard />}{/* ★裁定269-4: mineNormCard */}

      {/* 印刷隔離の対象マーカーは維持（器だけ差し替え・明細スリップ部品は非改変）
          ★裁定326-1（便 M2-1／M2-4）: payslip_visibility 'off'＝カードごと出さない（PDF ボタンも無し）／'net_only'＝期ヘッダー＋手取り 1 行（compact・PDF は同じ DOM）／'detail'＝現状 */}
      {mineWage && ms.payslip_visibility !== "off" && (/* ★便 X13-H H-8: 今期の時給＝キャスト一覧・詳細と同じ（判定期間とタイミング・根拠 1 行） */
        <p style={{ fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.7 }} data-mine-wage="1">
          <b>今期の時給</b> <b className="num">¥{mineWage.hourly.toLocaleString()}</b> <span style={{ color: "var(--sub)" }}>{mineWage.basis}・{mineWage.periodLabel}</span>
          {mineWage.basisLine && <span data-wage-basis="1" style={{ display: "block", color: "var(--sub)", fontSize: 11.5 }}>{mineWage.basisLine}</span>}
        </p>
      )}
      {guaLabel && (/* ★裁定348 追補1: 期限付き保証時給の印（期間中だけ） */
        <p style={{ fontSize: 12.5, margin: "0 0 10px" }} data-guarantee="1">
          <span className="nox-stpill ok">{guaLabel}</span><span style={{ color: "var(--sub)", marginLeft: 8 }}>期間中は時給の下限がこの額になります（期限後は基本時給）</span>
        </p>
      )}
      {ms.payslip_visibility !== "off" && (
      <section className="nox-panel nox-print">
        <h3>
          確定給与明細
          <span style={{ marginLeft: "auto" }}>{(slips ?? []).length > 0 && <PrintPayslipButton />}</span>
        </h3>
        {(slips ?? []).length === 0 && <p style={{ ...noneP, marginTop: 11 }}>確定分なし</p>}
        <div style={{ marginTop: 11 }}>
          {(slips ?? []).map((s, i) => (
            <PayslipSlip systems={(myStore?.settings_json ?? null) as Record<string, unknown> | null} /* ★便 GV-C C-10（GV-53） */ okuriModes={okuriModes} /* ★裁定414（S-4 ④） */
              key={i}
              compact={ms.payslip_visibility === "net_only"}
              slip={{ period: s.period as string, net: s.net as number, breakdown_json: s.breakdown_json }}
            />
          ))}
        </div>
        <p style={{ ...noteP, marginTop: 6 }}>{ms.payslip_visibility === "net_only" ? "※手取りと期のみの表示です。内訳は店にご確認ください。" : "※確定後の明細です。売掛・前借り・送りの未収残は店にご確認ください。"}</p>
      </section>
      )}
      {/* ★0156（起票85・便 V-7）: マイナンバー廃棄後だけ本人にも「廃棄済み YYYY-MM-DD」を出す（値は出さない・未廃棄は何も出さない）。★M2: 明細カードの外へ（明細 'off' の店でも出す） */}
      {discardYmd && <p className="nox-pstate" style={{ margin: "0 0 10px" }}>マイナンバー 廃棄済み <span className="num">{discardYmd}</span></p>}

      {/* ★裁定326-2（便 M2-1）: 報酬シミュレーターと今月のバックの 2 カードは削除 */}

      {/* F3f 自己申告ドリンク（独立枠・承認後に給与明細へ合算） */}
      {ms.drink_claim && <DrinkClaimForm month={month} />}{/* ★326-8: drink_claim OFF＝カード非表示 */}

      <section className="nox-panel">
        <h3>今月の出勤ボーナス（{month}）</h3>
        {(incentives ?? []).length === 0 && <p style={noneP}>発行なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(incentives ?? []).map((r, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {r.biz_date}{" "}
              {r.amount_mode === "per_head"
                ? <>定額 <span style={t.num}>{yen(r.amount as number)}</span></>
                : <>プール <span style={t.num}>{yen(r.amount as number)}</span>（受給者数により変動・暫定）</>}
            </li>
          ))}
        </ul>
        <p style={{ ...noteP, marginTop: 6 }}>
          ※受給は当日の確定シフト出勤が条件・確定額は給与確定時に算出。
        </p>
      </section>


      {/* ★便 X13-G W-22 ④: ランキングの既定＝売上（伝票の請求額（サ料込・カード手数料を除く）を指名の割合で按分＝給与・店の集計と同じ）。
          表示は自分の順位・人数・自分の値だけ（他のキャストの金額は出さない＝裁定346 の店設定 top／self は /mine/ranking 側）。指名は切替（?axis=nom） */}
      {castRankingModeOf(ms) !== "off" && (mySales || myRank) && (
        <section className="nox-panel" data-mine-rank="sales">
          <h3>売上ランキング（{month}）</h3>
          <div className="nox-myrank">
            {mySales ? (
              <>
                <span className={`nox-medal ${mySales.rank === 1 ? "g1" : mySales.rank === 2 ? "g2" : mySales.rank === 3 ? "g3" : "gx"}`}>{mySales.rank}</span>
                <div>
                  <div className="t num">{mySales.rank}位 / {Math.max(rankRows.length, mySales.rank)}人中</div>
                  <div className="n num">自分の売上 {yen(mySales.sales)}</div>
                </div>
              </>
            ) : <div className="n" style={{ color: "var(--sub)" }}>今月の売上はまだありません</div>}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10 }}>
              <Link href="/mine/ranking?axis=nom" className="nox-link" style={{ fontSize: 12 }}>指名で見る</Link>
              <Link href="/mine/ranking" className="nox-link" style={{ fontSize: 12 }}>一覧 ›</Link>
            </span>
          </div>
        </section>
      )}

      {/* ★裁定326-4／326-8（便 M3-2）: 予約申請カード＝店設定 reservation_request ON のときだけ（OFF＝非表示・予約一覧は残す） */}
      {ms.reservation_request && myStore && <ReservationRequestCard storeId={myStore.id as string} bizToday={bizToday} />}

      <section className="nox-panel">
        <h3>指名予約（今日以降）</h3>
        {(rsv ?? []).length === 0 && <p style={noneP}>予約なし</p>}
        {(rsv ?? []).map((r) => (
          <div key={r.id as string} style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ ...t.num, fontWeight: 700 }}>{rsvWhen(r.reserved_at as string)}</span>
              <span style={{ fontWeight: 700 }}>{rsvName(r.customers as RsvCustomer, r.guest_name as string | null)}</span>
              {r.party_size != null && <span style={{ color: "var(--sub)" }}>{r.party_size}名</span>}
              <span style={{
                fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                color: "var(--gold)", background: "var(--card2)", border: "1px solid var(--line2)",
                whiteSpace: "nowrap", marginLeft: "auto",
              }}>予約</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
              {NOM_LABEL[r.nom_type as string] ?? "指名種別は来店時に決定"}
              {r.memo ? `・${r.memo}` : ""}
            </div>
          </div>
        ))}
        <p style={{ ...noteP, marginTop: 6 }}>※予約の変更・取消は店舗にご連絡ください。</p>
      </section>

      <section className="nox-panel nox-kintai" data-mine-kintai="1">{/* ★便 SH-UI-c C-2 ④: 店長の勤怠表（②）と同じ部品・本人分・修正者名と金額は出さない */}
        <h3>今月の勤怠<span className="num" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--sub)" }}>出勤 {kintaiSum.days} 日・実働 {kintaiSum.hours}h{kintaiSum.lateN ? `・遅刻 ${kintaiSum.lateN}` : ""}{kintaiSum.absentN ? `・当欠 ${kintaiSum.absentN}` : ""}</span></h3>
        {kintaiRows.length === 0 ? <p style={noneP}>記録なし</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="nox-table nox-kintai-table" style={{ width: "100%", fontSize: 12.5 }}>
              <KintaiHead />
              <tbody>{kintaiRows.map((r) => <KintaiRow key={r.bizDate} r={r} withBy={false} link={false} />)}</tbody>
            </table>
          </div>
        )}
        <p style={{ ...noteP, marginTop: 6 }}>{ATTENDANCE_MONTH_NOTE}</p>
      </section>
      {/* ★0154 D1（裁定294-2／294-4／295-1）: 出退勤の修正申請（本人）＝店の承認後に punches へ反映・承認分は本人が確認／異議あり */}
      {ms.punch_correction_request && meCast?.id && (/* ★326-8: punch_correction_request OFF＝修正申請カード非表示 */
        <section className="nox-panel">
          <h3>{term}の修正申請</h3>
          <PunchCorrectionForm castId={meCast.id as string} bizToday={bizToday} punches={(todayPunches ?? []) as { id: string; type: string; punched_at: string }[]} term={term}
            finalizedPeriods={((slips ?? []) as { period: string }[]).map((s) => s.period)} />{/* ★裁定315（便 AB-3）: 明細がある期＝確定済み */}
          <div style={{ marginTop: 10 }}>
            <PunchCorrectionList rows={(corrRows ?? []) as CorrectionRow[]} term={term} />
          </div>
        </section>
      )}

    </div>
  );
}
