/*
 * verify:nox-multi-store — 2 号店の段 1・段 2（0203・旗 MIG_0203_APPLIED の後ろ・相談役 21:40 の ■2）。
 *  (1) 純関数：今見ている店の決め方（旗 false・owner でない＝auth_store_id のまま）・切り替えを出すか・初期設定の柵（旗 true は「どの店も前」・店 1 つは今と同じ）・案内・写しの計画（群を飛ばす・制度の鍵を外す・支払日を外す）・語
 *  (2) 形：旗は false・外枠と画面の柵は needsSetupOf・route は旗 false で 404・運営の店を追加は ops_store_add・0203 の起草（begin／commit は 1 つずつ・関数 5 本・ACL）
 *  (3) DB（読むだけ・BEGIN … ROLLBACK）：NOX-VERIFY-A（A1・A2）で役ごと（店長・スタッフ・キャスト）に A2 の行が 1 つも出ない・owner は両方が見える
 *  0203 の関数の動き（店を足す・写し・支払日・店を指定したお知らせ）は scripts/try-0203.mts（試走・本番に残さない）。
 *  使い方: npm run verify:nox-multi-store（(3) は SUPABASE_DB_URL・NOX_SKIP_DB=1 で飛ばす）
 */
import fs from "node:fs";
import pg from "pg";
import { needsSetupOf, pendingSetupStoresOf, pickCurrentStore, storeSwitchShownOf } from "../lib/nox/store/current";
import { applyCopyToPlan, copyPartsOf, stripOrgLevelKeys } from "../lib/nox/setup/copy-plan";
import { storeAddErrJa, storeCopyErrJa, STORE_COPY_PARTS } from "../lib/nox/ops/store-add";
import { MIG_0203_APPLIED } from "../lib/nox/rules-0175/flag";
import { pgTx } from "./fixtures-pgtx";
import type { V5Step } from "../lib/nox/setup/v5";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1) 純関数
const ids = ["s1", "s2"];
check("(1) 今見ている店：旗 false は auth_store_id（owner でも）・owner でない人は auth_store_id", pickCurrentStore({ flag: false, role: "owner", cookieId: "s2", storeIds: ids, authStoreId: "s1" }) === "s1" && pickCurrentStore({ flag: true, role: "manager", cookieId: "s2", storeIds: ids, authStoreId: "s1" }) === "s1");
check("(1) 今見ている店：旗 true の owner は cookie の店（見える店の中だけ）・無ければ店名順の先頭", pickCurrentStore({ flag: true, role: "owner", cookieId: "s2", storeIds: ids, authStoreId: "s1" }) === "s2" && pickCurrentStore({ flag: true, role: "owner", cookieId: "x", storeIds: ids, authStoreId: "s2" }) === "s1" && pickCurrentStore({ flag: true, role: "owner", cookieId: null, storeIds: ids, authStoreId: "s2" }) === "s1");
check("(1) 切り替え：旗 true・owner・2 店以上だけ", storeSwitchShownOf({ flag: true, role: "owner", storeCount: 2 }) && !storeSwitchShownOf({ flag: false, role: "owner", storeCount: 2 }) && !storeSwitchShownOf({ flag: true, role: "owner", storeCount: 1 }) && !storeSwitchShownOf({ flag: true, role: "manager", storeCount: 2 }));
check("(1) 柵：旗 false は 1 つでも前なら・旗 true はどの店も前のときだけ・店 1 つは同じ", needsSetupOf({ flag: false, setupDone: [true, false] }) && !needsSetupOf({ flag: true, setupDone: [true, false] }) && needsSetupOf({ flag: true, setupDone: [false, false] })
  && [[true], [false], []].every((d) => needsSetupOf({ flag: false, setupDone: d as boolean[] }) === needsSetupOf({ flag: true, setupDone: d as boolean[] })));
check("(1) 案内：2 店以上の owner で、済んだ店があり、前の店があるときだけ", JSON.stringify(pendingSetupStoresOf({ flag: true, role: "owner", stores: [{ id: "a", name: "A", setupDone: true }, { id: "b", name: "B", setupDone: false }] })) === JSON.stringify([{ id: "b", name: "B" }])
  && pendingSetupStoresOf({ flag: false, role: "owner", stores: [{ id: "a", name: "A", setupDone: true }, { id: "b", name: "B", setupDone: false }] }).length === 0 && pendingSetupStoresOf({ flag: true, role: "manager", stores: [{ id: "a", name: "A", setupDone: true }, { id: "b", name: "B", setupDone: false }] }).length === 0);
const steps: V5Step[] = [
  { key: "p", group: "settings", label: "", rpc: "set_store_profile", args: { p_store_id: "x", p_patch: { biz_type: "cabaret", sys_hourly: true, norm_axes: {}, pay_day: 25, receipt_tel: "1" } } },
  { key: "h", group: "hours", label: "", rpc: "set_store_business_hours", args: {} }, { key: "r", group: "pricing", label: "", rpc: "set_pricing_rule", args: {} },
  { key: "c", group: "comp", label: "", rpc: "set_comp_plan", args: {} }, { key: "d", group: "done", label: "", rpc: "set_store_profile", args: { p_store_id: "x", p_patch: { setup_done: true } } },
];
const a1 = applyCopyToPlan(steps, ["pricing", "hours"]);
check("(1) 写しの計画：写した群（pricing・hours）の段は飛ばす・ほかはそのまま・写さなければ同じ", a1.map((s) => s.key).join(",") === "p,c,d" && applyCopyToPlan(steps, []).length === steps.length);
const a2 = applyCopyToPlan(steps, ["comp"]);
const p2 = (a2.find((s) => s.key === "p")?.args?.p_patch ?? {}) as Record<string, unknown>;
check("(1) 待遇だけ写す＝店舗設定の段から制度の鍵（sys_*）と待遇の鍵を外す・ほかの鍵は残す", !("sys_hourly" in p2) && !("norm_axes" in p2) && p2.receipt_tel === "1" && p2.biz_type === "cabaret" && !a2.some((s) => s.key === "c"));
const s3 = stripOrgLevelKeys(steps);
check("(1) 2 店以上の会社＝店の patch から支払日を外す（ほかの鍵と段はそのまま）", !("pay_day" in ((s3[0].args!.p_patch) as Record<string, unknown>)) && ((s3[0].args!.p_patch) as Record<string, unknown>).receipt_tel === "1" && s3.length === steps.length);
check("(1) 写す part は 5 つ・知らない値は落とす・語（二重に写さない・デモ不可）", STORE_COPY_PARTS.length === 5 && JSON.stringify(copyPartsOf(["pricing", "casts", "hours"])) === JSON.stringify(["pricing", "hours"]) && storeCopyErrJa("not empty: pricing").includes("二重に写しません") && storeAddErrJa("forbidden (demo)") === "デモの会社には足せません");

