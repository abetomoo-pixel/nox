-- 0149_demo_org_reset.sql
-- 裁定273（業態別公開デモ）・276（種は録画再生・demo_org_reset は表非依存の汎用形）・277（0149 の設計）＝2026-09-18 起草（CC 写経・パス 1）。
-- 写経元: revoke／grant と SECURITY DEFINER 骨格＝payroll_mark_paid（0016_f2c_payroll_schema_finalize.sql 501〜502 逐語・live 署名）／
--   監査＝audit_log_write_service（live 署名 8 引数・p_actor は null 可）／storage policy＝cast-photos の live 定義（docs/tmp/0918_w_live.md 逐語）。
--   ★1〜★10 は相談役指定（本便 AC）。★以外の行は写経元と diff 0。表順は docs/tmp/0149_pre.md w2（FK 246 からの機械整列・68 手）に memberships を加えた 69 手（裁定278-1／279-1・便 AI）。
--
-- 変更点（★・貼付順）:
--   ★1 orgs.is_demo boolean not null default false
--   ★2 orgs.demo_reset_at timestamptz
--   ★3 demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text default 'all') returns jsonb・SECURITY DEFINER・set search_path＝写経元どおり 'public'。
--       冒頭ガード（この順）: 'bad mode' → 'not demo' → 'bad payload'（all／load のみ）
--   ★4 表順は関数内の定数配列 2 本（削除順 69 手＝w2 の 1〜68 の stores 直前に memberships・53 手目は stock_logs 再削除／投入順＝逆順で 53 手目を除く 68 表・stores 直後に memberships）。
--       SQL は format('%I') と配列要素のみ。payload のキーが投入配列に無い・残す 3 表（orgs／org_billing／users）のキー→ 'bad table'（裁定278-1）
--   ★5 wipe＝各表 delete … where org_id = p_org_id（w2 の 68 手全表が org_id 列を持つ＝w2 で確認済み）。表ごとの削除件数を jsonb に積む
--       ★唯一の例外（裁定279-1）: memberships は org_id 列を持たない＝ delete … where store_id in (select id from stores where org_id = p_org_id)
--   ★6 load＝payload->表 の全要素で (elem->>'org_id')::uuid = p_org_id を検査（1 行でも不一致→ 'org mismatch'）→ jsonb_populate_recordset で投入・件数を積む。
--       ★唯一の例外（裁定279-1）: memberships は投入直前（stores 投入済み）に「全行の store_id が stores(org_id=p_org_id) に実在・user_id が users(org_id=p_org_id) に実在」を検査・不成立→ 'org mismatch'
--       stock_logs は reason が 'sale'／'sale_remove' の行があれば 'bad stock_logs'（トリガ生成分と二重になる）
--   ★7 check_lines 投入の直後に、トリガ（stock_on_check_line・at＝now()＝本 tx）が作った stock_logs の sale 行の at を対応する check_lines.created_at へ当て直す。
--       ★結合キー＝stock_logs に check_id／line_id は無い（live 列: id/org_id/store_id/product_id/delta/reason/by_user_id/at）＝
--         (store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる多重集合対応（同一区画内は同じ時刻集合になる）。列としての結合キーは存在しない＝相談役の判断点（AD 報告）。
--   ★8 末尾: demo_reset_at = now()（mode=wipe では更新しない）・audit_log_write_service 1 行（action 'demo.reset'・mode と件数）・戻り {mode, deleted, inserted}
--   ★9 revoke all … from public, anon, authenticated／grant execute … to service_role（写経元 0016:501〜502 の逐語＝revoke execute→本 mig は 0146 流の revoke all）。課金ゲート行は置かない（名簿 B(a)）
--   ★10 storage: cast-photos の insert／update policy に `and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)` を追加（drop→create・他の句は逐語）。select は不触（delete policy は live に無い）
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   -- 1) orgs 列 8（末尾 is_demo, demo_reset_at）・is_demo not null default false
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name='orgs' order by ordinal_position;                                  -- 8 行
--   -- 2) 新 RPC 1 本: 署名・secdef・search_path・proacl（service_role のみ・anon／authenticated／PUBLIC なし）
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig, proacl from pg_proc
--     where pronamespace='public'::regnamespace and proname='demo_org_reset';                                        -- {postgres=X/postgres,service_role=X/postgres}
--   -- 3) 'billing locked' を持たない（名簿 B(a)）
--   select prosrc like '%billing locked%' from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset';   -- f
--   -- 4) storage policy 4 本（insert／update の with_check／qual に is_demo 句・select 不変）
--   select policyname, cmd, with_check, qual from pg_policies where schemaname='storage' and tablename='objects' order by 1;
--   -- 5) 不触の md5（money-core 3 本・set_store_* 13 本・check_group_due・audit_log_write_service）が貼付前の控えと一致
--   select proname, md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname in
--     ('check_pay','check_close','check_void','check_group_due','audit_log_write_service','payroll_mark_paid') order by 1;
--   -- 6) 既存 org は全て is_demo=false・demo_reset_at null
--   select is_demo, count(*) from public.orgs group by 1;                                                            -- false 3
--   -- 7) 動作（service 経路）＝suite demo-seed（裁定273-4）で。ROLLBACK 実証は docs/tmp/0149_poc.md／AD-f。

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1／★2 orgs: is_demo／demo_reset_at
-- ══════════════════════════════════════════════════════════════
alter table public.orgs
  add column is_demo boolean not null default false;                                                  -- ★1
