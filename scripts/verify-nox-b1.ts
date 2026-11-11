/**
 * verify:nox-b1 — 便 1（2026-11-11 夜・相談役の「高」6 件＋0201b の前提＋M-176／M-179）。DB は読取だけ（payload と live の件数）。
 *  (1) M-161 明細のスライド＝時給の内数＝金額の行にしない（amount 0・info・「（内数）」）・説明の 1 行・半月は期間ごとの上乗せ（月全体を 2 回出さない）
 *      ＋デモの商品バックの二重書き＝payload の product_rule の行は calculated_back_amount／product_sales_base が null（本番の check_close と同じ）
 *  (2) 裁定482 支払調書＝源泉は月末＋日次精算（dailyWithheld）・年 50 万円超の印（50 万ちょうどは対象外）・年分の 1 行・提出対象だけの出力
 *  (3) /report のページ自体でキャストの入場を判定（教訓142・裁定481）
 *  (4) M-154 の残り＝PIN の枠の幅を部品の側（.nox-pinpad-frame）＝出退勤とスタッフでログインが同じ枠
 *  (5) M-162 取り下げの後にフォーム（カレンダー・日付の詳細）が読み直す・「もう一度提出できます」
 *  (6) M-169 見られない画面はレジでなくホームへ・理由の 1 行・「分析へ」は店長以上だけ
 *  (7) 0201b の前提＝tax_inclusive_display を送らない・表示は price_display・売掛のスイッチは set_store_receivable_policy（0201b の前は ar_enabled も）・日報の売掛タブは ar_enabled
 *  (8) M-176 フッターのリンク＝本文の色＋下線・訪問済みも同じ ／ M-179 桁数は 1 か所の定数・「4桁」の文字列が client に残っていない
 */
