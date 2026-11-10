/*
 * verify:nox-benf — 便 F（2026-11-06・0197 便の後）の純関数と client の pin（DB は読まない＝f0 の末尾）。
 *  (1) M-116＝LINE の期限切れ ID トークン（verifyLineIdTokenEx の reason／detail・route の 401 本文・liff-bridge の 1 回だけ再ログイン＝sessionStorage の鍵）
 *  (2) M-112＝日報プレビューの 375（見出しの縦積み・指標の帯 4 列）／(3) M-113＝ランキングの 375（3 行・CSV 右寄せ）
 *  (4) M-114＝裁定459（LINE 通知の種類ごと ON／OFF・既定＝お知らせだけ ON・notifyCast の柵・催促・LINE 連携の表示・送信数カードの 1 行・お知らせの確認）
 *  (5) M-115＝gen-demo の pick ルール 1 本（ヘアメ代 ¥500）
 *  使い方: npm run verify:nox-benf
 */
import fs from "node:fs";
import { dayDedAppliedTextOf } from "../lib/nox/payroll/day-ded-pick"; // ★裁定461／M-120
import { loanAgreedMapOf, loanStatusLabelOf, loanAckLabelOf } from "../lib/nox/payroll/loan-ledger"; // ★M-123
import { MIG_0199_APPLIED, mig0199On, __set0199ForTest } from "../lib/nox/rules-0175/flag"; // ★0199（裁定466・M-125）
import { kioskPersonSessionAllowedOf } from "../lib/nox/kiosk/person-session"; // ★M-125
import { kioskHomeTilesOf, kioskTilesShownOf } from "../lib/nox/rules-0175/kiosk"; // ★裁定468／M-127
import { errJa, errUnknownOf, requiredNoteOf } from "../lib/nox/errors"; // ★裁定467／M-126
import { equalSplitOf, weightsAfterRemovalOf, removeShareConfirmTextOf, NOM_X_CLOSED_REASON } from "../lib/nox/nom-shares"; // ★裁定462／M-121
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
check("benf(4-5) 店舗設定 › LINE 連携＝種類ごとの表示（data-line-notify-kinds・既定 ON／OFF・★0199＝管理者は保存＝set_store_profile に 4 鍵明示・manager／デモは表示だけ）と「1 回の送信＝友だち数ぶん・無料枠 200 通」の注記／送信数カードにライトプランの 1 行／お知らせ＝送る前に確認（不足なら送らない・notice OFF の店は掲載だけ）",
  lp.includes('data-line-notify-kinds="1"') && lp.includes("{LINE_NOTIFY_COUNT_NOTE}") && lp.includes("const notifyEditable = isOwner && !isDemo && mig0199On();") && lp.includes('p_patch: lineNotifyPatchOf(notify)') && lp.includes('data-line-notify-save="1"') && lp.includes("!mig0199On() ? LINE_NOTIFY_SAVE_PENDING_NOTE : LINE_NOTIFY_OWNER_NOTE") && qc.includes('data-line-quota-plan="1"') && qc.includes("{LINE_PLAN_UPGRADE_NOTE}")
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
  check("benf(8-1) layout＝本人セッションは帯のナビだけ 5 つ（★裁定469（M-128・2026-11-09）: kioskPersonNavOf・cast はレジだけ）・それ以外は通常の groups・data-kiosk-person の印・owner は /kiosk へ（従来）", lay.includes("const navGroups: NavGroup[] = kioskPerson ? kioskPersonNavOf(role as string, { crm: staffCrm, shift: staffShift, register: staffRegister }) : groups;") && !lay.includes("? kioskNavOf(role,") && lay.includes('data-kiosk-person={kioskPersonOn ? "1" : "0"}') && lay.includes('redirect("/kiosk?person=deny")'));
  check("benf(8-2) 帯＝上に固定（top 0・38px）・名前・無操作の残り（15 秒ごと）・「ロック（端末へ戻る）」＝kiosk_person_end（lock）・「キオスクへ戻る」（manual）・無操作＝idle・本体の余白は globals.css",
    g.includes('position: "fixed", left: 0, right: 0, top: 0, zIndex: 60') && g.includes('document.documentElement.setAttribute("data-kiosk-person-bar", "1");') && g.includes("kioskPersonRemainTextOf(remainMin)") && g.includes('void endKioskPersonSession(createClient(), "lock")') && g.includes('endKioskPersonSession(createClient(), "manual")') && g.includes("isPin ? endKioskPersonSession(supabase, reason) : leaveKioskPersonLogin(supabase)")
    && ps.includes('export const KIOSK_PERSON_LOCK = "ロック（端末へ戻る）";') && css2.includes('html[data-kiosk-person-bar="1"] .nox-layout { padding-top: var(--nox-kpbar, 38px); }') && css2.includes('html[data-kiosk-person-bar="1"] .nox-tb { top: var(--nox-kpbar, 38px); }') && g.includes('document.documentElement.style.setProperty("--nox-kpbar"'));
  check("benf(8-3) 本店の部品そのまま＝卓カードの写真（register-board＝signCastPhotos）・予約の承認（ReservationDecide）・配置（staff-place-day）・日報（report-board）は本人セッションの分岐を持たない", rb2.includes("signCastPhotos") && !rb2.includes("kioskPerson") && !src("app/(manage)/report/report-board.tsx").includes("kioskPerson") && !src("app/(manage)/shift/staff-place-day.tsx").includes("kioskPerson") && !src("components/nox/pending-card.tsx").includes("kioskPerson"));
}

