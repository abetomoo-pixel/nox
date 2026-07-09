-- 0023_f3a2_customers: F3a 束2 — 顧客CRM（customers 新設 + can_crm 適用 + 集計）
--   ① customers テーブル新設（実体属性のみ・visits/last_visit/total_spend は列に持たない＝都度集計）
--   ② customers SELECT RLS（can_crm 適用・店スコープ必須・cast は指名客のみ cast_id 列1本）＋ grant 3段
--   ③ 書込RPC 3本（customer_register / customer_update / customer_assign_cast・INSERT/UPDATE policy なし）
--   ④ link: check_open drop→create（p_customer_id 末尾追加＋越境検証。check_pay は【live 確認済】
--      F1b 時点で receivables INSERT に v_chk.customer_id 連動済みのため無改修＝本 mig で触らない）
--   ⑤ FK 追加（checks / bottle_keeps / receivables .customer_id → customers・on delete set null）
--   ⑥ 集計RPC 2本（customer_summary 単一 / customer_list_summary 一覧・churn 30/60）
--   ⑦ bottle_keep_register 新設（can_register 準拠＝会計オペ・product 検証は check_add_line 同型）
--
-- 翻訳元・裁定参照:
--   - 認可正本 §1.5（can_crm 束2適用）/ customers 可視は casts_select 型（店スコープ必須）
--   - 相談役ロック（束2=顧客CRM・link は最注意・cast スコープは RPC 冒頭ガードで物理保証）
--   - 実装仕様書 NOX_F3_束2_顧客CRM_実装仕様.md（2026-07-09）
--
-- 実装ノート:
--   【1】customers は INSERT/UPDATE policy を作らない（SECURITY DEFINER RPC で検証）。
--   【2】check_open は drop→create（overload 残り回避・mig0021 前例）。差分は customer 越境検証
--        ブロック＋INSERT の customer_id 1列のみ。ゲート/冪等/店設定スナップショット/audit は
--        live pg_get_functiondef 正本に対しバイト不変。git diff --no-index で Agoora 目視。
--   【3】check_pay は live 確認の結果【既に連動済み】（receivables INSERT に v_chk.customer_id が
--        F1b から入っている・コメント「customer は伝票から＝サーバ導出」）。本 mig では触らない。
--   【4】集計RPC は definer で RLS を迂回するため、cast の担当客スコープを冒頭/CTE ガードで物理保証。
--        org 条件も RPC 内で自ら含める（規約8）。
--   【5】churn: 30日以上=離反 / 60日以上=高 / 30-59=中（モック nox-nightwork-app 準拠・分類は
--        customer_list_summary が返す。新規/リピート/優良のラベルは UI 側判定）。
--   【6】gen_random_uuid() を使う（pgcrypto gen_random_bytes は search_path で見えない）。
--   【7】規約7: customer_update の p_is_active は UI から常に明示値（coalesce 禁止・null は raise）。
--   【8】仕様書ドラフトからの実装調整（live/規約準拠・相談役レビュー対象）:
--        (a) 書込RPC 4本すべてに perform audit_log_write を追加（規約6「例外を作らない」。
--            ドラフトは省略していた）。
--        (b) updated_at は既存全表と同じ touch_updated_at トリガ方式（live 確認: 27表に設置済み）。
--            update RPC 内の明示 `updated_at = now()` はトリガと二重のため置かない。
--        (c) 店スコープ＋ロールの2段 if を、会計RPC（check_open）と同型の単一ゲート述語に統合
--            （意味同一・null 短絡で if がスキップされる余地を塞ぐ fail-closed）。
--        (d) p_store_id を受ける RPC（customer_register / bottle_keep_register）は set_product 型の
--            「store の org 照合」を先置き（owner が他 org の store_id を渡す越境 INSERT を封鎖）。
--        (e) bottle_keep_register の product 検証は check_add_line 同型
--            （同 org・同店・is_active＝'bad item' / 'inactive item'）。
--        (f) p_name は trim＋長さ 80 検証（set_product 'bad name' 同型）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select count(*) from public.customers;                            -- テーブル存在（0行）
--   select polname, cmd from pg_policies where tablename = 'customers'; -- customers_select 1本のみ
--   select tgname from pg_trigger where tgrelid = 'public.customers'::regclass and not tgisinternal;
--   select proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname='public' and proname in
--       ('customer_register','customer_update','customer_assign_cast',
--        'customer_summary','customer_list_summary','bottle_keep_register','check_open')
--     order by proname;                                               -- check_open に p_customer_id
--   select conname from pg_constraint where conname like '%customer_fk';  -- 3本
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname='public' and p.proname='check_open';            -- 1（overload 残りなし）
--   select prosrc like '%invalid customer%' from pg_proc where proname = 'check_open';

