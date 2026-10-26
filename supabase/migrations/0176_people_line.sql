-- 0176_people_line.sql — 401 LINE 連携と送信数（BZ-R）／399 の残り（staff_contract_set・登録→招待の 2 段・member_profiles）／400 の残り（contact_changes）／I-4 遅刻・当欠の連絡の確認済みと履歴／SH-UI-b の 0176 行き 5 件
--   （2026-10-22 起草・便 0175／0176 起草・適用は Agoora 手貼り＝P176・流していない・**0175 の後**（users.contact_email／staff_contracts.pay_kind／memberships.hire_date を前提））
-- 翻訳元: 新設の表・RPC＝生成器 docs/tmp/gen_0176.mjs の文字列（live の関数置換は set_my_contact＝0175 の本文＋履歴の insert）。BANZEN の器（docs/handoff/nox_port_2026-10-21.md・docs/dp/bzr_port_20261022.md）を NOX 流儀（org／store・owner／manager・RPC 専任・audit）へ写した。
--   ★1 401: stores +line_config（jsonb・公開値 login_channel_id／liff_id／bot_destination＋Vault の ref）+line_monthly_limit（既定 200）／line_links（1 LINE＝1 人・unique(org, line_user_id)・unique(subject)）／line_bind_tokens（招待トークン＝sha256・7 日）／line_push_log（kind 4 種・429 を残す）／
--        set_store_line_config（owner／manager）・set_line_secret／get_line_secret（Vault・service_role）・line_bind_token_create（owner／manager・平文は 1 回だけ）・bind_line（service_role）・set_store_line_limit・line_push_log_write（service_role）・line_push_month_summary（JST 暦月）
--   ★2 399 の残り: staff_contract_set（owner／自店 manager は staff のみ・pay_kind と contract_kind の整合）／staff_invites＋staff_invite_create（Auth を作らない「登録」）／staff_invite_accept（service_role・users＋memberships＋staff_contracts を 1 回で）／member_profiles（BANZEN 0194 の写し＝本人が直す列・申告→店が確定・在留）＋self_save／store_save／confirm
--   ★3 I-4: attendance +ack_at／ack_by・attendance_contacts（同日の複数連絡の履歴）・attendance_contact_log（本人／店）・attendance_ack
--   ★4 400 の残り: contact_changes（field・old／new・confirmed_at／by）・set_my_contact（0175 の本文＋履歴）・contact_change_confirm
--   ★5 SH-UI-b 0176 行き: (a) shift_period_needs＋shift_period_needs_set（期間 × 曜日・無い曜日は店の staffing_needs）(b) shift_periods_auto_close（締切を過ぎた open→closed・service_role＝cron）(c) shifts +declined_at／decline_reason＋shift_cast_decline（proposed→planned）(d) cast_notifications＋cast_notification_create／read（1 人あて）(e) notices +cast_ids＋notice_create_targets（未提出の人へ）
--   411（キャストの打刻 使う／使わない）＝DB 変更なし（stores.punch_methods の組合せ＝便 X13-G W-23 で client 済み）。
--   既存データの書換え＝0。全部が列追加（既定値）・新表・新 RPC（set_my_contact の置換だけが既存関数）。Vault（supabase_vault）は本番に有効（0021／0163 で使用済み）。
-- 検証（Success の後・形で見る）: 末尾 ===== verify ===== の 1 文（docs/demo/verify_0176.sql と同じ）。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ ★1 列・表（401） ═══
alter table public.stores add column if not exists line_config jsonb not null default '{}'::jsonb;
alter table public.stores drop constraint if exists stores_line_config_obj;
alter table public.stores add constraint stores_line_config_obj check (jsonb_typeof(line_config) = 'object');
alter table public.stores add column if not exists line_monthly_limit integer not null default 200;
alter table public.stores drop constraint if exists stores_line_monthly_limit_check;
alter table public.stores add constraint stores_line_monthly_limit_check check (line_monthly_limit between 1 and 1000000);
comment on column public.stores.line_config is '★0176（401）: LINE の設定（店単位）＝login_channel_id／liff_id／bot_destination（公開値）＋channel_secret_ref／access_token_ref（Vault の id・値は Vault）';

create table if not exists public.line_links (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('cast','membership')),
  subject_id   uuid not null,
  line_user_id text not null check (line_user_id ~ '^U[0-9a-f]{32}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint line_links_org_line_uq unique (org_id, line_user_id),
  constraint line_links_subject_uq  unique (subject_kind, subject_id)
);
alter table public.line_links enable row level security;
drop policy if exists line_links_select on public.line_links;
create policy line_links_select on public.line_links for select to authenticated using (org_id = public.auth_org_id() and ((public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()))
  or (subject_kind = 'cast' and subject_id = public.auth_cast_id()) or (subject_kind = 'membership' and subject_id = public.auth_membership_id())));
revoke all on table public.line_links from public, anon, authenticated;
grant select on table public.line_links to authenticated;
comment on table public.line_links is '★0176（401）: LINE の紐付け＝1 LINE＝1 人（org 内）・書くのは bind_line（service_role）だけ';

create table if not exists public.line_bind_tokens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('cast','membership')),
  subject_id   uuid not null,
  purpose      text not null default 'bind' check (purpose in ('onboard','bind')),
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);
alter table public.line_bind_tokens enable row level security;   -- policy 0 本＝RPC 専任（cast_pin／staff_pin と同型）
revoke all on table public.line_bind_tokens from public, anon, authenticated;
comment on table public.line_bind_tokens is '★0176（401）: LINE 紐付けの招待トークン（sha256 の hex・7 日・1 回）';

