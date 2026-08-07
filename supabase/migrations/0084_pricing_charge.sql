-- mig0084: 料金ルールの課金経路結線（設計書 v1.2 §1-3/§3）
-- ★非冪等（add column ×3）＝本番手貼り1回・再実行厳禁
-- 内容:
--   A. checks.dohan_fee / check_lines.fee_kind / check_lines.cast_id 追加
--   B. pricing_resolve_core 新設（無ガード内部関数・biz_minutes_of 同型 ACL）
--   C. pricing_resolve 改稿（auth 後 core へ委譲＝UI 挙動不変・pricing86 不変）
--   D. check_open 改稿（live 7a4b4cd2… 起点・set/extension/dohan を core で解決
--      →既存スナップ列＋dohan_fee へ。ルール0件＝stores フォールバック＝現行完全同値）
--   E. check_shimei_add 新設（hon/jonai・kind='charge'・cast_id 凍結・0円でも行を立てる）
--   F. check_dohan_add 新設（凍結値×人数・null は stores へフォールバック）
-- 裁定: 凍結=開栓時（ランクのみ行追加時）／dohan_fee はルール0件なら null／
--       back_snapshot は作らない（非商品行規約 v_back:=null 同型＝money-core 不触）

-- ============================================================
-- A. 列追加
-- ============================================================
alter table public.checks
  add column dohan_fee integer;
alter table public.checks
  add constraint checks_dohan_fee_check check (dohan_fee is null or dohan_fee >= 0);
comment on column public.checks.dohan_fee is
  '同伴料の開栓時スナップ（pricing_rules 解決値）。null=ルール0件（check_dohan_add 時に stores.dohan_fee へフォールバック）または mig0084 以前の伝票';

alter table public.check_lines
  add column fee_kind text;
alter table public.check_lines
  add constraint check_lines_fee_kind_check check (
    fee_kind is null
    or fee_kind in ('set','extension','dohan','hon_shimei','jonai_shimei'));
comment on column public.check_lines.fee_kind is
  '料金種別（pricing_rules の fee_kind と同値域）。null=商品行・時間料金行・mig0084 以前の行';

alter table public.check_lines
  add column cast_id uuid;
alter table public.check_lines
  add constraint check_lines_cast_id_fkey foreign key (cast_id) references public.casts(id);
comment on column public.check_lines.cast_id is
  '指名行のキャスト凍結（将来の率バック遡及計算の布石）。RPC 層で hon_shimei/jonai_shimei のみ設定';

-- FK 走査＋遡及計算用（★設計書外の追補・部分インデックス）
create index check_lines_cast_idx on public.check_lines using btree (cast_id)
  where cast_id is not null;

