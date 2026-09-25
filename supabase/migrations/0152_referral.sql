-- 0152_referral.sql
-- 裁定298（2026-09-25・0152 紹介料の設計 298-1〜10）＋裁定280（＋追補1）・286・292-3（withholding_category）・296 追補1（ドリンクバック区分別は 0153 へ）＝2026-09-25 起草（CC 写経・便 M152-2）。
-- 写経元（live・docs/tmp/0152_live_now.json 逐語＝pg_get_functiondef・2026-09-25 11:5x 再取得・md5 は docs/tmp/0152_pre_live.md（9/24）と全 9 本一致・docs/tmp/gen_0152.py で機械生成・★以外は 1 バイト不変）:
--   ★1 referrers                 ＝ 0154 punch_corrections の形（create table → index → RLS SELECT → revoke all／grant select）・列は ★指定（kind／membership_id／name／contact／withholding_category／is_active）
--   ★2 check_referrals           ＝ 同上・check_id unique（1 伝票 1 紹介＝298-3）・method 4 値（value は rate＝bp・fixed＝円）・burden 2 値・amount（現在値・close で凍結）・idem_key（set RPC 側）
--   ★3 referral_payouts          ＝ 同上・status 3 値・paid_via 2 値・withholding（支払時に確定＝298-7）・check_id unique（1 伝票 1 支払）
--   ★4 daily_reports.referral_cash_payout integer not null default 0（当日現金払いの集計先＝298-10）
--   ★5 set_referrer              ＝ set_store_receivable_policy（0148 ★8）の骨格（null guard→billing→検証→org 照合→role→upsert→audit 5 引数）・owner／manager 自店
--   ★6 check_referral_set        ＝ check_add_line の冒頭〜'not open'（0057 kiosk 腕込み・逐語）＋ check_add_referral（0148 ★5）の idem（裁定102 形）＋ 'exists'（298-3）＋ 末尾で referral_recalc→check_recalc→audit
--   ★7 check_referral_remove     ＝ check_remove_line（逐語＝'has payments' 込み）＋ 'frozen'（frozen_at not null）
--   ★8 referral_recalc           ＝ 内部専用（4 ロール revoke・grant なし）・298-1 の式で check_referrals.amount を更新（frozen は触らない・org 条件は自ら含める＝原則 8）
--   ★9 referral_payout_pay       ＝ check_void の actor 行＋ for update・'already paid'／'voided'・冪等（idem_key）・298-7 の源泉（salesperson＝支払月の累計で差分計上）・audit 5 引数
--   ★10 referral_payouts_pay_bulk＝ ★9 を id ごとに呼ぶ（部分成功なし＝1 tx・冪等キーは p_idem_key と id から md5 で派生）
--   ★11 referral_payouts_unpaid  ＝ 店×期間の未払一覧（owner／manager 自店・課金ゲート内蔵＝名簿 A）
--   ★12 check_group_due          ＝ live 全文を機械で写し、0148 ★10 の referral 除外 2 箇所を削除（298-8）＋ burden='customer' の amount を v_bx／v_bx10（pay_group 'A'）に加算（298-9）のみ★
--   ★13 check_recalc             ＝ live 全文を機械で写し、冒頭 1 箇所 perform referral_recalc（裁定286）のみ★
--   ★14 check_close              ＝ live 全文を機械で写し、status 更新の直前に frozen_at 書込＋ referral_payouts insert（unpaid・withholding 0・amount>0 のみ＝298-6 D11）のみ★
--   ★15 check_void               ＝ live 全文を機械で写し、before に referral_payouts を含め unpaid→'voided'（paid は据え置き＝298-10）のみ★
--   ★16 check_merge              ＝ live 全文を機械で写し、from 側に紹介があれば 'referral on from'（298-3）のみ★
--   ★17 daily_report_close       ＝ live 全文を機械で写し、当日現金払いの集計（paid_via 'cash_daily'・支払日時の営業日）＋ insert 列 1 ＋ diff 式の減算のみ★
--   ★18 check_lines の kind 付け替え（referral→custom・live 1 件＝NOX-DEMO の void 伝票）→ count=0 の assert → check_lines_kind_check 差し替え（'referral' 除去＝298-2・0148 ★4 の形）
--   ★19 drop function check_add_referral(uuid,uuid,integer,text,uuid)（0148 ★5 の撤去＝裁定280-1）
--   ★20 demo_org_reset           ＝ live 全文を機械で写し、c_wipe に check_referrals／referral_payouts（check_lines の前）・referrers（memberships の前）／c_load に逆順で +3 のみ★
--   ★21 revoke／grant＝0154 ★10 の形（新 RPC 公開 6 本＝revoke all … from public, anon／grant … to authenticated, service_role・referral_recalc＝4 ロール revoke・grant なし・
--        改稿 7 本＝live の proacl を再掲）。名簿行（client 便で張り替え）: A +6（set_referrer／check_referral_set[K]／check_referral_remove[K]／referral_payout_pay／
--        referral_payouts_pay_bulk／referral_payouts_unpaid）・B(a) +1（referral_recalc）・A −1（check_add_referral drop）＝全数 254→260・gated 134→139。
--        anon-guard probe: F0152_PROBES 6 本（null 引数で BLOCKED）＋ referral_recalc INTERNAL（authenticated も BLOCKED）・check_add_referral の probe を外す。
--        grants: G1／G2 に 3 表（authenticated SELECT のみ）・G4d に公開 6・G4c に referral_recalc・G31（kiosk 腕）19→20／21→22・billing 段47-3 17→18・reopen ro(3b-4) 16→17／(3b-6) 17→18・
--        rls 名前集合 +3・demo-guard 表数 68→71（c_wipe 69→72 手）・product-types pt(1-2) 11→10 値・category-map／pricing／receipt／referral の kind pin。
--
-- 要裁定 (10)＝**裁定299（2026-09-25）で確定**（起草時に列挙・(1)〜(10) はすべて起草どおり・(2) のみ set 側に 'no people' を追加＝改稿はこの 1 点）:
--   (1) ★17 daily_report_close の diff 式に referral_cash_payout を減算（299-2＝起草どおり・当日現金払いはドロワーから出た現金）。
--   (2) ★8 fixed_per_person で checks.people が null のとき（299-1）: referral_recalc は coalesce(people, 1)（起草どおり・recalc は伝票操作を止めない）。
--       ただし ★6 check_referral_set は method='fixed_per_person' かつ people null なら 'no people' で raise（人数を先に入れさせる）＝本版で追加。
--   (3) ★6／★7 kiosk 腕＝check_add_line／check_remove_line の逐語（腕あり）のまま（299-3・0057 の 3 箇所は触らない）。
--   (4) ★7 'has payments' は逐語で残す（299-4・burden='store' でも支払後は remove 不可・訂正は void 経路）。
--   (5) ★10 一括の冪等＝md5(p_idem_key || ':' || id)::uuid（299-5＝起草どおり）。
--   (6) ★9 「同月（支払月）」＝paid_at の JST 暦月（299-6＝起草どおり・源泉は支払日基準）。
--   (7) ★1 referrers.membership_id は on delete set null・CHECK は external→null のみ・staff の必須は set_referrer で検査（299-7＝起草どおり）。
--   (8) ★15 paid の payout がある伝票の void は通す・payout は据え置き・before に支払行（299-8＝起草どおり・'referral paid' raise は不採用）。
--   (9) ★3 referral_payouts.check_id unique＋close の早期 return＋not exists の二重化（299-9＝起草どおり）。
--   (10) ★5 set_referrer の p_is_active null＝coalesce(…, true)（299-10＝起草どおり・規約 7）。
--   写経の注記（299-11）: live prosrc の CR は LF に正規化して写す。「★以外 diff 0」は改行コードを除いた意味（0152 以降の mig に適用）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   -- 1) 新 RPC 7 本＋改稿 7 本: 署名・secdef・search_path・proacl（referral_recalc／check_group_due／check_recalc＝{postgres} のみ・公開 6＋close/void/merge/daily_report_close＝authenticated,service_role）
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig, proacl from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('set_referrer','check_referral_set','check_referral_remove','referral_recalc','referral_payout_pay',
--       'referral_payouts_pay_bulk','referral_payouts_unpaid','check_group_due','check_recalc','check_close','check_void','check_merge','daily_report_close','demo_org_reset') order by 1;   -- 14 行
--   select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='check_add_referral';                                -- 0
--   -- 2) 表・列: 3 表（RLS on・authenticated=SELECT のみ）・daily_reports.referral_cash_payout・check_lines_kind_check に 'referral' なし・referral 行 0
--   select relname, relrowsecurity from pg_class where relname in ('referrers','check_referrals','referral_payouts');                       -- 3 行 t
--   select pg_get_constraintdef(oid) from pg_constraint where conname='check_lines_kind_check';                                              -- 'referral' を含まない 10 値
--   select count(*) from public.check_lines where kind='referral';                                                                          -- 0
--   -- 3) 改稿の中身: check_group_due に 'referral' の除外なし・burden 加算あり／check_recalc 冒頭 referral_recalc／demo_org_reset に 3 表
--   select prosrc like '%kind <> ''referral''%', prosrc like '%burden = ''customer''%' from pg_proc where pronamespace='public'::regnamespace and proname='check_group_due';   -- f, t
--   select prosrc like '%perform public.referral_recalc(p_check_id);%' from pg_proc where pronamespace='public'::regnamespace and proname='check_recalc';                      -- t
--   select prosrc like '%''referrers''%' and prosrc like '%''referral_payouts''%' from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset';        -- t
--   -- 4) 不触の md5（check_pay d480a565…／billing_writable_of 185818bb…／check_add_line 8629536b…／check_remove_line 3728e3a1…）が貼付前の控えと一致
--   -- 5) 動作＝突合 docs/tmp/q0925_ag_0152.mjs（BEGIN…ROLLBACK）・suite の張り替えは手貼り後（client 便）

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 referrers（裁定280-2・292-3・298-5）＝ 0154 punch_corrections の形（表 → index → RLS → revoke／grant）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.referrers (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id),
  store_id             uuid not null references public.stores(id),
  kind                 text not null,                                                   -- ★1: 'external'（外部キャッチ）／'staff'（自店スタッフ＝memberships）
  membership_id        uuid references public.memberships(id) on delete set null,      -- ★1（要裁定(7)）: staff の参照先・退店で消えても行は残る（298-5 D5＝client 表示制御）
  name                 text not null,
  contact              text,
  withholding_category text not null default 'none',                                   -- ★1（裁定292-3）: none／salesperson（外交員報酬 10.21%）／employee（給与側で源泉）
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint referrers_kind_ck                 check (kind in ('external','staff')),
  constraint referrers_membership_ck           check (kind = 'staff' or membership_id is null),
  constraint referrers_name_ck                 check (length(trim(name)) between 1 and 80),
  constraint referrers_contact_ck              check (contact is null or length(contact) <= 200),
  constraint referrers_withholding_category_ck check (withholding_category in ('none','salesperson','employee'))
);

