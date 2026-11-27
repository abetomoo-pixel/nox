-- 0235_reclose_referral_cash（#29／#232・相談役 11/26 22:10 の段ウ・起草と試走まで・適用はしない）＝決め f の版（11/27・別名 0235_reclose_referral_cash_f.sql・Agoora に確認中）
--   決め f：締めの許可のあるキャストが読める紹介料の合計は今日の営業日の分だけ（daily_report_close（0223）のキャストの枝と同じ 'biz date passed'）。店長・オーナー・スタッフは日付の制限なし。
--     この版と 0235_reclose_referral_cash.sql（決め f の前）は daily_report_referral_cash の止め 1 行（と注 2 行）だけ違う＝どちらか 1 本だけを当てる。
--   経緯：日報の締め（daily_report_close・0152 以来）は紹介料の当日現金払い（referral_payouts paid_via 'cash_daily'・渡した額＝amount−withholding）を
--     理論在高から引き、referral_cash_payout に残す。再締め（daily_report_reclose・最後の定義 0173）は引かず列も数え直さない＝
--     紹介料を現金で払った日に解除→再締めすると、差異がその額だけ下がり（−額）、差異の承認も外れる。締めの後に払った分（#233）はどの日報にも入らない。
--   中身：daily_report_reclose の作り直し 1 本（同じ署名・CREATE OR REPLACE）＋ daily_report_referral_cash の新設 1 本（★4・相談役 11/26 22:50 の追補）。
--     ★1 v_refcash を締めと同じ定義で数える（営業日の範囲は凍結した区切り v_row.biz_cutoff_hm＝daily_report_aggregate と同じ [D 区切り, D+1 区切り)）。
--     ★2 差異の式から v_refcash を引く（daily_report_close と同じ式）。★3 referral_cash_payout を数え直した値で更新。
--     権限・冪等・解除の旗・承認を外す規則・監査は前のまま。ACL は本番の今と同じ文で言い直す（public・anon から revoke・authenticated に grant）。
--     ★4 daily_report_referral_cash(p_store_id, p_biz_date) returns integer＝紹介料の当日現金払いの合計だけ（行は返さない）・読める人＝report_can_close（締めの許可のあるスタッフ・キャストも）＝画面の予定額をだれが見ても締めた後の差異と同じにする。
--       0223（締めの許可のスタッフが締める）ではなく 0235 に入れる訳：紹介料の数え方（凍結した区切り）は再締めと同じ物で、ゲートは今の report_can_close がもう staff∧can_close を通す＝0223 を待たない。
--   変えないもの：表・列・索引・ほかの関数（表 133 のまま・関数は 1 本増えて 525 → 526）。daily_report_close は触らない（0223 の起草＝close だけの作り直し＝文の重なりなし）。
--   翻訳元：本番の daily_report_reclose（md5(prosrc) 22a9a0da423c6052631be9d1f5538cc0）・daily_report_close の v_refcash（0152・0201e）。
--   本番の今の定義との差分：docs/tmp/reclose_ref_1126/diff_live.md。
--   事前確認：docs/tmp/reclose_ref_1126/0235_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/reclose_ref_1126/0235f_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ daily_report_reclose（作り直し） ═══
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
  v_refcash int := 0;  -- ★0235（#29・#232）: 当日現金払いの紹介料（渡した額＝amount−withholding）＝daily_report_close と同じ定義
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.daily_reports where id = p_report_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() = 'cast' or not public.report_can_close(v_row.store_id) then raise exception 'forbidden'; end if;   -- ★3 0173（389 追補2）: 再締めは cast に開かない
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
  -- ★0235（#29・#232）: 紹介料の当日現金払い（paid_via 'cash_daily'・status 'paid'）を数え直す＝daily_report_close（0152）と同じ定義。
  --   営業日の範囲は凍結した区切り（v_row.biz_cutoff_hm）＝daily_report_aggregate と同じ [D 区切り JST, D+1 区切り JST)。
  --   初回の締めは biz_date_of（その時の店の区切り）＝締めた時点の凍結値と同じ。締めの後に払った分（#233）も再締めで入る。
  select coalesce(sum(amount - withholding), 0)::int into v_refcash
    from public.referral_payouts
   where store_id = v_row.store_id and status = 'paid' and paid_via = 'cash_daily'
     and paid_at >= ((v_row.biz_date::text || ' ' || v_row.biz_cutoff_hm)::timestamp at time zone 'Asia/Tokyo')
     and paid_at <  (((v_row.biz_date + 1)::text || ' ' || v_row.biz_cutoff_hm)::timestamp at time zone 'Asia/Tokyo');

  v_expense := coalesce(p_expense, v_row.expense);
  v_payout  := coalesce(p_cash_payout, v_row.cash_payout);
  v_float   := coalesce(p_cash_float, v_row.cash_float);
  v_counted := coalesce(p_counted_cash, v_row.counted_cash);
  if v_expense < 0 or v_payout < 0 or v_float < 0 or (v_counted is not null and v_counted < 0) then
    raise exception 'bad amount';
  end if;
  v_diff := case when v_counted is null then null
                 else v_counted - (v_float + (v_agg->>'cash')::int + v_ar - v_expense - v_payout - v_refcash) end;   -- ★0235: 紹介料の当日現金払いはドロワーから出た額（daily_report_close と同じ式）

  update public.daily_reports set
    cash = (v_agg->>'cash')::int, card_gross = (v_agg->>'card')::int, card_tax = (v_agg->>'card_tax')::int,
    uri = (v_agg->>'uri')::int, other = (v_agg->>'other')::int, drink_sales = (v_agg->>'drink_sales')::int,
    dohan_checks = (v_agg->>'dohan_checks')::int, slips = (v_agg->>'slips')::int, guests = (v_agg->>'guests')::int,
    open_checks_count = (v_agg->>'open_checks')::int, ar_collected = v_ar,
    ar_collected_card = v_ar_card, ar_collected_other = v_ar_other,  -- ★D45
    referral_cash_payout = v_refcash,  -- ★0235: 数え直した値（締めの後に払った分も入る）
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

