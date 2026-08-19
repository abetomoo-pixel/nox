-- ═══════════════════════════════════════════════════════════════════════════
-- mig0094: E8-3 顧客レーン DB 基盤（自己検証版）
--   customers.grade（#2）＋ bottle_keeps 3列＋setter（#7）＋ customer_notes（#8）
--   底本 = nox_mig0094_live_defs.sql（sha256 c4ce8945…41bd・live 逐語）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: add column／名前付き add constraint／create table／旧署名 drop
-- ★notify pgrst はファイル外・手貼り後に単発
-- ★customer_update は不触（grade は専用 setter＝裁定 E8-3-1）
-- ★bottle_keep_register は 5腕＋billing ゲート逐語不変（署名・insert・入力検証のみ改変）。
--   課金ゲート正本 A1 収載済み＝置換につき billing/grants pin 張り替え不要
-- ★新設4本（bottle_keep_update / customer_set_grade / customer_note_add / customer_note_remove）は
--   事実記録＝billing gate 除外（裁定どおり）
--
-- 裁定（台帳収載済み）:
--   E8-3-1 grade text NULL可＋CHECK in ('vip','vvip')・null=無印・setter 専用 RPC
--   E8-3-2 bottle 3列全 NULL可 default なし・register 引数拡張＋update 新設（owner/manager）
--   E8-3-3 customer_notes append-only＋論理削除・RLS cast 腕なし・書込 RPC 専任
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- (1) DDL: customers.grade
-- ─────────────────────────────────────────────
alter table public.customers add column grade text;
alter table public.customers
  add constraint customers_grade_chk check (grade in ('vip','vvip'));

-- ─────────────────────────────────────────────
-- (2) DDL: bottle_keeps 3列（全 NULL可・default なし＝既存行不触）
-- ─────────────────────────────────────────────
alter table public.bottle_keeps add column remaining_pct integer;
alter table public.bottle_keeps add column expires_on date;
alter table public.bottle_keeps add column shelf_no text;
alter table public.bottle_keeps
  add constraint bottle_keeps_remaining_chk
  check (remaining_pct is null or (remaining_pct between 0 and 100));

-- ─────────────────────────────────────────────
-- (3) DDL: customer_notes 新テーブル（append-only＋論理削除・grants 規範形・cast 腕なし RLS）
-- ─────────────────────────────────────────────
create table public.customer_notes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  body           text not null,
  author_user_id uuid references public.users(id) on delete set null,
  is_removed     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint customer_notes_body_len check (length(body) between 1 and 2000)
);

create index customer_notes_customer_created on public.customer_notes (customer_id, created_at desc);
create index customer_notes_org_store on public.customer_notes (org_id, store_id);

alter table public.customer_notes enable row level security;

-- RLS: customers_select 準拠から cast 腕を除外（裁定 E8-3-3＝業務記録は担当 cast に非公開）
create policy customer_notes_select on public.customer_notes for select to authenticated using (
  org_id = public.auth_org_id()
  and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  and (public.auth_role() in ('owner','manager')
       or (public.auth_role() = 'staff' and public.auth_staff_can_crm()))
);

-- grants 規範形（新テーブルは authenticated 書込も revoke＝universal invariant）
revoke all on table public.customer_notes from public, anon, authenticated;
grant select on table public.customer_notes to authenticated;

-- ─────────────────────────────────────────────
-- (4) bottle_keep_register: 3引数拡張（アリティ 4→7）
--     ★旧署名 drop 必須＋ACL 再適用（0062/0073/0086 前例）。ゲート5腕＋billing は逐語不変
-- ─────────────────────────────────────────────
drop function if exists public.bottle_keep_register(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text, p_remaining_pct integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_shelf_no text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  -- ★mig0094: 追加3列の入力検証（CHECK と同値・エラー文言を関数側で統一）
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;

  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note, remaining_pct, expires_on, shelf_no)
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note, p_remaining_pct, p_expires_on, p_shelf_no)
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;

