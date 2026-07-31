-- mig0070: back_exempt を check_lines.back_snapshot に凍結する
-- 前提: mig0066-0069 適用済み / 冪等（create or replace）
--
-- ★目的: mig0068 は check_close が products.back_exempt_from_split を「現価」で見ていた。
--   行が打たれた後にマスタのフラグを切り替えると、その伝票の按分結果が変わってしまい、
--   back_snapshot を行に凍結している原則と矛盾する。
--   本 migration で経路の分岐も凍結値に載せ、check_close と drink_claim_submit_proxy が
--   同一の凍結値を見るようにする（両者がズレる中間状態を構造的に消す）。
-- ★既存行は back_exempt キーを持たない → coalesce(..., false) で按分経路に倒れる＝現行挙動不変。
--   backfill は行わない（裁定(1)）。false を明示的に書くだけで挙動は1ミリも変わらず、
--   かつ drink_claims_guard_line_update トリガが back_snapshot の変更を検知するため、
--   approved claim を持つ行があると backfill 自体が失敗する無意味な例外経路を作ることになる。

begin;

-- ============================================================
-- (1) check_add_line: back_snapshot に back_exempt を凍結
--     ★実差分は jsonb_build_object に1キー足しただけ
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    -- ★mig0070: back_exempt を凍結（経路の分岐もマスタ現価でなく伝票の凍結値で決める）
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt,
                                 'back_exempt', coalesce(v_prod.back_exempt_from_split, false));
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

-- ============================================================
-- (2) check_close: 除外判定を凍結値へ（mig0068 の products 現価参照を置換）
--     ★実差分は for ループの select の条件1行のみ
-- ============================================================
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
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
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
         -- ★mig0070: キャストドリンクは按分から除外（凍結値で判定・キー無し=false=按分対象）
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
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
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

-- ============================================================
-- (3) drink_claim_submit_proxy: 受理判定も凍結値へ
--     ★check_close と同一の真実を見る（両者がズレる中間状態を消す）
-- ============================================================
CREATE OR REPLACE FUNCTION public.drink_claim_submit_proxy(p_line_id uuid, p_cast_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_cast record;
  v_actor uuid; v_unit int; v_back int; v_id uuid;
begin
  -- 冒頭 null ガード。kiosk 腕を意図的に持たない＝0059 非開示原則
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;

  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then
    raise exception 'forbidden';  -- 存在オラクル封じ
  end if;

  select * into v_chk from public.checks where id = v_line.check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;

  -- 黒服 can_register 以上（cast 腕なし＝代理起票は店側の行為）
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if v_line.product_id is null or v_line.back_snapshot is null
     or v_line.kind not in ('drink','champ','bottle') then
    raise exception 'bad line';
  end if;

  -- ★mig0070: 経路排他の判定を凍結値へ（products の現価は読まない）
  if coalesce((v_line.back_snapshot ->> 'back_exempt')::boolean, false) is not true then
    raise exception 'not exempt product';
  end if;

  if exists (select 1 from public.drink_claims d
              where d.check_line_id = v_line.id and d.status = 'approved') then
    raise exception 'already claimed';
  end if;

  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
     or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
    raise exception 'bad cast';
  end if;

  -- ★焼付け＝伝票凍結値（check_close と同一の真実。マスタ現価では読まない）
  if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
    v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
  else
    v_unit := round(v_line.unit_price_snapshot
                    * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
  end if;
  v_back := v_unit * v_line.qty;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.drink_claims
    (org_id, store_id, check_id, check_line_id, cast_id, product_id, qty, back_amount,
     status, requested_by, decided_by, decided_at)
  values
    (v_chk.org_id, v_chk.store_id, v_chk.id, v_line.id, p_cast_id, v_line.product_id,
     v_line.qty, v_back, 'approved', v_actor, v_actor, now())
  returning id into v_id;

  perform public.audit_log_write('drink_claim_submit_proxy', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

commit;
