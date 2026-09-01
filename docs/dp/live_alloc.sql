CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足（∀g: paid(g) ≥ due(g)）＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配（最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_kind='hon' の行のみ＝裁定100）
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id),
         array_agg(nom_kind order by position, created_at, id),
         array_agg(is_dohan order by position, created_at, id)
    into v_cast_ids, v_weights, v_kinds, v_dohans
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外（凍結値で判定・キー無し=false=按分対象）
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価（productBackOf と同一規則・凍結値）。★0119: unit4 はキャスト別キーで集計ループ内に解決
      if (v_line.back_snapshot ->> 'back_mode') is distinct from 'unit4' then
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配（床=整数除算・剰余降順→position 昇順）
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
            v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_kinds[i], v_dohans[i]))::int, 0);
          end if;
          if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          if v_kinds[i] = 'hon' then  -- ★0119: pt は本指名キャストの行のみ
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    for i in 1..v_n loop
      if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
        insert into public.check_cast_backs
          (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc)
        values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                v_drink[i], v_champ[i], v_bottle[i], v_pt[i]);
      end if;
    end loop;
  end if;

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$


-- ═══════════ cast_sales_aggregate ═══════════

CREATE OR REPLACE FUNCTION public.cast_sales_aggregate(p_store_id uuid, p_from date, p_to date)
 RETURNS TABLE(cast_id uuid, biz_date date, sales integer, hon integer, jonai integer, dohan integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if; -- 給与期間の常識的上限（四半期）
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;

  return query
  with target_checks as (
    -- SL6a: closed のみ（void/open 除外）。SL5a: biz_date=(JST(started_at)−cutoff)::date【2】
    select c.id as check_id,
           c.nom_type,
           (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date as bdate
    from public.checks c
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and (timezone('Asia/Tokyo', c.started_at) - (v_cutoff || ':00')::interval)::date between p_from and p_to
  ),
  noms as (
    -- SL4a: nomination の無い伝票（フリー卓）はここで自然に脱落＝非帰属
    select n.check_id, n.cast_id as cid, n.ratio_weight, n.position, n.nom_kind, n.is_dohan  -- ★0119
    from public.check_nominations n
    join target_checks tc on tc.check_id = n.check_id
    where n.org_id = v_org
  ),
  wsum as (
    select nm.check_id, sum(nm.ratio_weight)::bigint as w_total
    from noms nm group by nm.check_id
  ),
  groups as (
    -- SL2a: 金額基盤＝group due（check_group_due 再利用・サ料込・100円丸め後・カードTAX 非含）
    select tc.check_id, tc.bdate, l.pay_group,
           public.check_group_due(tc.check_id, l.pay_group) as due
    from target_checks tc
    join (select distinct cl.check_id, cl.pay_group from public.check_lines cl where cl.org_id = v_org) l
      on l.check_id = tc.check_id
  ),
  alloc as (
    -- SL1a: weight 按分・整数演算のみ【1】 base=div(due×w, W)・rem=(due×w) mod W
    select g.check_id, g.bdate, g.pay_group, nm.cid,
           ((g.due::bigint * nm.ratio_weight) / ws.w_total)::int  as base_part,
           ((g.due::bigint * nm.ratio_weight) % ws.w_total)       as rem_part,
           nm.position,
           g.due
    from groups g
    join noms nm on nm.check_id = g.check_id
    join wsum ws on ws.check_id = g.check_id
    where g.due > 0 and ws.w_total > 0 -- 全 weight 0 は按分不能＝除算ガード（set_nominations は weight>=1 を強制済み）
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.check_id, a.pay_group
                              order by a.rem_part desc, a.position asc) as rk,
           a.due - sum(a.base_part) over (partition by a.check_id, a.pay_group) as remainder_units
    from alloc a
  ),
  parts as (
    select r.cid, r.bdate,
           r.base_part + case when r.rk <= r.remainder_units then 1 else 0 end as part
    from ranked r
  ),
  sales_by_day as (
    select p.cid, p.bdate, sum(p.part)::int as sales_sum
    from parts p group by p.cid, p.bdate
  ),
  counts_by_day as (
    -- SL8a/D9a: 伝票単位カウント（distinct check）・★0119 裁定100: 種別は名簿行（キャスト別）・attendance 不参加
    --   0118 backfill により既存伝票は旧 checks.nom_type 由来と同値
    select nm.cid, tc.bdate,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'hon')::int   as hon_cnt,
           count(distinct tc.check_id) filter (where nm.nom_kind = 'jonai')::int as jonai_cnt,
           count(distinct tc.check_id) filter (where nm.is_dohan)::int           as dohan_cnt
    from noms nm
    join target_checks tc on tc.check_id = nm.check_id
    group by nm.cid, tc.bdate
  )
  select coalesce(s.cid, k.cid),
         coalesce(s.bdate, k.bdate),
         coalesce(s.sales_sum, 0),
         coalesce(k.hon_cnt, 0),
         coalesce(k.jonai_cnt, 0),
         coalesce(k.dohan_cnt, 0)
  from sales_by_day s
  full outer join counts_by_day k on k.cid = s.cid and k.bdate = s.bdate
  order by 2, 1;
end $function$
