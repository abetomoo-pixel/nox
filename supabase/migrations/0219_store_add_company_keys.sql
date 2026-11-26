-- 0219_store_add_company_keys（起票169・相談役 11/26 の便 M の M1・起草と試走まで・適用はしない）
--   経緯：2026-11-26 16:06 に運営の窓口（ops_inquiry_store_add → ops_store_add）で TEST CLUB に TEST2 CLUB を足した。支払日は会社で 1 つ（0203）なのに、
--     新しい店の stores.pay_day は 25・TEST CLUB は 10 にずれた（verify:nox-multi-store (3) が赤）。
--   本当の原因（本番の監査で確かめた）：TEST CLUB は 1 店の会社のとき（15:59:54）に初期設定の set_store_profile で stores.pay_day を 25→10 に直した。
--     set_store_profile は stores.pay_day だけを書き、orgs.pay_day（0203 の埋め戻しの 25）は残った。ops_store_add は orgs.pay_day を先に見る
--     （coalesce(v_org.pay_day, min(店), 25)）＝ずれた 25 が新しい店に入った。画面（店舗設定・給与・月報）は全部 stores.pay_day を読み、orgs.pay_day を読む画面は無い。
--   中身：
--     ★1 ops_store_add の作り直し 1 本（同じ署名・CREATE OR REPLACE・ACL は 0203 と同じ文で言い直す＝4 ロール revoke → service_role）。
--        新しい店の支払日＝1 店目（created_at, id の順）の stores.pay_day ＞ orgs.pay_day ＞ 25。orgs.pay_day がずれていたら同じ値にそろえる。監査の after に pay_day（とそろえた前の値）を足す。
--        ops_inquiry_store_add は ops_store_add を呼ぶだけ＝作り直さない。store_copy_settings は支払日に触れない（名簿で写さない）＝作り直さない。
--     ★2 1 回だけのそろえ：デモでない会社で、店の stores.pay_day か orgs.pay_day（null は「まだ決めていない」＝触らない）が 1 店目（created_at, id の順）の stores.pay_day と違うものを 1 店目の値にそろえる。
--        変えた店・会社ごとに監査 1 行（action 'mig0219.align_pay_day'・actor_kind 'system'・actor_ref 'mig0219'）。ずれが無ければ何もしない（行も監査も 0）。
--        本番の今（起草のとき）：TEST CLUB だけ（店 TEST2 CLUB 25→10・会社 25→10）。NOX-VERIFY-A（25,25）・NOX-CHECK-代行（10,10）は変わらない。
--   変えないもの：表・列・索引・ほかの関数（関数の数 525・表 133 のまま）。締め日（月末固定＝裁定334）・給与の期間（暦月）は値を持たない。精算方式（settlement_cycle）は今は店ごと。
--   翻訳元：本番の ops_store_add（md5(prosrc) 4b8b44e31b75bca38af9256ba7a985b0）・set_org_pay_day（会社の全店の stores.pay_day をそろえる形）。
--   本番の今の定義との差分：docs/tmp/store_add_pay_1126/diff_live.md。
--   事前確認：docs/tmp/store_add_pay_1126/0219_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/store_add_pay_1126/0219_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 ops_store_add（作り直し） ═══
CREATE OR REPLACE FUNCTION public.ops_store_add(p_ops uuid, p_org_id uuid, p_store_name text, p_biz_type text, p_copy_from uuid, p_copy_parts text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   public.orgs;
  v_store uuid;
  v_sname text := btrim(coalesce(p_store_name, ''));
  v_src   public.stores;
  v_parts text[];
  v_pay   integer;
  v_first integer;   -- ★0219: 1 店目（作った順）の stores.pay_day
  v_after jsonb;     -- ★0219: 監査の after（入れた支払日を足す）
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  select * into v_org from public.orgs where id = p_org_id;
  if v_org.id is null then raise exception 'not found'; end if;
  if v_org.is_demo then raise exception 'forbidden (demo)'; end if;
  if length(v_sname) not between 1 and 40 then raise exception 'bad name'; end if;
  if exists (select 1 from public.stores s where s.org_id = p_org_id and s.name = v_sname) then raise exception 'dup store'; end if;
  if p_biz_type is null or p_biz_type not in ('cabaret', 'girlsbar', 'snack', 'lounge', 'bar', 'host') then raise exception 'bad biz type'; end if;
  if p_copy_from is not null then
    select * into v_src from public.stores where id = p_copy_from;
    if v_src.id is null or v_src.org_id <> p_org_id then raise exception 'bad copy from'; end if;
    if coalesce(v_src.settings_json->>'setup_done', '') <> 'true' then raise exception 'copy from not ready'; end if;
    select array_agg(distinct x order by x) into v_parts from unnest(coalesce(p_copy_parts, '{}'::text[])) x;
    if coalesce(cardinality(v_parts), 0) = 0 or exists (select 1 from unnest(v_parts) x where x not in ('pricing', 'products', 'comp', 'settings', 'hours')) then raise exception 'bad parts'; end if;
  elsif coalesce(cardinality(p_copy_parts), 0) > 0 then
    raise exception 'bad parts';
  end if;
  -- ★0219（起票169）: 支払日は会社で 1 つ＝1 店目（作った順）の stores.pay_day を正にする（画面の表示と保存の比べは stores.pay_day・orgs.pay_day を読む画面は無い）。
  --   1 店目が無いときだけ orgs.pay_day・それも無ければ 25。orgs.pay_day がずれていたら同じ値にそろえる（前は orgs.pay_day を先に見た＝ずれた 25 が新しい店に入った）
  select s.pay_day into v_first from public.stores s where s.org_id = p_org_id order by s.created_at, s.id limit 1;
  v_pay := coalesce(v_first, v_org.pay_day, 25);
  insert into public.stores (org_id, name, short, settings_json, pay_day)
  values (p_org_id, v_sname, left(v_sname, 8), jsonb_build_object('biz_type', p_biz_type, 'setup_done', false), v_pay)
  returning id into v_store;
  if v_org.pay_day is distinct from v_pay then
    update public.orgs set pay_day = v_pay where id = p_org_id;   -- ★0219: 会社の値も 1 店目にそろえる
  end if;
  if p_copy_from is not null then
    insert into public.setup_drafts (org_id, store_id, data, updated_by, updated_at)
    values (p_org_id, v_store, jsonb_build_object('copy', jsonb_build_object('from', p_copy_from, 'parts', to_jsonb(v_parts), 'by', 'ops', 'at', now())), null, now());
  end if;
  v_after := jsonb_build_object('store', v_sname, 'biz_type', p_biz_type, 'copy_from', p_copy_from, 'parts', to_jsonb(v_parts), 'pay_day', v_pay)   -- ★0219: 入れた支払日
          || case when v_org.pay_day is distinct from v_pay then jsonb_build_object('org_pay_day_before', v_org.pay_day) else '{}'::jsonb end;
  perform public.ops_audit_write(p_ops, p_org_id, 'ops.store.add', 'stores:' || v_store::text, null,
    v_after, null, v_store, false);
  insert into public.audit_logs (org_id, store_id, actor_user_id, actor_ops_id, action, target, before_json, after_json, reason)
  values (p_org_id, v_store, null, p_ops, 'ops.store.add', 'stores:' || v_store::text, null,
          v_after, null);
  return jsonb_build_object('store_id', v_store, 'parts', to_jsonb(v_parts));
end $function$
;
revoke all on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) from public, anon, authenticated, service_role;
grant execute on function public.ops_store_add(uuid, uuid, text, text, uuid, text[]) to service_role;

