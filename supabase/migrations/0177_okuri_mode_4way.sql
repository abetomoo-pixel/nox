-- 0177_okuri_mode_4way.sql — 裁定414（S-4 送りの 4 方式・2026-10-21 便 S 起草・適用は Agoora 手貼り＝P・流していない）
-- 翻訳元: live（nox 本番 ref hiqbfa…・2026-10-21T10:10:54.168Z 読取＝docs/tmp/0177_live.json・pg_get_functiondef）に★差分（生成器 docs/tmp/gen_0177.mjs・手打ちなし）。
--   ★1 transport.mode text not null default 'actual' check in ('actual','flat','store')＝記録時の店の方式（既存 2 行は既定で 'actual'＝実費）
--   ★2 set_store_okuri_mode: 受理値 ('flat','actual','store','none')（既定の読み方 coalesce(…,'flat') は不変）
--   ★3 transport_issue／transport_issue_bulk／transport_issue_self／kiosk_transport_issue: 'none' だけ 'okuri none' で拒否（不正値は 'bad okuri mode'）・他の 3 方式は insert に mode を刻む・audit after_json に mode
--   ★4 okuri_default_of: out 打刻で p_okuri を聞く店＝'none' 以外の 3 方式（従来は 'actual' だけ）
--   触らないもの: 既存 flat 店の deductions マスタ（月額固定控除）＝別物のまま・transport_cancel・okuri_today_summary・punch_self／punch_proxy／kiosk_punch（okuri_default_of 経由で効く）・RLS・grant（proacl は変えない＝CREATE OR REPLACE は ACL を保つ）
--   読み分け（client・便 S）: 現金支払＝mode='actual'（「送り立替」）／給与控除＝mode in ('actual','flat')（collect.loadTransport が 'store' を除外）／諸経費＝mode='store'（「送迎費（店負担）」）
-- 検証（Success の後・形で見る）: 末尾 ===== verify ===== の 6 本（貼り先証明・列・CHECK・md5 6 本・proacl・transport の mode 分布）。
-- md5 pin（prosrc・\r 除去・先頭 8 桁）＝写経元: set_store_okuri_mode 71e07a1e・okuri_default_of 434e69d9・transport_issue 7740e3c4・transport_issue_bulk 9d10c990・transport_issue_self 2eebb64f・kiosk_transport_issue 08c5dbc3
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ ★1 列 ═══
alter table public.transport add column if not exists mode text not null default 'actual';
alter table public.transport drop constraint if exists transport_mode_check;
alter table public.transport add constraint transport_mode_check check (mode in ('actual','flat','store'));
comment on column public.transport.mode is '★0177（裁定414）: 記録時の店の送り方式＝actual 実費（現金支払＋控除）／flat 定額（控除のみ）／store 店負担（諸経費・控除なし）。既存行は actual';

