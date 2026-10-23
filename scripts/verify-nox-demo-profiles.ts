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
import { TRIAL, EXTRA_PLANS, PROFILES, PROFILE_CODES, backKeyOf, sysSettingsOf } from "../scripts/demo/profiles.mjs";
/** ★便 PR-1 R-3: 相対日の並べ替えキー＝{$rel}はそのまま・{$m:0,d}（当月 d 日）は −31＋d（当月の過去日として R−1 より前）・{$m:-1,d} は −62＋d */
const relKeyOf = (v: { $rel?: number; $m?: number; d?: number } | null | undefined): number => typeof v?.$rel === "number" ? v.$rel : typeof v?.$m === "number" ? v.$m * 31 - 31 + (v.d ?? 1) : -999;

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Prof = Row;
const P = PROFILES as Record<string, Prof>;
const codes = PROFILE_CODES as string[];

// (1) 表の整合
const count = (f: (p: Prof) => boolean) => codes.filter((c) => f(P[c])).length;
check("dpf(1-1) 業態（★348 追補2・便 N1014 B-4）＝キャバクラ 3（ACE／LUNA／MUSE）・ラウンジ NOIR・スナック NEST・ガールズバー LILY＝4 種・MUSE は指名 ON（nominations）", new Set(codes.map((c) => P[c].template)).size === 4 && count((p) => p.template === "cabaret") === 3 && P.luna.template === "cabaret" && P.ace.template === "cabaret" && P.muse.template === "cabaret" && P.noir.template === "lounge" && P.nest.template === "snack" && P.lily.template === "girlsbar" && (P.muse as { nominations?: boolean }).nominations === true && count((p) => !!(p as { nominations?: boolean }).nominations) === 1);
check("dpf(1-2) バックの型＝率％型 3 店（MUSE／LILY／NEST）・4 段階型 3 店（LUNA／NOIR／ACE）・率の高低（cast 30／25／20）", count((p) => p.back === "rate") === 3 && count((p) => p.back === "unit4") === 3 && P.muse.rate.cast === 30 && P.lily.rate.cast === 25 && P.nest.rate.cast === 20 && P.noir.u4.hon > P.luna.u4.hon);
check("dpf(1-3) 報酬制度の組み合わせ（★裁定348）＝時給＋バックのみ 1（NEST）・ノルマ 5（MUSE 4 軸／LUNA 日数・同伴／NOIR 指名／ACE 売上・指名／LILY 日数）・達成ボーナス 1（LILY）・ポイント制 1（NOIR）・売上スライド 3（ACE 月次／LUNA 半月／MUSE 月次）・ポイントスライド 1（NOIR）＝★便 X13-H H-7（裁定412・348 追補）: MUSE は売上軸・売上歩合 1（MUSE）＝6 店とも違う", count((p) => !p.sys.norms && !p.sys.bonus && !p.sys.points && !p.sys.sales_slide) === 1 && count((p) => p.sys.norms) === 5 && count((p) => p.sys.bonus) === 1 && P.lily.sys.bonus === true && count((p) => p.sys.points) === 1 && P.noir.sys.points === true && count((p) => p.sys.sales_slide) === 3 && count((p) => !!p.sys.point_slide) === 1 && P.muse.sys.points === false && P.muse.sys.point_slide === false && count((p) => !!p.sys.sales_rate) === 1 && P.muse.sys.sales_rate === true && JSON.stringify(P.muse.normAxes) === JSON.stringify(["days", "dohan", "sales", "shimei"]) && JSON.stringify(P.luna.normAxes) === JSON.stringify(["days", "dohan"]) && JSON.stringify(P.noir.normAxes) === JSON.stringify(["shimei"]) && JSON.stringify(P.ace.normAxes) === JSON.stringify(["sales", "shimei"]) && JSON.stringify(P.lily.normAxes) === JSON.stringify(["days", "sales"]) /* ★348 追補2 B-2: 達成ボーナスの目標＝売上 */ && P.nest.normAxes.length === 0 && new Set(codes.map((c) => JSON.stringify(P[c].sys))).size === 6);
check("dpf(1-4) 運用設定（★裁定348）＝計算基準 実打刻 4／確定シフト 2（NOIR・LILY）・送り 実費 2（MUSE・ACE）／定額 2（LUNA・NEST）／なし 2（NOIR・LILY 店負担）・売掛 3・締め解除 3・キャスト確認 2（NOIR・ACE）・雇用 1（LILY）・日払い 1（LILY）・休み希望のみ 1（NEST）", count((p) => p.basis === "punch") === 4 && P.noir.basis === "shift" && P.lily.basis === "shift" && count((p) => p.okuriMode === "actual") === 2 && count((p) => p.okuriMode === "flat") === 2 && count((p) => p.okuri === 0 && p.okuriMode === null) === 2 && count((p) => p.receivable !== "disabled") === 3 && count((p) => p.reopen) === 3 && count((p) => p.confirm) === 2 && count((p) => p.employment === "雇用") === 1 && P.lily.dailyPay === true && count((p) => p.wishMode === "off_only") === 1 && P.nest.wishMode === "off_only");
check("dpf(1-5) シフトの充足／不足＝充足 3（MUSE／LUNA／LILY）・不足 3（NOIR／ACE／NEST）・pattern は 7 日ぶん", count((p) => p.shift.fill === "full") === 3 && count((p) => p.shift.fill === "short") === 3 && codes.every((c) => P[c].shift.pattern.length === 7) && codes.filter((c) => P[c].shift.fill === "short").every((c) => P[c].shift.pattern.some((n: number) => n < P[c].shift.base)));

