/*
 * verify:nox-norm-axes — 裁定347／追補1・GV-2・裁定346 追補1（0171・便 P171・2026-10-14）: ノルマの採用軸（settings_json.norm_axes）とプラン既定の目標（comp_plans.norm_*_target）の純関数と 3 画面＋/mine の配線、ランキングの売上順位 self（DB 不触・env 不要）。
 *   npm run verify:nox-norm-axes。f0 108 段目。
 *  na(1) normAxesOf（欠損＝ON・false のみ OFF）・quotaKeysOfAxes（shimei OFF＝hon／jonai とも隠す・scope hon_jonai で jonai）・normTargetsOf／planDefaultQuotaOf
 *  na(2) resolveQuotaOf（個別＞既定＞なし・OFF 軸は null）・hasOverride・resolveNormTargetsOf（cast_norms の 0＝未設定＝既定を継承）
 *  na(3) 配線: plan-editor（p_norm_*＝29 引数・節「ノルマ（プラン既定の目標）」・OFF 軸は入力口なし）・norm-config-panel（set_store_norm_axes 4 キー＋set_store_norm_config 同期）・comp-sections NormTab（薄濃・採用軸の列）・casts-board（既定の継承表示・印「個別」・「プランの既定に戻す」＝set_cast_quota 4 引数 null）・norm-progress（admin で既定を解決）・/mine/ranking（get_cast_sales_rank の自分の行）
 *  na(4) デモ: payload 6 店の comp_plans に norm_*_target（体験入店は 4 つとも null・採用 OFF の軸は null・優遇は高め）・cast_quotas／cast_norms は代表キャストだけ
 */
import fs from "node:fs";
import { NORM_AXES, hasOverride, normAxesArgsOf, normAxesOf, normTargetsOf, planDefaultQuotaOf, quotaKeysOfAxes, resolveNormTargetsOf, resolveQuotaOf, shimeiScopeOf } from "../lib/nox/store/norm-axes";
import { PROFILES, TRIAL } from "../scripts/demo/profiles.mjs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (v: unknown) => JSON.stringify(v);

// na(1)
{
  check("na(1-1) normAxesOf: 欠損＝ON・false のみ OFF・型違いは ON", J(normAxesOf({})) === J({ days: true, dohan: true, sales: true, shimei: true }) && J(normAxesOf({ norm_axes: { dohan: false, sales: "off" } })) === J({ days: true, dohan: false, sales: true, shimei: true }) && normAxesOf(null).days === true);
  check("na(1-2) quotaKeysOfAxes: 全 ON＋hon＝hon/dohan/sales・hon_jonai＝hon/jonai/dohan/sales・shimei OFF＝dohan/sales・dohan OFF＝hon/sales", J(quotaKeysOfAxes(normAxesOf({}), "hon")) === J(["hon", "dohan", "sales"]) && J(quotaKeysOfAxes(normAxesOf({}), "hon_jonai")) === J(["hon", "jonai", "dohan", "sales"]) && J(quotaKeysOfAxes(normAxesOf({ norm_axes: { shimei: false } }), "hon_jonai")) === J(["dohan", "sales"]) && J(quotaKeysOfAxes(normAxesOf({ norm_axes: { dohan: false } }), "hon")) === J(["hon", "sales"]));
  check("na(1-3) normTargetsOf／planDefaultQuotaOf: 既定→cast_quotas の形（shimei→hon・days は出ない・OFF 軸は null）", J(planDefaultQuotaOf(normTargetsOf({ norm_days_target: 12, norm_dohan_target: 4, norm_sales_target: 500000, norm_shimei_target: 20 }), normAxesOf({}))) === J({ hon: 20, jonai: null, dohan: 4, sales: 500000 }) && J(planDefaultQuotaOf(normTargetsOf({ norm_dohan_target: 4 }), normAxesOf({ norm_axes: { dohan: false } }))) === J({ hon: null, jonai: null, dohan: null, sales: null }));
  check("na(1-4) shimeiScopeOf／normAxesArgsOf（4 キー boolean を常に明示）", shimeiScopeOf({ shimei_norm_scope: "hon_jonai" }) === "hon_jonai" && shimeiScopeOf({}) === "hon" && J(normAxesArgsOf({ days: true, dohan: false, sales: true, shimei: true })) === J({ days: true, dohan: false, sales: true, shimei: true }));
}

