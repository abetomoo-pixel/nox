-- 0201l_trial_ends.sql（2026-11-13 夜・CC 起草・貼らない＝合図は相談役・お金の式の便の DB 側）体入の条件が終わる日をキャストに持たせる（裁定490-7・Agoora 確定）
-- 翻訳元: cast_trial_decide＝supabase/migrations/0201c_trial_product.sql:52-92（本番適用済みの版）＋列 1 本
-- 検証クエリ: docs/tmp/0201l_verify.sql（1 回の SELECT で全行・先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
-- 事前確認: docs/tmp/0201l_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）・手順書 docs/tmp/handpaste_0201l.md
-- 前提＝0201d の後（関数 449・表 122）。0201d・0201i・0201j・0201m とは関数が重ならない（cast_trial_decide と casts の列に触るのはこれだけ＝読取で確かめた）。
-- ★1 casts.trial_ends_on date（null 可・既定なし＝今の行は null のまま＝控え不要）
-- ★2 cast_trial_decide＝本採用は「新しいプランが始まる日の前日」（保証の終わりまで待つ本採用＝保証の終わりの日）・見送りは判断の日を trial_ends_on に書く・監査の after に trial_ends_on（同じ署名・ACL 不変・二重防御と課金のゲートはそのまま）
-- 関数・表の数は変えない（449／122 のまま）。
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';

alter table public.casts add column if not exists trial_ends_on date;
comment on column public.casts.trial_ends_on is '★0201l（裁定490-7）: 体入の条件が終わる日（本採用＝新しいプランの始まる日の前日・保証の後の本採用＝保証の終わりの日・見送り＝判断の日）。給与は開始（trial_started_on→joined_on→created_at）〜この日を体入として扱う';

create or replace function public.cast_trial_decide(p_cast_id uuid, p_decision text, p_plan_id uuid, p_from date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := public.auth_org_id(); v_role text := public.auth_role(); v_c public.casts; v_plan uuid; v_from date; v_today date := (now() at time zone 'Asia/Tokyo')::date; v_open_from date; v_after_guarantee boolean := false;
  v_ends date;   -- ★0201l（裁定490-7）: 体入の条件が終わる日
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_decision is null or p_decision not in ('hire','decline') then raise exception 'bad decision'; end if;
  select * into v_c from public.casts where id = p_cast_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if (v_role = 'owner' or (v_role = 'manager' and v_c.store_id = public.auth_store_id())) is not true then raise exception 'forbidden'; end if;
  if v_c.kind is distinct from '体入' or not v_c.is_active then raise exception 'not trial'; end if;
  v_from := coalesce(p_from, v_today);
  if p_decision = 'hire' then
    v_plan := coalesce(p_plan_id, (select nullif(s.settings_json->>'default_plan_id', '')::uuid from public.stores s where s.id = v_c.store_id));
    if v_plan is null then raise exception 'no plan'; end if;
    perform public.set_cast_kind(p_cast_id, 'キャスト');
    -- ★裁定484（2026-11-12 Agoora・案 2）: 開いた行が保証時給の後の行（開始日が今日以降・前日まで保証の行がある）なら、その行を新しいプランで上書きする
    --   ＝保証は終了日まで続き、翌日から新しいプラン（日付は選ばせない＝p_from は使わない）。保証の行は残る。給与の式は変えない。
    select cp.valid_from into v_open_from from public.cast_plan cp where cp.cast_id = p_cast_id and cp.valid_to is null;
    if v_open_from is not null and v_open_from >= v_today then
      select exists (select 1 from public.cast_plan g where g.cast_id = p_cast_id and g.valid_to = v_open_from - 1 and (g.overrides_json->>'guarantee') = 'true') into v_after_guarantee;
    end if;
    if v_after_guarantee then
      perform public.set_cast_plan(p_cast_id, v_plan, '{}'::jsonb, null);
      v_from := v_open_from;
    else
      perform public.set_cast_plan(p_cast_id, v_plan, '{}'::jsonb, v_from);
    end if;
    -- ★0201l（裁定490-7・2026-11-13 Agoora 確定）: 本採用＝新しいプランが始まる日の前日（保証の終わりまで待つ本採用＝保証の終わりの日＝v_open_from − 1）
    v_ends := v_from - 1;
  else
    perform public.cast_leave(p_cast_id, v_from);
    -- ★0201l（裁定490-7）: 見送り＝判断の日
    v_ends := v_from;
  end if;
  update public.casts set trial_ends_on = v_ends where id = p_cast_id;
  perform public.audit_log_write('cast_trial_decide', 'casts:' || p_cast_id::text,
    jsonb_build_object('kind', v_c.kind),
    jsonb_build_object('decision', p_decision, 'plan_id', v_plan, 'from', v_from, 'after_guarantee', v_after_guarantee, 'trial_ends_on', v_ends), v_c.store_id);
end $function$;
revoke execute on function public.cast_trial_decide(uuid, text, uuid, date) from public, anon;
grant execute on function public.cast_trial_decide(uuid, text, uuid, date) to authenticated;

commit;
