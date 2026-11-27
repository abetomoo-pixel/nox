-- 0234_pay_guard（相談役 11/26 22:10 の段ウ・#173 入金の二度押し／#41 入金の後の延長パターン・起草と試走まで・適用はしない）
--   経緯：#173＝入金の窓は送っている間もボタンが押せ、冪等キーは押すたびに作り直す。check_pay は伝票の行を押さえずに残額を見る＝2 本が同時に残額を読むと両方通り得る
--          （本番：デモでない会社に 0.36 秒差・別の冪等キー・同額の組が 1 件＝2026-08-18）。分けて払う途中の額の二度押しは順に届いても 2 件通る＝画面の直し（送信中の止め・冪等キーを窓ごとに 1 つ）が本体・関数は同時の分の止め。
--         #41＝自動延長の店の「延長パターン ▾」は入金の後も出て、check_set_ext_rule は入金を見ずに確定済みの延長の行を新しい単価で引き直す
--          （伝票の額が動くほかの 9 本＝check_time_charge_apply・check_set_people・check_set_nominations・check_shimei_add・check_dohan_add・check_extension_add・check_remove_line・check_referral_remove・check_line_set_group は 'has payments' で止める＝この 1 本だけ抜けていた）。
--   中身：作り直し 2 本（同じ署名・CREATE OR REPLACE・ACL は今と同じ文で言い直す＝public／anon から revoke・authenticated に grant）。
--     ★1 check_pay：伝票の読み（select … from checks）に for update を足すだけ。ほかの行は 1 字も変えない（冪等キーの照合・残額・割引・手数料・売掛は前のまま）。
--     ★2 check_set_ext_rule：伝票の読みに for update・'not open' の後に「入金が 1 件でもあれば 'has payments'」（ほかの 9 本と同じ形）。
--   変えないもの：表・列・索引・ほかの関数（関数の数 525・表 133 のまま）。check_time_charge_apply（0218 の作り直し）・set_pricing_rule（0224 の作り直し）には触れない。
--   翻訳元：本番の check_pay（md5(prosrc) b0a80bb1b404d8c7aee71cb0fc75e00e）・check_set_ext_rule（813e82e6711adf85a8ab69f46b8d31ef）。
--   本番の今の定義との差分：docs/tmp/pay_guard_1126/diff_live.md。
--   事前確認：docs/tmp/pay_guard_1126/0234_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/pay_guard_1126/0234_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 check_pay（作り直し＝伝票の行を押さえる） ═══
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text, p_fee_key text DEFAULT NULL::text, p_fee_rate numeric DEFAULT NULL::numeric, p_fee_on boolean DEFAULT true, p_fee_amount integer DEFAULT NULL::integer, p_disc_rate numeric DEFAULT NULL::numeric, p_disc_amount integer DEFAULT NULL::integer)
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
  v_dkey text; v_drate numeric := 0; v_disc int := 0; v_did uuid;
  v_dbase text := 'total'; v_dnet int := 0; v_dman boolean := false;  -- ★0187（便 CASH）: 割引の基準（total＝合計から・subtotal＝小計から）・小計・指定額  -- ★11 0175 v2（CN-R ③）: 支払方法による割引（393 の裏返し＝別キー pay_discount_rates）
  v_fee_source text := 'auto';  -- ★21 0175 v2（裁定393 追補4）: auto（店の率）／none／manual（この入金だけの額）
  v_mem uuid;  -- ★3 0173（裁定389）: 操作者の membership
  v_aeff int := 0;  -- ★0210（起票140）: 税・サ込みの額（割引を引いた後）＝支払方法の割引の母数から除く
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_pay');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
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

  -- ★0234（#173・入金の二度押し）: 伝票の行を押さえてから残額を見る＝同じ伝票への入金は 1 本ずつ（後の 1 本は前の入金を数えてから残額を見る・同じ冪等キーの再送は前の id を返す）
  select * into v_chk from public.checks where id = p_check_id for update;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
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
      -- ★0187（便 CASH・Agoora 確定 10/27＋補遺）: 入金ごとの割引の上書き＝率を指定（p_disc_rate）／額を指定（p_disc_amount・0＝なし）＝M-6 のカード手数料と同じ形
      if p_disc_rate is not null and (p_disc_rate < 0 or p_disc_rate > 100) then raise exception 'bad disc_rate'; end if;
      if p_disc_amount is not null and (p_disc_amount < 0 or p_disc_amount > v_due - v_paid) then raise exception 'bad disc_amount'; end if;
      if p_disc_rate is not null then v_drate := p_disc_rate; end if;
      v_dbase := case when coalesce(v_settings, '{}'::jsonb)->>'pay_discount_base' = 'subtotal' then 'subtotal' else 'total' end;   -- ★0187: 既定＝合計から（T15 の回答待ちの仮置き）
      if p_disc_amount is not null then
        v_dman := true; v_disc := p_disc_amount;   -- 額を指定（0＝なし）
      elsif v_drate > 0 then
        if v_dbase = 'subtotal' then
          -- 小計から＝税・サの前の小計（未入金分の比で按分）× 率＝割引行はサ・税の前に効く（従来の行の扱い）
          select coalesce(sum(line_total) filter (where kind <> 'discount' and fee_kind is distinct from 'pay_fee' and not all_in), 0)::int   -- ★0210: 込みの行は小計からの割引の母数に入れない
               - coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int
            into v_dnet from public.check_lines where check_id = p_check_id and pay_group = v_grp;
          v_disc := round(greatest(0, v_dnet)::numeric * (v_due - v_paid) / greatest(v_due, 1) * v_drate / 100.0)::int;
        else
          -- 合計から＝税・サ込みの残額 × 率＝最後に引く（check_group_due が丸めた合計から引いてから店の丸め規則でもう一度丸める＝事後承認 ②）
          -- ★0210（相談役 11/25）: 支払方法の割引は込みの額に掛けない＝込みの額（割引を引いた後）を除いた分の比で残額に掛ける。込みの行が無い伝票は今と同じ式
          select greatest(0, coalesce(sum(line_total) filter (where kind <> 'discount' and all_in), 0)::int
                 - greatest(0, coalesce(sum(line_total) filter (where kind = 'discount' and fee_kind is distinct from 'pay_discount_total'), 0)::int
                             - coalesce(sum(line_total) filter (where kind <> 'discount' and not all_in), 0)::int
                             - case when v_grp = 'A' then coalesce((select sum(r.amount) from public.check_referrals r where r.check_id = p_check_id and r.burden = 'customer'), 0)::int else 0 end))
            into v_aeff from public.check_lines where check_id = p_check_id and pay_group = v_grp;
          if v_aeff > 0 then
            v_disc := round(greatest(0, v_due - v_aeff)::numeric * (v_due - v_paid) / greatest(v_due, 1) * v_drate / 100.0)::int;
          else
            v_disc := round((v_due - v_paid) * v_drate / 100.0)::int;
          end if;
        end if;
      end if;
      if v_disc > 0 then
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order, time_auto, fee_kind, tax_category, fee_rate)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'discount', v_grp,
                  (case v_dkey when 'cash' then '現金割引' when 'card' then 'カード割引' when 'emoney' then '電子マネー割引' else '決済割引' end)
                  || case when v_dman then '（指定）' else ' ' || rtrim(rtrim(to_char(v_drate, 'FM990.0'), '0'), '.') || '%' end
                  || case when v_dbase = 'subtotal' then '（小計から）' else '' end,
                  v_disc, 1, v_disc, null, v_sort, false, case when v_dbase = 'subtotal' then 'pay_discount' else 'pay_discount_total' end, 'taxable_10', case when v_dman then null else v_drate end)
          returning id into v_did;
          perform public.check_recalc(p_check_id);
          v_due := public.check_group_due(p_check_id, v_grp);
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
      'pay_discount', v_disc, 'pay_discount_rate', v_drate, 'pay_discount_line_id', v_did, 'pay_discount_base', v_dbase, 'pay_discount_manual', v_dman), v_chk.store_id);   -- ★6 0173: 手数料の痕跡・★1 0175: ON／OFF・店設定の率・上書きの有無・★11 v2: 割引
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
end $function$;

revoke execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer, numeric, integer) from public, anon;
grant execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text, text, numeric, boolean, integer, numeric, integer) to authenticated;

-- ═══ ★2 check_set_ext_rule（作り直し＝入金の後は止める） ═══
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
  v_paycnt int;  -- ★0234（#41）: 入金の数
begin
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_set_ext_rule');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_rule_id is null then raise exception 'bad rule'; end if;
  select * into v_chk from public.checks where id = p_check_id for update;   -- ★0234（#41）: 入金（check_pay も行を押さえる）と順に
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
  -- ★0234（#41）: 入金の後は延長パターンを変えない＝伝票の額が動くほかの 9 本（check_time_charge_apply・check_set_people ほか）と同じ止め
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
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
end $function$;

revoke execute on function public.check_set_ext_rule(uuid, uuid) from public, anon;
grant execute on function public.check_set_ext_rule(uuid, uuid) to authenticated;

commit;
