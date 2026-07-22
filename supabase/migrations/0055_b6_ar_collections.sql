-- 0055_b6_ar_collections.sql
-- B6 売掛回収＝完全形（裁定14・方向1確定・Opus 起草・★money-core 非接触）。
--   回収消込＋帳簿反映（回収日計上）＋給与天引き（本人同意）を1トランザクションで導入する。
--   checks / check_lines / payments は1文字も変異させない（発生経路 check_pay は無改修・回収済の
--   void 拒否は既存 check_void ガードが被覆済み＝mig 対象外）。慎重域は report-layer
--   （daily_report_aggregate/close/reclose）のみ＝ar_collected は default 0 ゆえ既存/無回収ケースの
--   diff 式は不変（後方互換・3ゲート pay83/receipt52/payroll112 不変）。
--
-- 設計（裁定14・相談役承認・推奨案一式）:
--  設計1 案1-A＝全額回収のみ（partial なし・collected_amount 列を作らない＝payroll_finalize の
--    deducted_amount+amt 上限式に非波及）。モック現物「回収」は b.amount 全額＝教訓D 一致。
--  設計2 案c＝独立テーブル ar_collections（payments/checks 不変・snapshot は派生のまま）。
--    ★方向1：回収日（ar_collections.biz_date）に現金 in を計上・発生日の凍結日報は不可侵。
--    ★現金別掲：ar_collected は現金売上(cash)に混ぜず別列。理論在高にのみ加算し diff 整合。
--    非現金回収（card/other）は債権消込のみ＝ドロワー非加算（method='cash' のみ ar_collected 集計）。
--  設計3 案3-A＝受領単位 consent（receivables.consent_at/consent_by）。天引きの実減算は既存
--    payroll_finalize（ar_deducted 消費・無改修）＝本 mig は deduct_from_cast 印付け＋consent 記録まで。
--  設計4 案4-A＝receivables_select の cast 腕を除去（放置不可の必須是正・cast=receivables 0行・
--    パターン2 復帰＝生売掛の customer_id を cast に見せない）。cast は payslip.breakdown_json.ar で自分の
--    天引き額のみ参照（既存・/mine は生 receivables を読まない＝app 実測）。
--  設計5＝check_void 既済（回収済 status in ('collected','deducted') 拒否ガードが live に存在＝改修なし）。
--  設計6 案6-B＝発生 enforcement は ar_policy_ok 空フックのみ設置（★check_pay へは結線しない＝money-core
--    保全）。#38 弁護士回答時に別 mig で check_pay の ar 分岐 INSERT 直前へ1行挿入する（差し替え1箇所）。
--  設計7 案7-A＝回収 UI は report 画面の暫定売掛タブ（UI フェーズ・post-launch で C3 仕訳画面へ移設）。
--
-- 差し替え1箇所（法務後・署名不変で本体差替）:
--  consent_ok(receivable_id, consent)  … 労基法（全額払い・本人同意・撤回）。現状は渡された同意フラグ要求のみ。
--  ar_policy_ok(store, amount)          … #38 風営法2025 売掛規制（可否/上限）。現状は無条件許可・未結線。
--
-- 写経元（2026-07-22 fresh dump 起点・記憶再構成なし）:
--  - テーブル器・RLS・grant 標準型＝transport（mig0019）逐語（biz_date 型・パターン踏襲・cast 腕は外す）。
--  - daily_report_aggregate/close/reclose＝live prosrc（pg_get_functiondef）写経＋ar_collected 追加のみ
--    （close の税率は stores.card_tax_rate 列読み＝mig0051 後の live を正とし 0010 本文は使わない）。
--  - RPC 二重防御・冪等・audit＝check_pay/payment_record_add/adv_cancel の逐語規約。
--
-- 教訓B（共有テーブル波及の事前棚卸し・裁定9）:
--  - daily_reports へ ar_collected 列追加／receivables へ consent 2列追加 → 列数・CHECK 総数を
--    ハードコードする verify assert は不在（G25/G26 は stores/checks 専任 named・G1/G2 は列非依存・
--    G5 は TABLES.length 参照）＝波及ゼロ。
--  - ar_collections 新テーブル → verify:nox-grants の TABLES 配列へ 'ar_collections' を足す
--    （G1/G2/G5 が自動被覆・count は .length 追従＝ハードコード数字ではない）＝verify 追加フェーズで手当。
--  - receivables_select 変更 → verify:nox-rls の receivables cast 可視 assert を「cast=0行」へ更新＋能動 assert 追加。
--  - 新 RPC 2本 → verify:nox-anon-guard に anon BLOCKED 追加・verify:nox-grants に G29 で ACL positive 追加。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 0) 貼り先証明（1行返れば正・エラー/0件なら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) ar_collections: RLS 有効・SELECT ポリシー1本・列・grant（authenticated=SELECT のみ）
--   select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname='ar_collections';
--   select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename='ar_collections';
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name='ar_collections' order by ordinal_position;
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name='ar_collections' order by grantee, privilege_type;
--   -- 2) receivables consent 2列＋新 receivables_select（cast 腕除去＝pattern2 復帰）
--   select column_name from information_schema.columns where table_schema='public'
--     and table_name='receivables' and column_name in ('consent_at','consent_by');
--   select pg_get_expr(polqual, polrelid) from pg_policy where polrelid='public.receivables'::regclass;
--   -- 3) daily_reports.ar_collected 列（NOT NULL default 0 CHECK>=0）
--   select column_name, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name='daily_reports' and column_name='ar_collected';
--   -- 4) 新 RPC 2本＋空フック2本の prosrc/proacl（承認版と一字照合）
--   select proname, prosrc from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('receivable_collect','receivable_mark_deduct','consent_ok','ar_policy_ok') order by proname;
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('receivable_collect','receivable_mark_deduct','consent_ok','ar_policy_ok') order by proname;
--   -- 5) 改修3本に ar_collected が入ったか（report-layer）
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('daily_report_aggregate','daily_report_close','daily_report_reclose')
--     and pg_get_functiondef(oid) ilike '%ar_collected%';
--   -- 6) ★money-core 非改修の証明（下記3本の prosrc が本 mig 前後で不変＝ハッシュ照合推奨）
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('check_pay','check_close','check_void');  -- 本 mig では触らない
--   -- 7) 動作アンカー（JWT/service 要＝verify 追記/単発プローブで実施）:
--   --    anon-guard … receivable_collect/receivable_mark_deduct anon BLOCKED・ar_collections anon SELECT DENIED。
--   --    rls … cast=receivables 0行（pattern2）・owner/manager 回収成功・他店/他org 拒否・open 以外は 'not open'・
--   --      mark_deduct の cast なし拒否/consent 無し拒否・状態冪等 return。
--   --    帳簿 … 回収→daily_report_close で ar_collected 加算・diff=counted−(float+cash+ar_collected−expense−payout)。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① ar_collections（売掛回収の消込台帳・append-only・biz_date=回収営業日・パターン: cast 除外）
--    transport（mig0019）の器を踏襲（biz_date 型・partial なし＝全額回収）。RLS は cast 腕を持たない
--    （回収は責任者操作・生売掛は cast 非開示＝receivables 是正と同流儀）。
-- ══════════════════════════════════════════════════════════════
create table if not exists public.ar_collections (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  receivable_id uuid not null references public.receivables(id),
  cast_id       uuid references public.casts(id),                         -- 発生時の責任 cast（客のみ売掛は null）
  customer_id   uuid references public.customers(id) on delete set null,  -- 客（伝票由来・null 可）
  biz_date      date not null,                                            -- ★回収の営業日（方向1＝この日の帳簿に現金 in）
  amount        int  not null check (amount > 0),                         -- 全額回収＝receivables.amount
  method        text not null default 'cash' check (method in ('cash','card','other')), -- 'cash' のみ理論在高加算
  note          text,
  idem_key      uuid not null,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  unique (idem_key)
);
create index if not exists ar_collections_store_date_idx  on public.ar_collections (store_id, biz_date);
create index if not exists ar_collections_receivable_idx  on public.ar_collections (receivable_id);
create index if not exists ar_collections_org_idx         on public.ar_collections (org_id);

