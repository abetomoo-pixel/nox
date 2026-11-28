-- 0228_retire_login_line（相談役 11/26 22:10・段イ・#62／#110（＝#295 のキャスト版も）・根 R32「辞めた人のログインと LINE」・起草と試走まで・適用はしない）
--   当たり（手元の BEGIN … ROLLBACK で再現）：
--     #62  cast_leave は casts を外し PIN と端末のセッションを消すだけで、招待で作った role 'cast' の所属（memberships）を外さない
--          ＝退店した人の auth_role() は 'cast'・auth_org_id() も決まる・/api/auth/retire は「ほかに有効な役がある」で ban しない。
--          auth_cast_can_register は casts.is_active を見ない（自分の電話のレジの店なら通る）。LINE のログイン（lib/nox/line/subject.ts）も在籍を見ない。
--     #110 staff_deactivate・cast_leave は line_links を消さない＝お知らせの LINE（/api/line/notice）が辞めた人にも届く。期限内の未使用の連携リンクも生きたまま。
--   中身（作り直し 5 本・同じ署名・CREATE OR REPLACE・ACL は今と同じ文で言い直す）：
--     ★1 cast_leave：同じ user × 店の role 'cast' の所属を is_active=false に（＝ログインの役が消える・route の ban が通る）。
--         LINE の連携（cast の行と、その所属の行）を消し、期限内の未使用の連携リンクを期限切れに。監査の after に 3 つの数を足す。
--     ★2 cast_rejoin：cast_leave が外した role 'cast' の所属を戻す（同じ user × 店）。その user にほかの有効な所属があれば 'already active elsewhere'（staff_reactivate と同じ）。
--         LINE は戻さない（付け直しは連携のリンク＝今と同じ）。
--     ★3 staff_deactivate：LINE の連携（membership）を消し、期限内の未使用の連携リンクを期限切れに。監査の after に 2 つの数を足す。
--         （11/27 積み直し：0226（mgr_admin_1126・#113・裁定511-4）を当てた後の本文の上に作った＝★0226 の「店長は自店のスタッフだけ」の 1 文を含む。0226 が先に当たっていることが前提）
--     ★4 auth_cast_can_register：在籍中の casts の行（同じ user × 店・is_active）がある人だけ（所属を外し損ねた行が残っても通さない＝二重の守り）。
--     ★5 bind_line：連携のリンクの相手が在籍でない（cast の is_active=false・所属の is_active=false）なら 'bad token'（route は 410＝今の「使えないリンク」と同じ）。
--     ★6 1 回だけのそろえ（デモでない会社だけ・何も無ければ何もしない）：退店した cast の所属が有効のまま／在籍でない人の LINE 連携／在籍でない人の期限内の未使用リンク。
--         変えた行ごとに監査 1 行（action 'mig0228.retire_cleanup'・actor_kind 'system'・actor_ref 'mig0228'）。本番の今（2026-11-26 22 時台に数えた）は 3 つとも 0 件＝書く行は 0。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。staff_reactivate・line_link_remove・line_bind_token_create は変えない
--     （#180 の「解除してもリンクが生きる」は line_link_remove の話＝この mig には入れていない。READY.md の「重なり」）。
--   画面・route の直し（この mig とは別・patch のファイルだけ）：lib/nox/line/subject.ts（cast の枝で is_active を見る）・app/api/line/notice/route.ts（在籍の人だけに送る）・
--     staff-board.tsx（「紐付けを解除」のボタンと在籍解除の文）。docs/tmp/retire_login_1126/patches/。
--   翻訳元：本番の定義（md5(prosrc)）cast_leave 6c485a3416fb99491dd5b2581cfeb4ee・cast_rejoin 38d9e727455fbef990d72bfff36933ec・staff_deactivate 6c1b487b463b7a3f1f01bea3f53936d3（0226 を当てた後・CR を除いて）・
--     auth_cast_can_register b4983420cdd78bcda890833e93db75d4・bind_line a5c4533659fde437e60fd84c26565e86（docs/tmp/retire_login_1126/live/）。
--   本番の今の定義との差分：docs/tmp/retire_login_1126/diff_live.md。
--   事前確認：docs/tmp/retire_login_1126/0228_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/retire_login_1126/0228_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 cast_leave（作り直し） ═══
CREATE OR REPLACE FUNCTION public.cast_leave(p_cast_id uuid, p_left_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.casts;
  v_left date;
  v_mem  int := 0;   -- ★0228: 外した所属（role 'cast'）の数
  v_ll   int := 0;   -- ★0228: 消した LINE の連携の数
  v_tok  int := 0;   -- ★0228: 期限切れにした連携のリンクの数
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 対象 cast を org 照合
  select c.* into v_row
  from public.casts c
  where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)（staff_deactivate 同型）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既に退店済みなら明示拒否
  if not v_row.is_active then raise exception 'already inactive'; end if;

  v_left := coalesce(p_left_on, (now() at time zone 'Asia/Tokyo')::date);

  update public.casts
     set is_active = false, left_on = v_left
   where id = p_cast_id;
  -- ★0190（裁定436 ①c）: 退店＝PIN の削除とキオスクのセッション終了（この人の membership＝casts.user_id × 店）。auth の失効・ban は route が RPC の後に呼ぶ
  delete from public.staff_pin sp using public.memberships m, public.casts c where c.id = p_cast_id and m.user_id = c.user_id and m.store_id = c.store_id and sp.membership_id = m.id;
  update public.kiosk_sessions s set ended_at = now(), end_reason = 'retired' from public.memberships m, public.casts c where c.id = p_cast_id and m.user_id = c.user_id and m.store_id = c.store_id and s.membership_id = m.id and s.ended_at is null;
  -- ★0228（#62）: 退店＝同じ user × 店の role 'cast' の所属も外す（auth_role／auth_org_id が null になる・route の ban が「ほかに有効な役」で止まらない）。
  --   同じ user × 店の所属は 1 行だけ（memberships_user_id_store_id_key）。role が cast でない（兼務の店長・スタッフ）なら触らない。
  update public.memberships m set is_active = false
    from public.casts c
   where c.id = p_cast_id and c.user_id is not null and m.user_id = c.user_id and m.store_id = c.store_id and m.role = 'cast' and m.is_active;
  get diagnostics v_mem = row_count;
  -- ★0228（#110・#295）: LINE の連携を外す（cast の行と、この人の role 'cast' の所属の行）＝お知らせの LINE が届かない・LINE でログインできない
  delete from public.line_links l
   where l.org_id = v_org
     and ((l.subject_kind = 'cast' and l.subject_id = p_cast_id)
          or (l.subject_kind = 'membership' and l.subject_id in (select m.id from public.memberships m where m.user_id = v_row.user_id and m.store_id = v_row.store_id and m.role = 'cast')));
  get diagnostics v_ll = row_count;
  -- ★0228: 出したままの連携のリンク（未使用・期限内）を期限切れに（0201r の line_bind_token_create と同じ書き方＝bind_line は 'bad token'）
  update public.line_bind_tokens t set expires_at = now() - interval '1 second'
   where t.org_id = v_org and t.used_at is null and t.expires_at > now()
     and ((t.subject_kind = 'cast' and t.subject_id = p_cast_id)
          or (t.subject_kind = 'membership' and t.subject_id in (select m.id from public.memberships m where m.user_id = v_row.user_id and m.store_id = v_row.store_id and m.role = 'cast')));
  get diagnostics v_tok = row_count;

  perform public.audit_log_write('cast_leave', 'casts:' || p_cast_id::text,
    to_jsonb(v_row),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id)
      || jsonb_build_object('memberships_off', v_mem, 'line_links_removed', v_ll, 'line_tokens_expired', v_tok),   -- ★0228
    v_row.store_id);
