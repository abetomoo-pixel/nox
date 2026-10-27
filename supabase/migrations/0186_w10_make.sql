-- 0186_w10_make.sql — 便 W-10（2026-10-26・「準備中」の「作る」＝docs/demo/w10_junbichu.md #10／#15／#22／#7 の DB 分）
-- 翻訳元: live pg_get_functiondef（2026-10-26 20:0x・shift_is_closed_day／reservation_is_closed_day）＋生成器 docs/tmp/gen_0186.cjs。新設の表 1・RPC 5 は生成器の文字列。
--   ★1 #10 特別日＝store_special_days（店×日付で 1 行・closed 臨時休業／open 特別営業＋時間）・set_store_special_day／remove_store_special_day（owner／manager 自店）・
--        shift_is_closed_day／reservation_is_closed_day は特別日を先に見る（シフトの定休日判定と予約の定休日判定が同じ答え）。
--   ★2 #15 flag_unset＝店の上書きを消して「既定に従う」へ戻す（owner・flag_set と同じ白名単・audit flag_unset）。
--   ★3 #22 withholding_payment_cancel＝納付済みの記録の取消（owner・理由必須・audit に元の行）。
--   ★4 #7 audit_export_record＝監査ログを出力した記録（owner・期間・目的・件数を audit_logs に）。
-- 検証（Success の後）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ★1 表 store_special_days ═══
create table if not exists public.store_special_days (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('closed','open')),
  open_hm    text check (open_hm is null or open_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  close_hm   text check (close_hm is null or close_hm ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'),
  note       text check (note is null or length(note) <= 100),
  set_by     uuid references public.users(id),
  set_at     timestamptz not null default now(),
  constraint store_special_days_uq unique (store_id, day),
  constraint store_special_days_open_hm_ck check (kind = 'closed' or (open_hm is not null and close_hm is not null))
);
create index if not exists store_special_days_store_day_idx on public.store_special_days (store_id, day);
alter table public.store_special_days enable row level security;
drop policy if exists store_special_days_select on public.store_special_days;
create policy store_special_days_select on public.store_special_days for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.store_special_days from public, anon, authenticated;
grant select on table public.store_special_days to authenticated;
comment on table public.store_special_days is '★0186（W-10 #10）: 日付ごとの臨時休業（closed）・特別営業（open＋時間）＝曜日の設定より優先';

CREATE OR REPLACE FUNCTION public.set_store_special_day(p_store_id uuid, p_day date, p_kind text, p_open_hm text DEFAULT NULL::text, p_close_hm text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★1（W-10 #10）: 特別日の登録・変更（owner／manager 自店）
declare
  v_org uuid; v_id uuid; v_before jsonb; v_uid uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if p_day is null then raise exception 'bad date'; end if;
  if p_kind is null or p_kind not in ('closed','open') then raise exception 'bad kind'; end if;
  if p_kind = 'open' and (p_open_hm is null or p_close_hm is null) then raise exception 'bad time'; end if;
  if p_note is not null and length(p_note) > 100 then raise exception 'bad note'; end if;
  select to_jsonb(d) into v_before from public.store_special_days d where d.store_id = p_store_id and d.day = p_day;
  select id into v_uid from public.users where auth_user_id = auth.uid();
  insert into public.store_special_days (org_id, store_id, day, kind, open_hm, close_hm, note, set_by, set_at)
  values (v_org, p_store_id, p_day, p_kind, case when p_kind = 'open' then p_open_hm end, case when p_kind = 'open' then p_close_hm end, nullif(trim(coalesce(p_note, '')), ''), v_uid, now())
  on conflict (store_id, day) do update set kind = excluded.kind, open_hm = excluded.open_hm, close_hm = excluded.close_hm, note = excluded.note, set_by = excluded.set_by, set_at = now()
  returning id into v_id;
  perform public.audit_log_write('set_store_special_day', 'store_special_days:' || v_id::text, v_before,
    (select to_jsonb(d) from public.store_special_days d where d.id = v_id), p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_store_special_day(uuid, date, text, text, text, text) from public, anon;
grant execute on function public.set_store_special_day(uuid, date, text, text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.remove_store_special_day(p_store_id uuid, p_day date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★1（W-10 #10）: 特別日の削除（曜日の設定に戻る）
declare
  v_org uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  select to_jsonb(d) into v_before from public.store_special_days d where d.store_id = p_store_id and d.day = p_day;
  if v_before is null then raise exception 'not found'; end if;
  delete from public.store_special_days where store_id = p_store_id and day = p_day;
  perform public.audit_log_write('remove_store_special_day', 'store_special_days:' || (v_before->>'id'), v_before, null, p_store_id);
end $function$;
revoke execute on function public.remove_store_special_day(uuid, date) from public, anon;
grant execute on function public.remove_store_special_day(uuid, date) to authenticated;

-- ═══ ★1 判定 2 本（live 逐語＋特別日） ═══
CREATE OR REPLACE FUNCTION public.shift_is_closed_day(p_store_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_closed boolean; v_sp text;
begin
  -- ★0186 ★1（W-10 #10）: 特別日（臨時休業＝closed／特別営業＝open）を曜日の設定より先に見る
  select sd.kind into v_sp from public.store_special_days sd where sd.store_id = p_store_id and sd.day = p_date;
  if v_sp is not null then return v_sp = 'closed'; end if;
  select bh.is_closed into v_closed
  from public.store_business_hours bh
  where bh.store_id = p_store_id and bh.dow = extract(dow from p_date)::int;
  return coalesce(v_closed, false);
end $function$;

CREATE OR REPLACE FUNCTION public.reservation_is_closed_day(p_store_id uuid, p_reserved_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_settings jsonb;
  v_cutoff   text;
  v_dow      int;
  v_closed   boolean;
  v_sp       text;
begin
  select s.settings_json into v_settings from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_cutoff := '06:00'; end if;
  v_dow := extract(dow from (timezone('Asia/Tokyo', p_reserved_at) - (v_cutoff || ':00')::interval)::date)::int;
  -- ★0186 ★1（W-10 #10）: 特別日（その営業日）を曜日の設定より先に見る
  select sd.kind into v_sp from public.store_special_days sd
   where sd.store_id = p_store_id and sd.day = (timezone('Asia/Tokyo', p_reserved_at) - (v_cutoff || ':00')::interval)::date;
  if v_sp is not null then return v_sp = 'closed'; end if;
  select bh.is_closed into v_closed
  from public.store_business_hours bh
  where bh.store_id = p_store_id and bh.dow = v_dow;
  return coalesce(v_closed, false);
end $function$;

-- ═══ ★2 #15 flag_unset（店の上書きを消して既定に従う） ═══
CREATE OR REPLACE FUNCTION public.flag_unset(p_key text, p_store_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★2（W-10 #15）: 店の上書き（feature_flags の store_id あり）を消す＝会社の既定に従う。owner のみ（flag_set と同じ・裁定182）
declare
  v_org uuid; v_before jsonb;
begin
  if p_key is null or p_store_id is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_key not in ('staff_shift','reopen_flow','qr_order','notify') then raise exception 'unknown_key'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  select to_jsonb(f) into v_before from public.feature_flags f where f.org_id = v_org and f.key = p_key and f.store_id = p_store_id;
  if v_before is null then return; end if;   -- 上書きが無い＝既に既定に従っている（冪等）
  delete from public.feature_flags where org_id = v_org and key = p_key and store_id = p_store_id;
  perform public.audit_log_write('flag_unset', 'feature_flags:' || p_key || ':' || p_store_id::text, v_before, null, p_store_id, p_reason);
end $function$;
revoke execute on function public.flag_unset(text, uuid, text) from public, anon;
grant execute on function public.flag_unset(text, uuid, text) to authenticated;

-- ═══ ★3 #22 withholding_payment_cancel（納付記録の取消） ═══
CREATE OR REPLACE FUNCTION public.withholding_payment_cancel(p_target_month text, p_tax_category text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★3（W-10 #22）: 納付済みの記録の取消（owner・理由必須・audit に元の行）
declare
  v_org uuid := public.auth_org_id(); v_before jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_target_month is null or p_target_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  if p_tax_category is null or p_tax_category not in ('委託','雇用') then raise exception 'bad category'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 1 and 200 then raise exception 'reason required'; end if;
  select to_jsonb(w) into v_before from public.withholding_payments w where w.org_id = v_org and w.target_month = p_target_month and w.tax_category = p_tax_category;
  if v_before is null then raise exception 'not found'; end if;
  delete from public.withholding_payments where org_id = v_org and target_month = p_target_month and tax_category = p_tax_category;
  perform public.audit_log_write('withholding_payment_cancel', 'withholding_payments:' || (v_before->>'id'), v_before, null, null, trim(p_reason));
end $function$;
revoke execute on function public.withholding_payment_cancel(text, text, text) from public, anon;
grant execute on function public.withholding_payment_cancel(text, text, text) to authenticated;

-- ═══ ★4 #7 audit_export_record（監査ログを出力した記録） ═══
CREATE OR REPLACE FUNCTION public.audit_export_record(p_from date, p_to date, p_purpose text, p_rows integer, p_format text DEFAULT 'csv'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0186 ★4（W-10 #7）: 監査ログの出力の記録（owner・期間・目的・件数・形式）。出力そのもの（CSV）は client が audit_logs（owner の RLS）から作る
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'bad range'; end if;
  if length(trim(coalesce(p_purpose, ''))) not between 1 and 200 then raise exception 'purpose required'; end if;
  if p_rows is null or p_rows < 0 then raise exception 'bad rows'; end if;
  if p_format is null or p_format not in ('csv') then raise exception 'bad format'; end if;
  perform public.audit_log_write('audit_export', 'audit_logs:' || p_from::text || '..' || p_to::text, null,
    jsonb_build_object('from', p_from, 'to', p_to, 'purpose', trim(p_purpose), 'rows', p_rows, 'format', p_format), null);
end $function$;
revoke execute on function public.audit_export_record(date, date, text, integer, text) from public, anon;
grant execute on function public.audit_export_record(date, date, text, integer, text) to authenticated;

commit;
-- ===== verify =====
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'special table', (select relrowsecurity::text from pg_class where relname='store_special_days' and relnamespace='public'::regnamespace)
-- union all select 'special grant', (select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name='store_special_days')
-- union all select 'rpc 5', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_special_day','remove_store_special_day','flag_unset','withholding_payment_cancel','audit_export_record')
-- union all select 'closed-day 0186', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('shift_is_closed_day','reservation_is_closed_day') and position('★0186' in prosrc) > 0;
-- ===== end 0186 =====
