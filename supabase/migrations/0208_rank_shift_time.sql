-- 0208_rank_shift_time（時間別の時給 B＝出勤の時刻の段・相談役 11/24 夜 N6・起草と試走まで・適用はしない）
--   決め（相談役 11/24 夜）：段はランク（店が付ける）。シフトを作るときの初期値の順は「希望 → 人の基本の働き方 → ランクの時刻 → 営業時間 → 既定」（画面の側・判定の式には触れない）。
--     作成済みのシフトは書き換えない・一括で直す道は付けない・遅刻の猶予は店に 1 つのまま・24 時以降に始まる段は許さない。
--   中身：cast_ranks に既定の出勤の時刻（開始・終了＝営業日の分）2 列（null＝ランクの時刻なし＝今と同じ）と、書く関数 1 本（set_cast_rank と同じ柵＝owner／自店の manager・課金ゲート・audit）。
--   翻訳元：0088 の set_cast_rank（同じ柵と監査の形）。表は増えない・関数 +1。0204・0207 とは独立（数は差で見る）。
--   前提：関数 483・表 127（今の本番）。0207 の後なら 486・128。
--   検証クエリ：docs/tmp/0208/0208_verify.sql（先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs）。
begin;
set local lock_timeout = '10s';

alter table public.cast_ranks add column shift_start_min integer null;
alter table public.cast_ranks add column shift_end_min integer null;
alter table public.cast_ranks add constraint cast_ranks_shift_time_check check (
  (shift_start_min is null and shift_end_min is null)
  or (shift_start_min between 0 and 1439 and shift_end_min between 1 and 2879 and shift_end_min > shift_start_min)   -- 開始は 24 時より前（24 時以降に始まる段は許さない）・終了は 47:59 まで
);
comment on column public.cast_ranks.shift_start_min is '★0208: このランクの既定の出勤の開始（営業日の分・0〜1439）。null＝ランクの時刻なし（シフトの初期値は今と同じ）';
comment on column public.cast_ranks.shift_end_min is '★0208: このランクの既定の出勤の終了（営業日の分・開始より後・2879 まで＝翌 23:59）';

CREATE OR REPLACE FUNCTION public.set_cast_rank_shift_time(p_id uuid, p_start_min integer, p_end_min integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_st     uuid := public.auth_store_id();
  v_rank   public.cast_ranks;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_rank from public.cast_ranks where id = p_id and org_id = v_org;
  if v_rank.id is null then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_rank.store_id is distinct from v_st then raise exception 'forbidden'; end if;
  else
    raise exception 'forbidden';
  end if;
  if (p_start_min is null) <> (p_end_min is null) then raise exception 'bad time'; end if;   -- 両方入れるか両方空（空＝ランクの時刻なし）
  if p_start_min is not null and (p_start_min < 0 or p_start_min > 1439 or p_end_min <= p_start_min or p_end_min > 2879) then raise exception 'bad time'; end if;
  v_before := to_jsonb(v_rank);
  update public.cast_ranks set shift_start_min = p_start_min, shift_end_min = p_end_min, updated_at = now() where id = p_id;
  select to_jsonb(cr) into v_after from public.cast_ranks cr where cr.id = p_id;
  perform public.audit_log_write(p_action => 'set_cast_rank_shift_time', p_target => 'cast_ranks:' || p_id::text, p_before => v_before, p_after => v_after, p_store_id => v_rank.store_id);
  return p_id;
end $function$;
revoke execute on function public.set_cast_rank_shift_time(uuid, integer, integer) from public, anon;
grant execute on function public.set_cast_rank_shift_time(uuid, integer, integer) to authenticated;

commit;
