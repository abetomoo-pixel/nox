-- 0041_cast_invite: castログイン招待 — cast_invite RPC（users + membership[role='cast'] + casts.user_id 結線）
--   staff_create（mig0026）を正本に同型起草。auth 生成は route（/api/cast/invite・admin.createUser）管轄。
--
-- 翻訳元・裁定参照:
--   - 現物調査（2026-07-15）: casts.user_id を set する経路は現状ゼロ（cast_create_apply は user_id=null で
--     INSERT・seed のみが結線）＝招待フローの欠落点。auth_cast_id() は users.auth_user_id→casts.user_id、
--     auth_role() は memberships(role='cast') 依存＝/mine 成立には両土台が必須（片方欠落＝/login 弾き or 全空）。
--   - membership.store_id と casts.store_id の整合は DB 制約なし＝本 RPC が対象 cast.store_id から導出して保証。
--   - 相談役設計ロック（2026-07-15）: cast_invite(p_auth_user_id, p_email, p_cast_id) returns membership id・
--     検証順＝入力→対象cast（org照合・is_active・user_id null='already linked'）→email 既存分岐→membership→
--     casts.user_id 結線（既存 active cast 明示チェック）→audit。
--
-- 実装ノート（staff_create mig0026 の【】番号を継承・cast への鏡像適用）:
--   【1】auth 生成は route（admin.createUser・email_confirm:true・初期PW16字一度返し）管轄。RPC は
--        users + membership + casts.user_id 結線に閉じる（責務分離）。失敗なら route が deleteUser で補償。
--   【2】呼び出しは owner/manager セッション（service キーでない）＝auth_org_id/role/store_id が効き
--        権限検証が RPC 内に閉じる。audit actor=auth.uid()。
--   【3】権限差: owner=org 内全店の cast / manager=自店の cast のみ / staff・cast=forbidden。
--   【4】既存 user 分岐（UNIQUE(org_id,email)）: 同 org 同 email は既存 user_id 使用・users INSERT せず。
--        名前/auth_user_id は上書きしない。新規 user の name は対象 cast の源氏名（v_cast.name）を初期値に
--        （signature に p_name を持たない＝結線対象から導出・表示名変更は将来の cast 編集の責務）。
--   【10'】既存 user が staff/manager/owner 人材（role<>'cast' の membership を1行でも持つ）なら 'bad target'
--        ＝staff の email に一致した場合に「同一人物へ cast 役職を追加付与」する経路を封じる
--        （staff_create【10】の鏡像・人材の役職二重化をどちら向きにも作らない）。
--   【11】既存 user の users.is_active=false は 'inactive user' で明示拒否（認可ヘルパーが倒れたまま＝同）。
--   【12】email は lower(trim()) 正規化・lower 比較（auth 側の小文字化保存と揃える＝同）。
--   【13】新規 users INSERT の既存 auth uid 使い回しは UNIQUE(auth_user_id) の 23505 物理拒否に委ねる（同）。
--   【14】★cast 固有: 対象 cast は org 照合（他 org は not found＝存在オラクル封じ）・is_active 必須
--        （'inactive cast'）・user_id is null 必須（'already linked'＝二重結線封じ）。
--   【15】★1ユーザー1アクティブ×2本: memberships_one_active_per_user_idx（既存 active membership が
--        どの店にあっても 'already active elsewhere'）＋ casts_one_active_per_user_idx（当該 user が既に
--        active cast を持てば 'already a cast'＝明示 raise・物理 backstop は部分ユニーク 23505）。
--   【16】同店の既存 inactive membership は出戻り reactivate（UNIQUE(user_id,store_id) 対応・staff_create
--        同型・role<>'cast' 行は 'bad target'）。フラグ列は cast に意味なし＝触らない。
--   【17】store 整合: membership.store_id は引数でなく対象 cast.store_id から導出＝RPC が一致を構造的に保証。
--
-- 適用後の検証（"Success" 表示だけを信用しない・Run 前に URL の ref 目視・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) 識別引数・ACL・prosrc アンカーを1結果セットで:
--      select 'args' as k, pg_get_function_identity_arguments(p.oid) as v
--        from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='cast_invite'
--      union all
--      select 'acl', coalesce(array_to_string(p.proacl,','),'default')
--        from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='cast_invite'
--      union all
--      select 'anchors', (prosrc like '%already linked%' and prosrc like '%already a cast%'
--        and prosrc like '%already active elsewhere%' and prosrc like '%bad target%'
--        and prosrc like '%inactive user%' and prosrc like '%inactive cast%')::text
--        from pg_proc where proname='cast_invite';
--      -- 期待: args=(p_auth_user_id uuid, p_email text, p_cast_id uuid) / acl に authenticated（anon 不在）/ anchors=true
--   2) anon 遮断: select has_function_privilege('anon','public.cast_invite(uuid,text,uuid)','execute');  -- false
--   3) 認可土台の非汚染: select count(*) from pg_policies where tablename in ('users','memberships','casts');  -- 3（select 各1本・不変）
--   4) notify pgrst, 'reload schema';
--   5) 動作アンカー（招待→signIn→auth_role='cast'・auth_cast_id 解決・/mine 相当 RLS・already linked/
--      bad target/already active elsewhere・認可・anon BLOCKED）は verify 段33 で実測（STEP3）。

