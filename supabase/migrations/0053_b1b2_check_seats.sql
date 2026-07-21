-- 0053_b1b2_check_seats.sql
-- B1 相席（同一会計）／B2 席移動（裁定8 N1-b・設計承認 2026-07-21・裁定 a〜g＋★追加 確定）：
--   案A＝1伝票多席。checks.seat_id は主席（home）として不変・追加席は check_seats join 表で占有を台帳化。
--   merged_into は休眠据置（drop しない・案A 採用により未使用のまま保全＝裁定台帳記録）。
-- 翻訳元＝BANZEN 対応物なし（流用マップ L160）。挙動仕様の正本は mock decode 実測（2026-07-21・
--   Ix: 席移動＝伝票キー付け替えで start/明細/指名 丸ごと据置・kx: 相席＝空席のみ seats[] へ追加・
--   相席解除ハンドラは mock に無し＝裁定(b) で最小実装）。
--   既存4関数（check_open/check_close/check_void/reservation_to_check）は live prosrc 写経ベース
--   （2026-07-21 本日 fresh dump・記憶再構成なし）。check_seats の SELECT ポリシーは checks_select の
--   live 逐語ミラー（org＋店スコープ＋owner/manager∨staff can_register∨cast can_register）。
-- 裁定（2026-07-21・Agoora）：(a)transient＝check_seats 行は open 伝票の追加席占有・close/void/解除で
--   削除（plain unique(seat_id) が「追加席は同時1伝票」を構造保証）／(b)解除 RPC 最小実装
--   （主席は解除不可＝席移動の領分）／(c)★seats 行ロック方式＝占有を「取得」する RPC 冒頭で
--   select ... for update（READ COMMITTED では post-insert 再検証が相手の未コミット行を見えず
--   レースを閉じられないため。unique index 2本＝checks_one_open_per_seat と
--   check_seats_seat_occupancy は backstop 据置）／(d)移動×予約は RPC 非拒否＝soft 警告は UI／
--   (e)主席移動時 追加席は据置／(f)people 据置／(g)指名単一／★reservation_to_check も主席 open を
--   作る経路として同ガード（ロック＋追加席占有の拒否）適用。
-- ロック境界の設計：取得経路（check_open／check_add_seat／check_move_seat 移動先／
--   reservation_to_check）のみ seats 行をロック。解放経路（check_remove_seat／check_close／
--   check_void の delete）はロック不要＝解放と取得のレースは最悪「取得側の保守的拒否」で終わり
--   二重占有を作れない。ロックは全経路 1 seat 行のみ＝ロック順序起因のデッドロック無し
--   （to_check→内部 check_open の同一行 再 for update は同一トランザクション内で無害）。
-- 会計無改修：money 関数（check_group_due/check_recalc/cast_sales_aggregate/daily_report_aggregate）
--   と receipt は seat 参照 0 を実測済み＝1文字も触らない。check_close/check_void への追補は
--   status 更新直後の check_seats delete 1文のみ（money 計算 1文字不変）。占有は金銭でない
--   transient メタデータのため close/void の before jsonb へは畳み込まない（追加/解除の audit 行＋
--   close/void 自体の audit が系譜）。
-- 併記：check_open の再利用が主席∪追加席 union になるため、reservation_to_check 側で追加席占有を
--   拒否しないと「予約客が他組の伝票に着く」（発見1 の相席版）が開く＝★追加裁定は必須だった。
-- FK：check_id は on delete cascade（設計承認済み・check_lines の FK 無指定と意図的に異なる＝
--   占有行の寿命は厳密に伝票寿命の部分集合・伝票行の service 削除で占有が宙吊りになる事故を構造排除）。
-- backfill 無し（新テーブルのみ・既存 open 伝票は追加席ゼロから開始）。
-- 再適用可構成（if not exists / create or replace / drop policy if exists）だが手貼りは1回。
-- create or replace は既存4関数の ACL を保持（PostgreSQL 仕様）＝再 grant 不要。新設3本のみ末尾で revoke/grant。
-- verify への波及棚卸し（教訓＝裁定台帳 裁定9 追記）：grants の TABLES 配列へ check_seats を追加
--   （.length 参照ゆえハードコード数字なし・G1/G2 は public 全体スキャンで自動被覆）。count/
--   インベントリ型 assert への波及は他に無し（checks の index 本数固定 assert 不在は実測済み）。
--   TABLES 追加・G27・anon-guard・rls 追加は手貼り後の verify フェーズ。
-- 検証クエリ＝verify_0053.sql（Downloads 残置・repo 収載禁止・手貼り指示時に提示）。
begin;

