-- 0022_f3a1_perm_base: F3a 束1 — 権限基盤（staff 機能別フラグ）
--   ① memberships に can_register/can_crm/can_shift 追加（default false・fail-closed）
--   ② backfill（既存 staff の can_register を true・現行会計可視を保存）
--   ③ ヘルパー3本新設（auth_staff_can_register/can_crm/can_shift・既存4本同型）
--   ④ 会計側 RLS 改修（checks系5表＋check_cast_backs＋bottle_keeps＝7表・staff 枝に can_register）
--   ⑤ 会計6RPC ゲート改修（open/set_nominations/add_line/remove_line/pay/close・staff に can_register）
--
-- 翻訳元・裁定参照:
--  - NOX_F3_束1_権限基盤_実装仕様.md（相談役ロック・Agoora 承認・2026-07-09）。
--  - 認可正本 NOX_認可設計_RLS.md §1.5 追加（案A の YAGNI 但し書き発動＝Agoora 顕在化認定・
--    role 固定の第1層は維持・staff のみ機能別フラグの第1.5層）。正本 md 追記は verify 後（手順 §9-6）。
--  - live 現物確認（2026-07-09・pg_get_functiondef / pg_policies）: パターン2の6表
--    （checks/check_lines/check_nominations/payments/receivables/bottle_keeps）は qual 一字一致・
--    bottle_keeps はパターン2と確定（仕様 §4-C の分岐解決）。check_cast_backs のみパターン1。
--
-- 実装ノート:
--  【1】backfill 必須: default false のまま④⑤を当てると既存 staff の会計が瞬間 0 行化。
--       can_register のみ true・can_crm/can_shift は opt-in で false 据置。
--  【2】check_cast_backs はパターン1（cast 自己行可視・/mine の報酬表示の土台）。cast 枝
--       `cast_id = auth_cast_id()` は一字不変で保持。
--  【3】check_void は不変（manager+・staff 無関係・1バイトも触らない）。
--  【4】会計6RPC は live pg_get_functiondef を正本にゲート述語のみ差し替え・他ロジックは一字不変
--       （mig ファイルのコピーで書かない）。check_open のみゲート変数が v_seat（他5本は v_chk）。
--       仕様書 §5 の「check_set_nom」の実名は check_set_nominations。
--  【5】can_crm/can_shift は器の先置き（本 mig で効くのは can_register のみ・適用は束2/束3）。
--  【6】ヘルパーの null 戻り（無所属=0行）は fail-closed: RLS USING の null は行除外・
--       RPC は冒頭 auth_org_id() null guard が先に発火。coalesce は行がある場合の保険。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- ①② 列と backfill（staff 行は can_register=true / can_crm=false / can_shift=false）
--   select role, can_register, can_crm, can_shift from public.memberships order by role;
--   -- ③ ヘルパー3本の存在
--   select proname from pg_proc where proname like 'auth_staff_can_%' order by proname;  -- 3行
--   -- ③ anon 遮断（anon が現れないこと）
--   select p.proname, r.rolname from pg_proc p
--     join aclexplode(p.proacl) a on true join pg_roles r on r.oid = a.grantee
--    where p.proname like 'auth_staff_can_%' order by p.proname, r.rolname;
--   -- ④ 7表の policy に can_register 述語が入っている
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and qual like '%auth_staff_can_register%' order by tablename;  -- 7行
--   -- ⑤ 6RPC の prosrc に can_register が入っている
--   select proname from pg_proc where proname like 'check\_%' escape '\'
--     and prosrc like '%auth_staff_can_register%' order by proname;  -- 6行（void は含まれない）
--   -- 回帰は verify:f0（816+）で確認

begin;

-- ══════════════════════════════════════════════════════════════
-- ① memberships 列追加（staff 機能別フラグ・default false＝fail-closed）
--    3列とも staff にのみ意味を持つ（owner/manager/cast はヘルパーを呼ぶ枝に入らず参照されない）。
-- ══════════════════════════════════════════════════════════════
alter table public.memberships
  add column if not exists can_register boolean not null default false,  -- 会計権限（黒服）
  add column if not exists can_crm      boolean not null default false,  -- 顧客CRM権限（黒服・適用は束2）
  add column if not exists can_shift    boolean not null default false;  -- シフト管理権限（黒服・適用は束3）

-- ══════════════════════════════════════════════════════════════
-- ② backfill（既存 staff の会計権限を現行動作＝一律可視で保存）
--    これを怠ると本 mig 適用の瞬間に既存黒服の会計が全て 0 行化する。
--    can_crm / can_shift は新機能につき opt-in＝false 据置。
-- ══════════════════════════════════════════════════════════════
update public.memberships
   set can_register = true
 where role = 'staff';

