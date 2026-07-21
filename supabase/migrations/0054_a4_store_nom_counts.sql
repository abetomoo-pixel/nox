-- 0054_a4_store_nom_counts.sql
-- A4 月報（裁定8 N1-b・設計承認 2026-07-21・裁定6点確定）：月報の指名(本) を半期split で出すための
--   唯一の DB オブジェクト＝get_store_nom_counts。store 合計の hon/jonai/dohan 件数を date 範囲で返す
--   読み取り専用 RPC（cast 名・cast 個別は返さない＝ranking より安全な集計）。
-- 翻訳元＝get_cast_ranking（mig0011 系）の nom_counts CTE の逐語縮退（2026-07-21 fresh dump 起点・記憶再構成なし）。
--   縮退の中身＝(a) group by n.cast_id を外し店合計の単一行へ (b) period 引数を p_from/p_to date 範囲へ
--   （半期split 用＝前期1-15 / 後期16-末 / 通期 をクライアントが範囲指定して3回呼ぶ）。
--   件数の基準は get_cast_ranking と同一＝check_nominations 行を checks.nom_type で filter（相席の複数指名は
--   指名行数でカウント＝ranking と1件も違わない）。closed 伝票のみ・biz_date は cutoff 調整済（逐語）。
-- 認可・cutoff・window の作りは get_cast_ranking 逐語：
--   ・auth_org_id() null guard 冒頭（NULL 素通り防止）
--   ・store の org 照合（越境遮断）
--   ・role gate＝owner は org 全店・他ロール（manager/staff/cast）は自店のみ（get_cast_ranking と同一 gate）。
--     件数のみの安全集計ゆえ cast も自店可（ranking と同流儀）。月報 UI は cast にタブを出さない別ゲートで絞る。
--   ・cutoff＝settings_json.biz_cutoff_hm（既定 06:00）で biz_date 窓を timestamptz へ。
-- 会計非改修：checks / check_nominations の SELECT のみ。INSERT/UPDATE/DELETE なし。money 計算に触れない。
--   daily_report_aggregate は改修しない（裁定③）。3ゲート（pay83/receipt52/payroll112）不変。
-- 範囲上限＝92日（cast_sales_aggregate と同値の入力ガード）。
-- 二重防御＝revoke execute from public,anon → grant to authenticated。
-- SECURITY DEFINER・set search_path=public・STABLE。単一トランザクション・再適用可（create or replace）・backfill 無し。
-- 検証クエリ＝verify_0054.sql（Downloads 残置・repo 収載禁止・手貼り指示時に提示）。
begin;

create or replace function public.get_store_nom_counts(p_store_id uuid, p_from date, p_to date)
 returns table(hon_count integer, jonai_count integer, dohan_count integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力（範囲）検証：cast_sales_aggregate と同流儀（p_from<=p_to・上限92日）
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad range'; end if;
  if p_to - p_from > 92 then raise exception 'bad range'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- get_cast_ranking 逐語: owner は org 全店・他ロール（manager/staff/cast）は自店のみ
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  -- window: biz_date [p_from, p_to] を cutoff 調整済 timestamptz 窓へ
  --   （get_cast_ranking の period→month 窓を p_from/p_to 範囲へ差し替え。started_at は左閉右開）
  v_start := ((p_from::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((p_to + interval '1 day')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';

  return query
  -- get_cast_ranking の nom_counts CTE を店集計へ縮退（group by cast_id を外す・値の基準は逐語）
  select
    count(*) filter (where c.nom_type = 'hon')::int,
    count(*) filter (where c.nom_type = 'jonai')::int,
    count(*) filter (where c.nom_type = 'dohan')::int
  from public.check_nominations n
  join public.checks c on c.id = n.check_id
  where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
    and c.started_at >= v_start and c.started_at < v_end
    and n.org_id = v_org;
end $function$;

-- 二重防御（public だけでは無効・anon にも直 grant されるため必ず両方 revoke）
revoke execute on function public.get_store_nom_counts(uuid,date,date) from public, anon;
grant  execute on function public.get_store_nom_counts(uuid,date,date) to authenticated;

commit;
