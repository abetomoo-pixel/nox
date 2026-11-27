-- 0230_retention_candidates（相談役 11/26 22:10・段イ・#206・根 R31「お客様の匿名化と保持期限」の後半・起草と試走まで・適用はしない）
--   当たり（手元の BEGIN … ROLLBACK で再現）：customers.retention_until に値を入れるのは check_close だけ（会計した伝票のお客様）。
--     customer_register・reservation_to_check（予約からの新規）は入れない。0153 で列を足したときの埋め直しも無い。
--     customer_anonymize_candidates は retention_until が null の人を拾わない＝一度も会計していないお客様は、登録から何年たっても匿名化の候補に出ない。
--     本番の今（2026-11-26 22 時台・匿名化していない人）：デモでも検証でもない会社 2 人のうち 1 人・デモ 57 人の 57 人・検証 6 人の 5 人が null（全員 last_visit_at も null）。
--   中身（作り直し 1 本・同じ署名・同じ戻りの列・CREATE OR REPLACE・ACL は今と同じ文で言い直す）：
--     ★1 customer_anonymize_candidates：retention_until が null の人は「最終来店（無ければ登録）＋ 店の保持年数（customer_retention_years・既定 5）」を期限として数える（JST の日付）。
--         戻りの retention_until 列にその期限を返す（画面の「保持期限」がそのまま出る）。retention_until に値のある人（会計した人）は今と同じ。
--   行は書かない（埋め戻しをしない訳）：埋めると「保持年数を変えたときに引き直さない」（#313）が会計していない人にも広がる。
--     関数で数えれば、会計していない人は今の年数で数え直される。会計した人の引き直し（#313）はこの mig に入れていない（READY.md の「重なり」）。
--   画面の文（この mig とは別・patch のファイルだけ）：customers-board.tsx の「最終来店から…」を「最終来店（来店が無ければ登録）から…」に。docs/tmp/retention_1126/patches/。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。check_close・customer_register・reservation_to_check は変えない（0229 とは関数が重ならない＝どちらを先に当ててもよい）。
--   翻訳元：本番の customer_anonymize_candidates（md5(prosrc) 0ee1796d529c1734149fcf66ab5c1d50・docs/tmp/retention_1126/live/）。
--   本番の今の定義との差分：docs/tmp/retention_1126/diff_live.md。
--   事前確認：docs/tmp/retention_1126/0230_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/retention_1126/0230_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 customer_anonymize_candidates（作り直し） ═══
CREATE OR REPLACE FUNCTION public.customer_anonymize_candidates(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_id uuid, store_id uuid, name text, last_visit_at timestamp with time zone, retention_until date, is_active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  -- ★0230（#206）: retention_until が null（会計していない人）は「最終来店（無ければ登録）＋ 店の保持年数（既定 5）」を期限として数える＝check_close と同じ年数の読み方
  return query
    select x.id, x.store_id, x.name, x.last_visit_at, x.ru, x.is_active
      from (
        select cu.id, cu.store_id, cu.name, cu.last_visit_at, cu.is_active,
               coalesce(cu.retention_until,
                        ((coalesce(cu.last_visit_at, cu.created_at) at time zone 'Asia/Tokyo')
                          + make_interval(years => coalesce(nullif(s.settings_json->>'customer_retention_years', '')::int, 5)))::date) ru
          from public.customers cu
          join public.stores s on s.id = cu.store_id
         where cu.org_id = public.auth_org_id()
           and (p_store_id is null or cu.store_id = p_store_id)
           and cu.anonymized_at is null
      ) x
     where x.ru <= (now() at time zone 'Asia/Tokyo')::date
     order by x.ru, x.name;
end $function$;

-- ═══ ACL（今と同じ・言い直し） ═══
revoke execute on function public.customer_anonymize_candidates(uuid) from public, anon;
grant execute on function public.customer_anonymize_candidates(uuid) to authenticated;

commit;
