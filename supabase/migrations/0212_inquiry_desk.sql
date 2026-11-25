-- 0212_inquiry_desk（窓口の段 1・裁定426 の改め・相談役 11/25 の決め【D7】・起草と試走まで・適用はしない）
--   店（オーナーと店長）が運営に「要望・不具合・質問・2 店舗目の依頼（オーナーだけ）」を送る → 運営が /ops で読み、返事・状態（受付／確認中／対応済み／見送り）・ポイント（会社ごと）・取り消し・2 店目を足す。
--   返事は店の 🔔（要承認のカードの「運営から」）に出す＝未読は last_from='ops' かつ store_read_at が last_at より前。店へのメール・LINE は無し。運営へのメールは route（Resend）＝結果は inquiry_mail_note で監査に 1 行。
--   決め（相談役 11/25）：送れるのはオーナーと店長・ポイントは会社ごと・見せるのはオーナーだけ・添付は作らない・運営の返事で受付→確認中・対応済みと見送りには店は返事できない（'closed'）・
--     開いている問い合わせは会社に 30 件まで（'too many open'）・運営者の役で分けない・NOX の表だけ（Stripe に触れない）・請求の数量の同期（起票141）は作らない。
--   翻訳元：0207（ops_support_requests＝運営とオーナーの間の表の型）・0202a（ops_* の型＝service_role 専用・冒頭 ops_operator_ok・監査 ops_audit_write）・0203（ops_store_add を中で呼ぶ・作り直さない）・
--     0200 notice_mark_read（変えたときだけ監査）・0211（メールの結果の記録＝監査に 1 行・理由は英小文字と数字と _ だけ）・BANZEN 0098_support_tickets（表と関数の分け方）。
--   前提：0211 の後（関数 490・表 128）。**当てる直前に本番から数え直す**。後：関数 499（+9）・表 131（+3）。既存の関数は作り直さない。
--   表 3（テーブル追加の標準型＝作る→索引→RLS→SELECT の方針→revoke all（service_role も）→grant select を authenticated と service_role）・FK は全部 cascade か set null（wipe-cover (2) に当たらない）。
--   関数 9：店の側 4（authenticated・二重防御・課金ゲートの外＝B の運用除外）＝inquiry_create／inquiry_reply／inquiry_mark_read／inquiry_mail_note
--          運営の側 5（service_role 専用＝4 ロール revoke → service_role に grant・冒頭 ops_operator_ok）＝ops_inquiry_reply／ops_inquiry_set_status／ops_inquiry_point_grant／ops_inquiry_point_revoke／ops_inquiry_store_add
--   検証クエリ：docs/tmp/inquiry_1125/0212_verify.sql（先頭は貼り先証明 select 'nox-project-proof' k, count(*)::text v from public.orgs）。事前確認：0212_precheck.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 表 ops_inquiries（問い合わせ 1 件） ═══
create table public.ops_inquiries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,          -- どの店の話か（店長は自店だけ）
  kind           text not null check (kind in ('request', 'bug', 'question', 'store_add')),   -- 要望／不具合／質問／2 店舗目の依頼
  subject        text not null check (char_length(subject) between 1 and 60),
  status         text not null default 'received' check (status in ('received', 'checking', 'done', 'declined')),   -- 受付／確認中／対応済み／見送り
  status_at      timestamptz not null default now(),
  created_by     uuid null references public.users(id) on delete set null,
  created_role   text not null check (created_role in ('owner', 'manager')),
  idem_key       uuid not null,
  store_add      jsonb null,                                                              -- 2 店舗目の依頼の中身（name・biz_type・copy_from・parts・start）
  added_store_id uuid null references public.stores(id) on delete set null,              -- 運営が足した店
  last_from      text not null default 'store' check (last_from in ('store', 'ops')),   -- 最後の発言
  last_at        timestamptz not null default now(),
  store_read_at  timestamptz null,                                                        -- 店の側が運営の返事を最後に開いた時刻（会社の店の人で 1 つ）
  created_at     timestamptz not null default now(),
  constraint ops_inquiries_store_add_check check ((kind = 'store_add') = (store_add is not null)),
  constraint ops_inquiries_idem_key unique (org_id, idem_key)
);
create index ops_inquiries_org_last_idx on public.ops_inquiries (org_id, last_at desc);
create index ops_inquiries_status_last_idx on public.ops_inquiries (status, last_at desc);
create index ops_inquiries_store_idx on public.ops_inquiries (store_id);
alter table public.ops_inquiries enable row level security;
create policy ops_inquiries_select on public.ops_inquiries for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner'
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id() and kind <> 'store_add')));   -- オーナーは会社の全部・店長は自店の 2 店舗目以外・スタッフとキャストは 0 行
revoke all on table public.ops_inquiries from public, anon, authenticated, service_role;
grant select on table public.ops_inquiries to authenticated;
grant select on table public.ops_inquiries to service_role;   -- 運営の画面は admin で読む・書くのは関数だけ
comment on table public.ops_inquiries is '★0212（窓口の段 1・裁定426 の改め）: 店から運営への問い合わせ（書くのは inquiry_create／inquiry_reply／inquiry_mark_read と ops_inquiry_* だけ）';

