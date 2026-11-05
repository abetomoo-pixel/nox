-- 0195_day_deductions.sql（裁定447 差し替え版＝日ごとの控除ルール＋M-73 単位 pay_rate・種別 other＋裁定447 ④ deduction_rule_casts＋M-77 ②③ の DDL（line_links.blocked_at・line_link_block／remove）＋M-80 追記② staff_allowances）
-- 翻訳元: live pg_get_functiondef（2026-11-04・0194 適用後）＋生成器 docs/tmp/gen_0195.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の表と RPC は生成器の本文）
--   根拠＝台帳 裁定447（差し替え版・2026-11-04）／M-73／裁定447 ④（deduction_rule_casts）／M-77／M-80 追記②／docs/tmp/0195_plan.md §1〜§9（§5 の 4 点と §6-② は推奨案で仮置き＝handpaste_0195.md 冒頭）
-- 検証クエリ: 末尾 ===== verify =====（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）
-- ★1 deductions＝day_rule（always／pick）・per に pay_rate・kind に other・set_deduction 10 引数（旧 9 引数 drop＋ACL）
-- ★2 cast_day_deductions（日付×キャスト×ルール＝既定と違う日だけ行）＋cast_day_deductions_set（管理者・自店の店長・kiosk 腕＝操作担当あり）
-- ★3 deduction_rule_casts（キャスト別の適用・額の上書き）＋deduction_rule_cast_set／deduction_rule_casts_get
-- ★4 line_links.blocked_at＋line_link_block（service_role だけ＝Webhook の unfollow）／line_link_remove（管理者・自店の店長）
-- ★5 staff_allowances（固定手当の名称つき複数行）＋staff_allowances_set・staff_labor_confirmed.allowances（確定で凍結＝staff_attendance_confirm の行に allowances）
-- ★教訓132（2026-11-04 採番）: begin の直後に lock_timeout（表の ALTER と稼働中の関数の CREATE OR REPLACE を 1 本で流す）
begin;
set local lock_timeout = '10s';

