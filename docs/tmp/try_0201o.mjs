// try_0201o.mjs（2026-11-18・相談役 D）— 0201o v2 の試走（本番 BEGIN…ROLLBACK＝DB 変更 0）。前提＝0201m の後（関数 450・表 122）。
//   ★教訓128／132／149／150: 行頭マーカー・本文に commit／rollback が無い・lock_timeout・f0 の最中と手貼りの間は流さない。関数 1 本の差し替えだけ（表の錠は取らない）。
//   段（CLUB ACE のオーナー・tx の中で保存して確かめる＝ROLLBACK で戻る）:
//    1 reward_axis：'pay_rate' を保存できる・null で鍵が消える・'bad' は bad reward_axis・数は 'bad type'
//    2 kiosk_features：inventory・report（boolean）を保存できる・今までの鍵（punch など）も通る・知らない鍵は bad kiosk_features・文字は bad kiosk_features
//    3 biz_type：'host' を保存できる・'club' は bad biz_type
//    4 今までの鍵（sys_backs・slide_apply）は前と同じに通る・anon＝permission denied
//   使い方: node docs/tmp/try_0201o.mjs
process.loadEnvFile(".env.local");
import pg from "pg";
import fs from "node:fs";
const MIG = "docs/tmp/0201o_store_reward_axis.sql", PRE = "docs/tmp/0201o_precheck.sql", VER = "docs/tmp/0201o_verify.sql";
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
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-cc-try-0201o" });
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
      return { ok: true, rows: r.rows };
    } catch (e) { await c.query("rollback to savepoint a"); await c.query("reset role"); return { ok: false, err: e.message }; }
  };
  const pr = (await c.query(fs.readFileSync(PRE, "utf8"))).rows;
  T("事前確認＝貼り先証明の 1 行だけ（関数 450・表 122・底本の md5 と同じ）", pr.length === 1 && pr[0].k === "nox-project-proof", pr.map(flat));
  await c.query(BODY);
  const vr = (await c.query(fs.readFileSync(VER, "utf8"))).rows;
  const bad = []; for (const r of vr) { const k = String(r.k), v = String(r.v); if (k === "nox-project-proof") continue; const a = k.lastIndexOf("(expect "); if (a < 0 || !k.endsWith(")")) continue; if (k.slice(a + 8, -1) !== v) bad.push(`${k} → ${v}`); }
  T(`検証 ${vr.length} 行が全部期待値`, bad.length === 0, bad);
  const ace = (await c.query("select id from public.stores where name='CLUB ACE'")).rows[0].id;
  const owner = (await c.query("select u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role='owner' and m.is_active limit 1", [ace])).rows[0].auth_user_id;
  const save = (patch) => as(owner, "select public.set_store_profile($1, $2::jsonb)", [ace, JSON.stringify(patch)]);
  const sj = async () => (await c.query("select settings_json from public.stores where id=$1", [ace])).rows[0].settings_json;
  // 1 reward_axis
  const a1 = await save({ reward_axis: "pay_rate" }); const s1 = await sj();
  T("1-1 reward_axis＝'pay_rate' を保存できる", a1.ok && s1.reward_axis === "pay_rate", a1.ok ? s1.reward_axis : a1.err);
  const a2 = await save({ reward_axis: null }); const s2 = await sj();
  T("1-2 null で鍵が消える（今のフラグからの導出に戻る）", a2.ok && !("reward_axis" in s2), a2.ok ? Object.keys(s2).includes("reward_axis") : a2.err);
  const a3 = await save({ reward_axis: "bad" }), a4 = await save({ reward_axis: 1 });
  T("1-3 'bad'＝bad reward_axis・数＝bad type", !a3.ok && /bad reward_axis/.test(a3.err) && !a4.ok && /bad type/.test(a4.err), [a3.err, a4.err]);
  // 2 kiosk_features
  const k1 = await save({ kiosk_features: { punch: true, register: true, shift: false, inventory: true, report: false } }); const ks = (await sj()).kiosk_features;
  T("2-1 kiosk_features に inventory・report を保存できる（今までの鍵も）", k1.ok && ks?.inventory === true && ks?.report === false && ks?.punch === true, k1.ok ? ks : k1.err);
  const k2 = await save({ kiosk_features: { foo: true } }), k3 = await save({ kiosk_features: { inventory: "yes" } });
  T("2-2 知らない鍵・文字の値＝bad kiosk_features", !k2.ok && /bad kiosk_features/.test(k2.err) && !k3.ok && /bad kiosk_features/.test(k3.err), [k2.err, k3.err]);
  // 3 biz_type
  const b1 = await save({ biz_type: "host" }); const bs = (await sj()).biz_type;
  const b2 = await save({ biz_type: "club" });
  T("3 biz_type＝'host' を保存できる・'club' は bad biz_type", b1.ok && bs === "host" && !b2.ok && /bad biz_type/.test(b2.err), [b1.ok ? bs : b1.err, b2.err]);
  // 4 今までの鍵・anon
  const o1 = await save({ sys_backs: true, slide_apply: "next" });
  T("4-1 今までの鍵（sys_backs・slide_apply）は前と同じに通る", o1.ok, o1.err);
  const an = await as(null, "select public.set_store_profile($1, '{}'::jsonb)", [ace], "anon");
  T("4-2 anon＝permission denied", !an.ok && /permission denied/.test(an.err), an.err);
  console.log("in tx", JSON.stringify(await cnt()), `${Date.now() - T0}ms`);
} finally {
  await c.query("rollback");
  console.log("試走の終わり", new Date().toISOString());
}
const after = await cnt(); console.log("after", JSON.stringify(after), "DB 変更 0 =", JSON.stringify(after) === JSON.stringify(before));
console.log(`result ${res.filter(Boolean).length}/${res.length}`);
await c.end();
