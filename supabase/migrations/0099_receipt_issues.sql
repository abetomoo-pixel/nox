-- ═══════════════════════════════════════════════════════════════════════════
-- mig0099: R2-c 領収書本格版（採番・QR トークン・発行台帳・匿名公開）自己検証版
--   receipt_issues ＋ receipt_issue／receipt_issue_void（billing ゲート＝pin 92→94）
--   ＋ nox_receipt_public（★NOX 史上初の anon grant＝白名単1号）
--   底本 = nox_mig0099_live_defs.sql（sha256 0d4493dd…26f5e・live/repo 逐語）
--   正本 = R2 設計書 v1.1（R2-9〜R2-13・裁定33/34）＋正本B（QR90日・null return・PII 最小）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: create table／名前付き constraint
-- ★notify pgrst はファイル外・手貼り後に単発
-- ★安全要件の解決＝発行時スナップショット: store_name_snap／biz_date を発行時に凍結し、
--   nox_receipt_public は receipt_issues 1テーブルのみを読む（v1.1 の要件を文字どおり満たす。
--   領収書は文書＝発行時点の店名で固定が本来正）
-- ★serial 採番 = UNIQUE(store_id, serial) 衝突リトライ≤3（R2-10 改訂・NOX 初のループイディオム＝
--   begin..exception when unique_violation をループ内に置く＝サブトランザクション捕捉）
-- ★Σamount ≤ checks.total の直列化 = checks 行 FOR UPDATE（同一伝票の並行発行を一列化）
-- ★段56 の pin 作業（CC 担当）: billing 92→94・G2b 白名単化（PUBLIC 側 assert は不触）・
--   anon-guard へ逆向き assert（anon 実行可が正・異常系は null）追記
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- (1) DDL: receipt_issues（発行台帳・grants 規範形・RLS select=owner/manager 自店）
-- ─────────────────────────────────────────────
create table public.receipt_issues (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),
  store_id        uuid not null references public.stores(id),
  check_id        uuid not null references public.checks(id),
  serial          integer not null,
  amount          integer not null,
  recipient       text,
  proviso         text,
  store_name_snap text not null,
  biz_date        date not null,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references public.users(id),
  token           uuid not null default gen_random_uuid(),
  expires_on      date not null,
  voided          boolean not null default false,
  void_note       text,
  voided_at       timestamptz,
  voided_by       uuid references public.users(id),
  constraint receipt_issues_amount_check    check (amount > 0),
  constraint receipt_issues_serial_check    check (serial >= 1),
  constraint receipt_issues_recipient_len   check (recipient is null or length(recipient) <= 100),
  constraint receipt_issues_proviso_len     check (proviso is null or length(proviso) <= 100),
  constraint receipt_issues_store_serial_key unique (store_id, serial),
  constraint receipt_issues_token_key        unique (token)
);

create index receipt_issues_check_idx     on public.receipt_issues (check_id);
create index receipt_issues_org_store_idx on public.receipt_issues (org_id, store_id);

alter table public.receipt_issues enable row level security;

create policy receipt_issues_select on public.receipt_issues for select to authenticated using (
  org_id = public.auth_org_id()
  and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  and public.auth_role() in ('owner','manager')
);

revoke all on table public.receipt_issues from public, anon, authenticated;
grant select on table public.receipt_issues to authenticated;

