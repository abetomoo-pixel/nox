-- 0148_carryover_referral_selfnorm_types.sql
-- 裁定272（Agoora 承認 2026-09-17）: 繰越の消費（272-1）＋R11 紹介料（272-2）＋R19 cast セルフ norm（272-3）＋
--   products.type／check_lines.kind の food／other 拡張（272-4）＋receivable_policy setter（272-5）＋名簿 A/B（272-6）。
-- 起草: 相談役ブロック 2026-09-17（CC 写経・パス 1）。写経元＝live の pg_get_functiondef（docs/tmp/0148_pre.md B-1・8 本）。
--   写経行はそのまま写し、変更点だけ行末コメント（★1〜★10）。裁定234（適用済み mig は書き換えない＝補正 mig を積む）・
--   教訓82（actor は既存 RPC の行を写経）・教訓84（pin の走査対象を保つ）。revoke／grant は 0146 流。
--
-- 貼付前 md5(prosrc)（docs/tmp/0148_pre.md B-1 ＋ ★6 の 2 本）:
--   payroll_adjustment_add    5ad4e4d4b2dbf9d4649e794cf25dd04e   （不触・写経元 ★3）
--   payroll_adjustment_delete 4c440d0e06398fe21a957dcfe6a12469   （不触・★2 の soft delete 判定＝hard delete）
--   check_add_line            8629536b0210942633af64bbd0c22b4e   （不触・写経元 ★5）
--   set_cast_norm             2a1c988683ef6bf68e175bd42fc12b28   （不触・写経元 ★7）
--   shift_wish_submit         b94ad31ef3be6a33050574f467dcc5db   （不触・写経元 ★7 actor 3 行）
--   set_store_okuri_mode      c0ca9e3eca19d3ae70657f2462008859   （不触・写経元 ★8）
--   set_store_tax_config      e711c9344666288f1f7c38590c2324a0   （不触・実列 update の型の参照）
--   payroll_run_create        401423b93b0a6eccb0e1ce0979bfbf43   （不触・draft は adjustment_add の判定行を写経＝run_create に raise 行は無い）
--   set_product               b07d034379b80c0dd36773af5e25159f   （★6 で CREATE OR REPLACE＝白名単 1 行のみ変更・md5 は変わる）
--   product_bulk_insert       cd2d113377d9b369bab5035a3e1ad0c3   （★6 で CREATE OR REPLACE＝白名単 1 行のみ変更・md5 は変わる）
--   check_dohan_add           552cfed3572a4bb07108370bbad24f61   （不触・★5 の idem 行・cast 検証行の写経元）
--   check_group_due           7114f3c303e90df4fc816df96a013b17   （★10 で CREATE OR REPLACE＝条件行 2 行のみ変更・md5 は変わる・内部専用＝4 ロール revoke）
--
-- 変更点（★・貼付順）:
--   ★1 payroll_adjustments に source（'manual'／'carryover'・既定 'manual'・CHECK）と carry_from_payslip_id（payslips FK・on delete set null）を追加
--   ★2 部分 unique payroll_adjustments_carryover_uidx (run_id, cast_id) where source='carryover'
--       （payroll_adjustment_delete は `delete from payroll_adjustments where id = p_id`＝hard delete → where 句に deleted 条件は足さない）
--   ★3 payroll_carryover_sync(p_run_id uuid) returns integer＝actor／org／manager 自店／draft 判定は payroll_adjustment_add L37〜80 を逐語。
--       前期＝to_char(to_date(period,'YYYY-MM') - interval '1 month','YYYY-MM')。前期 payslips.breakdown_json->'pay'->>'adjustOverflow'
--       （finalize L257 が (breakdown)||{ar,adv,okuri} で凍結＝pay は入力のまま）を int（null／'' は 0）。>0 は upsert（定額・源泉後
--       before_withholding=false・show_detail=true・理由「前期繰越」）、0／前期 payslip なしは同 run の carryover 行を削除。戻り値＝upsert＋削除の件数。
--   ★4 check_lines_kind_check を drop→同名で 8 値＋'referral','food','other'／products_type_check を drop→同名で 3 値＋'food','other'
--       （live の distinct＝check_lines.kind {bottle,champ,charge,discount,drink,set,time}／products.type {bottle,champ,drink}＝既存行は新 CHECK に違反しない）
--   ★5 check_add_referral＝check_add_line の冒頭〜role 判定〜status 判定を逐語・custom 分岐（L234〜240）の name／price 検証を p_memo／p_amount に写像・
--       kind='referral'・product_id null・qty 1・unit_price p_amount・idem＋cast 検証は check_dohan_add L33〜42 を逐語（外部紹介は p_cast_id null 可）。
--       ★5-idem 署名: p_idem_key uuid default null で確定（相談役 2026-09-17 夕・check_lines.idem_key は uuid＝dohan／shimei の逐語行に合わせる）。
--   ★6 set_product／product_bulk_insert を CREATE OR REPLACE（本体は live 逐語・白名単 in (...) 行に 'food','other' を足す＋
--       product_bulk_insert の by_type 集計に food／other の 2 キー（宣言 2・分岐 2・jsonb 2×2＝集計行を写経・★6 新規行））
--   ★7 set_cast_norm_self(p_period, p_days_target, p_dohan_target, p_sales_target, p_shimei_target)＝冒頭 3 行は shift_wish_submit L321〜323 逐語・
--       sys_norms='false' は 'norms off'・以後 set_cast_norm 本体を逐語（p_cast_id→v_cast・owner/manager 判定行は削除＝自分の行のみ）
--   ★8 set_store_receivable_policy(p_store_id, p_policy)＝set_store_okuri_mode の骨格（ガード・enum 検証・org 検証・owner 限定・audit）逐語＋実列 update
--   ★9 revoke／grant（0146 流）: 新 RPC 4 本＋★6 の 2 本
--   ★10 check_group_due を CREATE OR REPLACE（live 逐語 44 行・L20／L36 の `kind <> 'discount'` 条件行 2 箇所に `and kind <> 'referral'` を足すだけ）＝
--       紹介料は店が払う手当（裁定272 追補 2026-09-18・案 Q）→ 伝票合計・課税額（v_bx／v_bx10／v_bx8）から除外し cast の gross（referralTotal・client）にのみ載せる。
--       置き場＝★5 の直後（kind 追加 → referral 除外の順）。revoke は原 mig 0007_f1b_checks_rpc.sql 82 の 4 ロール逐語を再掲（grant なし＝内部専用）。
--       client の check-calc／receipt の鏡像（三面鏡）は手貼り後の client レーン。
--
-- 触らない（宣言）:
--   payroll_adjustment_add／delete・payroll_finalize／reopen／mark_paid・check_add_line・check_recalc・set_cast_norm・set_store_okuri_mode・
--   money-core 3 本・payroll_adjustments の既存 13 列／CHECK 3／index 4／policy／grant・stores の CHECK stores_receivable_policy_check（3 値のまま）・
--   client（pay.ts の referralTotal・preview route からの carryover_sync 呼出・anon-guard probe・名簿）は別レーン。
--
-- 忘れると赤になるもの（教訓84・pin の張り替え点＝手貼りと同じレーンで suite を改訂）:
--   - verify:nox-payroll-adjust 49 段: 列 13→15（pa(1-1)／(1-2) COLS）・CHECK 3→4（pa(1-3)・source CHECK）・index 4→5（pa(1-7) 名配列に
--     payroll_adjustments_carryover_uidx）。
--   - verify:nox-billing 段47-1: 新 RPC 4 本を名簿へ（'billing locked' あり＝A: check_add_referral（A1）・set_cast_norm_self（A7）・
--     set_store_receivable_policy（A8）／なし＝B(e): payroll_carryover_sync）＝対象 125→128・除外 116→117・全数 241→245・ゲート済み 125→128。
--   - verify:nox-anon-guard: probe 名簿に 4 本を追加（null 引数で BLOCKED）。verify:nox-grants G2b は自動（anon／PUBLIC に EXECUTE なし）。
--   - verify:nox-payroll B5 A2: RUN_RPCS の 3 本固定＝payroll_carryover_sync は列挙に入れない（272-6）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   -- 1) payroll_adjustments: 列 15（末尾 source, carry_from_payslip_id）・CHECK 4・index 5
--   select column_name, data_type, column_default from information_schema.columns
--     where table_schema='public' and table_name='payroll_adjustments' order by ordinal_position;                  -- 15 行
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid='public.payroll_adjustments'::regclass and contype='c' order by 1;                            -- 4 行（source_ck 含む）
--   select indexname, indexdef from pg_indexes where schemaname='public' and tablename='payroll_adjustments' order by 1;  -- 5 行（carryover_uidx ＝ WHERE (source = 'carryover'::text)）
--   -- 2) CHECK の逐語（food／other／referral）
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('check_lines_kind_check','products_type_check');
--   -- 3) 新 RPC 4 本＋★6 の 2 本: 署名・secdef・search_path・proacl（anon なし・PUBLIC なし）
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig, proacl from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('payroll_carryover_sync','check_add_referral','set_cast_norm_self',
--       'set_store_receivable_policy','set_product','product_bulk_insert') order by 1;                               -- 6 行
--   -- 4) 'billing locked' の有無（名簿 A/B）: referral／norm_self／receivable_policy＝t・carryover_sync＝f
--   select proname, prosrc like '%billing locked%' from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('payroll_carryover_sync','check_add_referral','set_cast_norm_self','set_store_receivable_policy') order by 1;
--   -- 5) 不触 8 本の md5 が貼付前と全一致（上の控え）
--   select proname, md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname in
--     ('payroll_adjustment_add','payroll_adjustment_delete','check_add_line','set_cast_norm','shift_wish_submit','set_store_okuri_mode',
--      'set_store_tax_config','payroll_run_create','check_dohan_add') order by 1;                                    -- 9 行（check_group_due は 5b）
--   -- 5b) ★10 check_group_due: 条件行 2 箇所に referral 除外・md5 が 7114f3c3… から変わる・proacl は {postgres=X/postgres} のまま（authenticated／service_role／anon／PUBLIC なし）
--   select proname, (length(prosrc) - length(replace(prosrc, 'kind <> ''referral''', ''))) / length('kind <> ''referral''') as n_referral, md5(prosrc), proacl
--     from pg_proc where pronamespace='public'::regnamespace and proname='check_group_due';                       -- n_referral=2
--   -- 6) ★6 は白名単行だけが変わったこと
--   select proname, prosrc like '%''food''%' and prosrc like '%''other''%' from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('set_product','product_bulk_insert');            -- t, t
--   -- 7) 既存行が新 CHECK に違反していない（drop→add の時点で違反があれば全体ロールバック＝ここは事後の確認）
--   select 'kind', string_agg(distinct kind, ',') from public.check_lines union all select 'type', string_agg(distinct type, ',') from public.products;
--   -- 8) payroll_adjustments の既存行は全て source='manual'・carry_from_payslip_id null
--   select source, count(*) from public.payroll_adjustments group by 1;
--   -- 9) 動作（JWT 要）＝suite 改訂版（payroll-adjust 49 段の張り替え＋新 suite）で実施。

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 payroll_adjustments: source／carry_from_payslip_id
-- ══════════════════════════════════════════════════════════════
alter table public.payroll_adjustments
  add column source text not null default 'manual'
    constraint payroll_adjustments_source_ck check (source in ('manual','carryover'));           -- ★1
