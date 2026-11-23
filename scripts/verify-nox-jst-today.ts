/*
 * verify:nox-jst-today — 起票145（相談役 11/23 23:10 の ■1・11/24 2:20 の訂正）: 画面とサーバの「今日」。
 *  勤務と給与期に関わる「今日」は営業日（店の締めの時刻で切り替わる日＝bizDateOf・DB の biz_date_of と同じ式）。それ以外は暦の JST の今日。
 *  (A) 部品 lib/nox/jst-today.ts：暦（jstToday・jstThisMonth・jstTodayPlus）と営業日（bizToday・cutoffHmOf）。
 *      締めの時刻 06:00 の店と 05:00 の店で、JST の 00:30・締めの 1 分前・締めの時刻・09:00・10:00・月末の 23:30・月の 1 日の 02:00・年の変わり目の 02:00 に置き、
 *      営業日の部品は営業日を、暦の部品は暦を返す。
 *  (B) 27 か所：所ごとに書き方を突き合わせ（営業日の所は bizToday・暦の所は jstToday 等）、その書き方を同じ時刻で評価して営業日／暦を返す。
 *      直す前の形（UTC の今日）と、前の便の形（営業日の所に暦の JST）は赤。
 *  (C) 柵：app・components・lib で UTC の今日・今月を新しく作ると赤。
 *  (D) サーバの源泉の率の今日＝暦の JST（支払日を渡せばそれ）。
 *  (E) 場面：a. 月末の夜の 01:30 に日払いを出す→発行日の既定は前の日（営業日）→その月の給与期。
 *            b. 月の 1 日の 01:30 に体入を追加→開始日は営業日→その夜の勤務の期にプランがある（プランなしで止まらない）。
 *  DB を使わない（純関数と文字の検査だけ）。使い方: npm run verify:nox-jst-today
 */
import fs from "node:fs";
import path from "node:path";
import { bizToday, cutoffHmOf, jstThisMonth, jstToday, jstTodayPlus } from "../lib/nox/jst-today";
import { bizDateOf } from "../lib/nox/biz-date";
import { issueDateDefaultOf } from "../lib/nox/payroll/advance-okuri";
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

