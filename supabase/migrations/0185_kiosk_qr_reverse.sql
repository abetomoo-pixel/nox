-- 0185_kiosk_qr_reverse.sql — 裁定423 変更（2026-10-26 Agoora 確定 ⑫）: キオスクの QR の向きを逆に＝キオスクに QR（30 秒で回る・1 回限り）→本人がログイン済みのスマホで読む→そのキオスクが本人の権限で開く（無操作 3 分で戻る）
-- 翻訳元: live pg_get_functiondef（2026-10-26 18:0x・auth_kiosk_operator md5 a867afe8／my_qr_secret ced990fe／kiosk_unlock_qr b4efda98）＋生成器 docs/tmp/gen_0185.cjs（手打ちなし）。
--   新設＝表 kiosk_qr_keys（端末の秘密鍵・deny-all）／kiosk_qr_claims（読み取りの台帳・端末×counter で 1 回限り・deny-all）・RPC 3 本（kiosk_qr_secret＝端末／kiosk_qr_claim＝スマホの本人／kiosk_qr_poll＝端末）。
--   トークン＝'noxq:' || device_id || '.' || TOTP 6 桁（totp_code_of＝0175 の内部関数を流用・±1 窓）。失敗 5 回で 10 分ロック＝memberships.qr_fail_count／qr_locked_until を流用（本人単位）。
--   権限＝PIN の解除（kiosk_unlock）と同じ式: owner／admin／manager・staff は can_register・cast は can_register かつ店の sys_cast_register ≥ 1（OFF＝punch_only を返す＝打刻だけ）。owner は org 内のどの店の端末も可・他は同じ店だけ。
--   無操作 3 分＝auth_kiosk_operator（unlock_method 'qr' は least(180, 店設定)）。旧向き my_qr_secret／kiosk_unlock_qr は本体を retired に（引数・ACL は不変）・memberships.qr_secret を null に。
--   PIN（4〜6 桁）の解除（kiosk_unlock）＝本番で失敗していた 2 点を直す（search_path が 1 つの名前・min(uuid)）＝★0185 ⑤b。totp_code_of も同じ search_path を直す。
-- 検証（Success の後）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ① 表 kiosk_qr_keys（端末の QR の秘密鍵＝端末自身が kiosk_qr_secret で読む・deny-all） ═══
create table if not exists public.kiosk_qr_keys (
  device_id  uuid primary key references public.kiosk_devices(id),
  secret_hex text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
alter table public.kiosk_qr_keys enable row level security;
-- policy 0 本（deny-all＝RPC 専任）
revoke all on table public.kiosk_qr_keys from public, anon, authenticated;
comment on table public.kiosk_qr_keys is '★0185（裁定423 変更）: キオスクに表示する QR の秘密鍵（hex 20 byte・TOTP 30 秒）。端末が kiosk_qr_secret で読み、kiosk_qr_claim が照合する';

-- ═══ ② 表 kiosk_qr_claims（読み取りの台帳＝端末×counter で 1 回限り・deny-all） ═══
create table if not exists public.kiosk_qr_claims (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  device_id     uuid not null references public.kiosk_devices(id),
  counter       bigint not null,
  membership_id uuid not null references public.memberships(id),
  session_id    uuid references public.kiosk_sessions(id),
  claimed_at    timestamptz not null default now(),
  opened_at     timestamptz
);
create unique index if not exists kiosk_qr_claims_device_counter on public.kiosk_qr_claims (device_id, counter);
create index if not exists kiosk_qr_claims_pending on public.kiosk_qr_claims (device_id, claimed_at desc) where opened_at is null;
alter table public.kiosk_qr_claims enable row level security;
-- policy 0 本（deny-all＝RPC 専任）
revoke all on table public.kiosk_qr_claims from public, anon, authenticated;
comment on table public.kiosk_qr_claims is '★0185（裁定423 変更）: キオスクの QR をスマホで読んだ記録。(device_id, counter) の一意＝同じ QR は 1 回だけ。opened_at＝キオスクが開いた時刻';

-- ═══ ③ kiosk_qr_secret（端末＝自分の QR の秘密鍵。無ければ作る・p_rotate で作り直す） ═══
CREATE OR REPLACE FUNCTION public.kiosk_qr_secret(p_rotate boolean default false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device record; v_sec text;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  select q.secret_hex into v_sec from public.kiosk_qr_keys q where q.device_id = v_device.id;
  if v_sec is null or p_rotate then
    v_sec := encode(gen_random_bytes(20), 'hex');
    insert into public.kiosk_qr_keys (device_id, secret_hex) values (v_device.id, v_sec)
      on conflict (device_id) do update set secret_hex = excluded.secret_hex, rotated_at = now();
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
    values (v_device.org_id, v_device.store_id, null, 'kiosk_qr_secret', 'kiosk_devices:' || v_device.id::text, null,
            jsonb_build_object('kiosk_device_id', v_device.id, 'rotated', coalesce(p_rotate, false)), null);
  end if;
  return jsonb_build_object('device_id', v_device.id, 'secret_hex', v_sec, 'step', 30);
end $function$;
revoke execute on function public.kiosk_qr_secret(boolean) from public, anon;
grant execute on function public.kiosk_qr_secret(boolean) to authenticated;

-- ═══ ④ kiosk_qr_claim（スマホの本人＝キオスクの QR を読んで、そのキオスクを自分の権限で開く） ═══
CREATE OR REPLACE FUNCTION public.kiosk_qr_claim(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_mid uuid := public.auth_membership_id(); v_device record; v_m record; v_key text; v_cnt bigint; v_hit bigint; v_code text;
  v_sys int; v_cid uuid; v_sid uuid; v_store_name text;
begin
  if public.auth_org_id() is null or v_mid is null then raise exception 'forbidden'; end if;
  if p_token is null or p_token !~ '^noxq:[0-9a-f-]{36}\.[0-9]{6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  select k.* into v_device from public.kiosk_devices k
   where k.id = substring(p_token from 6 for 36)::uuid and k.is_active and k.purpose = 'register';
  if not found or v_device.org_id <> public.auth_org_id() then return jsonb_build_object('ok', false, 'reason', 'wrong_token'); end if;   -- 他 org の端末は存在を明かさない
  select m.id, m.user_id, m.role, m.store_id, m.can_register, m.qr_fail_count, m.qr_locked_until, u.name as user_name into v_m
    from public.memberships m join public.users u on u.id = m.user_id
   where m.id = v_mid and m.is_active and u.is_active;
  if v_m.id is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' and v_m.store_id <> v_device.store_id then return jsonb_build_object('ok', false, 'reason', 'other_store'); end if;
  v_sys := coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = v_device.store_id), 0);
  if v_m.role not in ('owner','admin','manager','staff','cast') then return jsonb_build_object('ok', false, 'reason', 'no_permission'); end if;
  if v_m.role = 'cast' and not (coalesce(v_m.can_register, false) and v_sys >= 1) then return jsonb_build_object('ok', false, 'reason', 'punch_only'); end if;   -- キャストのレジ操作 OFF＝打刻だけ
  if v_m.role = 'staff' and not coalesce(v_m.can_register, false) then return jsonb_build_object('ok', false, 'reason', 'no_permission'); end if;
  if v_m.qr_locked_until is not null and v_m.qr_locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_m.qr_locked_until); end if;
  select q.secret_hex into v_key from public.kiosk_qr_keys q where q.device_id = v_device.id;
  if v_key is null then return jsonb_build_object('ok', false, 'reason', 'wrong_token'); end if;
  v_cnt := floor(extract(epoch from now()) / 30)::bigint; v_code := right(p_token, 6);
  v_hit := case v_code when public.totp_code_of(v_key, v_cnt) then v_cnt when public.totp_code_of(v_key, v_cnt - 1) then v_cnt - 1 when public.totp_code_of(v_key, v_cnt + 1) then v_cnt + 1 else null end;
  if v_hit is null then
    update public.memberships set qr_fail_count = qr_fail_count + 1,
           qr_locked_until = case when qr_fail_count + 1 >= 5 then now() + interval '10 minutes' else qr_locked_until end
     where id = v_m.id;
    return jsonb_build_object('ok', false, 'reason', 'wrong_token');   -- 期限切れ（±1 窓の外）も同じ
  end if;
  insert into public.kiosk_qr_claims (org_id, store_id, device_id, counter, membership_id)
  values (v_device.org_id, v_device.store_id, v_device.id, v_hit, v_m.id)
  on conflict (device_id, counter) do nothing
  returning id into v_cid;
  if v_cid is null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;   -- 1 回限り
  update public.memberships set qr_fail_count = 0 where id = v_m.id and qr_fail_count <> 0;
  update public.kiosk_sessions set ended_at = now(), end_reason = 'relogin' where device_id = v_device.id and ended_at is null;
  insert into public.kiosk_sessions (org_id, store_id, device_id, membership_id, operator_user_id, started_at, last_seen_at, token_hash, unlock_method)
  values (v_device.org_id, v_device.store_id, v_device.id, v_m.id, v_m.user_id, now(), now(), encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), 'qr')
  returning id into v_sid;
  update public.kiosk_qr_claims set session_id = v_sid where id = v_cid;
  perform public.audit_log_write('kiosk_qr_claim', 'kiosk_sessions:' || v_sid::text, null,
    jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_m.id, 'unlock_method', 'qr', 'counter', v_hit), v_device.store_id);
  select st.name into v_store_name from public.stores st where st.id = v_device.store_id;
  return jsonb_build_object('ok', true, 'store_name', v_store_name, 'device_label', v_device.label, 'role', v_m.role, 'name', v_m.user_name);
