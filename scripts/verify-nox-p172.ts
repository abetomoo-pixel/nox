/*
 * verify:nox-p172 — 便 P172（2026-10-16）0172 の client（裁定349／351／355／356／380／381）の係留。
 *   npm run verify:nox-p172。静的 pin（fs）＋純関数＋live の 0172 形（SELECT のみ・SUPABASE_DB_URL・default_transaction_read_only）。
 *   (1) 裁定349: 日払いの種別（settlement＝期間精算から除外・advance＝支給後控除のみ）＝pay.ts／collect／assemble／core／daily-pay-form・雇用の甲／乙＝employeeTaxClassOf・扶養申告書 UI・店設定 2 キー
 *   (2) 裁定351: /terms（静的・noindex・版）・/terms/accept・(manage)/layout の同意ゲート・termsGateRedirectOf・termsBlocksOf
 *   (3) 裁定356: lib/nox/staff/pay.ts（staffHoursOf／staffPayOf）・/staff ?tab=work・/staff/me・nav「勤怠」
 *   (4) 裁定380: autoConfirmHoursOf／autoConfirmCutoffOf・/api/cron/shift-auto-confirm・店設定の select（準備中ではない）・cron_setup §6
 *   (5) 裁定381: staff_create 7 引数（route-guard tel／lineId・route p_tel／p_line_id）・staff-board の保存／編集／tel: リンク
 *   (6) live: 0172 の 4 表（RLS 有効・authenticated=SELECT のみ・policy select 1 本）・列（daily_pays.kind／cast_tax_profiles.dependents_form／memberships.tel・line_id）・md5 5 本
 *   (7) 止めた 2 点の記録＝kiosk スタッフ群（PIN 照合・打刻 RPC なし）と payload（demo_org_reset の c_load 外）＝client に入口を作っていない
 */
import fs from "node:fs";
import { Client } from "pg";
import { employeeTaxClassOf, payOf, withholdingOf, type PayInput } from "../lib/nox/pay";
import { termsBlocksOf, termsGateRedirectOf, TERMS_VERSION } from "../lib/nox/terms";
import { hmOf, staffHoursOf, staffMonthRangeOf, staffPayOf } from "../lib/nox/staff/pay";
import { autoConfirmCutoffOf, autoConfirmHoursOf } from "../lib/nox/shift/auto-confirm";
import { dailyPayKindDeductsNow, midPayOf, settlementCycleOf } from "../lib/nox/payroll/settlement-cycle";
import { staffTabOf } from "../lib/nox/staff/tabs";
import { REINA_INPUT } from "./fixtures-pay";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── (1) 349
const pay = src("lib/nox/pay.ts"); const col = src("lib/nox/payroll/collect.ts"); const asm = src("lib/nox/payroll/assemble.ts"); const core = src("lib/nox/payroll/core.ts");
const dpf = src("components/nox/daily-pay-form.tsx"); const stp = src("app/(manage)/master/sensitive-tax-panel.tsx"); const spp = src("app/(manage)/master/store-profile-panel.tsx");
check("p172(1-1) pay.ts: settlement を課税ベースから除外（withholdingOf(gross−adj.before−dailySettlement)）・既徴収の相殺なし（dailyWithholdingShort 0）・雇用は taxClass（甲／乙）",
  pay.includes("const taxBase = Math.max(0, gross - adj.before - dailySettlement);") && pay.includes("withholdingOf(taxBase, input.periodDays, input.taxMode, input.taxClass);")
  && pay.includes("const withholding = withholdingFull;") && pay.includes("const dailyWithholdingShort = 0;") && pay.includes('export const employeeTaxClassOf = (dependentsForm: boolean | null | undefined): EmployeeTaxClass => (dependentsForm === true ? "甲" : "乙");'));