alter table public.payroll_adjustments
  add column carry_from_payslip_id uuid null references public.payslips(id) on delete set null;   -- ★1

-- ══════════════════════════════════════════════════════════════
-- ★2 部分 unique（carryover 行は run×cast で 1 行・manual 行には掛からない）
--    payroll_adjustment_delete は `delete from payroll_adjustments where id = p_id`（hard delete）＝deleted 条件なし
-- ══════════════════════════════════════════════════════════════
create unique index payroll_adjustments_carryover_uidx
  on public.payroll_adjustments (run_id, cast_id) where source = 'carryover';                     -- ★2

-- ══════════════════════════════════════════════════════════════
-- ★3 payroll_carryover_sync(p_run_id) returns integer
--    写経元＝payroll_adjustment_add（actor／org／manager 自店／run 取得／draft 判定・insert 列並び・audit 6 引数）
-- ══════════════════════════════════════════════════════════════
create or replace function public.payroll_carryover_sync(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_period  text;                                   -- ★3 run.period 'YYYY-MM'
  v_prev    text;                                   -- ★3 前期 'YYYY-MM'
  v_ps      record;                                 -- ★3 前期 payslip 1 行
  v_up      integer := 0;                           -- ★3 upsert 件数
  v_del     integer := 0;                           -- ★3 削除件数
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  select store_id, status, period into v_store, v_status, v_period                           -- ★3 period を併読
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  v_prev := to_char(to_date(v_period, 'YYYY-MM') - interval '1 month', 'YYYY-MM');            -- ★3 前期（月跨ぎは to_date が吸収）

  -- ★3 (1) 前期 payslip（同 org・同 store・period=前期）の adjustOverflow>0 → carryover 行を upsert
  for v_ps in   -- ★3 新規行（写経元なし）
    select ps.id, ps.cast_id,   -- ★3 新規行（写経元なし）
           coalesce(nullif(ps.breakdown_json->'pay'->>'adjustOverflow', '')::integer, 0) as overflow   -- ★3 新規行（写経元なし）
      from payslips ps   -- ★3 新規行（写経元なし）
     where ps.org_id = v_org and ps.store_id = v_store and ps.period = v_prev   -- ★3 新規行（写経元なし）
  loop
    if v_ps.overflow > 0 then   -- ★3 新規行（写経元なし）
      insert into payroll_adjustments(
        org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
        before_withholding, show_detail, reason, created_by,   -- ★3 新規行（写経元なし）
        source, carry_from_payslip_id)                                                         -- ★3 列 2 本
      values (
        v_org, v_store, p_run_id, v_ps.cast_id, 'fixed',   -- ★3 新規行（写経元なし）
        v_ps.overflow,   -- ★3 新規行（写経元なし）
        null,
        false,                                                                                  -- ★3 源泉後（272-1）
        true,                                                                                   -- ★3 show_detail
        '前期繰越', v_actor,   -- ★3 新規行（写経元なし）
        'carryover', v_ps.id)   -- ★3 新規行（写経元なし）
      on conflict (run_id, cast_id) where source = 'carryover' do update                        -- ★3 対象 index＝★2
        set amount                = excluded.amount,   -- ★3 新規行（写経元なし）
            carry_from_payslip_id = excluded.carry_from_payslip_id,   -- ★3 新規行（写経元なし）
            created_by            = excluded.created_by;                                        -- ★3 updated 系列＝本表に updated_at は無い
      v_up := v_up + 1;   -- ★3 新規行（写経元なし）
    end if;
  end loop;

  -- ★3 (2) overflow が 0 または前期 payslip が無い cast の carryover 行を削除（冪等・hard delete＝payroll_adjustment_delete と同型）
  delete from payroll_adjustments a   -- ★3 新規行（写経元なし）
   where a.run_id = p_run_id and a.source = 'carryover'   -- ★3 新規行（写経元なし）
     and not exists (   -- ★3 新規行（写経元なし）
       select 1 from payslips ps   -- ★3 新規行（写経元なし）
        where ps.org_id = v_org and ps.store_id = v_store and ps.period = v_prev and ps.cast_id = a.cast_id   -- ★3 新規行（写経元なし）
          and coalesce(nullif(ps.breakdown_json->'pay'->>'adjustOverflow', '')::integer, 0) > 0);   -- ★3 新規行（写経元なし）
  get diagnostics v_del = row_count;   -- ★3 新規行（写経元なし）

  perform audit_log_write(
    'payroll_carryover_sync',   -- ★3 新規行（写経元なし）
    'payroll_runs:' || p_run_id::text,   -- ★3 新規行（写経元なし）
    null,
    jsonb_build_object('run_id', p_run_id, 'prev_period', v_prev,   -- ★3 新規行（写経元なし）
      'upserted', v_up, 'deleted', v_del),   -- ★3 新規行（写経元なし）
    v_store,
    '前期繰越');   -- ★3 新規行（写経元なし）

  return v_up + v_del;   -- ★3 新規行（写経元なし）
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★4 CHECK 拡張（drop→同名 add・既存行は違反しない＝ヘッダ 7)）
-- ══════════════════════════════════════════════════════════════
alter table public.check_lines drop constraint check_lines_kind_check;
alter table public.check_lines add constraint check_lines_kind_check
  check (kind in ('set','time','charge','drink','champ','bottle','custom','discount','referral','food','other'));   -- ★4 +referral,food,other
