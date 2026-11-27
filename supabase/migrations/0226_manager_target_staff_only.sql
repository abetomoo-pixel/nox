-- 0226_manager_target_staff_only（食い違い #113・#344・根 R34「管理者と店長の境目」・相談役 11/26 22:10 の段イ・裁定511-4・起草と試走まで・適用はしない）
--   経緯：
--     #113 staff_deactivate（最新 0193）・staff_reactivate（最新 0088）は「owner か、manager ∧ 自店」だけを見て、対象の役割が店長でも通す
--       ＝同じ店の店長が、ほかの店長の在籍を解除・再雇用できる。役割の変更（set_membership_role）・報酬（staff_contract_set）はオーナーだけ／店長は staff だけ、と非対称。
--     #344 get_staff_sensitive・set_staff_sensitive（0193）の店長の枝は「相手が owner でない」だけを見る
--       ＝ほかの店長の本名・生年月日・住所・電話・振込先を、同じ店の店長が読めて書き換えられる。
--       ★前提の違い：#344 が名指しした「管理者（請求なし）」（role 'admin'）は、0194 から memberships_role_check（owner・manager・staff・cast）で置けない（本番 0 行・試走で insert が断られる）。
--         穴の今の形は「相手がほかの店長」のとき（関数の注「管理者の行は管理者だけ」は owner の行で守られている）。
--   裁定511-4（Agoora 11/26）：同じ店の店長はほかの店長の在籍を解除できない（オーナーと管理者だけ）。
--   中身（4 本の作り直し・同じ署名・CREATE OR REPLACE・ACL は今と同じ文で言い直す＝revoke public, anon → grant authenticated）：
--     staff_deactivate・staff_reactivate：権限の判定の直後に「v_role = 'manager' なら対象は role 'staff' だけ（ほかは forbidden）」を 1 文足す。
--       オーナー（と管理者＝auth_role() 'owner'）は今のまま。owner の行の扱い（auth_role_raw・最後の 1 人）・PIN の削除・端末のセッションの終了・監査は変えない。
--     get_staff_sensitive：店長の枝を「自店 ∧ 対象 role 'staff'」に（本人の枝 auth_membership_id() は今のまま）。
--     set_staff_sensitive：店長の枝を「自店 ∧（対象 role 'staff' か本人）」に（店長が自分の行を直す道は残す）。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。auth_role() が admin を owner に写す決め（0175 ★28）。
--   同じ型で残るもの（0226 では触らない・READY.md の 4 に列挙）：staff_update_profile（名前・電話・LINE ID）・set_membership_title（肩書）・staff_pin_unlock（PIN の解除）は、店長がほかの店長にもできる。
--   ★重なり：retire_login_1126（#62・#110 の便）が staff_deactivate・staff_reactivate を作り直す見込み。後から当てる方は先の方の本文の上に作り直すこと（事前確認の md5 が止める）。
--   翻訳元：本番の 4 本（md5(prosrc)：staff_deactivate 4389db8af6a3b1317d58e242988fe440・staff_reactivate 4193bc42c4f277166bdcc51013942948・
--     get_staff_sensitive 703c7ca8bcc6dca7ae4826b1692a7be8・set_staff_sensitive a071ae0e7e292d3d172f597d6b5a25ec）。
--   本番の今の定義との差分：docs/tmp/mgr_admin_1126/diff_live.md。
--   事前確認：docs/tmp/mgr_admin_1126/0226_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/mgr_admin_1126/0226_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ staff_deactivate（作り直し・同じ署名） ═══
CREATE OR REPLACE FUNCTION public.staff_deactivate(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 対象 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★0226（#113・裁定511-4）: 店長が在籍を解除できるのは自店のスタッフだけ＝ほかの店長・管理者はオーナーと管理者（auth_role()='owner'）だけ（役割の変更 set_membership_role・報酬 staff_contract_set と同じ幅）
  if v_role = 'manager' and v_row.role <> 'staff' then raise exception 'forbidden'; end if;

  -- 対象は staff/manager のみ。owner の在籍解除は禁止（owner を消す経路を封じる）。cast は別画面。
  if v_row.role not in ('staff','manager','owner') then raise exception 'bad target'; end if;   -- ★0193: 管理者の退店も（管理者だけが実行・最後の 1 人は不可）
  if v_row.role = 'owner' then
    if public.auth_role_raw() <> 'owner' then raise exception 'forbidden'; end if;
    perform pg_advisory_xact_lock(hashtext('nox-owner:' || v_org::text));
    if not exists (select 1 from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active and m.id <> v_row.id) then raise exception 'last owner'; end if;
  end if;

  -- 既に inactive なら明示拒否
  if not v_row.is_active then raise exception 'already inactive'; end if;

  update public.memberships set is_active = false where id = p_membership_id;
  if v_row.role = 'owner' then   -- ★0193: 管理者の退店は残る管理者全員に知らせる
  -- 既存の管理者全員へ（管理者がいる店ごとに 1 件・宛先 'owners'＝管理者だけが読む）
  insert into public.notices (org_id, store_id, title, body, audience, pinned, created_by)
  select v_org, x.store_id, '管理者の退店', (select coalesce(u.name, '') from public.users u where u.id = v_row.user_id) || ' さん（管理者）が退店になりました', 'owners', false, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active)
    from (select distinct m.store_id from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = v_org and m.role = 'owner' and m.is_active) x;
  end if;
  -- ★0190（裁定436 ①c）: 退店＝PIN の削除とキオスクのセッション終了。auth の失効・ban は route が RPC の後に呼ぶ
  delete from public.staff_pin where membership_id = p_membership_id;
  update public.kiosk_sessions set ended_at = now(), end_reason = 'retired' where membership_id = p_membership_id and ended_at is null;

  perform public.audit_log_write('staff_deactivate', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;
revoke execute on function public.staff_deactivate(uuid) from public, anon;
grant execute on function public.staff_deactivate(uuid) to authenticated;

-- ═══ staff_reactivate（作り直し・同じ署名） ═══
CREATE OR REPLACE FUNCTION public.staff_reactivate(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★0226（#113・裁定511-4）: 店長が在籍を戻す（再雇用）できるのは自店のスタッフだけ＝ほかの店長・管理者はオーナーと管理者（auth_role()='owner'）だけ（役割の変更 set_membership_role・報酬 staff_contract_set と同じ幅）
  if v_role = 'manager' and v_row.role <> 'staff' then raise exception 'forbidden'; end if;

  -- 対象は staff/manager のみ
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- 既に active なら明示拒否
  if v_row.is_active then raise exception 'already active'; end if;

  -- 1ユーザー1アクティブ: その user に他の active membership が無いことを検証
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_row.user_id and m.is_active and m.id <> p_membership_id
  ) then
    raise exception 'already active elsewhere';
  end if;

  -- is_active=true に戻す。フラグは残っていた値を維持（確定4・再雇用で設定が生きる）。
  update public.memberships set is_active = true where id = p_membership_id;

  perform public.audit_log_write('staff_reactivate', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;
revoke execute on function public.staff_reactivate(uuid) from public, anon;
grant execute on function public.staff_reactivate(uuid) to authenticated;

-- ═══ get_staff_sensitive（作り直し・同じ署名） ═══
CREATE OR REPLACE FUNCTION public.get_staff_sensitive(p_membership_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: スタッフの機密を読む。管理者・自店の店長（管理者の行は管理者だけ）・本人。閲覧は audit 'read_staff_sensitive'
-- ★0226（#344）: 店長が読めるのは自店のスタッフ（role 'staff'）と本人だけ＝「管理者（請求なし）」（admin）・ほかの店長は読めない（前は相手が owner かだけを見ていた）
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
  v_out jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id() and v_mem.role = 'staff') or public.auth_membership_id() = p_membership_id) then raise exception 'forbidden'; end if;
  perform public.audit_log_write('read_staff_sensitive', 'staff_sensitive:' || p_membership_id::text, null, null, v_mem.store_id);
  select to_jsonb(t) - 'org_id' - 'store_id' - 'membership_id' into v_out from public.staff_sensitive t where t.membership_id = p_membership_id;
  return coalesce(v_out, '{}'::jsonb);
end $function$;
revoke execute on function public.get_staff_sensitive(uuid) from public, anon;
grant execute on function public.get_staff_sensitive(uuid) to authenticated;

-- ═══ set_staff_sensitive（作り直し・同じ署名） ═══
CREATE OR REPLACE FUNCTION public.set_staff_sensitive(p_membership_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0193: スタッフの機密（本名・生年月日・住所・電話・振込先）。管理者・自店の店長（管理者の行は管理者だけ）。patch＝来たキーだけ・null で消す。audit 'set_staff_sensitive'（項目名だけ）
-- ★0226（#344）: 店長が書けるのは自店のスタッフ（role 'staff'）と本人だけ＝「管理者（請求なし）」（admin）・ほかの店長は書けない（前は相手が owner かだけを見ていた）
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_mem from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_mem.id is null or v_mem.org_id <> v_org or v_mem.role = 'cast' then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id() and (v_mem.role = 'staff' or v_mem.id = public.auth_membership_id()))) then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k <> all (array['address','phone','bank_name','bank_branch','bank_account_type','bank_account_no','bank_account_holder_kana'] || array['real_name','birthday'])) then raise exception 'bad key'; end if;
  if exists (select 1 from jsonb_each(p_patch) e where jsonb_typeof(e.value) not in ('string','null')) then raise exception 'bad type'; end if;
  if p_patch ? 'bank_account_type' and coalesce(p_patch->>'bank_account_type', 'ordinary') not in ('ordinary','checking','savings') then raise exception 'bad bank_account_type'; end if;
  if p_patch ? 'bank_account_no' and p_patch->>'bank_account_no' is not null and p_patch->>'bank_account_no' !~ '^[0-9]{1,8}$' then raise exception 'bad bank_account_no'; end if;
  if exists (select 1 from jsonb_each_text(p_patch) e where length(coalesce(e.value, '')) > 200) then raise exception 'too long'; end if;
  if p_patch ? 'birthday' and p_patch->>'birthday' is not null and p_patch->>'birthday' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'bad birthday'; end if;
  insert into public.staff_sensitive (membership_id, org_id, store_id) values (p_membership_id, v_org, v_mem.store_id) on conflict (membership_id) do nothing;
  update public.staff_sensitive t set
    address = case when p_patch ? 'address' then nullif(trim(p_patch->>'address'), '') else t.address end,
    phone = case when p_patch ? 'phone' then nullif(trim(p_patch->>'phone'), '') else t.phone end,
    bank_name = case when p_patch ? 'bank_name' then nullif(trim(p_patch->>'bank_name'), '') else t.bank_name end,
    bank_branch = case when p_patch ? 'bank_branch' then nullif(trim(p_patch->>'bank_branch'), '') else t.bank_branch end,
    bank_account_type = case when p_patch ? 'bank_account_type' then nullif(trim(p_patch->>'bank_account_type'), '') else t.bank_account_type end,
    bank_account_no = case when p_patch ? 'bank_account_no' then nullif(trim(p_patch->>'bank_account_no'), '') else t.bank_account_no end,
    bank_account_holder_kana = case when p_patch ? 'bank_account_holder_kana' then nullif(trim(p_patch->>'bank_account_holder_kana'), '') else t.bank_account_holder_kana end,
    real_name = case when p_patch ? 'real_name' then nullif(trim(p_patch->>'real_name'), '') else t.real_name end,
    birthday = case when p_patch ? 'birthday' then (p_patch->>'birthday')::date else t.birthday end,
    updated_at = now()
  where t.membership_id = p_membership_id;
  -- 値は監査に残さない（項目名だけ＝set_cast_sensitive と同じ流儀）
  perform public.audit_log_write('set_staff_sensitive', 'staff_sensitive:' || p_membership_id::text, null, jsonb_build_object('fields_changed', (select to_jsonb(array_agg(k order by k)) from jsonb_object_keys(p_patch) k)), v_mem.store_id);
end $function$;
revoke execute on function public.set_staff_sensitive(uuid, jsonb) from public, anon;
grant execute on function public.set_staff_sensitive(uuid, jsonb) to authenticated;

commit;