-- ═══ ★2 表 ops_inquiry_messages（やりとり・最初の本文もここ） ═══
create table public.ops_inquiry_messages (
  id             uuid primary key default gen_random_uuid(),
  inquiry_id     uuid not null references public.ops_inquiries(id) on delete cascade,
  org_id         uuid not null references public.orgs(id) on delete cascade,
  from_ops       boolean not null,
  author_user_id uuid null references public.users(id) on delete set null,   -- 店の人（users.id）
  author_ops_id  uuid null,                                                   -- 運営者の auth の id（FK なし＝ops_audit_logs と同じ）
  body           text not null check (char_length(body) between 1 and 2000),
  idem_key       uuid null,
  created_at     timestamptz not null default now(),
  constraint ops_inquiry_messages_author_check check (from_ops = (author_ops_id is not null)),
  constraint ops_inquiry_messages_idem_key unique (inquiry_id, idem_key)
);
create index ops_inquiry_messages_inquiry_idx on public.ops_inquiry_messages (inquiry_id, created_at);
create index ops_inquiry_messages_org_idx on public.ops_inquiry_messages (org_id);
alter table public.ops_inquiry_messages enable row level security;
create policy ops_inquiry_messages_select on public.ops_inquiry_messages for select to authenticated
  using (org_id = public.auth_org_id() and exists (select 1 from public.ops_inquiries i where i.id = inquiry_id));   -- 親の問い合わせが見える行だけ（副問い合わせは親の RLS で絞られる・相互参照なし）
revoke all on table public.ops_inquiry_messages from public, anon, authenticated, service_role;
grant select on table public.ops_inquiry_messages to authenticated;
grant select on table public.ops_inquiry_messages to service_role;
comment on table public.ops_inquiry_messages is '★0212: 問い合わせのやりとり（店と運営の発言・添付なし）';

