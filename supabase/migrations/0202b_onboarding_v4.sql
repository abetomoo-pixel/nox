-- 0202b_onboarding_v4.sql（2026-11-21 夜 起草・CC・相談役 18:40 の 4＝起草と試走まで・適用しない・0202a の後に貼る・0202c は適用済み）
-- 版 4（版 3 からの差）: a 下書きの上書き防止（onb_setup_draft_set に p_expected_at・'stale'）・b 仮の登録の 3 本に for update・c デモの会社はオーナーの窓口 4 本を止める・e 検証に 2 行。生成器 docs/tmp/gen_0202b_v4.cjs
-- 名前: 0202b 導入代行 版 2（裁定476 改 ■C ①②・Agoora 11/20 の決定＝導入は店・運営元・代理店のだれでも行える・代理店も LINE 連携まで・18:08 の決定 5・6・7）
-- 翻訳元: なし（NOX 独自・案 docs/tmp/console_plan_v2_1120.md と docs/tmp/onboarding_v3_plan_1120.md）
-- 前提: 0202a の後（関数 463・表 124）。0202c（0176 の監査の引数）は 2026-11-21 18:28 に適用済み＝関数と表の数は変わっていない。
-- 形: 行い手（運営者＝'ops'・代理店＝'agency'）を引数で受ける共通の窓口 onb_*（service だけ）。書けるかの判定は 1 本（onb_can_write）。
--   運営者＝有効な運営者で、会社が導入中か、オーナーのサポート許可（1／3／7 日）の間。代理店＝会社が導入中で、経路が代理店のコードと同じで、オーナーが代理店の代行を許している。
--   運営も代理店もオーナーになりすまさない（auth_org_id／auth_role は使わない・店の側の関数は作り直さない）。代行でできるのは onb_* の 3 つ（下書き・LINE 連携・キャストの仮の登録）だけ。
-- 変えるもの:
--   ★1 orgs に代理店の代行の許可（agency_assist_allowed・_at・_by）
--   ★2 audit_logs に行い手の種類と参照（actor_kind・actor_ref）
--   ★3 表 ops_support_grants（オーナーの期限付きのサポート許可）
--   ★4 内部専用 onb_can_write・onb_audit_write
--   ★5 オーナーの窓口（authenticated）: support_grant_set・support_grant_revoke・set_agency_assist・onboarding_done_by_owner
--   ★6 service 専用の代行の窓口: onb_setup_draft_set（STEP ごと・だれがいつを下書きに残す）・onb_line_set・onb_line_secret_set・onb_line_verify・ops_org_set_agency_assist
--   ★7（版 3）setup_drafts に assisted（STEP ごとの 行い手・表示名・時刻）＝確定の画面で「運営／代理店が入れた所」を見せる。確定（「この内容で始める」）はオーナーだけ（今の /setup のまま）。
--   ★8（版 3）表 cast_provisionals（キャストの仮の登録＝casts の外＝打刻・レジ・給与・名簿に出ない）＋ service の onb_cast_provisional_add／_cancel ＋ 店の窓口 cast_provisional_promote（生年月日を入れて本登録＝cast_create を中で呼ぶ＝18 歳の判定はそのまま）／cast_provisional_discard
-- 店舗の停止（段 4）と契約の停止（段 3）は入れない（読取と案＝onboarding_v3_plan_1120.md §4）。0176 の監査の引数の取り違えは 0202c。
-- 表 2・関数 15（関数 463→478・表 124→126）。
-- 検証クエリ（貼った後）: docs/tmp/0202b_v4_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 会社の列 ═══
alter table public.orgs
  add column if not exists agency_assist_allowed boolean not null default false,
  add column if not exists agency_assist_at      timestamptz null,
  add column if not exists agency_assist_by      uuid null;

-- ═══ ★2 店の側の監査に行い手 ═══
alter table public.audit_logs
  add column if not exists actor_kind text null,
  add column if not exists actor_ref  text null;
