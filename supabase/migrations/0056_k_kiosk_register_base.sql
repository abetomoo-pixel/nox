-- 0056_k_kiosk_register_base.sql
-- レジ用キオスク K（裁定11・案A＝F4a 型拡張・N1-b 最終残件）＝基盤層（1/2）。
--   本 mig＝端末認証層のみ（新テーブル2・purpose 列・index 差し替え・ヘルパー・PIN セッション RPC 群・
--   打刻 device 締め）。★会計RPC への kiosk 腕（10本＋周辺2本＋audit_log_write）は 0057（arms 層）で別 mig
--   ＝本 mig 単独適用時、register kiosk は「ログインできるが何も操作できない」不活性状態（fail-closed 段階導入）。
--   checks/check_lines/payments/money 計算は本 mig で 1 文字も触れない（3ゲート pay83/receipt52/payroll112 不変）。
--
-- 設計正本＝裁定台帳 裁定11（Agoora 承認 2026-07-21・確定8点）：
--  ①check_void に kiosk 腕を足さない（0057 でも対象外）②print_enqueue/bottle_keep_register は足す・
--  approval_request 足さない・drink_claim 対象外（0057）③staff_pin キー粒度＝membership 単位（can_register と
--  同一キー）④idle timeout＝セッション継続・15分失効・会計毎の再PIN なし（値は調整可＝下の interval 2箇所）
--  ⑤打刻 device も purpose='punch' 限定に締める（防御深度・F4a verify 回帰確認＝実装条件）⑥kiosk_sessions＝
--  専用テーブル（device 台帳に可変状態を混ぜない）⑦B1/B2 を kiosk に出す（0057 の腕対象に含む）
--  ＋PIN 桁数＝cast_pin 現行（4桁）に揃える・PIN 重複許容（操作担当は membership 選択で確定・PIN は第2要素）。
--
-- 設計要点（裁定11 逐語準拠）：
--  - PIN セッション方式＝kiosk_sessions に operator_user_id を保持（BANZEN 2パス化回避・PIN はログイン1箇所で
--    照合・会計RPC は raise のまま＝壊れ伝票の芽なし）。
--  - 会計 RPC の単一判定点＝auth_kiosk_register_store_id()＋auth_kiosk_operator() の2ヘルパー（0057 が参照）。
--  - payments.by_user_id NOT NULL 破れは operator（users.id）経由で解消（0057 の actor coalesce）。
--  - kiosk_devices unique index 差し替え（1店1 → 1店1×purpose）＝単一トランザクション内。
--
-- ★裁定11 明示リストからの追加2点（相談役レビューで採否確認）：
--  (a) kiosk_operator_list＝ログイン画面の操作担当 membership 選択肢（kiosk_cast_list の写経形・名前/role/
--      has_pin のみの最小開示）。「操作担当は membership 選択で確定」の UI 前提＝これ無しでログイン画面が
--      成立しないため追加。
--  (b) kiosk_logout＝操作担当の明示交代/離席（セッション lifecycle の完結・状態冪等）。
--  ※裁定11 命名列挙は kiosk_login・set_staff_pin の2本。指示書の「新RPC3」との差は上記で吸収（4本起草）。
--
-- ★次 mig（0057 arms 層）への申し送り（本 mig の範囲外・起草済み設計）：
--  - audit_log_write が冒頭 auth_org_id() null guard を持つ（live 実測）＝kiosk 経由の会計RPC が監査段で
--    raise→全 rollback するため、0057 で org/actor の kiosk 解決（coalesce）を追補する（裁定11 明示リスト外の
--    必須発見＝レビュー明示点）。
--  - 会計RPC 12本の腕は「null guard 二重化・org 解決 v_org＝coalesce(auth_org_id(), auth_kiosk_org_id())・
--    gate 第5腕・actor coalesce」の4点のみ＝money 計算逐語。
--
-- 写経元（2026-07-22 live prosrc・pg_get_functiondef 起点・記憶再構成なし）：
--  - staff_pin＝cast_pin 逐語型（PK を cast_id→membership_id へ・列/CHECK/default 同一）。
--  - kiosk_login の PIN 規律＝kiosk_punch 逐語（形式不正はカウント外・5失敗15分ロック・失敗時 audit 直 INSERT
--    actor null・成功時カウンタ復元）。set_staff_pin＝set_cast_pin 逐語（bf crypt・upsert・reset）。
--  - auth_kiosk_register_store_id＝auth_kiosk_store_id 逐語＋purpose 腕。kiosk_operator_list＝kiosk_cast_list 逐語形。
--  - kiosk_provision/kiosk_punch/auth_kiosk_store_id＝live 全文写経＋purpose 腕のみ追加。
--
-- 教訓B（verify 波及の事前棚卸し・実測済み）：
--  - anon-guard 段35a の kiosk_provision probe は named-args 3引数呼び＝4引数化（p_purpose default 'punch'）でも
--    default が埋めて同一解決＝probe 改修不要。旧3引数は本 mig で drop＝オーバーロード無し（G20 roleOf 混線なし）。
--  - anon-guard 段35 runtime（F4a 実 device 生涯試験）＝provision 既定 purpose='punch'・kiosk_punch/
--    auth_kiosk_store_id の締めは punch device に恒真＝全 assert 緑のまま（確定⑤ の回帰確認が verify:f0 で自動化済）。
--  - verify-nox-rls に kiosk 参照ゼロ（grep 実測）。G4/G4b（HELPERS）は既存2ヘルパーの body 変更に非感応。
--  - verify 追加フェーズ（適用後）：TABLES へ staff_pin/kiosk_sessions（G5 .length 追従）・anon SELECT DENIED へ
--    2表（staff_pin は PK=membership_id の列名マップ要）・段35a へ新4 RPC＋新2ヘルパーの BLOCKED・
--    G30 新設（新 RPC/ヘルパー ACL・2表 policy 0本・purpose CHECK 逐語・index 差し替え逐語・provision 4引数一意）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 0) 貼り先証明（1行返れば正・エラー/0件なら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) 新テーブル2: RLS 有効・policy 0本（deny-all）・grant 0（anon/authenticated/public）
--   select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace
--     and relname in ('staff_pin','kiosk_sessions') order by relname;
--   select tablename, count(*) from pg_policies where schemaname='public'
--     and tablename in ('staff_pin','kiosk_sessions') group by tablename;  -- 期待 0行
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name in ('staff_pin','kiosk_sessions')
--       and grantee in ('anon','authenticated','public');  -- 期待 0行
--   -- 2) kiosk_devices.purpose 列＋CHECK＋既存行 backfill='punch'
--   select column_name, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name='kiosk_devices' and column_name='purpose';
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid='public.kiosk_devices'::regclass and conname='kiosk_devices_purpose_check';
--   select purpose, count(*) from public.kiosk_devices group by purpose;  -- 既存は全て punch
--   -- 3) index 差し替え（旧不在・新存在の逐語）
--   select indexname, indexdef from pg_indexes where schemaname='public' and tablename='kiosk_devices';
--   --   期待: kiosk_devices_one_active_per_store_idx 不在・
--   --         CREATE UNIQUE INDEX kiosk_devices_one_active_per_store_purpose_idx
--   --           ON public.kiosk_devices USING btree (store_id, purpose) WHERE is_active
--   -- 4) kiosk_provision＝4引数1本のみ（旧3引数 drop 済＝オーバーロード無し）
--   select pg_get_function_identity_arguments(oid) from pg_proc
--     where pronamespace='public'::regnamespace and proname='kiosk_provision';
--   -- 5) 打刻締め（確定⑤）: kiosk_punch / auth_kiosk_store_id の prosrc に purpose='punch'
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_punch','auth_kiosk_store_id')
--     and pg_get_functiondef(oid) ilike '%purpose = ''punch''%';  -- 期待 2行
--   -- 6) 新 RPC 4本＋新ヘルパー2本の prosrc/proacl（承認版と一字照合・authenticated 保持・anon 不在）
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_login','kiosk_logout','kiosk_operator_list','set_staff_pin',
--                     'auth_kiosk_register_store_id','auth_kiosk_operator') order by proname;
--   -- 7) ★money-core 非改修の証明: check_*/payments 系は本 mig に不収載（prosrc 不変＝ハッシュ照合推奨）
--   -- 8) F4a 回帰: verify:f0（anon-guard 段35 が punch 経路の実 device 生涯試験を自動実行）

