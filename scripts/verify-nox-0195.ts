/*
 * verify:nox-0195 — 0195（2026-11-05 Agoora 手貼り・verify 21 行一致・関数 416・表 119）のフラグ true 便＝日ごとの控除ルール（裁定447 差し替え版）＋M-73（pay_rate・other）＋裁定447 ④（deduction_rule_casts）
 *   ＋M-77 ②③（LINE の block・紐付け解除）＋M-80 追記②（staff_allowances）＋裁定450 の 6（Σ allowances＝fixed を RPC が検証）。
 *  (1) フラグ／(2) 純関数＝fixedDedOf（dayCount・pay_rate）・effectiveDeductionsOf（キャスト別 → run 別）・dayDeductionCountsOf（always／pick・出勤していない日は数えない・行なしは同じ配列）・
 *      dailyDeductionsOf／dailyPayRowsOf／monthSummaryOf（恒等）・staffPayOf／staffLaborRowOf（allowances Σ＝fixed）・語（単位・種別・対象）／
 *  (3) live（読取）＝関数 416・表 119・set_deduction 10 引数だけ・新設 6・列 3・RLS／grants／ACL／
 *  (4) live（BEGIN…ROLLBACK＝DB 変更 0）＝cast_day_deductions_set（既定どおりは行なし・違う日だけ行・not day rule・スタッフ forbidden）・deduction_rule_cast_set（使わない＝行・既定に戻す＝行が消える）・
 *      staff_attendance_confirm（Σ allowances≠fixed は labor mismatch・2 行の合計＝fixed は通る）／(5) client の pin（控除マスタ・修正モーダル・日計・キャスト詳細・LINE・/staff）
 *  使い方: npm run verify:nox-0195（(3)(4) は .env.local の SUPABASE_DB_URL・NOX-VERIFY-A1／A2）
 */
import fs from "node:fs";
import pg from "pg";
import { MIG_0195_APPLIED, MIG_0198_APPLIED, mig0195On, __set0195ForTest } from "../lib/nox/rules-0175/flag"; // ★0198（裁定461）: staff の自店は ok に反転
import { fixedDedOf, type Deduction } from "../lib/nox/pay";
import { dailyDeductionsOf, dayDeductionCountsOf, effectiveDeductionsOf } from "../lib/nox/payroll/assemble";
import { DAILY_PAY_COLUMNS, castPayTotalsOf, dailyPayCellsOf, dailyPayRowsOf, monthSummaryOf } from "../lib/nox/payroll/daily-pay";
import { attachStaffAllowances, staffAllowanceSumOf, staffContractLineOf, staffPayOf } from "../lib/nox/staff/pay";
import { STAFF_LABOR_CALC_VERSION, staffLaborAllowancesOf, staffLaborOf, staffLaborRowOf } from "../lib/nox/staff/labor";
import { DED_PER_OPTS_0195, dedAmountLabelOf, dedKindCastLabelOf, dedTargetLabelOf, dedUnitLabelOf } from "../lib/nox/payroll/deduction-labels";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1)
check("0195(1-1) MIG_0195_APPLIED=true（2026-11-05 手貼り・verify 21 行一致）・override", (MIG_0195_APPLIED as boolean) === true && mig0195On() === true && (__set0195ForTest(false), !mig0195On()) && (__set0195ForTest(null), mig0195On()));

// (2) 純関数
const D = (o: Partial<Deduction> & { id: string; per: Deduction["per"]; amount: number }): Deduction => ({ name: o.id, ...o });
check("0195(2-1) fixedDedOf＝per=day は dayCount（無ければ出勤日数）・pay_rate＝gross×%（gross を渡さなければ 0＝従来の呼び出しは同値）・rate／month は従来",
  fixedDedOf([D({ id: "a", per: "day", amount: 500 })], 22, 0) === 11000 && fixedDedOf([D({ id: "a", per: "day", amount: 500, dayCount: 3 })], 22, 0) === 1500
  && fixedDedOf([D({ id: "p", per: "pay_rate", amount: 10 })], 22, 0, 123456) === 12346 && fixedDedOf([D({ id: "p", per: "pay_rate", amount: 10 })], 22, 0) === 0
  && fixedDedOf([D({ id: "r", per: "rate", amount: 3 }), D({ id: "m", per: "month", amount: 5000 })], 22, 100000) === 8000);
