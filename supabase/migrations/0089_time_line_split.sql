-- mig0089: 時間料金の行分離＋manual 延長＋kiosk 時間表示列（レジ改善設計 v1 §1-3）
-- ★非冪等（index 再定義）＝本番手貼り1回・再実行厳禁
-- A. check_lines_one_time_auto を (check_id, fee_kind) へ再定義
-- B. check_time_charge_apply 改稿（live 2026-08-18 起点）: legacy 合算1行を delete →
--    set 行＋extension 行の2行 upsert（額>0 のみ実体化・総額は旧式と同値）
-- C. check_extension_add 新設（manual 店専用・1押し=1行・auto 店は拒否）
-- D. check_open 改稿: 開卓時に set 行を自動挿入（set額×units>0 のとき・両モード共通）
--    ★底本=0084 収蔵版＋0088 ゲート行の合成＝CC 照合 A1 で live byte diff 必須
-- E/F. kiosk 読取2本へ加算的キー追加（set_min/ext_min/time_per/people・detail は fee も）
-- 返り値変更: apply の 'line_id' → 'set_line_id'/'ext_line_id'（R-A で app 追随）
-- ★段取り: 手貼り直後は verify:pricing-apply 段44(3) が一時赤（返り値キー変更）＝
--   R-A 冒頭で張り替えるまで verify:f0 全走はしない。audit target 変更
--  （check_lines:<id>→checks:<checkId>）は台帳記録（R-A で実施）
-- ★_r2: begin/commit・貼り先証明・B節コメント復元・D節 set 行 audit・F節ヘッダ是正

begin;
select 'nox-project-proof' as proof, count(*) as orgs from public.orgs;

-- ============================================================
-- A. 部分ユニーク再定義
-- ============================================================
drop index public.check_lines_one_time_auto;
create unique index check_lines_one_time_auto
  on public.check_lines using btree (check_id, fee_kind) where time_auto;

-- ============================================================
-- B. check_time_charge_apply（live 起点・行分離）
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_time_charge_apply(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_set_id uuid; v_ext_id uuid;
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
  v_ext_c := v_blocks * v_chk.ext_fee * v_units;
  v_total := v_set_c + v_ext_c;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_before
    from public.check_lines l where l.check_id = p_check_id and l.time_auto;

  -- ★mig0089: legacy 合算1行（fee_kind null）の移行吸収＝apply 自身が delete。
  --   closed 伝票は本 RPC が触れない（not open ガード）＝歴史は不変
  delete from public.check_lines
   where check_id = p_check_id and time_auto and fee_kind is null;

  -- set 行（額>0 のみ実体化・0 なら既存 auto set 行を削除＝総額保存則）
  if v_set_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            'セット料金(' || v_chk.set_min || '分)', v_chk.set_fee, v_units, v_set_c,
            null, v_sort, true, 'set')
    on conflict (check_id, fee_kind) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot
    returning id into v_set_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'set';
  end if;

  -- extension 行（blocks>0 かつ額>0 のみ・qty=blocks×units）
  if v_ext_c > 0 then
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_lines where check_id = p_check_id;
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind)
    values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
            '延長料金(' || v_chk.ext_min || '分)', v_chk.ext_fee, v_blocks * v_units, v_ext_c,
            null, v_sort, true, 'extension')
    on conflict (check_id, fee_kind) where time_auto do update
       set unit_price_snapshot = excluded.unit_price_snapshot,
           qty                 = excluded.qty,
           line_total          = excluded.line_total,
           name_snapshot       = excluded.name_snapshot
    returning id into v_ext_id;
  else
    delete from public.check_lines
     where check_id = p_check_id and time_auto and fee_kind = 'extension';
  end if;

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

-- ============================================================
-- C. check_extension_add（manual 店専用・1押し=1行）
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_extension_add(p_check_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_mode text; v_units int; v_sort int; v_paycnt int; v_id uuid;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
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
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  if v_chk.ext_min < 1 or v_chk.ext_fee < 0 or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;
  -- ★manual 専用（auto 店は check_time_charge_apply が権威＝二重計上封じ）
  select time_mode into v_mode from public.stores where id = v_chk.store_id;
  if v_mode is distinct from 'manual' then raise exception 'auto mode'; end if;

  v_units := case when v_chk.time_per = 'person' then coalesce(v_chk.people, 1) else 1 end;
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_lines where check_id = p_check_id;
  -- 1押し=1行（time_auto=false＝部分ユニーク非対象・客確認の記録が行数で残る・取消は remove_line）
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto, fee_kind)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          '延長料金(' || v_chk.ext_min || '分)', v_chk.ext_fee, v_units,
          v_chk.ext_fee * v_units, null, v_sort, false, 'extension')
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_extension_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

revoke all on function public.check_extension_add(uuid) from public, anon;
grant execute on function public.check_extension_add(uuid) to authenticated, service_role;

