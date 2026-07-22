-- 0057_k_kiosk_register_arms.sql
-- レジ用キオスク K（裁定11・案A＝F4a 型拡張）＝arms 層（2/2・★0056 適用済みが前提）。
--   会計RPC 10本＋周辺2本（print_enqueue/bottle_keep_register）へ kiosk 腕を追加し、
--   audit_log_write に org/actor の kiosk 解決を追補する。裁定6 堅持＝会計RPC は共用・複製しない。
--   check_void は対象外（確定①・取消は manager 権限）。approval_request/drink_claim も対象外（確定②）。
--
-- ★変換は全関数で次の4点のみ（他は 2026-07-22 live prosrc の写経逐語＝money 計算 1文字不変）：
--  (1) null guard 二重化:
--        if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
--          raise exception 'forbidden';
--      （認証者でも register kiosk でもない→遮断。punch device は register helper が null＝ここで遮断
--        ＝確定⑤ 防御深度。register device でもセッション無しは gate 第5腕で遮断＝fail-closed 二段）
--  (2) org 解決: v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
--      以降の public.auth_org_id() 参照を全て v_org へ置換（org照合が kiosk でも能動化＝現行より厳格化・
--      緩和ゼロ。人間ユーザーは coalesce 第1腕で従来値＝挙動同一）
--  (3) gate 第5腕（kiosk 腕・全関数同一形＝裁定11 単一判定点）:
--        or (<store式> = public.auth_kiosk_register_store_id()
--            and public.auth_kiosk_operator() is not null)
--  (4) actor 解決（v_actor を持つ関数のみ・裁定11 逐語）:
--        select coalesce(public.auth_kiosk_operator(),
--                        (select id from public.users where auth_user_id = auth.uid() and is_active))
--          into v_actor;
--      （payments.by_user_id / checks.created_by の NOT NULL は operator＝users.id で充足）
--
-- ★関数別の編集点インベントリ（レビュー用＝これ以外の diff はゼロ）：
--  audit_log_write         (1)なし※ (2)org coalesce (4)actor coalesce ＝2点（※guard は v_org null 判定のまま・
--                          coalesce が kiosk org を供給。★最重要レビュー点＝全書込 RPC 共有・G3 ACL は replace で保持）
--  check_open              (1)(2)(3)(4)＋v_org 置換5箇所（org照合/customer検証/open再利用×2/INSERT/競合再選択）
--  check_set_nominations   (1)(2)(3)＋v_org 置換2箇所（org照合/cast検証）
--  check_add_line          (1)(2)(3)＋v_org 置換2箇所（org照合/product検証）
--  check_remove_line       (1)(2)(3)＋v_org 置換1箇所（line org照合）
--  check_pay               (1)(2)(3)(4)＋v_org 置換1箇所（org照合）
--  check_close             (1)(2)(3)＋v_org 置換1箇所（org照合）＝分配・最大剰余法・凍結値は全て逐語
--  check_time_charge_apply (1)(2)(3)＋v_org 置換1箇所（org照合）＝時間計算・自然冪等 upsert は逐語
--  check_move_seat         (1)(2)(3)＋v_org 置換2箇所（伝票 org照合/移動先 seat org照合）
--  check_add_seat          (1)(2)(3)(4)＋v_org 置換2箇所（伝票 org照合/追加先 seat org照合）
--  check_remove_seat       (1)(2)(3)＋v_org 置換1箇所（org照合）
--  print_enqueue           (1)(2)(3)(4)＋v_org 置換1箇所（org照合）
--  bottle_keep_register    (1)(2)(3)＋v_org 初期化を coalesce へ（declare 初期化→本文代入へ移動・v_role は
--                          kiosk で null のまま＝role 腕は全 false・kiosk 腕が受ける）
--
-- ★money 写経逐語の機械照合（承認手順）：
--  a) 事前 dump＝本セッション取得済みの live prosrc（pg_get_functiondef・2026-07-22）と本 mig 本文を
--     関数ごとに diff → 上記インベントリの行のみが差分であることを相談役が照合（これが一字照合の実体）。
--  b) 適用後 runtime＝verify:f0 の3ゲート（pay83/receipt52/payroll112）＋rls golden 実呼び
--     （check_open→add_line→pay→close の total=54400・按分・冪等系）が置換後の関数を実走＝
--     money 経路の挙動不変を runtime で機械証明（金額が 1 円でも動けば赤）。
--  c) 適用後 static＝下の検証クエリ 5)（kiosk トークンを含む関数集合が期待 13 本と一致）。
--
-- 教訓B（verify 波及の事前棚卸し・実測済み）：
--  - verify 3 スクリプトに prosrc 本文型 assert（ilike 等）は存在しない（grep 実測）＝本文変更の波及ゼロ。
--  - 署名一意 assert（G22 check_pay 7引数・G26 time_charge 1引数・G27 seat 3本 2引数）＝全て署名不変で緑。
--  - G3（audit_log_write ACL=owner のみ）＝create or replace は ACL 保持（mig0053 根拠）＝緑不変。
--  - anon-guard の null-args probe ＝署名不変で全て同一解決＝緑不変。
--  - runtime ゲート試験（段14 staff 会計6RPC・段31 cast会計・rls F1b/F3a-1）＝人間ロールの腕は逐語保持
--    ＋第5腕は人間に恒偽（register device 非該当）＝挙動不変で緑。
--  - verify 追加フェーズ（適用後）：anon-guard 段35a に（0056 分と併せ）新署名 BLOCKED 追記・
--    G30（0056 分）に加え G31＝kiosk 腕の静的確認（13関数の kiosk トークン集合一致）・
--    rls/anon-guard に kiosk 実 device の会計実走段（provision purpose='register'→login→check_open→pay→close
--    →by_user_id=operator 充足→idle 失効→forbidden）を新設。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 0) 貼り先証明（1行返れば正・エラー/0件なら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) 13関数の存在＋署名不変（オーバーロード無し）
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where pronamespace='public'::regnamespace and proname in
--     ('audit_log_write','check_open','check_set_nominations','check_add_line','check_remove_line',
--      'check_pay','check_close','check_time_charge_apply','check_move_seat','check_add_seat',
--      'check_remove_seat','print_enqueue','bottle_keep_register') order by proname;  -- 期待 13行・各1署名
--   -- 2) audit_log_write ACL 不変（G3 同型＝anon/authenticated/service_role/public 不在）
--   select proacl from pg_proc where pronamespace='public'::regnamespace and proname='audit_log_write';
--   -- 3) check_void に kiosk トークンが無い（確定①＝腕を足していない証明）
--   select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='check_void'
--     and pg_get_functiondef(oid) ilike '%kiosk%';  -- 期待 0
--   -- 4) 会計中核の署名（G22/G26/G27 が verify:f0 で自動照合）
--   -- 5) kiosk 腕の集合一致＝auth_kiosk_register_store_id を含む関数が期待13本と一致
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and pg_get_functiondef(oid) ilike '%auth_kiosk_register_store_id%'
--     and proname not in ('auth_kiosk_register_store_id','kiosk_operator_list')  -- 0056 分を除外
--     order by proname;
--   --   期待: 上記 13本（audit_log_write は register helper 非使用＝12本＋…下記※）
--   --   ※audit_log_write は (1) を持たない＝register helper を含まない。期待は 12本
--   --    （check_open〜check_remove_seat の10本＋print_enqueue＋bottle_keep_register）。
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and pg_get_functiondef(oid) ilike '%auth_kiosk_operator%'
--     and proname <> 'auth_kiosk_operator' order by proname;
--   --   期待: audit_log_write＋gate/actor で operator を呼ぶ 12本 ＝ 13本
--   -- 6) runtime＝npm run verify:f0（3ゲート pay83/receipt52/payroll112 不変・rls golden 54400 実走）
--   -- 7) 手貼り後 notify pgrst, 'reload schema';