begin;

-- ══════════════════════════════════════════════════════════════
-- ① customers テーブル新設
--    実体属性のみ。visits / last_visit / total_spend / bottles は列に持たない（⑥の集計RPC）。
--    物理削除なし（is_active 休眠）。cast_id は set null（担当退店で顧客はフリー客に戻る）。
-- ══════════════════════════════════════════════════════════════
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  name       text not null,
  furigana   text,
  cast_id    uuid references public.casts(id) on delete set null,  -- 指名担当（担当客=解釈A）
  birthday   date,
  tel        text,
  prefs      text,
  memo       text,
  is_active  boolean not null default true,   -- 物理削除なし・休眠フラグ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_org_store_idx on public.customers (org_id, store_id);
create index customers_cast_idx      on public.customers (cast_id);

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at before update on public.customers
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════════════
-- ② customers SELECT RLS（店スコープ必須）＋ grant 3段（0003 標準型）
--    owner=org 全店全客 / manager=自店全客 / staff=can_crm 時のみ自店全客（false は0行）
--    cast=自店の指名客のみ（cast_id 列1本で物理保証・check_nominations は辿らない）
--    INSERT/UPDATE/DELETE policy は作らない（書込は③の RPC・削除は運用上存在しない）。
-- ══════════════════════════════════════════════════════════════
alter table public.customers enable row level security;

create policy customers_select on public.customers
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_crm())
      or (public.auth_role() = 'cast'  and cast_id = public.auth_cast_id())
    )
  );

revoke all on table public.customers from public, anon, authenticated;
grant select on table public.customers to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ 書込RPC 3本（二重防御・audit_log_write 必須＝規約6）
-- ══════════════════════════════════════════════════════════════

