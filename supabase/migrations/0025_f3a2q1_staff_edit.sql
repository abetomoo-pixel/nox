-- 0025_f3a2q1_staff_edit: F3a 束3-2 Q-1 — スタッフ編集系RPC（auth 生成なし）
--   ① staff_update_profile（名前・owner/manager 自店・対象 staff/manager）
--   ② staff_transfer_store（異動・owner のみ・★出戻り分岐 reactivate/INSERT・同一org・1ユーザー1アクティブ）
--   ③ staff_change_role（昇降格・owner のみ・staff↔manager のみ・フラグ現状維持）
--   ④ staff_deactivate（在籍解除・is_active=false・物理削除なし・owner 対象禁止）
--   ⑤ staff_reactivate（再雇用・他 active なし検証・§4-B 採用）
--
-- 翻訳元・裁定参照:
--   - 相談役ロック（Q-1 = 編集系・auth 生成は Q-2・案B 合成 email 確定）
--   - 現物確認（memberships org_id 列なし=stores join・UNIQUE(user_id,store_id)・1ユーザー1アクティブ）
--   - 実装仕様書 NOX_F3_束3-2_Q-1_スタッフ編集_実装仕様.md（2026-07-09）
--
-- 実装ノート:
--   【1】越境封じ: 対象 membership を stores join で org 照合（org_id 列なし・束3-1 同型）。他 org は not found。
--   【2】権限差: 名前変更・在籍解除・再雇用=owner/manager 自店 / 異動・昇降格=owner のみ（権限昇格/店跨ぎ）。
--   【3】★異動の出戻り分岐: UNIQUE(user_id,store_id) は active/inactive 問わず効く（live 確認・not deferrable）。
--        新店に既存行あり→reactivate / なし→INSERT。旧を is_active=false にしてから新を active
--        （1ユーザー1アクティブ・両方 active の瞬間を作らない順序。部分ユニークは index＝各文即時評価で
--        「旧 false→新 true」が同一TX内で通ることを live 実測済み・逆順は 23505 で物理拒否）。
--   【4】昇降格: p_new_role/現 role とも staff/manager のみ（owner 増殖・cast 混入を封じる）。
--        フラグ現状維持（降格後 default false なら fail-closed・束3-1 と噛み合う）。
--   【5】在籍解除: 物理削除しない。is_active=false で認可が全倒れ（退職回帰 verify 実証）。
--        auth user ban は Admin API=Q-2 管轄・Q-1 は is_active のみ。
--   【6】audit（規約6）: 全操作 before/after。old は UPDATE 前に確保（束2 customer_update 同型・
--        仕様書 §1 ドラフトの UPDATE 後 select は誤記として修正）。
--   【7】combined gate は check_open 同型（store_id NOT NULL で null 短絡到達不能）。
--   【8】INSERT/UPDATE policy 作らない（SECURITY DEFINER RPC で検証）。
--   【9】★仕様書ドラフトからの追加ガード（相談役レビュー対象）: staff_transfer_store は
--        異動元が active であることを要求（inactive は 'inactive membership' raise）。
--        無いと「他店に active を持つ user の inactive 行を transfer」した際に部分ユニークの
--        生エラー 23505 で落ちる（fail-closed だが不明瞭）＋ reactivate の「他 active なし」検証を
--        迂回する曖昧経路になる。inactive 行の復帰は staff_reactivate（同店）/ 異動は active 行のみ。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and proname in
--       ('staff_update_profile','staff_transfer_store','staff_change_role',
--        'staff_deactivate','staff_reactivate') order by proname;
--   -- staff_change_role(uuid,text) / staff_deactivate(uuid) / staff_reactivate(uuid) /
--   -- staff_transfer_store(uuid,uuid) / staff_update_profile(uuid,text) の5本
--   select count(*) from pg_policies where tablename='memberships';  -- 1（memberships_select のみ・不変）
--   select prosrc like '%already active elsewhere%' from pg_proc where proname='staff_reactivate';
--   select prosrc like '%inactive membership%' from pg_proc where proname='staff_transfer_store';

begin;

