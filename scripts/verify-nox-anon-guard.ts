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
 * 段16（0024→0038 適用後）: F3a 束3-1 set_staff_perms の実効ゲート（runtime 実測・mig0038 で5引数化）。
 *       owner=自 org staff 成功（実 UPDATE 物理確認・任意組合せ）/ manager=自店成功・他店 forbidden /
 *       staff（can_register/can_crm 問わず）・cast=自他とも forbidden（権限昇格封じ）。
 *       規約7=4フラグ（can_register/can_crm/can_shift/can_view_backs）いずれか null で bad flag。
 *       対象 role<>'staff' は not a staff。
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
 * 段30（0038 適用後）: バック可視是正（check_cast_backs の staff 可視を can_register→can_view_backs 分離）の
 *       物理確認。専用卓で cast 指名＋drink 明細の伝票を close し check_cast_backs 行を生成→可視マトリクス:
 *       ★can_register=true/can_view_backs=false staff = 0行（分離の核心）／owner set_staff_perms（5引数）で
 *       can_view_backs=true 付与→同一セッションで可視（≥1・実反映）→復元で 0行／両 false staff=0行／
 *       owner=org 全店可視／manager=自店可視／managerB1=他 org 0行／cast 本人=自己行のみ（③ cast 枝不変）／
 *       anon=BLOCKED。生成伝票・専用卓は try/finally 全消し＋残0＝verify:nox-rls 固定カウント非汚染。
 * 段31（0039 適用後）: キャスト会計 — cast にレジ会計を開く 2段ゲート（store settings.cast_register_enabled
 *       ∧ membership.can_register）の実効マトリクス。段18 の実 auth 動的生成で一時 cast 一式（seed 常設せず
 *       ＝rls 固定カウント非汚染）。a. 店OFF×castON=A群6表＋seats 0行・casts 自己1行・会計RPC forbidden／
 *       b. 店ON×castOFF=同上（既存 castA1a 据置でも店 ON 下 0行＝反転ゼロ実証）／c. 店ON×castON=checks/seats
 *       可視・casts 全同僚可視・check_open→add_line→pay→close 実走（23502 回帰）／d. ★mig0038 整合＝有効 cast
 *       でも check_cast_backs 自己行のみ（会計は開くがバック分離）／set_store_cast_register=owner 限定/null 拒否／
 *       set_cast_register=cast 限定 not a cast/他 org not found/null 拒否/owner・manager 正常系（audit）。
 *       finally=一時 cast 一式＋伝票＋実 auth 全消し・store settings_json 厳密復元。anon は段31a で 3関数 BLOCKED。
 * 段32（0040 適用後）: F3d 体入採用（trials＋RPC5本＋内部 cast_create_apply）。trials は owner/manager 限定
 *       の新形 RLS（staff/cast 0行）。a. trial_register 認可（owner/manager 自店成功・他店/staff/cast forbidden・
 *       ★満18歳未満 under 18・bad birthday）／b. 可視（owner/manager のみ）／c. trial_update 部分更新
 *       （rating/documents/memo/tier・bad rating/bad documents［未知キー・非boolean］・not trial）／
 *       d. ★本採用（書類不備 documents incomplete→全書類で casts＋cast_sensitive 実生成・kind←tier・user_id null・
 *       cast_id 焼付け・status=hired・★audit PII マスク＝real_name/birthday が audit に無い・cast_create_sensitive
 *       は fields_changed のみ）／e. 見送り（rejected・行残置＝台帳#35）／f. 他 org not found／
 *       g. cast_create 直接登録（casts+cast_sensitive・under 18・認可）。★trial_hire/cast_create の生成物は
 *       段31 方式で全消し（trials→cast_sensitive→casts の依存順・name prefix backstop）＝casts 固定カウント
 *       反転ゼロ。anon は段32a で公開5本 BLOCKED・cast_create_apply は段5b で anon/authenticated 両 BLOCKED。
 * 段33（0041 適用後）: castログイン招待（cast_invite＝users＋membership[role='cast']＋casts.user_id 結線）。
 *       段18 実 auth 動的生成＝createUser→owner cast_invite→物理確認（users 生成・membership role=cast/
 *       store=cast.store_id 導出＝store 整合・casts.user_id 結線・audit）→signInWithPassword→
 *       ★auth_role='cast'（memberships 土台）・auth_cast_id=対象 cast（casts.user_id 土台）・
 *       check_cast_backs 0行＝自己行のみ（golden 他 cast 不可視・/mine 相当 RLS 実測）。負系＝
 *       already linked（再招待）/already active elsewhere（既存 active membership 持ち）/bad target
 *       （staff 人材 email への cast 結線封じ）/not found（他 org）/forbidden（他店 manager・staff・cast）。
 *       finally=casts（name prefix）→memberships→users→auth deleteUser の順で全消し＝固定カウント反転ゼロ。
 *       anon は段33a で BLOCKED。
 * 段34（0042 適用後）: ノルマ拡張（cast_norms 4軸化＝sales_target/shimei_target 追加・表示のみ＝payOf 非接続）
 *       ＋店設定 setter 2本（set_store_norm_config／set_store_okuri_base・owner 限定）。
 *       a. manager set_cast_norm 6引数 正系（uuid 返却・4軸充填・行生成・audit）＝段内動的 period（2031-12）で
 *       固定 fixture（2026-07＝rls ⑥）と衝突回避／b. cast 自行 SELECT で新列可視（パターン1）＋ cast setter
 *       3本 forbidden／c. owner set_store_norm_config／set_store_okuri_base 正系（settings_json 4キー反映＝
 *       sales_norm_enabled/shimei_norm_enabled/shimei_norm_scope/okuri_base_amount）／d. manager 店設定 setter
 *       forbidden（owner 限定＝段31-f 型）・null/不正値拒否（bad sales_enabled/bad shimei_scope/bad amount/
 *       bad sales_target/bad shimei_target）。finally=cast_norms 一時行削除＋store settings_json 厳密復元
 *       ＝固定カウント反転ゼロ。anon は set_cast_norm 6引数＝段8a（probe 更新）・店設定2本＝段34a で BLOCKED。
 * 段35（0043 適用後）: F4a キオスク打刻（kiosk_devices 方式＝users/memberships 非作成）。
 *       核心＝★遮断マトリクス: kiosk セッションは auth_org_id() null → 既存 RLS 7表 0行・deny-all 2表
 *       permission denied・既存 RPC 代表3本（punch_self/get_cast_sales/set_cast_norm）forbidden 系拒否
 *       ＝構成証明の実測。b. kiosk_cast_list＝kiosk 自店 active のみ（他店/inactive 不可視・has_pin 正値）
 *       ／owner・cast から呼ぶと 0行（fail-closed）。c. set_cast_pin＝owner/manager 自店 正系（upsert）・
 *       manager 他店/cast forbidden・bad pin/inactive cast 拒否・★audit に PIN/ハッシュ非含有。
 *       d. kiosk_punch 状態遷移＝正PIN ok（punches 実INSERT・source='kiosk'・NOT NULL 充足）→誤PIN×4
 *       wrong_pin（fail_count 実値）→5回目 locked（locked_until）→ロック中は正PINも locked→admin で
 *       locked_until 過去化→正PIN ok＋カウンタ復元。bad_pin（形式不正）は fail_count 非増加・
 *       not_found（他店）・no_pin。audit は actor null の直接 INSERT（audit_log_write 非経由）を実測。
 *       e. provision 負系＝bad target（実在人物 uid）/already provisioned（1店1台）/manager forbidden・
 *       deactivate 後は kiosk_cast_list 0行＋kiosk_punch forbidden（is_active 失効）。
 *       finally=kiosk punches→cast_pin→kiosk_devices→一時 casts→auth deleteUser の依存順全消し
 *       ＝固定カウント反転ゼロ（audit_logs は append-only のため残置＝従来どおり）。anon は段35a で 7署名 BLOCKED。
 * 段36（0044/0045 適用後）: F4b レシート印刷（printer_config 隔離＋print_jobs キュー＝両 deny-all）。
 *       段内で closed/open 伝票を admin 直 INSERT（check_open 系 RPC 非経由＝固定カウント制御）。
 *       a. printer disabled（config 無し/enabled=false）で enqueue 拒否／b. set_printer_config 正系＋
 *       get_printer_config（has_token=false→rotate 後 true・★token 値は get 返却に非含有・24hex 形式）／
 *       c. owner 限定負系（manager set/rotate/get forbidden・null enabled 拒否）／d. enqueue 失敗系
 *       （open 伝票=not closed・不在 pay_group=bad pay_group・cast[can_register off]=forbidden＝4枝実測）／
 *       e. ★状態遷移: enqueue→queued（行検証 NOT NULL/print_token 24hex/created_by）→二度押し
 *       already_queued:true（同 job_id）→result(queued)=bad_state→claim=printing（claimed_at）→
 *       result(success)=printed（printed_at）→再 result=idempotent:true→再 enqueue=is_reprint:true／
 *       f. serial: 設定後の claim 不一致=serial_mismatch・一致で printing・token は set_printer_config で不変／
 *       g. claim 偽 token（24hex）=unknown_token・形式不正=bad token raise・queued 空=found:false／
 *       h. ★claim/result は authenticated（owner）から permission denied（service_role 限定の実測）／
 *       i. set_store_receipt_profile: owner 正系（settings_json 4キー）・manager forbidden・
 *       T+14桁=bad reg_no・空 reg_no 可／j. pay_group 'B' の enqueue は is_reprint:false（(check,group) 単位）。
 *       finally=print_jobs→check_lines→checks→printer_config 行削除＋settings_json 厳密復元＝反転ゼロ。
 *       anon は段36a で 7署名 BLOCKED（claim/result は service_role 限定＝anon にも grant なし）。
 * 正常系対照: authenticated では auth_role() が実行可能で正しいロールを返す
 *       （プローブ手法が BLOCKED と EXECUTABLE を区別できている裏取り）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { FIXTURE_USERS, FIXTURE_CUSTOMERS, STORE_A1, STORE_A2, STORE_B1, loadEnvOrExit, type FixtureUserKey } from "./fixtures-f0";
