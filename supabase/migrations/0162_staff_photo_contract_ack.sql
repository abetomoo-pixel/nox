-- 0162_staff_photo_contract_ack.sql
-- マイグレーション名: 0162_staff_photo_contract_ack（裁定329 スタッフの写真＋裁定326 追補7-6 cast の契約確認記録）
-- 生成器: docs/tmp/gen_0162.mjs（手打ち禁止）。写経元＝docs/tmp/0162_live.json（q1001_live_0162.mjs が pg_get_functiondef で dump した live 全文・CR 除去）。
--   既存関数は ★ の置換点以外 1 バイト不変（299-11）。新設 5 本はこのテンプレート内に手書き・期待 md5 は生成物から算出。
--
-- 写経元 live md5（2026-10-01・prosrc の CR 除去・先頭 8 桁）→ 本 mig 適用後の期待 md5:
--   set_store_mine_settings  5aaecb0f → 09595c7e
--   demo_org_reset           a331cdcd → a4bd6a18
--   新設 5 本: set_user_photo_updated_at 97a3da84／clear_cast_photo 22c0d2b2／clear_user_photo 372b28e5／cast_contract_ack_needed a7b2ca2f／cast_contract_ack_self e9dc61dd
--   不触の控え（適用後も不変であること）: set_cast_photo_updated_at 6591a162／notice_mark_read b1329e24／set_cast_quota 1987d03d／set_store_profile 4f2e9f82／audit_log_write 182eba3a／
--     billing_writable_of 927fb270／auth_org_id 2e080ce7／auth_role db860f0a／auth_store_id 3dafaa83／auth_cast_id e035a6d5／auth_membership_id cb6bfaca／reservation_request f0c51a0a／
--     reservation_decide a0088416／shift_wish_submit 4afdf603／shift_wish_decide 4c8c7d6b／shift_auto_apply 55cbb0e8／staff_pattern_effective a65c716d／staff_pattern_disable cb1d4a34／
--     staff_pattern_enable e768f710／punch_seq_check f5fd8b84／punch_self 952f18a4／set_cast_profile 0c41659b／cast_create c98841ab／staff_create e69adbe4
--
-- 器（裁定329・326 追補7-6・便「台帳記入＋0162 起草」★1〜★5）:
--   ★1 users.photo_updated_at timestamptz null（null＝写真なし・casts.photo_updated_at（0064）と同じ意味）。実体＝既存 bucket cast-photos の {org_id}/u_{user_id}.jpg（新 bucket なし・縮小 512px JPEG は client 共通）。
--   ★2 storage.objects policy: cast_photos_insert／cast_photos_update を drop→create（cast 腕と is_demo 句は live 逐語・users 腕を追加＝owner ∨ manager（対象 user が自店の membership）∨ 本人（auth.uid()・role owner／manager／staff））。
--        cast_photos_delete を新設（for delete・using＝update の using と同文＝cast 腕＋users 腕＋is_demo 句）。cast_photos_select は不触（qual＝bucket＋org フォルダ＝u_ ファイルも既に読める・★起草判断）。
--   ★3 新設 RPC（非ゲート・写真は課金ゲート外＝set_cast_photo_updated_at と同じ）:
--        set_user_photo_updated_at(p_user_id) returns timestamptz＝set_cast_photo_updated_at の users 写し（authz は storage の users 腕と同一式・audit 'set_user_photo'）。
--        clear_cast_photo(p_cast_id)／clear_user_photo(p_user_id) returns void＝photo_updated_at を null に戻す（authz は set と同一・audit 'clear_cast_photo'／'clear_user_photo'）。
--        Storage の実体削除は client から delete policy 経由（順序＝RPC で null → storage.remove・実体が残っても署名 URL は発行しない＝photo_updated_at null）。
--   ★4 cast_contract_acks（cast_id・contract_rev timestamptz・org_id・store_id・acked_at・PK (cast_id, contract_rev)）＋RLS select（cast 本人・owner・manager 自店）・grant select のみ。
--        contract_rev＝店の契約確認が OFF→ON に切り替わった時刻＝set_store_mine_settings に ★ 2 行（contract_ack が false／欠損→true のとき settings_json.contract_ack_rev＝now() を併せて保存・白名単 8 キーは不変＝client からは送れない）。
--        cast_contract_ack_needed() returns boolean＝cast セルフ・店の contract_ack が true かつ rev が有り・その rev の記録が無ければ true。
--        cast_contract_ack_self() returns void＝cast セルフ・店が ON でなければ 'not required'・insert on conflict do nothing（冪等・audit は 1 回目だけ 'cast_contract_ack'）。
--   ★5 grants（新設 5 本＝authenticated＋service_role・再作成 2 本は live の proacl を再掲）。demo_org_reset: c_wipe／c_load に cast_contract_acks（cast_quotas の直前に消し・直後に入れる）。名簿＝B（非ゲート）+5。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）:
--   関数 297 → 302（新設 5・非ゲート＝名簿 B +5 → A 154／B 148／全数 302）。表 81 → 82（cast_contract_acks）。'billing locked' 154／述語参照 155 不変（set_store_mine_settings は名前・ゲート不変）。
--   pin が変わる suite: grants（TABLES +1・G4d +5・G9 0162）／anon-guard（probe +5）／billing（名簿 302・除外 148）／demo-reset dr(0-2)（77→78 表）／customers-keep ck(5-1)（c_wipe／c_load +1）／
--     cast-photo（header「delete なし」→ delete policy 1 本＝新段）／mine-cast-settings（白名単 8 不変・settings_json に contract_ack_rev が増えても mineSettingsOf は無視＝不変見込み）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に）: (1) proof (2) md5 7 本（再作成 2＋新設 5） (3) 不触 3 本 (4) proacl 7 本 (5) storage policy 4 本（users 腕の有無） (6) cast_contract_acks 列 5・users.photo_updated_at・関数 302・表 82
begin;