// na(2)
{
  const plan = planDefaultQuotaOf(normTargetsOf({ norm_days_target: 12, norm_dohan_target: 4, norm_sales_target: 500000, norm_shimei_target: 20 }), normAxesOf({}));
  const r1 = resolveQuotaOf(plan, null, normAxesOf({}), "hon");
  check("na(2-1) 個別なし＝既定を継承（source plan）・jonai は scope hon で出ない", J(r1.quota) === J({ hon: 20, jonai: null, dohan: 4, sales: 500000 }) && J(r1.source) === J({ hon: "plan", jonai: null, dohan: "plan", sales: "plan" }) && !hasOverride(r1));
  const r2 = resolveQuotaOf(plan, { hon: 25, jonai: null, dohan: null, sales: null }, normAxesOf({}), "hon");
  check("na(2-2) 個別（hon 25）＞既定・他は既定のまま・hasOverride", r2.quota.hon === 25 && r2.source.hon === "override" && r2.quota.dohan === 4 && r2.source.dohan === "plan" && hasOverride(r2));
  const r3 = resolveQuotaOf(plan, { hon: 25, jonai: 3, dohan: 9, sales: 1 }, normAxesOf({ norm_axes: { dohan: false, sales: false } }), "hon");
  check("na(2-3) 採用 OFF の軸は個別があっても null（ACE 同伴 OFF で消える）", r3.quota.dohan === null && r3.source.dohan === null && r3.quota.sales === null && r3.quota.hon === 25 && r3.quota.jonai === null);
  const n = resolveNormTargetsOf({ days: 12, dohan: 4, sales: 500000, shimei: 20 }, { days: 0, dohan: 6, sales: 0, shimei: 0 }, normAxesOf({ norm_axes: { sales: false } }));
  check("na(2-4) resolveNormTargetsOf: cast_norms の 0＝未設定＝既定（薄）・非 0＝上書き（濃）・OFF 軸は null", J(n.value) === J({ days: 12, dohan: 6, sales: null, shimei: 20 }) && J(n.source) === J({ days: "plan", dohan: "override", sales: null, shimei: "plan" }));
}

// na(3)
{
  const pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx");
  check("na(3-1) plan-editor: set_comp_plan に p_norm_days／dohan／sales／shimei_target（空＝null）・節「ノルマ（プラン既定の目標）」は planTabQuota で出し分け・OFF 軸は入力口なし", pe.includes("p_norm_days_target: normArg(draft.normDays), p_norm_dohan_target: normArg(draft.normDohan), p_norm_sales_target: normArg(draft.normSales), p_norm_shimei_target: normArg(draft.normShimei)") && pe.includes('{isSectionOn(settings, "planTabQuota") && (<section id="norm-defaults"') && pe.includes("{NORM_AXES.filter((k) => normAxesOf(settings)[k]).map((k) => {") && pe.includes('normDays: normStr(p.norm_days_target)'));
  const cp = src("app/(manage)/master/norm-config-panel.tsx");
  check("na(3-2) norm-config-panel: 4 軸＝set_store_norm_axes（normAxesArgsOf）→旧 2 キー＋カウント＝set_store_norm_config（sales／shimei を同期）", cp.includes('supabase.rpc("set_store_norm_axes", { p_store_id: storeId, p_axes: normAxesArgsOf(axes) })') && cp.includes("p_sales_enabled: axes.sales,") && cp.includes("p_shimei_enabled: axes.shimei,") && cp.includes("{NORM_AXES.map((k) => (") && !cp.includes("initialSalesEnabled"));
  const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx");
  check("na(3-3) comp-sections NormTab: plans／castPlans／settings を受け・採用軸の列だけ・継承（plan）＝薄・上書き（override）＝濃・一括入力は OFF 軸を隠す", cs.includes("const axisCols = NORM_AXES.filter((k) => axes[k]);") && cs.includes('data-source={r.source[k] ?? "none"}') && cs.includes('style={r.source[k] === "plan" ? { color: "var(--sub)", opacity: 0.75 } : r.source[k] === "override" ? { fontWeight: 700 } : undefined}') && cs.includes('{axes.dohan && <label style={{ fontSize: 12 }}>同伴(回) {cell("dohan", bulk.dohan)}</label>}'));
  const nb = src("app/(manage)/master/cast-comp/norma/norma-board.tsx");
  check("na(3-4) norma-board: NormTab に plans／castPlans／settings・NormConfigPanel に initialAxes＝normAxesOf(settings)", nb.includes("plans={data.plans} castPlans={data.castPlans} settings={settings}") && nb.includes("initialAxes={normAxesOf(settings)}"));
  const cb = src("app/(manage)/casts/casts-board.tsx");
  check("na(3-5) casts-board: comp_plans の select に norm_*_target・quotaRow（null＝継承）・解決＝quotaResolvedOf（個別＞既定）・入力口は採用軸だけ・placeholder に既定・印「個別」・「プランの既定に戻す」＝set_cast_quota 4 引数 null", cb.includes("is_active, norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target") && cb.includes("const quotaResolvedOf = (c: CastLogin) => {") && cb.includes("{QUOTA_KEYS.filter((k) => q.keys.includes(k)).map((k) => (") && cb.includes('placeholder={q.res.source[k] === "plan" ? String(q.res.quota[k]) : "目標なし"}') && cb.includes('p_hon: null, p_jonai: null, p_dohan: null, p_sales: null') && cb.includes(">プランの既定に戻す</button>") && cb.includes('<span className="nox-stpill ok" style={{ marginLeft: 6 }}>個別</span>'));
  const np = src("app/api/mine/norm-progress/route.ts");
  check("na(3-6) norm-progress: admin で現在の cast_plan→comp_plans.norm_*・店設定の軸とカウント→resolveQuotaOf（個別＞既定）・返却に source", np.includes("const resolved = resolveQuotaOf(planDefaultQuotaOf(normTargetsOf(planRow ?? null), axes), (quotaRow ?? null) as Partial<Quota> | null, axes, scope);") && np.includes("return NextResponse.json({ period, quota, source, actual: { days: daysActual, ...actual } });") /* ★347 追補2 修正（便 N1014 A-4）: 出勤日数の軸を含む */ && np.includes("const daysT = resolveNormTargetsOf(normTargetsOf(planRow ?? null), { days: normRow?.days_target ?? 0 }, axes);") && np.includes('admin.from("comp_plans").select("norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target")'));
  const rp = src("app/mine/ranking/page.tsx");
  check("na(3-7) /mine/ranking: get_cast_sales_rank の自分の行＝「売上の順位: N位 / M人中」（他人の額は出ない）", rp.includes('supabase.rpc("get_cast_sales_rank", { p_store_id: store.id, p_period: period })') && rp.includes("売上の順位: <b className=\"num\">{mySales.rank}位</b>"));
}

