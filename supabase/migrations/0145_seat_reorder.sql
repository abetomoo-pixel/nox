-- 0145_seat_reorder.sql
-- 裁定255 席の並べ替えを原子化（R16）
-- 起草: 相談役 2026-09-14。live dump（docs/tmp/seat_dump.txt・pg_get_functiondef 逐語）の
--       cast_rank_reorder を契約の型として写経し、org 照合とロール判定は set_seat／product_category_reorder
--       と同型の 1 式に揃えた。件数の両方向検証と updated_at の更新は cast_rank_reorder に合わせる。
--
-- 目的:
--   席の並べ替えが client の set_seat 2 回呼び（sort_order の交換）で非原子だったため、
--   1 トランザクションで全件 1..N に再採番する RPC を置く（裁定255）。
--
-- 契約（既存 reorder 4 本と同一）:
--   forbidden（org null／role null／店の org 不一致／ロール不足／配列の id が店内に無い）
--   billing locked／bad ids（空・null）／duplicate ids（配列内の重複）／partial ids（店の全件が配列に無い）
--   update … from unnest(p_ids) with ordinality で sort_order = 1..N・updated_at = now()
--   before・after の (id, sort_order) 一覧を audit_log_write に残す（PII なし）
--
-- 非改修（宣言）:
--   - set_seat は触らない（個別の追加・更新の口は残す）。
--   - seats の列・CHECK・index・RLS・grant は不変（client から seats を直接 update する経路は作らない）。
--   - 既存 reorder 4 本・money-core は触らない。
--
-- 忘れると赤になるもの（教訓21）:
--   - verify:nox-billing 段47-1 は live の pg_proc 全数＝正本 A∪B を機械 assert するため、
--     seat_reorder を正本に登録しないと赤になる。A6（マスタ系・product_category_reorder と同節）へ登録し、
--     対象 124→125・全数 238→239。suite 側の pin も同数を更新する。
--   - verify:nox-anon-guard の probe に ["seat_reorder", { p_store_id: null, p_ids: null }] を 1 行追加。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 1) 関数の存在と署名
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where pronamespace='public'::regnamespace and proname='seat_reorder';   -- 1 行 (uuid, uuid[])
--   -- 2) proacl（anon が無いこと）
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace and proname='seat_reorder';
--   -- 3) 既存 reorder 4 本と set_seat の prosrc md5 が本 mig 前後で不変（貼付前に控える）
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('cast_rank_reorder','pricing_rule_reorder','product_category_reorder','product_reorder','set_seat')
--     order by proname;   -- 5 行
--   -- 4) money-core 非改修（前後一致）
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('check_pay','check_close','check_void') order by proname;
--   -- 5) seats の列・制約・index・grant・policy が不変
--   select count(*) from information_schema.columns where table_schema='public' and table_name='seats';   -- 9
--   select count(*) from pg_constraint where conrelid='public.seats'::regclass;                            -- 4
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name='seats' order by grantee, privilege_type;
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid='public.seats'::regclass;
--   -- 6) ゲート済み本数（'billing locked' を含む関数）が 124→125
--   select count(*) from pg_proc where pronamespace='public'::regnamespace
--     and pg_get_functiondef(oid) like '%billing locked%';
--   -- 7) 動作（JWT 要＝verify:nox-seat-reorder で実施）:
--   --    owner で全件の並べ替え／manager は自店のみ／cast は forbidden／空・重複・部分配列・他店 id の各拒否／
--   --    1..N 再採番と updated_at 更新／audit_logs に before/after が残ること。

begin;

-- ══════════════════════════════════════════════════════════════
-- seat_reorder（全件 1..N 再採番・owner 全店／manager 自店）
-- ══════════════════════════════════════════════════════════════
create or replace function public.seat_reorder(p_store_id uuid, p_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner  uuid;
  v_n      int;
  v_in     int;
  v_all    int;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;

  v_n := coalesce(array_length(p_ids, 1), 0);
  if v_n = 0 then raise exception 'bad ids'; end if;

  -- 配列内の重複を拒否（同一 id が2回来ると ordinality が非決定になる）
  if v_n <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'duplicate ids';
  end if;

  -- store の org 照合＋ロール判定（set_seat と同型・クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 件数一致を両方向で検証
  --   ①配列の全 id が同 org/store に実在すること
  select count(*) into v_in
    from public.seats s
   where s.id = any(p_ids)
     and s.store_id = p_store_id
     and s.org_id = public.auth_org_id();
  if v_in <> v_n then raise exception 'forbidden'; end if;

  --   ②同 org/store の全行が配列に含まれること（欠けを拒否・無効席も対象）
  select count(*) into v_all
    from public.seats s
   where s.store_id = p_store_id
     and s.org_id = public.auth_org_id();
  if v_all <> v_n then raise exception 'partial ids'; end if;

  -- 監査: 並び替え前後の (id, sort_order) 一覧を記録（PII なし）
  select jsonb_agg(jsonb_build_object('id', s.id, 'sort_order', s.sort_order)
                   order by s.sort_order, s.id)
    into v_before
    from public.seats s
   where s.store_id = p_store_id and s.org_id = public.auth_org_id();

  update public.seats s
     set sort_order = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where s.id = u.id
     and s.store_id = p_store_id
     and s.org_id = public.auth_org_id();

  select jsonb_agg(jsonb_build_object('id', s.id, 'sort_order', s.sort_order)
                   order by s.sort_order, s.id)
    into v_after
    from public.seats s
   where s.store_id = p_store_id and s.org_id = public.auth_org_id();

  perform public.audit_log_write(
    p_action   => 'seat_reorder',
    p_target   => 'seats:store:' || p_store_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $function$;

revoke execute on function public.seat_reorder(uuid, uuid[]) from public, anon;
grant  execute on function public.seat_reorder(uuid, uuid[]) to authenticated, service_role;

commit;
