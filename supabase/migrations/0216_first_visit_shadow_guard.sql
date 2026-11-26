-- 0216_first_visit_shadow_guard（起票165・相談役 11/25 の便 I【I2】・起草と試走まで・適用はしない）
--   決め（相談役 11/25 の便 I）：初回の区分のセットの行（2 つの選択が base／extend でない有効な行）が区分なしの行に覆われる並び（どの場面でも当たらない）になるなら、
--     並べ替え（pricing_rule_reorder）と行の保存（set_pricing_rule）でも DB で断る（'first visit shadowed'）。0210 の柵は 2 つの選択の保存（set_pricing_rule_first）にだけあった＝
--     2026-11-26 01:10 本番の NOX-VERIFY-A1 で、画面の柵が古い行を読んでいる間に並べ替えが通った（client は c393d60b で直した・別のタブと関数の直呼びは通る）。
--   判定は 1 つの関数にまとめ、3 本が同じ判定を読む：
--     pricing_first_visit_cover_of(rule)＝この初回の行を覆う区分なしの有効なセットの行（priority が小さい・席種・ランク・曜日・時間帯がこの行の場面をすべて覆う）の id か null。
--       中身は 0210 版 2 の set_pricing_rule_first のその場の式と同じ（時間帯は営業日の切替 biz_cutoff_hm・既定 06:00 で pricing_resolve_core と同じ非対称の +1440）。画面の firstVisitShadowsOf と同じ。
--     pricing_first_visit_shadowed_ids(store)＝その店で覆われている初回の行（2 つの選択が base／extend でない有効な行）の id の並び。
--   並べ替えと行の保存は「前と後」を比べ、新しく覆われた行があるときだけ断る＝前から覆われていた行（今ある店の作り）では別の並べ替え・保存を止めない・直す並べ替えは通る。
--   料金の決まり（pricing_resolve_core）は変えない。表・列は足さない。
--   中身：新しい関数 2（内部専用＝4 ロール revoke・grant なし）・作り直し 3（同じ署名・CREATE OR REPLACE＝ACL はそのまま）。関数 522→524・表 133 のまま。
--   作り直す 3 本の本番の今の定義との差分：docs/tmp/rule_guard_1126/diff_live.md（変えた行と前後 3 行）。
--   翻訳元：0210 版 3 の set_pricing_rule_first（その場の判定）・今の本番の pricing_rule_reorder（0131）・set_pricing_rule（0173）。
--   二重防御：新しい 2 本は auth_* を読まず行も書かない・公開 RPC から渡された id で計算するだけ（原則 8 の check_round_amount 型）＝null guard は呼び出し元。店と会社は f の行から引く（g は f と同じ店・同じ会社）。
--   検証クエリ（当てた後・先頭に貼り先証明）：docs/tmp/rule_guard_1126/0216_verify.sql（select 'nox-project-proof', count(*) from public.orgs; から始まる）。
begin;