check("p172(1-2) collect: daily_pays.kind を読み settlement／advance を別に合計・cast_tax_profiles.dependents_form を読む／assemble: dailySettlementGross／dailyAdvanceGross・雇用に taxClass／core: 行に 2 列",
  col.includes('.select("cast_id, gross, withholding, kind")') && col.includes('if (r.kind === "advance") cur.advanceGross += r.gross; else cur.settlementGross += r.gross;') && col.includes('.select("cast_id, mode, dependents_form")')
  && asm.includes("dailySettlementGross: raw.dailyPaid.settlementGross ?? 0, dailyAdvanceGross: raw.dailyPaid.advanceGross ?? 0") && asm.includes('...(taxMode === "雇用" ? { taxClass: employeeTaxClassOf(raw.dependentsForm) } : {})')
  && core.includes("dailySettlementGross: c.dailyPaid?.settlementGross ?? 0, dailyAdvanceGross: c.dailyPaid?.advanceGross ?? 0"));
{ // 純関数: golden 系の入力（fixtures-pay）に日払いを足して差分だけを見る
  const base = REINA_INPUT as PayInput;
  const p0 = payOf(base);
  const pS = payOf({ ...base, dailyPaidGross: 10000, dailyWithheld: 510, dailySettlementGross: 10000, dailyAdvanceGross: 0 });
  const pA = payOf({ ...base, dailyPaidGross: 4000, dailyWithheld: 0, dailySettlementGross: 0, dailyAdvanceGross: 4000 });
  const expS = withholdingOf(Math.max(0, p0.gross - p0.adjBefore - 10000), base.periodDays, base.taxMode);
  check("p172(1-3) 純関数: settlement 10000＝源泉は課税ベース −10000 で再計算・既徴収 510 は相殺しない・net＝元−10000＋源泉の差・キー dailySettlementGross",
    pS.withholding === expS && pS.dailyWithholdingShort === 0 && pS.net === p0.net - 10000 + (p0.withholding - pS.withholding) && pS.dailySettlementGross === 10000 && pS.dailyAdvanceGross === undefined,
    JSON.stringify({ w0: p0.withholding, wS: pS.withholding, expS, n0: p0.net, nS: pS.net }));
  check("p172(1-4) 純関数: advance 4000＝源泉は不変・net＝元−4000・キー dailyAdvanceGross", pA.withholding === p0.withholding && pA.net === p0.net - 4000 && pA.dailyAdvanceGross === 4000 && pA.dailySettlementGross === undefined,
    JSON.stringify({ w0: p0.withholding, wA: pA.withholding, n0: p0.net, nA: pA.net }));
  check("p172(1-5) 純関数: 日払いなし＝従来と同値（golden 不変・キーなし）", JSON.stringify(payOf({ ...base })) === JSON.stringify(p0) && p0.dailySettlementGross === undefined && p0.taxClass === undefined);
  const pE = payOf({ ...base, taxMode: "雇用", taxClass: "甲" });
  check("p172(1-6) 雇用: 甲／乙は employeeTaxClassOf（提出あり＝甲）・源泉は計算しない（裁定432＝税額表の自動計算は撤去・控除は手入力）＝0・結果に taxClass を持つ（委託はキーなし）",
    employeeTaxClassOf(true) === "甲" && employeeTaxClassOf(false) === "乙" && employeeTaxClassOf(null) === "乙" && withholdingOf(300000, 31, "雇用", "甲") === 0 && pE.withholding === 0 && pE.taxClass === "甲" && payOf({ ...base, taxClass: "甲" }).taxClass === undefined);
}
check("p172(1-7) 日払いの発行 UI: 種別 SegSelect（既定 advance）・p_kind を送る・advance は控除 0 のプレビュー・一覧に種別",
  dpf.includes('useState<DailyPayKind>("advance")') && dpf.includes("p_idem_key: crypto.randomUUID(), p_kind: kind })") && dpf.includes("dailyPayKindDeductsNow(kind) ? withholdingOf(gross, 1, mode) : 0") && dpf.includes("data-daily-pay-kind={kind}") && dpf.includes('{p.kind === "advance" ? "前払" : "日次精算"}'));
check("p172(1-8) 扶養控除等申告書: 税務設定（雇用のときだけ）＝チェック＋提出日・set_cast_dependents_form（税区分の保存の後・変わったときだけ）",
  stp.includes('data-dependents-form="1"') && stp.includes('await supabase.rpc("set_cast_dependents_form", { p_cast_id: castId, p_submitted: depForm, p_on: depForm && depOn ? depOn : null })') && stp.includes('mode === "雇用" && (depForm !== depCur.form'));
