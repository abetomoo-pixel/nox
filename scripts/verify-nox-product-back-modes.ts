/*
 * verify:nox-product-back-modes（pb）— 裁定113（mig0132）商品販売バック3方式の係留。
 *   npm run verify:nox-product-back-modes（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD）
 *
 * donor＝verify-nox-autocharge（check_close 実走型）× verify-nox-payroll（plan fixture 型）。
 * 実 RPC 経路＝check_open→check_add_line→check_set_nominations→check_pay→check_close（managerA1・店 A1）。
 * cast_plan は admin 直 insert（valid_from 2020-01-01＝営業日が cutoff 前で前日に落ちても割当が効く＝時限装置化しない）。
 *
 * 観点（設計書 v1 §5）:
 *  (a) product_rule: 従来値と同値の按分（unit=round(price×back_value/100)×alloc）＋source_mode='product_rule'・base/calc=null
 *  (b) plan_rate: 商品3列=0・product_sales_base=同腕売上按分（unit_price_snapshot×alloc・多 cast weight 分割で同腕を実証）・
 *      calculated_back_amount=round(base×rate/100)（.5 は 0 から遠い側）・rate=0 境界（base 凍結・calc 0）
 *  (c) plan_fixed: 商品3列=0・pt のみ凍結・base/calc=null・pt 0（jonai）なら行なし＝ゼロ専用行は作らない
 *  (d) plan 割当なし cast: product_rule フォールバック
 *  (e) pt 射程外: plan_rate/plan_fixed でも hon pt（hon_pt×alloc）が凍結される
 *  (f) claim 不干渉: claim 済み行を含む伝票を plan_rate で close→close 成功・drink_claims.back_amount/status 不変
 *  (g) 営業日境界: cast_plan valid_from=D を挟む started_at（D 05:30 JST＝営業日 D-1／D 06:30 JST＝営業日 D）で
 *      mode 解決が biz_date_of(started_at) に従う（A1 の cutoff は既定 06:00 前提）
 *  ※(b)(c) が 113 D調査「要 Fable 実測②」（排他 close の 3列 0 凍結）の消化。
 *
 * 逆張り: PB_INVERT=1 で全 check の期待を反転＝全赤。破壊1点: PB_BREAK=1 で (b) の算術期待値を 300→301 に裏書き＝その1本のみ赤。
 * fixture: NOX-VERIFY-pb* 命名・finally 全消し（claims/backs/noms/payments/lines/seats→checks→stock_logs→products→
 *   seats→cast_plan→casts→plans・stock_logs は products より先＝教訓49 続報）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, ORG_A, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD",
]);
const INV = process.env.PB_INVERT === "1";
const BREAK = process.env.PB_BREAK === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const PFX = "NOX-VERIFY-pb";
const pad = (n: number) => String(n).padStart(2, "0");
const jstToday = () => {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

type BackRow = {
  cast_id: string; drink_back: number; champ_back: number; bottle_back: number; hon_pt_alloc: number;
  source_mode: string | null; product_sales_base: number | null; calculated_back_amount: number | null;
};

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${String(key)} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const mgr = await signIn("managerA1");
  const castCli = await signIn("castA1a");
  const { data: orgRow } = await admin.from("orgs").select("id").eq("name", ORG_A).single();
  const orgA = orgRow!.id as string;
  const { data: stRow } = await admin.from("stores").select("id").eq("name", STORE_A1).eq("org_id", orgA).single();
  const storeA1 = stRow!.id as string;
  const { data: castA1aRaw } = await castCli.rpc("auth_cast_id");
  const castA1a = castA1aRaw as string;
  if (!castA1a) throw new Error("auth_cast_id が引けない（cast 結線）");

  const made = { checks: [] as string[], products: [] as string[], seats: [] as string[], casts: [] as string[], plans: [] as string[] };

  async function teardown() {
    // 名指し自浄（前 run の残置も拾う）
    const { data: cs } = await admin.from("casts").select("id").like("name", `${PFX}%`);
    const castIds = [...new Set([...made.casts, ...(cs ?? []).map((r) => r.id as string)])];
    const { data: sts } = await admin.from("seats").select("id").like("name", `${PFX}%`);
    const seatIds = [...new Set([...made.seats, ...(sts ?? []).map((r) => r.id as string)])];
    const { data: chks } = seatIds.length ? await admin.from("checks").select("id").in("seat_id", seatIds) : { data: [] as { id: string }[] };
    const chkIds = [...new Set([...made.checks, ...(chks ?? []).map((r) => r.id as string)])];
    if (chkIds.length) {
      for (const t of ["drink_claims", "check_cast_backs", "check_nominations", "payments", "check_lines", "check_seats"]) {
        const { error } = await admin.from(t).delete().in("check_id", chkIds);
        if (error) console.error(`[pb teardown] ${t}: ${error.message}`);
      }
      const { error: eC } = await admin.from("checks").delete().in("id", chkIds);
      if (eC) console.error(`[pb teardown] checks: ${eC.message}`);
    }
    const { data: prods } = await admin.from("products").select("id").like("name", `${PFX}%`);
    const prodIds = [...new Set([...made.products, ...(prods ?? []).map((r) => r.id as string)])];
    if (prodIds.length) {
      await admin.from("stock_logs").delete().in("product_id", prodIds);
      const { error: eP } = await admin.from("products").delete().in("id", prodIds);
      if (eP) console.error(`[pb teardown] products: ${eP.message}`);
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    if (castIds.length) {
      await admin.from("cast_plan").delete().in("cast_id", castIds);
      await admin.from("check_nominations").delete().in("cast_id", castIds);
      const { error: eCa } = await admin.from("casts").delete().in("id", castIds);
      if (eCa) console.error(`[pb teardown] casts: ${eCa.message}`);
    }
    const { data: pls } = await admin.from("comp_plans").select("id").like("name", `${PFX}%`);
    const planIds = [...new Set([...made.plans, ...(pls ?? []).map((r) => r.id as string)])];
    if (planIds.length) {
      const { error: ePl } = await admin.from("comp_plans").delete().in("id", planIds);
      if (ePl) console.error(`[pb teardown] comp_plans: ${ePl.message}`);
    }
  }
  await teardown();

  const mkProduct = async (name: string, price: number, honPt: number) => {
    const { data, error } = await admin.from("products").insert({
      org_id: orgA, store_id: storeA1, type: "drink", name, price, back_mode: "rate", back_value: 20, hon_pt: honPt, is_active: true,
    }).select("id").single();
    if (error) throw new Error(`product: ${error.message}`);
    made.products.push(data!.id as string); return data!.id as string;
  };
  const mkSeat = async (name: string) => {
    const { data, error } = await admin.from("seats").insert({ org_id: orgA, store_id: storeA1, name, kind: "卓", sort_order: 987, is_active: true }).select("id").single();
    if (error) throw new Error(`seat: ${error.message}`);
    made.seats.push(data!.id as string); return data!.id as string;
  };
  const mkCast = async (name: string) => {
    const { data, error } = await admin.from("casts").insert({ org_id: orgA, store_id: storeA1, name, is_active: true, left_on: null }).select("id").single();
    if (error) throw new Error(`cast: ${error.message}`);
    made.casts.push(data!.id as string); return data!.id as string;
  };
  const mkPlan = async (name: string, mode: "product_rule" | "plan_rate" | "plan_fixed", rate: number | null, fixed: number | null) => {
    const { data, error } = await admin.from("comp_plans").insert({
      org_id: orgA, store_id: storeA1, name, base: 5000, hon_back: 4000, jonai_back: 1500, dohan_back: 4000,
      sales_slide: [], point_slide: [], is_active: true,
      product_back_mode: mode, product_back_rate: rate, product_back_fixed: fixed,
    }).select("id").single();
    if (error) throw new Error(`plan(${name}): ${error.message}`);
    made.plans.push(data!.id as string); return data!.id as string;
  };
  const assign = async (castId: string, planId: string, validFrom: string, validTo: string | null) => {
    const { error } = await admin.from("cast_plan").insert({
      cast_id: castId, org_id: orgA, store_id: storeA1, plan_id: planId, overrides_json: {}, valid_from: validFrom, valid_to: validTo,
    });
    if (error) throw new Error(`cast_plan: ${error.message}`);
  };
  type Nom = { cast_id: string; weight: number; nom_kind: "hon" | "jonai" | "free"; is_dohan: boolean };
  const openCheck = async (seatId: string) => {
    const { data, error } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    if (error) throw new Error(`check_open: ${error.message}`);
    made.checks.push(data as string); return data as string;
  };
  const addLine = async (checkId: string, productId: string, qty: number) => {
    const { error } = await mgr.rpc("check_add_line", {
      p_check_id: checkId, p_product_id: productId, p_qty: qty, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null,
    });
    if (error) throw new Error(`check_add_line: ${error.message}`);
  };
  const setNoms = async (checkId: string, noms: Nom[]) => {
    const { error } = await mgr.rpc("check_set_nominations", { p_check_id: checkId, p_nominations: noms });
    if (error) throw new Error(`check_set_nominations: ${error.message}`);
  };
  const payClose = async (checkId: string): Promise<{ error: { message: string } | null }> => {
    const { data: tot } = await admin.from("checks").select("total").eq("id", checkId).single();
    const { error: ePay } = await mgr.rpc("check_pay", {
      p_check_id: checkId, p_method: "cash", p_amount: tot!.total, p_pay_group: "A", p_tendered: tot!.total, p_idem_key: randomUUID(),
    });
    if (ePay) throw new Error(`check_pay: ${ePay.message}`);
    const { error } = await mgr.rpc("check_close", { p_check_id: checkId, p_idem_key: randomUUID() });
    return { error };
  };
  const backsOf = async (checkId: string): Promise<BackRow[]> =>
    ((await admin.from("check_cast_backs")
      .select("cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc, source_mode, product_sales_base, calculated_back_amount")
      .eq("check_id", checkId)).data ?? []) as BackRow[];
  const rowOf = (rows: BackRow[], castId: string) => rows.find((r) => r.cast_id === castId) ?? null;
  const j = (v: unknown) => JSON.stringify(v);

  try {
    // ── fixture: 商品（price 1000・back rate 20%→unit 200・hon_pt 3）／P2（price 1010・.5 丸め用）・座席・plan 4種・cast 6人 ──
    const prodP = await mkProduct(`${PFX}-drink`, 1000, 3);
    const prodP2 = await mkProduct(`${PFX}-drink1010`, 1010, 0);
    const seat = await mkSeat(`${PFX}-seat`);
    const planPR = await mkPlan(`${PFX}-plan-product_rule`, "product_rule", null, null);
    const planRate = await mkPlan(`${PFX}-plan-rate15`, "plan_rate", 15, null);
    const planRate0 = await mkPlan(`${PFX}-plan-rate0`, "plan_rate", 0, null);
    const planFixed = await mkPlan(`${PFX}-plan-fixed`, "plan_fixed", null, 30000);
    const cPR = await mkCast(`${PFX}-cPR`);
    const cRate = await mkCast(`${PFX}-cRate`);
    const cRate0 = await mkCast(`${PFX}-cRate0`);
    const cFixed = await mkCast(`${PFX}-cFixed`);
    const cNone = await mkCast(`${PFX}-cNone`);
    const cG = await mkCast(`${PFX}-cG`);
    await assign(cPR, planPR, "2020-01-01", null);
    await assign(cRate, planRate, "2020-01-01", null);
    await assign(cRate0, planRate0, "2020-01-01", null);
    await assign(cFixed, planFixed, "2020-01-01", null);
    // (g) 境界: D=JST 今日+10。D-1 まで product_rule／D から plan_rate
    const D = addDays(jstToday(), 10);
    await assign(cG, planPR, "2020-01-01", addDays(D, -1));
    await assign(cG, planRate, D, null);

    // ── 器の前提（mig0132 適用済みの実測）──
    {
      const { data: p } = await admin.from("comp_plans").select("product_back_mode, product_back_rate, product_back_fixed").eq("id", planRate).single();
      check("pb(0) 器: comp_plans 3列が読める（plan_rate/15/null）",
        p?.product_back_mode === "plan_rate" && p?.product_back_rate === 15 && p?.product_back_fixed === null, j(p));
      const { error: ePair } = await admin.from("comp_plans").insert({
        org_id: orgA, store_id: storeA1, name: `${PFX}-plan-badpair`, base: 0, hon_back: 0, jonai_back: 0, dohan_back: 0,
        sales_slide: [], point_slide: [], is_active: true, product_back_mode: "plan_rate", product_back_rate: null, product_back_fixed: null,
      });
      check("pb(0) 器: plan_rate ∧ rate null は pair CHECK で拒否", !!ePair && /pair/.test(ePair.message), ePair?.message ?? "通ってしまった");
      const { error: eMode } = await admin.from("check_cast_backs").insert({
        org_id: orgA, store_id: storeA1, check_id: randomUUID(), cast_id: cPR, source_mode: "plan_other",
      });
      check("pb(0) 器: check_cast_backs.source_mode は3値 CHECK（不正値拒否）", !!eMode, eMode?.message ?? "通ってしまった");
    }

    // ── (a) product_rule: 従来値同値＋source_mode 記録 ──
    {
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      await setNoms(c, [{ cast_id: cPR, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const r = rowOf(await backsOf(c), cPR);
      check("pb(a1) product_rule: close 成功", !error, error?.message);
      check("pb(a2) product_rule: drink_back=400（unit 200×qty 2＝従来値同値）・champ/bottle 0",
        !!r && r.drink_back === 400 && r.champ_back === 0 && r.bottle_back === 0, j(r));
      check("pb(a3) product_rule: source_mode='product_rule'・base/calc=null",
        !!r && r.source_mode === "product_rule" && r.product_sales_base === null && r.calculated_back_amount === null, j(r));
      check("pb(a4) product_rule: hon pt=hon_pt 3×alloc 2=6", !!r && r.hon_pt_alloc === 6, j(r));
    }

    // ── (b) plan_rate: 3列 0・base 同腕・calc 算術・rate 0 境界 ──
    {
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      await setNoms(c, [{ cast_id: cRate, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const r = rowOf(await backsOf(c), cRate);
      const expCalc = BREAK ? 301 : 300; // ★破壊1点: PB_BREAK=1 で期待値を裏書き→本 assert のみ赤
      check("pb(b1) plan_rate: close 成功", !error, error?.message);
      check("pb(b2) plan_rate: 商品3列=0 凍結（実測②消化）", !!r && r.drink_back === 0 && r.champ_back === 0 && r.bottle_back === 0, j(r));
      check("pb(b3) plan_rate: source_mode='plan_rate'・product_sales_base=1000×2=2000",
        !!r && r.source_mode === "plan_rate" && r.product_sales_base === 2000, j(r));
      check(`pb(b4) plan_rate: calculated_back_amount=round(2000×15/100)=${expCalc}`, !!r && r.calculated_back_amount === expCalc, j(r));
      check("pb(e1) pt 射程外: plan_rate でも hon pt=6 が凍結", !!r && r.hon_pt_alloc === 6, j(r));
    }
    {
      // 同腕の実証: cRate(w2)+cPR(w1)・qty 3 → alloc 2/1 → base 2000／drink_back 200・pt 6／3
      const c = await openCheck(seat);
      await addLine(c, prodP, 3);
      await setNoms(c, [
        { cast_id: cRate, weight: 2, nom_kind: "hon", is_dohan: false },
        { cast_id: cPR, weight: 1, nom_kind: "hon", is_dohan: false },
      ]);
      const { error } = await payClose(c);
      const rows = await backsOf(c);
      const rr = rowOf(rows, cRate); const rp = rowOf(rows, cPR);
      check("pb(b5) 同腕: 混在名簿で close 成功・2行", !error && rows.length === 2, error?.message ?? j(rows));
      check("pb(b6) 同腕: plan_rate cast は base=1000×alloc 2=2000・calc 300・3列 0",
        !!rr && rr.product_sales_base === 2000 && rr.calculated_back_amount === 300 && rr.drink_back === 0, j(rr));
      check("pb(b7) 同腕: 同一伝票の product_rule cast は drink_back=200×alloc 1・base/calc null",
        !!rp && rp.drink_back === 200 && rp.source_mode === "product_rule" && rp.product_sales_base === null, j(rp));
      check("pb(b8) 同腕: pt は同じ alloc（6／3）", !!rr && !!rp && rr.hon_pt_alloc === 6 && rp.hon_pt_alloc === 3, j([rr, rp]));
    }
    {
      // .5 丸め: base 1010×1・rate 15 → 151.5 → 152（0 から遠い側）
      const c = await openCheck(seat);
      await addLine(c, prodP2, 1);
      await setNoms(c, [{ cast_id: cRate, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const r = rowOf(await backsOf(c), cRate);
      check("pb(b9) 丸め: base 1010・rate 15 → calc=152（151.5 の .5 は 0 から遠い側）",
        !error && !!r && r.product_sales_base === 1010 && r.calculated_back_amount === 152, error?.message ?? j(r));
    }
    {
      // rate=0 境界
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      await setNoms(c, [{ cast_id: cRate0, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const r = rowOf(await backsOf(c), cRate0);
      check("pb(b10) rate=0 境界: base 2000 凍結・calc 0・source_mode='plan_rate'",
        !error && !!r && r.product_sales_base === 2000 && r.calculated_back_amount === 0 && r.source_mode === "plan_rate", error?.message ?? j(r));
    }

    // ── (c) plan_fixed: 3列 0・pt のみ・base/calc null／pt 0 なら行なし ──
    {
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      await setNoms(c, [{ cast_id: cFixed, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const r = rowOf(await backsOf(c), cFixed);
      check("pb(c1) plan_fixed: close 成功・3列 0（実測②消化）", !error && !!r && r.drink_back === 0 && r.champ_back === 0 && r.bottle_back === 0, error?.message ?? j(r));
      check("pb(c2) plan_fixed: source_mode='plan_fixed'・base/calc=null",
        !!r && r.source_mode === "plan_fixed" && r.product_sales_base === null && r.calculated_back_amount === null, j(r));
      check("pb(e2) pt 射程外: plan_fixed でも hon pt=6 が凍結", !!r && r.hon_pt_alloc === 6, j(r));
    }
    {
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      await setNoms(c, [{ cast_id: cFixed, weight: 1, nom_kind: "jonai", is_dohan: false }]);
      const { error } = await payClose(c);
      const rows = await backsOf(c);
      check("pb(c3) plan_fixed: jonai（pt 0）は行なし＝ゼロ専用行を作らない", !error && rows.length === 0, error?.message ?? j(rows));
    }

    // ── (d) plan 割当なし → product_rule フォールバック ──
    {
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      await setNoms(c, [{ cast_id: cNone, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const r = rowOf(await backsOf(c), cNone);
      check("pb(d1) 割当なし: product_rule フォールバック（drink_back 400・source_mode='product_rule'）",
        !error && !!r && r.drink_back === 400 && r.source_mode === "product_rule", error?.message ?? j(r));
    }

    // ── (f) claim 不干渉 ──
    {
      const c = await openCheck(seat);
      await addLine(c, prodP, 2);
      const { data: cl, error: eCl } = await castCli.rpc("drink_claim_submit", { p_check_id: c, p_product_id: prodP, p_qty: 2 });
      if (eCl) throw new Error(`drink_claim_submit: ${eCl.message}`);
      const { error: eD } = await mgr.rpc("drink_claim_decide", { p_claim_id: cl, p_approve: true });
      if (eD) throw new Error(`drink_claim_decide: ${eD.message}`);
      const { data: before } = await admin.from("drink_claims").select("back_amount, status").eq("id", cl as string).single();
      await setNoms(c, [{ cast_id: cRate, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error } = await payClose(c);
      const { data: after } = await admin.from("drink_claims").select("back_amount, status").eq("id", cl as string).single();
      const r = rowOf(await backsOf(c), cRate);
      check("pb(f1) claim 不干渉: claim 済み行を含む伝票を plan_rate で close 成功", !error, error?.message);
      check("pb(f2) claim 不干渉: drink_claims.back_amount/status が close 前後で不変（400/approved）",
        !!before && !!after && before.back_amount === 400 && after.back_amount === 400 && after.status === "approved", j({ before, after }));
      check("pb(f3) claim 不干渉: plan_rate 行は claim 有無に依らず base 2000・calc 300",
        !!r && r.product_sales_base === 2000 && r.calculated_back_amount === 300, j(r));
    }

    // ── (g) 営業日境界: started_at D 05:30 JST（営業日 D-1→product_rule）／D 06:30 JST（営業日 D→plan_rate）──
    {
      const c1 = await openCheck(seat);
      await addLine(c1, prodP, 2);
      const { error: eU1 } = await admin.from("checks").update({ started_at: `${D}T05:30:00+09:00` }).eq("id", c1);
      if (eU1) throw new Error(`started_at update: ${eU1.message}`);
      await setNoms(c1, [{ cast_id: cG, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error: e1 } = await payClose(c1);
      const r1 = rowOf(await backsOf(c1), cG);
      check("pb(g1) 境界: started_at=D 05:30 JST（cutoff 06:00 前＝営業日 D-1）→ product_rule（drink_back 400）",
        !e1 && !!r1 && r1.source_mode === "product_rule" && r1.drink_back === 400, e1?.message ?? j({ D, r1 }));

      const c2 = await openCheck(seat);
      await addLine(c2, prodP, 2);
      const { error: eU2 } = await admin.from("checks").update({ started_at: `${D}T06:30:00+09:00` }).eq("id", c2);
      if (eU2) throw new Error(`started_at update: ${eU2.message}`);
      await setNoms(c2, [{ cast_id: cG, weight: 1, nom_kind: "hon", is_dohan: false }]);
      const { error: e2 } = await payClose(c2);
      const r2 = rowOf(await backsOf(c2), cG);
      check("pb(g2) 境界: started_at=D 06:30 JST（営業日 D）→ plan_rate（base 2000・calc 300・3列 0）",
        !e2 && !!r2 && r2.source_mode === "plan_rate" && r2.product_sales_base === 2000 && r2.calculated_back_amount === 300 && r2.drink_back === 0,
        e2?.message ?? j({ D, r2 }));
    }
  } finally {
    await teardown();
  }

  if (fails.length) {
    console.error(`verify:nox-product-back-modes FAIL (${fails.length} failed / ${pass} passed)`);
    for (const f of fails) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`verify:nox-product-back-modes ALL PASS (${pass} assertions)`);
  console.log("裁定113: product_rule 従来同値／plan_rate 3列0+同腕 base+round 算術+rate0／plan_fixed pt のみ／割当なし fallback／claim 不干渉／営業日境界 05:30-06:30");
}

main().catch((e) => { console.error("verify:nox-product-back-modes ERROR:", (e as Error).message); process.exit(1); });
