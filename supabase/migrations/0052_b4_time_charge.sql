-- 0052_b4_time_charge.sql
-- B4 時間料金自動計算（裁定8 N1-b・設計承認 2026-07-21・裁定 a〜h 8点確定）：
--   セット＋延長の自動計算を導入。stores へ時間制6列（列保持裁定・E1 流儀）・checks へ open 時
--   スナップ5列（非遡及＝E1【決定1】と同型・time_mode は非スナップ＝裁定(g)）・check_lines へ
--   time_auto 1列＋部分ユニークインデックス（check 内自動行1本の構造保証）。
-- 翻訳元＝BANZEN 対応物なし（流用マップ L160）。計算仕様の正本は mock decode 実測（2026-07-21・
--   W: setMin60/setFee5000/extMin30/extFee4000/timeMode manual/timePer 卓・
--   Lp: d=経過分, units=timePer名?people:1, blocks=d<=setMin?0:ceil((d-setMin)/extMin)・
--   hx: time_auto 単一行「時間料金(セット+延長)」の挿入/更新）。
--   既存関数は live prosrc 写経ベース（2026-07-21 取得・check_open/set_store_pricing/
--   check_add_line/check_remove_line）。記憶再構成なし。
-- 裁定（2026-07-21・Agoora）：(a)apply は check_add_line と同一の4者 gate／(b)自然冪等（冪等キー
--   無し・0038/0040 型）／(c)payments 存在時 'has payments' 拒否／(d)kind='time'（全集計経路で
--   set/time/charge 等価を実測済み・語彙拡張なし）／(e)pay_group='A' 固定／(f)UI は反映ボタンのみ／
--   (g)time_mode 非スナップ／(h)fee default 0（誤課金ゼロ構造・time_mode 既定 manual と二重）。
-- 併記（相談役指示1）：checks_people_check の live 現物 = ((people IS NULL) OR (people > 0))
--   ＝下限あり → apply 内は coalesce(v_chk.people, 1) で十分（greatest 不使用・列 CHECK 追加なし）。
-- backfill 無し：stores/checks の新列は本 mig で同時に生まれ双方 default（60/0/30/0/table）で自動
--   一致。settings_json に時間制キーは不在（dev 実測 2026-07-21）＝E1 型の json 移送も無し。
-- 手動経路無改修：check_add_line / check_remove_line / kind 語彙 CHECK は一切触らない
--   （register-board の手動 set/time 行はそのまま・手動行は time_auto=false で自動行と共存）。
-- 再適用可構成（if not exists / create or replace）だが手貼りは1回。単一トランザクション。
-- 検証クエリ＝verify_0052.sql（Downloads 残置・repo 収載禁止・手貼り指示時に提示）。
begin;

-- 1) stores へ時間制6列 ------------------------------------------------------------------
-- fee default 0＝E1 fee 流儀（hon/jonai/dohan と同じ）・分 60/30＝モック実測値。
-- 上限 1440（24h）＝round_unit 上限 10000 と同思想（桁違い typo の構造停止）。ext_min>=1 は除算ガード。
-- モックの 15分刻み・下限15 は UI ステッパの責務（DB は構造ガードに留め将来の粒度変更を殺さない）。
alter table public.stores
  add column if not exists set_min   integer not null default 60       constraint stores_set_min_check   check (set_min between 1 and 1440),
  add column if not exists set_fee   integer not null default 0        constraint stores_set_fee_check   check (set_fee >= 0),
  add column if not exists ext_min   integer not null default 30       constraint stores_ext_min_check   check (ext_min between 1 and 1440),
  add column if not exists ext_fee   integer not null default 0        constraint stores_ext_fee_check   check (ext_fee >= 0),
  add column if not exists time_mode text    not null default 'manual' constraint stores_time_mode_check check (time_mode in ('manual','auto')),
  add column if not exists time_per  text    not null default 'table'  constraint stores_time_per_check  check (time_per in ('table','person'));

-- 2) checks へ open 時スナップ5列 ---------------------------------------------------------
-- 既存スナップ3列（service_rate/round_unit/round_mode）と同居。CHECK は checks 現物流儀＝下限のみ
-- （checks_round_unit_check が round_unit >= 1 のみ＝上限は stores 側の責務、の現行構造に合わせる）。
-- time_mode はスナップしない（裁定(g)＝運用トグルは live 読み・凍結は料金値のみ）。
alter table public.checks
  add column if not exists set_min  integer not null default 60      constraint checks_set_min_check  check (set_min >= 1),
  add column if not exists set_fee  integer not null default 0       constraint checks_set_fee_check  check (set_fee >= 0),
  add column if not exists ext_min  integer not null default 30      constraint checks_ext_min_check  check (ext_min >= 1),
  add column if not exists ext_fee  integer not null default 0       constraint checks_ext_fee_check  check (ext_fee >= 0),
  add column if not exists time_per text    not null default 'table' constraint checks_time_per_check check (time_per in ('table','person'));

-- 3) check_lines へ time_auto 1列＋部分ユニークインデックス --------------------------------
-- 「check 内で自動行は最大1本」をインデックスで構造保証（checks_one_open_per_seat と同パターン・
-- 並行呼びは insert/update に収束＝重複行が物理的に作れない）。手動行は常に default false。
alter table public.check_lines
  add column if not exists time_auto boolean not null default false;