check("p172(1-9) 店設定: 精算方式（4 値）・途中払い（2 値）＝店舗情報の patch・純関数の既定（monthly／none）",
  spp.includes('data-settlement-cycle="1"') && spp.includes('data-mid-pay="1"') && spp.includes("if (form.settlement_cycle !== cur.settlement_cycle) out.settlement_cycle = form.settlement_cycle;") && spp.includes("if (form.mid_pay !== cur.mid_pay) out.mid_pay = form.mid_pay;")
  && settlementCycleOf(null) === "monthly" && settlementCycleOf({ settlement_cycle: "half" }) === "half" && settlementCycleOf({ settlement_cycle: "x" }) === "monthly" && midPayOf({ mid_pay: "advance" }) === "advance" && midPayOf({}) === "none"
  && dailyPayKindDeductsNow("settlement") && !dailyPayKindDeductsNow("advance"));

// ── (2) 351
const tl = src("lib/nox/terms.ts"); const tp = src("app/terms/page.tsx"); const ta = src("app/terms/accept/page.tsx"); const tf = src("components/nox/terms-accept-form.tsx"); const lay = src("app/(manage)/layout.tsx");
check("p172(2-1) /terms: force-static・noindex・docs/legal/terms_store_v0.9.md を build 時に読む・版表示 data-terms-version",
  tp.includes('export const dynamic = "force-static";') && tp.includes("robots: { index: false, follow: false }") && tp.includes('path.join(process.cwd(), "docs", "legal", "terms_store_v0.9.md")') && tp.includes("data-terms-version={TERMS_VERSION}") && TERMS_VERSION === "0.9");
check("p172(2-2) (manage)/layout: org 読取直後に terms_accepted_version_ok→termsGateRedirectOf→/terms/accept（デモ org は読まない）",
  lay.includes('const { data: termsOk } = await supabase.rpc("terms_accepted_version_ok", { p_version: TERMS_VERSION });') && lay.includes("const to = termsGateRedirectOf(isDemo, termsOk === true, (await headers()).get(\"x-pathname\") ?? \"\");") && lay.includes("if (to) redirect(to);") && lay.indexOf("if (!isDemo) {\n    const { data: termsOk }") > lay.indexOf("const isDemo = orgRow?.is_demo === true;"));
check("p172(2-3) /terms/accept: owner＝チェック→「同意して使い始める」56（terms_accept）・それ以外＝オーナー待ち・デモ／同意済みは /dashboard へ",
  ta.includes('if (orgRow?.is_demo === true || ok === true) redirect(role === "cast" ? "/mine" : "/dashboard");') && tf.includes('await supabase.rpc("terms_accept", { p_version: TERMS_VERSION })') && tf.includes('data-terms-submit="1"') && tf.includes("オーナーの同意待ちです"));
check("p172(2-4) 純関数: termsGateRedirectOf＝デモ null・同意済み null・/terms 配下 null・未同意 /terms/accept",
  termsGateRedirectOf(true, false, "/dashboard") === null && termsGateRedirectOf(false, true, "/dashboard") === null && termsGateRedirectOf(false, false, "/terms/accept") === null && termsGateRedirectOf(false, false, "/register") === "/terms/accept" && termsGateRedirectOf(false, null, "/") === "/terms/accept");
{ const md = src("docs/legal/terms_store_v0.9.md"); const b = termsBlocksOf(md);
  check("p172(2-5) termsBlocksOf: 見出し h1 1・h2 16（第1〜16条）・番号付きの条文・hr 1・** は外す", b.filter((x) => x.kind === "h1").length === 1 && b.filter((x) => x.kind === "h2").length === 16 && b.some((x) => x.kind === "ol" && (x.items?.length ?? 0) >= 2) && b.filter((x) => x.kind === "hr").length === 1 && !b.some((x) => (x.text ?? "").includes("**")) && (b.find((x) => x.kind === "p")?.text ?? "").includes("雛形です"),
    JSON.stringify({ h1: b.filter((x) => x.kind === "h1").length, h2: b.filter((x) => x.kind === "h2").length }));
  check("p172(2-5b) termsBlocksOf: 空文字＝[]・箇条書き ul・h2 の順序は md のまま", termsBlocksOf("").length === 0 && termsBlocksOf("- a\n- b")[0]?.kind === "ul" && (b.filter((x) => x.kind === "h2")[0]?.text ?? "").startsWith("第1条")); }

