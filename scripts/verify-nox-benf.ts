/*
 * verify:nox-benf — 便 F（2026-11-06・0197 便の後）の純関数と client の pin（DB は読まない＝f0 の末尾）。
 *  (1) M-116＝LINE の期限切れ ID トークン（verifyLineIdTokenEx の reason／detail・route の 401 本文・liff-bridge の 1 回だけ再ログイン＝sessionStorage の鍵）
 *  (2) M-112＝日報プレビューの 375（見出しの縦積み・指標の帯 4 列）／(3) M-113＝ランキングの 375（3 行・CSV 右寄せ）
 *  (4) M-114＝裁定459（LINE 通知の種類ごと ON／OFF・既定＝お知らせだけ ON・notifyCast の柵・催促・LINE 連携の表示・送信数カードの 1 行・お知らせの確認）
 *  (5) M-115＝gen-demo の pick ルール 1 本（ヘアメ代 ¥500）
 *  使い方: npm run verify:nox-benf
 */
import fs from "node:fs";
import { reservationLineOf, reservationTodayLineOf, reservationBookedChipOf, sortPendingReservations, pendingTotalOf, type PendingReservation } from "../lib/nox/home/pending";
import { baseTimeDiffersOf, sortRowsByAvail, staffAvailConfirmTextOf, staffAvailJudgeOf, staffAvailNgTextOf, staffBaseTimeLabelOf, type StaffAvailMap } from "../lib/nox/shift/staff-place";
import { LINE_NOTIFY_DEFAULT, LINE_NOTIFY_KINDS, lineNotifyKindOfNotif, lineNotifyOf, lineNotifyOnOf, noticeLineConfirmOf } from "../lib/nox/line/notify-kinds";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1) M-116
const sv = src("lib/nox/line/server.ts"), bind = src("app/api/line/bind/route.ts"), ses = src("app/api/line/session/route.ts"), br = src("app/liff/[storeId]/liff-bridge.tsx");
check("benf(1-1) server＝verifyLineIdTokenEx＝reason（expired／invalid／aud／http／network）＋detail（LINE の error／error_description・id_token は出さない）・console.error・verifyLineIdToken は薄い包み",
  sv.includes("export async function verifyLineIdTokenEx(") && sv.includes('const reason: LineVerifyReason = /expired/i.test(detail) ? "expired" : res.status >= 500 ? "http" : "invalid";') && sv.includes("console.error(`line verify: ${res.status} ${reason} ${detail}`);")
  && sv.includes("const r = await verifyLineIdTokenEx(idToken, loginChannelId);") && !sv.includes("console.error(`line verify: ${idToken}") && !sv.includes("${idToken}"));
check("benf(1-2) route＝bind／session は verifyLineIdTokenEx・401 の本文に reason／detail", bind.includes('return NextResponse.json({ error: "bad id_token", reason: v.reason, detail: v.detail }, { status: 401 });') && ses.includes('return NextResponse.json({ error: "bad id_token", reason: v.reason, detail: v.detail }, { status: 401 });') && !bind.includes("verifyLineIdToken(") && !ses.includes("verifyLineIdToken("));
check("benf(1-3) liff-bridge＝401 bad id_token は sessionStorage の鍵（nox_liff_retry:<storeId>）で 1 回だけ liff.logout()→liff.login（redirectUri は M-102 の site 固定）・2 回目は期限切れの案内・成功で鍵を消す",
  br.includes('export const LIFF_RETRY_KEY_PREFIX = "nox_liff_retry:";') && br.includes('if (res.status === 401 && j.error === "bad id_token") {') && br.includes("if (!readRetry(key)) { writeRetry(key, true);") && br.includes("liff.logout(); liff.login({ redirectUri: siteHrefOf(window.location.href, siteOriginOf(window.location.origin)) }); return; }")
  && br.includes('setErr(j.reason === "expired" ? LIFF_EXPIRED_TEXT :') && br.includes("writeRetry(retryKeyOf(storeId), false);") && br.includes("LINE のログインが期限切れです。LINE アプリを閉じて開き直してください"));

