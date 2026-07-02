-- 0008_f1d_shift_schema: F1d — 勤怠・シフトスキーマ（shift_wishes/shifts/attendance/punches/
--                         staffing_needs）＋RLS＋grant 標準型（データモデル設計 §4 の mig0005 相当・
--                         スキーマ編。RPC は 0009 で提示）
--
-- 翻訳元（BANZEN makanai-shift）:
--  - 0005_phase3_schema.sql … punches のイベント型（punched_at サーバ時刻＋type＋lat/lng/ip/
--    within_geofence/source）。break_start/break_end は NOX では除外（夜職打刻は in/out のみ・additive 可）。
--  - 0027_req_config_dow.sql（T1.5 方式X）… 必要人数の曜日7値（dow 0=日..6=土・JS getDay と一致）。
--  - ソフト判定思想（0028）… 記録するだけ・ブロックしない。ジオフェンス設定テーブル群は持ち込まない
--    （ハードモード要件が顕在化した時点で 0028 を翻訳＝台帳）。
--
-- 設計書 §2.5 との対照と逸脱（§2.5 へ同時追記・plan 承認済み）:
--  ① punches は clock_in/clock_out ペア行でなく BANZEN イベント型（ペア行は UPDATE が必須になり
--     「0028-0029 踏襲・append-only」の指示と自己矛盾するため。イベント行なら追記のみで完結）。
--  ② attendance.status はモック ASCII キー（shukkin=出勤/dohan=同伴/late=遅刻/off=休み/absent=当欠）。
--  ③ staffing_needs は weekday→dow（T1.5 踏襲）・required >= 0 CHECK。
--  ④ shifts.wish_id を追加（希望→確定の来歴・accept 二重生成の部分ユニークで防止）。
--
-- 決定3点（レビュー条件）:
--  【1】punch_self は盲目記録（シーケンス検証なし・in-in/孤立 out も事実として記録）。
--      3層モデル（punches=事実／attendance=判断／給与入力=突合）に従い、異常系の解決は
--      F2 突合純関数（モック lx/vp 翻訳）の仕様とする（§2.5 追記・台帳 #20）。
--      打刻を拒否すると「昨日の out 忘れで今日の in が塞がる」等、事実の取りこぼしが起きる。
--  【2】shift_wish_decide(accept) は shifts 行を自動生成する（status='planned'）。
--      根拠: 採用＝シフト案への取り込み（手動 shift_set との二重入力を排除・wish→shift の来歴が残る）。
--      planned のままなら manager は確定（confirmed）前に調整できる＝確定は別の意思決定として分離。
--      二重生成は shifts(wish_id) 部分ユニークで物理防止。
--  【3】時刻範囲規約: start_hm は 00:00〜23:59・end_hm は 00:00〜47:59（24h 超表記）。
--      意味論の正本は lib/nox/shift-time.ts（end<=start は+24h 解釈＝crossesMidnight・
--      営業日 D の 26:00 = D+1 02:00）。上限 47:59 の根拠: 深夜営業のアフター・閉店後清算を
--      含めても勤務終端は翌日中に収まる（48h 以上は2営業日目＝別シフト）。
--      DB の CHECK は正規表現の形式検証のみ（時刻計算は DB で一切しない＝F1d plan §3）。
--
-- cast プライバシー（認可設計 §2.3）:
--  - shift_wishes / shifts / attendance / punches = パターン1（cast は自分の行のみ）。
--  - staffing_needs = パターン2（管理情報・cast 0行）。
--
-- 書込はすべて 0009 の SECURITY DEFINER RPC 専任（直書込ポリシー無し・grant は SELECT のみ）。
-- punches は append-only（UPDATE/DELETE ポリシー無し＋grant 標準型で遮断・updated_at 無し）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) テーブル5本の RLS 有効
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('shift_wishes','shifts','attendance','punches','staffing_needs');
--   -- 2) ポリシー5本・すべて SELECT
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('shift_wishes','shifts','attendance','punches','staffing_needs');
--   -- 3) ユニーク3本（attendance 1日1状態・staffing_needs 店×曜日・shifts wish 二重生成防止）
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('attendance_cast_id_date_key','staffing_needs_store_id_dow_key','shifts_wish_id_uidx');
--   -- 4) grant 面: verify:nox-grants G1（authenticated=SELECT のみ・スキーマ全体）が自動確認

begin;

