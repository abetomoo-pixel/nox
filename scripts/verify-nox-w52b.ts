/*
 * verify:nox-w52b — 裁定343（0170・便 W5-2b・2026-10-13）: 判定基準（sales／hon_count／dohan_count）と対象ランク（空＝全員）の純関数と配線、
 *   器なし 5 項目の読取側（レジ入金ボタン・/mine 打刻・代行・支払日／内税表示の表記）の係留（DB 不触・env 不要）。
 *   npm run verify:nox-w52b。f0 103 段目。
 *  sb(1) slide.ts: slideBasisOf／slideBasisValueOf／slideRankIncludedOf／slideBasisPillOf／slideAtLabelOf('count')／slideDescOf('count')／slideScopeFreezeOf
 *  sb(2) slideInputOf: 3 基準×対象あり／なし＝monthly（件数は slideTotals.sales に入る＝同じ式）・daily＋件数（営業日ごと・pts は dayPts の式）・既存（default＝sales・全員）は 1 バイト同値
 *  sb(3) wageDetail: 件数の段（本指名 3 件→4,000）／対象外は段なし（plan の段を空にする＝base）／既存 21 プラン（default）の wage 不変
 *  sb(4) breakdown-lines: 件数基準の文言「本指名 N 件」・daily＋件数は 1 行・対象外は「対象外」1 行・sales・全員は従来の文言
 *  sb(5) 配線: collect（select +2 列・slideBasisByPlan／slideRankIdsByPlan・casts.rank_id・件数＝slideBasisValueOf・対象外＝planEff）・core（slideScopeFreezeOf）・plan-editor（25 引数・select 3 値・ランクのチェック・SlideInput count）・plan-board の印
 *  op(1) 読取側: register（payment_methods で カード／電子マネー／QR の出し分け・'other'＋固定 detail・内税の印）・/mine（punch_methods.self）・shift-board（punch_methods.proxy＝退勤ボタン・in 打刻）・payroll-board／month-report（支払日・内税表記）・kiosk は不触
 */
import fs from "node:fs";
import { SLIDE_BASIS_LABEL, slideAtLabelOf, slideBasisOf, slideBasisPillOf, slideBasisValueOf, slideDescOf, slideRankIncludedOf, slideScopeFreezeOf } from "../lib/nox/payroll/slide";
import { slideInputOf } from "../lib/nox/payroll/assemble";
import { wageDetail, type CompPlan } from "../lib/nox/pay";
import { breakdownLinesOf } from "../lib/nox/payroll/breakdown-lines";
import { buildPayloadFromRecording } from "../lib/nox/demo/seed"; // ★uuid[] の写像（sb(5-5)）

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (v: unknown) => JSON.stringify(v);

