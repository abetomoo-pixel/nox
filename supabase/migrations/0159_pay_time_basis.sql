-- 0159_pay_time_basis.sql
-- マイグレーション名: 0159_pay_time_basis（裁定324＋追補1・追補2・起票89・91・92）
-- 生成器: docs/tmp/gen_0159.mjs（手打ち禁止）。写経元＝docs/tmp/0159_live.json（q0930_live_0159.mjs が pg_get_functiondef で dump した live 全文・CR 除去）。
--   既存関数は ★ の置換点以外 1 バイト不変（299-11）。新設 2 本はこのテンプレート内に手書き・期待 md5 は生成物から算出。
--
-- 写経元 live md5（2026-09-30・prosrc の CR 除去・先頭 8 桁）→ 本 mig 適用後の期待 md5:
--   customer_register        8a0c30c7 → e165599a
--   kiosk_transport_issue    76412c7e → 08c5dbc3
--   demo_org_reset           30c846ae → 7b6070a6
--   新設 2 本: payroll_shortfall_sync 0cc27ae4／set_store_pay_time_basis 7b8e7fb1
--   不触の控え（適用後も不変であること）: payroll_carryover_sync 59d06f2a／payroll_adjustment_add 0feabfac／payroll_adjustment_delete 3a1581c2／set_store_profile 4f2e9f82／
--     set_store_okuri_mode 71e07a1e／auth_staff_can_register 41f6a62a／auth_staff_can_crm 3b8b92ac／transport_issue_self 2eebb64f／kiosk_punch_state 48300293／
--     payroll_attentions_of 04d88b37／payroll_attention_resolve 01b27881／billing_writable_of 927fb270／audit_log_write 182eba3a／biz_date_of 196c453f／period_bounds 96e10e9a
--
-- 器（裁定324 追補2 で確定・2026-09-30）:
--   ★1 【324-3／324-4・追補1】payroll_adjustments: +biz_date date（null 可・shortfall のみ必須）・source_ck に 'shortfall'・
--        shortfall_ck（source<>'shortfall' or (biz_date not null and mode='fixed' and before_withholding and target_shift_id not null)）・
--        部分 unique payroll_adjustments_shortfall_uidx (run_id, cast_id, biz_date) where source='shortfall'。carryover の unique は不変。
--   ★2 【324-4・追補2-2】payroll_shortfall_sync(p_run_id uuid, p_rows jsonb)＝payroll_carryover_sync の写経。金額は pay.ts 側（route が p_rows を渡す）。
--        p_rows の各要素＝{cast_id uuid, biz_date date, amount int>=0, target_shift_id uuid, basis text, reason text}（形が違えば 'bad row'・cast が自店でなければ 'bad cast'・
--        shift が cast×店×biz_date と食い違えば 'bad shift'）。amount>0 は upsert（mode 'fixed'・before_withholding true・show_detail true・source 'shortfall'）・
--        amount 0 は upsert せず、p_rows に無い（または 0 の）shortfall 行を delete（冪等）。audit_log_write 6 引数。戻り＝upsert＋delete 件数。
--        ★324 追補3（2026-09-30）: 課金ゲート行を持たない（payroll_carryover_sync と同じ＝給与は過去労働の清算で非ゲート・名簿 B(e)）。
--   ★3 【324-1／324-2／324-5・追補2-1】set_store_pay_time_basis(p_store_id uuid, p_value text, p_apply text)＝set_store_okuri_mode を骨格に写経。
--        ゲート＝auth_org_id null／billing_writable_of(v_org)／店の org 照合／owner または manager 自店（★okuri_mode の owner 限定を 324-5 で広げる）。
--        p_value ∈ ('punch','shift') でなければ 'bad pay_time_basis'・p_apply ∈ ('next','now') でなければ 'bad apply'。
--        'next'＝settings_json.pay_time_basis_next=p_value・pay_time_basis_next_from=翌暦月 1 日（JST・'YYYY-MM-DD'）。
--        'now'＝当店の payroll_runs が 1 行以上なら raise 'runs exist'・0 行なら pay_time_basis=p_value を直接書く（ウィザード STEP 3 用）。
--        set_store_profile の白名単は変更しない（追補1 の +3 撤回）。昇格（next_from 到来）は pay.ts の比較で吸収し settings_json は書き換えない（324-2）。
--   ★4 【起票89・追補2-5】customer_register の staff 分岐を (auth_staff_can_crm() or auth_staff_can_register()) に。auth_staff_can_register() は live に既存（memberships.can_register）＝新設なし。cast は含めない。
--   ★5 【起票91】kiosk_transport_issue: v_org := v_device.org_id を受け、ゲート行を規約形 billing_writable_of(v_org) に（billing 段47-1 の「形」147→148）。他は不変。
--   ★6 【起票92・追補2-3】demo_org_reset: c_wipe に payroll_attentions・daily_pays（'payroll_adjustments' の前）と payroll_run_deduction_overrides（'deductions' の前＝FK deduction_id）・
--        c_load に daily_pays・payroll_attentions（'payroll_runs' の後）と payroll_run_deduction_overrides（'deductions' の後）。★起草判断: 追補2-3 は 3 表とも 'payroll_adjustments' の前／'payroll_runs' の後と
--        指示するが、payroll_run_deduction_overrides は deductions を FK で参照するため、deductions より先に消し・後に入れないと reset が FK で止まる（要追認）。
--   ★7 revoke／grant（新設 2 本＝authenticated＋service_role・再作成 3 本は live の proacl を再掲）。
--
-- 名簿・suite への影響（手貼り後の suite 便で反映）:
--   関数 288 → 290（新設 2）。課金ゲート名簿 A +1（set_store_pay_time_basis＝ゲート内蔵）・B(e) +1（payroll_shortfall_sync＝非ゲート・324 追補3）。表 79 不変。'billing locked' 148 → 149・挿入行の形 147 → 149（起票91 で kiosk_transport_issue が規約形に）。
--   pin が変わる suite: payroll-adjust pa(1-1)（列 17→18）／pa(1-2)（COLS 末尾 +biz_date）／pa(1-3)（CHECK 5→6）／pa(1-6b)（source 5 値）／pa(1-7)（index +shortfall_uidx）／
--   billing 段47-1（対象 148→149・除外 140→141・ゲート 149・述語参照 150・形 149）／grants G4d（+2）／anon-guard probe +2／customers-keep ck(5-1)（c_wipe 76・c_load 75）／demo-reset dr(0-2)（75 表）／
--   0158 suite EXPECTED_NEW.kiosk_transport_issue（76412c7e→08c5dbc3）・s-3／t-1（関数 288→290）／grants G1／G2／G5（.length）。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に）: (1) 'nox-project-proof' orgs 3 (2) md5 5 本＝上の期待値 (3) 不触 3 本 (4) proacl 5 本 (5) payroll_adjustments の列 18・CHECK 6・index 7
--   (6) demo_org_reset の c_wipe／c_load に 3 表 (7) 関数 290・表 79。
begin;