// (2) M-112・(3) M-113
const rb = src("app/(manage)/report/report-board.tsx"), ab = src("app/(manage)/analytics/analytics-board.tsx"), css = src("app/globals.css");
check("benf(2-1) 日報プレビュー＝見出し（nox-rep-prevhead＝lbl nowrap・sw・bh）と指標の帯（nox-rep-kpiband）に印・480px 以下は縦積みと 4 列（td 25%）",
  rb.includes('<div className="nox-rep-prevhead"') && rb.includes('<span className="lbl" style={{ fontSize: 13, color: "var(--v2-text)", whiteSpace: "nowrap" }}>営業日</span>') && rb.includes('<span className="sw"') && rb.includes('<span className="bh"') && rb.includes('className="nox-tablewrap plain nw nox-rep-kpiband"')
  && css.includes(".nox-rep-prevhead .sw, .nox-rep-prevhead .bh { flex-basis: 100%; }") && css.includes(".nox-rep-kpiband td { display: inline-block; box-sizing: border-box; width: 25%;"));
check("benf(3-1) ランキング＝行は nm／cnt（本・場内・同伴）／cnt2（構成・報酬率）／amt に分け、480px 以下は grid 3 行（medal avatar name amt／cnt／cnt2）・CSV は見出しの下に右寄せ",
  ab.includes('<span className="nm">{r.name}</span>') && ab.includes('<span className="cnt num">本{r.hon}・場内{r.jonai}・同伴{r.dohan}</span>') && ab.includes('<span className="cnt2 num">') && ab.includes('<div className="nox-rank-head"') && ab.includes('<button className="csv"')
  && css.includes('grid-template-areas: "medal avatar name amt" "cnt cnt cnt cnt" "cnt2 cnt2 cnt2 cnt2";') && css.includes(".nox-rank-head .csv { flex-basis: 100%; margin-left: auto;"));

// (4) M-114＝裁定459
check("benf(4-1) 純関数＝既定はお知らせだけ ON・シフト系（公開／変更／催促）OFF・settings の line_notify で上書き・型違いは既定", J(lineNotifyOf(null)) === J(LINE_NOTIFY_DEFAULT) && LINE_NOTIFY_DEFAULT.notice === true && !LINE_NOTIFY_DEFAULT.shift_published && !LINE_NOTIFY_DEFAULT.shift_changed && !LINE_NOTIFY_DEFAULT.remind
  && lineNotifyOnOf({ line_notify: { shift_changed: true } }, "shift_changed") === true && lineNotifyOnOf({ line_notify: { notice: false } }, "notice") === false && lineNotifyOnOf({ line_notify: "x" }, "notice") === true && LINE_NOTIFY_KINDS.length === 4);
check("benf(4-2) 通知の kind → 種類＝shift_published／shift_*・availability_changed→shift_changed／催促の印→remind／それ以外→notice", lineNotifyKindOfNotif("shift_published") === "shift_published" && lineNotifyKindOfNotif("shift_added") === "shift_changed" && lineNotifyKindOfNotif("availability_changed") === "shift_changed" && lineNotifyKindOfNotif("other", { remind: true }) === "remind" && lineNotifyKindOfNotif("other") === "notice");
const cf1 = noticeLineConfirmOf({ recipients: 12, sent: 150, limit: 200 }), cf2 = noticeLineConfirmOf({ recipients: 60, sent: 150, limit: 200 });
check("benf(4-3) お知らせの確認文＝12 人に送ります（残り 50・送信後 38）／60 人は不足＝送らない", !cf1.blocked && cf1.text.includes("12 人に LINE で送ります（今月の残り 50 通・送信後 38 通）") && cf2.blocked && cf2.text.includes("残りは 50 通で、60 人には足りません"), J([cf1, cf2]));
const nf = src("lib/nox/people/notify.ts"), sb = src("app/(manage)/shift/shift-board.tsx"), lp = src("app/(manage)/master/line-config-panel.tsx"), qc = src("components/nox/line-quota-card.tsx"), nb = src("app/(manage)/notices/notices-board.tsx");
check("benf(4-4) notifyCast＝種類が OFF の店は LINE に送らない（line: \"off\"・通知の節には残る）・店の設定は castId→store で 1 回だけ読む・催促（shift-board）も同じ柵",
  nf.includes('if (p.line !== false && !(await lineNotifyAllowedOf(supabase, p.castId, p.lineKind ?? p.kind))) line = "off";') && nf.includes("const storeSettingsByCast = new Map<string, Promise<Record<string, unknown> | null>>();") && sb.includes('if (!(await lineNotifyAllowedOf(supabase, id, "other", { remind: true }))) continue;'));
