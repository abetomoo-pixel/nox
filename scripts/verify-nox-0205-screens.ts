/*
 * verify:nox-0205-screens — 0205 版 2 の画面（相談役 11/24 2:20 の ■2-c・枝 night1124-0205v2 だけ・push しない）。DB を使わない。
 *  (A) planSwitchMinOf：最後に確定した期の翌日（period_end が null なら月末・無ければ null）
 *  (B) planSwitchValidate：minFrom を渡したとき（旗）は今日より前でも確定していない期なら通す・確定した期は断る。渡さないとき（今）は今のまま
 *  (C) 文言：旗 false＝今と同じ・旗 true＝「今月（YYYY 年 M 月）分から」・period finalized の和文
 *  (D) 結線：3 か所（割当の日付の欄の空・報酬型の保存の文・プラン切替の日付の下限）が旗の後ろ・旗は true（0205 適用の後）
 *  (E) 効く月（相談役 11/24 4:10 の ■3）：今月の決め打ちでなく set_cast_plan 版 2 と同じ決まり（予約してある人＝その月・月の 1 日の 0:00〜締め＝営業日の月）
 *  使い方: npx tsx scripts/verify-nox-0205-screens.ts
 */
import fs from "node:fs";
import { planSwitchMinOf, planSwitchValidate, planSwitchErrJa, bizMonthLabelOf, dateLessFromOf, dateLessLabelOf } from "../lib/nox/cast/plan-switch";
import { MIG_0205_APPLIED, __set0205ForTest } from "../lib/nox/rules-0175/flag";
import { bizToday } from "../lib/nox/jst-today";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };

// (A)
check("A 確定した回が無い＝null", planSwitchMinOf([]) === null);
check("A 9 月が確定（period_end null）＝10/01", planSwitchMinOf([{ period: "2026-09", period_end: null }]) === "2026-10-01");
check("A 2 月（閏年でない）＝3/01", planSwitchMinOf([{ period: "2027-02", period_end: null }]) === "2027-03-01");
check("A 期の末日が入っている回はそれを使う（11/20 締め＝11/21）", planSwitchMinOf([{ period: "2026-11", period_end: "2026-11-20" }]) === "2026-11-21");
check("A いくつかあれば最も後の回（8 月と 10 月＝11/01）", planSwitchMinOf([{ period: "2026-08", period_end: null }, { period: "2026-10", period_end: null }, { period: "2026-09", period_end: null }]) === "2026-11-01");
check("A 年の変わり目（12 月が確定＝翌年 1/01）", planSwitchMinOf([{ period: "2026-12", period_end: null }]) === "2027-01-01");

// (B)
const base = { planId: "p", today: "2026-11-24", runStatus: null };
check("B 今（minFrom なし）：今日より前は断る", planSwitchValidate({ ...base, from: "2026-11-01" }) !== null);
check("B 今（minFrom なし）：今日は通る", planSwitchValidate({ ...base, from: "2026-11-24" }) === null);
check("B 旗：今月の 1 日（11/01）は通る（9 月まで確定）", planSwitchValidate({ ...base, from: "2026-11-01", minFrom: "2026-10-01" }) === null);
check("B 旗：確定していない前の月の 1 日（10/01）は通る", planSwitchValidate({ ...base, from: "2026-10-01", minFrom: "2026-10-01" }) === null);
const fin = planSwitchValidate({ ...base, from: "2026-09-15", minFrom: "2026-10-01" });
check("B 旗：確定済みの月（9/15）は断る（下限の日を出す）", fin !== null && fin.includes("2026-10-01"), fin);
check("B 旗：確定した回が無い（null）＝下限なし（10/01 も通る）", planSwitchValidate({ ...base, from: "2026-10-01", minFrom: null }) === null);
check("B 旗：その月が確定済み（runStatus）はこれまでどおり断る", planSwitchValidate({ ...base, from: "2026-11-01", minFrom: "2026-10-01", runStatus: "finalized" }) !== null);

// (C)
check("C 月の見出し", bizMonthLabelOf("2026-11-30") === "2026 年 11 月" && bizMonthLabelOf("2027-01-01") === "2027 年 1 月");
// 12/01 02:00 JST（=11/30 17:00Z）は営業日 11/30＝「11 月分から」・06:00 で 12 月
check("C 12/01 02:00（締め 06:00）は 11 月分", bizMonthLabelOf(bizToday("06:00", new Date("2026-11-30T17:00:00Z"))) === "2026 年 11 月");
check("C 12/01 06:00（締め 06:00）は 12 月分", bizMonthLabelOf(bizToday("06:00", new Date("2026-11-30T21:00:00Z"))) === "2026 年 12 月");
check("C 12/01 05:30（締め 05:00）は 12 月分", bizMonthLabelOf(bizToday("05:00", new Date("2026-11-30T20:30:00Z"))) === "2026 年 12 月");
__set0205ForTest(false);
check("C 旗 false：bad valid_from は今の文", planSwitchErrJa("bad valid_from") === "適用開始日は今日以降で、現在の割当の開始日より後にしてください");
__set0205ForTest(true);
check("C 旗 true：bad valid_from から「今日以降」を外す", planSwitchErrJa("bad valid_from") === "適用開始日は、現在の割当の開始日より後にしてください");
check("C period finalized は和文（英字を出さない）", !/[a-z]/.test(planSwitchErrJa("period finalized")));
__set0205ForTest(null);

