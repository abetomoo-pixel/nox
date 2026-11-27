-- 0232_staff_confirm_after_month.sql（相談役 11/26 22:10 の段イ・食い違い #106）＝貼らない（合図は相談役）
-- 翻訳元: 本番の pg_get_functiondef（2026-11-26 読取・docs/tmp/staff_confirm_date_1126/live/staff_attendance_confirm.sql・md5(prosrc) 2484bf7cda999fc586aa0d12a9c8bc64）＋生成器 gen-0232.mjs（アンカー置換 2 か所）
-- 中身: staff_attendance_confirm の確定（p_lock=true）に日付の止めを 1 行足す（その店の今の営業日の月か、それより後の月は 'period not ended'）＋印のコメント。
--   解除（p_lock=false）・役の判定・'paid period'・確定額の再計算と凍結・監査・署名・SECURITY DEFINER・search_path・ACL は変えない。
--   打刻の柵（staff_punch など 8 本の 'confirmed'）は変えない＝確定した月（終わった月）には今までどおり打てない。
-- 関数 525・表 133 は変わらない（作り直し 1 本だけ）。新しい本文の md5(prosrc)（CR 抜き）= b1c71ce185dfc76f39c424755776944e
-- 検証クエリ: docs/tmp/staff_confirm_date_1126/0232_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）・事前確認 0232_precheck.sql（返りが貼り先証明の 1 行だけなら貼る）
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

