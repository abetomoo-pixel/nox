-- 0039_cast_register: キャスト会計 — cast にレジ会計を開く（2段ゲート・settings_json 方式＝列 mig 不要）
--   ① auth_cast_can_register() ヘルパー新設（live auth_staff_can_register() 同型・2段 AND）
--   ② set_store_cast_register(p_store_id, p_enabled)（店フラグ・owner 限定・set_store_okuri_mode 雛形）
--   ③ set_cast_register(p_membership_id, p_can_register)（cast 個別フラグ・owner∨manager 自店・set_staff_perms 雛形）
--   ④ RLS cast 枝追加 8表＝checks/check_lines/check_nominations/payments/receivables/bottle_keeps
--      ＋seats（卓選択の前提）＋casts（同僚指名の前提）＝相談役確定（2026-07-15）
--   ⑤ RPC ゲート cast 枝追加 8本＝会計6RPC＋bottle_keep_register＋approval_request（live functiondef 正本）
--
-- 設計ロック（現物調査 → 相談役確定・2026-07-15）:
--  - 2段ゲート: 店 settings_json.cast_register_enabled=true ∧ 対象 cast の membership.can_register=true。
--    既定は両方 off＝fail-closed（店がフラグを立て、かつ owner/manager が cast 個別に付与して初めて開く）。
--  - cast の can_register は memberships の既存列を再利用（live 実測: cast 行は全 false）。
--    set_staff_perms は role<>'staff' を 'not a staff' で弾く＝cast への付与は③専用 RPC のみ（二重管理なし）。
--  - ④ A群6表は第3連結 OR 末尾に cast 枝追加・他一字不変。seats は第3連結が cast 明示除外形
--    （auth_role() <> 'cast'）のため OR 差替＝owner/manager/staff の可視は現行意味論一字不変。
--    casts は自己例外 OR に auth_cast_can_register() を追加（同僚指名がガールズバー要件の中核・
--    casts 基底は表示系のみ＝機密は cast_sensitive 分離済み）。全表 STEP0 現物 dump（pg_policy）が正本。
--  - ⑤ 非接触: approval_decide/approval_direct（承認決裁=manager+ 不変）・check_void（manager+ 不変）・
--    日報（daily_report_close/reclose・daily_reports RLS の cast 除外も不変）・予約 RPC（can_crm 軸不変）・
--    payroll。check_cast_backs RLS（mig0038）も不変＝cast は自己行のみ。
--  - ★起草メモ: reservation_to_check は自前ロールゲートを持たず内部 check_open へ委譲（【4】権限=can_register）。
--    本 mig で check_open が cast（2段ゲート ON）を通すため、当該 cast は reservation_to_check も通るようになる
--    ＝許容（相談役裁定済み・予約の作成/編集 RPC は can_crm 軸のままで cast に開かない）。
--  - verify（新段=2段ゲートマトリクス・mig0038 整合）・seed（castRegA1 新設＋店フラグ ON）・UI
--    （register layout の cast redirect 条件緩和ほか）は STEP3＝手貼り確認後。
--
-- 実装ノート:
--  【1】①は fail-closed: 非 cast・無所属・無効は 0行→null 戻り（RLS USING の null は行除外・RPC の
--       if not (...) も null で forbidden）。店フラグは settings_json->>'cast_register_enabled' の
--       文字列比較 = 'true'（キー欠落/null/不正値はすべて false＝::boolean キャストの raise を構造的に回避）。
--  【2】②は店ポリシー＝owner 限定（set_store_okuri_mode と同格・D3a）。jsonb_set でキーのみ書換＋audit。
--  【3】③は set_staff_perms（live 5引数）の写し・対象 role='cast' 限定（'not a cast'）・規約7（null 拒否）・
--       audit before/after。update は can_register 1列のみ（cast に can_crm/can_shift/can_view_backs の意味なし）。
--  【4】④は全表 drop→create・for select to authenticated 明示（mig0038 教訓＝roles 句必須）。
--       qual は STEP0 現物 dump の pg_get_expr レンダリングを正本に cast 枝のみ追加（他枝一字不変）。
--  【5】⑤は live pg_get_functiondef 正本（2026-07-15 取得・check_open は4引数=p_customer_id 込み）に
--       OR チェーン末尾の cast 枝1挿入のみ・他一字不変。revoke/grant は live 識別引数で再設定。
--  【6】再適用可の構成（create or replace / drop policy if exists / revoke / grant）だが手貼りは1回。
--
-- 適用後の検証（"Success" だけ信用しない・Run 前に URL の ref 目視・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) ① ヘルパー（secdef・search_path 固定・ACL は authenticated 保持/anon 不在）:
--      select proname, prosecdef, coalesce(array_to_string(proconfig,','),'') as config
--        from pg_proc where pronamespace='public'::regnamespace and proname='auth_cast_can_register';
--      select r.rolname from pg_proc p
--        join aclexplode(p.proacl) a on true join pg_roles r on r.oid=a.grantee
--       where p.proname='auth_cast_can_register' order by 1;
--   2) ②③ RPC（識別引数・prosrc アンカー・ACL）:
--      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--             coalesce(array_to_string(p.proacl,','),'default') as acl
--        from pg_proc p where p.pronamespace='public'::regnamespace
--         and p.proname in ('set_store_cast_register','set_cast_register') order by 1;
--      select proname from pg_proc where proname='set_store_cast_register' and prosrc like '%bad enabled%';  -- 1行
--      select proname from pg_proc where proname='set_cast_register' and prosrc like '%not a cast%';         -- 1行
--   3) ④ 8表の policy（roles={authenticated}・qual に auth_cast_can_register・他枝は STEP0 dump と一字一致）:
--      select tablename, policyname, roles, cmd from pg_policies
--       where schemaname='public' and qual like '%auth_cast_can_register%' order by tablename;  -- 8行
--      select tablename, qual from pg_policies
--       where schemaname='public' and tablename in
--         ('checks','check_lines','check_nominations','payments','receivables','bottle_keeps','seats','casts')
--       order by tablename;
--   4) ⑤ 8本の prosrc に cast 枝（会計6＋approval_request＋bottle_keep_register のみ・他 RPC 非汚染）:
--      select proname from pg_proc
--       where pronamespace='public'::regnamespace and prosrc like '%auth_cast_can_register%'
--       order by proname;  -- 8行（approval_request/bottle_keep_register/check_add_line/check_close/
--                          --      check_open/check_pay/check_remove_line/check_set_nominations）
--   5) notify pgrst, 'reload schema';
--   6) 動作アンカー（2段ゲートマトリクス: 店ON×castON のみ可・店OFF∨castOFF は forbidden/0行・
--      staff/owner/manager 回帰不変・mig0038 バック分離整合・anon BLOCKED）は verify 新段で実測（STEP3）。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① auth_cast_can_register()（live auth_staff_can_register() の pg_get_functiondef 同型・
--    2段 AND＝membership.can_register ∧ 所属店 settings_json.cast_register_enabled）
--    非 cast は where で 0行→null＝fail-closed（実装ノート【1】）。
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auth_cast_can_register()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(m.can_register, false)
         and coalesce(s.settings_json->>'cast_register_enabled', '') = 'true'
  from public.memberships m
  join public.users u on u.id = m.user_id
  join public.stores s on s.id = m.store_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
    and m.role = 'cast'
