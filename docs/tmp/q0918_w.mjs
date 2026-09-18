// W: 0149 事前読取の追補（読取のみ・教訓88）
import { Client } from "pg";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
const out = [];
const NL = "\n";
try {
  await db.connect();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  // w1 orgs
  out.push("## w1 orgs 表定義（逐語）");
  out.push((await q("select string_agg(column_name||' '||data_type||(case when is_nullable='NO' then ' NOT NULL' else '' end)||coalesce(' DEFAULT '||column_default,''), chr(10) order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name='orgs'"))[0].s);
  out.push((await q("select string_agg(conname||': '||pg_get_constraintdef(oid), chr(10) order by conname) s from pg_constraint where conrelid='public.orgs'::regclass"))[0].s);
  out.push((await q("select string_agg(indexdef, chr(10)) s from pg_indexes where tablename='orgs'"))[0].s);
  out.push("orgs の trigger: " + JSON.stringify(await q("select tgname from pg_trigger where tgrelid='public.orgs'::regclass and not tgisinternal")));
  out.push("orgs の grants: " + JSON.stringify(await q("select grantee, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and table_name='orgs' group by grantee order by 1")));
  out.push("orgs の policy: " + JSON.stringify(await q("select policyname, cmd, roles::text, qual from pg_policies where tablename='orgs'")));
  // w2
  const tables = (await q("select c.table_name t from information_schema.columns c join information_schema.tables tt on tt.table_name=c.table_name and tt.table_schema='public' and tt.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='org_id' order by 1")).map((r) => r.t);
  const fks = await q("select c.conrelid::regclass::text child, c.confrelid::regclass::text parent, pg_get_constraintdef(c.oid) def from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'");
  const keep = new Set(["orgs", "org_billing", "users", "memberships"]);
  const set = new Set(tables.filter((t) => !keep.has(t)));
  const parents = {}; for (const t of set) parents[t] = new Set();
  for (const f of fks) if (set.has(f.child) && set.has(f.parent) && f.child !== f.parent) parents[f.child].add(f.parent);
  const order = []; const placed = new Set(); let g = 0;
  while (placed.size < set.size && g++ < 200) for (const t of set) { if (placed.has(t)) continue; if (![...set].some((c) => !placed.has(c) && c !== t && parents[c].has(t))) { order.push(t); placed.add(t); } }
  const i = order.indexOf("check_lines"); const del = [...order]; del.splice(i + 1, 0, "stock_logs（再削除）");
  out.push(NL + "## w2 削除順（確定形・残す 4 表を除く " + order.length + " 表＋stock_logs 再削除＝" + del.length + " 手）" + NL + del.map((t, k) => (k + 1) + ". " + t).join(NL));
  out.push("投入順＝上の逆順（stock_logs の 2 回目は投入しない・stock_logs の sale 行は payload に入れない・drink_claims は最後）。");
  const cols = await q("select table_name, column_name, is_generated, is_identity, column_default, data_type from information_schema.columns where table_schema='public' and table_name = any($1) order by table_name, ordinal_position", [order]);
  const byT = {}; for (const c of cols) (byT[c.table_name] ??= []).push(c);
  const trg = await q("select c.relname t, string_agg(t.tgname||'->'||p.proname, ', ') s from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and c.relnamespace='public'::regnamespace group by 1");
  const trgOf = Object.fromEntries(trg.map((r) => [r.t, r.s]));
  out.push(NL + "## w2 各表の列の性質（generated／identity／default now()／トリガ）" + NL + "| 表 | generated | identity | default now() 系 | トリガ | 列数 |" + NL + "|---|---|---|---|---|---|");
  for (const t of order) {
    const cs = byT[t] ?? [];
    const gen = cs.filter((c) => c.is_generated === "ALWAYS").map((c) => c.column_name).join(",") || "-";
    const idn = cs.filter((c) => c.is_identity === "YES").map((c) => c.column_name).join(",") || "-";
    const nowc = cs.filter((c) => /now\(\)|current_date|current_timestamp/i.test(c.column_default || "")).map((c) => c.column_name).join(",") || "-";
    out.push("| " + t + " | " + gen + " | " + idn + " | " + nowc + " | " + (trgOf[t] || "-").replace(/[a-z_]+_touch_updated_at->touch_updated_at/g, "touch_updated_at") + " | " + cs.length + " |");
  }
  out.push("トリガで書かれる列＝touch_updated_at（BEFORE UPDATE＝INSERT では動かない）／stock_on_check_line（check_lines INSERT→stock_logs の sale 行を自動生成）／drink_claims_* は DELETE／UPDATE 時のみ。");
  const refU = fks.filter((f) => f.parent === "users" || f.parent === "memberships").map((f) => f.child + ": " + f.def);
  out.push(NL + "## w2 users／memberships を参照する FK" + NL + refU.map((x) => "- " + x).join(NL));
  out.push("casts の列: " + (await q("select string_agg(column_name||':'||data_type||(case when is_nullable='NO' then '!' else '' end), ', ' order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name='casts'"))[0].s);
  // w3
  const svc = await q("select proname, proacl::text acl from pg_proc where pronamespace='public'::regnamespace and prosecdef and proacl::text like '%service_role=X%' and proacl::text not like '%authenticated=X%' and proacl::text not like '%anon=X%' order by 1");
  out.push(NL + "## w3 service_role 限定（authenticated／anon なし）の SECURITY DEFINER 関数＝" + svc.length + " 本" + NL + svc.map((r) => "- " + r.proname + " " + r.acl).join(NL));
  const d = (await q("select pg_get_functiondef(oid) d, proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname='payroll_mark_paid'"))[0];
  out.push(NL + "### 写経元 payroll_mark_paid（proacl " + d.acl + "）" + NL + "```sql" + NL + d.d + NL + "```");
  const alw = await q("select proname, pg_get_function_arguments(oid) a, proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname in ('audit_log_write','audit_log_write_service') order by 1");
  out.push("audit_log_write 系の live 署名:" + NL + alw.map((r) => "- " + r.proname + "(" + r.a + ") acl=" + r.acl).join(NL));
  // w4
  out.push(NL + "## w4 statement_timeout の実効値");
  out.push("pg_db_role_setting: " + JSON.stringify(await q("select r.rolname, d.datname, s.setconfig from pg_db_role_setting s join pg_roles r on r.oid=s.setrole left join pg_database d on d.oid=s.setdatabase order by 1")));
  out.push("pg_roles.rolconfig: " + JSON.stringify(await q("select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','postgres') order by 1")));
  out.push("現接続（postgres・直結）の statement_timeout: " + JSON.stringify(await q("show statement_timeout")));
  out.push("関数レベル SET statement_timeout の前例: " + JSON.stringify(await q("select proname, proconfig from pg_proc where pronamespace='public'::regnamespace and proconfig::text like '%statement_timeout%'")));
  out.push("proconfig の種類: " + JSON.stringify(await q("select proconfig::text c, count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proconfig is not null group by 1 order by 2 desc")));
  // w5
  out.push(NL + "## w5 storage cast-photos");
  out.push("buckets: " + JSON.stringify(await q("select id, public, file_size_limit, allowed_mime_types from storage.buckets")));
  out.push("policies: " + JSON.stringify(await q("select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='storage' order by 1")));
  out.push("objects の現行パス例: " + JSON.stringify(await q("select name, bucket_id from storage.objects order by created_at desc limit 5")));
  // w6
  out.push(NL + "## w6 デモのログイン用ユーザー");
  out.push("casts.user_id: " + JSON.stringify(await q("select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='casts' and column_name='user_id'")));
  out.push("casts の FK: " + JSON.stringify(fks.filter((f) => f.child === "casts")));
  out.push("kiosk_devices の列: " + (await q("select string_agg(column_name||':'||data_type||(case when is_nullable='NO' then '!' else '' end), ', ' order by ordinal_position) s from information_schema.columns where table_schema='public' and table_name='kiosk_devices'"))[0].s);
  out.push("NOX-DEMO の casts×users: " + JSON.stringify(await q("select count(*)::int casts, count(user_id)::int with_user from casts c join orgs o on o.id=c.org_id where o.name='NOX-DEMO'")));
  out.push("NOX-DEMO の memberships（role 別）: " + JSON.stringify(await q("select m.role, count(*)::int n from memberships m join users u on u.id=m.user_id join orgs o on o.id=u.org_id where o.name='NOX-DEMO' group by 1 order by 1")));
  fs.writeFileSync("docs/tmp/0918_w_live.md", "# 0918_w_live — W の live 読取（逐語・2026-09-18）" + NL + NL + out.join(NL));
  console.log("written", out.join(NL).length);
  console.log(out.filter((l) => /^## |^pg_|^現接続|^関数レベル|^proconfig|^casts\.user_id|^NOX-DEMO|^buckets|^policies|^\d+\. /.test(l)).join(NL).slice(0, 7000));
} finally { await db.end().catch(() => {}); }
