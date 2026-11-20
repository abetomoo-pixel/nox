-- 0201v_okuri_summary_staff.sql（2026-11-20 起草・CC・相談役 ①＝起草と試走まで・適用しない）
-- 名前: 0201v 今日の送りの一覧（okuri_today_summary）を、自店のスタッフで締めの許可かシフトの許可がある人にも開く
-- 翻訳元: なし（NOX 独自・0156 の okuri_today_summary → 0180 ★3 の上に、役の判定の 1 か所だけを足す）
-- 前提: 0201u の後（関数 455・表 122）。0201t（未適用）とは独立＝どちらが先でもよい（0201t の後なら事前確認の関数の数を 461 に読み替え）。
-- 変えるもの: okuri_today_summary の役の判定に「staff ∧ 自店 ∧ (auth_staff_can_close() ∨ auth_staff_can_shift())」を足すだけ。
--   返す列（punch_id・cast_id・cast_name・punched_at・idem_key・base_amount）・行（その営業日の送りつき退勤で未記録のもの）・日付の検査・会社の検査は今のまま。
--   読取だけの関数（stable）＝書込も監査も無い（今のまま）。引数・返り・権限（anon と public は revoke・authenticated に grant）も今のまま（create or replace は権限を保つ・念のため同じ文で言い直す）。
--   記録（transport_issue_bulk）は変えない＝0201u のまま（シフトの許可がある自店のスタッフだけ）。締めの許可だけのスタッフは「一覧は見えるが記録はできない」＝画面の案で扱う（push しない）。
-- 検証クエリ（貼った後）: docs/tmp/0201v_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
--   select prosrc from pg_proc where proname='okuri_today_summary'; で「★0201v」の行があること。
begin;
set local lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.okuri_today_summary(p_store_id uuid, p_biz_date date)
 RETURNS TABLE(punch_id uuid, cast_id uuid, cast_name text, punched_at timestamp with time zone, idem_key uuid, base_amount integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id()
              and (public.auth_staff_can_close() or public.auth_staff_can_shift()))) then   -- ★0201v（2026-11-20・相談役 ①）: 自店のスタッフで、締めの許可（can_close）か シフトの許可（can_shift）がある人も一覧を読める（締めの前の「今日の送り」の窓）。記録（transport_issue_bulk）は 0201u のまま＝シフトの許可がある人だけ。許可の無いスタッフ・キャストは今までどおり拒否
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.cast_id, c.name, p.punched_at,
           md5(p.id::text || ':' || p.cast_id::text)::uuid,
           coalesce((select nullif(trim(e->>'amount'), '')::int                                           -- ★3 0180（裁定414 追補）: 区分の額を既定に（当日の金額は発行時に変更可）
                       from jsonb_array_elements(coalesce(v_store.settings_json->'okuri_flat_tiers', '[]'::jsonb)) e
                      where c.okuri_tier is not null and e->>'code' = c.okuri_tier limit 1),
                    nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::int)
      from public.punches p
      join public.casts c on c.id = p.cast_id
     where p.store_id = p_store_id and p.type = 'out' and p.okuri = true
       and public.biz_date_of(p_store_id, p.punched_at) = p_biz_date
       and not exists (select 1 from public.transport t
                        where t.store_id = p_store_id and t.idem_key = md5(p.id::text || ':' || p.cast_id::text)::uuid)
     order by p.punched_at;
end $function$;

revoke execute on function public.okuri_today_summary(uuid, date) from public, anon;
grant execute on function public.okuri_today_summary(uuid, date) to authenticated;

commit;