create index if not exists referrers_org_idx          on public.referrers(org_id);
create index if not exists referrers_store_active_idx on public.referrers(store_id, is_active);

drop trigger if exists referrers_touch_updated_at on public.referrers;
create trigger referrers_touch_updated_at before update on public.referrers for each row execute function public.touch_updated_at();

alter table public.referrers enable row level security;

drop policy if exists referrers_select on public.referrers;
create policy referrers_select on public.referrers
  for select to authenticated
  using (
    (org_id = auth_org_id())
    and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
    and (auth_role() <> 'cast'::text)                                                   -- ★1（298-5 D7）: cast 0 行
  );

revoke all on table public.referrers from public, anon, authenticated;
grant select on table public.referrers to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ★2 check_referrals（裁定280-5・298-3）＝ 1 伝票 1 紹介（check_id unique）・付与時の method／value／burden を凍結・amount は現在値（close で frozen_at）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.check_referrals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  check_id     uuid not null references public.checks(id) on delete cascade,
  referrer_id  uuid not null references public.referrers(id),
  method       text not null,                                                           -- ★2: set_rate／account_rate（value＝bp）／fixed_per_person／fixed_per_group（value＝円）
  value        integer not null,
  burden       text not null,                                                           -- ★2（裁定280-4・298-9）: customer（伝票に乗る）／store（乗らない）
  amount       integer not null default 0,                                              -- ★2: referral_recalc の現在値（298-1）・close で凍結
  frozen_at    timestamptz,
  memo         text,
  idem_key     uuid,                                                                    -- ★2: check_referral_set の冪等（裁定102 形）
  created_at   timestamptz not null default now(),
  created_by   uuid references public.users(id),
  constraint check_referrals_check_uk   unique (check_id),
  constraint check_referrals_method_ck  check (method in ('set_rate','account_rate','fixed_per_person','fixed_per_group')),
  constraint check_referrals_value_ck   check (value >= 0 and (method not in ('set_rate','account_rate') or value <= 10000)),
  constraint check_referrals_burden_ck  check (burden in ('customer','store')),
  constraint check_referrals_amount_ck  check (amount >= 0),
  constraint check_referrals_memo_ck    check (memo is null or length(memo) <= 200)
);

