/*
 * verify:nox-shift1116 — シフト配置の日のセルの割当の一覧（裁定501-6・2026-11-16 Agoora 確定）。DB 不触・env 不要＝純関数と逐語 pin。
 *   npm run verify:nox-shift1116。
 *  s(1) 「不可」＝休み希望・基本の働き方の曜日が不可・★出勤不可の登録（cast_unavailable_list）＝キャストから組む側と同じ元。「相談」＝基本の働き方の曜日が相談。
 *  s(2) 並び＝希望あり→シフトなし→相談→不可（不可は一覧の下）。
 *  s(3) 不可の人を選ぶときは理由が必須（保存の前に止める）・相談の人は印だけでそのまま選べる。
 *  逆テスト（手動・1 回）: needReason から unavail_day を外す→s(3-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { dayCastStateOf, dayCastStateWithUnavailOf } from "../lib/nox/shift/half-hour";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const dp = fs.readFileSync("app/(manage)/shift/day-add-panel.tsx", "utf8");
const base = dayCastStateOf([], "ok");
check("s(1-1) 出勤不可の登録がある日＝不可（why unavail_day）・無ければ元のまま", JSON.stringify(dayCastStateWithUnavailOf(base, "通院")) === JSON.stringify({ state: "unavailable", wish: null, why: "unavail_day" }) && dayCastStateWithUnavailOf(base, null).state === "unavailable" && dayCastStateWithUnavailOf(base, undefined) === base);
check("s(1-2) 出勤不可の登録は希望より先（希望ありの人でも不可）", dayCastStateWithUnavailOf(dayCastStateOf([{ start_hm: "20:00", end_hm: "26:00" }], "ok"), "家の用事").state === "unavailable");
check("s(1-3) 相談＝基本の働き方の曜日が相談（印だけ）", dayCastStateOf([], "ask").state === "consult" && dayCastStateOf([], "ask").why === null);
check("s(1-4) 一覧を開いたとき、この日の出勤不可の登録をキャストごとに読む（cast_unavailable_list）", dp.includes('await supabase.rpc("cast_unavailable_list", { p_cast_id: c.id, p_from: date, p_to: date });') && dp.includes("dayCastStateWithUnavailOf(dayCastStateOf("));
check("s(2-1) 並び＝希望あり→シフトなし→相談→不可", dp.includes("const ORDER: Record<DayCastState, number> = { wish: 0, none: 1, consult: 2, unavailable: 3 };"));
check("s(3-1) 不可（休み希望・曜日が不可・出勤不可の登録）は理由が必須＝保存を止める・相談は理由なし", dp.includes('needReason: st.why === "wish_off" || st.why === "avail_ng" || st.why === "unavail_day", reason: "" }]);') && dp.includes('const blocked = rows.some((r) => r.needReason && r.reason.trim() === "");') && dp.includes("if (busy || rows.length === 0 || blocked) return;"));
check("s(3-2) 印＝不可（出勤不可の登録は理由も）・相談", dp.includes('{st.why === "unavail_day" && unavail.get(c.id) ? `（${unavail.get(c.id)}）` : ""}') && dp.includes('consult: { color: "var(--gold2)"'));
if (fails.length) { console.error(`verify:nox-shift1116 FAIL ${fails.length} / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-shift1116 OK (${pass} checks)`);
console.log("シフト配置の日のセル（裁定501-6）: 出勤不可の登録も不可・不可は下・不可は理由必須・相談は印だけ");
