-- 0175_rules_bundle.sql（v2・2026-10-23）— 裁定393 追補2／3・402・404・405・407・408 追補1・409・410／X13-I I-3／I-5・396（本採用 RPC）・356・397＋413 追補1・398／399／400（BZ-R）・起票117・便 S 起票（着席ログ）・W-24・新規店の税既定
--   （2026-10-22 起草・便 0175／0176 起草・適用は Agoora 手貼り＝P175・流していない・P175→P176→P177 の順）
-- 翻訳元: live（nox 本番 ref aws-0-ap…・2026-10-22T10:17:09.800Z SELECT 読取＝docs/tmp/0175_live.json・pg_get_functiondef）に★差分（生成器 docs/tmp/gen_0175.mjs・手打ちなし）。新設の表・RPC は生成器の文字列。
--   ★1 393 追補2／3: check_pay +p_fee_rate numeric（null＝店設定・小数 1 桁）+p_fee_on boolean（既定 true）・check_lines +fee_rate（適用率）・店設定と異なる率／OFF は audit 'pay_fee_override'／check_group_due＝手数料行は税込（外税の母数から除く）。旧 8 引数は drop（overload 罠）
--   ★2 402: receipt_issue +p_biz_date（日付の訂正・未来日不可）+p_reissue_of（元の行＝同じ伝票・未取消なら同一 tx で自動取消 '再発行のため取消'）・receipt_issues +reissue_of／by_membership。旧 4 引数は drop
--   ★3 店設定キー: sys_wage_cut_rule（X13-I ②）・bonus_tier_mode（404 max／sum）・sales_split（409 prorate／equal＝cast_sales_aggregate が equal を均等に読む）・pt_rules_default（405）／comp_plans +slide_method（407・移行 SQL＝売上の段あり→sales・pt の段→point・無し→none）+pt_rules（405）・products +pt／set_comp_plan 32 引数（旧 30 drop）・pt_rules_check（内部）
--   ★4 410／I-3／I-5／⑤: payroll_adjustments +kind／source_table／source_id／cancelled_at／cancelled_by／cancel_reason・payroll_adjustment_add 14 引数（旧 11 drop）・payroll_adjustment_cancel・norm_shortfall_decide（audit のみ）・daily_pays +cancelled_*・daily_pay_cancel
--   ★5 便 S 起票: check_set_nominations＝旧行の created_at を引き継ぐ（着席ログの時刻）
--   ★6 H-8／H-11／起票118＝DB 変更なし（comp_plans.slide_apply・set_cast_profile・set_comp_plan の to_jsonb 全列は 0174 で済み）。★7 起票117: demo_org_reset の load＝payload の鍵 ∩ 表の列だけを列指定で insert（無い列は表の既定値）
--   ★7 396: set_cast_kind（本採用で joined_on 空なら当日）／新規店の税既定＝stores.price_display の既定 'tax_excluded'（既存行は不変）／W-24: daily_reports +other_cash_memo（候補・書く RPC は P175）／408 追補1: pricing_rules +vip_timing／vip_ext_amount＋set_pricing_rule_vip／356: staff_payroll_run_set_status（owner・前進のみ）
--   ★8 398（BZ-R）: stores +punch_enforce／punch_restrict_mode／punch_lat／punch_lng／punch_radius_m／punch_allow_ip／punch_require_shift／punch_round_unit／punch_round_mode・punch_round_consents（append-only）・store_wifi_add／remove・punch_self 7 引数（旧 4 drop・within_geofence／geo_override／note）・punch_proxy＝within_geofence true・punches +geo_override
--   ★9 397＋413 追補1（399 の器）: availability（membership 単位・dow×ok／ng／ask・from_min／to_min・memo）・availability_terms（week_days_target・fixed_off_dows・effective_from）・availability_set／availability_list・staff_contracts +pay_kind／monthly／daily／min_month_h／max_month_h／max_consec・memberships +hire_date／leave_date
--   ★10 400（BZ-R）: users +contact_email／phone・set_my_contact（デモ org は forbidden）
--   ★11〜★20 v2（2026-10-23・CN-R＝裁定418 CANON 型＋18 店・412 追補＝reward_axis・R-4＝attendance 'dohan' 撤去・PR-1＝時給の変更履歴）: 店設定キー +8（service_rate_by_seat 列／pay_discount_rates／sys_drink_count_back／sales_subtotal_mode／sales_subtotal_includes_shimei／settlement_week_close_dow／settlement_pay_days_after／daily_pay_cap_tiers）・
--        check_pay の割引行（fee_kind 'pay_discount'）・comp_plans +11 列（pay_rate_tiers／slide_streak_n／reward_axis／assess_grace_months／back_unit 3／product_back_rate_by_kind／product_back_fixed_vip／product_back_rate_vip／reservation_back_tiers）＋slide_basis 'pay_rate'＋back_rate 併用・
--        表 5（plan_rate_bands／plan_norm_tiers／plan_event_bonuses／slide_decisions／cast_rate_history）・RPC 7（comp_plan_ext_set／plan_rate_band_set／plan_norm_tier_set／plan_event_bonus_set／slide_decision_propose／slide_decision_decide／cast_rate_history_add）＋comp_plan_pay_rate_check（内部）・
--        attendance_set（'dohan' 撤去・+help／duty_absent・既存 dohan 行は shukkin へ）・daily_pay_issue 6 引数（p_worked_hours＝上限の表）
--   ★29 便 SH-UI-c2 C2-16（裁定424 候補）: 丸め設定は開卓済みの伝票にも次の会計から適用＝check_group_due が開いている伝票（status open）では stores.round_unit／round_mode を読む（税率・サ料・外税／内税・延長パターンの凍結は不変・closed は凍結値のまま）。呼び手 check_pay／check_close／check_recalc／cast_sales_aggregate は不変
--   ★28 追補 3 R-8（裁定425 候補）: 役割「管理者」（admin・序列 owner→admin→manager→staff→cast）＝memberships.role CHECK に 'admin'・auth_role() は admin→'owner'（RLS 70 本・RPC 210 本の owner 判定を書き換えずに広げる）・auth_role_raw()（本来の役割）・
--        owner 限定 4 つ＝①店舗の解約／削除（RPC なし＝Stripe ポータル＝③に含む）②owner_transfer（新設・相手 admin／manager→owner・自分→admin）③契約と請求＝org_billing_select と terms_accept を auth_role_raw に（/billing・api/billing は client）④set_membership_role（新設・staff／manager／admin・admin の付与・解除は raw owner・自分は不可）・
--        memberships の行を直接読む 4 本（kiosk_login／kiosk_operator_list／staff_pin_status／set_staff_pin）と ★27 kiosk_unlock／kiosk_unlock_qr の候補に 'admin'。audit_logs_select は不変（監査は管理者も読める）。staff_change_role は不変
--   ★27 追補 2 同乗 R-7（裁定423 候補）: キオスク端末＝PIN だけで解除（kiosk_unlock＝同じ PIN が 2 人なら候補を返す→kiosk_login）・無操作秒数（kiosk_idle_sec・auth_kiosk_operator が店設定を読む）・終了理由（kiosk_sessions.end_reason・kiosk_lock）・使える機能（kiosk_features）。PIN の桁は 4 のまま（4〜6 桁は set_*_pin／kiosk_punch／staff_punch の同時改修＝P175 後）。QR 解除＝memberships.qr_secret（TOTP 30 秒・my_qr_secret で本人が作る）・kiosk_unlock_qr（±1 窓・失敗 5 回で 10 分ロック・同じトークンは 1 回＝kiosk_sessions.token_hash・unlock_method 'qr'）・totp_code_of（内部）
--   ★26 追補 2 同乗 R-6（裁定422 候補）: 電子領収書＝簡易インボイス（receipt_issues +tax_breakdown／issuer_snapshot／payment_method／issued_hash・stores +legal_name／trade_name／receipt_default_desc・receipt_issue が発行時に凍結・nox_receipt_public の戻りを拡張（drop→create・anon 白名単 ACL 明示）・set_store_invoice_profile 新設）
--   ★24〜★25 追補 2（2026-10-23）: 裁定421 候補 sys_staff_discount（0 承認制／1 上限内は即時／2 不可）＋staff_discount_cap＋approvals.staff_direct（approval_direct を staff に・申請はキャスト撤去）＋check_pay の手数料カットは staff 1 かつ上限内／裁定420 sys_cast_register（0／1／2・旧 boolean→1）＋auth_cast_register_level＋check_pay／receipt_issue は 2 のときだけ cast に
--   ★21〜★23 連続便 3 追補（2026-10-23）: P-8 check_pay +p_fee_amount（11 引数・payments.fee_amount／fee_source）／P-9 bottle_keeps.tag_label（bottle_keep_register 11 引数・update 8 引数・既存行の既定を埋める）／P-10 checks.ext_rule_id（check_open／check_set_ext_rule／check_extension_add＝延長行にパターン名）
--   ★取消 RPC（payroll_adjustment_cancel／daily_pay_cancel）の cancelled_at を計算側が除外する分は PR-1 の R-2 と同じ便（P175 client）で入れる
--   ★v2 最終（2026-10-23 便 SH-UI-b2 B2-0＝CSV 18 店の残り）: comp_plans +back_rate_tiers（SCANDAL＝売上小計帯→バック率）・back_unit +hourly_add（BELLEZZA＝当日時給増額）・pay_rate_tiers の鍵 +bonus_pct／down_amount（DAYTONA A／B）＝comp_plans の列は 12
--   既存データの書換え＝★3 の comp_plans.slide_method の導出（27 行）と ★17 attendance の status 'dohan'→'shukkin'（件数は verify で）。他は列追加（既定値）と関数置換。
-- 検証（Success の後・形で見る）: 末尾 ===== verify ===== の 1 文（docs/demo/verify_0175.sql と同じ）。
-- md5 pin（prosrc・\r 除去・先頭 8 桁）＝写経元: check_group_due 5c667792・auth_role db860f0a・terms_accept 190912da・kiosk_login 770d068e・kiosk_operator_list 8958cbc9・staff_pin_status 73bbeb2b・set_staff_pin 52f75768・check_pay c11691b8・check_group_due 5c667792・receipt_issue a7f04e4c・set_store_profile 45012c75・set_comp_plan 21afb3f5・cast_sales_aggregate 34a0bf1e・payroll_adjustment_add 0feabfac・check_set_nominations 97dd24bb・demo_org_reset 3cdf7a30・punch_self 952f18a4・punch_proxy a760e1a4・attendance_set 7a56ca05・daily_pay_issue 94f989f9・bottle_keep_register e6b043fd・bottle_keep_update 51992d82・check_set_ext_rule 02b145a6・check_extension_add 035a7974・check_open 82dfd091・approval_direct 17c5498c・approval_request 4f099683・auth_cast_can_register 8ef80d12・set_store_cast_register f357f5b9・nox_receipt_public 7cd67a3f・auth_kiosk_operator cfce7f20
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ overload 罠＝引数が増える関数は旧署名を drop（0172／0173 と同じ） ═══
drop function if exists public.check_pay(uuid, text, integer, text, integer, uuid, text, text);
drop function if exists public.receipt_issue(uuid, integer, text, text);
drop function if exists public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text);
drop function if exists public.payroll_adjustment_add(uuid, uuid, text, integer, integer, boolean, boolean, text, text, text, uuid);
drop function if exists public.punch_self(text, double precision, double precision, boolean);
drop function if exists public.daily_pay_issue(uuid, date, integer, uuid, text);   -- ★20 v2: 6 引数版へ（上限の表）
drop function if exists public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid, text);   -- ★22 v2: 11 引数版へ（+p_tag_label）
drop function if exists public.bottle_keep_update(uuid, integer, date, text, text, text, text);   -- ★22 v2: 8 引数版へ（+p_tag_label）

-- ═══ ★1 列: check_lines.fee_rate（適用率・小数 1 桁） ═══
alter table public.check_lines add column if not exists fee_rate numeric;
alter table public.check_lines drop constraint if exists check_lines_fee_rate_check;
alter table public.check_lines add constraint check_lines_fee_rate_check check (fee_rate is null or (fee_rate >= 0 and fee_rate <= 100));
comment on column public.check_lines.fee_rate is '★0175（裁定393 追補2）: 手数料行（fee_kind pay_fee）に適用した率（%・小数 1 桁）。null＝手数料行以外';

-- ═══ ★21 列: payments.fee_amount／fee_source（裁定393 追補4＝入金ごとの手数料の上書き） ═══
alter table public.payments add column if not exists fee_amount integer not null default 0;
alter table public.payments drop constraint if exists payments_fee_amount_check;
alter table public.payments add constraint payments_fee_amount_check check (fee_amount >= 0);
alter table public.payments add column if not exists fee_source text not null default 'auto';
alter table public.payments drop constraint if exists payments_fee_source_check;
alter table public.payments add constraint payments_fee_source_check check (fee_source in ('auto','none','manual'));
comment on column public.payments.fee_amount is '★0175 v2（裁定393 追補4）: この入金に乗せた手数料の実額（手数料行 check_lines fee_kind pay_fee と同額・日報は行を読む）';
comment on column public.payments.fee_source is '★0175 v2（裁定393 追補4）: auto＝店の率／none＝なし／manual＝この入金だけ指定した額';

-- ═══ ★22 列: bottle_keeps.tag_label（裁定419 候補＝タグに書く名前・既定「{顧客名} {ボトル名}」・棚は既存 shelf_no） ═══
alter table public.bottle_keeps add column if not exists tag_label text;
alter table public.bottle_keeps drop constraint if exists bottle_keeps_tag_label_len;
alter table public.bottle_keeps add constraint bottle_keeps_tag_label_len check (tag_label is null or length(tag_label) <= 60);
comment on column public.bottle_keeps.tag_label is '★0175 v2（裁定419 候補）: タグに書く名前（既定＝顧客名＋ボトル名・編集可）';
update public.bottle_keeps b
   set tag_label = left(coalesce((select cu.name from public.customers cu where cu.id = b.customer_id), '（顧客）') || ' ' || coalesce(b.bottle_name, (select pr.name from public.products pr where pr.id = b.product_id), ''), 60)
 where b.tag_label is null;

-- ═══ ★23 列: checks.ext_rule_id（裁定408 系＝選択中の延長パターン・凍結 ext_menu_snap の rule_id・null＝既定） ═══
alter table public.checks add column if not exists ext_rule_id uuid references public.pricing_rules(id) on delete set null;
comment on column public.checks.ext_rule_id is '★0175 v2（裁定408 系）: 選択中の延長パターン（開卓時の既定→check_set_ext_rule で切替）。null＝旧伝票／既定';

-- ═══ ★24 列: approvals.staff_direct（裁定421 候補＝スタッフが上限内で即時適用した割引・無料＝日報「割引（スタッフ即時）」） ═══
alter table public.approvals add column if not exists staff_direct boolean not null default false;
comment on column public.approvals.staff_direct is '★0175 v2（裁定421 候補）: true＝スタッフが店設定「上限内は即時」で適用（approval_direct・理由必須・audit）';

-- ═══ ★26 列: receipt_issues.tax_breakdown／issuer_snapshot／payment_method／issued_hash・stores.legal_name／trade_name／receipt_default_desc（裁定422 候補＝簡易インボイス） ═══
alter table public.receipt_issues add column if not exists tax_breakdown jsonb;
alter table public.receipt_issues add column if not exists issuer_snapshot jsonb;
alter table public.receipt_issues add column if not exists payment_method text;
alter table public.receipt_issues drop constraint if exists receipt_issues_payment_method_check;
alter table public.receipt_issues add constraint receipt_issues_payment_method_check check (payment_method is null or payment_method in ('cash','card','other','mixed'));
alter table public.receipt_issues add column if not exists issued_hash text;
comment on column public.receipt_issues.tax_breakdown is '★0175 v2（裁定422 候補）: 税率ごとの内訳 [{rate, amount_incl, tax, display}]（発行時に凍結・1 税率 1 回丸め）';
comment on column public.receipt_issues.issuer_snapshot is '★0175 v2（裁定422 候補）: 発行時点の発行者 {legal_name, trade_name, store_name, address, tel, reg_no（登録事業者のみ）}';
comment on column public.receipt_issues.payment_method is '★0175 v2（裁定422 候補）: cash／card／other／mixed（印紙の判定＝現金かつ税込 5 万円以上）';
comment on column public.receipt_issues.issued_hash is '★0175 v2（裁定422 候補）: 凍結内容の sha256（改変検知）。削除 RPC は作らない（保存 7 年）';
alter table public.stores add column if not exists legal_name text;
alter table public.stores add column if not exists trade_name text;
alter table public.stores add column if not exists receipt_default_desc text;
comment on column public.stores.legal_name is '★0175 v2（裁定422 候補）: 領収書の発行者＝法人名（空＝店名）';
comment on column public.stores.receipt_default_desc is '★0175 v2（裁定422 候補）: 但し書きの既定（空＝「ご飲食代として」）';

-- ═══ ★27 列: kiosk_sessions.end_reason（裁定423 候補＝操作完了／無操作／手動） ═══
alter table public.kiosk_sessions add column if not exists end_reason text;
alter table public.kiosk_sessions drop constraint if exists kiosk_sessions_end_reason_check;
alter table public.kiosk_sessions add constraint kiosk_sessions_end_reason_check check (end_reason is null or end_reason in ('done','idle','manual','relogin'));
comment on column public.kiosk_sessions.end_reason is '★0175 v2（裁定423 候補）: 解除の終了理由（done 操作完了／idle 無操作／manual 手動／relogin 別の人が解除）';
alter table public.kiosk_sessions add column if not exists token_hash text;
alter table public.kiosk_sessions add column if not exists unlock_method text not null default 'pin';
alter table public.kiosk_sessions drop constraint if exists kiosk_sessions_unlock_method_check;
alter table public.kiosk_sessions add constraint kiosk_sessions_unlock_method_check check (unlock_method in ('pin','qr'));
create index if not exists kiosk_sessions_token_hash_idx on public.kiosk_sessions(token_hash) where token_hash is not null;
comment on column public.kiosk_sessions.token_hash is '★0175 v2（裁定423 候補）: QR 解除のトークンの sha256＝同じトークンは 1 回だけ（二重解除を拒否）';
alter table public.memberships add column if not exists qr_secret text;
alter table public.memberships add column if not exists qr_fail_count integer not null default 0;
alter table public.memberships add column if not exists qr_locked_until timestamptz;
comment on column public.memberships.qr_secret is '★0175 v2（裁定423 候補）: キオスク用 QR の秘密鍵（hex 20 byte・TOTP 30 秒・本人が my_qr_secret で作る＝本人と RPC だけが読む・RLS の列は select に含めない）';

-- ═══ ★25 導出: stores.settings_json.sys_cast_register（裁定420＝0 OFF／1 注文のみ／2 会計まで・旧 cast_register_enabled true→1） ═══
update public.stores
   set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{sys_cast_register}', to_jsonb(case when coalesce(settings_json->>'cast_register_enabled', '') = 'true' then 1 else 0 end), true)
 where not (coalesce(settings_json, '{}'::jsonb) ? 'sys_cast_register');

-- ═══ ★2 列: receipt_issues.reissue_of／by_membership ═══
alter table public.receipt_issues add column if not exists reissue_of uuid references public.receipt_issues(id);
alter table public.receipt_issues add column if not exists by_membership uuid references public.memberships(id);
create index if not exists receipt_issues_reissue_of_idx on public.receipt_issues(reissue_of) where reissue_of is not null;
comment on column public.receipt_issues.reissue_of is '★0175（裁定402）: 再発行の元の行（元は同一 tx で取消）';

-- ═══ ★3 列: comp_plans.slide_method／pt_rules・products.pt（405／407） ═══
alter table public.comp_plans add column if not exists slide_method text not null default 'none';
alter table public.comp_plans drop constraint if exists comp_plans_slide_method_check;
alter table public.comp_plans add constraint comp_plans_slide_method_check check (slide_method in ('sales','point','none'));
alter table public.comp_plans add column if not exists pt_rules jsonb not null default '{}'::jsonb;
alter table public.comp_plans drop constraint if exists comp_plans_pt_rules_obj;
alter table public.comp_plans add constraint comp_plans_pt_rules_obj check (jsonb_typeof(pt_rules) = 'object');
alter table public.products add column if not exists pt numeric;
alter table public.products drop constraint if exists products_pt_check;
alter table public.products add constraint products_pt_check check (pt is null or (pt >= 0 and pt = round(pt, 1)));
comment on column public.comp_plans.slide_method is '★0175（裁定407）: 時給スライドの方式＝sales／point／none（単一選択）';
comment on column public.comp_plans.pt_rules is '★0175（裁定405）: pt 付与ルール {hon,jonai,dohan,work_day,sales_yen_per_pt,sales_pt}（商品は products.pt）';
-- ★3 407 移行: 売上の段あり→sales・なければ pt の段→point・どちらも無し→none（デモ ACE＝sales・LUNA＝point の見込み＝verify で確認）
update public.comp_plans
   set slide_method = case when jsonb_typeof(sales_slide) = 'array' and jsonb_array_length(sales_slide) > 0 then 'sales'
                           when jsonb_typeof(point_slide) = 'array' and jsonb_array_length(point_slide) > 0 then 'point'
                           else 'none' end;

-- ═══ ★4 列: payroll_adjustments（種別・元記録・取消済み）・daily_pays（取消済み） ═══
alter table public.payroll_adjustments add column if not exists kind text;
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_kind_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_kind_ck check (kind is null or kind in ('late','absent','norm_shortfall','other'));
alter table public.payroll_adjustments add column if not exists source_table text;
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_source_table_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_source_table_ck check (source_table is null or source_table in ('shifts','attendance','punches'));
alter table public.payroll_adjustments add column if not exists source_id uuid;
alter table public.payroll_adjustments add column if not exists cancelled_at timestamptz;
alter table public.payroll_adjustments add column if not exists cancelled_by uuid references public.users(id);
alter table public.payroll_adjustments add column if not exists cancel_reason text;
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_cancel_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_cancel_ck check ((cancelled_at is null) = (cancelled_by is null) and (cancelled_at is null or length(trim(coalesce(cancel_reason, ''))) between 1 and 200));
alter table public.daily_pays add column if not exists cancelled_at timestamptz;
alter table public.daily_pays add column if not exists cancelled_by uuid references public.users(id);
alter table public.daily_pays add column if not exists cancel_reason text;
alter table public.daily_pays drop constraint if exists daily_pays_cancel_ck;
alter table public.daily_pays add constraint daily_pays_cancel_ck check ((cancelled_at is null) = (cancelled_by is null));

-- ═══ ★7 列: 新規店の税既定＝外税・W-24 メモ・408 VIP ═══
alter table public.stores alter column price_display set default 'tax_excluded';   -- ★7 0175（v50 §3-3）: 新規店の既定＝外税（既存行は不変）
alter table public.daily_reports add column if not exists other_cash_memo text;   -- ★7 0175（W-24 候補）: 「その他の現金支払」のメモ（今は note の 1 行目）
alter table public.daily_reports drop constraint if exists daily_reports_other_cash_memo_len;
alter table public.daily_reports add constraint daily_reports_other_cash_memo_len check (other_cash_memo is null or length(other_cash_memo) <= 200);
alter table public.pricing_rules add column if not exists vip_timing text not null default 'per_set';
alter table public.pricing_rules drop constraint if exists pricing_rules_vip_timing_check;
alter table public.pricing_rules add constraint pricing_rules_vip_timing_check check (vip_timing in ('per_set','on_entry'));
alter table public.pricing_rules add column if not exists vip_ext_amount integer;
alter table public.pricing_rules drop constraint if exists pricing_rules_vip_ext_amount_check;
alter table public.pricing_rules add constraint pricing_rules_vip_ext_amount_check check (vip_ext_amount is null or vip_ext_amount >= 0);
comment on column public.pricing_rules.vip_timing is '★0175（裁定408 追補1）: VIP 料金のかかるタイミング＝per_set（セットごと・延長は vip_ext_amount）／on_entry（入店時 1 回）。卓ごと／人ごとは billing_unit';

-- ═══ ★8 列: stores の打刻設定 9・punches.geo_override・punch_round_consents（398） ═══
alter table public.stores add column if not exists punch_enforce boolean not null default false;
alter table public.stores add column if not exists punch_restrict_mode text not null default 'gps';
alter table public.stores drop constraint if exists stores_punch_restrict_mode_check;
alter table public.stores add constraint stores_punch_restrict_mode_check check (punch_restrict_mode in ('gps','ip','either','both','tablet'));
alter table public.stores add column if not exists punch_lat double precision;
alter table public.stores add column if not exists punch_lng double precision;
alter table public.stores add column if not exists punch_radius_m integer;
alter table public.stores drop constraint if exists stores_punch_radius_m_check;
alter table public.stores add constraint stores_punch_radius_m_check check (punch_radius_m is null or (punch_radius_m between 10 and 100000));
alter table public.stores add column if not exists punch_allow_ip text[] not null default '{}'::text[];
alter table public.stores add column if not exists punch_require_shift text not null default 'off';
alter table public.stores drop constraint if exists stores_punch_require_shift_check;
alter table public.stores add constraint stores_punch_require_shift_check check (punch_require_shift in ('off','warn','block'));
alter table public.stores add column if not exists punch_round_unit smallint not null default 1;
alter table public.stores drop constraint if exists stores_punch_round_unit_check;
alter table public.stores add constraint stores_punch_round_unit_check check (punch_round_unit in (1,5,10,15,30));
alter table public.stores add column if not exists punch_round_mode text not null default 'nearest';
alter table public.stores drop constraint if exists stores_punch_round_mode_check;
alter table public.stores add constraint stores_punch_round_mode_check check (punch_round_mode in ('staff_favor','store_favor','nearest'));
comment on column public.stores.punch_enforce is '★0175（398・BZ-R）: 打刻の判定＝true ハード（範囲外は理由を書けば通る・tablet は断る）／false ソフト（記録のみ）';
alter table public.punches add column if not exists geo_override boolean not null default false;
comment on column public.punches.geo_override is '★0175（398）: 範囲外を本人の理由で通した打刻（note に理由）';

create table if not exists public.punch_round_consents (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  store_id        uuid not null references public.stores(id) on delete cascade,
  changed_by      uuid references public.users(id),
  old_unit        smallint not null,
  old_mode        text not null,
  new_unit        smallint not null,
  new_mode        text not null,
  consent_version text,
  created_at      timestamptz not null default now()
);
create index if not exists punch_round_consents_store_idx on public.punch_round_consents(store_id, created_at desc);
alter table public.punch_round_consents enable row level security;
drop policy if exists punch_round_consents_select on public.punch_round_consents;
create policy punch_round_consents_select on public.punch_round_consents for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.punch_round_consents from public, anon, authenticated;
grant select on table public.punch_round_consents to authenticated;
comment on table public.punch_round_consents is '★0175（398）: 勤務時間の丸めの変更と同意（append-only・書くのは set_store_profile だけ）';