-- ══════════════════════════════════════════════════════════════
-- ① staff_update_profile（名前変更・users.name UPDATE）
--    owner/manager（自店）。対象 staff/manager（cast は女の子管理で別・owner は対象外）。
--    名前は users 1箇所（1ユーザー1アクティブ・確定4）＝retired 経由の不整合は構造上起きない。
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_update_profile(
  p_membership_id uuid,
  p_name          text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_row      public.memberships;
  v_old_name text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;

  -- 対象 membership を org 照合（stores join・memberships に org_id 列なし）
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
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- audit の old は UPDATE 前に確保（規約6・束2 customer_update 同型）
  select name into v_old_name from public.users where id = v_row.user_id;

  update public.users set name = trim(p_name) where id = v_row.user_id;

  perform public.audit_log_write('staff_update_profile', 'memberships:' || p_membership_id::text,
    jsonb_build_object('user_id', v_row.user_id, 'old_name', v_old_name),
    jsonb_build_object('user_id', v_row.user_id, 'new_name', trim(p_name)),
    v_row.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ② staff_transfer_store（所属店の異動・owner のみ・★出戻り分岐）
--    旧 membership を is_active=false → 新店で active（reactivate or INSERT）。
--    UNIQUE(user_id, store_id) は active/inactive 問わず効くため、新店に既存行があれば
--    reactivate（role は異動元を引き継ぐ・フラグは既存値維持）、なければ INSERT（フラグ default false）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_transfer_store(
  p_membership_id uuid,      -- 現在の（異動元）membership
  p_new_store_id  uuid       -- 異動先の店
) returns uuid               -- 異動後の（新店の）membership id
language plpgsql security definer set search_path = public
as $$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_row      public.memberships;   -- 異動元
  v_new_org  uuid;
  v_existing public.memberships;   -- 新店の既存行（出戻り判定）
  v_result   uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 異動元 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- ★異動は owner のみ（店を跨ぐ操作・確定3）。manager は自店しか見えないので不可。
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  -- 対象は staff/manager（cast は別・owner の異動は想定外）
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- 異動元は active であること（実装ノート【9】: inactive 行の異動は曖昧経路＝明示拒否。
  -- 復帰は staff_reactivate（同店）・別店への復帰は先に reactivate してから異動）。
  if not v_row.is_active then raise exception 'inactive membership'; end if;

  -- 異動先の店が同一 org であることを検証（org を跨ぐ異動は不可＝別会社）
  select org_id into v_new_org from public.stores where id = p_new_store_id;
  if v_new_org is null or v_new_org <> v_org then raise exception 'invalid store'; end if;

  -- 同店異動（新店 = 現店）は no-op として弾く
  if p_new_store_id = v_row.store_id then raise exception 'same store'; end if;

  -- 1ユーザー1アクティブ: 先に旧を is_active=false（枠を空ける・両方 active の瞬間を作らない）
  update public.memberships set is_active = false where id = p_membership_id;

  -- ★出戻り分岐: 新店に同 user の既存行（UNIQUE(user_id, store_id)）があるか
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_row.user_id and m.store_id = p_new_store_id;

  if found then
    -- 既存行を reactivate（role は異動元を引き継ぐ・フラグは既存値を維持）
    update public.memberships
       set is_active = true, role = v_row.role
     where id = v_existing.id
     returning id into v_result;
  else
    -- 新規 INSERT（フラグは default false = fail-closed で入る）
    insert into public.memberships (user_id, store_id, role, is_active)
    values (v_row.user_id, p_new_store_id, v_row.role, true)
    returning id into v_result;
  end if;

  perform public.audit_log_write('staff_transfer_store', 'memberships:' || v_result::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = v_result),
    p_new_store_id);
  return v_result;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ③ staff_change_role（昇降格・owner のみ・staff↔manager のみ）
--    p_new_role と現 role の二重ガード（owner 増殖・cast 混入・owner/cast の role 変更を封じる）。
--    フラグ現状維持（Agoora 確定）: 降格時リセットしない。role='staff' になった瞬間から
--    ヘルパーが参照開始（default false で入れた行なら fail-closed）。昇格時はフラグ無視（role 固定）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_change_role(
  p_membership_id uuid,
  p_new_role      text        -- 'staff' | 'manager' のみ
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- ★昇降格は owner のみ（権限昇格経路・確定3）
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  -- p_new_role は staff/manager のみ（owner 増殖・cast 混入を防ぐ）
  if p_new_role not in ('staff','manager') then raise exception 'bad role'; end if;

  -- 対象 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 現 role も staff/manager のみ対象（owner を降格させる/cast を昇格させる経路を封じる）
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- no-op（同 role）は弾く
  if v_row.role = p_new_role then raise exception 'no change'; end if;

  -- role を変更。フラグは現状維持。
  update public.memberships set role = p_new_role where id = p_membership_id;

  perform public.audit_log_write('staff_change_role', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ④ staff_deactivate（在籍解除・確定4）
--    membership.is_active=false のみ（物理削除しない）。users 行・auth user は残す（再雇用時に復活）。
--    is_active=false で membership 経由の認可が全て倒れる（退職回帰 verify で fail-closed 実証済み）。
--    auth user 自体の ban は Admin API=Q-2 管轄。
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_deactivate(
  p_membership_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
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

  -- 対象は staff/manager のみ。owner の在籍解除は禁止（owner を消す経路を封じる）。cast は別画面。
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- 既に inactive なら明示拒否
  if not v_row.is_active then raise exception 'already inactive'; end if;

  update public.memberships set is_active = false where id = p_membership_id;

  perform public.audit_log_write('staff_deactivate', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑤ staff_reactivate（再雇用・§4-B 採用＝deactivate の対称）
--    同 membership の is_active=true 復帰（同店出戻り）。別店への出戻りは staff_transfer_store の
--    出戻り分岐が扱う（棲み分け）。1ユーザー1アクティブ＝他に active membership があれば拒否。
--    reactivate は同一行の flip なので UNIQUE(user_id,store_id) とは無関係・部分ユニークは
--    「他 active なし」検証で守る（万一すり抜けても index が 23505 で物理拒否＝二重防御）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_reactivate(
  p_membership_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- grant/revoke（5本・二重防御）
-- ══════════════════════════════════════════════════════════════
revoke execute on function public.staff_update_profile(uuid, text) from public, anon;
grant  execute on function public.staff_update_profile(uuid, text) to authenticated;
revoke execute on function public.staff_transfer_store(uuid, uuid) from public, anon;
grant  execute on function public.staff_transfer_store(uuid, uuid) to authenticated;
revoke execute on function public.staff_change_role(uuid, text) from public, anon;
grant  execute on function public.staff_change_role(uuid, text) to authenticated;
revoke execute on function public.staff_deactivate(uuid) from public, anon;
grant  execute on function public.staff_deactivate(uuid) to authenticated;
revoke execute on function public.staff_reactivate(uuid) from public, anon;
grant  execute on function public.staff_reactivate(uuid) to authenticated;

commit;