create unique index if not exists check_lines_one_time_auto
  on public.check_lines (check_id) where time_auto;

-- 4) check_open 置換（署名不変）: 時間制5値を open 時スナップへ追補 ------------------------
-- 変更点は declare の5変数・select 列・【決定1】ブロックの5値代入と防御 raise・insert 列のみ
-- （E1 mig0051 §3 と同型の body 置換。既存の顧客照合・自然冪等・競合フォールバック・audit は逐語不変）。
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
  select s.id, s.org_id, s.store_id, s.is_active,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id;
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
  select id into v_id from public.checks
    where seat_id = p_seat_id and status = 'open' and org_id = public.auth_org_id()
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

-- 5) set_store_time_pricing 新設（時間制6列の唯一の書き手・set_store_pricing 写経） --------
-- E1 境界（owner ∨ manager 自店）・原則7 全値明示・audit は6キー合成 jsonb（settings_json 非混入）。
create or replace function public.set_store_time_pricing(
  p_store_id uuid, p_set_min integer, p_set_fee integer,
  p_ext_min integer, p_ext_fee integer, p_time_mode text, p_time_per text
) returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否（coalesce の null→既定リセット挙動を作らない）。
  -- 範囲は列 CHECK と同値＝二段（raise の方が PostgREST エラーが読みやすい）。
  if p_set_min is null or p_set_min < 1 or p_set_min > 1440 then raise exception 'bad time pricing'; end if;
  if p_set_fee is null or p_set_fee < 0 then raise exception 'bad time pricing'; end if;
  if p_ext_min is null or p_ext_min < 1 or p_ext_min > 1440 then raise exception 'bad time pricing'; end if;
  if p_ext_fee is null or p_ext_fee < 0 then raise exception 'bad time pricing'; end if;
  if p_time_mode is null or p_time_mode not in ('manual','auto') then raise exception 'bad time pricing'; end if;
  if p_time_per is null or p_time_per not in ('table','person') then raise exception 'bad time pricing'; end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は時間制6列のみの合成 jsonb（E1 の7キー合成と同型・settings_json 全文を監査に混ぜない）
  select jsonb_build_object(
           'set_min', set_min, 'set_fee', set_fee, 'ext_min', ext_min,
           'ext_fee', ext_fee, 'time_mode', time_mode, 'time_per', time_per)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set set_min = p_set_min, set_fee = p_set_fee, ext_min = p_ext_min,
         ext_fee = p_ext_fee, time_mode = p_time_mode, time_per = p_time_per
   where id = p_store_id;
  select jsonb_build_object(
           'set_min', set_min, 'set_fee', set_fee, 'ext_min', ext_min,
           'ext_fee', ext_fee, 'time_mode', time_mode, 'time_per', time_per)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_time_pricing', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

-- 二重防御（public だけでは無効・anon にも直 grant されるため必ず両方 revoke）
revoke execute on function public.set_store_time_pricing(uuid,integer,integer,integer,integer,text,text) from public, anon;
grant  execute on function public.set_store_time_pricing(uuid,integer,integer,integer,integer,text,text) to authenticated;

-- 6) check_time_charge_apply 新設（自動行の挿入/更新・サーバ計算のみ） ----------------------
-- クライアントは金額を送らない（引数は check_id のみ・返値 jsonb でサーバ真実の内訳を UI へ）。
-- 計算はモック Lp 写し（整数演算・ceil は (x+m-1)/m）・読み元は checks スナップ5列＝非遡及を構造で保証。
-- 認可は check_add_line と同一の4者 gate（裁定(a)）。冪等は自然冪等（裁定(b)＝部分ユニーク
-- インデックス＋決定的サーバ再計算・再送はいつでも安全）。payments 存在時は拒否（裁定(c)）。
create or replace function public.check_time_charge_apply(p_check_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_chk record; v_before jsonb; v_id uuid; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
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
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  v_units := case when v_chk.time_per = 'person' then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  v_set_c := v_chk.set_fee * v_units;
  v_ext_c := v_blocks * v_chk.ext_fee * v_units;
  v_total := v_set_c + v_ext_c;

  -- 自然冪等 upsert（部分ユニークインデックス check_lines_one_time_auto が1本を構造保証。
  -- 並行2呼びは片方 insert・片方 update に収束。update 時 sort_order は据置＝伝票内の位置不変）
  select to_jsonb(l) into v_before from public.check_lines l
    where l.check_id = p_check_id and l.time_auto;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          '時間料金(セット+延長)', v_total, 1, v_total, null, v_sort, true)
  on conflict (check_id) where time_auto do update
     set unit_price_snapshot = excluded.unit_price_snapshot,
         line_total          = excluded.line_total,
         name_snapshot       = excluded.name_snapshot
  returning id into v_id;

  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_time_charge_apply', 'check_lines:' || v_id::text,
    v_before, (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);

  return jsonb_build_object('elapsed_min', v_d, 'units', v_units, 'blocks', v_blocks,
                            'set_c', v_set_c, 'ext_c', v_ext_c, 'total', v_total, 'line_id', v_id);
end $function$;

-- 二重防御（public だけでは無効・anon にも直 grant されるため必ず両方 revoke）
revoke execute on function public.check_time_charge_apply(uuid) from public, anon;
grant  execute on function public.check_time_charge_apply(uuid) to authenticated;

commit;