-- ★1 payroll_adjustments: biz_date・source_ck・shortfall_ck・部分 unique
alter table public.payroll_adjustments add column if not exists biz_date date;   -- ★1 0159（324-4・追補1）: 不就労控除の営業日（shortfall のみ必須・他は null）
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_source_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_source_ck
  check (source in ('manual','carryover','settlement','sanction','shortfall'));   -- ★1 0159: +'shortfall'
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_shortfall_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_shortfall_ck
  check (source <> 'shortfall' or (biz_date is not null and mode = 'fixed' and before_withholding = true and target_shift_id is not null));   -- ★1 0159: shortfall 行の形（追補2-2＝mode 'fixed'・源泉前・基準 shift 必須）
create unique index if not exists payroll_adjustments_shortfall_uidx
  on public.payroll_adjustments (run_id, cast_id, biz_date) where source = 'shortfall';   -- ★1 0159: 営業日ごとに 1 行（carryover_uidx は不変）

-- ★2 payroll_shortfall_sync（payroll_carryover_sync 59d06f2a の写経・金額は pay.ts 側）
create or replace function public.payroll_shortfall_sync(p_run_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_period  text;
  v_r       jsonb;                                  -- ★2 p_rows の 1 要素
  v_cast    uuid;
  v_date    date;
  v_amount  integer;
  v_shift   uuid;
  v_basis   text;
  v_reason  text;
  v_keep    text[] := array[]::text[];              -- ★2 残す行のキー（cast_id:biz_date）
  v_up      integer := 0;
  v_del     integer := 0;
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  select store_id, status, period into v_store, v_status, v_period
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad row'; end if;

  -- ★2 (1) p_rows を検証しつつ upsert（amount 0 は残さない＝delete 対象）
  for v_r in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_r) <> 'object'
       or coalesce(jsonb_typeof(v_r->'cast_id'), '') <> 'string' or coalesce(jsonb_typeof(v_r->'biz_date'), '') <> 'string'
       or coalesce(jsonb_typeof(v_r->'amount'), '') <> 'number' or coalesce(jsonb_typeof(v_r->'target_shift_id'), '') <> 'string'
       or coalesce(jsonb_typeof(v_r->'basis'), '') <> 'string' or coalesce(jsonb_typeof(v_r->'reason'), '') <> 'string' then
      raise exception 'bad row';
    end if;
    begin
      v_cast   := (v_r->>'cast_id')::uuid;
      v_date   := (v_r->>'biz_date')::date;
      v_shift  := (v_r->>'target_shift_id')::uuid;
    exception when others then
      raise exception 'bad row';
    end;
    if (v_r->>'amount')::numeric <> trunc((v_r->>'amount')::numeric) or (v_r->>'amount')::numeric < 0 or (v_r->>'amount')::numeric > 2147483647 then raise exception 'bad row'; end if;
    v_amount := (v_r->>'amount')::integer;
    v_basis  := trim(v_r->>'basis');
    v_reason := trim(v_r->>'reason');
    if length(v_basis) > 200 or length(v_reason) < 1 or length(v_reason) > 200 then raise exception 'bad row'; end if;
    if not exists (select 1 from public.casts c where c.id = v_cast and c.org_id = v_org and c.store_id = v_store) then raise exception 'bad cast'; end if;
    if not exists (select 1 from public.shifts s where s.id = v_shift and s.cast_id = v_cast and s.store_id = v_store and s.date = v_date) then raise exception 'bad shift'; end if;
    if v_amount > 0 then
      insert into payroll_adjustments(
        org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
        before_withholding, show_detail, reason, created_by,
        source, basis, target_shift_id, biz_date)
      values (
        v_org, v_store, p_run_id, v_cast, 'fixed',
        v_amount,
        null,
        true,                                                                                   -- ★2 源泉前（324-3）
        true,                                                                                   -- ★2 show_detail
        v_reason, v_actor,
        'shortfall', v_basis, v_shift, v_date)
      on conflict (run_id, cast_id, biz_date) where source = 'shortfall' do update
        set amount          = excluded.amount,
            basis           = excluded.basis,
            target_shift_id = excluded.target_shift_id,
            reason          = excluded.reason,
            created_by      = excluded.created_by;
      v_up := v_up + 1;
      v_keep := v_keep || (v_cast::text || ':' || v_date::text);
    end if;
  end loop;

  -- ★2 (2) p_rows に無い（または 0 の）shortfall 行を削除（冪等・hard delete＝carryover_sync と同型）
  delete from payroll_adjustments a
   where a.run_id = p_run_id and a.source = 'shortfall'
     and not ((a.cast_id::text || ':' || a.biz_date::text) = any(v_keep));
  get diagnostics v_del = row_count;

  perform audit_log_write(
    'payroll_shortfall_sync',
    'payroll_runs:' || p_run_id::text,
    null,
    jsonb_build_object('run_id', p_run_id, 'period', v_period,
      'upserted', v_up, 'deleted', v_del, 'rows', jsonb_array_length(p_rows)),
    v_store,
    '不就労控除の同期');

  return v_up + v_del;
