/*
 * verify:nox-cast-quota — mig0160 ★1（裁定326-3／追補1-2・2026-09-30）: キャスト別・月別ノルマ cast_quotas ＋ set_cast_quota の係留（最小段・便 P160-3）。
 *   npm run verify:nox-cast-quota（env: SUPABASE_DB_URL・seed:f0 済み）。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0。
 *
 *  cq(1) upsert: manager 自店が (cast, 2097-01-01) を hon 10／jonai 20／dohan 3／sales 500000 で作成 → 1 行・返り id・audit 'set_cast_quota' +1／同キー再送（値変更）→ 同 id・行数不変・audit +1
 *  （A2 の cast は tx 内で一時 insert＝verify 店 A2 は在籍 cast 0・ROLLBACK で消える）
 *  cq(2) NULL: 4 項目とも NULL で upsert できる（未設定＝NULL・0 とは別）・負数→'bad quota'・月初でない→'bad month'・null 月→'bad month'
 *  cq(3) 越境: 他店（A2）の cast を A1 で→'bad cast'・manager-a1 が A2 へ→forbidden・cast→forbidden・他 org manager→forbidden・owner は全店可
 *  cq(4) RLS（tx 内・JWT emulate）: cast 本人は自分の行だけ（他 cast の行 0）・manager 自店は 2 行・anon は set_cast_quota BLOCKED
 *  cq(0) fixture・ROLLBACK 後 0 行
 *  逆テスト 1 本（手動・1 回）: cq(2-1) の期待語 'bad quota' を 'bad quotb' にする→赤・戻して緑。
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
  const { q, one, errOf, as, uidOf, castOf } = pgTx(db);
  try {
    const A1 = await one<{ id: string; org_id: string }>("select id, org_id from public.stores where name='NOX-VERIFY-A1'");
    const A2 = await one<{ id: string }>("select id from public.stores where name='NOX-VERIFY-A2'");
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), castU = await uidOf("castA1a"), castU2 = await uidOf("castA1b"), mgrB = await uidOf("managerB1");
    const castA = await castOf(A1.id, castU.id), castB = await castOf(A1.id, castU2.id);
    check("cq(0-1) fixture: A1／A2／owner-a／manager-a1／cast-a1a／cast-a1b／manager-b1", !!A1 && !!A2 && !!owner && !!mgr && !!castA && !!castB && !!mgrB);
    const M = "2097-01-01";
    const set = (who: { auth_user_id: string }, store: string, cast: string | null, month: string | null, v: (number | null)[] = [10, 20, 3, 500000]) =>
      as(who, "select public.set_cast_quota($1, $2, $3::date, $4, $5, $6, $7) id", [store, cast, month, ...v]);
    const rows = async () => q<Record<string, unknown>>("select id, cast_id, hon, jonai, dohan, sales, updated_at from public.cast_quotas where store_id=$1 and month=$2::date order by cast_id", [A1.id, M]);
    const nAudit = async () => (await one<{ n: number }>("select count(*)::int n from public.audit_logs where org_id=$1 and action='set_cast_quota'", [A1.org_id])).n;
    const before = (await one<{ n: number }>("select count(*)::int n from public.cast_quotas")).n;
    await db.query("begin");
    try {
      // 一時 fixture（tx 内・ROLLBACK で消える）: A2 の cast（verify 店 A2 は在籍 cast 0）
      const castA2 = (await one<{ id: string }>("insert into public.casts (org_id, store_id, name, is_active) values ($1, $2, '検証キャストA2z（0160 suite の一時行）', true) returning id", [A1.org_id, A2.id])).id;
      // (1) upsert
      const a0 = await nAudit();
      const r1 = await set(mgr, A1.id, castA, M);
      const w1 = await rows();
      check("cq(1-1) manager 自店: (castA, 2097-01) hon 10／jonai 20／dohan 3／sales 500000 → 1 行・返り id＝行 id・audit +1", r1.ok && w1.length === 1 && w1[0].id === r1.rows[0].id && w1[0].hon === 10 && w1[0].jonai === 20 && w1[0].dohan === 3 && w1[0].sales === 500000 && (await nAudit()) === a0 + 1, errOf(r1) + JSON.stringify(w1));
      const r2 = await set(mgr, A1.id, castA, M, [12, null, 3, 600000]);
      const w2 = await rows();
      // updated_at は同一 tx 内では now() が固定＝進みは見ない（値の更新と同 id で upsert を実証）
      check("cq(1-2) 同キー再送（hon 12・jonai NULL・sales 600000）→ 同 id・行数 1 のまま・値更新・audit +1", r2.ok && w2.length === 1 && w2[0].id === w1[0].id && w2[0].hon === 12 && w2[0].jonai === null && w2[0].sales === 600000 && (await nAudit()) === a0 + 2, errOf(r2) + JSON.stringify(w2));
      // (2) NULL・検証
      const rn = await set(mgr, A1.id, castB, M, [null, null, null, null]);
      const w3 = await rows();
      check("cq(2-0) castB を 4 項目 NULL で upsert できる（未設定＝NULL）→ 2 行", rn.ok && w3.length === 2 && w3.every((r) => r.cast_id !== castB || (r.hon === null && r.sales === null)), errOf(rn));
      const bq = await set(mgr, A1.id, castA, M, [-1, 0, 0, 0]);
      const bm = await set(mgr, A1.id, castA, "2097-01-15");
      const nm = await set(mgr, A1.id, castA, null);
      check("cq(2-1) 負数→'bad quota'・月初でない（01-15）→'bad month'・null 月→'bad month'", !bq.ok && bq.err.includes("bad quota") && !bm.ok && bm.err.includes("bad month") && !nm.ok && nm.err.includes("bad month"), [errOf(bq), errOf(bm), errOf(nm)].join(" | "));
      // (3) 越境
      const xc = await set(mgr, A1.id, castA2, M);
      const xs = await set(mgr, A2.id, castA2, M);
      const cc = await set(castU, A1.id, castA, M);
      const ob = await set(mgrB, A1.id, castA, M);
      const ow = await set(owner, A2.id, castA2, M);
      check("cq(3-1) 他店 cast を A1 で→'bad cast'・manager-a1 が A2 へ→forbidden・cast→forbidden・他 org manager→forbidden・owner は A2 も可",
        !xc.ok && xc.err.includes("bad cast") && !xs.ok && xs.err.includes("forbidden") && !cc.ok && cc.err.includes("forbidden") && !ob.ok && ob.err.includes("forbidden") && ow.ok, [errOf(xc), errOf(xs), errOf(cc), errOf(ob), errOf(ow)].join(" | "));
      // (4) RLS（select policy・JWT emulate）
      const sc = await as(castU, "select cast_id from public.cast_quotas where month=$1::date", [M]);
      const sm = await as(mgr, "select cast_id from public.cast_quotas where month=$1::date", [M]);
      const so = await as(owner, "select cast_id from public.cast_quotas where month=$1::date", [M]);
      const sb = await as(mgrB, "select cast_id from public.cast_quotas where month=$1::date", [M]);
      check("cq(4-1) RLS: cast 本人は自分の 1 行だけ・manager 自店は 2 行（A2 の行は見えない）・owner は 3 行・他 org manager は 0 行",
        sc.ok && sc.rows.length === 1 && sc.rows[0].cast_id === castA && sm.ok && sm.rows.length === 2 && so.ok && so.rows.length === 3 && sb.ok && sb.rows.length === 0,
        JSON.stringify([sc, sm, so, sb].map((r) => (r.ok ? r.rows.length : r.err))));
      const an = await as("anon", "select public.set_cast_quota($1, $2, $3::date, 1, 1, 1, 1)", [A1.id, castA, M]);
      check("cq(4-2) anon: set_cast_quota は permission denied for function", !an.ok && an.err.includes("permission denied for function"), errOf(an));
    } finally {
      await db.query("rollback");
    }
    check("cq(0-2) ROLLBACK 後: cast_quotas の行数不変（残留 0）", (await one<{ n: number }>("select count(*)::int n from public.cast_quotas")).n === before);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-cast-quota ALL PASS (${pass} assertions)`);
  console.log("キャスト別ノルマ(0160 ★1・裁定326-3／追補1-2): upsert 同 id・NULL 可・bad quota/month・bad cast・forbidden・owner 全店・RLS cast 本人のみ・anon BLOCKED・ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