// JST の時刻（ラベル）→ UTC の ISO・暦の今日・締め 06:00 と 05:00 の店の営業日
type T = { label: string; iso: string; cal: string; biz6: string; biz5: string };
const J = (ymdHm: string) => new RealDate(`${ymdHm}:00+09:00`).toISOString();
const TIMES: T[] = [
  { label: "11/24 00:30", iso: J("2026-11-24T00:30"), cal: "2026-11-24", biz6: "2026-11-23", biz5: "2026-11-23" },
  { label: "11/24 04:59（05:00 の店の締めの 1 分前）", iso: J("2026-11-24T04:59"), cal: "2026-11-24", biz6: "2026-11-23", biz5: "2026-11-23" },
  { label: "11/24 05:00（05:00 の店の締め）", iso: J("2026-11-24T05:00"), cal: "2026-11-24", biz6: "2026-11-23", biz5: "2026-11-24" },
  { label: "11/24 05:59（06:00 の店の締めの 1 分前）", iso: J("2026-11-24T05:59"), cal: "2026-11-24", biz6: "2026-11-23", biz5: "2026-11-24" },
  { label: "11/24 06:00（06:00 の店の締め）", iso: J("2026-11-24T06:00"), cal: "2026-11-24", biz6: "2026-11-24", biz5: "2026-11-24" },
  { label: "11/24 09:00", iso: J("2026-11-24T09:00"), cal: "2026-11-24", biz6: "2026-11-24", biz5: "2026-11-24" },
  { label: "11/24 10:00", iso: J("2026-11-24T10:00"), cal: "2026-11-24", biz6: "2026-11-24", biz5: "2026-11-24" },
  { label: "11/30 23:30（月末）", iso: J("2026-11-30T23:30"), cal: "2026-11-30", biz6: "2026-11-30", biz5: "2026-11-30" },
  { label: "12/01 02:00（月の 1 日）", iso: J("2026-12-01T02:00"), cal: "2026-12-01", biz6: "2026-11-30", biz5: "2026-11-30" },
  { label: "2027/01/01 02:00（年の変わり目）", iso: J("2027-01-01T02:00"), cal: "2027-01-01", biz6: "2026-12-31", biz5: "2026-12-31" },
];
const CUTS = [["06:00", "biz6"], ["05:00", "biz5"]] as const;
const plusDays = (ymd: string, n: number) => new RealDate(RealDate.parse(`${ymd}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

// ── (A) 部品
for (const t of TIMES) {
  check(`A 暦の今日 ${t.label}`, at(t.iso, () => jstToday()) === t.cal, at(t.iso, () => jstToday()));
  check(`A 暦の今月 ${t.label}`, at(t.iso, () => jstThisMonth()) === t.cal.slice(0, 7));
  check(`A 暦の 14 日後 ${t.label}`, at(t.iso, () => jstTodayPlus(14)) === plusDays(t.cal, 14));
  for (const [cut, k] of CUTS) {
    check(`A 営業日の今日（締め ${cut}）${t.label}`, at(t.iso, () => bizToday(cut)) === t[k], at(t.iso, () => bizToday(cut)));
    check(`A 営業日の今日＝bizDateOf と同じ（締め ${cut}）${t.label}`, bizToday(cut, new RealDate(t.iso)) === bizDateOf(t.iso, cut));
  }
}
check("A 締めの時刻の読み方（05:00 はそのまま・無し・空・null は 06:00）", cutoffHmOf({ biz_cutoff_hm: "05:00" }) === "05:00" && cutoffHmOf({}) === "06:00" && cutoffHmOf({ biz_cutoff_hm: "" }) === "06:00" && cutoffHmOf(null) === "06:00");

// ── (B) 27 か所（起票145 の一覧）＝[ファイル, 書き方（置き換えた後）, 何を返すか, 区分, 名前]
//   biz＝営業日（相談役 11/24 2:20 の判断 3 の「営業日の今日」）・day／month／plus14＝暦の JST
type Kind = "biz" | "day" | "month" | "plus14";
const SITES: [string, string, Kind, "B" | "C", string][] = [
  ["app/(manage)/casts/casts-board.tsx", "const today = bizToday(bizCutoff);", "biz", "B", "キャストの詳細の今日（プランの切替・契約区分・本採用・本入店日・保証・日付の下限・今の行）"],
  ["app/(manage)/casts/casts-board.tsx", "({ start: bizToday(bizCutoff), planId: null })", "biz", "B", "体入の追加の開始日"],
  ["app/(manage)/casts/casts-board.tsx", "dateDefault={issueDateDefaultOf(today)}\n", "biz", "B", "前借りの発行日の既定（キャストの詳細）"],
  ["app/(manage)/casts/casts-board.tsx", "dateDefault={issueDateDefaultOf(today)} />", "biz", "B", "日払いの発行日の既定（キャストの詳細）"],
  ["app/(manage)/payroll/payroll-board.tsx", "dateDefault={issueDateDefaultOf(bizToday(cutoffHm), `${period}-01`, periodEndOf(period))}", "biz", "B", "前借りの発行日の既定（給与）"],
  ["components/nox/settlement-modal.tsx", "const period = (biz ?? bizToday(cutoffHmOf(data?.settings_json))).slice(0, 7);", "biz", "B", "精算の給与期（営業日の今日の月）"],
  ["app/(manage)/payroll/payment-panel.tsx", "const paidAt = pdate[castId] || jstToday();", "day", "B", "給与の支払日の既定（支払いの記録の日付＝暦）"],
  ["app/(manage)/payroll/payroll-board.tsx", "setLoanAgreed(loanAgreedMapOf(plans, agreedByPlan, bizToday(cutoffHmOf(", "biz", "B", "前借りの同意の判定（給与）"],
  ["components/nox/advance-okuri-form.tsx", "p.advance_loan_agreed])), bizToday(cutoffHmOf(", "biz", "B", "前借りの同意の判定（前借りの入力）"],
  ["app/mine/wishes/wish-form.tsx", "const today = jstToday();", "day", "C", "シフト希望の今日（迷う所＝替えていない）"],
  ["app/(manage)/analytics/analytics-board.tsx", "const thisMonth = jstThisMonth();", "month", "C", "分析の今月"],
  ["app/(manage)/casts/casts-board.tsx", "const month = jstThisMonth();", "month", "C", "キャストの今月（出勤日数・ノルマの月）"],
  ["app/(manage)/casts/casts-board.tsx", ".gte(\"date\", jstToday())", "day", "C", "次のシフト（迷う所＝替えていない）"],
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
check("B 営業日の所＝8（判断 3 の営業日の今日）", SITES.filter((x) => x[2] === "biz").length === 8);
const EXPR: Record<Kind, string> = { biz: "bizToday(cut)", day: "jstToday()", month: "jstThisMonth()", plus14: "jstTodayPlus(14)" };
const CALL: Record<Kind, string> = { biz: "bizToday(", day: "jstToday()", month: "jstThisMonth()", plus14: "jstTodayPlus(14)" };
const UTC_OLD: Record<Kind, string> = { biz: "new Date().toISOString().slice(0, 10)", day: "new Date().toISOString().slice(0, 10)", month: "new Date().toISOString().slice(0, 7)", plus14: "new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)" };
const evalExpr = (e: string, cut: string): string => (new Function("jstToday", "jstThisMonth", "jstTodayPlus", "bizToday", "cut", `return ${e};`))(jstToday, jstThisMonth, jstTodayPlus, bizToday, cut) as string;
const want = (k: Kind, t: T, kk: "biz6" | "biz5") => (k === "biz" ? t[kk] : k === "day" ? t.cal : k === "month" ? t.cal.slice(0, 7) : plusDays(t.cal, 14));
const norm = (x: string) => x.replace(/\r\n/g, "\n");
for (const [f, anchor, kind, cls, name] of SITES) {
  const body = norm(src(f));
  check(`B ${name}：書き方がある（${f}）`, body.includes(anchor), anchor);
  check(`B ${name}：部品を import している`, /from "@\/lib\/nox\/jst-today"/.test(body));
  // 発行日の 2 か所（キャストの詳細）は today＝上の営業日の今日を渡す
  if (!anchor.startsWith("dateDefault={issueDateDefaultOf(today)")) check(`B ${name}：書き方に部品の呼び出しがある`, anchor.includes(CALL[kind]), anchor);
  for (const [cut, kk] of CUTS) {
    const sameAll = TIMES.every((t) => at(t.iso, () => evalExpr(EXPR[kind], cut)) === want(kind, t, kk));
    check(`B ${name}（${cls}・${kind === "biz" ? "営業日" : "暦"}・締め ${cut}）：10 の時刻で営業日／暦を返す`, sameAll);
    const oldBad = TIMES.filter((t) => at(t.iso, () => evalExpr(UTC_OLD[kind], cut)) !== want(kind, t, kk)).length;
    check(`B ${name}（締め ${cut}）：直す前の形（UTC の今日）は赤`, oldBad > 0, oldBad);
    if (kind === "biz") {
      const calBad = TIMES.filter((t) => at(t.iso, () => jstToday()) !== t[kk]).map((t) => t.label);
      check(`B ${name}（締め ${cut}）：前の便の形（暦の JST）は 0:00〜締めの時刻で赤・09:00 以降は同じ`, calBad.length >= 4 && calBad.every((l) => !/09:00|10:00|23:30/.test(l)), calBad);
    }
  }
}
const cb = norm(src("app/(manage)/casts/casts-board.tsx"));
check("B キャストの詳細の締めの時刻＝自店の stores.settings_json（cutoffHmOf）", cb.includes("const bizCutoff = cutoffHmOf(stores.find((st) => st.id === (myStoreId || stores[0]?.id))?.settings_json);"));
check("B 体入の追加は開くときも営業日の今日を入れる", cb.includes("if (!showAdd) setTrialAdd((x) => ({ ...x, start: bizToday(bizCutoff) }));"));
check("B 契約区分を変える画面に税の設定の 1 行（相談役 11/24 2:20 の判断 7）", cb.includes("税の設定（源泉の区分）も見直してください。"));

// ── (C) 柵：UTC の今日・今月の書き方
const GUARD: RegExp[] = [
  /new Date\(\)\.toISOString\(\)\.(slice|substring|substr)\(0,\s*(7|10)\)/,
  /new Date\(\)\.toISOString\(\)\.split\(["']T["']\)/,
  /new Date\(\)\.toJSON\(\)\.(slice|substring|substr)\(0,\s*(7|10)\)/,
  /new Date\(Date\.now\(\)(?!\s*\+\s*9\s*\*)[^()]*\)\.toISOString\(\)\.(slice|substring|substr)\(0,\s*(7|10)\)/,
];
const SAMPLES_BAD = ["const d = new Date().toISOString().slice(0, 10);", "new Date().toISOString().slice(0,7)", "new Date().toISOString().split(\"T\")[0]", "new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)", "new Date(Date.now()).toISOString().slice(0, 10)"];
const SAMPLES_OK = ["new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)", "new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10)", "new Date(`${ymd}T00:00:00Z`).toISOString().slice(0, 10)", "new Date().toISOString()", "jstToday()", "bizToday(cutoffHm)"];
for (const x of SAMPLES_BAD) check(`C 柵が見本を捕まえる：${x}`, GUARD.some((g) => g.test(x)));
for (const x of SAMPLES_OK) check(`C 柵が正しい書き方を通す：${x}`, !GUARD.some((g) => g.test(x)));
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(path.join(d, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
const hits: string[] = [];
for (const f of ["app", "components", "lib"].flatMap(walk)) {
  src(f).split(/\r?\n/).forEach((l, i) => { if (!/^\s*(\/\/|\*|\/\*)/.test(l) && GUARD.some((g) => g.test(l))) hits.push(`${f.replace(/\\/g, "/")}:${i + 1}`); });
}
check("C app・components・lib に UTC の今日・今月の書き方が 0（暦は jstToday 等・営業日は bizToday）", hits.length === 0, hits);

// ── (D) サーバの源泉の率の今日（暦の JST のまま＝相談役 11/24 2:20 の判断 3）
check("D withholding-rates が部品を使う", /todayYmd = \(\): string => jstToday\(\)/.test(src("lib/nox/payroll/withholding-rates.ts")));
check("D JST の 2027/01/01 01:00（UTC は 12/31）＝2027-01-01 の行", at("2026-12-31T16:00:00Z", () => withholdingRateOf("other_204")?.validFrom) === "2027-01-01", at("2026-12-31T16:00:00Z", () => withholdingRateOf("other_204")?.validFrom));
check("D JST の 2026/12/31 23:30＝前の行", at("2026-12-31T14:30:00Z", () => withholdingRateOf("other_204")?.validFrom) !== "2027-01-01");
check("D 支払日を渡したときはそれで選ぶ（今日を見ない）", at("2026-12-31T16:00:00Z", () => withholdingRateOf("other_204", "2026-12-31")?.validFrom) !== "2027-01-01");
check("D 2027-01-01 の行も率の合計は同じ 1021（額は変わらない）", withholdingRateOf("other_204", "2027-01-01")?.rateBp === 1021 && withholdingRateOf("other_204", "2026-12-31")?.rateBp === 1021);

// ── (E) 場面（締め 06:00 の店・月の給与期の店）
{
  // a. 月末の夜（11/30 の営業）の 12/01 01:30 に日払いを出す
  const t = J("2026-12-01T01:30");
  const dflt = at(t, () => issueDateDefaultOf(bizToday("06:00")));
  check("E a. 12/01 01:30 の日払いの発行日の既定＝11/30（営業日）", dflt === "2026-11-30", dflt);
  check("E a. その発行日は 11 月の給与期（月の給与期の店＝発行日の月）", dflt.slice(0, 7) === "2026-11");
  const calDflt = at(t, () => issueDateDefaultOf(jstToday()));
  check("E a. 前の便の形（暦の JST）だと 12/01＝12 月の給与期に入る（赤）", calDflt === "2026-12-01", calDflt);
  // b. 12/01 01:30 に体入を追加する（その夜の勤務は 11/30 22:00 から＝営業日 11/30）
  const start = at(t, () => bizToday("06:00"));
  const workBiz = bizDateOf(J("2026-11-30T22:00"), "06:00");
  const periodEnd = "2026-11-30";
  // collect の選び方（期首に有効な行・無ければ期の中で最も早い行）＝期末より後に始まる行しか無い人はその期にプランが無い（no_plan）
  const hasPlan = (validFrom: string) => validFrom <= periodEnd;
  check("E b. 体入の開始日＝11/30（営業日）", start === "2026-11-30", start);
  check("E b. その夜の勤務（営業日 11/30・11 月の期）にプランがある＝プランなしで止まらない", workBiz.slice(0, 7) === "2026-11" && hasPlan(start), { workBiz, start });
  check("E b. 前の便の形（暦の JST＝12/01）だと 11 月の期にプランが無い（赤）", !hasPlan(at(t, () => jstToday())));
}

if (fails.length) { console.error(`verify:nox-jst-today NG (${fails.length} fails / ${pass} pass)`); for (const f of fails) console.error("  ✗ " + f); process.exit(1); }
console.log(`verify:nox-jst-today OK (${pass} checks)`);