end $$;

-- ★3 set_store_pay_time_basis（set_store_okuri_mode 71e07a1e を骨格に写経・ゲートは owner／manager 自店＝324-5）
create or replace function public.set_store_pay_time_basis(p_store_id uuid, p_value text, p_apply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_store record;
  v_prev  jsonb;
  v_next  jsonb;
  v_from  date;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_value is null or p_value not in ('punch','shift') then raise exception 'bad pay_time_basis'; end if;   -- ★3 slide_apply 型（'bad slide_apply'）
  if p_apply is null or p_apply not in ('next','now') then raise exception 'bad apply'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';   -- ★3 324-5: owner／manager 自店（okuri_mode の owner 限定より広い）
  end if;

  v_prev := jsonb_build_object(
    'pay_time_basis',           coalesce(nullif(trim(v_store.settings_json->>'pay_time_basis'), ''), 'punch'),
    'pay_time_basis_next',      v_store.settings_json->>'pay_time_basis_next',
    'pay_time_basis_next_from', v_store.settings_json->>'pay_time_basis_next_from');

  if p_apply = 'now' then
    -- ★3 'now'＝給与 run が 1 行も無い店だけ（ウィザード STEP 3）。1 行以上あれば次期からの切替（'next'）を使う
    if exists (select 1 from public.payroll_runs r where r.store_id = p_store_id) then raise exception 'runs exist'; end if;
    update public.stores
       set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{pay_time_basis}', to_jsonb(p_value), true)
     where id = p_store_id;
  else
    -- ★3 'next'＝次の暦月の 1 日（JST）から。pay.ts が run の calc_period_start >= next_from で next を採用する（324-2）＝ここでは昇格しない
    v_from := (date_trunc('month', (now() at time zone 'Asia/Tokyo')) + interval '1 month')::date;
    update public.stores
       set settings_json = jsonb_set(jsonb_set(coalesce(settings_json, '{}'::jsonb), '{pay_time_basis_next}', to_jsonb(p_value), true),
                                     '{pay_time_basis_next_from}', to_jsonb(to_char(v_from, 'YYYY-MM-DD')), true)
     where id = p_store_id;
  end if;

  select jsonb_build_object(
    'pay_time_basis',           coalesce(nullif(trim(s.settings_json->>'pay_time_basis'), ''), 'punch'),
    'pay_time_basis_next',      s.settings_json->>'pay_time_basis_next',
    'pay_time_basis_next_from', s.settings_json->>'pay_time_basis_next_from') into v_next
    from public.stores s where s.id = p_store_id;

  perform public.audit_log_write('set_store_pay_time_basis', 'stores:' || p_store_id::text,
    v_prev, v_next || jsonb_build_object('apply', p_apply), p_store_id);
end $$;

-- ★4 customer_register（8a0c30c7）: staff 分岐を can_crm OR can_register に（他は 1 バイト不変）
CREATE OR REPLACE FUNCTION public.customer_register(p_store_id uuid, p_name text, p_furigana text DEFAULT NULL::text, p_birthday date DEFAULT NULL::date, p_tel text DEFAULT NULL::text, p_prefs text DEFAULT NULL::text, p_memo text DEFAULT NULL::text, p_cast_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型＝store 不在/他 org も forbidden）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_crm 準拠）
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and (public.auth_staff_can_crm() or public.auth_staff_can_register()))) then   -- ★4 0159（起票89・324 追補2-5）: レジ権限の staff にも開放（cast は含めない）
    raise exception 'forbidden';
  end if;

  -- 担当割当は owner/manager のみ。staff が p_cast_id を渡しても無視（null 化）
  if p_cast_id is not null and v_role not in ('owner','manager') then
    p_cast_id := null;
  end if;

  -- 割当先 cast は同 org・同店（越境割当封鎖）
  if p_cast_id is not null then
    if not exists (
      select 1 from public.casts c
      where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id
    ) then
      raise exception 'invalid cast';
    end if;
  end if;

  insert into public.customers (org_id, store_id, name, furigana, cast_id, birthday, tel, prefs, memo)
  values (v_org, p_store_id, trim(p_name), p_furigana, p_cast_id, p_birthday, p_tel, p_prefs, p_memo)
  returning id into v_id;

  perform public.audit_log_write('customer_register', 'customers:' || v_id::text, null,
    (select to_jsonb(cu) from public.customers cu where cu.id = v_id), p_store_id);
  return v_id;