-- 1) check_seats 新設（追加席の占有台帳・transient） -----------------------------------------
create table if not exists public.check_seats (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  check_id   uuid not null references public.checks(id) on delete cascade,
  seat_id    uuid not null references public.seats(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);
-- ★追加席は同時に1伝票のみ（占有の構造保証＝backstop。一次防御は取得 RPC の seats 行ロック）
create unique index if not exists check_seats_seat_occupancy on public.check_seats (seat_id);
create index if not exists check_seats_check_idx on public.check_seats (check_id);
create index if not exists check_seats_org_idx on public.check_seats (org_id);

alter table public.check_seats enable row level security;
-- checks_select の live 逐語ミラー（2026-07-21 実測）: 占有はレジ領域データ＝checks/check_lines と同可視
drop policy if exists check_seats_select on public.check_seats;
create policy check_seats_select on public.check_seats for select using (
  org_id = public.auth_org_id()
  and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  and (public.auth_role() in ('owner','manager')
       or (public.auth_role() = 'staff' and public.auth_staff_can_register())
       or (public.auth_role() = 'cast' and public.auth_cast_can_register()))
);

-- 新テーブル grant 規約（0003 型＋mig0049→0050 教訓）: revoke all → SELECT のみ戻す
revoke all on table public.check_seats from public, anon, authenticated;
grant select on table public.check_seats to authenticated;

-- 2) check_open 置換（署名不変）: seats 行ロック＋再利用を主席∪追加席 union へ -----------------
-- 変更点は3箇所のみ＝(i) seats select に for update of s（★裁定(c)・stores 行はロックしない＝
-- 店内全 open の直列化を避ける）(ii) 再利用 select を union 化（追加席タップ＝ホスト伝票を返す・
-- モックの同一会計挙動）(iii) コメント追記。他は live prosrc 逐語（競合フォールバックは
-- 主席 unique しか抑止しないため従来形のまま backstop 据置＝ロック下では実質不達）。
create or replace function public.check_open(p_seat_id uuid, p_people integer default null::integer, p_nom_type text default 'free'::text, p_customer_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = public.auth_org_id()
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
      where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = public.auth_org_id()
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := v_seat.set_min;
  v_sfee := v_seat.set_fee;
  v_emin := v_seat.ext_min;
  v_efee := v_seat.ext_fee;
  v_tper := v_seat.time_per;
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             created_by, customer_id)
  values (public.auth_org_id(), v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_actor, p_customer_id)
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

