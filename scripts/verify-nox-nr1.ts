/*
 * verify:nox-nr1 — 便 NR-1（裁定428 候補・2026-10-26）: ノルマ設定（店）の再構成（A）＋定休日のシフト反映（B）。DB 不触（純関数＋逐語 grep）。
 *  (1) A 純関数（lib/nox/store/norm-panel.ts）: 単位（同伴＝回）・方式の解決（両方 0＝選んだ方式／値から）・切替（反対側 0・値は引き継ぐ）・金額（方式の側）・不足 1 単位ごとの語・保存の順
 *  (2) A 配線: norma-board＝2 パネル（data-norm-panel="axes"／"targets"）・閾値パネルなし（PenaltyTab は deduction-board へ）・※の注記なし・説明は InfoNote・保存は 1 つ（3 RPC を順に）・
 *      PENALTY_AXES の同伴は「回」・CSS .nox-normax（≤430: セグメント 50／50・金額 100%・保存中央）・旧 norm-config-panel は無い
 *  (3) B 純関数（cal-cell）: closed＝fill "closed"・中央「定休日」・FILL_WORD・CalCell の closed prop／凡例の「定休日（対象外）」
 *  (4) B 配線: shift-board＝closedDows／isClosedDay・dayStat は定休日で required 0・予想人件費は定休日を除外・CalCell に closed・スタッフ別の列（data-staff-closed）・
 *      必要人数の定休日行（data-need-closed・0 固定）・saveNeed のガード・確定表の案内（data-closed-shift-note）・seed.ts の後処理 demoDropClosedDayShifts（shifts／shift_wishes）
 *  逆テスト（手動・各 1 回）: norm-panel の axisSwitchModeOf で反対側を 0 にしない→nr1(1-3) 赤／shift-board の `if (isClosedDay(ymd)) return` を外す→nr1(4-2) 赤。
 */
import fs from "node:fs";
import { NORM_PENALTY_UNIT, NORM_PANEL_SAVE_ORDER, activeAxesOf, axisAmountOf, axisModeOf, axisSetAmountOf, axisSwitchModeOf, perUnitLabelOf, type PenaltyAmounts } from "../lib/nox/store/norm-panel";
import { CLOSED_CELL_TEXT, FILL_WORD, LEGEND_FILL, cellTextOf } from "../lib/nox/shift/cal-cell";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// ── (1) A 純関数 ──
const P0: PenaltyAmounts = { norm_days_flat: 0, norm_days_per: 0, norm_dohan_flat: 3000, norm_dohan_per: 0, norm_sales_flat: 0, norm_sales_per: 500, norm_shimei_flat: 0, norm_shimei_per: 0, norm_sales_unit: 10000 };
check("nr1(1-1) 単位＝出勤日数 日・同伴 回（「本」ではない）・指名 回・売上 単位", NORM_PENALTY_UNIT.days === "日" && NORM_PENALTY_UNIT.dohan === "回" && NORM_PENALTY_UNIT.shimei === "回" && NORM_PENALTY_UNIT.sales === "単位");
check("nr1(1-2) 方式の解決＝両方 0 は選んだ方式（既定 定額）・flat>0＝定額・per>0＝不足ごと", axisModeOf(P0, "days", undefined) === "flat" && axisModeOf(P0, "days", "per") === "per" && axisModeOf(P0, "dohan", "per") === "flat" && axisModeOf(P0, "sales", undefined) === "per");
const sw = axisSwitchModeOf(P0, "dohan", "per");
check("nr1(1-3) 切替＝反対側を 0 にして値は引き継ぐ（同伴 定額 3,000→不足ごと 3,000）", sw.norm_dohan_flat === 0 && sw.norm_dohan_per === 3000 && axisSwitchModeOf(sw, "dohan", "flat").norm_dohan_flat === 3000, J(sw));
const am = axisSetAmountOf(P0, "shimei", "per", 1500.7);
check("nr1(1-4) 金額＝方式の側に整数で・反対側 0・負は 0・表示額は方式の側", am.norm_shimei_per === 1500 && am.norm_shimei_flat === 0 && axisSetAmountOf(P0, "days", "flat", -5).norm_days_flat === 0 && axisAmountOf(P0, "sales", "per") === 500 && axisAmountOf(P0, "dohan", "flat") === 3000, J(am));
check("nr1(1-5) 不足 1 単位ごとの語＝「不足 1 回ごと」（同伴・指名）／「不足 1 日ごと」／売上は「不足 10,000 円ごと」（単位 0 は 10,000）", perUnitLabelOf("dohan", 10000) === "不足 1 回ごと" && perUnitLabelOf("shimei", 10000) === "不足 1 回ごと" && perUnitLabelOf("days", 10000) === "不足 1 日ごと" && perUnitLabelOf("sales", 20000) === "不足 20,000 円ごと" && perUnitLabelOf("sales", 0) === "不足 10,000 円ごと");
check("nr1(1-6) 保存の順＝軸→カウント定義→減額・採用した軸だけの列", J(NORM_PANEL_SAVE_ORDER) === J(["set_store_norm_axes", "set_store_norm_config", "set_penalty_config"]) && J(activeAxesOf({ days: true, dohan: false, sales: true, shimei: false })) === J(["days", "sales"]));

