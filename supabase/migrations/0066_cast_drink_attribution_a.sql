-- mig0066: キャストドリンク注文時帰属 (a) スキーマ拡張
-- 前提: mig0065 まで適用済み / 冪等（再適用可）

begin;

-- 1) products: 按分除外フラグ
alter table public.products
  add column if not exists back_exempt_from_split boolean not null default false;

comment on column public.products.back_exempt_from_split is
  'true=check_close の指名按分から除外し、バックは drink_claims 経路のみで帰属させる（キャストドリンク）。既定 false=現行の按分経路。経路は商品単位で排他＝二重計上が構造的に不可能。';

-- 2) 除外商品は hon_pt を持てない
--    按分ループを通らない＝hon_pt の分配経路も同時に失われるため、
--    値を持ったまま除外指定できると本指名ポイントが黙って消える。
alter table public.products drop constraint if exists products_exempt_hon_pt_chk;
alter table public.products add constraint products_exempt_hon_pt_chk
  check (back_exempt_from_split = false or hon_pt = 0);

-- 3) drink_claims.status に 'void' を追加（rejected=却下 と区別）
alter table public.drink_claims drop constraint if exists drink_claims_status_check;
alter table public.drink_claims add constraint drink_claims_status_check
  check (status = any (array['pending'::text,'approved'::text,'rejected'::text,'void'::text]));

-- 4) 明細行への参照 ＋ 取消の記録列（decided_* は承認時刻として保持）
alter table public.drink_claims
  add column if not exists check_line_id uuid,
  add column if not exists voided_by uuid,
  add column if not exists voided_at timestamptz;

alter table public.drink_claims drop constraint if exists drink_claims_check_line_id_fkey;
alter table public.drink_claims add constraint drink_claims_check_line_id_fkey
  foreign key (check_line_id) references public.check_lines(id) on delete set null;

alter table public.drink_claims drop constraint if exists drink_claims_voided_by_fkey;
alter table public.drink_claims add constraint drink_claims_voided_by_fkey
  foreign key (voided_by) references public.users(id);

comment on column public.drink_claims.check_line_id is
  '代理起票(drink_claim_submit_proxy)で焼付け元にした check_lines.id。行削除時は set null＋トリガで status=void。cast セルフ申告(drink_claim_submit)は null。';

-- 5) 同一明細行に生きた claim は最大1件（誤タップ二重起票の構造的防止）
create unique index if not exists drink_claims_line_live_uidx
  on public.drink_claims (check_line_id)
  where status = 'approved' and check_line_id is not null;

-- 6) 明細行の削除に claim を追随（check_remove_line だけでなく直 DELETE も捕捉）
create or replace function public.drink_claims_on_line_delete()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_actor uuid; v_before jsonb; r record;
begin
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  for r in select * from public.drink_claims
            where check_line_id = old.id and status = 'approved'
  loop
    v_before := to_jsonb(r);
    update public.drink_claims
       set status = 'void', voided_by = v_actor, voided_at = now()
     where id = r.id;
    -- service-role の fixture 掃除では auth 文脈が無い＝audit は文脈がある時のみ
    if coalesce(public.auth_org_id(), public.auth_kiosk_org_id()) is not null then
      perform public.audit_log_write('drink_claim_void_by_line_delete',
        'drink_claims:' || r.id::text, v_before,
        (select to_jsonb(d) from public.drink_claims d where d.id = r.id), r.store_id);
    end if;
  end loop;
  return old;
end $function$;

drop trigger if exists check_lines_drink_claim_del on public.check_lines;
create trigger check_lines_drink_claim_del
  before delete on public.check_lines
  for each row execute function public.drink_claims_on_line_delete();

-- 7) 焼付け済み claim がある行の金額要素の変更を禁止（防御深度）
create or replace function public.drink_claims_guard_line_update()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.qty is distinct from old.qty
     or new.unit_price_snapshot is distinct from old.unit_price_snapshot
     or new.back_snapshot is distinct from old.back_snapshot then
    if exists (select 1 from public.drink_claims d
                where d.check_line_id = old.id and d.status = 'approved') then
      raise exception 'line has live drink claim';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists check_lines_drink_claim_upd on public.check_lines;
create trigger check_lines_drink_claim_upd
  before update on public.check_lines
  for each row execute function public.drink_claims_guard_line_update();

revoke all on function public.drink_claims_on_line_delete() from public, anon;
revoke all on function public.drink_claims_guard_line_update() from public, anon;

commit;