end $function$;

-- ═══ ★2 cast_rejoin（作り直し） ═══
CREATE OR REPLACE FUNCTION public.cast_rejoin(p_cast_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.casts;
  v_mem  int := 0;   -- ★0228: 戻した所属（role 'cast'）の数
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  select c.* into v_row
  from public.casts c
  where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既に在籍なら明示拒否
  if v_row.is_active then raise exception 'already active'; end if;

  -- 1ユーザー1アクティブ: 同一 user の他 active 行を検証（staff_reactivate 同型・
  -- casts_one_active_per_user_idx への抵触を例外文言で先取り）
  if v_row.user_id is not null and exists (
    select 1 from public.casts c
    where c.user_id = v_row.user_id and c.is_active and c.id <> p_cast_id
  ) then
    raise exception 'already active elsewhere';
  end if;
  -- ★0228（#62）: ほかの店に有効な所属があれば止める（memberships_one_active_per_user_idx を例外文言で先取り＝staff_reactivate と同じ）。
  --   同じ店の所属は 1 行だけ（memberships_user_id_store_id_key）＝role が cast でない兼務の行は触らずに通す（今と同じ）
  if v_row.user_id is not null and exists (
    select 1 from public.memberships m
    where m.user_id = v_row.user_id and m.is_active and m.store_id <> v_row.store_id
  ) then
    raise exception 'already active elsewhere';
  end if;

  update public.casts
     set is_active = true, left_on = null
   where id = p_cast_id;
  -- ★0228（#62）: cast_leave が外した所属を戻す（ログインの役が戻る・ban を外すのは今と同じ route の unban）。LINE は戻さない（付け直しは連携のリンク）
  update public.memberships m set is_active = true
   where v_row.user_id is not null and m.user_id = v_row.user_id and m.store_id = v_row.store_id and m.role = 'cast' and not m.is_active;
  get diagnostics v_mem = row_count;

  perform public.audit_log_write('cast_rejoin', 'casts:' || p_cast_id::text,
    to_jsonb(v_row),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id) || jsonb_build_object('memberships_on', v_mem),   -- ★0228
    v_row.store_id);