-- ═══ ★1 控除マスタ＝日ごとのルール（day_rule）・単位 pay_rate（M-73 ①）・種別 other（M-73 ②＝案 (a)）＝set_deduction を 10 引数に作り直す（旧 9 引数は drop・9 引数の呼び出しは DEFAULT で従来どおり） ═══
alter table public.deductions add column if not exists day_rule text not null default 'always';
alter table public.deductions drop constraint if exists deductions_day_rule_check;
alter table public.deductions add constraint deductions_day_rule_check check (day_rule in ('always','pick'));
alter table public.deductions drop constraint if exists deductions_per_check;
alter table public.deductions add constraint deductions_per_check check (per in ('day','month','rate','pay_rate'));
alter table public.deductions drop constraint if exists deductions_kind_check;
alter table public.deductions add constraint deductions_kind_check check (kind in ('unworked','sanction','statutory','agreed_cost','store_receivable','advance_settlement','other'));
comment on column public.deductions.day_rule is '★0195（裁定447 差し替え版）: per=day のルールの日ごとの扱い＝always（毎出勤に引く・既定）／pick（その日に選ぶ＝既定 off・on にした日だけ cast_day_deductions に行）';
drop function if exists public.set_deduction(uuid, uuid, text, integer, text, boolean, text, boolean, text);
CREATE OR REPLACE FUNCTION public.set_deduction(p_id uuid, p_store_id uuid, p_name text, p_amount integer, p_per text, p_is_active boolean, p_kind text, p_basis_confirmed boolean, p_basis_note text, p_day_rule text DEFAULT 'always'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（裁定447 差し替え版・M-73）: p_day_rule（always＝毎出勤に引く／pick＝その日に選ぶ＝per=day だけ意味を持つ・既定 always＝9 引数の呼び出しは従来どおり）・per に pay_rate（報酬の%）・kind に other（画面の「その他」）
declare
  v_owner    uuid;
  v_id       uuid;
  v_before   jsonb;
  v_after    jsonb;
  v_cur_kind text;
  v_kind     text;
  v_at       timestamptz;
  v_by       uuid;
  v_note     text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_per not in ('day','month','rate','pay_rate') then raise exception 'bad per'; end if;   -- ★0195 M-73 ①: pay_rate＝報酬の%
  if p_day_rule is null or p_day_rule not in ('always','pick') then raise exception 'bad day_rule'; end if;   -- ★0195（裁定447）
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_per in ('rate','pay_rate') and p_amount > 100 then raise exception 'bad amount'; end if; -- rate／pay_rate は % 値（100 超は設定ミス）
  if p_kind is not null and p_kind not in
     ('unworked','sanction','statutory','agreed_cost','store_receivable','advance_settlement','other')   -- ★0195 M-73 ②: other（画面の「その他」）
  then raise exception 'bad kind'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既存行（update 時）
  if p_id is not null then
    select to_jsonb(d), d.kind into v_before, v_cur_kind from public.deductions d
      where d.id = p_id and d.org_id = public.auth_org_id() and d.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
  end if;

  -- 教訓43: insert は default 'agreed_cost'・update で null は「不変」（黙戻りで kind を潰さない）
  v_kind := coalesce(p_kind, v_cur_kind, 'agreed_cost');

  -- 裁定98-A: sanction は保存のたびに根拠確認＋記録を必須化（雇用=就業規則／委託=契約）
  if v_kind = 'sanction' then
    if p_basis_confirmed is distinct from true then raise exception 'basis required'; end if;
    if p_basis_note is null or length(trim(p_basis_note)) = 0 then raise exception 'basis required'; end if;
    if length(p_basis_note) > 400 then raise exception 'bad basis note'; end if;
    v_by := auth.uid();
    if v_by is null then raise exception 'forbidden'; end if;
    v_at   := now();
    v_note := trim(p_basis_note);
  else
    v_at := null; v_by := null; v_note := null;
  end if;

  if p_id is null then
    insert into public.deductions
      (org_id, store_id, name, amount, per, is_active, kind, basis_confirmed_at, basis_confirmed_by, basis_note, day_rule)
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_amount, p_per, coalesce(p_is_active, true),
       v_kind, v_at, v_by, v_note, p_day_rule)
    returning id into v_id;
    v_before := null;
  else
    update public.deductions
      set name = trim(p_name), amount = p_amount, per = p_per, is_active = coalesce(p_is_active, true),
          kind = v_kind, basis_confirmed_at = v_at, basis_confirmed_by = v_by, basis_note = v_note, day_rule = p_day_rule
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  select to_jsonb(d) into v_after from public.deductions d where d.id = v_id;
  perform public.audit_log_write('set_deduction', 'deductions:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;
revoke execute on function public.set_deduction(uuid, uuid, text, integer, text, boolean, text, boolean, text, text) from public, anon;
grant execute on function public.set_deduction(uuid, uuid, text, integer, text, boolean, text, boolean, text, text) to authenticated;

-- ═══ ★2 日付×キャスト×ルールの on／off＝既定（always＝on／pick＝off）と違う日だけ行を持つ（行が無ければ既定）。書込は cast_day_deductions_set だけ（管理者・自店の店長＝勤怠の修正モーダル／kiosk 腕＝退勤の画面＝操作担当あり・端末の店のキャスト）。確定済みの月（payroll_runs finalized／paid）は 'finalized' ═══
create table if not exists public.cast_day_deductions (
  org_id uuid not null references public.orgs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  biz_date date not null,
  deduction_id uuid not null references public.deductions(id) on delete cascade,
  enabled boolean not null,
  set_by uuid references public.users(id),
  set_at timestamptz not null default now(),
  primary key (cast_id, biz_date, deduction_id)
);
create index if not exists cast_day_deductions_store_date_idx on public.cast_day_deductions (store_id, biz_date);
comment on table public.cast_day_deductions is '★0195（裁定447 差し替え版）: 日ごとの控除の on／off（既定と違う日だけ行＝always のルールは off の日・pick のルールは on の日）。給与の集計は「引く日数」を数えるときにこの行で既定を上書きする';
alter table public.cast_day_deductions enable row level security;
drop policy if exists cast_day_deductions_select on public.cast_day_deductions;
create policy cast_day_deductions_select on public.cast_day_deductions for select to authenticated
  using ((org_id = public.auth_org_id() and (public.auth_role() = 'owner' or ((public.auth_role() in ('manager','staff')) and store_id = public.auth_store_id()) or cast_id = public.auth_cast_id()))
         or (store_id = public.auth_kiosk_register_store_id() and public.auth_kiosk_operator() is not null));   -- kiosk 腕＝退勤の画面で今日の行を読む
revoke all on table public.cast_day_deductions from public, anon, authenticated;
grant select on table public.cast_day_deductions to authenticated;

CREATE OR REPLACE FUNCTION public.cast_day_deductions_set(p_cast_id uuid, p_biz_date date, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（裁定447 差し替え版）: その日の控除の on／off（rows＝[{deduction_id, enabled}]）。既定（always＝on／pick＝off）どおりの行は消し、違う行だけ upsert。
--   管理者＝org 内／店長＝自店／kiosk 腕＝端末の店のキャスト・操作担当あり（kiosk_punch の後の別 RPC＝送りの kiosk_transport_issue と同じ 2 段）。確定済みの月は 'finalized'。audit は店の人は audit_log_write・端末は audit_log_write_service（actor＝操作担当）。
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_kstore uuid;
  v_by    uuid;
  v_cast  record;
  v_d     record;
  v_default boolean;
  v_before jsonb; v_after jsonb;
  r       record;
begin
  if v_org is null then   -- 端末（kiosk 腕）
    v_kstore := public.auth_kiosk_register_store_id();
    if v_kstore is null then raise exception 'forbidden'; end if;
    v_by := public.auth_kiosk_operator();
    if v_by is null then raise exception 'forbidden'; end if;
    select s.org_id into v_org from public.stores s where s.id = v_kstore;
  else
    v_by := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  end if;
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_cast_id is null or p_biz_date is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad args'; end if;
  select c.id, c.store_id into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null then raise exception 'forbidden'; end if;
  if v_kstore is not null then
    if v_cast.store_id <> v_kstore then raise exception 'forbidden'; end if;
  else
    if not (v_role = 'owner' or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  end if;
  if exists (select 1 from public.payroll_runs pr where pr.store_id = v_cast.store_id and pr.status in ('finalized','paid') and pr.period_start <= p_biz_date and pr.period_end >= p_biz_date) then raise exception 'finalized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('deduction_id', x.deduction_id, 'enabled', x.enabled) order by x.deduction_id), '[]'::jsonb) into v_before
    from public.cast_day_deductions x where x.cast_id = p_cast_id and x.biz_date = p_biz_date;
  for r in select * from jsonb_to_recordset(p_rows) as x(deduction_id uuid, enabled boolean) loop
    if r.deduction_id is null or r.enabled is null then raise exception 'bad row'; end if;
    select d.id, d.per, d.day_rule, d.is_active into v_d from public.deductions d where d.id = r.deduction_id and d.store_id = v_cast.store_id;
    if v_d.id is null then raise exception 'bad deduction'; end if;
    if v_d.per <> 'day' or not v_d.is_active then raise exception 'not day rule'; end if;
    v_default := (v_d.day_rule = 'always');
    if r.enabled = v_default then
      delete from public.cast_day_deductions where cast_id = p_cast_id and biz_date = p_biz_date and deduction_id = r.deduction_id;
    else
      insert into public.cast_day_deductions (org_id, store_id, cast_id, biz_date, deduction_id, enabled, set_by)
      values (v_org, v_cast.store_id, p_cast_id, p_biz_date, r.deduction_id, r.enabled, v_by)
      on conflict (cast_id, biz_date, deduction_id) do update set enabled = excluded.enabled, set_by = excluded.set_by, set_at = now();
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('deduction_id', x.deduction_id, 'enabled', x.enabled) order by x.deduction_id), '[]'::jsonb) into v_after
    from public.cast_day_deductions x where x.cast_id = p_cast_id and x.biz_date = p_biz_date;
  if v_kstore is not null then
    perform public.audit_log_write_service(v_org, v_by, 'cast_day_deductions_set', 'casts:' || p_cast_id::text || ':' || p_biz_date::text, v_before, v_after, v_cast.store_id, 'kiosk');
  else
    perform public.audit_log_write('cast_day_deductions_set', 'casts:' || p_cast_id::text || ':' || p_biz_date::text, v_before, v_after, v_cast.store_id);
  end if;
end $function$;
revoke execute on function public.cast_day_deductions_set(uuid, date, jsonb) from public, anon;
grant execute on function public.cast_day_deductions_set(uuid, date, jsonb) to authenticated;

-- ═══ ★3 キャスト別の適用＝deduction_rule_casts（裁定447 ④の具体化）: 行が無い＝全員に適用（店のルール・既存の店は値が動かない）。enabled=true かつ override=null は行を消す（既定に戻す）。run 別の上書き（0156）は最優先のまま ═══
create table if not exists public.deduction_rule_casts (
  org_id uuid not null references public.orgs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  rule_id uuid not null references public.deductions(id) on delete cascade,
  cast_id uuid not null references public.casts(id) on delete cascade,
  enabled boolean not null default true,
  amount_override integer check (amount_override is null or amount_override >= 0),
  set_by uuid references public.users(id),
  set_at timestamptz not null default now(),
  primary key (rule_id, cast_id)
);
create index if not exists deduction_rule_casts_cast_idx on public.deduction_rule_casts (cast_id);
comment on table public.deduction_rule_casts is '★0195（裁定447 ④）: 控除ルールのキャスト別の適用（使う／使わない・額の上書き＝null は店の額）。行が無い＝全員に店の額で適用';
alter table public.deduction_rule_casts enable row level security;
drop policy if exists deduction_rule_casts_select on public.deduction_rule_casts;
create policy deduction_rule_casts_select on public.deduction_rule_casts for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or (public.auth_role() in ('manager','staff') and store_id = public.auth_store_id()) or cast_id = public.auth_cast_id()));
revoke all on table public.deduction_rule_casts from public, anon, authenticated;
grant select on table public.deduction_rule_casts to authenticated;