end $function$;

-- ★5 kiosk_transport_issue（76412c7e）: ゲート行を規約形に（他は 1 バイト不変）
CREATE OR REPLACE FUNCTION public.kiosk_transport_issue(p_punch_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
  v_org    uuid;   -- ★5 0159（起票91）: 端末の org を受けてゲート行を規約形（billing_writable_of(v_org)）に
  v_p      record;
  v_store  record;
  v_base   integer;
  v_date   date;
  v_idem   uuid;
  v_actor  uuid;
  v_id     uuid;
  v_ip     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active and k.purpose = 'punch';
  if not found then raise exception 'forbidden'; end if;
  v_org := v_device.org_id;   -- ★5 0159
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;   -- ★5 0159: 規約形（billing 段47-1「挿入行の形」）
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at, p.source into v_p from public.punches p where p.id = p_punch_id;
  -- 他店・他 org・存在しない id・kiosk 以外の打刻は同じ 'forbidden'
  if v_p.id is null or v_p.org_id <> v_device.org_id or v_p.store_id <> v_device.store_id or v_p.source <> 'kiosk' then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  if coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat') <> 'actual' then raise exception 'okuri not actual'; end if;
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if v_p.punched_at < now() - interval '10 minutes' then raise exception 'punch expired'; end if;   -- 端末は cast を識別しない＝打刻直後だけ（起草判断 (h)）
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select c.user_id into v_actor from public.casts c where c.id = v_p.cast_id;   -- 操作者なし＝cast の user（無ければ null）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key)
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_base, v_date, null, v_actor, v_idem)
  returning id into v_id;
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_transport_issue',
     'transport:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', v_p.cast_id, 'amount', v_base,
                        'biz_date', v_date, 'punch_id', v_p.id),
     v_ip);
  return v_id;