-- ═══ ★9 表: availability／availability_terms（397＋413 追補1）・staff_contracts／memberships の列 ═══
create table if not exists public.availability (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  dow           smallint not null check (dow between 0 and 6),
  avail         text not null check (avail in ('ok','ng','ask')),
  from_min      integer check (from_min is null or (from_min between 0 and 1439)),
  to_min        integer check (to_min is null or (to_min between 0 and 2879)),
  memo          text check (memo is null or length(memo) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint availability_time_pair check ((from_min is null) = (to_min is null)),
  constraint availability_uq unique (membership_id, dow)
);
create index if not exists availability_store_idx on public.availability(store_id);
alter table public.availability enable row level security;
drop policy if exists availability_select on public.availability;
create policy availability_select on public.availability for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager','staff') or membership_id = public.auth_membership_id()));
revoke all on table public.availability from public, anon, authenticated;
grant select on table public.availability to authenticated;
comment on table public.availability is '★0175（裁定397）: 基本の働き方＝membership 単位・曜日ごと 可／不可／相談＋時間帯（分・翌日またぎ＝to_min 1440+）＋メモ';

create table if not exists public.availability_terms (
  membership_id    uuid primary key references public.memberships(id) on delete cascade,
  org_id           uuid not null references public.orgs(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  week_days_target integer check (week_days_target is null or (week_days_target between 0 and 7)),
  fixed_off_dows   smallint[] not null default '{}'::smallint[],
  effective_from   date,
  memo             text check (memo is null or length(memo) <= 200),
  updated_by       uuid references public.memberships(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.availability_terms enable row level security;
drop policy if exists availability_terms_select on public.availability_terms;
create policy availability_terms_select on public.availability_terms for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager','staff') or membership_id = public.auth_membership_id()));
revoke all on table public.availability_terms from public, anon, authenticated;
grant select on table public.availability_terms to authenticated;
comment on table public.availability_terms is '★0175（裁定413 追補1）: 週の出勤日数の目安・固定休（曜日）・適用開始日（availability と同じ RPC で書く）';

alter table public.staff_contracts add column if not exists pay_kind text not null default 'hourly';
alter table public.staff_contracts drop constraint if exists staff_contracts_pay_kind_check;
alter table public.staff_contracts add constraint staff_contracts_pay_kind_check check (pay_kind in ('hourly','monthly','daily','monthly_fixed'));
alter table public.staff_contracts add column if not exists monthly integer check (monthly is null or monthly >= 0);
alter table public.staff_contracts add column if not exists daily integer check (daily is null or daily >= 0);
alter table public.staff_contracts add column if not exists min_month_h numeric check (min_month_h is null or min_month_h >= 0);
alter table public.staff_contracts add column if not exists max_month_h numeric check (max_month_h is null or max_month_h >= 0);
alter table public.staff_contracts add column if not exists max_consec integer check (max_consec is null or max_consec >= 0);
comment on column public.staff_contracts.pay_kind is '★0175（399・v50）: 雇用＝hourly（時給）／monthly（月給）・委託＝daily（日給）／monthly_fixed（月額）。書込 RPC は 0176';
alter table public.memberships add column if not exists hire_date date;
alter table public.memberships add column if not exists leave_date date;
alter table public.memberships drop constraint if exists memberships_hire_leave_check;
alter table public.memberships add constraint memberships_hire_leave_check check (hire_date is null or leave_date is null or leave_date >= hire_date);

-- ═══ ★10 列: users.contact_email／phone（400） ═══
alter table public.users add column if not exists contact_email text;
alter table public.users add column if not exists phone text;
alter table public.users drop constraint if exists users_phone_check;
alter table public.users add constraint users_phone_check check (phone is null or phone ~ '^[0-9+\-() ]{6,20}$');
comment on column public.users.contact_email is '★0175（400・BZ-R）: 連絡用メール（ログインの email とは別・本人が set_my_contact で変える）';


-- ═══ ★11〜★20 v2（CN-R・裁定418／412 追補／R-4／PR-1）: 列・CHECK・表 5 ═══
alter table public.stores add column if not exists service_rate_by_seat jsonb not null default '{}'::jsonb;   -- ★11 v2（CN-R ②）
alter table public.stores drop constraint if exists stores_service_rate_by_seat_obj;
alter table public.stores add constraint stores_service_rate_by_seat_obj check (jsonb_typeof(service_rate_by_seat) = 'object');
alter table public.check_lines drop constraint if exists check_lines_fee_kind_check;   -- ★11 v2（CN-R ③）: +pay_discount（支払方法による割引行）
alter table public.check_lines add constraint check_lines_fee_kind_check check (fee_kind is null or fee_kind in ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge','pay_fee','pay_discount'));
-- ★12 v2（CN-R ⑥⑦⑭⑮⑰⑱⑳）: comp_plans の CANON 拡張 11 列（書くのは comp_plan_ext_set）
alter table public.comp_plans add column if not exists pay_rate_tiers jsonb not null default '[]'::jsonb;
alter table public.comp_plans drop constraint if exists comp_plans_pay_rate_tiers_arr;
alter table public.comp_plans add constraint comp_plans_pay_rate_tiers_arr check (jsonb_typeof(pay_rate_tiers) = 'array');
alter table public.comp_plans add column if not exists slide_streak_n smallint not null default 1;
alter table public.comp_plans drop constraint if exists comp_plans_slide_streak_n_check;
alter table public.comp_plans add constraint comp_plans_slide_streak_n_check check (slide_streak_n between 1 and 12);
alter table public.comp_plans add column if not exists reward_axis text;
alter table public.comp_plans drop constraint if exists comp_plans_reward_axis_check;
alter table public.comp_plans add constraint comp_plans_reward_axis_check check (reward_axis is null or reward_axis in ('sales','pt','pay_rate'));
alter table public.comp_plans add column if not exists assess_grace_months smallint not null default 0;
alter table public.comp_plans drop constraint if exists comp_plans_assess_grace_months_check;
alter table public.comp_plans add constraint comp_plans_assess_grace_months_check check (assess_grace_months between 0 and 24);
alter table public.comp_plans add column if not exists hon_back_unit text not null default 'per_check';
alter table public.comp_plans add column if not exists jonai_back_unit text not null default 'per_check';
alter table public.comp_plans add column if not exists dohan_back_unit text not null default 'per_check';
alter table public.comp_plans drop constraint if exists comp_plans_back_unit_check;
alter table public.comp_plans add constraint comp_plans_back_unit_check check (hon_back_unit in ('per_check','per_hour','per_30min','per_extension','per_set','hourly_add') and jonai_back_unit in ('per_check','per_hour','per_30min','per_extension','per_set','hourly_add') and dohan_back_unit in ('per_check','per_hour','per_30min','per_extension','per_set','hourly_add'));   -- ★v2 最終（CSV BELLEZZA）: +hourly_add
alter table public.comp_plans add column if not exists product_back_rate_by_kind jsonb not null default '{}'::jsonb;
alter table public.comp_plans drop constraint if exists comp_plans_product_back_rate_by_kind_obj;
alter table public.comp_plans add constraint comp_plans_product_back_rate_by_kind_obj check (jsonb_typeof(product_back_rate_by_kind) = 'object');
alter table public.comp_plans add column if not exists product_back_fixed_vip integer;
alter table public.comp_plans drop constraint if exists comp_plans_product_back_fixed_vip_check;
alter table public.comp_plans add constraint comp_plans_product_back_fixed_vip_check check (product_back_fixed_vip is null or product_back_fixed_vip >= 0);
alter table public.comp_plans add column if not exists product_back_rate_vip numeric;
alter table public.comp_plans drop constraint if exists comp_plans_product_back_rate_vip_check;
alter table public.comp_plans add constraint comp_plans_product_back_rate_vip_check check (product_back_rate_vip is null or (product_back_rate_vip between 0 and 100));
alter table public.comp_plans add column if not exists reservation_back_tiers jsonb not null default '[]'::jsonb;
alter table public.comp_plans drop constraint if exists comp_plans_reservation_back_tiers_arr;
alter table public.comp_plans add constraint comp_plans_reservation_back_tiers_arr check (jsonb_typeof(reservation_back_tiers) = 'array');
alter table public.comp_plans add column if not exists back_rate_tiers jsonb not null default '{}'::jsonb;   -- ★v2 最終（CSV SCANDAL・2026-10-23）: 売上小計帯→本指名／場内のバック率 {hon:[{at,rate}], jonai:[…]}
alter table public.comp_plans drop constraint if exists comp_plans_back_rate_tiers_obj;
alter table public.comp_plans add constraint comp_plans_back_rate_tiers_obj check (jsonb_typeof(back_rate_tiers) = 'object');
alter table public.comp_plans drop constraint if exists comp_plans_slide_basis_check;   -- ★12 v2（CN-R ⑥）: +pay_rate
alter table public.comp_plans add constraint comp_plans_slide_basis_check check (slide_basis in ('sales','hon_count','dohan_count','pay_rate'));
alter table public.comp_plans drop constraint if exists comp_plans_hon_back_pair_check;     -- ★12 v2（CN-R ⑭）: 固定額＋率の併用＝rate は mode 'rate' のとき必須・per_count でも持てる
alter table public.comp_plans add constraint comp_plans_hon_back_pair_check check (hon_back_mode <> 'rate' or hon_back_rate is not null);
alter table public.comp_plans drop constraint if exists comp_plans_jonai_back_pair_check;
alter table public.comp_plans add constraint comp_plans_jonai_back_pair_check check (jonai_back_mode <> 'rate' or jonai_back_rate is not null);
alter table public.comp_plans drop constraint if exists comp_plans_dohan_back_pair_check;
alter table public.comp_plans add constraint comp_plans_dohan_back_pair_check check (dohan_back_mode <> 'rate' or dohan_back_rate is not null);
comment on column public.comp_plans.pay_rate_tiers is '★0175 v2（CN-R ⑥⑰・裁定418）: 報酬率スライドの段 [{at_pct, up_amount, back_mult, pay_pct, wage_cut_pct, hon_back_rate, days_min, back_gate_pct}]';
comment on column public.comp_plans.reward_axis is '★0175 v2（裁定412 追補・Agoora 承認 10/23）: プラン単位の報酬の軸（sales／pt／pay_rate・null＝店の軸＝互換）';
-- ★17 v2（R-4・裁定417・CN-R ⑧）: attendance.status＝'dohan' を撤去（同伴の正本＝伝票）・+help／duty_absent。既存の 'dohan' 行は shukkin へ（live の件数は verify で）
update public.attendance set status = 'shukkin' where status = 'dohan';
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check check (status in ('shukkin','late','off','absent','help','duty_absent'));
comment on column public.attendance.status is '★0175 v2: shukkin／late／off／absent／help（ヘルプ出勤＝日数に数えない）／duty_absent（従事欠勤＝日数に数えない）。dohan は撤去（同伴＝check_nominations.is_dohan）';

create table if not exists public.plan_rate_bands (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  plan_id      uuid not null references public.comp_plans(id) on delete cascade,
  target       text not null check (target in ('hourly','hon_back','jonai_back','dohan_back','drink_back')),
  from_min     integer not null check (from_min between 0 and 2879),
  to_min       integer not null check (to_min between 1 and 2880),
  value_amount integer check (value_amount is null or value_amount >= 0),
  value_rate   numeric check (value_rate is null or (value_rate between 0 and 100)),
  priority     integer not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint plan_rate_bands_range check (to_min > from_min),
  constraint plan_rate_bands_value check ((value_amount is null) <> (value_rate is null))
);
create index if not exists plan_rate_bands_plan_idx on public.plan_rate_bands(plan_id, target);
alter table public.plan_rate_bands enable row level security;
drop policy if exists plan_rate_bands_select on public.plan_rate_bands;
create policy plan_rate_bands_select on public.plan_rate_bands for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.plan_rate_bands from public, anon, authenticated;
grant select on table public.plan_rate_bands to authenticated;
comment on table public.plan_rate_bands is '★0175 v2（CN-R ④⑯）: 時間帯→値の表（時給・本指名／場内／同伴／ドリンクのバック）。hourly の額 0＝時給停止';

create table if not exists public.plan_norm_tiers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  plan_id        uuid not null references public.comp_plans(id) on delete cascade,
  week_days_min  smallint not null check (week_days_min between 0 and 7),
  week_days_max  smallint not null check (week_days_max between 0 and 7),
  days_required  integer not null check (days_required >= 0),
  hours_required numeric not null check (hours_required >= 0),
  created_at     timestamptz not null default now(),
  constraint plan_norm_tiers_range check (week_days_max >= week_days_min)
);
create index if not exists plan_norm_tiers_plan_idx on public.plan_norm_tiers(plan_id);
alter table public.plan_norm_tiers enable row level security;
drop policy if exists plan_norm_tiers_select on public.plan_norm_tiers;
create policy plan_norm_tiers_select on public.plan_norm_tiers for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.plan_norm_tiers from public, anon, authenticated;
grant select on table public.plan_norm_tiers to authenticated;
comment on table public.plan_norm_tiers is '★0175 v2（CN-R ⑤）: 週の出勤日数の目安の区分別の規定（日数・時間・月間の値＝期の長さに比例）';

create table if not exists public.plan_event_bonuses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  plan_id    uuid not null references public.comp_plans(id) on delete cascade,
  kind       text not null check (kind in ('birthday','date_range')),
  day_from   smallint check (day_from is null or day_from between 1 and 31),
  day_to     smallint check (day_to is null or day_to between 1 and 31),
  target     text not null check (target in ('hon','jonai','dohan','drink','all')),
  add_rate   numeric check (add_rate is null or (add_rate between 0 and 100)),
  add_amount integer check (add_amount is null or add_amount >= 0),
  label      text check (label is null or length(label) <= 40),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint plan_event_bonuses_add check ((add_rate is null) <> (add_amount is null)),
  constraint plan_event_bonuses_range check (kind <> 'date_range' or (day_from is not null and day_to is not null and day_to >= day_from))
);
create index if not exists plan_event_bonuses_plan_idx on public.plan_event_bonuses(plan_id);
alter table public.plan_event_bonuses enable row level security;
drop policy if exists plan_event_bonuses_select on public.plan_event_bonuses;
create policy plan_event_bonuses_select on public.plan_event_bonuses for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.plan_event_bonuses from public, anon, authenticated;
grant select on table public.plan_event_bonuses to authenticated;
comment on table public.plan_event_bonuses is '★0175 v2（CN-R ⑳）: イベント加算＝誕生日（DAYTONA）／毎月の期間（CLASS 1〜7 日の同伴加算）・対象バック・率か額';

create table if not exists public.slide_decisions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  plan_id     uuid not null references public.comp_plans(id) on delete cascade,
  cast_id     uuid not null references public.casts(id) on delete cascade,
  period_key  text not null,
  direction   text not null check (direction in ('up','hold','assess')),
  tier_idx    integer not null default 0,
  streak      integer not null default 0,
  detail      jsonb not null default '{}'::jsonb,
  proposed_at timestamptz not null default now(),
  applied_at  timestamptz,
  excluded_at timestamptz,
  decided_by  uuid references public.users(id),
  reason      text check (reason is null or length(reason) <= 200),
  constraint slide_decisions_uq unique (plan_id, cast_id, period_key),
  constraint slide_decisions_one_way check (applied_at is null or excluded_at is null)
);
create index if not exists slide_decisions_store_open_idx on public.slide_decisions(store_id, proposed_at desc) where applied_at is null and excluded_at is null;
alter table public.slide_decisions enable row level security;
drop policy if exists slide_decisions_select on public.slide_decisions;
create policy slide_decisions_select on public.slide_decisions for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()) and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id()));
revoke all on table public.slide_decisions from public, anon, authenticated;
grant select on table public.slide_decisions to authenticated;
comment on table public.slide_decisions is '★0175 v2（CN-R ⑦⑬）: スライドの判定ログ兼提案（期ごと・方向・連続期数・店の適用／除外）';

create table if not exists public.cast_rate_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  cast_id     uuid not null references public.casts(id) on delete cascade,
  kind        text not null check (kind in ('base','slide_up','guarantee','manual')),
  rate        integer not null check (rate between 0 and 100000),
  valid_from  date not null,
  valid_to    date,
  source      text not null default 'manual' check (source in ('manual','slide','guarantee','plan')),
  decision_id uuid references public.slide_decisions(id) on delete set null,
  note        text check (note is null or length(note) <= 200),
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  constraint cast_rate_history_range check (valid_to is null or valid_to >= valid_from)
);
create index if not exists cast_rate_history_cast_idx on public.cast_rate_history(cast_id, valid_from desc);
alter table public.cast_rate_history enable row level security;
drop policy if exists cast_rate_history_select on public.cast_rate_history;
create policy cast_rate_history_select on public.cast_rate_history for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()) and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id()));
revoke all on table public.cast_rate_history from public, anon, authenticated;
grant select on table public.cast_rate_history to authenticated;
comment on table public.cast_rate_history is '★0175 v2（CN-R ⑫・PR-1 裁定416）: 時給の変更履歴（基本／段の累積加算／保証の開始〜終了／手動・日付付き）＝R-2 の rate(d) が P175 後に読む';

-- ═══ ★3 pt_rules_check（内部ヘルパー・4 ロール revoke） ═══
CREATE OR REPLACE FUNCTION public.pt_rules_check(p_rules jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
-- ★3 0175（裁定405）: pt 付与ルールの形＝object。鍵＝hon／jonai／dohan／work_day（1 件あたり pt・0 以上・小数 1 桁）・sales_yen_per_pt（指名売上○円ごと・1 以上の整数・既定 10000）・sales_pt（○pt・0 以上・小数 1 桁）。
--   商品は商品マスタの pt 列（products.pt）＝ここには鍵を持たない。加点のみ（負は拒否）。内部ヘルパー（公開 RPC から呼ぶ・4 ロール revoke）
declare
  v_k text; v_v numeric;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then raise exception 'bad pt_rules'; end if;
  for v_k in select jsonb_object_keys(p_rules) loop
    if v_k not in ('hon','jonai','dohan','work_day','sales_yen_per_pt','sales_pt') then raise exception 'bad pt_rules'; end if;
    if jsonb_typeof(p_rules->v_k) <> 'number' then raise exception 'bad pt_rules'; end if;
    v_v := (p_rules->>v_k)::numeric;
    if v_v < 0 or v_v > 100000 then raise exception 'bad pt_rules'; end if;
    if v_k = 'sales_yen_per_pt' then
      if v_v <> floor(v_v) or v_v < 1 then raise exception 'bad pt_rules'; end if;
    elsif v_v <> round(v_v, 1) then
      raise exception 'bad pt_rules';
    end if;
  end loop;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.pt_rules_check(jsonb) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke・grant なし

-- ═══ ★1／★21 check_pay（c11691b8）＝11 引数（v2 追補 P-8: +p_fee_amount） ═══
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text, p_fee_key text DEFAULT NULL::text, p_fee_rate numeric DEFAULT NULL::numeric, p_fee_on boolean DEFAULT true, p_fee_amount integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
  v_org uuid;  -- ★0057(2)
  v_fkey text; v_rate numeric := 0; v_fee int := 0; v_fee_eff int := 0; v_due2 int; v_sort int; v_fid uuid; v_settings jsonb;  -- ★6 0173（裁定393）・★1 0175: v_rate は numeric（小数 1 桁）
  v_store_rate numeric := 0; v_override boolean := false;  -- ★1 0175（裁定393 追補2）: 店設定の率・店設定と異なる率／OFF
  v_dkey text; v_drate numeric := 0; v_disc int := 0; v_did uuid;  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（393 の裏返し＝別キー pay_discount_rates）
  v_fee_source text := 'auto';  -- ★21 0175 v2（裁定393 追補4）: auto（店の率）／none／manual（この入金だけの額）
  v_mem uuid;  -- ★3 0173（裁定389）: 操作者の membership
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  if public.auth_role() = 'cast' and public.auth_cast_register_level() < 2 then raise exception 'forbidden'; end if;   -- ★25 0175 v2（裁定420）: 「注文のみ」の cast は入金不可
  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（例 現金計 10% OFF）＝店設定 pay_discount_rates の率>0 なら、この方法で払う残額に対する割引行を立てて due を下げる（p_fee_on=false は割引も止める＝「上乗せ／割引を適用しない」）
  if p_fee_on then
    v_dkey := case when p_method = 'cash' then 'cash' when p_method = 'card' then 'card' when p_method = 'other' then coalesce(p_fee_key, 'other') else null end;
    if v_dkey is not null then
      if v_settings is null then select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id; end if;
      v_drate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_discount_rates'->>v_dkey, '')::numeric, 0);
      if v_drate > 0 then
        v_disc := round((v_due - v_paid) * v_drate / 100.0)::int;
        if v_disc > 0 then
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'discount', v_grp,
                  (case v_dkey when 'cash' then '現金割引 ' when 'card' then 'カード割引 ' when 'emoney' then '電子マネー割引 ' else '決済割引 ' end) || rtrim(rtrim(to_char(v_drate, 'FM990.0'), '0'), '.') || '%',
                  v_disc, 1, v_disc, null, v_sort, false, 'pay_discount', 'taxable_10', v_drate)
          returning id into v_did;
          perform public.check_recalc(p_check_id);
          v_due := public.check_group_due(p_check_id, v_grp);
        end if;
      end if;
    end if;
  end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  -- ★6 0173（裁定393）: 支払方法別の手数料＝店設定 pay_fee_rates（card／emoney／other・cash／ar は対象外・欠損＝0）。
  --   手数料＝round(p_amount×率/100)（1 円未満四捨五入・併用時はその方法で入金する分だけ）→ 伝票行（kind 'charge'・fee_kind 'pay_fee'・同じ pay_group・内税対象）
  --   → check_recalc → 受取額（payments.amount）＝p_amount＋due の増分（丸め単位に従う）。キャスト売上（cast_sales_aggregate）は除外・日報は pay_fee_total。
  if p_method in ('card','other') then
    v_fkey := coalesce(p_fee_key, case when p_method = 'card' then 'card' else 'other' end);
    if v_fkey not in ('card','emoney','other') then raise exception 'bad fee_key'; end if;
    if (p_method = 'card') <> (v_fkey = 'card') then raise exception 'bad fee_key'; end if;
    select s.settings_json into v_settings from public.stores s where s.id = v_chk.store_id;
    v_store_rate := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->'pay_fee_rates'->>v_fkey, '')::numeric, 0);
    -- ★1 0175（裁定393 追補2）: 入金モーダルの「手数料を上乗せ ON／OFF」と率（0〜100・小数 1 桁）。null＝店設定。OFF／0% なら手数料行なし。店設定と異なる率／OFF は audit（操作者付き）
    if p_fee_on is null then raise exception 'bad fee_on'; end if;
    if p_fee_rate is not null and (p_fee_rate < 0 or p_fee_rate > 100 or p_fee_rate <> round(p_fee_rate, 1)) then raise exception 'bad fee_rate'; end if;
    v_rate := case when not p_fee_on then 0 else coalesce(p_fee_rate, v_store_rate) end;
    -- ★21 0175 v2（裁定393 追補4）: 入金ごとの上書き＝p_fee_amount（null＝自動／0＝なし／正＝指定額・残額まで）。p_fee_on=false は 0 と同じ
    if p_fee_amount is not null and (p_fee_amount < 0 or p_fee_amount > v_due - v_paid) then raise exception 'bad fee_amount'; end if;
    -- ★24 0175 v2（裁定421 候補）: 手数料の「なし／指定」＝cast は不可・staff は sys_staff_discount=1 かつ カット額（店の率の手数料 − 指定額）が staff_discount_cap 以内
    if p_fee_amount is not null and public.auth_role() = 'cast' then raise exception 'forbidden'; end if;
    if p_fee_amount is not null and public.auth_role() = 'staff' then
      if coalesce((coalesce(v_settings, '{}'::jsonb)->>'sys_staff_discount')::int, 0) <> 1 then raise exception 'forbidden'; end if;
      if round(p_amount * v_store_rate / 100.0)::int - p_fee_amount > coalesce((coalesce(v_settings, '{}'::jsonb)->>'staff_discount_cap')::int, 0) then raise exception 'over cap'; end if;
    end if;
    v_fee_source := case when (p_fee_amount is not null and p_fee_amount = 0) or not p_fee_on then 'none'
                         when p_fee_amount is not null then 'manual' else 'auto' end;
    if v_fee_source <> 'auto' then v_rate := 0; end if;
    v_override := (not p_fee_on and v_store_rate > 0) or (p_fee_rate is not null and p_fee_rate <> v_store_rate)
                  or v_fee_source = 'manual' or (v_fee_source = 'none' and p_fee_amount is not null and v_store_rate > 0);
    if v_rate > 0 or v_fee_source = 'manual' then
      v_fee := case when v_fee_source = 'manual' then p_fee_amount else round(p_amount * v_rate / 100.0)::int end;
      if v_fee > 0 then
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)   -- ★1 0175: +fee_rate（適用率の記録）
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', v_grp,
                (case v_fkey when 'card' then 'カード手数料 ' when 'emoney' then '電子マネー手数料 ' else '決済手数料 ' end) || (case when v_fee_source = 'manual' then '（指定）' else rtrim(rtrim(to_char(v_rate, 'FM990.0'), '0'), '.') || '%' end),   -- ★1 0175: 小数 1 桁（10 → '10%'・3.5 → '3.5%'）
                v_fee, 1, v_fee, null, v_sort, false, 'pay_fee', 'taxable_10', case when v_fee_source = 'manual' then null else v_rate end)   -- ★21 v2: 指定額は率なし
        returning id into v_fid;
        perform public.check_recalc(p_check_id);
        v_due2 := public.check_group_due(p_check_id, v_grp);
        v_fee_eff := greatest(0, v_due2 - v_due);
      end if;
    end if;
  end if;

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  v_mem := public.auth_membership_id();   -- ★3 0173（裁定389）: kiosk は null
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail, by_membership, fee_amount, fee_source)   -- ★3 0173: +by_membership・★21 v2: +fee_amount／fee_source
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount + v_fee_eff, p_tendered, p_idem_key, v_actor, v_detail, v_mem, v_fee, v_fee_source)   -- ★6 0173: 受取額＝入金額＋手数料（due の増分）
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id) || jsonb_build_object('pay_fee', v_fee, 'pay_fee_eff', v_fee_eff, 'pay_fee_rate', v_rate, 'pay_fee_line_id', v_fid,
      'pay_fee_on', p_fee_on, 'pay_fee_store_rate', v_store_rate, 'pay_fee_override', v_override,
      'pay_fee_amount', v_fee, 'pay_fee_source', v_fee_source,   -- ★21 v2
      'pay_discount', v_disc, 'pay_discount_rate', v_drate, 'pay_discount_line_id', v_did), v_chk.store_id);   -- ★6 0173: 手数料の痕跡・★1 0175: ON／OFF・店設定の率・上書きの有無・★11 v2: 割引
  if v_override then   -- ★1 0175（裁定393 追補2）: 店設定と異なる率／OFF は別の audit 行（操作者＝by_membership・kiosk は null）
    perform public.audit_log_write('pay_fee_override', 'payments:' || v_id::text,
      jsonb_build_object('store_rate', v_store_rate), jsonb_build_object('fee_on', p_fee_on, 'fee_rate', v_rate, 'fee_amount', v_fee, 'fee_source', v_fee_source, 'by_membership', v_mem), v_chk.store_id);   -- ★21 v2: 実額と source
  end if;

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    if not public.ar_policy_ok(v_chk.store_id, p_amount) then raise exception 'ar disabled'; end if;   -- ★3 0155（裁定309-1）: 0055:165 の 1 行＝店設定 ar_enabled=false なら売掛不可
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer) from public, anon;
grant execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer) to authenticated;

