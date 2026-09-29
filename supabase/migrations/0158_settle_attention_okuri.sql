-- 0158_settle_attention_okuri.sql
-- マイグレーション名: 0158_settle_attention_okuri（裁定312・314・315・316・317・319＋追補1・起票87）
-- 生成器: docs/tmp/gen_0158.mjs（手打ち禁止）。写経元＝docs/tmp/0158_live.json（q0929_live_0158.mjs が pg_get_functiondef で dump した live 全文・CR 除去）。
--   既存関数は ★ の置換点以外 1 バイト不変（299-11）。新設はこのテンプレート内に手書き・期待 md5 は生成物から算出。
--
-- 写経元 live md5（2026-09-29・prosrc の CR 除去・先頭 8 桁）→ 本 mig 適用後の期待 md5:
--   adv_issue                 b8568921 → f25d845d
--   adv_issue_bulk            18899985 → 0e2044cc
--   daily_pay_issue           bac429f9 → 7e9d29d0
--   daily_pays_of_run         da3d45a0 → b81e8659
--   punch_correction_request  302a9d19 → 2588fd86
--   punch_correction_decide   1bf1ee73 → e5dc188e
--   punch_correction_apply    47853cfe → 857dd4cf
--   payroll_finalize          f1c27f08 → e402804d
--   set_store_profile         86a7a86b → 4f2e9f82
--   kiosk_register_state      e01d2b83 → a4426533
--   bottle_keep_register      03ff8bca → e9028559
--   新設 5 本: payroll_attentions_of 04d88b37／payroll_attention_resolve 01b27881／transport_issue_self 2eebb64f／kiosk_transport_issue 76412c7e／kiosk_punch_state 48300293
--   不触の控え（適用後も不変であること）: payroll_mark_paid 409c9770／payroll_reopen 80f042e4／transport_issue_bulk 9d10c990／transport_issue 7740e3c4／
--     kiosk_punch b31ff8fa／punch_self f2c9b923／punch_proxy 83f2a99f／okuri_today_summary e61e5dd9／okuri_default_of 434e69d9／biz_date_of 196c453f／period_bounds 96e10e9a／audit_log_write 182eba3a
--
-- 器:
--   ★1 【裁定312】支払済み期の前借り・日払いは控除先を翌期へ自動繰り下げ。
--        daily_pays.settle_period text（YYYY-MM・null＝biz_date の月）。daily_pay_issue: 当月 run が paid なら settle_period＝翌月・戻り jsonb に 'settle_period'／'carried_to'。翌月も paid なら raise 'paid period'。
--        adv_issue／adv_issue_bulk: 同じ判定で advances.deduct_period＝翌月（既存列）。daily_pays_of_run は期の文字列一致（coalesce(settle_period, biz_date の月) = run.period）。
--   ★2 【裁定315】確定済み・支払済み期の打刻修正を許可（punch_correction_request／decide の 'period finalized' を解除）。
--        表 payroll_attentions（新設）＋書込は punch_correction_apply 内（run が finalized／paid のときだけ）＋読取 payroll_attentions_of(run_id)＋解決 payroll_attention_resolve(id, reason)。
--   ★3 【裁定316】payroll_finalize: coalesce(period_end, period_bounds) >= 今日の営業日（biz_date_of(store, now())）なら raise 'period not ended'。payroll_mark_paid は不触。
--   ★4 【裁定317】set_store_profile 白名単 +1 okuri_base_amount（整数 0〜99999・customer_retention_years と同型の数値検査）。
--   ★5 【起票87】kiosk_register_state に 'okuri_mode'・'okuri_base_amount' の 2 キー（署名不変）。
--   ★6 【裁定319】transport_issue_self(p_punch_id)（cast 本人）／kiosk_transport_issue(p_punch_id)（kiosk 打刻端末）＝金額は店設定 okuri_base_amount に固定・idem＝md5(punch_id:cast_id)。
--        transport.created_by を null 可に（kiosk 発行は操作者なし＝punches と同じ）。既存 transport_issue_bulk は不触。
--   ★7 【裁定314】bottle_keeps.check_line_id uuid null（FK check_lines・on delete set null）。bottle_keep_register が p_check_line_id を書く。
--   ★8 【裁定319 追補1】kiosk_punch_state() returns jsonb(okuri_mode, okuri_base_amount)＝打刻端末（kiosk_devices.purpose='punch'・自店）だけが読める・戻りは 2 キーのみ・STABLE。
--        打刻端末（/kiosk）が退勤で「送り」の口を出すかどうかを決める読取経路（kiosk_register_state はレジ端末用のため打刻端末からは呼べない）。
--   ★9 revoke／grant。
--
-- 起草判断（裁定319 追補1・2026-09-29 Agoora で確定）: (a)(b)(c)(d)(e)(f)(g)(h)(j)(k) は起草どおり・(i) は改稿（★8 kiosk_punch_state を新設）。
--   (a) ★1 advances には settle_period を足さない＝既存の deduct_period（period 帰属＝coalesce(deduct_period, advanced_on の月)・collect と payroll_finalize が既に読む・繰越もこの列）を発行時に翌月へ設定する。
--       daily_pays は列が無いので settle_period を新設。
--   (b) ★1 daily_pays.settle_period は null 可（null＝biz_date の月）。advances.deduct_period と同じ「null＝既定の月」の型。
--   (c) ★1 adv_issue の戻りは uuid のまま（署名不変）。繰り下げ先は advances.deduct_period を client が読む。'carried_to' を返すのは既に jsonb を返す daily_pay_issue。
--   (d) ★1 adv_issue_bulk にも同じ繰り下げ（画面の一括入口＝裁定302 が bulk を呼ぶため）。
--   (e) ★2 既存の「要対応」は DB に器が無い（client の都度計算）＝payroll_attentions を新設。resolved の理由は列を足さず audit_logs.reason に残す。
--   (f) ★2 'period finalized' の拒否は live では punch_correction_request と punch_correction_decide にある＝解除はその 2 本・attention の書込は apply。
--   (g) ★3 ガードは冪等リプレイ（同キーの再送）と 'run paid' の後・器の形式検証の前。period_end は run の凍結値（再確定時）→無ければ period_bounds。
--   (h) ★6 kiosk_transport_issue の「kiosk 腕」は打刻端末（purpose='punch'）。transport.created_by は cast の user_id（無ければ null）＝列を null 可に。
--       対象は source='kiosk' かつ打刻から 10 分以内の行。audit は kiosk_punch と同じ直 insert（actor null・kiosk_device_id）。
--   (i) 【改稿】★5 kiosk_register_state の 2 キー（レジ端末用）はそのまま。打刻端末の読取経路として ★8 kiosk_punch_state() を新設（打刻端末の腕のみ・B(f)）。
--   (j) ★6 cast 本人・kiosk とも、その営業日を含む run が paid なら 'paid period'（transport は繰越の列を持たない）。
--   (k) ★4 okuri_base_amount の 0 は「未設定」と同じ扱い（★6 は base <= 0 を 'no base amount' で拒否）。既存の専用 setter（0042）は不触。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）:
--   関数 283 → 288（新設 5）。課金ゲート名簿 A +3（payroll_attention_resolve／transport_issue_self／kiosk_transport_issue）・B +2（payroll_attentions_of／kiosk_punch_state＝B(f)）。表 78 → 79（payroll_attentions）。
--   pin が変わる suite: grants（TABLES +1・関数 +5・G9 0158）／anon-guard（probe +5）／billing（名簿 A／B／全数）／daily-pay（daily_pay_issue の戻りキー・settle_period）／
--     today-row・punch-decide（'period finalized' の文言を見る段があれば張り替え）／customers-keep（check_line_id）／store-profile（白名単 +1）。
--   起票88: payroll_finalize を admin／tx 内で直接呼ぶ suite（payroll・reopen・payroll-list・payroll-adjust・carryover・compliance ほか）は fixture の期を過去月へ張り替え。
--   client 便（手貼り直後）: collect の daily_pays 読取を settle_period へ（biz_date の範囲のままだと繰り下げた日払いを翌期の run が拾わない）・日払い／前借りの「翌月の給与から控除」表示・
--     打刻修正の確定後注記・給与画面の要対応・/mine と kiosk の送り・「キープ済み」を check_line_id で判定・マスタの送りベース額。
--
-- 検証（Run 後・貼り先証明を先頭に）＝末尾の 8 文。期待値:
--   (1) 貼り先証明 1 行（nox-project-proof・orgs の件数）
--   (2) md5 16 本（触る 11＋新設 5）: 冒頭の「期待 md5」と一致
--   (3) 不触 3 本の md5: payroll_mark_paid 409c9770／transport_issue_bulk 9d10c990／kiosk_punch b31ff8fa
--   (4) proacl 7 行: 新設 5 本＝{postgres,authenticated,service_role}／punch_correction_apply＝{postgres} のみ／payroll_finalize＝{postgres,service_role}
--   (5) 列 3 行: bottle_keeps.check_line_id YES／daily_pays.settle_period YES／transport.created_by YES（null 可）
--   (6) payroll_attentions の relrowsecurity＝t・policy 1（payroll_attentions_select・SELECT）
--   (7) payroll_attentions の grant: authenticated＝SELECT のみ（postgres／service_role は既定の全権・anon の行なし）
--   (8) 関数の総数 288・表の総数 79

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 裁定312: daily_pays.settle_period（null＝biz_date の月）
-- ══════════════════════════════════════════════════════════════
alter table public.daily_pays add column if not exists settle_period text;
alter table public.daily_pays drop constraint if exists daily_pays_settle_period_ck;
alter table public.daily_pays add constraint daily_pays_settle_period_ck
  check (settle_period is null or settle_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
update public.daily_pays set settle_period = to_char(biz_date, 'YYYY-MM') where settle_period is null;   -- 既存行の backfill（当月）
create index if not exists daily_pays_store_settle_idx on public.daily_pays (store_id, settle_period);

CREATE OR REPLACE FUNCTION public.adv_issue(p_store_id uuid, p_cast_id uuid, p_amount integer, p_advanced_on date, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_cast  record;
  v_actor uuid;
  v_id    uuid;
  v_carry text;   -- ★1 0158（裁定312）: 繰り下げ先の期（当月が paid のときだけ・それ以外 null）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_advanced_on is null then raise exception 'bad date'; end if;
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- paid 期間ガード（transport_issue 同型・凍結済み period に stranded 前借りを作らない・実装ノート【3】）
  --   前借りの period 帰属 = to_char(advanced_on,'YYYY-MM')（deduct_period は finalize が partial 時に設定）。
  --   paid 済み period に発行すると当該 period の finalize が 'run paid' で拒否され回収不能＝宙吊りになるため弾く。
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_advanced_on, 'YYYY-MM') and status = 'paid') then
    -- ★1 0158（裁定312）: 当月が支払済み＝控除先を翌月へ繰り下げて発行（deduct_period＝翌月）。翌月も支払済みなら拒否
    v_carry := to_char((date_trunc('month', p_advanced_on) + interval '1 month'), 'YYYY-MM');
    if exists (select 1 from public.payroll_runs
               where store_id = p_store_id and period = v_carry and status = 'paid') then
      raise exception 'paid period';
    end if;
  end if;
  -- cast は org+store 一致を server 照合（1 advance=1 cast）
  select id into v_cast from public.casts
    where id = p_cast_id and org_id = public.auth_org_id() and store_id = p_store_id;
  if v_cast.id is null then raise exception 'bad cast'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.advances (org_id, store_id, cast_id, amount, advanced_on, note, created_by, deduct_period)   -- ★1 0158: +deduct_period（繰り下げ先・通常は null）
  values (v_store.org_id, p_store_id, p_cast_id, p_amount, p_advanced_on, nullif(trim(coalesce(p_note,'')), ''), v_actor, v_carry)
  returning id into v_id;

  perform public.audit_log_write('adv_issue', 'advances:' || v_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'advanced_on', p_advanced_on, 'carried_to', v_carry), p_store_id);   -- ★1 0158: +carried_to
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.adv_issue_bulk(p_store_id uuid, p_items jsonb, p_idem_key uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_cast   record;
  v_actor  uuid;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_item   jsonb;
  v_castid uuid;
  v_amount int;
  v_date   date;
  v_note   text;
  v_idem   uuid;
  v_carry  text;   -- ★1 0158（裁定312）: 件ごとの繰り下げ先（当月が paid のときだけ）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_idem_key is null then raise exception 'bad idem'; end if;                                                                  -- ★2
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'bad items'; end if;   -- ★2
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if (select count(*) <> count(distinct e->>'cast_id') from jsonb_array_elements(p_items) e) then raise exception 'duplicate cast'; end if;   -- 裁定304-1 同 cast 2 回以上＝全件失敗
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  for v_item in select * from jsonb_array_elements(p_items) loop                                                                    -- ★2 件ごと
    v_castid := (v_item->>'cast_id')::uuid;
    v_amount := (v_item->>'amount')::int;
    v_date   := (v_item->>'date')::date;
    v_note   := v_item->>'note';
    v_cast   := null;
    if v_amount is null or v_amount <= 0 then raise exception 'bad amount'; end if;
    if v_date is null then raise exception 'bad date'; end if;
    -- paid 期間ガード（transport_issue 同型・凍結済み period に stranded 前借りを作らない・実装ノート【3】）
    --   前借りの period 帰属 = to_char(advanced_on,'YYYY-MM')（deduct_period は finalize が partial 時に設定）。
    --   paid 済み period に発行すると当該 period の finalize が 'run paid' で拒否され回収不能＝宙吊りになるため弾く。
    v_carry := null;   -- ★1 0158: 件ごとに初期化
    if exists (select 1 from public.payroll_runs
               where store_id = p_store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
      -- ★1 0158（裁定312）: 当月が支払済み＝翌月へ繰り下げ。翌月も支払済みなら全件失敗
      v_carry := to_char((date_trunc('month', v_date) + interval '1 month'), 'YYYY-MM');
      if exists (select 1 from public.payroll_runs
                 where store_id = p_store_id and period = v_carry and status = 'paid') then
        raise exception 'paid period';
      end if;
    end if;
    -- cast は org+store 一致を server 照合（1 advance=1 cast）
    select id into v_cast from public.casts
      where id = v_castid and org_id = public.auth_org_id() and store_id = p_store_id;
    if v_cast.id is null then raise exception 'bad cast'; end if;
    v_idem := md5(p_idem_key::text || ':' || v_castid::text)::uuid;                                                              -- ★2 各件の idem（302-2）
    select id into v_id from public.advances where store_id = p_store_id and idem_key = v_idem;                                   -- ★2 同キー再送＝既存 id
    if v_id is null then
      insert into public.advances (org_id, store_id, cast_id, amount, advanced_on, note, created_by, idem_key, deduct_period)   -- ★1 0158: +deduct_period
      values (v_store.org_id, p_store_id, v_castid, v_amount, v_date, nullif(trim(coalesce(v_note,'')), ''), v_actor, v_idem, v_carry)
      returning id into v_id;
      perform public.audit_log_write('adv_issue_bulk', 'advances:' || v_id::text,
        null, jsonb_build_object('cast_id', v_castid, 'amount', v_amount, 'advanced_on', v_date, 'bulk_idem', p_idem_key, 'carried_to', v_carry), p_store_id);   -- ★1 0158: +carried_to
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $function$;

CREATE OR REPLACE FUNCTION public.daily_pay_issue(p_cast_id uuid, p_biz_date date, p_gross integer, p_idem_key uuid)
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
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_gross is null or p_gross <= 0 then raise exception 'bad amount'; end if;
  select id, org_id, store_id, is_active into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  -- 冪等（org／ロール照合の後）: 同キー再送は既存行を返す（別 cast のキー再利用は拒否）
  select * into v_row from public.daily_pays where idem_key = p_idem_key;
  if v_row.id is not null then
    if v_row.cast_id <> p_cast_id then raise exception 'bad idem key'; end if;
    return jsonb_build_object('id', v_row.id, 'cast_id', v_row.cast_id, 'biz_date', v_row.biz_date, 'gross', v_row.gross,
      'withholding', v_row.withholding, 'withholding_category', v_row.withholding_category, 'net', v_row.net, 'warn', null, 'replay', true,
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
  if v_mode = '雇用' then
    v_wh := 0; v_warn := 'T10 pending';
  else
    v_wh := floor(greatest(0, p_gross - 5000)::double precision * 0.1021)::int; v_warn := null;
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_pays (org_id, store_id, cast_id, biz_date, gross, withholding, withholding_category, net, paid_by, idem_key, settle_period)   -- ★1 0158: +settle_period
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_biz_date, p_gross, v_wh, v_mode, p_gross - v_wh, v_actor, p_idem_key, v_settle)
  returning * into v_row;
  perform public.audit_log_write('daily_pay_issue', 'daily_pays:' || v_row.id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross, 'withholding', v_wh,
                       'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn,
                       'settle_period', v_settle, 'carried_to', v_carry), v_cast.store_id);   -- ★1 0158
  return jsonb_build_object('id', v_row.id, 'cast_id', p_cast_id, 'biz_date', p_biz_date, 'gross', p_gross,
    'withholding', v_wh, 'withholding_category', v_mode, 'net', p_gross - v_wh, 'warn', v_warn, 'replay', false,
    'settle_period', v_settle, 'carried_to', v_carry);   -- ★1 0158
end $function$;

CREATE OR REPLACE FUNCTION public.daily_pays_of_run(p_run_id uuid)
 RETURNS TABLE(cast_id uuid, paid_total integer, withholding_total integer, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run   record;
  v_from  date;
  v_to    date;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select r.id, r.org_id, r.store_id, r.period, r.period_start, r.period_end into v_run from public.payroll_runs r where r.id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select coalesce(v_run.period_start, pb.period_start), coalesce(v_run.period_end, pb.period_end) into v_from, v_to
    from public.period_bounds(v_run.period) pb;
  return query
    select d.cast_id, sum(d.gross)::int, sum(d.withholding)::int, count(*)::int
      from public.daily_pays d
     where d.store_id = v_run.store_id
       and coalesce(d.settle_period, to_char(d.biz_date, 'YYYY-MM')) = v_run.period   -- ★1 0158（裁定312）: 期の文字列一致（繰り下げた日払いは翌期の run が拾う・旧: biz_date between v_from and v_to）
     group by d.cast_id
     order by d.cast_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★2 裁定315: payroll_attentions（確定後の打刻修正を給与画面の要対応に積む）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.payroll_attentions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  cast_id     uuid not null references public.casts(id),
  run_id      uuid not null references public.payroll_runs(id) on delete cascade,
  kind        text not null check (kind in ('post_finalize_punch')),
  detail      jsonb not null default '{}'::jsonb,      -- before／after／punch_id／correction_id／biz_date／punch_kind
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id)
);
create index if not exists payroll_attentions_run_idx on public.payroll_attentions (run_id, resolved_at);
create index if not exists payroll_attentions_store_idx on public.payroll_attentions (store_id, created_at);

