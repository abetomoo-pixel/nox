-- 0249_notices_owner_scope（起票317・相談役 11/27 20:10 の ■4＝起草と試走まで・適用はしない・番号は仮）
--   翻訳元：本番の今の notices_select（0200）と、お知らせの編集・削除・出欠の設定・人ごとの状況の 4 本（0200／0201i が元）。作成は 0203 の notice_create_at／notice_create_targets_at が店を受ける＝変えない。
--   中身：2 店以上の会社のオーナーが、所属でない店のお知らせを読めない・直せない（起票317）を直す。ポリシーの店の条件と、4 本の役の柵を、標準の店の範囲（owner＝会社の全店・manager＝自店）にそろえる。
--     会社の照合（org_id = auth_org_id()）は前のまま＝ほかの会社は 0 行・forbidden。店長・スタッフ・キャストの見え方は変えない。
--     本人の確認・回答・既読（notice_ack・notice_rsvp・notice_mark_read）と宛先の判定（notice_audience_has）は変えない（オーナーは確認する側に入らないまま）。
--   表・列・grant は変えない。関数の数 526 → 526・表 133・ポリシー 152 → 152（drop して同じ名前で作り直す）。数は読んだ時の物＝当てる順で前に別の mig が入れば取り直す。
--   検証クエリ：0249_verify.sql（先頭は貼り先証明）。事前確認：0249_precheck.sql（返りが貼り先証明の 1 行だけなら当ててよい）。
begin;
set local lock_timeout = '10s';

-- ★0249（起票317・相談役 11/27 20:10 の ■4）: 読みのポリシー。変えるのは店の条件の 1 行だけ＝オーナーは会社の全店（前＝オーナーも所属の 1 店だけ）。宛先の式（CASE）は本番の今と同じ文。
drop policy notices_select on public.notices;
create policy notices_select on public.notices for select to authenticated using (
  org_id = public.auth_org_id()
  and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  and case public.auth_role()
        when 'owner' then true
        when 'manager' then audience <> 'owners'
        when 'staff' then (audience in ('all','cast','staff') or (audience = 'targets' and staff_ids is not null and public.auth_membership_id() = any(staff_ids)))
        when 'cast' then ((audience in ('all','cast') and (cast_ids is null or public.auth_cast_id() = any(cast_ids))) or (audience = 'targets' and cast_ids is not null and public.auth_cast_id() = any(cast_ids)))
        else false
      end
);

