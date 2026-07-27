-- mig0061_inventory_v1.sql
-- 在庫台帳 v1: products.reorder_point + 売上結線トリガ2系統
-- 方針: money-core RPC（check_add_line/check_remove_line/check_void）は byte 非改変。
--       結線は check_lines AFTER INSERT/DELETE + checks AFTER UPDATE(→void) のトリガで実現。
-- 冪等: 再実行可（add column if not exists / create or replace / drop trigger if exists）

begin;

-- 1) products.reorder_point（発注点しきい・null=しきい無し）
alter table public.products
  add column if not exists reorder_point integer;

-- 2) check_lines トリガ関数: INSERT→sale(-qty) / DELETE→sale_remove(+qty)
--    by_user_id は product_stock_add と同型（解決できなければ null・stock_logs.by_user_id は NULLABLE/FKなし）
create or replace function public.stock_on_check_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  select id into v_actor
    from public.users
   where auth_user_id = auth.uid() and is_active;

  if tg_op = 'INSERT' then
    insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
    values (new.org_id, new.store_id, new.product_id, -new.qty, 'sale', v_actor);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
    values (old.org_id, old.store_id, old.product_id, old.qty, 'sale_remove', v_actor);
    return old;
  end if;
  return null;
end $$;

revoke execute on function public.stock_on_check_line() from public, anon, authenticated;

drop trigger if exists check_lines_stock_ins on public.check_lines;
create trigger check_lines_stock_ins
  after insert on public.check_lines
  for each row
  when (new.product_id is not null and new.qty <> 0)
  execute function public.stock_on_check_line();

drop trigger if exists check_lines_stock_del on public.check_lines;
create trigger check_lines_stock_del
  after delete on public.check_lines
  for each row
  when (old.product_id is not null and old.qty <> 0)
  execute function public.stock_on_check_line();

-- 3) checks void トリガ: open/closed→void 遷移時に product 明細を一括再クレジット
--    check_void は明細を保持し status のみ変更（現物確認済）＝DELETE トリガでは拾えないため専用経路。
--    WHEN の status 遷移ガード必須（checks_touch_updated_at が毎 UPDATE で走るため）。
create or replace function public.stock_on_check_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  select id into v_actor
    from public.users
   where auth_user_id = auth.uid() and is_active;

  insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
  select l.org_id, l.store_id, l.product_id, sum(l.qty), 'void_recredit', v_actor
    from public.check_lines l
   where l.check_id = new.id
     and l.product_id is not null
   group by l.org_id, l.store_id, l.product_id
  having sum(l.qty) <> 0;

  return new;
end $$;

revoke execute on function public.stock_on_check_void() from public, anon, authenticated;

drop trigger if exists checks_stock_void on public.checks;
create trigger checks_stock_void
  after update on public.checks
  for each row
  when (old.status <> 'void' and new.status = 'void')
  execute function public.stock_on_check_void();

commit;
