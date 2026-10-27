/*
 * verify:nox-on4 — 便 ON-4（2026-10-26）: C2-22 来期の時給見込み（Agoora 確定 10/26 ⑨）・C2-23 席移動の料金（裁定427＋確定 ①・0182 起草＝フラグ false）・0177 残り（一括フォームの見出し）・通知の時刻表記（ON-3 live）。DB 不触。
 *  (1) C2-22 純関数: 売上スライド（ACE 型＝段 3 本）／pt スライド／報酬率軸（MUSE 型＝10 段・N＝2・W 別規定）＝給与と同じ部品（slideAt／canonOutcomeOf）と期末で一致・規定未達／連続未満／査定の注記・1 行の文
 *  (2) C2-22 配線: pay.ts が canon.forecast を積む（金額に効かない）・breakdown の next-wage 行（確定済みには出さない）・/mine の data-mine-next-wage
 *  (3) C2-23: seatKindChangeOf／seatMoveConfirmTextOf／serviceRateForSeatOf・フラグ SEAT_MOVE_PRICING_APPLIED＝false（flag.ts と mjs が同値）・register は seatMovePricingOn() のときだけ確認・0182 の形（単一トランザクション・貼り先証明・service_pre・延長行の VIP 化）
 *  (4) 0177 残り: 一括フォームの見出しが送り方式で 4 通り／(5) 通知の時刻＝翌hh:mm
 *  逆テスト（手動・各 1 回）: canonNextWageOf の規定未達チェックを外す→on4(1-3) 赤／breakdown の !input.frozen を外す→on4(2-2) 赤。
 */
