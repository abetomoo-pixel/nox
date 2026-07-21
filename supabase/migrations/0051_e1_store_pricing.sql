-- 0051_e1_store_pricing.sql
-- E1 料金設定（裁定8 N1-b・設計承認 2026-07-17）：料金6設定を stores 専用列7本へ。
-- 翻訳元＝現行 check_open / daily_report_close の settings_json 読み（live prosrc 起点・2026-07-17 取得）。
-- defaults は現行実効値と同値（10/100/down/5/0/0/0）＝golden 3ゲート（pay83/receipt52/payroll112）不変の構造保証。
-- 適用位置の変更なし：cardTAX は日報集計のみ（#25 値裁定前に会計加算へ動かさない＝器だけ）。
-- 再適用可構成（if not exists / create or replace）だが手貼りは1回。
-- 検証クエリ＝verify_0051.sql（Downloads 残置・repo 収載禁止）。
begin;

-- 1) stores へ料金列7本 ----------------------------------------------------------
-- 設計文書 §1 との差分1点（相談役注記の採用）: round_unit の CHECK に上限 10000 を追加。
--   理由＝誤入力（例 100000）が通ると全会計が極端な丸めになる。上限は「万円単位丸め」まで＝
--   営業で使い得る最大粒度。既存実効値 100 は範囲内・golden 非干渉。typo を構造で止める防御深度。
alter table public.stores
  add column if not exists hon_fee       integer not null default 0      constraint stores_hon_fee_check       check (hon_fee >= 0),
  add column if not exists jonai_fee     integer not null default 0      constraint stores_jonai_fee_check     check (jonai_fee >= 0),
  add column if not exists dohan_fee     integer not null default 0      constraint stores_dohan_fee_check     check (dohan_fee >= 0),
  add column if not exists service_rate  integer not null default 10     constraint stores_service_rate_check  check (service_rate between 0 and 100),
  add column if not exists card_tax_rate integer not null default 5      constraint stores_card_tax_rate_check check (card_tax_rate between 0 and 100),
  add column if not exists round_unit    integer not null default 100    constraint stores_round_unit_check    check (round_unit between 1 and 10000),
  add column if not exists round_mode    text    not null default 'down' constraint stores_round_mode_check    check (round_mode in ('up','down','round'));

-- 2) backfill（settings_json に該当キーがある行のみ・json 旧値は残置＝監査可能性） --------
-- dev 実測（2026-07-17）: 3店ともキー不在＝0行更新が正常（フォールバック既定で運用されていた）。
-- json に不正値が居た場合は列 CHECK / ::int キャストが UPDATE を落とし全体 rollback＝ゴミの黙輸入はしない。
update public.stores
   set service_rate  = coalesce(nullif(settings_json->>'service_rate','')::int,  service_rate),
       round_unit    = coalesce(nullif(settings_json->>'round_unit','')::int,    round_unit),
       round_mode    = coalesce(nullif(trim(settings_json->>'round_mode'),''),   round_mode),
       card_tax_rate = coalesce(nullif(settings_json->>'card_tax_rate','')::int, card_tax_rate)
 where settings_json ?| array['service_rate','round_unit','round_mode','card_tax_rate'];

-- 3) check_open 置換（署名不変）: 設定の読み元を settings_json → stores 列へ --------------
-- 変更点は select 列と【決定1】ブロックのみ。既定・検証・スナップショット先（checks 3列）は不変。
create or replace function public.check_open(p_seat_id uuid, p_people integer default null::integer, p_nom_type text default 'free'::text, p_customer_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  select s.id, s.org_id, s.store_id, s.is_active,
         st.service_rate, st.round_unit, st.round_mode
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = public.auth_org_id()
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  select id into v_id from public.checks
    where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
    limit 1;
  if v_id is not null then return v_id; end if;

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode, created_by, customer_id)
  values (public.auth_org_id(), v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode, v_actor, p_customer_id)
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
      limit 1;
    return v_id;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id), v_seat.store_id);
  return v_id;
end $function$;