create table if not exists public.line_push_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  store_id        uuid not null references public.stores(id) on delete cascade,
  kind            text not null check (kind in ('shift_published','shift_changed','punch_unclosed','notice')),
  recipient_count integer not null default 1 check (recipient_count >= 1),
  status          text not null check (status in ('sent','failed')),
  http_status     integer,
  line_request_id text,
  error_detail    text,
  sent_at         timestamptz not null default now()
);
create index if not exists line_push_log_store_month_idx on public.line_push_log(store_id, sent_at desc);
alter table public.line_push_log enable row level security;
drop policy if exists line_push_log_select on public.line_push_log;
create policy line_push_log_select on public.line_push_log for select to authenticated using (org_id = public.auth_org_id() and public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.line_push_log from public, anon, authenticated;
grant select on table public.line_push_log to authenticated;
comment on table public.line_push_log is '★0176（401）: LINE 送信台帳＝数えるため（宛先の userId・token は持たない・429 は failed で残す・reply は数えない）';

-- ═══ ★2 表（399 の残り） ═══
create table if not exists public.staff_invites (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  email            text not null,
  name             text not null,
  role             text not null check (role in ('manager','staff')),
  contract         jsonb not null default '{}'::jsonb,
  token_hash       text not null unique,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_user_id uuid references public.users(id),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists staff_invites_org_email_idx on public.staff_invites(org_id, email);
alter table public.staff_invites enable row level security;
drop policy if exists staff_invites_select on public.staff_invites;
create policy staff_invites_select on public.staff_invites for select to authenticated using (org_id = public.auth_org_id() and public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.staff_invites from public, anon, authenticated;
grant select on table public.staff_invites to authenticated;
comment on table public.staff_invites is '★0176（I-1）: スタッフの登録→招待の 2 段（Auth を作らずに「登録」・受諾で users／memberships／staff_contracts）';

create table if not exists public.member_profiles (
  user_id                 uuid primary key references public.users(id) on delete cascade,
  org_id                  uuid not null references public.orgs(id) on delete cascade,
  kana                    text check (kana is null or length(kana) between 1 and 60),
  address                 text check (address is null or length(address) <= 200),
  emergency_name          text check (emergency_name is null or length(emergency_name) <= 60),
  emergency_relation      text check (emergency_relation is null or length(emergency_relation) <= 20),
  emergency_phone         text check (emergency_phone is null or emergency_phone ~ '^[0-9+\-() ]{6,20}$'),
  commute_kind            text check (commute_kind is null or commute_kind in ('daily','pass')),
  commute_yen             integer check (commute_yen is null or (commute_yen between 0 and 1000000)),
  nearest_station         text check (nearest_station is null or length(nearest_station) <= 40),
  student_kind            text not null default 'none' check (student_kind in ('none','student','high_school')),
  legal_name_draft        text, legal_name text, legal_name_confirmed_at timestamptz, legal_name_confirmed_by uuid references public.users(id),
  birth_date_draft        date, birth_date date check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date)), birth_date_confirmed_at timestamptz, birth_date_confirmed_by uuid references public.users(id),
  residence_expiry_draft  date, residence_permit_draft boolean, residence_expiry date, residence_work_permit boolean, residence_confirmed_at timestamptz, residence_confirmed_by uuid references public.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.member_profiles enable row level security;
drop policy if exists member_profiles_select on public.member_profiles;
create policy member_profiles_select on public.member_profiles for select to authenticated
  using (org_id = public.auth_org_id() and (user_id = (select u.id from public.users u where u.auth_user_id = auth.uid())
         or (public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or exists (select 1 from public.memberships m where m.user_id = member_profiles.user_id and m.store_id = public.auth_store_id())))));
revoke all on table public.member_profiles from public, anon, authenticated;
grant select on table public.member_profiles to authenticated;
comment on table public.member_profiles is '★0176（399 の残り＝BANZEN 0194 の写し）: 本人の基本情報（users 単位・キャスト／スタッフ共通）。申告（*_draft）→店が確定（*_confirmed）。キャストの本名／生年月日の正は cast_sensitive（確定で写すのは P176）';

-- ═══ ★3 列・表（I-4） ═══
alter table public.attendance add column if not exists ack_at timestamptz;
alter table public.attendance add column if not exists ack_by uuid references public.users(id);
create table if not exists public.attendance_contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  cast_id    uuid not null references public.casts(id) on delete cascade,
  biz_date   date not null,
  kind       text not null check (kind in ('late','absent')),
  eta        text check (eta is null or eta ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'),
  reason     text check (reason is null or length(reason) <= 200),
  source     text not null check (source in ('self','store')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists attendance_contacts_cast_day_idx on public.attendance_contacts(cast_id, biz_date);
alter table public.attendance_contacts enable row level security;
drop policy if exists attendance_contacts_select on public.attendance_contacts;
create policy attendance_contacts_select on public.attendance_contacts for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()) and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id()));
revoke all on table public.attendance_contacts from public, anon, authenticated;
grant select on table public.attendance_contacts to authenticated;
comment on table public.attendance_contacts is '★0176（I-4）: 遅刻・当欠の連絡の履歴（同日に複数・attendance は最新の 1 行）';

-- ═══ ★4 表（400 の残り） ═══
create table if not exists public.contact_changes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  store_id     uuid references public.stores(id) on delete set null,
  user_id      uuid not null references public.users(id) on delete cascade,
  field        text not null check (field in ('contact_email','phone')),
  old_value    text,
  new_value    text,
  changed_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.users(id)
);
create index if not exists contact_changes_org_unconfirmed_idx on public.contact_changes(org_id, changed_at desc) where confirmed_at is null;
alter table public.contact_changes enable row level security;
drop policy if exists contact_changes_select on public.contact_changes;
create policy contact_changes_select on public.contact_changes for select to authenticated using (org_id = public.auth_org_id() and (user_id = (select u.id from public.users u where u.auth_user_id = auth.uid()) or (public.auth_role() in ('owner','manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()))));
revoke all on table public.contact_changes from public, anon, authenticated;
grant select on table public.contact_changes to authenticated;
comment on table public.contact_changes is '★0176（400 の残り）: 連絡先の変更履歴（本人が set_my_contact で変えた→店が確認済みに）';

-- ═══ ★5 列・表（SH-UI-b の 0176 行き） ═══
create table if not exists public.shift_period_needs (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs(id) on delete cascade,
  store_id  uuid not null references public.stores(id) on delete cascade,
  period_id uuid not null references public.shift_periods(id) on delete cascade,
  dow       smallint not null check (dow between 0 and 6),
  required  integer not null default 0 check (required between 0 and 99),
  created_at timestamptz not null default now(),
  constraint shift_period_needs_uq unique (period_id, dow)
);
alter table public.shift_period_needs enable row level security;
drop policy if exists shift_period_needs_select on public.shift_period_needs;
create policy shift_period_needs_select on public.shift_period_needs for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));
revoke all on table public.shift_period_needs from public, anon, authenticated;
grant select on table public.shift_period_needs to authenticated;
comment on table public.shift_period_needs is '★0176（SH-UI-b (a)）: 期間ごとの曜日別必要人数（無い曜日は staffing_needs）';
alter table public.shifts add column if not exists declined_at timestamptz;
alter table public.shifts add column if not exists decline_reason text;
alter table public.shifts drop constraint if exists shifts_decline_reason_len;
alter table public.shifts add constraint shifts_decline_reason_len check (decline_reason is null or length(decline_reason) <= 200);
create table if not exists public.cast_notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  cast_id    uuid not null references public.casts(id) on delete cascade,
  kind       text not null check (kind in ('shift_added','shift_removed','shift_changed','shift_proposed','availability_changed','other')),
  body       text not null check (length(body) between 1 and 500),
  ref        text,
  read_at    timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists cast_notifications_cast_idx on public.cast_notifications(cast_id, created_at desc);
alter table public.cast_notifications enable row level security;
drop policy if exists cast_notifications_select on public.cast_notifications;
create policy cast_notifications_select on public.cast_notifications for select to authenticated using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or store_id = public.auth_store_id()) and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id()));
revoke all on table public.cast_notifications from public, anon, authenticated;
grant select on table public.cast_notifications to authenticated;
comment on table public.cast_notifications is '★0176（SH-UI-b (d)・裁定413）: キャスト 1 人あての通知（確定シフトの追加／外し・差し戻し・基本の働き方の変更）';
alter table public.notices add column if not exists cast_ids uuid[];
comment on column public.notices.cast_ids is '★0176（SH-UI-b (e)）: 宛先のキャスト（null＝audience の全員）';

