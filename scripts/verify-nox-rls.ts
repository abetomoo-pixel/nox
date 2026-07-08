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
import { addDays, bizDateOf } from "../lib/nox/biz-date";
import { groupDue } from "../lib/nox/check-calc";
import { allocDue, allocCastSales, type AllocCheck } from "../lib/nox/sales-alloc";
import { buildMatchInput, type PunchRow, type ShiftRow, type AttendanceRow } from "../lib/nox/punch-io";
import { matchPunches } from "../lib/nox/punch-match";
import { loadCastSimData, loadStoreSimData } from "../lib/nox/payroll/sim-data";

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

// セッションをユーザーごとにキャッシュ＝1 run 1認証（Supabase auth のレート制限回避）。
// 各セクションの signOut() は衛生目的でしか呼ばれず、共有セッションを殺すとキャッシュが無効化して
// 再認証→レート制限→process.exit で退職回帰テストの finally が飛び membership が壊れる事故の温床
// （2026-07-06 に発生）。そこで signOut を no-op 化してキャッシュを生かす。RLS は毎クエリで
// auth_org_id() 等を live 評価するため、キャッシュしても退職回帰（membership flip→0行）は正しく動く。
const sessionCache = new Map<FixtureUserKey, SupabaseClient>();
async function signIn(key: FixtureUserKey): Promise<SupabaseClient> {
  const cached = sessionCache.get(key);
  if (cached) return cached;
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
  // 共有セッションを保つ（signOut を無害化）＝以後 signIn(key) はキャッシュを返す
  c.auth.signOut = (async () => ({ error: null })) as typeof c.auth.signOut;
  sessionCache.set(key, c);
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
    check("ownerA memberships = org A の5行", (mems ?? []).length === 5, `got ${(mems ?? []).length}`);
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
      "managerA1 users = A1 membership 保持者5人（managerB1 不可視）",
      sameSet(await names(c, "users", "email"), [
        FIXTURE_USERS.ownerA.email,
        FIXTURE_USERS.managerA1.email,
        FIXTURE_USERS.staffA1.email,
        FIXTURE_USERS.castA1a.email,
        FIXTURE_USERS.castA1b.email,
      ]),
    );
    const { data: mems } = await c.from("memberships").select("id");
    check("managerA1 memberships = 自店5行", (mems ?? []).length === 5, `got ${(mems ?? []).length}`);
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
  let goldenCheckId = "";
  let check2Id = "";
  let check3Id = "";
  let check4Id = "";
  let storeA1Id = "";
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
    storeA1Id = storeA1;
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
    goldenCheckId = checkId as string;
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

    const { data: chk1 } = await c
      .from("checks")
      .select("total, status, service_rate, round_unit, round_mode")
      .eq("id", checkId)
      .single();
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
      const { data: lines } = await c
        .from("check_lines")
        .select("kind, qty, unit_price_snapshot, back_snapshot, pay_group, line_total")
        .eq("check_id", checkId);

      // check-calc（UI 表示用 due・register 画面の鏡像）と DB check_group_due の同値保証。
      // 内部関数は直接呼べないため、①group ごとの固定ゴールデン ②Σdue = checks.total
      // （DB 側 check_recalc = Σ check_group_due のサーバ計算値）の両面で縛る。
      const dueOf = (g: string) =>
        groupDue(
          (lines ?? []).filter((l) => l.pay_group === g).reduce((a, l) => a + l.line_total, 0),
          { service_rate: chk1!.service_rate, round_unit: chk1!.round_unit, round_mode: chk1!.round_mode },
        );
      check("F1f check-calc 同値: group A due=37900", dueOf("A") === 37_900, `got ${dueOf("A")}`);
      check("F1f check-calc 同値: group B due=16500", dueOf("B") === 16_500, `got ${dueOf("B")}`);
      check(
        "F1f check-calc 同値: Σdue = checks.total（DB サーバ計算との鏡像縛り）",
        dueOf("A") + dueOf("B") === chk1?.total,
        `${dueOf("A") + dueOf("B")} vs ${chk1?.total}`,
      );
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
    check2Id = check2 as string;
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
    check3Id = check3 as string;
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
    check4Id = check4 as string;
    const { error: eV4 } = await c.rpc("check_void", { p_check_id: check4, p_reason: "誤って開けた" });
    const { data: chk4 } = await c.from("checks").select("status").eq("id", check4).single();
    check("F1b 空 open→void 成功（卓解放）", !eV4 && chk4?.status === "void", eV4?.message ?? chk4?.status);
    await c.auth.signOut();
  }

  // ══════════════════════════════════════════════════════════
  // F1d: 勤怠・シフト（cast セルフ／盲目記録／decide 自動生成／パターン1・2）（mig0008/0009）
  // ══════════════════════════════════════════════════════════
  let wishId = "";
  {
    // ── castA1a: セルフ経路 ──
    const c = await signIn("castA1a");
    // 希望提出（自分のみ・26:00 の 24h 超表記）
    const { data: w1, error: eW } = await c.rpc("shift_wish_submit", { p_date: "2026-07-15", p_start_hm: "20:00", p_end_hm: "26:00" });
    check("F1d wish_submit 成功", !eW && typeof w1 === "string", eW?.message);
    wishId = w1 as string;
    // 管理系 RPC は cast から forbidden（punch_proxy / attendance_set / shift_set / wish_decide）
    const { error: eD } = await c.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: true });
    check("F1d cast から wish_decide 拒否", !!eD?.message?.includes("forbidden"), eD?.message ?? "通ってしまった");
    const { error: ePr } = await c.rpc("punch_proxy", { p_cast_id: castIdB, p_type: "in", p_note: null });
    check("F1d cast から punch_proxy 拒否", !!ePr?.message?.includes("forbidden"), ePr?.message ?? "通ってしまった");
    const { error: eAs } = await c.rpc("attendance_set", { p_cast_id: castIdB, p_date: "2026-07-15", p_status: "shukkin", p_eta: null, p_reason: null });
    check("F1d cast から attendance_set 拒否", !!eAs?.message?.includes("forbidden"), eAs?.message ?? "通ってしまった");
    const { error: eSs } = await c.rpc("shift_set", { p_id: null, p_cast_id: castIdA, p_date: "2026-07-15", p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned" });
    check("F1d cast から shift_set 拒否", !!eSs?.message?.includes("forbidden"), eSs?.message ?? "通ってしまった");

    // 盲目記録: in-in が両方記録される（決定1）
    const { data: p1 } = await c.rpc("punch_self", { p_type: "in", p_lat: null, p_lng: null });
    const { data: p2 } = await c.rpc("punch_self", { p_type: "in", p_lat: 35.66, p_lng: 139.7 });
    check("F1d punch_self in-in 両方成功（盲目記録）", typeof p1 === "string" && typeof p2 === "string" && p1 !== p2);
    const { data: myPunches } = await c.from("punches").select("id, type, cast_id").in("id", [p1, p2]);
    check("F1d in-in が2行とも記録", (myPunches ?? []).length === 2 && (myPunches ?? []).every((r) => r.type === "in"));

    // attendance_set_self: late+eta OK・shukkin は拒否（連絡は late/absent のみ）
    const { error: eL } = await c.rpc("attendance_set_self", { p_date: "2026-07-15", p_status: "late", p_eta: "25:30", p_reason: "電車遅延" });
    check("F1d attendance_set_self late+eta 成功", !eL, eL?.message);
    const { error: eSh } = await c.rpc("attendance_set_self", { p_date: "2026-07-15", p_status: "shukkin", p_eta: null, p_reason: null });
    check("F1d attendance_set_self shukkin 拒否", !!eSh?.message?.includes("bad status"), eSh?.message ?? "通ってしまった");

    // punches の authenticated 直 INSERT 遮断（grant 面）
    const { error: eIns } = await c.from("punches").insert({ org_id: "00000000-0000-0000-0000-000000000000", store_id: "00000000-0000-0000-0000-000000000000", cast_id: castIdA, type: "in" });
    check("F1d punches 直 INSERT 遮断", !!eIns?.message?.includes("permission denied"), eIns?.message ?? "実行できてしまった");

    // staffing_needs は cast 0行（パターン2）
    const { data: needs } = await c.from("staffing_needs").select("id");
    check("F1d castA1a staffing_needs = 0行（パターン2）", (needs ?? []).length === 0, `got ${(needs ?? []).length}`);
    await c.auth.signOut();
  }
  {
    // ── castA1b: 他 cast の行は見えない・触れない ──
    const c = await signIn("castA1b");
    const { data: wishes } = await c.from("shift_wishes").select("id");
    check("F1d castA1b から castA1a の wish 不可視（0行）", (wishes ?? []).every((w) => w.id !== wishId) && (wishes ?? []).length === 0, `got ${(wishes ?? []).length}`);
    const { data: punches } = await c.from("punches").select("id");
    check("F1d castA1b から castA1a の punches 不可視（0行）", (punches ?? []).length === 0, `got ${(punches ?? []).length}`);
    const { error: eWd } = await c.rpc("shift_wish_withdraw", { p_wish_id: wishId });
    check("F1d 他 cast の wish 取り下げ拒否", !!eWd?.message?.includes("forbidden"), eWd?.message ?? "通ってしまった");
    await c.auth.signOut();
  }
  {
    // ── managerA1: decide 自動生成・二重生成防止・staffing ──
    const c = await signIn("managerA1");
    const { data: shiftId, error: eDec } = await c.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: true });
    check("F1d wish_decide(accept) が shifts を自動生成", !eDec && typeof shiftId === "string", eDec?.message);
    const { data: sRow } = await c.from("shifts").select("status, wish_id, cast_id, start_hm, end_hm").eq("id", shiftId).single();
    check("F1d 生成 shift = planned・wish_id 来歴・内容一致",
      sRow?.status === "planned" && sRow?.wish_id === wishId && sRow?.cast_id === castIdA && sRow?.start_hm === "20:00" && sRow?.end_hm === "26:00",
      JSON.stringify(sRow));
    const { error: eDec2 } = await c.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: true });
    check("F1d 二重 decide = already decided", !!eDec2?.message?.includes("already decided"), eDec2?.message ?? "通ってしまった");
    // 部分ユニークの物理防止（service キーで直 INSERT を試みても弾かれる）
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sFull } = await admin.from("shifts").select("org_id, store_id").eq("id", shiftId).single();
    const { error: eDup } = await admin.from("shifts").insert({
      org_id: sFull!.org_id, store_id: sFull!.store_id, cast_id: castIdA,
      date: "2026-07-15", start_hm: "20:00", end_hm: "26:00", status: "planned",
      wish_id: wishId, created_by: (await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single()).data!.id,
    });
    check("F1d wish_id 部分ユニークで二重生成を物理防止", !!eDup?.message?.includes("duplicate") || !!eDup?.message?.includes("unique"), eDup?.message ?? "重複が通ってしまった");

    // staffing_needs upsert・manager 可視
    const { error: eN } = await c.rpc("set_staffing_need", { p_store_id: (await c.from("stores").select("id").eq("name", STORE_A1).single()).data!.id, p_dow: 5, p_required: 4 });
    check("F1d set_staffing_need 成功", !eN, eN?.message);
    const { data: needs } = await c.from("staffing_needs").select("dow, required");
    check("F1d manager が staffing_needs 可視", (needs ?? []).some((n) => n.dow === 5 && n.required === 4), JSON.stringify(needs));
    await c.auth.signOut();
  }

  // ══════════════════════════════════════════════════════════
  // F1f: ランキング RPC（順位/件数のみ・金額キー不在）＋ staff 開放（mig0011）
  // ※ F1e より前に置く（golden 伝票が void される前の closed 状態で件数ゴールデンを固定）
  // ══════════════════════════════════════════════════════════
  {
    const period = bizDateOf(new Date().toISOString(), "06:00").slice(0, 7);
    const RANK_KEYS = ["rank", "cast_id", "cast_name", "hon_count", "jonai_count", "dohan_count", "is_self"].sort();
    {
      const c = await signIn("castA1a");
      const { data: rows, error } = await c.rpc("get_cast_ranking", { p_store_id: storeA1Id, p_period: period });
      check("F1f ranking castA1a 呼び出し成功（2行）", !error && Array.isArray(rows) && rows.length === 2, error?.message ?? `got ${(rows ?? []).length}`);
      const rA = (rows ?? []).find((r: Record<string, unknown>) => r.cast_id === castIdA) as Record<string, unknown> | undefined;
      const rB = (rows ?? []).find((r: Record<string, unknown>) => r.cast_id === castIdB) as Record<string, unknown> | undefined;
      check("F1f ゴールデン castA1a: rank=1・hon=1・jonai=0・dohan=0",
        rA?.rank === 1 && rA?.hon_count === 1 && rA?.jonai_count === 0 && rA?.dohan_count === 0, JSON.stringify(rA));
      check("F1f ゴールデン castA1b: rank=2・hon=1", rB?.rank === 2 && rB?.hon_count === 1, JSON.stringify(rB));
      check("F1f is_self: 自分の行のみ true", rA?.is_self === true && rB?.is_self === false,
        JSON.stringify({ a: rA?.is_self, b: rB?.is_self }));
      // 金額キー不在の能動 assert（Object.keys 検査＋金額系パターン）
      const keys = Object.keys(rA ?? {}).sort();
      check("F1f 返却キー完全一致（7列のみ）", JSON.stringify(keys) === JSON.stringify(RANK_KEYS), keys.join(","));
      check("F1f 金額系キー不在", keys.every((k) => !/back|sales|amount|price|total|yen/i.test(k)), keys.join(","));
      // cast の他店 p_store_id は forbidden
      const admin2 = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: stB } = await admin2.from("stores").select("id").eq("name", STORE_B1).single();
      const { error: eX } = await c.rpc("get_cast_ranking", { p_store_id: stB!.id, p_period: period });
      check("F1f cast の他店 ranking = forbidden", !!eX?.message?.includes("forbidden"), eX?.message ?? "通ってしまった");
      await c.auth.signOut();
    }
    {
      const b = await signIn("castA1b");
      const { data: rows } = await b.rpc("get_cast_ranking", { p_store_id: storeA1Id, p_period: period });
      const rA = (rows ?? []).find((r: Record<string, unknown>) => r.cast_id === castIdA) as Record<string, unknown> | undefined;
      const rB = (rows ?? []).find((r: Record<string, unknown>) => r.cast_id === castIdB) as Record<string, unknown> | undefined;
      check("F1f castA1b 視点: 自分 true・castA1a 行 false", rB?.is_self === true && rA?.is_self === false,
        JSON.stringify({ a: rA?.is_self, b: rB?.is_self }));
      await b.auth.signOut();
    }
    {
      const s = await signIn("staffA1");
      const { data: aid, error: eA } = await s.rpc("attendance_set", {
        p_cast_id: castIdA, p_date: "2026-07-16", p_status: "shukkin", p_eta: null, p_reason: null,
      });
      check("F1f staffA1 attendance_set 成功（台帳 #24 開放）", !eA && typeof aid === "string", eA?.message);
      const { error: eP } = await s.rpc("punch_proxy", { p_cast_id: castIdA, p_type: "in", p_note: null });
      check("F1f staffA1 punch_proxy 拒否（manager 維持）", !!eP?.message?.includes("forbidden"), eP?.message ?? "通ってしまった");
      const { data: rows, error: eR } = await s.rpc("get_cast_ranking", { p_store_id: storeA1Id, p_period: period });
      check("F1f staffA1 ranking 自店成功", !eR && (rows ?? []).length === 2, eR?.message ?? `got ${(rows ?? []).length}`);
      await s.auth.signOut();
    }
  }

  // ══════════════════════════════════════════════════════════
  // F2a-2: cast 日次売上集計（mig0014・cast_sales_aggregate/get_cast_sales）
  // ★F1e より前に配置（F1e 末尾で golden を void するため・golden は closed 非 void が前提）。
  // §7-1: golden A:B=6:4 → A{37900×.6＋16500×.6=32640} B{21760}・Σ=54400=checks.total 恒等。
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const cutoff = "06:00";
    const bizDate = bizDateOf(new Date().toISOString(), cutoff);
    const { data: orgRow } = await admin.from("stores").select("org_id").eq("id", storeA1Id).single();
    const orgAId = orgRow!.org_id as string;

    // 再実行冪等: 本節の遺物（3-way check とその子行・castC）を admin で除去
    const cleanup3way = async () => {
      // 3-way check は castC 参加で識別（誤削除防止・golden 等は castC を含まない）
      const { data: cc } = await admin.from("casts").select("id").eq("store_id", storeA1Id).eq("name", "NOX-VERIFY-castC");
      const ccId = cc?.[0]?.id as string | undefined;
      if (ccId) {
        const { data: twNoms } = await admin.from("check_nominations").select("check_id").eq("cast_id", ccId);
        const twIds = (twNoms ?? []).map((r) => r.check_id as string);
        for (const id of twIds) {
          for (const tbl of ["check_cast_backs", "check_nominations", "payments", "check_lines"]) {
            await admin.from(tbl).delete().eq("check_id", id);
          }
          await admin.from("checks").delete().eq("id", id);
        }
        await admin.from("casts").delete().eq("id", ccId);
      }
    };
    await cleanup3way();

    // ── ① golden ゴールデン（manager で get_cast_sales）──
    const m = await signIn("managerA1");
    const { data: gRows, error: eG } = await m.rpc("get_cast_sales", {
      p_store_id: storeA1Id, p_from: bizDate, p_to: bizDate,
    });
    check("F2a-2 get_cast_sales 成功（manager）", !eG && Array.isArray(gRows), eG?.message);
    type SalesRow = { cast_id: string; biz_date: string; sales: number; hon: number; jonai: number; dohan: number };
    const rows = (gRows ?? []) as SalesRow[];
    const rA = rows.find((r) => r.cast_id === castIdA);
    const rB = rows.find((r) => r.cast_id === castIdB);
    check("F2a-2 ゴールデン castA1a sales=32,640（37900×.6＋16500×.6）", rA?.sales === 32_640, `got ${rA?.sales}`);
    check("F2a-2 ゴールデン castA1b sales=21,760（37900×.4＋16500×.4）", rB?.sales === 21_760, `got ${rB?.sales}`);
    const sigmaSales = rows.reduce((s, r) => s + r.sales, 0);
    check("F2a-2 Σ cast 売上=54,400＝checks.total 恒等", sigmaSales === 54_400, `got ${sigmaSales}`);
    // void 除外: check2（jonai・castA1a・due 3,300・voided）が castA1a に不算入
    //   （含まれていれば 32,640+3,300=35,940 になる）
    check("F2a-2 void 除外（check2 の 3,300 が castA1a に不算入）", rA?.sales === 32_640, `got ${rA?.sales}`);
    // フリー卓非帰属: check3（free・due 1,600・closed）が誰にも帰属しない
    //   → Σ cast 売上 54,400 に 1,600 は含まれない（含まれれば 56,000）
    check("F2a-2 フリー卓非帰属（check3 の 1,600 が Σ に不算入）", sigmaSales === 54_400, `got ${sigmaSales}`);
    // D9a カウント列（golden は hon・伝票単位で A/B とも hon=1）
    check("F2a-2 D9a カウント: castA1a hon=1/jonai=0/dohan=0", rA?.hon === 1 && rA?.jonai === 0 && rA?.dohan === 0, JSON.stringify(rA));
    check("F2a-2 D9a カウント: castA1b hon=1", rB?.hon === 1, JSON.stringify(rB));

    // ── TS/DB 同値（golden 単独・sales-alloc 鏡像）──
    const goldenMirror: AllocCheck = {
      checkId: goldenCheckId, bizDate, nomType: "hon",
      groupDues: [{ payGroup: "A", due: 37_900 }, { payGroup: "B", due: 16_500 }],
      noms: [{ castId: castIdA, weight: 6, position: 0 }, { castId: castIdB, weight: 4, position: 1 }],
    };
    const mir = allocCastSales([goldenMirror]);
    const mA = mir.find((r) => r.castId === castIdA);
    const mB = mir.find((r) => r.castId === castIdB);
    check("F2a-2 TS/DB 同値: 鏡像 castA1a（32,640/hon1）", mA?.sales === rA?.sales && mA?.hon === rA?.hon, JSON.stringify(mA));
    check("F2a-2 TS/DB 同値: 鏡像 castA1b（21,760/hon1）", mB?.sales === rB?.sales && mB?.hon === rB?.hon, JSON.stringify(mB));

    // ── allocDue の Σ保存恒等（単体）──
    const twoWay = allocDue(37_900, goldenMirror.noms);
    check("F2a-2 allocDue Σ保存（37,900）", twoWay.reduce((s, x) => s + x.part, 0) === 37_900);
    const three = allocDue(1_600, [
      { castId: "c1", weight: 1, position: 0 },
      { castId: "c2", weight: 1, position: 1 },
      { castId: "c3", weight: 1, position: 2 },
    ]);
    check("F2a-2 allocDue 3-way 剰余（534/533/533・+1 は position 最小）",
      three[0].part === 534 && three[1].part === 533 && three[2].part === 533, JSON.stringify(three));
    check("F2a-2 allocDue 3-way Σ保存（1,600）", three.reduce((s, x) => s + x.part, 0) === 1_600);

    // ── ② 3-way 剰余の DB 実測（castC を admin 作成 → 1:1:1・due 1,600）──
    const { data: ccIns } = await admin.from("casts").insert({
      org_id: orgAId, store_id: storeA1Id, name: "NOX-VERIFY-castC", is_active: true,
    }).select("id").single();
    const castIdC = ccIns!.id as string;
    const { data: twId } = await m.rpc("check_open", { p_seat_id: seatId, p_people: 3, p_nom_type: "hon" });
    // seat 上に既存 open があると同一 id が返る恐れ→ golden 等は closed 済みなので新規 open される
    await m.rpc("check_set_nominations", {
      p_check_id: twId, p_nom_type: "hon",
      p_nominations: [{ cast_id: castIdA, weight: 1 }, { cast_id: castIdB, weight: 1 }, { cast_id: castIdC, weight: 1 }],
    });
    // group due=1,600 ← bx=1,500・サ料10%→1,650・round_unit100 down→1,600
    await m.rpc("check_add_line", { p_check_id: twId, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: "3way", p_unit_price: 1_500 });
    await m.rpc("check_pay", { p_check_id: twId, p_method: "cash", p_amount: 1_600, p_pay_group: "A", p_tendered: 1_600, p_idem_key: randomUUID() });
    await m.rpc("check_close", { p_check_id: twId, p_idem_key: randomUUID() });

    const { data: gRows2 } = await m.rpc("get_cast_sales", { p_store_id: storeA1Id, p_from: bizDate, p_to: bizDate });
    const rows2 = (gRows2 ?? []) as SalesRow[];
    const r2A = rows2.find((r) => r.cast_id === castIdA);
    const r2B = rows2.find((r) => r.cast_id === castIdB);
    const r2C = rows2.find((r) => r.cast_id === castIdC);
    // +1 が position 最小（castA1a）に付く＝ A は golden 32,640 + 534、B は 21,760 + 533、C は 533
    check("F2a-2 3-way 剰余 DB: castA1a += 534（+1 は position 最小）", (r2A?.sales ?? 0) === 32_640 + 534, `got ${r2A?.sales}`);
    check("F2a-2 3-way 剰余 DB: castA1b += 533", (r2B?.sales ?? 0) === 21_760 + 533, `got ${r2B?.sales}`);
    check("F2a-2 3-way 剰余 DB: castC = 533", (r2C?.sales ?? 0) === 533, `got ${r2C?.sales}`);
    check("F2a-2 3-way Σ保存（534+533+533=1,600 が全体に加算）",
      rows2.reduce((s, r) => s + r.sales, 0) === 54_400 + 1_600, `got ${rows2.reduce((s, r) => s + r.sales, 0)}`);

    // ── ③ 期間ガード負アンカー（93日超 → 'bad range'）──
    const { error: eRange } = await m.rpc("get_cast_sales", {
      p_store_id: storeA1Id, p_from: bizDate, p_to: addDays(bizDate, 93),
    });
    check("F2a-2 期間ガード（93日超＝bad range）", !!eRange?.message?.includes("bad range"), eRange?.message ?? "通ってしまった");
    await m.auth.signOut();

    // ── ④ D6a ロール分岐 ──
    const s = await signIn("staffA1");
    const { error: eStaff } = await s.rpc("get_cast_sales", { p_store_id: storeA1Id, p_from: bizDate, p_to: bizDate });
    check("F2a-2 D6a: staff get_cast_sales 拒否", !!eStaff?.message?.includes("forbidden"), eStaff?.message ?? "通ってしまった");
    await s.auth.signOut();

    const ca = await signIn("castA1a");
    const { data: caRows, error: eCa } = await ca.rpc("get_cast_sales", { p_store_id: storeA1Id, p_from: bizDate, p_to: bizDate });
    const caR = (caRows ?? []) as SalesRow[];
    check("F2a-2 D6a: cast は本人行のみ（1 cast・castA1a）",
      !eCa && caR.length >= 1 && caR.every((r) => r.cast_id === castIdA), eCa?.message ?? JSON.stringify(caR.map((r) => r.cast_id)));
    await ca.auth.signOut();

    const b = await signIn("managerB1");
    const { error: eB } = await b.rpc("get_cast_sales", { p_store_id: storeA1Id, p_from: bizDate, p_to: bizDate });
    check("F2a-2 D6a: 他 org manager 拒否", !!eB?.message?.includes("forbidden"), eB?.message ?? "通ってしまった");
    await b.auth.signOut();

    // ── 後片付け（3-way check とその子行・castC を除去＝F1e cleanup とも二重で安全）──
    await cleanup3way();
  }

  // ══════════════════════════════════════════════════════════
  // F2a-3: 打刻突合の DB 結線（punch-io → matchPunches・mig 不要）
  // DB の生 punches/shifts/attendance（admin で punched_at 制御）→ 持ち上げ → lateN/absentN。
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const cutoff = "06:00";
    const D = "2026-07-20"; // 固定営業日（seed と衝突しない未来日）
    const { data: orgRow } = await admin.from("stores").select("org_id").eq("id", storeA1Id).single();
    const orgAId = orgRow!.org_id as string;
    const { data: mgrRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    const mgrId = mgrRow!.id as string;

    // 再実行冪等: 当日の shifts/punches/attendance を admin 除去
    const wipe = async () => {
      await admin.from("shifts").delete().eq("store_id", storeA1Id).eq("date", D);
      await admin.from("attendance").delete().eq("store_id", storeA1Id).eq("date", D);
      // punches は当日の biz 窓（D 06:00 〜 D+1 06:00 JST）
      await admin.from("punches").delete().eq("store_id", storeA1Id)
        .gte("punched_at", `${D}T06:00:00+09:00`).lt("punched_at", `2026-07-21T06:00:00+09:00`);
    };
    await wipe();

    // 確定シフト2本（A=遅刻シナリオ・B=当欠シナリオ）
    for (const cid of [castIdA, castIdB]) {
      const { error: eSh } = await admin.from("shifts").insert({
        org_id: orgAId, store_id: storeA1Id, cast_id: cid, date: D,
        start_hm: "20:00", end_hm: "25:00", status: "confirmed", created_by: mgrId,
      });
      check(`F2a-3 shift 投入（${cid === castIdA ? "A" : "B"}）`, !eSh, eSh?.message);
    }
    // A の punch（in 20:30＝遅刻30・out 翌01:00）を punched_at 制御で投入。B は punch 無し＝当欠。
    const { error: ePin } = await admin.from("punches").insert([
      { org_id: orgAId, store_id: storeA1Id, cast_id: castIdA, punched_at: `${D}T20:30:00+09:00`, type: "in", source: "manager" },
      { org_id: orgAId, store_id: storeA1Id, cast_id: castIdA, punched_at: `2026-07-21T01:00:00+09:00`, type: "out", source: "manager" },
    ]);
    check("F2a-3 punch 投入（A: in 20:30 / out 翌01:00）", !ePin, ePin?.message);

    // DB から生行を読み、punch-io → matchPunches に通す（cast ごと）
    const runCast = async (cid: string) => {
      const { data: sh } = await admin.from("shifts").select("date, start_hm, end_hm").eq("store_id", storeA1Id).eq("cast_id", cid).eq("date", D);
      const { data: at } = await admin.from("attendance").select("date, status").eq("store_id", storeA1Id).eq("cast_id", cid).eq("date", D);
      const { data: pu } = await admin.from("punches").select("punched_at, type").eq("store_id", storeA1Id).eq("cast_id", cid)
        .gte("punched_at", `${D}T06:00:00+09:00`).lt("punched_at", `2026-07-21T06:00:00+09:00`).order("punched_at");
      const built = buildMatchInput({
        cutoffHm: cutoff,
        shifts: (sh ?? []) as ShiftRow[],
        attendance: (at ?? []) as AttendanceRow[],
        punches: (pu ?? []) as PunchRow[],
      });
      return matchPunches({ ...built, config: { close: "25:00" } });
    };

    const rA = await runCast(castIdA);
    check("F2a-3 DB 結線 A: 帰属 biz_date=D・in 20:30→late30", rA.days[0]?.bizDate === D && JSON.stringify(rA.days[0]?.raw.in) === JSON.stringify({ type: "late", min: 30, act: "20:30" }), JSON.stringify(rA.days[0]));
    check("F2a-3 DB 結線 A: lateN=1/absentN=0", rA.lateN === 1 && rA.absentN === 0, JSON.stringify([rA.lateN, rA.absentN]));

    const rB = await runCast(castIdB);
    check("F2a-3 DB 結線 B: shift 有り punch 無し→absent（absentN=1）", rB.absentN === 1 && rB.lateN === 0, JSON.stringify([rB.lateN, rB.absentN]));

    // attendance 適用（B に shukkin を入れると final ok に昇格＝S3 対応表の DB 結線）
    const { error: eAt } = await admin.from("attendance").insert({
      org_id: orgAId, store_id: storeA1Id, cast_id: castIdB, date: D, status: "shukkin", source: "staff",
    });
    check("F2a-3 attendance 投入（B: shukkin）", !eAt, eAt?.message);
    const rB2 = await runCast(castIdB);
    check("F2a-3 DB 結線 B: attendance shukkin で final ok・absentN=0", rB2.absentN === 0 && rB2.days[0]?.final.type === "ok", JSON.stringify(rB2.days[0]));

    await wipe();
  }

  // ══════════════════════════════════════════════════════════
  // F2b: 機密分離（cast_sensitive）＋税務（cast_tax_profiles）（mig0015）
  // T1a 物理封鎖（grant0）・T6a 権限分岐・全閲覧ログ・平文非リーク・null 消去検出・パターン2。
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const auditCount = async (action: string, target: string): Promise<number> => {
      const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", action).eq("target", target);
      return count ?? 0;
    };
    const tgt = "cast_sensitive:" + castIdA;
    const denied = (e: { message?: string } | null) => !!e?.message?.includes("permission denied");
    const forbidden = (e: { message?: string } | null) => !!e?.message?.includes("forbidden");

    // ── manager: set 成功（採用時登録）・get 拒否（T6a）・直 SELECT 遮断・tax は可視 ──
    {
      const m = await signIn("managerA1");
      const { error: eSet } = await m.rpc("set_cast_sensitive", { p_cast_id: castIdA, p_real_name: "田中玲奈", p_birthday: "1998-04-15", p_mynumber: null });
      check("F2b manager set_cast_sensitive 成功", !eSet, eSet?.message);
      const { error: eTax } = await m.rpc("set_cast_tax_profile", { p_cast_id: castIdA, p_mode: "委託", p_invoice: "免税", p_reg_no: null });
      check("F2b manager set_cast_tax_profile 成功", !eTax, eTax?.message);
      const { error: eGet } = await m.rpc("get_cast_sensitive", { p_cast_id: castIdA });
      check("F2b T6a: manager get_cast_sensitive 拒否", forbidden(eGet), eGet?.message ?? "通ってしまった");
      const { error: eSel } = await m.from("cast_sensitive").select("cast_id").limit(1);
      check("F2b 物理封鎖: manager 直 SELECT permission denied（grant0）", denied(eSel), eSel?.message ?? "読めてしまった");
      const { data: tax } = await m.from("cast_tax_profiles").select("cast_id, mode").eq("cast_id", castIdA);
      check("F2b cast_tax_profiles: manager 可視（パターン2）", (tax ?? []).length === 1 && tax?.[0]?.mode === "委託", JSON.stringify(tax));
      await m.auth.signOut();
    }

    // ── owner: get 成功＋ログ+1・直 SELECT 遮断・平文非リーク・null 消去検出 ──
    {
      const o = await signIn("ownerA");
      const readBefore = await auditCount("read_cast_sensitive", tgt);
      const { data: g, error: eGet } = await o.rpc("get_cast_sensitive", { p_cast_id: castIdA });
      const grow = (g ?? [])[0] as { real_name?: string } | undefined;
      check("F2b T6a: owner get_cast_sensitive 成功（real_name 復元）", !eGet && grow?.real_name === "田中玲奈", eGet?.message ?? JSON.stringify(g));
      check("F2b 全閲覧ログ: owner get で read_cast_sensitive +1", (await auditCount("read_cast_sensitive", tgt)) === readBefore + 1);
      const { error: eSel } = await o.from("cast_sensitive").select("cast_id").limit(1);
      check("F2b 物理封鎖: owner 直 SELECT permission denied（grant0）", denied(eSel), eSel?.message ?? "読めてしまった");
      // 平文非リーク: set の audit after_json は fields_changed のみ・実値を含まない
      const { data: aud } = await o.from("audit_logs").select("after_json").eq("action", "set_cast_sensitive").eq("target", tgt).order("at", { ascending: false }).limit(1);
      const after0 = aud?.[0]?.after_json as { fields_changed?: string[] } | null;
      check("F2b 平文非リーク: after_json に fields_changed のみ", Array.isArray(after0?.fields_changed) && !JSON.stringify(after0).includes("田中玲奈"), JSON.stringify(after0));
      // null 消去アンカー: 実値ありの行を null 上書き → fields_changed に real_name/birthday が載る
      await o.rpc("set_cast_sensitive", { p_cast_id: castIdA, p_real_name: null, p_birthday: null, p_mynumber: null });
      const { data: audE } = await o.from("audit_logs").select("after_json").eq("action", "set_cast_sensitive").eq("target", tgt).order("at", { ascending: false }).limit(1);
      const erased = (audE?.[0]?.after_json as { fields_changed?: string[] } | null)?.fields_changed ?? [];
      check("F2b null 消去検出: fields_changed に real_name・birthday", erased.includes("real_name") && erased.includes("birthday"), JSON.stringify(erased));
      // 同値 upsert（既に null）→ fields_changed 空
      await o.rpc("set_cast_sensitive", { p_cast_id: castIdA, p_real_name: null, p_birthday: null, p_mynumber: null });
      const { data: audS } = await o.from("audit_logs").select("after_json").eq("action", "set_cast_sensitive").eq("target", tgt).order("at", { ascending: false }).limit(1);
      const same = (audS?.[0]?.after_json as { fields_changed?: string[] } | null)?.fields_changed ?? ["x"];
      check("F2b 同値 upsert: fields_changed 空", same.length === 0, JSON.stringify(same));
      await o.auth.signOut();
    }

    // ── staff: get 拒否・直 SELECT 遮断 ──
    {
      const s = await signIn("staffA1");
      const { error: eGet } = await s.rpc("get_cast_sensitive", { p_cast_id: castIdA });
      check("F2b T6a: staff get_cast_sensitive 拒否", forbidden(eGet), eGet?.message ?? "通ってしまった");
      const { error: eSel } = await s.from("cast_sensitive").select("cast_id").limit(1);
      check("F2b 物理封鎖: staff 直 SELECT permission denied", denied(eSel), eSel?.message ?? "読めてしまった");
      await s.auth.signOut();
    }

    // ── cast: 本人のみ get 成功（自己閲覧もログ+1）・他人拒否・直 SELECT 遮断・tax 0行 ──
    {
      const ca = await signIn("castA1a");
      const readBefore = await auditCount("read_cast_sensitive", tgt);
      const { data: g, error: eSelf } = await ca.rpc("get_cast_sensitive", { p_cast_id: castIdA });
      check("F2b T6a: cast 本人 get 成功", !eSelf && (g ?? []).length === 1, eSelf?.message ?? JSON.stringify(g));
      check("F2b 全閲覧ログ: cast 本人自己閲覧でも +1（例外なし）", (await auditCount("read_cast_sensitive", tgt)) === readBefore + 1);
      const { error: eOther } = await ca.rpc("get_cast_sensitive", { p_cast_id: castIdB });
      check("F2b T6a: cast 他人 get 拒否", forbidden(eOther), eOther?.message ?? "通ってしまった");
      const { error: eSel } = await ca.from("cast_sensitive").select("cast_id").limit(1);
      check("F2b 物理封鎖: cast 直 SELECT permission denied", denied(eSel), eSel?.message ?? "読めてしまった");
      const { data: tax } = await ca.from("cast_tax_profiles").select("cast_id").limit(1);
      check("F2b cast_tax_profiles: cast 0行（パターン2）", (tax ?? []).length === 0, `got ${(tax ?? []).length}`);
      await ca.auth.signOut();
    }

    // ── クロス org: managerB1 は org A の cast へ set/get 拒否・tax 0行 ──
    {
      const b = await signIn("managerB1");
      const { error: eG } = await b.rpc("get_cast_sensitive", { p_cast_id: castIdA });
      check("F2b クロス org: managerB1 get 拒否", forbidden(eG), eG?.message ?? "通ってしまった");
      const { error: eS } = await b.rpc("set_cast_sensitive", { p_cast_id: castIdA, p_real_name: "x", p_birthday: null, p_mynumber: null });
      check("F2b クロス org: managerB1 set 拒否", forbidden(eS), eS?.message ?? "通ってしまった");
      const { error: eT } = await b.rpc("set_cast_tax_profile", { p_cast_id: castIdA, p_mode: "委託", p_invoice: null, p_reg_no: null });
      check("F2b クロス org: managerB1 tax set 拒否", forbidden(eT), eT?.message ?? "通ってしまった");
      const { data: tax } = await b.from("cast_tax_profiles").select("cast_id").eq("cast_id", castIdA);
      check("F2b クロス org: managerB1 tax 0行", (tax ?? []).length === 0, `got ${(tax ?? []).length}`);
      await b.auth.signOut();
    }
  }

  // ══════════════════════════════════════════════════════════
  // F2d: mynumber 暗号化往復・末尾4桁マスク・支払調書 service 復号・reg_no・payment_records（mig0021）
  // Vault 対称鍵 pgp_sym で set(平文)→enc→get_cast_mynumber(service)=平文一致を RPC 往復で係留。
  // masked は cast 本人のみ末尾4桁・full 平文は service_role 限定・封印(grant0)は暗号化後も不変。
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: orgRow } = await admin.from("stores").select("org_id").eq("id", storeA1Id).single();
    const orgAId = orgRow!.org_id as string;
    const { data: mgrRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    const actorId = mgrRow!.id as string;
    const forbidden = (e: { message?: string } | null) => !!e?.message?.includes("forbidden");
    const blocked = (e: { message?: string } | null) => !!e?.message?.includes("permission denied for function");

    const m = await signIn("managerA1");
    const owner = await signIn("ownerA");
    const ca = await signIn("castA1a");

    // ── 暗号化往復（F2d 完了条件）: manager が平文 set → service get_cast_mynumber で平文一致 ──
    const MY = "123456789012"; // 仮マイナンバー（12桁・verify 専用）
    const { error: eSet } = await m.rpc("set_cast_sensitive", { p_cast_id: castIdA, p_real_name: "田中玲奈", p_birthday: "1998-04-15", p_mynumber: MY });
    check("F2d set_cast_sensitive(平文入力→DB 内 pgp_sym 暗号化) 成功", !eSet, eSet?.message);
    // get_cast_sensitive は mynumber_set boolean のみ（平文/enc は返さない）
    const { data: gs } = await owner.rpc("get_cast_sensitive", { p_cast_id: castIdA });
    const gsRow = ((gs ?? [])[0] ?? {}) as Record<string, unknown>;
    check("F2d get_cast_sensitive: mynumber_set=true・real_name 復元・平文/enc は非返却",
      gsRow.mynumber_set === true && gsRow.real_name === "田中玲奈" && !("mynumber_enc" in gsRow) && !("mynumber" in gsRow), JSON.stringify(gsRow));
    // service_role（admin）で full 平文復号 → 平文一致（Vault 鍵）
    const { data: full, error: eFull } = await admin.rpc("get_cast_mynumber", { p_org_id: orgAId, p_actor: actorId, p_cast_id: castIdA });
    check("F2d 往復: get_cast_mynumber(service) が平文一致（Vault 鍵で復号）", !eFull && full === MY, eFull?.message ?? `got ${full}`);
    // full 平文は service_role 限定＝authenticated（manager）は BLOCKED
    const { error: eFullM } = await m.rpc("get_cast_mynumber", { p_org_id: orgAId, p_actor: actorId, p_cast_id: castIdA });
    check("F2d get_cast_mynumber(full 平文) は service_role のみ＝manager BLOCKED", blocked(eFullM), eFullM?.message ?? "通ってしまった");
    // masked: cast 本人 → 末尾4桁のみ（先頭 ******** ・full 平文は含まない）
    const { data: mask, error: eMask } = await ca.rpc("get_cast_mynumber_masked", { p_cast_id: castIdA });
    // 先頭8桁が一切現れないことを独立に assert（!includes(MY) は12桁一致の系で常真＝非判別なので先頭8桁で判別化）。
    check("F2d masked: cast 本人が末尾4桁のみ取得（********＋下4桁・先頭8桁は非漏洩）",
      !eMask && mask === "********" + MY.slice(-4) && !String(mask).includes(MY.slice(0, 8)), eMask?.message ?? `got ${mask}`);
    // masked: cast 他人拒否
    const { error: eMaskOther } = await ca.rpc("get_cast_mynumber_masked", { p_cast_id: castIdB });
    check("F2d masked: cast 他人拒否（本人 cast_id 限定）", forbidden(eMaskOther), eMaskOther?.message ?? "通ってしまった");
    // masked: manager 拒否（cast 本人限定・owner/manager 不可）
    const { error: eMaskMgr } = await m.rpc("get_cast_mynumber_masked", { p_cast_id: castIdA });
    check("F2d masked: manager 拒否（cast 本人限定 RPC）", forbidden(eMaskMgr), eMaskMgr?.message ?? "通ってしまった");
    // ★封印不変: 暗号化後も cast_sensitive 直 SELECT は permission denied（grant0 維持）
    const { error: eSel } = await ca.from("cast_sensitive").select("cast_id").limit(1);
    check("F2d 封印不変: 暗号化後も cast 直 SELECT permission denied（grant0 維持）", !!eSel?.message?.includes("permission denied"), eSel?.message ?? "読めてしまった");

    // ── null=保持: real_name のみ更新（p_mynumber=null）で mynumber が消えない（誤消去防止）──
    const { error: eKeep } = await m.rpc("set_cast_sensitive", { p_cast_id: castIdA, p_real_name: "田中改名", p_birthday: "1998-04-15", p_mynumber: null });
    check("F2d null=保持 set 成功", !eKeep, eKeep?.message);
    const { data: full2 } = await admin.rpc("get_cast_mynumber", { p_org_id: orgAId, p_actor: actorId, p_cast_id: castIdA });
    check("F2d null=保持: p_mynumber=null の更新で mynumber は消えない（enc 温存）", full2 === MY, `got ${full2}`);

    // ── reg_no 形式チェック（^T[0-9]{13}$）──
    const { error: eBadReg } = await m.rpc("set_cast_tax_profile", { p_cast_id: castIdA, p_mode: "委託", p_invoice: "課税", p_reg_no: "T123" });
    check("F2d reg_no 形式拒否（T+13桁でない → bad reg_no）", !!eBadReg?.message?.includes("bad reg_no"), eBadReg?.message ?? "通ってしまった");
    const { error: eOkReg } = await m.rpc("set_cast_tax_profile", { p_cast_id: castIdA, p_mode: "委託", p_invoice: "課税", p_reg_no: "T1234567890123" });
    check("F2d reg_no 形式 OK（T+13桁 受理）", !eOkReg, eOkReg?.message);

    // ── payment_records: 部分支払い（Σ≤net）＋idem 冪等＋パターン1 cast 本人可視 ──
    {
      const { data: rcP } = await m.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: "2029-12" });
      const runP = ((rcP ?? [])[0] as { id: string }).id;
      const { error: eFinP } = await admin.rpc("payroll_finalize", {
        p_org_id: orgAId, p_actor: actorId, p_run_id: runP, p_idem_key: randomUUID(),
        p_payslips: [{ cast_id: castIdA, net: 10_000, breakdown: { pay: { net: 10_000 }, extras: [] } }],
      });
      check("F2d payment: 前提 run finalize（castIdA net=10000）", !eFinP, eFinP?.message);
      const idemP = randomUUID();
      const { data: pr1, error: ePr1 } = await m.rpc("payment_record_add", { p_run_id: runP, p_cast_id: castIdA, p_amount: 6_000, p_paid_at: "2030-01-10", p_method: "振込", p_note: null, p_idem_key: idemP });
      check("F2d payment: 部分支払い 6000 成功", !ePr1 && typeof pr1 === "string", ePr1?.message);
      const { data: pr1b } = await m.rpc("payment_record_add", { p_run_id: runP, p_cast_id: castIdA, p_amount: 6_000, p_paid_at: "2030-01-10", p_method: "振込", p_note: null, p_idem_key: idemP });
      check("F2d payment idem: 同一 idem_key は既存 id を返す（二重挿入なし）", pr1b === pr1, `${pr1b} vs ${pr1}`);
      const { error: eOver } = await m.rpc("payment_record_add", { p_run_id: runP, p_cast_id: castIdA, p_amount: 5_000, p_paid_at: "2030-01-11", p_method: null, p_note: null, p_idem_key: randomUUID() });
      check("F2d payment Σ≤net: 6000+5000>net(10000) で exceeds net 拒否", !!eOver?.message?.includes("exceeds net"), eOver?.message ?? "通ってしまった");
      const { error: eOk2 } = await m.rpc("payment_record_add", { p_run_id: runP, p_cast_id: castIdA, p_amount: 4_000, p_paid_at: "2030-01-11", p_method: null, p_note: null, p_idem_key: randomUUID() });
      check("F2d payment Σ≤net: 残額 4000 は成功（Σ=10000=net）", !eOk2, eOk2?.message);
      const { data: prSeen } = await ca.from("payment_records").select("paid_amount").eq("run_id", runP).order("paid_amount");
      check("F2d payment パターン1: cast 本人が自分の支払記録を可視（2件=4000+6000）",
        (prSeen ?? []).length === 2 && (prSeen ?? [])[0]?.paid_amount === 4_000 && (prSeen ?? [])[1]?.paid_amount === 6_000, JSON.stringify(prSeen));
      // 同店の別 cast（castA1b）は castIdA の支払記録を 0行（パターン1: cast_id=本人のみ）
      const cb = await signIn("castA1b");
      const { data: prX } = await cb.from("payment_records").select("id").eq("run_id", runP);
      check("F2d payment パターン1: 同店の別 cast は他人の支払記録 0行", (prX ?? []).length === 0, `got ${(prX ?? []).length}`);
      await cb.auth.signOut();
      // 掃除（FK 順: payment_records → payslips → payroll_runs）
      await admin.from("payment_records").delete().eq("run_id", runP);
      await admin.from("payslips").delete().eq("run_id", runP);
      await admin.from("payroll_runs").delete().eq("id", runP);
    }

    await m.auth.signOut();
    await owner.auth.signOut();
    await ca.auth.signOut();
    // 掃除（castIdA の cast_sensitive/tax を初期状態へ・後続ブロック非依存）
    await admin.from("cast_sensitive").delete().eq("cast_id", castIdA);
    await admin.from("cast_tax_profiles").delete().eq("cast_id", castIdA);
  }

  // ══════════════════════════════════════════════════════════
  // F2c-1: 給与確定（mig0016・payroll_runs/payslips/finalize/mark_paid/period_bounds）
  // service キーで finalize 動作アンカー＋実ユーザーで payroll_runs/payslips の RLS 物理保証。
  // 写像ゴールデン（period_bounds）＋get_cast_ranking 回帰は F1f 順位ゴールデン（上記）で係留。
  // ══════════════════════════════════════════════════════════
  {
    const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: orgRow } = await svc.from("stores").select("org_id").eq("id", storeA1Id).single();
    const orgAId = orgRow!.org_id as string;
    const { data: mgrRow } = await svc.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    const actorId = mgrRow!.id as string;
    const period = "2026-07";
    type RunRow = { id: string; status: string };
    const ps = (castId: string, net: number) => ({ cast_id: castId, net, breakdown: { pay: { net }, extras: [] } });

    // 再実行冪等: 当店の既存 run/payslips を admin 除去（FK 順: payslips → payroll_runs）
    const { data: exRuns } = await svc.from("payroll_runs").select("id").eq("store_id", storeA1Id);
    const exRunIds = (exRuns ?? []).map((r) => r.id as string);
    if (exRunIds.length) {
      await svc.from("payslips").delete().in("run_id", exRunIds);
      await svc.from("payroll_runs").delete().in("id", exRunIds);
    }

    // ── ① run_create（managerA1・戻り値 (id,status)・自然冪等）──
    const m = await signIn("managerA1");
    const { data: rc1, error: eRc1 } = await m.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: period });
    const run1 = (rc1 ?? [])[0] as RunRow | undefined;
    check("F2c run_create 成功・status=draft", !eRc1 && run1?.status === "draft" && typeof run1?.id === "string", eRc1?.message ?? JSON.stringify(rc1));
    const runId = run1!.id;
    const { data: rc2 } = await m.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: period });
    const run2 = (rc2 ?? [])[0] as RunRow | undefined;
    check("F2c run_create 冪等（同一 id・status draft を返す）", run2?.id === runId && run2?.status === "draft", JSON.stringify(run2));
    await m.auth.signOut();

    // ── ② クロス org finalize 拒否（p_org_id 不一致＝org 照合が先）──
    const { error: eXorg } = await svc.rpc("payroll_finalize", {
      p_org_id: randomUUID(), p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: [ps(castIdA, 1)],
    });
    check("F2c finalize クロス org 拒否（p_org_id 不一致→forbidden）", !!eXorg?.message?.includes("forbidden"), eXorg?.message ?? "通ってしまった");

    // ── ③ 正常 finalize（2件・原子的 insert・net 凍結・窓凍結）──
    const idem1 = randomUUID();
    const { data: fc1, error: eF1 } = await svc.rpc("payroll_finalize", {
      p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: idem1, p_payslips: [ps(castIdA, 100_000), ps(castIdB, 80_000)],
    });
    check("F2c finalize 成功（cast_count=2）", !eF1 && fc1 === 2, eF1?.message ?? `got ${fc1}`);
    const { data: rRow } = await svc.from("payroll_runs").select("status, period_start, period_end").eq("id", runId).single();
    check("F2c finalize 後 status=finalized・窓凍結（2026-07-01〜2026-07-31）",
      rRow?.status === "finalized" && rRow?.period_start === "2026-07-01" && rRow?.period_end === "2026-07-31", JSON.stringify(rRow));
    const { data: psRows } = await svc.from("payslips").select("cast_id, net, breakdown_json, paid, period").eq("run_id", runId);
    const psA = (psRows ?? []).find((p) => p.cast_id === castIdA);
    const psB = (psRows ?? []).find((p) => p.cast_id === castIdB);
    check("F2c payslips 2件・net 凍結（A=100000/B=80000）・paid=false・period 非正規化",
      (psRows ?? []).length === 2 && psA?.net === 100_000 && psB?.net === 80_000 &&
      (psRows ?? []).every((p) => p.paid === false && p.period === period), JSON.stringify(psRows));
    const bjA = psA?.breakdown_json as { pay?: { net?: number }; extras?: unknown[] } | null;
    check("F2c breakdown_json 器 = {pay, extras[]}・extras 空・net=pay.net",
      bjA?.pay?.net === 100_000 && Array.isArray(bjA?.extras) && bjA?.extras.length === 0, JSON.stringify(bjA));

    // ── ④ 冪等（同一 idem_key・finalized 済み → 既存件数を返す）──
    const { data: fRep, error: eRep } = await svc.rpc("payroll_finalize", {
      p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: idem1, p_payslips: [ps(castIdA, 100_000), ps(castIdB, 80_000)],
    });
    check("F2c finalize 冪等（同一キー・finalized → 既存件数 2）", !eRep && fRep === 2, eRep?.message ?? `got ${fRep}`);

    // ── ⑤ 空配列拒否（delete が走らない＝既存明細温存）──
    const { error: eEmpty } = await svc.rpc("payroll_finalize", {
      p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: [],
    });
    check("F2c 空配列拒否（empty payslips）", !!eEmpty?.message?.includes("empty payslips"), eEmpty?.message ?? "通ってしまった");
    const { data: psKeep } = await svc.from("payslips").select("id").eq("run_id", runId);
    check("F2c 空拒否で既存明細温存（2件維持）", (psKeep ?? []).length === 2, `got ${(psKeep ?? []).length}`);

    // ── ⑥ 混入除去（他店/不存在 cast_id は casts join で除去）──
    const bogus = randomUUID();
    const { data: fInj, error: eInj } = await svc.rpc("payroll_finalize", {
      p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: [ps(castIdA, 100_000), ps(bogus, 999_999)],
    });
    check("F2c 混入除去: 不存在 cast は casts join で除去（cast_count=1）", !eInj && fInj === 1, eInj?.message ?? `got ${fInj}`);
    const { data: psInj } = await svc.from("payslips").select("cast_id").eq("run_id", runId);
    check("F2c 混入除去: bogus cast_id 不在（castA1a のみ）", (psInj ?? []).length === 1 && psInj?.[0]?.cast_id === castIdA, JSON.stringify(psInj));

    // ── ⑦ 再確定（未paid・別キー）→ 差し替え＋旧 breakdown が audit に退避（実値一致・p_actor 記録）──
    // 差し替え前 payslips を実値キャプチャ（退避の実値一致検証用＝「行が増えた」でなく中身の一致を assert）
    type RetSlip = { cast_id: string; net: number; breakdown: unknown };
    const { data: preSwap } = await svc.from("payslips").select("cast_id, net, breakdown_json").eq("run_id", runId);
    const preNorm: RetSlip[] = (preSwap ?? []).map((p) => ({ cast_id: p.cast_id as string, net: p.net as number, breakdown: p.breakdown_json }));
    const normSlips = (arr: RetSlip[]) =>
      [...arr].sort((a, b) => a.cast_id.localeCompare(b.cast_id)).map((r) => `${r.cast_id}|${r.net}|${JSON.stringify(r.breakdown)}`).join(";");

    const idem2 = randomUUID();
    const { data: fRe, error: eRe } = await svc.rpc("payroll_finalize", {
      p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: idem2, p_payslips: [ps(castIdA, 111_000), ps(castIdB, 82_000)],
    });
    check("F2c 再確定（未paid・別キー）成功（cast_count=2 差し替え）", !eRe && fRe === 2, eRe?.message);
    const { data: psRe } = await svc.from("payslips").select("cast_id, net").eq("run_id", runId);
    check("F2c 再確定で net 差し替え（A=111000/B=82000）",
      psRe?.find((p) => p.cast_id === castIdA)?.net === 111_000 && psRe?.find((p) => p.cast_id === castIdB)?.net === 82_000, JSON.stringify(psRe));
    const { data: audRe } = await svc.from("audit_logs").select("before_json, actor_user_id")
      .eq("action", "payroll_finalize").eq("target", "payroll_runs:" + runId).order("at", { ascending: false }).limit(1);
    const beforeRe = audRe?.[0]?.before_json as { retired_payslips?: RetSlip[] } | null;
    const retired = (beforeRe?.retired_payslips ?? []) as RetSlip[];
    // 実値一致: retired_payslips が差し替え前 payslips（cast_id/net/breakdown_json）と完全一致
    check("F2c 再確定 audit: retired_payslips が差し替え前 payslips と実値一致（cast_id/net/breakdown 完全）",
      retired.length >= 1 && retired.length === preNorm.length && normSlips(retired) === normSlips(preNorm),
      `retired=${JSON.stringify(retired)} / pre=${JSON.stringify(preNorm)}`);
    check("F2c 再確定 audit: actor=managerA1（p_actor が渡した値で記録・null 固定でない）", audRe?.[0]?.actor_user_id === actorId, JSON.stringify(audRe?.[0]?.actor_user_id));

    // ── ⑧ RLS 物理保証（payroll_runs=owner/manager のみ・payslips=金額系＋staff 遮断）──
    {
      const o = await signIn("ownerA");
      const { data: oRuns } = await o.from("payroll_runs").select("id").eq("id", runId);
      check("F2c RLS payroll_runs: owner 自店可視", (oRuns ?? []).length === 1, `got ${(oRuns ?? []).length}`);
      const { data: oPs } = await o.from("payslips").select("cast_id").eq("run_id", runId);
      check("F2c RLS payslips: owner 自店全（2件）", (oPs ?? []).length === 2, `got ${(oPs ?? []).length}`);
      await o.auth.signOut();

      const mm = await signIn("managerA1");
      const { data: mRuns } = await mm.from("payroll_runs").select("id").eq("id", runId);
      check("F2c RLS payroll_runs: manager 自店可視", (mRuns ?? []).length === 1, `got ${(mRuns ?? []).length}`);
      const { data: mPs } = await mm.from("payslips").select("cast_id").eq("run_id", runId);
      check("F2c RLS payslips: manager 自店全（2件）", (mPs ?? []).length === 2, `got ${(mPs ?? []).length}`);
      await mm.auth.signOut();

      const ca = await signIn("castA1a");
      const { data: caRuns } = await ca.from("payroll_runs").select("id");
      check("F2c RLS payroll_runs: cast 0行", (caRuns ?? []).length === 0, `got ${(caRuns ?? []).length}`);
      const { data: caPs } = await ca.from("payslips").select("cast_id").eq("run_id", runId);
      check("F2c RLS payslips: cast 本人のみ（1件・castA1a）", (caPs ?? []).length === 1 && caPs?.[0]?.cast_id === castIdA, JSON.stringify(caPs));
      await ca.auth.signOut();

      const cb = await signIn("castA1b");
      const { data: cbPs } = await cb.from("payslips").select("cast_id").eq("run_id", runId);
      check("F2c RLS payslips: castA1b 本人のみ（1件・castA1b）", (cbPs ?? []).length === 1 && cbPs?.[0]?.cast_id === castIdB, JSON.stringify(cbPs));
      await cb.auth.signOut();

      const s = await signIn("staffA1");
      const { data: sRuns } = await s.from("payroll_runs").select("id");
      check("F2c RLS payroll_runs: staff 0行", (sRuns ?? []).length === 0, `got ${(sRuns ?? []).length}`);
      const { data: sPs } = await s.from("payslips").select("cast_id").eq("run_id", runId);
      check("F2c RLS payslips: staff 0行（金額系＋staff 遮断の positive assert）", (sPs ?? []).length === 0, `got ${(sPs ?? []).length}`);
      await s.auth.signOut();

      const b = await signIn("managerB1");
      const { data: bRuns } = await b.from("payroll_runs").select("id");
      check("F2c RLS payroll_runs: 他 org 0行（クロス org 拒否）", (bRuns ?? []).length === 0, `got ${(bRuns ?? []).length}`);
      const { data: bPs } = await b.from("payslips").select("cast_id");
      check("F2c RLS payslips: 他 org 0行（クロス org 拒否）", (bPs ?? []).length === 0, `got ${(bPs ?? []).length}`);
      await b.auth.signOut();
    }

    // ── ⑨ mark_paid（finalized→paid のみ・draft/paid から拒否・payslips.paid 一括）──
    // draft→paid 拒否: 別 period の draft run を用意
    const mk = await signIn("managerA1");
    const { data: rcD } = await mk.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: "2026-08" });
    const runDraftId = ((rcD ?? [])[0] as RunRow | undefined)!.id;
    await mk.auth.signOut();
    const { error: eMkDraft } = await svc.rpc("payroll_mark_paid", { p_org_id: orgAId, p_actor: actorId, p_run_id: runDraftId, p_idem_key: randomUUID() });
    check("F2c mark_paid: draft から拒否（not finalized）", !!eMkDraft?.message?.includes("not finalized"), eMkDraft?.message ?? "通ってしまった");

    const idemPaid = randomUUID();
    const { data: mkOk, error: eMk } = await svc.rpc("payroll_mark_paid", { p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: idemPaid });
    check("F2c mark_paid: finalized→paid 成功", !eMk && mkOk === "paid", eMk?.message ?? `got ${mkOk}`);
    const { data: paidRun } = await svc.from("payroll_runs").select("status").eq("id", runId).single();
    check("F2c mark_paid 後 run.status=paid", paidRun?.status === "paid", JSON.stringify(paidRun));
    const { data: paidPs } = await svc.from("payslips").select("paid").eq("run_id", runId);
    check("F2c mark_paid 後 payslips.paid 一括 true", (paidPs ?? []).length === 2 && (paidPs ?? []).every((p) => p.paid === true), JSON.stringify(paidPs));
    // 冪等: 同一キー再送 → 'paid'
    const { data: mkRep } = await svc.rpc("payroll_mark_paid", { p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: idemPaid });
    check("F2c mark_paid 冪等（同一キー→paid）", mkRep === "paid", `got ${mkRep}`);
    // paid 済み再確定拒否
    const { error: ePaidF } = await svc.rpc("payroll_finalize", {
      p_org_id: orgAId, p_actor: actorId, p_run_id: runId, p_idem_key: randomUUID(), p_payslips: [ps(castIdA, 1)],
    });
    check("F2c paid 済み再確定拒否（run paid）", !!ePaidF?.message?.includes("run paid"), ePaidF?.message ?? "通ってしまった");

    // ── ⑩ 写像ゴールデン（period_bounds・cutoff 非依存の暦月境界・不正 period 例外）──
    const { data: pb1, error: ePb1 } = await svc.rpc("period_bounds", { p_period: "2026-07" });
    const pbr1 = (pb1 ?? [])[0] as { period_start?: string; period_end?: string } | undefined;
    check("F2c period_bounds('2026-07')=(2026-07-01,2026-07-31)", !ePb1 && pbr1?.period_start === "2026-07-01" && pbr1?.period_end === "2026-07-31", JSON.stringify(pb1));
    const { data: pb2 } = await svc.rpc("period_bounds", { p_period: "2024-02" });
    const pbr2 = (pb2 ?? [])[0] as { period_start?: string; period_end?: string } | undefined;
    check("F2c period_bounds('2024-02')=(2024-02-01,2024-02-29 閏)", pbr2?.period_start === "2024-02-01" && pbr2?.period_end === "2024-02-29", JSON.stringify(pb2));
    const { error: ePbBad } = await svc.rpc("period_bounds", { p_period: "2026-13" });
    check("F2c period_bounds 不正 period 例外（bad period）", !!ePbBad?.message?.includes("bad period"), ePbBad?.message ?? "通ってしまった");

    // 後片付け（再実行耐性は冒頭 wipe が担保・ここでも掃除して他節と非干渉に）
    await svc.from("payslips").delete().in("run_id", [runId, runDraftId]);
    await svc.from("payroll_runs").delete().in("id", [runId, runDraftId]);
  }

  // ══════════════════════════════════════════════════════════
  // F2c-3: 出勤インセンティブ（mig0017・パターン3可視・発行/cancel 権限・部分ユニーク・kind 予約）
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const wipeInc = () => admin.from("attendance_incentives").delete().eq("store_id", storeA1Id).gte("biz_date", "2026-11-01").lte("biz_date", "2026-11-30");
    await wipeInc();
    const bizD = "2026-11-15";

    // manager 発行 成功・二重発行拒否・drink_boost 予約拒否
    const m = await signIn("managerA1");
    const { data: pid, error: ePub } = await m.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: bizD, p_kind: "bonus", p_amount_mode: "per_head", p_amount: 3000 });
    check("F2c-3 manager incentive_publish 成功", !ePub && typeof pid === "string", ePub?.message);
    const { error: eDup } = await m.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: bizD, p_kind: "bonus", p_amount_mode: "pooled", p_amount: 1000 });
    check("F2c-3 同日二重発行拒否（already published＝TOCTOU 修正）", !!eDup?.message?.includes("already published"), eDup?.message ?? "通ってしまった");
    const { error: eKind } = await m.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: "2026-11-16", p_kind: "drink_boost", p_amount_mode: "per_head", p_amount: 1000 });
    check("F2c-3 kind='drink_boost' 拒否（予約値・kind reserved）", !!eKind?.message?.includes("kind reserved"), eKind?.message ?? "通ってしまった");
    await m.auth.signOut();

    // パターン3 可視性: 全ロールが store の published を可視
    for (const key of ["ownerA", "managerA1", "staffA1", "castA1a"] as const) {
      const c = await signIn(key);
      const { data } = await c.from("attendance_incentives").select("id").eq("id", pid as string);
      check(`F2c-3 パターン3 可視: ${key} が published を可視`, (data ?? []).length === 1, `got ${(data ?? []).length}`);
      await c.auth.signOut();
    }

    // staff/cast は発行/cancel 不可
    const s = await signIn("staffA1");
    const { error: eS } = await s.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: "2026-11-17", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000 });
    check("F2c-3 staff incentive_publish 拒否", !!eS?.message?.includes("forbidden"), eS?.message ?? "通ってしまった");
    const { error: eSc } = await s.rpc("incentive_cancel", { p_incentive_id: pid as string });
    check("F2c-3 staff incentive_cancel 拒否", !!eSc?.message?.includes("forbidden"), eSc?.message ?? "通ってしまった");
    await s.auth.signOut();
    const ca = await signIn("castA1a");
    const { error: eCa } = await ca.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: "2026-11-17", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000 });
    check("F2c-3 cast incentive_publish 拒否", !!eCa?.message?.includes("forbidden"), eCa?.message ?? "通ってしまった");
    await ca.auth.signOut();

    // クロス org: managerB1 は org A store へ発行不可
    const b = await signIn("managerB1");
    const { error: eB } = await b.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: "2026-11-18", p_kind: "bonus", p_amount_mode: "per_head", p_amount: 1000 });
    check("F2c-3 クロス org: managerB1 が org A へ発行拒否", !!eB?.message?.includes("forbidden"), eB?.message ?? "通ってしまった");
    await b.auth.signOut();

    // cancel → 同日再発行可（部分ユニーク解放）
    const m2 = await signIn("managerA1");
    const { error: eCan } = await m2.rpc("incentive_cancel", { p_incentive_id: pid as string });
    check("F2c-3 manager incentive_cancel 成功", !eCan, eCan?.message);
    const { data: pid2, error: eRe } = await m2.rpc("incentive_publish", { p_store_id: storeA1Id, p_biz_date: bizD, p_kind: "bonus", p_amount_mode: "per_head", p_amount: 2000 });
    check("F2c-3 cancel 後 同日再発行可（部分ユニーク解放）", !eRe && typeof pid2 === "string", eRe?.message);
    await m2.auth.signOut();

    await wipeInc();
  }

  // ══════════════════════════════════════════════════════════
  // F2e-2: 前借り(advances)/送り(transport)（mig0019・パターン1・発行/取消権限・okuri_mode 排他・paid ガード・
  //         set_store_okuri_mode owner 限定）
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const forbidden = (e: { message?: string } | null) => !!e?.message?.includes("forbidden");
    const { data: sA1 } = await admin.from("stores").select("org_id").eq("name", STORE_A1).single();
    const orgAId = sA1!.org_id as string;
    const { data: mgrU } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    const actorId = mgrU!.id as string;
    const wipe = async () => {
      await admin.from("advances").delete().in("cast_id", [castIdA, castIdB]);
      await admin.from("transport").delete().in("cast_id", [castIdA, castIdB]);
    };
    await wipe();

    const owner = await signIn("ownerA");
    const m = await signIn("managerA1");
    const s = await signIn("staffA1");
    const ca = await signIn("castA1a");

    // set_store_okuri_mode: manager 拒否（owner 限定 D3a）・不正 mode 拒否
    const { error: eModeM } = await m.rpc("set_store_okuri_mode", { p_store_id: storeA1Id, p_mode: "actual" });
    check("F2e-2 set_store_okuri_mode manager 拒否（owner 限定）", forbidden(eModeM), eModeM?.message ?? "通ってしまった");
    const { error: eBadMode } = await owner.rpc("set_store_okuri_mode", { p_store_id: storeA1Id, p_mode: "bogus" });
    check("F2e-2 set_store_okuri_mode 不正 mode 拒否（bad mode）", !!eBadMode?.message?.includes("bad mode"), eBadMode?.message ?? "通ってしまった");

    // 前借り発行: manager 成功・staff/cast 拒否
    const { data: advA, error: eAdvM } = await m.rpc("adv_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 5000, p_advanced_on: "2028-01-05", p_note: null });
    check("F2e-2 manager adv_issue 成功", !eAdvM && typeof advA === "string", eAdvM?.message);
    const { data: advB } = await m.rpc("adv_issue", { p_store_id: storeA1Id, p_cast_id: castIdB, p_amount: 5000, p_advanced_on: "2028-01-05", p_note: null });
    const { error: eAdvS } = await s.rpc("adv_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 1000, p_advanced_on: "2028-01-05", p_note: null });
    check("F2e-2 staff adv_issue 拒否", forbidden(eAdvS), eAdvS?.message ?? "通ってしまった");
    const { error: eAdvC } = await ca.rpc("adv_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 1000, p_advanced_on: "2028-01-05", p_note: null });
    check("F2e-2 cast adv_issue 拒否", forbidden(eAdvC), eAdvC?.message ?? "通ってしまった");

    // 送り実費: okuri_mode='flat'（既定）は transport_issue 拒否（構造的排他 L3'）→ owner が actual 切替で成功
    const { error: eTrFlat } = await m.rpc("transport_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 3000, p_biz_date: "2028-01-05", p_note: null });
    check("F2e-2 transport_issue okuri flat 拒否（okuri not actual）", !!eTrFlat?.message?.includes("okuri not actual"), eTrFlat?.message ?? "通ってしまった");
    const { error: eModeO } = await owner.rpc("set_store_okuri_mode", { p_store_id: storeA1Id, p_mode: "actual" });
    check("F2e-2 owner set_store_okuri_mode='actual' 成功", !eModeO, eModeO?.message);
    const { data: trA, error: eTrM } = await m.rpc("transport_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 3000, p_biz_date: "2028-01-05", p_note: null });
    check("F2e-2 manager transport_issue 成功（actual 店）", !eTrM && typeof trA === "string", eTrM?.message);
    await m.rpc("transport_issue", { p_store_id: storeA1Id, p_cast_id: castIdB, p_amount: 3000, p_biz_date: "2028-01-05", p_note: null });

    // パターン1: castA1a は自分の advance/transport のみ可視（castB 不可視）
    const { data: advSeen } = await ca.from("advances").select("id, cast_id");
    check("F2e-2 パターン1: castA1a advances=自分の行のみ（castB 不可視）",
      (advSeen ?? []).length === 1 && (advSeen ?? [])[0].cast_id === castIdA, JSON.stringify(advSeen));
    const { data: trSeen } = await ca.from("transport").select("id, cast_id");
    check("F2e-2 パターン1: castA1a transport=自分の行のみ",
      (trSeen ?? []).length === 1 && (trSeen ?? [])[0].cast_id === castIdA, JSON.stringify(trSeen));

    // F2f: シミュレーターの実データ経路を本番関数（loadCastSimData/loadStoreSimData）で実検証＝inline 再実装でなく経路そのものを叩く。
    //   cast: open 前借り5000/送り3000 を pattern1 で読み（新規 RLS 不要・mig ゼロ）・masters が throw されず完走。
    const caSim = await loadCastSimData(ca);
    check("F2f loadCastSimData: castA1a の open 前借り残=5000（pattern1・sim と同一経路）", caSim.openAdv === 5000, `got ${caSim.openAdv}`);
    check("F2f loadCastSimData: castA1a の open 送り残=3000", caSim.openOkuri === 3000, `got ${caSim.openOkuri}`);
    check("F2f loadCastSimData: masters が単一店解決で完走（penalty.hoursPerShift が number）", typeof caSim.masters.penalty.hoursPerShift === "number", JSON.stringify(caSim.masters.penalty));
    // owner の store モード: store_id 明示スコープ（owner は org 全店 RLS ゆえ他店混入・maybeSingle 破綻を防ぐ）。
    //   A2 に判別用プランを admin で作り、owner の loadStoreSimData(A1) に混入しない＋throw なし完走を確認。
    const { data: sA2p } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
    const { data: a2plan } = await admin.from("comp_plans").insert({
      org_id: orgAId, store_id: sA2p!.id as string, name: "NOX-VERIFY-rlsA2plan", base: 9999,
      hon_back: 0, jonai_back: 0, dohan_back: 0, sales_slide: [], point_slide: [], is_active: true,
    }).select("id").single();
    const owSim = await loadStoreSimData(owner, storeA1Id);
    check("F2f loadStoreSimData(owner, A1): 他店(A2)プランが混入しない（store_id 明示スコープ・owner org全店RLS 対策）",
      !owSim.plans.some((p) => p.name === "NOX-VERIFY-rlsA2plan") && typeof owSim.masters.penalty.hoursPerShift === "number",
      JSON.stringify(owSim.plans.map((p) => p.name)));
    await admin.from("comp_plans").delete().eq("id", a2plan!.id as string);

    // クロス org: managerB1 は org A の advance/transport 0行＋発行拒否
    const b = await signIn("managerB1");
    const { data: advB1 } = await b.from("advances").select("id");
    const { data: trB1 } = await b.from("transport").select("id");
    check("F2e-2 クロス org: managerB1 advances/transport=0行（org A 不可視）",
      (advB1 ?? []).length === 0 && (trB1 ?? []).length === 0, JSON.stringify({ a: (advB1 ?? []).length, t: (trB1 ?? []).length }));
    const { error: eAdvB } = await b.rpc("adv_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 1000, p_advanced_on: "2028-01-05", p_note: null });
    check("F2e-2 クロス org: managerB1 adv_issue 拒否", forbidden(eAdvB), eAdvB?.message ?? "通ってしまった");

    // パターン1 他店次元（同 org・別店 A2・非 owner）: storeA2 の advance/transport を storeA1 の manager/cast は不可視。
    //   store_id=auth_store_id() 述語の回帰（他店漏洩の検出）。A2 に一時 cast＋行を admin で作り検証後に掃除。
    {
      const { data: sA2 } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
      const storeA2Id = sA2!.id as string;
      const { data: a2c } = await admin.from("casts").insert({ org_id: orgAId, store_id: storeA2Id, name: "NOX-VERIFY-rlsA2ded", is_active: true }).select("id").single();
      const a2CastId = a2c!.id as string;
      const { data: a2adv } = await admin.from("advances").insert({ org_id: orgAId, store_id: storeA2Id, cast_id: a2CastId, amount: 5000, advanced_on: "2028-01-05", status: "open", created_by: actorId }).select("id").single();
      const a2AdvId = a2adv!.id as string;
      await admin.from("transport").insert({ org_id: orgAId, store_id: storeA2Id, cast_id: a2CastId, amount: 3000, biz_date: "2028-01-05", status: "open", created_by: actorId });
      const { data: mAdv } = await m.from("advances").select("id");
      check("F2e-2 パターン1 他店: managerA1(非owner) は storeA2 の advance 不可視（他店漏洩なし）", !(mAdv ?? []).some((r) => r.id === a2AdvId), JSON.stringify((mAdv ?? []).map((r) => r.id)));
      const { data: mTr } = await m.from("transport").select("store_id").eq("store_id", storeA2Id);
      check("F2e-2 パターン1 他店: managerA1 は storeA2 の transport 0行", (mTr ?? []).length === 0, `got ${(mTr ?? []).length}`);
      const { data: caAdv2 } = await ca.from("advances").select("store_id").eq("store_id", storeA2Id);
      check("F2e-2 パターン1 他店: castA1a は storeA2 の advance 0行（cast＋他店の二重遮断）", (caAdv2 ?? []).length === 0, `got ${(caAdv2 ?? []).length}`);
      await admin.from("advances").delete().eq("cast_id", a2CastId);
      await admin.from("transport").delete().eq("cast_id", a2CastId);
      await admin.from("casts").delete().eq("id", a2CastId);
    }

    // cancel の settled 拒否（部分天引き済み）＋未天引きは成功
    await admin.from("advances").update({ deducted_amount: 1000 }).eq("id", advA as string);
    const { error: eCanSettled } = await m.rpc("adv_cancel", { p_advance_id: advA as string });
    check("F2e-2 adv_cancel settled 拒否（deducted_amount>0）", !!eCanSettled?.message?.includes("advance settled"), eCanSettled?.message ?? "通ってしまった");
    const { error: eCanOk } = await m.rpc("adv_cancel", { p_advance_id: advB as string });
    check("F2e-2 adv_cancel 未天引きは成功", !eCanOk, eCanOk?.message);

    // transport_issue paid 期間ガード（paid run を作り、その period の biz_date で拒否）
    {
      const { data: rcP } = await m.rpc("payroll_run_create", { p_store_id: storeA1Id, p_period: "2028-03" });
      const runP = ((rcP ?? [])[0] as { id: string }).id;
      await admin.rpc("payroll_finalize", { p_org_id: orgAId, p_actor: actorId, p_run_id: runP, p_idem_key: randomUUID(),
        p_payslips: [{ cast_id: castIdA, net: 0, breakdown: { pay: { net: 0 }, extras: [] } }] });
      await admin.rpc("payroll_mark_paid", { p_org_id: orgAId, p_actor: actorId, p_run_id: runP, p_idem_key: randomUUID() });
      const { error: eTrPaid } = await m.rpc("transport_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 1000, p_biz_date: "2028-03-15", p_note: null });
      check("F2e-2 transport_issue paid 期間拒否（paid period）", !!eTrPaid?.message?.includes("paid period"), eTrPaid?.message ?? "通ってしまった");
      // adv_issue も対称の paid ガード（advanced_on→period が paid なら拒否＝mig0019 の adv/transport 対称化）
      const { error: eAdvPaid } = await m.rpc("adv_issue", { p_store_id: storeA1Id, p_cast_id: castIdA, p_amount: 1000, p_advanced_on: "2028-03-15", p_note: null });
      check("F2e-2 adv_issue paid 期間拒否（paid period・transport と対称）", !!eAdvPaid?.message?.includes("paid period"), eAdvPaid?.message ?? "通ってしまった");
      await admin.from("payslips").delete().eq("run_id", runP);
      await admin.from("payroll_runs").delete().eq("id", runP);
    }

    // okuri_mode を既定 flat に戻す（共有 state リセット）＋掃除
    await owner.rpc("set_store_okuri_mode", { p_store_id: storeA1Id, p_mode: "flat" });
    await wipe();
  }

  // ══════════════════════════════════════════════════════════
  // F1e: 日報（ゴールデン・境界帰属 TS/DB 一致・p_force・冪等・reclose 追随）（mig0010）
  // ══════════════════════════════════════════════════════════
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const cutoff = "06:00";
    const bizDate = bizDateOf(new Date().toISOString(), cutoff);
    const nextDay = addDays(bizDate, 1);

    // 決定性確保: 今回 run の伝票以外と既存日報を admin で除去（再実行耐性）
    const keep = [goldenCheckId, check2Id, check3Id, check4Id].filter(Boolean);
    const { data: allChecks } = await admin.from("checks").select("id").eq("store_id", storeA1Id);
    const extras = (allChecks ?? []).map((r) => r.id as string).filter((id) => !keep.includes(id));
    if (extras.length) {
      for (const tbl of ["check_cast_backs", "check_nominations", "payments", "receivables", "check_lines"]) {
        await admin.from(tbl).delete().in("check_id", extras);
      }
      await admin.from("checks").delete().in("id", extras);
    }
    await admin.from("daily_reports").delete().eq("store_id", storeA1Id);

    // 境界2伝票（admin 直 INSERT で started_at を制御・空 closed 伝票）
    const inIso = `${nextDay}T05:59:00+09:00`;   // 当営業日に帰属すべき
    const outIso = `${nextDay}T06:00:00+09:00`;  // 翌営業日に帰属すべき
    check("F1e TS 帰属: D+1 05:59 → D", bizDateOf(inIso, cutoff) === bizDate, bizDateOf(inIso, cutoff));
    check("F1e TS 帰属: D+1 06:00 → D+1", bizDateOf(outIso, cutoff) === nextDay, bizDateOf(outIso, cutoff));
    const { data: orgRow } = await admin.from("stores").select("org_id").eq("id", storeA1Id).single();
    const { data: mgrRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    for (const iso of [inIso, outIso]) {
      const { error: eB } = await admin.from("checks").insert({
        org_id: orgRow!.org_id, store_id: storeA1Id, seat_id: seatId, status: "closed",
        started_at: iso, closed_at: iso, nom_type: "free",
        service_rate: 10, round_unit: 100, round_mode: "down", created_by: mgrRow!.id,
      });
      check(`F1e 境界伝票 INSERT（${iso}）`, !eB, eB?.message);
    }

    const c = await signIn("managerA1");
    // p_force: open 伝票（check5）を残すと既定拒否 → 強行で open_checks_count 記録
    const { data: check5 } = await c.rpc("check_open", { p_seat_id: seatId, p_people: null, p_nom_type: "free" });
    const closeArgs = {
      p_store_id: storeA1Id, p_biz_date: bizDate,
      p_expense: 3000, p_cash_payout: 3500, p_cash_float: 50_000,
      p_counted_cash: 64_000, p_note: "verify 締め",
    };
    const kClose = randomUUID();
    const { error: eNF } = await c.rpc("daily_report_close", { ...closeArgs, p_force: false, p_idem_key: kClose });
    check("F1e open 残置＝既定拒否", !!eNF?.message?.includes("open checks remain"), eNF?.message ?? "通ってしまった");
    const { data: reportId, error: eCl } = await c.rpc("daily_report_close", { ...closeArgs, p_force: true, p_idem_key: kClose });
    check("F1e p_force 強行 close 成功", !eCl && typeof reportId === "string", eCl?.message);

    // 日報ゴールデン（F1b シナリオ伝票＋境界内伝票の固定集計値）
    const { data: rep } = await c.from("daily_reports").select("*").eq("id", reportId).single();
    check("F1e ゴールデン slips=3（golden+check3+境界内）", rep?.slips === 3, `got ${rep?.slips}`);
    check("F1e ゴールデン guests=4", rep?.guests === 4, `got ${rep?.guests}`);
    check("F1e ゴールデン cash=20000", rep?.cash === 20_000, `got ${rep?.cash}`);
    check("F1e ゴールデン card_gross=17900", rep?.card_gross === 17_900, `got ${rep?.card_gross}`);
    check("F1e ゴールデン card_tax=895（5%凍結）", rep?.card_tax === 895 && rep?.card_tax_rate === 5, `got ${rep?.card_tax}/${rep?.card_tax_rate}`);
    check("F1e ゴールデン uri=18100（16500+1600）", rep?.uri === 18_100, `got ${rep?.uri}`);
    check("F1e ゴールデン drink_sales=36000", rep?.drink_sales === 36_000, `got ${rep?.drink_sales}`);
    check("F1e ゴールデン dohan_checks=0・other=0", rep?.dohan_checks === 0 && rep?.other === 0);
    check("F1e open_checks_count=1 記録（強行痕跡）", rep?.open_checks_count === 1, `got ${rep?.open_checks_count}`);
    check("F1e diff=500（counted64000−(50000+20000−3000−3500)）", rep?.diff === 500, `got ${rep?.diff}`);
    check("F1e cutoff スナップショット", rep?.biz_cutoff_hm === "06:00", rep?.biz_cutoff_hm);

    // close 冪等: 同一キー→既存 id・別キー→already closed
    const { data: replay } = await c.rpc("daily_report_close", { ...closeArgs, p_force: true, p_idem_key: kClose });
    check("F1e close 同一キー再送＝同一 id", replay === reportId, `${replay}`);
    const { error: eDup } = await c.rpc("daily_report_close", { ...closeArgs, p_force: true, p_idem_key: randomUUID() });
    check("F1e close 別キー＝already closed", !!eDup?.message?.includes("already closed"), eDup?.message ?? "通ってしまった");

    // DB 帰属: 境界外伝票は翌営業日の日報に入る（slips=1）
    const { data: repNext, error: eNx } = await c.rpc("daily_report_close", {
      p_store_id: storeA1Id, p_biz_date: nextDay, p_expense: 0, p_cash_payout: 0, p_cash_float: 0,
      p_counted_cash: null, p_note: null, p_force: false, p_idem_key: randomUUID(),
    });
    check("F1e 翌営業日 close 成功", !eNx && typeof repNext === "string", eNx?.message);
    const { data: repN } = await c.from("daily_reports").select("slips, cash").eq("id", repNext).single();
    check("F1e DB 帰属: 境界外（06:00）は翌営業日 slips=1", repN?.slips === 1 && repN?.cash === 0, JSON.stringify(repN));

    // reclose: void 追随（check5 と golden を void → 凍結 cutoff/rate で再集計）
    await c.rpc("check_void", { p_check_id: check5, p_reason: "verify 解放" });
    const { error: eVg } = await c.rpc("check_void", { p_check_id: goldenCheckId, p_reason: "verify 取消" });
    check("F1e golden void 成功（open 売掛→voided 連動）", !eVg, eVg?.message);
    const { data: reclosed, error: eRc } = await c.rpc("daily_report_reclose", { p_report_id: reportId });
    check("F1e reclose 成功", !eRc && reclosed === reportId, eRc?.message);
    const { data: rep2 } = await c.from("daily_reports").select("*").eq("id", reportId).single();
    check("F1e reclose 後 slips=2・cash=0・card=0", rep2?.slips === 2 && rep2?.cash === 0 && rep2?.card_gross === 0, JSON.stringify({ s: rep2?.slips, c: rep2?.cash }));
    check("F1e reclose 後 uri=1600・drink_sales=1500", rep2?.uri === 1600 && rep2?.drink_sales === 1500, `${rep2?.uri}/${rep2?.drink_sales}`);
    check("F1e reclose 後 open_checks_count=0・reclosed_count=1", rep2?.open_checks_count === 0 && rep2?.reclosed_count === 1);
    check("F1e reclose diff 再計算=20500", rep2?.diff === 20_500, `got ${rep2?.diff}`);
    check("F1e reclose 凍結値維持（cutoff/rate 不変）", rep2?.biz_cutoff_hm === "06:00" && rep2?.card_tax_rate === 5);
    await c.auth.signOut();
  }
  {
    // F1e 権限: owner で audit・staff 可視・cast 0行
    const c = await signIn("ownerA");
    const { data: aud } = await c
      .from("audit_logs")
      .select("before_json, after_json")
      .eq("action", "daily_report_reclose");
    const a0 = aud?.[aud.length - 1];
    check("F1e reclose audit（before slips=3 → after slips=2）",
      (a0?.before_json as { slips?: number } | null)?.slips === 3 &&
        (a0?.after_json as { slips?: number } | null)?.slips === 2,
      JSON.stringify(a0));
    await c.auth.signOut();
    const s = await signIn("staffA1");
    const { data: repsS } = await s.from("daily_reports").select("id");
    check("F1e staff 日報 可視（§1.2 report ✓）", (repsS ?? []).length >= 1, `got ${(repsS ?? []).length}`);
    const { error: eSc } = await s.rpc("daily_report_close", {
      p_store_id: storeA1Id, p_biz_date: addDays(bizDateOf(new Date().toISOString(), "06:00"), 2),
      p_expense: 0, p_cash_payout: 0, p_cash_float: 0, p_counted_cash: null, p_note: null,
      p_force: false, p_idem_key: randomUUID(),
    });
    check("F1e staff から close 拒否（manager 以上）", !!eSc?.message?.includes("forbidden"), eSc?.message ?? "通ってしまった");
    await s.auth.signOut();
    const cc = await signIn("castA1a");
    const { data: repsC } = await cc.from("daily_reports").select("id");
    check("F1e castA1a daily_reports = 0行（パターン2）", (repsC ?? []).length === 0, `got ${(repsC ?? []).length}`);
    await cc.auth.signOut();
  }

  // ══════════════════════════════════════════════════════════
  // F2a-1: 報酬マスタ（mig0012/0013）
  // 成功経路（audit 行増加込み）・D3a・D1a・staff/クロス org/退職/inactive
  // シードは本節内で RPC により投入（NOX-VERIFY-* 命名・再実行冪等・dev 専用の建付け維持）
  // ══════════════════════════════════════════════════════════
  let planAId = "";
  let planXId = ""; // 廃止プラン（inactive 負アンカー用）
  {
    const o = await signIn("ownerA");
    const auditCount = async (action: string): Promise<number> => {
      const { count } = await o.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", action);
      return count ?? 0;
    };
    const SALES_SLIDE = [{ at: 80_000, wage: 4000 }, { at: 150_000, wage: 5500 }, { at: 250_000, wage: 7000 }];
    const POINT_SLIDE = [{ at: 5, wage: 4000 }, { at: 10, wage: 5500 }, { at: 16, wage: 7000 }];

    // ① set_comp_plan 成功経路（owner・insert or update → 上書き反映 → audit +2）
    const { data: exA } = await o.from("comp_plans").select("id").eq("store_id", storeA1Id).eq("name", "NOX-VERIFY-プランA");
    const cp0 = await auditCount("set_comp_plan");
    const planArgs = {
      p_store_id: storeA1Id, p_name: "NOX-VERIFY-プランA", p_hon_back: 4000, p_jonai_back: 1500,
      p_dohan_back: 4000, p_sales_slide: SALES_SLIDE, p_point_slide: POINT_SLIDE, p_is_active: true,
    };
    const { data: pid1, error: eCp1 } = await o.rpc("set_comp_plan", { ...planArgs, p_id: exA?.[0]?.id ?? null, p_base: 5100 });
    check("F2a set_comp_plan 成功（owner）", !eCp1 && typeof pid1 === "string", eCp1?.message);
    planAId = pid1 as string;
    const { data: prow1 } = await o.from("comp_plans").select("base, name").eq("id", planAId).single();
    check("F2a comp_plans 行実在（base=5100）", prow1?.base === 5100 && prow1?.name === "NOX-VERIFY-プランA", JSON.stringify(prow1));
    const { data: pid2, error: eCp2 } = await o.rpc("set_comp_plan", { ...planArgs, p_id: planAId, p_base: 5000 });
    check("F2a set_comp_plan upsert 上書き（同一 id）", !eCp2 && pid2 === planAId, eCp2?.message);
    const { data: prow2 } = await o.from("comp_plans").select("base").eq("id", planAId).single();
    check("F2a upsert 上書き反映（base=5000）", prow2?.base === 5000, `got ${prow2?.base}`);
    check("F2a set_comp_plan audit +2", (await auditCount("set_comp_plan")) === cp0 + 2);

    // 廃止プラン（inactive）を用意
    const { data: exX } = await o.from("comp_plans").select("id").eq("store_id", storeA1Id).eq("name", "NOX-VERIFY-廃止プラン");
    const { data: pidX, error: eCpX } = await o.rpc("set_comp_plan", {
      ...planArgs, p_id: exX?.[0]?.id ?? null, p_name: "NOX-VERIFY-廃止プラン", p_base: 3000, p_is_active: false,
    });
    check("F2a 廃止プラン作成（is_active=false）", !eCpX && typeof pidX === "string", eCpX?.message);
    planXId = pidX as string;

    // ② set_penalty_config 成功経路（owner・全引数明示・grace 3列反映・audit +1）
    const pc0 = await auditCount("set_penalty_config");
    const { error: ePc } = await o.rpc("set_penalty_config", {
      p_store_id: storeA1Id, p_fine_absent: 10_000, p_fine_late: 3000, p_hours_per_shift: 5.0,
      p_norm_on: true, p_norm_days_flat: 5000, p_norm_days_per: 2000, p_norm_dohan_flat: 3000,
      p_norm_dohan_per: 1500, p_late_grace_min: 10, p_early_grace_min: 30, p_over_grace_min: 90,
    });
    check("F2a set_penalty_config 成功（owner）", !ePc, ePc?.message);
    const { data: pcRow } = await o.from("penalty_config").select("fine_absent, late_grace_min, early_grace_min, over_grace_min").eq("store_id", storeA1Id).single();
    check("F2a penalty_config 行実在（10000/10/30/90）",
      pcRow?.fine_absent === 10_000 && pcRow?.late_grace_min === 10 && pcRow?.early_grace_min === 30 && pcRow?.over_grace_min === 90,
      JSON.stringify(pcRow));
    check("F2a set_penalty_config audit +1", (await auditCount("set_penalty_config")) === pc0 + 1);
    await o.auth.signOut();
  }
  {
    const m = await signIn("managerA1");
    // audit カウント用に owner セッションを1本だけ張って使い回す（サインイン連打はレート制限に当たる）
    const o2 = await signIn("ownerA");
    const oAudit = async (action: string): Promise<number> => {
      const { count } = await o2.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", action);
      return count ?? 0;
    };

    // ③ D3a 分岐: manager から賃金原本2本は forbidden
    const { error: eD3a } = await m.rpc("set_comp_plan", {
      p_id: null, p_store_id: storeA1Id, p_name: "不正", p_base: 1, p_hon_back: 0, p_jonai_back: 0,
      p_dohan_back: 0, p_sales_slide: [], p_point_slide: [], p_is_active: true,
    });
    check("F2a D3a: manager set_comp_plan 拒否", !!eD3a?.message?.includes("forbidden"), eD3a?.message ?? "通ってしまった");
    const { error: eD3b } = await m.rpc("set_penalty_config", {
      p_store_id: storeA1Id, p_fine_absent: 0, p_fine_late: 0, p_hours_per_shift: 5,
      p_norm_on: false, p_norm_days_flat: 0, p_norm_days_per: 0, p_norm_dohan_flat: 0,
      p_norm_dohan_per: 0, p_late_grace_min: 0, p_early_grace_min: 0, p_over_grace_min: 0,
    });
    check("F2a D3a: manager set_penalty_config 拒否", !!eD3b?.message?.includes("forbidden"), eD3b?.message ?? "通ってしまった");

    // ④ set_cast_plan 成功経路（manager・castA1a→プランA・overrides 反映・audit +1）
    const scp0 = await oAudit("set_cast_plan");
    const { data: cpid, error: eScp } = await m.rpc("set_cast_plan", {
      p_cast_id: castIdA, p_plan_id: planAId, p_overrides: { honBack: 4500 },
    });
    check("F2a set_cast_plan 成功（manager）", !eScp && cpid === castIdA, eScp?.message);
    const { data: cpRow } = await m.from("cast_plan").select("plan_id, overrides_json").eq("cast_id", castIdA).single();
    check("F2a cast_plan 行実在（plan_id・overrides 反映）",
      cpRow?.plan_id === planAId && JSON.stringify(cpRow?.overrides_json) === JSON.stringify({ honBack: 4500 }),
      JSON.stringify(cpRow));
    check("F2a set_cast_plan audit +1", (await oAudit("set_cast_plan")) === scp0 + 1);

    // ⑤ inactive プランへの割当 → 'plan inactive' 拒否
    const { error: eInact } = await m.rpc("set_cast_plan", { p_cast_id: castIdA, p_plan_id: planXId, p_overrides: {} });
    check("F2a inactive プラン割当拒否（plan inactive）", !!eInact?.message?.includes("plan inactive"), eInact?.message ?? "通ってしまった");

    // ⑥ set_cast_norm 成功経路（upsert・値反映・audit +1）
    const scn0 = await oAudit("set_cast_norm");
    const { data: nid, error: eNorm } = await m.rpc("set_cast_norm", {
      p_cast_id: castIdA, p_period: "2026-07", p_days_target: 24, p_dohan_target: 15,
    });
    check("F2a set_cast_norm 成功（manager）", !eNorm && typeof nid === "string", eNorm?.message);
    const { data: nRow } = await m.from("cast_norms").select("days_target, dohan_target").eq("id", nid).single();
    check("F2a cast_norms 行実在（24/15）", nRow?.days_target === 24 && nRow?.dohan_target === 15, JSON.stringify(nRow));
    check("F2a set_cast_norm audit +1", (await oAudit("set_cast_norm")) === scn0 + 1);

    // ⑦ set_deduction 成功経路（audit +1）
    const { data: exD } = await m.from("deductions").select("id").eq("store_id", storeA1Id).eq("name", "NOX-VERIFY-送り代");
    const sd0 = await oAudit("set_deduction");
    const { data: did, error: eDed } = await m.rpc("set_deduction", {
      p_id: exD?.[0]?.id ?? null, p_store_id: storeA1Id, p_name: "NOX-VERIFY-送り代",
      p_amount: 2000, p_per: "day", p_is_active: true,
    });
    check("F2a set_deduction 成功（manager）", !eDed && typeof did === "string", eDed?.message);
    const { data: dRow } = await m.from("deductions").select("amount, per").eq("id", did).single();
    check("F2a deductions 行実在（2000/day）", dRow?.amount === 2000 && dRow?.per === "day", JSON.stringify(dRow));
    check("F2a set_deduction audit +1", (await oAudit("set_deduction")) === sd0 + 1);

    // ⑧ set_custom_back_def 成功経路（cond 深検証の成功系・audit +1）
    const { data: exB } = await m.from("custom_back_defs").select("id").eq("store_id", storeA1Id).eq("name", "NOX-VERIFY-売上2%");
    const sb0 = await oAudit("set_custom_back_def");
    const { data: bid, error: eBk } = await m.rpc("set_custom_back_def", {
      p_id: exB?.[0]?.id ?? null, p_store_id: storeA1Id, p_name: "NOX-VERIFY-売上2%",
      p_basis: "sales", p_value: 2, p_cond: { metric: "sales", min: 1_500_000 }, p_is_active: true,
    });
    check("F2a set_custom_back_def 成功（manager・cond あり）", !eBk && typeof bid === "string", eBk?.message);
    const { data: bRow } = await m.from("custom_back_defs").select("basis, value, cond_json").eq("id", bid).single();
    // jsonb はキー順を正規化する（短いキー順）ため stringify 比較でなくフィールド比較
    const bCond = bRow?.cond_json as { metric?: string; min?: number } | null;
    check("F2a custom_back_defs 行実在（sales/2/cond）",
      bRow?.basis === "sales" && bRow?.value === 2 && bCond?.metric === "sales" && bCond?.min === 1_500_000,
      JSON.stringify(bRow));
    check("F2a set_custom_back_def audit +1", (await oAudit("set_custom_back_def")) === sb0 + 1);

    // D1a: manager は comp_plans 全行（プランA＋廃止プラン）
    const { data: mPlans } = await m.from("comp_plans").select("id");
    check("F2a D1a: manager comp_plans 全行（2本以上・A/廃止 含む）",
      (mPlans ?? []).length >= 2 && !!mPlans?.find((r) => r.id === planAId) && !!mPlans?.find((r) => r.id === planXId),
      `got ${(mPlans ?? []).length}`);
    await o2.auth.signOut();
    await m.auth.signOut();
  }
  {
    // D1a: castA1a＝割当プランのみ可視・cast_plan 自分行のみ・パターン3可視
    const c = await signIn("castA1a");
    const { data: cPlans } = await c.from("comp_plans").select("id");
    check("F2a D1a: castA1a comp_plans = 自プランのみ（1行・廃止プラン不可視）",
      (cPlans ?? []).length === 1 && cPlans?.[0]?.id === planAId, `got ${(cPlans ?? []).length}`);
    const { data: cCp } = await c.from("cast_plan").select("cast_id");
    check("F2a castA1a cast_plan = 自分の1行", (cCp ?? []).length === 1 && cCp?.[0]?.cast_id === castIdA, `got ${(cCp ?? []).length}`);
    const { data: cPc } = await c.from("penalty_config").select("id");
    check("F2a castA1a penalty_config 可視（パターン3）", (cPc ?? []).length === 1, `got ${(cPc ?? []).length}`);
    await c.auth.signOut();

    // D1a: castA1b（未割当）＝comp_plans 0行・cast_plan 0行
    const c2 = await signIn("castA1b");
    const { data: c2Plans } = await c2.from("comp_plans").select("id");
    check("F2a D1a: castA1b comp_plans = 0行（未割当）", (c2Plans ?? []).length === 0, `got ${(c2Plans ?? []).length}`);
    const { data: c2Cp } = await c2.from("cast_plan").select("cast_id");
    check("F2a castA1b cast_plan = 0行", (c2Cp ?? []).length === 0, `got ${(c2Cp ?? []).length}`);
    await c2.auth.signOut();

    // staffA1: cast_plan 0行（差し戻し裁定＝賃金条件の原本は staff 遮断）
    const s = await signIn("staffA1");
    const { data: sCp } = await s.from("cast_plan").select("cast_id");
    check("F2a staffA1 cast_plan = 0行（staff 遮断）", (sCp ?? []).length === 0, `got ${(sCp ?? []).length}`);
    await s.auth.signOut();
  }
  {
    // 退職 cast: capture-and-restore で castA1a を失効 → comp_plans/cast_plan 0行 → 復元
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: urow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.castA1a.email).single();
    const castUserId = urow!.id as string;
    const { data: act } = await admin.from("memberships").select("id").eq("user_id", castUserId).eq("is_active", true);
    const capturedIds = (act ?? []).map((r) => r.id as string);
    check("F2a 退職回帰 capture: アクティブ membership ≥1", capturedIds.length >= 1, `got ${capturedIds.length}`);
    await admin.from("memberships").update({ is_active: false }).eq("user_id", castUserId);
    try {
      const c = await signIn("castA1a");
      const { data: rPlans } = await c.from("comp_plans").select("id");
      const { data: rCp } = await c.from("cast_plan").select("cast_id");
      check("F2a 退職 cast: comp_plans = 0行", (rPlans ?? []).length === 0, `got ${(rPlans ?? []).length}`);
      check("F2a 退職 cast: cast_plan = 0行", (rCp ?? []).length === 0, `got ${(rCp ?? []).length}`);
      await c.auth.signOut();
    } finally {
      if (capturedIds.length) {
        await admin.from("memberships").update({ is_active: true }).in("id", capturedIds);
      }
    }
    const c2 = await signIn("castA1a");
    const { data: rPlans2 } = await c2.from("comp_plans").select("id");
    check("F2a 退職回帰 復元後: comp_plans 再可視（1行）", (rPlans2 ?? []).length === 1, `got ${(rPlans2 ?? []).length}`);
    await c2.auth.signOut();
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
    // F2a クロス org: org A の cast への set_cast_plan は forbidden（cast org 照合）
    const { error: eX } = await c.rpc("set_cast_plan", { p_cast_id: castIdA, p_plan_id: planAId, p_overrides: {} });
    check("F2a クロス org set_cast_plan 拒否", !!eX?.message?.includes("forbidden"), eX?.message ?? "通ってしまった");
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
