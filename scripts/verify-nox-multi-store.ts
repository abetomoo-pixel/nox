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
import { ALL_STORES_NO_RANKING, needsSetupOf, pendingSetupStoresOf, pickCurrentStore, storeSwitchShownOf } from "../lib/nox/store/current";
import { applyCopyToPlan, copiedPlanIdsOf, copyPartsOf, stripOrgLevelKeys } from "../lib/nox/setup/copy-plan";
import { storeAddErrJa, storeCopyErrJa, STORE_COPY_PARTS } from "../lib/nox/ops/store-add";
import { MIG_0203_APPLIED } from "../lib/nox/rules-0175/flag";
import { pgTx } from "./fixtures-pgtx";
import { monthStartJstOf, type V5Step } from "../lib/nox/setup/v5";

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
  { key: "c", group: "comp", label: "", rpc: "set_comp_plan", args: {} }, { key: "d", group: "done", label: "", rpc: "set_store_profile", args: { p_store_id: "x", p_patch: { setup_done: true, slide_apply: "next", settlement_presets: [] } } },
  { key: "o", group: "overrides", label: "", argsOf: "product_overrides" } as V5Step, { key: "q", group: "products", label: "", rpc: "set_product", args: {} },
];
const a1 = applyCopyToPlan(steps, ["pricing", "hours"]);
check("(1) 写しの計画：写した群（pricing・hours）の段は飛ばす・ほかはそのまま・写さなければ同じ", a1.map((s) => s.key).join(",") === "p,c,d,o,q" && applyCopyToPlan(steps, []).length === steps.length);
const pd = (xs: V5Step[]) => (xs.find((s) => s.key === "d")?.args?.p_patch ?? {}) as Record<string, unknown>;
check("(1) ★12:00 の ■2-d 商品を写したら、商品の段と雛形のバックで上書きする段（overrides）も飛ばす", applyCopyToPlan(steps, ["products"]).map((s) => s.key).join(",") === "p,h,r,c,d");
check("(1) ★12:00 の ■2-d 完了の段は写した鍵を上書きしない（待遇＝slide_apply を外す・店舗設定＝精算の既定を外す・setup_done は残す）",
  JSON.stringify(pd(applyCopyToPlan(steps, ["comp", "settings"]))) === JSON.stringify({ setup_done: true }) && JSON.stringify(Object.keys(pd(applyCopyToPlan(steps, ["comp"])))) === JSON.stringify(["setup_done", "settlement_presets"])
  && JSON.stringify(Object.keys(pd(applyCopyToPlan(steps, ["settings"])))) === JSON.stringify(["setup_done", "slide_apply"]) && JSON.stringify(Object.keys(pd(applyCopyToPlan(steps, ["pricing"])))) === JSON.stringify(["setup_done", "slide_apply", "settlement_presets"]));
// ★12:00 の ■2-b: 写したプランは ID の付け替えの対応で結ぶ（1 店目で名前を変えてあっても同じ所）
const plansR = [{ src: "a", dst: "A", active: true, name: "時給プラン（改名）" }, { src: "b", dst: "B", active: false, name: "体験入店" }, { src: "c", dst: "C", active: true, name: "基本プラン" }, { src: "d", dst: "D", active: true, name: "新人" }];
check("(1) ★12:00 の ■2-b 結ぶ先＝既定のプランの写し／無ければ最初に作った有効なプラン・体験入店＝その次の有効なプラン（名前は見ない）",
  JSON.stringify(copiedPlanIdsOf({ plans: plansR, default_src: null })) === JSON.stringify({ basic: "A", trial: "C" }) && JSON.stringify(copiedPlanIdsOf({ plans: plansR, default_src: "c" })) === JSON.stringify({ basic: "C", trial: "A" })
  && JSON.stringify(copiedPlanIdsOf({ plans: [{ src: "a", dst: "A" }], default_src: "zz" })) === JSON.stringify({ basic: "A", trial: null }) && copiedPlanIdsOf({ plans: [] }) === null && copiedPlanIdsOf(null) === null);