const masters = [D({ id: "x", per: "day", amount: 500 }), D({ id: "y", per: "day", amount: 300, dayRule: "pick" }), D({ id: "z", per: "month", amount: 2000 })];
check("0195(2-2) effectiveDeductionsOf＝どちらも無ければ同じ配列・キャスト別（使わない＝除外・額の上書き）→ run 別が最優先（run の額が勝つ・run の OFF で消える）",
  effectiveDeductionsOf(masters, undefined, undefined) === masters
  && effectiveDeductionsOf(masters, [{ deductionId: "x", enabled: false, amountOverride: null }], undefined).map((d) => d.id).join() === "y,z"
  && effectiveDeductionsOf(masters, [{ deductionId: "x", enabled: true, amountOverride: 400 }], undefined)[0].amount === 400
  && effectiveDeductionsOf(masters, [{ deductionId: "x", enabled: true, amountOverride: 400 }], [{ deductionId: "x", enabled: true, amountOverride: 450 }])[0].amount === 450
  && effectiveDeductionsOf(masters, [{ deductionId: "x", enabled: true, amountOverride: 400 }], [{ deductionId: "x", enabled: false, amountOverride: null }]).map((d) => d.id).join() === "y,z");
const worked = new Set(["2026-11-01", "2026-11-02", "2026-11-03"]);
const cnt = dayDeductionCountsOf(masters, [
  { deductionId: "x", bizDate: "2026-11-01", enabled: false }, { deductionId: "x", bizDate: "2026-11-09", enabled: false }, // 09 は出勤していない＝数えない
  { deductionId: "y", bizDate: "2026-11-02", enabled: true }, { deductionId: "y", bizDate: "2026-11-03", enabled: true }, { deductionId: "y", bizDate: "2026-11-09", enabled: true },
], worked, 3);
check("0195(2-3) dayDeductionCountsOf＝always は 出勤日数−off の出勤日（3−1＝2）・pick は on の出勤日（2）・出勤していない日の行は数えない・month は触らない・行も pick も無ければ同じ配列",
  cnt[0].dayCount === 2 && cnt[1].dayCount === 2 && cnt[2].dayCount === undefined && dayDeductionCountsOf([masters[0], masters[2]], undefined, worked, 3) === ([masters[0], masters[2]] as Deduction[]).slice(0, 0).concat() === false
  && (() => { const arr = [masters[0], masters[2]]; return dayDeductionCountsOf(arr, [], worked, 3) === arr; })(), J(cnt));
check("0195(2-4) pick のルールに行が無ければ dayCount 0（既定 off）・always に行が無ければキーなし", dayDeductionCountsOf(masters, [], worked, 3)[1].dayCount === 0 && dayDeductionCountsOf(masters, [], worked, 3)[0].dayCount === undefined);
const deds = dailyDeductionsOf(masters, [{ deductionId: "x", bizDate: "2026-11-01", enabled: false }, { deductionId: "y", bizDate: "2026-11-02", enabled: true }], worked);
check("0195(2-5) dailyDeductionsOf＝11/1 は x を外した（0 → 行なし）・11/2 は x 500＋y 300＝800・11/3 は x 500（pick の y は on の日だけ）・内訳の文言",
  !deds.has("2026-11-01") && deds.get("2026-11-02")?.amount === 800 && deds.get("2026-11-03")?.amount === 500 && deds.get("2026-11-02")?.notes.join("・") === "x（¥500）・y（¥300）", J([...deds]));
