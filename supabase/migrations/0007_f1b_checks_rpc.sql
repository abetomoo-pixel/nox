-- 0007_f1b_checks_rpc: F1b — レジ会計 RPC（公開7本＋内部3本＝計10関数）。0006 適用済みが前提。
--
-- 公開 RPC 7本（revoke public, anon ＋ grant authenticated・全て二重防御＋audit_log_write）:
--   check_open / check_set_nominations / check_add_line / check_remove_line /
--   check_pay / check_close / check_void
--   ※ plan（公開6本＋内部 recalc）から +1: check_set_nominations
--     （指名は来店中に変更されるため、close の分配入力を設定・変更する独立 RPC が必要）。
-- 内部専用 3本（public, anon, authenticated, service_role の4ロール revoke・grant なし）:
--   check_round_amount（丸め・immutable）/ check_group_due（group 請求額）/ check_recalc（total 再計算）
--
-- 翻訳元（BANZEN makanai-shift）:
--  - 0040_pos_p5_table_rpc.sql … open（既存 open 再利用＝自然冪等）/ add_line（スナップショット）/
--    remove_line（入金後は不可＝論点C）/ pay / close（Σ入金≥total）＋内部専用 recalc の型。
--  - 0033_pos_p2_checkout_rpc.sql … サーバ再計算・入力検証の型。
--
-- モックとの対応（(a) 抽出・設計書 §2.4 F1b 追記済み）:
--  - 請求額 due(group) = Tp(Bx + round(Bx×service_rate%))。Tp は checks の凍結3列（決定1）。
--  - 入金は残額クリップ（過入金なし）＝超過は raise（モックは silent clip・DB は明示拒否）。
--  - tendered は cash のみ・tendered ≥ amount を検証（お預かり＜充当額は矛盾・レビュー指摘）。
--  - close は全 group 充足で伝票単位1回。分配（check_cast_backs）は最大剰余法
--    （床=整数除算・残数は整数剰余 (qty×w_i) mod Σw の降順→position 昇順＝決定2・精密仕様 §2.2.1）。
--  - rate モード分配単価は round(unit_price_snapshot × back_value%)＝back_snapshot 凍結値
--    （モックは close 時の live マスタ価格を参照するが、スナップショット原則により凍結値を採用）。
--  - pt（hon_pt_alloc）は伝票 nom_type='hon' のときのみ加算。
--  - nom_type='free' の指名は全員 weight=1 を強制（モックの「free は均等」を検証で担保）。
--
-- check_void の設計（レビュー条件3の確定）:
--  - open / closed とも void 可（open の void は「誤って開けた卓」の解放に必須＝1卓1open のため）。
--  - receivables 連動: collected/deducted 済みの売掛が存在する伝票は void 拒否（'receivable settled'）。
--    open の売掛は status='voided' へ連動更新。
--  - closed の void は check_cast_backs を削除（F2 集計への幻影バック防止・削除前の内容は audit の
--    before_json に含めて監査痕跡を残す）。payments 行は残す（返金処理は運用・金額は書き換えない）。
--  - 権限は owner/manager のみ（取消は管理判断）。他の操作系は owner/manager/staff（capability register）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) 関数10本の存在（check_open/set_nominations/add_line/remove_line/pay/close/void
--   --    ＋ round_amount/group_due/recalc）
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--    and proname like 'check\_%' escape '\' order by proname;
--   -- 2) 公開7本: anon が現れない／内部3本: 保持者が owner のみ
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname like 'check\_%' escape '\'
--   order by p.proname, r.rolname;
--   -- 3) prosrc 抜き取り（close の分配・void の連動）
--   select prosrc from pg_proc where proname in ('check_close','check_void');

begin;

-- ══════════════════════════════════════════════════════════════
-- 内部ヘルパー3本（4ロール revoke・grant なし）
-- ══════════════════════════════════════════════════════════════

-- ── 丸め（モック Tp・正の金額のみ想定）─────────────────────────
create or replace function public.check_round_amount(p_amount numeric, p_unit int, p_mode text)
returns int language sql immutable as $$
  select case
    when p_unit <= 1 then round(p_amount)::int
    when p_mode = 'up'   then (ceil(p_amount / p_unit) * p_unit)::int
    when p_mode = 'down' then (floor(p_amount / p_unit) * p_unit)::int
    else (round(p_amount / p_unit) * p_unit)::int
  end
$$;
revoke execute on function public.check_round_amount(numeric, int, text) from public, anon, authenticated, service_role;

-- ── group 請求額 due(group) = Tp(Bx + round(Bx×service%))（凍結3列を読む）──
create or replace function public.check_group_due(p_check_id uuid, p_pay_group text)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_rate int; v_unit int; v_mode text; v_bx int;
begin
  select service_rate, round_unit, round_mode into v_rate, v_unit, v_mode
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines where check_id = p_check_id and pay_group = p_pay_group;
  if v_bx = 0 then return 0; end if;
  return public.check_round_amount(v_bx + round(v_bx * v_rate / 100.0), v_unit, v_mode);
end $$;
revoke execute on function public.check_group_due(uuid, text) from public, anon, authenticated, service_role;