-- ═══ ★2 set_store_okuri_mode（71e07a1e） ═══
CREATE OR REPLACE FUNCTION public.set_store_okuri_mode(p_store_id uuid, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_mode is null or p_mode not in ('flat','actual','store','none') then raise exception 'bad mode'; end if;  -- ★0177（裁定414）: 4 方式＝実費 actual／定額 flat／店負担 store／なし none
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_mode}', to_jsonb(p_mode), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_mode', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_mode', v_prev), jsonb_build_object('okuri_mode', p_mode), p_store_id);
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★4 okuri_default_of（434e69d9） ═══
CREATE OR REPLACE FUNCTION public.okuri_default_of(p_store_id uuid, p_type text, p_okuri boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
           when p_okuri is not null then p_okuri
           when p_type = 'out' and coalesce(nullif(trim((select st.settings_json->>'okuri_mode' from public.stores st where st.id = p_store_id)), ''), 'flat') in ('actual','flat','store') then false  -- ★0177（裁定414）: 'none' 以外の 3 方式で聞く
           else null
         end;
$function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★3 transport_issue（7740e3c4） ═══
CREATE OR REPLACE FUNCTION public.transport_issue(p_store_id uuid, p_cast_id uuid, p_amount integer, p_biz_date date, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_cast  record;
  v_mode  text;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- L3' 構造的排他: okuri_mode='actual' の店でのみ実費入力を受理（fail-closed＝flat/未設定/不正は拒否）
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）
  -- paid 期間ガード（凍結済み period に stranded 送りを作らない・incentive_publish 同型）
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_cast from public.casts
    where id = p_cast_id and org_id = public.auth_org_id() and store_id = p_store_id;
  if v_cast.id is null then raise exception 'bad cast'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, mode)   -- ★0177: 記録時の店の方式を刻む
  values (v_store.org_id, p_store_id, p_cast_id, p_amount, p_biz_date, nullif(trim(coalesce(p_note,'')), ''), v_actor, v_mode)
  returning id into v_id;

  perform public.audit_log_write('transport_issue', 'transport:' || v_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'biz_date', p_biz_date, 'mode', v_mode), p_store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★3 transport_issue_bulk（9d10c990） ═══
CREATE OR REPLACE FUNCTION public.transport_issue_bulk(p_store_id uuid, p_items jsonb, p_idem_key uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_cast   record;
  v_mode   text;
  v_actor  uuid;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_item   jsonb;
  v_castid uuid;
  v_amount int;
  v_date   date;
  v_note   text;
  v_idem   uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_idem_key is null then raise exception 'bad idem'; end if;                                                                  -- ★3
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'bad items'; end if;   -- ★3
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- L3' 構造的排他: okuri_mode='actual' の店でのみ実費入力を受理（fail-closed＝flat/未設定/不正は拒否）
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）

  if (select count(*) <> count(distinct e->>'cast_id') from jsonb_array_elements(p_items) e) then raise exception 'duplicate cast'; end if;   -- 裁定304-1 同 cast 2 回以上＝全件失敗
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  for v_item in select * from jsonb_array_elements(p_items) loop                                                                    -- ★3 件ごと
    v_castid := (v_item->>'cast_id')::uuid;
    v_amount := (v_item->>'amount')::int;
    v_date   := (v_item->>'date')::date;
    v_note   := v_item->>'note';
    v_cast   := null;
    if v_amount is null or v_amount <= 0 then raise exception 'bad amount'; end if;
    if v_date is null then raise exception 'bad date'; end if;
    -- paid 期間ガード（凍結済み period に stranded 送りを作らない・incentive_publish 同型）
    if exists (select 1 from public.payroll_runs
               where store_id = p_store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
      raise exception 'paid period';
    end if;
    select id into v_cast from public.casts
      where id = v_castid and org_id = public.auth_org_id() and store_id = p_store_id;
    if v_cast.id is null then raise exception 'bad cast'; end if;
    v_idem := md5(p_idem_key::text || ':' || v_castid::text)::uuid;                                                              -- ★3 各件の idem（302-2）
    select id into v_id from public.transport where store_id = p_store_id and idem_key = v_idem;                                  -- ★3 同キー再送＝既存 id
    if v_id is null then
      insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
      values (v_store.org_id, p_store_id, v_castid, v_amount, v_date, nullif(trim(coalesce(v_note,'')), ''), v_actor, v_idem, v_mode)
      returning id into v_id;
      perform public.audit_log_write('transport_issue_bulk', 'transport:' || v_id::text,
        null, jsonb_build_object('cast_id', v_castid, 'amount', v_amount, 'biz_date', v_date, 'bulk_idem', p_idem_key, 'mode', v_mode), p_store_id);
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★3 transport_issue_self（2eebb64f） ═══
CREATE OR REPLACE FUNCTION public.transport_issue_self(p_punch_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast  uuid;
  v_p     record;
  v_store record;
  v_base  integer;
  v_mode  text;    -- ★0177（裁定414）: 店の送り方式（記録に刻む）
  v_date  date;
  v_idem  uuid;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'forbidden'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at into v_p from public.punches p where p.id = p_punch_id;
  -- 他人の打刻・他 org・存在しない id は同じ 'forbidden'（存在の手掛かりを出さない）
  if v_p.id is null or v_p.org_id <> public.auth_org_id() or v_p.cast_id <> v_cast then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  -- 冪等（org／本人照合の後）: 同じ打刻の再送＝既存 id（transport_issue_bulk(p_idem_key＝punch_id) と同じキー＝二重発行しない）
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_base, v_date, null, v_actor, v_idem, v_mode)
  returning id into v_id;
  perform public.audit_log_write('transport_issue_self', 'transport:' || v_id::text,
    null, jsonb_build_object('cast_id', v_p.cast_id, 'amount', v_base, 'biz_date', v_date, 'punch_id', v_p.id, 'mode', v_mode), v_p.store_id);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- ═══ ★3 kiosk_transport_issue（08c5dbc3） ═══
CREATE OR REPLACE FUNCTION public.kiosk_transport_issue(p_punch_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
  v_org    uuid;   -- ★5 0159（起票91）: 端末の org を受けてゲート行を規約形（billing_writable_of(v_org)）に
  v_p      record;
  v_store  record;
  v_base   integer;
  v_mode   text;   -- ★0177（裁定414）: 店の送り方式（記録に刻む）
  v_date   date;
  v_idem   uuid;
  v_actor  uuid;
  v_id     uuid;
  v_ip     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  v_org := v_device.org_id;   -- ★5 0159
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;   -- ★5 0159: 規約形（billing 段47-1「挿入行の形」）
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at, p.source into v_p from public.punches p where p.id = p_punch_id;
  -- 他店・他 org・存在しない id・kiosk 以外の打刻は同じ 'forbidden'
  if v_p.id is null or v_p.org_id <> v_device.org_id or v_p.store_id <> v_device.store_id or v_p.source <> 'kiosk' then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if v_p.punched_at < now() - interval '10 minutes' then raise exception 'punch expired'; end if;   -- 端末は cast を識別しない＝打刻直後だけ（起草判断 (h)）
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select c.user_id into v_actor from public.casts c where c.id = v_p.cast_id;   -- 操作者なし＝cast の user（無ければ null）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_base, v_date, null, v_actor, v_idem, v_mode)
  returning id into v_id;
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_transport_issue',
     'transport:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', v_p.cast_id, 'amount', v_base,
                        'biz_date', v_date, 'punch_id', v_p.id, 'mode', v_mode),
     v_ip);
  return v_id;
end $function$;   -- pg_get_functiondef は末尾の ; を含まない＝ここで付ける

-- grant（写経元と同じ＝authenticated／service_role・anon／PUBLIC 不在。okuri_default_of は内部専用＝postgres のみ・4 ロール revoke）
revoke all on function public.set_store_okuri_mode(uuid, text) from public, anon;
grant  execute on function public.set_store_okuri_mode(uuid, text) to authenticated, service_role;
revoke all on function public.okuri_default_of(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.transport_issue(uuid, uuid, integer, date, text) from public, anon;
grant  execute on function public.transport_issue(uuid, uuid, integer, date, text) to authenticated, service_role;
revoke all on function public.transport_issue_bulk(uuid, jsonb, uuid) from public, anon;
grant  execute on function public.transport_issue_bulk(uuid, jsonb, uuid) to authenticated, service_role;
revoke all on function public.transport_issue_self(uuid) from public, anon;
grant  execute on function public.transport_issue_self(uuid) to authenticated, service_role;
revoke all on function public.kiosk_transport_issue(uuid) from public, anon;
grant  execute on function public.kiosk_transport_issue(uuid) to authenticated, service_role;

commit;

-- ===== verify =====（Success の後に別実行・select だけ）
-- (1) 貼り先証明
-- select 'nox-project-proof', count(*) from public.orgs;
-- (2) 列と CHECK
-- select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='transport' and column_name='mode';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.transport'::regclass and conname='transport_mode_check';
-- (3) 6 本の md5（写経元から変わっていること・★の語が入っていること）
-- select proname, left(md5(replace(prosrc, E'\r', '')), 8) md5, prosrc like '%★0177%' has_star from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_okuri_mode','okuri_default_of','transport_issue','transport_issue_bulk','transport_issue_self','kiosk_transport_issue') order by 1;
-- (4) proacl（変わっていないこと）
-- select proname, proacl from pg_proc where pronamespace='public'::regnamespace and proname in ('set_store_okuri_mode','okuri_default_of','transport_issue','transport_issue_bulk','transport_issue_self','kiosk_transport_issue') order by 1;
-- (5) 既存行＝全部 'actual'
-- select mode, count(*) from public.transport group by 1 order by 1;
-- (6) 受理値（owner で呼ぶ・select だけでは試せない＝UI の 4 択で確かめる）
