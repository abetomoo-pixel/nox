/*
 * verify:nox-ob2 — 便 OB-2（2026-10-29・裁定438 候補「初期設定 v5＝正本」）: 初期設定 9 STEP の本体。
 *  (A) 正本＝docs/handoff/mock/setup_v5.html が repo にある・lib/nox/setup/v5.ts の 9 STEP／業態 5／テンプレ値（MENU・TPL）がモックと同じ（逐語の値 pin）。
 *  (B) 業態 5 種で STEP 1→9 の計画（buildV5Plan）＝保存先の RPC と引数（店舗設定・営業時間 7＋切替・席 N・料金ルール・VIP・商品・待遇プラン 2・スタッフ・シフト・端末・完了）の行数と値を突合。
 *  (C) 要確認（v5Checks）＝モックと同じ条件・CSV（9 列・不正行）・再開（下書きの JSON 往復）・器なしの項目（V5_SAVE_MAP has=false と deferred の対応）。
 *  (D) 画面（setup-wizard.tsx／page.tsx）＝9 STEP の見出し・主ボタン中央（.nox-actions）・自動保存・?step／?type・完了画面（1 人ずつ／CSV／PIN 印刷／ホームへ）・既存 org には出さない（layout）。
 *  (E) 本番 DB（SUPABASE_DB_URL・BEGIN…ROLLBACK・残留 0）＝業態 5 種の計画を NOX-VERIFY-A1 の owner として RPC だけ順に実行（route の段は飛ばす）→ 行数と値（営業時間 7・席・pricing_rules・products・comp_plans 2・staffing_needs・shift_periods・settings）を突合。
 *  使い方: npm run verify:nox-ob2（env: SUPABASE_DB_URL＝(E)・無ければ (E) は FAIL）
 */
import fs from "node:fs";
import { mig0190On, mig0191On } from "../lib/nox/rules-0175/flag"; // ★0190／0191 フラグ true 便
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import {
  CSV_HEADER, V5_MENU, V5_SAVE_MAP, V5_STEPS, V5_TPL, V5_TYPES, applyType, buildV5Plan, castPlanOf, parseCsv, productTypeOf, rebuildBack, seatNames, v5Checks, v5DefaultState,
  type V5Ctx, type V5State, type V5Type,
} from "../lib/nox/setup/v5";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
try { process.loadEnvFile(".env.local"); } catch { /* (E) で FAIL にする */ }

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;
const TYPES: V5Type[] = ["cabaret", "girlsbar", "snack", "lounge", "bar"];
const ctxOf = (storeId: string): V5Ctx => ({ storeId, deviceIdemKey: "00000000-0000-4000-8000-000000000001", staffIdemKeys: ["00000000-0000-4000-8000-000000000002"],
  current: { round_unit: 1, round_mode: "down", time_mode: "fixed", time_per: "table", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } });
const stateOf = (t: V5Type): V5State => { const s = applyType(v5DefaultState("2026-10-29"), t); s.shop.name = `v5 ${t}`; s.shop.addr = "東京都"; s.staff = [{ n: "佐藤", role: "店長", perm: "manager", shiftOk: true, kind: "正社員", basis: "月給", amt: 300000, pin: "1234" }]; s.devReg = true; return s; };

