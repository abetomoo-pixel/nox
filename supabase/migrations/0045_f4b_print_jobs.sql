-- 0045_f4b_print_jobs.sql
-- F4b レシート印刷（流通）: print_jobs キュー + enqueue（4枝認可）+ claim/result（service_role 限定・認証外 route 用）
-- 裁定: レシート単位=(check_id, pay_group)・is_reprint は printed/queued/printing 存在で判定（failed/canceled 除外）
--       二度押しは既存 queued/printing を返して二重印刷を封じる
--       claim/result は audit_logs 非使用（service_role=auth.uid() null で audit_log_write が raise するため。
--       高頻度ポーリングでもあり、print_jobs 行の状態遷移列が台帳を兼ねる）
-- 構成: 再適用可（if not exists / or replace）だが手貼りは1回

begin;

-- ============================================================
-- 1) print_jobs: 印刷ジョブキュー（deny-all・RPC/service_role 専任）
-- ============================================================
create table if not exists public.print_jobs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  store_id       uuid not null references public.stores(id),
  check_id       uuid not null references public.checks(id),
  pay_group      text not null,
  status         text not null default 'queued'
                 check (status in ('queued','printing','printed','failed','canceled')),
  is_reprint     boolean not null default false,
  print_token    text not null unique,
  claimed_serial text,
  error_code     text,
  retry_count    integer not null default 0 check (retry_count >= 0),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  claimed_at     timestamptz,
  printed_at     timestamptz
);
create index if not exists print_jobs_store_status_created_idx
  on public.print_jobs (store_id, status, created_at);

alter table public.print_jobs enable row level security;
-- ポリシーなし＝deny-all
revoke all on public.print_jobs from public, anon, authenticated;

-- ============================================================
-- 2) print_enqueue（check_close 4枝認可の逐語コピー・closed 必須）
--    返却 jsonb: {job_id, is_reprint, already_queued}
-- ============================================================
create or replace function public.print_enqueue(p_check_id uuid, p_pay_group text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_chk    record;
  v_cfg    public.printer_config;
  v_exists public.print_jobs;
  v_actor  uuid;
  v_reprint boolean;
  v_token  text;
  v_id     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- check_close 4枝の逐語（live 0039 改修後の姿）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
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

  select id into v_actor from public.users
   where auth_user_id = auth.uid() and is_active;
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
end $function$;

revoke all on function public.print_enqueue(uuid, text) from public, anon;
grant execute on function public.print_enqueue(uuid, text) to authenticated;

-- ============================================================
-- 3) print_claim（service_role 限定・最古 queued を状態ガード付き claim）
--    skip locked＝同時ポーリングの競合安全
-- ============================================================
create or replace function public.print_claim(p_store_token text, p_serial text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.printer_config;
  v_job public.print_jobs;
begin
  if p_store_token is null or p_store_token !~ '^[0-9a-f]{24}$' then
    raise exception 'bad token';
  end if;
  select c.* into v_cfg from public.printer_config c where c.store_token = p_store_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if not v_cfg.printer_enabled then
    return jsonb_build_object('ok', false, 'reason', 'printer_disabled');
  end if;
  if v_cfg.printer_serial is not null
     and (p_serial is null or p_serial <> v_cfg.printer_serial) then
    return jsonb_build_object('ok', false, 'reason', 'serial_mismatch');
  end if;

  update public.print_jobs
     set status = 'printing', claimed_serial = p_serial, claimed_at = now()
   where id = (
     select j.id from public.print_jobs j
      where j.store_id = v_cfg.store_id and j.status = 'queued'
      order by j.created_at
      limit 1
      for update skip locked
   )
     and status = 'queued'
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  return jsonb_build_object('ok', true, 'found', true,
                            'job_id', v_job.id,
                            'print_token', v_job.print_token,
                            'check_id', v_job.check_id,
                            'pay_group', v_job.pay_group,
                            'is_reprint', v_job.is_reprint);
end $function$;

revoke all on function public.print_claim(text, text) from public, anon, authenticated;
grant execute on function public.print_claim(text, text) to service_role;

-- ============================================================
-- 4) print_result（service_role 限定・printing のときだけ printed/failed へ冪等遷移）
-- ============================================================
create or replace function public.print_result(
  p_store_token text, p_print_token text, p_success boolean, p_error_code text
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.printer_config;
  v_job public.print_jobs;
begin
  if p_store_token is null or p_store_token !~ '^[0-9a-f]{24}$' then
    raise exception 'bad token';
  end if;
  if p_success is null then raise exception 'bad success'; end if;
  select c.* into v_cfg from public.printer_config c where c.store_token = p_store_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  select j.* into v_job from public.print_jobs j
   where j.print_token = p_print_token and j.store_id = v_cfg.store_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_job');
  end if;

  -- 冪等リプレイ: 終端状態は成功として返す（プリンタ再送に安全）
  if v_job.status in ('printed','failed','canceled') then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_job.status);
  end if;
  if v_job.status <> 'printing' then
    return jsonb_build_object('ok', false, 'reason', 'bad_state', 'status', v_job.status);
  end if;

  if p_success then
    update public.print_jobs
       set status = 'printed', printed_at = now(), error_code = null
     where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'printed');
  else
    update public.print_jobs
       set status = 'failed',
           error_code = nullif(trim(coalesce(p_error_code,'')), ''),
           retry_count = v_job.retry_count + 1
     where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;
end $function$;

revoke all on function public.print_result(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.print_result(text, text, boolean, text) to service_role;

commit;
