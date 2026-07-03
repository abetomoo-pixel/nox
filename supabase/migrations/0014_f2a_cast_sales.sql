-- 0014_f2a_cast_sales: F2a — cast 日次売上集計（cast_sales_aggregate 内部＋get_cast_sales 公開）
--                      精密仕様 §7-1（台帳 #21 確定）の DB 結線
--
-- 翻訳元・裁定参照:
--  - 精密仕様 §7-1（2026-07-03 確定）… SL1a=在席 nomination 全員に weight 按分（円は最大剰余法）／
--    SL2a=金額基盤は group due（サ料込・100円丸め後＝check_group_due 既存関数を再利用・カードTAX 除外）／
--    SL3a=全 nom_type 帰属／SL4a=フリー卓（nomination 無し）非帰属／SL5a=biz-date（started_at 帰属・
--    日報と同一規則）／SL6a=closed かつ非 void のみ計上（売掛は close 時計上＝発生主義）／
--    SL8a=hon/jonai/dohan は伝票単位カウント（同一伝票内の同 cast 同 nom_type は1・
--    attendance の dohan は不参加＝勤怠層）。
--  - F2a plan 裁定 … D6a=get_cast_sales は staff 拒否（cast 別金額は castMng 領域）／
--    D7a=按分の正は DB＝本関数・TS 鏡像 lib/nox/sales-alloc.ts は verify 専用／
--    D9a=hon/jonai/dohan カウントは cast_sales_aggregate の同居列（同一スキャン・別関数禁止）。
--
-- 実装ノート:
--  【1】最大剰余法は整数演算のみ: base=div(due×w, W)・剰余=（due×w) mod W。
--      剰余降順→position 昇順で R=due−Σbase 件に+1。バック分配（check_recalc/close 系）の
--      「整数剰余降順→position 昇順」と同型＝浮動小数を経由しない（TS/DB 決定的同一の前提）。
--  【2】営業日帰属は daily_report_aggregate と同一規則（[D cutoff, D+1 cutoff)・started_at 帰属・
--      cutoff は stores.settings_json.biz_cutoff_hm 既定 06:00）を日付範囲版に一般化:
--      biz_date = (JST(started_at) − cutoff)::date。DB での時刻計算は F1d 方針の明示的逸脱の
--      2箇所目にあたるため、TS bizDateOf との同値を verify で係留（1箇所目と同じ扱い）。
--  【3】原則8 の org 自衛: 要。cast_sales_aggregate は「再利用が予想される集計ヘルパー」
--      （daily_report_aggregate 型＝F2c payroll のサーバ再計算からも呼ばれる予定）のため、
--      store→org を自ら解決し全参照テーブルに org 条件を含める（呼び出し元照合に依存しない）。
--  【4】get_cast_sales は読み取り専用＝audit 不要（get_cast_ranking 前例）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) prosrc 実測（2本・承認版との一字照合）
--   select proname, prosrc from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('cast_sales_aggregate','get_cast_sales')
--    order by proname;
--   -- 2) ACL 実測（get_cast_sales=authenticated のみ・cast_sales_aggregate=grant なし
--   --    （proacl に anon/authenticated/service_role が現れないこと））
--   select proname, proacl from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('cast_sales_aggregate','get_cast_sales')
--    order by proname;
--   -- 3) 動作アンカー（JWT が要るため SQL Editor では不可・F2a-2 verify 追記コミットで実施）:
--   --    verify:nox-anon-guard … get_cast_sales anon BLOCKED・cast_sales_aggregate 両ロール BLOCKED。
--   --    verify:nox-rls … 手計算ゴールデン（castA1a=32,640／castA1b=21,760／Σ=54,400＝checks.total 恒等）・
--   --      void 除外（check2 の 3,300 が不算入）・フリー卓差分観測（check3 の 1,600 が誰にも帰属しない）・
--   --      3-way 剰余（due1,600×w1:1:1→534/533/533・position 昇順タイブレーク）・D9a カウント列・
--   --      D6a（staff 拒否・cast 本人のみ・manager 全行）・TS 鏡像 sales-alloc との同値。

begin;

-- ══════════════════════════════════════════════════════════════
-- 内部: cast_sales_aggregate（§7-1 の按分本体・4ロール revoke・org 自衛【3】）
-- 返却: (cast_id, biz_date, sales, hon, jonai, dohan) ＝ D9a 同居列・同一スキャン
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_sales_aggregate(
  p_store_id uuid,
  p_from     date,
  p_to       date
) returns table (
  cast_id  uuid,
  biz_date date,
  sales    int,
  hon      int,
  jonai    int,
  dohan    int
) language plpgsql stable security definer set search_path = public as $$
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
    select n.check_id, n.cast_id as cid, n.ratio_weight, n.position
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
    -- SL8a/D9a: 伝票単位カウント（distinct check）・nom_type は checks 側・attendance 不参加
    select nm.cid, tc.bdate,
           count(distinct tc.check_id) filter (where tc.nom_type = 'hon')::int   as hon_cnt,
           count(distinct tc.check_id) filter (where tc.nom_type = 'jonai')::int as jonai_cnt,
           count(distinct tc.check_id) filter (where tc.nom_type = 'dohan')::int as dohan_cnt
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
end $$;
revoke execute on function public.cast_sales_aggregate(uuid, date, date) from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- 公開: get_cast_sales（owner/manager=全 cast・cast=本人のみ・staff=拒否＝D6a）
-- 読み取り専用＝audit 不要（get_cast_ranking 前例）
-- ══════════════════════════════════════════════════════════════
create or replace function public.get_cast_sales(
  p_store_id uuid,
  p_from     date,
  p_to       date
) returns table (
  cast_id  uuid,
  biz_date date,
  sales    int,
  hon      int,
  jonai    int,
  dohan    int
) language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid;
  v_role text;
  v_self uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- owner は org 全店・manager/cast は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_role := public.auth_role();
  if v_role = 'staff' then raise exception 'forbidden'; end if; -- D6a: cast 別金額は castMng 領域
  if v_role not in ('owner','manager','cast') then raise exception 'forbidden'; end if;

  if v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if; -- fail-closed
    return query
      select a.cast_id, a.biz_date, a.sales, a.hon, a.jonai, a.dohan
      from public.cast_sales_aggregate(p_store_id, p_from, p_to) a
      where a.cast_id = v_self;
  else
    return query
      select a.cast_id, a.biz_date, a.sales, a.hon, a.jonai, a.dohan
      from public.cast_sales_aggregate(p_store_id, p_from, p_to) a;
  end if;
end $$;
revoke execute on function public.get_cast_sales(uuid, date, date) from public, anon;
grant  execute on function public.get_cast_sales(uuid, date, date) to authenticated;

commit;