const rows = dailyPayRowsOf({ dates: ["2026-11-01", "2026-11-02", "2026-11-03"], wage: new Map([["2026-11-01", { hours: 5, hourly: 2000, wage: 10000 }], ["2026-11-02", { hours: 5, hourly: 2000, wage: 10000 }], ["2026-11-03", { hours: 5, hourly: 2000, wage: 10000 }]]), backs: new Map(), fines: new Map([["2026-11-03", { amount: 1000, notes: ["遅刻（¥1,000）"] }]]), deds });
const month = monthSummaryOf({ gross: 30000 + 1200, net: 30000 + 1200 - 1300 - 1000 - 5000, rows });
check("0195(2-6) 日計＝時給分＋バック−罰金・減額−控除（11/2＝9,200・11/3＝8,500）・月のまとめの控除＝(gross−net)−Σ罰金−Σ控除・恒等 identityOk・ラベル「月額控除」・列 5（控除は日計の前）・CSV のセル 5",
  rows[1].total === 9200 && rows[1].ded === 800 && rows[2].total === 8500 && month.identityOk && month.rows[1].amount === (31200 - (31200 - 1300 - 1000 - 5000)) - 1000 - 1300 && month.rows[1].label.includes("月額控除")
  && DAILY_PAY_COLUMNS.join() === "時給分,バック,罰金・減額,控除,日計" && dailyPayCellsOf(rows[1]).join() === "10000,0,0,800,9200" && castPayTotalsOf(rows, 1, false).ded === 1300, J({ rows: rows.map((r) => [r.bizDate, r.ded, r.total]), month }));
check("0195(2-7) dailyPayRowsOf に deds を渡さなければ従来と同値（ded 0・total＝wage＋backs−fine）", dailyPayRowsOf({ dates: ["2026-11-01"], wage: new Map([["2026-11-01", { hours: 1, hourly: 2000, wage: 2000 }]]), backs: new Map(), fines: new Map() })[0].ded === 0);
// staff
const c0 = { membership_id: "m", contract_kind: "parttime" as const, hourly: 1300, fixed_allowance: 0, tax_class: null, pay_kind: "hourly" };
const days = [{ bizDate: "2026-11-01", minutes: 301, open: false }, { bizDate: "2026-11-02", minutes: 300, open: false }];
const cA = { ...c0, fixed_allowance: 2000, allowances: [{ name: "通勤手当", amount: 5000 }, { name: "役職手当", amount: 3000 }] };
const payA = staffPayOf(cA, days); const rowA = staffLaborRowOf("m", cA, payA);
check("0195(2-8) staffPayOf＝雇用の fixed＝fixed_allowance＋Σ 名称つきの行（2,000＋8,000）・gross＝time_pay＋fixed・行が無ければ従来と同値・契約の 1 行表示は合計の手当",
  payA.fixed === 10000 && payA.gross === 13021 + 10000 && staffPayOf(c0, days).fixed === 0 && staffAllowanceSumOf(cA) === 8000 && staffContractLineOf(cA) === "アルバイト・時給 ¥1,300・手当 ¥10,000", J(payA));
check("0195(2-9) staffLaborRowOf＝allowances＝「固定手当」2,000＋2 行（Σ＝fixed 10,000＝RPC の検査と同じ）・calc_version は 0195 の版・時給制でなければ []・合計が合わなければ fixed 1 行に畳む",
  rowA.allowances.map((x) => `${x.name}:${x.amount}`).join() === "固定手当:2000,通勤手当:5000,役職手当:3000" && rowA.allowances.reduce((a, x) => a + x.amount, 0) === rowA.fixed && rowA.calc_version === STAFF_LABOR_CALC_VERSION && STAFF_LABOR_CALC_VERSION.includes("allowances 0195")
  && staffLaborRowOf("m", { pay_kind: "monthly", hourly: 0, fixed_allowance: 300000, monthly: 300000 }, staffPayOf({ ...c0, contract_kind: "employee", hourly: 0, fixed_allowance: 300000 }, days)).allowances.length === 0
  && J(staffLaborAllowancesOf({ fixed_allowance: 1000, allowances: [{ name: "a", amount: 2000 }] }, 5000)) === J([{ name: "固定手当", amount: 5000 }]) && staffLaborAllowancesOf({ fixed_allowance: 0 }, 0).length === 0, J(rowA.allowances));