-- ═══ ★1 check_group_due（5c667792） ═══
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text, p_exclude_pay_fee boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
  v_pf int := 0;   -- ★6 0173（裁定393）: 手数料行の合計（サ料の母数から除く・税の母数には乗る＝内税対象）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
     and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 0148 ★10 の referral 除外を削除（kind 'referral' は CHECK から撤去）・★6 0173: 除外指定
  if not p_exclude_pay_fee then
    select coalesce(sum(line_total), 0)::int into v_pf
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and fee_kind = 'pay_fee';   -- ★6 0173
  end if;
  -- ★12 0152（裁定298-9）: burden='customer' の紹介料は pay_group 'A' の小計（サ料・税の母数）に加算（burden='store' は乗らない）
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref
      from public.check_referrals
     where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount';
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  -- ★mig0113: 外税（tax_excluded × taxable のみ）。内税/exempt は下の従来行＝1バイト不変。
  --   規則（設計書 v1 §3 細則）: 税率別に check_tax_round を1回ずつ（伝票×税率×1回＝T5）。
  --   discount は taxable_10 基底へ適用（clamp・8% への按分は F5）。サ料は taxable_10 基底（T6）。
  --   exempt/out_of_scope 行は税 0。TS 鏡像: receipt.ts / check-calc.ts（三面鏡・同時改修）。
  if v_pd = 'tax_excluded' and v_bts = 'taxable' then
    select coalesce(sum(line_total) filter (where tax_category = 'taxable_10'), 0)::int,
           coalesce(sum(line_total) filter (where tax_category = 'taxable_8'),  0)::int
      into v_bx10, v_bx8
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
       and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 同上・★6 0173: 除外指定
    v_bx10 := v_bx10 + v_ref - v_pf;                                       -- ★12 0152（裁定298-9）: taxable_10 の母数にも加算・★1 0175（裁定393 追補3）: 手数料行（taxable_10 で立つ）は税込の金額＝外税の母数から除く（行の金額は不変・サ料の母数からは 0173 で除いてある）
    v_sv     := round((v_net - v_pf) * v_rate / 100.0)::int;              -- サ料（従来と同式・★6 0173: 手数料行はサ料の母数から除く＝pay_fee 無しなら同値）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + round((v_net - v_pf) * v_rate / 100.0), v_unit, v_mode);   -- ★6 0173: 同上
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★2 receipt_issue（a7f04e4c）＝6 引数 ═══
CREATE OR REPLACE FUNCTION public.receipt_issue(p_check_id uuid, p_amount integer DEFAULT NULL::integer, p_recipient text DEFAULT NULL::text, p_proviso text DEFAULT NULL::text, p_biz_date date DEFAULT NULL::date, p_reissue_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := public.auth_org_id();
  v_role    text := public.auth_role();
  v_chk     record;
  v_actor   uuid;
  v_issued  int;
  v_amt     int;
  v_recip   text;
  v_prov    text;
  v_sname   text;
  v_cutoff  text;
  v_bdate   date;
  v_expires date;
  v_serial  int;
  v_id      uuid;
  v_token   uuid;
  v_try     int;
  v_old     record;   -- ★2 0175（裁定402）: 再発行の元の行
  v_mem     uuid;     -- ★2 0175: 操作者の membership
  v_tb      jsonb;    -- ★26 0175 v2（裁定422 候補）: 税率ごとの内訳
  v_snap    jsonb;    -- ★26: 発行者（法人名・屋号・店名・住所・電話・登録番号＝登録事業者のみ）
  v_pm      text;     -- ★26: 支払方法（cash／card／other／mixed＝印紙の判定）
  v_hash    text;     -- ★26: 改変検知（sha256）
  v_s10 int := 0; v_s8 int := 0; v_sx int := 0; v_stot int := 0; v_a10 int := 0; v_a8 int := 0; v_ax int := 0;  -- ★26: 税率別の構成比と按分
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象伝票（FOR UPDATE＝同一伝票の並行発行を一列化＝Σamount ガードの競合封鎖）
  select * into v_chk from public.checks where id = p_check_id for update;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_chk.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register() and public.auth_cast_register_level() >= 2)) then   -- ★25 0175 v2（裁定420）: 「会計まで」の cast は領収書も
    raise exception 'forbidden';
  end if;
  -- 発行は会計済み伝票のみ（open/void は不可）
  if v_chk.status <> 'closed' then raise exception 'not closed'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  v_mem := public.auth_membership_id();   -- ★2 0175（裁定402）: 発行者（users）と操作者（membership）を記録
  -- ★2 0175（裁定402）: 再発行＝元の行は同じ伝票のもの（取消済みでも元にできる）。未取消なら同一トランザクションで自動取消（void_note に理由）
  if p_reissue_of is not null then
    select * into v_old from public.receipt_issues where id = p_reissue_of for update;
    if v_old.id is null or v_old.check_id <> p_check_id then raise exception 'bad reissue_of'; end if;
    if not v_old.voided then
      update public.receipt_issues
         set voided = true, void_note = '再発行のため取消', voided_at = now(), voided_by = v_actor
       where id = p_reissue_of;
    end if;
  end if;
  -- ★2 0175（裁定402）: 日付の訂正＝元の取引日が既定・未来日は不可
  if p_biz_date is not null and p_biz_date > (now() at time zone 'Asia/Tokyo')::date then raise exception 'bad biz_date'; end if;

  -- 宛名・但し書き（trim・空は null・長さは CHECK と同値を関数側でも）
  v_recip := nullif(trim(coalesce(p_recipient, '')), '');
  v_prov  := coalesce(nullif(trim(coalesce(p_proviso, '')), ''),
                      (select nullif(trim(coalesce(s.receipt_default_desc, '')), '') from public.stores s where s.id = v_chk.store_id),
                      'ご飲食代として');   -- ★26 0175 v2（裁定422 候補）: 但し書きの既定＝店設定→「ご飲食代として」
  if v_recip is not null and length(v_recip) > 100 then raise exception 'bad recipient'; end if;
  if v_prov  is not null and length(v_prov)  > 100 then raise exception 'bad proviso';  end if;

  -- 金額（null=残額。Σ既発行（非void）＋今回 ≤ checks.total）
  select coalesce(sum(amount), 0)::int into v_issued
    from public.receipt_issues where check_id = p_check_id and not voided;
  v_amt := coalesce(p_amount, case when p_reissue_of is not null then v_old.amount else v_chk.total - v_issued end);   -- ★2 0175: 再発行の既定＝元の行の金額（取消後の Σ に入る）
  if v_amt <= 0 or v_issued + v_amt > v_chk.total then raise exception 'bad amount'; end if;

  -- 発行時スナップショット（店名・取引日＝closed_at の営業日・cutoff は core と同イディオム）
  select s.name,
         coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
    into v_sname, v_cutoff
    from public.stores s where s.id = v_chk.store_id;
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_bdate := coalesce(p_biz_date, (timezone('Asia/Tokyo', coalesce(v_chk.closed_at, v_chk.started_at))
              - (v_cutoff || ':00')::interval)::date);   -- ★2 0175（裁定402）: 訂正日があればそれ

  -- ★26 0175 v2（裁定422 候補）: 税率別の内訳＝伝票の行を税区分で集計（割引は負）し、受領額（v_amt＝税込）を構成比で按分→税率ごとに 1 回丸め（店の tax_rounding・check_tax_round と同じ流儀）
  select coalesce(sum(case when tax_category = 'taxable_10' then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0),
         coalesce(sum(case when tax_category = 'taxable_8'  then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0),
         coalesce(sum(case when coalesce(tax_category, '') not in ('taxable_10','taxable_8') then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0)
    into v_s10, v_s8, v_sx
    from public.check_lines where check_id = p_check_id;
  v_stot := v_s10 + v_s8 + v_sx;
  if v_stot <= 0 then v_a10 := v_amt; v_a8 := 0; v_ax := 0;
  else v_a10 := round(v_amt * v_s10::numeric / v_stot)::int; v_a8 := round(v_amt * v_s8::numeric / v_stot)::int; v_ax := v_amt - v_a10 - v_a8; end if;
  v_tb := '[]'::jsonb;
  if v_a10 > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 10, 'amount_incl', v_a10,
      'tax', (case coalesce(v_chk.tax_rounding, 'floor') when 'ceil' then ceil(v_a10 * 10.0 / 110.0) when 'round' then round(v_a10 * 10.0 / 110.0) else floor(v_a10 * 10.0 / 110.0) end)::int,
      'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  if v_a8 > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 8, 'amount_incl', v_a8,
      'tax', (case coalesce(v_chk.tax_rounding, 'floor') when 'ceil' then ceil(v_a8 * 8.0 / 108.0) when 'round' then round(v_a8 * 8.0 / 108.0) else floor(v_a8 * 8.0 / 108.0) end)::int,
      'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  if v_ax > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 0, 'amount_incl', v_ax, 'tax', 0, 'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  -- ★26: 発行者＝発行時点の店（登録番号は invoice_status='registered' のときだけ・未登録は null＝公開面は行ごと出さない）
  select jsonb_build_object('legal_name', nullif(trim(coalesce(s.legal_name, '')), ''), 'trade_name', nullif(trim(coalesce(s.trade_name, '')), ''), 'store_name', s.name,
                            'address', nullif(trim(coalesce(s.settings_json->>'receipt_address', '')), ''), 'tel', nullif(trim(coalesce(s.settings_json->>'receipt_tel', '')), ''),
                            'reg_no', case when s.invoice_status = 'registered' then nullif(trim(coalesce(s.invoice_reg_no, '')), '') else null end)
    into v_snap from public.stores s where s.id = v_chk.store_id;
  -- ★26: 支払方法＝伝票の入金が 1 種なら cash／card／other・複数なら mixed・無し（売掛等）は other
  select case when count(*) = 0 then 'other' when count(distinct method) = 1 then (case min(method) when 'cash' then 'cash' when 'card' then 'card' else 'other' end) else 'mixed' end
    into v_pm from public.payments where check_id = p_check_id;

  -- 有効期限 = 発行日（JST）+ 90日（正本B②・R2-9）
  v_expires := (now() at time zone 'Asia/Tokyo')::date + 90;

  -- ★2 0175: v_actor は上（再発行の取消の前）で読んだ

  -- ★R2-10 改訂: serial = max+1 を UNIQUE(store_id, serial) 衝突リトライ≤3 で採番（NOX 初の
  --   ループイディオム。max+1 の FOR UPDATE は範囲読み＝ファントムで直列化しない（0053 注記）ため
  --   一意制約に当てて弾き直す。begin..exception をループ内に置く＝サブトランザクション単位で捕捉）
  v_id := null;
  for v_try in 1..3 loop
    begin
      select coalesce(max(serial), 0) + 1 into v_serial
        from public.receipt_issues where store_id = v_chk.store_id;
      insert into public.receipt_issues
        (org_id, store_id, check_id, serial, amount, recipient, proviso,
         store_name_snap, biz_date, issued_by, expires_on, reissue_of, by_membership,   -- ★2 0175
         tax_breakdown, issuer_snapshot, payment_method)   -- ★26 v2
      values
        (v_chk.org_id, v_chk.store_id, p_check_id, v_serial, v_amt, v_recip, v_prov,
         v_sname, v_bdate, v_actor, v_expires, p_reissue_of, v_mem,
         v_tb, v_snap, v_pm)
      returning id, token into v_id, v_token;
      exit;
    exception when unique_violation then
      v_id := null;  -- 他店同時発行と衝突＝採り直し
    end;
  end loop;
  if v_id is null then raise exception 'busy'; end if;
  -- ★26 0175 v2（裁定422 候補）: 改変検知＝凍結した内容の sha256（番号・金額・宛名・但し書き・取引日・発行時刻・税内訳・発行者・支払方法）。以後は再発行（新番号＋元の行を取消）以外で変えない
  select encode(sha256(convert_to(jsonb_build_object('serial', v_serial, 'amount', v_amt, 'recipient', v_recip, 'proviso', v_prov, 'biz_date', v_bdate,
                                                     'issued_at', ri.issued_at, 'tax_breakdown', v_tb, 'issuer', v_snap, 'payment_method', v_pm)::text, 'UTF8')), 'hex')
    into v_hash from public.receipt_issues ri where ri.id = v_id;
  update public.receipt_issues set issued_hash = v_hash where id = v_id;

  -- 監査（token は記録しない＝公開アクセス鍵を audit へ漏らさない）
  perform public.audit_log_write('receipt_issue', 'receipt_issues:' || v_id::text, null,
    jsonb_build_object('check_id', p_check_id, 'serial', v_serial, 'amount', v_amt,
                       'recipient', v_recip, 'proviso', v_prov,
                       'biz_date', v_bdate, 'expires_on', v_expires,
                       'reissue_of', p_reissue_of, 'by_membership', v_mem, 'biz_date_corrected', p_biz_date is not null,   -- ★2 0175
                       'tax_breakdown', v_tb, 'payment_method', v_pm, 'issued_hash', v_hash),   -- ★26 v2
    v_chk.store_id);

  return jsonb_build_object('id', v_id, 'serial', v_serial, 'token', v_token,
                            'amount', v_amt, 'expires_on', v_expires, 'biz_date', v_bdate,
                            'store_name', v_sname, 'reissue_of', p_reissue_of,   -- ★2 0175
                            'proviso', v_prov, 'tax_breakdown', v_tb, 'issuer_snapshot', v_snap, 'payment_method', v_pm, 'issued_hash', v_hash);   -- ★26 v2
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.receipt_issue(uuid, integer, text, text, date, uuid) from public, anon;
grant execute on function public.receipt_issue(uuid, integer, text, text, date, uuid) to authenticated;

-- ═══ ★3／★8 set_store_profile（45012c75） ═══
CREATE OR REPLACE FUNCTION public.set_store_profile(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm',   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）
                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）
                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1
                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）
                             'slide_apply',                                                               -- ★4 0151: 裁定287-4 の 1 キー（0154 ★7: 末尾 '];' → ','）
                             'settlement_presets',                                                        -- ★7 0154: 裁定294-7 の 1 キー（0153 ★5: 末尾 '];' → ','）
                             'customer_purpose','customer_retention_years',                               -- ★5 0153: 裁定305-11／293-4 の 2 キー（0155 ★4: 末尾 '];' → ','）
                             'ar_enabled',                                                                -- ★4 0155: 裁定309-1 の 1 キー（boolean・新規店の既定は false＝ar_policy_ok の coalesce）（0158 ★4: 末尾 '];' → ','）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             'invoice_registered_on','pay_day','tax_inclusive_display','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours',   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間（0173 ★7: 末尾 '];' → ','）
                             'join_mode','cast_register_device','pay_fee_rates','trial_guarantee_days','default_plan_id',   -- ★7 0173: 裁定386／389／393／396 の 5 キー（0175 ★3: 末尾 '];' → ','）
                             'sys_wage_cut_rule','bonus_tier_mode','sales_split','pt_rules_default',                         -- ★3 0175: X13-I ②（就業規則に減給の定め）・裁定404（達成ボーナスの段）・409（売上の分け方）・405（店の既定 pt ルール）
                             'punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m',                 -- ★8 0175（398 打刻設定・列側）
                             'punch_require_shift','punch_round_unit','punch_round_mode','punch_round_consent_version',       -- ★8 0175（398）: 同意版は列に書かず punch_round_consents に 1 行（v2: 末尾 '];' → ','）
                             'service_rate_by_seat','pay_discount_rates','sys_drink_count_back','sales_subtotal_mode','sales_subtotal_includes_shimei',   -- ★11 0175 v2（CN-R ②③⑨⑩）
                             'settlement_week_close_dow','settlement_pay_days_after','daily_pay_cap_tiers',
                             'sys_staff_discount','staff_discount_cap','sys_cast_register',
                             'kiosk_features','kiosk_idle_sec'];                                                                -- ★27 0175 v2 追補 2 同乗 R-7（裁定423 候補）                                     -- ★24／★25 0175 v2 追補 2（裁定421 候補・裁定420）                   -- ★11 0175 v2（CN-R ⑳ 週払い・日払いの上限）
  v_k        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_name     text;
  v_short    text;
  v_code     text;
  v_disp     text;
  v_ext      boolean;
  v_dohan    boolean;
  v_open     boolean;
  v_confirm  boolean;
  v_settings jsonb;
  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）
  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）
  v_setup_done boolean;   -- ★4 0147: setup_done（show_open_status と同型）
  v_s_hourly boolean;   -- ★4 0147: sys_hourly（show_open_status と同型）
  v_s_backs  boolean;   -- ★4 0147: sys_backs（show_open_status と同型）
  v_s_sales_rate boolean;   -- ★4 0147: sys_sales_rate（show_open_status と同型）
  v_s_points boolean;   -- ★4 0147: sys_points（show_open_status と同型）
  v_s_sales_slide boolean;   -- ★4 0147: sys_sales_slide（show_open_status と同型）
  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）
  v_s_norms  boolean;   -- ★4 0147: sys_norms（show_open_status と同型）
  v_s_penalties boolean;   -- ★4 0147: sys_penalties（show_open_status と同型）
  v_s_bonus  boolean;   -- ★4 0147: sys_bonus（show_open_status と同型）
  v_slide    text;      -- ★4 0151: slide_apply（enum text 2 値・biz_type と同型）
  v_presets  jsonb;     -- ★7 0154: settlement_presets（配列・最大 10）
  v_pe       jsonb;     -- ★7 0154: settlement_presets の要素
  v_purpose  text;      -- ★5 0153: customer_purpose（display_name と同型・≤200）
  v_years    numeric;   -- ★5 0153: customer_retention_years（整数 1〜10）
  v_ar       boolean;   -- ★4 0155: ar_enabled（show_open_status と同型）
  v_okb      numeric;   -- ★4 0158: okuri_base_amount（整数 0〜99999）
  v_inv_on   date;      -- ★2 0164: invoice_registered_on（'YYYY-MM-DD' か null）
  v_pay_day  numeric;   -- ★2 0164: pay_day（整数 1〜31）
  v_tax_inc  boolean;   -- ★2 0164: tax_inclusive_display
  v_use_vip  boolean;   -- ★2 0164: use_vip
  v_use_ctr  boolean;   -- ★2 0164: use_counter
  v_paym     jsonb;     -- ★2 0164: payment_methods（object・cash／card／emoney／qr・boolean・cash は true）
  v_punch    jsonb;     -- ★2 0164: punch_methods（object・self／proxy／kiosk・boolean・1 つ以上 true）
  v_jk       text;      -- ★2 0164: jsonb の検査用キー
  v_cycle    text;      -- ★3 0172: settlement_cycle（enum text 4 値・slide_apply と同型）
  v_midpay   text;      -- ★3 0172: mid_pay（enum text 2 値）
  v_autoh    numeric;   -- ★3 0172: shift_auto_confirm_hours（整数 0〜168・0＝自動確定しない）
  v_join     text;      -- ★2 0173: join_mode（enum text 2 値）
  v_crdev    text;      -- ★3 0173: cast_register_device（enum text 2 値）
  v_pfr      jsonb;     -- ★6 0173: pay_fee_rates（object・card／emoney／other・整数 0〜100）
  v_pfk      text;      -- ★6 0173: jsonb の検査用キー
  v_pfv      numeric;   -- ★6 0173: 率の検査用
  v_tgd      numeric;   -- ★7 0173: trial_guarantee_days（整数 1〜90）
  v_dpid     uuid;      -- ★7 0173: default_plan_id（自店の有効な comp_plans.id）
  v_wcr      boolean;   -- ★3 0175: sys_wage_cut_rule（show_open_status と同型）
  v_btm      text;      -- ★3 0175: bonus_tier_mode（enum text 2 値 max／sum）
  v_split    text;      -- ★3 0175: sales_split（enum text 2 値 prorate／equal）
  v_ptr      jsonb;     -- ★3 0175: pt_rules_default（object・pt_rules_check）
  v_penf     boolean;   -- ★8 0175: punch_enforce
  v_pmode    text;      -- ★8 0175: punch_restrict_mode（5 値）
  v_plat     double precision;   -- ★8 0175: punch_lat（-90〜90・null 可）
  v_plng     double precision;   -- ★8 0175: punch_lng（-180〜180・null 可）
  v_prad     numeric;   -- ★8 0175: punch_radius_m（整数 10〜100000・null 可）
  v_preq     text;      -- ★8 0175: punch_require_shift（off／warn／block）
  v_prunit   numeric;   -- ★8 0175: punch_round_unit（1／5／10／15／30）
  v_prmode   text;      -- ★8 0175: punch_round_mode（staff_favor／store_favor／nearest）
  v_pcv      text;      -- ★8 0175: punch_round_consent_version
  v_actor    uuid;      -- ★8 0175: 同意ログの changed_by
  v_srs      jsonb;     -- ★11 v2: service_rate_by_seat
  v_pdr      jsonb;     -- ★11 v2: pay_discount_rates
  v_sdcb     boolean;   -- ★11 v2: sys_drink_count_back
  v_ssm      text;      -- ★11 v2: sales_subtotal_mode
  v_ssis     boolean;   -- ★11 v2: sales_subtotal_includes_shimei
  v_wcd      numeric;   -- ★11 v2: settlement_week_close_dow
  v_pda      numeric;   -- ★11 v2: settlement_pay_days_after
  v_dct      jsonb;     -- ★11 v2: daily_pay_cap_tiers
  v_ssd      numeric;   -- ★24 v2 追補 2: sys_staff_discount（0 承認制／1 上限内は即時／2 不可）
  v_sdc      numeric;   -- ★24 v2 追補 2: staff_discount_cap（円・上限内は即時の上限）
  v_scr      numeric;   -- ★25 v2 追補 2: sys_cast_register（0 OFF／1 注文のみ／2 会計まで）
  v_kf       jsonb;     -- ★27 v2 R-7: kiosk_features {punch, register, shift}
  v_kis      numeric;   -- ★27 v2 R-7: kiosk_idle_sec（60〜900・既定 180）
  v_prevh    numeric;   -- ★11 v2: 表の昇順検査
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json,   -- ★2 0164: 列を 7 つ続ける
         invoice_registered_on, pay_day, tax_inclusive_display, use_vip, use_counter, payment_methods, punch_methods,   -- ★2 0164: before の現値（0175 ★8: 末尾 ','）
         punch_enforce, punch_restrict_mode, punch_lat, punch_lng, punch_radius_m, punch_require_shift, punch_round_unit, punch_round_mode,   -- ★8 0175（398）: 列側 8 の現値（v2: 末尾 ','）
         service_rate_by_seat   -- ★11 0175 v2（CN-R ②）
    into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  -- 白名単外のキーは黙って無視せず拒否
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;

  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);

  -- ── 列側 ────────────────────────────────────────────────
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;
    v_name := trim(p_patch->>'name');
    if length(v_name) < 1 or length(v_name) > 50 then raise exception 'bad name'; end if;
    v_before := v_before || jsonb_build_object('name', v_store.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;

  if p_patch ? 'short' then
    if jsonb_typeof(p_patch->'short') <> 'string' then raise exception 'bad type'; end if;
    v_short := trim(p_patch->>'short');
    if length(v_short) > 20 then raise exception 'bad short'; end if;
    if v_short = '' then v_short := null; end if;   -- 空欄は null（列は null 可）
    v_before := v_before || jsonb_build_object('short', v_store.short);
    v_after  := v_after  || jsonb_build_object('short', v_short);
  end if;

  if p_patch ? 'ext_shimei_enabled' then
    if jsonb_typeof(p_patch->'ext_shimei_enabled') <> 'boolean' then raise exception 'bad type'; end if;
    v_ext := (p_patch->>'ext_shimei_enabled')::boolean;
    v_before := v_before || jsonb_build_object('ext_shimei_enabled', v_store.ext_shimei_enabled);
    v_after  := v_after  || jsonb_build_object('ext_shimei_enabled', v_ext);
  end if;

  if p_patch ? 'dohan_auto_hon' then
    if jsonb_typeof(p_patch->'dohan_auto_hon') <> 'boolean' then raise exception 'bad type'; end if;
    v_dohan := (p_patch->>'dohan_auto_hon')::boolean;
    v_before := v_before || jsonb_build_object('dohan_auto_hon', v_store.dohan_auto_hon);
    v_after  := v_after  || jsonb_build_object('dohan_auto_hon', v_dohan);
  end if;

  -- ── settings_json 側 ───────────────────────────────────
  if p_patch ? 'store_code' then
    if jsonb_typeof(p_patch->'store_code') <> 'string' then raise exception 'bad type'; end if;
    v_code := trim(p_patch->>'store_code');
    if length(v_code) > 20 then raise exception 'bad store_code'; end if;
    v_before   := v_before || jsonb_build_object('store_code', coalesce(v_settings->>'store_code', ''));
    v_after    := v_after  || jsonb_build_object('store_code', v_code);
    v_settings := jsonb_set(v_settings, '{store_code}', to_jsonb(v_code), true);
  end if;

  if p_patch ? 'display_name' then
    if jsonb_typeof(p_patch->'display_name') <> 'string' then raise exception 'bad type'; end if;
    v_disp := trim(p_patch->>'display_name');
    if length(v_disp) > 50 then raise exception 'bad display_name'; end if;
    v_before   := v_before || jsonb_build_object('display_name', coalesce(v_settings->>'display_name', ''));
    v_after    := v_after  || jsonb_build_object('display_name', v_disp);
    v_settings := jsonb_set(v_settings, '{display_name}', to_jsonb(v_disp), true);
  end if;

  if p_patch ? 'show_open_status' then
    if jsonb_typeof(p_patch->'show_open_status') <> 'boolean' then raise exception 'bad type'; end if;
    v_open := (p_patch->>'show_open_status')::boolean;
    v_before   := v_before || jsonb_build_object('show_open_status',
                    coalesce(v_settings->>'show_open_status', '') = 'true');
    v_after    := v_after  || jsonb_build_object('show_open_status', v_open);
    v_settings := jsonb_set(v_settings, '{show_open_status}', to_jsonb(v_open), true);
  end if;

  if p_patch ? 'shift_cast_confirm' then
    if jsonb_typeof(p_patch->'shift_cast_confirm') <> 'boolean' then raise exception 'bad type'; end if;
    v_confirm := (p_patch->>'shift_cast_confirm')::boolean;
    v_before   := v_before || jsonb_build_object('shift_cast_confirm',
                    coalesce(v_settings->>'shift_cast_confirm', '') = 'true');
    v_after    := v_after  || jsonb_build_object('shift_cast_confirm', v_confirm);
    v_settings := jsonb_set(v_settings, '{shift_cast_confirm}', to_jsonb(v_confirm), true);
  end if;

  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────
  if p_patch ? 'biz_type' then                                                                             -- ★2 0147
    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）
    v_biz := p_patch->>'biz_type';                                                                         -- ★2
    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）
    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2
    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2
    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2
  end if;                                                                                                  -- ★2

  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147
    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）
    v_bill := p_patch->>'billing_mode';                                                                    -- ★3
    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）
    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3
    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3
    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3
  end if;                                                                                                  -- ★3

  if p_patch ? 'setup_done' then                                                                               -- ★4 0147: setup_done（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'setup_done') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_setup_done := (p_patch->>'setup_done')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('setup_done',                                                  -- ★4
                    coalesce(v_settings->>'setup_done', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('setup_done', v_setup_done);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{setup_done}', to_jsonb(v_setup_done), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_hourly' then                                                                               -- ★4 0147: sys_hourly（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_hourly') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_hourly := (p_patch->>'sys_hourly')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_hourly',                                                  -- ★4
                    coalesce(v_settings->>'sys_hourly', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_hourly', v_s_hourly);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_hourly}', to_jsonb(v_s_hourly), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_backs' then                                                                               -- ★4 0147: sys_backs（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_backs') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_backs := (p_patch->>'sys_backs')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_backs',                                                  -- ★4
                    coalesce(v_settings->>'sys_backs', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_backs', v_s_backs);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_backs}', to_jsonb(v_s_backs), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_rate' then                                                                               -- ★4 0147: sys_sales_rate（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_rate') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_rate := (p_patch->>'sys_sales_rate')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_rate',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_rate', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_rate', v_s_sales_rate);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_rate}', to_jsonb(v_s_sales_rate), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_points' then                                                                               -- ★4 0147: sys_points（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_points') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_points := (p_patch->>'sys_points')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_points',                                                  -- ★4
                    coalesce(v_settings->>'sys_points', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_points', v_s_points);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_points}', to_jsonb(v_s_points), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_slide' then                                                                               -- ★4 0147: sys_sales_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_slide := (p_patch->>'sys_sales_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_slide', v_s_sales_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_slide}', to_jsonb(v_s_sales_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_point_slide' then                                                                               -- ★4 0147: sys_point_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_point_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_point_slide := (p_patch->>'sys_point_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_point_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_point_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_point_slide', v_s_point_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_norms' then                                                                               -- ★4 0147: sys_norms（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_norms') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_norms := (p_patch->>'sys_norms')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_norms',                                                  -- ★4
                    coalesce(v_settings->>'sys_norms', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_norms', v_s_norms);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_norms}', to_jsonb(v_s_norms), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_penalties' then                                                                               -- ★4 0147: sys_penalties（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_penalties') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_penalties := (p_patch->>'sys_penalties')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_penalties',                                                  -- ★4
                    coalesce(v_settings->>'sys_penalties', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_penalties', v_s_penalties);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_penalties}', to_jsonb(v_s_penalties), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_bonus' then                                                                               -- ★4 0147: sys_bonus（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_bonus') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_bonus := (p_patch->>'sys_bonus')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_bonus',                                                  -- ★4
                    coalesce(v_settings->>'sys_bonus', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_bonus', v_s_bonus);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_bonus}', to_jsonb(v_s_bonus), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'slide_apply' then                                                                          -- ★4 0151（裁定287-4）: biz_type ブロックと同型
    if jsonb_typeof(p_patch->'slide_apply') <> 'string' then raise exception 'bad type'; end if;           -- ★4
    v_slide := p_patch->>'slide_apply';                                                                    -- ★4
    if v_slide is null or v_slide not in ('next','current') then raise exception 'bad slide_apply'; end if; -- ★4（'bad biz_type' と同型）
    v_before   := v_before || jsonb_build_object('slide_apply', coalesce(v_settings->>'slide_apply', ''));  -- ★4
    v_after    := v_after  || jsonb_build_object('slide_apply', v_slide);                                  -- ★4
    v_settings := jsonb_set(v_settings, '{slide_apply}', to_jsonb(v_slide), true);                         -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'settlement_presets' then                                                                   -- ★7 0154（裁定294-7）: 配列・最大 10・要素 {code,name,amount,basis,target}
    v_presets := p_patch->'settlement_presets';                                                            -- ★7
    if jsonb_typeof(v_presets) <> 'array' or jsonb_array_length(v_presets) > 10 then raise exception 'bad type'; end if;   -- ★7
    for v_pe in select e from jsonb_array_elements(v_presets) e loop                                       -- ★7
      if jsonb_typeof(v_pe) <> 'object'                                                                    -- ★7
         or coalesce(jsonb_typeof(v_pe->'code'), '') <> 'string' or length(trim(v_pe->>'code')) = 0       -- ★7: 欠損（null）も拒否
         or coalesce(jsonb_typeof(v_pe->'name'), '') <> 'string'                                           -- ★7
         or coalesce(jsonb_typeof(v_pe->'amount'), '') <> 'number'                                         -- ★7
         or (v_pe->>'amount')::numeric < 0 or (v_pe->>'amount')::numeric <> trunc((v_pe->>'amount')::numeric)   -- ★7: 整数 ≥0
         or coalesce(jsonb_typeof(v_pe->'basis'), '') <> 'string'                                          -- ★7
         or coalesce(jsonb_typeof(v_pe->'target'), '') <> 'string'                                         -- ★7
         or (v_pe->>'target') not in ('late','absent','early','other') then                                -- ★7
        raise exception 'bad type';                                                                        -- ★7
      end if;                                                                                              -- ★7
    end loop;                                                                                              -- ★7
    v_before   := v_before || jsonb_build_object('settlement_presets', coalesce(v_settings->'settlement_presets', '[]'::jsonb));   -- ★7
    v_after    := v_after  || jsonb_build_object('settlement_presets', v_presets);                         -- ★7
    v_settings := jsonb_set(v_settings, '{settlement_presets}', v_presets, true);                          -- ★7
  end if;                                                                                                  -- ★7

  if p_patch ? 'customer_purpose' then                                                                     -- ★5 0153（裁定305-11／293-4）: display_name ブロックと同型
    if jsonb_typeof(p_patch->'customer_purpose') <> 'string' then raise exception 'bad type'; end if;      -- ★5
    v_purpose := trim(p_patch->>'customer_purpose');                                                       -- ★5
    if length(v_purpose) > 200 then raise exception 'bad customer_purpose'; end if;                        -- ★5
    v_before   := v_before || jsonb_build_object('customer_purpose', coalesce(v_settings->>'customer_purpose', ''));   -- ★5
    v_after    := v_after  || jsonb_build_object('customer_purpose', v_purpose);                           -- ★5
    v_settings := jsonb_set(v_settings, '{customer_purpose}', to_jsonb(v_purpose), true);                  -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'customer_retention_years' then                                                             -- ★5 0153（裁定305-11）: 整数 1〜10（settlement_presets の数値検査の型）
    if jsonb_typeof(p_patch->'customer_retention_years') <> 'number' then raise exception 'bad type'; end if;   -- ★5
    v_years := (p_patch->>'customer_retention_years')::numeric;                                            -- ★5
    if v_years < 1 or v_years > 10 or v_years <> trunc(v_years) then raise exception 'bad customer_retention_years'; end if;   -- ★5
    v_before   := v_before || jsonb_build_object('customer_retention_years', coalesce((v_settings->>'customer_retention_years')::int, 5));   -- ★5: 既定 5
    v_after    := v_after  || jsonb_build_object('customer_retention_years', v_years::int);                -- ★5
    v_settings := jsonb_set(v_settings, '{customer_retention_years}', to_jsonb(v_years::int), true);       -- ★5
  end if;                                                                                                  -- ★5

  if p_patch ? 'ar_enabled' then                                                                               -- ★4 0155（裁定309-1）: ar_enabled（show_open_status の 4 行型を写経・owner 限定は関数冒頭で担保）
    if jsonb_typeof(p_patch->'ar_enabled') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_ar := (p_patch->>'ar_enabled')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('ar_enabled',                                                  -- ★4
                    coalesce(v_settings->>'ar_enabled', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('ar_enabled', v_ar);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{ar_enabled}', to_jsonb(v_ar), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'okuri_base_amount' then                                                                    -- ★4 0158（裁定317）: 整数 0〜99999（customer_retention_years の数値検査の型）
    if jsonb_typeof(p_patch->'okuri_base_amount') <> 'number' then raise exception 'bad type'; end if;       -- ★4 0158
    v_okb := (p_patch->>'okuri_base_amount')::numeric;                                                       -- ★4 0158
    if v_okb < 0 or v_okb > 99999 or v_okb <> trunc(v_okb) then raise exception 'bad okuri_base_amount'; end if;   -- ★4 0158
    v_before   := v_before || jsonb_build_object('okuri_base_amount', coalesce(nullif(trim(v_settings->>'okuri_base_amount'), '')::int, 0));   -- ★4 0158: 既定 0（未設定）
    v_after    := v_after  || jsonb_build_object('okuri_base_amount', v_okb::int);                           -- ★4 0158
    v_settings := jsonb_set(v_settings, '{okuri_base_amount}', to_jsonb(v_okb::int), true);                  -- ★4 0158
  end if;                                                                                                  -- ★4 0158

  -- ── ★2 0164: 列側 7 キー（裁定331 C 5 項目＋334 フロア機能） ──────────
  if p_patch ? 'invoice_registered_on' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'invoice_registered_on') = 'null' then v_inv_on := null;                       -- ★2 0164: null＝未登録／不明
    elsif jsonb_typeof(p_patch->'invoice_registered_on') <> 'string' or (p_patch->>'invoice_registered_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad type';   -- ★2 0164
    else v_inv_on := (p_patch->>'invoice_registered_on')::date; end if;                                      -- ★2 0164
    v_before := v_before || jsonb_build_object('invoice_registered_on', v_store.invoice_registered_on);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('invoice_registered_on', v_inv_on);                           -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'pay_day' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'pay_day') <> 'number' then raise exception 'bad type'; end if;                 -- ★2 0164
    v_pay_day := (p_patch->>'pay_day')::numeric;                                                             -- ★2 0164
    if v_pay_day < 1 or v_pay_day > 31 or v_pay_day <> trunc(v_pay_day) then raise exception 'bad pay_day'; end if;   -- ★2 0164
    v_before := v_before || jsonb_build_object('pay_day', v_store.pay_day);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('pay_day', v_pay_day::int);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'tax_inclusive_display' then                                                                -- ★2 0164
    if jsonb_typeof(p_patch->'tax_inclusive_display') <> 'boolean' then raise exception 'bad type'; end if;  -- ★2 0164
    v_tax_inc := (p_patch->>'tax_inclusive_display')::boolean;                                               -- ★2 0164
    v_before := v_before || jsonb_build_object('tax_inclusive_display', v_store.tax_inclusive_display);      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('tax_inclusive_display', v_tax_inc);                          -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_vip' then                                                                              -- ★2 0164
    if jsonb_typeof(p_patch->'use_vip') <> 'boolean' then raise exception 'bad type'; end if;                -- ★2 0164
    v_use_vip := (p_patch->>'use_vip')::boolean;                                                             -- ★2 0164
    v_before := v_before || jsonb_build_object('use_vip', v_store.use_vip);                                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_vip', v_use_vip);                                        -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'use_counter' then                                                                          -- ★2 0164
    if jsonb_typeof(p_patch->'use_counter') <> 'boolean' then raise exception 'bad type'; end if;            -- ★2 0164
    v_use_ctr := (p_patch->>'use_counter')::boolean;                                                         -- ★2 0164
    v_before := v_before || jsonb_build_object('use_counter', v_store.use_counter);                          -- ★2 0164
    v_after  := v_after  || jsonb_build_object('use_counter', v_use_ctr);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'payment_methods' then                                                                      -- ★2 0164
    v_paym := p_patch->'payment_methods';                                                                    -- ★2 0164
    if jsonb_typeof(v_paym) <> 'object' then raise exception 'bad type'; end if;                             -- ★2 0164
    for v_jk in select jsonb_object_keys(v_paym) loop                                                        -- ★2 0164
      if v_jk not in ('cash','card','emoney','qr') or jsonb_typeof(v_paym->v_jk) <> 'boolean' then raise exception 'bad payment_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    if coalesce((v_paym->>'cash')::boolean, true) <> true then raise exception 'bad payment_methods'; end if;   -- ★2 0164: 現金は常に使う
    v_paym := v_store.payment_methods || v_paym;                                                             -- ★2 0164: 無いキーは現値のまま
    v_before := v_before || jsonb_build_object('payment_methods', v_store.payment_methods);                  -- ★2 0164
    v_after  := v_after  || jsonb_build_object('payment_methods', v_paym);                                   -- ★2 0164
  end if;                                                                                                  -- ★2 0164
  if p_patch ? 'punch_methods' then                                                                        -- ★2 0164
    v_punch := p_patch->'punch_methods';                                                                     -- ★2 0164
    if jsonb_typeof(v_punch) <> 'object' then raise exception 'bad type'; end if;                            -- ★2 0164
    for v_jk in select jsonb_object_keys(v_punch) loop                                                       -- ★2 0164
      if v_jk not in ('self','proxy','kiosk') or jsonb_typeof(v_punch->v_jk) <> 'boolean' then raise exception 'bad punch_methods'; end if;   -- ★2 0164
    end loop;                                                                                                -- ★2 0164
    v_punch := v_store.punch_methods || v_punch;                                                             -- ★2 0164: 無いキーは現値のまま
    if not (coalesce((v_punch->>'self')::boolean, false) or coalesce((v_punch->>'proxy')::boolean, false) or coalesce((v_punch->>'kiosk')::boolean, false)) then raise exception 'bad punch_methods'; end if;   -- ★2 0164: 1 つ以上
    v_before := v_before || jsonb_build_object('punch_methods', v_store.punch_methods);                      -- ★2 0164
    v_after  := v_after  || jsonb_build_object('punch_methods', v_punch);                                    -- ★2 0164
  end if;                                                                                                  -- ★2 0164

  -- ★3 0172（裁定349）: 精算方式＝monthly／half／weekly／daily（源泉の暦日数＝lib/nox/pay.ts periodDays が読む・既定 monthly＝欠損時）
  if p_patch ? 'settlement_cycle' then                                                                     -- ★3 0172
    if jsonb_typeof(p_patch->'settlement_cycle') <> 'string' then raise exception 'bad type'; end if;      -- ★3 0172
    v_cycle := p_patch->>'settlement_cycle';                                                               -- ★3 0172
    if v_cycle is null or v_cycle not in ('monthly','half','weekly','daily') then raise exception 'bad settlement_cycle'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('settlement_cycle', coalesce(v_settings->>'settlement_cycle', ''));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('settlement_cycle', v_cycle);                             -- ★3 0172
    v_settings := jsonb_set(v_settings, '{settlement_cycle}', to_jsonb(v_cycle), true);                    -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定349）: 途中払い＝none／advance（advance＝前払・仮払の口を出す・既定 none）
  if p_patch ? 'mid_pay' then                                                                              -- ★3 0172
    if jsonb_typeof(p_patch->'mid_pay') <> 'string' then raise exception 'bad type'; end if;               -- ★3 0172
    v_midpay := p_patch->>'mid_pay';                                                                       -- ★3 0172
    if v_midpay is null or v_midpay not in ('none','advance') then raise exception 'bad mid_pay'; end if;  -- ★3 0172
    v_before   := v_before || jsonb_build_object('mid_pay', coalesce(v_settings->>'mid_pay', ''));         -- ★3 0172
    v_after    := v_after  || jsonb_build_object('mid_pay', v_midpay);                                     -- ★3 0172
    v_settings := jsonb_set(v_settings, '{mid_pay}', to_jsonb(v_midpay), true);                            -- ★3 0172
  end if;                                                                                                  -- ★3 0172
  -- ★3 0172（裁定380）: 送り返しの自動確定時間＝整数 0〜168（0＝自動確定しない・既定 0＝欠損時）。実行器（cron／RPC）は別起票＝ここは設定の器だけ
  if p_patch ? 'shift_auto_confirm_hours' then                                                             -- ★3 0172
    if jsonb_typeof(p_patch->'shift_auto_confirm_hours') <> 'number' then raise exception 'bad type'; end if;   -- ★3 0172
    v_autoh := (p_patch->>'shift_auto_confirm_hours')::numeric;                                            -- ★3 0172
    if v_autoh <> floor(v_autoh) or v_autoh < 0 or v_autoh > 168 then raise exception 'bad shift_auto_confirm_hours'; end if;   -- ★3 0172
    v_before   := v_before || jsonb_build_object('shift_auto_confirm_hours', coalesce((v_settings->>'shift_auto_confirm_hours')::numeric, 0));   -- ★3 0172
    v_after    := v_after  || jsonb_build_object('shift_auto_confirm_hours', v_autoh::int);                -- ★3 0172
    v_settings := jsonb_set(v_settings, '{shift_auto_confirm_hours}', to_jsonb(v_autoh::int), true);       -- ★3 0172
  end if;                                                                                                  -- ★3 0172

  -- ★2 0173（裁定386）: 途中合流＝join_set（セット終了後の＋は合流セット行・既定）／extend_only（延長のみ）
  if p_patch ? 'join_mode' then                                                                            -- ★2 0173
    if jsonb_typeof(p_patch->'join_mode') <> 'string' then raise exception 'bad type'; end if;             -- ★2 0173
    v_join := p_patch->>'join_mode';                                                                       -- ★2 0173
    if v_join is null or v_join not in ('join_set','extend_only') then raise exception 'bad join_mode'; end if;   -- ★2 0173
    v_before   := v_before || jsonb_build_object('join_mode', coalesce(v_settings->>'join_mode', ''));     -- ★2 0173
    v_after    := v_after  || jsonb_build_object('join_mode', v_join);                                     -- ★2 0173
    v_settings := jsonb_set(v_settings, '{join_mode}', to_jsonb(v_join), true);                            -- ★2 0173
  end if;                                                                                                  -- ★2 0173
  -- ★3 0173（裁定389）: キャストのレジ端末＝store_device（店端末のみ＝kiosk_devices purpose 'register' の登録を流用・既定）／own_phone（自分のスマホからも）。cast_register_enabled（set_store_cast_register）が ON のときだけ効く
  if p_patch ? 'cast_register_device' then                                                                 -- ★3 0173
    if jsonb_typeof(p_patch->'cast_register_device') <> 'string' then raise exception 'bad type'; end if;  -- ★3 0173
    v_crdev := p_patch->>'cast_register_device';                                                           -- ★3 0173
    if v_crdev is null or v_crdev not in ('store_device','own_phone') then raise exception 'bad cast_register_device'; end if;   -- ★3 0173
    v_before   := v_before || jsonb_build_object('cast_register_device', coalesce(v_settings->>'cast_register_device', ''));   -- ★3 0173
    v_after    := v_after  || jsonb_build_object('cast_register_device', v_crdev);                         -- ★3 0173
    v_settings := jsonb_set(v_settings, '{cast_register_device}', to_jsonb(v_crdev), true);                -- ★3 0173
  end if;                                                                                                  -- ★3 0173
  -- ★6 0173（裁定393）: 支払方法別の手数料率＝object {card, emoney, other}（整数 0〜100・cash／ar は持たない・欠損キー＝0＝手数料なし。UI の新規店の初期値がカード 10）
  if p_patch ? 'pay_fee_rates' then                                                                        -- ★6 0173
    if jsonb_typeof(p_patch->'pay_fee_rates') <> 'object' then raise exception 'bad type'; end if;         -- ★6 0173
    v_pfr := p_patch->'pay_fee_rates';                                                                     -- ★6 0173
    for v_pfk in select jsonb_object_keys(v_pfr) loop                                                      -- ★6 0173
      if v_pfk not in ('card','emoney','other') then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      if jsonb_typeof(v_pfr->v_pfk) <> 'number' then raise exception 'bad pay_fee_rates'; end if;          -- ★6 0173
      v_pfv := (v_pfr->>v_pfk)::numeric;                                                                   -- ★6 0173
      if v_pfv <> floor(v_pfv) or v_pfv < 0 or v_pfv > 100 then raise exception 'bad pay_fee_rates'; end if;   -- ★6 0173
    end loop;                                                                                              -- ★6 0173
    v_before   := v_before || jsonb_build_object('pay_fee_rates', coalesce(v_settings->'pay_fee_rates', '{}'::jsonb));   -- ★6 0173
    v_after    := v_after  || jsonb_build_object('pay_fee_rates', v_pfr);                                  -- ★6 0173
    v_settings := jsonb_set(v_settings, '{pay_fee_rates}', v_pfr, true);                                   -- ★6 0173
  end if;                                                                                                  -- ★6 0173
  -- ★7 0173（裁定396）: 体入の保証日数＝整数 1〜90（既定 3＝欠損時・「体入を追加」の期限付き保証の日数）
  if p_patch ? 'trial_guarantee_days' then                                                                 -- ★7 0173
    if jsonb_typeof(p_patch->'trial_guarantee_days') <> 'number' then raise exception 'bad type'; end if;  -- ★7 0173
    v_tgd := (p_patch->>'trial_guarantee_days')::numeric;                                                  -- ★7 0173
    if v_tgd <> floor(v_tgd) or v_tgd < 1 or v_tgd > 90 then raise exception 'bad trial_guarantee_days'; end if;   -- ★7 0173
    v_before   := v_before || jsonb_build_object('trial_guarantee_days', coalesce((v_settings->>'trial_guarantee_days')::numeric, 3));   -- ★7 0173
    v_after    := v_after  || jsonb_build_object('trial_guarantee_days', v_tgd::int);                      -- ★7 0173
    v_settings := jsonb_set(v_settings, '{trial_guarantee_days}', to_jsonb(v_tgd::int), true);             -- ★7 0173
  end if;                                                                                                  -- ★7 0173
  -- ★7 0173（裁定396）: 本採用（体入→在籍）時の既定プラン＝自店の有効な comp_plans.id（null＝未設定＝UI は切替しない）
  if p_patch ? 'default_plan_id' then                                                                      -- ★7 0173
    if jsonb_typeof(p_patch->'default_plan_id') = 'null' then                                              -- ★7 0173
      v_dpid := null;                                                                                      -- ★7 0173
    else                                                                                                   -- ★7 0173
      if jsonb_typeof(p_patch->'default_plan_id') <> 'string' then raise exception 'bad type'; end if;     -- ★7 0173
      begin v_dpid := (p_patch->>'default_plan_id')::uuid; exception when others then raise exception 'bad default_plan_id'; end;   -- ★7 0173
      if not exists (select 1 from public.comp_plans c where c.id = v_dpid and c.store_id = p_store_id and c.org_id = v_org and c.is_active) then   -- ★7 0173
        raise exception 'bad default_plan_id';                                                             -- ★7 0173
      end if;                                                                                              -- ★7 0173
    end if;                                                                                                -- ★7 0173
    v_before   := v_before || jsonb_build_object('default_plan_id', v_settings->'default_plan_id');        -- ★7 0173
    v_after    := v_after  || jsonb_build_object('default_plan_id', v_dpid);                               -- ★7 0173
    v_settings := jsonb_set(v_settings, '{default_plan_id}', coalesce(to_jsonb(v_dpid), 'null'::jsonb), true);   -- ★7 0173
  end if;                                                                                                  -- ★7 0173

  -- ★3 0175（X13-I ②・便 SH-UI-a A-1）: 就業規則に減給の定めがある（雇用のノルマ未達の懲戒減給の提案を出す）＝boolean・既定 false＝欠損時
  if p_patch ? 'sys_wage_cut_rule' then
    if jsonb_typeof(p_patch->'sys_wage_cut_rule') <> 'boolean' then raise exception 'bad type'; end if;
    v_wcr := (p_patch->>'sys_wage_cut_rule')::boolean;
    v_before   := v_before || jsonb_build_object('sys_wage_cut_rule', coalesce((v_settings->>'sys_wage_cut_rule')::boolean, false));
    v_after    := v_after  || jsonb_build_object('sys_wage_cut_rule', v_wcr);
    v_settings := jsonb_set(v_settings, '{sys_wage_cut_rule}', to_jsonb(v_wcr), true);
  end if;
  -- ★3 0175（裁定404）: 達成ボーナス多段の計算＝max（到達した最上段のみ・既定＝欠損時）／sum（到達した全段の合計）
  if p_patch ? 'bonus_tier_mode' then
    if jsonb_typeof(p_patch->'bonus_tier_mode') <> 'string' then raise exception 'bad type'; end if;
    v_btm := p_patch->>'bonus_tier_mode';
    if v_btm is null or v_btm not in ('max','sum') then raise exception 'bad bonus_tier_mode'; end if;
    v_before   := v_before || jsonb_build_object('bonus_tier_mode', coalesce(v_settings->>'bonus_tier_mode', 'max'));
    v_after    := v_after  || jsonb_build_object('bonus_tier_mode', v_btm);
    v_settings := jsonb_set(v_settings, '{bonus_tier_mode}', to_jsonb(v_btm), true);
  end if;
  -- ★3 0175（裁定409）: 複数指名の卓の売上の分け方＝prorate（伝票ごとの分配率・既定＝欠損時）／equal（指名した全員で等分＝cast_sales_aggregate が ratio_weight>0 を 1 と読む）
  if p_patch ? 'sales_split' then
    if jsonb_typeof(p_patch->'sales_split') <> 'string' then raise exception 'bad type'; end if;
    v_split := p_patch->>'sales_split';
    if v_split is null or v_split not in ('prorate','equal') then raise exception 'bad sales_split'; end if;
    v_before   := v_before || jsonb_build_object('sales_split', coalesce(v_settings->>'sales_split', 'prorate'));
    v_after    := v_after  || jsonb_build_object('sales_split', v_split);
    v_settings := jsonb_set(v_settings, '{sales_split}', to_jsonb(v_split), true);
  end if;
  -- ★3 0175（裁定405）: 店の既定 pt 付与ルール（新規プランがコピーする）＝object（pt_rules_check と同じ形）
  if p_patch ? 'pt_rules_default' then
    if jsonb_typeof(p_patch->'pt_rules_default') <> 'object' then raise exception 'bad type'; end if;
    v_ptr := p_patch->'pt_rules_default';
    perform public.pt_rules_check(v_ptr);
    v_before   := v_before || jsonb_build_object('pt_rules_default', coalesce(v_settings->'pt_rules_default', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pt_rules_default', v_ptr);
    v_settings := jsonb_set(v_settings, '{pt_rules_default}', v_ptr, true);
  end if;

  -- ★8 0175（398 打刻設定＝BZ-R）: 列側 8 キー。判定は TS（route /api/punch/self）・DB は値の形だけ見る（BANZEN と同じ）
  if p_patch ? 'punch_enforce' then
    if jsonb_typeof(p_patch->'punch_enforce') <> 'boolean' then raise exception 'bad type'; end if;
    v_penf := (p_patch->>'punch_enforce')::boolean;
    v_before := v_before || jsonb_build_object('punch_enforce', v_store.punch_enforce);
    v_after  := v_after  || jsonb_build_object('punch_enforce', v_penf);
  end if;
  if p_patch ? 'punch_restrict_mode' then
    if jsonb_typeof(p_patch->'punch_restrict_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmode := p_patch->>'punch_restrict_mode';
    if v_pmode is null or v_pmode not in ('gps','ip','either','both','tablet') then raise exception 'bad punch_restrict_mode'; end if;
    v_before := v_before || jsonb_build_object('punch_restrict_mode', v_store.punch_restrict_mode);
    v_after  := v_after  || jsonb_build_object('punch_restrict_mode', v_pmode);
  end if;
  if p_patch ? 'punch_lat' then
    if jsonb_typeof(p_patch->'punch_lat') not in ('number','null') then raise exception 'bad type'; end if;
    v_plat := (p_patch->>'punch_lat')::double precision;
    if v_plat is not null and (v_plat < -90 or v_plat > 90) then raise exception 'bad punch_lat'; end if;
    v_before := v_before || jsonb_build_object('punch_lat', v_store.punch_lat);
    v_after  := v_after  || jsonb_build_object('punch_lat', v_plat);
  end if;
  if p_patch ? 'punch_lng' then
    if jsonb_typeof(p_patch->'punch_lng') not in ('number','null') then raise exception 'bad type'; end if;
    v_plng := (p_patch->>'punch_lng')::double precision;
    if v_plng is not null and (v_plng < -180 or v_plng > 180) then raise exception 'bad punch_lng'; end if;
    v_before := v_before || jsonb_build_object('punch_lng', v_store.punch_lng);
    v_after  := v_after  || jsonb_build_object('punch_lng', v_plng);
  end if;
  if p_patch ? 'punch_radius_m' then
    if jsonb_typeof(p_patch->'punch_radius_m') not in ('number','null') then raise exception 'bad type'; end if;
    v_prad := (p_patch->>'punch_radius_m')::numeric;
    if v_prad is not null and (v_prad <> floor(v_prad) or v_prad < 10 or v_prad > 100000) then raise exception 'bad punch_radius_m'; end if;
    v_before := v_before || jsonb_build_object('punch_radius_m', v_store.punch_radius_m);
    v_after  := v_after  || jsonb_build_object('punch_radius_m', v_prad::int);
  end if;
  if p_patch ? 'punch_require_shift' then
    if jsonb_typeof(p_patch->'punch_require_shift') <> 'string' then raise exception 'bad type'; end if;
    v_preq := p_patch->>'punch_require_shift';
    if v_preq is null or v_preq not in ('off','warn','block') then raise exception 'bad punch_require_shift'; end if;
    v_before := v_before || jsonb_build_object('punch_require_shift', v_store.punch_require_shift);
    v_after  := v_after  || jsonb_build_object('punch_require_shift', v_preq);
  end if;
  -- ★8 0175（398）: 勤務時間の丸め＝単位 1／5／10／15／30 と方向。単位を 1 より大きくする・方向を変える＝同意版（punch_round_consent_version）必須→punch_round_consents に 1 行（append-only）
  if p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then
    v_prunit := coalesce((p_patch->>'punch_round_unit')::numeric, v_store.punch_round_unit);
    v_prmode := coalesce(p_patch->>'punch_round_mode', v_store.punch_round_mode);
    if p_patch ? 'punch_round_unit' and jsonb_typeof(p_patch->'punch_round_unit') <> 'number' then raise exception 'bad type'; end if;
    if p_patch ? 'punch_round_mode' and jsonb_typeof(p_patch->'punch_round_mode') <> 'string' then raise exception 'bad type'; end if;
    if v_prunit is null or v_prunit not in (1,5,10,15,30) then raise exception 'bad punch_round_unit'; end if;
    if v_prmode is null or v_prmode not in ('staff_favor','store_favor','nearest') then raise exception 'bad punch_round_mode'; end if;
    if v_prunit::int <> v_store.punch_round_unit or v_prmode <> v_store.punch_round_mode then
      v_pcv := nullif(trim(coalesce(p_patch->>'punch_round_consent_version', '')), '');
      if v_prunit > 1 and v_pcv is null then raise exception 'consent required'; end if;
      select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
      insert into public.punch_round_consents (org_id, store_id, changed_by, old_unit, old_mode, new_unit, new_mode, consent_version)
      values (v_org, p_store_id, v_actor, v_store.punch_round_unit, v_store.punch_round_mode, v_prunit::int, v_prmode, v_pcv);
      v_before := v_before || jsonb_build_object('punch_round_unit', v_store.punch_round_unit, 'punch_round_mode', v_store.punch_round_mode);
      v_after  := v_after  || jsonb_build_object('punch_round_unit', v_prunit::int, 'punch_round_mode', v_prmode, 'punch_round_consent_version', v_pcv);
    end if;
  end if;
  -- ★8 0175（398）: ハード×位置を使う方法は位置と半径が必須（BANZEN の保存検証を DB にも）。Wi-Fi の必須は UI（store_wifi_add は別 RPC）
  if coalesce(v_penf, v_store.punch_enforce) and coalesce(v_pmode, v_store.punch_restrict_mode) in ('gps','both')
     and (coalesce(v_plat, v_store.punch_lat) is null or coalesce(v_plng, v_store.punch_lng) is null or coalesce(v_prad, v_store.punch_radius_m) is null) then
    raise exception 'range required';
  end if;

  -- ★11 0175 v2（CN-R ②）: 卓種別のサービス率＝object {"VIP":35}（席種 卓／カウンター／VIP・0〜100 の整数・無い席種は service_rate）＝列側。checks への凍結は開卓時に席種で選ぶ（check_open＝P175）
  if p_patch ? 'service_rate_by_seat' then
    if jsonb_typeof(p_patch->'service_rate_by_seat') <> 'object' then raise exception 'bad type'; end if;
    v_srs := p_patch->'service_rate_by_seat';
    for v_jk in select jsonb_object_keys(v_srs) loop
      if v_jk not in ('卓','カウンター','VIP') or jsonb_typeof(v_srs->v_jk) <> 'number' then raise exception 'bad service_rate_by_seat'; end if;
      if (v_srs->>v_jk)::numeric < 0 or (v_srs->>v_jk)::numeric > 100 or (v_srs->>v_jk)::numeric <> floor((v_srs->>v_jk)::numeric) then raise exception 'bad service_rate_by_seat'; end if;
    end loop;
    v_before := v_before || jsonb_build_object('service_rate_by_seat', v_store.service_rate_by_seat);
    v_after  := v_after  || jsonb_build_object('service_rate_by_seat', v_srs);
  end if;
  -- ★11 0175 v2（CN-R ③）: 支払方法による割引＝object {cash, card, emoney, other}（%・0〜100・小数 1 桁・393 の pay_fee_rates の裏返し＝別キー）。check_pay が cash 等で割引行（fee_kind 'pay_discount'）を立てる
  if p_patch ? 'pay_discount_rates' then
    if jsonb_typeof(p_patch->'pay_discount_rates') <> 'object' then raise exception 'bad type'; end if;
    v_pdr := p_patch->'pay_discount_rates';
    for v_jk in select jsonb_object_keys(v_pdr) loop
      if v_jk not in ('cash','card','emoney','other') or jsonb_typeof(v_pdr->v_jk) <> 'number' then raise exception 'bad pay_discount_rates'; end if;
      if (v_pdr->>v_jk)::numeric < 0 or (v_pdr->>v_jk)::numeric > 100 or (v_pdr->>v_jk)::numeric <> round((v_pdr->>v_jk)::numeric, 1) then raise exception 'bad pay_discount_rates'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('pay_discount_rates', coalesce(v_settings->'pay_discount_rates', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('pay_discount_rates', v_pdr);
    v_settings := jsonb_set(v_settings, '{pay_discount_rates}', v_pdr, true);
  end if;
  -- ★11 0175 v2（CN-R ⑨）: ドリンクバック（本数）の店スイッチ＝既定 true。false＝設定項目・レジの「誰のドリンクか」を出さず、ドリンクは小計の一部として指名種別の率で返る
  if p_patch ? 'sys_drink_count_back' then
    if jsonb_typeof(p_patch->'sys_drink_count_back') <> 'boolean' then raise exception 'bad type'; end if;
    v_sdcb := (p_patch->>'sys_drink_count_back')::boolean;
    v_before   := v_before || jsonb_build_object('sys_drink_count_back', coalesce((v_settings->>'sys_drink_count_back')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sys_drink_count_back', v_sdcb);
    v_settings := jsonb_set(v_settings, '{sys_drink_count_back}', to_jsonb(v_sdcb), true);
  end if;
  -- ★11 0175 v2（CN-R ⑩）: 「売上小計」の範囲＝due（今＝サ料込・丸め後・手数料除く）／pre_tax_service（税サ前・割引前・セット含む）＋指名料を含む（既定 true）
  if p_patch ? 'sales_subtotal_mode' then
    if jsonb_typeof(p_patch->'sales_subtotal_mode') <> 'string' then raise exception 'bad type'; end if;
    v_ssm := p_patch->>'sales_subtotal_mode';
    if v_ssm is null or v_ssm not in ('due','pre_tax_service') then raise exception 'bad sales_subtotal_mode'; end if;
    v_before   := v_before || jsonb_build_object('sales_subtotal_mode', coalesce(v_settings->>'sales_subtotal_mode', 'due'));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_mode', v_ssm);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_mode}', to_jsonb(v_ssm), true);
  end if;
  if p_patch ? 'sales_subtotal_includes_shimei' then
    if jsonb_typeof(p_patch->'sales_subtotal_includes_shimei') <> 'boolean' then raise exception 'bad type'; end if;
    v_ssis := (p_patch->>'sales_subtotal_includes_shimei')::boolean;
    v_before   := v_before || jsonb_build_object('sales_subtotal_includes_shimei', coalesce((v_settings->>'sales_subtotal_includes_shimei')::boolean, true));
    v_after    := v_after  || jsonb_build_object('sales_subtotal_includes_shimei', v_ssis);
    v_settings := jsonb_set(v_settings, '{sales_subtotal_includes_shimei}', to_jsonb(v_ssis), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 週払い）: settlement_cycle 'weekly' のときの締日（曜日 0〜6）と支払日（締日から n 日後 0〜31）。monthly は pay_day（既存）
  if p_patch ? 'settlement_week_close_dow' then
    if jsonb_typeof(p_patch->'settlement_week_close_dow') <> 'number' then raise exception 'bad type'; end if;
    v_wcd := (p_patch->>'settlement_week_close_dow')::numeric;
    if v_wcd <> floor(v_wcd) or v_wcd < 0 or v_wcd > 6 then raise exception 'bad settlement_week_close_dow'; end if;
    v_before   := v_before || jsonb_build_object('settlement_week_close_dow', v_settings->'settlement_week_close_dow');
    v_after    := v_after  || jsonb_build_object('settlement_week_close_dow', v_wcd::int);
    v_settings := jsonb_set(v_settings, '{settlement_week_close_dow}', to_jsonb(v_wcd::int), true);
  end if;
  if p_patch ? 'settlement_pay_days_after' then
    if jsonb_typeof(p_patch->'settlement_pay_days_after') <> 'number' then raise exception 'bad type'; end if;
    v_pda := (p_patch->>'settlement_pay_days_after')::numeric;
    if v_pda <> floor(v_pda) or v_pda < 0 or v_pda > 31 then raise exception 'bad settlement_pay_days_after'; end if;
    v_before   := v_before || jsonb_build_object('settlement_pay_days_after', v_settings->'settlement_pay_days_after');
    v_after    := v_after  || jsonb_build_object('settlement_pay_days_after', v_pda::int);
    v_settings := jsonb_set(v_settings, '{settlement_pay_days_after}', to_jsonb(v_pda::int), true);
  end if;
  -- ★11 0175 v2（CN-R ⑳ 日払いの上限）: 勤務時間で上限が変わる表＝array [{hours_min, cap}]（hours_min 昇順・cap 円・最大 10 段・空＝上限なし）。daily_pay_issue が p_worked_hours で読む
  -- ★24 0175 v2（裁定421 候補）: スタッフの割引・手数料カット＝0 承認制（既定）／1 上限内は即時／2 不可。上限＝staff_discount_cap（円・整数 ≥0）
  if p_patch ? 'sys_staff_discount' then
    if jsonb_typeof(p_patch->'sys_staff_discount') <> 'number' then raise exception 'bad type'; end if;
    v_ssd := (p_patch->>'sys_staff_discount')::numeric;
    if v_ssd <> floor(v_ssd) or v_ssd < 0 or v_ssd > 2 then raise exception 'bad sys_staff_discount'; end if;
    v_before   := v_before || jsonb_build_object('sys_staff_discount', v_settings->'sys_staff_discount');
    v_after    := v_after  || jsonb_build_object('sys_staff_discount', v_ssd::int);
    v_settings := jsonb_set(v_settings, '{sys_staff_discount}', to_jsonb(v_ssd::int), true);
  end if;
  if p_patch ? 'staff_discount_cap' then
    if jsonb_typeof(p_patch->'staff_discount_cap') <> 'number' then raise exception 'bad type'; end if;
    v_sdc := (p_patch->>'staff_discount_cap')::numeric;
    if v_sdc <> floor(v_sdc) or v_sdc < 0 or v_sdc > 10000000 then raise exception 'bad staff_discount_cap'; end if;
    v_before   := v_before || jsonb_build_object('staff_discount_cap', v_settings->'staff_discount_cap');
    v_after    := v_after  || jsonb_build_object('staff_discount_cap', v_sdc::int);
    v_settings := jsonb_set(v_settings, '{staff_discount_cap}', to_jsonb(v_sdc::int), true);
  end if;
  -- ★25 0175 v2（裁定420）: キャストのレジ使用＝0 OFF／1 注文のみ／2 会計まで（旧 cast_register_enabled は互換で残す＝set_store_cast_register が両方を書く）
  if p_patch ? 'sys_cast_register' then
    if jsonb_typeof(p_patch->'sys_cast_register') <> 'number' then raise exception 'bad type'; end if;
    v_scr := (p_patch->>'sys_cast_register')::numeric;
    if v_scr <> floor(v_scr) or v_scr < 0 or v_scr > 2 then raise exception 'bad sys_cast_register'; end if;
    v_before   := v_before || jsonb_build_object('sys_cast_register', v_settings->'sys_cast_register', 'cast_register_enabled', v_settings->'cast_register_enabled');
    v_after    := v_after  || jsonb_build_object('sys_cast_register', v_scr::int, 'cast_register_enabled', (v_scr > 0));
    v_settings := jsonb_set(jsonb_set(v_settings, '{sys_cast_register}', to_jsonb(v_scr::int), true), '{cast_register_enabled}', to_jsonb(v_scr > 0), true);
  end if;
  -- ★27 0175 v2（裁定423 候補）: キオスクで使える機能＝{punch, register, shift}（boolean・無いキーは true）・無操作で自動ロックする秒数（60〜900・既定 180）
  if p_patch ? 'kiosk_features' then
    if jsonb_typeof(p_patch->'kiosk_features') <> 'object' then raise exception 'bad type'; end if;
    v_kf := p_patch->'kiosk_features';
    if exists (select 1 from jsonb_each(v_kf) e where e.key not in ('punch','register','shift') or jsonb_typeof(e.value) <> 'boolean') then raise exception 'bad kiosk_features'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_features', v_settings->'kiosk_features');
    v_after    := v_after  || jsonb_build_object('kiosk_features', v_kf);
    v_settings := jsonb_set(v_settings, '{kiosk_features}', v_kf, true);
  end if;
  if p_patch ? 'kiosk_idle_sec' then
    if jsonb_typeof(p_patch->'kiosk_idle_sec') <> 'number' then raise exception 'bad type'; end if;
    v_kis := (p_patch->>'kiosk_idle_sec')::numeric;
    if v_kis <> floor(v_kis) or v_kis < 60 or v_kis > 900 then raise exception 'bad kiosk_idle_sec'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_idle_sec', v_settings->'kiosk_idle_sec');
    v_after    := v_after  || jsonb_build_object('kiosk_idle_sec', v_kis::int);
    v_settings := jsonb_set(v_settings, '{kiosk_idle_sec}', to_jsonb(v_kis::int), true);
  end if;
  if p_patch ? 'daily_pay_cap_tiers' then
    if jsonb_typeof(p_patch->'daily_pay_cap_tiers') <> 'array' then raise exception 'bad type'; end if;
    v_dct := p_patch->'daily_pay_cap_tiers';
    if jsonb_array_length(v_dct) > 10 then raise exception 'bad daily_pay_cap_tiers'; end if;
    v_prevh := null;
    for v_pe in select * from jsonb_array_elements(v_dct) loop
      if jsonb_typeof(v_pe) <> 'object' or jsonb_typeof(v_pe->'hours_min') <> 'number' or jsonb_typeof(v_pe->'cap') <> 'number' then raise exception 'bad daily_pay_cap_tiers'; end if;
      if (v_pe->>'hours_min')::numeric < 0 or (v_pe->>'cap')::numeric < 0 or (v_pe->>'cap')::numeric <> floor((v_pe->>'cap')::numeric) then raise exception 'bad daily_pay_cap_tiers'; end if;
      if v_prevh is not null and (v_pe->>'hours_min')::numeric <= v_prevh then raise exception 'bad daily_pay_cap_tiers'; end if;
      v_prevh := (v_pe->>'hours_min')::numeric;
    end loop;
    v_before   := v_before || jsonb_build_object('daily_pay_cap_tiers', coalesce(v_settings->'daily_pay_cap_tiers', '[]'::jsonb));
    v_after    := v_after  || jsonb_build_object('daily_pay_cap_tiers', v_dct);
    v_settings := jsonb_set(v_settings, '{daily_pay_cap_tiers}', v_dct, true);
  end if;

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    invoice_registered_on = case when p_patch ? 'invoice_registered_on' then v_inv_on  else invoice_registered_on end,   -- ★2 0164
    pay_day            = case when p_patch ? 'pay_day'            then v_pay_day::int else pay_day end,                   -- ★2 0164
    tax_inclusive_display = case when p_patch ? 'tax_inclusive_display' then v_tax_inc else tax_inclusive_display end,   -- ★2 0164
    use_vip            = case when p_patch ? 'use_vip'            then v_use_vip else use_vip end,                        -- ★2 0164
    use_counter        = case when p_patch ? 'use_counter'        then v_use_ctr else use_counter end,                    -- ★2 0164
    payment_methods    = case when p_patch ? 'payment_methods'    then v_paym    else payment_methods end,                -- ★2 0164
    punch_methods      = case when p_patch ? 'punch_methods'      then v_punch   else punch_methods end,                  -- ★2 0164
    punch_enforce       = case when p_patch ? 'punch_enforce'       then v_penf  else punch_enforce end,                     -- ★8 0175（398）
    punch_restrict_mode = case when p_patch ? 'punch_restrict_mode' then v_pmode else punch_restrict_mode end,               -- ★8 0175
    punch_lat           = case when p_patch ? 'punch_lat'           then v_plat  else punch_lat end,                         -- ★8 0175
    punch_lng           = case when p_patch ? 'punch_lng'           then v_plng  else punch_lng end,                         -- ★8 0175
    punch_radius_m      = case when p_patch ? 'punch_radius_m'      then v_prad::int else punch_radius_m end,                -- ★8 0175
    punch_require_shift = case when p_patch ? 'punch_require_shift' then v_preq  else punch_require_shift end,               -- ★8 0175
    punch_round_unit    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prunit::smallint else punch_round_unit end,   -- ★8 0175
    punch_round_mode    = case when p_patch ? 'punch_round_unit' or p_patch ? 'punch_round_mode' then v_prmode else punch_round_mode end,   -- ★8 0175
    service_rate_by_seat = case when p_patch ? 'service_rate_by_seat' then v_srs else service_rate_by_seat end,                      -- ★11 0175 v2（CN-R ②）
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★3 set_comp_plan（21afb3f5）＝32 引数 ═══
CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer, p_dohan_back_mode text DEFAULT 'per_count'::text, p_dohan_back_rate integer DEFAULT NULL::integer, p_product_back_mode text DEFAULT 'product_rule'::text, p_product_back_rate integer DEFAULT NULL::integer, p_product_back_fixed integer DEFAULT NULL::integer, p_product_back_fixed_hon integer DEFAULT NULL::integer, p_product_back_fixed_jonai integer DEFAULT NULL::integer, p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text, p_slide_basis text DEFAULT 'sales'::text, p_slide_rank_ids uuid[] DEFAULT '{}'::uuid[], p_norm_days_target integer DEFAULT NULL::integer, p_norm_dohan_target integer DEFAULT NULL::integer, p_norm_sales_target integer DEFAULT NULL::integer, p_norm_shimei_target integer DEFAULT NULL::integer, p_slide_apply text DEFAULT NULL::text, p_slide_method text DEFAULT NULL::text, p_pt_rules jsonb DEFAULT NULL::jsonb)
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
       slide_method, pt_rules)  -- ★3 0175（裁定407／405）
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
       coalesce(p_pt_rules, (select coalesce(s.settings_json->'pt_rules_default', '{}'::jsonb) from public.stores s where s.id = p_store_id), '{}'::jsonb))   -- ★3 0175（裁定405）: 新規＝店の既定をコピー
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
          slide_method = coalesce(p_slide_method, slide_method), pt_rules = coalesce(p_pt_rules, pt_rules)   -- ★3 0175（裁定407／405）: null＝現値のまま
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text, text, jsonb) from public, anon;
grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text, text, uuid[], integer, integer, integer, integer, text, text, jsonb) to authenticated;

-- ═══ ★3 cast_sales_aggregate（34a0bf1e） ═══
CREATE OR REPLACE FUNCTION public.cast_sales_aggregate(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_split    text;   -- ★3 0175（裁定409）: 店設定 sales_split（prorate＝伝票の分配率・equal＝等分）
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限(四半期)
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_split := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'sales_split'), ''), 'prorate');   -- ★3 0175（裁定409）

  return query
  with target_checks as (
    -- SL6a: closed のみ(void/open 除外)。SL5a: biz_date=(JST(started_at)−cutoff)::date【2】
    select c.id as check_id,
           c.nom_type,
           (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date as bdate
    from public.checks c
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date between p_from and p_to
  ),
  noms as (
    -- SL4a: nomination の無い伝票(フリー卓)はここで自然に脱落=非帰属
    select n.check_id, n.cast_id as cid,
           case when v_split = 'equal' and n.ratio_weight > 0 then 1 else n.ratio_weight end as ratio_weight,   -- ★3 0175（裁定409）: equal＝分配率>0 の全員を 1 として等分（0＝分配なしは据え置き）
           n.position, n.nom_kind, n.is_dohan  -- ★0119
    from public.check_nominations n
    join target_checks tc on tc.check_id = n.check_id
    where n.org_id = v_org
  ),
  wsum as (
    select nm.check_id, sum(nm.ratio_weight)::bigint as w_total
    from noms nm group by nm.check_id
  ),
  groups as materialized (
    -- SL2a: 金額基盤=group due(check_group_due 再利用・サ料込・100円丸め後・カードTAX 非含)
    select tc.check_id, tc.bdate, l.pay_group,
           public.check_group_due(tc.check_id, l.pay_group, true) as due   -- ★6 0173（裁定393）: 手数料行を除外（キャストの売上・ノルマ・歩合・スライドに乗せない）
    from target_checks tc
    join (select distinct cl.check_id, cl.pay_group from public.check_lines cl where cl.org_id = v_org) l
      on l.check_id = tc.check_id
  ),
  alloc as (
    -- SL1a: weight 按分・整数演算のみ【1】 base=div(due×w, W)・rem=(due×w) mod W
    select g.check_id, g.bdate, g.pay_group, nm.cid,
           ((g.due::bigint * nm.ratio_weight) / ws.w_total)::int  as base_part,
           ((g.due::bigint * nm.ratio_weight) % ws.w_total)       as rem_part,
           nm.position,
           g.due
    from groups g
    join noms nm on nm.check_id = g.check_id
    join wsum ws on ws.check_id = g.check_id
    where g.due > 0 and ws.w_total > 0 -- 全 weight 0 は按分不能=按分なし(★0124: ended/全0 名簿を許容・w_total ガードが権威)
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.check_id, a.pay_group
                              order by a.rem_part desc, a.position asc) as rk,
           a.due - sum(a.base_part) over (partition by a.check_id, a.pay_group) as remainder_units
    from alloc a
  ),
  parts as (
    select r.cid, r.bdate,
           r.base_part + case when r.rk <= r.remainder_units then 1 else 0 end as part
    from ranked r
  ),
  sales_by_day as (
    select p.cid, p.bdate, sum(p.part)::int as sales_sum
    from parts p group by p.cid, p.bdate
  ),
  counts_by_day as (
    -- SL8a/D9a: 伝票単位カウント(distinct check)・★0119 裁定100: 種別は名簿行(キャスト別)・attendance 不参加
    --   0118 backfill により既存伝票は旧 checks.nom_type 由来と同値
    select nm.cid, tc.bdate,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'hon')::int   as hon_cnt,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'jonai')::int as jonai_cnt,
           count(distinct tc.check_id) filter (where nm.is_dohan)::int           as dohan_cnt
    from noms nm
    join target_checks tc on tc.check_id = nm.check_id
    group by nm.cid, tc.bdate
  )
  select coalesce(s.cid, k.cid),
         coalesce(s.bdate, k.bdate),
         coalesce(s.sales_sum, 0),
         coalesce(k.hon_cnt, 0),
         coalesce(k.jonai_cnt, 0),
         coalesce(k.dohan_cnt, 0)
  from sales_by_day s
  full outer join counts_by_day k on k.cid = s.cid and k.bdate = s.bdate
  order by 2, 1;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★4 payroll_adjustment_add（0feabfac）＝14 引数 ═══
CREATE OR REPLACE FUNCTION public.payroll_adjustment_add(p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text, p_source text DEFAULT 'manual'::text, p_basis text DEFAULT NULL::text, p_target_shift_id uuid DEFAULT NULL::uuid, p_kind text DEFAULT NULL::text, p_source_table text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_cast_st uuid;
  v_id      uuid;
  v_period  text;   -- ★6 0154: run の period（直近 3 期の境界）
  v_emp     text;   -- ★6 0154: casts.employment
  v_gross   bigint; -- ★6 0154: gross 合計（平均賃金の分子）→ 当期 gross
  v_days    int;    -- ★6 0154: 暦日数（平均賃金の分母）
  v_avg     int;    -- ★6 0154: 平均賃金（floor）
  v_sum     int;    -- ★6 0154: 当期の sanction 合計
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;
  if p_mode is null or p_mode not in ('fixed','rate') then
    raise exception 'bad mode';
  end if;
  if p_mode = 'fixed' and (p_amount is null or p_amount < 0 or p_rate_bp is not null) then
    raise exception 'bad amount';
  end if;
  if p_mode = 'rate' and (p_rate_bp is null or p_rate_bp < 0 or p_rate_bp > 10000 or p_amount is not null) then
    raise exception 'bad amount';
  end if;
  if p_source is null or p_source not in ('manual','settlement','sanction') then                       -- ★6 0154（裁定294-6）: carryover は payroll_carryover_sync 専用
    raise exception 'bad source';                                                                       -- ★6
  end if;                                                                                               -- ★6
  if p_source in ('settlement','sanction') and (p_basis is null or length(trim(p_basis)) not between 1 and 200) then   -- ★6: basis 必須
    raise exception 'basis required';                                                                   -- ★6
  end if;                                                                                               -- ★6
  if p_target_shift_id is not null and not exists (select 1 from public.shifts s where s.id = p_target_shift_id and s.cast_id = p_cast_id) then   -- ★6
    raise exception 'shift not found';                                                                  -- ★6
  end if;                                                                                               -- ★6
  -- ★4 0175（裁定410・X13-I I-3）: 種別＝late／absent／norm_shortfall／other（null＝未分類）・元記録の参照＝source_table（shifts／attendance／punches）＋source_id（target_shift_id は shifts 固定のまま残す）
  if p_kind is not null and p_kind not in ('late','absent','norm_shortfall','other') then raise exception 'bad kind'; end if;
  if p_source_table is not null and p_source_table not in ('shifts','attendance','punches') then raise exception 'bad source_table'; end if;
  if (p_source_table is null) <> (p_source_id is null) then raise exception 'bad source_ref'; end if;

  select store_id, status, period into v_store, v_status, v_period                                     -- ★6 0154: period を併読
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  select store_id, employment into v_cast_st, v_emp                                                    -- ★6 0154: employment を併読
    from casts where id = p_cast_id and org_id = v_org;
  if not found then
    raise exception 'cast not found';
  end if;
  if v_cast_st is distinct from v_store then
    raise exception 'cast store mismatch';
  end if;
  -- ★6 0154（裁定294-6）: settlement＝委託のみ・sanction＝雇用のみ＋労基法 91 条検査
  if p_source = 'settlement' and v_emp is distinct from '委託' then raise exception 'bad source for employment'; end if;   -- ★6
  if p_source = 'sanction' then                                                                         -- ★6
    if v_emp is distinct from '雇用' then raise exception 'bad source for employment'; end if;           -- ★6
    if p_mode <> 'fixed' then raise exception 'bad mode'; end if;                                       -- ★6: 1 件上限は額で比べる（要裁定(3)）
    -- ★6: 平均賃金＝直近 3 期（当期より前）の確定 payslip（finalized|paid）の gross 合計 ÷ 暦日数（calc_period_start／end・欠損は period_bounds）
    select coalesce(sum((ps.breakdown_json->'pay'->>'gross')::bigint), 0),                             -- ★6
           coalesce(sum(coalesce(ps.calc_period_end, pb.period_end) - coalesce(ps.calc_period_start, pb.period_start) + 1), 0)   -- ★6
      into v_gross, v_days                                                                              -- ★6
      from (select ps0.* from public.payslips ps0                                                       -- ★6
              join public.payroll_runs r0 on r0.id = ps0.run_id                                         -- ★6
             where ps0.cast_id = p_cast_id and r0.status in ('finalized','paid') and ps0.period < v_period   -- ★6
             order by ps0.period desc limit 3) ps,                                                      -- ★6
           lateral public.period_bounds(ps.period) pb;                                                  -- ★6
    if v_days = 0 then raise exception 'no basis for average wage'; end if;                             -- ★6（294-6）
    v_avg := floor(v_gross::numeric / v_days);                                                          -- ★6: 平均賃金（円未満切捨）
    if p_amount > v_avg / 2 then raise exception 'sanction cap'; end if;                                -- ★6: 1 件 ≦ floor(平均賃金/2)
    -- ★6: 当期 gross＝当 run の payslip（再確定前の凍結値）があればその pay.gross・無ければ平均賃金×当期暦日数（推計・要裁定(2)）
    select (ps.breakdown_json->'pay'->>'gross')::bigint into v_gross                                   -- ★6
      from public.payslips ps where ps.run_id = p_run_id and ps.cast_id = p_cast_id;                    -- ★6
    if v_gross is null then                                                                             -- ★6
      select v_avg::bigint * (coalesce(r.period_end, pb.period_end) - coalesce(r.period_start, pb.period_start) + 1) into v_gross   -- ★6
        from public.payroll_runs r, lateral public.period_bounds(r.period) pb where r.id = p_run_id;   -- ★6
    end if;                                                                                             -- ★6
    select coalesce(sum(a.amount), 0) into v_sum from public.payroll_adjustments a                      -- ★6
     where a.run_id = p_run_id and a.cast_id = p_cast_id and a.source = 'sanction';                     -- ★6
    if v_sum + p_amount > v_gross / 10 then raise exception 'sanction cap'; end if;                     -- ★6: 当期合計 ≦ floor(当期 gross/10)
  end if;                                                                                               -- ★6

  insert into payroll_adjustments(
    org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
    before_withholding, show_detail, reason, created_by,                                              -- ★6 0154: 末尾 ')' → ','
    source, basis, target_shift_id,                                                                   -- ★6 0154: 列 +3（0175 ★4: 末尾 ')' → ','）
    kind, source_table, source_id)                                                                    -- ★4 0175: 列 +3
  values (
    v_org, v_store, p_run_id, p_cast_id, p_mode,
    case when p_mode = 'fixed' then p_amount else null end,
    case when p_mode = 'rate'  then p_rate_bp else null end,
    coalesce(p_before_withholding, true),
    coalesce(p_show_detail, true),
    p_reason, v_actor,                                                                                 -- ★6 0154: 末尾 ')' → ','
    p_source, nullif(trim(p_basis), ''), p_target_shift_id,                                            -- ★6 0154（0175 ★4: 末尾 ')' → ','）
    p_kind, p_source_table, p_source_id)                                                               -- ★4 0175
  returning id into v_id;

  perform audit_log_write(
    'payroll_adjustment_add',
    'payroll_adjustments:' || v_id::text,
    null,
    jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id,
      'mode', p_mode, 'amount', p_amount, 'rate_bp', p_rate_bp,
      'before_withholding', coalesce(p_before_withholding, true),
      'show_detail', coalesce(p_show_detail, true),                                                   -- ★6 0154: 末尾 '),' → ','
      'source', p_source, 'basis', p_basis, 'target_shift_id', p_target_shift_id,                      -- ★6 0154（0175 ★4: 末尾 '),' → ','）
      'kind', p_kind, 'source_table', p_source_table, 'source_id', p_source_id),                        -- ★4 0175
    v_store,
    p_reason);

  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.payroll_adjustment_add(uuid, uuid, text, integer, integer, boolean, boolean, text, text, text, uuid, text, text, uuid) from public, anon;
grant execute on function public.payroll_adjustment_add(uuid, uuid, text, integer, integer, boolean, boolean, text, text, text, uuid, text, text, uuid) to authenticated;

-- ═══ ★4 payroll_adjustment_cancel（新設） ═══
CREATE OR REPLACE FUNCTION public.payroll_adjustment_cancel(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★4 0175（X13-I I-3）: 精算調整の取消＝行を消さず cancelled_at／cancelled_by／cancel_reason を書く（payroll_adjustment_delete＝行削除は残す・給与計算（collect.ts）は cancelled_at is null だけ読む＝P175）。
--   owner／自店 manager・run が draft のときだけ・二重取消は 'already cancelled'・audit（reason 付き）
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_actor  uuid;
  v_row    record;
  v_status text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason required'; end if;
  select * into v_row from public.payroll_adjustments a where a.id = p_id and a.org_id = v_org;
  if not found then raise exception 'adjustment not found'; end if;
  if v_role = 'manager' and v_row.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;
  if v_row.cancelled_at is not null then raise exception 'already cancelled'; end if;
  select status into v_status from public.payroll_runs where id = v_row.run_id;
  if v_status <> 'draft' then raise exception 'run not draft'; end if;
  update public.payroll_adjustments
     set cancelled_at = now(), cancelled_by = v_actor, cancel_reason = trim(p_reason)
   where id = p_id;
  perform public.audit_log_write('payroll_adjustment_cancel', 'payroll_adjustments:' || p_id::text,
    to_jsonb(v_row), (select to_jsonb(a) from public.payroll_adjustments a where a.id = p_id), v_row.store_id, p_reason);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.payroll_adjustment_cancel(uuid, text) from public, anon;
grant execute on function public.payroll_adjustment_cancel(uuid, text) to authenticated;

-- ═══ ★4 norm_shortfall_decide（新設・audit のみ） ═══
CREATE OR REPLACE FUNCTION public.norm_shortfall_decide(p_run_id uuid, p_cast_id uuid, p_action text, p_reason text DEFAULT NULL::text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★4 0175（X13-I I-5）: ノルマ未達の減額の提案に対する店の判断（apply＝適用／exclude＝除外・理由必須）を audit に 1 行残す（今は画面の中だけ＝記録なし）。
--   表は作らない（audit_logs が正）。apply のときの精算調整の行は payroll_adjustment_add（source 'settlement'・kind 'norm_shortfall'）＝client が続けて呼ぶ。
--   owner／自店 manager・run は自 org・cast は run の店。戻り＝audit_logs.id
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid;
  v_cast_store uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_action is null or p_action not in ('apply','exclude') then raise exception 'bad action'; end if;
  if p_action = 'exclude' and (p_reason is null or length(trim(p_reason)) not between 1 and 200) then raise exception 'reason required'; end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then raise exception 'bad detail'; end if;
  select store_id into v_store from public.payroll_runs where id = p_run_id and org_id = v_org;
  if not found then raise exception 'run not found'; end if;
  if v_role = 'manager' and v_store is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;
  select store_id into v_cast_store from public.casts where id = p_cast_id and org_id = v_org;
  if not found or v_cast_store is distinct from v_store then raise exception 'cast not found'; end if;
  return public.audit_log_write('norm_shortfall_decide', 'payroll_runs:' || p_run_id::text || '/casts:' || p_cast_id::text,
    null, jsonb_build_object('action', p_action, 'cast_id', p_cast_id, 'detail', p_detail), v_store, nullif(trim(coalesce(p_reason, '')), ''));
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.norm_shortfall_decide(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.norm_shortfall_decide(uuid, uuid, text, text, jsonb) to authenticated;

-- ═══ ★4 daily_pay_cancel（新設） ═══
CREATE OR REPLACE FUNCTION public.daily_pay_cancel(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★4 0175（X13-I ⑤）: 日払い（精算・前払）の取消＝行を消さず cancelled_at／cancelled_by／cancel_reason を書く（控除の集計（collect.ts）は cancelled_at is null だけ読む＝P175）。
--   owner／自店 manager・控除する期（settle_period）の run が paid なら 'paid period'・二重取消は 'already cancelled'・audit（reason 付き）
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_actor  uuid;
  v_row    record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason required'; end if;
  select * into v_row from public.daily_pays d where d.id = p_id and d.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'manager' and v_row.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;
  if v_row.cancelled_at is not null then raise exception 'already cancelled'; end if;
  if exists (select 1 from public.payroll_runs r where r.store_id = v_row.store_id
              and r.period = coalesce(v_row.settle_period, to_char(v_row.biz_date, 'YYYY-MM')) and r.status = 'paid') then
    raise exception 'paid period';
  end if;
  update public.daily_pays set cancelled_at = now(), cancelled_by = v_actor, cancel_reason = trim(p_reason) where id = p_id;
  perform public.audit_log_write('daily_pay_cancel', 'daily_pays:' || p_id::text,
    to_jsonb(v_row), (select to_jsonb(d) from public.daily_pays d where d.id = p_id), v_row.store_id, p_reason);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.daily_pay_cancel(uuid, text) from public, anon;
grant execute on function public.daily_pay_cancel(uuid, text) to authenticated;

-- ═══ ★5 check_set_nominations（97dd24bb） ═══
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
  v_kind text; v_dohan boolean; v_auto boolean; v_summary text;  -- ★0119 裁定100
  -- ★0124 裁定111
  v_prev jsonb; v_old jsonb; v_old_kind text; v_old_dohan boolean;
  v_old_prev text; v_old_chg timestamptz;  -- ★0169（裁定341）: 場内→本指名の切替記録（旧行から引継ぎ）
  v_ended boolean; v_ended_at timestamptz;
  v_active_cnt int := 0; v_sumw_active numeric := 0;
  v_paycnt int; v_dohan_fee int; v_seat_kind text;
  v_fee_kind text; v_name text; v_price int; r_fee record;
  v_sort int; v_lid uuid; v_dcnt int; v_oldqty int; v_qty int;
  v_line_changed boolean := false; v_derived jsonb := '[]'::jsonb;
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight, 'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  -- ★0124 判断A'/C: 旧名簿を cast 別に退避(キー欠落=既存値保持・ended_at 引継ぎ・遷移検知の基準)
  select coalesce(jsonb_object_agg(cast_id::text, jsonb_build_object(
           'nom_kind', nom_kind, 'is_dohan', is_dohan, 'ended_at', ended_at, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at,
           'created_at', created_at)), '{}'::jsonb)  -- ★0169: 旧行の切替記録も退避・★5 0175（便 S 起票）: 着席の時刻（created_at）も退避
    into v_prev
    from public.check_nominations where check_id = p_check_id;

  select count(*) into v_paycnt from public.payments where check_id = p_check_id;  -- ★0124: 派生時のみの保守側ガード用
  select st.dohan_auto_hon, st.dohan_fee into v_auto, v_dohan_fee
    from public.stores st where st.id = v_chk.store_id;  -- ★0119/★0124
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;  -- ★0124 判断C: check_shimei_add と同型の席種解決

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 0 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;  -- ★0123 裁定110: 0 を許可(小数は拒否)

    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    if exists (select 1 from public.check_nominations where check_id = p_check_id and cast_id = v_cast_id) then
      raise exception 'dup cast';  -- 名簿は 1伝票×1キャスト 1行(種別・同伴・ended は行の属性)
    end if;

    v_old := v_prev -> v_cast_id::text;  -- null=新規 cast
    v_old_kind  := coalesce(v_old ->> 'nom_kind', 'free');
    v_old_dohan := coalesce((v_old ->> 'is_dohan')::boolean, false);
    v_old_prev := v_old ->> 'prev_kind'; v_old_chg := (v_old ->> 'kind_changed_at')::timestamptz;  -- ★0169

    -- ★0124 判断A'/C: キー欠落=既存値保持(新規 cast は free/false)。kiosk の free 落ち既存バグ是正
    if v_elem ? 'nom_kind' then
      v_kind := v_elem ->> 'nom_kind';
      if v_kind is null or v_kind not in ('hon','jonai','free') then raise exception 'bad nom_kind'; end if;
    else
      v_kind := v_old_kind;
    end if;
    if v_elem ? 'is_dohan' then
      if jsonb_typeof(v_elem -> 'is_dohan') <> 'boolean' then raise exception 'bad is_dohan'; end if;
      v_dohan := (v_elem ->> 'is_dohan')::boolean;
    else
      v_dohan := v_old_dohan;
    end if;
    if coalesce(v_auto, false) and v_dohan and v_kind = 'free' then v_kind := 'hon'; end if; -- 同伴時の本指名自動付与(jonai 明示は昇格しない)

    -- ★0124 判断A': ended キー欠落=既存値保持・true=旧値引継ぎ(なければ now())・false=解除
    if v_elem ? 'ended' then
      if jsonb_typeof(v_elem -> 'ended') <> 'boolean' then raise exception 'bad ended'; end if;
      v_ended := (v_elem ->> 'ended')::boolean;
      if v_ended then
        v_ended_at := coalesce((v_old ->> 'ended_at')::timestamptz, now());
      else
        v_ended_at := null;
      end if;
    else
      v_ended_at := (v_old ->> 'ended_at')::timestamptz;
    end if;
    if v_ended_at is null then
      v_active_cnt := v_active_cnt + 1;
      v_sumw_active := v_sumw_active + v_w;
    end if;

    -- ★0121 裁定107: 種別と weight(金額按分)は独立(裁定105)
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan, ended_at, prev_kind, kind_changed_at, created_at)  -- ★0169・★5 0175: +created_at
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos, v_kind, v_dohan, v_ended_at,
            case when v_old_kind = 'jonai' and v_kind = 'hon' then 'jonai' else v_old_prev end,   -- ★0169（裁定341）: 場内→本指名の切替＝旧区分と時刻を記録（他の遷移は引継ぎ）
            case when v_old_kind = 'jonai' and v_kind = 'hon' then now() else v_old_chg end,
            coalesce((v_old ->> 'created_at')::timestamptz, now()));   -- ★5 0175（便 S 起票）: 全置換でも着席ログの時刻＝旧行の created_at を引き継ぐ（新規 cast は now()）
    v_pos := v_pos + 1;

    -- ★0124 判断C: 種別の遷移ベース派生(reconcile なし=明細側で取消した行は復活しない=裁定111-4)
    if v_kind is distinct from v_old_kind then
      if v_old_kind in ('hon','jonai') then
        if v_paycnt > 0 then raise exception 'has payments'; end if;
        delete from public.check_lines
         where check_id = p_check_id and cast_id = v_cast_id
           and fee_kind = case v_old_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
        if found then
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'remove', 'cast_id', v_cast_id,
            'fee_kind', case v_old_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end);
        end if;
      end if;
      if v_kind in ('hon','jonai') then
        v_fee_kind := case v_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
        if not exists (select 1 from public.check_lines
                        where check_id = p_check_id and cast_id = v_cast_id and fee_kind = v_fee_kind) then  -- 既存あれば追加しない(裁定111-1)
          if v_paycnt > 0 then raise exception 'has payments'; end if;
          -- 価格解決=check_shimei_add と同一(live・started_at 凍結軸・現在席・rank)
          select * into r_fee from public.pricing_resolve_core(
            v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
          if r_fee.amount is not null then
            v_price := r_fee.amount;
          else
            select case when v_kind = 'hon' then st.hon_fee else st.jonai_fee end
              into v_price from public.stores st where st.id = v_chk.store_id;
          end if;
          v_name := case v_kind when 'hon' then '本指名料' else '場内指名料' end;
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, fee_kind, cast_id)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, v_cast_id)
          returning id into v_lid;
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'add', 'cast_id', v_cast_id,
            'fee_kind', v_fee_kind, 'line_id', v_lid);
        end if;
      end if;
    end if;

    -- ★0124 判断C/H: 同伴の遷移ベース派生(裁定111-2)。dohan_count=行内人数ステッパー(既定1)
    v_qty := null;
    if v_elem ? 'dohan_count' then
      if jsonb_typeof(v_elem -> 'dohan_count') <> 'number' then raise exception 'bad count'; end if;
      if (v_elem ->> 'dohan_count')::numeric <> trunc((v_elem ->> 'dohan_count')::numeric)
         or (v_elem ->> 'dohan_count')::numeric <= 0 then raise exception 'bad count'; end if;
      v_qty := (v_elem ->> 'dohan_count')::numeric::int;
    end if;
    if v_dohan and not v_old_dohan then
      if not exists (select 1 from public.check_lines
                      where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan') then
        if v_paycnt > 0 then raise exception 'has payments'; end if;
        v_price := coalesce(v_chk.dohan_fee, v_dohan_fee);  -- check_dohan_add と同一(snap 優先)
        select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '同伴料', v_price, coalesce(v_qty, 1), v_price * coalesce(v_qty, 1), null, v_sort, 'dohan', v_cast_id)
        returning id into v_lid;
        v_line_changed := true;
        v_derived := v_derived || jsonb_build_object('op', 'add', 'cast_id', v_cast_id,
          'fee_kind', 'dohan', 'line_id', v_lid, 'qty', coalesce(v_qty, 1));
      end if;
    elsif (not v_dohan) and v_old_dohan then
      if v_paycnt > 0 then raise exception 'has payments'; end if;
      delete from public.check_lines
       where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
      if found then
        v_line_changed := true;
        v_derived := v_derived || jsonb_build_object('op', 'remove', 'cast_id', v_cast_id, 'fee_kind', 'dohan');
      end if;
    elsif v_dohan and v_old_dohan and v_qty is not null then
      select count(*) into v_dcnt from public.check_lines
       where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
      if v_dcnt = 1 then  -- ★判断H: ちょうど1本のときのみ qty 同期(取消済み・複数行は no-op)
        select id, qty into v_lid, v_oldqty from public.check_lines
         where check_id = p_check_id and cast_id = v_cast_id and fee_kind = 'dohan';
        if v_oldqty <> v_qty then
          if v_paycnt > 0 then raise exception 'has payments'; end if;
          update public.check_lines set qty = v_qty, line_total = unit_price_snapshot * v_qty where id = v_lid;
          v_line_changed := true;
          v_derived := v_derived || jsonb_build_object('op', 'qty', 'cast_id', v_cast_id,
            'fee_kind', 'dohan', 'line_id', v_lid, 'qty', v_qty);
        end if;
      end if;
    end if;
  end loop;

  -- ★0124 判断B: active(ended 除く)行が有るのに按分合計 0 は拒否(裁定110 の趣旨を active に対して維持)。全員 ended=許可(按分なし)
  if v_active_cnt > 0 and v_sumw_active = 0 then raise exception 'bad weight'; end if;

  if v_line_changed then perform public.check_recalc(p_check_id); end if;  -- ★0124: 派生で明細が動いたときのみ

  v_summary := public.nom_type_summary(p_check_id);  -- ★0119: checks.nom_type は派生サマリ(正本は名簿行)
  update public.checks set nom_type = v_summary where id = p_check_id;

  v_after := jsonb_build_object('nom_type', v_summary, 'nominations', p_nominations, 'derived', v_derived,
    'kind_switch', (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'prev_kind', prev_kind, 'kind_changed_at', kind_changed_at) order by position), '[]'::jsonb)
                      from public.check_nominations where check_id = p_check_id and kind_changed_at is not null));  -- ★0169: 監査 after に切替記録（場内→本指名）
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★7 demo_org_reset（3cdf7a30・service_role のみ＝ACL は create or replace で保つ） ═══
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
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
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★7 set_cast_kind（新設） ═══
CREATE OR REPLACE FUNCTION public.set_cast_kind(p_cast_id uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★7 0175（裁定396・H-11）: 在籍区分（casts.kind）の変更＝本採用（体入→キャスト）を含む。本採用で本入店日（joined_on）が空なら当日（JST）。
--   owner／自店 manager・値は キャスト／接客スタッフ／体入（live の値域）・変更なしは no-op・audit。既定プランへの切替（set_cast_plan）は client が続けて呼ぶ（裁定396）
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_cast  record;
  v_joined date;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_kind is null or p_kind not in ('キャスト','接客スタッフ','体入') then raise exception 'bad kind'; end if;
  select * into v_cast from public.casts where id = p_cast_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) is not true then raise exception 'forbidden'; end if;
  if v_cast.kind is not distinct from p_kind then return; end if;
  v_joined := v_cast.joined_on;
  if v_cast.kind = '体入' and p_kind = 'キャスト' and v_joined is null then v_joined := (now() at time zone 'Asia/Tokyo')::date; end if;
  update public.casts set kind = p_kind, joined_on = v_joined, updated_at = now() where id = p_cast_id;
  perform public.audit_log_write('set_cast_kind', 'casts:' || p_cast_id::text,
    jsonb_build_object('kind', v_cast.kind, 'joined_on', v_cast.joined_on),
    jsonb_build_object('kind', p_kind, 'joined_on', v_joined), v_cast.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.set_cast_kind(uuid, text) from public, anon;
grant execute on function public.set_cast_kind(uuid, text) to authenticated;

-- ═══ ★7 set_pricing_rule_vip（新設） ═══
CREATE OR REPLACE FUNCTION public.set_pricing_rule_vip(p_id uuid, p_vip_timing text, p_vip_ext_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★7 0175（裁定408 追補1）: VIP 料金ルール（fee_kind 'vip_charge'）のかかるタイミング＝per_set（セットごと・既定・延長は vip_ext_amount を延長 1 回あたり加算）／on_entry（入店時に 1 回）。
--   卓ごと／人ごとは既存の billing_unit（table／person）＝set_pricing_rule のまま。owner／自店 manager・audit。計算側（check_open／extension）の読み方は P175
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_vip_timing is null or p_vip_timing not in ('per_set','on_entry') then raise exception 'bad vip_timing'; end if;
  if p_vip_ext_amount is not null and p_vip_ext_amount < 0 then raise exception 'bad vip_ext_amount'; end if;
  if p_vip_timing = 'on_entry' and p_vip_ext_amount is not null then raise exception 'bad vip_ext_amount'; end if;
  select * into v_row from public.pricing_rules where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_row.fee_kind <> 'vip_charge' then raise exception 'not vip rule'; end if;
  if (v_role = 'owner' or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) is not true then raise exception 'forbidden'; end if;
  update public.pricing_rules set vip_timing = p_vip_timing, vip_ext_amount = p_vip_ext_amount, updated_at = now() where id = p_id;
  perform public.audit_log_write('set_pricing_rule_vip', 'pricing_rules:' || p_id::text,
    jsonb_build_object('vip_timing', v_row.vip_timing, 'vip_ext_amount', v_row.vip_ext_amount),
    jsonb_build_object('vip_timing', p_vip_timing, 'vip_ext_amount', p_vip_ext_amount), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.set_pricing_rule_vip(uuid, text, integer) from public, anon;
grant execute on function public.set_pricing_rule_vip(uuid, text, integer) to authenticated;

-- ═══ ★7 staff_payroll_run_set_status（新設・owner） ═══
CREATE OR REPLACE FUNCTION public.staff_payroll_run_set_status(p_run_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★7 0175（裁定356）: スタッフ給与 run の確定＝open→finalized（finalized_at）→paid（paid_at）の前進のみ。owner のみ（店長自身の報酬を含むため）。audit
declare
  v_org uuid := public.auth_org_id();
  v_row record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('finalized','paid') then raise exception 'bad status'; end if;
  select * into v_row from public.staff_payroll_runs where id = p_run_id and org_id = v_org for update;
  if not found then raise exception 'not found'; end if;
  if p_status = 'finalized' and v_row.status <> 'open' then raise exception 'bad transition'; end if;
  if p_status = 'paid' and v_row.status <> 'finalized' then raise exception 'bad transition'; end if;
  update public.staff_payroll_runs
     set status = p_status,
         finalized_at = case when p_status = 'finalized' then now() else finalized_at end,
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where id = p_run_id;
  perform public.audit_log_write('staff_payroll_run_set_status', 'staff_payroll_runs:' || p_run_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', p_status), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.staff_payroll_run_set_status(uuid, text) from public, anon;
grant execute on function public.staff_payroll_run_set_status(uuid, text) to authenticated;

-- ═══ ★8 store_wifi_add／remove（新設） ═══
CREATE OR REPLACE FUNCTION public.store_wifi_add(p_store_id uuid, p_ip text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★8 0175（398）: 店 Wi-Fi の登録＝route がサーバで読んだ IP（x-forwarded-for 先頭）を渡す。owner／自店 manager・空／64 文字超は拒否・distinct・audit（set_store_profile は allow_ip を書かない＝BANZEN 0028 と同じ）
declare
  v_org uuid := public.auth_org_id();
  v_row record;
  v_ip  text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  v_ip := nullif(trim(coalesce(p_ip, '')), '');
  if v_ip is null or length(v_ip) > 64 then raise exception 'bad ip'; end if;
  select id, org_id, store_id, punch_allow_ip into v_row from (select s.id, s.org_id, s.id as store_id, s.punch_allow_ip from public.stores s where s.id = p_store_id) x;
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  update public.stores set punch_allow_ip = (select array_agg(distinct x order by x) from unnest(array_append(punch_allow_ip, v_ip)) x), updated_at = now() where id = p_store_id;
  perform public.audit_log_write('store_wifi_add', 'stores:' || p_store_id::text,
    jsonb_build_object('punch_allow_ip', v_row.punch_allow_ip), jsonb_build_object('punch_allow_ip', (select s.punch_allow_ip from public.stores s where s.id = p_store_id)), p_store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.store_wifi_add(uuid, text) from public, anon;
grant execute on function public.store_wifi_add(uuid, text) to authenticated;
CREATE OR REPLACE FUNCTION public.store_wifi_remove(p_store_id uuid, p_ip text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★8 0175（398）: 店 Wi-Fi の削除。owner／自店 manager・audit
declare
  v_org uuid := public.auth_org_id();
  v_row record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_ip is null or trim(p_ip) = '' then raise exception 'bad ip'; end if;
  select s.id, s.org_id, s.punch_allow_ip into v_row from public.stores s where s.id = p_store_id;
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  update public.stores set punch_allow_ip = array_remove(punch_allow_ip, trim(p_ip)), updated_at = now() where id = p_store_id;
  perform public.audit_log_write('store_wifi_remove', 'stores:' || p_store_id::text,
    jsonb_build_object('punch_allow_ip', v_row.punch_allow_ip), jsonb_build_object('punch_allow_ip', (select s.punch_allow_ip from public.stores s where s.id = p_store_id)), p_store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.store_wifi_remove(uuid, text) from public, anon;
grant execute on function public.store_wifi_remove(uuid, text) to authenticated;

-- ═══ ★8 punch_self（952f18a4）＝7 引数 ═══
CREATE OR REPLACE FUNCTION public.punch_self(p_type text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_okuri boolean DEFAULT NULL::boolean, p_within_geofence boolean DEFAULT NULL::boolean, p_geo_override boolean DEFAULT false, p_override_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_row record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）: out 打刻の送り利用（既定＝okuri_default_of）
  v_note  text;     -- ★8 0175（398）: 範囲外を理由つきで通した注記（200 字）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  -- ★8 0175（398）: 判定（位置・IP・ハード／ソフト）は route /api/punch/self（lib/nox/punch/geofence・decidePunch）が行い結果を渡す。範囲外を理由つきで通すときは注記必須
  if coalesce(p_geo_override, false) then
    v_note := left(nullif(trim(coalesce(p_override_note, '')), ''), 200);
    if v_note is null then raise exception 'override note required'; end if;
  end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  v_okuri := public.okuri_default_of(v_row.store_id, p_type, p_okuri);  -- ★4 0156
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- ★3 0161（裁定327）: 順序検査＝盲目記録（0008 決定1）は退役。'already in'／'already out'／'no open punch' で拒否・前営業日以前の未閉鎖 in は塞がず注意行 'open_punch'
  perform public.punch_seq_check(v_row.store_id, v_cast, p_type, now());   -- ★3 0161
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri, within_geofence, geo_override, note)  -- ★4 0156: +okuri・★8 0175: +within_geofence／geo_override／note
  values (v_row.org_id, v_row.store_id, v_cast, p_type, p_lat, p_lng, v_ip, 'self', v_okuri, p_within_geofence, coalesce(p_geo_override, false), v_note)
  returning id into v_id;
  perform public.audit_log_write('punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_row.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.punch_self(text, double precision, double precision, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.punch_self(text, double precision, double precision, boolean, boolean, boolean, text) to authenticated;

-- ═══ ★8 punch_proxy（a760e1a4） ═══
CREATE OR REPLACE FUNCTION public.punch_proxy(p_cast_id uuid, p_type text, p_note text DEFAULT NULL::text, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  perform public.punch_seq_check(v_cast.store_id, p_cast_id, p_type, now());   -- ★3 0161（裁定327）: 順序検査（代理打刻も対象＝起草判断）
  insert into public.punches (org_id, store_id, cast_id, type, ip, source, note, okuri, within_geofence)  -- ★4 0156: +okuri・★8 0175（398）: 代理打刻＝店長が在席を保証＝within_geofence true（BANZEN 0029 ⑤ と同じ）
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, v_ip, 'manager', p_note, v_okuri, true)
  returning id into v_id;
  perform public.audit_log_write('punch_proxy', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_cast.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★9 availability_set／availability_list（新設） ═══
CREATE OR REPLACE FUNCTION public.availability_set(p_membership_id uuid, p_rows jsonb, p_terms jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★9 0175（裁定397＋413 追補1）: 基本の働き方＝membership 単位。p_rows＝曜日ごとの配列 [{dow 0-6, avail ok|ng|ask, from_min, to_min, memo}]（全置換・無い曜日は行なし＝制限なし）・
--   p_terms＝{week_days_target 0-7, fixed_off_dows [0-6], effective_from 'YYYY-MM-DD', memo}（null＝変えない）。本人（auth_membership_id()）か owner／自店 manager。
--   雇用キャストの時間帯（from_min／to_min）は店のみ＝本人が変えようとすると 'time by store only'。audit。相手への通知は client（P175）＝お知らせ／今日タブの通知欄
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_me    uuid := public.auth_membership_id();
  v_mem   record;
  v_self  boolean;
  v_emp   text;
  v_e     jsonb;
  v_dow   int; v_av text; v_from int; v_to int; v_memo text;
  v_before jsonb; v_after jsonb;
  v_wdt   int; v_fo smallint[]; v_eff date; v_tmemo text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad rows'; end if;
  select m.id, m.store_id, m.user_id, m.role, s.org_id into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org then raise exception 'forbidden'; end if;
  v_self := (v_me is not null and v_me = p_membership_id);
  if not (v_self or v_role = 'owner' or (v_role = 'manager' and v_mem.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  -- 雇用キャスト＝casts.employment '雇用'（membership の user と店で結ぶ）
  select c.employment into v_emp from public.casts c where c.user_id = v_mem.user_id and c.store_id = v_mem.store_id and c.is_active limit 1;

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'org_id' - 'store_id' - 'created_at' - 'updated_at' order by a.dow), '[]'::jsonb) into v_before
    from public.availability a where a.membership_id = p_membership_id;

  -- 検査（全要素）→ 全置換
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'bad rows'; end if;
    if jsonb_typeof(v_e->'dow') <> 'number' then raise exception 'bad dow'; end if;
    v_dow := (v_e->>'dow')::int; if v_dow < 0 or v_dow > 6 then raise exception 'bad dow'; end if;
    v_av := v_e->>'avail'; if v_av is null or v_av not in ('ok','ng','ask') then raise exception 'bad avail'; end if;
    v_from := nullif(v_e->>'from_min', '')::int; v_to := nullif(v_e->>'to_min', '')::int;
    if (v_from is null) <> (v_to is null) then raise exception 'bad time'; end if;
    if v_from is not null and (v_from < 0 or v_from > 1439 or v_to < 0 or v_to > 2879) then raise exception 'bad time'; end if;
    v_memo := left(nullif(trim(coalesce(v_e->>'memo', '')), ''), 200);
    if v_self and v_emp = '雇用' then   -- 雇用キャストの時間帯は店のみ（本人は表示と「変更を希望する」のメモ）
      if exists (select 1 from public.availability a where a.membership_id = p_membership_id and a.dow = v_dow
                   and (a.from_min is distinct from v_from or a.to_min is distinct from v_to))
         or (v_from is not null and not exists (select 1 from public.availability a where a.membership_id = p_membership_id and a.dow = v_dow)) then
        raise exception 'time by store only';
      end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rows) e) <> (select count(distinct (e->>'dow')) from jsonb_array_elements(p_rows) e) then raise exception 'dup dow'; end if;

  delete from public.availability where membership_id = p_membership_id;
  insert into public.availability (org_id, store_id, membership_id, dow, avail, from_min, to_min, memo)
  select v_org, v_mem.store_id, p_membership_id, (e->>'dow')::int, e->>'avail',
         nullif(e->>'from_min', '')::int, nullif(e->>'to_min', '')::int, left(nullif(trim(coalesce(e->>'memo', '')), ''), 200)
    from jsonb_array_elements(p_rows) e;

  -- 413 追補1 の列（terms）＝null なら触らない
  if p_terms is not null then
    if jsonb_typeof(p_terms) <> 'object' then raise exception 'bad terms'; end if;
    v_wdt := nullif(p_terms->>'week_days_target', '')::int;
    if v_wdt is not null and (v_wdt < 0 or v_wdt > 7) then raise exception 'bad week_days_target'; end if;
    if p_terms ? 'fixed_off_dows' then
      if jsonb_typeof(p_terms->'fixed_off_dows') <> 'array' then raise exception 'bad fixed_off_dows'; end if;
      select coalesce(array_agg(distinct (x)::smallint order by (x)::smallint), '{}'::smallint[]) into v_fo
        from jsonb_array_elements_text(p_terms->'fixed_off_dows') x;
      if exists (select 1 from unnest(v_fo) d where d < 0 or d > 6) then raise exception 'bad fixed_off_dows'; end if;
    end if;
    v_eff := nullif(p_terms->>'effective_from', '')::date;
    v_tmemo := left(nullif(trim(coalesce(p_terms->>'memo', '')), ''), 200);
    insert into public.availability_terms (org_id, store_id, membership_id, week_days_target, fixed_off_dows, effective_from, memo, updated_by)
    values (v_org, v_mem.store_id, p_membership_id, v_wdt, coalesce(v_fo, '{}'::smallint[]), v_eff, v_tmemo, v_me)
    on conflict (membership_id) do update
      set week_days_target = case when p_terms ? 'week_days_target' then excluded.week_days_target else availability_terms.week_days_target end,
          fixed_off_dows   = case when p_terms ? 'fixed_off_dows'   then excluded.fixed_off_dows   else availability_terms.fixed_off_dows end,
          effective_from   = case when p_terms ? 'effective_from'   then excluded.effective_from   else availability_terms.effective_from end,
          memo             = case when p_terms ? 'memo'             then excluded.memo             else availability_terms.memo end,
          updated_by = v_me, updated_at = now();
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'org_id' - 'store_id' - 'created_at' - 'updated_at' order by a.dow), '[]'::jsonb) into v_after
    from public.availability a where a.membership_id = p_membership_id;
  perform public.audit_log_write('availability_set', 'memberships:' || p_membership_id::text,
    jsonb_build_object('rows', v_before),
    jsonb_build_object('rows', v_after, 'terms', p_terms, 'by_self', v_self), v_mem.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.availability_set(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.availability_set(uuid, jsonb, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.availability_list(p_store_id uuid)
 RETURNS TABLE(membership_id uuid, user_id uuid, role text, dow smallint, avail text, from_min integer, to_min integer, memo text, week_days_target integer, fixed_off_dows smallint[], effective_from date, terms_memo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★9 0175（裁定397）: 自店の全員の働き方（シフト作成の候補順＝可→相談→不可・一覧カードの曜日チップ）。owner／自店 manager・staff（can_shift）。cast は自分の行だけ（SELECT ポリシーでも読める）
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or p_store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  return query
    select m.id, m.user_id, m.role, a.dow, a.avail, a.from_min, a.to_min, a.memo,
           t.week_days_target, t.fixed_off_dows, t.effective_from, t.memo
      from public.memberships m
      left join public.availability a on a.membership_id = m.id
      left join public.availability_terms t on t.membership_id = m.id
     where m.store_id = p_store_id and m.is_active
       and (v_role in ('owner','manager','staff') or m.id = public.auth_membership_id())
     order by m.id, a.dow;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.availability_list(uuid) from public, anon;
grant execute on function public.availability_list(uuid) to authenticated;

-- ═══ ★10 set_my_contact（新設） ═══
CREATE OR REPLACE FUNCTION public.set_my_contact(p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★10 0175（400＝BZ-R）: 本人の連絡先（連絡用メール・電話）＝users の列。ログインのメール（users.email／auth）は変えない（BANZEN 流儀）。
--   鍵が無い項目は変えない・空文字は null・email は小文字＋形式・phone は ^[0-9+\-() ]{6,20}$・デモ org（orgs.is_demo）は 'forbidden'（個人情報を入れさせない＝BANZEN 0196 相当）・audit。
--   cast／staff 共通（users 行を持つ人）。確認済み・履歴は 0176（contact_changes）
declare
  v_org  uuid := public.auth_org_id();
  v_me   record;
  v_demo boolean;
  v_k    text;
  v_email text; v_phone text;
  v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('contact_email','phone') then raise exception 'bad key'; end if;
    if jsonb_typeof(p_patch->v_k) not in ('string','null') then raise exception 'bad type'; end if;
  end loop;
  select is_demo into v_demo from public.orgs where id = v_org;
  if coalesce(v_demo, false) then raise exception 'forbidden'; end if;
  select * into v_me from public.users u where u.auth_user_id = auth.uid() and u.org_id = v_org and u.is_active;
  if v_me.id is null then raise exception 'forbidden'; end if;
  if p_patch ? 'contact_email' then
    v_email := nullif(lower(trim(coalesce(p_patch->>'contact_email', ''))), '');
    if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'bad email'; end if;
    v_before := v_before || jsonb_build_object('contact_email', v_me.contact_email);
    v_after  := v_after  || jsonb_build_object('contact_email', v_email);
  end if;
  if p_patch ? 'phone' then
    v_phone := nullif(trim(coalesce(p_patch->>'phone', '')), '');
    if v_phone is not null and v_phone !~ '^[0-9+\-() ]{6,20}$' then raise exception 'bad phone'; end if;
    v_before := v_before || jsonb_build_object('phone', v_me.phone);
    v_after  := v_after  || jsonb_build_object('phone', v_phone);
  end if;
  if v_after = v_before then return; end if;
  update public.users
     set contact_email = case when p_patch ? 'contact_email' then v_email else contact_email end,
         phone         = case when p_patch ? 'phone'         then v_phone else phone end,
         updated_at = now()
   where id = v_me.id;
  perform public.audit_log_write('set_my_contact', 'users:' || v_me.id::text, v_before, v_after, public.auth_store_id());
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.set_my_contact(jsonb) from public, anon;
grant execute on function public.set_my_contact(jsonb) to authenticated;
-- ═══ ★22 bottle_keep_register（e6b043fd）＝11 引数／bottle_keep_update（51992d82）＝8 引数 ═══
CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text, p_bottle_name text DEFAULT NULL::text, p_check_line_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text, p_tag_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
  v_line      record;  -- ★16 0153: 購入行（p_check_line_id）
  v_tag       text;    -- ★22 0175 v2（裁定419）: タグ名（空＝「{顧客名} {ボトル名}」を自動生成）
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_status is null or p_status not in ('active','pending') then raise exception 'bad status'; end if;   -- ★5 0173（裁定392）

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  -- ★mig0094: 追加3列の入力検証（CHECK と同値・エラー文言を関数側で統一）
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;

  -- ★16 0153（305-6）: ボトル名（≤60・空→null）
  if p_bottle_name is not null and length(p_bottle_name) > 60 then raise exception 'bad bottle_name'; end if;
  -- ★16 0153: 購入行との紐づけ＝同店・同商品の行で、その行の伝票に紐づく顧客に限る（'bad line'／'not on check'）→ 行の注文者を持ち主にする（要裁定 (2)）
  if p_check_line_id is not null then
    select l.id, l.check_id, l.store_id, l.product_id into v_line from public.check_lines l where l.id = p_check_line_id and l.org_id = v_org;
    if v_line.id is null or v_line.store_id <> p_store_id or v_line.product_id is distinct from p_product_id then raise exception 'bad line'; end if;
    if not exists (select 1 from public.check_customers cc where cc.check_id = v_line.check_id and cc.customer_id = p_customer_id) then raise exception 'not on check'; end if;
    update public.check_lines set customer_id = p_customer_id where id = p_check_line_id;
  end if;
  -- ★22 0175 v2（裁定419）: タグ名＝入力（≤60）か既定「{顧客名} {ボトル名}」（ボトル名は p_bottle_name→商品名）
  if p_tag_label is not null and length(p_tag_label) > 60 then raise exception 'bad tag_label'; end if;
  v_tag := nullif(trim(coalesce(p_tag_label, '')), '');
  if v_tag is null then
    select left(cu.name || ' ' || coalesce(nullif(trim(coalesce(p_bottle_name, '')), ''), v_prod.name), 60) into v_tag from public.customers cu where cu.id = p_customer_id;
  end if;
  -- ★5 0173（裁定392）: status＝p_status（'active'／'pending'）
  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no, bottle_name, check_line_id, tag_label)   -- ★16: 末尾 ')' → ', bottle_name)'（0158 ★7: +check_line_id）
  values (v_org, p_store_id, p_customer_id, p_product_id, p_status, now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no, nullif(trim(coalesce(p_bottle_name, '')), ''), p_check_line_id, v_tag)   -- ★16（0158 ★7: 購入行との紐づけ＝裁定314）
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid, text, text) from public, anon;
grant execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid, text, text) to authenticated;
CREATE OR REPLACE FUNCTION public.bottle_keep_update(p_id uuid, p_remaining_pct integer, p_expires_on date, p_shelf_no text, p_status text, p_note text, p_bottle_name text DEFAULT NULL::text, p_tag_label text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.bottle_keeps;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('active','empty','removed') then raise exception 'bad status'; end if;
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;
  if p_bottle_name is not null and length(p_bottle_name) > 60 then raise exception 'bad bottle_name'; end if;   -- ★17 0153（305-6）
  if p_tag_label is not null and length(p_tag_label) > 60 then raise exception 'bad tag_label'; end if;   -- ★22 0175 v2（裁定419）: null＝変えない（旧 client の互換）・空＝消す

  select * into v_row from public.bottle_keeps where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  update public.bottle_keeps
     set remaining_pct = p_remaining_pct, expires_on = p_expires_on,
         shelf_no = p_shelf_no, status = p_status, note = p_note,
         bottle_name = nullif(trim(coalesce(p_bottle_name, '')), ''),   -- ★17 0153: 末尾 ',' を足して 1 列
         tag_label = case when p_tag_label is null then tag_label else nullif(trim(p_tag_label), '') end   -- ★22 v2: タグ名（null＝据え置き）
   where id = p_id;

  perform public.audit_log_write('bottle_keep_update', 'bottle_keeps:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(b) from public.bottle_keeps b where b.id = p_id), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.bottle_keep_update(uuid, integer, date, text, text, text, text, text) from public, anon;
grant execute on function public.bottle_keep_update(uuid, integer, date, text, text, text, text, text) to authenticated;

-- ═══ ★23 check_set_ext_rule（02b145a6）／check_extension_add（035a7974）／check_open（82dfd091）＝署名不変（ACL は create or replace で保つ） ═══
CREATE OR REPLACE FUNCTION public.check_set_ext_rule(p_check_id uuid, p_rule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0173（裁定385 追補）: 自動延長後の延長パターン切替＝checks.ext_min／ext_fee／ext_unit を ext_menu_snap の別パターンへ・
--   確定済み（time_auto）の延長ブロックは新単価で引き直す（qty＝人数／卓はそのまま・分数が違うパターンへの切替は単価だけ引き直し＝ブロック数は不変・仮決め）。
--   ゲート＝check_set_people と同型（owner／manager／staff can_register／cast can_register／kiosk 腕）。
declare
  v_chk record; v_org uuid; v_emin int; v_efee int; v_eunit text; v_before jsonb; v_n int;
  v_label text;  -- ★23 0175 v2（裁定408 系）: パターン名（延長行に併記）
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rule_id is null then raise exception 'bad rule'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select (m.value->>'duration_min')::int, (m.value->>'amount')::int, m.value->>'unit', m.value->>'label'
    into v_emin, v_efee, v_eunit, v_label   -- ★23 v2: +label
    from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
   where (m.value->>'rule_id')::uuid = p_rule_id;
  if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then raise exception 'bad rule'; end if;
  if v_eunit is not null and v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_before := to_jsonb(v_chk);
  update public.checks
     set ext_min = v_emin, ext_fee = v_efee, ext_unit = coalesce(v_eunit, ext_unit), ext_rule_id = p_rule_id   -- ★23 v2: 選択中のパターン
   where id = p_check_id;
  update public.check_lines
     set unit_price_snapshot = v_efee, line_total = v_efee * qty, name_snapshot = '延長料金（' || coalesce(v_label, v_emin || '分') || '）'   -- ★23 v2: パターン名を併記
   where check_id = p_check_id and time_auto and fee_kind = 'extension';
  get diagnostics v_n = row_count;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_set_ext_rule', 'checks:' || p_check_id::text,
    v_before || jsonb_build_object('repriced_blocks', v_n),
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.check_extension_add(p_check_id uuid, p_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_mode text; v_units int; v_sort int; v_paycnt int; v_id uuid;
  v_emin int; v_efee int;  -- ★mig0098 R2-1: 選択メニュー(null=既定スナップ)
  v_org uuid;
  v_seat_kind text; r_fee record; v_nom record; v_sort2 int; v_id2 uuid;  -- ★0124 裁定111-7
  v_eunit text; v_eunit_menu text;  -- ★mig0130: 実効単位(メニュー unit キー/ext_unit/time_per)
  v_label text;  -- ★23 0175 v2（裁定408 系）: パターン名（延長行に併記・既定＝選択中 ext_rule_id の label）
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  if v_chk.ext_min < 1 or v_chk.ext_fee < 0 or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;
  -- ★manual 専用(auto 店は check_time_charge_apply が権威=二重計上封じ)
  select time_mode into v_mode from public.stores where id = v_chk.store_id;
  if v_mode is distinct from 'manual' then raise exception 'auto mode'; end if;

  -- ★mig0098 R2-1: p_rule_id null=既定(checks スナップ ext_min/ext_fee=現行完全互換)。
  --   指定時は ext_menu_snap(開栓時凍結)から解決=live pricing_rules は読まない(凍結原則 R2-4)。
  --   snap に無い id・旧伝票(snap null)への指定は 'bad rule'
  --   ★mig0130: 単位も凍結値から=既定は checks.ext_unit・メニュー指定は項目の unit キー。
  --     旧 snap(unit キーなし)・旧伝票(ext_unit null)は time_per フォールバック=現行同値
  v_emin := v_chk.ext_min;
  v_efee := v_chk.ext_fee;
  v_eunit := coalesce(v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  if p_rule_id is not null then
    select (m.value->>'duration_min')::int, (m.value->>'amount')::int,
           nullif(m.value->>'unit', ''), m.value->>'label' into v_emin, v_efee, v_eunit_menu, v_label   -- ★23 v2: +label
      from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m
     where (m.value->>'rule_id')::uuid = p_rule_id;
    if v_emin is null or v_efee is null or v_emin < 1 or v_efee < 0 then
      raise exception 'bad rule';
    end if;
    v_eunit := coalesce(v_eunit_menu, v_chk.ext_unit, v_chk.time_per);  -- ★mig0130
  end if;
  -- ★23 0175 v2（裁定408 系）: 既定（p_rule_id null）は選択中のパターン（checks.ext_rule_id）の label を併記（旧伝票＝null）
  if p_rule_id is null and v_chk.ext_rule_id is not null then
    select m.value->>'label' into v_label from jsonb_array_elements(coalesce(v_chk.ext_menu_snap, '[]'::jsonb)) m where (m.value->>'rule_id')::uuid = v_chk.ext_rule_id;
  end if;
  -- ★mig0130: 防御深度(凍結値の妥当性)
  if v_eunit not in ('person','table') then raise exception 'bad time settings'; end if;
  v_units := case when v_eunit = 'person' then coalesce(v_chk.people, 1) else 1 end;  -- ★mig0130: ext_unit 起点
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_lines where check_id = p_check_id;
  -- 1押し=1行(time_auto=false=部分ユニーク非対象・客確認の記録が行数で残る・取消は remove_line)
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto, fee_kind)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          case when v_label is null then '延長料金(' || v_emin || '分)' else '延長料金（' || v_label || '）' end, v_efee, v_units,   -- ★23 v2: パターン名を併記
          v_efee * v_units, null, v_sort, false, 'extension')
  returning id into v_id;

  -- ★0124 裁定111-7 判断D/E/G: 延長指名料。ext_shimei は指名料の性質=延長人数(v_units)非連動・qty=1/cast
  if (select st.ext_shimei_enabled from public.stores st where st.id = v_chk.store_id) then
    select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
    select * into r_fee from public.pricing_resolve_core(
      v_chk.store_id, v_chk.started_at, 'ext_shimei', v_seat_kind, null);  -- rank 非対応(判断D)
    if r_fee.amount is not null then  -- ルールヒットなし=課金しない(skip)
      for v_nom in select cast_id from public.check_nominations
                    where check_id = p_check_id and nom_kind = 'hon' and ended_at is null
                    order by position
      loop
        select coalesce(max(sort_order), 0) + 1 into v_sort2
          from public.check_lines where check_id = p_check_id;
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, fee_kind, cast_id)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                '延長指名料', r_fee.amount, 1, r_fee.amount, null, v_sort2, 'ext_shimei', v_nom.cast_id)
        returning id into v_id2;
        perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id2::text, null,
          (select to_jsonb(l) from public.check_lines l where l.id = v_id2), v_chk.store_id);
      end loop;
    end if;
  end if;

  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid, p_set_rule_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
  v_units int;  -- ★0089
  v_dow2 smallint; v_bm2 int; v_cut2 int; v_settings2 jsonb; v_cutoff2 text; v_seatk text;  -- ★mig0098
  v_ext_menu jsonb;  -- ★mig0098 R2-1: 延長メニュー凍結
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 税設定の凍結
  v_cat_name text;  -- ★mig0128(裁定116-2): 区分名の凍結用
  v_rule_name text;  -- ★mig0129(裁定119): 適用ルール名の凍結用
  r_vip record; v_vfee int; v_vunit text; v_vname text; v_vunits int; v_vid uuid;  -- ★mig0130(裁定118): vip_charge
  v_sunit text; v_eunit text;  -- ★mig0130: set/ext の実効課金単位(rule.billing_unit ?? time_per)
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee,
         st.business_tax_status, st.price_display, st.tax_rounding  -- ★mig0113
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  perform public.assert_day_open(v_seat.store_id, public.biz_date_of(v_seat.store_id, now()));
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★mig0128(裁定116-2): 区分検証(同 org・同店・active のみ)。null=全区分=現行同値。
  --   配置は既存 open 再利用の後=区分は「新規開栓の凍結時」にのみ意味を持つ
  --   (再利用返却の冪等挙動は不変)。名称も同時取得=checks へ凍結(マスタ改名は非遡及)
  if p_category_id is not null then
    select pc.name into v_cat_name
      from public.pricing_categories pc
     where pc.id = p_category_id
       and pc.org_id = v_org
       and pc.store_id = v_seat.store_id
       and pc.is_active;
    if v_cat_name is null then raise exception 'bad category'; end if;
  end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  --   ★mig0128: 区分を3呼びすべてへ引渡し(裁定116-2・区分も開栓凍結=裁定117)
  --   ★mig0130(裁定118): 4呼び目=vip_charge(VIP 限定は seat_kind 条件で表現=特殊分岐なし)
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',        v_seat.kind, null, p_category_id);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension',  v_seat.kind, null, p_category_id);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',      v_seat.kind, null, p_category_id);
  select * into r_vip from public.pricing_resolve_core(v_seat.store_id, now(), 'vip_charge', v_seat.kind, null, p_category_id);  -- ★mig0130

  -- ★mig0098 R2-5: 開卓時ルール手動選択（override）。null=自動一致（現行完全互換）。
  --   検証: 同店・fee_kind='set'・is_active（他店/他種/無効は 'bad rule'）。選び直し不可＝
  --   開卓やり直し（void→再開卓）の現行運用（設計書 R2-5）
  --   ★mig0128: override は明示選択につき区分フィルタ不適用（区分違いのルールも指名可）
  --   ★mig0130: billing_unit も指名ルールから取得(select へ追加)
  if p_set_rule_id is not null then
    select r.amount as amount, r.duration_min as duration_min, r.id as rule_id,
           r.billing_unit as billing_unit into r_set
      from public.pricing_rules r
     where r.id = p_set_rule_id and r.store_id = v_seat.store_id
       and r.fee_kind = 'set' and r.is_active;
    if r_set.rule_id is null then raise exception 'bad rule'; end if;
  end if;

  -- ★mig0129(裁定119): 適用セットルールの凍結。r_set.rule_id は自動解決 or override 確定値。
  --   name null ルールは null 凍結(UI 非表示規則)・フォールバック(rule_id null)は両列 null
  --   =0129 以前の既存伝票と同表現(区別しない・「基本料金」誤表示経路を作らない)
  if r_set.rule_id is not null then
    select r.name into v_rule_name
      from public.pricing_rules r
     where r.id = r_set.rule_id;
  end if;

  -- ★mig0098 R2-1/R2-2/R2-4: 延長メニュー全件を開栓時に凍結（priority 順・limit なし）。
  --   ★鏡像規律: 下の where は pricing_resolve_core（extension・rank null 呼び）と同一式。
  --     core は limit 1・こちらは全件列挙という差のみ。条件を変えるときは必ず同時改修
  --     （core 側は pin 保全のため不触＝相互参照は本コメントと R2 設計書 v1.1 が正）
  --   ★mig0128(教訓52): 区分条件・区分優先順を core と同時挿入(鏡像2点セット)。
  --     以後 resolve 条件を変えるときは core+本 where の同時改修が必須
  --   ★mig0130: 各項目へ unit キー(実効単位=rule.billing_unit ?? time_per)を凍結追加
  select b.biz_dow, b.biz_min into v_dow2, v_bm2
    from public.biz_minutes_of(v_seat.store_id, now()) b;
  select s.settings_json into v_settings2 from public.stores s where s.id = v_seat.store_id;
  v_cutoff2 := coalesce(nullif(trim(coalesce(v_settings2, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut2 := split_part(v_cutoff2, ':', 1)::int * 60 + split_part(v_cutoff2, ':', 2)::int;
  v_seatk := coalesce(v_seat.kind, '卓');
  select coalesce(jsonb_agg(jsonb_build_object(
           'rule_id', r.id,
           'duration_min', coalesce(r.duration_min, v_seat.ext_min),
           'amount', r.amount,
           'unit', coalesce(r.billing_unit, v_seat.time_per),  -- ★mig0130: 実効単位の凍結
           'is_default', r.is_default_ext,  -- ★1 0173（裁定385）: 既定パターン（レジの選択は手動延長時のみ・自動延長は既定を自動適用）
           'label', '延長 ' || coalesce(r.duration_min, v_seat.ext_min) || '分 ¥' || r.amount)
         order by r.is_default_ext desc, r.priority asc, (r.category_id is not null) desc,  -- ★1 0173: 既定を先頭（core と鏡像）・★mig0128: 同 priority 内区分一致優先(core と鏡像)
                  r.created_at asc, r.id asc), '[]'::jsonb)
    into v_ext_menu
    from public.pricing_rules r
   where r.store_id = v_seat.store_id
     and r.is_active
     and r.fee_kind = 'extension'
     and (r.seat_kind is null or r.seat_kind = v_seatk)
     and (r.rank_id is null)  -- core は rank null 呼び＝(rank_id is null or rank_id = null) と等価
     and (r.category_id is null or r.category_id = p_category_id)  -- ★mig0128(教訓52 鏡像)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow2) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut2 then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm2
           and v_bm2 < (case when r.time_to_min <= v_cut2 then r.time_to_min + 1440 else r.time_to_min::int end) ));

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  --   ★mig0113: 税設定3値を同スナップへ追補（非遡及＝open 中伝票は旧税設定）
  --   ★mig0128: 区分2値（category_id/category_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0129: 適用ルール2値（set_rule_id/set_rule_name）を同スナップへ追補（非遡及・開栓凍結）
  --   ★mig0130: 単位系4値（set_unit/ext_unit/vip_charge_fee/vip_charge_unit）を同スナップへ追補
  --     (実効単位=rule.billing_unit ?? time_per・vip はルール0件=両値 null=dohan_fee 同型)
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  v_bts  := v_seat.business_tax_status;  -- ★mig0113
  v_pd   := v_seat.price_display;        -- ★mig0113
  v_trnd := v_seat.tax_rounding;         -- ★mig0113
  v_sunit := coalesce(r_set.billing_unit, v_tper);  -- ★mig0130
  v_eunit := coalesce(r_ext.billing_unit, v_tper);  -- ★mig0130
  v_vfee  := r_vip.amount;  -- ★mig0130: 0行=null(dohan 同型)
  v_vunit := case when r_vip.rule_id is not null
                  then coalesce(r_vip.billing_unit, v_tper) end;  -- ★mig0130
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0113: 防御深度（列 CHECK が正・型変更/削除事故の検知用）
  if v_bts not in ('taxable','exempt') or v_pd not in ('tax_included','tax_excluded')
     or v_trnd not in ('floor','round','ceil') then
    raise exception 'bad store settings';
  end if;
  -- ★mig0130: 防御深度(単位2値)
  if v_sunit not in ('person','table') or v_eunit not in ('person','table') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id, ext_menu_snap, opened_by_membership,   -- ★3 0173（裁定389）: 操作者の membership（cast 含む・kiosk は null）
                             ext_rule_id,   -- ★23 0175 v2（裁定408 系）: 開卓時の既定パターン（凍結メニューの既定＝r_ext.rule_id・無ければ null）
                             business_tax_status, price_display, tax_rounding,  -- ★mig0113
                             category_id, category_name,  -- ★mig0128
                             set_rule_id, set_rule_name,  -- ★mig0129
                             set_unit, ext_unit, vip_charge_fee, vip_charge_unit)  -- ★mig0130
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id, v_ext_menu, public.auth_membership_id(),   -- ★3 0173
          r_ext.rule_id,   -- ★23 v2
          v_bts, v_pd, v_trnd,  -- ★mig0113
          p_category_id, v_cat_name,  -- ★mig0128
          r_set.rule_id, v_rule_name,  -- ★mig0129
          v_sunit, v_eunit, v_vfee, v_vunit)  -- ★mig0130
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  -- ★10 0153（裁定305-1）: 開栓時の顧客＝check_customers の position 0（checks.customer_id と併存＝同値）
  if p_customer_id is not null then
    insert into public.check_customers (org_id, store_id, check_id, customer_id, position, created_by)
    values (v_org, v_seat.store_id, v_id, p_customer_id, 0, v_actor);
  end if;
  -- ★mig0089: 開卓時に set 行を自動挿入（両モード共通・額>0 のみ＝時間課金を使わない
  --   店は現行同値）。auto 店は以後 check_time_charge_apply が同行を upsert 再計算。
  --   ★mig0130: units は set 実効単位(v_sunit)起点(既存店=billing_unit null→time_per=現行同値)
  v_units := case when v_sunit = 'person' then coalesce(p_people, 1) else 1 end;
  if v_sfee * v_units > 0 then
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            'セット料金(' || v_smin || '分)', v_sfee, v_units, v_sfee * v_units,
            null, 1, true, 'set', 0);  -- ★mig0098 R2-7c: null 再生産の停止（0097b 吸収の本命側）
    perform public.check_recalc(v_id);
    -- ★_r2: 行単位 audit（原則6）。manual 店は apply が来ない＝ここが唯一の書込記録
    perform public.audit_log_write('check_open_set_line',
      'check_lines:' || (select l.id::text from public.check_lines l
                          where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      null,
      (select to_jsonb(l) from public.check_lines l
        where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      v_seat.store_id);
  end if;
  -- ★mig0130(裁定118): vip_charge 行の開栓時1回生成(額>0 のみ実体化・apply 非対象=裁定7)。
  --   kind='charge'・time_auto=true・block_no=0(0097b 教訓: null block_no の再生産禁止・
  --   部分ユニーク3列 (check_id,fee_kind,block_no) where time_auto と整合)・
  --   名称=coalesce(ルール名,'VIPチャージ')。back_snapshot=null=給与不干渉
  if r_vip.rule_id is not null then
    v_vunits := case when v_vunit = 'person' then coalesce(p_people, 1) else 1 end;
    if v_vfee * v_vunits > 0 then
      select r.name into v_vname from public.pricing_rules r where r.id = r_vip.rule_id;
      insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                      name_snapshot, unit_price_snapshot, qty, line_total,
                                      back_snapshot, sort_order, time_auto, fee_kind, block_no)
      values (v_org, v_seat.store_id, v_id, null, 'charge', 'A',
              coalesce(v_vname, 'VIPチャージ'), v_vfee, v_vunits, v_vfee * v_vunits,
              null, 2, true, 'vip_charge', 0)
      returning id into v_vid;
      perform public.check_recalc(v_id);
      -- 行単位 audit(原則6・set 行と同型=apply が来ない行につき唯一の書込記録)
      perform public.audit_log_write('check_open_vip_line',
        'check_lines:' || v_vid::text, null,
        (select to_jsonb(l) from public.check_lines l where l.id = v_vid),
        v_seat.store_id);
    end if;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id)
      || case when p_set_rule_id is not null
              then jsonb_build_object('override_rule_id', p_set_rule_id)
              else '{}'::jsonb end,
    v_seat.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★24 approval_direct（17c5498c）／approval_request（4f099683）＝署名不変 ═══
CREATE OR REPLACE FUNCTION public.approval_direct(p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid; v_line uuid;
  v_staff boolean := false; v_level int := 0; v_cap int := 0;  -- ★24 0175 v2（裁定421 候補）: スタッフの即時適用（上限内）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 直接承認は owner/manager・★24 0175 v2（裁定421 候補）: staff は店設定 sys_staff_discount=1（上限内は即時）のときだけ（自店・can_register・上限と理由は下で）
  if public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id() and public.auth_staff_can_register() then
    select coalesce((s.settings_json->>'sys_staff_discount')::int, 0), coalesce((s.settings_json->>'staff_discount_cap')::int, 0)
      into v_level, v_cap from public.stores s where s.id = v_chk.store_id;
    if v_level = 1 then v_staff := true; end if;
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or v_staff) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  if v_staff then   -- ★24: 上限内だけ即時・理由必須（超過は 'over cap'＝client が申請に回す）
    if v_amount > v_cap then raise exception 'over cap'; end if;
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'reason required'; end if;
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 申請即承認: approved で INSERT → discount line 挿入 → line_id 記録（1トランザクション）
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status,
                                reason, requested_by, decided_by, decided_at, staff_direct)   -- ★24 v2: +staff_direct
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'approved',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor, v_actor, now(), v_staff)
  returning id into v_id;
  v_line := public.approval_apply(v_id);           -- 共通ヘルパー（decide と同一 line 挿入）
  update public.approvals set line_id = v_line where id = v_id;
  perform public.audit_log_write('approval_direct', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.approval_request(p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 申請は黒服 can_register 以上（会計書込ゲート＝check_add_line と同一）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then   -- ★24 0175 v2（裁定420／421）: キャストの申請を撤去（売上を減らす操作は渡さない）
    raise exception 'forbidden';
  end if;
  if public.auth_role() = 'staff' and coalesce((select (s.settings_json->>'sys_staff_discount')::int from public.stores s where s.id = v_chk.store_id), 0) = 2 then
    raise exception 'forbidden';   -- ★24 0175 v2（裁定421 候補）: 2＝不可（ボタンも出さない）
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  -- 割引前小計（既存 discount line は除外）
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;                    -- free は小計を焼付け
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status, reason, requested_by)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'pending',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor)
  returning id into v_id;
  perform public.audit_log_write('approval_request', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★25 auth_cast_register_level（新設・内部専用）／auth_cast_can_register（8ef80d12）／set_store_cast_register（f357f5b9） ═══
CREATE OR REPLACE FUNCTION public.auth_cast_register_level()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ★25 0175 v2（裁定420）: 自店の「キャストのレジ使用」の段階＝0 OFF／1 注文のみ／2 会計まで（旧 cast_register_enabled true＝1）。cast 本人のセッション以外は 0
  select coalesce((select coalesce((s.settings_json->>'sys_cast_register')::int, case when coalesce(s.settings_json->>'cast_register_enabled', '') = 'true' then 1 else 0 end)
                     from public.memberships m
                     join public.users u on u.id = m.user_id
                     join public.stores s on s.id = m.store_id
                    where u.auth_user_id = auth.uid() and u.is_active and m.is_active and m.role = 'cast'
                    limit 1), 0)
$function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.auth_cast_register_level() from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke・grant なし
CREATE OR REPLACE FUNCTION public.auth_cast_can_register()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(m.can_register, false)
         and coalesce((s.settings_json->>'sys_cast_register')::int, case when coalesce(s.settings_json->>'cast_register_enabled', '') = 'true' then 1 else 0 end) > 0   -- ★25 0175 v2（裁定420）: 3 段階（旧 boolean 互換）
  from public.memberships m
  join public.users u on u.id = m.user_id
  join public.stores s on s.id = m.store_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
    and m.role = 'cast'
$function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.set_store_cast_register(p_store_id uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(v_store.settings_json->>'cast_register_enabled', '') = 'true';
  update public.stores
     set settings_json = jsonb_set(jsonb_set(coalesce(settings_json, '{}'::jsonb), '{cast_register_enabled}', to_jsonb(p_enabled), true),
                            '{sys_cast_register}', to_jsonb(case when p_enabled then greatest(1, coalesce((settings_json->>'sys_cast_register')::int, 1)) else 0 end), true)   -- ★25 0175 v2（裁定420）: 互換＝true→1（2 は据え置き）・false→0
   where id = p_store_id;

  perform public.audit_log_write('set_store_cast_register', 'stores:' || p_store_id::text,
    jsonb_build_object('cast_register_enabled', v_prev), jsonb_build_object('cast_register_enabled', p_enabled), p_store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★26 nox_receipt_public（7cd67a3f・anon 白名単 1 号＝RETURNS TABLE が変わるため drop→create・ACL を明示） ═══
drop function if exists public.nox_receipt_public(uuid);
CREATE OR REPLACE FUNCTION public.nox_receipt_public(p_token uuid)
 RETURNS TABLE(store_name text, serial_no text, amount integer, issued_on date, biz_date date, recipient text, proviso text, tax_breakdown jsonb, issuer_snapshot jsonb, payment_method text, issued_hash text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r record;
begin
  if p_token is null then return; end if;
  select ri.serial, ri.amount, ri.issued_at, ri.voided, ri.expires_on,
         ri.store_name_snap, ri.biz_date as bdate,
         ri.recipient, ri.proviso, ri.tax_breakdown, ri.issuer_snapshot, ri.payment_method, ri.issued_hash   -- ★26 0175 v2（裁定422 候補）
    into v_r
    from public.receipt_issues ri
   where ri.token = p_token;
  if v_r.serial is null then return; end if;                                     -- 不在＝空
  if v_r.voided then return; end if;                                             -- void＝空
  if (now() at time zone 'Asia/Tokyo')::date > v_r.expires_on then return; end if;  -- 期限切れ＝空
  return query
  select v_r.store_name_snap,
         'R-' || lpad(v_r.serial::text, 6, '0'),
         v_r.amount,
         (v_r.issued_at at time zone 'Asia/Tokyo')::date,
         v_r.bdate,
         v_r.recipient, v_r.proviso, v_r.tax_breakdown, v_r.issuer_snapshot, v_r.payment_method, v_r.issued_hash;   -- ★26 v2（PII は宛名だけ＝発行者が記録した領収内容・正本B④の範囲内）
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.nox_receipt_public(uuid) from public;
grant execute on function public.nox_receipt_public(uuid) to anon, authenticated;   -- 白名単 1 号（R2-11）＝anon-guard 段43／grants ANON_DEFINER_WHITELIST と同じ

-- ═══ ★26 set_store_invoice_profile（新設・owner） ═══
CREATE OR REPLACE FUNCTION public.set_store_invoice_profile(p_store_id uuid, p_legal_name text, p_trade_name text, p_receipt_default_desc text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★26 0175 v2（裁定422 候補・R-6）: 領収書の発行者情報＝法人名・屋号・但し書きの既定（owner・列・audit）。登録番号は set_store_tax_config（T＋13 桁）のまま
declare
  v_org   uuid := public.auth_org_id();
  v_store record;
  v_ln    text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_tn    text := nullif(trim(coalesce(p_trade_name, '')), '');
  v_dd    text := nullif(trim(coalesce(p_receipt_default_desc, '')), '');
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if v_ln is not null and length(v_ln) > 100 then raise exception 'bad legal_name'; end if;
  if v_tn is not null and length(v_tn) > 100 then raise exception 'bad trade_name'; end if;
  if v_dd is not null and length(v_dd) > 100 then raise exception 'bad receipt_default_desc'; end if;
  select id, org_id, legal_name, trade_name, receipt_default_desc into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;
  update public.stores set legal_name = v_ln, trade_name = v_tn, receipt_default_desc = v_dd where id = p_store_id;
  perform public.audit_log_write('set_store_invoice_profile', 'stores:' || p_store_id::text,
    jsonb_build_object('legal_name', v_store.legal_name, 'trade_name', v_store.trade_name, 'receipt_default_desc', v_store.receipt_default_desc),
    jsonb_build_object('legal_name', v_ln, 'trade_name', v_tn, 'receipt_default_desc', v_dd), p_store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.set_store_invoice_profile(uuid, text, text, text) from public, anon;
grant execute on function public.set_store_invoice_profile(uuid, text, text, text) to authenticated;

-- ═══ ★27 auth_kiosk_operator（cfce7f20）／kiosk_unlock／kiosk_lock（新設・レジ端末の auth ユーザー＝authenticated） ═══
CREATE OR REPLACE FUNCTION public.auth_kiosk_operator()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid  uuid;
  v_user uuid;
  v_seen timestamptz;
begin
  select s.id, s.operator_user_id, s.last_seen_at into v_sid, v_user, v_seen
    from public.kiosk_sessions s
    join public.kiosk_devices k on k.id = s.device_id
   where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register'
     and s.ended_at is null
     and s.last_seen_at > now() - make_interval(secs => coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = k.store_id), 900));   -- ★27 0175 v2（裁定423 候補）: 無操作秒数＝店設定（既定 900＝従来 15 分）
  if v_sid is null then return null; end if;
  if v_seen < now() - interval '60 seconds' then
    update public.kiosk_sessions set last_seen_at = now() where id = v_sid;
  end if;
  return v_user;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.kiosk_unlock(p_pin text, p_membership_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public, extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: レジ端末の解除＝誰かを選ばず PIN だけで本人を特定（staff_pin＝owner／manager／staff can_register／cast can_register かつ店のキャストのレジ使用 ≥1）。
--   一致 0＝wrong_pin（人を特定できないので失敗回数は数えない）・一致 2 人以上で p_membership_id なし＝ambiguous（候補の名前を返す）・特定できたら kiosk_login（失敗回数・ロック・セッション・audit は従来のまま）
declare
  v_device record; v_n int; v_mid uuid; v_cands jsonb;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;
  select count(*), min(m.id), jsonb_agg(jsonb_build_object('membership_id', m.id, 'name', u.name, 'role', m.role))
    into v_n, v_mid, v_cands
    from public.staff_pin sp
    join public.memberships m on m.id = sp.membership_id
    join public.users u on u.id = m.user_id
   where sp.store_id = v_device.store_id and m.is_active and u.is_active
     and (sp.locked_until is null or sp.locked_until < now())
     and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1))
     and sp.pin_hash = crypt(p_pin, sp.pin_hash)
     and (p_membership_id is null or m.id = p_membership_id);
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'wrong_pin'); end if;
  if v_n > 1 then return jsonb_build_object('ok', false, 'reason', 'ambiguous', 'candidates', v_cands); end if;
  return public.kiosk_login(v_mid, p_pin) || jsonb_build_object('idle_sec', coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.kiosk_unlock(text, uuid) from public, anon;
grant execute on function public.kiosk_unlock(text, uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.kiosk_lock(p_reason text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: 解除の終了＝kiosk_logout と同じ処理に終了理由（done 操作完了／idle 無操作／manual 手動）を残す
declare
  v_device record; v_sid uuid; v_op uuid;
begin
  if p_reason is null or p_reason not in ('done','idle','manual') then raise exception 'bad reason'; end if;
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  update public.kiosk_sessions set ended_at = now(), end_reason = p_reason
   where device_id = v_device.id and ended_at is null
  returning id, operator_user_id into v_sid, v_op;
  if v_sid is not null then
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values (v_device.org_id, v_device.store_id, v_op, 'kiosk_lock', 'kiosk_sessions:' || v_sid::text, null,
            jsonb_build_object('kiosk_device_id', v_device.id, 'end_reason', p_reason), null);
  end if;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.kiosk_lock(text) from public, anon;
grant execute on function public.kiosk_lock(text) to authenticated;
CREATE OR REPLACE FUNCTION public.totp_code_of(p_secret_hex text, p_counter bigint)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public, extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補）: RFC 6238／4226＝HMAC-SHA1(secret, counter 8 byte BE) の動的切り出し→6 桁。client（Web Crypto）と同じ式
declare
  v_h bytea; v_off int; v_code bigint;
begin
  v_h := hmac(decode(lpad(to_hex(p_counter), 16, '0'), 'hex'), decode(p_secret_hex, 'hex'), 'sha1');
  v_off := get_byte(v_h, 19) & 15;
  v_code := ((get_byte(v_h, v_off) & 127) << 24) | (get_byte(v_h, v_off + 1) << 16) | (get_byte(v_h, v_off + 2) << 8) | get_byte(v_h, v_off + 3);
  return lpad((v_code % 1000000)::text, 6, '0');
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.totp_code_of(text, bigint) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke・grant なし
CREATE OR REPLACE FUNCTION public.my_qr_secret(p_rotate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public, extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補）: 本人のキオスク用 QR の秘密鍵＝無ければ作る（p_rotate＝作り直す）。戻り＝{membership_id, secret_hex, step 30}（本人のセッションにだけ返す）
declare
  v_mid uuid := public.auth_membership_id(); v_sec text;
begin
  if public.auth_org_id() is null or v_mid is null then raise exception 'forbidden'; end if;
  select qr_secret into v_sec from public.memberships where id = v_mid;
  if v_sec is null or p_rotate then
    v_sec := encode(gen_random_bytes(20), 'hex');
    update public.memberships set qr_secret = v_sec, qr_fail_count = 0, qr_locked_until = null where id = v_mid;
    perform public.audit_log_write('my_qr_secret', 'memberships:' || v_mid::text, null, jsonb_build_object('rotated', p_rotate), public.auth_store_id());
  end if;
  return jsonb_build_object('membership_id', v_mid, 'secret_hex', v_sec, 'step', 30);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.my_qr_secret(boolean) from public, anon;
grant execute on function public.my_qr_secret(boolean) to authenticated;
CREATE OR REPLACE FUNCTION public.kiosk_unlock_qr(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public, extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補）: QR トークン（'noxk:' || membership_id || '.' || 6 桁 TOTP）の照合＝±1 窓（30 秒）・失敗 5 回で 10 分ロック・同じトークンは 1 回だけ（kiosk_sessions.token_hash）・成功＝PIN と同じ解除（unlock_method 'qr'・audit）
declare
  v_device record; v_mid uuid; v_code text; v_m record; v_cnt bigint; v_ok boolean := false; v_hash text; v_sid uuid; v_idle int;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  if p_token is null or p_token !~ '^noxk:[0-9a-f-]{36}\.[0-9]{6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  v_mid := substring(p_token from 6 for 36)::uuid; v_code := right(p_token, 6);
  select m.id, m.user_id, m.role, m.store_id, m.qr_secret, m.qr_fail_count, m.qr_locked_until, u.name as user_name into v_m
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = v_mid and m.store_id = v_device.store_id and m.is_active and u.is_active
     and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1));
  if v_m.id is null or v_m.qr_secret is null then return jsonb_build_object('ok', false, 'reason', 'wrong_token'); end if;
  if v_m.qr_locked_until is not null and v_m.qr_locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_m.qr_locked_until); end if;
  v_cnt := floor(extract(epoch from now()) / 30)::bigint;
  v_ok := v_code in (public.totp_code_of(v_m.qr_secret, v_cnt), public.totp_code_of(v_m.qr_secret, v_cnt - 1), public.totp_code_of(v_m.qr_secret, v_cnt + 1));
  if not v_ok then
    update public.memberships set qr_fail_count = qr_fail_count + 1,
           qr_locked_until = case when qr_fail_count + 1 >= 5 then now() + interval '10 minutes' else qr_locked_until end
     where id = v_m.id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_token');
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if exists (select 1 from public.kiosk_sessions s where s.token_hash = v_hash and s.started_at > now() - interval '5 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'replay');   -- 使い回し＝同じトークンは 1 回だけ
  end if;
  update public.memberships set qr_fail_count = 0 where id = v_m.id;
  update public.kiosk_sessions set ended_at = now(), end_reason = 'relogin' where device_id = v_device.id and ended_at is null;
  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, started_at, last_seen_at, token_hash, unlock_method)
  values (v_device.org_id, v_device.store_id, v_device.id, v_m.id, v_m.user_id, now(), now(), v_hash, 'qr')
  returning id into v_sid;
  insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values (v_device.org_id, v_device.store_id, v_m.user_id, 'kiosk_unlock_qr', 'kiosk_sessions:' || v_sid::text, null,
          jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_m.id, 'unlock_method', 'qr'), null);
  v_idle := coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900);
  return jsonb_build_object('ok', true, 'session_id', v_sid, 'membership_id', v_m.id, 'name', v_m.user_name, 'role', v_m.role, 'idle_sec', v_idle, 'unlock_method', 'qr');
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.kiosk_unlock_qr(text) from public, anon;
grant execute on function public.kiosk_unlock_qr(text) to authenticated;

-- ═══ ★29 便 SH-UI-c2 C2-16（裁定424 候補）: check_group_due（5c667792）＝開いている伝票の丸めは stores の現在値 ═══
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text, p_exclude_pay_fee boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
  v_pf int := 0;   -- ★6 0173（裁定393）: 手数料行の合計（サ料の母数から除く・税の母数には乗る＝内税対象）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- ★29 0175 v2（裁定424 候補・便 SH-UI-c2 C2-16）: 端数調整（丸め単位・丸め方）は凍結しない＝開いている伝票は店設定の現在値を読む（税率・サ料・外税／内税は凍結値のまま）。確定済み（closed）は凍結値＝確定時の額のまま
  select s.round_unit, s.round_mode into v_unit, v_mode
    from public.checks c join public.stores s on s.id = c.store_id
   where c.id = p_check_id and c.status = 'open';
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
     and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 0148 ★10 の referral 除外を削除（kind 'referral' は CHECK から撤去）・★6 0173: 除外指定
  if not p_exclude_pay_fee then
    select coalesce(sum(line_total), 0)::int into v_pf
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and fee_kind = 'pay_fee';   -- ★6 0173
  end if;
  -- ★12 0152（裁定298-9）: burden='customer' の紹介料は pay_group 'A' の小計（サ料・税の母数）に加算（burden='store' は乗らない）
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref
      from public.check_referrals
     where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount';
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  -- ★mig0113: 外税（tax_excluded × taxable のみ）。内税/exempt は下の従来行＝1バイト不変。
  --   規則（設計書 v1 §3 細則）: 税率別に check_tax_round を1回ずつ（伝票×税率×1回＝T5）。
  --   discount は taxable_10 基底へ適用（clamp・8% への按分は F5）。サ料は taxable_10 基底（T6）。
  --   exempt/out_of_scope 行は税 0。TS 鏡像: receipt.ts / check-calc.ts（三面鏡・同時改修）。
  if v_pd = 'tax_excluded' and v_bts = 'taxable' then
    select coalesce(sum(line_total) filter (where tax_category = 'taxable_10'), 0)::int,
           coalesce(sum(line_total) filter (where tax_category = 'taxable_8'),  0)::int
      into v_bx10, v_bx8
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
       and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 同上・★6 0173: 除外指定
    v_bx10 := v_bx10 + v_ref;                                              -- ★12 0152（裁定298-9）: taxable_10 の母数にも加算
    v_sv     := round((v_net - v_pf) * v_rate / 100.0)::int;              -- サ料（従来と同式・★6 0173: 手数料行はサ料の母数から除く＝pay_fee 無しなら同値）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + round((v_net - v_pf) * v_rate / 100.0), v_unit, v_mode);   -- ★6 0173: 同上
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★28 追補 3 R-8（裁定425 候補）: 役割「管理者」＝CHECK・auth_role（db860f0a）・auth_role_raw（新設）・org_billing_select・terms_accept（190912da）・set_membership_role／owner_transfer（新設）・行を読む 4 本（kiosk_login 770d068e／kiosk_operator_list 8958cbc9／staff_pin_status 73bbeb2b／set_staff_pin 52f75768） ═══
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role = any (array['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'cast'::text]));
comment on column public.memberships.role is '★0175 v2（裁定425 候補）: owner／admin（管理者＝owner と同じ権限・解約／削除・移譲・契約と請求・管理者任命の 4 つだけ不可）／manager／staff／cast';
CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when m.role = 'admin' then 'owner' else m.role end   -- ★28 0175 v2（裁定425 候補・R-8）: 管理者＝owner と同じ権限。RLS 70 本・RPC 210 本の owner 判定を書き換えずに広げる＝本来の役割は auth_role_raw()
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.auth_role_raw()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★28 0175 v2（裁定425 候補・R-8）: 本来の役割（admin をそのまま返す）＝owner 限定の 4 つ（店舗の解約／削除・オーナーの変更・契約と請求・管理者の任命と解除）と表示（「管理者」）だけが使う。権限判定は auth_role()
  select m.role
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.auth_role_raw() from public, anon;
grant execute on function public.auth_role_raw() to authenticated;
drop policy if exists org_billing_select on public.org_billing;
create policy org_billing_select on public.org_billing for select to authenticated using (org_id = public.auth_org_id() and public.auth_role_raw() = 'owner');   -- ★28: 契約と請求はオーナー本人だけ（管理者は読めない）
CREATE OR REPLACE FUNCTION public.terms_accept(p_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_user  uuid;
  v_id    uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role_raw() <> 'owner' then raise exception 'forbidden'; end if;   -- 同意は owner（店舗・法人単位）。★28 0175 v2（裁定425 候補）: 契約と請求は管理者に広げない（auth_role_raw）
  if p_version is null or length(trim(p_version)) = 0 or length(p_version) > 40 then raise exception 'bad version'; end if;
  -- billing lock は見ない＝開通前（未課金）でも同意できる（裁定351 の開通ゲート）
  select id into v_id from public.terms_acceptances where org_id = v_org and terms_version = trim(p_version);
  if v_id is not null then return v_id; end if;   -- 冪等
  select id into v_user from public.users where auth_user_id = auth.uid() and is_active;
  if v_user is null then raise exception 'forbidden'; end if;
  insert into public.terms_acceptances (org_id, terms_version, accepted_by) values (v_org, trim(p_version), v_user) returning id into v_id;
  perform public.audit_log_write('terms_accept', 'terms_acceptances:' || v_id::text, null,
    jsonb_build_object('org_id', v_org, 'terms_version', trim(p_version), 'accepted_by', v_user), null);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.set_membership_role(p_membership_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★28 0175 v2（裁定425 候補・R-8）: 役割の変更＝staff／manager／admin。管理者の付与・解除はオーナー本人（auth_role_raw）だけ・staff↔manager はオーナーか管理者（auth_role()='owner'）。
--   owner／cast は対象外（オーナーの変更は owner_transfer・キャストは cast_*）。自分の役割は変えない。audit 'set_membership_role'（by_role＝本来の役割）。既存 staff_change_role（staff↔manager）は不変
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_raw  text := public.auth_role_raw();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;                                       -- owner か admin（auth_role は admin→owner）
  if p_new_role not in ('staff','manager','admin') then raise exception 'bad role'; end if;
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_row.role not in ('staff','manager','admin') then raise exception 'bad target'; end if;         -- owner は移譲（owner_transfer）・cast は対象外
  if (p_new_role = 'admin' or v_row.role = 'admin') and v_raw <> 'owner' then raise exception 'forbidden'; end if;   -- 管理者の任命・解除はオーナーだけ
  if v_row.id = public.auth_membership_id() then raise exception 'self'; end if;
  if v_row.role = p_new_role then raise exception 'no change'; end if;
  update public.memberships set role = p_new_role where id = p_membership_id;
  perform public.audit_log_write('set_membership_role', 'memberships:' || p_membership_id::text,
    jsonb_build_object('role', v_row.role), jsonb_build_object('role', p_new_role, 'by_role', v_raw), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.set_membership_role(uuid, text) from public, anon;
grant execute on function public.set_membership_role(uuid, text) to authenticated;
CREATE OR REPLACE FUNCTION public.owner_transfer(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★28 0175 v2（裁定425 候補・R-8）: オーナーの変更（移譲）＝オーナー本人（auth_role_raw）だけ。相手＝同じ org の有効な admin／manager。相手が owner に・自分は admin に（権限は owner と同じ・契約と請求と任命だけ相手へ）。audit 'owner_transfer'
declare
  v_org uuid := public.auth_org_id();
  v_me  uuid := public.auth_membership_id();
  v_row public.memberships;
begin
  if v_org is null or v_me is null then raise exception 'forbidden'; end if;
  if public.auth_role_raw() <> 'owner' then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org and m.is_active;
  if not found then raise exception 'not found'; end if;
  if v_row.id = v_me then raise exception 'self'; end if;
  if v_row.role not in ('admin','manager') then raise exception 'bad target'; end if;
  update public.memberships set role = 'admin' where id = v_me;
  update public.memberships set role = 'owner' where id = v_row.id;
  perform public.audit_log_write('owner_transfer', 'memberships:' || v_row.id::text,
    jsonb_build_object('from_membership', v_me, 'to_membership', v_row.id, 'to_role_before', v_row.role),
    jsonb_build_object('from_role_after', 'admin', 'to_role_after', 'owner'), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.owner_transfer(uuid) from public, anon;
grant execute on function public.owner_transfer(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.kiosk_login(p_membership_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device  public.kiosk_devices;
  v_mem     record;
  v_pin     public.staff_pin;
  v_ip      text;
  v_sid     uuid;
  v_newfail integer;
  v_settings jsonb;
  v_max     integer;
  v_lock    interval;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  -- ★mig0108（M-11b ②）: ロック閾値を店設定から読む（既定 5回 / 15分＝改稿前のハードコードと同値）
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 15));
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_punch 逐語・PIN 桁数＝cast_pin 現行4桁に揃える＝確定＋）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 操作担当候補＝自店 active membership・owner/manager/staff(can_register)（cast は kiosk 不使用・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'));   -- ★3 0173（389 追補1）: レジ端末の候補に ON のキャスト
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
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
    if v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_login',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null;

  -- ★mig0108（M-11b ①・レジ端末）: 端末の最終アクセスを記録（打刻端末は mig0109 の kiosk_punch 側）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id)
  values (v_device.org_id, v_device.store_id, v_device.id, p_membership_id, v_mem.user_id)
  returning id into v_sid;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'kiosk_login',
     'kiosk_sessions:' || v_sid::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'operator_user_id', v_mem.user_id, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'session_id', v_sid,
                            'operator_name', v_mem.user_name, 'role', v_mem.role,
                            'idle_minutes', 15);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.kiosk_operator_list()
 RETURNS TABLE(membership_id uuid, user_name text, role text, has_pin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, u.name, m.role,
         exists (select 1 from public.staff_pin p where p.membership_id = m.id)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where m.store_id = public.auth_kiosk_register_store_id()
    and m.is_active and u.is_active
    and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
         or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'))   -- ★3 0173（389 追補1）
  order by u.name
$function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.staff_pin_status(p_store_id uuid)
 RETURNS TABLE(membership_id uuid, has_pin boolean, fail_count integer, locked_until timestamp with time zone, pin_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = v_st)) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  return query
  select m.id,
         (p.membership_id is not null),
         coalesce(p.fail_count, 0),
         p.locked_until,
         p.updated_at
    from public.memberships m
    left join public.staff_pin p on p.membership_id = m.id
   where m.store_id = p_store_id
     and m.is_active
     and (m.role in ('owner','admin','manager') or m.role = 'staff'
          or (m.role = 'cast' and m.can_register and coalesce((select s.settings_json->>'cast_register_enabled' from public.stores s where s.id = m.store_id), '') = 'true'))   -- ★3 0173（389 追補1）: PIN 管理の一覧に ON のキャスト・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合）
   order by m.role, m.id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
CREATE OR REPLACE FUNCTION public.set_staff_pin(p_membership_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','admin','manager') or v_mem.role = 'staff' or (v_mem.role = 'cast' and v_mem.can_register)) then   -- ★3 0173（389 追補1）: ON のキャストにレジ端末の PIN・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合・レジ候補は kiosk_login 側で can_register を見る）
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★17 attendance_set（7a56ca05）: 'dohan' 撤去・+help／duty_absent ═══
CREATE OR REPLACE FUNCTION public.attendance_set(p_cast_id uuid, p_date date, p_status text, p_eta text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_status is null or p_status not in ('shukkin','late','off','absent','help','duty_absent') then raise exception 'bad status'; end if;   -- ★17 0175 v2: 'dohan' を撤去（同伴の正本＝伝票 check_nominations.is_dohan・裁定417／PR-1 R-4）・+help（ヘルプ出勤）／duty_absent（従事欠勤）＝日数に数えない（CN-R ⑧）
  if p_eta is not null and p_eta !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad eta'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 台帳 #24 確定: staff（黒服）に開放（出勤板の日次操作＝フロア実務。punch_proxy は manager 維持）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select to_jsonb(a) into v_before from public.attendance a where a.cast_id = p_cast_id and a.date = p_date;
  insert into public.attendance (org_id, store_id, cast_id, date, status, eta, reason, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_status, p_eta, p_reason, 'staff')
  on conflict (cast_id, date) do update
    set status = excluded.status, eta = excluded.eta, reason = excluded.reason, source = 'staff'
  returning id into v_id;
  perform public.audit_log_write('attendance_set', 'attendance:' || v_id::text, v_before,
    (select to_jsonb(a) from public.attendance a where a.id = v_id), v_cast.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★20 daily_pay_issue（94f989f9）＝6 引数（上限の表） ═══
CREATE OR REPLACE FUNCTION public.daily_pay_issue(p_cast_id uuid, p_biz_date date, p_gross integer, p_idem_key uuid, p_kind text DEFAULT 'settlement'::text, p_worked_hours numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast    record;
  v_actor   uuid;
  v_mode    text;
  v_wh      integer;
  v_warn    text;
  v_row     public.daily_pays;
  v_settle  text;   -- ★1 0158（裁定312）: 控除する期（既定＝biz_date の月・当月が paid なら翌月）
  v_carry   text;   -- ★1 0158: 繰り下げ先（繰り下げたときだけ）
  v_cap     integer; -- ★20 0175 v2（CN-R ⑳ LunaNox）: 勤務時間で変わる日払いの上限（店設定 daily_pay_cap_tiers・p_worked_hours で読む）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_gross is null or p_gross <= 0 then raise exception 'bad amount'; end if;
  if p_kind is null or p_kind not in ('settlement','advance') then raise exception 'bad kind'; end if;   -- ★1 0172
  select id, org_id, store_id, is_active into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  -- ★20 0175 v2（CN-R ⑳）: 上限の表（[{hours_min, cap}]・hours_min 昇順）があり p_worked_hours が渡されたら、hours_min ≤ 勤務時間 の最大段の cap を超える gross は 'over cap'。表が空／hours null＝上限なし（従来）
  if p_kind = 'settlement' then
    select (t->>'cap')::int into v_cap
      from public.stores s, jsonb_array_elements(coalesce(s.settings_json->'daily_pay_cap_tiers', '[]'::jsonb)) t
     where s.id = v_cast.store_id and p_worked_hours is not null and (t->>'hours_min')::numeric <= p_worked_hours
     order by (t->>'hours_min')::numeric desc limit 1;
    if v_cap is not null and p_gross > v_cap then raise exception 'over cap'; end if;
  end if;
  -- 冪等（org／ロール照合の後）: 同キー再送は既存行を返す（別 cast のキー再利用は拒否）
  select * into v_row from public.daily_pays where idem_key = p_idem_key;
  if v_row.id is not null then
    if v_row.cast_id <> p_cast_id then raise exception 'bad idem key'; end if;
    return jsonb_build_object('id', v_row.id, 'cast_id', v_row.cast_id, 'biz_date', v_row.biz_date, 'gross', v_row.gross,
      'withholding', v_row.withholding, 'withholding_category', v_row.withholding_category, 'net', v_row.net, 'warn', null, 'replay', true, 'kind', v_row.kind,   -- ★1 0172
      'settle_period', coalesce(v_row.settle_period, to_char(v_row.biz_date, 'YYYY-MM')),                                           -- ★1 0158
      'carried_to', case when v_row.settle_period is not null and v_row.settle_period <> to_char(v_row.biz_date, 'YYYY-MM') then v_row.settle_period end);   -- ★1 0158
  end if;
  -- paid 期間ガード（adv_issue 同型＝凍結済み期に stranded な日払いを作らない）
  v_settle := to_char(p_biz_date, 'YYYY-MM');   -- ★1 0158
  if exists (select 1 from public.payroll_runs
             where store_id = v_cast.store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    -- ★1 0158（裁定312）: 当月が支払済み＝翌月の給与から控除（settle_period＝翌月）。翌月も支払済みなら拒否
    v_carry := to_char((date_trunc('month', p_biz_date) + interval '1 month'), 'YYYY-MM');
    if exists (select 1 from public.payroll_runs
               where store_id = v_cast.store_id and period = v_carry and status = 'paid') then
      raise exception 'paid period';
    end if;
    v_settle := v_carry;
  end if;
  -- 源泉区分＝cast_tax_profiles.mode（無ければ '委託'）。委託＝月次 run と同式（lib/nox/pay.ts withholdingOf）を日数 1 で写経＝
  --   floor(max(0, gross − 5,000 × 1) × 0.1021)・double precision（TS の Number と同じ IEEE754）・1 円未満切捨て（309 追補2 (c)）。雇用＝0（T10 回答まで）＋warn
  select coalesce(t.mode, '委託') into v_mode from (select 1) x left join public.cast_tax_profiles t on t.cast_id = p_cast_id;
  if p_kind = 'advance' then
    v_wh := 0; v_warn := null;   -- ★1 0172（裁定349）: 前払・仮払＝控除なし（期の精算で控除）
  elsif v_mode = '雇用' then
    v_wh := 0; v_warn := 'T10 pending';
  else
    v_wh := floor(greatest(0, p_gross - 5000)::double precision * 0.1021)::int; v_warn := null;
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_pays (org_id, store_id, cast_id, biz_date, gross, withholding, withholding_category, net, paid_by, idem_key, settle_period, kind)   -- ★1 0158: +settle_period・★1 0172: +kind
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_biz_date, p_gross, v_wh, v_mode, p_gross - v_wh, v_actor, p_idem_key, v_settle, p_kind)   -- ★1 0172
  returning * into v_row;
  perform public.audit_log_write('daily_pay_issue', 'daily_pays:' || v_row.id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross, 'withholding', v_wh,
                       'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn,
                       'settle_period', v_settle, 'carried_to', v_carry, 'kind', p_kind), v_cast.store_id);   -- ★1 0158・★1 0172: +kind
  return jsonb_build_object('id', v_row.id, 'cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross,
    'withholding', v_wh, 'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn, 'replay', false,
    'settle_period', v_settle, 'carried_to', v_carry, 'kind', p_kind);   -- ★1 0158・★1 0172: +kind
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.daily_pay_issue(uuid, date, integer, uuid, text, numeric) from public, anon;
grant execute on function public.daily_pay_issue(uuid, date, integer, uuid, text, numeric) to authenticated;

-- ═══ ★12 comp_plan_pay_rate_check（内部）・comp_plan_ext_set（新設・owner） ═══
CREATE OR REPLACE FUNCTION public.comp_plan_pay_rate_check(p_tiers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
-- ★12 0175 v2（CN-R ⑥⑰）: 報酬率スライドの段＝array（at_pct 昇順 strict・0〜300）。各段の鍵＝at_pct（必須）・up_amount（決定時給への累積加算・円）・back_mult（バック倍率 %・0〜100）・pay_pct（支給率 %・0〜100・該当期の総報酬に掛ける）・
--   wage_cut_pct（時給の減率 %・⑰(a)）・hon_back_rate（本指名小計の率 %・⑰(a)）・days_min（⑰(b) 日数区分の下限）・back_gate_pct（⑰(b) バック支給の給率閾値）。最大 10 段。内部ヘルパー
declare
  v_e jsonb; v_k text; v_prev numeric := null; v_at numeric;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then raise exception 'bad pay_rate_tiers'; end if;
  if jsonb_array_length(p_tiers) > 10 then raise exception 'bad pay_rate_tiers'; end if;
  for v_e in select * from jsonb_array_elements(p_tiers) loop
    if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e->'at_pct') <> 'number' then raise exception 'bad pay_rate_tiers'; end if;
    for v_k in select jsonb_object_keys(v_e) loop
      if v_k not in ('at_pct','up_amount','back_mult','pay_pct','wage_cut_pct','hon_back_rate','days_min','back_gate_pct','bonus_pct','down_amount') then raise exception 'bad pay_rate_tiers'; end if;   -- ★v2 最終（CSV DAYTONA）: bonus_pct＝小計の n% ボーナス・down_amount＝決定時給の減額（円）
      if jsonb_typeof(v_e->v_k) <> 'number' or (v_e->>v_k)::numeric < 0 then raise exception 'bad pay_rate_tiers'; end if;
      if v_k in ('back_mult','pay_pct','wage_cut_pct','hon_back_rate','back_gate_pct','bonus_pct') and (v_e->>v_k)::numeric > 100 then raise exception 'bad pay_rate_tiers'; end if;
    end loop;
    v_at := (v_e->>'at_pct')::numeric;
    if v_at > 300 then raise exception 'bad pay_rate_tiers'; end if;
    if v_prev is not null and v_at <= v_prev then raise exception 'bad pay_rate_tiers'; end if;
    v_prev := v_at;
  end loop;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.comp_plan_pay_rate_check(jsonb) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke・grant なし
CREATE OR REPLACE FUNCTION public.comp_plan_ext_set(p_plan_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★12 0175 v2（CN-R ⑥⑦⑬⑭⑮⑰⑱⑳）: CANON 拡張の列を jsonb patch で書く（set_comp_plan の引数は増やさない＝overload 罠を避ける）。owner のみ（set_comp_plan と同格）・鍵が無い列は変えない・audit。
--   鍵＝pay_rate_tiers（comp_plan_pay_rate_check）／slide_streak_n（1〜12・連続 N 期）／reward_axis（sales／pt／pay_rate／null＝店の軸・裁定412 追補）／assess_grace_months（0〜24・入店後 N か月は査定免除）／
--       hon_back_unit／jonai_back_unit／dohan_back_unit（per_check／per_hour／per_30min／per_extension／per_set）／product_back_rate_by_kind（{free,hon,jonai,vip}＝%）／product_back_fixed_vip（円）／product_back_rate_vip（%）／
--       reservation_back_tiers（[{at, rate}]＝小計帯ごとの率・at 昇順・SNACK CITY）
declare
  v_org uuid := public.auth_org_id();
  v_row record; v_k text; v_before jsonb; v_after jsonb; v_e jsonb; v_prev numeric;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  select * into v_row from public.comp_plans where id = p_plan_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('pay_rate_tiers','slide_streak_n','reward_axis','assess_grace_months','hon_back_unit','jonai_back_unit','dohan_back_unit','product_back_rate_by_kind','product_back_fixed_vip','product_back_rate_vip','reservation_back_tiers','back_rate_tiers') then raise exception 'bad key'; end if;
  end loop;
  if p_patch ? 'pay_rate_tiers' then perform public.comp_plan_pay_rate_check(p_patch->'pay_rate_tiers'); end if;
  if p_patch ? 'slide_streak_n' and (jsonb_typeof(p_patch->'slide_streak_n') <> 'number' or (p_patch->>'slide_streak_n')::numeric not between 1 and 12 or (p_patch->>'slide_streak_n')::numeric <> floor((p_patch->>'slide_streak_n')::numeric)) then raise exception 'bad slide_streak_n'; end if;
  if p_patch ? 'reward_axis' and jsonb_typeof(p_patch->'reward_axis') <> 'null' and (p_patch->>'reward_axis') not in ('sales','pt','pay_rate') then raise exception 'bad reward_axis'; end if;
  if p_patch ? 'assess_grace_months' and (jsonb_typeof(p_patch->'assess_grace_months') <> 'number' or (p_patch->>'assess_grace_months')::numeric not between 0 and 24 or (p_patch->>'assess_grace_months')::numeric <> floor((p_patch->>'assess_grace_months')::numeric)) then raise exception 'bad assess_grace_months'; end if;
  for v_k in select unnest(array['hon_back_unit','jonai_back_unit','dohan_back_unit']) loop
    if p_patch ? v_k and (p_patch->>v_k) not in ('per_check','per_hour','per_30min','per_extension','per_set','hourly_add') then raise exception 'bad back_unit'; end if;   -- ★v2 最終（CSV BELLEZZA）: hourly_add＝額を当日の時給に加算（本指名 1 件で当日時給 +200 円）
  end loop;
  if p_patch ? 'product_back_rate_by_kind' then
    if jsonb_typeof(p_patch->'product_back_rate_by_kind') <> 'object' then raise exception 'bad product_back_rate_by_kind'; end if;
    for v_k in select jsonb_object_keys(p_patch->'product_back_rate_by_kind') loop
      if v_k not in ('free','hon','jonai','vip') or jsonb_typeof(p_patch->'product_back_rate_by_kind'->v_k) <> 'number' or (p_patch->'product_back_rate_by_kind'->>v_k)::numeric not between 0 and 100 then raise exception 'bad product_back_rate_by_kind'; end if;
    end loop;
  end if;
  if p_patch ? 'product_back_fixed_vip' and jsonb_typeof(p_patch->'product_back_fixed_vip') <> 'null' and (jsonb_typeof(p_patch->'product_back_fixed_vip') <> 'number' or (p_patch->>'product_back_fixed_vip')::numeric < 0) then raise exception 'bad product_back_fixed_vip'; end if;
  if p_patch ? 'product_back_rate_vip' and jsonb_typeof(p_patch->'product_back_rate_vip') <> 'null' and (jsonb_typeof(p_patch->'product_back_rate_vip') <> 'number' or (p_patch->>'product_back_rate_vip')::numeric not between 0 and 100) then raise exception 'bad product_back_rate_vip'; end if;
  -- ★v2 最終（CSV SCANDAL）: back_rate_tiers＝{hon:[{at, rate}], jonai:[{at, rate}]}（売上小計帯→バック率・at 昇順・各 10 段まで）
  if p_patch ? 'back_rate_tiers' then
    if jsonb_typeof(p_patch->'back_rate_tiers') <> 'object' then raise exception 'bad back_rate_tiers'; end if;
    for v_k in select jsonb_object_keys(p_patch->'back_rate_tiers') loop
      if v_k not in ('hon','jonai') or jsonb_typeof(p_patch->'back_rate_tiers'->v_k) <> 'array' or jsonb_array_length(p_patch->'back_rate_tiers'->v_k) > 10 then raise exception 'bad back_rate_tiers'; end if;
      v_prev := null;
      for v_e in select * from jsonb_array_elements(p_patch->'back_rate_tiers'->v_k) loop
        if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e->'at') <> 'number' or jsonb_typeof(v_e->'rate') <> 'number' or (select count(*) from jsonb_object_keys(v_e)) <> 2 then raise exception 'bad back_rate_tiers'; end if;
        if (v_e->>'at')::numeric < 0 or (v_e->>'rate')::numeric not between 0 and 100 then raise exception 'bad back_rate_tiers'; end if;
        if v_prev is not null and (v_e->>'at')::numeric <= v_prev then raise exception 'bad back_rate_tiers'; end if;
        v_prev := (v_e->>'at')::numeric;
      end loop;
    end loop;
  end if;
  if p_patch ? 'reservation_back_tiers' then
    if jsonb_typeof(p_patch->'reservation_back_tiers') <> 'array' or jsonb_array_length(p_patch->'reservation_back_tiers') > 10 then raise exception 'bad reservation_back_tiers'; end if;
    v_prev := null;
    for v_e in select * from jsonb_array_elements(p_patch->'reservation_back_tiers') loop
      if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e->'at') <> 'number' or jsonb_typeof(v_e->'rate') <> 'number' or (select count(*) from jsonb_object_keys(v_e)) <> 2 then raise exception 'bad reservation_back_tiers'; end if;
      if (v_e->>'at')::numeric < 0 or (v_e->>'rate')::numeric not between 0 and 100 then raise exception 'bad reservation_back_tiers'; end if;
      if v_prev is not null and (v_e->>'at')::numeric <= v_prev then raise exception 'bad reservation_back_tiers'; end if;
      v_prev := (v_e->>'at')::numeric;
    end loop;
  end if;
  v_before := to_jsonb(v_row);
  update public.comp_plans set
    pay_rate_tiers           = case when p_patch ? 'pay_rate_tiers'           then p_patch->'pay_rate_tiers' else pay_rate_tiers end,
    slide_streak_n           = case when p_patch ? 'slide_streak_n'           then (p_patch->>'slide_streak_n')::smallint else slide_streak_n end,
    reward_axis              = case when p_patch ? 'reward_axis'              then nullif(p_patch->>'reward_axis', '') else reward_axis end,
    assess_grace_months      = case when p_patch ? 'assess_grace_months'      then (p_patch->>'assess_grace_months')::smallint else assess_grace_months end,
    hon_back_unit            = case when p_patch ? 'hon_back_unit'            then p_patch->>'hon_back_unit' else hon_back_unit end,
    jonai_back_unit          = case when p_patch ? 'jonai_back_unit'          then p_patch->>'jonai_back_unit' else jonai_back_unit end,
    dohan_back_unit          = case when p_patch ? 'dohan_back_unit'          then p_patch->>'dohan_back_unit' else dohan_back_unit end,
    product_back_rate_by_kind = case when p_patch ? 'product_back_rate_by_kind' then p_patch->'product_back_rate_by_kind' else product_back_rate_by_kind end,
    product_back_fixed_vip   = case when p_patch ? 'product_back_fixed_vip'   then nullif(p_patch->>'product_back_fixed_vip', '')::int else product_back_fixed_vip end,
    product_back_rate_vip    = case when p_patch ? 'product_back_rate_vip'    then nullif(p_patch->>'product_back_rate_vip', '')::numeric else product_back_rate_vip end,
    reservation_back_tiers   = case when p_patch ? 'reservation_back_tiers'   then p_patch->'reservation_back_tiers' else reservation_back_tiers end,
    back_rate_tiers          = case when p_patch ? 'back_rate_tiers'          then p_patch->'back_rate_tiers' else back_rate_tiers end,   -- ★v2 最終（SCANDAL）
    updated_at = now()
  where id = p_plan_id;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = p_plan_id;
  perform public.audit_log_write('comp_plan_ext_set', 'comp_plans:' || p_plan_id::text, v_before, v_after, v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.comp_plan_ext_set(uuid, jsonb) from public, anon;
grant execute on function public.comp_plan_ext_set(uuid, jsonb) to authenticated;

-- ═══ ★13／★14／★19 plan_rate_band_set・plan_norm_tier_set・plan_event_bonus_set（新設・owner） ═══
CREATE OR REPLACE FUNCTION public.plan_rate_band_set(p_plan_id uuid, p_rows jsonb, p_target text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★13 0175 v2（CN-R ④⑯）: 時間帯テーブル＝対象（hourly／hon_back／jonai_back／dohan_back／drink_back）ごとに全置換。from_min／to_min は店の営業日の分（0〜2880・翌日またぎ＝1440+）。判定時刻＝バックは着席（checks.started_at）・時給は勤務時刻（計算側 P175）。
--   hourly の value_amount 0＝時給停止（BELLEZZA 24 時以降）。帯の隙間は直前の帯を引き継ぐ（相談役案・店に確認）。owner のみ・audit
declare
  v_org uuid := public.auth_org_id();
  v_row record; v_e jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'bad rows'; end if;
  select * into v_row from public.comp_plans where id = p_plan_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if p_target is null or p_target not in ('hourly','hon_back','jonai_back','dohan_back','drink_back') then raise exception 'bad target'; end if;
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'bad rows'; end if;
    if jsonb_typeof(v_e->'from_min') <> 'number' or jsonb_typeof(v_e->'to_min') <> 'number' then raise exception 'bad rows'; end if;
    if (v_e->>'from_min')::int < 0 or (v_e->>'from_min')::int > 2879 or (v_e->>'to_min')::int <= (v_e->>'from_min')::int or (v_e->>'to_min')::int > 2880 then raise exception 'bad band'; end if;
    if (v_e ? 'value_amount') = (v_e ? 'value_rate') then raise exception 'bad band value'; end if;   -- 額か率のどちらか 1 つ（時給＝額・0＝停止／バック＝率か額）
    if v_e ? 'value_amount' and (jsonb_typeof(v_e->'value_amount') <> 'number' or (v_e->>'value_amount')::numeric < 0) then raise exception 'bad band value'; end if;
    if v_e ? 'value_rate' and (jsonb_typeof(v_e->'value_rate') <> 'number' or (v_e->>'value_rate')::numeric not between 0 and 100) then raise exception 'bad band value'; end if;
  end loop;
  delete from public.plan_rate_bands where plan_id = p_plan_id and target = p_target;
  insert into public.plan_rate_bands (org_id, store_id, plan_id, target, from_min, to_min, value_amount, value_rate, priority)
  select v_org, v_row.store_id, p_plan_id, p_target, (e->>'from_min')::int, (e->>'to_min')::int, nullif(e->>'value_amount', '')::int, nullif(e->>'value_rate', '')::numeric, coalesce((e->>'priority')::int, 100) from jsonb_array_elements(p_rows) e;
  perform public.audit_log_write('plan_rate_band_set', 'comp_plans:' || p_plan_id::text, null, jsonb_build_object('target', p_target, 'rows', p_rows), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.plan_rate_band_set(uuid, jsonb, text) from public, anon;
grant execute on function public.plan_rate_band_set(uuid, jsonb, text) to authenticated;
CREATE OR REPLACE FUNCTION public.plan_norm_tier_set(p_plan_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★14 0175 v2（CN-R ⑤⑪）: 日数＋時間のノルマを「週の出勤日数の目安（availability_terms.week_days_target）」の区分別に持つ（W1〜3＝15 日 30h 等）。表の値は月間＝判定期間の長さに比例（半月＝半分・端数切上＝計算側）。未達は UP 側だけ停止（⑪）。owner のみ・全置換・audit
declare
  v_org uuid := public.auth_org_id();
  v_row record; v_e jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'bad rows'; end if;
  select * into v_row from public.comp_plans where id = p_plan_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'bad rows'; end if;
    if jsonb_typeof(v_e->'week_days_min') <> 'number' or jsonb_typeof(v_e->'week_days_max') <> 'number' or jsonb_typeof(v_e->'days_required') <> 'number' or jsonb_typeof(v_e->'hours_required') <> 'number' then raise exception 'bad rows'; end if;
    if (v_e->>'week_days_min')::int not between 0 and 7 or (v_e->>'week_days_max')::int not between 0 and 7 or (v_e->>'week_days_max')::int < (v_e->>'week_days_min')::int then raise exception 'bad tier'; end if;
    if (v_e->>'days_required')::numeric < 0 or (v_e->>'hours_required')::numeric < 0 then raise exception 'bad tier'; end if;
  end loop;
  delete from public.plan_norm_tiers where plan_id = p_plan_id;
  insert into public.plan_norm_tiers (org_id, store_id, plan_id, week_days_min, week_days_max, days_required, hours_required)
  select v_org, v_row.store_id, p_plan_id, (e->>'week_days_min')::smallint, (e->>'week_days_max')::smallint, (e->>'days_required')::int, (e->>'hours_required')::numeric from jsonb_array_elements(p_rows) e;
  perform public.audit_log_write('plan_norm_tier_set', 'comp_plans:' || p_plan_id::text, null, jsonb_build_object('rows', p_rows), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.plan_norm_tier_set(uuid, jsonb) from public, anon;
grant execute on function public.plan_norm_tier_set(uuid, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.plan_event_bonus_set(p_plan_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★19 0175 v2（CN-R ⑳ DAYTONA／CLASS）: イベント加算＝kind birthday（キャスト本人の誕生日＝cast_sensitive.birthday・率か額）／date_range（毎月 day_from〜day_to・CLASS 1〜7 日の同伴加算）・対象バック（hon／jonai／dohan／drink／all）・加算は率か額のどちらか。owner のみ・全置換・audit
declare
  v_org uuid := public.auth_org_id();
  v_row record; v_e jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'bad rows'; end if;
  select * into v_row from public.comp_plans where id = p_plan_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e) <> 'object' then raise exception 'bad rows'; end if;
    if (v_e->>'kind') not in ('birthday','date_range') or (v_e->>'target') not in ('hon','jonai','dohan','drink','all') then raise exception 'bad rows'; end if;
    if (v_e->>'kind') = 'date_range' and (jsonb_typeof(v_e->'day_from') <> 'number' or jsonb_typeof(v_e->'day_to') <> 'number' or (v_e->>'day_from')::int not between 1 and 31 or (v_e->>'day_to')::int not between 1 and 31 or (v_e->>'day_to')::int < (v_e->>'day_from')::int) then raise exception 'bad range'; end if;
    if (v_e ? 'add_rate') = (v_e ? 'add_amount') then raise exception 'bad add'; end if;
    if v_e ? 'add_rate' and (jsonb_typeof(v_e->'add_rate') <> 'number' or (v_e->>'add_rate')::numeric not between 0 and 100) then raise exception 'bad add'; end if;
    if v_e ? 'add_amount' and (jsonb_typeof(v_e->'add_amount') <> 'number' or (v_e->>'add_amount')::numeric < 0) then raise exception 'bad add'; end if;
  end loop;
  delete from public.plan_event_bonuses where plan_id = p_plan_id;
  insert into public.plan_event_bonuses (org_id, store_id, plan_id, kind, day_from, day_to, target, add_rate, add_amount, label)
  select v_org, v_row.store_id, p_plan_id, e->>'kind', nullif(e->>'day_from', '')::smallint, nullif(e->>'day_to', '')::smallint, e->>'target', nullif(e->>'add_rate', '')::numeric, nullif(e->>'add_amount', '')::int, left(nullif(trim(coalesce(e->>'label', '')), ''), 40) from jsonb_array_elements(p_rows) e;
  perform public.audit_log_write('plan_event_bonus_set', 'comp_plans:' || p_plan_id::text, null, jsonb_build_object('rows', p_rows), v_row.store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.plan_event_bonus_set(uuid, jsonb) from public, anon;
grant execute on function public.plan_event_bonus_set(uuid, jsonb) to authenticated;

-- ═══ ★15 slide_decision_propose／decide（新設） ═══
CREATE OR REPLACE FUNCTION public.slide_decision_propose(p_plan_id uuid, p_cast_id uuid, p_period_key text, p_direction text, p_tier_idx integer, p_streak integer, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★15 0175 v2（CN-R ⑦⑬）: スライドの判定ログ＋提案＝期（period_key＝'2026-10'／'2026-10-H2' 等・プランの判定期間）ごとに方向（up／hold／assess）・段・連続期数（streak）を 1 行。同じ (plan, cast, period) は上書き（提案中のみ）。
--   提案は自動確定しない＝店が slide_decision_decide で適用／除外（理由必須）。owner／自店 manager（給与画面の要対応から）
declare
  v_org uuid := public.auth_org_id();
  v_store uuid; v_id uuid;
begin
  if v_org is null or public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_direction is null or p_direction not in ('up','hold','assess') then raise exception 'bad direction'; end if;
  if p_period_key is null or p_period_key !~ '^[0-9]{4}-[0-9]{2}(-H[12]|-W[0-9]{2})?$' then raise exception 'bad period_key'; end if;
  if p_streak is null or p_streak < 0 or p_tier_idx is null or p_tier_idx < 0 then raise exception 'bad input'; end if;
  select store_id into v_store from public.comp_plans where id = p_plan_id and org_id = v_org;
  if v_store is null then raise exception 'not found'; end if;
  if public.auth_role() = 'manager' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.casts c where c.id = p_cast_id and c.store_id = v_store) then raise exception 'cast not found'; end if;
  insert into public.slide_decisions (org_id, store_id, plan_id, cast_id, period_key, direction, tier_idx, streak, detail)
  values (v_org, v_store, p_plan_id, p_cast_id, p_period_key, p_direction, p_tier_idx, p_streak, coalesce(p_detail, '{}'::jsonb))
  on conflict (plan_id, cast_id, period_key) do update
    set direction = excluded.direction, tier_idx = excluded.tier_idx, streak = excluded.streak, detail = excluded.detail, proposed_at = now()
    where slide_decisions.applied_at is null and slide_decisions.excluded_at is null
  returning id into v_id;
  if v_id is null then raise exception 'already decided'; end if;
  perform public.audit_log_write('slide_decision_propose', 'slide_decisions:' || v_id::text, null,
    jsonb_build_object('plan_id', p_plan_id, 'cast_id', p_cast_id, 'period_key', p_period_key, 'direction', p_direction, 'tier_idx', p_tier_idx, 'streak', p_streak), v_store);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.slide_decision_propose(uuid, uuid, text, text, integer, integer, jsonb) from public, anon;
grant execute on function public.slide_decision_propose(uuid, uuid, text, text, integer, integer, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.slide_decision_decide(p_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★15 0175 v2（CN-R ⑬・裁定410 追補と同じ形）: 提案を店が適用（apply）／除外（exclude・理由必須）。適用＝up なら cast_rate_history に slide_up 1 行（valid_from＝次の期の初日＝detail.effective_from・client が渡す）。owner／自店 manager・audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_r record; v_actor uuid; v_eff date;
begin
  if v_org is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_action is null or p_action not in ('apply','exclude') then raise exception 'bad action'; end if;
  if p_action = 'exclude' and (p_reason is null or length(trim(p_reason)) not between 1 and 200) then raise exception 'reason required'; end if;
  select * into v_r from public.slide_decisions where id = p_id and org_id = v_org for update;
  if v_r.id is null then raise exception 'not found'; end if;
  if v_role = 'manager' and v_r.store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if v_r.applied_at is not null or v_r.excluded_at is not null then raise exception 'already decided'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_action = 'apply' then
    update public.slide_decisions set applied_at = now(), decided_by = v_actor, reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_id;
    if v_r.direction = 'up' and (v_r.detail->>'up_amount') is not null then
      v_eff := coalesce(nullif(v_r.detail->>'effective_from', '')::date, (now() at time zone 'Asia/Tokyo')::date);
      insert into public.cast_rate_history (org_id, store_id, cast_id, kind, rate, valid_from, valid_to, source, decision_id, created_by)
      values (v_org, v_r.store_id, v_r.cast_id, 'slide_up', (v_r.detail->>'up_amount')::int, v_eff, null, 'slide', p_id, v_actor);
    end if;
  else
    update public.slide_decisions set excluded_at = now(), decided_by = v_actor, reason = trim(p_reason) where id = p_id;
  end if;
  perform public.audit_log_write('slide_decision_decide', 'slide_decisions:' || p_id::text, to_jsonb(v_r),
    jsonb_build_object('action', p_action, 'direction', v_r.direction, 'cast_id', v_r.cast_id, 'period_key', v_r.period_key), v_r.store_id, nullif(trim(coalesce(p_reason, '')), ''));
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.slide_decision_decide(uuid, text, text) from public, anon;
grant execute on function public.slide_decision_decide(uuid, text, text) to authenticated;

-- ═══ ★16 cast_rate_history_add（新設） ═══
CREATE OR REPLACE FUNCTION public.cast_rate_history_add(p_cast_id uuid, p_kind text, p_rate integer, p_valid_from date, p_valid_to date DEFAULT NULL::date, p_source text DEFAULT 'manual'::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★16 0175 v2（CN-R ⑫・PR-1 の時給の変更履歴）: 日付付きの時給の履歴＝kind base（基本時給の変更）／slide_up（決定時給への累積加算＝額）／guarantee（保証の開始〜終了＝set_cast_guarantee と並走・P175 で統合）／manual（手動）。
--   owner／自店 manager・valid_to ≥ valid_from・audit。計算側（R-2 の rate(d)）が P175 後にこの表を読む（それまでは cast_plan の保証行と段）
declare
  v_org uuid := public.auth_org_id();
  v_cast record; v_id uuid; v_actor uuid;
begin
  if v_org is null or public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_kind is null or p_kind not in ('base','slide_up','guarantee','manual') then raise exception 'bad kind'; end if;
  if p_rate is null or p_rate < 0 or p_rate > 100000 then raise exception 'bad rate'; end if;
  if p_valid_from is null or (p_valid_to is not null and p_valid_to < p_valid_from) then raise exception 'bad range'; end if;
  if p_source is null or p_source not in ('manual','slide','guarantee','plan') then raise exception 'bad source'; end if;
  select id, org_id, store_id into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if public.auth_role() = 'manager' and v_cast.store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.cast_rate_history (org_id, store_id, cast_id, kind, rate, valid_from, valid_to, source, note, created_by)
  values (v_org, v_cast.store_id, p_cast_id, p_kind, p_rate, p_valid_from, p_valid_to, p_source, left(nullif(trim(coalesce(p_note, '')), ''), 200), v_actor)
  returning id into v_id;
  perform public.audit_log_write('cast_rate_history_add', 'cast_rate_history:' || v_id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'kind', p_kind, 'rate', p_rate, 'valid_from', p_valid_from, 'valid_to', p_valid_to, 'source', p_source), v_cast.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける
revoke execute on function public.cast_rate_history_add(uuid, text, integer, date, date, text, text) from public, anon;
grant execute on function public.cast_rate_history_add(uuid, text, integer, date, date, text, text) to authenticated;

commit;

-- ===== verify =====（Success の後に 1 文で貼る＝docs/demo/verify_0175.sql と同じ・Supabase SQL Editor は最後の文の結果しか返さない）
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'tables', count(*)::text from pg_tables where schemaname='public' and tablename in ('punch_round_consents','availability','availability_terms')
-- union all select 'cols stores punch', count(*)::text from information_schema.columns where table_name='stores' and column_name like 'punch\_%' and column_name <> 'punch_methods'
-- union all select 'fn args', string_agg(proname || '/' || pronargs, ',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('check_pay','receipt_issue','set_comp_plan','payroll_adjustment_add','punch_self','daily_pay_issue')
-- union all select 'slide_method', string_agg(slide_method || ':' || n, ',') from (select slide_method, count(*) n from public.comp_plans group by 1 order by 1) x
-- union all select 'authenticated select only', (select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name in ('availability','availability_terms','punch_round_consents'))
-- union all select 'price_display default', column_default from information_schema.columns where table_name='stores' and column_name='price_display';
-- ===== end 0175 =====
