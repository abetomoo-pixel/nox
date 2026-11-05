/*
 * verify:nox-m83 — デモデータ便（2026-11-05・裁定451 ①／454・M-83〜M-92）の純関数と client の pin（DB は読まない＝f0 の末尾・live のデモ行は verify:nox-demo-lane＝reset 後に単走）。
 *  (1) M-83 見積の「30 分あたり」／(2) M-85 /mine 今日の確定シフトの 1 行／(3) M-86 ヘッダーに店名／(4) M-90 実効の給与の形／(5) M-91 初期時間・時刻の制限のラベル／
 *  (6) gen-demo の payload（ACE＝延長パターン 3 本 60 分・store 60／13,000・開栓済み VIP 席＝18,000・凍結メニューは席種の行だけ）／(7) seed の reset 後 hook（availability・VIP-1 の ext_rule_id）／(8) client の pin（M-84／M-87／M-88／M-89／M-91／M-92）
 *  使い方: npm run verify:nox-m83
 */
import fs from "node:fs";
import { extPer30Of, extPer30TextOf } from "../lib/nox/register/ext-estimate";
import { todayShiftLineOf } from "../lib/nox/shift/punch-state";
import { userChipLabelOf } from "../lib/nox/ui/nav-tabs";
import { effectivePayKindOf } from "../lib/nox/staff/work";
import { availHmOf, availTimeBadgeOf, availTimeCellOf, initialSpanOf } from "../lib/nox/shift/half-hour";
import { DEMO_LANE_AVAIL } from "../lib/nox/demo/seed";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1) M-83
check("m83(1-1) 30 分あたり＝extAmount×30÷extMin（13,000／60→6,500・18,000／60→9,000・2,200／30→2,200・3,500／30→3,500・円未満は四捨五入）・文言「30 分あたり ¥6,500／人」（人数制）", extPer30Of(13000, 60) === 6500 && extPer30Of(18000, 60) === 9000 && extPer30Of(2200, 30) === 2200 && extPer30Of(1000, 45) === 667 && extPer30Of(1000, 0) === 0 && extPer30TextOf(13000, 60, true) === "30 分あたり ¥6,500／人" && extPer30TextOf(2200, 30, false) === "30 分あたり ¥2,200");
check("m83(1-2) 表＝各パターンの見出しに 30 分あたり（data-ext-estimate-per30）", src("components/nox/ext-estimate-table.tsx").includes("data-ext-estimate-per30={extPer30Of(p.extAmount, p.extMin)}") && src("components/nox/ext-estimate-table.tsx").includes("extPer30TextOf(p.extAmount, p.extMin, units > 1 || perPerson)"));
// (2) M-85
const biz = "2026-11-05"; const at = (hm: string) => Date.parse(`${biz}T${hm}:00+09:00`);
check("m85(2-1) 未出勤＝「今日の出勤 20:00〜翌02:00（あと 4 時間 30 分）」（15 分単位に丸め）・開始を過ぎたら「開始から 40 分 経過」・ちょうど 1 時間／30 分の表記",
  todayShiftLineOf({ shift: { start_hm: "20:00", end_hm: "26:00" }, state: "none", inAt: null, nowMs: at("15:28"), bizToday: biz }) === "今日の出勤 20:00〜翌02:00（あと 4 時間 30 分）"
  && todayShiftLineOf({ shift: { start_hm: "20:00", end_hm: "26:00" }, state: "none", inAt: null, nowMs: at("20:40"), bizToday: biz }) === "今日の出勤 20:00〜翌02:00（開始から 40 分 経過）"
  && todayShiftLineOf({ shift: { start_hm: "20:00", end_hm: "23:30" }, state: "none", inAt: null, nowMs: at("19:00"), bizToday: biz }) === "今日の出勤 20:00〜23:30（あと 1 時間）"
  && todayShiftLineOf({ shift: { start_hm: "20:00", end_hm: "23:30" }, state: "none", inAt: null, nowMs: at("19:35"), bizToday: biz }) === "今日の出勤 20:00〜23:30（あと 30 分）");
