-- 0027_f3a3_reservations: F3a-3 予約機能 — reservations テーブル + RLS + 予約RPC 4本
--   reservation_create / reservation_update / reservation_set_status / reservation_to_check
--   （reservation_delete は不採用＝cancelled で代替・監査証跡保持＝設計ロック §3-E）
--
-- 翻訳元・裁定参照:
--   - 設計ロック確定版 NOX_F3a-3_予約機能_設計ロック確定版.md（2026-07-10・全論点 lock）
--   - CC 現物確認7項目（check_open/check_set_nominations 全文・definer チェーン実証 ALL PASS 8・
--     seats/casts/checks 構造・auth_cast_id・モック予約タブ）＋ mig 直前 live 再確認
--     （casts.is_active NOT NULL / checks.store_id NOT NULL / touch_updated_at() 実在）
--
-- 実装ノート:
--   【1】書込はすべて SECURITY DEFINER RPC（INSERT/UPDATE/DELETE policy 作らない・customers 同型）。
--        テーブルは標準型（0003）: create → index → RLS+select policy → revoke all → grant select のみ。
--   【2】可視範囲（RLS select 1本・customers 同型）: owner=org 全店 / manager=自店 / staff=自店∧can_crm /
--        cast=自分指名予約のみ（cast_id=auth_cast_id()・未指名 null は不可視・退店 cast は helper が
--        null を返し fail-closed）。★店スコープ必須（束2 customers の他店漏洩教訓＝owner 以外 store_id 併置）。
--   【3】操作権限の機能分け（論点1 lock）: 作成/変更/ステータス=can_crm（顧客機能）・
--        予約→伝票（to_check）=can_register（会計オペ・内側 check_open が強制）。
--   【4】★reservation_to_check は definer チェーン（check_open→check_set_nominations 内部呼び・案A）。
--        auth.uid() はセッション GUC＝definer 切替の影響を受けないことを実証済み（現物確認 項目4
--        ALL PASS 8・can_register ゲートがチェーン越しに発火する negative も実測）。
--        権限（can_register）・seat 検証（org/inactive）・invalid customer は内側 check_open が担い
--        二重に書かない（fail-closed 冒頭ガードのみ持つ）。
--   【5】★発見1対策: 対象卓に open 伝票があれば 'seat occupied'（check_open の「既存 open 再利用」で
--        他人の伝票が返り予約が誤接続される穴を封じる）。残余リスク: 事前検証と INSERT の間の同時開店
--        競合窓では check_open の on conflict 経路が先着 open を返し得る（実運用の同時タップ級・
--        audit で追跡可能＝許容）。
--   【6】★発見3対策: 指名 cast が inactive（退店済み）なら指名をスキップして開店は成功
--        （check_set_nominations の 'bad cast' で来店処理全体を倒さない）。不在表示は UI の責務。
--   【7】visited は reservation_to_check だけが設定（set_status は cancelled/no_show のみ・
--        booked からの遷移のみ許可・復帰不可）＝visited⇔check_id 1:1 整合の要。
--   【8】nom_type 両対応（lock）: to_check 引数 > 予約の nom_type > 'free' の優先で決定。
--   【9】CHECK 3本（status/nom_type/party_size）は runtime のみ表面化（BANZEN 0067 教訓）＝
--        verify 段19 で全値の実挿入＋不正値拒否を確認する。
--   【10】★CC 追加ガード（確定版からの追加・相談役レビュー対象）: to_check は p_seat_id の店が
--        予約の store_id と一致することを検証（'invalid store'）。無いと owner の org 全店権限で
--        「A1 の予約を A2 の卓で開く」誤接続が customer_id=null（guest_name のみ）の予約で素通りする
--        （customer あり予約は check_open の invalid customer が同店検証で止めるが、フリー名予約は
--        止まる関所が無い）。
--   【11】★CC 調整: reservation_create の引数順は Postgres の「default 付き引数は後置」制約により
--        確定版 §3-A の列挙順から (p_store_id, p_reserved_at, ...任意群) に並べ替え
--        （PostgREST は名前渡し＝呼び出しへの影響なし）。
--   【12】★CC 調整: guest_name は trim・空文字は null 正規化・80字上限で 'bad name'
--        （staff_create の名前と同基準）。customer_id と guest_name の両 null は許容（lock どおり）。
--   【13】updated_at は touch_updated_at トリガ（既存表と同型・live 確認済み）＋確定版どおり
--        RPC 内でも明示 set（トリガと重複するが無害・確定版 SQL を尊重）。
--   【14】audit（規約6）: 4本すべて audit_log_write。create は before=null（新規）・after=生成行。
--        update/set_status/to_check は before=旧行・after=変更内容。
--   【15】reservation_update は全フィールド明示送信（規約7 の精神＝部分更新の null 事故を作らない・
--        customer_update 同型）。null を渡せば「クリア」（cast 外し・customer 外し等）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select proname, pg_get_function_identity_arguments(p.oid) from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and proname like 'reservation%' order by proname;
--   -- reservation_create(uuid, timestamp with time zone, uuid, uuid, text, integer, text, text) /
--   -- reservation_set_status(uuid, text) / reservation_to_check(uuid, uuid, text) /
--   -- reservation_update(uuid, timestamp with time zone, uuid, uuid, text, integer, text, text) の4本
--   select relrowsecurity from pg_class where relname='reservations';               -- true
--   select count(*) from pg_policies where tablename='reservations';                -- 1（select のみ）
--   select privilege_type from information_schema.role_table_grants
--     where table_name='reservations' and grantee='authenticated';                  -- SELECT のみ1行
--   select has_function_privilege('anon','public.reservation_to_check(uuid,uuid,text)','execute'); -- false
--   select prosrc like '%seat occupied%' and prosrc like '%not bookable%'
--     from pg_proc where proname='reservation_to_check';                            -- true
--   notify pgrst, 'reload schema';  -- ★PostgREST に新テーブル/新関数を認識させる（現物確認 項目4 副産物）

