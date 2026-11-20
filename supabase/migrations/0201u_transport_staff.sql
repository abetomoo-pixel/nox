-- 0201u_transport_staff.sql（2026-11-20 起草・CC・相談役 ①＝起草と試走まで・適用しない）
-- 名前: 0201u 送りの記録（transport_issue_bulk）をシフトの許可があるスタッフにも自店だけ開く
-- 翻訳元: なし（NOX 独自・0157 の issue_bulk → 0177 の方式 4 つの上に、役の判定の 1 か所だけを足す）
-- 前提: 0201s の後（関数 455・表 122）。0201t（未適用）とは独立＝どちらが先でもよい（0201t の後なら事前確認の関数の数を 461 に読み替え）。
-- 変えるもの: transport_issue_bulk の役の判定に「staff ∧ 自店 ∧ auth_staff_can_shift()」を足すだけ。
--   金額（1 円以上）・店の送りの方式（none は拒否・不正値は拒否）・締め済み（paid）の期間・同じキャストの重複・冪等キー・監査（audit_log_write）は今のまま。
--   引数・返り・権限（anon と public は revoke・authenticated に grant）も今のまま（create or replace は権限を保つ・念のため同じ文で言い直す）。
-- 検証クエリ（貼った後）: docs/tmp/0201u_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
--   select prosrc from pg_proc where proname='transport_issue_bulk'; で「★0201u」の行があること。
begin;
set local lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.transport_issue_bulk(p_store_id uuid, p_items jsonb, p_idem_key uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_cast   record;
  v_mode   text;
  v_actor  uuid;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_item   jsonb;
  v_castid uuid;
  v_amount int;
  v_date   date;
  v_note   text;
  v_idem   uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_idem_key is null then raise exception 'bad idem'; end if;                                                                  -- ★3
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'bad items'; end if;   -- ★3
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id() and public.auth_staff_can_shift())) then   -- ★0201u（2026-11-20・相談役 ①）: シフトの許可（can_shift）があるスタッフも自店だけ記録できる（代行の退勤と同じ人）。許可の無いスタッフ・キャストは今までどおり拒否
    raise exception 'forbidden';
  end if;
  -- L3' 構造的排他: okuri_mode='actual' の店でのみ実費入力を受理（fail-closed＝flat/未設定/不正は拒否）
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）

  if (select count(*) <> count(distinct e->>'cast_id') from jsonb_array_elements(p_items) e) then raise exception 'duplicate cast'; end if;   -- 裁定304-1 同 cast 2 回以上＝全件失敗
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  for v_item in select * from jsonb_array_elements(p_items) loop                                                                    -- ★3 件ごと
    v_castid := (v_item->>'cast_id')::uuid;
    v_amount := (v_item->>'amount')::int;
    v_date   := (v_item->>'date')::date;
    v_note   := v_item->>'note';
    v_cast   := null;
    if v_amount is null or v_amount <= 0 then raise exception 'bad amount'; end if;
    if v_date is null then raise exception 'bad date'; end if;
    -- paid 期間ガード（凍結済み period に stranded 送りを作らない・incentive_publish 同型）
    if exists (select 1 from public.payroll_runs
               where store_id = p_store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
      raise exception 'paid period';
    end if;
    select id into v_cast from public.casts
      where id = v_castid and org_id = public.auth_org_id() and store_id = p_store_id;
    if v_cast.id is null then raise exception 'bad cast'; end if;
    v_idem := md5(p_idem_key::text || ':' || v_castid::text)::uuid;                                                              -- ★3 各件の idem（302-2）
    select id into v_id from public.transport where store_id = p_store_id and idem_key = v_idem;                                  -- ★3 同キー再送＝既存 id
    if v_id is null then
      insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
      values (v_store.org_id, p_store_id, v_castid, v_amount, v_date, nullif(trim(coalesce(v_note,'')), ''), v_actor, v_idem, v_mode)
      returning id into v_id;
      perform public.audit_log_write('transport_issue_bulk', 'transport:' || v_id::text,
        null, jsonb_build_object('cast_id', v_castid, 'amount', v_amount, 'biz_date', v_date, 'bulk_idem', p_idem_key, 'mode', v_mode), p_store_id);
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $function$;

revoke execute on function public.transport_issue_bulk(uuid, jsonb, uuid) from public, anon;
grant execute on function public.transport_issue_bulk(uuid, jsonb, uuid) to authenticated;

commit;
