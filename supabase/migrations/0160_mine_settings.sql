-- 0160_mine_settings.sql
-- マイグレーション名: 0160_mine_settings（裁定326＋追補1・起票95・96）
-- 生成器: docs/tmp/gen_0160.mjs（手打ち禁止）。写経元＝docs/tmp/0160_live.json（q0930_live_0160.mjs が pg_get_functiondef で dump した live 全文・CR 除去）。
--   既存関数は ★ の置換点以外 1 バイト不変（299-11）。新設・署名変更はこのテンプレート内に手書き・期待 md5 は生成物から算出。
--
-- 写経元 live md5（2026-09-30・prosrc の CR 除去・先頭 8 桁）→ 本 mig 適用後の期待 md5:
--   shift_wish_decide        6d85391e → 4c8c7d6b
--   shift_auto_apply         a2dafda0 → 55cbb0e8
--   staff_pattern_effective  12c94f80 → a65c716d
--   demo_org_reset           7b6070a6 → a331cdcd
--   shift_wish_submit        d1a57f5c（3 引数）→ drop・4 引数（p_kind default 'work'）で再作成 4afdf603
--   新設 7 本: set_cast_quota 1987d03d／reservation_request f0c51a0a／reservation_decide a0088416／set_store_mine_settings 5aaecb0f／notice_mark_read b1329e24／staff_pattern_disable cb1d4a34／staff_pattern_enable e768f710
--   削除 1 本: set_cast_norm_self（cfde419e・revoke 4 ロール → drop）
--   不触の控え（適用後も不変であること）: set_cast_norm 4fc3ed4b／reservation_create 1d45f0f1／reservation_set_status 4c3123db／reservation_update 3542fea6／customer_list_summary ab424336／
--     set_store_pay_time_basis 7b8e7fb1／set_store_okuri_mode 71e07a1e／set_store_profile 4f2e9f82／staff_pattern_set c7abb2c7／staff_pattern_delete 0385bfe8／staff_shift_gate 14d4ae96／
--     staff_shift_can_manage f8a2d6c8／notice_create 3643eae2／shift_wish_withdraw 16a70c2e／get_cast_ranking 348a25ce／get_cast_sales eaec39a4／billing_writable_of 927fb270／audit_log_write 182eba3a
--
-- 器（裁定326-9＋追補1・便 D160 ★1〜★8）:
--   ★1 【326-3】cast_quotas（org／store／cast／month date（月初・CHECK day=1）／hon／jonai／dohan／sales int null 可・≥0）・unique(store_id, cast_id, month)・FK cascade・
--        RLS select＝owner／manager 自店・cast 本人・書込は RPC のみ。set_cast_quota(p_store_id, p_cast_id, p_month, p_hon, p_jonai, p_dohan, p_sales)＝upsert・owner／manager 自店・'bad cast'・'bad month'・'bad quota'・audit。ゲート内蔵（A）。
--   ★2 【326-3／追補1-2】set_cast_norm_self（0148）を revoke 4 ロール → drop。cast_norms 表・set_cast_norm・読取は不変。
--   ★3 【326-4／追補1-1・5】reservations: status_chk に 'pending'／'rejected'・+requested_by_cast（casts・set null）／rejected_reason／decided_by（users）／decided_at。
--        reservation_request(p_store_id, p_customer_id, p_at, p_kind 'hon'|'dohan')＝cast セルフ（自店・担当客のみ 'bad customer'）→ status 'pending'・ゲート内蔵（reservation_create と同区分 A3）。
--        reservation_decide(p_reservation_id, p_decision 'approve'|'reject', p_reason)＝owner／manager 自店／staff can_crm（reservation_create と同じ）・pending 以外 'not pending'・approve→'booked'／reject→'rejected'＋理由。
--        既存の /mine と店側の読取（status='booked' 絞り）は無改変＝pending／rejected は出ない。
--   ★4 【326-7／追補1-3】shift_wishes: +kind（'work'／'off'・既定 'work'）・start_hm／end_hm を null 可にし hm_kind_ck（work＝形式必須／off＝null）。shift_wish_submit を 4 引数（p_kind default 'work'）で作り直し（旧 3 引数は drop＝既存呼出は既定で同値）。
--        shift_wish_decide／shift_auto_apply は 'off' の wish を accept／自動配置できない（'off wish'）＝reject は可。
--   ★5 【326-1／326-7／追補1-4・起票96】set_store_mine_settings(p_store_id, p_settings jsonb)＝owner／manager 自店・8 キー白名単＋enum 検証（'bad key'／'bad <key>'）・settings_json に merge・audit。set_store_profile は不変。
--        payslip_visibility off|net_only|detail・drink_claim off|on・punch_correction_request off|on・ranking off|on・ranking_show_others off|on・reservation_request on|off・shift_request_mode shift|off_only・contract_ack boolean（T6 の記録＝起票96）。
--   ★6 【326-6】cast_notice_reads(cast_id, notice_id, read_at) PK(cast_id, notice_id)・FK cascade・RLS＝cast 本人 select（owner／manager 自店も select）。notice_mark_read(p_notice_id)＝cast セルフ・自店のお知らせ（audience all|cast）・冪等 upsert。非ゲート（B）。
--   ★7 【起票95】staff_shift_patterns +disabled_from date null。staff_pattern_disable(p_pattern_id, p_from)／staff_pattern_enable(p_pattern_id)＝owner／manager 自店（staff_shift_can_manage）・audit・ゲート内蔵（A）。
--        読取側＝staff_pattern_effective（内部・staff_shift_propose／staff_wish_set が呼ぶ）に「disabled_from is null or disabled_from > p_biz_date」を足す（★起草判断＝一覧の client は client 便）。
--   ★8 【326-9】demo_org_reset: c_wipe／c_load に cast_quotas（casts より先に消し・後に入れる）・cast_notice_reads（casts と notices の両方より先に消し＝先頭群・両方の後に入れる＝末尾群）。他は 1 バイト不変。
--   ★9 revoke／grant（新設 7 本・再作成 4 本は live の proacl を再掲）。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）:
--   関数 290 → 296（新設 7・削除 1）。課金ゲート名簿 A +5（set_cast_quota／set_store_mine_settings／staff_pattern_disable／staff_pattern_enable＝A8 店設定・reservation_request／reservation_decide＝A3）−1（set_cast_norm_self）＝A 149→154・B +1（notice_mark_read＝B(f)）＝141→142・全数 296。
--   表 79 → 81（cast_quotas・cast_notice_reads）。'billing locked' 149 → 155・挿入行の形 149 → 155・述語参照 150 → 156。
--   pin が変わる suite: grants（TABLES +2・G4d +7・G9 0160）／anon-guard（probe +7・set_cast_norm_self の probe を撤去）／billing（名簿）／cast-norm-self（段ごと張替え＝drop）／rls（reservations・shift_wishes の列）／
--   customers-keep ck(5-1)（c_wipe 78・c_load 77）／demo-reset dr(0-2)（77 表）／shift-deep（wish の hm＝'work' 不変・golden 55233 不変）／store-systems ss(4-0) 不変（白名単 26）／0158 suite s-3／t-1（関数 296）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に）: (1) proof (2) md5 12 本（再作成 5＋新設 7） (3) 不触 3 本 (4) proacl 12 本 (5) 表 2（列数）と reservations／shift_wishes／staff_shift_patterns の列数 (6) 関数 296・表 81。
begin;

