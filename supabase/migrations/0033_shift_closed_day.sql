-- 0033_shift_closed_day: B-5 スライスB — シフトの定休日バリデーション（②シフト連携・DB層）
-- 裁定B-1（スライスA裁定1踏襲）: 定休日シフト=RPC ハード拒否 'closed day' ／ 営業時間外シフト=拒否しない
--   （早入り・準備・残業は夜職の日常＝時間外拒否は予約以上に不適。警告は経営側 UI の責務。
--    cast は store_business_hours 0行=裁定3 のため cast セルフ UI に警告は構造的に不可＝
--    定休日のサーバ拒否だけが cast に効く層、の点でも裁定1の非対称と整合）。未設定 dow は通す（後方互換）。
-- 裁定B-2: シフトの営業日 dow = date そのものの extract(dow)（cutoff 変換なし）。
--   shifts/shift_wishes の date は mig0008 決定3 で既に「営業日 D」を宣言済み（深夜は 24h超 end_hm で表現）＝
--   実時刻 timestamptz から営業日を解決する予約（reservation_is_closed_day・cutoff 変換）とは別ヘルパー。
-- 裁定B-3（挿入点3本）: shift_wish_submit（cast の誤提出を即拒否）／shift_set（create/update 共通）／
--   shift_wish_decide（★accept 時のみ＝提出後に定休日設定された競合の防波堤。reject は定休日でも可）。
--   shift_set の営業時間参照はロール照合の**後**（他店曜日の probing 防止＝mig0007 の照合順の流儀）。
-- ヘルパー shift_is_closed_day は grant authenticated（reservation_is_closed_day と同格・boolean のみで
--   時間帯は漏れない＝cast UI の事前判定の専用経路にも使える・裁定3「将来 cast 表示が要れば専用経路」の最小形）。
-- 3 RPC の書き直しは live（=mig0009 全文・prosrc 一致を事前機械確認済み）＋挿入1ブロックのみ。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) ヘルパーの定義＋ACL を1結果セットで:
--      select
--        (select pg_get_functiondef('shift_is_closed_day(uuid, date)'::regprocedure)) as helper_def,
--        (select string_agg(p.proname||'='||coalesce(array_to_string(p.proacl,','),'default'), ' || ')
--           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--           where n.nspname='public'
--             and p.proname in ('shift_is_closed_day','shift_wish_submit','shift_set','shift_wish_decide')) as fn_acls;
--   2) 3 RPC に 'closed day' が入ったか（各1回=submit/set は無条件・decide は p_accept and）:
--      select proname, (length(prosrc) - length(replace(prosrc, 'closed day', ''))) / length('closed day') as hits
--      from pg_proc where pronamespace='public'::regnamespace
--        and proname in ('shift_wish_submit','shift_set','shift_wish_decide') order by proname;
--   3) notify pgrst, 'reload schema';
--   4) 動作アンカー（定休日拒否・時間外通過・未設定通過・decide 競合・reject 可）は verify 段26 で実測。

begin;

-- ── ヘルパー: シフトの定休日判定（date=営業日そのもの・cutoff 変換なし） ──
-- 戻り: true=定休日（拒否対象）／false=営業日または未設定（通す）。時間外は判定しない（UI 警告の責務）。
create or replace function public.shift_is_closed_day(
  p_store_id uuid,
  p_date date
)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_closed boolean;
begin
  select bh.is_closed into v_closed
  from public.store_business_hours bh
  where bh.store_id = p_store_id and bh.dow = extract(dow from p_date)::int;
  return coalesce(v_closed, false);
end $function$;

revoke all on function public.shift_is_closed_day(uuid, date) from public, anon;
grant execute on function public.shift_is_closed_day(uuid, date) to authenticated;

-- ── shift_wish_submit 書き直し（casts 解決直後に closed day チェック1ブロック挿入・他は mig0009 全文一致）──
create or replace function public.shift_wish_submit(
  p_date     date,
  p_start_hm text,
  p_end_hm   text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast uuid; v_row record; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if; -- cast セルフ専用
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  select org_id, store_id into v_row from public.casts where id = v_cast;
  -- ★B-5②: 定休日ハード拒否（date=営業日そのもの・時間外は拒否しない=経営側 UI 警告・未設定は通す）
  if public.shift_is_closed_day(v_row.store_id, p_date) then
    raise exception 'closed day';
  end if;
  insert into public.shift_wishes (org_id, store_id, cast_id, date, start_hm, end_hm)
  values (v_row.org_id, v_row.store_id, v_cast, p_date, p_start_hm, p_end_hm)
  returning id into v_id;
  perform public.audit_log_write('shift_wish_submit', 'shift_wishes:' || v_id::text, null,
    (select to_jsonb(w) from public.shift_wishes w where w.id = v_id), v_row.store_id);
  return v_id;
end $$;

-- ── shift_set 書き直し（ロール照合直後に closed day チェック1ブロック挿入・create/update 共通・他は mig0009 全文一致）──
create or replace function public.shift_set(
  p_id       uuid,
  p_cast_id  uuid,
  p_date     date,
  p_start_hm text,
  p_end_hm   text,
  p_status   text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','confirmed') then raise exception 'bad status'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否（create/update 共通・ロール照合の後=他店曜日の probing 防止）
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end $$;

-- ── shift_wish_decide 書き直し（pending 判定直後・accept のみ closed day チェック1ブロック挿入・他は mig0009 全文一致）──
create or replace function public.shift_wish_decide(
  p_wish_id uuid,
  p_accept  boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  -- ★B-5②: accept のみ定休日ハード拒否（提出後に定休日設定された競合の防波堤・reject は定休日でも可・wish は pending のまま）
  if p_accept and public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
    raise exception 'closed day';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.shift_wishes
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = p_wish_id;
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
  perform public.audit_log_write('shift_wish_decide', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish),
    jsonb_build_object(
      'wish', (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id),
      'generated_shift_id', v_shift),
    v_wish.store_id);
  return v_shift; -- reject 時は null
end $$;

commit;
