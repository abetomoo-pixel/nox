/*
 * verify:nox-s-lane — 便 S（2026-10-21）。DB 不触（静的 pin＋純関数）。
 *   S-5 伝票の上段に顧客名（checkCustHeadOf・卓名の直後・フロアの卓タイル・390px は次の行）
 *   S-6 指名・席のキャスト一覧とフリーの付け回し（一覧は常に出す・チップ 出勤中／全員・フリーは分配率に出ない＝席の節・他卓から移すと前の卓で離席・390px は 3 列）
 *   S-4 送りの 4 方式（裁定414）＝方式→現金支払／控除／諸経費の載る／載らない・文言・行名・設定の 4 択（'store'／'none' は P 前は無効）。DB 段（transport.mode・RPC）は 0177 適用後に有効＝今は skip と明記
 */
import fs from "node:fs";
import { checkCustHeadOf } from "../lib/nox/register/line-groups";
import { ROSTER_CHIPS, activeIdsOf, endedPayloadOf, moveConfirmTextOf, seatRowTextOf, seatRowsOf, servingLabelOf, servingSeatMapOf, shareCardIdsOf } from "../lib/nox/register/seat-roster";
import { OKURI_MODE_LABEL, OKURI_ROW_LABEL, okuriAsks, okuriBucketsOf, okuriModeOf, okuriModeSelectableOf, okuriOutTextOf, okuriRecordedTextOf } from "../lib/nox/shift/okuri-mode";
import { okuriResultTextOf, okuriSelfPlanOf } from "../lib/nox/shift/okuri-self";
import { okuriButtonOf } from "../lib/nox/shift/today-row";
import { okuriEnabledOf, issueErrJa } from "../lib/nox/payroll/advance-okuri";
import { CASH_PAYOUT_LABELS } from "../lib/nox/report/cash-payout";
import { breakdownLinesOf } from "../lib/nox/payroll/breakdown-lines";
import { effectiveStageOf, periodStageOf } from "../lib/nox/shift/period-stage"; // ★便 SH-UI-b
import { SHIFT_VIEWS, VIEW_TABS, searchOfTab, stepOfTab, tabFromSearch } from "../lib/nox/shift/tabs";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const reg = src("app/(manage)/register/register-board.tsx");
const css = src("app/globals.css");
const picker = src("components/nox/cast-picker.tsx");

// ── S-5 ──
check("s5(1) checkCustHeadOf: 0 人は空・1 人「やまだ様」・2 人以上「やまだ様 ＋1」・「様」で終わる名はそのまま",
  checkCustHeadOf([]) === "" && checkCustHeadOf(["やまだ"]) === "やまだ様" && checkCustHeadOf(["やまだ", "K", "M"]) === "やまだ様 ＋2" && checkCustHeadOf(["H様", "K様"]) === "H様 ＋1");
