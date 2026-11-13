-- 0201f_mynumber_key.sql（2026-11-13・CC 起草・同日 直し＝暗号文の形の CHECK を足し Vault の鍵の削除を 0201f2 に分けた・貼らない＝合図は相談役）マイナンバーの鍵をアプリ側の暗号化へ（案 1＝裁定497-3）＋廃棄の候補を裁定483 に
-- 翻訳元: set_cast_sensitive＝supabase/migrations/0201b_ar_age_taxdisplay.sql の版（本番 md5 d5342c38）／get_cast_mynumber・get_cast_mynumber_masked・cast_mynumber_discard_candidates＝本番の pg_get_functiondef（docs/tmp/live0201f・2026-11-11 夜 read only）／
--         set_store_profile＝docs/tmp/0201g_pin_device.sql の版（0201g の後の本番 md5 d4f558b6）＋生成器 docs/tmp/gen_0201f.cjs（アンカー置換・足したコメントは独立した行＝教訓138）
-- 検証クエリ: docs/tmp/0201f_verify.sql（1 回の SELECT で全行・先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
--   例: select 'nox-project-proof', count(*) from public.orgs;
--       select data_type from information_schema.columns where table_schema='public' and table_name='cast_sensitive' and column_name='mynumber_enc';   -- text
--       select count(*) from pg_constraint where conname = 'cast_sensitive_mynumber_enc_form_check';   -- 1
-- 事前確認: docs/tmp/0201f_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）・手順書 docs/tmp/handpaste_0201f.md
-- 前提＝0201e3 → 0201g の後（関数 442・表 121）・暗号文 0 件・Vercel の Production に NOX_MYNUMBER_KEYS と NOX_MYNUMBER_KEY_CURRENT（名前だけ確かめる）・フラグ便（client）を用意してから貼る
-- ★1 cast_sensitive.mynumber_enc bytea → text（暗号文の形 nox1:<版>:<base64>）＝0 件なので using null（貼る前に 0 件を本文の中でも確かめる）
-- ★2 cast_sensitive.mynumber_registered_on（date・番号を登録した日）を足す
-- ★3 set_cast_sensitive＝暗号文だけを受ける（平文 12 桁＝'plaintext rejected'・形の違い＝'bad ciphertext'・null＝変更なし）・Vault を読まない・登録した日を書く・0201b の 18 歳の検査は残す（同じ署名・ACL 不変）
-- ★4 get_cast_mynumber＝暗号文を返すだけ（service_role だけ・柵と監査 read_cast_mynumber は今のまま・同じ署名・ACL 不変）
-- ★5 get_cast_mynumber_masked＝drop して (p_org_id, p_actor, p_cast_id) で作り直し＝service_role だけ・権限の確かめ（管理者／自店の店長／本人）＋暗号文・監査 read_cast_mynumber_masked は残す（authenticated から外す）
-- ★6 cast_mynumber_discard_candidates＝drop して作り直し（戻り値が変わる）＝裁定483 の条件・在籍中の印・最後の年・登録日・年数・期日（owner だけ・ACL は今と同じ authenticated＋service_role）
-- ★7 cast_mynumber_discard_status は作り直さない（今の本番は 1 人の廃棄の記録を返す関数＝候補の条件を持たない）
-- ★8 set_store_profile＝白名単に mynumber_retention_years（整数 1〜20・既定 7）（0201g の版から・同じ署名・ACL 不変）
-- ★9 cast_sensitive に暗号文の形の CHECK（cast_sensitive_mynumber_enc_form_check＝null か nox1:<版>:<base64>・256 字まで・base64 は 4 の倍数＝set_cast_sensitive の 'bad ciphertext' と同じ形）＝関数を通らない書込みでも平文が入らない（2026-11-13 相談役【2】）
-- ★10 Vault の nox_mynumber_key の削除は 0201f から外した＝別の 1 本 0201f2（0201f のフラグ便を本番で確かめたあとに貼る・2026-11-13 相談役【2】）
-- 関数の数は変えない（drop 2・create 2・作り直し 5）＝442／121 のまま。既存の行の値は書き換えない（mynumber_enc は全行 null のまま型だけ変わる・CHECK を 1 本足す・Vault は触らない）。
-- ★教訓132: begin の直後に lock_timeout（statement_timeout も）
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- ═══ ★0 暗号文 0 件を本文の中でも確かめる（事前確認の二重） ═══
do $guard$
begin
  if exists (select 1 from public.cast_sensitive where mynumber_enc is not null) then
    raise exception '0201f: mynumber_enc has rows (re-encrypt first)';
  end if;
end $guard$;

