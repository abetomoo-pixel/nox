/*
 * verify:nox-rate1117 — 初期設定の「報酬率スライド」（2026-11-17 相談役 2・Agoora「初期設定からいる」）。DB 不触・env 不要。
 *   npm run verify:nox-rate1117。
 *  r(1) 報酬率を選ぶと、基本プランを作った後に報酬の軸（reward_axis＝pay_rate）だけを保存する手順（comp_plan_ext_set・前の手順のプランの id）。段（pay_rate_tiers）は送らない。
 *  r(2) そのときプランの売上／ポイントのスライドは空＝段を入れるまで計算は基本の時給（報酬率の段が無い＝判定なし＝据え置き）。
 *  r(3) 画面＝選択肢に「段はあとで待遇プランで設定します」・確認の画面に「段を入れるまでは基本の時給で計算されます」。
 *  r(4) 売上／ポイントを選んだときは今のまま（軸の手順は無い）。
 */
import fs from "node:fs";
import { applyType, buildV5Plan, v5DefaultState, RATE_SLIDE_TIERS_LATER, RATE_SLIDE_BASE_UNTIL_TIERS, type V5State } from "../lib/nox/setup/v5";
import { payRateTierOf, directionOf, payRatePctOf } from "../lib/nox/rules-0175/canon";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const ctx = { storeId: "11111111-1111-4111-8111-111111111111", current: { round_unit: 100, round_mode: "down", time_mode: "auto", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: {} as never, tax: { business_tax_status: "taxable", price_display: "in", invoice_status: "none", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } }, deviceIdemKey: "d", staffIdemKeys: [] } as never;
const S: V5State = clone(applyType(v5DefaultState("2026-11-17"), "cabaret")); S.pay.slide = "rate";
const plan = buildV5Plan(S, ctx);
const ax = plan.steps.find((s) => s.key === "comp_0_axis");
check("r(1-1) 報酬率＝基本プランの後に軸の手順（comp_plan_ext_set・useResult comp_0→p_plan_id・patch は reward_axis だけ）",
  !!ax && ax.rpc === "comp_plan_ext_set" && JSON.stringify(ax.useResult) === JSON.stringify({ from: "comp_0", as: "p_plan_id" }) && JSON.stringify(ax.args) === JSON.stringify({ p_patch: { reward_axis: "pay_rate" } }), ax);
const i0 = plan.steps.findIndex((s) => s.key === "comp_0"), i1 = plan.steps.findIndex((s) => s.key === "comp_0_axis");
check("r(1-2) 順＝基本プラン（comp_0）の後に軸（comp_0_axis）", i0 >= 0 && i1 > i0, [i0, i1]);
check("r(1-3) 段（pay_rate_tiers）はどの手順にも無い", !JSON.stringify(plan.steps).includes("pay_rate_tiers"));
const c0 = plan.steps.find((s) => s.key === "comp_0")?.args as Record<string, unknown> | undefined;
check("r(2-1) 基本プランの売上／ポイントのスライドは空", JSON.stringify(c0?.p_sales_slide) === "[]" && JSON.stringify(c0?.p_point_slide) === "[]", c0 && { s: c0.p_sales_slide, p: c0.p_point_slide });
const hit = payRateTierOf([], payRatePctOf(300000, 1000000));
check("r(2-2) 段が無い＝判定なし＝据え置き（時給は基本のまま）", hit === null && directionOf(null) === "hold");
check("r(2-3) 後回しの一覧にも段の案内", plan.deferred.some((d) => d.item === "報酬率スライドの段" && d.note === RATE_SLIDE_TIERS_LATER));
const sw = fs.readFileSync("app/(manage)/setup/setup-wizard.tsx", "utf8");
check("r(3-1) 選択肢に「段はあとで待遇プランで設定します」", RATE_SLIDE_TIERS_LATER === "段はあとで待遇プランで設定します" && sw.includes('data-setup-rate-later="1">{RATE_SLIDE_TIERS_LATER}'));
check("r(3-2) 確認の画面に「段を入れるまでは基本の時給で計算されます」", RATE_SLIDE_BASE_UNTIL_TIERS === "段を入れるまでは基本の時給で計算されます" && sw.includes('["時給スライド", p.slide === "rate" ? `${slideLabel}（${RATE_SLIDE_BASE_UNTIL_TIERS}）` : slideLabel]'));
for (const k of ["sales", "point"] as const) {
  const S2: V5State = clone(applyType(v5DefaultState("2026-11-17"), "cabaret")); S2.pay.slide = k;
  check(`r(4) ${k} を選んだときは軸の手順が無い（今のまま）`, !buildV5Plan(S2, ctx).steps.some((s) => s.key === "comp_0_axis"));
}
if (fails.length) { console.error(`✗ verify:nox-rate1117 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-rate1117 OK (${pass} checks)`);