import fs from "node:fs";
import { slideAt } from "../lib/nox/pay";
import { canonOutcomeOf, type CanonCtx, type PayRateTier } from "../lib/nox/rules-0175/canon";
import { canonNextWageOf, nextWageLineOf, nextWageOfPay, slideNextWageOf } from "../lib/nox/payroll/next-wage";
import { breakdownLinesOf } from "../lib/nox/payroll/breakdown-lines";
import { seatKindChangeOf, seatMoveConfirmTextOf, serviceRateForSeatOf } from "../lib/nox/register/seat-move";
import { SEAT_MOVE_PRICING_APPLIED, seatMovePricingOn } from "../lib/nox/rules-0175/flag";
import { bulkHeadOf } from "../components/nox/issue-bulk-form";
import { shiftAddedBody, shiftProposedBody } from "../lib/nox/people/notify-text";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── (1) C2-22 ──
const aceSlides = [{ at: 600000, wage: 3000 }, { at: 1000000, wage: 3500 }, { at: 1500000, wage: 4000 }];
const s1 = slideNextWageOf({ base: 2500, slides: aceSlides, value: 1223846, axis: "sales" });
check("on4(1-1) 売上スライド（ACE 型）＝今期 ¥1,223,846 → 来期 ¥3,500（slideAt と同じ）・次の段 ¥1,500,000 まであと ¥276,154・最上段は null・段なしは基本", s1?.wage === 3500 && s1.wage === Math.max(2500, slideAt(aceSlides, 1223846)) && s1.toNext === 276154 && slideNextWageOf({ base: 2500, slides: aceSlides, value: 1600000, axis: "sales" })?.toNext === null && slideNextWageOf({ base: 2500, slides: aceSlides, value: 100, axis: "sales" })?.wage === 2500, s1);
const museTiers: PayRateTier[] = JSON.parse(JSON.stringify(JSON.parse(src("docs/demo/payload/muse.json")).tables.comp_plans.find((p: { name: string }) => p.name === "MUSE Standard").pay_rate_tiers));
const ctx: CanonCtx = { tiers: museTiers, streakN: 2, prevLog: { direction: "up", streak: 1 }, salesSubtotal: 1000000, normTiers: [{ week_days_min: 1, week_days_max: 2, days_required: 6, hours_required: 30 }, { week_days_min: 3, week_days_max: 4, days_required: 12, hours_required: 60 }], weekTarget: 3, periodDays: 31, actual: { days: 14, hours: 70 }, graceMonths: 3, periodEnd: "2026-10-31" };
const f1 = canonNextWageOf(ctx, 300000, 1800); // 30% → 段 1（at 0・UP +500）・連続 2／2・規定 12 日 60h を満たす
const o1 = canonOutcomeOf({ ...ctx, decided: "apply" }, 300000);
check("on4(1-2) 報酬率軸（MUSE 型・N＝2）＝報酬率 30% → 段 1（UP +¥500）・連続 2 期・規定済み＝来期 ¥2,300＝期末に店が「適用」したときの canonOutcomeOf の upAmount と一致・段 1＝最上段", f1?.wage === 2300 && f1.wage === 1800 + o1.upAmount && f1.judge === "報酬率 30%" && f1.toNext === null && f1.note === null, { f1, up: o1.upAmount });
const f2 = canonNextWageOf({ ...ctx, actual: { days: 9, hours: 70 } }, 300000, 1800);
const f3 = canonNextWageOf({ ...ctx, prevLog: null }, 300000, 1800);
const f4 = canonNextWageOf(ctx, 450000, 1800); // 45% → 段 2（at 40・UP +300）・次の段＝報酬率 40% 未満＝売上小計 1,125,001 以上＝あと ¥125,001
const f5 = canonNextWageOf(ctx, 850000, 1800); // 85% → 査定（支給率 95%）
check("on4(1-3) 規定未達＝据え置き「規定未達のため UP なし（あと 4 日）」（31 日の期＝13 日）・連続 1／2＝据え置き（来期も同じ段なら +¥500/h）・45%＝段 2（+¥300）でも連続 1／2…ではなく前期 up 1 期＝連続 2＝¥2,100・次の段まであと ¥125,001・査定＝時給据え置き＋注記", f2?.wage === 1800 && f2.note === "規定未達のため UP なし（あと 4 日）" /* 規定 12 日×31÷30＝13 日（normRequiredOf） */ && f3?.wage === 1800 && (f3.note ?? "").startsWith("据え置き（連続 1／2 期") && f4?.wage === 2100 && f4.toNext === 125001 && f5?.wage === 1800 && (f5.note ?? "").startsWith("査定の段（支給率 95%）"), { f2, f3, f4, f5 });
const ln = nextWageLineOf(f4);
check("on4(1-4) 1 行の文＝「来期の時給見込み ¥2,100（今期の判定値 報酬率 45%・あと ¥125,001 で次の段）」＋小さく「見込み＝確定値ではありません」・スライドの無いプランは null", ln?.label === "来期の時給見込み ¥2,100（今期の判定値 報酬率 45%・あと ¥125,001 で次の段）" && (ln?.label2 ?? "").includes("見込み＝確定値ではありません") && nextWageOfPay({ eplan: { base: 2000, salesSlide: [], pointSlide: [] } }) === null && nextWageLineOf(null) === null, ln);
const payNext = { eplan: { base: 2500, salesSlide: aceSlides, pointSlide: [] }, slideBasis: { apply: "next", months: [{ month: "2026-10", sales: 1296287, pts: 0 }] }, wdays: [{ sales: 600000 }, { sales: 623846 }] };
const payCur = { ...payNext, slideBasis: { apply: "monthly", months: [{ month: "2026-10", sales: 855956, pts: 0 }] } };
const payMonthlyPrev = { ...payNext, slideBasis: { apply: "monthly", months: [{ month: "2026-10", prevMonth: "2026-09", sales: 1296287, pts: 0 }] } }; // ★ON-4 live: core が apply を monthly に書き換えた形（前月の累計で判定）
check("on4(1-5) 今期の値＝'next'（前月の累計で判定・core が monthly に書き換えた形＝prevMonth≠month も）は日次の合計（¥1,223,846）・それ以外は months の累計（¥855,956）・canon.forecast があればそれを優先", nextWageOfPay(payNext)?.judge === "売上 ¥1,223,846" && nextWageOfPay(payMonthlyPrev)?.judge === "売上 ¥1,223,846" && nextWageOfPay(payCur)?.judge === "売上 ¥855,956" && nextWageOfPay({ ...payCur, canon: { forecast: f1 } })?.axis === "pay_rate");

// ── (2) 配線 ──
const pay = src("lib/nox/pay.ts"), bd = src("lib/nox/payroll/breakdown-lines.ts"), mp = src("app/mine/page.tsx"), ws = src("lib/nox/mine/wage-server.ts");
check("on4(2-1) pay.ts＝canon.forecast＝canonNextWageOf（金額に効かない＝gross は ap.gross のまま）", pay.includes("forecast: canonNextWageOf(input.rules0175, timePayRule, wd.wage || eplan.base || 0) };") && pay.includes("gross = ap.gross;"));
const base = { wage: 2500, wHours: 100, timePay: 250000, honBack: 0, jonaiBack: 0, dohanBack: 0, ...payNext } as unknown as Parameters<typeof breakdownLinesOf>[0]["pay"];
const live = breakdownLinesOf({ pay: base }).earn.find((l) => l.key === "next-wage");
const frozen = breakdownLinesOf({ pay: base, frozen: true }).earn.find((l) => l.key === "next-wage");
check("on4(2-2) 給与右パネル＝スライド行の下に next-wage 行（金額 0・—）・確定済み（frozen）の明細には出さない", !!live && live.amount === 0 && live.amountText === "—" && live.label.startsWith("来期の時給見込み ¥3,500") && !frozen, live);
check("on4(2-3) /mine＝今期の時給の下に data-mine-next-wage（wage-server が同じ PayResult から nextWageOfPay）", mp.includes('data-mine-next-wage="1"') && ws.includes("next: nextWageLineOf(nextWageOfPay(me.pay as NextWagePayLike))"));