-- ═══ ★1 RPC（401） ═══
CREATE OR REPLACE FUNCTION public.set_store_line_config(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401・BZ-R）: LINE の公開してよい値＝stores.line_config の鍵 login_channel_id／liff_id／bot_destination（'U'＋32 桁の 16 進・任意）。
--   シークレット（channel_secret_ref／access_token_ref）はここでは書けない＝set_line_secret（service_role）だけ。owner／自店 manager・audit（値そのものは公開値＝記録してよい）
declare
  v_org uuid := public.auth_org_id();
  v_row record;
  v_k   text; v_v text;
  v_cfg jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  select s.id, s.org_id, s.line_config into v_row from public.stores s where s.id = p_store_id;
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  v_cfg := coalesce(v_row.line_config, '{}'::jsonb);
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('login_channel_id','liff_id','bot_destination') then raise exception 'bad key'; end if;
    if jsonb_typeof(p_patch->v_k) not in ('string','null') then raise exception 'bad type'; end if;
    v_v := nullif(trim(coalesce(p_patch->>v_k, '')), '');
    if v_v is not null and length(v_v) > 100 then raise exception 'bad value'; end if;
    if v_k = 'bot_destination' and v_v is not null and v_v !~ '^U[0-9a-f]{32}$' then raise exception 'bad bot_destination'; end if;
    v_cfg := case when v_v is null then v_cfg - v_k else jsonb_set(v_cfg, array[v_k], to_jsonb(v_v), true) end;
  end loop;
  update public.stores set line_config = v_cfg, updated_at = now() where id = p_store_id;
  perform public.audit_log_write('set_store_line_config', 'stores:' || p_store_id::text,
    v_row.line_config - 'channel_secret_ref' - 'access_token_ref', v_cfg - 'channel_secret_ref' - 'access_token_ref', p_store_id);
end $function$;
revoke execute on function public.set_store_line_config(uuid, jsonb) from public, anon;
grant execute on function public.set_store_line_config(uuid, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.set_line_secret(p_store_id uuid, p_kind text, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LINE のシークレット＝Supabase Vault（名前 nox_line_<kind>_<storeId>・冪等＝BANZEN 0015 と同じ）。kind＝channel_secret／access_token。
--   service_role だけ（route /api/stores/line-config が owner／manager を検査してから admin client で呼ぶ）。ref（vault.secrets.id）を stores.line_config に写す。値は audit に書かない
declare
  v_name text;
  v_ref  uuid;
  v_key  text;
begin
  if p_kind is null or p_kind not in ('channel_secret','access_token') then raise exception 'bad kind'; end if;
  if p_secret is null or length(trim(p_secret)) = 0 or length(p_secret) > 1000 then raise exception 'bad secret'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id) then raise exception 'not found'; end if;
  v_name := 'nox_line_' || p_kind || '_' || p_store_id::text;
  v_key  := p_kind || '_ref';
  select nullif(s.line_config->>v_key, '')::uuid into v_ref from public.stores s where s.id = p_store_id;
  if v_ref is not null and not exists (select 1 from vault.secrets v where v.id = v_ref) then v_ref := null; end if;
  if v_ref is null then
    select v.id into v_ref from vault.secrets v where v.name = v_name;
    if v_ref is null then
      v_ref := vault.create_secret(p_secret, v_name, 'NOX LINE secret');
    else
      perform vault.update_secret(v_ref, p_secret);
    end if;
  else
    perform vault.update_secret(v_ref, p_secret);
  end if;
  update public.stores set line_config = jsonb_set(coalesce(line_config, '{}'::jsonb), array[v_key], to_jsonb(v_ref::text), true), updated_at = now() where id = p_store_id;
  perform public.audit_log_write_service((select org_id from public.stores where id = p_store_id), p_store_id, 'set_line_secret', 'stores:' || p_store_id::text,
    null, jsonb_build_object('kind', p_kind, 'ref', v_ref), null);
end $function$;
revoke execute on function public.set_line_secret(uuid, text, text) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke
grant execute on function public.set_line_secret(uuid, text, text) to service_role;   -- route（admin client）からだけ呼ぶ
CREATE OR REPLACE FUNCTION public.get_line_secret(p_store_id uuid, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: Vault からシークレットを読む（service_role だけ＝route の push／webhook／verify-id-token）
declare
  v_ref uuid; v_secret text;
begin
  if p_kind is null or p_kind not in ('channel_secret','access_token') then raise exception 'bad kind'; end if;
  select nullif(s.line_config->>(p_kind || '_ref'), '')::uuid into v_ref from public.stores s where s.id = p_store_id;
  if v_ref is null then return null; end if;
  select d.decrypted_secret into v_secret from vault.decrypted_secrets d where d.id = v_ref;
  return v_secret;
end $function$;
revoke execute on function public.get_line_secret(uuid, text) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke
grant execute on function public.get_line_secret(uuid, text) to service_role;   -- route（admin client）からだけ呼ぶ
CREATE OR REPLACE FUNCTION public.line_bind_token_create(p_subject_kind text, p_subject_id uuid, p_purpose text DEFAULT 'bind'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LINE 紐付けの招待トークン＝owner／自店 manager が cast（casts.id）／membership（memberships.id）に発行。戻り＝平文トークン（1 回だけ・DB は sha256 の hex）。有効 7 日
declare
  v_org uuid := public.auth_org_id();
  v_store uuid; v_token text; v_actor uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_subject_kind is null or p_subject_kind not in ('cast','membership') then raise exception 'bad subject'; end if;
  if p_purpose is null or p_purpose not in ('onboard','bind') then raise exception 'bad purpose'; end if;
  if p_subject_kind = 'cast' then
    select c.store_id into v_store from public.casts c where c.id = p_subject_id and c.org_id = v_org and c.is_active;
  else
    select m.store_id into v_store from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_subject_id and s.org_id = v_org and m.is_active;
  end if;
  if v_store is null then raise exception 'not found'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.line_bind_tokens (org_id, store_id, subject_kind, subject_id, purpose, token_hash, expires_at, created_by)
  values (v_org, v_store, p_subject_kind, p_subject_id, p_purpose, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '7 days', v_actor);
  perform public.audit_log_write('line_bind_token_create', p_subject_kind || 's:' || p_subject_id::text, null, jsonb_build_object('purpose', p_purpose, 'expires_days', 7), v_store);
  return v_token;
end $function$;
revoke execute on function public.line_bind_token_create(text, uuid, text) from public, anon;
grant execute on function public.line_bind_token_create(text, uuid, text) to authenticated;
CREATE OR REPLACE FUNCTION public.bind_line(p_token_hash text, p_line_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LIFF からの紐付け＝未使用・期限内のトークン → 同じ LINE が org に既にあれば 'line already linked' → line_links 1 行 → トークンを使用済みに（1 回で行う・BANZEN 0012 と同じ）。
--   service_role だけ（route /api/line/bind が id_token を確かめてから呼ぶ）。戻り＝subject と store（route がセッションを作る材料）
declare
  v_t record;
begin
  if p_token_hash is null or p_line_user_id is null or p_line_user_id !~ '^U[0-9a-f]{32}$' then raise exception 'bad input'; end if;
  select * into v_t from public.line_bind_tokens where token_hash = p_token_hash for update;
  if v_t.id is null or v_t.used_at is not null or v_t.expires_at < now() then raise exception 'bad token'; end if;
  if exists (select 1 from public.line_links l where l.org_id = v_t.org_id and l.line_user_id = p_line_user_id and not (l.subject_kind = v_t.subject_kind and l.subject_id = v_t.subject_id)) then
    raise exception 'line already linked';
  end if;
  insert into public.line_links (org_id, store_id, subject_kind, subject_id, line_user_id)
  values (v_t.org_id, v_t.store_id, v_t.subject_kind, v_t.subject_id, p_line_user_id)
  on conflict (subject_kind, subject_id) do update set line_user_id = excluded.line_user_id, store_id = excluded.store_id, updated_at = now();
  update public.line_bind_tokens set used_at = now() where id = v_t.id;
  perform public.audit_log_write_service(v_t.org_id, v_t.store_id, 'bind_line', v_t.subject_kind || 's:' || v_t.subject_id::text, null, jsonb_build_object('purpose', v_t.purpose), null);
  return jsonb_build_object('subject_kind', v_t.subject_kind, 'subject_id', v_t.subject_id, 'store_id', v_t.store_id, 'org_id', v_t.org_id, 'purpose', v_t.purpose);
end $function$;
revoke execute on function public.bind_line(text, text) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke
grant execute on function public.bind_line(text, text) to service_role;   -- route（admin client）からだけ呼ぶ
CREATE OR REPLACE FUNCTION public.set_store_line_limit(p_store_id uuid, p_limit integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: 月の送信上限（表示のための設定＝アプリは送るのを止めない・BANZEN 0181 と同じ）。owner／自店 manager・1〜1,000,000・audit
declare
  v_org uuid := public.auth_org_id();
  v_row record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000000 then raise exception 'bad limit'; end if;
  select s.id, s.org_id, s.line_monthly_limit into v_row from public.stores s where s.id = p_store_id;
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  update public.stores set line_monthly_limit = p_limit, updated_at = now() where id = p_store_id;
  perform public.audit_log_write('set_store_line_limit', 'stores:' || p_store_id::text,
    jsonb_build_object('line_monthly_limit', v_row.line_monthly_limit), jsonb_build_object('line_monthly_limit', p_limit), p_store_id);
end $function$;
revoke execute on function public.set_store_line_limit(uuid, integer) from public, anon;
grant execute on function public.set_store_line_limit(uuid, integer) to authenticated;
CREATE OR REPLACE FUNCTION public.line_push_log_write(p_store_id uuid, p_kind text, p_recipient_count integer, p_status text, p_http_status integer, p_line_request_id text, p_error_detail text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: 送信台帳 1 行（service_role＝lib/nox/line/push の pushAndLog）。宛先の userId・token は入れない（error_detail にも）。デモ org（orgs.is_demo）は送らない＝route 側で止める
declare
  v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  if p_kind is null or p_kind not in ('shift_published','shift_changed','punch_unclosed','notice') then raise exception 'bad kind'; end if;
  if p_status is null or p_status not in ('sent','failed') then raise exception 'bad status'; end if;
  insert into public.line_push_log (org_id, store_id, kind, recipient_count, status, http_status, line_request_id, error_detail)
  values (v_org, p_store_id, p_kind, coalesce(p_recipient_count, 1), p_status, p_http_status, left(p_line_request_id, 100), left(p_error_detail, 500))
  returning id into v_id;
  return v_id;
end $function$;
revoke execute on function public.line_push_log_write(uuid, text, integer, text, integer, text, text) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke
grant execute on function public.line_push_log_write(uuid, text, integer, text, integer, text, text) to service_role;   -- route（admin client）からだけ呼ぶ
CREATE OR REPLACE FUNCTION public.line_push_month_summary(p_month date)
 RETURNS TABLE(store_id uuid, sent integer, rejected_429 integer, monthly_limit integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: 月の送信数＝JST の暦月（1 日 00:00〜翌月 1 日 00:00）・sent の recipient_count 合計・429 の回数は別に数える。owner＝全店／manager＝自店 1 行
declare
  v_org uuid := public.auth_org_id();
  v_from timestamptz; v_to timestamptz;
begin
  if v_org is null or public.auth_role() not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_month is null then raise exception 'bad month'; end if;
  v_from := (date_trunc('month', p_month)::date)::timestamp at time zone 'Asia/Tokyo';
  v_to   := ((date_trunc('month', p_month) + interval '1 month')::date)::timestamp at time zone 'Asia/Tokyo';
  return query
    select s.id,
           coalesce((select sum(l.recipient_count) from public.line_push_log l where l.store_id = s.id and l.status = 'sent' and l.sent_at >= v_from and l.sent_at < v_to), 0)::int,
           coalesce((select count(*) from public.line_push_log l where l.store_id = s.id and l.http_status = 429 and l.sent_at >= v_from and l.sent_at < v_to), 0)::int,
           s.line_monthly_limit
      from public.stores s
     where s.org_id = v_org and (public.auth_role() = 'owner' or s.id = public.auth_store_id())
     order by s.name;
end $function$;
revoke execute on function public.line_push_month_summary(date) from public, anon;
grant execute on function public.line_push_month_summary(date) to authenticated;

-- ═══ ★2 RPC（399 の残り） ═══
CREATE OR REPLACE FUNCTION public.staff_contract_set(p_membership_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176（裁定356／399・v50）: スタッフ契約の書込＝staff_contracts（無ければ作る）＋memberships の入社日／退職日。鍵＝contract_kind（employee／parttime／contractor）・pay_kind（雇用＝hourly／monthly・委託＝daily／monthly_fixed）・
--   hourly／monthly／daily／fixed_allowance（円・0 以上）・tax_class（甲／乙・null）・withholding_rate（0〜100・委託の既定 10.21）・invoice／reg_no・valid_from・min_month_h／max_month_h・max_consec・hire_date／leave_date。
--   owner＝org 全店／manager＝自店の staff（role 'staff'）のみ＝店長自身と他の店長の報酬は owner のみ（356）。鍵が無い項目は変えない・audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_m record; v_c record;
  v_k text;
  v_kind text; v_pk text;
  v_before jsonb; v_after jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  select m.id, m.store_id, m.role, m.hire_date, m.leave_date, s.org_id into v_m from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_m.id is null or v_m.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_m.role not in ('manager','staff') then raise exception 'not staff'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_m.store_id = public.auth_store_id() and v_m.role = 'staff')) then raise exception 'forbidden'; end if;
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('contract_kind','pay_kind','hourly','monthly','daily','fixed_allowance','tax_class','withholding_rate','invoice','reg_no','valid_from','min_month_h','max_month_h','max_consec','hire_date','leave_date') then raise exception 'bad key'; end if;
  end loop;
  insert into public.staff_contracts (membership_id, org_id, store_id) values (p_membership_id, v_org, v_m.store_id) on conflict (membership_id) do nothing;
  select * into v_c from public.staff_contracts where membership_id = p_membership_id;
  v_before := to_jsonb(v_c) || jsonb_build_object('hire_date', v_m.hire_date, 'leave_date', v_m.leave_date);
  v_kind := coalesce(p_patch->>'contract_kind', v_c.contract_kind);
  v_pk   := coalesce(p_patch->>'pay_kind', v_c.pay_kind);
  if v_kind not in ('employee','parttime','contractor') then raise exception 'bad contract_kind'; end if;
  if v_pk not in ('hourly','monthly','daily','monthly_fixed') then raise exception 'bad pay_kind'; end if;
  if (v_kind = 'contractor') <> (v_pk in ('daily','monthly_fixed')) then raise exception 'bad pay_kind for contract'; end if;
  if p_patch ? 'hourly' and (jsonb_typeof(p_patch->'hourly') <> 'number' or (p_patch->>'hourly')::numeric < 0 or (p_patch->>'hourly')::numeric <> floor((p_patch->>'hourly')::numeric)) then raise exception 'bad hourly'; end if;
  if p_patch ? 'monthly' and jsonb_typeof(p_patch->'monthly') not in ('number','null') then raise exception 'bad monthly'; end if;
  if p_patch ? 'daily' and jsonb_typeof(p_patch->'daily') not in ('number','null') then raise exception 'bad daily'; end if;
  if p_patch ? 'fixed_allowance' and (jsonb_typeof(p_patch->'fixed_allowance') <> 'number' or (p_patch->>'fixed_allowance')::numeric < 0) then raise exception 'bad fixed_allowance'; end if;
  if p_patch ? 'tax_class' and p_patch->>'tax_class' is not null and p_patch->>'tax_class' not in ('甲','乙') then raise exception 'bad tax_class'; end if;
  if p_patch ? 'withholding_rate' and (jsonb_typeof(p_patch->'withholding_rate') <> 'number' or (p_patch->>'withholding_rate')::numeric < 0 or (p_patch->>'withholding_rate')::numeric > 100) then raise exception 'bad withholding_rate'; end if;
  if p_patch ? 'max_consec' and p_patch->>'max_consec' is not null and ((p_patch->>'max_consec')::numeric < 0 or (p_patch->>'max_consec')::numeric <> floor((p_patch->>'max_consec')::numeric)) then raise exception 'bad max_consec'; end if;
  update public.staff_contracts set
    contract_kind    = v_kind,
    pay_kind         = v_pk,
    hourly           = case when p_patch ? 'hourly'           then (p_patch->>'hourly')::int else hourly end,
    monthly          = case when p_patch ? 'monthly'          then nullif(p_patch->>'monthly', '')::int else monthly end,
    daily            = case when p_patch ? 'daily'            then nullif(p_patch->>'daily', '')::int else daily end,
    fixed_allowance  = case when p_patch ? 'fixed_allowance'  then (p_patch->>'fixed_allowance')::int else fixed_allowance end,
    tax_class        = case when p_patch ? 'tax_class'        then nullif(p_patch->>'tax_class', '') else tax_class end,
    withholding_rate = case when p_patch ? 'withholding_rate' then (p_patch->>'withholding_rate')::numeric else withholding_rate end,
    invoice          = case when p_patch ? 'invoice'          then left(nullif(trim(coalesce(p_patch->>'invoice', '')), ''), 40) else invoice end,
    reg_no           = case when p_patch ? 'reg_no'           then left(nullif(trim(coalesce(p_patch->>'reg_no', '')), ''), 20) else reg_no end,
    valid_from       = case when p_patch ? 'valid_from'       then nullif(p_patch->>'valid_from', '')::date else valid_from end,
    min_month_h      = case when p_patch ? 'min_month_h'      then nullif(p_patch->>'min_month_h', '')::numeric else min_month_h end,
    max_month_h      = case when p_patch ? 'max_month_h'      then nullif(p_patch->>'max_month_h', '')::numeric else max_month_h end,
    max_consec       = case when p_patch ? 'max_consec'       then nullif(p_patch->>'max_consec', '')::int else max_consec end,
    updated_at = now()
  where membership_id = p_membership_id;
  if p_patch ? 'hire_date' or p_patch ? 'leave_date' then
    update public.memberships set
      hire_date  = case when p_patch ? 'hire_date'  then nullif(p_patch->>'hire_date', '')::date  else hire_date end,
      leave_date = case when p_patch ? 'leave_date' then nullif(p_patch->>'leave_date', '')::date else leave_date end,
      updated_at = now()
    where id = p_membership_id;
  end if;
  select to_jsonb(c) || (select jsonb_build_object('hire_date', m.hire_date, 'leave_date', m.leave_date) from public.memberships m where m.id = p_membership_id) into v_after
    from public.staff_contracts c where c.membership_id = p_membership_id;
  perform public.audit_log_write('staff_contract_set', 'memberships:' || p_membership_id::text, v_before, v_after, v_m.store_id);
end $function$;
revoke execute on function public.staff_contract_set(uuid, jsonb) from public, anon;
grant execute on function public.staff_contract_set(uuid, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.staff_invite_create(p_store_id uuid, p_email text, p_name text, p_role text, p_contract jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176（I-1 登録→招待の 2 段）: スタッフの「登録」＝Auth を作らず staff_invites に 1 行（名前・役割・契約の下書き）→ 招待メールのリンクで本人が受諾（staff_invite_accept）。
--   owner／自店 manager（manager は role 'staff' だけ）・email は org 内で未使用（users・未受諾の招待）・戻り＝id と平文トークン（1 回だけ・DB は sha256）・有効 14 日・audit。デモ org では呼ばない（UI が出さない・裁定 X13-I ⑦）
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_email text; v_name text; v_token text; v_id uuid; v_actor uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if p_role is null or p_role not in ('manager','staff') then raise exception 'bad role'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id() and p_role = 'staff')) then raise exception 'forbidden'; end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'bad email'; end if;
  v_name := trim(coalesce(p_name, ''));
  if v_name = '' or length(v_name) > 50 then raise exception 'bad name'; end if;
  if p_contract is null or jsonb_typeof(p_contract) <> 'object' then raise exception 'bad contract'; end if;
  if exists (select 1 from public.users u where u.org_id = v_org and lower(u.email) = v_email and u.is_active) then raise exception 'email in use'; end if;
  if exists (select 1 from public.staff_invites i where i.org_id = v_org and i.email = v_email and i.accepted_at is null and i.expires_at > now()) then raise exception 'invite exists'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.staff_invites (org_id, store_id, email, name, role, contract, token_hash, expires_at, created_by)
  values (v_org, p_store_id, v_email, v_name, p_role, p_contract, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '14 days', v_actor)
  returning id into v_id;
  perform public.audit_log_write('staff_invite_create', 'staff_invites:' || v_id::text, null, jsonb_build_object('email', v_email, 'name', v_name, 'role', p_role, 'contract', p_contract), p_store_id);
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', now() + interval '14 days');
end $function$;
revoke execute on function public.staff_invite_create(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.staff_invite_create(uuid, text, text, text, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.staff_invite_accept(p_token_hash text, p_auth_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176（I-1）: 招待の受諾＝route（service_role）が Auth ユーザーを作ってから呼ぶ。users＋memberships（＋契約の下書きがあれば staff_contracts）を 1 回で作り、招待を使用済みに。戻り＝memberships.id
declare
  v_i record; v_user uuid; v_mem uuid; v_c jsonb;
begin
  if p_token_hash is null or p_auth_user_id is null then raise exception 'bad input'; end if;
  select * into v_i from public.staff_invites where token_hash = p_token_hash for update;
  if v_i.id is null or v_i.accepted_at is not null or v_i.expires_at < now() then raise exception 'bad token'; end if;
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then raise exception 'user exists'; end if;
  insert into public.users (org_id, auth_user_id, email, name) values (v_i.org_id, p_auth_user_id, v_i.email, v_i.name) returning id into v_user;
  insert into public.memberships (user_id, store_id, role) values (v_user, v_i.store_id, v_i.role) returning id into v_mem;
  v_c := coalesce(v_i.contract, '{}'::jsonb);
  insert into public.staff_contracts (membership_id, org_id, store_id, contract_kind, pay_kind, hourly, monthly, daily, fixed_allowance, tax_class, withholding_rate, valid_from)
  values (v_mem, v_i.org_id, v_i.store_id,
          coalesce(v_c->>'contract_kind', 'parttime'), coalesce(v_c->>'pay_kind', 'hourly'),
          coalesce((v_c->>'hourly')::int, 0), nullif(v_c->>'monthly', '')::int, nullif(v_c->>'daily', '')::int, coalesce((v_c->>'fixed_allowance')::int, 0),
          nullif(v_c->>'tax_class', ''), coalesce((v_c->>'withholding_rate')::numeric, case when v_c->>'contract_kind' = 'contractor' then 10.21 else 0 end), nullif(v_c->>'valid_from', '')::date);
  update public.staff_invites set accepted_at = now(), accepted_user_id = v_user where id = v_i.id;
  perform public.audit_log_write_service(v_i.org_id, v_i.store_id, 'staff_invite_accept', 'memberships:' || v_mem::text, null, jsonb_build_object('invite_id', v_i.id, 'role', v_i.role), null);
  return v_mem;
end $function$;
revoke execute on function public.staff_invite_accept(text, uuid) from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke
grant execute on function public.staff_invite_accept(text, uuid) to service_role;   -- route（admin client）からだけ呼ぶ
CREATE OR REPLACE FUNCTION public.member_profile_self_save(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176（399 の残り・BANZEN 0194 の写し）: 本人の基本情報＝users 単位（キャスト・スタッフ共通）。本人が直す＝kana／address／emergency_name／emergency_relation／emergency_phone／commute_kind／commute_yen／nearest_station／student_kind。
--   本人が申告し店が確定する＝legal_name_draft／birth_date_draft／residence_expiry_draft／residence_permit_draft（確定値は member_profiles の *_confirmed 列・キャストの本名／生年月日は cast_sensitive が正＝確定で写すのは P176）。鍵が無い項目は変えない・空文字は null。デモ org は forbidden
declare
  v_org uuid := public.auth_org_id();
  v_me uuid; v_demo boolean; v_k text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then raise exception 'bad patch'; end if;
  select is_demo into v_demo from public.orgs where id = v_org;
  if coalesce(v_demo, false) then raise exception 'forbidden'; end if;
  select id into v_me from public.users where auth_user_id = auth.uid() and org_id = v_org and is_active;
  if v_me is null then raise exception 'forbidden'; end if;
  for v_k in select jsonb_object_keys(p) loop
    if v_k not in ('kana','address','emergency_name','emergency_relation','emergency_phone','commute_kind','commute_yen','nearest_station','student_kind','legal_name_draft','birth_date_draft','residence_expiry_draft','residence_permit_draft') then raise exception 'bad key'; end if;
  end loop;
  if p ? 'emergency_phone' and nullif(trim(coalesce(p->>'emergency_phone', '')), '') is not null and (p->>'emergency_phone') !~ '^[0-9+\-() ]{6,20}$' then raise exception 'bad emergency_phone'; end if;
  if p ? 'commute_kind' and nullif(p->>'commute_kind', '') is not null and p->>'commute_kind' not in ('daily','pass') then raise exception 'bad commute_kind'; end if;
  if p ? 'commute_yen' and nullif(p->>'commute_yen', '') is not null and ((p->>'commute_yen')::numeric < 0 or (p->>'commute_yen')::numeric > 1000000) then raise exception 'bad commute_yen'; end if;
  if p ? 'student_kind' and p->>'student_kind' not in ('none','student','high_school') then raise exception 'bad student_kind'; end if;
  insert into public.member_profiles (user_id, org_id) values (v_me, v_org) on conflict (user_id) do nothing;
  update public.member_profiles set
    kana                   = case when p ? 'kana'                   then left(nullif(trim(coalesce(p->>'kana', '')), ''), 60) else kana end,
    address                = case when p ? 'address'                then left(nullif(trim(coalesce(p->>'address', '')), ''), 200) else address end,
    emergency_name         = case when p ? 'emergency_name'         then left(nullif(trim(coalesce(p->>'emergency_name', '')), ''), 60) else emergency_name end,
    emergency_relation     = case when p ? 'emergency_relation'     then left(nullif(trim(coalesce(p->>'emergency_relation', '')), ''), 20) else emergency_relation end,
    emergency_phone        = case when p ? 'emergency_phone'        then nullif(trim(coalesce(p->>'emergency_phone', '')), '') else emergency_phone end,
    commute_kind           = case when p ? 'commute_kind'           then nullif(p->>'commute_kind', '') else commute_kind end,
    commute_yen            = case when p ? 'commute_yen'            then nullif(p->>'commute_yen', '')::int else commute_yen end,
    nearest_station        = case when p ? 'nearest_station'        then left(nullif(trim(coalesce(p->>'nearest_station', '')), ''), 40) else nearest_station end,
    student_kind           = case when p ? 'student_kind'           then p->>'student_kind' else student_kind end,
    legal_name_draft       = case when p ? 'legal_name_draft'       then left(nullif(trim(coalesce(p->>'legal_name_draft', '')), ''), 60) else legal_name_draft end,
    birth_date_draft       = case when p ? 'birth_date_draft'       then nullif(p->>'birth_date_draft', '')::date else birth_date_draft end,
    residence_expiry_draft = case when p ? 'residence_expiry_draft' then nullif(p->>'residence_expiry_draft', '')::date else residence_expiry_draft end,
    residence_permit_draft = case when p ? 'residence_permit_draft' then (case when jsonb_typeof(p->'residence_permit_draft') = 'boolean' then (p->>'residence_permit_draft')::boolean end) else residence_permit_draft end,
    updated_at = now()
  where user_id = v_me;
  perform public.audit_log_write('member_profile_self_save', 'users:' || v_me::text, null, jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p) k)), public.auth_store_id());
end $function$;
revoke execute on function public.member_profile_self_save(jsonb) from public, anon;
grant execute on function public.member_profile_self_save(jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.member_profile_store_save(p_user_id uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176: 店だけが直す＝hire_date／leave_date（memberships）と確定値の訂正は member_profile_confirm。owner／自店 manager（対象の membership の店）・audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_store uuid; v_k text;
begin
  if v_org is null or v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then raise exception 'bad patch'; end if;
  select m.store_id into v_store from public.memberships m join public.users u on u.id = m.user_id where u.id = p_user_id and u.org_id = v_org and m.is_active order by m.created_at limit 1;
  if v_store is null then raise exception 'not found'; end if;
  if v_role = 'manager' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  for v_k in select jsonb_object_keys(p) loop
    if v_k not in ('hire_date','leave_date') then raise exception 'bad key'; end if;
  end loop;
  update public.memberships set
    hire_date  = case when p ? 'hire_date'  then nullif(p->>'hire_date', '')::date  else hire_date end,
    leave_date = case when p ? 'leave_date' then nullif(p->>'leave_date', '')::date else leave_date end,
    updated_at = now()
  where user_id = p_user_id and store_id = v_store;
  perform public.audit_log_write('member_profile_store_save', 'users:' || p_user_id::text, null, p, v_store);
end $function$;
revoke execute on function public.member_profile_store_save(uuid, jsonb) from public, anon;
grant execute on function public.member_profile_store_save(uuid, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.member_profile_confirm(p_user_id uuid, p_what text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176（BANZEN 0194 の写し＋裁定573）: 申告を確定値へ写し、申告を空にする（legal_name／birth_date／residence）。manager は自分の行を確定できない（owner はできる）。audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_me uuid; v_store uuid; v_p record;
begin
  if v_org is null or v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_what is null or p_what not in ('legal_name','birth_date','residence') then raise exception 'bad what'; end if;
  select id into v_me from public.users where auth_user_id = auth.uid() and is_active;
  if v_role = 'manager' and v_me = p_user_id then raise exception 'forbidden'; end if;
  select m.store_id into v_store from public.memberships m join public.users u on u.id = m.user_id where u.id = p_user_id and u.org_id = v_org and m.is_active order by m.created_at limit 1;
  if v_store is null then raise exception 'not found'; end if;
  if v_role = 'manager' and v_store <> public.auth_store_id() then raise exception 'forbidden'; end if;
  select * into v_p from public.member_profiles where user_id = p_user_id for update;
  if v_p.user_id is null then raise exception 'not found'; end if;
  if p_what = 'legal_name' then
    if v_p.legal_name_draft is null then raise exception 'nothing to confirm'; end if;
    update public.member_profiles set legal_name = legal_name_draft, legal_name_draft = null, legal_name_confirmed_at = now(), legal_name_confirmed_by = v_me, updated_at = now() where user_id = p_user_id;
  elsif p_what = 'birth_date' then
    if v_p.birth_date_draft is null then raise exception 'nothing to confirm'; end if;
    update public.member_profiles set birth_date = birth_date_draft, birth_date_draft = null, birth_date_confirmed_at = now(), birth_date_confirmed_by = v_me, updated_at = now() where user_id = p_user_id;
  else
    if v_p.residence_expiry_draft is null and v_p.residence_permit_draft is null then raise exception 'nothing to confirm'; end if;
    update public.member_profiles set residence_expiry = coalesce(residence_expiry_draft, residence_expiry), residence_work_permit = coalesce(residence_permit_draft, residence_work_permit),
           residence_expiry_draft = null, residence_permit_draft = null, residence_confirmed_at = now(), residence_confirmed_by = v_me, updated_at = now() where user_id = p_user_id;
  end if;
  perform public.audit_log_write('member_profile_confirm', 'users:' || p_user_id::text, null, jsonb_build_object('what', p_what), v_store);
end $function$;
revoke execute on function public.member_profile_confirm(uuid, text) from public, anon;
grant execute on function public.member_profile_confirm(uuid, text) to authenticated;

-- ═══ ★3 RPC（I-4） ═══
CREATE OR REPLACE FUNCTION public.attendance_contact_log(p_cast_id uuid, p_biz_date date, p_kind text, p_eta text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★3 0176（X13-I I-4）: 遅刻・当欠の連絡の履歴＝同日の複数連絡を 1 行ずつ残す（attendance は 1 行 upsert のまま＝最新の見込み・理由）。本人（cast）か店（owner／自店 manager／staff）。source は自動
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_cast record; v_src text; v_id uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('late','absent') then raise exception 'bad kind'; end if;
  if p_eta is not null and p_eta !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad eta'; end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id, org_id, store_id into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_role = 'cast' then
    if public.auth_cast_id() is distinct from p_cast_id then raise exception 'forbidden'; end if;
    v_src := 'self';
  else
    if not (v_role = 'owner' or v_cast.store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
    v_src := 'store';
  end if;
  insert into public.attendance_contacts (org_id, store_id, cast_id, biz_date, kind, eta, reason, source, created_by)
  values (v_org, v_cast.store_id, p_cast_id, p_biz_date, p_kind, p_eta, nullif(trim(coalesce(p_reason, '')), ''), v_src, (select id from public.users where auth_user_id = auth.uid() and is_active))
  returning id into v_id;
  perform public.audit_log_write('attendance_contact_log', 'attendance_contacts:' || v_id::text, null,
    jsonb_build_object('cast_id', p_cast_id, 'biz_date', p_biz_date, 'kind', p_kind, 'eta', p_eta, 'source', v_src), v_cast.store_id);
  return v_id;
end $function$;
revoke execute on function public.attendance_contact_log(uuid, date, text, text, text) from public, anon;
grant execute on function public.attendance_contact_log(uuid, date, text, text, text) to authenticated;
CREATE OR REPLACE FUNCTION public.attendance_ack(p_attendance_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★3 0176（I-4）: 遅刻・当欠の連絡を店が「確認済み」に（attendance.ack_at／ack_by）。owner／自店 manager／staff。二重は no-op。audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_a record; v_actor uuid;
begin
  if v_org is null or v_role is null or v_role not in ('owner','manager','staff') then raise exception 'forbidden'; end if;
  select * into v_a from public.attendance where id = p_attendance_id and org_id = v_org;
  if v_a.id is null then raise exception 'not found'; end if;
  if v_role <> 'owner' and v_a.store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;
  if v_a.ack_at is not null then return; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.attendance set ack_at = now(), ack_by = v_actor, updated_at = now() where id = p_attendance_id;
  perform public.audit_log_write('attendance_ack', 'attendance:' || p_attendance_id::text, null, jsonb_build_object('cast_id', v_a.cast_id, 'date', v_a.date, 'status', v_a.status), v_a.store_id);
end $function$;
revoke execute on function public.attendance_ack(uuid) from public, anon;
grant execute on function public.attendance_ack(uuid) to authenticated;

-- ═══ ★4 RPC（400 の残り・set_my_contact は 0175 の署名のまま＝create or replace で ACL を保つ） ═══
CREATE OR REPLACE FUNCTION public.set_my_contact(p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★10 0175（400＝BZ-R）: 本人の連絡先（連絡用メール・電話）＝users の列。ログインのメール（users.email／auth）は変えない（BANZEN 流儀）。
--   鍵が無い項目は変えない・空文字は null・email は小文字＋形式・phone は ^[0-9+\-() ]{6,20}$・デモ org（orgs.is_demo）は 'forbidden'・audit。
--   ★4 0176（400 の残り）: 変更ごとに contact_changes に 1 行（店が確認＝contact_change_confirm）。0175 の本文に ★4 の insert を足した（grant は 0175 のまま＝create or replace）
declare
  v_org  uuid := public.auth_org_id();
  v_me   record;
  v_demo boolean;
  v_k    text;
  v_email text; v_phone text;
  v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb;
  v_store uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('contact_email','phone') then raise exception 'bad key'; end if;
    if jsonb_typeof(p_patch->v_k) not in ('string','null') then raise exception 'bad type'; end if;
  end loop;
  select is_demo into v_demo from public.orgs where id = v_org;
  if coalesce(v_demo, false) then raise exception 'forbidden'; end if;
  select * into v_me from public.users u where u.auth_user_id = auth.uid() and u.org_id = v_org and u.is_active;
  if v_me.id is null then raise exception 'forbidden'; end if;
  if p_patch ? 'contact_email' then
    v_email := nullif(lower(trim(coalesce(p_patch->>'contact_email', ''))), '');
    if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'bad email'; end if;
    v_before := v_before || jsonb_build_object('contact_email', v_me.contact_email);
    v_after  := v_after  || jsonb_build_object('contact_email', v_email);
  end if;
  if p_patch ? 'phone' then
    v_phone := nullif(trim(coalesce(p_patch->>'phone', '')), '');
    if v_phone is not null and v_phone !~ '^[0-9+\-() ]{6,20}$' then raise exception 'bad phone'; end if;
    v_before := v_before || jsonb_build_object('phone', v_me.phone);
    v_after  := v_after  || jsonb_build_object('phone', v_phone);
  end if;
  if v_after = v_before then return; end if;
  update public.users
     set contact_email = case when p_patch ? 'contact_email' then v_email else contact_email end,
         phone         = case when p_patch ? 'phone'         then v_phone else phone end,
         updated_at = now()
   where id = v_me.id;
  v_store := public.auth_store_id();
  -- ★4 0176: 変更の履歴（店が /casts・/staff の一覧で読み、確認済みにする）
  insert into public.contact_changes (org_id, store_id, user_id, field, old_value, new_value)
  select v_org, v_store, v_me.id, k.key, v_before->>k.key, v_after->>k.key
    from jsonb_each(v_after) k where v_after->>k.key is distinct from v_before->>k.key;
  perform public.audit_log_write('set_my_contact', 'users:' || v_me.id::text, v_before, v_after, v_store);
end $function$;
CREATE OR REPLACE FUNCTION public.contact_change_confirm(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★4 0176（400 の残り）: 連絡先の変更を店が確認済みに。owner／自店 manager。二重は no-op。audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_r record; v_actor uuid;
begin
  if v_org is null or v_role is null or v_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  select * into v_r from public.contact_changes where id = p_id and org_id = v_org;
  if v_r.id is null then raise exception 'not found'; end if;
  if v_role = 'manager' and v_r.store_id is distinct from public.auth_store_id() then raise exception 'forbidden'; end if;
  if v_r.confirmed_at is not null then return; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.contact_changes set confirmed_at = now(), confirmed_by = v_actor where id = p_id;
  perform public.audit_log_write('contact_change_confirm', 'contact_changes:' || p_id::text, null, jsonb_build_object('user_id', v_r.user_id, 'field', v_r.field), v_r.store_id);
end $function$;
revoke execute on function public.contact_change_confirm(uuid) from public, anon;
grant execute on function public.contact_change_confirm(uuid) to authenticated;

-- ═══ ★5 RPC（SH-UI-b の 0176 行き） ═══
CREATE OR REPLACE FUNCTION public.shift_period_needs_set(p_period_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (a)）: 期間ごとの必要人数＝shift_period_needs（period × dow・無い曜日は店の staffing_needs に従う）。全置換。owner／自店 manager・audit。計算側（dayStat）の読み替えは P176
declare
  v_org uuid := public.auth_org_id();
  v_p record; v_e jsonb; v_dow int; v_req int;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad rows'; end if;
  select * into v_p from public.shift_periods where id = p_period_id and org_id = v_org;
  if v_p.id is null then raise exception 'not found'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_p.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  for v_e in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_e->'dow') <> 'number' or jsonb_typeof(v_e->'required') <> 'number' then raise exception 'bad rows'; end if;
    v_dow := (v_e->>'dow')::int; v_req := (v_e->>'required')::int;
    if v_dow < 0 or v_dow > 6 or v_req < 0 or v_req > 99 then raise exception 'bad rows'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_rows) e) <> (select count(distinct (e->>'dow')) from jsonb_array_elements(p_rows) e) then raise exception 'dup dow'; end if;
  delete from public.shift_period_needs where period_id = p_period_id;
  insert into public.shift_period_needs (org_id, store_id, period_id, dow, required)
  select v_org, v_p.store_id, p_period_id, (e->>'dow')::int, (e->>'required')::int from jsonb_array_elements(p_rows) e;
  perform public.audit_log_write('shift_period_needs_set', 'shift_periods:' || p_period_id::text, null, jsonb_build_object('rows', p_rows), v_p.store_id);
end $function$;
revoke execute on function public.shift_period_needs_set(uuid, jsonb) from public, anon;
grant execute on function public.shift_period_needs_set(uuid, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.shift_periods_auto_close()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (b)）: 希望の締切（wish_deadline）を過ぎた募集中（open）の期間を配置中（closed）へ＝表示の実効段（effectiveStageOf）を正本化。
--   service_role だけ（Vercel cron route /api/cron/shift-periods-close＝毎日 JST 06:10 の見込み＝P176）。audit は org ごとに 1 行（service）。戻り＝遷移した件数
declare
  v_n int := 0; v_r record;
begin
  for v_r in
    update public.shift_periods p
       set status = 'closed', updated_at = now()
     where p.status = 'open' and p.wish_deadline is not null and p.wish_deadline < (now() at time zone 'Asia/Tokyo')::date
    returning p.id, p.org_id, p.store_id
  loop
    v_n := v_n + 1;
    perform public.audit_log_write_service(v_r.org_id, v_r.store_id, 'shift_period_auto_close', 'shift_periods:' || v_r.id::text, jsonb_build_object('status', 'open'), jsonb_build_object('status', 'closed'), null);
  end loop;
  return v_n;
end $function$;
revoke execute on function public.shift_periods_auto_close() from public, anon, authenticated, service_role;   -- 内部専用＝4 ロール明示 revoke
grant execute on function public.shift_periods_auto_close() to service_role;   -- route（admin client）からだけ呼ぶ
CREATE OR REPLACE FUNCTION public.shift_cast_decline(p_shift_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (c)・裁定406「辞退で戻る」）: 本人（cast）が送り返し（proposed）を辞退＝planned に戻し declined_at／decline_reason を残す（承認リストに戻る）。shift_cast_confirm（proposed→confirmed）と対。audit
declare
  v_cast uuid := public.auth_cast_id();
  v_s record;
begin
  if public.auth_org_id() is null or v_cast is null then raise exception 'forbidden'; end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select * into v_s from public.shifts where id = p_shift_id for update;
  if v_s.id is null or v_s.cast_id <> v_cast then raise exception 'forbidden'; end if;
  if v_s.status <> 'proposed' then raise exception 'not proposed'; end if;
  update public.shifts set status = 'planned', declined_at = now(), decline_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now() where id = p_shift_id;
  perform public.audit_log_write('shift_cast_decline', 'shifts:' || p_shift_id::text, jsonb_build_object('status', 'proposed'), jsonb_build_object('status', 'planned', 'reason', p_reason), v_s.store_id);
end $function$;
revoke execute on function public.shift_cast_decline(uuid, text) from public, anon;
grant execute on function public.shift_cast_decline(uuid, text) to authenticated;
CREATE OR REPLACE FUNCTION public.cast_notification_create(p_cast_id uuid, p_kind text, p_body text, p_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (d)・裁定413 の相手への通知）: キャスト 1 人あての通知（確定シフトの追加／外し・基本の働き方の変更・差し戻し）。owner／自店 manager／staff（can_shift）。/mine が読む（read_at）。LINE push は route（P176）
declare
  v_org uuid := public.auth_org_id();
  v_cast record; v_id uuid;
begin
  if v_org is null or public.auth_role() not in ('owner','manager','staff') then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('shift_added','shift_removed','shift_changed','shift_proposed','availability_changed','other') then raise exception 'bad kind'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(p_body) > 500 then raise exception 'bad body'; end if;
  select id, org_id, store_id into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or v_cast.store_id = public.auth_store_id()) then raise exception 'forbidden'; end if;
  insert into public.cast_notifications (org_id, store_id, cast_id, kind, body, ref, created_by)
  values (v_org, v_cast.store_id, p_cast_id, p_kind, trim(p_body), left(p_ref, 120), (select id from public.users where auth_user_id = auth.uid() and is_active))
  returning id into v_id;
  return v_id;
end $function$;
revoke execute on function public.cast_notification_create(uuid, text, text, text) from public, anon;
grant execute on function public.cast_notification_create(uuid, text, text, text) to authenticated;
CREATE OR REPLACE FUNCTION public.cast_notification_read(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176: 本人が通知を既読に（cast セルフ）
begin
  if public.auth_org_id() is null or public.auth_cast_id() is null then raise exception 'forbidden'; end if;
  update public.cast_notifications set read_at = coalesce(read_at, now()) where id = p_id and cast_id = public.auth_cast_id();
  if not found then raise exception 'not found'; end if;
end $function$;
revoke execute on function public.cast_notification_read(uuid) from public, anon;
grant execute on function public.cast_notification_read(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.notice_create_targets(p_title text, p_body text, p_cast_ids uuid[], p_until date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (e)）: 宛先つきのお知らせ＝notices.cast_ids（null＝従来の全員）。「未提出の人にお知らせを送る」。owner／manager・自店の有効なキャストだけ・1〜200 人・audit。/mine の読取で cast_ids を絞るのは P176
declare
  v_org uuid := public.auth_org_id();
  v_store uuid := public.auth_store_id();
  v_actor uuid; v_id uuid; v_title text; v_body text;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  v_title := trim(coalesce(p_title, '')); if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, '')); if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_cast_ids is null or cardinality(p_cast_ids) < 1 or cardinality(p_cast_ids) > 200 then raise exception 'bad targets'; end if;
  if exists (select 1 from unnest(p_cast_ids) x(id) where not exists (select 1 from public.casts c where c.id = x.id and c.org_id = v_org and c.store_id = v_store and c.is_active)) then raise exception 'bad targets'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by, cast_ids)
  values (v_org, v_store, v_title, v_body, 'cast', false, p_until, v_actor, (select array_agg(distinct x) from unnest(p_cast_ids) x))
  returning id into v_id;
  perform public.audit_log_write('notice_create_targets', 'notices:' || v_id::text, null, jsonb_build_object('title', v_title, 'targets', cardinality(p_cast_ids), 'until', p_until), v_store);
  return v_id;
end $function$;
revoke execute on function public.notice_create_targets(text, text, uuid[], date) from public, anon;
grant execute on function public.notice_create_targets(text, text, uuid[], date) to authenticated;

commit;

-- ===== verify =====（Success の後に 1 文で貼る＝docs/demo/verify_0176.sql と同じ）
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'tables', count(*)::text from pg_tables where schemaname='public' and tablename in ('line_links','line_bind_tokens','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications')
-- union all select 'service only', string_agg(proname, ',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('set_line_secret','get_line_secret','bind_line','staff_invite_accept','line_push_log_write','shift_periods_auto_close') and proacl::text not like '%authenticated%'
-- union all select 'authenticated select only', (select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name in ('line_links','line_push_log','staff_invites','member_profiles','attendance_contacts','contact_changes','shift_period_needs','cast_notifications'))
-- union all select 'vault', count(*)::text from pg_extension where extname='supabase_vault';
-- ===== end 0176 =====