end $function$;

-- ★6 demo_org_reset（30c846ae）: c_wipe／c_load に 3 表（他は 1 バイト不変）
CREATE OR REPLACE FUNCTION public.demo_org_reset(p_org_id uuid, p_payload jsonb, p_mode text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ★4 削除順（docs/tmp/0149_pre.md w2 の 1〜68 に stores 直前の memberships を加えた 69 手・53 手目＝stock_logs 再削除・裁定278-1）（0152 ★20: +3＝72 手・0153 ★21: +check_customers＝73 手）
  c_wipe constant text[] := array[
    'advances','approvals','ar_collections','attendance','attendance_incentives','audit_logs','bottle_keeps','cast_norms','cast_pin','cast_plan',
    'cast_sensitive','cast_tax_profiles','cast_unavailable_days','check_cast_backs','check_nominations','check_seats','check_customers','comp_plan_components','comp_plans','custom_back_defs','customer_notes',
    'daily_reports','payroll_run_deduction_overrides','deductions','drink_claims','feature_flags','kiosk_sessions','notices','payment_records','payments','payroll_attentions','daily_pays','payroll_adjustments','payslips',   -- ★6 0159（起票92）: +3 表（overrides は deductions より先に消す＝FK deduction_id）
    'penalty_config','pricing_rules','print_jobs','printer_config','product_costs','punches','receipt_issues','receivables','reservations','shift_rules',
    'shifts','staff_pin','staff_shift_deadlines','staff_shifts','staffing_needs','stock_logs','store_business_hours','store_sales_targets','transport','trials',
    'withholding_payments','check_referrals','referral_payouts','check_lines','stock_logs','checks','customers','kiosk_devices','payroll_runs','pricing_categories','products','seats',
    'shift_periods','shift_wishes','staff_shift_wishes','casts','product_categories','staff_shift_patterns','cast_ranks','referrers','memberships','stores'];
  -- ★4 投入順（削除順の逆・53 手目の stock_logs 再削除を除く 68 表・stores 直後に memberships）（0152 ★20: +3＝71 表・0153 ★21: +check_customers（'checks' の後）＝72 表）
  c_load constant text[] := array[
    'stores','memberships','referrers','cast_ranks','staff_shift_patterns','product_categories','casts','staff_shift_wishes','shift_wishes','shift_periods','seats','products',
    'pricing_categories','payroll_runs','daily_pays','payroll_attentions','kiosk_devices','customers','checks','check_customers','check_lines','check_referrals','referral_payouts','withholding_payments','trials','transport','store_sales_targets',   -- ★6 0159: +2（payroll_runs の後）
    'store_business_hours','stock_logs','staffing_needs','staff_shifts','staff_shift_deadlines','staff_pin','shifts','shift_rules','reservations','receivables',
    'receipt_issues','punches','product_costs','printer_config','print_jobs','pricing_rules','penalty_config','payslips','payroll_adjustments','payments',
    'payment_records','notices','kiosk_sessions','feature_flags','drink_claims','deductions','payroll_run_deduction_overrides','daily_reports','customer_notes','custom_back_defs','comp_plans',   -- ★6 0159: +1（deductions の後＝FK deduction_id）
    'comp_plan_components','check_seats','check_nominations','check_cast_backs','cast_unavailable_days','cast_tax_profiles','cast_sensitive','cast_plan','cast_pin','cast_norms',
    'bottle_keeps','audit_logs','attendance_incentives','attendance','ar_collections','approvals','advances'];
  c_keep constant text[] := array['orgs','org_billing','users'];                             -- ★4 残す 3 表（payload にあれば 'bad table'・裁定278-1）
  v_demo     boolean;
  v_t        text;
  v_key      text;
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
begin
  -- ★3 冒頭ガード（この順）
  if p_mode is null or p_mode not in ('all','wipe','load') then raise exception 'bad mode'; end if;
  select is_demo into v_demo from public.orgs where id = p_org_id;
  if v_demo is null or v_demo <> true then raise exception 'not demo'; end if;
  if p_mode in ('all','load') and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then raise exception 'bad payload'; end if;

  -- ★4 payload のキー検査（投入配列に無い・残す 3 表 → 'bad table'）
  if p_mode in ('all','load') then
    for v_key in select jsonb_object_keys(p_payload) loop
      if v_key = any (c_keep) or not (v_key = any (c_load)) then raise exception 'bad table'; end if;
    end loop;
    -- ★6 stock_logs: トリガ生成分（sale／sale_remove）は payload に入れない
    if p_payload ? 'stock_logs' and exists (
      select 1 from jsonb_array_elements(p_payload->'stock_logs') e where e->>'reason' in ('sale','sale_remove')
    ) then raise exception 'bad stock_logs'; end if;
    -- ★6 全表・全要素の org_id 検査（投入前に一括＝1 行でも不一致なら何も書かない）
    foreach v_t in array c_load loop
      if v_t = 'memberships' then continue; end if;   -- ★D 例外（裁定279-1）: org_id 列なし＝投入直前に store_id／user_id で検査
      if p_payload ? v_t then
        if jsonb_typeof(p_payload->v_t) <> 'array' then raise exception 'bad payload'; end if;
        if exists (select 1 from jsonb_array_elements(p_payload->v_t) e where (e->>'org_id') is null or (e->>'org_id')::uuid <> p_org_id) then
          raise exception 'org mismatch';
        end if;
      end if;
    end loop;
  end if;

  -- ★5 wipe（固定の表順・format('%I') と配列要素のみ）
  if p_mode in ('all','wipe') then
    foreach v_t in array c_wipe loop
      if v_t = 'memberships' then   -- ★C 例外（裁定279-1）: org_id 列なし＝p_org_id の stores に属する行
        delete from public.memberships where store_id in (select id from public.stores where org_id = p_org_id);
      else
        execute format('delete from public.%I where org_id = $1', v_t) using p_org_id;
      end if;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(v_t, coalesce((v_deleted->>v_t)::integer, 0) + v_n);   -- stock_logs は 2 回分を合算
    end loop;
  end if;

  -- ★6 load（投入順・表ごと 1 文の jsonb_populate_recordset）
  if p_mode in ('all','load') then
    foreach v_t in array c_load loop
      if p_payload ? v_t then
        -- ★D 例外（裁定279-1）: memberships は投入直前（stores は投入済み）に store_id／user_id の所属を検査
        if v_t = 'memberships' then
          if jsonb_typeof(p_payload->'memberships') <> 'array' then raise exception 'bad payload'; end if;
          if exists (
            select 1 from jsonb_array_elements(p_payload->'memberships') e
             where (e->>'store_id') is null or (e->>'user_id') is null
                or not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.org_id = p_org_id)
                or not exists (select 1 from public.users  u where u.id = (e->>'user_id')::uuid  and u.org_id = p_org_id)
          ) then raise exception 'org mismatch'; end if;
        end if;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_t, v_t) using (p_payload->v_t);
        get diagnostics v_n = row_count;
        v_inserted := v_inserted || jsonb_build_object(v_t, v_n);
        -- ★7 check_lines 投入の直後: トリガが at=now()（本 tx）で作った sale 行の at を対応する明細の created_at へ
        --    結合＝(store_id, product_id, delta=-qty) の区画内で行番号を突き合わせる（stock_logs に check_id／line_id は無い＝相談役の判断点）
        if v_t = 'check_lines' then
          with s as (
            select sl.id, sl.store_id, sl.product_id, sl.delta,
                   row_number() over (partition by sl.store_id, sl.product_id, sl.delta order by sl.id) as rn
              from public.stock_logs sl
             where sl.org_id = p_org_id and sl.reason = 'sale' and sl.at = now()
          ), l as (
            select l.created_at, l.store_id, l.product_id, -l.qty as delta,
                   row_number() over (partition by l.store_id, l.product_id, -l.qty order by l.created_at, l.id) as rn
              from public.check_lines l
             where l.org_id = p_org_id and l.product_id is not null and l.qty <> 0
          )
          update public.stock_logs sl
             set at = l.created_at
            from s join l on l.store_id = s.store_id and l.product_id = s.product_id and l.delta = s.delta and l.rn = s.rn
           where sl.id = s.id;
        end if;
      end if;
    end loop;
  end if;

  -- ★8 末尾
  if p_mode <> 'wipe' then
    update public.orgs set demo_reset_at = now() where id = p_org_id;
  end if;
  perform public.audit_log_write_service(p_org_id, null, 'demo.reset',
    'orgs:' || p_org_id::text,
    null,
    jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted), null);
  return jsonb_build_object('mode', p_mode, 'deleted', v_deleted, 'inserted', v_inserted);
