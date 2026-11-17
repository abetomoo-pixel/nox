/*
 * verify:nox-mine1117 — 本人の画面の「自分の cast 行」の取り違え（2026-11-16 夜便 N2 で発見・①-1）の再発防止。
 *   npm run verify:nox-mine1117（env: SUPABASE_DB_URL・seed:f0 済み）。DB 段は 1 トランザクション（最後に ROLLBACK＝残留 0）。
 *  m(1) app/mine/page.tsx の自分の cast 行＝auth_cast_id で絞る（layout.tsx と同じ・裁定337）。旧 limit(1) は レジの許可がある cast
 *       （casts の RLS＝auth_cast_can_register なら同じ店の全員）で別の人の行を拾っていた。
 *  m(2) 本人の画面（app/mine 配下）で casts を limit(1) で読んで店以外の列を使う所が無い（store_id だけは同じ店なら誰の行でも同じ）。
 *  m(3) 宛名・勤怠・保証の印は自分の行（meCast＝auth_cast_id）から出る（明細の castName・勤怠の表の castId・保証の cast_plan）。
 *  m(4) DB：レジの許可があるキャスト（検査の会社 A1・ROLLBACK 前提で許可を付ける）は casts が 2 行以上見える＝limit(1) は別人を拾いうる・
 *       auth_cast_id と「id = auth_cast_id の行」は本人（宛名＝本人の名前）・cast_plan（保証の印の元）は本人の行だけ。
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const pg = fs.readFileSync("app/mine/page.tsx", "utf8");
check("m(1) 自分の cast 行＝auth_cast_id → eq(id)", pg.includes('const { data: myCastId } = await supabase.rpc("auth_cast_id"); if (!myCastId) return { data: null }; const { data } = await supabase.from("casts").select(MINE_CAST_COLS).eq("id", myCastId as string).maybeSingle();') && !pg.includes("select(MINE_CAST_COLS).limit(1)"));
const files = (fs.readdirSync("app/mine", { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => `app/mine/${f}`);
const bad: string[] = [];
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/from\("casts"\)\.select\("([^"]*)"\)\.limit\(1\)/g)) if (m[1].trim() !== "store_id") bad.push(`${f}: ${m[1]}`);
check("m(2) app/mine で casts を limit(1) で読むのは store_id だけ", bad.length === 0, bad);
check("m(3) 宛名＝meCast.name・勤怠の表＝meId（meCast.id）・保証＝cast_plan の cast_id＝meCast.id",
  pg.includes("castName={meCast?.name ?? undefined}") && pg.includes("const meId = meCast?.id as string | undefined;") && pg.includes("buildKintaiSheet(createAdminClient(), supabase, sId, month, { castId: meId })")
  && pg.includes('supabase.from("cast_plan").select("overrides_json, valid_from, valid_to").eq("cast_id", meCast.id as string)'));

async function main() {
const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000, application_name: "nox-verify-mine1117" });
await db.connect();
const t = pgTx(db);
try {
  await db.query("begin");
  const st = await t.storeA1();
  const me = await t.one<{ cast_id: string; name: string; auth_user_id: string; membership_id: string }>(
    `select c.id cast_id, c.name, u.auth_user_id, m.id membership_id from public.casts c join public.users u on u.id = c.user_id
       join public.memberships m on m.user_id = u.id and m.store_id = c.store_id and m.is_active and m.role = 'cast'
      where c.store_id = $1 and c.is_active and u.is_active order by c.name limit 1`, [st.id]);
  const others = await t.one<{ n: number }>(`select count(*)::int n from public.casts where store_id = $1 and is_active and id <> $2`, [st.id, me?.cast_id ?? null]);
  check("m(4-0) 検査の会社 A1 に、利用者のあるキャストと、ほかのキャストが居る", !!me && (others?.n ?? 0) >= 1, { me: me?.name, others: others?.n });
  if (me) {
    await t.q(`update public.memberships set can_register = true where id = $1`, [me.membership_id]);
    await t.q(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || '{"sys_cast_register": 1, "cast_register_device": "own_phone"}'::jsonb where id = $1`, [st.id]);
    const who = { auth_user_id: me.auth_user_id };
    const can = await t.as(who, `select public.auth_cast_can_register() v`);
    check("m(4-1) レジの許可がある状態（auth_cast_can_register＝true）", can.ok && can.rows[0]?.v === true, t.errOf(can));
    const all = await t.as(who, `select count(*)::int n from public.casts`);
    check("m(4-2) その cast には casts が 2 行以上見える＝limit(1) は別人を拾いうる（直す前の型の危うさ）", all.ok && Number(all.rows[0]?.n) >= 2, all.ok ? all.rows[0] : t.errOf(all));
    const mine = await t.as(who, `select public.auth_cast_id() id, (select name from public.casts where id = public.auth_cast_id()) name`);
    check("m(4-3) auth_cast_id と id＝auth_cast_id の行＝本人（宛名＝本人の名前）", mine.ok && mine.rows[0]?.id === me.cast_id && mine.rows[0]?.name === me.name, mine.ok ? mine.rows[0] : t.errOf(mine));
    const cp = await t.as(who, `select count(*)::int n, count(*) filter (where cast_id <> public.auth_cast_id())::int other from public.cast_plan`);
    check("m(4-4) cast_plan（保証の印の元）は本人の行だけ（RLS）", cp.ok && Number(cp.rows[0]?.other) === 0, cp.ok ? cp.rows[0] : t.errOf(cp));
  }
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
}
main().then(() => {
if (fails.length) { console.error(`✗ verify:nox-mine1117 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-mine1117 OK (${pass} checks)`);
}).catch((e) => { console.error(e); process.exit(1); });