end $function$;

-- ═══ ★3 staff_deactivate（作り直し・0226 を当てた後の本文の上に積んだ＝★0226 の店長の柵はそのまま） ═══
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
  v_ll   int := 0;   -- ★0228: 消した LINE の連携の数
  v_tok  int := 0;   -- ★0228: 期限切れにした連携のリンクの数
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
  -- ★0228（#110）: LINE の連携を外す（お知らせの LINE が届かない・LINE でログインできない）・出したままの連携のリンクを期限切れに。再雇用の後の付け直しは連携のリンク
  delete from public.line_links where org_id = v_org and subject_kind = 'membership' and subject_id = p_membership_id;
  get diagnostics v_ll = row_count;
  update public.line_bind_tokens set expires_at = now() - interval '1 second'
   where org_id = v_org and subject_kind = 'membership' and subject_id = p_membership_id and used_at is null and expires_at > now();
  get diagnostics v_tok = row_count;

  perform public.audit_log_write('staff_deactivate', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id)
      || jsonb_build_object('line_links_removed', v_ll, 'line_tokens_expired', v_tok),   -- ★0228
    v_row.store_id);
end $function$;

-- ═══ ★4 auth_cast_can_register（作り直し） ═══
CREATE OR REPLACE FUNCTION public.auth_cast_can_register()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ★25 0175 v2（裁定420）: 3 段階。★0200（裁定473・M-131）: 旧キー互換を外す＋操作端末＝own_phone でなければキオスクの本人セッション中（kiosk_person_active_of＝共通関数）だけ＝RPC 25 本と RLS に一度に効く
  -- ★0228（#62）: 在籍中の casts の行（同じ user × 店）がある人だけ（退店で所属を外し損ねた行が残っても通さない）
  select coalesce(m.can_register, false)
         and coalesce((s.settings_json->>'sys_cast_register')::int, 0) > 0
         and (coalesce(s.settings_json->>'cast_register_device', 'store_device') = 'own_phone'
              or public.kiosk_person_active_of(m.id))
         and exists (select 1 from public.casts c where c.user_id = m.user_id and c.store_id = m.store_id and c.is_active)
  from public.memberships m
  join public.users u on u.id = m.user_id
  join public.stores s on s.id = m.store_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
    and m.role = 'cast'
$function$;