-- ============================================================
-- B. pricing_resolve_core（無ガード内部関数）
--    現行 pricing_resolve の解決部を逐語移設。auth ガードなし＝
--    staff/cast/kiosk 文脈の check_open / check_shimei_add から呼べる。
--    ACL は biz_minutes_of 同型（authenticated からも EXECUTE 剥奪）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.pricing_resolve_core(p_store_id uuid, p_at timestamp with time zone, p_fee_kind text, p_seat_kind text DEFAULT NULL::text, p_rank_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(amount integer, duration_min smallint, rule_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dow  smallint;
  v_bm   integer;
  v_cut  integer;
  v_seat text;
  v_settings jsonb;
  v_cutoff   text;
begin
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;

  select b.biz_dow, b.biz_min into v_dow, v_bm
    from public.biz_minutes_of(p_store_id, coalesce(p_at, now())) b;

  -- cutoff 分（帯の営業日拡張に使用・ヘルパーと同じイディオム）
  select s.settings_json into v_settings
    from public.stores s where s.id = p_store_id;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;

  v_seat := coalesce(p_seat_kind, '卓');

  return query
  select r.amount, r.duration_min, r.id
    from public.pricing_rules r
   where r.store_id = p_store_id
     and r.is_active
     and r.fee_kind = p_fee_kind
     and (r.seat_kind is null or r.seat_kind = v_seat)
     and (r.rank_id  is null or r.rank_id  = p_rank_id)
     and (r.dow_mask is null or ((r.dow_mask >> v_dow) & 1) = 1)
     and (r.time_from_min is null
          or ( (case when r.time_from_min <  v_cut then r.time_from_min + 1440 else r.time_from_min::int end) <= v_bm
           and v_bm < (case when r.time_to_min <= v_cut then r.time_to_min + 1440 else r.time_to_min::int end) ))
   order by r.priority asc, r.created_at asc, r.id asc
   limit 1;
end $function$;

revoke all on function public.pricing_resolve_core(uuid, timestamp with time zone, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.pricing_resolve_core(uuid, timestamp with time zone, text, text, uuid)
  to service_role;

-- ============================================================
-- C. pricing_resolve 改稿（auth ブロック逐語維持→ core へ委譲）
--    CREATE OR REPLACE は既存 ACL を保持＝grants 不変。
-- ============================================================
CREATE OR REPLACE FUNCTION public.pricing_resolve(p_store_id uuid, p_at timestamp with time zone, p_fee_kind text, p_seat_kind text DEFAULT NULL::text, p_rank_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(amount integer, duration_min smallint, rule_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;

  -- ★mig0084: 解決部を pricing_resolve_core へ移設（帯判定ロジックの単一ソース化）。
  --   auth・エラー面・返却は改稿前と完全同値＝pricing 段43 不変。
  return query
  select * from public.pricing_resolve_core(p_store_id, coalesce(p_at, now()),
                                            p_fee_kind, p_seat_kind, p_rank_id);
end $function$;

-- ============================================================
-- D. check_open 改稿（live 7a4b4cd2… 起点・最小差分）
--    差分: seats select に s.kind / st.dohan_fee 追加・core 解決3種・
--          スナップ代入を coalesce 化・insert に dohan_fee 追加。他は逐語。
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
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
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
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id), v_seat.store_id);
  return v_id;
end $function$;

-- ============================================================
-- E. check_shimei_add（本指名/場内指名の課金行・新設＝check_lines への4本目の INSERT 経路）
--    ゲートは check_add_line の5腕逐語＋payments 拒否（check_time_charge_apply 同型）。
--    解決: 時間/曜日軸= checks.started_at（凍結点）・席種=伝票の現在席の kind・
--          ランク=行追加時点の casts.rank_id（軸の性質＝裁定）。
--    0行= stores.hon_fee/jonai_fee フォールバック。★0円でも行を立てる（裁定①＝
--    行の存在が指名事実・cast_id 凍結は率バック遡及計算の布石）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_cast record; v_id uuid; v_sort int; v_paycnt int;
  v_seat_kind text; v_fee_kind text; v_name text; v_price int;
  v_org uuid; r_fee record;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if p_kind is null or p_kind not in ('hon','jonai') then raise exception 'bad kind'; end if;
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
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  -- キャスト検証（同 org・伝票の店と同店・在籍）★A1: is_active は CC 照合対象
  select c.id, c.store_id, c.rank_id, c.is_active into v_cast
    from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;

  -- 席種＝伝票の現在席（席移動後はその席の料率＝運用整合）・時間軸＝started_at（凍結）
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
  v_fee_kind := case p_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
  select * into r_fee from public.pricing_resolve_core(
    v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
  if r_fee.amount is not null then
    v_price := r_fee.amount;
  else
    select case when p_kind = 'hon' then st.hon_fee else st.jonai_fee end
      into v_price from public.stores st where st.id = v_chk.store_id;
  end if;
  v_name := case p_kind when 'hon' then '本指名料' else '場内指名料' end;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, p_cast_id)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  -- audit: 行 jsonb（name_snapshot は料金名・cast は id のみ＝PII なし既存流儀）
  perform public.audit_log_write('check_shimei_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

revoke all on function public.check_shimei_add(uuid, uuid, text) from public, anon;
grant execute on function public.check_shimei_add(uuid, uuid, text) to authenticated, service_role;

-- ============================================================
-- F. check_dohan_add（同伴料の課金行・新設＝5本目の INSERT 経路）
--    単価＝開栓時凍結値 checks.dohan_fee。null（ルール0件 or mig0084 以前の伝票）は
--    stores.dohan_fee（基本料金・現在値）へフォールバック（裁定②）。
--    同伴＝単価×人数（裁定C）＝qty=p_count。
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_dohan_add(p_check_id uuid, p_count integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid; v_sort int; v_paycnt int; v_price int;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
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
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  select coalesce(v_chk.dohan_fee, st.dohan_fee) into v_price
    from public.stores st where st.id = v_chk.store_id;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          '同伴料', v_price, p_count, v_price * p_count, null, v_sort, 'dohan', null)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_dohan_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

revoke all on function public.check_dohan_add(uuid, integer) from public, anon;
grant execute on function public.check_dohan_add(uuid, integer) to authenticated, service_role;
