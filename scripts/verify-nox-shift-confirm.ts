/*
 * verify:nox-shift-confirm — 裁定114（mig0126）shift_confirm_bulk の係留。
 *   npm run verify:nox-shift-confirm（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 観点（mig0126・shift_propose 相似の raise 型）:
 *  (a) 正常系: planned 3件 → confirm_bulk → 返値=件数・全件 confirmed・
 *      audit 行（action='shift_confirm_bulk', target='shifts:bulk', after_json.ids/count）
 *  (b) 混在系: planned+proposed 混在 → 全件 confirmed
 *  (c) bad rows: confirmed 済み1件混入 → raise 'bad rows'・対象行は無変更
 *  (d) 上限62: 63件（実62+架空1）→ raise 'too many'（bad rows 判定より前）・62件は通る
 *  (e) 重複 id 入力 → 除去後件数で成功
 *  (f) 権限: 他店（他 org）manager → raise 'bad rows'・行は無変更
 *
 * 逆張り: SCB_INVERT=1 で全 check の期待を反転＝全赤を実測（各 assert が落ち得ることの機械証明）。
 * fixture: NOX-VERIFY-scb* 命名・日付は 2031-07〜2031-09 隔離（sm スイートの 2031-05/06 と非干渉）・
 *   shifts は admin 直 insert（duplicate ガードは RPC 層のみ＝直 insert は日付分散で自衛）→ finally 後始末。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

const INV = process.env.SCB_INVERT === "1";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  const eff = INV ? !ok : ok;
  if (eff) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

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
  const mgr = await signIn("managerA1");
  const mgrB = await signIn("managerB1");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const orgA = sA1!.org_id as string;
  const { data: mgrU } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = (mgrU as { id: string }).id;

  const CAST = "NOX-VERIFY-scbA";
  let castA = "";

  async function teardown() {
    const { data: cs } = await admin.from("casts").select("id").eq("name", CAST);
    const ids = (cs ?? []).map((r) => r.id as string);
    if (ids.length) {
      await admin.from("shifts").delete().in("cast_id", ids);
      const { error: eC } = await admin.from("casts").delete().in("id", ids);
      if (eC) console.error(`[scb teardown] casts delete 失敗（次 run 先頭で自浄）: ${eC.message}`);
    }
  }
  await teardown();

  // 直 insert ヘルパー（status 指定・ids を返す）
  const mkShifts = async (dates: string[], status: string) => {
    const rows = dates.map((date) => ({
      org_id: orgA, store_id: storeA1, cast_id: castA, date,
      start_hm: "20:00", end_hm: "26:00", status, created_by: actorId,
    }));
    const { data, error } = await admin.from("shifts").insert(rows).select("id");
    if (error) throw new Error(`shifts insert: ${error.message}`);
    return (data ?? []).map((r) => r.id as string);
  };
  const statusOf = async (ids: string[]) =>
    (await admin.from("shifts").select("id, status").in("id", ids)).data as { id: string; status: string }[];
  const d9 = (day: number) => `2031-09-${String(day).padStart(2, "0")}`;

  try {
    castA = (await admin.from("casts").insert({
      org_id: orgA, store_id: storeA1, name: CAST, is_active: true,
    }).select("id").single()).data!.id as string;

    // ══ (a) 正常系: planned 3件 → 全件 confirmed＋返値＋audit ══
    {
      const ids = await mkShifts([d9(1), d9(2), d9(3)], "planned");
      const { data: r1, error: e1 } = await mgr.rpc("shift_confirm_bulk", { p_shift_ids: ids });
      check("scb(a1) ★planned 3件 → 返値=3", !e1 && r1 === 3, e1?.message ?? `返値=${JSON.stringify(r1)}`);
      const rows = await statusOf(ids);
      check("scb(a2) ★3件すべて confirmed",
        rows.length === 3 && rows.every((r) => r.status === "confirmed"), JSON.stringify(rows));
      const { rows: au } = await db.query(
        `select count(*)::int as n from public.audit_logs
          where action = 'shift_confirm_bulk' and target = 'shifts:bulk'
            and after_json->'ids' ? $1 and (after_json->>'count')::int = 3`, [ids[0]]);
      check("scb(a3) ★audit 行（action/target/after_json.ids+count）", au[0].n === 1, `n=${au[0].n}`);
    }

    // ══ (b) 混在系: planned+proposed → 全件 confirmed ══
    {
      const idP = await mkShifts([d9(4)], "planned");
      const idQ = await mkShifts([d9(5)], "proposed");
      const ids = [...idP, ...idQ];
      const { data: r1, error: e1 } = await mgr.rpc("shift_confirm_bulk", { p_shift_ids: ids });
      const rows = await statusOf(ids);
      check("scb(b1) ★planned+proposed 混在 → 返値=2・全件 confirmed",
        !e1 && r1 === 2 && rows.length === 2 && rows.every((r) => r.status === "confirmed"),
        e1?.message ?? JSON.stringify({ r1, rows }));
    }

    // ══ (c) bad rows: confirmed 済み混入 → raise・無変更 ══
    {
      const idP = await mkShifts([d9(6)], "planned");
      const idC = await mkShifts([d9(7)], "confirmed");
      const { error: e1 } = await mgr.rpc("shift_confirm_bulk", { p_shift_ids: [...idP, ...idC] });
      check("scb(c1) ★confirmed 済み1件混入は 'bad rows'", !!e1 && e1.message.includes("bad rows"),
        e1?.message ?? "通ってしまった");
      const rows = await statusOf(idP);
      check("scb(c2) ★raise 時は対象行が無変更（planned のまま）",
        rows.length === 1 && rows[0].status === "planned", JSON.stringify(rows));
    }

    // ══ (d) 上限62: 63件は 'too many'・62件は通る ══
    {
      const dates: string[] = [];
      for (let i = 1; i <= 31; i++) dates.push(`2031-07-${String(i).padStart(2, "0")}`);
      for (let i = 1; i <= 31; i++) dates.push(`2031-08-${String(i).padStart(2, "0")}`);
      const ids = await mkShifts(dates, "planned"); // 62件
      const fake = "00000000-0000-4000-8000-000000000126"; // 架空 id（too many は bad rows 判定より前）
      const { error: e1 } = await mgr.rpc("shift_confirm_bulk", { p_shift_ids: [...ids, fake] });
      const planned = (await statusOf(ids)).filter((r) => r.status === "planned").length;
      check("scb(d1) ★63件は 'too many'・62件とも無変更", !!e1 && e1.message.includes("too many") && planned === 62,
        e1?.message ?? `planned=${planned}`);
      const { data: r2, error: e2 } = await mgr.rpc("shift_confirm_bulk", { p_shift_ids: ids });
      const confirmed = (await statusOf(ids)).filter((r) => r.status === "confirmed").length;
      check("scb(d2) ★62件は通る（返値=62・全件 confirmed）", !e2 && r2 === 62 && confirmed === 62,
        e2?.message ?? JSON.stringify({ r2, confirmed }));
    }

    // ══ (e) 重複 id 入力 → 除去後件数で成功 ══
    {
      const ids = await mkShifts([d9(8), d9(9)], "planned");
      const { data: r1, error: e1 } = await mgr.rpc("shift_confirm_bulk", {
        p_shift_ids: [ids[0], ids[0], ids[1]],
      });
      const rows = await statusOf(ids);
      check("scb(e1) ★重複 id は除去＝返値=2・両方 confirmed",
        !e1 && r1 === 2 && rows.every((r) => r.status === "confirmed"),
        e1?.message ?? JSON.stringify({ r1, rows }));
    }

    // ══ (f) 権限: 他店（他 org）manager → 'bad rows'・無変更 ══
    {
      const ids = await mkShifts([d9(10)], "planned");
      const { error: e1 } = await mgrB.rpc("shift_confirm_bulk", { p_shift_ids: ids });
      const rows = await statusOf(ids);
      check("scb(f1) ★他店 manager は 'bad rows'・行は無変更",
        !!e1 && e1.message.includes("bad rows") && rows[0]?.status === "planned",
        e1?.message ?? JSON.stringify(rows));
    }
  } finally {
    await teardown();
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}${INV ? "（SCB_INVERT=1＝期待反転ラン）" : ""}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-shift-confirm ALL PASS (${pass} assertions)${INV ? "（INVERT）" : ""}`);
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
