/*
 * verify:nox-c1118 — 2026-11-18 夜（相談役 ⑥）の実機の通しで出た見せ方の直し 3 つ（DB 不触・env 不要・純関数と逐語 pin）。
 *   npx tsx scripts/verify-nox-c1118.ts
 *  c(2) 在庫（棚卸し）: 上の帯に商品名と「現在庫／基準」（足りない順に先頭 3 件・ほか n 件）・表の該当行に赤い印と基準の本数・
 *       絞り込み「基準を下回っている商品だけ」。判定は今までの警告と同じ式（在庫 ≤ reorder_point・在庫の行が無い商品は 0 本・track_stock=false は対象外）。
 *  c(3) 売上ランキング（キャスト）: 指名と同じ表の形（順位・名前・売上（按分））で自分の 1 行だけ・切り替えは「売上｜指名」のタブ（小さいリンクは撤去）。
 *       get_cast_sales_rank は cast に自分の 1 行だけを返す（0171）＝ほかの人の額・順位は出ない。
 *  c(4) 確定給与明細（キャスト）: 期の選択（payslips の行＝確定・支払済みの期だけ・開いたときは直近）・「印刷 / PDFで保存」は選んでいる期だけ
 *       （ファイル名も選んでいる期）。payslips の RLS は cast 本人の行だけ（0016 payslips_select）＝新しい RPC は要らない。
 *  逆テスト（手動・1 回）: isLowStock の `<=` を `<` にする→c(2-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { isLowStock, lowStockOf, lowStockSummaryOf, stocktakeRowsOf } from "../lib/nox/stock/stocktake";
import { slipPeriodOptionLabelOf, slipPdfTitleOf } from "../lib/nox/payroll/list";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// ── c(2) 在庫 ──
{
  check("c(2-1) 判定＝基準があり、現在庫が基準以下（今までの警告と同じ式）・基準なしは対象外",
    isLowStock(5, 5) && isLowStock(0, 3) && !isLowStock(6, 5) && !isLowStock(0, null) && !isLowStock(0, undefined) && isLowStock(0, 0));
  const prods = [
    { id: "p1", name: "角", type: "bottle", reorder_point: 5 },                       // 2／5＝−3
    { id: "p2", name: "山崎", type: "bottle", reorder_point: 3 },                     // 在庫の行なし＝0／3＝−3
    { id: "p3", name: "響", type: "bottle", reorder_point: 2 },                       // 4／2＝対象外
    { id: "p4", name: "ビール", type: "drink", reorder_point: 10 },                   // 9／10＝−1
    { id: "p5", name: "お通し", type: "food", reorder_point: 20, track_stock: false }, // 在庫を管理しない＝対象外
    { id: "p6", name: "白州", type: "bottle", reorder_point: null },                  // 基準なし＝対象外
    { id: "p7", name: "唐揚げ", type: "food", reorder_point: 1 },                     // 1／1＝0
  ];
  const stock: Record<string, number> = { p1: 2, p3: 4, p4: 9, p5: 0, p6: 0, p7: 1 };
  const low = lowStockOf(prods, stock);
  check("c(2-2) 帯の対象＝基準を下回る商品（track_stock=false と基準なしは除く・在庫の行が無い商品は 0 本）・足りない順→名前",
    J(low.map((i) => i.id)) === J(["p1", "p2", "p4", "p7"]) && low[1].current === 0 && low[1].reorderPoint === 3, J(low));
  const sum = lowStockSummaryOf(low, 3);
  check("c(2-3) 帯の 1 行＝先頭 3 件の「商品名 現在庫／基準単位」・残りは件数（ほか 1 件）",
    J(sum.shown) === J(["角 2／5本", "山崎 0／3本", "ビール 9／10本"]) && sum.rest === 1, J(sum));
  check("c(2-4) 3 件以下は「ほか」なし・0 件は空", lowStockSummaryOf(low.slice(0, 2), 3).rest === 0 && lowStockSummaryOf([], 3).shown.length === 0 && lowStockSummaryOf([], 3).rest === 0);
  const sp = [
    { id: "a", name: "角", type: "bottle", is_active: true, category_id: null, sort_order: 1, reorder_point: 5 },
    { id: "b", name: "響", type: "bottle", is_active: true, category_id: null, sort_order: 2, reorder_point: 2 },
    { id: "c", name: "山崎", type: "bottle", is_active: false, category_id: null, sort_order: 3, reorder_point: 9 },
    { id: "d", name: "白州", type: "bottle", is_active: true, category_id: null, sort_order: 4 },
  ];
  const ss = { a: 2, b: 4, c: 1, d: 0 };
  const all = stocktakeRowsOf(sp, ss, []);
  const lowOnly = stocktakeRowsOf(sp, ss, [], { lowOnly: true });
  check("c(2-5) 表の行に基準と印（low）・基準なしは null／印なし", J(all.map((r) => [r.id, r.reorderPoint, r.low])) === J([["a", 5, true], ["b", 2, false], ["d", null, false]]), J(all));
  check("c(2-6) 「基準を下回っている商品だけ」＝low の行だけ・無効は「無効の商品も表示」と組み合わせ",
    J(lowOnly.map((r) => r.id)) === J(["a"]) && J(stocktakeRowsOf(sp, ss, [], { lowOnly: true, showInactive: true }).map((r) => r.id)) === J(["a", "c"]));
  const sb = src("app/(manage)/master/stock/stock-board.tsx");
  check("c(2-7) 画面＝帯は lowStockOf／lowStockSummaryOf(…, 3)・商品名の並び（data-low-stock-list）と「ほか n 件」",
    sb.includes("const lowItems = useMemo(() => lowStockOf(managedProducts, stock), [managedProducts, stock]);") && sb.includes("const lowSummary = lowStockSummaryOf(lowItems, 3);")
    && sb.includes('data-low-stock-list="1"') && sb.includes('{lowSummary.shown.join("・")}') && sb.includes("ほか {lowSummary.rest} 件") && sb.includes('className="nox-alert danger" data-low-stock={lowStock}'));
  check("c(2-8) 画面＝表の該当行に赤い印と基準の本数（data-stocktake-low・var(--bad)）・現在庫も赤",
    sb.includes("{r.low && <span style={{ ...t.tag, fontSize: 10, marginLeft: 6, color: \"var(--bad)\", borderColor: \"var(--bad)\" }} data-stocktake-low={r.id}>● 基準 {r.reorderPoint}{r.unit}</span>")
    && sb.includes('style={{ color: r.low ? "var(--bad)" : "var(--sub)" }}>現在庫 {r.current}{r.unit}</span>'));
  check("c(2-9) 画面＝絞り込み「基準を下回っている商品だけ（n 件）」・行の取り出しに lowOnly を渡す・該当なしの文",
    sb.includes("基準を下回っている商品だけ（{lowRowCount} 件）") && sb.includes('data-stocktake-low-only="1"') && sb.includes("stocktakeRowsOf(managedProducts, stock, categories, { q: tq, showInactive, lowOnly })")
    && sb.includes('{tq.trim() || lowOnly ? "該当する商品がありません。" :'));
}

// ── c(3) 売上ランキング（キャスト） ──
{
  const rp = src("app/mine/ranking/page.tsx");
  check("c(3-1) 切り替え＝「売上｜指名」のタブ（.nox-segtabs・Link 2 本・選択中は on）・小さいリンク（本指名件数で見る／売上で見る）は無い",
    rp.includes('<div className="nox-segtabs" role="tablist" aria-label="ランキングの指標" data-rank-axis={axis}')
    && rp.includes('<Link href="/mine/ranking" role="tab" aria-selected={axis === "sales"} className={axis === "sales" ? "on" : undefined} data-rank-tab="sales">売上</Link>')
    && rp.includes('<Link href="/mine/ranking?axis=nom" role="tab" aria-selected={axis === "nom"} className={axis === "nom" ? "on" : undefined} data-rank-tab="nom">指名</Link>')
    && !rp.includes("本指名件数で見る") && !rp.includes("売上で見る"));
  check("c(3-2) 売上＝指名と同じ表の形（順位・名前・売上（按分））・行は自分の 1 行（mySales）だけ・ほかの人の行を回さない",
    rp.includes("<th style={thNum}>売上（按分）</th>") && rp.includes('data-rank-sales="1"') && rp.includes("{mySales && (\n              <tr")
    && rp.includes("（自分）</td>") && rp.includes("<td style={tdNum}>¥{mySales.sales.toLocaleString()}</td>") && !rp.includes("salesRank ?? []).map(") && (rp.match(/toLocaleString\(\)/g) ?? []).length === 1);
  check("c(3-3) 指名の表は不変（本指名・場内・同伴・金額列なし）・指名のときは売上の表を出さない（★M-168）",
    rp.includes('{axis === "nom" && (') && rp.includes("<th style={thNum}>本指名</th>") && rp.includes("<th style={thNum}>同伴</th>") && rp.includes('{axis === "sales" && (\n      <section className="nox-cardtop" style={t.card} data-rank-sales="1">'));
  const m171 = src("supabase/migrations/0171_plan_norm_targets_axes.sql");
  check("c(3-4) 前提＝get_cast_sales_rank は cast に自分の 1 行だけ（0171・RPC は変えていない）",
    m171.includes("   where v_role in ('owner','manager') or r.cast_id = v_self;   -- cast＝自分の 1 行だけ") && rp.includes('supabase.rpc("get_cast_sales_rank", { p_store_id: store.id, p_period: period })'));
}

// ── c(4) 確定給与明細（キャスト） ──
{
  check("c(4-1) 期の選択肢の文字＝「2026年10月（直近）」「2026年3月」・YYYY-MM でない期はそのまま",
    slipPeriodOptionLabelOf("2026-10", true) === "2026年10月（直近）" && slipPeriodOptionLabelOf("2026-03") === "2026年3月" && slipPeriodOptionLabelOf("2026-10 前半") === "2026-10 前半");
  check("c(4-2) ファイル名＝選んでいる期（slipPdfTitleOf は不変）", slipPdfTitleOf("ひなの", "2026-09", "CLUB ACE") === "給与明細_2026-09_CLUB ACE_ひなの");
  const pk = src("app/mine/payslip-picker.tsx"), mp = src("app/mine/page.tsx");
  check("c(4-3) 期の選択＝開いたときは直近（0 番＝期の新しい順の先頭）・選んでいない期は display:none（画面にも印刷にも出ない）・選択と印刷は nox-noprint の帯",
    pk.includes("const [sel, setSel] = useState(0);") && pk.includes('style={i === cur ? undefined : { display: "none" }}') && pk.includes('<div className="nox-noprint"')
    && pk.includes("{periods.length > 1 && (") && pk.includes("slipPeriodOptionLabelOf(p, i === 0)"));
  check("c(4-4) 「印刷 / PDFで保存」は選んでいる期だけ＝ファイル名も fileTitles[cur]・印刷ボタンは page から picker へ",
    pk.includes("<PrintPayslipButton fileTitle={fileTitles[cur] ?? null} />") && !mp.includes("<PrintPayslipButton") && !mp.includes('import PrintPayslipButton from "./print-payslip-button";'));
  check("c(4-5) page＝payslips を期の新しい順に直近 12 期（本人の行だけ＝RLS）・各期を picker に渡す（明細の描画は PayslipSlip のまま）",
    mp.includes('supabase.from("payslips").select("period, net, breakdown_json").order("period", { ascending: false }).limit(12)')
    && mp.includes("<MinePayslipPicker periods={(slips ?? []).map((s) => String(s.period))}") && mp.includes("fileTitles={(slips ?? []).map((s) => slipPdfTitleOf(meCast?.name ?? \"\", String(s.period), (myStore?.name as string | undefined) ?? null))}>")
    && mp.includes("</MinePayslipPicker>") && mp.includes("<PayslipSlip systems="));
  const m16 = src("supabase/migrations/0016_f2c_payroll_schema_finalize.sql"), m158 = src("supabase/migrations/0158_settle_attention_okuri.sql");
  check("c(4-6) 前提＝payslips は cast 本人の行が読める（payslips_select）・確定の取り消しで行が消える＝行は確定・支払済みの期だけ・1 店 1 期 1 run",
    m16.includes("and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())") && m16.includes("on public.payroll_runs (store_id, period);            -- 1店1期間1 run")
    && m158.includes("delete from public.payslips where run_id = p_run_id;"));
}

if (fails.length) {
  console.error(`verify:nox-c1118 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-c1118 OK (${pass} checks)`);
console.log("2026-11-18 夜（相談役 ⑥）の見せ方の直し: 在庫の発注基準の帯・印・絞り込み／売上ランキングの表とタブ／確定給与明細の期の選択と印刷");
