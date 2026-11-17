/*
 * verify:nox-n1117 — 2026-11-17 相談役の便（①-2・15・20・13・6）の直しの係留。DB 不触・env 不要。
 *   npm run verify:nox-n1117。
 *  n(1) ①-2 体入の日のカードの今期の時給＝給与で実際に当たる体入の時給（根拠「体入」）＝wageNowOf の lastDay の basis「体入」。
 *  n(2) 15 予約の申請の既定の日時＝営業日の 20:00 が今から 30 分より前なら、今から 30 分以上先の 30 分刻み（JST）。描画の後に寄せる。
 *  n(3) 20 シフト無し出勤の日を給与の下書きの画面（preview）にも渡す（旧＝渡していなかった＝確定前は印が出なかった）。
 *  n(4) 13 休み希望（時刻 null）で営業時間の判定が落ちない（旧＝null の split でシフト作成の画面ごと落ちた）。
 *  n(5) 6 スタッフの PIN の入力欄も 4〜6 桁（PIN_MAX）。
 */
import fs from "node:fs";
import { wageNowOf } from "../lib/nox/cast/wage-now";
import { rsvDefaultWhenOf, rsvRequestArgsOf } from "../lib/nox/mine/reservation-request";
import { shiftHoursStatus } from "../lib/nox/business-hours";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }

const w = wageNowOf({ planBase: 2500, rows: [], today: "2026-11-16", lastDay: { hourly: 2200, basis: "体入" } });
check("n(1-1) 体入の日＝体入の時給 ¥2,200・根拠「体入」（プランの基本 ¥2,500 ではない）", w.hourly === 2200 && w.suffix === "trial" && w.suffixLabel === "体入", w);
const w2 = wageNowOf({ planBase: 2500, rows: [], today: "2026-11-16", lastDay: { hourly: 2500, basis: "基本" } });
check("n(1-2) 体入でない日は今のまま（基本）", w2.hourly === 2500 && w2.suffix === "base", w2);

const ms = (iso: string) => Date.parse(iso);
check("n(2-1) 夕方（営業日 11/16 の 18:00）＝営業日の 20:00 のまま", JSON.stringify(rsvDefaultWhenOf("2026-11-16", ms("2026-11-16T18:00:00+09:00"))) === JSON.stringify({ date: "2026-11-16", time: "20:00" }));
const d2 = rsvDefaultWhenOf("2026-11-16", ms("2026-11-16T23:31:00+09:00"));
check("n(2-2) 夜 23:31＝翌 00:30（今から 30 分以上先の 30 分刻み・暦の日付）", JSON.stringify(d2) === JSON.stringify({ date: "2026-11-17", time: "00:30" }), d2);
const d3 = rsvDefaultWhenOf("2026-11-16", ms("2026-11-17T01:10:00+09:00"));
check("n(2-3) 営業日をまたいだ深夜 01:10（営業日はまだ 11/16）＝11/17 02:00", JSON.stringify(d3) === JSON.stringify({ date: "2026-11-17", time: "02:00" }), d3);
const ok = rsvRequestArgsOf({ storeId: "s", customerId: "c", date: d2.date, time: d2.time, kind: "hon", now: new Date(ms("2026-11-16T23:31:00+09:00")) });
check("n(2-4) 既定の日時のまま申請できる（「今より後」で止まらない）", ok.ok === true, ok);
const card = fs.readFileSync("app/mine/reservation-request-card.tsx", "utf8");
check("n(2-5) 画面＝描画の後（useEffect）に寄せる（描画の前に今の時刻を読まない）", card.includes("useEffect(() => { const d = rsvDefaultWhenOf(bizToday, Date.now()); setDate(d.date); setTime(d.time); }, [bizToday]);"));

const pv = fs.readFileSync("app/api/payroll/preview/route.ts", "utf8");
check("n(3-1) preview の行にシフト無し出勤の日（ある行だけ）", pv.includes("...(r.noShiftDates?.length ? { noShiftDates: r.noShiftDates } : {}),"));

const rows = [{ dow: 2, is_closed: false, open_hm: "20:00", close_hm: "02:00" }, { dow: 0, is_closed: true, open_hm: null, close_hm: null }] as unknown as Parameters<typeof shiftHoursStatus>[3];
let threw = false; let st: ReturnType<typeof shiftHoursStatus> | null = null;
try { st = shiftHoursStatus("2026-11-17", null, null, rows); } catch { threw = true; }
check("n(4-1) 休み希望（時刻 null）でも落ちない・定休日でなければ inside", !threw && st?.status === "inside", st);
check("n(4-2) 定休日なら closed（時刻を見ない）", shiftHoursStatus("2026-11-15", null, null, rows).status === "closed");
check("n(4-3) 時刻があるときは今のまま（20:00〜翌01:00＝inside・19:00〜＝outside）", shiftHoursStatus("2026-11-17", "20:00", "25:00", rows).status === "inside" && shiftHoursStatus("2026-11-17", "19:00", "25:00", rows).status === "outside");

const kp = fs.readFileSync("app/(manage)/master/kiosk-pin-panel.tsx", "utf8");
check("n(5-1) スタッフの PIN の入力欄＝PIN_MAX（6）まで・4 文字で切らない", (kp.match(/maxLength=\{PIN_MAX\}/g) ?? []).length === 2 && !kp.includes("maxLength={4}") && !kp.includes('.slice(0, 4))'));

if (fails.length) { console.error(`✗ verify:nox-n1117 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-n1117 OK (${pass} checks)`);
