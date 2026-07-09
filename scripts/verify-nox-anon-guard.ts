/*
 * verify:nox-anon-guard — anon / authenticated プローブ（BANZEN verify-rpc-anon-guard の構造を翻訳）。
 *   npm run verify:nox-anon-guard（事前に seed:f0）
 *
 * 判定: "permission denied for function" = BLOCKED（grant/revoke で遮断）
 *       それ以外（本体 raise / データ返却）= EXECUTABLE（本体に入れた）
 *
 * 段1（0001 適用後）: 認可ヘルパー4本は anon BLOCKED 必須（revoke public, anon 済み）。
 * 段2（0002/0004 適用後）: audit_log_write は完全内部専用＝
 *       anon かつ authenticated の両方で BLOCKED を能動 assert（BANZEN pos_order_recalc 型）。
 * 段3（0003 適用後）: 6テーブルは anon の select 自体が permission denied（revoke all 済み）。
 * 段4（0005 適用後）: F1a の書込 RPC 3本（set_product/set_seat/product_stock_add）は anon BLOCKED 必須。
 *       新テーブル4本（products/seats/bottle_keeps/stock_logs）も anon select DENIED。
 * 段5（0006/0007 適用後）: F1b の公開 RPC 7本（check_open/set_nominations/add_line/remove_line/
 *       pay/close/void）は anon BLOCKED 必須。会計6テーブルも anon select DENIED。
 *       内部3本（check_round_amount/check_group_due/check_recalc）は anon かつ authenticated の
 *       両方で BLOCKED（pos_order_recalc 型）。
 * 段6（0008/0009 適用後）: F1d の RPC 9本（cast セルフ4＋管理系5）は anon BLOCKED 必須。
 *       勤怠5テーブルも anon select DENIED。
 * 段7（0010 適用後）: F1e の daily_report_close/reclose は anon BLOCKED 必須。
 *       daily_reports も anon select DENIED。内部 daily_report_aggregate は両ロール BLOCKED。
 * 段8（0012/0013 適用後）: F2a の報酬マスタ RPC 6本（set_comp_plan/set_cast_plan/set_cast_norm/
 *       set_deduction/set_penalty_config/set_custom_back_def）は anon BLOCKED 必須。
 *       マスタ6テーブルも anon select DENIED。内部 comp_plan_slide_check は両ロール BLOCKED。
 * 段9（0014 適用後）: F2a-2 の get_cast_sales は anon BLOCKED 必須。
 *       内部 cast_sales_aggregate は anon かつ authenticated の両方で BLOCKED。
 * 段10（0015 適用後）: F2b の set/get_cast_sensitive・set_cast_tax_profile は anon BLOCKED 必須。
 *       cast_sensitive/cast_tax_profiles も anon select DENIED（cast_sensitive は grant0＝全ロール）。
 * 段14（0022 適用後）: F3a-1 staff 機能別フラグの実効ゲート。can_register=false staff は会計6RPC が
 *       本体 raise 'forbidden'（grant はあるので permission denied でなく flag ゲートの実測）・
 *       can_register=true staff は open→add/remove→nominations→pay→close の実 INSERT が通る
 *       （★prosrc green ≠ runtime success）。専用卓を service で用意し前後で伝票を全消し＝他 verify と非干渉。
 * 段15（0023 適用後）: F3a-2 顧客CRM の実効ゲート（runtime 実測）。
 *       customer_register/update＝owner/manager/staff(can_crm) 実 INSERT/UPDATE 成功・
 *       can_crm=false staff（can_register=true でも）/cast は forbidden。
 *       customer_assign_cast＝owner/manager のみ（staff は can_crm でも forbidden・不在 cast は invalid cast）。
 *       customer_summary/list_summary＝cast は担当客のみ（他 cast 客は forbidden/不可視）・
 *       can_crm=false staff は summary forbidden/list 0行・churn_tier ゴールデン（none/mid/high）。
 *       bottle_keep_register＝can_register 準拠（会計オペ）・越境客 invalid customer・
 *       不在/inactive product は bad item/inactive item。
 *       link 回帰＝check_open customer 紐付きで open→pay(ar) の receivables.customer_id 連動・
 *       他店/他 org 客は invalid customer・customer 省略（null）は従来どおり開ける（回帰）。
 *       生成した customers/bottle_keeps/伝票は末尾で全消し＝verify:nox-rls の固定カウントと非干渉。
 * 正常系対照: authenticated では auth_role() が実行可能で正しいロールを返す
 *       （プローブ手法が BLOCKED と EXECUTABLE を区別できている裏取り）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, FIXTURE_CUSTOMERS, STORE_A1, STORE_A2, loadEnvOrExit, type FixtureUserKey } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY", // 段14 専用（専用卓の用意と伝票掃除・service 経路）
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

function isFnBlocked(error: { message?: string } | null): boolean {
  return !!error?.message?.includes("permission denied for function");
}

async function main() {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 段1: 認可ヘルパー4本 anon BLOCKED ──
  for (const fn of ["auth_org_id", "auth_role", "auth_store_id", "auth_cast_id"]) {
    const { error } = await anon.rpc(fn);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段2a: audit_log_write anon BLOCKED ──
  {
    const { error } = await anon.rpc("audit_log_write", { p_action: "probe" });
    check("anon audit_log_write BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段4a: F1a 書込 RPC 3本 anon BLOCKED ──
  {
    const { error } = await anon.rpc("set_product", {
      p_id: null, p_store_id: null, p_type: null, p_category: null, p_name: null,
      p_price: null, p_cost: null, p_back_mode: null, p_back_value: null,
      p_unit4: null, p_hon_pt: null, p_is_active: null,
    });
    check("anon set_product BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }
  {
    const { error } = await anon.rpc("set_seat", {
      p_id: null, p_store_id: null, p_name: null, p_kind: null, p_sort_order: null, p_is_active: null,
    });
    check("anon set_seat BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }
  {
    const { error } = await anon.rpc("product_stock_add", {
      p_product_id: null, p_delta: null, p_reason: null,
    });
    check("anon product_stock_add BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段5a: F1b 公開 RPC 7本 anon BLOCKED ──
  const F1B_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["check_open", { p_seat_id: null, p_people: null, p_nom_type: null }],
    ["check_set_nominations", { p_check_id: null, p_nom_type: null, p_nominations: null }],
    ["check_add_line", { p_check_id: null, p_product_id: null, p_qty: null, p_kind: null, p_pay_group: null, p_name: null, p_unit_price: null }],
    ["check_remove_line", { p_line_id: null }],
    ["check_pay", { p_check_id: null, p_method: null, p_amount: null, p_pay_group: null, p_tendered: null, p_idem_key: null }],
    ["check_close", { p_check_id: null, p_idem_key: null }],
    ["check_void", { p_check_id: null, p_reason: null }],
  ];
  for (const [fn, args] of F1B_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段6a: F1d RPC 9本 anon BLOCKED ──
  const F1D_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["shift_wish_submit", { p_date: null, p_start_hm: null, p_end_hm: null }],
    ["shift_wish_withdraw", { p_wish_id: null }],
    ["punch_self", { p_type: null, p_lat: null, p_lng: null }],
    ["attendance_set_self", { p_date: null, p_status: null, p_eta: null, p_reason: null }],
    ["shift_wish_decide", { p_wish_id: null, p_accept: null }],
    ["shift_set", { p_id: null, p_cast_id: null, p_date: null, p_start_hm: null, p_end_hm: null, p_status: null }],
    ["punch_proxy", { p_cast_id: null, p_type: null, p_note: null }],
    ["attendance_set", { p_cast_id: null, p_date: null, p_status: null, p_eta: null, p_reason: null }],
    ["set_staffing_need", { p_store_id: null, p_dow: null, p_required: null }],
  ];
  for (const [fn, args] of F1D_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段7a: F1e 日報 RPC 2本 anon BLOCKED ──
  const F1E_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["daily_report_close", { p_store_id: null, p_biz_date: null, p_expense: null, p_cash_payout: null, p_cash_float: null, p_counted_cash: null, p_note: null, p_force: null, p_idem_key: null }],
    ["daily_report_reclose", { p_report_id: null, p_expense: null, p_cash_payout: null, p_cash_float: null, p_counted_cash: null, p_note: null, p_force: null }],
    ["get_cast_ranking", { p_store_id: null, p_period: null }], // F1f（mig0011）
  ];
  for (const [fn, args] of F1E_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段8a: F2a 報酬マスタ RPC 6本 anon BLOCKED ──
  const F2A_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["set_comp_plan", { p_id: null, p_store_id: null, p_name: null, p_base: null, p_hon_back: null, p_jonai_back: null, p_dohan_back: null, p_sales_slide: null, p_point_slide: null, p_is_active: null }],
    ["set_cast_plan", { p_cast_id: null, p_plan_id: null, p_overrides: null }],
    ["set_cast_norm", { p_cast_id: null, p_period: null, p_days_target: null, p_dohan_target: null }],
    ["set_deduction", { p_id: null, p_store_id: null, p_name: null, p_amount: null, p_per: null, p_is_active: null }],
    ["set_penalty_config", { p_store_id: null, p_fine_absent: null, p_fine_late: null, p_hours_per_shift: null, p_norm_on: null, p_norm_days_flat: null, p_norm_days_per: null, p_norm_dohan_flat: null, p_norm_dohan_per: null, p_late_grace_min: null, p_early_grace_min: null, p_over_grace_min: null }],
    ["set_custom_back_def", { p_id: null, p_store_id: null, p_name: null, p_basis: null, p_value: null, p_cond: null, p_is_active: null }],
  ];
  for (const [fn, args] of F2A_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段9a: F2a-2 get_cast_sales anon BLOCKED ──
  {
    const { error } = await anon.rpc("get_cast_sales", { p_store_id: null, p_from: null, p_to: null });
    check("anon get_cast_sales BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段10a: F2b 機密/税務 RPC 3本 anon BLOCKED ──
  const F2B_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["set_cast_sensitive", { p_cast_id: null, p_real_name: null, p_birthday: null, p_mynumber: null }],
    ["get_cast_sensitive", { p_cast_id: null }],
    ["set_cast_tax_profile", { p_cast_id: null, p_mode: null, p_invoice: null, p_reg_no: null }],
  ];
  for (const [fn, args] of F2B_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段11a: F2c 給与確定 RPC anon BLOCKED（mig0016）──
  //   payroll_run_create=authenticated grant／finalize・mark_paid=service_role 限定／
  //   period_bounds=authenticated+service_role grant。いずれも anon には grant なし＝BLOCKED。
  const F2C_ANON_PROBES: Array<[string, Record<string, unknown>]> = [
    ["payroll_run_create", { p_store_id: null, p_period: null }],
    ["payroll_finalize", { p_org_id: null, p_actor: null, p_run_id: null, p_idem_key: null, p_payslips: null }],
    ["payroll_mark_paid", { p_org_id: null, p_actor: null, p_run_id: null, p_idem_key: null }],
    ["period_bounds", { p_period: null }],
    // #32 出勤インセンティブ（mig0017・authenticated grant＝anon のみ BLOCKED）
    ["incentive_publish", { p_store_id: null, p_biz_date: null, p_kind: null, p_amount_mode: null, p_amount: null }],
    ["incentive_cancel", { p_incentive_id: null }],
  ];
  for (const [fn, args] of F2C_ANON_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段12a: F2e-2 前借り/送り/okuri_mode RPC 5本 anon BLOCKED（mig0019・authenticated grant）──
  const F2E2_ANON_PROBES: Array<[string, Record<string, unknown>]> = [
    ["adv_issue", { p_store_id: null, p_cast_id: null, p_amount: null, p_advanced_on: null, p_note: null }],
    ["adv_cancel", { p_advance_id: null }],
    ["transport_issue", { p_store_id: null, p_cast_id: null, p_amount: null, p_biz_date: null, p_note: null }],
    ["transport_cancel", { p_transport_id: null }],
    ["set_store_okuri_mode", { p_store_id: null, p_mode: null }],
  ];
  for (const [fn, args] of F2E2_ANON_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段13a: F2d mynumber/payment RPC anon BLOCKED（mig0021）──
  //   get_cast_mynumber=service_role 限定（anon grant なし）／masked=authenticated＋service_role／
  //   payment_record_add=authenticated。いずれも anon には grant なし＝BLOCKED。
  const F2D_ANON_PROBES: Array<[string, Record<string, unknown>]> = [
    ["get_cast_mynumber", { p_org_id: null, p_actor: null, p_cast_id: null }],
    ["get_cast_mynumber_masked", { p_cast_id: null }],
    ["payment_record_add", { p_run_id: null, p_cast_id: null, p_amount: null, p_paid_at: null, p_method: null, p_note: null, p_idem_key: null }],
  ];
  for (const [fn, args] of F2D_ANON_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段15a: F3a-2 顧客CRM RPC 6本 anon BLOCKED（mig0023・authenticated grant）──
  const F3A2_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["customer_register", { p_store_id: null, p_name: null, p_furigana: null, p_birthday: null, p_tel: null, p_prefs: null, p_memo: null, p_cast_id: null }],
    ["customer_update", { p_id: null, p_name: null, p_furigana: null, p_birthday: null, p_tel: null, p_prefs: null, p_memo: null, p_is_active: null }],
    ["customer_assign_cast", { p_id: null, p_cast_id: null }],
    ["customer_summary", { p_customer_id: null }],
    ["customer_list_summary", { p_store_id: null }],
    ["bottle_keep_register", { p_store_id: null, p_customer_id: null, p_product_id: null, p_note: null }],
  ];
  for (const [fn, args] of F3A2_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段5b: 内部関数は anon でも BLOCKED ──
  const INTERNAL_PROBES: Array<[string, Record<string, unknown>]> = [
    ["check_round_amount", { p_amount: 1, p_unit: 1, p_mode: "down" }],
    ["check_group_due", { p_check_id: null, p_pay_group: "A" }],
    ["check_recalc", { p_check_id: null }],
    ["daily_report_aggregate", { p_store_id: null, p_biz_date: null, p_cutoff_hm: null, p_tax_rate: null }],
    ["comp_plan_slide_check", { p_slide: null }], // 段8b（F2a 内部）
    ["cast_sales_aggregate", { p_store_id: null, p_from: null, p_to: null }], // 段9b（F2a-2 内部）
  ];
  for (const [fn, args] of INTERNAL_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED（内部専用）`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段3＋段4b＋段5c: 全テーブル anon select は permission denied ──
  for (const table of [
    "orgs", "stores", "users", "memberships", "casts", "audit_logs",
    "products", "seats", "bottle_keeps", "stock_logs",
    "checks", "check_nominations", "check_lines", "payments", "check_cast_backs", "receivables",
    "shift_wishes", "shifts", "attendance", "punches", "staffing_needs",
    "daily_reports",
    "comp_plans", "cast_plan", "cast_norms", "deductions", "penalty_config", "custom_back_defs",
    "cast_sensitive", "cast_tax_profiles",
    "payroll_runs", "payslips",
    "attendance_incentives",
    "advances", "transport",
    "payment_records",
    "customers", // F3a-2（mig0023）
  ]) {
    // PK=cast_id のテーブルは id 列なし。存在しない列だと権限エラーの前に列エラーになるため列名を合わせる。
    const pkCastId = ["cast_plan", "cast_sensitive", "cast_tax_profiles"].includes(table);
    const { error } = await anon.from(table).select(pkCastId ? "cast_id" : "id").limit(1);
    check(
      `anon ${table} select DENIED`,
      !!error?.message?.includes("permission denied"),
      error?.message ?? "実行できてしまった（0行でも grant 面の遮断が期待値）",
    );
  }

  // ── 段2b: authenticated（castA1a）でも audit_log_write BLOCKED（内部専用）──
  const authed = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: eSignIn } = await authed.auth.signInWithPassword({
    email: FIXTURE_USERS.castA1a.email,
    password: env.SEED_PASSWORD,
  });
  if (eSignIn) {
    fails.push(`castA1a サインイン失敗（seed:f0 実行済みか確認）: ${eSignIn.message}`);
  } else {
    const { error } = await authed.rpc("audit_log_write", { p_action: "probe" });
    check("authenticated audit_log_write BLOCKED（内部専用）", isFnBlocked(error), error?.message ?? "実行できてしまった");

    // 段5b: 内部3本は authenticated でも BLOCKED（両ロール能動 assert）
    for (const [fn, args] of INTERNAL_PROBES) {
      const { error: eInt } = await authed.rpc(fn, args);
      check(`authenticated ${fn} BLOCKED（内部専用）`, isFnBlocked(eInt), eInt?.message ?? "実行できてしまった");
    }

    // 段11b: F2c finalize/mark_paid は service_role 限定＝authenticated でも BLOCKED（positive assert）
    const F2C_SVC_ONLY: Array<[string, Record<string, unknown>]> = [
      ["payroll_finalize", { p_org_id: null, p_actor: null, p_run_id: null, p_idem_key: null, p_payslips: null }],
      ["payroll_mark_paid", { p_org_id: null, p_actor: null, p_run_id: null, p_idem_key: null }],
    ];
    for (const [fn, args] of F2C_SVC_ONLY) {
      const { error: eSvc } = await authed.rpc(fn, args);
      check(`authenticated ${fn} BLOCKED（service_role 限定）`, isFnBlocked(eSvc), eSvc?.message ?? "実行できてしまった");
    }

    // 段13b: F2d get_cast_mynumber（full 平文）は service_role 限定＝authenticated でも BLOCKED（positive assert）
    {
      const { error: eFull } = await authed.rpc("get_cast_mynumber", { p_org_id: null, p_actor: null, p_cast_id: null });
      check("authenticated get_cast_mynumber BLOCKED（service_role 限定・full 平文封鎖）", isFnBlocked(eFull), eFull?.message ?? "実行できてしまった");
    }

    // 正常系対照: authenticated でヘルパーは実行可能・正しいロール
    const { data, error: eRole } = await authed.rpc("auth_role");
    check("authenticated auth_role EXECUTABLE（対照）", !eRole && data === "cast", eRole?.message ?? `got ${JSON.stringify(data)}`);
    await authed.auth.signOut();
  }

  // ── 段14: F3a-1（mig0022）staff 機能別フラグの実効ゲート（runtime 実測）──
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signInStaff = async (key: "staffRegOnA1" | "staffRegOffA1") => {
      const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await c.auth.signInWithPassword({
        email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD,
      });
      if (error) {
        fails.push(`段14 ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
        return null;
      }
      return c;
    };
    const forbidden = (e: { message?: string } | null) => !!e?.message?.includes("forbidden");

    // 準備（service）: 専用卓を query-or-insert（再実行で増殖させない）
    const { data: storeRow } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    let seatId = "";
    {
      const { data: sExist } = await admin.from("seats").select("id")
        .eq("store_id", storeRow!.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
      if (sExist?.length) {
        seatId = sExist[0].id as string;
      } else {
        const { data: sNew, error: eS } = await admin.from("seats").insert({
          org_id: storeRow!.org_id, store_id: storeRow!.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
        }).select("id").single();
        if (eS || !sNew) fails.push(`段14 専用卓の用意失敗: ${eS?.message}`);
        else seatId = sNew.id as string;
      }
    }
    // 再実行冪等: 専用卓の伝票を service で全消し（子→親の FK 順）
    const wipeSeatChecks = async () => {
      const { data: cs } = await admin.from("checks").select("id").eq("seat_id", seatId);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (!ids.length) return;
      for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
        await admin.from(t).delete().in("check_id", ids);
      }
      await admin.from("checks").delete().in("id", ids);
    };
    await wipeSeatChecks();

    const on = seatId ? await signInStaff("staffRegOnA1") : null;
    const off = seatId ? await signInStaff("staffRegOffA1") : null;
    if (on && off) {
      // ① ON: check_open 実 INSERT（伝票行が物理生成される）
      const { data: chkId, error: eOpen } = await on.rpc("check_open", { p_seat_id: seatId, p_people: 2, p_nom_type: "free" });
      check("段14 can_register=true staff check_open 成功（実 INSERT）", !eOpen && typeof chkId === "string", eOpen?.message);
      // ② ON: 行追加（OFF の remove_line プローブ対象に使う実在行）
      const { data: lineTmp, error: eL0 } = await on.rpc("check_add_line", {
        p_check_id: chkId, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: "PERM検証セットA", p_unit_price: 5_000,
      });
      check("段14 can_register=true staff check_add_line 成功（実 INSERT）", !eL0 && typeof lineTmp === "string", eL0?.message);

      // ③ OFF: 実在 seat/check/line に対して 6RPC 全て本体 raise 'forbidden'
      //    （実在 id・org/店一致＝ゲートまで確実に到達し flag だけで落ちる。open の再利用ルックアップより前にゲート）
      const { error: eO1 } = await off.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
      check("段14 can_register=false staff check_open forbidden", forbidden(eO1), eO1?.message ?? "通ってしまった");
      const { error: eO2 } = await off.rpc("check_set_nominations", { p_check_id: chkId, p_nom_type: "free", p_nominations: [] });
      check("段14 can_register=false staff check_set_nominations forbidden", forbidden(eO2), eO2?.message ?? "通ってしまった");
      const { error: eO3 } = await off.rpc("check_add_line", {
        p_check_id: chkId, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: "侵入", p_unit_price: 100,
      });
      check("段14 can_register=false staff check_add_line forbidden", forbidden(eO3), eO3?.message ?? "通ってしまった");
      const { error: eO4 } = await off.rpc("check_remove_line", { p_line_id: lineTmp });
      check("段14 can_register=false staff check_remove_line forbidden", forbidden(eO4), eO4?.message ?? "通ってしまった");
      const { error: eO5 } = await off.rpc("check_pay", {
        p_check_id: chkId, p_method: "cash", p_amount: 1000, p_pay_group: "A", p_tendered: 1000, p_idem_key: null,
      });
      check("段14 can_register=false staff check_pay forbidden", forbidden(eO5), eO5?.message ?? "通ってしまった");
      const { error: eO6 } = await off.rpc("check_close", { p_check_id: chkId, p_idem_key: null });
      check("段14 can_register=false staff check_close forbidden", forbidden(eO6), eO6?.message ?? "通ってしまった");

      // ④ ON: 残り4RPC を実運転で完走（remove→再追加→指名→pay→close＝6RPC 全て実行済みに）
      const { error: eRm } = await on.rpc("check_remove_line", { p_line_id: lineTmp });
      check("段14 can_register=true staff check_remove_line 成功（実 DELETE）", !eRm, eRm?.message);
      const { error: eL1 } = await on.rpc("check_add_line", {
        p_check_id: chkId, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: "PERM検証セットB", p_unit_price: 10_000,
      });
      check("段14 can_register=true staff 行再追加 成功", !eL1, eL1?.message);
      const { data: castRows } = await on.from("casts").select("id").eq("name", FIXTURE_USERS.castA1a.name).limit(1);
      const castId = castRows?.[0]?.id as string | undefined;
      const { error: eNom } = await on.rpc("check_set_nominations", {
        p_check_id: chkId, p_nom_type: "jonai", p_nominations: [{ cast_id: castId, weight: 1 }],
      });
      check("段14 can_register=true staff check_set_nominations 成功", !eNom, eNom?.message);
      // due = 10,000 + サ10% → 100円切捨 = 11,000（NOX-VERIFY 店は settings 未設定＝既定 10/100/down）
      const { error: ePay } = await on.rpc("check_pay", {
        p_check_id: chkId, p_method: "cash", p_amount: 11_000, p_pay_group: "A", p_tendered: 11_000, p_idem_key: randomUUID(),
      });
      check("段14 can_register=true staff check_pay 成功（実 INSERT）", !ePay, ePay?.message);
      const { data: closed, error: eCl } = await on.rpc("check_close", { p_check_id: chkId, p_idem_key: randomUUID() });
      check("段14 can_register=true staff check_close 成功", !eCl && closed === chkId, eCl?.message ?? `got ${JSON.stringify(closed)}`);
      // 実 INSERT の物理確認（ON staff の SELECT 可視で status/total を実測）
      const { data: chkRow } = await on.from("checks").select("status, total").eq("id", chkId as string).single();
      check("段14 実 INSERT 確認: status=closed・total=11000", chkRow?.status === "closed" && chkRow?.total === 11_000, JSON.stringify(chkRow));

      // 後片付け（専用卓の伝票を除去＝verify:nox-rls の F1e 伝票棚卸しと非干渉）
      await wipeSeatChecks();
      await on.auth.signOut();
      await off.auth.signOut();
    }
  }

  // ── 段15: F3a-2（mig0023）顧客CRM RPC の実効ゲート＋link 回帰（runtime 実測）──
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const sessions = new Map<FixtureUserKey, SupabaseClient>();
    const signInUser = async (key: FixtureUserKey) => {
      const cached = sessions.get(key);
      if (cached) return cached;
      const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await c.auth.signInWithPassword({
        email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD,
      });
      if (error) {
        fails.push(`段15 ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
        return null;
      }
      sessions.set(key, c);
      return c;
    };
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    // 準備（service）: 固定 fixture の id を取得＋前回失敗遺物の掃除（段15 生成物は名前で識別）
    const { data: storeRows } = await admin.from("stores").select("id, name, org_id")
      .in("name", [STORE_A1, STORE_A2]);
    const storeA1 = storeRows?.find((s) => s.name === STORE_A1);
    const storeA2 = storeRows?.find((s) => s.name === STORE_A2);
    const { data: custRows } = await admin.from("customers").select("id, name")
      .like("name", "NOX-VERIFY-顧客%");
    const custIdOf = (name: string) => custRows?.find((c) => c.name === name)?.id as string;
    const custCastA = custIdOf(FIXTURE_CUSTOMERS.custCastA.name);
    const custCastB = custIdOf(FIXTURE_CUSTOMERS.custCastB.name);
    const custA2 = custIdOf(FIXTURE_CUSTOMERS.custA2.name);
    const custB1 = custIdOf(FIXTURE_CUSTOMERS.custB1.name);
    const { data: castRows } = await admin.from("casts").select("id, name")
      .eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", storeA1!.id);
    const castA1aId = castRows?.[0]?.id as string;
    check("段15（準備）fixture 顧客/店/cast の id 解決",
      !!storeA1 && !!storeA2 && !!custCastA && !!custCastB && !!custA2 && !!custB1 && !!castA1aId);
    // 前回失敗遺物の掃除（再実行冪等）
    await admin.from("bottle_keeps").delete().eq("note", "NOX-VERIFY-段15");
    await admin.from("customers").delete().like("name", "NOX-VERIFY-段15%");
    await admin.from("products").delete().like("name", "NOX-VERIFY-段15%");

    const owner = await signInUser("ownerA");
    const mgr = await signInUser("managerA1");
    const crm = await signInUser("staffCrmOnA1");
    const regOn = await signInUser("staffRegOnA1");
    const regOff = await signInUser("staffRegOffA1");
    const cast = await signInUser("castA1a");
    if (owner && mgr && crm && regOn && regOff && cast) {
      const createdCustIds: string[] = [];

      // ① customer_register 権限マトリクス（★実 INSERT を physical row で確認）
      const { data: cO, error: eRO } = await owner.rpc("customer_register", {
        p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-客owner",
      });
      check("段15 owner customer_register 成功（実 INSERT）", !eRO && typeof cO === "string", eRO?.message);
      if (typeof cO === "string") createdCustIds.push(cO);
      // owner は org 内他店（A2）にも登録できる（org 全店スコープの positive）
      const { data: cO2, error: eRO2 } = await owner.rpc("customer_register", {
        p_store_id: storeA2!.id, p_name: "NOX-VERIFY-段15-客ownerA2",
      });
      check("段15 owner 他店 A2 へ customer_register 成功（org 全店）", !eRO2 && typeof cO2 === "string", eRO2?.message);
      if (typeof cO2 === "string") createdCustIds.push(cO2);
      const { data: cM, error: eRM } = await mgr.rpc("customer_register", {
        p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-客manager", p_cast_id: castA1aId,
      });
      check("段15 manager customer_register 成功（担当 cast 付き）", !eRM && typeof cM === "string", eRM?.message);
      if (typeof cM === "string") createdCustIds.push(cM);
      // manager の他店（A2）登録は forbidden（自店スコープ）
      const { error: eRMx } = await mgr.rpc("customer_register", { p_store_id: storeA2!.id, p_name: "NOX-VERIFY-段15-越境" });
      check("段15 manager 他店 A2 へ register forbidden（店スコープ）", forbidden(eRMx), eRMx?.message ?? "通ってしまった");
      // staff can_crm=true 成功。p_cast_id を渡しても無視（null 化）される
      const { data: cS, error: eRS } = await crm.rpc("customer_register", {
        p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-客staff", p_cast_id: castA1aId,
      });
      check("段15 staff(can_crm) customer_register 成功", !eRS && typeof cS === "string", eRS?.message);
      if (typeof cS === "string") {
        createdCustIds.push(cS);
        const { data: sRow } = await admin.from("customers").select("cast_id").eq("id", cS).single();
        check("段15 staff の p_cast_id は無視（null 化）＝担当割当は owner/manager のみ", sRow?.cast_id === null, JSON.stringify(sRow));
      }
      const { error: eRRegOn } = await regOn.rpc("customer_register", { p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-侵入1" });
      check("段15 staff(can_register=true/can_crm=false) register forbidden（2軸独立）", forbidden(eRRegOn), eRRegOn?.message ?? "通ってしまった");
      const { error: eRRegOff } = await regOff.rpc("customer_register", { p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-侵入2" });
      check("段15 staff(can_crm=false) register forbidden", forbidden(eRRegOff), eRRegOff?.message ?? "通ってしまった");
      const { error: eRCast } = await cast.rpc("customer_register", { p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-侵入3" });
      check("段15 cast register forbidden", forbidden(eRCast), eRCast?.message ?? "通ってしまった");
      // 不在 cast の割当は invalid cast（越境 cast と同じ exists 検証の枝）
      const { error: eRBadCast } = await mgr.rpc("customer_register", {
        p_store_id: storeA1!.id, p_name: "NOX-VERIFY-段15-badcast", p_cast_id: randomUUID(),
      });
      check("段15 register 不在/越境 cast = invalid cast", has(eRBadCast, "invalid cast"), eRBadCast?.message ?? "通ってしまった");

      // ② customer_update 権限マトリクス（規約7: p_is_active 明示値・実 UPDATE を physical で確認）
      const updArgs = {
        p_id: cM, p_name: "NOX-VERIFY-段15-客manager改", p_furigana: "だんじゅうご",
        p_birthday: "1990-01-15", p_tel: "090-0000-0000", p_prefs: "シャンパン（白）", p_memo: "verify",
        p_is_active: true,
      };
      const { error: eUM } = await mgr.rpc("customer_update", updArgs);
      check("段15 manager customer_update 成功", !eUM, eUM?.message);
      const { data: uRow } = await admin.from("customers").select("name, prefs, is_active").eq("id", cM).single();
      check("段15 customer_update 実 UPDATE 確認（name/prefs 反映）",
        uRow?.name === "NOX-VERIFY-段15-客manager改" && uRow?.prefs === "シャンパン（白）" && uRow?.is_active === true,
        JSON.stringify(uRow));
      const { error: eUS } = await crm.rpc("customer_update", { ...updArgs, p_memo: "staff編集" });
      check("段15 staff(can_crm) customer_update 成功", !eUS, eUS?.message);
      const { error: eUOff } = await regOff.rpc("customer_update", updArgs);
      check("段15 staff(can_crm=false) update forbidden", forbidden(eUOff), eUOff?.message ?? "通ってしまった");
      const { error: eUCast } = await cast.rpc("customer_update", updArgs);
      check("段15 cast update forbidden", forbidden(eUCast), eUCast?.message ?? "通ってしまった");

      // ③ customer_assign_cast（owner/manager のみ・staff は can_crm でも不可）
      const { error: eAO } = await owner.rpc("customer_assign_cast", { p_id: cM, p_cast_id: castA1aId });
      check("段15 owner assign_cast 成功", !eAO, eAO?.message);
      const { data: aRow } = await admin.from("customers").select("cast_id").eq("id", cM).single();
      check("段15 assign_cast 実 UPDATE 確認（cast_id 設定）", aRow?.cast_id === castA1aId, JSON.stringify(aRow));
      const { error: eAM } = await mgr.rpc("customer_assign_cast", { p_id: cM, p_cast_id: null });
      check("段15 manager assign_cast(null=解除) 成功", !eAM, eAM?.message);
      const { error: eAS } = await crm.rpc("customer_assign_cast", { p_id: cM, p_cast_id: castA1aId });
      check("段15 staff(can_crm でも) assign_cast forbidden", forbidden(eAS), eAS?.message ?? "通ってしまった");
      const { error: eACast } = await cast.rpc("customer_assign_cast", { p_id: cM, p_cast_id: castA1aId });
      check("段15 cast assign_cast forbidden", forbidden(eACast), eACast?.message ?? "通ってしまった");
      const { error: eABad } = await mgr.rpc("customer_assign_cast", { p_id: cM, p_cast_id: randomUUID() });
      check("段15 assign_cast 不在/越境 cast = invalid cast", has(eABad, "invalid cast"), eABad?.message ?? "通ってしまった");

      // 生成客を除去（以降の list ゴールデンを seed 固定 fixture だけで縛るため）
      if (createdCustIds.length) await admin.from("customers").delete().in("id", createdCustIds);

      // ④ customer_summary（definer 迂回の可視ガード＋seed ゴールデン）
      const { data: sumO, error: eSO } = await owner.rpc("customer_summary", { p_customer_id: custCastA });
      const sO = (sumO ?? [])[0] as { visits?: number; total_spend?: number; last_visit?: string; active_bottles?: number; open_receivable?: number } | undefined;
      check("段15 owner summary(指名A客) 成功", !eSO && !!sO, eSO?.message);
      check("段15 summary ゴールデン: visits=2・total_spend=30000（closed 2伝票の都度集計）",
        sO?.visits === 2 && Number(sO?.total_spend) === 30_000 && !!sO?.last_visit,
        JSON.stringify(sO));
      check("段15 summary ゴールデン: active_bottles=0・open_receivable=0（seed 時点）",
        Number(sO?.active_bottles) === 0 && Number(sO?.open_receivable) === 0, JSON.stringify(sO));
      const { data: sumCa, error: eSCa } = await cast.rpc("customer_summary", { p_customer_id: custCastA });
      check("段15 cast summary(自分の担当客) 成功", !eSCa && ((sumCa ?? [])[0] as { visits?: number })?.visits === 2, eSCa?.message);
      const { error: eSCb } = await cast.rpc("customer_summary", { p_customer_id: custCastB });
      check("段15 cast summary(他 cast の客) forbidden（担当客スコープの物理保証）", forbidden(eSCb), eSCb?.message ?? "通ってしまった");
      const { error: eSOff } = await regOff.rpc("customer_summary", { p_customer_id: custCastA });
      check("段15 staff(can_crm=false) summary forbidden", forbidden(eSOff), eSOff?.message ?? "通ってしまった");
      const { data: sumCrm, error: eSCrm } = await crm.rpc("customer_summary", { p_customer_id: custCastA });
      check("段15 staff(can_crm) summary 成功", !eSCrm && ((sumCrm ?? [])[0] as { visits?: number })?.visits === 2, eSCrm?.message);
      const { error: eSB1 } = await owner.rpc("customer_summary", { p_customer_id: custB1 });
      check("段15 owner summary(他 org 客) not found（org 遮断）", has(eSB1, "not found"), eSB1?.message ?? "通ってしまった");

      // ⑤ customer_list_summary（churn ゴールデン＋可視スコープ＋休眠除外）
      type ListRow = { customer_id: string; name: string; visits: number; total_spend: number; days_since: number | null; churn_tier: string };
      const { data: listO, error: eLO } = await owner.rpc("customer_list_summary", {});
      const lo = (listO ?? []) as ListRow[];
      check("段15 owner list 成功（org A 全店の active 4客・休眠は除外）",
        !eLO && lo.length === 4, eLO?.message ?? `got ${lo.length}: ${lo.map((r) => r.name).join(",")}`);
      const rowOf = (name: string) => lo.find((r) => r.name === name);
      const rCastA = rowOf(FIXTURE_CUSTOMERS.custCastA.name);
      const rCastB = rowOf(FIXTURE_CUSTOMERS.custCastB.name);
      const rFree = rowOf(FIXTURE_CUSTOMERS.custFree.name);
      check("段15 churn ゴールデン: 指名A客 tier='none'（5日前・visits=2・spend=30000）",
        rCastA?.churn_tier === "none" && rCastA?.visits === 2 && Number(rCastA?.total_spend) === 30_000, JSON.stringify(rCastA));
      check("段15 churn ゴールデン: フリー客 tier='mid'（40日前=30-59）",
        rFree?.churn_tier === "mid" && (rFree?.days_since ?? 0) >= 39 && (rFree?.days_since ?? 99) <= 41, JSON.stringify(rFree));
      check("段15 churn ゴールデン: 指名B客 tier='high'（70日前=60+）",
        rCastB?.churn_tier === "high" && (rCastB?.days_since ?? 0) >= 69 && (rCastB?.days_since ?? 99) <= 71, JSON.stringify(rCastB));
      // owner の店絞り込み（p_store_id=A2 → A2 の1客のみ）
      const { data: listOA2 } = await owner.rpc("customer_list_summary", { p_store_id: storeA2!.id });
      check("段15 owner list p_store_id=A2 絞り込み（1客）",
        ((listOA2 ?? []) as ListRow[]).length === 1 && ((listOA2 ?? []) as ListRow[])[0]?.name === FIXTURE_CUSTOMERS.custA2.name,
        JSON.stringify((listOA2 ?? []).map((r: ListRow) => r.name)));
      const { data: listCa, error: eLCa } = await cast.rpc("customer_list_summary", {});
      const lca = (listCa ?? []) as ListRow[];
      check("段15 cast list = 担当客のみ1行（他 cast 客/フリー客/休眠 不可視）",
        !eLCa && lca.length === 1 && lca[0]?.name === FIXTURE_CUSTOMERS.custCastA.name,
        eLCa?.message ?? JSON.stringify(lca.map((r) => r.name)));
      const { data: listCrm } = await crm.rpc("customer_list_summary", {});
      check("段15 staff(can_crm) list = 自店 active 3客", ((listCrm ?? []) as ListRow[]).length === 3,
        JSON.stringify(((listCrm ?? []) as ListRow[]).map((r) => r.name)));
      const { data: listOff, error: eLOff } = await regOff.rpc("customer_list_summary", {});
      check("段15 staff(can_crm=false) list = 0行", !eLOff && ((listOff ?? []) as ListRow[]).length === 0,
        eLOff?.message ?? `got ${((listOff ?? []) as ListRow[]).length}`);

      // ⑥ bottle_keep_register（can_register 準拠＝会計オペ・product 検証は check_add_line 同型）
      const { data: bkProd } = await admin.from("products").insert({
        org_id: storeA1!.org_id, store_id: storeA1!.id, type: "bottle", name: "NOX-VERIFY-段15-ボトル",
        price: 30_000, back_mode: "rate", back_value: 0, hon_pt: 0, is_active: true,
      }).select("id").single();
      const { data: bkProdOff } = await admin.from("products").insert({
        org_id: storeA1!.org_id, store_id: storeA1!.id, type: "bottle", name: "NOX-VERIFY-段15-廃番ボトル",
        price: 30_000, back_mode: "rate", back_value: 0, hon_pt: 0, is_active: false,
      }).select("id").single();
      const createdBottleIds: string[] = [];
      const bkArgs = { p_store_id: storeA1!.id, p_customer_id: custCastA, p_product_id: bkProd!.id, p_note: "NOX-VERIFY-段15" };
      const { data: bO, error: eBO } = await owner.rpc("bottle_keep_register", bkArgs);
      check("段15 owner bottle_keep_register 成功（実 INSERT）", !eBO && typeof bO === "string", eBO?.message);
      if (typeof bO === "string") createdBottleIds.push(bO);
      const { data: bM, error: eBM } = await mgr.rpc("bottle_keep_register", bkArgs);
      check("段15 manager bottle_keep_register 成功", !eBM && typeof bM === "string", eBM?.message);
      if (typeof bM === "string") createdBottleIds.push(bM);
      const { data: bR, error: eBR } = await regOn.rpc("bottle_keep_register", bkArgs);
      check("段15 staff(can_register=true) bottle_keep_register 成功（会計オペ準拠）", !eBR && typeof bR === "string", eBR?.message);
      if (typeof bR === "string") createdBottleIds.push(bR);
      const { error: eBOff } = await regOff.rpc("bottle_keep_register", bkArgs);
      check("段15 staff(can_register=false) bottle forbidden", forbidden(eBOff), eBOff?.message ?? "通ってしまった");
      const { error: eBCrm } = await crm.rpc("bottle_keep_register", bkArgs);
      check("段15 staff(can_crm=true/can_register=false) bottle forbidden（顧客権限では会計オペ不可）", forbidden(eBCrm), eBCrm?.message ?? "通ってしまった");
      const { error: eBCast } = await cast.rpc("bottle_keep_register", bkArgs);
      check("段15 cast bottle forbidden", forbidden(eBCast), eBCast?.message ?? "通ってしまった");
      const { error: eBX1 } = await mgr.rpc("bottle_keep_register", { ...bkArgs, p_customer_id: custA2 });
      check("段15 bottle 他店客 = invalid customer（店越境封鎖）", has(eBX1, "invalid customer"), eBX1?.message ?? "通ってしまった");
      const { error: eBX2 } = await mgr.rpc("bottle_keep_register", { ...bkArgs, p_customer_id: custB1 });
      check("段15 bottle 他 org 客 = invalid customer（org 越境封鎖）", has(eBX2, "invalid customer"), eBX2?.message ?? "通ってしまった");
      const { error: eBP1 } = await mgr.rpc("bottle_keep_register", { ...bkArgs, p_product_id: randomUUID() });
      check("段15 bottle 不在 product = bad item", has(eBP1, "bad item"), eBP1?.message ?? "通ってしまった");
      const { error: eBP2 } = await mgr.rpc("bottle_keep_register", { ...bkArgs, p_product_id: bkProdOff!.id });
      check("段15 bottle inactive product = inactive item", has(eBP2, "inactive item"), eBP2?.message ?? "通ってしまった");
      // 集計連動: 登録3本が active_bottles に反映（runtime の都度集計を実測）
      const { data: sumB } = await owner.rpc("customer_summary", { p_customer_id: custCastA });
      check("段15 summary: bottle 登録後 active_bottles=3（都度集計の連動）",
        Number(((sumB ?? [])[0] as { active_bottles?: number })?.active_bottles) === 3, JSON.stringify((sumB ?? [])[0]));
      // 後片付け（ボトル・検証用 products 除去）
      if (createdBottleIds.length) await admin.from("bottle_keeps").delete().in("id", createdBottleIds);
      await admin.from("products").delete().in("id", [bkProd!.id, bkProdOff!.id]);

      // ⑦ link 回帰: check_open の customer 紐付け（専用卓・前後 wipe＝日報/売上ゴールデンと非干渉）
      let seatId = "";
      {
        const { data: sExist } = await admin.from("seats").select("id")
          .eq("store_id", storeA1!.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
        if (sExist?.length) seatId = sExist[0].id as string;
        else {
          const { data: sNew } = await admin.from("seats").insert({
            org_id: storeA1!.org_id, store_id: storeA1!.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
          }).select("id").single();
          seatId = sNew!.id as string;
        }
      }
      const wipeSeatChecks = async () => {
        const { data: cs } = await admin.from("checks").select("id").eq("seat_id", seatId);
        const ids = (cs ?? []).map((c) => c.id as string);
        if (!ids.length) return;
        for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
          await admin.from(t).delete().in("check_id", ids);
        }
        await admin.from("checks").delete().in("id", ids);
      };
      await wipeSeatChecks();

      // 越境客は open 自体を拒否（既存 open の有無に依らず検証が先＝fail-closed）
      const { error: eOX1 } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free", p_customer_id: custA2 });
      check("段15 check_open 他店客 = invalid customer", has(eOX1, "invalid customer"), eOX1?.message ?? "通ってしまった");
      const { error: eOX2 } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free", p_customer_id: custB1 });
      check("段15 check_open 他 org 客 = invalid customer", has(eOX2, "invalid customer"), eOX2?.message ?? "通ってしまった");

      // customer 紐付き open → pay(ar) → receivables.customer_id 連動（check_pay は F1b から連動済み）
      const { data: chkId, error: eOpen } = await mgr.rpc("check_open", {
        p_seat_id: seatId, p_people: 2, p_nom_type: "free", p_customer_id: custCastA,
      });
      check("段15 customer 紐付き check_open 成功", !eOpen && typeof chkId === "string", eOpen?.message);
      const { data: chkRow } = await mgr.from("checks").select("customer_id").eq("id", chkId as string).single();
      check("段15 checks.customer_id が物理設定（実 INSERT）", chkRow?.customer_id === custCastA, JSON.stringify(chkRow));
      const { error: eLn } = await mgr.rpc("check_add_line", {
        p_check_id: chkId, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: "CRM検証セット", p_unit_price: 5_000,
      });
      check("段15 行追加 成功", !eLn, eLn?.message);
      // due = 5000 + サ10% → 100円切捨 = 5500
      const { error: ePay } = await mgr.rpc("check_pay", {
        p_check_id: chkId, p_method: "ar", p_amount: 5_500, p_pay_group: "A", p_tendered: null, p_idem_key: randomUUID(),
      });
      check("段15 ar 入金 成功", !ePay, ePay?.message);
      const { data: recvRow } = await mgr.from("receivables").select("customer_id, amount, status").eq("check_id", chkId as string);
      check("段15 receivables.customer_id = 伝票の customer（check_pay サーバ導出の連動）",
        (recvRow ?? []).length === 1 && recvRow?.[0]?.customer_id === custCastA
          && recvRow?.[0]?.amount === 5_500 && recvRow?.[0]?.status === "open",
        JSON.stringify(recvRow));
      const { error: eCl } = await mgr.rpc("check_close", { p_check_id: chkId, p_idem_key: randomUUID() });
      check("段15 customer 紐付き伝票 close 成功", !eCl, eCl?.message);
      await wipeSeatChecks();

      // 回帰: p_customer_id 省略（null）で従来どおり開ける＝フリー客・既存 UI 無改修動作
      const { data: chkNull, error: eNull } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
      check("段15 回帰: customer 省略 open 成功（default null）", !eNull && typeof chkNull === "string", eNull?.message);
      const { data: chkNullRow } = await mgr.from("checks").select("customer_id").eq("id", chkNull as string).single();
      check("段15 回帰: customer_id=null（フリー客）", chkNullRow?.customer_id === null, JSON.stringify(chkNullRow));
      await wipeSeatChecks();

      for (const c of sessions.values()) await c.auth.signOut();
    }
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-anon-guard ALL PASS (${pass} assertions)`);
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