-- RLS: owner/manager/staff(can_register)・cast 除外（生売掛の可視面＝receivables 是正と一致）
alter table public.ar_collections enable row level security;
drop policy if exists ar_collections_select on public.ar_collections;
create policy ar_collections_select on public.ar_collections
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() in ('owner','manager')
         or (public.auth_role() = 'staff' and public.auth_staff_can_register()))
  );
-- 書込ポリシーは作らない（INSERT/UPDATE/DELETE ともクライアント不可・RPC 経由のみ）

-- grant 標準型（revoke all → SELECT のみ戻す・REFERENCES/TRIGGER 取りこぼし防止＝mig0049→0050 教訓）
revoke all on table public.ar_collections from public, anon, authenticated;
grant select on table public.ar_collections to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ② receivables へ consent 2列追加（設計3 案3-A・受領単位の本人同意記録）
-- ══════════════════════════════════════════════════════════════
alter table public.receivables
  add column if not exists consent_at timestamptz,
  add column if not exists consent_by uuid references public.users(id);

-- ══════════════════════════════════════════════════════════════
-- ③ daily_reports へ ar_collected 列追加（設計2 案c・現金回収分＝理論在高加算対象・別掲）
--    NOT NULL default 0＝既存行は 0 backfill（無回収＝diff 式不変・後方互換）。
-- ══════════════════════════════════════════════════════════════
alter table public.daily_reports
  add column if not exists ar_collected int not null default 0 check (ar_collected >= 0);

