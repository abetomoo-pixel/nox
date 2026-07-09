-- 0024_f3a1_staff_perms: F3a 束3-1 — 権限トグル（set_staff_perms 新設）
--   ① set_staff_perms（memberships UPDATE・owner/manager のみ・対象 staff のみ・規約7・audit）
--   ② list_staff_perms は作らない（§1【A】live 確認: memberships_select policy で owner=org 全店/
--      manager=自店の membership が読める＝read 手段は既存 RLS で足りる。users_select も manager が
--      自店 membership 保持者を読める＝UI は memberships+users を直接 SELECT・認可土台は不変）
--
-- 翻訳元・裁定参照:
--   - 認可正本 §1.5（フラグ書込RPC は束3）
--   - 相談役ロック（束3-1 = 権限トグルのみ・スタッフ追加/編集は束3-2・can_shift 適用は将来）
--   - 実装仕様書 NOX_F3_束3-1_権限トグル_実装仕様.md（2026-07-09）
--
-- 実装ノート:
--   【1】規約7 直撃: 3フラグは UI から常に明示値・null は 'bad flag'（coalesce 禁止）。
--        UI は対象 staff の現在3フラグを保持し全値送信（部分更新にしない）。
--   【2】権限昇格封じ: 呼べるのは owner/manager のみ。対象は staff のみ（role<>'staff' は 'not a staff'）。
--        staff は自分にも他人にもフラグを付与できない。
--   【3】越境封じ: ★仕様書ドラフトからの調整＝memberships に org_id 列は存在しない（live 確認・
--        PK は単一 id・org 帰属は store_id→stores.org_id 経由）。対象取得は stores join で
--        org 照合（他 org は not found に倒れる＝存在確認にも使えない）。
--   【4】combined gate は check_open 同型（memberships.store_id NOT NULL（束2確認）＋
--        auth_role/auth_store_id は同一クエリ同型で null 条件が完全一致＝null 短絡は到達不能）。
--   【5】規約6: フラグ変更は audit_log_write で before/after 記録（誰がいつ何を ON/OFF したか）。
--   【6】memberships への UPDATE のみ（INSERT/DELETE なし＝新規作成は束3-2）。
--        INSERT/UPDATE policy は作らない（SECURITY DEFINER RPC で検証）。
--   【7】is_active 条件は置かない＝休職/退職（is_active=false）行のフラグも変更可。
--        フラグはヘルパー（is_active 条件込み）経由でしか効かないため不活性行への変更は無害・
--        再有効化（束3-2）時に設定済みフラグが生きる方が運用に素直。
--   【8】updated_at は memberships_touch_updated_at トリガ（mig0001）が自動更新＝明示 set 不要。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and proname = 'set_staff_perms';
--   -- 引数が (p_membership_id uuid, p_can_register boolean, p_can_crm boolean, p_can_shift boolean)
--   select count(*) from pg_policies where tablename='memberships';  -- 1（memberships_select のみ・不変）
--   select prosrc like '%not a staff%' from pg_proc where proname='set_staff_perms';

begin;

-- ══════════════════════════════════════════════════════════════
-- ① set_staff_perms（staff 機能別フラグの書込・memberships UPDATE のみ）
--    owner=org 内全店の staff / manager=自店の staff / staff・cast=不可（権限昇格封じ）。
--    3フラグは常に全値送信（規約7）。変更は audit_log_write で before/after 記録（規約6）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_staff_perms(
  p_membership_id uuid,
  p_can_register  boolean,   -- 会計（束1適用済み）
  p_can_crm       boolean,   -- 顧客CRM（束2適用済み）
  p_can_shift     boolean    -- シフト管理（適用先は将来フェーズ・トグル手段のみ先行）
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 規約7: 3フラグとも明示値必須（coalesce 禁止・null は拒否）
  if p_can_register is null or p_can_crm is null or p_can_shift is null then
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
     set can_register = p_can_register,
         can_crm      = p_can_crm,
         can_shift    = p_can_shift
   where id = p_membership_id;

  -- 規約6: 権限変更は audit（before/after のフラグ・role・対象を記録）
  perform public.audit_log_write('set_staff_perms', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $$;

revoke execute on function public.set_staff_perms(uuid, boolean, boolean, boolean) from public, anon;
grant  execute on function public.set_staff_perms(uuid, boolean, boolean, boolean) to authenticated;

commit;
