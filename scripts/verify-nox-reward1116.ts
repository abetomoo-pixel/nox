/*
 * verify:nox-reward1116 — スライドの方式は 3 つ（ポイント・売上・報酬）（2026-11-16 夜・相談役／Agoora 18:10「報酬スライドがなくなっている」）。DB 不触・env 不要。
 *   npm run verify:nox-reward1116。
 *  r(1) 待遇プランの編集＝報酬の軸（スライドの方式）を選ぶ所＝店の軸に従う＋売上・ポイント・報酬率の 3 つ（便 M5 M-36 で外したラジオを元の形に戻した・保存＝comp_plan_ext_set）。
 *  r(2) 初期設定＝スライドの方式に売上・ポイント・報酬率（＋使用しない）。
 *  r(3) 時給の見込み（裁定501-7）＝報酬率の人には給与と同じ canon の見込み（報酬率 → 時給・次の段まで・据え置きの注記）・売上／pt の段で作らない。
 */
import fs from "node:fs";
import { PLAN_REWARD_AXIS_LABEL, planRewardAxisPatchOf } from "../lib/nox/rules-0175/settings";
import { wageForecastOf } from "../lib/nox/cast/current-wage";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const pe = fs.readFileSync("app/(manage)/master/cast-comp/plan/plan-editor.tsx", "utf8");
const sw = fs.readFileSync("app/(manage)/setup/setup-wizard.tsx", "utf8");

check("r(1-1) スライドの方式は 3 つ（売上・ポイント・報酬率）", JSON.stringify(Object.keys(PLAN_REWARD_AXIS_LABEL)) === JSON.stringify(["sales", "pts", "pay_rate"]) && PLAN_REWARD_AXIS_LABEL.pay_rate === "報酬率（時給分 ÷ 売上小計）");
check("r(1-2) 待遇プランの編集に選ぶ所（ラジオ）＝店の軸に従う・売上・ポイント・報酬率（M-36 の表示だけの形ではない）",
  pe.includes('([["store", "店の軸に従う"], ["sales", PLAN_REWARD_AXIS_LABEL.sales], ["pts", PLAN_REWARD_AXIS_LABEL.pts], ["pay_rate", PLAN_REWARD_AXIS_LABEL.pay_rate]] as const)')
  && pe.includes('<input type="radio" name="plan-reward-axis"') && !pe.includes("data-plan-reward-axis-own"));
check("r(1-3) 保存＝comp_plan_ext_set の reward_axis（pts→'pt'・店の軸＝null）・owner だけ押せる",
  pe.includes('supabase.rpc("comp_plan_ext_set", { p_plan_id: draft.id, p_patch: planRewardAxisPatchOf(axisDraft === "store" ? null : axisDraft) })') && pe.includes("disabled={!isOwner || axisBusy} aria-label={`報酬の軸 ${label}`}") /* ★夜便 2026-11-20 N2: 押した瞬間ではなく下書き→「保存」で同じ中身を送る */
  && JSON.stringify(planRewardAxisPatchOf("pay_rate")) === JSON.stringify({ reward_axis: "pay_rate" }) && JSON.stringify(planRewardAxisPatchOf("pts")) === JSON.stringify({ reward_axis: "pt" }) && JSON.stringify(planRewardAxisPatchOf(null)) === JSON.stringify({ reward_axis: null }));
check("r(2-1) 初期設定のスライドの方式＝売上・ポイント・報酬率（＋使用しない）", sw.includes('{ sales: "売上スライド", point: "ポイントスライド", rate: "報酬率スライド", none: "使用しない" }'));

const canonPay = (toNext: number | null) => ({ wdays: [{ basis: "売上", hourly: 2500, sales: 30000, pts: 0 }], eplan: { base: 2500, salesSlide: [{ at: 300000, wage: 3000 }], pointSlide: [] }, slideBasis: { months: [{ month: "2026-11", sales: 500000, pts: 0 }] },
  canon: { forecast: { axis: "pay_rate", wage: 1800, judge: "報酬率 40.8%", toNext, note: "据え置き（連続 1／2 期・来期も同じ段なら +¥300/h）" } } });
const f1 = wageForecastOf(canonPay(4448), "monthly", "current", { skip: false });
check("r(3-1) 報酬率の人＝「報酬率 40.8% → 時給 ¥1,800」・あと ¥4,448 で次の段・据え置きの注記・見出しは来月（来期の決定時給）",
  JSON.stringify(f1) === JSON.stringify({ label: "来月の時給の見込み", main: "報酬率 40.8% → 時給 ¥1,800", next: "あと ¥4,448 で次の段・据え置き（連続 1／2 期・来期も同じ段なら +¥300/h）" }), f1);
const f2 = wageForecastOf(canonPay(null), "half", "next", { skip: false });
check("r(3-2) 最上段（あと なし）は注記だけ・半月は「次の半月」", f2?.label === "次の半月の時給の見込み" && f2?.next === "据え置き（連続 1／2 期・来期も同じ段なら +¥300/h）", f2);
check("r(3-3) 体入・保証の間は出さない（今の決まりのまま）", wageForecastOf(canonPay(1), "monthly", "current", { skip: true }) === null);
const f4 = wageForecastOf({ ...canonPay(1), canon: { forecast: { axis: "sales", wage: 3000, judge: "売上 ¥500,000", toNext: 1, note: null } } }, "monthly", "current", { skip: false });
check("r(3-4) 報酬率でない人は今のまま（売上の段）", f4?.main === "売上 ¥500,000 → 時給 ¥3,000（1 段）", f4);

if (fails.length) { console.error(`✗ verify:nox-reward1116 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-reward1116 OK (${pass} checks)`);