-- ══════════════════════════════════════════════════════════════
-- ④ receivables_select 置換（設計4 案4-A・cast 腕を除去＝pattern2 復帰・放置不可の必須是正）
--    旧: owner/manager/staff(can_register)/cast(can_register) → 新: cast 腕を落とす（cast=0行）。
-- ══════════════════════════════════════════════════════════════
drop policy if exists receivables_select on public.receivables;
create policy receivables_select on public.receivables
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() in ('owner','manager')
         or (public.auth_role() = 'staff' and public.auth_staff_can_register()))
  );

-- ══════════════════════════════════════════════════════════════
-- ⑤ 空フック 2本（差し替え1箇所・内部専用＝4ロール revoke・grant なし）
--    SECURITY DEFINER は将来の本体差替（consent/settings 表参照）で属性を変えないため据置。
-- ══════════════════════════════════════════════════════════════
-- consent_ok: 労基法（全額払い・本人同意・撤回）。現状は呼び出し元が渡す同意フラグを要求するだけ。
create or replace function public.consent_ok(p_receivable_id uuid, p_consent boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_consent, false);
$$;
revoke execute on function public.consent_ok(uuid, boolean) from public, anon, authenticated, service_role;

-- ar_policy_ok: #38 風営法2025 売掛規制（可否/上限）。現状は無条件許可＝enforcement 留保。
-- ★未結線＝check_pay からは呼ばない（money-core 保全）。弁護士回答時に別 mig で check_pay の
--   ar 分岐 receivables INSERT 直前へ `if not public.ar_policy_ok(v_chk.store_id, p_amount) then raise` を1行挿入。
create or replace function public.ar_policy_ok(p_store_id uuid, p_amount int)
returns boolean language sql stable security definer set search_path = public as $$
  select true;