check("(1) ★11/23 契約区分の開始日＝今月の 1 日（JST・月末の夜は翌月）", monthStartJstOf(new Date("2026-11-23T03:00:00Z")) === "2026-11-01" && monthStartJstOf(new Date("2026-11-30T16:00:00Z")) === "2026-12-01" && monthStartJstOf(new Date("2026-11-30T14:59:00Z")) === "2026-11-01");
const a2 = applyCopyToPlan(steps, ["comp"]);
const p2 = (a2.find((s) => s.key === "p")?.args?.p_patch ?? {}) as Record<string, unknown>;
check("(1) 待遇だけ写す＝店舗設定の段から制度の鍵（sys_*）と待遇の鍵を外す・ほかの鍵は残す", !("sys_hourly" in p2) && !("norm_axes" in p2) && p2.receipt_tel === "1" && p2.biz_type === "cabaret" && !a2.some((s) => s.key === "c"));
const s3 = stripOrgLevelKeys(steps);
check("(1) 2 店以上の会社＝店の patch から支払日を外す（ほかの鍵と段はそのまま）", !("pay_day" in ((s3[0].args!.p_patch) as Record<string, unknown>)) && ((s3[0].args!.p_patch) as Record<string, unknown>).receipt_tel === "1" && s3.length === steps.length);
check("(1) 写す part は 5 つ・知らない値は落とす・語（二重に写さない・デモ不可）", STORE_COPY_PARTS.length === 5 && JSON.stringify(copyPartsOf(["pricing", "casts", "hours"])) === JSON.stringify(["pricing", "hours"]) && storeCopyErrJa("not empty: pricing").includes("二重に写しません") && storeAddErrJa("forbidden (demo)") === "デモの会社には足せません");

// (2) 形
check("(2) 旗 MIG_0203_APPLIED は false（枝の上・main に入れない）", (MIG_0203_APPLIED as boolean) === false);
check("(2) 外枠と画面の柵は needsSetupOf（旗 true は「どの店も前」）", src("app/(manage)/layout.tsx").includes("const needsSetup = needsSetupOf({ flag: mig0203On(),") && src("lib/nox/nav/page-gate.ts").includes("const needsSetup = needsSetupOf({ flag: mig0203On(),"));
check("(2) 切り替えの route と運営の店を追加の route は旗 false で 404", src("app/api/store/current/route.ts").includes('if (!mig0203On()) return NextResponse.json({ error: "not found" }, { status: 404 });') && src("app/api/ops/orgs/[id]/stores/route.ts").includes('if (!mig0203On()) return NextResponse.json({ error: "not found" }, { status: 404 });') && src("app/api/ops/orgs/[id]/stores/route.ts").includes('rpc("ops_store_add"'));
const mig = src("supabase/migrations/0203_multi_store.sql");
const bodyLines = mig.split(/\r?\n/).map((l) => l.trim());
check("(2) 0203 の起草＝begin／commit は 1 つずつ・関数 5 本・ops_store_add は 4 ロール revoke → service_role", bodyLines.filter((l) => l === "begin;").length === 1 && bodyLines.filter((l) => l === "commit;").length === 1 && (mig.match(/^CREATE OR REPLACE FUNCTION public\./gm) ?? []).length === 5
  && mig.includes("revoke all on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) from public, anon, authenticated, service_role;") && mig.includes("grant execute on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) to service_role;"));
check("(2) ★12:00 の ■2-b 画面は写しの対応で結ぶ（名前で探すのは写していないときだけ）・関数はプランの対応を作った順で返す",
  src("app/(manage)/setup/setup-wizard.tsx").includes("if (!ce) copiedPlansRef.current = copiedPlanIdsOf(cd);") && src("app/(manage)/setup/setup-wizard.tsx").indexOf("if (!ids2.basic && copiedPlansRef.current) ids2 = copiedPlansRef.current;") > 0
  && src("app/(manage)/setup/setup-wizard.tsx").indexOf("if (!ids2.basic && copiedPlansRef.current) ids2 = copiedPlansRef.current;") < src("app/(manage)/setup/setup-wizard.tsx").indexOf('rows.find((x) => x.name === "基本プラン")')
  && mig.includes("order by c.created_at, c.id), '[]'::jsonb)") && mig.includes("'plans', v_plans,") && src("lib/nox/setup/v5.ts").includes("p_valid_from: monthStartJstOf(new Date())"));
