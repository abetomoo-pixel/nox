-- 0038_backs_visibility: バック可視是正 — staff のバック閲覧を can_register から専用フラグ can_view_backs に分離
--   ① memberships.can_view_backs 列追加（boolean not null default false・★backfill しない＝fail-closed opt-in）
--   ② auth_staff_can_view_backs() ヘルパー新設（live auth_staff_can_register() の pg_get_functiondef 同型）
--   ③ check_cast_backs_select の staff 枝を can_register → can_view_backs へ差し替え
--      （owner/manager 枝・cast 本人枝は一字不変＝STEP0 live qual 確認済み・相談役逐語確定 2026-07-15）
--   ⑦ set_staff_perms 4引数 → 5引数（p_can_view_backs 追加・live pg_get_functiondef 正本・drop→create）
--   （④⑤⑥は欠番＝相談役裁定「①②③⑦で是正完了・別ガード不要」）
--
-- 翻訳元・裁定参照:
--   - 経路トレース確定（相談役・2026-07-15）: バック（check_cast_backs）が can_register staff に
--     見える実穴は check_cast_backs_select の staff 枝 1箇所のみ。collect.ts の service_role 読みは
--     route authz（decidePayrollAccess staff=forbidden）＋ payslips RLS で既閉＝本 mig 対象外・触らない。
--   - ③の policy 本文は相談役逐語確定（変更禁止）。STEP0（pg_policy 現物 dump）を正本に staff 枝のみ差し替え。
--
-- 実装ノート:
--   【1】★backfill しない（mig0022【1】とは逆の判断・意図された是正）: 適用の瞬間に既存
--        can_register staff の check_cast_backs は 0行化する。バック＝キャスト報酬の経営情報で、
--        会計操作権限（can_register）とは別軸。必要な黒服には owner/manager が set_staff_perms
--        （5引数）で個別付与（opt-in）。
--   【2】②は fail-closed: 無所属/無効は 0行→null 戻り＝RLS USING の null は行除外（mig0022【6】同）。
--   【3】③は旧 policy（mig0022）と同じ to authenticated で確定（相談役が roles 句欠落を訂正・
--        レビュー 2026-07-15）。それ以外は確定逐語のまま一字不変（関数参照が無修飾なのも
--        STEP0 の pg_get_expr レンダリングと同型）。
--   【4】⑦は signature 変更のため create or replace 不可＝drop→create。適用から UI 5引数化（STEP3）
--        までの間、旧4引数呼びは PostgREST エラー（dev のみ・lockstep 前提）。本文は live 正本に
--        最小差し替え（引数追加・null guard 追加・update set 追加・コメント「3フラグ」→「4フラグ」のみ）。
--        audit の to_jsonb は全列自動収載＝can_view_backs も before/after に載る（変更不要）。
--   【5】再適用可の構成（if exists / or replace）だが手貼りは1回。
--
-- 適用後の検証（"Success" だけ信用しない・Run 前に URL の ref 目視・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) ① 列（not null・default false）＋ backfill なし（true = 0行）:
--      select column_name, is_nullable, column_default from information_schema.columns
--       where table_schema='public' and table_name='memberships' and column_name='can_view_backs';
--      select count(*) as should_be_0 from public.memberships where can_view_backs;
--   2) ② ヘルパー（secdef・search_path 固定・ACL は authenticated 保持/anon 不在）:
--      select proname, prosecdef, coalesce(array_to_string(proconfig,','),'') as config
--        from pg_proc where pronamespace='public'::regnamespace and proname='auth_staff_can_view_backs';
--      select r.rolname from pg_proc p
--        join aclexplode(p.proacl) a on true join pg_roles r on r.oid=a.grantee
--       where p.proname='auth_staff_can_view_backs' order by 1;
--   3) ③ policy 1本のみ・roles = {authenticated}・qual の staff 枝が can_view_backs・
--      owner/manager と cast 枝は STEP0 と一字一致:
--      select policyname, roles, cmd, qual from pg_policies
--       where schemaname='public' and tablename='check_cast_backs';
--   4) ⑦ set_staff_perms は5引数1本のみ（4引数の残骸なし）＋ prosrc ＋ ACL:
--      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--             coalesce(array_to_string(p.proacl,','),'default') as acl
--        from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='set_staff_perms';
--      select pg_get_functiondef('set_staff_perms(uuid, boolean, boolean, boolean, boolean)'::regprocedure);
--   5) notify pgrst, 'reload schema';
--   6) 動作アンカー（can_register staff の backs 0行化・can_view_backs 付与で可視・cast 本人不変・
--      anon BLOCKED・5引数 RPC の規約7 null 拒否）は verify 段16 改修＋回帰で実測（STEP3）。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① memberships.can_view_backs（バック閲覧権限・黒服のみ意味を持つ・default false＝fail-closed）
--    ★backfill しない（実装ノート【1】・opt-in）。
-- ══════════════════════════════════════════════════════════════
alter table public.memberships
  add column if not exists can_view_backs boolean not null default false;  -- バック閲覧権限（黒服・opt-in）

