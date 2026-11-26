-- 0217_ext_shimei_fee（起票167・相談役 11/26 の便 K の K2・起草と試走まで・適用はしない）
--   経緯：料金マスタに「延長指名」の ON／OFF（stores.ext_shimei_enabled）はあるが、額（pricing_rules の fee_kind='ext_shimei' の行）を書く入口が無い。
--     set_pricing_rule は ext_shimei を 'bad fee kind' で断る（0124 の「画面から作らせない」設計・mig0130 の注）＝ON にしても check_extension_add の
--     pricing_resolve_core が行に当たらず何も付かない（本番の ext_shimei の行は全店で 0）。
--   Agoora の決め（11/26）：額は店で一律の 1 つ・延長 1 回ごとに本指名 1 人につきその額・料金マスタの「指名・同伴料金」の枠の中で ON の下に金額の欄。
--   中身：新しい公開 RPC 1 本 set_ext_shimei_fee(店, 額)＝その店の ext_shimei の行を「条件なし（全席・全ランク・毎日・終日・全区分）の 1 行」に揃える。
--     無ければ作る・あれば 1 行を条件なしに直して額を書く・ほかの ext_shimei の行は止める（今の本番は 0 行）。額の欄を空にする道は作らない（OFF で付かなくなる）。
--   変えないもの：check_extension_add（延長の追加で ext_shimei_enabled の店は pricing_resolve_core(ext_shimei) の額を本指名 1 人に 1 行）・pricing_resolve_core・
--     set_pricing_rule（ext_shimei は今までどおり断る）・表と列。＝作り直す関数は無い（本番の今の定義との差分は無し）。
--   二重防御：冒頭の null guard・課金ゲート（billing_writable_of）・owner か自店の manager（set_store_pricing＝指名・同伴料金と同じ）・店が自社か・
--     revoke public, anon ＋ grant authenticated・本体の後に audit_log_write。
--   翻訳元：set_store_pricing（権限と課金ゲート）・set_pricing_category_first（監査の形）。
--   検証クエリ（当てた後・先頭に貼り先証明）：docs/tmp/ext_shimei_1126/0217_verify.sql（select 'nox-project-proof', count(*) from public.orgs で始まる）。
begin;
set local lock_timeout = '10s';

create or replace function public.set_ext_shimei_fee(p_store_id uuid, p_amount integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
-- ★0217（起票167）: 延長指名料（店で一律の 1 つ）。延長 1 回ごとに本指名 1 人につきこの額（check_extension_add が ext_shimei_enabled の店で付ける）。
--   その店の ext_shimei の行を条件なしの 1 行に揃えて額を書く。ほかの ext_shimei の行は止める。owner／自店の manager。audit。
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_st     uuid := public.auth_store_id();
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
  v_n      integer := 0;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_st is not null and p_store_id = v_st)) then raise exception 'forbidden'; end if;
  perform 1 from public.stores s where s.id = p_store_id and s.org_id = v_org for update;   -- 店ごとに 1 本ずつ（同時の保存で 2 行にしない）
  if not found then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 999999 then raise exception 'bad amount'; end if;
  select r.id, to_jsonb(r) into v_id, v_before
    from public.pricing_rules r
   where r.store_id = p_store_id and r.fee_kind = 'ext_shimei'
   order by r.is_active desc,
            (r.seat_kind is null and r.rank_id is null and r.dow_mask is null and r.time_from_min is null and r.category_id is null) desc,
            r.created_at, r.id
   limit 1;
  if v_id is null then
    insert into public.pricing_rules (org_id, store_id, fee_kind, amount, priority, is_active)
    values (v_org, p_store_id, 'ext_shimei', p_amount, 1, true)
    returning id into v_id;
  else
    update public.pricing_rules
       set amount = p_amount, seat_kind = null, rank_id = null, dow_mask = null, time_from_min = null, time_to_min = null,
           category_id = null, billing_unit = null, priority = 1, is_active = true, updated_at = now()
     where id = v_id;
  end if;
  update public.pricing_rules set is_active = false, updated_at = now()
   where store_id = p_store_id and fee_kind = 'ext_shimei' and id <> v_id and is_active;
  get diagnostics v_n = row_count;
  select to_jsonb(r) into v_after from public.pricing_rules r where r.id = v_id;
  perform public.audit_log_write('set_ext_shimei_fee', 'pricing_rules:' || v_id::text,
    v_before, v_after || jsonb_build_object('others_stopped', v_n), p_store_id);
  return v_id;
end $function$;

revoke execute on function public.set_ext_shimei_fee(uuid, integer) from public, anon;
grant execute on function public.set_ext_shimei_fee(uuid, integer) to authenticated;

commit;
