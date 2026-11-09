-- 0198_cast_loans.sql（裁定458＝前借りは「貸付」＝貸付台帳 view・本人確認（PIN）・返済の RPC・待遇プランの同意）
-- 翻訳元: live pg_get_functiondef（2026-11-06・0197b 適用後）＋生成器 docs/tmp/gen_0198.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の列／view／RPC は生成器の本文）
--   根拠＝台帳 裁定458（①〜⑥）／docs/tmp/advance_loan_scan.md の変更案 3・4（DDL）／仮置き 6 点は handpaste_0198.md 冒頭
-- 検証クエリ: docs/tmp/0198_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- ★1 comp_plans に advance_loan_agreed／advance_loan_agreed_at＋set_comp_plan の末尾に p_advance_loan_agreed（旧 32 引数は drop）
-- ★2 advances に ack_method／ack_at／ack_by（本人確認の印）
-- ★3 cast_loan_grant（adv_issue を呼んで ack を付ける・p_pin は cast_pin と照合）／cast_loan_repay（現金の返済＝deducted_amount）
-- ★4 view cast_loans（貸付台帳＝security_invoker）／cast_loan_balances（本人別の残高）
-- ★7 M-122（2026-11-09 同乗）: 監査系の FK（updated_by／created_by／set_by／granted_by／decided_by／confirmed_by／changed_by／locked_by／accepted_user_id＝nullable）を on delete set null に（デモ reset と退会で親の削除を止めない・本体の FK は不変）
-- ★6 裁定461（M-120 同乗）: cast_day_deductions_set＝cast 本人経路を forbidden に・staff の自店を店側に加える／cast_day_applied_of（新設＝店が付けた今日の控除の見え方）／kiosk_punch＝p_day_deductions は操作担当（staff 以上）が解錠中のときだけ受理・出勤 ok の返りに day_applied
-- ★教訓132: begin の直後に lock_timeout（comp_plans／advances の ALTER と稼働中の set_comp_plan の作り直しを 1 本で流す）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 裁定458 ③: 待遇プランの「前借り（貸付）の取扱いに同意」＝comp_plans の列 2＋set_comp_plan の末尾 1 引数（旧 32 引数は drop＝多重定義を残さない） ═══
alter table public.comp_plans add column if not exists advance_loan_agreed boolean not null default false;
alter table public.comp_plans add column if not exists advance_loan_agreed_at timestamptz;
comment on column public.comp_plans.advance_loan_agreed is '★0198（裁定458 ③）: 前借り（貸付）の取扱いに同意（プランの項目・本人の契約確認は cast_contract_acks）';
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text, p_slide_basis text DEFAULT 'sales'::text, p_slide_rank_ids uuid[] DEFAULT '{}'::uuid[], p_norm_days_target integer DEFAULT NULL::integer, p_norm_dohan_target integer DEFAULT NULL::integer, p_norm_sales_target integer DEFAULT NULL::integer, p_norm_shimei_target integer DEFAULT NULL::integer, p_slide_apply text DEFAULT NULL::text, p_slide_method text DEFAULT NULL::text, p_pt_rules jsonb DEFAULT NULL::jsonb, p_advance_loan_agreed boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad base'; end if;
  if p_hon_back is null or p_hon_back < 0 then raise exception 'bad hon_back'; end if;
  if p_jonai_back is null or p_jonai_back < 0 then raise exception 'bad jonai_back'; end if;
  if p_dohan_back is null or p_dohan_back < 0 then raise exception 'bad dohan_back'; end if;
  -- ★mig0086: 方式（円/本｜率）検証＝列 CHECK と同値を RPC 権威でも実施
  if p_hon_back_mode is null or p_hon_back_mode not in ('per_count','rate') then
    raise exception 'bad hon_back_mode';
  end if;
  if p_hon_back_rate is not null and (p_hon_back_rate < 0 or p_hon_back_rate > 100) then
    raise exception 'bad hon_back_rate';
  end if;
  if p_hon_back_mode = 'rate' and p_hon_back_rate is null then   -- ★12 0175 v2（CN-R ⑭）: per_count でも rate を持てる＝「固定額＋率」の併用（LINK 同伴 4,000 円＋小計 10%）
    raise exception 'bad hon_back_rate';
  end if;
  if p_jonai_back_mode is null or p_jonai_back_mode not in ('per_count','rate') then
    raise exception 'bad jonai_back_mode';
  end if;
  if p_jonai_back_rate is not null and (p_jonai_back_rate < 0 or p_jonai_back_rate > 100) then
    raise exception 'bad jonai_back_rate';
  end if;
  if p_jonai_back_mode = 'rate' and p_jonai_back_rate is null then   -- ★12 0175 v2（CN-R ⑭）: per_count でも rate を持てる＝「固定額＋率」の併用（LINK 同伴 4,000 円＋小計 10%）
    raise exception 'bad jonai_back_rate';
  end if;
  -- ★mig0115: dohan の方式検証（hon/jonai と同型・列 CHECK と二段）
  if p_dohan_back_mode is null or p_dohan_back_mode not in ('per_count','rate') then
    raise exception 'bad dohan_back_mode';
  end if;
  if p_dohan_back_rate is not null and (p_dohan_back_rate < 0 or p_dohan_back_rate > 100) then
    raise exception 'bad dohan_back_rate';
  end if;
  if p_dohan_back_mode = 'rate' and p_dohan_back_rate is null then   -- ★12 0175 v2（CN-R ⑭）: per_count でも rate を持てる＝「固定額＋率」の併用（LINK 同伴 4,000 円＋小計 10%）
    raise exception 'bad dohan_back_rate';
  end if;
  -- ★mig0115（裁定86-②）: dohan の率化は R-2b（同伴 cast_id 必須・分母の行由来化）まで封印。
  --   解錠は本ガード1行を外す RPC 差替のみ（mig 不要）
  -- ★12 0175 v2: 0115 の同伴率封印（'dohan rate requires R-2b'）は解錠＝R-2b（同伴 cast_id 必須・分母の行由来化）済み。CN-R ④の帯は plan_rate_bands
  -- ★0134（裁定113/123）: 商品販売バック方式の検証＝列 CHECK（0132）と二段
  --   product_rule=商品ごと / plan_rate=売上×率 / plan_fixed=販売数×固定額（円/1点）
  if p_product_back_mode is null or p_product_back_mode not in ('product_rule','plan_rate','plan_fixed') then
    raise exception 'bad product_back_mode';
  end if;
  if p_product_back_rate is not null and (p_product_back_rate < 0 or p_product_back_rate > 100) then
    raise exception 'bad product_back_rate';
  end if;
  if (p_product_back_mode = 'plan_rate') <> (p_product_back_rate is not null) then
    raise exception 'bad product_back_rate';
  end if;
  if p_product_back_fixed is not null and p_product_back_fixed < 0 then
    raise exception 'bad product_back_fixed';
  end if;
  if (p_product_back_mode = 'plan_fixed') <> (p_product_back_fixed is not null) then
    raise exception 'bad product_back_fixed';
  end if;
  -- ★7 0153（296 追補2／305-12）: 区分別固定額＝null 可・≥0・plan_fixed のときだけ指定できる（null＝一律 product_back_fixed）
  if p_product_back_fixed_hon is not null and p_product_back_fixed_hon < 0 then raise exception 'bad product_back_fixed_hon'; end if;
  if p_product_back_fixed_jonai is not null and p_product_back_fixed_jonai < 0 then raise exception 'bad product_back_fixed_jonai'; end if;
  if p_product_back_fixed_free is not null and p_product_back_fixed_free < 0 then raise exception 'bad product_back_fixed_free'; end if;
  if p_product_back_mode <> 'plan_fixed' and (p_product_back_fixed_hon is not null or p_product_back_fixed_jonai is not null or p_product_back_fixed_free is not null) then
    raise exception 'bad product_back_fixed_hon';
  end if;
  -- ★0168（裁定338＋追補1）: 判定期間＝monthly（月次）／half（半月 1〜15／16〜末）／daily（同日）。NULL は明示に拒否（教訓100＝IN の CHECK は NULL を素通りする・default は引数省略時だけ効く）
  if p_slide_period is null or p_slide_period not in ('monthly','half','daily') then raise exception 'bad slide_period'; end if;
  -- ★0170（裁定343＝案 A）: 判定基準＝sales（按分後売上・現行）／hon_count（本指名の件数）／dohan_count（同伴の件数）。NULL は明示拒否（教訓100）。
  if p_slide_basis is null or p_slide_basis not in ('sales','hon_count','dohan_count','pay_rate') then raise exception 'bad slide_basis'; end if;   -- ★12 0175 v2（CN-R ⑥・裁定412 の 3 軸目）: pay_rate＝時給分の報酬 ÷ 売上小計（段は comp_plans.pay_rate_tiers）
  -- ★0170: 対象＝空配列は全員・要素は自店の有効な cast_ranks.id だけ（重複・他店・停止中は 'bad slide_rank_ids'）。ランク変更は cast 側（casts.rank_id）に追随＝計算は lib。
  if p_slide_rank_ids is null then raise exception 'bad slide_rank_ids'; end if;
  -- ★0171（裁定347）: プラン既定の目標 4 軸＝null（継承なし）か 0 以上
  if (p_norm_days_target is not null and p_norm_days_target < 0) or (p_norm_dohan_target is not null and p_norm_dohan_target < 0)
     or (p_norm_sales_target is not null and p_norm_sales_target < 0) or (p_norm_shimei_target is not null and p_norm_shimei_target < 0) then raise exception 'bad norm_target'; end if;
  if (select count(*) from unnest(p_slide_rank_ids) r(id)) <> (select count(distinct id) from unnest(p_slide_rank_ids) r(id)) then raise exception 'bad slide_rank_ids'; end if;
  -- ★4 0174（裁定395）: 判定タイミング＝null（店設定に従う）／next／current
  if p_slide_apply is not null and p_slide_apply not in ('next','current') then raise exception 'bad slide_apply'; end if;
  -- ★3 0175（裁定407）: 時給スライドの方式＝sales／point／none の単一選択。null＝新規は段の有無から導出（売上の段あり→sales・pt の段→point・無し→none）・更新は現値のまま
  if p_slide_method is not null and p_slide_method not in ('sales','point','none') then raise exception 'bad slide_method'; end if;
  -- ★3 0175（裁定405）: pt 付与ルール＝object（hon／jonai／dohan／work_day／sales_pt＝0 以上・小数 1 桁、sales_yen_per_pt＝1 以上の整数）。null＝新規は店の既定（pt_rules_default）をコピー・更新は現値のまま
  if p_pt_rules is not null then perform public.pt_rules_check(p_pt_rules); end if;
  if exists (select 1 from unnest(p_slide_rank_ids) r(id) where not exists (select 1 from public.cast_ranks k where k.id = r.id and k.store_id = p_store_id and k.is_active)) then raise exception 'bad slide_rank_ids'; end if;
  perform public.comp_plan_slide_check(p_sales_slide);
  perform public.comp_plan_slide_check(p_point_slide);
  -- store の org 照合＋ロール判定（owner のみ＝D3a）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★mig0104（裁定77）: 同店内の名前重複（大小無視）を拒否＝cast_ranks の duplicate name と同型
  if exists (select 1 from public.comp_plans c
              where c.store_id = p_store_id
                and lower(c.name) = lower(trim(p_name))
                and c.id is distinct from p_id) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.comp_plans
      (org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active,
       hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate,
       dohan_back_mode, dohan_back_rate,
       product_back_mode, product_back_rate, product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free,  -- ★7 0153
       slide_period,  -- ★0168
       slide_basis, slide_rank_ids,  -- ★0170
       norm_days_target, norm_dohan_target, norm_sales_target, norm_shimei_target,  -- ★0171（0174: 末尾 ')' → ','）
       slide_apply,  -- ★4 0174（裁定395）（0175 ★3: 末尾 ')' → ','）
       slide_method, pt_rules,  -- ★3 0175（裁定407／405）
       advance_loan_agreed, advance_loan_agreed_at)  -- ★0198（裁定458 ③）: 前借り（貸付）の取扱いに同意
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate,
       p_dohan_back_mode, p_dohan_back_rate,
       p_product_back_mode, p_product_back_rate, p_product_back_fixed,  -- ★0134（0153 ★7: 末尾 ')' → ','）
       p_product_back_fixed_hon, p_product_back_fixed_jonai, p_product_back_fixed_free,  -- ★7 0153
       p_slide_period,  -- ★0168
       p_slide_basis, p_slide_rank_ids,  -- ★0170
       p_norm_days_target, p_norm_dohan_target, p_norm_sales_target, p_norm_shimei_target,  -- ★0171（0174: 末尾 ')' → ','）
       p_slide_apply,  -- ★4 0174（裁定395）（0175 ★3: 末尾 ')' → ','）
       coalesce(p_slide_method, case when jsonb_typeof(p_sales_slide) = 'array' and jsonb_array_length(p_sales_slide) > 0 then 'sales'
                                     when jsonb_typeof(p_point_slide) = 'array' and jsonb_array_length(p_point_slide) > 0 then 'point' else 'none' end),   -- ★3 0175（裁定407）
       coalesce(p_pt_rules, (select coalesce(s.settings_json->'pt_rules_default', '{}'::jsonb) from public.stores s where s.id = p_store_id), '{}'::jsonb),   -- ★3 0175（裁定405）: 新規＝店の既定をコピー
       coalesce(p_advance_loan_agreed, false), case when coalesce(p_advance_loan_agreed, false) then now() else null end)   -- ★0198（裁定458 ③）
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plans c
      where c.id = p_id and c.org_id = public.auth_org_id() and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plans
      set name = trim(p_name), base = p_base, hon_back = p_hon_back, jonai_back = p_jonai_back,
          dohan_back = p_dohan_back, sales_slide = p_sales_slide, point_slide = p_point_slide,
          is_active = coalesce(p_is_active, true),
          hon_back_mode = p_hon_back_mode, hon_back_rate = p_hon_back_rate,
          jonai_back_mode = p_jonai_back_mode, jonai_back_rate = p_jonai_back_rate,
          dohan_back_mode = p_dohan_back_mode, dohan_back_rate = p_dohan_back_rate,
          product_back_mode = p_product_back_mode, product_back_rate = p_product_back_rate,  -- ★0134
          product_back_fixed = p_product_back_fixed,                                         -- ★0134（0153 ★7: 末尾 ',' を足す）
          product_back_fixed_hon = p_product_back_fixed_hon, product_back_fixed_jonai = p_product_back_fixed_jonai,   -- ★7 0153
          product_back_fixed_free = p_product_back_fixed_free,                               -- ★7 0153
          slide_period = p_slide_period,                                                    -- ★0168（0170: 末尾 ',' を足す）
          slide_basis = p_slide_basis, slide_rank_ids = p_slide_rank_ids,
          norm_days_target = p_norm_days_target, norm_dohan_target = p_norm_dohan_target, norm_sales_target = p_norm_sales_target, norm_shimei_target = p_norm_shimei_target,  -- ★0171（0174: 末尾 ',' を足す）
          slide_apply = p_slide_apply,  -- ★4 0174（裁定395）（0175 ★3: 末尾 ',' を足す）
          slide_method = coalesce(p_slide_method, slide_method), pt_rules = coalesce(p_pt_rules, pt_rules),   -- ★3 0175（裁定407／405）: null＝現値のまま
          advance_loan_agreed = coalesce(p_advance_loan_agreed, advance_loan_agreed),   -- ★0198（裁定458 ③）: null＝現値のまま
          advance_loan_agreed_at = case when p_advance_loan_agreed is true and not advance_loan_agreed then now() when p_advance_loan_agreed is false then null else advance_loan_agreed_at end
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text, text, jsonb, boolean) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text, text, jsonb, boolean) to authenticated;