check("benf(4-5) 店舗設定 › LINE 連携＝種類ごとの表示（data-line-notify-kinds・既定 ON／OFF・保存は 0198 の後の注記）と「1 回の送信＝友だち数ぶん・無料枠 200 通」の注記／送信数カードにライトプランの 1 行／お知らせ＝送る前に確認（不足なら送らない・notice OFF の店は掲載だけ）",
  lp.includes('data-line-notify-kinds="1"') && lp.includes("{LINE_NOTIFY_COUNT_NOTE}") && lp.includes("{LINE_NOTIFY_SAVE_PENDING_NOTE}") && qc.includes('data-line-quota-plan="1"') && qc.includes("{LINE_PLAN_UPGRADE_NOTE}")
  && nb.includes("const cf = noticeLineConfirmOf({ recipients: lineLinked ?? 0, sent: row?.sent ?? 0, limit: row?.monthly_limit ?? Number(st?.line_monthly_limit ?? 200) });") && nb.includes("else if (!window.confirm(cf.text)) { sendLine = false;"));

// (6) M-117＝予約の承認待ち（ホームの要承認の先頭・ベル・今日タブ＝同じ取得・同じ部品）
const R = (o: Partial<PendingReservation> & { id: string; reservedAt: string }): PendingReservation => ({ storeId: "s", castId: "c", castName: "ひなの", customerName: "R様", guestName: null, partySize: 2, nomType: "dohan", status: "pending", memo: null, requestedByCast: true, ...o });
const now = new Date("2026-11-06T12:00:00+09:00").getTime();
const l1 = reservationLineOf(R({ id: "a", reservedAt: "2026-11-06T20:00:00+09:00" }), now), l2 = reservationLineOf(R({ id: "b", reservedAt: "2026-11-06T11:00:00+09:00", partySize: null, nomType: "hon", requestedByCast: false }), now);
check("benf(6-1) 純関数＝1 行目「同伴 11/6 20:00 R様 2名」・2 行目「担当 ひなの・申請 キャスト」・時刻超過は過去の来店時刻・並びは来店時刻の近い順（過去＝先頭）・見出しの N に予約を合算",
  l1.head === "同伴 11/6 20:00 R様 2名" && l1.sub === "担当 ひなの・申請 キャスト" && !l1.overdue && l2.overdue && l2.head === "本指名 11/6 11:00 R様" && l2.sub.includes("申請 店")
  && sortPendingReservations([R({ id: "a", reservedAt: "2026-11-06T20:00:00+09:00" }), R({ id: "b", reservedAt: "2026-11-06T11:00:00+09:00" })]).map((r) => r.id).join() === "b,a"
  && pendingTotalOf({ approvals: [], wishes: [], missingOut: [], reservations: [1, 2] }) === 2 && reservationTodayLineOf(R({ id: "a", reservedAt: "2026-11-06T20:00:00+09:00" })) === "同伴の申請 20:00 R様 2名" && reservationBookedChipOf(R({ id: "a", reservedAt: "2026-11-06T20:00:00+09:00", status: "booked" })) === "同伴 20:00 R様", J([l1, l2]));
const pr = src("app/api/home/pending/route.ts"), pc = src("components/nox/pending-card.tsx"), rd = src("components/nox/reservation-decide.tsx"), prs = src("lib/nox/home/pending-reservations.ts"), sb2 = src("app/(manage)/shift/shift-board.tsx");
check("benf(6-2) 取得は 1 本（pendingReservationsOf＝route とシフトの今日タブが同じ）・route は total に含める（ベル）・決裁の部品は 1 つ（ReservationDecide＝reservation_decide・却下は ReasonModal・「レジの予約で開く ›」）",
  pr.includes("reservations = (await pendingReservationsOf(supabase, storeId)).pending;") && pr.includes("total: pendingTotalOf({ approvals, wishes, missingOut, reservations })") && prs.includes('q = q.in("status", ["pending", "booked"]).gte("reserved_at", rg.from).lt("reserved_at", rg.to);')
  && rd.includes('supabase.rpc("reservation_decide", { p_reservation_id: r.id, p_decision: decision, p_reason: decision === "reject" ? reason : null })') && rd.includes('<ReasonModal title="予約の申請を却下する"') && rd.includes("{RESERVATION_OPEN_REGISTER}")
  && sb2.includes("setTodayRsv(await pendingReservationsOf(supabase, storeId, { bizDate: todayDate, cutoffHm: cutoff }))") && !sb2.includes('rpc("reservation_decide"'));
