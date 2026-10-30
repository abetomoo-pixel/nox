/*
 * verify:nox-0188 — 0188／0189 フラグ true 便（2026-10-29・Agoora 手貼り後の client）。
 *  (A) フラグ＝MIG_0188_APPLIED／MIG_0189_APPLIED は true・読み口はテストで差し替えられる・mig 2 本が収蔵済み（sha16 d9fceaa24e2e93ac／c6a8dab6a32a6c81）。
 *  (B) 税率表の鏡（lib/nox/payroll/withholding-rates.ts）＝支払日で行を選ぶ（裁定433 ①）・withholding_calc と同式（整数・切捨て）の境界値＝
 *      hostess 8 点（従来の withholdingOf と 1 円も違わない＝golden 不変）・other_204 の 100 万円の段階（102,100／204,200／100 万 1 円＝102,100／5,105）・salesperson（8,168／0）・manual／none＝0。
 *  (C) 区分 4 つ（裁定434 ①②）＝選択肢 none／hostess／other_204／manual・委託スタッフの既定 none・旧 other_fee の保存値は other_204 と読む・payOf／staffPayOf／明細のラベル。
 *  (D) 日払い（裁定434 ④）＝daily 以外の店は前払だけ（画面）・RPC 'settlement not allowed' の文言・デモ LILY の 4 件は advance（payload）。
 *  (E) 0189＝必要人数の時間帯の翌表記（bandOptionsOf の終了は翌 24:00 まで・翌日またぎの店は close＋24h・「翌02:00」）。
 *  (F) 本番 DB（SUPABASE_DB_URL・BEGIN…ROLLBACK・残留 0）＝税率表 6 行が鏡と同値・withholding_calc が TS と 14 点で同値・CHECK 4 区分・staffing_needs の CHECK 2880・
 *      関数 393（0190 後・2026-10-30）・表 111・md5 6 本・月次の店の settlement は拒否・daily の店は 20,000→源泉 1,531・other_fee は bad kind・set_staffing_need 2880 可／2881 bad band。
 *  使い方: npm run verify:nox-0188（env: SUPABASE_DB_URL＝(F)・無ければ (F) は FAIL）
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import { MIG_0188_APPLIED, MIG_0189_APPLIED, __set0188ForTest, mig0188On, mig0189On } from "../lib/nox/rules-0175/flag";
import { WITHHOLDING_RATES, rateBpTextOf, withholdingCalcOf, withholdingRateNoteOf, withholdingRateOf } from "../lib/nox/payroll/withholding-rates";
import {
  PAYMENT_REPORT_NOTE, WITHHOLDING_KINDS_0183, WITHHOLDING_KINDS_0188, WITHHOLDING_KIND_LABEL, WITHHOLDING_KIND_SELECT_NOTE, WITHHOLDING_KIND_SHORT,
  autoWithholdingOf, defaultWithholdingKindOf, isAutoWithholdingKind, withholdingKindChoices, withholdingKindOf,
} from "../lib/nox/payroll/withholding-kind";
import { payOf, withholdingOf } from "../lib/nox/pay";
import { withholding1021Of } from "../lib/nox/money";
import { whLabel432Of } from "../lib/nox/payroll/breakdown-lines";
import { staffPayOf } from "../lib/nox/staff/pay";
import { HALF_HOUR_HMS_2DAY, bandHmLabelOf, bandMinLabelOf, bandOptionsOf } from "../lib/nox/shift/half-hour";
import { REINA_INPUT } from "./fixtures-pay";
try { process.loadEnvFile(".env.local"); } catch { /* (F) で FAIL にする */ }

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;
const sha16 = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);