-- 4) daily_report_close 置換（署名不変）: card_tax_rate を列読みへ ------------------------
-- cutoff（biz_cutoff_hm）は E1 対象6設定に含まれない＝settings_json のまま（v_settings を温存）。
-- reclose は daily_reports の凍結列を使う既存構造＝無改修（非遡及）。
create or replace function public.daily_report_close(p_store_id uuid, p_biz_date date, p_expense integer default 0, p_cash_payout integer default 0, p_cash_float integer default 0, p_counted_cash integer default null::integer, p_note text default null::text, p_force boolean default false, p_idem_key uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if coalesce(p_expense, -1) < 0 or coalesce(p_cash_payout, -1) < 0 or coalesce(p_cash_float, -1) < 0 then
    raise exception 'bad amount';
  end if;
  if p_counted_cash is not null and p_counted_cash < 0 then raise exception 'bad amount'; end if;
  -- E1 mig0051: 税率は stores.card_tax_rate 列読み（列 CHECK 0..100 が構造保証・既定 5 は列 default と同値）
  select org_id, settings_json, card_tax_rate into v_owner, v_settings, v_rate
    from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一 (store, biz_date) の既存行＝同一キーなら成功・別キーは reclose を促す
  select * into v_exist from public.daily_reports
    where store_id = p_store_id and biz_date = p_biz_date;
  if v_exist.id is not null then
    if p_idem_key is not null and v_exist.close_idem_key = p_idem_key then return v_exist.id; end if;
    raise exception 'already closed';
  end if;

  -- 設定スナップショット（cutoff 既定 06:00＝json のまま／税率＝列読み・raise は防御深度で残置）
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_rate < 0 then
    raise exception 'bad store settings';
  end if;

  v_agg := public.daily_report_aggregate(p_store_id, p_biz_date, v_cutoff, v_rate);

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2】diff = counted − (float + cash − expense − payout)（モック H=Oi−q と同一）
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0)) end;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by)
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor)
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $function$;

-- 5) set_store_pricing 新設（料金7列の唯一の書き手） --------------------------------------
create or replace function public.set_store_pricing(
  p_store_id uuid, p_hon_fee integer, p_jonai_fee integer, p_dohan_fee integer,
  p_service_rate integer, p_card_tax_rate integer, p_round_unit integer, p_round_mode text
) returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否（coalesce の null→既定リセット挙動を作らない）。
  -- 範囲は列 CHECK と同値＝二段（raise の方が PostgREST エラーが読みやすい）。
  if p_hon_fee is null or p_hon_fee < 0 then raise exception 'bad pricing'; end if;
  if p_jonai_fee is null or p_jonai_fee < 0 then raise exception 'bad pricing'; end if;
  if p_dohan_fee is null or p_dohan_fee < 0 then raise exception 'bad pricing'; end if;
  if p_service_rate is null or p_service_rate < 0 or p_service_rate > 100 then raise exception 'bad pricing'; end if;
  if p_card_tax_rate is null or p_card_tax_rate < 0 or p_card_tax_rate > 100 then raise exception 'bad pricing'; end if;
  if p_round_unit is null or p_round_unit < 1 or p_round_unit > 10000 then raise exception 'bad pricing'; end if;
  if p_round_mode is null or p_round_mode not in ('up','down','round') then raise exception 'bad pricing'; end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は料金7列のみの合成 jsonb（settings_json 全文を監査に混ぜない＝E1 設計 §2・過去 audit との形は
  -- to_jsonb(部分) 合成の #40 流儀と同型）
  select jsonb_build_object(
           'hon_fee', hon_fee, 'jonai_fee', jonai_fee, 'dohan_fee', dohan_fee,
           'service_rate', service_rate, 'card_tax_rate', card_tax_rate,
           'round_unit', round_unit, 'round_mode', round_mode)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set hon_fee = p_hon_fee, jonai_fee = p_jonai_fee, dohan_fee = p_dohan_fee,
         service_rate = p_service_rate, card_tax_rate = p_card_tax_rate,
         round_unit = p_round_unit, round_mode = p_round_mode
   where id = p_store_id;
  select jsonb_build_object(
           'hon_fee', hon_fee, 'jonai_fee', jonai_fee, 'dohan_fee', dohan_fee,
           'service_rate', service_rate, 'card_tax_rate', card_tax_rate,
           'round_unit', round_unit, 'round_mode', round_mode)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_pricing', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- 二重防御（public だけでは無効・anon にも直 grant されるため必ず両方 revoke）
revoke execute on function public.set_store_pricing(uuid,integer,integer,integer,integer,integer,integer,text) from public, anon;
grant  execute on function public.set_store_pricing(uuid,integer,integer,integer,integer,integer,integer,text) to authenticated;

commit;
