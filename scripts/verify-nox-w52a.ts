/*
 * verify:nox-w52a — 便 W5-2a（2026-10-13）: 0164 の器なし 5 項目＋334 フロア表示の結線・331 ⑱（商品の 1 品ずつ選択）・0170 起草の係留（DB 不触・env 不要）。
 *   npm run verify:nox-w52a。f0 102 段目。
 *  op(1) lib/nox/store/ops-profile.ts: opsProfileOf（欠損→既定・cash は常に true）／opsPatchOf（差分だけ・''→null・pay_day は数値）／opsPatchErrorOf（1〜31・日付形式・打刻 1 つ以上）／opsSummaryOf
 *  fk(1) lib/nox/floor-kinds.ts: hiddenKindsOf（use_vip／use_counter false → 'VIP'／'カウンター'）／seatsVisibleOf（店ごと・フラグ行が無い店は全部）
 *  sp(1) store-profile-panel: 節 'ops'（会計と運用）＝列 7 つの select・opsPatchOf を patch に・opsPatchErrorOf の先回り・store-profile ページの info タブに 'ops'・errJa 3 トークン
 *  sw(1) setup-wizard: STEP 5 に会計と運用（date／支払日／内税／VIP／カウンター／支払い方法／打刻）・ops を buildSetupPlan へ・page が列 7 つの現値を渡す・SETUP_HIDDEN_ITEMS から C 5 件が消えた（D 5 件）
 *  sw(2) 331 ⑱: STEP 3 の行チェック（既定＝全選択・全選択チェック）・名前／価格の inline 編集・productsEff（選択・編集後）を productsPlanOf／buildSetupPlan／productOverrideArgs へ・下書きに prodSel／ops
 *  fl(1) 334: register/page.tsx が stores.use_vip／use_counter で seatsVisibleOf・seats/page.tsx が hiddenKinds を SeatsBoard へ・SeatsBoard がフィルタと選択肢から外す（RPC 不変）
 *  mg(1) 0170 起草: comp_plans +slide_basis（text not null default 'sales'・CHECK 3 値）＋slide_rank_ids（uuid[] not null default '{}'）・set_comp_plan 25 引数・23 引数版 drop・grants・単一 tx・★0170 の検証 4 行・gen-demo の comp_plans 行に 2 列
 */
