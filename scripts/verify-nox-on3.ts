/*
 * verify:nox-on3 — 便 ON-3（2026-10-26）: 0176 の client＝通知（cast_notifications 6 種）・登録→招待の 2 段（staff_invite_create→/i/[token]→staff_invite_accept）・LINE（401＝設定 UI・bind トークン・LIFF・Webhook・push 台帳）・
 *   連絡の確認済みと履歴（I-4）・本人の連絡先変更（400）・シフトの 5 件（期間ごとの必要人数・締切の自動遷移 cron route・辞退の /mine 導線・追加／外しの通知・未提出者への一括お知らせ）・C2-13 催促・裁定413「相手に通知」。
 *  (1) 純関数（DB 不触）: notify-text／invite／contact／period-needs／decline／cast-report（ack）／line（URL・設定検査・上限の段・見込み・署名）
 *  (2) 配線（逐語 grep）: staff-board／casts-board／shift-board／mine（schedule-card・notices・layout・attendance-form・page）／availability-editor／store-profile（LINE タブ）／route 10 本／demo-guard の分類／cron SQL
 *  (3) DB 段（nox-dev・Postgres 直結・1 トランザクション＝ROLLBACK）: staff_invite_create（owner・anon 拒否）／attendance_contact_log＋attendance_ack／cast_notification_create＋read（本人だけ可視）／notice_create_targets（cast_ids）／
 *      shift_period_needs_set（全置換・dup dow）／shift_cast_decline（proposed→planned・本人だけ）／set_store_line_config・line_bind_token_create・bind_line（service only・同じ LINE は 1 人）・set_store_line_limit・line_push_log_write（service only）・line_push_month_summary／shift_periods_auto_close（service only・締切超えの open→closed）
 *  (4) 招待の受諾（nox-dev・PostgREST＝admin client）: owner が staff_invite_create → admin が Auth を作って staff_invite_accept → users／memberships／staff_contracts・招待は使用済み・2 回目は 'bad token'。finally で全部消す。
 *  逆テスト（手動・各 1 回）: shift-board の removeShift から notifyCast を外す→on3(2-3) 赤／bind_line の 'line already linked' を外す→on3(3-8c) 赤。
 */
import fs from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { AVAILABILITY_CHANGED_BODY, CAST_NOTIF_KINDS, mdDowOf, mineNavUnreadOf, noticeVisibleToCastOf, remindWishBody, shiftAddedBody, shiftChangedBody, shiftProposedBody, shiftRemovedBody, unreadNotifCountOf } from "../lib/nox/people/notify-text";
import { INVITE_TOKEN_RE, inviteFormErrorOf, invitePasswordErrorOf, inviteStateOf, inviteUrlOf } from "../lib/nox/people/invite";
import { tokenHashOf } from "../lib/nox/people/invite-server";
import { contactChangeLineOf, contactErrorOf, contactPatchOf, contactPanelTitleOf } from "../lib/nox/people/contact";
import { periodNeedRequiredOf, periodNeedRowsOf, periodNeedsChipOf, periodNeedsErrorOf, periodNeedsFormOf } from "../lib/nox/shift/period-needs";
import { declineTextOf } from "../lib/nox/shift/decline";
import { contactHistoryLineOf, mineReportStateOf, reportAckStateOf, reportChipTextOf } from "../lib/nox/shift/cast-report";
import { liffBindUrlOf, liffEntryUrlOf, lineConfigErrorOf, lineConfigPatchOf, lineLimitStepOf, linePushKindOfNotif, webhookUrlOf } from "../lib/nox/line/liff-endpoint";
import { jstMonthOf, lineForecastOf, lineStatusOf } from "../lib/nox/line/push-forecast";
import { lineSignatureOk } from "../lib/nox/line/server";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD", "SUPABASE_DB_URL"]);
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);
const HEX64 = /^[0-9a-f]{64}$/;