-- ★1 users.photo_updated_at
alter table public.users add column if not exists photo_updated_at timestamptz null;   -- ★1 0162（裁定329）: null＝写真なし・実体は cast-photos/{org_id}/u_{user_id}.jpg
comment on column public.users.photo_updated_at is '0162: スタッフ写真の最終更新時刻。null=写真なし。実体は Storage cast-photos/{org_id}/u_{user_id}.jpg（キャストと同一 bucket・同一縮小）';

-- ★2 storage.objects policy（cast 腕・is_demo 句は 0149 の live 逐語・users 腕を追加・delete を新設・select は不触）
drop policy cast_photos_insert on storage.objects;
create policy cast_photos_insert on storage.objects
  for insert to authenticated
  with check (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))
      OR (EXISTS ( SELECT 1
       FROM users u
      WHERE ((('u_'::text || (u.id)::text) || '.jpg'::text) = storage.filename(objects.name)) AND (u.org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text)
             OR ((auth_role() = 'manager'::text) AND (EXISTS ( SELECT 1 FROM memberships m WHERE (m.user_id = u.id) AND (m.store_id = auth_store_id()) AND m.is_active)))
             OR ((u.auth_user_id = auth.uid()) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text]))))))   -- ★2 0162（裁定329）: users 腕（u_{user_id}.jpg＝owner ∨ manager 自店 ∨ 本人）
    ))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10 0149
  );
