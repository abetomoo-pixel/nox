-- 0223_close_staff.sql（相談役 11/26 の夜便 N の N6 b・食い違い #28・決定 C③-11「daily_report_close／cash_diff_approve は staff∧can_close 可」）＝貼らない（合図は相談役）
-- 翻訳元: 本番の pg_get_functiondef（2026-11-26 読取・docs/tmp/close_staff_1126/live/daily_report_close.sql・md5(prosrc) cd9197d73f43e31c2344ca2a1e534149）＋生成器 docs/tmp/close_staff_1126/gen-0223.mjs（アンカー置換 1 か所）
-- 中身: daily_report_close の役の判定にスタッフの枝を 1 行足す（自店 ∧ auth_staff_can_close()）＋その印のコメント 1 行。ほかの行・署名・ACL・監査は変えない。
--   仲間の関数（daily_report_reclose・cash_diff_approve）は前から report_can_close（スタッフの枝あり・キャストは呼び元で拒否）＝作り直さない（事前確認で md5 を固定）。
-- 関数 525・表 133 は変わらない（作り直し 1 本だけ）。
-- 検証クエリ: docs/tmp/close_staff_1126/0223_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）・事前確認 0223_precheck.sql（返りが貼り先証明の 1 行だけなら貼る）
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 daily_report_close（同じ署名・ACL 不変＝言い直すだけ） ═══
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
  v_refcash int := 0;  -- ★17 0152（裁定298-10）: 当日現金払いの紹介料（渡した額＝amount−withholding）
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
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_close())
          or (public.auth_role() = 'cast' and p_store_id = public.auth_store_id() and public.auth_cast_close_ok(p_store_id))) then
    -- ★0223（C③-11・食い違い #28）: 締めの許可（memberships.can_close）がある自店のスタッフも締める＝report_can_close のスタッフの枝と同じ式（日付の制限は店長と同じで無し）
    -- ★0201e ★4（裁定481）: キャストは「締めの許可（cast_can_close）∧ レジの許可 ∧ 出勤中」だけ（auth_cast_close_ok）
    raise exception 'forbidden';
  end if;
  -- ★0201e ★4（裁定481・相談役 11/11 の 9）: キャストが締められるのは今日の営業日だけ（営業日の区切りを過ぎた前日分は店長が締める）
  if public.auth_role() = 'cast' and p_biz_date <> public.biz_date_of(p_store_id, now()) then raise exception 'biz date passed'; end if;

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
  -- ★17 0152（裁定298-10）: paid_via 'cash_daily' の紹介料＝支払日時の営業日で集計（渡した額＝amount−withholding）
  select coalesce(sum(amount - withholding), 0)::int into v_refcash
    from public.referral_payouts
   where store_id = p_store_id and status = 'paid' and paid_via = 'cash_daily'
     and public.biz_date_of(p_store_id, paid_at) = p_biz_date;

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  --   ★D45: card/other 回収は理論在高に加算しない（式不変）。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0) - v_refcash) end;   -- ★17 0152（要裁定(1)）: 紹介料の当日現金払いはドロワーから出た額

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
     ar_collected_card, ar_collected_other,  -- ★D45
     referral_cash_payout,  -- ★17 0152（0173: 末尾 ')' → ','）
     set_ext_nom, products, pay_fee_total, closed_by_membership)  -- ★4／★6／★3 0173（裁定391／393／389）
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor,
     v_ar_card, v_ar_other,  -- ★D45
     v_refcash,  -- ★17 0152（0173: 末尾 ')' → ','）
     (v_agg->>'set_ext_nom')::int, (v_agg->>'products')::int, (v_agg->>'pay_fee_total')::int, public.auth_membership_id())  -- ★4／★6／★3 0173
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.daily_report_close(uuid, date, integer, integer, integer, integer, text, boolean, uuid) from public, anon;
grant execute on function public.daily_report_close(uuid, date, integer, integer, integer, integer, text, boolean, uuid) to authenticated, service_role;

commit;
