/*
 * verify:nox-x13h — 便 X13-H（2026-10-21）。DB は SELECT のみ（H-9 の境界を本物の Postgres で確かめる）。
 *   H-9 暦月の日付（lib/nox/month＝その月の日数で末日・「-31」固定の撤去・30 日／28 日／31 日の月）
 *   H-8 判定タイミングの一本化（計算＝プランの slide_apply だけ・文言＝判定期間とタイミング・根拠 1 行・3 か所）
 *   H-7 報酬の軸（裁定412・6 店の sys_* が表示→保存の往復で不変・MUSE は売上軸）
 *   H-10 デモ在庫（期首在庫・マイナスなし・在庫少 1 品）／H-6 顧客の概要ポップアップの枠ボタン
 */
import fs from "node:fs";
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { daysInMonthOf, monthLastDayOf, monthAfterOf, monthRangeOf } from "../lib/nox/month";
import { currentWageOf, slideJudgeLabelOf, wageBasisLineOf } from "../lib/nox/cast/current-wage";
import { rewardAxisOf, rewardAxisPatchOf, axisSlideOnOf, axisSwitchLockOf, backsUsageOf, SECTION_KEYS, SYSTEM_KEYS } from "../lib/nox/store-systems";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(`${d}/${e.name}`)) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : []));