begin;

-- ══════════════════════════════════════════════════════════════
-- ① kiosk_devices.purpose 列（'punch'/'register'・既存行は punch へ backfill＝F4a 現状維持）
-- ══════════════════════════════════════════════════════════════
alter table public.kiosk_devices
  add column if not exists purpose text not null default 'punch'
  check (purpose in ('punch','register'));

-- index 差し替え（裁定11: 1店1 → 1店1×purpose・単一トランザクション内）
drop index if exists public.kiosk_devices_one_active_per_store_idx;
create unique index if not exists kiosk_devices_one_active_per_store_purpose_idx
  on public.kiosk_devices (store_id, purpose) where is_active;

-- ══════════════════════════════════════════════════════════════
-- ② staff_pin（操作担当 PIN・membership 単位＝確定③・cast_pin 逐語型・deny-all）
--    PIN 重複許容（unique なし＝確定＋・操作担当は membership 選択で確定・PIN は第2要素）。
-- ══════════════════════════════════════════════════════════════
create table if not exists public.staff_pin (
  membership_id uuid primary key references public.memberships(id),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  pin_hash      text not null,
  fail_count    int  not null default 0 check (fail_count >= 0),
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table public.staff_pin enable row level security;
-- policy 0本（deny-all＝RPC 専任・kiosk_devices/cast_pin 同型）
revoke all on table public.staff_pin from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ kiosk_sessions（PIN セッション台帳＝確定⑥・device 台帳に可変状態を混ぜない・deny-all）
--    1device 1active＝部分ユニーク（ended_at null）が物理 backstop。idle 15分＝確定④（読取側で判定）。
-- ══════════════════════════════════════════════════════════════
create table if not exists public.kiosk_sessions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id),
  store_id         uuid not null references public.stores(id),
  device_id        uuid not null references public.kiosk_devices(id),
  membership_id    uuid not null references public.memberships(id),
  operator_user_id uuid not null references public.users(id),
  started_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  ended_at         timestamptz
);
create unique index if not exists kiosk_sessions_one_active_per_device
  on public.kiosk_sessions (device_id) where ended_at is null;