// sb(1)
{
  check("sb(1-1) slideBasisOf: 3 値以外は 'sales'", slideBasisOf("hon_count") === "hon_count" && slideBasisOf("dohan_count") === "dohan_count" && slideBasisOf(null) === "sales" && slideBasisOf("sales") === "sales" && slideBasisOf("x") === "sales");
  const agg = { sales: 500000, hon: 7, dohan: 2 };
  check("sb(1-2) slideBasisValueOf: sales→500,000／hon_count→7／dohan_count→2", slideBasisValueOf("sales", agg) === 500000 && slideBasisValueOf("hon_count", agg) === 7 && slideBasisValueOf("dohan_count", agg) === 2);
  check("sb(1-3) slideRankIncludedOf: 空＝全員・非空＝含まれるランクだけ・rank なしは対象外", slideRankIncludedOf([], null) && slideRankIncludedOf([], "r1") && slideRankIncludedOf(["r1"], "r1") && !slideRankIncludedOf(["r1"], "r2") && !slideRankIncludedOf(["r1"], null));
  check("sb(1-4) slideBasisPillOf: sales・全員＝''／件数＝「判定基準: 本指名の件数」／ランク＝「対象: A・B」", slideBasisPillOf("sales", []) === "" && slideBasisPillOf("hon_count", []) === "判定基準: 本指名の件数" && slideBasisPillOf("sales", ["r1", "r2"], ["A", "B"]) === "対象: A・B" && slideBasisPillOf("dohan_count", ["r1"]) === "判定基準: 同伴の件数・対象: 1 ランク");
  check("sb(1-5) ラベル: slideAtLabelOf('count')＝「件 以上（月の累計件数）」・slideDescOf('count', 本指名の件数)・既存 'yen'／'pt' は不変", slideAtLabelOf("monthly", "count") === "件 以上（月の累計件数）" && slideAtLabelOf("daily", "count") === "件 以上（1 日の件数）"
    && slideDescOf("monthly", "count", false, SLIDE_BASIS_LABEL.hon_count) === "月の累計本指名の件数で段を決め、その月の時給に適用します。" && slideAtLabelOf("monthly", "yen") === "以上（月の累計売上）" && slideAtLabelOf("half", "pt") === "pt 以上（半月の累計）");
  const fz = slideScopeFreezeOf({ apply: "monthly", provisional: true, months: [{ month: "2026-10", prevMonth: "2026-10", sales: 3, pts: 0, salesWage: 4000, ptsWage: 0 }] }, { basis: "hon_count", rankIds: ["r1"], castRankId: "r1", excluded: false }, "hon_count");
  check("sb(1-6) slideScopeFreezeOf: basis／scope を足す・months は不変・null（対象外）は months 空で形を残す", (fz as { basis?: string }).basis === "hon_count" && J((fz as { scope?: unknown }).scope) === J({ rankIds: ["r1"], castRankId: "r1", excluded: false }) && fz.months.length === 1
    && J(slideScopeFreezeOf(null, { basis: "sales", rankIds: ["r1"], castRankId: null, excluded: true }, "sales")) === J({ apply: "daily", provisional: false, months: [], scope: { rankIds: ["r1"], castRankId: null, excluded: true } })
    && J(slideScopeFreezeOf({ apply: "half", provisional: false, months: [] }, undefined, "sales")) === J({ apply: "half", provisional: false, months: [] }));
}
// sb(2) slideInputOf
{
  const daily = [{ bizDate: "2026-10-01", sales: 100000, hours: 5 }, { bizDate: "2026-10-10", sales: 250000, hours: 5 }, { bizDate: "2026-10-20", sales: 300000, hours: 5 }];
  const m = slideInputOf({ daily, slidePeriod: "monthly", slideTotals: { "2026-10": { sales: 7, pts: 0 } }, slideBasis: "hon_count" });
  check("sb(2-1) monthly＋件数: slideTotals.sales（件数）が全日に載る（式は 338 と同じ）", J(m.slideByDay) === J({ 1: { month: "2026-10", sales: 7, pts: 0 }, 10: { month: "2026-10", sales: 7, pts: 0 }, 20: { month: "2026-10", sales: 7, pts: 0 } }), J(m));
  const d = slideInputOf({ daily, slideBasis: "hon_count", slideDailyBasis: { "2026-10-01": 1, "2026-10-20": 3 }, sales: 650000, hon: 4, jonai: 0, dohan: 0, pointProducts: 0 });
  check("sb(2-2) daily＋件数: 営業日ごとの件数（無い日は 0）・month＝営業日・pts＝dayPts（総 pt 12 を売上比で按分＝1.8／4.6／5.5）", J(d.slideByDay) === J({ 1: { month: "2026-10-01", sales: 1, pts: 1.8 }, 10: { month: "2026-10-10", sales: 0, pts: 4.6 }, 20: { month: "2026-10-20", sales: 3, pts: 5.5 } }), J(d));
  check("sb(2-3) 既存（default＝sales・全員・daily）: slideByDay なし＝従来と 1 バイト同値", J(slideInputOf({ daily })) === "{}" && J(slideInputOf({ daily, slideApply: "current" })) === "{}");
}
// sb(3) wageDetail（pay.ts 不変）
{
  const plan: CompPlan = { id: "p", name: "本指名件数", base: 2000, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [{ at: 2, wage: 3000 }, { at: 5, wage: 4000 }], pointSlide: [], honBackMode: "per_count", honBackRate: null, jonaiBackMode: "per_count", jonaiBackRate: null };
  const rows = [{ d: 1, sales: 100000, hours: 5 }, { d: 10, sales: 250000, hours: 5 }];
  const byCount = wageDetail(rows, plan, 0, 350000, undefined, undefined, { 1: { month: "2026-10", sales: 6, pts: 0 }, 10: { month: "2026-10", sales: 6, pts: 0 } });
  check("sb(3-1) 件数 6（月次）→ 2 段目 4,000 が全日に当たる（閾値は件数）", byCount.wdays.every((w) => w.hourly === 4000) && byCount.wage === 4000, J(byCount.wdays.map((w) => w.hourly)));
  const excluded = wageDetail(rows, { ...plan, salesSlide: [], pointSlide: [] }, 0, 350000);
  check("sb(3-2) 対象外＝段を空にした plan（collect の planEff）→ base 2,000 のまま", excluded.wdays.every((w) => w.hourly === 2000) && excluded.wage === 2000);
  const salesPlan: CompPlan = { ...plan, salesSlide: [{ at: 300000, wage: 3000 }, { at: 600000, wage: 4000 }] };
  const before = wageDetail(rows, salesPlan, 0, 350000);
  check("sb(3-3) 既存プラン（sales・全員・daily）＝従来どおり日次売上で段（10/1 2,000・10/10 2,000＝閾値未満）", J(before.wdays.map((w) => w.hourly)) === "[2000,2000]" && before.slideBasis === undefined);
}
// sb(4) breakdown-lines
{
  const base = { wage: 2000, wHours: 0, timePay: 0 };
  const textOf = (p: unknown) => breakdownLinesOf({ pay: p as Parameters<typeof breakdownLinesOf>[0]["pay"] }).earn.map((l) => l.label).join("|");
  const cnt = textOf({ ...base, slideBasis: { apply: "monthly", provisional: false, basis: "hon_count", months: [{ month: "2026-10", prevMonth: "2026-10", sales: 6, pts: 0, salesWage: 4000, ptsWage: 0 }] } });
  check("sb(4-1) monthly＋件数: 「本指名 6 件→時給 ¥4,000」", cnt.includes("スライド 10月＝月の累計 本指名 6 件→時給"), cnt);
  const dl = textOf({ ...base, slideBasis: { apply: "daily", provisional: false, basis: "dohan_count", months: [{ month: "2026-10-01", prevMonth: "2026-10-01", sales: 1, pts: 0, salesWage: 0, ptsWage: 0 }, { month: "2026-10-20", prevMonth: "2026-10-20", sales: 3, pts: 0, salesWage: 3000, ptsWage: 0 }] } });
  check("sb(4-2) daily＋件数: 営業日ごとの行を 1 行に畳む（2 日・1 日で段あり）", dl.includes("スライド 日次＝その日の同伴の件数で段（2 日・1 日で段あり）") && !dl.includes("10/1") , dl);
  const ex = textOf({ ...base, slideBasis: { apply: "monthly", provisional: false, months: [], scope: { rankIds: ["r1"], castRankId: null, excluded: true } } });
  check("sb(4-3) 対象外: 「スライド＝対象外」1 行", ex.includes("スライド＝対象外（このキャストのランクは対象ランクに含まれない＝基本率のまま）"), ex);
  const old = textOf({ ...base, slideBasis: { apply: "monthly", provisional: true, months: [{ month: "2026-10", prevMonth: "2026-10", sales: 1295563, pts: 0, salesWage: 3500, ptsWage: 0 }] } });
  check("sb(4-4) sales・全員（既存の凍結形）: 従来の文言「売上 ¥1,295,563→時給 ¥3,500」・暫定の印", old.includes("スライド 10月＝月の累計・暫定（期首〜今日） 売上 ¥1,295,563→時給 ¥3,500") && !old.includes("対象ランク"), old);
}
// sb(5) 配線
{
  const co = src("lib/nox/payroll/collect.ts"), core = src("lib/nox/payroll/core.ts"), pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"), cs = src("app/(manage)/master/cast-comp/comp-sections.tsx"), pb = src("app/(manage)/master/cast-comp/plan/plan-board.tsx");
  check("sb(5-1) collect: select +2 列・slideBasisByPlan／slideRankIdsByPlan・casts.rank_id・件数＝slideBasisValueOf（期間累計・daily）・対象外＝planEff（段を空に）・slideScope",
    co.includes(", slide_period, slide_basis, slide_rank_ids, slide_apply\")") /* ★便 P174 T-4（395）: +slide_apply */ && co.includes("slideBasisByPlan.set(p.id as string, slideBasisOf(p.slide_basis));") && co.includes('select("id, name, employment, joined_on, left_on, rank_id")')
    && co.includes("if (b) rec[k] = { sales: slideBasisValueOf(b, a), pts: castPts(a, a.pt) };") && co.includes("byDay[x.biz_date] = (byDay[x.biz_date] ?? 0) + slideBasisValueOf(b, x);")
    && co.includes("const planEff = plan && excluded ? { ...plan, salesSlide: [], pointSlide: [] } : plan;") && co.includes("slideScope: { basis: basisX, rankIds, castRankId, excluded }"));
  check("sb(5-2) core: slideScopeFreezeOf（basis／scope を凍結形へ・daily＋件数は apply 'daily'）", core.includes("slideScopeFreezeOf(cur ? { apply: c.slidePeriod ?? (c.slideBasis ? \"daily\" : cur.apply)") && core.includes("if (c.slideBasis || c.slideScope) {"));
  check("sb(5-3) plan-editor: Draft slideBasis／slideRankIds・set_comp_plan 25 引数（p_slide_basis／p_slide_rank_ids）・基準 select 3 値・ランクのチェック（cast_ranks）・SlideInput basis count・印",
    pe.includes("p_slide_basis: draft.slideBasis, p_slide_rank_ids: draft.slideRankIds,") && pe.includes('aria-label="売上スライドの判定基準"') && pe.includes('<option value="sales">売上（既定）</option><option value="hon_count">本指名の件数</option><option value="dohan_count">同伴の件数</option>')
    && pe.includes('supabase.from("cast_ranks").select("id, name").eq("store_id", storeId).eq("is_active", true)') && pe.includes("aria-label={`対象ランク ${r.name}`}") && pe.includes('basis={draft.slideBasis === "sales" ? "yen" : "count"}') && pe.includes("slideBasisPillOf(draft.slideBasis, draft.slideRankIds,")
    && pe.includes('slideBasis: "sales", slideRankIds: [],') && pe.includes("slideBasis: slideBasisOf(p.slide_basis), slideRankIds:") && !pe.includes("準備中（C5）"));
  check("sb(5-4) comp-sections Plan 型に slide_basis／slide_rank_ids・SlideInput basis 'count'・plan-board の印", cs.includes("slide_basis?: string | null; slide_rank_ids?: string[] | null;") && cs.includes('basis?: "yen" | "pt" | "count"') && pb.includes("slideBasisPillOf(slideBasisOf(sel.slide_basis), sel.slide_rank_ids ?? [])"));
  // ★デモ reset の id 付け替え＝uuid[] 列（slide_rank_ids）も cast_ranks.id と同じ写像（素通しだと reset 後に全員が対象外＝live で検知）
  const org = "11111111-1111-4111-8111-111111111111", r1 = "22222222-2222-4222-8222-222222222222", r2 = "33333333-3333-4333-8333-333333333333";
  const built = buildPayloadFromRecording(org, "2026-10-13", { meta: { cutoff: "06:00", store: "noir", users: {} }, tables: { cast_ranks: [{ id: r1, org_id: "x", store_id: "y" }, { id: r2, org_id: "x", store_id: "y" }], comp_plans: [{ id: "44444444-4444-4444-8444-444444444444", org_id: "x", store_id: "y", slide_rank_ids: [r1, r2], sales_slide: [{ at: 3, wage: 4000 }] }] } } as unknown as Parameters<typeof buildPayloadFromRecording>[2]);
  const bp = built.ok ? built.payload : null;
  check("sb(5-5) seed.ts: payload の uuid[]（slide_rank_ids）も remapUuid で cast_ranks.id と同じ写像・配列以外（sales_slide の jsonb）は不変", !!bp && JSON.stringify(bp.comp_plans[0].slide_rank_ids) === JSON.stringify(bp.cast_ranks.map((r) => r.id)) && (bp.comp_plans[0].slide_rank_ids as string[])[0] !== r1 && JSON.stringify(bp.comp_plans[0].sales_slide) === JSON.stringify([{ at: 3, wage: 4000 }]), JSON.stringify(bp?.comp_plans?.[0]));
}
// op(1) 読取側
{
  const rb = src("app/(manage)/register/register-board.tsx"), mp = src("app/mine/page.tsx"), sb = src("app/(manage)/shift/shift-board.tsx"), py = src("app/(manage)/payroll/payroll-board.tsx"), mr = src("app/(manage)/report/month-report.tsx");
  check("op(1-1) register: stores.payment_methods／tax_inclusive_display を読み、カード／電子マネー／QR を出し分け・電子マネー／QR＝'other'＋固定 detail・OFF の方法が選択中なら現金へ・内税の印",
    rb.includes('select("name, settings_json, card_surcharge_rate, payment_methods, tax_inclusive_display")') && rb.includes("const rpcMethodOf = (m: string): string => (m === \"emoney\" || m === \"qr\" ? \"other\" : m);")
    && rb.includes("p_method: rpcMethodOf(payMethod)") && rb.includes("const detail = payMethod === \"emoney\" || payMethod === \"qr\" ? OPS_METHOD_LABEL[payMethod] :") && rb.includes("...(payMethodsOn.card ? [[\"card\", METHOD_LABEL.card]] : [])")
    && rb.includes("...(payMethodsOn.qr ? [[\"qr\", OPS_METHOD_LABEL.qr]] : [])") && rb.includes("{taxInclusive && <span className=\"nox-stpill\"") && rb.includes("(m === \"card\" && !pm.card) || (m === \"emoney\" && !pm.emoney) || (m === \"qr\" && !pm.qr) ? \"cash\" : m"));
  check("op(1-2) /mine: punch_methods.self が OFF なら本人打刻のボタンを出さず案内文（PunchActions の文字列は不変）", mp.includes('select("id, name, settings_json, punch_methods")') && mp.includes("opsProfileOf(myStore as Record<string, unknown> | undefined).punch_methods.self ? (") && mp.includes("<PunchActions state={ps.state}") && mp.includes("この店はスマホからの打刻を使っていません"));
  check("op(1-3) shift-board: punch_methods.proxy が OFF なら代行の退勤ボタンを出さず・出勤区分後の in 打刻も残さない", sb.includes('select("settings_json, punch_methods")') && sb.includes("const ob = proxyPunchOn ? ob0 : { ...ob0, show: false };") && sb.includes("if (!error && proxyPunchOn && punchInAfterAtt("));
  check("op(1-4) payroll-board／month-report: 支払日（翌月 N 日・締め 月末）と内税表記の印（表示のみ）", py.includes('select("settings_json, pay_day, tax_inclusive_display")') && py.includes("締め 月末・支払日 翌月 {storeOps.pay_day} 日{storeOps.tax_inclusive_display ? \"・金額表記 内税\" : \"\"}") && mr.includes('select("pay_day").eq("id", storeId).maybeSingle()') && mr.includes("締め 月末・支払日 翌月 {payDay} 日"));
  check("op(1-5) kiosk は不触（kiosk_punch_state に punch_methods を返す器が無い＝裁定要）", !src("app/kiosk/page.tsx").includes("punch_methods"));
}

if (fails.length) {
  console.error(`verify:nox-w52b FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-w52b OK (${pass} checks)`);
console.log("裁定343（0170）: 判定基準 3 値×対象ランク（純関数・slideInputOf・wageDetail・breakdown）／読取側の出し分け（レジ・/mine・代行・支払日・内税）");