(async () => {
  // ── (1) 純関数 ──
  check("on3(1-1) 通知の文面＝追加／取消／変更／確認のお願い（曜日つき）・基本の働き方・催促（締切つき）・kind 6 種", shiftAddedBody("2026-10-28", "20:00", "01:00") === "10/28（水） 20:00〜01:00 のシフトが確定しました" && shiftRemovedBody("2026-10-28", "20:00", "01:00").endsWith("取り消されました") && shiftChangedBody("2026-10-28", { start: "20:00", end: "01:00" }, { start: "21:00", end: "02:00" }) === "10/28（水） のシフトが 20:00〜01:00 → 21:00〜02:00 に変わりました" && shiftProposedBody("2026-11-01", "19:00", "00:00").startsWith("11/1（日） 19:00〜00:00 のシフト案が届きました") && AVAILABILITY_CHANGED_BODY.includes("基本の働き方") && remindWishBody({ start_date: "2026-11-01", end_date: "2026-11-14", wish_deadline: "2026-10-25" }) === "シフト希望（11/1〜11/14）の提出をお願いします。締切 10/25" && CAST_NOTIF_KINDS.length === 6 && mdDowOf("2026-10-26") === "10/26（月）");
  check("on3(1-2) 未読＝お知らせ＋通知・宛先つきお知らせは本人を含むときだけ（null＝全員）", mineNavUnreadOf(2, 3) === 5 && unreadNotifCountOf([{ read_at: null }, { read_at: "2026-10-26T00:00:00Z" }]) === 1 && noticeVisibleToCastOf(null, "a") && noticeVisibleToCastOf(["a", "b"], "a") && !noticeVisibleToCastOf(["b"], "a") && !noticeVisibleToCastOf(["b"], null) && noticeVisibleToCastOf([], null));
  const tok = "a".repeat(64);
  check("on3(1-3) 招待＝URL <site>/i/<token>（末尾 / を落とす）・状態（ok／accepted／expired）・フォーム検査（招待はメール必須）・パスワード 8〜72＋一致", inviteUrlOf("https://x.example/", tok) === `https://x.example/i/${tok}` && INVITE_TOKEN_RE.test(tok) && inviteStateOf({ accepted_at: null, expires_at: "2030-01-01T00:00:00Z" }, Date.now()) === "ok" && inviteStateOf({ accepted_at: "2026-01-01T00:00:00Z", expires_at: "2030-01-01T00:00:00Z" }, Date.now()) === "accepted" && inviteStateOf({ accepted_at: null, expires_at: "2020-01-01T00:00:00Z" }, Date.now()) === "expired" && inviteFormErrorOf({ name: "山田", email: "", method: "invite" }) === "招待リンクにはメールアドレスが必要です" && inviteFormErrorOf({ name: "山田", email: "", method: "password" }) === null && invitePasswordErrorOf("short", "short") !== null && invitePasswordErrorOf("longenough1", "longenough2") !== null && invitePasswordErrorOf("longenough1", "longenough1") === null && tokenHashOf("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  check("on3(1-4) 連絡先＝変わった鍵だけの patch（空＝null）・検査（email 形式・phone 6〜20）・履歴の 1 行・見出し（未確認 N）", J(contactPatchOf({ contact_email: "A@X.com", phone: "" }, { contact_email: "a@x.com", phone: "090-1" })) === J({ phone: null }) && contactPatchOf({ contact_email: "a@x.com", phone: "090-1" }, { contact_email: "a@x.com", phone: "090-1" }) === null && contactErrorOf({ contact_email: "bad", phone: "" }) !== null && contactErrorOf({ contact_email: "", phone: "12" }) !== null && contactErrorOf({ contact_email: "a@b.co", phone: "+81 90-0000-0000" }) === null && contactChangeLineOf({ field: "phone", old_value: null, new_value: "090-1", changed_at: "2026-10-26T05:30:00Z" }) === "電話番号: 未設定 → 090-1（10/26 14:30）" && contactPanelTitleOf(2) === "連絡先の変更（未確認 2）" && contactPanelTitleOf(0) === "連絡先の変更");
  const periods = [{ id: "p1", start_date: "2026-11-01", end_date: "2026-11-14" }];
  const rows = [{ period_id: "p1", dow: 1, required: 3 }, { period_id: "p1", dow: 5, required: 4 }];
  check("on3(1-5) 期間ごとの必要人数＝期間内で行のある曜日だけ数（11/2 月＝3・11/4 水＝null＝店の既定・期間外 null）・フォーム 7 欄→行（空欄は送らない）・検査（0〜99）・chip「必要 月3・金4」", periodNeedRequiredOf("2026-11-02", periods, rows) === 3 && periodNeedRequiredOf("2026-11-04", periods, rows) === null && periodNeedRequiredOf("2026-11-20", periods, rows) === null && J(periodNeedsFormOf(rows, "p1")) === J(["", "3", "", "", "", "4", ""]) && J(periodNeedRowsOf(["", "3", "", "", "", "4", ""])) === J([{ dow: 1, required: 3 }, { dow: 5, required: 4 }]) && periodNeedsErrorOf(["", "100", "", "", "", "", ""]) !== null && periodNeedsErrorOf(["0", "", "", "", "", "", "99"]) === null && periodNeedsChipOf(rows, "p1") === "必要 月3・金4" && periodNeedsChipOf(rows, "p2") === null);
  check("on3(1-6) 辞退の印＝planned で declined_at があるときだけ「辞退あり 10/26『理由』」", declineTextOf({ status: "planned", declined_at: "2026-10-26T05:00:00Z", decline_reason: "用事" }) === "辞退あり 10/26『用事』" && declineTextOf({ status: "proposed", declined_at: "2026-10-26T05:00:00Z" }) === null && declineTextOf({ status: "planned", declined_at: null }) === null);
  const att = { id: "a1", cast_id: "c", date: "2026-10-26", status: "late", eta: "21:30", reason: "電車", source: "self", updated_at: "2026-10-26T06:42:00Z", ack_at: null as string | null };
  check("on3(1-7) 連絡の確認＝unacked／acked・chip「連絡 2 件（未確認 1）」・/mine「店の確認待ち」→「店が確認しました（15:50）」・履歴の 1 行", reportAckStateOf(att) === "unacked" && reportAckStateOf({ ...att, ack_at: "2026-10-26T06:50:00Z" }) === "acked" && reportAckStateOf({ ...att, source: "manager" }) === null && reportChipTextOf(2, 1) === "連絡 2 件（未確認 1）" && mineReportStateOf(att) === "遅刻の連絡は店に届きました（店の確認待ち）" && mineReportStateOf({ ...att, ack_at: "2026-10-26T06:50:00Z" }) === "遅刻の連絡を店が確認しました（15:50）" && contactHistoryLineOf({ kind: "late", eta: "21:30", reason: "電車", source: "self", created_at: "2026-10-26T06:42:00Z" }) === "15:42 本人 遅刻・見込み 21:30『電車』" && contactHistoryLineOf({ kind: "absent", eta: null, reason: null, source: "store", created_at: "2026-10-26T07:10:00Z" }) === "16:10 店 当欠");
  const sig = lineSignatureOk("secret", "{\"events\":[]}", "pkK1lVPJPiJ+wPLziRD79xIxohl8AImYM8AEeM7IbzQ=");
  check("on3(1-8) LINE＝入口／bind／Webhook の URL・設定検査（destination は U＋32 桁）・patch は変わった鍵だけ・上限の段（200→5,000→30,000）・見込み ceil(12÷10×31)＝38・状態（over／near／normal）・署名 HMAC-SHA256 base64・台帳 kind の写し", liffEntryUrlOf("https://x.example", "s1") === "https://x.example/liff/s1" && liffBindUrlOf("https://x.example/", "s1", "t") === "https://x.example/liff/s1?t=t&m=bind" && webhookUrlOf("https://x.example", "s1") === "https://x.example/api/line/webhook/s1" && lineConfigErrorOf({ bot_destination: "U" + "0".repeat(32) }) === null && lineConfigErrorOf({ bot_destination: "bad" }) !== null && J(lineConfigPatchOf({ login_channel_id: "1", liff_id: "", bot_destination: "" }, { login_channel_id: "1", liff_id: "x" })) === J({ liff_id: null }) && lineLimitStepOf(200, 1) === 5000 && lineLimitStepOf(5000, 1) === 30000 && lineLimitStepOf(30000, 1) === 30000 && lineLimitStepOf(5000, -1) === 200 && lineLimitStepOf(777, 1) === 5000 && lineLimitStepOf(777, -1) === 200 && lineForecastOf(12, 10, 31) === 38 && lineStatusOf(200, 200, 300, 10) === "over" && lineStatusOf(100, 200, 300, 10) === "near" && lineStatusOf(100, 200, 300, 2) === "normal" && lineStatusOf(10, 200, 30, 10) === "normal" && sig && !lineSignatureOk("secret", "{\"events\":[]}", "x") && linePushKindOfNotif("shift_added") === "shift_changed" && linePushKindOfNotif("other") === "notice" && jstMonthOf(Date.UTC(2026, 9, 25, 16, 0)).today === "2026-10-26" && jstMonthOf(Date.UTC(2026, 9, 25, 16, 0)).daysInMonth === 31);

  // ── (2) 配線 ──
  const sb = src("app/(manage)/staff/staff-board.tsx"), cbs = src("app/(manage)/casts/casts-board.tsx"), shb = src("app/(manage)/shift/shift-board.tsx");
  check("on3(2-1) staff-board＝ログインの方法（SegSelect・招待＝POST /api/staff/invite）・招待リンクは 1 回だけ表示・招待中の一覧・LINE 連携のリンク（line_bind_token_create 'membership'）・連絡先の変更パネル", sb.includes('fetch("/api/staff/invite"') && sb.includes("data-staff-login-method={aMethod}") && sb.includes('data-staff-invite-url="1"') && sb.includes("data-staff-invites={invites.length}") && sb.includes('supabase.rpc("line_bind_token_create", { p_subject_kind: "membership", p_subject_id: m.id, p_purpose: "bind" })') && sb.includes("<ContactChangesPanel canConfirm="));
  check("on3(2-2) casts-board＝LINE 連携（line_bind_token_create 'cast'・デモは出さない）・連絡先の変更パネル", cbs.includes('supabase.rpc("line_bind_token_create", { p_subject_kind: "cast", p_subject_id: c.id, p_purpose: "bind" })') && cbs.includes("デモでは連携できません") && cbs.includes("<ContactChangesPanel canConfirm="));
  check("on3(2-3) shift-board＝通知の配線（外し shift_removed・確定 shift_added・送り返し shift_proposed・時間変更 shift_changed）・催促（kind other）・一括お知らせ（notice_create_targets）・期間の必要人数（shift_period_needs_set・終日 1 バンド）・確認済み（attendance_ack）・店の記録も履歴（attendance_contact_log）・辞退の印", (shb.match(/notifyCast\(supabase, \{ castId: [^}]*kind: "shift_added"/g) ?? []).length >= 5 && shb.includes('kind: "shift_removed"') && (shb.match(/kind: "shift_proposed"/g) ?? []).length >= 1 && shb.includes('kind: sendBack ? "shift_proposed" : "shift_added"') && shb.includes('"shift_changed" : null') && shb.includes('kind: "other", body: remindWishBody(pe)') && shb.includes('supabase.rpc("notice_create_targets", { p_title: remindTarget.title, p_body: remindTarget.body, p_cast_ids: remindTarget.castIds, p_until: remindTarget.period.wish_deadline })') && shb.includes('supabase.rpc("shift_period_needs_set", { p_period_id: pid, p_rows: rows })') && shb.includes('if (pr !== null) return [{ id: "period", dow: dowOf(ymd), required: pr, from_min: 0, to_min: 1440, assigned: list.length, fill: fillOf(list.length, pr) }];') && shb.includes('supabase.rpc("attendance_ack", { p_attendance_id: attId })') && shb.includes('supabase.rpc("attendance_contact_log", { p_cast_id: castId, p_biz_date: attDate, p_kind: status, p_eta: keep.p_eta, p_reason: keep.p_reason })') && shb.includes('data-queue-declined="1"') && !shb.includes('title="0176 適用後に送れます"'));
  const sc = src("app/mine/schedule-card.tsx"), np = src("app/mine/notices/page.tsx"), ly = src("app/mine/layout.tsx"), af = src("app/mine/attendance-form.tsx"), mp = src("app/mine/page.tsx"), ae = src("components/nox/availability-editor.tsx");
  check("on3(2-4) /mine＝辞退（shift_cast_decline・確認待ち（あなた）の行）・通知の節（cast_notifications→開いたら既読）・宛先つきお知らせの絞り（cast_ids）・ナビ未読＝お知らせ＋通知・連絡の履歴（attendance_contact_log self）・連絡先カード（set_my_contact）・ack_at", sc.includes("{x.proposed && <ShiftDeclineButton shiftId={x.id} />}") && src("app/mine/shift-decline-button.tsx").includes('supabase.rpc("shift_cast_decline", { p_shift_id: shiftId, p_reason: reason.trim() || null })') && np.includes('supabase.rpc("cast_notification_read", { p_id: id })') && np.includes("noticeVisibleToCastOf(n.cast_ids ?? null") && ly.includes("mineNavUnreadOf(unreadNotices, unreadNotifCountOf(") && af.includes('supabase.rpc("attendance_contact_log", { p_cast_id: myCastId as string, p_biz_date: date, p_kind: status, p_eta: etaN, p_reason: reason || null })') && mp.includes('data-mine-contact-card="1"') && src("app/mine/contact-form.tsx").includes('supabase.rpc("set_my_contact", { p_patch: patch })') && mp.includes("updated_at, ack_at"));
  check("on3(2-5) 基本の働き方＝店側の保存で本人へ通知（availability_changed）・本人側は通知しない", ae.includes('if (!bySelf) void notifyCast(supabase, { castId, kind: "availability_changed", body: AVAILABILITY_CHANGED_BODY'));
  check("on3(2-6) 店舗設定＝LINE 連携タブ（?tab=line・nav）・パネル＝set_store_line_config／POST /api/line/secret／set_store_line_limit／line_push_month_summary・入口 URL と Webhook URL", src("lib/nox/master/nav.ts").includes('{ label: "LINE 連携", href: "/master/store-profile?tab=line" }') && src("app/(manage)/master/store-profile/page.tsx").includes('{tab === "line" && <LineConfigPanel stores={stores} isOwner={isOwner} />}') && ["set_store_line_config", "/api/line/secret", "set_store_line_limit", "line_push_month_summary", "liffEntryUrlOf(origin, storeId)", "webhookUrlOf(origin, storeId)"].every((s) => src("app/(manage)/master/line-config-panel.tsx").includes(s)));
  const routes = ["app/api/staff/invite/route.ts", "app/api/staff/invite/accept/route.ts", "app/api/line/secret/route.ts", "app/api/line/push/route.ts", "app/api/line/session/route.ts", "app/api/line/bind/route.ts", "app/api/line/webhook/[storeId]/route.ts", "app/api/cron/shift-periods-close/route.ts", "app/i/[token]/page.tsx", "app/liff/[storeId]/page.tsx"];
  check("on3(2-7) route／公開面 10 本・service 専用 RPC は admin から（staff_invite_accept／bind_line／set_line_secret／get_line_secret／line_push_log_write／shift_periods_auto_close）・デモ org＝招待 403／push 204／webhook は返事なし", routes.every((p) => fs.existsSync(p)) && src(routes[1]).includes('admin.rpc("staff_invite_accept", { p_token_hash: hash, p_auth_user_id: authUserId })') && src(routes[1]).includes("admin.auth.admin.deleteUser(authUserId)") && src(routes[5]).includes('admin.rpc("bind_line", { p_token_hash: tokenHashOf(token), p_line_user_id: v.sub })') && src(routes[2]).includes('admin.rpc("set_line_secret"') && src("lib/nox/line/server.ts").includes('admin.rpc("get_line_secret"') && src("lib/nox/line/server.ts").includes('admin.rpc("line_push_log_write"') && src(routes[7]).includes('admin.rpc("shift_periods_auto_close")') && src(routes[0]).includes("demoGuardErr(orgId as string)") && src(routes[3]).includes("return new NextResponse(null, { status: 204 }); // デモ org は送らない") && src(routes[6]).includes("if (store.isDemo) return new NextResponse"));
  const dg = src("scripts/verify-nox-demo-guard.ts");
  check("on3(2-8) demo-guard の分類＝A（staff/invite・line/secret・line/push）／B（staff/invite/accept・line/session・line/bind・line/webhook/[storeId]・cron/shift-periods-close）・cron の手貼り SQL（JST 06:10・Vault の URL 置換）", ['"staff/invite": "app/api/staff/invite/route.ts"', '"line/secret"', '"line/push"', '"staff/invite/accept"', '"line/session", "line/bind", "line/webhook/[storeId]"', '"cron/shift-periods-close"'].every((s) => dg.includes(s)) && src("docs/demo/cron_shift_periods_close.sql").includes("select cron.schedule('nox-shift-periods-close', '10 21 * * *'") && src("docs/demo/cron_shift_periods_close.sql").includes("'/api/cron/demo-reset', '/api/cron/shift-periods-close'"));

  // ── (3) DB 段（1 トランザクション・ROLLBACK） ──
  const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tx = pgTx(c);
  const A1 = await tx.storeA1(); const owner = await tx.uidOf("ownerA"); const mgr = await tx.uidOf("managerA1"); const ca = await tx.uidOf("castA1a"); const cb = await tx.uidOf("castA1b");
  const castA = await tx.castOf(A1.id, ca.id); const castB = await tx.castOf(A1.id, cb.id);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  try {
    await c.query("begin");
    const inv = await tx.as(owner, "select public.staff_invite_create($1, $2, $3, $4, $5) r", [A1.id, "nox-verify-on3-tx@example.com", "招待 TX", "staff", "{}"]);
    const invR = inv.ok ? (inv.rows[0].r as { id: string; token: string }) : null;
    const inv2 = await tx.as(owner, "select public.staff_invite_create($1, $2, $3, $4, $5) r", [A1.id, "nox-verify-on3-tx@example.com", "招待 TX", "staff", "{}"]);
    const invAnon = await tx.as("anon", "select public.staff_invite_create($1, $2, $3, $4, $5) r", [A1.id, "x@example.com", "x", "staff", "{}"]);
    const accAuth = await tx.as(mgr, "select public.staff_invite_accept($1, $2) r", ["00", "00000000-0000-0000-0000-000000000000"]);
    check("on3(3-1) staff_invite_create＝owner で id＋平文トークン（64 桁 16 進・DB は sha256）・同じメールの再発行は 'invite exists'・anon は BLOCKED・staff_invite_accept は authenticated から BLOCKED（service 専用）", !!invR && HEX64.test(invR.token) && (await tx.one<{ n: string }>("select count(*)::text n from public.staff_invites where id = $1 and token_hash = $2 and accepted_at is null", [invR.id, tokenHashOf(invR.token)]))?.n === "1" && !inv2.ok && /invite exists/.test(tx.errOf(inv2)) && !invAnon.ok && /permission denied/.test(tx.errOf(invAnon)) && !accAuth.ok && /permission denied/.test(tx.errOf(accAuth)), J([inv.ok ? "ok" : tx.errOf(inv), tx.errOf(inv2), tx.errOf(invAnon), tx.errOf(accAuth)]));
    // I-4
    const selfSet = await tx.as(ca, "select public.attendance_set_self($1, $2, $3, $4) r", [today, "late", "21:30", "電車"]);
    const logSelf = await tx.as(ca, "select public.attendance_contact_log($1, $2, $3, $4, $5) r", [castA, today, "late", "21:30", "電車"]);
    const logStore = await tx.as(mgr, "select public.attendance_contact_log($1, $2, $3, $4, $5) r", [castA, today, "absent", null, "連絡あり"]);
    const logOther = await tx.as(cb, "select public.attendance_contact_log($1, $2, $3, $4, $5) r", [castA, today, "late", null, null]);
    const attRow = await tx.one<{ id: string; ack_at: string | null }>("select id, ack_at from public.attendance where cast_id = $1 and date = $2", [castA, today]);
    const ackCast = await tx.as(ca, "select public.attendance_ack($1) r", [attRow?.id ?? "00000000-0000-0000-0000-000000000000"]);
    const ackMgr = await tx.as(mgr, "select public.attendance_ack($1) r", [attRow?.id ?? "00000000-0000-0000-0000-000000000000"]);
    const attAfter = await tx.one<{ ack_at: string | null; ack_by: string | null }>("select ack_at, ack_by from public.attendance where id = $1", [attRow?.id ?? "00000000-0000-0000-0000-000000000000"]);
    const hist = await tx.q<{ source: string; kind: string }>("select source, kind from public.attendance_contacts where cast_id = $1 and biz_date = $2 order by created_at", [castA, today]);
    const histB = await tx.as(cb, "select count(*)::text n from public.attendance_contacts where cast_id = $1", [castA]);
    check("on3(3-2) I-4＝本人の連絡（self）と店の記録（store）が履歴に 2 行・他のキャストは書けない（forbidden）・読めない（0 行）・attendance_ack＝cast は forbidden・manager で ack_at／ack_by・2 回目は no-op", selfSet.ok && logSelf.ok && logStore.ok && !logOther.ok && /forbidden/.test(tx.errOf(logOther)) && J(hist.map((h) => [h.source, h.kind])) === J([["self", "late"], ["store", "absent"]]) && histB.ok && (histB.rows[0].n as string) === "0" && !ackCast.ok && /forbidden/.test(tx.errOf(ackCast)) && ackMgr.ok && !!attAfter?.ack_at && attAfter?.ack_by === mgr.id && (await tx.as(mgr, "select public.attendance_ack($1) r", [attRow!.id])).ok, J([tx.errOf(selfSet), tx.errOf(logSelf), tx.errOf(logStore), tx.errOf(logOther), hist, tx.errOf(ackCast), tx.errOf(ackMgr), attAfter]));
    // 通知
    const nCreate = await tx.as(mgr, "select public.cast_notification_create($1, $2, $3, $4) r", [castA, "shift_added", "10/28（水） 20:00〜01:00 のシフトが確定しました", "shifts:x"]);
    const nId = nCreate.ok ? (nCreate.rows[0].r as string) : "00000000-0000-0000-0000-000000000000";
    const nBad = await tx.as(mgr, "select public.cast_notification_create($1, $2, $3, $4) r", [castA, "bogus", "x", null]);
    const nByCast = await tx.as(ca, "select public.cast_notification_create($1, $2, $3, $4) r", [castA, "other", "x", null]);
    const seeA = await tx.as(ca, "select count(*)::text n from public.cast_notifications where id = $1", [nId]);
    const seeB = await tx.as(cb, "select count(*)::text n from public.cast_notifications where id = $1", [nId]);
    const readB = await tx.as(cb, "select public.cast_notification_read($1) r", [nId]);
    const readA = await tx.as(ca, "select public.cast_notification_read($1) r", [nId]);
    const nAfter = await tx.one<{ read_at: string | null }>("select read_at from public.cast_notifications where id = $1", [nId]);
    check("on3(3-3) cast_notification_create＝manager で 1 行・bad kind・cast からは forbidden・本人だけ可視（他キャスト 0 行）・既読は本人だけ（他は not found）→read_at", nCreate.ok && !nBad.ok && /bad kind/.test(tx.errOf(nBad)) && !nByCast.ok && /forbidden/.test(tx.errOf(nByCast)) && seeA.ok && (seeA.rows[0].n as string) === "1" && seeB.ok && (seeB.rows[0].n as string) === "0" && !readB.ok && /not found/.test(tx.errOf(readB)) && readA.ok && !!nAfter?.read_at, J([tx.errOf(nCreate), tx.errOf(nBad), tx.errOf(nByCast), seeA, seeB, tx.errOf(readB), tx.errOf(readA)]));
    // 宛先つきお知らせ
    const ntc = await tx.as(mgr, "select public.notice_create_targets($1, $2, $3::uuid[], $4) r", ["提出のお願い", "シフト希望を出してください", [castA], null]);
    const ntcBad = await tx.as(mgr, "select public.notice_create_targets($1, $2, $3::uuid[], $4) r", ["x", "y", ["00000000-0000-0000-0000-000000000000"], null]);
    const ntcRow = ntc.ok ? await tx.one<{ cast_ids: string[]; audience: string }>("select cast_ids, audience from public.notices where id = $1", [ntc.rows[0].r as string]) : null;
    check("on3(3-4) notice_create_targets＝audience cast・cast_ids＝[castA]・無いキャストは 'bad targets'・client の絞り（noticeVisibleToCastOf）で castB には出ない", ntc.ok && J(ntcRow?.cast_ids) === J([castA]) && ntcRow?.audience === "cast" && !ntcBad.ok && /bad targets/.test(tx.errOf(ntcBad)) && noticeVisibleToCastOf(ntcRow?.cast_ids ?? null, castA) && !noticeVisibleToCastOf(ntcRow?.cast_ids ?? null, castB), J([tx.errOf(ntc), ntcRow, tx.errOf(ntcBad)]));
    // 期間ごとの必要人数
    const per = await tx.as(mgr, "select public.shift_period_set($1, $2, $3, $4, $5, $6) r", [null, A1.id, "2034-01-01", "2034-01-14", "2033-12-20", "open"]);
    const pid = per.ok ? (per.rows[0].r as string) : "00000000-0000-0000-0000-000000000000";
    const pn1 = await tx.as(mgr, "select public.shift_period_needs_set($1, $2::jsonb) r", [pid, J([{ dow: 1, required: 3 }, { dow: 5, required: 4 }])]);
    const pnDup = await tx.as(mgr, "select public.shift_period_needs_set($1, $2::jsonb) r", [pid, J([{ dow: 1, required: 3 }, { dow: 1, required: 4 }])]);
    const pnBad = await tx.as(mgr, "select public.shift_period_needs_set($1, $2::jsonb) r", [pid, J([{ dow: 7, required: 3 }])]);
    const pn2 = await tx.as(mgr, "select public.shift_period_needs_set($1, $2::jsonb) r", [pid, J([{ dow: 2, required: 1 }])]);
    const pnRows = await tx.q<{ dow: number; required: number }>("select dow, required from public.shift_period_needs where period_id = $1 order by dow", [pid]);
    const pnCast = await tx.as(ca, "select public.shift_period_needs_set($1, $2::jsonb) r", [pid, J([{ dow: 2, required: 1 }])]);
    check("on3(3-5) shift_period_needs_set＝2 行→全置換で 1 行（火 1）・dup dow・dow 7 は bad rows・cast は forbidden・periodNeedRequiredOf が期間×曜日で引く", per.ok && pn1.ok && !pnDup.ok && /dup dow/.test(tx.errOf(pnDup)) && !pnBad.ok && /bad rows/.test(tx.errOf(pnBad)) && pn2.ok && J(pnRows) === J([{ dow: 2, required: 1 }]) && !pnCast.ok && /forbidden/.test(tx.errOf(pnCast)) && periodNeedRequiredOf("2034-01-03", [{ id: pid, start_date: "2034-01-01", end_date: "2034-01-14" }], pnRows.map((r) => ({ period_id: pid, ...r }))) === 1, J([tx.errOf(per), tx.errOf(pn1), tx.errOf(pnDup), tx.errOf(pnBad), pnRows, tx.errOf(pnCast)]));
    // 辞退
    const sh = await tx.as(mgr, "select public.shift_set($1, $2, $3, $4, $5, $6) r", [null, castA, "2034-01-03", "20:00", "01:00", "planned"]);
    const sid = sh.ok ? (sh.rows[0].r as string) : "00000000-0000-0000-0000-000000000000";
    const prop = await tx.as(mgr, "select public.shift_propose($1::uuid[]) r", [[sid]]);
    const decB = await tx.as(cb, "select public.shift_cast_decline($1, $2) r", [sid, "x"]);
    const decMgr = await tx.as(mgr, "select public.shift_cast_decline($1, $2) r", [sid, "x"]);
    const decA = await tx.as(ca, "select public.shift_cast_decline($1, $2) r", [sid, "用事があります"]);
    const shAfter = await tx.one<{ status: string; declined_at: string | null; decline_reason: string | null }>("select status, declined_at, decline_reason from public.shifts where id = $1", [sid]);
    const decAgain = await tx.as(ca, "select public.shift_cast_decline($1, $2) r", [sid, null]);
    check("on3(3-6) shift_cast_decline＝proposed を本人が辞退→planned・declined_at・理由（他キャスト／manager は forbidden・2 回目は 'not proposed'）・店側の印 declineTextOf", sh.ok && prop.ok && !decB.ok && /forbidden/.test(tx.errOf(decB)) && !decMgr.ok && /forbidden/.test(tx.errOf(decMgr)) && decA.ok && shAfter?.status === "planned" && !!shAfter?.declined_at && shAfter?.decline_reason === "用事があります" && !decAgain.ok && /not proposed/.test(tx.errOf(decAgain)) && (declineTextOf(shAfter!) ?? "").startsWith("辞退あり "), J([tx.errOf(sh), tx.errOf(prop), tx.errOf(decB), tx.errOf(decMgr), tx.errOf(decA), shAfter, tx.errOf(decAgain)]));
    // LINE
    const cfg = await tx.as(mgr, "select public.set_store_line_config($1, $2::jsonb) r", [A1.id, J({ login_channel_id: "1234567890", liff_id: "1234567890-abcdefgh" })]);
    const cfgBad = await tx.as(mgr, "select public.set_store_line_config($1, $2::jsonb) r", [A1.id, J({ access_token_ref: "x" })]);
    const cfgDest = await tx.as(mgr, "select public.set_store_line_config($1, $2::jsonb) r", [A1.id, J({ bot_destination: "bad" })]);
    const cfgRow = await tx.one<{ cfg: Record<string, string>; lim: number }>("select line_config cfg, line_monthly_limit lim from public.stores where id = $1", [A1.id]);
    const bt = await tx.as(mgr, "select public.line_bind_token_create($1, $2, $3) r", ["cast", castA, "bind"]);
    const btTok = bt.ok ? (bt.rows[0].r as string) : "";
    const btCast = await tx.as(ca, "select public.line_bind_token_create($1, $2, $3) r", ["cast", castA, "bind"]);
    const bindAuth = await tx.as(mgr, "select public.bind_line($1, $2) r", [tokenHashOf(btTok), "U" + "a".repeat(32)]);
    const U = "U" + "0123456789abcdef".repeat(2);
    const bindOk = await tx.call("select public.bind_line($1, $2) r", [tokenHashOf(btTok), U]);
    const bindReuse = await tx.call("select public.bind_line($1, $2) r", [tokenHashOf(btTok), U]);
    const bt2 = await tx.as(mgr, "select public.line_bind_token_create($1, $2, $3) r", ["cast", castB, "bind"]);
    const bindDup = await tx.call("select public.bind_line($1, $2) r", [tokenHashOf(bt2.ok ? (bt2.rows[0].r as string) : ""), U]);
    const links = await tx.q<{ subject_kind: string; subject_id: string; line_user_id: string }>("select subject_kind, subject_id, line_user_id from public.line_links where org_id = $1 and line_user_id = $2", [A1.org_id, U]);
    const lim = await tx.as(mgr, "select public.set_store_line_limit($1, $2) r", [A1.id, 5000]);
    const limBad = await tx.as(mgr, "select public.set_store_line_limit($1, $2) r", [A1.id, 0]);
    const logAuth = await tx.as(mgr, "select public.line_push_log_write($1, $2, $3, $4, $5, $6, $7) r", [A1.id, "notice", 1, "sent", 200, "req", null]);
    const logOk = await tx.call("select public.line_push_log_write($1, $2, $3, $4, $5, $6, $7) r", [A1.id, "notice", 1, "sent", 200, "req", null]);
    const log429 = await tx.call("select public.line_push_log_write($1, $2, $3, $4, $5, $6, $7) r", [A1.id, "shift_changed", 1, "failed", 429, "req2", "quota"]);
    const logBadKind = await tx.call("select public.line_push_log_write($1, $2, $3, $4, $5, $6, $7) r", [A1.id, "cast_notification", 1, "sent", 200, null, null]);
    const sum = await tx.as(mgr, "select store_id, sent, rejected_429, monthly_limit from public.line_push_month_summary($1::date)", [jstMonthOf(Date.now()).month]);
    const sumRow = sum.ok ? (sum.rows.find((r) => r.store_id === A1.id) as { sent: number; rejected_429: number; monthly_limit: number } | undefined) : undefined;
    const sumCast = await tx.as(ca, "select * from public.line_push_month_summary($1::date)", [jstMonthOf(Date.now()).month]);
    const limAfter = await tx.one<{ lim: number }>("select line_monthly_limit lim from public.stores where id = $1", [A1.id]);
    check("on3(3-7) LINE 設定＝公開値 2 鍵が stores.line_config（ref の鍵・bad destination は拒否）・bind トークン（manager・64 桁・cast は forbidden）", cfg.ok && !cfgBad.ok && /bad key/.test(tx.errOf(cfgBad)) && !cfgDest.ok && /bad bot_destination/.test(tx.errOf(cfgDest)) && cfgRow?.cfg.login_channel_id === "1234567890" && cfgRow?.cfg.liff_id === "1234567890-abcdefgh" && bt.ok && HEX64.test(btTok) && !btCast.ok && /forbidden/.test(tx.errOf(btCast)), J([tx.errOf(cfg), tx.errOf(cfgBad), tx.errOf(cfgDest), cfgRow, tx.errOf(bt), tx.errOf(btCast)]));
    check("on3(3-8) bind_line＝authenticated は BLOCKED・service で line_links 1 行（cast）・同じトークンの再利用は 'bad token'・同じ LINE を別の人に＝'line already linked'（1 LINE＝1 人）", !bindAuth.ok && /permission denied/.test(tx.errOf(bindAuth)) && bindOk.ok && J(links.map((l) => [l.subject_kind, l.subject_id])) === J([["cast", castA]]) && !bindReuse.ok && /bad token/.test(tx.errOf(bindReuse)) && bt2.ok && !bindDup.ok && /line already linked/.test(tx.errOf(bindDup)), J([tx.errOf(bindAuth), tx.errOf(bindOk), links, tx.errOf(bindReuse), tx.errOf(bindDup)]));
    check("on3(3-9) 上限＝5,000（0 は拒否）・台帳＝authenticated は BLOCKED・service で sent 1＋429 failed 1・kind は 4 種だけ（cast_notification は bad kind）・月次＝manager 自店 1 行 sent≥1／rejected_429≥1／limit 5000・cast は forbidden", lim.ok && !limBad.ok && limAfter?.lim === 5000 && !logAuth.ok && /permission denied/.test(tx.errOf(logAuth)) && logOk.ok && log429.ok && !logBadKind.ok && /bad kind/.test(tx.errOf(logBadKind)) && !!sumRow && Number(sumRow.sent) >= 1 && Number(sumRow.rejected_429) >= 1 && Number(sumRow.monthly_limit) === 5000 && !sumCast.ok && /forbidden/.test(tx.errOf(sumCast)), J([tx.errOf(lim), tx.errOf(limBad), limAfter, tx.errOf(logAuth), tx.errOf(logOk), tx.errOf(log429), tx.errOf(logBadKind), sumRow, tx.errOf(sumCast)]));
    // 締切の自動遷移
    const per2 = await tx.as(mgr, "select public.shift_period_set($1, $2, $3, $4, $5, $6) r", [null, A1.id, "2034-02-01", "2034-02-14", "2020-01-01", "open"]);
    const closeAuth = await tx.as(mgr, "select public.shift_periods_auto_close() r");
    const closeOk = await tx.call("select public.shift_periods_auto_close() r");
    const st2 = per2.ok ? await tx.one<{ status: string }>("select status from public.shift_periods where id = $1", [per2.rows[0].r as string]) : null;
    const st1 = await tx.one<{ status: string }>("select status from public.shift_periods where id = $1", [pid]);
    check("on3(3-10) shift_periods_auto_close＝authenticated は BLOCKED・service で締切（2020-01-01）超えの open→closed（戻り≥1）・締切が先の期間は open のまま", per2.ok && !closeAuth.ok && /permission denied/.test(tx.errOf(closeAuth)) && closeOk.ok && Number(closeOk.rows[0].r) >= 1 && st2?.status === "closed" && st1?.status === "open", J([tx.errOf(per2), tx.errOf(closeAuth), tx.errOf(closeOk), st2, st1]));
  } finally {
    await c.query("rollback").catch(() => undefined);
    await c.end();
  }

  // ── (4) 招待の受諾（PostgREST・admin）＝実書込→finally で消す ──
  const url = env.NEXT_PUBLIC_SUPABASE_URL, pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ownerSb = createClient(url, pub, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `nox-verify-on3-${Date.now().toString(36)}@example.com`;
  let authUserId: string | null = null; let memId: string | null = null; let userId: string | null = null; let invId: string | null = null;
  try {
    const { error: eIn } = await ownerSb.auth.signInWithPassword({ email: FIXTURE_USERS.ownerA.email, password: env.SEED_PASSWORD });
    if (eIn) throw new Error(`owner login: ${eIn.message}`);
    const { data: inv, error: eInv } = await ownerSb.rpc("staff_invite_create", { p_store_id: A1.id, p_email: email, p_name: "招待 受諾テスト", p_role: "staff", p_contract: { contract_kind: "parttime", pay_kind: "hourly", hourly: 1300 } });
    if (eInv) throw new Error(`invite: ${eInv.message}`);
    const r = inv as { id: string; token: string };
    invId = r.id;
    const { data: cu, error: eCu } = await admin.auth.admin.createUser({ email, password: "Verify-Invite-123!", email_confirm: true });
    if (eCu || !cu?.user) throw new Error(`createUser: ${eCu?.message}`);
    authUserId = cu.user.id;
    const { data: mid, error: eAcc } = await admin.rpc("staff_invite_accept", { p_token_hash: tokenHashOf(r.token), p_auth_user_id: authUserId });
    memId = typeof mid === "string" ? mid : null;
    const { data: mem } = memId ? await admin.from("memberships").select("id, user_id, store_id, role, is_active").eq("id", memId).maybeSingle() : { data: null };
    userId = (mem?.user_id as string | undefined) ?? null;
    const { data: con } = memId ? await admin.from("staff_contracts").select("hourly, pay_kind, contract_kind").eq("membership_id", memId).maybeSingle() : { data: null };
    const { data: invRow } = await admin.from("staff_invites").select("accepted_at, accepted_user_id").eq("id", r.id).maybeSingle();
    const { error: eAgain } = await admin.rpc("staff_invite_accept", { p_token_hash: tokenHashOf(r.token), p_auth_user_id: authUserId });
    check("on3(4-1) 招待の受諾＝staff_invite_accept（service）で memberships（staff・A1・active）＋staff_contracts（hourly 1300）・招待は accepted_at／accepted_user_id・2 回目は 'bad token'", !eAcc && !!memId && mem?.role === "staff" && mem?.store_id === A1.id && mem?.is_active === true && Number(con?.hourly) === 1300 && con?.pay_kind === "hourly" && !!invRow?.accepted_at && invRow?.accepted_user_id === userId && !!eAgain && /bad token/.test(eAgain.message), J([eAcc?.message, mem, con, invRow, eAgain?.message]));
    const { error: eLogin } = await createClient(url, pub, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email, password: "Verify-Invite-123!" });
    check("on3(4-2) 受諾した本人が決めたパスワードでログインできる", !eLogin, eLogin?.message);
  } catch (e) {
    check("on3(4-0) 招待の受諾（PostgREST）が走る", false, e instanceof Error ? e.message : String(e));
  } finally {
    if (memId) await admin.from("staff_contracts").delete().eq("membership_id", memId);
    if (memId) await admin.from("memberships").delete().eq("id", memId);
    if (userId) await admin.from("users").delete().eq("id", userId);
    if (invId) await admin.from("staff_invites").delete().eq("id", invId);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    await ownerSb.auth.signOut().catch(() => undefined);
  }

  if (fails.length) { console.error(`verify:nox-on3 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-on3 OK ${pass} checks（0176 client＝通知・登録→招待・LINE・連絡の確認／履歴・連絡先・シフト 5 件・催促・相手に通知）`);
})().catch((e) => { console.error("verify:nox-on3 ERROR", e instanceof Error ? e.message : e); process.exit(1); });
