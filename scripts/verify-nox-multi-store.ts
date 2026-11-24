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
import { STORE_COLUMNS, STORE_SETTING_KEYS, copyColumnsOf, copyKeysOf } from "../lib/nox/ops/store-copy-keys";
import { MINE_SETTING_KEYS, MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { storeAddErrJa, storeCopyErrJa, STORE_COPY_PARTS } from "../lib/nox/ops/store-add";
import { MIG_0203_APPLIED } from "../lib/nox/rules-0175/flag";
import { pgTx } from "./fixtures-pgtx";
import { applyType, buildV5Plan, monthStartJstOf, v5DefaultState, type V5Step } from "../lib/nox/setup/v5";

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
check("(1) ★12:00 の ■2-b・版 2 の ■3 結ぶ先＝基本は既定のプランの写し／無ければ最初に作った有効なプラン（名前は見ない）・体験入店は結ばない（オーナーが選ぶ）",
  JSON.stringify(copiedPlanIdsOf({ plans: plansR, default_src: null })) === JSON.stringify({ basic: "A", trial: null }) && JSON.stringify(copiedPlanIdsOf({ plans: plansR, default_src: "c" })) === JSON.stringify({ basic: "C", trial: null })
  && JSON.stringify(copiedPlanIdsOf({ plans: [{ src: "a", dst: "A" }], default_src: "zz" })) === JSON.stringify({ basic: "A", trial: null }) && copiedPlanIdsOf({ plans: [] }) === null && copiedPlanIdsOf(null) === null);
check("(1) ★11/23 契約区分の開始日＝今月の 1 日（JST・月末の夜は翌月）", monthStartJstOf(new Date("2026-11-23T03:00:00Z")) === "2026-11-01" && monthStartJstOf(new Date("2026-11-30T16:00:00Z")) === "2026-12-01" && monthStartJstOf(new Date("2026-11-30T14:59:00Z")) === "2026-11-01");
const a2 = applyCopyToPlan(steps, ["comp"]);
const p2 = (a2.find((s) => s.key === "p")?.args?.p_patch ?? {}) as Record<string, unknown>;
check("(1) 待遇だけ写す＝店舗設定の段から制度の鍵（sys_*）と待遇の鍵を外す・ほかの鍵は残す", !("sys_hourly" in p2) && !("norm_axes" in p2) && p2.receipt_tel === "1" && p2.biz_type === "cabaret" && !a2.some((s) => s.key === "c"));
// ★版 2（■2-a）: 店舗設定を写したら、店舗設定の段は残して写した鍵だけ外す（店ごとの鍵は 2 店目の入力）・中身で段を飛ばす・領収書は住所と電話を残し登録番号と下の文は写した値
const stepsS: V5Step[] = [
  { key: "settings", group: "settings", label: "", rpc: "set_store_profile", args: { p_store_id: "x", p_patch: { name: "2 号店", setup_done: false, use_vip: true, use_counter: false, kiosk_features: { punch: true }, payment_methods: { cash: true }, billing_mode: "table", join_mode: "join_set", sys_hourly: true, pay_day: 25 } } },
  { key: "okuri_mode", group: "settings", label: "", rpc: "set_store_okuri_mode", args: {} }, { key: "receivable", group: "settings", label: "", rpc: "set_store_receivable_policy", args: {} },
  { key: "norm_axes", group: "settings", label: "", rpc: "set_store_norm_axes", args: {} }, { key: "tax_config", group: "settings", label: "", rpc: "set_store_tax_config", args: {} },
  { key: "receipt", group: "settings", label: "", rpc: "set_store_invoice_profile", args: {} }, { key: "receipt2", group: "settings", label: "", rpc: "set_store_receipt_profile", args: { p_store_id: "x", p_address: "2 号店の住所", p_tel: "03", p_reg_no: "T0000000000000", p_footer: "雛形" } },
  { key: "mine", group: "settings", label: "", rpc: "set_store_mine_settings", args: {} },
];
const sS = applyCopyToPlan(stepsS, ["settings"], { invoice_reg_no: "T1234567890123", receipt_footer: "1 店目の下の文" });
const pS = (sS.find((x) => x.key === "settings")?.args?.p_patch ?? {}) as Record<string, unknown>;
const r2 = (sS.find((x) => x.key === "receipt2")?.args ?? {}) as Record<string, unknown>;
check("(1) ★版 2 店舗設定を写す＝店ごとの鍵（店名・席の有無・キオスク・初期設定の印）は残し、写した鍵（支払い方法・会計の方式）は外す・料金と待遇の鍵は残す",
  JSON.stringify(Object.keys(pS).sort()) === JSON.stringify(["join_mode", "kiosk_features", "name", "pay_day", "setup_done", "sys_hourly", "use_counter", "use_vip"]));
check("(1) ★版 2 店舗設定を写す＝送り・売掛・税・領収書の発行者・マイページの段は飛ばす・ノルマの軸（待遇）は残す・領収書の住所と電話は 2 店目・登録番号と下の文は写した値",
  sS.map((x) => x.key).join(",") === "settings,norm_axes,receipt2" && r2.p_address === "2 号店の住所" && r2.p_tel === "03" && r2.p_reg_no === "T1234567890123" && r2.p_footer === "1 店目の下の文"
  && applyCopyToPlan(stepsS, ["comp"]).map((x) => x.key).join(",") === "settings,okuri_mode,receivable,tax_config,receipt,receipt2,mine");
const allPatchKeys = new Set<string>();
for (const t of ["cabaret", "girlsbar", "snack", "lounge", "bar", "host"] as const) {
  const st = applyType(v5DefaultState("2026-11-23"), t); st.shop.name = "x"; st.payroll.okuriFlatBase = 1000; st.timeMode = "manual";
  for (const x of buildV5Plan(st, { storeId: "s", deviceIdemKey: "d", staffIdemKeys: [], current: { round_unit: 1, round_mode: "down", time_mode: "fixed", time_per: "table", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } }).steps)
    if (x.rpc === "set_store_profile") for (const k of Object.keys((x.args?.p_patch ?? {}) as Record<string, unknown>)) allPatchKeys.add(k);
}
const unclassPatch = [...allPatchKeys].filter((k) => !(k in STORE_SETTING_KEYS));
check(`(1) ★版 2 初期設定（業態 6）が店舗設定に書く鍵（${allPatchKeys.size}）はすべて名簿にある`, unclassPatch.length === 0 && allPatchKeys.size > 30, unclassPatch);
check("(1) ★版 2 マイページの鍵（MINE_SETTING_KEYS）はすべて名簿にある", MINE_SETTING_KEYS.every((k) => k in STORE_SETTING_KEYS), MINE_SETTING_KEYS.filter((k) => !(k in STORE_SETTING_KEYS)));
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
  src("app/(manage)/setup/setup-wizard.tsx").includes("if (!ce) copiedPlansRef.current = copiedPlanIdsOf(cd);") && src("app/(manage)/setup/setup-wizard.tsx").indexOf("if (!ids2.basic && copiedPlansRef.current) {") > 0
  && src("app/(manage)/setup/setup-wizard.tsx").indexOf("if (!ids2.basic && copiedPlansRef.current) {") < src("app/(manage)/setup/setup-wizard.tsx").indexOf('rows.find((x) => x.name === "基本プラン")')
  && mig.includes("order by c.created_at, c.id), '[]'::jsonb)") && mig.includes("'plans', v_plans,") && src("lib/nox/setup/v5.ts").includes("p_valid_from: monthStartJstOf(now)"));
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
// ★版 2（■2-a）: SQL の名簿＝lib の名簿（写す鍵）・列の写し＝lib の列の名簿
const sqlArr = (name: string): string[] => { const m = mig.match(new RegExp(name + String.raw`\s+text\[\]\s*:=\s*array\[([^\]]*)\]`)); return m ? [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort() : ["(none)"]; };
const keyDiff = (["pricing", "comp", "settings", "hours"] as const).filter((pt) => JSON.stringify(sqlArr(`v_${pt}_keys`)) !== JSON.stringify(copyKeysOf(pt)));
check("(2) ★版 2 SQL の写す鍵の名簿（料金・待遇・店舗設定・営業時間）は lib の名簿と同じ・除く鍵の名簿（v_never_keys）は無い", keyDiff.length === 0 && !mig.includes("v_never_keys"), keyDiff);
const setCols = (part: string): string[] => { const body = part === "pricing" ? mig.slice(mig.indexOf("update public.stores d set hon_fee"), mig.indexOf("from public.stores s where s.id = p_src and d.id = p_dst;", mig.indexOf("update public.stores d set hon_fee")))
  : mig.slice(mig.indexOf("update public.stores d set settings_json = coalesce(d.settings_json, '{}'::jsonb) || v_sj,"), mig.indexOf("from public.stores s where s.id = p_src and d.id = p_dst;", mig.indexOf("update public.stores d set settings_json = coalesce(d.settings_json, '{}'::jsonb) || v_sj,")));
  return [...body.matchAll(/([a-z_]+) = s\.([a-z_]+)/g)].filter((m) => m[1] === m[2]).map((m) => m[1]).sort(); };
check("(2) ★版 2 列の写し（料金・店舗設定）は lib の列の名簿と同じ・屋号は 2 店目の店名・LINE と位置と席の有無は写さない",
  JSON.stringify(setCols("pricing")) === JSON.stringify(copyColumnsOf("pricing")) && JSON.stringify(setCols("settings")) === JSON.stringify(copyColumnsOf("settings"))
  && mig.includes("trade_name = coalesce(d.trade_name, d.name)") && !/(line_config|punch_allow_ip|punch_lat|use_vip|use_counter)\s*=\s*s\./.test(mig), { pricing: setCols("pricing"), settings: setCols("settings") });
check("(2) ★版 2 ランク＝写し先に有れば名前で結ぶ・結べなければ not empty: ranks・slide_rank_ids は付け替えられない ID を残さない・デモの会社は会社の支払日を書かない",
  mig.includes("raise exception 'not empty: ranks';") && mig.includes("join _nox_copy_map m2 on m2.old = x), '{}'::uuid[])") && !mig.includes("coalesce((select m2.new from _nox_copy_map m2 where m2.old = x), x)")
  && mig.includes("if exists (select 1 from public.orgs where id = v_org and is_demo) then raise exception 'forbidden (demo)'; end if;") && src("app/(manage)/master/store-profile-panel.tsx").includes("if (pe && /forbidden \\(demo\\)/.test(pe.message) && orgPay !== null) ({ error: pe } = await setStoreProfile({ pay_day: orgPay }));"));
check("(2) ★版 2 の ■3 体験入店は写したとき結ばない＝完了の画面でオーナーが選ぶ（選ばずに体入を登録すると行を作る前に止める）",
  src("app/(manage)/setup/setup-wizard.tsx").includes('data-setup-trial-pick="1"') && src("app/(manage)/setup/setup-wizard.tsx").includes("if (isTrial && trialChoices && !planIds.trial && !trialPick) {")
  && src("app/(manage)/setup/setup-wizard.tsx").indexOf("if (isTrial && trialChoices && !planIds.trial && !trialPick) {") < src("app/(manage)/setup/setup-wizard.tsx").indexOf("const steps = castPlanOf(c, store.id, { ...planIds, trial: planIds.trial ?? (trialPick || null) }"));

check("(2) ★版 2 画面は写した後の 2 店目の登録番号と領収書の下の文を読んで、領収書の段に渡す（住所と電話は 2 店目の入力）", src("app/(manage)/setup/setup-wizard.tsx").includes("applyCopyToPlan(planAll.steps, copyParts, copiedReceiptRef.current)") && src("app/(manage)/setup/setup-wizard.tsx").includes("copiedReceiptRef.current = { invoice_reg_no:"));

check("(1) ★版 3 打刻の強制・制限の方式・勤務時間の丸め（鍵と列）は写さない・対の値を写さない 5 つに印（端末・同意・シフト）", ["punch_enforce", "punch_restrict_mode", "punch_round_unit", "punch_round_mode"].every((k) => STORE_SETTING_KEYS[k]?.part === null && STORE_COLUMNS[k]?.part === null)
  && ["punch_methods", "sys_cast_register", "cast_register_scope"].every((k) => !!STORE_SETTING_KEYS[k]?.needs && STORE_SETTING_KEYS[k]?.part !== null) && !/punch_(enforce|restrict_mode|round_unit|round_mode) = s./.test(mig));
check("(1) ★版 4 シフトの無い打刻（鍵と列）・契約の確認を出す（鍵）は写さない（2 店目は「許す」「出さない」で始まる）・印は 3 つ（打刻の方法・キャストのレジ使用・会計できる卓）",
  STORE_SETTING_KEYS.punch_require_shift?.part === null && STORE_COLUMNS.punch_require_shift?.part === null && STORE_SETTING_KEYS.contract_ack?.part === null
  && Object.entries(STORE_SETTING_KEYS).filter(([, v]) => !!v.needs && v.part !== null).map(([k]) => k).sort().join(",") === "cast_register_scope,punch_methods,sys_cast_register"
  && !/punch_require_shift = s./.test(mig) && !/'contract_ack'/.test(mig) && !/'punch_require_shift'/.test(mig));

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
    // ★版 2（■2-a）: 鍵を足したのに名簿に入れ忘れたら赤＝set_store_profile の白名単・本番の settings_json の鍵・stores の列
    const spp = (await tx.one<{ s: string }>("select prosrc s from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_store_profile'")).s.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");
    const wlHead = "v_keys     text[] := ", wi = spp.indexOf(wlHead + "array["), wj = spp.indexOf("];", wi);
    const wl = (await tx.q<{ k: string }>("select unnest(" + spp.slice(wi + wlHead.length, wj + 1) + ") k")).map((r) => r.k);
    const liveKeys = (await tx.q<{ k: string }>("select distinct k from public.stores s, jsonb_object_keys(coalesce(s.settings_json, '{}'::jsonb)) k")).map((r) => r.k);
    const cols = (await tx.q<{ c: string }>("select column_name c from information_schema.columns where table_schema = 'public' and table_name = 'stores'")).map((r) => r.c);
    const miss = { wl: wl.filter((k) => !(k in STORE_SETTING_KEYS)), live: liveKeys.filter((k) => !(k in STORE_SETTING_KEYS)), cols: cols.filter((c) => !(c in STORE_COLUMNS)) };
    check(`(3) ★版 2 名簿に入れ忘れが無い（白名単 ${wl.length}・本番の鍵 ${liveKeys.length}・stores の列 ${cols.length}）`, wl.length > 60 && miss.wl.length === 0 && miss.live.length === 0 && miss.cols.length === 0, miss);
    const oc = await countA2(await uid("nox-verify-owner-a@example.com"));
    check("(3) owner は A2 も見える（会社の全店＝今見ている店で画面が絞る）", Number(oc.seats) > 0 || Number(oc.casts) > 0 || Number(oc.store_business_hours) >= 0, oc);
  } finally { await db.query("rollback").catch(() => undefined); await db.end(); }
}
void dbPart().then(() => {
  if (fails.length) { console.error(`verify:nox-multi-store FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-multi-store OK ${pass} checks（2 号店の段 1・段 2・旗 false）`);
}, (e) => { console.error(`verify:nox-multi-store ERROR ${(e as Error).message}`); process.exit(1); });