end $function$;
revoke execute on function public.kiosk_qr_claim(text) from public, anon;
grant execute on function public.kiosk_qr_claim(text) to authenticated;

-- ═══ ⑤ kiosk_qr_poll（端末＝読まれたら本人の解除を受け取る。読まれていなければ pending） ═══
CREATE OR REPLACE FUNCTION public.kiosk_qr_poll()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device record; v_c record; v_idle int;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  select c.id, c.session_id, c.counter, c.membership_id, s.operator_user_id, m.role, u.name as user_name into v_c
    from public.kiosk_qr_claims c
    join public.kiosk_sessions s on s.id = c.session_id
    join public.memberships m on m.id = c.membership_id
    join public.users u on u.id = m.user_id
   where c.device_id = v_device.id and c.opened_at is null and s.ended_at is null and c.claimed_at > now() - interval '2 minutes'
   order by c.claimed_at desc limit 1;
  if v_c.id is null then return jsonb_build_object('ok', false, 'reason', 'pending'); end if;
  update public.kiosk_qr_claims set opened_at = now() where id = v_c.id;
  update public.kiosk_sessions set last_seen_at = now() where id = v_c.session_id;
  insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values (v_device.org_id, v_device.store_id, v_c.operator_user_id, 'kiosk_qr_open', 'kiosk_sessions:' || v_c.session_id::text, null,
          jsonb_build_object('kiosk_device_id', v_device.id, 'membership_id', v_c.membership_id, 'counter', v_c.counter), null);
  v_idle := least(180, coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
  return jsonb_build_object('ok', true, 'session_id', v_c.session_id, 'membership_id', v_c.membership_id, 'name', v_c.user_name, 'role', v_c.role,
                            'idle_sec', v_idle, 'unlock_method', 'qr', 'counter', v_c.counter);
end $function$;
revoke execute on function public.kiosk_qr_poll() from public, anon;
grant execute on function public.kiosk_qr_poll() to authenticated;

-- ═══ ⑤b 本番の不具合の直し（0175 ★27 の 4 本の search_path が「'public, extensions'」＝1 つの名前になっていた＝pgcrypto が見つからない） ═══
--   kiosk_unlock（PIN だけの解除）は本番で常に失敗していた（min(uuid) も PG に無い）＝live 逐語＋2 か所。totp_code_of（hmac）は QR の照合に使う。ACL は create or replace で不変。
CREATE OR REPLACE FUNCTION public.kiosk_unlock(p_pin text, p_membership_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補・R-7）: レジ端末の解除＝誰かを選ばず PIN だけで本人を特定（staff_pin＝owner／manager／staff can_register／cast can_register かつ店のキャストのレジ使用 ≥1）。
--   一致 0＝wrong_pin（人を特定できないので失敗回数は数えない）・一致 2 人以上で p_membership_id なし＝ambiguous（候補の名前を返す）・特定できたら kiosk_login（失敗回数・ロック・セッション・audit は従来のまま）
declare
  v_device record; v_n int; v_mid uuid; v_cands jsonb;
begin
  select k.* into v_device from public.kiosk_devices k where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'register';
  if not found then raise exception 'forbidden'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;
  select count(*), (array_agg(m.id))[1], jsonb_agg(jsonb_build_object('membership_id', m.id, 'name', u.name, 'role', m.role))
    into v_n, v_mid, v_cands
    from public.staff_pin sp
    join public.memberships m on m.id = sp.membership_id
    join public.users u on u.id = m.user_id
   where sp.store_id = v_device.store_id and m.is_active and u.is_active
     and (sp.locked_until is null or sp.locked_until < now())
     and (m.role in ('owner','admin','manager') or (m.role = 'staff' and m.can_register)
          or (m.role = 'cast' and m.can_register and coalesce((select (st.settings_json->>'sys_cast_register')::int from public.stores st where st.id = m.store_id), 0) >= 1))
     and sp.pin_hash = crypt(p_pin, sp.pin_hash)
     and (p_membership_id is null or m.id = p_membership_id);
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'wrong_pin'); end if;
  if v_n > 1 then return jsonb_build_object('ok', false, 'reason', 'ambiguous', 'candidates', v_cands); end if;
  return public.kiosk_login(v_mid, p_pin) || jsonb_build_object('idle_sec', coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = v_device.store_id), 900));
