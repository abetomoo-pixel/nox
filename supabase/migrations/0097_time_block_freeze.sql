-- ═══════════════════════════════════════════════════════════════════════════
-- mig0097: R2-b 確定ブロック凍結（時点起算・money-core・自己検証版）
--   check_lines.block_no ＋ 部分ユニーク3列張り替え ＋ apply 改稿 ＋ set_people 2段 apply 化
--   底本 = nox_mig0097_live_defs.sql（sha256 2e9d8e48…7014c・live 逐語）
--   正本 = R2 設計書 v1.1（R2-6/R2-7 改訂/R2-7b 新設・裁定33）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: add column／backfill／index drop・create
-- ★notify pgrst はファイル外・手貼り後に単発
-- ★両関数とも同一署名の create or replace＝ACL 継承・billing/grants pin 不変（既 roster 収載）
-- ★ゲート（0057 5腕・billing・has payments・not open）は raise 文比較で逐語不変を機械確認済み
-- ★意味論: set 行=block_no 0 固定・全遡及（現況 units）不変／auto extension=block 1..n・
--   終了済み=凍結（do nothing）・進行中=現況 units upsert／legacy 合算 ext 行（block_no null）は
--   apply が吸収／manual 店は不変（time_auto=false 行は非対象・段49(4) 維持）
-- ★手貼り前 CC 照合の必須項目: stores の時間モード列名が time_mode であること（底本未採取＝
--   本 mig の唯一の底本外参照。不一致なら停止・申告）
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- (1) DDL: block_no ＋ backfill ＋ 部分ユニーク張り替え
-- ─────────────────────────────────────────────
alter table public.check_lines add column block_no integer;

-- backfill: auto set 行は全行 block_no=0（両モード・open/closed とも＝制約意味論の統一・金額不変）。
-- auto extension の既存合算行は null のまま＝open 伝票は次回 apply が吸収・closed は歴史不変
update public.check_lines set block_no = 0 where time_auto and fee_kind = 'set';

drop index public.check_lines_one_time_auto;
create unique index check_lines_one_time_auto
  on public.check_lines using btree (check_id, fee_kind, block_no) where time_auto;

-- ─────────────────────────────────────────────
-- (2) check_time_charge_apply 改稿（同一署名・置換）
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- (3) check_set_people 2段 apply 化（同一署名・置換）
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_set_people(p_check_id uuid, p_people integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_paycnt int; v_units int; v_mode text;  -- ★mig0097
  v_before jsonb;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- person 制の units 変動＝入金後の合計変動を塞ぐ（apply/shimei と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  v_before := to_jsonb(v_chk);

  -- ★mig0097 R2-7b: 2段 apply（auto 店のみ）。①旧 units で経過ブロックを生成・凍結→②people 更新→
  --   ③進行中ブロックのみ新 units で upsert。放置伝票（apply 未発生のまま複数ブロック経過）でも
  --   変更前ブロックが旧人数で確定する＝時点起算の厳密化（設計書 v1.1 正本）
  select s.time_mode into v_mode from public.stores s where s.id = v_chk.store_id;
  if v_mode = 'auto' then
    perform public.check_time_charge_apply(p_check_id);
  end if;

  update public.checks set people = p_people where id = p_check_id;

  -- 開卓時 set 行の即時追随（auto 店は次回 apply でも同値に収束＝二重権威にならない。
  --   manual 店はここが唯一の再計算点。行が無い（set額0 等）場合は何もしない）
  if v_mode = 'auto' then
    -- ③進行中ブロック＋set 行を新 units で再計算（set=全遡及・ext=時点起算は apply が担う）
    perform public.check_time_charge_apply(p_check_id);
  elsif v_chk.time_per = 'person' then
    v_units := coalesce(p_people, 1);
    update public.check_lines
       set qty = v_units, line_total = unit_price_snapshot * v_units
     where check_id = p_check_id and time_auto and fee_kind = 'set';
    perform public.check_recalc(p_check_id);
  end if;

  perform public.audit_log_write('check_set_people', 'checks:' || p_check_id::text,
    v_before, (select to_jsonb(c) from public.checks c where c.id = p_check_id),
    v_chk.store_id);
end $function$;

commit;
