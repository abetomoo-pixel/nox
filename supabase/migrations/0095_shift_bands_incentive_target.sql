-- ═══════════════════════════════════════════════════════════════════════════
-- mig0095: E8-4 シフトレーン DB 基盤（自己検証版）
--   staffing_needs 時間帯化（#2/#3）＋ attendance_incentives 対象/理由（#5）
--   底本 = nox_mig0095_live_defs.sql（sha256 2d1357ee…78db・live 逐語）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: add column／UNIQUE drop・張り替え／旧署名 drop
-- ★notify pgrst はファイル外・手貼り後に単発
-- ★incentive_cancel は不触
-- ★incentive_publish の部分ユニーク（同日 published 1本）・paid 期間ガード・billing ゲートは逐語不変
-- ★staffing_need_remove は billing ゲート入りで新設＝ゲート対象 +1（billing 段47 pins・
--   課金ゲート正本への追記が実装ブロックで必要＝0089〜0091 型の波及・織り込み済み）
--
-- 裁定（台帳収載済み）:
--   E8-4-1 案A 行分割・from_min/to_min default 0/1440＝既存行は自動で終日バンド・backfill 不要
--   E8-4-2 ポジション軸は今回入れない（純増候補パーク）
--   E8-4-3 reason（≤200）＋target_cast_ids uuid[]（null=全員=現行互換）・明細テーブルなし
--   E8-4-4 0083 非対称流儀踏襲・バンド重複は RPC ガード 'overlap'（exclusion constraint なし）
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- (1) DDL: staffing_needs 時間帯化（default で既存8行＝終日バンド化）
-- ─────────────────────────────────────────────
alter table public.staffing_needs add column from_min integer not null default 0;
alter table public.staffing_needs add column to_min   integer not null default 1440;
alter table public.staffing_needs
  add constraint staffing_needs_band_chk
  check (from_min >= 0 and from_min < to_min and to_min <= 1440);
alter table public.staffing_needs drop constraint staffing_needs_store_id_dow_key;
alter table public.staffing_needs
  add constraint staffing_needs_store_dow_from_key unique (store_id, dow, from_min);

-- ─────────────────────────────────────────────
-- (2) DDL: attendance_incentives 対象/理由（既存 CHECK 4本・部分ユニーク不触）
-- ─────────────────────────────────────────────
alter table public.attendance_incentives add column reason text;
alter table public.attendance_incentives
  add constraint attendance_incentives_reason_len
  check (reason is null or length(reason) <= 200);
alter table public.attendance_incentives add column target_cast_ids uuid[];

-- ─────────────────────────────────────────────
-- (3) set_staffing_need: 時間帯対応（アリティ 3→5・旧署名 drop＋ACL 再適用）
-- ─────────────────────────────────────────────
drop function if exists public.set_staffing_need(uuid, integer, integer);

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
  -- ★mig0095: 時間帯バンド検証（0..1440・from < to）
  if p_from_min is null or p_to_min is null
     or p_from_min < 0 or p_to_min > 1440 or p_from_min >= p_to_min then
    raise exception 'bad band';
  end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
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

revoke execute on function public.set_staffing_need(uuid, integer, integer, integer, integer) from public, anon;
grant  execute on function public.set_staffing_need(uuid, integer, integer, integer, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (4) staffing_need_remove 新設（バンド削除経路・billing ゲート入り＝set と対称）
-- ─────────────────────────────────────────────
create or replace function public.staffing_need_remove(p_store_id uuid, p_dow integer, p_from_min integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_row   public.staffing_needs;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_from_min is null then raise exception 'bad band'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.staffing_needs
    where store_id = p_store_id and dow = p_dow and from_min = p_from_min;
  if not found then raise exception 'not found'; end if;

  delete from public.staffing_needs where id = v_row.id;

  perform public.audit_log_write('staffing_need_remove', 'staffing_needs:' || v_row.id::text,
    to_jsonb(v_row), null, p_store_id);
end $function$;

revoke execute on function public.staffing_need_remove(uuid, integer, integer) from public, anon;
grant  execute on function public.staffing_need_remove(uuid, integer, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────
-- (5) incentive_publish: 対象/理由対応（アリティ 5→7・旧署名 drop＋ACL 再適用）
-- ─────────────────────────────────────────────
drop function if exists public.incentive_publish(uuid, date, text, text, integer);

CREATE OR REPLACE FUNCTION public.incentive_publish(p_store_id uuid, p_biz_date date, p_kind text, p_amount_mode text, p_amount integer, p_reason text DEFAULT NULL::text, p_target_cast_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（drink_boost は予約値＝publish は bonus のみ受理・論点4）
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_kind is null or p_kind <> 'bonus' then raise exception 'kind reserved'; end if;
  if p_amount_mode is null or p_amount_mode not in ('per_head','pooled') then raise exception 'bad mode'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  -- ★mig0095: 理由・対象の形式検証（null=全員=現行完全互換）
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  if p_target_cast_ids is not null then
    if array_length(p_target_cast_ids, 1) is null then raise exception 'bad target'; end if;
    if (select count(*) from unnest(p_target_cast_ids))
       <> (select count(distinct x) from unnest(p_target_cast_ids) x) then
      raise exception 'bad target';
    end if;
  end if;
  -- store の org 照合＋ロール判定（owner 全店・manager 自店のみ・staff/cast 不可）
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★mig0095: 対象 cast の帰属検証（全 id が同 org・同 store。活性列は casts スキーマ非依存＝
  --   帰属のみ判定。給与側の受給者は出勤ベース＝recipientsByDate で自然に絞られる）
  if p_target_cast_ids is not null then
    if exists (
      select 1 from unnest(p_target_cast_ids) t(cid)
      left join public.casts c
        on c.id = t.cid and c.org_id = v_store.org_id and c.store_id = p_store_id
      where c.id is null
    ) then
      raise exception 'bad target';
    end if;
  end if;
  -- publish も paid 期間ガード（論点1・実装ノート【4】）
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 同日 published は部分ユニークで原理的に排他（exists→insert の TOCTOU を閉じる）。
  -- on conflict のターゲットに部分ユニークインデックス述語を明示（insert は status='published' 固定＝必ずマッチ）。
  insert into public.attendance_incentives (org_id, store_id, biz_date, kind, amount_mode, amount, status, created_by, reason, target_cast_ids)
  values (v_store.org_id, p_store_id, p_biz_date, 'bonus', p_amount_mode, p_amount, 'published', v_actor, nullif(trim(coalesce(p_reason,'')),''), p_target_cast_ids)
  on conflict (store_id, biz_date) where status = 'published' do nothing
  returning id into v_id;
  if v_id is null then raise exception 'already published'; end if; -- 競合で挿入されなかった＝同時発行

  perform public.audit_log_write('incentive_publish', 'attendance_incentives:' || v_id::text,
    null, jsonb_build_object('biz_date', p_biz_date, 'amount_mode', p_amount_mode, 'amount', p_amount,
                             'reason', p_reason, 'target_count', array_length(p_target_cast_ids, 1)), p_store_id);
  return v_id;
end $function$;

revoke execute on function public.incentive_publish(uuid, date, text, text, integer, text, uuid[]) from public, anon;
grant  execute on function public.incentive_publish(uuid, date, text, text, integer, text, uuid[]) to authenticated, service_role;

commit;