-- ── shift_wishes（希望シフト・パターン1）───────────────────────
create table if not exists public.shift_wishes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  cast_id    uuid not null references public.casts(id),
  date       date not null,
  start_hm   text not null check (start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), -- 00:00-23:59
  end_hm     text not null check (end_hm   ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'), -- 00:00-47:59（24h超表記）
  status     text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shift_wishes_store_date_idx on public.shift_wishes (store_id, date);
create index if not exists shift_wishes_cast_date_idx  on public.shift_wishes (cast_id, date);
create index if not exists shift_wishes_org_idx        on public.shift_wishes (org_id);

-- ── shifts（確定シフト・パターン1）─────────────────────────────
create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  cast_id    uuid not null references public.casts(id),
  date       date not null,
  start_hm   text not null check (start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_hm     text not null check (end_hm   ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'),
  status     text not null default 'planned' check (status in ('planned','confirmed')),
  wish_id    uuid references public.shift_wishes(id), -- 希望→確定の来歴（decide(accept) 自動生成時）
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shifts_store_date_idx on public.shifts (store_id, date);
create index if not exists shifts_cast_date_idx  on public.shifts (cast_id, date);
create index if not exists shifts_org_idx        on public.shifts (org_id);
-- 【決定2】accept の二重生成防止（1つの wish から shifts は1行だけ）
create unique index if not exists shifts_wish_id_uidx
  on public.shifts (wish_id) where wish_id is not null;

-- ── attendance（日次の勤怠状態＝判断・パターン1・1日1状態）─────
create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  cast_id    uuid not null references public.casts(id),
  date       date not null,
  -- shukkin=出勤 / dohan=同伴 / late=遅刻 / off=休み / absent=当欠（設計書 §2.5 の日本語5値と1対1）
  status     text not null check (status in ('shukkin','dohan','late','off','absent')),
  eta        text check (eta is null or eta ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'), -- 出勤見込み（遅刻連絡用）
  reason     text,
  source     text not null check (source in ('staff','self')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cast_id, date)
);
create index if not exists attendance_store_date_idx on public.attendance (store_id, date);
create index if not exists attendance_org_idx        on public.attendance (org_id);

-- ── punches（打刻＝事実・append-only・パターン1）───────────────
-- 【決定1】盲目記録: in-in/孤立 out もそのまま記録（解決は F2 突合純関数の仕様）。
-- ソフト判定: lat/lng は端末申告・ip はサーバ導出・within_geofence は F1d では常に null
--（ジオフェンス設定は未導入＝ブロックもしない）。
create table if not exists public.punches (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  cast_id         uuid not null references public.casts(id),
  punched_at      timestamptz not null default now(), -- サーバ時刻（クライアント申告値を使わない）
  type            text not null check (type in ('in','out')),
  lat             double precision,
  lng             double precision,
  ip              text,
  within_geofence boolean,
  source          text not null default 'self' check (source in ('self','manager')),
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists punches_cast_at_idx  on public.punches (cast_id, punched_at);
create index if not exists punches_store_at_idx on public.punches (store_id, punched_at);
create index if not exists punches_org_idx      on public.punches (org_id);

-- ── staffing_needs（必要人数・曜日7値＝T1.5・パターン2）────────
create table if not exists public.staffing_needs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  dow        smallint not null check (dow between 0 and 6), -- 0=日..6=土（JS getDay と一致）
  required   int not null default 0 check (required >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, dow)
);
create index if not exists staffing_needs_org_idx on public.staffing_needs (org_id);

-- ── updated_at トリガ（append-only の punches には付けない）─────
drop trigger if exists shift_wishes_touch_updated_at   on public.shift_wishes;
drop trigger if exists shifts_touch_updated_at         on public.shifts;
drop trigger if exists attendance_touch_updated_at     on public.attendance;
drop trigger if exists staffing_needs_touch_updated_at on public.staffing_needs;
create trigger shift_wishes_touch_updated_at   before update on public.shift_wishes   for each row execute function public.touch_updated_at();
create trigger shifts_touch_updated_at         before update on public.shifts         for each row execute function public.touch_updated_at();
create trigger attendance_touch_updated_at     before update on public.attendance     for each row execute function public.touch_updated_at();
create trigger staffing_needs_touch_updated_at before update on public.staffing_needs for each row execute function public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
alter table public.shift_wishes   enable row level security;
alter table public.shifts         enable row level security;
alter table public.attendance     enable row level security;
alter table public.punches        enable row level security;
alter table public.staffing_needs enable row level security;

-- パターン1（cast は自分の行のみ）: shift_wishes / shifts / attendance / punches
drop policy if exists shift_wishes_select on public.shift_wishes;
create policy shift_wishes_select on public.shift_wishes
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

drop policy if exists punches_select on public.punches;
create policy punches_select on public.punches
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

-- パターン2（cast 0行）: staffing_needs
drop policy if exists staffing_needs_select on public.staffing_needs;
create policy staffing_needs_select on public.staffing_needs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

-- ── grant 標準型（revoke all → SELECT のみ戻す）─────────────────
revoke all on table public.shift_wishes   from public, anon, authenticated;
revoke all on table public.shifts         from public, anon, authenticated;
revoke all on table public.attendance     from public, anon, authenticated;
revoke all on table public.punches        from public, anon, authenticated;
revoke all on table public.staffing_needs from public, anon, authenticated;
grant select on table public.shift_wishes   to authenticated;
grant select on table public.shifts         to authenticated;
grant select on table public.attendance     to authenticated;
grant select on table public.punches        to authenticated;
grant select on table public.staffing_needs to authenticated;

commit;