-- ═══ ★2 1 回だけのそろえ（会社の支払日を 1 店目の値に・ずれが無ければ何もしない） ═══
do $mig0219$
declare
  r record;
begin
  -- 店：1 店目と違う店を 1 店目の値に
  for r in
    with f as (select distinct on (s.org_id) s.org_id, s.id first_id, s.pay_day first_pay from public.stores s order by s.org_id, s.created_at, s.id)
    select s.id store_id, s.org_id, s.pay_day before_pay, f.first_id, f.first_pay
      from public.stores s join f on f.org_id = s.org_id join public.orgs o on o.id = s.org_id
     where not o.is_demo and s.pay_day is distinct from f.first_pay
     order by s.org_id, s.created_at, s.id
  loop
    update public.stores set pay_day = r.first_pay where id = r.store_id;
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason, actor_kind, actor_ref)
    values (r.org_id, r.store_id, null, 'mig0219.align_pay_day', 'stores:' || r.store_id::text, jsonb_build_object('pay_day', r.before_pay),
            jsonb_build_object('pay_day', r.first_pay, 'first_store', r.first_id), '0219: 支払日は会社で 1 つ＝1 店目の値にそろえる（起票169）', 'system', 'mig0219');
  end loop;
  -- 会社：orgs.pay_day があり、1 店目と違う会社を 1 店目の値に
  for r in
    with f as (select distinct on (s.org_id) s.org_id, s.id first_id, s.pay_day first_pay from public.stores s order by s.org_id, s.created_at, s.id)
    select o.id org_id, o.pay_day before_pay, f.first_id, f.first_pay
      from public.orgs o join f on f.org_id = o.id
     where not o.is_demo and o.pay_day is not null and o.pay_day <> f.first_pay   -- 会社の値が無い（null＝ops_org_create で作った会社）は「まだ決めていない」＝触らない
     order by o.id
  loop
    update public.orgs set pay_day = r.first_pay where id = r.org_id;
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason, actor_kind, actor_ref)
    values (r.org_id, r.first_id, null, 'mig0219.align_pay_day', 'orgs:' || r.org_id::text, jsonb_build_object('pay_day', r.before_pay),
            jsonb_build_object('pay_day', r.first_pay, 'first_store', r.first_id), '0219: 支払日は会社で 1 つ＝1 店目の値にそろえる（起票169）', 'system', 'mig0219');
  end loop;
end $mig0219$;

commit;
