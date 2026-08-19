/**
 * verify:nox-crm-base — mig0094（customers.grade＋bottle_keeps 3列＋customer_notes）の runtime 実証（段51・E8-3）
 *   実行: npm run verify:nox-crm-base（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑: 0094 の肝は (a) grade/notes/bottle の各 setter が org・店・ロールの
 *   三重ゲートを実セッションで通す/弾くこと (b) customer_notes の RLS に cast 腕が無い＝
 *   担当客のメモすら cast に不可視（裁定 E8-3-3）を実測すること。
 *
 * 段構成（指示の14系）:
 *   (1) set_grade 'vip' → 実測・audit 1行  (2) 同値再呼び → 無音・audit 不増
 *   (3) null → 無印化・audit 増  (4) 'gold' → 'bad grade'  (5) manager 他店（同 org A2 店の客）→ 'forbidden'
 *   (6) register 7引数（remaining 80・期限・棚）→ 3列実測  (7) remaining 101 → 'bad remaining'
 *   (8) 旧4引数 named 呼び → DEFAULT 埋めで正常（後方互換）
 *   (9) bottle_keep_update 素通し5値（status 'empty'）→ 実測・audit before/after
 *   (10) status 'drunk' → 'bad status'
 *   (11) note_add → 行実測（author_user_id・trim）・audit before=null  (12) 2001字 → 'bad body'
 *   (13) note_remove → is_removed・再呼び無音・audit 1回のみ
 *   (14) cast セッションで customer_notes select → 0行（★adversarial 対象）
 *
 * fixture は段内動的生成→finally 全消し（段50 型）: P51 接頭辞・顧客2（A1店/A2店）＋商品1 admin 直 insert・
 *   notes/bottle は RPC 生成・audit は target 精密削除・seed 不触・固定カウント非汚染。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

const P51 = "NOX-VERIFY-P51";

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };

  const { data: sA1row } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const sA1 = sA1row as { id: string; org_id: string };
  const { data: sA2row } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  const sA2 = sA2row as { id: string };

  const custIds: string[] = [];
  const prodIds: string[] = [];
  const noteIds: string[] = [];
  const bottleIds: string[] = [];
  const cleanup = async () => {
    if (noteIds.length) await admin.from("customer_notes").delete().in("id", noteIds);
    if (bottleIds.length) await admin.from("bottle_keeps").delete().in("id", bottleIds);
    if (custIds.length) await admin.from("customers").delete().in("id", custIds);
    if (prodIds.length) {
      await admin.from("product_costs").delete().in("product_id", prodIds);
      await admin.from("products").delete().in("id", prodIds);
    }
    const targets = [
      ...custIds.map((id) => `customers:${id}`),
      ...noteIds.map((id) => `customer_notes:${id}`),
      ...bottleIds.map((id) => `bottle_keeps:${id}`),
    ];
    if (targets.length) await admin.from("audit_logs").delete().in("target", targets);
  };

  const mgr = await signIn("managerA1");
  check("段51（準備）managerA1 セッション解決", true);

  try {
    const mkCust = async (storeId: string, nm: string) =>
      (await admin.from("customers").insert({
        org_id: sA1.org_id, store_id: storeId, name: nm, is_active: true,
      }).select("id").single()).data?.id as string;
    const custA = await mkCust(sA1.id, `${P51}-客A`);
    const custB = await mkCust(sA2.id, `${P51}-客A2店`);
    custIds.push(custA, custB);
    const { data: prow } = await admin.from("products").insert({
      org_id: sA1.org_id, store_id: sA1.id, name: `${P51}-ボトル酒`, type: "bottle", price: 10000,
      back_mode: "rate", back_value: 0, hon_pt: 0, is_active: true,
    }).select("id").single();
    const prodA = (prow as { id: string }).id;
    prodIds.push(prodA);
    check("段51（準備）顧客2＋商品1 生成", !!custA && !!custB && !!prodA);

    const gradeOf = async () =>
      (await admin.from("customers").select("grade").eq("id", custA).single()).data?.grade as string | null;
    const gradeAudit = async () =>
      (await admin.from("audit_logs").select("id", { count: "exact", head: true })
        .eq("action", "customer_set_grade").eq("target", `customers:${custA}`)).count ?? 0;

    // ═══ (1)〜(5) customer_set_grade ═══
    const { error: g1 } = await mgr.rpc("customer_set_grade", { p_id: custA, p_grade: "vip" });
    check("段51(1) ★set_grade 'vip' 成功・実測", !g1 && (await gradeOf()) === "vip", g1?.message);
    check("段51(1) audit 1行", (await gradeAudit()) === 1, `got ${await gradeAudit()}`);
    const { error: g2 } = await mgr.rpc("customer_set_grade", { p_id: custA, p_grade: "vip" });
    check("段51(2) ★同値再呼び＝無音・audit 不増", !g2 && (await gradeAudit()) === 1, g2?.message);
    const { error: g3 } = await mgr.rpc("customer_set_grade", { p_id: custA, p_grade: null });
    check("段51(3) ★null＝無印化・audit 2行目", !g3 && (await gradeOf()) === null && (await gradeAudit()) === 2, g3?.message);
    const { error: g4 } = await mgr.rpc("customer_set_grade", { p_id: custA, p_grade: "gold" });
    check("段51(4) 'gold' は 'bad grade'", has(g4, "bad grade"), g4?.message ?? "通ってしまった");
    const { error: g5 } = await mgr.rpc("customer_set_grade", { p_id: custB, p_grade: "vip" });
    check("段51(5) ★manager 他店（同 org A2 店の客）は 'forbidden'", has(g5, "forbidden"), g5?.message ?? "通ってしまった");

    // ═══ (6)〜(8) bottle_keep_register ═══
    const { data: b6, error: e6 } = await mgr.rpc("bottle_keep_register", {
      p_store_id: sA1.id, p_customer_id: custA, p_product_id: prodA, p_note: "段51",
      p_remaining_pct: 80, p_expires_on: "2028-12-31", p_shelf_no: "A-12",
    });
    if (typeof b6 === "string") bottleIds.push(b6);
    const { data: b6row } = await admin.from("bottle_keeps")
      .select("remaining_pct, expires_on, shelf_no, status").eq("id", b6 as string).single();
    check("段51(6) ★register 7引数＝3列実測（80/2028-12-31/A-12・active）",
      !e6 && b6row?.remaining_pct === 80 && b6row?.expires_on === "2028-12-31" && b6row?.shelf_no === "A-12" && b6row?.status === "active",
      e6?.message ?? JSON.stringify(b6row));
    const { error: e7 } = await mgr.rpc("bottle_keep_register", {
      p_store_id: sA1.id, p_customer_id: custA, p_product_id: prodA, p_note: null,
      p_remaining_pct: 101, p_expires_on: null, p_shelf_no: null,
    });
    check("段51(7) remaining 101 は 'bad remaining'", has(e7, "bad remaining"), e7?.message ?? "通ってしまった");
    const { data: b8, error: e8 } = await mgr.rpc("bottle_keep_register", {
      p_store_id: sA1.id, p_customer_id: custA, p_product_id: prodA, p_note: "旧4引数互換",
    });
    if (typeof b8 === "string") bottleIds.push(b8);
    const { data: b8row } = await admin.from("bottle_keeps")
      .select("remaining_pct, expires_on, shelf_no").eq("id", b8 as string).single();
    check("段51(8) ★旧4引数 named 呼び＝DEFAULT 埋めで正常（3列 null）",
      !e8 && b8row?.remaining_pct === null && b8row?.expires_on === null && b8row?.shelf_no === null,
      e8?.message ?? JSON.stringify(b8row));

    // ═══ (9)(10) bottle_keep_update ═══
    const { error: e9 } = await mgr.rpc("bottle_keep_update", {
      p_id: b6 as string, p_remaining_pct: 20, p_expires_on: "2029-01-31", p_shelf_no: "B-3",
      p_status: "empty", p_note: "段51更新",
    });
    const { data: u9 } = await admin.from("bottle_keeps")
      .select("remaining_pct, expires_on, shelf_no, status, note").eq("id", b6 as string).single();
    check("段51(9) ★update 素通し5値（20/2029-01-31/B-3/empty/メモ）実測",
      !e9 && u9?.remaining_pct === 20 && u9?.expires_on === "2029-01-31" && u9?.shelf_no === "B-3"
        && u9?.status === "empty" && u9?.note === "段51更新",
      e9?.message ?? JSON.stringify(u9));
    const { data: au9 } = await admin.from("audit_logs").select("before_json, after_json")
      .eq("action", "bottle_keep_update").eq("target", `bottle_keeps:${b6}`).limit(1);
    const a9 = (au9 ?? [])[0] as { before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null } | undefined;
    check("段51(9) audit before/after（before=旧値 80・after=20）",
      a9?.before_json?.remaining_pct === 80 && a9?.after_json?.remaining_pct === 20, JSON.stringify(a9));
    const { error: e10 } = await mgr.rpc("bottle_keep_update", {
      p_id: b6 as string, p_remaining_pct: 20, p_expires_on: null, p_shelf_no: null,
      p_status: "drunk", p_note: null,
    });
    check("段51(10) status 'drunk' は 'bad status'", has(e10, "bad status"), e10?.message ?? "通ってしまった");

    // ═══ (11)〜(13) customer_notes ═══
    const { data: n1, error: e11 } = await mgr.rpc("customer_note_add", {
      p_customer_id: custA, p_body: "  段51メモ本文  ",
    });
    if (typeof n1 === "string") noteIds.push(n1);
    const { data: n1row } = await admin.from("customer_notes")
      .select("body, author_user_id, is_removed").eq("id", n1 as string).single();
    const { data: mgrUser } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    check("段51(11) ★note_add＝trim 済み本文・author=managerA1・is_removed=false",
      !e11 && n1row?.body === "段51メモ本文" && n1row?.author_user_id === (mgrUser as { id: string }).id && n1row?.is_removed === false,
      e11?.message ?? JSON.stringify(n1row));
    const { data: au11 } = await admin.from("audit_logs").select("before_json")
      .eq("action", "customer_note_add").eq("target", `customer_notes:${n1}`).limit(1);
    check("段51(11) audit before=null（新規作成形）", (au11 ?? []).length === 1 && (au11 ?? [])[0].before_json === null,
      JSON.stringify(au11));
    const { error: e12 } = await mgr.rpc("customer_note_add", { p_customer_id: custA, p_body: "あ".repeat(2001) });
    check("段51(12) 2001字は 'bad body'", has(e12, "bad body"), e12?.message ?? "通ってしまった");
    const rmAudit = async () =>
      (await admin.from("audit_logs").select("id", { count: "exact", head: true })
        .eq("action", "customer_note_remove").eq("target", `customer_notes:${n1}`)).count ?? 0;
    const { error: e13a } = await mgr.rpc("customer_note_remove", { p_note_id: n1 as string });
    const { data: n13 } = await admin.from("customer_notes").select("is_removed").eq("id", n1 as string).single();
    const { error: e13b } = await mgr.rpc("customer_note_remove", { p_note_id: n1 as string });
    check("段51(13) ★remove＝is_removed=true・再呼び無音・audit 1回のみ",
      !e13a && n13?.is_removed === true && !e13b && (await rmAudit()) === 1,
      e13a?.message ?? e13b?.message ?? `audit=${await rmAudit()}`);

    // ═══ (14) RLS: cast は customer_notes 不可視（担当客でも 0行＝裁定 E8-3-3）═══
    //   custA を castA1a の担当に付け替え＝customers_select なら見える状態を作ったうえで notes が 0行を実測。
    {
      const { data: castRow } = await admin.from("casts").select("id")
        .eq("user_id", (await admin.from("users").select("auth_user_id").eq("email", FIXTURE_USERS.castA1a.email).single()).data?.auth_user_id ?? "")
        .maybeSingle();
      // fixture の cast 行は email からの2段解決が崩れうるため、確実な経路＝casts から castA1a 名で引く
      const { data: castByName } = await admin.from("casts").select("id")
        .eq("store_id", sA1.id).eq("name", FIXTURE_USERS.castA1a.name).maybeSingle();
      const castId = (castRow?.id ?? castByName?.id) as string | undefined;
      if (castId) await admin.from("customers").update({ cast_id: castId }).eq("id", custA);
      const castCl = await signIn("castA1a");
      const { data: castCust } = await castCl.from("customers").select("id").eq("id", custA);
      check("段51(14) 前置き: cast は担当客の customers 行が見える（customers_select の cast 腕）",
        !!castId && (castCust ?? []).length === 1, JSON.stringify({ castId, castCust }));
      const { data: castNotes } = await castCl.from("customer_notes").select("id").eq("customer_id", custA);
      check("段51(14) ★cast は customer_notes 0行（担当客のメモも不可視＝RLS cast 腕なし）",
        (castNotes ?? []).length === 0, `got ${(castNotes ?? []).length}行`);
    }
  } finally {
    await cleanup();
    // 掃除の自己検証（固定カウント非汚染＝段44 流儀）
    const { count: leftCust } = await admin.from("customers")
      .select("id", { count: "exact", head: true }).like("name", `${P51}%`);
    const { count: leftProd } = await admin.from("products")
      .select("id", { count: "exact", head: true }).like("name", `${P51}%`);
    const { count: leftNote } = noteIds.length
      ? await admin.from("customer_notes").select("id", { count: "exact", head: true }).in("id", noteIds)
      : { count: 0 };
    check("段51（掃除）customers/products/notes 0件",
      (leftCust ?? 0) === 0 && (leftProd ?? 0) === 0 && (leftNote ?? 0) === 0,
      JSON.stringify({ leftCust, leftProd, leftNote }));
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-crm-base ALL PASS (${pass} assertions)`);
  console.log("CRM基盤(0094): grade設定/同値無音/nullクリア/bad grade/他店forbidden・bottle7引数/101拒否/旧4引数互換/update素通し+audit/bad status・note追記trim/2001字拒否/論理削除冪等・cast notes 0行");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
