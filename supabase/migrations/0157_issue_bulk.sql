-- 0157_issue_bulk.sql
-- 裁定302（2026-09-25・前借り／送り実費の一括発行 302-1〜5）＝2026-09-25 起草（CC 写経・便 X-3）。番号は 0153 の前に手貼り（302-4・0154→0152 の前例）。
-- 写経元（live・docs/tmp/0157_live.json 逐語＝pg_get_functiondef・docs/tmp/gen_0157.py で機械生成・★以外は 1 バイト不変＝改行コードを除く（299-11））:
--   ★1 advances.idem_key／transport.idem_key（uuid・null 可）＋ unique (store_id, idem_key) where idem_key is not null（X-1(b)＝両表とも idem_key 無し）
--   ★2 adv_issue_bulk(p_store_id uuid, p_items jsonb, p_idem_key uuid) returns uuid[]＝adv_issue の検査部を逐語（店・role は 1 回・amount／date／paid period／cast は件ごと）＋
--        各件 idem＝md5(p_idem_key || ':' || cast_id)::uuid（既存行があれば insert しない＝同キー再送は既存 id の配列・新規 0）・1 tx＝1 件でも raise なら全件ロールバック・audit は件ごと
--   ★3 transport_issue_bulk（同・okuri_mode='actual' は 1 回・p_items の date＝biz_date）
--   ★4 grants＝revoke all … from public, anon／grant … to authenticated, service_role（既存 adv_issue と同じ proacl）
--   ★5 名簿 A +2（adv_issue_bulk／transport_issue_bulk＝live の adv_issue／transport_issue は 'billing locked' を持つ（mig0088 でゲート挿入済み）＝写経で bulk にも入る＝A4 金銭発行・取消へ・
--        全数 260→262／gated 139→141・anon-guard probe +2・grants G4d +2＝手貼り後の client 便）
--
-- 要裁定 (2)＝裁定304 で確定（2026-09-25・Agoora 承認）:
--   304-1 p_items に同じ cast_id が 2 回以上あれば 'duplicate cast' で raise（全件失敗・部分成功なし）＝ループ前に count(*) <> count(distinct cast_id) で検査。
--   304-2 audit action＝'adv_issue_bulk'／'transport_issue_bulk'・target は行ごと advances:<id>／transport:<id>・after に bulk_idem（起草どおり）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig, proacl from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('adv_issue_bulk','transport_issue_bulk','adv_issue','transport_issue','adv_cancel','transport_cancel') order by 1;   -- 6 行
--   select table_name, column_name from information_schema.columns where table_schema='public' and column_name='idem_key' and table_name in ('advances','transport');  -- 2 行
--   select indexname from pg_indexes where schemaname='public' and indexname in ('advances_store_idem_uidx','transport_store_idem_uidx');                               -- 2 行
--   -- 不触の md5（adv_issue／adv_cancel／transport_issue／transport_cancel）が貼付前の控え（docs/tmp/0157_pre_live.md A 表）と一致
--   -- 動作＝突合 docs/tmp/q0925_ag_0157.mjs（BEGIN…ROLLBACK）・suite の張り替えは手貼り後

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 idem_key（両表・null 可・store 内 unique）
-- ══════════════════════════════════════════════════════════════
alter table public.advances  add column if not exists idem_key uuid;
alter table public.transport add column if not exists idem_key uuid;
create unique index if not exists advances_store_idem_uidx  on public.advances  (store_id, idem_key) where idem_key is not null;
create unique index if not exists transport_store_idem_uidx on public.transport (store_id, idem_key) where idem_key is not null;