alter table public.payroll_attentions enable row level security;
drop policy if exists payroll_attentions_select on public.payroll_attentions;
create policy payroll_attentions_select on public.payroll_attentions for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner'
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())));

revoke all on table public.payroll_attentions from public, anon, authenticated;
grant select on table public.payroll_attentions to authenticated;

CREATE OR REPLACE FUNCTION public.punch_correction_request(p_cast_id uuid, p_punch_id uuid, p_biz_date date, p_kind text, p_after_at timestamp with time zone, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast      record;
  v_punch     record;
  v_actor     uuid;
  v_self      boolean;
  v_mgr       boolean;
  v_id        uuid;
  v_before_at timestamp with time zone;
  v_kind      text;
  v_row       jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_cast_id is null or p_biz_date is null then raise exception 'invalid_input'; end if;
  if p_punch_id is null and p_after_at is null then raise exception 'invalid_input'; end if;           -- ★2: 新規申請で削除は無い（shape_ck と同じ）
  if length(trim(coalesce(p_reason, ''))) not between 1 and 200 then raise exception 'reason required'; end if;   -- ★2（294-2＝staff_shift_cancel の形・上限は reason_ck）
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  v_self := coalesce(public.auth_cast_id() = p_cast_id, false);                                        -- ★2: cast 本人・staff 本人（要裁定(11)）
  v_mgr  := (public.auth_role() = 'owner'
             or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id()));         -- ★2: punch_proxy と同じ判定
  if not (v_self or v_mgr) then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if p_punch_id is not null then
    select * into v_punch from public.punches where id = p_punch_id;
    if v_punch.id is null or v_punch.cast_id <> p_cast_id then raise exception 'punch not found'; end if;
    v_before_at := v_punch.punched_at;
    v_kind      := v_punch.type;
    if p_kind is not null and p_kind <> v_kind then raise exception 'bad type'; end if;
    if public.biz_date_of(v_cast.store_id, v_before_at) <> p_biz_date then raise exception 'out of biz window'; end if;   -- ★2: 営業日窓（要裁定(10)）
  else
    if p_kind is null or p_kind not in ('in','out') then raise exception 'bad type'; end if;
    v_kind := p_kind;
  end if;
  if p_after_at is not null and public.biz_date_of(v_cast.store_id, p_after_at) <> p_biz_date then
    raise exception 'out of biz window';                                                                -- ★2: 営業日窓（294-2）
  end if;
  -- ★2 0158（裁定315）: 確定済み・支払済み期の打刻修正を許可（旧: 'period finalized' で拒否）。凍結給与は不変＝punch_correction_apply が payroll_attentions に積む
  insert into public.punch_corrections (org_id, store_id, cast_id, punch_id, biz_date, kind, before_at, after_at, reason, requested_by,
                                        decided_by, decided_at, decision)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_punch_id, p_biz_date, v_kind, v_before_at, p_after_at, trim(p_reason), v_actor,
          case when v_mgr then v_actor end, case when v_mgr then now() end, case when v_mgr then 'approved' else 'pending' end)   -- ★2: owner／manager＝申請＝確定・1 行
  returning id into v_id;
  if v_mgr then perform public.punch_correction_apply(v_id, p_reason); end if;                           -- ★2: 同 tx で punches へ
  select to_jsonb(pc) into v_row from public.punch_corrections pc where pc.id = v_id;
  perform public.audit_log_write('punch_correction_request', 'punch_corrections:' || v_id::text,
    null, v_row, v_cast.store_id, p_reason);                                                            -- ★2: 6 引数形
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.punch_correction_decide(p_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.punch_corrections%rowtype;
  v_actor  uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_id is null or p_approve is null then raise exception 'invalid_input'; end if;
  select * into r from public.punch_corrections where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and r.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if r.decision <> 'pending' then raise exception 'not pending'; end if;
  if not p_approve and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason required'; end if;   -- ★3: rejected は理由必須（294-3・置き場は要裁定(1)）
  -- ★2 0158（裁定315）: 申請後に確定した期でも承認できる（旧: 'period finalized' で拒否）。給与画面の要対応は punch_correction_apply が積む
  v_before := to_jsonb(r);
  update public.punch_corrections
     set decision = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_actor, decided_at = now(),
         decide_reason = nullif(trim(coalesce(p_reason, '')), '')                                       -- ★3（裁定295-1）: rejected は上の検査で必須・approved は任意
   where id = p_id;
  if p_approve then perform public.punch_correction_apply(p_id, p_reason); end if;                     -- ★3: punches を update／insert／delete
  select to_jsonb(pc) into v_after from public.punch_corrections pc where pc.id = p_id;
  perform public.audit_log_write('punch_correction_decide', 'punch_corrections:' || p_id::text,
    v_before, v_after, r.store_id, p_reason);                                                           -- ★3: 理由つき 6 引数の型
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.punch_correction_apply(p_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.punch_corrections%rowtype;
  v_before jsonb;
  v_after  jsonb;
  v_pid    uuid;
  v_run    record;   -- ★2 0158（裁定315）: その営業日を含む確定済み／支払済みの run
begin
  select * into r from public.punch_corrections where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.decision <> 'approved' then raise exception 'not approved'; end if;
  if r.punch_id is not null then
    select to_jsonb(p) into v_before from public.punches p where p.id = r.punch_id;
    if v_before is null then raise exception 'punch not found'; end if;
    if r.after_at is null then
      delete from public.punches where id = r.punch_id;                                                -- ★2: 削除（FK on delete set null → punch_corrections.punch_id は null・before_at で追跡）
      v_after := null;
    else
      update public.punches set punched_at = r.after_at, note = 'punch_correction:' || r.id::text
       where id = r.punch_id;                                                                          -- ★2: 元行を update（punches が唯一の読み口＝294-1）
      select to_jsonb(p) into v_after from public.punches p where p.id = r.punch_id;
    end if;
    v_pid := r.punch_id;
  else
    insert into public.punches (org_id, store_id, cast_id, punched_at, type, source, note)
    values (r.org_id, r.store_id, r.cast_id, r.after_at, r.kind, 'manager', 'punch_correction:' || r.id::text)   -- ★2: 新規＝insert（source CHECK 3 値は不変・要裁定(4)）
    returning id into v_pid;
    select to_jsonb(p) into v_after from public.punches p where p.id = v_pid;
    update public.punch_corrections set punch_id = v_pid where id = r.id;                                -- ★2: 確定後は insert した行を指す
  end if;
  -- ★2 0158（裁定315）: 確定後の打刻修正＝凍結給与は変えず、給与画面の要対応に積む（run が finalized／paid のときだけ）
  for v_run in
    select pr.id from public.payroll_runs pr, lateral public.period_bounds(pr.period) pb
     where pr.store_id = r.store_id and pr.status in ('finalized','paid')
       and r.biz_date between coalesce(pr.period_start, pb.period_start) and coalesce(pr.period_end, pb.period_end)
  loop
    insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind, detail)
    values (r.org_id, r.store_id, r.cast_id, v_run.id, 'post_finalize_punch',
            jsonb_build_object('before', v_before->>'punched_at', 'after', v_after->>'punched_at', 'punch_id', v_pid,
                               'correction_id', r.id, 'biz_date', r.biz_date, 'punch_kind', r.kind));
  end loop;
  perform public.audit_log_write('punch_correction_apply', 'punches:' || v_pid::text,
    v_before, v_after, r.store_id, coalesce(p_reason, r.reason));                                     -- ★2: staff_shift_cancel と同じ 6 引数形
  return v_pid;
end $function$;

-- payroll_attentions_of（owner∨manager 自店・STABLE）: run の要対応（未解決を先・新しい順）
create or replace function public.payroll_attentions_of(p_run_id uuid)
returns table(id uuid, cast_id uuid, cast_name text, kind text, detail jsonb, created_at timestamptz, resolved_at timestamptz, resolved_by uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v_run record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select r.id, r.org_id, r.store_id into v_run from public.payroll_runs r where r.id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select a.id, a.cast_id, c.name, a.kind, a.detail, a.created_at, a.resolved_at, a.resolved_by
      from public.payroll_attentions a
      join public.casts c on c.id = a.cast_id
     where a.run_id = p_run_id and a.org_id = public.auth_org_id()
     order by (a.resolved_at is not null), a.created_at desc, a.id;
end $$;

-- payroll_attention_resolve（owner∨manager 自店・理由任意）: 解決済みにする。解決済みの再送は同じ id を返す（audit を重ねない）
create or replace function public.payroll_attention_resolve(p_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r        public.payroll_attentions%rowtype;
  v_actor  uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_id is null then raise exception 'invalid_input'; end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select * into r from public.payroll_attentions where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and r.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if r.resolved_at is not null then return r.id; end if;
  v_before := to_jsonb(r);
  update public.payroll_attentions set resolved_at = now(), resolved_by = v_actor where id = p_id;
  select to_jsonb(a) into v_after from public.payroll_attentions a where a.id = p_id;
  perform public.audit_log_write('payroll_attention_resolve', 'payroll_attentions:' || p_id::text,
    v_before, v_after, r.store_id, nullif(trim(coalesce(p_reason, '')), ''));
  return p_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★3 裁定316: payroll_finalize（期間終了の翌営業日から）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.payroll_finalize(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_payslips jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid;
  v_store   uuid;
  v_period  text;
  v_status  text;
  v_idem    uuid;
  v_old_ps  date;
  v_old_pe  date;
  v_new_ps  date;
  v_new_pe  date;
  v_retired jsonb;
  v_count   int;
  v_next    text;      -- 繰越先 period（翌月）
  v_ps      jsonb;     -- payslip 要素
  v_arrec   jsonb;     -- 退避 breakdown.ar の1要素（巻き戻し用）
  v_advrec  jsonb;     -- 退避 breakdown.adv の1要素（巻き戻し用・F2e-2）
  v_okrec   jsonb;     -- 退避 breakdown.okuri の1要素（巻き戻し用・F2e-2）
  v_ar      jsonb;     -- 適用 ar 記録（凍結 breakdown へ注入）
  v_advarr  jsonb;     -- 適用 adv 記録（F2e-2）
  v_okarr   jsonb;     -- 適用 okuri 記録（F2e-2）
  v_arentry jsonb;     -- ar_deducted/ar_carried の1要素
  v_adentry jsonb;     -- adv_deducted/adv_carried の1要素（F2e-2）
  v_okentry jsonb;     -- okuri_deducted の1要素（F2e-2）
  v_cast    uuid;      -- payslip の cast_id（casts 照合済み）
  v_rid     uuid;      -- receivable id
  v_aid     uuid;      -- advance id（F2e-2）
  v_tid     uuid;      -- transport id（F2e-2）
  v_amt     int;       -- deducted 額
  v_recv    record;    -- receivable 現行行
  v_adv     record;    -- advance 現行行（F2e-2）
  v_tr      record;    -- transport 現行行（F2e-2）
  v_full    boolean;   -- 全額天引きか
  v_bd      jsonb;     -- 凍結 breakdown（ar/adv/okuri 注入後）
  v_applied     jsonb; -- audit: 適用 receivable 遷移
  v_applied_adv jsonb; -- audit: 適用 advance 遷移（F2e-2）
  v_applied_ok  jsonb; -- audit: 適用 transport 遷移（F2e-2）
  v_rolled      jsonb; -- audit: 巻き戻し receivable
  v_rolled_adv  jsonb; -- audit: 巻き戻し advance（F2e-2）
  v_rolled_ok   jsonb; -- audit: 巻き戻し transport（F2e-2）
begin
  -- run 取得＋org 照合（現行どおり）
  select org_id, store_id, period, status, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_period, v_status, v_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（現行どおり・replay は遷移も巻き戻しもしない＝二重実行防止のみ）
  if p_idem_key is not null and v_status = 'finalized' and v_idem is not distinct from p_idem_key then
    select count(*) into v_count from public.payslips where run_id = p_run_id;
    return v_count;
  end if;

  -- paid 後は再確定/差し替え不可（現行どおり・巻き戻し不可を含意）
  if v_status = 'paid' then raise exception 'run paid'; end if;

  -- ★3 0158（裁定316）: 確定は期間終了の翌営業日から＝period_end（凍結値・無ければ period_bounds）が今日の営業日以降なら拒否
  if coalesce(v_old_pe, (select pb.period_end from public.period_bounds(v_period) pb)) >= public.biz_date_of(v_store, now()) then
    raise exception 'period not ended';
  end if;

  -- 器の形式検証（現行どおり）
  if p_payslips is null or jsonb_typeof(p_payslips) <> 'array' then raise exception 'bad payslips'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payslips) e
    where e->>'cast_id' is null or e->>'net' is null
       or e->'breakdown'->'pay' is null
       or jsonb_typeof(e->'breakdown'->'extras') <> 'array'
  ) then raise exception 'bad payslip shape'; end if;
  -- 空配列拒否（現行どおり）
  if jsonb_array_length(p_payslips) = 0 then raise exception 'empty payslips'; end if;

  -- 差し替え前 breakdown_json を退避（現行どおり）
  select jsonb_agg(jsonb_build_object('cast_id', ps.cast_id, 'net', ps.net, 'breakdown', ps.breakdown_json))
    into v_retired from public.payslips ps where ps.run_id = p_run_id;

  -- 期間窓を単一ソース（現行どおり）
  select pb.period_start, pb.period_end into v_new_ps, v_new_pe from public.period_bounds(v_period) pb;
  -- ★8 0154（裁定294-8）: 計算期間（同名キー・欠損は run の期間）は run の期間内かつ逆転なし
  if exists (
    select 1 from jsonb_array_elements(p_payslips) e
    where coalesce((e->>'calc_period_start')::date, v_new_ps) < v_new_ps
       or coalesce((e->>'calc_period_end')::date, v_new_pe) > v_new_pe
       or coalesce((e->>'calc_period_start')::date, v_new_ps) > coalesce((e->>'calc_period_end')::date, v_new_pe)
  ) then raise exception 'bad calc period'; end if;                                                                             -- ★8

  -- (A) 繰越先 period（翌月）
  v_next := to_char((to_date(v_period || '-01', 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');

  -- (B) 巻き戻しフェーズ（再確定・未 paid）: 退避 payslip の breakdown.ar/.adv/.okuri を条件付き復元（drift は触らない）
  --   ── ar（receivables・mig0018 と一字一致）──
  v_rolled := '[]'::jsonb;
  for v_arrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'ar', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.receivables r
       set status = v_arrec->>'prev_status',
           deduct_period = nullif(v_arrec->>'prev_deduct_period', ''),
           deducted_amount = (v_arrec->>'prev_deducted_amount')::int
     where r.id = (v_arrec->>'receivable_id')::uuid
       and r.status = v_arrec->>'applied_status'
       and r.deducted_amount = (v_arrec->>'applied_deducted_amount')::int
       and r.deduct_period is not distinct from nullif(v_arrec->>'applied_deduct_period', '');
    if found then v_rolled := v_rolled || v_arrec; end if;
  end loop;
  --   ── adv（advances・ar と同型・F2e-2 追加）──
  v_rolled_adv := '[]'::jsonb;
  for v_advrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'adv', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.advances a
       set status = v_advrec->>'prev_status',
           deduct_period = nullif(v_advrec->>'prev_deduct_period', ''),
           deducted_amount = (v_advrec->>'prev_deducted_amount')::int
     where a.id = (v_advrec->>'advance_id')::uuid
       and a.status = v_advrec->>'applied_status'
       and a.deducted_amount = (v_advrec->>'applied_deducted_amount')::int
       and a.deduct_period is not distinct from nullif(v_advrec->>'applied_deduct_period', '');
    if found then v_rolled_adv := v_rolled_adv || v_advrec; end if;
  end loop;
  --   ── okuri（transport・繰越なし＝deduct_period 列なし・status/deducted_amount のみ・F2e-2 追加）──
  v_rolled_ok := '[]'::jsonb;
  for v_okrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'okuri', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.transport t
       set status = v_okrec->>'prev_status',
           deducted_amount = (v_okrec->>'prev_deducted_amount')::int
     where t.id = (v_okrec->>'transport_id')::uuid
       and t.status = v_okrec->>'applied_status'
       and t.deducted_amount = (v_okrec->>'applied_deducted_amount')::int;
    if found then v_rolled_ok := v_rolled_ok || v_okrec; end if;
  end loop;

  -- (C) 原子的差し替え（未 paid のみ）。delete 後 FOR ループで ar/adv/okuri 処理しつつ insert
  delete from public.payslips where run_id = p_run_id;
  v_count := 0;
  v_applied     := '[]'::jsonb;
  v_applied_adv := '[]'::jsonb;
  v_applied_ok  := '[]'::jsonb;
  for v_ps in select ae from lateral jsonb_array_elements(p_payslips) ae loop
    -- casts 照合（他 org/他店 cast 混入除去＝現行 join と同義・混入は落とす）
    select c.id into v_cast from public.casts c
      where c.id = (v_ps->>'cast_id')::uuid and c.org_id = v_org and c.store_id = v_store;
    if v_cast is null then continue; end if;
    v_ar     := '[]'::jsonb;
    v_advarr := '[]'::jsonb;
    v_okarr  := '[]'::jsonb;

    -- ═══ ar（receivables・mig0018 と一字一致）═══
    -- ar_deducted: {receivable_id, amount} を deducted_amount 加算・全額なら deducted・部分なら open+翌月繰越
    if jsonb_typeof(v_ps->'ar_deducted') = 'array' then
      for v_arentry in select ae from lateral jsonb_array_elements(v_ps->'ar_deducted') ae loop
        v_rid := (v_arentry->>'receivable_id')::uuid;
        v_amt := (v_arentry->>'amount')::int;
        select * into v_recv from public.receivables where id = v_rid for update;
        if v_recv.id is null or v_recv.org_id <> v_org or v_recv.cast_id is distinct from v_cast
           or v_recv.status <> 'open' or not v_recv.deduct_from_cast
           or v_amt <= 0 or v_recv.deducted_amount + v_amt > v_recv.amount - v_recv.collected_amount then  -- ★mig0092: 上限＝amount − collected_amount（現金回収済み分への天引き＝過消込を遮断）
          raise exception 'bad receivable';
        end if;
        v_full := (v_recv.deducted_amount + v_amt = v_recv.amount - v_recv.collected_amount);  -- ★mig0092: 完済判定も残高基準（deducted＋collected＝amount で 'deducted'）
        update public.receivables
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end,
               deduct_period = case when v_full then deduct_period else v_next end
         where id = v_rid;
        v_ar := v_ar || jsonb_build_object(
          'receivable_id', v_rid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_recv.status, 'prev_deduct_period', v_recv.deduct_period, 'prev_deducted_amount', v_recv.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deduct_period', case when v_full then v_recv.deduct_period else v_next end,
          'applied_deducted_amount', v_recv.deducted_amount + v_amt);
        v_applied := v_applied || jsonb_build_object('receivable_id', v_rid, 'amount', v_amt);
      end loop;
    end if;
    -- ar_carried: 引き当てゼロで deduct_period のみ翌月へ（amount 不変）
    if jsonb_typeof(v_ps->'ar_carried') = 'array' then
      for v_arentry in select ae from lateral jsonb_array_elements(v_ps->'ar_carried') ae loop
        v_rid := (v_arentry->>'receivable_id')::uuid;
        select * into v_recv from public.receivables where id = v_rid for update;
        if v_recv.id is null or v_recv.org_id <> v_org or v_recv.cast_id is distinct from v_cast
           or v_recv.status <> 'open' or not v_recv.deduct_from_cast then
          raise exception 'bad receivable';
        end if;
        v_ar := v_ar || jsonb_build_object(
          'receivable_id', v_rid, 'action', 'carried', 'amount', 0,
          'prev_status', v_recv.status, 'prev_deduct_period', v_recv.deduct_period, 'prev_deducted_amount', v_recv.deducted_amount,
          'applied_status', 'open', 'applied_deduct_period', v_next, 'applied_deducted_amount', v_recv.deducted_amount);
        update public.receivables set deduct_period = v_next where id = v_rid;
      end loop;
    end if;

    -- ═══ adv（advances・ar と同型・繰越あり・F2e-2 追加）═══
    if jsonb_typeof(v_ps->'adv_deducted') = 'array' then
      for v_adentry in select ae from lateral jsonb_array_elements(v_ps->'adv_deducted') ae loop
        v_aid := (v_adentry->>'advance_id')::uuid;
        v_amt := (v_adentry->>'amount')::int;
        select * into v_adv from public.advances where id = v_aid for update;
        if v_adv.id is null or v_adv.org_id <> v_org or v_adv.cast_id is distinct from v_cast
           or v_adv.status <> 'open'
           or v_amt <= 0 or v_adv.deducted_amount + v_amt > v_adv.amount then
          raise exception 'bad advance';
        end if;
        v_full := (v_adv.deducted_amount + v_amt = v_adv.amount);
        update public.advances
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end,
               deduct_period = case when v_full then deduct_period else v_next end
         where id = v_aid;
        v_advarr := v_advarr || jsonb_build_object(
          'advance_id', v_aid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_adv.status, 'prev_deduct_period', v_adv.deduct_period, 'prev_deducted_amount', v_adv.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deduct_period', case when v_full then v_adv.deduct_period else v_next end,
          'applied_deducted_amount', v_adv.deducted_amount + v_amt);
        v_applied_adv := v_applied_adv || jsonb_build_object('advance_id', v_aid, 'amount', v_amt);
      end loop;
    end if;
    if jsonb_typeof(v_ps->'adv_carried') = 'array' then
      for v_adentry in select ae from lateral jsonb_array_elements(v_ps->'adv_carried') ae loop
        v_aid := (v_adentry->>'advance_id')::uuid;
        select * into v_adv from public.advances where id = v_aid for update;
        if v_adv.id is null or v_adv.org_id <> v_org or v_adv.cast_id is distinct from v_cast
           or v_adv.status <> 'open' then
          raise exception 'bad advance';
        end if;
        v_advarr := v_advarr || jsonb_build_object(
          'advance_id', v_aid, 'action', 'carried', 'amount', 0,
          'prev_status', v_adv.status, 'prev_deduct_period', v_adv.deduct_period, 'prev_deducted_amount', v_adv.deducted_amount,
          'applied_status', 'open', 'applied_deduct_period', v_next, 'applied_deducted_amount', v_adv.deducted_amount);
        update public.advances set deduct_period = v_next where id = v_aid;
      end loop;
    end if;

    -- ═══ okuri（transport・繰越なし＝deduct_period なし・部分は open 据置・F2e-2 追加）═══
    if jsonb_typeof(v_ps->'okuri_deducted') = 'array' then
      for v_okentry in select ae from lateral jsonb_array_elements(v_ps->'okuri_deducted') ae loop
        v_tid := (v_okentry->>'transport_id')::uuid;
        v_amt := (v_okentry->>'amount')::int;
        select * into v_tr from public.transport where id = v_tid for update;
        if v_tr.id is null or v_tr.org_id <> v_org or v_tr.cast_id is distinct from v_cast
           or v_tr.status <> 'open'
           or v_amt <= 0 or v_tr.deducted_amount + v_amt > v_tr.amount then
          raise exception 'bad transport';
        end if;
        v_full := (v_tr.deducted_amount + v_amt = v_tr.amount);
        update public.transport
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end  -- 繰越なし＝部分は open 据置
         where id = v_tid;
        v_okarr := v_okarr || jsonb_build_object(
          'transport_id', v_tid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_tr.status, 'prev_deducted_amount', v_tr.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deducted_amount', v_tr.deducted_amount + v_amt);
        v_applied_ok := v_applied_ok || jsonb_build_object('transport_id', v_tid, 'amount', v_amt);
      end loop;
    end if;

    -- 凍結 breakdown = 入力 breakdown に ar/adv/okuri を注入
    v_bd := (v_ps->'breakdown') || jsonb_build_object('ar', v_ar, 'adv', v_advarr, 'okuri', v_okarr);
    insert into public.payslips (org_id, store_id, run_id, cast_id, period, breakdown_json, net,
                                 calc_period_start, calc_period_end)                                                          -- ★8 0154: 列 +2
    values (v_org, v_store, p_run_id, v_cast, v_period, v_bd, (v_ps->>'net')::int,
            coalesce((v_ps->>'calc_period_start')::date, v_new_ps),                                                           -- ★8: p_payslips の同名キーを写す・欠損は run の期間
            coalesce((v_ps->>'calc_period_end')::date, v_new_pe));                                                            -- ★8
    v_count := v_count + 1;
  end loop;

  -- run 更新（現行どおり）
  update public.payroll_runs
     set status = 'finalized', finalized_at = now(),
         finalize_idem_key = p_idem_key,
         period_start = v_new_ps, period_end = v_new_pe
   where id = p_run_id;

  -- (D) #6 service 経路監査: before に退避 breakdown＋旧窓＋巻き戻し(ar/adv/okuri)・after に新件数/新窓/idem＋適用(ar/adv/okuri)
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_finalize',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe,
                       'rolled_back_receivables', v_rolled,
                       'rolled_back_advances', v_rolled_adv,
                       'rolled_back_transport', v_rolled_ok),
    jsonb_build_object('cast_count', v_count, 'period_start', v_new_ps,
                       'period_end', v_new_pe, 'idem_key', p_idem_key,
                       'applied_receivables', v_applied,
                       'applied_advances', v_applied_adv,
                       'applied_transport', v_applied_ok),
    v_store);
  return v_count;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★4 裁定317: set_store_profile 白名単 +1 okuri_base_amount
-- ══════════════════════════════════════════════════════════════
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
                             'okuri_base_amount'];                                                        -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）
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
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json
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

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★5 起票87: kiosk_register_state に okuri_mode／okuri_base_amount
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.kiosk_register_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'ar_enabled', coalesce((select (st.settings_json->>'ar_enabled')::boolean from public.stores st where st.id = v_store), false),  -- ★6 0156（起票84）: 売掛の店設定（0155 ar_policy_ok と同じ読み）
    'okuri_mode', coalesce(nullif(trim((select st.settings_json->>'okuri_mode' from public.stores st where st.id = v_store)), ''), 'flat'),   -- ★5 0158（起票87）: 送り方式（未設定＝flat）
    'okuri_base_amount', (select nullif(trim(st.settings_json->>'okuri_base_amount'), '')::int from public.stores st where st.id = v_store),  -- ★5 0158（起票87）: 送りベース額（未設定＝null）
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                       order by s.sort_order)
        from public.seats s
       where s.store_id = v_store and s.is_active), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'sort_order', pc.sort_order)
                       order by pc.sort_order, pc.name)
        from public.product_categories pc
       where pc.store_id = v_store and pc.is_active), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price, 'category_id', p.category_id, 'sort_order', p.sort_order)
                       order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name)
        from public.products p
        left join public.product_categories pc on pc.id = p.category_id
       where p.store_id = v_store and p.is_active), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.casts c
       where c.store_id = v_store and c.is_active), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ck.id,
               'seat_id', ck.seat_id,
               'extra_seat_ids', coalesce((
                 select jsonb_agg(cs.seat_id order by cs.created_at)
                   from public.check_seats cs where cs.check_id = ck.id), '[]'::jsonb),
               'total', ck.total,
               'started_at', ck.started_at,
               'set_min', ck.set_min,
               'ext_min', ck.ext_min,
               'time_per', ck.time_per,
               'people', ck.people) order by ck.started_at)
        from public.checks ck
       where ck.store_id = v_store and ck.status = 'open'), '[]'::jsonb)
  );
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★6 裁定319: cast 本人／kiosk の送り発行（金額は店設定 okuri_base_amount に固定）
-- ══════════════════════════════════════════════════════════════
alter table public.transport alter column created_by drop not null;   -- kiosk 発行は操作者なし（起草判断 (h)）