-- ─────────────────────────────────────────────
-- (2) receipt_issue（発行・billing ゲート・owner/manager/staff-register・closed のみ）
-- ─────────────────────────────────────────────
create or replace function public.receipt_issue(p_check_id uuid, p_amount integer default null, p_recipient text default null, p_proviso text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org     uuid := public.auth_org_id();
  v_role    text := public.auth_role();
  v_chk     record;
  v_actor   uuid;
  v_issued  int;
  v_amt     int;
  v_recip   text;
  v_prov    text;
  v_sname   text;
  v_cutoff  text;
  v_bdate   date;
  v_expires date;
  v_serial  int;
  v_id      uuid;
  v_token   uuid;
  v_try     int;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象伝票（FOR UPDATE＝同一伝票の並行発行を一列化＝Σamount ガードの競合封鎖）
  select * into v_chk from public.checks where id = p_check_id for update;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_chk.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  -- 発行は会計済み伝票のみ（open/void は不可）
  if v_chk.status <> 'closed' then raise exception 'not closed'; end if;

  -- 宛名・但し書き（trim・空は null・長さは CHECK と同値を関数側でも）
  v_recip := nullif(trim(coalesce(p_recipient, '')), '');
  v_prov  := nullif(trim(coalesce(p_proviso, '')), '');
  if v_recip is not null and length(v_recip) > 100 then raise exception 'bad recipient'; end if;
  if v_prov  is not null and length(v_prov)  > 100 then raise exception 'bad proviso';  end if;

  -- 金額（null=残額。Σ既発行（非void）＋今回 ≤ checks.total）
  select coalesce(sum(amount), 0)::int into v_issued
    from public.receipt_issues where check_id = p_check_id and not voided;
  v_amt := coalesce(p_amount, v_chk.total - v_issued);
  if v_amt <= 0 or v_issued + v_amt > v_chk.total then raise exception 'bad amount'; end if;

  -- 発行時スナップショット（店名・取引日＝closed_at の営業日・cutoff は core と同イディオム）
  select s.name,
         coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
    into v_sname, v_cutoff
    from public.stores s where s.id = v_chk.store_id;
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_bdate := (timezone('Asia/Tokyo', coalesce(v_chk.closed_at, v_chk.started_at))
              - (v_cutoff || ':00')::interval)::date;

  -- 有効期限 = 発行日（JST）+ 90日（正本B②・R2-9）
  v_expires := (now() at time zone 'Asia/Tokyo')::date + 90;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  -- ★R2-10 改訂: serial = max+1 を UNIQUE(store_id, serial) 衝突リトライ≤3 で採番（NOX 初の
  --   ループイディオム。max+1 の FOR UPDATE は範囲読み＝ファントムで直列化しない（0053 注記）ため
  --   一意制約に当てて弾き直す。begin..exception をループ内に置く＝サブトランザクション単位で捕捉）
  v_id := null;
  for v_try in 1..3 loop
    begin
      select coalesce(max(serial), 0) + 1 into v_serial
        from public.receipt_issues where store_id = v_chk.store_id;
      insert into public.receipt_issues
        (org_id, store_id, check_id, serial, amount, recipient, proviso,
         store_name_snap, biz_date, issued_by, expires_on)
      values
        (v_chk.org_id, v_chk.store_id, p_check_id, v_serial, v_amt, v_recip, v_prov,
         v_sname, v_bdate, v_actor, v_expires)
      returning id, token into v_id, v_token;
      exit;
    exception when unique_violation then
      v_id := null;  -- 他店同時発行と衝突＝採り直し
    end;
  end loop;
  if v_id is null then raise exception 'busy'; end if;

  -- 監査（token は記録しない＝公開アクセス鍵を audit へ漏らさない）
  perform public.audit_log_write('receipt_issue', 'receipt_issues:' || v_id::text, null,
    jsonb_build_object('check_id', p_check_id, 'serial', v_serial, 'amount', v_amt,
                       'recipient', v_recip, 'proviso', v_prov,
                       'biz_date', v_bdate, 'expires_on', v_expires),
    v_chk.store_id);

  return jsonb_build_object('id', v_id, 'serial', v_serial, 'token', v_token,
                            'amount', v_amt, 'expires_on', v_expires, 'biz_date', v_bdate,
                            'store_name', v_sname);
end $function$;

revoke execute on function public.receipt_issue(uuid, integer, text, text) from public, anon;
grant  execute on function public.receipt_issue(uuid, integer, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (3) receipt_issue_void（再発行管理・owner/manager・既 void は無音）
-- ─────────────────────────────────────────────
create or replace function public.receipt_issue_void(p_issue_id uuid, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_row   public.receipt_issues;
  v_actor uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  select * into v_row from public.receipt_issues where id = p_issue_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if v_row.voided then return; end if;  -- 既 void は無音（audit を汚さない）

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  update public.receipt_issues
     set voided = true,
         void_note = nullif(trim(coalesce(p_note, '')), ''),
         voided_at = now(),
         voided_by = v_actor
   where id = p_issue_id;

  perform public.audit_log_write('receipt_issue_void', 'receipt_issues:' || p_issue_id::text,
    jsonb_build_object('voided', false, 'serial', v_row.serial, 'amount', v_row.amount),
    jsonb_build_object('voided', true,  'note', nullif(trim(coalesce(p_note, '')), '')),
    v_row.store_id);
end $function$;

revoke execute on function public.receipt_issue_void(uuid, text) from public, anon;
grant  execute on function public.receipt_issue_void(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (4) nox_receipt_public（★anon 白名単1号・R2-11 改訂＝DEFINER 白名単の門）
--     安全要件: 引数 token のみ・receipt_issues 以外不読・不在/期限切れ/void は空 return
--     （raise しない＝存在推測を与えない・正本B③）・返却は最小5項目（正本B④）
-- ─────────────────────────────────────────────
create or replace function public.nox_receipt_public(p_token uuid)
 returns table(store_name text, serial_no text, amount integer, issued_on date, biz_date date)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_r record;
begin
  if p_token is null then return; end if;
  select ri.serial, ri.amount, ri.issued_at, ri.voided, ri.expires_on,
         ri.store_name_snap, ri.biz_date as bdate
    into v_r
    from public.receipt_issues ri
   where ri.token = p_token;
  if v_r.serial is null then return; end if;                                     -- 不在＝空
  if v_r.voided then return; end if;                                             -- void＝空
  if (now() at time zone 'Asia/Tokyo')::date > v_r.expires_on then return; end if;  -- 期限切れ＝空
  return query
  select v_r.store_name_snap,
         'R-' || lpad(v_r.serial::text, 6, '0'),
         v_r.amount,
         (v_r.issued_at at time zone 'Asia/Tokyo')::date,
         v_r.bdate;
end $function$;

-- ★NOX 史上初の anon grant（白名単1号・G2b 白名単 assert が本数=1 を機械係留＝段56）
revoke execute on function public.nox_receipt_public(uuid) from public;
grant  execute on function public.nox_receipt_public(uuid) to anon, authenticated, service_role;

commit;