// (2)(3) payload
for (const code of codes) {
  const p = P[code];
  const pl = JSON.parse(fs.readFileSync(`docs/demo/payload/${code}.json`, "utf8")) as { tables: Record<string, Row[]> };
  const T = pl.tables; const st = T.stores[0]; const sj = st.settings_json as Row;
  const sysExp = sysSettingsOf(code) as Row;
  check(`dpf(2-1) ${code}: settings_json の sys_* 9＝プロファイル・pay_time_basis ${p.basis}・shift_cast_confirm ${p.confirm}・okuri ${p.okuri}（${p.okuriMode ?? "なし"}）・receivable ${p.receivable}・shift_request_mode ${p.wishMode}`, (sj.okuri_mode ?? null) === (p.okuriMode ?? null) && sj.shift_request_mode === p.wishMode && Object.keys(sysExp).every((k) => sj[k] === sysExp[k]) && sj.pay_time_basis === p.basis && sj.shift_cast_confirm === p.confirm && sj.okuri_base_amount === p.okuri && st.receivable_policy === p.receivable, JSON.stringify({ sys: Object.keys(sysExp).filter((k) => sj[k] !== sysExp[k]), basis: sj.pay_time_basis, confirm: sj.shift_cast_confirm, okuri: sj.okuri_base_amount, rec: st.receivable_policy }));
  const ff = (T.feature_flags ?? []).filter((f) => f.store_id === null);
  check(`dpf(2-2) ${code}: feature_flags＝staff_shift ON・reopen_flow ${p.reopen ? "ON" : "OFF"}`, ff.find((f) => f.key === "staff_shift")?.enabled === true && ff.find((f) => f.key === "reopen_flow")?.enabled === p.reopen);
  const prods = T.products;
  const drinks = prods.filter((r) => backKeyOf(r) !== "food");
  const noBack = prods.filter((r) => (r.back_mode === "rate" && !(r.back_value > 0)) || (r.back_mode === "unit4" && Object.values(r.unit4_json ?? {}).every((v) => !v)));
  check(`dpf(2-3) ${code}: バック型＝全商品 ${p.back}・ドリンク ${drinks.length} 本は全部バックあり・「—」はフードだけ（${noBack.length}）`, prods.every((r) => r.back_mode === p.back) && drinks.every((r) => !noBack.includes(r)) && noBack.every((r) => backKeyOf(r) === "food") && (p.back !== "rate" || drinks.every((r) => r.back_value >= 10 && r.back_value <= 30)) && (p.back !== "unit4" || drinks.every((r) => r.unit4_json.hon >= r.unit4_json.jonai && r.unit4_json.jonai >= r.unit4_json.dohan && r.unit4_json.dohan >= r.unit4_json.free && r.unit4_json.free > 0)), `noBack=${noBack.map((r) => r.name).join(",")}`);
  check(`dpf(2-4) ${code}: cast_norms ${p.sys.norms ? "あり（当月・代表キャスト 1 名＝個別上書き・他はプラン既定を継承＝★裁定347）" : "なし"}・comp_plan_components ${p.sys.bonus ? "あり（achievement_bonus）" : "なし"}`, (p.sys.norms ? (T.cast_norms ?? []).length === (code === "lily" ? 3 : 1) /* ★348 追補2 B-2: LILY は先月 2 名（達成／未達）＋当月 1 */ && (T.cast_norms ?? []).every((n) => n.period?.fmt === "ym" && (n.period?.$m === 0 || (code === "lily" && n.period?.$m === -1))) : !(T.cast_norms ?? []).length) && (p.sys.bonus ? (T.comp_plan_components ?? []).length === T.comp_plans.filter((x) => x.name !== "体験入店").length && (T.comp_plan_components ?? []).every((c) => c.kind === "achievement_bonus" && c.mode === "amount" && c.amount === 10000) : !(T.comp_plan_components ?? []).length)); // ★裁定348: 体験入店にはボーナスなし
  // ★X-13-21（便 X-13d-1）: 待遇プラン＝源泉＋EXTRA_PLANS（1 本の店に 2〜3 本目・ACE は 1 本のまま）・cast_plan は全キャスト・追加プランにも割当あり
  { const ex = (EXTRA_PLANS as Record<string, { name: string }[]>)[code] ?? []; const plans = T.comp_plans ?? []; const cps = T.cast_plan ?? []; const casts = T.casts ?? [];
    const exIds = new Set(plans.filter((p) => ex.some((x) => x.name === p.name)).map((p) => p.id));
    check(`dpf(2-5) ${code}: comp_plans ${plans.length} 本（追加 ${ex.length}・ACE 以外は ≥2）・cast_plan＝casts ${casts.length} 全員・追加プランへの割当 ${cps.filter((c) => exIds.has(c.plan_id)).length} 人`,
      exIds.size === ex.length && (code === "ace" ? plans.length === 2 : plans.length >= 3) && plans.some((x) => x.name === "体験入店") && cps.length === casts.length + 2 && new Set(cps.map((c) => c.cast_id)).size === casts.length && (ex.length === 0 || cps.some((c) => exIds.has(c.plan_id)))); } // ★裁定348 追補1: 体験入店 +1 本・cast_plan は体験入店のキャストが 3 行（+2）
  // ★裁定337（便 X-13d-2b）: 3 方式が混ざる（null＝店の既定・'shift'・'off_only' が各 1 人以上）／★0168 先行: comp_plans.slide_period＝ACE／NOIR monthly・LUNA half・他 daily
  { const cs = (T.casts ?? []) as { shift_request_mode?: string | null }[]; const m = (v: string | null) => cs.filter((c) => (c.shift_request_mode ?? null) === v).length;
    const sp = new Set(((T.comp_plans ?? []) as { name?: string; slide_period?: string }[]).filter((p) => p.name !== "体験入店").map((p) => p.slide_period)); const exp = ({ ace: "monthly", noir: "monthly", luna: "half", muse: "monthly" } as Record<string, string>)[code] ?? "daily"; // ★裁定348: MUSE 併用は月次・体験入店は daily 固定で除外
    check(`dpf(2-6) ${code}: シフト希望の方式＝既定 ${m(null)}／shift ${m("shift")}／off_only ${m("off_only")}（各 ≥1）・comp_plans.slide_period＝${[...sp].join(",")}（期待 ${exp}）`, m(null) >= 1 && m("shift") >= 1 && m("off_only") >= 1 && sp.size === 1 && sp.has(exp)); }
  const needs = T.staffing_needs ?? [];
  const wk = [0, 1, 2, 3, 4, 5, 6].map((i) => T.shifts.filter((s) => s.date?.$rel === i && s.status === "confirmed").length);
  const want = p.shift.pattern.map((n: number) => Math.min(n, T.casts.length));
  const periods = T.shift_periods ?? [];
  const wishes = T.shift_wishes ?? [];
  const todayDuty = T.attendance.filter((a) => a.date?.$rel === 0 && a.status === "shukkin").map((a) => a.cast_id);
  { const T2 = T as Record<string, Array<Record<string, any>>>; const tr = (T2.comp_plans ?? []).find((x) => x.name === "体験入店"); const trCast = (T2.casts ?? []).find((c) => c.name === TRIAL[code as keyof typeof TRIAL].cast); const rows = (T2.cast_plan ?? []).filter((c) => trCast && c.cast_id === trCast.id).sort((a, b) => relKeyOf(a.valid_from) - relKeyOf(b.valid_from)); const t = TRIAL[code as keyof typeof TRIAL] as (typeof TRIAL)[keyof typeof TRIAL] & { guaFromMonthStart?: boolean; guaToRel?: number }; // ★便 PR-1 R-3: 月相対 {$m:0,d} も並べる
    check(`dpf(2-7) ${code}: 体験入店＝base ${t.base}・スライド 0・バック 0・plan_fixed 0／${t.cast} の cast_plan 3 行（${t.guaFromMonthStart ? `〜前月末／保証 ${t.gua} 当月 1 日〜R${t.guaToRel}／戻し R${(t.guaToRel ?? 0) + 1}〜（★PR-1 R-3）` : `〜R${t.from - 1}／保証 ${t.gua} R${t.from}〜R${t.to}／戻し R${t.to + 1}〜`}）`, !!tr && tr.base === t.base && tr.sales_slide.length === 0 && tr.point_slide.length === 0 && tr.hon_back === 0 && tr.product_back_mode === "plan_fixed" && tr.product_back_fixed === 0 && rows.length === 3 && rows.every((r) => r.plan_id === tr.id) && rows[1].overrides_json?.guarantee === true && rows[1].overrides_json?.base === t.gua && rows[2].valid_to === null
    && (t.guaFromMonthStart /* ★便 PR-1 R-3（裁定416）: ACE るな＝保証 当月 1 日〜R+guaToRel・前の行は前月末・戻しは R+guaToRel+1 */
      ? (rows[0].valid_to?.$m === -1 && rows[0].valid_to?.d === 31 && rows[1].valid_from?.$m === 0 && rows[1].valid_from?.d === 1 && rows[1].valid_to?.$rel === (t.guaToRel ?? 0) && rows[2].valid_from?.$rel === (t.guaToRel ?? 0) + 1)
      : (rows[0].valid_to?.$rel === t.from - 1 && rows[1].valid_from?.$rel === t.from && rows[1].valid_to?.$rel === t.to && rows[2].valid_from?.$rel === t.to + 1)), `rows=${rows.length}`);
    check(`dpf(2-8) ${code}: 雇用 ${p.employment}（cast_tax_profiles も同じ）・日払い ${p.dailyPay ? "4 件（先月・2 名×2）" : "なし"}・cast_norms の軸＝${p.normAxes.join("/") || "なし"}`, (T2.casts ?? []).every((c) => c.employment === p.employment) && (T2.cast_tax_profiles ?? []).every((c) => c.mode === p.employment) && (p.dailyPay ? (T2.daily_pays ?? []).length === 4 && (T2.daily_pays ?? []).every((d) => d.withholding === 0 && d.net === d.gross && d.biz_date?.$m === -1) : !(T2.daily_pays ?? []).length) && (T2.cast_norms ?? []).every((n) => (p.normAxes.includes("days") || n.days_target === 0) && (p.normAxes.includes("dohan") || n.dohan_target === 0) && (p.normAxes.includes("sales") || n.sales_target === 0) && (p.normAxes.includes("shimei") || n.shimei_target === 0)) && (T2.cast_quotas ?? []).every((q) => (p.normAxes.includes("sales") || q.sales === null) && (p.normAxes.includes("dohan") || q.dohan === null) && (p.normAxes.includes("shimei") || (q.hon === null && q.jonai === null)))); }
  check(`dpf(3-1) ${code}: staffing_needs 7（dow 0〜6・終日 0〜1440・金土 ${p.shift.fri_sat}・平日 ${p.shift.base}）`, needs.length === 7 && needs.every((n) => n.from_min === 0 && n.to_min === 1440) && needs.find((n) => n.dow === 5)?.required === p.shift.fri_sat && needs.find((n) => n.dow === 2)?.required === p.shift.base);
  check(`dpf(3-2) ${code}: 当週の確定＝日ごとの人数が pattern（${want.join("/")}）以上・当日は on_duty を含む・period 2（published／open）`, wk.every((n, i) => n >= want[i]) && todayDuty.every((cid) => T.shifts.some((s) => s.date?.$rel === 0 && s.cast_id === cid && s.status === "confirmed")) && periods.length === 2 && periods.some((x) => x.status === "published" && x.start_date?.$rel === 0 && x.end_date?.$rel === 6) && periods.some((x) => x.status === "open" && x.start_date?.$rel === 7 && x.end_date?.$rel === 13), `wk=${wk.join("/")}`);
  check(`dpf(3-3) ${code}: 翌週＝希望 pending ≥3・accepted は planned（★裁定345: 本番の採用直後と同じ段・wish_id 結線・period open）`, wishes.filter((w) => w.status === "pending" && w.date?.$rel >= 7).length >= 3 && wishes.filter((w) => w.status === "accepted").every((w) => T.shifts.some((s) => s.wish_id === w.id && s.status === "planned" && s.date?.$rel >= 7)) && T.shifts.filter((s) => s.status === "planned" && s.wish_id).length >= 1 && T.shifts.filter((s) => s.status === "proposed").length === 0);
  check(`dpf(3-4) ${code}: スタッフ＝枠 2（早番 18:00-25:00／遅番 21:00-28:00）・当週 confirmed ≥7・翌週 proposed ≥4・希望 7（休み希望 1）`, (T.staff_shift_patterns ?? []).length === 2 && (T.staff_shifts ?? []).filter((s) => s.status === "confirmed" && s.biz_date?.$rel <= 6).length >= 7 && (T.staff_shifts ?? []).filter((s) => s.status === "proposed").length >= 4 && (T.staff_shift_wishes ?? []).length === 7 && (T.staff_shift_wishes ?? []).filter((w) => w.available === false).length === 1);
}

if (fails.length) {
  console.error(`verify:nox-demo-profiles FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-demo-profiles OK (${pass} checks)`);
console.log("デモ 6 店の差別化（X-13c）: 業態 5 種／報酬制度の組み合わせ／バック型 3＋3／運用設定／必要人数と 14 日分シフト＝scripts/demo/profiles.mjs と payload 6 店の一致");
