CREATE OR REPLACE FUNCTION public.reservation_to_check(p_reservation_id uuid, p_seat_id uuid DEFAULT NULL::uuid, p_nom_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org        uuid := public.auth_org_id();
  v_role       text := public.auth_role();
  v_res        public.reservations;
  v_seat       uuid;
  v_seat_store uuid;
  v_nom_type   text;
  v_check_id   uuid;
  v_cast_ok    boolean := false;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象予約（org 照合・reservations は org_id 列あり）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- status=booked のみ来店処理可（visited 再処理・cancelled/no_show は不可）
  if v_res.status <> 'booked' then raise exception 'not bookable'; end if;

  -- F3b-B: 卓の解決＝引数 > 予約卓（席予約）。卓なし予約は従来どおり引数必須（両 null は no seat）
  v_seat := coalesce(p_seat_id, v_res.seat_id);
  if v_seat is null then raise exception 'no seat'; end if;

  -- ★【10】卓の店＝予約の店（owner の org 全店権限で他店卓に開く誤接続を封じる。
  --   customer あり予約は内側 check_open の invalid customer でも止まるが、guest_name のみの
  --   フリー予約には関所が無いためここで一致を要求）
  -- ★mig0053（裁定(c)）: seats 行ロック＝占有変更の直列化（主席 open を作る経路として同ガード）
  select store_id into v_seat_store from public.seats where id = v_seat for update;
  if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;

  -- ★【5】発見1対策: 解決後の卓に既存 open があれば拒否（使用中の卓に予約客を着けない＝
  --   check_open の「既存 open 再利用」で他人の伝票が返る誤接続の封鎖）。
  --   確認(A): 予約卓が飛び込み客で埋まっている場合もここで 'seat occupied'
  --   → UI は p_seat_id を明示して別卓に通す（実来店が勝つ・audit に予約卓と実卓が両方残る）
  if exists (
    select 1 from public.checks
    where seat_id = v_seat and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;
  -- ★mig0053（B1 相席）: 追加席として占有中の卓も拒否（check_open の再利用が主席∪追加席 union に
  --   なったため、ここで塞がないと予約客が他組の伝票へ着く＝発見1 の相席版）
  if exists (
    select 1 from public.check_seats cs
    join public.checks c on c.id = cs.check_id
    where cs.seat_id = v_seat and c.status = 'open' and c.org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- 【8】nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・【4】権限=can_register・seat 検証・
  --    invalid customer は check_open が担う＝二重に書かない）
  v_check_id := public.check_open(v_seat, v_res.party_size, v_nom_type, v_res.customer_id);

  -- ② 指名引き継ぎ（cast_id あり ∧ ★【6】発見3: cast が is_active のときだけ）
  if v_res.cast_id is not null then
    select true into v_cast_ok from public.casts
    where id = v_res.cast_id and org_id = v_org and is_active
      and store_id = (select store_id from public.checks where id = v_check_id);
    if v_cast_ok then
      -- check_set_nominations を内部呼び（単一指名＝要素1の配列・weight=1・全置換）
      perform public.check_set_nominations(
        v_check_id, v_nom_type,
        jsonb_build_array(jsonb_build_object('cast_id', v_res.cast_id, 'weight', 1))
      );
    end if;
    -- cast inactive（v_cast_ok=false）なら指名スキップ・開店は成功（発見3 lock・不在表示は UI）
  end if;

  -- 予約を visited に・check_id を埋める（【7】visited⇔check_id 1:1）
  update public.reservations
     set status = 'visited', check_id = v_check_id, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_to_check', 'reservations:' || p_reservation_id::text,
    to_jsonb(v_res),
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',v_seat,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $function$