-- 3) check_move_seat 新設（B2 席移動・主席の付け替え） ---------------------------------------
-- start・スナップ（B4 5値/サ料/丸め）・明細・指名・people・追加席はすべて据置＝seat_id のみ更新
-- （裁定 e/f・モック Ix と同義＝同一 check 行ゆえ構造的に据置・リセット処理は持たない）。
-- 予約は consult しない（裁定(d)＝check_open と対称・soft 警告は UI）。23505 は backstop（'seat occupied'）。
create or replace function public.check_move_seat(p_check_id uuid, p_to_seat_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_seat record; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_to_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 移動先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_to_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  if p_to_seat_id = v_chk.seat_id then raise exception 'same seat'; end if;
  -- 占有チェック（ロック下＝コミット済み状態が確定）: 主席 open ∪ 追加席（自伝票の追加席も含めて拒否＝
  -- 主席との入替は「解除→移動」の2手・org 非限定＝物理占有はより厳しく見る）
  if exists (select 1 from public.checks where seat_id = p_to_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_to_seat_id) then
    raise exception 'seat occupied';
  end if;
  v_before := to_jsonb(v_chk);
  begin
    update public.checks set seat_id = p_to_seat_id where id = p_check_id;
  exception when unique_violation then
    -- backstop（checks_one_open_per_seat）＝ロック迂回経路が万一あっても二重主席は構造不能
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_move_seat', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;

-- 4) check_add_seat 新設（B1 相席＝追加席の占有取得） ----------------------------------------
-- モック kx と同義＝空席のみ追加可（主席 open・追加席占有・自伝票の主席はすべて 'seat occupied'）。
-- people は据置（裁定 f・モック kx は people 非改変）。
create or replace function public.check_add_seat(p_check_id uuid, p_seat_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_seat record; v_actor uuid; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 追加先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  -- 占有チェック（ロック下）: 主席 open（自伝票の主席もここで拒否）∪ 追加席
  if exists (select 1 from public.checks where seat_id = p_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_seat_id) then
    raise exception 'seat occupied';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  begin
    insert into public.check_seats (org_id, store_id, check_id, seat_id, created_by)
    values (v_chk.org_id, v_chk.store_id, p_check_id, p_seat_id, v_actor)
    returning id into v_id;
  exception when unique_violation then
    -- backstop（check_seats_seat_occupancy）
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_add_seat', 'check_seats:' || v_id::text, null,
    (select to_jsonb(cs) from public.check_seats cs where cs.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

-- 5) check_remove_seat 新設（B1 相席解除・最小実装＝裁定(b)） --------------------------------
-- 誤追加の訂正用。主席は解除不可（'home seat'＝席移動の領分）。解放経路＝seats 行ロック不要
-- （解放と取得のレースは取得側の保守的拒否で終わる＝二重占有を作れない・ヘッダ設計注記参照）。
create or replace function public.check_remove_seat(p_check_id uuid, p_seat_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_row record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_seat_id = v_chk.seat_id then raise exception 'home seat'; end if;
  select * into v_row from public.check_seats
    where check_id = p_check_id and seat_id = p_seat_id;
  if v_row.id is null then raise exception 'not found'; end if;
  delete from public.check_seats where id = v_row.id;
  perform public.audit_log_write('check_remove_seat', 'check_seats:' || v_row.id::text,
    to_jsonb(v_row), null, v_chk.store_id);
end $function$;

-- 6a) check_close 置換（live prosrc 写経＋status 更新直後に check_seats delete 1文のみ追補） ----
-- money 計算（group 充足・最大剰余法分配・back 凍結値）は 1文字不変。
create or replace function public.check_close(p_check_id uuid, p_idem_key uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
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
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

-- 6b) check_void 置換（live prosrc 写経＋status 更新直後に check_seats delete 1文のみ追補） ----
-- receivables/backs/claims の既存処理は 1文字不変。closed からの void は追加席解放済み＝delete は no-op。
create or replace function public.check_void(p_check_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
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

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）の売掛があれば void 拒否（宙吊り/幻影防止＝条件3＋partial）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 【F3f】void 時 pending claim 自動 reject（宙吊り防止＝receivables 'voided' と同型思想・approved は残置＝
  --        給与除外は collect.ts の void フィルタが単一責任点）
  update public.drink_claims
     set status = 'rejected', decided_by = v_actor, decided_at = now()
   where check_id = p_check_id and status = 'pending';
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;

-- 7) reservation_to_check 置換（★追加裁定＝主席 open を作る経路として同ガード） ----------------
-- 変更点は2箇所のみ＝(i) 卓店照合の seats select に for update（★裁定(c)・内部 check_open の同一行
-- 再 for update は同一トランザクション内で無害）(ii) 発見1 ブロックの直後に追加席占有の拒否を追補
-- （check_open の再利用が union 化されたため、ここで塞がないと予約客が他組の伝票に着く＝発見1 の相席版）。
-- 他は live prosrc 逐語。
create or replace function public.reservation_to_check(p_reservation_id uuid, p_seat_id uuid default null::uuid, p_nom_type text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- ★mig0053（裁定(c)）: seats 行ロック＝占有変更の直列化（主席 open を作る経路として同ガード）
  select store_id into v_seat_store from public.seats where id = v_seat for update;
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
  -- ★mig0053（B1 相席）: 追加席として占有中の卓も拒否（check_open の再利用が主席∪追加席 union に
  --   なったため、ここで塞がないと予約客が他組の伝票へ着く＝発見1 の相席版）
  if exists (
    select 1 from public.check_seats cs
    join public.checks c on c.id = cs.check_id
    where cs.seat_id = v_seat and c.status = 'open' and c.org_id = v_org
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
end $function$;

-- 8) 新設 RPC 3本の revoke/grant --------------------------------------------------------------
-- 二重防御（public だけでは無効・anon にも直 grant されるため必ず両方 revoke）。
-- 置換した既存4関数は create or replace が ACL を保持＝再 grant 不要。
revoke execute on function public.check_move_seat(uuid,uuid) from public, anon;
grant  execute on function public.check_move_seat(uuid,uuid) to authenticated;
revoke execute on function public.check_add_seat(uuid,uuid) from public, anon;
grant  execute on function public.check_add_seat(uuid,uuid) to authenticated;
revoke execute on function public.check_remove_seat(uuid,uuid) from public, anon;
grant  execute on function public.check_remove_seat(uuid,uuid) to authenticated;

commit;
