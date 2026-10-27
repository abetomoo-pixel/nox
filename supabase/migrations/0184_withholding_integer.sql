-- 0184_withholding_integer.sql — 裁定431 ②（2026-10-26 確定・Agoora）: 日払い（daily_pay_issue）の源泉 10.21% を整数で（floor(課税額 × 1021 ÷ 10000)）
-- 翻訳元: live pg_get_functiondef（2026-10-26 17:4x・daily_pay_issue md5 1bdd3260）＋生成器 docs/tmp/gen_0184.cjs（手打ちなし）。
--   変えるのは v_wh の 1 式とその注記だけ（引数・戻り・ACL は create or replace で不変）。TS（lib/nox/money.ts withholding1021Of）と同じ式。
--   紹介料（referral_payout_pay）は既に × 1021 ÷ 10000.0 の整数系＝本 mig では触らない。
--   5,000 円 × 日数（支払時 1 日）は現状維持（裁定431 ⑤＝税理士 T17 待ち）。
-- 検証（Success の後）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

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
  --   floor(max(0, gross − 5,000 × 1) × 1021 ÷ 10000)・整数（★0184 裁定431 ②・旧＝double precision の小数式）・1 円未満切捨て（309 追補2 (c)）。雇用＝0（T10 回答まで）＋warn
  select coalesce(t.mode, '委託') into v_mode from (select 1) x left join public.cast_tax_profiles t on t.cast_id = p_cast_id;
  if p_kind = 'advance' then
    v_wh := 0; v_warn := null;   -- ★1 0172（裁定349）: 前払・仮払＝控除なし（期の精算で控除）
  elsif v_mode = '雇用' then
    v_wh := 0; v_warn := 'T10 pending';
  else
    v_wh := ((greatest(0, p_gross - 5000)::bigint * 1021) / 10000)::int; v_warn := null;   -- ★0184（裁定431 ②）: 整数（× 1021 ÷ 10000 の切捨て＝TS の withholding1021Of と同じ）
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
end $function$;

commit;
-- ===== verify =====
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'daily_pay_issue integer', (position('* 1021) / 10000)::int' in prosrc) > 0 and position('0.1021' in prosrc) = 0)::text from pg_proc where pronamespace='public'::regnamespace and proname='daily_pay_issue'
-- union all select 'daily_pay_issue acl', coalesce(proacl::text, '(null)') from pg_proc where pronamespace='public'::regnamespace and proname='daily_pay_issue';
-- ===== end 0184 =====
