/*
 * verify:nox-issue-bulk — mig0157（裁定302／304・2026-09-25）: 前借り／送り実費の一括発行 RPC（adv_issue_bulk／transport_issue_bulk）の係留。
 *   npm run verify:nox-issue-bulk（env: SUPABASE_DB_URL・seed:f0 済み）。f0 75 段目。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）
 *   → 最後に ROLLBACK＝残留 0（verify 店の在籍 cast 2 人／B1 の cast 0 は tx 内で一時 cast を insert・okuri_mode も tx 内で 'actual' へ書き換えて戻す）。
 *   便 S-3 の突合（docs/tmp/q0925_ag_0157.mjs d 段）を移植。
 *
 *  (1) adv_issue_bulk: 3 人一括 → 3 行（idem_key つき・amount は件ごと・返り 3 id・audit 'adv_issue_bulk' 3）／同キー再送 → 同じ 3 id・新規 0・audit 不増／
 *      他店 cast 1 人 → 'bad cast' 全件 raise（部分成功なし）／同 cast 2 回 → 'duplicate cast'（304-1）／amount 0・[]・idem null → 'bad amount'・'bad items'・'bad idem'
 *  (2) transport_issue_bulk: flat 店 → 'okuri not actual'（0 行）／tx 内で okuri_mode='actual' → 3 行（biz_date・idem・audit 'transport_issue_bulk'）・同キー再送 0
 *  (3) 権限: cast は 'forbidden'（2 本）・owner-a が他 org（B1）へは 'forbidden'／単発 adv_issue は idem_key null で従来どおり
 *  (4) anon: 2 本とも BLOCKED（permission denied for function）／既存 4 本（adv_issue／adv_cancel／transport_issue／transport_cancel）の md5（CR 除去）不変
 *  (0) fixture・ROLLBACK 後の snapshot 一致（casts／advances／transport／audit）
 *  逆テスト（手動・1 回）: 本 suite の DUP 期待語を 'duplicate' 以外にする→ib(1-4) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// 既存 4 本の md5（prosrc の CR を落とした値・0157 手貼り前の控え＝docs/tmp/0157_pre_live.md A 表・2026-09-25）
const MD5_PIN: Record<string, string> = {
  adv_issue: "b8568921aa110af464b497b0b8add41b",
  adv_cancel: "8ff4572b1670ac93f3c18f3ce4823c32",
  transport_issue: "7740e3c4d0d079f386c222c96240479f",
  transport_cancel: "5735aa45f3fe6568c36ccad0a0a4b6d1",
};

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await db.connect();
  const T = pgTx(db);
  const { q, one, errOf, as } = T;
  try {
    const A1 = await one<{ id: string; org_id: string; okuri: string | null }>("select id, org_id, settings_json->>'okuri_mode' okuri from public.stores where name='NOX-VERIFY-A1'");
    const B1 = await one<{ id: string; org_id: string }>("select id, org_id from public.stores where name='NOX-VERIFY-B1'");
    const uidOf = async (email: string) => one<{ id: string; auth_user_id: string }>("select id, auth_user_id from public.users where email=$1 and is_active", [email]);
    const owner = await uidOf("nox-verify-owner-a@example.com"), mgr = await uidOf("nox-verify-manager-a1@example.com"), castU = await uidOf("nox-verify-cast-a1a@example.com");
    const casts = await q<{ id: string }>("select id from public.casts where store_id=$1 and is_active order by name limit 3", [A1.id]);
    check("ib(0-1) fixture: A1／B1／owner-a／manager-a1／cast-a1a・A1 の在籍 cast 2 人以上", !!A1 && !!B1 && !!owner && !!mgr && !!castU && casts.length >= 2);
    const snapSql = "select (select count(*)::int from public.casts) ca, (select count(*)::int from public.advances where store_id=$1) ad, (select count(*)::int from public.transport where store_id=$1) tr, (select count(*)::int from public.audit_logs where org_id=$2) au";
    const before = JSON.stringify(await one(snapSql, [A1.id, A1.org_id]));
    const today = (await one<{ d: string }>("select public.biz_date_of($1, now())::text d", [A1.id])).d;
    const items = (ids: string[], amount = 3000) => JSON.stringify(ids.map((c, i) => ({ cast_id: c, amount: amount + i, date: today, note: "verify 0157" })));
    const nAdv = async () => (await one<{ n: number }>("select count(*)::int n from public.advances where store_id=$1 and idem_key is not null", [A1.id])).n;
    const nTr = async () => (await one<{ n: number }>("select count(*)::int n from public.transport where store_id=$1 and idem_key is not null", [A1.id])).n;
    const nAudit = async (action: string) => (await one<{ n: number }>("select count(*)::int n from public.audit_logs where org_id=$1 and action=$2", [A1.org_id, action])).n;
    await db.query("begin");
    try {
      // 一時 fixture（tx 内・ROLLBACK で消える）: A1 の 3 人目・B1 の cast
      while (casts.length < 3) casts.push(await one<{ id: string }>("insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, $3, true) returning id", [A1.org_id, A1.id, `検証キャストA1z${casts.length}（0157 suite の一時行）`]));
      const castB = await one<{ id: string }>("insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, '検証キャストB1z（0157 suite の一時行）', true) returning id", [B1.org_id, B1.id]);
      const ids3 = casts.map((c) => c.id);
      // (1) adv_issue_bulk
      const k1 = randomUUID();
      const b1 = await as(mgr, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items(ids3), k1]);
      const amts = await q<{ amount: number }>("select amount from public.advances where store_id=$1 and idem_key is not null order by amount", [A1.id]);
      check("ib(1-1) manager の adv_issue_bulk 3 人 → 3 行（idem_key つき・amount は件ごと 3000/3001/3002）・返り 3 id・audit 'adv_issue_bulk' 3", b1.ok && (b1.rows[0].ids as string[]).length === 3 && (await nAdv()) === 3 && amts.map((a) => a.amount).join(",") === "3000,3001,3002" && (await nAudit("adv_issue_bulk")) === 3, errOf(b1));
      const b1r = await as(mgr, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items(ids3), k1]);
      check("ib(1-2) 同キー再送 → 同じ 3 id・新規 0（行数不変・audit 不増）", b1r.ok && JSON.stringify(b1r.rows[0].ids) === JSON.stringify(b1.ok ? b1.rows[0].ids : null) && (await nAdv()) === 3 && (await nAudit("adv_issue_bulk")) === 3, errOf(b1r));
      const bad = await as(mgr, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items([ids3[0], castB.id]), randomUUID()]);
      check("ib(1-3) 1 人が他店 cast → 'bad cast' で全件 raise（部分成功なし＝行数不変）", !bad.ok && bad.err.includes("bad cast") && (await nAdv()) === 3, errOf(bad));
      const dup = await as(mgr, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items([ids3[0], ids3[1], ids3[0]]), randomUUID()]);
      check("ib(1-4) ★裁定304-1 同 cast が 2 回 → 'duplicate cast' で全件 raise（0 行・audit 不増）", !dup.ok && dup.err.includes("duplicate cast") && (await nAdv()) === 3 && (await nAudit("adv_issue_bulk")) === 3, errOf(dup));
      const zero = await as(mgr, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items([ids3[0]], 0), randomUUID()]);
      const empty = await as(mgr, "select public.adv_issue_bulk($1, '[]'::jsonb, $2) ids", [A1.id, randomUUID()]);
      const noidem = await as(mgr, "select public.adv_issue_bulk($1, $2::jsonb, null) ids", [A1.id, items([ids3[0]])]);
      check("ib(1-5) amount 0 → 'bad amount'・[] → 'bad items'・idem null → 'bad idem'", !zero.ok && zero.err.includes("bad amount") && !empty.ok && empty.err.includes("bad items") && !noidem.ok && noidem.err.includes("bad idem"), [zero, empty, noidem].map(errOf).join(" | "));
      // (2) transport_issue_bulk
      const flat = await as(mgr, "select public.transport_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items(ids3, 1500), randomUUID()]);
      check(`ib(2-1) transport_issue_bulk＝A1 の okuri_mode ${A1.okuri ?? "(flat)"}: flat なら 'okuri not actual'（0 行）`, A1.okuri === "actual" ? flat.ok : (!flat.ok && flat.err.includes("okuri not actual") && (await nTr()) === 0), errOf(flat));
      await T.asPg();
      await db.query("update public.stores set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_mode}', '\"actual\"'::jsonb) where id = $1", [A1.id]); // tx 内＝ROLLBACK で戻る
      const k2 = randomUUID();
      const t1 = await as(mgr, "select public.transport_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items(ids3, 1500), k2]);
      const trAfter = A1.okuri === "actual" ? 6 : 3;
      check("ib(2-2) okuri_mode='actual'（tx 内）→ 3 行（biz_date＝当日・idem_key つき・audit 'transport_issue_bulk' 3）・返り 3 id", t1.ok && (t1.rows[0].ids as string[]).length === 3 && (await nTr()) === trAfter && (await one<{ n: number }>("select count(*)::int n from public.transport where store_id=$1 and idem_key is not null and biz_date=$2::date", [A1.id, today])).n === trAfter && (await nAudit("transport_issue_bulk")) === trAfter, errOf(t1));
      const t1r = await as(mgr, "select public.transport_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items(ids3, 1500), k2]);
      check("ib(2-3) transport 同キー再送 → 同じ 3 id・新規 0", t1r.ok && JSON.stringify(t1r.rows[0].ids) === JSON.stringify(t1.ok ? t1.rows[0].ids : null) && (await nTr()) === trAfter, errOf(t1r));
      // (3) 権限
      const c1 = await as(castU, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items([ids3[0]]), randomUUID()]);
      const c2 = await as(castU, "select public.transport_issue_bulk($1, $2::jsonb, $3) ids", [A1.id, items([ids3[0]]), randomUUID()]);
      const o1 = await as(owner, "select public.adv_issue_bulk($1, $2::jsonb, $3) ids", [B1.id, items([castB.id]), randomUUID()]);
      check("ib(3-1) cast は 'forbidden'（2 本）・owner-a が他 org（B1）へは 'forbidden'", !c1.ok && c1.err.includes("forbidden") && !c2.ok && c2.err.includes("forbidden") && !o1.ok && o1.err.includes("forbidden"), [c1, c2, o1].map(errOf).join(" | "));
      const single = await as(mgr, "select public.adv_issue($1, $2, 2000, $3::date, 'verify 0157 single') id", [A1.id, ids3[0], today]);
      check("ib(3-2) 単発 adv_issue は idem_key null で従来どおり通る（列追加が単発発行を壊さない）", single.ok && (await one<{ n: number }>("select count(*)::int n from public.advances where id=$1 and idem_key is null", [single.ok ? single.rows[0].id : null])).n === 1, errOf(single));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id, A1.org_id]));
    check("ib(0-2) ROLLBACK 後の snapshot 一致（casts／advances／transport／audit）", after === before, `${before} → ${after}`);
    const okuriAfter = (await one<{ okuri: string | null }>("select settings_json->>'okuri_mode' okuri from public.stores where id=$1", [A1.id])).okuri;
    check("ib(0-3) ROLLBACK 後に okuri_mode が元の値", okuriAfter === A1.okuri, `${A1.okuri} → ${okuriAfter}`);
    // (4) 既存 4 本の md5 不変
    const md = await q<{ proname: string; m: string }>("select proname, md5(replace(prosrc, E'\\r', '')) m from pg_proc where pronamespace='public'::regnamespace and proname = any($1)", [Object.keys(MD5_PIN)]);
    check("ib(4-1) 既存 4 本（adv_issue／adv_cancel／transport_issue／transport_cancel）の md5（CR 除去）＝0157 手貼り前の控え", md.length === 4 && md.every((r) => MD5_PIN[r.proname] === r.m), md.map((r) => `${r.proname}:${r.m.slice(0, 8)}`).join(","));
  } finally {
    await db.end().catch(() => undefined);
  }
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const fn of ["adv_issue_bulk", "transport_issue_bulk"]) {
    const { error } = await anon.rpc(fn, { p_store_id: null, p_items: null, p_idem_key: null });
    check(`ib(4-2) anon ${fn} BLOCKED`, !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-issue-bulk ALL PASS (${pass} assertions)`);
  console.log("一括発行(0157・裁定302／304): 3 人→3 行・同キー再送 0・他店 cast 全件 raise・duplicate cast・bad amount/items/idem / flat 'okuri not actual'→tx 内 actual で 3 行 / cast・他 org forbidden・単発 不変 / anon BLOCKED・既存 4 本 md5 不変・ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
