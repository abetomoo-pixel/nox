-- 0218_ext_shimei_auto（台帳の残 #47・起票167 の続き・相談役 11/26 の便 L5・起草と試走まで・適用はしない）
--   決め（相談役 11/26・READY.md の 4 節の推す形）：1＝ア 延長のブロックごとに本指名 1 人へ 1 行・2＝ア ブロックの始まりの時刻にいた本指名で数え、終わったブロックは凍結・
--     3＝ア 初回の込みの卓（時間で終わり・時間無制限）は付かない。延長に切り替えた後のブロックから付く。
--   中身：check_time_charge_apply の作り直し 1 本（同じ署名・CREATE OR REPLACE＝ACL はそのまま）。表・列・索引は変えない・関数の数は変わらない（525）。
--     足した段は延長の行を作った後・ext の実測の前。自動延長（time_mode='auto'）かつ延長指名 ON かつ額のある店だけ書く＝OFF・額なし・手動の店は 1 バイトも変わらない。
--     行は time_auto=false・block_no＝ブロック・idem_key＝md5('ext_shimei_auto:' 伝票:ブロック:キャスト)::uuid（on conflict do nothing＝2 回動いても同じ・作った行は変えない）。
--   本番の今の定義との差分：docs/tmp/ext_shimei_auto_1126/diff_live.md（変えた行と前後 3 行）。翻訳元＝本番の check_time_charge_apply（md5(prosrc) 3a84c67b6490871fca9c7246e4579168）・
--     額の引き方は check_extension_add の延長指名料（0124）と同じ。
--   検証クエリ（当てた後・先頭に貼り先証明）：docs/tmp/ext_shimei_auto_1126/0218_verify.sql（select 'nox-project-proof', count(*) from public.orgs で始まる）。
begin;
set local lock_timeout = '10s';

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
  v_eunits int;  -- ★mig0130: ext 実効単位の units
  v_pick jsonb; v_fee_k int;  -- ★0187（便 EXT）: ブロックごとの額
  v_es_on boolean; v_es_seat text; r_es record; v_nom record; v_bstart timestamptz; v_es_id uuid;  -- ★0218（台帳の残 #47）: 自動延長の店の延長指名料
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.assert_on_duty('check_time_charge_apply');   -- ★0190（裁定436 ①a）: 打刻ゲート＝当日の出勤打刻（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false は不問）
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id() and public.auth_cast_check_allowed(p_check_id)   -- ★0200（裁定473）: 会計できる卓（all／own）
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
  -- ★mig0130: 実効単位2値も防御対象へ(null は time_per へ収束=旧伝票互換)
  if v_chk.set_min < 1 or v_chk.ext_min < 1 or v_chk.set_fee < 0 or v_chk.ext_fee < 0
     or v_chk.time_per not in ('table','person')
     or coalesce(v_chk.set_unit, v_chk.time_per) not in ('table','person')
     or coalesce(v_chk.ext_unit, v_chk.time_per) not in ('table','person') then
    raise exception 'bad time settings';
  end if;

  -- サーバ計算（モック Lp 写し・経過は「完了分」＝floor・浮動小数を金額に持ち込まない）
  -- ★mig0089: 式は改稿前と逐語同一＝金額不変（行の持ち方だけ分離）
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  -- ★mig0130: units 2系統化(set=set_unit・ext=ext_unit・null→time_per=現行同値)
  v_units  := case when coalesce(v_chk.set_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_eunits := case when coalesce(v_chk.ext_unit, v_chk.time_per) = 'person'
                   then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  if coalesce(v_chk.time_end, 'extend') <> 'extend' then v_blocks := 0; end if;   -- ★0210（起票140）: 時間で終わり（end）・時間無制限（unlimited）の初回の卓は延長しない（下で自動の延長の行も消える）。店長以上が check_set_time_end で extend に切り替えた後は今と同じ
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
  if coalesce(v_chk.set_frozen, false) then
    null;   -- ★2 0173（裁定386）: セット終了後に人数が変わった伝票＝セット行は凍結（引き直さない・削除もしない）
  elsif v_set_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind, block_no, all_in)   -- ★0210: +all_in
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            case when v_chk.set_price_mode = 'all_in' then '初回料金(' || v_chk.set_min || '分) 税・サ込' else 'セット料金(' || v_chk.set_min || '分)' end, v_chk.set_fee, v_units, v_set_c,   -- ★0210: check_open と同じ名前
            null, v_sort, true, 'set', 0, coalesce(v_chk.set_price_mode, 'base') = 'all_in')
    on conflict (check_id, fee_kind, block_no) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot,
           all_in              = excluded.all_in   -- ★0210
    returning id into v_set_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'set';
  end if;

  -- extension 行（★mig0097 R2-7/R2-7b: ブロック単位＝終了済みは凍結・進行中のみ現況 units）
  --   時計逆行等で v_blocks を超えた行が残った場合は削除（決定性の維持）
  --   ★mig0130: ext の units は v_eunits(ext_unit 起点)
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind = 'extension'
     and block_no is not null and block_no > v_blocks;

  if v_blocks = 0 or v_chk.ext_fee = 0 then
    -- ブロックなし or 単価0＝額>0 のみ実体化原則（0089 の else 分岐と同義）
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  else
    for v_k in 1..v_blocks loop
      -- ★0187（便 EXT・Agoora 確定 10/27（2））: このブロックの開始時刻（入店＋セット＋前のブロック）の時間帯に合う行の額（長さ＝ext_min の行だけ・時間帯つき→選択中のパターン→既定）。
      --   0187 前に開いた伝票（band キーなし）・合う行なし＝従来の ext_fee
      v_pick := public.ext_menu_pick(v_chk.ext_menu_snap, (select b.biz_min from public.biz_minutes_of(v_chk.store_id, v_chk.started_at + make_interval(mins => v_chk.set_min + (v_k - 1) * v_chk.ext_min)) b), v_chk.ext_rule_id, v_chk.ext_min);
      v_fee_k := coalesce((v_pick->>'amount')::int, v_chk.ext_fee);
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_lines where check_id = p_check_id;
      if v_d >= v_chk.set_min + v_k * v_chk.ext_min then
        -- 終了済みブロック＝凍結（既存行 do nothing 不触・無ければ現況 units で初回生成＝R2-7b）
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
        on conflict (check_id, fee_kind, block_no) where time_auto do nothing;
      else
        -- 進行中ブロック（k=v_blocks のみ到達）＝現況 units で upsert
        insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                        name_snapshot, unit_price_snapshot, qty, line_total,
                                        back_snapshot, sort_order, time_auto, fee_kind, block_no)
        values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
                '延長料金(' || v_chk.ext_min || '分) #' || v_k, v_fee_k, v_eunits,   -- ★0187: ブロックごとの額
                v_fee_k * v_eunits, null, v_sort, true, 'extension', v_k)
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

  -- ★0218（起票167 の続き・台帳の残 #47・相談役 11/26 の便 L5 の決め 1〜3 ＝ア）: 自動延長の店の延長指名料。
  --   延長のブロック 1 つごとに、そのブロックの始まりの時刻にいた本指名 1 人につき 1 行（額＝手動の店と同じ pricing_resolve_core(ext_shimei)＝伝票の開始の時刻・卓の席種）。
  --   始まりの時刻にいた本指名＝着席（created_at）がその時刻以前・終わり（ended_at）が無いかその時刻より後・その時刻の種類が hon（kind_changed_at より前は prev_kind）。
  --   行は 1 度作ったら変えない（終わったブロックも進んでいるブロックも凍結＝idem_key＝md5('ext_shimei_auto:' 伝票:ブロック:キャスト)・on conflict do nothing）。
  --   time_auto は false（一意の決まり check_lines_one_time_auto＝伝票×種類×ブロックに 2 人目が当たる）＝block_no で自動の行と分かる（手動の延長指名料は block_no が空）。
  --   動くのは time_mode='auto' かつ延長指名 ON かつ額のある店だけ（OFF・額なし・手動の店は読むだけで何も書かない）。時間で終わり・時間無制限の初回の卓は v_blocks=0＝付かない（延長に切り替えた後に数える）。
  select (st.time_mode = 'auto' and st.ext_shimei_enabled) into v_es_on from public.stores st where st.id = v_chk.store_id;
  if coalesce(v_es_on, false) and v_blocks > 0 then
    select s.kind into v_es_seat from public.seats s where s.id = v_chk.seat_id;
    select * into r_es from public.pricing_resolve_core(v_chk.store_id, v_chk.started_at, 'ext_shimei', v_es_seat, null);
    if r_es.amount is not null then
      -- 時計の逆行などで v_blocks を超えた自動の行は消す（延長の行と同じ決定性）
      delete from public.check_lines
       where check_id = p_check_id and not time_auto and fee_kind = 'ext_shimei' and block_no is not null and block_no > v_blocks;
      for v_k in 1..v_blocks loop
        v_bstart := v_chk.started_at + make_interval(mins => v_chk.set_min + (v_k - 1) * v_chk.ext_min);
        for v_nom in select n.cast_id from public.check_nominations n
                      where n.check_id = p_check_id and n.created_at <= v_bstart
                        and (n.ended_at is null or n.ended_at > v_bstart)
                        and (case when n.kind_changed_at is not null and n.kind_changed_at > v_bstart then n.prev_kind else n.nom_kind end) = 'hon'
                      order by n.position, n.cast_id
        loop
          v_es_id := null;
          select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
          insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                          name_snapshot, unit_price_snapshot, qty, line_total,
                                          back_snapshot, sort_order, time_auto, fee_kind, block_no, cast_id, idem_key)
          values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
                  '延長指名料 #' || v_k, r_es.amount, 1, r_es.amount, null, v_sort, false, 'ext_shimei', v_k, v_nom.cast_id,
                  md5('ext_shimei_auto:' || p_check_id::text || ':' || v_k::text || ':' || v_nom.cast_id::text)::uuid)
          on conflict (idem_key) where idem_key is not null do nothing
          returning id into v_es_id;
          if v_es_id is not null then
            perform public.audit_log_write('check_time_charge_apply', 'check_lines:' || v_es_id::text, null,
              (select to_jsonb(l) from public.check_lines l where l.id = v_es_id), v_chk.store_id);
          end if;
        end loop;
      end loop;
    end if;
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
                            'set_line_id', v_set_id, 'ext_line_id', v_ext_id,
                            'ext_units', v_eunits);  -- ★mig0130: 追加キー('units' は set 側で据え置き)
end $function$;

commit;