end $function$;

CREATE OR REPLACE FUNCTION public.totp_code_of(p_secret_hex text, p_counter bigint)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★27 0175 v2（裁定423 候補）: RFC 6238／4226＝HMAC-SHA1(secret, counter 8 byte BE) の動的切り出し→6 桁。client（Web Crypto）と同じ式
declare
  v_h bytea; v_off int; v_code bigint;
begin
  v_h := hmac(decode(lpad(to_hex(p_counter), 16, '0'), 'hex'), decode(p_secret_hex, 'hex'), 'sha1');
  v_off := get_byte(v_h, 19) & 15;
  v_code := ((get_byte(v_h, v_off) & 127) << 24) | (get_byte(v_h, v_off + 1) << 16) | (get_byte(v_h, v_off + 2) << 8) | get_byte(v_h, v_off + 3);
  return lpad((v_code % 1000000)::text, 6, '0');
end $function$;

-- ═══ ⑥ auth_kiosk_operator（live 逐語＋QR の無操作 3 分） ═══
CREATE OR REPLACE FUNCTION public.auth_kiosk_operator()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     and s.last_seen_at > now() - make_interval(secs => case when s.unlock_method = 'qr'   -- ★0185（裁定423 変更）: QR で開いた解除は無操作 3 分（店設定が短ければ店設定）
           then least(180, coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = k.store_id), 900))
           else coalesce((select (st.settings_json->>'kiosk_idle_sec')::int from public.stores st where st.id = k.store_id), 900) end);   -- ★27 0175 v2（裁定423 候補）: 無操作秒数＝店設定（既定 900＝従来 15 分）
  if v_sid is null then return null; end if;
  if v_seen < now() - interval '60 seconds' then
    update public.kiosk_sessions set last_seen_at = now() where id = v_sid;
  end if;
  return v_user;