-- ═══ ★5 demo_org_reset＝wipe 一覧に 6 表（デモ org で基本の働き方・日ごとの控除・今日だけ許可・固定手当を触ると reset が FK で止まる不具合の直し＝load 一覧と ACL は不変） ═══
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    'cast_day_deductions','deduction_rule_casts','availability_terms','availability','register_day_grants','staff_allowances',   -- ★0198 ★5: 0195／0175 v2／0197 の表＝deductions・memberships・casts より先に消す（payload には無い＝load 一覧は不変）
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_notice_reads','cast_pin','cast_plan',   -- ★8 0160（326-9）: +cast_notice_reads（casts・notices より先に消す）
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','payroll_run_deduction_overrides','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_attentions','daily_pays','payroll_adjustments','payslips',   -- ★6 0159（起票92）: +3 表（overrides は deductions より先に消す＝FK deduction_id）
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','cast_contract_acks','cast_quotas','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances','memberships','stores'];   -- ★8 0160: +cast_quotas（casts より先に消す）・★5 0162: +cast_contract_acks（casts より先に消す）・★6 0174: +4 表（0172 の staff 3 表＋terms_acceptances＝memberships より先に消す・FK membership_id）
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  -- ★6 0174: +4 表（0172 の staff 3 表＋terms_acceptances＝memberships の直後に投入）
  c_load constant text[] := array[
    'stores','memberships','staff_contracts','staff_punches','staff_payroll_runs','terms_acceptances','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','cast_quotas','cast_contract_acks','staff_shift_wishes','shift_wishes','shift_periods','seats','products',   -- ★8 0160: +cast_quotas（casts の後）・★5 0162: +cast_contract_acks（casts の後）
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_notice_reads','cast_norms',   -- ★8 0160: +cast_notice_reads（casts・notices の後）
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
  v_cols     text;   -- ★7 0175（起票117）: payload に実在する列だけを列指定で insert
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        -- ★7 0175（起票117・E-20 と対）: jsonb_populate_recordset は列の既定値を使わない（無い鍵＝null）。payload の鍵 ∩ 表の列だけを列指定で insert＝無い列は表の既定値で埋まる
        select string_agg(format('%I', ks.k), ', ') into v_cols
          from (select distinct jsonb_object_keys(e) as k from jsonb_array_elements(p_payload->v_t) e) ks
          join information_schema.columns ic on ic.table_schema = 'public' and ic.table_name = v_t and ic.column_name = ks.k;
        if v_cols is null then raise exception 'bad payload'; end if;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_cols, v_cols, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;
revoke execute on function public.demo_org_reset(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.demo_org_reset(uuid, jsonb, text) to service_role;

-- ═══ ★2 裁定458 ③: 貸付伝票の本人確認＝advances に ack_method／ack_at／ack_by ═══
alter table public.advances add column if not exists ack_method text not null default 'none' check (ack_method in ('none','manager','pin'));
alter table public.advances add column if not exists ack_at timestamptz;
alter table public.advances add column if not exists ack_by uuid references public.users(id);
comment on column public.advances.ack_method is '★0198（裁定458 ③）: 本人確認＝none（従来の adv_issue）／manager（店長の立会い）／pin（cast_pin の照合＝キオスクの本人セッション）';

-- ═══ ★3 貸付（本人確認つき）＝cast_loan_grant／返済（現金）＝cast_loan_repay ═══
CREATE OR REPLACE FUNCTION public.cast_loan_grant(p_store_id uuid, p_cast_id uuid, p_amount integer, p_biz_date date, p_note text DEFAULT NULL::text, p_pin text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★0198（裁定458 ①③）: 貸付＝adv_issue（店長以上・自店・billing・paid 期の繰り下げ・audit）をそのまま呼び、本人確認の印を付ける。
--   p_pin があれば cast_pin と照合（不一致＝'bad pin'・失敗回数は数えない＝店長の立会い前提）→ ack='pin'。無ければ ack='manager'。貸付時に源泉も 5,000 円控除も引かない（金額そのまま＝裁定458 ①）。
--   待遇プランの同意（comp_plans.advance_loan_agreed）は audit に残すだけで拒否しない（仮置き 5）。
declare
  v_id uuid; v_actor uuid; v_pin public.cast_pin; v_ack text := 'manager'; v_agreed boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_pin is not null then
    if p_pin !~ '^[0-9]{4,6}$' then raise exception 'bad pin'; end if;
    select p.* into v_pin from public.cast_pin p where p.cast_id = p_cast_id and p.store_id = p_store_id;
    if v_pin.cast_id is null or v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then raise exception 'bad pin'; end if;
    v_ack := 'pin';
  end if;
  v_id := public.adv_issue(p_store_id, p_cast_id, p_amount, p_biz_date, p_note);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.advances set ack_method = v_ack, ack_at = now(), ack_by = v_actor where id = v_id;
  select coalesce(bool_or(cp.advance_loan_agreed), false) into v_agreed
    from public.cast_plan x join public.comp_plans cp on cp.id = x.plan_id
   where x.cast_id = p_cast_id and (x.valid_to is null or x.valid_to >= p_biz_date) and coalesce(x.valid_from, date '1900-01-01') <= p_biz_date;
  perform public.audit_log_write('cast_loan_grant', 'advances:' || v_id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'biz_date', p_biz_date, 'ack_method', v_ack, 'plan_agreed', coalesce(v_agreed, false)), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.cast_loan_grant(uuid, uuid, integer, date, text, text) from public, anon;
grant execute on function public.cast_loan_grant(uuid, uuid, integer, date, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.cast_loan_repay(p_advance_id uuid, p_amount integer, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0198（裁定458 ④）: 現金の返済＝open の貸付の deducted_amount を進める（給与の天引き＝payroll_finalize とは別の経路・同じ列を進める）。全額で status='deducted'。店長以上・自店・billing。
declare
  v_row record; v_actor uuid; v_remain integer;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  select * into v_row from public.advances where id = p_advance_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if v_row.status <> 'open' then raise exception 'advance settled'; end if;
  v_remain := v_row.amount - v_row.deducted_amount;
  if p_amount > v_remain then raise exception 'bad amount'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.advances
     set deducted_amount = deducted_amount + p_amount,
         status = case when deducted_amount + p_amount >= amount then 'deducted' else status end,
         updated_at = now()
   where id = p_advance_id;
  perform public.audit_log_write('cast_loan_repay', 'advances:' || p_advance_id::text,
    jsonb_build_object('deducted_amount', v_row.deducted_amount, 'status', v_row.status),
    jsonb_build_object('deducted_amount', v_row.deducted_amount + p_amount, 'status', case when v_row.deducted_amount + p_amount >= v_row.amount then 'deducted' else 'open' end, 'repaid_cash', p_amount, 'note', nullif(trim(coalesce(p_note, '')), '')), v_row.store_id);
  return p_advance_id;
end $function$;
revoke execute on function public.cast_loan_repay(uuid, integer, text) from public, anon;
grant execute on function public.cast_loan_repay(uuid, integer, text) to authenticated;

-- ═══ ★4 貸付台帳＝view cast_loans（advances が正本・RLS は security_invoker で advances のまま＝店の人／本人）／残高＝cast_loan_balances ═══
create or replace view public.cast_loans with (security_invoker = true) as
  select a.id, a.org_id, a.store_id, a.cast_id, c.name as cast_name, a.advanced_on as biz_date, a.amount,
         a.deducted_amount as repaid, (a.amount - a.deducted_amount) as remaining, a.status,
         case when a.status = 'deducted' then a.updated_at else null end as repaid_at,
         a.deduct_period as settlement, a.created_by as granted_by, u.name as granted_by_name,
         a.ack_method, a.ack_at, a.ack_by, a.note, a.created_at, a.cancelled_at
    from public.advances a
    join public.casts c on c.id = a.cast_id
    left join public.users u on u.id = a.created_by;
comment on view public.cast_loans is '★0198（裁定458 ④）: 貸付台帳＝advances の見え方（正本は advances・security_invoker＝advances_select の RLS）';
revoke all on public.cast_loans from public, anon, authenticated;
grant select on public.cast_loans to authenticated;

create or replace view public.cast_loan_balances with (security_invoker = true) as
  select a.org_id, a.store_id, a.cast_id, c.name as cast_name,
         sum(a.amount - a.deducted_amount)::int as open_total, count(*)::int as n, min(a.advanced_on) as oldest_on,
         max(a.ack_at) as last_ack_at
    from public.advances a join public.casts c on c.id = a.cast_id
   where a.status = 'open'
   group by a.org_id, a.store_id, a.cast_id, c.name;
comment on view public.cast_loan_balances is '★0198（裁定458 ④）: 本人別の貸付残高（open）＝advances_open_balance と同じ式の view';
revoke all on public.cast_loan_balances from public, anon, authenticated;
grant select on public.cast_loan_balances to authenticated;

-- ═══ ★6 裁定461: cast_day_deductions_set＝cast 本人経路を forbidden に・staff の自店を店側に加える（署名不変＝ACL 不変・audit 不変） ═══
CREATE OR REPLACE FUNCTION public.cast_day_deductions_set(p_cast_id uuid, p_biz_date date, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（裁定447 差し替え版）: その日の控除の on／off（rows＝[{deduction_id, enabled}]）。既定（always＝on／pick＝off）どおりの行は消し、違う行だけ upsert。
--   管理者＝org 内／店長＝自店／kiosk 腕＝端末の店のキャスト・操作担当あり（kiosk_punch の後の別 RPC＝送りの kiosk_transport_issue と同じ 2 段）。確定済みの月は 'finalized'。audit は店の人は audit_log_write・端末は audit_log_write_service（actor＝操作担当）。
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_kstore uuid;
  v_by    uuid;
  v_cast  record;
  v_d     record;
  v_default boolean;
  v_before jsonb; v_after jsonb;
  r       record;
begin
  if v_org is null then   -- 端末（kiosk 腕）
    v_kstore := public.auth_kiosk_register_store_id();
    if v_kstore is null then raise exception 'forbidden'; end if;
    v_by := public.auth_kiosk_operator();
    if v_by is null then raise exception 'forbidden'; end if;
    select s.org_id into v_org from public.stores s where s.id = v_kstore;
  else
    v_by := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  end if;
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_cast_id is null or p_biz_date is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad args'; end if;
  select c.id, c.store_id into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  if v_kstore is not null then
    if v_cast.store_id <> v_kstore then raise exception 'forbidden'; end if;
  elsif v_role = 'cast' then   -- ★0198（裁定461）: cast セルフ腕（0196 §9-1）は撤回＝本人は選べない（付いた控除を見るだけ＝cast_day_applied_of）
    raise exception 'forbidden';
  else   -- ★0198（裁定461）: 店側だけ＝店長以上の自店＋staff の自店（本人セッション・今日タブの代行）
    if not (v_role = 'owner' or (v_role in ('manager','staff') and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  end if;
  if exists (select 1 from public.payroll_runs pr where pr.store_id = v_cast.store_id and pr.status in ('finalized','paid') and pr.period_start <= p_biz_date and pr.period_end >= p_biz_date) then raise exception 'finalized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('deduction_id', x.deduction_id, 'enabled', x.enabled) order by x.deduction_id), '[]'::jsonb) into v_before
    from public.cast_day_deductions x where x.cast_id = p_cast_id and x.biz_date = p_biz_date;
  for r in select * from jsonb_to_recordset(p_rows) as x(deduction_id uuid, enabled boolean) loop
    if r.deduction_id is null or r.enabled is null then raise exception 'bad row'; end if;
    select d.id, d.per, d.day_rule, d.is_active into v_d from public.deductions d where d.id = r.deduction_id and d.store_id = v_cast.store_id;
    if v_d.id is null then raise exception 'bad deduction'; end if;
    if v_d.per <> 'day' or not v_d.is_active then raise exception 'not day rule'; end if;
    v_default := (v_d.day_rule = 'always');
    if r.enabled = v_default then
      delete from public.cast_day_deductions where cast_id = p_cast_id and biz_date = p_biz_date and deduction_id = r.deduction_id;
    else
      insert into public.cast_day_deductions (org_id, store_id, cast_id, biz_date, deduction_id, enabled, set_by)
      values (v_org, v_cast.store_id, p_cast_id, p_biz_date, r.deduction_id, r.enabled, v_by)
      on conflict (cast_id, biz_date, deduction_id) do update set enabled = excluded.enabled, set_by = excluded.set_by, set_at = now();
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('deduction_id', x.deduction_id, 'enabled', x.enabled) order by x.deduction_id), '[]'::jsonb) into v_after
    from public.cast_day_deductions x where x.cast_id = p_cast_id and x.biz_date = p_biz_date;
  if v_kstore is not null then
    perform public.audit_log_write_service(v_org, v_by, 'cast_day_deductions_set', 'casts:' || p_cast_id::text || ':' || p_biz_date::text, v_before, v_after, v_cast.store_id, 'kiosk');
  else
    perform public.audit_log_write('cast_day_deductions_set', 'casts:' || p_cast_id::text || ':' || p_biz_date::text, v_before, v_after, v_cast.store_id);
  end if;
end $function$;
-- ★6 新設: 店が付けた今日の控除の見え方（本人＝自分だけ／店の人＝自店／端末＝端末の店のキャスト）＝[{id, name, amount}]（always は cast_day_deductions で外した行を除く・pick は on の行だけ・キャスト別の適用で使わないは除く・額の上書きを反映）
CREATE OR REPLACE FUNCTION public.cast_day_applied_of(p_cast_id uuid, p_biz_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0198（裁定461 ②・M-120）: 「今日の控除＝○○ ¥○○（店が付けました）」の材料。選択の腕は cast_day_deductions_set（店側）だけ。
declare
  v_cast record; v_biz date; v_role text := public.auth_role(); v_kstore uuid;
begin
  select c.id, c.org_id, c.store_id into v_cast from public.casts c where c.id = p_cast_id;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  if public.auth_org_id() is null then   -- 端末（kiosk 腕）＝端末の店のキャストだけ（操作担当は要らない＝表示だけ）
    select k.store_id into v_kstore from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active limit 1;
    if v_kstore is null or v_kstore <> v_cast.store_id then raise exception 'forbidden'; end if;
  elsif v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden';
  elsif v_role = 'cast' then
    if v_cast.id <> public.auth_cast_id() then raise exception 'forbidden'; end if;
  elsif not (v_role = 'owner' or (v_role in ('manager','staff') and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden';
  end if;
  v_biz := coalesce(p_biz_date, public.biz_date_of(v_cast.store_id, now()));
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'amount', coalesce(rc.amount_override, d.amount)) order by d.name)
      from public.deductions d
      left join public.deduction_rule_casts rc on rc.rule_id = d.id and rc.cast_id = p_cast_id
      left join public.cast_day_deductions x on x.deduction_id = d.id and x.cast_id = p_cast_id and x.biz_date = v_biz
     where d.store_id = v_cast.store_id and d.is_active and d.per = 'day' and coalesce(rc.enabled, true)
       and coalesce(x.enabled, d.day_rule = 'always')), '[]'::jsonb);
end $function$;
revoke execute on function public.cast_day_applied_of(uuid, date) from public, anon;
grant execute on function public.cast_day_applied_of(uuid, date) to authenticated;

-- ═══ ★6 裁定461: kiosk_punch＝p_day_deductions は操作担当が解錠中のときだけ・出勤 ok の返りに day_applied（署名不変＝ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text, p_okuri boolean DEFAULT NULL::boolean, p_day_deductions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
  v_okuri    boolean;  -- ★4 0156（裁定309-9）
  v_lock     interval; -- ★0192 M-46: ロック時間＝店設定 pin_lock_minutes（既定 10 分＝kiosk_login と揃える）
  v_d        record;   -- ★0196（§9-2）: 出勤時の「今日の控除」
  v_biz      date;
  v_default  boolean;
  v_dd       record;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  if p_day_deductions is not null and (jsonb_typeof(p_day_deductions) <> 'array' or p_type <> 'in') then raise exception 'bad day deductions'; end if;   -- ★0196（§9-2）: 出勤のときだけ受理
  if p_day_deductions is not null and public.auth_kiosk_operator() is null then raise exception 'forbidden'; end if;   -- ★0198（裁定461）: 今日の控除の選択は店側だけ＝端末では操作担当（staff 以上）が解錠中のときだけ受理（cast の PIN だけなら forbidden）
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce((select s.settings_json from public.stores s where s.id = v_device.store_id), '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 10));   -- ★0192 M-46
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象 cast は自店 active のみ（他店/他 org は not_found＝存在オラクル封じ）
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.cast_pin p
    where p.cast_id = p_cast_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= 5 then
      update public.cast_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where cast_id = p_cast_id;
    else
      update public.cast_pin
         set fail_count = v_newfail, updated_at = now()
       where cast_id = p_cast_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
       'cast_pin:' || p_cast_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 盲目記録 INSERT（punch_self 逐語型・source='kiosk'）
  update public.cast_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where cast_id = p_cast_id;

  -- 0109: 打刻端末の最終アクセス（成功経路のみ・引き継ぎv18 §3 のとおり）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  perform public.punch_seq_check(v_cast.store_id, p_cast_id, p_type, now());   -- ★3 0161（裁定327）: 順序検査（raise＝rpc-err 様式・端末の和文は M1）
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri)  -- ★4 0156: +okuri
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk', v_okuri)
  returning id into v_punch_id;

  -- ★0196（M-103・§9-2）: 出勤と同時に「今日の控除」（rows＝[{deduction_id, enabled}]・PIN が本人確認＝操作担当は要らない・既定どおりの行は消す＝cast_day_deductions_set と同じ式）
  if p_day_deductions is not null and p_type = 'in' then
    v_biz := public.biz_date_of(v_cast.store_id, now());
    for v_dd in select * from jsonb_to_recordset(p_day_deductions) as x(deduction_id uuid, enabled boolean) loop
      if v_dd.deduction_id is null or v_dd.enabled is null then raise exception 'bad row'; end if;
      select d.id, d.per, d.day_rule, d.is_active into v_d from public.deductions d where d.id = v_dd.deduction_id and d.store_id = v_cast.store_id;
      if v_d.id is null then raise exception 'bad deduction'; end if;
      if v_d.per <> 'day' or not v_d.is_active then raise exception 'not day rule'; end if;
      v_default := (v_d.day_rule = 'always');
      if v_dd.enabled = v_default then
        delete from public.cast_day_deductions where cast_id = p_cast_id and biz_date = v_biz and deduction_id = v_dd.deduction_id;
      else
        insert into public.cast_day_deductions (org_id, store_id, cast_id, biz_date, deduction_id, enabled, set_by)
        values (v_cast.org_id, v_cast.store_id, p_cast_id, v_biz, v_dd.deduction_id, v_dd.enabled, null)
        on conflict (cast_id, biz_date, deduction_id) do update set enabled = excluded.enabled, set_by = null, set_at = now();
      end if;
    end loop;
  end if;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok', 'day_deductions', p_day_deductions),   -- ★0196: 送られた行も台帳に
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now(),
    'day_applied', case when p_type = 'in' then public.cast_day_applied_of(p_cast_id, public.biz_date_of(v_cast.store_id, now())) else '[]'::jsonb end);   -- ★0198（裁定461 ②）: 店が付けた今日の控除（端末の表示だけ）
end $function$;

-- ═══ ★7 M-122（2026-11-09）: c_wipe／c_keep に無い表の監査系 FK（nullable）＝on delete set null ═══
alter table public.attendance_contacts drop constraint attendance_contacts_created_by_fkey, add constraint attendance_contacts_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.availability_terms drop constraint availability_terms_updated_by_fkey, add constraint availability_terms_updated_by_fkey foreign key (updated_by) references public.memberships(id) on delete set null;
alter table public.cast_day_deductions drop constraint cast_day_deductions_set_by_fkey, add constraint cast_day_deductions_set_by_fkey foreign key (set_by) references public.users(id) on delete set null;
alter table public.cast_notifications drop constraint cast_notifications_created_by_fkey, add constraint cast_notifications_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.cast_rate_history drop constraint cast_rate_history_created_by_fkey, add constraint cast_rate_history_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.contact_changes drop constraint contact_changes_confirmed_by_fkey, add constraint contact_changes_confirmed_by_fkey foreign key (confirmed_by) references public.users(id) on delete set null;
alter table public.deduction_rule_casts drop constraint deduction_rule_casts_set_by_fkey, add constraint deduction_rule_casts_set_by_fkey foreign key (set_by) references public.users(id) on delete set null;
alter table public.line_bind_tokens drop constraint line_bind_tokens_created_by_fkey, add constraint line_bind_tokens_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.member_profiles drop constraint member_profiles_birth_date_confirmed_by_fkey, add constraint member_profiles_birth_date_confirmed_by_fkey foreign key (birth_date_confirmed_by) references public.users(id) on delete set null;
alter table public.member_profiles drop constraint member_profiles_legal_name_confirmed_by_fkey, add constraint member_profiles_legal_name_confirmed_by_fkey foreign key (legal_name_confirmed_by) references public.users(id) on delete set null;
alter table public.member_profiles drop constraint member_profiles_residence_confirmed_by_fkey, add constraint member_profiles_residence_confirmed_by_fkey foreign key (residence_confirmed_by) references public.users(id) on delete set null;
alter table public.norm_shortfall_intents drop constraint norm_shortfall_intents_decided_by_fkey, add constraint norm_shortfall_intents_decided_by_fkey foreign key (decided_by) references public.users(id) on delete set null;
alter table public.payroll_employee_deductions drop constraint payroll_employee_deductions_set_by_fkey, add constraint payroll_employee_deductions_set_by_fkey foreign key (set_by) references public.users(id) on delete set null;
alter table public.payroll_withholding_overrides drop constraint payroll_withholding_overrides_set_by_fkey, add constraint payroll_withholding_overrides_set_by_fkey foreign key (set_by) references public.users(id) on delete set null;
alter table public.punch_corrections drop constraint punch_corrections_decided_by_fkey, add constraint punch_corrections_decided_by_fkey foreign key (decided_by) references public.users(id) on delete set null;
alter table public.punch_round_consents drop constraint punch_round_consents_changed_by_fkey, add constraint punch_round_consents_changed_by_fkey foreign key (changed_by) references public.users(id) on delete set null;
alter table public.register_day_grants drop constraint register_day_grants_granted_by_fkey, add constraint register_day_grants_granted_by_fkey foreign key (granted_by) references public.users(id) on delete set null;
alter table public.slide_decisions drop constraint slide_decisions_decided_by_fkey, add constraint slide_decisions_decided_by_fkey foreign key (decided_by) references public.users(id) on delete set null;
alter table public.staff_attendance_days drop constraint staff_attendance_days_updated_by_fkey, add constraint staff_attendance_days_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null;
alter table public.staff_attendance_locks drop constraint staff_attendance_locks_locked_by_fkey, add constraint staff_attendance_locks_locked_by_fkey foreign key (locked_by) references public.users(id) on delete set null;
alter table public.staff_invites drop constraint staff_invites_accepted_user_id_fkey, add constraint staff_invites_accepted_user_id_fkey foreign key (accepted_user_id) references public.users(id) on delete set null;
alter table public.staff_invites drop constraint staff_invites_created_by_fkey, add constraint staff_invites_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.staff_labor_confirmed drop constraint staff_labor_confirmed_confirmed_by_fkey, add constraint staff_labor_confirmed_confirmed_by_fkey foreign key (confirmed_by) references public.users(id) on delete set null;
alter table public.store_special_days drop constraint store_special_days_set_by_fkey, add constraint store_special_days_set_by_fkey foreign key (set_by) references public.users(id) on delete set null;

commit;