begin;

-- ══════════════════════════════════════════════════════════════
-- cast_invite（castログイン招待・users + membership[role='cast'] + casts.user_id 結線）
--   route が admin.createUser で auth_user_id を確定した後、owner/manager セッションで呼ぶ。
--   返却 = 生成/復帰した membership id。
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_invite(
  p_auth_user_id uuid,     -- route が admin.createUser で得た auth.users.id（既存 user 分岐では未使用）
  p_email        text,     -- 決定済みログイン ID（実 email or 合成・route が確定）
  p_cast_id      uuid      -- 結線対象の cast（user_id null の在籍 cast）
) returns uuid              -- 生成/復帰した membership id
language plpgsql security definer set search_path = public
as $$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_email    text;
  v_cast     public.casts;
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
  v_email := lower(trim(p_email));  -- 【12】正規化

  -- 対象 cast（org 照合＝他 org は not found・存在オラクル封じ・【14】）
  select c.* into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if v_cast.user_id is not null then raise exception 'already linked'; end if;

  -- 権限差: owner=org 内全店の cast / manager=自店の cast のみ / staff・cast=forbidden（【3】）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★既存 user 判定（UNIQUE(org_id, email)・lower 比較＝【12】）
  select u.* into v_user
  from public.users u
  where u.org_id = v_org and lower(u.email) = v_email;

  if not found then
    -- 新規 user（通常ケース）: users INSERT（name は対象 cast の源氏名を初期値＝【4】・
    -- 重複 auth uid は UNIQUE(auth_user_id) が 23505 で物理拒否＝【13】）
    insert into public.users (org_id, email, name, auth_user_id)
    values (v_org, v_email, v_cast.name, p_auth_user_id)
    returning id into v_user_id;
  else
    -- 既存 user（同 org 同 email）: users は作らない・名前/auth_user_id は上書きしない（【4】）
    v_user_id := v_user.id;
    -- 【11】inactive user は明示拒否
    if not v_user.is_active then raise exception 'inactive user'; end if;
    -- 【10'】staff/manager/owner 人材への cast 結線を封じる（役職二重化の鏡像封じ）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.role <> 'cast'
    ) then
      raise exception 'bad target';
    end if;
  end if;

  -- ★1ユーザー1アクティブ membership: 既存 active がどの店にあっても不可（【15】）
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_user_id and m.is_active
  ) then
    raise exception 'already active elsewhere';
  end if;

  -- membership（store は対象 cast.store_id から導出＝store 整合を RPC が保証・【17】。
  -- 同店の既存 inactive 行は出戻り reactivate＝UNIQUE(user_id,store_id) 対応・【16】）
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_user_id and m.store_id = v_cast.store_id;

  if found then
    -- role<>'cast' 行の役職転換復帰を封じる（通常【10'】が先に捕捉＝二重防御）
    if v_existing.role <> 'cast' then raise exception 'bad target'; end if;
    update public.memberships
       set is_active = true
     where id = v_existing.id
     returning id into v_result;
  else
    insert into public.memberships (user_id, store_id, role, is_active)
    values (v_user_id, v_cast.store_id, 'cast', true)
    returning id into v_result;
  end if;

  -- ★casts.user_id 結線（当該 user の既存 active cast を明示チェック＝【15】・
  -- 物理 backstop は casts_one_active_per_user_idx の 23505）
  if exists (
    select 1 from public.casts c2
    where c2.user_id = v_user_id and c2.is_active
  ) then
    raise exception 'already a cast';
  end if;
  update public.casts set user_id = v_user_id where id = p_cast_id;

  -- audit（規約6・before は生成情報の疑似 jsonb・after は結線後 casts 行＝源氏名のみで PII なし）
  perform public.audit_log_write('cast_invite', 'casts:' || p_cast_id::text,
    jsonb_build_object('user_id', v_user_id, 'email', v_email, 'membership_id', v_result),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id),
    v_cast.store_id);

  return v_result;
end $$;

-- ══════════════════════════════════════════════════════════════
-- grant/revoke（二重防御）
-- ══════════════════════════════════════════════════════════════
revoke execute on function public.cast_invite(uuid, text, uuid) from public, anon;
grant  execute on function public.cast_invite(uuid, text, uuid) to authenticated;

commit;