// (9) 夜便レーン 2＝前借り（貸付）の client（裁定458 ①④⑤・DDL なし分）
{
  const ao = src("lib/nox/payroll/advance-okuri.ts"), bl = src("lib/nox/payroll/breakdown-lines.ts"), pb2 = src("app/(manage)/payroll/payroll-board.tsx"), af = src("components/nox/advance-okuri-form.tsx"), cp2 = src("lib/nox/report/cash-payout.ts");
  check("benf(9-1) 名称＝ISSUE_LABEL.advance「前借り（貸付）」・貸付日・明細の行「貸付返済（前借り）」（源泉の後）・給与一覧の列「貸付返済」・現金支払の行名・一括発行の見出し・天引きの節見出し・キャスト詳細の節",
    ao.includes('advance: "前借り（貸付）"') && ao.includes('advance: "貸付日"') && bl.includes('dpush("adv", "貸付返済（前借り）"') && bl.indexOf('dpush("withholding"') < bl.indexOf('dpush("adv", "貸付返済（前借り）"') && pb2.includes(">貸付返済</th>") && cp2.includes('advance: "前借り（貸付）"')
    && src("components/nox/issue-bulk-form.tsx").includes('"前借り（貸付）の一括発行（送りは「なし」の店）"') && src("app/(manage)/master/deduction-panel.tsx").includes(">天引き（前借り（貸付）・送り）</h2>") && src("app/(manage)/casts/casts-board.tsx").includes(">前借り（貸付）／送り実費</h3>"));
  check("benf(9-2) 日払いの店＝advanceHiddenForStoreOf（settlement_cycle='daily'）・AdvanceOkuriForm が店の設定を 1 回読んで前借りの行を出さない（送り実費は残す・only=advance は注記だけ）",
    ao.includes('export const advanceHiddenForStoreOf = (settings: Record<string, unknown> | null | undefined): boolean => settlementCycleOf(settings) === "daily";') && af.includes("setDailyStore(advanceHiddenForStoreOf(") && af.includes('data-advance-daily-hidden="1"') && af.includes('{only !== "transport" && !dailyStore && <IssueRow kind="advance"'));
}

