/*
 * verify:nox-ranking-default — 便 GV-A（2026-10-14）裁定363（GV-11）ランキングの既定軸＝売上（按分）の係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-ranking-default。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const db = src("app/(manage)/dashboard/dashboard-board.tsx"); const ab = src("app/(manage)/analytics/analytics-board.tsx"); const rp = src("app/mine/ranking/page.tsx");
check("rd(1) ホーム: 既定 sales・get_cast_sales（当月）→castSalesRankingOf 上位 5・見出し「売上ランキング（今月 …・按分）」・SegSelect 売上／本指名件数", db.includes('useState<RankAxis>("sales")') && db.includes('supabase.rpc("get_cast_sales", { p_store_id: sid, p_from: `${month}-01`, p_to: mEnd })') && db.includes("setSalesRanking(castSalesRankingOf((sr ?? []) as CastSalesRow[], (id) => casts.find((c) => c.id === id)?.name ?? \"—\").slice(0, 5));") && db.includes('rankAxis === "sales" ? `売上ランキング（今月 ${month}・按分）` : `本指名ランキング（今月 ${month}・件数）`') && db.includes('options={[["sales", RANK_AXIS_LABEL.sales], ["nom", "本指名件数"]] as const}') && db.includes('data-rank-axis="sales"'));
check("rd(2) /analytics: 既定 sales（SegSelect の切替は不変）", ab.includes('useState<RankAxis>("sales")') && ab.includes('options={[["nom", RANK_AXIS_LABEL.nom], ["sales", RANK_AXIS_LABEL.sales]] as const}'));
check("rd(3) /mine/ranking: 既定＝売上（自分の順位＝get_cast_sales_rank・346 の off／self／top は不変）・本指名件数は ?axis=nom で表（金額列なし）", rp.includes('(await searchParams)?.axis === "nom" ? "nom" : "sales"') && rp.includes('data-rank-axis={axis}') && rp.includes('{axis === "nom" && (') && rp.includes('supabase.rpc("get_cast_sales_rank", { p_store_id: store.id, p_period: period })') && rp.includes("const rankMode = castRankingModeOf(ms);") && (rp.match(/toLocaleString\(\)/g) ?? []).length === 1);

if (fails.length) { console.error(`✗ verify:nox-ranking-default 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-ranking-default OK (${pass} checks)`);