check("s5(2) 上段＝卓名（.t）の直後に data-check-cust-head（押すと顧客の節へ）・1 段下の旧行（data-check-cust-line／.nox-checkcust）は無い",
  /className="t">\{seats\.find\(\(s\) => s\.id === check\.seat_id\)\?\.name\}<\/span>\s*\{\/\*[^]*?\*\/\}\s*\{custNames\.size > 0 && \(\s*<button type="button" className="cust" data-check-cust-head="1"/.test(reg)
  && !reg.includes('data-check-cust-line="1"') && !css.includes(".nox-checkcust") && reg.includes('document.getElementById("check-customers")'));
check("s5(3) フロアの卓タイル＝open 伝票の check_customers（customers.name 埋め込み・1 クエリ）→ .cust 1 行（data-seat-cust・省略記号）",
  reg.includes('from("check_customers").select("check_id, position, customers(name)").in("check_id", openIds)') && reg.includes('<div className="cust" data-seat-cust="1">{checkCustHeadOf(openCusts[cid])}</div>')
  && /\.nox-seat \.cust \{[^}]*text-overflow: ellipsis/.test(css));
check("s5(4) 390px＝.nox-backbar .cust は flex 0 0 100%（卓名の次の行）・同じ太字 700", /\.nox-backbar \.cust \{[^}]*font-weight: 700/.test(css) && /@media screen and \(max-width: 899px\) \{[^]*?\.nox-backbar \.cust \{ flex: 0 0 100%;/.test(css));

// ── S-6 ──
const noms = [
  { cast_id: "hina", ratio_weight: 0, nom_kind: "jonai" as const, is_dohan: false, created_at: "2026-10-21T10:05:00Z", ended_at: null },
  { cast_id: "mei", ratio_weight: 100, nom_kind: "hon" as const, is_dohan: false, created_at: "2026-10-21T10:05:00Z", ended_at: null },
  { cast_id: "sena", ratio_weight: 0, nom_kind: "free" as const, is_dohan: false, created_at: "2026-10-21T10:06:00Z", ended_at: null },
  { cast_id: "noa", ratio_weight: 0, nom_kind: "free" as const, is_dohan: false, created_at: "2026-10-21T09:50:00Z", ended_at: "2026-10-21T10:00:00Z" },
];
const kinds = { hina: "jonai", mei: "hon", sena: "free", noa: "free" };
const nameOf = (id: string) => ({ hina: "ひなの", mei: "めい", sena: "せな", noa: "のあ" } as Record<string, string>)[id] ?? id;
check("s6(1) 名簿に 2 人入れても一覧は全員（CastPicker は常に描く・selectedIds＝名簿）＝チップは出勤中（既定）／全員の 2 つ・register は chipSet two",
  JSON.stringify(ROSTER_CHIPS) === JSON.stringify([["working", "出勤中"], ["", "全員"]]) && picker.includes('chipSet === "two" ? ROSTER_CHIPS') && reg.includes('chips chipSet="two" defaultChip="working" servingSeat={servingSeat}')
  && reg.includes("selectedIds={seatedIds} badges={nomKindBadgesOf(nomKinds, seatedIds)}"));
check("s6(2) フリーは分配率に出ない＝shareCardIdsOf は着席中かつフリー以外（ひなの・めい）・離席済みも出ない",
  JSON.stringify(shareCardIdsOf(Object.keys(kinds), kinds, activeIdsOf(noms))) === JSON.stringify(["hina", "mei"]) && reg.includes("const shareIds = new Set(shareCardIdsOf(Object.keys(nomWeights), nomKinds, seatedIds));"));
const rows = seatRowsOf(noms, kinds, nameOf);
check("s6(3) 席の節＝フリーの着席ログ（着席中が上・「着卓中：せな 19:06〜」・離席済みは「のあ 18:50〜19:00（離席）」・JST）",
  rows.length === 2 && rows[0].castId === "sena" && rows[0].active && seatRowTextOf(rows[0]) === "着卓中：せな 19:06〜" && seatRowTextOf(rows[1]) === "のあ 18:50〜19:00（離席）"
  && reg.includes('data-seat-rows="1"') && reg.includes('data-seat-leave="1"') && reg.includes('data-seat-reseat="1"'), JSON.stringify(rows));
const other = [{ cast_id: "sena", ratio_weight: 1 }, { cast_id: "runa", ratio_weight: 1 }];
check("s6(4) 同じキャストを B2 から A1 に移す＝B2 の名簿を全置換（weight そのまま・せなだけ ended:true・他は ended キー無し＝既存値保持）・確認文は 1 回・「着卓中（B2）」",
  JSON.stringify(endedPayloadOf(other, "sena", true)) === JSON.stringify([{ cast_id: "sena", weight: 1, ended: true }, { cast_id: "runa", weight: 1 }])
  && moveConfirmTextOf("せな", "B2", "A1") === "せな は B2 に着卓中です。B2 から離席してこの卓（A1）に着けますか？" && servingLabelOf("B2") === "着卓中（B2）" && servingLabelOf(null) === "着卓中"
  && reg.includes("if (!on && servingIds.has(id)) { setNomConflict(id); return; }") /* ★裁定415（S-7）: 他卓タップはダイアログ経由 */ && reg.includes("await addToRoster(castId, kind);") && reg.includes("if (r.ended_at) continue;"));
const sm = servingSeatMapOf({ c1: ["sena", "runa"], c2: ["mei"] }, { c1: "s1", c2: "s2" }, (sid) => ({ s1: "B2", s2: "A3" } as Record<string, string>)[sid] ?? null, "c2");
check("s6(5) 他卓の卓名＝自伝票を除く open 伝票の名簿から（cast → 主席の卓名）", sm.get("sena") === "B2" && sm.get("runa") === "B2" && !sm.has("mei"));
check("s6(6) 390px＝一覧は横スクロールでなく 3 列の格子（.nox-castgrid・≤430px repeat(3)）", picker.includes('className="nox-castgrid" data-dense={dense ? "1" : undefined}') && /@media \(max-width: 430px\) \{ \.nox-castgrid, \.nox-castgrid\[data-dense\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/.test(css));

// ── S-4（裁定414）純関数 ──
const tr = [{ amount: 1000, mode: "actual" }, { amount: 1000, mode: "flat" }, { amount: 1000, mode: "store" }, { amount: 500, mode: null }, { amount: 9999, mode: "actual", status: "cancelled" }];
const b = okuriBucketsOf(tr);
check("s4(1) 4 方式→3 か所: 実費＝現金支払＋控除／定額＝控除だけ／店負担＝諸経費だけ／mode 無し＝actual 扱い／cancelled は除外",
  b.cash === 1500 && b.deduct === 2500 && b.expense === 1000 && b.deductActual === 1500 && b.deductFlat === 1000, JSON.stringify(b));
check("s4(2) okuriModeOf: キー無し／空／不明＝flat（DB の coalesce と同じ）・4 値はそのまま・okuriAsks は none 以外",
  okuriModeOf(null) === "flat" && okuriModeOf({ okuri_mode: "" }) === "flat" && okuriModeOf({ okuri_mode: "x" }) === "flat" && okuriModeOf({ okuri_mode: "store" }) === "store" && okuriModeOf({ okuri_mode: "none" }) === "none"
  && okuriAsks("actual") && okuriAsks("flat") && okuriAsks("store") && !okuriAsks("none"));
check("s4(3) 文言＝実費「送り代 ¥1,000 を立て替えて退勤（給与から控除）」／定額「送り ¥1,000 は給与から控除します（現金は動きません）」／店負担「送り代 ¥1,000 を店が負担して退勤」",
  okuriOutTextOf("actual", 1000) === "送り代 ¥1,000 を立て替えて退勤（給与から控除）" && okuriOutTextOf("flat", 1000) === "送り ¥1,000 は給与から控除します（現金は動きません）" && okuriOutTextOf("store", 1000) === "送り代 ¥1,000 を店が負担して退勤" && okuriOutTextOf("none", 1000) === "");
check("s4(4) 「発行」は送りに使わない＝記録後の文言・/mine／kiosk の退勤文・今日タブの title・日報の ＋発行の題",
  okuriRecordedTextOf("actual", 1000).includes("記録") && !okuriRecordedTextOf("flat", 1000).includes("発行") && okuriResultTextOf(true, "issued", 1000, "flat") === "退勤を打刻しました（送り ¥1,000 を記録しました（給与から控除・現金は動きません））"
  && okuriButtonOf({ canRecord: true, okuriActual: true, attStatus: "shukkin", hasIn: true, issuedToday: false }).title === "送りを記録します（退勤後でも営業日内は記録できます）"
  && src("components/nox/cash-payout-issue.tsx").includes('okuri: "送りの記録"') && !src("components/nox/okuri-out-dialog.tsx").includes("送りを発行") && !src("app/(manage)/shift/shift-board.tsx").includes("を発行しました"));
check("s4(5) 日報の行名＝現金支払「送り立替」・諸経費「送迎費（店負担）」（mode='store' の当日分・無ければ行なし）・現金支払は mode='actual' だけ",
  CASH_PAYOUT_LABELS.okuri === "送り立替" && OKURI_ROW_LABEL.expense === "送迎費（店負担）" && src("app/(manage)/report/report-board.tsx").includes('data-expense-bd="1"') && src("app/(manage)/report/report-board.tsx").includes("okuriCashOf(r.mode as string | null)")
  && src("app/(manage)/report/report-board.tsx").includes("{okuriStoreSum > 0 && ("));
check("s4(6) 給与＝collect.loadTransport は select * で mode を読み 'store' を除外・明細は mode が分かれば「送り立替」「送り（定額）」の 2 行・無ければ「送り」1 行",
  src("lib/nox/payroll/collect.ts").includes("if (!okuriDeductOf(mode)) continue;")
  && breakdownLinesOf({ pay: { okuriDeduct: 2500 }, okuriModes: { actual: 1500, flat: 1000 } } as never).ded.some((l) => l.label === "送り立替" && l.amount === 1500)
  && breakdownLinesOf({ pay: { okuriDeduct: 2500 }, okuriModes: { actual: 1500, flat: 1000 } } as never).ded.some((l) => l.label === "送り（定額）" && l.amount === 1000)
  && breakdownLinesOf({ pay: { okuriDeduct: 2500 } } as never).ded.some((l) => l.label === "送り" && l.amount === 2500)
  && src("app/mine/page.tsx").includes("okuriModes={okuriModes}"));
check("s4(7) 退勤の導線＝'none' 以外（/mine・kiosk の okuriSelfPlanOf・今日タブ）・記録可否 okuriEnabledOf は none だけ false・エラー文 'okuri none'／適用前の 'okuri not actual'",
  okuriSelfPlanOf({ okuri_mode: "flat", okuri_base_amount: 1000 }).ask && okuriSelfPlanOf({ okuri_mode: "store", okuri_base_amount: 1000 }).mode === "store" && !okuriSelfPlanOf({ okuri_mode: "none", okuri_base_amount: 1000 }).ask
  && okuriEnabledOf("flat") && okuriEnabledOf("store") && !okuriEnabledOf("none") && okuriEnabledOf(undefined)
  && issueErrJa(400, "okuri none").includes("「なし」") && issueErrJa(400, "okuri not actual").includes("0177"));
check("s4(8) 設定画面＝4 択（実費／定額／店負担／なし）・'store'／'none' は P 前は無効「0177 の適用後に選べます」・route は 4 値を受ける",
  JSON.stringify(Object.values(OKURI_MODE_LABEL)) === JSON.stringify(["実費", "定額", "店負担", "なし"]) && okuriModeSelectableOf("store", false) === false && okuriModeSelectableOf("none", false) === false && okuriModeSelectableOf("flat", false) && okuriModeSelectableOf("store", true)
  && src("app/(manage)/master/deduction-panel.tsx").includes("okuriModeSelectableOf(m, okuri4wayOn())") && src("lib/nox/rules-0175/flag.ts").includes("export const OKURI_4WAY_APPLIED = false;") /* ★便 P175-prep P-7: フラグは flag.ts に一本化（pin 張替え） */ && src("app/api/store/okuri-mode/route.ts").includes('mode !== "store" && mode !== "none"'));
console.log("s4(DB) transport.mode／set_store_okuri_mode の 4 値／RPC の 'okuri none'＝0177 適用後に有効（今は skip）");
// ── 便 SH-UI-a（2026-10-22）A-1 就業規則キー・A-2 ロゴ ──
{
  const { WAGE_CUT_RULE_KEY, wageCutRuleOf, SYSTEM_KEYS } = require("../lib/nox/store-systems") as typeof import("../lib/nox/store-systems");
  const { normProposalOf } = require("../lib/nox/payroll/norm-proposal") as typeof import("../lib/nox/payroll/norm-proposal");
  const { sysSettingsOf } = require("../scripts/demo/profiles.mjs") as { sysSettingsOf: (c: string) => Record<string, boolean> };
  const cfg = { on: true, days: { flat: 0, per: 0 }, dohan: { flat: 0, per: 0 }, shimei: { flat: 0, per: 1000 }, sales: { flat: 0, per: 0, unit: 100000 } };
  const base = { cfg, axes: { days: false, dohan: false, shimei: true, sales: false }, targets: { shimei: 34 }, actual: { days: 0, dohan: 0, shimei: 4, sales: 0 }, employment: "雇用" as const, avgDailyWage: 20000, gross: 300000, sanctionSoFar: 0 };
  const on = normProposalOf({ ...base, hasWorkRule: true }); const off = normProposalOf({ ...base, hasWorkRule: false });
  check("sh(1) A-1 就業規則キー sys_wage_cut_rule＝ON で雇用の提案（91 条キャップ・proposed>0）・OFF は no_rule（案内だけ）・SYSTEM_KEYS 9 には入れない（白名単 pin を崩さない）",
    WAGE_CUT_RULE_KEY === "sys_wage_cut_rule" && wageCutRuleOf({ sys_wage_cut_rule: true }) && !wageCutRuleOf({ sys_wage_cut_rule: "true" }) && !wageCutRuleOf(null)
    && !!on && on.proposed > 0 && on.status !== "no_rule" && off?.status === "no_rule" && off.proposed === 0 && !(SYSTEM_KEYS as readonly string[]).includes("sys_wage_cut_rule"));
  check("sh(2) A-1 読み書き＝collect は wageCutRuleOf（旧 sanction_work_rule を読まない）・利用機能の行は set_store_profile の 1 キー patch（白名単は 0175＝適用前は切替を無効・LILY は payload で ON）",
    src("lib/nox/payroll/collect.ts").includes("hasWorkRule: wageCutRuleOf(") && !/.sanction_work_rule ===/.test(src("lib/nox/payroll/collect.ts"))
    && src("app/(manage)/master/cast-comp/systems/systems-board.tsx").includes("p_patch: { [WAGE_CUT_RULE_KEY]: next }") && src("app/(manage)/master/cast-comp/systems/systems-board.tsx").includes("const WAGE_CUT_RULE_APPLIED = rules0175On();") && src("lib/nox/rules-0175/flag.ts").includes("export const RULES_0175_APPLIED = false;") /* ★便 P175-prep P-3: 0175 フラグ（pin 張替え） */);
  const lily = JSON.parse(src("docs/demo/payload/lily.json")) as { tables: { stores: Record<string, unknown>[] } }; const ace = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: { stores: Record<string, unknown>[] } };
  check("sh(3) A-1 デモ payload＝LILY（雇用の店）ON・ACE OFF（他 4 店も OFF）", sysSettingsOf("lily").sys_wage_cut_rule === true && sysSettingsOf("ace").sys_wage_cut_rule === false
    && (lily.tables.stores[0].settings_json as Record<string, unknown>).sys_wage_cut_rule === true && (ace.tables.stores[0].settings_json as Record<string, unknown>).sys_wage_cut_rule === false
    && ["muse", "luna", "noir", "nest"].every((c) => sysSettingsOf(c).sys_wage_cut_rule === false));
  const brand = src("components/ui/brand-logo.tsx");
  check("sh(4) A-2 ロゴ＝public/brand の横組み（dark／light）・favicon.ico／favicon.svg／apple-touch-icon・manifest 192／512 は brand へ・旧 icon-192／icon-512／favicon-32 は無い",
    fs.existsSync("public/brand/nox_logo_horizontal_dark.svg") && fs.existsSync("public/brand/nox_logo_horizontal_light.svg") && fs.existsSync("public/favicon.svg") && fs.existsSync("public/apple-touch-icon.png") && fs.existsSync("public/brand/favicon_192.png") && fs.existsSync("public/brand/favicon_512.png")
    && !fs.existsSync("public/icon-192.png") && !fs.existsSync("public/icon-512.png") && !fs.existsSync("public/favicon-32.png")
    && src("public/manifest.json").includes("/brand/favicon_192.png") && src("public/manifest.json").includes("/brand/favicon_512.png") && !src("public/manifest.json").includes("/icon-192.png")
    && src("app/layout.tsx").includes('{ url: "/favicon.svg", type: "image/svg+xml" }') && src("app/layout.tsx").includes("/brand/favicon_512.png") && brand.includes('dark: "/brand/nox_logo_horizontal_dark.svg"'));
  const sites = ["components/ui/side-nav.tsx", "app/(manage)/layout.tsx", "app/login/page.tsx", "app/demo/page.tsx", "app/lp/page.tsx", "app/mine/layout.tsx", "components/nox/receipt-print.tsx", "components/payslip-slip.tsx"];
  check("sh(5) A-2 ロゴの差し替え先＝サイドバー・上部バー・ログイン・/demo・/lp・mine・領収書（light）・報酬明細（画面 dark／印刷 light）＝全部 BrandLogo・旧「N」brandmark と文字ロゴは無い・印刷は .nox-logo-print 切替",
    sites.every((f) => src(f).includes("<BrandLogo")) && !src("components/ui/side-nav.tsx").includes('className="brandmark"') && !src("app/(manage)/layout.tsx").includes('className="brandmark"') && !src("app/login/page.tsx").includes("<h1 style={{ ...t.brand, fontSize: 30")
    && src("components/nox/receipt-print.tsx").includes('<BrandLogo height={34} variant="light" />') && src("components/payslip-slip.tsx").includes("<BrandLogo height={22} print />")
    && /@media print { .nox-logo-screen { display: none !important; } .nox-logo-print { display: block !important; } }/.test(css) && !css.includes(".nox-side .brandmark {"));
}



// ── 便 SH-UI-c（2026-10-22）C-1／C-2 勤怠一覧・S-7 指名かぶり・W-10・C-3 ──
{
  const { attendanceDayRowsOf, attendanceSummaryOf, attendanceCsvOf, hm47Ja, sheetRowCellsOf } = require("../lib/nox/payroll/attendance-sheet") as typeof import("../lib/nox/payroll/attendance-sheet");
  const { wageDetail } = require("../lib/nox/pay") as typeof import("../lib/nox/pay");
  const { nomConflictTextOf, servingMarkOf } = require("../lib/nox/register/seat-roster") as typeof import("../lib/nox/register/seat-roster");
  // fixture: 10/01 シフト 20:00–25:00・in 19:50 out 翌01:10／10/02 in 20:25（遅刻・連絡あり）out 翌00:20（早退＝閉店 25:00 の 40 分前・猶予 30）／10/03 シフトあり打刻なし（当欠）／10/04 in のみ（退勤記録なし）／10/05 未来
  const P = (d: string, hm: string) => ({ punched_at: d + "T" + hm + ":00+09:00", type: "in" as const });
  const O = (d: string, hm: string) => ({ punched_at: d + "T" + hm + ":00+09:00", type: "out" as const });
  const shifts = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((date) => ({ date, start_hm: "20:00", end_hm: "25:00" }));
  const punches = [P("2026-10-01", "19:50"), O("2026-10-02", "01:10"), P("2026-10-02", "20:25"), O("2026-10-03", "00:20"), P("2026-10-04", "20:00")];
  const attendance = [{ date: "2026-10-02", status: "late" as const, eta: "20:30", reason: "電車遅延", source: "self", updated_at: "2026-10-02T15:42:00+09:00" }, { date: "2026-10-03", status: "absent" as const, source: "staff" }];
  const corrections = [{ biz_date: "2026-10-01", kind: "out" as const, before_at: "2026-10-02T00:40:00+09:00", after_at: "2026-10-02T01:10:00+09:00", reason: "退勤打刻の忘れ", decision: "approved", decided_at: "2026-10-02T12:00:00+09:00", decided_by_name: "デモ 店長" }];
  const transports = [{ biz_date: "2026-10-01", amount: 1000, mode: "actual", status: "open" }, { biz_date: "2026-10-01", amount: 500, mode: null, status: "cancelled" }];
  const rows = attendanceDayRowsOf({ punches, shifts, attendance, corrections, transports, cutoffHm: "06:00", closeHm: "25:00", grace: { lateGrace: 10, earlyGrace: 30, overGrace: 30 }, payTimeBasis: "punch", todayBiz: "2026-10-04", periodStart: "2026-10-01", periodEnd: "2026-10-05" });
  const byD = Object.fromEntries(rows.map((r) => [r.bizDate, r]));
  check("shc(1) C-1 行＝実働は dayWorkedHours（10/01 19:50→翌01:10＝5.3h・10/02 20:25→翌00:20＝3.9h）・遅刻（連絡あり 15:42）・早退・当欠・退勤記録なし（10/04）・未来日（10/05）・翌表記・送り 実費 1（cancelled 除外）・修正者",
    byD["2026-10-01"].hours === 5.3 && byD["2026-10-02"].hours === 3.9 && byD["2026-10-02"].late && byD["2026-10-02"].contactAt === "15:42" && byD["2026-10-02"].early && byD["2026-10-03"].absent && byD["2026-10-04"].missingOut && byD["2026-10-04"].hours === 0 && byD["2026-10-05"].future
    && hm47Ja(byD["2026-10-01"].outHm) === "翌01:10" && byD["2026-10-01"].okuri.n === 1 && byD["2026-10-01"].okuri.modes[0] === "実費" && byD["2026-10-01"].corrections[0].by === "デモ 店長" && byD["2026-10-02"].note === "電車遅延", JSON.stringify(rows.map((r) => [r.bizDate, r.hours, r.final, r.late, r.absent, r.early, r.missingOut, r.contactAt])));
  const sum = attendanceSummaryOf(rows, "2026-10-04");
  const wd = wageDetail(rows.filter((r) => !r.future && r.hours > 0).map((r) => ({ d: Number(r.bizDate.slice(8)), hours: r.hours, sales: 0 })), { base: 2000 } as never, 0, 0);
  check("shc(2) C-2 ① 合計＝日数 3（ok 2＝退勤記録なしの日も in があれば数える＝給与と同じ・late 1・当欠は数えない・未来日は数えない）・実働＝給与の wHours と同じ丸め・遅刻 1・当欠 1・早退 1・送り 1・退勤記録なし 1",
    sum.days === 3 && sum.hours === wd.wHours && sum.hours === 9.2 && sum.lateN === 1 && sum.absentN === 1 && sum.earlyN === 1 && sum.okuriN === 1 && sum.missingOutN === 1, JSON.stringify(sum) + " wHours=" + wd.wHours);
  const rowsS = attendanceDayRowsOf({ punches, shifts, attendance, cutoffHm: "06:00", closeHm: "25:00", payTimeBasis: "shift", todayBiz: "2026-10-04", periodStart: "2026-10-01", periodEnd: "2026-10-04" });
  check("shc(3) C-1 計算基準 確定シフト＝実打刻 h>0 の日だけシフトの 5h に置換（pay.ts 613 と同じ）・印は「確定シフト」・打刻なしの日は 0 のまま",
    rowsS.find((r) => r.bizDate === "2026-10-01")!.hours === 5 && rowsS.find((r) => r.bizDate === "2026-10-01")!.basis === "shift" && rowsS.find((r) => r.bizDate === "2026-10-04")!.hours === 0);
  const csv = attendanceCsvOf({ storeName: "CLUB ACE", period: "2026-10", castName: "ひなの", exportedAt: "2026/10/22 16:00" }, rows.filter((r) => !r.future));
  check("shc(4) C-2 ⑤ CSV＝UTF-8 BOM・CRLF・見出し行＋②の列 10＋4 行・退勤記録なしは文字で・修正の列に修正者",
    csv.startsWith("﻿# CLUB ACE 勤怠 2026-10 ひなの") && csv.split("\r\n").length === 7 && sheetRowCellsOf(byD["2026-10-04"])[3] === "退勤記録なし" && csv.includes("退勤 00:40→01:10・デモ 店長"), String(csv.split("\r\n").length));
  const reg = src("app/(manage)/register/register-board.tsx"), pb = src("app/(manage)/payroll/payroll-board.tsx"), pg = src("app/(manage)/payroll/page.tsx"), mine = src("app/mine/page.tsx"), rt = src("lib/nox/payroll/kintai-sheet.ts") /* ★便 SH-UI-c2: 組み立ては kintai-sheet（route と /mine が共用） */, ab = src("app/(manage)/payroll/attendance-board.tsx");
  check("shc(5) C-2 配線＝勤怠タブ（?tab=attendance・スタッフは StaffWorkPanel）・route は computePayrollDraft の wHours／wdays／lateN／absentN を合計表に（別計算なし）・時間セルと時給行が勤怠表へ・/mine は同じ部品（withBy false・link なし）・390px は .opt を隠す・印刷 A4 横・CSV",
    pg.includes('["attendance", "勤怠", "/payroll?tab=attendance"]') && pg.includes("<AttendanceBoard stores={storeList}") && rt.includes("computePayrollDraft(admin, managerClient, storeId, period, { previewDefaults: true })") && rt.includes("hours: d.pay.wHours, days: Array.isArray(d.pay.wdays) ? d.pay.wdays.length : 0, lateN: d.pay.lateN ?? 0")
    && pb.includes("data-kintai-link={r.castId}") && pb.includes("data-kintai-link-line={r.castId}") && mine.includes("<KintaiRow key={r.bizDate} r={r} withBy={false} link={false} />") && /@media \(max-width: 430px\) \{ \.nox-kintai \.nox-kintai-table \.opt \{ display: none; \}/.test(css)
    && ab.includes("@page { size: A4 landscape") && ab.includes('data-kintai-csv="1"'));
  const tx = nomConflictTextOf("るな", "A3", "VIP-1");
  check("shc(6) S-7 裁定415＝文言・2 ボタン・他卓タップ＝ダイアログ・指名だけ＝本指名で追加（他卓の名簿は触らない）・付け回す＝本指名＋S-6・バッジは本指名と着卓中（A3）の両方・分配率の行に「A3 着卓中」",
    tx.lead === "るな は A3 に着卓中です（指名かぶり）。この卓（VIP-1）の指名料は入ります。A3 の伝票は変わりません。席はどうしますか？" && tx.only === "指名だけ入れる（席は A3 のまま）" && tx.move === "指名して A3 から付け回す" && servingMarkOf("A3") === "A3 着卓中" && servingMarkOf(null) === null
    && reg.includes("if (!on && servingIds.has(id)) { setNomConflict(id); return; }") && reg.includes('await addToRoster(castId, "hon"); await loadOpenMap(); }') && reg.includes('await moveFromOtherSeat(castId, "hon"); }') && reg.includes("<NomConflictDialog castName=") && reg.includes("data-nom-serving={ca.id}")
    && src("components/nox/cast-picker.tsx").includes("{badge && serving && grouped && (") /* live 修正: この卓に入れた後も「着卓中（A2）」を並べる＝seated を条件にしない */ && src("components/nox/nom-conflict-dialog.tsx").includes('data-nom-conflict-move="1"'));
  const ace = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> & { casts: { id: string; name: string }[] } };
  const hin = ace.tables.casts.find((c) => c.name === "ひなの"); const late = (ace.tables.attendance ?? []).find((a) => a.cast_id === hin?.id && a.status === "late");
  check("shc(7) C-3 payload＝ACE ひなの 当月（$m:0）に遅刻 1 件（連絡あり 18:42・見込み 20:00・理由）・店の時刻修正は c_load に表が無く payload に入れられない（0175 行き）",
    !!hin && !!late && (late.date as { $m: number }).$m === 0 && late.eta === "20:00" && late.source === "self" && ((late.updated_at as { t: string }).t === "18:42:00") && !("punch_corrections" in ace.tables));
  check("shc(8) W-10＝docs/demo/w10_junbichu.md（表 25 行・作る／消す の相談役案・事後承認待ち）", fs.existsSync("docs/demo/w10_junbichu.md") && (src("docs/demo/w10_junbichu.md").match(/^\| \d+ \|/gm) || []).length === 25 && src("docs/demo/w10_junbichu.md").includes("【事後承認待ち】"));
}

// ★便 SH-UI-b（2026-10-22・裁定406）: シフト画面の再構成＝上段 3 タブ＋手順 4 段・実効段（締切後は配置中）・②提出一覧／④公開シフト／確定シフトの期間切替・URL
{
  check("shb(1) 状態名＝作成中→募集中→配置中→公開済み（closed＝配置中・★裁定406）", periodStageOf("draft") === "作成中" && periodStageOf("open") === "募集中" && periodStageOf("closed") === "配置中" && periodStageOf("published") === "公開済み");
  check("shb(2) 実効段＝募集中で締切を過ぎた期間は「配置中」（表示のみ・締切当日はまだ募集中・締切なし／draft／published は据え置き・未知は draft）",
    effectiveStageOf({ status: "open", wish_deadline: "2026-10-20" }, "2026-10-22") === "closed" && effectiveStageOf({ status: "open", wish_deadline: "2026-10-22" }, "2026-10-22") === "open"
    && effectiveStageOf({ status: "open", wish_deadline: null }, "2026-10-22") === "open" && effectiveStageOf({ status: "draft", wish_deadline: "2026-10-01" }, "2026-10-22") === "draft"
    && effectiveStageOf({ status: "published", wish_deadline: "2026-10-01" }, "2026-10-22") === "published" && effectiveStageOf({ status: "zzz", wish_deadline: null }, "2026-10-22") === "draft");
  check("shb(3) 上段 3 タブ＋手順 4 段＝今日／シフト作成（①期間を作る ②提出一覧 ③シフト配置 ④公開シフト）／確定シフト・URL ?tab=make&step=3&period=p の往復",
    SHIFT_VIEWS.map(([, l]) => l).join("/") === "今日/シフト作成/確定シフト" && VIEW_TABS.make.map(([, l]) => l).join("/") === "期間を作る/提出一覧/シフト配置/公開シフト"
    && tabFromSearch("?tab=make&step=3&period=p") === "queue" && searchOfTab("?period=p", "queue", "p") === "?period=p&tab=make&step=3" && stepOfTab("publish") === 4);
  const sb = src("app/(manage)/shift/shift-board.tsx"), css = src("app/globals.css");
  check("shb(4) shift-board＝手順 ol（data-shift-steps）・②提出一覧（募集中の期間切替・締切まで／提出済み／未提出・未提出の名前・提出済みの表・「今すぐ締め切って ③ シフト配置へ」＝shift_period_set closed）",
    sb.includes('data-shift-steps="1"') && sb.includes('data-shift-submit="1"') && sb.includes('data-period-tabs={to}') && sb.includes("<div className=\"l\">締切まで</div>") && sb.includes('data-shift-not-submitted="1"') && sb.includes("data-shift-submitted={c.id}")
    && sb.includes('data-shift-close-recruit="1"') && sb.includes('await setPeriodStatus(p, "closed"); openPeriodInStep(p, "queue");'));
  check("shb(5) ③ シフト配置＝配置中の期間切替＋「④ 公開シフトへ」・承認リスト（queue）と月カレンダー（旧 calendar）は ③ の中・④ 公開シフト＝「キャストに公開する」（published→確定シフトへ）＋不足日（dayStat の required>assigned・「③ で配置する」）",
    sb.includes('data-shift-place-head="1"') && sb.includes('data-shift-go-publish="1"') && sb.includes('(tab === "calendar" || tab === "queue" || tab === "publish") && (') && sb.includes('data-shift-publish-btn="1"')
    && sb.includes('{p.status === "published" ? "公開済み" : "キャストに公開する"}') && sb.includes('data-shift-short-days="1"') && sb.includes("st.required > 0 && st.assigned < st.required") && sb.includes(">③ で配置する</button>"));
  check("shb(6) 確定シフト＝公開済みの期間を選んでカレンダー（data-shift-fixed-periods）・① の公開ボタンは「④ 公開シフトへ」に（① から published にしない）・実効段＝effectiveStageOf(p, bizToday)",
    sb.includes('data-shift-fixed-periods="1"') && sb.includes('const publishedPeriods = periodsAll.filter((p) => p.status === "published");') && sb.includes(">④ 公開シフトへ</button>") && !sb.includes(">スタッフに公開する</button>") && sb.includes("const stageOfP = (p: Period) => effectiveStageOf(p, bizToday);"));
  check("shb(7) CSS＝.nox-steps（PC 4 列・≤899 2 列・≤600 縦 1 列）・.nox-cta 中央・.nox-ptabs・.nox-kpis3（≤600 1 列）",
    css.includes(".nox-steps { list-style: none; margin: 0 0 10px; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }") && css.includes("@media (max-width: 899px) { .nox-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }")
    && css.includes("@media (max-width: 600px) { .nox-steps { grid-template-columns: 1fr; } }") && css.includes(".nox-cta { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }") && css.includes(".nox-ptabs { display: flex; gap: 8px; flex-wrap: wrap; }") && css.includes("@media (max-width: 600px) { .nox-kpis3 { grid-template-columns: 1fr; }"));
  const mine = src("app/mine/wishes/wish-form.tsx");
  check("shb(8) U-3 /mine＝凡例（GV-60 の 7 状態・data-day-legend）据え置き・承諾＝shift-confirm-button（shift_cast_confirm）・辞退 RPC は無い（0176 行き）", mine.includes('data-day-legend="1"') && src("app/mine/shift-confirm-button.tsx").includes('supabase.rpc("shift_cast_confirm", { p_shift_id: shiftId })') && !fs.existsSync("app/mine/shift-decline-button.tsx"));
}

if (fails.length) { console.error(`verify:nox-s-lane FAIL (${fails.length})\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`verify:nox-s-lane OK (${pass} checks)\n便 S: S-5 上段の顧客名・S-6 一覧常時表示とフリーの席・S-4 送りの 4 方式（純関数＋静的 pin・DB 段は 0177 後）／SH-UI-c 勤怠・指名かぶり／SH-UI-b シフト再構成（裁定406）`);
