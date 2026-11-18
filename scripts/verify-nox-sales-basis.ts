/*
 * verify:nox-sales-basis — 売上の基準（sales_basis）と既定の売上歩合を止める鍵（sales_back_default_off）を collect が読む（2026-11-18 夜・相談役 ③・0201q の後）。
 *  sb(1) 純関数：フラグ false か鍵が無い店＝'due'（get_cast_sales）・'subtotal' の店だけ get_cast_sales_subtotal・sales_back_default_off は true だけ。
 *  sb(2) collect の形：今の期と前の期の両方を同じ RPC で読む・既定の売上歩合の表（salesBackTable）を空にするのは sys_backs OFF か sales_back_default_off＝true のときだけ。
 *  sb(3) 本番の全店（読取だけ）：鍵のある店の数と、鍵の無い店が今までと同じ経路（get_cast_sales・売上歩合を止めない）に乗ること＝鍵の無い店は 1 円も変わらない。
 */
process.loadEnvFile(".env.local");
import fs from "node:fs";
import pg from "pg";
import { salesBasisOf, salesRpcOf, salesBackDefaultOffOf, SALES_BASIS_LABEL } from "../lib/nox/payroll/sales-basis";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
check("sb(1-1) 鍵が無い・null・知らない値・フラグ false＝'due'", salesBasisOf(null, true) === "due" && salesBasisOf({}, true) === "due" && salesBasisOf({ sales_basis: "due" }, true) === "due" && salesBasisOf({ sales_basis: "SUBTOTAL" }, true) === "due" && salesBasisOf({ sales_basis: "subtotal" }, false) === "due");
check("sb(1-2) 'subtotal'（フラグ true）だけ小計", salesBasisOf({ sales_basis: "subtotal" }, true) === "subtotal" && salesRpcOf("subtotal") === "get_cast_sales_subtotal" && salesRpcOf("due") === "get_cast_sales");
check("sb(1-3) sales_back_default_off は true のときだけ（'true' の文字や 1 は止めない・フラグ false は止めない）", salesBackDefaultOffOf({ sales_back_default_off: true }, true) && !salesBackDefaultOffOf({ sales_back_default_off: "true" }, true) && !salesBackDefaultOffOf({ sales_back_default_off: 1 }, true) && !salesBackDefaultOffOf({}, true) && !salesBackDefaultOffOf({ sales_back_default_off: true }, false));
check("sb(1-4) 表示の名前", SALES_BASIS_LABEL.due === "請求額（サ・税込み）" && SALES_BASIS_LABEL.subtotal === "小計（税・サ料の前）");
const co = fs.readFileSync("lib/nox/payroll/collect.ts", "utf8");
check("sb(2-1) collect：店の settings_json から RPC を選び、今の期・前の期・スライドの窓（期の外・半月）の 3 か所ともその RPC で読む（get_cast_sales の直書きが残らない）", co.includes("const salesRpc = salesRpcOf(salesBasisOf((stSB?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()));") && co.includes("await managerClient.rpc(salesRpc, {") && co.includes("managerClient.rpc(salesRpc, { p_store_id: storeId, p_from: prevStart, p_to: prevEnd })") && co.includes("managerClient.rpc(salesRpc, { p_store_id: storeId, p_from: r.start, p_to: r.end })") && !co.includes('rpc("get_cast_sales"'));
check("sb(2-2) collect：salesBackTable を空にする条件＝sys_backs OFF か sales_back_default_off（ほかの行は今のまま）", co.includes('isSystemOn((stR.data?.settings_json ?? null) as Record<string, unknown> | null, "sys_backs") && !salesBackDefaultOffOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()) ? {} : { salesBackTable: [] }'));
async function main(): Promise<void> {
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-read" });
await c.connect();
try {
  await c.query("begin read only");
  const st = (await c.query<{ name: string; settings_json: Record<string, unknown> | null }>("select name, settings_json from public.stores order by name")).rows;
  const keyed = st.filter((s) => s.settings_json && ("sales_basis" in s.settings_json || "sales_back_default_off" in s.settings_json));
  const plain = st.filter((s) => !keyed.includes(s));
  check("sb(3-1) 鍵の無い店は今までと同じ経路（get_cast_sales・既定の売上歩合を止めない）", plain.every((s) => salesRpcOf(salesBasisOf(s.settings_json, true)) === "get_cast_sales" && !salesBackDefaultOffOf(s.settings_json, true)), plain.map((s) => s.name));
  check("sb(3-2) 本番で鍵のある店＝0（2026-11-18 夜・デモと検査の店を含む全 11 店）", keyed.length === 0, keyed.map((s) => s.name));
  const fn = (await c.query<{ n: string }>("select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('get_cast_sales','get_cast_sales_subtotal')")).rows[0].n;
  check("sb(3-3) 2 つの RPC が本番にある（0201q）", fn === "2", fn);
} finally { await c.query("rollback").catch(() => undefined); await c.end(); }
}
main().then(() => {
if (fails.length) { console.error(`✗ verify:nox-sales-basis 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-sales-basis OK (${pass} checks)`);
}).catch((e) => { console.error(e); process.exit(1); });