alter table public.kiosk_sessions enable row level security;
-- policy 0本（deny-all＝RPC 専任）
revoke all on table public.kiosk_sessions from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ auth_kiosk_store_id 締め（確定⑤・F4a 打刻経路専用へ＝purpose='punch' 腕のみ追加・他は live 逐語）
--    参照元は kiosk_cast_list のみ（live 実測・policy 参照ゼロ）＝影響面は打刻 UI に閉じる。
--    create or replace＝ACL は PostgreSQL 仕様で保持（再 grant 不要＝mig0053 と同根拠）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.auth_kiosk_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select k.store_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch'
$$;

-- auth_kiosk_org_id は無改修（purpose 非依存の device org 識別＝0057 の org 解決 coalesce が register 経由で使う）。

-- ══════════════════════════════════════════════════════════════
-- ⑤ auth_kiosk_register_store_id（新ヘルパー1・register device の店識別＝0057 の gate 第5腕の単一判定点）
--    auth_kiosk_store_id 逐語＋purpose='register'。セッション有無は見ない（device 識別と操作者識別の分離）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.auth_kiosk_register_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select k.store_id from public.kiosk_devices k
  where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register'
$$;
revoke execute on function public.auth_kiosk_register_store_id() from public, anon;
grant  execute on function public.auth_kiosk_register_store_id() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑥ auth_kiosk_operator（新ヘルパー2・有効セッションの操作者 users.id＝0057 の actor coalesce の単一解決点）
--    idle 15分（確定④・値は調整可＝ここ1箇所）。滑走 idle＝touch は 60秒スロットル（書込増幅と
--    行ロック窓を抑える・15分判定の精度±1分）。VOLATILE（touch を内包）・非 kiosk 呼び出しは
--    device 不一致で 0行＝null（無害）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.auth_kiosk_operator()
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_sid  uuid;
  v_user uuid;
  v_seen timestamptz;
