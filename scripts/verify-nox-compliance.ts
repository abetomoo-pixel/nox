/*
 * verify:nox-compliance — mig0155（裁定309-1〜5・10＋309 追補1・2026-09-28）: 法定履行系の係留。
 *   npm run verify:nox-compliance（env: SUPABASE_DB_URL・NEXT_PUBLIC_*・seed:f0 済み）。f0 78 段目。Postgres 直結の 1 トランザクション内で JWT を emulate（fixtures-pgtx）
 *   → 最後に ROLLBACK＝残留 0（audit_logs の 8 年前行・伝票／顧客／キープ／kiosk 端末・cast_sensitive の enc・customer_notes・退店日・保持期限の書き換えはすべて tx 内）。
 *   便 Q-2b-3 の突合（docs/tmp/q0928_ag_0155.mjs）の (1)(2)(3) を移植。
 *
 *  (1) 静的: audit_log_write の 6 引数（p_reason）版のみ・audit_log_write_service 8 引数・参照列 9 本
 *  (2) audit_purge: 8 年前の行を tx 内で 1 行 insert → postgres（auth.uid() null）で実行＝deleted 1／orgs 1・action 'audit_purge' 1 行（actor null・reason 'retention 7y'・after_json deleted/oldest/newest/cutoff）・
 *      owner の JWT では 'permission denied'（service_role のみ）
 *  (3) kiosk_check_keeps: owner＝顧客名＋active キープのボトル名のみ（empty 除外・bottle_name null は商品名）＝check_customer_names と同一・kiosk 腕（register 端末＋manager セッション）でも同一・
 *      check_customer_names は kiosk で forbidden／null は forbidden
 *  (4) cast_mynumber_discard／candidates: 退店日の翌年 1/1 起算 7 年（2019-01-01→2027 未到来 0 行・2018-06-15→2026-01-01 到来 1 行）・manager forbidden・enc なし 'no mynumber'・空 reason 'bad reason'・
 *      成功＝enc null＋3 列（deleted_at／deleted_by／'overwrite_null'）＋audit（値なし・reason）・再実行 'no mynumber'・候補 0 行
 *  (5) customer_anonymize／candidates: manager forbidden・候補＝retention_until 昨日 1 行・成功＝name '削除済み顧客'・6 欄 null／false・anonymized_at・customer_notes 2→0・after_json notes_deleted 2（本文なし）・
 *      再実行 'already anonymized'
 *  (6) anon 6 本 BLOCKED（5 本＋audit_purge）／ROLLBACK 後 snapshot 一致
 *  逆テスト（手動・1 回）: (4) の期待 due_on を 2026-01-02 にする→cp(4-1) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const PUBLIC5 = ["cast_mynumber_discard", "cast_mynumber_discard_candidates", "customer_anonymize", "customer_anonymize_candidates", "kiosk_check_keeps"];

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
  await db.connect();
  const T = pgTx(db);
  const { q, one, errOf, as, uidOf, storeA1, castOf } = T;
  try {
    const A1 = await storeA1();
    const owner = await uidOf("ownerA"), mgr = await uidOf("managerA1"), castU = await uidOf("castA1a"), castU2 = await uidOf("castA1b");
    const castA = await castOf(A1.id, castU.id), castB = await castOf(A1.id, castU2.id);
    const mgrMid = (await one<{ id: string }>("select id from public.memberships where user_id=$1 and store_id=$2 and is_active", [mgr.id, A1.id]))?.id;
    const custs = Object.fromEntries((await q<{ id: string; name: string }>("select id, name from public.customers where store_id=$1 and name in ('NOX-VERIFY-顧客-指名A','NOX-VERIFY-顧客-指名B','NOX-VERIFY-顧客-フリー')", [A1.id])).map((r) => [r.name.replace("NOX-VERIFY-顧客-", ""), r.id]));
    const seat = (await one<{ id: string }>("select id from public.seats where store_id=$1 and name='NOX-VERIFY-CRM卓'", [A1.id]))?.id;
    const prod = await one<{ id: string; name: string }>("select id, name from public.products where store_id=$1 and is_active order by name limit 1", [A1.id]);
    check("cp(0-1) fixture: A1／owner／manager（membership）／cast a1a・a1b／顧客 3／CRM 卓／商品", !!A1 && !!owner && !!mgr && !!mgrMid && !!castA && !!castB && Object.keys(custs).length === 3 && !!seat && !!prod);
    if (!seat || !castA || !castB || !mgrMid || !prod || Object.keys(custs).length !== 3) throw new Error("fixture 解決失敗");
    const snapSql = `select (select count(*)::int from public.audit_logs) au, (select count(*)::int from public.customers) cu, (select count(*)::int from public.customer_notes) cn, (select count(*)::int from public.cast_sensitive) cs,
      (select count(*)::int from public.kiosk_devices) kd, (select count(*)::int from public.kiosk_sessions) ks, (select count(*)::int from public.checks) ch, (select count(*)::int from public.check_customers) cc,
      (select count(*)::int from public.bottle_keeps) bk, (select count(left_on)::int from public.casts) lo, (select count(*)::int from public.customers where anonymized_at is not null) an`;
    const before = JSON.stringify(await one(snapSql));

    // (1) 静的
    const alw = await q<{ a: string }>("select pg_get_function_identity_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace and proname='audit_log_write' order by 1");
    const alws = await q<{ a: string }>("select pg_get_function_identity_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace and proname='audit_log_write_service' order by 1");
    check("cp(1-1) audit_log_write は 6 引数（p_reason）版 1 本のみ", alw.length === 1 && alw[0].a === "p_action text, p_target text, p_before jsonb, p_after jsonb, p_store_id uuid, p_reason text", JSON.stringify(alw));
    check("cp(1-2) audit_log_write_service は 8 引数版", alws.length === 1 && alws[0].a === "p_org_id uuid, p_actor uuid, p_action text, p_target text, p_before jsonb, p_after jsonb, p_store_id uuid, p_reason text", JSON.stringify(alws));
    const cols = await q<{ t: string; c: string }>("select table_name t, column_name c from information_schema.columns where table_schema='public' and (table_name, column_name) in (('casts','left_on'),('casts','name'),('bottle_keeps','bottle_name'),('bottle_keeps','opened_at'),('bottle_keeps','status'),('bottle_keeps','product_id'),('bottle_keeps','customer_id'),('check_customers','position'),('customer_notes','customer_id'))");
    check("cp(1-3) 参照列 9 本が存在", cols.length === 9, cols.map((r) => r.t + "." + r.c).join(","));

    await db.query("begin");
    try {
      // (2) audit_purge
      await db.query("insert into public.audit_logs (org_id, store_id, action, target, at) values ($1, $2, 'cp_old_row', 'test', now() - interval '8 years')", [A1.org_id, A1.id]);
      const purge = (await one<{ r: { deleted: number; orgs: number } }>("select public.audit_purge() r")).r;
      const prow = await q<{ org_id: string; actor_user_id: string | null; reason: string; after_json: Record<string, unknown> }>("select org_id, actor_user_id, reason, after_json from public.audit_logs where action='audit_purge'");
      check("cp(2-1) audit_purge(): deleted 1／orgs 1・8 年前の行は消える", purge.deleted === 1 && purge.orgs === 1 && (await one<{ n: number }>("select count(*)::int n from public.audit_logs where action='cp_old_row'")).n === 0, JSON.stringify(purge));
      check("cp(2-2) 'audit_purge' 行 1 行＝org A・actor null・reason 'retention 7y'・after_json deleted=1／oldest／newest／cutoff", prow.length === 1 && prow[0].org_id === A1.org_id && prow[0].actor_user_id === null && prow[0].reason === "retention 7y" && prow[0].after_json.deleted === 1 && !!prow[0].after_json.oldest && !!prow[0].after_json.newest && !!prow[0].after_json.cutoff, JSON.stringify(prow));
      const purgeOwner = await as(owner, "select public.audit_purge() r");
      check("cp(2-3) owner の JWT では audit_purge は permission denied（service_role のみ）", !purgeOwner.ok && /permission denied/.test(errOf(purgeOwner)), errOf(purgeOwner));

      // fixture（postgres）: 伝票（day closed のため直 insert）＋顧客 2 人＋キープ 3 本・kiosk 端末＋manager セッション・A1a に enc・退店日・notes 2 行・保持期限
      const chkId = (await one<{ id: string }>("insert into public.checks (org_id, store_id, seat_id, service_rate, round_unit, round_mode, created_by, customer_id) values ($1,$2,$3,0,1,'down',$4,$5) returning id", [A1.org_id, A1.id, seat, mgr.id, custs["指名A"]])).id;
      await db.query("insert into public.check_customers (org_id, store_id, check_id, customer_id, position) values ($1,$2,$3,$4,0), ($1,$2,$3,$5,1)", [A1.org_id, A1.id, chkId, custs["指名A"], custs["フリー"]]);
      await db.query("insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, bottle_name, status) values ($1,$2,$3,$4,'cp-ボトルF','active'), ($1,$2,$5,$4,null,'active'), ($1,$2,$5,$4,'cp-空','empty')", [A1.org_id, A1.id, custs["フリー"], prod.id, custs["指名A"]]);
      const kioskUid = (await one<{ u: string }>("select gen_random_uuid() u")).u;
      const dev = (await one<{ id: string }>("insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, is_active, purpose) values ($1,$2,$3,'cp-kiosk',true,'register') returning id", [A1.org_id, A1.id, kioskUid])).id;
      await db.query("insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id) values ($1,$2,$3,$4,$5)", [A1.org_id, A1.id, dev, mgrMid, mgr.id]);
      await db.query("insert into public.cast_sensitive (cast_id, org_id, store_id, real_name, mynumber_enc) values ($1,$2,$3,'cp-実名', decode('00ff','hex')) on conflict (cast_id) do update set mynumber_enc = excluded.mynumber_enc", [castA, A1.org_id, A1.id]);
      await db.query("update public.casts set left_on='2019-01-01', is_active=false where id=$1", [castA]);
      await db.query("insert into public.customer_notes (org_id, store_id, customer_id, body) values ($1,$2,$3,'cp-メモ1'), ($1,$2,$3,'cp-メモ2')", [A1.org_id, A1.id, custs["指名B"]]);
      await db.query("update public.customers set retention_until = current_date - 1 where id=$1", [custs["指名A"]]);

      // (3) kiosk_check_keeps
      const kkOwner = await as(owner, "select customer_id, pos, name, bottle_names from public.kiosk_check_keeps($1) order by pos", [chkId]);
      const cnOwner = await as(owner, "select customer_id, pos, name, bottle_names from public.check_customer_names($1) order by pos", [chkId]);
      const kiosk = { auth_user_id: kioskUid };
      const kkKiosk = await as(kiosk, "select customer_id, pos, name, bottle_names from public.kiosk_check_keeps($1) order by pos", [chkId]);
      const cnKiosk = await as(kiosk, "select * from public.check_customer_names($1)", [chkId]);
      const kkNull = await as(kiosk, "select * from public.kiosk_check_keeps(null)");
      const rowsOk = (r: typeof kkOwner) => r.ok && r.rows.length === 2 && r.rows[0].pos === 0 && r.rows[0].name === "NOX-VERIFY-顧客-指名A" && JSON.stringify(r.rows[0].bottle_names) === JSON.stringify([prod.name])
        && r.rows[1].pos === 1 && r.rows[1].name === "NOX-VERIFY-顧客-フリー" && JSON.stringify(r.rows[1].bottle_names) === JSON.stringify(["cp-ボトルF"]) && Object.keys(r.rows[0]).sort().join(",") === "bottle_names,customer_id,name,pos";
      check("cp(3-1) kiosk_check_keeps（owner）: 2 行・pos 順・顧客名＋active キープのボトル名のみ（empty 除外・bottle_name null は商品名・列 4）", rowsOk(kkOwner), JSON.stringify(kkOwner));
      check("cp(3-2) check_customer_names（owner）と同一結果（305-4 と同一露出）", cnOwner.ok && JSON.stringify(cnOwner.rows) === JSON.stringify(kkOwner.ok ? kkOwner.rows : null), JSON.stringify(cnOwner));
      check("cp(3-3) kiosk 腕（register 端末 JWT＋manager 有効セッション）でも owner と同一結果", kkKiosk.ok && rowsOk(kkKiosk) && JSON.stringify(kkKiosk.rows) === JSON.stringify(kkOwner.ok ? kkOwner.rows : null), JSON.stringify(kkKiosk));
      check("cp(3-4) check_customer_names は kiosk JWT で 'forbidden'（0153 の露出範囲は不変）", !cnKiosk.ok && /forbidden/.test(errOf(cnKiosk)), errOf(cnKiosk));
      check("cp(3-5) kiosk_check_keeps(null) は 'forbidden'", !kkNull.ok && /forbidden/.test(errOf(kkNull)), errOf(kkNull));

      // (4) cast_mynumber_discard／candidates
      const cand0 = await as(owner, "select cast_id from public.cast_mynumber_discard_candidates(null)");
      await db.query("update public.casts set left_on='2018-06-15' where id=$1", [castA]);
      const cand1 = await as(owner, "select cast_id, name, left_on::text left_on, due_on::text due_on from public.cast_mynumber_discard_candidates(null)");
      const cand1s = await as(owner, "select cast_id from public.cast_mynumber_discard_candidates($1)", [A1.id]);
      const dMgr = await as(mgr, "select public.cast_mynumber_discard($1, 'cp manager') id", [castA]);
      const candMgr = await as(mgr, "select * from public.cast_mynumber_discard_candidates(null)");
      const dNo = await as(owner, "select public.cast_mynumber_discard($1, 'cp no enc') id", [castB]);
      const dBad = await as(owner, "select public.cast_mynumber_discard($1, '   ') id", [castA]);
      const dOk = await as(owner, "select public.cast_mynumber_discard($1, 'cp 退店 7 年経過') id", [castA]);
      const dTwice = await as(owner, "select public.cast_mynumber_discard($1, 'cp 再実行') id", [castA]);
      const cand2 = await as(owner, "select cast_id from public.cast_mynumber_discard_candidates(null)");
      const csRow = await one<{ enc_null: boolean; del_at: boolean; by: string; method: string }>("select mynumber_enc is null enc_null, mynumber_deleted_at is not null del_at, mynumber_deleted_by by, mynumber_deletion_method method from public.cast_sensitive where cast_id=$1", [castA]);
      const dAudit = await q<{ target: string; before_json: Record<string, unknown>; after_json: Record<string, unknown>; reason: string; store_id: string; actor_user_id: string }>("select target, before_json, after_json, reason, store_id, actor_user_id from public.audit_logs where action='cast_mynumber_discard'");
      check("cp(4-0) 候補一覧（owner）: left_on 2019-01-01（翌年 1/1 起算 7 年＝2027-01-01・未到来）は 0 行", cand0.ok && cand0.rows.length === 0, JSON.stringify(cand0));
      check("cp(4-1) 候補一覧（owner・全店／店指定）: left_on 2018-06-15→due_on 2026-01-01（到来）で A1a 1 行", cand1.ok && cand1.rows.length === 1 && cand1.rows[0].cast_id === castA && cand1.rows[0].due_on === "2026-01-01" && cand1s.ok && cand1s.rows.length === 1, JSON.stringify(cand1));
      check("cp(4-2) manager: discard／候補一覧とも 'forbidden'", !dMgr.ok && /forbidden/.test(errOf(dMgr)) && !candMgr.ok && /forbidden/.test(errOf(candMgr)), errOf(dMgr) + " / " + errOf(candMgr));
      check("cp(4-3) owner: enc なし cast→'no mynumber'／空 reason→'bad reason'", !dNo.ok && /no mynumber/.test(errOf(dNo)) && !dBad.ok && /bad reason/.test(errOf(dBad)), errOf(dNo) + " / " + errOf(dBad));
      check("cp(4-4) owner: 成功→enc null・deleted_at・deleted_by=owner・method 'overwrite_null'", dOk.ok && csRow.enc_null && csRow.del_at && csRow.by === owner.id && csRow.method === "overwrite_null", JSON.stringify({ dOk, csRow }));
      check("cp(4-5) audit 1 行: target／before {mynumber_set:true}／after {mynumber_set:false,method}／reason／store A1／actor owner（値は記録しない）", dAudit.length === 1 && dAudit[0].target === "cast_sensitive:" + castA && dAudit[0].before_json.mynumber_set === true && dAudit[0].after_json.mynumber_set === false && dAudit[0].after_json.method === "overwrite_null" && dAudit[0].reason === "cp 退店 7 年経過" && dAudit[0].store_id === A1.id && dAudit[0].actor_user_id === owner.id && !JSON.stringify(dAudit).includes("00ff"), JSON.stringify(dAudit));
      check("cp(4-6) 再実行→'no mynumber'・候補一覧 0 行（廃棄済みは出ない）", !dTwice.ok && /no mynumber/.test(errOf(dTwice)) && cand2.ok && cand2.rows.length === 0, errOf(dTwice) + " / " + JSON.stringify(cand2));

      // (5) customer_anonymize／candidates
      const aMgr = await as(mgr, "select public.customer_anonymize($1, 'cp manager') id", [custs["指名B"]]);
      const acMgr = await as(mgr, "select * from public.customer_anonymize_candidates(null)");
      const ac1 = await as(owner, "select customer_id, name, retention_until::text ru from public.customer_anonymize_candidates(null)");
      const aBad = await as(owner, "select public.customer_anonymize($1, '') id", [custs["指名B"]]);
      const aOk = await as(owner, "select public.customer_anonymize($1, 'cp 保持期限') id", [custs["指名B"]]);
      const aTwice = await as(owner, "select public.customer_anonymize($1, 'cp 再実行') id", [custs["指名B"]]);
      const cuRow = await one<{ name: string; furigana: string | null; tel: string | null; birthday: string | null; prefs: string | null; memo: string | null; is_active: boolean; anon: boolean }>("select name, furigana, tel, birthday, prefs, memo, is_active, anonymized_at is not null anon from public.customers where id=$1", [custs["指名B"]]);
      const notesLeft = (await one<{ n: number }>("select count(*)::int n from public.customer_notes where customer_id=$1", [custs["指名B"]])).n;
      const aAudit = await q<{ before_json: unknown; after_json: { notes_deleted: number; fields: string[] }; reason: string; actor_user_id: string }>("select before_json, after_json, reason, actor_user_id from public.audit_logs where action='customer_anonymize'");
      check("cp(5-1) manager: anonymize／候補一覧とも 'forbidden'", !aMgr.ok && /forbidden/.test(errOf(aMgr)) && !acMgr.ok && /forbidden/.test(errOf(acMgr)), errOf(aMgr) + " / " + errOf(acMgr));
      check("cp(5-2) 候補一覧（owner）: retention_until 昨日の指名A 1 行", ac1.ok && ac1.rows.length === 1 && ac1.rows[0].customer_id === custs["指名A"], JSON.stringify(ac1));
      check("cp(5-3) owner: 空 reason→'bad reason'／指名B 成功", !aBad.ok && /bad reason/.test(errOf(aBad)) && aOk.ok, errOf(aBad) + " / " + JSON.stringify(aOk));
      check("cp(5-4) customers 行: name '削除済み顧客'・furigana／tel／birthday／prefs／memo null・is_active false・anonymized_at あり", cuRow.name === "削除済み顧客" && cuRow.furigana === null && cuRow.tel === null && cuRow.birthday === null && cuRow.prefs === null && cuRow.memo === null && cuRow.is_active === false && cuRow.anon, JSON.stringify(cuRow));
      check("cp(5-5) customer_notes 2→0・audit after_json notes_deleted=2・fields 7・before null・reason・actor owner・本文なし（309 追補1 (d)）", notesLeft === 0 && aAudit.length === 1 && aAudit[0].after_json.notes_deleted === 2 && aAudit[0].after_json.fields.length === 7 && aAudit[0].before_json === null && aAudit[0].reason === "cp 保持期限" && aAudit[0].actor_user_id === owner.id && !JSON.stringify(aAudit).includes("cp-メモ"), JSON.stringify({ notesLeft, aAudit }));
      check("cp(5-6) 再実行→'already anonymized'", !aTwice.ok && /already anonymized/.test(errOf(aTwice)), errOf(aTwice));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql));
    check("cp(0-2) ROLLBACK 後の snapshot 一致（audit_logs／customers／notes／cast_sensitive／kiosk／checks／check_customers／keeps／left_on／anonymized）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  // (6) anon BLOCKED
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const fn of [...PUBLIC5, "audit_purge"]) {
    const args = fn === "audit_purge" ? {} : fn.endsWith("_candidates") ? { p_store_id: null } : fn === "kiosk_check_keeps" ? { p_check_id: null } : fn === "cast_mynumber_discard" ? { p_cast_id: null, p_reason: null } : { p_customer_id: null, p_reason: null };
    const { error } = await anon.rpc(fn, args);
    check(`cp(6-1) anon ${fn} BLOCKED`, !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-compliance ALL PASS (${pass} assertions)`);
  console.log("法定履行(0155・裁定309): audit_purge（7 年・org 別 1 行・service のみ）/ kiosk_check_keeps（305-4 同露出・kiosk 腕）/ マイナンバー廃棄（翌年 1/1 起算 7 年・owner・3 列＋audit）/ 顧客匿名化（notes 同時削除・notes_deleted）/ anon 6 本 BLOCKED / ROLLBACK 残留 0");
}

main().catch((e) => { console.error(e); process.exit(1); });
