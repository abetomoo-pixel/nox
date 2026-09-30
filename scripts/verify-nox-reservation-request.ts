/*
 * verify:nox-reservation-request — mig0160 ★3（裁定326-4／追補1-1・5／追補2-3・2026-09-30）: cast 本人の予約申請 reservation_request と決裁 reservation_decide の係留（最小段・便 P160-3）。
 *   npm run verify:nox-reservation-request（env: SUPABASE_DB_URL・seed:f0 済み）。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）→ 最後に ROLLBACK＝残留 0。
 *
 *  rr(1) 申請: castA1a が自分の担当客を hon で申請 → status 'pending'・cast_id＝requested_by_cast＝自分・created_by＝cast の user_id・nom_type 'hon'・audit 'reservation_request' +1／
 *        他 cast の担当客→'bad customer'・kind 外→'bad kind'・reserved_at null→'bad reserved_at'・manager（cast 行なし）→'no cast for caller'
 *  rr(2) 決裁: managerA1 approve → 'booked'・decided_by＝manager の user_id・decided_at 非 null・rejected_reason null・audit 'reservation_decide' +1／同じ行を再決裁→'not pending'／
 *        2 件目を staff（can_crm）が reject（理由つき）→ 'rejected'＋rejected_reason／'bad decision'／cast の decide→forbidden／他 org manager→forbidden／理由 201 字→'bad reason'
 *  rr(3) booked 読取に pending が出ない: status='booked' の一覧に pending の id が無い・reservation_to_check(pending)→'not bookable'（承認前は伝票化できない）
 *  rr(4) anon 2 本 BLOCKED／rr(0) fixture・ROLLBACK 後の行数不変
 *  逆テスト 1 本（手動・1 回）: rr(2-1) の期待 'booked' を 'booked!' にする→赤・戻して緑。
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
    const mgr = await uidOf("managerA1"), crm = await uidOf("staffCrmOnA1"), castU = await uidOf("castA1a"), castU2 = await uidOf("castA1b"), mgrB = await uidOf("managerB1");
    const castA = await castOf(A1.id, castU.id), castB = await castOf(A1.id, castU2.id);
    const cuA = await one<{ id: string }>("select id from public.customers where store_id=$1 and cast_id=$2 and is_active order by name limit 1", [A1.id, castA]);
    const cuB = await one<{ id: string }>("select id from public.customers where store_id=$1 and cast_id=$2 and is_active order by name limit 1", [A1.id, castB]);
    check("rr(0-1) fixture: A1／manager-a1／staff-crm／cast-a1a（担当客あり）／cast-a1b（担当客あり）／manager-b1", !!A1 && !!mgr && !!crm && !!castA && !!castB && !!cuA && !!cuB && !!mgrB);
    // 定休日を避ける（reservation_is_closed_day が false になる最初の日・2097-01-01 から 7 日）
    let at = "";
    for (let d = 1; d <= 7 && !at; d++) {
      const ts = `2097-01-0${d}T11:00:00Z`;
      if (!(await one<{ c: boolean }>("select public.reservation_is_closed_day($1, $2::timestamptz) c", [A1.id, ts])).c) at = ts;
    }
    check("rr(0-2) 営業日（closed day でない reserved_at）が取れた", at !== "", "7 日とも closed day");
    const nRes = async () => (await one<{ n: number }>("select count(*)::int n from public.reservations where store_id=$1", [A1.id])).n;
    const nAudit = async (a: string) => (await one<{ n: number }>("select count(*)::int n from public.audit_logs where org_id=$1 and action=$2", [A1.org_id, a])).n;
    const row = async (id: string) => one<Record<string, unknown>>("select status, cast_id, requested_by_cast, created_by, nom_type, decided_by, decided_at, rejected_reason from public.reservations where id=$1", [id]);
    const req = (who: { auth_user_id: string }, cu: string | null, kind: string | null, ts: string | null = at) => as(who, "select public.reservation_request($1, $2, $3::timestamptz, $4) id", [A1.id, cu, ts, kind]);
    const dec = (who: { auth_user_id: string }, id: string, decision: string | null, reason: string | null = null) => as(who, "select public.reservation_decide($1, $2, $3) id", [id, decision, reason]);
    const before = await nRes();
    await db.query("begin");
    try {
      // (1) 申請
      const a0 = await nAudit("reservation_request");
      const r1 = await req(castU, cuA.id, "hon");
      const id1 = r1.ok ? (r1.rows[0].id as string) : "";
      const w1 = id1 ? await row(id1) : null;
      check("rr(1-1) castA1a が自分の担当客を hon で申請 → 'pending'・cast_id＝requested_by_cast＝自分・created_by＝cast の user_id・nom_type 'hon'・decided null・audit +1",
        r1.ok && !!w1 && w1.status === "pending" && w1.cast_id === castA && w1.requested_by_cast === castA && w1.created_by === castU.id && w1.nom_type === "hon" && w1.decided_by === null && w1.decided_at === null && (await nAudit("reservation_request")) === a0 + 1,
        errOf(r1) + JSON.stringify(w1));
      const bc = await req(castU, cuB.id, "dohan");
      const bk = await req(castU, cuA.id, "jonai");
      const bt = await req(castU, cuA.id, "hon", null);
      const nc = await req(mgr, cuA.id, "hon");
      check("rr(1-2) 他 cast の担当客→'bad customer'・kind 'jonai'→'bad kind'・reserved_at null→'bad reserved_at'・manager（cast 行なし）→'no cast for caller'",
        !bc.ok && bc.err.includes("bad customer") && !bk.ok && bk.err.includes("bad kind") && !bt.ok && bt.err.includes("bad reserved_at") && !nc.ok && nc.err.includes("no cast for caller"),
        [errOf(bc), errOf(bk), errOf(bt), errOf(nc)].join(" | "));
      // (3) booked 読取に pending が出ない（決裁前に確認）
      const booked = await q<{ id: string }>("select id from public.reservations where store_id=$1 and status='booked'", [A1.id]);
      const tc = await as(mgr, "select public.reservation_to_check($1, null, null) id", [id1]);
      check("rr(3-1) status='booked' の一覧に pending の id が無い・reservation_to_check(pending)→'not bookable'（承認前は伝票化できない）", !booked.some((b) => b.id === id1) && !tc.ok && tc.err.includes("not bookable"), errOf(tc));
      // (2) 決裁
      const d0 = await nAudit("reservation_decide");
      const cd = await dec(castU, id1, "approve");
      const bd = await dec(mgr, id1, "maybe");
      const ob = await dec(mgrB, id1, "approve");
      const lr = await dec(mgr, id1, "reject", "x".repeat(201));
      check("rr(2-0) cast の decide→forbidden・'maybe'→'bad decision'・他 org manager→forbidden・理由 201 字→'bad reason'（行は pending のまま・audit 不増）",
        !cd.ok && cd.err.includes("forbidden") && !bd.ok && bd.err.includes("bad decision") && !ob.ok && ob.err.includes("forbidden") && !lr.ok && lr.err.includes("bad reason") && (await row(id1)).status === "pending" && (await nAudit("reservation_decide")) === d0,
        [errOf(cd), errOf(bd), errOf(ob), errOf(lr)].join(" | "));
      const ap = await dec(mgr, id1, "approve");
      const w2 = await row(id1);
      check("rr(2-1) managerA1 approve → 'booked'・decided_by＝manager の user_id・decided_at 非 null・rejected_reason null・audit +1",
        ap.ok && w2.status === "booked" && w2.decided_by === mgr.id && w2.decided_at !== null && w2.rejected_reason === null && (await nAudit("reservation_decide")) === d0 + 1, errOf(ap) + JSON.stringify(w2));
      const re = await dec(mgr, id1, "reject", "late");
      check("rr(2-2) 決裁済み（booked）を再決裁→'not pending'", !re.ok && re.err.includes("not pending"), errOf(re));
      const r2 = await req(castU, cuA.id, "dohan");
      const id2 = r2.ok ? (r2.rows[0].id as string) : "";
      const rj = await dec(crm, id2, "reject", "  満席のため  ");
      const w3 = id2 ? await row(id2) : null;
      check("rr(2-3) 2 件目（dohan）を staff（can_crm）が reject（理由 trim）→ 'rejected'・rejected_reason '満席のため'・decided_by＝staff の user_id",
        r2.ok && rj.ok && !!w3 && w3.status === "rejected" && w3.rejected_reason === "満席のため" && w3.decided_by === crm.id && w3.decided_at !== null, errOf(r2) + errOf(rj) + JSON.stringify(w3));
      const booked2 = await q<{ id: string }>("select id from public.reservations where store_id=$1 and status='booked'", [A1.id]);
      check("rr(3-2) approve 後は booked の一覧に出る・rejected は出ない", booked2.some((b) => b.id === id1) && !booked2.some((b) => b.id === id2));
      // (4) anon
      const an1 = await as("anon", "select public.reservation_request($1, $2, $3::timestamptz, $4)", [A1.id, cuA.id, at, "hon"]);
      const an2 = await as("anon", "select public.reservation_decide($1, $2, $3)", [id1, "approve", null]);
      check("rr(4-1) anon: reservation_request／reservation_decide とも permission denied for function", !an1.ok && an1.err.includes("permission denied for function") && !an2.ok && an2.err.includes("permission denied for function"), [errOf(an1), errOf(an2)].join(" | "));
    } finally {
      await db.query("rollback");
    }
    check("rr(0-3) ROLLBACK 後: A1 の reservations 行数不変（残留 0）", (await nRes()) === before);
  } finally {
    await db.end().catch(() => undefined);
  }
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-reservation-request ALL PASS (${pass} assertions)`);
  console.log("予約申請(0160 ★3・裁定326-4／追補1-1・5／追補2-3): 担当客 pending→approve booked／reject rejected＋理由・bad customer/kind/reserved_at・no cast for caller・not pending・forbidden・booked 読取に pending が出ない・not bookable・anon BLOCKED・ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
