-- 0034_notices: F3e — お知らせ（notices・掲載期限・P3 cast共有）
-- ★★ 非idempotent（create table + grant を含む）・再適用厳禁 ★★
--    再適用すると 'relation "notices" already exists' で全体 rollback（単一トランザクション）。
--    RPC 3本のみ再流したい場合は create table〜grant を外した別 mig を切ること。
--
-- 設計ロック（F3c〜F3f 統制系 調査 → 相談役確定）:
--  - notices は店×お知らせ。audience in ('all','cast','staff')。掲載期限 until（date・null=期限なし）。
--  - ★期限切れは DB で削除も raise もしない＝期限切れ行も保持。表示側（UI）が until で判定（段階リリース §5 の
--    「期限切れアーカイブは return/フラグ判定で・raise 回避」方針）。
--  - RLS=P3（cast共有・NOX_認可設計_RLS.md §2.3 の notices 例に準拠）: owner/manager/staff は全 audience 可視・
--    cast は all/cast のみ・anon 0行。★store_id = auth_store_id() 一本＝owner も自店スコープ（正本 §2.3 例と同一）。
--  - 書込は RPC 3本（SECURITY DEFINER・INSERT/UPDATE/DELETE policy は作らない）。二重防御（CLAUDE.md §二重防御）。
--  - grant=mig0032 教訓4（create table 時に Supabase が authenticated へ全権自動 grant する残余を明示 revoke）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) テーブル＋制約＋RLS＋grant を1結果セットで:
--      select
--        (select string_agg(conname, ' | ' order by conname) from pg_constraint
--           where conrelid='public.notices'::regclass) as constraints,
--        (select string_agg(polname||':'||polcmd, ' | ') from pg_policy
--           where polrelid='public.notices'::regclass) as policies,
--        (select string_agg(grantee||'='||privilege_type, ', ') from information_schema.role_table_grants
--           where table_name='notices') as tbl_grants,
--        (select relrowsecurity from pg_class where oid='public.notices'::regclass) as rls_enabled;
--   2) RPC 3本の prosrc＋ACL を1結果セットで:
--      select
--        (select pg_get_functiondef('notice_create(text, text, text, boolean, date)'::regprocedure))          as create_def,
--        (select pg_get_functiondef('notice_update(uuid, text, text, text, boolean, date)'::regprocedure))    as update_def,
--        (select pg_get_functiondef('notice_delete(uuid)'::regprocedure))                                     as delete_def,
--        (select string_agg(p.proname||'='||coalesce(array_to_string(p.proacl,','),'default'), ' || ')
--           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--           where n.nspname='public' and p.proname in ('notice_create','notice_update','notice_delete')) as fn_acls;
--   3) notify pgrst, 'reload schema';
--   4) 動作アンカー（P3 可視・audience ゲート・owner/manager 権限・staff/cast forbidden・自店照合・
--      期限切れ行の保持・anon BLOCKED）は verify 段27 で real signIn 実測。

begin;

-- ── テーブル: notices ──
create table public.notices (
  id         uuid        not null default gen_random_uuid(),
  org_id     uuid        not null references public.orgs(id),
  store_id   uuid        not null references public.stores(id),
  title      text        not null,
  body       text        not null,
  audience   text        not null,
  pinned     boolean     not null default false,
  until      date,
  created_by uuid        not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint notices_pkey primary key (id),
  constraint notices_audience_check check (audience in ('all','cast','staff'))
);

create index notices_store_idx on public.notices (store_id);

alter table public.notices enable row level security;

-- SELECT（P3・cast共有・正本 §2.3 notices 例に準拠）
create policy notices_select on public.notices
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and store_id = public.auth_store_id()
    and (public.auth_role() <> 'cast' or audience in ('all','cast'))
  );

-- grant（mig0032 教訓4: authenticated への自動全権 grant を明示 revoke。SELECT=RLS・書込=RPC 経由）
revoke all on table public.notices from public, anon;
grant select on table public.notices to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.notices from authenticated;

-- ── RPC1: notice_create（owner/manager・自店へ投稿）──
create or replace function public.notice_create(
  p_title    text,
  p_body     text,
  p_audience text,
  p_pinned   boolean,
  p_until    date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid; v_title text; v_body text; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  -- 検証（title 空/長さ・body 空・audience・pinned 明示値）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by)
  values (public.auth_org_id(), public.auth_store_id(), v_title, v_body, p_audience, p_pinned, p_until, v_actor)
  returning id into v_id;
  perform public.audit_log_write('notice_create', 'notices:' || v_id::text, null,
    (select to_jsonb(n) from public.notices n where n.id = v_id), public.auth_store_id());
  return v_id;
end $$;
revoke execute on function public.notice_create(text, text, text, boolean, date) from public, anon;
grant  execute on function public.notice_create(text, text, text, boolean, date) to authenticated;

-- ── RPC2: notice_update（owner/manager・自店・規約7 全フィールド明示送信）──
create or replace function public.notice_update(
  p_notice_id uuid,
  p_title     text,
  p_body      text,
  p_audience  text,
  p_pinned    boolean,
  p_until     date
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.notices; v_before jsonb; v_title text; v_body text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  -- 検証（create と同一）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  v_before := to_jsonb(v_row);
  update public.notices
     set title = v_title, body = v_body, audience = p_audience, pinned = p_pinned, until = p_until
   where id = p_notice_id;
  perform public.audit_log_write('notice_update', 'notices:' || p_notice_id::text, v_before,
    (select to_jsonb(n) from public.notices n where n.id = p_notice_id), v_row.store_id);
end $$;
revoke execute on function public.notice_update(uuid, text, text, text, boolean, date) from public, anon;
grant  execute on function public.notice_update(uuid, text, text, text, boolean, date) to authenticated;

-- ── RPC3: notice_delete（owner/manager・自店・物理削除）──
create or replace function public.notice_delete(p_notice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.notices; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_before := to_jsonb(v_row);
  delete from public.notices where id = p_notice_id;
  perform public.audit_log_write('notice_delete', 'notices:' || p_notice_id::text, v_before, null, v_row.store_id);
end $$;
revoke execute on function public.notice_delete(uuid) from public, anon;
grant  execute on function public.notice_delete(uuid) to authenticated;

commit;
