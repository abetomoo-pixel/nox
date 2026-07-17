-- 0046_f4c_method_detail.sql
-- F4c 決済端末連携（方式A・完全非連携）: payments.method_detail 追加 + check_pay 7引数置換
-- 裁定: 語彙は4値維持（cash/card/ar/other）・端末カード=card・QR/電子マネー=other 収容
--       method_detail = 手段内訳メモ（任意・50字・空→null）＝突合 drill-down 用
--       語彙拡張の5点セット改修（CHECK/check_pay/daily_report_aggregate 名指し/凍結列/report-board）を恒久回避
-- 置換方式: 旧6引数版 drop → 7引数版（p_method_detail 末尾 default null＝既存6引数呼び互換）
-- 本体: live pg_get_functiondef（2026-07-17 取得）起点・差分は宣言1行+検証2行+INSERT1列のみ
-- 構成: 再適用可（if not exists / or replace / drop if exists）だが手貼りは1回

begin;

-- ============================================================
-- 1) payments.method_detail（任意・50字・null 可）
-- ============================================================
alter table public.payments
  add column if not exists method_detail text;

alter table public.payments
  drop constraint if exists payments_method_detail_check;
alter table public.payments
  add constraint payments_method_detail_check
  check (method_detail is null or char_length(method_detail) <= 50);

-- ============================================================
-- 2) check_pay 7引数置換（旧6引数版 drop・set_cast_norm 前例踏襲）
--    差分は【F4c】マーク3箇所のみ・他は live 逐語
-- ============================================================
drop function if exists public.check_pay(uuid, text, integer, text, integer, uuid);

create or replace function public.check_pay(
  p_check_id uuid, p_method text, p_amount integer,
  p_pay_group text default 'A'::text,
  p_tendered integer default null::integer,
  p_idem_key uuid default null::uuid,
  p_method_detail text default null::text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount, p_tendered, p_idem_key, v_actor, v_detail)
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id), v_chk.store_id);

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;

revoke all on function public.check_pay(uuid, text, integer, text, integer, uuid, text) from public, anon;
grant execute on function public.check_pay(uuid, text, integer, text, integer, uuid, text) to authenticated;

commit;
