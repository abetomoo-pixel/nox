// A 段: 0148 手貼り後の検証（読取のみ・教訓88: finally で閉じる）
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000, connectionTimeoutMillis: 15000 });
const out = [];
const ok = (k, c, d = "") => out.push(`${k}: ${c ? "OK" : "NG"}${d ? " — " + d : ""}`);
const md5s = {};
try {
  await db.connect();
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const jst = (await q("select to_char(now() at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI:SS') t"))[0].t;
  console.log(`DB now JST ${jst}`);
  // ── A-1
  const proof = await q("select 'nox-project-proof' p, count(*)::int n from public.orgs");
  ok("A-1 proof orgs 3", proof[0].n === 3, JSON.stringify(proof[0]));
  const cols = await q("select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='payroll_adjustments' order by ordinal_position");
  ok("A-1 payroll_adjustments 列 15・末尾 source／carry_from_payslip_id", cols.length === 15 && cols[13].column_name === "source" && cols[14].column_name === "carry_from_payslip_id", cols.map((c) => c.column_name).join(","));
  ok("A-1 source text not null default 'manual'／carry_from uuid null", cols[13]?.data_type === "text" && cols[13]?.is_nullable === "NO" && cols[13]?.column_default === "'manual'::text" && cols[14]?.data_type === "uuid" && cols[14]?.is_nullable === "YES", `${cols[13]?.column_default} / ${cols[14]?.is_nullable}`);
  const cks = await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.payroll_adjustments'::regclass and contype='c' order by 1");
  ok("A-1 CHECK 4（source_ck 含む）", cks.length === 4 && cks.some((c) => c.conname === "payroll_adjustments_source_ck" && /manual.*carryover/.test(c.d)), cks.map((c) => c.conname).join(","));
  const idx = await q("select indexname, indexdef from pg_indexes where schemaname='public' and tablename='payroll_adjustments' order by 1");
  const uidx = idx.find((i) => i.indexname === "payroll_adjustments_carryover_uidx");
  ok("A-1 index 5・carryover_uidx＝UNIQUE (run_id, cast_id) WHERE source='carryover'", idx.length === 5 && !!uidx && /UNIQUE INDEX .* \(run_id, cast_id\) WHERE \(source = 'carryover'::text\)/.test(uidx.indexdef), idx.map((i) => i.indexname).join(",") + (uidx ? " | " + uidx.indexdef : ""));
  const fk = await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.payroll_adjustments'::regclass and contype='f' and conname like '%carry_from%'");
  ok("A-1 FK carry_from_payslip_id → payslips(id) ON DELETE SET NULL", fk.length === 1 && /REFERENCES payslips\(id\) ON DELETE SET NULL/.test(fk[0].d), fk[0]?.d);
  const src = await q("select source, count(*)::int n from public.payroll_adjustments group by 1");
  ok("A-1 既存行は全て source='manual'（0 行含む）", src.every((r) => r.source === "manual"), JSON.stringify(src));
  // ── A-2 新 RPC 4 本（署名逐語）
  const SIG = {
    payroll_carryover_sync: ["p_run_id uuid", "integer"],
    check_add_referral: ["p_check_id uuid, p_cast_id uuid, p_amount integer, p_memo text DEFAULT NULL::text, p_idem_key uuid DEFAULT NULL::uuid", "uuid"],
    set_cast_norm_self: ["p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer", "uuid"],
    set_store_receivable_policy: ["p_store_id uuid, p_policy text", "void"],
  };
  const fns = await q("select proname, pg_get_function_arguments(oid) args, pg_get_function_result(oid) ret, prosecdef, proconfig::text cfg, proacl::text acl, md5(prosrc) m, prosrc, prosrc like '%billing locked%' gated from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_carryover_sync','check_add_referral','set_cast_norm_self','set_store_receivable_policy','set_product','product_bulk_insert','check_group_due','set_store_profile') order by 1");
  const F = Object.fromEntries(fns.map((r) => [r.proname, r]));
  for (const r of fns) md5s[r.proname] = r.m;
  for (const [n, [a, ret]] of Object.entries(SIG)) {
    const cnt = fns.filter((r) => r.proname === n).length;
    ok(`A-2 ${n} 実在 1 本・署名逐語・戻り ${ret}・secdef・search_path=public`, cnt === 1 && F[n]?.args === a && F[n]?.ret === ret && F[n]?.prosecdef === true && F[n]?.cfg === "{search_path=public}", `${cnt} 本 / ${F[n]?.args} → ${F[n]?.ret} / ${F[n]?.cfg}`);
  }
  ok("A-2 'billing locked': referral／norm_self／receivable_policy＝t・carryover_sync＝f", F.check_add_referral?.gated === true && F.set_cast_norm_self?.gated === true && F.set_store_receivable_policy?.gated === true && F.payroll_carryover_sync?.gated === false);
  const nRef = (F.check_group_due?.prosrc.match(/kind <> 'referral'/g) ?? []).length;
  ok("A-2 check_group_due md5 が 7114f3c3… から変化・prosrc に kind <> 'referral' 2 箇所", F.check_group_due?.m !== "7114f3c303e90df4fc816df96a013b17" && nRef === 2, `md5=${F.check_group_due?.m} n=${nRef}`);
  ok("A-2 set_product md5 が b07d0343… から変化・白名単に food/other", F.set_product?.m !== "b07d034379b80c0dd36773af5e25159f" && F.set_product?.prosrc.includes("('drink','champ','bottle','food','other')"), `md5=${F.set_product?.m}`);
  ok("A-2 product_bulk_insert md5 が cd2d1133… から変化・白名単に food/other・by_type に food/other", F.product_bulk_insert?.m !== "cd2d113377d9b369bab5035a3e1ad0c3" && F.product_bulk_insert?.prosrc.includes("('drink', 'champ', 'bottle', 'food', 'other')") && (F.product_bulk_insert?.prosrc.match(/'food', v_food, 'other', v_other/g) ?? []).length === 2, `md5=${F.product_bulk_insert?.m}`);
  ok("A-2 set_store_profile md5 f2196d09… 不変", F.set_store_profile?.m === "f2196d09d7f791a24bc439e6d0e78817", F.set_store_profile?.m);
  // ── A-3 CHECK
  const ck2 = await q("select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('check_lines_kind_check','products_type_check') order by 1");
  const kindDef = ck2.find((c) => c.conname === "check_lines_kind_check")?.d ?? "";
  const typeDef = ck2.find((c) => c.conname === "products_type_check")?.d ?? "";
  ok("A-3 check_lines_kind_check 11 値（+referral,food,other）", ["set", "time", "charge", "drink", "champ", "bottle", "custom", "discount", "referral", "food", "other"].every((k) => kindDef.includes(`'${k}'::text`)) && (kindDef.match(/::text/g) ?? []).length === 11, kindDef);
  ok("A-3 products_type_check 5 値（+food,other）", ["drink", "champ", "bottle", "food", "other"].every((k) => typeDef.includes(`'${k}'::text`)) && (typeDef.match(/::text/g) ?? []).length === 5, typeDef);
  const viol = await q("select (select count(*) from public.check_lines where kind not in ('set','time','charge','drink','champ','bottle','custom','discount','referral','food','other'))::int a, (select count(*) from public.products where type not in ('drink','champ','bottle','food','other'))::int b, (select string_agg(distinct kind, ',' order by kind) from public.check_lines) kinds, (select string_agg(distinct type, ',' order by type) from public.products) types");
  ok("A-3 既存行の違反 0", viol[0].a === 0 && viol[0].b === 0, `kinds=${viol[0].kinds} types=${viol[0].types}`);
  // ── A-4 proacl
  const ACL3 = "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}";
  for (const n of Object.keys(SIG)) ok(`A-4 ${n} proacl＝postgres／authenticated／service_role のみ`, F[n]?.acl === ACL3, F[n]?.acl);
  ok("A-4 set_product／product_bulk_insert proacl 3 ロール", F.set_product?.acl === ACL3 && F.product_bulk_insert?.acl === ACL3, `${F.set_product?.acl} / ${F.product_bulk_insert?.acl}`);
  ok("A-4 check_group_due proacl＝{postgres=X/postgres}（4 ロール revoke 不変）", F.check_group_due?.acl === "{postgres=X/postgres}", F.check_group_due?.acl);
  // ── A-5 md5 控え（0147_pre §7＝pg_get_functiondef 基準・set_store_profile は 0147 で変化済＝prosrc f2196d09 で別建て）
  const pre = fs.readFileSync("docs/tmp/0147_pre.md", "utf8");
  const preMd5 = Object.fromEntries([...pre.matchAll(/^- (set_store_[a-z_]+|check_pay|check_close|check_void): `([0-9a-f]{32})`$/gm)].map((m) => [m[1], m[2]]));
  const nowSet = await q("select proname, md5(pg_get_functiondef(oid)) m from pg_proc where pronamespace='public'::regnamespace and (proname like 'set\\_store\\_%' or proname in ('check_pay','check_close','check_void')) order by proname");
  const diffs = nowSet.filter((r) => r.proname !== "set_store_profile" && r.proname !== "set_store_receivable_policy" && preMd5[r.proname] !== r.m).map((r) => r.proname);
  ok("A-5 set_store_* 11 本（profile 除く）＋money-core 3 本の md5 が控えと一致・走査 16 本（既存 12＋新設 receivable_policy＋money-core 3）", diffs.length === 0 && nowSet.length === 16 && nowSet.some((r) => r.proname === "set_store_receivable_policy"), diffs.length ? `changed=${diffs.join(",")}` : `${nowSet.length} 本走査`);
  const PRE8 = { payroll_adjustment_add: "5ad4e4d4b2dbf9d4649e794cf25dd04e", payroll_adjustment_delete: "4c440d0e06398fe21a957dcfe6a12469", check_add_line: "8629536b0210942633af64bbd0c22b4e", set_cast_norm: "2a1c988683ef6bf68e175bd42fc12b28", shift_wish_submit: "b94ad31ef3be6a33050574f467dcc5db", set_store_okuri_mode: "c0ca9e3eca19d3ae70657f2462008859", set_store_tax_config: "e711c9344666288f1f7c38590c2324a0", payroll_run_create: "401423b93b0a6eccb0e1ce0979bfbf43", check_dohan_add: "552cfed3572a4bb07108370bbad24f61" };
  const now9 = await q("select proname, md5(prosrc) m from pg_proc where pronamespace='public'::regnamespace and proname = any($1) order by 1", [Object.keys(PRE8)]);
  const d9 = now9.filter((r) => PRE8[r.proname] !== r.m).map((r) => r.proname);
  ok("A-5 不触 9 本（写経元）の prosrc md5 が 0148 ヘッダ控えと一致", d9.length === 0 && now9.length === 9, d9.length ? `changed=${d9.join(",")}` : "9/9");
  // ── A-6 既存 pin 実測
  const gated = (await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%'"))[0].n;
  const total = (await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace"))[0].n;
  ok("A-6 billing 47-1: live 全数 245・ゲート済み 128", gated === 128 && total === 245, `gated=${gated} total=${total}`);
  const pub = (await q("select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))"))[0].n;
  ok("A-6 grants G2b: PUBLIC EXECUTE の SECURITY DEFINER 関数 = 0", pub === 0, `got ${pub}`);
  const anonX = (await q("select string_agg(p.proname, ',') s from pg_proc p join aclexplode(p.proacl) a on true join pg_roles r on r.oid=a.grantee where p.pronamespace='public'::regnamespace and p.prosecdef and r.rolname='anon' and a.privilege_type='EXECUTE'"))[0].s;
  ok("A-6 grants G2b: anon EXECUTE の secdef 関数＝白名単 nox_receipt_public のみ", anonX === "nox_receipt_public", anonX);
  const cnt = (await q("select (select count(*) from pg_stat_activity where datname=current_database())::int n"))[0].n;
  console.log(`backends=${cnt}`);
} finally {
  await db.end().catch(() => {});
}
// A-6 anon-guard probe（既存 set_store_profile ＋ 新 4 本）
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const PROBES = [
  ["set_store_profile", { p_store_id: null, p_patch: null }],
  ["payroll_carryover_sync", { p_run_id: null }],
  ["check_add_referral", { p_check_id: null, p_cast_id: null, p_amount: null, p_memo: null, p_idem_key: null }],
  ["set_cast_norm_self", { p_period: null, p_days_target: null, p_dohan_target: null, p_sales_target: null, p_shimei_target: null }],
  ["set_store_receivable_policy", { p_store_id: null, p_policy: null }],
];
for (const [fn, args] of PROBES) {
  const { error } = await anon.rpc(fn, args);
  ok(`A-6 anon-guard: anon ${fn}(null…) は BLOCKED`, !!error && /permission denied for function/.test(error.message), error?.message ?? "実行できてしまった");
}
console.log(out.join("\n"));
console.log("md5(prosrc) 控え: " + JSON.stringify(md5s));
console.log(out.some((l) => /: NG/.test(l)) ? "A: NG あり" : "A: ALL OK");
