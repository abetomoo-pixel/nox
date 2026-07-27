/*
 * seed:demo — デモ用データ投入（dev 専用・seed:f0 とは完全分離）
 *   npm run seed:demo            … 既存のデモ org があれば no-op（何もしない）
 *   npm run seed:demo -- --reset … デモ org を全消しして再投入
 *
 * ★dev 専用。本番では実行しない（CLAUDE.md 規約・seed:f0 と同列）。
 * ★seed:f0 は一切変更しない。prefix も別（NOX-DEMO / CLUB NOX）＝verify org と衝突しない。
 *
 * 作るもの:
 *   org「NOX-DEMO」/ store「CLUB NOX」
 *   owner = abetomoo@gmail.com（★既存 auth アカウントに結線するだけ・新規 auth は作らない）
 *   黒服2名（can_register=true・1名は can_crm も true）＝seed:demo が auth を作る（SEED_PASSWORD）
 *   キャスト6名（comp は seed:f0 の型流用＝employment のみ）
 *   カテゴリ8本 / 商品38件（原価・発注点つき・シャンパンは unit4）/ 席8卓 / 初期在庫（reason='入荷'）
 *   伝票履歴（直近7日・1日3〜5卓・指名散らし・大半 closed・当日 open 2卓）
 *
 * ★伝票は「実 RPC」で作る（check_open→check_add_line→check_set_nominations→check_pay→check_close）。
 *   黒服（can_register=true）セッションで呼ぶ＝在庫トリガ（stock_logs の sale）・バック（check_cast_backs）・
 *   check_recalc が本物の経路で入る。日付だけは RPC 実行後に service で started_at/closed_at を調整する
 *   （verify の rewind と同型＝「生成は実 RPC・時刻だけ後付け」）。
 * ★マスタ（org/store/users/casts/カテゴリ/商品/席/在庫）は service 直 INSERT（seed:f0 と同型）。
 *   owner の auth パスワードは開発側が保持しないため owner セッションでは RPC を叩けない＝結線のみ。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loadEnvOrExit } from "./fixtures-f0";
import {
  DEMO_ORG, DEMO_STORE, DEMO_OWNER_EMAIL, DEMO_OWNER_NAME,
  DEMO_STAFF, DEMO_CASTS, DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_SEATS,
} from "./fixtures-demo";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

const RESET = process.argv.slice(2).includes("--reset");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function die(msg: string, err?: unknown): never {
  console.error(`✗ ${msg}`, err ?? "");
  process.exit(1);
}

/** 再現性のための決定的な擬似乱数（seed 固定＝毎回同じデモ内容になる） */
let rngState = 20260727;
const rnd = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length];
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

async function findAuthIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) die("listUsers 失敗", error);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureAuthUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: env.SEED_PASSWORD, email_confirm: true,
  });
  if (!error && data.user) return data.user.id;
  const found = await findAuthIdByEmail(email);
  if (found) return found;
  die(`auth ユーザー作成も検索も失敗: ${email}`, error);
}

async function wipeDemo(orgId: string, storeIds: string[]) {
  const del = async (table: string, col: string, ids: string[]) => {
    if (!ids.length) return;
    const { error } = await admin.from(table).delete().in(col, ids);
    if (error) die(`${table} 削除失敗`, error);
  };
  // FK 順（seed:f0 の削除順を踏襲＝参照する側から）
  await del("audit_logs", "org_id", [orgId]);
  await del("daily_reports", "org_id", [orgId]);
  await del("check_cast_backs", "org_id", [orgId]);
  await del("check_nominations", "org_id", [orgId]);
  await del("payments", "org_id", [orgId]);
  await del("receivables", "org_id", [orgId]);
  await del("check_seats", "org_id", [orgId]);
  await del("check_lines", "org_id", [orgId]);
  await del("checks", "org_id", [orgId]);
  await del("stock_logs", "org_id", [orgId]);
  await del("bottle_keeps", "org_id", [orgId]);
  await del("customers", "org_id", [orgId]);
  await del("punches", "org_id", [orgId]);
  await del("attendance", "org_id", [orgId]);
  await del("shifts", "org_id", [orgId]);
  await del("shift_wishes", "org_id", [orgId]);
  await del("staffing_needs", "org_id", [orgId]);
  await del("payment_records", "org_id", [orgId]);
  await del("payslips", "org_id", [orgId]);
  await del("payroll_runs", "org_id", [orgId]);
  await del("advances", "org_id", [orgId]);
  await del("transport", "org_id", [orgId]);
  await del("attendance_incentives", "org_id", [orgId]);
  await del("cast_plan", "org_id", [orgId]);
  await del("cast_norms", "org_id", [orgId]);
  await del("cast_tax_profiles", "org_id", [orgId]);
  await del("cast_sensitive", "org_id", [orgId]);
  await del("comp_plans", "org_id", [orgId]);
  await del("deductions", "org_id", [orgId]);
  await del("penalty_config", "org_id", [orgId]);
  await del("custom_back_defs", "org_id", [orgId]);
  await del("casts", "org_id", [orgId]);
  await del("memberships", "store_id", storeIds);
  await del("users", "org_id", [orgId]);
  await del("product_costs", "org_id", [orgId]);
  await del("products", "org_id", [orgId]);
  await del("product_categories", "org_id", [orgId]);
  await del("seats", "org_id", [orgId]);
  await del("stores", "org_id", [orgId]);
  await del("orgs", "id", [orgId]);
}