begin
  select s.id, s.operator_user_id, s.last_seen_at into v_sid, v_user, v_seen
    from public.kiosk_sessions s
    join public.kiosk_devices k on k.id = s.device_id
   where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register'
     and s.ended_at is null
     and s.last_seen_at > now() - interval '15 minutes';
  if v_sid is null then return null; end if;
  if v_seen < now() - interval '60 seconds' then
    update public.kiosk_sessions set last_seen_at = now() where id = v_sid;
  end if;
  return v_user;
end $$;
revoke execute on function public.auth_kiosk_operator() from public, anon;
grant  execute on function public.auth_kiosk_operator() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑦ kiosk_provision 置換（4引数化＝p_purpose 追加・旧3引数 drop＝オーバーロード封じ G20/G22 教訓）
--    既定 'punch'＝既存 route/verify の3引数 named-args 呼びは default が埋めて不変（段35a probe 実測）。
--    1店1×purpose（部分ユニークが物理 backstop）。他は live 逐語。
-- ══════════════════════════════════════════════════════════════
drop function if exists public.kiosk_provision(uuid, uuid, text);
create or replace function public.kiosk_provision(
  p_auth_user_id uuid,
  p_store_id     uuid,
  p_label        text,
  p_purpose      text default 'punch'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  if p_purpose is null or p_purpose not in ('punch','register') then raise exception 'bad purpose'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then
    raise exception 'bad target';
  end if;
  -- 1店1kiosk×purpose（部分ユニークが物理 backstop）
  if exists (select 1 from public.kiosk_devices k
             where k.store_id = p_store_id and k.purpose = p_purpose and k.is_active) then
    raise exception 'already provisioned';
  end if;

  insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, purpose)
  values (v_org, p_store_id, p_auth_user_id, nullif(trim(coalesce(p_label,'')), ''), p_purpose)
  returning id into v_id;

  perform public.audit_log_write('kiosk_provision', 'kiosk_devices:' || v_id::text,
    null, (select to_jsonb(k) from public.kiosk_devices k where k.id = v_id), p_store_id);
  return v_id;