$$;
revoke execute on function public.ar_policy_ok(uuid, int) from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ⑥ receivable_collect（回収消込・owner/manager・全額回収・冪等・audit・設計1 案1-A）
--    receivables を open→collected へ消込し ar_collections に回収日の現金 in を1行記録。
--    ★checks/check_lines/payments は触らない（money-core 非接触）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.receivable_collect(
  p_receivable_id uuid,
  p_biz_date      date,
  p_method        text default 'cash',
  p_note          text default null,
  p_idem_key      uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_recv   record;
  v_method text;
  v_actor  uuid;
  v_id     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  v_method := coalesce(nullif(trim(coalesce(p_method,'')),''), 'cash');
  if v_method not in ('cash','card','other') then raise exception 'bad method'; end if;

  -- gate（org 照合 → owner/manager 自店）
  select * into v_recv from public.receivables where id = p_receivable_id;
  if v_recv.id is null or v_recv.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_recv.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★冪等・並行リプレイ解決は payment_record_add の live prosrc と同型（前段 idem チェック →
  --   FOR UPDATE 直列化点 → INSERT on conflict do nothing → fallback SELECT）。相違は直列化点のみ＝
  --   payment_record_add は payslip(run,cast) を、本 RPC は receivable 行をロックする。
  -- 冪等（前段・org/ロール照合の後＝org 外ユーザーのキー存在確認悪用を防ぐ）: 既存回収は返す
  select id into v_id from public.ar_collections where idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;

  -- 直列化点: receivable を FOR UPDATE（同一 receivable の並行呼びをコミット順へ一列化）
  select * into v_recv from public.receivables where id = p_receivable_id for update;
  -- ★冪等（後段・ロック内再チェック＝本修正の核）: ロック取得＝先行 Tx はコミット済ゆえ、同一 idem の
  --   コミット済回収がここで必ず可視になる（READ COMMITTED での戻り値欠落＝並行リプレイの穴を封鎖）。
  select id into v_id from public.ar_collections where idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;

  -- 消込は open のみ（回収済/天引き済/void は不可＝別 idem の二重回収を拒否）
  if v_recv.status <> 'open' then raise exception 'not open'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.ar_collections
    (org_id, store_id, receivable_id, cast_id, customer_id, biz_date, amount, method, note, idem_key, created_by)
  values
    (v_recv.org_id, v_recv.store_id, p_receivable_id, v_recv.cast_id, v_recv.customer_id,
     p_biz_date, v_recv.amount, v_method, nullif(trim(coalesce(p_note,'')),''), p_idem_key, v_actor)
  on conflict (idem_key) do nothing
  returning id into v_id;
  if v_id is null then
    -- ロック内再チェック済ゆえ通常不到達・belt-and-suspenders（payment_record_add 同型）
    select id into v_id from public.ar_collections where idem_key = p_idem_key; return v_id;
  end if;

  update public.receivables set status = 'collected' where id = p_receivable_id and status = 'open';

  perform public.audit_log_write('receivable_collect', 'receivables:' || p_receivable_id::text,
    jsonb_build_object('status', 'open', 'deducted_amount', v_recv.deducted_amount),
    jsonb_build_object('status', 'collected', 'collection_id', v_id, 'biz_date', p_biz_date,
                       'amount', v_recv.amount, 'method', v_method),
    v_recv.store_id);
  return v_id;
end $$;
revoke execute on function public.receivable_collect(uuid, date, text, text, uuid) from public, anon;
grant  execute on function public.receivable_collect(uuid, date, text, text, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑦ receivable_mark_deduct（給与天引き対象化＋本人同意記録・owner/manager・状態冪等・設計3 案3-A）
--    deduct_from_cast=true 印付け＋consent_at/consent_by 記録。実減算は既存 payroll_finalize（無改修）。
--    ★idem_key は持たない（印付けは状態冪等＝deduct_from_cast 既 true なら return）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.receivable_mark_deduct(
  p_receivable_id uuid,
  p_consent       boolean,
  p_note          text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_recv  record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_recv from public.receivables where id = p_receivable_id;
  if v_recv.id is null or v_recv.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_recv.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 状態冪等: 既に天引き対象なら return（consent は初回のみ・再呼びで上書きしない）
  if v_recv.deduct_from_cast then return p_receivable_id; end if;
  -- 印付けは open かつ 責任 cast あり のみ（客のみ売掛は cast 天引き不可）
  if v_recv.status <> 'open' then raise exception 'not open'; end if;
  if v_recv.cast_id is null then raise exception 'no cast'; end if;
  -- ★差し替え1箇所（労基法・全額払い・本人同意・撤回）＝consent_ok 単一関数
  if not public.consent_ok(p_receivable_id, p_consent) then raise exception 'consent required'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.receivables
     set deduct_from_cast = true, consent_at = now(), consent_by = v_actor
   where id = p_receivable_id and status = 'open';

  perform public.audit_log_write('receivable_mark_deduct', 'receivables:' || p_receivable_id::text,
    jsonb_build_object('deduct_from_cast', false),
    jsonb_build_object('deduct_from_cast', true, 'consent_by', v_actor,
                       'note', nullif(trim(coalesce(p_note,'')),'')),
    v_recv.store_id);
  return p_receivable_id;
end $$;
revoke execute on function public.receivable_mark_deduct(uuid, boolean, text) from public, anon;
grant  execute on function public.receivable_mark_deduct(uuid, boolean, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑧ daily_report_aggregate 改修（live 写経＋ar_collected 1源追加・biz_date 直・method='cash' のみ）
--    STABLE・内部専用（4ロール revoke）不変。checks/payments 集計は逐語不変（money-core 非接触）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.daily_report_aggregate(
  p_store_id  uuid,
  p_biz_date  date,
  p_cutoff_hm text,
  p_tax_rate  int
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org   uuid;
  v_start timestamptz;
  v_end   timestamptz;
  v jsonb;
begin
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  -- [D cutoff JST, D+1 cutoff JST)
  v_start := ((p_biz_date::text || ' ' || p_cutoff_hm) )::timestamp at time zone 'Asia/Tokyo';
  v_end   := (((p_biz_date + 1)::text || ' ' || p_cutoff_hm))::timestamp at time zone 'Asia/Tokyo';
  select jsonb_build_object(
    'open_checks', (select count(*) from public.checks c
                     where c.org_id = v_org and c.store_id = p_store_id and c.status = 'open'
                       and c.started_at >= v_start and c.started_at < v_end),
    'slips',  (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'guests', (select coalesce(sum(c.people), 0) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
                  and c.started_at >= v_start and c.started_at < v_end),
    'dohan_checks', (select count(*) from public.checks c
                where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed' and c.nom_type = 'dohan'
                  and c.started_at >= v_start and c.started_at < v_end),
    'cash',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'cash'
                 and c.started_at >= v_start and c.started_at < v_end),
    'card',  (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'card'
                 and c.started_at >= v_start and c.started_at < v_end),
    'uri',   (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'ar'
                 and c.started_at >= v_start and c.started_at < v_end),
    'other', (select coalesce(sum(p.amount), 0) from public.payments p
               join public.checks c on c.id = p.check_id
               where c.org_id = v_org and p.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and p.method = 'other'
                 and c.started_at >= v_start and c.started_at < v_end),
    'drink_sales', (select coalesce(sum(l.line_total), 0) from public.check_lines l
               join public.checks c on c.id = l.check_id
               where c.org_id = v_org and l.org_id = v_org
                 and c.store_id = p_store_id and c.status = 'closed' and l.kind in ('drink','champ')
                 and c.started_at >= v_start and c.started_at < v_end),
    -- ★B6（mig0055）: 回収現金（別掲・biz_date 直・method='cash' のみ＝理論在高加算対象）。
    --   checks/payments 非依存＝発生日 uri との二重計上は起きない（別経路・突合は receivables 直 SELECT）。
    'ar_collected', (select coalesce(sum(x.amount), 0) from public.ar_collections x
               where x.org_id = v_org and x.store_id = p_store_id
                 and x.biz_date = p_biz_date and x.method = 'cash')
  ) into v;
  return v || jsonb_build_object('card_tax', round(((v->>'card')::int) * p_tax_rate / 100.0)::int);
end $$;
revoke execute on function public.daily_report_aggregate(uuid, date, text, int)
  from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ⑨ daily_report_close 改修（live 写経＋ar_collected 凍結＋diff 式へ加算）
--    ★diff = counted − (float + cash + ar_collected − expense − payout)（理論在高に回収現金を含める）。
--    ar_collected=0 の日は従前の diff と一致（後方互換）。税率は stores.card_tax_rate 列読み（mig0051・live）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.daily_report_close(
  p_store_id     uuid,
  p_biz_date     date,
  p_expense      int default 0,
  p_cash_payout  int default 0,
  p_cash_float   int default 0,
  p_counted_cash int default null,
  p_note         text default null,
  p_force        boolean default false,
  p_idem_key     uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_settings jsonb; v_cutoff text; v_rate int;
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int; v_ar int;
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

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2＋B6】diff = counted − (float + cash + ar_collected − expense − payout)
  --   （モック H=Oi−q に回収現金を理論在高へ加算＝ドロワー実査整合）。counted 未入力時は null。
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int + v_ar
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0)) end;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, ar_collected, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by)
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int, v_ar,
     coalesce(p_expense,0), coalesce(p_cash_payout,0), coalesce(p_cash_float,0),
     p_counted_cash, v_diff, p_note,
     v_cutoff, v_rate, p_idem_key, v_actor)
  returning id into v_id;
  perform public.audit_log_write('daily_report_close', 'daily_reports:' || v_id::text, null,
    (select to_jsonb(d) from public.daily_reports d where d.id = v_id), p_store_id);
  return v_id;
end $$;
revoke execute on function public.daily_report_close(uuid, date, int, int, int, int, text, boolean, uuid) from public, anon;
grant  execute on function public.daily_report_close(uuid, date, int, int, int, int, text, boolean, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑩ daily_report_reclose 改修（live 写経＋ar_collected 再集計＋diff 式へ加算）
--    ★締め後に遅れて回収した分は reclose で ar_collected に拾われる（設計2 の遅延回収経路）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.daily_report_reclose(
  p_report_id    uuid,
  p_expense      int default null,
  p_cash_payout  int default null,
  p_cash_float   int default null,
  p_counted_cash int default null,
  p_note         text default null,
  p_force        boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_agg jsonb; v_before jsonb; v_diff int; v_ar int;
  v_expense int; v_payout int; v_float int; v_counted int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.daily_reports where id = p_report_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  v_before := to_jsonb(v_row);

  -- 再集計は凍結済みの cutoff / rate を使う（範囲定義・税率は初回締めから不変）
  v_agg := public.daily_report_aggregate(v_row.store_id, v_row.biz_date, v_row.biz_cutoff_hm, v_row.card_tax_rate);
  v_ar  := (v_agg->>'ar_collected')::int;
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  v_expense := coalesce(p_expense, v_row.expense);
  v_payout  := coalesce(p_cash_payout, v_row.cash_payout);
  v_float   := coalesce(p_cash_float, v_row.cash_float);
  v_counted := coalesce(p_counted_cash, v_row.counted_cash);
  if v_expense < 0 or v_payout < 0 or v_float < 0 or (v_counted is not null and v_counted < 0) then
    raise exception 'bad amount';
  end if;
  v_diff := case when v_counted is null then null
                 else v_counted - (v_float + (v_agg->>'cash')::int + v_ar - v_expense - v_payout) end;

  update public.daily_reports set
    cash = (v_agg->>'cash')::int, card_gross = (v_agg->>'card')::int, card_tax = (v_agg->>'card_tax')::int,
    uri = (v_agg->>'uri')::int, other = (v_agg->>'other')::int, drink_sales = (v_agg->>'drink_sales')::int,
    dohan_checks = (v_agg->>'dohan_checks')::int, slips = (v_agg->>'slips')::int, guests = (v_agg->>'guests')::int,
    open_checks_count = (v_agg->>'open_checks')::int, ar_collected = v_ar,
    expense = v_expense, cash_payout = v_payout, cash_float = v_float,
    counted_cash = v_counted, diff = v_diff,
    note = coalesce(p_note, note),
    reclosed_count = reclosed_count + 1
  where id = p_report_id;
  perform public.audit_log_write('daily_report_reclose', 'daily_reports:' || p_report_id::text, v_before,
    (select to_jsonb(d) from public.daily_reports d where d.id = p_report_id), v_row.store_id);
  return p_report_id;
end $$;
revoke execute on function public.daily_report_reclose(uuid, int, int, int, int, text, boolean) from public, anon;
grant  execute on function public.daily_report_reclose(uuid, int, int, int, int, text, boolean) to authenticated;

commit;
