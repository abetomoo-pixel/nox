/*
 * verify:nox-demo-profiles — 便 X-13c（2026-10-09・X-13-15／16）デモ 6 店の設定が表（scripts/demo/profiles.mjs＝docs/demo/store_profiles_20261009.md）どおりの pin（DB 不触・env 不要）。
 *   npm run verify:nox-demo-profiles。f0 96 段目。
 *
 *  dpf(1) 表の整合: 業態テンプレ 5 種を 6 店に（キャバクラは 2 店）・率％型 3／4 段階型 3・ノルマ 3／達成ボーナス 2／ポイント 1／売上スライド 1・計算基準 実打刻 4／確定シフト 2・送り 3／売掛 3／締め解除 3／キャスト確認 2・充足 3／不足 3
 *  dpf(2) payload（6 店）＝stores.settings_json の sys_*／pay_time_basis／shift_cast_confirm／okuri_base_amount・receivable_policy・feature_flags reopen_flow・products のバック型と「—」はフードだけ・cast_norms／comp_plan_components の有無
 *  dpf(3) シフト: staffing_needs 7（dow 0〜6・終日）・当週 7 日の confirmed（人数＝pattern・当日は on_duty 込み）・shift_periods 2（published／open）・翌週の希望 pending ≥3・仮 proposed ≥1・staff_shift_patterns 2・staff_shifts（当週 confirmed＋翌週 proposed）・staff_shift_wishes
 *  逆テスト 1 本（手動・1 回）: profiles.mjs の noir.back を "rate" に→dpf(1-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { PROFILES, PROFILE_CODES, backKeyOf, sysSettingsOf } from "../scripts/demo/profiles.mjs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Prof = Row;
const P = PROFILES as Record<string, Prof>;
const codes = PROFILE_CODES as string[];

// (1) 表の整合
const count = (f: (p: Prof) => boolean) => codes.filter((c) => f(P[c])).length;
check("dpf(1-1) 業態テンプレ 5 種を 6 店に＝キャバクラは 2 店（LUNA 中・ACE 大）・他は 1 店ずつ", new Set(codes.map((c) => P[c].template)).size === 5 && count((p) => p.template === "cabaret") === 2 && P.luna.template === "cabaret" && P.ace.template === "cabaret" && P.noir.template === "lounge" && P.muse.template === "snack" && P.lily.template === "girlsbar" && P.nest.template === "bar");
check("dpf(1-2) バックの型＝率％型 3 店（MUSE／LILY／NEST）・4 段階型 3 店（LUNA／NOIR／ACE）・率の高低（cast 30／25／20）", count((p) => p.back === "rate") === 3 && count((p) => p.back === "unit4") === 3 && P.muse.rate.cast === 30 && P.lily.rate.cast === 25 && P.nest.rate.cast === 20 && P.noir.u4.hon > P.luna.u4.hon);
check("dpf(1-3) 報酬制度の組み合わせ＝時給＋バックのみ 2（MUSE／NEST）・ノルマ 3・達成ボーナス 2・ポイント制 1（NOIR）・売上スライド 1（ACE）＝6 店とも違う組み合わせ", count((p) => !p.sys.norms && !p.sys.bonus && !p.sys.points && !p.sys.sales_slide) === 2 && count((p) => p.sys.norms) === 3 && count((p) => p.sys.bonus) === 2 && count((p) => p.sys.points) === 1 && count((p) => p.sys.sales_slide) === 1 && new Set(codes.map((c) => JSON.stringify(P[c].sys))).size >= 5);
check("dpf(1-4) 運用設定＝計算基準 実打刻 4／確定シフト 2（NOIR・LILY）・送り 3・売掛 3・締め解除 3・キャスト確認 2（NOIR・ACE）", count((p) => p.basis === "punch") === 4 && P.noir.basis === "shift" && P.lily.basis === "shift" && count((p) => p.okuri > 0) === 3 && count((p) => p.receivable !== "disabled") === 3 && count((p) => p.reopen) === 3 && count((p) => p.confirm) === 2);
check("dpf(1-5) シフトの充足／不足＝充足 3（MUSE／LUNA／LILY）・不足 3（NOIR／ACE／NEST）・pattern は 7 日ぶん", count((p) => p.shift.fill === "full") === 3 && count((p) => p.shift.fill === "short") === 3 && codes.every((c) => P[c].shift.pattern.length === 7) && codes.filter((c) => P[c].shift.fill === "short").every((c) => P[c].shift.pattern.some((n: number) => n < P[c].shift.base)));

// (2)(3) payload
for (const code of codes) {
  const p = P[code];
  const pl = JSON.parse(fs.readFileSync(`docs/demo/payload/${code}.json`, "utf8")) as { tables: Record<string, Row[]> };
  const T = pl.tables; const st = T.stores[0]; const sj = st.settings_json as Row;
  const sysExp = sysSettingsOf(code) as Row;
  check(`dpf(2-1) ${code}: settings_json の sys_* 9＝プロファイル・pay_time_basis ${p.basis}・shift_cast_confirm ${p.confirm}・okuri ${p.okuri}・receivable ${p.receivable}`, Object.keys(sysExp).every((k) => sj[k] === sysExp[k]) && sj.pay_time_basis === p.basis && sj.shift_cast_confirm === p.confirm && sj.okuri_base_amount === p.okuri && st.receivable_policy === p.receivable, JSON.stringify({ sys: Object.keys(sysExp).filter((k) => sj[k] !== sysExp[k]), basis: sj.pay_time_basis, confirm: sj.shift_cast_confirm, okuri: sj.okuri_base_amount, rec: st.receivable_policy }));
  const ff = (T.feature_flags ?? []).filter((f) => f.store_id === null);
  check(`dpf(2-2) ${code}: feature_flags＝staff_shift ON・reopen_flow ${p.reopen ? "ON" : "OFF"}`, ff.find((f) => f.key === "staff_shift")?.enabled === true && ff.find((f) => f.key === "reopen_flow")?.enabled === p.reopen);
  const prods = T.products;
  const drinks = prods.filter((r) => backKeyOf(r) !== "food");
  const noBack = prods.filter((r) => (r.back_mode === "rate" && !(r.back_value > 0)) || (r.back_mode === "unit4" && Object.values(r.unit4_json ?? {}).every((v) => !v)));
  check(`dpf(2-3) ${code}: バック型＝全商品 ${p.back}・ドリンク ${drinks.length} 本は全部バックあり・「—」はフードだけ（${noBack.length}）`, prods.every((r) => r.back_mode === p.back) && drinks.every((r) => !noBack.includes(r)) && noBack.every((r) => backKeyOf(r) === "food") && (p.back !== "rate" || drinks.every((r) => r.back_value >= 10 && r.back_value <= 30)) && (p.back !== "unit4" || drinks.every((r) => r.unit4_json.hon >= r.unit4_json.jonai && r.unit4_json.jonai >= r.unit4_json.dohan && r.unit4_json.dohan >= r.unit4_json.free && r.unit4_json.free > 0)), `noBack=${noBack.map((r) => r.name).join(",")}`);
  check(`dpf(2-4) ${code}: cast_norms ${p.sys.norms ? "あり（当月・全キャスト）" : "なし"}・comp_plan_components ${p.sys.bonus ? "あり（achievement_bonus）" : "なし"}`, (p.sys.norms ? (T.cast_norms ?? []).length === T.casts.length && (T.cast_norms ?? []).every((n) => n.period?.fmt === "ym" && n.period?.$m === 0) : !(T.cast_norms ?? []).length) && (p.sys.bonus ? (T.comp_plan_components ?? []).length === T.comp_plans.length && (T.comp_plan_components ?? []).every((c) => c.kind === "achievement_bonus" && c.mode === "amount" && c.amount === 10000) : !(T.comp_plan_components ?? []).length));
  const needs = T.staffing_needs ?? [];
  const wk = [0, 1, 2, 3, 4, 5, 6].map((i) => T.shifts.filter((s) => s.date?.$rel === i && s.status === "confirmed").length);
  const want = p.shift.pattern.map((n: number) => Math.min(n, T.casts.length));
  const periods = T.shift_periods ?? [];
  const wishes = T.shift_wishes ?? [];
  const todayDuty = T.attendance.filter((a) => a.date?.$rel === 0 && a.status === "shukkin").map((a) => a.cast_id);
  check(`dpf(3-1) ${code}: staffing_needs 7（dow 0〜6・終日 0〜1440・金土 ${p.shift.fri_sat}・平日 ${p.shift.base}）`, needs.length === 7 && needs.every((n) => n.from_min === 0 && n.to_min === 1440) && needs.find((n) => n.dow === 5)?.required === p.shift.fri_sat && needs.find((n) => n.dow === 2)?.required === p.shift.base);
  check(`dpf(3-2) ${code}: 当週の確定＝日ごとの人数が pattern（${want.join("/")}）以上・当日は on_duty を含む・period 2（published／open）`, wk.every((n, i) => n >= want[i]) && todayDuty.every((cid) => T.shifts.some((s) => s.date?.$rel === 0 && s.cast_id === cid && s.status === "confirmed")) && periods.length === 2 && periods.some((x) => x.status === "published" && x.start_date?.$rel === 0 && x.end_date?.$rel === 6) && periods.some((x) => x.status === "open" && x.start_date?.$rel === 7 && x.end_date?.$rel === 13), `wk=${wk.join("/")}`);
  check(`dpf(3-3) ${code}: 翌週＝希望 pending ≥3・accepted は仮シフト proposed（wish_id 結線・period open）`, wishes.filter((w) => w.status === "pending" && w.date?.$rel >= 7).length >= 3 && wishes.filter((w) => w.status === "accepted").every((w) => T.shifts.some((s) => s.wish_id === w.id && s.status === "proposed" && s.date?.$rel >= 7)) && T.shifts.filter((s) => s.status === "proposed").length >= 1);
  check(`dpf(3-4) ${code}: スタッフ＝枠 2（早番 18:00-25:00／遅番 21:00-28:00）・当週 confirmed ≥7・翌週 proposed ≥4・希望 7（休み希望 1）`, (T.staff_shift_patterns ?? []).length === 2 && (T.staff_shifts ?? []).filter((s) => s.status === "confirmed" && s.biz_date?.$rel <= 6).length >= 7 && (T.staff_shifts ?? []).filter((s) => s.status === "proposed").length >= 4 && (T.staff_shift_wishes ?? []).length === 7 && (T.staff_shift_wishes ?? []).filter((w) => w.available === false).length === 1);
}

if (fails.length) {
  console.error(`verify:nox-demo-profiles FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-demo-profiles OK (${pass} checks)`);
console.log("デモ 6 店の差別化（X-13c）: 業態 5 種／報酬制度の組み合わせ／バック型 3＋3／運用設定／必要人数と 14 日分シフト＝scripts/demo/profiles.mjs と payload 6 店の一致");
