/*
 * verify:nox-product-types — mig0148 ★4／★6 products.type／check_lines.kind の food／other 拡張（裁定272-4・271-9 解除）の係留。
 *   npm run verify:nox-product-types（env: URL/PUBLISHABLE/SUPABASE_DB_URL・seed:f0 済み）。f0 57 段目。
 *   Postgres 直結の 1 トランザクション内で JWT claims を emulate → 最後に ROLLBACK＝残留 0・snapshot 一致。
 *
 *  (1) CHECK 逐語: products_type_check 5 値・check_lines_kind_check 11 値（referral／food／other 込み）
 *  (2) product_bulk_insert に food／other → 行の type 正・戻り by_type に food／other・audit の by_type にも同 5 キー・未知 type は 'bad type'
 *  (3) set_product に p_type 'food'／'other' → 行 type 正・未知は 'bad type'
 *  (4) check_add_line で food 商品を載せると kind='food'（product.type 由来）・name／price 凍結・back_snapshot は rate 0（bulk 既定）
 *  (5) category-map: food／other は「指名・その他」（other）帰属・product-groups の type 別フォールバックに food／other の群がある
 *  (6) pay に影響 0: pay.ts の productBack は drink／champ／bottle の 3 キーのみ・collect.ts は champ／bottle 以外の kind を本数集計に入れない（text pin）
 *  逆テスト 1 本（手動・1 回）: pt(2-2) の期待 by_type.food を 2 にする→赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { categoryOf } from "../lib/nox/analytics/category-map";
import { groupProducts } from "../lib/nox/ui/product-groups";
import { countByType, parseProductBulk } from "../lib/nox/product-bulk";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  // ── (5)(6) DB 非依存 ──
  check("pt(5-1) category-map: food／other は other（指名・その他）帰属・discount は別掲のまま", categoryOf("food", null) === "other" && categoryOf("other", null) === "other" && categoryOf("discount", null) === "discount" && categoryOf("drink", null) === "drink");
  const groups = groupProducts([{ id: "1", name: "焼きそば", type: "food", price: 800 }, { id: "2", name: "氷", type: "other", price: 300 }, { id: "3", name: "ハイボール", type: "drink", price: 900 }], []);
  check("pt(5-2) product-groups: カテゴリ未登録店の type 別フォールバックに フード／その他 の群（drink→…→food→other の順）", groups.map((g) => `${g.key}:${g.label}`).join(",") === "drink:ドリンク,food:フード,other:その他", groups.map((g) => g.key).join(","));
  const parsed = parseProductBulk("c,焼きそば,フード,800\nc,氷,その他,300\nc,ハイボール,ドリンク,900").items;
  check("pt(5-3) product-bulk: countByType は 5 キー（food 1・other 1・drink 1・champ 0・bottle 0）", JSON.stringify(countByType(parsed)) === JSON.stringify({ drink: 1, champ: 0, bottle: 0, food: 1, other: 1 }), JSON.stringify(countByType(parsed)));
  const paySrc = fs.readFileSync("lib/nox/pay.ts", "utf8");
  const colSrc = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
  check("pt(6-1) pay.ts: productBack は { drink; champ; bottle } の 3 キー（food／other は報酬計算の器に無い＝影響 0）", /productBack: \{ drink: number; champ: number; bottle: number \}/.test(paySrc));
  check("pt(6-2) collect.ts: champ／bottle 以外の kind は本数集計に入れない（continue）・referral は紹介者 gross へ分岐", colSrc.includes('if (kind !== "champ" && kind !== "bottle") continue;') && colSrc.includes('if (kind === "referral") {'));

  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  type R = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
  const call = async (sql: string, params: unknown[] = []): Promise<R> => {
    await db.query("savepoint sp");
    try { const rows = (await db.query(sql, params)).rows; await db.query("release savepoint sp"); return { ok: true, rows }; }
    catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: (e as Error).message }; }
  };
  const errOf = (r: R) => (r.ok ? "(no error)" : r.err);
  const asUid = async (uid: string) => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await db.query(`set local role authenticated`);
  };
  const asPg = async () => { await db.query("reset role"); };
  try {
    const st = (await q<{ id: string; org_id: string }>(`select id, org_id from public.stores where name = $1`, [STORE_A1]))[0];
    const ownerA = (await q<{ id: string; auth_user_id: string }>(`select id, auth_user_id from public.users where email = $1 and is_active`, [FIXTURE_USERS.ownerA.email]))[0];
    check("pt(0-1) fixture: A1／owner-a が引ける", !!st && !!ownerA);
    if (!st || !ownerA) throw new Error("fixture 解決失敗");

    // ── (1) CHECK 逐語 ──
    const ck = await q<{ conname: string; d: string }>(`select conname, pg_get_constraintdef(oid) as d from pg_constraint where conname in ('check_lines_kind_check','products_type_check') order by 1`);
    const kindDef = ck.find((c) => c.conname === "check_lines_kind_check")?.d ?? "", typeDef = ck.find((c) => c.conname === "products_type_check")?.d ?? "";
    check("pt(1-1) products_type_check＝drink/champ/bottle/food/other の 5 値（逐語）", typeDef === "CHECK ((type = ANY (ARRAY['drink'::text, 'champ'::text, 'bottle'::text, 'food'::text, 'other'::text])))", typeDef);
    check("pt(1-2) check_lines_kind_check＝8 値＋referral/food/other の 11 値（逐語）", kindDef === "CHECK ((kind = ANY (ARRAY['set'::text, 'time'::text, 'charge'::text, 'drink'::text, 'champ'::text, 'bottle'::text, 'custom'::text, 'discount'::text, 'referral'::text, 'food'::text, 'other'::text])))", kindDef);

    const snap = async () => JSON.stringify((await q(`select (select count(*)::int from public.products where store_id = $1) p, (select count(*)::int from public.product_categories where store_id = $1) c, (select count(*)::int from public.product_costs where store_id = $1) pc,
      (select count(*)::int from public.checks where store_id = $1) ch, (select count(*)::int from public.check_lines where store_id = $1) l, (select count(*)::int from public.seats where store_id = $1) s, (select count(*)::int from public.audit_logs where org_id = $2) au`, [st.id, st.org_id]))[0]);
    const before = await snap();

    await db.query("begin");
    try {
      // ── (2) product_bulk_insert ──
      const items = [
        { name: "NOX-VERIFY-焼きそば", type: "food", price: 800, cost: 300, category: "NOX-VERIFY-フード" },
        { name: "NOX-VERIFY-氷", type: "other", price: 300, category: "NOX-VERIFY-その他" },
        { name: "NOX-VERIFY-ハイボール", type: "drink", price: 900 },
        { name: "NOX-VERIFY-ポテト", type: "food", price: 600, category: "NOX-VERIFY-フード" },
      ];
      await asUid(ownerA.auth_user_id);
      const bi = await call(`select public.product_bulk_insert($1, $2::jsonb) as r`, [st.id, JSON.stringify(items)]);
      check("pt(2-1) product_bulk_insert（food 2・other 1・drink 1）が通る", bi.ok, errOf(bi));
      const res = bi.ok ? (bi.rows[0].r as { products_created: number; categories_created: string[]; by_type: Record<string, number> }) : null;
      const bt5 = (bt?: Record<string, number>) => !!bt && Object.keys(bt).length === 5 && bt.drink === 1 && bt.champ === 0 && bt.bottle === 0 && bt.food === 2 && bt.other === 1; // jsonb はキー順非保証＝値で比較
      check("pt(2-2) ★戻り: products_created 4・by_type {drink 1, champ 0, bottle 0, food 2, other 1}（5 キー）・categories_created 2", res?.products_created === 4 && bt5(res?.by_type) && (res?.categories_created ?? []).length === 2, JSON.stringify(res));
      await asPg();
      const rows = await q<{ name: string; type: string; back_mode: string; back_value: number; hon_pt: number; cat: string | null }>(`select p.name, p.type, p.back_mode, p.back_value, p.hon_pt, c.name as cat from public.products p left join public.product_categories c on c.id = p.category_id where p.store_id = $1 and p.name like 'NOX-VERIFY-%' and p.name in ('NOX-VERIFY-焼きそば','NOX-VERIFY-氷','NOX-VERIFY-ハイボール','NOX-VERIFY-ポテト') order by p.name`, [st.id]);
      check("pt(2-3) 行の type＝food／other／drink・カテゴリ結線・bulk 既定（rate 0・hon_pt 0）", rows.length === 4 && rows.find((r) => r.name === "NOX-VERIFY-焼きそば")?.type === "food" && rows.find((r) => r.name === "NOX-VERIFY-氷")?.type === "other" && rows.find((r) => r.name === "NOX-VERIFY-ハイボール")?.type === "drink" && rows.find((r) => r.name === "NOX-VERIFY-ポテト")?.cat === "NOX-VERIFY-フード" && rows.every((r) => r.back_mode === "rate" && r.back_value === 0 && r.hon_pt === 0), JSON.stringify(rows));
      const au = await q<{ bt: Record<string, number> }>(`select after_json->'by_type' as bt from public.audit_logs where action = 'product_bulk_insert' and org_id = $1 order by at desc limit 1`, [st.org_id]);
      check("pt(2-4) audit の by_type にも food／other（5 キー・値一致）", bt5(au[0]?.bt), JSON.stringify(au[0]));
      await asUid(ownerA.auth_user_id);
      const bad = await call(`select public.product_bulk_insert($1, $2::jsonb)`, [st.id, JSON.stringify([{ name: "x", type: "tobacco", price: 1 }])]);
      check("pt(2-5) 未知 type（tobacco）は 'bad type'（白名単 5 値）", !bad.ok && bad.err === "bad type", errOf(bad));
      // ── (3) set_product ──
      const sp = await call(`select public.set_product(null, $1, 'food', null, 'NOX-VERIFY-フード単品', 700, null, 'rate', 0, null, 0, true, null, null, false) as id`, [st.id]);
      const so = await call(`select public.set_product(null, $1, 'other', null, 'NOX-VERIFY-その他単品', 200, null, 'rate', 0, null, 0, true, null, null, false) as id`, [st.id]);
      const sx = await call(`select public.set_product(null, $1, 'snack', null, 'NOX-VERIFY-不正', 200, null, 'rate', 0, null, 0, true, null, null, false) as id`, [st.id]);
      await asPg();
      const sr = await q<{ name: string; type: string }>(`select name, type from public.products where id = any($1::uuid[]) order by name`, [[sp.ok ? sp.rows[0].id : null, so.ok ? so.rows[0].id : null].filter(Boolean)]);
      check("pt(3-1) set_product p_type food／other が通り行の type 正・'snack' は 'bad type'", sp.ok && so.ok && !sx.ok && sx.err === "bad type" && JSON.stringify(sr) === JSON.stringify([{ name: "NOX-VERIFY-その他単品", type: "other" }, { name: "NOX-VERIFY-フード単品", type: "food" }]), [sp, so, sx].map(errOf).join(" / ") + " " + JSON.stringify(sr));
      // ── (4) check_add_line で food 商品 ──
      const foodId = rows.length ? (await q<{ id: string }>(`select id from public.products where store_id = $1 and name = 'NOX-VERIFY-焼きそば'`, [st.id]))[0]?.id : null;
      const seat = (await q<{ id: string }>(`insert into public.seats (org_id, store_id, name, kind, sort_order, is_active) values ($1,$2,'NOX-VERIFY-フード卓','卓',9949,true) returning id`, [st.org_id, st.id]))[0].id;
      await asUid(ownerA.auth_user_id);
      const op = await call(`select public.check_open($1, null, 'free') as id`, [seat]);
      const chk = op.ok ? (op.rows[0].id as string) : "";
      const t0 = (await q<{ total: number }>(`select total from public.checks where id = $1`, [chk]))[0]?.total ?? -1;
      const al = await call(`select public.check_add_line($1, $2, 2, null, 'A', null, null) as id`, [chk, foodId]);
      check("pt(4-1) check_open→check_add_line（food 商品×2）が通る", op.ok && al.ok, errOf(op) + " / " + errOf(al));
      await asPg();
      const ln = al.ok ? (await q<{ kind: string; name_snapshot: string; unit_price_snapshot: number; qty: number; line_total: number; bs: Record<string, unknown> }>(`select kind, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot as bs from public.check_lines where id = $1`, [al.rows[0].id]))[0] : null;
      const t1 = (await q<{ total: number }>(`select total from public.checks where id = $1`, [chk]))[0]?.total ?? -1;
      check("pt(4-2) ★行の kind='food'（product.type 由来）・name／price 凍結（焼きそば 800×2＝1600）・back_snapshot rate 0・hon_pt 0", ln?.kind === "food" && ln?.name_snapshot === "NOX-VERIFY-焼きそば" && ln?.unit_price_snapshot === 800 && ln?.qty === 2 && ln?.line_total === 1600 && ln?.bs?.back_mode === "rate" && ln?.bs?.back_value === 0 && ln?.bs?.hon_pt === 0, JSON.stringify(ln));
      check("pt(4-3) food 行は客への請求＝checks.total が増える（referral と違い除外しない）", t1 > t0, `${t0} → ${t1}`);
      const cat = await q<{ n: number }>(`select count(*)::int as n from public.check_lines where check_id = $1 and kind in ('food','other')`, [chk]);
      check("pt(4-4) category-map で other 帰属＝DB 行 kind food を categoryOf に通すと 'other'", cat[0].n === 1 && categoryOf(ln?.kind ?? "", null) === "other");
    } finally {
      await db.query("rollback");
    }
    const after = await snap();
    check("pt(9-1) ROLLBACK 後の残留＝実行前と同値（A1 products／categories／costs／checks／lines／seats・org A audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }

  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.rpc("product_bulk_insert", { p_store_id: null, p_items: null });
  check("pt(9-2) anon product_bulk_insert BLOCKED（★6 再定義後も revoke 維持）", !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-product-types ALL PASS (${pass} assertions)`);
  console.log("food／other(0148 ★4／★6): CHECK 逐語 5 値／11 値 / bulk_insert by_type 5 キー・audit・bad type / set_product food／other・bad type / check_add_line kind=food・凍結・total 増 / category-map other・product-groups 群・countByType / pay 器 3 キー・collect 本数集計外（ROLLBACK・残留 0）");
}

main().catch((e) => { console.error(e); process.exit(1); });
