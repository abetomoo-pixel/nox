/*
 * verify:nox-billing — 課金ゲート（mig0087 org_billing/述語2本 ＋ mig0088 ゲート挿入87本）の係留＝段47。
 *   npm run verify:nox-billing（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 正本: docs/NOX_課金設計_v1.md v1.2（§3 述語・§4 read-only 失効）／
 *       docs/NOX_課金ゲート対象_v1.md（対象87・除外83＝本スイートの照合正本）
 *
 * 係留（7観点）:
 *  1 ★集合完全一致: 正本の対象87名 ⟷ live の「prosrc に 'billing locked'」実列挙が双方向一致・
 *    除外83名は不含・zero-arg ラッパ auth_org_billing_writable() を呼ぶ RPC = 0（BANZEN 0139_r2/0145 型の prosrc 機械検証）
 *  2 述語真理値表: 5 status × trialing 期限（未来/過去）× 行なし/null ＝ fail-closed
 *  3 locked org runtime: fixture org を inactive へ倒し、対象代表（規則A/B/C/D 各2本以上）が
 *    'billing locked' 拒否・除外代表（打刻/payroll/receivable/daily_report/shift_wish）は通る・
 *    SELECT/一覧は読める・kiosk 腕（check_open の kiosk 経路）も locked 拒否
 *  4 auth 順序: 未認証（anon）は 'billing locked' より先に 'forbidden'（anon-guard の面を変えない）
 *  5 trialing 境界: trial_ends_at 過去→false・未来→true（★データ生成で作る＝時計モック不使用）
 *  6 fixture 復元は finally（org_billing を active へ戻す）＋掃除 assert
 *  7 ※verify:f0 全走（既存17本・golden 不変）は本スイートの外＝verify:f0 連鎖末尾で担保
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { FIXTURE_USERS, STORE_A1, ORG_A, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

const GATE_DOC = "docs/NOX_課金ゲート対象_v1.md";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
const locked = (e: { message?: string } | null) => has(e, "billing locked");

/** 正本 md から対象/除外の関数名集合を読む（v1.2 の全数照合と同一規則＝注記行・見出しを除外） */
function docNames(sec: string, live: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const l of sec.split(/\r?\n/)) {
    const s = l.trim();
    if (s.startsWith("（") || s.startsWith("※") || s.startsWith("＋") || s.startsWith("#")) continue;
    const body = s.startsWith("|") ? s.replace(/^\|/, "").split("|")[0] : s;
    for (const t of body.replace(/\*\*/g, "").match(/[a-z_][a-z_0-9]{3,}/g) ?? []) if (live.has(t)) out.add(t);
  }
  return out;
}

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  // ══════════════════════════════════════════════════════════
  // 1 集合完全一致（prosrc 機械検証）
  // ══════════════════════════════════════════════════════════
  {
    const { rows: allFn } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`);
    const liveNames = new Set(allFn.map((r) => r.proname as string));
    const md = readFileSync(GATE_DOC, "utf8");
    const docTargets = docNames(md.slice(md.indexOf("## A. 対象"), md.indexOf("## B. 除外")), liveNames);
    const docExcluded = docNames(md.slice(md.indexOf("## B. 除外"), md.indexOf("## C. kiosk")), liveNames);
    // ★mig0089/0090/0091/0095/0096（段48/49/52/53 張り替え）: extension_add・set_people・line_set_group・
    //   staffing_need_remove・store_sales_target_set・receipt_issue/receipt_issue_void 追加で対象 87→94（正本ヘッダ参照）
    // ★mig0101/0102（SD シフト深部・2026-08-21）: 新 RPC 7本（period_set/period_remove/propose/
    //   cast_confirm/auto_apply/auto_clear/rules_set）を A5 へ収載＝対象 94→101・全数 188→195。
    //   設計書 §6 は「新6」だが実測は新7（period_remove 含む）＝実測 pin。
    // ★mig0103（SC シフト作成 v3・2026-08-24）: shift_bulk_set／shift_remove を A5 へ収載＝
    //   対象 101→103・全数 195→197（改修5本は既収載 or B(i) 据え置き＝wish_submit は事実記録のまま）。
    // ★mig0106（M-9 A1・2026-08-27）: set_store_biz_cutoff を A8 へ収載＝対象 103→104・全数 197→198。
    // ★mig0108（M-11b・2026-08-27）: set_store_pin_policy を A8（ゲート済み）へ・staff_pin_status を
    //   B(f) 読取へ収載＝対象 104→105・除外 94→95・全数 198→200。
    // ★mig0112（C3/C4 §6-3・2026-08-28）: set_store_tax_config を A8（ゲート済み）へ収載＝
    //   対象 105→106・全数 200→201（裁定90 予告どおり billing golden が名簿本数として動く）。
    //   set_pricing_rule は 13→14引数化＝名前不変で本数不動（旧署名 DROP は f0 の別 assert で担保）。
    // ★mig0115（C1 §6-3・2026-08-28）: set_comp_component を A7（ゲート済み）へ収載＝
    //   対象 106→107・全数 202→203（set_comp_plan は 16引数化＝名前不変で本数不動）。
    check("段47-1 正本の対象107名を読めた", docTargets.size === 107, `got ${docTargets.size}`);
    // ★E8-6c: B 名簿追補（教訓20 の是正）＝83→93（B(f) 39本化＋B(k) 5本）
    // ★mig0113: check_tax_round（内部ヘルパー・非ゲート）を B へ収載＝除外 95→96・全数 201→202。
    // ★mig0119（R-2b・2026-09-01）: 補助2本 nom_unit4_key / nom_type_summary を B(a) へ収載＝除外 96→98・
    //   全数 203→205。★名簿対象外（A に載せない）の根拠＝両方とも純ヘルパー（IMMUTABLE/STABLE・書込なし）で
    //   4者 revoke 済み＝authenticated から直接実行できず、課金ゲートは呼び出し元の公開 RPC
    //   （check_set_nominations / check_close / drink_claim_*）が既に担う（check_round_amount / check_tax_round と同型）。
    //   この +1 は f0 実走で教訓21 assert が名簿漏れとして検知→収載した実例（2026-08-28）。
    check("段47-1 正本の除外98名を読めた", docExcluded.size === 98, `got ${docExcluded.size}`);

    // ★E8-6c（裁定 E8-6-9・教訓21）: 名簿の全数同期を機械で強制＝live pg_proc 全数 = 正本 A∪B。
    //   ゲート入り新設は pin 波及で赤になるが、非ゲート新設はどの pin も赤にしないまま名簿から漏れる
    //   （0093/0094 で実証＝教訓20）。この assert が silent drift を恒久的に赤にする。
    const docAll = new Set([...docTargets, ...docExcluded]);
    const liveOnly = [...liveNames].filter((n) => !docAll.has(n));
    check("段47-1 ★live 全数 = 正本 A∪B（非ゲート新設の名簿漏れゼロ・教訓21）",
      liveOnly.length === 0 && docAll.size === liveNames.size,
      `liveOnly=[${liveOnly.join(",")}] docAll=${docAll.size} live=${liveNames.size}`);

    const { rows: gated } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosrc like '%billing locked%' order by p.proname`);
    const liveGated = new Set(gated.map((r) => r.proname as string));
    check("段47-1 live のゲート済み関数 = 107本", liveGated.size === 107, `got ${liveGated.size}`);

    const missing = [...docTargets].filter((n) => !liveGated.has(n));
    const extra = [...liveGated].filter((n) => !docTargets.has(n));
    check("段47-1 ★対象→live: 正本の101本すべてにゲートが入っている", missing.length === 0, missing.join(","));
    check("段47-1 ★live→対象: ゲート済みに正本外の関数が混ざらない", extra.length === 0, extra.join(","));
    const leaked = [...docExcluded].filter((n) => liveGated.has(n));
    check("段47-1 ★除外83本にゲートが入っていない", leaked.length === 0, leaked.join(","));

    // zero-arg ラッパを呼ぶ RPC = 0（設計 §3・service 文脈の silently false 罠を構造で封じる）
    const { rows: wrap } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname <> 'auth_org_billing_writable'
         and p.prosrc like '%auth_org_billing_writable%'`);
    check("段47-1 ★zero-arg ラッパを呼ぶ RPC = 0（引数版のみ使用）", wrap.length === 0, wrap.map((r) => r.proname).join(","));
    // 述語参照の総数（92 ＋ ラッパ自身の本文1本）
    const { rows: refs } = await db.query(`
      select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosrc like '%billing_writable_of%'`);
    check("段47-1 述語を参照する関数 = 108（107 ＋ ラッパ自身）", refs[0].n === 108, `got ${refs[0].n}`);
    // 挿入行の形が全92本で同一（引数2種のみ）
    const { rows: shapes } = await db.query(`
      select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and (p.prosrc like '%if not public.billing_writable_of(v_org) then raise exception ''billing locked''; end if;%'
           or p.prosrc like '%if not public.billing_writable_of(public.auth_org_id()) then raise exception ''billing locked''; end if;%')`);
    check("段47-1 挿入行の形が全107本で規約どおり（引数は v_org / auth_org_id() の2種のみ）", shapes[0].n === 107, `got ${shapes[0].n}`);
  }

  // ══════════════════════════════════════════════════════════
  // 2 述語真理値表（5 status × trialing 期限 × 行なし/null）
  // ══════════════════════════════════════════════════════════
  const { data: orgRow } = await admin.from("orgs").select("id").eq("name", ORG_A).single();
  const orgAId = orgRow!.id as string;
  const { data: storeRow } = await admin.from("stores").select("id").eq("name", STORE_A1).single();
  const storeA1 = storeRow!.id as string;

  // 元値の退避（finally 復元用）
  const { data: origBilling } = await admin.from("org_billing").select("*").eq("org_id", orgAId).maybeSingle();
  const setBilling = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from("org_billing").update(patch).eq("org_id", orgAId);
    if (error) throw new Error(`org_billing 更新: ${error.message}`);
  };
  const writable = async (): Promise<boolean> =>
    (await db.query(`select public.billing_writable_of($1) as w`, [orgAId])).rows[0].w as boolean;

  // ★除外側テストで実生成される行の id を捕捉して finally で id 指定削除する
  //   （時間窓や日付での一括 delete は他段の fixture を巻き込みうるため使わない）
  const created = { punches: [] as string[], wishes: [] as string[] };

  try {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const pastTs = new Date(Date.now() - 7 * 86_400_000).toISOString();
    // 5 status × trial 未来（trialing 以外は trial 期限に依存しない）
    const table: Array<[string, string, boolean]> = [
      ["trialing", future, true], ["active", future, true], ["past_due", future, true],
      ["canceled", future, false], ["inactive", future, false],
    ];
    for (const [st, te, expect] of table) {
      await setBilling({ status: st, trial_ends_at: te });
      check(`段47-2 述語: status=${st}・trial 未来 → ${expect}`, (await writable()) === expect, `got ${await writable()}`);
    }
    // ★trialing の期限境界（データ生成のみ・時計モック不使用）
    await setBilling({ status: "trialing", trial_ends_at: pastTs });
    check("段47-5 ★trialing かつ trial_ends_at 過去 → false（期限切れは述語内で倒れる）", (await writable()) === false);
    await setBilling({ status: "trialing", trial_ends_at: future });
    check("段47-5 ★trialing かつ trial_ends_at 未来 → true", (await writable()) === true);
    // active は trial 期限が過去でも true（期限判定は trialing のみに効く）
    await setBilling({ status: "active", trial_ends_at: pastTs });
    check("段47-5 active は trial 期限 過去でも true（期限判定は trialing 限定）", (await writable()) === true);
    // 行なし / null（fail-closed）
    const ghost = randomUUID();
    check("段47-2 ★行なし org → false（fail-closed）",
      ((await db.query(`select public.billing_writable_of($1) as w`, [ghost])).rows[0].w) === false);
    check("段47-2 ★null 引数 → false（fail-closed）",
      ((await db.query(`select public.billing_writable_of(null) as w`)).rows[0].w) === false);

    // ══════════════════════════════════════════════════════════
    // 3 locked org runtime（inactive へ倒して対象/除外の実挙動を確認）
    // ══════════════════════════════════════════════════════════
    const owner = await signIn("ownerA");
    const mgr = await signIn("managerA1");
    const castA = await signIn("castA1a");

    // 事前に「通る」ことを確認するための準備（active 状態で伝票を1枚開けておく）
    await setBilling({ status: "active", trial_ends_at: future });
    const { data: seatRow } = await admin.from("seats").insert({
      org_id: orgAId, store_id: storeA1, name: "NOX-VERIFY-段47卓", kind: "卓", sort_order: 9947, is_active: true,
    }).select("id").single();
    const seatId = seatRow!.id as string;
    const { data: preOpen, error: ePre } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    check("段47-3（準備）active 状態では check_open が通る", !ePre && typeof preOpen === "string", ePre?.message);
    const openCheckId = preOpen as string;

    // ★locked へ
    await setBilling({ status: "inactive" });
    check("段47-3（前提）述語が false になった", (await writable()) === false);

    // 対象代表: 規則A（kiosk 腕）2本
    const { error: eOpen } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    check("段47-3 規則A check_open が 'billing locked'", locked(eOpen), eOpen?.message ?? "通ってしまった");
    const { error: ePay } = await mgr.rpc("check_pay", {
      p_check_id: openCheckId, p_method: "cash", p_amount: 1000, p_pay_group: "A", p_tendered: 1000, p_idem_key: randomUUID(),
    });
    check("段47-3 規則A check_pay が 'billing locked'", locked(ePay), ePay?.message ?? "通ってしまった");
    // 規則B 2本
    const { error: eSeat } = await owner.rpc("set_seat", {
      p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-段47-locked卓", p_kind: "卓", p_sort_order: 9948, p_is_active: true,
    });
    check("段47-3 規則C set_seat が 'billing locked'", locked(eSeat), eSeat?.message ?? "通ってしまった");
    const { error: ePin } = await owner.rpc("set_staff_pin", { p_membership_id: randomUUID(), p_pin: "1234" });
    check("段47-3 規則B set_staff_pin が 'billing locked'（auth より後・入力検証より前）",
      locked(ePin), ePin?.message ?? "通ってしまった");
    // 規則C 2本
    const { error: eComp } = await owner.rpc("set_comp_plan", {
      p_id: null, p_store_id: storeA1, p_name: "NOX-VERIFY-段47プラン", p_base: 5000,
      p_hon_back: 4000, p_jonai_back: 1500, p_dohan_back: 4000,
      p_sales_slide: [], p_point_slide: [], p_is_active: true,
      p_hon_back_mode: "per_count", p_hon_back_rate: null, p_jonai_back_mode: "per_count", p_jonai_back_rate: null,
    });
    check("段47-3 規則C set_comp_plan が 'billing locked'", locked(eComp), eComp?.message ?? "通ってしまった");
    const { error: eNotice } = await mgr.rpc("notice_create", {
      p_title: "NOX-VERIFY-段47", p_body: "locked test", p_audience: "all", p_pinned: false, p_until: null,
    });
    check("段47-3 規則C notice_create が 'billing locked'", locked(eNotice), eNotice?.message ?? "通ってしまった");
    // 規則D 2本
    const { error: ePrice } = await owner.rpc("set_pricing_rule", {
      p_id: null, p_store_id: storeA1, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: 127,
      p_time_from_min: 1200, p_time_to_min: 1260, p_rank_id: null, p_amount: 5000,
      p_duration_min: 60, p_priority: 1, p_is_active: true,
    });
    check("段47-3 規則D set_pricing_rule が 'billing locked'", locked(ePrice), ePrice?.message ?? "通ってしまった");
    // ★mig0112: 新設 set_store_tax_config も locked 中は拒否（A8 追補の runtime 代表＝名簿+1 と対）
    const { error: eTaxCfg } = await owner.rpc("set_store_tax_config", {
      p_store_id: storeA1, p_business_tax_status: "taxable", p_price_display: "tax_included",
      p_invoice_status: "unregistered", p_invoice_reg_no: null, p_tax_rounding: "floor",
      p_card_surcharge_rate: null,
    });
    check("段47-3 規則B set_store_tax_config が 'billing locked'（mig0112 追補）",
      locked(eTaxCfg), eTaxCfg?.message ?? "通ってしまった");
    // ★mig0115: set_comp_component も locked 中は拒否（A7 追補の runtime 代表＝名簿+1 と対）
    const { error: eComp2 } = await owner.rpc("set_comp_component", {
      p_id: null, p_plan_id: randomUUID(), p_kind: "guarantee_min", p_mode: "amount",
      p_amount: 1000, p_rate: null, p_params: {}, p_priority: 100, p_is_active: true,
    });
    check("段47-3 規則B set_comp_component が 'billing locked'（mig0115 追補）",
      locked(eComp2), eComp2?.message ?? "通ってしまった");
    const { error: eStaff } = await owner.rpc("staff_create", {
      p_auth_user_id: randomUUID(), p_email: "nox-verify-dan47@example.com", p_name: "段47", p_store_id: storeA1, p_role: "staff",
    });
    check("段47-3 規則D staff_create が 'billing locked'", locked(eStaff), eStaff?.message ?? "通ってしまった");

    // ★kiosk 腕: kiosk セッションでも locked になることの構造的担保。
    //   kiosk 経路は device token セッションを要するが、ゲートは v_org（= coalesce(auth_org_id, auth_kiosk_org_id)）
    //   を引数に取る**同一の1行**であり、kiosk 経路では v_org が auth_kiosk_org_id() 由来になるだけ。
    //   ＝「認証経路が違っても同じ述語・同じ org に落ちる」ことを prosrc で機械確認する（設計 §3/§4）。
    {
      const { rows: kioskArm } = await db.query(`
        select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname = 'check_open'
           and p.prosrc like '%coalesce(public.auth_org_id(), public.auth_kiosk_org_id())%'
           and p.prosrc like '%billing_writable_of(v_org)%'`);
      check("段47-3 ★kiosk 腕: check_open は v_org（auth_org_id ∨ auth_kiosk_org_id）を引数にゲートしている",
        kioskArm[0].n === 1, `got ${kioskArm[0].n}`);
      check("段47-3 ★kiosk 腕: その check_open が runtime で locked 拒否（org 単位で倒れる＝経路非依存）", locked(eOpen));
      const { rows: armAll } = await db.query(`
        select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public'
           and p.prosrc like '%coalesce(public.auth_org_id(), public.auth_kiosk_org_id())%'
           and p.prosrc like '%billing_writable_of(v_org)%'`);
      check("段47-3 ★kiosk 腕を持つ対象16本すべてが v_org 引数でゲート済み（0089 extension・0090 set_people・0091 line_set_group 込み）", armAll[0].n === 16, `got ${armAll[0].n}`);
    }

    // 除外代表: ★実際に成功する（read-only 失効の要＝止めない側。「locked が出ない」だけでは弱い）
    const { data: punchId, error: ePunch } = await castA.rpc("punch_self", { p_type: "in" });
    check("段47-3 ★除外 punch_self は locked 中でも成功する（打刻＝事実記録・止めない）",
      !ePunch && typeof punchId === "string", ePunch?.message ?? `got ${JSON.stringify(punchId)}`);
    if (typeof punchId === "string") created.punches.push(punchId);
    const { data: runRows, error: eRun } = await mgr.rpc("payroll_run_create", { p_store_id: storeA1, p_period: "2029-07" });
    check("段47-3 ★除外 payroll_run_create は locked 中でも成功する（給与＝清算・止めない）",
      !eRun && Array.isArray(runRows) && runRows.length === 1, eRun?.message ?? JSON.stringify(runRows));
    // ★0103 追随: 提出可能日は「自店の open 期間内」のみ＝seed:f0 の常設 open 期間（2026-07-01〜31）
    //   内の 07-22 を使う（rls F1d の 07-15 と別日＝duplicate wish 回避）。前 run 残骸は下の掃除で除去済み。
    await admin.from("shift_wishes").delete().eq("store_id", storeA1).eq("date", "2026-07-22"); // 裁定E: 前 run 残骸の掃除（失敗中断に備えた冪等化）
    const { data: wishId, error: eWish } = await castA.rpc("shift_wish_submit", { p_date: "2026-07-22", p_start_hm: "20:00", p_end_hm: "24:00" });
    check("段47-3 ★除外 shift_wish_submit は locked 中でも成功する（希望提出＝事実記録）",
      !eWish && typeof wishId === "string", eWish?.message ?? `got ${JSON.stringify(wishId)}`);
    if (typeof wishId === "string") created.wishes.push(wishId);
    const { error: eRecv } = await mgr.rpc("receivable_collect", {
      p_receivable_id: randomUUID(), p_biz_date: "2029-07-15", p_method: "cash", p_note: null, p_idem_key: randomUUID(),
    });
    check("段47-3 ★除外 receivable_collect は locked を出さない（清算・不在 id ゆえ別エラー）",
      !locked(eRecv), eRecv?.message ?? "ok");
    const { error: eDaily } = await mgr.rpc("daily_report_close", {
      p_store_id: storeA1, p_biz_date: "2029-07-15", p_expense: 0, p_cash_payout: 0, p_cash_float: 0,
      p_counted_cash: null, p_note: null, p_force: false, p_idem_key: randomUUID(),
    });
    check("段47-3 ★除外 daily_report_close は locked を出さない（清算・事実記録）",
      !locked(eDaily), eDaily?.message ?? "ok");

    // ★SELECT / 一覧は読める（「見える・出せる」原則）
    const { data: selSeats, error: eSelSeat } = await mgr.from("seats").select("id").eq("store_id", storeA1);
    check("段47-3 ★locked でも seats を SELECT できる", !eSelSeat && (selSeats ?? []).length > 0, eSelSeat?.message);
    const { data: selChecks, error: eSelChk } = await mgr.from("checks").select("id").limit(5);
    check("段47-3 ★locked でも checks を SELECT できる", !eSelChk, eSelChk?.message);
    const { data: selProd, error: eSelProd } = await mgr.from("products").select("id").limit(5);
    check("段47-3 ★locked でも products を SELECT できる（エクスポート源は不触）", !eSelProd, eSelProd?.message);
    const { data: salesRows, error: eSales } = await mgr.rpc("get_cast_sales", {
      p_store_id: storeA1, p_from: "2029-07-01", p_to: "2029-07-31",
    });
    check("段47-3 ★locked でも読取 RPC（get_cast_sales）が通る", !eSales && Array.isArray(salesRows), eSales?.message);

    // ══════════════════════════════════════════════════════════
    // 4 auth 順序（未認証は billing より先に forbidden）
    // ══════════════════════════════════════════════════════════
    const { error: eAnonOpen } = await anon.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    check("段47-4 ★anon check_open は 'billing locked' ではなく BLOCKED/forbidden（anon-guard の面不変）",
      !locked(eAnonOpen) && !!eAnonOpen, eAnonOpen?.message ?? "通ってしまった");
    const { error: eAnonComp } = await anon.rpc("set_comp_plan", {
      p_id: null, p_store_id: storeA1, p_name: "x", p_base: 1, p_hon_back: 0, p_jonai_back: 0, p_dohan_back: 0,
      p_sales_slide: [], p_point_slide: [], p_is_active: true,
    });
    check("段47-4 ★anon set_comp_plan も billing より先に遮断",
      !locked(eAnonComp) && !!eAnonComp, eAnonComp?.message ?? "通ってしまった");

    // 復帰確認: active に戻すと対象 RPC が再び通る
    await setBilling({ status: "active", trial_ends_at: future });
    const { data: reopen, error: eReopen } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
    check("段47-3 ★active へ復帰すると check_open が再び通る（可逆）", !eReopen && typeof reopen === "string", eReopen?.message);
    if (typeof reopen === "string") {
      await admin.from("check_lines").delete().eq("check_id", reopen);
      await admin.from("checks").delete().eq("id", reopen);
    }
  } finally {
    // ══════════════════════════════════════════════════════════
    // 6 fixture 復元（org_billing を元値へ・段47 生成物の掃除）
    // ══════════════════════════════════════════════════════════
    if (origBilling) {
      await admin.from("org_billing").update({
        status: origBilling.status, trial_ends_at: origBilling.trial_ends_at,
        interval: origBilling.interval, collection_method: origBilling.collection_method,
        quantity: origBilling.quantity, current_period_end: origBilling.current_period_end,
      }).eq("org_id", orgAId);
    }
    const { data: seats47 } = await admin.from("seats").select("id").like("name", "NOX-VERIFY-段47%");
    const seatIds = (seats47 ?? []).map((r) => r.id as string);
    if (seatIds.length) {
      const { data: chks } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const ids = (chks ?? []).map((r) => r.id as string);
      if (ids.length) {
        for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
          await admin.from(t).delete().in("check_id", ids);
        }
        await admin.from("checks").delete().in("id", ids);
      }
      await admin.from("seats").delete().in("id", seatIds);
    }
    await admin.from("comp_plans").delete().like("name", "NOX-VERIFY-段47%");
    await admin.from("payroll_runs").delete().eq("store_id", storeA1).eq("period", "2029-07");
    // ★除外側テストの生成物は id 指定で消す（他段の fixture を巻き込まない）
    if (created.wishes.length) await admin.from("shift_wishes").delete().in("id", created.wishes);
    if (created.punches.length) await admin.from("punches").delete().in("id", created.punches);
    await admin.from("daily_reports").delete().eq("store_id", storeA1).eq("biz_date", "2029-07-15");
  }

  // 掃除 assert（復元の実測）
  {
    const { data: after } = await admin.from("org_billing").select("status, trial_ends_at").eq("org_id", orgAId).single();
    check("段47-6 ★fixture 復元: org_billing.status が元値へ戻った",
      after?.status === (origBilling?.status ?? "active"), `got ${after?.status}`);
    const { rows: w } = await db.query(`select public.billing_writable_of($1) as w`, [orgAId]);
    check("段47-6 ★復元後は writable=true（後続スイートの前提を壊さない）", w[0].w === true, `got ${w[0].w}`);
    const { data: seatsLeft } = await admin.from("seats").select("id").like("name", "NOX-VERIFY-段47%");
    check("段47-6 掃除確認: 段47 の専用卓 0行", (seatsLeft ?? []).length === 0, `got ${(seatsLeft ?? []).length}`);
    const { data: plansLeft } = await admin.from("comp_plans").select("id").like("name", "NOX-VERIFY-段47%");
    check("段47-6 掃除確認: 段47 のプラン 0行", (plansLeft ?? []).length === 0, `got ${(plansLeft ?? []).length}`);
    const { data: runLeft } = await admin.from("payroll_runs").select("id").eq("store_id", storeA1).eq("period", "2029-07");
    check("段47-6 掃除確認: 段47 の payroll_run 0行", (runLeft ?? []).length === 0, `got ${(runLeft ?? []).length}`);
    // ★除外側の生成物（打刻・希望）が残っていない＝anon-guard/rls の固定カウントを汚さない
    const { data: pLeft } = created.punches.length
      ? await admin.from("punches").select("id").in("id", created.punches) : { data: [] };
    const { data: wLeft } = created.wishes.length
      ? await admin.from("shift_wishes").select("id").in("id", created.wishes) : { data: [] };
    check("段47-6 ★掃除確認: 除外側で生成した打刻・シフト希望 0行（後続スイートの固定カウント非汚染）",
      (pLeft ?? []).length === 0 && (wLeft ?? []).length === 0,
      `punch=${(pLeft ?? []).length} wish=${(wLeft ?? []).length}`);
  }

  await db.end();
  for (const f of fails) console.error("  FAIL:", f);
  if (fails.length) { console.error(`verify:nox-billing FAIL ${fails.length} / pass ${pass}`); process.exit(1); }
  console.log(`verify:nox-billing ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("verify:nox-billing 実行エラー:", e?.message ?? e);
  process.exit(1);
});
