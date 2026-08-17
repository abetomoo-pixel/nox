-- mig0087: 課金基盤（org_billing＋述語2本）＝課金設計 v1.2 §2/§3
-- ★非冪等（create table）＝本番手貼り1回・再実行厳禁
-- ゲート挿入（対象87本）は mig0088（機械生成方式）で別掲。
-- backfill: 既存 org は 'active' 直指定（dev 専用の実態＝CLUB NOX/DEMO/fixture を
--   書込可能に保つ）。本番構築時は orgs 0件＝0行挿入・新規 org は provision 経路で trialing。

-- ============================================================
-- A. org_billing（BANZEN 0013 型・SELECT=owner・書込=service 専用）
-- ============================================================
create table public.org_billing (
  org_id uuid primary key references public.orgs(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','inactive')),
  interval text
    check (interval is null or interval in ('month','year')),
  collection_method text not null default 'charge_automatically'
    check (collection_method in ('charge_automatically','send_invoice')),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  current_period_end timestamptz,
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.org_billing is
  '課金正本（設計 v1.2）。orgs.plan/status は死列・不参照（裁定7）。書込は service 専用＝webhook/sync/provision のみ';

-- grants 規範形（TRUNCATE は RLS 非適用＝教訓3・G37 系）
revoke all on table public.org_billing from public, anon, authenticated;
grant select on table public.org_billing to authenticated;

alter table public.org_billing enable row level security;
create policy org_billing_select on public.org_billing
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_role() = 'owner');

create trigger org_billing_touch_updated_at
  before update on public.org_billing
  for each row execute function public.touch_updated_at();

-- ============================================================
-- B. billing_writable_of（正本・auth 非依存・引数版＝設計の核）
--    行なし/引数 null → false（fail-closed）。trialing 期限は述語内で判定
--    （BANZEN 0070 の期限倒しバッチに依存しない・0143 guest_gate_ok の一般化）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.billing_writable_of(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select b.status in ('trialing','active','past_due')
        and (b.status <> 'trialing' or b.trial_ends_at > now())
       from public.org_billing b
      where b.org_id = p_org_id),
    false);
$function$;

revoke all on function public.billing_writable_of(uuid) from public, anon, authenticated;
grant execute on function public.billing_writable_of(uuid) to service_role;

-- ============================================================
-- C. auth_org_billing_writable（RLS/route 用 zero-arg ラッパ）
--    ★service_role 実行文脈では auth_org_id() null → false（BANZEN 0130 と同機構）。
--    service RPC からは呼ばない＝呼ぶのは常に引数版（段47 で prosrc 機械検証）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.auth_org_billing_writable()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.billing_writable_of(public.auth_org_id());
$function$;

revoke all on function public.auth_org_billing_writable() from public, anon;
grant execute on function public.auth_org_billing_writable() to authenticated, service_role;

-- ============================================================
-- D. backfill（dev: 既存 org を active・本番: 0行）
-- ============================================================
insert into public.org_billing (org_id, status)
select o.id, 'active' from public.orgs o
on conflict (org_id) do nothing;
