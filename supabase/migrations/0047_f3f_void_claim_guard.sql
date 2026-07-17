-- 0047_f3f_void_claim_guard.sql
-- F3f 前提バグ修正: void 伝票×drink_claims の非対称2件（2026-07-17 実測で確定）
--   (1) drink_claim_decide が check の status を見ない → void 伝票の pending を事後承認できた
--   (2) check_void が drink_claims を触らない → pending が宙吊り残置（receivables 'voided' と非対称）
-- 裁定: void 時 pending は自動 reject（decided_by=void実行者）・approved は残置
--       （給与除外は collect.ts の void フィルタが単一責任点＝finalize 済み給与への遡及改変を構造的に回避）
--       status 語彙は3値のまま（'rejected' で表現・void 起因は check_void の audit before に pending_claims で記録）
-- 両関数とも署名不変＝create or replace 単独置換（drop 不要・オーバーロード0確認済み 2026-07-17）
-- 本体: live pg_get_functiondef（2026-07-17 取得）起点・差分は【F3f】マーク2箇所のみ
-- 構成: 再適用可（or replace）だが手貼りは1回

begin;

-- ============================================================
-- 1) drink_claim_decide: void 伝票ガード追加（他は live 逐語）
-- ============================================================
create or replace function public.drink_claim_decide(p_claim_id uuid, p_approve boolean, p_qty_override integer DEFAULT NULL::integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cl record; v_actor uuid; v_before jsonb; v_qty int; v_nom text; v_prod record; v_unit int; v_back int;
  v_chk_status text;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- 承認は黒服 can_register 以上・自店（代理型＝auth_cast_id チェックなし）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'pending' then raise exception 'already decided'; end if;
  -- 【F3f】void 伝票への事後承認/却下を封じる（open/closed は従来どおり＝close 非依存思想は不変。
  --        check_void が pending を自動 reject するため本ガードは主にレース/残置行の backstop）
  select status into v_chk_status from public.checks where id = v_cl.check_id;
  if v_chk_status = 'void' then raise exception 'check voided'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- 杯数修正（承認時訂正・null は申告 qty のまま）
    if p_qty_override is not null then
      if p_qty_override <= 0 then raise exception 'bad qty'; end if;
      v_qty := p_qty_override;
    else
      v_qty := v_cl.qty;
    end if;
    -- ★バック額焼付け（check_close の unit 計算と同一規則・products を承認時点で直読み）
    select nom_type into v_nom from public.checks where id = v_cl.check_id;
    select * into v_prod from public.products where id = v_cl.product_id;
    if v_prod.back_mode = 'unit4' then
      v_unit := coalesce((v_prod.unit4_json ->> v_nom)::int, 0);                             -- unit4[nom_type]（check_close 同一）
    else
      v_unit := round(v_prod.price * coalesce(v_prod.back_value, 0)::numeric / 100.0)::int;  -- rate（check_close 同一）
    end if;
    v_back := v_unit * v_qty;
    update public.drink_claims
       set status = 'approved', qty = v_qty, back_amount = v_back, decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_approve', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  else
    update public.drink_claims
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_reject', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  end if;
end $function$;

revoke all on function public.drink_claim_decide(uuid, boolean, integer) from public, anon;
grant execute on function public.drink_claim_decide(uuid, boolean, integer) to authenticated;

-- ============================================================
-- 2) check_void: pending claim 自動 reject（他は live 逐語）
-- ============================================================
create or replace function public.check_void(p_check_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）の売掛があれば void 拒否（宙吊り/幻影防止＝条件3＋partial）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 【F3f】void 時 pending claim 自動 reject（宙吊り防止＝receivables 'voided' と同型思想・approved は残置＝
  --        給与除外は collect.ts の void フィルタが単一責任点）
  update public.drink_claims
     set status = 'rejected', decided_by = v_actor, decided_at = now()
   where check_id = p_check_id and status = 'pending';
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;

revoke all on function public.check_void(uuid, text) from public, anon;
grant execute on function public.check_void(uuid, text) to authenticated;

commit;