create index if not exists check_referrals_org_idx      on public.check_referrals(org_id);
create index if not exists check_referrals_store_idx    on public.check_referrals(store_id);
create index if not exists check_referrals_referrer_idx on public.check_referrals(referrer_id);
create unique index if not exists check_referrals_idem_key_uidx on public.check_referrals(idem_key) where idem_key is not null;

alter table public.check_referrals enable row level security;

drop policy if exists check_referrals_select on public.check_referrals;
create policy check_referrals_select on public.check_referrals
  for select to authenticated
  using (
    (org_id = auth_org_id())
    and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
    and (auth_role() <> 'cast'::text)                                                   -- ★2（298-5 D7）: cast 0 行
  );

revoke all on table public.check_referrals from public, anon, authenticated;
grant select on table public.check_referrals to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ★3 referral_payouts（裁定280-6・292-3・298-6／7／10）＝ 会計確定で unpaid 1 件・支払 RPC で paid（withholding 確定）・void で unpaid→voided
-- ══════════════════════════════════════════════════════════════
create table if not exists public.referral_payouts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  referrer_id  uuid not null references public.referrers(id),
  check_id     uuid not null references public.checks(id),
  biz_date     date not null,                                                           -- ★3: 会計確定の営業日（biz_date_of(store, started_at)）
  amount       integer not null,
  withholding  integer not null default 0,                                              -- ★3（裁定292-3・298-7）: 支払時に確定（salesperson のみ >0）
  status       text not null default 'unpaid',
  paid_via     text,                                                                    -- ★3（298-10）: cash_daily（当日現金＝日報へ）／monthly
  paid_at      timestamptz,
  paid_by      uuid references public.users(id),
  idem_key     uuid,
  created_at   timestamptz not null default now(),
  constraint referral_payouts_check_uk        unique (check_id),                                            -- ★3（要裁定(9)）: 1 伝票 1 支払
  constraint referral_payouts_amount_ck       check (amount >= 0),
  constraint referral_payouts_withholding_ck  check (withholding >= 0 and withholding <= amount),
  constraint referral_payouts_status_ck       check (status in ('unpaid','paid','voided')),
  constraint referral_payouts_paid_via_ck     check (paid_via is null or paid_via in ('cash_daily','monthly')),
  constraint referral_payouts_paid_shape_ck   check ((status = 'paid') = (paid_at is not null))
);

create index if not exists referral_payouts_org_idx                   on public.referral_payouts(org_id);
create index if not exists referral_payouts_store_referrer_status_idx on public.referral_payouts(store_id, referrer_id, status);
create index if not exists referral_payouts_store_biz_idx             on public.referral_payouts(store_id, biz_date);
create unique index if not exists referral_payouts_idem_key_uidx on public.referral_payouts(idem_key) where idem_key is not null;

alter table public.referral_payouts enable row level security;

drop policy if exists referral_payouts_select on public.referral_payouts;
create policy referral_payouts_select on public.referral_payouts
  for select to authenticated
  using (
    (org_id = auth_org_id())
    and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
    and (auth_role() <> 'cast'::text)                                                   -- ★3（298-5 D7）: cast 0 行
  );

revoke all on table public.referral_payouts from public, anon, authenticated;
grant select on table public.referral_payouts to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ★4 daily_reports.referral_cash_payout（裁定298-10）＝ 当日現金払いの紹介料（渡した額＝amount−withholding）の集計先
-- ══════════════════════════════════════════════════════════════
alter table public.daily_reports add column if not exists referral_cash_payout integer not null default 0;
alter table public.daily_reports drop constraint if exists daily_reports_referral_cash_payout_check;
alter table public.daily_reports add constraint daily_reports_referral_cash_payout_check check (referral_cash_payout >= 0);

-- ══════════════════════════════════════════════════════════════
-- ★18 kind 'referral' の撤去（裁定298-2）＝ live の 1 件（NOX-DEMO・void 伝票）を custom へ → 0 件を assert → CHECK 差し替え（0148 ★4 の形＝drop→同名 add）
-- ══════════════════════════════════════════════════════════════
update public.check_lines set kind = 'custom' where kind = 'referral';   -- ★18: 1 件（2026-09-25 実測）
do $$
begin
  if (select count(*) from public.check_lines where kind = 'referral') > 0 then raise exception 'referral rows remain'; end if;   -- ★18: 0 件でなければ tx ごと止める
end $$;
alter table public.check_lines drop constraint check_lines_kind_check;
alter table public.check_lines add constraint check_lines_kind_check
  check (kind in ('set','time','charge','drink','champ','bottle','custom','discount','food','other'));   -- ★18 −referral（0148 ★4 の 11 値 → 10 値）

-- ══════════════════════════════════════════════════════════════
-- ★19 check_add_referral の撤去（裁定280-1・0148 ★5）
-- ══════════════════════════════════════════════════════════════
drop function public.check_add_referral(uuid,uuid,integer,text,uuid);

