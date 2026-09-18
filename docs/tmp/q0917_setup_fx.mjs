// 手順 5 の fixture: 一時 ownerB（auth＋users＋membership owner@B1）・B1 の実行前状態の控え・setup_done=false／cleanup
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const EMAIL = "nox-verify-owner-b-tmp@example.com";
const STATE = "docs/tmp/setup_b1_state.json";
const TABLES = ["seats", "products", "product_categories", "product_costs", "store_business_hours", "pricing_rules", "comp_plans", "comp_plan_components", "cast_plan", "stock_logs", "feature_flags"];
const snapshot = async (storeId, orgId) => {
  const counts = {};
  for (const t of TABLES) counts[t] = Number((await q(`select count(*)::int n from public.${t} where ${t === "feature_flags" ? "org_id=$1" : "store_id=$1"}`, [t === "feature_flags" ? orgId : storeId]))[0].n);
  const store = (await q("select name, settings_json, hon_fee, jonai_fee, dohan_fee, service_rate, card_tax_rate, round_unit, round_mode, set_min, set_fee, ext_min, ext_fee, time_mode, time_per from public.stores where id=$1", [storeId]))[0];
  const audit = Number((await q("select count(*)::int n from public.audit_logs where org_id=$1", [orgId]))[0].n);
  return { counts, store, audit };
};
const mode = process.argv[2];
const b1 = (await q("select id, org_id from public.stores where name='NOX-VERIFY-B1'"))[0];
if (mode === "prepare") {
  const pre = await snapshot(b1.id, b1.org_id);
  const { data: cu, error } = await admin.auth.admin.createUser({ email: EMAIL, password: process.env.SEED_PASSWORD, email_confirm: true });
  if (error) { console.log("createUser FAIL", error.message); process.exit(1); }
  const u = (await q("insert into public.users (org_id, auth_user_id, email, name) values ($1,$2,$3,'一時オーナーB') returning id", [b1.org_id, cu.user.id, EMAIL]))[0];
  const m = (await q("insert into public.memberships (user_id, store_id, role, is_active) values ($1,$2,'owner',true) returning id", [u.id, b1.id]))[0];
  await q("update public.stores set settings_json = settings_json || '{\"setup_done\":false}'::jsonb where id=$1", [b1.id]);
  fs.writeFileSync(STATE, JSON.stringify({ pre, ownerB: { authId: cu.user.id, userId: u.id, memId: m.id, email: EMAIL }, startedAt: new Date().toISOString(), storeId: b1.id, orgId: b1.org_id }, null, 1));
  console.log("prepared", JSON.stringify(pre));
} else if (mode === "status") {
  console.log(JSON.stringify(await snapshot(b1.id, b1.org_id)));
} else if (mode === "cleanup") {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const post = await snapshot(b1.id, b1.org_id);
  // 増えた行＝store_id=B1 の行（実行前は全て 0＝全削除で原状）。pre が 0 でない表は列挙して停止
  const nonZero = Object.entries(st.pre.counts).filter(([, n]) => n !== 0);
  if (nonZero.length) { console.log("STOP: 実行前に行があった表", JSON.stringify(nonZero)); process.exit(2); }
  const del = async (t, col, v) => Number((await q(`delete from public.${t} where ${col}=$1`, [v])).length ?? 0);
  const deleted = {};
  for (const t of ["product_costs", "stock_logs", "products", "product_categories", "seats", "store_business_hours", "pricing_rules", "comp_plan_components", "comp_plans", "cast_plan"]) {
    const r = await db.query(`delete from public.${t} where store_id=$1`, [b1.id]); deleted[t] = r.rowCount;
  }
  const rf = await db.query("delete from public.feature_flags where org_id=$1", [b1.org_id]); deleted.feature_flags = rf.rowCount;
  const ra = await db.query("delete from public.audit_logs where org_id=$1 and at >= $2", [b1.org_id, st.startedAt]); deleted.audit_logs = ra.rowCount;
  const s = st.pre.store;
  await q("update public.stores set name=$2, hon_fee=$3, jonai_fee=$4, dohan_fee=$5, service_rate=$6, card_tax_rate=$7, round_unit=$8, round_mode=$9, set_min=$10, set_fee=$11, ext_min=$12, ext_fee=$13, time_mode=$14, time_per=$15, settings_json=$16::jsonb where id=$1",
    [b1.id, s.name, s.hon_fee, s.jonai_fee, s.dohan_fee, s.service_rate, s.card_tax_rate, s.round_unit, s.round_mode, s.set_min, s.set_fee, s.ext_min, s.ext_fee, s.time_mode, s.time_per, JSON.stringify(s.settings_json)]);
  await db.query("delete from public.memberships where id=$1", [st.ownerB.memId]);
  await db.query("delete from public.users where id=$1", [st.ownerB.userId]);
  const { error } = await admin.auth.admin.deleteUser(st.ownerB.authId);
  const after = await snapshot(b1.id, b1.org_id);
  console.log(JSON.stringify({ postBeforeCleanup: post.counts, deleted, authDeleted: !error, after }));
  const same = JSON.stringify(after.counts) === JSON.stringify(st.pre.counts) && JSON.stringify(after.store) === JSON.stringify(st.pre.store) && after.audit === st.pre.audit;
  console.log(same ? "RESTORED: pre と一致" : "DIFF: pre と不一致");
}
await db.end();
