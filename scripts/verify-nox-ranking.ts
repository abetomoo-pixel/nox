/*
 * verify:nox-ranking — 裁定346（便 N1013b・2026-10-13）: ランキングの売上軸（給与の collect と同じ按分後の合算＝純関数）とキャスト側の 3 値（off／self／top）の係留（DB 不触・env 不要）。
 *   npm run verify:nox-ranking。f0 106 段目。
 *  rk(1) sumCastSales: 行順に依存しない合算・空は空 Map・collect の salesByCast と同値
 *  rk(2) castSalesRankingOf: 売上降順・同額は名前昇順→id・rank 1 起点
 *  rk(3) castRankingModeOf: ranking off→off・on＋show_others off→self（既定）・on＋on→top
 *  rk(4) 配線: collect（sumCastSales）・norm-progress（sumCastSales）・analytics（castSalesRankingOf・軸切替 SegSelect・売上列）・/mine/ranking（self＝自分の行だけ）・/mine（off 以外はカード）・mine-settings-panel の説明
 */
import fs from "node:fs";
import { CAST_RANKING_MODE_LABEL, RANK_AXIS_LABEL, castRankingModeOf, castSalesRankingOf, sumCastSales, type CastSalesRow } from "../lib/nox/payroll/cast-sales";
import { mineSettingsOf } from "../lib/nox/store/mine-settings";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const rows: CastSalesRow[] = [
  { cast_id: "b", biz_date: "2026-10-01", sales: 30000, hon: 1, jonai: 0, dohan: 0 },
  { cast_id: "a", biz_date: "2026-10-01", sales: 50000, hon: 2, jonai: 1, dohan: 0 },
  { cast_id: "b", biz_date: "2026-10-02", sales: 40000, hon: 0, jonai: 2, dohan: 1 },
  { cast_id: "c", biz_date: "2026-10-02", sales: 70000, hon: 0, jonai: 0, dohan: 0 },
];

// rk(1)
{
  const m = sumCastSales(rows);
  check("rk(1-1) 合算: b＝70,000・hon 1・jonai 2・dohan 1／a＝50,000／c＝70,000", JSON.stringify(m.get("b")) === JSON.stringify({ sales: 70000, hon: 1, jonai: 2, dohan: 1 }) && m.get("a")?.sales === 50000 && m.get("c")?.sales === 70000);
  const m2 = sumCastSales([...rows].reverse());
  check("rk(1-2) 行順に依存しない・空は空 Map", JSON.stringify([...m2.entries()].sort()) === JSON.stringify([...m.entries()].sort()) && sumCastSales([]).size === 0);
  // collect と同値（collect の旧ループと同じ式）
  const old = new Map<string, { sales: number; hon: number; jonai: number; dohan: number }>();
  for (const r of rows) { const cur = old.get(r.cast_id) ?? { sales: 0, hon: 0, jonai: 0, dohan: 0 }; cur.sales += r.sales; cur.hon += r.hon; cur.jonai += r.jonai; cur.dohan += r.dohan; old.set(r.cast_id, cur); }
  check("rk(1-3) collect の旧ループと同値", JSON.stringify([...old.entries()].sort()) === JSON.stringify([...m.entries()].sort()));
}

// rk(2)
{
  const rk = castSalesRankingOf(rows, (id) => ({ a: "あや", b: "ひなの", c: "ひなの" } as Record<string, string>)[id] ?? id);
  check("rk(2-1) 売上降順・同額（b／c 70,000）は名前昇順→id・rank 1 起点", rk.map((r) => `${r.rank}:${r.castId}`).join(",") === "1:b,2:c,3:a");
  check("rk(2-2) 軸ラベル＝指名数／売上", RANK_AXIS_LABEL.nom === "指名数" && RANK_AXIS_LABEL.sales === "売上");
}