check("benf(6-3) ホーム＝予約の申請が先頭（approvals の前）・時刻超過の印・ReservationDecide／今日タブ＝担当キャストの名前の下に申請（承認／却下＝compact）と承認済みの緑チップ・nox:reservation-decided で取り直す",
  pc.indexOf("data-pending-reservation={r.id}") < pc.indexOf("data-pending-approval={a.id}") && pc.includes('data-pending-overdue-mark="1"') && pc.includes("<ReservationDecide r={r} onDone=")
  && sb2.includes("data-today-rsv-pending={r.id}") && sb2.includes("<ReservationDecide r={r} compact onDone=") && sb2.includes("data-today-rsv-booked={r.id}") && sb2.includes('window.addEventListener("nox:reservation-decided", on)'));

// (7) M-118＝スタッフ配置モーダルが「基本の働き方」を参照
{
  const map: StaffAvailMap = { s1: { rows: { 3: { avail: "ng", from_min: null, to_min: null }, 4: { avail: "ask", from_min: 1080, to_min: 1380 }, 5: { avail: "ok", from_min: 1200, to_min: 1500 } }, effectiveFrom: "2026-11-06" } };
  const j3 = staffAvailJudgeOf(map, "s1", "2026-11-25"), j4 = staffAvailJudgeOf(map, "s1", "2026-11-26"), j5 = staffAvailJudgeOf(map, "s1", "2026-11-27"), jb = staffAvailJudgeOf(map, "s1", "2026-11-04"), jx = staffAvailJudgeOf(map, "s2", "2026-11-25");
  check("benf(7-1) 純関数＝11/25（水）不可・11/26（木）相談＋基本時間 18:00〜23:00・11/27（金）可＋基本時間 20:00〜25:00（翌 01:00）・適用開始日（11/6）より前の 11/4 は判定しない・設定なしは null",
    j3.avail === "ng" && j3.dowJa === "水" && j3.baseStart === null && j4.avail === "ask" && j4.baseStart === "18:00" && j4.baseEnd === "23:00" && j5.avail === "ok" && j5.baseEnd === "25:00" && jb.avail === null && jx.avail === null, J([j3, j4, j5, jb, jx]));
  check("benf(7-2) 文言＝「基本の働き方では水曜は不可です（配置はできますが本人に確認してください）」・確認文・「本人の基本時間で（18:00〜23:00）」・基本時間が枠と違うときだけ・不可の人は末尾",
    staffAvailNgTextOf("水") === "基本の働き方では水曜は不可です（配置はできますが本人に確認してください）" && staffAvailConfirmTextOf("小林", "水").startsWith("小林 の基本の働き方では水曜は不可です") && staffBaseTimeLabelOf("18:00", "23:00") === "本人の基本時間で（18:00〜23:00）"
    && baseTimeDiffersOf(j4, "18:00", "23:00") === false && baseTimeDiffersOf(j4, "19:00", "23:00") === true && baseTimeDiffersOf(j3, "19:00", "23:00") === false
    && sortRowsByAvail([{ id: "a", av: "ng" as const }, { id: "b", av: "ok" as const }, { id: "c", av: null }], (r) => r.av).map((r) => r.id).join() === "b,c,a");
  const spd = src("app/(manage)/shift/staff-place-day.tsx"), spf = src("app/(manage)/shift/staff-place-form.tsx"), ssm = src("app/(manage)/shift/staff-shift-manage.tsx");
  check("benf(7-3) client＝manage が availability（from_min／to_min）と availability_terms（effective_from）を読む・左の一覧は sortRowsByAvail（不可＝末尾・グレー・印）・右の配置欄に赤文／相談の 1 行／本人の基本時間ボタン／不可は 1 回だけ window.confirm・キャスト側（day-add-panel）は触らない",
    ssm.includes('supabase.from("availability").select("membership_id, dow, avail, from_min, to_min")') && ssm.includes('supabase.from("availability_terms").select("membership_id, effective_from")') && spd.includes("sortRowsByAvail(staffRowsForDay(staff, wishes, shifts, day), (r) => judgeOf(r.staff.id).avail)")
    && spd.includes('data-staff-row-avail={jg.avail ?? ""}') && spd.includes("avail={judgeOf(sel.staff.id)}") && spf.includes('data-staff-avail-note="ng"') && spf.includes('data-staff-avail-note="ask"') && spf.includes('data-staff-base-time="1"')
    && spf.includes('if (avail?.avail === "ng" && !ngConfirmed) { if (!window.confirm(staffAvailConfirmTextOf(staffName, avail.dowJa))) return; setNgConfirmed(true); }') && !src("app/(manage)/shift/day-add-panel.tsx").includes("staffAvailJudgeOf"));
}