alter table public.audit_logs add constraint audit_logs_actor_kind_check check (actor_kind is null or actor_kind in ('user', 'ops', 'agency', 'system'));

-- ═══ ★3 オーナーの期限付きのサポート許可 ═══
create table public.ops_support_grants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  granted_by  uuid not null,                     -- users.id（オーナー）
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz null,
  revoked_by  uuid null
);
create index ops_support_grants_org_idx on public.ops_support_grants (org_id, expires_at desc);
alter table public.ops_support_grants enable row level security;
create policy ops_support_grants_select on public.ops_support_grants for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() = 'owner');   -- オーナーだけが自社の許可を読む（運営は service）
revoke all on table public.ops_support_grants from public, anon, authenticated, service_role;
grant select on table public.ops_support_grants to authenticated;
grant select, insert, update on table public.ops_support_grants to service_role;

-- ═══ ★7（版 3）下書きに「だれがいつどの STEP を入れたか」 ═══
alter table public.setup_drafts add column if not exists assisted jsonb not null default '{}'::jsonb;   -- {"<STEP>": {"kind": "ops"|"agency", "who": "運営"|"代理店（コード）", "at": 時刻}}・オーナーの setup_draft_set は触らない（確定で下書きごと消える）

-- ═══ ★8（版 3）キャストの仮の登録（casts の外＝打刻・レジ・給与・名簿・LINE の対象に出ない） ═══
create table public.cast_provisionals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 80),
  plan_id          uuid null references public.comp_plans(id) on delete set null,   -- 待遇プランの候補（本登録の画面で既定に出すだけ）
  note             text null check (note is null or length(note) <= 200),
  created_kind     text not null check (created_kind in ('ops', 'agency')),
  created_who      text not null,                                                     -- オーナーに見せる名前（運営／代理店（コード））
  created_at       timestamptz not null default now(),
  promoted_cast_id uuid null references public.casts(id) on delete set null,
  promoted_at      timestamptz null,
  discarded_at     timestamptz null
);
create index cast_provisionals_store_idx on public.cast_provisionals (store_id, created_at) where promoted_at is null and discarded_at is null;
alter table public.cast_provisionals enable row level security;
create policy cast_provisionals_select on public.cast_provisionals for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'manager') and (public.auth_role() = 'owner' or store_id = public.auth_store_id()));   -- オーナー・自店の店長だけ（スタッフ・キャストは見ない）
revoke all on table public.cast_provisionals from public, anon, authenticated, service_role;
grant select on table public.cast_provisionals to authenticated;
grant select on table public.cast_provisionals to service_role;

