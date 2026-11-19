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
import { breakdownLinesOf, SALES_BASIS_LINE } from "../lib/nox/payroll/breakdown-lines";
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
// sb(4) 明細の基準の行（2026-11-19・相談役 ②）：小計の店だけ「売上の基準：小計（税・サ料の前）」を情報行で（合計に足さない）・請求額の店は行も凍結形も変えない
{
  const base = { wage: 3000, wHours: 10, timePay: 30000, honBack: 5000, gross: 35000, net: 35000 };
  const plain = breakdownLinesOf({ pay: base, frozen: true });
  const sub = breakdownLinesOf({ pay: { ...base, salesBasis: "subtotal" }, frozen: true });
  const ln = sub.earn.find((l) => l.key === "sales-basis");
  check("sb(4-1) 小計の店＝基準の行が 1 本（情報行・金額欄は空・文言）", !!ln && ln.info === true && ln.amount === 0 && ln.amountText === "" && ln.label === SALES_BASIS_LINE && SALES_BASIS_LINE.trim() === "売上の基準：小計（税・サ料の前）", ln);
  check("sb(4-2) 請求額の店（キーなし）＝基準の行なし・行の並びと合計は小計の店から基準の行を除いたものと同じ", !plain.earn.some((l) => l.key === "sales-basis") && JSON.stringify(plain.earn) === JSON.stringify(sub.earn.filter((l) => l.key !== "sales-basis")) && plain.earnTotal === sub.earnTotal && plain.net === sub.net, [plain.earnTotal, sub.earnTotal]);
  const coreSrc = fs.readFileSync("lib/nox/payroll/core.ts", "utf8");
  check("sb(4-3) 凍結形：masters.salesBasis＝'subtotal' のときだけ pay に salesBasis を足す（請求額の店はキーを足さない）", coreSrc.includes(`if (masters.salesBasis === "subtotal") (pay as { salesBasis?: unknown }).salesBasis = "subtotal";`));
  check("sb(4-4) collect：店の鍵が小計のときだけ masters に salesBasis", co.includes(`...(salesBasisOf((stR.data?.settings_json ?? null) as Record<string, unknown> | null, mig0201qOn()) === "subtotal" ? { salesBasis: "subtotal" as const } : {}),`));
  const slip = fs.readFileSync("components/payslip-slip.tsx", "utf8"), board = fs.readFileSync("app/(manage)/payroll/payroll-board.tsx", "utf8");
  // sb(4-6) ★2026-11-19 朝（③の撮影）: 置き場所＝スライドの行があればその下・無ければ売上で決まる歩合の行（売上バック・自由設計バック）の下（時給の行の下に出さない）
  {
    const hostLike = { ...base, salesBasis: "subtotal" as const, cbacks: [{ name: "売上歩合（小計の 40%）", amount: 80000 }, { name: "売上歩合の加算（小計 30 万円〜・小計の 5%）", amount: 0 }], customTotal: 80000, guaranteeAdd: 1000 };
    const k = breakdownLinesOf({ pay: hostLike, frozen: true }).earn.map((l) => l.key);
    const iB = k.indexOf("sales-basis");
    const hostPlain = breakdownLinesOf({ pay: { ...hostLike, salesBasis: undefined }, frozen: true }).earn.map((l) => l.key);
    check("sb(4-6) スライドの無い小計の店＝基準の行は自由設計バックの行のすぐ下（時給の下ではない）・ほかの行の並びは同じ", iB > 0 && k[iB - 1] === "cback-0" && k[iB + 1] === "guaranteeAdd" && k[iB - 1] !== "time" && JSON.stringify(k.filter((x) => x !== "sales-basis")) === JSON.stringify(hostPlain), k);
  }
  check("sb(4-5) 明細（PayslipSlip）と給与の右パネルで基準の行を小さく（11px）", slip.includes(`data-sales-basis={key === "sales-basis" ? "subtotal" : undefined}`) && slip.includes(`fontSize: 11, color: "var(--sub)"`) && board.includes(`data-sales-basis={key === "sales-basis" ? "subtotal" : undefined}`) && board.includes(`fontSize: key === "sales-basis" ? 11 : 12.5`));
}
async function main(): Promise<void> {
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-read" });
await c.connect();
try {
  await c.query("begin read only");
  const st = (await c.query<{ name: string; settings_json: Record<string, unknown> | null }>("select name, settings_json from public.stores order by name")).rows;
  const keyed = st.filter((s) => s.settings_json && ("sales_basis" in s.settings_json || "sales_back_default_off" in s.settings_json));
  const plain = st.filter((s) => !keyed.includes(s));
  check("sb(3-1) 鍵の無い店は今までと同じ経路（get_cast_sales・既定の売上歩合を止めない）", plain.every((s) => salesRpcOf(salesBasisOf(s.settings_json, true)) === "get_cast_sales" && !salesBackDefaultOffOf(s.settings_json, true)), plain.map((s) => s.name));
  // ★2026-11-19 朝（相談役 ③）: ホストのデモ CLUB VESPER だけが小計の基準（種で鍵を入れる・reset の後）＝鍵のある店は CLUB VESPER だけ・値はちょうど subtotal／true（reset の前は 0 店）
  check("sb(3-2) 本番で鍵のある店＝CLUB VESPER だけ（sales_basis＝'subtotal'・sales_back_default_off＝true）か 0 店（ホストの reset の前）", keyed.every((s) => s.name === "CLUB VESPER" && s.settings_json?.sales_basis === "subtotal" && s.settings_json?.sales_back_default_off === true) && keyed.length <= 1, keyed.map((s) => [s.name, s.settings_json?.sales_basis, s.settings_json?.sales_back_default_off]));
  const fn = (await c.query<{ n: string }>("select count(*)::text n from pg_proc where pronamespace='public'::regnamespace and proname in ('get_cast_sales','get_cast_sales_subtotal')")).rows[0].n;
  check("sb(3-3) 2 つの RPC が本番にある（0201q）", fn === "2", fn);
} finally { await c.query("rollback").catch(() => undefined); await c.end(); }
}
main().then(() => {
if (fails.length) { console.error(`✗ verify:nox-sales-basis 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-sales-basis OK (${pass} checks)`);
}).catch((e) => { console.error(e); process.exit(1); });