import fs from "node:fs";
import { OPS_DEFAULT, opsPatchErrorOf, opsPatchOf, opsProfileOf, opsSummaryOf } from "../lib/nox/store/ops-profile";
import { hiddenKindsOf, seatsVisibleOf } from "../lib/nox/floor-kinds";
import { SETUP_HIDDEN_ITEMS } from "../lib/nox/setup/template-plan";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// op(1)
{
  const o = opsProfileOf({ invoice_registered_on: "2026-10-01", pay_day: 15, tax_inclusive_display: true, use_vip: false, use_counter: true, payment_methods: { cash: false, card: false, qr: true }, punch_methods: { self: false } });
  check("op(1-1) opsProfileOf: 列→形（cash は常に true・欠損キーは既定・use_vip false）", o.invoice_registered_on === "2026-10-01" && o.pay_day === "15" && o.tax_inclusive_display && !o.use_vip && o.use_counter
    && o.payment_methods.cash && !o.payment_methods.card && !o.payment_methods.emoney && o.payment_methods.qr && !o.punch_methods.self && o.punch_methods.proxy && o.punch_methods.kiosk, JSON.stringify(o));
  check("op(1-2) opsProfileOf(null)＝OPS_DEFAULT と同値（既定 25・外税・VIP／カウンター あり・現金＋カード・打刻 3 つ）", JSON.stringify(opsProfileOf(null)) === JSON.stringify(OPS_DEFAULT));
  const p = opsPatchOf({ ...OPS_DEFAULT, invoice_registered_on: "", pay_day: "20", payment_methods: { cash: false, card: true, emoney: true, qr: false } }, { ...OPS_DEFAULT, invoice_registered_on: "2026-01-01" });
  check("op(1-3) opsPatchOf: 差分だけ（invoice ''→null・pay_day 数値 20・payment_methods は丸ごと＋cash true）・不変のキーは送らない", JSON.stringify(p) === JSON.stringify({ invoice_registered_on: null, pay_day: 20, payment_methods: { cash: true, card: true, emoney: true, qr: false } }), JSON.stringify(p));
  check("op(1-4) opsPatchOf: 同値なら {}", JSON.stringify(opsPatchOf(OPS_DEFAULT, OPS_DEFAULT)) === "{}");
  check("op(1-5) opsPatchErrorOf: pay_day 0／32／小数は赤・日付形式・打刻 0 個は赤・正常は null", !!opsPatchErrorOf({ pay_day: 0 }) && !!opsPatchErrorOf({ pay_day: 32 }) && !!opsPatchErrorOf({ pay_day: 10.5 }) && !!opsPatchErrorOf({ invoice_registered_on: "2026/10/01" })
    && !!opsPatchErrorOf({ punch_methods: { self: false, proxy: false, kiosk: false } }) && opsPatchErrorOf({ pay_day: 31, invoice_registered_on: null, punch_methods: { self: true, proxy: false, kiosk: false } }) === null);
  check("op(1-6) opsSummaryOf: 支払日・インボイス 未登録・外税・VIP／カウンター あり・支払い 現金・カード・打刻 3 つ", opsSummaryOf(OPS_DEFAULT) === "支払日 翌月 25 日・インボイス 未登録・消費税 外税表示・VIP あり・カウンター あり・支払い 現金・カード・打刻 本人のスマホ・店の代行・打刻端末", opsSummaryOf(OPS_DEFAULT));
}
// fk(1)
{
  check("fk(1-1) hiddenKindsOf: 両方 true＝[]／use_vip false＝['VIP']／両方 false＝['VIP','カウンター']", hiddenKindsOf({ use_vip: true, use_counter: true }).length === 0 && hiddenKindsOf({ use_vip: false, use_counter: true }).join() === "VIP" && hiddenKindsOf({ use_vip: false, use_counter: false }).join() === "VIP,カウンター");
  const seats = [{ id: "1", kind: "卓", store_id: "A" }, { id: "2", kind: "VIP", store_id: "A" }, { id: "3", kind: "カウンター", store_id: "A" }, { id: "4", kind: "VIP", store_id: "B" }, { id: "5", kind: null, store_id: "A" }];
  const v = seatsVisibleOf(seats, [{ id: "A", use_vip: false, use_counter: true }]);
  check("fk(1-2) seatsVisibleOf: A の VIP だけ消える（卓・カウンター・kind null・フラグ行の無い B は残る）", v.map((s) => s.id).join() === "1,3,4,5", v.map((s) => s.id).join());
}
// sp(1)
{
  const sp = src("app/(manage)/master/store-profile-panel.tsx"), pg = src("app/(manage)/master/store-profile/page.tsx"), ft = src("app/(manage)/master/store-flag-toggle.tsx");
  check("sp(1-1) 節 'ops'（会計と運用）＝列 7 つを select・opsProfileOf・patch に opsPatchOf・先回り opsPatchErrorOf・保存ボタン「会計と運用を保存」",
    sp.includes('select("name, short, settings_json, invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods")') && sp.includes("ops: opsProfileOf(data as Record<string, unknown> | null)")
    && sp.includes("const out: Record<string, unknown> = { ...opsPatchOf(form.ops, cur.ops) };") && sp.includes("const e = opsPatchErrorOf(patch); if (e) { setMsg(e); return; }") && sp.includes('aria-label="会計と運用"') && sp.includes(">会計と運用を保存<")
    && sp.includes('| "ops"') && sp.includes('aria-label="インボイス登録日"') && sp.includes('aria-label="給与の支払日"') && sp.includes("PAYMENT_METHOD_LABEL.map(") && sp.includes("PUNCH_METHOD_LABEL.map("));
  check("sp(1-2) store-profile ページの info タブに 'ops'・errJa に bad pay_day／bad payment_methods／bad punch_methods", pg.includes('sections={["profile", "shift", "ops"]}') && ft.includes('msg.includes("bad pay_day")') && ft.includes('msg.includes("bad payment_methods")') && ft.includes('msg.includes("bad punch_methods")'));
}
// sw(1)(2)
{
  const wz = src("app/(manage)/setup/setup-wizard.tsx"), pg = src("app/(manage)/setup/page.tsx"), tp = src("lib/nox/setup/template-plan.ts");
  check("sw(1-1) ★便 OB-2（v5）: 会計と運用の 7 項目は v5 の STEP 3（金額の表示）・5（支払日）・2（席）・7（打刻）・8（会計・レジ）に散った＝計画は buildV5Plan（patch に use_vip／use_counter／punch_methods・tax_config に price_display）",
    wz.includes('ariaLabel="金額の表示"') && wz.includes("支払日（翌月）") && wz.includes('ariaLabel="打刻できる場所"') && wz.includes("buildV5Plan(S, ctx)") && src("lib/nox/setup/v5.ts").includes("use_vip: S.seats.vip > 0, use_counter: S.seats.counter > 0") && src("lib/nox/setup/v5.ts").includes('p_price_display: S.tax === "in" ? "tax_included" : "tax_excluded"'));
  check("sw(1-2) page が列 7 つの現値を渡す（ops: opsProfileOf）・template-plan が差分を settings の patch に同乗（opsPatchOf）・SetupSelection.ops／SetupCurrent.ops",
    pg.includes("tax: { business_tax_status: String(target.business_tax_status") /* ★便 OB-2: v5 の page は税設定の現値を渡す（ops は v5 の patch で直接） */
    && tp.includes("...(sel.ops && sel.current.ops ? opsPatchOf(sel.ops, sel.current.ops) : {}) };") && tp.includes("ops?: OpsProfile; // ★0164（便 W5-2a）: STEP 5"));
  check("sw(1-3) SETUP_HIDDEN_ITEMS＝C 0 件・D 5 件（器なし 5 項目は結線済み）", SETUP_HIDDEN_ITEMS.filter((x) => x.cls === "C").length === 0 && SETUP_HIDDEN_ITEMS.filter((x) => x.cls === "D").length === 5, SETUP_HIDDEN_ITEMS.map((x) => x.label).join("・"));
  check("sw(2-1) 331 ⑱→★便 OB-2（v5）: メニューは分類ごと「使う／使わない」・商品ごと「出す」チェック＋名前／値段／バック（円・%）／キープ inline・計画は on の分だけ（buildV5Plan）・下書き（localStorage）に全状態",
    wz.includes("aria-label={`${it.n} を出す`}") && wz.includes('ariaLabel="商品名"') && wz.includes('ariaLabel="バックの単位"') && wz.includes('aria-label="キープ可"') && src("lib/nox/setup/v5.ts").includes("if (!it.on || !String(it.n).trim()) return;") && wz.includes("JSON.stringify({ S, savedAt: new Date().toISOString(), ids: ids.current, issued })"));
}
// fl(1)
{
  const rp = src("app/(manage)/register/page.tsx"), sp = src("app/(manage)/master/seats/page.tsx"), sb = src("app/(manage)/master/seats/seats-board.tsx");
  check("fl(1-1) register/page: stores.use_vip／use_counter を読み seatsVisibleOf で席タイルを絞る（席モデル不変＝RegisterBoard の props はそのまま）",
    rp.includes('supabase.from("stores").select("id, use_vip, use_counter")') && rp.includes("const seats = seatsVisibleOf(") && rp.includes('import { seatsVisibleOf } from "@/lib/nox/floor-kinds";') && rp.includes("seats={seats ?? []}"));
  check("fl(1-2) seats/page→SeatsBoard hiddenKinds（フィルタと新規の選択肢から外す・編集中の既存種別は残す）", sp.includes("hiddenKinds={hiddenKinds}") && sp.includes('select("id, use_vip, use_counter")') && sb.includes("hiddenKinds?: string[];")
    && sb.includes(".filter(([v]) => v === \"\" || kindOn(v))") && sb.includes(".filter(([v]) => kindOn(v) || v === sKind)"));
}
// mg(1)
{
  const mg = src("supabase/migrations/0170_comp_plan_slide_basis.sql"), gd = src("scripts/demo/gen-demo.mjs");
  check("mg(1-1) 0170: 2 列（slide_basis text not null default 'sales'＋CHECK 3 値／slide_rank_ids uuid[] not null default '{}'）・単一 tx", mg.includes("add column if not exists slide_basis text not null default 'sales';") && mg.includes("check (slide_basis in ('sales','hon_count','dohan_count'))")
    && mg.includes("add column if not exists slide_rank_ids uuid[] not null default '{}'::uuid[];") && (mg.match(/^begin;$/gm) ?? []).length === 1 && (mg.match(/^commit;$/gm) ?? []).length === 1);
  check("mg(1-2) 0170: set_comp_plan 25 引数（末尾 p_slide_basis／p_slide_rank_ids・default）・23 引数版 drop・検証 'bad slide_basis'／'bad slide_rank_ids'・insert／update に 2 列・grants",
    mg.includes("p_slide_period text DEFAULT 'daily'::text, p_slide_basis text DEFAULT 'sales'::text, p_slide_rank_ids uuid[] DEFAULT '{}'::uuid[])") && mg.includes("drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text);")
    && mg.includes("raise exception 'bad slide_basis'") && (mg.match(/raise exception 'bad slide_rank_ids'/g) ?? []).length === 3 && mg.includes("slide_basis, slide_rank_ids)  -- ★0170") && mg.includes("p_slide_basis, p_slide_rank_ids)  -- ★0170")
    && mg.includes("slide_basis = p_slide_basis, slide_rank_ids = p_slide_rank_ids") && mg.includes(", text, uuid[]) from public, anon;") && mg.includes(", text, uuid[]) to authenticated, service_role;"));
  check("mg(1-3) gen-demo: comp_plans の 2 行型に slide_basis（SL.basis ?? 'sales'）・slide_rank_ids（SL.ranks→cast_ranks の uid・既定 []）＝0170 適用後の reset を壊さない先行投入（便 W5-2b で NOIR＝hon_count・S／A）", (gd.match(/slide_basis: SL\.basis \?\? "sales", slide_rank_ids: ranks\.filter\(\(r\) => \(SL\.ranks \?\? \[\]\)\.includes\(r\.rank_name\)\)\.map\(\(r\) => uid\(`rank:\$\{r\.rank_id\}`\)\), \.\.\.normDefaultsOf\((p\.plan_name|x\.name)\)/g) ?? []).length === 2); // ★裁定347（0171・便 P171）: 行末に ...normDefaultsOf（プラン既定の目標 4 列）が続く
}

if (fails.length) {
  console.error(`verify:nox-w52a FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-w52a OK (${pass} checks)`);
console.log("W5-2a: 会計と運用（列 7 つ）の純関数と結線／フロア種別の表示切替／331 ⑱ 行チェック＋inline 編集／0170 起草");
