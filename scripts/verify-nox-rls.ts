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
import { randomUUID } from "node:crypto";
import {
  ORG_A, ORG_B, STORE_A1, STORE_A2, STORE_B1, FIXTURE_USERS, loadEnvOrExit,
  type FixtureUserKey,
} from "./fixtures-f0";
import { allocateQty, productBackOf, type Product, type NomType } from "../lib/nox/pay";

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

  // ══════════════════════════════════════════════════════════
  // F1b: 会計ゴールデン（固定シナリオ）＋冪等3種＋TS/DB 一致（mig0006/0007）
  // シナリオ: 卓 open（3名・hon）→ 指名 A:B=6:4 → 指名ドリンク(rate50%,1500)×3 ＋
  //           シャンパン(unit4 hon7000,30000)×1（group A）＋ セット15000（group B）
  //           → total 54400（A: 34500+3450→37900 / B: 15000+1500→16500）
  //           → cash 20000 ＋ card 17900（A）・ar 16500（B）→ close
  //           → backs: A={drink1500,champ7000,pt14} B={drink750,pt2}
  // ══════════════════════════════════════════════════════════
  let castIdA = "";
  let castIdB = "";
  {
    const c = await signIn("managerA1");
    const { data: castRows } = await c.from("casts").select("id, name");
    castIdA = (castRows ?? []).find((r) => r.name === FIXTURE_USERS.castA1a.name)?.id as string;
    castIdB = (castRows ?? []).find((r) => r.name === FIXTURE_USERS.castA1b.name)?.id as string;

    // 再実行耐性: 残置 open 伝票を void
    const { data: leftovers } = await c.from("checks").select("id").eq("seat_id", seatId).eq("status", "open");
    for (const lo of leftovers ?? []) {
      await c.rpc("check_void", { p_check_id: lo.id, p_reason: "verify cleanup" });
    }

    // シャンパン（unit4）商品を用意
    const { data: stores } = await c.from("stores").select("id, name").eq("name", STORE_A1);
    const storeA1 = stores?.[0]?.id as string;
    const { data: champId, error: eCh } = await c.rpc("set_product", {
      p_id: null, p_store_id: storeA1, p_type: "champ", p_category: "シャンパン",
      p_name: "NOX-VERIFY-シャンパン", p_price: 30_000, p_cost: 9000,
      p_back_mode: "unit4", p_back_value: null,
      p_unit4: { hon: 7000, jonai: 6000, dohan: 6000, free: 5000 }, p_hon_pt: 10, p_is_active: true,
    });
    check("F1b シャンパン商品 作成", !eCh && typeof champId === "string", eCh?.message);

    // open ＋ 二重 open（冪等①）
    const { data: checkId, error: eO } = await c.rpc("check_open", { p_seat_id: seatId, p_people: 3, p_nom_type: "hon" });
    check("F1b check_open 成功", !eO && typeof checkId === "string", eO?.message);
    const { data: checkId2 } = await c.rpc("check_open", { p_seat_id: seatId, p_people: 3, p_nom_type: "hon" });
    check("F1b open 二重実行＝同一 id（冪等）", checkId === checkId2, `got ${checkId2}`);

    const { error: eN } = await c.rpc("check_set_nominations", {
      p_check_id: checkId, p_nom_type: "hon",
      p_nominations: [{ cast_id: castIdA, weight: 6 }, { cast_id: castIdB, weight: 4 }],
    });
    check("F1b set_nominations 成功", !eN, eN?.message);

    const { error: eL1 } = await c.rpc("check_add_line", { p_check_id: checkId, p_product_id: productId, p_qty: 3, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
    const { error: eL2 } = await c.rpc("check_add_line", { p_check_id: checkId, p_product_id: champId, p_qty: 1, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
    const { error: eL3 } = await c.rpc("check_add_line", { p_check_id: checkId, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "B", p_name: "セット", p_unit_price: 15_000 });
    check("F1b 明細3行 追加", !eL1 && !eL2 && !eL3, [eL1, eL2, eL3].map((e) => e?.message).join(" / "));

    const { data: chk1 } = await c.from("checks").select("total, status").eq("id", checkId).single();
    check("F1b ゴールデン total=54400（サ料10%・100円切捨・group 単位）", chk1?.total === 54_400, `got ${chk1?.total}`);

    // 入金不足 close 拒否
    const { error: eC0 } = await c.rpc("check_close", { p_check_id: checkId, p_idem_key: randomUUID() });
    check("F1b 入金不足 close 拒否", !!eC0?.message?.includes("balance remaining"), eC0?.message ?? "通ってしまった");

    // 冪等②: pay 同一キー再送
    const k1 = randomUUID();
    const { data: pay1 } = await c.rpc("check_pay", { p_check_id: checkId, p_method: "cash", p_amount: 20_000, p_pay_group: "A", p_tendered: 20_000, p_idem_key: k1 });
    const { data: pay1b } = await c.rpc("check_pay", { p_check_id: checkId, p_method: "cash", p_amount: 20_000, p_pay_group: "A", p_tendered: 20_000, p_idem_key: k1 });
    check("F1b pay 同一キー再送＝同一 id", typeof pay1 === "string" && pay1 === pay1b, `${pay1} vs ${pay1b}`);
    const { data: pcnt } = await c.from("payments").select("id").eq("check_id", checkId);
    check("F1b 再送で payments が増えない（1行）", (pcnt ?? []).length === 1, `got ${(pcnt ?? []).length}`);

    // tendered 検証・残額超過
    const { error: eT } = await c.rpc("check_pay", { p_check_id: checkId, p_method: "cash", p_amount: 1000, p_pay_group: "A", p_tendered: 500, p_idem_key: null });
    check("F1b tendered < amount 拒否", !!eT?.message?.includes("bad tendered"), eT?.message ?? "通ってしまった");
    const { error: eEx } = await c.rpc("check_pay", { p_check_id: checkId, p_method: "card", p_amount: 18_000, p_pay_group: "A", p_tendered: null, p_idem_key: null });
    check("F1b group 残額超過 拒否", !!eEx?.message?.includes("exceeds balance"), eEx?.message ?? "通ってしまった");

    const { error: eP2 } = await c.rpc("check_pay", { p_check_id: checkId, p_method: "card", p_amount: 17_900, p_pay_group: "A", p_tendered: null, p_idem_key: randomUUID() });
    const { error: eP3 } = await c.rpc("check_pay", { p_check_id: checkId, p_method: "ar", p_amount: 16_500, p_pay_group: "B", p_tendered: null, p_idem_key: randomUUID() });
    check("F1b card/ar 入金 成功", !eP2 && !eP3, [eP2, eP3].map((e) => e?.message).join(" / "));
    const { data: recv1 } = await c.from("receivables").select("status, cast_id, amount").eq("check_id", checkId);
    check(
      "F1b 売掛 receivable 生成（open・先頭指名・16500）",
      (recv1 ?? []).length === 1 && recv1?.[0]?.status === "open" && recv1?.[0]?.cast_id === castIdA && recv1?.[0]?.amount === 16_500,
      JSON.stringify(recv1),
    );

    // close ＋ 冪等③（同一キー再送=成功・別キー=not open）
    const kc = randomUUID();
    const { data: cl1, error: eC1 } = await c.rpc("check_close", { p_check_id: checkId, p_idem_key: kc });
    check("F1b close 成功", !eC1 && cl1 === checkId, eC1?.message);
    const { data: cl2, error: eC2 } = await c.rpc("check_close", { p_check_id: checkId, p_idem_key: kc });
    check("F1b close 同一キー再送＝成功", !eC2 && cl2 === checkId, eC2?.message);
    const { error: eC3 } = await c.rpc("check_close", { p_check_id: checkId, p_idem_key: randomUUID() });
    check("F1b close 別キー＝not open", !!eC3?.message?.includes("not open"), eC3?.message ?? "通ってしまった");

    // ゴールデン: Σpayments・cast 別バック
    const { data: pays } = await c.from("payments").select("amount").eq("check_id", checkId);
    check("F1b Σpayments=54400", (pays ?? []).reduce((a, p) => a + p.amount, 0) === 54_400);
    const { data: backs } = await c.from("check_cast_backs").select("cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc").eq("check_id", checkId);
    const bA = (backs ?? []).find((b) => b.cast_id === castIdA);
    const bB = (backs ?? []).find((b) => b.cast_id === castIdB);
    check("F1b ゴールデン backs A={1500,7000,0,pt14}",
      bA?.drink_back === 1500 && bA?.champ_back === 7000 && bA?.bottle_back === 0 && bA?.hon_pt_alloc === 14,
      JSON.stringify(bA));
    check("F1b ゴールデン backs B={750,0,0,pt2}",
      bB?.drink_back === 750 && bB?.champ_back === 0 && bB?.bottle_back === 0 && bB?.hon_pt_alloc === 2,
      JSON.stringify(bB));

    // TS/DB 一致: allocateQty＋productBackOf で同一入力から再計算し DB と照合（F1c 同値保証）
    {
      const { data: lines } = await c.from("check_lines").select("kind, qty, unit_price_snapshot, back_snapshot").eq("check_id", checkId);
      const weights = [6, 4];
      const castIds = [castIdA, castIdB];
      const nomType: NomType = "hon";
      const expected: Record<string, { drink: number; champ: number; bottle: number; pt: number }> = {
        [castIdA]: { drink: 0, champ: 0, bottle: 0, pt: 0 },
        [castIdB]: { drink: 0, champ: 0, bottle: 0, pt: 0 },
      };
      let sumOk = true;
      for (const line of lines ?? []) {
        const bs = line.back_snapshot as { back_mode: "rate" | "unit4"; back_value: number | null; unit4: Record<NomType, number> | null; hon_pt: number } | null;
        if (!bs || !["drink", "champ", "bottle"].includes(line.kind)) continue;
        const prod = {
          id: "x", name: "x", price: line.unit_price_snapshot, rate: bs.back_value ?? 0,
          backMode: bs.back_mode, unit4: bs.unit4 ?? { hon: 0, jonai: 0, dohan: 0, free: 0 }, type: line.kind,
        } as Product;
        const unit = productBackOf(prod, nomType, 1);
        const alloc = allocateQty(line.qty, weights);
        // Σ整合（条件2）: Σ分配額 = 単価×qty
        if (alloc.reduce((a, k) => a + unit * k, 0) !== unit * line.qty) sumOk = false;
        alloc.forEach((k, i) => {
          const e = expected[castIds[i]];
          e[line.kind as "drink" | "champ" | "bottle"] += unit * k;
          e.pt += bs.hon_pt * k; // nomType='hon' のシナリオ
        });
      }
      check("F1b Σ分配額=単価×qty（恒等・全行）", sumOk, "line 単位の分配合計が総額と不一致");
      check("F1b TS/DB 一致（castA1a）",
        expected[castIdA].drink === bA?.drink_back && expected[castIdA].champ === bA?.champ_back && expected[castIdA].pt === bA?.hon_pt_alloc,
        JSON.stringify(expected[castIdA]));
      check("F1b TS/DB 一致（castA1b）",
        expected[castIdB].drink === bB?.drink_back && expected[castIdB].champ === bB?.champ_back && expected[castIdB].pt === bB?.hon_pt_alloc,
        JSON.stringify(expected[castIdB]));
    }
    await c.auth.signOut();
  }

  // F1b: cast プライバシー（パターン2=0行・パターン1=自分の行のみ）
  {
    const c = await signIn("castA1a");
    for (const table of ["checks", "check_lines", "payments", "check_nominations", "receivables"]) {
      const { data, error } = await c.from(table).select("id");
      check(`F1b castA1a ${table} = 0行（パターン2）`, !error && (data ?? []).length === 0, error?.message ?? `got ${(data ?? []).length}`);
    }
    const { data: myBacks } = await c.from("check_cast_backs").select("cast_id, drink_back, champ_back, hon_pt_alloc");
    check("F1b castA1a check_cast_backs = 自分の行のみ（パターン1）",
      (myBacks ?? []).length >= 1 && (myBacks ?? []).every((b) => b.cast_id === castIdA),
      JSON.stringify(myBacks));
    await c.auth.signOut();
  }

  // F1b: void 連動（open 売掛→voided・幻影バック消滅・settled 拒否・open→void）
  {
    const c = await signIn("managerA1");
    // check2: ar 込みで close → void → 連動確認
    const { data: check2 } = await c.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "jonai" });
    await c.rpc("check_set_nominations", { p_check_id: check2, p_nom_type: "jonai", p_nominations: [{ cast_id: castIdA, weight: 1 }] });
    await c.rpc("check_add_line", { p_check_id: check2, p_product_id: productId, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
    await c.rpc("check_pay", { p_check_id: check2, p_method: "ar", p_amount: 3300, p_pay_group: "A", p_tendered: null, p_idem_key: randomUUID() });
    await c.rpc("check_close", { p_check_id: check2, p_idem_key: randomUUID() });
    const { data: b2 } = await c.from("check_cast_backs").select("id").eq("check_id", check2);
    check("F1b check2 close で backs 生成", (b2 ?? []).length === 1, `got ${(b2 ?? []).length}`);
    const { error: eV2 } = await c.rpc("check_void", { p_check_id: check2, p_reason: "検証取消" });
    check("F1b closed→void 成功", !eV2, eV2?.message);
    const { data: chk2 } = await c.from("checks").select("status").eq("id", check2).single();
    const { data: recv2 } = await c.from("receivables").select("status").eq("check_id", check2);
    const { data: b2after } = await c.from("check_cast_backs").select("id").eq("check_id", check2);
    check("F1b void で status=void", chk2?.status === "void");
    check("F1b void 連動: 売掛 open→voided", (recv2 ?? []).length === 1 && recv2?.[0]?.status === "voided", JSON.stringify(recv2));
    check("F1b void で幻影バック消滅（0行）", (b2after ?? []).length === 0, `got ${(b2after ?? []).length}`);

    // check3: 回収済み売掛は void 拒否
    const { data: check3 } = await c.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    await c.rpc("check_add_line", { p_check_id: check3, p_product_id: productId, p_qty: 1, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
    await c.rpc("check_pay", { p_check_id: check3, p_method: "ar", p_amount: 1600, p_pay_group: "A", p_tendered: null, p_idem_key: randomUUID() });
    await c.rpc("check_close", { p_check_id: check3, p_idem_key: randomUUID() });
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: eCol } = await admin.from("receivables").update({ status: "collected" }).eq("check_id", check3);
    check("F1b（準備）売掛を collected に", !eCol, eCol?.message);
    const { error: eV3 } = await c.rpc("check_void", { p_check_id: check3, p_reason: "検証" });
    check("F1b 回収済み売掛あり＝void 拒否", !!eV3?.message?.includes("receivable settled"), eV3?.message ?? "通ってしまった");

    // check4: 空 open → void（誤開卓の解放）
    const { data: check4 } = await c.rpc("check_open", { p_seat_id: seatId, p_people: null, p_nom_type: "free" });
    const { error: eV4 } = await c.rpc("check_void", { p_check_id: check4, p_reason: "誤って開けた" });
    const { data: chk4 } = await c.from("checks").select("status").eq("id", check4).single();
    check("F1b 空 open→void 成功（卓解放）", !eV4 && chk4?.status === "void", eV4?.message ?? chk4?.status);
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
