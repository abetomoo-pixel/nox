-- 0161_punch_sequence.sql
-- マイグレーション名: 0161_punch_sequence（裁定327・打刻の順序検査＝0008 決定1「盲目記録」を退役）
-- 生成器: docs/tmp/gen_0161.mjs（手打ち禁止）。写経元＝docs/tmp/0161_live.json（q0930_live_0161.mjs が pg_get_functiondef で dump した live 全文・CR 除去）。
--   既存関数は ★ の置換点以外 1 バイト不変（299-11）。新設（punch_seq_check）はこのテンプレート内に手書き・期待 md5 は生成物から算出。
--
-- 写経元 live md5（2026-09-30・prosrc の CR 除去・先頭 8 桁）→ 本 mig 適用後の期待 md5:
--   punch_self             f2c9b923 → 952f18a4
--   punch_proxy            83f2a99f → a760e1a4
--   kiosk_punch            b31ff8fa → 5a1d5f10
--   payroll_attentions_of  04d88b37 → 3721bf4e
--   新設 1 本: punch_seq_check f5fd8b84
--   不触の控え（適用後も不変であること）: punch_correction_apply 857dd4cf／punch_correction_request 2588fd86／punch_correction_decide e5dc188e／punch_correction_ack 0dd145ab／
--     payroll_attention_resolve 01b27881／biz_date_of 196c453f／period_bounds 96e10e9a／audit_log_write 182eba3a／okuri_default_of 434e69d9／transport_issue_self 2eebb64f／
--     kiosk_transport_issue 08c5dbc3／okuri_today_summary e61e5dd9／demo_org_reset a331cdcd／billing_writable_of 927fb270／auth_cast_id e035a6d5／auth_kiosk_org_id 46762f36／
--     kiosk_punch_state 48300293／payroll_finalize e402804d
--
-- 器（裁定327・便 0161 ★1〜★5）:
--   ★1 payroll_attentions: run_id を null 可（FK・on delete cascade は不変）・kind CHECK を ('post_finalize_punch','open_punch') に張替え・
--        open_punch 行の形（detail に punch_id／biz_date）・部分 unique（1 打刻 1 行＝冪等・競合は on conflict do nothing）。
--   ★2 新設 内部専用 punch_seq_check(p_store_id, p_cast_id, p_type, p_at) returns date（4 ロール明示 revoke・grant なし・原則8＝公開 RPC が二重防御済みの id で計算する内部ヘルパー）:
--        判定単位＝biz_date_of(p_store_id, p_at)。当日営業日の最終打刻が in なら 'already in'／out なら 'already out'（同一営業日の再出勤は不可）。
--        out は当日営業日に未閉鎖の in が無ければ 'no open punch'。前営業日以前の最終打刻が in（未閉鎖）は塞がず、注意行 'open_punch' を積む（run があれば run_id・無ければ null）＋audit。
--   ★3 punch_self／punch_proxy／kiosk_punch: insert の直前に perform public.punch_seq_check(...) 1 行（punch_self は 0008 決定1 のコメント行を ★ 行に差替え）。他は 1 バイト不変。
--        店側の打刻修正（punch_correction_apply＝行編集）は対象外（327）。cast 本人の取消は無し（修正は punch_correction_request）。
--   ★4 payroll_attentions_of: v_run に期間（coalesce(period_start／period_end, period_bounds)）を持たせ、run_id 一致 または（run_id null ∧ kind 'open_punch' ∧ 自店 ∧ detail.biz_date が期間内）を返す。
--   ★5 grants（新設 1 本＝4 ロール revoke・再作成 4 本は live の proacl を再掲）。demo_org_reset は不触（表・列の追加なし）。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）:
--   関数 296 → 297（新設 1・内部専用＝名簿 B +1 → A 154／B 143／全数 297）。表 81 不変。'billing locked' 154／形 154／述語参照 155 不変。
--   pin が変わる suite: 0158（punch_self を out から始める段＝'no open punch'）／daily-pay（in→out→out の 2 度目）／anon-guard（probe +1・段35 kiosk の順）／grants（G4d 内部 +1・G9 0161）／billing（名簿 297）／0158 s-3／t-1（関数 297）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に）: (1) proof (2) md5 5 本（再作成 4＋新設 1） (3) 不触 3 本 (4) proacl 5 本 (5) payroll_attentions の CHECK 2 本 (6) 関数 297・表 81・run_id null 可。
begin;

-- ★1 payroll_attentions（0158）: open_punch の器
alter table public.payroll_attentions alter column run_id drop not null;   -- ★1 0161（裁定327）: run 未作成でも積む（run_id null）
alter table public.payroll_attentions drop constraint if exists payroll_attentions_kind_check;
alter table public.payroll_attentions add constraint payroll_attentions_kind_check
  check (kind in ('post_finalize_punch','open_punch'));   -- ★1 0161: +'open_punch'
alter table public.payroll_attentions drop constraint if exists payroll_attentions_open_punch_ck;
alter table public.payroll_attentions add constraint payroll_attentions_open_punch_ck
  check (kind <> 'open_punch' or ((detail ? 'punch_id') and (detail ? 'biz_date')));   -- ★1 0161: open_punch 行の形