// ── (3) 356
const sp = src("app/(manage)/staff/page.tsx"); const sw = src("app/(manage)/staff/staff-work-panel.tsx"); const sme = src("app/(manage)/staff/me/page.tsx");
check("p172(3-1) /staff: ?tab=work＝勤怠・報酬（StaffWorkPanel scope store）・既定 一覧・タブは lib/nox/staff/tabs（page から export しない）／nav: staff に「勤怠」（/staff/me）",
  sp.includes('import { STAFF_TABS, staffTabOf } from "@/lib/nox/staff/tabs";') && !sp.includes("export const staffTabOf") && sp.includes('<StaffWorkPanel scope="store"') && sp.includes('data-staff-tabs="1"') && sme.includes('<StaffWorkPanel scope="me"') && sme.includes('if (role === "cast") redirect("/mine");')
  && lay.includes('...(role === "staff" ? [{ href: "/staff/me", label: "勤怠" }] : []),') && staffTabOf("work") === "work" && staffTabOf(undefined) === "list");
check("p172(3-2) staff-work-panel: staff_contracts／staff_punches を直 SELECT（RLS）・月切替・★便 P174 T-7 で確定ボタン（無効）を撤去→確定状況（staff_payroll_runs の読取）＝確定の RPC は 0175（教訓25）・契約未登録の注記",
  sw.includes('supabase.from("staff_contracts").select("membership_id, contract_kind, hourly, fixed_allowance, tax_class, withholding_rate")') && sw.includes('supabase.from("staff_punches").select("membership_id, biz_date, kind, punched_at")') && !sw.includes('data-staff-pay-finalize="1"') && sw.includes("data-staff-pay-run=") && sw.includes('supabase.from("staff_payroll_runs").select("status")') && sw.includes("<span style={t.sub}>契約未登録</span>") /* ★便 X13-H H-12 ③ */);
{ const P = (bd: string, kind: "in" | "out", hm: string) => ({ membership_id: "m", biz_date: bd, kind, punched_at: `${bd}T${hm}:00+09:00` });
  const days = staffHoursOf([P("2026-10-01", "in", "18:00"), P("2026-10-01", "out", "23:30"), P("2026-10-02", "in", "19:00"), P("2026-10-03", "out", "02:00"), P("2026-10-03", "in", "20:00")]);
  check("p172(3-3) staffHoursOf: 営業日ごとに in→out を対にする（5.5h＝330 分）・out だけの日は 0・in だけの日は open", days.length === 3 && days[0].minutes === 330 && !days[0].open && days[1].minutes === 0 && days[1].open && days[2].minutes === 0 && days[2].open, JSON.stringify(days));
  const emp = staffPayOf({ membership_id: "m", contract_kind: "parttime", hourly: 1500, fixed_allowance: 10000, tax_class: "甲", withholding_rate: 0 }, days);
  const con = staffPayOf({ membership_id: "m", contract_kind: "contractor", hourly: 0, fixed_allowance: 12000, tax_class: null, withholding_rate: 0 }, days);
  const conH = staffPayOf({ membership_id: "m", contract_kind: "contractor", hourly: 2000, fixed_allowance: 0, tax_class: null, withholding_rate: 10.21 }, days);
  check("p172(3-4) staffPayOf: 雇用＝1500×5.5h＋手当 10000＝18250・源泉 0（甲欄・税額表なし）／委託 日額＝12000×3 日＝36000／委託 時給＝2000×5.5h＝11000・率 10.21%＝1123・手取り 9877",
    emp.gross === 18250 && emp.withholding === 0 && emp.net === 18250 && emp.days === 3 && emp.withholdingNote.includes("甲欄") && con.gross === 36000 && con.withholding === 3675 /* ★便 X13-H H-12 ③: 率 0 の委託も 10.21% で見込み */ && conH.gross === 11000 && conH.withholding === 1123 && conH.net === 9877,
    JSON.stringify({ emp, con, conH }));
  check("p172(3-5) staffMonthRangeOf／hmOf", staffMonthRangeOf("2026-02").to === "2026-02-28" && staffMonthRangeOf("2026-10").to === "2026-10-31" && hmOf(330) === "5:30" && hmOf(0) === "0:00"); }