// (10) 夜便レーン 3＝0198 の器（MIG_0198_APPLIED=false の間は出さない・送らない）
{
  const fl = src("lib/nox/rules-0175/flag.ts"), pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"), af3 = src("components/nox/advance-okuri-form.tsx"), ao3 = src("lib/nox/payroll/advance-okuri.ts");
  check("benf(10-1) フラグ＝MIG_0198_APPLIED=true（2026-11-09 手貼り）・mig0198On／__set0198ForTest の器",
    fl.includes("export const MIG_0198_APPLIED = true;") && fl.includes("export function mig0198On(): boolean { return override0198 ?? MIG_0198_APPLIED; }") && fl.includes("export function __set0198ForTest(v: boolean | null): void { override0198 = v; }"));
  check("benf(10-2) 待遇プラン＝「前借り（貸付）の取扱いに同意」（data-advance-loan-agreed）は mig0198On() のときだけ出す・set_comp_plan の 33 引数目も同じ条件（手貼り前は旧 32 引数のまま）",
    pe.includes("{mig0198On() && (<label data-advance-loan-agreed") && pe.includes("...(mig0198On() ? { p_advance_loan_agreed: draft.advanceLoanAgreed } : {}),") && pe.includes("advanceLoanAgreed: p.advance_loan_agreed ?? false,") && src("app/(manage)/master/cast-comp/comp-sections.tsx").includes("advance_loan_agreed?: boolean | null; advance_loan_agreed_at?: string | null;"));
  check("benf(10-3) 貸付の入口＝PIN 欄（data-loan-pin・4〜6 桁・空＝立会い）は advance かつ mig0198On() のときだけ・そのときは cast_loan_grant（p_pin）・それ以外は従来の route",
    af3.includes('const loanPin = kind === "advance" && mig0198On();') && af3.includes("{loanPin && (<label data-loan-pin") && af3.includes('createClient().rpc("cast_loan_grant", { p_store_id: storeId, p_cast_id: b.body.castId, p_amount: b.body.amount, p_biz_date: date, p_note: b.body.note, p_pin: pin === "" ? null : pin })')
    && ao3.includes("export const LOAN_PIN_RE = /^[0-9]{4,6}$/;") && ao3.includes('if (m.includes("bad pin")) return "PIN が違います（本人確認）";'));
  check("benf(10-4) create-org の既定 --site＝noxapp.jp（vercel.app は fallback・レーン 4）", src("scripts/admin/create-org.mjs").includes('opt("site", "https://noxapp.jp")'));
}