revoke execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text) from public, anon;
grant  execute on function public.bottle_keep_register(uuid, uuid, uuid, text, integer, date, text) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (5) bottle_keep_update 新設: 素通し更新（規約7 同型・owner/manager・status 経路の穴も封鎖）
-- ─────────────────────────────────────────────
create or replace function public.bottle_keep_update(p_id uuid, p_remaining_pct integer, p_expires_on date, p_shelf_no text, p_status text, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.bottle_keeps;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('active','empty','removed') then raise exception 'bad status'; end if;
  if p_remaining_pct is not null and (p_remaining_pct < 0 or p_remaining_pct > 100) then
    raise exception 'bad remaining';
  end if;

  select * into v_row from public.bottle_keeps where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  update public.bottle_keeps
     set remaining_pct = p_remaining_pct, expires_on = p_expires_on,
         shelf_no = p_shelf_no, status = p_status, note = p_note
   where id = p_id;

  perform public.audit_log_write('bottle_keep_update', 'bottle_keeps:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(b) from public.bottle_keeps b where b.id = p_id), v_row.store_id);
end $function$;

revoke execute on function public.bottle_keep_update(uuid, integer, date, text, text, text) from public, anon;
grant  execute on function public.bottle_keep_update(uuid, integer, date, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (6) customer_set_grade 新設（owner/manager・null=無印化も正当・無変更無音）
-- ─────────────────────────────────────────────
create or replace function public.customer_set_grade(p_id uuid, p_grade text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_grade is not null and p_grade not in ('vip','vvip') then raise exception 'bad grade'; end if;

  select * into v_row from public.customers where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if v_row.grade is not distinct from p_grade then return; end if;  -- 無変更は無音（audit を汚さない）

  update public.customers set grade = p_grade where id = p_id;

  perform public.audit_log_write('customer_set_grade', 'customers:' || p_id::text,
    jsonb_build_object('grade', v_row.grade),
    jsonb_build_object('grade', p_grade),
    v_row.store_id);
end $function$;

revoke execute on function public.customer_set_grade(uuid, text) from public, anon;
grant  execute on function public.customer_set_grade(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (7) customer_note_add 新設（ゲート=customer_update 同型・can_crm 準拠・append-only）
-- ─────────────────────────────────────────────
create or replace function public.customer_note_add(p_customer_id uuid, p_body text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_cust  public.customers;
  v_actor uuid;
  v_id    uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(p_body) > 2000 then raise exception 'bad body'; end if;

  select * into v_cust from public.customers where id = p_customer_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- ゲート（customer_update 同型・can_crm 準拠・対象客の店＝自店）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_cust.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_cust.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.customer_notes (org_id, store_id, customer_id, body, author_user_id)
  values (v_org, v_cust.store_id, p_customer_id, trim(p_body), v_actor)
  returning id into v_id;

  perform public.audit_log_write('customer_note_add', 'customer_notes:' || v_id::text, null,
    (select to_jsonb(n) from public.customer_notes n where n.id = v_id), v_cust.store_id);
  return v_id;
end $function$;

revoke execute on function public.customer_note_add(uuid, text) from public, anon;
grant  execute on function public.customer_note_add(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (8) customer_note_remove 新設（owner/manager・論理削除・再実行は無音）
-- ─────────────────────────────────────────────
create or replace function public.customer_note_remove(p_note_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.customer_notes;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_row from public.customer_notes where id = p_note_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if v_row.is_removed then return; end if;  -- 既削除は無音（audit を汚さない）

  update public.customer_notes set is_removed = true where id = p_note_id;

  perform public.audit_log_write('customer_note_remove', 'customer_notes:' || p_note_id::text,
    jsonb_build_object('is_removed', false),
    jsonb_build_object('is_removed', true),
    v_row.store_id);
end $function$;

revoke execute on function public.customer_note_remove(uuid) from public, anon;
grant  execute on function public.customer_note_remove(uuid) to authenticated, service_role;

commit;