check("m85(2-2) 出勤中＝「出勤 19:35（退勤予定 翌02:00）」・退勤済み＝「（退勤済み）」・確定シフトが無い日＝「今日のシフトはありません」",
  todayShiftLineOf({ shift: { start_hm: "20:00", end_hm: "26:00" }, state: "open", inAt: new Date(at("19:35")).toISOString(), nowMs: at("21:00"), bizToday: biz }) === "出勤 19:35（退勤予定 翌02:00）"
  && todayShiftLineOf({ shift: { start_hm: "20:00", end_hm: "26:00" }, state: "closed", inAt: null, nowMs: at("23:00"), bizToday: biz }) === "今日の出勤 20:00〜翌02:00（退勤済み）"
  && todayShiftLineOf({ shift: null, state: "none", inAt: null, nowMs: at("19:00"), bizToday: biz }) === "今日のシフトはありません");
check("m85(2-3) /mine＝打刻枠の先頭の 1 行（data-mine-today-shift・todayShiftLineOf・今日の confirmed シフト）", src("app/mine/page.tsx").includes("data-mine-today-shift=") && src("app/mine/page.tsx").includes("todayShiftLineOf({ shift: (((shiftsAll ?? []) as ShiftLite[]).find((x) => x.date === bizToday && x.status === \"confirmed\")) ?? null, state: ps.state, inAt: ps.inAt, nowMs: Date.now(), bizToday })"));
// (3) M-86
check("m86(3-1) userChipLabelOf＝店名を前置「CLUB ACE ・ ひなの｜キャスト」・storeLabel が無ければ従来・/mine の layout だけ storeInLabel・UserChip の prop",
  userChipLabelOf({ name: "ひなの", email: null, roleJa: "キャスト", storeLabel: "CLUB ACE" }) === "CLUB ACE ・ ひなの｜キャスト" && userChipLabelOf({ name: "ひなの", email: null, roleJa: "キャスト" }) === "ひなの｜キャスト" && userChipLabelOf({ name: "ひなの", email: null, roleJa: "キャスト", storeLabel: "  " }) === "ひなの｜キャスト"
  && src("app/mine/layout.tsx").includes("storeInLabel isDemo={isDemo}") && src("components/ui/header-chips.tsx").includes("userChipLabelOf({ name, email, roleJa, storeLabel: storeInLabel ? storeLabel : null })") && !src("app/(manage)/layout.tsx").includes("storeInLabel"));
// (4) M-90
check("m90(4-1) effectivePayKindOf＝pay_kind 'hourly'（列の既定）でも 時給 0・fixed_allowance 300,000 → monthly・monthly 列があれば monthly・daily>0 → daily・時給あり → hourly・pay_kind が monthly なら monthly・null → hourly",
  effectivePayKindOf({ pay_kind: "hourly", hourly: 0, fixed_allowance: 300000 }) === "monthly" && effectivePayKindOf({ pay_kind: "hourly", hourly: 0, fixed_allowance: 0, monthly: 250000 }) === "monthly" && effectivePayKindOf({ pay_kind: "hourly", hourly: 0, fixed_allowance: 0, daily: 9000 }) === "daily"
  && effectivePayKindOf({ pay_kind: "hourly", hourly: 1300, fixed_allowance: 10000 }) === "hourly" && effectivePayKindOf({ pay_kind: "monthly", hourly: 0, fixed_allowance: 0, monthly: 300000 }) === "monthly" && effectivePayKindOf(null) === "hourly");