alter table public.orgs
  add column demo_reset_at timestamptz;                                                               -- ★2

-- ══════════════════════════════════════════════════════════════
-- ★3〜★8 demo_org_reset（骨格＝payroll_mark_paid の写経・監査＝audit_log_write_service）
-- ══════════════════════════════════════════════════════════════
create or replace function public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_pin','cast_plan',
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_adjustments','payslips',
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','casts','product_categories','staff_shift_patterns','cast_ranks','memberships','stores'];
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）
  c_load constant text[] := array[
    'stores','memberships','cast_ranks','staff_shift_patterns','product_categories','casts','staff_shift_wishes','shift_wishes','shift_periods','seats','products',
    'pricing_categories','payroll_runs','kiosk_devices','customers','checks','check_lines','withholding_payments','trials','transport','store_sales_targets',
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','daily_reports','customer_notes','custom_back_defs','comp_plans',
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_norms',
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $$;

-- ★9 revoke／grant（写経元＝0016_f2c_payroll_schema_finalize.sql 501〜502・0146 流の revoke all）
revoke all on function public.demo_org_reset(uuid, jsonb, text) from public, anon, authenticated;
grant  execute on function public.demo_org_reset(uuid, jsonb, text) to service_role;

-- ══════════════════════════════════════════════════════════════
-- ★10 storage: cast-photos の insert／update policy に is_demo 句（drop→create・他の句は live 逐語）
-- ══════════════════════════════════════════════════════════════
drop policy cast_photos_insert on storage.objects;
create policy cast_photos_insert on storage.objects
  for insert to authenticated
  with check (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10
  );
drop policy cast_photos_update on storage.objects;
create policy cast_photos_update on storage.objects
  for update to authenticated
  using (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10
  )
  with check (
    ((bucket_id = 'cast-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND ((EXISTS ( SELECT 1
       FROM casts c
      WHERE ((((c.id)::text || '.jpg'::text) = storage.filename(objects.name)) AND (c.org_id = auth_org_id()) AND ((auth_role() = 'owner'::text) OR ((auth_role() = 'manager'::text) AND (c.store_id = auth_store_id())))))) OR ((auth_cast_id() IS NOT NULL) AND (storage.filename(name) = ((auth_cast_id())::text || '.jpg'::text)))))
    and not exists (select 1 from public.orgs o where o.id = auth_org_id() and o.is_demo)                 -- ★10
  );

commit;

-- 手貼り末尾の確認（0147／0148 と同形）:
-- select 'nox-project-proof', count(*) from public.orgs;                                                             -- 3
-- select proname, proacl from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset';        -- {postgres=X/postgres,service_role=X/postgres}
