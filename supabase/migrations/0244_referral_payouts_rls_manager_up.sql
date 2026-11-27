-- 0244_referral_payouts_rls_manager_up（裁定514-5・11/27 03:25 Agoora の決め・起草と試走まで・適用はしない）
--   決め：紹介料の行（public.referral_payouts）を読めるのは店長以上（owner と manager・manager は自店）。スタッフとキャストは行を読めない。
--     スタッフの日報の画面は 0235 の daily_report_referral_cash（合計の数だけ・report_can_close の人）で読む＝入れる順は 0235 の後。
--   今（本番・0152 以来）：referral_payouts_select＝標準店スコープ かつ auth_role() <> 'cast'＝スタッフは締めの許可が無くても自店の行を読める。
--   中身：referral_payouts_select の作り直し 1 本（drop → create・同じ名前・for select to authenticated・permissive）。
--     新しい式＝標準店スコープ（org_id = auth_org_id() and (auth_role() = 'owner' or store_id = auth_store_id())）かつ auth_role() in ('owner','manager')。
--     auth_role() は membership の admin を owner として返す（0175）＝admin もオーナーと同じに読める（今と同じ）。
--   変えないもの：表・列・索引・grant（authenticated=SELECT だけ・anon なし）・関数（525／0235 の後は 526）・referrers の 2 本のポリシー・書込ポリシーは作らない。
--     この表を読む関数（check_close／check_void／daily_report_close／referral_payout_pay／referral_payouts_unpaid／0235 の daily_report_reclose・daily_report_referral_cash）は
--     全部 SECURITY DEFINER・所有者 postgres（bypassrls）＝RLS の影響を受けない＝締め・再締め・会計・取消・支払・未払一覧の数は変わらない（事前確認で止める）。
--   翻訳元：本番の referral_payouts_select（0152・md5(qual) 9a549fb4bc9117fcefc9a8527ecc2ea6）・店長以上の型は cast_provisionals_select。
--   事前確認：docs/tmp/referral_rls_1127/0244_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・各行の ok が全部 true なら合う・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/referral_rls_1127/0244_verify.sql。
begin;
set local lock_timeout = '10s';

-- 当てる前の柵（事前確認と同じ物の要点）：作り直すポリシーが今の定義のまま・この表を読む関数が全部 SECURITY DEFINER でないなら止める（全部ロールバック）
do $$
declare v_n int; v_q text;
begin
  select count(*), max(md5(coalesce(pg_get_expr(p.polqual, p.polrelid), ''))) into v_n, v_q
    from pg_policy p where p.polrelid = 'public.referral_payouts'::regclass;
  if v_n <> 1 or v_q <> '9a549fb4bc9117fcefc9a8527ecc2ea6'
     or not exists (select 1 from pg_policy p where p.polrelid = 'public.referral_payouts'::regclass and p.polname = 'referral_payouts_select' and p.polcmd = 'r' and p.polpermissive) then
    raise exception '0244: referral_payouts のポリシーが起草のときと違う（% 本・qual md5 %）', v_n, v_q;
  end if;
  if exists (select 1 from pg_proc f join pg_roles r on r.oid = f.proowner
              where f.prosrc ilike '%referral_payouts%' and f.pronamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                and not (f.prosecdef and r.rolbypassrls)) then
    raise exception '0244: referral_payouts を読む SECURITY INVOKER（または bypassrls でない所有者）の関数がある＝RLS を絞ると数が変わる';
  end if;
end $$;

drop policy referral_payouts_select on public.referral_payouts;
create policy referral_payouts_select on public.referral_payouts
  as permissive for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() = any (array['owner', 'manager'])   -- ★0244（裁定514-5）: 店長以上だけ＝スタッフ・キャストは 0 行（日報の予定額は 0235 の daily_report_referral_cash）
  );

commit;