async function main() {
  // ── 0. 既存デモ org の検出（再実行は no-op・--reset のときだけ作り直す）──
  const { data: existing } = await admin.from("orgs").select("id").eq("name", DEMO_ORG).maybeSingle();
  if (existing && !RESET) {
    console.log(`seed:demo: デモ org「${DEMO_ORG}」は既に存在します＝何もしません（no-op）。`);
    console.log("  作り直すには: npm run seed:demo -- --reset");
    return;
  }
  if (existing) {
    const { data: sts } = await admin.from("stores").select("id").eq("org_id", existing.id);
    await wipeDemo(existing.id as string, (sts ?? []).map((s) => s.id as string));
    console.log("  --reset: 既存デモ org を全消ししました");
  }

  // ── 1. auth（owner は既存を結線するだけ・黒服は作る）──
  const ownerAuthId = await findAuthIdByEmail(DEMO_OWNER_EMAIL);
  if (!ownerAuthId) {
    die(`owner の auth アカウントが見つかりません: ${DEMO_OWNER_EMAIL}\n`
      + "  ★本スクリプトは owner の auth を新規作成しません（裁定(a)＝既存アカウントに結線）。\n"
      + "  先に Supabase 側で当該アカウントを作成してから再実行してください。");
  }
  const staffAuthIds: string[] = [];
  for (const s of DEMO_STAFF) staffAuthIds.push(await ensureAuthUser(s.email));

  // ── 2. org / store ──
  const { data: org, error: eOrg } = await admin.from("orgs").insert({ name: DEMO_ORG }).select("id").single();
  if (eOrg || !org) die("orgs 投入失敗", eOrg);
  const orgId = org.id as string;

  // 価格設定はデモとして自然な値を明示（列 default のままだと指名料/セット料金が 0 で不自然なため）
  const { data: store, error: eStore } = await admin.from("stores").insert({
    org_id: orgId, name: DEMO_STORE, short: "NOX",
    hon_fee: 3000, jonai_fee: 2000, dohan_fee: 4000,
    service_rate: 10, card_tax_rate: 5, round_unit: 100, round_mode: "down",
    set_min: 60, set_fee: 5000, ext_min: 30, ext_fee: 2500, time_mode: "manual", time_per: "table",
  }).select("id").single();
  if (eStore || !store) die("stores 投入失敗", eStore);
  const storeId = store.id as string;

  // ── 3. users / memberships ──
  const userRows = [
    { org_id: orgId, auth_user_id: ownerAuthId, email: DEMO_OWNER_EMAIL, name: DEMO_OWNER_NAME },
    ...DEMO_STAFF.map((s, i) => ({ org_id: orgId, auth_user_id: staffAuthIds[i], email: s.email, name: s.name })),
  ];
  const { data: users, error: eUsers } = await admin.from("users").insert(userRows).select("id, email");
  if (eUsers || !users) die("users 投入失敗", eUsers);
  const userId = (email: string) => users.find((u) => u.email === email)!.id as string;

  const memberRows = [
    { user_id: userId(DEMO_OWNER_EMAIL), store_id: storeId, role: "owner", can_register: true, can_crm: true, can_shift: true },
    ...DEMO_STAFF.map((s) => ({
      user_id: userId(s.email), store_id: storeId, role: "staff",
      can_register: s.perms.can_register, can_crm: s.perms.can_crm, can_shift: s.perms.can_shift, // 明示値（規約7）
    })),
  ];
  const { error: eMem } = await admin.from("memberships").insert(memberRows);
  if (eMem) die("memberships 投入失敗", eMem);

  // ── 4. casts（comp は seed:f0 の型流用＝employment のみ・comp_plan は作らない）──
  const { data: casts, error: eCasts } = await admin.from("casts")
    .insert(DEMO_CASTS.map((name) => ({ org_id: orgId, store_id: storeId, name, employment: "委託", is_active: true })))
    .select("id, name");
  if (eCasts || !casts) die("casts 投入失敗", eCasts);

  // ── 5. カテゴリ8本 ──
  const { data: cats, error: eCats } = await admin.from("product_categories")
    .insert(DEMO_CATEGORIES.map((name, i) => ({ org_id: orgId, store_id: storeId, name, sort_order: (i + 1) * 10, is_active: true })))
    .select("id, name");
  if (eCats || !cats) die("product_categories 投入失敗", eCats);
  const catId = (name: string) => cats.find((c) => c.name === name)!.id as string;

  // ── 6. 商品38件（＋原価は product_costs＝台帳#40 の分離済み構造）──
  const { data: prods, error: eProds } = await admin.from("products").insert(
    DEMO_PRODUCTS.map((p) => ({
      org_id: orgId, store_id: storeId, type: p.type,
      category: null,                       // 旧 text 列は deprecated（mig0063）＝使わない
      category_id: catId(p.category),
      name: p.name, price: p.price,
      back_mode: p.unit4 ? "unit4" : "rate",
      back_value: p.unit4 ? null : 10,      // rate は 10%
      unit4_json: p.unit4 ?? null,
      hon_pt: p.honPt ?? 0,
      is_active: true,
      reorder_point: p.reorder,
    })),
  ).select("id, name, type");
  if (eProds || !prods) die("products 投入失敗", eProds);
  const prodId = (name: string) => prods.find((p) => p.name === name)!.id as string;

  const { error: eCost } = await admin.from("product_costs").insert(
    DEMO_PRODUCTS.map((p) => ({ product_id: prodId(p.name), org_id: orgId, store_id: storeId, cost: p.cost })),
  );
  if (eCost) die("product_costs 投入失敗", eCost);

  // ── 7. 席8卓 ──
  const { data: seats, error: eSeats } = await admin.from("seats").insert(
    DEMO_SEATS.map((s) => ({ org_id: orgId, store_id: storeId, name: s.name, kind: s.kind, sort_order: s.sort, is_active: true })),
  ).select("id, name");
  if (eSeats || !seats) die("seats 投入失敗", eSeats);

  // ── 8. 初期在庫（ボトル/シャンパン系のみ・reason='入荷'＝トリガ由来の sale 系と区別できる）──
  const stockRows = DEMO_PRODUCTS.filter((p) => p.type !== "drink").map((p) => ({
    org_id: orgId, store_id: storeId, product_id: prodId(p.name),
    delta: between(5, 10), reason: "入荷", by_user_id: userId(DEMO_STAFF[0].email),
  }));
  const { error: eStock } = await admin.from("stock_logs").insert(stockRows);
  if (eStock) die("stock_logs 投入失敗", eStock);

  // ── 9. 伝票履歴（★実 RPC で作る・黒服セッション）──
  const staff = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: eSign } = await staff.auth.signInWithPassword({
    email: DEMO_STAFF[0].email, password: env.SEED_PASSWORD,
  });
  if (eSign) die("黒服セッションの signIn 失敗（伝票は実 RPC で作る方針）", eSign);

  const glass = DEMO_PRODUCTS.filter((p) => p.category === "グラス");
  const bottles = DEMO_PRODUCTS.filter((p) => p.category.startsWith("ボトル"));
  const champs = DEMO_PRODUCTS.filter((p) => p.category === "シャンパン");
  const wari = DEMO_PRODUCTS.filter((p) => p.category === "割りもの");
  const foods = DEMO_PRODUCTS.filter((p) => p.category === "フード");
  const NOM = ["hon", "jonai", "dohan", "free"] as const;

  /** 1伝票を実 RPC で作る。closeAt=null なら open のまま残す（当日分） */
  const makeCheck = async (seatIdx: number, dayAgo: number, close: boolean): Promise<string | null> => {
    const seat = seats[seatIdx % seats.length];
    const nomType = pick(NOM);
    const { data: chkId, error: eOpen } = await staff.rpc("check_open", {
      p_seat_id: seat.id, p_people: between(2, 4), p_nom_type: nomType, p_customer_id: null,
    });
    if (eOpen || typeof chkId !== "string") { console.error("  check_open 失敗", eOpen?.message); return null; }

    // 指名（free 以外は 1〜2名を散らす）
    if (nomType !== "free") {
      const n = between(1, 2);
      const chosen: string[] = [];
      while (chosen.length < n) {
        const c = pick(casts).id as string;
        if (!chosen.includes(c)) chosen.push(c);
      }
      const { error: eNom } = await staff.rpc("check_set_nominations", {
        p_check_id: chkId, p_nom_type: nomType, p_nominations: chosen.map((cast_id) => ({ cast_id, weight: 1 })),
      });
      if (eNom) console.error("  check_set_nominations 失敗", eNom.message);
    }

    // セット（カスタム明細＝「セット・チャージ」カテゴリは商品を持たない運用の再現）
    await staff.rpc("check_add_line", {
      p_check_id: chkId, p_product_id: null, p_qty: 1, p_kind: "set",
      p_pay_group: "A", p_name: "セット(60分)", p_unit_price: 5000,
    });
    // 商品明細（グラス中心＋たまにボトル/シャンパン＋割りもの/フード）
    const lines: { id: string; qty: number }[] = [];
    for (let i = 0; i < between(2, 4); i++) lines.push({ id: prodId(pick(glass).name), qty: between(1, 3) });
    if (rnd() < 0.45) lines.push({ id: prodId(pick(bottles).name), qty: 1 });
    if (rnd() < 0.25) lines.push({ id: prodId(pick(champs).name), qty: 1 });
    if (rnd() < 0.6) lines.push({ id: prodId(pick(wari).name), qty: between(1, 2) });
    if (rnd() < 0.5) lines.push({ id: prodId(pick(foods).name), qty: 1 });
    for (const l of lines) {
      const { error } = await staff.rpc("check_add_line", {
        p_check_id: chkId, p_product_id: l.id, p_qty: l.qty, p_kind: null,
        p_pay_group: "A", p_name: null, p_unit_price: null,
      });
      if (error) console.error("  check_add_line 失敗", error.message);
    }

    if (!close) return chkId;

    // 会計（total＝サーバ計算の Σ_group hl＝pay_group は 'A' 単一なので due と一致）
    const { data: chk } = await admin.from("checks").select("total").eq("id", chkId).single();
    const total = (chk?.total as number) ?? 0;
    const method = rnd() < 0.55 ? "cash" : "card";
    const { error: ePay } = await staff.rpc("check_pay", {
      p_check_id: chkId, p_method: method, p_amount: total, p_pay_group: "A",
      p_tendered: method === "cash" ? Math.ceil(total / 1000) * 1000 : null,
      p_idem_key: randomUUID(), p_method_detail: method === "card" ? "stera端末" : null,
    });
    if (ePay) { console.error("  check_pay 失敗", ePay.message); return chkId; }
    const { error: eClose } = await staff.rpc("check_close", { p_check_id: chkId, p_idem_key: randomUUID() });
    if (eClose) console.error("  check_close 失敗", eClose.message);

    // ★日付だけ後付け（生成は実 RPC・時刻は service で調整＝verify の rewind と同型）
    const started = new Date(Date.now() - dayAgo * 86_400_000);
    started.setHours(20, between(0, 59), 0, 0);
    const closed = new Date(started.getTime() + between(60, 180) * 60_000);
    await admin.from("checks").update({ started_at: started.toISOString(), closed_at: closed.toISOString() }).eq("id", chkId);
    return chkId;
  };

  let closedCount = 0;
  let seatCursor = 0;
  for (let dayAgo = 7; dayAgo >= 1; dayAgo--) {
    const n = between(3, 5);
    for (let i = 0; i < n; i++) {
      const id = await makeCheck(seatCursor++, dayAgo, true);
      if (id) closedCount++;
    }
  }
  // 当日の open 2卓（滞在タイマーが動いて見えるよう started_at を少し前倒し）
  const openIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const id = await makeCheck(seatCursor++, 0, false);
    if (id) {
      openIds.push(id);
      const started = new Date(Date.now() - between(40, 110) * 60_000);
      await admin.from("checks").update({ started_at: started.toISOString() }).eq("id", id);
    }
  }

  // ── 10. audit マーカー（seed:f0 と同型・デモ判別用）──
  await admin.from("audit_logs").insert({
    org_id: orgId, store_id: storeId, action: "seed_marker", target: "seed:demo",
    before_json: null, after_json: { seeded: true, demo: true },
  });

  const { count: stockCnt } = await admin.from("stock_logs").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { count: lineCnt } = await admin.from("check_lines").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { count: backCnt } = await admin.from("check_cast_backs").select("id", { count: "exact", head: true }).eq("org_id", orgId);

  console.log("seed:demo 完了");
  console.log(`  org: ${DEMO_ORG} / store: ${DEMO_STORE}`);
  console.log(`  owner: ${DEMO_OWNER_EMAIL}（既存 auth に結線）・黒服: ${DEMO_STAFF.map((s) => s.email).join(", ")}`);
  console.log(`  casts: ${casts.length} / categories: ${cats.length} / products: ${prods.length} / seats: ${seats.length}`);
  console.log(`  checks: closed ${closedCount} + open ${openIds.length}（実 RPC 経由）`);
  console.log(`  check_lines: ${lineCnt} / check_cast_backs: ${backCnt}（実 RPC の副産物）/ stock_logs: ${stockCnt}（入荷＋sale）`);
}

main().catch((e) => die("seed:demo 異常終了", e));