import fs from "node:fs";
import path from "node:path";
import { slideLinesOf } from "../lib/nox/payroll/breakdown-lines";
import { TAX_REPORT_THRESHOLD_YEN, isTaxReportTarget, taxSumOf } from "../lib/nox/payroll/tax-report";
import { receivableBadKeyIsOk, receivablePolicyOfSwitch, receivableSwitchCallsOf } from "../lib/nox/store/receivable-switch";
import { opsPatchOf, opsProfileOf } from "../lib/nox/store/ops-profile";
import { deniedNoteOf, deniedHrefOf } from "../lib/nox/nav/denied";
import { PIN_DIGITS_LABEL, PIN_SHAPE_RE } from "../components/nox/pin-pad";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
{
  const days = [...Array.from({ length: 15 }, (_, i) => ({ d: i + 1, hours: 4, hourly: 3300, basis: "売上" })), ...Array.from({ length: 15 }, (_, i) => ({ d: i + 16, hours: 4, hourly: 3300, basis: "売上" }))];
  const p = { slideBasis: { apply: "half", months: [{ month: "2026-10-H1", prevMonth: "", sales: 636644, pts: 0, salesWage: 3300, ptsWage: 0 }, { month: "2026-10-H2", prevMonth: "", sales: 554780, pts: 0, salesWage: 3300, ptsWage: 0 }] },
    eplan: { base: 3000, salesSlide: [{ at: 400000, wage: 3300 }, { at: 700000, wage: 3600 }] }, wdays: days, wHours: 120 } as unknown as Parameters<typeof slideLinesOf>[0];
  const ls = slideLinesOf(p, { frozen: true });
  check("b1(1-1) M-161 スライドの行は金額の行にしない（amount 0・info・「（内数）」）", ls.length === 2 && ls.every((l) => l.amount === 0 && l.info === true && l.amountText === "（内数）"), ls);
  check("b1(1-2) M-161 半月＝前半・後半それぞれの上乗せ（300×4h×15 日＝18,000 ずつ）・月全体の額（36,000）を出さない・説明の 1 行",
    ls[0].label2?.includes("この期間の上乗せ ¥18,000") === true && ls[1].label2?.includes("この期間の上乗せ ¥18,000") === true && !ls.some((l) => l.label2?.includes("¥36,000")) && ls.every((l) => l.label2?.includes("スライド適用後の時給で計算しています")), ls.map((l) => l.label2));
  let bad = 0, tot = 0;
  for (const f of fs.readdirSync("docs/demo/payload").filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
    const pl = JSON.parse(src(path.join("docs/demo/payload", f))) as { tables: Record<string, Record<string, unknown>[]> };
    for (const r of pl.tables.check_cast_backs ?? []) { tot++; if (r.source_mode === "product_rule" && (r.calculated_back_amount != null || r.product_sales_base != null)) bad++; }
  }
  check("b1(1-3) M-161・教訓143 デモの payload＝product_rule の行は calculated_back_amount／product_sales_base が null（本番の check_close と同じ＝総支給の二重を作らない）", tot > 1000 && bad === 0, { tot, bad });
  check("b1(1-4) gen-demo の生成の式＝product_rule に計算済みのバックを書かない", src("scripts/demo/gen-demo.mjs").includes('source_mode: "product_rule", product_sales_base: null, calculated_back_amount: null'));
}
// (2)
{
  const s = taxSumOf([{ gross: 300000, withholding: 20000, dailyWithheld: 51040 }, { gross: 200000, withholding: 10000 }]);
  check("b1(2-1) 裁定482 支払調書の源泉＝月末＋日次精算（dailyWithheld・キーが無い行は 0）・支払金額は全額", s.gross === 500000 && s.withholding === 81040 && s.dailyWithheld === 51040, s);
  check("b1(2-2) 提出対象＝年 50 万円超（50 万ちょうどは対象外・50 万 1 円は対象）", TAX_REPORT_THRESHOLD_YEN === 500000 && !isTaxReportTarget(500000) && isTaxReportTarget(500001));
  const rt = src("app/api/payroll/tax-report-csv/route.ts"), ip = src("app/(manage)/payroll/invoice-panel.tsx");
  check("b1(2-3) CSV＝taxSumOf で合算・提出対象の列・提出対象だけの出力・年分の 1 行（画面と CSV）",
    rt.includes("const sum = taxSumOf(paysByCast.get(tgt.cast_id) ?? []);") && rt.includes('"提出対象（年50万円超）"') && rt.includes("if (onlyTargets && !isTaxReportTarget(sum.gross)) continue;") && rt.includes("${TAX_REPORT_NOTE_BASIS}") && ip.includes("{TAX_REPORT_NOTE_BASIS}") && ip.includes("downloadCsv(true)"));
}
// (3)
check("b1(3-1) 教訓142・裁定481 /report のページ自体でキャストの入場（castRegisterEntryOf＝店 ON・本人の許可・端末・出勤中）", src("app/(manage)/report/page.tsx").includes('if (role === "cast") { const e = await castRegisterEntryOf(supabase); if (!e.allowed) redirect('));
// (4)
{
  const css = src("app/globals.css");
  check("b1(4-1) M-154 の残り＝枠の幅は部品の側（.nox-pinpad-frame＝width 100%・max-width 380px）・出退勤とスタッフでログインが同じ枠",
    css.includes(".nox-pinpad-frame { width: 100%; max-width: 380px;") && src("app/kiosk/page.tsx").includes('<div className="nox-pinpad-frame" data-pin-frame="punch">') && src("components/nox/kiosk-unlock-pad.tsx").includes('<div className="nox-pinpad-frame" data-pin-frame="unlock"'));
}
// (5)
check("b1(5-1) M-162 取り下げの成功でフォームが読み直す（イベント）・「もう一度提出できます」",
  src("app/mine/wishes/withdraw-button.tsx").includes("window.dispatchEvent(new CustomEvent(WISHES_CHANGED_EVENT") && src("app/mine/wishes/wish-form.tsx").includes("window.addEventListener(WISHES_CHANGED_EVENT, on)") && src("app/mine/wishes/wish-form.tsx").includes("もう一度提出できます"));
