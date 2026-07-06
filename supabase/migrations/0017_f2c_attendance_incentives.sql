-- 0017_f2c_attendance_incentives: F2c — 出勤インセンティブ（台帳 #32・設計ロック I1a〜I9a）
--   ① attendance_incentives（1行1 store×biz_date・凍結記録＝編集不可・cancel＋新規のみ・パターン3）
--   ② incentive_publish（manager 以上・published 行 insert・paid 期間ガード）
--   ③ incentive_cancel（manager 以上・status を cancelled に・paid 期間ガード）
--
-- 翻訳元・裁定参照:
--  - 台帳 #32 設計ロック I1a〜I9a … 1行1 store×biz_date／kind='bonus' のみ F2 実装（'drink_boost' は enum 予約＝
--    back_snapshot 経路のため別途）／行自体が凍結記録（編集不可・cancel＋新規のみ・published 部分ユニーク）／
--    支払条件=final∈{ok,late}・当日出勤者全員（発行前確定者含む＝Z）／給与結線=payOf 外側・payslips.breakdown_json
--    の extras 独立行／権限=manager 以上・閲覧パターン3／staffing_needs と FK なし疎結合。
--  - F2c-3 plan 裁定（相談役承認）:
--    論点1 publish も paid 期間を拒否（paid 済み period に発行しても再確定不可＝payslip に入らず誤解を生む）。
--    論点2 pooled 端数 +1=cast_id 昇順（extras 結線は TS core・本 mig はテーブル/発行/cancel のみ）。
--    論点4 kind check に 'drink_boost' を予約値として含める・RPC は 'bonus' のみ受理。
--    確認1 受給者は final∈{ok,late}（確定シフトがある日に出勤・raw のみの当日ヘルプは対象外＝S3 一貫・extras 結線側で担保）。
--    確認2 biz_date は cutoff 正規化済み＝get_cast_sales/punch-match と同一 biz_date 基準。paid 期間判定は
--          to_char(biz_date,'YYYY-MM')＝period（暦月ラベル）で payroll_runs.status='paid' を照合。
--
-- 実装ノート:
--  【1】パターン3（周知）: SELECT は店スコープのみ・cast プライバシー条件なし（全ロール可視）。書込は RPC 経由のみ
--      （INSERT/UPDATE/DELETE ポリシー無し＋grant は SELECT のみ）。
--  【2】凍結記録: updated_at 列・touch トリガは付けない。status は published→cancelled の一方向 flip を RPC 内で明示。
--      訂正は cancel＋新規 incentive_publish（別 insert）＝行の書き換えをしない。
--  【3】部分ユニーク（store_id, biz_date）where status='published'＝同日1 published。cancel で解放＝再発行可。
--  【4】paid 期間ガード: 対象 biz_date の period（to_char 'YYYY-MM'）が同 store の payroll_runs で status='paid' なら
--      publish/cancel とも拒否（凍結済み payslip との不整合防止）。payroll_finalize は paid 済み再確定を既に拒否。
--  【5】原則6: 全書込 RPC は audit_log_write（publish/cancel とも）。二重防御標準型（null guard・org 照合・
--      ロール判定・revoke public,anon＋grant authenticated）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) テーブル: RLS 有効・ポリシー（SELECT 1本）
--   select relname, relrowsecurity from pg_class
--    where relnamespace='public'::regnamespace and relname='attendance_incentives';
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename='attendance_incentives'; -- 期待 SELECT 1本
--   -- 2) 部分ユニーク（published のみ・同日1本）
--   select indexname, indexdef from pg_indexes where schemaname='public'
--    and indexname='attendance_incentives_pub_uidx';
--   -- 3) grant 面: authenticated=SELECT のみ（G1 自動確認）
--   select relname, coalesce(array_to_string(relacl,','),'(default)') from pg_class
--    where relnamespace='public'::regnamespace and relname='attendance_incentives';
--   -- 4) RPC prosrc/ACL（承認版と一字照合・authenticated grant・service_role は Supabase 既定＝正常）
--   select proname, prosrc from pg_proc where pronamespace='public'::regnamespace
--    and proname in ('incentive_publish','incentive_cancel') order by proname;
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--    and proname in ('incentive_publish','incentive_cancel') order by proname;
--   -- 5) 動作アンカー（JWT が要るため SQL Editor では不可・F2c-3 verify 追記コミットで実施）:
--   --    anon-guard … incentive_publish/incentive_cancel anon BLOCKED・attendance_incentives anon SELECT DENIED。
--   --    rls … パターン3（owner/manager/staff/cast とも自店可視）・manager 発行/cancel 成功・staff/cast 発行拒否・
--   --      クロス org 拒否・部分ユニーク（published 二重発行拒否・cancel 後再発行可）・paid 期間 publish/cancel 拒否。
--   --    grants … authenticated=SELECT のみ（G1）。