// (11) 裁定461／M-120＝今日の控除の選択は店側だけ（0198 同乗＝client は MIG_0198_APPLIED の配下）
{
  const sb = src("app/(manage)/shift/shift-board.tsx"), dd = src("components/nox/day-ded-after-punch.tsx"), pa = src("app/mine/punch-actions.tsx"), mp = src("app/mine/page.tsx"), kp = src("app/kiosk/page.tsx"), dp = src("lib/nox/payroll/day-ded-pick.ts");
  check("benf(11-1) 今日タブの代行＝punch_proxy 'in' の直後に mig0198On() のときだけ DayDedAfterPunch（data-day-ded-after・既定どおりは外せる・額の上書き・省略＝送らない・保存＝cast_day_deductions_set）",
    sb.includes("if (!pe && mig0198On() && attDate === todayDate) setDayDedAfter({ castId });") && sb.includes("<DayDedAfterPunch storeId={storeId} castId={dayDedAfter.castId}")
    && dd.includes('const rows = dayDedRowsOf(rules, initial, state);') && dd.includes('if (!rows) { onClose(); return; }') && dd.includes('rpc("cast_day_deductions_set", { p_cast_id: castId, p_biz_date: biz, p_rows: rows })')
    && dd.includes('.filter((d) => rc.get(d.id)?.enabled !== false)') && dd.includes("amount: rc.get(d.id)?.amount_override ?? d.amount") && dd.includes("data-day-ded-after-skip"));
  check("benf(11-2) /mine＝0198 後は選択肢を出さず・送らず（cast 経路は forbidden）・「今日の控除＝○○ ¥○○（店が付けました）」の表示だけ（cast_day_applied_of）",
    pa.includes('if (!error && type === "in" && mig0196On() && !mig0198On() && bizToday) {') && pa.includes("{mig0196On() && !mig0198On() && dayDedRules.length > 0 && btn.inEnabled && (") && pa.includes("<p data-mine-day-ded-applied={String(dayDedApplied.length)}")
    && mp.includes('await supabase.rpc("cast_day_applied_of", { p_cast_id: meCast.id, p_biz_date: bizToday })') && mp.includes("mig0196On() && !mig0198On() && myStore")
    && dp.includes('export const DAY_DED_APPLIED_BY_STORE = "（店が付けました）";') && dayDedAppliedTextOf([{ id: "a", name: "ヘアメ代", amount: 500 }, { id: "b", name: "送迎", amount: 1000 }]) === "今日の控除＝ヘアメ代 ¥500・送迎 ¥1,000（店が付けました）" && dayDedAppliedTextOf([]) === "今日の控除＝なし");
  check("benf(11-3) キオスク PIN 出勤＝0198 後は聞かずに打刻（dayded の段を飛ばす）・結果に kiosk_punch の返り day_applied を表示だけ",
    kp.includes('if (target.staff || !mig0196On() || mig0198On()) { void punch("in"); return; }') && kp.includes('if (!error && pj?.ok && type === "in" && mig0198On() && Array.isArray(pj.day_applied)) note = dayDedAppliedTextOf(pj.day_applied as DayDedApplied[]);'));
  check("benf(11-4) verify 0196／0195 の該当段は MIG_0198_APPLIED で反転（cast セルフ腕＝forbidden・kiosk_punch の p_day_deductions＝操作担当なしは forbidden・staff の自店＝ok）",
    src("scripts/verify-nox-0196.ts").includes('MIG_0198_APPLIED ? "0196(4-15) cast セルフ腕＝0198（裁定461）で撤回＝forbidden"') && src("scripts/verify-nox-0196.ts").includes('"0196(4-24b) 0198 後＝出勤 ok の返りに day_applied（配列＝店が付けた行）"') && src("scripts/verify-nox-0195.ts").includes('MIG_0198_APPLIED ? "0195(4-5) スタッフ（自店）は 0198（裁定461）で ok"'));
}
// (12) 裁定462／M-121＝「指名の分配率」の ✕ は着卓中でも押せる（確認 1 回で離卓＋除外）・不可は締め済みだけ・残りは均等・44px
{
  const rb = src("app/(manage)/register/register-board.tsx");
  check("benf(12-1) 純関数＝equalSplitOf（floor＋端数を先頭から）・weightsAfterRemovalOf（残りの合計が 100 なら現在値・でなければ均等・除外 id は落とす）・確認文",
    JSON.stringify(equalSplitOf(["a", "b", "c"])) === JSON.stringify({ a: 34, b: 33, c: 33 }) && JSON.stringify(equalSplitOf([])) === "{}"
    && JSON.stringify(weightsAfterRemovalOf({ a: 50, b: 50 }, "b", ["a", "b"])) === JSON.stringify({ a: 100 })
    && JSON.stringify(weightsAfterRemovalOf({ a: 70, b: 30, c: 0 }, "c", ["a", "b", "c"])) === JSON.stringify({ a: 70, b: 30 })
    && JSON.stringify(weightsAfterRemovalOf({ a: 50, b: 30, c: 20 }, "c", ["a", "b", "c"])) === JSON.stringify({ a: 50, b: 50 })
    && removeShareConfirmTextOf("のあ", true, "A3") === "のあ を離卓し、分配から外します（誤着卓の訂正）。付いている指名料／同伴料の明細行も取り消します。A3 の着卓はそのままです。よろしいですか？"
    && removeShareConfirmTextOf("せな", false, null) === "せな を離卓し、分配から外します（誤着卓の訂正）。よろしいですか？");
  check("benf(12-2) ✕＝disabled は締め済み（status≠open・day closed）だけ＝灰＋理由 1 行（data-nom-x-reason）・タップ領域 44px・「先に指名料を取り消してください」の柵は撤去",
    rb.includes('disabled={feeBusy || check.status !== "open" || dayClosed}') && rb.includes("minWidth: 44, minHeight: 44") && rb.includes("data-nom-x-reason={ca.id}") && !rb.slice(rb.indexOf("async function removeShareCast"), rb.indexOf("async function", rb.indexOf("async function removeShareCast") + 10)).includes("先に指名料を取り消してください") && rb.includes("NOM_X_CLOSED_REASON") && NOM_X_CLOSED_REASON === "締め済みの伝票は変更できません");
  check("benf(12-3) 押す＝確認 1 回（removeShareConfirmTextOf）→ check_set_nominations の全置換＝当該 cast は ended＋weight 0＋free（離卓＋除外＋課金行の取消）・残りは weightsAfterRemovalOf・loadOpenMap まで",
    rb.includes("if (inDb && !window.confirm(removeShareConfirmTextOf(castName(castId), castFeeLines(castId).length > 0, servingSeat.get(castId)))) return;")
    && rb.includes('? { cast_id: n.cast_id, weight: 0, nom_kind: "free" as const, is_dohan: false, ended: true }') && rb.includes("const nextW = weightsAfterRemovalOf(nomWeights, castId, remainIds);") && rb.includes("を離卓し、分配から外しました"));
}
// (14) 裁定466／M-125＝キオスクの本人セッションの cast（MIG_0199 配下＝起草のみ・フラグ false）
{
  const fl9 = src("lib/nox/rules-0175/flag.ts"), ps9 = src("lib/nox/kiosk/person-session.ts"), ly9 = src("app/(manage)/layout.tsx");
  check("benf(14-1) フラグ＝MIG_0199_APPLIED=true（2026-11-10 Agoora 手貼り・検証 9 行一致）・mig0199On／__set0199ForTest の器", (MIG_0199_APPLIED as boolean) === true && mig0199On() === true && fl9.includes("export const MIG_0199_APPLIED = true;"));
  __set0199ForTest(false); const castOff = kioskPersonSessionAllowedOf("cast"); __set0199ForTest(null);
  check("benf(14-2) kioskPersonSessionAllowedOf＝cast はフラグ true のときだけ（false にすると manager／staff だけ＝従来どおり）・cookie の解読も同じ述語", kioskPersonSessionAllowedOf("cast") === true && castOff === false && kioskPersonSessionAllowedOf("staff") === true && kioskPersonSessionAllowedOf("owner") === false && ps9.includes('(mig0199On() && role === "cast")') && ps9.includes("|| !kioskPersonSessionAllowedOf(role)) return null;"));
  check("benf(14-3) layout＝本人セッションの cast は /register だけ（cast_register_device を見ない・他は /register へ・ナビ＝レジ 1 つ・帯は出す）", ly9.includes('const kioskPersonCast = mig0196On() && mig0199On() && role === "cast"') && ly9.includes('if (!(pn === "/register" || pn.startsWith("/register/"))) redirect("/register");') && ly9.includes('let castReg = !!kioskPersonCast;') && ly9.includes('items: kioskPersonCast ? [{ href: "/register", label: "レジ" }]') && ly9.includes('|| (mig0199On() && role === "cast")); // ★0199'));
}
// (13) M-123（裁定464 付帯①・0198 のフラグ便）＝貸付台帳の「同意未」と返済済
{
  const ll = src("lib/nox/payroll/loan-ledger.ts"), pb3 = src("app/(manage)/payroll/payroll-board.tsx"), af4 = src("components/nox/advance-okuri-form.tsx");
  check("benf(13-1) 純関数＝loanAgreedMapOf（現在のプランの advance_loan_agreed・プラン無し＝false）・返済済／未回収／取消・本人確認 PIN／立会い",
    JSON.stringify(loanAgreedMapOf([{ cast_id: "a", plan_id: "p1", valid_from: "2026-01-01", valid_to: null }, { cast_id: "b", plan_id: "p2", valid_from: null, valid_to: "2026-01-31" }, { cast_id: "c", plan_id: "p1", valid_from: null, valid_to: null }], { p1: true, p2: true }, "2026-11-09")) === JSON.stringify({ a: true, c: true })
    && loanStatusLabelOf("deducted") === "返済済" && loanStatusLabelOf("open") === "未回収" && loanAckLabelOf("pin") === "PIN" && loanAckLabelOf("manager") === "立会い" && ll.includes('export const LOAN_NOT_AGREED = "同意未";'));
  check("benf(13-2) 給与＝貸付残高一覧に「同意未」（data-loan-agreed）・貸付台帳（直近 30 件＝view cast_loans・data-loan-ledger／data-loan-status・返済済は nox-stpill ok）＝mig0198On() のときだけ読む",
    pb3.includes('supabase.from("cast_loans").select("id, cast_id, cast_name, biz_date, amount, repaid, remaining, status, ack_method, note").eq("store_id", storeId).order("biz_date", { ascending: false }).limit(30)') && pb3.includes("if (mig0198On()) {") && pb3.includes("data-loan-ledger={String(loanLedger.length)}") && pb3.includes('className={l.status === "deducted" ? "nox-stpill ok" : "nox-stpill"}') && pb3.includes('data-loan-agreed="0" title='));
  check("benf(13-3) 貸付伝票（AdvanceOkuriForm）＝対象キャストの現在のプランが同意未なら印（data-loan-agreed=0・発行は止めない）", af4.includes("{loanPin && loanAgreed === false && (") && af4.includes("setLoanAgreed(loanAgreedOf(map, loanCast));"));
}
// (15) 裁定468／M-127＝キオスクのタブは店の設定に従う・/mine の出勤／退勤ボタンは「本人がスマホで押す」ON のときだけ
{
  const kp7 = src("app/kiosk/page.tsx"), mp7 = src("app/mine/page.tsx"), rt7 = src("app/api/kiosk/punch-methods/route.ts");
  check("benf(15-1) 純関数＝kioskHomeTilesOf（出退勤＝punch_methods.kiosk ∧ 打刻する店・他は kiosk_features）・kioskTilesShownOf（0 個は描かない・出退勤だけも描かない）",
    JSON.stringify(kioskHomeTilesOf(null, { kiosk: true }, false, true)) === JSON.stringify(["punch", "register", "shift", "inventory", "report"]) && JSON.stringify(kioskHomeTilesOf(null, { kiosk: false }, false, true)) === JSON.stringify(["register", "shift", "inventory", "report"])
    && JSON.stringify(kioskHomeTilesOf({ kiosk_features: { register: false, shift: false, inventory: false, report: false } }, { kiosk: true }, true, true)) === "[]" && kioskTilesShownOf([]) === false && kioskTilesShownOf(["punch"]) === false && kioskTilesShownOf(["punch", "register"]) === true && kioskTilesShownOf(["register"]) === true);
  check("benf(15-2) API＝tiles は kioskHomeTilesOf（punch_methods・punch_mode）・キオスク＝kiosk=false で名前タイルを出さない（data-kiosk-punch-off）・0 個＝案内（data-kiosk-no-tiles）＋PIN の入口",
    rt7.includes('tiles: kioskHomeTilesOf(sj, pm, punchMode === "store")') && kp7.includes("if (j && j.kiosk === false) { setKioskPunchOff(true); setStorePunchOff(true); }") && kp7.includes('data-kiosk-punch-off="1"') && kp7.includes("(castPunchOff || kioskPunchOff ? [] : casts).map(") && kp7.includes('data-kiosk-no-tiles="1"') && kp7.includes("{!storePunchOff && (<p style={{ textAlign: \"center\", fontSize: 15"));
  check("benf(15-3) /mine＝打刻カードは残しボタンだけ出さない（data-mine-punch-off・今日のシフト・最終打刻・勤怠一覧・店が付けた控除は残る）",
    mp7.includes('<section className="nox-panel" data-mine-punch-off={minePunchOff ? "1" : "0"}>') && mp7.includes('{minePunchOff ? (<><p className="nox-pstate" data-cast-punch-off="1"') && (mp7.match(/data-mine-day-ded-applied=\{String\(mineDayDedApplied\.length\)\}/g) ?? []).length === 2);
}
// (16) 裁定467／M-126＝利用者向けの文言は日本語・辞書 1 本（lib/nox/errors）・入力不足は RPC の前に止める
{
  const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx"), re = src("lib/nox/ui/rpc-err.ts");
  check("benf(16-1) 辞書＝forbidden／permission denied → 権限がありません・bad pin → PIN が違います・bad name → 名称を入力・不明は「処理できませんでした（bad xxx）」・日本語はそのまま",
    errJa("forbidden") === "権限がありません" && errJa("permission denied for function x") === "権限がありません" && errJa("bad pin") === "PIN が違います" && errJa("bad name").startsWith("名称を入力") && errJa("bad zzz") === "処理できませんでした（bad zzz）" && errUnknownOf("x") === "処理できませんでした（x）" && errJa("保存しました") === "保存しました" && errJa(null) === "処理できませんでした");
  check("benf(16-2) rpcErrJa は辞書へ委ねる（専用語の MAP の後）・compErrJa の残りも辞書（生の英字を返さない）", re.includes("return errJa(m); // ★裁定467") && cs.includes("return errJa(msg); // ★裁定467") && !/処理できませんでした（コード:/.test(re));
  check("benf(16-3) 控除の名称が空なら登録を押せない＋欄の下に「名称を入力してください」（data-ded-name-required・data-ded-save）", requiredNoteOf("", "名称") === "名称を入力してください" && requiredNoteOf(" 送り ", "名称") === null && cs.includes('disabled={!!requiredNoteOf(name, "名称")} data-ded-save="1"') && cs.includes('data-ded-name-required="1"'));
}
// (5) M-115
const gd = src("scripts/demo/gen-demo.mjs");
check("benf(5-1) gen-demo＝deductions に pick ルール 1 本（ヘアメ代 500・per day・agreed_cost・day_rule pick・is_active）", gd.includes('push("deductions", { id: uid(`ded:${code}:hairmake`), store_id: storeId, name: "ヘアメ代", amount: 500, per: "day", is_active: true, kind: "agreed_cost", day_rule: "pick" });'));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-benf ALL PASS (${pass} assertions)`);
