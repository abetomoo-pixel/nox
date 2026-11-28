-- 0248_set_seat_open_guard（起票60 の関数の側・相談役 11/27 20:10 の ■4＝起草と試走まで・適用はしない・番号は仮）
--   翻訳元：本番の今の set_seat（0088 が元・md5(prosrc の CR 抜き) c28274f170de4d17485fe0b2b06d808c）。変えるのは 1 段を足すだけ＝同じ署名・SECURITY DEFINER・search_path・ACL は今と同じ文で言い直す。
--   中身：有効を外す保存で、その席に会計前の伝票があれば 'seat has open checks' で断る（画面は 47cc5c26 で止め済み＝関数を直に呼ぶ道と、確かめと保存の間に伝票が開く隙間をふさぐ）。
--   表・列・ポリシー・ほかの関数は変えない。関数の数 526 → 526・表 133・ポリシー 152（読んだ時の数＝当てる順で前に別の mig が入れば、事前確認と検証の数を取り直す）。
--   検証クエリ：0248_verify.sql（先頭は貼り先証明）。事前確認：0248_precheck.sql（返りが貼り先証明の 1 行だけなら当ててよい）。
begin;
set local lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.set_seat(p_id uuid, p_store_id uuid, p_name text, p_kind text, p_sort_order integer, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 40 then raise exception 'bad name'; end if;
  if p_kind is not null and p_kind not in ('卓','カウンター','VIP') then raise exception 'bad kind'; end if;
  if p_sort_order is null or p_sort_order < 0 then raise exception 'bad sort'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.seats (org_id, store_id, name, kind, sort_order, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_kind, p_sort_order, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.seats s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    -- ★0248（起票60・相談役 11/27 20:10 の ■4）: 有効を外す保存（今は有効 → 外す）で、その席に会計前の伝票（主の席＝checks.seat_id・足した席＝check_seats）があれば断る。
    --   外すとレジのフロア（有効な席だけを並べる）から伝票ごと見えなくなり、会計も日報の締めもできなくなるため。画面の止め（lib/nox/seat-open-guard.ts・47cc5c26）と同じ線を関数にも置く。
    --   名前・種別・並び順だけの保存、もともと外れている席の保存、有効に戻す保存は今までどおり。
    if coalesce(p_is_active, true) = false and coalesce((v_before->>'is_active')::boolean, true)
       and exists (select 1 from public.checks c
                    where c.org_id = public.auth_org_id() and c.store_id = p_store_id and c.status = 'open'
                      and (c.seat_id = p_id
                           or exists (select 1 from public.check_seats cs where cs.check_id = c.id and cs.seat_id = p_id))) then
      raise exception 'seat has open checks';
    end if;
    update public.seats
      set name = trim(p_name), kind = p_kind, sort_order = p_sort_order, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(s) into v_after from public.seats s where s.id = v_id;
  perform public.audit_log_write('set_seat', 'seats:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_seat(uuid, uuid, text, text, integer, boolean) from public, anon;
grant execute on function public.set_seat(uuid, uuid, text, text, integer, boolean) to authenticated;

commit;
