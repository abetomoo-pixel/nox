-- 0227_keep_tag_follow_owner（食い違い #210・根 R31 の一部・相談役 11/26 22:10 の段イ・起草と試走まで・適用はしない）
--   経緯：伝票のボトルの行のお客様チップで持ち主を付け替えると、check_line_set_customer（最新 0190）は会計前（pending）のキープの customer_id だけを更新する。
--     タグ名（tag_label）は bottle_keep_register が登録のときに「{顧客名} {ボトル名}」で焼いた写し（0175 v2 ★22・裁定419）なので、前のお客様の名前のまま
--     新しいお客様のキープになる（顧客の詳細・キープの一覧・伝票のチップに出る）。前のお客様を匿名化しても残る（#204 と同じ根）。店の中の取り違え（違うお客様にボトルを出す）が主。
--   中身（1 本の作り直し・同じ署名・CREATE OR REPLACE・ACL は今と同じ文で言い直す＝revoke public, anon → grant authenticated）：
--     check_line_set_customer の pending のキープの付け替え（1 文）で、タグ名が「前のお客様の既定」（bottle_keep_register と同じ式＝left(顧客名 || ' ' || coalesce(ボトル名, 商品名), 60)）と
--     同じときだけ、新しいお客様の既定に作り直す。手で付けたタグ名（既定と違う）は残す。付け替えの道・権限・打刻ゲート・監査（customer_id の前後）は変えない（監査に名前は足さない＝#205）。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。bottle_keep_register（既定の式）・check_close（pending → active）・会計後（active）のキープ。
--   本番の今：タグ名が今のお客様の既定と違う pending のキープ 0 件（part3 の読み）＝今あるキープは 1 行も変わらない（付け替えたときだけ効く）。
--   ★重なり：anonymize_1126（#204〜#206 の便）は bottle_keeps のタグ名・メモを匿名化で消す向き。0227 は check_line_set_customer だけ＝関数は重ならない。
--   翻訳元：本番の check_line_set_customer（md5(prosrc) 97b2c1ec2e3b5742e0f634ce8b155adb）・bottle_keep_register（md5 ecdad464589735c0ecb88cd554635f53）の既定のタグ名の式。
--   本番の今の定義との差分：docs/tmp/keep_tag_1126/diff_live.md。
--   事前確認：docs/tmp/keep_tag_1126/0227_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/keep_tag_1126/0227_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ check_line_set_customer（作り直し・同じ署名） ═══
CREATE OR REPLACE FUNCTION public.check_line_set_customer(p_line_id uuid, p_customer_id uuid, p_keep boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_org uuid := public.auth_org_id();
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_line_set_customer');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  if p_line_id is null then raise exception 'forbidden'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_customer_id is not null and not exists (select 1 from public.check_customers where check_id = v_chk.id and customer_id = p_customer_id) then
    raise exception 'not on check';
  end if;
  update public.check_lines set customer_id = p_customer_id where id = p_line_id;
  -- ★5 0173（裁定392）: キープはレジで押した時点で顧客のキープ一覧に出る（status 'pending'＝会計前）。外す（customer null）と pending 行は消える。
  --   会計（check_close）で active・伝票取消（check_void）で削除。既に active の行がある購入行には作らない。
  if p_customer_id is null then
    delete from public.bottle_keeps where check_line_id = p_line_id and status = 'pending';
  elsif coalesce(p_keep, false) then
    if exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id and b.status = 'pending') then
      -- ★0227（#210）: 持ち主を付け替えたら、タグ名が前のお客様の既定（bottle_keep_register と同じ式＝left(顧客名 || ' ' || coalesce(ボトル名, 商品名), 60)）のままなら
      --   新しいお客様の既定に作り直す。手で付けたタグ名（既定と違う）は残す。式の中の b.customer_id は付け替える前の値（UPDATE の SET は前の行を読む）
      update public.bottle_keeps b set customer_id = p_customer_id, updated_at = now(),
        tag_label = coalesce((select left(nc.name || ' ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), pr.name), 60)
                                from public.customers oc, public.customers nc, public.products pr
                               where oc.id = b.customer_id and nc.id = p_customer_id and pr.id = b.product_id
                                 and b.tag_label = left(oc.name || ' ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), pr.name), 60)), b.tag_label)
       where b.check_line_id = p_line_id and b.status = 'pending';
    elsif not exists (select 1 from public.bottle_keeps b where b.check_line_id = p_line_id) then
      if v_line.product_id is null then raise exception 'bad line'; end if;
      perform public.bottle_keep_register(p_store_id => v_chk.store_id, p_customer_id => p_customer_id, p_product_id => v_line.product_id,
                                          p_check_line_id => p_line_id, p_status => 'pending');
    end if;
  end if;
  perform public.audit_log_write('check_line_set_customer', 'check_lines:' || p_line_id::text,
    jsonb_build_object('customer_id', v_line.customer_id), jsonb_build_object('customer_id', p_customer_id), v_chk.store_id);
end $function$;
revoke execute on function public.check_line_set_customer(uuid, uuid, boolean) from public, anon;
grant execute on function public.check_line_set_customer(uuid, uuid, boolean) to authenticated;

commit;