// rk(3)
{
  check("rk(3-1) off／self／top の写像（既存キー ranking・ranking_show_others）", castRankingModeOf({ ranking: false, ranking_show_others: true }) === "off" && castRankingModeOf({ ranking: true, ranking_show_others: false }) === "self" && castRankingModeOf({ ranking: true, ranking_show_others: true }) === "top");
  check("rk(3-2) 既定＝self（326 の既定 ranking off→off・デモ 'on'/'off'→self）", castRankingModeOf(mineSettingsOf({})) === "off" && castRankingModeOf(mineSettingsOf({ ranking: "on" })) === "self" && castRankingModeOf(mineSettingsOf({ ranking: "on", ranking_show_others: "on" })) === "top");
  check("rk(3-3) ラベル", CAST_RANKING_MODE_LABEL.self === "自分の順位のみ" && CAST_RANKING_MODE_LABEL.top === "上位の名前も出す" && CAST_RANKING_MODE_LABEL.off === "表示しない");
}

// rk(4)
{
  const col = src("lib/nox/payroll/collect.ts");
  check("rk(4-1) collect: salesByCast＝sumCastSales（旧ループなし）", col.includes("for (const [cid, tot] of sumCastSales(salesRows)) salesByCast.set(cid, { ...tot, daily: new Map() });") && !col.includes("cur.sales += r.sales; cur.hon += r.hon; cur.jonai += r.jonai; cur.dohan += r.dohan;\n    cur.daily.set"));
  const np = src("app/api/mine/norm-progress/route.ts");
  check("rk(4-2) norm-progress: actual＝sumCastSales（本人行）", np.includes("const actual = sumCastSales(((salesRows ?? []) as CastSalesRow[]).filter((r) => r.cast_id === castId)).get(castId) ?? { hon: 0, jonai: 0, dohan: 0, sales: 0 };"));
  const ab = src("app/(manage)/analytics/analytics-board.tsx");
  check("rk(4-3) analytics: salesRanking＝castSalesRankingOf・軸切替（SegSelect nom／sales）・売上列「売上（按分）」・見出し", ab.includes("const salesRanking = useMemo(() => castSalesRankingOf(sales, castName), [sales, castName]);") && ab.includes('options={[["nom", RANK_AXIS_LABEL.nom], ["sales", RANK_AXIS_LABEL.sales]] as const}') && ab.includes('<th className="num">売上（按分）</th>') && ab.includes("<h3>キャストランキング（{period}・{RANK_AXIS_LABEL[rankAxis]}）</h3>"));
  const rp = src("app/mine/ranking/page.tsx");
  check("rk(4-4) /mine/ranking: castRankingModeOf・self は自分の行だけ・off は /mine へ・金額列なし", rp.includes("const rankMode = castRankingModeOf(ms);") && rp.includes('if (rankMode === "off") redirect("/mine");') && rp.includes('const rows = rankMode === "self" ? allRows.filter((r) => r.is_self) : allRows;') && rp.includes('supabase.rpc("get_cast_sales_rank", { p_store_id: store.id, p_period: period })') && rp.includes("mySales.sales.toLocaleString()") && (rp.match(/toLocaleString\(\)/g) ?? []).length === 1); // ★裁定346 追補1（0171）: 売上の順位＝自分の 1 行（get_cast_sales_rank）・金額は自分の分だけ（toLocaleString は 1 箇所）
  const mp = src("app/mine/page.tsx");
  check("rk(4-5) /mine: off 以外は自分の順位カード", mp.includes('{castRankingModeOf(ms) !== "off" && (mySales || myRank) && (' /* ★便 X13-G W-22 ④: 売上が既定 */));
  const panel = src("app/(manage)/master/mine-settings-panel.tsx");
  check("rk(4-6) 店舗設定の説明＝top／self・金額はどちらでも出さない", panel.includes("ランキングに上位の名前も出します。OFF は自分の順位のみ。金額はどちらでも出しません") /* ★便 X13-G W-9: 画面の文言から top／self を外した */);
}

if (fails.length) { console.error(`✗ verify:nox-ranking 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`ランキング（裁定346）: 売上軸の純関数（collect と同値）・off／self／top・配線 ✓ ${pass}`);