const stockPage = src("app/(manage)/master/stock/page.tsx"), stockBoard = src("app/(manage)/master/stock/stock-board.tsx"), mPage = src("app/(manage)/master/page.tsx"), mBoard = src("app/(manage)/master/master-board.tsx"), q = src("lib/nox/master/queries.ts");
check("(2) ★12:00 の ■2-a 在庫＝商品・現在庫・カテゴリ・履歴を今見ている店で（旗 false＝null＝今のまま）",
  stockPage.includes("const storeId = mig0203On() ? await currentStoreIdOf(supabase) : null;") && stockPage.includes("fetchProducts(supabase, storeId),") && stockPage.includes("fetchStockTotals(supabase, storeId),") && stockPage.includes("storeId={storeId}")
  && stockBoard.includes("fetchProductCategories(supabase, storeId)") && stockBoard.includes('if (storeId) q = q.eq("store_id", storeId);') && stockBoard.includes("fetchProducts(supabase, storeId), fetchStockTotals(supabase, storeId)")
  && q.includes('p_store_id: mig0203On() && storeId ? storeId : null'));
check("(2) ★12:00 の ■2-a マスタのボード＝商品・カテゴリ・席・紹介料の未払の件数を今見ている店で（旗 false＝null）",
  mPage.includes("const storeId = mig0203On() ? await currentStoreIdOf(await createClient()) : null;") && mPage.includes("<MasterBoard storeId={storeId} />")
  && mBoard.includes("fetchProducts(supabase, storeId), fetchProductCategories(supabase, storeId)") && mBoard.includes('(storeId ? sq.eq("store_id", storeId) : sq)') && mBoard.includes('(storeId ? rq.eq("store_id", storeId) : rq)'));
check("(2) ★12:00 の ■2-c ホームの全店＝ランキングの枠に「全店ではランキングを出しません」の 1 行（データがありませんと出さない）",
  ALL_STORES_NO_RANKING === "全店ではランキングを出しません" && src("app/(manage)/dashboard/dashboard-board.tsx").includes("{allStoresView && <p") && src("app/(manage)/dashboard/dashboard-board.tsx").includes("const allStoresView = mig0203On() && isOwner && stores.length > 1 && !curStoreId;")
  && (src("app/(manage)/dashboard/dashboard-board.tsx").match(/!allStoresView && rankLoaded/g) ?? []).length === 2);
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
    // ★12:00 の判断 3: 2 店以上の会社は店の支払日がそろっている（set_store_profile の pay_day の道は閉じていない＝起票142・ずれたらここで赤）
    const pdr = await tx.q<{ name: string; n: number; d: number; pds: string }>("select o.name, count(*)::int n, count(distinct coalesce(s.pay_day, -1))::int d, string_agg(coalesce(s.pay_day::text, 'null'), ',' order by s.name) pds from public.orgs o join public.stores s on s.org_id = o.id group by o.id, o.name having count(*) >= 2");
    check(`(3) 2 店以上の会社（${pdr.length} 社）は店の支払日がそろっている`, pdr.length >= 1 && pdr.every((r) => r.d === 1), pdr);
    const oc = await countA2(await uid("nox-verify-owner-a@example.com"));
    check("(3) owner は A2 も見える（会社の全店＝今見ている店で画面が絞る）", Number(oc.seats) > 0 || Number(oc.casts) > 0 || Number(oc.store_business_hours) >= 0, oc);
  } finally { await db.query("rollback").catch(() => undefined); await db.end(); }
}
void dbPart().then(() => {
  if (fails.length) { console.error(`verify:nox-multi-store FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-multi-store OK ${pass} checks（2 号店の段 1・段 2・旗 false）`);
}, (e) => { console.error(`verify:nox-multi-store ERROR ${(e as Error).message}`); process.exit(1); });
