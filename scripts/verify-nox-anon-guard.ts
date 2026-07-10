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
 * 段16（0024 適用後）: F3a 束3-1 set_staff_perms の実効ゲート（runtime 実測）。
 *       owner=自 org staff 成功（実 UPDATE 物理確認・3フラグ任意組合せ）/ manager=自店成功・他店 forbidden /
 *       staff（can_register/can_crm 問わず）・cast=自他とも forbidden（権限昇格封じ）。
 *       規約7=3フラグいずれか null で bad flag。対象 role<>'staff' は not a staff。
 *       越境=他 org membership は not found（存在オラクル封じ）。audit=before/after フラグ記録。
 *       ★結合テスト＝フラグ変更が束1（会計6RPC ゲート）・束2（customers RLS）の可否に実反映。
 *       他店 staff は fixture に無いため A2 ダミー staff を service で生成（auth 不要・users.auth_user_id
 *       に FK なし＝live 確認済み）。フラグ復元＋ダミー削除＋伝票 wipe は try/finally で保証＝
 *       verify:nox-rls の固定カウント（memberships 8行・F3a-1 フラグ前提）と非干渉。
 * 段17（0025 適用後）: F3a 束3-2 Q-1 スタッフ編集 RPC 5本（staff_update_profile / staff_transfer_store /
 *       staff_change_role / staff_deactivate / staff_reactivate）の実効ゲート（★prosrc green ≠ runtime success）。
 *       権限マトリクス＝owner 成功 / manager 自店成功・他店 forbidden（異動・昇降格は owner のみ）/
 *       staff・cast forbidden。bad 系＝bad name / bad role / bad target（owner 保護含む）/ invalid store /
 *       same store / inactive membership / already inactive / already active / already active elsewhere /
 *       他 org・不在 membership は not found（存在オラクル封じ）。
 *       ★出戻り分岐＝A1→A2 は新規 INSERT（返却 id 別・フラグ default false=fail-closed）・A2→A1 出戻りは
 *       既存行 reactivate（返却 id が元 membership と同一＝新規 INSERT でない・フラグ既存値維持）・
 *       各異動後に 1ユーザー1アクティブ（active=1行・総行数2）を物理確認。
 *       ★結合＝昇格（staff→manager）でフラグ無視（can_crm=false でも customers 可視・can_register=false
 *       でも check_open 成功）/ 降格（manager→staff）でフラグ参照再開（default false→forbidden=fail-closed）/
 *       deactivate 後は auth_role()=null・RLS 全倒れ 0行・RPC forbidden（退職回帰同型）→ reactivate で復帰。
 *       可変対象は service 生成ダミー staff 2人（D1=A1・D2=A2・auth 不要）＋fixture staffRegOffA1 のみ。
 *       try/finally で fixture 復元＋ダミー削除＋伝票 wipe＝verify:nox-rls の固定カウント非汚染。
 * 段18（0026 適用後）: F3a 束3-2 Q-2 staff_create（スタッフ追加・auth 生成は route 管轄）の RPC 単体を
 *       signIn 実測（auth_user_id はダミー uuid＝FK 無し・route の admin API E2E は別スモーク）。
 *       権限マトリクス＝owner staff/manager 作成成功（org 内他店も）/ manager 自店 staff のみ
 *       （他店・manager 作成は forbidden）/ staff・cast forbidden。bad 系＝bad auth user/bad email 3系/
 *       bad name 3系/bad role 3系/invalid store 2系。完全新規＝users+membership 実 INSERT
 *       （フラグ全 false・auth_user_id=渡した uuid を物理確認）。既存 user 分岐＝users 増えない・
 *       auth_user_id 上書きしない【4】。出戻り reactivate＝id 一致証明＋フラグ既存値維持。
 *       already member / already active elsewhere（新規・出戻り両ルート）。★【11】inactive user は
 *       service で users.is_active=false ダミーを立て発火を実測（理論ガードのまま回帰固定しない）。
 *       【10】cast/owner 人材の email は bad target。audit=after 生成 membership。
 *       ★結合＝staff_create 生成 staff（実 auth・フラグ全 false）が check_open forbidden・customers 0行
 *       → set_staff_perms 付与で実 INSERT 成功・4客可視 → staff_deactivate で認可倒れ → reactivate 復帰
 *       （Q-2 生成物が束1/束2/束3-1/Q-1 のゲート網に乗る）。生成 users/memberships は user_id 起点で
 *       try/finally 全消し・実 auth 1人は admin.deleteUser＝固定カウント非汚染・2連続全緑。
 * 正常系対照: authenticated では auth_role() が実行可能で正しいロールを返す
 *       （プローブ手法が BLOCKED と EXECUTABLE を区別できている裏取り）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, FIXTURE_CUSTOMERS, STORE_A1, STORE_A2, STORE_B1, loadEnvOrExit, type FixtureUserKey } from "./fixtures-f0";

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
    ["set_staff_perms", { p_membership_id: null, p_can_register: null, p_can_crm: null, p_can_shift: null }], // 段16a（mig0024）
  ];
  for (const [fn, args] of F3A2_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段17a: F3a 束3-2 Q-1 スタッフ編集 RPC 5本 anon BLOCKED（mig0025・authenticated grant）──
  const F3A3Q1_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["staff_update_profile", { p_membership_id: null, p_name: null }],
    ["staff_transfer_store", { p_membership_id: null, p_new_store_id: null }],
    ["staff_change_role", { p_membership_id: null, p_new_role: null }],
    ["staff_deactivate", { p_membership_id: null }],
    ["staff_reactivate", { p_membership_id: null }],
  ];
  for (const [fn, args] of F3A3Q1_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段18a: F3a 束3-2 Q-2 staff_create anon BLOCKED（mig0026・authenticated grant）──
  {
    const { error } = await anon.rpc("staff_create", {
      p_auth_user_id: null, p_email: null, p_name: null, p_store_id: null, p_role: null,
    });
    check("anon staff_create BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
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

  // ── 段16: F3a 束3-1（mig0024）set_staff_perms の実効ゲート＋束1/束2 結合テスト ──
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
        fails.push(`段16 ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
        return null;
      }
      sessions.set(key, c);
      return c;
    };
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    // 準備（service）: fixture の membership id・ベースラインフラグを取得
    type MemRow = { id: string; store_id: string; role: string; can_register: boolean; can_crm: boolean; can_shift: boolean };
    const memOf = async (key: FixtureUserKey): Promise<MemRow | null> => {
      const { data: u } = await admin.from("users").select("id").eq("email", FIXTURE_USERS[key].email).single();
      if (!u) return null;
      const { data: mm } = await admin.from("memberships")
        .select("id, store_id, role, can_register, can_crm, can_shift").eq("user_id", u.id).limit(1);
      return (mm?.[0] as MemRow | undefined) ?? null;
    };
    const memRegOn = await memOf("staffRegOnA1");   // baseline (true, false, false)
    const memRegOff = await memOf("staffRegOffA1"); // baseline (false, false, false)
    const memOwner = await memOf("ownerA");
    const memManager = await memOf("managerA1");
    const memCast = await memOf("castA1a");
    const memB1 = await memOf("managerB1");         // 他 org（not found 検証用）
    const { data: storeRows } = await admin.from("stores").select("id, name, org_id")
      .in("name", [STORE_A1, STORE_A2]);
    const storeA1 = storeRows?.find((s) => s.name === STORE_A1);
    const storeA2 = storeRows?.find((s) => s.name === STORE_A2);
    check("段16（準備）membership/店 id 解決",
      !!memRegOn && !!memRegOff && !!memOwner && !!memManager && !!memCast && !!memB1 && !!storeA1 && !!storeA2);

    // 他店 staff ダミー（A2）: fixture に無いため service で生成（auth 不要・users.auth_user_id に FK なし）。
    // 前回失敗遺物の掃除（再実行冪等）→ 生成。
    const DUMMY_EMAIL = "nox-verify-staff-a2-dummy@example.com";
    {
      const { data: oldU } = await admin.from("users").select("id").eq("email", DUMMY_EMAIL);
      const oldIds = (oldU ?? []).map((r) => r.id as string);
      if (oldIds.length) {
        await admin.from("memberships").delete().in("user_id", oldIds);
        await admin.from("users").delete().in("id", oldIds);
      }
    }
    const { data: uA2 } = await admin.from("users").insert({
      org_id: storeA1!.org_id, auth_user_id: randomUUID(), email: DUMMY_EMAIL, name: "検証黒服A2ダミー",
    }).select("id").single();
    const { data: memA2 } = await admin.from("memberships").insert({
      user_id: uA2!.id, store_id: storeA2!.id, role: "staff",
      can_register: false, can_crm: false, can_shift: false,
    }).select("id").single();
    check("段16（準備）他店 A2 ダミー staff 生成", !!memA2?.id);

    const owner = await signInUser("ownerA");
    const mgr = await signInUser("managerA1");
    const staffOn = await signInUser("staffRegOnA1");
    const staffCrm = await signInUser("staffCrmOnA1");
    const staffOff = await signInUser("staffRegOffA1");
    const cast = await signInUser("castA1a");
    if (memRegOn && memRegOff && owner && mgr && staffOn && staffCrm && staffOff && cast) {
      try {
        // ① owner: 任意組合せ（can_shift のみ true）の実 UPDATE ＋ 物理確認 ＋ audit
        const { error: e1 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: false, p_can_shift: true,
        });
        check("段16 owner set_staff_perms 成功（can_shift のみ true）", !e1, e1?.message);
        const { data: m1 } = await admin.from("memberships")
          .select("can_register, can_crm, can_shift").eq("id", memRegOff.id).single();
        check("段16 実 UPDATE 物理確認: (false,false,true) が正確に反映",
          m1?.can_register === false && m1?.can_crm === false && m1?.can_shift === true, JSON.stringify(m1));
        // audit: before/after のフラグが記録される（owner 閲覧）
        const { data: aud } = await owner.from("audit_logs")
          .select("before_json, after_json")
          .eq("action", "set_staff_perms")
          .eq("target", `memberships:${memRegOff.id}`)
          .order("at", { ascending: false }).limit(1);
        const aRow = aud?.[0] as { before_json?: { can_shift?: boolean }; after_json?: { can_shift?: boolean } } | undefined;
        check("段16 audit: before.can_shift=false / after.can_shift=true が記録",
          aRow?.before_json?.can_shift === false && aRow?.after_json?.can_shift === true, JSON.stringify(aRow));

        // ② manager: 自店 staff 成功（3フラグ全 true）・他店 A2 staff は forbidden
        const { error: e2 } = await mgr.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: true, p_can_crm: true, p_can_shift: true,
        });
        check("段16 manager 自店 staff 成功（全 true）", !e2, e2?.message);
        const { data: m2 } = await admin.from("memberships")
          .select("can_register, can_crm, can_shift").eq("id", memRegOff.id).single();
        check("段16 実 UPDATE 物理確認: (true,true,true)",
          m2?.can_register === true && m2?.can_crm === true && m2?.can_shift === true, JSON.stringify(m2));
        const { error: e3 } = await mgr.rpc("set_staff_perms", {
          p_membership_id: memA2!.id, p_can_register: true, p_can_crm: false, p_can_shift: false,
        });
        check("段16 manager 他店 A2 staff forbidden（店スコープ）", forbidden(e3), e3?.message ?? "通ってしまった");
        // owner は org 内他店 A2 staff も変更可（org 全店スコープの positive）
        const { error: e4 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memA2!.id, p_can_register: true, p_can_crm: false, p_can_shift: false,
        });
        check("段16 owner 他店 A2 staff 成功（org 全店）", !e4, e4?.message);

        // ③ staff/cast 呼び出し＝forbidden（権限昇格封じ・自分にも他人にも）
        const { error: e5 } = await staffOn.rpc("set_staff_perms", {
          p_membership_id: memRegOn.id, p_can_register: true, p_can_crm: true, p_can_shift: true,
        });
        check("段16 staff(can_register=true) 自分に forbidden（昇格封じ）", forbidden(e5), e5?.message ?? "通ってしまった");
        const { error: e6 } = await staffCrm.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: true, p_can_crm: true, p_can_shift: true,
        });
        check("段16 staff(can_crm=true) 他人に forbidden", forbidden(e6), e6?.message ?? "通ってしまった");
        const { error: e7 } = await cast.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: true, p_can_crm: true, p_can_shift: true,
        });
        check("段16 cast forbidden", forbidden(e7), e7?.message ?? "通ってしまった");

        // ④ 規約7: 3フラグいずれか null で bad flag
        for (const [label, args] of [
          ["can_register null", { p_membership_id: memRegOff.id, p_can_register: null, p_can_crm: false, p_can_shift: false }],
          ["can_crm null", { p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: null, p_can_shift: false }],
          ["can_shift null", { p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: false, p_can_shift: null }],
        ] as const) {
          const { error } = await owner.rpc("set_staff_perms", args as Record<string, unknown>);
          check(`段16 規約7: ${label} = bad flag`, has(error, "bad flag"), error?.message ?? "通ってしまった");
        }

        // ⑤ 対象 role: owner/manager/cast の membership は not a staff
        for (const [label, mem] of [["owner", memOwner], ["manager", memManager], ["cast", memCast]] as const) {
          const { error } = await owner.rpc("set_staff_perms", {
            p_membership_id: mem!.id, p_can_register: false, p_can_crm: false, p_can_shift: false,
          });
          check(`段16 対象 ${label} membership = not a staff`, has(error, "not a staff"), error?.message ?? "通ってしまった");
        }

        // ⑥ 越境: 他 org の membership は not found（存在オラクル封じ）
        const { error: eX } = await owner.rpc("set_staff_perms", {
          p_membership_id: memB1!.id, p_can_register: false, p_can_crm: false, p_can_shift: false,
        });
        check("段16 他 org membership = not found", has(eX, "not found"), eX?.message ?? "通ってしまった");
        const { error: eX2 } = await owner.rpc("set_staff_perms", {
          p_membership_id: randomUUID(), p_can_register: false, p_can_crm: false, p_can_shift: false,
        });
        check("段16 不在 membership = not found", has(eX2, "not found"), eX2?.message ?? "通ってしまった");

        // ⑦ ★結合テスト（束1連動・会計ゲート）: staffRegOnA1 の can_register を落とすと会計RPC が forbidden
        //    → 復元すると再び通る（実 INSERT）。専用卓＋前後 wipe＝日報/売上ゴールデンと非干渉。
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

        const { error: eOff1 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOn.id, p_can_register: false, p_can_crm: false, p_can_shift: false,
        });
        check("段16 結合（準備）staffRegOnA1 の can_register を false に", !eOff1, eOff1?.message);
        const { error: eOpenOff } = await staffOn.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段16 ★結合: can_register=false 化した staff の check_open が forbidden（束1ゲート実反映）",
          forbidden(eOpenOff), eOpenOff?.message ?? "通ってしまった");
        const { error: eOn1 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOn.id,
          p_can_register: memRegOn.can_register, p_can_crm: memRegOn.can_crm, p_can_shift: memRegOn.can_shift,
        });
        check("段16 結合（復元）staffRegOnA1 をベースラインへ", !eOn1, eOn1?.message);
        const { data: chkOn, error: eOpenOn } = await staffOn.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段16 ★結合: 復元後 check_open 成功（実 INSERT・フラグが runtime に実反映）",
          !eOpenOn && typeof chkOn === "string", eOpenOn?.message);
        await wipeSeatChecks();

        // ⑧ ★結合テスト（束2連動・customers RLS）: staffRegOffA1 に can_crm を付けると customers が見える
        //    → 復元（全 false）で 0行に戻る。
        const { error: eCrm1 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: true, p_can_shift: false,
        });
        check("段16 結合（準備）staffRegOffA1 に can_crm=true", !eCrm1, eCrm1?.message);
        const { data: custOn } = await staffOff.from("customers").select("id");
        check("段16 ★結合: can_crm=true 化した staff が customers 可視（束2 RLS 実反映・自店4客）",
          (custOn ?? []).length === 4, `got ${(custOn ?? []).length}`);
        const { error: eCrm0 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id,
          p_can_register: memRegOff.can_register, p_can_crm: memRegOff.can_crm, p_can_shift: memRegOff.can_shift,
        });
        check("段16 結合（復元）staffRegOffA1 をベースラインへ", !eCrm0, eCrm0?.message);
        const { data: custOff } = await staffOff.from("customers").select("id");
        check("段16 ★結合: 復元後 customers 0行に戻る", (custOff ?? []).length === 0, `got ${(custOff ?? []).length}`);
      } finally {
        // フラグ復元の最終保証（service 直・途中失敗でも rls の F3a-1/F3a-2 前提を汚さない）
        await admin.from("memberships").update({
          can_register: memRegOn.can_register, can_crm: memRegOn.can_crm, can_shift: memRegOn.can_shift,
        }).eq("id", memRegOn.id);
        await admin.from("memberships").update({
          can_register: memRegOff.can_register, can_crm: memRegOff.can_crm, can_shift: memRegOff.can_shift,
        }).eq("id", memRegOff.id);
        // ダミー staff の除去（memberships 8行の固定カウント維持）
        if (memA2?.id) await admin.from("memberships").delete().eq("id", memA2.id);
        if (uA2?.id) await admin.from("users").delete().eq("id", uA2.id);
      }
      // 復元の物理確認（rls 前提の positive）
      const { data: mFin1 } = await admin.from("memberships")
        .select("can_register, can_crm, can_shift").eq("id", memRegOn.id).single();
      const { data: mFin2 } = await admin.from("memberships")
        .select("can_register, can_crm, can_shift").eq("id", memRegOff.id).single();
      check("段16 復元確認: staffRegOnA1=(true,false,false) / staffRegOffA1=(false,false,false)",
        mFin1?.can_register === true && mFin1?.can_crm === false && mFin1?.can_shift === false
          && mFin2?.can_register === false && mFin2?.can_crm === false && mFin2?.can_shift === false,
        JSON.stringify([mFin1, mFin2]));
      for (const c of sessions.values()) await c.auth.signOut();
    }
  }

  // ── 段17: F3a 束3-2 Q-1（mig0025）スタッフ編集 RPC 5本の実効ゲート＋結合テスト ──
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
        fails.push(`段17 ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
        return null;
      }
      sessions.set(key, c);
      return c;
    };
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    // 準備（service）: fixture の membership id・ベースライン・店 id を解決
    type MemRow = { id: string; store_id: string; role: string; is_active: boolean; can_register: boolean; can_crm: boolean; can_shift: boolean };
    const memOf = async (key: FixtureUserKey): Promise<MemRow | null> => {
      const { data: u } = await admin.from("users").select("id").eq("email", FIXTURE_USERS[key].email).single();
      if (!u) return null;
      const { data: mm } = await admin.from("memberships")
        .select("id, store_id, role, is_active, can_register, can_crm, can_shift").eq("user_id", u.id).limit(1);
      return (mm?.[0] as MemRow | undefined) ?? null;
    };
    const memOwner = await memOf("ownerA");
    const memCast = await memOf("castA1a");
    const memRegOff = await memOf("staffRegOffA1"); // ★結合テスト対象（signIn 可能な fixture・try/finally 復元）
    const memB1 = await memOf("managerB1");         // 他 org（not found 検証用）
    const { data: storeRows } = await admin.from("stores").select("id, name, org_id")
      .in("name", [STORE_A1, STORE_A2, STORE_B1]);
    const storeA1 = storeRows?.find((s) => s.name === STORE_A1);
    const storeA2 = storeRows?.find((s) => s.name === STORE_A2);
    const storeB1 = storeRows?.find((s) => s.name === STORE_B1);
    check("段17（準備）membership/店 id 解決",
      !!memOwner && !!memCast && !!memRegOff && !!memB1 && !!storeA1 && !!storeA2 && !!storeB1);

    // 可変対象ダミー staff 2人（service 生成・auth 不要＝段16 と同手法）:
    //   D1=A1（can_register=true 明示＝★出戻りの「フラグ既存値維持 vs INSERT default false」の判別子）
    //   D2=A2（manager 他店 forbidden の対象・不変）。前回失敗遺物の掃除（再実行冪等）→ 生成。
    const D1_EMAIL = "nox-verify-staff-edit-d1@example.com";
    const D2_EMAIL = "nox-verify-staff-edit-d2@example.com";
    for (const em of [D1_EMAIL, D2_EMAIL]) {
      const { data: oldU } = await admin.from("users").select("id").eq("email", em);
      const oldIds = (oldU ?? []).map((r) => r.id as string);
      if (oldIds.length) {
        await admin.from("memberships").delete().in("user_id", oldIds);
        await admin.from("users").delete().in("id", oldIds);
      }
    }
    const { data: uD1 } = await admin.from("users").insert({
      org_id: storeA1!.org_id, auth_user_id: randomUUID(), email: D1_EMAIL, name: "検証黒服編集D1",
    }).select("id").single();
    const { data: memD1Row } = await admin.from("memberships").insert({
      user_id: uD1!.id, store_id: storeA1!.id, role: "staff",
      can_register: true, can_crm: false, can_shift: false,
    }).select("id").single();
    const { data: uD2 } = await admin.from("users").insert({
      org_id: storeA1!.org_id, auth_user_id: randomUUID(), email: D2_EMAIL, name: "検証黒服編集D2",
    }).select("id").single();
    const { data: memD2Row } = await admin.from("memberships").insert({
      user_id: uD2!.id, store_id: storeA2!.id, role: "staff",
      can_register: false, can_crm: false, can_shift: false,
    }).select("id").single();
    const memD1 = memD1Row?.id as string;
    const memD2 = memD2Row?.id as string;
    check("段17（準備）ダミー staff D1(A1)/D2(A2) 生成", !!memD1 && !!memD2);

    const owner = await signInUser("ownerA");
    const mgr = await signInUser("managerA1");
    const staffActor = await signInUser("staffRegOnA1"); // 呼び出し側 staff（forbidden 検証）
    const cast = await signInUser("castA1a");
    const staffOff = await signInUser("staffRegOffA1");  // ★結合テスト対象本人のセッション
    if (memOwner && memCast && memRegOff && memB1 && memD1 && memD2 && owner && mgr && staffActor && cast && staffOff) {
      // PERM卓（結合テストの check_open 用・段14/15/16 と同一卓を再利用）＋伝票 wipe
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

      try {
        // ═══ ① staff_update_profile（名前変更・owner/manager 自店）═══
        const { error: eP1 } = await owner.rpc("staff_update_profile", { p_membership_id: memD1, p_name: "検証黒服編集D1改" });
        check("段17 ① owner update_profile 成功", !eP1, eP1?.message);
        const { data: n1 } = await admin.from("users").select("name").eq("id", uD1!.id).single();
        check("段17 ① 実 UPDATE 物理確認: users.name 反映", n1?.name === "検証黒服編集D1改", JSON.stringify(n1));
        {
          const { data: aud } = await owner.from("audit_logs")
            .select("before_json, after_json")
            .eq("action", "staff_update_profile").eq("target", `memberships:${memD1}`)
            .order("at", { ascending: false }).limit(1);
          const aRow = aud?.[0] as { before_json?: { old_name?: string }; after_json?: { new_name?: string } } | undefined;
          check("段17 ① audit: old_name/new_name 記録（規約6・old は UPDATE 前確保）",
            aRow?.before_json?.old_name === "検証黒服編集D1" && aRow?.after_json?.new_name === "検証黒服編集D1改",
            JSON.stringify(aRow));
        }
        const { error: eP2 } = await mgr.rpc("staff_update_profile", { p_membership_id: memD1, p_name: "検証黒服編集D1改2" });
        check("段17 ① manager 自店 update_profile 成功", !eP2, eP2?.message);
        const { error: eP3 } = await mgr.rpc("staff_update_profile", { p_membership_id: memD2, p_name: "侵入" });
        check("段17 ① manager 他店 D2 forbidden（店スコープ）", forbidden(eP3), eP3?.message ?? "通ってしまった");
        const { error: eP4 } = await staffActor.rpc("staff_update_profile", { p_membership_id: memD1, p_name: "侵入" });
        check("段17 ① staff forbidden", forbidden(eP4), eP4?.message ?? "通ってしまった");
        const { error: eP5 } = await cast.rpc("staff_update_profile", { p_membership_id: memD1, p_name: "侵入" });
        check("段17 ① cast forbidden", forbidden(eP5), eP5?.message ?? "通ってしまった");
        for (const [label, nm] of [["null", null], ["空白のみ", "   "], ["81字", "あ".repeat(81)]] as Array<[string, string | null]>) {
          const { error } = await owner.rpc("staff_update_profile", { p_membership_id: memD1, p_name: nm });
          check(`段17 ① 名前 ${label} = bad name`, has(error, "bad name"), error?.message ?? "通ってしまった");
        }
        const { error: eP6 } = await owner.rpc("staff_update_profile", { p_membership_id: memOwner.id, p_name: "侵入" });
        check("段17 ① 対象 owner = bad target（owner 保護）", has(eP6, "bad target"), eP6?.message ?? "通ってしまった");
        const { error: eP7 } = await owner.rpc("staff_update_profile", { p_membership_id: memCast.id, p_name: "侵入" });
        check("段17 ① 対象 cast = bad target", has(eP7, "bad target"), eP7?.message ?? "通ってしまった");
        const { error: eP8 } = await owner.rpc("staff_update_profile", { p_membership_id: memB1.id, p_name: "侵入" });
        check("段17 ① 他 org membership = not found（存在オラクル封じ）", has(eP8, "not found"), eP8?.message ?? "通ってしまった");
        const { error: eP9 } = await owner.rpc("staff_update_profile", { p_membership_id: randomUUID(), p_name: "侵入" });
        check("段17 ① 不在 membership = not found", has(eP9, "not found"), eP9?.message ?? "通ってしまった");

        // ═══ ③ staff_change_role（昇降格・owner のみ）＋★結合: フラグ連動 ═══
        const { error: eC1 } = await mgr.rpc("staff_change_role", { p_membership_id: memD1, p_new_role: "manager" });
        check("段17 ③ manager 呼び出し forbidden（owner のみ）", forbidden(eC1), eC1?.message ?? "通ってしまった");
        const { error: eC2 } = await staffActor.rpc("staff_change_role", { p_membership_id: memD1, p_new_role: "manager" });
        check("段17 ③ staff forbidden", forbidden(eC2), eC2?.message ?? "通ってしまった");
        const { error: eC3 } = await cast.rpc("staff_change_role", { p_membership_id: memD1, p_new_role: "manager" });
        check("段17 ③ cast forbidden", forbidden(eC3), eC3?.message ?? "通ってしまった");
        for (const badRole of ["owner", "cast"]) {
          const { error } = await owner.rpc("staff_change_role", { p_membership_id: memD1, p_new_role: badRole });
          check(`段17 ③ p_new_role='${badRole}' = bad role（owner 増殖/cast 混入封じ）`, has(error, "bad role"), error?.message ?? "通ってしまった");
        }
        const { error: eC4 } = await owner.rpc("staff_change_role", { p_membership_id: memOwner.id, p_new_role: "staff" });
        check("段17 ③ 対象 owner = bad target（owner 降格封じ）", has(eC4, "bad target"), eC4?.message ?? "通ってしまった");
        const { error: eC5 } = await owner.rpc("staff_change_role", { p_membership_id: memCast.id, p_new_role: "manager" });
        check("段17 ③ 対象 cast = bad target（cast 昇格封じ）", has(eC5, "bad target"), eC5?.message ?? "通ってしまった");

        // ★結合（昇格）: staffRegOffA1（can_register/can_crm とも false）を manager に昇格 →
        //   role 固定原則（第1.5層は staff のみ）によりフラグ無視で customers 可視・会計 RPC 成功
        const { error: eUp } = await owner.rpc("staff_change_role", { p_membership_id: memRegOff.id, p_new_role: "manager" });
        check("段17 ③ owner 昇格 staff→manager 成功", !eUp, eUp?.message);
        const { data: r1 } = await admin.from("memberships").select("role, can_register, can_crm").eq("id", memRegOff.id).single();
        check("段17 ③ 実 UPDATE 物理確認: role=manager・フラグ現状維持（false のまま）",
          r1?.role === "manager" && r1?.can_register === false && r1?.can_crm === false, JSON.stringify(r1));
        const { error: eNoChg } = await owner.rpc("staff_change_role", { p_membership_id: memRegOff.id, p_new_role: "manager" });
        check("段17 ③ 同 role = no change", has(eNoChg, "no change"), eNoChg?.message ?? "通ってしまった");
        const { data: custUp } = await staffOff.from("customers").select("id");
        check("段17 ③ ★結合（昇格）: can_crm=false のまま manager 化 → customers 自店4客可視（フラグ無視）",
          (custUp ?? []).length === 4, `got ${(custUp ?? []).length}`);
        const { data: chkUp, error: eOpenUp } = await staffOff.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段17 ③ ★結合（昇格）: can_register=false のまま manager 化 → check_open 成功（実 INSERT）",
          !eOpenUp && typeof chkUp === "string", eOpenUp?.message);
        await wipeSeatChecks();

        // ★結合（降格）: manager→staff に戻すとフラグ参照が再開（default false → fail-closed）
        const { error: eDown } = await owner.rpc("staff_change_role", { p_membership_id: memRegOff.id, p_new_role: "staff" });
        check("段17 ③ owner 降格 manager→staff 成功", !eDown, eDown?.message);
        const { data: custDown } = await staffOff.from("customers").select("id");
        check("段17 ③ ★結合（降格）: フラグ参照再開 → customers 0行（fail-closed）",
          (custDown ?? []).length === 0, `got ${(custDown ?? []).length}`);
        const { error: eOpenDown } = await staffOff.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段17 ③ ★結合（降格）: check_open forbidden（can_register=false 参照再開）",
          forbidden(eOpenDown), eOpenDown?.message ?? "通ってしまった");

        // ═══ ② staff_transfer_store（異動・owner のみ・★出戻り分岐）═══
        const { error: eT1 } = await mgr.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeA2!.id });
        check("段17 ② manager 呼び出し forbidden（owner のみ・店跨ぎ）", forbidden(eT1), eT1?.message ?? "通ってしまった");
        const { error: eT2 } = await staffActor.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeA2!.id });
        check("段17 ② staff forbidden", forbidden(eT2), eT2?.message ?? "通ってしまった");
        const { error: eT3 } = await cast.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeA2!.id });
        check("段17 ② cast forbidden", forbidden(eT3), eT3?.message ?? "通ってしまった");
        const { error: eT4 } = await owner.rpc("staff_transfer_store", { p_membership_id: memCast.id, p_new_store_id: storeA2!.id });
        check("段17 ② 対象 cast = bad target", has(eT4, "bad target"), eT4?.message ?? "通ってしまった");
        const { error: eT5 } = await owner.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: randomUUID() });
        check("段17 ② 不在 store = invalid store", has(eT5, "invalid store"), eT5?.message ?? "通ってしまった");
        const { error: eT6 } = await owner.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeB1!.id });
        check("段17 ② 他 org store = invalid store（org 跨ぎ異動封じ）", has(eT6, "invalid store"), eT6?.message ?? "通ってしまった");
        const { error: eT7 } = await owner.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeA1!.id });
        check("段17 ② 同店 = same store", has(eT7, "same store"), eT7?.message ?? "通ってしまった");

        // 通常分岐: A1→A2（新店に既存行なし＝新規 INSERT・フラグ default false）
        const { data: newMemId, error: eT8 } = await owner.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeA2!.id });
        check("段17 ② owner 異動 A1→A2 成功", !eT8 && typeof newMemId === "string", eT8?.message);
        check("段17 ② ★新規 INSERT 分岐: 返却 id が元 membership と別", typeof newMemId === "string" && newMemId !== memD1, `got ${JSON.stringify(newMemId)}`);
        const { data: mOld1 } = await admin.from("memberships").select("is_active").eq("id", memD1).single();
        const { data: mNew1 } = await admin.from("memberships")
          .select("store_id, role, is_active, can_register, can_crm, can_shift").eq("id", newMemId as string).single();
        check("段17 ② 物理確認: 旧 A1 行 inactive / 新 A2 行 active・role=staff",
          mOld1?.is_active === false && mNew1?.is_active === true && mNew1?.store_id === storeA2!.id && mNew1?.role === "staff",
          JSON.stringify([mOld1, mNew1]));
        check("段17 ② 物理確認: 新規行フラグ default false（fail-closed・元の can_register=true は引き継がない）",
          mNew1?.can_register === false && mNew1?.can_crm === false && mNew1?.can_shift === false, JSON.stringify(mNew1));
        const { data: act1 } = await admin.from("memberships").select("id").eq("user_id", uD1!.id).eq("is_active", true);
        check("段17 ② 物理確認: 1ユーザー1アクティブ（active=1行）", (act1 ?? []).length === 1, `got ${(act1 ?? []).length}`);
        {
          const { data: aud } = await owner.from("audit_logs")
            .select("before_json, after_json")
            .eq("action", "staff_transfer_store").eq("target", `memberships:${newMemId}`)
            .order("at", { ascending: false }).limit(1);
          const aRow = aud?.[0] as { before_json?: { store_id?: string }; after_json?: { store_id?: string } } | undefined;
          check("段17 ② audit: before.store_id=A1 / after.store_id=A2 記録（規約6）",
            aRow?.before_json?.store_id === storeA1!.id && aRow?.after_json?.store_id === storeA2!.id, JSON.stringify(aRow));
        }

        // inactive 行の異動は明示拒否（実装ノート【9】・曖昧経路封じ）
        const { error: eT9 } = await owner.rpc("staff_transfer_store", { p_membership_id: memD1, p_new_store_id: storeA2!.id });
        check("段17 ② inactive 行の異動 = inactive membership（【9】ガード）", has(eT9, "inactive membership"), eT9?.message ?? "通ってしまった");
        // 他店に active がある状態の reactivate は拒否（⑤の 1ユーザー1アクティブ検証）
        const { error: eT10 } = await owner.rpc("staff_reactivate", { p_membership_id: memD1 });
        check("段17 ⑤ 他店 active あり = already active elsewhere（1ユーザー1アクティブ）", has(eT10, "already active elsewhere"), eT10?.message ?? "通ってしまった");

        // ★出戻り分岐: A2→A1（新店 A1 に inactive 既存行あり＝reactivate・新規 INSERT でない）
        const { data: backId, error: eT11 } = await owner.rpc("staff_transfer_store", { p_membership_id: newMemId as string, p_new_store_id: storeA1!.id });
        check("段17 ② ★出戻り分岐: A2→A1 異動成功", !eT11 && typeof backId === "string", eT11?.message);
        check("段17 ② ★出戻り分岐: 返却 id = 元 A1 membership（既存行 reactivate＝新規 INSERT でない）",
          backId === memD1, `got ${JSON.stringify(backId)} (expected ${memD1})`);
        const { data: mBack } = await admin.from("memberships")
          .select("is_active, role, can_register, can_crm, can_shift").eq("id", memD1).single();
        check("段17 ② ★出戻り: reactivate 後フラグ既存値維持（can_register=true・INSERT default false でない）",
          mBack?.is_active === true && mBack?.role === "staff"
            && mBack?.can_register === true && mBack?.can_crm === false && mBack?.can_shift === false,
          JSON.stringify(mBack));
        const { data: mA2After } = await admin.from("memberships").select("is_active").eq("id", newMemId as string).single();
        const { data: allD1 } = await admin.from("memberships").select("id, is_active").eq("user_id", uD1!.id);
        check("段17 ② ★出戻り物理確認: A2 行 inactive・総行数2（第3行なし）・active=1",
          mA2After?.is_active === false && (allD1 ?? []).length === 2 && (allD1 ?? []).filter((m) => m.is_active).length === 1,
          JSON.stringify(allD1));

        // ═══ ④ staff_deactivate ／ ⑤ staff_reactivate（owner/manager 自店）═══
        const { error: eD1 } = await staffActor.rpc("staff_deactivate", { p_membership_id: memD1 });
        check("段17 ④ staff forbidden", forbidden(eD1), eD1?.message ?? "通ってしまった");
        const { error: eD2 } = await cast.rpc("staff_deactivate", { p_membership_id: memD1 });
        check("段17 ④ cast forbidden", forbidden(eD2), eD2?.message ?? "通ってしまった");
        const { error: eD3 } = await mgr.rpc("staff_deactivate", { p_membership_id: memD2 });
        check("段17 ④ manager 他店 D2 forbidden（店スコープ）", forbidden(eD3), eD3?.message ?? "通ってしまった");
        const { error: eD4 } = await owner.rpc("staff_deactivate", { p_membership_id: memOwner.id });
        check("段17 ④ 対象 owner = bad target（owner 解除封じ）", has(eD4, "bad target"), eD4?.message ?? "通ってしまった");
        const { error: eD5 } = await owner.rpc("staff_deactivate", { p_membership_id: randomUUID() });
        check("段17 ④ 不在 membership = not found", has(eD5, "not found"), eD5?.message ?? "通ってしまった");
        const { error: eD6 } = await mgr.rpc("staff_deactivate", { p_membership_id: memD1 });
        check("段17 ④ manager 自店 deactivate 成功", !eD6, eD6?.message);
        const { data: mD } = await admin.from("memberships").select("is_active").eq("id", memD1).single();
        check("段17 ④ 実 UPDATE 物理確認: is_active=false（物理削除なし）", mD?.is_active === false, JSON.stringify(mD));
        const { error: eD7 } = await mgr.rpc("staff_deactivate", { p_membership_id: memD1 });
        check("段17 ④ 再解除 = already inactive", has(eD7, "already inactive"), eD7?.message ?? "通ってしまった");

        const { error: eR1 } = await staffActor.rpc("staff_reactivate", { p_membership_id: memD1 });
        check("段17 ⑤ staff forbidden", forbidden(eR1), eR1?.message ?? "通ってしまった");
        const { error: eR2 } = await mgr.rpc("staff_reactivate", { p_membership_id: memD2 });
        check("段17 ⑤ manager 他店 D2 forbidden（店スコープ）", forbidden(eR2), eR2?.message ?? "通ってしまった");
        const { error: eR3 } = await owner.rpc("staff_reactivate", { p_membership_id: memCast.id });
        check("段17 ⑤ 対象 cast = bad target", has(eR3, "bad target"), eR3?.message ?? "通ってしまった");
        const { error: eR4 } = await mgr.rpc("staff_reactivate", { p_membership_id: memD1 });
        check("段17 ⑤ manager 自店 reactivate 成功（再雇用）", !eR4, eR4?.message);
        const { data: mR } = await admin.from("memberships").select("is_active, can_register").eq("id", memD1).single();
        check("段17 ⑤ 実 UPDATE 物理確認: active 復帰・フラグ既存値維持（can_register=true）",
          mR?.is_active === true && mR?.can_register === true, JSON.stringify(mR));
        const { error: eR5 } = await mgr.rpc("staff_reactivate", { p_membership_id: memD1 });
        check("段17 ⑤ 再復帰 = already active", has(eR5, "already active"), eR5?.message ?? "通ってしまった");

        // ═══ ④⑤ ★結合: 在籍解除で認可が全倒れ（退職回帰同型）→ reactivate で復帰 ═══
        const { error: eK1 } = await owner.rpc("staff_deactivate", { p_membership_id: memRegOff.id });
        check("段17 ④ ★結合（準備）: staffRegOffA1 を在籍解除", !eK1, eK1?.message);
        const { data: roleGone, error: eK2 } = await staffOff.rpc("auth_role");
        check("段17 ④ ★結合: 解除後 auth_role() = null（認可倒れ）", !eK2 && roleGone === null, eK2?.message ?? `got ${JSON.stringify(roleGone)}`);
        const { data: memGone } = await staffOff.from("memberships").select("id");
        const { data: storesGone } = await staffOff.from("stores").select("id");
        check("段17 ④ ★結合: 解除後 memberships/stores select 0行（RLS 全倒れ）",
          (memGone ?? []).length === 0 && (storesGone ?? []).length === 0,
          `memberships=${(memGone ?? []).length}, stores=${(storesGone ?? []).length}`);
        const { error: eK3 } = await staffOff.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段17 ④ ★結合: 解除後 RPC forbidden（auth null → fail-closed）", forbidden(eK3), eK3?.message ?? "通ってしまった");
        const { error: eK4 } = await owner.rpc("staff_reactivate", { p_membership_id: memRegOff.id });
        check("段17 ⑤ ★結合: owner reactivate 成功（再雇用）", !eK4, eK4?.message);
        const { data: roleBack } = await staffOff.rpc("auth_role");
        check("段17 ⑤ ★結合: 復帰後 auth_role() = 'staff'（対照）", roleBack === "staff", `got ${JSON.stringify(roleBack)}`);
      } finally {
        // fixture 復元の最終保証（service 直・途中失敗でも rls の固定カウント前提を汚さない）
        await admin.from("memberships").update({
          role: memRegOff.role, is_active: memRegOff.is_active,
          can_register: memRegOff.can_register, can_crm: memRegOff.can_crm, can_shift: memRegOff.can_shift,
        }).eq("id", memRegOff.id);
        // ダミー2人の除去（D1 は異動で membership 2行になっている＝user_id 起点で全行削除）
        for (const uid of [uD1?.id, uD2?.id]) {
          if (!uid) continue;
          await admin.from("memberships").delete().eq("user_id", uid as string);
          await admin.from("users").delete().eq("id", uid as string);
        }
        await wipeSeatChecks();
      }
      // 復元/掃除の物理確認（rls 固定カウント＝memberships 8行の前提 positive）
      const { data: mFin } = await admin.from("memberships")
        .select("role, is_active, can_register, can_crm, can_shift").eq("id", memRegOff.id).single();
      check("段17 復元確認: staffRegOffA1 = staff/active/(false,false,false)",
        mFin?.role === "staff" && mFin?.is_active === true
          && mFin?.can_register === false && mFin?.can_crm === false && mFin?.can_shift === false,
        JSON.stringify(mFin));
      const { data: uLeft } = await admin.from("users").select("id").in("email", [D1_EMAIL, D2_EMAIL]);
      check("段17 掃除確認: ダミー users/memberships 0行（固定カウント非汚染）", (uLeft ?? []).length === 0, `got ${(uLeft ?? []).length}`);
      for (const c of sessions.values()) await c.auth.signOut();
    }
  }

  // ── 段18: F3a 束3-2 Q-2（mig0026）staff_create の実効ゲート＋結合テスト ──
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
        fails.push(`段18 ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
        return null;
      }
      sessions.set(key, c);
      return c;
    };
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    // 段18 生成物はすべてこの prefix（try/finally で user_id 起点全消し＝固定カウント非汚染）
    const SC = "nox-verify-sc-";
    const E1 = `${SC}new1@example.com`;        // 完全新規→既存分岐→出戻りのライフサイクル対象
    const E2 = `${SC}new2@example.com`;        // owner の org 内他店（A2）positive
    const E3 = `${SC}new3@example.com`;        // manager 自店 staff positive
    const E4 = `${SC}mgr@example.com`;         // owner の manager 作成 positive
    const INACT_EMAIL = `${SC}inactive@example.com`; // ★【11】発火用（users.is_active=false）
    const LINK_EMAIL = `${SC}link@example.com`;      // ★結合テスト用（実 auth・signIn する）

    // 店 id 解決
    const { data: storeRows } = await admin.from("stores").select("id, name, org_id")
      .in("name", [STORE_A1, STORE_A2, STORE_B1]);
    const storeA1 = storeRows?.find((s) => s.name === STORE_A1);
    const storeA2 = storeRows?.find((s) => s.name === STORE_A2);
    const storeB1 = storeRows?.find((s) => s.name === STORE_B1);
    check("段18（準備）店 id 解決", !!storeA1 && !!storeA2 && !!storeB1);

    // 前回失敗遺物の掃除（再実行冪等）: users 行＋実 auth（LINK_EMAIL のみ auth 実体を持ちうる）
    const wipeScRows = async () => {
      const { data: oldU } = await admin.from("users").select("id").like("email", `${SC}%`);
      const oldIds = (oldU ?? []).map((r) => r.id as string);
      if (oldIds.length) {
        await admin.from("memberships").delete().in("user_id", oldIds);
        await admin.from("users").delete().in("id", oldIds);
      }
    };
    const deleteAuthByEmail = async (email: string) => {
      for (let page = 1; page <= 20; page++) {
        const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return;
        const hit = list.users.find((u) => u.email === email);
        if (hit) { await admin.auth.admin.deleteUser(hit.id); return; }
        if (list.users.length < 200) return;
      }
    };
    await wipeScRows();
    await deleteAuthByEmail(LINK_EMAIL);

    const owner = await signInUser("ownerA");
    const mgr = await signInUser("managerA1");
    const staffActor = await signInUser("staffRegOnA1");
    const cast = await signInUser("castA1a");
    let linkClient: SupabaseClient | null = null;
    let linkAuthId: string | null = null;
    if (owner && mgr && staffActor && cast && storeA1 && storeA2 && storeB1) {
      // PERM卓（結合テストの check_open 用・段14〜17 と同一卓を再利用）＋伝票 wipe
      let seatId = "";
      {
        const { data: sExist } = await admin.from("seats").select("id")
          .eq("store_id", storeA1.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
        if (sExist?.length) seatId = sExist[0].id as string;
        else {
          const { data: sNew } = await admin.from("seats").insert({
            org_id: storeA1.org_id, store_id: storeA1.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
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

      // ダミー auth uuid（users.auth_user_id に FK 無し＝auth 実体不要・段16/17 と同手法）
      const dummy1 = randomUUID();
      const dummy2 = randomUUID();
      const scArgs = (over: Record<string, unknown>) => ({
        p_auth_user_id: randomUUID(), p_email: `${SC}probe@example.com`, p_name: "検証追加プローブ",
        p_store_id: storeA1.id, p_role: "staff", ...over,
      });

      try {
        // ═══ ① bad 系（入力検証・owner セッション）═══
        const { error: eB1 } = await owner.rpc("staff_create", scArgs({ p_auth_user_id: null }));
        check("段18 ① p_auth_user_id null = bad auth user", has(eB1, "bad auth user"), eB1?.message ?? "通ってしまった");
        for (const [label, em] of [["null", null], ["空白のみ", "   "], ["256字", "a".repeat(256)]] as Array<[string, string | null]>) {
          const { error } = await owner.rpc("staff_create", scArgs({ p_email: em }));
          check(`段18 ① email ${label} = bad email`, has(error, "bad email"), error?.message ?? "通ってしまった");
        }
        for (const [label, nm] of [["null", null], ["空白のみ", "   "], ["81字", "あ".repeat(81)]] as Array<[string, string | null]>) {
          const { error } = await owner.rpc("staff_create", scArgs({ p_name: nm }));
          check(`段18 ① 名前 ${label} = bad name`, has(error, "bad name"), error?.message ?? "通ってしまった");
        }
        for (const badRole of ["owner", "cast", "admin"]) {
          const { error } = await owner.rpc("staff_create", scArgs({ p_role: badRole }));
          check(`段18 ① p_role='${badRole}' = bad role`, has(error, "bad role"), error?.message ?? "通ってしまった");
        }
        const { error: eB2 } = await owner.rpc("staff_create", scArgs({ p_store_id: randomUUID() }));
        check("段18 ① 不在 store = invalid store", has(eB2, "invalid store"), eB2?.message ?? "通ってしまった");
        const { error: eB3 } = await owner.rpc("staff_create", scArgs({ p_store_id: storeB1.id }));
        check("段18 ① 他 org store = invalid store（越境封じ）", has(eB3, "invalid store"), eB3?.message ?? "通ってしまった");

        // ═══ ② 権限マトリクス＋完全新規ルートの物理確認 ═══
        const { data: m1, error: eN1 } = await owner.rpc("staff_create",
          scArgs({ p_auth_user_id: dummy1, p_email: E1, p_name: "検証追加SC1" }));
        check("段18 ② owner staff 作成成功（A1・完全新規）", !eN1 && typeof m1 === "string", eN1?.message);
        const { data: u1Rows } = await admin.from("users").select("id, auth_user_id, name, is_active").eq("email", E1);
        check("段18 ② 完全新規: users 1行 INSERT・auth_user_id=渡したダミー uuid・is_active=true",
          (u1Rows ?? []).length === 1 && u1Rows?.[0]?.auth_user_id === dummy1
            && u1Rows?.[0]?.name === "検証追加SC1" && u1Rows?.[0]?.is_active === true,
          JSON.stringify(u1Rows));
        const { data: m1Row } = await admin.from("memberships")
          .select("store_id, role, is_active, can_register, can_crm, can_shift").eq("id", m1 as string).single();
        check("段18 ② 完全新規: membership A1 staff active・フラグ全 false（fail-closed）",
          m1Row?.store_id === storeA1.id && m1Row?.role === "staff" && m1Row?.is_active === true
            && m1Row?.can_register === false && m1Row?.can_crm === false && m1Row?.can_shift === false,
          JSON.stringify(m1Row));
        {
          const { data: aud } = await owner.from("audit_logs")
            .select("before_json, after_json")
            .eq("action", "staff_create").eq("target", `memberships:${m1}`)
            .order("at", { ascending: false }).limit(1);
          const aRow = aud?.[0] as { before_json?: { email?: string; created?: boolean }; after_json?: { store_id?: string } } | undefined;
          check("段18 ② audit: before=生成情報（email/created）・after.store_id=A1（規約6）",
            aRow?.before_json?.email === E1 && aRow?.before_json?.created === true && aRow?.after_json?.store_id === storeA1.id,
            JSON.stringify(aRow));
        }
        const { data: m2, error: eN2 } = await owner.rpc("staff_create",
          scArgs({ p_email: E2, p_name: "検証追加SC2", p_store_id: storeA2.id }));
        check("段18 ② owner org 内他店 A2 へ staff 作成成功（org 全店）", !eN2 && typeof m2 === "string", eN2?.message);
        const { data: m4, error: eN4 } = await owner.rpc("staff_create",
          scArgs({ p_email: E4, p_name: "検証追加SCmgr", p_role: "manager" }));
        check("段18 ② owner manager 作成成功", !eN4 && typeof m4 === "string", eN4?.message);
        const { data: m4Row } = await admin.from("memberships").select("role").eq("id", m4 as string).single();
        check("段18 ② manager 作成の物理確認: role=manager", m4Row?.role === "manager", JSON.stringify(m4Row));
        const { data: m3, error: eN3 } = await mgr.rpc("staff_create",
          scArgs({ p_email: E3, p_name: "検証追加SC3" }));
        check("段18 ② manager 自店 staff 作成成功", !eN3 && typeof m3 === "string", eN3?.message);
        const { error: eF1 } = await mgr.rpc("staff_create",
          scArgs({ p_email: `${SC}x1@example.com`, p_store_id: storeA2.id }));
        check("段18 ② manager 他店 A2 staff = forbidden（店スコープ）", forbidden(eF1), eF1?.message ?? "通ってしまった");
        const { error: eF2 } = await mgr.rpc("staff_create",
          scArgs({ p_email: `${SC}x2@example.com`, p_role: "manager" }));
        check("段18 ② manager が manager 作成 = forbidden（自店でも・同格増殖封じ）", forbidden(eF2), eF2?.message ?? "通ってしまった");
        const { error: eF3 } = await staffActor.rpc("staff_create", scArgs({ p_email: `${SC}x3@example.com` }));
        check("段18 ② staff forbidden", forbidden(eF3), eF3?.message ?? "通ってしまった");
        const { error: eF4 } = await cast.rpc("staff_create", scArgs({ p_email: `${SC}x4@example.com` }));
        check("段18 ② cast forbidden", forbidden(eF4), eF4?.message ?? "通ってしまった");

        // ═══ ③ 既存 user 分岐（E1・1ユーザー1アクティブ）═══
        const { error: eE1 } = await owner.rpc("staff_create",
          scArgs({ p_auth_user_id: dummy2, p_email: E1, p_store_id: storeA2.id }));
        check("段18 ③ 他店 active を持つ既存 user を別店に = already active elsewhere（新規 INSERT ルート）",
          has(eE1, "already active elsewhere"), eE1?.message ?? "通ってしまった");
        await admin.from("memberships").update({ is_active: false }).eq("id", m1 as string);
        const { data: mAdd, error: eE2 } = await owner.rpc("staff_create",
          scArgs({ p_auth_user_id: dummy2, p_email: E1, p_store_id: storeA2.id }));
        check("段18 ③ 既存 user への membership 追加成功（A1 inactive 化後・別店 A2）", !eE2 && typeof mAdd === "string", eE2?.message);
        const { data: u1After } = await admin.from("users").select("id, auth_user_id").eq("email", E1);
        check("段18 ③ 既存 user 分岐: users 増えない（1行のまま）・auth_user_id 上書きしない（dummy1 のまま＝【4】）",
          (u1After ?? []).length === 1 && u1After?.[0]?.auth_user_id === dummy1, JSON.stringify(u1After));
        const { error: eE3 } = await owner.rpc("staff_create",
          scArgs({ p_email: E1, p_store_id: storeA2.id }));
        check("段18 ③ 既存 active 行がある店に同 user = already member", has(eE3, "already member"), eE3?.message ?? "通ってしまった");
        const { error: eE4 } = await owner.rpc("staff_create", scArgs({ p_email: E1 }));
        check("段18 ③ 出戻りルートでも他店 active は already active elsewhere（reactivate ルート）",
          has(eE4, "already active elsewhere"), eE4?.message ?? "通ってしまった");

        // ═══ ④ 出戻り reactivate（id 一致証明＋フラグ既存値維持）═══
        await admin.from("memberships").update({ can_register: true }).eq("id", m1 as string); // 判別子
        await admin.from("memberships").update({ is_active: false }).eq("id", mAdd as string);
        const { data: mBack, error: eR1 } = await owner.rpc("staff_create", scArgs({ p_email: E1 }));
        check("段18 ④ ★出戻り: inactive 行がある店に追加 = reactivate 成功", !eR1 && typeof mBack === "string", eR1?.message);
        check("段18 ④ ★出戻り: 返却 id = 元 membership（新規 INSERT でないを id 一致で証明）",
          mBack === m1, `got ${JSON.stringify(mBack)} (expected ${m1})`);
        const { data: mBackRow } = await admin.from("memberships")
          .select("is_active, role, can_register, can_crm, can_shift").eq("id", m1 as string).single();
        check("段18 ④ ★出戻り: フラグ既存値維持（can_register=true・INSERT default false でない）",
          mBackRow?.is_active === true && mBackRow?.role === "staff" && mBackRow?.can_register === true,
          JSON.stringify(mBackRow));
        const { data: u1Mems } = await admin.from("users").select("id").eq("email", E1);
        const { data: allE1 } = await admin.from("memberships").select("id, is_active").eq("user_id", u1Mems![0].id as string);
        check("段18 ④ ★出戻り物理確認: 総行数2（第3行なし）・active=1（1ユーザー1アクティブ）",
          (allE1 ?? []).length === 2 && (allE1 ?? []).filter((m) => m.is_active).length === 1, JSON.stringify(allE1));

        // ═══ ⑤ ★【11】inactive user の発火（理論ガードのまま回帰固定しない・相談役推奨）═══
        await admin.from("users").insert({
          org_id: storeA1.org_id, auth_user_id: randomUUID(), email: INACT_EMAIL,
          name: "検証追加SC無効", is_active: false,
        });
        const { error: eI1 } = await owner.rpc("staff_create", scArgs({ p_email: INACT_EMAIL }));
        check("段18 ⑤ ★【11】users.is_active=false の既存 user = inactive user（明示拒否）",
          has(eI1, "inactive user"), eI1?.message ?? "通ってしまった");

        // ═══ ⑥ 【10】cast/owner 人材封じ ═══
        const { error: eC1 } = await owner.rpc("staff_create",
          scArgs({ p_email: FIXTURE_USERS.castA1a.email, p_store_id: storeA2.id }));
        check("段18 ⑥ 【10】cast 人材の email = bad target（役職追加付与封じ）", has(eC1, "bad target"), eC1?.message ?? "通ってしまった");
        const { error: eC2 } = await owner.rpc("staff_create",
          scArgs({ p_email: FIXTURE_USERS.ownerA.email, p_store_id: storeA2.id }));
        check("段18 ⑥ 【10】owner 人材の email = bad target", has(eC2, "bad target"), eC2?.message ?? "通ってしまった");

        // ═══ ⑦ ★結合テスト: 実 auth で作った staff が既存ゲート網（束1/束2/束3-1/Q-1）に乗る ═══
        {
          const { data: cu, error: eCu } = await admin.auth.admin.createUser({
            email: LINK_EMAIL, password: env.SEED_PASSWORD, email_confirm: true,
          });
          if (eCu || !cu?.user) {
            fails.push(`段18 ⑦ 実 auth 生成失敗: ${eCu?.message}`);
          } else {
            linkAuthId = cu.user.id;
            const { data: mLink, error: eL1 } = await owner.rpc("staff_create", {
              p_auth_user_id: linkAuthId, p_email: LINK_EMAIL, p_name: "検証追加SC結合",
              p_store_id: storeA1.id, p_role: "staff",
            });
            check("段18 ⑦ ★結合: 実 auth uid で staff_create 成功", !eL1 && typeof mLink === "string", eL1?.message);
            linkClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
              auth: { autoRefreshToken: false, persistSession: false },
            });
            const { error: eSign } = await linkClient.auth.signInWithPassword({
              email: LINK_EMAIL, password: env.SEED_PASSWORD,
            });
            check("段18 ⑦ ★結合: 生成スタッフで signIn 成功（auth↔users 連鎖が生きている）", !eSign, eSign?.message);
            if (!eSign) {
              const { data: roleLink } = await linkClient.rpc("auth_role");
              check("段18 ⑦ ★結合: auth_role='staff'（auth.uid→users→memberships 連鎖）", roleLink === "staff", `got ${JSON.stringify(roleLink)}`);
              const { error: eOpen0 } = await linkClient.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
              check("段18 ⑦ ★結合: フラグ全 false → check_open forbidden（束1 fail-closed）", forbidden(eOpen0), eOpen0?.message ?? "通ってしまった");
              const { data: cust0 } = await linkClient.from("customers").select("id");
              check("段18 ⑦ ★結合: フラグ全 false → customers 0行（束2 fail-closed）", (cust0 ?? []).length === 0, `got ${(cust0 ?? []).length}`);
              const { error: ePerm } = await owner.rpc("set_staff_perms", {
                p_membership_id: mLink, p_can_register: true, p_can_crm: true, p_can_shift: false,
              });
              check("段18 ⑦ ★結合: set_staff_perms（束3-1）で can_register/can_crm 付与", !ePerm, ePerm?.message);
              const { data: chkLink, error: eOpen1 } = await linkClient.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
              check("段18 ⑦ ★結合: 付与後 check_open 成功（実 INSERT・束1 実反映）", !eOpen1 && typeof chkLink === "string", eOpen1?.message);
              await wipeSeatChecks();
              const { data: cust1 } = await linkClient.from("customers").select("id");
              check("段18 ⑦ ★結合: 付与後 customers 自店4客可視（束2 実反映）", (cust1 ?? []).length === 4, `got ${(cust1 ?? []).length}`);
              const { error: eDeact } = await owner.rpc("staff_deactivate", { p_membership_id: mLink });
              check("段18 ⑦ ★結合: staff_deactivate（Q-1）成功", !eDeact, eDeact?.message);
              const { data: roleGone } = await linkClient.rpc("auth_role");
              check("段18 ⑦ ★結合: 解除後 auth_role=null（認可倒れ）", roleGone === null, `got ${JSON.stringify(roleGone)}`);
              const { error: eReact } = await owner.rpc("staff_reactivate", { p_membership_id: mLink });
              check("段18 ⑦ ★結合: staff_reactivate（Q-1）成功", !eReact, eReact?.message);
              const { data: roleBack } = await linkClient.rpc("auth_role");
              const { data: mLinkRow } = await admin.from("memberships").select("can_register").eq("id", mLink as string).single();
              check("段18 ⑦ ★結合: 復帰後 auth_role='staff'・can_register=true 維持（Q-2 生成物×Q-1 編集の噛み合い）",
                roleBack === "staff" && mLinkRow?.can_register === true, `role=${JSON.stringify(roleBack)}, mem=${JSON.stringify(mLinkRow)}`);
            }
          }
        }
      } finally {
        // 生成物の全消し（user_id 起点＝membership が複数店に増える可能性を考慮）＋実 auth の削除＋伝票 wipe
        await wipeScRows();
        if (linkAuthId) await admin.auth.admin.deleteUser(linkAuthId).catch(() => undefined);
        await wipeSeatChecks();
      }
      // 掃除の物理確認（rls 固定カウント＝users 9行/memberships 8行の前提 positive）
      const { data: scLeft } = await admin.from("users").select("id").like("email", `${SC}%`);
      check("段18 掃除確認: 生成 users/memberships 0行（固定カウント非汚染）", (scLeft ?? []).length === 0, `got ${(scLeft ?? []).length}`);
      if (linkClient) await linkClient.auth.signOut();
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