// ── (3) C2-23 ──
check("on4(3-1) 席種の変化＝卓／カウンター＝同格・VIP＝上位・確認文（上位セット中＝置換／上位延長中＝この先の延長から／下位＝残す）・同種間と入金済みは確認なし", seatKindChangeOf("卓", "VIP") === "up" && seatKindChangeOf("VIP", "カウンター") === "down" && seatKindChangeOf("卓", "カウンター") === "same" && (seatMoveConfirmTextOf({ change: "up", hasExtension: false, paid: false, toKind: "VIP", serviceRateTo: 35 }) ?? "").includes("差し替えます（追加ではなく置換）") && (seatMoveConfirmTextOf({ change: "up", hasExtension: true, paid: false, toKind: "VIP", serviceRateTo: null }) ?? "").includes("この先の延長から") && (seatMoveConfirmTextOf({ change: "down", hasExtension: false, paid: false, toKind: "卓", serviceRateTo: 30 }) ?? "").includes("返金はありません") && seatMoveConfirmTextOf({ change: "same", hasExtension: false, paid: false, toKind: "卓", serviceRateTo: 30 }) === null && seatMoveConfirmTextOf({ change: "up", hasExtension: false, paid: true, toKind: "VIP", serviceRateTo: 35 }) === null && serviceRateForSeatOf({ VIP: 35 }, "VIP", 30) === 35 && serviceRateForSeatOf({ vip: "35" }, "VIP", 30) === 35 && serviceRateForSeatOf({}, "VIP", 30) === 30);
const fm = src("scripts/demo/rules-0175-flag.mjs"), rb = src("app/(manage)/register/register-board.tsx"), m182 = src("supabase/migrations/0182_check_move_seat_pricing.sql");
check("on4(3-2) フラグ SEAT_MOVE_PRICING_APPLIED＝true（★便 0182 2026-10-27 手貼り後）・mjs と同値・register は seatMovePricingOn() のときだけ確認を挟む", SEAT_MOVE_PRICING_APPLIED === true && seatMovePricingOn() && /SEAT_MOVE_PRICING_APPLIED = true/.test(fm) && rb.includes("if (seatMovePricingOn()) {") && rb.includes("if (text && !confirm(text)) return;"));
check("on4(3-3) 0182 の形＝単一トランザクション・貼り先証明・checks.service_pre・check_group_due＝凍結額＋増分×現在率・check_move_seat＝①置換②延長行の VIP 化（確定 ①）④⑤・ACL", m182.includes("\nbegin;\nselect 'nox-project-proof', count(*) from public.orgs;") && m182.includes("\ncommit;\n") && m182.includes("alter table public.checks add column if not exists service_pre jsonb not null default '{}'::jsonb;") && m182.includes("v_sv     := v_pre_amt + round(greatest(0, v_net - v_pf - v_pre_base) * v_rate / 100.0)::int;") && m182.includes("if v_from_kind is distinct from v_to_kind and v_paid = 0 then") && m182.includes("name_snapshot = name_snapshot || '（VIP）'") && m182.includes("revoke all on function public.check_group_due(uuid, text, boolean) from public, anon, authenticated, service_role;") && m182.includes("grant execute on function public.check_move_seat(uuid, uuid) to authenticated;") && fs.existsSync("docs/demo/handpaste_0182.md"));

// ── (4)(5) ──
check("on4(4-1) 一括フォームの見出し＝送り方式で（実費＝タクシー代の立替／定額徴収／店負担／なし＝前借りだけ）", bulkHeadOf("actual") === "前借り／送り（タクシー代の立替）の一括発行" && bulkHeadOf("flat") === "前借り／送り（定額徴収）の一括発行" && bulkHeadOf("store") === "前借り／送り（店負担）の一括発行" && bulkHeadOf("none") === "前借りの一括発行（送りは「なし」の店）" && src("components/nox/issue-bulk-form.tsx").includes("data-bulk-head={okuriMode ?? \"actual\"}>{bulkHeadOf(okuriMode)}</h3>"));
check("on4(5-1) 通知の時刻＝他の画面と同じ「翌02:00」（ON-3 live で 26:00 表記を発見）", shiftAddedBody("2026-10-28", "20:00", "26:00") === "10/28（水） 20:00–翌02:00 のシフトが確定しました" && shiftProposedBody("2026-11-04", "21:00", "26:00").startsWith("11/4（水） 21:00–翌02:00 のシフト案が届きました"));

if (fails.length) { console.error(`verify:nox-on4 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-on4 OK ${pass} checks（C2-22 来期の時給見込み・C2-23 席移動の料金（0182 起草）・0177 残り・通知の時刻）`);
