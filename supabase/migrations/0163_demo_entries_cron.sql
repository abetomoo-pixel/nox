-- 0163_demo_entries_cron.sql
-- マイグレーション名: 0163_demo_entries_cron（裁定328 追補1・便 D1-6・2026-10-02）
-- 生成器: docs/tmp/gen_0163.mjs（手打ち禁止）。写経元＝docs/tmp/0163_live.json（q1002_live_0163.mjs が pg_get_functiondef で dump した live）。
--   既存関数は触らない（demo_org_reset a4bd6a18／audit_purge f2946b95＝不触・is_demo 句は live のまま＝★5 再確認のみ）。新設 1 本（demo_entries_purge）はこのテンプレート内に手書き。
--
-- 器（裁定328 追補1 ①②・293-7・reset_design §3 A-2／§4 ★1★6）:
--   ★1 拡張: pg_cron（schema pg_catalog・Supabase 流儀）＋ pg_net（schema extensions）。既に有効なら no-op。
--   ★2 表 demo_entries（入場ログ）: org_id・store_code（6）・role（owner／manager／staff／cast／kiosk）・ip_hash（sha256 先頭 16 桁・null 可）・user_agent（200 字）・at。
--        RLS 有効・policy なし（anon／authenticated は 0 行）・grant＝service_role の select／insert のみ（入場 route が admin で書く）。30 日で purge（★3）。
--   ★3 関数 demo_entries_purge() returns jsonb＝30 日より前の行を org ごとに削除し audit 'demo.entries.purged'（audit_log_write_service）に件数を残す。
--        service_role 専用（4 ロール明示 revoke→service_role grant・テナント JWT からの呼出は 'forbidden'＝audit_purge と同型）。
--   ★4 cron: 店ごとの日次リセット 6 job（JST 06:05 から 2 分おき＝UTC 21:05／07／09／11／13／15）＋ 再試行 1 job（UTC 21:35＝JST 06:35・?retry=1）＋ 入場ログ purge 1 job（UTC 20:15＝JST 05:15）。
--        URL と秘密は Vault（nox_demo_reset_url／nox_cron_secret＝SQL Editor で vault.create_secret＝手順書 docs/demo/cron_setup.md・mig には書かない）。
--        冪等: 同名 job があれば先に cron.unschedule。command は net.http_get（timeout 60 秒）。
--   ★5 demo_org_reset の is_demo 句＝live のまま（`select is_demo into v_demo … if v_demo is null or v_demo <> true then raise exception 'not demo'`）＝不触・md5 a4bd6a18 不変。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）:
--   関数 302 → 303（demo_entries_purge・非ゲート・service_role 専用＝名簿 B +1）。表 82 → 83（demo_entries）。'billing locked' 154 不変。
--   pin が変わる suite: grants（TABLES +1・G4d +1・RLS 有効表 +1）／anon-guard（probe +1：anon・authenticated とも BLOCKED）／billing（名簿 303・除外 149）／0158（関数 303／表 83）／demo-guard（demo_entries の insert は route の admin 経路）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   select extname, extversion from pg_extension where extname in ('pg_cron','pg_net');                                  -- 2 行
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='demo_entries_purge';                     -- fdc33bb7
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='demo_org_reset';                         -- a4bd6a18（不変）
--   select jobname, schedule, active from cron.job where jobname like 'nox-demo-%' order by jobname;                   -- 8 行
--   select relrowsecurity from pg_class where relname='demo_entries';                                                    -- true
--   select grantee, privilege_type from information_schema.role_table_grants where table_name='demo_entries' and grantee<>'postgres' order by 1,2; -- service_role の INSERT／SELECT のみ
begin;

-- ★1 拡張（Supabase 流儀＝pg_cron は pg_catalog・pg_net は extensions）
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- ★2 demo_entries（入場ログ・30 日）
create table if not exists public.demo_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  store_code  text not null check (store_code in ('muse','luna','noir','ace','lily','nest')),
  role        text not null check (role in ('owner','manager','staff','cast','kiosk')),
  ip_hash     text null check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16}$'),
  user_agent  text null check (user_agent is null or length(user_agent) <= 200),
  at          timestamptz not null default now()
);
comment on table public.demo_entries is '0163: 公開デモの入場ログ（裁定293-7＝IP はハッシュ・30 日で削除）。書き手＝入場 route（service_role）。閲覧 policy なし。';
create index if not exists demo_entries_org_at_idx on public.demo_entries (org_id, at desc);
alter table public.demo_entries enable row level security;
revoke all on table public.demo_entries from public, anon, authenticated, service_role;   -- ★Supabase 既定 grant は service_role にも ALL を付ける（0002 検証(3)型）＝4 ロール明示 revoke
grant select, insert on table public.demo_entries to service_role;

-- ★3 demo_entries_purge（service_role 専用・audit_purge と同型）
create or replace function public.demo_entries_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '30 days';
  v_org    record;
  v_n      int;
  v_total  int := 0;
  v_orgs   int := 0;
begin
  -- 二重防御: grant は service_role のみ＋テナント JWT（auth.uid() 非 null）からの呼出は遮断（audit_purge と同型）
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  for v_org in select distinct org_id from public.demo_entries where at < v_cutoff loop
    delete from public.demo_entries where org_id = v_org.org_id and at < v_cutoff;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_total := v_total + v_n; v_orgs := v_orgs + 1;
      perform public.audit_log_write_service(v_org.org_id, null, 'demo.entries.purged', 'demo_entries', null, jsonb_build_object('deleted', v_n, 'before', v_cutoff), null, null);
    end if;
  end loop;
  return jsonb_build_object('deleted', v_total, 'orgs', v_orgs, 'before', v_cutoff);
end $$;
revoke all on function public.demo_entries_purge() from public, anon, authenticated, service_role;
grant execute on function public.demo_entries_purge() to service_role;

-- ★4 cron（冪等: 同名 job を先に外す）
do $$
declare v_name text;
begin
  for v_name in select jobname from cron.job where jobname like 'nox-demo-%' loop
    perform cron.unschedule(v_name);
  end loop;
end $$;
-- 店ごとの日次リセット（JST 06:05＝UTC 21:05・2 分おき・URL と秘密は Vault）
select cron.schedule('nox-demo-reset-muse', '5 21 * * *',  $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=muse', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select cron.schedule('nox-demo-reset-luna', '7 21 * * *',  $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=luna', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select cron.schedule('nox-demo-reset-noir', '9 21 * * *',  $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=noir', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select cron.schedule('nox-demo-reset-ace',  '11 21 * * *', $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=ace',  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select cron.schedule('nox-demo-reset-lily', '13 21 * * *', $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=lily', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select cron.schedule('nox-demo-reset-nest', '15 21 * * *', $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=nest', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
-- 再試行（JST 06:35＝その営業日に reset されていない org だけ・route 側が判定）
select cron.schedule('nox-demo-reset-retry', '35 21 * * *', $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?retry=1', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 120000)$$);
-- 入場ログの purge（JST 05:15）
select cron.schedule('nox-demo-entries-purge', '15 20 * * *', $$select public.demo_entries_purge()$$);

commit;
-- ===== end 0163 =====
