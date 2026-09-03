-- =============================================================
-- mig0131: 起票#55 一式 — reorder whitelist 是正+区分一覧 RPC(#54)+duration 上限(#56)
--   1) pricing_rule_reorder: whitelist 6種化(+vip_charge・ext_shimei 除外=0124 設計維持。
--      0130 改修漏れの是正=教訓54 の1例目)
--   2) pricing_categories_for_register 新設(#54 裁定済): SECURITY DEFINER・
--      自店 active 区分の id/name/sort のみ・check_open 同腕(owner/manager 自店/
--      staff can_register/cast can_register/kiosk operator)。読み取り専用=billing ゲート
--      なし=A6 名簿対象外。RLS(owner/manager 限定)を越えて開栓時の区分選択を可能にする
--   3) set_pricing_rule: duration_min > 1440 を 'bad duration' で拒否(#56 の RPC 側。
--      UI 警告は別途 UI レーン)。16引数のまま=OR REPLACE
--   前提: mig0130 適用済み。冪等: 可。golden 6値不変 gate。
--   ACL: reorder/set_pricing_rule=authenticated 再現・新 RPC=authenticated のみ
--   (kiosk は authenticated 系セッションで到達=check_open と同じ)
-- =============================================================
begin;

-- 0) fail-fast: 0130 適用済み確認+オーバーロード残置検知
do $mig$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pricing_rule_reorder';
  if v_n <> 1 then raise exception 'mig0131 precondition: pricing_rule_reorder overload count=%', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_pricing_rule'
     and pg_get_function_identity_arguments(p.oid) like '%p_billing_unit text';
  if v_n <> 1 then raise exception 'mig0131 precondition: set_pricing_rule 16引数版なし(0130 未適用)'; end if;
end $mig$;