async function main() {
  // ── H-9
  check("x13h(1-1) month: 2026-11＝30 日・2026-02＝28 日・2028-02＝29 日・2026-10＝31 日・末日／翌月／範囲",
    daysInMonthOf("2026-11") === 30 && daysInMonthOf("2026-02") === 28 && daysInMonthOf("2028-02") === 29 && daysInMonthOf("2026-10") === 31
    && monthLastDayOf("2026-11") === "2026-11-30" && monthAfterOf("2026-12") === "2027-01" && JSON.stringify(monthRangeOf("2026-02")) === JSON.stringify({ from: "2026-02-01", to: "2026-02-28", next: "2026-03-01" }));
  const files = [...walk("app"), ...walk("components"), ...walk("lib")];
  const code = (f: string) => src(f).split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n"); // 注記（コメント）は除く
  const bad31 = files.filter((f) => /-31`\)|\$\{[a-z]+\}-31`/.test(code(f)));
  const zeroDay = files.filter((f) => f !== "lib/nox/month.ts" && /new Date\((Date\.UTC\()?[a-z]+, [a-z]+(\s*\+\s*1)?, 0\)/.test(code(f)));
  check("x13h(1-2) app／components／lib に「-31」固定の末日と「翌月 0 日」の組み立てが残っていない（lib/nox/month に寄せた）", bad31.length === 0 && zeroDay.length === 0, JSON.stringify({ bad31, zeroDay }));
  check("x13h(1-3) ダッシュボードと月次レポートの末日＝monthLastDayOf", src("app/(manage)/dashboard/dashboard-board.tsx").includes('.lte("biz_date", monthLastDayOf(month))') && src("app/(manage)/report/month-report.tsx").includes('.lte("biz_date", monthLastDayOf(py))'));
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await db.connect();
  try {
    const st = (await db.query("select s.id from public.stores s join public.orgs o on o.id = s.org_id where o.name = 'NOX-DEMO-ACE' limit 1")).rows[0]?.id as string | undefined;
    const q = (from: string, to: string) => db.query("select count(*)::int n, coalesce(sum(cash + card_gross + uri + other), 0)::bigint s from public.daily_reports where store_id = $1 and biz_date >= $2::date and biz_date <= $3::date", [st, from, to]);
    let oldErr = "";
    try { await q("2026-11-01", "2026-11-31"); } catch (e) { oldErr = (e as { code?: string }).code ?? "err"; }
    const r11 = await q("2026-11-01", monthLastDayOf("2026-11")), r02 = await q("2026-02-01", monthLastDayOf("2026-02"));
    const o10 = await q("2026-10-01", "2026-10-31"), n10 = await q("2026-10-01", monthLastDayOf("2026-10"));
    check("x13h(1-4) 本物の Postgres: 旧「2026-11-31」は 22008（集計が 0 件に落ちる原因）・新しい末日は 11 月／2 月ともエラーなし・10 月は旧と同じ件数・金額",
      !!st && oldErr === "22008" && Number.isInteger(r11.rows[0].n) && Number.isInteger(r02.rows[0].n) && o10.rows[0].n === n10.rows[0].n && String(o10.rows[0].s) === String(n10.rows[0].s),
      JSON.stringify({ st, oldErr, r11: r11.rows[0], r02: r02.rows[0], o10: o10.rows[0], n10: n10.rows[0] }));
  } finally { await db.end(); }

  // ── H-8
  const co = src("lib/nox/payroll/collect.ts"), pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx");
  check("x13h(2-1) 計算の判定タイミング＝プランの slide_apply だけ（null＝当期の累計）・店の slide_apply を読まない・詳細設定から「店の設定に従う」を撤去・初期設定の新規プラン＝前期の実績",
    co.includes('return (cpx ? slideApplyByPlan.get(cpx.planId) : undefined) ?? "current"; };') && !co.includes('win.slideApply === "next" ? "next" : "current"')
    && pe.includes('const effApply: "next" | "current" = draft.slideApply ?? "current";') && !pe.includes("店の設定に従う（いまは")
    && src("lib/nox/setup/template-plan.ts").includes('p_slide_apply: "next" } });'));
  check("x13h(2-2) 文言＝判定期間とタイミングをそのまま（月次・前月の累計／日次・当日までの累計／半月・前の半月の累計）",
    slideJudgeLabelOf("monthly", "next") === "月次・前月の累計で判定" && slideJudgeLabelOf("daily", "current") === "日次・当日までの累計で判定"
    && slideJudgeLabelOf("half", "next") === "半月・前の半月の累計で判定" && slideJudgeLabelOf("monthly", "current") === "月次・当月の累計で判定");
  const slides = { salesSlide: [{ at: 1000000, wage: 3000 }, { at: 1500000, wage: 3500 }], pointSlide: [] };
  const payNext = { wdays: [{ hourly: 3000, basis: "売上", sales: 50000 }], slideBasis: { apply: "monthly", months: [{ month: "2026-10", sales: 1230000, pts: 0 }] }, eplan: slides };
  const payLow = { wdays: [{ hourly: 2500, basis: "保証", sales: 1000 }], slideBasis: { apply: "monthly", months: [{ month: "2026-10", sales: 400000, pts: 0 }] }, eplan: slides };
  check("x13h(2-3) 根拠 1 行＝「前月売上 ¥1,230,000（按分後）→ 1 段」・段に届かない＝「段なし（基本時給）」・段の無いプランは出さない・タイミングを変えると文言と根拠が一緒に変わる",
    wageBasisLineOf(payNext, "monthly", "next") === "前月売上 ¥1,230,000（按分後）→ 1 段" && wageBasisLineOf(payLow, "monthly", "next") === "前月売上 ¥400,000（按分後）→ 段なし（基本時給）"
    && wageBasisLineOf({ wdays: [], eplan: { salesSlide: [], pointSlide: [] } }, "daily", "current") === null
    && wageBasisLineOf(payNext, "monthly", "current") === "当月累計の売上 ¥1,230,000（按分後）→ 1 段"
    && currentWageOf(payNext, { today: "2026-10-21", slidePeriod: "monthly", slideApply: "next" }).periodLabel === "月次・前月の累計で判定"
    && currentWageOf(payNext, { today: "2026-10-21", slidePeriod: "monthly", slideApply: null }).periodLabel === "月次・当月の累計で判定");
  const cb = src("app/(manage)/casts/casts-board.tsx"), mine = src("app/mine/page.tsx");
  check("x13h(2-4) 3 か所＝一覧カード・詳細（プランの slide_apply を渡す・根拠 1 行）と /mine（同じ core＝computePayrollDraft→currentWageOf）",
    cb.includes("slideApply: pl?.slide_apply ?? null") && cb.includes("...({ slide_period: r.slide_period ?? null, slide_apply: r.slide_apply ?? null } as object)") && cb.includes("slide_period, slide_apply\")") && (cb.match(/data-wage-basis="1"/g) ?? []).length === 2
    && mine.includes("mineCurrentWageOf(supabase,") && mine.includes('data-mine-wage="1"') && src("lib/nox/mine/wage-server.ts").includes("computePayrollDraft(admin, castSession, storeId, period, { previewDefaults: true })"));

  // ── H-7
  const P = ["muse", "luna", "noir", "ace", "lily", "nest"].map((c) => [c, JSON.parse(src(`docs/demo/payload/${c}.json`)).tables.stores[0].settings_json as Record<string, unknown>] as const);
  const trip = P.map(([c, sj]) => { const axis = rewardAxisOf(sj); const after = { ...sj, ...rewardAxisPatchOf(axis, axisSlideOnOf(sj)) }; return { c, axis, same: SYSTEM_KEYS.every((k) => (after[k] !== false) === (sj[k] !== false)) }; });
  check("x13h(3-1) 6 店の sys_* が表示（軸・スライド）→保存の往復で不変・軸＝MUSE／LUNA／ACE／LILY／NEST 売上・NOIR pt",
    trip.every((r) => r.same) && JSON.stringify(trip.map((r) => `${r.c}:${r.axis}`)) === JSON.stringify(["muse:sales", "luna:sales", "noir:pts", "ace:sales", "lily:sales", "nest:sales"]), JSON.stringify(trip));
  check("x13h(3-2) 軸の切替の抑止（相手の軸に個別設定）・各種バックの使用中＝バック＋旧売上歩合・売上歩合は表示の出し分けに使わない",
    axisSwitchLockOf("sales", { sys_points: 1 }) === 1 && axisSwitchLockOf("pts", { sys_sales_slide: 2 }) === 2 && axisSwitchLockOf("pts", {}) === 0 && backsUsageOf({ sys_backs: 2, sys_sales_rate: 1 }) === 3
    && !Object.values(SECTION_KEYS).some((ks) => (ks as readonly string[]).includes("sys_sales_rate")));
  const panel = src("components/nox/store-systems-panel.tsx");
  check("x13h(3-3) 利用機能＝報酬の軸ラジオ＋各種バック／スライドの 2 行・売上歩合の独立行なし・複数キーは 1 回の set_store_profile",
    panel.includes('role="radiogroup" aria-label="報酬の軸"') && panel.includes("REWARD_AXIS_KEYS.includes(k) ? [] : [k]") && src("app/(manage)/master/cast-comp/systems/systems-board.tsx").includes("p_patch: patch"));

  // ── H-10
  const inv = ["muse", "luna", "noir", "ace", "lily", "nest"].map((c) => {
    const T = JSON.parse(src(`docs/demo/payload/${c}.json`)).tables as Record<string, Record<string, unknown>[]>;
    const bal: Record<string, number> = {}, sold: Record<string, number> = {};
    for (const l of T.stock_logs ?? []) bal[l.product_id as string] = (bal[l.product_id as string] ?? 0) + Number(l.delta);
    for (const l of T.check_lines ?? []) if (l.product_id) sold[l.product_id as string] = (sold[l.product_id as string] ?? 0) + Number(l.qty ?? 0);
    const tr = (T.products ?? []).filter((p) => p.track_stock !== false);
    return { c, nonPos: tr.filter((p) => (bal[p.id as string] ?? 0) <= 0).length, short: tr.filter((p) => (bal[p.id as string] ?? 0) < (sold[p.id as string] ?? 0)).length,
      low: tr.filter((p) => p.reorder_point != null && (bal[p.id as string] ?? 0) > 0 && (bal[p.id as string] ?? 0) <= Number(p.reorder_point)).length };
  });
  check("x13h(4-1) デモ在庫＝在庫を追う商品の残が 0 以下なし・伝票の数量を引いても残る・在庫少は 1 品（LILY は販売 0 の商品が無く 0 品）",
    inv.every((r) => r.nonPos === 0 && r.short === 0) && inv.filter((r) => r.c !== "lily").every((r) => r.low === 1) && inv.find((r) => r.c === "lily")?.low === 0, JSON.stringify(inv));
  // ── H-6
  const cu = src("app/(manage)/customers/customers-board.tsx");
  check("x13h(5-1) 顧客の概要ポップアップ＝「詳細・編集を開く」は枠ボタン（48px）・下部中央・テキストリンク（›）なし",
    cu.includes('data-cust-open="1" style={{ display: "flex", justifyContent: "center", marginTop: 14 }}') && cu.includes("...t.btnSecondary48") && !cu.includes("詳細・編集を開く ›"));

  // ── H-11
  check("x13h(6-1) 本入店日＝登録モーダルに入店日（必須・既定＝今日）→ cast_create の直後に set_cast_profile・詳細の本入店日に「編集」・本採用で空なら当日",
    cb.includes('data-joined-on="1"') && cb.includes('if (!fixedKind && !withTrialFields && !joinedOn) { setErr("入店日を入力してください"); return; }') && cb.includes('supabase.rpc("set_cast_profile", { p_cast_id: c.data as string')
    && cb.includes('data-joined-row="1"') && cb.includes("if (!c.joined_on) {") && cb.includes('supabase.rpc("set_cast_profile", { p_cast_id: c.id, p_name: c.name, p_joined_on: today })'));
  const noJoin = ["muse", "luna", "noir", "ace", "lily", "nest"].flatMap((c) => (JSON.parse(src(`docs/demo/payload/${c}.json`)).tables.casts as { name: string; kind: string; joined_on: unknown }[]).filter((x) => !x.joined_on).map((x) => `${c}:${x.name}:${x.kind}`));
  check("x13h(6-2) デモ＝本入店日が空なのは体入だけ（ACE るな）", noJoin.length > 0 && noJoin.every((x) => x.endsWith(":体入")) && noJoin.includes("ace:るな:体入"), JSON.stringify(noJoin));
  // ── H-12
  const { staffPayOf, staffContractLineOf } = await import("../lib/nox/staff/pay");
  const days7 = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(14 + i)}`, minutes: 480, open: false }));
  const pt = staffPayOf({ membership_id: "m", contract_kind: "parttime", hourly: 1400, fixed_allowance: 0, tax_class: "甲", withholding_rate: 0 } as never, days7 as never);
  const ct = staffPayOf({ membership_id: "m", contract_kind: "contractor", hourly: 2000, fixed_allowance: 0, tax_class: null, withholding_rate: 0 } as never, days7 as never);
  const swp = src("app/(manage)/staff/staff-work-panel.tsx"), sb = src("app/(manage)/staff/staff-board.tsx");
  check("x13h(7-1) スタッフ＝雇用は時給×実働（1,400×56h＝78,400）・委託は源泉 10.21%（率 0 の契約も）・月給の表示・文言から「準備中／税理士／次のデータ更新」を撤去・保存しない契約区分の入力を撤去",
    pt.gross === 78400 && pt.withholding === 0 && ct.gross === 112000 && ct.withholding === Math.floor(112000 * 10.21 / 100) && ct.withholdingNote === "委託（10.21%）"
    && staffContractLineOf({ membership_id: "m", contract_kind: "employee", hourly: 0, fixed_allowance: 300000, tax_class: "甲", withholding_rate: 0 } as never) === "正社員・月給 ¥300,000"
    && !/準備中|税理士|次のデータ更新/.test(swp + sb + src("app/(manage)/staff/page.tsx") + src("lib/nox/staff/pay.ts").replace(/\/\/.*$/gm, "")) && swp.includes("<span style={t.sub}>契約未登録</span>")
    && !sb.includes('ariaLabel="契約区分"') && sb.includes('data-staff-after="1"'));
  const st6 = ["muse", "luna", "noir", "ace", "lily", "nest"].map((c) => { const T = JSON.parse(src(`docs/demo/payload/${c}.json`)).tables; return { c, sc: (T.staff_contracts ?? []).length, sp: (T.staff_punches ?? []).length }; });
  check("x13h(7-2) デモ＝6 店ともスタッフ 2 名の契約と 7 日×2 名の打刻（28 行）", st6.every((r) => r.sc === 2 && r.sp === 28), JSON.stringify(st6));

  // ── H-14
  const rbd = src("app/(manage)/register/register-board.tsx");
  check("x13h(8-1) 入金の上の枠＝カード（加算あり）だけ「カードでのお支払額 ¥n（残額 ¥a＋手数料 ¥b）」・均等割りは「1 人分 ¥n（手数料込み）」・旧の手数料行は撤去",
    rbd.includes('data-pay-card-total="1"') && rbd.includes("カードでのお支払額 {yen(grossDefault)}（残額 {yen(balance)}＋手数料 {yen(grossDefault - balance)}）") && rbd.includes("1 人分 {yen(grossN)}（手数料込み）")
    && rbd.includes("{grossMode && balance > 0 && (") && !rbd.includes('data-pay-fee-line="1"'));
  // ── H-15／H-16（裁定410）
  const { DEFAULT_SETTLEMENT_PRESETS, SELECTABLE_TARGETS, penaltyAmountErrOf, penaltyArgsOf } = await import("../lib/nox/payroll/settlement");
  const pe2 = src("components/nox/settlement-presets-editor.tsx"), nb = src("app/(manage)/master/cast-comp/deduction/deduction-board.tsx"); // ★便 NR-1: 閾値パネル（ひな形を開く）は控除・送りタブへ
  check("x13h(9-1) ひな形＝既定 2 件（遅刻・当欠）・早退は選択肢から外す・「既定の 2 件に戻す」・閾値パネルから「ひな形を開く」（金額欄なし）",
    DEFAULT_SETTLEMENT_PRESETS.map((p) => p.target).join(",") === "late,absent" && !SELECTABLE_TARGETS.includes("early") && pe2.includes(">既定の 2 件に戻す</button>") && pe2.includes("早退は罰金の対象外です")
    && nb.includes('href="/master/cast-comp/systems#settlement-presets"') && nb.includes(">ひな形を開く</Link>") && src("app/(manage)/master/cast-comp/systems/systems-board.tsx").includes('id="settlement-presets"'));
  const late = { code: "late", name: "遅刻", amount: 2000, basis: "契約書の遅刻精算条項に基づく減額", target: "late" as const };
  const a1 = penaltyArgsOf({ runId: "r", castId: "c", preset: late, amount: 2000, biz: "2026-10-21", shiftId: "s", reason: "" });
  const a2 = penaltyArgsOf({ runId: "r", castId: "c", preset: late, amount: 1000, biz: "2026-10-21", shiftId: "s", reason: "事前連絡" });
  check("x13h(9-2) 罰金＝既定額で行（source settlement・シフト参照・根拠の文）・減額は理由必須・増額不可・0 円可（既定 0 の店）",
    a1.ok && a1.args.p_amount === 2000 && a1.args.p_source === "settlement" && a1.args.p_target_shift_id === "s" && a1.args.p_reason === "精算調整（遅刻 10/21）"
    && a2.ok && a2.args.p_reason === "精算調整（遅刻 10/21）・事前連絡" && penaltyAmountErrOf(2000, 1000, "") !== null && penaltyAmountErrOf(2000, 3000, "x") !== null && penaltyAmountErrOf(0, 0, "") === null);
  const sbd = src("app/(manage)/shift/shift-board.tsx"), pdl = src("components/nox/penalty-dialog.tsx");
  check("x13h(9-3) 今日タブで遅刻／当欠を記録→委託にだけ罰金ダイアログ（雇用・精算調整 OFF・当日以外は出さない）・同じシフトの二重を出さない・2 ボタン",
    sbd.includes(`if (!error && (status === "late" || status === "absent") && penaltiesOn && attDate === todayDate && casts.find((c) => c.id === castId)?.employment !== "雇用") {`)
    && pdl.includes('.eq("target_shift_id", shiftId).eq("source", "settlement")') && pdl.includes('data-penalty-existing="1"') && pdl.includes(">罰金を確定") === false && pdl.includes('"罰金を確定"') && pdl.includes('"罰金なしで記録"'));
  // ── H-17
  const { castReportOf, castReportLineOf, keepReportArgsOf, mineReportStateOf } = await import("../lib/nox/shift/cast-report");
  const self = { cast_id: "c", date: "2026-10-21", status: "late", eta: "21:30", reason: "電車遅延", source: "self", updated_at: "2026-10-21T06:42:00Z" };
  const rp = castReportOf(self);
  check("x13h(10-1) 連絡＝attendance の本人行（source self）→今日タブの 1 行「遅刻の連絡 15:42・見込み 21:30『電車遅延』」・記録で見込みと理由を残す・/mine の状態が「店が遅刻として記録」へ",
    !!rp && castReportLineOf(rp) === "遅刻の連絡 15:42・見込み 21:30『電車遅延』" && JSON.stringify(keepReportArgsOf(self, "late")) === JSON.stringify({ p_eta: "21:30", p_reason: "電車遅延" })
    && castReportOf({ ...self, source: "manager" }) === null && mineReportStateOf(self) === "遅刻の連絡は店に届きました（店の確認待ち）" /* ★便 ON-3（0176 ★3 I-4）: 「記録待ち」→「確認待ち」（確認済み＝ack_at で「店が確認しました」） */ && mineReportStateOf({ ...self, source: "manager" }) === "店が遅刻として記録しました"
    && sbd.includes("data-report-chip={n}") && sbd.includes('data-report-rec="late"') && sbd.includes("const keep = keepReportArgsOf(attOf(castId, attDate), status);") && sbd.includes("p_cast_id: castId, p_date: attDate, p_status: status, ...keep,") /* ★便 ON-3: keep を変数に（履歴 attendance_contact_log にも渡す） */ && src("app/mine/attendance-form.tsx").includes('"店に届きました"'));

  if (fails.length) { console.log(`✗ verify:nox-x13h 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.log(` - ${f}`); process.exit(1); }
  console.log(`verify:nox-x13h OK (${pass} checks)`);
  console.log("便 X13-H: 30 日月の日付・判定タイミングの一本化と根拠・報酬の軸・デモ在庫・顧客ポップアップ");
}
main().catch((e) => { console.error(e); process.exit(1); });