-- ── customer_register（新規登録）─────────────────────────────
--    owner=org 内全店 / manager=自店 / staff=自店∧can_crm / cast 不可。
--    担当割当（p_cast_id）は owner/manager のみ有効（staff が渡しても null 化）。
create or replace function public.customer_register(
  p_store_id uuid,
  p_name     text,
  p_furigana text default null,
  p_birthday date default null,
  p_tel      text default null,
  p_prefs    text default null,
  p_memo     text default null,
  p_cast_id  uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型＝store 不在/他 org も forbidden）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_crm 準拠）
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  -- 担当割当は owner/manager のみ。staff が p_cast_id を渡しても無視（null 化）
  if p_cast_id is not null and v_role not in ('owner','manager') then
    p_cast_id := null;
  end if;

  -- 割当先 cast は同 org・同店（越境割当封鎖）
  if p_cast_id is not null then
    if not exists (
      select 1 from public.casts c
      where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id
    ) then
      raise exception 'invalid cast';
    end if;
  end if;

  insert into public.customers (org_id, store_id, name, furigana, cast_id, birthday, tel, prefs, memo)
  values (v_org, p_store_id, trim(p_name), p_furigana, p_cast_id, p_birthday, p_tel, p_prefs, p_memo)
  returning id into v_id;

  perform public.audit_log_write('customer_register', 'customers:' || v_id::text, null,
    (select to_jsonb(cu) from public.customers cu where cu.id = v_id), p_store_id);
  return v_id;
end $$;

-- ── customer_update（編集・休眠切替）──────────────────────────
--    cast_id はここでは触らない（担当変更は customer_assign_cast 専用）。
--    規約7: p_is_active は UI から常に明示値（null は raise・coalesce 禁止）。
create or replace function public.customer_update(
  p_id        uuid,
  p_name      text,
  p_furigana  text,
  p_birthday  date,
  p_tel       text,
  p_prefs     text,
  p_memo      text,
  p_is_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_is_active is null then raise exception 'bad is_active'; end if;

  -- 対象行を org 内で取得（存在＋org 一致を同時確認）
  select * into v_row from public.customers where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- ゲート（check_open 同型・can_crm 準拠・対象客の店＝自店）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_row.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  update public.customers
     set name = trim(p_name), furigana = p_furigana, birthday = p_birthday,
         tel = p_tel, prefs = p_prefs, memo = p_memo,
         is_active = p_is_active
   where id = p_id;

  perform public.audit_log_write('customer_update', 'customers:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(cu) from public.customers cu where cu.id = p_id), v_row.store_id);
end $$;

-- ── customer_assign_cast（担当割当・owner/manager のみ）────────
--    staff は can_crm でも不可（担当＝報酬・指名に直結する経営判断のため）。
create or replace function public.customer_assign_cast(
  p_id      uuid,
  p_cast_id uuid          -- null で担当解除（フリー客に戻す）
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_row from public.customers where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 割当先 cast は同 org・同店（越境割当封鎖）
  if p_cast_id is not null then
    if not exists (
      select 1 from public.casts c
      where c.id = p_cast_id and c.org_id = v_org and c.store_id = v_row.store_id
    ) then
      raise exception 'invalid cast';
    end if;
  end if;

  update public.customers set cast_id = p_cast_id where id = p_id;

  perform public.audit_log_write('customer_assign_cast', 'customers:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(cu) from public.customers cu where cu.id = p_id), v_row.store_id);
end $$;

revoke execute on function public.customer_register(uuid, text, text, date, text, text, text, uuid) from public, anon;
grant  execute on function public.customer_register(uuid, text, text, date, text, text, text, uuid) to authenticated;
revoke execute on function public.customer_update(uuid, text, text, date, text, text, text, boolean) from public, anon;
grant  execute on function public.customer_update(uuid, text, text, date, text, text, text, boolean) to authenticated;
revoke execute on function public.customer_assign_cast(uuid, uuid) from public, anon;
grant  execute on function public.customer_assign_cast(uuid, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ link: check_open drop→create（p_customer_id uuid default null を末尾追加）
--    live pg_get_functiondef（2026-07-09 取得）を正本に、差分は
--    (1) customer 越境検証ブロック（同 org・卓の店と同店） (2) INSERT の customer_id 1列 のみ。
--    ゲート述語・自然冪等（既存 open 再利用）・店設定スナップショット・競合処理・audit は不変。
--    既存 UI（p_customer_id を渡さない呼び出し）は default null で無改修動作＝フリー客。
--    ※ 既存 open 再利用パスでは p_customer_id は無視される（先着伝票の顧客を保持＝自然冪等）。
-- ══════════════════════════════════════════════════════════════
drop function if exists public.check_open(uuid, int, text);

CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text; v_settings jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  select s.id, s.org_id, s.store_id, s.is_active, st.settings_json
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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

  -- 【決定1】店設定のスナップショット（既定 10 / 100 / down・不正値は raise）
  v_settings := coalesce(v_seat.settings_json, '{}'::jsonb);
  v_rate := coalesce(nullif(v_settings->>'service_rate','')::int, 10);
  v_unit := coalesce(nullif(v_settings->>'round_unit','')::int, 100);
  v_mode := coalesce(nullif(trim(v_settings->>'round_mode'),''), 'down');
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

revoke execute on function public.check_open(uuid, int, text, uuid) from public, anon;
grant  execute on function public.check_open(uuid, int, text, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑤ FK 追加（F1 nullable スタブの本結線・live 確認: 3表とも customer_id 非 null 行 0＝孤児なし）
--    on delete set null: 顧客行が消えても会計・売掛の履歴行は残る（運用上は is_active 休眠のみ）。
-- ══════════════════════════════════════════════════════════════
alter table public.checks
  add constraint checks_customer_fk
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.bottle_keeps
  add constraint bottle_keeps_customer_fk
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.receivables
  add constraint receivables_customer_fk
  foreign key (customer_id) references public.customers(id) on delete set null;

-- ══════════════════════════════════════════════════════════════
-- ⑥ 集計RPC 2本（都度集計・definer 迂回分の可視ガードを RPC 内で再現＝物理保証）
--    status 実値は live 確認済み: checks='closed' / bottle_keeps='active' / receivables='open'。
--    checks.total は integer（サーバ再計算済み確定値）。
-- ══════════════════════════════════════════════════════════════

-- ── customer_summary（単一顧客詳細）───────────────────────────
--    休眠客でも返す（顧客カード復活用）。cast は担当客のみ（それ以外は forbidden）。
create or replace function public.customer_summary(p_customer_id uuid)
returns table (
  customer_id     uuid,
  visits          integer,      -- closed check 件数
  last_visit      timestamptz,  -- max(started_at) of closed checks
  total_spend     bigint,       -- sum(total) of closed checks
  active_bottles  integer,      -- status='active' の bottle_keeps 件数
  open_receivable bigint        -- status='open' の receivables 合計
) language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cust public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_cust from public.customers where id = p_customer_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 可視ガード（RLS と同じ判定を RPC 内で再現＝definer 迂回の物理保証）
  if not (
    (v_role = 'owner')
    or (v_role = 'manager' and v_cust.store_id = public.auth_store_id())
    or (v_role = 'staff' and public.auth_staff_can_crm() and v_cust.store_id = public.auth_store_id())
    or (v_role = 'cast'  and v_cust.cast_id = public.auth_cast_id())   -- 担当客のみ
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    p_customer_id,
    (select count(*)::int from public.checks c
       where c.customer_id = p_customer_id and c.status = 'closed'),
    (select max(c.started_at) from public.checks c
       where c.customer_id = p_customer_id and c.status = 'closed'),
    (select coalesce(sum(c.total), 0)::bigint from public.checks c
       where c.customer_id = p_customer_id and c.status = 'closed'),
    (select count(*)::int from public.bottle_keeps b
       where b.customer_id = p_customer_id and b.status = 'active'),
    (select coalesce(sum(r.amount), 0)::bigint from public.receivables r
       where r.customer_id = p_customer_id and r.status = 'open');
end $$;

-- ── customer_list_summary（一覧・分析ダッシュボード）───────────
--    可視スコープを visible CTE で再現（cast は担当客のみ・staff は can_crm）。
--    churn_tier は RPC 内確定（none / mid=30-59 / high=60+）。休眠は一覧から除外。
create or replace function public.customer_list_summary(p_store_id uuid default null)
returns table (
  customer_id     uuid,
  name            text,
  furigana        text,
  cast_id         uuid,
  is_active       boolean,
  visits          integer,
  last_visit      timestamptz,
  total_spend     bigint,
  active_bottles  integer,
  open_receivable bigint,
  days_since      integer,       -- 当日との日数差（null=来店なし）
  churn_tier      text           -- 'none' | 'mid'(30-59) | 'high'(60+)
) language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_store uuid := public.auth_store_id();
  v_cast  uuid := public.auth_cast_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  return query
  with visible as (
    select cu.*
    from public.customers cu
    where cu.org_id = v_org
      and (v_role = 'owner' or cu.store_id = v_store)           -- 店スコープ
      and (
        v_role in ('owner','manager')
        or (v_role = 'staff' and public.auth_staff_can_crm())
        or (v_role = 'cast'  and cu.cast_id = v_cast)            -- 担当客のみ
      )
      and (p_store_id is null or cu.store_id = p_store_id)       -- owner の店絞り込み任意
      and cu.is_active                                           -- 休眠は一覧から除外
  ),
  agg as (
    select
      v.id, v.name, v.furigana, v.cast_id, v.is_active,
      (select count(*)::int from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as visits,
      (select max(c.started_at) from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as last_visit,
      (select coalesce(sum(c.total), 0)::bigint from public.checks c
         where c.customer_id = v.id and c.status = 'closed') as total_spend,
      (select count(*)::int from public.bottle_keeps b
         where b.customer_id = v.id and b.status = 'active') as active_bottles,
      (select coalesce(sum(r.amount), 0)::bigint from public.receivables r
         where r.customer_id = v.id and r.status = 'open') as open_receivable
    from visible v
  )
  select
    a.id, a.name, a.furigana, a.cast_id, a.is_active,
    a.visits, a.last_visit, a.total_spend, a.active_bottles, a.open_receivable,
    case when a.last_visit is null then null
         else (current_date - a.last_visit::date) end as days_since,
    case
      when a.last_visit is null then 'none'
      when (current_date - a.last_visit::date) >= 60 then 'high'
      when (current_date - a.last_visit::date) >= 30 then 'mid'
      else 'none'
    end as churn_tier
  from agg a
  order by a.last_visit desc nulls last;
end $$;

revoke execute on function public.customer_summary(uuid) from public, anon;
grant  execute on function public.customer_summary(uuid) to authenticated;
revoke execute on function public.customer_list_summary(uuid) from public, anon;
grant  execute on function public.customer_list_summary(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑦ bottle_keep_register（新設・can_register 準拠＝会計オペ）
--    live 確認済みの実列: org_id/store_id/customer_id/product_id/status/opened_at/note。
--    status CHECK = active/empty/removed。状態遷移（消化・撤去）RPC は束2スコープ外。
-- ══════════════════════════════════════════════════════════════
create or replace function public.bottle_keep_register(
  p_store_id    uuid,
  p_customer_id uuid,       -- どの客のボトルか（必須）
  p_product_id  uuid,
  p_note        text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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

  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note)
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note)
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $$;

revoke execute on function public.bottle_keep_register(uuid, uuid, uuid, text) from public, anon;
grant  execute on function public.bottle_keep_register(uuid, uuid, uuid, text) to authenticated;

commit;