create unique index if not exists payroll_attentions_open_punch_uq
  on public.payroll_attentions (((detail->>'punch_id')::uuid)) where kind = 'open_punch';   -- ★1 0161: 1 打刻 1 行（冪等）

-- ★2 punch_seq_check（内部専用・4 ロール revoke）: 打刻の順序検査＋前営業日以前の未閉鎖 in の注意行
create or replace function public.punch_seq_check(p_store_id uuid, p_cast_id uuid, p_type text, p_at timestamptz default now())
returns date language plpgsql security definer set search_path = public as $$
declare
  v_bd    date;
  v_last  record;   -- 当日営業日の最終打刻
  v_open  record;   -- 前営業日以前の最終打刻（in なら未閉鎖）
  v_run   uuid;
  v_id    uuid;
begin
  if p_store_id is null or p_cast_id is null or p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  v_bd := public.biz_date_of(p_store_id, p_at);
  -- 当日営業日の最終打刻（biz_date_of で帰属・走査は p_at ±2 日幅に絞る）
  select p.type, p.punched_at into v_last
    from public.punches p
   where p.cast_id = p_cast_id and p.store_id = p_store_id
     and p.punched_at >= p_at - interval '2 days' and p.punched_at <= p_at + interval '2 days'
     and public.biz_date_of(p_store_id, p.punched_at) = v_bd
   order by p.punched_at desc, p.created_at desc
   limit 1;
  if p_type = 'in' then
    if v_last.type = 'in'  then raise exception 'already in'; end if;
    if v_last.type = 'out' then raise exception 'already out'; end if;
  else
    if v_last.type is distinct from 'in' then raise exception 'no open punch'; end if;
  end if;
  -- 前営業日以前の最終打刻が in（未閉鎖）＝今日の打刻は塞がない。注意行 'open_punch'（1 打刻 1 行・run があれば付ける）
  select p.id, p.type, p.punched_at, p.org_id into v_open
    from public.punches p
   where p.cast_id = p_cast_id and p.store_id = p_store_id
     and p.punched_at < p_at
     and public.biz_date_of(p_store_id, p.punched_at) < v_bd
   order by p.punched_at desc, p.created_at desc
   limit 1;
  if v_open.type = 'in'
     and not exists (select 1 from public.payroll_attentions a where a.kind = 'open_punch' and (a.detail->>'punch_id')::uuid = v_open.id) then
    select pr.id into v_run
      from public.payroll_runs pr, lateral public.period_bounds(pr.period) pb
     where pr.store_id = p_store_id
       and public.biz_date_of(p_store_id, v_open.punched_at) between coalesce(pr.period_start, pb.period_start) and coalesce(pr.period_end, pb.period_end)
     order by pr.created_at desc
     limit 1;
    insert into public.payroll_attentions (org_id, store_id, cast_id, run_id, kind, detail)
    values (v_open.org_id, p_store_id, p_cast_id, v_run, 'open_punch',
            jsonb_build_object('punch_id', v_open.id, 'punched_at', v_open.punched_at,
                               'biz_date', public.biz_date_of(p_store_id, v_open.punched_at),
                               'noticed_at', p_at, 'noticed_type', p_type))
    on conflict (((detail->>'punch_id')::uuid)) where kind = 'open_punch' do nothing
    returning id into v_id;
    if v_id is not null then
      perform public.audit_log_write('punch_open_attention', 'payroll_attentions:' || v_id::text, null,
        (select to_jsonb(a) from public.payroll_attentions a where a.id = v_id), p_store_id);
    end if;
  end if;
  return v_bd;
end $$;

-- ★3 punch_self（0156 f2c9b923 → 順序検査 1 行＋コメント差替え）
CREATE OR REPLACE FUNCTION public.punch_self(p_type text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_row record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）: out 打刻の送り利用（既定＝okuri_default_of）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  v_okuri := public.okuri_default_of(v_row.store_id, p_type, p_okuri);  -- ★4 0156
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  -- ★3 0161（裁定327）: 順序検査＝盲目記録（0008 決定1）は退役。'already in'／'already out'／'no open punch' で拒否・前営業日以前の未閉鎖 in は塞がず注意行 'open_punch'
  perform public.punch_seq_check(v_row.store_id, v_cast, p_type, now());   -- ★3 0161
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri)  -- ★4 0156: +okuri
  values (v_row.org_id, v_row.store_id, v_cast, p_type, p_lat, p_lng, v_ip, 'self', v_okuri)
  returning id into v_id;
  perform public.audit_log_write('punch_self', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_row.store_id);
  return v_id;
end $function$;

