/**
 * verify:nox-0201i — 0201i（2026-11-13 夕 Agoora 手貼り・検証 18 行一致・関数 442→447・表 122）のフラグ true 便（画面の便 2）。
 *   裁定486＋追補＝お知らせの「確認しました」と出欠。try_0201i_r2（BEGIN…ROLLBACK）の群を real signIn（seed:f0 の NOX-VERIFY-A1）で。
 *  (1) フラグ＝MIG_0201I_APPLIED=true・override
 *  (2) 純関数＝固定の文・宛先の鏡・締切・件数（未確認・未回答）・作る側の集計・入力の検査・カレンダーの行・和文
 *  (3) client の結線＝/mine のお知らせ（自動の既読をやめる・NoticeRespond）・/mine のナビとホームの件数・出勤予定の「お知らせの予定」・スタッフのお知らせ（受け取る側／作る側）・ナビの件数
 *  (4) live（real signIn）＝店長が作る→出欠の設定→キャスト確認・参加→不参加→スタッフ参加→owner と他 org の店長は確認できない→集計（確認 n／m・参加／不参加）→締切の後は 'rsvp closed'
 *  後片付け＝作ったお知らせを admin で消す（notice_responses は cascade）。
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MIG_0201I_APPLIED, mig0201iOn, __set0201iForTest } from "../lib/nox/rules-0175/flag";
import {
  NOTICE_ACK_BTN, NOTICE_ACKED, RSVP_YES, RSVP_NO, RSVP_CLOSED, RSVP_CREATE_LABEL, RSVP_DUE_LABEL,
  noticeAudienceHasOf, rsvpClosedOf, noticePendingOf, noticePendingCountOf, responseSummaryOf, ackLineOf, rsvpCountLineOf, personStateOf,
  rsvpFormErrOf, jstLocalToIso, rsvpEventsOf, rsvpLinesOf, noticeRespErrJa, type MyResponse,
} from "../lib/nox/notices/response";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD"]);
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
check("0201i(1-1) MIG_0201I_APPLIED=true・override", (MIG_0201I_APPLIED as boolean) === true && mig0201iOn() === true);
__set0201iForTest(false); check("0201i(1-2) __set0201iForTest(false) で false", mig0201iOn() === false); __set0201iForTest(null);
// (2)
{
  check("0201i(2-1) 固定の文（相談役 ■4 a）", NOTICE_ACK_BTN === "確認しました" && NOTICE_ACKED === "確認済み" && RSVP_YES === "参加" && RSVP_NO === "不参加" && RSVP_CLOSED === "締切を過ぎました" && RSVP_CREATE_LABEL === "出欠を取る" && RSVP_DUE_LABEL === "回答の締切");
  const C = { kind: "cast" as const, castId: "c1" }, S = { kind: "membership" as const, role: "staff", membershipId: "m1" }, M = { kind: "membership" as const, role: "manager", membershipId: "m2" }, O = { kind: "membership" as const, role: "owner", membershipId: "m3" };
  check("0201i(2-2) 宛先の鏡（notice_audience_has）＝cast 宛にスタッフは入らない（r2）・店長は個別で選ばれたときだけ・owner は入らない",
    noticeAudienceHasOf({ audience: "all" }, C) && noticeAudienceHasOf({ audience: "all" }, S) && !noticeAudienceHasOf({ audience: "all" }, M) && !noticeAudienceHasOf({ audience: "all" }, O)
    && !noticeAudienceHasOf({ audience: "cast" }, S) && !noticeAudienceHasOf({ audience: "staff" }, C) && noticeAudienceHasOf({ audience: "cast", cast_ids: ["c1"] }, C) && !noticeAudienceHasOf({ audience: "cast", cast_ids: ["c9"] }, C)
    && noticeAudienceHasOf({ audience: "targets", staff_ids: ["m2"] }, M) && !noticeAudienceHasOf({ audience: "targets", staff_ids: ["m1"] }, M) && !noticeAudienceHasOf({ audience: "targets", cast_ids: null }, C));
  const now = Date.parse("2026-11-13T12:00:00Z");
  const r = { rsvp: true, rsvp_at: "2026-11-14T10:00:00Z", rsvp_due: "2026-11-13T11:00:00Z" };
  check("0201i(2-3) 締切＝rsvp_due（無ければ rsvp_at）を過ぎたら closed・出欠なしは closed にならない",
    rsvpClosedOf(r, now) && !rsvpClosedOf({ ...r, rsvp_due: null }, now) && rsvpClosedOf({ ...r, rsvp_due: null }, Date.parse("2026-11-14T10:00:01Z")) && !rsvpClosedOf({ rsvp: false }, now));
  const open = { ...r, rsvp_due: null };
  const mine = new Map<string, MyResponse>([["a", { acked_at: "x", rsvp: null }], ["b", { acked_at: "x", rsvp: "yes" }], ["d", { acked_at: "x", rsvp: null }]]);
  check("0201i(2-4) 件数＝未確認（行なし）・出欠を取るのに未回答で締切前＝1 件ずつ・確認済みの通常／回答済み／締切後の未回答は数えない",
    noticePendingCountOf([{ id: "a", ...open }, { id: "b", ...open }, { id: "c" }, { id: "d", ...r }, { id: "e" }], mine, now) === 3 && noticePendingOf({}, null, now) && !noticePendingOf({}, { acked_at: "x", rsvp: null }, now));
  const rows = [{ subject_kind: "cast", subject_id: "1", name: "a", is_active: true, acked_at: "x", rsvp: "yes" }, { subject_kind: "cast", subject_id: "2", name: "b", is_active: true, acked_at: "x", rsvp: "no" }, { subject_kind: "membership", subject_id: "3", name: "c", is_active: true, acked_at: null, rsvp: null }, { subject_kind: "cast", subject_id: "4", name: "d", is_active: false, acked_at: "x", rsvp: null }];
  const s = responseSummaryOf(rows);
  check("0201i(2-5) 作る側の集計＝確認 3／4・参加 1・不参加 1・未回答 2・人ごとの状態", ackLineOf(s) === "確認 3／4" && rsvpCountLineOf(s) === "参加 1・不参加 1・未回答 2"
    && personStateOf(rows[0], true) === "参加" && personStateOf(rows[2], true) === "未確認" && personStateOf(rows[3], true) === "確認済み・未回答" && personStateOf(rows[2], false) === "未確認" && personStateOf(rows[3], false) === "確認済み");
  check("0201i(2-6) 入力の検査＝日時は必須・未来だけ・締切は日時以前・場所 120 字まで・JST の壁時計 → +09:00",
    rsvpFormErrOf({ at: "", due: "", place: "" }, now) !== null && rsvpFormErrOf({ at: jstLocalToIso("2026-11-13T20:00"), due: "", place: "" }, now) !== null
    && rsvpFormErrOf({ at: jstLocalToIso("2026-11-14T20:00"), due: jstLocalToIso("2026-11-14T21:00"), place: "" }, now) !== null && rsvpFormErrOf({ at: jstLocalToIso("2026-11-14T20:00"), due: "", place: "x".repeat(121) }, now) !== null
    && rsvpFormErrOf({ at: jstLocalToIso("2026-11-14T20:00"), due: jstLocalToIso("2026-11-14T18:00"), place: "店内" }, now) === null && jstLocalToIso("2026-11-14T20:00") === "2026-11-14T20:00:00+09:00");
  const ev = rsvpEventsOf([{ id: "a", title: "会議", rsvp: true, rsvp_at: "2026-11-20T10:00:00Z" }, { id: "b", title: "前", rsvp: true, rsvp_at: "2026-11-01T10:00:00Z" }, { id: "c", title: "通常" }], new Map([["a", { acked_at: "x", rsvp: "yes" as const }]]), "2026-11", "2026-11-13");
  check("0201i(2-7) カレンダーの行＝今日以降・その月・JST の日付と時刻・答え", ev.length === 1 && ev[0].date === "2026-11-20" && ev[0].time === "19:00" && ev[0].dow === "金" && ev[0].answer === "yes");
  check("0201i(2-8) 出欠の行と和文", rsvpLinesOf({ rsvp: true, rsvp_at: "2026-11-20T10:00:00Z", rsvp_place: "店内", rsvp_due: "2026-11-19T10:00:00Z" }).join("・") === "日時 11/20（金）19:00・場所 店内・回答の締切 11/19（木）19:00"
    && noticeRespErrJa("rsvp closed") === "締切を過ぎました" && noticeRespErrJa("rsvp answered") !== "" && noticeRespErrJa("zzz") === "");
}
// (3)
{
  const mn = src("app/mine/notices/page.tsx"), ml = src("app/mine/layout.tsx"), mp = src("app/mine/page.tsx"), sc = src("app/mine/schedule-card.tsx"), nb = src("app/(manage)/notices/notices-board.tsx"), lay = src("app/(manage)/layout.tsx"), nr = src("components/nox/notice-respond.tsx");
  check("0201i(3-1) /mine のお知らせ＝フラグ true は notice_mark_read を呼ばない・本人の notice_responses・NoticeRespond", mn.includes("if (!mig0201iOn()) await Promise.all([...unreadIds].map((id) => supabase.rpc(\"notice_mark_read\"") && mn.includes(".eq(\"subject_kind\", \"cast\")") && mn.includes("<NoticeRespond noticeId={n.id}"));
  check("0201i(3-2) 受け取る側の部品＝notice_ack／notice_rsvp（p_answer）・締切の後はボタンを出さない", nr.includes("rpc(\"notice_ack\", { p_notice_id: noticeId })") && nr.includes("rpc(\"notice_rsvp\", { p_notice_id: noticeId, p_answer: answer })") && nr.includes("data-notice-rsvp-closed"));
  check("0201i(3-3) /mine のナビ＝未確認・未回答（noticePendingCountOf）・ホームの 1 行・出勤予定の「お知らせの予定」",
    ml.includes("noticePendingCountOf(visN,") && mp.includes("data-mine-notice-pending={noticePending}") && mp.includes("events: rsvpByMonth.get(m) ?? []") && sc.includes("お知らせの予定（{cur.events!.length}）"));
  check("0201i(3-4) スタッフのお知らせ＝作る側の「出欠を取る」（notice_set_rsvp・p_on true 明示）・確認 n／m・人ごと・受け取る側（宛先の鏡）",
    nb.includes("supabase.rpc(\"notice_set_rsvp\", { p_notice_id: newId, p_on: true,") && nb.includes("supabase.rpc(\"notice_response_status\", { p_notice_id: n.id })") && nb.includes("data-notice-status-open") && nb.includes("noticeAudienceHasOf(n, { kind: \"membership\", role: me.role, membershipId: me.mid })"));
  check("0201i(3-5) 管理側のナビ＝お知らせ（N）＝staffNoticePendingOf（スタッフ・店長）", lay.includes("staffNoticePendingOf(supabase, role)") && lay.includes("`お知らせ（${noticePending}）`"));
}

(async () => {
  const URL = env.NEXT_PUBLIC_SUPABASE_URL, PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(URL, PUB, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${String(key)} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const mgr = await signIn("managerA1"), owner = await signIn("ownerA"), staff = await signIn("staffA1"), cast = await signIn("castA1a"), mgrB = await signIn("managerB1");
  const made: string[] = [];
  try {
    const at = new Date(Date.now() + 2 * 86400_000).toISOString();
    const { data: nid, error: eC } = await mgr.rpc("notice_create", { p_title: "NOX-VERIFY-0201i 出欠", p_body: "verify", p_audience: "all", p_pinned: false, p_until: null });
    check("0201i(4-1) 店長がお知らせを作れる", !eC && typeof nid === "string", eC?.message); if (typeof nid === "string") made.push(nid);
    const n = nid as string;
    const sr = await mgr.rpc("notice_set_rsvp", { p_notice_id: n, p_on: true, p_at: at, p_place: " 店内 ", p_due: null });
    const { data: row } = await admin.from("notices").select("rsvp, rsvp_place").eq("id", n).single();
    check("0201i(4-2) 店長が出欠の設定（場所は trim）", !sr.error && row?.rsvp === true && row?.rsvp_place === "店内", sr.error?.message);
    const s2 = await staff.rpc("notice_set_rsvp", { p_notice_id: n, p_on: true, p_at: at, p_place: null, p_due: null });
    check("0201i(4-3) スタッフは出欠の設定を呼べない（forbidden）", !!s2.error && /forbidden/.test(s2.error.message), s2.error?.message);
    const a1 = await cast.rpc("notice_ack", { p_notice_id: n }); const a1b = await cast.rpc("notice_ack", { p_notice_id: n });
    check("0201i(4-4) キャストの「確認しました」＝冪等（2 回目も同じ時刻）", !a1.error && !a1b.error && String(a1.data) === String(a1b.data), a1.error?.message);
    const y = await cast.rpc("notice_rsvp", { p_notice_id: n, p_answer: "yes" }); const no = await cast.rpc("notice_rsvp", { p_notice_id: n, p_answer: "no" });
    check("0201i(4-5) キャストの出欠＝参加 → 不参加に変えられる（締切の前）", !y.error && !no.error, y.error?.message ?? no.error?.message);
    const sy = await staff.rpc("notice_rsvp", { p_notice_id: n, p_answer: "yes" });
    check("0201i(4-6) スタッフも参加できる（押すと確認も付く）", !sy.error, sy.error?.message);
    const oa = await owner.rpc("notice_ack", { p_notice_id: n }), ma = await mgr.rpc("notice_ack", { p_notice_id: n }), ba = await mgrB.rpc("notice_ack", { p_notice_id: n });
    check("0201i(4-7) owner・作る側の店長（区分）・他 org の店長は確認できない（forbidden）", [oa, ma, ba].every((x) => !!x.error && /forbidden/.test(x.error.message)), [oa, ma, ba].map((x) => x.error?.message));
    const { data: mine } = await cast.from("notice_responses").select("notice_id, rsvp, acked_at").eq("notice_id", n);
    const { data: other } = await staff.from("notice_responses").select("subject_kind").eq("notice_id", n);
    check("0201i(4-8) notice_responses の RLS＝本人の行だけ（キャストは自分の 1 行・スタッフも自分の 1 行）", (mine ?? []).length === 1 && mine![0].rsvp === "no" && (other ?? []).length === 1 && other![0].subject_kind === "membership", { mine, other });
    const st = await mgr.rpc("notice_response_status", { p_notice_id: n });
    const rows = (st.data ?? []) as { subject_kind: string; acked_at: string | null; rsvp: string | null; name: string | null; is_active: boolean; subject_id: string }[];
    const sum = responseSummaryOf(rows);
    check("0201i(4-9) 作る側の集計（notice_response_status）＝参加 1（スタッフ）・不参加 1（キャスト）・確認 2 以上・宛先にキャストとスタッフ", !st.error && sum.yes === 1 && sum.no === 1 && sum.acked >= 2 && rows.some((r) => r.subject_kind === "cast") && rows.some((r) => r.subject_kind === "membership"), { err: st.error?.message, sum });
    const sst = await staff.rpc("notice_response_status", { p_notice_id: n });
    check("0201i(4-10) スタッフは集計を読めない（forbidden）", !!sst.error && /forbidden/.test(sst.error.message), sst.error?.message);
    // 締切を過ぎる（日時は未来のまま・締切を 1 分前に）
    const past = new Date(Date.now() - 60_000).toISOString();
    const sp = await mgr.rpc("notice_set_rsvp", { p_notice_id: n, p_on: true, p_at: at, p_place: "店内", p_due: past });
    const late = await cast.rpc("notice_rsvp", { p_notice_id: n, p_answer: "yes" });
    check("0201i(4-11) 締切の後＝'rsvp closed'（回答があっても日時と締切は変えられる）", !sp.error && !!late.error && /rsvp closed/.test(late.error.message), sp.error?.message ?? late.error?.message);
    const off = await mgr.rpc("notice_set_rsvp", { p_notice_id: n, p_on: false, p_at: null, p_place: null, p_due: null });
    check("0201i(4-12) 回答があるお知らせは出欠をやめられない（'rsvp answered'）", !!off.error && /rsvp answered/.test(off.error.message), off.error?.message);
    const { data: sA1 } = await admin.from("stores").select("id").eq("name", STORE_A1).single();
    check("0201i(4-13) 前提＝NOX-VERIFY-A1 の店", !!sA1);
  } finally {
    if (made.length) { const { error } = await admin.from("notices").delete().in("id", made); if (error) fails.push(`後片付け: ${error.message}`); }
  }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0201i ALL PASS (${pass} assertions)`);
})();