-- ═══ ★1 ★2 cast_sensitive の列 ═══
alter table public.cast_sensitive alter column mynumber_enc type text using null::text;
comment on column public.cast_sensitive.mynumber_enc is '★0201f（案 1）: マイナンバーの暗号文 nox1:<版>:<base64>（AES-256-GCM・96 bit の nonce・AAD＝cast_id・鍵は Vercel の env＝DB には鍵が無い）';
alter table public.cast_sensitive add column mynumber_registered_on date;
comment on column public.cast_sensitive.mynumber_registered_on is '★0201f（裁定483）: 番号を登録した日（JST）＝支払いが一度も無い人の廃棄の候補の数え始め';
-- ★9（2026-11-13 相談役【2】）: 暗号文の形の CHECK＝set_cast_sensitive の 'bad ciphertext' と同じ形（復号した長さの検査は関数の側だけ）
alter table public.cast_sensitive add constraint cast_sensitive_mynumber_enc_form_check check (mynumber_enc is null or (length(mynumber_enc) <= 256 and mynumber_enc ~ '^nox1:[a-z0-9]{1,16}:[A-Za-z0-9+/]+={0,2}$' and length(split_part(mynumber_enc, ':', 3)) % 4 = 0));

-- ═══ ★3 set_cast_sensitive（0201b の版・同じ署名・ACL 不変） ═══
CREATE OR REPLACE FUNCTION public.set_cast_sensitive(p_cast_id uuid, p_real_name text, p_birthday date, p_mynumber text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org      uuid;
  v_cast_store    uuid;
  v_fields        text[] := array[]::text[];
  v_old_real_name text;
  v_old_birthday  date;
  -- ★0201f（2026-11-13・案 1）: 暗号文は text（nox1:<版>:<base64>）・鍵は DB に無い（Vault を読まない）
  v_enc           text;
  v_b64           text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★0201b ★2（2026-11-10）: 18 歳未満は登録しない（cast_create の 'under 18' と同じ＝JST の今日から 18 年前より後の生年月日は拒否）・未来の日付も拒否
  if p_birthday is not null and p_birthday > ((now() at time zone 'Asia/Tokyo')::date - interval '18 years')::date then raise exception 'under 18'; end if;
  select cs.real_name, cs.birthday into v_old_real_name, v_old_birthday
    from public.cast_sensitive cs where cs.cast_id = p_cast_id;

  -- ★0201f（2026-11-13・案 1）: p_mynumber はアプリ側（route のサーバー）で暗号化した暗号文だけを受ける（AES-256-GCM・鍵は Vercel の env）
  --   平文 12 桁（空白・ハイフン入りも）＝'plaintext rejected'／形が違う（接頭辞 nox1:・版・base64・復号した長さ 29〜128 バイト）＝'bad ciphertext'／null＝変更なし（今のまま）
  --   条件は 1 つずつの if で評価する（OR の評価の順番に頼らない＝教訓148・decode は形を確かめた後だけ）
  if p_mynumber is not null then
    if regexp_replace(p_mynumber, '[[:space:]-]', '', 'g') ~ '^[0-9]{12}$' then raise exception 'plaintext rejected'; end if;
    if length(p_mynumber) > 256 then raise exception 'bad ciphertext'; end if;
    if p_mynumber !~ '^nox1:[a-z0-9]{1,16}:[A-Za-z0-9+/]+={0,2}$' then raise exception 'bad ciphertext'; end if;
    v_b64 := split_part(p_mynumber, ':', 3);
    if length(v_b64) % 4 <> 0 then raise exception 'bad ciphertext'; end if;
    if octet_length(decode(v_b64, 'base64')) not between 29 and 128 then raise exception 'bad ciphertext'; end if;
    v_enc := p_mynumber;
  else
    v_enc := null;
  end if;

  -- ★0201f（裁定483）: 番号を登録した日（JST）＝支払いが一度も無い人の廃棄の候補の数え始め・null（変更なし）のときは今の値のまま
  insert into public.cast_sensitive (cast_id, org_id, store_id, real_name, birthday, mynumber_enc, mynumber_registered_on)
  values (p_cast_id, v_cast_org, v_cast_store, p_real_name, p_birthday, v_enc, case when p_mynumber is not null then (now() at time zone 'Asia/Tokyo')::date end)
  on conflict (cast_id) do update
    set real_name = excluded.real_name, birthday = excluded.birthday,
        mynumber_enc = case when p_mynumber is not null then excluded.mynumber_enc else public.cast_sensitive.mynumber_enc end,
        mynumber_registered_on = case when p_mynumber is not null then excluded.mynumber_registered_on else public.cast_sensitive.mynumber_registered_on end,
        store_id = excluded.store_id;

  if p_real_name is distinct from v_old_real_name then v_fields := array_append(v_fields, 'real_name'); end if;
  if p_birthday  is distinct from v_old_birthday  then v_fields := array_append(v_fields, 'birthday');  end if;
  if p_mynumber is not null then v_fields := array_append(v_fields, 'mynumber'); end if;
  perform public.audit_log_write('set_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, jsonb_build_object('fields_changed', to_jsonb(v_fields)), v_cast_store);
  return p_cast_id;
end $function$;

-- ═══ ★4 get_cast_mynumber（同じ署名・ACL 不変＝service_role だけ） ═══
CREATE OR REPLACE FUNCTION public.get_cast_mynumber(p_org_id uuid, p_actor uuid, p_cast_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★0201f（2026-11-13・案 1）: 暗号文（text）を返すだけ＝復号は route がサーバーで（鍵は DB に無い）・柵（service_role だけ・org の照合）と監査は今のまま
  v_cast_org uuid; v_cast_store uuid; v_enc text;
begin
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
    where c.id = p_cast_id;
  if v_cast_org is null then raise exception 'not found'; end if;
  if p_org_id is null or v_cast_org <> p_org_id then raise exception 'forbidden'; end if;

  perform public.audit_log_write_service(p_org_id, p_actor, 'read_cast_mynumber',
    'cast_sensitive:' || p_cast_id::text, null, null, v_cast_store);

  return v_enc;
end $function$;

-- ═══ ★5 get_cast_mynumber_masked（drop して作り直し＝service_role だけ） ═══
drop function public.get_cast_mynumber_masked(uuid);
CREATE OR REPLACE FUNCTION public.get_cast_mynumber_masked(p_org_id uuid, p_actor uuid, p_cast_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role        text;
  v_actor_store uuid;
  v_actor_cast  uuid;
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_enc         text;
begin
  -- ★0201f（2026-11-13・案 1）: 末尾 4 桁の口＝service_role だけ（route が呼ぶ・復号して末尾 4 桁だけを返すのは route）。DB は権限を確かめて暗号文を返す
  --   呼ぶ人＝p_actor（users.id・get_cast_mynumber と同じ形）・org＝p_org_id（route が auth_org_id から渡す）。誰が見られるかは 0193 のまま＝管理者（admin を含む）・自店の店長・本人
  if p_org_id is null or p_actor is null or p_cast_id is null then raise exception 'forbidden'; end if;
  select case when m.role = 'admin' then 'owner' else m.role end, m.store_id
    into v_role, v_actor_store
    from public.users u join public.memberships m on m.user_id = u.id and m.is_active
   where u.id = p_actor and u.is_active and u.org_id = p_org_id;
  if v_role is null then raise exception 'forbidden'; end if;
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
   where c.id = p_cast_id;
  if v_cast_org is null or v_cast_org <> p_org_id then raise exception 'forbidden'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_cast_store is distinct from v_actor_store then raise exception 'forbidden'; end if;
  elsif v_role = 'cast' then
    select c.id into v_actor_cast from public.casts c where c.user_id = p_actor and c.is_active;
    if v_actor_cast is null or v_actor_cast <> p_cast_id then raise exception 'forbidden'; end if;
  else
    raise exception 'forbidden';
  end if;

  perform public.audit_log_write_service(p_org_id, p_actor, 'read_cast_mynumber_masked',
    'cast_sensitive:' || p_cast_id::text, null, null, v_cast_store);

  return v_enc;
end $function$;
revoke all on function public.get_cast_mynumber_masked(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_cast_mynumber_masked(uuid, uuid, uuid) to service_role;

-- ═══ ★6 cast_mynumber_discard_candidates（drop して作り直し＝戻り値が変わる） ═══
drop function public.cast_mynumber_discard_candidates(uuid);
CREATE OR REPLACE FUNCTION public.cast_mynumber_discard_candidates(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cast_id uuid, store_id uuid, name text, left_on date, in_service boolean, last_tax_year integer, registered_on date, retention_years integer, due_on date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★0201f（裁定483）: 候補＝退店した人、または在籍中で支払いが途絶えた人のうち、
  --   最後に支払調書の対象になった年（無ければ番号を登録した日の年）の翌年 1/1 ＋ N 年 ≦ 今日（JST）。N＝店の設定 mynumber_retention_years（既定 7）
  --   支払調書の対象になった年＝確定（finalized／paid）した給与の run の period の年で、その人の明細の支払金額（breakdown_json.pay.gross）が 0 より大きい年
  --   （tax-report-csv と同じ年分の数え方＝payroll_runs.period の年・lib/nox/payroll/tax-report.ts）。年 50 万円と委託の絞りは掛けない（候補が遅く出る側＝早く消しすぎない）
  --   在籍中＝退店日が無く有効な人（印を付けて出す・廃棄するかはオーナーが判断・自動では消さない）。年も登録日も無い人は出さない
  return query
    with base as (
      select c.id cid, c.store_id sid, c.name nm, c.left_on lo,
             (c.left_on is null and c.is_active) ins,
             (select max(left(pr.period, 4)::int)
                from public.payslips ps
                join public.payroll_runs pr on pr.id = ps.run_id
               where ps.cast_id = c.id
                 and ps.org_id = c.org_id
                 and pr.status in ('finalized','paid')
                 and (case when jsonb_typeof(ps.breakdown_json->'pay'->'gross') = 'number' then (ps.breakdown_json->'pay'->>'gross')::numeric else 0 end) > 0) lty,
             cs.mynumber_registered_on reg,
             coalesce(nullif(trim(s.settings_json->>'mynumber_retention_years'), '')::int, 7) n
        from public.casts c
        join public.cast_sensitive cs on cs.cast_id = c.id
        join public.stores s on s.id = c.store_id
       where c.org_id = public.auth_org_id()
         and (p_store_id is null or c.store_id = p_store_id)
         and cs.mynumber_enc is not null
    ), d as (
      select b.cid, b.sid, b.nm, b.lo, b.ins, b.lty, b.reg, b.n,
             (make_date(coalesce(b.lty, extract(year from b.reg)::int) + 1, 1, 1) + make_interval(years => b.n))::date due
        from base b
    )
    select d.cid, d.sid, d.nm, d.lo, d.ins, d.lty, d.reg, d.n, d.due
      from d
     where d.due is not null
       and d.due <= (now() at time zone 'Asia/Tokyo')::date
     order by d.due, d.nm;
end $function$;
revoke all on function public.cast_mynumber_discard_candidates(uuid) from public, anon;
grant execute on function public.cast_mynumber_discard_candidates(uuid) to authenticated, service_role;

-- ═══ ★8 set_store_profile（0201g の版＋mynumber_retention_years・同じ署名・ACL 不変） ═══
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
                             -- ★0201b ★4（2026-11-11 相談役）: ar_enabled を白名単から外す（売掛の書き手は set_store_receivable_policy の 1 本＝列と ar_enabled を同時に書く）
                             'okuri_base_amount',                                                         -- ★4 0158: 裁定317 の 1 キー（整数 0〜99999）（0164 ★2: 末尾 '];' → ','）
                             -- ★0201b ★3（2026-11-10）: tax_inclusive_display を白名単から外す（税込の表示は stores.price_display が正本＝計算と凍結の実体）
                             'invoice_registered_on','pay_day','use_vip','use_counter','payment_methods','punch_methods',   -- ★2 0164: 裁定331 C 5 項目＋334 フロア機能（列側 7 キー）（0172 ★3: 末尾 '];' → ','）
                             'settlement_cycle','mid_pay','shift_auto_confirm_hours',   -- ★3 0172: 裁定349 の 2 キー（精算方式・途中払い）＋裁定380 の自動確定時間（0173 ★7: 末尾 '];' → ','）
                             'join_mode','cast_register_device','pay_fee_rates','trial_guarantee_days','default_plan_id',   -- ★7 0173: 裁定386／389／393／396 の 5 キー（0175 ★3: 末尾 '];' → ','）
                             'sys_wage_cut_rule','bonus_tier_mode','sales_split','pt_rules_default',                         -- ★3 0175: X13-I ②（就業規則に減給の定め）・裁定404（達成ボーナスの段）・409（売上の分け方）・405（店の既定 pt ルール）
                             'punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m',                 -- ★8 0175（398 打刻設定・列側）
                             'punch_require_shift','punch_round_unit','punch_round_mode','punch_round_consent_version',       -- ★8 0175（398）: 同意版は列に書かず punch_round_consents に 1 行（v2: 末尾 '];' → ','）
                             'service_rate_by_seat','pay_discount_rates','sys_drink_count_back','sales_subtotal_mode','sales_subtotal_includes_shimei',   -- ★11 0175 v2（CN-R ②③⑨⑩）
                             'settlement_week_close_dow','settlement_pay_days_after','daily_pay_cap_tiers',
                             'sys_staff_discount','staff_discount_cap','sys_cast_register',
                             'kiosk_features','kiosk_idle_sec','kiosk_person_idle_minutes',   -- ★0192 M-49
                             'okuri_flat_tiers',
                             'pay_discount_base',
                             'duty_gate',
                             'kind_back_rate','withholding_default_cast','withholding_default_staff','cash_float_default','settlement_close_day',
                             'punch_mode','register_window_before_min','register_window_after_min',
                             'line_notify',
                             'cast_register_scope',
                             -- ★0201f（裁定483）: マイナンバーの廃棄の候補の年数（整数 1〜20・既定 7）
                             'trial_wage','trial_back','mynumber_retention_years'];   -- ★0200（裁定473）: 会計できる卓＝all（既定）／own   -- ★0199（裁定459・M-114）: LINE 通知の種類ごとの ON／OFF（object）   -- ★0197（裁定455 の 1・5）: 打刻の 3 択目（'punch'／'store'）と確定シフトの前後の窓（分）   -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目   -- ★0190（裁定436）: 打刻ゲート（boolean・既定 true＝false の店はレジの check_* で打刻を見ない）   -- ★0187（便 CASH）: 現金割引の基準（total＝合計から・既定／subtotal＝小計から）   -- ★1 0180（裁定414 追補）: 送り 定額の距離区分（配列・最大 3・{code,name,amount}）                                                                -- ★27 0175 v2 追補 2 同乗 R-7（裁定423 候補）                                     -- ★24／★25 0175 v2 追補 2（裁定421 候補・裁定420）                   -- ★11 0175 v2（CN-R ⑳ 週払い・日払いの上限）
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
  -- ★0201g 作り直し（2026-11-12 相談役）: ハードの保存の検査に使う値（patch にキーがあれば patch の値・無ければ店の今の値）
  v_chk_enf  boolean;
  v_chk_mode text;
  v_chk_ip   boolean;
  v_chk_geo  boolean;
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
  v_scope    text;
  v_trw      numeric;   -- ★0201c（裁定480）: trial_wage（体入の時給・整数 0〜100000）
  v_trb      text;      -- ★0201c（裁定480）: trial_back（体入中のバック＝same／none）      -- ★0200（裁定473）: cast_register_scope
  -- ★0201f（裁定483）: mynumber_retention_years（整数 1〜20）
  v_myret    numeric;
  v_kf       jsonb;     -- ★27 v2 R-7: kiosk_features {punch, register, shift}
  v_pdb      text;      -- ★0187: pay_discount_base
  v_dg       boolean;   -- ★0190: duty_gate
  v_oft      jsonb;     -- ★1 0180: okuri_flat_tiers（配列・最大 3）
  v_oe       jsonb;     -- ★1 0180: okuri_flat_tiers の要素
  v_ocodes   text[] := '{}';   -- ★1 0180: code の重複検査
  v_kis      numeric;   -- ★27 v2 R-7: kiosk_idle_sec（60〜900・既定 180）
  v_kpi      numeric;   -- ★0192 M-49: kiosk_person_idle_minutes（1〜120・既定 10＝キオスクの本人でログインの無操作で戻す分）
  v_pmd      text;      -- ★0197: punch_mode（'punch'＝既定／'store'＝打刻しない・店が勤怠を付ける）
  v_rwb      numeric;   -- ★0197: register_window_before_min（0〜240・既定 30）
  v_rwa      numeric;   -- ★0197: register_window_after_min（0〜240・既定 60）
  v_kbr      jsonb;     -- ★0191: kind_back_rate {hon, jonai, free}（整数 0〜100）
  v_wdc      text;      -- ★0191: withholding_default_cast（hostess／none）
  v_wds      text;      -- ★0191: withholding_default_staff（none／other_204）
  v_cfd      numeric;   -- ★0191: cash_float_default（整数 0〜9,999,999）
  v_scd      numeric;   -- ★0191: settlement_close_day（15／20／25／31＝末日）
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

  if p_patch ? 'duty_gate' then   -- ★0190（裁定436・相談役案）: 打刻ゲート＝既定 ON（キオスク端末が 0 台の店は client が注意を出す）
    if jsonb_typeof(p_patch->'duty_gate') <> 'boolean' then raise exception 'bad type'; end if;
    v_dg := (p_patch->>'duty_gate')::boolean;
    v_before   := v_before || jsonb_build_object('duty_gate', coalesce((v_settings->>'duty_gate')::boolean, true));
    v_after    := v_after  || jsonb_build_object('duty_gate', v_dg);
    v_settings := jsonb_set(v_settings, '{duty_gate}', to_jsonb(v_dg), true);
  end if;
  if p_patch ? 'pay_discount_base' then   -- ★0187（便 CASH・Agoora 確定 10/27）: 割引対象＝合計から（既定）／小計から（税理士 T15 の回答待ちの仮置き）
    if jsonb_typeof(p_patch->'pay_discount_base') <> 'string' then raise exception 'bad type'; end if;
    v_pdb := p_patch->>'pay_discount_base';
    if v_pdb is null or v_pdb not in ('total','subtotal') then raise exception 'bad pay_discount_base'; end if;
    v_before   := v_before || jsonb_build_object('pay_discount_base', coalesce(v_settings->>'pay_discount_base', 'total'));
    v_after    := v_after  || jsonb_build_object('pay_discount_base', v_pdb);
    v_settings := jsonb_set(v_settings, '{pay_discount_base}', to_jsonb(v_pdb), true);
  end if;

  if p_patch ? 'okuri_flat_tiers' then                                                                   -- ★1 0180（裁定414 追補）: 定額徴収の距離区分＝配列・最大 3・要素 {code,name,amount}（settlement_presets と同型）
    v_oft := p_patch->'okuri_flat_tiers';                                                                -- ★1
    if jsonb_typeof(v_oft) <> 'array' or jsonb_array_length(v_oft) > 3 then raise exception 'bad type'; end if;   -- ★1: 最大 3 段
    v_ocodes := '{}';                                                                                     -- ★1
    for v_oe in select e from jsonb_array_elements(v_oft) e loop                                          -- ★1
      if jsonb_typeof(v_oe) <> 'object'                                                                   -- ★1
         or coalesce(jsonb_typeof(v_oe->'code'), '') <> 'string' or length(trim(v_oe->>'code')) = 0 or length(v_oe->>'code') > 32   -- ★1
         or coalesce(jsonb_typeof(v_oe->'name'), '') <> 'string' or length(trim(v_oe->>'name')) = 0 or length(v_oe->>'name') > 40   -- ★1
         or coalesce(jsonb_typeof(v_oe->'amount'), '') <> 'number'                                        -- ★1
         or (v_oe->>'amount')::numeric < 0 or (v_oe->>'amount')::numeric <> trunc((v_oe->>'amount')::numeric) then   -- ★1: 整数 ≥0
        raise exception 'bad type';                                                                       -- ★1
      end if;                                                                                             -- ★1
      if (v_oe->>'code') = any (v_ocodes) then raise exception 'bad type'; end if;                        -- ★1: code 一意
      v_ocodes := v_ocodes || (v_oe->>'code');                                                            -- ★1
    end loop;                                                                                             -- ★1
    v_before   := v_before || jsonb_build_object('okuri_flat_tiers', coalesce(v_settings->'okuri_flat_tiers', '[]'::jsonb));   -- ★1
    v_after    := v_after  || jsonb_build_object('okuri_flat_tiers', v_oft);                              -- ★1
    v_settings := jsonb_set(v_settings, '{okuri_flat_tiers}', v_oft, true);                               -- ★1
  end if;                                                                                                 -- ★1

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
  -- ★0201g（相談役 ■3d の訂正・2026-11-11／作り直し 2026-11-12 相談役）: ハードの保存の検査は patch が打刻のキー（punch_enforce・punch_restrict_mode・punch_lat・punch_lng・punch_radius_m）を含む保存だけ
  --   値＝patch にキーがあれば patch の値（明示の null も含む＝null で検査をすり抜けない）・無ければ店の今の値。restrict_mode が null は gps（punch_self_impl と同じ）
  --   方法ごとの必須＝ip：店の IP（punch_allow_ip）1 件以上／gps：位置（lat・lng）と半径／both：両方／either：IP 1 件以上か位置と半径（どちらも無ければ 'ip required'）／tablet：検査しない。ハードでなければ検査しない
  if p_patch ?| array['punch_enforce','punch_restrict_mode','punch_lat','punch_lng','punch_radius_m'] then
    v_chk_enf  := case when p_patch ? 'punch_enforce' then v_penf else v_store.punch_enforce end;
    v_chk_mode := coalesce(case when p_patch ? 'punch_restrict_mode' then v_pmode else v_store.punch_restrict_mode end, 'gps');
    v_chk_geo  := (case when p_patch ? 'punch_lat' then v_plat else v_store.punch_lat end) is not null
              and (case when p_patch ? 'punch_lng' then v_plng else v_store.punch_lng end) is not null
              and (case when p_patch ? 'punch_radius_m' then v_prad else v_store.punch_radius_m end) is not null;
    -- 店の IP は v_store に無い（読んだ列だけの record）＝行から読む（for update＝store_wifi_remove と同じ行の錠で順に並べる）
    select coalesce(cardinality(s2.punch_allow_ip), 0) > 0 into v_chk_ip from public.stores s2 where s2.id = p_store_id for update;
    if coalesce(v_chk_enf, false) then
      if v_chk_mode in ('ip','both') and not v_chk_ip then raise exception 'ip required'; end if;
      if v_chk_mode = 'either' and not v_chk_ip and not v_chk_geo then raise exception 'ip required'; end if;
      if v_chk_mode in ('gps','both') and not v_chk_geo then raise exception 'range required'; end if;
    end if;
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
    v_before   := v_before || jsonb_build_object('sys_cast_register', v_settings->'sys_cast_register');   -- ★0200（裁定473）: 旧キー cast_register_enabled は廃止（書かない・消す）
    v_after    := v_after  || jsonb_build_object('sys_cast_register', v_scr::int);
    v_settings := jsonb_set(v_settings, '{sys_cast_register}', to_jsonb(v_scr::int), true) - 'cast_register_enabled';
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
  if p_patch ? 'punch_mode' then   -- ★0197（裁定455 の 1）: 打刻の 3 択目＝'store' のとき punch_methods は無視（白名単は触らない）
    if jsonb_typeof(p_patch->'punch_mode') <> 'string' then raise exception 'bad type'; end if;
    v_pmd := p_patch->>'punch_mode';
    if v_pmd is null or v_pmd not in ('punch','store') then raise exception 'bad punch_mode'; end if;
    v_before   := v_before || jsonb_build_object('punch_mode', coalesce(v_settings->>'punch_mode', 'punch'));
    v_after    := v_after  || jsonb_build_object('punch_mode', v_pmd);
    v_settings := jsonb_set(v_settings, '{punch_mode}', to_jsonb(v_pmd), true);
  end if;
  if p_patch ? 'register_window_before_min' then   -- ★0197（裁定455 の 5）: 確定シフトの開始の何分前からレジを開けるか
    if jsonb_typeof(p_patch->'register_window_before_min') <> 'number' then raise exception 'bad type'; end if;
    v_rwb := (p_patch->>'register_window_before_min')::numeric;
    if v_rwb <> floor(v_rwb) or v_rwb < 0 or v_rwb > 240 then raise exception 'bad register_window_before_min'; end if;
    v_before   := v_before || jsonb_build_object('register_window_before_min', v_settings->'register_window_before_min');
    v_after    := v_after  || jsonb_build_object('register_window_before_min', v_rwb::int);
    v_settings := jsonb_set(v_settings, '{register_window_before_min}', to_jsonb(v_rwb::int), true);
  end if;
  if p_patch ? 'register_window_after_min' then   -- ★0197（裁定455 の 5）: 終了の何分後まで
    if jsonb_typeof(p_patch->'register_window_after_min') <> 'number' then raise exception 'bad type'; end if;
    v_rwa := (p_patch->>'register_window_after_min')::numeric;
    if v_rwa <> floor(v_rwa) or v_rwa < 0 or v_rwa > 240 then raise exception 'bad register_window_after_min'; end if;
    v_before   := v_before || jsonb_build_object('register_window_after_min', v_settings->'register_window_after_min');
    v_after    := v_after  || jsonb_build_object('register_window_after_min', v_rwa::int);
    v_settings := jsonb_set(v_settings, '{register_window_after_min}', to_jsonb(v_rwa::int), true);
  end if;
  if p_patch ? 'kiosk_person_idle_minutes' then   -- ★0192 M-49（kiosk_idle_sec と同型）
    if jsonb_typeof(p_patch->'kiosk_person_idle_minutes') <> 'number' then raise exception 'bad type'; end if;
    v_kpi := (p_patch->>'kiosk_person_idle_minutes')::numeric;
    if v_kpi <> floor(v_kpi) or v_kpi < 1 or v_kpi > 120 then raise exception 'bad kiosk_person_idle_minutes'; end if;
    v_before   := v_before || jsonb_build_object('kiosk_person_idle_minutes', v_settings->'kiosk_person_idle_minutes');
    v_after    := v_after  || jsonb_build_object('kiosk_person_idle_minutes', v_kpi::int);
    v_settings := jsonb_set(v_settings, '{kiosk_person_idle_minutes}', to_jsonb(v_kpi::int), true);
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

  -- ★0191（便 OB-2 ⑤）: 初期設定 v5 の器なし 5 項目（settings_json）
  if p_patch ? 'kind_back_rate' then
    if jsonb_typeof(p_patch->'kind_back_rate') <> 'object' then raise exception 'bad type'; end if;
    v_kbr := p_patch->'kind_back_rate';
    if exists (select 1 from jsonb_each(v_kbr) e where e.key not in ('hon','jonai','free') or jsonb_typeof(e.value) <> 'number' or (e.value::text)::numeric < 0 or (e.value::text)::numeric > 100 or (e.value::text)::numeric <> floor((e.value::text)::numeric)) then raise exception 'bad kind_back_rate'; end if;
    v_before   := v_before || jsonb_build_object('kind_back_rate', coalesce(v_settings->'kind_back_rate', '{}'::jsonb));
    v_after    := v_after  || jsonb_build_object('kind_back_rate', v_kbr);
    v_settings := jsonb_set(v_settings, '{kind_back_rate}', v_kbr, true);
  end if;
  if p_patch ? 'withholding_default_cast' then
    if jsonb_typeof(p_patch->'withholding_default_cast') <> 'string' then raise exception 'bad type'; end if;
    v_wdc := p_patch->>'withholding_default_cast';
    if v_wdc is null or v_wdc not in ('hostess','none') then raise exception 'bad withholding_default_cast'; end if;
    v_before   := v_before || jsonb_build_object('withholding_default_cast', coalesce(v_settings->>'withholding_default_cast', 'hostess'));
    v_after    := v_after  || jsonb_build_object('withholding_default_cast', v_wdc);
    v_settings := jsonb_set(v_settings, '{withholding_default_cast}', to_jsonb(v_wdc), true);
  end if;
  if p_patch ? 'withholding_default_staff' then
    if jsonb_typeof(p_patch->'withholding_default_staff') <> 'string' then raise exception 'bad type'; end if;
    v_wds := p_patch->>'withholding_default_staff';
    if v_wds is null or v_wds not in ('none','other_204') then raise exception 'bad withholding_default_staff'; end if;
    v_before   := v_before || jsonb_build_object('withholding_default_staff', coalesce(v_settings->>'withholding_default_staff', 'none'));
    v_after    := v_after  || jsonb_build_object('withholding_default_staff', v_wds);
    v_settings := jsonb_set(v_settings, '{withholding_default_staff}', to_jsonb(v_wds), true);
  end if;
  if p_patch ? 'cash_float_default' then
    if jsonb_typeof(p_patch->'cash_float_default') <> 'number' then raise exception 'bad type'; end if;
    v_cfd := (p_patch->>'cash_float_default')::numeric;
    if v_cfd <> floor(v_cfd) or v_cfd < 0 or v_cfd > 9999999 then raise exception 'bad cash_float_default'; end if;
    v_before   := v_before || jsonb_build_object('cash_float_default', coalesce(v_settings->'cash_float_default', '0'::jsonb));
    v_after    := v_after  || jsonb_build_object('cash_float_default', v_cfd::int);
    v_settings := jsonb_set(v_settings, '{cash_float_default}', to_jsonb(v_cfd::int), true);
  end if;
  if p_patch ? 'settlement_close_day' then
    if jsonb_typeof(p_patch->'settlement_close_day') <> 'number' then raise exception 'bad type'; end if;
    v_scd := (p_patch->>'settlement_close_day')::numeric;
    if v_scd not in (15, 20, 25, 31) then raise exception 'bad settlement_close_day'; end if;
    v_before   := v_before || jsonb_build_object('settlement_close_day', coalesce(v_settings->'settlement_close_day', '31'::jsonb));
    v_after    := v_after  || jsonb_build_object('settlement_close_day', v_scd::int);
    v_settings := jsonb_set(v_settings, '{settlement_close_day}', to_jsonb(v_scd::int), true);
  end if;

  -- ★0199（裁定459・M-114）: LINE 通知の種類ごとの ON／OFF＝settings_json.line_notify＝{notice, shift_published, shift_changed, remind} の boolean だけ（client の lib/nox/line/notify-kinds.ts と同じ鍵名）。
  --   知らない鍵／boolean 以外／object 以外＝'bad line_notify'。送られた object で置換（鍵の欠けは client の既定＝お知らせだけ ON）。DB 既定値なし。
  if p_patch ? 'line_notify' then
    if jsonb_typeof(p_patch->'line_notify') <> 'object' then raise exception 'bad line_notify'; end if;
    for v_jk in select jsonb_object_keys(p_patch->'line_notify') loop
      if v_jk not in ('notice','shift_published','shift_changed','remind') or jsonb_typeof(p_patch->'line_notify'->v_jk) <> 'boolean' then raise exception 'bad line_notify'; end if;
    end loop;
    v_before   := v_before || jsonb_build_object('line_notify', coalesce(v_settings->'line_notify', 'null'::jsonb));
    v_after    := v_after  || jsonb_build_object('line_notify', p_patch->'line_notify');
    v_settings := jsonb_set(v_settings, '{line_notify}', p_patch->'line_notify', true);
  end if;

  -- ★0200（裁定473・M-131）: 会計できる卓＝cast_register_scope＝'all'（既定＝全卓）／'own'（自分が着卓中／指名されている卓だけ）。キャストの RPC と RLS は auth_cast_check_allowed で判定
  if p_patch ? 'cast_register_scope' then
    if jsonb_typeof(p_patch->'cast_register_scope') <> 'string' then raise exception 'bad type'; end if;
    v_scope := p_patch->>'cast_register_scope';
    if v_scope is null or v_scope not in ('all','own') then raise exception 'bad cast_register_scope'; end if;
    v_before   := v_before || jsonb_build_object('cast_register_scope', coalesce(v_settings->>'cast_register_scope', ''));
    v_after    := v_after  || jsonb_build_object('cast_register_scope', v_scope);
    v_settings := jsonb_set(v_settings, '{cast_register_scope}', to_jsonb(v_scope), true);
  end if;

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  -- ★0201c（裁定480 の 1）: 体験入店の条件＝体入の時給（trial_wage）・体入中のバック（trial_back＝same＝本採用の既定プランと同じ／none＝なし）。日数は既存の trial_guarantee_days（出勤日数として読む＝裁定480 の 4）・本採用時のプランは既存の default_plan_id。
  if p_patch ? 'trial_wage' then
    if jsonb_typeof(p_patch->'trial_wage') <> 'number' then raise exception 'bad type'; end if;
    v_trw := (p_patch->>'trial_wage')::numeric;
    if v_trw <> floor(v_trw) or v_trw < 0 or v_trw > 100000 then raise exception 'bad trial_wage'; end if;
    v_before   := v_before || jsonb_build_object('trial_wage', v_settings->'trial_wage');
    v_after    := v_after  || jsonb_build_object('trial_wage', v_trw::int);
    v_settings := jsonb_set(v_settings, '{trial_wage}', to_jsonb(v_trw::int), true);
  end if;
  if p_patch ? 'trial_back' then
    if jsonb_typeof(p_patch->'trial_back') <> 'string' then raise exception 'bad type'; end if;
    v_trb := p_patch->>'trial_back';
    if v_trb is null or v_trb not in ('same','none') then raise exception 'bad trial_back'; end if;
    v_before   := v_before || jsonb_build_object('trial_back', coalesce(v_settings->>'trial_back', ''));
    v_after    := v_after  || jsonb_build_object('trial_back', v_trb);
    v_settings := jsonb_set(v_settings, '{trial_back}', to_jsonb(v_trb), true);
  end if;
  -- ★0201f（裁定483）: マイナンバーの廃棄の候補の年数＝お店の運用の目安（法律の決まりとしては見せない）・整数 1〜20・既定 7（cast_mynumber_discard_candidates が読む）
  if p_patch ? 'mynumber_retention_years' then
    if jsonb_typeof(p_patch->'mynumber_retention_years') <> 'number' then raise exception 'bad type'; end if;
    v_myret := (p_patch->>'mynumber_retention_years')::numeric;
    if v_myret <> floor(v_myret) or v_myret < 1 or v_myret > 20 then raise exception 'bad mynumber_retention_years'; end if;
    v_before   := v_before || jsonb_build_object('mynumber_retention_years', coalesce(nullif(trim(v_settings->>'mynumber_retention_years'), '')::int, 7));
    v_after    := v_after  || jsonb_build_object('mynumber_retention_years', v_myret::int);
    v_settings := jsonb_set(v_settings, '{mynumber_retention_years}', to_jsonb(v_myret::int), true);
  end if;

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
end $function$;


commit;
