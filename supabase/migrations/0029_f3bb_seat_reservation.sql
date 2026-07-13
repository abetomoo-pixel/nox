-- 0029_f3bb_seat_reservation: F3b-B — 席予約（reservations 拡張＋EXCLUDE 排他＋予約 RPC 3本改修）
--
-- 設計ロック（2026-07-10 確定）:
--  1. 既存 reservations 拡張＝seat_id uuid null ＋ stay tstzrange null。seat_id null=従来の
--     「卓を押さえない予約」がそのまま共存（移行なし・段19 資産維持）。
--  2. ダブルブッキング防止＝EXCLUDE 制約＋RPC 事前検証の二段。
--     exclude using gist (seat_id with =, stay with &&) where (seat_id is not null and status='booked')
--     ・cancelled/no_show/visited は WHERE で自然除外（visited 後の卓占有は checks open 軸が守る）
--     ・RPC は 'seat time conflict' の親切エラー・制約が最終防衛（二重防御）。
--     ・【10】invalid store（seat.store_id=予約.store_id）を create/update にも拡張適用。
--  3. 時間粒度＝開始時刻＋滞在時間の固定 select（60/90/120/180 分・既定は UI 側 120）。
--     stay = [reserved_at, reserved_at + p_stay_minutes)。bands（営業時間）は NOX に無い＝突合スコープ外。
--  4. to_check の p_seat_id＝null なら予約卓を既定・明示指定で上書き（別卓に通す＝実来店が勝つ）。
--     卓なし予約は従来どおり実質必須（両 null は 'no seat'）。
--  5. reservation_update に seat_id/stay 変更を含める（全フィールド明示送信の規約・null=卓なし予約化）。
--
-- 確認(A)（起案時に潰す・裁定どおり明示）: 予約卓に飛び込み客の open 伝票が既にある場合、
--   to_check は既存の発見1 事前検証がそのまま「解決後の卓（v_seat）」に対して効き 'seat occupied' で拒否
--   → UI は p_seat_id 明示で別卓を指定して再実行（論点4）。audit は before=予約全行（予約卓を含む）＋
--   after に実卓（v_seat）＝予約卓≠実卓が両方残る。
-- 確認(B)（実地確認済み・2026-07-10 dev で begin→rollback 検証）: extensions schema の btree_gist で
--   EXCLUDE 制約は schema 修飾なしで作成・発火する（DDL OK・重複=SQLSTATE 23P01・隣接枠 [18,20)+[20,22)
--   非重複で通過・cancelled は WHERE 除外で通過を実測。演算子クラスの schema 修飾は不要）。
--
-- 実装ノート:
--  ・stay の整合 CHECK＝(seat_id is null)=(stay is null)・lower(stay)=reserved_at・upper>lower。
--    reserved_at と stay のドリフトを DB 面でも封じる（書込は RPC のみ＝毎回両方を再構築）。
--  ・滞在時間の 4値ホワイトリスト（60/90/120/180）は RPC 検証＝裁定3 の固定 select を DB 側に写像。
--    選択肢追加は RPC 改修（mig）になる＝意図的な固さ（CC 判断・相談役レビュー対象）。
--  ・create/update は引数追加＝シグネチャが変わるため drop→create（check_open mig0023 前例・
--    overload 残置を作らない）。to_check は同シグネチャ（default 追加+本文）＝or replace。
--  ・追加引数はともに default null＝既存 UI（8引数/7引数呼び）は無改修で従来動作（卓なし予約）。
--    ★update の null=卓クリア罠（顧客詳細 birthday 同型）: 席予約は本 mig 以降の新 UI でしか作れず、
--    旧 UI が席予約行を update する経路は UI スライス到達前に存在しない＝空白期間の実害なし。
--    新 UI は規約どおり seat_id/stay も常に明示送信。
--  ・予約作成/変更時の seat は is_active 必須（'bad seat'）・店不一致/他 org は 'invalid store'。
--    to_check の解決後卓の検証は既存どおり（store 一致のみ＝退店ならぬ廃卓でも check_open 側が守る）。
--  ・事前検証の重複判定は org 自衛条件つき（原則8）・update は自分自身を除外（r.id <> 対象）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   -- 0) 貼り先証明（nox プロジェクトであること・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) btree_gist インストール確認（extensions schema・installed_version が入る）
--   select extname, extnamespace::regnamespace, extversion from pg_extension where extname = 'btree_gist';
--   -- 2) reservations 追加列（seat_id/stay の2行）
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='reservations' and column_name in ('seat_id','stay');
--   -- 3) 制約実測（EXCLUDE 1本＝contype 'x'・CHECK 2本追加）
--   select conname, contype, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.reservations'::regclass
--      and (conname like '%stay%' or contype = 'x');
--   -- 4) 関数3本の定義実測（seat time conflict / no seat / coalesce(p_seat_id, v_res.seat_id) が入っていること）
--   select proname, pg_get_functiondef(p.oid) from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('reservation_create','reservation_update','reservation_to_check')
--    order by proname;
--   -- 5) overload 残りなし（3行・各1）
--   select proname, count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('reservation_create','reservation_update','reservation_to_check')
--    group by proname order by proname;
--   -- 6) ACL（3本とも authenticated のみ・anon/public 不在）
--   select p.proname, r.rolname from pg_proc p
--    join aclexplode(p.proacl) a on true
--    join pg_roles r on r.oid = a.grantee
--    where p.proname in ('reservation_create','reservation_update','reservation_to_check')
--    order by p.proname, r.rolname;
--   -- 7) PostgREST スキーマキャッシュ更新
--   notify pgrst, 'reload schema';
--   -- 8) 動作アンカー（JWT が要るため SQL Editor では不可）: verify:nox-anon-guard 段21 で実測。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① btree_gist（EXCLUDE の uuid = 演算子クラス用・Supabase 慣例＝extensions schema）
-- ══════════════════════════════════════════════════════════════
create extension if not exists btree_gist with schema extensions;

