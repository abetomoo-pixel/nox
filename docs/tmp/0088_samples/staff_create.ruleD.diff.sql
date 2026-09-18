-- サンプル diff: staff_create（規則D・引数=v_org）
-- 追加行: if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
-- 直前行(アンカー): if v_org is null or v_role is null then raise exception 'forbidden'; end if;
-- 検証: diff=1行 PASS / 直前行=規則Dアンカー PASS / 最初の DML より前 PASS
-- 出典: docs/tmp/0088_billing_gate_r2.sql（確定版）

-- ── 該当箇所（±7行）──
    v_user     public.users;
    v_user_id  uuid;
    v_existing public.memberships;
    v_result   uuid;
  begin
    -- fail-closed: 無所属/anon
    if v_org is null or v_role is null then raise exception 'forbidden'; end if;
+   if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  
    -- 入力検証（route でも検証するが RPC でも二重に守る）
    if p_auth_user_id is null then raise exception 'bad auth user'; end if;
    if p_email is null or length(trim(p_email)) = 0 or length(p_email) > 255 then raise exception 'bad email'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_role not in ('staff','manager') then raise exception 'bad role'; end if;
    v_email := lower(trim(p_email));  -- 【12】正規化（auth 側の小文字化保存と揃える）

-- ── 変換後 全文 ──
CREATE OR REPLACE FUNCTION public.staff_create(p_auth_user_id uuid, p_email text, p_name text, p_store_id uuid, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_email    text;
  v_new_org  uuid;
  v_user     public.users;
  v_user_id  uuid;
  v_existing public.memberships;
  v_result   uuid;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 入力検証（route でも検証するが RPC でも二重に守る）
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  if p_email is null or length(trim(p_email)) = 0 or length(p_email) > 255 then raise exception 'bad email'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_role not in ('staff','manager') then raise exception 'bad role'; end if;
  v_email := lower(trim(p_email));  -- 【12】正規化（auth 側の小文字化保存と揃える）

  -- 配属先 store が同一 org であること（越境封じ・stores 経由で org 照合・他 org は invalid store）
  select org_id into v_new_org from public.stores where id = p_store_id;
  if v_new_org is null or v_new_org <> v_org then raise exception 'invalid store'; end if;

  -- 権限差: owner=org 全店 staff/manager 作成可 / manager=自店 staff のみ作成可（論点3）
  if v_role = 'owner' then
    null;  -- owner は staff/manager どちらも org 内全店に作成可
  elsif v_role = 'manager' then
    if p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;  -- 自店のみ
    if p_role <> 'staff' then raise exception 'forbidden'; end if;                     -- manager は staff のみ（同格増殖封じ）
  else
    raise exception 'forbidden';  -- staff/cast は追加不可
  end if;

  -- ★既存 user 判定（UNIQUE(org_id, email) users レベル・確定D）。lower 比較（【12】）。
  select u.* into v_user
  from public.users u
  where u.org_id = v_org and lower(u.email) = v_email;

  if not found then
    -- 新規 user（通常ケース）: users INSERT（auth_user_id は route が生成したもの・
    -- 重複 auth uid は UNIQUE(auth_user_id) が 23505 で物理拒否＝【13】）
    insert into public.users (org_id, email, name, auth_user_id)
    values (v_org, v_email, trim(p_name), p_auth_user_id)
    returning id into v_user_id;
  else
    -- 既存 user（同 org 同 email）: users は作らない・名前/auth_user_id は上書きしない（【4】）
    v_user_id := v_user.id;
    -- 【11】inactive user は明示拒否（active membership を足しても auth ヘルパーが倒れたまま）
    if not v_user.is_active then raise exception 'inactive user'; end if;
    -- 【10】cast/owner 人材への staff/manager 追加付与を封じる
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.role not in ('staff','manager')
    ) then
      raise exception 'bad target';
    end if;
  end if;

  -- membership の出戻り分岐（UNIQUE(user_id, store_id) は active/inactive 問わず効く・Q-1 と同型）
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_user_id and m.store_id = p_store_id;

  if found then
    -- 【9】cast/owner 行の役職転換復帰を封じる（通常【10】が先に捕捉＝二重防御）
    if v_existing.role not in ('staff','manager') then raise exception 'bad target'; end if;
    -- 既存行あり: active なら重複追加＝拒否
    if v_existing.is_active then raise exception 'already member'; end if;
    -- ★1ユーザー1アクティブ: 他店に active があれば追加不可（先に異動/解除が要る）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.is_active
    ) then
      raise exception 'already active elsewhere';
    end if;
    -- 出戻り reactivate（フラグは既存値を維持＝Q-1 transfer と同じ・role は今回指定値）
    update public.memberships
       set is_active = true, role = p_role
     where id = v_existing.id
     returning id into v_result;
  else
    -- ★1ユーザー1アクティブ: 既存 user が他店に active を持つなら新規 membership 追加不可
    --  （完全新規 user はここに来た時点で membership 0行＝素通り。二重防御は部分ユニーク index）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.is_active
    ) then
      raise exception 'already active elsewhere';
    end if;
    -- 新規 membership INSERT（フラグ default false = fail-closed・【6】）
    insert into public.memberships (user_id, store_id, role, is_active)
    values (v_user_id, p_store_id, p_role, true)
    returning id into v_result;
  end if;

  -- audit（規約6・新規作成なので after のみ意味・before は生成情報の疑似 jsonb・【7】）
  perform public.audit_log_write('staff_create', 'memberships:' || v_result::text,
    jsonb_build_object('user_id', v_user_id, 'email', v_email, 'role', p_role, 'created', true),
    (select to_jsonb(m) from public.memberships m where m.id = v_result),
    p_store_id);

  return v_result;
end $function$
