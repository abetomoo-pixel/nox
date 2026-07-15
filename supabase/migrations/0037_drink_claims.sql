-- 0037_drink_claims: F3f — ドリンク自己申告（drink_claims・P1 cast セルフ書込）
-- ★★ 非idempotent（create table + grant を含む）・再適用厳禁 ★★
--
-- 設計ロック（F3f 調査 → 相談役確定）:
--  - 申告は check 紐付け（対象伝票を指定＝nom_type と場所の参照のみ・会計連動なし）。cast が product×杯数を自己申告。
--  - ★会計中核（check_close/check_cast_backs）は不変。申告ドリンクは伝票会計ドリンク（close 指名按分）とは別枠＝
--    check_lines にも check_cast_backs にも載せない（二重計上なし・対象が違う）。drink_claims 独立でバック額を持つ。
--  - payroll 合流は collect.ts が承認済 drink_claims を check_cast_backs と並置集計（collect.ts 変更は UI 実装フェーズ・mig 外）。
--  - ★承認時にバック額を焼付け（承認時点の products.back_value + 対象 check の nom_type で計算＝以後の商品バック率変更に不変）。
--    焼付け規則は check_close の按分ループの unit 計算と同一（unit4=unit4_json[nom_type] / rate=round(price*back_value/100)）を1杯単位に。
--  - RLS=P1 変形（cast 自己 + can_register 黒服/manager/owner 自店可視＝承認のため・check_cast_backs の RLS と同型）。
--  - 申告=cast セルフ書込 RPC（auth_cast_id 本人チェック・attendance_set_self の手本）。承認=黒服 can_register 以上の代理型。
--  - grant=mig0032 教訓4（authenticated=SELECT のみ・書込は RPC 経由）。
--
-- 適用後の検証（"Success" だけ信用しない・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) テーブル+制約+RLS+grant を1結果セットで:
--      select
--        (select string_agg(conname,' | ' order by conname) from pg_constraint where conrelid='public.drink_claims'::regclass) as constraints,
--        (select string_agg(polname||':'||polcmd::text,' | ') from pg_policy where polrelid='public.drink_claims'::regclass) as policies,
--        (select string_agg(grantee||'='||privilege_type,', ') from information_schema.role_table_grants where table_name='drink_claims') as tbl_grants,
--        (select relrowsecurity from pg_class where oid='public.drink_claims'::regclass) as rls_enabled;
--   2) RPC2本の prosrc+ACL:
--      select p.proname, coalesce(array_to_string(p.proacl,','),'default') as acl
--        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname in ('drink_claim_submit','drink_claim_decide') order by 1;
--      select pg_get_functiondef('drink_claim_submit(uuid, uuid, integer)'::regprocedure);
--      select pg_get_functiondef('drink_claim_decide(uuid, boolean, integer)'::regprocedure);
--   3) notify pgrst, 'reload schema';
--   4) 動作アンカー（cast 申告=pending・非 cast は no cast for caller・黒服承認で back_amount 焼付け=check_close 同値・
--      杯数修正・却下・not open・bad product・認可・cast 自己行のみ可視・anon BLOCKED・直書込遮断）は verify 段29 で実測。

begin;

-- ── テーブル: drink_claims（P1・cast セルフ書込・独立バック枠）──
create table public.drink_claims (
  id           uuid        not null default gen_random_uuid(),
  org_id       uuid        not null references public.orgs(id),
  store_id     uuid        not null references public.stores(id),
  check_id     uuid        not null references public.checks(id),    -- 紐付け伝票（nom_type/場所の参照・会計連動なし）
  cast_id      uuid        not null references public.casts(id),     -- 申告者
  product_id   uuid        not null references public.products(id),  -- drink/champ
  qty          integer     not null,
  back_amount  integer     not null default 0,                       -- 承認時焼付け（pending 中は0）
  status       text        not null default 'pending',
  requested_by uuid        not null references public.users(id),     -- cast の users.id
  decided_by   uuid        references public.users(id),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  constraint drink_claims_pkey primary key (id),
  constraint drink_claims_qty_check check (qty > 0),
  constraint drink_claims_back_amount_check check (back_amount >= 0),
  constraint drink_claims_status_check check (status in ('pending','approved','rejected'))
);

