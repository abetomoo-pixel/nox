-- 0224_ext_pattern_uncap（裁定508（提案）・相談役 11/26 夜便 N の N3＋19:05 の直し・起草と試走まで・適用はしない）
--   決め（Agoora 11/26）：「延長パターンは 1 店 3 件まで」（裁定385・0173 の set_pricing_rule 'too many extension'）を撤去＝数の上限は置かない。
--     理由＝半分の延長（30 分）が多い・平日／週末 × 60／30 で既に 4・試しの店で 8 ほど要る。
--   中身：set_pricing_rule の作り直し 1 本（同じ署名 17 引数・CREATE OR REPLACE＝ACL・SECURITY DEFINER・search_path はそのまま）。
--     外したのは新規の有効な extension が 3 本以上あるときの 'too many extension' の 4 行だけ（コメントを差し替え）。ほかは 1 バイトも変えない
--     （既定の 1 本＝is_default_ext の他を false にする段・部分ユニーク index pricing_rules_default_ext_uidx はそのまま）。
--     表・列・索引・制約は変えない（延長パターンの数を縛る制約・トリガーは元から無い）・関数の数は変わらない（525）・表 133。
--     伝票の側は元から行（配列）で持つ＝checks.ext_menu_snap（jsonb 配列・ext_menu_build が全件を凍結・limit なし）＋checks.ext_rule_id（選択中）
--     ＝check_open／check_extension_add／check_set_ext_rule／check_time_charge_apply／check_move_seat／ext_menu_pick は触らない。
--   check_time_charge_apply に触らない＝起草中の 0218（docs/tmp/ext_shimei_auto_1126/0218_ext_shimei_auto.sql・未適用）とは別の関数＝どちらを先に貼ってもよい。
--   本番の今の定義との差分：docs/tmp/ext_pattern_cap_1126/diff_live.md。翻訳元＝本番の set_pricing_rule（md5(prosrc) 811d3396e92f14c53af66e41a486411b・最後の定義は 0216）。
--   事前確認：docs/tmp/ext_pattern_cap_1126/0224_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/ext_pattern_cap_1126/0224_verify.sql（k, v, ok の全行 ok=true）。
begin;
set local lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean, p_name text DEFAULT NULL::text, p_tax_category text DEFAULT 'taxable_10'::text, p_category_id uuid DEFAULT NULL::uuid, p_billing_unit text DEFAULT NULL::text, p_is_default_ext boolean DEFAULT false)
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
  v_sh0    uuid[];   -- ★0216（起票165）: 保存の前に覆われていた初回の行
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
  -- ★1 0173（裁定385）: 既定（is_default_ext）は extension だけ・既定は 1 本（他を false に）
  --   ★0224（裁定508・Agoora 11/26）: 延長パターンの数の上限（0173 の 1 店 3 本・'too many extension'）は撤去＝数は問わない
  --     （半分の延長 30 分が多い・平日／週末 × 60／30 で既に 4・試しの店で 8 ほど要る）。伝票は凍結メニュー（checks.ext_menu_snap＝jsonb 配列）で持つ＝枠の数は無い
  if p_is_default_ext is null then raise exception 'bad default_ext'; end if;
  if p_is_default_ext and p_fee_kind <> 'extension' then raise exception 'bad default_ext'; end if;
  if p_is_default_ext and p_is_active then
    update public.pricing_rules set is_default_ext = false, updated_at = now()
     where store_id = p_store_id and fee_kind = 'extension' and is_default_ext and id is distinct from p_id;   -- 部分ユニーク index と二段
  end if;
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

  v_sh0 := public.pricing_first_visit_shadowed_ids(p_store_id);   -- ★0216（起票165・相談役 11/25 の便 I【I2】）
  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active, name, tax_category, category_id, billing_unit, is_default_ext)   -- ★1 0173
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active, v_name, p_tax_category, p_category_id, p_billing_unit, p_is_default_ext)   -- ★1 0173
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
           is_default_ext = p_is_default_ext,  -- ★1 0173（裁定385）
           updated_at    = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(r) into v_after
    from public.pricing_rules r where r.id = v_id;
  -- ★0216: 初回の区分のセットの行が、この保存で新しく区分なしの行に覆われる（並び・条件・有効・区分を変えて）なら断る。判定は set_pricing_rule_first と同じ（pricing_first_visit_cover_of）。
  --   前から覆われていた行は断らない（今ある店の別の行の保存を止めない）。
  if exists (select 1 from unnest(public.pricing_first_visit_shadowed_ids(p_store_id)) x where not (x = any(v_sh0))) then
    raise exception 'first visit shadowed';
  end if;

  perform public.audit_log_write(
    p_action   => 'set_pricing_rule',
    p_target   => 'pricing_rules:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $function$;

commit;