-- ═══ ★3 表 ops_point_entries（ポイントの台帳・会社ごと・残り＝sum(delta)） ═══
create table public.ops_point_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  inquiry_id  uuid null references public.ops_inquiries(id) on delete set null,
  kind        text not null check (kind in ('grant', 'revoke')),
  delta       integer not null check (delta <> 0 and delta between -5 and 5),
  reason      text null check (reason is null or char_length(reason) between 1 and 200),
  ops_user_id uuid not null,
  created_at  timestamptz not null default now(),
  constraint ops_point_entries_sign_check check ((kind = 'grant' and delta > 0) or (kind = 'revoke' and delta < 0))
);
create unique index ops_point_entries_one_grant on public.ops_point_entries (inquiry_id) where kind = 'grant';     -- 1 件の問い合わせに付与は 1 回
create unique index ops_point_entries_one_revoke on public.ops_point_entries (inquiry_id) where kind = 'revoke';   -- 取り消しも 1 回
create index ops_point_entries_org_idx on public.ops_point_entries (org_id, created_at desc);
alter table public.ops_point_entries enable row level security;
create policy ops_point_entries_select on public.ops_point_entries for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() = 'owner');   -- 見せるのはオーナーだけ
revoke all on table public.ops_point_entries from public, anon, authenticated, service_role;
grant select on table public.ops_point_entries to authenticated;
grant select on table public.ops_point_entries to service_role;
comment on table public.ops_point_entries is '★0212: 問い合わせのポイント（付与 grant／取り消し revoke・会社ごと・書くのは ops_inquiry_point_grant／ops_inquiry_point_revoke だけ）';

