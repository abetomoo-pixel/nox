// @ts-nocheck — scratch（pg の型定義なし・docs/tmp 未追跡・tsc の対象から外す）
// B6 ② 表示値の再現（読取のみ・pg 直結 postgres・DEMO CLUB NOX・2026-09／2026-07）
//   analytics-board の KPI 5 枚（当月値・前月同期・差分行）を同じ SELECT と同じ純関数で再現し、テキストで出す。
import fs from "fs";
import { Client } from "C:/Users/abet/Dropbox/cloude/nox/node_modules/pg";
import { finalRunOf, laborCostOf, laborRatePct, type LaborRun, type LaborSlip } from "C:/Users/abet/Dropbox/cloude/nox/lib/nox/payroll/labor-cost";
import { diffOf, prevMonthOf, prevYearMonthOf, type Diff, type DiffKind } from "C:/Users/abet/Dropbox/cloude/nox/lib/nox/analytics/compare";

for (const l of fs.readFileSync("C:/Users/abet/Dropbox/cloude/nox/.env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const lastDayOf = (p: string) => { const [y, m] = p.split("-").map(Number); return `${p}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };
const prevPeriodOf = (p: string) => { const [y, m] = p.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
type DR = { biz_date: string; cash: number; card_gross: number; uri: number; other: number; slips: number | null };
const salesOf = (r: DR) => r.cash + r.card_gross + r.uri + r.other;
const yen = (n: number) => "¥" + n.toLocaleString();
const per = (s: number, n: number) => (n > 0 ? Math.round(s / n) : 0);
const cmp = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
type KpiSnap = { sales: number | null; slips: number | null; per: number | null; laborRate: number | null; targetPct: number | null };
const fmtDiff = (d: Diff, kind: DiffKind): string => {
  if (d.abs === null) return "—";
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const a = Math.abs(d.abs);
  if (kind === "rate") return `${sign(d.abs)}${a.toFixed(1)}pt`;
  const body = kind === "amount" ? `${sign(d.abs)}${a.toLocaleString()}` : `${sign(d.abs)}${a}組`;
  const p = d.pct === null ? "—" : `${sign(d.pct)}${Math.abs(d.pct)}%`;
  return `${body}（${p}）`;
};

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(JSON.stringify((await c.query(`select 'nox-project-proof' as k, count(*)::int as n from public.orgs`)).rows[0]));
  const S = (await c.query(`select id from public.stores where name = 'CLUB NOX'`)).rows[0].id as string;
  const daily = async (p: string) => (await c.query(`select biz_date::text, cash, card_gross, uri, other, slips from public.daily_reports where store_id=$1 and biz_date between $2 and $3 order by biz_date`, [S, `${p}-01`, lastDayOf(p)])).rows as DR[];
  const laborOf = async (p: string, sales: number | null) => {
    const runs = (await c.query(`select id, status from public.payroll_runs where store_id=$1 and period=$2`, [S, p])).rows as LaborRun[];
    const fin = finalRunOf(runs);
    const slips = fin ? (await c.query(`select cast_id, breakdown_json from public.payslips where run_id=$1`, [fin.id])).rows as LaborSlip[] : [];
    const lc = laborCostOf(runs, slips);
    return { lc, rate: sales === null ? null : laborRatePct(lc.state, lc.gross, sales) };
  };
  const targetOf = async (p: string) => { const r = (await c.query(`select sales_target from public.store_sales_targets where store_id=$1 and period=$2`, [S, p])).rows[0]; return r ? Number(r.sales_target) : null; };
  const snapOf = async (p: string): Promise<KpiSnap> => {
    const rows = await daily(p);
    const sales = rows.length ? rows.reduce((a, r) => a + salesOf(r), 0) : null;
    const slips = rows.length ? rows.reduce((a, r) => a + (r.slips ?? 0), 0) : null;
    const perV = sales !== null && slips !== null ? per(sales, slips) : null;
    const { rate } = await laborOf(p, sales);
    const target = await targetOf(p);
    const targetPct = target !== null && target > 0 && sales !== null ? Math.round((sales / target) * 1000) / 10 : null;
    return { sales, slips, per: perV, laborRate: rate, targetPct };
  };
  for (const P of ["2026-09", "2026-07"]) {
    const cur = await daily(P), prev = await daily(prevPeriodOf(P));
    const curSales = cur.reduce((a, r) => a + salesOf(r), 0), curSlips = cur.reduce((a, r) => a + (r.slips ?? 0), 0);
    const prevSame = prev.slice(0, cur.length);
    const prevSales = prevSame.reduce((a, r) => a + salesOf(r), 0), prevSlips = prevSame.reduce((a, r) => a + (r.slips ?? 0), 0);
    const { lc, rate: laborRate } = await laborOf(P, curSales);
    const target = await targetOf(P);
    const targetPct = target && target > 0 ? Math.round((curSales / target) * 1000) / 10 : null;
    const curSnap: KpiSnap = { sales: cur.length ? curSales : null, slips: cur.length ? curSlips : null, per: cur.length ? per(curSales, curSlips) : null, laborRate, targetPct };
    const pm = await snapOf(prevMonthOf(P)), py = await snapOf(prevYearMonthOf(P));
    const row = (k: keyof KpiSnap, kind: DiffKind) => `前月比（月全体） ${fmtDiff(diffOf(curSnap[k], pm[k], kind), kind)}　前年同月比 ${fmtDiff(diffOf(curSnap[k], py[k], kind), kind)}`;
    const c1 = cmp(curSales, prevSales);
    console.log(`\n[${P}] daily=${cur.length} 行・前月(${prevPeriodOf(P)})=${prev.length} 行・比較月 前月=${prevMonthOf(P)} 前年同月=${prevYearMonthOf(P)}  snap前月=${JSON.stringify(pm)} snap前年=${JSON.stringify(py)}`);
    console.log(`  売上（締め済み） val=${yen(curSales)} sub=前月同期 ${yen(prevSales)}${c1 !== null ? `（${c1 >= 0 ? "+" : ""}${c1}%）` : ""}`); console.log(`    差分行: ${row("sales", "amount")}`);
    console.log(`  組数 val=${curSlips}組 sub=前月同期 ${prevSlips}組`); console.log(`    差分行: ${row("slips", "count")}`);
    console.log(`  組単価 val=${yen(per(curSales, curSlips))} sub=前月同期 ${yen(per(prevSales, prevSlips))}`); console.log(`    差分行: ${row("per", "amount")}`);
    console.log(`  人件費率（概算） val=${laborRate == null ? "—" : laborRate + "%"} sub=${lc.state === "final" ? `給与確定 ${yen(lc.gross)} ÷ 売上` : lc.state === "draft" ? "給与が未確定" : "給与データなし"}`); console.log(`    差分行: ${row("laborRate", "rate")}`);
    console.log(`  月間目標 val=${target === null ? "未設定" : targetPct + "%"} sub=${target === null ? "目標を設定すると進捗を表示" : `目標 ${yen(target)}`}`); console.log(`    差分行: ${row("targetPct", "rate")}`);
  }
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