CREATE OR REPLACE FUNCTION public.notice_update(p_notice_id uuid, p_title text, p_body text, p_audience text, p_pinned boolean, p_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.notices; v_before jsonb; v_title text; v_body text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- ★0249（起票317・相談役 11/27 20:10 の ■4）: オーナーは会社の全店のお知らせを扱える（標準の店の範囲＝auth_role()='owner' or store_id = auth_store_id()）。前＝オーナーも所属の 1 店だけ。会社の照合は上の行（org_id <> auth_org_id() で forbidden）のまま・店長は自店だけのまま。
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 検証（create と同一）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if v_row.audience = 'targets' then   -- ★0200（裁定470）: 個別のお知らせは作成時点の宛先で固定＝区分には戻さない（cast_ids／staff_ids は触らない）
    if p_audience is distinct from 'targets' then raise exception 'bad audience'; end if;
  elsif p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  v_before := to_jsonb(v_row);
  update public.notices
     set title = v_title, body = v_body, audience = p_audience, pinned = p_pinned, until = p_until
   where id = p_notice_id;
  perform public.audit_log_write('notice_update', 'notices:' || p_notice_id::text, v_before,
    (select to_jsonb(n) from public.notices n where n.id = p_notice_id), v_row.store_id);
end $function$;
revoke execute on function public.notice_update(uuid, text, text, text, boolean, date) from public, anon;
grant execute on function public.notice_update(uuid, text, text, text, boolean, date) to authenticated;

CREATE OR REPLACE FUNCTION public.notice_delete(p_notice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.notices; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- ★0249（起票317・相談役 11/27 20:10 の ■4）: オーナーは会社の全店のお知らせを扱える（標準の店の範囲＝auth_role()='owner' or store_id = auth_store_id()）。前＝オーナーも所属の 1 店だけ。会社の照合は上の行（org_id <> auth_org_id() で forbidden）のまま・店長は自店だけのまま。
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  v_before := to_jsonb(v_row);
  delete from public.notices where id = p_notice_id;
  perform public.audit_log_write('notice_delete', 'notices:' || p_notice_id::text, v_before, null, v_row.store_id);
end $function$;
revoke execute on function public.notice_delete(uuid) from public, anon;
grant execute on function public.notice_delete(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.notice_set_rsvp(p_notice_id uuid, p_on boolean, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_place text DEFAULT NULL::text, p_due timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.notices; v_place text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;   -- 存在オラクル封じ
  -- ★0249（起票317・相談役 11/27 20:10 の ■4）: オーナーは会社の全店のお知らせを扱える（標準の店の範囲＝auth_role()='owner' or store_id = auth_store_id()）。前＝オーナーも所属の 1 店だけ。会社の照合は上の行（org_id <> auth_org_id() で forbidden）のまま・店長は自店だけのまま。
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;   -- notice_update と同じ
  if p_on is null then raise exception 'bad rsvp'; end if;   -- 原則7: boolean は UI から明示値
  if p_on then
    if v_row.audience = 'owners' then raise exception 'bad audience'; end if;
    if p_at is null then raise exception 'bad rsvp_at'; end if;
    if p_due is not null and p_due > p_at then raise exception 'bad rsvp_due'; end if;
    v_place := nullif(trim(coalesce(p_place, '')), '');
    if v_place is not null and char_length(v_place) > 120 then raise exception 'bad rsvp_place'; end if;
  else
    -- OFF は回答 0 件のときだけ（参加／不参加を押した人がいれば消さない）
    if exists (select 1 from public.notice_responses r where r.notice_id = p_notice_id and r.rsvp is not null) then raise exception 'rsvp answered'; end if;
    v_place := null;
  end if;
  update public.notices
     set rsvp = p_on,
         rsvp_at = case when p_on then p_at end,
         rsvp_place = v_place,
         rsvp_due = case when p_on then p_due end
   where id = p_notice_id;
  perform public.audit_log_write('notice_set_rsvp', 'notices:' || p_notice_id::text,
    jsonb_build_object('rsvp', v_row.rsvp, 'rsvp_at', v_row.rsvp_at, 'rsvp_place', v_row.rsvp_place, 'rsvp_due', v_row.rsvp_due),
    jsonb_build_object('rsvp', p_on, 'rsvp_at', case when p_on then p_at end, 'rsvp_place', v_place, 'rsvp_due', case when p_on then p_due end),
    v_row.store_id);
end $function$;
revoke execute on function public.notice_set_rsvp(uuid, boolean, timestamp with time zone, text, timestamp with time zone) from public, anon;
grant execute on function public.notice_set_rsvp(uuid, boolean, timestamp with time zone, text, timestamp with time zone) to authenticated;

CREATE OR REPLACE FUNCTION public.notice_response_status(p_notice_id uuid)
 RETURNS TABLE(subject_kind text, subject_id uuid, name text, is_active boolean, acked_at timestamp with time zone, rsvp text, rsvp_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_row public.notices;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- ★0249（起票317・相談役 11/27 20:10 の ■4）: オーナーは会社の全店のお知らせを扱える（標準の店の範囲＝auth_role()='owner' or store_id = auth_store_id()）。前＝オーナーも所属の 1 店だけ。会社の照合は上の行（org_id <> auth_org_id() で forbidden）のまま・店長は自店だけのまま。
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  -- ★0201i（裁定486）: 母集合＝notice_audience_has が真の人（区分＝いま在籍の人・targets＝作成時の人＝退店済みも is_active=false で出す）× 回答（無ければ未確認・未回答）
  return query
  select p.k, p.id, p.nm, p.act, r.acked_at, r.rsvp, r.rsvp_updated_at
    from (select 'cast'::text k, c.id, c.name::text nm, c.is_active act
            from public.casts c
           where c.org_id = v_row.org_id and c.store_id = v_row.store_id
          union all
          select 'membership'::text, m.id, coalesce(u.name, '（名前なし）')::text, m.is_active
            from public.memberships m join public.users u on u.id = m.user_id
           where m.store_id = v_row.store_id) p
    left join public.notice_responses r
      on r.notice_id = p_notice_id and r.subject_kind = p.k and r.subject_id = p.id
   where public.notice_audience_has(p_notice_id, p.k, p.id)
   order by p.k, p.nm, p.id;
end $function$;
revoke execute on function public.notice_response_status(uuid) from public, anon;
grant execute on function public.notice_response_status(uuid) to authenticated;

commit;
