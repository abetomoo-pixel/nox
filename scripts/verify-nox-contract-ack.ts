/*
 * verify:nox-contract-ack — mig0162（裁定326 追補7-6・329 追補1・2026-10-01）: cast の契約確認記録 cast_contract_acks と RPC 2 本＋set_store_mine_settings の contract_ack_rev の係留（便 P162-2）。
 *   npm run verify:nox-contract-ack（env: SUPABASE_DB_URL・seed:f0 済み）。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0（A1 の settings_json も戻る）。
 *
 *  ca(1) 店が OFF: cast_contract_ack_needed=false・cast_contract_ack_self は 'not required'
 *  ca(2) owner が contract_ack ON → settings_json.contract_ack_rev（timestamptz 文字列）→ needed=true → self → 行 1（rev＝settings の rev）→ needed=false・2 回目の self は冪等（行 1・audit 'cast_contract_ack' 1）・同店の別 cast は needed=true
 *  ca(3) ON→ON は rev 不変／OFF→needed=false・self 'not required'（rev は残る）／OFF→ON で新 rev（clock_timestamp＝同一 tx でも進む・教訓101）→ needed=true → self で 2 行目（旧 rev の行は残る）
 *  ca(4) contract_ack_rev は client から送れない（'bad key'）・staff／owner の cast セルフ RPC は 'no cast for caller'・RLS: cast 本人 2／別 cast 0／manager 自店 2／他 org 0・直 insert／delete は permission denied（grant SELECT のみ）
 *  ca(5) anon は 2 本とも permission denied（revoke 面）
 *  ca(0) fixture・ROLLBACK 後 残留 0（cast_contract_acks／audit_logs の行数と A1 settings_json が before と一致）
 *  逆テスト 1 本（手動・1 回）: ca(2-1) の期待 `n1 === true` を `=== false` にする→赤・戻して緑。
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await db.connect();
  const { q, one, errOf, as, uidOf, storeA1, castOf } = pgTx(db);
  const has = (r: { ok: boolean; err?: string }, w: string) => !r.ok && (r.err ?? "").includes(w);
  try {
    const A1 = await storeA1();
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), mgrB = await uidOf("managerB1"), staff = await uidOf("staffA1"), castU = await uidOf("castA1a"), castU2 = await uidOf("castA1b");
    const castA = await castOf(A1.id, castU.id);
    check("ca(0-1) fixture: A1／owner-a／manager-a1／manager-b1／staff-a1／cast-a1a（casts 行）／cast-a1b", !!A1 && !!owner && !!mgr && !!mgrB && !!staff && !!castU && !!castA && !!castU2);
    const snapSql = `select (select count(*)::int from public.cast_contract_acks) ac, (select count(*)::int from public.audit_logs) au, (select settings_json::text from public.stores where id=$1) sj`;
    const before = JSON.stringify(await one(snapSql, [A1.id]));
    await db.query("begin");
    try {
      const sj = async () => (await one<{ s: Record<string, unknown> }>("select settings_json s from public.stores where id=$1", [A1.id])).s;
      const needed = (who: { auth_user_id: string }) => as(who, "select public.cast_contract_ack_needed() n");
      const ackSelf = (who: { auth_user_id: string }) => as(who, "select public.cast_contract_ack_self()");
      const setAck = (v: boolean) => as(owner, `select public.set_store_mine_settings($1, '{"contract_ack": ${v}}'::jsonb)`, [A1.id]);
      const acks = () => q<{ cast_id: string; contract_rev: string }>("select cast_id, contract_rev from public.cast_contract_acks where store_id=$1 order by contract_rev, cast_id", [A1.id]);
      const auN = async () => (await one<{ n: number }>("select count(*)::int n from public.audit_logs where action='cast_contract_ack' and org_id=$1", [A1.org_id])).n;
      const nOf = (r: { ok: boolean; rows?: Record<string, unknown>[] }) => (r.ok ? r.rows?.[0]?.n : undefined);
      // 前提＝A1 は OFF（settings_json に contract_ack が無い／false）。有るなら tx 内で OFF に寄せる（ROLLBACK で戻る）
      if ((await sj()).contract_ack === true) await setAck(false);

      // (1) OFF
      const n0 = await needed(castU), a0 = await ackSelf(castU);
      check("ca(1-1) 店が OFF: needed=false・self は 'not required'", nOf(n0) === false && has(a0, "not required"), `${JSON.stringify(nOf(n0))} ${errOf(a0)}`);

      // (2) ON → rev → needed → self → 冪等
      const on1 = await setAck(true);
      const sj1 = await sj();
      const rev1 = sj1.contract_ack_rev as string | undefined;
      check("ca(2-0) owner が contract_ack ON → settings_json.contract_ack_rev（timestamptz 文字列・白名単外の自動付与）", on1.ok && sj1.contract_ack === true && typeof rev1 === "string" && !Number.isNaN(Date.parse(rev1)), `${errOf(on1)} rev=${rev1}`);
      const n1 = await needed(castU), a1 = await ackSelf(castU), n2 = await needed(castU);
      const au1 = await auN();
      const a2 = await ackSelf(castU), n3 = await needed(castU2);
      const rows1 = await acks();
      // pg は timestamptz を Date で返す＝ms まで（Date.parse(Date) は toString 経由で秒精度に落ちる）→ getTime() で比較
      const revMs = (v: unknown) => new Date(v as string).getTime();
      check("ca(2-1) ON 後: needed=true → self → needed=false・行 1（rev＝settings の rev・cast 本人）", nOf(n1) === true && a1.ok && nOf(n2) === false && rows1.length === 1 && rows1[0].cast_id === castA && revMs(rows1[0].contract_rev) === Date.parse(rev1 ?? ""), JSON.stringify({ n1: nOf(n1), a1: errOf(a1), n2: nOf(n2), rows: rows1.length, cast: rows1[0]?.cast_id === castA, rev: [revMs(rows1[0]?.contract_rev), Date.parse(rev1 ?? "")] }));
      check("ca(2-2) 2 回目の self は冪等（行 1・audit 'cast_contract_ack' 1）・同店の別 cast は needed=true", a2.ok && (await acks()).length === 1 && au1 === 1 && (await auN()) === 1 && nOf(n3) === true, JSON.stringify({ a2: errOf(a2), au: au1, n3: nOf(n3) }));

      // (3) ON→ON 不変・OFF・OFF→ON 新 rev
      const on2 = await setAck(true);
      const sj2 = await sj();
      const off1 = await setAck(false);
      const n4 = await needed(castU), a4 = await ackSelf(castU);
      const sjOff = await sj();
      const on3 = await setAck(true);
      const sj3 = await sj();
      const n5 = await needed(castU), a5 = await ackSelf(castU);
      const rows2 = await acks();
      check("ca(3-1) ON→ON は rev 不変・OFF で needed=false／self 'not required'（rev は残る）", on2.ok && sj2.contract_ack_rev === rev1 && off1.ok && nOf(n4) === false && has(a4, "not required") && sjOff.contract_ack_rev === rev1, JSON.stringify({ rev2: sj2.contract_ack_rev, n4: nOf(n4), a4: errOf(a4) }));
      check("ca(3-2) OFF→ON で新 rev（clock_timestamp＝同一 tx でも進む・教訓101）→ needed=true → self で 2 行目（旧 rev の行は残る）", on3.ok && typeof sj3.contract_ack_rev === "string" && sj3.contract_ack_rev !== rev1 && nOf(n5) === true && a5.ok && rows2.length === 2, JSON.stringify({ rev1, rev3: sj3.contract_ack_rev, n5: nOf(n5), rows: rows2.length }));

      // (4) 白名単・セルフ限定・RLS・grant
      const bk = await as(owner, `select public.set_store_mine_settings($1, '{"contract_ack_rev": "2026-01-01T00:00:00Z"}'::jsonb)`, [A1.id]);
      const nc1 = await as(staff, "select public.cast_contract_ack_needed() n"), nc2 = await as(owner, "select public.cast_contract_ack_self()");
      const cnt = async (who: { auth_user_id: string }) => nOf(await as(who, "select count(*)::int n from public.cast_contract_acks"));
      const c1 = await cnt(castU), c2 = await cnt(castU2), c3 = await cnt(mgr), c4 = await cnt(mgrB);
      check("ca(4-1) contract_ack_rev は client から送れない（'bad key'）・staff／owner の cast セルフ RPC は 'no cast for caller'", has(bk, "bad key") && has(nc1, "no cast for caller") && has(nc2, "no cast for caller"), [errOf(bk), errOf(nc1), errOf(nc2)].join(" | "));
      check("ca(4-2) RLS: cast 本人 2／別 cast 0／manager 自店 2／他 org manager 0", c1 === 2 && c2 === 0 && c3 === 2 && c4 === 0, JSON.stringify([c1, c2, c3, c4]));
      const ins = await as(castU, "insert into public.cast_contract_acks (cast_id, contract_rev, org_id, store_id) values ($1, now(), $2, $3)", [castA, A1.org_id, A1.id]);
      const del = await as(owner, "delete from public.cast_contract_acks where store_id=$1", [A1.id]);
      check("ca(4-3) 直 insert／delete は authenticated に不可（permission denied＝grant SELECT のみ）", has(ins, "permission denied") && has(del, "permission denied"), [errOf(ins), errOf(del)].join(" | "));

      // (5) anon
      const an1 = await as("anon", "select public.cast_contract_ack_needed()"), an2 = await as("anon", "select public.cast_contract_ack_self()");
      check("ca(5-1) anon は 2 本とも permission denied", has(an1, "permission denied") && has(an2, "permission denied"), [errOf(an1), errOf(an2)].join(" | "));
    } finally {
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id]));
    check("ca(0-2) ROLLBACK 後: cast_contract_acks／audit_logs の行数と A1 settings_json が before と一致（残留 0）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-contract-ack ALL PASS (${pass} assertions)`);
  console.log("契約確認(0162・326 追補7-6／329 追補1): OFF→needed false・'not required' / ON→contract_ack_rev→needed→self→冪等 / ON→ON 不変・OFF→ON 新 rev / 'bad key'・'no cast for caller'・RLS 4 象限・grant SELECT のみ / anon denied");
}

main().catch((e) => { console.error(e); process.exit(1); });