end $function$;

-- ═══ ⑦ 旧向きの撤去（my_qr_secret／kiosk_unlock_qr＝本体を retired に・引数と ACL は create or replace で不変） ═══
CREATE OR REPLACE FUNCTION public.my_qr_secret(p_rotate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★0185（裁定423 変更・Agoora 確定 10/26 ⑫）: 旧向き（スマホに QR・キオスクのカメラで読む）は撤去＝呼ばれたら retired。新しい向き＝kiosk_qr_secret／kiosk_qr_claim／kiosk_qr_poll
begin
  raise exception 'retired: kiosk QR direction changed (0185)';
end $function$;
CREATE OR REPLACE FUNCTION public.kiosk_unlock_qr(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- ★0185（裁定423 変更・Agoora 確定 10/26 ⑫）: 旧向き（スマホに QR・キオスクのカメラで読む）は撤去＝呼ばれたら retired。新しい向き＝kiosk_qr_secret／kiosk_qr_claim／kiosk_qr_poll
begin
  raise exception 'retired: kiosk QR direction changed (0185)';
end $function$;
update public.memberships set qr_secret = null where qr_secret is not null;
comment on column public.memberships.qr_secret is '★0185（裁定423 変更）: 旧向き（スマホに QR）の秘密鍵＝撤去で未使用（null）。qr_fail_count／qr_locked_until は新しい向き（kiosk_qr_claim）の失敗回数に流用';

commit;
-- ===== verify =====
-- select 'nox-project-proof' as k, count(*)::text as v from public.orgs
-- union all select 'tables rls', string_agg(c.relname || ':' || c.relrowsecurity::text, ',' order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('kiosk_qr_keys','kiosk_qr_claims')
-- union all select 'table grants anon/authenticated', count(*)::text from information_schema.role_table_grants where table_schema='public' and table_name in ('kiosk_qr_keys','kiosk_qr_claims') and grantee in ('anon','authenticated')
-- union all select 'rpc ' || proname, coalesce(proacl::text, '(null)') from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_qr_secret','kiosk_qr_claim','kiosk_qr_poll')
-- union all select 'retired ' || proname, (position('retired: kiosk QR direction changed (0185)' in prosrc) > 0)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('my_qr_secret','kiosk_unlock_qr')
-- union all select 'operator qr 180', (position('least(180' in prosrc) > 0)::text from pg_proc where pronamespace='public'::regnamespace and proname='auth_kiosk_operator'
-- union all select 'search_path fixed', (count(*) = 0)::text from pg_proc where pronamespace='public'::regnamespace and array_to_string(proconfig, ',') like '%"public, extensions"%'
-- union all select 'qr_secret left', count(qr_secret)::text from public.memberships;
-- ===== end 0185 =====