-- 1) pricing_rule_reorder: whitelist 6種化(同 arity・OR REPLACE・変更は whitelist 1行のみ)
CREATE OR REPLACE FUNCTION public.pricing_rule_reorder(p_store_id uuid, p_fee_kind text, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_n    int;
  v_cnt  int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  -- ★mig0131(#55): vip_charge 追加=6種(0130 改修漏れの是正・教訓54 の1例目)。
  --   ext_shimei は引き続き除外(0124 直 insert 設計=UI 並び替え対象外の維持)
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei','vip_charge') then
    raise exception 'bad fee kind';
  end if;
  select count(*) into v_cnt from public.pricing_rules r
   where r.id = any(p_ids) and r.org_id = v_org
     and r.store_id = p_store_id and r.fee_kind = p_fee_kind;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;
  select count(*) into v_cnt from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id
     and r.fee_kind = p_fee_kind;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;
  select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority)
                   order by r.priority, r.id)
    into v_before
    from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id and r.fee_kind = p_fee_kind;
  update public.pricing_rules r
     set priority = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where r.id = u.id;
  select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority)
                   order by r.priority, r.id)
    into v_after
    from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id and r.fee_kind = p_fee_kind;
  perform public.audit_log_write(
    p_action   => 'pricing_rule_reorder',
    p_target   => 'pricing_rules:store:' || p_store_id::text || ':' || p_fee_kind,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $function$;

revoke all on function public.pricing_rule_reorder(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.pricing_rule_reorder(uuid, text, uuid[]) to authenticated;
-- ★live 実測再現: authenticated のみ

-- 2) pricing_categories_for_register 新設(#54 裁定済) ---------------
--    自店 active 区分の (id, name, sort) のみ返却。check_open と同腕のガード=
--    「開栓できる者は区分を選べる」の同値性。読み取り専用=billing ゲートなし=A6 対象外
CREATE OR REPLACE FUNCTION public.pricing_categories_for_register(p_store_id uuid)
 RETURNS TABLE(id uuid, name text, sort integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_store record;
begin
  -- ★0057(1)型: null guard 二重化
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  select s.id, s.org_id into v_store from public.stores s where s.id = p_store_id;
  if v_store.id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;
  -- ★check_open 同腕(0057(3)型): 開栓できる者=区分を選べる者
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  return query
  select pc.id, pc.name, pc.sort
    from public.pricing_categories pc
   where pc.store_id = p_store_id
     and pc.org_id = v_org
     and pc.is_active
   order by pc.sort asc, pc.created_at asc, pc.id asc;
end $function$;

revoke all on function public.pricing_categories_for_register(uuid) from public, anon, authenticated;
grant execute on function public.pricing_categories_for_register(uuid) to authenticated;
-- kiosk は authenticated 系セッションで到達(check_open と同じ)=anon grant なし

-- 3) set_pricing_rule: duration 上限(#56・変更は duration ブロック1行のみ) -------
CREATE OR REPLACE FUNCTION public.set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean, p_name text DEFAULT NULL::text, p_tax_category text DEFAULT 'taxable_10'::text, p_category_id uuid DEFAULT NULL::uuid, p_billing_unit text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_settings jsonb;
  v_cutoff   text;
  v_cut  integer;
  v_ef   integer;
  v_et   integer;
  v_id   uuid;
  v_before jsonb;
  v_after  jsonb;
  v_name   text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 検証（テーブル CHECK と同値＋cutoff 跨ぎ禁止＝RPC 権威）
  -- ★mig0130(裁定118): vip_charge 追加=6種。ext_shimei は引き続き除外
  --   (0124 直 insert 設計=UI から作らせない fail-closed の維持)
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei','vip_charge') then
    raise exception 'bad fee kind';
  end if;
  if p_seat_kind is not null and p_seat_kind not in ('卓','カウンター','VIP') then
    raise exception 'bad seat kind';
  end if;
  if p_dow_mask is not null and (p_dow_mask < 1 or p_dow_mask > 127) then
    raise exception 'bad dow';
  end if;
  if (p_time_from_min is null) <> (p_time_to_min is null) then
    raise exception 'bad time';
  end if;
  if p_time_from_min is not null then
    if p_time_from_min < 0 or p_time_from_min > 1439
       or p_time_to_min < 0 or p_time_to_min > 1439 then
      raise exception 'bad time';
    end if;
    select s.settings_json into v_settings
      from public.stores s where s.id = p_store_id;
    v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
    v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
    v_ef := case when p_time_from_min <  v_cut then p_time_from_min + 1440 else p_time_from_min end;
    v_et := case when p_time_to_min   <= v_cut then p_time_to_min   + 1440 else p_time_to_min   end;
    if v_ef >= v_et then raise exception 'bad time'; end if;   -- 空帯・cutoff 跨ぎを一括拒否
  end if;
  if p_rank_id is not null then
    if p_fee_kind not in ('hon_shimei','jonai_shimei') then
      raise exception 'bad rank';
    end if;
    if not exists (select 1 from public.cast_ranks cr
                    where cr.id = p_rank_id and cr.store_id = p_store_id) then
      raise exception 'bad rank';
    end if;
    -- ★mig0104（裁定77）: 停止中ランクの新規参照を拒否。既存行の rank_id と同じ値の再送は据え置き
    if not exists (select 1 from public.cast_ranks cr
                    where cr.id = p_rank_id and cr.store_id = p_store_id and cr.is_active)
       and (p_id is null
            or p_rank_id is distinct from (select r.rank_id from public.pricing_rules r where r.id = p_id)) then
      raise exception 'inactive rank';
    end if;
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_duration_min is not null then
    if p_fee_kind not in ('set','extension') then raise exception 'bad duration'; end if;
    if p_duration_min < 1 then raise exception 'bad duration'; end if;
    -- ★mig0131(#56): 上限 1440 分(24時間)。実データ逆転1件(¥30/5000分)が起票根拠。
    --   UI 側の事前警告は別途 UI レーン
    if p_duration_min > 1440 then raise exception 'bad duration'; end if;
  end if;
  if p_priority is null then raise exception 'bad priority'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;
  -- ★mig0107（P-1）: 表示名（任意・trim・1〜40 文字・空は null）
  v_name := nullif(btrim(p_name), '');
  if v_name is not null and length(v_name) > 40 then raise exception 'bad name'; end if;
  -- ★mig0112（C3）: 税区分（enum 4値・裁定90-②＝DB は4値受理・UI 露出3値）
  if p_tax_category is null
     or p_tax_category not in ('taxable_10','taxable_8','exempt','out_of_scope') then
    raise exception 'bad tax category';
  end if;
  -- ★mig0128（裁定116-2）: 区分は set/extension/dohan のみ受理。
  --   shimei 系は resolve 呼び出し元が未区分対応＝死蔵設定の予防（fail-closed・将来レーンで解除）
  --   ★mig0130(裁定118-4): vip_charge へ区分を許可(4種へ)
  if p_category_id is not null then
    if p_fee_kind not in ('set','extension','dohan','vip_charge') then
      raise exception 'bad category kind';
    end if;
    if not exists (select 1 from public.pricing_categories pc
                    where pc.id = p_category_id and pc.org_id = v_org and pc.store_id = p_store_id) then
      raise exception 'bad category';
    end if;
    -- ★mig0104 rank 型の踏襲: 停止中区分の新規参照を拒否。既存行と同値の再送は据え置き
    if not exists (select 1 from public.pricing_categories pc
                    where pc.id = p_category_id and pc.org_id = v_org and pc.store_id = p_store_id and pc.is_active)
       and (p_id is null
            or p_category_id is distinct from (select r.category_id from public.pricing_rules r where r.id = p_id)) then
      raise exception 'inactive category';
    end if;
  end if;
  -- ★mig0130(裁定118-2): 課金単位は set/extension/vip_charge のみ受理(dohan/shimei は
  --   'bad unit kind'=fail-closed)。値は2値('bad unit')。null=店既定 time_per フォールバック
  if p_billing_unit is not null then
    if p_fee_kind not in ('set','extension','vip_charge') then
      raise exception 'bad unit kind';
    end if;
    if p_billing_unit not in ('person','table') then
      raise exception 'bad unit';
    end if;
  end if;

  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active, name, tax_category, category_id, billing_unit)
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active, v_name, p_tax_category, p_category_id, p_billing_unit)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(r) into v_before
      from public.pricing_rules r
     where r.id = p_id and r.org_id = v_org and r.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.pricing_rules
       set fee_kind      = p_fee_kind,
           seat_kind     = p_seat_kind,
           dow_mask      = p_dow_mask,
           time_from_min = p_time_from_min,
           time_to_min   = p_time_to_min,
           rank_id       = p_rank_id,
           amount        = p_amount,
           duration_min  = p_duration_min,
           priority      = p_priority,
           is_active     = p_is_active,
           name          = v_name,
           tax_category  = p_tax_category,
           category_id   = p_category_id,  -- ★mig0128
           billing_unit  = p_billing_unit,  -- ★mig0130
           updated_at    = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(r) into v_after
    from public.pricing_rules r where r.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_pricing_rule',
    p_target   => 'pricing_rules:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $function$;

revoke all on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_pricing_rule(uuid, uuid, text, text, integer, integer, integer, uuid, integer, integer, integer, boolean, text, text, uuid, text) to authenticated;

commit;