begin;

-- ══════════════════════════════════════════════════════════════
-- reservations テーブル（設計ロック §1 どおり）
-- ══════════════════════════════════════════════════════════════
create table public.reservations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  customer_id  uuid null references public.customers(id),   -- 既存客紐付け（フリー客=null）
  cast_id      uuid null references public.casts(id),       -- 指名キャスト（未指名=null）
  guest_name   text null,                                   -- フリー入力名（customer_id 優先・なければこれ）
  reserved_at  timestamptz not null,                        -- 予約日時
  party_size   integer null,                                -- 人数（任意）
  nom_type     text null,                                   -- 予約時の指名種別（任意・来店時上書き可）
  status       text not null default 'booked',              -- booked/visited/no_show/cancelled
  memo         text null,                                   -- 備考（卓希望もここ＝予約は卓を押さえない）
  check_id     uuid null references public.checks(id),      -- 来店時に開いた伝票（visited の証跡）
  created_by   uuid null references public.users(id),       -- 受付スタッフ
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reservations_status_chk
    check (status in ('booked','visited','no_show','cancelled')),
  constraint reservations_nom_type_chk
    check (nom_type is null or nom_type in ('hon','jonai','dohan','free')),
  constraint reservations_party_chk
    check (party_size is null or party_size > 0)
);
create index reservations_store_time_idx on public.reservations (store_id, reserved_at);
create index reservations_cast_idx on public.reservations (cast_id) where cast_id is not null;

-- updated_at トリガ（既存表と同型・touch_updated_at は live 実在確認済み）
drop trigger if exists reservations_touch_updated_at on public.reservations;
create trigger reservations_touch_updated_at before update on public.reservations
  for each row execute function public.touch_updated_at();

-- RLS（select 1本のみ・書込 policy なし＝【1】【2】）
alter table public.reservations enable row level security;
create policy reservations_select on public.reservations for select
using (
  org_id = public.auth_org_id()
  and (
    public.auth_role() = 'owner'                                              -- 全店
    or (public.auth_role() = 'manager' and store_id = public.auth_store_id()) -- 自店
    or (public.auth_role() = 'staff'   and store_id = public.auth_store_id()
        and public.auth_staff_can_crm())                                      -- can_crm で自店全予約
    or (public.auth_role() = 'cast'    and cast_id = public.auth_cast_id())   -- 自分指名予約のみ
  )
);