// ── (2) A 配線 ──
const nb = src("app/(manage)/master/cast-comp/norma/norma-board.tsx"), np = src("app/(manage)/master/cast-comp/norma/norm-axes-penalty-panel.tsx"), ddb = src("app/(manage)/master/cast-comp/deduction/deduction-board.tsx"), cs = src("app/(manage)/master/cast-comp/comp-sections.tsx"), css = src("app/globals.css");
check("nr1(2-1) norma-board＝パネル 2 つ（NormAxesPenaltyPanel＋「キャスト別の目標」data-norm-panel=targets）・閾値パネル（PenaltyTab）無し・旧 NormConfigPanel 無し・InfoNote の説明",
  nb.includes("<NormAxesPenaltyPanel") && nb.includes('data-norm-panel="targets"') && nb.includes("<h2 style={secTitle}>キャスト別の目標</h2>") && !nb.includes("<PenaltyTab") && !nb.includes("import NormConfigPanel") && !nb.includes("<NormConfigPanel") && !nb.includes("遅刻・当欠の検知（閾値）</h2>") && nb.includes("<InfoNote text=") && !fs.existsSync("app/(manage)/master/norm-config-panel.tsx"));
check("nr1(2-2) 軸と減額パネル＝軸チェックと同じ行（data-norm-axis-row）に SegmentTabs（定額／不足 1 単位ごと）＋金額・採用していない軸は減額なし（「不採用」）・保存 1 つ（3 RPC を順に・引数は全部明示）・説明は InfoNote",
  np.includes('data-norm-panel="axes"') && np.includes("data-norm-axis-row={ax}") && np.includes('options={[["flat", "定額"], ["per", perUnitLabelOf(ax, penalty.norm_sales_unit)]] as const}') && np.includes('"不採用"')
  && np.includes('supabase.rpc("set_store_norm_axes", { p_store_id: storeId, p_axes: normAxesArgsOf(axes) })') && np.includes('supabase.rpc("set_store_norm_config", { p_store_id: storeId, p_sales_enabled: axes.sales, p_shimei_enabled: axes.shimei, p_shimei_scope: shimeiScope })') && np.includes('supabase.rpc("set_penalty_config", penaltyArgsOf(storeId, penalty))')
  && (np.match(/data-norm-save="axes"/g) ?? []).length === 1 && np.includes("<InfoNote text=") && !np.includes("※"));
check("nr1(2-3) 閾値は控除・送りタブ（deduction-board）＝data-penalty-detect-panel・PenaltyTab part=\"detect\"・ひな形への案内（/master/cast-comp/systems#settlement-presets）",
  ddb.includes('data-penalty-detect-panel="1"') && ddb.includes('part="detect"') && ddb.includes('href="/master/cast-comp/systems#settlement-presets"') && ddb.includes(">ひな形を開く</Link>") && ddb.includes("<h2 style={secTitle}>遅刻・当欠の検知（閾値）</h2>"));
check("nr1(2-4) comp-sections＝同伴の単位「回」・NormTab の ※ 注記なし・ラベル「同伴 不足1回につき」", cs.includes('["dohan", "同伴", "norm_dohan_flat", "norm_dohan_per", "回"]') && !cs.includes("※未達の減額（4 軸") && cs.includes('norm_dohan_per: "同伴 不足1回につき"'));
check("nr1(2-5) CSS .nox-normax＝≤430 でセグメント 2 択 50／50・金額欄 100%・保存は中央（flex-direction column・justify-content center）",
  css.includes(".nox-normax-row .nox-normax-seg .nox-segtabs > button { flex: 1 1 50%; min-width: 0; padding: 0 8px; }") && css.includes("@media (max-width: 430px) {\n  .nox-normax-row { grid-template-columns: 1fr; gap: 6px; }") && css.includes(".nox-normax-row .nox-normax-amt .nox-numfield, .nox-normax-row .nox-normax-unit .nox-numfield { flex: 1 1 auto; width: 100%; }") && css.includes(".nox-normax-save { justify-content: center; flex-direction: column; }"));