// na(4)
{
  for (const code of ["muse", "luna", "noir", "ace", "lily", "nest"] as const) {
    const T = (JSON.parse(src(`docs/demo/payload/${code}.json`)) as { tables: Record<string, Array<Record<string, any>>> }).tables;
    const p = PROFILES[code as keyof typeof PROFILES] as unknown as { normAxes: string[]; sys: { norms: boolean } };
    const plans = T.comp_plans ?? []; const trial = plans.find((x) => x.name === "体験入店"); const others = plans.filter((x) => x.name !== "体験入店");
    const nullAxes = (x: Record<string, any>) => ["days", "dohan", "sales", "shimei"].every((k) => p.normAxes.includes(k) ? (typeof x[`norm_${k}_target`] === "number") : x[`norm_${k}_target`] === null);
    check(`na(4-1) ${code}: 体験入店は既定 4 つとも null・他プランは採用軸だけ数値（${p.normAxes.join("/") || "なし"}）・優遇は高め`, !!trial && ["days", "dohan", "sales", "shimei"].every((k) => trial[`norm_${k}_target`] == null /* 体験入店の push はキー無し＝jsonb_populate で null */) && others.every(nullAxes) && others.filter((x) => /Premium|Senior|Slide/.test(x.name)).every((x) => p.normAxes.every((k) => (x[`norm_${k}_target`] ?? 0) >= (others.find((y) => !/Premium|Senior|Slide/.test(y.name))?.[`norm_${k}_target`] ?? 0))));
    const rep = (T.casts ?? []).find((c) => c.user_id);
    check(`na(4-2) ${code}: cast_quotas は代表キャストだけ（prev／cur の 2 行）・cast_norms は ${p.sys.norms ? "代表 1 行" : "なし"}`, (T.cast_quotas ?? []).length === 2 && (T.cast_quotas ?? []).every((q) => q.cast_id === rep?.id) && (p.sys.norms ? (T.cast_norms ?? []).filter((n) => n.period?.$m === 0).length === 1 && (T.cast_norms ?? []).find((n) => n.period?.$m === 0)?.cast_id === rep?.id : (T.cast_norms ?? []).length === 0) /* ★348 追補2 B-2: LILY は先月 2 行が加わる＝当月 1 行だけ見る */, `quotas=${(T.cast_quotas ?? []).length}`);
  }
  check("na(4-3) TRIAL 6 店（体験入店の割当・保証）は不変", Object.keys(TRIAL).length === 6);
}

if (fails.length) { console.error(`✗ verify:nox-norm-axes 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`ノルマの採用軸とプラン既定（裁定347／GV-2／346 追補1・0171）: 純関数・3 画面＋/mine・ランキング self・デモ既定 ✓ ${pass}`);
