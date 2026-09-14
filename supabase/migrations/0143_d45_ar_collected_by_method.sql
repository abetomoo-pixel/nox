-- 0143_d45_ar_collected_by_method.sql
-- D45 入金方法別照合（C③-12 で別 mig に切り出し・裁定 D45-1〜8・Agoora 承認 2026-09-11）
-- 起草: 相談役 2026-09-11。live dump（docs/tmp/d45_dump.txt・pg_get_functiondef 逐語）を写経し ★D45 行のみ追加。
--
-- 目的:
--   売掛回収の card／other を日報に凍結する（裁定206「回収方法の日報凍結」）。
--   既存 ar_collected は cash 回収のまま（名称・意味とも据え置き・D45-2）。
--
-- 変更:
--   ① daily_reports に ar_collected_card / ar_collected_other（integer NOT NULL default 0 CHECK >= 0）を追加。
--      既存行は 0 で埋まる＝凍結済み日報の意味は不変（0142 以前の UI は cash 固定で card/other 回収を作れない）。
--   ② daily_report_aggregate: ar_collected（method='cash'）の直後に同型 2 キーを追加。他行は逐語不変。
--   ③ daily_report_close: v_ar の直後に 2 変数の代入、insert に 2 列。★理論在高の式（diff）は不変（D45-3・0055「非現金回収はドロワー非加算」）。
--   ④ daily_report_reclose: 同上（update 句に 2 列）。diff 不変。
--
-- 非改修（宣言）:
--   - grant / revoke / RLS は触らない（CREATE OR REPLACE は proacl を保持。aggregate は内部専用のまま＝anon-guard BLOCKED 維持）。
--   - check_pay / check_close / check_void / receivable_collect は触らない（money-core 非改修）。
--   - ar_collections.method の CHECK（cash/card/other）は不変。
--   - 理論在高: diff = counted − (float + cash + ar_collected − expense − payout)。card/other は加算しない。
--
-- 影響する verify（CC 調査 9/11）:
--   - f0 で daily_reports の列数・aggregate の jsonb キー集合を固定する段は無い＝列追加・キー追加で赤になる段は無い。
--   - verify:nox-rls F1e（card_gross 17,900・diff 500・reclose 後 diff 20,500）は diff 不変ゆえ成立するはず＝手貼り後の f0 で担保。
--   - 新規 suite verify:nox-d45（走数外・f0 45 本目）は手貼り後に作成。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 1) 列 2 本（NOT NULL default 0）
--   select column_name, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name='daily_reports'
--     and column_name in ('ar_collected_card','ar_collected_other') order by column_name;   -- 2 行
--   -- 2) 列数 38→40・CHECK/制約 28→30
--   select count(*) from information_schema.columns where table_schema='public' and table_name='daily_reports';   -- 40
--   select count(*) from pg_constraint where conrelid='public.daily_reports'::regclass;   -- 30
--   select conname from pg_constraint where conrelid='public.daily_reports'::regclass
--     and conname in ('daily_reports_ar_collected_card_check','daily_reports_ar_collected_other_check');   -- 2 行
--   -- 3) 3 関数に新キー/新列が入ったか（各 2 回以上）
--   select proname,
--          (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid),'ar_collected_card','')))/length('ar_collected_card') as n_card,
--          (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid),'ar_collected_other','')))/length('ar_collected_other') as n_other
--     from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('daily_report_aggregate','daily_report_close','daily_report_reclose') order by proname;
--   -- 期待: aggregate 1/1・close 2/2・reclose 2/2（変数名 v_ar_card/v_ar_other は文字列 ar_collected_card/_other を含まない）
--   -- 4) 理論在高の式が不変（diff 行に card/other が入っていない）
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('daily_report_close','daily_report_reclose')
--     and pg_get_functiondef(oid) ~ 'v_ar_(card|other)[^;]*\)\s*end;';   -- 0 行
--   -- 5) proacl 不変（本 mig 前後で同値・貼付前に控える）
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('daily_report_aggregate','daily_report_close','daily_report_reclose') order by proname;
--   -- 6) money-core 非改修（prosrc ハッシュ前後一致）
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('check_pay','check_close','check_void','receivable_collect') order by proname;
--   -- 7) 動作（service/JWT 要＝verify:nox-d45 で実施）: card 回収 1 件 → aggregate の ar_collected_card に反映・ar_collected 不変・
--   --    close/reclose で 2 列凍結・diff は card 回収前後で同値。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① daily_reports 列追加（D45-2）
-- ══════════════════════════════════════════════════════════════
alter table public.daily_reports
  add column ar_collected_card  integer not null default 0 check (ar_collected_card  >= 0),
  add column ar_collected_other integer not null default 0 check (ar_collected_other >= 0);

