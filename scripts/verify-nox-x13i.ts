/*
 * verify:nox-x13i — 便 X13-I（2026-10-21）。DB 不触（静的 pin＋純関数）。
 *   I-5 ノルマ未達の減額の提案（委託＝提案額・雇用＝91 条キャップ／就業規則の定めなし／算定不能・検知無効・採用軸）・給与の要対応・ノルマ設定の独立パネル・デモ
 *   H-20 アカウントメニューの中身（ポータルの出し先＝最寄りの .nox-dark）・H-19 前借り／送り実費の発行フォーム・live ② 一覧カードの判定期間
 */
import fs from "node:fs";
import { normProposalOf, normAxisItemOf, normApplyErrOf, normReasonOf, type NormPenalty4 } from "../lib/nox/payroll/norm-proposal";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const cfg: NormPenalty4 = { on: true, days: { flat: 0, per: 0 }, dohan: { flat: 0, per: 0 }, shimei: { flat: 0, per: 1000 }, sales: { flat: 0, per: 2000, unit: 100000 } };
const axes = { days: false, dohan: false, shimei: true, sales: true };
const c1 = normProposalOf({ cfg, axes, targets: { shimei: 34, sales: 2350000 }, actual: { days: 0, dohan: 0, shimei: 22, sales: 2100000 }, employment: "委託" });
check("x13i(1-1) 委託＝指名 不足 12 回 × ¥1,000 ＝ ¥12,000／売上 不足 ¥250,000（¥100,000 ごとに 3）× ¥2,000 ＝ ¥6,000・提案 ¥18,000",
  !!c1 && c1.proposed === 18000 && c1.items[0].text === "指名 不足 12 回 × ¥1,000 ＝ ¥12,000" && c1.items[1].text === "売上 不足 ¥250,000（¥100,000 ごとに 3）× ¥2,000 ＝ ¥6,000", JSON.stringify(c1));
check("x13i(1-2) 検知無効・採用していない軸・達成済み・設定 0 は出さない",
  normProposalOf({ cfg: { ...cfg, on: false }, axes, targets: { shimei: 34 }, actual: { days: 0, dohan: 0, shimei: 1, sales: 0 }, employment: "委託" }) === null
  && normProposalOf({ cfg, axes: { ...axes, shimei: false, sales: false }, targets: { shimei: 34, sales: 1 }, actual: { days: 0, dohan: 0, shimei: 1, sales: 0 }, employment: "委託" }) === null
  && normAxisItemOf("shimei", 10, 10, cfg) === null && normAxisItemOf("days", 20, 10, cfg) === null);
const e1 = normProposalOf({ cfg, axes, targets: { shimei: 34 }, actual: { days: 0, dohan: 0, shimei: 4, sales: 0 }, employment: "雇用", avgDailyWage: 20000, gross: 300000, sanctionSoFar: 0, hasWorkRule: true });
check("x13i(1-3) 雇用＝91 条キャップ（1 回＝平均賃金の半額 ¥10,000・当期の残り ¥30,000）＝計算 ¥30,000 →「上限で ¥10,000 に制限」",
  !!e1 && e1.total === 30000 && e1.proposed === 10000 && e1.capped && (e1.note ?? "").startsWith("上限で ¥10,000 に制限"), JSON.stringify(e1));
const e2 = normProposalOf({ cfg, axes, targets: { shimei: 34 }, actual: { days: 0, dohan: 0, shimei: 4, sales: 0 }, employment: "雇用", avgDailyWage: 20000, gross: 300000, hasWorkRule: false });
const e3 = normProposalOf({ cfg, axes, targets: { shimei: 34 }, actual: { days: 0, dohan: 0, shimei: 4, sales: 0 }, employment: "雇用", avgDailyWage: null, gross: 300000, hasWorkRule: true });
check("x13i(1-4) 雇用＝就業規則の定めなし→提案なし（案内）・平均賃金なし（新人）→算定不能",
  e2?.status === "no_rule" && e2.proposed === 0 && e2.note === "就業規則に定めがある場合のみ使えます" && e3?.status === "incalculable" && e3.proposed === 0);
check("x13i(1-5) 適用＝増額不可・0 以上・理由「ノルマ未達（10月・指名 不足 12 回・売上 不足 ¥250,000）」",
  normApplyErrOf(18000, 20000) !== null && normApplyErrOf(18000, 15000) === null && normApplyErrOf(18000, -1) !== null && normReasonOf("2026-10", c1!.items) === "ノルマ未達（10月・指名 不足 12 回・売上 不足 ¥250,000）");