alter table public.products drop constraint products_type_check;
alter table public.products add constraint products_type_check
  check (type in ('drink','champ','bottle','food','other'));                                                        -- ★4 +food,other

-- ══════════════════════════════════════════════════════════════
-- ★5 check_add_referral（写経元＝check_add_line 冒頭〜status 判定・custom 分岐／check_dohan_add の idem・cast 検証）
-- ══════════════════════════════════════════════════════════════
create or replace function public.check_add_referral(p_check_id uuid, p_cast_id uuid, p_amount integer, p_memo text default null, p_idem_key uuid default null)   -- ★5-idem uuid（idem_key 列が uuid）
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chk record; v_id uuid; v_sort int;   -- ★5 新規行（写経元なし）
  v_name text;   -- ★5 新規行（写経元なし）
  v_org uuid;  -- ★0057(2)
  v_cast record; v_dup uuid;  -- ★0119 裁定100/102
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;                                   -- ★5 p_amount<=0 は raise
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
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
  -- ★0119 裁定102: 同キー再送は既存行を返す
  if p_idem_key is not null then
    select id into v_dup from public.check_lines where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- ★5 custom 分岐（check_add_line L234〜240）の写像: kind 固定 'referral'・name＝p_memo（空は '紹介料'）・price＝p_amount
  v_name := coalesce(nullif(trim(p_memo), ''), '紹介料');                                                            -- ★5
  if length(v_name) > 80 then raise exception 'bad name'; end if;                                                     -- ★5（L235 の上限 80）
  -- ★5 紹介者（自店 cast）は任意＝外部紹介は null。指定時の検証は check_dohan_add L40〜42 を逐語
  if p_cast_id is not null then                                                                                       -- ★5
    -- キャスト検証（同 org・同店・在籍）＝check_shimei_add と同型
    select c.id, c.store_id, c.is_active into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
    if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
    if not v_cast.is_active then raise exception 'inactive cast'; end if;
  end if;                                                                                                             -- ★5

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id, idem_key)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'referral', 'A',                                            -- ★5 kind 固定・product なし
          v_name, p_amount, 1, p_amount, null, v_sort, null, p_cast_id, p_idem_key)                                   -- ★5 qty 1・unit_price p_amount・fee_kind null
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_referral', 'check_lines:' || v_id::text, null,   -- ★5 新規行（写経元なし）
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★10 check_group_due（live 逐語・条件行 2 箇所に referral 除外＝紹介料は伝票合計・課税額に載せない・裁定272 追補）
--     写経元＝docs/tmp/q0918_live_check_group_due.sql（md5(prosrc) 7114f3c303e90df4fc816df96a013b17）。内部専用（check_recalc から呼ばれる）＝4 ロール revoke を再掲。
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount' and kind <> 'referral';   -- ★10 紹介料（店が払う手当）は伝票合計・課税額から除外（裁定272 追補）
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount';
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  -- ★mig0113: 外税（tax_excluded × taxable のみ）。内税/exempt は下の従来行＝1バイト不変。
  --   規則（設計書 v1 §3 細則）: 税率別に check_tax_round を1回ずつ（伝票×税率×1回＝T5）。
  --   discount は taxable_10 基底へ適用（clamp・8% への按分は F5）。サ料は taxable_10 基底（T6）。
  --   exempt/out_of_scope 行は税 0。TS 鏡像: receipt.ts / check-calc.ts（三面鏡・同時改修）。
  if v_pd = 'tax_excluded' and v_bts = 'taxable' then
    select coalesce(sum(line_total) filter (where tax_category = 'taxable_10'), 0)::int,
           coalesce(sum(line_total) filter (where tax_category = 'taxable_8'),  0)::int
      into v_bx10, v_bx8
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount' and kind <> 'referral';   -- ★10 紹介料（店が払う手当）は伝票合計・課税額から除外（裁定272 追補）
    v_sv     := round(v_net * v_rate / 100.0)::int;                       -- サ料（従来と同式）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + round(v_net * v_rate / 100.0), v_unit, v_mode);