async function main() {
  // ── (A) 正本と写経 ──
  const html = fs.existsSync("docs/handoff/mock/setup_v5.html") ? src("docs/handoff/mock/setup_v5.html") : "";
  check("ob2(A-1) 正本モック（初期設定 v5）が repo にある（9 STEP・業態 5）", html.includes('var STEPS=["お店","席・卓","料金","メニュー","キャスト待遇","スタッフ","シフト・勤怠","会計・レジ","確認"]') && html.includes('{id:"cabaret",name:"キャバクラ"') && J(V5_STEPS) === J(["お店", "席・卓", "料金", "メニュー", "キャスト待遇", "スタッフ", "シフト・勤怠", "会計・レジ", "確認"]) && V5_TYPES.length === 5);
  const cab = V5_TPL.cabaret(), bar = V5_TPL.bar(), gb = V5_TPL.girlsbar(), lg = V5_TPL.lounge(), sn = V5_TPL.snack();
  check("ob2(A-2) テンプレ値＝モック逐語（キャバクラ セット 7,000／60 分・延長 30 分 3,500＋60 分 7,000・VIP 10,000・本指名 3,000・サ 20／VIP 25・席 卓10 VIP2／ガールズバー チャージ 3,000 カウンター 10／スナック 90 分 5,000／ラウンジ 8,000・VIP 12,000／バー チャージ 1,000・min 0）",
    cab.rules[1].set === 7000 && cab.rules[1].min === 60 && J(cab.rules[1].ext) === J([[30, 3500, 1], [60, 7000, 0]]) && cab.rules[2].set === 10000 && cab.rules[2].seat === "VIP" && cab.fees.hon === 3000 && cab.svc === 20 && cab.svcVip === 25 && cab.seats.table === 10 && cab.seats.vip === 2 && cab.pay.base === 3000 && cab.back.drink === 50 && cab.vip[0] === true && cab.vip[1] === 5000
    && gb.rules[0].set === 3000 && gb.rules[0].seat === "カウンター" && gb.seats.counter === 10 && gb.reg === true && sn.rules[0].min === 90 && sn.rules[0].set === 5000 && lg.rules[1].set === 12000 && lg.svcVip === 30 && bar.rules[0].min === 0 && bar.rules[0].set === 1000 && bar.svc === 0);
  const mc = V5_MENU.cabaret(), ms = V5_MENU.snack();
  check("ob2(A-3) メニュー＝モック逐語（キャバクラ 9 分類 19 品・Cast Drink S 1,100／550・山崎 22,000／2,200 キープ・シャンパン モエ 22,000／アルマンド 110,000・スナック 鏡月 4,000 キープ・カラオケ 100）",
    mc.length === 9 && mc.reduce((a, c) => a + c.items.length, 0) === 19 && mc[0].items[0].n === "Cast Drink S" && mc[0].items[0].p === 1100 && mc[0].items[0].b === 550 && mc[2].items[1].n === "山崎（ボトル）" && mc[2].items[1].keep === true && mc[6].items[3].p === 110000
    && ms[0].items[0].n === "鏡月（ボトル）" && ms[0].items[0].keep && ms[5].items[0].p === 100 && V5_MENU.lounge().length === 7 && V5_MENU.girlsbar().length === 7 && V5_MENU.bar().length === 6);
  const st = stateOf("cabaret");
  check("ob2(A-4) 業態を選ぶと初期値が入る（applyType）＝ルールの時間帯・曜日（定休日を除く）・席・時給・体入＝基本＋500・シャンパン＝%・レジ使用 off（キャバ）／pay（ガールズバー）",
    st.type === "cabaret" && st.rules[0].from === "20:00" && st.rules[0].to === "21:00" && st.rules[1].to === "02:00" && st.rules[0].days.length === 6 && !st.rules[0].days.includes("日") && st.seats.vip === 2 && st.pay.trial === 3500 && st.menu[6].items[0].bt === "pct" && st.menu[6].items[0].b === 10 && st.menu[0].items[0].bt === "yen" && st.reg.castReg === "off"
    && stateOf("girlsbar").reg.castReg === "pay" && stateOf("girlsbar").rules[1].from === "00:00" && stateOf("girlsbar").rules[1].to === "02:00");
  const rb = rebuildBack({ ...st, back: { ...st.back, drink: 60, bottle: 12 } });
  check("ob2(A-5) 「この率でメニューのバックを入れ直す」＝キャストドリンク 1,100×60%＝660・シャンパン 12%・キープのボトル 山崎 22,000×12%＝2,640・ビールは不変", rb.menu[0].items[0].b === 660 && rb.menu[6].items[0].b === 12 && rb.menu[2].items[1].b === 2640 && rb.menu[1].items[0].b === 0);

  // ── (B) 計画＝保存先の行数と値 ──
  const plans = Object.fromEntries(TYPES.map((t) => [t, buildV5Plan(stateOf(t), ctxOf("11111111-1111-4111-8111-111111111111"))])) as Record<V5Type, ReturnType<typeof buildV5Plan>>;
  const count = (t: V5Type, rpc: string) => plans[t].steps.filter((s) => s.rpc === rpc).length;
  const cabP = plans.cabaret; const settings = cabP.steps.find((s) => s.key === "settings")!.args!.p_patch as Record<string, unknown>;
  check("ob2(B-1) キャバクラ＝営業時間 7（日は定休日）＋切替・席 12（A1〜A10・V1〜V2）・料金ルール set 3＋延長 3（店で 3 本まで＝通常 2＋VIP 1）＋VIP 1（＋timing）・待遇プラン 2・ノルマ減額 1・スタッフ 1 人＝route＋契約＋PIN・シフト期間 1・必要人数 6・端末 1・完了 1",
    count("cabaret", "set_store_business_hours") === 7 && cabP.steps.find((s) => s.key === "hours_0")!.args!.p_is_closed === true && cabP.steps.find((s) => s.key === "hours_1")!.args!.p_close_hm === "26:00" && count("cabaret", "set_store_biz_cutoff") === 1
    && count("cabaret", "set_seat") === 12 && cabP.steps.find((s) => s.key === "seat_0")!.args!.p_name === "A1" && cabP.steps.find((s) => s.key === "seat_11")!.args!.p_kind === "VIP"
    && cabP.steps.filter((s) => s.rpc === "set_pricing_rule" && s.args!.p_fee_kind === "set").length === 3 && cabP.steps.filter((s) => s.rpc === "set_pricing_rule" && s.args!.p_fee_kind === "extension").length === 3 /* 店で 3 本まで（裁定385）＝通常 2＋VIP 1・早番の 1 本は deferred */ && cabP.steps.filter((s) => s.rpc === "set_pricing_rule" && s.args!.p_fee_kind === "vip_charge").length === 1 && count("cabaret", "set_pricing_rule_vip") === 1
    && count("cabaret", "set_comp_plan") === 2 && count("cabaret", "set_penalty_config") === 1 && cabP.steps.filter((s) => s.api?.url === "/api/staff/create").length === 1 && count("cabaret", "staff_contract_set") === 1 && count("cabaret", "set_staff_pin") === 1 && count("cabaret", "set_staff_perms") === 0
    && count("cabaret", "shift_period_set") === 1 && count("cabaret", "set_staffing_need") === 6 && cabP.steps.filter((s) => s.api?.url === "/api/kiosk/provision").length === 1 && cabP.steps[cabP.steps.length - 1].key === "done" && (cabP.steps[cabP.steps.length - 1].args!.p_patch as { setup_done: boolean }).setup_done === true,
    { hours: count("cabaret", "set_store_business_hours"), seats: count("cabaret", "set_seat"), rules: cabP.steps.filter((s) => s.rpc === "set_pricing_rule").map((s) => `${s.args!.p_fee_kind}:${s.args!.p_amount}`) });
  const r1 = cabP.steps.find((s) => s.key === "rule_1")!.args!; const e1 = cabP.steps.find((s) => s.key === "rule_1_ext_0")!.args!; const vip = cabP.steps.find((s) => s.key === "rule_vip")!.args!; const vt = cabP.steps.find((s) => s.key === "rule_vip_timing")!;
  check("ob2(B-2) 料金ルールの値＝「通常」21:00〜翌 2:00 → time_from 1260／time_to 120・dow_mask 126（月〜土）・priority 20・延長 30 分 3,500 が既定（is_default_ext）・VIP 10,000 は seat_kind VIP・VIP 料金 5,000 卓ごと＝billing_unit table＋per_set 延長 2,500（useResult p_id）",
    r1.p_amount === 7000 && r1.p_duration_min === 60 && r1.p_time_from_min === 1260 && r1.p_time_to_min === 120 && r1.p_dow_mask === 126 && r1.p_priority === 20 && e1.p_fee_kind === "extension" && e1.p_amount === 3500 && e1.p_duration_min === 30 && e1.p_is_default_ext === true
    && !cabP.steps.find((s) => s.key === "rule_0_ext_0") && cabP.steps.find((s) => s.key === "rule_2_ext_0")!.args!.p_seat_kind === "VIP" && cabP.steps.find((s) => s.key === "rule_2")!.args!.p_seat_kind === "VIP" && vip.p_amount === 5000 && vip.p_billing_unit === "table" && vt.useResult?.from === "rule_vip" && vt.useResult?.as === "p_id" && vt.args!.p_vip_timing === "per_set" && vt.args!.p_vip_ext_amount === 2500, { r1, e1, vip });
  check("ob2(B-3) 店舗設定の patch＝biz_type・use_vip／use_counter・join_set・sys_sales_slide（キャバ）・settlement monthly・pay_day 10・mid_pay advance・trial 3 日・punch_methods{self false}（店の端末だけ）・丸め 1・kiosk 3 機能・cast_register 0・staff_discount 0・pay_fee_rates card 10・pay_discount cash 0・service_rate_by_seat VIP 25・okuri_flat_tiers 3",
    settings.biz_type === "cabaret" && settings.use_vip === true && settings.use_counter === false && settings.join_mode === "join_set" && settings.sys_sales_slide === true && settings.sys_norms === true && settings.sys_bonus === true && settings.settlement_cycle === "monthly" && settings.pay_day === 10 && settings.mid_pay === "advance" && settings.trial_guarantee_days === 3
    && J(settings.punch_methods) === J({ self: false, proxy: true, kiosk: true }) && settings.punch_round_unit === 1 && J(settings.kiosk_features) === J({ punch: true, register: true, shift: true }) && settings.sys_cast_register === 0 && settings.sys_staff_discount === 0 && J(settings.pay_fee_rates) === J({ card: 10, emoney: 0, other: 0 })
    && J(settings.pay_discount_rates) === J({ cash: 0, card: 0, other: 0 }) && settings.pay_discount_base === "total" && J(settings.service_rate_by_seat) === J({ VIP: 25 }) && (settings.okuri_flat_tiers as unknown[]).length === 3 && settings.okuri_base_amount === 1000 && settings.sales_split === "prorate" && settings.sys_drink_count_back === true, settings);
  const prod = cabP.steps.find((s) => s.key === "products_bulk")!.args!.p_items as { name: string; type: string; price: number; category: string }[];
  check("ob2(B-4) 商品＝19 件（type＝キャストドリンク drink／シャンパン champ／山崎 bottle／軽食 food）・バックの上書き 1 段（set_product・argsOf product_overrides）・スナックのカラオケ＝other",
    prod.length === 19 && prod.find((x) => x.name === "Cast Drink S")!.type === "drink" && prod.find((x) => x.name === "モエ")!.type === "champ" && prod.find((x) => x.name === "山崎（ボトル）")!.type === "bottle" && prod.find((x) => x.name === "ミックスナッツ")!.type === "food"
    && cabP.steps.some((s) => s.argsOf === "product_overrides") && productTypeOf("カラオケ", { n: "カラオケ 1 曲", p: 100, b: 0, keep: false, on: true, byKind: false, bj: null, bf: null }) === "other");
  const comp0 = cabP.steps.find((s) => s.key === "comp_0")!.args!, comp1 = cabP.steps.find((s) => s.key === "comp_1")!.args!, pen = cabP.steps.find((s) => s.key === "penalty")!.args!;
  check("ob2(B-5) 待遇プラン＝基本 3,000・本指名 1,000／場内 500／同伴 1,500・売上スライド 3 段・判定 monthly・ノルマ目標 15／30／4／800,000・体験入店 3,500（スライドなし）・減額＝日数 2,000／件・本指名 1,000／件・同伴 1,500／回・売上 1,000／1 万円",
    comp0.p_base === 3000 && comp0.p_hon_back === 1000 && comp0.p_jonai_back === 500 && comp0.p_dohan_back === 1500 && J(comp0.p_sales_slide) === J([{ at: 800000, wage: 3000 }, { at: 1200000, wage: 3500 }, { at: 1600000, wage: 4500 }]) && comp0.p_slide_period === "monthly" && comp0.p_norm_days_target === 15 && comp0.p_norm_shimei_target === 30 && comp0.p_norm_dohan_target === 4 && comp0.p_norm_sales_target === 800000
    && comp1.p_name === "体験入店" && comp1.p_base === 3500 && J(comp1.p_sales_slide) === J([]) && pen.p_norm_days_per === 2000 && pen.p_norm_shimei_per === 1000 && pen.p_norm_dohan_per === 1500 && pen.p_norm_sales_per === 1000 && pen.p_norm_sales_unit === 10000 && pen.p_norm_days_flat === 0);
  const stf = cabP.steps.find((s) => s.key === "staff_0")!, stc = cabP.steps.find((s) => s.key === "staff_0_contract")!, stp = cabP.steps.find((s) => s.key === "staff_0_pin")!, per = cabP.steps.find((s) => s.key === "shift_period")!.args!;
  check("ob2(B-6) スタッフ＝/api/staff/create{name, storeId, role manager, idemKey}→membership_id・契約 {employee, monthly, 300000}（useResult p_membership_id）・PIN 1234・シフト期間 11/2〜11/8・締切 3 日前＝10/30・open・必要人数は定休日（日）を除く 6 日",
    stf.api!.body.name === "佐藤" && stf.api!.body.role === "manager" && stf.api!.resultKey === "membership_id" && stc.useResult?.as === "p_membership_id" && J(stc.args!.p_patch) === J({ contract_kind: "employee", pay_kind: "monthly", monthly: 300000 }) && stp.args!.p_pin === "1234"
    && per.p_start_date === "2026-11-02" && per.p_end_date === "2026-11-08" && per.p_wish_deadline === "2026-10-30" && per.p_status === "open" && cabP.steps.filter((s) => s.rpc === "set_staffing_need").every((s) => s.args!.p_dow !== 0 && s.args!.p_to_min === 1440), { per, stc: stc.args });
  check("ob2(B-7) 業態ごとの差＝ガールズバー 席 12（C1〜C10・A1〜A2）・VIP なし・レジ使用 2・sys_sales_slide false／スナック 90 分／バー チャージ（duration null）・サ 0／ラウンジ VIP 12,000・サ VIP 30",
    count("girlsbar", "set_seat") === 12 && plans.girlsbar.steps.find((s) => s.key === "seat_0")!.args!.p_name === "C1" && count("girlsbar", "set_pricing_rule_vip") === 0 && (plans.girlsbar.steps.find((s) => s.key === "settings")!.args!.p_patch as { sys_cast_register: number; sys_sales_slide: boolean }).sys_cast_register === 2 && (plans.girlsbar.steps.find((s) => s.key === "settings")!.args!.p_patch as { sys_sales_slide: boolean }).sys_sales_slide === false
    && plans.snack.steps.find((s) => s.key === "rule_0")!.args!.p_duration_min === 90 && plans.bar.steps.find((s) => s.key === "rule_0")!.args!.p_duration_min === null && plans.bar.steps.find((s) => s.key === "pricing")!.args!.p_service_rate === 0 && plans.lounge.steps.find((s) => s.key === "rule_1")!.args!.p_amount === 12000 && J((plans.lounge.steps.find((s) => s.key === "settings")!.args!.p_patch as { service_rate_by_seat: unknown }).service_rate_by_seat) === J({ VIP: 30 }));
  const sDef = stateOf("cabaret"); sDef.payroll.whtStaff = "other_204"; sDef.kindRate.jo = 40; sDef.shift.mode = "store"; sDef.punch.gate = true; sDef.staff[0].pin = "12345"; sDef.payroll.close = "15日";
  const dp = buildV5Plan(sDef, ctxOf("11111111-1111-4111-8111-111111111111"));
  // ★0190／0191 のフラグ true 便（2026-10-30）: 器が入った項目は deferred から消え、V5_SAVE_MAP の has=false はマイページ 3 キー（mine_settings にキーが無い）の 1 件だけ。フラグ false は従来の 8／10／3。
  { const on91 = mig0191On(), on90 = mig0190On();
    const expDp = on91 && on90 ? 1 : 8, expMap = on91 ? (on90 ? 1 : 2) : 10, expCab = on91 && on90 ? 1 : 3;
    check("ob2(B-8) 器が無い項目＝deferred と V5_SAVE_MAP の has=false の対応（フラグ true＝延長パターン 1 本だけ・has=false はマイページ 1 件・「店が決める」は 'store'／false＝8・10・3・off_only）・期間は draft・締切 null",
      dp.deferred.length === expDp && (on91 || dp.deferred.map((d) => d.item).join("|").includes("源泉区分の既定")) && V5_SAVE_MAP.filter((x) => !x.has).length === expMap && (dp.steps.find((s) => s.key === "mine")!.args!.p_settings as { shift_request_mode: string }).shift_request_mode === (on91 ? "store" : "off_only") && dp.steps.find((s) => s.key === "shift_period")!.args!.p_status === "draft" && dp.steps.find((s) => s.key === "shift_period")!.args!.p_wish_deadline === null
      && plans.cabaret.deferred.length === expCab && plans.cabaret.deferred.some((d) => d.item === "延長パターン 1 本") && (on91 || plans.cabaret.deferred.some((d) => d.item === "釣銭準備金（締めの基準額）")) && (on90 || plans.cabaret.deferred.some((d) => /打刻ゲート/.test(d.item)))
      && (!on91 || ((dp.steps.find((s) => s.key === "settings")!.args!.p_patch as Record<string, unknown>).kind_back_rate !== undefined && (dp.steps.find((s) => s.key === "settings")!.args!.p_patch as Record<string, unknown>).settlement_close_day !== undefined)) && (!on90 || typeof (dp.steps.find((s) => s.key === "settings")!.args!.p_patch as Record<string, unknown>).duty_gate === "boolean"),
      { d: dp.deferred.map((x) => x.item), n: V5_SAVE_MAP.filter((x) => !x.has).map((x) => x.item), cab: plans.cabaret.deferred.map((x) => x.item) }); }
  const cp = castPlanOf({ g: "ひなの", n: "日向", st: "在籍", kind: "業務委託", pin: "4321", dist: "near", inv: false, birthday: "2000-01-01" }, "11111111-1111-4111-8111-111111111111", { basic: "p1", trial: "p2" }, true);
  check("ob2(B-9) キャスト 1 人＝cast_create（生年月日）→set_cast_employment 委託→set_cast_plan 基本→set_cast_pin 4321→set_cast_okuri_tier near・体入は体験入店プラン",
    cp.map((s) => s.rpc).join(",") === "cast_create,set_cast_employment,set_cast_plan,set_cast_pin,set_cast_okuri_tier" && cp[0].args!.p_birthday === "2000-01-01" && cp[2].args!.p_plan_id === "p1" && cp[3].args!.p_pin === "4321" && cp[4].args!.p_tier === "near"
    && castPlanOf({ g: "x", st: "体入", kind: "雇用", pin: "", inv: false }, "s", { basic: "p1", trial: "p2" }, false).find((s) => s.rpc === "set_cast_plan")!.args!.p_plan_id === "p2");

  // ── (C) 要確認・CSV・再開 ──
  const w0 = v5Checks(stateOf("cabaret"));
  const sW = stateOf("cabaret"); sW.rules[0].to = "03:00"; sW.seats.vip = 0; sW.pay.trial = 2000; sW.kindRate.free = 60; sW.devReg = false; sW.firstShift.to = "2026-10-01"; sW.menu[0].items[0].n = " ";
  const w1 = v5Checks(sW);
  check("ob2(C-1) 要確認＝モックと同じ条件（端末登録済みの既定＝0 件／はみ出し・VIP 席 0・VIP ルール・体入 < 基本・割合の順・端末未登録 2・期間の逆転・名前が空）",
    w0.length === 0 && w1.some(([, m]) => /はみ出しています/.test(m)) && w1.some(([, m]) => m === "VIP 料金を使う設定ですが、VIP 席が 0 卓です") && w1.some(([, m]) => /VIP 席向けですが/.test(m)) && w1.some(([, m]) => m === "体験入店の時給が基本時給より低くなっています")
    && w1.some(([, m]) => /本指名 ≥ 場内 ≥ フリー/.test(m)) && w1.some(([, m]) => /店の端末が登録されていません$/.test(m)) && w1.some(([, m]) => /端末を置かないお店は OFF に/.test(m)) && w1.some(([, m]) => m === "最初のシフト期間の終了日が開始日より前です") && w1.some(([, m]) => m === "キャストドリンクに名前が空の商品があります"), w1.map((x) => x[1]));
  const csv = parseCsv(`${CSV_HEADER}\nひなの,日向 花,在籍,業務委託,,090,a@b.c,1234,近\nゆな,,体入,,,,,,\n,x,在籍,業務委託,,,,,\nみく,,在籍,派遣,,,,,\nあい,,在籍,業務委託,,,,123,\nるな,,在籍,業務委託,,,,,遠い`);
  check("ob2(C-2) CSV 9 列＝見出しを飛ばす・空は既定（在籍／業務委託／基本プラン・体入→体験入店）・不正行（源氏名が空／契約区分が不正／PIN は 4〜6 桁の数字／送り距離は 近／中／遠）",
    csv.length === 6 && csv[0].err === "" && csv[0].c[4] === "基本プラン" && csv[1].c[4] === "体験入店" && csv[1].err === "" && csv[2].err === "源氏名が空" && csv[3].err === "契約区分が不正" && csv[4].err === "PIN は 4〜6 桁の数字" && csv[5].err === "送り距離は 近／中／遠", csv.map((r) => r.err));
  const round = JSON.parse(J({ S: stateOf("lounge"), savedAt: "2026-10-29T00:00:00Z" })) as { S: V5State }; const again = buildV5Plan(round.S, ctxOf("11111111-1111-4111-8111-111111111111"));
  check("ob2(C-3) 再開＝下書き（JSON）を往復しても計画が同じ（ラウンジ）", J(again.steps) === J(plans.lounge.steps) && J(round.S) === J(stateOf("lounge")));
  check("ob2(C-4) 席の名前＝頭＋番号（カウンター C・テーブル A・VIP V）", J(seatNames({ counter: 2, table: 1, vip: 1, tp: "A", cp: "C", vp: "V" })) === J([["C1", ""], ["C2", ""], ["A1", ""], ["V1", "vip"]]));

  // ── (D) 画面 ──
  const wz = src("app/(manage)/setup/setup-wizard.tsx"), pgs = src("app/(manage)/setup/page.tsx"), lay = src("app/(manage)/layout.tsx");
  check("ob2(D-1) ウィザード＝9 STEP（V5_STEPS）・見出し 9＋完了・ステッパー aria-current・進捗バー・?step／?type（initialStep／initialType）・自動保存（DRAFT_KEY・復元・最初からやり直す）",
    wz.includes("V5_STEPS.map((n, i) =>") && ["お店について", "席・卓", "料金", "メニュー", "キャスト待遇", "スタッフ", "シフト・勤怠", "会計・レジ", "確認", "初期設定が完了しました"].every((h) => wz.includes(`>${h}</h2>`)) && wz.includes('aria-current={cur ? "step" : undefined}') && wz.includes('role="progressbar"')
    && wz.includes("initialStep?: number; initialType?: V5Type | null;") && pgs.includes("searchParams: Promise<{ step?: string; type?: string }>") && wz.includes("nox.setup.v5.draft.${storeId}") && wz.includes("window.localStorage.getItem(DRAFT_KEY(store.id))") && wz.includes("最初からやり直す"));
  check("ob2(D-2) 主ボタン中央（.nox-actions）＝footnav（次へ／この内容で始める）・完了画面（登録して次の人へ・人を登録する・PIN の一覧を印刷・ホームへ）・「後で（マスタから）」の注記（data-setup-later）・要確認（data-setup-checks）・器なし（data-setup-deferred）",
    wz.includes('<div className="nox-setup-foot" data-setup-foot="1"><div className="in">') /* ★便 SU（M-37）: 下段＝正本の固定バー（主ボタン中央の例外＝固定バー） */ && wz.includes('data-setup-start="1"') && wz.includes('data-addcast="1"') && wz.includes('data-importcsv="1"') && wz.includes('data-printpin="1"') && wz.includes('data-setup-home="1"') && wz.includes('data-setup-later="1"') && wz.includes("data-setup-checks={W.length}") && wz.includes("data-setup-deferred={planAll.deferred.length}"));
  check("ob2(D-3) 書込＝buildV5Plan の計画を順に（route は fetch・useResult・product_overrides・guard で skip）・直接呼ぶ RPC は set_product だけ・完了で下書きを消す・既存 org には出さない（layout＝setup_done !== true の店がある org は全ロール /setup＝便 SU）",
    wz.includes("const r = await runSteps(steps, { onIssued:") && wz.includes("if (st.api) {") && wz.includes("args[st.useResult.as] = v;") && J([...new Set([...wz.matchAll(/supabase\.rpc\(("[a-z_]+")/g)].map((m) => m[1]))]) === J(['"set_product"']) && wz.includes("supabase.rpc(st.rpc, args)")
    && (wz.match(/window\.localStorage\.removeItem\(DRAFT_KEY\(store\.id\)\)/g) ?? []).length === 2 && lay.includes("const needsSetup = (storeRows ?? []).some((r) => ((r.settings_json as Record<string, unknown> | null)?.setup_done) !== true);") && pgs.includes('if (role !== "owner") return <SetupWaiting storeName={target.name} />;') /* ★便 SU（M-37 (3)）: owner 以外＝manager／staff は案内・cast は /mine・関所は layout（setupGateRedirectOf） */);

  // ── (E) 本番 DB＝RPC の段だけ BEGIN…ROLLBACK で実行して突合 ──
  const url = process.env.SUPABASE_DB_URL;
  if (!url) check("ob2(E) 本番 DB＝SUPABASE_DB_URL が無い", false, "no env");
  else {
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect(); const tx = pgTx(c);
    try {
      await c.query("begin");
      const A1 = await tx.storeA1(); const owner = await tx.uidOf("ownerA");
      const sig = Object.fromEntries((await tx.q<{ n: string; a: string }>(`select proname n, pg_get_function_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace`)).map((r) => [r.n, r.a]));
      const typeOf = (rpc: string, arg: string): string => { const m = new RegExp(`${arg} ([a-z_\\[\\] ]+?)(?: DEFAULT|,|$)`).exec(sig[rpc] ?? ""); return (m?.[1] ?? "text").trim(); };
      const call = async (rpc: string, args: Record<string, unknown>) => { const ks = Object.keys(args); const sqlArgs = ks.map((k, i) => `${k} => $${i + 1}::${typeOf(rpc, k)}`).join(", "); return tx.as(owner, `select public.${rpc}(${sqlArgs}) r`, ks.map((k) => (args[k] !== null && typeof args[k] === "object" && !(Array.isArray(args[k]) && typeOf(rpc, k).endsWith("[]")) ? JSON.stringify(args[k]) : args[k]))); };
      const cur = (await tx.one<{ round_unit: number; round_mode: string; time_mode: string; time_per: string }>(`select round_unit, round_mode, time_mode, time_per from public.stores where id = $1`, [A1.id]))!;
      const ctxLive = (storeId: string): V5Ctx => ({ ...ctxOf(storeId), current: { ...ctxOf(storeId).current, round_unit: cur.round_unit, round_mode: cur.round_mode, time_mode: cur.time_mode, time_per: cur.time_per } });
      // fixture＝A1 を空に（席・料金・商品・プラン・必要人数・期間）＝ROLLBACK で戻る
      await c.query(`delete from public.staffing_needs where store_id = $1`, [A1.id]);
      await c.query(`delete from public.shift_periods where store_id = $1 and start_date >= '2026-11-01'`, [A1.id]);
      const results: Record<string, unknown> = {};
      for (const tpl of ["cabaret", "lounge"] as V5Type[]) {
        await c.query("savepoint tpl");
        await c.query(`update public.products set is_active = false where store_id = $1`, [A1.id]); // 商品 0 の guard は件数（is_active 関係なし）＝削除で代替
        await c.query(`delete from public.check_lines l using public.checks k where l.check_id = k.id and k.store_id = $1 and false`, [A1.id]);
        const plan = buildV5Plan({ ...stateOf(tpl), shop: { ...stateOf(tpl).shop, name: `NOX-VERIFY-A1` } }, ctxLive(A1.id));
        const created: Record<string, unknown> = {}; const errs: string[] = [];
        for (const st of plan.steps) {
          if (!st.rpc || st.argsOf === "product_overrides" || st.guard === "seats_empty" || st.guard === "products_empty" || st.guard === "plans_empty" || st.guard === "rules_empty") continue; // 既存データのある A1 では guard 段と route 段は飛ばす（E-2 で別に確かめる）
          const args = { ...(st.args ?? {}) }; if (st.useResult) { const v = created[st.useResult.from]; if (typeof v !== "string") continue; args[st.useResult.as] = v; }
          const r = await call(st.rpc, args); if (!r.ok) errs.push(`${st.key}: ${tx.errOf(r)}`); else created[st.key] = (r.rows[0] as { r: unknown }).r;
        }
        const sj = (await tx.one<{ s: Record<string, unknown> }>(`select settings_json s from public.stores where id = $1`, [A1.id]))!.s;
        const bh = await tx.q<{ dow: number; is_closed: boolean; close_hm: string | null }>(`select dow, is_closed, close_hm from public.store_business_hours where store_id = $1 order by dow`, [A1.id]);
        const needs = await tx.q<{ dow: number; required: number }>(`select dow, required from public.staffing_needs where store_id = $1 order by dow`, [A1.id]);
        const per = await tx.one<{ status: string; d: string }>(`select status, wish_deadline::text d from public.shift_periods where store_id = $1 and start_date = '2026-11-02'`, [A1.id]);
        const store = await tx.one<{ sr: number; cf: number; hon: number; pd: number; tr: string; inv: string; srs: Record<string, number> | null }>(`select service_rate sr, card_tax_rate cf, hon_fee hon, pay_day pd, tax_rounding tr, invoice_status inv, service_rate_by_seat srs from public.stores where id = $1`, [A1.id]);
        results[tpl] = { errs, sj: { biz: sj.biz_type, cycle: sj.settlement_cycle, kiosk: sj.kiosk_features, srs: store?.srs, tiers: (sj.okuri_flat_tiers as unknown[] | undefined)?.length, setup_done: sj.setup_done }, bh: bh.map((x) => `${x.dow}:${x.is_closed ? "休" : x.close_hm}`).join(","), needs: needs.map((x) => `${x.dow}:${x.required}`).join(","), per, store };
        await c.query("rollback to savepoint tpl");
      }
      const cabR = results.cabaret as { errs: string[]; sj: Record<string, unknown>; bh: string; needs: string; per: { status: string; d: string } | null; store: Record<string, unknown> | null };
      const lgR = results.lounge as typeof cabR;
      check("ob2(E-1) 本番（A1・ROLLBACK）＝キャバクラの計画の RPC 段がすべて通り（route と guard 段を除く）・営業時間 7（日は休・他は 26:00）・必要人数 6（4,4,4,4,5,5）・期間 open 締切 10/30・store（サ 20・カード 10・本指名 3,000・支払日 10・丸め round・インボイス未登録）・settings（biz cabaret・monthly・kiosk 3・VIP 25・距離区分 3・setup_done true）",
      cabR.errs.length === 0 && cabR.bh === "0:休,1:26:00,2:26:00,3:26:00,4:26:00,5:26:00,6:26:00" && cabR.needs === "1:4,2:4,3:4,4:4,5:5,6:5" && cabR.per?.status === "open" && cabR.per?.d === "2026-10-30" && cabR.store?.sr === 20 && cabR.store?.cf === 10 && cabR.store?.hon === 3000 && cabR.store?.pd === 10 && cabR.store?.tr === "round" && cabR.store?.inv === "unregistered"
      && cabR.sj.biz === "cabaret" && cabR.sj.cycle === "monthly" && (cabR.sj.kiosk as { punch: boolean; register: boolean; shift: boolean })?.punch === true && (cabR.sj.kiosk as { register: boolean })?.register === true && (cabR.sj.kiosk as { shift: boolean })?.shift === true && (cabR.sj.srs as { VIP: number })?.VIP === 25 && cabR.sj.tiers === 3 && cabR.sj.setup_done === true, cabR);
      check("ob2(E-2) 本番（A1・ROLLBACK）＝ラウンジも通る（サ VIP 30・サ 20・本指名 3,000・同伴 5,000 は pricing の引数）", lgR.errs.length === 0 && (lgR.sj.srs as { VIP: number })?.VIP === 30 && lgR.store?.sr === 20, lgR);
      // (E-3) 空の店で guard 段（席・料金・商品・プラン）＝A2 を空にして実行（ROLLBACK）
      await c.query("savepoint a2");
      const A2 = (await tx.one<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = 'NOX-VERIFY-A2'`))!;
      await c.query(`delete from public.cast_plan where store_id = $1`, [A2.id]); await c.query(`delete from public.comp_plan_components where plan_id in (select id from public.comp_plans where store_id = $1)`, [A2.id]);
      await c.query(`delete from public.check_lines where check_id in (select id from public.checks where store_id = $1)`, [A2.id]); await c.query(`delete from public.check_seats where check_id in (select id from public.checks where store_id = $1)`, [A2.id]);
      for (const tname of ["product_costs"]) await c.query(`delete from public.${tname} where product_id in (select id from public.products where store_id = $1)`, [A2.id]).catch(() => {});
      const tryDel = async (sql: string) => { try { await c.query(sql, [A2.id]); return true; } catch (e) { return (e as Error).message; } };
      const d = { comp: await tryDel(`delete from public.comp_plans where store_id = $1`), rules: await tryDel(`delete from public.pricing_rules where store_id = $1`), seats: await tryDel(`delete from public.seats where store_id = $1`), products: await tryDel(`delete from public.products where store_id = $1`) };
      const emptyOk = Object.values(d).every((x) => x === true);
      if (emptyOk) {
        const plan = buildV5Plan({ ...stateOf("cabaret"), shop: { ...stateOf("cabaret").shop, name: "NOX-VERIFY-A2" } }, ctxLive(A2.id));
        const created: Record<string, unknown> = {}; const errs: string[] = [];
        for (const st of plan.steps) {
          if (!st.rpc) continue;
          if (st.argsOf === "product_overrides") continue;
          const args = { ...(st.args ?? {}) }; if (st.useResult) { const v = created[st.useResult.from]; if (typeof v !== "string") continue; args[st.useResult.as] = v; }
          const r = await call(st.rpc, args); if (!r.ok) errs.push(`${st.key}: ${tx.errOf(r)}`); else created[st.key] = (r.rows[0] as { r: unknown }).r;
        }
        const cnt = await tx.one<{ seats: number; rules: number; ext: number; vip: number; products: number; plans: number }>(`select (select count(*) from public.seats where store_id = $1)::int seats, (select count(*) from public.pricing_rules where store_id = $1 and fee_kind = 'set')::int rules, (select count(*) from public.pricing_rules where store_id = $1 and fee_kind = 'extension')::int ext, (select count(*) from public.pricing_rules where store_id = $1 and fee_kind = 'vip_charge' and vip_timing = 'per_set' and vip_ext_amount = 2500)::int vip, (select count(*) from public.products where store_id = $1)::int products, (select count(*) from public.comp_plans where store_id = $1)::int plans`, [A2.id]);
        const defExt = await tx.one<{ n: number }>(`select count(*)::int n from public.pricing_rules where store_id = $1 and fee_kind = 'extension' and is_default_ext`, [A2.id]);
        const nItems = (plan.steps.find((s) => s.key === "products_bulk")!.args!.p_items as unknown[]).length;
        check("ob2(E-3) 本番（A2 を空にして・ROLLBACK）＝席 12・料金 set 3・延長 3（既定 1）・VIP 1（per_set・延長 2,500）・商品＝計画の件数・待遇プラン 2 が入る・エラー 0", errs.length === 0 && cnt?.seats === 12 && cnt.rules === 3 && cnt.ext === 3 && defExt?.n === 1 && cnt.vip === 1 && cnt.products === nItems && cnt.plans === 2, { errs, cnt, defExt, nItems, bulk: created["products_bulk"] });
      } else check("ob2(E-3) A2 を空にできた（参照が残るときは skip ではなく FAIL＝fixture を見直す）", false, d);
      await c.query("rollback to savepoint a2");
    } catch (e) { check("ob2(E) 例外なし", false, (e as Error).message); }
    finally { await c.query("rollback").catch(() => {}); const left = await c.query(`select count(*)::int n from public.comp_plans where name in ('基本プラン','体験入店') and store_id in (select id from public.stores where name like 'NOX-VERIFY-A%')`).catch(() => ({ rows: [{ n: -1 }] })); check("ob2(E-9) ROLLBACK（残留 0）", (left.rows[0] as { n: number }).n === 0, left.rows[0]); await c.end().catch(() => {}); }
  }

  if (fails.length) { console.error(`verify:nox-ob2 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-ob2 OK ${pass} checks（初期設定 v5＝9 STEP・業態 5・計画と本番突合・CSV・再開・画面）`);
}
void main();
