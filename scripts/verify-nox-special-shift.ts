/*
 * verify:nox-special-shift — 2026-11-22（相談役 14:10 の 3・裁定478・DB 変更 0）: シフト作成から臨時営業・臨時休業を前もって登録する。
 *  今ある関数だけ（set_store_special_day／remove_store_special_day＝owner と自店の manager・過去の日は 'past day'・卓がある日は 'day has checks'）。
 *  (1) 純関数（lib/nox/shift/special-day.ts）＝休みの判定は臨時の日が先・必要人数の曜日は臨時営業で選んだ曜日・臨時営業の日の営業時間・選べる曜日は定休以外・出すボタン（店長以上・過去の日は出さない）
 *  (2) シフト作成（shift-board）＝isClosedDay が臨時の日を見る（カレンダー・必要人数・追加の口が同じ判定）・必要人数は needDowOf・price_dow と時刻を読む・③配置の日のモーダルに ShiftSpecialDay
 *  (3) 部品（shift-special-day）＝既存の 2 関数だけ・料金と必要人数の曜日は既定の選択なし・臨時休業はシフトの人数で確かめる・ボタンは中央（nox-actions）
 *  (4) キャストの希望のカレンダー＝臨時の日を重ねる（closedDaysOfMonth・前から）
 *  (5) DB（BEGIN … ROLLBACK）＝登録の前は希望が 'closed day'・スタッフは forbidden・店長が臨時営業→配置と希望が通る・定休の曜日は料金に選べない・臨時休業の日は希望も配置も 'closed day'・過去の日は 'past day'・取消で戻る・監査 4 行
 *  使い方: npm run verify:nox-special-shift（(5) は SUPABASE_DB_URL・無ければ (1)〜(4) だけ）
 */
import fs from "node:fs";
import pg from "pg";
import { bhRowsForDayOf, closedEffOf, closeAskOf, closeDoneTextOf, CLOSE_REMOVE_NOTE, CLOSE_SHIFT_CHOICES, needDowOf, openDowChoicesOf, openHoursOfDow, specialDayActionOf } from "../lib/nox/shift/special-day";
import { dayStateOf, HOLIDAY_MARK } from "../lib/nox/mine/day-state";
import { cellTextOf } from "../lib/nox/shift/cal-cell";
import { closedDaysOfMonth } from "../lib/nox/mine/closed-days";
import { pgTx } from "./fixtures-pgtx";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1) 純関数（2026-11-23＝月・11-29＝日）
const sun = new Set([0]);
const sp = [{ day: "2026-11-29", kind: "open", price_dow: 5, open_hm: "20:00", close_hm: "25:00" }, { day: "2026-11-24", kind: "closed" }];
check("(1) 休み＝臨時営業の日は営業・臨時休業の日は休み・ほかは曜日の定休", closedEffOf("2026-11-29", sun, sp) === false && closedEffOf("2026-11-24", sun, sp) === true && closedEffOf("2026-11-22", sun, sp) === true && closedEffOf("2026-11-23", sun, sp) === false);
check("(1) 必要人数の曜日＝臨時営業で選んだ曜日（金＝5）・ほかはその日の曜日", needDowOf("2026-11-29", sp) === 5 && needDowOf("2026-11-23", sp) === 1 && needDowOf("2026-11-29", [{ day: "2026-11-29", kind: "open", price_dow: null }]) === 0);
const bh = [{ dow: 0, is_closed: true, open_hm: null, close_hm: null }, ...[1, 2, 3, 4, 5, 6].map((d) => ({ dow: d, is_closed: false, open_hm: "20:00", close_hm: d === 5 ? "02:00" : "01:00" }))];
const bd = bhRowsForDayOf("2026-11-29", bh, sp);
check("(1) 臨時営業の日の営業時間＝その日の時刻で日曜を営業に差し替え（ほかの日は前のまま）", bd.find((r) => r.dow === 0)?.is_closed === false && bd.find((r) => r.dow === 0)?.open_hm === "20:00" && bd.find((r) => r.dow === 0)?.close_hm === "25:00" && bhRowsForDayOf("2026-11-23", bh, sp).find((r) => r.dow === 0)?.is_closed === true);
check("(1) 選べる曜日＝定休以外（日を外す）・選んだ曜日の時刻は翌日の形（金 20:00〜26:00）", JSON.stringify(openDowChoicesOf(bh)) === "[1,2,3,4,5,6]" && JSON.stringify(openHoursOfDow(5, bh)) === JSON.stringify({ open: "20:00", close: "26:00" }) && openHoursOfDow(0, bh) === null);
const A = (o: Partial<Parameters<typeof specialDayActionOf>[0]>) => specialDayActionOf({ ymd: "2026-11-29", bizToday: "2026-11-22", isManagerUp: true, weekdayClosed: true, special: null, ...o }).kind;
check("(1) 出すボタン＝定休日→臨時営業にする・営業日→臨時休業にする・登録済み→取消・スタッフと過去の日は出さない", A({}) === "make_open" && A({ weekdayClosed: false }) === "make_closed" && A({ special: sp[0] }) === "undo_open" && A({ special: sp[1] }) === "undo_closed" && A({ isManagerUp: false }) === "none" && A({ ymd: "2026-11-21" }) === "none" && A({ ymd: "2026-11-22" }) === "make_open");
check("(1) 臨時休業の問い＝シフトが入っていれば人数を出して外す／残す（既定は外す・0 人は問わない）・外したシフトは取り消しても戻らない", closeAskOf("2026-11-24", 3)?.includes("3 人のシフトが入っています") === true && closeAskOf("2026-11-24", 0) === null && CLOSE_SHIFT_CHOICES[0][0] === "remove" && CLOSE_REMOVE_NOTE.includes("取り消しても戻りません") && closeDoneTextOf("2026-11-24", { removed: 2, failed: 1 }).includes("シフト 2 人を外しました・1 人は") && closeDoneTextOf("2026-11-24", null).includes("残しました"));
check("(1-a) 臨時休業の日の札＝「休業」（キャストの希望のカレンダーと店のカレンダー）・定休日は「定休」「定休日」のまま", dayStateOf({ wish: null, shift: null, open: false, closed: true, holiday: true }).mark === HOLIDAY_MARK && HOLIDAY_MARK === "休業" && dayStateOf({ wish: null, shift: null, open: false, closed: true }).mark === "定休" && cellTextOf({ assigned: 0, confirmed: 0, proposed: 0, planned: 0, required: 0 } as never, true, true).center === "休業" && cellTextOf({ assigned: 0, confirmed: 0, proposed: 0, planned: 0, required: 0 } as never, true).center === "定休日");

