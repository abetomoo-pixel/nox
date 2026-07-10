-- 0026_f3a2q2_staff_create: F3a 束3-2 Q-2 — スタッフ追加RPC（auth 生成は route 管轄）
--   staff_create（users + membership 生成・出戻り分岐・owner=全店 staff/manager / manager=自店 staff のみ）
--
-- 翻訳元・裁定参照:
--   - 相談役ロック（Q-2 = 追加・案B 即時作成・合成 email 自動生成 + 実 email 任意・2026-07-10 確定）
--   - 現物確認（auth_user_id NOT NULL 1:1・createAdminClient + route 11本・UNIQUE(org_id,email) users レベル）
--   - 実装仕様書 NOX_F3_束3-2_Q-2_スタッフ追加_実装仕様.md（2026-07-10）
--
-- 実装ノート:
--   【1】auth 生成は route（admin.createUser）管轄。RPC は users + membership 生成に閉じる（責務分離）。
--        route が auth 生成 → 本 RPC を owner セッションで呼ぶ → 失敗なら route が deleteUser で補償。
--   【2】呼び出しは owner セッション（service キーでない）。auth_org_id/role/store_id が効き権限検証が
--        RPC 内に閉じる（Q-1 同型）。audit actor=auth.uid()。
--   【3】権限差: owner=org 全店 staff/manager 作成可 / manager=自店 staff のみ / staff・cast 不可。
--   【4】既存 user 分岐（UNIQUE(org_id,email) users レベル・live 確認済み）: 同 org 同 email は既存
--        user_id 使用・users INSERT せず membership のみ。名前/auth_user_id は上書きしない（lock＝
--        名前変更は Q-1 staff_update_profile の責務・auth は既存を維持）。route が事前先引きで
--        auth 二重作成を防ぐ（§4-B）＝RPC 単体でこの分岐に入るのは保険。
--   【5】membership 出戻り分岐（Q-1 transfer 同型・UNIQUE(user_id,store_id) live 確認済み）:
--        既存 inactive→reactivate（フラグ既存値維持）/ active→already member /
--        他店 active→already active elsewhere。1ユーザー1アクティブを両ルートで検証
--        （二重防御は部分ユニーク memberships_one_active_per_user_idx・live 確認済み）。
--   【6】フラグ default false（新規作成は fail-closed・opt-in は set_staff_perms）。
--   【7】audit（規約6）: 新規なので after のみ意味・before は生成情報の疑似 jsonb。
--   【8】INSERT policy 作らない（SECURITY DEFINER RPC で検証）。auth_user_id は FK 無し=ダミー uuid で
--        verify 可能（段18・Q-1 段16/17 と同手法・live で FK 不在を再確認済み）。
--
-- ★仕様書ドラフトからの追加ガード/調整（CC 起草・相談役レビュー対象）:
--   【9】出戻り reactivate は対象 membership の role ∈ (staff,manager) のみ（'bad target'）。
--        無いと inactive の cast/owner 行を staff/manager に役職転換して復帰させる経路になる
--        （Q-1 transfer/change_role の bad target ガードと一貫）。通常は【10】が先に捕捉＝二重防御。
--   【10】既存 user が cast/owner 人材（role ∉ staff/manager の membership を1行でも持つ）なら
--        'bad target'。実 email 入力で cast の email に一致した場合に「同一人物へ staff 役職を
--        追加付与」する経路を封じる（cast 混入封じの user レベル適用）。元 cast を黒服として
--        雇い直す運用は email 空（合成 email）で完全新規 user を作れば成立＝運用は詰まない。
--   【11】既存 user の users.is_active=false は 'inactive user' で明示拒否。★live 発見＝
--        auth ヘルパー4本は u.is_active を要求（0001）するため、user が inactive のまま
--        active membership を足しても認可は倒れたまま（沈黙の半死に状態）。現行 RPC 群に
--        users.is_active を落とす書き手は無いが、fail-closed の明示拒否（Q-1【9】と同じ流儀）。
--   【12】email は lower(trim()) 正規化で保存・照合は lower 比較。Supabase auth は email を
--        小文字化保存するため、大小文字ゆれで §4-B 先引き/UNIQUE(org_id,email) をすり抜けて
--        同一人物の users 行が割れるのを防ぐ（route も小文字化するが RPC でも二重に）。
--   【13】users INSERT が UNIQUE(auth_user_id)（★live 発見＝users_auth_user_id_key 実在）に
--        当たるケース（既存 auth uid の使い回し）は 23505 の物理拒否に委ねる（route は毎回
--        createUser で新規 uid を得るため正規経路では到達しない・明示 raise は作らない）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='staff_create';
--   -- staff_create(uuid, text, text, uuid, text) の1本
--   select count(*) from pg_policies where tablename in ('memberships','users');  -- 2（select 各1本・不変）
--   select has_function_privilege('anon','public.staff_create(uuid,text,text,uuid,text)','execute');  -- false
--   select prosrc like '%already active elsewhere%' and prosrc like '%inactive user%'
--     and prosrc like '%already member%' from pg_proc where proname='staff_create';  -- true

begin;

-- ══════════════════════════════════════════════════════════════
-- staff_create（スタッフ追加・users + membership 生成）
--   route が admin.createUser で auth_user_id を確定した後、owner/manager セッションで呼ぶ。
--   返却 = 生成/復帰した membership id。
-- ══════════════════════════════════════════════════════════════
create or replace function public.staff_create(
  p_auth_user_id uuid,     -- route が admin.createUser で得た auth.users.id（既存 user 分岐では未使用）
  p_email        text,     -- 決定済みログイン ID（実 email or 合成・route が確定）
  p_name         text,     -- 表示名
  p_store_id     uuid,     -- 配属先の店
  p_role         text      -- 'staff' | 'manager' のみ
) returns uuid              -- 生成した membership id
language plpgsql security definer set search_path = public
as $$
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- grant/revoke（二重防御）
-- ══════════════════════════════════════════════════════════════
revoke execute on function public.staff_create(uuid, text, text, uuid, text) from public, anon;
grant  execute on function public.staff_create(uuid, text, text, uuid, text) to authenticated;

commit;
