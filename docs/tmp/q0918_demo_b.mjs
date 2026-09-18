// O-b/c/h/i: FK 順・トリガ・prosrc の now()／actor・課金ゲート述語・自由入力 text 列（読取のみ・教訓88）
import { Client } from "pg";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
const out = [];
try {
  await db.connect();
  const q = async (s, p=[]) => (await db.query(s, p)).rows;
  // b. トリガ
  const trg = await q("select c.relname tbl, t.tgname, pg_get_triggerdef(t.oid) def, p.proname fn, md5(p.prosrc) m from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal order by 1,2");
  out.push("## b-1 トリガ（public・内部除く）", ...trg.map(r=>`- ${r.tbl}.${r.tgname}: ${r.def} ／ fn=${r.fn} md5=${r.m}`));
  const trgFns = [...new Set(trg.map(r=>r.fn))];
  for (const f of trgFns) { const d = await q("select pg_get_functiondef(oid) d from pg_proc where pronamespace='public'::regnamespace and proname=$1", [f]); out.push(`\n### trigger fn ${f}\n\`\`\`sql\n${d[0]?.d}\n\`\`\``); }
  // b. FK グラフ（org_id 表）
  const fk = await q("select c.conrelid::regclass::text child, c.confrelid::regclass::text parent, pg_get_constraintdef(c.oid) def from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f' order by 1,2");
  out.push("\n## b-2 FK（child → parent・ON DELETE）", ...fk.map(r=>`- ${r.child} → ${r.parent}: ${r.def}`));
  // b. 表ごとの grants（service_role の DELETE 可否）・RLS・delete policy
  const gr = await q("select table_name, string_agg(grantee||':'||string_agg_p, ' ') g from (select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) string_agg_p from information_schema.role_table_grants where table_schema='public' and grantee in ('service_role','authenticated','anon') group by 1,2) x group by 1 order by 1");
  out.push("\n## b-3 表の grants（service_role／authenticated／anon）", ...gr.map(r=>`- ${r.table_name}: ${r.g}`));
  const pol = await q("select tablename, policyname, cmd, roles::text from pg_policies where schemaname='public' and cmd<>'SELECT' order by 1,2");
  out.push("\n## b-4 SELECT 以外の policy（書込 policy の有無）", pol.length ? pol.map(r=>`- ${r.tablename}.${r.policyname} ${r.cmd} ${r.roles}`).join("\n") : "- なし（全表 SELECT policy のみ＝書込は RPC 経由）");
  // c. 種の経路 RPC: now() 依存・時刻引数・auth.uid() 依存
  const fns = ["check_open","check_add_line","check_add_referral","check_pay","check_close","check_void","punch_self","punch_proxy","kiosk_punch","attendance_set","shift_set","shift_bulk_set","shift_cast_confirm","shift_confirm_bulk","shift_period_set","payroll_run_create","payroll_finalize","payroll_mark_paid","daily_report_close","daily_report_reclose","set_seat","set_product","product_bulk_insert","set_comp_plan","set_cast_plan","customer_register","reservation_create","receipt_issue","biz_date_of","audit_log_write","audit_log_write_service","billing_writable_of","auth_org_billing_writable","auth_org_id","auth_role","auth_store_id","auth_cast_id","auth_kiosk_org_id","auth_kiosk_register_store_id","auth_kiosk_operator"];
  const info = await q("select proname, pg_get_function_identity_arguments(oid) a, prosrc from pg_proc where pronamespace='public'::regnamespace and proname = any($1) order by 1", [fns]);
  out.push("\n## c-1 種の経路 RPC: 引数・now()／current_date／auth.uid() の出現・時刻引数");
  for (const r of info) {
    const src = r.prosrc;
    const nowN = (src.match(/\bnow\(\)/g)||[]).length, cdN = (src.match(/current_date/g)||[]).length, uidN = (src.match(/auth\.uid\(\)/g)||[]).length, authN = (src.match(/public\.auth_[a-z_]+\(\)|\bauth_[a-z_]+\(\)/g)||[]).length;
    const tsArgs = (r.a.match(/p_[a-z_]+ (timestamp[^,]*|date|time)/g)||[]).join("; ");
    out.push(`- ${r.proname}(${r.a}): now()=${nowN} current_date=${cdN} auth.uid()=${uidN} auth_*()=${authN} 時刻引数=[${tsArgs}]`);
  }
  for (const n of ["billing_writable_of","auth_org_billing_writable","check_open","check_close","punch_self","kiosk_punch","shift_set","payroll_run_create","daily_report_close","audit_log_write","audit_log_write_service"]) {
    const r = info.find(x=>x.proname===n); if (r) out.push(`\n### ${n}\n\`\`\`sql\n${r.prosrc}\n\`\`\``);
  }
  // h. 名簿 A 128（live gated）
  const gated = await q("select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%' order by 1");
  out.push("\n## h-1 live のゲート済み RPC（'billing locked'＝名簿 A・" + gated.length + " 本）", gated.map(r=>r.proname).join(" / "));
  const gateShape = await q("select proname, (prosrc like '%billing_writable_of(v_org)%') v_org, (prosrc like '%billing_writable_of(public.auth_org_id())%') auth from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%'");
  out.push(`- ゲート行の形: v_org 版 ${gateShape.filter(r=>r.v_org).length}・auth_org_id() 版 ${gateShape.filter(r=>r.auth).length}`);
  // i. 自由入力 text 列（長さ制約なし・org 配下）
  const txt = await q("select table_name, string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_schema='public' and data_type='text' and column_name not in ('id','org_id','store_id','status','kind','type','role','mode','period','method','action','target','pay_group','tax_category','fee_kind','back_mode','price_display','business_tax_status','tax_rounding','round_mode','receivable_policy','nom_type','plan','key','email') and table_name in (select table_name from information_schema.columns where table_schema='public' and column_name='org_id') group by 1 order by 1");
  out.push("\n## i-1 org 配下の text 列（列挙・enum 系を除く）", ...txt.map(r=>`- ${r.table_name}: ${r.cols}`));
  const ck = await q("select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where contype='c' and connamespace='public'::regnamespace and pg_get_constraintdef(oid) ~* 'length' order by 1");
  out.push("\n## i-2 長さ CHECK を持つ列", ...ck.map(r=>`- ${r.t}.${r.conname}: ${r.d}`));
  const buckets = await q("select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1").catch(()=>[]);
  out.push("\n## i-3 storage buckets", JSON.stringify(buckets));
  const pols = await q("select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='storage' order by 1").catch(()=>[]);
  out.push("## i-4 storage policies", ...pols.map(r=>`- ${r.policyname} ${r.cmd} ${r.roles} qual=${r.qual} check=${r.with_check}`));
  fs.writeFileSync("docs/tmp/0918_demo_b_live.md", "# 0918_demo_b_live — O-b/c/h/i の live 読取（逐語・2026-09-18）\n\n" + out.join("\n"));
  console.log("written", out.join("\n").length, "chars; triggers", trg.length, "fk", fk.length, "gated", gated.length, "text tables", txt.length);
  console.log(out.filter(l=>l.startsWith("- ") && /^- [a-z_]+\(/.test(l)).join("\n"));
} finally { await db.end().catch(()=>{}); }
