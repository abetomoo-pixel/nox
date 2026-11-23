/*
 * verify:nox-jst-today — 起票145（相談役 11/23 23:10 の ■1）: 日本の「今日」「今月」にそろえる。
 *  (A) 共通の部品 lib/nox/jst-today.ts：時刻を JST の 1 日 03:00・08:59・09:00・10:00 と月末 23:30（＋年の変わり目）に置き、今日・今月・14 日後が JST の暦で出る。
 *  (B) 27 か所：起票145 の一覧の所が部品を呼んでいること（書き方を所ごとに突き合わせる）＋その書き方を同じ時刻で評価して、全部が同じ日・同じ月を返す。
 *      直す前の形（new Date().toISOString().slice(0, 10)／slice(0, 7)／Date.now() + 14 日）は 03:00・08:59 で JST の昨日（前の月）になる＝赤。
 *  (C) 柵：app・components・lib で UTC の今日・今月を新しく作ると赤（書き方の正規表現・柵が見本を捕まえることも確かめる）。
 *  (D) サーバの源泉の率の今日（withholding-rates の todayYmd）＝JST の今日で行を選ぶ（JST の 1/1 01:00 は 2027-01-01 の行）。
 *  DB を使わない（純関数と文字の検査だけ）。使い方: npm run verify:nox-jst-today
 */