-- ══════════════════════════════════════════════════════════════
-- ★2 adv_issue_bulk（adv_issue の検査部を逐語＝店・role は 1 回・件ごとは amount／date／paid period／cast・冪等・1 tx）
-- ══════════════════════════════════════════════════════════════
create or replace function public.adv_issue_bulk(
  p_store_id uuid,
  p_items    jsonb,
  p_idem_key uuid
) returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  v_store  record;
  v_cast   record;
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
  if p_idem_key is null then raise exception 'bad idem'; end if;                                                                  -- ★2
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'bad items'; end if;   -- ★2
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if (select count(*) <> count(distinct e->>'cast_id') from jsonb_array_elements(p_items) e) then raise exception 'duplicate cast'; end if;   -- 裁定304-1 同 cast 2 回以上＝全件失敗
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  for v_item in select * from jsonb_array_elements(p_items) loop                                                                    -- ★2 件ごと
    v_castid := (v_item->>'cast_id')::uuid;
    v_amount := (v_item->>'amount')::int;
    v_date   := (v_item->>'date')::date;
    v_note   := v_item->>'note';
    v_cast   := null;
    if v_amount is null or v_amount <= 0 then raise exception 'bad amount'; end if;
    if v_date is null then raise exception 'bad date'; end if;
    -- paid 期間ガード（transport_issue 同型・凍結済み period に stranded 前借りを作らない・実装ノート【3】）
    --   前借りの period 帰属 = to_char(advanced_on,'YYYY-MM')（deduct_period は finalize が partial 時に設定）。
    --   paid 済み period に発行すると当該 period の finalize が 'run paid' で拒否され回収不能＝宙吊りになるため弾く。
    if exists (select 1 from public.payroll_runs
               where store_id = p_store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
      raise exception 'paid period';
    end if;
    -- cast は org+store 一致を server 照合（1 advance=1 cast）
    select id into v_cast from public.casts
      where id = v_castid and org_id = public.auth_org_id() and store_id = p_store_id;
    if v_cast.id is null then raise exception 'bad cast'; end if;
    v_idem := md5(p_idem_key::text || ':' || v_castid::text)::uuid;                                                              -- ★2 各件の idem（302-2）
    select id into v_id from public.advances where store_id = p_store_id and idem_key = v_idem;                                   -- ★2 同キー再送＝既存 id
    if v_id is null then
      insert into public.advances (org_id, store_id, cast_id, amount, advanced_on, note, created_by, idem_key)
      values (v_store.org_id, p_store_id, v_castid, v_amount, v_date, nullif(trim(coalesce(v_note,'')), ''), v_actor, v_idem)
      returning id into v_id;
      perform public.audit_log_write('adv_issue_bulk', 'advances:' || v_id::text,
        null, jsonb_build_object('cast_id', v_castid, 'amount', v_amount, 'advanced_on', v_date, 'bulk_idem', p_idem_key), p_store_id);
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★3 transport_issue_bulk（transport_issue の検査部を逐語＝店・role・okuri_mode は 1 回・件ごとは amount／date／paid period／cast・冪等・1 tx）
-- ══════════════════════════════════════════════════════════════
create or replace function public.transport_issue_bulk(
  p_store_id uuid,
  p_items    jsonb,
  p_idem_key uuid
) returns uuid[] language plpgsql security definer set search_path = public as $$
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
  if v_mode <> 'actual' then raise exception 'okuri not actual'; end if;

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
      insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key)
      values (v_store.org_id, p_store_id, v_castid, v_amount, v_date, nullif(trim(coalesce(v_note,'')), ''), v_actor, v_idem)
      returning id into v_id;
      perform public.audit_log_write('transport_issue_bulk', 'transport:' || v_id::text,
        null, jsonb_build_object('cast_id', v_castid, 'amount', v_amount, 'biz_date', v_date, 'bulk_idem', p_idem_key), p_store_id);
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★4 grants（既存 adv_issue と同じ proacl＝authenticated／service_role・anon／PUBLIC 不在）
-- ══════════════════════════════════════════════════════════════
revoke all on function public.adv_issue_bulk(uuid, jsonb, uuid) from public, anon;
grant execute on function public.adv_issue_bulk(uuid, jsonb, uuid) to authenticated, service_role;
revoke all on function public.transport_issue_bulk(uuid, jsonb, uuid) from public, anon;
grant execute on function public.transport_issue_bulk(uuid, jsonb, uuid) to authenticated, service_role;

commit;