const core = src("lib/nox/payroll/core.ts"), col = src("lib/nox/payroll/collect.ts"), pb = src("app/(manage)/payroll/payroll-board.tsx"), np = src("components/nox/norm-proposals.tsx");
check("x13i(2-1) core が行に normProposal（無い行はキーなし）・collect が 4 軸の設定と目標・preview が返す・給与の要対応に提案（適用＝精算調整／雇用＝懲戒減給）",
  core.includes("...(np4 ? { normProposal:") && col.includes("normPenalty4: {") && col.includes("normTargets4: (() => {") && src("app/api/payroll/preview/route.ts").includes("...(r.normProposal ? { normProposal: r.normProposal } : {})")
  && pb.includes("<NormProposals rows={rows.filter((r) => !!r.normProposal)") && np.includes('p_source: isEmp ? "sanction" : "settlement"') && np.includes("ノルマ未達 {contractor.length} 名・提案額 合計") && np.includes("ノルマ未達の懲戒減給（雇用・労基法 91 条の上限内）"));
const nb = src("app/(manage)/master/cast-comp/norma/norma-board.tsx");
check("x13i(2-2) ノルマ設定＝★便 NR-1（裁定428 候補）で再構成: 減額は「軸と減額」パネル（norm-axes-penalty-panel・set_penalty_config）・閾値（detect）は控除・送りタブ（deduction-board）・PenaltyTab の part 分岐は残る",
  nb.includes("<NormAxesPenaltyPanel") && !nb.includes("<PenaltyTab") && src("app/(manage)/master/cast-comp/deduction/deduction-board.tsx").includes('part="detect"') && src("app/(manage)/master/cast-comp/norma/norm-axes-penalty-panel.tsx").includes('supabase.rpc("set_penalty_config", penaltyArgsOf(storeId, penalty))') && src("app/(manage)/master/cast-comp/comp-sections.tsx").includes('const showDetect = part !== "norm", showNorm = part !== "detect";'));
const ace = JSON.parse(src("docs/demo/payload/ace.json")).tables;
check("x13i(2-3) デモ＝ACE の penalty_config（検知 ON・指名 ¥1,000／回・売上 ¥2,000／¥100,000）", ace.penalty_config?.[0]?.norm_on === true && ace.penalty_config[0].norm_shimei_per === 1000 && ace.penalty_config[0].norm_sales_unit === 100000);
// H-20
const hc = src("components/ui/header-chips.tsx");
check("x13i(3-1) H-20 アカウントメニュー＝ポータルの出し先は最寄りの .nox-dark（body 直下はテーマの外＝文字が暗色で見えなかった）・W-1 のぼかしは擬似要素のまま",
  hc.includes('(chipRef.current?.closest(".nox-dark") as HTMLElement | null) ?? document.body') && !hc.includes("), document.body)}") && src("app/globals.css").includes(".nox-modal-overlay::before {"));
// H-19
const ao = src("components/nox/advance-okuri-form.tsx"), css = src("app/globals.css");
check("x13i(4-1) H-19 前借り／送り実費＝1 行目 金額・日付・主ボタン「◯◯を発行」／2 行目 メモ全幅・キャスト一覧は全行（内側スクロールなし）",
  ao.includes("{busy ? \"発行中…\" : `${label}を発行`}") && ao.includes('className="nox-issue-memo"') && ao.includes("<Picker fullList") && css.includes(".nox-issue-row > .nox-issue-memo { grid-column: 1 / -1; }")
  && src("components/nox/picker.tsx").includes("...(fullList ? {} : { maxHeight: dense ? 220 : 300, overflowY: \"auto\" as const })"));
// live ③⑤: 当期の draft run が無いときは payroll_run_create（調整控除の追加 route と同じ・自然冪等）で作ってから登録
check("x13i(4-2) 提案の適用と罰金の確定＝run が無ければ payroll_run_create で作る（確定済みなら止める）",
  np.includes('supabase.rpc("payroll_run_create", { p_store_id: storeId, p_period: period })') && src("components/nox/penalty-dialog.tsx").includes('supabase.rpc("payroll_run_create", { p_store_id: storeId, p_period: biz.slice(0, 7) })')
  && !np.includes("当期の給与が未作成です") && !src("components/nox/penalty-dialog.tsx").includes("給与画面でプレビューを 1 回押すと作成されます"));
// live ②
check("x13i(5-1) 一覧カード／詳細の判定期間＝loadPlans が slide_period／slide_apply を詰める", src("app/(manage)/casts/casts-board.tsx").includes("...({ slide_period: r.slide_period ?? null, slide_apply: r.slide_apply ?? null } as object)"));

if (fails.length) { console.log(`✗ verify:nox-x13i 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.log(` - ${f}`); process.exit(1); }
console.log(`verify:nox-x13i OK (${pass} checks)`);
console.log("便 X13-I: ノルマ未達の減額の提案・アカウントメニュー・前借りの発行フォーム・一覧カードの判定期間");