CREATE OR REPLACE FUNCTION public.deduction_rule_cast_set(p_rule_id uuid, p_cast_id uuid, p_enabled boolean, p_amount_override integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（裁定447 ④）: キャスト別の適用（管理者＝org 内／自店の店長）。enabled=true かつ override=null は行を消す＝既定に戻す。audit。確定済みの月には遡らない（集計は run の期で読む）
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_rule record; v_cast record;
  v_before jsonb; v_after jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_rule_id is null or p_cast_id is null or p_enabled is null then raise exception 'bad args'; end if;
  if p_amount_override is not null and (p_amount_override < 0 or p_amount_override > 99999999) then raise exception 'bad amount'; end if;
  select d.id, d.store_id into v_rule from public.deductions d where d.id = p_rule_id and d.org_id = v_org;
  if v_rule.id is null then raise exception 'not found'; end if;
  select c.id, c.store_id into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_rule.store_id then raise exception 'bad cast'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_rule.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  select to_jsonb(x) into v_before from public.deduction_rule_casts x where x.rule_id = p_rule_id and x.cast_id = p_cast_id;
  if p_enabled and p_amount_override is null then
    delete from public.deduction_rule_casts where rule_id = p_rule_id and cast_id = p_cast_id;
  else
    insert into public.deduction_rule_casts (org_id, store_id, rule_id, cast_id, enabled, amount_override, set_by)
    values (v_org, v_rule.store_id, p_rule_id, p_cast_id, p_enabled, p_amount_override, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (rule_id, cast_id) do update set enabled = excluded.enabled, amount_override = excluded.amount_override, set_by = excluded.set_by, set_at = now();
  end if;
  select to_jsonb(x) into v_after from public.deduction_rule_casts x where x.rule_id = p_rule_id and x.cast_id = p_cast_id;
  perform public.audit_log_write('deduction_rule_cast_set', 'deductions:' || p_rule_id::text || ':' || p_cast_id::text, v_before, v_after, v_rule.store_id);
end $function$;
revoke execute on function public.deduction_rule_cast_set(uuid, uuid, boolean, integer) from public, anon;
grant execute on function public.deduction_rule_cast_set(uuid, uuid, boolean, integer) to authenticated;

CREATE OR REPLACE FUNCTION public.deduction_rule_casts_get(p_store_id uuid)
 RETURNS TABLE(rule_id uuid, cast_id uuid, enabled boolean, amount_override integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（裁定447 ④）: 店の控除ルールのキャスト別の適用を一覧で（管理者＝org 内／自店の店長・スタッフ）＝一覧の「対象：全員／◯名」とキャスト詳細の「控除」の節
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_store_id is null or not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role in ('manager','staff') and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  return query select x.rule_id, x.cast_id, x.enabled, x.amount_override from public.deduction_rule_casts x where x.store_id = p_store_id order by x.rule_id, x.cast_id;
end $function$;
revoke execute on function public.deduction_rule_casts_get(uuid) from public, anon;
grant execute on function public.deduction_rule_casts_get(uuid) to authenticated;

-- ═══ ★4 M-77 ②③＝line_links.blocked_at（null＝有効）。unfollow の Webhook（service_role）＝line_link_block・紐付け解除（管理者・自店の店長）＝line_link_remove。push は route 側で blocked_at が null の行だけ（lineUserIdOf）・再紐付け（bind）は route が blocked_at を null に戻す ═══
alter table public.line_links add column if not exists blocked_at timestamptz;
comment on column public.line_links.blocked_at is '★0195（M-77 ②）: unfollow（ブロック）の時刻＝null が有効。push は null の行だけ・再紐付けで null に戻す';

CREATE OR REPLACE FUNCTION public.line_link_block(p_store_id uuid, p_line_user_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（M-77 ②）: Webhook の unfollow（service_role だけ＝route が呼ぶ）＝その org の line_links の行に blocked_at＝now()（既に block 済みは触らない）。戻り＝更新した行数。audit（userId は書かない）
declare
  v_org uuid;
  v_id uuid;
begin
  if p_store_id is null or p_line_user_id is null then raise exception 'bad args'; end if;
  select s.org_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null then raise exception 'not found'; end if;
  update public.line_links set blocked_at = now(), updated_at = now()
   where org_id = v_org and line_user_id = p_line_user_id and blocked_at is null
   returning id into v_id;
  if v_id is null then return 0; end if;
  perform public.audit_log_write_service(v_org, null, 'line_link_block', 'line_links:' || v_id::text, null, jsonb_build_object('blocked', true), p_store_id, 'unfollow');
  return 1;
end $function$;
revoke execute on function public.line_link_block(uuid, text) from public, anon, authenticated;
grant execute on function public.line_link_block(uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.line_link_remove(p_subject_kind text, p_subject_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（M-77 ③）: LINE の紐付けを解除（管理者＝org 内／自店の店長）＝行を delete・audit 'line_link_remove'（userId は書かない）。再紐付けは招待リンク
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_subject_kind not in ('cast','membership') or p_subject_id is null then raise exception 'bad args'; end if;
  select l.id, l.store_id into v_row from public.line_links l where l.org_id = v_org and l.subject_kind = p_subject_kind and l.subject_id = p_subject_id;
  if v_row.id is null then raise exception 'not found'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  delete from public.line_links where id = v_row.id;
  perform public.audit_log_write('line_link_remove', 'line_links:' || v_row.id::text, jsonb_build_object('subject_kind', p_subject_kind, 'subject_id', p_subject_id), null, v_row.store_id);
end $function$;
revoke execute on function public.line_link_remove(text, uuid) from public, anon;
grant execute on function public.line_link_remove(text, uuid) to authenticated;

-- ═══ ★5 M-80 追記②＝固定手当の名称つき複数行 staff_allowances（membership×名称・月額）＋staff_allowances_set（全行置換・管理者＝org 内／自店の店長＝staff だけ）。月の確定＝staff_attendance_confirm の行に allowances（内訳）を受けて staff_labor_confirmed.allowances に凍結（★裁定450 の 6＝RPC が Σ allowances.amount＝fixed を検証・不一致は 'labor mismatch'・amount＝time_pay＋fixed の検査は不変・calc_version は client で上げる） ═══
create table if not exists public.staff_allowances (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 20),
  amount integer not null check (amount >= 0 and amount <= 99999999),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_allowances_membership_idx on public.staff_allowances (membership_id);
comment on table public.staff_allowances is '★0195（M-80 追記②）: スタッフの固定手当（名称・月額・複数行）。月の支給の固定分 fixed＝Σ is_active の行（時給制・契約の fixed_allowance 1 本も client が 1 行として送る）・確定で staff_labor_confirmed.allowances に凍結（Σ＝fixed を RPC が検証＝裁定450 の 6）';
alter table public.staff_allowances enable row level security;
drop policy if exists staff_allowances_select on public.staff_allowances;
create policy staff_allowances_select on public.staff_allowances for select to authenticated
  using (org_id = public.auth_org_id() and (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and store_id = public.auth_store_id()) or membership_id = public.auth_membership_id()));   -- 本人＝auth_membership_id（0194 の staff_labor_confirmed と同じ型）
revoke all on table public.staff_allowances from public, anon, authenticated;
grant select on table public.staff_allowances to authenticated;

CREATE OR REPLACE FUNCTION public.staff_allowances_set(p_membership_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0195（M-80 追記②）: 固定手当の全行置換（rows＝[{name, amount}]・20 行まで）。管理者＝org 内／店長＝自店の staff（staff_contract_set と同じ柵）。audit
declare
  v_org uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_m record;
  v_before jsonb; v_after jsonb;
  v_i integer := 0;
  r record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_membership_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad args'; end if;
  if jsonb_array_length(p_rows) > 20 then raise exception 'too many'; end if;
  select m.id, m.store_id, m.role, s.org_id into v_m from public.memberships m join public.stores s on s.id = m.store_id where m.id = p_membership_id;
  if v_m.id is null or v_m.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_m.role not in ('manager','staff') then raise exception 'not staff'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and v_m.store_id = public.auth_store_id() and v_m.role = 'staff')) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'amount', x.amount) order by x.sort), '[]'::jsonb) into v_before from public.staff_allowances x where x.membership_id = p_membership_id and x.is_active;
  delete from public.staff_allowances where membership_id = p_membership_id;
  for r in select * from jsonb_to_recordset(p_rows) as x(name text, amount integer) loop
    if r.name is null or length(trim(r.name)) = 0 or length(trim(r.name)) > 20 then raise exception 'bad name'; end if;
    if r.amount is null or r.amount < 0 or r.amount > 99999999 then raise exception 'bad amount'; end if;
    insert into public.staff_allowances (membership_id, org_id, store_id, name, amount, sort) values (p_membership_id, v_org, v_m.store_id, trim(r.name), r.amount, v_i);
    v_i := v_i + 1;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'amount', x.amount) order by x.sort), '[]'::jsonb) into v_after from public.staff_allowances x where x.membership_id = p_membership_id and x.is_active;
  perform public.audit_log_write('staff_allowances_set', 'memberships:' || p_membership_id::text, v_before, v_after, v_m.store_id);
