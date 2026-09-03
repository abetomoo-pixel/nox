/*
 * verify:nox-pricing-resolve-category — 裁定116-2（mig0128）区分解決の runtime 係留。
 *   npm run verify:nox-pricing-resolve-category（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 舞台はルール0件店 A2（pricing-apply 段44(1) と同じ根拠＝既存ルールの干渉ゼロで決定論）。
 * ルールは全て終日・全曜日（now() 依存ゼロ）・owner セッションで新15引数 set_pricing_rule を実呼び。
 *
 * 観点（設計書 v2 §4・mig0128）:
 *  (a) null=現行等価: p_category_id 省略/明示 null とも null 区分ルールのみで解決・
 *      checks.category_id/category_name は null・ext_menu_snap は null 区分のみ
 *  (b) 同 priority 内区分一致優先（set: null 版 vs 区分付き 同 priority→該当区分で区分付きが勝つ/
 *      他区分・null では null 版）・priority 第一鍵（extension: 小 priority null 版 vs 大 priority 区分付き
 *      →区分開栓でも null 版が勝つ）
 *  (c) 凍結: checks.category_id/category_name 開栓凍結・マスタ改名は非遡及・
 *      ext_menu_snap は他区分の extension を含まない（教訓52 鏡像の実行時確認）
 *  (d) 互換: p_category_id キー省略の named-args 呼びが成功（=kiosk 無送信互換の実装形）
 *  (g) ガード: 'bad category'（他店区分の開栓/rule 参照・停止中区分の開栓）・'bad category kind'
 *      （shimei へ区分）・'inactive category'（停止中区分の新規 rule 参照）・同値再送は据え置き=成功
 *  (p) 器 pin: check_open/pricing_resolve_core/set_pricing_rule 各1本＝pronargs 6/6/15（旧署名 DROP）
 *
 * 逆張り: PRC_INVERT=1 で全 check の期待を反転＝全赤を実測。
 * fixture: NOX-VERIFY-prc* 命名・finally 全消し（checks/lines→rules→categories の FK 順・
 *   audit は本段 target の精密削除＝pricing-apply の型・stores 不触・golden 不触）。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

const INV = process.env.PRC_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

const PFX = "NOX-VERIFY-prc";

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const owner = await signIn("ownerA");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();
  const storeA1 = sA1!.id as string;
  const storeA2 = sA2!.id as string;

  // 追跡リスト（finally 全消し用）
  const checkIds: string[] = [];
  const ruleIds: string[] = [];
  const seatIds: string[] = [];
  const catIds: string[] = [];

  async function teardown() {
    // 残骸自浄（前 run クラッシュ対応）: prefix で拾い、FK 順で消す
    const { data: seats } = await admin.from("seats").select("id").like("name", `${PFX}%`);
    const allSeatIds = [...new Set([...seatIds, ...(seats ?? []).map((r) => r.id as string)])];
    if (allSeatIds.length) {
      const { data: cks } = await admin.from("checks").select("id").in("seat_id", allSeatIds);
      for (const r of cks ?? []) if (!checkIds.includes(r.id as string)) checkIds.push(r.id as string);
    }
    if (checkIds.length) {
      const { data: lns } = await admin.from("check_lines").select("id").in("check_id", checkIds);
      const lineIds = (lns ?? []).map((r) => r.id as string);
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
      const targets = [
        ...checkIds.map((id) => `checks:${id}`),
        ...lineIds.map((id) => `check_lines:${id}`),
      ];
      if (targets.length) await admin.from("audit_logs").delete().in("target", targets);
    }
    const { data: cats } = await admin.from("pricing_categories").select("id").like("name", `${PFX}%`);
    const allCatIds = [...new Set([...catIds, ...(cats ?? []).map((r) => r.id as string)])];
    if (allCatIds.length) {
      const { data: rls } = await admin.from("pricing_rules").select("id").in("category_id", allCatIds);
      for (const r of rls ?? []) if (!ruleIds.includes(r.id as string)) ruleIds.push(r.id as string);
    }
    if (ruleIds.length) {
      await admin.from("pricing_rules").delete().in("id", ruleIds);
      await admin.from("audit_logs").delete().in("target", ruleIds.map((id) => `pricing_rules:${id}`));
    }
    if (allSeatIds.length) await admin.from("seats").delete().in("id", allSeatIds);
    if (allCatIds.length) {
      await admin.from("pricing_categories").delete().in("id", allCatIds);
      await admin.from("audit_logs").delete().in("target", allCatIds.map((id) => `pricing_categories:${id}`));
    }
  }
  await teardown();

  const mkSeat = async (store: { id: string; org_id: string }, nm: string) => {
    const id = (await admin.from("seats").insert({
      org_id: store.org_id, store_id: store.id, name: nm, kind: "卓", sort_order: 985, is_active: true,
    }).select("id").single()).data!.id as string;
    seatIds.push(id);
    return id;
  };
  const mkCat = async (storeId: string, name: string, sort: number) => {
    const { data, error } = await owner.rpc("set_pricing_category", {
      p_id: null, p_store_id: storeId, p_name: name, p_sort: sort, p_is_active: true,
    });
    if (error) throw new Error(`set_pricing_category: ${error.message}`);
    catIds.push(data as string);
    return data as string;
  };
  // 新15引数 set_pricing_rule の実呼び（終日・全曜日・rank なし）
  const mkRule = async (over: Record<string, unknown>) => {
    const { data, error } = await owner.rpc("set_pricing_rule", {
      p_id: null, p_store_id: storeA2, p_seat_kind: null, p_dow_mask: null,
      p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_duration_min: null,
      p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: null,
      ...over,
    });
    if (error) throw new Error(`set_pricing_rule(${JSON.stringify(over)}): ${error.message}`);
    ruleIds.push(data as string);
    return data as string;
  };
  const checkRow = async (id: string) =>
    (await admin.from("checks")
      .select("set_min, set_fee, ext_min, ext_fee, category_id, category_name, ext_menu_snap")
      .eq("id", id).single()).data as {
        set_min: number; set_fee: number; ext_min: number; ext_fee: number;
        category_id: string | null; category_name: string | null;
        ext_menu_snap: { rule_id: string; amount: number }[];
      };
  const openAt = async (seatId: string, cat?: string | null) => {
    const args: Record<string, unknown> = { p_seat_id: seatId, p_people: 1, p_nom_type: "free" };
    if (cat !== undefined) args.p_category_id = cat;  // undefined=キー省略（5引数相当）
    const { data, error } = await owner.rpc("check_open", args);
    if (data) checkIds.push(data as string);
    return { id: data as string | null, error };
  };

  try {
    // ── fixture 構築 ──
    const catX = await mkCat(storeA2, `${PFX}区分X`, 10);
    const catY = await mkCat(storeA2, `${PFX}区分Y`, 20);
    const catA1 = await mkCat(storeA1, `${PFX}他店区分`, 10);
    // set: 同 priority の null 版 vs 区分X版（tie-break 検証）
    await mkRule({ p_fee_kind: "set", p_amount: 7000, p_duration_min: 60, p_priority: 10 });
    const rCatX = await mkRule({ p_fee_kind: "set", p_amount: 9000, p_duration_min: 90, p_priority: 10, p_category_id: catX });
    // extension: 小 priority null 版 vs 大 priority 区分X版（priority 第一鍵検証）＋区分Y版（鏡像検証）
    await mkRule({ p_fee_kind: "extension", p_amount: 1000, p_priority: 5 });
    const eCatX = await mkRule({ p_fee_kind: "extension", p_amount: 2000, p_priority: 10, p_category_id: catX });
    const eCatY = await mkRule({ p_fee_kind: "extension", p_amount: 3000, p_priority: 20, p_category_id: catY });
    const seat1 = await mkSeat(sA2!, `${PFX}-卓1`);
    const seat2 = await mkSeat(sA2!, `${PFX}-卓2`);
    const seat3 = await mkSeat(sA2!, `${PFX}-卓3`);
    const seat4 = await mkSeat(sA2!, `${PFX}-卓4`);
    const seat5 = await mkSeat(sA2!, `${PFX}-卓5`);

    // ══ (d)(a) キー省略呼び＝5引数相当・null 等価 ══
    {
      const o1 = await openAt(seat1);  // p_category_id キーなし
      check("prc(d1) ★p_category_id キー省略の呼びが成功（kiosk 無送信互換の実装形）",
        !o1.error && !!o1.id, o1.error?.message ?? "id なし");
      const row = o1.id ? await checkRow(o1.id) : null;
      check("prc(a1) ★省略開栓＝null 区分ルールのみで解決（set 7000/60分・ext 1000）・区分列 null 凍結",
        row?.set_fee === 7000 && row?.set_min === 60 && row?.ext_fee === 1000
          && row?.category_id === null && row?.category_name === null,
        JSON.stringify(row));
      check("prc(a2) ★省略開栓の ext_menu_snap＝null 区分のみ1件（区分付き2本を含まない）",
        row?.ext_menu_snap.length === 1
          && !row?.ext_menu_snap.some((m) => m.rule_id === eCatX || m.rule_id === eCatY),
        JSON.stringify(row?.ext_menu_snap));
      const o4 = await openAt(seat4, null);  // 明示 null
      const row4 = o4.id ? await checkRow(o4.id) : null;
      check("prc(a3) ★明示 null 開栓＝省略と同値（set 7000/60・ext_menu 1件）",
        !o4.error && row4?.set_fee === 7000 && row4?.set_min === 60 && row4?.ext_menu_snap.length === 1,
        o4.error?.message ?? JSON.stringify(row4));
    }

    // ══ (b)(c) 区分X開栓＝tie-break/priority 第一鍵/凍結/鏡像 ══
    {
      const o2 = await openAt(seat2, catX);
      const row = o2.id ? await checkRow(o2.id) : null;
      check("prc(b1) ★同 priority 内は区分一致が勝つ（set 9000/90分＝区分X版）",
        !o2.error && row?.set_fee === 9000 && row?.set_min === 90,
        o2.error?.message ?? JSON.stringify(row));
      check("prc(b2) ★priority が第一鍵（ext は小 priority の null 版 1000 が勝つ・区分開栓でも）",
        row?.ext_fee === 1000, JSON.stringify({ ext_fee: row?.ext_fee }));
      check("prc(c2) ★ext_menu_snap 鏡像＝null 版+区分X版の2件・他区分（Y）を含まない",
        row?.ext_menu_snap.length === 2
          && row?.ext_menu_snap.some((m) => m.rule_id === eCatX)
          && !row?.ext_menu_snap.some((m) => m.rule_id === eCatY),
        JSON.stringify(row?.ext_menu_snap));
      // 凍結: 改名しても非遡及
      const { error: eRen } = await owner.rpc("set_pricing_category", {
        p_id: catX, p_store_id: storeA2, p_name: `${PFX}区分X改`, p_sort: 10, p_is_active: true,
      });
      const rowAfter = o2.id ? await checkRow(o2.id) : null;
      check("prc(c1) ★区分の開栓凍結＝checks.category_id/name 記録・マスタ改名は非遡及",
        !eRen && rowAfter?.category_id === catX && rowAfter?.category_name === `${PFX}区分X`,
        eRen?.message ?? JSON.stringify({ id: rowAfter?.category_id, name: rowAfter?.category_name }));
    }

    // ══ (b3) 他区分開栓＝null 版が勝つ ══
    {
      const o3 = await openAt(seat3, catY);
      const row = o3.id ? await checkRow(o3.id) : null;
      check("prc(b3) ★他区分（Y）開栓＝set は null 版 7000/60（X 版は当たらない）・凍結は Y",
        !o3.error && row?.set_fee === 7000 && row?.set_min === 60 && row?.category_id === catY,
        o3.error?.message ?? JSON.stringify(row));
    }

    // ══ (g) ガード系 ══
    {
      const g1 = await openAt(seat5, catA1);  // 他店（A1）の区分で A2 開栓
      check("prc(g1) ★他店区分での開栓＝'bad category'", has(g1.error, "bad category"),
        g1.error?.message ?? "通ってしまった");
      // catY を停止 → 停止中区分での開栓
      const { error: eOff } = await owner.rpc("set_pricing_category", {
        p_id: catY, p_store_id: storeA2, p_name: `${PFX}区分Y`, p_sort: 20, p_is_active: false,
      });
      const g2 = await openAt(seat5, catY);
      check("prc(g2) ★停止中区分での開栓＝'bad category'", !eOff && has(g2.error, "bad category"),
        eOff?.message ?? g2.error?.message ?? "通ってしまった");
      const { error: g3 } = await owner.rpc("set_pricing_rule", {
        p_id: null, p_store_id: storeA2, p_fee_kind: "hon_shimei", p_seat_kind: null, p_dow_mask: null,
        p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 3000, p_duration_min: null,
        p_priority: 50, p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: catX,
      });
      check("prc(g3) ★shimei への区分付与＝'bad category kind'（死蔵予防・fail-closed）",
        has({ message: g3?.message }, "bad category kind"), g3?.message ?? "通ってしまった");
      const { error: g4 } = await owner.rpc("set_pricing_rule", {
        p_id: null, p_store_id: storeA2, p_fee_kind: "extension", p_seat_kind: null, p_dow_mask: null,
        p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 500, p_duration_min: null,
        p_priority: 60, p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: catY,
      });
      check("prc(g4) ★停止中区分の新規 rule 参照＝'inactive category'（0104 rank 型）",
        has({ message: g4?.message }, "inactive category"), g4?.message ?? "通ってしまった");
      const { error: g5 } = await owner.rpc("set_pricing_rule", {
        p_id: eCatY, p_store_id: storeA2, p_fee_kind: "extension", p_seat_kind: null, p_dow_mask: null,
        p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 3000, p_duration_min: null,
        p_priority: 20, p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: catY,
      });
      check("prc(g5) ★停止中区分でも既存行の同値再送は据え置き＝成功", !g5, g5?.message);
      const { error: g6 } = await owner.rpc("set_pricing_rule", {
        p_id: null, p_store_id: storeA2, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: null,
        p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 6000, p_duration_min: null,
        p_priority: 70, p_is_active: true, p_name: null, p_tax_category: "taxable_10", p_category_id: catA1,
      });
      check("prc(g6) ★他店区分の rule 参照＝'bad category'", has({ message: g6?.message }, "bad category"),
        g6?.message ?? "通ってしまった");
      void rCatX;
    }

    // ══ (p) 器 pin: 旧署名 DROP＝各1本・pronargs 6/6/15 ══
    {
      const { rows } = await db.query(`
        select p.proname, count(*)::int as n, min(p.pronargs)::int as a, max(p.pronargs)::int as b
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('check_open','pricing_resolve_core','set_pricing_rule')
         group by p.proname order by p.proname`);
      const pin = Object.fromEntries(rows.map((r) => [r.proname, `${r.n}:${r.a}`]));
      check("prc(p1) ★旧署名 DROP＝各1本（check_open 6引数・core 6引数・set_pricing_rule 15引数）",
        pin["check_open"] === "1:6" && pin["pricing_resolve_core"] === "1:6"
          && pin["set_pricing_rule"] === "1:15",
        JSON.stringify(pin));
    }
  } finally {
    await teardown();
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（PRC_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-pricing-resolve-category ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