// 段29-0047d 専用: collect の void フィルタを実関数で実測する（クエリを写経すると乖離を検知できないため本物を通す）
import { resolvePayrollWindow } from "../lib/nox/payroll/window";
import { collectPeriod } from "../lib/nox/payroll/collect";

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
    ["check_pay", { p_check_id: null, p_method: null, p_amount: null, p_pay_group: null, p_tendered: null, p_idem_key: null, p_method_detail: null }], // mig0046 で 7引数へ置換（旧6引数版 drop 済）
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
    ["get_store_nom_counts", { p_store_id: null, p_from: null, p_to: null }], // A4 月報（mig0054・店合計 指名件数 読取）
  ];
  for (const [fn, args] of F1E_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段8a: F2a 報酬マスタ RPC 6本 anon BLOCKED ──
  const F2A_RPC_PROBES: Array<[string, Record<string, unknown>]> = [
    ["set_comp_plan", { p_id: null, p_store_id: null, p_name: null, p_base: null, p_hon_back: null, p_jonai_back: null, p_dohan_back: null, p_sales_slide: null, p_point_slide: null, p_is_active: null }],
    ["set_cast_plan", { p_cast_id: null, p_plan_id: null, p_overrides: null }],
    ["set_cast_norm", { p_cast_id: null, p_period: null, p_days_target: null, p_dohan_target: null, p_sales_target: null, p_shimei_target: null }], // mig0042 で 6引数へ置換（4引数版 drop 済）
    ["set_deduction", { p_id: null, p_store_id: null, p_name: null, p_amount: null, p_per: null, p_is_active: null }],
    ["set_penalty_config", { p_store_id: null, p_fine_absent: null, p_fine_late: null, p_hours_per_shift: null, p_norm_on: null, p_norm_days_flat: null, p_norm_days_per: null, p_norm_dohan_flat: null, p_norm_dohan_per: null, p_late_grace_min: null, p_early_grace_min: null, p_over_grace_min: null }],
    ["set_custom_back_def", { p_id: null, p_store_id: null, p_name: null, p_basis: null, p_value: null, p_cond: null, p_is_active: null }],
  ];
  for (const [fn, args] of F2A_RPC_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段9-E1: set_store_pricing（mig0051・料金7列の唯一の書き手）anon BLOCKED ──
  {
    const { error } = await anon.rpc("set_store_pricing", {
      p_store_id: null, p_hon_fee: null, p_jonai_fee: null, p_dohan_fee: null,
      p_service_rate: null, p_card_tax_rate: null, p_round_unit: null, p_round_mode: null,
    });
    check("anon set_store_pricing BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段9-B4: 時間料金 新 RPC 2本（mig0052）anon BLOCKED ──
  {
    const { error: e1 } = await anon.rpc("set_store_time_pricing", {
      p_store_id: null, p_set_min: null, p_set_fee: null, p_ext_min: null,
      p_ext_fee: null, p_time_mode: null, p_time_per: null,
    });
    check("anon set_store_time_pricing BLOCKED", isFnBlocked(e1), e1?.message ?? "実行できてしまった");
    const { error: e2 } = await anon.rpc("check_time_charge_apply", { p_check_id: null });
    check("anon check_time_charge_apply BLOCKED", isFnBlocked(e2), e2?.message ?? "実行できてしまった");
  }

  // ── 段9-B1B2: 相席・席移動 新 RPC 3本（mig0053）anon BLOCKED ──
  {
    const { error: e1 } = await anon.rpc("check_move_seat", { p_check_id: null, p_to_seat_id: null });
    check("anon check_move_seat BLOCKED", isFnBlocked(e1), e1?.message ?? "実行できてしまった");
    const { error: e2 } = await anon.rpc("check_add_seat", { p_check_id: null, p_seat_id: null });
    check("anon check_add_seat BLOCKED", isFnBlocked(e2), e2?.message ?? "実行できてしまった");
    const { error: e3 } = await anon.rpc("check_remove_seat", { p_check_id: null, p_seat_id: null });
    check("anon check_remove_seat BLOCKED", isFnBlocked(e3), e3?.message ?? "実行できてしまった");
  }

  // ── 段9-B6: 売掛回収 新 RPC 2本（mig0055）anon BLOCKED ──
  //   consent_ok/ar_policy_ok（内部専用・4ロール revoke）の ACL は grants G29 が担保＝ここは公開2本のみ。
  {
    const { error: e1 } = await anon.rpc("receivable_collect", { p_receivable_id: null, p_biz_date: null, p_method: null, p_note: null, p_idem_key: null });
    check("anon receivable_collect BLOCKED", isFnBlocked(e1), e1?.message ?? "実行できてしまった");
    const { error: e2 } = await anon.rpc("receivable_mark_deduct", { p_receivable_id: null, p_consent: null, p_note: null });
    check("anon receivable_mark_deduct BLOCKED", isFnBlocked(e2), e2?.message ?? "実行できてしまった");
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
    ["set_staff_perms", { p_membership_id: null, p_can_register: null, p_can_crm: null, p_can_shift: null, p_can_view_backs: null }], // 段16a（mig0024→0038 5引数）
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

  // ── 段31a: キャスト会計（mig0039）ヘルパー＋書込 RPC 2本 anon BLOCKED ──
  const F0039_PROBES: Array<[string, Record<string, unknown>]> = [
    ["auth_cast_can_register", {}],
    ["set_store_cast_register", { p_store_id: null, p_enabled: null }],
    ["set_cast_register", { p_membership_id: null, p_can_register: null }],
  ];
  for (const [fn, args] of F0039_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段32a: F3d 体入採用（mig0040）公開 RPC 5本 anon BLOCKED ──
  const F0040_PROBES: Array<[string, Record<string, unknown>]> = [
    ["trial_register", { p_store_id: null, p_name: null, p_birthday: null }],
    ["trial_update", { p_trial_id: null }],
    ["trial_hire", { p_trial_id: null }],
    ["trial_reject", { p_trial_id: null }],
    ["cast_create", { p_store_id: null, p_name: null, p_birthday: null }],
  ];
  for (const [fn, args] of F0040_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段33a: castログイン招待（mig0041）cast_invite anon BLOCKED ──
  {
    const { error } = await anon.rpc("cast_invite", { p_auth_user_id: null, p_email: null, p_cast_id: null });
    check("anon cast_invite BLOCKED", isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段34a: ノルマ拡張＋送りベース（mig0042）店設定 setter 2本 anon BLOCKED ──
  //   set_cast_norm 6引数版の anon BLOCKED は段8a（probe を 6引数へ更新済み）。
  const F0042_PROBES: Array<[string, Record<string, unknown>]> = [
    ["set_store_norm_config", { p_store_id: null, p_sales_enabled: null, p_shimei_enabled: null, p_shimei_scope: null }],
    ["set_store_okuri_base", { p_store_id: null, p_amount: null }],
  ];
  for (const [fn, args] of F0042_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段35a: F4a キオスク打刻（mig0043）kiosk 系 RPC 全署名 anon BLOCKED ──
  const F0043_PROBES: Array<[string, Record<string, unknown>]> = [
    ["auth_kiosk_store_id", {}],
    ["auth_kiosk_org_id", {}],
    ["kiosk_provision", { p_auth_user_id: null, p_store_id: null, p_label: null }],
    ["kiosk_deactivate", { p_device_id: null }],
    ["set_cast_pin", { p_cast_id: null, p_pin: null }],
    ["kiosk_punch", { p_cast_id: null, p_pin: null, p_type: null }],
    ["kiosk_cast_list", {}],
  ];
  for (const [fn, args] of F0043_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段36a: F4b レシート印刷（mig0044/0045）RPC anon BLOCKED ──
  //   claim/result は service_role 限定（内部専用型）＝anon に加え authenticated 負系を段36 本体で実測。
  const F0044_PROBES: Array<[string, Record<string, unknown>]> = [
    ["set_printer_config", { p_store_id: null, p_enabled: null, p_serial: null }],
    ["rotate_store_token", { p_store_id: null }],
    ["get_printer_config", { p_store_id: null }],
    ["set_store_receipt_profile", { p_store_id: null, p_address: null, p_tel: null, p_reg_no: null, p_footer: null }],
    ["print_enqueue", { p_check_id: null, p_pay_group: null }],
    ["print_claim", { p_store_token: null, p_serial: null }], // service_role 限定
    ["print_result", { p_store_token: null, p_print_token: null, p_success: null, p_error_code: null }], // service_role 限定
  ];
  for (const [fn, args] of F0044_PROBES) {
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
    ["cast_create_apply", { p_org_id: null, p_store_id: null, p_name: null, p_kind: null, p_real_name: null, p_birthday: null }], // 段32（F3d 内部）
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
    "trials", // F3d 体入採用（mig0040・PK=id＝既定の id 列でよい）
    "kiosk_devices", "cast_pin", // F4a キオスク（mig0043・deny-all＝authenticated ですら SELECT 不可）
    "printer_config", "print_jobs", // F4b レシート印刷（mig0044/0045・deny-all）
    "product_costs", // 台帳#40（mig0049/0050・原価分離）
    "ar_collections", // B6 売掛回収消込台帳（mig0055・authenticated=SELECT のみ・anon DENIED）
  ]) {
    // PK=cast_id/store_id/product_id のテーブルは id 列なし。存在しない列だと権限エラーの前に列エラーになるため列名を合わせる。
    const pkCastId = ["cast_plan", "cast_sensitive", "cast_tax_profiles", "cast_pin"].includes(table);
    const pkStoreId = table === "printer_config";
    const pkProductId = table === "product_costs";
    const { error } = await anon.from(table)
      .select(pkCastId ? "cast_id" : pkStoreId ? "store_id" : pkProductId ? "product_id" : "id").limit(1);
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
      // ★F4c（mig0046）: method_detail の負系を先に通す（bad detail は INSERT 前に raise＝残額を消費しない）。
      const { error: eD51 } = await on.rpc("check_pay", {
        p_check_id: chkId, p_method: "card", p_amount: 11_000, p_pay_group: "A", p_idem_key: randomUUID(),
        p_method_detail: "x".repeat(51),
      });
      check("段14 F4c check_pay 51字 detail = bad detail", !!eD51?.message?.includes("bad detail"), eD51?.message ?? "通ってしまった");
      // 6引数呼び（p_method_detail 省略）＝後方互換の実測。default null が効き 1,000 円だけ充当する。
      const { data: payCompat, error: ePayCompat } = await on.rpc("check_pay", {
        p_check_id: chkId, p_method: "cash", p_amount: 1_000, p_pay_group: "A", p_tendered: 1_000, p_idem_key: randomUUID(),
      });
      check("段14 F4c 6引数呼び（detail 省略）成功＝後方互換", !ePayCompat && typeof payCompat === "string", ePayCompat?.message);
      {
        const { data: pr } = await admin.from("payments").select("method_detail").eq("id", payCompat as string).single();
        check("段14 F4c 6引数呼びは method_detail = null", pr?.method_detail === null, JSON.stringify(pr));
      }
      // 空白のみ detail → null 格納（nullif(trim(...)) の実測）
      const { data: payBlank, error: ePayBlank } = await on.rpc("check_pay", {
        p_check_id: chkId, p_method: "other", p_amount: 1_000, p_pay_group: "A", p_idem_key: randomUUID(),
        p_method_detail: "   ",
      });
      check("段14 F4c 空白のみ detail 成功", !ePayBlank && typeof payBlank === "string", ePayBlank?.message);
      {
        const { data: pr } = await admin.from("payments").select("method_detail").eq("id", payBlank as string).single();
        check("段14 F4c 空白のみ detail = null 格納", pr?.method_detail === null, JSON.stringify(pr));
      }
      // detail あり → 格納＋audit の after_json に載る（to_jsonb(p) 経路＝列追加が自動で乗る）。
      // 残額を使い切る 9,000（1,000+1,000+9,000=11,000）＝close 前提は不変。既存ラベルはこの実呼びが担う。
      const { data: payDetail, error: ePay } = await on.rpc("check_pay", {
        p_check_id: chkId, p_method: "other", p_amount: 9_000, p_pay_group: "A", p_idem_key: randomUUID(),
        p_method_detail: "PayPay",
      });
      check("段14 can_register=true staff check_pay 成功（実 INSERT）", !ePay && typeof payDetail === "string", ePay?.message);
      {
        const { data: pr } = await admin.from("payments").select("method, method_detail").eq("id", payDetail as string).single();
        check("段14 F4c method_detail 格納（other/PayPay）",
          pr?.method === "other" && pr?.method_detail === "PayPay", JSON.stringify(pr));
        const { data: aud } = await admin.from("audit_logs").select("after_json")
          .eq("action", "check_pay").eq("target", `payments:${payDetail}`).limit(1);
        const after = (aud ?? [])[0]?.after_json as Record<string, unknown> | undefined;
        check("段14 F4c audit の after_json に method_detail が含まれる",
          (aud ?? []).length === 1 && after?.method_detail === "PayPay", JSON.stringify(aud));
      }
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
    type MemRow = { id: string; store_id: string; role: string; can_register: boolean; can_crm: boolean; can_shift: boolean; can_view_backs: boolean };
    const memOf = async (key: FixtureUserKey): Promise<MemRow | null> => {
      const { data: u } = await admin.from("users").select("id").eq("email", FIXTURE_USERS[key].email).single();
      if (!u) return null;
      const { data: mm } = await admin.from("memberships")
        .select("id, store_id, role, can_register, can_crm, can_shift, can_view_backs").eq("user_id", u.id).limit(1);
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
          p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: false, p_can_shift: true, p_can_view_backs: false,
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
          p_membership_id: memRegOff.id, p_can_register: true, p_can_crm: true, p_can_shift: true, p_can_view_backs: false,
        });
        check("段16 manager 自店 staff 成功（全 true）", !e2, e2?.message);
        const { data: m2 } = await admin.from("memberships")
          .select("can_register, can_crm, can_shift").eq("id", memRegOff.id).single();
        check("段16 実 UPDATE 物理確認: (true,true,true)",
          m2?.can_register === true && m2?.can_crm === true && m2?.can_shift === true, JSON.stringify(m2));
        const { error: e3 } = await mgr.rpc("set_staff_perms", {
          p_membership_id: memA2!.id, p_can_register: true, p_can_crm: false, p_can_shift: false, p_can_view_backs: false,
        });
        check("段16 manager 他店 A2 staff forbidden（店スコープ）", forbidden(e3), e3?.message ?? "通ってしまった");
        // owner は org 内他店 A2 staff も変更可（org 全店スコープの positive）
        const { error: e4 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memA2!.id, p_can_register: true, p_can_crm: false, p_can_shift: false, p_can_view_backs: false,
        });
        check("段16 owner 他店 A2 staff 成功（org 全店）", !e4, e4?.message);

        // ③ staff/cast 呼び出し＝forbidden（権限昇格封じ・自分にも他人にも）
        const { error: e5 } = await staffOn.rpc("set_staff_perms", {
          p_membership_id: memRegOn.id, p_can_register: true, p_can_crm: true, p_can_shift: true, p_can_view_backs: false,
        });
        check("段16 staff(can_register=true) 自分に forbidden（昇格封じ）", forbidden(e5), e5?.message ?? "通ってしまった");
        const { error: e6 } = await staffCrm.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: true, p_can_crm: true, p_can_shift: true, p_can_view_backs: false,
        });
        check("段16 staff(can_crm=true) 他人に forbidden", forbidden(e6), e6?.message ?? "通ってしまった");
        const { error: e7 } = await cast.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: true, p_can_crm: true, p_can_shift: true, p_can_view_backs: false,
        });
        check("段16 cast forbidden", forbidden(e7), e7?.message ?? "通ってしまった");

        // ④ 規約7: 4フラグいずれか null で bad flag（can_view_backs 追加＝mig0038 5引数化）
        for (const [label, args] of [
          ["can_register null", { p_membership_id: memRegOff.id, p_can_register: null, p_can_crm: false, p_can_shift: false, p_can_view_backs: false }],
          ["can_crm null", { p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: null, p_can_shift: false, p_can_view_backs: false }],
          ["can_shift null", { p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: false, p_can_shift: null, p_can_view_backs: false }],
          ["can_view_backs null", { p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: false, p_can_shift: false, p_can_view_backs: null }],
        ] as const) {
          const { error } = await owner.rpc("set_staff_perms", args as Record<string, unknown>);
          check(`段16 規約7: ${label} = bad flag`, has(error, "bad flag"), error?.message ?? "通ってしまった");
        }

        // ⑤ 対象 role: owner/manager/cast の membership は not a staff
        for (const [label, mem] of [["owner", memOwner], ["manager", memManager], ["cast", memCast]] as const) {
          const { error } = await owner.rpc("set_staff_perms", {
            p_membership_id: mem!.id, p_can_register: false, p_can_crm: false, p_can_shift: false, p_can_view_backs: false,
          });
          check(`段16 対象 ${label} membership = not a staff`, has(error, "not a staff"), error?.message ?? "通ってしまった");
        }

        // ⑥ 越境: 他 org の membership は not found（存在オラクル封じ）
        const { error: eX } = await owner.rpc("set_staff_perms", {
          p_membership_id: memB1!.id, p_can_register: false, p_can_crm: false, p_can_shift: false, p_can_view_backs: false,
        });
        check("段16 他 org membership = not found", has(eX, "not found"), eX?.message ?? "通ってしまった");
        const { error: eX2 } = await owner.rpc("set_staff_perms", {
          p_membership_id: randomUUID(), p_can_register: false, p_can_crm: false, p_can_shift: false, p_can_view_backs: false,
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
          p_membership_id: memRegOn.id, p_can_register: false, p_can_crm: false, p_can_shift: false, p_can_view_backs: false,
        });
        check("段16 結合（準備）staffRegOnA1 の can_register を false に", !eOff1, eOff1?.message);
        const { error: eOpenOff } = await staffOn.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段16 ★結合: can_register=false 化した staff の check_open が forbidden（束1ゲート実反映）",
          forbidden(eOpenOff), eOpenOff?.message ?? "通ってしまった");
        const { error: eOn1 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOn.id,
          p_can_register: memRegOn.can_register, p_can_crm: memRegOn.can_crm, p_can_shift: memRegOn.can_shift,
          p_can_view_backs: memRegOn.can_view_backs,
        });
        check("段16 結合（復元）staffRegOnA1 をベースラインへ", !eOn1, eOn1?.message);
        const { data: chkOn, error: eOpenOn } = await staffOn.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
        check("段16 ★結合: 復元後 check_open 成功（実 INSERT・フラグが runtime に実反映）",
          !eOpenOn && typeof chkOn === "string", eOpenOn?.message);
        await wipeSeatChecks();

        // ⑧ ★結合テスト（束2連動・customers RLS）: staffRegOffA1 に can_crm を付けると customers が見える
        //    → 復元（全 false）で 0行に戻る。
        const { error: eCrm1 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id, p_can_register: false, p_can_crm: true, p_can_shift: false, p_can_view_backs: false,
        });
        check("段16 結合（準備）staffRegOffA1 に can_crm=true", !eCrm1, eCrm1?.message);
        const { data: custOn } = await staffOff.from("customers").select("id");
        check("段16 ★結合: can_crm=true 化した staff が customers 可視（束2 RLS 実反映・自店4客）",
          (custOn ?? []).length === 4, `got ${(custOn ?? []).length}`);
        const { error: eCrm0 } = await owner.rpc("set_staff_perms", {
          p_membership_id: memRegOff.id,
          p_can_register: memRegOff.can_register, p_can_crm: memRegOff.can_crm, p_can_shift: memRegOff.can_shift,
          p_can_view_backs: memRegOff.can_view_backs,
        });
        check("段16 結合（復元）staffRegOffA1 をベースラインへ", !eCrm0, eCrm0?.message);
        const { data: custOff } = await staffOff.from("customers").select("id");
        check("段16 ★結合: 復元後 customers 0行に戻る", (custOff ?? []).length === 0, `got ${(custOff ?? []).length}`);
      } finally {
        // フラグ復元の最終保証（service 直・途中失敗でも rls の F3a-1/F3a-2 前提を汚さない）
        await admin.from("memberships").update({
          can_register: memRegOn.can_register, can_crm: memRegOn.can_crm, can_shift: memRegOn.can_shift,
          can_view_backs: memRegOn.can_view_backs,
        }).eq("id", memRegOn.id);
        await admin.from("memberships").update({
          can_register: memRegOff.can_register, can_crm: memRegOff.can_crm, can_shift: memRegOff.can_shift,
          can_view_backs: memRegOff.can_view_backs,
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
                p_membership_id: mLink, p_can_register: true, p_can_crm: true, p_can_shift: false, p_can_view_backs: false,
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

  // ── 段24: B-2（mig0031）get_cast_customer_ranking の実効ゲート＋窓一致の脱落差分（real signIn 実測）──
  //   集計元は get_cast_ranking と同一（check_nominations×checks・cutoff 窓・nom_type は checks 側）。
  //   ★専用 cast（段24 生成）を対象にする＝seed は指名を作らない（seed-f0 は del のみ）ため件数が完全決定的。
  //   fixture＝段19 方式: service 生成（専用 cast 2・専用客 2・closed 伝票5＝客付き指名4/客なし指名1/
  //   他 cast 指名1）→try/finally 全消し。窓＝当月 15日 12:00 JST 起点（cutoff 06:00 の月境界に非接触）。
  //   ★仕様メモ: 「他店 cast」は mig0031 に cast の store 検証なし＝自店 checks に他店 cast の指名が
  //   構造上存在しないため 0行（forbidden ではない・漏洩なし）。実測どおり 0行を固定する。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    // 準備（service）: 店2・PERM卓・manager users.id・専用 cast/客の生成＋前回遺物掃除（再実行冪等）
    const { data: s24Stores } = await admin.from("stores").select("id, name, org_id").in("name", [STORE_A1, STORE_A2]);
    const s24A1 = s24Stores?.find((s) => s.name === STORE_A1);
    const s24A2 = s24Stores?.find((s) => s.name === STORE_A2);
    let s24Seat = "";
    {
      const { data: sExist } = await admin.from("seats").select("id")
        .eq("store_id", s24A1!.id).eq("name", "NOX-VERIFY-PERM卓").limit(1);
      if (sExist?.length) s24Seat = sExist[0].id as string;
      else {
        const { data: sNew } = await admin.from("seats").insert({
          org_id: s24A1!.org_id, store_id: s24A1!.id, name: "NOX-VERIFY-PERM卓", kind: "卓", sort_order: 999,
        }).select("id").single();
        s24Seat = sNew!.id as string;
      }
    }
    const { data: s24MgrRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
    const s24MgrId = s24MgrRow?.id as string;
    const { data: s24CastA1aRow } = await admin.from("casts").select("id")
      .eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", s24A1!.id).single();
    const s24CastA1a = s24CastA1aRow?.id as string;
    // 前回失敗遺物の掃除（マーカー total 範囲の伝票起点＝c5 型「他 cast 指名の伝票」も漏らさない。
    // nominations→checks→cast/客 の FK 順）
    const s24Wipe = async () => {
      const { data: oldChks } = await admin.from("checks").select("id")
        .eq("seat_id", s24Seat).gte("total", 245_000).lte("total", 245_010);
      const chkIds = (oldChks ?? []).map((c) => c.id as string);
      if (chkIds.length) {
        await admin.from("check_nominations").delete().in("check_id", chkIds);
        await admin.from("checks").delete().in("id", chkIds);
      }
      await admin.from("casts").delete().like("name", "NOX-VERIFY-段24%");
      await admin.from("customers").delete().like("name", "NOX-VERIFY-段24%");
    };
    await s24Wipe();
    const { data: s24CastRow } = await admin.from("casts").insert({
      org_id: s24A1!.org_id, store_id: s24A1!.id, name: "NOX-VERIFY-段24cast", is_active: true,
    }).select("id").single();
    const s24Cast = s24CastRow?.id as string;
    const { data: s24CastA2Row } = await admin.from("casts").insert({
      org_id: s24A2!.org_id, store_id: s24A2!.id, name: "NOX-VERIFY-段24他店cast", is_active: true,
    }).select("id").single();
    const s24CastOther = s24CastA2Row?.id as string;
    const { data: s24Custs, error: e24Cust } = await admin.from("customers").insert([
      { org_id: s24A1!.org_id, store_id: s24A1!.id, name: "NOX-VERIFY-段24客1" },
      { org_id: s24A1!.org_id, store_id: s24A1!.id, name: "NOX-VERIFY-段24客2" },
    ]).select("id, name");
    const s24C1 = s24Custs?.find((c) => c.name === "NOX-VERIFY-段24客1")?.id as string;
    const s24C2 = s24Custs?.find((c) => c.name === "NOX-VERIFY-段24客2")?.id as string;
    check("段24（準備）店2/PERM卓/manager id/castA1a/専用 cast2/専用客2 の解決",
      !!s24A1 && !!s24A2 && !!s24Seat && !!s24MgrId && !!s24CastA1a && !!s24Cast && !!s24CastOther && !e24Cust && !!s24C1 && !!s24C2,
      e24Cust?.message);

    // 窓: 当月（JST）・15日 12:00 JST 起点＝cutoff 06:00 の月境界に確実に非接触
    const jstNow = new Date(Date.now() + 9 * 3600_000);
    const s24Y = jstNow.getUTCFullYear();
    const s24M = jstNow.getUTCMonth(); // 0-based
    const s24Period = `${s24Y}-${String(s24M + 1).padStart(2, "0")}`;
    const s24At = (min: number) => new Date(Date.UTC(s24Y, s24M, 15, 3, min, 0)).toISOString(); // 12:00 JST + min

    const owner24 = await signInShared("段24", "ownerA");
    const mgr24 = await signInShared("段24", "managerA1");
    const crm24 = await signInShared("段24", "staffCrmOnA1");
    const cast24 = await signInShared("段24", "castA1a");
    if (s24A1 && s24A2 && s24Seat && s24MgrId && s24CastA1a && s24Cast && s24CastOther && s24C1 && s24C2
        && owner24 && mgr24 && crm24 && cast24) {
      type CRow = {
        customer_id: string; customer_name: string;
        hon_count: number; jonai_count: number; dohan_count: number; total_count: number;
      };
      const rankArgs = { p_store_id: s24A1.id, p_period: s24Period, p_cast_id: s24Cast };
      try {
        // 投入: closed 5伝票（c1/c2=客1 hon×2・c3=客2 jonai・c4=客なし dohan・c5=客2 hon だが指名は castA1a）
        const base = {
          org_id: s24A1.org_id, store_id: s24A1.id, seat_id: s24Seat,
          service_rate: 10, round_unit: 100, round_mode: "down", created_by: s24MgrId, status: "closed",
        };
        // total=245000+min はマーカー（wipe と掃除確認が範囲一致で拾う・他段の total 帯と非衝突）
        const mkChk = (min: number, cust: string | null, nomType: string) => ({
          ...base, customer_id: cust, nom_type: nomType,
          started_at: s24At(min), closed_at: s24At(min + 30), total: 245_000 + min,
        });
        const { data: ins24, error: eIns24 } = await admin.from("checks").insert([
          mkChk(0, s24C1, "hon"), mkChk(1, s24C1, "hon"), mkChk(2, s24C2, "jonai"),
          mkChk(3, null, "dohan"), mkChk(4, s24C2, "hon"),
        ]).select("id, total");
        const chkIdOf = (min: number) => ins24?.find((r) => r.total === 245_000 + min)?.id as string;
        const nomOf = (min: number, castId: string) => ({
          org_id: s24A1.org_id, store_id: s24A1.id, check_id: chkIdOf(min), cast_id: castId, ratio_weight: 1, position: 1,
        });
        const { error: eNom24 } = await admin.from("check_nominations").insert([
          nomOf(0, s24Cast), nomOf(1, s24Cast), nomOf(2, s24Cast), nomOf(3, s24Cast),
          nomOf(4, s24CastA1a), // 他 cast の指名＝対象 cast の集計に混ざらないことの実証
        ]);
        check("段24（準備）closed 5伝票＋指名5行 投入（窓内・客付き4/客なし1/他cast1）",
          !eIns24 && (ins24 ?? []).length === 5 && !eNom24, eIns24?.message ?? eNom24?.message);

        // 24-0 anon BLOCKED（公開 RPC の anon 軸）
        const { error: eAnon24 } = await anon.rpc("get_cast_customer_ranking", rankArgs);
        check("段24-0 anon get_cast_customer_ranking BLOCKED", isFnBlocked(eAnon24), eAnon24?.message ?? "実行できてしまった");

        // 24-1 owner: 客付き指名が回数順で返る（客1=hon2 → 客2=jonai1・c5 の他 cast 指名は混ざらない）
        const { data: rO, error: eO } = await owner24.rpc("get_cast_customer_ranking", rankArgs);
        const ro = (rO ?? []) as CRow[];
        check("段24-1 owner = 2行・total_count 降順（客1=2 → 客2=1・他 cast 指名 c5 は不算入）",
          !eO && ro.length === 2 && ro[0]?.customer_id === s24C1 && ro[0]?.total_count === 2
            && ro[1]?.customer_id === s24C2 && ro[1]?.total_count === 1,
          eO?.message ?? JSON.stringify(ro.map((r) => [r.customer_name, r.total_count])));
        check("段24-1 customer_name 解決（RPC 内 join）", ro[0]?.customer_name === "NOX-VERIFY-段24客1"
          && ro[1]?.customer_name === "NOX-VERIFY-段24客2", JSON.stringify(ro.map((r) => r.customer_name)));

        // 24-6 nom_type 内訳（checks.nom_type 起点で客ごとに振り分く）
        check("段24-6 内訳: 客1=hon2/jonai0/dohan0・客2=hon0/jonai1/dohan0",
          ro[0]?.hon_count === 2 && ro[0]?.jonai_count === 0 && ro[0]?.dohan_count === 0
            && ro[1]?.hon_count === 0 && ro[1]?.jonai_count === 1 && ro[1]?.dohan_count === 0,
          JSON.stringify(ro));

        // 24-2 manager: 自店成功／他店 store=forbidden／他店 cast=0行（実測仕様・漏洩なし）
        const { data: rM, error: eM } = await mgr24.rpc("get_cast_customer_ranking", rankArgs);
        check("段24-2 manager 自店 = owner と同一 2行", !eM && ((rM ?? []) as CRow[]).length === 2, eM?.message);
        const { error: eMA2 } = await mgr24.rpc("get_cast_customer_ranking", { ...rankArgs, p_store_id: s24A2.id });
        check("段24-2 manager × 他店 store = forbidden", forbidden(eMA2), eMA2?.message ?? "通ってしまった");
        const { data: rMOther, error: eMOther } = await mgr24.rpc("get_cast_customer_ranking", { ...rankArgs, p_cast_id: s24CastOther });
        check("段24-2 manager × 他店 cast = 0行（自店 checks に他店 cast の指名は構造上不在・エラーではない）",
          !eMOther && ((rMOther ?? []) as CRow[]).length === 0, eMOther?.message ?? `got ${((rMOther ?? []) as CRow[]).length}`);

        // 24-3 ★staff（can_crm でも）= forbidden（D6a・二層目の real session 実測）
        const { error: eS24 } = await crm24.rpc("get_cast_customer_ranking", rankArgs);
        check("段24-3 staff(can_crm) = forbidden（D6a）", forbidden(eS24), eS24?.message ?? "通ってしまった");

        // 24-4 ★cast 本人 = forbidden（初版は経営側限定）
        const { error: eC24 } = await cast24.rpc("get_cast_customer_ranking", { ...rankArgs, p_cast_id: s24CastA1a });
        check("段24-4 cast 本人 = forbidden（v_role not in owner/manager）", forbidden(eC24), eC24?.message ?? "通ってしまった");

        // 24-5 ★窓一致の脱落差分: get_cast_ranking の総数 − 客付き合計 = 客なし指名数（=1）
        const { data: rRank, error: eRank } = await owner24.rpc("get_cast_ranking", { p_store_id: s24A1.id, p_period: s24Period });
        const rankRow = ((rRank ?? []) as { cast_id: string; hon_count: number; jonai_count: number; dohan_count: number }[])
          .find((r) => r.cast_id === s24Cast);
        const rankTotal = (rankRow?.hon_count ?? 0) + (rankRow?.jonai_count ?? 0) + (rankRow?.dohan_count ?? 0);
        const custTotal = ro.reduce((a, r) => a + r.total_count, 0);
        check("段24-5 get_cast_ranking 側: 段24cast = hon2/jonai1/dohan1（総数4・窓一致）",
          !eRank && rankRow?.hon_count === 2 && rankRow?.jonai_count === 1 && rankRow?.dohan_count === 1,
          eRank?.message ?? JSON.stringify(rankRow));
        check("段24-5 ★脱落差分成立: 総数4 − 客付き合計3 = 客なし指名1（正の値）",
          rankTotal - custTotal === 1 && rankTotal - custTotal > 0, `rank=${rankTotal}, cust=${custTotal}`);

        // 24-7 bad period
        const { error: eBad } = await owner24.rpc("get_cast_customer_ranking", { ...rankArgs, p_period: "2026-13" });
        check("段24-7 bad period（2026-13）", has(eBad, "bad period"), eBad?.message ?? "通ってしまった");
      } finally {
        await s24Wipe();
      }
      // 掃除の物理確認（rls 固定カウント非汚染の positive）
      const { data: castLeft24 } = await admin.from("casts").select("id").like("name", "NOX-VERIFY-段24%");
      const { data: custLeft24 } = await admin.from("customers").select("id").like("name", "NOX-VERIFY-段24%");
      const { data: chkLeft24 } = await admin.from("checks").select("id").eq("seat_id", s24Seat).gte("total", 245_000).lte("total", 245_010);
      check("段24 掃除確認: 専用 cast/客/伝票 0行（非汚染）",
        (castLeft24 ?? []).length === 0 && (custLeft24 ?? []).length === 0 && (chkLeft24 ?? []).length === 0,
        `cast=${(castLeft24 ?? []).length}, cust=${(custLeft24 ?? []).length}, chk=${(chkLeft24 ?? []).length}`);
    }
  }

  // ── 段25: B-5 スライスA（mig0032）store_business_hours＋予約の定休日バリデーション（real signIn 実測）──
  //   set_store_business_hours の権限/検証/upsert＋reservation_is_closed_day 経由の
  //   「定休日ハード拒否・時間外は通す・未設定は通す」の非対称を実測。
  //   ★汚染防止が最重要: store_business_hours の行が残ると段21 等の予約 verify が 'closed day' で
  //   落ちるため、try/finally 全消し＋残0 の物理確認 assert。予約もマーカー guest_name で全消し。
  //   時刻＝当月 15-18日（JST 正午基準・cutoff 06:00 の月境界非接触・dow は実日付から動的解決）。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    const { data: s25Stores } = await admin.from("stores").select("id, name, org_id").in("name", [STORE_A1, STORE_A2]);
    const s25A1 = s25Stores?.find((s) => s.name === STORE_A1);
    const s25A2 = s25Stores?.find((s) => s.name === STORE_A2);
    // 前回失敗遺物の掃除（再実行冪等）
    const s25Wipe = async () => {
      await admin.from("reservations").delete().like("guest_name", "NOX-VERIFY-段25%");
      if (s25A1 && s25A2) await admin.from("store_business_hours").delete().in("store_id", [s25A1.id, s25A2.id]);
    };
    await s25Wipe();

    // 当月（JST）の 15日=定休日テスト対象 / 17日=営業日（時間外通過）/ 18日=未設定通過
    const jst25 = new Date(Date.now() + 9 * 3600_000);
    const s25Y = jst25.getUTCFullYear();
    const s25M = jst25.getUTCMonth();
    const dowOf = (day: number) => new Date(Date.UTC(s25Y, s25M, day)).getUTCDay();  // JS getDay = pg extract(dow)
    const atJst = (day: number, hourJst: number, min = 0) => new Date(Date.UTC(s25Y, s25M, day, hourJst - 9, min)).toISOString();
    const dowClosed = dowOf(15);   // 定休日に設定する dow
    const dowOpen = dowOf(17);     // 営業日（20:00-30:00）に設定する dow
    const dowMgr = dowOf(16);      // manager set 用（予約テストの営業日解決とは非干渉）
    check("段25（準備）店2 解決・dow 3種が相異なる", !!s25A1 && !!s25A2
      && dowClosed !== dowOpen && dowOpen !== dowMgr && dowMgr !== dowClosed,
      `dow=${dowClosed},${dowMgr},${dowOpen}`);

    const owner25 = await signInShared("段25", "ownerA");
    const mgr25 = await signInShared("段25", "managerA1");
    const crm25 = await signInShared("段25", "staffCrmOnA1");
    const cast25 = await signInShared("段25", "castA1a");
    if (s25A1 && s25A2 && owner25 && mgr25 && crm25 && cast25) {
      try {
        // 25-0 anon BLOCKED（新設 RPC の anon 軸）
        const { error: eAnon25 } = await anon.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: 0, p_is_closed: true });
        check("段25-0 anon set_store_business_hours BLOCKED", isFnBlocked(eAnon25), eAnon25?.message ?? "実行できてしまった");

        // 25-1 owner 営業日 set（open 20:00・close 30:00＝24h 超 close の成功を兼ねる）
        const { error: e1 } = await owner25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowOpen, p_is_closed: false, p_open_hm: "20:00", p_close_hm: "30:00" });
        check("段25-1 owner 営業日 set 成功（close 30:00=24h超表記）", !e1, e1?.message);
        const { data: r1 } = await admin.from("store_business_hours").select("is_closed, open_hm, close_hm")
          .eq("store_id", s25A1.id).eq("dow", dowOpen);
        check("段25-1 物理確認: 1行・20:00-30:00・is_closed=false",
          (r1 ?? []).length === 1 && r1![0].is_closed === false && r1![0].open_hm === "20:00" && r1![0].close_hm === "30:00",
          JSON.stringify(r1));

        // 25-2 owner 定休日 set（open/close null）
        const { error: e2 } = await owner25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowClosed, p_is_closed: true, p_open_hm: null, p_close_hm: null });
        check("段25-2 owner 定休日 set 成功", !e2, e2?.message);
        const { data: r2 } = await admin.from("store_business_hours").select("is_closed, open_hm, close_hm")
          .eq("store_id", s25A1.id).eq("dow", dowClosed).single();
        check("段25-2 物理確認: is_closed=true・open/close null",
          r2?.is_closed === true && r2?.open_hm === null && r2?.close_hm === null, JSON.stringify(r2));

        // 25-6 upsert（同 store・同 dow 2回目＝行増えず値上書き）
        const { error: e6 } = await owner25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowOpen, p_is_closed: false, p_open_hm: "21:00", p_close_hm: "29:00" });
        const { data: r6 } = await admin.from("store_business_hours").select("open_hm, close_hm")
          .eq("store_id", s25A1.id).eq("dow", dowOpen);
        check("段25-6 upsert: 行増えず 21:00-29:00 へ上書き", !e6 && (r6 ?? []).length === 1
          && r6![0].open_hm === "21:00" && r6![0].close_hm === "29:00", e6?.message ?? JSON.stringify(r6));

        // 25-3 manager 自店成功／他店 forbidden
        const { error: e3a } = await mgr25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowMgr, p_is_closed: false, p_open_hm: "20:00", p_close_hm: "28:00" });
        check("段25-3 manager 自店 set 成功", !e3a, e3a?.message);
        const { error: e3b } = await mgr25.rpc("set_store_business_hours",
          { p_store_id: s25A2.id, p_dow: dowMgr, p_is_closed: true });
        check("段25-3 manager × 他店 store = forbidden", forbidden(e3b), e3b?.message ?? "通ってしまった");

        // 25-4 staff（can_crm でも）forbidden
        const { error: e4 } = await crm25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowMgr, p_is_closed: true });
        check("段25-4 staff(can_crm) set = forbidden", forbidden(e4), e4?.message ?? "通ってしまった");

        // 25-5 bad hours（片方 null／close<=open。24h 超の成功は 25-1 で実証済み）
        const { error: e5a } = await owner25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowMgr, p_is_closed: false, p_open_hm: "20:00", p_close_hm: null });
        check("段25-5 営業日で close null = bad hours", has(e5a, "bad hours"), e5a?.message ?? "通ってしまった");
        const { error: e5b } = await owner25.rpc("set_store_business_hours",
          { p_store_id: s25A1.id, p_dow: dowMgr, p_is_closed: false, p_open_hm: "20:00", p_close_hm: "18:00" });
        check("段25-5 close<=open（20:00→18:00）= bad hours", has(e5b, "bad hours"), e5b?.message ?? "通ってしまった");

        // 25-7 ★定休日ハード拒否（15日 21:00 JST＝営業日 15日・dowClosed）
        const { error: e7 } = await mgr25.rpc("reservation_create",
          { p_store_id: s25A1.id, p_reserved_at: atJst(15, 21), p_guest_name: "NOX-VERIFY-段25-定休" });
        check("段25-7 ★定休日の予約 = closed day", has(e7, "closed day"), e7?.message ?? "通ってしまった");

        // 25-8 ★深夜帯の営業日解決（16日 03:00 JST＝cutoff 前＝前営業日 15日=定休日として拒否）
        const { error: e8 } = await mgr25.rpc("reservation_create",
          { p_store_id: s25A1.id, p_reserved_at: atJst(16, 3), p_guest_name: "NOX-VERIFY-段25-深夜" });
        check("段25-8 ★定休日翌日未明（cutoff 前）= 前営業日として closed day", has(e8, "closed day"), e8?.message ?? "通ってしまった");

        // 25-9 ★営業時間外は通る（17日 12:00 JST＝営業日 17日・21:00-29:00 の窓外だが RPC は拒否しない）
        const { data: id9, error: e9 } = await mgr25.rpc("reservation_create",
          { p_store_id: s25A1.id, p_reserved_at: atJst(17, 12), p_guest_name: "NOX-VERIFY-段25-時間外" });
        check("段25-9 ★営業時間外の予約 = 成功（定休日拒否との非対称・時間外は UI 警告の責務）",
          !e9 && typeof id9 === "string", e9?.message);

        // 25-10 ★未設定 dow は通る（18日 21:00＝行なし＝後方互換）
        const { data: id10, error: e10 } = await mgr25.rpc("reservation_create",
          { p_store_id: s25A1.id, p_reserved_at: atJst(18, 21), p_guest_name: "NOX-VERIFY-段25-未設定" });
        check("段25-10 ★営業時間未設定 dow の予約 = 成功（行なし=通す）", !e10 && typeof id10 === "string", e10?.message);

        // 25-11 update でも定休日拒否（成功予約を定休日へ移動）
        const { error: e11 } = await mgr25.rpc("reservation_update", {
          p_reservation_id: id10, p_reserved_at: atJst(15, 22), p_customer_id: null, p_cast_id: null,
          p_guest_name: "NOX-VERIFY-段25-未設定", p_party_size: null, p_nom_type: null, p_memo: null,
        });
        check("段25-11 update で定休日へ移動 = closed day", has(e11, "closed day"), e11?.message ?? "通ってしまった");

        // 25-12 cast は store_business_hours 0行（RLS パターン2）
        const { data: r12, error: e12 } = await cast25.from("store_business_hours").select("id");
        check("段25-12 cast SELECT = 0行（パターン2）", !e12 && (r12 ?? []).length === 0,
          e12?.message ?? `got ${(r12 ?? []).length}`);
      } finally {
        await s25Wipe();
      }
      // 掃除の物理確認（★営業時間行の残存は段21 等の予約 verify を 'closed day' で壊すため必須）
      const { data: bhLeft25 } = await admin.from("store_business_hours").select("id").in("store_id", [s25A1.id, s25A2.id]);
      const { data: resLeft25 } = await admin.from("reservations").select("id").like("guest_name", "NOX-VERIFY-段25%");
      check("段25 掃除確認: store_business_hours/予約 0行（非汚染）",
        (bhLeft25 ?? []).length === 0 && (resLeft25 ?? []).length === 0,
        `bh=${(bhLeft25 ?? []).length}, res=${(resLeft25 ?? []).length}`);
    }
  }

  // ── 段26: B-5 スライスB（mig0033）シフトの定休日バリデーション（real signIn 実測）──
  //   shift_is_closed_day 経由の「定休日ハード拒否・時間外は通す・未設定は通す」の非対称を
  //   3挿入点（shift_wish_submit / shift_set create・update / shift_wish_decide accept）で実測。
  //   ★営業日 dow はシフトの date そのもの（cutoff 変換なし＝mig0008 決定3 の営業日宣言・裁定B-2）。
  //   ★汚染防止: store_business_hours の残存は段21 や verify:nox-rls（2026-07-15 固定日 wish）を
  //   'closed day' で壊すため try/finally 全消し＋残0 の物理確認 assert。シフト/希望は
  //   castA1a×当月15/17/18日の窓に限定して生成し窓 wipe（shifts→shift_wishes の FK 順）。
  //   15/17/18 は差が 7 未満＝dow は常に相異なる（月替わりでも自壊しない）。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

    const { data: s26Stores } = await admin.from("stores").select("id, name").in("name", [STORE_A1, STORE_A2]);
    const s26A1 = s26Stores?.find((s) => s.name === STORE_A1);
    const s26A2 = s26Stores?.find((s) => s.name === STORE_A2);
    const { data: s26CastRows } = await admin.from("casts").select("id")
      .eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", s26A1?.id ?? "");
    const s26CastId = s26CastRows?.[0]?.id as string;

    const jst26 = new Date(Date.now() + 9 * 3600_000);
    const s26Y = jst26.getUTCFullYear();
    const s26M = jst26.getUTCMonth();
    const dowOf26 = (day: number) => new Date(Date.UTC(s26Y, s26M, day)).getUTCDay();  // JS getDay = pg extract(dow)
    const d26 = (day: number) => `${s26Y}-${String(s26M + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dowClosed26 = dowOf26(15);  // 定休日にする dow
    const dowOpen26 = dowOf26(17);    // 営業日 20:00-30:00（時間外通過テスト）
    const dowLate26 = dowOf26(18);    // 提出時は未設定→26-7 で後から定休日化（decide 競合）

    // 前回失敗遺物の掃除（再実行冪等）
    const s26Wipe = async () => {
      if (s26CastId) {
        await admin.from("shifts").delete().eq("cast_id", s26CastId).in("date", [d26(15), d26(17), d26(18)]);
        await admin.from("shift_wishes").delete().eq("cast_id", s26CastId).in("date", [d26(15), d26(17), d26(18)]);
      }
      if (s26A1 && s26A2) await admin.from("store_business_hours").delete().in("store_id", [s26A1.id, s26A2.id]);
    };
    await s26Wipe();

    check("段26（準備）店2・castA1a 解決", !!s26A1 && !!s26A2 && !!s26CastId);

    const owner26 = await signInShared("段26", "ownerA");
    const mgr26 = await signInShared("段26", "managerA1");
    const cast26 = await signInShared("段26", "castA1a");
    if (s26A1 && s26A2 && s26CastId && owner26 && mgr26 && cast26) {
      try {
        // 準備: 15日dow=定休・17日dow=20:00-30:00（set 自体の権限/検証は段25 で実証済み）
        const { error: eS1 } = await owner26.rpc("set_store_business_hours",
          { p_store_id: s26A1.id, p_dow: dowClosed26, p_is_closed: true, p_open_hm: null, p_close_hm: null });
        const { error: eS2 } = await owner26.rpc("set_store_business_hours",
          { p_store_id: s26A1.id, p_dow: dowOpen26, p_is_closed: false, p_open_hm: "20:00", p_close_hm: "30:00" });
        check("段26（準備）営業時間 set（15日dow=定休・17日dow=20:00-30:00）", !eS1 && !eS2, eS1?.message ?? eS2?.message);

        // 26-0 anon は新設ヘルパー BLOCKED
        const { error: eAnon26 } = await anon.rpc("shift_is_closed_day", { p_store_id: s26A1.id, p_date: d26(15) });
        check("段26-0 anon shift_is_closed_day BLOCKED", isFnBlocked(eAnon26), eAnon26?.message ?? "実行できてしまった");

        // 26-1 ★cast の定休日 wish = closed day（raise=トランザクション巻き戻し＝実 INSERT なしも物理確認）
        const { error: e1 } = await cast26.rpc("shift_wish_submit",
          { p_date: d26(15), p_start_hm: "20:00", p_end_hm: "26:00" });
        check("段26-1 ★定休日の shift_wish_submit = closed day", has(e1, "closed day"), e1?.message ?? "通ってしまった");
        const { data: r1 } = await admin.from("shift_wishes").select("id").eq("cast_id", s26CastId).eq("date", d26(15));
        check("段26-1 物理確認: wish 0行（INSERT されていない）", (r1 ?? []).length === 0, `got ${(r1 ?? []).length}`);

        // 26-2 ★営業時間外 wish は通る（17日 12:00-15:00＝20:00-30:00 の窓外・非対称）
        const { data: id2, error: e2 } = await cast26.rpc("shift_wish_submit",
          { p_date: d26(17), p_start_hm: "12:00", p_end_hm: "15:00" });
        check("段26-2 ★営業時間外の wish = 成功（定休日拒否との非対称・警告は経営側 UI の責務）",
          !e2 && typeof id2 === "string", e2?.message);

        // 26-3 ★未設定 dow の wish は通る（18日＝行なし＝後方互換）
        const { data: id3, error: e3 } = await cast26.rpc("shift_wish_submit",
          { p_date: d26(18), p_start_hm: "20:00", p_end_hm: "26:00" });
        check("段26-3 ★未設定 dow の wish = 成功（行なし=通す）", !e3 && typeof id3 === "string", e3?.message);

        // 26-4 manager shift_set(create) で定休日 = closed day
        const { error: e4 } = await mgr26.rpc("shift_set",
          { p_id: null, p_cast_id: s26CastId, p_date: d26(15), p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned" });
        check("段26-4 ★定休日の shift_set(create) = closed day", has(e4, "closed day"), e4?.message ?? "通ってしまった");

        // 26-5 create は営業日（時間外）で成功 → update で定休日へ移動 = closed day（既存行は不変）
        const { data: id5, error: e5a } = await mgr26.rpc("shift_set",
          { p_id: null, p_cast_id: s26CastId, p_date: d26(17), p_start_hm: "12:00", p_end_hm: "15:00", p_status: "planned" });
        check("段26-5 営業時間外の shift_set(create) = 成功（非対称）", !e5a && typeof id5 === "string", e5a?.message);
        const { error: e5b } = await mgr26.rpc("shift_set",
          { p_id: id5, p_cast_id: s26CastId, p_date: d26(15), p_start_hm: "20:00", p_end_hm: "26:00", p_status: "planned" });
        check("段26-5 ★update で定休日へ移動 = closed day", has(e5b, "closed day"), e5b?.message ?? "通ってしまった");
        const { data: r5 } = await admin.from("shifts").select("date").eq("id", id5).single();
        check("段26-5 物理確認: シフトは 17日 のまま（update 不成立）", r5?.date === d26(17), JSON.stringify(r5));

        // 26-6 ★cast から helper 直呼び（grant authenticated＝boolean のみの専用経路・裁定3 の最小形）
        const { data: h6a, error: e6a } = await cast26.rpc("shift_is_closed_day", { p_store_id: s26A1.id, p_date: d26(15) });
        const { data: h6b, error: e6b } = await cast26.rpc("shift_is_closed_day", { p_store_id: s26A1.id, p_date: d26(18) });
        check("段26-6 cast helper 直呼び: 定休日=true・未設定=false", !e6a && h6a === true && !e6b && h6b === false,
          e6a?.message ?? e6b?.message ?? `got ${h6a},${h6b}`);

        // 26-7 ★decide 競合: 提出済み wish（18日=提出時未設定）の dow を後から定休日化 →
        //       accept は closed day・wish は pending のまま・shifts 未生成 → reject は定休日でも可
        const { error: eS3 } = await owner26.rpc("set_store_business_hours",
          { p_store_id: s26A1.id, p_dow: dowLate26, p_is_closed: true, p_open_hm: null, p_close_hm: null });
        const { error: e7a } = await mgr26.rpc("shift_wish_decide", { p_wish_id: id3, p_accept: true });
        check("段26-7 ★提出後に定休日化された wish の accept = closed day", !eS3 && has(e7a, "closed day"),
          eS3?.message ?? e7a?.message ?? "通ってしまった");
        const { data: r7w } = await admin.from("shift_wishes").select("status").eq("id", id3).single();
        const { data: r7s } = await admin.from("shifts").select("id").eq("wish_id", id3);
        check("段26-7 物理確認: wish は pending のまま・shifts 未生成", r7w?.status === "pending" && (r7s ?? []).length === 0,
          `status=${r7w?.status}, shifts=${(r7s ?? []).length}`);
        const { error: e7b } = await mgr26.rpc("shift_wish_decide", { p_wish_id: id3, p_accept: false });
        const { data: r7r } = await admin.from("shift_wishes").select("status").eq("id", id3).single();
        check("段26-7 reject は定休日でも可（rejected へ）", !e7b && r7r?.status === "rejected",
          e7b?.message ?? `status=${r7r?.status}`);
      } finally {
        await s26Wipe();
      }
      // 掃除の物理確認（★営業時間行の残存は段21 や verify:nox-rls の固定日 wish を 'closed day' で壊すため必須）
      const { data: bhLeft26 } = await admin.from("store_business_hours").select("id").in("store_id", [s26A1.id, s26A2.id]);
      const { data: wLeft26 } = await admin.from("shift_wishes").select("id").eq("cast_id", s26CastId).in("date", [d26(15), d26(17), d26(18)]);
      const { data: sLeft26 } = await admin.from("shifts").select("id").eq("cast_id", s26CastId).in("date", [d26(15), d26(17), d26(18)]);
      check("段26 掃除確認: 営業時間/希望/シフト 0行（非汚染）",
        (bhLeft26 ?? []).length === 0 && (wLeft26 ?? []).length === 0 && (sLeft26 ?? []).length === 0,
        `bh=${(bhLeft26 ?? []).length}, wish=${(wLeft26 ?? []).length}, shift=${(sLeft26 ?? []).length}`);
    }
  }

  // ── 段27: F3e（mig0034）notices の P3 可視範囲＋書込 RPC 権限＋実 INSERT（real signIn 実測）──
  //   ★prosrc green ≠ runtime success（0077 教訓）: SQL Editor はサービスロール実行で auth ガードが
  //   発火しないため、RLS 可視範囲（P3・cast=all/cast のみ）と RPC 権限（owner/manager のみ投稿）は
  //   real signIn セッションでしか検証できない。owner/manager の notice_create は uuid 返却＋行生成＋
  //   created_by 充填まで物理確認（実 INSERT 完走）。
  //   ★汚染防止: 生成 notices は title 前置 'NOX-VERIFY-段27' で try/finally 全消し＋残0 物理確認。
  //   notices は新規（他段・rls/grants は未参照）だが将来汚染を断つため残0 を能動 assert。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const denied = (e: { message?: string } | null) => has(e, "permission denied");
    const P = "NOX-VERIFY-段27";

    const { data: s27Stores } = await admin.from("stores").select("id, name, org_id").in("name", [STORE_A1, STORE_A2, STORE_B1]);
    const s27A1 = s27Stores?.find((s) => s.name === STORE_A1);
    const s27A2 = s27Stores?.find((s) => s.name === STORE_A2);
    const s27B1 = s27Stores?.find((s) => s.name === STORE_B1);
    // created_by（NOT NULL FK to users）用に有効な users.id を org 毎に1つ解決
    const uidOf = async (storeName: string) => {
      const { data } = await admin.from("stores").select("id").eq("name", storeName).single();
      const { data: m } = await admin.from("memberships").select("user_id").eq("store_id", data?.id ?? "").eq("is_active", true).limit(1);
      return m?.[0]?.user_id as string | undefined;
    };
    const s27UserA = await uidOf(STORE_A1);
    const s27UserB = await uidOf(STORE_B1);

    const s27Wipe = async () => { await admin.from("notices").delete().like("title", `${P}%`); };
    await s27Wipe();

    check("段27（準備）店3・created_by ユーザー解決",
      !!s27A1 && !!s27A2 && !!s27B1 && !!s27UserA && !!s27UserB);

    const owner27 = await signInShared("段27", "ownerA");
    const mgr27 = await signInShared("段27", "managerA1");
    const staff27 = await signInShared("段27", "staffA1");
    const cast27 = await signInShared("段27", "castA1a");
    const mgrB27 = await signInShared("段27", "managerB1");

    if (s27A1 && s27A2 && s27B1 && s27UserA && s27UserB && owner27 && mgr27 && staff27 && cast27 && mgrB27) {
      // fixture notices を service INSERT（RLS バイパス＝store_id/audience/until を厳密設定）
      const mk = (store: { id: string; org_id: string }, aud: string, tag: string, until: string | null, by: string) =>
        ({ org_id: store.org_id, store_id: store.id, title: `${P}-${tag}`, body: "本文", audience: aud, pinned: false, until, created_by: by });
      const { data: ins, error: eIns } = await admin.from("notices").insert([
        mk(s27A1, "all", "A1-all", null, s27UserA),
        mk(s27A1, "cast", "A1-cast", null, s27UserA),
        mk(s27A1, "staff", "A1-staff", null, s27UserA),
        mk(s27A1, "all", "A1-expired", "2020-01-01", s27UserA),   // 期限切れ（過去日）
        mk(s27A2, "all", "A2-all", null, s27UserA),               // 他店（同 org）
        mk(s27B1, "all", "B1-all", null, s27UserB),               // 他 org
      ]).select("id, title");
      const byTag = (t: string) => ins?.find((r) => r.title === `${P}-${t}`)?.id as string;
      const id1 = byTag("A1-all"), id2 = byTag("A1-cast"), id3 = byTag("A1-staff"),
            id4 = byTag("A1-expired"), id5 = byTag("A2-all"), id6 = byTag("B1-all");
      check("段27（準備）fixture notices 6件 生成", !eIns && (ins ?? []).length === 6, eIns?.message ?? `got ${(ins ?? []).length}`);

      try {
        const idset = async (c: SupabaseClient) => {
          const { data, error } = await c.from("notices").select("id").like("title", `${P}%`);
          return { set: new Set((data ?? []).map((r) => r.id as string)), error };
        };

        // 27-1 ★cast: all/cast のみ可視・staff/他店/他org 不可視（正本 §6 の P3 検証）
        const c1 = await idset(cast27);
        check("段27-1 ★cast SELECT = all/cast のみ（staff・他店・他org 不可視）",
          c1.set.has(id1) && c1.set.has(id2) && c1.set.has(id4)
          && !c1.set.has(id3) && !c1.set.has(id5) && !c1.set.has(id6),
          `size=${c1.set.size}`);

        // 27-2 staff（黒服）: all/cast/staff 全可視（自店のみ）
        const s2 = await idset(staff27);
        check("段27-2 staff SELECT = all/cast/staff 全可視（他店・他org 不可視）",
          s2.set.has(id1) && s2.set.has(id2) && s2.set.has(id3) && s2.set.has(id4)
          && !s2.set.has(id5) && !s2.set.has(id6), `size=${s2.set.size}`);

        // 27-3 manager: 全 audience 可視（自店）
        const m3 = await idset(mgr27);
        check("段27-3 manager SELECT = 全 audience 可視（他店・他org 不可視）",
          m3.set.has(id1) && m3.set.has(id2) && m3.set.has(id3) && m3.set.has(id4)
          && !m3.set.has(id5) && !m3.set.has(id6), `size=${m3.set.size}`);

        // 27-4 owner: 自店の全 audience 可視（owner も auth_store_id() スコープ＝A2 不可視）
        const o4 = await idset(owner27);
        check("段27-4 owner SELECT = 自店の全 audience 可視（A2 不可視＝owner も自店スコープ）",
          o4.set.has(id1) && o4.set.has(id2) && o4.set.has(id3) && o4.set.has(id4)
          && !o4.set.has(id5) && !o4.set.has(id6), `size=${o4.set.size}`);

        // 27-5 anon: SELECT 拒否 or 0行
        const a5 = await idset(anon);
        check("段27-5 anon SELECT = 拒否 or 0行", !!a5.error || a5.set.size === 0,
          a5.error?.message ?? `got ${a5.set.size}`);

        // 27-6 ★他店スコープ: managerB1 は B1 のみ・A 系不可視／managerA1 は B1 不可視
        const b6 = await idset(mgrB27);
        check("段27-6 ★managerB1 SELECT = B1 のみ（A1/A2 不可視＝store スコープ物理保証）",
          b6.set.has(id6) && !b6.set.has(id1) && !b6.set.has(id2) && !b6.set.has(id3)
          && !b6.set.has(id4) && !b6.set.has(id5), `size=${b6.set.size}`);
        check("段27-6 ★managerA1 は B1 notice 不可視（双方向 store 隔離）", !m3.set.has(id6));

        // 27-7 anon: 書込 RPC 3本 BLOCKED（grant revoke）
        const { error: e7c } = await anon.rpc("notice_create", { p_title: "x", p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        const { error: e7u } = await anon.rpc("notice_update", { p_notice_id: id1, p_title: "x", p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        const { error: e7d } = await anon.rpc("notice_delete", { p_notice_id: id1 });
        check("段27-7 anon notice_create/update/delete BLOCKED",
          isFnBlocked(e7c) && isFnBlocked(e7u) && isFnBlocked(e7d),
          `${e7c?.message} | ${e7u?.message} | ${e7d?.message}`);

        // 27-8 cast: notice_create forbidden（投稿不可）
        const { error: e8 } = await cast27.rpc("notice_create", { p_title: `${P}-castNG`, p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-8 cast notice_create = forbidden（投稿不可）", forbidden(e8), e8?.message ?? "通ってしまった");

        // 27-9 staff（黒服）: notice_create forbidden（閲覧のみ＝owner/manager のみ投稿）
        const { error: e9 } = await staff27.rpc("notice_create", { p_title: `${P}-staffNG`, p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-9 staff notice_create = forbidden（owner/manager のみ投稿）", forbidden(e9), e9?.message ?? "通ってしまった");

        // 27-10 ★manager notice_create 成功＝uuid 返却＋行生成＋created_by 充填（prosrc green≠runtime success）
        const { data: gu } = await mgr27.auth.getUser();
        const { data: mgrUser } = await admin.from("users").select("id").eq("auth_user_id", gu?.user?.id ?? "").single();
        const { data: newId, error: e10 } = await mgr27.rpc("notice_create",
          { p_title: `${P}-mgrOK`, p_body: "本文", p_audience: "staff", p_pinned: true, p_until: null });
        check("段27-10 ★manager notice_create 成功＝uuid 返却", !e10 && typeof newId === "string", e10?.message);
        const { data: row10 } = await admin.from("notices").select("store_id, audience, pinned, created_by").eq("id", newId ?? "").single();
        check("段27-10 ★物理確認: 行生成・store=A1・audience=staff・pinned=true・created_by=呼び手 users.id",
          row10?.store_id === s27A1.id && row10?.audience === "staff" && row10?.pinned === true
          && row10?.created_by === mgrUser?.id, JSON.stringify(row10));
        // owner も成功（owner/manager 双方が投稿可）
        const { data: ownId, error: e10o } = await owner27.rpc("notice_create",
          { p_title: `${P}-ownOK`, p_body: "本文", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-10 owner notice_create 成功＝uuid 返却", !e10o && typeof ownId === "string", e10o?.message);

        // 27-11 notice_update: 自店成功／他店 forbidden（store 不一致）／他org forbidden（存在オラクル封じ）
        const { error: e11a } = await mgr27.rpc("notice_update",
          { p_notice_id: newId, p_title: `${P}-mgrOK2`, p_body: "改", p_audience: "cast", p_pinned: false, p_until: null });
        const { data: row11 } = await admin.from("notices").select("title, audience").eq("id", newId ?? "").single();
        check("段27-11 manager notice_update 自店成功（title/audience 反映）",
          !e11a && row11?.title === `${P}-mgrOK2` && row11?.audience === "cast", e11a?.message ?? JSON.stringify(row11));
        const { error: e11b } = await mgr27.rpc("notice_update",
          { p_notice_id: id5, p_title: `${P}-x`, p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-11 manager × 他店(A2) notice_update = forbidden（store 不一致）", forbidden(e11b), e11b?.message ?? "通ってしまった");
        const { error: e11c } = await mgr27.rpc("notice_update",
          { p_notice_id: id6, p_title: `${P}-x`, p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-11 manager × 他org(B1) notice_update = forbidden（存在オラクル封じ）", forbidden(e11c), e11c?.message ?? "通ってしまった");

        // 27-12 notice_delete: 自店成功（行消滅の物理確認）／他店 forbidden
        const { error: e12a } = await mgr27.rpc("notice_delete", { p_notice_id: newId });
        const { data: row12 } = await admin.from("notices").select("id").eq("id", newId ?? "");
        check("段27-12 manager notice_delete 自店成功＝行消滅", !e12a && (row12 ?? []).length === 0, e12a?.message ?? `残 ${(row12 ?? []).length}`);
        const { error: e12b } = await mgr27.rpc("notice_delete", { p_notice_id: id5 });
        check("段27-12 manager × 他店(A2) notice_delete = forbidden", forbidden(e12b), e12b?.message ?? "通ってしまった");

        // 27-13 audience 不正値 = bad audience
        const { error: e13 } = await mgr27.rpc("notice_create", { p_title: `${P}-badAud`, p_body: "y", p_audience: "xxx", p_pinned: false, p_until: null });
        check("段27-13 audience 不正値 = bad audience", has(e13, "bad audience"), e13?.message ?? "通ってしまった");

        // 27-14 title 空 / body 空
        const { error: e14t } = await mgr27.rpc("notice_create", { p_title: "  ", p_body: "y", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-14 title 空 = bad title", has(e14t, "bad title"), e14t?.message ?? "通ってしまった");
        const { error: e14b } = await mgr27.rpc("notice_create", { p_title: `${P}-t`, p_body: "  ", p_audience: "all", p_pinned: false, p_until: null });
        check("段27-14 body 空 = bad body", has(e14b, "bad body"), e14b?.message ?? "通ってしまった");

        // 27-15 ★期限切れ行の保持（until 過去日でも SELECT で返る＝削除も raise もされない）
        check("段27-15 ★期限切れ notice(until=2020-01-01) が manager SELECT で返る（行保持）", m3.set.has(id4));
        const { data: row15 } = await admin.from("notices").select("until").eq("id", id4 ?? "").single();
        check("段27-15 ★物理確認: 期限切れ行が DB に保持（until=2020-01-01）", row15?.until === "2020-01-01", JSON.stringify(row15));

        // 27-16 ★authenticated 直書込の遮断（grant 教訓＝RPC 経由でしか書けない）
        const { error: e16i } = await mgr27.from("notices").insert(
          { org_id: s27A1.org_id, store_id: s27A1.id, title: `${P}-direct`, body: "y", audience: "all", created_by: s27UserA });
        check("段27-16 ★authenticated 直 INSERT = permission denied（RPC 経由のみ）", denied(e16i), e16i?.message ?? "書けてしまった");
        const { error: e16u } = await mgr27.from("notices").update({ pinned: true }).eq("id", id1);
        check("段27-16 ★authenticated 直 UPDATE = permission denied", denied(e16u), e16u?.message ?? "書けてしまった");
        const { error: e16d } = await mgr27.from("notices").delete().eq("id", id1);
        check("段27-16 ★authenticated 直 DELETE = permission denied", denied(e16d), e16d?.message ?? "書けてしまった");
      } finally {
        await s27Wipe();
      }
      const { data: left27 } = await admin.from("notices").select("id").like("title", `${P}%`);
      check("段27 掃除確認: notices 0行（非汚染）", (left27 ?? []).length === 0, `残 ${(left27 ?? []).length}`);
    }
  }

  // ── 段28: F3c（mig0035/0036）approvals の実挙動＋会計反映（real signIn 実測）──
  //   ★prosrc green ≠ runtime success の実践＋会計中核改修の実効果確認: 申請→承認で discount line が
  //   実生成され、改修 check_group_due により check の total が実際に割引後になることを物理確認。
  //   さらに close/pay 整合（割引後 due で close 成功）・group 別割引・cast 売上波及（(a)許容）・
  //   バック不変（discount kind は按分ループ外）を実測。認可（申請=can_register/承認=owner/manager）と
  //   grant（authenticated 直書込遮断・approval_apply 内部専用）も確認。
  //   ★汚染防止: 生成した approvals/discount line/check/専用 cast は try/finally 全消し＋残0 物理確認。
  //   ★wipe 順: approvals（line_id→check_lines・check_id→checks の RESTRICT FK 参照元）を最初に消す。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const denied = (e: { message?: string } | null) => has(e, "permission denied");

    const { data: s28Store } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    // 専用卓4面（query-or-insert・再実行で増殖させない）
    const seatOf = async (tag: string, sort: number): Promise<string> => {
      const nm = `NOX-VERIFY-段28卓${tag}`;
      const { data: ex } = await admin.from("seats").select("id").eq("store_id", s28Store!.id).eq("name", nm).limit(1);
      if (ex?.length) return ex[0].id as string;
      const { data: nw } = await admin.from("seats").insert({
        org_id: s28Store!.org_id, store_id: s28Store!.id, name: nm, kind: "卓", sort_order: sort,
      }).select("id").single();
      return nw!.id as string;
    };
    const seat1 = await seatOf("1", 9981), seat2 = await seatOf("2", 9982),
          seat3 = await seatOf("3", 9983), seat4 = await seatOf("4", 9984);
    // cast_sales 波及の isolation 用に専用 cast（他段の castA1a/b を汚染しない・集計に他伝票が混ざらない）
    const s28CastName = "NOX-VERIFY-段28-cast";
    const ensureCast = async (): Promise<string> => {
      const { data: ex } = await admin.from("casts").select("id").eq("store_id", s28Store!.id).eq("name", s28CastName).limit(1);
      if (ex?.length) return ex[0].id as string;
      const { data: nw } = await admin.from("casts").insert({
        org_id: s28Store!.org_id, store_id: s28Store!.id, name: s28CastName, is_active: true,
      }).select("id").single();
      return nw!.id as string;
    };
    const s28CastId = await ensureCast();
    // drink 商品（バック不変テスト用・price/back を実物から取得）
    const { data: drinkP } = await admin.from("products").select("id, price, back_mode, back_value")
      .eq("store_id", s28Store!.id).eq("type", "drink").eq("is_active", true).limit(1);
    const drink = drinkP?.[0];

    const seatIds = [seat1, seat2, seat3, seat4];
    const s28Wipe = async () => {
      const { data: cs } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (ids.length) {
        await admin.from("approvals").delete().in("check_id", ids);          // ★最初（FK 参照元）
        for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
          await admin.from(t).delete().in("check_id", ids);
        }
        await admin.from("checks").delete().in("id", ids);
      }
    };
    await s28Wipe();

    check("段28（準備）店・専用卓4・専用 cast・drink 商品の解決",
      !!s28Store && !!seat1 && !!seat2 && !!seat3 && !!seat4 && !!s28CastId && !!drink);

    const owner28 = await signInShared("段28", "ownerA");
    const mgr28 = await signInShared("段28", "managerA1");
    const staffOn28 = await signInShared("段28", "staffRegOnA1");
    const staffOff28 = await signInShared("段28", "staffRegOffA1");
    const cast28 = await signInShared("段28", "castA1a");
    const mgrB28 = await signInShared("段28", "managerB1");

    if (s28Store && seat1 && seat2 && seat3 && seat4 && s28CastId && drink
        && owner28 && mgr28 && staffOn28 && staffOff28 && cast28 && mgrB28) {
      // staffRegOnA1 の users.id（assert1 の requested_by 物理確認用）
      const { data: guOn } = await staffOn28.auth.getUser();
      const { data: uOn } = await admin.from("users").select("id").eq("auth_user_id", guOn?.user?.id ?? "").single();
      // custom（set）行で check を開く helper
      const openSet = async (sess: SupabaseClient, seatId: string, lines: Array<{ grp: string; name: string; price: number }>) => {
        const { data: cid } = await sess.rpc("check_open", { p_seat_id: seatId, p_people: 2, p_nom_type: "free" });
        for (const l of lines) {
          await sess.rpc("check_add_line", { p_check_id: cid, p_product_id: null, p_qty: 1, p_kind: "set", p_pay_group: l.grp, p_name: l.name, p_unit_price: l.price });
        }
        return cid as string;
      };
      const totalOf = async (cid: string) => (await admin.from("checks").select("total").eq("id", cid).single()).data?.total as number;
      const discLines = async (cid: string, grp?: string) => {
        let q = admin.from("check_lines").select("id, kind, unit_price_snapshot, line_total, pay_group, name_snapshot").eq("check_id", cid).eq("kind", "discount");
        if (grp) q = q.eq("pay_group", grp);
        return (await q).data ?? [];
      };

      try {
        // ═══ シナリオ1（卓1）: 申請フロー + 承認で discount line 生成 + total 割引後 ═══
        // 卓1: group A=10000 / group B=6000（既定 サ10%/100切捨＝due A=11000, B=6600, total=17600）
        const c1 = await openSet(mgr28, seat1, [{ grp: "A", name: "段28-A", price: 10_000 }, { grp: "B", name: "段28-B", price: 6_000 }]);
        check("段28（準備）卓1 open+2 group（total=17600）", (await totalOf(c1)) === 17_600, `total=${await totalOf(c1)}`);

        // 1 黒服 can_register 申請成功=pending・requested_by=本人・discount line なし
        const { data: ap1, error: e1 } = await staffOn28.rpc("approval_request",
          { p_check_id: c1, p_pay_group: "A", p_type: "discount", p_amount: 3_000, p_reason: "段28-1" });
        check("段28-1 黒服 can_register approval_request 成功=uuid", !e1 && typeof ap1 === "string", e1?.message);
        const { data: r1 } = await admin.from("approvals").select("status, requested_by, line_id").eq("id", ap1 ?? "").single();
        check("段28-1 物理確認: pending・requested_by=本人 users.id・line_id null・discount line なし",
          r1?.status === "pending" && r1?.requested_by === uOn?.id && r1?.line_id === null && (await discLines(c1)).length === 0,
          JSON.stringify(r1));

        // 5 free 申請=amount に group 小計焼付け（B=6000）
        const { data: ap5, error: e5 } = await staffOn28.rpc("approval_request",
          { p_check_id: c1, p_pay_group: "B", p_type: "free", p_amount: null, p_reason: null });
        const { data: r5 } = await admin.from("approvals").select("amount, type").eq("id", ap5 ?? "").single();
        check("段28-5 free 申請=amount に group 小計焼付け（6000）", !e5 && r5?.amount === 6_000 && r5?.type === "free", e5?.message ?? JSON.stringify(r5));

        // 6/7 amount 超過・no such group
        const { error: e6 } = await staffOn28.rpc("approval_request", { p_check_id: c1, p_pay_group: "A", p_type: "discount", p_amount: 99_999, p_reason: null });
        check("段28-6 amount > group 小計 = amount exceeds group total", has(e6, "amount exceeds group total"), e6?.message ?? "通ってしまった");
        const { error: e7 } = await staffOn28.rpc("approval_request", { p_check_id: c1, p_pay_group: "Z", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-7 存在しない pay_group = no such group", has(e7, "no such group"), e7?.message ?? "通ってしまった");

        // 2/3/4 申請の認可（staff can_register OFF / cast / anon）
        const { error: e2 } = await staffOff28.rpc("approval_request", { p_check_id: c1, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-2 staff can_register OFF approval_request = forbidden", forbidden(e2), e2?.message ?? "通ってしまった");
        const { error: e3 } = await cast28.rpc("approval_request", { p_check_id: c1, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-3 cast approval_request = forbidden", forbidden(e3), e3?.message ?? "通ってしまった");
        const { error: e4 } = await anon.rpc("approval_request", { p_check_id: c1, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-4 anon approval_request BLOCKED", isFnBlocked(e4), e4?.message ?? "実行できてしまった");

        // 10 ★承認=discount line 実生成 + total 割引後（ap1 の group A 3000 割引を承認）
        const before10 = await totalOf(c1);
        const { error: e10 } = await mgr28.rpc("approval_decide", { p_approval_id: ap1, p_approve: true });
        const { data: r10 } = await admin.from("approvals").select("status, line_id, decided_by").eq("id", ap1 ?? "").single();
        const dl10 = await discLines(c1, "A");
        check("段28-10a ★approval_decide(approve) 成功=approved・line_id 埋まる・decided_by",
          !e10 && r10?.status === "approved" && typeof r10?.line_id === "string" && !!r10?.decided_by, e10?.message ?? JSON.stringify(r10));
        check("段28-10b ★discount line 実生成（kind=discount・unit_price=line_total=3000・pay_group=A・name=割引（承認済））",
          dl10.length === 1 && dl10[0].unit_price_snapshot === 3_000 && dl10[0].line_total === 3_000
          && dl10[0].pay_group === "A" && dl10[0].name_snapshot === "割引（承認済）" && dl10[0].id === r10?.line_id, JSON.stringify(dl10));
        // total: A=7000→due7700, B=6600, total=14300（before 17600 − 3300＝3000割引+300サ料）
        check("段28-10c ★total が割引後に（17600→14300・差3300=割引3000+サ料300）",
          before10 === 17_600 && (await totalOf(c1)) === 14_300, `before=${before10}, after=${await totalOf(c1)}`);

        // 12 却下=line 挿入なし（ap5 free-B を reject）
        const before12 = (await discLines(c1)).length;
        const { error: e12 } = await mgr28.rpc("approval_decide", { p_approval_id: ap5, p_approve: false });
        const { data: r12 } = await admin.from("approvals").select("status, decided_by, line_id").eq("id", ap5 ?? "").single();
        check("段28-12 却下=rejected・line_id null・discount line 増えず・decided_by 埋まる",
          !e12 && r12?.status === "rejected" && r12?.line_id === null && !!r12?.decided_by && (await discLines(c1)).length === before12,
          e12?.message ?? JSON.stringify(r12));

        // 13/14 承認の認可（staff=承認不可 / cast / anon）— fresh pending を1件作る
        const { data: apX } = await staffOn28.rpc("approval_request", { p_check_id: c1, p_pay_group: "A", p_type: "discount", p_amount: 500, p_reason: null });
        const { error: e13 } = await staffOn28.rpc("approval_decide", { p_approval_id: apX, p_approve: true });
        check("段28-13 staff(黒服) approval_decide = forbidden（承認は owner/manager のみ）", forbidden(e13), e13?.message ?? "通ってしまった");
        const { error: e14c } = await cast28.rpc("approval_decide", { p_approval_id: apX, p_approve: true });
        const { error: e14a } = await anon.rpc("approval_decide", { p_approval_id: apX, p_approve: true });
        check("段28-14 cast=forbidden・anon=BLOCKED（approval_decide）", forbidden(e14c) && isFnBlocked(e14a), `${e14c?.message} | ${e14a?.message}`);

        // 15 already decided（ap1 は approved 済み）
        const { error: e15 } = await mgr28.rpc("approval_decide", { p_approval_id: ap1, p_approve: true });
        check("段28-15 decided 済みの再 decide = already decided", has(e15, "already decided"), e15?.message ?? "通ってしまった");

        // 16 他 org の approval を decide = forbidden（存在オラクル封じ）＋不在 id も forbidden
        const { error: e16b } = await mgrB28.rpc("approval_decide", { p_approval_id: apX, p_approve: true });
        const { error: e16n } = await mgr28.rpc("approval_decide", { p_approval_id: randomUUID(), p_approve: true });
        check("段28-16 他org decide=forbidden・不在id=forbidden（存在オラクル封じ）", forbidden(e16b) && forbidden(e16n), `${e16b?.message} | ${e16n?.message}`);

        // 24 authenticated 直書込遮断（RPC 経由のみ）
        const { error: e24i } = await mgr28.from("approvals").insert({ org_id: s28Store.org_id, store_id: s28Store.id, check_id: c1, pay_group: "A", type: "discount", amount: 100, requested_by: uOn?.id });
        const { error: e24u } = await mgr28.from("approvals").update({ amount: 1 }).eq("id", ap1);
        const { error: e24d } = await mgr28.from("approvals").delete().eq("id", ap1);
        check("段28-24 ★authenticated 直 INSERT/UPDATE/DELETE on approvals = permission denied",
          denied(e24i) && denied(e24u) && denied(e24d), `${e24i?.message} | ${e24u?.message} | ${e24d?.message}`);

        // 25 cast は approvals SELECT 0行（P2）
        const { data: r25, error: e25 } = await cast28.from("approvals").select("id");
        check("段28-25 cast approvals SELECT = 0行（P2・cast 0行）", !e25 && (r25 ?? []).length === 0, e25?.message ?? `got ${(r25 ?? []).length}`);

        // 26 approval_apply を authenticated 直呼び = BLOCKED（内部専用）
        const { error: e26 } = await mgr28.rpc("approval_apply", { p_approval_id: ap1 });
        check("段28-26 ★approval_apply authenticated 直呼び BLOCKED（内部専用・4ロール revoke）", isFnBlocked(e26), e26?.message ?? "実行できてしまった");

        // ═══ シナリオ2（卓2）: 直接承認 + group 別割引 + close 整合 ═══
        const c2 = await openSet(mgr28, seat2, [{ grp: "A", name: "段28-2A", price: 10_000 }, { grp: "B", name: "段28-2B", price: 6_000 }]);
        // 20 direct の検証（amount 超過・not open は request 同様に効く＝代表1件）
        const { error: e20 } = await mgr28.rpc("approval_direct", { p_check_id: c2, p_pay_group: "A", p_type: "discount", p_amount: 99_999, p_reason: null });
        check("段28-20 approval_direct でも amount 超過拒否", has(e20, "amount exceeds group total"), e20?.message ?? "通ってしまった");
        // 18 owner/manager 直接承認=approved・requested_by=decided_by=本人・discount line・total 割引後（B に 2000 割引）
        const { data: ap18, error: e18 } = await mgr28.rpc("approval_direct", { p_check_id: c2, p_pay_group: "B", p_type: "discount", p_amount: 2_000, p_reason: "段28-18" });
        const { data: r18 } = await admin.from("approvals").select("status, requested_by, decided_by, line_id").eq("id", ap18 ?? "").single();
        check("段28-18 ★approval_direct 成功=approved・requested_by=decided_by=本人・line_id 埋まる",
          !e18 && r18?.status === "approved" && r18?.requested_by === r18?.decided_by && typeof r18?.line_id === "string", e18?.message ?? JSON.stringify(r18));
        // 22 ★group 別割引: A の due 不変（11000）・B のみ割引（4400）→ total=15400
        check("段28-22 ★group 別割引: A 不変+B のみ割引 → total=15400（A due11000+B due4400）",
          (await totalOf(c2)) === 15_400 && (await discLines(c2, "A")).length === 0 && (await discLines(c2, "B")).length === 1,
          `total=${await totalOf(c2)}`);
        // 21 ★close 整合: 割引後 due で pay → close 成功（balance remaining にならない）
        const { error: ePayA } = await mgr28.rpc("check_pay", { p_check_id: c2, p_method: "cash", p_amount: 11_000, p_pay_group: "A", p_tendered: 11_000, p_idem_key: randomUUID() });
        const { error: ePayB } = await mgr28.rpc("check_pay", { p_check_id: c2, p_method: "cash", p_amount: 4_400, p_pay_group: "B", p_tendered: 4_400, p_idem_key: randomUUID() });
        const { data: closed2, error: eClose2 } = await mgr28.rpc("check_close", { p_check_id: c2, p_idem_key: randomUUID() });
        check("段28-21 ★discount 反映後 close 整合: 割引後 due(A11000+B4400) で pay→close 成功",
          !ePayA && !ePayB && !eClose2 && closed2 === c2, `${ePayA?.message} | ${ePayB?.message} | ${eClose2?.message}`);

        // ═══ シナリオ3（卓3）: free→group due 0 + cast 売上波及 + バック不変 ═══
        const P = drink.price as number, BV = drink.back_value as number, D = P - 1_000; // v_net=1000→due=1100
        const { data: c3 } = await mgr28.rpc("check_open", { p_seat_id: seat3, p_people: 1, p_nom_type: "jonai" });
        await mgr28.rpc("check_add_line", { p_check_id: c3, p_product_id: drink.id, p_qty: 1, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
        await mgr28.rpc("check_set_nominations", { p_check_id: c3, p_nom_type: "jonai", p_nominations: [{ cast_id: s28CastId, weight: 1 }] });
        // 直接 discount D（v_net=1000・due=1100）→ close → backs/cast_sales 確認
        const { error: e3d } = await mgr28.rpc("approval_direct", { p_check_id: c3 as string, p_pay_group: "A", p_type: "discount", p_amount: D, p_reason: null });
        check("段28（準備）卓3 drink+cast+discount direct 成功", !e3d, e3d?.message);
        const { error: ePay3 } = await mgr28.rpc("check_pay", { p_check_id: c3, p_method: "cash", p_amount: 1_100, p_pay_group: "A", p_tendered: 1_100, p_idem_key: randomUUID() });
        const { data: closed3, error: eClose3 } = await mgr28.rpc("check_close", { p_check_id: c3, p_idem_key: randomUUID() });
        check("段28-21b 割引後 due=1100 で pay→close 成功（drink 伝票）", !ePay3 && !eClose3 && closed3 === c3, `${ePay3?.message} | ${eClose3?.message}`);
        // 23a ★バック不変: discount kind は按分ループ外＝drink_back は割引の影響なし（= round(price*back/100)・専用 cast）
        const { data: backs } = await admin.from("check_cast_backs").select("drink_back").eq("check_id", c3 as string).eq("cast_id", s28CastId).single();
        const expDrinkBack = drink.back_mode === "rate" ? Math.round((P * BV) / 100) : (backs?.drink_back as number);
        check("段28-23a ★バック不変: drink_back=割引非依存（round(price*back/100)・discount kind は按分ループ外）",
          backs?.drink_back === expDrinkBack && (backs?.drink_back ?? 0) > 0, `drink_back=${backs?.drink_back}, exp=${expDrinkBack}`);
        // 23b ★cast 売上波及（(a)許容）: 専用 cast の get_cast_sales が割引後 due=1100（他伝票なし=isolation）
        // get_cast_sales は range ≤ 92日制約＝今営業日を含む46日窓（専用 cast は c3 のみ＝集計に混ざらない）
        const jst28 = new Date(Date.now() + 9 * 3600_000);
        const isoD28 = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const s28From = isoD28(new Date(jst28.getTime() - 45 * 86400_000));
        const s28To = isoD28(new Date(jst28.getTime() + 1 * 86400_000));
        const { data: cs, error: eCs } = await mgr28.rpc("get_cast_sales", { p_store_id: s28Store.id, p_from: s28From, p_to: s28To });
        const s28Row = (cs ?? []).filter((r: { cast_id: string }) => r.cast_id === s28CastId);
        const s28Sales = s28Row.reduce((a: number, r: { sales: number }) => a + r.sales, 0);
        check("段28-23b ★cast 売上波及=割引後（専用 cast の get_cast_sales sales=割引後 due 1100）",
          !eCs && s28Sales === 1_100, eCs?.message ?? `sales=${s28Sales}`);

        // ═══ シナリオ4（卓4）: 競合(not applicable) + not open + no group total + direct 認可 ═══
        const c4 = await openSet(mgr28, seat4, [{ grp: "A", name: "段28-4A", price: 5_000 }]);
        // 19 direct の認可（staff/cast/anon）
        const { error: e19s } = await staffOn28.rpc("approval_direct", { p_check_id: c4, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        const { error: e19c } = await cast28.rpc("approval_direct", { p_check_id: c4, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        const { error: e19a } = await anon.rpc("approval_direct", { p_check_id: c4, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-19 approval_direct: staff/cast=forbidden・anon=BLOCKED",
          forbidden(e19s) && forbidden(e19c) && isFnBlocked(e19a), `${e19s?.message} | ${e19c?.message} | ${e19a?.message}`);
        // 9 no group total: group 'X' に discount line だけを service 挿入（通常明細なし）→ 申請=no group total
        await admin.from("check_lines").insert({
          org_id: s28Store.org_id, store_id: s28Store.id, check_id: c4, product_id: null, kind: "discount",
          pay_group: "X", name_snapshot: "段28-孤立割引", unit_price_snapshot: 500, qty: 1, line_total: 500, back_snapshot: null, sort_order: 900,
        });
        const { error: e9 } = await mgr28.rpc("approval_direct", { p_check_id: c4, p_pay_group: "X", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-9 通常明細ゼロ（discount のみ）の group = no group total", has(e9, "no group total"), e9?.message ?? "通ってしまった");
        // 17 ★競合: pending 申請 → check を void → decide(approve) = not applicable
        const { data: ap17 } = await mgr28.rpc("approval_request", { p_check_id: c4, p_pay_group: "A", p_type: "discount", p_amount: 500, p_reason: null });
        await mgr28.rpc("check_void", { p_check_id: c4, p_reason: "段28-17 競合" });
        const { error: e17 } = await mgr28.rpc("approval_decide", { p_approval_id: ap17, p_approve: true });
        const { data: r17 } = await admin.from("approvals").select("status").eq("id", ap17 ?? "").single();
        check("段28-17 ★競合: void 後の approve = not applicable・approval は pending 維持",
          has(e17, "not applicable") && r17?.status === "pending", e17?.message ?? `status=${r17?.status}`);
        // 8 not open: void 済み check への申請 = not open
        const { error: e8 } = await mgr28.rpc("approval_request", { p_check_id: c4, p_pay_group: "A", p_type: "discount", p_amount: 100, p_reason: null });
        check("段28-8 closed/void の check への申請 = not open", has(e8, "not open"), e8?.message ?? "通ってしまった");
        // 11 free→group due 0: void 済み卓4 に新規 open（open 1枚制約は void をカウント外）→ free 全額割引 → total=0
        const c11 = await openSet(mgr28, seat4, [{ grp: "A", name: "段28-11A", price: 4_000 }]);
        const { error: e11 } = await mgr28.rpc("approval_direct", { p_check_id: c11, p_pay_group: "A", p_type: "free", p_amount: null, p_reason: null });
        check("段28-11 ★free 承認=group 全額割引で group due 0（total=0・v_net=0）",
          !e11 && (await totalOf(c11)) === 0 && (await discLines(c11, "A")).length === 1, e11?.message ?? `total=${await totalOf(c11)}`);
      } finally {
        await s28Wipe();
        // 専用 cast は参照（nominations/backs）除去後に削除
        await admin.from("casts").delete().eq("id", s28CastId);
      }
      const { data: chkLeft } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const { data: castLeft } = await admin.from("casts").select("id").eq("id", s28CastId);
      check("段28 掃除確認: check/専用cast 0行（approvals は check の FK 連動で消去済・非汚染）",
        (chkLeft ?? []).length === 0 && (castLeft ?? []).length === 0,
        `chk=${(chkLeft ?? []).length}, cast=${(castLeft ?? []).length}`);
    }
  }

  // ── 段29: F3f（mig0037＋mig0047）drink_claims の実挙動＋★承認焼付けが check_close の drink_back と同値（real signIn）──
  //   ★核心（assert 10）: 同 product・同 nom_type・同 qty で drink_claim_decide の back_amount が
  //   check_close の check_cast_backs.drink_back / champ_back と一致＝「申告バックが既存会計バックと同一計算規則」。
  //   drink（rate: round(price*back_value/100)）と champ（unit4: unit4_json[nom_type]）両モードで実測。
  //   ★mig0047（裁定 2026-07-17）で void×claim の非対称2件を修正＝18 系を差し替え:
  //     18a void で pending は自動 reject（decided_by=void 実行者）／18b audit before に pending_claims／
  //     18c void 済み check への decide は 'check voided'（approve/reject 両方向・人工 pending 復元で実測）／
  //     18e approved は残置（給与除外は collect の void フィルタが単一責任点）／
  //     24 collect 実関数を差分方式で通し「void 除外」と「close 非依存の維持（open は乗る）」を同時に押さえる。
  //     ※旧 assert「18 void 済み check の申告承認も可（mig0037 裁定3）」は 0047 が塞いだため廃止。
  //   ★mig0048（申告導線）: 25 cast_open_checks＝cast セルフ専用の最小開示 RPC。
  //     25a 自店 open が返る＋★返却キー4つのみ（金額/明細/客/指名が構造的に不在）／25b 他店非混入／
  //     25c closed・void は返らない／25d owner/manager/staff(can_register=true) は no cast for caller・anon BLOCKED。
  //     ACL は grants G23。この段の fixture（open2/closed2/void2/他店 open1）がそのまま a〜c の実測材料。
  //   ★汚染防止: 生成 drink_claims/check/check_cast_backs は try/finally 全消し＋残0。
  //   wipe 順: drink_claims（check_id/cast_id FK 参照元）を最初に消す。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const denied = (e: { message?: string } | null) => has(e, "permission denied");

    const { data: s29Store } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: s29A2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();
    const { data: s29Casts } = await admin.from("casts").select("id, name").eq("store_id", s29Store?.id ?? "")
      .in("name", [FIXTURE_USERS.castA1a.name, FIXTURE_USERS.castA1b.name]);
    const s29CastA = s29Casts?.find((c) => c.name === FIXTURE_USERS.castA1a.name)?.id as string;
    const s29CastB = s29Casts?.find((c) => c.name === FIXTURE_USERS.castA1b.name)?.id as string;
    const { data: s29Prods } = await admin.from("products").select("id, type, price, back_mode, back_value, unit4_json")
      .eq("store_id", s29Store?.id ?? "").in("type", ["drink", "champ"]).eq("is_active", true);
    const drinkP = s29Prods?.find((p) => p.type === "drink" && p.back_mode === "rate");
    const champP = s29Prods?.find((p) => p.type === "champ" && p.back_mode === "unit4");

    const seatOf29 = async (tag: string, sort: number, storeRow: { id: string; org_id: string }): Promise<string> => {
      const nm = `NOX-VERIFY-段29卓${tag}`;
      const { data: ex } = await admin.from("seats").select("id").eq("store_id", storeRow.id).eq("name", nm).limit(1);
      if (ex?.length) return ex[0].id as string;
      const { data: nw } = await admin.from("seats").insert({ org_id: storeRow.org_id, store_id: storeRow.id, name: nm, kind: "卓", sort_order: sort }).select("id").single();
      return nw!.id as string;
    };
    const seat1 = await seatOf29("1", 9971, s29Store!), seat2 = await seatOf29("2", 9972, s29Store!),
          seat3 = await seatOf29("3", 9973, s29Store!), seat4 = await seatOf29("4", 9974, s29Store!),
          seatA2 = s29A2 ? await seatOf29("A2", 9975, s29A2) : "";
    const seatIds = [seat1, seat2, seat3, seat4, seatA2].filter(Boolean);

    const s29Wipe = async () => {
      const { data: cs } = await admin.from("checks").select("id").in("seat_id", seatIds);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (ids.length) {
        await admin.from("drink_claims").delete().in("check_id", ids);      // ★最初（check_id/cast_id FK 参照元）
        for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
          await admin.from(t).delete().in("check_id", ids);
        }
        await admin.from("checks").delete().in("id", ids);
      }
    };
    await s29Wipe();

    check("段29（準備）店2・cast2・drink(rate)/champ(unit4) 商品・専用卓の解決",
      !!s29Store && !!s29A2 && !!s29CastA && !!s29CastB && !!drinkP && !!champP && !!seat1 && !!seatA2);

    const owner29 = await signInShared("段29", "ownerA");
    const mgr29 = await signInShared("段29", "managerA1");
    const staffOn29 = await signInShared("段29", "staffRegOnA1");
    const staffOff29 = await signInShared("段29", "staffRegOffA1");
    const castA29 = await signInShared("段29", "castA1a");
    const castB29 = await signInShared("段29", "castA1b");
    const mgrB29 = await signInShared("段29", "managerB1");

    if (s29Store && s29A2 && s29CastA && s29CastB && drinkP && champP && seat1 && seatA2
        && owner29 && mgr29 && staffOn29 && staffOff29 && castA29 && castB29 && mgrB29) {
      const { data: guCa } = await castA29.auth.getUser();
      const { data: uCa } = await admin.from("users").select("id").eq("auth_user_id", guCa?.user?.id ?? "").single();
      // A2 の open check（assert6 他店 check 用・service 生成）
      const { data: a2Chk } = await admin.from("checks").insert({
        org_id: s29A2.org_id, store_id: s29A2.id, seat_id: seatA2, status: "open", nom_type: "free",
        people: 1, service_rate: 10, round_unit: 100, round_mode: "down", created_by: uCa?.id,
      }).select("id").single();
      // 期待バック（承認焼付け＝check_close と同一規則）
      const drinkUnit = Math.round((drinkP.price * drinkP.back_value) / 100);           // rate
      const champUnitHon = ((champP.unit4_json as Record<string, number>).hon) as number; // unit4[hon]

      // 会計フロー helper
      const openNom = async (seatId: string, nom: string, castId: string) => {
        const { data: cid } = await mgr29.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: nom });
        await mgr29.rpc("check_set_nominations", { p_check_id: cid, p_nom_type: nom, p_nominations: [{ cast_id: castId, weight: 1 }] });
        return cid as string;
      };

      try {
        // 卓1: 申告フロー用の open check（nom hon・castA を指名）
        const c1 = await openNom(seat1, "hon", s29CastA);

        // 1 ★cast セルフ申告成功＝pending・cast_id自己・requested_by=本人・back_amount=0（実 INSERT 完走）
        const { data: cl1, error: e1 } = await castA29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 2 });
        check("段29-1 ★cast drink_claim_submit 成功=uuid", !e1 && typeof cl1 === "string", e1?.message);
        const { data: r1 } = await admin.from("drink_claims").select("status, cast_id, requested_by, back_amount, qty").eq("id", cl1 ?? "").single();
        check("段29-1 物理確認: pending・cast_id=自己・requested_by=本人・back_amount=0・qty=2",
          r1?.status === "pending" && r1?.cast_id === s29CastA && r1?.requested_by === uCa?.id && r1?.back_amount === 0 && r1?.qty === 2, JSON.stringify(r1));

        // 2 非 cast（owner/mgr/staff）= no cast for caller
        const nc = (e: { message?: string } | null) => has(e, "no cast for caller");
        const { error: e2o } = await owner29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        const { error: e2m } = await mgr29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        const { error: e2s } = await staffOn29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        check("段29-2 非 cast(owner/manager/staff) submit = no cast for caller", nc(e2o) && nc(e2m) && nc(e2s), `${e2o?.message}|${e2m?.message}|${e2s?.message}`);

        // 3 anon BLOCKED
        const { error: e3 } = await anon.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        check("段29-3 anon drink_claim_submit BLOCKED", isFnBlocked(e3), e3?.message ?? "実行できてしまった");

        // 5 bad product（不在 product uuid）／7 bad qty
        const { error: e5 } = await castA29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: randomUUID(), p_qty: 1 });
        check("段29-5 type が drink/champ 以外(不在) = bad product", has(e5, "bad product"), e5?.message ?? "通ってしまった");
        const { error: e7 } = await castA29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 0 });
        check("段29-7 qty<=0 = bad qty", has(e7, "bad qty"), e7?.message ?? "通ってしまった");

        // 6 他店 check への申告 = forbidden（castA は A1・check は A2）
        const { error: e6 } = await castA29.rpc("drink_claim_submit", { p_check_id: a2Chk?.id, p_product_id: drinkP.id, p_qty: 1 });
        check("段29-6 他店 check への申告 = forbidden（自店 check のみ）", forbidden(e6), e6?.message ?? "通ってしまった");

        // 8 ★非指名 cast も申告可（castB は c1 の指名でない・A1・open → 成功）
        const { data: cl8, error: e8 } = await castB29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        check("段29-8 ★非指名 cast も申告可（指名有無問わず自店なら OK）", !e8 && typeof cl8 === "string", e8?.message);

        // 9 黒服 can_register 承認成功＝approved・decided_by・back_amount 焼付け
        const { error: e9 } = await staffOn29.rpc("drink_claim_decide", { p_claim_id: cl1, p_approve: true });
        const { data: r9 } = await admin.from("drink_claims").select("status, decided_by, back_amount").eq("id", cl1 ?? "").single();
        check("段29-9 ★黒服 can_register 承認=approved・decided_by・back_amount 焼付け（drink rate: 750×2=1500）",
          !e9 && r9?.status === "approved" && !!r9?.decided_by && r9?.back_amount === drinkUnit * 2, e9?.message ?? JSON.stringify(r9));

        // 10 ★★check_close 同値（drink rate）: 同 product/nom/qty で close の drink_back == 申告 back_amount
        const cD = await openNom(seat2, "hon", s29CastA);
        const { data: clD } = await castA29.rpc("drink_claim_submit", { p_check_id: cD, p_product_id: drinkP.id, p_qty: 2 });
        await mgr29.rpc("drink_claim_decide", { p_claim_id: clD, p_approve: true });
        const { data: rD } = await admin.from("drink_claims").select("back_amount").eq("id", clD ?? "").single();
        await mgr29.rpc("check_add_line", { p_check_id: cD, p_product_id: drinkP.id, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
        // pay+close（drink 2杯 price1500×2=3000 → +サ10% → 3300）
        await mgr29.rpc("check_pay", { p_check_id: cD, p_method: "cash", p_amount: 3_300, p_pay_group: "A", p_tendered: 3_300, p_idem_key: randomUUID() });
        await mgr29.rpc("check_close", { p_check_id: cD, p_idem_key: randomUUID() });
        const { data: backD } = await admin.from("check_cast_backs").select("drink_back").eq("check_id", cD).eq("cast_id", s29CastA).single();
        check("段29-10 ★★check_close 同値（drink/rate）: 申告 back_amount == close drink_back == 750×2=1500",
          rD?.back_amount === drinkUnit * 2 && backD?.drink_back === drinkUnit * 2 && rD?.back_amount === backD?.drink_back,
          `claim=${rD?.back_amount}, close=${backD?.drink_back}, exp=${drinkUnit * 2}`);

        // 10b ★★check_close 同値（champ unit4・nom hon）: 申告 back_amount == close champ_back == unit4[hon]×2
        const cC = await openNom(seat3, "hon", s29CastA);
        const { data: clC } = await castA29.rpc("drink_claim_submit", { p_check_id: cC, p_product_id: champP.id, p_qty: 2 });
        await mgr29.rpc("drink_claim_decide", { p_claim_id: clC, p_approve: true });
        const { data: rC } = await admin.from("drink_claims").select("back_amount").eq("id", clC ?? "").single();
        await mgr29.rpc("check_add_line", { p_check_id: cC, p_product_id: champP.id, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
        // champ price30000×2=60000 → +サ10% → 66000
        await mgr29.rpc("check_pay", { p_check_id: cC, p_method: "cash", p_amount: 66_000, p_pay_group: "A", p_tendered: 66_000, p_idem_key: randomUUID() });
        await mgr29.rpc("check_close", { p_check_id: cC, p_idem_key: randomUUID() });
        const { data: backC } = await admin.from("check_cast_backs").select("champ_back").eq("check_id", cC).eq("cast_id", s29CastA).single();
        check("段29-10b ★★check_close 同値（champ/unit4 hon）: 申告 back_amount == close champ_back == unit4[hon]×2",
          rC?.back_amount === champUnitHon * 2 && backC?.champ_back === champUnitHon * 2 && rC?.back_amount === backC?.champ_back,
          `claim=${rC?.back_amount}, close=${backC?.champ_back}, exp=${champUnitHon * 2}`);

        // 11 杯数修正（p_qty_override）: qty 上書き＋back_amount=unit×override
        const { data: cl11 } = await castA29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 5 });
        await mgr29.rpc("drink_claim_decide", { p_claim_id: cl11, p_approve: true, p_qty_override: 3 });
        const { data: r11 } = await admin.from("drink_claims").select("qty, back_amount, status").eq("id", cl11 ?? "").single();
        check("段29-11 杯数修正: qty=3 上書き・back_amount=750×3=2250・approved",
          r11?.qty === 3 && r11?.back_amount === drinkUnit * 3 && r11?.status === "approved", JSON.stringify(r11));

        // 12 却下: rejected・back_amount 0・decided_by
        const { data: cl12 } = await castA29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        const { error: e12 } = await mgr29.rpc("drink_claim_decide", { p_claim_id: cl12, p_approve: false });
        const { data: r12 } = await admin.from("drink_claims").select("status, back_amount, decided_by").eq("id", cl12 ?? "").single();
        check("段29-12 却下=rejected・back_amount=0・decided_by", !e12 && r12?.status === "rejected" && r12?.back_amount === 0 && !!r12?.decided_by, JSON.stringify(r12));

        // 13/14/15 decide 認可（cast・staff can_register OFF・anon）— fresh pending
        const { data: clX } = await castA29.rpc("drink_claim_submit", { p_check_id: c1, p_product_id: drinkP.id, p_qty: 1 });
        const { error: e13 } = await castA29.rpc("drink_claim_decide", { p_claim_id: clX, p_approve: true });
        const { error: e14 } = await staffOff29.rpc("drink_claim_decide", { p_claim_id: clX, p_approve: true });
        const { error: e15 } = await anon.rpc("drink_claim_decide", { p_claim_id: clX, p_approve: true });
        check("段29-13/14/15 decide 認可: cast=forbidden・staff can_register OFF=forbidden・anon=BLOCKED",
          forbidden(e13) && forbidden(e14) && isFnBlocked(e15), `${e13?.message}|${e14?.message}|${e15?.message}`);

        // 16 already decided（cl1 は approved 済）
        const { error: e16 } = await mgr29.rpc("drink_claim_decide", { p_claim_id: cl1, p_approve: true });
        check("段29-16 decided 済みの再 decide = already decided", has(e16, "already decided"), e16?.message ?? "通ってしまった");

        // 17 他org decide=forbidden・不在id=forbidden（存在オラクル封じ）
        const { error: e17b } = await mgrB29.rpc("drink_claim_decide", { p_claim_id: clX, p_approve: true });
        const { error: e17n } = await mgr29.rpc("drink_claim_decide", { p_claim_id: randomUUID(), p_approve: true });
        check("段29-17 他org decide=forbidden・不在id=forbidden（存在オラクル封じ）", forbidden(e17b) && forbidden(e17n), `${e17b?.message}|${e17n?.message}`);

        // ══════════════════════════════════════════════════════════════
        // 18（0047 で裁定変更）: ★void 時 pending は自動 reject・void 伝票への事後 decide は封じる
        //   旧 assert「void 済み check の申告承認も可（mig0037 裁定3）」は mig0047 が
        //   バグとして塞いだため差し替え（0047 冒頭コメント: (1) decide が check status を見ない /
        //   (2) check_void が drink_claims を触らず pending 宙吊り）。approved の残置は維持（下記 18e）。
        // ══════════════════════════════════════════════════════════════
        const c4 = await openNom(seat4, "hon", s29CastA);
        const { data: cl18 } = await castA29.rpc("drink_claim_submit", { p_check_id: c4, p_product_id: drinkP.id, p_qty: 2 });
        // 18e 準備: 同一 check に approved も1件作る（void 後の残置確認用）
        const { data: cl18ok } = await castA29.rpc("drink_claim_submit", { p_check_id: c4, p_product_id: drinkP.id, p_qty: 1 });
        await mgr29.rpc("drink_claim_decide", { p_claim_id: cl18ok, p_approve: true });
        const { data: r18okBefore } = await admin.from("drink_claims").select("status, back_amount").eq("id", cl18ok ?? "").single();

        const { error: eV18 } = await mgr29.rpc("check_void", { p_check_id: c4, p_reason: "段29-18 競合" });
        check("段29-18 check_void 成功（pending 残置ありの伝票）", !eV18, eV18?.message);

        // 18a ★void→pending の自動 reject（decided_by=void 実行者・decided_at 記録）
        const { data: uMgr29 } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
        const { data: r18 } = await admin.from("drink_claims")
          .select("status, back_amount, decided_by, decided_at").eq("id", cl18 ?? "").single();
        check("段29-18a ★void で pending claim が自動 reject（decided_by=void 実行者・decided_at 記録・back_amount 0 のまま）",
          r18?.status === "rejected" && r18?.decided_by === uMgr29?.id && !!r18?.decided_at && r18?.back_amount === 0,
          JSON.stringify(r18));

        // 18e ★approved は void 後も残置（給与除外は collect の void フィルタが単一責任点＝0047 裁定）
        const { data: r18ok } = await admin.from("drink_claims").select("status, back_amount").eq("id", cl18ok ?? "").single();
        check("段29-18e ★void 後も approved claim は approved のまま残置（back_amount 不変）",
          r18ok?.status === "approved" && r18ok?.back_amount === drinkUnit * 1
          && r18ok?.back_amount === r18okBefore?.back_amount, JSON.stringify(r18ok));

        // 18b ★check_void の audit before に pending_claims 配列が入る（cast_backs と同型の監査痕跡）
        const { data: aud18 } = await owner29.from("audit_logs").select("before_json")
          .eq("action", "check_void").eq("target", `checks:${c4}`).limit(1);
        const before18 = (aud18 ?? [])[0]?.before_json as Record<string, unknown> | undefined;
        const pc18 = (before18?.pending_claims ?? []) as Record<string, unknown>[];
        check("段29-18b ★check_void audit before に pending_claims（自動 reject 対象の申告）が含まれる",
          (aud18 ?? []).length === 1 && Array.isArray(pc18) && pc18.length === 1
          && pc18[0]?.id === cl18 && pc18[0]?.status === "pending",
          JSON.stringify(before18?.pending_claims));
        check("段29-18b' audit before に cast_backs も従来どおり同居（既存の監査痕跡を壊していない）",
          Array.isArray(before18?.cast_backs), JSON.stringify(Object.keys(before18 ?? {})));

        // 18c ★void 済み check への decide は 'check voided'
        //   自動 reject 済み＝自然には pending が残らないため、service_role で pending へ人工復元して
        //   ガード本体（decide の check status 判定）に到達させる（掃除は s29Wipe が担う）。
        await admin.from("drink_claims").update({ status: "pending", decided_by: null, decided_at: null }).eq("id", cl18 ?? "");
        const { error: e18c } = await mgr29.rpc("drink_claim_decide", { p_claim_id: cl18, p_approve: true });
        check("段29-18c ★void 済み check の pending への decide = check voided（事後承認を封じる）",
          has(e18c, "check voided"), e18c?.message ?? "通ってしまった");
        const { error: e18cRej } = await mgr29.rpc("drink_claim_decide", { p_claim_id: cl18, p_approve: false });
        check("段29-18c' 却下も同様に check voided（approve/reject 両方向を封じる）",
          has(e18cRej, "check voided"), e18cRej?.message ?? "通ってしまった");
        // 復元（人工 pending を元の rejected へ戻す＝以降の assert/掃除の前提を汚さない）
        await admin.from("drink_claims").update({ status: "rejected", decided_by: uMgr29?.id, decided_at: new Date().toISOString() }).eq("id", cl18 ?? "");

        // 4 void 済み check への新規申告 = not open
        const { error: e4 } = await castA29.rpc("drink_claim_submit", { p_check_id: c4, p_product_id: drinkP.id, p_qty: 1 });
        check("段29-4 closed/void の check への申告 = not open", has(e4, "not open"), e4?.message ?? "通ってしまった");

        // 19 cast は自分の申告のみ可視（castB の申告は castA から見えない）
        const { data: aView } = await castA29.from("drink_claims").select("id, cast_id");
        const aSet = new Set((aView ?? []).map((r) => r.cast_id));
        check("段29-19 cast SELECT = 自分の申告のみ（他 cast 不可視・P1 変形）",
          aSet.size === 1 && aSet.has(s29CastA) && !aSet.has(s29CastB), `casts=${[...aSet].join(",")}`);

        // 20 黒服 can_register は自店の全 drink_claims 可視（castA/castB 両方）
        const { data: sView } = await staffOn29.from("drink_claims").select("cast_id");
        const sSet = new Set((sView ?? []).map((r) => r.cast_id));
        check("段29-20 staff can_register SELECT = 自店の全申告（castA/castB 両方可視）",
          sSet.has(s29CastA) && sSet.has(s29CastB), `casts=${[...sSet].join(",")}`);

        // 21 staff can_register OFF は 0行
        const { data: offView } = await staffOff29.from("drink_claims").select("id");
        check("段29-21 staff can_register OFF SELECT = 0行（cast でも can_register でもない）", (offView ?? []).length === 0, `got ${(offView ?? []).length}`);

        // 22 ★authenticated 直書込遮断
        const { error: e22i } = await mgr29.from("drink_claims").insert({ org_id: s29Store.org_id, store_id: s29Store.id, check_id: c1, cast_id: s29CastA, product_id: drinkP.id, qty: 1, requested_by: uCa?.id });
        const { error: e22u } = await mgr29.from("drink_claims").update({ back_amount: 1 }).eq("id", cl1);
        const { error: e22d } = await mgr29.from("drink_claims").delete().eq("id", cl1);
        check("段29-22 ★authenticated 直 INSERT/UPDATE/DELETE on drink_claims = permission denied",
          denied(e22i) && denied(e22u) && denied(e22d), `${e22i?.message}|${e22u?.message}|${e22d?.message}`);

        // 23 payroll 合流素地: 承認済 drink_claims（back_amount>0）が cast 別に集計可能（collect.ts が読む形）
        const { data: approved } = await admin.from("drink_claims").select("cast_id, back_amount").eq("status", "approved").eq("cast_id", s29CastA).gt("back_amount", 0);
        check("段29-23 payroll 合流素地: 承認済 drink_claims(back_amount>0) を cast 別に集計可能",
          (approved ?? []).length >= 1 && (approved ?? []).every((r) => (r.back_amount as number) > 0), `rows=${(approved ?? []).length}`);

        // ══════════════════════════════════════════════════════════════
        // 24（0047d）★collect の void フィルタを実関数で実測（クエリ写経では乖離を検知できない）。
        //   差分方式: baseline 採取 → open 伝票に approved（乗るべき）＋void 伝票に approved（乗らないべき）を
        //   足して再集計 → delta が open 分ちょうどであることを assert。
        //   これで「void 除外」と「close 非依存の維持（open が乗る）」を1発で押さえる。
        //   ※他 fixture の drink バックが同期間に居ても差分なら決定的。
        // ══════════════════════════════════════════════════════════════
        {
          const now = new Date();
          const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const win = await resolvePayrollWindow(admin, s29Store.id, period);
          const drinkOf = async (): Promise<number> => {
            const res = await collectPeriod(admin, mgr29, s29Store.id, win);
            return res.casts.find((c) => c.castId === s29CastA)?.productBack.drink ?? 0;
          };
          const base = await drinkOf();

          // open 伝票（close しない＝close 非依存の維持を見る）に approved 1杯
          const cOpen24 = await openNom(seat2, "hon", s29CastA);
          const { data: clOpen24 } = await castA29.rpc("drink_claim_submit", { p_check_id: cOpen24, p_product_id: drinkP.id, p_qty: 1 });
          await mgr29.rpc("drink_claim_decide", { p_claim_id: clOpen24, p_approve: true });

          // void 伝票に approved 3杯（void 前に承認しておく＝approved は残置される）
          const cVoid24 = await openNom(seat3, "hon", s29CastA);
          const { data: clVoid24 } = await castA29.rpc("drink_claim_submit", { p_check_id: cVoid24, p_product_id: drinkP.id, p_qty: 3 });
          await mgr29.rpc("drink_claim_decide", { p_claim_id: clVoid24, p_approve: true });
          await mgr29.rpc("check_void", { p_check_id: cVoid24, p_reason: "段29-24 void 除外の実測" });
          const { data: rVoid24 } = await admin.from("drink_claims").select("status, back_amount").eq("id", clVoid24 ?? "").single();
          check("段29-24（準備）void 伝票の claim は approved 残置・back_amount=単価×3",
            rVoid24?.status === "approved" && rVoid24?.back_amount === drinkUnit * 3, JSON.stringify(rVoid24));

          const after = await drinkOf();
          check("段29-24 ★collect 実測: delta = open 伝票の承認済のみ（void 伝票の approved は乗らない・close 非依存は維持）",
            after - base === drinkUnit * 1,
            `base=${base} after=${after} delta=${after - base} / open期待=${drinkUnit * 1} / void分(乗ってはいけない)=${drinkUnit * 3}`);

          // ══════════════════════════════════════════════════════════════
          // 25（0048）★cast_open_checks: 申告先を選ぶための最小開示 RPC。
          //   この時点の 段29 fixture が a〜c の理想形:
          //     自店 A1 open   = c1(seat1) / cOpen24(seat2)      → 返るべき
          //     自店 A1 closed = cD(seat2) / cC(seat3)           → 返らない
          //     自店 A1 void   = c4(seat4) / cVoid24(seat3)      → 返らない
          //     他店 A2 open   = a2Chk                            → 返らない（店スコープ）
          //   ※他段の残伝票が混じり得るため exact 一致ではなく包含/非包含で assert（決定的）。
          // ══════════════════════════════════════════════════════════════
          type OpenRow = { check_id: string; seat_name: string; seat_kind: string | null; started_at: string };
          const { data: ocRaw, error: eOc } = await castA29.rpc("cast_open_checks");
          const oc = (ocRaw ?? []) as OpenRow[];
          const ids25 = new Set(oc.map((r) => r.check_id));

          // 25a 正系: 自店 open が {check_id, seat_name, seat_kind, started_at} で返る
          check("段29-25a ★cast cast_open_checks 正系: 自店 open 伝票が返る（c1・cOpen24 を含む）",
            !eOc && ids25.has(c1) && ids25.has(cOpen24), eOc?.message ?? `ids=${[...ids25].length}件`);
          const row25 = oc.find((r) => r.check_id === c1);
          check("段29-25a' 返却行の形: seat_name 実値・started_at 実値（seat_id NOT NULL＝席名は必ず在る）",
            !!row25 && typeof row25.seat_name === "string" && row25.seat_name.length > 0 && !!row25.started_at,
            JSON.stringify(row25));
          // ★最小開示の構造的証明: 返却キーが4つだけ＝金額/明細/客/指名は列として存在しない
          const keys25 = Object.keys(row25 ?? {}).sort();
          check("段29-25a'' ★返却列に金額系が構造的に不在（キーは check_id/seat_kind/seat_name/started_at の4つのみ）",
            JSON.stringify(keys25) === JSON.stringify(["check_id", "seat_kind", "seat_name", "started_at"]),
            JSON.stringify(keys25));

          // 25b 他店/他 org 非混入
          check("段29-25b ★他店（A2）の open 伝票が混入しない（店スコープ）", !ids25.has(a2Chk?.id as string), `a2Chk=${a2Chk?.id}`);
          const { data: ocB } = await castB29.rpc("cast_open_checks");
          check("段29-25b' 他 org は構造的に不可（castB=同店のため件数一致＝org/店スコープの対照）",
            ((ocB ?? []) as OpenRow[]).every((r) => ids25.has(r.check_id)), `castB=${((ocB ?? []) as OpenRow[]).length}件`);

          // 25c closed/void は返らない
          check("段29-25c ★closed 伝票は返らない（cD・cC）", !ids25.has(cD) && !ids25.has(cC), `cD=${ids25.has(cD)} cC=${ids25.has(cC)}`);
          check("段29-25c' ★void 伝票は返らない（c4・cVoid24）", !ids25.has(c4) && !ids25.has(cVoid24), `c4=${ids25.has(c4)} cVoid24=${ids25.has(cVoid24)}`);

          // 25d 負系: 非 cast は全て 'no cast for caller'（staff は can_register=true でも不可＝cast セルフ専用）
          const { error: eO25 } = await owner29.rpc("cast_open_checks");
          const { error: eM25 } = await mgr29.rpc("cast_open_checks");
          const { error: eS25 } = await staffOn29.rpc("cast_open_checks");
          check("段29-25d ★owner/manager/staff(can_register=true) = no cast for caller（cast セルフ専用）",
            has(eO25, "no cast for caller") && has(eM25, "no cast for caller") && has(eS25, "no cast for caller"),
            `owner="${eO25?.message}" mgr="${eM25?.message}" staffOn="${eS25?.message}"`);
          const { error: eA25 } = await anon.rpc("cast_open_checks");
          check("段29-25d' anon cast_open_checks BLOCKED", isFnBlocked(eA25), eA25?.message ?? "実行できてしまった");
        }
      } finally {
        await admin.from("checks").delete().eq("id", a2Chk?.id ?? "");   // A2 check（seatIds 経由でも消えるが明示）
        await s29Wipe();
      }
      const { data: dcLeft } = await admin.from("drink_claims").select("id").in("cast_id", [s29CastA, s29CastB]);
      const { data: chkLeft } = await admin.from("checks").select("id").in("seat_id", seatIds);
      check("段29 掃除確認: drink_claims/check 0行（非汚染）",
        (dcLeft ?? []).length === 0 && (chkLeft ?? []).length === 0, `dc=${(dcLeft ?? []).length}, chk=${(chkLeft ?? []).length}`);
    }
  }

  // ── 段30: F3 バック可視是正（mig0038）check_cast_backs の can_register→can_view_backs 分離 実効確認 ──
  //   専用卓で cast 指名＋drink 明細の伝票を close→check_cast_backs 行生成（段29-10 同手法）。
  //   ★can_register=true/can_view_backs=false staff は 0行（分離の核心）／set_staff_perms（5引数）で
  //   can_view_backs=true 付与→同一セッションで可視→復元で 0行（双方向の実反映）。
  //   owner/manager 常時可視・他 org 0行・cast 本人のみ（③ cast 枝不変）・anon BLOCKED。
  //   生成伝票・専用卓は try/finally 全消し＋残0＝verify:nox-rls の固定カウント非汚染。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const denied = (e: { message?: string } | null) => has(e, "permission denied");

    const { data: s30Store } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: s30Cast } = await admin.from("casts").select("id")
      .eq("store_id", s30Store?.id ?? "").eq("name", FIXTURE_USERS.castA1a.name).single();
    const s30CastA = s30Cast?.id as string | undefined;
    const { data: s30Prods } = await admin.from("products")
      .select("id, price, back_mode, back_value").eq("store_id", s30Store?.id ?? "")
      .eq("type", "drink").eq("back_mode", "rate").eq("is_active", true).limit(1);
    const drinkP = s30Prods?.[0];

    // 専用卓（段14〜16 の PERM卓とは別・段30 専用）
    const SEAT_NAME = "NOX-VERIFY-段30卓";
    let seatId = "";
    if (s30Store) {
      const { data: ex } = await admin.from("seats").select("id").eq("store_id", s30Store.id).eq("name", SEAT_NAME).limit(1);
      if (ex?.length) seatId = ex[0].id as string;
      else {
        const { data: nw } = await admin.from("seats")
          .insert({ org_id: s30Store.org_id, store_id: s30Store.id, name: SEAT_NAME, kind: "卓", sort_order: 9930 })
          .select("id").single();
        seatId = (nw?.id as string) ?? "";
      }
    }
    const s30Wipe = async () => {
      const { data: cs } = await admin.from("checks").select("id").eq("seat_id", seatId);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (!ids.length) return;
      for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
        await admin.from(t).delete().in("check_id", ids);
      }
      await admin.from("checks").delete().in("id", ids);
    };
    await s30Wipe();

    // staffRegOnA1 の membership（can_view_backs トグル対象・baseline 取得）
    const { data: uOn } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.staffRegOnA1.email).single();
    const { data: memOnRows } = await admin.from("memberships")
      .select("id, can_register, can_crm, can_shift, can_view_backs").eq("user_id", uOn?.id ?? "").limit(1);
    const memOn = memOnRows?.[0] as
      { id: string; can_register: boolean; can_crm: boolean; can_shift: boolean; can_view_backs: boolean } | undefined;

    check("段30（準備）店/cast/drink商品/専用卓/staffRegOnA1 membership 解決",
      !!s30Store && !!s30CastA && !!drinkP && !!seatId && !!memOn);

    const owner = await signInShared("段30", "ownerA");
    const mgr = await signInShared("段30", "managerA1");
    const staffOn = await signInShared("段30", "staffRegOnA1");
    const staffOff = await signInShared("段30", "staffRegOffA1");
    const castA = await signInShared("段30", "castA1a");
    const mgrB = await signInShared("段30", "managerB1");

    if (s30Store && s30CastA && drinkP && seatId && memOn && owner && mgr && staffOn && staffOff && castA && mgrB) {
      let cid = "";
      // check_cast_backs 行を count するヘルパー（この伝票に限定＝golden や他 stage と非干渉）
      const cnt = async (c: SupabaseClient): Promise<{ n: number; error: { message?: string } | null }> => {
        const { data, error } = await c.from("check_cast_backs").select("id").eq("check_id", cid);
        return { n: (data ?? []).length, error };
      };
      try {
        // 準備: cast 指名（hon・weight1）＋drink 明細の伝票を pay→close→check_cast_backs 生成
        const { data: cidRaw } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "hon" });
        cid = cidRaw as string;
        await mgr.rpc("check_set_nominations", { p_check_id: cid, p_nom_type: "hon", p_nominations: [{ cast_id: s30CastA, weight: 1 }] });
        await mgr.rpc("check_add_line", { p_check_id: cid, p_product_id: drinkP.id, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
        // 全額入金（単一 group ゆえ checks.total = group A due）→ close
        const { data: chkRow } = await admin.from("checks").select("total").eq("id", cid).single();
        const due = (chkRow?.total as number) ?? 0;
        await mgr.rpc("check_pay", { p_check_id: cid, p_method: "cash", p_amount: due, p_pay_group: "A", p_tendered: due, p_idem_key: randomUUID() });
        const { error: eClose } = await mgr.rpc("check_close", { p_check_id: cid, p_idem_key: randomUUID() });
        const { data: backRow } = await admin.from("check_cast_backs").select("cast_id, drink_back").eq("check_id", cid).single();
        check("段30（準備）close で check_cast_backs 行生成（castA・drink_back>0）",
          !eClose && !!backRow && backRow.cast_id === s30CastA && (backRow.drink_back as number) > 0, eClose?.message ?? JSON.stringify(backRow));

        // ① can_register=true / can_view_backs=false staff = 0行（★分離の核心）。baseline を明示 false 化して決定的に。
        await admin.from("memberships").update({ can_view_backs: false }).eq("id", memOn.id);
        const r1 = await cnt(staffOn);
        check("段30 ★can_register=true/can_view_backs=false staff = check_cast_backs 0行（会計権限からバック分離）",
          !r1.error && r1.n === 0, r1.error?.message ?? `got ${r1.n}`);

        // ② owner set_staff_perms（5引数）で can_view_backs=true 付与＋実 UPDATE 物理確認
        const { error: eGrant } = await owner.rpc("set_staff_perms", {
          p_membership_id: memOn.id, p_can_register: memOn.can_register, p_can_crm: memOn.can_crm,
          p_can_shift: memOn.can_shift, p_can_view_backs: true,
        });
        check("段30 owner set_staff_perms（5引数）can_view_backs=true 付与 成功", !eGrant, eGrant?.message);
        const { data: mGrant } = await admin.from("memberships").select("can_view_backs").eq("id", memOn.id).single();
        check("段30 実 UPDATE 物理確認: can_view_backs=true", mGrant?.can_view_backs === true, JSON.stringify(mGrant));

        // ③ 同一セッションで可視（≥1・SECURITY DEFINER ヘルパーが memberships を live 参照＝実反映）
        const r2 = await cnt(staffOn);
        check("段30 ★can_view_backs=true 付与で staff が backs 可視（≥1・同一セッション実反映）",
          !r2.error && r2.n >= 1, r2.error?.message ?? `got ${r2.n}`);

        // ④ 復元（false）で 0行に戻る（双方向の実反映）
        const { error: eRevoke } = await owner.rpc("set_staff_perms", {
          p_membership_id: memOn.id, p_can_register: memOn.can_register, p_can_crm: memOn.can_crm,
          p_can_shift: memOn.can_shift, p_can_view_backs: false,
        });
        const r3 = await cnt(staffOn);
        check("段30 can_view_backs=false 復元で staff backs 0行に戻る（双方向実反映）",
          !eRevoke && r3.n === 0, eRevoke?.message ?? `got ${r3.n}`);

        // ⑤ can_register=false / can_view_backs=false staff = 0行（両 false）
        const r4 = await cnt(staffOff);
        check("段30 can_register=false/can_view_backs=false staff = 0行", !r4.error && r4.n === 0, r4.error?.message ?? `got ${r4.n}`);

        // ⑥ owner=org 全店可視・manager=自店可視・managerB1=他 org 0行
        const r5 = await cnt(owner);
        check("段30 owner = backs 可視（≥1・org 全店）", !r5.error && r5.n >= 1, r5.error?.message ?? `got ${r5.n}`);
        const r6 = await cnt(mgr);
        check("段30 manager 自店 = backs 可視（≥1）", !r6.error && r6.n >= 1, r6.error?.message ?? `got ${r6.n}`);
        const r7 = await cnt(mgrB);
        check("段30 managerB1 他 org = backs 0行", !r7.error && r7.n === 0, r7.error?.message ?? `got ${r7.n}`);

        // ⑦ cast 本人＝自己行のみ可視（③ cast 枝一字不変の positive）
        const { data: castView } = await castA.from("check_cast_backs").select("cast_id").eq("check_id", cid);
        check("段30 cast 本人 = 自己行のみ可視（③ cast 枝不変・我々の生成行を含む）",
          (castView ?? []).length >= 1 && (castView ?? []).every((b) => b.cast_id === s30CastA), JSON.stringify(castView));

        // ⑧ anon = permission denied（table grant 無し＝BLOCKED）
        const { error: eAnon } = await anon.from("check_cast_backs").select("id").eq("check_id", cid);
        check("段30 anon check_cast_backs SELECT = permission denied（BLOCKED）", denied(eAnon), eAnon?.message ?? "読めてしまった");
      } finally {
        // can_view_backs をベースラインへ復元（本 stage は staffRegOnA1 のみ触る＝rls 508 前提 false を汚さない）
        await admin.from("memberships").update({ can_view_backs: memOn.can_view_backs }).eq("id", memOn.id);
        await s30Wipe();
      }
      const { data: chkLeft } = await admin.from("checks").select("id").eq("seat_id", seatId);
      check("段30 掃除確認: 生成伝票/backs 0行（非汚染）", (chkLeft ?? []).length === 0, `got ${(chkLeft ?? []).length}`);
    }
  }

  // ── 段31: F3 キャスト会計（mig0039）2段ゲートマトリクス（店 settings ∧ cast membership）──
  //   段18 の実 auth 動的生成パターン＝一時 cast 一式（users/memberships[role=cast]/casts・実 auth）を
  //   service 生成→signIn→matrix→finally 全消し（seed 常設せず＝verify:nox-rls 固定カウント非汚染）。
  //   ★2段ゲート: auth_cast_can_register() = membership.can_register ∧ store settings.cast_register_enabled。
  //   マトリクス（段内で set_store_cast_register / set_cast_register を実行してフラグ切替＝RPC 正常系兼務）:
  //   a. 店OFF×castON → A群6表＋seats=0行・casts=自己1行（★self 例外は register 非依存で保持）・会計RPC forbidden
  //   b. 店ON×castOFF → 同上（既存 castA1a セッションでも二重確認＝fixture cast は据置で 0/self）
  //   c. 店ON×castON → checks/seats 可視・casts=全同僚可視・check_open→add_line→pay→close 実走
  //      （uuid 返却＋NOT NULL 充填＝23502 回帰の常設 assert）
  //   d. ★mig0038 整合: 有効 cast でも check_cast_backs は自分の行のみ（会計は開くがバックは分離＝
  //      mig0039 は check_cast_backs に触れない・golden の他 cast backs は不可視）
  //   e. anon BLOCKED（段31a で 3関数）＋ f. set_store_cast_register=owner 限定/null 拒否 ＋
  //   g. set_cast_register=対象 cast 限定 'not a cast'/他 org not found/null 拒否/owner・manager 正常系（audit）
  //   finally: 生成 cast 一式＋伝票＋実 auth 全消し・store A1 settings_json を厳密復元（後続 rls 非汚染）。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    const { data: s31Store } = await admin.from("stores").select("id, org_id, settings_json").eq("name", STORE_A1).single();
    const { data: s31Drinks } = await admin.from("products")
      .select("id, price, back_mode, back_value").eq("store_id", s31Store?.id ?? "")
      .eq("type", "drink").eq("back_mode", "rate").eq("is_active", true).limit(1);
    const drinkP = s31Drinks?.[0];
    const { data: castA1aRow } = await admin.from("casts").select("id")
      .eq("store_id", s31Store?.id ?? "").eq("name", FIXTURE_USERS.castA1a.name).single();
    const baselineSettings = (s31Store?.settings_json ?? null) as Record<string, unknown> | null;

    // 専用卓（段31 専用）
    const SEAT_NAME = "NOX-VERIFY-段31卓";
    let seatId = "";
    if (s31Store) {
      const { data: ex } = await admin.from("seats").select("id").eq("store_id", s31Store.id).eq("name", SEAT_NAME).limit(1);
      if (ex?.length) seatId = ex[0].id as string;
      else {
        const { data: nw } = await admin.from("seats")
          .insert({ org_id: s31Store.org_id, store_id: s31Store.id, name: SEAT_NAME, kind: "卓", sort_order: 9931 })
          .select("id").single();
        seatId = (nw?.id as string) ?? "";
      }
    }
    const wipeSeat = async () => {
      const { data: cs } = await admin.from("checks").select("id").eq("seat_id", seatId);
      const ids = (cs ?? []).map((c) => c.id as string);
      if (!ids.length) return;
      for (const t of ["check_cast_backs", "payments", "check_lines", "check_nominations", "receivables"]) {
        await admin.from(t).delete().in("check_id", ids);
      }
      await admin.from("checks").delete().in("id", ids);
    };
    await wipeSeat();

    // 一時 cast 一式（実 auth・前回遺物掃除→生成）
    const TMP_EMAIL = "nox-verify-cast-reg-tmp@example.com";
    {
      const { data: oldU } = await admin.from("users").select("id").eq("email", TMP_EMAIL);
      const oldIds = (oldU ?? []).map((r) => r.id as string);
      if (oldIds.length) {
        await admin.from("casts").delete().in("user_id", oldIds);
        await admin.from("memberships").delete().in("user_id", oldIds);
        await admin.from("users").delete().in("id", oldIds);
      }
    }
    let tmpAuthId = "";
    const { data: cuTmp, error: eCuTmp } = await admin.auth.admin.createUser({
      email: TMP_EMAIL, password: env.SEED_PASSWORD, email_confirm: true,
    });
    if (eCuTmp || !cuTmp?.user) { fails.push(`段31 実 auth 生成失敗: ${eCuTmp?.message}`); }
    tmpAuthId = cuTmp?.user?.id ?? "";
    const { data: uTmp } = tmpAuthId
      ? await admin.from("users").insert({ org_id: s31Store!.org_id, auth_user_id: tmpAuthId, email: TMP_EMAIL, name: "検証キャスト会計TMP" }).select("id").single()
      : { data: null };
    const { data: mTmp } = uTmp
      ? await admin.from("memberships").insert({ user_id: uTmp.id, store_id: s31Store!.id, role: "cast", can_register: false, can_crm: false, can_shift: false }).select("id").single()
      : { data: null };
    const { data: cTmp } = uTmp
      ? await admin.from("casts").insert({ org_id: s31Store!.org_id, store_id: s31Store!.id, user_id: uTmp.id, name: "検証キャスト会計TMP", employment: "委託", is_active: true }).select("id").single()
      : { data: null };

    check("段31（準備）店/drink商品/専用卓/castA1a/一時 cast 一式 解決",
      !!s31Store && !!drinkP && !!seatId && !!castA1aRow && !!uTmp && !!mTmp && !!cTmp);

    const owner = await signInShared("段31", "ownerA");
    const mgr = await signInShared("段31", "managerA1");
    const mgrB = await signInShared("段31", "managerB1");
    const staffOff = await signInShared("段31", "staffRegOffA1");
    const castA1a = await signInShared("段31", "castA1a");
    const castTmp = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: eSignTmp } = tmpAuthId
      ? await castTmp.auth.signInWithPassword({ email: TMP_EMAIL, password: env.SEED_PASSWORD })
      : { error: { message: "no tmp auth" } as { message?: string } };
    check("段31（準備）一時 cast で signIn 成功（auth↔users↔casts 連鎖）", !eSignTmp, eSignTmp?.message);

    const A6 = ["checks", "check_lines", "check_nominations", "payments", "receivables", "bottle_keeps"];
    let accCheckId = "";

    if (s31Store && drinkP && seatId && castA1aRow && uTmp && mTmp && cTmp && owner && mgr && mgrB && staffOff && castA1a && !eSignTmp) {
      try {
        // ═══ a. 店OFF × castON ═══（store flag は seed 未設定＝OFF・castTmp を register ON に）
        const { error: eSetCastOn } = await owner.rpc("set_cast_register", { p_membership_id: mTmp.id, p_can_register: true });
        check("段31-a owner set_cast_register(cast, true) 成功（正常系＝audit 対象）", !eSetCastOn, eSetCastOn?.message);
        const { data: audCast } = await owner.from("audit_logs").select("action").eq("action", "set_cast_register")
          .eq("target", `memberships:${mTmp.id}`).order("at", { ascending: false }).limit(1);
        check("段31-a audit: set_cast_register 行生成", (audCast ?? []).length === 1, JSON.stringify(audCast));
        // auth_cast_can_register = true(can_register) ∧ false(store flag) = false
        const { data: canA } = await castTmp.rpc("auth_cast_can_register");
        check("段31-a 店OFF×castON → auth_cast_can_register()=false（AND 不成立）", canA === false, `got ${JSON.stringify(canA)}`);
        for (const t of A6) {
          const { data } = await castTmp.from(t).select("id");
          check(`段31-a 店OFF×castON ${t} = 0行`, (data ?? []).length === 0, `got ${(data ?? []).length}`);
        }
        const { data: seatsA } = await castTmp.from("seats").select("id");
        check("段31-a 店OFF×castON seats = 0行", (seatsA ?? []).length === 0, `got ${(seatsA ?? []).length}`);
        const { data: castsA } = await castTmp.from("casts").select("id");
        check("段31-a casts = 自己1行のみ（self 例外は register 非依存で保持）",
          (castsA ?? []).length === 1 && (castsA ?? [])[0]?.id === cTmp.id, JSON.stringify(castsA));
        const { error: eOpenA } = await castTmp.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "hon" });
        check("段31-a 店OFF×castON check_open forbidden", forbidden(eOpenA), eOpenA?.message ?? "通ってしまった");

        // ═══ c. 店ON × castON ═══（store flag を owner RPC で ON）
        const { error: eStoreOn } = await owner.rpc("set_store_cast_register", { p_store_id: s31Store.id, p_enabled: true });
        check("段31-c owner set_store_cast_register(store, true) 成功（owner 限定・正常系）", !eStoreOn, eStoreOn?.message);
        const { data: canC } = await castTmp.rpc("auth_cast_can_register");
        check("段31-c 店ON×castON → auth_cast_can_register()=true（2段 AND 成立）", canC === true, `got ${JSON.stringify(canC)}`);
        const { data: chkVis } = await castTmp.from("checks").select("id");
        check("段31-c checks 可視（golden ≥1・store A1 全伝票）", (chkVis ?? []).length >= 1, `got ${(chkVis ?? []).length}`);
        const { data: seatsC } = await castTmp.from("seats").select("id");
        check("段31-c seats 可視（≥1）", (seatsC ?? []).length >= 1, `got ${(seatsC ?? []).length}`);
        const { data: castsC } = await castTmp.from("casts").select("id");
        check("段31-c casts 全同僚可視（castA1a/castA1b/自己 ≥3＝指名の前提）", (castsC ?? []).length >= 3, `got ${(castsC ?? []).length}`);

        // ★会計フロー実走（castTmp を自己指名→drink→pay→close＝uuid 返却+NOT NULL 充填=23502 回帰）
        const { data: openId, error: eOpen } = await castTmp.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "hon" });
        check("段31-c check_open 成功（uuid 返却・cast 実 INSERT）", !eOpen && typeof openId === "string", eOpen?.message);
        accCheckId = openId as string;
        const { error: eNom } = await castTmp.rpc("check_set_nominations", { p_check_id: accCheckId, p_nom_type: "hon", p_nominations: [{ cast_id: cTmp.id, weight: 1 }] });
        check("段31-c check_set_nominations 成功（自己指名）", !eNom, eNom?.message);
        const { data: lineId, error: eLine } = await castTmp.rpc("check_add_line", { p_check_id: accCheckId, p_product_id: drinkP.id, p_qty: 2, p_kind: null, p_pay_group: "A", p_name: null, p_unit_price: null });
        check("段31-c check_add_line 成功（uuid 返却・NOT NULL 充填）", !eLine && typeof lineId === "string", eLine?.message);
        const { data: chkRow } = await admin.from("checks").select("total").eq("id", accCheckId).single();
        const due = (chkRow?.total as number) ?? 0;
        const { data: payId, error: ePay } = await castTmp.rpc("check_pay", { p_check_id: accCheckId, p_method: "cash", p_amount: due, p_pay_group: "A", p_tendered: due, p_idem_key: randomUUID() });
        check("段31-c check_pay 成功（uuid 返却）", !ePay && typeof payId === "string", ePay?.message);
        const { data: closeId, error: eClose } = await castTmp.rpc("check_close", { p_check_id: accCheckId, p_idem_key: randomUUID() });
        check("段31-c check_close 成功（cast 会計フロー完走）", !eClose && closeId === accCheckId, eClose?.message);
        const { data: chkFin } = await admin.from("checks").select("status, total").eq("id", accCheckId).single();
        check("段31-c 実 INSERT 物理確認: status=closed・total NOT NULL（23502 回帰）",
          chkFin?.status === "closed" && chkFin?.total != null, JSON.stringify(chkFin));

        // ═══ d. ★mig0038 整合: 有効 cast でも check_cast_backs は自分の行のみ ═══
        const { data: backsVis } = await castTmp.from("check_cast_backs").select("cast_id");
        check("段31-d ★check_cast_backs = 自分の行のみ（会計は開くがバックは分離・mig0039 は非接触）",
          (backsVis ?? []).length >= 1 && (backsVis ?? []).every((b) => b.cast_id === cTmp.id), JSON.stringify(backsVis));
        check("段31-d ★golden 他 cast（castA1a）の backs は不可視（cast_id 混入なし）",
          !(backsVis ?? []).some((b) => b.cast_id === castA1aRow.id), JSON.stringify(backsVis));
        await wipeSeat();
        accCheckId = "";

        // ═══ b. 店ON × castOFF ═══（castTmp を register OFF に戻す＝store は ON のまま）
        const { error: eSetCastOff } = await owner.rpc("set_cast_register", { p_membership_id: mTmp.id, p_can_register: false });
        check("段31-b owner set_cast_register(cast, false) 成功", !eSetCastOff, eSetCastOff?.message);
        const { data: canB } = await castTmp.rpc("auth_cast_can_register");
        check("段31-b 店ON×castOFF → auth_cast_can_register()=false", canB === false, `got ${JSON.stringify(canB)}`);
        for (const t of A6) {
          const { data } = await castTmp.from(t).select("id");
          check(`段31-b 店ON×castOFF ${t} = 0行`, (data ?? []).length === 0, `got ${(data ?? []).length}`);
        }
        const { error: eOpenB } = await castTmp.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "hon" });
        check("段31-b 店ON×castOFF check_open forbidden", forbidden(eOpenB), eOpenB?.message ?? "通ってしまった");
        // 既存 fixture cast（castA1a・can_register=false 据置）でも店 ON 下で 0行（反転ゼロの実証）
        const { data: a1aChecks } = await castA1a.from("checks").select("id");
        check("段31-b 既存 castA1a（据置 OFF）は店 ON でも checks 0行（反転ゼロ実証）", (a1aChecks ?? []).length === 0, `got ${(a1aChecks ?? []).length}`);

        // ═══ f. set_store_cast_register 認可: manager forbidden（owner 限定）・null 拒否 ═══
        const { error: eStoreMgr } = await mgr.rpc("set_store_cast_register", { p_store_id: s31Store.id, p_enabled: true });
        check("段31-f set_store_cast_register manager forbidden（owner 限定）", forbidden(eStoreMgr), eStoreMgr?.message ?? "通ってしまった");
        const { error: eStoreNull } = await owner.rpc("set_store_cast_register", { p_store_id: s31Store.id, p_enabled: null });
        check("段31-f set_store_cast_register null = bad enabled", has(eStoreNull, "bad enabled"), eStoreNull?.message ?? "通ってしまった");

        // ═══ g. set_cast_register 認可: 対象 staff='not a cast'・他 org=not found・null 拒否・manager 正常系 ═══
        const { data: mStaffOff } = await admin.from("memberships").select("id")
          .eq("user_id", (await admin.from("users").select("id").eq("email", FIXTURE_USERS.staffRegOffA1.email).single()).data?.id ?? "").limit(1);
        const { error: eNotCast } = await owner.rpc("set_cast_register", { p_membership_id: mStaffOff?.[0]?.id, p_can_register: true });
        check("段31-g 対象 staff membership = not a cast（cast 限定）", has(eNotCast, "not a cast"), eNotCast?.message ?? "通ってしまった");
        const { error: eOtherOrg } = await mgrB.rpc("set_cast_register", { p_membership_id: mTmp.id, p_can_register: true });
        check("段31-g 他 org manager = not found（存在オラクル封じ）", has(eOtherOrg, "not found"), eOtherOrg?.message ?? "通ってしまった");
        const { error: eCastNull } = await owner.rpc("set_cast_register", { p_membership_id: mTmp.id, p_can_register: null });
        check("段31-g set_cast_register null = bad flag（規約7）", has(eCastNull, "bad flag"), eCastNull?.message ?? "通ってしまった");
        const { error: eMgrOk } = await mgr.rpc("set_cast_register", { p_membership_id: mTmp.id, p_can_register: false });
        check("段31-g manager 自店 cast set_cast_register 成功（正常系）", !eMgrOk, eMgrOk?.message);
      } finally {
        // store A1 settings_json を厳密復元（後続 rls の castA1a 0行前提を汚さない）
        await admin.from("stores").update({ settings_json: baselineSettings }).eq("id", s31Store!.id);
        // 生成伝票→cast 一式→実 auth の順で全消し
        await wipeSeat();
        if (cTmp?.id) await admin.from("casts").delete().eq("id", cTmp.id);
        if (mTmp?.id) await admin.from("memberships").delete().eq("id", mTmp.id);
        if (uTmp?.id) await admin.from("users").delete().eq("id", uTmp.id);
        if (tmpAuthId) await admin.auth.admin.deleteUser(tmpAuthId).catch(() => undefined);
      }
      // 非汚染の物理確認（一時 cast 全消し＋店フラグ復元）
      const { data: tmpLeft } = await admin.from("users").select("id").eq("email", TMP_EMAIL);
      const { data: stFin } = await admin.from("stores").select("settings_json").eq("id", s31Store.id).single();
      check("段31 掃除確認: 一時 cast 0行・store settings_json 復元（rls 非汚染）",
        (tmpLeft ?? []).length === 0
          && ((stFin?.settings_json as Record<string, unknown> | null)?.cast_register_enabled ?? undefined) === (baselineSettings?.cast_register_enabled ?? undefined),
        `tmp=${(tmpLeft ?? []).length}, settings=${JSON.stringify(stFin?.settings_json)}`);
      await castTmp.auth.signOut();
    }
  }

  // ── 段32: F3d 体入採用（mig0040）trials フロー＋casts 連鎖の実効マトリクス ──
  //   trials は owner/manager 限定（staff/cast 0行の新形 RLS）。書込は trial_* / cast_create RPC。
  //   ★trial_hire / cast_create は casts＋cast_sensitive を生成するため、段31 方式で全消し
  //   （trials→cast_sensitive→casts の依存順・name prefix backstop）＝rls の casts 固定カウント反転ゼロ。
  //   a. 認可（owner/manager 自店成功・他店/staff/cast forbidden・under 18・bad 系）／b. 可視（owner/manager
  //   のみ・staff/cast 0行）／c. 部分更新（rating/documents/memo/tier・bad rating/documents・not trial）／
  //   d. ★本採用（書類不備 raise→全書類で casts＋cast_sensitive 実生成・cast_id 焼付け・status=hired・
  //   ★audit PII マスク＝real_name/birthday が audit に無い・cast_create_sensitive は fields_changed のみ）／
  //   e. 見送り（rejected・行残置）／f. 他 org not found／g. cast_create 直接登録（casts+cast_sensitive・under 18）。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    const { data: s32Store } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: s32A2 } = await admin.from("stores").select("id").eq("name", STORE_A2).single();

    const PREFIX = "NOX-VERIFY-段32";
    const createdCastIds: string[] = [];
    const wipe = async () => {
      // 依存順: trials（cast_id FK）→ cast_sensitive（cast_id FK）→ casts
      await admin.from("trials").delete().like("name", PREFIX + "%");
      const { data: cByName } = await admin.from("casts").select("id").like("name", PREFIX + "%");
      const ids = [...new Set([...(createdCastIds), ...((cByName ?? []).map((c) => c.id as string))])];
      if (ids.length) {
        await admin.from("cast_sensitive").delete().in("cast_id", ids);
        await admin.from("casts").delete().in("id", ids);
      }
    };
    await wipe();

    // 満年齢の birthday（JST 基準は RPC 側・ここは Jan1 固定で境界安全）
    const yr = new Date().getFullYear();
    const validBday = `${yr - 25}-01-01`;
    const under18Bday = `${yr - 17}-01-01`;

    const owner = await signInShared("段32", "ownerA");
    const mgr = await signInShared("段32", "managerA1");
    const mgrB = await signInShared("段32", "managerB1");
    const staffOn = await signInShared("段32", "staffRegOnA1");
    const castA = await signInShared("段32", "castA1a");

    check("段32（準備）store A1/A2 解決", !!s32Store && !!s32A2);

    if (s32Store && s32A2 && owner && mgr && mgrB && staffOn && castA) {
      try {
        // ═══ a. trial_register 認可 ＋ under 18 ＋ bad ═══
        const { data: t1, error: e1 } = await owner.rpc("trial_register", {
          p_store_id: s32Store.id, p_name: `${PREFIX}-ねね`, p_birthday: validBday,
          p_real_name: "本名テスト", p_tier: "レギュラー", p_trial_date: validBday, p_memo: "初日メモ",
        });
        check("段32-a owner trial_register 成功（uuid 返却）", !e1 && typeof t1 === "string", e1?.message);
        // ★audit PII マスク（real_name/birthday が after_json に無い）
        const { data: aud1 } = await owner.from("audit_logs").select("after_json")
          .eq("action", "trial_register").eq("target", `trials:${t1}`).order("at", { ascending: false }).limit(1);
        const aj1 = aud1?.[0]?.after_json as Record<string, unknown> | undefined;
        check("段32-a ★audit PII マスク: real_name/birthday が after_json に無い（name は在る）",
          !!aj1 && aj1.real_name === undefined && aj1.birthday === undefined && aj1.name !== undefined, JSON.stringify(aj1));

        const { data: t2, error: e2 } = await mgr.rpc("trial_register", {
          p_store_id: s32Store.id, p_name: `${PREFIX}-ふうか`, p_birthday: validBday,
        });
        check("段32-a manager 自店 trial_register 成功", !e2 && typeof t2 === "string", e2?.message);
        const { error: e3 } = await mgr.rpc("trial_register", { p_store_id: s32A2.id, p_name: `${PREFIX}-越境`, p_birthday: validBday });
        check("段32-a manager 他店 A2 forbidden（店スコープ）", forbidden(e3), e3?.message ?? "通ってしまった");
        const { error: e4 } = await staffOn.rpc("trial_register", { p_store_id: s32Store.id, p_name: `${PREFIX}-s`, p_birthday: validBday });
        check("段32-a staff forbidden（owner/manager のみ）", forbidden(e4), e4?.message ?? "通ってしまった");
        const { error: e5 } = await castA.rpc("trial_register", { p_store_id: s32Store.id, p_name: `${PREFIX}-c`, p_birthday: validBday });
        check("段32-a cast forbidden", forbidden(e5), e5?.message ?? "通ってしまった");
        const { error: e6 } = await owner.rpc("trial_register", { p_store_id: s32Store.id, p_name: `${PREFIX}-u18`, p_birthday: under18Bday });
        check("段32-a ★満18歳未満 = under 18（風営法）", has(e6, "under 18"), e6?.message ?? "通ってしまった");
        const { error: e7 } = await owner.rpc("trial_register", { p_store_id: s32Store.id, p_name: `${PREFIX}-nb`, p_birthday: null });
        check("段32-a birthday null = bad birthday", has(e7, "bad birthday"), e7?.message ?? "通ってしまった");

        // ═══ b. trials 可視（owner/manager のみ・staff/cast 0行）═══
        const { data: ownerView } = await owner.from("trials").select("id").like("name", `${PREFIX}%`);
        check("段32-b owner trials 可視（≥2）", (ownerView ?? []).length >= 2, `got ${(ownerView ?? []).length}`);
        const { data: mgrView } = await mgr.from("trials").select("id").like("name", `${PREFIX}%`);
        check("段32-b manager 自店 trials 可視（≥2）", (mgrView ?? []).length >= 2, `got ${(mgrView ?? []).length}`);
        const { data: staffView, error: eSV } = await staffOn.from("trials").select("id");
        check("段32-b staff trials = 0行（★owner/manager 限定 RLS）", !eSV && (staffView ?? []).length === 0, eSV?.message ?? `got ${(staffView ?? []).length}`);
        const { data: castView, error: eCV } = await castA.from("trials").select("id");
        check("段32-b cast trials = 0行", !eCV && (castView ?? []).length === 0, eCV?.message ?? `got ${(castView ?? []).length}`);

        // ═══ c. trial_update 部分更新 ═══
        const { error: eU1 } = await owner.rpc("trial_update", {
          p_trial_id: t1, p_rating: 5, p_documents: { id_doc: true, contract: true, pledge: true, bank: true }, p_memo: "更新メモ", p_tier: "人気",
        });
        check("段32-c trial_update 成功（評価/書類/メモ/tier）", !eU1, eU1?.message);
        const { data: uRow } = await admin.from("trials").select("rating, documents, tier, memo").eq("id", t1 ?? "").single();
        check("段32-c 部分更新 物理確認: rating=5・documents 4件 true・tier=人気",
          uRow?.rating === 5 && (uRow?.documents as Record<string, unknown>)?.id_doc === true && uRow?.tier === "人気", JSON.stringify(uRow));
        const { error: eU2 } = await owner.rpc("trial_update", { p_trial_id: t1, p_rating: 6 });
        check("段32-c rating 6 = bad rating（1-5）", has(eU2, "bad rating"), eU2?.message ?? "通ってしまった");
        const { error: eU3 } = await owner.rpc("trial_update", { p_trial_id: t1, p_documents: { foo: true } });
        check("段32-c 未知キー documents = bad documents", has(eU3, "bad documents"), eU3?.message ?? "通ってしまった");
        const { error: eU3b } = await owner.rpc("trial_update", { p_trial_id: t1, p_documents: { id_doc: "yes" } });
        check("段32-c 非 boolean documents = bad documents", has(eU3b, "bad documents"), eU3b?.message ?? "通ってしまった");

        // ═══ d. ★本採用（書類不備→全書類→casts+cast_sensitive 生成）═══
        const { error: eH0 } = await owner.rpc("trial_hire", { p_trial_id: t2 });  // t2 は書類なし
        check("段32-d 書類不備 = documents incomplete", has(eH0, "documents incomplete"), eH0?.message ?? "通ってしまった");
        const { data: castHired, error: eH1 } = await owner.rpc("trial_hire", { p_trial_id: t1 });  // t1 は全書類 true
        check("段32-d ★trial_hire 成功（casts uuid 返却）", !eH1 && typeof castHired === "string", eH1?.message);
        if (typeof castHired === "string") createdCastIds.push(castHired);
        const { data: cRow } = await admin.from("casts").select("name, kind, user_id, is_active").eq("id", castHired ?? "").single();
        check("段32-d ★casts 生成物理確認: name=源氏名・kind←tier・user_id null・active",
          cRow?.name === `${PREFIX}-ねね` && cRow?.kind === "人気" && cRow?.user_id === null && cRow?.is_active === true, JSON.stringify(cRow));
        const { data: csRow } = await admin.from("cast_sensitive").select("real_name, birthday, mynumber_enc").eq("cast_id", castHired ?? "").single();
        check("段32-d ★cast_sensitive 生成物理確認: real_name/birthday 焼付け・mynumber_enc null",
          csRow?.real_name === "本名テスト" && csRow?.birthday != null && csRow?.mynumber_enc === null, JSON.stringify(csRow));
        const { data: tHRow } = await admin.from("trials").select("status, cast_id").eq("id", t1 ?? "").single();
        check("段32-d trials 物理確認: status=hired・cast_id 焼付け", tHRow?.status === "hired" && tHRow?.cast_id === castHired, JSON.stringify(tHRow));
        const { data: audH } = await owner.from("audit_logs").select("after_json")
          .eq("action", "trial_hire").eq("target", `trials:${t1}`).order("at", { ascending: false }).limit(1);
        const ajH = audH?.[0]?.after_json as Record<string, unknown> | undefined;
        check("段32-d ★audit(trial_hire) PII マスク: real_name/birthday 無し", !!ajH && ajH.real_name === undefined && ajH.birthday === undefined, JSON.stringify(ajH));
        const { data: audCS } = await owner.from("audit_logs").select("after_json")
          .eq("action", "cast_create_sensitive").eq("target", `cast_sensitive:${castHired}`).order("at", { ascending: false }).limit(1);
        const csFields = (audCS?.[0]?.after_json as Record<string, unknown> | undefined)?.fields_changed as string[] | undefined;
        check("段32-d ★audit(cast_create_sensitive) = fields_changed マスクのみ（平文 PII なし）",
          Array.isArray(csFields) && csFields.includes("real_name") && csFields.includes("birthday"), JSON.stringify(audCS));
        const { error: eH2 } = await owner.rpc("trial_hire", { p_trial_id: t1 });
        check("段32-d 本採用済み 再 hire = not trial", has(eH2, "not trial"), eH2?.message ?? "通ってしまった");
        const { error: eU4 } = await owner.rpc("trial_update", { p_trial_id: t1, p_rating: 3 });
        check("段32-d hired 済み trial_update = not trial", has(eU4, "not trial"), eU4?.message ?? "通ってしまった");

        // ═══ e. 見送り（rejected・行残置）═══
        const { error: eR1 } = await owner.rpc("trial_reject", { p_trial_id: t2 });
        check("段32-e trial_reject 成功", !eR1, eR1?.message);
        const { data: t2Row } = await admin.from("trials").select("status").eq("id", t2 ?? "").single();
        check("段32-e status=rejected・行残置（削除 RPC なし＝台帳 #35）", t2Row?.status === "rejected", JSON.stringify(t2Row));
        const { error: eR2 } = await owner.rpc("trial_reject", { p_trial_id: t2 });
        check("段32-e rejected 再 reject = not trial", has(eR2, "not trial"), eR2?.message ?? "通ってしまった");

        // ═══ f. 他 org not found（存在オラクル封じ）═══
        const { error: eF1 } = await mgrB.rpc("trial_hire", { p_trial_id: t1 });
        check("段32-f 他 org manager trial_hire = not found", has(eF1, "not found"), eF1?.message ?? "通ってしまった");
        const { error: eF2 } = await owner.rpc("trial_update", { p_trial_id: randomUUID(), p_rating: 3 });
        check("段32-f 不在 trial = not found", has(eF2, "not found"), eF2?.message ?? "通ってしまった");

        // ═══ g. cast_create 直接登録 ═══
        const { data: castDirect, error: eC1 } = await owner.rpc("cast_create", {
          p_store_id: s32Store.id, p_name: `${PREFIX}-直接`, p_birthday: validBday, p_real_name: "直接本名", p_kind: "レギュラー",
        });
        check("段32-g cast_create 成功（casts uuid）", !eC1 && typeof castDirect === "string", eC1?.message);
        if (typeof castDirect === "string") createdCastIds.push(castDirect);
        const { data: cdRow } = await admin.from("casts").select("user_id").eq("id", castDirect ?? "").single();
        const { data: cdsRow } = await admin.from("cast_sensitive").select("real_name").eq("cast_id", castDirect ?? "").single();
        check("段32-g cast_create 物理確認: casts+cast_sensitive 生成・user_id null（ログインなし cast）",
          cdRow?.user_id === null && cdsRow?.real_name === "直接本名", `${JSON.stringify(cdRow)} / ${JSON.stringify(cdsRow)}`);
        const { error: eC2 } = await owner.rpc("cast_create", { p_store_id: s32Store.id, p_name: `${PREFIX}-u18`, p_birthday: under18Bday });
        check("段32-g cast_create under 18 拒否", has(eC2, "under 18"), eC2?.message ?? "通ってしまった");
        const { error: eC3 } = await staffOn.rpc("cast_create", { p_store_id: s32Store.id, p_name: `${PREFIX}-s`, p_birthday: validBday });
        check("段32-g staff cast_create forbidden", forbidden(eC3), eC3?.message ?? "通ってしまった");
        const { error: eC4 } = await mgr.rpc("cast_create", { p_store_id: s32A2.id, p_name: `${PREFIX}-x`, p_birthday: validBday });
        check("段32-g manager 他店 cast_create forbidden", forbidden(eC4), eC4?.message ?? "通ってしまった");
      } finally {
        await wipe();
      }
      // 非汚染の物理確認（trials/casts 全消し＝rls 固定カウント［A1=2人・ranking 2行］反転ゼロ）
      const { data: tLeft } = await admin.from("trials").select("id").like("name", `${PREFIX}%`);
      const { data: cLeft } = await admin.from("casts").select("id").like("name", `${PREFIX}%`);
      check("段32 掃除確認: trials/casts 0行（casts 固定カウント非汚染）",
        (tLeft ?? []).length === 0 && (cLeft ?? []).length === 0, `trials=${(tLeft ?? []).length}, casts=${(cLeft ?? []).length}`);
    }
  }

  // ── 段33: castログイン招待（mig0041）cast_invite の実効フロー＋/mine 土台実測 ──
  //   段18 実 auth 動的生成パターン＝createUser→cast_invite→signIn→auth_role/auth_cast_id/RLS 実測→
  //   finally 全消し（casts[name prefix]→memberships→users→auth deleteUser の依存順）＝固定カウント反転ゼロ。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");

    const { data: s33A1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: s33A2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();

    const PREFIX = "NOX-VERIFY-段33";
    const TMP_EMAIL = "nox-verify-cast-invite-tmp@example.com";
    // 前回遺物掃除（casts[FK: user_id→users]を先に消してから users）
    const wipe33 = async () => {
      await admin.from("casts").delete().like("name", PREFIX + "%");
      const { data: oldU } = await admin.from("users").select("id").eq("email", TMP_EMAIL);
      const ids = (oldU ?? []).map((r) => r.id as string);
      if (ids.length) {
        await admin.from("memberships").delete().in("user_id", ids);
        await admin.from("users").delete().in("id", ids);
      }
    };
    await wipe33();

    // 結線対象の一時 cast（user_id null＝招待可能・A1 に2体＋A2 に1体=店スコープ負系用）
    const { data: c1 } = await admin.from("casts")
      .insert({ org_id: s33A1!.org_id, store_id: s33A1!.id, name: `${PREFIX}-cast1`, is_active: true }).select("id").single();
    const { data: c2 } = await admin.from("casts")
      .insert({ org_id: s33A1!.org_id, store_id: s33A1!.id, name: `${PREFIX}-cast2`, is_active: true }).select("id").single();
    const { data: c3 } = await admin.from("casts")
      .insert({ org_id: s33A2!.org_id, store_id: s33A2!.id, name: `${PREFIX}-castA2`, is_active: true }).select("id").single();

    // 実 auth（route の createUser 相当・seed と同一プリミティブ）
    let authId = "";
    const { data: cuTmp, error: eCuTmp } = await admin.auth.admin.createUser({
      email: TMP_EMAIL, password: env.SEED_PASSWORD, email_confirm: true,
    });
    if (eCuTmp || !cuTmp?.user) fails.push(`段33 実 auth 生成失敗: ${eCuTmp?.message}`);
    authId = cuTmp?.user?.id ?? "";

    const owner = await signInShared("段33", "ownerA");
    const mgr = await signInShared("段33", "managerA1");
    const mgrB = await signInShared("段33", "managerB1");
    const staffOn = await signInShared("段33", "staffRegOnA1");
    const castA = await signInShared("段33", "castA1a");
    const castTmp = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    check("段33（準備）店/一時 cast 3体/実 auth 解決", !!s33A1 && !!s33A2 && !!c1 && !!c2 && !!c3 && !!authId);

    if (s33A1 && s33A2 && c1 && c2 && c3 && authId && owner && mgr && mgrB && staffOn && castA) {
      try {
        // ═══ 正常系: owner が cast1 を招待（users＋membership＋casts.user_id の3点結線）═══
        const { data: memId, error: eInv } = await owner.rpc("cast_invite", {
          p_auth_user_id: authId, p_email: TMP_EMAIL, p_cast_id: c1.id,
        });
        check("段33 ★owner cast_invite 成功（membership uuid 返却）", !eInv && typeof memId === "string", eInv?.message);
        const { data: uRow } = await admin.from("users").select("id, auth_user_id, name").eq("email", TMP_EMAIL).single();
        check("段33 users 生成物理確認: auth_user_id 結線・name=源氏名",
          uRow?.auth_user_id === authId && uRow?.name === `${PREFIX}-cast1`, JSON.stringify(uRow));
        const { data: mRow } = await admin.from("memberships").select("role, store_id, is_active").eq("id", memId as string).single();
        check("段33 membership 物理確認: role=cast・store=対象 cast.store_id 導出（store 整合）・active",
          mRow?.role === "cast" && mRow?.store_id === s33A1.id && mRow?.is_active === true, JSON.stringify(mRow));
        const { data: cRow } = await admin.from("casts").select("user_id").eq("id", c1.id).single();
        check("段33 casts.user_id 結線物理確認", cRow?.user_id === uRow?.id, JSON.stringify(cRow));
        const { data: aud } = await owner.from("audit_logs").select("action").eq("action", "cast_invite")
          .eq("target", `casts:${c1.id}`).limit(1);
        check("段33 audit: cast_invite 行生成", (aud ?? []).length === 1, JSON.stringify(aud));

        // ═══ ★招待した cast で signIn → /mine 土台の実測 ═══
        const { error: eSign } = await castTmp.auth.signInWithPassword({ email: TMP_EMAIL, password: env.SEED_PASSWORD });
        check("段33 ★招待 cast で signIn 成功（auth↔users↔memberships↔casts 連鎖）", !eSign, eSign?.message);
        if (!eSign) {
          const { data: roleV } = await castTmp.rpc("auth_role");
          check("段33 ★auth_role='cast'（memberships 土台）", roleV === "cast", `got ${JSON.stringify(roleV)}`);
          const { data: cidV } = await castTmp.rpc("auth_cast_id");
          check("段33 ★auth_cast_id=対象 cast（casts.user_id 土台）", cidV === c1.id, `got ${JSON.stringify(cidV)}`);
          const { data: backs, error: eB } = await castTmp.from("check_cast_backs").select("cast_id");
          check("段33 ★check_cast_backs=自己行のみ（自分0行・golden 他 cast 不可視＝パターン1 実測）",
            !eB && (backs ?? []).length === 0, eB?.message ?? `got ${(backs ?? []).length}`);
        }

        // ═══ 負系 ═══
        const { error: eAl } = await owner.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: "nox-verify-s33-x1@example.com", p_cast_id: c1.id });
        check("段33 結線済み cast への再招待 = already linked", has(eAl, "already linked"), eAl?.message ?? "通ってしまった");
        const { error: eEls } = await owner.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: TMP_EMAIL, p_cast_id: c2.id });
        check("段33 既存 active membership 持ち user = already active elsewhere", has(eEls, "already active elsewhere"), eEls?.message ?? "通ってしまった");
        const { error: eBt } = await owner.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: FIXTURE_USERS.staffRegOffA1.email, p_cast_id: c2.id });
        check("段33 staff 人材 email = bad target（役職二重化の鏡像封じ）", has(eBt, "bad target"), eBt?.message ?? "通ってしまった");
        const { error: eNf } = await mgrB.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: "nox-verify-s33-x2@example.com", p_cast_id: c2.id });
        check("段33 他 org manager = not found（存在オラクル封じ）", has(eNf, "not found"), eNf?.message ?? "通ってしまった");
        const { error: eOs } = await mgr.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: "nox-verify-s33-x3@example.com", p_cast_id: c3.id });
        check("段33 manager 他店 cast = forbidden（店スコープ）", forbidden(eOs), eOs?.message ?? "通ってしまった");
        const { error: eSt } = await staffOn.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: "nox-verify-s33-x4@example.com", p_cast_id: c2.id });
        check("段33 staff forbidden", forbidden(eSt), eSt?.message ?? "通ってしまった");
        const { error: eCa } = await castA.rpc("cast_invite", { p_auth_user_id: randomUUID(), p_email: "nox-verify-s33-x5@example.com", p_cast_id: c2.id });
        check("段33 cast forbidden", forbidden(eCa), eCa?.message ?? "通ってしまった");
      } finally {
        await castTmp.auth.signOut().catch(() => undefined);
        await wipe33();
        if (authId) await admin.auth.admin.deleteUser(authId).catch(() => undefined);
      }
      // 非汚染の物理確認（users/casts 全消し＝rls 固定カウント［memberships 9行・casts A1=2人・ranking 2行］反転ゼロ）
      const { data: uLeft } = await admin.from("users").select("id").eq("email", TMP_EMAIL);
      const { data: cLeft } = await admin.from("casts").select("id").like("name", `${PREFIX}%`);
      check("段33 掃除確認: 一時 users/casts 0行（固定カウント非汚染）",
        (uLeft ?? []).length === 0 && (cLeft ?? []).length === 0, `users=${(uLeft ?? []).length}, casts=${(cLeft ?? []).length}`);
    }
  }

  // ── 段34: ノルマ拡張＋送りベース（mig0042）実書込＋認可マトリクス ──
  //   新2軸（sales_target/shimei_target）＝表示のみ（payOf/normPenalty/collect 非接続）＝ここでは器と認可のみ検証。
  //   period は段内動的（2031-12）＝rls ⑥ の固定 fixture（castA1a×2026-07）と衝突させない。
  //   finally: cast_norms 一時行削除＋store A1 settings_json 厳密復元（固定カウント反転ゼロ・段31 方式）。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const S34_PERIOD = "2031-12";

    const { data: s34Store } = await admin.from("stores").select("id, org_id, settings_json").eq("name", STORE_A1).single();
    const baseline34 = (s34Store?.settings_json ?? null) as Record<string, unknown> | null;

    const owner = await signInShared("段34", "ownerA");
    const mgr = await signInShared("段34", "managerA1");
    const castA = await signInShared("段34", "castA1a");
    // 対象 cast＝castA1a 本人（auth_cast_id で解決＝fixture 名依存を作らない）
    const { data: castIdA } = castA ? await castA.rpc("auth_cast_id") : { data: null };

    // 前回遺物掃除（段内動的 period の行のみ）
    await admin.from("cast_norms").delete().eq("period", S34_PERIOD);

    check("段34（準備）店/セッション/castA1a cast_id 解決", !!s34Store && !!owner && !!mgr && !!castA && typeof castIdA === "string");

    if (s34Store && owner && mgr && castA && typeof castIdA === "string") {
      try {
        // ═══ a. manager set_cast_norm 6引数 正系（uuid 返却・4軸充填・行生成）═══
        const { data: nid, error: eScn } = await mgr.rpc("set_cast_norm", {
          p_cast_id: castIdA, p_period: S34_PERIOD, p_days_target: 10, p_dohan_target: 3,
          p_sales_target: 1_500_000, p_shimei_target: 8,
        });
        check("段34 ★manager set_cast_norm 6引数 成功（uuid 返却＝自店可）", !eScn && typeof nid === "string", eScn?.message);
        const { data: nRow } = await admin.from("cast_norms")
          .select("days_target, dohan_target, sales_target, shimei_target").eq("id", nid as string).single();
        check("段34 cast_norms 行生成（4軸充填 10/3/1500000/8）",
          nRow?.days_target === 10 && nRow?.dohan_target === 3
          && nRow?.sales_target === 1_500_000 && nRow?.shimei_target === 8, JSON.stringify(nRow));
        const { data: aud34 } = await owner.from("audit_logs").select("action").eq("action", "set_cast_norm")
          .eq("target", `cast_norms:${nid}`).limit(1);
        check("段34 audit: set_cast_norm 行生成", (aud34 ?? []).length === 1, JSON.stringify(aud34));

        // ═══ b. cast 自行 SELECT＝新列可視（パターン1）＋ cast setter forbidden ═══
        const { data: selfRows, error: eSelf } = await castA.from("cast_norms")
          .select("days_target, dohan_target, sales_target, shimei_target").eq("period", S34_PERIOD);
        check("段34 ★cast 自行 SELECT＝新列可視（パターン1・sales/shimei 読める）",
          !eSelf && (selfRows ?? []).length === 1
          && selfRows?.[0]?.sales_target === 1_500_000 && selfRows?.[0]?.shimei_target === 8,
          eSelf?.message ?? JSON.stringify(selfRows));
        const { error: eCa1 } = await castA.rpc("set_cast_norm", {
          p_cast_id: castIdA, p_period: S34_PERIOD, p_days_target: 0, p_dohan_target: 0,
          p_sales_target: 0, p_shimei_target: 0,
        });
        check("段34 cast set_cast_norm forbidden", forbidden(eCa1), eCa1?.message ?? "通ってしまった");
        const { error: eCa2 } = await castA.rpc("set_store_norm_config", {
          p_store_id: s34Store.id, p_sales_enabled: true, p_shimei_enabled: true, p_shimei_scope: "hon",
        });
        check("段34 cast set_store_norm_config forbidden", forbidden(eCa2), eCa2?.message ?? "通ってしまった");
        const { error: eCa3 } = await castA.rpc("set_store_okuri_base", { p_store_id: s34Store.id, p_amount: 1000 });
        check("段34 cast set_store_okuri_base forbidden", forbidden(eCa3), eCa3?.message ?? "通ってしまった");

        // ═══ c. owner 店設定 setter 正系（settings_json 4キー反映）═══
        const { error: eNc } = await owner.rpc("set_store_norm_config", {
          p_store_id: s34Store.id, p_sales_enabled: true, p_shimei_enabled: true, p_shimei_scope: "hon_jonai",
        });
        check("段34 ★owner set_store_norm_config 成功", !eNc, eNc?.message);
        const { error: eOb } = await owner.rpc("set_store_okuri_base", { p_store_id: s34Store.id, p_amount: 3000 });
        check("段34 ★owner set_store_okuri_base 成功", !eOb, eOb?.message);
        const { data: stAfter } = await admin.from("stores").select("settings_json").eq("id", s34Store.id).single();
        const sj = (stAfter?.settings_json ?? {}) as Record<string, unknown>;
        check("段34 settings_json 4キー反映（sales/shimei enabled・scope=hon_jonai・okuri_base=3000）",
          sj.sales_norm_enabled === true && sj.shimei_norm_enabled === true
          && sj.shimei_norm_scope === "hon_jonai" && sj.okuri_base_amount === 3000, JSON.stringify(sj));

        // ═══ d. 負系: manager 店設定 setter forbidden（owner 限定＝段31-f 型）＋ null/不正値拒否 ═══
        const { error: eM1 } = await mgr.rpc("set_store_norm_config", {
          p_store_id: s34Store.id, p_sales_enabled: false, p_shimei_enabled: false, p_shimei_scope: "hon",
        });
        check("段34 manager set_store_norm_config forbidden（owner 限定）", forbidden(eM1), eM1?.message ?? "通ってしまった");
        const { error: eM2 } = await mgr.rpc("set_store_okuri_base", { p_store_id: s34Store.id, p_amount: 500 });
        check("段34 manager set_store_okuri_base forbidden（owner 限定）", forbidden(eM2), eM2?.message ?? "通ってしまった");
        const { error: eN1 } = await owner.rpc("set_store_norm_config", {
          p_store_id: s34Store.id, p_sales_enabled: null, p_shimei_enabled: true, p_shimei_scope: "hon",
        });
        check("段34 set_store_norm_config null = bad sales_enabled", has(eN1, "bad sales_enabled"), eN1?.message ?? "通ってしまった");
        const { error: eN2 } = await owner.rpc("set_store_norm_config", {
          p_store_id: s34Store.id, p_sales_enabled: true, p_shimei_enabled: true, p_shimei_scope: "both",
        });
        check("段34 set_store_norm_config 不正 scope = bad shimei_scope", has(eN2, "bad shimei_scope"), eN2?.message ?? "通ってしまった");
        const { error: eN3 } = await owner.rpc("set_store_okuri_base", { p_store_id: s34Store.id, p_amount: null });
        check("段34 set_store_okuri_base null = bad amount", has(eN3, "bad amount"), eN3?.message ?? "通ってしまった");
        const { error: eN4 } = await owner.rpc("set_cast_norm", {
          p_cast_id: castIdA, p_period: S34_PERIOD, p_days_target: 0, p_dohan_target: 0,
          p_sales_target: null, p_shimei_target: 0,
        });
        check("段34 set_cast_norm null = bad sales_target", has(eN4, "bad sales_target"), eN4?.message ?? "通ってしまった");
        const { error: eN5 } = await owner.rpc("set_cast_norm", {
          p_cast_id: castIdA, p_period: S34_PERIOD, p_days_target: 0, p_dohan_target: 0,
          p_sales_target: 0, p_shimei_target: null,
        });
        check("段34 set_cast_norm null = bad shimei_target", has(eN5, "bad shimei_target"), eN5?.message ?? "通ってしまった");
      } finally {
        await admin.from("cast_norms").delete().eq("period", S34_PERIOD);
        // store A1 settings_json を厳密復元（後続 rls・段31 前提を汚さない）
        await admin.from("stores").update({ settings_json: baseline34 }).eq("id", s34Store.id);
      }
      // 非汚染の物理確認（cast_norms 一時行 0行・settings_json 復元）
      const { data: nLeft } = await admin.from("cast_norms").select("id").eq("period", S34_PERIOD);
      const { data: stFin34 } = await admin.from("stores").select("settings_json").eq("id", s34Store.id).single();
      const fin34 = (stFin34?.settings_json ?? null) as Record<string, unknown> | null;
      check("段34 掃除確認: cast_norms 一時行 0行・store settings_json 復元（固定カウント非汚染）",
        (nLeft ?? []).length === 0
        && JSON.stringify(fin34 ?? null) === JSON.stringify(baseline34 ?? null),
        `norms=${(nLeft ?? []).length}, settings=${JSON.stringify(fin34)}`);
    }
  }

  // ── 段35: F4a キオスク打刻（mig0043）遮断マトリクス＋PIN 状態遷移＋認可 ──
  //   kiosk_devices 方式＝users/memberships 非作成。kiosk セッションは auth_org_id() null
  //   → 既存 RLS/RPC 全遮断（構成証明）をここで実測する。
  //   finally: kiosk punches→cast_pin→kiosk_devices→一時 casts→auth deleteUser の依存順全消し。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const PREFIX = "NOX-VERIFY-段35";

    const { data: s35A1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
    const { data: s35A2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();

    // 合成 email（cast/invite の c- 同型・kiosk は k- プレフィクス・送信不能予約ドメイン）
    const kEmail = s35A1
      ? `k-verify35@o-${(s35A1.org_id as string).replace(/-/g, "").slice(0, 8)}.nox.local`
      : "k-verify35@o-unknown.nox.local";

    // 前回遺物掃除（依存順: punches→cast_pin→kiosk_devices→一時 casts。auth user は device 行から回収）
    const wipe35 = async () => {
      if (s35A1) await admin.from("punches").delete().eq("source", "kiosk").eq("store_id", s35A1.id);
      if (s35A1) {
        const { data: a1Casts } = await admin.from("casts").select("id").eq("store_id", s35A1.id);
        const ids = (a1Casts ?? []).map((r) => r.id as string);
        if (ids.length) await admin.from("cast_pin").delete().in("cast_id", ids);
      }
      const { data: oldDev } = await admin.from("kiosk_devices").select("auth_user_id").like("label", PREFIX + "%");
      for (const d of oldDev ?? []) await admin.auth.admin.deleteUser(d.auth_user_id as string).catch(() => undefined);
      await admin.from("kiosk_devices").delete().like("label", PREFIX + "%");
      await admin.from("casts").delete().like("name", PREFIX + "%");
    };
    await wipe35();

    // 一時 cast: A2（同 org 他店＝not_found/他店 manager 用）・A1 inactive（inactive cast 拒否用）
    const { data: cA2tmp } = s35A2
      ? await admin.from("casts").insert({ org_id: s35A2.org_id, store_id: s35A2.id, name: `${PREFIX}-castA2`, is_active: true }).select("id").single()
      : { data: null };
    const { data: cInactive } = s35A1
      ? await admin.from("casts").insert({ org_id: s35A1.org_id, store_id: s35A1.id, name: `${PREFIX}-inactive`, is_active: false }).select("id").single()
      : { data: null };

    // kiosk 用 auth user（実 auth・users/memberships 行は作らない＝kiosk_devices 方式）
    let kioskAuthId = "";
    {
      const { data: cu, error: eCu } = await admin.auth.admin.createUser({
        email: kEmail, password: env.SEED_PASSWORD, email_confirm: true,
      });
      if (!eCu && cu?.user) kioskAuthId = cu.user.id;
      else if (/already|registered|exists/i.test(eCu?.message ?? "")) {
        // 前回 run が createUser 後に落ちた孤児 → listUsers で回収して作り直し
        const { data: lu } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const orphan = lu?.users?.find((u) => u.email === kEmail);
        if (orphan) {
          await admin.auth.admin.deleteUser(orphan.id).catch(() => undefined);
          const { data: cu2 } = await admin.auth.admin.createUser({
            email: kEmail, password: env.SEED_PASSWORD, email_confirm: true,
          });
          kioskAuthId = cu2?.user?.id ?? "";
        }
      }
      if (!kioskAuthId) fails.push("段35 kiosk auth 生成失敗");
    }

    const owner = await signInShared("段35", "ownerA");
    const mgr = await signInShared("段35", "managerA1");
    const castA = await signInShared("段35", "castA1a");
    const { data: castIdA } = castA ? await castA.rpc("auth_cast_id") : { data: null };
    // castA1b = A1 のもう1人の active cast（rls 固定カウント A1=2人前提）＝PIN 未設定のまま no_pin/has_pin=false 用
    const { data: a1Active } = s35A1
      ? await admin.from("casts").select("id, name").eq("store_id", s35A1.id).eq("is_active", true)
      : { data: null };
    const castIdB = ((a1Active ?? []) as { id: string }[]).map((r) => r.id).find((id) => id !== castIdA) ?? null;

    const kiosk = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    check("段35（準備）店2/一時 cast 2/auth/セッション/castA1a・A1b 解決",
      !!s35A1 && !!s35A2 && !!cA2tmp && !!cInactive && !!kioskAuthId && !!owner && !!mgr && !!castA
      && typeof castIdA === "string" && typeof castIdB === "string");

    if (s35A1 && s35A2 && cA2tmp && cInactive && kioskAuthId && owner && mgr && castA
        && typeof castIdA === "string" && typeof castIdB === "string") {
      let deviceId: string | null = null;
      try {
        // ═══ provision 正系（owner）＋ kiosk signIn ═══
        const { data: devId, error: eProv } = await owner.rpc("kiosk_provision", {
          p_auth_user_id: kioskAuthId, p_store_id: s35A1.id, p_label: `${PREFIX}-dev1`,
        });
        check("段35 ★owner kiosk_provision 成功（uuid 返却）", !eProv && typeof devId === "string", eProv?.message);
        deviceId = (devId as string) ?? null;
        const { data: audProv } = await owner.from("audit_logs").select("action").eq("action", "kiosk_provision")
          .eq("target", `kiosk_devices:${devId}`).limit(1);
        check("段35 audit: kiosk_provision 行生成", (audProv ?? []).length === 1, JSON.stringify(audProv));

        const { error: eKSign } = await kiosk.auth.signInWithPassword({ email: kEmail, password: env.SEED_PASSWORD });
        check("段35 ★kiosk アカウントで signIn 成功（users/memberships 非作成のまま）", !eKSign, eKSign?.message);

        // ═══ e-1〜3. provision 負系（deactivate 前に実施）═══
        const { data: ownerUidRow } = await admin.from("users").select("auth_user_id")
          .eq("email", FIXTURE_USERS.ownerA.email).single();
        const { error: eBt } = await owner.rpc("kiosk_provision", {
          p_auth_user_id: ownerUidRow!.auth_user_id, p_store_id: s35A1.id, p_label: "x",
        });
        check("段35 実在人物 auth uid = bad target（人物アカウントの kiosk 化封じ）", has(eBt, "bad target"), eBt?.message ?? "通ってしまった");
        const { error: eDup } = await owner.rpc("kiosk_provision", {
          p_auth_user_id: randomUUID(), p_store_id: s35A1.id, p_label: "x",
        });
        check("段35 同店2台目 = already provisioned（1店1台）", has(eDup, "already provisioned"), eDup?.message ?? "通ってしまった");
        const { error: eMgrProv } = await mgr.rpc("kiosk_provision", {
          p_auth_user_id: randomUUID(), p_store_id: s35A1.id, p_label: "x",
        });
        check("段35 manager kiosk_provision forbidden（owner 限定）", forbidden(eMgrProv), eMgrProv?.message ?? "通ってしまった");

        // ═══ a. ★遮断マトリクス（kiosk セッション＝auth_org_id() null の構成証明を実測）═══
        for (const tbl of ["casts", "punches", "shifts", "attendance", "cast_norms", "payslips", "checks"]) {
          const { data: rows, error: eT } = await kiosk.from(tbl).select("id").limit(5);
          check(`段35 ★kiosk ${tbl} SELECT = 0行（RLS 遮断）`, !eT && (rows ?? []).length === 0,
            eT?.message ?? `got ${(rows ?? []).length}行`);
        }
        {
          const { error: eP } = await kiosk.from("cast_pin").select("cast_id").limit(1);
          check("段35 ★kiosk cast_pin SELECT = permission denied（deny-all）", has(eP, "permission denied"), eP?.message ?? "実行できてしまった");
          const { error: eD } = await kiosk.from("kiosk_devices").select("id").limit(1);
          check("段35 ★kiosk kiosk_devices SELECT = permission denied（deny-all）", has(eD, "permission denied"), eD?.message ?? "実行できてしまった");
        }
        {
          const { error: e1 } = await kiosk.rpc("punch_self", { p_type: "in", p_lat: null, p_lng: null });
          check("段35 ★kiosk punch_self 拒否（forbidden/no cast 系）",
            !!e1 && /forbidden|no cast/.test(e1.message ?? ""), e1?.message ?? "通ってしまった");
          const { error: e2 } = await kiosk.rpc("get_cast_sales", { p_store_id: s35A1.id, p_from: "2026-07-01", p_to: "2026-07-02" });
          check("段35 ★kiosk get_cast_sales forbidden", forbidden(e2), e2?.message ?? "通ってしまった");
          const { error: e3 } = await kiosk.rpc("set_cast_norm", {
            p_cast_id: castIdA, p_period: "2031-11", p_days_target: 0, p_dohan_target: 0,
            p_sales_target: 0, p_shimei_target: 0,
          });
          check("段35 ★kiosk set_cast_norm forbidden", forbidden(e3), e3?.message ?? "通ってしまった");
        }

        // ═══ c. set_cast_pin（castA1a のみ設定・castA1b は未設定のまま no_pin 用）═══
        const { error: ePinO } = await owner.rpc("set_cast_pin", { p_cast_id: castIdA, p_pin: "5678" });
        check("段35 owner set_cast_pin 成功", !ePinO, ePinO?.message);
        const { data: audPin } = await owner.from("audit_logs").select("before_json, after_json")
          .eq("action", "set_cast_pin").eq("target", `cast_pin:${castIdA}`).limit(1);
        const audPinStr = JSON.stringify(audPin ?? []);
        check("段35 ★audit に PIN/ハッシュ非含有（'5678'/'pin_hash' 不在・行は存在）",
          (audPin ?? []).length === 1 && !audPinStr.includes("5678") && !audPinStr.includes("pin_hash"), audPinStr);
        const { error: ePinM } = await mgr.rpc("set_cast_pin", { p_cast_id: castIdA, p_pin: "1234" });
        check("段35 manager 自店 set_cast_pin 成功（upsert 上書き）", !ePinM, ePinM?.message);
        const { error: ePinOs } = await mgr.rpc("set_cast_pin", { p_cast_id: cA2tmp.id, p_pin: "1234" });
        check("段35 manager 他店 set_cast_pin forbidden", forbidden(ePinOs), ePinOs?.message ?? "通ってしまった");
        const { error: ePinC } = await castA.rpc("set_cast_pin", { p_cast_id: castIdA, p_pin: "1234" });
        check("段35 cast set_cast_pin forbidden", forbidden(ePinC), ePinC?.message ?? "通ってしまった");
        const { error: ePinBad } = await owner.rpc("set_cast_pin", { p_cast_id: castIdA, p_pin: "12a4" });
        check("段35 set_cast_pin '12a4' = bad pin", has(ePinBad, "bad pin"), ePinBad?.message ?? "通ってしまった");
        const { error: ePinIn } = await owner.rpc("set_cast_pin", { p_cast_id: cInactive.id, p_pin: "1234" });
        check("段35 inactive cast = inactive cast 拒否", has(ePinIn, "inactive cast"), ePinIn?.message ?? "通ってしまった");

        // ═══ b. kiosk_cast_list（kiosk 唯一の読み口）═══
        const { data: klist, error: eKl } = await kiosk.rpc("kiosk_cast_list");
        type KRow = { cast_id: string; cast_name: string; has_pin: boolean };
        const kRows = (klist ?? []) as KRow[];
        check("段35 ★kiosk_cast_list = 自店 active のみ（A1=2人・A1a has_pin=true・A1b false）",
          !eKl && kRows.length === 2
          && kRows.find((r) => r.cast_id === castIdA)?.has_pin === true
          && kRows.find((r) => r.cast_id === castIdB)?.has_pin === false,
          eKl?.message ?? JSON.stringify(kRows));
        check("段35 kiosk_cast_list に他店/inactive 不可視",
          !kRows.some((r) => r.cast_id === cA2tmp.id) && !kRows.some((r) => r.cast_id === cInactive.id),
          JSON.stringify(kRows.map((r) => r.cast_name)));
        const { data: oList } = await owner.rpc("kiosk_cast_list");
        check("段35 owner kiosk_cast_list = 0行（fail-closed）", ((oList ?? []) as KRow[]).length === 0, JSON.stringify(oList));
        const { data: cList } = await castA.rpc("kiosk_cast_list");
        check("段35 cast kiosk_cast_list = 0行（fail-closed）", ((cList ?? []) as KRow[]).length === 0, JSON.stringify(cList));

        // ═══ d. kiosk_punch 状態遷移（castA1a・正 PIN='1234'）═══
        type KPunch = { ok: boolean; reason?: string; punch_id?: string; locked_until?: string };
        const kp = async (pin: string, type = "in"): Promise<KPunch> => {
          const { data, error } = await kiosk.rpc("kiosk_punch", { p_cast_id: castIdA, p_pin: pin, p_type: type });
          if (error) return { ok: false, reason: `RPC_ERROR:${error.message}` };
          return data as KPunch;
        };
        const pinRow = async () => {
          const { data } = await admin.from("cast_pin").select("fail_count, locked_until").eq("cast_id", castIdA).single();
          return data as { fail_count: number; locked_until: string | null };
        };

        const r1 = await kp("1234");
        check("段35 ★正PIN = ok:true（punch_id uuid 返却）", r1.ok === true && typeof r1.punch_id === "string", JSON.stringify(r1));
        const { data: pRow1 } = await admin.from("punches")
          .select("cast_id, store_id, org_id, type, source, punched_at").eq("id", r1.punch_id ?? "").single();
        check("段35 ★punches 実INSERT検証（source='kiosk'・NOT NULL 充足＝0077教訓）",
          pRow1?.source === "kiosk" && pRow1?.type === "in" && pRow1?.cast_id === castIdA
          && pRow1?.store_id === s35A1.id && !!pRow1?.org_id && !!pRow1?.punched_at, JSON.stringify(pRow1));
        const { data: audKp } = await owner.from("audit_logs").select("action")
          .eq("action", "kiosk_punch").eq("target", `punches:${r1.punch_id}`).limit(1);
        check("段35 audit: kiosk_punch 直接 INSERT（actor null 経路）行生成", (audKp ?? []).length === 1, JSON.stringify(audKp));

        const wrongs: KPunch[] = [];
        for (let i = 0; i < 4; i++) wrongs.push(await kp("9999"));
        check("段35 誤PIN×4 = 全て wrong_pin", wrongs.every((w) => w.ok === false && w.reason === "wrong_pin"), JSON.stringify(wrongs));
        const st4 = await pinRow();
        check("段35 fail_count 実値 = 4", st4.fail_count === 4, JSON.stringify(st4));

        const r5 = await kp("9999");
        check("段35 5回目 = locked＋locked_until 返却", r5.ok === false && r5.reason === "locked" && !!r5.locked_until, JSON.stringify(r5));
        const stL = await pinRow();
        check("段35 cast_pin: fail_count 0 リセット＋locked_until 未来", stL.fail_count === 0 && !!stL.locked_until && new Date(stL.locked_until) > new Date(), JSON.stringify(stL));

        const rL = await kp("1234");
        check("段35 ロック中は正PINでも locked", rL.ok === false && rL.reason === "locked", JSON.stringify(rL));

        // テスト解除: locked_until を過去へ（admin 直接 UPDATE）
        await admin.from("cast_pin").update({ locked_until: new Date(Date.now() - 60_000).toISOString() }).eq("cast_id", castIdA);
        const r6 = await kp("1234");
        check("段35 ★ロック解除後 正PIN = ok:true", r6.ok === true && typeof r6.punch_id === "string", JSON.stringify(r6));
        const st6 = await pinRow();
        check("段35 成功でカウンタ復元（fail_count 0・locked_until null）", st6.fail_count === 0 && st6.locked_until === null, JSON.stringify(st6));

        const rB = await kp("123");
        const stB = await pinRow();
        check("段35 bad_pin（3桁・形式不正）= fail_count 非増加", rB.ok === false && rB.reason === "bad_pin" && stB.fail_count === 0, JSON.stringify({ rB, stB }));
        const { data: rNf } = await kiosk.rpc("kiosk_punch", { p_cast_id: cA2tmp.id, p_pin: "1234", p_type: "in" });
        check("段35 他店 cast = not_found（存在オラクル封じ）", (rNf as KPunch)?.reason === "not_found", JSON.stringify(rNf));
        const { data: rNp } = await kiosk.rpc("kiosk_punch", { p_cast_id: castIdB, p_pin: "1234", p_type: "in" });
        check("段35 PIN 未設定 cast = no_pin", (rNp as KPunch)?.reason === "no_pin", JSON.stringify(rNp));

        // ═══ e-4. deactivate → 失効実測 ═══
        const { error: eNf } = await owner.rpc("kiosk_deactivate", { p_device_id: randomUUID() });
        check("段35 kiosk_deactivate 不明 id = not found", has(eNf, "not found"), eNf?.message ?? "通ってしまった");
        const { error: eDeact } = await owner.rpc("kiosk_deactivate", { p_device_id: deviceId });
        check("段35 ★owner kiosk_deactivate 成功", !eDeact, eDeact?.message);
        const { data: klist2 } = await kiosk.rpc("kiosk_cast_list");
        check("段35 ★deactivate 後 kiosk_cast_list = 0行（is_active 失効）", ((klist2 ?? []) as KRow[]).length === 0, JSON.stringify(klist2));
        const { error: eKpDead } = await kiosk.rpc("kiosk_punch", { p_cast_id: castIdA, p_pin: "1234", p_type: "out" });
        check("段35 ★deactivate 後 kiosk_punch forbidden", forbidden(eKpDead), eKpDead?.message ?? "通ってしまった");
      } finally {
        await kiosk.auth.signOut().catch(() => undefined);
        await wipe35();
        if (kioskAuthId) await admin.auth.admin.deleteUser(kioskAuthId).catch(() => undefined);
      }
      // 非汚染の物理確認（punches source=kiosk 0行・cast_pin 0行・kiosk_devices 0行・一時 casts 0行）
      const { data: pLeft } = await admin.from("punches").select("id").eq("source", "kiosk").eq("store_id", s35A1.id);
      const { data: pinLeft } = await admin.from("cast_pin").select("cast_id").in("cast_id", [castIdA, castIdB]);
      const { data: dLeft } = await admin.from("kiosk_devices").select("id").like("label", `${PREFIX}%`);
      const { data: cLeft } = await admin.from("casts").select("id").like("name", `${PREFIX}%`);
      check("段35 掃除確認: kiosk punches/cast_pin/kiosk_devices/一時 casts 全消し（固定カウント非汚染）",
        (pLeft ?? []).length === 0 && (pinLeft ?? []).length === 0 && (dLeft ?? []).length === 0 && (cLeft ?? []).length === 0,
        `punches=${(pLeft ?? []).length}, pin=${(pinLeft ?? []).length}, devices=${(dLeft ?? []).length}, casts=${(cLeft ?? []).length}`);
    }
  }

  // ── 段36: F4b レシート印刷（mig0044/0045）設定→enqueue→claim→result の実書込フロー＋認可 ──
  //   printer_config/print_jobs は deny-all＝経路は RPC（enqueue=4枝）と service_role（claim/result）のみ。
  //   伝票は admin 直 INSERT（RPC 非経由＝バック分配等の副作用なし・固定カウント制御）。
  //   finally: print_jobs→check_lines→checks→printer_config 行削除＋settings_json 厳密復元。
  {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
    const forbidden = (e: { message?: string } | null) => has(e, "forbidden");
    const HEX24 = /^[0-9a-f]{24}$/;

    const { data: s36A1 } = await admin.from("stores").select("id, org_id, settings_json").eq("name", STORE_A1).single();
    const baseline36 = (s36A1?.settings_json ?? null) as Record<string, unknown> | null;
    const { data: seat36 } = s36A1
      ? await admin.from("seats").select("id").eq("store_id", s36A1.id).limit(1).single()
      : { data: null };
    const { data: ownerRow36 } = await admin.from("users").select("id")
      .eq("email", FIXTURE_USERS.ownerA.email).single();

    const owner = await signInShared("段36", "ownerA");
    const mgr = await signInShared("段36", "managerA1");
    const castA = await signInShared("段36", "castA1a");

    // 段内動的伝票: closed（pay_group A×2 + B×1）と open（'not closed' 負系用）
    let ch1: string | null = null; // closed
    let ch2: string | null = null; // open
    const wipe36 = async () => {
      const ids = [ch1, ch2].filter(Boolean) as string[];
      if (ids.length) {
        await admin.from("print_jobs").delete().in("check_id", ids);
        await admin.from("check_lines").delete().in("check_id", ids);
        await admin.from("checks").delete().in("id", ids);
      }
      if (s36A1) await admin.from("printer_config").delete().eq("store_id", s36A1.id);
    };

    if (s36A1 && seat36 && ownerRow36) {
      const mk = async (status: "closed" | "open"): Promise<string | null> => {
        const { data } = await admin.from("checks").insert({
          org_id: s36A1.org_id, store_id: s36A1.id, seat_id: seat36.id,
          status, started_at: new Date().toISOString(),
          closed_at: status === "closed" ? new Date().toISOString() : null,
          total: 11000, service_rate: 10, round_unit: 100, round_mode: "down",
          created_by: ownerRow36.id,
        }).select("id").single();
        return (data?.id as string) ?? null;
      };
      ch1 = await mk("closed");
      ch2 = await mk("open");
      if (ch1) {
        await admin.from("check_lines").insert([
          { org_id: s36A1.org_id, store_id: s36A1.id, check_id: ch1, kind: "set", pay_group: "A", name_snapshot: "NOX-VERIFY-段36セット", unit_price_snapshot: 5000, qty: 1, line_total: 5000 },
          { org_id: s36A1.org_id, store_id: s36A1.id, check_id: ch1, kind: "drink", pay_group: "A", name_snapshot: "NOX-VERIFY-段36ドリンク", unit_price_snapshot: 1500, qty: 2, line_total: 3000 },
          { org_id: s36A1.org_id, store_id: s36A1.id, check_id: ch1, kind: "set", pay_group: "B", name_snapshot: "NOX-VERIFY-段36セットB", unit_price_snapshot: 3000, qty: 1, line_total: 3000 },
        ]);
      }
      if (ch2) {
        await admin.from("check_lines").insert([
          { org_id: s36A1.org_id, store_id: s36A1.id, check_id: ch2, kind: "set", pay_group: "A", name_snapshot: "NOX-VERIFY-段36オープン", unit_price_snapshot: 5000, qty: 1, line_total: 5000 },
        ]);
      }
    }

    check("段36（準備）店/seat/owner行/伝票2/セッション解決",
      !!s36A1 && !!seat36 && !!ownerRow36 && !!ch1 && !!ch2 && !!owner && !!mgr && !!castA);

    if (s36A1 && seat36 && ownerRow36 && ch1 && ch2 && owner && mgr && castA) {
      try {
        // ═══ a. printer disabled（config 無し→enabled=false とも拒否）═══
        const { error: eDis1 } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "A" });
        check("段36 config 無し enqueue = printer disabled", has(eDis1, "printer disabled"), eDis1?.message ?? "通ってしまった");
        const { error: eSet0 } = await owner.rpc("set_printer_config", { p_store_id: s36A1.id, p_enabled: false, p_serial: null });
        check("段36 set_printer_config(false) 成功", !eSet0, eSet0?.message);
        const { error: eDis2 } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "A" });
        check("段36 enabled=false enqueue = printer disabled", has(eDis2, "printer disabled"), eDis2?.message ?? "通ってしまった");

        // ═══ b. 正系設定＋rotate（★token 値は get に非含有）═══
        const { error: eSet1 } = await owner.rpc("set_printer_config", { p_store_id: s36A1.id, p_enabled: true, p_serial: null });
        check("段36 ★set_printer_config(true) 成功", !eSet1, eSet1?.message);
        const { data: cfg0 } = await owner.rpc("get_printer_config", { p_store_id: s36A1.id });
        const c0 = cfg0 as { printer_enabled: boolean; has_token: boolean };
        check("段36 get_printer_config: enabled=true・has_token=false", c0?.printer_enabled === true && c0?.has_token === false, JSON.stringify(cfg0));
        const { data: tok, error: eRot } = await owner.rpc("rotate_store_token", { p_store_id: s36A1.id });
        check("段36 ★rotate_store_token = 24hex 一度返し", !eRot && typeof tok === "string" && HEX24.test(tok), eRot?.message ?? String(tok));
        const token = tok as string;
        const { data: cfg1 } = await owner.rpc("get_printer_config", { p_store_id: s36A1.id });
        check("段36 ★get: has_token=true かつ token 値非含有",
          (cfg1 as { has_token: boolean })?.has_token === true && !JSON.stringify(cfg1).includes(token), JSON.stringify(cfg1));

        // ═══ c. owner 限定負系 ═══
        const { error: eM1 } = await mgr.rpc("set_printer_config", { p_store_id: s36A1.id, p_enabled: true, p_serial: null });
        check("段36 manager set_printer_config forbidden", forbidden(eM1), eM1?.message ?? "通ってしまった");
        const { error: eM2 } = await mgr.rpc("rotate_store_token", { p_store_id: s36A1.id });
        check("段36 manager rotate_store_token forbidden", forbidden(eM2), eM2?.message ?? "通ってしまった");
        const { error: eM3 } = await mgr.rpc("get_printer_config", { p_store_id: s36A1.id });
        check("段36 manager get_printer_config forbidden", forbidden(eM3), eM3?.message ?? "通ってしまった");
        const { error: eN1 } = await owner.rpc("set_printer_config", { p_store_id: s36A1.id, p_enabled: null, p_serial: null });
        check("段36 set_printer_config null = bad enabled", has(eN1, "bad enabled"), eN1?.message ?? "通ってしまった");

        // ═══ d. enqueue 失敗系（4枝実測含む）═══
        const { error: eOpen } = await owner.rpc("print_enqueue", { p_check_id: ch2, p_pay_group: "A" });
        check("段36 open 伝票 enqueue = not closed", has(eOpen, "not closed"), eOpen?.message ?? "通ってしまった");
        const { error: eBadG } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "Z" });
        check("段36 不在 pay_group = bad pay_group", has(eBadG, "bad pay_group"), eBadG?.message ?? "通ってしまった");
        const { error: eCast } = await castA.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "A" });
        check("段36 cast（can_register off）enqueue forbidden（4枝実測）", forbidden(eCast), eCast?.message ?? "通ってしまった");

        // ═══ e. ★状態遷移: enqueue→already_queued→bad_state→claim→result→idempotent→is_reprint ═══
        type EnqRes = { job_id: string; is_reprint: boolean; already_queued: boolean };
        const { data: j1raw, error: eJ1 } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "A" });
        const j1 = j1raw as EnqRes;
        check("段36 ★enqueue 成功（is_reprint=false・already_queued=false）",
          !eJ1 && typeof j1?.job_id === "string" && j1.is_reprint === false && j1.already_queued === false,
          eJ1?.message ?? JSON.stringify(j1raw));
        const { data: jRow1 } = await admin.from("print_jobs")
          .select("org_id, store_id, check_id, pay_group, status, is_reprint, print_token, created_by").eq("id", j1.job_id).single();
        check("段36 ★job 行検証（NOT NULL 充足・queued・print_token 24hex・created_by=owner）",
          !!jRow1?.org_id && jRow1?.store_id === s36A1.id && jRow1?.check_id === ch1 && jRow1?.pay_group === "A"
          && jRow1?.status === "queued" && HEX24.test((jRow1?.print_token as string) ?? "")
          && jRow1?.created_by === ownerRow36.id, JSON.stringify(jRow1));
        const { data: j1again } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "A" });
        check("段36 二度押し = already_queued:true（同 job_id・二重印刷封じ）",
          (j1again as EnqRes)?.already_queued === true && (j1again as EnqRes)?.job_id === j1.job_id, JSON.stringify(j1again));

        const pt1 = jRow1!.print_token as string;
        const { data: rBad } = await admin.rpc("print_result", { p_store_token: token, p_print_token: pt1, p_success: true, p_error_code: null });
        check("段36 queued へ result = bad_state（printing のみ受理）",
          (rBad as { ok: boolean; reason?: string })?.reason === "bad_state", JSON.stringify(rBad));

        const { data: cl1 } = await admin.rpc("print_claim", { p_store_token: token, p_serial: null });
        type ClaimRes = { ok: boolean; found?: boolean; job_id?: string; print_token?: string; reason?: string };
        check("段36 ★claim = found:true（同 job・print_token 返却）",
          (cl1 as ClaimRes)?.found === true && (cl1 as ClaimRes)?.job_id === j1.job_id && (cl1 as ClaimRes)?.print_token === pt1,
          JSON.stringify(cl1));
        const { data: jRow2 } = await admin.from("print_jobs").select("status, claimed_at").eq("id", j1.job_id).single();
        check("段36 claim 後 = printing＋claimed_at 非null", jRow2?.status === "printing" && !!jRow2?.claimed_at, JSON.stringify(jRow2));

        const { data: rOk } = await admin.rpc("print_result", { p_store_token: token, p_print_token: pt1, p_success: true, p_error_code: null });
        check("段36 ★result(success) = printed", (rOk as { status?: string })?.status === "printed", JSON.stringify(rOk));
        const { data: jRow3 } = await admin.from("print_jobs").select("status, printed_at").eq("id", j1.job_id).single();
        check("段36 result 後 = printed＋printed_at 非null", jRow3?.status === "printed" && !!jRow3?.printed_at, JSON.stringify(jRow3));
        const { data: rIdem } = await admin.rpc("print_result", { p_store_token: token, p_print_token: pt1, p_success: true, p_error_code: null });
        check("段36 ★同 token 再 result = idempotent:true（プリンタ再送に安全）",
          (rIdem as { idempotent?: boolean })?.idempotent === true, JSON.stringify(rIdem));

        const { data: j2raw } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "A" });
        const j2 = j2raw as EnqRes;
        check("段36 ★printed 後の再 enqueue = is_reprint:true（新規 job）",
          j2?.is_reprint === true && j2?.already_queued === false && j2?.job_id !== j1.job_id, JSON.stringify(j2raw));

        // ═══ f. serial 照合（設定は token 不変・不一致 mismatch・一致で printing）═══
        const { error: eSer } = await owner.rpc("set_printer_config", { p_store_id: s36A1.id, p_enabled: true, p_serial: "TM-M30-001" });
        check("段36 serial 設定成功", !eSer, eSer?.message);
        const { data: cfg2 } = await owner.rpc("get_printer_config", { p_store_id: s36A1.id });
        check("段36 serial 設定は token 不変（has_token=true 維持）", (cfg2 as { has_token: boolean })?.has_token === true, JSON.stringify(cfg2));
        const { data: clMis } = await admin.rpc("print_claim", { p_store_token: token, p_serial: "WRONG-SERIAL" });
        check("段36 serial 不一致 = serial_mismatch", (clMis as ClaimRes)?.reason === "serial_mismatch", JSON.stringify(clMis));
        const { data: cl2 } = await admin.rpc("print_claim", { p_store_token: token, p_serial: "TM-M30-001" });
        check("段36 serial 一致 claim = J2 printing", (cl2 as ClaimRes)?.found === true && (cl2 as ClaimRes)?.job_id === j2.job_id, JSON.stringify(cl2));

        // ═══ g. claim 偽 token / 形式不正 / queued 空 ═══
        const { data: clUnk } = await admin.rpc("print_claim", { p_store_token: "deadbeefdeadbeefdeadbeef", p_serial: null });
        check("段36 偽 token（24hex）= unknown_token", (clUnk as ClaimRes)?.reason === "unknown_token", JSON.stringify(clUnk));
        const { error: eTokFmt } = await admin.rpc("print_claim", { p_store_token: "xyz", p_serial: null });
        check("段36 形式不正 token = bad token（raise）", has(eTokFmt, "bad token"), eTokFmt?.message ?? "通ってしまった");
        const { data: clEmpty } = await admin.rpc("print_claim", { p_store_token: token, p_serial: "TM-M30-001" });
        check("段36 queued 空 = found:false（空ポーリング応答の素）", (clEmpty as ClaimRes)?.ok === true && (clEmpty as ClaimRes)?.found === false, JSON.stringify(clEmpty));

        // ═══ h. ★claim/result は authenticated から呼べない（service_role 限定の実測）═══
        const { error: eAu1 } = await owner.rpc("print_claim", { p_store_token: token, p_serial: null });
        check("段36 ★owner print_claim = permission denied（service_role 限定）", isFnBlocked(eAu1), eAu1?.message ?? "実行できてしまった");
        const { error: eAu2 } = await owner.rpc("print_result", { p_store_token: token, p_print_token: pt1, p_success: true, p_error_code: null });
        check("段36 ★owner print_result = permission denied（service_role 限定）", isFnBlocked(eAu2), eAu2?.message ?? "実行できてしまった");

        // ═══ i. set_store_receipt_profile（settings_json 4キー）═══
        const { error: eRp } = await owner.rpc("set_store_receipt_profile", {
          p_store_id: s36A1.id, p_address: "東京都新宿区歌舞伎町1-2-3", p_tel: "03-1234-5678",
          p_reg_no: "T1234567890123", p_footer: "またのご来店をお待ちしております",
        });
        check("段36 ★set_store_receipt_profile 成功", !eRp, eRp?.message);
        const { data: st36 } = await admin.from("stores").select("settings_json").eq("id", s36A1.id).single();
        const sj36 = (st36?.settings_json ?? {}) as Record<string, unknown>;
        check("段36 settings_json 4キー反映",
          sj36.receipt_address === "東京都新宿区歌舞伎町1-2-3" && sj36.receipt_tel === "03-1234-5678"
          && sj36.invoice_reg_no === "T1234567890123" && sj36.receipt_footer === "またのご来店をお待ちしております",
          JSON.stringify(sj36));
        const { error: eRpM } = await mgr.rpc("set_store_receipt_profile", {
          p_store_id: s36A1.id, p_address: "", p_tel: "", p_reg_no: "", p_footer: "",
        });
        check("段36 manager set_store_receipt_profile forbidden", forbidden(eRpM), eRpM?.message ?? "通ってしまった");
        const { error: eReg } = await owner.rpc("set_store_receipt_profile", {
          p_store_id: s36A1.id, p_address: "", p_tel: "", p_reg_no: "T12345678901234", p_footer: "",
        });
        check("段36 T+14桁 = bad reg_no", has(eReg, "bad reg_no"), eReg?.message ?? "通ってしまった");
        const { error: eRegE } = await owner.rpc("set_store_receipt_profile", {
          p_store_id: s36A1.id, p_address: "住所のみ", p_tel: "", p_reg_no: "", p_footer: "",
        });
        check("段36 空 reg_no 可（未登録店対応）", !eRegE, eRegE?.message);

        // ═══ j. pay_group 'B' は独立（(check_id, pay_group) 単位の実証）═══
        const { data: j3raw } = await owner.rpc("print_enqueue", { p_check_id: ch1, p_pay_group: "B" });
        const j3 = j3raw as EnqRes;
        check("段36 ★pay_group B enqueue = is_reprint:false（group 独立）",
          j3?.is_reprint === false && j3?.already_queued === false, JSON.stringify(j3raw));
      } finally {
        await wipe36();
        await admin.from("stores").update({ settings_json: baseline36 }).eq("id", s36A1.id);
      }
      // 非汚染の物理確認
      const { data: jLeft } = await admin.from("print_jobs").select("id").in("check_id", [ch1, ch2]);
      const { data: cLeft36 } = await admin.from("checks").select("id").in("id", [ch1, ch2]);
      const { data: pcLeft } = await admin.from("printer_config").select("store_id").eq("store_id", s36A1.id);
      const { data: stFin36 } = await admin.from("stores").select("settings_json").eq("id", s36A1.id).single();
      check("段36 掃除確認: print_jobs/checks/printer_config 全消し＋settings_json 復元（固定カウント非汚染）",
        (jLeft ?? []).length === 0 && (cLeft36 ?? []).length === 0 && (pcLeft ?? []).length === 0
        && JSON.stringify((stFin36?.settings_json ?? null)) === JSON.stringify(baseline36 ?? null),
        `jobs=${(jLeft ?? []).length}, checks=${(cLeft36 ?? []).length}, cfg=${(pcLeft ?? []).length}, settings=${JSON.stringify(stFin36?.settings_json)}`);
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