-- ══════════════════════════════════════════════════════════════
-- ② auth_staff_can_view_backs()（live auth_staff_can_register() の pg_get_functiondef 同型・
--    参照列のみ can_view_backs に差し替え）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auth_staff_can_view_backs()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(m.can_view_backs, false)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$function$;

-- 二重防御: revoke は public と anon の両方（既存ヘルパー7本と同じ）
revoke execute on function public.auth_staff_can_view_backs() from public, anon;
grant  execute on function public.auth_staff_can_view_backs() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ check_cast_backs_select（staff 枝のみ can_view_backs へ・他枝一字不変）
--    ★相談役逐語確定（2026-07-15）・変更禁止。
-- ══════════════════════════════════════════════════════════════
drop policy if exists check_cast_backs_select on public.check_cast_backs;

create policy check_cast_backs_select on public.check_cast_backs
for select
to authenticated
using (
  (org_id = auth_org_id())
  and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
  and (
        (auth_role() = any (array['owner'::text, 'manager'::text]))
     or ((auth_role() = 'staff'::text) and auth_staff_can_view_backs())
     or ((auth_role() = 'cast'::text) and (cast_id = auth_cast_id()))
  )
);

-- ══════════════════════════════════════════════════════════════
-- ⑦ set_staff_perms 5引数化（live pg_get_functiondef 正本・最小差し替え＝実装ノート【4】）
--    signature 変更のため drop→create（create or replace 不可）。
-- ══════════════════════════════════════════════════════════════
drop function if exists public.set_staff_perms(uuid, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.set_staff_perms(p_membership_id uuid, p_can_register boolean, p_can_crm boolean, p_can_shift boolean, p_can_view_backs boolean)
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
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 規約7: 4フラグとも明示値必須（coalesce 禁止・null は拒否）
  if p_can_register is null or p_can_crm is null or p_can_shift is null or p_can_view_backs is null then
    raise exception 'bad flag';
  end if;

  -- 対象 membership を org 内で取得（存在＋org 一致を同時確認）。
  -- memberships に org_id 列は無い（live 確認）＝stores join で org 照合。他 org は not found。
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限を配る権限＝owner/manager のみ。manager は自店のみ。
  -- （combined gate・check_open 同型・store_id NOT NULL で null 短絡は到達不能）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 対象は staff（黒服）のみ。owner/manager/cast のフラグは触らせない（role 固定＝フラグ無意味）。
  if v_row.role <> 'staff' then raise exception 'not a staff'; end if;

  update public.memberships
     set can_register   = p_can_register,
         can_crm        = p_can_crm,
         can_shift      = p_can_shift,
         can_view_backs = p_can_view_backs
   where id = p_membership_id;

  -- 規約6: 権限変更は audit（before/after のフラグ・role・対象を記録）
  perform public.audit_log_write('set_staff_perms', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;

-- 二重防御: revoke/grant 再設定（新 signature）
revoke execute on function public.set_staff_perms(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant  execute on function public.set_staff_perms(uuid, boolean, boolean, boolean, boolean) to authenticated;

commit;