$function$;

-- 二重防御: revoke は public と anon の両方（既存ヘルパー8本と同じ）
revoke execute on function public.auth_cast_can_register() from public, anon;
grant  execute on function public.auth_cast_can_register() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ② set_store_cast_register（店フラグ・owner 限定＝set_store_okuri_mode 雛形・jsonb_set・audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_store_cast_register(
  p_store_id uuid,
  p_enabled  boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_store record;
  v_prev  boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(v_store.settings_json->>'cast_register_enabled', '') = 'true';
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{cast_register_enabled}', to_jsonb(p_enabled), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_cast_register', 'stores:' || p_store_id::text,
    jsonb_build_object('cast_register_enabled', v_prev), jsonb_build_object('cast_register_enabled', p_enabled), p_store_id);
end $$;

revoke execute on function public.set_store_cast_register(uuid, boolean) from public, anon;
grant  execute on function public.set_store_cast_register(uuid, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ set_cast_register（cast 個別フラグ・owner∨manager 自店＝set_staff_perms 雛形・
--    対象 role='cast' 限定 'not a cast'・規約7 null 拒否・audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_cast_register(
  p_membership_id uuid,
  p_can_register  boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 規約7: 明示値必須（coalesce 禁止・null は拒否）
  if p_can_register is null then raise exception 'bad flag'; end if;

  -- 対象 membership を org 内で取得（存在＋org 一致を同時確認）。
  -- memberships に org_id 列は無い（live 確認）＝stores join で org 照合。他 org は not found。
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限を配る権限＝owner/manager のみ。manager は自店のみ。
  -- （combined gate・set_staff_perms 同型・store_id NOT NULL で null 短絡は到達不能）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 対象は cast のみ（staff は set_staff_perms の管轄＝二重管理を防ぐ）
  if v_row.role <> 'cast' then raise exception 'not a cast'; end if;

  update public.memberships
     set can_register = p_can_register
   where id = p_membership_id;

  -- 規約6: 権限変更は audit（before/after を記録）
  perform public.audit_log_write('set_cast_register', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $$;

revoke execute on function public.set_cast_register(uuid, boolean) from public, anon;
grant  execute on function public.set_cast_register(uuid, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ RLS cast 枝追加 8表（STEP0 現物 dump 正本・他枝一字不変・全表 to authenticated 明示）
-- ══════════════════════════════════════════════════════════════

-- ── A群: checks（OR 末尾に cast 枝）─────────────────────────
drop policy if exists checks_select on public.checks;
create policy checks_select on public.checks
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_register())
     or ((auth_role() = 'cast'::text) and auth_cast_can_register())
  )
);

-- ── A群: check_lines ────────────────────────────────────────
drop policy if exists check_lines_select on public.check_lines;
create policy check_lines_select on public.check_lines
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_register())
     or ((auth_role() = 'cast'::text) and auth_cast_can_register())
  )
);