begin;

-- ══════════════════════════════════════════════════════════════
-- ① audit_log_write（★最重要＝全書込 RPC 共有。org/actor の kiosk 解決を追補・他は live 逐語）
--    kiosk 経由の会計RPC が監査段で raise→全 rollback する構造欠陥（live 実測）を封じる。
--    ACL＝owner のみ（G3）＝create or replace で保持・ACL 文なし。
-- ══════════════════════════════════════════════════════════════
create or replace function public.audit_log_write(
  p_action text,
  p_target text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_store_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_actor uuid;
  v_ip    text;
  v_id    uuid;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  -- ★0057(2): kiosk 経由は device org を供給（人間は coalesce 第1腕＝従来どおり・両方 null は従来どおり raise）
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());
  if v_org is null then
    raise exception 'forbidden';
  end if;

  -- ★0057(4): actor＝operator（kiosk セッション）優先・従来式 fallback
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;

  -- ip はベストエフォート（PostgREST 経由時のみ request.headers が入る）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_org, p_store_id, v_actor, p_action, p_target, p_before, p_after, v_ip)
  returning id into v_id;
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ② check_open（4点＋v_org 置換5箇所・席ロック/冪等/スナップショット/money は逐語）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_open(
  p_seat_id uuid,
  p_people integer default null,
  p_nom_type text default 'free',
  p_customer_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
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
  select s.id, s.org_id, s.store_id, s.is_active,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per
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

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             created_by, customer_id)
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- ③ check_set_nominations（4点のうち(1)(2)(3)＋v_org 置換2箇所・指名検証/削除挿入は逐語）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_set_nominations(p_check_id uuid, p_nom_type text, p_nominations jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
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
    if v_cast.id is null or v_cast.org_id <> v_org
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

-- ══════════════════════════════════════════════════════════════
-- ④ check_add_line（(1)(2)(3)＋v_org 置換2箇所・snapshot/価格/recalc は逐語）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_add_line(
  p_check_id uuid,
  p_product_id uuid default null,
  p_qty integer default 1,
  p_kind text default null,
  p_pay_group text default 'A',
  p_name text default null,
  p_unit_price integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
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

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
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

-- ══════════════════════════════════════════════════════════════
-- ⑤ check_remove_line（(1)(2)(3)＋v_org 置換1箇所・has payments ガード/recalc は逐語）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_remove_line(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_line record; v_chk record; v_paycnt int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
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

-- ══════════════════════════════════════════════════════════════
-- ⑥ check_pay（(1)(2)(3)(4)＋v_org 置換1箇所・冪等/残額検証/受領生成は逐語。
--    by_user_id NOT NULL＝operator で充足＝裁定11 の核心解消点）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_pay(
  p_check_id uuid,
  p_method text,
  p_amount integer,
  p_pay_group text default 'A',
  p_tendered integer default null,
  p_idem_key uuid default null,
  p_method_detail text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

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

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount, p_tendered, p_idem_key, v_actor, v_detail)
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

-- ══════════════════════════════════════════════════════════════
-- ⑦ check_close（(1)(2)(3)＋v_org 置換1箇所。★分配＝最大剰余法・凍結値・pt・
--    check_seats 解放・status 遷移は全て live 逐語＝money 1文字不変）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_close(p_check_id uuid, p_idem_key uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑧ check_time_charge_apply（(1)(2)(3)＋v_org 置換1箇所・時間計算/自然冪等 upsert は逐語）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_time_charge_apply(p_check_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_before jsonb; v_id uuid; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑨ check_move_seat（(1)(2)(3)＋v_org 置換2箇所・席ロック/占有チェック/backstop は逐語＝確定⑦）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_move_seat(p_check_id uuid, p_to_seat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_seat record; v_before jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_to_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 移動先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_to_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑩ check_add_seat（(1)(2)(3)(4)＋v_org 置換2箇所・席ロック/占有/backstop は逐語＝確定⑦）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_add_seat(p_check_id uuid, p_seat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_seat record; v_actor uuid; v_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 追加先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  -- 占有チェック（ロック下）: 主席 open（自伝票の主席もここで拒否）∪ 追加席
  if exists (select 1 from public.checks where seat_id = p_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_seat_id) then
    raise exception 'seat occupied';
  end if;
  -- ★0057(4): actor＝operator 優先
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑪ check_remove_seat（(1)(2)(3)＋v_org 置換1箇所・home seat ガードは逐語＝確定⑦）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_remove_seat(p_check_id uuid, p_seat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chk record; v_row record;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
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
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑫ print_enqueue（(1)(2)(3)(4)＋v_org 置換1箇所・二度押し/再発行/token は逐語＝確定②）
-- ══════════════════════════════════════════════════════════════
create or replace function public.print_enqueue(p_check_id uuid, p_pay_group text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chk    record;
  v_cfg    public.printer_config;
  v_exists public.print_jobs;
  v_actor  uuid;
  v_reprint boolean;
  v_token  text;
  v_id     uuid;
  v_org    uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  -- check_close 4枝の逐語（live 0039 改修後の姿）
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（print_enqueue 足す＝確定②）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'closed' then raise exception 'not closed'; end if;
  if p_pay_group is null or not exists (
    select 1 from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group
  ) then raise exception 'bad pay_group'; end if;

  select c.* into v_cfg from public.printer_config c where c.store_id = v_chk.store_id;
  if not found or not v_cfg.printer_enabled then raise exception 'printer disabled'; end if;

  -- 二度押しガード: 既存 queued/printing はそのまま返す（二重印刷封じ）
  select j.* into v_exists from public.print_jobs j
   where j.check_id = p_check_id and j.pay_group = p_pay_group
     and j.status in ('queued','printing')
   order by j.created_at limit 1;
  if found then
    return jsonb_build_object('job_id', v_exists.id,
                              'is_reprint', v_exists.is_reprint,
                              'already_queued', true);
  end if;

  -- 再発行判定（failed/canceled は除外＝刷り直しに「再発行」を出さない）
  v_reprint := exists (
    select 1 from public.print_jobs j
     where j.check_id = p_check_id and j.pay_group = p_pay_group
       and j.status in ('printed','queued','printing')
  );

  -- ★0057(4): actor＝operator 優先
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  v_token := encode(gen_random_bytes(12), 'hex');  -- 24hex（unique が物理 backstop）

  insert into public.print_jobs
    (org_id, store_id, check_id, pay_group, status, is_reprint, print_token, created_by)
  values
    (v_chk.org_id, v_chk.store_id, p_check_id, p_pay_group, 'queued', v_reprint, v_token, v_actor)
  returning id into v_id;

  perform public.audit_log_write('print_enqueue', 'print_jobs:' || v_id::text,
    null,
    jsonb_build_object('check_id', p_check_id, 'pay_group', p_pay_group,
                       'is_reprint', v_reprint),
    v_chk.store_id);

  return jsonb_build_object('job_id', v_id, 'is_reprint', v_reprint, 'already_queued', false);
end $$;

-- ══════════════════════════════════════════════════════════════
-- ⑬ bottle_keep_register（(1)(2)(3)・v_org 初期化を本文 coalesce 代入へ移動・v_role は kiosk で
--    null のまま＝role 腕全 false・kiosk 腕が受ける。顧客/商品検証は逐語＝確定②）
-- ══════════════════════════════════════════════════════════════
create or replace function public.bottle_keep_register(
  p_store_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note)
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note)
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $$;

-- ACL 注記: 本 mig は全て create or replace（同一署名）＝EXECUTE ACL は PostgreSQL 仕様で保持
--   （mig0053 と同根拠・再 revoke/grant 不要）。audit_log_write の内部専用 ACL（G3）も不変。

commit;
