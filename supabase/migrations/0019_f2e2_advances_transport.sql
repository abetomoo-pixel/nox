-- 0019_f2e2_advances_transport: F2e-2 — 前借り(advances)／送り実費(transport) の器＋発行/取消＋okuri_mode
--   ① advances（前借り・cast 債務・receivables 同型 partial＋繰越 deduct_period あり・パターン1）
--   ② transport（送り実費・cast 負担・partial・繰越なし＝deduct_period 列なし・パターン1）
--   ③ stores.settings_json.okuri_mode（'flat'＝一律送り代 / 'actual'＝実費）を owner が切替（set_store_okuri_mode）
--   ④ 発行/取消 RPC（adv_issue/adv_cancel/transport_issue/transport_cancel・manager 以上・audit）
--      transport_issue は okuri_mode='actual' でのみ受理（'flat' の店では実費入力を弾く＝#8 排他を構造的に担保）
--
--  ※ payroll_finalize の advance/transport 遷移結線は mig0020（既存 RPC 改修＝差分照合のためファイル分離）。
--    本 mig は純加算（新テーブル＋新 RPC＋既存 RPC 非改修）＝独立適用・独立検証可。
--
-- 翻訳元・裁定参照:
--  - F2e-1（mig0018 receivables partial モデルP）を advances に同型踏襲。transport は繰越なしの派生。
--  - F2e-2 plan 裁定（相談役ロック）:
--    L1 前借り＝暫定天引きモデル（前払い精算への切替余地は設計書明記・現状は純天引き＝モック忠実）。
--    L3'（#8 排他）＝店設定 okuri_mode で構造的排他。okuri_mode='flat' の店は transport_issue を弾く（実費入力不可
--      ＝一律送り代[fixedDed 内]と送り実費[okuriDeduct]の併存が構造的に起きない）。deductions マスタに kind 列は
--      足さない（汎用控除マスタを触らない・送り代概念の二重管理を作らない）。okuri_mode='actual' の店で一律送り代を
--      deductions に入れた場合の警告は /payroll 側（block しない）。送り代の可否/上限 enforcement は専門家ゲート留保。
--    L4 引き当て順序＝送り→前借り→売掛（カテゴリ内 FIFO・共通 budget）。繰越＝transport なし／advances あり／売掛 あり。
--  - 一次実測（F2e-2 事前）: 店設定は個別列でなく stores.settings_json 相乗り（biz_cutoff_hm/card_tax_rate/service_rate
--    と同一場所・同一読み出し規約 coalesce(nullif(trim(->>'key'),''),既定)）。okuri_mode も settings_json キーに置く
--    （stores への ALTER 不要）。既定 'flat'＝現行踏襲。stores.settings_json の書込 RPC は既存になし＝
--    set_store_okuri_mode を新設（owner 限定・jsonb_set で okuri_mode キーのみ書換）。
--    1 receivable=1 cast と同じく 1 advance/1 transport=1 cast（按分なし・cast_id not null）。
--
-- 実装ノート:
--  【1】パターン1（cast は自分の行のみ）: SELECT は標準店スコープ＋(auth_role()<>'cast' or cast_id=auth_cast_id())。
--      customer_id 概念は持たない（receivables のパターン2 は客情報保護が理由＝advances/transport は不要）。
--      cast が /mine で自分の前借り/送り残を確定給与明細と照合できる（check_cast_backs と同型）。書込ポリシー0＝RPC のみ。
--  【2】partial: deducted_amount（<=amount・cross-column check）。全額で status='deducted'。advances は未満なら open のまま
--      deduct_period=翌 period 繰越（receivables 同型）。transport は繰越なし＝未満でも open のまま据置（deduct_period 列なし
--      ＝当該 period に引ける分だけ引き、残は再回収しない＝L4 裁定）。遷移は mig0020 finalize が行う（本 mig は器のみ）。
--  【3】発行 RPC（manager 以上）: cast は org+store 一致を server 照合（1 cast=1 行の紐付け）。amount>0。全書込 audit（原則6）。
--      adv_issue/transport_issue とも paid 期間ガード（発行 period の run が paid なら拒否＝凍結済み period に stranded
--      行を作らない・advances は advanced_on→period／transport は biz_date→period）。incentive_publish と同型。
--  【4】transport_issue の okuri_mode ガード: stores.settings_json->>'okuri_mode' が 'actual' でなければ拒否（fail-closed
--      ＝'flat'/未設定/不正は全て拒否）。加えて paid 期間ガード（to_char(biz_date,'YYYY-MM') が paid の run なら拒否
--      ＝incentive_publish と同型・凍結済み period に stranded 行を作らない）。
--  【5】取消 RPC: status='open' かつ deducted_amount=0 のみ cancel 可（一部でも finalize で天引き済みは拒否＝
--      check_void の settled 拒否と同思想・宙吊り防止）。paid 期間ガードは deducted_amount=0 条件が包含（未天引き＝未確定）。
--  【6】二重防御標準型: 全 RPC 冒頭 null guard（auth_org_id() is null→forbidden）・org 照合・ロール判定ハードコード・
--      revoke public,anon＋grant authenticated。set_store_okuri_mode は owner 限定（店ポリシー＝D3a と同格）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) テーブル: RLS 有効・SELECT ポリシー1本ずつ・列
--   select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace
--     and relname in ('advances','transport') order by relname;
--   select tablename, policyname, cmd from pg_policies where schemaname='public'
--     and tablename in ('advances','transport') order by tablename;  -- 期待 SELECT 各1本
--   select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema='public' and table_name in ('advances','transport') order by table_name, ordinal_position;
--   -- 2) 制約（deducted_amount<=amount）・partial index なし・cast_id,status 索引
--   select conname, conrelid::regclass from pg_constraint
--     where conname in ('advances_deducted_le_amount','transport_deducted_le_amount');
--   -- 3) grant 面: authenticated=SELECT のみ（G1 自動確認）
--   select relname, coalesce(array_to_string(relacl,','),'(default)') from pg_class
--     where relnamespace='public'::regnamespace and relname in ('advances','transport') order by relname;
--   -- 4) RPC prosrc/proacl（承認版と一字照合・authenticated grant）
--   select proname, prosrc from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('adv_issue','adv_cancel','transport_issue','transport_cancel','set_store_okuri_mode') order by proname;
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('adv_issue','adv_cancel','transport_issue','transport_cancel','set_store_okuri_mode') order by proname;
--   -- 5) 動作アンカー（JWT/service 要＝F2e-2 verify 追記コミットで実施）:
--   --    anon-guard … 5 RPC anon BLOCKED・advances/transport anon SELECT DENIED。
--   --    rls … パターン1（cast は自分の advance/transport のみ・他 cast 0行・他店 0行・クロス org 拒否）・
--   --      発行 manager 成功/staff・cast 拒否・cancel の settled 拒否・transport_issue の okuri flat 拒否/paid 拒否・
--   --      set_store_okuri_mode owner のみ・manager 拒否・不正 mode 拒否。
--   --    grants … authenticated=SELECT のみ（G1）。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① advances（前借り・cast 債務・partial＋繰越・パターン1）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.advances (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  cast_id         uuid not null references public.casts(id),
  amount          int  not null check (amount > 0),
  deducted_amount int  not null default 0 check (deducted_amount >= 0),
  status          text not null default 'open' check (status in ('open','deducted','cancelled')),
  deduct_period   text check (deduct_period is null or deduct_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  advanced_on     date not null,          -- 前借り実行日（period 帰属の基準＝coalesce(deduct_period, to_char(advanced_on,'YYYY-MM'))）
  note            text,
  created_by      uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelled_by    uuid references public.users(id),
  cancelled_at    timestamptz,
  constraint advances_deducted_le_amount check (deducted_amount <= amount)
);
create index if not exists advances_cast_status_idx on public.advances (cast_id, status);
create index if not exists advances_store_idx        on public.advances (store_id);
create index if not exists advances_org_idx          on public.advances (org_id);

-- ══════════════════════════════════════════════════════════════
-- ② transport（送り実費・cast 負担・partial・繰越なし・パターン1）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.transport (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  cast_id         uuid not null references public.casts(id),
  amount          int  not null check (amount > 0),
  deducted_amount int  not null default 0 check (deducted_amount >= 0),
  status          text not null default 'open' check (status in ('open','deducted','cancelled')),
  biz_date        date not null,          -- 送り実費発生の営業日（cutoff 正規化済みを渡す・period=to_char(biz_date,'YYYY-MM')・繰越なし）
  note            text,
  created_by      uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelled_by    uuid references public.users(id),
  cancelled_at    timestamptz,
  constraint transport_deducted_le_amount check (deducted_amount <= amount)
);
create index if not exists transport_cast_status_idx on public.transport (cast_id, status);
create index if not exists transport_store_idx        on public.transport (store_id);
create index if not exists transport_org_idx          on public.transport (org_id);

-- ── updated_at トリガ ─────────────────────────────────────────
drop trigger if exists advances_touch_updated_at  on public.advances;
drop trigger if exists transport_touch_updated_at on public.transport;
create trigger advances_touch_updated_at  before update on public.advances  for each row execute function public.touch_updated_at();
create trigger transport_touch_updated_at before update on public.transport for each row execute function public.touch_updated_at();

-- ── RLS（パターン1・cast は自分の行のみ・実装ノート【1】）──────────
alter table public.advances  enable row level security;
alter table public.transport enable row level security;

drop policy if exists advances_select on public.advances;
create policy advances_select on public.advances
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

drop policy if exists transport_select on public.transport;
create policy transport_select on public.transport
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );
-- 書込ポリシーは作らない（INSERT/UPDATE/DELETE ともクライアント不可・RPC 経由のみ）