-- grant 面の締め（標準型・0002 TRUNCATE 教訓）
revoke all on table public.reservations from public, anon, authenticated;
grant select on table public.reservations to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ① reservation_create（予約登録・can_crm・§3-A）
--    引数順は【11】: 必須 (store, reserved_at) → 任意群 default null
-- ══════════════════════════════════════════════════════════════
create or replace function public.reservation_create(
  p_store_id    uuid,
  p_reserved_at timestamptz,
  p_customer_id uuid default null,
  p_cast_id     uuid default null,
  p_guest_name  text default null,
  p_party_size  integer default null,
  p_nom_type    text default null,
  p_memo        text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_guest     text;
  v_actor     uuid;
  v_id        uuid;
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

  -- customer_id と guest_name の両 null は許容（lock: 名前なし予約＝後で編集で埋められる）

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.reservations
    (org_id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type, status, memo, created_by)
  values
    (v_org, p_store_id, p_customer_id, p_cast_id, v_guest, p_reserved_at, p_party_size, p_nom_type, 'booked', p_memo, v_actor)
  returning id into v_id;

  perform public.audit_log_write('reservation_create', 'reservations:' || v_id::text,
    null, (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ② reservation_update（変更・can_crm・§3-B）
--    全フィールド明示送信（【15】・null=クリア）。booked のみ変更可。
-- ══════════════════════════════════════════════════════════════
create or replace function public.reservation_update(
  p_reservation_id uuid,
  p_reserved_at    timestamptz,
  p_customer_id    uuid,
  p_cast_id        uuid,
  p_guest_name     text,
  p_party_size     integer,
  p_nom_type       text,
  p_memo           text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_res    public.reservations;
  v_guest  text;
  v_before jsonb;
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

  v_before := to_jsonb(v_res);
  update public.reservations
     set reserved_at = p_reserved_at,
         customer_id = p_customer_id,
         cast_id     = p_cast_id,
         guest_name  = v_guest,
         party_size  = p_party_size,
         nom_type    = p_nom_type,
         memo        = p_memo,
         updated_at  = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_update', 'reservations:' || p_reservation_id::text,
    v_before, (select to_jsonb(r) from public.reservations r where r.id = p_reservation_id),
    v_res.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ③ reservation_set_status（キャンセル/no-show マーク・can_crm・§3-C）
--    ★visited は reservation_to_check 専用（手動遷移不可）＝visited⇔check_id 1:1 の要【7】
-- ══════════════════════════════════════════════════════════════
create or replace function public.reservation_set_status(
  p_reservation_id uuid,
  p_status         text      -- 'cancelled' | 'no_show' のみ
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_res    public.reservations;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 受け付ける値は cancelled/no_show のみ（visited への手動遷移・booked への復帰を封じる）
  if p_status is null or p_status not in ('cancelled','no_show') then raise exception 'bad status'; end if;

  -- 対象予約（org 照合）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限差（create と同型）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_res.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_res.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  -- 遷移制約: booked → cancelled/no_show のみ（visited/cancelled/no_show からの遷移は不可）
  if v_res.status <> 'booked' then raise exception 'bad transition'; end if;

  v_before := to_jsonb(v_res);
  update public.reservations
     set status = p_status, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_set_status', 'reservations:' || p_reservation_id::text,
    v_before, jsonb_build_object('status', p_status), v_res.store_id);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ④ ★reservation_to_check（予約→伝票を開く・can_register は内側強制・§3-D）
--    definer チェーン（check_open → check_set_nominations 内部呼び・案A＝項目4 実証済み）
-- ══════════════════════════════════════════════════════════════
create or replace function public.reservation_to_check(
  p_reservation_id uuid,
  p_seat_id        uuid,
  p_nom_type       text default null   -- 来店時の指名種別（null なら予約の nom_type・両方 null なら free）
) returns uuid                         -- 開いた check の id
language plpgsql security definer set search_path = public
as $$
declare
  v_org        uuid := public.auth_org_id();
  v_role       text := public.auth_role();
  v_res        public.reservations;
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

  -- ★【10】卓の店＝予約の店（owner の org 全店権限で他店卓に開く誤接続を封じる。
  --   customer あり予約は内側 check_open の invalid customer でも止まるが、guest_name のみの
  --   フリー予約には関所が無いためここで一致を要求）
  select store_id into v_seat_store from public.seats where id = p_seat_id;
  if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;

  -- ★【5】発見1対策: 対象卓に既存 open があれば拒否（使用中の卓に予約客を着けない＝
  --   check_open の「既存 open 再利用」で他人の伝票が返る誤接続の封鎖）
  if exists (
    select 1 from public.checks
    where seat_id = p_seat_id and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- 【8】nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・【4】権限=can_register・seat 検証・
  --    invalid customer は check_open が担う＝二重に書かない）
  v_check_id := public.check_open(p_seat_id, v_res.party_size, v_nom_type, v_res.customer_id);

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
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',p_seat_id,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- grant/revoke（4本・二重防御。to_check も authenticated＝can_register は内側 check_open が強制）
-- ══════════════════════════════════════════════════════════════
revoke execute on function public.reservation_create(uuid, timestamptz, uuid, uuid, text, integer, text, text) from public, anon;
grant  execute on function public.reservation_create(uuid, timestamptz, uuid, uuid, text, integer, text, text) to authenticated;
revoke execute on function public.reservation_update(uuid, timestamptz, uuid, uuid, text, integer, text, text) from public, anon;
grant  execute on function public.reservation_update(uuid, timestamptz, uuid, uuid, text, integer, text, text) to authenticated;
revoke execute on function public.reservation_set_status(uuid, text) from public, anon;
grant  execute on function public.reservation_set_status(uuid, text) to authenticated;
revoke execute on function public.reservation_to_check(uuid, uuid, text) from public, anon;
grant  execute on function public.reservation_to_check(uuid, uuid, text) to authenticated;

commit;