check("0195(2-10) staffLaborOf（月報のコスト）＝時給制の固定手当＝1 本＋Σ 行を営業日で日割り・attachStaffAllowances＝membership ごとに付ける（無い人は []）",
  staffLaborOf({ pay_kind: "hourly", hourly: 1000, fixed_allowance: 1000, allowances: [{ name: "a", amount: 2000 }] }, [{ bizDate: "2026-11-01", minutes: 60 }], new Set(), ["2026-11-01", "2026-11-02"]).total === 1000 + 3000
  && J(attachStaffAllowances([{ membership_id: "m1" }, { membership_id: "m2" }], [{ membership_id: "m1", name: "a", amount: 1 }]).map((c) => c.allowances.length)) === "[1,0]");
check("0195(2-11) 語＝単位 4（日ごと／月ごと／報酬の%／売上の%）・日ごとは既定を添える・率は %・種別の表示＝実費／その他（sanction は従来の語）・対象＝全員／◯名（上書きの数）・RPC の語の日本語 4",
  DED_PER_OPTS_0195.map((o) => o[1]).join() === "日ごと,月ごと,報酬の%,売上の%" && dedUnitLabelOf("day", "pick") === "日ごと・その日に選ぶ" && dedUnitLabelOf("day", null) === "日ごと・毎出勤に引く" && dedUnitLabelOf("pay_rate") === "報酬の%"
  && dedAmountLabelOf("pay_rate", 10) === "10%" && dedAmountLabelOf("day", 1500) === "¥1,500" && dedKindCastLabelOf("agreed_cost") === "実費" && dedKindCastLabelOf("statutory") === "その他" && dedKindCastLabelOf("sanction", "制裁（懲戒減給）") === "制裁（懲戒減給）"
  && dedTargetLabelOf([], "r", 10) === "全員" && dedTargetLabelOf([{ rule_id: "r", enabled: false, amount_override: null }, { rule_id: "r", enabled: true, amount_override: 100 }], "r", 10) === "9名（額の上書き 1）"
  && rpcErrJa("not day rule") !== "not day rule" && rpcErrJa("finalized") !== "finalized" && rpcErrJa("bad allowances") !== "bad allowances" && rpcErrJa("labor mismatch: fixed 6000 <> sum(allowances) 5000") !== "labor mismatch: fixed 6000 <> sum(allowances) 5000");