check("m90(4-2) 働き方の編集欄＝給与側 openContract と /staff の formOf が effectivePayKindOf で開く", src("app/(manage)/staff/staff-work-panel.tsx").includes("const pk = effectivePayKindOf(c);") && src("components/nox/staff-work-section.tsx").includes("const pk0 = effectivePayKindOf(c);"));
// (5) M-91
check("m91(5-1) 時刻の制限のラベル＝badge「23:00〜翌01:00」・cell「23:00〜01:00」・availHmOf（1500→25:00）・初期時間＝希望 → 基本の働き方 → 営業時間 → 既定",
  availTimeBadgeOf({ from: 1380, to: 1500 }) === "23:00〜翌01:00" && availTimeCellOf({ from: 1380, to: 1500 }) === "23:00〜01:00" && availTimeBadgeOf(null) === null && availHmOf(1500) === "25:00" && availHmOf(1200) === "20:00"
  && J(initialSpanOf({ start_hm: "21:00:00", end_hm: "25:00:00" }, { from: 1200, to: 1500 }, ["20:00", "26:00"], ["20:00", "26:00"])) === J({ start: "21:00", end: "25:00" })
  && J(initialSpanOf(null, { from: 1200, to: 1500 }, ["19:00", "26:00"], ["20:00", "26:00"])) === J({ start: "20:00", end: "25:00" }) && J(initialSpanOf(null, null, ["19:00", "26:00"], ["20:00", "26:00"])) === J({ start: "19:00", end: "26:00" }) && J(initialSpanOf(null, null, null, ["20:00", "26:00"])) === J({ start: "20:00", end: "26:00" }));
{
  const dap = src("app/(manage)/shift/day-add-panel.tsx"), saf = src("app/(manage)/shift/shift-add-form.tsx"), sb = src("app/(manage)/shift/shift-board.tsx");
  check("m91(5-2) 割当モーダル＝各行に時刻の制限のバッジ（data-day-add-avail-time）・不可（休み希望・曜日が不可）は「それでも追加」＝理由必須・初期時間は initialSpanOf・確認ダイアログは撤去",
    dap.includes("data-day-add-avail-time={String(dow)}") && dap.includes("needReason: st.why === \"wish_off\" || st.why === \"avail_ng\"") && dap.includes("initialSpanOf(st.wish, availTimeByCast[c.id]?.[dow] ?? null, preset ?? null, [FALLBACK_START, FALLBACK_END])") && !dap.includes("window.confirm(availNgConfirmOf"));
  check("m91(5-3) まとめて追加＝セルに時刻の制限（data-day-avail-time）・entryFor は 希望 → 基本の働き方の時刻 → 営業時間・shift-board が from_min／to_min を読んで両方に渡す",
    saf.includes("data-day-avail-time=\"1\"") && saf.includes("if (at) return { start: availHmOf(at.from), end: availHmOf(at.to), src: \"new\", override };") && sb.includes("select(\"membership_id, cast_id, dow, avail, from_min, to_min\")") && sb.includes("availTimeByCast={availTimeByCast}") && sb.split("availTimeByCast={availTimeByCast}").length === 3);
  check("m91(5-4) 適用開始日が空＝保存日（JST）を入れて保存（判定側は日付を見ない＝null でも有効）", src("components/nox/availability-editor.tsx").includes("if (!patch.p_terms.effective_from) patch.p_terms = { ...patch.p_terms, effective_from: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) };"));
}
// (6) gen-demo の payload（ACE）
{
  const pl = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> };
  const t = pl.tables;
  const ext = t.pricing_rules.filter((r) => r.fee_kind === "extension").map((r) => [r.name, r.duration_min, r.amount, r.seat_kind, r.is_default_ext, r.dow_mask]);
  check("m83(6-1) ACE の延長パターン 3 本＝平日通常 延長 60 分 60／13,000（既定・月〜木 dow_mask 15）・VIP 延長 60／18,000（seat_kind VIP・月〜木）・週末通常 延長 60／15,000（金土 48）＝単位は店内で 60", J(ext) === J([["平日通常 延長 60 分", 60, 13000, null, true, 15], ["VIP 延長", 60, 18000, "VIP", false, 15], ["週末通常 延長", 60, 15000, null, false, 48]]), ext);
  const st = t.stores[0];
  check("m83(6-2) 裁定454 の 1＝stores.ext_min／ext_fee＝60／13,000（平日通常の既定の行）", st.ext_min === 60 && st.ext_fee === 13000, [st.ext_min, st.ext_fee]);
  const seats = Object.fromEntries(t.seats.map((s) => [s.id as string, s.kind as string]));
  const open = t.checks.filter((c) => c.status === "open").map((c) => ({ kind: seats[c.seat_id as string], min: c.ext_min, fee: c.ext_fee, snap: ((c.ext_menu_snap ?? []) as { label: string }[]).map((m) => m.label).join("|"), rule: c.ext_rule_id }));
  check("m83(6-3) 開栓済み＝卓は 60／13,000（平日通常）・VIP 席は 60／18,000・凍結メニューは席種の行だけ（卓＝平日通常｜週末通常・VIP＝＋VIP 延長）・ext_rule_id は payload に載せない（hook が置く）",
    open.length >= 2 && open.filter((o) => o.kind !== "VIP").every((o) => o.min === 60 && o.fee === 13000 && o.snap === "平日通常 延長 60 分|週末通常 延長" && o.rule === null) && open.filter((o) => o.kind === "VIP").every((o) => o.min === 60 && o.fee === 18000 && o.snap === "平日通常 延長 60 分|VIP 延長|週末通常 延長" && o.rule === null) && open.some((o) => o.kind === "VIP"), open);
  const gd = src("scripts/demo/gen-demo.mjs"), pf = src("scripts/demo/profiles.mjs");
  check("m83(6-4) 生成器＝extra（週末通常）の行・seat_kind・凍結メニューの席種フィルタ・開栓済みは vip だけ渡す", pf.includes("{ key: \"extvip\", name: \"VIP 延長\", minutes: 60, amount: 18000, isDefault: false, seatKind: \"VIP\" }") && pf.includes("extra: { \"週末通常\": [{ key: \"extwe\", name: \"週末通常 延長\", minutes: 60, amount: 15000, isDefault: false }] }") && gd.includes("EXT_SNAP.filter((m) => !m.seat_kind || (vip && m.seat_kind === \"VIP\"))") && gd.includes("backsByCast: {}, vip: tbl.seat_type === \"vip\" });"));
}
// (7) seed の reset 後 hook
{
  const sd = src("lib/nox/demo/seed.ts");
  check("m83(7-1) 裁定451 ①＝ひなの 金 不可・他 可 20:00〜翌01:00（1200〜1500）・週 5／あい 月 不可／ほかの店の代表＝水 相談・週 4（DEMO_LANE_AVAIL）", J(DEMO_LANE_AVAIL.hinano) === J({ ng: [5], from: 1200, to: 1500, week: 5 }) && J(DEMO_LANE_AVAIL.ai) === J({ ng: [1], week: null }) && J(DEMO_LANE_AVAIL.rep) === J({ ask: [3], week: 4 }));
  check("m83(7-2) afterResetHooks → demoLaneHooksFor＝店ごとに availability／availability_terms を delete → insert・ACE の VIP 席の開栓済み伝票＝ext_rule_id を seat_kind VIP の延長ルールに（ext_fee／ext_min も）・失敗は reason に残し reset は止めない",
    sd.includes("try { out.lane = await demoLaneHooksFor(admin, orgId); }") && sd.includes("await admin.from(\"availability\").delete().eq(\"store_id\", st.id)") && sd.includes("await admin.from(\"availability_terms\").delete().eq(\"store_id\", st.id)") && sd.includes(".eq(\"fee_kind\", \"extension\").eq(\"seat_kind\", \"VIP\").eq(\"is_active\", true)") && sd.includes("update({ ext_rule_id: rule.id as string, ext_fee: rule.amount as number, ext_min: rule.duration_min as number }).eq(\"store_id\", st.id).eq(\"status\", \"open\").in(\"seat_id\", ids)"));
}
// (8) client の pin
{
  const fg = src("app/auth/forgot/page.tsx"), lg = src("app/login/page.tsx"), ae = src("components/nox/availability-editor.tsx"), wf = src("app/mine/wishes/wish-form.tsx"), swp = src("app/(manage)/staff/staff-work-panel.tsx"), sws = src("components/nox/staff-work-section.tsx"), spd = src("app/(manage)/shift/staff-place-day.tsx"), ssm = src("app/(manage)/shift/staff-shift-manage.tsx"), w4 = src("components/nox/withholding-432-panel.tsx");
  check("m84(8-1) /login に「パスワードをお忘れの方」（/auth/forgot）・forgot＝resetPasswordForEmail（redirectTo＝/auth/set-password）・文言は入力の有無に関わらず同じ（FORGOT_SENT_TEXT）・回数制限だけ別の文言",
    lg.includes("<Link href=\"/auth/forgot\" className=\"nox-link\" data-login-forgot=\"1\">パスワードをお忘れの方</Link>") && fg.includes("supabase.auth.resetPasswordForEmail(v, { redirectTo })") && fg.includes("const redirectTo = `${window.location.origin}/auth/set-password`;") && fg.includes("setSent(true);") && fg.includes("data-forgot-sent=\"1\"") && fg.includes("if (error && /rate limit|too many/i.test(error.message))"));
  check("m87(8-2) /mine の基本の働き方＝本人は auth_membership_id() で解く・読取専用の表（曜日×可否・時間・メモ・週の目安・適用開始日）・未設定は「店がまだ設定していません」・「アカウント未発行」の分岐は本人画面に無い・wish-form／staff/me も RPC",
    ae.includes("if (bySelf) { const { data: me } = await supabase.rpc(\"auth_membership_id\"); mid = typeof me === \"string\" ? me : null; }") && ae.includes("data-avail-self-table=\"1\"") && ae.includes("data-avail-self-none=\"1\">店がまだ設定していません") && ae.includes("{loaded && !edit && !bySelf && <span")
    && wf.includes("const { data: mid } = await sb.rpc(\"auth_membership_id\");") && swp.includes("if (scope === \"me\" && rows.length === 0) {") && swp.includes("supabase.rpc(\"auth_membership_id\"), supabase.rpc(\"auth_role\"), supabase.rpc(\"auth_store_id\")"));
  check("m88(8-3) スタッフの基本の働き方＝/staff の「働き方」の節に AvailabilityEditor（membershipId＝membership 軸・availability_set）・配置ピッカー（その日に配置）に不可＝赤／相談＝黄（data-staff-avail）・staff-shift-manage が availability を読む",
    sws.includes("<AvailabilityEditor castId=\"\" storeId={storeId} employment={null} bySelf={false} membershipId={memId} readOnly={!canEdit} />") && ae.includes("if (fixedMembershipId) mid = fixedMembershipId;") && src("app/(manage)/staff/staff-board.tsx").includes("storeId={sel.store_id} /* ★M-88 */")
    && spd.includes("data-staff-avail=\"ng\">不可</span>") && spd.includes("data-staff-avail=\"ask\">相談</span>") && ssm.includes("supabase.from(\"availability\").select(\"membership_id, dow, avail\").eq(\"store_id\", storeId).not(\"membership_id\", \"is\", null)") && ssm.includes("availByStaff={availByStaff}"));
  check("m89(8-4) 源泉と控除（給与）の額＝MoneyInput（¥ 接頭辞・data-emp-ded-amount は包みに）", w4.includes("<span data-emp-ded-amount={f.kind} style={{ display: \"block\" }}><MoneyInput value={f.amount}") && w4.includes("import MoneyInput from \"@/components/ui/money-input\";"));
  check("m92(8-5) 基本の働き方＝店の定休日の曜日は選択と時刻欄を出さず「定休日」（保存値は触らない・設定値を読むだけ）＝編集の行（data-avail-closed）と /mine の表（data-avail-self-closed）", ae.includes("data-avail-closed={String(r.dow)}") && ae.includes("data-avail-self-closed=\"1\"") && ae.includes("closedDows.has(r.dow)"));
}
if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m83 ALL PASS (${pass} assertions)`);
