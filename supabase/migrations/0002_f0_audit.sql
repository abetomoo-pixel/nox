-- 0002_f0_audit: F0 監査骨格 — audit_logs（append-only・before→after 記録）＋ 書込 wrapper
--                （データモデル設計 §4 の mig0009 相当。実装順により 0002 を付番）
--
-- 翻訳元（BANZEN makanai-shift）:
--  - 0053_kiosk_audit.sql（K-f）… append-only 監査テーブル＋SECURITY DEFINER helper で
--    org/actor をサーバ導出する wrapper 型。store_id/actor は log 値（FK なし）＝
--    店舗・ユーザーが消えても監査を残す、の設計をそのまま写す。
--  - NOX 差分: before_json/after_json（jsonb）で変更前後を記録（データモデル設計 §2.9・
--    NOX は風営法/労基/マイナンバーで BANZEN より監査要件が重い）。
--
-- 方針:
--  - append-only の二重化: UPDATE/DELETE ポリシーを作らない ＋ revoke update, delete を明示。
--  - 記録は SECURITY DEFINER wrapper（audit_log_write）経由のみ。INSERT ポリシーも作らない
--    ＋ revoke insert を明示（クライアント直書込の経路ゼロ）。
--  - wrapper は完全内部専用（BANZEN K-f の kiosk_audit_log と同型）:
--    冒頭 auth_org_id() null guard ＋ revoke from public, anon, authenticated・grant なし。
--    EXECUTE 権限は呼び出し時の実効ロールで判定されるため、SECURITY DEFINER の業務 RPC
--    （owner=postgres）内部からの perform は owner 権限で通る＝クライアント直呼びの経路ゼロ。
--    org_id/actor_user_id/ip はサーバ導出（クライアント申告値を使わない）。
--  - service_role には grant しない: null guard が auth_org_id()（auth.uid() 依存）を見るため
--    service キー呼び出しは常に forbidden で落ちる＝grant しても使えない経路になる。
--    F2 の service_role 監査書込（給与確定）は「RLS バイパス直 INSERT か p_org_id 明示の
--    service 専用 RPC か」を F2c で決定する。
--  - 閲覧 RLS: 認可設計 §1.2 capability マトリクスで audit は owner のみ（manager 不可）。
--    §2.3 パターン2（cast 0行）の対象でもあるが、owner 限定はパターン2を包含する
--    （manager/staff/cast すべて 0 行）＝厳しい方を採用。
--  - F1 以降の業務 RPC は本体処理後に perform public.audit_log_write(...) で before→after を記録する。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 1) wrapper の prosrc（null guard とサーバ導出を確認）
--   select proname, prosrc from pg_proc where proname = 'audit_log_write';
--   -- 2) ポリシーは select 1本のみ（insert/update/delete が無いこと）
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'audit_logs';
--   -- 3) wrapper の EXECUTE 保持者一覧（owner=postgres のみが正。
--   --    anon / authenticated / service_role が現れないこと）
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname = 'audit_log_write';
--   -- 4) append-only の grant 面: authenticated は SELECT のみ・anon は 0 行が正
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'audit_logs'
--     and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;

begin;

-- ── audit_logs（append-only・全特権操作の before→after）────────
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid,        -- log 値・FK なし（店舗を消しても監査を残す＝K-f 踏襲）
  actor_user_id uuid,        -- users.id（log 値・FK なし）
  action        text not null, -- 操作名（F1 以降の RPC 名が入る・enum で縛らない）
  target        text,        -- 操作対象（テーブル名:id 等）
  before_json   jsonb,       -- 変更前スナップショット
  after_json    jsonb,       -- 変更後スナップショット
  at            timestamptz not null default now(),
  ip            text
);
create index if not exists audit_logs_org_store_at_idx on public.audit_logs (org_id, store_id, at);
create index if not exists audit_logs_actor_at_idx     on public.audit_logs (actor_user_id, at);

-- ── RLS: 閲覧は owner のみ ────────────────────────────────────
alter table public.audit_logs enable row level security;

-- 認可設計 §1.2: capability「audit（監査ログ）」は owner ✓ / manager – / staff – / cast –。
-- §2.3 パターン2（cast 0行）は owner 限定に包含される。
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and public.auth_role() = 'owner'
  );
-- INSERT/UPDATE/DELETE ポリシーは作らない＝直書込・改変・削除ともクライアント不可。

-- ── append-only の二重化（ポリシー不在 ＋ grant 面の明示 revoke）──
revoke all on table public.audit_logs from anon;
revoke insert, update, delete on table public.audit_logs from public, anon, authenticated;

-- ── 書込 wrapper（SECURITY DEFINER・唯一の記録経路・完全内部専用）──
-- 業務 RPC（SECURITY DEFINER）内部からの perform 専用。クライアントからは
-- anon/authenticated とも実行不可（F0e verify で両方 BLOCKED を能動 assert する）。
-- org_id / actor_user_id / ip はサーバ導出（クライアント申告値を使わない）。
-- store_id のみ呼び出し側が渡す（org 外の store_id を渡しても監査行の org_id は
-- auth_org_id() 固定＝クロステナント汚染にはならない・log 値扱い）。
create or replace function public.audit_log_write(
  p_action   text,
  p_target   text default null,
  p_before   jsonb default null,
  p_after    jsonb default null,
  p_store_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_actor uuid;
  v_ip    text;
  v_id    uuid;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  v_org := public.auth_org_id();
  if v_org is null then
    raise exception 'forbidden';
  end if;

  select id into v_actor
  from public.users
  where auth_user_id = auth.uid() and is_active;

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

-- 二重防御②: 完全内部専用＝public, anon, authenticated すべて revoke・grant なし
-- （SECURITY DEFINER 業務 RPC 内部からの perform は owner 権限で判定され通る）
revoke execute on function public.audit_log_write(text, text, jsonb, jsonb, uuid) from public, anon, authenticated;

commit;
