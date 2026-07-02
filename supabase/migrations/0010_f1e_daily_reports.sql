-- 0010_f1e_daily_reports: F1e — 日報（daily_reports スナップショット）＋ close/reclose RPC。
--                          0006/0007 適用済みが前提。設計書に日報テーブルは無い＝新設
--                          （§2.4 の後に「2.4b 日報」節を新設して同コミットで記録）。
--
-- 実体（plan 承認済み・モック抽出根拠）:
--  - スナップショット型。モックは close 時に日報累計へ加算（zx→Ms）＋「締め」概念＋
--    集計から導出できない入力項目（expense 諸経費・cash_payout 現金支払（送り・日払い等＝モック Mm）・
--    cash_float 釣銭準備金・counted_cash 実査）を持つ＝行が必要。
--  - 行の存在＝締め済み。draft 行は作らない（プレビューは manager 以上の RLS SELECT＋クライアント集計・
--    確定の権威は close 時のサーバ再集計）。plan の status(draft/closed) 列は不要と判断＝逸脱として明記。
--  - 確定後の void への追随は daily_report_reclose（再集計→新スナップショット・before→after audit・
--    reclosed_count++）。黙って動く数字を作らない。
--
-- 営業日境界（plan 承認済み）:
--  - biz_date D = [D cutoff JST, D+1 cutoff JST) に started_at が入る closed 伝票。
--  - cutoff は stores.settings_json.biz_cutoff_hm（既定 '06:00'）→ close 時に日報行へスナップショット。
--  - ★DB で時刻計算をする唯一の箇所（F1d 方針からの明示的逸脱）＝ lib/nox/biz-date.ts と
--    TS/DB 同値保証の対象（verify が境界前後の伝票で帰属一致を assert）。
--
-- 決定2点（レビュー条件）:
--  【1】範囲内に open 伝票が残る場合: 既定拒否（'open checks remain'）。p_force=true で強行し、
--      その場合 open_checks_count を日報行に記録（audit の after_json にも含まれる）。
--  【2】モックの「出金」（Mm＝現金支払: 送り・日払い等）は expense（諸経費）と別意味のため
--      独立列 cash_payout とする（統合すると違算分析ができない）。
--      diff のサーバ計算式はモックと一致:
--        diff = counted_cash − (cash_float + cash − expense − cash_payout)
--        （モック: H = Oi − q, q = float + cash − expense − Mm）。counted_cash 未入力時は null。
--
-- カードTAX（plan 承認済み・モック忠実）:
--  - 請求には乗せない。card_gross = Σcard 入金・card_tax = round(card_gross × rate%) を日報行に凍結。
--    rate は stores.settings_json.card_tax_rate（既定 5）→ 日報行へスナップショット。
--    請求時上乗せへの変更は実店舗ヒアリング後の判断（台帳残置）。
--
-- モックとの集計差（ヘッダー明記）:
--  - drink_sales = kind in ('drink','champ') の Σline_total（モック z と同一・bottle 含まず）。
--  - モックの「同伴料行（refId='dohan'）」は NOX の charge 行から識別できないため、
--    dohan_checks（nom_type='dohan' の伝票数）を集計。同伴料金額の分離には charge 行の細分類
--    （charge_kind）が必要＝台帳へ。
--  - モックの slips は会計回数（pay_group 単位）・groups は卓数だが、NOX の close は伝票単位のため
--    slips = closed 伝票数とし groups 列は持たない。
--
-- 権限: 閲覧はパターン2（cast 0行・staff は §1.2 report ✓ で閲覧可）。
--       close/reclose は owner/manager（現金の締め・実査は管理判断＝§1.2 report を閲覧 capability と解釈）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) RLS・ポリシー
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace and relname = 'daily_reports';
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'daily_reports';
--   -- 2) RPC 2本の存在と anon 不在
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname in ('daily_report_close','daily_report_reclose')
--   order by p.proname, r.rolname;
--   -- 3) prosrc 抜き取り（営業日範囲計算・diff 式・p_force）
--   select prosrc from pg_proc where proname = 'daily_report_close';

begin;

-- ── daily_reports（行の存在＝締め済み・店合計のみ＝cast 別数字を持たない）──
create table if not exists public.daily_reports (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id),
  store_id          uuid not null references public.stores(id),
  biz_date          date not null,
  -- 集計列（close 時にサーバ再集計して凍結）
  cash              int not null default 0 check (cash >= 0),
  card_gross        int not null default 0 check (card_gross >= 0),
  card_tax          int not null default 0 check (card_tax >= 0),   -- round(card_gross × rate%)
  uri               int not null default 0 check (uri >= 0),        -- 売掛（ar）
  other             int not null default 0 check (other >= 0),
  drink_sales       int not null default 0 check (drink_sales >= 0), -- kind drink+champ の Σline_total
  dohan_checks      int not null default 0 check (dohan_checks >= 0),
  slips             int not null default 0 check (slips >= 0),       -- closed 伝票数
  guests            int not null default 0 check (guests >= 0),      -- Σ people
  open_checks_count int not null default 0 check (open_checks_count >= 0), -- 【決定1】p_force 強行時の残 open 数
  -- 入力列（manager が締めで入れる）
  expense           int not null default 0 check (expense >= 0),     -- 諸経費
  cash_payout       int not null default 0 check (cash_payout >= 0), -- 現金支払（送り・日払い等＝モック Mm）
  cash_float        int not null default 0 check (cash_float >= 0),  -- 釣銭準備金
  counted_cash      int check (counted_cash is null or counted_cash >= 0), -- 実査
  diff              int,                                             -- 【決定2】counted−(float+cash−expense−payout)
  note              text,
  -- スナップショット設定（範囲定義・税率の凍結）
  biz_cutoff_hm     text not null check (biz_cutoff_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  card_tax_rate     int  not null check (card_tax_rate >= 0),
  -- 締めメタ
  close_idem_key    uuid,
  closed_by         uuid not null references public.users(id),
  closed_at         timestamptz not null default now(),
  reclosed_count    int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_id, biz_date)
);
create index if not exists daily_reports_store_date_idx on public.daily_reports (store_id, biz_date);
create index if not exists daily_reports_org_idx        on public.daily_reports (org_id);

