-- 0011_f1f_ranking_staff: F1f — ランキング集計 RPC（get_cast_ranking）＋ attendance_set の staff 開放。
--                          0006/0007/0008/0009 適用済みが前提。
--
-- ① get_cast_ranking（認可設計 §3「順位/件数のみ」の具体化・F1f plan §3 承認済み）:
--  - 返却列の完全列挙: rank / cast_id / cast_name / hon_count / jonai_count / dohan_count / is_self。
--    **金額・売上額・バック額の列は一切含めない**（順位づけの最終タイブレークに check_cast_backs 合計を
--    内部で使うが返さない＝cast が金額を逆算できる列を出さない）。
--  - **全ロール同一の返却形**（レビュー確定）。認可設計 §3.2 の「manager には金額込み」は
--    F2 の pay/castMng 用の別 RPC に分離（1 RPC 内のロール分岐で事故る面を作らない）。
--  - SECURITY DEFINER＝パターン1 を意図的にバイパスして店全体を集計し、安全列のみ返す
--    （認可設計 §3.3 二段構えの②）。二重防御: null guard・store の org 照合・
--    cast/staff/manager は自店のみ（owner は org 全店）・revoke public, anon ＋ grant authenticated。
--  - ★読み取り専用＝audit_log_write 対象外（原則6は「全**書込** RPC」）。閲覧系 RPC の初事例。
--    センシティブ閲覧（mynumber 等）は別枠＝アクセスログ必須（F2b・認可設計 §2.4）。
--  - 期間: p_period 'YYYY-MM'（暦月）。範囲は [月初 cutoff JST, 翌月初 cutoff JST) の started_at。
--    cutoff は店設定の現在値（ランキングは表示用＝日報と違い凍結不要・思想差を明記）。
--  - 件数の定義: 期間内 closed 伝票のうち、当該 cast が指名に載る伝票数を nom_type 別に数える
--    （重み・分配比は件数に影響しない）。対象は自店のアクティブ cast 全員（0件でも行を返す）。
--  - 順位: hon 降順 → 総件数降順 → バック合計降順（内部・非開示）→ 源氏名昇順 → id 昇順（決定的）。
--
-- ② attendance_set の staff 開放（台帳 #24 の確定・F1f plan §4 承認済み）:
--  - 出勤板の日次操作はフロア黒服の実務。attendance は「判断」層（upsert で修正可・audit 付き・
--    金額に直結しない）のため staff に開放。**punch_proxy は manager 維持**（代理打刻＝給与時間の
--    事実生成でなりすましリスクが質的に違う）。ロール判定1行の変更＝全文再掲（create or replace）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・先頭に貼り先証明）:
--   -- 0) 貼り先証明（nox プロジェクトであること）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) get_cast_ranking の prosrc（返却列に金額が無いこと・自店照合）
--   select prosrc from pg_proc where proname = 'get_cast_ranking';
--   -- 2) ACL: 2関数とも anon が現れないこと
--   select p.proname, r.rolname
--   from pg_proc p
--   join aclexplode(p.proacl) a on true
--   join pg_roles r on r.oid = a.grantee
--   where p.proname in ('get_cast_ranking','attendance_set')
--   order by p.proname, r.rolname;
--   -- 3) attendance_set の prosrc に 'staff' が入っていること（開放確認）
--   select prosrc from pg_proc where proname = 'attendance_set';

begin;

-- ══════════════════════════════════════════════════════════════
-- ① get_cast_ranking（順位/件数のみ・金額列なし・全ロール同一形）
-- ══════════════════════════════════════════════════════════════
create or replace function public.get_cast_ranking(
  p_store_id uuid,
  p_period   text
) returns table (
  rank        int,
  cast_id     uuid,
  cast_name   text,
  hon_count   int,
  jonai_count int,
  dohan_count int,
  is_self     boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  v_org      uuid;
  v_settings jsonb;
  v_cutoff   text;
  v_first    date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_self     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  select s.org_id, s.settings_json into v_org, v_settings from public.stores s where s.id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- cast/staff/manager は自店のみ・owner は org 全店
  if not (public.auth_role() = 'owner' or p_store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_first := (p_period || '-01')::date;
  v_start := ((v_first::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_end   := ((((v_first + interval '1 month')::date)::text || ' ' || v_cutoff))::timestamp at time zone 'Asia/Tokyo';
  v_self  := public.auth_cast_id();

  return query
  with nom_counts as (
    select n.cast_id as cid,
           count(*) filter (where c.nom_type = 'hon')   as hon,
           count(*) filter (where c.nom_type = 'jonai') as jonai,
           count(*) filter (where c.nom_type = 'dohan') as dohan
    from public.check_nominations n
    join public.checks c on c.id = n.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and n.org_id = v_org
    group by n.cast_id
  ),
  back_sums as (
    -- 順位の最終タイブレーク専用（値は返さない）
    select b.cast_id as cid,
           sum(b.drink_back + b.champ_back + b.bottle_back) as backs
    from public.check_cast_backs b
    join public.checks c on c.id = b.check_id
    where c.org_id = v_org and c.store_id = p_store_id and c.status = 'closed'
      and c.started_at >= v_start and c.started_at < v_end
      and b.org_id = v_org
    group by b.cast_id
  )
  select row_number() over (
           order by coalesce(nc.hon, 0) desc,
                    coalesce(nc.hon, 0) + coalesce(nc.jonai, 0) + coalesce(nc.dohan, 0) desc,
                    coalesce(bs.backs, 0) desc,
                    ca.name asc, ca.id asc
         )::int,
         ca.id,
         ca.name,
         coalesce(nc.hon, 0)::int,
         coalesce(nc.jonai, 0)::int,
         coalesce(nc.dohan, 0)::int,
         coalesce(ca.id = v_self, false) -- 非 cast 呼び出し（v_self=null）でも false（boolean を null にしない）
  from public.casts ca
  left join nom_counts nc on nc.cid = ca.id
  left join back_sums  bs on bs.cid = ca.id
  where ca.org_id = v_org and ca.store_id = p_store_id and ca.is_active;
end $$;
revoke execute on function public.get_cast_ranking(uuid, text) from public, anon;
grant  execute on function public.get_cast_ranking(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ② attendance_set の staff 開放（台帳 #24 クローズ・ロール判定のみ変更の全文再掲）
-- ══════════════════════════════════════════════════════════════
create or replace function public.attendance_set(
  p_cast_id uuid,
  p_date    date,
  p_status  text,
  p_eta     text default null,
  p_reason  text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast record; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_status is null or p_status not in ('shukkin','dohan','late','off','absent') then raise exception 'bad status'; end if;
  if p_eta is not null and p_eta !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad eta'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 台帳 #24 確定: staff（黒服）に開放（出勤板の日次操作＝フロア実務。punch_proxy は manager 維持）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() in ('manager','staff') and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select to_jsonb(a) into v_before from public.attendance a where a.cast_id = p_cast_id and a.date = p_date;
  insert into public.attendance (org_id, store_id, cast_id, date, status, eta, reason, source)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_status, p_eta, p_reason, 'staff')
  on conflict (cast_id, date) do update
    set status = excluded.status, eta = excluded.eta, reason = excluded.reason, source = 'staff'
  returning id into v_id;
  perform public.audit_log_write('attendance_set', 'attendance:' || v_id::text, v_before,
    (select to_jsonb(a) from public.attendance a where a.id = v_id), v_cast.store_id);
  return v_id;
end $$;
revoke execute on function public.attendance_set(uuid, date, text, text, text) from public, anon;
grant  execute on function public.attendance_set(uuid, date, text, text, text) to authenticated;

commit;
