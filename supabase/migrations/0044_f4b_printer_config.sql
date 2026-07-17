-- 0044_f4b_printer_config.sql
-- F4b レシート印刷（器+設定）: printer_config 隔離テーブル + 設定 RPC 3本 + レシートヘッダ店舗情報
-- 裁定: printer_enabled=false 既定（OFFローンチ）・store_token は deny-all 隔離
--       （stores.settings_json は自店 cast まで可読＝token 置き場に不可・実測済み）
--       ヘッダ情報（住所/電話/登録番号/フッタ）は印字される公開情報＝settings_json 規約どおり
-- 構成: 再適用可（if not exists / or replace）だが手貼りは1回

begin;

-- ============================================================
-- 1) printer_config: 秘密隔離（cast_pin 同型・RLS deny-all・RPC 専任）
-- ============================================================
create table if not exists public.printer_config (
  store_id        uuid primary key references public.stores(id),
  org_id          uuid not null references public.orgs(id),
  printer_enabled boolean not null default false,
  printer_serial  text,
  store_token     text unique,
  updated_at      timestamptz not null default now()
);
alter table public.printer_config enable row level security;
-- ポリシーなし＝deny-all（読み書きとも RPC/service_role 専任）
revoke all on public.printer_config from public, anon, authenticated;

-- ============================================================
-- 2) set_printer_config（owner 限定・原則7＝全引数明示・token は触らない）
-- ============================================================
create or replace function public.set_printer_config(
  p_store_id uuid, p_enabled boolean, p_serial text
) returns void
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_before    jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
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

revoke all on function public.set_printer_config(uuid, boolean, text) from public, anon;
grant execute on function public.set_printer_config(uuid, boolean, text) to authenticated;

-- ============================================================
-- 3) rotate_store_token（owner 限定・24hex＝ePOS printjobid 制限系）
--    gen_random_bytes は extensions スキーマ（実測済み）→ search_path 必須
--    audit に token 値は載せない・返り値は一度だけ表示（kiosk PW と同パターン）
-- ============================================================
create or replace function public.rotate_store_token(p_store_id uuid)
returns text
language plpgsql security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_token     text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
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

revoke all on function public.rotate_store_token(uuid) from public, anon;
grant execute on function public.rotate_store_token(uuid) to authenticated;

-- ============================================================
-- 4) get_printer_config（owner 限定・token 非返却＝has_token のみ）
-- ============================================================
create or replace function public.get_printer_config(p_store_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_cfg       public.printer_config;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
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

revoke all on function public.get_printer_config(uuid) from public, anon;
grant execute on function public.get_printer_config(uuid) to authenticated;

-- ============================================================
-- 5) set_store_receipt_profile（owner 限定・原則7＝全引数明示）
--    レシートヘッダ＝印字される公開情報 → settings_json 相乗り（0019:20 規約）
--    キー: receipt_address / receipt_tel / invoice_reg_no / receipt_footer
--    invoice_reg_no は T+13桁（cast_tax_profiles と同型・空=未登録可）
-- ============================================================
create or replace function public.set_store_receipt_profile(
  p_store_id uuid, p_address text, p_tel text, p_reg_no text, p_footer text
) returns void
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_org     uuid := public.auth_org_id();
  v_store   record;
  v_addr    text := trim(coalesce(p_address, ''));
  v_tel     text := trim(coalesce(p_tel, ''));
  v_reg     text := trim(coalesce(p_reg_no, ''));
  v_footer  text := trim(coalesce(p_footer, ''));
  v_before  jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if length(v_addr) > 200 then raise exception 'bad address'; end if;
  if length(v_tel) > 50 then raise exception 'bad tel'; end if;
  if length(v_footer) > 200 then raise exception 'bad footer'; end if;
  if v_reg <> '' and v_reg !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  v_before := jsonb_build_object(
    'receipt_address', coalesce(v_store.settings_json->>'receipt_address', ''),
    'receipt_tel',     coalesce(v_store.settings_json->>'receipt_tel', ''),
    'invoice_reg_no',  coalesce(v_store.settings_json->>'invoice_reg_no', ''),
    'receipt_footer',  coalesce(v_store.settings_json->>'receipt_footer', '')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(settings_json, '{}'::jsonb),
               '{receipt_address}', to_jsonb(v_addr), true),
             '{receipt_tel}',     to_jsonb(v_tel),    true),
           '{invoice_reg_no}',  to_jsonb(v_reg),    true),
         '{receipt_footer}',  to_jsonb(v_footer), true)
   where id = p_store_id;
  perform public.audit_log_write('set_store_receipt_profile', 'stores:' || p_store_id::text,
    v_before,
    jsonb_build_object('receipt_address', v_addr, 'receipt_tel', v_tel,
                       'invoice_reg_no', v_reg, 'receipt_footer', v_footer),
    p_store_id);
end $function$;

revoke all on function public.set_store_receipt_profile(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_store_receipt_profile(uuid, text, text, text, text) to authenticated;

commit;
