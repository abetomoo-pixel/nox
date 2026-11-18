/*
 * verify:nox-0201r-client — 0201r の画面の便（2026-11-18 夜・相談役 ②）。手貼り前＝フラグ false。DB 不触・env 不要。
 *  rc(1) フラグ MIG_0201R_APPLIED＝false・override で切り替えられる。
 *  rc(2) lockRemainOf＝「あと N 分で解除」（切り上げ・過ぎた／無い／壊れた値は null）。
 *  rc(3) unlockNextOf：フラグ false＝今の文言のまま（1 文字も変えない）・true＝locked／device_locked に残りを添える。
 *  rc(4) ロック時間の既定＝false 10 分・true 5 分・PIN の設定の画面（kiosk-pin-panel）は既定を pinLockDefaultMinutesOf から読む（2 か所）。
 */
import fs from "node:fs";
import { MIG_0201R_APPLIED, mig0201rOn, __set0201rForTest } from "../lib/nox/rules-0175/flag";
import { lockRemainOf, pinLockDefaultMinutesOf, unlockNextOf } from "../lib/nox/rules-0175/kiosk";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
check("rc(1) MIG_0201R_APPLIED＝true（★2026-11-18 21:57 本番適用）・override で true／false", MIG_0201R_APPLIED === true && mig0201rOn() && (__set0201rForTest(false), !mig0201rOn()) && (__set0201rForTest(true), mig0201rOn()));
__set0201rForTest(null);
const now = Date.parse("2026-11-18T12:00:00Z");
check("rc(2) lockRemainOf", lockRemainOf("2026-11-18T12:04:01Z", now) === "あと 5 分で解除" && lockRemainOf("2026-11-18T12:05:00Z", now) === "あと 5 分で解除" && lockRemainOf("2026-11-18T12:00:20Z", now) === "あと 1 分で解除"
  && lockRemainOf("2026-11-18T11:59:00Z", now) === null && lockRemainOf(null, now) === null && lockRemainOf("壊れた値", now) === null);
const lk = { ok: false as const, reason: "locked", locked_until: "2026-11-18T12:04:30Z" }, dl = { ok: false as const, reason: "device_locked", locked_until: "2026-11-18T12:03:00Z" };
__set0201rForTest(false); // ★0201r 適用後：フラグ false の枝は override で見る
const off = [unlockNextOf(lk, now).message, unlockNextOf(dl, now).message];
check("rc(3-1) フラグ false＝今の文言のまま", off[0] === "失敗が続いたためロック中です（しばらくしてから）" && off[1] === "この端末はしばらく使えません（PIN の失敗が続きました）", off);
__set0201rForTest(true);
const on = [unlockNextOf(lk, now).message, unlockNextOf(dl, now).message, unlockNextOf({ ok: false, reason: "locked" }, now).message, unlockNextOf({ ok: false, reason: "wrong_pin" }, now).message];
check("rc(3-2) フラグ true＝残りを添える（locked_until が無ければ今の文言）・ほかの理由は変えない", on[0] === "失敗が続いたためロック中です（あと 5 分で解除）" && on[1] === "この端末はしばらく使えません（PIN の失敗が続きました・あと 3 分で解除）" && on[2] === "失敗が続いたためロック中です（しばらくしてから）" && on[3] === "PIN が違います", on);
check("rc(4-1) ロック時間の既定＝true 5 分", pinLockDefaultMinutesOf() === 5 && pinLockDefaultMinutesOf(false) === 10);
__set0201rForTest(null);
check("rc(4-2) フラグ true（★0201r 適用後）の既定＝5 分・false の枝は 10 分", pinLockDefaultMinutesOf() === 5 && pinLockDefaultMinutesOf(false) === 10);
const kp = fs.readFileSync("app/(manage)/master/kiosk-pin-panel.tsx", "utf8");
check("rc(4-3) PIN の設定の画面は既定を pinLockDefaultMinutesOf から読む（初期値と店の値が無いとき）", kp.includes("useState(pinLockDefaultMinutesOf());") && kp.includes("setLockMin(asInt(sj.pin_lock_minutes, pinLockDefaultMinutesOf()));") && !kp.includes("useState(10);") && !kp.includes("asInt(sj.pin_lock_minutes, 10)"));
if (fails.length) { console.error(`✗ verify:nox-0201r-client 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-0201r-client OK (${pass} checks)`);