-- ── grant 標準型（revoke all → SELECT のみ戻す）────────────────
revoke all on table public.advances  from public, anon, authenticated;
revoke all on table public.transport from public, anon, authenticated;
grant select on table public.advances  to authenticated;
grant select on table public.transport to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ set_store_okuri_mode（owner 限定・settings_json.okuri_mode のみ書換・audit）
--    店ポリシー変更＝D3a（owner のみ）。jsonb_set で okuri_mode キーだけ差し替え（他設定は不変）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_store_okuri_mode(
  p_store_id uuid,
  p_mode     text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_mode is null or p_mode not in ('flat','actual') then raise exception 'bad mode'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_mode}', to_jsonb(p_mode), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_mode', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_mode', v_prev), jsonb_build_object('okuri_mode', p_mode), p_store_id);
end $$;
revoke execute on function public.set_store_okuri_mode(uuid, text) from public, anon;
grant  execute on function public.set_store_okuri_mode(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ adv_issue（前借り発行・manager 以上・audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.adv_issue(
  p_store_id    uuid,
  p_cast_id     uuid,
  p_amount      int,
  p_advanced_on date,
  p_note        text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_store record;
  v_cast  record;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_advanced_on is null then raise exception 'bad date'; end if;
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- paid 期間ガード（transport_issue 同型・凍結済み period に stranded 前借りを作らない・実装ノート【3】）
  --   前借りの period 帰属 = to_char(advanced_on,'YYYY-MM')（deduct_period は finalize が partial 時に設定）。
  --   paid 済み period に発行すると当該 period の finalize が 'run paid' で拒否され回収不能＝宙吊りになるため弾く。
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_advanced_on, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  -- cast は org+store 一致を server 照合（1 advance=1 cast）
  select id into v_cast from public.casts
    where id = p_cast_id and org_id = public.auth_org_id() and store_id = p_store_id;
  if v_cast.id is null then raise exception 'bad cast'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.advances (org_id, store_id, cast_id, amount, advanced_on, note, created_by)
  values (v_store.org_id, p_store_id, p_cast_id, p_amount, p_advanced_on, nullif(trim(coalesce(p_note,'')), ''), v_actor)
  returning id into v_id;

  perform public.audit_log_write('adv_issue', 'advances:' || v_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'advanced_on', p_advanced_on), p_store_id);
  return v_id;
end $$;
revoke execute on function public.adv_issue(uuid, uuid, int, date, text) from public, anon;
grant  execute on function public.adv_issue(uuid, uuid, int, date, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑤ adv_cancel（前借り取消・manager 以上・未天引き[open かつ deducted_amount=0]のみ・audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.adv_cancel(
  p_advance_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row   record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.advances where id = p_advance_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 一部でも天引き済み（deducted_amount>0）or 既に deducted/cancelled は拒否（宙吊り防止・実装ノート【5】）
  if v_row.status <> 'open' or v_row.deducted_amount > 0 then raise exception 'advance settled'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.advances
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_advance_id;

  perform public.audit_log_write('adv_cancel', 'advances:' || p_advance_id::text,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'cancelled'), v_row.store_id);
  return p_advance_id;
end $$;
revoke execute on function public.adv_cancel(uuid) from public, anon;
grant  execute on function public.adv_cancel(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑥ transport_issue（送り実費発行・manager 以上・okuri_mode='actual' 必須＋paid ガード・audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.transport_issue(
  p_store_id uuid,
  p_cast_id  uuid,
  p_amount   int,
  p_biz_date date,
  p_note     text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_store record;
  v_cast  record;
  v_mode  text;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- L3' 構造的排他: okuri_mode='actual' の店でのみ実費入力を受理（fail-closed＝flat/未設定/不正は拒否）
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode <> 'actual' then raise exception 'okuri not actual'; end if;
  -- paid 期間ガード（凍結済み period に stranded 送りを作らない・incentive_publish 同型）
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_cast from public.casts
    where id = p_cast_id and org_id = public.auth_org_id() and store_id = p_store_id;
  if v_cast.id is null then raise exception 'bad cast'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by)
  values (v_store.org_id, p_store_id, p_cast_id, p_amount, p_biz_date, nullif(trim(coalesce(p_note,'')), ''), v_actor)
  returning id into v_id;

  perform public.audit_log_write('transport_issue', 'transport:' || v_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'biz_date', p_biz_date), p_store_id);
  return v_id;
end $$;
revoke execute on function public.transport_issue(uuid, uuid, int, date, text) from public, anon;
grant  execute on function public.transport_issue(uuid, uuid, int, date, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑦ transport_cancel（送り実費取消・manager 以上・未天引きのみ・audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.transport_cancel(
  p_transport_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row   record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.transport where id = p_transport_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'open' or v_row.deducted_amount > 0 then raise exception 'transport settled'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.transport
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_transport_id;

  perform public.audit_log_write('transport_cancel', 'transport:' || p_transport_id::text,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'cancelled'), v_row.store_id);
  return p_transport_id;
end $$;
revoke execute on function public.transport_cancel(uuid) from public, anon;
grant  execute on function public.transport_cancel(uuid) to authenticated;

commit;