-- ═══ 1. 覆う判定（内部専用） ═══
create or replace function public.pricing_first_visit_cover_of(p_rule_id uuid)
 returns uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  -- ★0216（起票165）: 初回の区分の有効なセットの行 f を、区分なしの有効なセットの行 g が並び（priority）で上にあり、g の席種・ランク・曜日・時間帯が f の場面をすべて覆う＝f はどの場面でも当たらない。
  --   その g の id（一番上の 1 つ）か null。0210 版 2 の set_pricing_rule_first のその場の式と同じ（v_row → f・v_cut → k.cut）。2 つの選択（price_mode／time_end）は見ない＝呼び出し元が決める。
  select g.id
    from public.pricing_rules f
    join public.pricing_categories pc on pc.id = f.category_id and pc.first_visit
    cross join lateral (select split_part(c.hm, ':', 1)::int * 60 + split_part(c.hm, ':', 2)::int cut
                          from (select coalesce(nullif(trim(coalesce(st.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00') hm from public.stores st where st.id = f.store_id) c) k
    join public.pricing_rules g on g.store_id = f.store_id and g.org_id = f.org_id
   where f.id = p_rule_id and f.is_active and f.fee_kind = 'set'
     and g.is_active and g.fee_kind = 'set' and g.category_id is null and g.priority < f.priority
     and (g.seat_kind is null or g.seat_kind = f.seat_kind)                                                     -- 席種：g が全席種か同じ席種
     and (g.rank_id is null or g.rank_id = f.rank_id)                                                           -- ランク：g が全ランクか同じランク
     and (g.dow_mask is null or (f.dow_mask is not null and (f.dow_mask & ~g.dow_mask) = 0))                   -- 曜日：g が毎日か、f の曜日を全部含む
     and (case when g.time_from_min is null or g.time_to_min is null then k.cut when g.time_from_min < k.cut then g.time_from_min + 1440 else g.time_from_min end)
         <= (case when f.time_from_min is null or f.time_to_min is null then k.cut when f.time_from_min < k.cut then f.time_from_min + 1440 else f.time_from_min end)   -- 時間帯：g の始めが f の始め以前
     and (case when f.time_from_min is null or f.time_to_min is null then k.cut + 1440 when f.time_to_min <= k.cut then f.time_to_min + 1440 else f.time_to_min end)
         <= (case when g.time_from_min is null or g.time_to_min is null then k.cut + 1440 when g.time_to_min <= k.cut then g.time_to_min + 1440 else g.time_to_min end)   -- f の終わりが g の終わり以前
   order by g.priority, g.id
   limit 1
$function$;

-- ═══ 2. 店で覆われている初回の行（内部専用） ═══
create or replace function public.pricing_first_visit_shadowed_ids(p_store_id uuid)
 returns uuid[]
 language sql
 stable
 set search_path to 'public'
as $function$
  -- ★0216（起票165）: その店の初回の区分の有効なセットの行のうち、2 つの選択が base／extend でない行（set_pricing_rule_first が柵を掛ける行）で、区分なしの行に覆われている行の id（id 順）。
  select coalesce(array_agg(f.id order by f.id), '{}'::uuid[])
    from public.pricing_rules f
    join public.pricing_categories pc on pc.id = f.category_id and pc.first_visit
   where f.store_id = p_store_id and f.is_active and f.fee_kind = 'set'
     and (coalesce(f.price_mode, 'base') <> 'base' or coalesce(f.time_end, 'extend') <> 'extend')
     and public.pricing_first_visit_cover_of(f.id) is not null
$function$;

-- ═══ 3. 作り直し 3 本（本番の pg_get_functiondef から・同じ署名） ═══

-- ── set_pricing_rule_first（本番の md5(prosrc) ee28a6283cd19ef2073f0ed41e3a7661） ──
CREATE OR REPLACE FUNCTION public.set_pricing_rule_first(p_id uuid, p_price_mode text, p_time_end text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0210（起票140）: 初回の区分のセットの行に、額の持ち方（base／all_in）と時間の終わり方（extend／end／unlimited）を書く。set_pricing_rule（17 引数）の署名は変えない（0175 の set_pricing_rule_vip と同じ形）。
--   owner／自店の manager。set 以外の行は 'not set rule'・初回の区分でない行は 'not first visit'（段 1 は初回の区分だけ）。audit。
--   ★版 2（相談役 11/25 の便 F【F5】の決め）: 2 つの選択（base／extend 以外）を保存するとき、この行が「当たらない並び」なら止める（'first visit shadowed'）＝
--     区分なし（category_id null）の有効なセットの行 g が並び（priority）で上にあり、g の席種・ランク・曜日・時間帯がこの行の場面をすべて覆う＝この行はどの場面でも当たらない
--     （pricing_resolve_core は priority が区分より先＝変えない）。一部の場面だけ覆う g（VIP 席だけ等）は止めない。
--     画面の判定（lib/nox/register/first-visit.ts の firstVisitShadowsOf／ruleCoversOf）と同じ。時間帯は営業日の切替（biz_cutoff_hm・既定 06:00）で pricing_resolve_core と同じ非対称の +1440。
--   ★0216（起票165・相談役 11/25 の便 I【I2】）: 「覆う」の判定を pricing_first_visit_cover_of に移した（並べ替え・帯の保存と同じ判定を読む）。中身は版 2 のその場の式と同じ。
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.pricing_rules;
  v_fv   boolean;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_price_mode is null or p_price_mode not in ('base', 'all_in') then raise exception 'bad price_mode'; end if;
  if p_time_end is null or p_time_end not in ('extend', 'end', 'unlimited') then raise exception 'bad time_end'; end if;
  select * into v_row from public.pricing_rules where id = p_id and org_id = v_org for update;
  if v_row.id is null then raise exception 'not found'; end if;
  if (v_role = 'owner' or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) is not true then raise exception 'forbidden'; end if;
  if v_row.fee_kind <> 'set' then raise exception 'not set rule'; end if;
  select pc.first_visit into v_fv from public.pricing_categories pc where pc.id = v_row.category_id;
  if not coalesce(v_fv, false) then raise exception 'not first visit'; end if;
  if (p_price_mode <> 'base' or p_time_end <> 'extend') and v_row.is_active then   -- ★版 2: 当たらない並びなら止める
    if public.pricing_first_visit_cover_of(p_id) is not null then   -- ★0216: 共通の判定（区分なしの有効なセットの行が並びで上にあり、この行の場面をすべて覆う）
      raise exception 'first visit shadowed';
    end if;
  end if;
  update public.pricing_rules set price_mode = p_price_mode, time_end = p_time_end, updated_at = now() where id = p_id;
  perform public.audit_log_write('set_pricing_rule_first', 'pricing_rules:' || p_id::text,
    jsonb_build_object('price_mode', v_row.price_mode, 'time_end', v_row.time_end),
    jsonb_build_object('price_mode', p_price_mode, 'time_end', p_time_end), v_row.store_id);
end $function$;

-- ── pricing_rule_reorder（本番の md5(prosrc) fb656ea4b2628faaf53747d094ae9a05） ──
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
  v_sh0  uuid[];   -- ★0216（起票165）: 並べ替えの前に覆われていた初回の行
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
  if p_fee_kind = 'set' then v_sh0 := public.pricing_first_visit_shadowed_ids(p_store_id); end if;   -- ★0216（起票165・相談役 11/25 の便 I【I2】）
  update public.pricing_rules r
     set priority = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where r.id = u.id;
  -- ★0216: 初回の区分のセットの行（2 つの選択が base／extend でない有効な行）が、この並べ替えで新しく区分なしの行に覆われる（どの場面でも当たらない）なら断る。
  --   判定は set_pricing_rule_first と同じ（pricing_first_visit_cover_of）。前から覆われていた行は断らない（今ある店の別の並べ替えを止めない・直す並べ替えは通る）。
  if p_fee_kind = 'set' and exists (select 1 from unnest(public.pricing_first_visit_shadowed_ids(p_store_id)) x where not (x = any(v_sh0))) then
    raise exception 'first visit shadowed';
  end if;
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

-- ── set_pricing_rule（本番の md5(prosrc) 3d10b99f9c5eb9f29bd78a484d1e2615） ──
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
  -- ★1 0173（裁定385）: 延長パターン＝1 店 3 本まで（新規追加時のみ検査＝既存の超過は不変）・既定（is_default_ext）は extension だけ・既定は 1 本（他を false に）
  if p_is_default_ext is null then raise exception 'bad default_ext'; end if;
  if p_is_default_ext and p_fee_kind <> 'extension' then raise exception 'bad default_ext'; end if;
  if p_id is null and p_fee_kind = 'extension' and p_is_active
     and (select count(*) from public.pricing_rules r where r.store_id = p_store_id and r.fee_kind = 'extension' and r.is_active) >= 3 then
    raise exception 'too many extension';
  end if;
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

-- ═══ 4. 権限（新しい 2 本は内部専用＝4 ロール明示 revoke・grant なし。作り直した 3 本は CREATE OR REPLACE＝ACL はそのまま（public と anon は外れ・authenticated と service_role）） ═══
revoke execute on function public.pricing_first_visit_cover_of(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.pricing_first_visit_shadowed_ids(uuid) from public, anon, authenticated, service_role;

commit;