// (2) 形
check("(2) 旗 MIG_0203_APPLIED は false（枝の上・main に入れない）", MIG_0203_APPLIED === false);
check("(2) 外枠と画面の柵は needsSetupOf（旗 true は「どの店も前」）", src("app/(manage)/layout.tsx").includes("const needsSetup = needsSetupOf({ flag: mig0203On(),") && src("lib/nox/nav/page-gate.ts").includes("const needsSetup = needsSetupOf({ flag: mig0203On(),"));
check("(2) 切り替えの route と運営の店を追加の route は旗 false で 404", src("app/api/store/current/route.ts").includes('if (!mig0203On()) return NextResponse.json({ error: "not found" }, { status: 404 });') && src("app/api/ops/orgs/[id]/stores/route.ts").includes('if (!mig0203On()) return NextResponse.json({ error: "not found" }, { status: 404 });') && src("app/api/ops/orgs/[id]/stores/route.ts").includes('rpc("ops_store_add"'));
const mig = src("supabase/migrations/0203_multi_store.sql");
const bodyLines = mig.split(/\r?\n/).map((l) => l.trim());
check("(2) 0203 の起草＝begin／commit は 1 つずつ・関数 5 本・ops_store_add は 4 ロール revoke → service_role", bodyLines.filter((l) => l === "begin;").length === 1 && bodyLines.filter((l) => l === "commit;").length === 1 && (mig.match(/^CREATE OR REPLACE FUNCTION public\./gm) ?? []).length === 5
  && mig.includes("revoke all on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) from public, anon, authenticated, service_role;") && mig.includes("grant execute on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) to service_role;"));
check("(2) 写しは LINE・位置（IP）・端末を写さない（列と鍵）", !/line_config\s*=\s*s\./.test(mig) && !/punch_allow_ip\s*=\s*s\./.test(mig) && mig.includes("v_never_keys text[] := array['setup_done','biz_type','contract_ack','contract_ack_rev','cast_register_device','kiosk_features','line_notify'];"));

// (3) DB（読むだけ）
async function dbPart() {
  const url = process.env.NOX_SKIP_DB === "1" ? undefined : (process.env.SUPABASE_DB_URL ?? (() => { try { const l = src(".env.local").split(/\r?\n/).find((x) => x.startsWith("SUPABASE_DB_URL=")); return l ? l.slice(16).replace(/^"|"$/g, "") : undefined; } catch { return undefined; } })());
  if (!url) { console.log("  (3) DB の段は飛ばす"); return; }
  const db = new pg.Client({ connectionString: url }); await db.connect();
  try {
    await db.query("begin read only");
    const tx = pgTx(db);
    const A2 = (await tx.one<{ id: string }>("select id from stores where name = 'NOX-VERIFY-A2'")).id;
    const uid = async (email: string) => ({ auth_user_id: (await tx.one<{ auth_user_id: string }>("select auth_user_id from users where email = $1", [email])).auth_user_id });
    const T = ["casts", "checks", "seats", "products", "product_categories", "notices", "daily_reports", "customers", "shifts", "comp_plans", "pricing_rules", "payroll_runs", "store_business_hours"];
    const countA2 = async (who: { auth_user_id: string }) => { const out: Record<string, string> = {}; for (const t of T) { const r = await tx.as(who, `select count(*)::int n from public.${t} where store_id = $1`, [A2]); out[t] = r.ok ? String((r.rows[0] as { n: number }).n) : `err:${tx.errOf(r)}`; } return out; };
    for (const [label, email] of [["店長", "nox-verify-manager-a1@example.com"], ["スタッフ", "nox-verify-staff-a1@example.com"], ["キャスト", "nox-verify-cast-a1a@example.com"]] as const) {
      const c = await countA2(await uid(email));
      check(`(3) ${label}（A1）に A2 の行が 1 つも出ない（${T.length} 表）`, Object.values(c).every((v) => v === "0" || v.startsWith("err:permission denied")), c);
    }
    const oc = await countA2(await uid("nox-verify-owner-a@example.com"));
    check("(3) owner は A2 も見える（会社の全店＝今見ている店で画面が絞る）", Number(oc.seats) > 0 || Number(oc.casts) > 0 || Number(oc.store_business_hours) >= 0, oc);
  } finally { await db.query("rollback").catch(() => undefined); await db.end(); }
}
void dbPart().then(() => {
  if (fails.length) { console.error(`verify:nox-multi-store FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-multi-store OK ${pass} checks（2 号店の段 1・段 2・旗 false）`);
}, (e) => { console.error(`verify:nox-multi-store ERROR ${(e as Error).message}`); process.exit(1); });