-- ══════════════════════════════════════════════════════════════
-- ★8 referral_recalc（内部専用・裁定286・298-1）＝ check_referrals.amount の現在値を更新（frozen は触らない）。呼び出し元（check_recalc／check_referral_set）が二重防御済み（原則 8）・org 条件は自ら含める
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.referral_recalc(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_base int := 0; v_amt int := 0;
begin
  select cr.id, cr.method, cr.value, cr.frozen_at, c.people
    into r
    from public.check_referrals cr
    join public.checks c on c.id = cr.check_id and c.org_id = cr.org_id   -- ★8: org 条件は自ら含める（防御深度）
   where cr.check_id = p_check_id;
  if not found then return; end if;
  if r.frozen_at is not null then return; end if;   -- ★8: 会計確定後は触らない
  if r.method = 'set_rate' then
    -- ★8（298-1）: 母数＝kind='set' の line_total 合計（割引前・全 pay_group）・bp・floor
    select coalesce(sum(line_total), 0)::int into v_base from public.check_lines where check_id = p_check_id and kind = 'set';
    v_amt := floor(v_base * r.value / 10000.0)::int;
  elsif r.method = 'account_rate' then
    -- ★8（298-1）: 母数＝全 pay_group の割引後小計（kind<>'discount' − discount・vip_charge を含む・紹介料自身は行ではないので含まれない）・bp・floor
    select greatest(0, coalesce(sum(case when kind = 'discount' then -line_total else line_total end), 0))::int into v_base
      from public.check_lines where check_id = p_check_id;
    v_amt := floor(v_base * r.value / 10000.0)::int;
  elsif r.method = 'fixed_per_person' then
    v_amt := r.value * coalesce(r.people, 1);   -- ★8（要裁定(2)）: people null は 1 人扱い
  else
    v_amt := r.value;                            -- fixed_per_group
  end if;
  update public.check_referrals set amount = v_amt where id = r.id and amount is distinct from v_amt;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★5 set_referrer（裁定280-2・292-3・298-5）＝ set_store_receivable_policy（0148 ★8）の骨格・owner／manager 自店・upsert（p_id null＝insert）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_referrer(p_id uuid, p_store_id uuid, p_kind text, p_membership_id uuid, p_name text, p_contact text, p_withholding_category text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  record;
  v_id    uuid;
  v_name  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_kind is null or p_kind not in ('external','staff') then raise exception 'bad kind'; end if;                                   -- ★5 CHECK 2 値逐語
  if p_withholding_category is null or p_withholding_category not in ('none','salesperson','employee') then raise exception 'bad withholding_category'; end if;   -- ★5 CHECK 3 値逐語
  v_name := trim(coalesce(p_name, ''));
  if length(v_name) not between 1 and 80 then raise exception 'bad name'; end if;
  if p_contact is not null and length(p_contact) > 200 then raise exception 'bad contact'; end if;
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★5: staff は自店 memberships の 1 行が必須・external は membership なし（要裁定(7)）
  if p_kind = 'staff' then
    if p_membership_id is null or not exists (select 1 from public.memberships m where m.id = p_membership_id and m.store_id = p_store_id) then
      raise exception 'bad membership';
    end if;
  elsif p_membership_id is not null then
    raise exception 'bad membership';
  end if;

  if p_id is null then
    insert into public.referrers (org_id, store_id, kind, membership_id, name, contact, withholding_category, is_active)
    values (v_store.org_id, p_store_id, p_kind, p_membership_id, v_name, nullif(trim(p_contact), ''), p_withholding_category, coalesce(p_is_active, true))
    returning id into v_id;
    perform public.audit_log_write('set_referrer', 'referrers:' || v_id::text, null,
      (select to_jsonb(r) from public.referrers r where r.id = v_id), p_store_id);
    return v_id;
  end if;

  select * into v_prev from public.referrers where id = p_id and org_id = v_store.org_id and store_id = p_store_id;
  if v_prev.id is null then raise exception 'not_found'; end if;
  update public.referrers
     set kind = p_kind, membership_id = p_membership_id, name = v_name, contact = nullif(trim(p_contact), ''),
         withholding_category = p_withholding_category, is_active = coalesce(p_is_active, true)   -- ★5（要裁定(10)）: null→true（規約 7＝UI は明示値）
   where id = p_id;
  perform public.audit_log_write('set_referrer', 'referrers:' || p_id::text, to_jsonb(v_prev),
    (select to_jsonb(r) from public.referrers r where r.id = p_id), p_store_id);
  return p_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★6 check_referral_set（裁定280-3／4・298-3）＝ check_add_line の冒頭〜role 判定（0057 kiosk 腕込み・逐語）＋ idem（0148 ★5＝裁定102）＋ 'exists' ＋ referral_recalc→check_recalc→audit
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_referral_set(p_check_id uuid, p_referrer_id uuid, p_method text, p_value integer, p_burden text, p_idem_key uuid DEFAULT NULL::uuid, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid;   -- ★6
  v_org uuid;  -- ★0057(2)
  v_ref record; v_dup uuid;   -- ★6
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_method is null or p_method not in ('set_rate','account_rate','fixed_per_person','fixed_per_group') then raise exception 'bad method'; end if;   -- ★6 CHECK 4 値逐語
  if p_value is null or p_value < 0 or (p_method in ('set_rate','account_rate') and p_value > 10000) then raise exception 'bad value'; end if;         -- ★6 rate＝bp（0〜10000）・fixed＝円
  if p_burden is null or p_burden not in ('customer','store') then raise exception 'bad burden'; end if;                                             -- ★6 CHECK 2 値逐語
  if p_memo is not null and length(p_memo) > 200 then raise exception 'bad memo'; end if;                                                            -- ★6
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
  -- ★6 冪等（0148 ★5＝裁定102 の形）: 同キー再送は既存行を返す
  if p_idem_key is not null then
    select id into v_dup from public.check_referrals where check_id = p_check_id and idem_key = p_idem_key;
    if v_dup is not null then return v_dup; end if;
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if exists (select 1 from public.check_referrals where check_id = p_check_id) then raise exception 'exists'; end if;   -- ★6（298-3）: 1 伝票 1 紹介＝付け替えは remove→set
  -- ★6 紹介者（自店・在籍）＝check_add_referral の cast 検証と同型
  select r.id, r.store_id, r.is_active into v_ref from public.referrers r where r.id = p_referrer_id and r.org_id = v_org;
  if v_ref.id is null or v_ref.store_id <> v_chk.store_id then raise exception 'bad referrer'; end if;
  if not v_ref.is_active then raise exception 'inactive referrer'; end if;
  if p_method = 'fixed_per_person' and v_chk.people is null then raise exception 'no people'; end if;   -- ★6（裁定299-1）: 人数を先に入れさせる（recalc 側は coalesce(people,1) で止めない）

  insert into public.check_referrals (org_id, store_id, check_id, referrer_id, method, value, burden, amount, memo, idem_key, created_by)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_referrer_id, p_method, p_value, p_burden, 0, nullif(trim(p_memo), ''), p_idem_key,
          coalesce(public.auth_kiosk_operator(), (select id from public.users where auth_user_id = auth.uid() and is_active)))   -- ★6 actor＝audit_log_write と同順
  returning id into v_id;
  perform public.referral_recalc(p_check_id);   -- ★6（298-1）: amount の現在値
  perform public.check_recalc(p_check_id);      -- ★6（298-9）: burden='customer' なら total が動く
  perform public.audit_log_write('check_referral_set', 'check_referrals:' || v_id::text, null,
    (select to_jsonb(r) from public.check_referrals r where r.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★7 check_referral_remove（裁定298-3）＝ check_remove_line の逐語（'has payments' 込み＝要裁定(4)）＋ 'frozen'
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_referral_remove(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record; v_chk record; v_paycnt int;   -- ★7 v_line→v_row
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_row from public.check_referrals where check_id = p_check_id;                                    -- ★7 行＝伝票の紹介（1 伝票 1 紹介）
  if v_row.id is null or v_row.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_row.check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
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
  if v_row.frozen_at is not null then raise exception 'frozen'; end if;   -- ★7: 会計確定後は外せない
  delete from public.check_referrals where id = v_row.id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_referral_remove', 'check_referrals:' || v_row.id::text,
    to_jsonb(v_row), null, v_chk.store_id);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★9 referral_payout_pay（裁定280-6・292-3・298-6／7／10）＝ 1 件の支払確定・源泉は支払時に確定（salesperson＝支払月の累計で差分計上）・冪等（idem_key）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.referral_payout_pay(p_payout_id uuid, p_paid_via text, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p record; v_actor uuid; v_cat text; v_month date;
  v_cum int := 0; v_wh_done int := 0; v_wh_total int := 0; v_wh int := 0;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_paid_via is null or p_paid_via not in ('cash_daily','monthly') then raise exception 'bad paid_via'; end if;   -- ★9 CHECK 2 値逐語
  select * into v_p from public.referral_payouts where id = p_payout_id for update;
  if v_p.id is null or v_p.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_p.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで paid 済みなら成功を返す（check_close の形）
  if v_p.status = 'paid' then
    if p_idem_key is not null and v_p.idem_key = p_idem_key then return p_payout_id; end if;
    raise exception 'already paid';
  end if;
  if v_p.status = 'voided' then raise exception 'voided'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  select withholding_category into v_cat from public.referrers where id = v_p.referrer_id;
  -- ★9（298-7・要裁定(6)）: salesperson＝同月（支払日時の JST 月）の当該紹介者への支払累計で (累計−120,000)×10.21% を floor し、既確定分との差分を本 payout に載せる（負なら 0）
  if v_cat = 'salesperson' then
    v_month := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
    select coalesce(sum(amount), 0)::int, coalesce(sum(withholding), 0)::int into v_cum, v_wh_done
      from public.referral_payouts
     where referrer_id = v_p.referrer_id and status = 'paid' and id <> v_p.id
       and date_trunc('month', (paid_at at time zone 'Asia/Tokyo'))::date = v_month;
    v_wh_total := floor(greatest(0, v_cum + v_p.amount - 120000) * 1021 / 10000.0)::int;
    v_wh := least(v_p.amount, greatest(0, v_wh_total - v_wh_done));
  else
    v_wh := 0;   -- employee＝給与側で源泉／none＝0
  end if;

  update public.referral_payouts
     set status = 'paid', paid_via = p_paid_via, paid_at = now(), paid_by = v_actor, withholding = v_wh, idem_key = p_idem_key
   where id = p_payout_id;
  perform public.audit_log_write('referral_payout_pay', 'referral_payouts:' || p_payout_id::text, to_jsonb(v_p),
    (select to_jsonb(p) from public.referral_payouts p where p.id = p_payout_id), v_p.store_id);
  return p_payout_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★10 referral_payouts_pay_bulk（裁定298-6）＝ ★9 を id ごとに呼ぶ（部分成功なし＝1 tx・冪等キーは派生＝要裁定(5)）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.referral_payouts_pay_bulk(p_payout_ids uuid[], p_paid_via text, p_idem_key uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid; v_n int := 0;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_payout_ids is null or array_length(p_payout_ids, 1) is null then raise exception 'bad ids'; end if;
  if p_idem_key is null then raise exception 'bad idem'; end if;
  foreach v_id in array p_payout_ids loop
    perform public.referral_payout_pay(v_id, p_paid_via, md5(p_idem_key::text || ':' || v_id::text)::uuid);   -- ★10 1 件でも raise なら全件ロールバック
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★11 referral_payouts_unpaid（裁定298-6）＝ 店×期間の未払一覧（owner／manager 自店・課金ゲート内蔵＝名簿 A）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.referral_payouts_unpaid(p_store_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(payout_id uuid, referrer_id uuid, referrer_name text, referrer_kind text, withholding_category text, check_id uuid, biz_date date, amount integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.referrer_id, r.name, r.kind, r.withholding_category, p.check_id, p.biz_date, p.amount
      from public.referral_payouts p
      join public.referrers r on r.id = p.referrer_id
     where p.store_id = p_store_id and p.status = 'unpaid'
       and (p_from is null or p.biz_date >= p_from)
       and (p_to   is null or p.biz_date <= p_to)
     order by p.biz_date, r.name, p.created_at;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★12 check_group_due（裁定298-8／9）＝ live 全文（md5 8285d0d8…）・referral 除外 2 箇所の削除＋ burden='customer' の加算のみ★
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
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount';   -- ★12 0152（裁定298-8）: 0148 ★10 の referral 除外を削除（kind 'referral' は CHECK から撤去）
  -- ★12 0152（裁定298-9）: burden='customer' の紹介料は pay_group 'A' の小計（サ料・税の母数）に加算（burden='store' は乗らない）
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref
      from public.check_referrals
     where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
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
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount';   -- ★12 0152（裁定298-8）: 同上
    v_bx10 := v_bx10 + v_ref;                                              -- ★12 0152（裁定298-9）: taxable_10 の母数にも加算
    v_sv     := round(v_net * v_rate / 100.0)::int;                       -- サ料（従来と同式）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + round(v_net * v_rate / 100.0), v_unit, v_mode);
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★13 check_recalc（裁定286）＝ live 全文（md5 9a8801ea…）・冒頭 1 箇所のみ★（14 本の呼び出し元には触れない）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_recalc(p_check_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total int := 0; v_g record;
begin
  perform public.referral_recalc(p_check_id);   -- ★13 0152（裁定286・298-1）: 冒頭 1 箇所で紹介料の現在値を再計算（frozen は触らない・再帰なし）
  for v_g in
    select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_total := v_total + public.check_group_due(p_check_id, v_g.pay_group);
  end loop;
  update public.checks set total = v_total where id = p_check_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★14 check_close（裁定298-10）＝ live 全文（md5 f26d8c3d…）・status 更新の直前のみ★
-- ══════════════════════════════════════════════════════════════
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
  v_org uuid;  -- ★0057(2)
  v_kinds text[]; v_dohans boolean[];  -- ★0119 裁定100: キャスト別種別/同伴
  v_bizdate date;                       -- ★0132 裁定113: 伝票営業日(started_at 起点)
  v_modes text[]; v_rates int[];        -- ★0132: cast 別の商品バック方式/率
  v_salesbase int[];                    -- ★0132: 同腕の按分売上母数(plan_rate/plan_fixed 監査用)
  v_units int[]; v_fixeds int[];        -- ★0133 裁定123: 同腕の按分本数Σ / cast 別の円/本固定額
  v_mode text; v_rate int; v_fixed int; -- ★0132/0133: 解決作業用
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
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

  -- 全 group 充足(∀g: paid(g) ≥ due(g))＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配(最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_kind='hon' の行のみ=裁定100)
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id),
         array_agg(nom_kind order by position, created_at, id),
         array_agg(is_dohan order by position, created_at, id)
    into v_cast_ids, v_weights, v_kinds, v_dohans
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    if v_sumw > 0 then  -- ★0124 判断B: 全 weight 0(全員 ended 等)=按分なし(整数除算ガード)
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    v_salesbase := array_fill(0, array[v_n]);  -- ★0132
    v_units := array_fill(0, array[v_n]);      -- ★0133
    -- ★0132 裁定113: 伝票営業日(started_at)時点の cast_plan から商品バック方式を cast 別に解決。
    --   解決不能(割当なし)=既定 product_rule。重複有効行は valid_from 降順の先頭(決定的・close は止めない)。
    v_bizdate := public.biz_date_of(v_chk.store_id, v_chk.started_at);
    v_modes := array_fill('product_rule'::text, array[v_n]);
    v_rates := array_fill(0, array[v_n]);
    v_fixeds := array_fill(0, array[v_n]);     -- ★0133
    for i in 1..v_n loop
      select p.product_back_mode, coalesce(p.product_back_rate, 0), coalesce(p.product_back_fixed, 0)
        into v_mode, v_rate, v_fixed
        from public.cast_plan cp
        join public.comp_plans p on p.id = cp.plan_id
       where cp.cast_id = v_cast_ids[i]
         and cp.org_id = v_chk.org_id
         and cp.valid_from <= v_bizdate
         and (cp.valid_to is null or cp.valid_to >= v_bizdate)
       order by cp.valid_from desc
       limit 1;
      if found then v_modes[i] := v_mode; v_rates[i] := v_rate; v_fixeds[i] := v_fixed; end if;
    end loop;
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外(凍結値で判定・キー無し=false=按分対象)
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価(productBackOf と同一規則・凍結値)。★0119: unit4 はキャスト別キーで集計ループ内に解決
      if (v_line.back_snapshot ->> 'back_mode') is distinct from 'unit4' then
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配(床=整数除算・剰余降順→position 昇順)
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
      -- 集計(★0132: cast 別 mode で分岐。同一行集合・同一 v_alloc=同腕)
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_modes[i] = 'plan_rate' then
            -- ★0132: 売上按分のみ凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
          elsif v_modes[i] = 'plan_fixed' then
            -- ★0133: 売上按分(監査用)+按分本数を凍結(商品3列は加算しない)
            v_salesbase[i] := v_salesbase[i] + v_line.unit_price_snapshot * v_alloc[i];
            v_units[i] := v_units[i] + v_alloc[i];
          elsif v_modes[i] = 'product_rule' then
            if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
              v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> public.nom_unit4_key(v_kinds[i], v_dohans[i]))::int, 0);
            end if;
            if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
            if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          end if;
          -- pt は3択の射程外=全 mode 共通(裁定113)
          if v_kinds[i] = 'hon' then  -- ★0119: pt は本指名キャストの行のみ
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    -- ★0132/0133: mode 別の凍結書込(ゼロ専用行は作らない)
    for i in 1..v_n loop
      if v_modes[i] = 'plan_rate' then
        if v_pt[i] > 0 or v_salesbase[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_rate', v_salesbase[i],
                  round((v_salesbase[i]::numeric * v_rates[i]) / 100.0)::int);
        end if;
      elsif v_modes[i] = 'plan_fixed' then
        -- ★0133: 1本あたり固定額=按分本数Σ×固定額を凍結(plan_rate と同型・payOf 例外を廃止)
        if v_pt[i] > 0 or v_salesbase[i] > 0 or v_units[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  0, 0, 0, v_pt[i],
                  'plan_fixed', v_salesbase[i], v_units[i] * v_fixeds[i]);
        end if;
      else
        if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
          insert into public.check_cast_backs
            (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc,
             source_mode, product_sales_base, calculated_back_amount)
          values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                  v_drink[i], v_champ[i], v_bottle[i], v_pt[i],
                  'product_rule', null, null);
        end if;
      end if;
    end loop;
    end if;  -- ★0124 判断B ガード終端
  end if;

  -- ★14 0152（裁定298-10）: 紹介の凍結（frozen_at）＋ 未払 1 件（amount>0 のみ＝298-6 D11・unpaid・withholding 0・営業日＝started_at 起点）。二重 insert は not exists と unique(check_id) の二重化
  update public.check_referrals set frozen_at = now() where check_id = p_check_id and frozen_at is null;
  insert into public.referral_payouts (org_id, store_id, referrer_id, check_id, biz_date, amount, withholding, status)
  select r.org_id, r.store_id, r.referrer_id, r.check_id, public.biz_date_of(v_chk.store_id, v_chk.started_at), r.amount, 0, 'unpaid'
    from public.check_referrals r
   where r.check_id = p_check_id and r.amount > 0
     and not exists (select 1 from public.referral_payouts p where p.check_id = p_check_id);
  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053(B1 相席・transient): 追加席の占有を解放(解放経路=ロック不要・money 非干渉)
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★15 check_void（裁定298-10）＝ live 全文（md5 c99700f1…）・宣言 1＋差し込み 1 箇所のみ★
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_void(p_check_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
  v_refp jsonb;  -- ★15 0152（裁定298-10）: 紹介料の支払行（監査痕跡）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  perform public.assert_day_open(v_chk.store_id, public.biz_date_of(v_chk.store_id, v_chk.started_at));
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）・一部でも現金回収済み（collected_amount>0）の売掛があれば
  -- void 拒否（宙吊り/幻影防止＝条件3＋partial。★mig0092: collected_amount>0 を追加＝ar_collections 幻影の封鎖）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0 or collected_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  -- ★15 0152（裁定298-10）: 支払行を before に含め、unpaid は 'voided'（paid は据え置き＝返金は手動・要裁定(8)）
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_refp
    from public.referral_payouts p where p.check_id = p_check_id;
  v_before := v_before || jsonb_build_object('referral_payouts', v_refp);
  update public.referral_payouts set status = 'voided'
    where check_id = p_check_id and status = 'unpaid';
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

-- ══════════════════════════════════════════════════════════════
-- ★16 check_merge（裁定298-3）＝ live 全文（md5 29aabaa0…）・1 行のみ★
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_merge(p_from_check_id uuid, p_into_check_id uuid, p_reason text, p_idem_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_from public.checks; v_into public.checks; v_lines int; v_noms int; v_seats int;
begin
  if p_from_check_id is null or p_into_check_id is null or p_idem_key is null then raise exception 'forbidden'; end if;
  v_org := public.auth_org_id();
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_from_check_id = p_into_check_id then raise exception 'forbidden'; end if;

  select * into v_from from public.checks where id = p_from_check_id for update;
  if not found then raise exception 'forbidden'; end if;
  select * into v_into from public.checks where id = p_into_check_id for update;
  if not found then raise exception 'forbidden'; end if;
  if v_from.store_id <> v_into.store_id then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.stores s where s.id = v_from.store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;

  if not public.flag_enabled('reopen_flow', v_from.store_id) then raise exception 'feature_disabled:reopen_flow'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_from.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'reason_required'; end if;

  -- 冪等: 同一キーで既に merged なら into を返す
  if v_from.status = 'merged' and v_from.merge_idem_key is not distinct from p_idem_key and v_from.merged_into = p_into_check_id then
    return p_into_check_id;
  end if;

  if v_from.status <> 'open' or v_into.status <> 'open' then raise exception 'merge_conflict:status'; end if;
  if exists (select 1 from public.check_referrals where check_id = p_from_check_id) then raise exception 'referral on from'; end if;   -- ★16 0152（裁定298-3）: from 側の紹介は先に remove させる
  if exists (select 1 from public.payments where check_id in (p_from_check_id, p_into_check_id))
     or exists (select 1 from public.receivables where check_id in (p_from_check_id, p_into_check_id)) then
    raise exception 'merge_conflict:money';
  end if;
  if exists (select 1 from public.check_nominations a join public.check_nominations b on a.cast_id = b.cast_id
              where a.check_id = p_from_check_id and b.check_id = p_into_check_id) then
    raise exception 'merge_conflict:cast';
  end if;
  if exists (select 1 from public.check_lines l where l.check_id in (p_from_check_id, p_into_check_id) and l.pay_group <> 'A') then
    raise exception 'merge_conflict:pay_group';
  end if;

  select count(*) into v_lines from public.check_lines where check_id = p_from_check_id;
  select count(*) into v_noms  from public.check_nominations where check_id = p_from_check_id;
  select count(*) into v_seats from public.check_seats where check_id = p_from_check_id;

  -- C③-20: from の自動時間料金行(set/vip_charge/extension・time_auto)は手動行へ変換して移す
  -- (into の自動行と check_lines_one_time_auto (check_id, fee_kind, block_no) WHERE time_auto が衝突するため。金額は凍結値のまま残す)
  update public.check_lines set time_auto = false, block_no = null
   where check_id = p_from_check_id and time_auto;
  update public.check_lines       set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_nominations set check_id = p_into_check_id where check_id = p_from_check_id;
  update public.check_seats       set check_id = p_into_check_id where check_id = p_from_check_id;
  -- from の主席(checks.seat_id)は into の追加席へ(check_seats は UNIQUE(seat_id)=主席は未登録のため衝突しない)
  if v_from.seat_id is not null and v_from.seat_id <> v_into.seat_id then
    insert into public.check_seats (org_id, store_id, check_id, seat_id)
    values (v_org, v_from.store_id, p_into_check_id, v_from.seat_id)
    on conflict (seat_id) do update set check_id = excluded.check_id;
  end if;
  update public.checks set status = 'merged', merged_into = p_into_check_id, merge_idem_key = p_idem_key
   where id = p_from_check_id;
  perform public.check_recalc(p_into_check_id);

  perform public.audit_log_write('check_merge', 'checks:' || p_into_check_id::text,
    jsonb_build_object('from', p_from_check_id, 'into', p_into_check_id, 'from_total', v_from.total, 'into_total', v_into.total),
    jsonb_build_object('moved_lines', v_lines, 'moved_nominations', v_noms, 'moved_seats', v_seats, 'from_seat_id', v_from.seat_id,
                       'into_total', (select c.total from public.checks c where c.id = p_into_check_id)),
    v_from.store_id, p_reason);
  return p_into_check_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★17 daily_report_close（裁定298-10）＝ live 全文（md5 5419d8d4…）・宣言 1＋集計 1＋diff 式 1＋insert 列 1／値 1 のみ★
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.daily_report_close(p_store_id uuid, p_biz_date date, p_expense integer DEFAULT 0, p_cash_payout integer DEFAULT 0, p_cash_float integer DEFAULT 0, p_counted_cash integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int; v_ar int;
  v_ar_card int; v_ar_other int;  -- ★D45
  v_refcash int := 0;  -- ★17 0152（裁定298-10）: 当日現金払いの紹介料（渡した額＝amount−withholding）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if coalesce(p_expense, -1) < 0 or coalesce(p_cash_payout, -1) < 0 or coalesce(p_cash_float, -1) < 0 then
    raise exception 'bad amount';
  end if;
  if p_counted_cash is not null and p_counted_cash < 0 then raise exception 'bad amount'; end if;
  -- E1 mig0051: 税率は stores.card_tax_rate 列読み（列 CHECK 0..100 が構造保証・既定 5 は列 default と同値）
  select org_id, settings_json, card_tax_rate into v_owner, v_settings, v_rate
    from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一 (store, biz_date) の既存行＝同一キーなら成功・別キーは reclose を促す
  select * into v_exist from public.daily_reports
    where store_id = p_store_id and biz_date = p_biz_date;
  if v_exist.id is not null then
    if p_idem_key is not null and v_exist.close_idem_key = p_idem_key then return v_exist.id; end if;
    raise exception 'already closed';
  end if;

  -- 設定スナップショット（cutoff 既定 06:00＝json のまま／税率＝列読み・raise は防御深度で残置）
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_rate < 0 then
    raise exception 'bad store settings';
  end if;

  v_agg := public.daily_report_aggregate(p_store_id, p_biz_date, v_cutoff, v_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  v_ar_card  := (v_agg->>'ar_collected_card')::int;   -- ★D45
  v_ar_other := (v_agg->>'ar_collected_other')::int;  -- ★D45
  -- ★17 0152（裁定298-10）: paid_via 'cash_daily' の紹介料＝支払日時の営業日で集計（渡した額＝amount−withholding）
  select coalesce(sum(amount - withholding), 0)::int into v_refcash
    from public.referral_payouts
   where store_id = p_store_id and status = 'paid' and paid_via = 'cash_daily'
     and public.biz_date_of(p_store_id, paid_at) = p_biz_date;

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  --   ★D45: card/other 回収は理論在高に加算しない（式不変）。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0) - v_refcash) end;   -- ★17 0152（要裁定(1)）: 紹介料の当日現金払いはドロワーから出た額

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
     ar_collected_card, ar_collected_other,  -- ★D45
     referral_cash_payout)  -- ★17 0152
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor,
     v_ar_card, v_ar_other,  -- ★D45
     v_refcash)  -- ★17 0152
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ══════════════════════════════════════════════════════════════
-- ★20 demo_org_reset（裁定280-7）＝ live 全文（md5 74291954…）・c_wipe +3（69→72 手）／c_load +3（68→71 表）のみ★（配列の要素だけ・骨格不変）
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_pin','cast_plan',
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_adjustments','payslips',
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','memberships','stores'];
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）
  c_load constant text[] := array[
    'stores','memberships','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','staff_shift_wishes','shift_wishes','shift_periods','seats','products',
    'pricing_categories','payroll_runs','kiosk_devices','customers','checks','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','daily_reports','customer_notes','custom_back_defs','comp_plans',
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_norms',
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

-- ══════════════════════════════════════════════════════════════
-- ★21 revoke／grant（0154 ★10 の形）＝ 新 RPC 公開 6 本／内部 1 本／改稿 7 本の再掲
-- ══════════════════════════════════════════════════════════════
revoke all on function public.referral_recalc(uuid) from public, anon, authenticated, service_role;   -- ★21: 内部専用＝4 ロール revoke・grant なし（名簿 B(a)）
revoke all on function public.set_referrer(uuid,uuid,text,uuid,text,text,text,boolean) from public, anon;
grant execute on function public.set_referrer(uuid,uuid,text,uuid,text,text,text,boolean) to authenticated, service_role;
revoke all on function public.check_referral_set(uuid,uuid,text,integer,text,uuid,text) from public, anon;
grant execute on function public.check_referral_set(uuid,uuid,text,integer,text,uuid,text) to authenticated, service_role;
revoke all on function public.check_referral_remove(uuid) from public, anon;
grant execute on function public.check_referral_remove(uuid) to authenticated, service_role;
revoke all on function public.referral_payout_pay(uuid,text,uuid) from public, anon;
grant execute on function public.referral_payout_pay(uuid,text,uuid) to authenticated, service_role;
revoke all on function public.referral_payouts_pay_bulk(uuid[],text,uuid) from public, anon;
grant execute on function public.referral_payouts_pay_bulk(uuid[],text,uuid) to authenticated, service_role;
revoke all on function public.referral_payouts_unpaid(uuid,date,date) from public, anon;
grant execute on function public.referral_payouts_unpaid(uuid,date,date) to authenticated, service_role;
revoke all on function public.check_group_due(uuid,text) from public, anon, authenticated, service_role;   -- ★21: live proacl {postgres} のみ＝内部専用の再掲
revoke all on function public.check_recalc(uuid) from public, anon, authenticated, service_role;   -- ★21: live proacl {postgres} のみ＝内部専用の再掲
revoke all on function public.check_close(uuid,uuid) from public, anon;
grant execute on function public.check_close(uuid,uuid) to authenticated, service_role;   -- ★21: live proacl の再掲
revoke all on function public.check_void(uuid,text) from public, anon;
grant execute on function public.check_void(uuid,text) to authenticated, service_role;   -- ★21: live proacl の再掲
revoke all on function public.check_merge(uuid,uuid,text,uuid) from public, anon;
grant execute on function public.check_merge(uuid,uuid,text,uuid) to authenticated, service_role;   -- ★21: live proacl の再掲
revoke all on function public.daily_report_close(uuid,date,integer,integer,integer,integer,text,boolean,uuid) from public, anon;
grant execute on function public.daily_report_close(uuid,date,integer,integer,integer,integer,text,boolean,uuid) to authenticated, service_role;   -- ★21: live proacl の再掲
revoke all on function public.demo_org_reset(uuid,jsonb,text) from public, anon;
grant execute on function public.demo_org_reset(uuid,jsonb,text) to service_role;   -- ★21: live proacl の再掲

commit;