// ── (3) B 純関数 ──
check("nr1(3-1) cellTextOf(st, closed=true)＝fill closed・中央「定休日」・sub／pending なし・closed=false は従来", J(cellTextOf({ assigned: 3, confirmed: 3, proposed: 0, planned: 0, required: 4 }, true)) === J(CLOSED_CELL_TEXT) && CLOSED_CELL_TEXT.fill === "closed" && CLOSED_CELL_TEXT.center === "定休日" && cellTextOf({ assigned: 4, confirmed: 4, proposed: 0, planned: 0, required: 4 }).fill === "ok");
check("nr1(3-2) FILL_WORD.closed＝定休日・LEGEND_FILL は 4 のまま（凡例の定休日は CalLegend が足す）", FILL_WORD.closed === "定休日" && LEGEND_FILL.length === 4);
const cc = src("components/nox/shift-cal-cell.tsx");
check("nr1(3-3) CalCell＝closed prop→cellTextOf(stat, closed)・data-cal-closed・凡例に「定休日（対象外）」・CSS fill-closed（グレー・バッジ非表示）", cc.includes("closed?: boolean") && cc.includes("cellTextOf(stat, closed === true)") && cc.includes('data-cal-closed={closed ? "1" : undefined}') && cc.includes('["closed", "定休日（対象外）"] as const') && css.includes(".nox-cald.nox-cald2.fill-closed { background: var(--cal-closed-bg); color: var(--cal-closed-fg);") && css.includes(".nox-cald.nox-cald2.fill-closed .nox-cald-bd { visibility: hidden; }") && css.includes("--cal-closed-bg: #3b3b46; --cal-closed-fg: #d7d7df;"));
// コントラスト（E-23 追補1）
const lum = (hex: string) => { const c = hex.replace("#", ""); const f = (i: number) => { const v = parseInt(c.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4); };
const cr = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
check("nr1(3-4) 定休日の地色×文字のコントラスト 3 以上", cr("#3b3b46", "#d7d7df") >= 3, String(Math.round(cr("#3b3b46", "#d7d7df") * 10) / 10));

// ── (4) B 配線 ──
const sb = src("app/(manage)/shift/shift-board.tsx"), seed = src("lib/nox/demo/seed.ts");
check("nr1(4-1) shift-board＝closedDows（bhRows.is_closed）／isClosedDay・CalCell に closed・スタッフ別の列 data-staff-closed", sb.includes("const closedDows = new Set(bhRows.filter((r) => r.is_closed).map((r) => r.dow));") && sb.includes("const isClosedDay = (ymd: string) => closedDows.has(dowOf(ymd));") && sb.includes("closed={isClosedDay(ymd)}") && (sb.match(/data-staff-closed=\{isClosedDay\(d\) \? "1" : undefined\}/g) ?? []).length === 2);
check("nr1(4-2) dayStat＝定休日は required 0・shortage 0（不足日から除外）／予想人件費は定休日を continue", sb.includes('if (isClosedDay(ymd)) return { assigned: list.length, confirmed, proposed, planned: list.length - confirmed - proposed, required: 0, shortage: 0, over: 0, fill: "none" as const };') && sb.includes("if (closedDows.has(dowOf(date))) continue;"));
check("nr1(4-3) 必要人数＝定休日の曜日は「定休日（必要人数 0・入力不可）」（data-need-closed）・入力欄なし・saveNeed のガード", sb.includes("data-need-closed={dow}") && sb.includes("{!closedDow && bs.map((n) => (") && sb.includes("if (closedDows.has(dow) && required > 0) { setMsg("));
check("nr1(4-4) 既にある定休日の行＝赤バッジ「定休日」（確定表・承認待ち）＋案内（data-closed-shift-note）・自動削除なし（removeShift は店長の操作）", sb.includes('data-closed-shift-note="1"') && (sb.match(/>定休日<\/span>/g) ?? []).length >= 2 && !sb.includes("auto-remove"));
check("nr1(4-5) seed.ts＝reset 後処理 demoDropClosedDayShifts（store_business_hours.is_closed→shifts／shift_wishes を削除・closedDays を返す・失敗しても reset は止めない）", seed.includes("export async function demoDropClosedDayShifts(") && seed.includes("out.closedDays = await demoDropClosedDayShifts(admin, orgId).catch(") && seed.includes('for (const t of ["shifts", "shift_wishes"] as const)') && seed.includes('.eq("is_closed", true)'));
check("nr1(4-6) 新規配置・希望のブロックは従来どおり（UI の shiftHoursStatus closed＋RPC 'closed day'）", sb.includes('shiftHoursStatus(adjTarget.date, st, en, bhRows).status === "closed"') && sb.includes('if (msg.includes("closed day")) return "選択された日は定休日です";'));

if (fails.length) { console.error(`verify:nox-nr1 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-nr1 OK ${pass} checks（A ノルマ 4 軸＝軸と減額／キャスト別の目標・閾値は控除・送りへ／B 定休日＝カレンダー・必要人数・人件費・案内・reset 後処理）`);
