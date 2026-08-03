-- 0073_f2f_invoice_registration_period.sql
-- #6 インボイス登録の効力期間・通知受領日を保持（裁定23-b ③）
-- 依存: 0015（cast_tax_profiles 本体）/ 0021（reg_no 書式 check・set_cast_tax_profile 4引数版）
-- ★非冪等要素: なし（列追加は if not exists・関数は旧署名 drop ＋ create or replace）
-- ★底本: live pg_get_functiondef（2026-07-31 取得）に p_reg_valid_from / p_reg_valid_to / p_reg_notified_on を追加

begin;

-- ① 列追加（date＝人間が決める日の慣習・period_start/period_end に倣う）
alter table public.cast_tax_profiles
  add column if not exists reg_valid_from  date,  -- 登録の効力発生日
  add column if not exists reg_valid_to    date,  -- 失効日（null=有効中）
  add column if not exists reg_notified_on date;  -- 登録通知受領日（登録日以後・通知前の救済判定用）

comment on column public.cast_tax_profiles.reg_valid_from is
  '適格請求書発行事業者登録の効力発生日。取引日時点で登録が有効かの判定に使う。';
comment on column public.cast_tax_profiles.reg_valid_to is
  '同 失効日。null=有効中。';
comment on column public.cast_tax_profiles.reg_notified_on is
  '登録通知の受領日。登録日以後・通知到達前の取引は、通知後に番号を相手方へ通知することで適格請求書として成立する。';

-- ② 期間の整合（from <= to）
alter table public.cast_tax_profiles
  drop constraint if exists cast_tax_profiles_reg_period_chk;
alter table public.cast_tax_profiles
  add constraint cast_tax_profiles_reg_period_chk
  check (reg_valid_from is null or reg_valid_to is null or reg_valid_from <= reg_valid_to);

-- ③ dev の NOT VALID 解消（本番は 0021 適用時点で VALID になるため非対称を揃える）
--    ★汚染ゼロを実測済み（reg_no 入力 0 件 / 全 6 行・2026-07-31）
alter table public.cast_tax_profiles validate constraint cast_tax_profiles_reg_no_fmt;

-- ④ 旧署名を先に drop（PostgreSQL は署名が変わると ACL を引き継がない）
drop function if exists public.set_cast_tax_profile(uuid, text, text, text);

-- ⑤ 7引数版（★live 定義の逐語写経＋3引数追加）
create or replace function public.set_cast_tax_profile(
  p_cast_id uuid, p_mode text, p_invoice text, p_reg_no text,
  p_reg_valid_from date, p_reg_valid_to date, p_reg_notified_on date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cast_org uuid; v_cast_store uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_mode not in ('委託','雇用') then raise exception 'bad mode'; end if;
  if p_invoice is not null and p_invoice not in ('課税','免税') then raise exception 'bad invoice'; end if;
  if p_reg_no is not null and p_reg_no !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
  if p_reg_valid_from is not null and p_reg_valid_to is not null
     and p_reg_valid_from > p_reg_valid_to then raise exception 'bad reg period'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(t) into v_before from public.cast_tax_profiles t where t.cast_id = p_cast_id;
  insert into public.cast_tax_profiles (cast_id, org_id, store_id, mode, invoice, reg_no,
    reg_valid_from, reg_valid_to, reg_notified_on)
  values (p_cast_id, v_cast_org, v_cast_store, p_mode, p_invoice, p_reg_no,
    p_reg_valid_from, p_reg_valid_to, p_reg_notified_on)
  on conflict (cast_id) do update
    set mode = excluded.mode, invoice = excluded.invoice, reg_no = excluded.reg_no, store_id = excluded.store_id,
        reg_valid_from = excluded.reg_valid_from, reg_valid_to = excluded.reg_valid_to,
        reg_notified_on = excluded.reg_notified_on;
  select to_jsonb(t) into v_after from public.cast_tax_profiles t where t.cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_tax_profile', 'cast_tax_profiles:' || p_cast_id::text,
    v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

-- ⑥ ACL 再適用（★署名変更のため必須・0062/0063/0072 と同型）
revoke execute on function public.set_cast_tax_profile(uuid, text, text, text, date, date, date) from public, anon;
grant  execute on function public.set_cast_tax_profile(uuid, text, text, text, date, date, date) to authenticated;

-- ⑦ オーバーロードが1本であることを assert（起草教訓2）
do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'set_cast_tax_profile';
  if n <> 1 then raise exception 'set_cast_tax_profile overload = %（1本であること）', n; end if;
end $$;

commit;