begin;

-- ══════════════════════════════════════════════════════════════
-- attendance_incentives（1行1 store×biz_date・凍結記録・パターン3）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.attendance_incentives (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  biz_date     date not null,
  kind         text not null default 'bonus' check (kind in ('bonus','drink_boost')), -- drink_boost は enum 予約（publish は bonus のみ受理）
  amount_mode  text not null check (amount_mode in ('per_head','pooled')),
  amount       int  not null check (amount >= 0), -- 円
  status       text not null default 'published' check (status in ('published','cancelled')),
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  cancelled_by uuid references public.users(id),
  cancelled_at timestamptz
);
-- 部分ユニーク: 同日1 published（cancel で解放＝再発行可・実装ノート【3】）
create unique index if not exists attendance_incentives_pub_uidx
  on public.attendance_incentives (store_id, biz_date) where status = 'published';
create index if not exists attendance_incentives_store_date_idx on public.attendance_incentives (store_id, biz_date);
create index if not exists attendance_incentives_org_idx on public.attendance_incentives (org_id);

-- ── RLS（パターン3・周知・実装ノート【1】）───────────────────────
alter table public.attendance_incentives enable row level security;
drop policy if exists attendance_incentives_select on public.attendance_incentives;
create policy attendance_incentives_select on public.attendance_incentives
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
  );
-- 書込ポリシーは作らない（INSERT/UPDATE/DELETE ともクライアント不可・RPC 経由のみ）

-- ── grant 標準型（revoke all → SELECT のみ戻す）────────────────
revoke all on table public.attendance_incentives from public, anon, authenticated;
grant select on table public.attendance_incentives to authenticated;

-- ══════════════════════════════════════════════════════════════
-- incentive_publish（manager 以上・published 行 insert・paid 期間ガード・論点1/4）
-- ══════════════════════════════════════════════════════════════
create or replace function public.incentive_publish(
  p_store_id    uuid,
  p_biz_date    date,
  p_kind        text,
  p_amount_mode text,
  p_amount      int
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_store record;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力検証（drink_boost は予約値＝publish は bonus のみ受理・論点4）
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_kind is null or p_kind <> 'bonus' then raise exception 'kind reserved'; end if;
  if p_amount_mode is null or p_amount_mode not in ('per_head','pooled') then raise exception 'bad mode'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  -- store の org 照合＋ロール判定（owner 全店・manager 自店のみ・staff/cast 不可）
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- publish も paid 期間ガード（論点1・実装ノート【4】）
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 同日 published は部分ユニークで原理的に排他（exists→insert の TOCTOU を閉じる）。
  -- on conflict のターゲットに部分ユニークインデックス述語を明示（insert は status='published' 固定＝必ずマッチ）。
  insert into public.attendance_incentives (org_id, store_id, biz_date, kind, amount_mode, amount, status, created_by)
  values (v_store.org_id, p_store_id, p_biz_date, 'bonus', p_amount_mode, p_amount, 'published', v_actor)
  on conflict (store_id, biz_date) where status = 'published' do nothing
  returning id into v_id;
  if v_id is null then raise exception 'already published'; end if; -- 競合で挿入されなかった＝同時発行

  perform public.audit_log_write('incentive_publish', 'attendance_incentives:' || v_id::text,
    null, jsonb_build_object('biz_date', p_biz_date, 'amount_mode', p_amount_mode, 'amount', p_amount), p_store_id);
  return v_id;
end $$;
revoke execute on function public.incentive_publish(uuid, date, text, text, int) from public, anon;
grant  execute on function public.incentive_publish(uuid, date, text, text, int) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- incentive_cancel（manager 以上・status を cancelled に・paid 期間ガード）
-- 訂正は cancel＋新規 incentive_publish（別 insert）＝行の書き換えをしない（実装ノート【2】）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.incentive_cancel(
  p_incentive_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_row   record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select * into v_row from public.attendance_incentives where id = p_incentive_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'published' then raise exception 'not published'; end if;
  -- paid 期間ガード（凍結済み payslip との不整合防止・実装ノート【4】）
  if exists (select 1 from public.payroll_runs
             where store_id = v_row.store_id and period = to_char(v_row.biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.attendance_incentives
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_incentive_id;

  perform public.audit_log_write('incentive_cancel', 'attendance_incentives:' || p_incentive_id::text,
    jsonb_build_object('status', 'published'), jsonb_build_object('status', 'cancelled'), v_row.store_id);
  return p_incentive_id;
end $$;
revoke execute on function public.incentive_cancel(uuid) from public, anon;
grant  execute on function public.incentive_cancel(uuid) to authenticated;

commit;
