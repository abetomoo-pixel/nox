-- sha256: 2bb7e9b1f9c8178e6c6fe7d2a11d5c947928e9a209ecec7cd3f18162a43ef601  bytes: 14497（この2行を除く本文の値）
-- docs/tmp/live_c3_rpc.sql — C3 §6-3 の底本（set_pricing_rule 書換対象＋set_store_* ガード雛形）・読み取り専用実測 2026-08-28

-- ============ 3. 課金ゲート名簿上の扱いと billing suite の本数 assert ============
-- 名簿（正本 docs/NOX_課金ゲート対象_v1.md）: 3本とも **A6. 商品・料金マスタ（13本）に収載＝対象（ゲート済み）**。
--   set_pricing_rule / set_store_pricing / set_store_time_pricing（delete_pricing_rule / pricing_rule_reorder も同節）
-- live 実測: 3本すべて本文に `if not public.billing_writable_of(...) then raise exception 'billing locked'` を1回ずつ持つ
--   （本ファイル §1 の全文中に3箇所＝機械 grep 一致）。
-- billing suite（verify-nox-billing.ts・現行 51 assertions）の本数 assert（該当行）:
--   :94  check("段47-1 正本の対象105名を読めた", docTargets.size === 105)          … 正本 A 名簿の読取 pin
--   :103 check("段47-1 ★live 全数 = 正本 A∪B（非ゲート新設の名簿漏れゼロ・教訓21）") … live pg_proc 全数 = A(105)+B(95)=200 の機械同期
--   :111 check("段47-1 live のゲート済み関数 = 105本", liveGated.size === 105)      … prosrc 'billing locked' の実列挙数
--   :113-117 双方向一致（missing / extra / 除外の leaked=0）
--   :130 check("段47-1 述語を参照する関数 = 106（105 ＋ ラッパ自身）")
-- ★含意（§6-3 実装時）:
--   set_pricing_rule 13→14引数化 … 名前不変＝105/200 の pin は不動。ただし**旧13引数の DROP＋新署名への ACL 再適用が必須**
--     （PostgreSQL は署名変更で ACL を引き継がない＝0062/0086 前例。DROP を忘れると overload 2本で PostgREST が曖昧ディスパッチ）。
--   set_store_tax_config 新設（ゲート入り）… **A8（店設定）へ +1 ＝ 105→106・全数 200→201**。
--     billing suite の pin 3本（:94/:103/:111）と :130 の 106→107 を同時更新（教訓21）＝「51 が名簿本数として動く」の実体。

-- 貼り先証明: {"t":"nox-project-proof","n":3}
-- 取得日: 2026-08-28 / dev DB mig0001〜0111 / pg_get_functiondef 逐語（LF 正規化のみ）

-- ============ 2. overload（arity 全列挙）と proacl ============
-- set_pricing_rule: overload 1 本
--   set_pricing_rule(uuid,uuid,text,text,integer,integer,integer,uuid,integer,integer,integer,boolean,text)  nargs=13  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}  cfg={search_path=public}
-- set_store_pricing: overload 1 本
--   set_store_pricing(uuid,integer,integer,integer,integer,integer,integer,text)  nargs=8  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}  cfg={search_path=public}
-- set_store_time_pricing: overload 1 本
--   set_store_time_pricing(uuid,integer,integer,integer,integer,text,text)  nargs=7  secdef=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}  cfg={search_path=public}

-- ============ 1. set_pricing_rule（全 1 本・全文）============
CREATE OR REPLACE FUNCTION public.set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean, p_name text DEFAULT NULL::text)
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
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
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
  end if;
  if p_priority is null then raise exception 'bad priority'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;
  -- ★mig0107（P-1）: 表示名（任意・trim・1〜40 文字・空は null）
  v_name := nullif(btrim(p_name), '');
  if v_name is not null and length(v_name) > 40 then raise exception 'bad name'; end if;

  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active, name)
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active, v_name)
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
end $function$