create index drink_claims_cast_idx  on public.drink_claims (cast_id, created_at);  -- 自己参照/payroll 集計軸（check_cast_backs_cast_idx 同型）
create index drink_claims_check_idx on public.drink_claims (check_id);

alter table public.drink_claims enable row level security;

-- SELECT（P1 変形・check_cast_backs の RLS と同型＝cast 自己 + can_register 黒服/manager/owner 自店）
create policy drink_claims_select on public.drink_claims
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() in ('owner','manager')
         or (public.auth_role() = 'staff' and public.auth_staff_can_register())
         or (public.auth_role() = 'cast' and cast_id = public.auth_cast_id()))
  );

-- grant（教訓4: authenticated は SELECT のみ・書込は RPC 経由）
revoke all on table public.drink_claims from public, anon;
grant select on table public.drink_claims to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.drink_claims from authenticated;

-- ── RPC1: drink_claim_submit（cast セルフ申告＝pending・attendance_set_self の手本）──
create or replace function public.drink_claim_submit(
  p_check_id uuid, p_product_id uuid, p_qty integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast uuid; v_crow record; v_chk record; v_prod record; v_actor uuid; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;   -- cast セルフ専用
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  select org_id, store_id into v_crow from public.casts where id = v_cast;
  -- 対象 check（自店・open・cast は指名有無問わず申告可）
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() or v_chk.store_id <> v_crow.store_id then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 対象 product（自 org・自店・drink/champ）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> public.auth_org_id() or v_prod.store_id <> v_crow.store_id
     or v_prod.type not in ('drink','champ') then
    raise exception 'bad product';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.drink_claims (org_id, store_id, check_id, cast_id, product_id, qty, back_amount, status, requested_by)
  values (v_crow.org_id, v_crow.store_id, p_check_id, v_cast, p_product_id, p_qty, 0, 'pending', v_actor)
  returning id into v_id;
  perform public.audit_log_write('drink_claim_submit', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_crow.store_id);
  return v_id;
end $$;
revoke execute on function public.drink_claim_submit(uuid, uuid, integer) from public, anon;
grant  execute on function public.drink_claim_submit(uuid, uuid, integer) to authenticated;

-- ── RPC2: drink_claim_decide（黒服 can_register 以上・承認/却下・杯数修正統合・バック焼付け）──
create or replace function public.drink_claim_decide(
  p_claim_id uuid, p_approve boolean, p_qty_override integer default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cl record; v_actor uuid; v_before jsonb; v_qty int; v_nom text; v_prod record; v_unit int; v_back int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- 承認は黒服 can_register 以上・自店（代理型＝auth_cast_id チェックなし）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'pending' then raise exception 'already decided'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- 杯数修正（承認時訂正・null は申告 qty のまま）
    if p_qty_override is not null then
      if p_qty_override <= 0 then raise exception 'bad qty'; end if;
      v_qty := p_qty_override;
    else
      v_qty := v_cl.qty;
    end if;
    -- ★バック額焼付け（check_close の unit 計算と同一規則・products を承認時点で直読み）
    select nom_type into v_nom from public.checks where id = v_cl.check_id;
    select * into v_prod from public.products where id = v_cl.product_id;
    if v_prod.back_mode = 'unit4' then
      v_unit := coalesce((v_prod.unit4_json ->> v_nom)::int, 0);                             -- unit4[nom_type]（check_close 同一）
    else
      v_unit := round(v_prod.price * coalesce(v_prod.back_value, 0)::numeric / 100.0)::int;  -- rate（check_close 同一）
    end if;
    v_back := v_unit * v_qty;
    update public.drink_claims
       set status = 'approved', qty = v_qty, back_amount = v_back, decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_approve', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  else
    update public.drink_claims
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_reject', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  end if;
end $$;
revoke execute on function public.drink_claim_decide(uuid, boolean, integer) from public, anon;
grant  execute on function public.drink_claim_decide(uuid, boolean, integer) to authenticated;

commit;