import fs from "node:fs";
import path from "node:path";
import { jstThisMonth, jstToday, jstTodayPlus } from "../lib/nox/jst-today";
import { withholdingRateOf } from "../lib/nox/payroll/withholding-rates";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── 時刻を差し替える（new Date() と Date.now() だけ・引数つきの new Date(x) はそのまま）
const RealDate = Date;
let fixedMs: number | null = null;
class FakeDate extends RealDate {
  constructor(...a: unknown[]) { if (a.length === 0 && fixedMs !== null) super(fixedMs); else super(...(a as [string])); }
  static now() { return fixedMs ?? RealDate.now(); }
}
const at = <T>(iso: string, fn: () => T): T => { fixedMs = RealDate.parse(iso); (globalThis as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor; try { return fn(); } finally { (globalThis as { Date: DateConstructor }).Date = RealDate; fixedMs = null; } };

// JST の時刻（ラベル）→ UTC の ISO と、期待する JST の今日
const TIMES: { label: string; iso: string; day: string; plus14: string }[] = [
  { label: "12/01 03:00 JST", iso: "2026-11-30T18:00:00Z", day: "2026-12-01", plus14: "2026-12-15" },
  { label: "12/01 08:59 JST", iso: "2026-11-30T23:59:00Z", day: "2026-12-01", plus14: "2026-12-15" },
  { label: "12/01 09:00 JST", iso: "2026-12-01T00:00:00Z", day: "2026-12-01", plus14: "2026-12-15" },
  { label: "12/01 10:00 JST", iso: "2026-12-01T01:00:00Z", day: "2026-12-01", plus14: "2026-12-15" },
  { label: "11/30 23:30 JST（月末）", iso: "2026-11-30T14:30:00Z", day: "2026-11-30", plus14: "2026-12-14" },
  { label: "2027/01/01 03:00 JST（年の変わり目）", iso: "2026-12-31T18:00:00Z", day: "2027-01-01", plus14: "2027-01-15" },
];

// ── (A) 部品
for (const t of TIMES) {
  check(`A 今日 ${t.label}`, at(t.iso, () => jstToday()) === t.day, at(t.iso, () => jstToday()));
  check(`A 今月 ${t.label}`, at(t.iso, () => jstThisMonth()) === t.day.slice(0, 7), at(t.iso, () => jstThisMonth()));
  check(`A 14 日後 ${t.label}`, at(t.iso, () => jstTodayPlus(14)) === t.plus14, at(t.iso, () => jstTodayPlus(14)));
  check(`A now を渡す ${t.label}`, jstToday(new RealDate(t.iso)) === t.day);
}

// ── (B) 27 か所（起票145 の一覧）＝[ファイル, 書き方（置き換えた後）, 何を返すか, 区分, 名前]
type Kind = "day" | "month" | "plus14";
const SITES: [string, string, Kind, "B" | "C", string][] = [
  ["app/(manage)/casts/casts-board.tsx", "const today = jstToday();", "day", "B", "キャストの詳細の今日（プランの切替・契約区分・本採用・本入店日・日付の下限）"],
  ["app/(manage)/casts/casts-board.tsx", "({ start: jstToday(), planId: null })", "day", "B", "体入の追加の開始日"],
  ["app/(manage)/casts/casts-board.tsx", "dateDefault={issueDateDefaultOf(jstToday())}\n", "day", "B", "前借りの発行日の既定（キャストの詳細）"],
  ["app/(manage)/casts/casts-board.tsx", "dateDefault={issueDateDefaultOf(jstToday())} />", "day", "B", "日払いの発行日の既定（キャストの詳細）"],
  ["app/(manage)/payroll/payroll-board.tsx", "dateDefault={issueDateDefaultOf(jstToday(), `${period}-01`, periodEndOf(period))}", "day", "B", "前借りの発行日の既定（給与）"],
  ["components/nox/settlement-modal.tsx", "const period = (biz ?? jstToday()).slice(0, 7);", "day", "B", "精算の給与期（今日の月）"],
  ["app/(manage)/payroll/payment-panel.tsx", "const paidAt = pdate[castId] || jstToday();", "day", "B", "給与の支払日の既定"],
  ["app/(manage)/payroll/payroll-board.tsx", "setLoanAgreed(loanAgreedMapOf(plans, agreedByPlan, jstToday()));", "day", "B", "前借りの同意の判定（給与）"],
  ["components/nox/advance-okuri-form.tsx", "p.advance_loan_agreed])), jstToday());", "day", "B", "前借りの同意の判定（前借りの入力）"],
  ["app/mine/wishes/wish-form.tsx", "const today = jstToday();", "day", "C", "シフト希望の今日"],
  ["app/(manage)/analytics/analytics-board.tsx", "const thisMonth = jstThisMonth();", "month", "C", "分析の今月"],
  ["app/(manage)/casts/casts-board.tsx", "const month = jstThisMonth();", "month", "C", "キャストの今月（出勤日数・ノルマの月）"],
  ["app/(manage)/casts/casts-board.tsx", ".gte(\"date\", jstToday())", "day", "C", "次のシフト"],
  ["app/(manage)/casts/casts-board.tsx", "const calToday = jstToday();", "day", "C", "キャストの今期の時給の今日"],
  ["app/(manage)/customers/customers-board.tsx", "const thisMonth = jstThisMonth();", "month", "C", "顧客の今月"],
  ["app/(manage)/customers/customers-board.tsx", "const today = jstToday();", "day", "C", "顧客の誕生日の今日"],
  ["app/(manage)/customers/customers-board.tsx", "const soon = jstTodayPlus(14);", "plus14", "C", "顧客の誕生日の 14 日後"],
  ["app/(manage)/customers/[id]/customer-detail.tsx", "useState(() => jstThisMonth() + \"-01\")", "month", "C", "顧客の売上の期間の既定（から）"],
  ["app/(manage)/customers/[id]/customer-detail.tsx", "useState(() => jstToday())", "day", "C", "顧客の売上の期間の既定（まで）"],
  ["app/(manage)/dashboard/dashboard-board.tsx", "const calToday = jstToday();", "day", "C", "ダッシュボードの今日"],
  ["app/(manage)/master/store-profile-panel.tsx", "{payTimeBasisApplyNoteOf(tb, jstToday()) && ", "day", "C", "店の設定の注記"],
  ["app/(manage)/payroll/payroll-board.tsx", "useState(initialPeriod ?? jstThisMonth())", "month", "C", "給与の最初に開く月（給与）"],
  ["app/(manage)/payroll/payroll-list.tsx", "useState(jstThisMonth())", "month", "C", "給与の最初に開く月（一覧）"],
  ["app/(manage)/payroll/payroll-list.tsx", "const currentYm = jstThisMonth();", "month", "C", "給与の一覧の今月"],
  ["app/(manage)/report/report-board.tsx", "const ym = jstThisMonth();", "month", "C", "日報の今月の回収"],
  ["app/(manage)/report/report-board.tsx", "const today = jstToday();", "day", "C", "日報の売掛の期限超過"],
  ["components/ui/date-picker.tsx", "(todayYmd ?? jstToday())", "day", "C", "日付の選び方の最初の月"],
];
check("B 所の数＝27", SITES.length === 27, SITES.length);
check("B 区分 B の所＝9", SITES.filter((s) => s[3] === "B").length === 9);
const EXPR: Record<Kind, string> = { day: "jstToday()", month: "jstThisMonth()", plus14: "jstTodayPlus(14)" };
const OLD: Record<Kind, string> = { day: "new Date().toISOString().slice(0, 10)", month: "new Date().toISOString().slice(0, 7)", plus14: "new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)" };
const evalExpr = (e: string): string => (new Function("jstToday", "jstThisMonth", "jstTodayPlus", `return ${e};`))(jstToday, jstThisMonth, jstTodayPlus) as string;
const want = (k: Kind, t: (typeof TIMES)[number]) => (k === "day" ? t.day : k === "month" ? t.day.slice(0, 7) : t.plus14);
const norm = (s: string) => s.replace(/\r\n/g, "\n");
for (const [f, anchor, kind, cls, name] of SITES) {
  const body = norm(src(f));
  check(`B ${name}：書き方がある（${f}）`, body.includes(anchor), anchor);
  check(`B ${name}：部品を import している`, /from "@\/lib\/nox\/jst-today"/.test(body));
  check(`B ${name}：書き方に部品の呼び出しがある`, anchor.includes(EXPR[kind]), anchor);
  const sameAll = TIMES.every((t) => at(t.iso, () => evalExpr(EXPR[kind])) === want(kind, t));
  check(`B ${name}（${cls}）：5 つの時刻＋年の変わり目で同じ日・同じ月`, sameAll);
  const oldBad = TIMES.filter((t) => at(t.iso, () => evalExpr(OLD[kind])) !== want(kind, t)).map((t) => t.label);
  check(`B ${name}：直す前の形は 03:00・08:59・年の変わり目で赤`, oldBad.join("|") === ["12/01 03:00 JST", "12/01 08:59 JST", "2027/01/01 03:00 JST（年の変わり目）"].join("|"), oldBad);
}

// ── (C) 柵：UTC の今日・今月の書き方
const GUARD: RegExp[] = [
  /new Date\(\)\.toISOString\(\)\.(slice|substring|substr)\(0,\s*(7|10)\)/,
  /new Date\(\)\.toISOString\(\)\.split\(["']T["']\)/,
  /new Date\(\)\.toJSON\(\)\.(slice|substring|substr)\(0,\s*(7|10)\)/,
  /new Date\(Date\.now\(\)(?!\s*\+\s*9\s*\*)[^()]*\)\.toISOString\(\)\.(slice|substring|substr)\(0,\s*(7|10)\)/,
];
const SAMPLES_BAD = ["const d = new Date().toISOString().slice(0, 10);", "new Date().toISOString().slice(0,7)", "new Date().toISOString().split(\"T\")[0]", "new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)", "new Date(Date.now()).toISOString().slice(0, 10)"];
const SAMPLES_OK = ["new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)", "new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10)", "new Date(`${ymd}T00:00:00Z`).toISOString().slice(0, 10)", "new Date().toISOString()", "jstToday()"];
for (const s of SAMPLES_BAD) check(`C 柵が見本を捕まえる：${s}`, GUARD.some((g) => g.test(s)));
for (const s of SAMPLES_OK) check(`C 柵が正しい書き方を通す：${s}`, !GUARD.some((g) => g.test(s)));
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(path.join(d, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
const hits: string[] = [];
for (const f of ["app", "components", "lib"].flatMap(walk)) {
  src(f).split(/\r?\n/).forEach((l, i) => { if (!/^\s*(\/\/|\*|\/\*)/.test(l) &&GUARD.some((g) => g.test(l))) hits.push(`${f.replace(/\\/g, "/")}:${i + 1}`); });
}
check("C app・components・lib に UTC の今日・今月の書き方が 0（JST の今日は lib/nox/jst-today の jstToday・jstThisMonth・jstTodayPlus）", hits.length === 0, hits);

// ── (D) サーバの源泉の率の今日
check("D withholding-rates が部品を使う", /todayYmd = \(\): string => jstToday\(\)/.test(src("lib/nox/payroll/withholding-rates.ts")));
check("D JST の 2027/01/01 01:00（UTC は 12/31）＝2027-01-01 の行", at("2026-12-31T16:00:00Z", () => withholdingRateOf("other_204")?.validFrom) === "2027-01-01", at("2026-12-31T16:00:00Z", () => withholdingRateOf("other_204")?.validFrom));
check("D JST の 2026/12/31 23:30＝前の行", at("2026-12-31T14:30:00Z", () => withholdingRateOf("other_204")?.validFrom) !== "2027-01-01");
check("D 支払日を渡したときはそれで選ぶ（今日を見ない）", at("2026-12-31T16:00:00Z", () => withholdingRateOf("other_204", "2026-12-31")?.validFrom) !== "2027-01-01");
check("D 2027-01-01 の行も率の合計は同じ 1021（額は変わらない）", withholdingRateOf("other_204", "2027-01-01")?.rateBp === 1021 && withholdingRateOf("other_204", "2026-12-31")?.rateBp === 1021);

if (fails.length) { console.error(`verify:nox-jst-today NG (${fails.length} fails / ${pass} pass)`); for (const f of fails) console.error("  ✗ " + f); process.exit(1); }
console.log(`verify:nox-jst-today OK (${pass} checks)`);