// (6)
{
  const pages = ["analytics", "casts", "customers", "customers/[id]", "payroll", "receipts", "staff"].map((p) => src(`app/(manage)/${p}/page.tsx`));
  check("b1(6-1) M-169 見られない画面はレジでなくホームへ（7 ページ）・理由の 1 行", pages.every((s) => s.includes("redirect(deniedHrefOf(") && !s.includes('redirect("/register")')) && deniedHrefOf("analytics") === "/dashboard?denied=analytics" && (deniedNoteOf("analytics") ?? "").includes("「分析」") && deniedNoteOf("x") === null);
  check("b1(6-2) M-169 ホームの「分析へ」は店長以上だけ・理由の 1 行を出す", src("app/(manage)/dashboard/dashboard-board.tsx").includes('{isManagerUp && <Link href="/analytics"') && src("app/(manage)/dashboard/dashboard-board.tsx").includes('data-denied-note="1"'));
}
// (7)
{
  const cur = opsProfileOf({ price_display: "tax_included" }), form = { ...cur, tax_inclusive_display: !cur.tax_inclusive_display };
  check("b1(7-1) 0201b の前提＝内税の表示は price_display から・patch に tax_inclusive_display を入れない", cur.tax_inclusive_display === true && opsProfileOf({ price_display: "tax_excluded", tax_inclusive_display: true }).tax_inclusive_display === false && !("tax_inclusive_display" in opsPatchOf(form, cur)));
  check("b1(7-2) 店舗設定の内税スイッチは撤去・レジと給与は price_display を読む", !src("app/(manage)/master/store-profile-panel.tsx").includes("setOps({ tax_inclusive_display") && src("app/(manage)/register/register-board.tsx").includes('price_display === "tax_included"') && !src("app/(manage)/register/register-board.tsx").replace(/\/\/[^\n]*/g, "").includes("tax_inclusive_display") && !src("app/(manage)/payroll/payroll-board.tsx").includes("select(\"name, legal_name, settings_json, pay_day, tax_inclusive_display\")"));
  check("b1(7-3) 売掛のスイッチ＝OFF→disabled・ON→customer_only・cast_liability_allowed は ON のまま",
    receivablePolicyOfSwitch(false, "customer_only") === "disabled" && receivablePolicyOfSwitch(true, "disabled") === "customer_only" && receivablePolicyOfSwitch(true, "cast_liability_allowed") === "cast_liability_allowed" && receivablePolicyOfSwitch(false, "cast_liability_allowed") === "disabled");
  const before = receivableSwitchCallsOf(true, "disabled", false), after = receivableSwitchCallsOf(true, "disabled", true);
  check("b1(7-4) 0201b の前は set_store_receivable_policy と ar_enabled の 2 つ・後は RPC 1 本", before.length === 2 && before[0].fn === "set_store_receivable_policy" && before[1].fn === "set_store_profile" && after.length === 1 && after[0].fn === "set_store_receivable_policy");
  check("b1(7-4b) 0201b の手貼りからフラグ便までの間＝2 つ目の 'bad key' は成功として扱う（1 つ目の RPC が ar_enabled を書いた）・ほかのエラーと 1 つ目の 'bad key' は失敗のまま",
    receivableBadKeyIsOk(before[1], "bad key") && !receivableBadKeyIsOk(before[1], "forbidden") && !receivableBadKeyIsOk(before[0], "bad key") && src("app/(manage)/master/receivable-switch.tsx").includes("if (error && !receivableBadKeyIsOk(c, error.message))"));
  check("b1(7-5) 店舗設定は ReceivableSwitch（StoreFlagToggle の ar_enabled は使わない）・日報の売掛タブは settings_json.ar_enabled を読む",
    src("app/(manage)/master/store-profile-panel.tsx").includes("<ReceivableSwitch ") && !src("app/(manage)/master/store-profile-panel.tsx").includes('flagKey="ar_enabled"') && src("app/(manage)/report/report-board.tsx").includes(".ar_enabled !== true);") && !src("app/(manage)/report/report-board.tsx").includes('select("receivable_policy")'));
}
// (8)
{
  const css = src("app/globals.css");
  check("b1(8-1) M-176 フッターのリンク＝本文の色＋下線・訪問済みも同じ・ホバーとフォーカス", css.includes(".nox-footlink, .nox-footlink:visited { color: var(--ink); text-decoration: underline;") && css.includes(".nox-footlink:focus-visible") && (src("app/demo/page.tsx").match(/className="nox-footlink"/g) ?? []).length === 2);
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : /\.(tsx|ts)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const hits = ["app", "components", "lib"].flatMap(walk).filter((f) => /数字4桁|（4桁）|4桁の数字|"4桁"/.test(src(f).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")));
  check("b1(8-2) M-179 PIN の桁数は 1 か所の定数（4〜6 桁）・「4桁」の文字列が client に残っていない（コメントを除く）", PIN_DIGITS_LABEL === "4〜6 桁" && PIN_SHAPE_RE.test("1234") && PIN_SHAPE_RE.test("123456") && !PIN_SHAPE_RE.test("123") && !PIN_SHAPE_RE.test("1234567") && hits.length === 0, hits);
  check("b1(8-3) M-179 キャスト管理の PIN 設定は 6 桁まで入る（4 文字で切らない）", src("app/(manage)/casts/casts-board.tsx").includes('.slice(0, PIN_MAX)') && !src("app/(manage)/casts/casts-board.tsx").includes('.replace(/[^0-9]/g, "").slice(0, 4)'));
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b1 ALL PASS (${pass} assertions)`);