-- ★3 punch_proxy（0156 83f2a99f → 順序検査 1 行）
CREATE OR REPLACE FUNCTION public.punch_proxy(p_cast_id uuid, p_type text, p_note text DEFAULT NULL::text, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_ip text; v_id uuid;
  v_okuri boolean;  -- ★4 0156（裁定309-9）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_type is null or p_type not in ('in','out') then raise exception 'bad type'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  perform public.punch_seq_check(v_cast.store_id, p_cast_id, p_type, now());   -- ★3 0161（裁定327）: 順序検査（代理打刻も対象＝起草判断）
  insert into public.punches (org_id, store_id, cast_id, type, ip, source, note, okuri)  -- ★4 0156: +okuri
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, v_ip, 'manager', p_note, v_okuri)
  returning id into v_id;
  perform public.audit_log_write('punch_proxy', 'punches:' || v_id::text, null,
    (select to_jsonb(p) from public.punches p where p.id = v_id), v_cast.store_id);
  return v_id;
end $function$;

-- ★3 kiosk_punch（0156 b31ff8fa → 順序検査 1 行）
CREATE OR REPLACE FUNCTION public.kiosk_punch(p_cast_id uuid, p_pin text, p_type text, p_okuri boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_device   public.kiosk_devices;
  v_cast     public.casts;
  v_pin      public.cast_pin;
  v_ip       text;
  v_punch_id uuid;
  v_newfail  integer;
  v_okuri    boolean;  -- ★4 0156（裁定309-9）
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

  -- 0109: 打刻端末の最終アクセス（成功経路のみ・引き継ぎv18 §3 のとおり）
  update public.kiosk_devices
     set last_seen_at = now(), last_ip = v_ip
   where id = v_device.id;

  v_okuri := public.okuri_default_of(v_cast.store_id, p_type, p_okuri);  -- ★4 0156
  perform public.punch_seq_check(v_cast.store_id, p_cast_id, p_type, now());   -- ★3 0161（裁定327）: 順序検査（raise＝rpc-err 様式・端末の和文は M1）
  insert into public.punches (org_id, store_id, cast_id, type, lat, lng, ip, source, okuri)  -- ★4 0156: +okuri
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_type, null, null, v_ip, 'kiosk', v_okuri)
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
end $function$;

-- ★4 payroll_attentions_of（0158 04d88b37 → run の期間を持ち、run 未作成時に積んだ open_punch を拾う）
CREATE OR REPLACE FUNCTION public.payroll_attentions_of(p_run_id uuid)
 RETURNS TABLE(id uuid, cast_id uuid, cast_name text, kind text, detail jsonb, created_at timestamp with time zone, resolved_at timestamp with time zone, resolved_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select r.id, r.org_id, r.store_id, coalesce(r.period_start, pb.period_start) as period_start, coalesce(r.period_end, pb.period_end) as period_end into v_run   -- ★4 0161（裁定327）: 期間も持つ
    from public.payroll_runs r, lateral public.period_bounds(r.period) pb where r.id = p_run_id;   -- ★4 0161
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select a.id, a.cast_id, c.name, a.kind, a.detail, a.created_at, a.resolved_at, a.resolved_by
      from public.payroll_attentions a
      join public.casts c on c.id = a.cast_id
     where a.org_id = public.auth_org_id()   -- ★4 0161
       and (a.run_id = p_run_id   -- ★4 0161
            or (a.run_id is null and a.kind = 'open_punch' and a.store_id = v_run.store_id   -- ★4 0161（裁定327）: run 未作成時に積んだ open_punch は期間で拾う
                and (a.detail->>'biz_date')::date between v_run.period_start and v_run.period_end))   -- ★4 0161
     order by (a.resolved_at is not null), a.created_at desc, a.id;
end $function$;

-- ★5 grants（新設 1 本＝内部専用・再作成 4 本は live の proacl を再掲）
revoke execute on function public.punch_seq_check(uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.punch_self(text, double precision, double precision, boolean) from public, anon;
grant execute on function public.punch_self(text, double precision, double precision, boolean) to authenticated, service_role;
revoke all on function public.punch_proxy(uuid, text, text, boolean) from public, anon;
grant execute on function public.punch_proxy(uuid, text, text, boolean) to authenticated, service_role;
revoke all on function public.kiosk_punch(uuid, text, text, boolean) from public, anon;
grant execute on function public.kiosk_punch(uuid, text, text, boolean) to authenticated, service_role;
revoke all on function public.payroll_attentions_of(uuid) from public, anon;
grant execute on function public.payroll_attentions_of(uuid) to authenticated, service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('punch_self','punch_proxy','kiosk_punch','payroll_attentions_of','punch_seq_check') order by 1;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in ('punch_correction_apply','payroll_attention_resolve','biz_date_of') order by 1;
select proname, pg_get_function_identity_arguments(oid), proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in
  ('punch_self','punch_proxy','kiosk_punch','payroll_attentions_of','punch_seq_check') order by 1;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.payroll_attentions'::regclass and contype='c' order by 1;
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions, (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables,
       (select is_nullable from information_schema.columns where table_schema='public' and table_name='payroll_attentions' and column_name='run_id') as run_id_nullable,
       (select count(*) from pg_indexes where schemaname='public' and indexname='payroll_attentions_open_punch_uq') as open_punch_uq;
