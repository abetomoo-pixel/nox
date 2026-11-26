-- 0222_store_add_pay_from_source（裁定507＝支払日は店ごと・2026-11-26 起草と試走まで・適用はしない）
--   経緯：裁定507（Agoora 2026-11-26 16:52）で「給与の支払日は会社で 1 つ」（0203・set_org_pay_day）を改め、支払日は店ごとにした。締め日は月末固定のまま（裁定334）。精算方式も店ごと（起票171 の答え）。
--     0219（16:51:32 適用）の ops_store_add は「新しい店＝1 店目の stores.pay_day・会社の orgs.pay_day もそろえる」＝会社で 1 つの前提。
--   中身：ops_store_add の作り直し 1 本（同じ署名・CREATE OR REPLACE・ACL は 0203／0219 と同じ文で言い直す＝4 ロール revoke → service_role）。
--     新しい店の支払日の最初の値＝設定を写す元の店（p_copy_from があるとき・その店の stores.pay_day）＞ 1 店目（created_at, id の順）の stores.pay_day ＞ orgs.pay_day ＞ 25。
--     orgs.pay_day はもう書かない（0219 の「会社の値もそろえる」と監査の org_pay_day_before をやめた）。監査の after に pay_day_from（copy_from／first_store／org／default）を足す。
--     ops_inquiry_store_add は ops_store_add を呼ぶだけ＝作り直さない（p_copy_from をそのまま渡している）。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。行は 1 つも書かない（そろえの段は無い）。orgs.pay_day の列は残す（下の「残す訳」）。
--     set_org_pay_day は残す（画面から呼ばなくなった後に別の mig で閉じる案＝READY.md §3-4）。
--   orgs.pay_day を残す訳：読むのはこの関数の「店の無い会社に足す」ときだけ（ops_org_create は 1 店目を作るので本番では通らない）。列を落とすと verify:nox-ops の列の pin（orgs 33）と set_org_pay_day が壊れる。
--   翻訳元：本番の ops_store_add（0219 の後・md5(prosrc) df6bfd7db77decb9c64d2a6e11c5229d）。
--   本番の今の定義との差分：docs/tmp/pay_day_per_store_1126/diff_live.md。
--   事前確認：docs/tmp/pay_day_per_store_1126/0222_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/pay_day_per_store_1126/0222_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ops_store_add（作り直し） ═══
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
  v_from  text;      -- ★0222: 支払日をどこから取ったか（copy_from／first_store／org／default）
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
  -- ★0222（裁定507・支払日は店ごと）: 新しい店の支払日の最初の値＝設定を写す元の店（p_copy_from）の stores.pay_day ＞ 1 店目（作った順）の stores.pay_day ＞ orgs.pay_day ＞ 25。
  --   会社の値（orgs.pay_day）はもう書かない（0219 の「会社の値もそろえる」をやめた）。orgs.pay_day を読むのは、店の無い会社に足すときのここだけ。
  select s.pay_day into v_first from public.stores s where s.org_id = p_org_id order by s.created_at, s.id limit 1;
  v_pay := coalesce(v_src.pay_day, v_first, v_org.pay_day, 25);
  v_from := case when v_src.pay_day is not null then 'copy_from' when v_first is not null then 'first_store' when v_org.pay_day is not null then 'org' else 'default' end;
  insert into public.stores (org_id, name, short, settings_json, pay_day)
  values (p_org_id, v_sname, left(v_sname, 8), jsonb_build_object('biz_type', p_biz_type, 'setup_done', false), v_pay)
  returning id into v_store;
  if p_copy_from is not null then
    insert into public.setup_drafts (org_id, store_id, data, updated_by, updated_at)
    values (p_org_id, v_store, jsonb_build_object('copy', jsonb_build_object('from', p_copy_from, 'parts', to_jsonb(v_parts), 'by', 'ops', 'at', now())), null, now());
  end if;
  v_after := jsonb_build_object('store', v_sname, 'biz_type', p_biz_type, 'copy_from', p_copy_from, 'parts', to_jsonb(v_parts), 'pay_day', v_pay, 'pay_day_from', v_from);   -- ★0219: 入れた支払日・★0222: どこから取ったか（org_pay_day_before は無くした＝会社の値を書かない）
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

commit;