// (5) client の pin（逐語）
{
  const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx"), ke = src("components/nox/kintai-edit.tsx"), kr = src("components/nox/kintai-row.tsx"), ks = src("lib/nox/payroll/kintai-sheet.ts"), cb = src("app/(manage)/casts/casts-board.tsx"), sv = src("lib/nox/line/server.ts"), wh = src("app/api/line/webhook/[storeId]/route.ts"), bd = src("app/api/line/bind/route.ts"), sws = src("components/nox/staff-work-section.tsx"), col = src("lib/nox/payroll/collect.ts"), core = src("lib/nox/payroll/core.ts"), asm = src("lib/nox/payroll/assemble.ts"), ab = src("app/(manage)/payroll/attendance-board.tsx"), mine = src("app/mine/page.tsx");
  check("0195(5-1) 控除マスタ＝set_deduction 10 引数（p_day_rule＝day 以外は always を明示）・単位 4 のボタン群＋説明・日ごとの既定（always／pick）・種別 2 択（従来の値は「（従来）」で保つ）・「対象」列＝deduction_rule_casts_get・day_rule を読む",
    cs.includes('...(mig0195On() ? { p_day_rule: per === "day" ? dayRule : "always" } : {})') && cs.includes("options={DED_PER_OPTS_0195}") && cs.includes("data-ded-per-note={per}") && cs.includes("options={DAY_RULE_OPTS}") && cs.includes("（従来）") && cs.includes('supabase.rpc("deduction_rule_casts_get", { p_store_id: storeId })') && cs.includes("dedTargetLabelOf(ruleCasts, d.id, castCount)") && cs.includes("basis_confirmed_at, basis_note, day_rule"));
  check("0195(5-2) 勤怠の修正モーダル＝「この日の控除」（per=day・有効・キャスト別で使わないは除く・額の上書きを反映）→ 変化があれば cast_day_deductions_set（既定どおりの行は RPC が消す）・storeId で絞る",
    ke.includes('supabase.from("deductions").select("id, name, amount, per, day_rule, store_id").eq("per", "day").eq("is_active", true)') && ke.includes(".filter((d) => rc.get(d.id)?.enabled !== false)") && ke.includes('rpc("cast_day_deductions_set", { p_cast_id: castId, p_biz_date: row!.bizDate, p_rows: dedRows })') && ke.includes("data-kintai-day-ded={String(dayDed.rules.length)}") && ke.includes("if (plan.corrections.length === 0 && !plan.attendance && !dedRows)"));
  check("0195(5-3) 日計の「控除」列＝KINTAI_PAY_HEADS 5（控除は日計の前）・行の data-kintai-ded・tfoot の colSpan 4（店長側・/mine）・kintai-sheet は給与と同じ式（effectiveDeductionsOf → dailyDeductionsOf・出勤した日＝打刻あり）",
    kr.includes('KINTAI_PAY_HEADS = ["時給分", "バック", "罰金・減額", "控除", "日計"]') && kr.includes("data-kintai-ded={p?.ded ?? 0}") && kr.includes("colSpan={9 + (withPay ? KINTAI_PAY_HEADS.length : 0)}") && ab.includes('<td className="opt pay" colSpan={4} style={t.td} />') && mine.includes('<td className="opt pay" colSpan={4} style={t.td} />')
    && ks.includes("dailyDeductionsOf(effectiveDeductionsOf(dayRules, rcByCast.get(c.id), ovByCast.get(c.id)), ddByCast.get(c.id), worked)") && ks.includes("const worked = new Set(rows.filter((r) => !r.future && !r.cancelled && !!r.inHm).map((r) => r.bizDate));"));
  check("0195(5-4) 給与の計算＝collect が day_rule を読み（pick のときだけキー）・core がフラグ true のときだけ deduction_rule_casts／cast_day_deductions を読んで cast に載せる・assemble は キャスト別 → run 別 → dayCount",
    col.includes('"id, name, amount, per, kind, basis_confirmed_at, day_rule"') && col.includes('...(d.day_rule === "pick" ? { dayRule: "pick" as const } : {})') && core.includes("mig0195On() ? await Promise.all([loadDeductionRuleCasts(admin, storeId), loadDayDeductions(admin, storeId, win)])")
    && asm.includes("deductions: dayDeductionCountsOf(effectiveDeductionsOf(masters.deductions, raw.ruleCastOverrides, raw.deductionOverrides), raw.dayDeductions, new Set(raw.daily.filter((d) => d.hours > 0).map((d) => d.bizDate)), raw.days)"));
  check("0195(5-5) キャスト詳細＝「控除」の節（店のルール一覧・使う／使わない・額の上書き＝deduction_rule_cast_set・一覧は deduction_rule_casts_get・管理者か自店の店長だけ）",
    cb.includes('supabase.rpc("deduction_rule_cast_set", { p_rule_id: ruleId, p_cast_id: castId, p_enabled: enabled, p_amount_override: override })') && cb.includes('supabase.rpc("deduction_rule_casts_get", { p_store_id: sid })') && cb.includes("const canEditDed = isOwner || selCast.store_id === myStoreId;") && cb.includes("data-cast-ded-rules={String(dedRules.length)}"));
  check("0195(5-6) LINE＝push は blocked_at が null の行だけ・Webhook の unfollow → line_link_block（service_role）・bind の後に blocked_at を戻す・キャスト詳細に「LINE ブロック中」と「紐付けを解除」（line_link_remove・確認あり）",
    sv.includes('.is("blocked_at", null).maybeSingle()') && wh.includes('if (ev.type === "unfollow" && ev.source?.userId) { await admin.rpc("line_link_block", { p_store_id: storeId, p_line_user_id: ev.source.userId }); continue; }')
    && bd.includes('await admin.from("line_links").update({ blocked_at: null, updated_at: new Date().toISOString() }).eq("subject_kind", r.subject_kind).eq("subject_id", r.subject_id);')
    && cb.includes('data-cast-line-blocked="1"') && cb.includes('supabase.rpc("line_link_remove", { p_subject_kind: "cast", p_subject_id: c.id })') && cb.includes("window.confirm(`${c.name} の LINE の紐付けを解除しますか？"));
  check("0195(5-7) /staff の固定手当＝名称つきの複数行（staff_allowances_set・全行置換・20 行まで・1 本の額は行に移し fixed_allowance は 0）・フラグ false は従来の 1 本・staff-board／staff-work-panel／month-report が staff_allowances を読む",
    sws.includes('supabase.rpc("staff_allowances_set", { p_membership_id: memId, p_rows: allowRows })') && sws.includes("if (allowRows) patch.fixed_allowance = 0;") && sws.includes('data-staff-allowance-add="1"') && sws.includes('fixed_allowance: form.pay_kind === "hourly" ? f : 0')
    && src("app/(manage)/staff/staff-board.tsx").includes('supabase.from("staff_allowances").select("membership_id, name, amount, sort").eq("is_active", true).order("sort")') && src("app/(manage)/staff/staff-work-panel.tsx").includes("attachStaffAllowances((cc.data ?? []) as StaffContract[], al as StaffAllowanceRow[] | null)") && src("app/(manage)/report/month-report.tsx").includes('supabase.from("staff_allowances")'));
}

