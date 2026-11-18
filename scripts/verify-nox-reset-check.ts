/*
 * verify:nox-reset-check — デモの reset の前に payload の形を確かめる（2026-11-18 相談役 B＝read_1118 b の案 1）。DB 不触・env 不要。
 *  rc(1) 純関数：鍵の欠け・NOT NULL の null・id の重なりを見つける／鍵の印（$〜）は見ない。
 *  rc(2) 今の 6 店の payload は確かめを通る（reset を止めない）。
 *  rc(3) 11/17 21:10 の LUNA の payload（49c2be2f・体験入店のプランに pay_rate_tiers が無い）は止まる。
 *  rc(4) runDemoReset：確かめで止まる payload では、消す処理（prewipe の from・wipe の rpc）が 1 回も呼ばれない。
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { payloadIssuesOf } from "../lib/nox/demo/payload-check";
import { runDemoReset } from "../lib/nox/demo/seed";
import type { SupabaseClient } from "@supabase/supabase-js";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d).slice(0, 300)}` : ""}`); }
type P = Record<string, Record<string, unknown>[]>;
const nn = { comp_plans: ["id", "pay_rate_tiers"] };
const kinds = (p: P) => payloadIssuesOf(p, nn).map((x) => `${x.table}:${x.kind}`);
check("rc(1-1) 鍵の欠け（2 行目に pay_rate_tiers が無い）＝keys", kinds({ comp_plans: [{ id: "a", pay_rate_tiers: [] }, { id: "b" }] }).includes("comp_plans:keys"));
check("rc(1-2) NOT NULL の列に null＝null", kinds({ comp_plans: [{ id: "a", pay_rate_tiers: null }] }).includes("comp_plans:null"));
check("rc(1-3) id の重なり＝dup_id", kinds({ comp_plans: [{ id: "a", pay_rate_tiers: [] }, { id: "a", pay_rate_tiers: [] }] }).includes("comp_plans:dup_id"));
check("rc(1-4) 印の鍵（$onlyBefore など）は見ない・そろった表は何も出さない", kinds({ comp_plans: [{ id: "a", pay_rate_tiers: [], $onlyBefore: 3 }, { id: "b", pay_rate_tiers: [] }] }).length === 0);
for (const c of ["muse", "luna", "noir", "ace", "lily", "nest"]) {
  const p = JSON.parse(fs.readFileSync(`docs/demo/payload/${c}.json`, "utf8")).tables as P;
  const iss = payloadIssuesOf(p);
  check(`rc(2) ${c}: 今の payload は確かめを通る`, iss.length === 0, iss.slice(0, 3));
}
let old: P | null = null;
try { old = JSON.parse(execSync("git show 49c2be2f:docs/demo/payload/luna.json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).tables as P; } catch { old = null; }
if (old) { const iss = payloadIssuesOf(old); check("rc(3) 11/17 21:10 の LUNA の payload（49c2be2f）＝comp_plans の鍵の欠けで止まる", iss.some((x) => x.table === "comp_plans" && x.kind === "keys" && x.detail.includes("pay_rate_tiers")), iss.slice(0, 3)); }
else check("rc(3) git の無い環境＝対象外", true);
async function main() {
  const calls: string[] = [];
  const stub = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(String(k) + ":" + JSON.stringify(a[0] ?? "").slice(0, 40)); throw new Error("呼ばれてはいけない"); } }) as unknown as SupabaseClient;
  const r = await runDemoReset(stub, "00000000-0000-4000-8000-000000000000", { comp_plans: [{ id: "a", pay_rate_tiers: [] }, { id: "b" }] });
  check("rc(4) 確かめで止まる payload＝ok false・'payload check'・admin（prewipe の from・wipe の rpc）は 1 回も呼ばれない", r.ok === false && String((r as { error?: string }).error ?? "").startsWith("payload check:") && calls.length === 0, { r, calls });
  const src = fs.readFileSync("lib/nox/demo/seed.ts", "utf8");
  const i0 = src.indexOf("export async function runDemoReset("), i1 = src.indexOf("const issues = payloadIssuesOf(payload);", i0), i2 = src.indexOf("prewipeDemoOrg(admin, orgId)", i0);
  check("rc(5) runDemoReset：確かめは prewipe と wipe より前", i0 > 0 && i1 > i0 && i2 > i1);
  if (fails.length) { console.error(`✗ verify:nox-reset-check 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-reset-check OK (${pass} checks)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