revoke all on function public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean, uuid) from public, anon;
grant execute on function public.daily_report_reclose(uuid, integer, integer, integer, integer, text, boolean, uuid) to authenticated;

-- ═══ daily_report_referral_cash（新設・読むだけ＝紹介料の当日現金払いの合計だけ） ═══
CREATE OR REPLACE FUNCTION public.daily_report_referral_cash(p_store_id uuid, p_biz_date date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0235（#29 の残り・相談役 11/26 22:50）: 日報の予定額から引く「紹介料の当日現金払い」の合計（渡した額＝amount−withholding）だけを返す。紹介料の行・紹介者・内訳は返さない（RLS のまま＝スタッフ・キャストは行を読めない）。
--   読める人＝その日を締められる人（report_can_close＝オーナー・自店の店長・締めの許可のあるスタッフ・締めの許可のあるキャスト）＝ほかは forbidden。読むだけ＝監査なし。
--   ★決め f: キャストは今日の営業日の分だけ（過去の日は 'biz date passed'）。
--   範囲＝締め済みの日（daily_reports がある）は再締め（0235）と同じ凍結した区切り・まだの日は daily_report_close と同じ biz_date_of（店の今の区切り）＝画面の予定額が締めた後の差異と同じになる。
declare
  v_store record;
  v_cut   text;
  v_sum   integer;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_store_id is null or p_biz_date is null then raise exception 'bad input'; end if;
  select s.id, s.org_id into v_store from public.stores s where s.id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not public.report_can_close(p_store_id) then raise exception 'forbidden'; end if;
  -- ★0235 決め f（11/27）: 締めの許可のあるキャストは今日の営業日の分だけ＝daily_report_close（0223）のキャストの枝と同じ止め（店長・オーナー・スタッフは日付の制限なし）
  if public.auth_role() = 'cast' and p_biz_date <> public.biz_date_of(p_store_id, now()) then raise exception 'biz date passed'; end if;
  select d.biz_cutoff_hm into v_cut from public.daily_reports d where d.store_id = p_store_id and d.biz_date = p_biz_date;
  if v_cut is not null then
    select coalesce(sum(r.amount - r.withholding), 0)::int into v_sum from public.referral_payouts r
     where r.store_id = p_store_id and r.status = 'paid' and r.paid_via = 'cash_daily'
       and r.paid_at >= ((p_biz_date::text || ' ' || v_cut)::timestamp at time zone 'Asia/Tokyo')
       and r.paid_at <  (((p_biz_date + 1)::text || ' ' || v_cut)::timestamp at time zone 'Asia/Tokyo');
  else
    select coalesce(sum(r.amount - r.withholding), 0)::int into v_sum from public.referral_payouts r
     where r.store_id = p_store_id and r.status = 'paid' and r.paid_via = 'cash_daily'
       and public.biz_date_of(p_store_id, r.paid_at) = p_biz_date;
  end if;
  return v_sum;
end $function$;

revoke all on function public.daily_report_referral_cash(uuid, date) from public, anon;
grant execute on function public.daily_report_referral_cash(uuid, date) to authenticated;

commit;