-- ============ 1. set_store_pricing（全 1 本・全文）============
CREATE OR REPLACE FUNCTION public.set_store_pricing(p_store_id uuid, p_hon_fee integer, p_jonai_fee integer, p_dohan_fee integer, p_service_rate integer, p_card_tax_rate integer, p_round_unit integer, p_round_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否（coalesce の null→既定リセット挙動を作らない）。
  -- 範囲は列 CHECK と同値＝二段（raise の方が PostgREST エラーが読みやすい）。
  if p_hon_fee is null or p_hon_fee < 0 then raise exception 'bad pricing'; end if;
  if p_jonai_fee is null or p_jonai_fee < 0 then raise exception 'bad pricing'; end if;
  if p_dohan_fee is null or p_dohan_fee < 0 then raise exception 'bad pricing'; end if;
  if p_service_rate is null or p_service_rate < 0 or p_service_rate > 100 then raise exception 'bad pricing'; end if;
  if p_card_tax_rate is null or p_card_tax_rate < 0 or p_card_tax_rate > 100 then raise exception 'bad pricing'; end if;
  if p_round_unit is null or p_round_unit < 1 or p_round_unit > 10000 then raise exception 'bad pricing'; end if;
  if p_round_mode is null or p_round_mode not in ('up','down','round') then raise exception 'bad pricing'; end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は料金7列のみの合成 jsonb（settings_json 全文を監査に混ぜない＝E1 設計 §2・過去 audit との形は
  -- to_jsonb(部分) 合成の #40 流儀と同型）
  select jsonb_build_object(
           'hon_fee', hon_fee, 'jonai_fee', jonai_fee, 'dohan_fee', dohan_fee,
           'service_rate', service_rate, 'card_tax_rate', card_tax_rate,
           'round_unit', round_unit, 'round_mode', round_mode)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set hon_fee = p_hon_fee, jonai_fee = p_jonai_fee, dohan_fee = p_dohan_fee,
         service_rate = p_service_rate, card_tax_rate = p_card_tax_rate,
         round_unit = p_round_unit, round_mode = p_round_mode
   where id = p_store_id;
  select jsonb_build_object(
           'hon_fee', hon_fee, 'jonai_fee', jonai_fee, 'dohan_fee', dohan_fee,
           'service_rate', service_rate, 'card_tax_rate', card_tax_rate,
           'round_unit', round_unit, 'round_mode', round_mode)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_pricing', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$


-- ============ 1. set_store_time_pricing（全 1 本・全文）============
CREATE OR REPLACE FUNCTION public.set_store_time_pricing(p_store_id uuid, p_set_min integer, p_set_fee integer, p_ext_min integer, p_ext_fee integer, p_time_mode text, p_time_per text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否（coalesce の null→既定リセット挙動を作らない）。
  -- 範囲は列 CHECK と同値＝二段（raise の方が PostgREST エラーが読みやすい）。
  if p_set_min is null or p_set_min < 1 or p_set_min > 1440 then raise exception 'bad time pricing'; end if;
  if p_set_fee is null or p_set_fee < 0 then raise exception 'bad time pricing'; end if;
  if p_ext_min is null or p_ext_min < 1 or p_ext_min > 1440 then raise exception 'bad time pricing'; end if;
  if p_ext_fee is null or p_ext_fee < 0 then raise exception 'bad time pricing'; end if;
  if p_time_mode is null or p_time_mode not in ('manual','auto') then raise exception 'bad time pricing'; end if;
  if p_time_per is null or p_time_per not in ('table','person') then raise exception 'bad time pricing'; end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は時間制6列のみの合成 jsonb（E1 の7キー合成と同型・settings_json 全文を監査に混ぜない）
  select jsonb_build_object(
           'set_min', set_min, 'set_fee', set_fee, 'ext_min', ext_min,
           'ext_fee', ext_fee, 'time_mode', time_mode, 'time_per', time_per)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set set_min = p_set_min, set_fee = p_set_fee, ext_min = p_ext_min,
         ext_fee = p_ext_fee, time_mode = p_time_mode, time_per = p_time_per
   where id = p_store_id;
  select jsonb_build_object(
           'set_min', set_min, 'set_fee', set_fee, 'ext_min', ext_min,
           'ext_fee', ext_fee, 'time_mode', time_mode, 'time_per', time_per)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_time_pricing', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$

