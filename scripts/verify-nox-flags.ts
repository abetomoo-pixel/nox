/*
 * verify:nox-flags — C層① 機能フラグ器（mig0135・設計書 v1 §5・裁定179〜182／C①-1〜4）の係留。
 *   npm run verify:nox-flags（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 観点（設計書 v1 §5 の 8 項）:
 *  1 行なし → flag_enabled=false（4 key・fail-closed）
 *  2 owner が org 既定 ON → true／店舗行 OFF → その店は false（店舗優先）・別店は org 既定に従う
 *  3 manager の flag_set → raise（forbidden・fail-closed）
 *  4 未知 key → raise 'unknown_key'
 *  5 他 org の store_id → 読は false・書は raise（forbidden）
 *  6 flag_set 後 audit_logs に flag_toggle 1 行・before null（新規）／after 非 null・reason が入る
 *  7 監査書込（service 経路）の旧 7 引数呼出が通る（後方互換）・p_reason 付き呼出で reason 列に入る
 *  8 grants: feature_flags は authenticated=SELECT のみ・anon なし・関数 execute は authenticated 可・anon 不可・
 *    直接 insert は permission denied
 *
 * fixture: verify org A の feature_flags 行（key ごと）・audit_logs の flag_toggle／互換テスト行＝finally で全消し。
 *   ★verify org 以外の行には触れない（org_id 直書き述語）。money 非接触（golden 不変）。
 * 逆張り（手動）: live の flag_set の owner 判定を一時 'manager' 許容へ→ 3 が赤 → 0135 の本文で復元（2026-09-09 実施）。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, STORE_A2, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
const KEYS = ["staff_shift", "reopen_flow", "qr_order", "notify"] as const;
const COMPAT_ACTION = "NOX-VERIFY-fl-compat";

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
  const mgr = await signIn("managerA1");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();
  const { data: sB1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_B1).single();
  const storeA1 = sA1!.id as string, storeA2 = sA2!.id as string, storeB1 = sB1!.id as string;
  const orgA = sA1!.org_id as string;

  async function teardown() {
    const { error: e1 } = await admin.from("feature_flags").delete().eq("org_id", orgA);
    if (e1) console.error(`[fl teardown] feature_flags: ${e1.message}`);
    const { error: e2 } = await admin.from("audit_logs").delete().eq("org_id", orgA).eq("action", "flag_toggle");
    if (e2) console.error(`[fl teardown] audit flag_toggle: ${e2.message}`);
    const { error: e3 } = await admin.from("audit_logs").delete().eq("org_id", orgA).eq("action", COMPAT_ACTION);
    if (e3) console.error(`[fl teardown] audit compat: ${e3.message}`);
  }
  await teardown();

  const enabled = async (c: typeof owner, key: string, storeId: string | null) =>
    c.rpc("flag_enabled", { p_key: key, p_store_id: storeId });

  try {
    // ══ 1 行なし → false（4 key・fail-closed）══
    {
      const vals: unknown[] = [];
      for (const k of KEYS) vals.push((await enabled(owner, k, null)).data);
      check("fl(1) ★行なし＝flag_enabled は 4 key とも false（fail-closed）", vals.every((v) => v === false), JSON.stringify(vals));
    }

    // ══ 2 org 既定 ON → true／店舗行 OFF → 店舗優先・別店は org 既定 ══
    {
      const { data: id1, error: e1 } = await owner.rpc("flag_set", {
        p_key: "staff_shift", p_store_id: null, p_enabled: true, p_reason: "NOX-VERIFY-fl org on",
      });
      check("fl(2a) ★owner が org 既定 ON＝返値 uuid", !e1 && typeof id1 === "string" && (id1 as string).length === 36, e1?.message ?? String(id1));
      const t1 = await enabled(owner, "staff_shift", null);
      check("fl(2b) org 既定 ON → flag_enabled(org)=true", t1.data === true, JSON.stringify(t1.data));
      const { error: e2 } = await owner.rpc("flag_set", { p_key: "staff_shift", p_store_id: storeA1, p_enabled: false, p_reason: null });
      const t2 = await enabled(owner, "staff_shift", storeA1);
      const t3 = await enabled(owner, "staff_shift", storeA2);
      check("fl(2c) ★店舗行 OFF → その店は false（店舗優先）・別店は org 既定 true",
        !e2 && t2.data === false && t3.data === true, e2?.message ?? JSON.stringify([t2.data, t3.data]));
      const t4 = await enabled(mgr, "staff_shift", storeA1);
      check("fl(2d) manager も flag_enabled を読める（自店＝店舗行 false）", t4.error === null && t4.data === false, t4.error?.message ?? JSON.stringify(t4.data));
      // upsert: 同じ店舗行を ON に更新＝行が増えない
      const { error: e3 } = await owner.rpc("flag_set", { p_key: "staff_shift", p_store_id: storeA1, p_enabled: true, p_reason: null });
      const { rows: cnt } = await db.query(`select count(*)::int as n from public.feature_flags where org_id = $1 and key = 'staff_shift'`, [orgA]);
      check("fl(2e) 同一 (org,store,key) の再 flag_set は update＝行数 2 のまま（部分 unique）", !e3 && cnt[0].n === 2, e3?.message ?? `got ${cnt[0].n}`);
    }

    // ══ 3 manager の flag_set → raise ══
    {
      const { error } = await mgr.rpc("flag_set", { p_key: "reopen_flow", p_store_id: storeA1, p_enabled: true, p_reason: null });
      check("fl(3) ★manager の flag_set は forbidden（fail-closed）", has(error, "forbidden"), error?.message ?? "通ってしまった");
    }

    // ══ 4 未知 key → raise ══
    {
      const { error } = await owner.rpc("flag_set", { p_key: "bogus_key", p_store_id: null, p_enabled: true, p_reason: null });
      check("fl(4) 未知 key は unknown_key", has(error, "unknown_key"), error?.message ?? "通ってしまった");
    }

    // ══ 5 他 org の store_id → 読 false・書 raise ══
    {
      const r = await enabled(owner, "staff_shift", storeB1);
      check("fl(5a) 他 org の store_id は flag_enabled=false（raise しない）", r.error === null && r.data === false, r.error?.message ?? JSON.stringify(r.data));
      const { error } = await owner.rpc("flag_set", { p_key: "staff_shift", p_store_id: storeB1, p_enabled: true, p_reason: null });
      check("fl(5b) ★他 org の store_id への flag_set は forbidden", has(error, "forbidden"), error?.message ?? "通ってしまった");
    }

    // ══ 6 flag_toggle の監査＝1 行・before null／after 非 null・reason ══
    {
      const { rows } = await db.query(
        `select before_json is null as before_null, after_json is not null as after_ok, reason, target
           from public.audit_logs where org_id = $1 and action = 'flag_toggle' and target = 'feature_flags:staff_shift' order by at asc`, [orgA]);
      check("fl(6a) ★org 既定の flag_set＝flag_toggle 1 行・target 'feature_flags:staff_shift'・before null・after 非 null",
        rows.length === 1 && rows[0].before_null === true && rows[0].after_ok === true, JSON.stringify(rows));
      check("fl(6b) reason が audit_logs.reason に入る", rows[0]?.reason === "NOX-VERIFY-fl org on", JSON.stringify(rows[0]?.reason));
      const { rows: r2 } = await db.query(
        `select count(*)::int as n, count(*) filter (where reason is null)::int as no_reason from public.audit_logs
          where org_id = $1 and action = 'flag_toggle' and target = $2`, [orgA, `feature_flags:staff_shift:${storeA1}`]);
      check("fl(6c) 店舗行の flag_set 2 回＝flag_toggle 2 行（target に store_id）・reason null は null のまま", r2[0].n === 2 && r2[0].no_reason === 2, JSON.stringify(r2[0]));
    }

    // ══ 7 監査書込の後方互換（service 経路・postgres 直呼び）══
    {
      const a7 = await db.query(`select public.audit_log_write_service($1::uuid, null::uuid, $2::text, 'fl:compat7', null, '{"k":1}'::jsonb, null::uuid) as id`, [orgA, COMPAT_ACTION]);
      const a8 = await db.query(`select public.audit_log_write_service($1::uuid, null::uuid, $2::text, 'fl:compat8', null, '{"k":2}'::jsonb, null::uuid, 'NOX-VERIFY-fl reason8') as id`, [orgA, COMPAT_ACTION]);
      const { rows } = await db.query(`select target, reason from public.audit_logs where org_id = $1 and action = $2 order by target`, [orgA, COMPAT_ACTION]);
      check("fl(7a) ★旧 7 引数の呼出が通る（p_reason 既定 null）", !!a7.rows[0]?.id && rows.find((r) => r.target === "fl:compat7")?.reason === null, JSON.stringify(rows));
      check("fl(7b) p_reason 付き 8 引数の呼出で reason 列に入る", !!a8.rows[0]?.id && rows.find((r) => r.target === "fl:compat8")?.reason === "NOX-VERIFY-fl reason8", JSON.stringify(rows));
      const { rows: pn } = await db.query(`select proname, pronargs from pg_proc where pronamespace='public'::regnamespace and proname in ('audit_log_write','audit_log_write_service') order by proname`);
      check("fl(7c) pronargs＝audit_log_write 6・_service 8（旧 signature は DROP 済み＝同名 1 本ずつ）",
        pn.length === 2 && pn[0].pronargs === 6 && pn[1].pronargs === 8, JSON.stringify(pn));
    }

    // ══ 8 grants ══
    {
      const { rows: t } = await db.query(
        `select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants
          where table_schema='public' and table_name='feature_flags' and grantee in ('anon','authenticated') group by grantee order by grantee`);
      check("fl(8a) ★feature_flags: authenticated=SELECT のみ・anon なし", t.length === 1 && t[0].grantee === "authenticated" && t[0].privs === "SELECT", JSON.stringify(t));
      const { rows: f } = await db.query(
        `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_ok, has_function_privilege('anon', p.oid, 'execute') as anon_ok
           from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('flag_enabled','flag_set') order by p.proname`);
      check("fl(8b) 関数 execute＝authenticated 可・anon 不可（2 本）", f.length === 2 && f.every((r) => r.auth_ok === true && r.anon_ok === false), JSON.stringify(f));
      const { error: eIns } = await owner.from("feature_flags").insert({ org_id: orgA, store_id: null, key: "notify", enabled: true });
      check("fl(8c) owner の直接 insert は permission denied（書込は RPC のみ）", has(eIns, "permission denied"), eIns?.message ?? "insert できてしまった");
      const { rows: pol } = await db.query(`select count(*)::int as n from pg_policies where tablename='feature_flags'`);
      check("fl(8d) feature_flags の policy は select 1 本のみ", pol[0].n === 1, `got ${pol[0].n}`);
    }
  } finally {
    await teardown();
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-flags ALL PASS (${pass} assertions)`);
  console.log("機能フラグ器(0135): 行なし false / org 既定→店舗上書き / owner のみ書込 / unknown_key / 他 org 遮断 / flag_toggle 監査+reason / 監査書込の後方互換 / grants");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