-- ══════════════════════════════════════════════════════════════
-- ② daily_report_aggregate（live 64 行の写経＋★D45 2 キー追加）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.daily_report_aggregate(p_store_id uuid, p_biz_date date, p_cutoff_hm text, p_tax_rate integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_start timestamptz;
  v_end   timestamptz;
  v jsonb;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  -- [D cutoff JST, D+1 cutoff JST)
  v_start := ((p_biz_date::text || ' ' || p_cutoff_hm) )::timestamp at time zone 'Asia/Tokyo';
  v_end   := (((p_biz_date + 1)::text || ' ' || p_cutoff_hm))::timestamp at time zone 'Asia/Tokyo';
  select jsonb_build_object(
    'open_checks', (select count(*) from public.checks c
                     where c.org_id = v_org and c.store_id = p_store_id and c.status = 'open'
                       and c.started_at >= v_start and c.started_at < v_end),
    'slips',  (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'guests', (select coalesce(sum(c.people), 0) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'dohan_checks', (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed' and c.nom_type = 'dohan'
                  and c.started_at >= v_start and c.started_at < v_end),
    'cash',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'cash'
                 and c.started_at >= v_start and c.started_at < v_end),
    'card',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'card'
                 and c.started_at >= v_start and c.started_at < v_end),
    'uri',   (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'ar'
                 and c.started_at >= v_start and c.started_at < v_end),
    'other', (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'other'
                 and c.started_at >= v_start and c.started_at < v_end),
    'drink_sales', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.kind in ('drink','champ')
                 and c.started_at >= v_start and c.started_at < v_end),
    -- ★B6（mig0055）: 回収現金（別掲・biz_date 直・method='cash' のみ＝理論在高加算対象）。
    --   checks/payments 非依存＝発生日 uri との二重計上は起きない（別経路・突合は receivables 直 SELECT）。
    'ar_collected', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'cash'),
    -- ★D45（mig0143）: 回収 card／other（別掲・biz_date 直・理論在高には加算しない＝ドロワー非加算）。
    'ar_collected_card', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'card'),
    'ar_collected_other', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'other')
  ) into v;
  return v || jsonb_build_object('card_tax', round(((v->>'card')::int) * p_tax_rate / 100.0)::int);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ③ daily_report_close（live 74 行の写経＋★D45 2 変数・insert 2 列。diff 式は不変）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.daily_report_close(p_store_id uuid, p_biz_date date, p_expense integer DEFAULT 0, p_cash_payout integer DEFAULT 0, p_cash_float integer DEFAULT 0, p_counted_cash integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int; v_ar int;
  v_ar_card int; v_ar_other int;  -- ★D45
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
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  --   ★D45: card/other 回収は理論在高に加算しない（式不変）。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0)) end;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
     ar_collected_card, ar_collected_other)  -- ★D45
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor,
     v_ar_card, v_ar_other)  -- ★D45
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ④ daily_report_reclose（live 63 行の写経＋★D45 2 変数・update 2 列。diff 式は不変）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.daily_report_reclose(p_report_id uuid, p_expense integer DEFAULT NULL::integer, p_cash_payout integer DEFAULT NULL::integer, p_cash_float integer DEFAULT NULL::integer, p_counted_cash integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record; v_agg jsonb; v_before jsonb; v_diff int; v_ar int;
  v_expense int; v_payout int; v_float int; v_counted int; v_flag boolean;
  v_ar_card int; v_ar_other int;  -- ★D45
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.daily_reports where id = p_report_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not public.report_can_close(v_row.store_id) then raise exception 'forbidden'; end if;
  v_flag := public.flag_enabled('reopen_flow', v_row.store_id);
  if v_flag then
    -- 冪等: 同一キーで既に再締め済みなら静かに返す
    if p_idem_key is not null and v_row.reclose_idem_key is not distinct from p_idem_key and v_row.reclosed_at is not null then
      return p_report_id;
    end if;
    if not (v_row.reopened_at is not null and v_row.reclosed_at is null) then raise exception 'not_reopened'; end if;
  end if;
  v_before := to_jsonb(v_row);

  -- 再集計は凍結済みの cutoff / rate を使う（範囲定義・税率は初回締めから不変）
  v_agg := public.daily_report_aggregate(v_row.store_id, v_row.biz_date, v_row.biz_cutoff_hm, v_row.card_tax_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  v_expense := coalesce(p_expense, v_row.expense);
  v_payout  := coalesce(p_cash_payout, v_row.cash_payout);
  v_float   := coalesce(p_cash_float, v_row.cash_float);
  v_counted := coalesce(p_counted_cash, v_row.counted_cash);
  if v_expense < 0 or v_payout < 0 or v_float < 0 or (v_counted is not null and v_counted < 0) then
    raise exception 'bad amount';
  end if;
  v_diff := case when v_counted is null then null
                 else v_counted - (v_float + (v_agg->>'cash')::int + v_ar - v_expense - v_payout) end;

  update public.daily_reports set
    cash = (v_agg->>'cash')::int, card_gross = (v_agg->>'card')::int, card_tax = (v_agg->>'card_tax')::int,
    uri = (v_agg->>'uri')::int, other = (v_agg->>'other')::int, drink_sales = (v_agg->>'drink_sales')::int,
    dohan_checks = (v_agg->>'dohan_checks')::int, slips = (v_agg->>'slips')::int, guests = (v_agg->>'guests')::int,
    open_checks_count = (v_agg->>'open_checks')::int, ar_collected = v_ar,
    ar_collected_card = v_ar_card, ar_collected_other = v_ar_other,  -- ★D45
    expense = v_expense, cash_payout = v_payout, cash_float = v_float,
    counted_cash = v_counted, diff = v_diff,
    note = coalesce(p_note, note),
    reclosed_count = reclosed_count + 1,
    reclosed_at = case when v_flag then now() else reclosed_at end,
    reclosed_by = case when v_flag then public.auth_membership_id() else reclosed_by end,
    reclose_idem_key = case when v_flag then p_idem_key else reclose_idem_key end,
    -- 差異が動いたら承認は無効(再承認が要る)
    diff_reason = case when v_diff is distinct from v_row.diff then null else diff_reason end,
    diff_approved_by = case when v_diff is distinct from v_row.diff then null else diff_approved_by end,
    diff_approved_at = case when v_diff is distinct from v_row.diff then null else diff_approved_at end
  where id = p_report_id;
  perform public.audit_log_write('daily_report_reclose', 'daily_reports:' || p_report_id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = p_report_id), v_row.store_id);
  return p_report_id;
end $function$;

commit;