// ── (4) 380
const cr = src("app/api/cron/shift-auto-confirm/route.ts"); const cs = src("docs/demo/cron_setup.md");
check("p172(4-1) cron route: Bearer CRON_SECRET・店ごとに autoConfirmHoursOf→proposed かつ updated_at < cutoff を confirmed・0 件は書かない・audit shift.auto_confirm",
  cr.includes("if (req.headers.get(\"authorization\") !== `Bearer ${secret}`) return new NextResponse(\"unauthorized\", { status: 401 });") && cr.includes('.update({ status: "confirmed" })') && cr.includes('.eq("store_id", s.id as string).eq("status", "proposed").lt("updated_at", cutoff)') && cr.includes("if (ids.length > 0) {") && cr.includes('p_action: "shift.auto_confirm"'));
check("p172(4-2) 純関数: autoConfirmHoursOf＝1〜168 の整数だけ（0／欠損／文字／小数／169 は 0）・cutoff＝now−hours", autoConfirmHoursOf({ shift_auto_confirm_hours: 24 }) === 24 && autoConfirmHoursOf({ shift_auto_confirm_hours: "48" }) === 48 && autoConfirmHoursOf({}) === 0 && autoConfirmHoursOf(null) === 0 && autoConfirmHoursOf({ shift_auto_confirm_hours: 0 }) === 0 && autoConfirmHoursOf({ shift_auto_confirm_hours: 169 }) === 0 && autoConfirmHoursOf({ shift_auto_confirm_hours: 1.5 }) === 0
  && autoConfirmCutoffOf(new Date("2026-10-16T03:00:00Z"), 24) === "2026-10-15T03:00:00.000Z" && autoConfirmCutoffOf(new Date(), 0) === null);
check("p172(4-3) 店設定: 自動確定時間の select は活性（準備中ではない・owner が保存＝set_store_profile shift_auto_confirm_hours）／cron_setup §6 に SQL（15 分間隔・Vault の URL を置換）",
  spp.includes('data-shift-auto-confirm="1"') && !spp.includes("送り返しの自動確定時間（準備中）") && spp.includes("await setStoreProfile({ shift_auto_confirm_hours: v })") && cs.includes("nox-shift-auto-confirm") && cs.includes("'*/15 * * * *'") && cs.includes("/api/cron/shift-auto-confirm"));

// ── (5) 381
const rg = src("lib/nox/staff/route-guard.ts"); const rt = src("app/api/staff/create/route.ts"); const sb = src("app/(manage)/staff/staff-board.tsx");
check("p172(5-1) staff_create 7 引数: route-guard が tel（≤30）／lineId（≤40）を任意で受け・route が p_tel／p_line_id を送る",
  rg.includes('if (tel && tel.length > 30) return { ok: false, status: 400, body: { error: "bad tel (max 30)" } };') && rg.includes("input: { name, email, storeId, role, idemKey: body.idemKey, tel, lineId },") && rt.includes("p_tel: tel,") && rt.includes("p_line_id: lineId,"));
check("p172(5-2) staff-board: 登録モーダルが tel／lineId を送る・編集シートに電話／LINE ID（staff_update_profile 4 引数・変わった項目だけ）・一覧に tel: リンク・旧注記なし",
  sb.includes("tel: aTel.trim() || undefined,") && sb.includes("lineId: aLine.trim() || undefined,") && sb.includes("p_tel: telChanged ? eTel.trim() : null, p_line_id: lineChanged ? eLine.trim() : null") && sb.includes('data-staff-edit-tel="1"') && sb.includes('data-staff-edit-line="1"') && sb.includes("<TelLink tel={m.tel} />") && !sb.includes("次のデータ更新（0172）から保存されます"));