-- ══════════════════════════════════════════════════════════════
-- ② reservations 拡張列＋整合 CHECK＋EXCLUDE 排他
-- ══════════════════════════════════════════════════════════════
alter table public.reservations
  add column seat_id uuid null references public.seats(id),
  add column stay    tstzrange null;

alter table public.reservations
  add constraint reservations_seat_stay_chk
    check ((seat_id is null) = (stay is null)),
  add constraint reservations_stay_range_chk
    check (stay is null or (lower(stay) = reserved_at and upper(stay) > lower(stay)));

-- ダブルブッキング防止の最終防衛（確認(B) 実地確認済み・cancelled/no_show/visited は WHERE 除外）
alter table public.reservations
  add constraint reservations_seat_stay_excl
    exclude using gist (seat_id with =, stay with &&)
    where (seat_id is not null and status = 'booked');

-- ══════════════════════════════════════════════════════════════
-- ③ reservation_create（drop→create・p_seat_id/p_stay_minutes 追加＝default 後置）
-- ══════════════════════════════════════════════════════════════
drop function if exists public.reservation_create(uuid, timestamptz, uuid, uuid, text, integer, text, text);

create or replace function public.reservation_create(
  p_store_id     uuid,
  p_reserved_at  timestamptz,
  p_customer_id  uuid default null,
  p_cast_id      uuid default null,
  p_guest_name   text default null,
  p_party_size   integer default null,
  p_nom_type     text default null,
  p_memo         text default null,
  p_seat_id      uuid default null,
  p_stay_minutes integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_store_org   uuid;
  v_guest       text;
  v_actor       uuid;
  v_id          uuid;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 入力検証
  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');  -- 【12】空は null 正規化

  -- store の org 照合（越境封じ・他 org は invalid store）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'invalid store'; end if;

  -- 権限差（論点1 lock: 予約の作成=can_crm・顧客機能）
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  -- customer 検証（同 org・同店＝check_open の invalid customer 同型）
  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- cast 検証（同 org・同店・is_active＝check_set_nominations の bad cast 同型）
  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  -- ── F3b-B 席予約: seat_id と stay は同時（卓なし予約=両 null が共存）──
  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;  -- 固定 select の写像（裁定3）
    -- 【10】席の店＝予約の店（to_check で確立した検証を作成時にも・他 org/不在も invalid store）
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> p_store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    -- 事前検証（親切エラー・最終防衛は EXCLUDE 制約＝二重防御・org 自衛=原則8）
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  -- customer_id と guest_name の両 null は許容（lock: 名前なし予約＝後で編集で埋められる）

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.reservations
    (org_id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type,
     status, memo, created_by, seat_id, stay)
  values
    (v_org, p_store_id, p_customer_id, p_cast_id, v_guest, p_reserved_at, p_party_size, p_nom_type,
     'booked', p_memo, v_actor, p_seat_id, v_stay)
  returning id into v_id;

  perform public.audit_log_write('reservation_create', 'reservations:' || v_id::text,
    null, (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $$;

revoke execute on function public.reservation_create(uuid, timestamptz, uuid, uuid, text, integer, text, text, uuid, integer) from public, anon;
grant  execute on function public.reservation_create(uuid, timestamptz, uuid, uuid, text, integer, text, text, uuid, integer) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ reservation_update（drop→create・seat_id/stay 変更を包含＝裁定5）
-- ══════════════════════════════════════════════════════════════
drop function if exists public.reservation_update(uuid, timestamptz, uuid, uuid, text, integer, text, text);

create or replace function public.reservation_update(
  p_reservation_id uuid,
  p_reserved_at    timestamptz,
  p_customer_id    uuid,
  p_cast_id        uuid,
  p_guest_name     text,
  p_party_size     integer,
  p_nom_type       text,
  p_memo           text,
  p_seat_id        uuid default null,
  p_stay_minutes   integer default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_res         public.reservations;
  v_guest       text;
  v_before      jsonb;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 入力検証（create と同基準）
  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  -- 対象予約（org 照合＝reservations は org_id 列を持つので直接照合・他 org/不在は not found）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限差（create と同型・店は予約の store_id）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_res.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_res.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  -- booked のみ変更可（visited は伝票側の責務・cancelled/no_show は確定状態）
  if v_res.status <> 'booked' then raise exception 'not editable'; end if;

  -- customer/cast の再検証（店は予約の store_id・変更で越境させない）
  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = v_res.store_id
  ) then
    raise exception 'invalid customer';
  end if;
  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = v_res.store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  -- ── F3b-B 席予約: create と同基準＋自分自身を重複判定から除外。
  --    p_seat_id null=卓なし予約化（クリア）＝全フィールド明示送信の一環（UI は常に現在値/新値を送る）──
  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    -- 【10】席の店＝予約の店（update でも越境させない）
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    -- 事前検証（自分自身は除外・別枠移動の衝突も EXCLUDE が最終防衛）
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.id <> p_reservation_id
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  v_before := to_jsonb(v_res);
  update public.reservations
     set reserved_at = p_reserved_at,
         customer_id = p_customer_id,
         cast_id     = p_cast_id,
         guest_name  = v_guest,
         party_size  = p_party_size,
         nom_type    = p_nom_type,
         memo        = p_memo,
         seat_id     = p_seat_id,
         stay        = v_stay,
         updated_at  = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_update', 'reservations:' || p_reservation_id::text,
    v_before, (select to_jsonb(r) from public.reservations r where r.id = p_reservation_id),
    v_res.store_id);
end $$;

revoke execute on function public.reservation_update(uuid, timestamptz, uuid, uuid, text, integer, text, text, uuid, integer) from public, anon;
grant  execute on function public.reservation_update(uuid, timestamptz, uuid, uuid, text, integer, text, text, uuid, integer) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑤ reservation_to_check（同シグネチャ＝or replace・p_seat_id default null 化＋予約卓の既定解決）
-- ══════════════════════════════════════════════════════════════
create or replace function public.reservation_to_check(
  p_reservation_id uuid,
  p_seat_id        uuid default null,   -- F3b-B: null=予約卓を既定・明示=上書き（別卓に通す＝実来店が勝つ）
  p_nom_type       text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org        uuid := public.auth_org_id();
  v_role       text := public.auth_role();
  v_res        public.reservations;
  v_seat       uuid;
  v_seat_store uuid;
  v_nom_type   text;
  v_check_id   uuid;
  v_cast_ok    boolean := false;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 対象予約（org 照合・reservations は org_id 列あり）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- status=booked のみ来店処理可（visited 再処理・cancelled/no_show は不可）
  if v_res.status <> 'booked' then raise exception 'not bookable'; end if;

  -- F3b-B: 卓の解決＝引数 > 予約卓（席予約）。卓なし予約は従来どおり引数必須（両 null は no seat）
  v_seat := coalesce(p_seat_id, v_res.seat_id);
  if v_seat is null then raise exception 'no seat'; end if;

  -- ★【10】卓の店＝予約の店（owner の org 全店権限で他店卓に開く誤接続を封じる。
  --   customer あり予約は内側 check_open の invalid customer でも止まるが、guest_name のみの
  --   フリー予約には関所が無いためここで一致を要求）
  select store_id into v_seat_store from public.seats where id = v_seat;
  if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;

  -- ★【5】発見1対策: 解決後の卓に既存 open があれば拒否（使用中の卓に予約客を着けない＝
  --   check_open の「既存 open 再利用」で他人の伝票が返る誤接続の封鎖）。
  --   確認(A): 予約卓が飛び込み客で埋まっている場合もここで 'seat occupied'
  --   → UI は p_seat_id を明示して別卓に通す（実来店が勝つ・audit に予約卓と実卓が両方残る）
  if exists (
    select 1 from public.checks
    where seat_id = v_seat and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- 【8】nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・【4】権限=can_register・seat 検証・
  --    invalid customer は check_open が担う＝二重に書かない）
  v_check_id := public.check_open(v_seat, v_res.party_size, v_nom_type, v_res.customer_id);

  -- ② 指名引き継ぎ（cast_id あり ∧ ★【6】発見3: cast が is_active のときだけ）
  if v_res.cast_id is not null then
    select true into v_cast_ok from public.casts
    where id = v_res.cast_id and org_id = v_org and is_active
      and store_id = (select store_id from public.checks where id = v_check_id);
    if v_cast_ok then
      -- check_set_nominations を内部呼び（単一指名＝要素1の配列・weight=1・全置換）
      perform public.check_set_nominations(
        v_check_id, v_nom_type,
        jsonb_build_array(jsonb_build_object('cast_id', v_res.cast_id, 'weight', 1))
      );
    end if;
    -- cast inactive（v_cast_ok=false）なら指名スキップ・開店は成功（発見3 lock・不在表示は UI）
  end if;

  -- 予約を visited に・check_id を埋める（【7】visited⇔check_id 1:1）
  update public.reservations
     set status = 'visited', check_id = v_check_id, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_to_check', 'reservations:' || p_reservation_id::text,
    to_jsonb(v_res),
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',v_seat,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $$;

revoke execute on function public.reservation_to_check(uuid, uuid, text) from public, anon;
grant  execute on function public.reservation_to_check(uuid, uuid, text) to authenticated;

commit;