end $function$;

-- ★7 grants（新設 2 本＋再作成した既存 3 本は live の proacl を再掲＝create or replace は ACL を保つが明示する）
revoke all on function public.payroll_shortfall_sync(uuid, jsonb) from public, anon;
grant execute on function public.payroll_shortfall_sync(uuid, jsonb) to authenticated, service_role;
revoke all on function public.set_store_pay_time_basis(uuid, text, text) from public, anon;
grant execute on function public.set_store_pay_time_basis(uuid, text, text) to authenticated, service_role;
revoke all on function public.customer_register(uuid, text, text, date, text, text, text, uuid) from public, anon;
grant execute on function public.customer_register(uuid, text, text, date, text, text, text, uuid) to authenticated, service_role;
revoke all on function public.kiosk_transport_issue(uuid) from public, anon;
grant execute on function public.kiosk_transport_issue(uuid) to authenticated, service_role;
revoke all on function public.demo_org_reset(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.demo_org_reset(uuid, jsonb, text) to service_role;

commit;

-- 検証（Run 後・貼り先証明を先頭に）
select 'nox-project-proof', count(*) from public.orgs;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('customer_register','kiosk_transport_issue','demo_org_reset','payroll_shortfall_sync','set_store_pay_time_basis') order by 1;
select proname, left(md5(replace(prosrc, E'\r', '')), 8) as md5 from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_carryover_sync','set_store_profile','set_store_okuri_mode') order by 1;
select proname, pg_get_function_identity_arguments(oid), proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in
  ('customer_register','kiosk_transport_issue','demo_org_reset','payroll_shortfall_sync','set_store_pay_time_basis') order by 1;
select (select count(*) from information_schema.columns where table_schema='public' and table_name='payroll_adjustments') as cols,
       (select count(*) from pg_constraint where conrelid='public.payroll_adjustments'::regclass and contype='c') as checks,
       (select count(*) from pg_indexes where schemaname='public' and tablename='payroll_adjustments') as indexes;
select (prosrc like '%''payroll_attentions'',''daily_pays'',''payroll_adjustments''%') as wipe_ok, (prosrc like '%''payroll_runs'',''daily_pays'',''payroll_attentions''%') as load_ok,
       (prosrc like '%''payroll_run_deduction_overrides'',''deductions''%') as wipe_ov_ok, (prosrc like '%''deductions'',''payroll_run_deduction_overrides''%') as load_ov_ok
  from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset';
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) as functions, (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables;