-- transport_issue_self（cast 本人）: 自分の out 打刻（okuri=true）に対して店のベース額で 1 件発行。再送は同じ id
create or replace function public.transport_issue_self(p_punch_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast  uuid;
  v_p     record;
  v_store record;
  v_base  integer;
  v_date  date;
  v_idem  uuid;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'forbidden'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at into v_p from public.punches p where p.id = p_punch_id;
  -- 他人の打刻・他 org・存在しない id は同じ 'forbidden'（存在の手掛かりを出さない）
  if v_p.id is null or v_p.org_id <> public.auth_org_id() or v_p.cast_id <> v_cast then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  if coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat') <> 'actual' then raise exception 'okuri not actual'; end if;
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  -- 冪等（org／本人照合の後）: 同じ打刻の再送＝既存 id（transport_issue_bulk(p_idem_key＝punch_id) と同じキー＝二重発行しない）
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key)
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_base, v_date, null, v_actor, v_idem)
  returning id into v_id;
  perform public.audit_log_write('transport_issue_self', 'transport:' || v_id::text,
    null, jsonb_build_object('cast_id', v_p.cast_id, 'amount', v_base, 'biz_date', v_date, 'punch_id', v_p.id), v_p.store_id);
  return v_id;
end $$;

-- kiosk_transport_issue（打刻端末）: 自端末の店の kiosk 打刻（out・okuri=true・10 分以内）に対して店のベース額で 1 件発行。再送は同じ id
create or replace function public.kiosk_transport_issue(p_punch_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_device public.kiosk_devices;
  v_p      record;
  v_store  record;
  v_base   integer;
  v_date   date;
  v_idem   uuid;
  v_actor  uuid;
  v_id     uuid;
  v_ip     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_device.org_id) then raise exception 'billing locked'; end if;
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at, p.source into v_p from public.punches p where p.id = p_punch_id;
  -- 他店・他 org・存在しない id・kiosk 以外の打刻は同じ 'forbidden'
  if v_p.id is null or v_p.org_id <> v_device.org_id or v_p.store_id <> v_device.store_id or v_p.source <> 'kiosk' then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  if coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat') <> 'actual' then raise exception 'okuri not actual'; end if;
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if v_p.punched_at < now() - interval '10 minutes' then raise exception 'punch expired'; end if;   -- 端末は cast を識別しない＝打刻直後だけ（起草判断 (h)）
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select c.user_id into v_actor from public.casts c where c.id = v_p.cast_id;   -- 操作者なし＝cast の user（無ければ null）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key)
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_base, v_date, null, v_actor, v_idem)
  returning id into v_id;
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_transport_issue',
     'transport:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', v_p.cast_id, 'amount', v_base,
                        'biz_date', v_date, 'punch_id', v_p.id),
     v_ip);
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★7 裁定314: bottle_keeps.check_line_id（購入行との紐づけ）
-- ══════════════════════════════════════════════════════════════
alter table public.bottle_keeps add column if not exists check_line_id uuid references public.check_lines(id) on delete set null;
create index if not exists bottle_keeps_check_line_idx on public.bottle_keeps (check_line_id) where check_line_id is not null;

CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text, p_bottle_name text DEFAULT NULL::text, p_check_line_id uuid DEFAULT NULL::uuid)
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
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

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
  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no, bottle_name, check_line_id)   -- ★16: 末尾 ')' → ', bottle_name)'（0158 ★7: +check_line_id）
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no, nullif(trim(coalesce(p_bottle_name, '')), ''), p_check_line_id)   -- ★16（0158 ★7: 購入行との紐づけ＝裁定314）
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★8 裁定319 追補1: kiosk_punch_state（打刻端末が送りの設定を読む・2 キーのみ）
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_punch_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_device public.kiosk_devices;
begin
  -- kiosk_punch と同じ端末認証（打刻端末＝purpose='punch'・is_active）。レジ端末・通常ユーザーは forbidden
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'okuri_mode', coalesce(nullif(trim((select st.settings_json->>'okuri_mode' from public.stores st where st.id = v_device.store_id)), ''), 'flat'),
    'okuri_base_amount', (select nullif(trim(st.settings_json->>'okuri_base_amount'), '')::int from public.stores st where st.id = v_device.store_id)
  );
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★9 grants（新設 5 本＋再作成した既存は live の proacl を再掲＝create or replace は ACL を保つが明示する）
-- ══════════════════════════════════════════════════════════════
revoke all on function public.kiosk_punch_state() from public, anon;
grant execute on function public.kiosk_punch_state() to authenticated, service_role;
revoke all on function public.payroll_attentions_of(uuid) from public, anon;
grant execute on function public.payroll_attentions_of(uuid) to authenticated, service_role;
revoke all on function public.payroll_attention_resolve(uuid, text) from public, anon;
grant execute on function public.payroll_attention_resolve(uuid, text) to authenticated, service_role;
revoke all on function public.transport_issue_self(uuid) from public, anon;
grant execute on function public.transport_issue_self(uuid) to authenticated, service_role;
revoke all on function public.kiosk_transport_issue(uuid) from public, anon;
grant execute on function public.kiosk_transport_issue(uuid) to authenticated, service_role;
revoke all on function public.adv_issue(uuid, uuid, integer, date, text) from public, anon;
grant execute on function public.adv_issue(uuid, uuid, integer, date, text) to authenticated, service_role;
revoke all on function public.adv_issue_bulk(uuid, jsonb, uuid) from public, anon;
grant execute on function public.adv_issue_bulk(uuid, jsonb, uuid) to authenticated, service_role;
revoke all on function public.daily_pay_issue(uuid, date, integer, uuid) from public, anon;
grant execute on function public.daily_pay_issue(uuid, date, integer, uuid) to authenticated, service_role;
revoke all on function public.daily_pays_of_run(uuid) from public, anon;
grant execute on function public.daily_pays_of_run(uuid) to authenticated, service_role;
revoke all on function public.punch_correction_request(uuid, uuid, date, text, timestamptz, text) from public, anon;
grant execute on function public.punch_correction_request(uuid, uuid, date, text, timestamptz, text) to authenticated, service_role;
revoke all on function public.punch_correction_decide(uuid, boolean, text) from public, anon;
grant execute on function public.punch_correction_decide(uuid, boolean, text) to authenticated, service_role;
revoke all on function public.punch_correction_apply(uuid, text) from public, anon, authenticated, service_role;   -- 内部専用（4 ロール明示 revoke・grant なし）
revoke all on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) to service_role;
revoke all on function public.set_store_profile(uuid, jsonb) from public, anon;
grant execute on function public.set_store_profile(uuid, jsonb) to authenticated, service_role;
revoke all on function public.kiosk_register_state() from public, anon;
grant execute on function public.kiosk_register_state() to authenticated, service_role;
revoke all on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid) from public, anon;
grant execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text, text, uuid) to authenticated, service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('adv_issue','adv_issue_bulk','daily_pay_issue','daily_pays_of_run','punch_correction_request','punch_correction_decide','punch_correction_apply','payroll_finalize','set_store_profile',
   'kiosk_register_state','bottle_keep_register','payroll_attentions_of','payroll_attention_resolve','transport_issue_self','kiosk_transport_issue','kiosk_punch_state') order by 1;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_mark_paid','transport_issue_bulk','kiosk_punch') order by 1;
select proname, pg_get_function_identity_arguments(oid), proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in
  ('payroll_attentions_of','payroll_attention_resolve','transport_issue_self','kiosk_transport_issue','kiosk_punch_state','punch_correction_apply','payroll_finalize') order by 1;
select table_name, column_name, is_nullable from information_schema.columns where table_schema='public' and (table_name, column_name) in
  (('daily_pays','settle_period'),('bottle_keeps','check_line_id'),('transport','created_by')) order by 1;
select c.relrowsecurity, p.policyname, p.cmd from pg_class c join pg_policies p on p.tablename = c.relname and p.schemaname = 'public' where c.oid='public.payroll_attentions'::regclass;
select grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='payroll_attentions' group by 1 order by 1;
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions, (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables;
