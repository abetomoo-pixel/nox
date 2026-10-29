-- 0189_staffing_needs_next_day.sql — M-16 の翌表記＝必要人数の時間帯（staffing_needs.from_min／to_min）を営業日の 24 時超（翌・+1440）まで持てるように（2026-10-29 起草・Agoora 確定 10/27 補遺 M-16「翌の選択肢は MIG_0189_APPLIED の配下」）
-- 翻訳元: live pg_get_functiondef（2026-10-29）＋生成器 docs/tmp/gen_0189.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換）。
--   ★1 staffing_needs の CHECK＝to_min ≤ 1440 → ≤ 2880（翌 24:00）・from_min ≥ 0 は不変（翌日側の開始も可）。既存 50 行（max to_min 1440）はすべて新しい CHECK を満たす。
--   ★2 set_staffing_need の検証を同じ上限に（'bad band'）。重複ガード（overlap）・upsert（store, dow, from_min）は不変。shift_period_needs_set（期間ごとの人数＝曜日と人数だけ）は時間帯を持たない＝対象外。
--   client（MIG_0189_APPLIED＝true の後）＝lib/nox/shift/half-hour.ts bandOptionsOf の範囲を店の営業時間の翌側まで（「翌01:00」の表記・値は 25:00 の形＝1500 分）。読み手（充足の分母＝shift_gap／labor-forecast）は分で比較しているので不変。
-- 営業中に貼ってよいか: 営業中でも可（staffing_needs は 50 行・CHECK の差し替えは一瞬・RPC の CREATE OR REPLACE は一瞬）。
-- 検証（Success の後）: 末尾 ===== verify =====。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）

-- ═══ ① staffing_needs の CHECK（翌 24:00 まで） ═══
alter table public.staffing_needs drop constraint if exists staffing_needs_band_chk;
alter table public.staffing_needs add constraint staffing_needs_band_chk check (from_min >= 0 and from_min < to_min and to_min <= 2880);
comment on constraint staffing_needs_band_chk on public.staffing_needs is '★0189（M-16 翌表記）: 営業日の分＝24 時超は +1440・上限 2880（翌 24:00）';

-- ═══ ② set_staffing_need ═══
CREATE OR REPLACE FUNCTION public.set_staffing_need(p_store_id uuid, p_dow integer, p_required integer, p_from_min integer DEFAULT 0, p_to_min integer DEFAULT 1440)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_required is null or p_required < 0 then raise exception 'bad required'; end if;
  -- ★mig0095: 時間帯バンド検証（from < to）・★0189（M-16 翌表記・Agoora 確定 10/27）: 営業日の分＝24 時を超えた分は +1440（翌 06:00＝1800）＝上限 2880（翌 24:00）・開始も翌日側を許す
  if p_from_min is null or p_to_min is null
     or p_from_min < 0 or p_to_min > 2880 or p_from_min >= p_to_min then
    raise exception 'bad band';
  end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or ((public.auth_role() = 'manager' or (public.auth_role() = 'staff' and public.auth_staff_can_shift())) and p_store_id = public.auth_store_id())  /* ★0183（裁定429）: シフト ON のスタッフは店長と同じ */) then
    raise exception 'forbidden';
  end if;
  -- ★mig0095: バンド重複ガード（同 store/dow・from_min 不一致で期間交差する行は 'overlap'＝
  --   充足分母の二重計上防止。同 from_min は upsert 置換＝to_min/required 更新。新バンド全体で判定する
  --   ため、既存バンドの to_min 拡張が隣接バンドへ食い込むケースもここで拒否される）
  if exists (
    select 1 from public.staffing_needs n
    where n.store_id = p_store_id and n.dow = p_dow
      and n.from_min <> p_from_min
      and p_from_min < n.to_min and n.from_min < p_to_min
  ) then
    raise exception 'overlap';
  end if;
  select to_jsonb(n) into v_before from public.staffing_needs n
    where n.store_id = p_store_id and n.dow = p_dow and n.from_min = p_from_min;
  insert into public.staffing_needs (org_id, store_id, dow, required, from_min, to_min)
  values (public.auth_org_id(), p_store_id, p_dow, p_required, p_from_min, p_to_min)
  on conflict (store_id, dow, from_min) do update set required = excluded.required, to_min = excluded.to_min
  returning id into v_id;
  perform public.audit_log_write('set_staffing_need', 'staffing_needs:' || v_id::text, v_before,
    (select to_jsonb(n) from public.staffing_needs n where n.id = v_id), p_store_id);
  return v_id;
end $function$;

commit;

-- ===== verify =====（Success の後に貼る・SELECT のみ）
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all select 'band check', pg_get_constraintdef(oid) from pg_constraint where conname = 'staffing_needs_band_chk'
union all select 'rows ok', (select count(*) from public.staffing_needs where not (from_min >= 0 and from_min < to_min and to_min <= 2880))::text || ' bad / ' || (select count(*) from public.staffing_needs)::text || ' rows'
union all select 'has 0189', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%★0189%' and proname = 'set_staffing_need'
union all select 'md5 set_staffing_need', left(md5(replace(prosrc, chr(13), '')), 8) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_staffing_need'
union all select 'set_staffing_need acl', proacl::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_staffing_need'
order by 1;
-- ===== end 0189 =====