-- ═══ ★5 bind_line（作り直し・service_role だけ） ═══
CREATE OR REPLACE FUNCTION public.bind_line(p_token_hash text, p_line_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LIFF からの紐付け＝未使用・期限内のトークン → 同じ LINE が org に既にあれば 'line already linked' → line_links 1 行 → トークンを使用済みに（1 回で行う・BANZEN 0012 と同じ）。
--   service_role だけ（route /api/line/bind が id_token を確かめてから呼ぶ）。戻り＝subject と store（route がセッションを作る材料）
declare
  v_t record;
begin
  if p_token_hash is null or p_line_user_id is null or p_line_user_id !~ '^U[0-9a-f]{32}$' then raise exception 'bad input'; end if;
  select * into v_t from public.line_bind_tokens where token_hash = p_token_hash for update;
  if v_t.id is null or v_t.used_at is not null or v_t.expires_at < now() then raise exception 'bad token'; end if;
  -- ★0228（#62・#110）: 相手が在籍でない（退店・在籍の解除の後）リンクは使えない＝'bad token'（route は 410）
  if (v_t.subject_kind = 'cast' and not exists (select 1 from public.casts c where c.id = v_t.subject_id and c.is_active))
     or (v_t.subject_kind = 'membership' and not exists (select 1 from public.memberships m where m.id = v_t.subject_id and m.is_active)) then
    raise exception 'bad token';
  end if;
  if exists (select 1 from public.line_links l where l.org_id = v_t.org_id and l.line_user_id = p_line_user_id and not (l.subject_kind = v_t.subject_kind and l.subject_id = v_t.subject_id)) then
    raise exception 'line already linked';
  end if;
  insert into public.line_links (org_id, store_id, subject_kind, subject_id, line_user_id)
  values (v_t.org_id, v_t.store_id, v_t.subject_kind, v_t.subject_id, p_line_user_id)
  on conflict (subject_kind, subject_id) do update set line_user_id = excluded.line_user_id, store_id = excluded.store_id, updated_at = now();
  update public.line_bind_tokens set used_at = now() where id = v_t.id;
  perform public.audit_log_write_service(v_t.org_id, null, 'bind_line', v_t.subject_kind || 's:' || v_t.subject_id::text, null, jsonb_build_object('purpose', v_t.purpose), v_t.store_id);   -- ★0202c: 2 つ目は行い手（null）・7 つ目が店
  return jsonb_build_object('subject_kind', v_t.subject_kind, 'subject_id', v_t.subject_id, 'store_id', v_t.store_id, 'org_id', v_t.org_id, 'purpose', v_t.purpose);
end $function$;

-- ═══ ACL（今と同じ・言い直し） ═══
revoke execute on function public.cast_leave(uuid, date) from public, anon;
grant execute on function public.cast_leave(uuid, date) to authenticated;
revoke execute on function public.cast_rejoin(uuid) from public, anon;
grant execute on function public.cast_rejoin(uuid) to authenticated;
revoke execute on function public.staff_deactivate(uuid) from public, anon;
grant execute on function public.staff_deactivate(uuid) to authenticated;
revoke execute on function public.auth_cast_can_register() from public, anon;
grant execute on function public.auth_cast_can_register() to authenticated;
revoke execute on function public.bind_line(text, text) from public, anon, authenticated;
grant execute on function public.bind_line(text, text) to service_role;

-- ═══ ★6 1 回だけのそろえ（デモでない会社だけ・無ければ何もしない） ═══
do $mig0228$
declare
  r record;
begin
  -- (a) 退店した cast（同じ user × 店に在籍中の cast の行が無く、退店の行がある）の role 'cast' の所属が有効のまま → 外す
  for r in
    select m.id mem_id, m.store_id, s.org_id
      from public.memberships m join public.stores s on s.id = m.store_id join public.orgs o on o.id = s.org_id
     where not o.is_demo and m.role = 'cast' and m.is_active
       and exists (select 1 from public.casts c where c.user_id = m.user_id and c.store_id = m.store_id and not c.is_active)
       and not exists (select 1 from public.casts c where c.user_id = m.user_id and c.store_id = m.store_id and c.is_active)
     order by s.org_id, m.id
  loop
    update public.memberships set is_active = false where id = r.mem_id;
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason, actor_kind, actor_ref)
    values (r.org_id, r.store_id, null, 'mig0228.retire_cleanup', 'memberships:' || r.mem_id::text, jsonb_build_object('is_active', true),
            jsonb_build_object('is_active', false), '0228: 退店したキャストの所属を外す（#62）', 'system', 'mig0228');
  end loop;
  -- (b) 在籍でない人（cast の is_active=false・所属の is_active=false）の LINE の連携 → 消す（line_user_id は監査に書かない）
  for r in
    select l.id link_id, l.org_id, l.store_id, l.subject_kind, l.subject_id
      from public.line_links l join public.orgs o on o.id = l.org_id
     where not o.is_demo
       and ((l.subject_kind = 'cast' and exists (select 1 from public.casts c where c.id = l.subject_id and not c.is_active))
            or (l.subject_kind = 'membership' and exists (select 1 from public.memberships m where m.id = l.subject_id and not m.is_active)))
     order by l.org_id, l.id
  loop
    delete from public.line_links where id = r.link_id;
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason, actor_kind, actor_ref)
    values (r.org_id, r.store_id, null, 'mig0228.retire_cleanup', 'line_links:' || r.link_id::text, jsonb_build_object('subject_kind', r.subject_kind, 'subject_id', r.subject_id),
            null, '0228: 在籍でない人の LINE の連携を外す（#110）', 'system', 'mig0228');
  end loop;
  -- (c) 在籍でない人の、未使用・期限内の連携のリンク → 期限切れに
  for r in
    select t.id tok_id, t.org_id, t.store_id, t.subject_kind, t.subject_id
      from public.line_bind_tokens t join public.orgs o on o.id = t.org_id
     where not o.is_demo and t.used_at is null and t.expires_at > now()
       and ((t.subject_kind = 'cast' and exists (select 1 from public.casts c where c.id = t.subject_id and not c.is_active))
            or (t.subject_kind = 'membership' and exists (select 1 from public.memberships m where m.id = t.subject_id and not m.is_active)))
     order by t.org_id, t.id
  loop
    update public.line_bind_tokens set expires_at = now() - interval '1 second' where id = r.tok_id;
    insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason, actor_kind, actor_ref)
    values (r.org_id, r.store_id, null, 'mig0228.retire_cleanup', 'line_bind_tokens:' || r.tok_id::text, jsonb_build_object('subject_kind', r.subject_kind, 'subject_id', r.subject_id),
            jsonb_build_object('expired', true), '0228: 在籍でない人の連携のリンクを期限切れに（#110）', 'system', 'mig0228');
  end loop;
end $mig0228$;

commit;