end $function$;
revoke execute on function public.staff_allowances_set(uuid, jsonb) from public, anon;
grant execute on function public.staff_allowances_set(uuid, jsonb) to authenticated;

alter table public.staff_labor_confirmed add column if not exists allowances jsonb not null default '[]'::jsonb;
comment on column public.staff_labor_confirmed.allowances is '★0195（M-80 追記②）: 確定時点の固定手当の内訳 [{name, amount}]（Σ amount＝既存の fixed 列＝staff_attendance_confirm が検証・裁定450 の 6）';
CREATE OR REPLACE FUNCTION public.staff_attendance_confirm(p_store_id uuid, p_period text, p_lock boolean, p_labor jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0192: スタッフ勤怠の月の確定（p_lock=true＝owner／自店 manager）と解除（p_lock=false＝owner のみ）。audit 'staff_attendance_confirm'
-- ★0194（裁定445 ②）: p_lock=true のとき p_labor（スタッフ給与の確定額＝内訳つき）を同じトランザクションで凍結（staff_labor_confirmed・店×月を丸ごと置換）。解除で額も消す。
--   時給制の行は時給×実働を再計算して一致を確認（裁定445 ①・端数は店設定 settings_json.labor_rounding＝down（既定・切捨て＝staffPayOf の floorYen）／up／round）
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_had  boolean;
  v_by   uuid := (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active);
  v_rnd  text;
  v_n    integer := 0;
  v_total bigint := 0;
  v_calc integer;
  v_allow bigint;   -- ★0195（裁定450 の 6）: allowances の合計
  r      record;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_store_id is null or p_lock is null then raise exception 'bad args'; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then raise exception 'forbidden'; end if;
  if not (v_role = 'owner' or (v_role = 'manager' and p_store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- ★0193（相談役確認待ち・推奨案）: 解除も自店の店長に（audit で追える）
  v_had := exists (select 1 from public.staff_attendance_locks l where l.store_id = p_store_id and l.period = p_period);
  if p_lock then
    insert into public.staff_attendance_locks (store_id, org_id, period, locked_by)
    values (p_store_id, v_org, p_period, (select u.id from public.users u where u.auth_user_id = auth.uid() and u.is_active))
    on conflict (store_id, period) do nothing;
    if p_labor is not null then   -- ★0194（裁定445 ②）: 確定と凍結を同一トランザクション（行＝{membership_id, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, allowances}＝★0195 allowances＝固定手当の内訳 [{name, amount}]・Σ amount＝fixed を RPC が検証（裁定450 の 6））
      if jsonb_typeof(p_labor) <> 'array' then raise exception 'bad labor'; end if;
      v_rnd := coalesce((select s.settings_json->>'labor_rounding' from public.stores s where s.id = p_store_id), 'down');
      if v_rnd not in ('down','up','round') then v_rnd := 'down'; end if;
      delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;
      for r in select * from jsonb_to_recordset(p_labor) as x(membership_id uuid, pay_kind text, hourly integer, minutes integer, time_pay integer, fixed integer, monthly integer, daily integer, days integer, amount integer, deductions jsonb, calc_version text, allowances jsonb) loop
        if r.membership_id is null or r.amount is null or r.pay_kind is null then raise exception 'bad labor row'; end if;
        if r.pay_kind not in ('hourly','daily','monthly') then raise exception 'bad pay_kind'; end if;
        if r.amount < 0 or r.amount > 99999999 or coalesce(r.minutes, 0) < 0 or coalesce(r.hourly, 0) < 0 or coalesce(r.fixed, 0) < 0 or coalesce(r.time_pay, 0) < 0 then raise exception 'bad amount'; end if;
        if r.deductions is not null and jsonb_typeof(r.deductions) <> 'array' then raise exception 'bad deductions'; end if;
        if r.allowances is not null and jsonb_typeof(r.allowances) <> 'array' then raise exception 'bad allowances'; end if;   -- ★0195（M-80 追記②）
        if not exists (select 1 from public.memberships m where m.id = r.membership_id and m.store_id = p_store_id and m.role in ('owner','manager','staff')) then raise exception 'bad membership'; end if;
        -- ★0195（裁定450 の 6）: 固定手当の内訳 allowances の月額の合計＝fixed（client の合計を信用しない・裁定445 ①と同じ型・pay_kind に関係なく全行）
        if exists (select 1 from jsonb_array_elements(coalesce(r.allowances, '[]'::jsonb)) x where jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'amount') <> 'number' or (x->>'amount')::numeric < 0 or (x->>'amount')::numeric <> floor((x->>'amount')::numeric) or coalesce(length(trim(x->>'name')), 0) = 0) then raise exception 'bad allowances'; end if;
        select coalesce(sum((x->>'amount')::bigint), 0) into v_allow from jsonb_array_elements(coalesce(r.allowances, '[]'::jsonb)) x;
        if v_allow <> coalesce(r.fixed, 0) then raise exception 'labor mismatch: fixed % <> sum(allowances) %', coalesce(r.fixed, 0), v_allow; end if;
        if r.pay_kind = 'hourly' then   -- ★裁定445 ①: 時給 × 実働 を再計算して一致（端数は店設定）
          v_calc := case v_rnd when 'up' then ceil(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) when 'round' then round(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) else floor(coalesce(r.hourly, 0) * coalesce(r.minutes, 0) / 60.0) end;
          if coalesce(r.time_pay, -1) <> v_calc then raise exception 'labor mismatch: time_pay % <> % (hourly % x minutes % / 60, %)', r.time_pay, v_calc, r.hourly, r.minutes, v_rnd; end if;
          if r.amount <> v_calc + coalesce(r.fixed, 0) then raise exception 'labor mismatch: amount % <> time_pay % + fixed %', r.amount, v_calc, coalesce(r.fixed, 0); end if;
        end if;
        insert into public.staff_labor_confirmed (membership_id, org_id, store_id, period, pay_kind, hourly, minutes, time_pay, fixed, monthly, daily, days, amount, deductions, calc_version, confirmed_by, allowances)
        values (r.membership_id, v_org, p_store_id, p_period, r.pay_kind, coalesce(r.hourly, 0), coalesce(r.minutes, 0), coalesce(r.time_pay, 0), coalesce(r.fixed, 0), coalesce(r.monthly, 0), coalesce(r.daily, 0), coalesce(r.days, 0), r.amount, coalesce(r.deductions, '[]'::jsonb), coalesce(r.calc_version, ''), v_by, coalesce(r.allowances, '[]'::jsonb));   -- ★0195: 固定手当の内訳も凍結
        v_n := v_n + 1; v_total := v_total + r.amount;
      end loop;
    end if;
  else
    delete from public.staff_attendance_locks where store_id = p_store_id and period = p_period;
    delete from public.staff_labor_confirmed where store_id = p_store_id and period = p_period;   -- ★0194（裁定445 ②）: 解除＝確定額も消す（見込みに戻る）
  end if;
  perform public.audit_log_write('staff_attendance_confirm', 'stores:' || p_store_id::text || ':' || p_period,
    jsonb_build_object('locked', v_had), jsonb_build_object('locked', p_lock, 'labor_rows', v_n, 'labor_total', v_total), p_store_id);   -- ★0194: 凍結の人数と合計も
end $function$;
revoke execute on function public.staff_attendance_confirm(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.staff_attendance_confirm(uuid, text, boolean, jsonb) to authenticated;

commit;