drop policy cast_photos_update on storage.objects;
create policy cast_photos_update on storage.objects
  for update to authenticated
  using (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))
      OR (EXISTS ( SELECT 1
       FROM users u
      WHERE ((('u_'::text || (u.id)::text) || '.jpg'::text) = storage.filename(objects.name)) AND (u.org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text)
             OR ((auth_role() = 'manager'::text) AND (EXISTS ( SELECT 1 FROM memberships m WHERE (m.user_id = u.id) AND (m.store_id = auth_store_id()) AND m.is_active)))
             OR ((u.auth_user_id = auth.uid()) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text]))))))   -- ★2 0162: users 腕
    ))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10 0149
  )
  with check (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))
      OR (EXISTS ( SELECT 1
       FROM users u
      WHERE ((('u_'::text || (u.id)::text) || '.jpg'::text) = storage.filename(objects.name)) AND (u.org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text)
             OR ((auth_role() = 'manager'::text) AND (EXISTS ( SELECT 1 FROM memberships m WHERE (m.user_id = u.id) AND (m.store_id = auth_store_id()) AND m.is_active)))
             OR ((u.auth_user_id = auth.uid()) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text]))))))   -- ★2 0162: users 腕
    ))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10 0149
  );
drop policy if exists cast_photos_delete on storage.objects;
create policy cast_photos_delete on storage.objects   -- ★2 0162（裁定329）: 削除＝update の using と同文（cast 腕＋users 腕＋is_demo 句）
  for delete to authenticated
  using (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))
      OR (EXISTS ( SELECT 1
       FROM users u
      WHERE ((('u_'::text || (u.id)::text) || '.jpg'::text) = storage.filename(objects.name)) AND (u.org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text)
             OR ((auth_role() = 'manager'::text) AND (EXISTS ( SELECT 1 FROM memberships m WHERE (m.user_id = u.id) AND (m.store_id = auth_store_id()) AND m.is_active)))
             OR ((u.auth_user_id = auth.uid()) AND (auth_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text]))))))   -- ★2 0162: users 腕
    ))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10 0149 と同じ is_demo 句（デモは写真を触れない）
  );