drop trigger if exists daily_reports_touch_updated_at on public.daily_reports;
create trigger daily_reports_touch_updated_at before update on public.daily_reports
  for each row execute function public.touch_updated_at();

-- ── RLS: パターン2（cast 0行・staff 閲覧可＝§1.2 report ✓）──────
alter table public.daily_reports enable row level security;
drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

revoke all on table public.daily_reports from public, anon, authenticated;
grant select on table public.daily_reports to authenticated;

-- ── 内部ヘルパー: 営業日範囲の集計（close/reclose 共用・4ロール revoke）──
-- DB で時刻計算をする唯一の箇所（biz-date.ts と同一規則＝TS/DB 同値保証の対象）。
-- 防御深度: store の org を自ら引き、全サブクエリに org 条件を含める
-- （呼び出し元の org 照合に依存しない＝将来 F1f プレビュー RPC 等から再利用されても
--   照合漏れがクロステナント集計にならない。レビュー指摘反映）。
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
                 and c.started_at >= v_start and c.started_at < v_end)
  ) into v;
  return v || jsonb_build_object('card_tax', round(((v->>'card')::int) * p_tax_rate / 100.0)::int);
end $$;
revoke execute on function public.daily_report_aggregate(uuid, date, text, int)
  from public, anon, authenticated, service_role;

-- ── daily_report_close（締め・owner/manager・冪等キー・p_force）──
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
  v_exist record; v_agg jsonb; v_actor uuid; v_id uuid; v_diff int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  if coalesce(p_expense, -1) < 0 or coalesce(p_cash_payout, -1) < 0 or coalesce(p_cash_float, -1) < 0 then
    raise exception 'bad amount';
  end if;
  if p_counted_cash is not null and p_counted_cash < 0 then raise exception 'bad amount'; end if;
  select org_id, settings_json into v_owner, v_settings from public.stores where id = p_store_id;
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

  -- 設定スナップショット（既定 06:00 / 5%）
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  v_rate   := coalesce(nullif(coalesce(v_settings, '{}'::jsonb)->>'card_tax_rate', '')::int, 5);
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_rate < 0 then
    raise exception 'bad store settings';
  end if;

  v_agg := public.daily_report_aggregate(p_store_id, p_biz_date, v_cutoff, v_rate);

  -- 【決定1】open 伝票が範囲内に残る場合は既定拒否・p_force で強行（残数を記録）
  if (v_agg->>'open_checks')::int > 0 and not p_force then
    raise exception 'open checks remain';
  end if;

  -- 【決定2】diff = counted − (float + cash − expense − payout)（モック H=Oi−q と同一）
  v_diff := case when p_counted_cash is null then null
                 else p_counted_cash - (coalesce(p_cash_float,0) + (v_agg->>'cash')::int
                                        - coalesce(p_expense,0) - coalesce(p_cash_payout,0)) end;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.daily_reports
    (org_id, store_id, biz_date,
     cash, card_gross, card_tax, uri, other, drink_sales, dohan_checks, slips, guests,
     open_checks_count, expense, cash_payout, cash_float, counted_cash, diff, note,
     biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by)
  values
    (public.auth_org_id(), p_store_id, p_biz_date,
     (v_agg->>'cash')::int, (v_agg->>'card')::int, (v_agg->>'card_tax')::int,
     (v_agg->>'uri')::int, (v_agg->>'other')::int, (v_agg->>'drink_sales')::int,
     (v_agg->>'dohan_checks')::int, (v_agg->>'slips')::int, (v_agg->>'guests')::int,
     (v_agg->>'open_checks')::int,
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

-- ── daily_report_reclose（再確定＝void 追随・凍結 cutoff/rate で再集計・監査痕跡）──
create or replace function public.daily_report_reclose(
  p_report_id    uuid,
  p_expense      int default null,     -- null=既存値を維持
  p_cash_payout  int default null,
  p_cash_float   int default null,
  p_counted_cash int default null,
  p_note         text default null,
  p_force        boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_agg jsonb; v_before jsonb; v_diff int;
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
                 else v_counted - (v_float + (v_agg->>'cash')::int - v_expense - v_payout) end;

  update public.daily_reports set
    cash = (v_agg->>'cash')::int, card_gross = (v_agg->>'card')::int, card_tax = (v_agg->>'card_tax')::int,
    uri = (v_agg->>'uri')::int, other = (v_agg->>'other')::int, drink_sales = (v_agg->>'drink_sales')::int,
    dohan_checks = (v_agg->>'dohan_checks')::int, slips = (v_agg->>'slips')::int, guests = (v_agg->>'guests')::int,
    open_checks_count = (v_agg->>'open_checks')::int,
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