-- ═══ ★4 店の側：送る（authenticated・二重防御・オーナーと店長・2 店舗目はオーナーだけ） ═══
CREATE OR REPLACE FUNCTION public.inquiry_create(p_store_id uuid, p_kind text, p_subject text, p_body text, p_store_add jsonb, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_open_max constant integer := 30;
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_user  uuid;
  v_store public.stores;
  v_src   public.stores;
  v_id    uuid;
  v_subj  text := btrim(coalesce(p_subject, ''));
  v_body  text := btrim(coalesce(p_body, ''));
  v_sa    jsonb := null;
  v_name  text;
  v_biz   text;
  v_from  uuid := null;
  v_fromt text;
  v_parts text[] := '{}'::text[];
  v_start text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('request', 'bug', 'question', 'store_add') then raise exception 'bad kind'; end if;
  if p_kind = 'store_add' and v_role <> 'owner' then raise exception 'forbidden'; end if;   -- 2 店舗目の依頼はオーナーだけ
  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_role = 'manager' and p_store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;   -- 店長は自店だけ
  if exists (select 1 from public.orgs o where o.id = v_org and o.is_demo) then raise exception 'forbidden (demo)'; end if;
  if p_idem_key is null then raise exception 'idem key required'; end if;
  perform pg_advisory_xact_lock(hashtext('ops_inquiries:' || v_org::text));   -- 同じ会社の送信を 1 つずつ（上限と冪等をずらさない）
  select id into v_id from public.ops_inquiries where org_id = v_org and idem_key = p_idem_key;   -- 冪等の照合は org とロールの照合の後（原則 9）
  if v_id is not null then return v_id; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  if p_kind = 'store_add' then
    if p_store_add is null or jsonb_typeof(p_store_add) <> 'object' then raise exception 'bad store add'; end if;
    v_name := btrim(coalesce(p_store_add->>'name', ''));
    if char_length(v_name) not between 1 and 40 then raise exception 'bad name'; end if;
    if exists (select 1 from public.stores s where s.org_id = v_org and s.name = v_name) then raise exception 'dup store'; end if;
    v_biz := p_store_add->>'biz_type';
    if v_biz is null or v_biz not in ('cabaret', 'girlsbar', 'snack', 'lounge', 'bar', 'host') then raise exception 'bad biz type'; end if;   -- ops_store_add と同じ 6 つ
    v_fromt := nullif(p_store_add->>'copy_from', '');
    if v_fromt is not null then
      if v_fromt !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'bad copy from'; end if;
      select * into v_src from public.stores where id = v_fromt::uuid;
      if v_src.id is null or v_src.org_id <> v_org then raise exception 'bad copy from'; end if;
      if coalesce(v_src.settings_json->>'setup_done', '') <> 'true' then raise exception 'copy from not ready'; end if;
      v_from := v_src.id;
    end if;
    if p_store_add ? 'parts' then
      if jsonb_typeof(p_store_add->'parts') <> 'array' then raise exception 'bad parts'; end if;
      select coalesce(array_agg(distinct x order by x), '{}'::text[]) into v_parts from jsonb_array_elements_text(p_store_add->'parts') x;
    end if;
    if exists (select 1 from unnest(v_parts) x where x not in ('pricing', 'products', 'comp', 'settings', 'hours')) then raise exception 'bad parts'; end if;
    if (v_from is null) <> (cardinality(v_parts) = 0) then raise exception 'bad parts'; end if;   -- 写し元が無ければ空・あれば 1 つ以上（ops_store_add と同じ線）
    v_start := p_store_add->>'start';
    if v_start is null or v_start not in ('now', '1m', '2_3m', 'undecided') then raise exception 'bad start'; end if;   -- すぐ／1 か月以内／2〜3 か月後／未定
    if char_length(v_body) > 200 then raise exception 'bad body'; end if;   -- 2 店舗目はひとこと（任意・200 字まで）
    v_sa := jsonb_build_object('name', v_name, 'biz_type', v_biz, 'copy_from', v_from, 'parts', to_jsonb(v_parts), 'start', v_start);
    v_subj := left('2 店舗目の依頼：' || v_name, 60);
    if v_body = '' then v_body := '2 店舗目の依頼です。'; end if;
  else
    if p_store_add is not null then raise exception 'bad store add'; end if;
    if char_length(v_subj) not between 1 and 60 then raise exception 'bad subject'; end if;
    if char_length(v_body) not between 1 and 2000 then raise exception 'bad body'; end if;
  end if;
  if (select count(*) from public.ops_inquiries i where i.org_id = v_org and i.status in ('received', 'checking')) >= c_open_max then raise exception 'too many open'; end if;
  insert into public.ops_inquiries (org_id, store_id, kind, subject, created_by, created_role, idem_key, store_add, last_from, last_at)
  values (v_org, p_store_id, p_kind, v_subj, v_user, v_role, p_idem_key, v_sa, 'store', now())
  returning id into v_id;
  insert into public.ops_inquiry_messages (inquiry_id, org_id, from_ops, author_user_id, body)
  values (v_id, v_org, false, v_user, v_body);
  perform public.audit_log_write('inquiry_create', 'ops_inquiries:' || v_id::text, null,
    jsonb_build_object('kind', p_kind, 'subject', v_subj, 'body_chars', char_length(v_body), 'store_add', v_sa), p_store_id);   -- 本文は入れず字数だけ
  return v_id;
end $function$;
revoke execute on function public.inquiry_create(uuid, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.inquiry_create(uuid, text, text, text, jsonb, uuid) to authenticated;

-- ═══ ★5 店の側：返事（対応済み・見送りには返事できない＝新しく送る） ═══
CREATE OR REPLACE FUNCTION public.inquiry_reply(p_inquiry uuid, p_body text, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_user uuid;
  v_inq  public.ops_inquiries;
  v_id   uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null or v_inq.org_id <> v_org
     or (v_role = 'manager' and (v_inq.store_id is distinct from public.auth_store_id() or v_inq.kind = 'store_add')) then raise exception 'not found'; end if;   -- 見える行だけ（RLS と同じ条件）
  if exists (select 1 from public.orgs o where o.id = v_org and o.is_demo) then raise exception 'forbidden (demo)'; end if;
  if p_idem_key is null then raise exception 'idem key required'; end if;
  select id into v_id from public.ops_inquiry_messages where inquiry_id = p_inquiry and idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;   -- 同じ鍵は同じ行（閉じた後の再送も同じ行を返す）
  if v_inq.status in ('done', 'declined') then raise exception 'closed'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'bad body'; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  insert into public.ops_inquiry_messages (inquiry_id, org_id, from_ops, author_user_id, body, idem_key)
  values (p_inquiry, v_org, false, v_user, v_body, p_idem_key)
  returning id into v_id;
  update public.ops_inquiries set last_from = 'store', last_at = now() where id = p_inquiry;
  perform public.audit_log_write('inquiry_reply', 'ops_inquiries:' || p_inquiry::text, null,
    jsonb_build_object('message_id', v_id, 'body_chars', char_length(v_body)), v_inq.store_id);
  return v_id;
end $function$;
revoke execute on function public.inquiry_reply(uuid, text, uuid) from public, anon;
grant execute on function public.inquiry_reply(uuid, text, uuid) to authenticated;

-- ═══ ★6 店の側：運営の返事を読んだ（変えたときだけ監査＝notice_mark_read と同じ形） ═══
CREATE OR REPLACE FUNCTION public.inquiry_mark_read(p_inquiry uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_inq  public.ops_inquiries;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null or v_inq.org_id <> v_org
     or (v_role = 'manager' and (v_inq.store_id is distinct from public.auth_store_id() or v_inq.kind = 'store_add')) then raise exception 'not found'; end if;
  if v_inq.last_from <> 'ops' or (v_inq.store_read_at is not null and v_inq.store_read_at >= v_inq.last_at) then return false; end if;   -- 未読でなければ何もしない（監査も書かない）
  update public.ops_inquiries set store_read_at = now() where id = p_inquiry;
  perform public.audit_log_write('inquiry_mark_read', 'ops_inquiries:' || p_inquiry::text, null, jsonb_build_object('last_at', v_inq.last_at), v_inq.store_id);
  return true;
end $function$;
revoke execute on function public.inquiry_mark_read(uuid) from public, anon;
grant execute on function public.inquiry_mark_read(uuid) to authenticated;

-- ═══ ★7 店の側：運営へのメールの結果の記録（送った本人だけ・1 件に 1 回・理由は英小文字と数字と _ だけ＝宛先や URL を入れられない） ═══
CREATE OR REPLACE FUNCTION public.inquiry_mail_note(p_inquiry uuid, p_status text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_user uuid;
  v_inq  public.ops_inquiries;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('sent', 'skipped', 'failed') then raise exception 'bad status'; end if;
  if p_reason is not null and p_reason !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad reason'; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null or v_inq.org_id <> v_org or v_inq.created_by is distinct from v_user then raise exception 'not found'; end if;   -- 送った本人だけ
  if exists (select 1 from public.audit_logs a where a.action = 'inquiry_mail' and a.target = 'ops_inquiries:' || p_inquiry::text) then return false; end if;   -- 1 件に 1 回
  perform public.audit_log_write('inquiry_mail', 'ops_inquiries:' || p_inquiry::text, null, jsonb_build_object('status', p_status, 'reason', p_reason), v_inq.store_id);
  return true;
end $function$;
revoke execute on function public.inquiry_mail_note(uuid, text, text) from public, anon;
grant execute on function public.inquiry_mail_note(uuid, text, text) to authenticated;

-- ═══ ★8 運営：返事（service_role 専用・受付なら確認中に） ═══
CREATE OR REPLACE FUNCTION public.ops_inquiry_reply(p_ops uuid, p_inquiry uuid, p_body text, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inq  public.ops_inquiries;
  v_id   uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_next text;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null then raise exception 'not found'; end if;
  if p_idem_key is null then raise exception 'idem key required'; end if;
  select id into v_id from public.ops_inquiry_messages where inquiry_id = p_inquiry and idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'bad body'; end if;
  insert into public.ops_inquiry_messages (inquiry_id, org_id, from_ops, author_ops_id, body, idem_key)
  values (p_inquiry, v_inq.org_id, true, p_ops, v_body, p_idem_key)
  returning id into v_id;
  v_next := case when v_inq.status = 'received' then 'checking' else v_inq.status end;   -- 運営が返事をしたら受付は確認中に
  update public.ops_inquiries
     set last_from = 'ops', last_at = now(), status = v_next,
         status_at = case when v_next <> v_inq.status then now() else status_at end
   where id = p_inquiry;
  perform public.ops_audit_write(p_ops, v_inq.org_id, 'ops.inquiry.reply', 'ops_inquiries:' || p_inquiry::text,
    jsonb_build_object('status', v_inq.status), jsonb_build_object('message_id', v_id, 'body_chars', char_length(v_body), 'status', v_next), null, v_inq.store_id, true);
  return v_id;
end $function$;
revoke all on function public.ops_inquiry_reply(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.ops_inquiry_reply(uuid, uuid, text, uuid) to service_role;

-- ═══ ★9 運営：状態（4 つのどれへも・見送りは理由が要る・同じ値は何もしない） ═══
CREATE OR REPLACE FUNCTION public.ops_inquiry_set_status(p_ops uuid, p_inquiry uuid, p_status text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inq    public.ops_inquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('received', 'checking', 'done', 'declined') then raise exception 'bad status'; end if;
  if v_reason is not null and char_length(v_reason) > 200 then raise exception 'bad reason'; end if;
  if p_status = 'declined' and v_reason is null then raise exception 'reason required'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null then raise exception 'not found'; end if;
  if v_inq.status = p_status then return false; end if;
  update public.ops_inquiries set status = p_status, status_at = now() where id = p_inquiry;
  perform public.ops_audit_write(p_ops, v_inq.org_id, 'ops.inquiry.status', 'ops_inquiries:' || p_inquiry::text,
    jsonb_build_object('status', v_inq.status), jsonb_build_object('status', p_status), v_reason, v_inq.store_id, true);
  return true;
end $function$;
revoke all on function public.ops_inquiry_set_status(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_inquiry_set_status(uuid, uuid, text, text) to service_role;

-- ═══ ★10 運営：ポイントを付ける（不具合 1〜3・要望 1〜5・質問と 2 店舗目は付けない・1 件に 1 回・戻り＝会社の残り） ═══
CREATE OR REPLACE FUNCTION public.ops_inquiry_point_grant(p_ops uuid, p_inquiry uuid, p_points integer, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inq    public.ops_inquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_max    integer;
  v_bal    integer;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null then raise exception 'not found'; end if;
  if exists (select 1 from public.orgs o where o.id = v_inq.org_id and o.is_demo) then raise exception 'forbidden (demo)'; end if;
  v_max := case v_inq.kind when 'bug' then 3 when 'request' then 5 else 0 end;
  if v_max = 0 then raise exception 'no points'; end if;
  if p_points is null or p_points < 1 or p_points > v_max then raise exception 'bad points'; end if;
  if v_reason is not null and char_length(v_reason) > 200 then raise exception 'bad reason'; end if;
  if exists (select 1 from public.ops_point_entries e where e.inquiry_id = p_inquiry and e.kind = 'grant') then raise exception 'already granted'; end if;
  insert into public.ops_point_entries (org_id, inquiry_id, kind, delta, reason, ops_user_id) values (v_inq.org_id, p_inquiry, 'grant', p_points, v_reason, p_ops);
  select coalesce(sum(e.delta), 0)::int into v_bal from public.ops_point_entries e where e.org_id = v_inq.org_id;
  perform public.ops_audit_write(p_ops, v_inq.org_id, 'ops.inquiry.points', 'ops_inquiries:' || p_inquiry::text,
    null, jsonb_build_object('points', p_points, 'balance', v_bal), v_reason, v_inq.store_id, true);
  return v_bal;
end $function$;
revoke all on function public.ops_inquiry_point_grant(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_inquiry_point_grant(uuid, uuid, integer, text) to service_role;

-- ═══ ★11 運営：ポイントを取り消す（付けた分を打ち消す 1 行・理由が要る・1 回だけ・戻り＝会社の残り） ═══
CREATE OR REPLACE FUNCTION public.ops_inquiry_point_revoke(p_ops uuid, p_inquiry uuid, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inq    public.ops_inquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_grant  integer;
  v_bal    integer;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if v_reason is null then raise exception 'reason required'; end if;
  if char_length(v_reason) > 200 then raise exception 'bad reason'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null then raise exception 'not found'; end if;
  select e.delta into v_grant from public.ops_point_entries e where e.inquiry_id = p_inquiry and e.kind = 'grant';
  if v_grant is null then raise exception 'not granted'; end if;
  if exists (select 1 from public.ops_point_entries e where e.inquiry_id = p_inquiry and e.kind = 'revoke') then raise exception 'already revoked'; end if;
  insert into public.ops_point_entries (org_id, inquiry_id, kind, delta, reason, ops_user_id) values (v_inq.org_id, p_inquiry, 'revoke', -v_grant, v_reason, p_ops);
  select coalesce(sum(e.delta), 0)::int into v_bal from public.ops_point_entries e where e.org_id = v_inq.org_id;
  perform public.ops_audit_write(p_ops, v_inq.org_id, 'ops.inquiry.points_revoke', 'ops_inquiries:' || p_inquiry::text,
    jsonb_build_object('points', v_grant), jsonb_build_object('points', 0, 'balance', v_bal), v_reason, v_inq.store_id, true);
  return v_bal;
end $function$;
revoke all on function public.ops_inquiry_point_revoke(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ops_inquiry_point_revoke(uuid, uuid, text) to service_role;

-- ═══ ★12 運営：2 店舗目の依頼から店を足す（中で 0203 の ops_store_add を呼ぶ・2 回押しても店は 1 つ・依頼は対応済みに・店の側に運営の発言 1 行） ═══
CREATE OR REPLACE FUNCTION public.ops_inquiry_store_add(p_ops uuid, p_inquiry uuid, p_store_name text, p_biz_type text, p_copy_from uuid, p_copy_parts text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inq   public.ops_inquiries;
  v_res   jsonb;
  v_store uuid;
  v_name  text := btrim(coalesce(p_store_name, ''));
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select * into v_inq from public.ops_inquiries where id = p_inquiry for update;
  if v_inq.id is null then raise exception 'not found'; end if;
  if v_inq.kind <> 'store_add' then raise exception 'not store add'; end if;
  if v_inq.added_store_id is not null then return jsonb_build_object('store_id', v_inq.added_store_id, 'inquiry_id', p_inquiry, 'replay', true); end if;   -- 2 回目は同じ店を返す
  if v_inq.status = 'declined' then raise exception 'closed'; end if;
  v_res := public.ops_store_add(p_ops, v_inq.org_id, v_name, p_biz_type, p_copy_from, p_copy_parts);   -- 0203 の関数（店・下書き・運営と店の監査）＝作り直さない
  v_store := (v_res->>'store_id')::uuid;
  update public.ops_inquiries
     set added_store_id = v_store, status = 'done', status_at = now(), last_from = 'ops', last_at = now()
   where id = p_inquiry;
  insert into public.ops_inquiry_messages (inquiry_id, org_id, from_ops, author_ops_id, body)
  values (p_inquiry, v_inq.org_id, true, p_ops, '店を追加しました（' || v_name || '・初期設定の前）。店を切り替えて、2 店目の初期設定を進めてください。');
  perform public.ops_audit_write(p_ops, v_inq.org_id, 'ops.inquiry.store_add', 'ops_inquiries:' || p_inquiry::text,
    jsonb_build_object('status', v_inq.status), jsonb_build_object('store_id', v_store, 'status', 'done'), null, v_inq.store_id, true);
  return v_res || jsonb_build_object('inquiry_id', p_inquiry, 'replay', false);
end $function$;
revoke all on function public.ops_inquiry_store_add(uuid, uuid, text, text, uuid, text[]) from public, anon, authenticated, service_role;
grant execute on function public.ops_inquiry_store_add(uuid, uuid, text, text, uuid, text[]) to service_role;

commit;
