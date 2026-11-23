-- 0206 本体（単一トランザクション）
-- 0206_cast_employment（起票146 の案・相談役 11/23 23:10 の ■2・2026-11-24 起草・**案まで＝main に入れない・未適用**）
-- 翻訳元: cast_plan（表の形・RLS・部分 unique）と、本番の set_cast_employment（2026-11-24 読取＝docs/tmp/fn_set_cast_employment_1124.sql）
-- 何を: 契約区分の履歴の表 cast_employment を作り、set_cast_employment が行を書く（前の行を閉じて新しい行を足す）。
--   給与の計算（collect）は、期首に有効な行を読む（無ければ期の中で最も早い行・履歴が無い人は casts.employment＝今と同じ）＝旗 MIG_0206_APPLIED。
--   casts.employment／employment_valid_from は今までどおり「最後に決めた値」を持つ（画面の表示と、ほかの読み手はそのまま＝起票146 の一覧）。
-- 貼る前: 0206_precheck.sql（読むだけ）・貼った後: 0206_verify.sql（先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）

begin;
set local lock_timeout = '5s';

-- ── 1. 表（cast_plan と同じ形）
create table public.cast_employment (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  cast_id     uuid not null references public.casts(id) on delete cascade,   -- 人を消したら履歴も消える（verify の掃除が casts を消すため・cast_plan は掃除が先に消している）
  employment  text not null check (employment in ('委託','雇用')),
  valid_from  date not null,
  valid_to    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index cast_employment_cast_from_uidx on public.cast_employment (cast_id, valid_from);
create unique index cast_employment_current_uidx on public.cast_employment (cast_id) where valid_to is null;
create index cast_employment_store_idx on public.cast_employment (store_id);
create index cast_employment_org_idx on public.cast_employment (org_id);

-- ── 2. RLS（読むだけ・cast_plan と同じ＝店のスコープ＋キャストは本人の行だけ）
alter table public.cast_employment enable row level security;
create policy cast_employment_select on public.cast_employment for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
         and (public.auth_role() in ('owner','manager') or cast_id = public.auth_cast_id()));

-- ── 3. grant（SELECT だけ・TRUNCATE の穴を塞ぐ）
revoke all on table public.cast_employment from public, anon, authenticated;
grant select on table public.cast_employment to authenticated;

-- ── 4. 今の値から 1 行ずつ（契約区分がある人だけ・開始は入店日と作った日の早い方＝JST）
--   2026-11-24 の本番は employment_valid_from が全員 null・set_cast_employment の監査の記録も 0 件＝前の値がある人はいない（事前確認が確かめる）。
insert into public.cast_employment (org_id, store_id, cast_id, employment, valid_from)
select c.org_id, c.store_id, c.id, c.employment,
       least(coalesce(c.joined_on, (c.created_at at time zone 'Asia/Tokyo')::date), (c.created_at at time zone 'Asia/Tokyo')::date)
  from public.casts c
 where c.employment is not null;

-- ── 5. set_cast_employment：前の行を閉じて新しい行を足す（決まりは今と同じ＝月の 1 日だけ・最後に確定した期の翌日以降・owner だけ）
CREATE OR REPLACE FUNCTION public.set_cast_employment(p_cast_id uuid, p_employment text, p_valid_from date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_before      jsonb;
  v_after       jsonb;
  v_last_end    date;   -- ★9: 自店で最後に確定した期の末日
  v_cur         text;   -- ★0206: 履歴が無い人の今の値
  v_since       date;   -- ★0206: その始まり（入店日と作った日の早い方）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_employment is null or p_employment not in ('委託','雇用') then raise exception 'bad employment'; end if;   -- ★9（casts_employment_check と同じ 2 値）
  if p_valid_from is null or p_valid_from <> date_trunc('month', p_valid_from)::date then raise exception 'bad valid_from'; end if;   -- ★9: 給与期の初日のみ（要裁定(8)）
  -- cast の org 照合＋ロール判定（owner のみ＝294-9）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select max(coalesce(r.period_end, pb.period_end)) into v_last_end
    from public.payroll_runs r, lateral public.period_bounds(r.period) pb
   where r.store_id = v_cast_store and r.status in ('finalized','paid');
  if v_last_end is not null and p_valid_from <= v_last_end then raise exception 'period finalized'; end if;   -- ★9: 最後に確定した期の翌日以降・過去分は付け替えない

  select to_jsonb(c) into v_before from public.casts c where c.id = p_cast_id;
  -- ★0206: 履歴の行。最初の変更なら、今の値の行を先に作る（今の値がある人だけ・始まりは入店日と作った日の早い方・新しい行の前日まで）
  if not exists (select 1 from public.cast_employment where cast_id = p_cast_id) then
    select employment, least(coalesce(joined_on, (created_at at time zone 'Asia/Tokyo')::date), (created_at at time zone 'Asia/Tokyo')::date)
      into v_cur, v_since from public.casts where id = p_cast_id;
    if v_cur is not null and v_since < p_valid_from then
      insert into public.cast_employment (org_id, store_id, cast_id, employment, valid_from) values (v_cast_org, v_cast_store, p_cast_id, v_cur, v_since);
    end if;
  end if;
  -- ★0206: 新しい開始日以降に始まる行（まだ効いていない先の変更）は、この変更で置き換える＝確定した期より後だけ（上で確かめた）
  delete from public.cast_employment where cast_id = p_cast_id and valid_from >= p_valid_from;
  -- ★0206: 新しい開始日をまたぐ行を前日で閉じる
  update public.cast_employment set valid_to = p_valid_from - 1, updated_at = now()
   where cast_id = p_cast_id and valid_from < p_valid_from and (valid_to is null or valid_to >= p_valid_from);
  insert into public.cast_employment (org_id, store_id, cast_id, employment, valid_from) values (v_cast_org, v_cast_store, p_cast_id, p_employment, p_valid_from);

  update public.casts
     set employment = p_employment, employment_valid_from = p_valid_from, updated_at = now()
   where id = p_cast_id;
  select to_jsonb(c) || jsonb_build_object('cast_employment', (select jsonb_agg(jsonb_build_object('employment', e.employment, 'valid_from', e.valid_from, 'valid_to', e.valid_to) order by e.valid_from) from public.cast_employment e where e.cast_id = p_cast_id))
    into v_after from public.casts c where c.id = p_cast_id;
  perform public.audit_log_write('set_cast_employment', 'casts:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

commit;