// ── (7) 止めた 2 点＝入口を作っていない
const kiosk = src("app/kiosk/page.tsx"); const gen = src("scripts/demo/gen-demo.mjs");
check("p172(7-1) ★便 P173 で反転: 0174＝kiosk_staff_list／staff_punch（RPC）・demo_org_reset の c_load に 4 表→payload に staff_contracts／staff_punches（MUSE／LUNA）。kiosk の打刻 UI（スタッフ群）の入口は次便（client 未着手）", !kiosk.includes("staff_punches") && gen.includes("staff_contracts") && gen.includes("staff_punches"));

// ── (6) live（SELECT のみ）
async function live() {
  process.loadEnvFile(".env.local");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await db.connect();
  try {
    await db.query("set default_transaction_read_only = on");
    const { rows: t4 } = await db.query(`select c.relname, c.relrowsecurity rls, c.relacl::text acl, (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename=c.relname) pol
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('terms_acceptances','staff_contracts','staff_punches','staff_payroll_runs') order by 1`);
    check("p172(6-1) live: 0172 の 4 表＝RLS 有効・authenticated=r のみ（anon なし）・policy 1 本ずつ", t4.length === 4 && t4.every((r) => r.rls === true && /authenticated=r\//.test(r.acl) && !/anon=/.test(r.acl) && r.pol === 1), JSON.stringify(t4));
    const { rows: cols } = await db.query(`select table_name||'.'||column_name c, column_default d from information_schema.columns where table_schema='public' and ((table_name='daily_pays' and column_name='kind') or (table_name='cast_tax_profiles' and column_name in ('dependents_form','dependents_form_on')) or (table_name='memberships' and column_name in ('tel','line_id'))) order by 1`);
    check("p172(6-2) live: 列 5（daily_pays.kind 既定 settlement・cast_tax_profiles.dependents_form／_on・memberships.tel／line_id）", cols.length === 5 && cols.some((r) => r.c === "daily_pays.kind" && String(r.d).includes("settlement")), JSON.stringify(cols));
    const { rows: md } = await db.query(`select proname, left(md5(replace(prosrc, E'\\r', '')),8) m from pg_proc where pronamespace='public'::regnamespace and proname in ('daily_pay_issue','daily_pays_of_run','set_store_profile','staff_create','staff_update_profile','terms_accept','terms_accepted_version_ok','set_cast_dependents_form') order by 1`);
    const m = Object.fromEntries(md.map((r) => [r.proname as string, r.m as string]));
    check("p172(6-3) live: md5 pin 5 本（daily_pay_issue 94f989f9／daily_pays_of_run 37ff6ed0／set_store_profile 67e96c04／staff_create 8c2fef04／staff_update_profile b710ebae）・新設 3 本が各 1 定義",
      m.daily_pay_issue === "df0d58ff" /* ★0175 v2: 6 引数（94f989f9→df0d58ff・便 ON-1） */ && m.daily_pays_of_run === "37ff6ed0" && m.set_store_profile === "23cd5573" /* ★0175: 白名単 +26（45012c75→23cd5573・便 ON-1）←★0173: +5（67e96c04→45012c75） */ && m.staff_create === "8c2fef04" && m.staff_update_profile === "b710ebae" && md.length === 8, JSON.stringify(m));
    const { rows: cnt } = await db.query(`select (select count(*) from pg_proc where pronamespace='public'::regnamespace)::int f, (select count(*) from pg_tables where schemaname='public')::int t, (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc like '%billing locked%')::int g`);
    check("p172(6-4) live: 関数 314・表 87・'billing locked' 160（★0173／0174・便 P173: 311→314・159→160）", cnt[0].f === 367 && cnt[0].t === 104 && cnt[0].g === 181 /* ★0175 v2／0176／0177（便 ON-1）: 関数 314→367・表 87→104・gated 160→181 */, JSON.stringify(cnt[0]));
  } finally { await db.end().catch(() => {}); }
}
void live().then(() => {
if (fails.length) { console.error(`✗ verify:nox-p172 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-p172 OK (${pass} checks)`);
}).catch((e) => { console.error("✗ verify:nox-p172 例外", e instanceof Error ? e.message : String(e)); process.exit(1); });