-- ★1 cast_quotas ＋ set_cast_quota
create table if not exists public.cast_quotas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  cast_id    uuid not null references public.casts(id) on delete cascade,
  month      date not null,
  hon        integer null check (hon is null or hon >= 0),
  jonai      integer null check (jonai is null or jonai >= 0),
  dohan      integer null check (dohan is null or dohan >= 0),
  sales      integer null check (sales is null or sales >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cast_quotas_month_first_ck check (extract(day from month) = 1),
  constraint cast_quotas_uq unique (store_id, cast_id, month)
);
create index if not exists cast_quotas_store_month_idx on public.cast_quotas (store_id, month);
alter table public.cast_quotas enable row level security;
drop policy if exists cast_quotas_select on public.cast_quotas;
create policy cast_quotas_select on public.cast_quotas for select to authenticated
  using (org_id = public.auth_org_id()
         and ((public.auth_role() = 'owner')
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())
              or (public.auth_role() = 'cast' and cast_id = public.auth_cast_id())));
revoke all on table public.cast_quotas from public, anon, authenticated;
grant select on table public.cast_quotas to authenticated;

create or replace function public.set_cast_quota(p_store_id uuid, p_cast_id uuid, p_month date, p_hon integer, p_jonai integer, p_dohan integer, p_sales integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_id    uuid;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'bad month'; end if;   -- ★1 月初（'YYYY-MM-01'）だけ
  if (p_hon is not null and p_hon < 0) or (p_jonai is not null and p_jonai < 0) or (p_dohan is not null and p_dohan < 0) or (p_sales is not null and p_sales < 0) then raise exception 'bad quota'; end if;
  if not exists (select 1 from public.casts c where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id) then raise exception 'bad cast'; end if;
  select to_jsonb(q) into v_before from public.cast_quotas q where q.store_id = p_store_id and q.cast_id = p_cast_id and q.month = p_month;
  insert into public.cast_quotas (org_id, store_id, cast_id, month, hon, jonai, dohan, sales)
  values (v_org, p_store_id, p_cast_id, p_month, p_hon, p_jonai, p_dohan, p_sales)
  on conflict (store_id, cast_id, month) do update
    set hon = excluded.hon, jonai = excluded.jonai, dohan = excluded.dohan, sales = excluded.sales, updated_at = now()
  returning id into v_id;
  perform public.audit_log_write('set_cast_quota', 'cast_quotas:' || v_id::text, v_before,
    (select to_jsonb(q) from public.cast_quotas q where q.id = v_id), p_store_id);
  return v_id;
end $$;

-- ★2 set_cast_norm_self を撤去（cast の自己設定＝326-3 で廃止・cast_norms と set_cast_norm は不変）
revoke all on function public.set_cast_norm_self(text, integer, integer, bigint, integer) from public, anon, authenticated, service_role;
drop function public.set_cast_norm_self(text, integer, integer, bigint, integer);

-- ★3 reservations: status +2・列 +4・reservation_request／reservation_decide
alter table public.reservations drop constraint if exists reservations_status_chk;
alter table public.reservations add constraint reservations_status_chk
  check (status in ('booked','visited','no_show','cancelled','pending','rejected'));   -- ★3 0160（326-4）: +pending／rejected（'booked'＝承認済み）
alter table public.reservations add column if not exists requested_by_cast uuid null references public.casts(id) on delete set null;
alter table public.reservations add column if not exists rejected_reason text null;
alter table public.reservations add column if not exists decided_by uuid null references public.users(id);
alter table public.reservations add column if not exists decided_at timestamptz null;

create or replace function public.reservation_request(p_store_id uuid, p_customer_id uuid, p_at timestamptz, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_cast  uuid := public.auth_cast_id();
  v_row   record;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if v_cast is null then raise exception 'no cast for caller'; end if;                      -- ★3 cast セルフ専用
  select c.org_id, c.store_id, c.user_id, c.is_active into v_row from public.casts c where c.id = v_cast;
  if v_row.org_id is null or v_row.org_id <> public.auth_org_id() or v_row.store_id <> p_store_id or not v_row.is_active then raise exception 'forbidden'; end if;
  v_org := v_row.org_id;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;   -- ★3 reservation_create と同区分（A3）
  if p_at is null then raise exception 'bad reserved_at'; end if;
  if p_kind is null or p_kind not in ('hon','dohan') then raise exception 'bad kind'; end if;
  if public.reservation_is_closed_day(p_store_id, p_at) then raise exception 'closed day'; end if;
  -- ★3 追補1-5: 自分の担当客だけ（customer_list_summary の cast 分岐＝cu.cast_id = v_cast と同じ判定）
  if p_customer_id is null or not exists (
    select 1 from public.customers cu where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id and cu.cast_id = v_cast and cu.is_active
  ) then
    raise exception 'bad customer';
  end if;
  insert into public.reservations (org_id, store_id, customer_id, cast_id, reserved_at, nom_type, status, requested_by_cast, created_by)
  values (v_org, p_store_id, p_customer_id, v_cast, p_at, p_kind, 'pending', v_cast, v_row.user_id)
  returning id into v_id;
  perform public.audit_log_write('reservation_request', 'reservations:' || v_id::text, null,
    (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $$;

create or replace function public.reservation_decide(p_reservation_id uuid, p_decision text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_r      record;
  v_actor  uuid;
  v_before jsonb;
  v_reason text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_decision is null or p_decision not in ('approve','reject') then raise exception 'bad decision'; end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is not null and length(v_reason) > 200 then raise exception 'bad reason'; end if;
  select r.id, r.org_id, r.store_id, r.status into v_r from public.reservations r where r.id = p_reservation_id;
  if v_r.id is null or v_r.org_id <> v_org then raise exception 'forbidden'; end if;
  -- ★3 追補1-1: 承認者＝reservation_create と同じゲート（owner／manager 自店／staff can_crm・can_register は含めない）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_r.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_r.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;
  if v_r.status <> 'pending' then raise exception 'not pending'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  select to_jsonb(r) into v_before from public.reservations r where r.id = p_reservation_id;
  update public.reservations
     set status = case when p_decision = 'approve' then 'booked' else 'rejected' end,
         rejected_reason = case when p_decision = 'reject' then v_reason else null end,
         decided_by = v_actor, decided_at = now(), updated_at = now()
   where id = p_reservation_id;
  perform public.audit_log_write('reservation_decide', 'reservations:' || p_reservation_id::text, v_before,
    (select to_jsonb(r) from public.reservations r where r.id = p_reservation_id), v_r.store_id, v_reason);
  return p_reservation_id;
end $$;

-- ★4 shift_wishes: +kind・hm を kind で条件付け・submit を 4 引数で再作成・decide／auto_apply は 'off' を accept しない
alter table public.shift_wishes add column if not exists kind text not null default 'work';
alter table public.shift_wishes drop constraint if exists shift_wishes_kind_check;
alter table public.shift_wishes add constraint shift_wishes_kind_check check (kind in ('work','off'));
alter table public.shift_wishes alter column start_hm drop not null;
alter table public.shift_wishes alter column end_hm drop not null;
alter table public.shift_wishes drop constraint if exists shift_wishes_start_hm_check;
alter table public.shift_wishes drop constraint if exists shift_wishes_end_hm_check;
alter table public.shift_wishes drop constraint if exists shift_wishes_hm_kind_ck;
alter table public.shift_wishes add constraint shift_wishes_hm_kind_ck
  check ((kind = 'work' and start_hm is not null and end_hm is not null and start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_hm ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$')
      or (kind = 'off' and start_hm is null and end_hm is null));   -- ★4 0160（326-7）: work＝時刻必須（旧 2 CHECK と同じ形式）／off＝時刻 null

drop function public.shift_wish_submit(date, text, text);   -- ★4 署名変更（p_kind を足す）＝旧 3 引数は drop（既存呼出は既定 'work' で同値）
create or replace function public.shift_wish_submit(p_date date, p_start_hm text, p_end_hm text, p_kind text default 'work')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid; v_row record; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if; -- cast セルフ専用
  if p_date is null then raise exception 'bad date'; end if;
  if p_kind is null or p_kind not in ('work','off') then raise exception 'bad kind'; end if;   -- ★4 0160（326-7）
  if p_kind = 'work' then
    if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
    if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  elsif p_start_hm is not null or p_end_hm is not null then
    raise exception 'bad time';                                                              -- ★4 'off' は時刻なし
  end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  -- ★B-5②: 定休日ハード拒否（date=営業日そのもの・時間外は拒否しない=経営側 UI 警告・未設定は通す）
  if public.shift_is_closed_day(v_row.store_id, p_date) then
    raise exception 'closed day';
  end if;
  -- ★0103 裁定43: 提出可能日 = 自店の open 期間内のみ（open 期間が無ければ fail-closed）。締切は表示のみ（SD-6）
  if not exists (select 1 from public.shift_periods p
                  where p.store_id = v_row.store_id and p.status = 'open'
                    and p_date between p.start_date and p.end_date) then
    raise exception 'period_not_open';
  end if;
  -- ★0103: 同一 cast・同一 date の live wish（pending/accepted）は1件。index shift_wishes_cast_date_live_uidx が最終防衛
  if exists (select 1 from public.shift_wishes w
              where w.cast_id = v_cast and w.date = p_date and w.status in ('pending','accepted')) then
    raise exception 'duplicate wish';
  end if;
  insert into public.shift_wishes (org_id, store_id, cast_id, date, start_hm, end_hm, kind)
  values (v_row.org_id, v_row.store_id, v_cast, p_date, p_start_hm, p_end_hm, p_kind)
  returning id into v_id;
  perform public.audit_log_write('shift_wish_submit', 'shift_wishes:' || v_id::text, null,
    (select to_jsonb(w) from public.shift_wishes w where w.id = v_id), v_row.store_id);
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.shift_wish_decide(p_wish_id uuid, p_accept boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  if p_accept and v_wish.kind = 'off' then raise exception 'off wish'; end if;   -- ★4 0160（326-7）: 休み希望はシフト案にならない（reject は可）
  -- ★B-5②: accept のみ定休日ハード拒否（提出後に定休日設定された競合の防波堤・reject は定休日でも可・wish は pending のまま）
  if p_accept and public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
    raise exception 'closed day';
  end if;
  -- ★0103 SD-9: accept は同日既存 shift があれば拒否（wish は pending のまま）
  if p_accept and exists (select 1 from public.shifts s
                           where s.cast_id = v_wish.cast_id and s.date = v_wish.date) then
    raise exception 'duplicate';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.shift_wishes
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = p_wish_id;
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
  perform public.audit_log_write('shift_wish_decide', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish),
    jsonb_build_object(
      'wish', (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id),
      'generated_shift_id', v_shift),
    v_wish.store_id);
  return v_shift; -- reject 時は null
end $function$;

CREATE OR REPLACE FUNCTION public.shift_auto_apply(p_period_id uuid, p_wish_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period record; v_actor uuid; v_ids uuid[]; v_wid uuid; v_wish record; v_cast record;
  v_cnt int := 0;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_period from public.shift_periods where id = p_period_id;
  if v_period.id is null or v_period.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_period.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_period.status = 'published' then raise exception 'period published'; end if;
  if p_wish_ids is null then raise exception 'bad ids'; end if;
  if coalesce(array_length(p_wish_ids,1),0) = 0 then return 0; end if;  -- ★完全 no-op
  select array_agg(distinct x) into v_ids from unnest(p_wish_ids) as x;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  -- ① 入替: 旧 auto（planned のみ）を削除し wish を pending へ戻す
  update public.shift_wishes w
     set status = 'pending', decided_by = null, decided_at = null
   where w.id in (select s.wish_id from public.shifts s
                   where s.period_id = p_period_id and s.source = 'auto'
                     and s.status = 'planned' and s.wish_id is not null
                     and s.org_id = public.auth_org_id());
  delete from public.shifts
   where period_id = p_period_id and source = 'auto' and status = 'planned'
     and org_id = public.auth_org_id();

  -- ② 各 wish を検証→accept→insert
  foreach v_wid in array v_ids loop
    select * into v_wish from public.shift_wishes where id = v_wid;
    if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
    if v_wish.store_id <> v_period.store_id then raise exception 'store mismatch: %', v_wid; end if;
    if v_wish.status <> 'pending' then raise exception 'already decided: %', v_wid; end if;
    if v_wish.kind = 'off' then raise exception 'off wish: %', v_wid; end if;   -- ★4 0160（326-7）: 休み希望は候補にならない
    if v_wish.date < v_period.start_date or v_wish.date > v_period.end_date then
      raise exception 'out of period: %', v_wid;
    end if;
    if public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
      raise exception 'closed day: %', v_wid;
    end if;
    select * into v_cast from public.casts where id = v_wish.cast_id;
    if v_cast.id is null or not v_cast.is_active then raise exception 'inactive cast: %', v_wid; end if;
    -- ★0103 SD-9: 手動行・他 period 行との同日重複は全体を落とす（原子）
    if exists (select 1 from public.shifts s
                where s.cast_id = v_wish.cast_id and s.date = v_wish.date) then
      raise exception 'duplicate: %', v_wid;
    end if;
    update public.shift_wishes
       set status = 'accepted', decided_by = v_actor, decided_at = now()
     where id = v_wid;
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm,
                               status, source, period_id, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date,
            v_wish.start_hm, v_wish.end_hm, 'planned', 'auto', p_period_id, v_wid, v_actor);
    v_cnt := v_cnt + 1;
  end loop;

  perform public.audit_log_write('shift_auto_apply', 'shift_periods:' || p_period_id::text, null,
    jsonb_build_object('inserted', v_cnt, 'wish_ids', to_jsonb(v_ids)), v_period.store_id);
  return v_cnt;
end
$function$;

-- ★5 set_store_mine_settings（set_store_pay_time_basis の骨格・8 キー白名単＋enum）
create or replace function public.set_store_mine_settings(p_store_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_store    record;
  v_keys     text[] := array['payslip_visibility','drink_claim','punch_correction_request','ranking','ranking_show_others','reservation_request','shift_request_mode','contract_ack'];
  v_k        text;
  v_v        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_settings jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or p_settings = '{}'::jsonb then raise exception 'bad patch'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★5 追補1-4: owner／manager 自店
  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);
  for v_k in select jsonb_object_keys(p_settings) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;
  -- enum 検証（slide_apply 型＝'bad type' → 値外は 'bad <key>'）
  if p_settings ? 'payslip_visibility' then
    if jsonb_typeof(p_settings->'payslip_visibility') <> 'string' then raise exception 'bad type'; end if;
    v_v := p_settings->>'payslip_visibility';
    if v_v not in ('off','net_only','detail') then raise exception 'bad payslip_visibility'; end if;
  end if;
  if p_settings ? 'drink_claim' then
    if jsonb_typeof(p_settings->'drink_claim') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'drink_claim') not in ('off','on') then raise exception 'bad drink_claim'; end if;
  end if;
  if p_settings ? 'punch_correction_request' then
    if jsonb_typeof(p_settings->'punch_correction_request') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'punch_correction_request') not in ('off','on') then raise exception 'bad punch_correction_request'; end if;
  end if;
  if p_settings ? 'ranking' then
    if jsonb_typeof(p_settings->'ranking') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'ranking') not in ('off','on') then raise exception 'bad ranking'; end if;
  end if;
  if p_settings ? 'ranking_show_others' then
    if jsonb_typeof(p_settings->'ranking_show_others') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'ranking_show_others') not in ('off','on') then raise exception 'bad ranking_show_others'; end if;
  end if;
  if p_settings ? 'reservation_request' then
    if jsonb_typeof(p_settings->'reservation_request') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'reservation_request') not in ('on','off') then raise exception 'bad reservation_request'; end if;
  end if;
  if p_settings ? 'shift_request_mode' then
    if jsonb_typeof(p_settings->'shift_request_mode') <> 'string' then raise exception 'bad type'; end if;
    if (p_settings->>'shift_request_mode') not in ('shift','off_only') then raise exception 'bad shift_request_mode'; end if;
  end if;
  if p_settings ? 'contract_ack' then
    if jsonb_typeof(p_settings->'contract_ack') <> 'boolean' then raise exception 'bad type'; end if;   -- ★5 起票96: T6 契約確認の記録（boolean）
  end if;
  for v_k in select jsonb_object_keys(p_settings) loop
    v_before := v_before || jsonb_build_object(v_k, v_settings -> v_k);
    v_after  := v_after  || jsonb_build_object(v_k, p_settings -> v_k);
  end loop;
  update public.stores set settings_json = v_settings || p_settings where id = p_store_id;
  perform public.audit_log_write('set_store_mine_settings', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end $$;

-- ★6 cast_notice_reads ＋ notice_mark_read
create table if not exists public.cast_notice_reads (
  cast_id   uuid not null references public.casts(id) on delete cascade,
  notice_id uuid not null references public.notices(id) on delete cascade,
  org_id    uuid not null references public.orgs(id) on delete cascade,
  store_id  uuid not null references public.stores(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (cast_id, notice_id)
);
create index if not exists cast_notice_reads_notice_idx on public.cast_notice_reads (notice_id);
alter table public.cast_notice_reads enable row level security;
drop policy if exists cast_notice_reads_select on public.cast_notice_reads;
create policy cast_notice_reads_select on public.cast_notice_reads for select to authenticated
  using (org_id = public.auth_org_id()
         and ((public.auth_role() = 'cast' and cast_id = public.auth_cast_id())
              or (public.auth_role() = 'owner')
              or (public.auth_role() = 'manager' and store_id = public.auth_store_id())));
revoke all on table public.cast_notice_reads from public, anon, authenticated;
grant select on table public.cast_notice_reads to authenticated;

create or replace function public.notice_mark_read(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cast uuid := public.auth_cast_id();
  v_row  record;
  v_n    record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if v_cast is null then raise exception 'no cast for caller'; end if;                      -- ★6 cast セルフ専用（非ゲート＝既読のみ）
  select c.org_id, c.store_id into v_row from public.casts c where c.id = v_cast;
  select n.id, n.org_id, n.store_id, n.audience into v_n from public.notices n where n.id = p_notice_id;
  if v_n.id is null or v_n.org_id <> v_row.org_id or v_n.store_id <> v_row.store_id or v_n.audience not in ('all','cast') then raise exception 'forbidden'; end if;   -- ★6 自店・cast 向けのお知らせだけ
  insert into public.cast_notice_reads (cast_id, notice_id, org_id, store_id)
  values (v_cast, p_notice_id, v_row.org_id, v_row.store_id)
  on conflict (cast_id, notice_id) do nothing;                                              -- ★6 冪等（2 回目は何もしない・audit も 1 回目だけ）
  if found then
    perform public.audit_log_write('notice_mark_read', 'notices:' || p_notice_id::text, null,
      jsonb_build_object('cast_id', v_cast, 'notice_id', p_notice_id), v_row.store_id);
  end if;
end $$;

-- ★7 staff_shift_patterns +disabled_from・staff_pattern_disable／enable・staff_pattern_effective（読取側）
alter table public.staff_shift_patterns add column if not exists disabled_from date null;   -- ★7 0160（起票95）: この日以降は候補から外す

create or replace function public.staff_pattern_disable(p_pattern_id uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.staff_shift_patterns%rowtype; v_today date; v_org uuid;
begin
  if p_pattern_id is null or p_from is null then raise exception 'invalid_input'; end if;
  select * into r from public.staff_shift_patterns where id = p_pattern_id;
  if not found then raise exception 'not_found'; end if;
  v_org := r.org_id;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.staff_shift_gate(r.store_id);
  if not public.staff_shift_can_manage(r.store_id) then raise exception 'forbidden'; end if;
  v_today := public.staff_shift_biz_today(r.store_id);
  if p_from < v_today then raise exception 'effective_from_past'; end if;
  update public.staff_shift_patterns set disabled_from = p_from where id = p_pattern_id;
  perform public.audit_log_write('staff_pattern_disable', 'staff_shift_patterns:' || p_pattern_id::text,
    jsonb_build_object('disabled_from', r.disabled_from), jsonb_build_object('disabled_from', p_from), r.store_id, null);
end $$;

create or replace function public.staff_pattern_enable(p_pattern_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.staff_shift_patterns%rowtype; v_org uuid;
begin
  if p_pattern_id is null then raise exception 'invalid_input'; end if;
  select * into r from public.staff_shift_patterns where id = p_pattern_id;
  if not found then raise exception 'not_found'; end if;
  v_org := r.org_id;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  perform public.staff_shift_gate(r.store_id);
  if not public.staff_shift_can_manage(r.store_id) then raise exception 'forbidden'; end if;
  update public.staff_shift_patterns set disabled_from = null where id = p_pattern_id;
  perform public.audit_log_write('staff_pattern_enable', 'staff_shift_patterns:' || p_pattern_id::text,
    jsonb_build_object('disabled_from', r.disabled_from), jsonb_build_object('disabled_from', null), r.store_id, null);
end $$;

CREATE OR REPLACE FUNCTION public.staff_pattern_effective(p_pattern_id uuid, p_biz_date date)
 RETURNS staff_shift_patterns
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select q.* from public.staff_shift_patterns q
  where q.store_id = (select p.store_id from public.staff_shift_patterns p where p.id = p_pattern_id)
    and q.name     = (select p.name     from public.staff_shift_patterns p where p.id = p_pattern_id)
    and q.effective_from <= p_biz_date
    and (q.disabled_from is null or q.disabled_from > p_biz_date)   -- ★7 0160（起票95）: disabled_from 以降は無効
  order by q.effective_from desc limit 1
$function$;

-- ★8 demo_org_reset（7b6070a6）: c_wipe／c_load に cast_quotas・cast_notice_reads（他は 1 バイト不変）
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_notice_reads','cast_pin','cast_plan',   -- ★8 0160（326-9）: +cast_notice_reads（casts・notices より先に消す）
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','payroll_run_deduction_overrides','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_attentions','daily_pays','payroll_adjustments','payslips',   -- ★6 0159（起票92）: +3 表（overrides は deductions より先に消す＝FK deduction_id）
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','cast_quotas','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','memberships','stores'];   -- ★8 0160: +cast_quotas（casts より先に消す）
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  c_load constant text[] := array[
    'stores','memberships','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','cast_quotas','staff_shift_wishes','shift_wishes','shift_periods','seats','products',   -- ★8 0160: +cast_quotas（casts の後）
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_notice_reads','cast_norms',   -- ★8 0160: +cast_notice_reads（casts・notices の後）
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;

-- ★9 grants（新設 7 本＋再作成 4 本は live の proacl を再掲）
revoke all on function public.set_cast_quota(uuid, uuid, date, integer, integer, integer, integer) from public, anon;
grant execute on function public.set_cast_quota(uuid, uuid, date, integer, integer, integer, integer) to authenticated, service_role;
revoke all on function public.reservation_request(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.reservation_request(uuid, uuid, timestamptz, text) to authenticated, service_role;
revoke all on function public.reservation_decide(uuid, text, text) from public, anon;
grant execute on function public.reservation_decide(uuid, text, text) to authenticated, service_role;
revoke all on function public.shift_wish_submit(date, text, text, text) from public, anon;
grant execute on function public.shift_wish_submit(date, text, text, text) to authenticated, service_role;
revoke all on function public.shift_wish_decide(uuid, boolean) from public, anon;
grant execute on function public.shift_wish_decide(uuid, boolean) to authenticated, service_role;
revoke all on function public.shift_auto_apply(uuid, uuid[]) from public, anon;
grant execute on function public.shift_auto_apply(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.set_store_mine_settings(uuid, jsonb) from public, anon;
grant execute on function public.set_store_mine_settings(uuid, jsonb) to authenticated, service_role;
revoke all on function public.notice_mark_read(uuid) from public, anon;
grant execute on function public.notice_mark_read(uuid) to authenticated, service_role;
revoke all on function public.staff_pattern_disable(uuid, date) from public, anon;
grant execute on function public.staff_pattern_disable(uuid, date) to authenticated, service_role;
revoke all on function public.staff_pattern_enable(uuid) from public, anon;
grant execute on function public.staff_pattern_enable(uuid) to authenticated, service_role;
revoke execute on function public.staff_pattern_effective(uuid, date) from public, anon, authenticated, service_role;
revoke all on function public.demo_org_reset(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.demo_org_reset(uuid, jsonb, text) to service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('shift_wish_submit','shift_wish_decide','shift_auto_apply','staff_pattern_effective','demo_org_reset',
   'set_cast_quota','reservation_request','reservation_decide','set_store_mine_settings','notice_mark_read','staff_pattern_disable','staff_pattern_enable') order by 1;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in ('set_cast_norm','reservation_create','set_store_profile') order by 1;
select proname, pg_get_function_identity_arguments(oid), proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in
  ('shift_wish_submit','shift_wish_decide','shift_auto_apply','staff_pattern_effective','demo_org_reset',
   'set_cast_quota','reservation_request','reservation_decide','set_store_mine_settings','notice_mark_read','staff_pattern_disable','staff_pattern_enable','set_cast_norm_self') order by 1;
select table_name, count(*) as cols from information_schema.columns where table_schema='public' and table_name in ('cast_quotas','cast_notice_reads','reservations','shift_wishes','staff_shift_patterns') group by 1 order by 1;
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions, (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables;
