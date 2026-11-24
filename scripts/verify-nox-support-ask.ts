// verify:nox-support-ask（★0207・相談役 11/25 朝の便 M3＝起票152 のベル）— 運営からのサポート許可の頼み
//   (1) 純関数＝出す頼み（頼みの後に許可が出ていれば出さない）・1 行・ひとことの長さ・日本語の理由
//   (2) 配線＝/ops の会社の詳細（頼む・取り下げ・旗の後ろ）・route（運営専用・ask／withdraw）・要承認の route（オーナーだけ・ベルに +1）・カード（開く・今は出さない）・デモの名簿
//   (3) DB（本番・1 トランザクション・ROLLBACK＝恒久変更 0）＝NOX-VERIFY-A で頼む・重ねない・デモ・導入中・許可の間・anon と authenticated は BLOCKED・読めるのはオーナーだけ・今は出さない・取り下げ・監査
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import { supportAskShownOf, supportAskLineOf, supportAskSentLineOf, supportAskMessageErrOf, supportAskCountOf, supportAskErrJa } from "../lib/nox/support/support-ask";
import { MIG_0207_APPLIED } from "../lib/nox/rules-0175/flag";
import { DEMO_KEEP_EXTRA } from "../lib/nox/demo/prewipe";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else { fails.push(label); console.error(`NG ${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
const R = { id: "r1", requested_at: "2026-11-25T06:30:00Z", message: "LINE の設定をお手伝いします" };
check("(1-1) 許可が無い＝出す", supportAskShownOf(R, null)?.id === "r1");
check("(1-2) 頼みの後に許可が出た＝出さない（取り消し・期限切れの後も済んだまま）", supportAskShownOf(R, "2026-11-25T06:31:00Z") === null && supportAskShownOf(R, "2026-11-25T06:30:00Z") === null);
check("(1-3) 頼みより前の許可＝出す", supportAskShownOf(R, "2026-11-20T00:00:00Z")?.id === "r1");
check("(1-4) オーナーの 1 行（JST）とひとこと", supportAskLineOf(R).head === "運営がサポート許可を求めています（11/25 15:30）" && supportAskLineOf(R).sub === "ひとこと：LINE の設定をお手伝いします" && supportAskLineOf({ ...R, message: null }).sub === null);
check("(1-5) 運営の画面の頼み済みの 1 行", supportAskSentLineOf(R) === "頼み済み（11/25 15:30）・ひとこと：LINE の設定をお手伝いします");
check("(1-6) ひとことは 200 字まで（空は可）", supportAskMessageErrOf("") === null && supportAskMessageErrOf("あ".repeat(200)) === null && supportAskMessageErrOf("あ".repeat(201)) !== null);
check("(1-7) ベルの数は頼みがあれば 1", supportAskCountOf(R) === 1 && supportAskCountOf(null) === 0);
check("(1-8) 英語の理由は日本語に（デモ・導入中か許可の間・長さ・権限）", /デモ/.test(supportAskErrJa("forbidden (demo)")) && /頼まなくても/.test(supportAskErrJa("not needed")) && /200/.test(supportAskErrJa("bad message")) && supportAskErrJa("forbidden") === "権限がありません");

// (2)
const detail = src("app/ops/orgs/[id]/org-detail.tsx"), page = src("app/ops/orgs/[id]/page.tsx"), route = src("app/api/ops/orgs/[id]/support-ask/route.ts");
const pend = src("app/api/home/pending/route.ts"), card = src("components/nox/pending-card.tsx");
check("(2-1) 旗 MIG_0207_APPLIED は true（2026-11-25 に CC が適用した後）", (MIG_0207_APPLIED as boolean) === true);
check("(2-2) /ops の詳細＝サポート許可が無いときの URL の欄の下に頼む欄（旗の後ろ）", detail.includes("{supportUrlShownOf(assist) && mig0207On() && <SupportAskBox orgId={row.org_id} ask={supportAsk ?? null} />}") && detail.includes('data-ops-support-ask-send="1"') && detail.includes('data-ops-support-withdraw="1"'));
check("(2-3) /ops の詳細のページは開いている頼みと一番新しい許可を読み、済んだ頼みは出さない", page.includes('admin.from("ops_support_requests").select("id, requested_at, message").eq("org_id", id).is("closed_at", null).maybeSingle()') && page.includes("supportAskShownOf("));
check("(2-4) route＝運営者の確かめ・ask は ops_support_request・withdraw は ops_support_request_withdraw（admin）", route.includes("await requireOperatorApi()") && route.includes('admin.rpc("ops_support_request", { p_ops: g.op.authUserId, p_org: id, p_message: message.trim() || null })') && route.includes('admin.rpc("ops_support_request_withdraw", { p_ops: g.op.authUserId, p_org: id })'));
check("(2-5) 要承認の route＝オーナーだけ・旗の後ろ・ベルの数に +1", pend.includes('if (role === "owner" && mig0207On()) {') && pend.includes("+ supportAskCountOf(supportAsk)"));
check("(2-6) カード＝先頭に 1 行・サポート許可を開く（直通の場所）・今は出さない（support_request_dismiss）・押しただけで許可にしない", card.includes("data-pending-support-ask={data.supportAsk.id}") && card.includes("<Link href={SUPPORT_GRANT_PATH}") && card.includes('supabase.rpc("support_request_dismiss")') && !/support_grant_set/.test(card));
check("(2-7) デモの消さない名簿に ops_support_requests", DEMO_KEEP_EXTRA.includes("ops_support_requests"));

async function main() {
  const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-support-ask" });
  await db.connect();
  const tx = pgTx(db);
  const cnt = async () => tx.one<{ f: number; t: number }>("select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t");
  const before = await cnt();
  try {
    await db.query("begin");
    const op = (await tx.one<{ id: string }>("select auth_user_id id from ops_operators where is_active limit 1")).id;
    const A = await tx.one<{ id: string }>("select id from orgs where name = 'NOX-VERIFY-A'");
    const demo = await tx.one<{ id: string }>("select id from orgs where name = 'NOX-DEMO-ACE'");
    const uid = async (email: string) => ({ auth_user_id: (await tx.one<{ a: string }>("select auth_user_id a from users where email = $1", [email])).a });
    const owner = await uid("nox-verify-owner-a@example.com"), mgr = await uid("nox-verify-manager-a1@example.com"), other = await uid("nox-verify-manager-b1@example.com");
    await tx.q("update orgs set onboarding_state = 'onboarding' where id = $1", [A.id]);
    const r0 = await tx.call("select public.ops_support_request($1, $2, null) id", [op, A.id]);
    check("(3-1) 導入中は頼めない（not needed）", !r0.ok && /not needed/.test(r0.err), tx.errOf(r0));
    await tx.q("update orgs set onboarding_state = 'done' where id = $1", [A.id]);
    await tx.q("update ops_support_grants set revoked_at = now() where org_id = $1 and revoked_at is null", [A.id]);
    await tx.q("update ops_support_requests set closed_at = now(), close_reason = 'withdrawn' where org_id = $1 and closed_at is null", [A.id]);
    const r1 = await tx.call("select public.ops_support_request($1, $2, 'NOX-VERIFY の頼み') id", [op, A.id]);
    const r2 = await tx.call("select public.ops_support_request($1, $2, 'もう一度') id", [op, A.id]);
    const id1 = r1.ok ? String(r1.rows[0].id) : "";
    check("(3-2) 頼める・2 回押しても同じ頼み（重ねて届かない）", r1.ok && r2.ok && id1 !== "" && String(r2.rows[0].id) === id1, [tx.errOf(r1), tx.errOf(r2)]);
    const dm = await tx.call("select public.ops_support_request($1, $2, null) id", [op, demo.id]);
    check("(3-3) デモの会社は断る（forbidden (demo)）", !dm.ok && /forbidden \(demo\)/.test(dm.err), tx.errOf(dm));
    const an = await tx.as("anon", "select public.ops_support_request($1, $2, null)", [op, A.id]);
    const au = await tx.as(owner, "select public.ops_support_request($1, $2, null)", [op, A.id]);
    const aw = await tx.as(owner, "select public.ops_support_request_withdraw($1, $2)", [op, A.id]);
    const ad = await tx.as("anon", "select public.support_request_dismiss()", []);
    check("(3-4) 運営の関数は anon と authenticated で BLOCKED・今は出さないも anon は BLOCKED", [an, au, aw, ad].every((r) => !r.ok && /permission denied for function/.test(r.err)), [an, au, aw, ad].map((r) => tx.errOf(r)));
    const ro = await tx.as(owner, "select count(*)::int n from public.ops_support_requests where closed_at is null", []);
    const rm = await tx.as(mgr, "select count(*)::int n from public.ops_support_requests", []);
    const rb = await tx.as(other, "select count(*)::int n from public.ops_support_requests", []);
    check("(3-5) 読めるのは自社のオーナーだけ（店長 0・他社 0）", ro.ok && Number(ro.rows[0].n) === 1 && rm.ok && Number(rm.rows[0].n) === 0 && rb.ok && Number(rb.rows[0].n) === 0, [ro, rm, rb].map((r) => (r.ok ? r.rows : tx.errOf(r))));
    const md = await tx.as(mgr, "select public.support_request_dismiss() r", []);
    check("(3-6) 店長は今は出さないを押せない（forbidden）", !md.ok && /forbidden/.test(md.err), tx.errOf(md));
    const d1 = await tx.as(owner, "select public.support_request_dismiss() r", []);
    check("(3-7) オーナーの今は出さない＝閉じる・許可にはならない", d1.ok && d1.rows[0].r === true && (await tx.one<{ n: number }>("select count(*)::int n from ops_support_grants where org_id = $1 and revoked_at is null and expires_at > now()", [A.id])).n === 0, tx.errOf(d1));
    const r3 = await tx.call("select public.ops_support_request($1, $2, null) id", [op, A.id]);
    const w1 = await tx.call("select public.ops_support_request_withdraw($1, $2) r", [op, A.id]);
    check("(3-8) 頼み直せる・運営の取り下げ＝閉じる", r3.ok && w1.ok && w1.rows[0].r === true, [tx.errOf(r3), tx.errOf(w1)]);
    const aud = await tx.one<{ o: number; w: number; s: number }>("select (select count(*)::int from ops_audit_logs where org_id = $1 and action = 'ops.support_request' and at >= now()) o, (select count(*)::int from ops_audit_logs where org_id = $1 and action = 'ops.support_request_withdraw' and at >= now()) w, (select count(*)::int from audit_logs where org_id = $1 and action = 'support_request_dismiss' and at >= now()) s", [A.id]);
    check("(3-9) 監査：頼み 2 回（重ねた 1 回は書かない）・取り下げ 1・今は出さない 1", aud.o === 2 && aud.w === 1 && aud.s === 1, aud);
  } finally {
    await db.query("rollback").catch(() => undefined);
    const after = await cnt();
    check("(3-10) ROLLBACK の後は恒久変更 0（関数と表の数が前と同じ）", after.f === before.f && after.t === before.t, { before, after });
    await db.end();
  }
}
main().then(() => {
  if (fails.length) { console.error(`verify:nox-support-ask FAIL ${fails.length}（OK ${pass}）`); process.exit(1); }
  console.log(`verify:nox-support-ask OK (${pass} checks)`);
}).catch((e) => { console.error(e); process.exit(1); });