// (D)
const cb = fs.readFileSync("app/(manage)/casts/casts-board.tsx", "utf8");
const cs = fs.readFileSync("app/(manage)/master/cast-comp/comp-sections.tsx", "utf8");
check("D 割当の日付の欄の空＝旗のときキャストごとの効く月（dateLessLabelOf・開いた行の開始日）", cs.includes("const emptyDateLabelOf = (cid: string): string | null => mig0205On() ? dateLessLabelOf(bizToday(bizCutoff), cpOf(cid)?.valid_from ?? null) : null;") && cs.includes("placeholder={emptyDateLabelOf(c.id) ?? \"今すぐ\"}"));
check("D 割当は開いた行の開始日を読む", cs.includes("select(\"cast_id, plan_id, overrides_json, valid_from\").is(\"valid_to\", null)"));
check("D 割当の締めの時刻は店の settings_json（旗のときだけ読む）", /if \(!mig0205On\(\) \|\| !storeId\) return;\s*void supabase\.from\("stores"\)\.select\("settings_json"\)/.test(cs));
check("D 報酬型の保存：効く月を保存の前に決め、ボタンの横と保存の文に出す", cb.includes("const ruleFromLabel = ruleEffectLabelOf(c.id);") && cb.includes("{ruleEffectLabelOf(selCast.id)}効きます") && cb.includes("${ruleFromLabel ? `（${ruleFromLabel}）` : \"\"}"));
check("D 報酬型の効く月は開いた行の開始日と閉じた行の終わりから（dateLessLabelOf）", cb.includes("const ruleEffectLabelOf = (id: string): string | null => mig0205On() ? dateLessLabelOf(today,"));
check("D プラン切替の日付の下限＝旗のとき最後に確定した期の翌日", cb.includes("min={mig0205On() ? planMin : today}") && cb.includes("...(mig0205On() ? { minFrom: planMin } : {})") && /\.in\("status", \["finalized", "paid"\]\)[^\n]*planSwitchMinOf/.test(cb));
check("D 今日（today）は営業日・次のシフトも営業日の今日から", cb.includes("const today = bizToday(bizCutoff);") && cb.includes(".gte(\"date\", today)"));
check("D 旗は true（0205 版 2 を適用した後の便）", MIG_0205_APPLIED === true);

// (E) 効く月
check("E 開いた行が 10/01（今月より前）＝今月の 1 日", dateLessFromOf("2026-11-24", "2026-10-01") === "2026-11-01" && dateLessLabelOf("2026-11-24", "2026-10-01") === "今月（2026 年 11 月）分から");
check("E 予約してある人（開いた行が 12/01 から）＝12 月分から", dateLessFromOf("2026-11-24", "2026-12-01") === "2026-12-01" && dateLessLabelOf("2026-11-24", "2026-12-01") === "2026 年 12 月分から");
check("E 開いた行が今月の途中（11/10）＝その場で上書き＝今月", dateLessFromOf("2026-11-24", "2026-11-10") === "2026-11-10" && dateLessLabelOf("2026-11-24", "2026-11-10") === "今月（2026 年 11 月）分から");
check("E 行が無い人＝今月の 1 日", dateLessFromOf("2026-11-24", null) === "2026-11-01");
check("E 行が無く閉じた行が 12/31 まで＝1 月分から", dateLessLabelOf("2026-11-24", null, "2026-12-31") === "2027 年 1 月分から");
check("E 12/01 02:00（締め 06:00・営業日 11/30）＝今月（11 月）分から", dateLessLabelOf(bizToday("06:00", new Date("2026-11-30T17:00:00Z")), "2026-10-01") === "今月（2026 年 11 月）分から");
check("E 12/01 06:00 ＝今月（12 月）分から", dateLessLabelOf(bizToday("06:00", new Date("2026-11-30T21:00:00Z")), "2026-10-01") === "今月（2026 年 12 月）分から");

if (fails.length) { console.error(`verify:nox-0205-screens NG (${fails.length} fails / ${pass} pass)`); for (const f of fails) console.error("  ✗ " + f); process.exit(1); }
console.log(`verify:nox-0205-screens OK (${pass} checks)`);
