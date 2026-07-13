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
 * 段19（0027 適用後）: F3a-3 予約機能（reservations＋RPC4本）の実効ゲート＋definer チェーン結合。
 *       19-1 to_check 正常（check_open＋set_nominations 実行・customer/指名引き継ぎ・visited⇔check_id 1:1）
 *       19-2 seat occupied／19-3 cast inactive 指名スキップ開店（発見3）／19-4 nom_type 両対応
 *       （引数 > 予約 > free）／19-5 not bookable（visited/no_show/cancelled から再処理不可）／
 *       19-6 can_register なし staff は内側 check_open が forbidden／19-7 ★【10】フリー予約×他店卓で
 *       invalid store 実発火／19-8 CHECK 全値実挿入＋不正値拒否（runtime のみ表面化＝BANZEN 0067）／
 *       19-9 遷移制約（booked からのみ・確定状態から不可・visited/booked は bad status）／
 *       19-10 visits 整合（visited→close で customer visits +1・no_show/cancelled は不変）／
 *       19-11 RLS 可視範囲（owner org 全店/manager 自店/staff can_crm/cast 自分指名のみ・未指名不可視/
 *       他 org 0行）／19-12 ★wipe 順序（reservations.check_id が checks FK＝check_id null 化→checks 削除の
 *       順序を wipe に組込・実証 assert つき）。予約・伝票・ダミー cast/卓は try/finally 全消し＝非汚染。
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

  // 共有セッションキャッシュ＝1 run 1認証/ユーザー（Supabase auth レート制限対策）。
  // verify-nox-rls の 2026-07-06 パターンを anon-guard へ展開: 従来は段14〜20 が毎段 7人前後を
  // 再サインイン（1 run ≈ 47回）し、連続実行や f0 2連続で "Request rate limit reached" に接触していた。
  // 各段の signOut は衛生目的のみ＝共有セッションを殺すと後段が死んだキャッシュを掴むため
  // signOut を no-op 化して生かす。RLS/ゲートは毎クエリ live 評価のためキャッシュしても
  // 各段の判定（membership flip 含む）は不変（rls スイートで実証済み）。
  const sessionCache = new Map<FixtureUserKey, SupabaseClient>();
  const signInShared = async (label: string, key: FixtureUserKey): Promise<SupabaseClient | null> => {
    const cached = sessionCache.get(key);
    if (cached) return cached;
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD,
    });
    if (error) {
      fails.push(`${label} ${key} サインイン失敗（seed:f0 実行済みか確認）: ${error.message}`);
      return null;
    }
    // 共有セッションを保つ（signOut を無害化）＝以後 signInShared(key) はキャッシュを返す
    c.auth.signOut = (async () => ({ error: null })) as typeof c.auth.signOut;
    sessionCache.set(key, c);
    return c;
  };

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

  // ── 段19a: F3a-3 予約 RPC 4本 anon BLOCKED（mig0027・authenticated grant）──
  const F3A3_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["reservation_create", { p_store_id: null, p_reserved_at: null }],
    ["reservation_update", { p_reservation_id: null, p_reserved_at: null, p_customer_id: null, p_cast_id: null, p_guest_name: null, p_party_size: null, p_nom_type: null, p_memo: null }],
    ["reservation_set_status", { p_reservation_id: null, p_status: null }],
    ["reservation_to_check", { p_reservation_id: null, p_seat_id: null, p_nom_type: null }],
  ];
  for (const [fn, args] of F3A3_RPC_PROBES) {
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
    "reservations", // F3a-3（mig0027）
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
  const authed = await signInShared("段2b", "castA1a");
  if (authed) {
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
    const signInStaff = async (key: "staffRegOnA1" | "staffRegOffA1") => signInShared("段14", key);
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
      const c = await signInShared("段15", key);
      if (c) sessions.set(key, c);
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
      // days_since は seed 実行日からの経過で毎日 +1 ドリフトする＝厳格レンジ（±1）だと seed 後
      // 2日で偽 fail（2026-07-13 実測 44/74 で発生）。fixture の設計意図（40/70=境界 30/60 を避けた
      // マージン）どおり tier 安全域で assert する（tier が本当に動く seed+20日超は seed:f0 再実行が前提）。
      check("段15 churn ゴールデン: フリー客 tier='mid'（seed 時 40日前・30-59 の安全域）",
        rFree?.churn_tier === "mid" && (rFree?.days_since ?? 0) >= 40 && (rFree?.days_since ?? 99) < 60, JSON.stringify(rFree));
      check("段15 churn ゴールデン: 指名B客 tier='high'（seed 時 70日前・60+ の安全域）",
        rCastB?.churn_tier === "high" && (rCastB?.days_since ?? 0) >= 70, JSON.stringify(rCastB));
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
      const c = await signInShared("段16", key);
      if (c) sessions.set(key, c);
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
      const c = await signInShared("段17", key);
      if (c) sessions.set(key, c);
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
      const c = await signInShared("段18", key);
      if (c) sessions.set(key, c);
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

  // ── 段19: F3a-3（mig0027）予約機能の実効ゲート＋definer チェーン結合 ──
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const sessions = new Map<FixtureUserKey, SupabaseClient>();
    const signInUser = async (key: FixtureUserKey) => {
      const cached = sessions.get(key);
      if (cached) return cached;
      const c = await signInShared("段19", key);
      if (c) sessions.set(key, c);
      return c;
    };
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const iso = (offsetH: number) => new Date(Date.now() + offsetH * 3600_000).toISOString();

    // 準備（service）: 店・卓・fixture 顧客/cast の id 解決
    const { data: storeRows } = await admin.from("stores").select("id, name, org_id")
      .in("name", [STORE_A1, STORE_A2]);
    const storeA1 = storeRows?.find((s) => s.name === STORE_A1);
    const storeA2 = storeRows?.find((s) => s.name === STORE_A2);
    const { data: custRows } = await admin.from("customers").select("id")
      .eq("name", FIXTURE_CUSTOMERS.custCastA.name).single();
    const custCastA = custRows?.id as string;
    const { data: castRows } = await admin.from("casts").select("id")
      .eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", storeA1?.id ?? "").single();
    const castA1aId = castRows?.id as string;
    check("段19（準備）店/顧客/cast の id 解決", !!storeA1 && !!storeA2 && !!custCastA && !!castA1aId);

    // PERM卓（A1・段14〜18 と同一卓を再利用）＋ 段19 専用 A2 卓（19-7 用・finally で削除）
    let seatA1 = "";
    {
      const { data: sExist } = await admin.from("seats").select("id")
        .eq("store_id", storeA1!.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
      if (sExist?.length) seatA1 = sExist[0].id as string;
      else {
        const { data: sNew } = await admin.from("seats").insert({
          org_id: storeA1!.org_id, store_id: storeA1!.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
        }).select("id").single();
        seatA1 = sNew!.id as string;
      }
    }
    const verifyStoreIds = [storeA1!.id, storeA2!.id];
    // 前回失敗遺物の掃除（再実行冪等・reservations→cast/卓 の FK 順）
    const wipeReservations = async () => {
      await admin.from("reservations").delete().in("store_id", verifyStoreIds);
    };
    await wipeReservations();
    await admin.from("casts").delete().like("name", "NOX-VERIFY-段19%");
    await admin.from("seats").delete().eq("name", "NOX-VERIFY-段19卓A2");
    const { data: seatA2Row } = await admin.from("seats").insert({
      org_id: storeA2!.org_id, store_id: storeA2!.id, name: "NOX-VERIFY-段19卓A2", kind: "卓", sort_order: 999,
    }).select("id").single();
    const seatA2 = seatA2Row?.id as string;
    const { data: dCastRow } = await admin.from("casts").insert({
      org_id: storeA1!.org_id, store_id: storeA1!.id, name: "NOX-VERIFY-段19cast", is_active: true,
    }).select("id").single();
    const dCast = dCastRow?.id as string;
    check("段19（準備）A2 卓・ダミー cast 生成", !!seatA2 && !!dCast);

    // ★19-12: reservations.check_id が checks を FK 参照＝checks 削除の前に check_id null 化が必須の順序
    const wipeSeatChecks = async (seatId: string) => {
      const { data: cs } = await admin.from("checks").select("id").eq("seat_id", seatId);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (!ids.length) return;
      await admin.from("reservations").update({ check_id: null }).in("check_id", ids); // ★先に参照を外す
      for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
        await admin.from(t).delete().in("check_id", ids);
      }
      await admin.from("checks").delete().in("id", ids);
    };
    await wipeSeatChecks(seatA1);

    const owner = await signInUser("ownerA");
    const mgr = await signInUser("managerA1");
    const crm = await signInUser("staffCrmOnA1");
    const regOn = await signInUser("staffRegOnA1");
    const regOff = await signInUser("staffRegOffA1");
    const cast = await signInUser("castA1a");
    const mgrB1 = await signInUser("managerB1");
    if (storeA1 && storeA2 && custCastA && castA1aId && seatA2 && dCast
        && owner && mgr && crm && regOn && regOff && cast && mgrB1) {
      try {
        // ═══ 19-8: CHECK 全値（runtime のみ表面化＝BANZEN 0067・service 直挿入で表レベルを実測）═══
        {
          const base = { org_id: storeA1.org_id, store_id: storeA1.id, reserved_at: iso(1), memo: "NOX-VERIFY-段19chk" };
          const { error: eIns } = await admin.from("reservations").insert([
            { ...base, status: "booked", nom_type: "hon" },
            { ...base, status: "visited", nom_type: "jonai" },
            { ...base, status: "no_show", nom_type: "dohan" },
            { ...base, status: "cancelled", nom_type: "free" },
            { ...base, status: "booked", nom_type: null },
          ]);
          check("段19-8 status 4値 × nom_type 4値+null 実挿入 OK（CHECK 通過）", !eIns, eIns?.message);
          const { error: eBadS } = await admin.from("reservations").insert({ ...base, status: "seated" });
          check("段19-8 不正 status = CHECK 拒否", has(eBadS, "reservations_status_chk"), eBadS?.message ?? "通ってしまった");
          const { error: eBadN } = await admin.from("reservations").insert({ ...base, nom_type: "douhan" });
          check("段19-8 不正 nom_type = CHECK 拒否", has(eBadN, "reservations_nom_type_chk"), eBadN?.message ?? "通ってしまった");
          const { error: eBadP } = await admin.from("reservations").insert({ ...base, party_size: 0 });
          check("段19-8 party_size=0 = CHECK 拒否", has(eBadP, "reservations_party_chk"), eBadP?.message ?? "通ってしまった");
          await admin.from("reservations").delete().eq("memo", "NOX-VERIFY-段19chk");
        }

        // ═══ 19-1: to_check 正常（definer チェーン・引き継ぎ・visited⇔check_id 1:1）＋ 19-4b（予約 nom_type）═══
        const { data: r1, error: eC1 } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(2), p_customer_id: custCastA,
          p_cast_id: castA1aId, p_party_size: 3, p_nom_type: "jonai", p_memo: "段19-1",
        });
        check("段19-1 reservation_create 成功（manager・customer+cast+nom_type）", !eC1 && typeof r1 === "string", eC1?.message);
        const { data: chk1, error: eT1 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r1, p_seat_id: seatA1 });
        check("段19-1 reservation_to_check 成功（definer チェーン実走）", !eT1 && typeof chk1 === "string", eT1?.message);
        const { data: chk1Row } = await admin.from("checks")
          .select("customer_id, nom_type, people, status, store_id").eq("id", chk1 as string).single();
        check("段19-1 物理確認: check_open 引き継ぎ（customer=予約客・people=3・status=open・自店）",
          chk1Row?.customer_id === custCastA && chk1Row?.people === 3 && chk1Row?.status === "open" && chk1Row?.store_id === storeA1.id,
          JSON.stringify(chk1Row));
        check("段19-4b 引数 null → 予約の nom_type（jonai）が checks に反映", chk1Row?.nom_type === "jonai", JSON.stringify(chk1Row));
        const { data: nom1 } = await admin.from("check_nominations").select("cast_id, ratio_weight").eq("check_id", chk1 as string);
        check("段19-1 物理確認: 指名引き継ぎ（check_nominations 1行・cast一致・weight=1）",
          (nom1 ?? []).length === 1 && nom1?.[0]?.cast_id === castA1aId && nom1?.[0]?.ratio_weight === 1, JSON.stringify(nom1));
        const { data: r1Row } = await admin.from("reservations").select("status, check_id").eq("id", r1 as string).single();
        check("段19-1 予約側: status=visited・check_id セット（visited⇔check_id 1:1）",
          r1Row?.status === "visited" && r1Row?.check_id === chk1, JSON.stringify(r1Row));

        // ═══ 19-5: not bookable（visited から再処理不可）═══
        const { error: eNB1 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r1, p_seat_id: seatA1 });
        check("段19-5 visited 予約の再 to_check = not bookable", has(eNB1, "not bookable"), eNB1?.message ?? "通ってしまった");

        // ═══ 19-12: wipe 順序の実証（check_id null 化 → checks 削除で FK が破れない）═══
        await wipeSeatChecks(seatA1);
        const { data: chkLeft } = await admin.from("checks").select("id").eq("seat_id", seatA1);
        const { data: r1After } = await admin.from("reservations").select("check_id").eq("id", r1 as string).single();
        check("段19-12 ★wipe 順序: check_id null 化→checks 削除が FK 違反なく完了（checks 0行・予約は check_id=null で残存）",
          (chkLeft ?? []).length === 0 && r1After?.check_id === null, JSON.stringify({ chk: chkLeft?.length, r1: r1After }));

        // ═══ 19-4a: 引数 p_nom_type が予約の nom_type に勝つ ═══
        const { data: r4a } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(2), p_nom_type: "jonai", p_guest_name: "段19-4a",
        });
        const { data: chk4a, error: eT4a } = await mgr.rpc("reservation_to_check", {
          p_reservation_id: r4a, p_seat_id: seatA1, p_nom_type: "dohan",
        });
        check("段19-4a to_check 成功（引数 nom_type 指定）", !eT4a && typeof chk4a === "string", eT4a?.message);
        const { data: chk4aRow } = await admin.from("checks").select("nom_type").eq("id", chk4a as string).single();
        check("段19-4a 引数 dohan > 予約 jonai（引数が勝つ）", chk4aRow?.nom_type === "dohan", JSON.stringify(chk4aRow));
        await wipeSeatChecks(seatA1);

        // ═══ 19-4c: 両 null → free ═══
        const { data: r4c } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(2), p_guest_name: "段19-4c",
        });
        const { data: chk4c, error: eT4c } = await mgr.rpc("reservation_to_check", { p_reservation_id: r4c, p_seat_id: seatA1 });
        check("段19-4c to_check 成功（予約・引数とも nom_type なし）", !eT4c && typeof chk4c === "string", eT4c?.message);
        const { data: chk4cRow } = await admin.from("checks").select("nom_type").eq("id", chk4c as string).single();
        check("段19-4c 両 null → free 既定", chk4cRow?.nom_type === "free", JSON.stringify(chk4cRow));
        await wipeSeatChecks(seatA1);

        // ═══ 19-2: seat occupied（使用中の卓に予約客を着けない＝発見1）═══
        const { data: chkOcc, error: eOcc0 } = await mgr.rpc("check_open", { p_seat_id: seatA1, p_people: 1, p_nom_type: "free" });
        check("段19-2（準備）卓に open 伝票を先置き", !eOcc0 && typeof chkOcc === "string", eOcc0?.message);
        const { data: rOcc } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(2), p_guest_name: "段19-2",
        });
        const { error: eOcc } = await mgr.rpc("reservation_to_check", { p_reservation_id: rOcc, p_seat_id: seatA1 });
        check("段19-2 使用中の卓へ to_check = seat occupied（既存 open 再利用の誤接続封じ）",
          has(eOcc, "seat occupied"), eOcc?.message ?? "通ってしまった");
        await wipeSeatChecks(seatA1);

        // ═══ 19-3: cast inactive 指名スキップ開店（発見3・営業を止めない）═══
        const { data: r3, error: eC3 } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(2), p_cast_id: dCast, p_guest_name: "段19-3",
        });
        check("段19-3（準備）active cast 指名の予約作成", !eC3 && typeof r3 === "string", eC3?.message);
        await admin.from("casts").update({ is_active: false }).eq("id", dCast); // 予約後に退店
        const { data: chk3, error: eT3 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r3, p_seat_id: seatA1 });
        check("段19-3 退店 cast 指名でも開店成功（指名スキップ・bad cast で倒さない）", !eT3 && typeof chk3 === "string", eT3?.message);
        const { data: nom3 } = await admin.from("check_nominations").select("id").eq("check_id", chk3 as string);
        const { data: r3Row } = await admin.from("reservations").select("status").eq("id", r3 as string).single();
        check("段19-3 物理確認: 指名 0行・予約は visited", (nom3 ?? []).length === 0 && r3Row?.status === "visited",
          JSON.stringify({ noms: nom3?.length, status: r3Row?.status }));
        await wipeSeatChecks(seatA1);

        // ═══ 19-7: ★【10】フリー予約 × 他店卓 = invalid store 実発火 ═══
        const { data: r7 } = await owner.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(2), p_guest_name: "段19-7フリー",
        });
        const { error: e7 } = await owner.rpc("reservation_to_check", { p_reservation_id: r7, p_seat_id: seatA2 });
        check("段19-7 ★【10】A1 予約 × A2 卓（customer_id=null）= invalid store（owner の org 全店権限でも誤接続封じ）",
          has(e7, "invalid store"), e7?.message ?? "通ってしまった");

        // ═══ 19-6: can_register なし staff は内側 check_open が forbidden（チェーン越しゲート）═══
        const { error: e6 } = await regOff.rpc("reservation_to_check", { p_reservation_id: r7, p_seat_id: seatA1 });
        check("段19-6 can_register=false staff の to_check = forbidden（内側 check_open の flag ゲート）",
          forbidden(e6), e6?.message ?? "通ってしまった");

        // ═══ 19-9: 遷移制約（visited は to_check 専用・確定状態から変更不可）═══
        const { data: r9a } = await mgr.rpc("reservation_create", { p_store_id: storeA1.id, p_reserved_at: iso(3), p_guest_name: "段19-9a" });
        const { data: r9b } = await mgr.rpc("reservation_create", { p_store_id: storeA1.id, p_reserved_at: iso(3), p_guest_name: "段19-9b" });
        const { error: e9a } = await mgr.rpc("reservation_set_status", { p_reservation_id: r9a, p_status: "cancelled" });
        const { error: e9b } = await mgr.rpc("reservation_set_status", { p_reservation_id: r9b, p_status: "no_show" });
        const { data: r9aRow } = await admin.from("reservations").select("status").eq("id", r9a as string).single();
        const { data: r9bRow } = await admin.from("reservations").select("status").eq("id", r9b as string).single();
        check("段19-9 booked→cancelled / booked→no_show 成功（実 UPDATE）",
          !e9a && !e9b && r9aRow?.status === "cancelled" && r9bRow?.status === "no_show",
          JSON.stringify([e9a?.message, e9b?.message, r9aRow, r9bRow]));
        const { error: e9c } = await mgr.rpc("reservation_set_status", { p_reservation_id: r9a, p_status: "no_show" });
        check("段19-9 cancelled からの変更 = bad transition", has(e9c, "bad transition"), e9c?.message ?? "通ってしまった");
        const { error: e9d } = await mgr.rpc("reservation_set_status", { p_reservation_id: r1, p_status: "cancelled" });
        check("段19-9 visited からの変更 = bad transition（確定状態）", has(e9d, "bad transition"), e9d?.message ?? "通ってしまった");
        const { error: e9e } = await mgr.rpc("reservation_set_status", { p_reservation_id: r9b, p_status: "visited" });
        check("段19-9 visited への手動遷移 = bad status（to_check 専用＝1:1 の要）", has(e9e, "bad status"), e9e?.message ?? "通ってしまった");
        const { error: e9f } = await mgr.rpc("reservation_set_status", { p_reservation_id: r9b, p_status: "booked" });
        check("段19-9 booked への復帰 = bad status", has(e9f, "bad status"), e9f?.message ?? "通ってしまった");

        // ═══ 19-10: visits 整合（束2 連動・visited→close で +1・no_show/cancelled は不変）═══
        const visitsOf = async (): Promise<number> => {
          const { data } = await owner.rpc("customer_summary", { p_customer_id: custCastA });
          return Number(((data ?? [])[0] as { visits?: number })?.visits ?? -1);
        };
        const v0 = await visitsOf();
        check("段19-10（基準）custCastA visits=2（束2 ゴールデンと一致）", v0 === 2, `got ${v0}`);
        const { data: r10 } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(1), p_customer_id: custCastA,
        });
        const { data: chk10 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r10, p_seat_id: seatA1 });
        const { error: eLn } = await mgr.rpc("check_add_line", {
          p_check_id: chk10, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: "A", p_name: "段19セット", p_unit_price: 5_000,
        });
        const { error: ePay } = await mgr.rpc("check_pay", {
          p_check_id: chk10, p_method: "cash", p_amount: 5_500, p_pay_group: "A", p_tendered: 5_500, p_idem_key: randomUUID(),
        });
        const { error: eCl } = await mgr.rpc("check_close", { p_check_id: chk10, p_idem_key: randomUUID() });
        check("段19-10 予約→伝票→会計→close 完走", !eLn && !ePay && !eCl, [eLn?.message, ePay?.message, eCl?.message].join(" / "));
        const v1 = await visitsOf();
        check("段19-10 ★visits 整合: visited 予約の check close で visits +1", v1 === v0 + 1, `got ${v1} (expected ${v0 + 1})`);
        const { data: r10b } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(1), p_customer_id: custCastA,
        });
        await mgr.rpc("reservation_set_status", { p_reservation_id: r10b, p_status: "no_show" });
        const v2 = await visitsOf();
        check("段19-10 no_show は visits 不変（check を開かない＝自然に 0 カウント）", v2 === v1, `got ${v2}`);
        await wipeSeatChecks(seatA1); // closed check を除去（rls/日報ゴールデン非干渉・visits も基準へ戻る）

        // ═══ 19-11: RLS 可視範囲（正確に3予約だけの状態を作って系統 assert）═══
        await wipeReservations();
        const { data: rA1cast } = await mgr.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(4), p_cast_id: castA1aId, p_guest_name: "段19-11指名",
        });
        const { data: rA1free, error: eCrmC } = await crm.rpc("reservation_create", {
          p_store_id: storeA1.id, p_reserved_at: iso(4), p_guest_name: "段19-11フリー",
        });
        check("段19-11（準備）staff(can_crm) の reservation_create 成功（論点1=顧客機能）", !eCrmC && typeof rA1free === "string", eCrmC?.message);
        const { data: rA2 } = await owner.rpc("reservation_create", {
          p_store_id: storeA2.id, p_reserved_at: iso(4), p_guest_name: "段19-11A2",
        });
        check("段19-11（準備）3予約生成（A1指名/A1フリー/A2）", !!rA1cast && !!rA1free && !!rA2);
        const countOf = async (c: SupabaseClient) => ((await c.from("reservations").select("id")).data ?? []).length;
        check("段19-11 owner = org 全店 3行", (await countOf(owner)) === 3, `got ${await countOf(owner)}`);
        check("段19-11 manager = 自店 A1 の 2行（A2 不可視＝店スコープ）", (await countOf(mgr)) === 2, `got ${await countOf(mgr)}`);
        check("段19-11 staff(can_crm) = 自店 2行", (await countOf(crm)) === 2, `got ${await countOf(crm)}`);
        check("段19-11 staff(can_register のみ) = 0行（crm 軸独立）", (await countOf(regOn)) === 0, `got ${await countOf(regOn)}`);
        check("段19-11 staff(フラグなし) = 0行", (await countOf(regOff)) === 0, `got ${await countOf(regOff)}`);
        const { data: castRowsSel } = await cast.from("reservations").select("id");
        check("段19-11 cast = 自分指名の 1行のみ（未指名予約は不可視）",
          (castRowsSel ?? []).length === 1 && castRowsSel?.[0]?.id === rA1cast, JSON.stringify(castRowsSel));
        check("段19-11 他 org（managerB1）= 0行（org 遮断）", (await countOf(mgrB1)) === 0, `got ${await countOf(mgrB1)}`);
      } finally {
        // ★19-12 の順序で全消し: checks 参照を外してから checks → reservations → ダミー cast/卓
        await wipeSeatChecks(seatA1);
        if (seatA2) await wipeSeatChecks(seatA2);
        await wipeReservations();
        if (dCast) await admin.from("casts").delete().eq("id", dCast);
        if (seatA2) await admin.from("seats").delete().eq("id", seatA2);
      }
      // 掃除の物理確認（rls 固定カウント非汚染の positive）
      const { data: resLeft } = await admin.from("reservations").select("id").in("store_id", verifyStoreIds);
      const { data: dLeft } = await admin.from("casts").select("id").like("name", "NOX-VERIFY-段19%");
      check("段19 掃除確認: reservations/ダミー cast 0行（非汚染）",
        (resLeft ?? []).length === 0 && (dLeft ?? []).length === 0,
        `res=${(resLeft ?? []).length}, cast=${(dLeft ?? []).length}`);
      for (const c of sessions.values()) await c.auth.signOut();
    }
  }

  // ── 段20: F3b-A 塊2-1（mig0028）customer_visit_history の実効ゲート＋実データ照合 ──
  //   checks 直 SELECT（can_register 軸）→ CRM 軸（can_crm）への definer 橋渡しを実測。
  //   fixture は段19 方式＝service 生成→try/finally 全消し（seed 常設しない・memberships 9行維持）。
  //   custCastA には束2 固定の closed 2伝票（CRM卓・5日前/100日前）が常設＝消さない。
  //   本段の 21伝票は全て直近21時間内＝降順で固定伝票より前に並び LIMIT 20 の実測を汚さない。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const sessions = new Map<FixtureUserKey, SupabaseClient>();
    const signInUser = async (key: FixtureUserKey) => {
      const cached = sessions.get(key);
      if (cached) return cached;
      const c = await signInShared("段20", key);
      if (c) sessions.set(key, c);
      return c;
    };
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    type VisitRow = {
      check_id: string; visited_at: string; total: number;
      seat_name: string | null; nom_casts: string[] | null; status: string;
    };

    // 準備（service）: 店・顧客（担当/非担当）・cast・manager users.id の解決
    const { data: s20StoreRow } = await admin.from("stores").select("id, name, org_id").eq("name", STORE_A1).single();
    const s20Store = s20StoreRow as { id: string; org_id: string } | null;
    const { data: s20Custs } = await admin.from("customers").select("id, name")
      .in("name", [FIXTURE_CUSTOMERS.custCastA.name, FIXTURE_CUSTOMERS.custCastB.name]);
    const s20CustA = s20Custs?.find((c) => c.name === FIXTURE_CUSTOMERS.custCastA.name)?.id as string;
    const s20CustB = s20Custs?.find((c) => c.name === FIXTURE_CUSTOMERS.custCastB.name)?.id as string;
    const { data: s20CastRow } = await admin.from("casts").select("id")
      .eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", s20Store?.id ?? "").single();
    const s20CastA1a = s20CastRow?.id as string;
    const { data: s20MgrRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    const s20MgrId = s20MgrRow?.id as string;
    check("段20（準備）店/顧客2/cast/manager の id 解決", !!s20Store && !!s20CustA && !!s20CustB && !!s20CastA1a && !!s20MgrId);

    // PERM卓（段14〜19 と同一卓を再利用）
    let s20Seat = "";
    {
      const { data: sExist } = await admin.from("seats").select("id")
        .eq("store_id", s20Store!.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
      if (sExist?.length) s20Seat = sExist[0].id as string;
      else {
        const { data: sNew } = await admin.from("seats").insert({
          org_id: s20Store!.org_id, store_id: s20Store!.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
        }).select("id").single();
        s20Seat = sNew!.id as string;
      }
    }
    const wipeSeat20Checks = async () => {
      const { data: cs } = await admin.from("checks").select("id").eq("seat_id", s20Seat);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (!ids.length) return;
      await admin.from("reservations").update({ check_id: null }).in("check_id", ids);
      for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
        await admin.from(t).delete().in("check_id", ids);
      }
      await admin.from("checks").delete().in("id", ids);
    };
    // 前回失敗遺物の掃除（再実行冪等・nominations→cast の FK 順は wipe 内で処理済み）
    await wipeSeat20Checks();
    await admin.from("casts").delete().like("name", "NOX-VERIFY-段20%");
    const { data: s20DCastRow } = await admin.from("casts").insert({
      org_id: s20Store!.org_id, store_id: s20Store!.id, name: "NOX-VERIFY-段20退店cast", is_active: true,
    }).select("id").single();
    const s20DCast = s20DCastRow?.id as string;
    check("段20（準備）退店テスト用ダミー cast 生成", !!s20DCast);

    const owner = await signInUser("ownerA");
    const mgr = await signInUser("managerA1");
    const crm = await signInUser("staffCrmOnA1");
    const regOn = await signInUser("staffRegOnA1");
    const regOff = await signInUser("staffRegOffA1");
    const cast = await signInUser("castA1a");
    const mgrB1 = await signInUser("managerB1");
    if (s20Store && s20CustA && s20CustB && s20CastA1a && s20MgrId && s20DCast
        && owner && mgr && crm && regOn && regOff && cast && mgrB1) {
      try {
        // 投入: closed 21件（started_at=i 時間前・total=1000+i で一意）＋ void 1件（total=99999）
        const base = {
          org_id: s20Store.org_id, store_id: s20Store.id, seat_id: s20Seat, customer_id: s20CustA,
          nom_type: "free", service_rate: 10, round_unit: 100, round_mode: "down", created_by: s20MgrId,
        };
        const startedOf = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
        const rows21 = Array.from({ length: 21 }, (_, k) => {
          const i = k + 1;
          return { ...base, status: "closed", started_at: startedOf(i), closed_at: startedOf(i), total: 1000 + i };
        });
        const { data: ins21, error: eIns } = await admin.from("checks").insert(rows21).select("id, total");
        const { error: eInsV } = await admin.from("checks").insert({
          ...base, status: "void", started_at: startedOf(2), voided_at: startedOf(1), total: 99_999,
        });
        check("段20（準備）closed 21件＋void 1件 投入", !eIns && (ins21 ?? []).length === 21 && !eInsV,
          eIns?.message ?? eInsV?.message);
        // 最新伝票（total=1001）に指名2行: position 1=ダミー cast（後で退店）・2=castA1a
        const newestId = ins21?.find((r) => r.total === 1001)?.id as string;
        const { error: eNom } = await admin.from("check_nominations").insert([
          { org_id: s20Store.org_id, store_id: s20Store.id, check_id: newestId, cast_id: s20DCast, ratio_weight: 1, position: 1 },
          { org_id: s20Store.org_id, store_id: s20Store.id, check_id: newestId, cast_id: s20CastA1a, ratio_weight: 1, position: 2 },
        ]);
        await admin.from("casts").update({ is_active: false }).eq("id", s20DCast); // 指名を残して退店
        check("段20（準備）最新伝票に指名2行（position 1=退店予定 cast・2=castA1a）", !eNom, eNom?.message);

        // ═══ 20-1: anon BLOCKED（公開 RPC の anon 軸）═══
        const { error: eAnon } = await anon.rpc("customer_visit_history", { p_customer_id: s20CustA });
        check("段20-1 anon customer_visit_history BLOCKED", isFnBlocked(eAnon), eAnon?.message ?? "実行できてしまった");

        // ═══ 20-2: 権限マトリクス ═══
        const callAs = async (c: SupabaseClient, cid: string) => await c.rpc("customer_visit_history", { p_customer_id: cid });
        const rOwner = await callAs(owner, s20CustA);
        check("段20-2 owner = 可視（20行）", !rOwner.error && (rOwner.data ?? []).length === 20,
          rOwner.error?.message ?? `got ${(rOwner.data ?? []).length}`);
        const rMgr = await callAs(mgr, s20CustA);
        check("段20-2 manager（自店客）= 可視（20行）", !rMgr.error && (rMgr.data ?? []).length === 20,
          rMgr.error?.message ?? `got ${(rMgr.data ?? []).length}`);
        const rCrm = await callAs(crm, s20CustA);
        check("段20-2 staff(can_crm) = 可視（20行）", !rCrm.error && (rCrm.data ?? []).length === 20,
          rCrm.error?.message ?? `got ${(rCrm.data ?? []).length}`);
        const rRegOn = await callAs(regOn, s20CustA);
        check("段20-2 staff(can_register のみ) = forbidden（crm 軸独立）", forbidden(rRegOn.error), rRegOn.error?.message ?? "通ってしまった");
        const rRegOff = await callAs(regOff, s20CustA);
        check("段20-2 staff(フラグなし) = forbidden", forbidden(rRegOff.error), rRegOff.error?.message ?? "通ってしまった");
        const rCastOk = await callAs(cast, s20CustA);
        check("段20-2 cast × 担当客（指名A）= 可視（20行）", !rCastOk.error && (rCastOk.data ?? []).length === 20,
          rCastOk.error?.message ?? `got ${(rCastOk.data ?? []).length}`);
        const rCastNg = await callAs(cast, s20CustB);
        check("段20-2 cast × 非担当客（指名B）= forbidden（customer_summary live 一致確認済みの挙動）",
          forbidden(rCastNg.error), rCastNg.error?.message ?? "通ってしまった");
        const rB1 = await callAs(mgrB1, s20CustA);
        check("段20-2 他 org（managerB1 × org A 客）= not found（存在オラクル封じ）",
          has(rB1.error, "not found"), rB1.error?.message ?? "通ってしまった");

        // ═══ 20-3: LIMIT 20 頭打ち・降順・最古が落ちる ═══
        const vs = (rOwner.data ?? []) as VisitRow[];
        const desc = vs.every((r, i) => i === 0 || new Date(vs[i - 1].visited_at).getTime() >= new Date(r.visited_at).getTime());
        check("段20-3 started_at 降順", desc, JSON.stringify(vs.map((r) => r.visited_at).slice(0, 3)));
        check("段20-3 先頭=最新（total=1001）・末尾=20件目（total=1020）",
          vs[0]?.total === 1001 && vs[19]?.total === 1020, JSON.stringify({ first: vs[0]?.total, last: vs[19]?.total }));
        check("段20-3 21件目（最古 total=1021）が LIMIT 20 で落ちる", !vs.some((r) => r.total === 1021),
          JSON.stringify(vs.map((r) => r.total)));

        // ═══ 20-4: 実データ照合（金額・指名 cast 名・卓名・void 不算入）═══
        check("段20-4 void 伝票（total=99999）不算入（closed のみ）", !vs.some((r) => r.total === 99_999),
          JSON.stringify(vs.map((r) => r.total)));
        const newest = vs[0];
        check("段20-4 nom_casts = 投入値一致（position 順・退店 cast 名が先頭に出る）",
          JSON.stringify(newest?.nom_casts) === JSON.stringify(["NOX-VERIFY-段20退店cast", FIXTURE_USERS.castA1a.name]),
          JSON.stringify(newest?.nom_casts));
        check("段20-4 卓名/status 一致（PERM卓・closed）", newest?.seat_name === "NOX-VERIFY-PERM卓" && newest?.status === "closed",
          JSON.stringify({ seat: newest?.seat_name, status: newest?.status }));
        check("段20-4 指名なし伝票の nom_casts = null", vs[1]?.nom_casts === null, JSON.stringify(vs[1]?.nom_casts));
      } finally {
        // 全消し（checks 子テーブル→checks→ダミー cast の順・段19 方式）
        await wipeSeat20Checks();
        if (s20DCast) await admin.from("casts").delete().eq("id", s20DCast);
      }
      // 掃除の物理確認（固定カウント非汚染の positive・custCastA の CRM 固定 2伝票は不接触）
      const { data: chkLeft20 } = await admin.from("checks").select("id").eq("seat_id", s20Seat);
      const { data: dLeft20 } = await admin.from("casts").select("id").like("name", "NOX-VERIFY-段20%");
      check("段20 掃除確認: PERM卓 checks/ダミー cast 0行（非汚染）",
        (chkLeft20 ?? []).length === 0 && (dLeft20 ?? []).length === 0,
        `chk=${(chkLeft20 ?? []).length}, cast=${(dLeft20 ?? []).length}`);
      for (const c of sessions.values()) await c.auth.signOut();
    }
  }

  // ── 段21: F3b-B（mig0029）席予約＝EXCLUDE 排他＋RPC 事前検証＋to_check 予約卓解決 ──
  //   fixture は段19 方式＝service/RPC 生成→try/finally 全消し（memberships 9行維持）。
  //   時間枠は now+30h 起点の相対構築（未来枠＝既存データと非干渉・境界は分演算で正確）。
  //   21-8（段19 既存13 assert の回帰）は同一 run 内で段19 が先に全 pass していること自体が実証。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

    // 準備（service）: 店・PERM卓・段21 専用卓（A1b=別卓通し用／A2=invalid store 用・finally で削除）
    const { data: s21Stores } = await admin.from("stores").select("id, name, org_id").in("name", [STORE_A1, STORE_A2]);
    const s21A1 = s21Stores?.find((s) => s.name === STORE_A1);
    const s21A2 = s21Stores?.find((s) => s.name === STORE_A2);
    let s21Seat = "";
    {
      const { data: sExist } = await admin.from("seats").select("id")
        .eq("store_id", s21A1!.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
      if (sExist?.length) s21Seat = sExist[0].id as string;
      else {
        const { data: sNew } = await admin.from("seats").insert({
          org_id: s21A1!.org_id, store_id: s21A1!.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
        }).select("id").single();
        s21Seat = sNew!.id as string;
      }
    }
    const s21WipeSeatChecks = async (seatId: string) => {
      const { data: cs } = await admin.from("checks").select("id").eq("seat_id", seatId);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (!ids.length) return;
      await admin.from("reservations").update({ check_id: null }).in("check_id", ids);
      for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
        await admin.from(t).delete().in("check_id", ids);
      }
      await admin.from("checks").delete().in("id", ids);
    };
    const s21WipeReservations = async () => {
      await admin.from("reservations").delete().in("store_id", [s21A1!.id, s21A2!.id]);
    };
    // 前回失敗遺物の掃除（再実行冪等）
    await s21WipeSeatChecks(s21Seat);
    await s21WipeReservations();
    await admin.from("seats").delete().like("name", "NOX-VERIFY-段21卓%");
    const { data: s21A1bRow } = await admin.from("seats").insert({
      org_id: s21A1!.org_id, store_id: s21A1!.id, name: "NOX-VERIFY-段21卓A1b", kind: "卓", sort_order: 998,
    }).select("id").single();
    const s21SeatA1b = s21A1bRow?.id as string;
    const { data: s21A2Row } = await admin.from("seats").insert({
      org_id: s21A2!.org_id, store_id: s21A2!.id, name: "NOX-VERIFY-段21卓A2", kind: "卓", sort_order: 999,
    }).select("id").single();
    const s21SeatA2 = s21A2Row?.id as string;
    check("段21（準備）店/PERM卓/専用卓2 の解決", !!s21A1 && !!s21A2 && !!s21Seat && !!s21SeatA1b && !!s21SeatA2);

    const mgr = await signInShared("段21", "managerA1");
    if (s21A1 && s21A2 && s21Seat && s21SeatA1b && s21SeatA2 && mgr) {
      // 時間枠: now+30h 起点・分オフセットで構築（[t(0), t(120)) 等・未来枠=既存 checks/予約と非干渉）
      const BASE = Date.now() + 30 * 3600_000;
      const t = (min: number) => new Date(BASE + min * 60_000).toISOString();
      const mkArgs = (label: string, startMin: number, seat: string | null, stayMin: number | null) => ({
        p_store_id: s21A1.id, p_reserved_at: t(startMin), p_guest_name: label,
        p_seat_id: seat, p_stay_minutes: stayMin,
      });
      try {
        // ═══ 席予約 create 正常（r1=[t0, t0+2h) PERM卓）═══
        const { data: r1, error: e1 } = await mgr.rpc("reservation_create", mkArgs("段21-r1", 0, s21Seat, 120));
        check("段21（準備）席予約 create 成功（seat+stay 120分）", !e1 && typeof r1 === "string", e1?.message);

        // ═══ 21-3a: create の事前検証（重複枠→'seat time conflict' が制約より先）═══
        const { error: e3a } = await mgr.rpc("reservation_create", mkArgs("段21-衝突", 60, s21Seat, 120));
        check("段21-3 create 重複枠 = seat time conflict（事前検証が 23P01 より先）",
          has(e3a, "seat time conflict"), e3a?.message ?? "通ってしまった");

        // ═══ 21-3b: update の事前検証（別枠の予約を重複枠へ移動）═══
        const { data: r2, error: e2 } = await mgr.rpc("reservation_create", mkArgs("段21-r2", 240, s21Seat, 120));
        check("段21（準備）後続枠 create 成功（[t0+4h, t0+6h)）", !e2 && typeof r2 === "string", e2?.message);
        const { error: e3b } = await mgr.rpc("reservation_update", {
          p_reservation_id: r2, p_reserved_at: t(60), p_customer_id: null, p_cast_id: null,
          p_guest_name: "段21-r2", p_party_size: null, p_nom_type: null, p_memo: null,
          p_seat_id: s21Seat, p_stay_minutes: 120,
        });
        check("段21-3 update 重複枠へ移動 = seat time conflict", has(e3b, "seat time conflict"), e3b?.message ?? "通ってしまった");

        // ═══ 21-1: EXCLUDE 実発火（RPC を迂回した service 直挿入＝制約が最終防衛）═══
        const { error: eX } = await admin.from("reservations").insert({
          org_id: s21A1.org_id, store_id: s21A1.id, guest_name: "段21-直挿入",
          reserved_at: t(30), seat_id: s21Seat, stay: `[${t(30)},${t(150)})`, status: "booked",
        });
        check("段21-1 EXCLUDE 実発火: 直挿入の重複 booked = 23P01 拒否",
          (eX as { code?: string } | null)?.code === "23P01" && has(eX, "reservations_seat_stay_excl"),
          eX ? `code=${(eX as { code?: string }).code} ${eX.message}` : "通ってしまった");

        // ═══ 21-2: cancelled 同枠 OK（WHERE 除外の実証）═══
        const { error: eCan } = await mgr.rpc("reservation_set_status", { p_reservation_id: r1, p_status: "cancelled" });
        const { data: r1b, error: e1b } = await mgr.rpc("reservation_create", mkArgs("段21-r1b", 0, s21Seat, 120));
        check("段21-2 cancelled 後の同卓同枠 = 再 booked 成功（WHERE 除外）",
          !eCan && !e1b && typeof r1b === "string", eCan?.message ?? e1b?.message);

        // ═══ 21-5: 隣接枠境界（[t0,2h)+[2h,4h)+[4h,6h) が3連で共存＝上端排他 [) の実証）═══
        const { data: r3, error: e5 } = await mgr.rpc("reservation_create", mkArgs("段21-r3", 120, s21Seat, 120));
        check("段21-5 隣接枠 [t0+2h, t0+4h) = 非重複で booked 可（前後と上端/下端が接する）",
          !e5 && typeof r3 === "string", e5?.message);

        // ═══ 21-4: seat_id null 非干渉（卓なし予約は同時刻に何件でも・排他に掛からない）═══
        const { data: n1, error: eN1 } = await mgr.rpc("reservation_create", mkArgs("段21-卓なし1", 0, null, null));
        const { data: n2, error: eN2 } = await mgr.rpc("reservation_create", mkArgs("段21-卓なし2", 0, null, null));
        check("段21-4 卓なし予約×2（同時刻）= EXCLUDE 非干渉で両方成功",
          !eN1 && !eN2 && !!n1 && !!n2, eN1?.message ?? eN2?.message);

        // ═══ 滞在時間ホワイトリスト（60/90/120/180 以外は bad stay・seat のみ/stay のみも bad stay）═══
        const { error: eW1 } = await mgr.rpc("reservation_create", mkArgs("段21-45分", 600, s21Seat, 45));
        check("段21 滞在 45分 = bad stay（ホワイトリスト外）", has(eW1, "bad stay"), eW1?.message ?? "通ってしまった");
        const { error: eW2 } = await mgr.rpc("reservation_create", mkArgs("段21-200分", 600, s21Seat, 200));
        check("段21 滞在 200分 = bad stay", has(eW2, "bad stay"), eW2?.message ?? "通ってしまった");
        const { error: eW3 } = await mgr.rpc("reservation_create", mkArgs("段21-片方のみ", 600, s21Seat, null));
        check("段21 seat のみ（stay なし）= bad stay（both-or-neither）", has(eW3, "bad stay"), eW3?.message ?? "通ってしまった");

        // ═══ update 自分除外（同値 update で seat time conflict が誤発火しない）═══
        const { error: eSelf } = await mgr.rpc("reservation_update", {
          p_reservation_id: r3, p_reserved_at: t(120), p_customer_id: null, p_cast_id: null,
          p_guest_name: "段21-r3", p_party_size: null, p_nom_type: null, p_memo: null,
          p_seat_id: s21Seat, p_stay_minutes: 120,
        });
        check("段21 update 自分除外: 同値 update が誤衝突しない（r.id <> 自分の実証）", !eSelf, eSelf?.message);

        // ═══ 21-7: ★【10】invalid store（A1 予約 × A2 卓・create/update 両方）═══
        const { error: e7c } = await mgr.rpc("reservation_create", mkArgs("段21-他店卓", 600, s21SeatA2, 120));
        check("段21-7 ★【10】create: A1 予約 × A2 卓 = invalid store", has(e7c, "invalid store"), e7c?.message ?? "通ってしまった");
        const { error: e7u } = await mgr.rpc("reservation_update", {
          p_reservation_id: r3, p_reserved_at: t(120), p_customer_id: null, p_cast_id: null,
          p_guest_name: "段21-r3", p_party_size: null, p_nom_type: null, p_memo: null,
          p_seat_id: s21SeatA2, p_stay_minutes: 120,
        });
        check("段21-7 ★【10】update: A2 卓へ変更 = invalid store", has(e7u, "invalid store"), e7u?.message ?? "通ってしまった");

        // ═══ 21-6: to_check の予約卓解決（p_seat_id null=予約卓）＋ stay と checks の独立 ═══
        const { data: chk3, error: eT3 } = await mgr.rpc("reservation_to_check", { p_reservation_id: r3, p_seat_id: null });
        check("段21-6 to_check（p_seat_id null）= 予約卓で開店成功（論点4 既定解決）", !eT3 && typeof chk3 === "string", eT3?.message);
        const { data: chk3Row } = await admin.from("checks")
          .select("seat_id, status, started_at").eq("id", chk3 as string).single();
        const startedBeforeStay = chk3Row ? new Date(chk3Row.started_at as string).getTime() < BASE + 120 * 60_000 : false;
        check("段21-6 物理確認: check は予約卓・open・started_at は stay 窓外（stay は重複判定専用＝checks の時間を制約しない）",
          chk3Row?.seat_id === s21Seat && chk3Row?.status === "open" && startedBeforeStay, JSON.stringify(chk3Row));

        // ═══ 確認(A): 予約卓が open で埋まる → seat occupied → 明示 p_seat_id で別卓に通す ═══
        const { error: eOcc } = await mgr.rpc("reservation_to_check", { p_reservation_id: r2, p_seat_id: null });
        check("段21 確認(A): 予約卓に open あり = seat occupied（発見1 が解決後の卓に効く）",
          has(eOcc, "seat occupied"), eOcc?.message ?? "通ってしまった");
        const { data: chk2, error: eOv } = await mgr.rpc("reservation_to_check", { p_reservation_id: r2, p_seat_id: s21SeatA1b });
        check("段21 確認(A): p_seat_id 明示で別卓に通す = 成功（実来店が勝つ）", !eOv && typeof chk2 === "string", eOv?.message);
        const { data: r2Row } = await admin.from("reservations").select("status, check_id").eq("id", r2 as string).single();
        const { data: chk2Row } = await admin.from("checks").select("seat_id").eq("id", chk2 as string).single();
        check("段21 確認(A) 物理確認: 実卓=A1b・予約は visited⇔check_id 1:1 維持",
          chk2Row?.seat_id === s21SeatA1b && r2Row?.status === "visited" && r2Row?.check_id === chk2,
          JSON.stringify({ seat: chk2Row?.seat_id, r2: r2Row }));
      } finally {
        // 全消し（checks 参照を外して checks → reservations → 専用卓・段19 方式）
        await s21WipeSeatChecks(s21Seat);
        await s21WipeSeatChecks(s21SeatA1b);
        await s21WipeSeatChecks(s21SeatA2);
        await s21WipeReservations();
        await admin.from("seats").delete().in("id", [s21SeatA1b, s21SeatA2]);
      }
      // 掃除の物理確認（rls 固定カウント非汚染の positive）
      const { data: resLeft21 } = await admin.from("reservations").select("id").in("store_id", [s21A1.id, s21A2.id]);
      const { data: seatLeft21 } = await admin.from("seats").select("id").like("name", "NOX-VERIFY-段21卓%");
      check("段21 掃除確認: reservations/専用卓 0行（非汚染）",
        (resLeft21 ?? []).length === 0 && (seatLeft21 ?? []).length === 0,
        `res=${(resLeft21 ?? []).length}, seat=${(seatLeft21 ?? []).length}`);
    }
  }

  // ── 段22: F3b-B-1 担当割当 UI 接続（mig なし）＝customer_assign_cast の runtime 権限マトリクス ──
  //   段15 の既存 assert（owner 成功/staff・cast forbidden/不在 cast=invalid cast）に対し、本段は
  //   UI 裁定の残余分岐を固定: manager 自店割当成功（段15 は null 解除のみ）・他店「実在 active」cast の
  //   invalid cast（段15 は randomUUID 不在＝exists 述語の store 条件を実在行で実証・UI 構造上選べない経路の
  //   二層目）・staff 拒否後の不変物理確認・null 解除の物理確認。
  //   fixture は段19 方式＝service 生成（専用客・他店ダミー cast）→try/finally 全消し＝rls 固定カウント非汚染。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    // 準備（service）: 店・fixture cast の解決＋前回失敗遺物の掃除（再実行冪等）＋専用客/他店ダミー cast 生成
    const { data: s22Stores } = await admin.from("stores").select("id, name, org_id").in("name", [STORE_A1, STORE_A2]);
    const s22A1 = s22Stores?.find((s) => s.name === STORE_A1);
    const s22A2 = s22Stores?.find((s) => s.name === STORE_A2);
    const { data: s22Casts } = await admin.from("casts").select("id, name")
      .eq("store_id", s22A1!.id).in("name", [FIXTURE_USERS.castA1a.name, FIXTURE_USERS.castA1b.name]);
    const s22CastA1a = s22Casts?.find((c) => c.name === FIXTURE_USERS.castA1a.name)?.id as string;
    const s22CastA1b = s22Casts?.find((c) => c.name === FIXTURE_USERS.castA1b.name)?.id as string;
    await admin.from("customers").delete().like("name", "NOX-VERIFY-段22%");
    await admin.from("casts").delete().like("name", "NOX-VERIFY-段22%");
    const { data: s22CustRow } = await admin.from("customers").insert({
      org_id: s22A1!.org_id, store_id: s22A1!.id, name: "NOX-VERIFY-段22-客",
    }).select("id").single();
    const s22Cust = s22CustRow?.id as string;
    const { data: s22DCastRow } = await admin.from("casts").insert({
      org_id: s22A2!.org_id, store_id: s22A2!.id, name: "NOX-VERIFY-段22他店cast", is_active: true,
    }).select("id").single();
    const s22CastA2 = s22DCastRow?.id as string;
    check("段22（準備）店/fixture cast/専用客/他店ダミー cast の解決",
      !!s22A1 && !!s22A2 && !!s22CastA1a && !!s22CastA1b && !!s22Cust && !!s22CastA2);

    const owner22 = await signInShared("段22", "ownerA");
    const mgr22 = await signInShared("段22", "managerA1");
    const crm22 = await signInShared("段22", "staffCrmOnA1");
    if (s22A1 && s22A2 && s22CastA1a && s22CastA1b && s22Cust && s22CastA2 && owner22 && mgr22 && crm22) {
      try {
        // 22-1 owner 割当成功（実 UPDATE 物理確認）
        const { error: e1 } = await owner22.rpc("customer_assign_cast", { p_id: s22Cust, p_cast_id: s22CastA1a });
        check("段22-1 owner 割当成功", !e1, e1?.message);
        const { data: r1 } = await admin.from("customers").select("cast_id").eq("id", s22Cust).single();
        check("段22-1 物理確認: cast_id=castA1a", r1?.cast_id === s22CastA1a, JSON.stringify(r1));

        // 22-2 manager 自店割当成功（UI の主経路・段15 は null 解除のみだった）
        const { error: e2 } = await mgr22.rpc("customer_assign_cast", { p_id: s22Cust, p_cast_id: s22CastA1b });
        check("段22-2 manager 自店割当成功（A1a→A1b 付け替え）", !e2, e2?.message);
        const { data: r2 } = await admin.from("customers").select("cast_id").eq("id", s22Cust).single();
        check("段22-2 物理確認: cast_id=castA1b", r2?.cast_id === s22CastA1b, JSON.stringify(r2));

        // 22-3 他店「実在 active」cast = invalid cast（UI は候補を自店 active に絞る＝選べない経路の二層目）
        const { error: e3 } = await mgr22.rpc("customer_assign_cast", { p_id: s22Cust, p_cast_id: s22CastA2 });
        check("段22-3 manager × 他店実在 cast = invalid cast", has(e3, "invalid cast"), e3?.message ?? "通ってしまった");

        // 22-4 staff（can_crm=true でも）拒否＝UI ボタン非表示の二層目
        const { error: e4 } = await crm22.rpc("customer_assign_cast", { p_id: s22Cust, p_cast_id: s22CastA1a });
        check("段22-4 staff(can_crm) 拒否 = forbidden", forbidden(e4), e4?.message ?? "通ってしまった");
        const { data: r4 } = await admin.from("customers").select("cast_id").eq("id", s22Cust).single();
        check("段22-4 物理確認: 拒否後も cast_id=castA1b 不変", r4?.cast_id === s22CastA1b, JSON.stringify(r4));

        // 22-5 null 解除（UI「フリー（担当解除）」経路）
        const { error: e5 } = await mgr22.rpc("customer_assign_cast", { p_id: s22Cust, p_cast_id: null });
        check("段22-5 manager null 解除成功", !e5, e5?.message);
        const { data: r5 } = await admin.from("customers").select("cast_id").eq("id", s22Cust).single();
        check("段22-5 物理確認: cast_id=null（フリー）", r5?.cast_id === null, JSON.stringify(r5));
      } finally {
        await admin.from("customers").delete().like("name", "NOX-VERIFY-段22%");
        await admin.from("casts").delete().like("name", "NOX-VERIFY-段22%");
      }
      // 掃除の物理確認（rls 固定カウント非汚染の positive）
      const { data: custLeft22 } = await admin.from("customers").select("id").like("name", "NOX-VERIFY-段22%");
      const { data: castLeft22 } = await admin.from("casts").select("id").like("name", "NOX-VERIFY-段22%");
      check("段22 掃除確認: 専用客/他店ダミー cast 0行（非汚染）",
        (custLeft22 ?? []).length === 0 && (castLeft22 ?? []).length === 0,
        `cust=${(custLeft22 ?? []).length}, cast=${(castLeft22 ?? []).length}`);
    }
  }

  // ── 段23: B-3（mig0030）customer_list_summary p_include_dormant の実効挙動（real signIn 実測）──
  //   段15 は省略時の従来挙動（active のみ・休眠除外ゴールデン 4/3/1/3）を既にカバー＝本段は新分岐のみ:
  //   owner/manager の休眠込み（店スコープ維持）・★cast は true でも休眠が返らない（prosrc の
  //   v_role<>'cast' を real session で実測＝二層目）・false 明示=従来件数・staff(can_crm) は
  //   owner/manager と同扱いで休眠込み（裁定どおり）。
  //   fixture＝段19 方式: service 生成の休眠客3（A1 担当付き/A1 フリー/A2）→try/finally 全消し。
  //   seed 常設の custDormant（A1・castA1a 担当・is_active=false）はカウントに含めて検証し、触らない。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 準備（service）: 店・castA1a 解決＋前回失敗遺物の掃除（再実行冪等）＋休眠客3件生成
    const { data: s23Stores } = await admin.from("stores").select("id, name, org_id").in("name", [STORE_A1, STORE_A2]);
    const s23A1 = s23Stores?.find((s) => s.name === STORE_A1);
    const s23A2 = s23Stores?.find((s) => s.name === STORE_A2);
    const { data: s23CastRows } = await admin.from("casts").select("id")
      .eq("store_id", s23A1!.id).eq("name", FIXTURE_USERS.castA1a.name);
    const s23CastA1a = s23CastRows?.[0]?.id as string;
    await admin.from("customers").delete().like("name", "NOX-VERIFY-段23%");
    const { data: s23Ins, error: e23Ins } = await admin.from("customers").insert([
      // D1: castA1a 担当付き休眠（★cast 二層目テスト用＝担当 cast で叩いても返らないこと）
      { org_id: s23A1!.org_id, store_id: s23A1!.id, name: "NOX-VERIFY-段23-休眠A1担当", cast_id: s23CastA1a, is_active: false },
      // D2: フリー休眠（A1）
      { org_id: s23A1!.org_id, store_id: s23A1!.id, name: "NOX-VERIFY-段23-休眠A1フリー", is_active: false },
      // D3: 他店休眠（A2）＝manager の店スコープ維持テスト用
      { org_id: s23A2!.org_id, store_id: s23A2!.id, name: "NOX-VERIFY-段23-休眠A2", is_active: false },
    ]).select("id, name");
    check("段23（準備）店/castA1a/休眠客3件の生成", !e23Ins && !!s23A1 && !!s23A2 && !!s23CastA1a && (s23Ins ?? []).length === 3,
      e23Ins?.message ?? `ins=${(s23Ins ?? []).length}`);

    const owner23 = await signInShared("段23", "ownerA");
    const mgr23 = await signInShared("段23", "managerA1");
    const crm23 = await signInShared("段23", "staffCrmOnA1");
    const cast23 = await signInShared("段23", "castA1a");
    if (s23A1 && s23A2 && s23CastA1a && (s23Ins ?? []).length === 3 && owner23 && mgr23 && crm23 && cast23) {
      type Row23 = { customer_id: string; name: string; is_active: boolean };
      const names = (rows: unknown) => ((rows ?? []) as Row23[]).map((r) => r.name);
      // 期待件数の基準（段15 ゴールデン）: active = owner 4（org A 全店）/ manager・staff 自店3 / cast 担当1。
      // 休眠 = seed 常設 custDormant（A1）＋本段生成 D1・D2（A1）・D3（A2）＝A1 に3・A2 に1・org A 計4。
      try {
        // 23-1 owner true = active 4 + 休眠4（org 全店・休眠込み）
        const { data: o1, error: eO1 } = await owner23.rpc("customer_list_summary", { p_include_dormant: true });
        check("段23-1 owner include=true = 8行（active 4 + 休眠4）", !eO1 && names(o1).length === 8,
          eO1?.message ?? `got ${names(o1).length}: ${names(o1).join(",")}`);
        const o1n = names(o1);
        check("段23-1 休眠4件の名前含有（custDormant + 段23 生成3件）",
          [FIXTURE_CUSTOMERS.custDormant.name, "NOX-VERIFY-段23-休眠A1担当", "NOX-VERIFY-段23-休眠A1フリー", "NOX-VERIFY-段23-休眠A2"]
            .every((n) => o1n.includes(n)), o1n.join(","));

        // 23-2 manager true = 自店 A1 のみ休眠込み（active 3 + A1 休眠3・他店休眠 D3 は返らない）
        const { data: m1, error: eM1 } = await mgr23.rpc("customer_list_summary", { p_include_dormant: true });
        check("段23-2 manager include=true = 6行（自店 active 3 + 自店休眠3）", !eM1 && names(m1).length === 6,
          eM1?.message ?? `got ${names(m1).length}: ${names(m1).join(",")}`);
        check("段23-2 他店休眠（A2）は返らない（店スコープ維持）", !names(m1).includes("NOX-VERIFY-段23-休眠A2"), names(m1).join(","));

        // 23-3 ★cast true = 休眠が返らない（担当付き休眠 D1・custDormant とも castA1a 担当なのに不可視＝二層目）
        const { data: c1, error: eC1 } = await cast23.rpc("customer_list_summary", { p_include_dormant: true });
        check("段23-3 cast include=true = 担当 active 1行のみ（省略時と同件数）",
          !eC1 && names(c1).length === 1 && names(c1)[0] === FIXTURE_CUSTOMERS.custCastA.name,
          eC1?.message ?? names(c1).join(","));
        check("段23-3 ★担当付き休眠（D1/custDormant）が cast に返らない（v_role<>'cast' の実測）",
          !names(c1).includes("NOX-VERIFY-段23-休眠A1担当") && !names(c1).includes(FIXTURE_CUSTOMERS.custDormant.name),
          names(c1).join(","));

        // 23-4 false 明示 = 従来件数（段15 ゴールデン一致・既定値と同挙動）
        const { data: o0, error: eO0 } = await owner23.rpc("customer_list_summary", { p_include_dormant: false });
        check("段23-4 owner include=false 明示 = 4行（段15 ゴールデン一致）", !eO0 && names(o0).length === 4,
          eO0?.message ?? `got ${names(o0).length}`);
        const { data: m0, error: eM0 } = await mgr23.rpc("customer_list_summary", { p_include_dormant: false });
        check("段23-4 manager include=false 明示 = 自店3行", !eM0 && names(m0).length === 3,
          eM0?.message ?? `got ${names(m0).length}`);

        // 23-5 staff(can_crm) true = 休眠込み（cast と違い owner/manager 同扱い＝裁定どおり）
        const { data: s1, error: eS1 } = await crm23.rpc("customer_list_summary", { p_include_dormant: true });
        check("段23-5 staff(can_crm) include=true = 6行（自店 active 3 + 休眠3）", !eS1 && names(s1).length === 6,
          eS1?.message ?? `got ${names(s1).length}: ${names(s1).join(",")}`);
        const s1Dormant = ((s1 ?? []) as Row23[]).find((r) => r.name === FIXTURE_CUSTOMERS.custDormant.name);
        check("段23-5 休眠行の is_active=false フラグ返却（UI トグル表示の根拠）", s1Dormant?.is_active === false,
          JSON.stringify(s1Dormant));
      } finally {
        await admin.from("customers").delete().like("name", "NOX-VERIFY-段23%");
      }
      // 掃除の物理確認（rls 固定カウント非汚染の positive・seed 常設 custDormant は残っていること）
      const { data: custLeft23 } = await admin.from("customers").select("id").like("name", "NOX-VERIFY-段23%");
      const { data: dormantKept } = await admin.from("customers").select("id").eq("name", FIXTURE_CUSTOMERS.custDormant.name);
      check("段23 掃除確認: 段23 生成客 0行＋seed 常設 custDormant 残存（非汚染）",
        (custLeft23 ?? []).length === 0 && (dormantKept ?? []).length === 1,
        `left=${(custLeft23 ?? []).length}, dormant=${(dormantKept ?? []).length}`);
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