-- ============================================================
-- D. check_open 改稿（底本=0084 収蔵版＋0088 ゲート行の合成・★CC 照合 A1 必須）
--    差分は「set 行の自動挿入＋recalc」1ブロックのみ（insert 後・audit 前）
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
  v_units int;  -- ★0089
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',       v_seat.kind, null);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension', v_seat.kind, null);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',     v_seat.kind, null);

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id)
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id)
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  -- ★mig0089: 開卓時に set 行を自動挿入（両モード共通・額>0 のみ＝時間課金を使わない
  --   店は現行同値）。auto 店は以後 check_time_charge_apply が同行を upsert 再計算。
  v_units := case when v_tper = 'person' then coalesce(p_people, 1) else 1 end;
  if v_sfee * v_units > 0 then
    insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                    name_snapshot, unit_price_snapshot, qty, line_total,
                                    back_snapshot, sort_order, time_auto, fee_kind)
    values (v_org, v_seat.store_id, v_id, null, 'time', 'A',
            'セット料金(' || v_smin || '分)', v_sfee, v_units, v_sfee * v_units,
            null, 1, true, 'set');
    perform public.check_recalc(v_id);
    -- ★_r2: 行単位 audit（原則6）。manual 店は apply が来ない＝ここが唯一の書込記録
    perform public.audit_log_write('check_open_set_line',
      'check_lines:' || (select l.id::text from public.check_lines l
                          where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      null,
      (select to_jsonb(l) from public.check_lines l
        where l.check_id = v_id and l.time_auto and l.fee_kind = 'set'),
      v_seat.store_id);
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id), v_seat.store_id);
  return v_id;
end $function$;

-- ============================================================
-- E. kiosk_register_state（live 起点・checks へ加算的キー4つ）
-- ============================================================
CREATE OR REPLACE FUNCTION public.kiosk_register_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                       order by s.sort_order)
        from public.seats s
       where s.store_id = v_store and s.is_active), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'sort_order', pc.sort_order)
                       order by pc.sort_order, pc.name)
        from public.product_categories pc
       where pc.store_id = v_store and pc.is_active), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price, 'category_id', p.category_id, 'sort_order', p.sort_order)
                       order by coalesce(pc.sort_order, 2147483647), p.sort_order, p.name)
        from public.products p
        left join public.product_categories pc on pc.id = p.category_id
       where p.store_id = v_store and p.is_active), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.casts c
       where c.store_id = v_store and c.is_active), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ck.id,
               'seat_id', ck.seat_id,
               'extra_seat_ids', coalesce((
                 select jsonb_agg(cs.seat_id order by cs.created_at)
                   from public.check_seats cs where cs.check_id = ck.id), '[]'::jsonb),
               'total', ck.total,
               'started_at', ck.started_at,
               'set_min', ck.set_min,
               'ext_min', ck.ext_min,
               'time_per', ck.time_per,
               'people', ck.people) order by ck.started_at)
        from public.checks ck
       where ck.store_id = v_store and ck.status = 'open'), '[]'::jsonb)
  );
end $function$;

-- ============================================================
-- F. kiosk_check_detail（live 起点・check へ加算的キー5つ＝表示＋延長ボタン用 fee）
-- ============================================================
CREATE OR REPLACE FUNCTION public.kiosk_check_detail(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_chk   public.checks;
  v_paid  integer;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null then raise exception 'not found'; end if;
  if v_chk.store_id <> v_store then raise exception 'forbidden'; end if;

  select coalesce(sum(pm.amount), 0)::int into v_paid
    from public.payments pm where pm.check_id = p_check_id;

  return jsonb_build_object(
    'check', jsonb_build_object(
      'id', v_chk.id, 'seat_id', v_chk.seat_id, 'status', v_chk.status,
      'people', v_chk.people, 'nom_type', v_chk.nom_type, 'started_at', v_chk.started_at,
      'total', v_chk.total,
      'service_rate', v_chk.service_rate, 'round_unit', v_chk.round_unit, 'round_mode', v_chk.round_mode,
      'set_min', v_chk.set_min, 'set_fee', v_chk.set_fee,
      'ext_min', v_chk.ext_min, 'ext_fee', v_chk.ext_fee,
      'time_per', v_chk.time_per),
    'time_mode', (select st.time_mode from public.stores st where st.id = v_chk.store_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'kind', l.kind, 'pay_group', l.pay_group,
               'name_snapshot', l.name_snapshot, 'unit_price_snapshot', l.unit_price_snapshot,
               'qty', l.qty, 'line_total', l.line_total) order by l.sort_order)
        from public.check_lines l where l.check_id = p_check_id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pm.id, 'pay_group', pm.pay_group, 'method', pm.method,
               'amount', pm.amount, 'tendered', pm.tendered, 'method_detail', pm.method_detail)
                       order by pm.paid_at)
        from public.payments pm where pm.check_id = p_check_id), '[]'::jsonb),
    'nominations', coalesce((
      select jsonb_agg(jsonb_build_object('cast_id', n.cast_id, 'ratio_weight', n.ratio_weight)
                       order by n.position)
        from public.check_nominations n where n.check_id = p_check_id), '[]'::jsonb),
    'extra_seat_ids', coalesce((
      select jsonb_agg(cs.seat_id order by cs.created_at)
        from public.check_seats cs where cs.check_id = p_check_id), '[]'::jsonb),
    'paid_total', v_paid,
    'balance', v_chk.total - v_paid
  );
end $function$;

commit;