-- ── A群: check_nominations ──────────────────────────────────
drop policy if exists check_nominations_select on public.check_nominations;
create policy check_nominations_select on public.check_nominations
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_register())
     or ((auth_role() = 'cast'::text) and auth_cast_can_register())
  )
);

-- ── A群: payments ───────────────────────────────────────────
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_register())
     or ((auth_role() = 'cast'::text) and auth_cast_can_register())
  )
);

-- ── A群: receivables ────────────────────────────────────────
drop policy if exists receivables_select on public.receivables;
create policy receivables_select on public.receivables
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_register())
     or ((auth_role() = 'cast'::text) and auth_cast_can_register())
  )
);

-- ── A群: bottle_keeps ───────────────────────────────────────
drop policy if exists bottle_keeps_select on public.bottle_keeps;
create policy bottle_keeps_select on public.bottle_keeps
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_register())
     or ((auth_role() = 'cast'::text) and auth_cast_can_register())
  )
);

-- ── seats（第3連結を OR 差替＝owner/manager/staff の現行可視は意味論一字不変・
--    cast のみ 2段ゲートで開通。A群列挙形への書換は can_register=false staff の卓可視が
--    消える回帰のため不採用＝相談役承認）──────────────────────
drop policy if exists seats_select on public.seats;
create policy seats_select on public.seats
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and ((auth_role() <> 'cast'::text) or auth_cast_can_register())
);

-- ── casts（自己例外 OR に cast 枝追加＝同僚指名の前提・他枝一字不変）──
drop policy if exists casts_select on public.casts;
create policy casts_select on public.casts
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and ((auth_role() <> 'cast'::text) or (id = auth_cast_id()) or auth_cast_can_register())
);

-- ══════════════════════════════════════════════════════════════
-- ⑤ RPC ゲート cast 枝追加 8本（live pg_get_functiondef 正本・OR チェーン末尾に cast 枝のみ挿入・
--    他一字不変。revoke/grant は live 識別引数で再設定）
-- ══════════════════════════════════════════════════════════════

-- ── check_open（ゲート変数は v_seat・4引数=p_customer_id 込み live）──
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text; v_settings jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  select s.id, s.org_id, s.store_id, s.is_active, st.settings_json
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = public.auth_org_id()
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  select id into v_id from public.checks
    where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
    limit 1;
  if v_id is not null then return v_id; end if;

  -- 【決定1】店設定のスナップショット（既定 10 / 100 / down・不正値は raise）
  v_settings := coalesce(v_seat.settings_json, '{}'::jsonb);
  v_rate := coalesce(nullif(v_settings->>'service_rate','')::int, 10);
  v_unit := coalesce(nullif(v_settings->>'round_unit','')::int, 100);
  v_mode := coalesce(nullif(trim(v_settings->>'round_mode'),''), 'down');
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode, created_by, customer_id)
  values (public.auth_org_id(), v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode, v_actor, p_customer_id)
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
      limit 1;
    return v_id;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id), v_seat.store_id);
  return v_id;