-- ═══ ★1 staff_attendance_confirm（同じ署名・ACL 不変＝言い直すだけ） ═══
CREATE OR REPLACE FUNCTION public.staff_attendance_confirm(p_store_id uuid, p_period text, p_lock boolean, p_labor jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ勤怠の月の確定（p_lock=true＝owner／自店 manager）と解除（p_lock=false＝owner のみ）。audit 'staff_attendance_confirm'
-- ★0194（裁定445 ②）: p_lock=true のとき p_labor（スタッフ給与の確定額＝内訳つき）を同じトランザクションで凍結（staff_labor_confirmed・店×月を丸ごと置換）。解除で額も消す。
-- ★0200（裁定471）: 支払い済み（staff_labor_payments に行）の月は解除も再確定も 'paid period'＝先に支払い済みを取り消す。
-- ★0232（食い違い #106）: 確定（p_lock=true）は月が終わってから（今の営業日の月以降は 'period not ended'）。
--   時給制の行は時給×実働を再計算して一致を確認（裁定445 ①・端数は店設定 settings_json.labor_rounding＝down（既定・切捨て＝staffPayOf の floorYen）／up／round）
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_had  boolean;
  v_by   uuid := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  v_rnd  text;
  v_n    integer := 0;
  v_total bigint := 0;
  v_calc integer;
  v_allow bigint;   -- ★0195（裁定450 の 6）: allowances の合計
  r      record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_lock is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（相談役確認待ち・推奨案）: 解除も自店の店長に（audit で追える）
  if exists (select 1 from public.staff_labor_payments p where p.store_id = p_store_id and p.period = p_period) then raise exception 'paid period'; end if;   -- ★0200（裁定471）: 支払い済みの月は解除も再確定も不可（先に staff_labor_unmark_paid）
  -- ★0232（食い違い #106）: 確定は月が終わってから＝その店の今の営業日の月か、それより後の月は 'period not ended'（月の途中で確定すると、店の端末のスタッフの打刻が月末まで 'confirmed' で止まり、確定額も途中の分で凍結された）。
  --   月末の最後の営業日（切替時刻の前）はまだその月＝翌営業日から押せる。解除（p_lock=false）は日付を見ない（前のまま）。
  if p_lock and p_period >= to_char(public.biz_date_of(p_store_id, now()), 'YYYY-MM') then raise exception 'period not ended'; end if;
  v_had := exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period);
  if p_lock then
    insert into public.staff_attendance_locks (store_id, org_id, period, locked_by)
    values (p_store_id, v_org, p_period, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (store_id, period) do nothing;
    if p_labor is not null then   -- ★0194（裁定445 ②）: 確定と凍結を同一トランザクション（行＝{membership_id, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, allowances}＝★0195 allowances＝固定手当の内訳 [{name, amount}]・Σ amount＝fixed を RPC が検証（裁定450 の 6））
      if jsonb_typeof(p_labor) <> 'array' then raise exception 'bad labor'; end if;
      v_rnd := coalesce((select s.settings_json->>'labor_rounding' from public.stores s where s.id = p_store_id), 'down');
      if v_rnd not in ('down','up','round') then v_rnd := 'down'; end if;
      delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;
      for r in select * from jsonb_to_recordset(p_labor) as x(membership_id uuid, pay_kind text, hourly integer, minutes integer, time_pay integer, fixed integer, monthly integer, daily integer, days integer, amount integer, deductions jsonb, calc_version text, allowances jsonb) loop
        if r.membership_id is null or r.amount is null or r.pay_kind is null then raise exception 'bad labor row'; end if;
        if r.pay_kind not in ('hourly','daily','monthly') then raise exception 'bad pay_kind'; end if;
        if r.amount < 0 or r.amount > 99999999 or coalesce(r.minutes, 0) < 0 or coalesce(r.hourly, 0) < 0 or coalesce(r.fixed, 0) < 0 or coalesce(r.time_pay, 0) < 0 then raise exception 'bad amount'; end if;
        if r.deductions is not null and jsonb_typeof(r.deductions) <> 'array' then raise exception 'bad deductions'; end if;
        if r.allowances is not null and jsonb_typeof(r.allowances) <> 'array' then raise exception 'bad allowances'; end if;   -- ★0195（M-80 追記②）
        if not exists (select 1 from public.memberships m where m.id = r.membership_id and m.store_id = p_store_id and m.role in ('owner','manager','staff')) then raise exception 'bad membership'; end if;
        -- ★0195（裁定450 の 6）: 固定手当の内訳 allowances の月額の合計＝fixed（client の合計を信用しない・裁定445 ①と同じ型・pay_kind に関係なく全行）
        if exists (select 1 from jsonb_array_elements(coalesce(r.allowances, '[]'::jsonb)) x where jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'amount') <> 'number' or (x->>'amount')::numeric < 0 or (x->>'amount')::numeric <> floor((x->>'amount')::numeric) or coalesce(length(trim(x->>'name')), 0) = 0) then raise exception 'bad allowances'; end if;
        select coalesce(sum((x->>'amount')::bigint), 0) into v_allow from jsonb_array_elements(coalesce(r.allowances, '[]'::jsonb)) x;
        if v_allow <> coalesce(r.fixed, 0) then raise exception 'labor mismatch: fixed % <> sum(allowances) %', coalesce(r.fixed, 0), v_allow; end if;
        if r.pay_kind = 'hourly' then   -- ★裁定445 ①: 時給 × 実働 を再計算して一致（端数は店設定）
          v_calc := case v_rnd when 'up' then ceil(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) when 'round' then round(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) else floor(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) end;
          if coalesce(r.time_pay, -1) <> v_calc then raise exception 'labor mismatch: time_pay % <> % (hourly % x minutes % / 60, %)', r.time_pay, v_calc, r.hourly, r.minutes, v_rnd; end if;
          if r.amount <> v_calc + coalesce(r.fixed, 0) then raise exception 'labor mismatch: amount % <> time_pay % + fixed %', r.amount, v_calc, coalesce(r.fixed, 0); end if;
        end if;
        insert into public.staff_labor_confirmed (membership_id, org_id, store_id, period, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, confirmed_by, allowances)
        values (r.membership_id, v_org, p_store_id, p_period, r.pay_kind, coalesce(r.hourly, 0), coalesce(r.minutes, 0), coalesce(r.time_pay, 0), coalesce(r.fixed, 0), coalesce(r.monthly, 0), coalesce(r.daily, 0), coalesce(r.days, 0), r.amount, coalesce(r.deductions, '[]'::jsonb), coalesce(r.calc_version, ''), v_by, coalesce(r.allowances, '[]'::jsonb));   -- ★0195: 固定手当の内訳も凍結
        v_n := v_n + 1; v_total := v_total + r.amount;
      end loop;
    end if;
  else
    delete from public.staff_attendance_locks where store_id = p_store_id and period = p_period;
    delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;   -- ★0194（裁定445 ②）: 解除＝確定額も消す（見込みに戻る）
  end if;
  perform public.audit_log_write('staff_attendance_confirm', 'stores:' || p_store_id::text || ':' || p_period,
    jsonb_build_object('locked', v_had), jsonb_build_object('locked', p_lock, 'labor_rows', v_n, 'labor_total', v_total), p_store_id);   -- ★0194: 凍結の人数と合計も
end $function$;
revoke execute on function public.staff_attendance_confirm(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.staff_attendance_confirm(uuid, text, boolean, jsonb) to authenticated, service_role;

commit;