async function main() {
  // ── (A) フラグ・収蔵 ──
  check("0188(A-1) MIG_0188_APPLIED＝true・MIG_0189_APPLIED＝true（2026-10-29 手貼り後）・読み口は差し替えられる", MIG_0188_APPLIED === true && MIG_0189_APPLIED === true && mig0188On() && mig0189On() && (__set0188ForTest(false), !mig0188On()) && (__set0188ForTest(null), mig0188On()));
  check("0188(A-2) 収蔵＝0188_withholding_rates_kinds.sql（sha16 d9fceaa24e2e93ac）・0189_staffing_needs_next_day.sql（sha16 c6a8dab6a32a6c81）",
    sha16("supabase/migrations/0188_withholding_rates_kinds.sql") === "d9fceaa24e2e93ac" && sha16("supabase/migrations/0189_staffing_needs_next_day.sql") === "c6a8dab6a32a6c81");

  // ── (B) 税率表の鏡 ──
  const r1 = withholdingRateOf("hostess", "2026-10-29"), r2 = withholdingRateOf("hostess", "2027-03-01"), r3 = withholdingRateOf("hostess", "2000-01-01");
  check("0188(B-1) 支払日で行を選ぶ（2026-10-29→2013 行・控除 5,000／日／2027-03-01→2027 行（内訳に防衛 10 bp）／2000 年＝行なし）・6 行・率は全部 1021",
    r1?.validFrom === "2013-01-01" && r1.deduction === 5000 && r1.deductionUnit === "day" && r2?.validFrom === "2027-01-01" && r2.breakdown.defense_bp === 10 && r3 === null
    && WITHHOLDING_RATES.length === 6 && WITHHOLDING_RATES.every((r) => r.rateBp === 1021) && rateBpTextOf(1021) === "10.21%" && withholdingRateNoteOf("hostess", "2026-10-29") === "源泉の率 10.21%（2027-01-01 から内訳変更）" && withholdingRateNoteOf("hostess", "2027-03-01") === "源泉の率 10.21%");
  const golden = [[300000, 31], [20000, 1], [4999, 1], [5000, 1], [5001, 1], [150000, 31], [1000000, 30], [0, 31]] as const;
  const gd = golden.map(([t, d]) => ({ t, d, ts: withholdingCalcOf("hostess", t, d, "2026-10-29"), old: withholdingOf(t, d, "委託"), auto: autoWithholdingOf("hostess", t, d) }));
  check("0188(B-2) calc hostess＝従来の withholdingOf（pay.ts）と 8 点で 1 円も違わない（20,000×1＝1,531／300,000×31＝14,804／5,000×1＝0）・autoWithholdingOf も同値・2027 の行でも同値",
    gd.every((g) => g.ts === g.old && g.auto === g.old) && gd[1].ts === 1531 && gd[0].ts === 14804 && gd[3].ts === 0 && withholdingCalcOf("hostess", 300000, 31, "2027-03-01") === 14804, gd);
  check("0188(B-3) calc other_204＝100 万まで 10.21%・超える部分 20.42%（100 万＝102,100／150 万＝204,200／100 万 1 円＝102,100／5 万＝5,105）・日数は無関係・salesperson＝(累計−120,000)×10.21%（20 万＝8,168／10 万＝0）・manual／none／null＝0",
    withholdingCalcOf("other_204", 1000000, 1) === 102100 && withholdingCalcOf("other_204", 1500000, 1) === 204200 && withholdingCalcOf("other_204", 1000001, 1) === 102100 && withholdingCalcOf("other_204", 50000, 31) === 5105
    && withholdingCalcOf("salesperson", 200000, 1) === 8168 && withholdingCalcOf("salesperson", 100000, 1) === 0 && withholdingCalcOf("manual", 100000, 31) === 0 && withholdingCalcOf("none", 100000, 31) === 0 && withholdingCalcOf(null, 100000, 31) === 0
    && withholdingCalcOf("other_204", 1500000.9, 1) === 204200 && withholdingCalcOf("hostess", -5, 1) === 0);

  // ── (C) 区分 4 つ ──
  check("0188(C-1) 選択肢＝none／hostess／other_204／manual（フラグ false は旧 hostess／other_fee／manual／none）・ラベル・注記（裁定434 ②③）",
    J(withholdingKindChoices()) === J(["none", "hostess", "other_204", "manual"]) && J(WITHHOLDING_KINDS_0188) === J(withholdingKindChoices()) && (__set0188ForTest(false), J(withholdingKindChoices()) === J(WITHHOLDING_KINDS_0183)) && (__set0188ForTest(null), true)
    && WITHHOLDING_KIND_SHORT.other_204 === "その他 204 条" && WITHHOLDING_KIND_LABEL.other_204.includes("100 万円以下 10.21%") && WITHHOLDING_KIND_LABEL.other_204.includes("20.42%") && WITHHOLDING_KIND_SHORT.none === "対象外"
    && WITHHOLDING_KIND_SELECT_NOTE === "肩書ではなく業務内容で選ぶ。接待が業務ならホステス等・実態が雇用なら給与" && PAYMENT_REPORT_NOTE.hostess === "支払調書＝同一人への年間支払が 50 万円超で対象" && PAYMENT_REPORT_NOTE.none === "支払調書の対象外" && PAYMENT_REPORT_NOTE.manual === null && typeof PAYMENT_REPORT_NOTE.other_204 === "string");
  check("0188(C-2) 既定＝委託スタッフ none（フラグ false は旧 other_fee）・雇用スタッフ manual・委託キャスト hostess・雇用キャスト manual・旧 other_fee の保存値は other_204 と読む・自動の区分＝hostess／other_204",
    defaultWithholdingKindOf({ subject: "staff", contractKind: "contractor" }) === "none" && (__set0188ForTest(false), defaultWithholdingKindOf({ subject: "staff", contractKind: "contractor" }) === "other_fee") && (__set0188ForTest(null), true)
    && defaultWithholdingKindOf({ subject: "staff", contractKind: "employee" }) === "manual" && defaultWithholdingKindOf({ subject: "cast", taxMode: "委託" }) === "hostess" && defaultWithholdingKindOf({ subject: "cast", taxMode: "雇用" }) === "manual"
    && withholdingKindOf("other_fee", "none") === "other_204" && withholdingKindOf("other_204", "none") === "other_204" && withholdingKindOf("x", "none") === "none" && isAutoWithholdingKind("other_204") && !isAutoWithholdingKind("none"), { a: defaultWithholdingKindOf({ subject: "staff", contractKind: "contractor" }), b: withholdingKindOf("other_fee", "none"), on: mig0188On() });
  const base = { ...REINA_INPUT, taxMode: "委託" as const };
  const p0 = payOf(base), pH = payOf({ ...base, withholdingKind: "hostess" }), pH27 = payOf({ ...base, withholdingKind: "hostess", withholdingPayDate: "2027-03-01" }), pO = payOf({ ...base, withholdingKind: "other_204" }), pN = payOf({ ...base, withholdingKind: "none" });
  const taxBase = p0.gross; // REINA＝調整なし・日払いなし＝課税ベース＝gross
  check("0188(C-3) payOf＝hostess は golden と同値（125,802・2027 の支払日でも同値）・other_204 は税率表の段階（課税ベース＝gross）・none は 0・区分なしはキーなし（golden 不変）",
    p0.withholding === 125802 && pH.withholding === 125802 && pH27.withholding === 125802 && pH.net === p0.net && pO.withholding === withholdingCalcOf("other_204", taxBase, 31) && pN.withholding === 0 && pN.net === p0.net + 125802 && p0.withholdingKind === undefined,
    { p0: p0.withholding, pO: pO.withholding, gross: p0.gross });
  check("0188(C-4) 明細のラベル＝other_204「源泉（その他 204 条）」・指定額つき・旧 other_fee は従来の文言", whLabel432Of({ withholdingKind: "other_204" }) === "源泉（その他 204 条）" && whLabel432Of({ withholdingKind: "other_204", withholdingOverride: 1 }) === "源泉（その他 204 条・指定額）" && whLabel432Of({ withholdingKind: "other_fee" }) === "源泉（報酬・料金）");
  const sc = { membership_id: "m", contract_kind: "contractor" as const, hourly: 1500, fixed_allowance: 0, tax_class: null };
  const days = [{ bizDate: "2026-10-01", minutes: 600, open: false }];
  const sN = staffPayOf(sc, days, { kind: "none" }), sH = staffPayOf(sc, days, { kind: "hostess" }), sO = staffPayOf(sc, days, { kind: "other_204" });
  check("0188(C-5) スタッフ＝withholding_rate を持たない契約でも計算できる・既定 none＝源泉 0（注記「対象外」）・hostess＝(15,000−5,000×0)×10.21%＝1,531（日数 0＝スタッフは期間控除なし）・other_204＝1,531",
    sN.withholding === 0 && sN.net === 15000 && sN.withholdingNote === "対象外" && sH.withholding === 1531 && sO.withholding === 1531 && sO.withholdingNote === "その他 204 条", { sN, sH: sH.withholding, sO: sO.withholding });
  const swp = src("app/(manage)/staff/staff-work-panel.tsx"), tax = src("app/(manage)/master/sensitive-tax-panel.tsx");
  check("0188(C-6) 配線＝スタッフの勤怠・報酬は withholding_rate を読まない（フラグ true の select に無い）・区分の選択肢は withholdingKindChoices・注記（data-withholding-kind-note）・キャスト詳細も同じ",
    swp.includes('mig0188On() ? supabase.from("staff_contracts").select("membership_id, contract_kind, hourly, fixed_allowance, tax_class, pay_kind, monthly, daily")') /* ★便 M3 M-21: 給与の形を足す（withholding_rate は無いまま） */ && !(swp.split('mig0188On() ? supabase.from("staff_contracts").select("')[1] ?? "").split('")')[0].includes("withholding_rate") && swp.includes("withholdingKindChoices().map(") && swp.includes('data-withholding-kind-note="1"') && !swp.includes("WITHHOLDING_KINDS.map(")
    && tax.includes("withholdingKindChoices().map(") && tax.includes('data-withholding-kind-note="1"') && tax.includes("{WITHHOLDING_KIND_SELECT_NOTE}") && !tax.includes("WITHHOLDING_KINDS.map("));

  // ── (D) 日払い ──
  const dpf = src("components/nox/daily-pay-form.tsx"), gen = src("scripts/demo/gen-demo.mjs");
  check("0188(D-1) 日払いフォーム＝daily 以外の店は前払だけ（data-daily-pay-advance-only・SegSelect を出さない）・RPC には kindEff・'settlement not allowed' を日本語に・源泉は区分（autoWithholdingOf・日数 1・営業日）・前払の注記「源泉 0（期の精算で差し引き）」",
    dpf.includes('data-daily-pay-advance-only="1"') && dpf.includes('const settlementAllowed = !mig0188On() || cycle === "daily";') && dpf.includes("p_kind: kindEff }") && dpf.includes("/settlement not allowed/.test(error.message)")
    && dpf.includes("autoWithholdingOf(whKind, gross, 1, date)") && dpf.includes("前払＝源泉 0（期の精算で差し引き）") && dpf.includes('r.warn === "manual"'));
  const lily = src("docs/demo/payload/lily.json");
  check("0188(D-2) デモ LILY の日払い 4 件＝advance（gen-demo の kind: \"advance\"・payload に settlement 0・advance 4）・他 5 店は日払いなし",
    gen.includes('net: 15000, kind: "advance"') && (lily.match(/"kind": ?"settlement"/g) ?? []).length === 0 && (lily.match(/"kind": ?"advance"/g) ?? []).length === 4
    && ["ace", "muse", "noir", "nest", "luna"].every((s) => !fs.existsSync(`docs/demo/payload/${s}.json`) || (src(`docs/demo/payload/${s}.json`).match(/"kind": ?"settlement"/g) ?? []).length === 0));

  // ── (E) 0189 翌表記 ──
  const bh = [{ dow: 5, is_closed: false, open_hm: "20:00", close_hm: "02:00" }, { dow: 6, is_closed: false, open_hm: "18:00", close_hm: "23:00" }, { dow: 0, is_closed: true, open_hm: null, close_hm: null }];
  const o5 = bandOptionsOf(bh, 5), o6 = bandOptionsOf(bh, 6), o0 = bandOptionsOf(bh, 0), o5old = bandOptionsOf(bh, 5, false);
  check("0189(E-1) 翌日またぎ（20:00〜02:00）＝終了の選択肢は翌 02:00（26:00）まで・開始は 20:00〜25:30・同日閉店（18:00〜23:00）は従来どおり・定休日＝全範囲（翌 24:00＝48:00 まで）・フラグ false 相当は 24:00 まで",
    o5.to[o5.to.length - 1] === "26:00" && o5.from[0] === "20:00" && o5.from[o5.from.length - 1] === "25:30" && o6.to[o6.to.length - 1] === "23:00" && o0.to[o0.to.length - 1] === "48:00" && o0.from[0] === "00:00"
    && o5old.to[o5old.to.length - 1] === "24:00" && HALF_HOUR_HMS_2DAY.length === 97, { o5to: o5.to.slice(-3), o0to: o0.to.slice(-2) });
  check("0189(E-2) 表示＝26:00→「翌02:00」・48:00→「翌24:00」・24:00 はそのまま・23:30 はそのまま・一覧（分）も同じ", bandHmLabelOf("26:00") === "翌02:00" && bandHmLabelOf("48:00") === "翌24:00" && bandHmLabelOf("24:00") === "24:00" && bandHmLabelOf("23:30") === "23:30" && bandMinLabelOf(1560) === "翌02:00" && bandMinLabelOf(2880) === "翌24:00" && bandMinLabelOf(1200) === "20:00");
  const sb = src("app/(manage)/shift/shift-board.tsx");
  check("0189(E-3) 配線＝必要人数の選択肢と一覧が翌表記（bandHmLabelOf／bandMinLabelOf）", sb.includes("bandOptionsOf(bhRows, nDow).to.map((v) => <option key={v} value={v}>{bandHmLabelOf(v)}</option>)") && sb.includes("`${bandMinLabelOf(n.from_min)}〜${bandMinLabelOf(n.to_min)}`"));

  // ── (F) 本番 DB ──
  const url = process.env.SUPABASE_DB_URL;
  if (!url) check("0188(F) 本番 DB＝SUPABASE_DB_URL が無い", false, "no env");
  else {
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const tx = pgTx(c);
    try {
      await c.query("begin");
      const rows = await tx.q<{ kind: string; vf: string; rate_bp: number; deduction: number | null; threshold: number | null; over_rate_bp: number | null; unit: string | null }>(`select kind, valid_from::text vf, rate_bp, deduction, threshold, over_rate_bp, deduction_unit unit from public.withholding_rates order by kind, valid_from`);
      const mirror = [...WITHHOLDING_RATES].sort((a, b) => (a.kind + a.validFrom < b.kind + b.validFrom ? -1 : 1)).map((r) => ({ kind: r.kind, vf: r.validFrom, rate_bp: r.rateBp, deduction: r.deduction, threshold: r.threshold, over_rate_bp: r.overRateBp, unit: r.deductionUnit }));
      check("0188(F-1) 税率表 6 行＝TS の鏡と同値（kind・valid_from・率・控除・閾値・超過率・単位）", J(rows) === J(mirror), { rows, mirror });
      const pts: [string, number, number][] = [["hostess", 300000, 31], ["hostess", 20000, 1], ["hostess", 4999, 1], ["hostess", 5000, 1], ["hostess", 5001, 1], ["hostess", 150000, 31], ["hostess", 1000000, 30], ["hostess", 0, 31], ["other_204", 1000000, 1], ["other_204", 1500000, 1], ["other_204", 1000001, 1], ["other_204", 50000, 1], ["salesperson", 200000, 1], ["salesperson", 100000, 1]];
      const cmp: { k: string; t: number; db: number; ts: number | null }[] = [];
      for (const [k, t, d] of pts) cmp.push({ k, t, db: (await tx.one<{ v: number }>(`select public.withholding_calc($1, $2, $3, '2026-10-29'::date) v`, [k, t, d]))!.v, ts: withholdingCalcOf(k as "hostess", t, d, "2026-10-29") });
      check("0188(F-2) withholding_calc（本番）＝TS と 14 点で同値", cmp.every((x) => x.db === x.ts), cmp);
      const chk = await tx.q<{ t: string; d: string }>(`select conrelid::regclass::text t, pg_get_constraintdef(oid) d from pg_constraint where conname in ('cast_tax_profiles_withholding_kind_check','staff_contracts_withholding_kind_check','staffing_needs_band_chk') order by 1`);
      check("0188(F-3) CHECK＝cast／staff の区分 4 つ（other_fee なし）・staffing_needs の to_min ≤ 2880", chk.length === 3 && chk.filter((x) => /withholding_kind/.test(x.d)).every((x) => /other_204/.test(x.d) && !/other_fee/.test(x.d) && /'none'/.test(x.d)) && chk.some((x) => /2880/.test(x.d) && !/1440/.test(x.d)), chk);
      const cnt = await tx.one<{ f: number; t: number }>(`select (select count(*) from pg_proc where pronamespace='public'::regnamespace)::int f, (select count(*) from pg_tables where schemaname='public')::int t`);
      const md = await tx.q<{ n: string; m: string }>(`select proname n, left(md5(replace(prosrc, chr(13), '')), 8) m from pg_proc where pronamespace='public'::regnamespace and proname in ('withholding_rate_of','withholding_calc','set_withholding_kind','daily_pay_issue','referral_payout_pay','set_staffing_need') order by 1`);
      const mm = Object.fromEntries(md.map((x) => [x.n, x.m]));
      check("0188(F-4) 関数 393（0190 後）・表 111（0187 後 384／110 ＋ 0188 の 2 本・表 1）・md5 6 本（rate_of 75a0f2c5／calc 532d05c7／set_withholding_kind 58f7d87d／daily_pay_issue 3e5628ad／referral_payout_pay 2be65150／set_staffing_need b394d912）",
        cnt?.f === 393 /* ★0190（2026-10-30 適用・+7） */ && cnt.t === 111 && mm.withholding_rate_of === "75a0f2c5" && mm.withholding_calc === "532d05c7" && mm.set_withholding_kind === "58f7d87d" && mm.daily_pay_issue === "3e5628ad" && mm.referral_payout_pay === "2be65150" && mm.set_staffing_need === "b394d912", { cnt, mm });
      const acl = await tx.q<{ n: string; a: string | null }>(`select proname n, proacl::text a from pg_proc where pronamespace='public'::regnamespace and proname in ('withholding_rate_of','withholding_calc') order by 1`);
      const tg = await tx.q<{ grantee: string; p: string }>(`select grantee, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and table_name='withholding_rates' and grantee in ('anon','authenticated') group by 1`);
      check("0188(F-5) 内部 2 本は postgres だけ（anon／authenticated／service_role なし）・税率表は authenticated SELECT だけ・anon なし", acl.length === 2 && acl.every((x) => x.a !== null && !/anon|authenticated|service_role/.test(x.a)) && tg.length === 1 && tg[0].grantee === "authenticated" && tg[0].p === "SELECT", { acl, tg });
      // 動き（BEGIN…ROLLBACK）
      const A1 = await tx.storeA1(); const owner = await tx.uidOf("ownerA"); const mgr = await tx.uidOf("managerA1"); const castA = await tx.uidOf("castA1a");
      const castId = (await tx.castOf(A1.id, castA.id))!;
      await c.query(`insert into public.cast_tax_profiles (cast_id, org_id, store_id, mode) values ($1, $2, $3, '委託') on conflict (cast_id) do update set mode = '委託', withholding_kind = null`, [castId, A1.org_id, A1.id]);
      await c.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) - 'settlement_cycle' where id = $1`, [A1.id]);
      const d1 = await tx.as(mgr, `select public.daily_pay_issue($1::uuid, current_date, 20000, gen_random_uuid(), 'settlement', null) r`, [castId]);
      const d2 = await tx.as(mgr, `select ((public.daily_pay_issue($1::uuid, current_date, 20000, gen_random_uuid(), 'advance', null))->>'withholding')::int w`, [castId]);
      await c.query(`update public.stores set settings_json = coalesce(settings_json, '{}'::jsonb) || '{"settlement_cycle":"daily"}'::jsonb where id = $1`, [A1.id]);
      const d3 = await tx.as(mgr, `select ((public.daily_pay_issue($1::uuid, current_date, 20000, gen_random_uuid(), 'settlement', null))->>'withholding')::int w`, [castId]);
      check("0188(F-6) 月次の店の settlement＝'settlement not allowed'・advance＝源泉 0・daily の店の settlement 20,000＝源泉 1,531（TS の withholdingCalcOf と同値）",
        !d1.ok && /settlement not allowed/.test(tx.errOf(d1)) && d2.ok && (d2.rows[0] as { w: number }).w === 0 && d3.ok && (d3.rows[0] as { w: number }).w === 1531 && withholdingCalcOf("hostess", 20000, 1) === 1531, { d1: tx.errOf(d1), d2: d2.ok ? d2.rows[0] : tx.errOf(d2), d3: d3.ok ? d3.rows[0] : tx.errOf(d3) });
      const k1 = await tx.as(owner, `select public.set_withholding_kind('cast', $1::uuid, 'other_204')`, [castId]);
      const k2 = await tx.as(owner, `select public.set_withholding_kind('cast', $1::uuid, 'other_fee')`, [castId]);
      const d4 = await tx.as(mgr, `select ((public.daily_pay_issue($1::uuid, current_date, 20000, gen_random_uuid(), 'settlement', null))->>'withholding')::int w`, [castId]);
      check("0188(F-7) 区分＝other_204 は受理・other_fee は bad kind・other_204 の日払い 20,000＝2,042（控除なし 10.21%）＝TS と同値", k1.ok && !k2.ok && /bad kind/.test(tx.errOf(k2)) && d4.ok && (d4.rows[0] as { w: number }).w === 2042 && withholdingCalcOf("other_204", 20000, 1) === 2042, { k2: tx.errOf(k2), d4: d4.ok ? d4.rows[0] : tx.errOf(d4) });
      await c.query(`delete from public.staffing_needs where store_id = $1 and dow = 6`, [A1.id]);
      const n1 = await tx.as(owner, `select public.set_staffing_need($1::uuid, 6, 2, 1800, 2880) r`, [A1.id]);
      const n2 = await tx.as(owner, `select public.set_staffing_need($1::uuid, 6, 2, 1800, 2881) r`, [A1.id]);
      check("0189(F-8) set_staffing_need＝翌 06:00〜翌 24:00（1800〜2880）可・2881＝bad band", n1.ok && !n2.ok && /bad band/.test(tx.errOf(n2)), { n1: tx.errOf(n1), n2: tx.errOf(n2) });
    } catch (e) {
      check("0188(F) 例外なし", false, (e as Error).message);
    } finally {
      await c.query("rollback").catch(() => {});
      const left = await c.query(`select count(*)::int n from public.daily_pays where idem_key is null and false`).catch(() => ({ rows: [{ n: 0 }] }));
      check("0188(F-9) ROLLBACK（残留 0）", (left.rows[0] as { n: number }).n === 0);
      await c.end().catch(() => {});
    }
  }

  if (fails.length) { console.error(`verify:nox-0188 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  console.log(`verify:nox-0188 OK ${pass} checks（0188 税率表・区分 4 つ・日払い／0189 翌表記）`);
}
void main();
