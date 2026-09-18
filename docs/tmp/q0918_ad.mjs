// AD: 0149／0150 の突合（起草者を疑う別パス・読取＋BEGIN…ROLLBACK・恒久変更 0・教訓88）
//   実行: npx tsx docs/tmp/q0918_ad.mjs（lib の .ts を import）
import { Client } from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { groupDueFull } from "../../lib/nox/check-calc.ts";
process.loadEnvFile(".env.local");
const MIG = "supabase/migrations/0149_demo_org_reset.sql";
const MIG2 = "supabase/migrations/0150_service_role_timeout.sql";
const sql = fs.readFileSync(MIG, "utf8");
const R = { a: [], b: [], c: [], d: [], e: [], f: [], g: [], h: {} };
const ok = (bucket, label, cond, detail = "") => { R[bucket].push({ label, ok: !!cond, detail }); };
const norm = (s) => s.replace(/\s+/g, " ").trim();
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 180000 });
try {
  await db.connect();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const one = async (s, p = []) => (await q(s, p))[0];

  // ── a. ★以外の diff 0（写経元 3 本）
  const pol = await q("select policyname, qual, with_check from pg_policies where schemaname='storage' and tablename='objects' order by 1");
  const live = Object.fromEntries(pol.map((p) => [p.policyname, p]));
  const clause = "and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)";
  const block = (name, kw) => { const i = sql.indexOf(`create policy ${name} on storage.objects`); const j = sql.indexOf(";", i); return sql.slice(i, j); };
  const insBlk = block("cast_photos_insert"); const updBlk = block("cast_photos_update");
  const stripped = (blk) => norm(blk.replace(/-- ★10/g, "")).replace(norm(clause), "").replace(/\s+\)/g, ")");
  const insWC = insBlk.slice(insBlk.indexOf("with check (") + "with check (".length, insBlk.lastIndexOf(")"));
  const insCore = norm(insWC.replace(clause, "").replace(/-- ★10/g, "")).replace(/\s*and\s*$/, "");
  ok("a", "a-1 storage insert policy: with_check＝live 逐語＋★10 句のみ", insCore === norm(live.cast_photos_insert.with_check), `mig=${insCore.slice(0, 120)}… live=${norm(live.cast_photos_insert.with_check).slice(0, 120)}…`);
  const updUsing = updBlk.slice(updBlk.indexOf("using (") + "using (".length, updBlk.indexOf("with check ("));
  const updWC = updBlk.slice(updBlk.indexOf("with check (") + "with check (".length, updBlk.lastIndexOf(")"));
  const coreOf = (s) => norm(s.replace(clause, "").replace(/-- ★10/g, "")).replace(/\s*and\s*\)\s*$/, "").replace(/\s*and\s*$/, "").replace(/\)\s*$/, "").trim();
  ok("a", "a-2 storage update policy: using／with_check＝live 逐語＋★10 句のみ", coreOf(updUsing).startsWith(norm(live.cast_photos_update.qual).slice(0, 200)) && coreOf(updWC).startsWith(norm(live.cast_photos_update.with_check).slice(0, 200)), "");
  ok("a", "a-3 storage select policy は不触（mig に cast_photos_select の drop／create なし）", !sql.includes("cast_photos_select"));
  const grantLines = sql.match(/^revoke all on function public\.demo_org_reset\(uuid, jsonb, text\) from public, anon, authenticated;\n^grant  execute on function public\.demo_org_reset\(uuid, jsonb, text\) to service_role;/m);
  ok("a", "a-4 revoke／grant＝写経元 0016:501〜502 の形（revoke … from public, anon, authenticated／grant  execute … to service_role・二重スペース込み）", !!grantLines);
  const auditCall = sql.match(/perform public\.audit_log_write_service\(p_org_id, null, 'demo\.reset',\s*'orgs:' \|\| p_org_id::text,\s*null,\s*jsonb_build_object\('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted\), null\);/);
  const liveSig = (await one("select pg_get_function_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace and proname='audit_log_write_service'")).a;
  ok("a", "a-5 監査＝audit_log_write_service の live 署名（8 引数・p_org_id, p_actor, p_action, p_target, p_before, p_after, p_store_id[, p_reason]）に沿う呼び出し", !!auditCall && liveSig.startsWith("p_org_id uuid, p_actor uuid, p_action text, p_target text"), liveSig);
  ok("a", "a-6 secdef 骨格＝写経元どおり（security definer・set search_path = public・language plpgsql）", /security definer\nset search_path = public/.test(sql) && sql.includes("language plpgsql"));
  const fnBody = sql.slice(sql.indexOf("create or replace function public.demo_org_reset"), sql.indexOf("end $$;") + 7);
  ok("a", "a-7 課金ゲート行を置かない（関数本文に 'billing locked' なし＝名簿 B(a)・ヘッダ注記の文字列は prosrc 外）", !fnBody.includes("billing locked"));

  // ── b. 表順 68 手＝w2 逐語・実在・org_id・FK 順
  const wipeArr = sql.match(/c_wipe constant text\[\] := array\[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map((s) => s.replace(/'/g, ""));
  const loadArr = sql.match(/c_load constant text\[\] := array\[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map((s) => s.replace(/'/g, ""));
  const w2 = fs.readFileSync("docs/tmp/0149_pre.md", "utf8");
  const w2line = w2.slice(w2.indexOf("削除順: 1 advances"), w2.indexOf("投入順＝逆順"));
  const w2Arr = [...w2line.matchAll(/\d+ \**([a-z_]+)/g)].map((m) => m[1]);
  ok("b", "b-1 c_wipe 68 手＝w2 の 1〜68 逐語（53 手目 stock_logs）", wipeArr.length === 68 && JSON.stringify(wipeArr) === JSON.stringify(w2Arr) && wipeArr[52] === "stock_logs", `mig=${wipeArr.length} w2=${w2Arr.length} diff=${wipeArr.map((t, i) => (t !== w2Arr[i] ? `${i + 1}:${t}/${w2Arr[i]}` : null)).filter(Boolean).join(",")}`);
  const expectLoad = [...wipeArr.slice(0, 52), ...wipeArr.slice(53)].reverse();
  ok("b", "b-2 c_load 67 表＝削除順の逆（53 手目を除く）", loadArr.length === 67 && JSON.stringify(loadArr) === JSON.stringify(expectLoad), loadArr.map((t, i) => (t !== expectLoad[i] ? `${i + 1}:${t}/${expectLoad[i]}` : null)).filter(Boolean).join(","));
  const liveTables = new Set((await q("select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).map((r) => r.t));
  const orgCols = new Set((await q("select table_name t from information_schema.columns where table_schema='public' and column_name='org_id'")).map((r) => r.t));
  const uniq = [...new Set(wipeArr)];
  ok("b", "b-3 68 手の表名が live に全て実在・全表が org_id 列を持つ", uniq.every((t) => liveTables.has(t)) && uniq.every((t) => orgCols.has(t)), uniq.filter((t) => !liveTables.has(t) || !orgCols.has(t)).join(","));
  const fks = await q("select c.conrelid::regclass::text child, c.confrelid::regclass::text parent, pg_get_constraintdef(c.oid) def from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'");
  const pos = (arr, t) => arr.indexOf(t);
  const wipeIdx = Object.fromEntries(uniq.map((t) => [t, wipeArr.indexOf(t)])); // 最初の出現（stock_logs は 46）
  const wipeViol = fks.filter((f) => f.child !== f.parent && wipeIdx[f.child] !== undefined && wipeIdx[f.parent] !== undefined && wipeIdx[f.child] > wipeIdx[f.parent] && !(f.child === "stock_logs" && wipeArr.lastIndexOf("stock_logs") < wipeIdx[f.parent]));
  const loadViol = fks.filter((f) => f.child !== f.parent && pos(loadArr, f.child) >= 0 && pos(loadArr, f.parent) >= 0 && pos(loadArr, f.child) < pos(loadArr, f.parent));
  ok("b", `b-4 FK ${fks.length} 本に対し削除順の違反 0（子が親より後に来る FK なし・stock_logs は再削除で解消）`, wipeViol.length === 0, wipeViol.map((f) => `${f.child}→${f.parent}`).join(","));
  ok("b", "b-5 投入順の違反 0（親が子より後に来る FK なし）", loadViol.length === 0, loadViol.map((f) => `${f.child}→${f.parent}`).join(","));
  const selfRef = fks.filter((f) => f.child === f.parent && uniq.includes(f.child)).map((f) => f.child + ": " + f.def);
  R.b.push({ label: "b-6 自己参照 FK（投入順で親行が先に要る表＝要注意）", ok: true, detail: selfRef.join(" | ") || "なし" });

  // ── c. 残す 4 表を参照する FK
  const keepRef = fks.filter((f) => ["orgs", "org_billing", "users", "memberships"].includes(f.parent) && uniq.includes(f.child));
  ok("c", `c-1 残す 4 表を親に持つ FK＝${keepRef.length} 本（users／memberships は id 不変＝payload が録画時の id を持てば成立・orgs は p_org_id 一致を ★6 で検査）`, keepRef.length > 0, [...new Set(keepRef.map((f) => f.child))].join(","));

  // ── d. orgs 列 pin・grant
  const pins = [];
  for (const f of fs.readdirSync("scripts").filter((x) => x.startsWith("verify-nox-") && x.endsWith(".ts"))) {
    const s = fs.readFileSync("scripts/" + f, "utf8");
    if (/table_name\s*=\s*'orgs'|table_name = \$1[^\n]*orgs|from\("orgs"\)\.select\("\*"\)/.test(s)) pins.push(f);
  }
  ok("d", "d-1 orgs の列数・列名を pin する suite＝0（w1 再確認・grep）", pins.length === 0, pins.join(","));
  const tg = await q("select grantee, string_agg(privilege_type, ',') p from information_schema.role_table_grants where table_schema='public' and table_name='orgs' and grantee in ('authenticated','anon') group by 1");
  ok("d", "d-2 orgs の grant は表単位（authenticated=SELECT）＝新列 is_demo／demo_reset_at も authenticated から読める（RLS orgs_select＝自 org のみ）・列単位の revoke なし", tg.length === 1 && tg[0].grantee === "authenticated" && tg[0].p === "SELECT", JSON.stringify(tg));

  // ── e. 拾われる pin
  const doc = fs.readFileSync("docs/NOX_課金ゲート対象_v1.md", "utf8");
  const ba = doc.slice(doc.indexOf("### B(a)"), doc.indexOf("### B(b)"));
  const baNames = ba.match(/[a-z_]+(?= \/|\n)/g) || [];
  const gatedNow = (await one("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%'")).n;
  const totalNow = (await one("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace")).n;
  R.e.push({ label: "e-1 名簿 B(a) の現在の見出し", ok: true, detail: ba.split("\n")[0] });
  ok("e", `e-2 live 全数 ${totalNow}→246 見込み（demo_org_reset 追加）・gated ${gatedNow} 不変`, totalNow === 245 && gatedNow === 128, `total=${totalNow} gated=${gatedNow}`);
  const ag = fs.readFileSync("scripts/verify-nox-anon-guard.ts", "utf8");
  ok("e", "e-3 anon-guard の INTERNAL_PROBES（anon かつ authenticated で BLOCKED）が存在＝demo_org_reset を 1 本足す張り替え点", ag.includes("const INTERNAL_PROBES"));
  const md5s = await q("select proname, md5(prosrc) m from pg_proc where pronamespace='public'::regnamespace and (proname in ('check_pay','check_close','check_void','check_group_due','audit_log_write_service','payroll_mark_paid') or proname like 'set\\_store\\_%') order by 1");
  R.e.push({ label: "e-4 不触の md5 控え（手貼り後に照合）", ok: true, detail: md5s.map((r) => `${r.proname}=${r.m.slice(0, 8)}`).join(" ") });

  // ── f/g. ROLLBACK 実証
  const st = await one("select id, org_id from stores where name='NOX-VERIFY-A1'");
  const orgA = st.org_id;
  const orgB = (await one("select id from orgs where name='NOX-VERIFY-B'")).id;
  const owner = await one("select id, auth_user_id from users where email='nox-verify-owner-a@example.com' and is_active");
  const seats = await q("select id from seats where store_id=$1 and is_active order by name limit 5", [st.id]);
  const prodDrink = await one("select id from products where store_id=$1 and name='NOX-VERIFY-指名ドリンク' and is_active", [st.id]);
  const prodChamp = await one("select id from products where store_id=$1 and name='NOX-VERIFY-シャンパン' and is_active", [st.id]);
  const casts = await q("select id from casts where store_id=$1 and is_active order by name", [st.id]);
  const cust = await one("select id from customers where store_id=$1 and name='NOX-VERIFY-顧客-フリー'", [st.id]);
  const snapSql = "select (select count(*) from checks where org_id=$1)::int c, (select count(*) from check_lines where org_id=$1)::int l, (select count(*) from stock_logs where org_id=$1)::int sl, (select count(*) from audit_logs where org_id=$1)::int au, (select count(*) from casts where org_id=$1)::int ca, (select count(*) from products where org_id=$1)::int pr, (select count(*)::int from information_schema.columns where table_schema='public' and table_name='orgs' and column_name in ('is_demo','demo_reset_at')) newcols, (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset') fn, (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='storage') pol, (select count(*)::int from information_schema.columns where table_name='orgs') ocols";
  const before = JSON.stringify(await one(snapSql, [orgA]));
  const asUid = async (uid) => { await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); await db.query("set local role authenticated"); };
  const asPg = async () => db.query("reset role");
  const call = async (s, p = []) => { await db.query("savepoint sp"); try { const r = await q(s, p); await db.query("release savepoint sp"); return { ok: true, rows: r }; } catch (e) { await db.query("rollback to savepoint sp"); return { ok: false, err: e.message }; } };
  await db.query("begin");
  try {
    // 0149 全文（begin／commit を除く）
    const body = sql.slice(sql.indexOf("\nbegin;\n") + 8, sql.lastIndexOf("\ncommit;\n"));
    await db.query(body);
    ok("f", "f-0 0149 本文が 1 tx 内で通る（列 2・関数・revoke／grant・policy 4 文）", true);
    const acl = (await one("select proacl::text a from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset'")).a;
    ok("f", "f-1 proacl＝{postgres=X/postgres,service_role=X/postgres}", acl === "{postgres=X/postgres,service_role=X/postgres}", acl);
    // 5 枚を録画（PoC と同じ）
    await asUid(owner.auth_user_id);
    await call("select public.set_store_time_pricing($1, 60, 5000, 30, 3000, 'manual', 'table')", [st.id]);
    await call("select public.set_store_pricing($1, 3000, 2000, 5000, 10, 5, 100, 'down')", [st.id]);
    const openChk = async (seat, people, nom, customer = null) => { const r = await call("select public.check_open($1, $2, $3, $4) as id", [seat, people, nom, customer]); if (!r.ok) throw new Error("check_open: " + r.err); return r.rows[0].id; };
    const pay = async (chk, method, amount) => call("select public.check_pay($1, $2, $3, 'A', $5, $4::uuid, null)", [chk, method, amount, randomUUID(), method === "cash" ? amount : null]);
    const close = async (chk) => call("select public.check_close($1, $2::uuid)", [chk, randomUUID()]);
    const totalOf = async (chk) => (await one("select total from checks where id=$1", [chk])).total;
    const ids = [];
    { const c = await openChk(seats[0].id, 2, "free"); await pay(c, "cash", await totalOf(c)); await close(c); ids.push(c); }
    { const c = await openChk(seats[1].id, 1, "hon"); await call("select public.check_set_nominations($1, $2::jsonb)", [c, JSON.stringify([{ cast_id: casts[0].id, weight: 1, nom_kind: "hon", is_dohan: false, ended: false }])]); await call("select public.check_shimei_add($1, $2, 'hon', $3::uuid)", [c, casts[0].id, randomUUID()]); await call("select public.check_add_line($1, $2, 3, null, 'A', null, null)", [c, prodDrink.id]); await pay(c, "cash", await totalOf(c)); await close(c); ids.push(c); }
    { const c = await openChk(seats[2].id, 2, "dohan"); await call("select public.check_set_nominations($1, $2::jsonb)", [c, JSON.stringify([{ cast_id: casts[1].id, weight: 1, nom_kind: "hon", is_dohan: true, ended: false }])]); await call("select public.check_dohan_add($1, $2, 1, $3::uuid)", [c, casts[1].id, randomUUID()]); await call("select public.check_add_line($1, $2, 1, null, 'A', null, null)", [c, prodChamp.id]); await pay(c, "card", await totalOf(c)); await close(c); ids.push(c); }
    { const c = await openChk(seats[3].id, 3, "free"); await asPg(); await db.query("update checks set started_at = now() - interval '95 minutes' where id=$1", [c]); await asUid(owner.auth_user_id); await call("select public.check_time_charge_apply($1)", [c]); await pay(c, "cash", await totalOf(c)); await close(c); ids.push(c); }
    { const c = await openChk(seats[4].id, 2, "free", cust.id); await call("select public.check_add_line($1, null, 1, 'custom', 'A', 'AD カスタム', 3000)", [c]); await call("select public.check_add_referral($1, $2, 2000, 'AD 紹介', $3::uuid)", [c, casts[0].id, randomUUID()]); await pay(c, "ar", await totalOf(c)); await close(c); ids.push(c); }
    await asPg();
    const rec = [];
    for (const id of ids) rec.push({ id, due: (await one("select public.check_group_due($1,'A') d", [id])).d, total: (await one("select total from checks where id=$1", [id])).total, lineTimes: (await q("select product_id, qty, created_at from check_lines where check_id=$1 and product_id is not null order by created_at", [id])) });
    ok("f", "f-2 録画 5 枚＝close 済み・total＝due", rec.every((r) => r.total === r.due), JSON.stringify(rec.map((r) => r.due)));
    // org A 全体を payload に（audit_logs は入れない＝277-4・stock_logs の sale／sale_remove は除く）
    const loadArr2 = loadArr;
    const payload = {}; const beforeCounts = {};
    for (const t of loadArr2) {
      const rows = await q(`select * from public."${t}" where org_id=$1`, [orgA]);
      beforeCounts[t] = rows.length;
      if (t === "audit_logs") continue;
      const use = t === "stock_logs" ? rows.filter((r) => !["sale", "sale_remove"].includes(r.reason)) : rows;
      if (use.length) payload[t] = use;
    }
    const saleBefore = (await one("select count(*)::int n from stock_logs where org_id=$1 and reason='sale'", [orgA])).n;
    const productLines = (await one("select count(*)::int n from check_lines where org_id=$1 and product_id is not null and qty<>0", [orgA])).n;
    const payloadStr = JSON.stringify(payload);
    R.f.push({ label: "f-3 payload（org A 全体・audit 除く）", ok: true, detail: `表 ${Object.keys(payload).length}・行 ${Object.values(payload).reduce((a, r) => a + r.length, 0)}・${Buffer.byteLength(payloadStr)} B・stock_logs sale 除外 ${saleBefore}・product 行 ${productLines}` });
    // is_demo=true にして reset('all')
    await db.query("update orgs set is_demo = true where id = $1", [orgA]);
    const t0 = Date.now();
    let r1 = await call("select public.demo_org_reset($1, $2::jsonb, 'all') as r", [orgA, payloadStr]);
    let ms1 = Date.now() - t0;
    ok("f", `f-4 demo_org_reset('all')（起草どおり・stores を wipe に含む）が通る（${ms1} ms）`, r1.ok, r1.err || JSON.stringify(r1.rows[0].r).slice(0, 300));
    let variant = false;
    if (!r1.ok) {
      // ★起草停止点: memberships（残す表）.store_id → stores の FK で stores を消せない。判断材料として「stores も残す（c_keep 5 表）」変種を同 tx で実証する（mig ファイルは不変）
      const vbody = body.replace("'cast_ranks','stores'];", "'cast_ranks'];").replace(/array\[\s*'stores','cast_ranks'/, "array['cast_ranks'").replace("array['orgs','org_billing','users','memberships']", "array['orgs','org_billing','users','memberships','stores']");
      if (vbody === body) throw new Error("variant replace failed");
      const vfn = vbody.slice(vbody.indexOf("create or replace function public.demo_org_reset"), vbody.indexOf("end $$;") + 7);
      await db.query(vfn);
      delete payload.stores;
      const payloadStr2 = JSON.stringify(payload);
      const t0b = Date.now();
      r1 = await call("select public.demo_org_reset($1, $2::jsonb, 'all') as r", [orgA, payloadStr2]);
      ms1 = Date.now() - t0b; variant = true;
      ok("f", `f-4' 変種（stores も残す＝c_keep 5 表・wipe 67 手・load 66 表）で demo_org_reset('all') が通る（${ms1} ms）`, r1.ok, r1.err || JSON.stringify(r1.rows[0].r).slice(0, 300));
    }
    R.f.push({ label: "f-4 所要 ms" + (variant ? "（変種）" : ""), ok: true, detail: String(ms1) });
    const payloadStrUse = JSON.stringify(payload);
    if (r1.ok) {
      const afterCounts = {};
      for (const t of loadArr2) afterCounts[t] = (await one(`select count(*)::int n from public."${t}" where org_id=$1`, [orgA])).n;
      const diff = loadArr2.filter((t) => !["audit_logs", "stock_logs"].includes(t) && afterCounts[t] !== beforeCounts[t]).map((t) => `${t}:${beforeCounts[t]}→${afterCounts[t]}`);
      ok("f", "f-5 再生後の表別件数＝再生前（audit_logs／stock_logs 以外の全表）", diff.length === 0, diff.join(","));
      const saleAfter = (await one("select count(*)::int n from stock_logs where org_id=$1 and reason='sale'", [orgA])).n;
      ok("f", `f-6 stock_logs: sale 行はトリガ再生成＝product 行数（${productLines}）と一致・二重なし`, saleAfter === productLines, `saleAfter=${saleAfter} saleBefore=${saleBefore}`);
      const res = [];
      for (const r of rec) { const due = (await one("select public.check_group_due($1,'A') d", [r.id])).d; const c = await one("select total, service_rate, round_unit, round_mode, business_tax_status, price_display, tax_rounding from checks where id=$1", [r.id]); const lines = await q("select line_total, kind, tax_category from check_lines where check_id=$1 and pay_group='A'", [r.id]); res.push({ id: r.id.slice(0, 8), rec: r.due, due, total: c.total, mirror: groupDueFull(lines, c) }); }
      ok("f", "f-7 三点一致 5 枚（check_group_due＝録画値＝checks.total＝groupDueFull）", res.every((x) => x.due === x.rec && x.total === x.rec && x.mirror === x.rec), JSON.stringify(res));
      R.f.push({ label: "f-7 三点一致の値", ok: true, detail: JSON.stringify(res) });
      // ★7 stock_logs.at＝明細時刻
      const misAt = (await one("select count(*)::int n from stock_logs sl where sl.org_id=$1 and sl.reason='sale' and not exists (select 1 from check_lines l where l.org_id=sl.org_id and l.store_id=sl.store_id and l.product_id=sl.product_id and -l.qty=sl.delta and l.created_at=sl.at)", [orgA])).n;
      ok("f", "f-8 ★7 stock_logs.sale 行の at が対応する check_lines.created_at と一致（now() のまま残る行 0）", misAt === 0, `mismatch=${misAt}`);
      const o = await one("select is_demo, demo_reset_at from orgs where id=$1", [orgA]);
      ok("f", "f-9 demo_reset_at が更新・audit 'demo.reset' 1 行（mode all・deleted／inserted）", o.demo_reset_at !== null && (await one("select count(*)::int n from audit_logs where org_id=$1 and action='demo.reset'", [orgA])).n === 1);
      // raise 4 種
      const badOrg = { ...payload, checks: payload.checks.map((r, i) => (i === 0 ? { ...r, org_id: orgB } : r)) };
      const e1 = await call("select public.demo_org_reset($1, $2::jsonb, 'all')", [orgA, JSON.stringify(badOrg)]);
      ok("f", "f-10 raise 'org mismatch'（checks 1 行の org_id を B に）", !e1.ok && e1.err === "org mismatch", e1.err || "(no error)");
      const e2 = await call("select public.demo_org_reset($1, $2::jsonb, 'all')", [orgA, JSON.stringify({ ...payload, orgs: [] })]);
      const e2b = await call("select public.demo_org_reset($1, $2::jsonb, 'all')", [orgA, JSON.stringify({ ...payload, foo: [] })]);
      ok("f", "f-11 raise 'bad table'（残す表 orgs のキー／未知のキー foo）", !e2.ok && e2.err === "bad table" && !e2b.ok && e2b.err === "bad table", (e2.err || "") + "/" + (e2b.err || ""));
      const e3 = await call("select public.demo_org_reset($1, $2::jsonb, 'all')", [orgB, "{}"]);
      ok("f", "f-12 raise 'not demo'（is_demo=false の org B）", !e3.ok && e3.err === "not demo", e3.err || "(no error)");
      const e4 = await call("select public.demo_org_reset($1, $2::jsonb, 'all')", [orgA, JSON.stringify({ ...payload, stock_logs: [...(payload.stock_logs || []), { id: randomUUID(), org_id: orgA, store_id: st.id, product_id: prodDrink.id, delta: -1, reason: "sale", by_user_id: null, at: new Date().toISOString() }] })]);
      ok("f", "f-13 raise 'bad stock_logs'（payload に reason='sale' の行）", !e4.ok && e4.err === "bad stock_logs", e4.err || "(no error)");
      const e5 = await call("select public.demo_org_reset($1, $2::jsonb, 'nuke')", [orgA, "{}"]);
      const e6 = await call("select public.demo_org_reset($1, null, 'load')", [orgA]);
      ok("f", "f-14 raise 'bad mode'（nuke）／'bad payload'（load に null）", !e5.ok && e5.err === "bad mode" && !e6.ok && e6.err === "bad payload", (e5.err || "") + "/" + (e6.err || ""));
      // wipe のみ／load のみ
      const w = await call("select public.demo_org_reset($1, null, 'wipe') as r", [orgA]);
      const cntW = (await one("select (select count(*) from checks where org_id=$1)::int c, (select count(*) from casts where org_id=$1)::int ca, (select count(*) from users where org_id=$1)::int u, (select count(*) from orgs where id=$1)::int o", [orgA]));
      ok("f", "f-15 mode=wipe＝wipe 対象の表が 0（checks／casts）・users／orgs は残る", w.ok && cntW.c === 0 && cntW.ca === 0 && cntW.u > 0 && cntW.o === 1, JSON.stringify(cntW) + " " + (w.err || ""));
      const l = await call("select public.demo_org_reset($1, $2::jsonb, 'load') as r", [orgA, payloadStrUse]);
      const cntL = await one("select (select count(*) from checks where org_id=$1)::int c, (select count(*) from casts where org_id=$1)::int ca", [orgA]);
      ok("f", "f-16 mode=load で復元（wipe→load の 2 回呼び＝277-1 の代替経路）", l.ok && cntL.c === beforeCounts.checks && cntL.ca === beforeCounts.casts, JSON.stringify(cntL) + " " + (l.err || ""));
      // g. 冪等
      const t1 = Date.now();
      const g1 = await call("select public.demo_org_reset($1, $2::jsonb, 'all') as r", [orgA, payloadStrUse]);
      const ms2 = Date.now() - t1;
      const t2 = Date.now();
      const g2 = await call("select public.demo_org_reset($1, $2::jsonb, 'all') as r", [orgA, payloadStrUse]);
      const ms3 = Date.now() - t2;
      const cnt2 = {}; for (const t of loadArr2) cnt2[t] = (await one(`select count(*)::int n from public."${t}" where org_id=$1`, [orgA])).n;
      const diff2 = loadArr2.filter((t) => !["audit_logs"].includes(t) && cnt2[t] !== (t === "stock_logs" ? cnt2[t] : beforeCounts[t])).map((t) => `${t}:${beforeCounts[t]}→${cnt2[t]}`);
      const sums = await one("select sum(total)::int s from checks where org_id=$1", [orgA]);
      ok("g", `g-1 同 tx 内で 2 回連続 reset('all')＝件数・合計不変（${ms2} ms／${ms3} ms・Σtotal=${sums.s}）`, g1.ok && g2.ok && diff2.length === 0, diff2.join(",") + (g1.err || "") + (g2.err || ""));
      R.g.push({ label: "g-1 所要 ms（2 回目・3 回目）", ok: true, detail: `${ms2}／${ms3}` });
    }
  } finally {
    await db.query("rollback");
  }
  const after = JSON.stringify(await one(snapSql, [orgA]));
  ok("f", "f-17 ROLLBACK 後の snapshot 一致（checks／lines／stock_logs／audit／casts／products／orgs 列数 6／is_demo 列なし／storage policy 3 本）", after === before, `${before} → ${after}`);
  // ── h. sha256
  for (const f of [MIG, MIG2]) { const b = fs.readFileSync(f); R.h[f] = { sha256: crypto.createHash("sha256").update(b).digest("hex"), bytes: b.length, lines: b.toString("utf8").split("\n").length - (b.toString("utf8").endsWith("\n") ? 1 : 0) }; }
} finally {
  await db.end().catch(() => {});
}
fs.writeFileSync("docs/tmp/0149_ad_result.json", JSON.stringify(R, null, 1));
for (const k of ["a", "b", "c", "d", "e", "f", "g"]) for (const x of R[k]) console.log((x.ok ? "OK " : "NG ") + x.label + (x.detail ? " — " + x.detail.slice(0, 300) : ""));
console.log("h", JSON.stringify(R.h));
console.log(["a", "b", "c", "d", "e", "f", "g"].every((k) => R[k].every((x) => x.ok)) ? "AD: 致命 0" : "AD: NG あり");