end $$;
revoke execute on function public.kiosk_provision(uuid, uuid, text, text) from public, anon;
grant  execute on function public.kiosk_provision(uuid, uuid, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑧ kiosk_punch 締め（確定⑤・device lookup に purpose='punch' 腕のみ追加・他は live 全文逐語）
--    create or replace＝ACL 保持。F4a 回帰は anon-guard 段35（実 device 生涯試験）が自動確認。
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（UI は4桁パッド前提・総当たりは4桁一致のみ計上）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 対象 cast は自店 active のみ（他店/他 org は not_found＝存在オラクル封じ）
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.store_id = v_device.store_id and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.* into v_pin from public.cast_pin p
    where p.cast_id = p_cast_id
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
    if v_newfail >= 5 then
      update public.cast_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where cast_id = p_cast_id;
    else
      update public.cast_pin
         set fail_count = v_newfail, updated_at = now()
       where cast_id = p_cast_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
       'cast_pin:' || p_cast_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 盲目記録 INSERT（punch_self 逐語型・source='kiosk'）
  update public.cast_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where cast_id = p_cast_id;

  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk')
  returning id into v_punch_id;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_punch',
     'punches:' || v_punch_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', p_cast_id,
                        'type', p_type, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'punched_at', now());
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑨ set_staff_pin（PIN 設定・set_cast_pin 逐語型＝bf crypt・upsert・reset・owner/manager 自店）
--    対象＝操作担当になり得る membership のみ（owner/manager/staff(can_register)・cast は対象外＝
--    kiosk は cast 不使用の構造）。PIN 重複許容（確定＋・unique 検査なし）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_staff_pin(p_membership_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','manager') or (v_mem.role = 'staff' and v_mem.can_register)) then
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $$;
revoke execute on function public.set_staff_pin(uuid, text) from public, anon;
grant  execute on function public.set_staff_pin(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑩ kiosk_operator_list（ログイン画面の操作担当選択肢＝kiosk_cast_list 逐語形・最小開示）
--    register device のみ（helper が punch/非device に null → 0行＝fail-closed）。
--    開示は name/role/has_pin のみ（金額・連絡先・権限詳細は返さない）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_operator_list()
returns table(membership_id uuid, user_name text, role text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select m.id, u.name, m.role,
         exists (select 1 from public.staff_pin p where p.membership_id = m.id)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where m.store_id = public.auth_kiosk_register_store_id()
    and m.is_active and u.is_active
    and (m.role in ('owner','manager') or (m.role = 'staff' and m.can_register))
  order by u.name
$$;
revoke execute on function public.kiosk_operator_list() from public, anon;
grant  execute on function public.kiosk_operator_list() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑪ kiosk_login（PIN 照合→セッション発行・kiosk_punch の PIN 規律逐語・register device 限定）
--    成功＝既存セッションを閉じて差し替え（操作者交代・1device 1active は部分ユニークが backstop）。
--    失敗系は jsonb 返却（bad_pin はカウント外・wrong_pin 5回で15分ロック・not_found＝存在オラクル封じ）。
--    audit＝失敗 actor null／成功 actor=operator（PIN で本人性確立済み）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_login(p_membership_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_device  public.kiosk_devices;
  v_mem     record;
  v_pin     public.staff_pin;
  v_ip      text;
  v_sid     uuid;
  v_newfail integer;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  -- 形式不正 PIN は失敗カウント外（kiosk_punch 逐語・PIN 桁数＝cast_pin 現行4桁に揃える＝確定＋）
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  -- 操作担当候補＝自店 active membership・owner/manager/staff(can_register)（cast は kiosk 不使用・
  -- 他店/他 org は not_found＝存在オラクル封じ）
  select m.id, m.user_id, m.role, u.name as user_name into v_mem
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = p_membership_id and m.store_id = v_device.store_id and m.is_active
     and u.is_active
     and (m.role in ('owner','manager') or (m.role = 'staff' and m.can_register));
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
    if v_newfail >= 5 then
      update public.staff_pin
         set fail_count = 0, locked_until = now() + interval '15 minutes', updated_at = now()
       where membership_id = p_membership_id;
    else
      update public.staff_pin
         set fail_count = v_newfail, updated_at = now()
       where membership_id = p_membership_id;
    end if;
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, null, 'kiosk_login',
       'staff_pin:' || p_membership_id::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                          'result', 'wrong_pin', 'fail_count', v_newfail,
                          'locked', v_newfail >= 5),
       v_ip);
    if v_newfail >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'locked',
                                'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  -- PIN 一致: カウンタ復元 → 既存セッションを閉じて差し替え → 新セッション発行
  update public.staff_pin
     set fail_count = 0, locked_until = null, updated_at = now()
   where membership_id = p_membership_id;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null;

  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id)
  values (v_device.org_id, v_device.store_id, v_device.id, p_membership_id, v_mem.user_id)
  returning id into v_sid;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, v_mem.user_id, 'kiosk_login',
     'kiosk_sessions:' || v_sid::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', p_membership_id,
                        'operator_user_id', v_mem.user_id, 'result', 'ok'),
     v_ip);

  return jsonb_build_object('ok', true, 'session_id', v_sid,
                            'operator_name', v_mem.user_name, 'role', v_mem.role,
                            'idle_minutes', 15);
end $$;
revoke execute on function public.kiosk_login(uuid, text) from public, anon;
grant  execute on function public.kiosk_login(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑫ kiosk_logout（操作担当の明示交代/離席・状態冪等＝active 無しは no-op・register device 限定）
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_logout()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_device public.kiosk_devices;
  v_sid    uuid;
  v_op     uuid;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;

  update public.kiosk_sessions set ended_at = now()
   where device_id = v_device.id and ended_at is null
  returning id, operator_user_id into v_sid, v_op;

  if v_sid is not null then
    insert into public.audit_logs
      (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values
      (v_device.org_id, v_device.store_id, v_op, 'kiosk_logout',
       'kiosk_sessions:' || v_sid::text, null,
       jsonb_build_object('kiosk_device_id', v_device.id), null);
  end if;
end $$;
revoke execute on function public.kiosk_logout() from public, anon;
grant  execute on function public.kiosk_logout() to authenticated;

commit;
