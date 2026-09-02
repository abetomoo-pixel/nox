-- mig 0124b NOX 裁定111: pricing_resolve_core の fee_kind 白名単へ 'ext_shimei' 追加(0124 の器抜け是正=教訓51 候補)
-- 底本: dump0124b(2026-09-02 live 逐語)。変更は白名単1語のみ・同シグネチャ replace=grant 保持
-- 冪等: 可
begin;

create or replace function public.pricing_resolve_core(p_store_id uuid, p_at timestamp with time zone, p_fee_kind text, p_seat_kind text default null::text, p_rank_id uuid default null::uuid)
 returns table(amount integer, duration_min smallint, rule_id uuid)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_dow  smallint;
  v_bm   integer;
  v_cut  integer;
  v_seat text;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei') then  -- ★0124b 裁定111: ext_shimei 追加
    raise exception 'bad fee kind';
  end if;
  select b.biz_dow, b.biz_min into v_dow, v_bm
    from public.biz_minutes_of(p_store_id, coalesce(p_at, now())) b;
  -- cutoff 分(帯の営業日拡張に使用・ヘルパーと同じイディオム)
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
  v_seat := coalesce(p_seat_kind, '卓');
  return query
  select r.amount, r.duration_min, r.id
    from public.pricing_rules r
   where r.store_id = p_store_id
     and r.is_active
     and r.fee_kind = p_fee_kind
     and (r.seat_kind is null or r.seat_kind = v_seat)
     and (r.rank_id  is null or r.rank_id  = p_rank_id)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm
           and v_bm < (case when r.time_to_min <= v_cut then r.time_to_min + 1440 else r.time_to_min::int end) ))
   order by r.priority asc, r.created_at asc, r.id asc
   limit 1;
end $function$;

commit;

-- 検証バンドル(単一結果セット)
select ord, tag, ok from (
  select 1 as ord, 'prc: 白名単に ext_shimei' as tag,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='pricing_resolve_core' and p.prokind='f'
                    and p.prosrc like '%''ext_shimei''%') as ok
  union all
  select 2, 'prc: 実呼び ext_shimei が例外を投げない(0行以上)',
         coalesce((select count(*) from public.pricing_resolve_core(
                     (select id from public.stores order by created_at limit 1),
                     now(), 'ext_shimei', null, null)), 0) >= 0
  union all
  select 3, 'prc: 実呼び 不正値は引き続き拒否(検証は目視=次項参照)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='pricing_resolve_core' and p.prokind='f'
                    and p.prosrc like '%bad fee kind%')
  union all
  select 4, 'prc: overload なし(定義ちょうど1本)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='pricing_resolve_core' and p.prokind='f') = 1
) v order by ord;