-- ══════════════════════════════════════════════════════════════
-- ③ ヘルパー3本新設（既存4本と同型・SECURITY DEFINER＝memberships 直読みの無限再帰回避）
--    無所属/無効は 0 行→null 戻り＝fail-closed（実装ノート【6】）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.auth_staff_can_register()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(m.can_register, false)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;

create or replace function public.auth_staff_can_crm()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(m.can_crm, false)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;

create or replace function public.auth_staff_can_shift()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(m.can_shift, false)
  from public.memberships m
  join public.users u on u.id = m.user_id
  where u.auth_user_id = auth.uid() and u.is_active and m.is_active
$$;

-- 二重防御: revoke は public と anon の両方（0025 教訓・既存4本と同じ）
revoke execute on function public.auth_staff_can_register() from public, anon;
grant  execute on function public.auth_staff_can_register() to authenticated;
revoke execute on function public.auth_staff_can_crm()      from public, anon;
grant  execute on function public.auth_staff_can_crm()      to authenticated;
revoke execute on function public.auth_staff_can_shift()    from public, anon;
grant  execute on function public.auth_staff_can_shift()    to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ 会計側 RLS 改修（staff 枝に can_register・owner/manager 固定・cast 不変）
--    パターン2の6表: 旧第3連結 auth_role() <> 'cast' を明示 role 列挙に置換
--    （owner/manager 無条件・staff は can_register 必須・cast は全枝不成立＝0行で従来同）。
--    パターン1の check_cast_backs: cast 枝を一字不変で保持（実装ノート【2】）。
-- ══════════════════════════════════════════════════════════════

-- ── checks（パターン2）──────────────────────────────────────
drop policy if exists checks_select on public.checks;
create policy checks_select on public.checks
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
    )
  );

-- ── check_lines（パターン2）─────────────────────────────────
drop policy if exists check_lines_select on public.check_lines;
create policy check_lines_select on public.check_lines
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
    )
  );

-- ── check_nominations（パターン2）───────────────────────────
drop policy if exists check_nominations_select on public.check_nominations;
create policy check_nominations_select on public.check_nominations
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
    )
  );

-- ── payments（パターン2）────────────────────────────────────
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
    )
  );

-- ── receivables（パターン2）─────────────────────────────────
drop policy if exists receivables_select on public.receivables;
create policy receivables_select on public.receivables
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
    )
  );

-- ── bottle_keeps（パターン2・live 確認済＝仕様 §4-C の分岐は 4-A 形）──
drop policy if exists bottle_keeps_select on public.bottle_keeps;
create policy bottle_keeps_select on public.bottle_keeps
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
    )
  );

-- ── check_cast_backs（パターン1・cast 枝一字不変＝/mine 保護）──
drop policy if exists check_cast_backs_select on public.check_cast_backs;
create policy check_cast_backs_select on public.check_cast_backs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (
      public.auth_role() in ('owner','manager')
      or (public.auth_role() = 'staff' and public.auth_staff_can_register())
      or (public.auth_role() = 'cast'  and cast_id = public.auth_cast_id())
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ⑤ 会計6RPC ゲート改修（live pg_get_functiondef 正本・ゲート述語のみ差し替え・他は一字不変）
--    旧: owner or (('manager','staff') and 自店)
--    新: owner or (manager and 自店) or (staff and 自店 and auth_staff_can_register())
--    check_void は不変（manager+・本 mig に含めない）。
-- ══════════════════════════════════════════════════════════════

-- ── check_open（ゲート変数は v_seat・他5本と異なる点に注意）────
CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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
end $function$;

revoke execute on function public.check_open(uuid, int, text) from public, anon;
grant  execute on function public.check_open(uuid, int, text) to authenticated;

-- ── check_set_nominations ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nom_type text, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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
end $function$;

revoke execute on function public.check_set_nominations(uuid, text, jsonb) from public, anon;
grant  execute on function public.check_set_nominations(uuid, text, jsonb) to authenticated;

-- ── check_add_line ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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
end $function$;

revoke execute on function public.check_add_line(uuid, uuid, int, text, text, text, int) from public, anon;
grant  execute on function public.check_add_line(uuid, uuid, int, text, text, text, int) to authenticated;

-- ── check_remove_line ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_remove_line(p_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_paycnt int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  delete from public.check_lines where id = p_line_id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_remove_line', 'check_lines:' || p_line_id::text,
    to_jsonb(v_line), null, v_chk.store_id);
end $function$;

revoke execute on function public.check_remove_line(uuid) from public, anon;
grant  execute on function public.check_remove_line(uuid) to authenticated;

-- ── check_pay ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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
end $function$;

revoke execute on function public.check_pay(uuid, text, int, text, int, uuid) from public, anon;
grant  execute on function public.check_pay(uuid, text, int, text, int, uuid) to authenticated;

-- ── check_close ─────────────────────────────────────────────
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
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
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
end $function$;

revoke execute on function public.check_close(uuid, uuid) from public, anon;
grant  execute on function public.check_close(uuid, uuid) to authenticated;

commit;