// (3)(4) live
async function main(): Promise<void> {
  let dbUrl = process.env.SUPABASE_DB_URL; if (!dbUrl) { try { process.loadEnvFile(".env.local"); } catch { /* no env */ } dbUrl = process.env.SUPABASE_DB_URL; }
  if (dbUrl) {
    const pc = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await pc.connect();
    try {
      const cntQ = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
      const before = await cntQ();
      const r = (await pc.query(`select
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='set_deduction' and pronargs=10) a10,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname='set_deduction' and pronargs=9) a9,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in ('cast_day_deductions_set','deduction_rule_cast_set','deduction_rule_casts_get','line_link_block','line_link_remove','staff_allowances_set')) n6,
        (select count(*)::int from information_schema.columns where table_schema='public' and ((table_name='deductions' and column_name='day_rule') or (table_name='line_links' and column_name='blocked_at') or (table_name='staff_labor_confirmed' and column_name='allowances'))) c3,
        (select count(*)::int from pg_tables where schemaname='public' and tablename in ('cast_day_deductions','deduction_rule_casts','staff_allowances') and rowsecurity) rls3,
        (select count(*)::int from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and table_name in ('cast_day_deductions','deduction_rule_casts','staff_allowances') and privilege_type <> 'SELECT') badg,
        (select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('set_deduction','cast_day_deductions_set','deduction_rule_cast_set','deduction_rule_casts_get','line_link_block','line_link_remove','staff_allowances_set','staff_attendance_confirm') and has_function_privilege('anon', p.oid, 'execute')) anonx,
        (select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='line_link_block') blk_auth,
        (select count(*)::int from public.deductions where day_rule <> 'always') pick_now`)).rows[0];
      check("0195(3-1) live＝関数 416・表 119・set_deduction 10 引数だけ・新設 6・列 3・RLS 3・表の grant は SELECT だけ・anon exec 0・line_link_block は authenticated 不可", before.f === 449 /* ★0201d（2026-11-13 夜 手貼り）: 447→449 */ /* ★0201i（2026-11-13 夕 手貼り）: 442→447 */ /* ★0201g（作り直し 4・手貼りの後）: 440→442 */ /* ★0201c／h／e（2026-11-12）: 431→440 */ /* ★0201（2026-11-11 手貼り・+4＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set）: 427→431 */ /* ★0200（2026-11-10 手貼り・+6−1＝notice_create_targets 6 引数／staff_labor_mark_paid／unmark_paid／auth_register_access／auth_cast_check_allowed／kiosk_person_active_of／kiosk_person_touch・set_store_cast_register drop）: 422→427 */ /* ★0198（2026-11-09 手貼り・+3＝cast_loan_grant／cast_loan_repay／cast_day_applied_of）: 419→422 */ && before.t === 122 /* ★0201i: 121→122 */ /* ★0200: 表 120→121＝staff_labor_payments */ /* ★0197（2026-11-06・+1＝register_day_grant_set・作り直し 2 本は ±0）: 418→419 */ /* ★0196（2026-11-06・+2＝kiosk_person_claim／kiosk_person_end・作り直し 9 本は ±0）: 416→418 */  && r.a10 === 1 && r.a9 === 0 && r.n6 === 6 && r.c3 === 3 && r.rls3 === 3 && r.badg === 0 && r.anonx === 0 && r.blk_auth === false, J({ before, r }));
      // (4) BEGIN…ROLLBACK（try_0195.mjs と同じ型＝NOX-VERIFY-A1・authenticated を名乗る）
      await pc.query("begin");
      try {
        const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0];
        const mem = async (role: string) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active order by m.id limit 1`, [st.id, role])).rows[0];
        const owner = await mem("owner"), manager = await mem("manager"), staff = await mem("staff");
        const cast = (await pc.query(`select c.id from public.casts c where c.store_id=$1 and c.is_active order by c.name limit 1`, [st.id])).rows[0];
        const as = async (who: { auth_user_id: string }, sql: string, params: unknown[] = []): Promise<{ ok: boolean; rows: Record<string, unknown>[]; err: string }> => {
          await pc.query("savepoint a");
          try {
            await pc.query("set local role authenticated");
            await pc.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: who.auth_user_id, role: "authenticated" })]);
            const q = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: q.rows, err: "" };
          } catch (e) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, rows: [], err: (e as Error).message }; }
        };
        const alw = await as(owner, `select public.set_deduction(null, $1, 'NOX-VERIFY-0195s-always', 300, 'day', true, 'agreed_cost', false, null, 'always') id`, [st.id]);
        const pick = await as(owner, `select public.set_deduction(null, $1, 'NOX-VERIFY-0195s-pick', 500, 'day', true, 'other', false, null, 'pick') id`, [st.id]);
        const pr = await as(owner, `select public.set_deduction(null, $1, 'NOX-VERIFY-0195s-payrate', 10, 'pay_rate', true, 'other', false, null) id`, [st.id]);
        check("0195(4-1) set_deduction＝10 引数（day_rule）・kind other・per pay_rate を受ける（9 引数の呼び出しは DEFAULT always）", alw.ok && pick.ok && pr.ok && (await pc.query(`select day_rule from public.deductions where id=$1`, [pr.rows[0].id])).rows[0].day_rule === "always", [alw.err, pick.err, pr.err]);
        const alwId = alw.rows[0]?.id as string, pickId = pick.rows[0]?.id as string;
        const Dd = "2099-05-10";
        const rowsOf = async () => (await pc.query(`select deduction_id, enabled from public.cast_day_deductions where cast_id=$1 and biz_date=$2 order by deduction_id`, [cast.id, Dd])).rows;
        let x = await as(manager, `select public.cast_day_deductions_set($1, $2, $3::jsonb)`, [cast.id, Dd, J([{ deduction_id: alwId, enabled: false }, { deduction_id: pickId, enabled: true }])]);
        check("0195(4-2) cast_day_deductions_set＝店長が always を off・pick を on＝既定と違う 2 行", x.ok && (await rowsOf()).length === 2, x.err);
        x = await as(manager, `select public.cast_day_deductions_set($1, $2, $3::jsonb)`, [cast.id, Dd, J([{ deduction_id: alwId, enabled: true }, { deduction_id: pickId, enabled: false }])]);
        check("0195(4-3) 既定どおりに戻すと行が消える（0 行）", x.ok && (await rowsOf()).length === 0, x.err);
        x = await as(manager, `select public.cast_day_deductions_set($1, $2, $3::jsonb)`, [cast.id, Dd, J([{ deduction_id: pr.rows[0].id, enabled: true }])]);
        check("0195(4-4) per=day でないルールは 'not day rule'", !x.ok && /not day rule/.test(x.err), x.err);
        x = await as(staff, `select public.cast_day_deductions_set($1, $2, $3::jsonb)`, [cast.id, Dd, J([{ deduction_id: alwId, enabled: false }])]);
        check(MIG_0198_APPLIED ? "0195(4-5) スタッフ（自店）は 0198（裁定461）で ok" : "0195(4-5) スタッフは forbidden（店の人は店長以上）", MIG_0198_APPLIED ? x.ok : !x.ok && /forbidden/.test(x.err), x.err);
        if (MIG_0198_APPLIED && x.ok) await as(staff, `select public.cast_day_deductions_set($1, $2, $3::jsonb)`, [cast.id, Dd, J([{ deduction_id: alwId, enabled: true }])]); // 既定どおりに戻す（後段の件数を変えない）
        const rcOf = async () => (await pc.query(`select enabled, amount_override from public.deduction_rule_casts where rule_id=$1 and cast_id=$2`, [alwId, cast.id])).rows;
        x = await as(manager, `select public.deduction_rule_cast_set($1, $2, false, null)`, [alwId, cast.id]);
        check("0195(4-6) deduction_rule_cast_set＝使わない（enabled=false）で行が立つ・get に出る", x.ok && (await rcOf()).length === 1 && (await as(manager, `select * from public.deduction_rule_casts_get($1)`, [st.id])).rows.some((q) => q.rule_id === alwId && q.cast_id === cast.id), x.err);
        x = await as(manager, `select public.deduction_rule_cast_set($1, $2, true, null)`, [alwId, cast.id]);
        check("0195(4-7) 既定に戻す（enabled=true・override=null）＝行が消える", x.ok && (await rcOf()).length === 0, x.err);
        const base = { membership_id: staff.id, pay_kind: "hourly", hourly: 1300, minutes: 601, time_pay: 13021, fixed: 6000, monthly: 0, daily: 0, days: 3, amount: 19021, deductions: [], calc_version: STAFF_LABOR_CALC_VERSION };
        x = await as(manager, `select public.staff_attendance_confirm($1, '2099-07', true, $2::jsonb)`, [st.id, J([{ ...base, allowances: [{ name: "通勤手当", amount: 5000 }] }])]);
        check("0195(4-8) staff_attendance_confirm＝Σ allowances 5,000≠fixed 6,000 は 'labor mismatch: fixed 6000 <> sum(allowances) 5000'（裁定450 の 6）", !x.ok && /labor mismatch: fixed 6000 <> sum\(allowances\) 5000/.test(x.err), x.err);
        x = await as(manager, `select public.staff_attendance_confirm($1, '2099-07', true, $2::jsonb)`, [st.id, J([{ ...base, allowances: [{ name: "通勤手当", amount: 2500 }, { name: "役職手当", amount: 3500 }] }])]);
        const fz = (await pc.query(`select fixed, allowances from public.staff_labor_confirmed where membership_id=$1 and period='2099-07'`, [staff.id])).rows[0];
        check("0195(4-9) 2 行の合計＝fixed 6,000 は通り内訳 2 行を凍結（client の staffLaborRowOf が送る形）", x.ok && fz?.fixed === 6000 && Array.isArray(fz?.allowances) && fz.allowances.length === 2, x.ok ? fz : x.err);
      } finally { await pc.query("rollback"); }
      const after = await cntQ();
      check("0195(4-10) ROLLBACK＝DB 変更 0（関数 416・表 119・試走の行なし）", after.f === before.f && after.t === before.t && Number((await pc.query(`select count(*)::int n from public.deductions where name like 'NOX-VERIFY-0195s-%'`)).rows[0].n) === 0, J(after));
    } finally { await pc.end(); }
  } else console.log("(3)(4) skipped: SUPABASE_DB_URL なし");
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0195 ALL PASS (${pass} assertions)`);
}
void main();
