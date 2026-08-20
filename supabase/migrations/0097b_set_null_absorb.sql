-- ═══════════════════════════════════════════════════════════════════════════
-- mig0097b: hotfix — set 行二重化の封鎖（R2-7c・裁定済み）
--   機序: check_open が set 行を block_no=null で insert し続ける（0097 改稿対象外）→
--         3列ユニークは NULL distinct で不発火→apply の 0 行 insert と二重化（set 額過大）。
--   修正: apply に set null 行の無条件吸収 delete を1本追加（extension null 吸収と対称）。
--   底本: mig0097 適用後 live（照合で byte 一致確認済み）＝改変は吸収 delete 1ブロックのみ。
--   ★再適用可（同一署名 create or replace のみ・ACL 継承・DDL なし）
--   ★check_open の block_no=0 化は 0098 同梱（R2-7c）
--   ★notify pgrst はファイル外・手貼り後に単発
-- ═══════════════════════════════════════════════════════════════════════════

begin;

CREATE OR REPLACE FUNCTION public.check_time_charge_apply(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_set_id uuid; v_ext_id uuid; v_k int;  -- ★mig0097: block ループ用
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 裁定(c): 入金後に合計が動く経路を塞ぐ（check_remove_line と同じ保守側。
  -- check_add_line の非対称は裁定台帳に既知事項として記録済み＝今回は触らない）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 防御深度: スナップ5値の妥当性（checks 列 CHECK が正・型/列事故の検知用＝E1【決定1】流儀）
  if v_chk.set_min < 1 or v_chk.ext_min < 1 or v_chk.set_fee < 0 or v_chk.ext_fee < 0
     or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;

  -- サーバ計算（モック Lp 写し・経過は「完了分」＝floor・浮動小数を金額に持ち込まない）
  -- ★mig0089: 式は改稿前と逐語同一＝金額不変（行の持ち方だけ分離）
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  v_units := case when v_chk.time_per = 'person' then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  v_set_c := v_chk.set_fee * v_units;
  -- ★mig0097: v_ext_c は式では出せない（凍結ブロックの units は現況と異なり得る）＝
  --   行生成の後に Σline_total で実測確定し、v_total もそこで算出する

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_before
    from public.check_lines l where l.check_id = p_check_id and l.time_auto;

  -- ★mig0089: legacy 合算1行（fee_kind null）の移行吸収＝apply 自身が delete。
  --   closed 伝票は本 RPC が触れない（not open ガード）＝歴史は不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind is null;

  -- ★mig0097: 旧形式の合算 extension 行（block_no null）の移行吸収（0089 の fee_kind null 吸収と
  --   同型）。closed 伝票は本 RPC が触れない＝歴史不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension' and block_no is null;

  -- ★mig0097b: check_open 由来の block_no null な set 行の移行吸収（extension null 吸収と対称）。
  --   3列ユニークは NULL distinct のため null set 行には効かず、放置すると block_no=0 行との
  --   二重化（set 額の過大計上）が起きる＝実バグの封鎖。null しか無い初回 apply でも、
  --   null+0 の二重化が既に起きた伝票でも、この delete→直後の 0 行 upsert で単一行へ収束する。
  --   check_open 側の block_no=0 化（再生産の停止）は 0098（R2-a・check_open 改稿）で実施。
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'set' and block_no is null;

  -- set 行（額>0 のみ実体化・0 なら既存 auto set 行を削除＝総額保存則）
  -- ★mig0097: block_no=0 固定（R2-7 改訂）・conflict 推論は3列。set=全遡及（現況 units）の意味論不変
  if v_set_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            'セット料金(' || v_chk.set_min || '分)', v_chk.set_fee, v_units, v_set_c,
            null, v_sort, true, 'set', 0)
    on conflict (check_id, fee_kind, block_no) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot
    returning id into v_set_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'set';
  end if;

  -- extension 行（★mig0097 R2-7/R2-7b: ブロック単位＝終了済みは凍結・進行中のみ現況 units）
  --   時計逆行等で v_blocks を超えた行が残った場合は削除（決定性の維持）
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension'
     and block_no is not null and block_no > v_blocks;

  if v_blocks = 0 or v_chk.ext_fee = 0 then
    -- ブロックなし or 単価0＝額>0 のみ実体化原則（0089 の else 分岐と同義）
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  else
    for v_k in 1..v_blocks loop
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_lines where check_id = p_check_id;
      if v_d >= v_chk.set_min + v_k * v_chk.ext_min then
        -- 終了済みブロック＝凍結（既存行 do nothing 不触・無ければ現況 units で初回生成＝R2-7b）
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_chk.ext_fee, v_units,
                v_chk.ext_fee * v_units, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do nothing;
      else
        -- 進行中ブロック（k=v_blocks のみ到達）＝現況 units で upsert
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_chk.ext_fee, v_units,
                v_chk.ext_fee * v_units, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do update
           set unit_price_snapshot = excluded.unit_price_snapshot,
               qty                 = excluded.qty,
               line_total          = excluded.line_total,
               name_snapshot       = excluded.name_snapshot;
      end if;
    end loop;
    select l.id into v_ext_id from public.check_lines l
     where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension'
     order by l.block_no desc limit 1;
  end if;

  -- ★mig0097: ext は行実測で確定（凍結行の units 混在を正しく合算）
  select coalesce(sum(l.line_total), 0)::int into v_ext_c from public.check_lines l
   where l.check_id = p_check_id and l.time_auto and l.fee_kind = 'extension';
  v_total := v_set_c + v_ext_c;

    perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_time_charge_apply', 'checks:' || p_check_id::text,
    v_before,
    (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
       from public.check_lines l where l.check_id = p_check_id and l.time_auto),
    v_chk.store_id);

  return jsonb_build_object('elapsed_min', v_d, 'units', v_units, 'blocks', v_blocks,
                            'set_c', v_set_c, 'ext_c', v_ext_c, 'total', v_total,
                            'set_line_id', v_set_id, 'ext_line_id', v_ext_id);
end $function$;

commit;
