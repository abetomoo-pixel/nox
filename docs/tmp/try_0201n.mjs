// try_0201n.mjs（2026-11-18・相談役 C）— 0201n v2 の試走（本番 BEGIN…ROLLBACK＝DB 変更 0）。前提＝0201m の後（関数 450・表 122）。
//   ★教訓128／132／149／150: 行頭マーカー（begin; と commit; は行頭に 1 つずつ）・本文に commit／rollback が無い・lock_timeout・f0 の最中と手貼りの間は流さない。
//   casts と daily_reports の方針を差し替える＝その 2 表に錠がかかる（statement_timeout 30s・lock_timeout 5s・すぐ ROLLBACK）。
//   段（CLUB ACE の代表キャスト ひなの＝レジの許可あり／同じ tx の中で許可を付け外しする＝ROLLBACK で戻る）:
//    1 レジの許可があるキャスト＝ほかの人の casts の行が読めない・自分の行は読める・register_cast_roster が 5 列だけ返す
//    2 締めの許可が無いキャスト＝daily_reports が読めない／締めの許可がある人（出勤中）＝読める
//    3 レジの許可も締めの許可も無いキャスト＝roster が forbidden
//    4 店長・スタッフ・オーナー・店の端末の読取（casts／daily_reports の件数）は貼る前と同じ
//    5 ほかの店の id を渡す＝forbidden・店長が呼ぶ＝forbidden（is distinct from）・anon＝permission denied
//   使い方: node docs/tmp/try_0201n.mjs
process.loadEnvFile(".env.local");
import pg from "pg";
import fs from "node:fs";
const MIG = "docs/tmp/0201n_cast_roster.sql", PRE = "docs/tmp/0201n_precheck.sql", VER = "docs/tmp/0201n_verify.sql";
const bodyOf = (f) => {
  const lines = fs.readFileSync(f, "utf8").replace(/\r/g, "").split("\n");
  const b = lines.indexOf("begin;"), e = lines.lastIndexOf("commit;");
  if (b < 0 || e <= b || lines.filter((l) => l === "begin;").length !== 1 || lines.filter((l) => l === "commit;").length !== 1) throw new Error(`${f}: 行頭マーカー`);
  const body = lines.slice(b + 1, e);
  if (/\b(commit|rollback)\b/i.test(body.join("\n").replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, ""))) throw new Error(`${f}: 教訓128`);
  if (!body[0].startsWith("set local lock_timeout = '10s';")) throw new Error(`${f}: 教訓132`);
  body[0] = "set local lock_timeout = '5s';";
  return body.join("\n");
};
const BODY = bodyOf(MIG);
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-cc-try-0201n" });
await c.connect();
const cnt = async () => (await c.query("select (select count(*) from pg_proc where pronamespace='public'::regnamespace)::int f, (select count(*) from pg_tables where schemaname='public')::int t")).rows[0];
const before = await cnt(); console.log("before", JSON.stringify(before));
const res = []; const T = (l, ok, d) => { res.push(!!ok); console.log(ok ? "OK " : "NG ", l, d === undefined ? "" : JSON.stringify(d).slice(0, 300)); };
const flat = (r) => Object.values(r).join(" | ");
console.log("試走の始め", new Date().toISOString());
const T0 = Date.now();
await c.query("begin");
try {
  await c.query("set local statement_timeout = '30s'");
  const as = async (uid, sql, params = [], role = "authenticated") => {
    await c.query("savepoint a");
    try {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : JSON.stringify({ role: "anon" })]);
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
      await c.query(`set local role ${role}`);
      const r = await c.query(sql, params);
      await c.query("reset role"); await c.query("release savepoint a");
      return { ok: true, rows: r.rows, fields: r.fields.map((f) => f.name) };
    } catch (e) { await c.query("rollback to savepoint a"); await c.query("reset role"); return { ok: false, err: e.message }; }
  };
  const ace = (await c.query("select id from public.stores where name='CLUB ACE'")).rows[0].id;
  const muse = (await c.query("select id from public.stores where name='SNACK MUSE'")).rows[0].id;
  const people = (await c.query("select u.auth_user_id, m.id mid, m.role from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.is_active and u.auth_user_id is not null", [ace])).rows;
  const P = (role) => people.find((x) => x.role === role);
  const cast = P("cast"); const me = (await c.query("select c.id from public.casts c join public.users u on u.id=c.user_id where c.store_id=$1 and u.auth_user_id=$2", [ace, cast.auth_user_id])).rows[0].id;
  const kd = (await c.query("select auth_user_id from public.kiosk_devices where store_id=$1 and is_active limit 1", [ace])).rows[0];
  const reads = async () => { const o = {}; for (const [k, uid] of [["owner", P("owner")?.auth_user_id], ["manager", P("manager")?.auth_user_id], ["staff", P("staff")?.auth_user_id], ["kiosk", kd?.auth_user_id]]) { if (!uid) continue; const r = await as(uid, "select (select count(*) from public.casts)::int c, (select count(*) from public.daily_reports)::int d"); o[k] = r.ok ? `${r.rows[0].c}/${r.rows[0].d}` : r.err; } return o; };
  const base = await reads();
  // 貼る前の形（v1 の前提）：レジの許可のあるキャストは同じ店の全員が読める
  await c.query("update public.stores set settings_json = settings_json || '{\"sys_cast_register\":1,\"cast_register_device\":\"own_phone\"}'::jsonb where id=$1", [ace]);
  await c.query("update public.memberships set can_register = true, cast_can_close = false where id=$1", [cast.mid]);
  const pre0 = await as(cast.auth_user_id, "select count(*)::int n from public.casts");
  console.log("-- 貼る前：レジの許可のあるキャストが読める casts", JSON.stringify(pre0.rows ?? pre0.err));
  const pr = (await c.query(fs.readFileSync(PRE, "utf8"))).rows;
  T("事前確認＝貼り先証明の 1 行だけ", pr.length === 1 && pr[0].k === "nox-project-proof", pr.map(flat));
  await c.query(BODY);
  const vr = (await c.query(fs.readFileSync(VER, "utf8"))).rows;
  const bad = []; for (const r of vr) { const k = String(r.k), v = String(r.v); if (k === "nox-project-proof") continue; const a = k.lastIndexOf("(expect "); if (a < 0 || !k.endsWith(")")) continue; if (k.slice(a + 8, -1) !== v) bad.push(`${k} → ${v}`); }
  T(`検証 ${vr.length} 行が全部期待値（関数 451・表 122 ほか）`, bad.length === 0, bad);
  // 1 レジの許可があるキャスト
  const own = await as(cast.auth_user_id, "select id from public.casts");
  T("1-1 レジの許可があるキャスト＝casts は自分の行だけ（ほかの人の行は読めない）", own.ok && own.rows.length === 1 && own.rows[0].id === me, own.ok ? own.rows.length : own.err);
  const ro = await as(cast.auth_user_id, "select * from public.register_cast_roster($1)", [ace]);
  T("1-2 register_cast_roster＝店の全員・5 列だけ（id・name・photo_updated_at・rank_id・is_active）", ro.ok && ro.rows.length === (pre0.rows?.[0]?.n ?? -1) && ro.fields.join(",") === "id,name,photo_updated_at,rank_id,is_active", ro.ok ? { n: ro.rows.length, f: ro.fields } : ro.err);
  // 2 締めの許可
  const d0 = await as(cast.auth_user_id, "select count(*)::int n from public.daily_reports");
  T("2-1 締めの許可が無いキャスト＝daily_reports は 0 行", d0.ok && d0.rows[0].n === 0, d0.ok ? d0.rows[0] : d0.err);
  await c.query("update public.memberships set cast_can_close = true where id=$1", [cast.mid]);
  let act = await as(cast.auth_user_id, "select public.auth_cast_close_ok($1) ok", [ace]);
  if (act.ok && !act.rows[0].ok) { await c.query("insert into public.punches (org_id, store_id, cast_id, punched_at, type, source) select org_id, id, $2, now(), 'in', 'self' from public.stores where id=$1", [ace, me]); act = await as(cast.auth_user_id, "select public.auth_cast_close_ok($1) ok", [ace]); console.log("-- 出勤中にするため打刻 in を 1 行（tx の中・ROLLBACK で消える）"); }
  const d1 = await as(cast.auth_user_id, "select count(*)::int n from public.daily_reports");
  T("2-2 締めの許可がある人（出勤中）＝daily_reports が読める", act.ok && act.rows[0].ok === true && d1.ok && d1.rows[0].n > 0, { close_ok: act.ok ? act.rows[0].ok : act.err, n: d1.ok ? d1.rows[0].n : d1.err });
  // 3 どちらも無い
  await c.query("update public.memberships set can_register = false, cast_can_close = false where id=$1", [cast.mid]);
  const r3 = await as(cast.auth_user_id, "select * from public.register_cast_roster($1)", [ace]);
  T("3 レジの許可も締めの許可も無いキャスト＝roster は forbidden", !r3.ok && /forbidden/.test(r3.err), r3.ok ? r3.rows.length : r3.err);
  await c.query("update public.memberships set can_register = true where id=$1", [cast.mid]);
  // 4 ほかの人の読取は同じ
  const after4 = await reads();
  T("4 店長・スタッフ・オーナー・店の端末の読取（casts／daily_reports の件数）は貼る前と同じ", JSON.stringify(after4) === JSON.stringify(base), { base, after4 });
  // 5 ほかの店・店長・anon
  const r5 = await as(cast.auth_user_id, "select * from public.register_cast_roster($1)", [muse]);
  T("5-1 ほかの店の id＝forbidden", !r5.ok && /forbidden/.test(r5.err), r5.ok ? r5.rows.length : r5.err);
  const r6 = await as(P("manager").auth_user_id, "select * from public.register_cast_roster($1)", [ace]);
  T("5-2 店長が呼ぶ＝forbidden（is distinct from 'cast'）", !r6.ok && /forbidden/.test(r6.err), r6.ok ? r6.rows.length : r6.err);
  if (kd) { const r7 = await as(kd.auth_user_id, "select * from public.register_cast_roster($1)", [ace]); T("5-3 店の端末（役割 null）が呼ぶ＝forbidden", !r7.ok && /forbidden/.test(r7.err), r7.ok ? r7.rows.length : r7.err); }
  const an = await as(null, "select * from public.register_cast_roster($1)", [ace], "anon");
  T("5-4 anon＝permission denied", !an.ok && /permission denied/.test(an.err), an.err);
  console.log("in tx", JSON.stringify(await cnt()), `${Date.now() - T0}ms`);
} finally {
  await c.query("rollback");
  console.log("試走の終わり", new Date().toISOString());
}
const after = await cnt(); console.log("after", JSON.stringify(after), "DB 変更 0 =", JSON.stringify(after) === JSON.stringify(before));
console.log(`result ${res.filter(Boolean).length}/${res.length}`);
await c.end();