-- ═══ ★4 内部専用 ═══
CREATE OR REPLACE FUNCTION public.onb_can_write(p_kind text, p_ref text, p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org record;
begin
  if p_kind is null or p_ref is null or p_org is null then return false; end if;
  select id, is_demo, onboarding_state, agency_code, agency_assist_allowed into v_org from public.orgs where id = p_org;
  if v_org.id is null or v_org.is_demo then return false; end if;
  if p_kind = 'ops' then
    if p_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    if not public.ops_operator_ok(p_ref::uuid) then return false; end if;
    return v_org.onboarding_state = 'onboarding'
        or exists (select 1 from public.ops_support_grants g where g.org_id = p_org and g.revoked_at is null and g.expires_at > now());
  elsif p_kind = 'agency' then   -- 代理店＝導入中だけ・自分が紹介した会社だけ・オーナーが許している（導入完了で外れる＝サポート許可でも開かない）
    return v_org.onboarding_state = 'onboarding' and v_org.agency_assist_allowed and v_org.agency_code is not null and v_org.agency_code = p_ref;
  end if;
  return false;
end $function$;
revoke all on function public.onb_can_write(text, text, uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.onb_audit_write(p_kind text, p_ref text, p_org uuid, p_store uuid, p_action text, p_target text, p_before jsonb, p_after jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.onb_can_write(p_kind, p_ref, p_org) then raise exception 'forbidden'; end if;   -- 行を書く内部関数＝冒頭の柵（原則 8）
  if p_kind = 'ops' then
    insert into public.ops_audit_logs (ops_user_id, org_id, action, target, before_json, after_json) values (p_ref::uuid, p_org, p_action, p_target, p_before, p_after);
  end if;
  insert into public.audit_logs (org_id, store_id, actor_user_id, actor_ops_id, actor_kind, actor_ref, action, target, before_json, after_json)
  values (p_org, p_store, null, case when p_kind = 'ops' then p_ref::uuid end, p_kind, case when p_kind = 'agency' then p_ref end, p_action, p_target, p_before, p_after);
end $function$;
revoke all on function public.onb_audit_write(text, text, uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;

-- ═══ ★5 オーナーの窓口（authenticated・二重防御） ═══
CREATE OR REPLACE FUNCTION public.support_grant_set(p_days integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_user uuid;
  v_exp  timestamptz;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if exists (select 1 from public.orgs o where o.id = v_org and o.is_demo) then raise exception 'forbidden (demo)'; end if;   -- ★版 4 c: デモの会社では押せない（reset で戻らない）
  if p_days is null or p_days not in (1, 3, 7) then raise exception 'bad days'; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  update public.ops_support_grants set revoked_at = now(), revoked_by = v_user where org_id = v_org and revoked_at is null and expires_at > now();   -- 許可は 1 つだけ（出し直し＝前を閉じる）
  v_exp := now() + make_interval(days => p_days);
  insert into public.ops_support_grants (org_id, granted_by, expires_at) values (v_org, v_user, v_exp);
  perform public.audit_log_write('support_grant_set', 'orgs:' || v_org::text, null, jsonb_build_object('days', p_days, 'expires_at', v_exp), null);
  return v_exp;
end $function$;
revoke execute on function public.support_grant_set(integer) from public, anon;
grant execute on function public.support_grant_set(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.support_grant_revoke()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_user uuid;
  v_n    integer;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if exists (select 1 from public.orgs o where o.id = v_org and o.is_demo) then raise exception 'forbidden (demo)'; end if;   -- ★版 4 c: デモの会社では押せない（reset で戻らない）
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  update public.ops_support_grants set revoked_at = now(), revoked_by = v_user where org_id = v_org and revoked_at is null and expires_at > now();
  get diagnostics v_n = row_count;
  if v_n > 0 then perform public.audit_log_write('support_grant_revoke', 'orgs:' || v_org::text, null, jsonb_build_object('revoked', v_n), null); end if;
end $function$;
revoke execute on function public.support_grant_revoke() from public, anon;
grant execute on function public.support_grant_revoke() to authenticated;

CREATE OR REPLACE FUNCTION public.set_agency_assist(p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 裁定493 (a)：店が自分で登録した会社は代理店の代行が既定 OFF・オーナーが ON にできる
declare
  v_org  uuid := public.auth_org_id();
  v_user uuid;
  v_old  boolean;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if exists (select 1 from public.orgs o where o.id = v_org and o.is_demo) then raise exception 'forbidden (demo)'; end if;   -- ★版 4 c: デモの会社では押せない（reset で戻らない）
  if p_on is null then raise exception 'bad value'; end if;   -- 原則 7
  select agency_assist_allowed into v_old from public.orgs where id = v_org;
  if v_old = p_on then return; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  update public.orgs set agency_assist_allowed = p_on, agency_assist_at = now(), agency_assist_by = v_user where id = v_org;
  perform public.audit_log_write('set_agency_assist', 'orgs:' || v_org::text, jsonb_build_object('agency_assist_allowed', v_old), jsonb_build_object('agency_assist_allowed', p_on), null);
end $function$;
revoke execute on function public.set_agency_assist(boolean) from public, anon;
grant execute on function public.set_agency_assist(boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.onboarding_done_by_owner()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- オーナーが店の画面で「導入完了にする」＝代行の窓口が閉じる（運営はサポート許可の間だけ・代理店は閉じたまま）
declare
  v_org  uuid := public.auth_org_id();
  v_user uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if exists (select 1 from public.orgs o where o.id = v_org and o.is_demo) then raise exception 'forbidden (demo)'; end if;   -- ★版 4 c: デモの会社では押せない（reset で戻らない）
  if (select onboarding_state from public.orgs where id = v_org) = 'done' then return; end if;
  select u.id into v_user from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  update public.orgs set onboarding_state = 'done', onboarding_done_at = now(), onboarding_done_by = v_user, onboarding_done_kind = 'owner' where id = v_org;
  perform public.audit_log_write('onboarding_done', 'orgs:' || v_org::text, jsonb_build_object('onboarding_state', 'onboarding'), jsonb_build_object('onboarding_state', 'done'), null);
end $function$;
revoke execute on function public.onboarding_done_by_owner() from public, anon;
grant execute on function public.onboarding_done_by_owner() to authenticated;

-- ═══ ★6 service 専用の代行の窓口（route が行い手を確かめてから admin client で呼ぶ＝運営者は getUser→aal2→ops_operators・代理店は入口の印〈未裁定〉） ═══
CREATE OR REPLACE FUNCTION public.onb_setup_draft_set(p_kind text, p_ref text, p_store_id uuid, p_step integer, p_data jsonb, p_expected_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 初期設定の下書き（setup_drafts）を代行で書く＝オーナーの setup_draft_set と同じ形・同じ上限。確定（約 30 本の RPC）はオーナーが「この内容で始める」で 1 回だけ行う（決定 6）
-- ★版 3: どの STEP（1〜9）をだれがいつ入れたかを setup_drafts.assisted に残す（確定の画面で「運営／代理店が入れた所」を見せる・中身は写さない）
-- ★版 4 a: p_expected_at＝運営の画面が読んだときの setup_drafts.updated_at（下書きが無かったら null）。今の値と違えば 'stale'（オーナーの自動保存が後から書いた＝読み直してから）。
--   店の行と下書きの行を for update で読む＝オーナーの確定（setup_done）や自動保存と同時に書かない。戻りは新しい updated_at（次の保存の p_expected_at）。
declare
  v_org uuid;
  v_who text;
  v_cur timestamptz;
  v_found boolean;
  v_now timestamptz := clock_timestamp();
begin
  select org_id into v_org from public.stores where id = p_store_id for update;
  if v_org is null or not public.onb_can_write(p_kind, p_ref, v_org) then raise exception 'forbidden'; end if;
  if p_step is null or p_step not between 1 and 9 then raise exception 'bad step'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 400000 then raise exception 'bad data'; end if;
  if exists (select 1 from public.stores s where s.id = p_store_id and coalesce(s.settings_json->>'setup_done', 'false') = 'true') then raise exception 'setup done'; end if;   -- 確定の後は下書きを作らない（店の設定は店の画面で）
  select d.updated_at into v_cur from public.setup_drafts d where d.org_id = v_org and d.store_id = p_store_id for update;
  v_found := found;
  if (v_found and (p_expected_at is null or date_trunc('milliseconds', v_cur) <> date_trunc('milliseconds', p_expected_at))) or (not v_found and p_expected_at is not null) then raise exception 'stale'; end if;   -- ミリ秒で比べる（画面の Date はマイクロ秒を落とす）
  v_who := case when p_kind = 'ops' then '運営' else '代理店（' || p_ref || '）' end;   -- オーナーに見せる名前（運営者の名前は出さない）
  insert into public.setup_drafts (org_id, store_id, data, updated_by, updated_at, assisted)
  values (v_org, p_store_id, p_data, null, v_now, jsonb_build_object(p_step::text, jsonb_build_object('kind', p_kind, 'who', v_who, 'at', v_now)))
  on conflict (org_id, store_id) do update set data = excluded.data, updated_by = null, updated_at = v_now,
     assisted = coalesce(public.setup_drafts.assisted, '{}'::jsonb) || jsonb_build_object(p_step::text, jsonb_build_object('kind', p_kind, 'who', v_who, 'at', v_now));
  perform public.onb_audit_write(p_kind, p_ref, v_org, p_store_id, 'onb.setup_draft', 'stores:' || p_store_id::text, null,
    jsonb_build_object('step', p_step, 'bytes', length(p_data::text)));   -- 下書きの中身は監査に写さない（大きさと STEP だけ）
  return v_now;
end $function$;
revoke all on function public.onb_setup_draft_set(text, text, uuid, integer, jsonb, timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.onb_setup_draft_set(text, text, uuid, integer, jsonb, timestamp with time zone) to service_role;

CREATE OR REPLACE FUNCTION public.onb_line_set(p_kind text, p_ref text, p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- LINE の公開してよい値＝set_store_line_config（login_channel_id／liff_id／bot_destination）と set_store_line_extra（bot_basic_id／richmenu_id_default／richmenu_id_linked）と同じ鍵と検査
declare
  v_row record; v_k text; v_v text; v_cfg jsonb;
begin
  select s.id, s.org_id, s.line_config into v_row from public.stores s where s.id = p_store_id;
  if v_row.id is null or not public.onb_can_write(p_kind, p_ref, v_row.org_id) then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;
  v_cfg := coalesce(v_row.line_config, '{}'::jsonb);
  for v_k in select jsonb_object_keys(p_patch) loop
    if v_k not in ('login_channel_id', 'liff_id', 'bot_destination', 'bot_basic_id', 'richmenu_id_default', 'richmenu_id_linked') then raise exception 'bad key'; end if;
    if jsonb_typeof(p_patch->v_k) not in ('string', 'null') then raise exception 'bad type'; end if;
    v_v := nullif(trim(coalesce(p_patch->>v_k, '')), '');
    if v_v is not null and length(v_v) > 100 then raise exception 'bad value'; end if;
    if v_k = 'bot_destination' and v_v is not null and v_v !~ '^U[0-9a-f]{32}$' then raise exception 'bad bot_destination'; end if;
    if v_k = 'bot_basic_id' and v_v is not null and v_v !~ '^@[0-9a-z._-]{1,40}$' then raise exception 'bad bot_basic_id'; end if;
    if v_k like 'richmenu_id_%' and v_v is not null and v_v !~ '^richmenu-[0-9a-f]{32}$' then raise exception 'bad richmenu_id'; end if;
    v_cfg := case when v_v is null then v_cfg - v_k else jsonb_set(v_cfg, array[v_k], to_jsonb(v_v), true) end;
  end loop;
  update public.stores set line_config = v_cfg, updated_at = now() where id = p_store_id;
  perform public.onb_audit_write(p_kind, p_ref, v_row.org_id, p_store_id, 'onb.line', 'stores:' || p_store_id::text,
    v_row.line_config - 'channel_secret_ref' - 'access_token_ref', v_cfg - 'channel_secret_ref' - 'access_token_ref');
end $function$;
revoke all on function public.onb_line_set(text, text, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.onb_line_set(text, text, uuid, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.onb_line_secret_set(p_kind text, p_ref text, p_store_id uuid, p_secret_kind text, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- シークレットとトークン＝既存の set_line_secret（Vault）を中で呼ぶ。監査に値を残さない（種類と「入れた」だけ・長さも残さない）。読み出す道は作らない
declare
  v_org uuid;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or not public.onb_can_write(p_kind, p_ref, v_org) then raise exception 'forbidden'; end if;
  perform public.set_line_secret(p_store_id, p_secret_kind, p_secret);   -- 種類・空・長さの検査は set_line_secret（bad kind／bad secret）
  perform public.onb_audit_write(p_kind, p_ref, v_org, p_store_id, 'onb.line_secret', 'stores:' || p_store_id::text, null, jsonb_build_object('kind', p_secret_kind, 'set', true));
end $function$;
revoke all on function public.onb_line_secret_set(text, text, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.onb_line_secret_set(text, text, uuid, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.onb_line_verify(p_kind text, p_ref text, p_store_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- LINE の 4 段目＝友だち追加と連携の確かめ。その店で LINE とつながった人（line_links・ブロックなし）が 1 人以上いれば line_config.line_verified_at に時刻を入れる
declare
  v_row record; v_n integer;
begin
  select s.id, s.org_id, s.line_config into v_row from public.stores s where s.id = p_store_id;
  if v_row.id is null or not public.onb_can_write(p_kind, p_ref, v_row.org_id) then raise exception 'forbidden'; end if;
  if coalesce(v_row.line_config->>'access_token_ref', '') = '' or coalesce(v_row.line_config->>'liff_id', '') = '' then raise exception 'not configured'; end if;
  select count(*)::int into v_n from public.line_links l where l.store_id = p_store_id and l.blocked_at is null;
  if v_n = 0 then raise exception 'no link'; end if;
  update public.stores set line_config = jsonb_set(coalesce(line_config, '{}'::jsonb), '{line_verified_at}', to_jsonb(now()), true), updated_at = now() where id = p_store_id;
  perform public.onb_audit_write(p_kind, p_ref, v_row.org_id, p_store_id, 'onb.line_verify', 'stores:' || p_store_id::text, null, jsonb_build_object('links', v_n));
  return v_n;
end $function$;
revoke all on function public.onb_line_verify(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.onb_line_verify(text, text, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.ops_org_set_agency_assist(p_ops uuid, p_org_id uuid, p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 裁定493 (b)：代理店から始まった会社は運営が代行を許す（オーナーはいつでも set_agency_assist で外せる）
declare
  v_old boolean;
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  if p_on is null then raise exception 'bad value'; end if;
  select agency_assist_allowed into v_old from public.orgs where id = p_org_id and not is_demo;
  if v_old is null then raise exception 'not found'; end if;
  if v_old = p_on then return; end if;
  update public.orgs set agency_assist_allowed = p_on, agency_assist_at = now(), agency_assist_by = p_ops where id = p_org_id;
  perform public.ops_audit_write(p_ops, p_org_id, 'ops.agency_assist', 'orgs:' || p_org_id::text, jsonb_build_object('agency_assist_allowed', v_old), jsonb_build_object('agency_assist_allowed', p_on), null, null, true);
end $function$;
revoke all on function public.ops_org_set_agency_assist(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.ops_org_set_agency_assist(uuid, uuid, boolean) to service_role;

-- ═══ ★8（版 3）キャストの仮の登録の窓口 ═══
CREATE OR REPLACE FUNCTION public.onb_cast_provisional_add(p_kind text, p_ref text, p_store_id uuid, p_name text, p_plan_id uuid, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 代行でキャストを仮に登録する（源氏名と待遇プランの候補だけ・生年月日は持たない＝18 歳の判定の前）。casts には入れない＝店の動きに何も効かない
declare
  v_org uuid; v_id uuid; v_n integer;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or not public.onb_can_write(p_kind, p_ref, v_org) then raise exception 'forbidden'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'bad name'; end if;
  if p_note is not null and length(p_note) > 200 then raise exception 'bad note'; end if;
  if p_plan_id is not null and not exists (select 1 from public.comp_plans p where p.id = p_plan_id and p.org_id = v_org and p.store_id = p_store_id) then raise exception 'bad plan'; end if;
  select count(*)::int into v_n from public.cast_provisionals where store_id = p_store_id and promoted_at is null and discarded_at is null;
  if v_n >= 200 then raise exception 'too many'; end if;
  insert into public.cast_provisionals (org_id, store_id, name, plan_id, note, created_kind, created_who)
  values (v_org, p_store_id, btrim(p_name), p_plan_id, nullif(btrim(coalesce(p_note, '')), ''), p_kind, case when p_kind = 'ops' then '運営' else '代理店（' || p_ref || '）' end)
  returning id into v_id;
  perform public.onb_audit_write(p_kind, p_ref, v_org, p_store_id, 'onb.cast_provisional_add', 'cast_provisionals:' || v_id::text, null, jsonb_build_object('name', btrim(p_name), 'plan_id', p_plan_id));
  return v_id;
end $function$;
revoke all on function public.onb_cast_provisional_add(text, text, uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.onb_cast_provisional_add(text, text, uuid, text, uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.onb_cast_provisional_cancel(p_kind text, p_ref text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 代行で入れた仮の登録を取り下げる（本登録の前だけ）
declare
  v_row record;
begin
  select id, org_id, store_id, name, promoted_at, discarded_at into v_row from public.cast_provisionals where id = p_id for update;   -- ★版 4 b
  if v_row.id is null or not public.onb_can_write(p_kind, p_ref, v_row.org_id) then raise exception 'forbidden'; end if;
  if v_row.promoted_at is not null then raise exception 'promoted'; end if;
  if v_row.discarded_at is not null then return; end if;
  update public.cast_provisionals set discarded_at = now() where id = p_id;
  perform public.onb_audit_write(p_kind, p_ref, v_row.org_id, v_row.store_id, 'onb.cast_provisional_cancel', 'cast_provisionals:' || p_id::text, jsonb_build_object('name', v_row.name), null);
end $function$;
revoke all on function public.onb_cast_provisional_cancel(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.onb_cast_provisional_cancel(text, text, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.cast_provisional_promote(p_id uuid, p_birthday date, p_real_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 店（オーナー・自店の店長）が生年月日を入れて本登録にする＝cast_create を中で呼ぶ（18 歳の判定・請求の柵・店の検査は cast_create のまま＝緩めない）
declare
  v_org uuid := public.auth_org_id();
  v_row record;
  v_cast uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  select id, org_id, store_id, name, plan_id, promoted_at, promoted_cast_id, discarded_at into v_row from public.cast_provisionals where id = p_id for update;   -- ★版 4 b: 2 回押しで 2 人できない
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if v_row.promoted_at is not null then return v_row.promoted_cast_id; end if;   -- 再送＝同じキャスト（冪等）
  if v_row.discarded_at is not null then raise exception 'discarded'; end if;
  if p_birthday is null then raise exception 'bad birthday'; end if;
  v_cast := public.cast_create(v_row.store_id, v_row.name, p_birthday, p_real_name, null);   -- 18 歳未満は cast_create_apply が止める（仮の登録は残る）
  update public.cast_provisionals set promoted_cast_id = v_cast, promoted_at = now() where id = p_id;
  perform public.audit_log_write('cast_provisional_promote', 'cast_provisionals:' || p_id::text, null, jsonb_build_object('cast_id', v_cast, 'plan_id', v_row.plan_id), v_row.store_id, null);
  return v_cast;
end $function$;
revoke execute on function public.cast_provisional_promote(uuid, date, text) from public, anon;
grant execute on function public.cast_provisional_promote(uuid, date, text) to authenticated;

CREATE OR REPLACE FUNCTION public.cast_provisional_discard(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 店が仮の登録を捨てる（本登録しない人）
declare
  v_org uuid := public.auth_org_id();
  v_row record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  select id, org_id, store_id, name, promoted_at, discarded_at into v_row from public.cast_provisionals where id = p_id for update;   -- ★版 4 b
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if v_row.promoted_at is not null then raise exception 'promoted'; end if;
  if v_row.discarded_at is not null then return; end if;
  update public.cast_provisionals set discarded_at = now() where id = p_id;
  perform public.audit_log_write('cast_provisional_discard', 'cast_provisionals:' || p_id::text, jsonb_build_object('name', v_row.name), null, v_row.store_id, null);
end $function$;
revoke execute on function public.cast_provisional_discard(uuid) from public, anon;
grant execute on function public.cast_provisional_discard(uuid) to authenticated;

commit;