// (8) M-119＝裁定460＝本人セッションは本店のページ・ナビ・部品（違いは帯だけ）
{
  const lay = src("app/(manage)/layout.tsx"), g = src("components/nox/kiosk-person-guard.tsx"), ps = src("lib/nox/kiosk/person-session.ts"), css2 = src("app/globals.css"), rb2 = src("app/(manage)/register/register-board.tsx");
  check("benf(8-1) layout＝本人セッションでも通常の groups（kioskNavOf は使わない）・data-kiosk-person の印・owner／cast は /kiosk へ（従来）", lay.includes("const navGroups: NavGroup[] = groups;") && !lay.includes("? kioskNavOf(role,") && lay.includes('data-kiosk-person={kioskPersonOn ? "1" : "0"}') && lay.includes('redirect("/kiosk?person=deny")'));
  check("benf(8-2) 帯＝上に固定（top 0・38px）・名前・無操作の残り（15 秒ごと）・「ロック（端末へ戻る）」＝kiosk_person_end（lock）・「キオスクへ戻る」（manual）・無操作＝idle・本体の余白は globals.css",
    g.includes('position: "fixed", left: 0, right: 0, top: 0, zIndex: 60') && g.includes('document.documentElement.setAttribute("data-kiosk-person-bar", "1");') && g.includes("kioskPersonRemainTextOf(remainMin)") && g.includes('void endKioskPersonSession(createClient(), "lock")') && g.includes('endKioskPersonSession(createClient(), "manual")') && g.includes("isPin ? endKioskPersonSession(supabase, reason) : leaveKioskPersonLogin(supabase)")
    && ps.includes('export const KIOSK_PERSON_LOCK = "ロック（端末へ戻る）";') && css2.includes('html[data-kiosk-person-bar="1"] .nox-layout { padding-top: 38px; }') && css2.includes('html[data-kiosk-person-bar="1"] .nox-tb { top: 38px; }'));
  check("benf(8-3) 本店の部品そのまま＝卓カードの写真（register-board＝signCastPhotos）・予約の承認（ReservationDecide）・配置（staff-place-day）・日報（report-board）は本人セッションの分岐を持たない", rb2.includes("signCastPhotos") && !rb2.includes("kioskPerson") && !src("app/(manage)/report/report-board.tsx").includes("kioskPerson") && !src("app/(manage)/shift/staff-place-day.tsx").includes("kioskPerson") && !src("components/nox/pending-card.tsx").includes("kioskPerson"));
}

// (5) M-115
const gd = src("scripts/demo/gen-demo.mjs");
check("benf(5-1) gen-demo＝deductions に pick ルール 1 本（ヘアメ代 500・per day・agreed_cost・day_rule pick・is_active）", gd.includes('push("deductions", { id: uid(`ded:${code}:hairmake`), store_id: storeId, name: "ヘアメ代", amount: 500, per: "day", is_active: true, kind: "agreed_cost", day_rule: "pick" });'));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-benf ALL PASS (${pass} assertions)`);