// (2) シフト作成
const sb = src("app/(manage)/shift/shift-board.tsx");
check("(2) isClosedDay＝臨時の日を先に見る（closedEffOf）・曜日だけの判定は isClosedDowDay", sb.includes("const isClosedDay = (ymd: string) => closedEffOf(ymd, closedDows, specialDays);") && sb.includes("const isClosedDowDay = (ymd: string) => closedDows.has(dowOf(ymd));") && sb.includes('const isClosedForAdd = (ymd: string) => specialOf(ymd) === "closed" || (isClosedDowDay(ymd) && specialOf(ymd) !== "open");'));
check("(2) 必要人数は臨時営業で選んだ曜日（needDowOf）・休みの日は時間帯の帯を出さない", sb.includes("return needs.filter((n) => n.dow === needDowOf(ymd, specialDays)).map((n) => {") && sb.includes("const bandStatsOf = (ymd: string): BandStat[] => {\n    if (isClosedDay(ymd)) return [];"));
check("(2) 臨時の日は price_dow と時刻も読む", sb.includes('select(mig0201dOn() ? "day, kind, price_dow, open_hm, close_hm" : "day, kind, open_hm, close_hm")'));
check("(2) ③配置の日のモーダルに登録と取消（店長以上の判定は部品へ isManagerUp・曜日の定休は isClosedDowDay）", sb.includes("<ShiftSpecialDay storeId={storeId} ymd={selDate} bizToday={bizToday} isManagerUp={isManagerUp} weekdayClosed={isClosedDowDay(selDate)} special={specialDays.find((x) => x.day === selDate) ?? null} bhRows={bhRows} shiftCount={shiftsOn(selDate).length}") && sb.indexOf("<ShiftSpecialDay ") > sb.indexOf('{dayModal === "calendar" && selInMonth && ('));
check("(2) 追加の口の既定の時刻＝臨時営業の日はその日の時刻（日のモーダル 3 か所）", (sb.match(/bhRows=\{bhRowsForDayOf\(selDate, bhRows, specialDays\)\}/g) ?? []).length === 3);