-- ── total 再計算 = Σ_group due(group) ─────────────────────────
create or replace function public.check_recalc(p_check_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total int := 0; v_g record;
begin
  for v_g in
    select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_total := v_total + public.check_group_due(p_check_id, v_g.pay_group);
  end loop;
  update public.checks set total = v_total where id = p_check_id;
end $$;
revoke execute on function public.check_recalc(uuid) from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- 公開 RPC 8本
-- ══════════════════════════════════════════════════════════════

-- ── check_open（自然冪等: 既存 open があればその id を返す）─────
create or replace function public.check_open(
  p_seat_id  uuid,
  p_people   int  default null,
  p_nom_type text default 'free'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text; v_settings jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  select s.id, s.org_id, s.store_id, s.is_active, st.settings_json
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_seat.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  select id into v_id from public.checks
    where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
    limit 1;
  if v_id is not null then return v_id; end if;

  -- 【決定1】店設定のスナップショット（既定 10 / 100 / down・不正値は raise）
  v_settings := coalesce(v_seat.settings_json, '{}'::jsonb);
  v_rate := coalesce(nullif(v_settings->>'service_rate','')::int, 10);
  v_unit := coalesce(nullif(v_settings->>'round_unit','')::int, 100);
  v_mode := coalesce(nullif(trim(v_settings->>'round_mode'),''), 'down');
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode, created_by)
  values (public.auth_org_id(), v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode, v_actor)
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
      limit 1;
    return v_id;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id), v_seat.store_id);
  return v_id;
end $$;
revoke execute on function public.check_open(uuid, int, text) from public, anon;
grant  execute on function public.check_open(uuid, int, text) to authenticated;

-- ── check_set_nominations（指名の設定/変更・open 中のみ）────────
-- p_nominations: [{"cast_id":"<uuid>","weight":6}, ...]（配列順が position＝タイブレーク順）
create or replace function public.check_set_nominations(
  p_check_id    uuid,
  p_nom_type    text,
  p_nominations jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 1 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;
    if p_nom_type = 'free' and v_w <> 1 then raise exception 'bad weight'; end if; -- free は均等（モック準拠）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update public.checks set nom_type = p_nom_type where id = p_check_id;

  v_after := jsonb_build_object('nom_type', p_nom_type, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $$;
revoke execute on function public.check_set_nominations(uuid, text, jsonb) from public, anon;
grant  execute on function public.check_set_nominations(uuid, text, jsonb) to authenticated;

-- ── check_add_line（商品行＝スナップショット／charge・custom 行＝名称・単価指定）──
create or replace function public.check_add_line(
  p_check_id   uuid,
  p_product_id uuid default null,
  p_qty        int  default 1,
  p_kind       text default null,   -- 商品行は無視（product.type を採用）・非商品行は set/time/charge/custom
  p_pay_group  text default 'A',
  p_name       text default null,   -- 非商品行のみ
  p_unit_price int  default null    -- 非商品行のみ
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> public.auth_org_id()
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt);
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
end $$;
revoke execute on function public.check_add_line(uuid, uuid, int, text, text, text, int) from public, anon;
grant  execute on function public.check_add_line(uuid, uuid, int, text, text, text, int) to authenticated;

-- ── check_remove_line（open かつ入金 0 件のみ・入金後の訂正は void 運用＝論点C）──
create or replace function public.check_remove_line(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_line record; v_chk record; v_paycnt int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  delete from public.check_lines where id = p_line_id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_remove_line', 'check_lines:' || p_line_id::text,
    to_jsonb(v_line), null, v_chk.store_id);
end $$;
revoke execute on function public.check_remove_line(uuid) from public, anon;
grant  execute on function public.check_remove_line(uuid) to authenticated;

-- ── check_pay（部分入金・group 充当・残額クリップ・冪等キー）────
create or replace function public.check_pay(
  p_check_id  uuid,
  p_method    text,
  p_amount    int,
  p_pay_group text default 'A',
  p_tendered  int  default null,
  p_idem_key  uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount, p_tendered, p_idem_key, v_actor)
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id), v_chk.store_id);

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.check_pay(uuid, text, int, text, int, uuid) from public, anon;
grant  execute on function public.check_pay(uuid, text, int, text, int, uuid) to authenticated;

-- ── check_close（全 group 充足で伝票単位1回・分配確定・冪等キー）──
create or replace function public.check_close(
  p_check_id uuid,
  p_idem_key uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_chk.store_id = public.auth_store_id())) then
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
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $$;
revoke execute on function public.check_close(uuid, uuid) from public, anon;
grant  execute on function public.check_close(uuid, uuid) to authenticated;

-- ── check_void（owner/manager のみ・open/closed→void・売掛連動）──
create or replace function public.check_void(
  p_check_id uuid,
  p_reason   text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
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

  -- 回収済み売掛があれば void 拒否（宙吊り防止＝レビュー条件3）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and status in ('collected','deducted');
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $$;
revoke execute on function public.check_void(uuid, text) from public, anon;
grant  execute on function public.check_void(uuid, text) to authenticated;

commit;
