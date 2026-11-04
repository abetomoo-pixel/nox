-- 0193_roles_privacy.sql（役割の見直し＝管理者／店長／スタッフ・個人情報の権限・肩書・役割の変更・2026-11-02 夜の自走便＝下書き・未手貼り）
-- 翻訳元: live pg_get_functiondef（2026-11-02・0192 適用後）＋生成器 docs/tmp/gen_0193.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設は生成器の文字列）
--   計画＝docs/tmp/0193_plan.md／調査＝docs/tmp/0193_role_scan.md（「判断が要る」行は推奨案で仮置き＝相談役確認待ち）
-- 検証クエリ: 末尾 ===== verify =====（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- ★1 店長に開く（プリンタ 3・端末 3・勤怠の確定の解除） ★2 個人情報（住所・電話・口座・末尾 4 桁・スタッフの機密・閲覧の記録） ★3 肩書 ★4 役割の変更と最後の管理者の柵・管理者への通知 ★5 キオスクの staff_punch が月の確定を見る
begin;

-- ═══ ★1 店長に開く（自店のこと）＝プリンタ 3・端末 3・勤怠の確定の解除 ═══
CREATE OR REPLACE FUNCTION public.get_printer_config(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_cfg       public.printer_config;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（調査 4 第 5 節）: 店長は自店のプリンタを扱える（請求書の欄は client が管理者だけ）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  select c.* into v_cfg from public.printer_config c where c.store_id = p_store_id;
  if not found then
    return jsonb_build_object('printer_enabled', false, 'printer_serial', null,
                              'has_token', false, 'updated_at', null);
  end if;
  return jsonb_build_object('printer_enabled', v_cfg.printer_enabled,
                            'printer_serial',  v_cfg.printer_serial,
                            'has_token',       v_cfg.store_token is not null,
                            'updated_at',      v_cfg.updated_at);
end $function$;
CREATE OR REPLACE FUNCTION public.set_printer_config(p_store_id uuid, p_enabled boolean, p_serial text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_before    jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（調査 4 第 5 節）: 店長は自店のプリンタを扱える（請求書の欄は client が管理者だけ）
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  select jsonb_build_object('printer_enabled', c.printer_enabled, 'printer_serial', c.printer_serial)
    into v_before from public.printer_config c where c.store_id = p_store_id;

  insert into public.printer_config (store_id, org_id, printer_enabled, printer_serial)
  values (p_store_id, v_store_org, p_enabled, nullif(trim(coalesce(p_serial,'')), ''))
  on conflict (store_id) do update
    set printer_enabled = excluded.printer_enabled,
        printer_serial  = excluded.printer_serial,
        updated_at      = now();

  perform public.audit_log_write('set_printer_config', 'printer_config:' || p_store_id::text,
    v_before,
    jsonb_build_object('printer_enabled', p_enabled,
                       'printer_serial', nullif(trim(coalesce(p_serial,'')), '')),
    p_store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.rotate_store_token(p_store_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_token     text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（調査 4 第 5 節）: 店長は自店のプリンタを扱える（請求書の欄は client が管理者だけ）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  v_token := encode(gen_random_bytes(12), 'hex');  -- 24hex

  insert into public.printer_config (store_id, org_id, store_token)
  values (p_store_id, v_store_org, v_token)
  on conflict (store_id) do update
    set store_token = excluded.store_token,
        updated_at  = now();

  perform public.audit_log_write('rotate_store_token', 'printer_config:' || p_store_id::text,
    null, jsonb_build_object('rotated', true), p_store_id);
  return v_token;
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_deactivate(p_device_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_device public.kiosk_devices;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;   -- ★0193: 店長は自店の端末の停止・再開・固定の解除（発行・削除は管理者のまま）
  select k.* into v_device from public.kiosk_devices k
    where k.id = p_device_id and k.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if public.auth_role() = 'manager' and v_device.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- ★0193: 店長は自店の端末だけ

  update public.kiosk_devices
     set is_active = false, updated_at = now()
   where id = p_device_id;

  perform public.audit_log_write('kiosk_deactivate', 'kiosk_devices:' || p_device_id::text,
    to_jsonb(v_device),
    (select to_jsonb(k) from public.kiosk_devices k where k.id = p_device_id),
    v_device.store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_reactivate(p_device_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0190 M-29 ⑤: 無効化した端末を「認証情報を再発行して有効化」（新しい PW は route が発行＝ここは is_active だけ・上限 3 台・audit）
declare
  v_org uuid := public.auth_org_id(); v_dev record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;   -- ★0193: 店長は自店の端末を再開できる
  select * into v_dev from public.kiosk_devices where id = p_device_id and org_id = v_org;
  if v_dev.id is null then raise exception 'not found'; end if;
  if public.auth_role() = 'manager' and v_dev.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- ★0193
  if v_dev.is_active then raise exception 'already active'; end if;
  if (select count(*) from public.kiosk_devices k where k.store_id = v_dev.store_id and k.is_active) >= 3 then raise exception 'device limit'; end if;   -- ★0192 M-47: 店ごと 3 台（用途を数えない）
  update public.kiosk_devices set is_active = true, updated_at = now() where id = p_device_id;
  perform public.audit_log_write('kiosk_reactivate', 'kiosk_devices:' || p_device_id::text, to_jsonb(v_dev), (select to_jsonb(k) from public.kiosk_devices k where k.id = p_device_id), v_dev.store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_device_unbind(p_device_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0190（裁定436 ①b）: オーナーが束縛を解除＝次のログインで再束縛できる（M-29 の再発行・無効化と同じ列）
declare
  v_org uuid := public.auth_org_id();
  v_device public.kiosk_devices; v_by uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;   -- ★0193: 店長は自店の端末の停止・再開・固定の解除（発行・削除は管理者のまま）
  select k.* into v_device from public.kiosk_devices k where k.id = p_device_id and k.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if public.auth_role() = 'manager' and v_device.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- ★0193: 店長は自店の端末だけ
  select u.id into v_by from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  update public.kiosk_devices set device_fp = null, unbound_at = now(), unbound_by = v_by, updated_at = now() where id = p_device_id;
  perform public.audit_log_write('kiosk_device_unbind', 'kiosk_devices:' || p_device_id::text,
    jsonb_build_object('device_fp', v_device.device_fp, 'bound_at', v_device.bound_at, 'bound_ua', v_device.bound_ua), jsonb_build_object('device_fp', null), v_device.store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.staff_attendance_confirm(p_store_id uuid, p_period text, p_lock boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ勤怠の月の確定（p_lock=true＝owner／自店 manager）と解除（p_lock=false＝owner のみ）。audit 'staff_attendance_confirm'
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_had  boolean;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_lock is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（相談役確認待ち・推奨案）: 解除も自店の店長に（audit で追える）
  v_had := exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period);
  if p_lock then
    insert into public.staff_attendance_locks (store_id, org_id, period, locked_by)
    values (p_store_id, v_org, p_period, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (store_id, period) do nothing;
  else
    delete from public.staff_attendance_locks where store_id = p_store_id and period = p_period;
  end if;
  perform public.audit_log_write('staff_attendance_confirm', 'stores:' || p_store_id::text || ':' || p_period,
    jsonb_build_object('locked', v_had), jsonb_build_object('locked', p_lock), p_store_id);
end $function$;

-- ═══ ★2 個人情報（店長＝自店の本名・住所・生年月日・連絡先・振込先の入力・閲覧・修正／マイナンバーは入力のみ・保存後は末尾 4 桁／全桁と支払調書は管理者だけ＝不変／閲覧・変更は監査） ═══
alter table public.cast_sensitive add column if not exists address text, add column if not exists phone text,
  add column if not exists bank_name text, add column if not exists bank_branch text, add column if not exists bank_account_type text,
  add column if not exists bank_account_no text, add column if not exists bank_account_holder_kana text;
alter table public.cast_sensitive drop constraint if exists cast_sensitive_bank_type_ck;
alter table public.cast_sensitive add constraint cast_sensitive_bank_type_ck check (bank_account_type is null or bank_account_type in ('ordinary','checking','savings'));

create table if not exists public.staff_sensitive (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  real_name text, birthday date, address text, phone text,
  bank_name text, bank_branch text, bank_account_type text check (bank_account_type is null or bank_account_type in ('ordinary','checking','savings')),
  bank_account_no text, bank_account_holder_kana text,
  updated_at timestamptz not null default now()
);
comment on table public.staff_sensitive is '★0193: スタッフの機密（本名・生年月日・住所・電話・振込先）＝RLS 有効・ポリシー 0・grant 0＝読むのは get_staff_sensitive（閲覧は監査）だけ';
alter table public.staff_sensitive enable row level security;
revoke all on table public.staff_sensitive from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_cast_sensitive(p_cast_id uuid)
 RETURNS TABLE(cast_id uuid, real_name text, birthday date, mynumber_set boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_role       text;
  v_self       uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  v_role := public.auth_role();
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then   -- ★0193: 店長は自店のキャストの本名・生年月日を読める（閲覧は記録）
    if v_cast_store is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;
  elsif v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if;
    if v_self <> p_cast_id then raise exception 'forbidden'; end if;
  else
    raise exception 'forbidden';
  end if;

  perform public.audit_log_write('read_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  return query
    select cs.cast_id, cs.real_name, cs.birthday, (cs.mynumber_enc is not null) as mynumber_set
    from public.cast_sensitive cs
    where cs.cast_id = p_cast_id;
end $function$;
CREATE OR REPLACE FUNCTION public.get_cast_mynumber_masked(p_cast_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cast_org uuid; v_cast_store uuid; v_self uuid; v_key text; v_enc bytea; v_plain text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- ★0193: 末尾 4 桁は本人・管理者・自店の店長（全桁は get_cast_mynumber＝service_role＝管理者の route だけのまま）
  if public.auth_role() = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null or v_self <> p_cast_id then raise exception 'forbidden'; end if;
  elsif public.auth_role() not in ('owner','manager') then
    raise exception 'forbidden';
  end if;
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
    where c.id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() = 'manager' and v_cast_store is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- ★0193

  perform public.audit_log_write('read_cast_mynumber_masked', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  if v_enc is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
  if v_key is null then raise exception 'mynumber key missing'; end if;
  v_plain := extensions.pgp_sym_decrypt(v_enc, v_key);
  return '********' || right(v_plain, 4);
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_sensitive_ext(p_cast_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: キャストの住所・電話・振込先（patch＝来たキーだけ更新・null で消す）。管理者・自店の店長。本名・生年月日・マイナンバーは従来の set_cast_sensitive。audit 'set_cast_sensitive'（項目名だけ）
declare
  v_org uuid := public.auth_org_id();
  v_cast record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select c.id, c.org_id, c.store_id into v_cast from public.casts c where c.id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k <> all (array['address','phone','bank_name','bank_branch','bank_account_type','bank_account_no','bank_account_holder_kana'])) then raise exception 'bad key'; end if;
  if exists (select 1 from jsonb_each(p_patch) e where jsonb_typeof(e.value) not in ('string','null')) then raise exception 'bad type'; end if;
  if p_patch ? 'bank_account_type' and coalesce(p_patch->>'bank_account_type', 'ordinary') not in ('ordinary','checking','savings') then raise exception 'bad bank_account_type'; end if;
  if p_patch ? 'bank_account_no' and p_patch->>'bank_account_no' is not null and p_patch->>'bank_account_no' !~ '^[0-9]{1,8}$' then raise exception 'bad bank_account_no'; end if;
  if exists (select 1 from jsonb_each_text(p_patch) e where length(coalesce(e.value, '')) > 200) then raise exception 'too long'; end if;
  insert into public.cast_sensitive (cast_id, org_id, store_id) values (p_cast_id, v_org, v_cast.store_id) on conflict (cast_id) do nothing;
  update public.cast_sensitive t set
    address = case when p_patch ? 'address' then nullif(trim(p_patch->>'address'), '') else t.address end,
    phone = case when p_patch ? 'phone' then nullif(trim(p_patch->>'phone'), '') else t.phone end,
    bank_name = case when p_patch ? 'bank_name' then nullif(trim(p_patch->>'bank_name'), '') else t.bank_name end,
    bank_branch = case when p_patch ? 'bank_branch' then nullif(trim(p_patch->>'bank_branch'), '') else t.bank_branch end,
    bank_account_type = case when p_patch ? 'bank_account_type' then nullif(trim(p_patch->>'bank_account_type'), '') else t.bank_account_type end,
    bank_account_no = case when p_patch ? 'bank_account_no' then nullif(trim(p_patch->>'bank_account_no'), '') else t.bank_account_no end,
    bank_account_holder_kana = case when p_patch ? 'bank_account_holder_kana' then nullif(trim(p_patch->>'bank_account_holder_kana'), '') else t.bank_account_holder_kana end,
    updated_at = now()
  where t.cast_id = p_cast_id;
  -- 値は監査に残さない（項目名だけ＝set_cast_sensitive と同じ流儀）
  perform public.audit_log_write('set_cast_sensitive', 'cast_sensitive:' || p_cast_id::text, null, jsonb_build_object('fields_changed', (select to_jsonb(array_agg(k order by k)) from jsonb_object_keys(p_patch) k)), v_cast.store_id);
end $function$;
revoke execute on function public.set_cast_sensitive_ext(uuid, jsonb) from public, anon;
grant execute on function public.set_cast_sensitive_ext(uuid, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.get_cast_sensitive_ext(p_cast_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: キャストの機密（本名・生年月日・住所・電話・振込先・マイナンバーの有無）を 1 つの jsonb で。管理者・自店の店長・本人。閲覧は audit 'read_cast_sensitive'。マイナンバーの値は返さない
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cast record;
  v_out jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  select c.id, c.org_id, c.store_id into v_cast from public.casts c where c.id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id()) or (v_role = 'cast' and public.auth_cast_id() = p_cast_id)) then raise exception 'forbidden'; end if;
  perform public.audit_log_write('read_cast_sensitive', 'cast_sensitive:' || p_cast_id::text, null, null, v_cast.store_id);
  select jsonb_build_object('real_name', cs.real_name, 'birthday', cs.birthday, 'address', cs.address, 'phone', cs.phone, 'bank_name', cs.bank_name, 'bank_branch', cs.bank_branch,
           'bank_account_type', cs.bank_account_type, 'bank_account_no', cs.bank_account_no, 'bank_account_holder_kana', cs.bank_account_holder_kana, 'mynumber_set', cs.mynumber_enc is not null)
    into v_out from public.cast_sensitive cs where cs.cast_id = p_cast_id;
  return coalesce(v_out, jsonb_build_object('mynumber_set', false));
end $function$;
revoke execute on function public.get_cast_sensitive_ext(uuid) from public, anon;
grant execute on function public.get_cast_sensitive_ext(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_sensitive(p_membership_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: スタッフの機密（本名・生年月日・住所・電話・振込先）。管理者・自店の店長（管理者の行は管理者だけ）。patch＝来たキーだけ・null で消す。audit 'set_staff_sensitive'（項目名だけ）
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org or v_mem.role = 'cast' then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id() and v_mem.role <> 'owner')) then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k <> all (array['address','phone','bank_name','bank_branch','bank_account_type','bank_account_no','bank_account_holder_kana'] || array['real_name','birthday'])) then raise exception 'bad key'; end if;
  if exists (select 1 from jsonb_each(p_patch) e where jsonb_typeof(e.value) not in ('string','null')) then raise exception 'bad type'; end if;
  if p_patch ? 'bank_account_type' and coalesce(p_patch->>'bank_account_type', 'ordinary') not in ('ordinary','checking','savings') then raise exception 'bad bank_account_type'; end if;
  if p_patch ? 'bank_account_no' and p_patch->>'bank_account_no' is not null and p_patch->>'bank_account_no' !~ '^[0-9]{1,8}$' then raise exception 'bad bank_account_no'; end if;
  if exists (select 1 from jsonb_each_text(p_patch) e where length(coalesce(e.value, '')) > 200) then raise exception 'too long'; end if;
  if p_patch ? 'birthday' and p_patch->>'birthday' is not null and p_patch->>'birthday' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'bad birthday'; end if;
  insert into public.staff_sensitive (membership_id, org_id, store_id) values (p_membership_id, v_org, v_mem.store_id) on conflict (membership_id) do nothing;
  update public.staff_sensitive t set
    address = case when p_patch ? 'address' then nullif(trim(p_patch->>'address'), '') else t.address end,
    phone = case when p_patch ? 'phone' then nullif(trim(p_patch->>'phone'), '') else t.phone end,
    bank_name = case when p_patch ? 'bank_name' then nullif(trim(p_patch->>'bank_name'), '') else t.bank_name end,
    bank_branch = case when p_patch ? 'bank_branch' then nullif(trim(p_patch->>'bank_branch'), '') else t.bank_branch end,
    bank_account_type = case when p_patch ? 'bank_account_type' then nullif(trim(p_patch->>'bank_account_type'), '') else t.bank_account_type end,
    bank_account_no = case when p_patch ? 'bank_account_no' then nullif(trim(p_patch->>'bank_account_no'), '') else t.bank_account_no end,
    bank_account_holder_kana = case when p_patch ? 'bank_account_holder_kana' then nullif(trim(p_patch->>'bank_account_holder_kana'), '') else t.bank_account_holder_kana end,
    real_name = case when p_patch ? 'real_name' then nullif(trim(p_patch->>'real_name'), '') else t.real_name end,
    birthday = case when p_patch ? 'birthday' then (p_patch->>'birthday')::date else t.birthday end,
    updated_at = now()
  where t.membership_id = p_membership_id;
  -- 値は監査に残さない（項目名だけ＝set_cast_sensitive と同じ流儀）
  perform public.audit_log_write('set_staff_sensitive', 'staff_sensitive:' || p_membership_id::text, null, jsonb_build_object('fields_changed', (select to_jsonb(array_agg(k order by k)) from jsonb_object_keys(p_patch) k)), v_mem.store_id);
end $function$;
revoke execute on function public.set_staff_sensitive(uuid, jsonb) from public, anon;
grant execute on function public.set_staff_sensitive(uuid, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.get_staff_sensitive(p_membership_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: スタッフの機密を読む。管理者・自店の店長（管理者の行は管理者だけ）・本人。閲覧は audit 'read_staff_sensitive'
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
  v_out jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id() and v_mem.role <> 'owner') or public.auth_membership_id() = p_membership_id) then raise exception 'forbidden'; end if;
  perform public.audit_log_write('read_staff_sensitive', 'staff_sensitive:' || p_membership_id::text, null, null, v_mem.store_id);
  select to_jsonb(t) - 'org_id' - 'store_id' - 'membership_id' into v_out from public.staff_sensitive t where t.membership_id = p_membership_id;
  return coalesce(v_out, '{}'::jsonb);
end $function$;
revoke execute on function public.get_staff_sensitive(uuid) from public, anon;
grant execute on function public.get_staff_sensitive(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.member_profile_get(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193（D4）: 店側が member_profiles を読む口（閲覧を記録）＝管理者・自店に所属がある人を自店の店長・本人。member_profiles_select は本人だけに絞る
declare
  v_org uuid := public.auth_org_id();
  v_out jsonb;
  v_store uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.users u where u.id = p_user_id and u.org_id = v_org) then raise exception 'forbidden'; end if;
  select m.store_id into v_store from public.memberships m where m.user_id = p_user_id and m.is_active order by m.created_at limit 1;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and exists (select 1 from public.memberships m where m.user_id = p_user_id and m.store_id = public.auth_store_id()))
          or exists (select 1 from public.users u where u.id = p_user_id and u.auth_user_id = auth.uid())) then raise exception 'forbidden'; end if;
  perform public.audit_log_write('read_member_profile', 'member_profiles:' || p_user_id::text, null, null, v_store);
  select to_jsonb(p) - 'org_id' into v_out from public.member_profiles p where p.user_id = p_user_id;
  return coalesce(v_out, '{}'::jsonb);
end $function$;
revoke execute on function public.member_profile_get(uuid) from public, anon;
grant execute on function public.member_profile_get(uuid) to authenticated;

drop policy if exists member_profiles_select on public.member_profiles;
create policy member_profiles_select on public.member_profiles for select to authenticated
  using (org_id = public.auth_org_id() and user_id = (select u.id from public.users u where u.auth_user_id = auth.uid()));   -- ★0193（D4）: 直読みは本人だけ＝店側は member_profile_get（閲覧を記録）

-- ═══ ★3 肩書（権限とは別の自由記述・20 字まで・画面は肩書を出す＝未入力なら権限の名前） ═══
alter table public.memberships add column if not exists title text;
alter table public.memberships drop constraint if exists memberships_title_len_ck;
alter table public.memberships add constraint memberships_title_len_ck check (title is null or length(title) <= 20);

CREATE OR REPLACE FUNCTION public.set_membership_title(p_membership_id uuid, p_title text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: 肩書（店長・マネージャー・主任など）＝管理者・自店の店長（管理者の行は管理者だけ）・null／空で消す。audit 'set_membership_title'
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
  v_new text := nullif(trim(coalesce(p_title, '')), '');
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_new is not null and length(v_new) > 20 then raise exception 'too long'; end if;
  select m.id, m.store_id, m.role, m.title, s.org_id into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id() and v_mem.role <> 'owner')) then raise exception 'forbidden'; end if;
  update public.memberships set title = v_new, updated_at = now() where id = p_membership_id;
  perform public.audit_log_write('set_membership_title', 'memberships:' || p_membership_id::text, jsonb_build_object('title', v_mem.title), jsonb_build_object('title', v_new), v_mem.store_id);
end $function$;
revoke execute on function public.set_membership_title(uuid, text) from public, anon;
grant execute on function public.set_membership_title(uuid, text) to authenticated;

-- ═══ ★4 役割の変更（店長↔管理者）・管理者の退店・最後の 1 人の柵・既存の管理者全員への通知（notices の宛先 'owners'） ═══
alter table public.notices drop constraint if exists notices_audience_check;
alter table public.notices add constraint notices_audience_check check (audience = any (array['all','cast','staff','owners']));
drop policy if exists notices_select on public.notices;
create policy notices_select on public.notices for select to authenticated
  using (org_id = public.auth_org_id() and store_id = public.auth_store_id()
         and (public.auth_role() <> 'cast' or audience = any (array['all','cast']))
         and (audience <> 'owners' or public.auth_role() = 'owner'));   -- ★0193: 'owners' は管理者だけ
CREATE OR REPLACE FUNCTION public.set_membership_role(p_membership_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★28 0175 v2（裁定425 候補・R-8）: 役割の変更＝staff／manager／admin。管理者の付与・解除はオーナー本人（auth_role_raw）だけ・staff↔manager はオーナーか管理者（auth_role()='owner'）。
--   owner／cast は対象外（オーナーの変更は owner_transfer・キャストは cast_*）。自分の役割は変えない。audit 'set_membership_role'（by_role＝本来の役割）。既存 staff_change_role（staff↔manager）は不変
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_raw  text := public.auth_role_raw();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role <> 'owner' then raise exception 'forbidden'; end if;                                       -- owner か admin（auth_role は admin→owner）
  if p_new_role not in ('staff','manager','admin','owner') then raise exception 'bad role'; end if;   -- ★0193: 管理者（owner）への変更／管理者からの変更も
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_row.role not in ('staff','manager','admin','owner') then raise exception 'bad target'; end if;   -- ★0193: owner も対象（cast は対象外）
  if (p_new_role = 'owner' or v_row.role = 'owner') and v_raw <> 'owner' then raise exception 'forbidden'; end if;   -- ★0193: 管理者の任命・解除は管理者（owner）だけ
  perform pg_advisory_xact_lock(hashtext('nox-owner:' || v_org::text));   -- ★0193: 2 人が互いを同時に下げる抜けを防ぐ（org 単位）
  if v_row.role = 'owner' and p_new_role <> 'owner' and not exists (select 1 from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active and m.id <> v_row.id) then raise exception 'last owner'; end if;
  if (p_new_role = 'admin' or v_row.role = 'admin') and v_raw <> 'owner' then raise exception 'forbidden'; end if;   -- 管理者の任命・解除はオーナーだけ
  if v_row.id = public.auth_membership_id() then raise exception 'self'; end if;
  if v_row.role = p_new_role then raise exception 'no change'; end if;
  update public.memberships set role = p_new_role where id = p_membership_id;
  if p_new_role = 'owner' or v_row.role = 'owner' then   -- ★0193: 管理者の増減は既存の管理者全員に知らせる
  -- 既存の管理者全員へ（管理者がいる店ごとに 1 件・宛先 'owners'＝管理者だけが読む）
  insert into public.notices (org_id, store_id, title, body, audience, pinned, created_by)
  select v_org, x.store_id, '管理者の変更', (select coalesce(u.name, '') from public.users u where u.id = v_row.user_id) || ' さんの役割が ' || case v_row.role when 'owner' then '管理者' when 'manager' then '店長' when 'staff' then 'スタッフ' else v_row.role end || ' から ' || case p_new_role when 'owner' then '管理者' when 'manager' then '店長' when 'staff' then 'スタッフ' else p_new_role end || ' に変わりました', 'owners', false, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active)
    from (select distinct m.store_id from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active) x;
  end if;
  perform public.audit_log_write('set_membership_role', 'memberships:' || p_membership_id::text,
    jsonb_build_object('role', v_row.role), jsonb_build_object('role', p_new_role, 'by_role', v_raw), v_row.store_id);
end $function$;
CREATE OR REPLACE FUNCTION public.staff_deactivate(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 対象 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 対象は staff/manager のみ。owner の在籍解除は禁止（owner を消す経路を封じる）。cast は別画面。
  if v_row.role not in ('staff','manager','owner') then raise exception 'bad target'; end if;   -- ★0193: 管理者の退店も（管理者だけが実行・最後の 1 人は不可）
  if v_row.role = 'owner' then
    if public.auth_role_raw() <> 'owner' then raise exception 'forbidden'; end if;
    perform pg_advisory_xact_lock(hashtext('nox-owner:' || v_org::text));
    if not exists (select 1 from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active and m.id <> v_row.id) then raise exception 'last owner'; end if;
  end if;

  -- 既に inactive なら明示拒否
  if not v_row.is_active then raise exception 'already inactive'; end if;

  update public.memberships set is_active = false where id = p_membership_id;
  if v_row.role = 'owner' then   -- ★0193: 管理者の退店は残る管理者全員に知らせる
  -- 既存の管理者全員へ（管理者がいる店ごとに 1 件・宛先 'owners'＝管理者だけが読む）
  insert into public.notices (org_id, store_id, title, body, audience, pinned, created_by)
  select v_org, x.store_id, '管理者の退店', (select coalesce(u.name, '') from public.users u where u.id = v_row.user_id) || ' さん（管理者）が退店になりました', 'owners', false, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active)
    from (select distinct m.store_id from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active) x;
  end if;
  -- ★0190（裁定436 ①c）: 退店＝PIN の削除とキオスクのセッション終了。auth の失効・ban は route が RPC の後に呼ぶ
  delete from public.staff_pin where membership_id = p_membership_id;
  update public.kiosk_sessions set ended_at = now(), end_reason = 'retired' where membership_id = p_membership_id and ended_at is null;

  perform public.audit_log_write('staff_deactivate', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;

-- ═══ ★5 キオスクの staff_punch が月の確定を見る ═══
CREATE OR REPLACE FUNCTION public.staff_punch(p_membership_id uuid, p_pin text, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★5 0174（P172 Q-4 の積み残し）: 打刻端末からのスタッフ打刻＝kiosk_punch（cast）と kiosk_login（staff_pin の照合・ロック閾値＝店設定）の合成。
--   順序検査＝当営業日の最後の打刻が in なら out だけ・無いか out なら in だけ（'already in'／'not in'）。source 'kiosk'・created_by null。
declare
  v_device   public.kiosk_devices;
  v_mem      record;
  v_pin      public.staff_pin;
  v_ip       text;
  v_id       uuid;
  v_newfail  integer;
  v_settings jsonb;
  v_max      integer;
  v_lock     interval;
  v_bd       date;
  v_last     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  select s.settings_json into v_settings from public.stores s where s.id = v_device.store_id;
  v_max  := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_max_fail'), '')::int, 5);
  v_lock := make_interval(mins => coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'pin_lock_minutes'), '')::int, 10));   -- ★0192 M-46: 既定 15→10 分（kiosk_login と揃える）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_login 逐語）
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象＝自店 active の manager／staff（他店／他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active and m.role in ('manager','staff');
  if v_mem.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.staff_pin p
    where p.membership_id = p_membership_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_newfail := v_pin.fail_count + 1;
    if v_newfail >= v_max then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + v_lock, updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'staff_punch',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= v_max),
       v_ip);
    if v_newfail >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + v_lock);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 端末の最終アクセス → 順序検査 → 記録
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  v_bd := public.biz_date_of(v_device.store_id, now());
  if exists (select 1 from public.staff_attendance_locks l where l.store_id = v_device.store_id and l.period = to_char(v_bd, 'YYYY-MM')) then raise exception 'confirmed'; end if;   -- ★0193: 確定済みの月には打てない（調査 1）
  select sp.kind into v_last from public.staff_punches sp
   where sp.membership_id = p_membership_id and sp.biz_date = v_bd
   order by sp.punched_at desc limit 1;
  if p_kind = 'in' and v_last = 'in' then raise exception 'already in'; end if;
  if p_kind = 'out' and (v_last is null or v_last = 'out') then raise exception 'not in'; end if;

  insert into public.staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source, created_by)
  values (p_membership_id, v_device.org_id, v_device.store_id, v_bd, p_kind, now(), 'kiosk', null)
  returning id into v_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'staff_punch',
     'staff_punches:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'kind', p_kind, 'biz_date', v_bd, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_id, 'punched_at', now(), 'biz_date', v_bd,
                            'operator_name', v_mem.user_name, 'kind', p_kind);
end $function$;

commit;

-- ===== verify =====（Success の後に下の SELECT をコメントを外して貼る・読取だけ・期待値は docs/tmp/handpaste_0193.md）
-- select 'nox-project-proof' k, count(*)::text v from public.orgs
-- union all select 'functions', count(*)::text from pg_proc where pronamespace='public'::regnamespace
-- union all select 'tables', count(*)::text from pg_tables where schemaname='public'
-- union all select 'has 0193', count(*)::text from pg_proc where pronamespace='public'::regnamespace and prosrc like '%0193%'
-- union all select 'new fns (6)', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('set_cast_sensitive_ext','get_cast_sensitive_ext','set_staff_sensitive','get_staff_sensitive','member_profile_get','set_membership_title')
-- union all select 'staff_sensitive rls/policies/grants', (select relrowsecurity::text from pg_class where oid='public.staff_sensitive'::regclass) || '/' || (select count(*)::text from pg_policies where tablename='staff_sensitive') || '/' || (select count(*)::text from information_schema.role_table_grants where table_schema='public' and table_name='staff_sensitive' and grantee in ('anon','authenticated'))
-- union all select 'cast_sensitive new cols', count(*)::text from information_schema.columns where table_schema='public' and table_name='cast_sensitive' and column_name in ('address','phone','bank_name','bank_branch','bank_account_type','bank_account_no','bank_account_holder_kana')
-- union all select 'memberships.title', count(*)::text from information_schema.columns where table_schema='public' and table_name='memberships' and column_name='title'
-- union all select 'notices audience owners', count(*)::text from pg_constraint where conname='notices_audience_check' and pg_get_constraintdef(oid) like '%owners%'
-- union all select 'notices_select owners arm', count(*)::text from pg_policies where tablename='notices' and policyname='notices_select' and qual like '%owners%'
-- union all select 'member_profiles_select self only', count(*)::text from pg_policies where tablename='member_profiles' and policyname='member_profiles_select' and qual not like '%manager%'
-- union all select 'acl diff (new 6: anon f / auth t / service t)', count(*)::text from (values
--     ('set_cast_sensitive_ext(uuid,jsonb)',false,true,true),
--     ('get_cast_sensitive_ext(uuid)',false,true,true),
--     ('set_staff_sensitive(uuid,jsonb)',false,true,true),
--     ('get_staff_sensitive(uuid)',false,true,true),
--     ('member_profile_get(uuid)',false,true,true),
--     ('set_membership_title(uuid,text)',false,true,true)
--   ) x(sig, an, au, sr)
--   where to_regprocedure('public.' || x.sig) is null
--      or has_function_privilege('anon', to_regprocedure('public.' || x.sig), 'execute') <> x.an
--      or has_function_privilege('authenticated', to_regprocedure('public.' || x.sig), 'execute') <> x.au
--      or has_function_privilege('service_role', to_regprocedure('public.' || x.sig), 'execute') <> x.sr
-- union all select 'md5 get_printer_config', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'db1ca425' then ' =file' else ' ≠file(db1ca425)' end from pg_proc where pronamespace='public'::regnamespace and proname='get_printer_config'
-- union all select 'md5 set_printer_config', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'e82921a9' then ' =file' else ' ≠file(e82921a9)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_printer_config'
-- union all select 'md5 rotate_store_token', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '3f1d8b9a' then ' =file' else ' ≠file(3f1d8b9a)' end from pg_proc where pronamespace='public'::regnamespace and proname='rotate_store_token'
-- union all select 'md5 kiosk_deactivate', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'bbf16e96' then ' =file' else ' ≠file(bbf16e96)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_deactivate'
-- union all select 'md5 kiosk_reactivate', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'bdf8670a' then ' =file' else ' ≠file(bdf8670a)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_reactivate'
-- union all select 'md5 kiosk_device_unbind', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '74b30817' then ' =file' else ' ≠file(74b30817)' end from pg_proc where pronamespace='public'::regnamespace and proname='kiosk_device_unbind'
-- union all select 'md5 staff_attendance_confirm', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '9572d741' then ' =file' else ' ≠file(9572d741)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm'
-- union all select 'md5 get_cast_sensitive', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '0e3a7ac0' then ' =file' else ' ≠file(0e3a7ac0)' end from pg_proc where pronamespace='public'::regnamespace and proname='get_cast_sensitive'
-- union all select 'md5 get_cast_mynumber_masked', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'd44d4f3c' then ' =file' else ' ≠file(d44d4f3c)' end from pg_proc where pronamespace='public'::regnamespace and proname='get_cast_mynumber_masked'
-- union all select 'md5 set_cast_sensitive_ext', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'da4c8f19' then ' =file' else ' ≠file(da4c8f19)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_cast_sensitive_ext'
-- union all select 'md5 get_cast_sensitive_ext', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '438c26de' then ' =file' else ' ≠file(438c26de)' end from pg_proc where pronamespace='public'::regnamespace and proname='get_cast_sensitive_ext'
-- union all select 'md5 set_staff_sensitive', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'a67fbc4a' then ' =file' else ' ≠file(a67fbc4a)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_staff_sensitive'
-- union all select 'md5 get_staff_sensitive', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = 'd1c2bd09' then ' =file' else ' ≠file(d1c2bd09)' end from pg_proc where pronamespace='public'::regnamespace and proname='get_staff_sensitive'
-- union all select 'md5 member_profile_get', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '7abb1d5d' then ' =file' else ' ≠file(7abb1d5d)' end from pg_proc where pronamespace='public'::regnamespace and proname='member_profile_get'
-- union all select 'md5 set_membership_title', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '9e39ed8d' then ' =file' else ' ≠file(9e39ed8d)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_membership_title'
-- union all select 'md5 set_membership_role', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '303c8895' then ' =file' else ' ≠file(303c8895)' end from pg_proc where pronamespace='public'::regnamespace and proname='set_membership_role'
-- union all select 'md5 staff_deactivate', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '7dff1ff1' then ' =file' else ' ≠file(7dff1ff1)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_deactivate'
-- union all select 'md5 staff_punch', left(md5(replace(prosrc, chr(13), '')), 8) || case when left(md5(replace(prosrc, chr(13), '')), 8) = '1c1ed455' then ' =file' else ' ≠file(1c1ed455)' end from pg_proc where pronamespace='public'::regnamespace and proname='staff_punch';
