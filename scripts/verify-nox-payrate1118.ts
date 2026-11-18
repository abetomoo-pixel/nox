/*
 * verify:nox-payrate1118 — 待遇プランの「報酬率の段」の画面（2026-11-17 夜・相談役 Y3b）と、店の報酬の軸の 3 択の案内（Y3a）。
 *   npm run verify:nox-payrate1118（env: SUPABASE_DB_URL・seed:f0 済み）。DB 段は 1 トランザクション（最後に ROLLBACK＝残留 0）。
 *  pr(1) 入力の検査＝DB の comp_plan_pay_rate_check と同じ（最大 10 段・境 0〜300 の昇順（同じ値は不可）・数 0 以上・率 100 まで）。
 *  pr(2) 保存の形＝comp_plan_ext_set の p_patch は pay_rate_tiers と slide_streak_n だけ・画面に無い鍵（wage_cut_pct など）は段ごとに戻す。
 *  pr(3) 保存した段が計算に効く（canonOutcomeOf／canonApplyOf＝式は不変）：段が当たると総報酬が変わる・段が無いプランは 0 円。
 *  pr(4) 画面：owner だけ・報酬の軸が報酬率のときだけ・#pay-rate-tiers（初期設定の案内の行き先）。店舗設定の軸は 3 択目を案内（保存しない）。
 *  pr(5) DB：owner は保存できる（読み直して同じ段）・店長は 'forbidden'・段の誤り（降順・301）は 'bad pay_rate_tiers'（ROLLBACK）。
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { PAY_RATE_BACK_HOLD_NOTE, payRateRowBackEnabledOf, payRateRowDirectionOf, PAY_RATE_TIER_MAX, emptyPayRateRow, payRatePatchOf, payRateRowsErrOf, payRateRowsOf, payRateStreakErrOf, payRateTiersOf, type PayRateTierRow } from "../lib/nox/comp/pay-rate-tiers";
import { canonApplyOf, canonOutcomeOf, type CanonCtx, type PayRateTier } from "../lib/nox/rules-0175/canon";
import { slidesTabOnWithPayRate } from "../lib/nox/store-systems";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const J = JSON.stringify;
const K = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x)); // 鍵の順を問わない比較（jsonb は鍵を並べ替える）
const row = (at: string, o: Partial<PayRateTierRow> = {}): PayRateTierRow => ({ ...emptyPayRateRow(), at, ...o });

// pr(1) 入力の検査
check("pr(1-1) 空＝誤りなし（段なし＝判定しない）", payRateRowsErrOf([]) === null);
check("pr(1-2) 11 段＝誤り", payRateRowsErrOf(Array.from({ length: PAY_RATE_TIER_MAX + 1 }, (_, i) => row(String(i * 10)))) !== null);
check("pr(1-3) 10 段＝可", payRateRowsErrOf(Array.from({ length: PAY_RATE_TIER_MAX }, (_, i) => row(String(i * 10)))) === null);
check("pr(1-4) 境が同じ／小さくなる＝誤り", payRateRowsErrOf([row("40"), row("40")]) !== null && payRateRowsErrOf([row("50"), row("40")]) !== null);
check("pr(1-5) 境 300 は可・300.1 は誤り・空は誤り", payRateRowsErrOf([row("300")]) === null && payRateRowsErrOf([row("300.1")]) !== null && payRateRowsErrOf([row("")]) !== null);
check("pr(1-6) 率は 100 まで（バック率 101・総報酬の率 101＝誤り）・額は上限なし", payRateRowsErrOf([row("0", { back: "101" })]) !== null && payRateRowsErrOf([row("0", { pay: "101" })]) !== null && payRateRowsErrOf([row("0", { up: "100000" })]) === null);
check("pr(1-7) 連続の期の数は 1〜12 の整数", payRateStreakErrOf(1) === null && payRateStreakErrOf(12) === null && payRateStreakErrOf(0) !== null && payRateStreakErrOf(13) !== null && payRateStreakErrOf(1.5) !== null);

// pr(2) 保存の形
const rows = [row("0", { up: "1000" }), row("40.1", { up: "500" }), row("60.1"), row("100.1", { pay: "90", back: "0" })];
const patch = payRatePatchOf(rows, 2);
check("pr(2-1) p_patch＝pay_rate_tiers と slide_streak_n だけ", !!patch && J(Object.keys(patch).sort()) === J(["pay_rate_tiers", "slide_streak_n"]), patch);
check("pr(2-2) 空欄の鍵は送らない（据え置きの段＝at_pct だけ）", J(patch?.pay_rate_tiers) === J([{ at_pct: 0, up_amount: 1000 }, { at_pct: 40.1, up_amount: 500 }, { at_pct: 60.1 }, { at_pct: 100.1, back_mult: 0, pay_pct: 90 }]), patch?.pay_rate_tiers);
const saved: PayRateTier[] = [{ at_pct: 0, up_amount: 1000, days_min: 12 }, { at_pct: 120, pay_pct: 80, wage_cut_pct: 0, back_gate_pct: 90 }];
check("pr(2-3) 読み直し→そのまま保存＝同じ段（画面に無い鍵 days_min・wage_cut_pct・back_gate_pct も戻る）", K(payRateTiersOf(payRateRowsOf(saved))) === K(saved), payRateTiersOf(payRateRowsOf(saved)));
check("pr(2-4) 誤りがあれば保存しない（null）", payRatePatchOf([row("50"), row("40")], 2) === null && payRatePatchOf(rows, 0) === null);

// pr(3) 計算に効く（式は不変）
const ctx = (tiers: PayRateTier[]): CanonCtx => ({ tiers, streakN: 2, prevLog: null, salesSubtotal: 300000, normTiers: [], weekTarget: null, periodDays: 31, actual: { days: 20, hours: 120 }, graceMonths: 0, periodEnd: "2026-10-31", decided: "apply" });
const tiers = patch!.pay_rate_tiers;
const base = { timePay: 360000, backsTotal: 50000, gross: 410000, salesSubtotal: 300000 }; // 報酬率 120%
const o1 = canonOutcomeOf({ ...ctx(tiers), prevLog: { direction: "assess", streak: 1 } }, base.timePay);
const a1 = canonApplyOf(o1, base);
check("pr(3-1) 120%＝101% 以上の段（総報酬 90%・バック 0）・連続 2 期・適用＝総報酬が変わる", o1.pct === 120 && o1.tierIdx === 3 && o1.direction === "assess" && o1.met && a1.backsDelta === -50000 && a1.gross === Math.round((410000 - 50000) * 0.9), { o1, a1 });
const o2 = canonOutcomeOf({ ...ctx([]), prevLog: { direction: "assess", streak: 1 } }, base.timePay);
const a2 = canonApplyOf(o2, base);
check("pr(3-2) 段が無いプラン＝判定なし＝0 円（総報酬は不変）", o2.tierIdx === null && o2.direction === "hold" && a2.gross === base.gross && a2.backsDelta === 0 && a2.payPctDelta === 0, { o2, a2 });
const o3 = canonOutcomeOf(ctx(tiers), 100000);
check("pr(3-3) 33.3%＝UP の段（+1,000 円＝次の期の決定時給・今期の金額は不変）・連続 1 期では成立しない", o3.tierIdx === 0 && o3.direction === "up" && !o3.met && o3.upAmount === 0 && canonApplyOf(o3, { ...base, timePay: 100000 }).gross === base.gross, o3);

// pr(4) 画面
const ed = fs.readFileSync("app/(manage)/master/cast-comp/plan/pay-rate-tiers-editor.tsx", "utf8");
const pe = fs.readFileSync("app/(manage)/master/cast-comp/plan/plan-editor.tsx", "utf8");
check("pr(4-1) 保存＝comp_plan_ext_set（p_plan_id・p_patch＝payRatePatchOf）だけ", ed.includes('supabase.rpc("comp_plan_ext_set", { p_plan_id: planId, p_patch: patch })') && ed.includes("const patch = payRatePatchOf(rows, n);") && (ed.match(/supabase\.rpc\(/g) ?? []).length === 1);
check("pr(4-2) 行き先の印 id=pay-rate-tiers・式の説明「時給分 ÷ 売上小計」", ed.includes('id="pay-rate-tiers"') && ed.includes("報酬率＝時給分 ÷ 売上小計"));
check("pr(4-3) plan-editor：owner かつ保存済みプランかつ軸が報酬率のときだけ出す", pe.includes('{rules0175On() && draft.id && isOwner && planRewardAxisOf(plans.find((x) => x.id === draft.id) as { reward_axis?: string | null } | undefined, settings) === "pay_rate" && ('));
const sw = fs.readFileSync("app/(manage)/setup/setup-wizard.tsx", "utf8");
check("pr(4-4) 初期設定の案内の行き先＝待遇プランの報酬率の段", sw.includes('href={PAY_RATE_TIERS_HREF}') && fs.readFileSync("lib/nox/setup/v5.ts", "utf8").includes('export const PAY_RATE_TIERS_HREF = "/master/cast-comp/plan?tab=slides#pay-rate-tiers";'));
const sp = fs.readFileSync("lib/nox/store-systems.ts", "utf8");
check("pr(4-5) 店舗設定の報酬の軸＝3 択目は案内（「報酬率（待遇プランで選びます）」・保存しない）", sp.includes('export const STORE_PAY_RATE_GUIDE = "報酬率（待遇プランで選びます）";'));

// pr(6) ★2026-11-18（相談役 1）: 行き先はタブを開いて着く・報酬率のプランがある店はスライドのタブを出す（売上／pt のスライドが OFF でも）
{
  const off = { sys_sales_slide: false, sys_point_slide: false, sys_points: false };
  check("pr(6-1) スライド OFF の店でも報酬率のプランがあればタブを出す・無ければ出さない・フラグ false は従来", slidesTabOnWithPayRate(off, [{ reward_axis: "pay_rate" }], true) && !slidesTabOnWithPayRate(off, [{ reward_axis: null }], true) && !slidesTabOnWithPayRate(off, [{ reward_axis: "pay_rate" }], false));
  const pb = fs.readFileSync("app/(manage)/master/cast-comp/plan/plan-board.tsx", "utf8");
  check("pr(6-2) タブ（plan-board）と節（plan-editor）が同じ判定・リンクで来たら位置まで送る", pb.includes('k === "slides" ? slidesTabOnWithPayRate(settings, data.plans') && pe.includes("slides: slidesTabOnWithPayRate(settings, plans") && ed.includes('window.location.hash === "#pay-rate-tiers"') && sp.includes('export const STORE_PAY_RATE_HREF = "/master/cast-comp/plan?tab=slides#pay-rate-tiers";'));
}

// pr(7) ★2026-11-18（相談役 A-3）: バック率は UP と査定の段だけ（方向は計算と同じ directionOf）・下げる額の欄は残す（本番のデモ MUSE Standard に「下げる額だけで査定」の段がある）
check("pr(7-1) 行の方向＝計算と同じ（UP 額→up・総報酬の率 90→assess・下げる額だけ→assess・何も無い→hold・バック率 70 だけ→hold）", payRateRowDirectionOf(row("0", { up: "500" })) === "up" && payRateRowDirectionOf(row("0", { pay: "90" })) === "assess" && payRateRowDirectionOf(row("70", { pay: "100", down: "100" })) === "assess" && payRateRowDirectionOf(row("60")) === "hold" && payRateRowDirectionOf(row("70", { back: "70" })) === "hold");
check("pr(7-2) バック率を入れられるのは UP と査定の段だけ（据え置きは不可）・理由の 1 行", payRateRowBackEnabledOf(row("0", { up: "500" })) && payRateRowBackEnabledOf(row("100", { pay: "90" })) && !payRateRowBackEnabledOf(row("60")) && PAY_RATE_BACK_HOLD_NOTE.startsWith("据え置きの段ではバック率は効きません"));
check("pr(7-3) 画面：バック率の欄は据え置きの段で入れられない・理由の 1 行・下げる額の欄は残す", ed.includes('{cell(i, "back", "バック率", "%", !payRateRowBackEnabledOf(r))') && ed.includes("data-pay-rate-back-hold={i}") && ed.includes('{cell(i, "down", "下げる額", "円")}'));
check("pr(7-4) 据え置きの段に入っているバック率は保存のときにそのまま戻す（欄は入れられないだけ）", J(payRateTiersOf([row("60", { back: "70" })])) === J([{ at_pct: 60, back_mult: 70 }]));

async function main() {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000, application_name: "nox-verify-payrate1118" });
  await db.connect();
  const t = pgTx(db);
  try {
    await db.query("begin");
    const st = await t.storeA1();
    const owner = await t.uidOf("ownerA"), mgr = await t.uidOf("managerA1");
    const plan = await t.one<{ id: string; pay_rate_tiers: unknown; slide_streak_n: number }>(`select id, pay_rate_tiers, slide_streak_n from public.comp_plans where store_id = $1 order by name limit 1`, [st.id]);
    const r1 = await t.as({ auth_user_id: owner.auth_user_id }, `select public.comp_plan_ext_set($1, $2::jsonb)`, [plan.id, J(patch)]);
    const back = await t.one<{ pay_rate_tiers: unknown; slide_streak_n: number }>(`select pay_rate_tiers, slide_streak_n from public.comp_plans where id = $1`, [plan.id]);
    check("pr(5-1) owner＝保存できる・読み直して同じ段と連続 2 期", r1.ok && K(back.pay_rate_tiers) === K(patch!.pay_rate_tiers) && back.slide_streak_n === 2, { r1: t.errOf(r1), back });
    const r2 = await t.as({ auth_user_id: mgr.auth_user_id }, `select public.comp_plan_ext_set($1, $2::jsonb)`, [plan.id, J(patch)]);
    check("pr(5-2) 店長＝forbidden（owner だけ）", !r2.ok && t.errOf(r2).includes("forbidden"), t.errOf(r2));
    const r3 = await t.as({ auth_user_id: owner.auth_user_id }, `select public.comp_plan_ext_set($1, $2::jsonb)`, [plan.id, J({ pay_rate_tiers: [{ at_pct: 50 }, { at_pct: 40 }] })]);
    const r4 = await t.as({ auth_user_id: owner.auth_user_id }, `select public.comp_plan_ext_set($1, $2::jsonb)`, [plan.id, J({ pay_rate_tiers: [{ at_pct: 301 }] })]);
    check("pr(5-3) 降順・301＝bad pay_rate_tiers（画面の検査と同じ所で止まる）", !r3.ok && t.errOf(r3).includes("bad pay_rate_tiers") && !r4.ok && t.errOf(r4).includes("bad pay_rate_tiers") && payRateRowsErrOf([row("50"), row("40")]) !== null && payRateRowsErrOf([row("301")]) !== null, [t.errOf(r3), t.errOf(r4)]);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
  if (fails.length) { console.error(`✗ verify:nox-payrate1118 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-payrate1118 OK (${pass} checks)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