end $function$;

revoke execute on function public.check_group_due(uuid, text) from public, anon, authenticated, service_role;   -- ★10 原 mig 0007_f1b_checks_rpc.sql 82 逐語（内部専用・grant なし）

-- ══════════════════════════════════════════════════════════════
-- ★6 set_product／product_bulk_insert（live 逐語・白名単 1 行のみ）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_product(p_id uuid, p_store_id uuid, p_type text, p_category text, p_name text, p_price integer, p_cost integer, p_back_mode text, p_back_value integer, p_unit4 jsonb, p_hon_pt integer, p_is_active boolean, p_reorder_point integer DEFAULT NULL::integer, p_category_id uuid DEFAULT NULL::uuid, p_back_exempt_from_split boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner    uuid;
  v_id       uuid;
  v_before   jsonb;
  v_after    jsonb;
  v_key      text;
  v_num      numeric;
  v_old_cost integer;
  v_exempt   boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_type not in ('drink','champ','bottle','food','other') then raise exception 'bad type'; end if;   -- ★6 +food,other
  if p_price is null or p_price < 0 then raise exception 'bad price'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'bad cost'; end if;
  if p_back_mode not in ('rate','unit4') then raise exception 'bad back_mode'; end if;
  if p_back_mode = 'rate' and (p_back_value is null or p_back_value < 0) then raise exception 'bad back_value'; end if;
  -- unit4 は F2 給与計算の入力素材＝入口で値検証（4キーとも number・0以上・整数）
  if p_back_mode = 'unit4' then
    if p_unit4 is null then raise exception 'bad unit4'; end if;
    foreach v_key in array array['hon','jonai','dohan','free'] loop
      if jsonb_typeof(p_unit4 -> v_key) is distinct from 'number' then raise exception 'bad unit4'; end if;
      v_num := (p_unit4 ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad unit4'; end if;
    end loop;
  end if;
  if p_hon_pt is null or p_hon_pt < 0 then raise exception 'bad hon_pt'; end if;
  -- ★mig0069: キャストドリンク指定（按分除外）。null は false 扱い＝boolean を三値にしない
  v_exempt := coalesce(p_back_exempt_from_split, false);
  -- 按分ループを通らない＝hon_pt の分配経路も同時に失われるため、両立を入口で拒否
  -- （products_exempt_hon_pt_chk と二段。生の制約違反を UI に出さないための日本語化可能なエラー）
  if v_exempt and p_hon_pt <> 0 then raise exception 'exempt requires hon_pt 0'; end if;
  -- 発注点（在庫台帳 v1・null=しきい無し）
  if p_reorder_point is not null and p_reorder_point < 0 then raise exception 'bad reorder_point'; end if;
  -- カテゴリ（0063・null=未分類。同 org かつ同一店のカテゴリのみ許可＝クロス店割当遮断）
  if p_category_id is not null then
    if not exists (select 1 from public.product_categories pc
                    where pc.id = p_category_id
                      and pc.org_id = public.auth_org_id()
                      and pc.store_id = p_store_id) then
      raise exception 'bad category';
    end if;
  end if;
  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.products
      (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point, category_id, back_exempt_from_split)
    values
      (public.auth_org_id(), p_store_id, p_type, p_category, trim(p_name), p_price,
       p_back_mode, p_back_value, p_unit4, p_hon_pt, coalesce(p_is_active, true), p_reorder_point, p_category_id, v_exempt)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(p) into v_before from public.products p
      where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    -- 監査の形を #40 前と揃える：cost キーを合成（過去 audit 行との互換）
    select c.cost into v_old_cost from public.product_costs c where c.product_id = p_id;
    v_before := v_before || jsonb_build_object('cost', v_old_cost);
    update public.products
      set type = p_type, category = p_category, name = trim(p_name), price = p_price,
          back_mode = p_back_mode, back_value = p_back_value, unit4_json = p_unit4,
          hon_pt = p_hon_pt, is_active = coalesce(p_is_active, true), reorder_point = p_reorder_point,
          category_id = p_category_id, back_exempt_from_split = v_exempt
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  -- 原価は別テーブル（台帳#40）。null は「原価なし」＝行を消す（products.cost の null と同義）。
  if p_cost is null then
    delete from public.product_costs where product_id = v_id;
  else
    insert into public.product_costs (product_id, org_id, store_id, cost)
    values (v_id, public.auth_org_id(), p_store_id, p_cost)
    on conflict (product_id) do update
      set cost = excluded.cost, org_id = excluded.org_id, store_id = excluded.store_id;
  end if;

  select to_jsonb(p) into v_after from public.products p where p.id = v_id;
  v_after := v_after || jsonb_build_object('cost', p_cost);
  perform public.audit_log_write('set_product', 'products:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.product_bulk_insert(p_store_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_store  uuid := public.auth_store_id();
  v_n      int;
  v_item   jsonb;
  v_name   text;
  v_type   text;
  v_num    numeric;
  v_cat    text;
  v_cat_names text[] := '{}';
  v_cat_lc    text[] := '{}';
  v_created   text[] := '{}';
  v_names     text[] := '{}';
  v_map    jsonb := '{}'::jsonb;   -- lower(カテゴリ名) -> id
  v_cat_id uuid;
  v_active boolean;
  v_sort   int;
  v_pid    uuid;
  v_drink  int := 0;
  v_champ  int := 0;
  v_bottle int := 0;
  v_food   int := 0;   -- ★6 新規行（写経元＝上の v_bottle 行）
  v_other  int := 0;   -- ★6 新規行（写経元＝上の v_bottle 行）
  i        int;
begin
  -- 二重防御①: 冒頭 null guard
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 認可: owner ∨ manager 自店（set_product と同型・org 照合は両ロールで明示）
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_store is null or p_store_id is distinct from v_store then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 形と上限
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bad items';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 then raise exception 'bad items'; end if;
  if v_n > 300 then raise exception 'too many items'; end if;

  -- ===== 検証ループ（DML 一切なし・全件検証し切ってから書く）=====
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;

    v_name := trim(coalesce(v_item ->> 'name', ''));
    if length(v_name) < 1 or length(v_name) > 80 then
      raise exception 'bad name';
    end if;

    v_type := v_item ->> 'type';
    if v_type is null or v_type not in ('drink', 'champ', 'bottle', 'food', 'other') then   -- ★6 +food,other
      raise exception 'bad type';
    end if;

    if v_item -> 'price' is null
       or jsonb_typeof(v_item -> 'price') <> 'number' then
      raise exception 'bad price';
    end if;
    v_num := (v_item ->> 'price')::numeric;
    if v_num < 0 or v_num <> trunc(v_num) then
      raise exception 'bad price';
    end if;

    if (v_item ? 'cost') and jsonb_typeof(v_item -> 'cost') <> 'null' then
      if jsonb_typeof(v_item -> 'cost') <> 'number' then
        raise exception 'bad cost';
      end if;
      v_num := (v_item ->> 'cost')::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then
        raise exception 'bad cost';
      end if;
    end if;

    -- カテゴリ: 空/null 可（未分類）。非空は distinct 収集（lower 比較）
    v_cat := nullif(trim(coalesce(v_item ->> 'category', '')), '');
    if v_cat is not null and not (lower(v_cat) = any (v_cat_lc)) then
      v_cat_names := array_append(v_cat_names, v_cat);
      v_cat_lc    := array_append(v_cat_lc, lower(v_cat));
    end if;
  end loop;

  if coalesce(array_length(v_cat_names, 1), 0) > 30 then
    raise exception 'too many categories';
  end if;

  -- ===== カテゴリ解決（unique (store_id, lower(name)) 前提）=====
  foreach v_cat in array v_cat_names loop
    v_cat_id := null;
    select c.id, c.is_active into v_cat_id, v_active
      from public.product_categories c
     where c.store_id = p_store_id
       and lower(c.name) = lower(v_cat);
    if v_cat_id is not null then
      -- ★無効カテゴリと同名: 暗黙の再利用も再有効化もしない（裁定1）
      if not v_active then raise exception 'duplicate name'; end if;
    else
      select coalesce(max(c.sort_order), 0) + 1 into v_sort
        from public.product_categories c
       where c.store_id = p_store_id;
      -- _r2: org_id を追加（NOT NULL・default なし）
      insert into public.product_categories (org_id, store_id, name, sort_order)
      values (v_org, p_store_id, v_cat, v_sort)
      returning id into v_cat_id;
      v_created := array_append(v_created, v_cat);
    end if;
    v_map := v_map || jsonb_build_object(lower(v_cat), v_cat_id::text);
  end loop;

  -- ===== INSERT ループ（既定値は裁定4）=====
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;
    v_name := trim(v_item ->> 'name');
    v_type := v_item ->> 'type';
    v_cat  := nullif(trim(coalesce(v_item ->> 'category', '')), '');
    v_cat_id := case when v_cat is null then null
                     else (v_map ->> lower(v_cat))::uuid end;

    insert into public.products
      (org_id, store_id, category_id, name, type, price,
       back_mode, back_value, hon_pt, back_exempt_from_split, reorder_point)
    values
      (v_org, p_store_id, v_cat_id, v_name, v_type,
       (v_item ->> 'price')::integer,
       'rate', 0, 0, false, null)
    returning id into v_pid;

    if (v_item ? 'cost') and jsonb_typeof(v_item -> 'cost') = 'number' then
      -- _r2: org_id / store_id を追加（NOT NULL・default なし）
      insert into public.product_costs (org_id, store_id, product_id, cost)
      values (v_org, p_store_id, v_pid, (v_item ->> 'cost')::integer);
    end if;

    v_names := array_append(v_names, v_name);
    if    v_type = 'drink' then v_drink  := v_drink  + 1;
    elsif v_type = 'champ' then v_champ  := v_champ  + 1;
    elsif v_type = 'food'  then v_food   := v_food   + 1;   -- ★6 新規行（写経元＝上の champ 行）
    elsif v_type = 'other' then v_other  := v_other  + 1;   -- ★6 新規行（写経元＝上の champ 行）
    else                        v_bottle := v_bottle + 1;
    end if;
  end loop;

  -- ===== audit: 1操作1行（裁定2・PII なし）=====
  -- _r2: live 署名 (p_action, p_target, p_before, p_after, p_store_id) に整合。
  --      1操作1行のため単一 target は無い＝p_target/p_before は default(null)。
  perform public.audit_log_write(
    p_action   => 'product_bulk_insert',
    p_after    => jsonb_build_object(
                    'product_count',      v_n,
                    'by_type',            jsonb_build_object(
                                            'drink', v_drink, 'champ', v_champ,
                                            'bottle', v_bottle,
                                            'food', v_food, 'other', v_other),   -- ★6 新規行（写経元＝上の 'drink', v_drink 行）
                    'categories_created', to_jsonb(coalesce(v_created, '{}'::text[])),
                    'products',           to_jsonb(v_names)),
    p_store_id => p_store_id
  );

  return jsonb_build_object(
    'products_created',   v_n,
    'categories_created', to_jsonb(coalesce(v_created, '{}'::text[])),
    'by_type',            jsonb_build_object(
                            'drink', v_drink, 'champ', v_champ,
                            'bottle', v_bottle,
                            'food', v_food, 'other', v_other)   -- ★6 新規行（写経元＝上の 'drink', v_drink 行）
  );
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★7 set_cast_norm_self（actor＝shift_wish_submit L321〜323・本体＝set_cast_norm）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_cast_norm_self(p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid; v_row record;                        -- ★7 shift_wish_submit の宣言
  v_cast_org   uuid;
  v_cast_store uuid;
  v_id         uuid;
  v_before     jsonb;
  v_after      jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if; -- cast セルフ専用
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_days_target is null or p_days_target < 0 then raise exception 'bad days_target'; end if;
  if p_dohan_target is null or p_dohan_target < 0 then raise exception 'bad dohan_target'; end if;
  if p_sales_target is null or p_sales_target < 0 then raise exception 'bad sales_target'; end if;
  if p_shimei_target is null or p_shimei_target < 0 then raise exception 'bad shimei_target'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  if coalesce((select settings_json->>'sys_norms' from public.stores where id = v_row.store_id), '') = 'false' then   -- ★7 新規行（写経元なし）
    raise exception 'norms off';                                                                  -- ★7 店の sys_norms='false' は拒否（272-3）
  end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = v_cast;      -- ★7 p_cast_id→v_cast
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- ★7 owner/manager 判定行（set_cast_norm L283〜286）は削除＝自分の行のみ（cast_id は auth_cast_id() 由来・引数で他人を指せない）

  select to_jsonb(n) into v_before from public.cast_norms n
    where n.cast_id = v_cast and n.period = p_period;                                             -- ★7 p_cast_id→v_cast
  insert into public.cast_norms
    (org_id, store_id, cast_id, period, days_target, dohan_target, sales_target, shimei_target)
  values
    (v_cast_org, v_cast_store, v_cast, p_period, p_days_target, p_dohan_target, p_sales_target, p_shimei_target)   -- ★7 p_cast_id→v_cast
  on conflict (cast_id, period) do update
    set days_target   = excluded.days_target,
        dohan_target  = excluded.dohan_target,
        sales_target  = excluded.sales_target,
        shimei_target = excluded.shimei_target,
        store_id      = excluded.store_id
  returning id into v_id;
  select to_jsonb(n) into v_after from public.cast_norms n where n.id = v_id;
  perform public.audit_log_write('set_cast_norm_self', 'cast_norms:' || v_id::text, v_before, v_after, v_cast_store);   -- ★7 action 名
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★8 set_store_receivable_policy（骨格＝set_store_okuri_mode・実列 update）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_store_receivable_policy(p_store_id uuid, p_policy text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_policy is null or p_policy not in ('disabled','customer_only','cast_liability_allowed') then raise exception 'bad receivable_policy'; end if;   -- ★8 CHECK 3 値逐語
  select id, org_id, receivable_policy into v_store from public.stores where id = p_store_id;                       -- ★8 settings_json→receivable_policy
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_prev := v_store.receivable_policy;                                                                               -- ★8 実列の現値
  update public.stores
     set receivable_policy = p_policy                                                                                -- ★8 実列 update
   where id = p_store_id;

  perform public.audit_log_write('set_store_receivable_policy', 'stores:' || p_store_id::text,   -- ★8 新規行（写経元なし）
    jsonb_build_object('receivable_policy', v_prev), jsonb_build_object('receivable_policy', p_policy), p_store_id);   -- ★8 action 名・キー名
end $$;

-- ══════════════════════════════════════════════════════════════
-- ★9 revoke／grant（0146 流）
-- ══════════════════════════════════════════════════════════════
revoke all on function public.payroll_carryover_sync(uuid) from public, anon;
grant execute on function public.payroll_carryover_sync(uuid) to authenticated, service_role;
revoke all on function public.check_add_referral(uuid,uuid,integer,text,uuid) from public, anon;
grant execute on function public.check_add_referral(uuid,uuid,integer,text,uuid) to authenticated, service_role;
revoke all on function public.set_cast_norm_self(text,integer,integer,bigint,integer) from public, anon;
grant execute on function public.set_cast_norm_self(text,integer,integer,bigint,integer) to authenticated, service_role;
revoke all on function public.set_store_receivable_policy(uuid,text) from public, anon;
grant execute on function public.set_store_receivable_policy(uuid,text) to authenticated, service_role;
revoke all on function public.set_product(uuid,uuid,text,text,text,integer,integer,text,integer,jsonb,integer,boolean,integer,uuid,boolean) from public, anon;
grant execute on function public.set_product(uuid,uuid,text,text,text,integer,integer,text,integer,jsonb,integer,boolean,integer,uuid,boolean) to authenticated, service_role;
revoke all on function public.product_bulk_insert(uuid,jsonb) from public, anon;
grant execute on function public.product_bulk_insert(uuid,jsonb) to authenticated, service_role;

commit;