-- ★3 set_user_photo_updated_at（set_cast_photo_updated_at 6591a162 の users 写し・authz は storage の users 腕と同一式）
create or replace function public.set_user_photo_updated_at(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   record;
  v_now    timestamptz;
  v_before jsonb;
  v_store  uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_user_id is null then raise exception 'bad user'; end if;

  select id, org_id, auth_user_id, photo_updated_at into v_user
    from public.users where id = p_user_id;
  if v_user.id is null or v_user.org_id <> public.auth_org_id() then
    raise exception 'not found';
  end if;

  -- storage cast_photos_insert/update/delete の users 腕と同一の authz（片側だけ通る不整合を作らない）
  if not (
       public.auth_role() = 'owner'
       or (public.auth_role() = 'manager' and exists (select 1 from public.memberships m where m.user_id = p_user_id and m.store_id = public.auth_store_id() and m.is_active))
       or (v_user.auth_user_id = auth.uid() and public.auth_role() in ('owner','manager','staff'))
     ) then
    raise exception 'forbidden';
  end if;

  v_store := coalesce((select m.store_id from public.memberships m where m.user_id = p_user_id and m.is_active order by m.created_at limit 1), public.auth_store_id());
  v_now := now();
  v_before := jsonb_build_object('photo_updated_at', v_user.photo_updated_at);

  update public.users set photo_updated_at = v_now where id = p_user_id;

  perform public.audit_log_write(
    'set_user_photo',
    'users:' || p_user_id::text,
    v_before,
    jsonb_build_object('photo_updated_at', v_now),
    v_store
  );

  return v_now;
end $$;

-- ★3 clear_cast_photo（authz＝set_cast_photo_updated_at と同一・photo_updated_at を null へ）
create or replace function public.clear_cast_photo(p_cast_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast   record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_cast_id is null then raise exception 'bad cast'; end if;

  select id, org_id, store_id, photo_updated_at into v_cast
    from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then
    raise exception 'not found';
  end if;

  if not (
       public.auth_role() = 'owner'
       or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())
       or (public.auth_cast_id() is not null and public.auth_cast_id() = p_cast_id)
     ) then
    raise exception 'forbidden';
  end if;

  update public.casts set photo_updated_at = null where id = p_cast_id;

  perform public.audit_log_write(
    'clear_cast_photo',
    'casts:' || p_cast_id::text,
    jsonb_build_object('photo_updated_at', v_cast.photo_updated_at),
    jsonb_build_object('photo_updated_at', null),
    v_cast.store_id
  );
end $$;

-- ★3 clear_user_photo（authz＝set_user_photo_updated_at と同一・photo_updated_at を null へ）
create or replace function public.clear_user_photo(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   record;
  v_store  uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_user_id is null then raise exception 'bad user'; end if;

  select id, org_id, auth_user_id, photo_updated_at into v_user
    from public.users where id = p_user_id;
  if v_user.id is null or v_user.org_id <> public.auth_org_id() then
    raise exception 'not found';
  end if;

  if not (
       public.auth_role() = 'owner'
       or (public.auth_role() = 'manager' and exists (select 1 from public.memberships m where m.user_id = p_user_id and m.store_id = public.auth_store_id() and m.is_active))
       or (v_user.auth_user_id = auth.uid() and public.auth_role() in ('owner','manager','staff'))
     ) then
    raise exception 'forbidden';
  end if;

  v_store := coalesce((select m.store_id from public.memberships m where m.user_id = p_user_id and m.is_active order by m.created_at limit 1), public.auth_store_id());

  update public.users set photo_updated_at = null where id = p_user_id;

  perform public.audit_log_write(
    'clear_user_photo',
    'users:' || p_user_id::text,
    jsonb_build_object('photo_updated_at', v_user.photo_updated_at),
    jsonb_build_object('photo_updated_at', null),
    v_store
  );
end $$;

-- ★4 cast_contract_acks ＋ cast_contract_ack_needed／cast_contract_ack_self（0160 ★6 cast_notice_reads／notice_mark_read の写し）
create table if not exists public.cast_contract_acks (
  cast_id      uuid not null references public.casts(id) on delete cascade,
  contract_rev timestamptz not null,                                                   -- ★4 0162: 店の contract_ack が OFF→ON になった時刻（stores.settings_json.contract_ack_rev）
  org_id       uuid not null references public.orgs(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  acked_at     timestamptz not null default now(),
  primary key (cast_id, contract_rev)
);
create index if not exists cast_contract_acks_store_rev_idx on public.cast_contract_acks (store_id, contract_rev);
alter table public.cast_contract_acks enable row level security;
drop policy if exists cast_contract_acks_select on public.cast_contract_acks;
create policy cast_contract_acks_select on public.cast_contract_acks for select to authenticated
  using (org_id = public.auth_org_id()
         and ((public.auth_role() = 'cast' and cast_id = public.auth_cast_id())
              or (public.auth_role() = 'owner')
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())));
revoke all on table public.cast_contract_acks from public, anon, authenticated;
grant select on table public.cast_contract_acks to authenticated;

create or replace function public.cast_contract_ack_needed()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid := public.auth_cast_id();
  v_row  record;
  v_rev  timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if v_cast is null then raise exception 'no cast for caller'; end if;                      -- ★4 cast セルフ専用（非ゲート＝読取のみ）
  select c.store_id, s.settings_json into v_row from public.casts c join public.stores s on s.id = c.store_id where c.id = v_cast;
  if coalesce(v_row.settings_json->>'contract_ack', 'false') <> 'true' then return false; end if;   -- ★4 店が OFF＝確認不要
  v_rev := nullif(v_row.settings_json->>'contract_ack_rev', '')::timestamptz;
  if v_rev is null then return false; end if;                                               -- ★4 rev 無し（0162 適用前に ON にした店）＝店が OFF→ON をやり直すまで不要
  return not exists (select 1 from public.cast_contract_acks a where a.cast_id = v_cast and a.contract_rev = v_rev);
end $$;

create or replace function public.cast_contract_ack_self()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid := public.auth_cast_id();
  v_row  record;
  v_rev  timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if v_cast is null then raise exception 'no cast for caller'; end if;                      -- ★4 cast セルフ専用（非ゲート＝本人の確認記録のみ）
  select c.org_id, c.store_id, s.settings_json into v_row from public.casts c join public.stores s on s.id = c.store_id where c.id = v_cast;
  v_rev := nullif(v_row.settings_json->>'contract_ack_rev', '')::timestamptz;
  if coalesce(v_row.settings_json->>'contract_ack', 'false') <> 'true' or v_rev is null then raise exception 'not required'; end if;   -- ★4 店が ON で rev が有るときだけ
  insert into public.cast_contract_acks (cast_id, contract_rev, org_id, store_id)
  values (v_cast, v_rev, v_row.org_id, v_row.store_id)
  on conflict (cast_id, contract_rev) do nothing;                                           -- ★4 冪等（2 回目は何もしない・audit も 1 回目だけ）
  if found then
    perform public.audit_log_write('cast_contract_ack', 'cast_contract_acks:' || v_cast::text, null,
      jsonb_build_object('cast_id', v_cast, 'contract_rev', v_rev), v_row.store_id);
  end if;
end $$;

-- ★4 set_store_mine_settings（0160 5aaecb0f → contract_ack の OFF→ON で contract_ack_rev＝now() を併せて保存・他は 1 バイト不変）
CREATE OR REPLACE FUNCTION public.set_store_mine_settings(p_store_id uuid, p_settings jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_store    record;
  v_keys     text[] := array['payslip_visibility','drink_claim','punch_correction_request','ranking','ranking_show_others','reservation_request','shift_request_mode','contract_ack'];
  v_k        text;
  v_v        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_settings jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or p_settings = '{}'::jsonb then raise exception 'bad patch'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★5 追補1-4: owner／manager 自店
  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);
  for v_k in select jsonb_object_keys(p_settings) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;
  -- enum 検証（slide_apply 型＝'bad type' → 値外は 'bad <key>'）
  if p_settings ? 'payslip_visibility' then
    if jsonb_typeof(p_settings->'payslip_visibility') <> 'string' then raise exception 'bad type'; end if;
    v_v := p_settings->>'payslip_visibility';
    if v_v not in ('off','net_only','detail') then raise exception 'bad payslip_visibility'; end if;
  end if;
  if p_settings ? 'drink_claim' then
    if jsonb_typeof(p_settings->'drink_claim') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'drink_claim') not in ('off','on') then raise exception 'bad drink_claim'; end if;
  end if;
  if p_settings ? 'punch_correction_request' then
    if jsonb_typeof(p_settings->'punch_correction_request') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'punch_correction_request') not in ('off','on') then raise exception 'bad punch_correction_request'; end if;
  end if;
  if p_settings ? 'ranking' then
    if jsonb_typeof(p_settings->'ranking') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'ranking') not in ('off','on') then raise exception 'bad ranking'; end if;
  end if;
  if p_settings ? 'ranking_show_others' then
    if jsonb_typeof(p_settings->'ranking_show_others') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'ranking_show_others') not in ('off','on') then raise exception 'bad ranking_show_others'; end if;
  end if;
  if p_settings ? 'reservation_request' then
    if jsonb_typeof(p_settings->'reservation_request') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'reservation_request') not in ('on','off') then raise exception 'bad reservation_request'; end if;
  end if;
  if p_settings ? 'shift_request_mode' then
    if jsonb_typeof(p_settings->'shift_request_mode') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'shift_request_mode') not in ('shift','off_only') then raise exception 'bad shift_request_mode'; end if;
  end if;
  if p_settings ? 'contract_ack' then
    if jsonb_typeof(p_settings->'contract_ack') <> 'boolean' then raise exception 'bad type'; end if;   -- ★5 起票96: T6 契約確認の記録（boolean）
  end if;
  if p_settings ? 'contract_ack' and (p_settings->>'contract_ack')::boolean and coalesce((v_settings->>'contract_ack')::boolean, false) = false then   -- ★4 0162（326 追補7-5／7-6）: OFF→ON の切替時刻＝契約改定 rev（cast_contract_acks.contract_rev と照合・白名単外＝client からは送れない）
    p_settings := p_settings || jsonb_build_object('contract_ack_rev', to_jsonb(clock_timestamp()));   -- ★4 0162（clock_timestamp()＝同一 tx 内で OFF→ON を繰り返しても rev が進む・教訓101）
  end if;   -- ★4 0162
  for v_k in select jsonb_object_keys(p_settings) loop
    v_before := v_before || jsonb_build_object(v_k, v_settings -> v_k);
    v_after  := v_after  || jsonb_build_object(v_k, p_settings -> v_k);
  end loop;
  update public.stores set settings_json = v_settings || p_settings where id = p_store_id;
  perform public.audit_log_write('set_store_mine_settings', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end $function$;

-- ★5 demo_org_reset（0160 a331cdcd → c_wipe／c_load に cast_contract_acks・他は 1 バイト不変）
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_notice_reads','cast_pin','cast_plan',   -- ★8 0160（326-9）: +cast_notice_reads（casts・notices より先に消す）
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','payroll_run_deduction_overrides','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_attentions','daily_pays','payroll_adjustments','payslips',   -- ★6 0159（起票92）: +3 表（overrides は deductions より先に消す＝FK deduction_id）
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','cast_contract_acks','cast_quotas','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','memberships','stores'];   -- ★8 0160: +cast_quotas（casts より先に消す）・★5 0162: +cast_contract_acks（casts より先に消す）
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  c_load constant text[] := array[
    'stores','memberships','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','cast_quotas','cast_contract_acks','staff_shift_wishes','shift_wishes','shift_periods','seats','products',   -- ★8 0160: +cast_quotas（casts の後）・★5 0162: +cast_contract_acks（casts の後）
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_notice_reads','cast_norms',   -- ★8 0160: +cast_notice_reads（casts・notices の後）
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;

-- ★5 grants（新設 5 本＝authenticated＋service_role・再作成 2 本は live の proacl を再掲）
revoke all on function public.set_user_photo_updated_at(uuid) from public, anon;
grant execute on function public.set_user_photo_updated_at(uuid) to authenticated, service_role;
revoke all on function public.clear_cast_photo(uuid) from public, anon;
grant execute on function public.clear_cast_photo(uuid) to authenticated, service_role;
revoke all on function public.clear_user_photo(uuid) from public, anon;
grant execute on function public.clear_user_photo(uuid) to authenticated, service_role;
revoke all on function public.cast_contract_ack_needed() from public, anon;
grant execute on function public.cast_contract_ack_needed() to authenticated, service_role;
revoke all on function public.cast_contract_ack_self() from public, anon;
grant execute on function public.cast_contract_ack_self() to authenticated, service_role;
revoke all on function public.set_store_mine_settings(uuid, jsonb) from public, anon;
grant execute on function public.set_store_mine_settings(uuid, jsonb) to authenticated, service_role;
revoke all on function public.demo_org_reset(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.demo_org_reset(uuid, jsonb, text) to service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('set_store_mine_settings','demo_org_reset','set_user_photo_updated_at','clear_cast_photo','clear_user_photo','cast_contract_ack_needed','cast_contract_ack_self') order by 1;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in ('set_cast_photo_updated_at','notice_mark_read','billing_writable_of') order by 1;
select proname, pg_get_function_identity_arguments(oid), proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in
  ('set_store_mine_settings','demo_org_reset','set_user_photo_updated_at','clear_cast_photo','clear_user_photo','cast_contract_ack_needed','cast_contract_ack_self') order by 1;
select policyname, cmd, strpos(coalesce(qual,'') || coalesce(with_check,''), 'u_') > 0 as users_arm, strpos(coalesce(qual,'') || coalesce(with_check,''), 'is_demo') > 0 as demo_arm
  from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'cast_photos_%' order by 1;
select (select count(*) from information_schema.columns where table_schema='public' and table_name='cast_contract_acks') as ack_cols,
       (select is_nullable from information_schema.columns where table_schema='public' and table_name='users' and column_name='photo_updated_at') as users_photo_nullable,
       (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions,
       (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables;