end $function$;

revoke execute on function public.check_open(uuid, int, text, uuid) from public, anon;
grant  execute on function public.check_open(uuid, int, text, uuid) to authenticated;

-- ── check_set_nominations ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nom_type text, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 1 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;
    if p_nom_type = 'free' and v_w <> 1 then raise exception 'bad weight'; end if; -- free は均等（モック準拠）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update public.checks set nom_type = p_nom_type where id = p_check_id;

  v_after := jsonb_build_object('nom_type', p_nom_type, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;

revoke execute on function public.check_set_nominations(uuid, text, jsonb) from public, anon;
grant  execute on function public.check_set_nominations(uuid, text, jsonb) to authenticated;

-- ── check_add_line ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> public.auth_org_id()
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt);
  else
    if p_kind is null or p_kind not in ('set','time','charge','custom') then raise exception 'bad kind'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'bad price'; end if;
    v_kind := p_kind;
    v_name := trim(p_name);
    v_price := p_unit_price;
    v_back := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_product_id, v_kind, v_grp,
          v_name, v_price, p_qty, v_price * p_qty, v_back, v_sort)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_line', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

revoke execute on function public.check_add_line(uuid, uuid, int, text, text, text, int) from public, anon;
grant  execute on function public.check_add_line(uuid, uuid, int, text, text, text, int) to authenticated;

-- ── check_remove_line ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_remove_line(p_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_paycnt int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  delete from public.check_lines where id = p_line_id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_remove_line', 'check_lines:' || p_line_id::text,
    to_jsonb(v_line), null, v_chk.store_id);
end $function$;

revoke execute on function public.check_remove_line(uuid) from public, anon;
grant  execute on function public.check_remove_line(uuid) to authenticated;

-- ── check_pay ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount, p_tendered, p_idem_key, v_actor)
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id), v_chk.store_id);

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;

revoke execute on function public.check_pay(uuid, text, int, text, int, uuid) from public, anon;
grant  execute on function public.check_pay(uuid, text, int, text, int, uuid) to authenticated;

-- ── check_close ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足（∀g: paid(g) ≥ due(g)）＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配（最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_type='hon' のみ）
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id)
    into v_cast_ids, v_weights
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
    loop
      -- 分配単価（productBackOf と同一規則・凍結値）
      if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
        v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
      else
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配（床=整数除算・剰余降順→position 昇順）
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          if v_chk.nom_type = 'hon' then
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    for i in 1..v_n loop
      if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
        insert into public.check_cast_backs
          (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc)
        values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                v_drink[i], v_champ[i], v_bottle[i], v_pt[i]);
      end if;
    end loop;
  end if;

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

revoke execute on function public.check_close(uuid, uuid) from public, anon;
grant  execute on function public.check_close(uuid, uuid) to authenticated;

-- ── approval_request（割引/無料の申請＝会計書込ゲートと同一軸・決裁 decide/direct は不変）──
CREATE OR REPLACE FUNCTION public.approval_request(p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 申請は黒服 can_register 以上（会計書込ゲート＝check_add_line と同一）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  -- 割引前小計（既存 discount line は除外）
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;                    -- free は小計を焼付け
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status, reason, requested_by)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'pending',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor)
  returning id into v_id;
  perform public.audit_log_write('approval_request', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

revoke execute on function public.approval_request(uuid, text, text, int, text) from public, anon;
grant  execute on function public.approval_request(uuid, text, text, int, text) to authenticated;

-- ── bottle_keep_register（ゲートは v_role/p_store_id 形＝関数内の流儀を維持して cast 枝挿入）──
CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note)
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note)
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;

revoke execute on function public.bottle_keep_register(uuid, uuid, uuid, text) from public, anon;
grant  execute on function public.bottle_keep_register(uuid, uuid, uuid, text) to authenticated;

commit;
