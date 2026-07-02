/*
 * verify:nox-rls — 実ユーザーでサインインして RLS を実測（BANZEN verify-rls の構造を翻訳）。
 *   npm run verify:nox-rls（事前に seed:f0）
 *
 * 観点（認可設計 §6 の F0 分）:
 *  - 店スコープ: 他店 0行・owner は org 全店。
 *  - cast プライバシー パターン1土台: cast は casts で自分の行のみ。
 *  - memberships: owner=org 全店分 / manager=自店分 / cast=0行。
 *  - users: manager=自店 membership 保持者のみ / cast=自分のみ。
 *  - audit_logs: owner のみ（manager/cast 0行）＝認可設計 §1.2。
 *  - 書込遮断: authenticated の insert/update/delete が permission denied（0003 grant 面）。
 *  - ヘルパー正常系: auth_role/auth_cast_id が期待値。
 *
 * F1a 追加（mig0005）:
 *  - RPC 実行＋audit assert 3本: set_product 新規=before_json null／set_seat 更新=before_json 非null／
 *    product_stock_add=target が stock_logs:<id>（audit_log_write 内部 perform 経路の実機検証）。
 *  - unit4 異常系4ケース（キー欠落・文字列・負数・小数）が 'bad unit4' で拒否。
 *  - cast 可視性: products=パターン3（cast も見える）／seats・stock_logs・bottle_keeps=パターン2（cast 0行）。
 *  - 退職回帰（方式A・capture-and-restore）: アクティブ membership の id 集合をキャプチャ→全行 false→
 *    orgs/users/stores/products 0行→キャプチャ集合のみ復元→再可視。
 *    部分ユニーク（1ユーザー1アクティブ）と干渉せず、F4 の複数 membership 時代でも壊れない書き方。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ORG_A, ORG_B, STORE_A1, STORE_A2, STORE_B1, FIXTURE_USERS, loadEnvOrExit,
  type FixtureUserKey,
} from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY", // 退職回帰の capture-and-restore 専用（service キー）
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
function sameSet(actual: string[], expected: string[]): boolean {
  const a = [...actual].sort();
  const b = [...expected].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

async function signIn(key: FixtureUserKey): Promise<SupabaseClient> {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: FIXTURE_USERS[key].email,
    password: env.SEED_PASSWORD,
  });
  if (error) {
    console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
    process.exit(1);
  }
  return c;
}

async function names(c: SupabaseClient, table: string, col = "name"): Promise<string[]> {
  const { data, error } = await c.from(table).select(col);
  if (error) {
    fails.push(`${table} select がエラー: ${error.message}`);
    return [];
  }
  return (data as unknown as Array<Record<string, string>>).map((r) => r[col]);
}

async function main() {
  // ── ownerA: org A 全店・org B 不可視・audit 閲覧可 ──
  {
    const c = await signIn("ownerA");
    check("ownerA orgs = A のみ", sameSet(await names(c, "orgs"), [ORG_A]));
    check("ownerA stores = A1+A2（B1 不可視）", sameSet(await names(c, "stores"), [STORE_A1, STORE_A2]));
    const { data: mems } = await c.from("memberships").select("id");
    check("ownerA memberships = org A の4行", (mems ?? []).length === 4, `got ${(mems ?? []).length}`);
    const { data: audits } = await c.from("audit_logs").select("id, action");
    check("ownerA audit_logs ≥1行（seed_marker）", (audits ?? []).some((a) => a.action === "seed_marker"), `got ${(audits ?? []).length}行`);
    const { data: role } = await c.rpc("auth_role");
    check("ownerA auth_role = owner", role === "owner", `got ${JSON.stringify(role)}`);
    await c.auth.signOut();
  }

  // ── managerA1: 自店のみ・org B 0行・audit 0行 ──
  {
    const c = await signIn("managerA1");
    check("managerA1 orgs = A のみ", sameSet(await names(c, "orgs"), [ORG_A]));
    check("managerA1 stores = A1 のみ（A2/B1 不可視）", sameSet(await names(c, "stores"), [STORE_A1]));
    check(
      "managerA1 casts = A1 の2人",
      sameSet(await names(c, "casts"), [FIXTURE_USERS.castA1a.name, FIXTURE_USERS.castA1b.name]),
    );
    check(
      "managerA1 users = A1 membership 保持者4人（managerB1 不可視）",
      sameSet(await names(c, "users", "email"), [
        FIXTURE_USERS.ownerA.email,
        FIXTURE_USERS.managerA1.email,
        FIXTURE_USERS.castA1a.email,
        FIXTURE_USERS.castA1b.email,
      ]),
    );
    const { data: mems } = await c.from("memberships").select("id");
    check("managerA1 memberships = 自店4行", (mems ?? []).length === 4, `got ${(mems ?? []).length}`);
    const { data: audits } = await c.from("audit_logs").select("id");
    check("managerA1 audit_logs = 0行（§1.2 owner 限定）", (audits ?? []).length === 0, `got ${(audits ?? []).length}`);
    const { data: castId } = await c.rpc("auth_cast_id");
    check("managerA1 auth_cast_id = null", castId === null, `got ${JSON.stringify(castId)}`);
    await c.auth.signOut();
  }

  // ── castA1a: 自分の行のみ（パターン1土台）・memberships/audit 0行 ──
  {
    const c = await signIn("castA1a");
    check("castA1a orgs = A のみ", sameSet(await names(c, "orgs"), [ORG_A]));
    check("castA1a stores = A1 のみ", sameSet(await names(c, "stores"), [STORE_A1]));
    check(
      "castA1a casts = 自分の1行のみ（castA1b 不可視＝パターン1）",
      sameSet(await names(c, "casts"), [FIXTURE_USERS.castA1a.name]),
    );
    check("castA1a users = 自分のみ", sameSet(await names(c, "users", "email"), [FIXTURE_USERS.castA1a.email]));
    const { data: mems } = await c.from("memberships").select("id");
    check("castA1a memberships = 0行", (mems ?? []).length === 0, `got ${(mems ?? []).length}`);
    const { data: audits } = await c.from("audit_logs").select("id");
    check("castA1a audit_logs = 0行（パターン2包含）", (audits ?? []).length === 0, `got ${(audits ?? []).length}`);
    const { data: role } = await c.rpc("auth_role");
    check("castA1a auth_role = cast", role === "cast", `got ${JSON.stringify(role)}`);
    const { data: castId } = await c.rpc("auth_cast_id");
    check("castA1a auth_cast_id 非null", typeof castId === "string" && castId.length > 0, `got ${JSON.stringify(castId)}`);

    // 書込遮断（0003 grant 面・RLS 以前に permission denied for table）
    const { error: eIns } = await c.from("casts").insert({ org_id: "00000000-0000-0000-0000-000000000000", store_id: "00000000-0000-0000-0000-000000000000", name: "侵入" });
    check("castA1a casts INSERT 遮断", !!eIns?.message?.includes("permission denied"), eIns?.message ?? "実行できてしまった");
    const { error: eUpd } = await c.from("casts").update({ name: "改ざん" }).eq("name", FIXTURE_USERS.castA1a.name);
    check("castA1a casts UPDATE 遮断", !!eUpd?.message?.includes("permission denied"), eUpd?.message ?? "実行できてしまった");
    const { error: eDel } = await c.from("casts").delete().eq("name", FIXTURE_USERS.castA1a.name);
    check("castA1a casts DELETE 遮断", !!eDel?.message?.includes("permission denied"), eDel?.message ?? "実行できてしまった");
    const { error: eAud } = await c.from("audit_logs").insert({ org_id: "00000000-0000-0000-0000-000000000000", action: "偽装" });
    check("castA1a audit_logs INSERT 遮断", !!eAud?.message?.includes("permission denied"), eAud?.message ?? "実行できてしまった");
    await c.auth.signOut();
  }

  // ══════════════════════════════════════════════════════════
  // F1a: RPC 実行＋audit assert＋unit4 異常系（managerA1 で操作・ownerA で監査閲覧）
  // ══════════════════════════════════════════════════════════
  let productId = "";
  let seatId = "";
  let stockLogId = "";
  {
    const c = await signIn("managerA1");
    const { data: stores } = await c.from("stores").select("id, name").eq("name", STORE_A1);
    const storeA1 = stores?.[0]?.id as string;

    // set_product 新規（rate モード）
    const { data: pid, error: eP } = await c.rpc("set_product", {
      p_id: null, p_store_id: storeA1, p_type: "drink", p_category: "ドリンク",
      p_name: "NOX-VERIFY-指名ドリンク", p_price: 1500, p_cost: 300,
      p_back_mode: "rate", p_back_value: 50, p_unit4: null, p_hon_pt: 2, p_is_active: true,
    });
    check("F1a set_product 新規 成功", !eP && typeof pid === "string", eP?.message);
    productId = pid as string;

    // set_seat 新規 → 更新（before 非null の audit を作る）
    const { data: sid, error: eS } = await c.rpc("set_seat", {
      p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-卓1", p_kind: "卓",
      p_sort_order: 0, p_is_active: true,
    });
    check("F1a set_seat 新規 成功", !eS && typeof sid === "string", eS?.message);
    seatId = sid as string;
    const { error: eS2 } = await c.rpc("set_seat", {
      p_id: seatId, p_store_id: storeA1, p_name: "NOX-VERIFY-卓1改", p_kind: "VIP",
      p_sort_order: 1, p_is_active: true,
    });
    check("F1a set_seat 更新 成功", !eS2, eS2?.message);

    // product_stock_add
    const { data: lid, error: eL } = await c.rpc("product_stock_add", {
      p_product_id: productId, p_delta: 5, p_reason: "入荷",
    });
    check("F1a product_stock_add 成功", !eL && typeof lid === "string", eL?.message);
    stockLogId = lid as string;
    const { data: slog } = await c.from("stock_logs").select("id, delta").eq("id", stockLogId);
    check("F1a manager が stock_logs を閲覧可（パターン2の manager 枝）", (slog ?? []).length === 1 && slog?.[0]?.delta === 5);

    // unit4 異常系4ケース（すべて 'bad unit4' で拒否）
    const unit4Cases: Array<[string, unknown]> = [
      ["キー欠落", { hon: 500, jonai: 500, dohan: 500 }],
      ["文字列値", { hon: "500", jonai: 500, dohan: 500, free: 400 }],
      ["負数", { hon: -1, jonai: 500, dohan: 500, free: 400 }],
      ["小数", { hon: 500.5, jonai: 500, dohan: 500, free: 400 }],
    ];
    for (const [label, unit4] of unit4Cases) {
      const { error } = await c.rpc("set_product", {
        p_id: null, p_store_id: storeA1, p_type: "drink", p_category: null,
        p_name: "NOX-VERIFY-不正unit4", p_price: 1000, p_cost: null,
        p_back_mode: "unit4", p_back_value: null, p_unit4: unit4, p_hon_pt: 0, p_is_active: true,
      });
      check(`F1a unit4 異常系（${label}）= bad unit4`, !!error?.message?.includes("bad unit4"), error?.message ?? "通ってしまった");
    }
    await c.auth.signOut();
  }
  {
    const c = await signIn("ownerA");
    // audit assert 3本（audit_log_write 内部 perform 経路の実機検証）
    const { data: aP } = await c
      .from("audit_logs")
      .select("before_json, after_json")
      .eq("action", "set_product")
      .eq("target", `products:${productId}`);
    check("F1a audit: set_product 新規が1行", (aP ?? []).length === 1, `got ${(aP ?? []).length}`);
    check("F1a audit: set_product before_json=null（新規）", aP?.[0]?.before_json === null);
    check(
      "F1a audit: set_product after_json に商品名",
      (aP?.[0]?.after_json as { name?: string } | null)?.name === "NOX-VERIFY-指名ドリンク",
    );
    const { data: aS } = await c
      .from("audit_logs")
      .select("before_json, after_json")
      .eq("action", "set_seat")
      .eq("target", `seats:${seatId}`)
      .not("before_json", "is", null);
    check("F1a audit: set_seat 更新（before_json 非null）が1行", (aS ?? []).length === 1, `got ${(aS ?? []).length}`);
    check(
      "F1a audit: set_seat 更新の before に旧名・after に新名",
      (aS?.[0]?.before_json as { name?: string } | null)?.name === "NOX-VERIFY-卓1" &&
        (aS?.[0]?.after_json as { name?: string } | null)?.name === "NOX-VERIFY-卓1改",
    );
    const { data: aL } = await c
      .from("audit_logs")
      .select("id")
      .eq("action", "product_stock_add")
      .eq("target", `stock_logs:${stockLogId}`);
    check("F1a audit: product_stock_add（target=stock_logs:<id>）が1行", (aL ?? []).length === 1, `got ${(aL ?? []).length}`);
    await c.auth.signOut();
  }

  // ══════════════════════════════════════════════════════════
  // F1a: cast 可視性（パターン3=products 見える／パターン2=0行）
  // ══════════════════════════════════════════════════════════
  {
    const c = await signIn("castA1a");
    const { data: prods } = await c.from("products").select("name").eq("id", productId);
    check("F1a castA1a products 見える（パターン3・価格表）", (prods ?? []).length === 1);
    const { data: seats } = await c.from("seats").select("id");
    check("F1a castA1a seats = 0行（パターン2）", (seats ?? []).length === 0, `got ${(seats ?? []).length}`);
    const { data: slogs } = await c.from("stock_logs").select("id");
    check("F1a castA1a stock_logs = 0行（パターン2）", (slogs ?? []).length === 0, `got ${(slogs ?? []).length}`);
    const { data: bks } = await c.from("bottle_keeps").select("id");
    check("F1a castA1a bottle_keeps = 0行（パターン2）", (bks ?? []).length === 0, `got ${(bks ?? []).length}`);
    await c.auth.signOut();
  }

  // ── managerB1: org B のみ・org A データ 0行 ──
  {
    const c = await signIn("managerB1");
    check("managerB1 orgs = B のみ", sameSet(await names(c, "orgs"), [ORG_B]));
    check("managerB1 stores = B1 のみ", sameSet(await names(c, "stores"), [STORE_B1]));
    const { data: casts } = await c.from("casts").select("id");
    check("managerB1 casts = 0行（org A の cast 不可視）", (casts ?? []).length === 0, `got ${(casts ?? []).length}`);
    const { data: mems } = await c.from("memberships").select("id");
    check("managerB1 memberships = 自店1行", (mems ?? []).length === 1, `got ${(mems ?? []).length}`);
    const { data: prods } = await c.from("products").select("id");
    check("managerB1 products = 0行（org A 商品の不可視）", (prods ?? []).length === 0, `got ${(prods ?? []).length}`);
    await c.auth.signOut();
  }

  // ══════════════════════════════════════════════════════════
  // F1a: 退職回帰（方式A・capture-and-restore）
  // 部分ユニーク（1ユーザー1アクティブ）と干渉しない書き方:
  //   アクティブ行の id 集合をキャプチャ → 全行 false → 0行 assert → キャプチャ集合のみ復元。
  //   複数 membership 時代（F4）でも元の状態に正確に戻る。
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: urow } = await admin
      .from("users")
      .select("id")
      .eq("email", FIXTURE_USERS.managerA1.email)
      .single();
    const managerUserId = urow!.id as string;

    // capture: 現在アクティブな membership の id 集合
    const { data: act } = await admin
      .from("memberships")
      .select("id")
      .eq("user_id", managerUserId)
      .eq("is_active", true);
    const capturedIds = (act ?? []).map((r) => r.id as string);
    check("退職回帰 capture: アクティブ membership ≥1", capturedIds.length >= 1, `got ${capturedIds.length}`);

    // flip: 全行を失効
    const { error: eFlip } = await admin
      .from("memberships")
      .update({ is_active: false })
      .eq("user_id", managerUserId);
    check("退職回帰 flip 成功", !eFlip, eFlip?.message);

    try {
      // assert: 完全失効（orgs/users/stores/products すべて 0行＝方式A の効果）
      const c = await signIn("managerA1"); // auth 自体は生きている（失効は RLS 層）
      for (const table of ["orgs", "users", "stores", "products"]) {
        const { data, error } = await c.from(table).select("id");
        check(`退職回帰: ${table} = 0行`, !error && (data ?? []).length === 0, error?.message ?? `got ${(data ?? []).length}`);
      }
      const { data: role } = await c.rpc("auth_role");
      check("退職回帰: auth_role = null", role === null, `got ${JSON.stringify(role)}`);
      await c.auth.signOut();
    } finally {
      // restore: キャプチャした id 集合のみ復元（部分ユニークと干渉しない）
      if (capturedIds.length) {
        const { error: eRestore } = await admin
          .from("memberships")
          .update({ is_active: true })
          .in("id", capturedIds);
        check("退職回帰 restore 成功", !eRestore, eRestore?.message);
      }
    }

    // assert: 再可視
    const c2 = await signIn("managerA1");
    check("退職回帰: 復元後 orgs 再可視", sameSet(await names(c2, "orgs"), [ORG_A]));
    await c2.auth.signOut();
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-rls ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