// (3) 部品
const cp = src("components/nox/shift-special-day.tsx");
check("(3) 書込は既存の 2 関数だけ（set_store_special_day／remove_store_special_day）", (cp.match(/"(set_store_special_day|remove_store_special_day)"/g) ?? []).length >= 3 && !/rpc\("(?!set_store_special_day|remove_store_special_day)/.test(cp.replace(/createClient\(\)\.rpc\(fn, args\)/, "")));
check("(3) 料金と必要人数の曜日＝既定の選択なし（null から）・選ぶまで登録できない", cp.includes("useState<number | null>(null)") && cp.includes("disabled={busy || dow === null} onClick={makeOpen}") && cp.includes("料金と必要人数は何曜日と同じにしますか？"));
check("(3) 臨時休業はシフトが入っていれば外す／残すを選ぶ（既定は外す）・登録が通ってから外す・ボタンは中央（nox-actions）", cp.includes("useState<\"remove\" | \"keep\">(\"remove\")") && cp.includes("const r = shiftCount > 0 && shiftChoice === \"remove\" ? await onRemoveShifts() : null;") && cp.indexOf("await onRemoveShifts()") > cp.indexOf("p_kind: \"closed\"") && cp.includes("{CLOSE_REMOVE_NOTE}") && (cp.match(/className="nox-actions"/g) ?? []).length === 5);
check("(3) 外すのは今ある shift_remove・確定を外した人だけ今の shift_removed の知らせ（removeShift と同じ決まり）・札は wish-form と店のカレンダーに配線", sb.includes("async function removeShiftsOn(ymd: string): Promise<{ removed: number; failed: number }> {") && sb.includes("if (s.status === \"confirmed\") void notifyCast(supabase, { castId: s.cast_id, kind: \"shift_removed\", body: shiftRemovedBody(s.date, s.start_hm, s.end_hm), ref: notifRefOf(\"shifts\", s.id) });") && sb.includes("onRemoveShifts={() => removeShiftsOn(selDate)}") && sb.includes("holiday={specialOf(ymd) === \"closed\"}") && src("app/mine/wishes/wish-form.tsx").includes("holiday: holidayDates.has(ymd)"));

// (4) キャストの希望
const cm = closedDaysOfMonth("2026-11", sun, sp);
check("(4) キャストの希望のカレンダー＝臨時営業の日は定休を外す・臨時休業の日は休み", !cm.has("2026-11-29") && cm.has("2026-11-24") && cm.has("2026-11-22"));

// (5) DB（BEGIN … ROLLBACK）
async function dbPart() {
  const url = process.env.SUPABASE_DB_URL ?? (() => { try { const l = src(".env.local").split(/\r?\n/).find((x) => x.startsWith("SUPABASE_DB_URL=")); return l ? l.slice(16).replace(/^"|"$/g, "") : undefined; } catch { return undefined; } })();
  if (!url || process.env.NOX_SKIP_DB === "1") { console.log("  (5) DB の段は飛ばす（SUPABASE_DB_URL なし／NOX_SKIP_DB=1）"); return; }
  const db = new pg.Client({ connectionString: url }); await db.connect();
  try {
    await db.query("begin");
    const tx = pgTx(db);
    const au0 = await tx.one<{ n: number }>("select count(*)::int n from audit_logs where action in ('set_store_special_day', 'remove_store_special_day')");
    const st = await tx.one<{ id: string; org_id: string }>("select id, org_id from stores where name = 'NOX-VERIFY-A1'");
    const uid = async (email: string) => ({ auth_user_id: (await tx.one<{ auth_user_id: string }>("select auth_user_id from users where email = $1", [email])).auth_user_id });
    const mgr = await uid("nox-verify-manager-a1@example.com"), staff = await uid("nox-verify-staff-a1@example.com"), cast = await uid("nox-verify-cast-a1a@example.com");
    const castId = (await tx.one<{ id: string }>("select c.id from casts c join users u on u.id = c.user_id where u.email = 'nox-verify-cast-a1a@example.com'")).id;
    const today = (await tx.one<{ d: string }>("select public.biz_date_of($1, now())::text d", [st.id])).d;
    // 期間（トランザクションの中だけ）：明日から 14 日の open の期間が無ければ作る
    let per = await tx.one<{ s: string; e: string }>("select greatest(start_date, $2::date + 1)::text s, end_date::text e from shift_periods where store_id = $1 and status = 'open' and end_date >= $2::date + 2 order by start_date limit 1", [st.id, today]);
    if (!per) { await tx.q("insert into shift_periods (org_id, store_id, start_date, end_date, status, created_by) values ($1, $2, $3::date + 1, $3::date + 14, 'open', (select id from users where email = 'nox-verify-owner-a@example.com'))", [st.org_id, st.id, today]); per = await tx.one<{ s: string; e: string }>("select ($1::date + 1)::text s, ($1::date + 14)::text e", [today]); }
    // 試す日＝卓の無い先の日（明日は f0 の rls が A1 に日報を残すことがある＝'day has checks'）。期間の中で卓の無い日を 2 つ選ぶ
    const free = await tx.q<{ d: string }>("select g::date::text d from generate_series($1::date, $2::date, interval '1 day') g where g::date >= $3::date + 2 and not public.store_day_has_checks($4, g::date) order by g limit 2", [per.s, per.e, today, st.id]);
    if (free.length < 2) throw new Error(`卓の無い日が期間に 2 つ無い（${per.s}〜${per.e}）`);
    const dOpen = free[0].d; const dClose = free[1].d;
    const dowOpen = new Date(`${dOpen}T00:00:00Z`).getUTCDay(); const priceDow = (dowOpen + 1) % 7;
    for (let w = 0; w < 7; w++) await tx.q("insert into store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm) values ($1, $2, $3, $4, $5, $6) on conflict (store_id, dow) do update set is_closed = excluded.is_closed, open_hm = excluded.open_hm, close_hm = excluded.close_hm", [st.org_id, st.id, w, w === dowOpen, w === dowOpen ? null : "20:00", w === dowOpen ? null : "01:00"]);
    const isClosed = async (d: string) => (await tx.one<{ c: boolean }>("select public.shift_is_closed_day($1, $2::date) c", [st.id, d])).c;
    const w0 = await tx.as(cast, "select public.shift_wish_submit($1::date, '20:00', '25:00', 'work')", [dOpen]);
    check("(5) 登録の前＝定休の曜日はキャストの希望が 'closed day'", (await isClosed(dOpen)) && !w0.ok && /closed day/.test(tx.errOf(w0)), tx.errOf(w0));
    const s0 = await tx.as(staff, "select public.set_store_special_day($1, $2::date, 'open', '20:00', '25:00', null, $3)", [st.id, dOpen, priceDow]);
    check("(5) スタッフは登録できない（forbidden）", !s0.ok && /forbidden/.test(tx.errOf(s0)), tx.errOf(s0));
    const s1 = await tx.as(mgr, "select public.set_store_special_day($1, $2::date, 'open', '20:00', '25:00', null, $3)", [st.id, dOpen, priceDow]);
    const sb2 = await tx.as(mgr, "select public.set_store_special_day($1, $2::date, 'open', '20:00', '25:00', null, $3)", [st.id, dClose, dowOpen]);
    check("(5) 店長が臨時営業に登録・料金の曜日に定休の曜日は選べない（'bad price dow'）", s1.ok && !sb2.ok && /bad price dow/.test(tx.errOf(sb2)), [tx.errOf(s1), tx.errOf(sb2)]);
    const sh = await tx.as(mgr, "select public.shift_set(null, $1, $2::date, '20:00', '25:00', 'planned', null) id", [castId, dOpen]);
    await tx.q("delete from shifts where cast_id = $1 and date = $2::date", [castId, dOpen]);
    const w1 = await tx.as(cast, "select public.shift_wish_submit($1::date, '20:00', '25:00', 'work')", [dOpen]);
    check("(5) 臨時営業の日＝営業・店長が配置できる・キャストは希望を出せる", !(await isClosed(dOpen)) && sh.ok && w1.ok, [tx.errOf(sh), tx.errOf(w1)]);
    const c1 = await tx.as(mgr, "select public.set_store_special_day($1, $2::date, 'closed', null, null, null, null)", [st.id, dClose]);
    const w2 = await tx.as(cast, "select public.shift_wish_submit($1::date, '20:00', '25:00', 'work')", [dClose]);
    const sh2 = await tx.as(mgr, "select public.shift_set(null, $1, $2::date, '20:00', '25:00', 'planned', null) id", [castId, dClose]);
    check("(5) 臨時休業の日＝希望も配置も 'closed day'", c1.ok && !w2.ok && /closed day/.test(tx.errOf(w2)) && !sh2.ok && /closed day/.test(tx.errOf(sh2)), [tx.errOf(c1), tx.errOf(w2), tx.errOf(sh2)]);
    const past = await tx.as(mgr, "select public.set_store_special_day($1, $2::date - 1, 'closed', null, null, null, null)", [st.id, today]);
    check("(5) 過去の日は変えられない（'past day'）", !past.ok && /past day/.test(tx.errOf(past)), tx.errOf(past));
    const r1 = await tx.as(mgr, "select public.remove_store_special_day($1, $2::date)", [st.id, dClose]);
    const r2 = await tx.as(mgr, "select public.remove_store_special_day($1, $2::date)", [st.id, dOpen]);
    check("(5) 取消で曜日の設定に戻る（臨時営業の日は定休へ）", r1.ok && r2.ok && (await isClosed(dOpen)) && !(await isClosed(dClose)), [tx.errOf(r1), tx.errOf(r2)]);
    const au1 = await tx.one<{ n: number }>("select count(*)::int n from audit_logs where action in ('set_store_special_day', 'remove_store_special_day')");
    check("(5) 監査＝登録 2・取消 2（4 行）", au1.n - au0.n === 4, { before: au0.n, after: au1.n });
  } finally { await db.query("rollback").catch(() => undefined); await db.end(); }
}
void dbPart().then(() => {
  if (fails.length) { console.error(`verify:nox-special-shift FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-special-shift OK ${pass} checks（シフト作成から臨時営業・臨時休業）`);
}, (e) => { console.error(`verify:nox-special-shift ERROR ${(e as Error).message}`); process.exit(1); });
