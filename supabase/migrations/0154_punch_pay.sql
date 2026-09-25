-- 0154_punch_pay.sql
-- 裁定294（2026-09-24・0154 出退勤・報酬型・懲戒減給・計算期間・雇用区分の設計 294-1〜11）＝2026-09-24 起草（CC 写経・パス 1・便 M3）。
-- 写経元（live・docs/tmp/0154_live.md／0154_live2.md 逐語＝pg_get_functiondef・docs/tmp/gen_0154.py で機械生成・★以外は 1 バイト不変）:
--   ★1 punch_corrections        ＝ 0146 payroll_adjustments（create table → index → RLS SELECT → revoke all／grant select の順）＋ punches_select の 3 条件（本人＝cast_id=auth_cast_id()）
--   ★2 punch_correction_request ＝ punch_proxy（cast 解決・is_active・owner∨manager 自店）＋ punch_self（auth_cast_id 本人）＋ staff_shift_cancel（'reason required'・6 引数 audit）
--                                  ＋ payroll_adjustment_add（actor＝users.id）。owner／manager は同 tx で approved（punch_correction_apply＝内部専用ヘルパー）
--   ★3 punch_correction_decide  ＝ staff_shift_cancel（not_found・for update・6 引数 audit）＋ payroll_adjustment_delete（owner∨manager・actor）
--   ★4 punch_correction_ack     ＝ shift_open_periods_mine／punch_self の actor 行（auth_cast_id・'no cast for caller'）・本人のみ
--   ★5 set_cast_plan            ＝ live 全文を機械で写し、白名単 +3（'pay_rule','per_shift_amount','fixed_amount'）・型分岐 +1・宣言 +2・employment 検査 +1 のみ★
--   ★6 payroll_adjustment_add   ＝ live 全文を機械で写し、署名 +3（p_source／p_basis／p_target_shift_id・既定 'manual'／null）・検査＋insert 列＋audit のみ★
--                                  （旧 8 引数は drop＝同名の多重定義を残さない）・payroll_adjustments に basis／target_shift_id＋source CHECK 4 値
--   ★7 set_store_profile        ＝ live 全文（0151 適用後）を機械で写し、白名単 +1（'settlement_presets'）・宣言 +2・検証ブロック +1 のみ★
--   ★8 payslips                 ＝ calc_period_start／calc_period_end（date）＋既存行の埋め戻し（run の period_start／end・null は period_bounds）
--                                  ＋ payroll_finalize＝live 全文を機械で写し、insert 列 +2（p_payslips の同名キー・欠損は run の期間）・形検査 +1 のみ★
--   ★9 casts.employment_valid_from（date・既存行 null）＋ set_cast_employment ＝ set_cast_plan 骨格（ガード・cast 照合・audit 5 引数）・owner のみ
--   ★10 revoke／grant＝0151 の形（新 RPC 4 本＝revoke all … from public, anon／grant … to authenticated, service_role・内部ヘルパー＝4 ロール revoke・grant なし・
--        set_cast_plan／set_store_profile＝再掲・payroll_adjustment_add＝新署名へ・payroll_finalize＝service_role 専任のまま再掲）
--
-- 要裁定 (12)＝**裁定295（2026-09-24）で確定**（起草時に列挙・(1)＝decide_reason 列を追加・(12)＝FK cast_id ON DELETE CASCADE／punch_id ON DELETE SET NULL・他は起草どおり）:
--   (1) ★3 却下理由の置き場（295-1）: punch_corrections.decide_reason text を追加。rejected は必須（'reason required'）・approved は任意。本人が RLS（本人 select）で読める。
--       audit_logs.reason にも残す（6 引数 audit は不変）。
--   (2) ★6 sanction の総額上限「当期 gross の 1/10」の基底（295-2＝起草どおり）: draft run には payslip が無い（payroll_finalize が初めて insert）→ 当 run の
--       payslip（再確定前の凍結値）があればその pay.gross・無ければ平均賃金×当期暦日数（推計）。推計基底で通した件は client が明細に「（推計基底）」を付す。
--   (3) ★6 sanction は mode='fixed' のみ（'rate' は 'bad mode'・295-3）＝1 件上限（floor(平均賃金/2)）は額で比べるため。
--   (4) ★2／★3 承認時の punches 書込（295-4＝起草どおり）: update＝元行の punched_at を after_at に・note='punch_correction:<id>'／新規＝insert（source='manager'＝CHECK
--       3 値は不変・note 同上）／削除＝delete（FK on delete set null で punch_id が null になり before_at＋kind で履歴を残す）。
--   (5) 内部ヘルパー punch_correction_apply(p_id, p_reason)（4 ロール revoke・grant なし・295-5）＝関数は 5 本（名簿 A +4・除外 +1）。
--   (6) 文言（295-6＝起草どおり）: 'bad source'／'basis required'／'bad source for employment'／'shift not found'／'out of biz window'／'punch not found'／
--       'not pending'／'not approved'／'not decided'／'bad ack'／'bad employment'／'bad calc period'。既存語＝'forbidden'／'billing locked'／'invalid_input'／
--       'not_found'／'reason required'／'bad type'／'bad mode'／'bad valid_from'／'inactive cast'／'no cast for caller'・294 指定＝'period finalized'／
--       'sanction cap'／'no basis for average wage'／'bad pay_rule for employment'。
--   (7) ★4 ack は decided（approved|rejected）行のみ（pending は 'not decided'・295-6）。cast 本人の書込＝billing ゲート内蔵（名簿 A）。
--   (8) ★9 「給与期の初日」＝period_bounds（月初）で判定（295-6）・「最後に確定した期」＝自店 finalized|paid の max(period_end)（null は period_bounds）
--       → p_valid_from ≦ それなら 'period finalized'。
--   (9) ★8 calc_period_start／end は nullable のまま（295-6・既存行は埋め戻し済・finalize は欠損キーを run の期間で補う）＋ 'bad calc period'（run 期間外・逆転）。
--   (10) ★2 営業日窓＝biz_date_of(store, after_at) = p_biz_date（295-6・既存 punch は punched_at でも照合）。窓外は 'out of biz window'。
--   (11) ★2 「staff 本人」＝auth_cast_id() = p_cast_id で判定（295-6・role に依らず本人＝casts.user_id の一致）。本人でない staff は 'forbidden'。
--   (12) ★1 demo_org_reset（0149）は触らない（295-7）。punch_corrections の FK＝cast_id→casts ON DELETE CASCADE・punch_id→punches ON DELETE SET NULL。
--       demo の c_wipe は casts の削除で連鎖・c_load は投入しない（空）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認・先頭に貼り先証明）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                          -- 3
--   -- 1) 新 RPC 5 本＋改稿 4 本: 署名・secdef・search_path・proacl（anon／PUBLIC なし・apply は authenticated/service_role もなし・finalize は service_role のみ）
--   select proname, pg_get_function_identity_arguments(oid), prosecdef, proconfig, proacl from pg_proc
--     where pronamespace='public'::regnamespace and proname in ('punch_correction_request','punch_correction_decide','punch_correction_ack',
--       'punch_correction_apply','set_cast_employment','set_cast_plan','payroll_adjustment_add','set_store_profile','payroll_finalize') order by 1, 2;   -- 9 行（adjustment_add は 11 引数の 1 行のみ）
--   -- 2) 白名単: set_cast_plan 11 キー・set_store_profile 22 キー
--   select prosrc like '%''per_shift_amount''%' from pg_proc where pronamespace='public'::regnamespace and proname='set_cast_plan';            -- t
--   select prosrc like '%''settlement_presets''%' from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile';      -- t
--   -- 3) 表・列: punch_corrections（18 列・RLS on・authenticated=SELECT のみ・FK cast_id CASCADE／punch_id SET NULL）・payslips.calc_period_*（欠損 0）・payroll_adjustments.basis／target_shift_id・casts.employment_valid_from
--   select count(*) filter (where calc_period_start is null) from public.payslips;                                                            -- 0
--   select relrowsecurity from pg_class where oid='public.punch_corrections'::regclass;                                                        -- t
--   -- 4) 不触の md5（money-core 3 本・check_group_due・billing_writable_of・punch_proxy／punch_self／attendance_set）が貼付前の控えと一致
--   -- 5) 動作＝突合 docs/tmp/q0924_ag_0154.mjs（BEGIN…ROLLBACK）・suite の張り替えは手貼り後

begin;

-- ══════════════════════════════════════════════════════════════
-- ★1 punch_corrections（裁定294-1）＝ 0146 payroll_adjustments の形（表 → index → RLS → revoke／grant）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.punch_corrections (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  store_id      uuid not null references public.stores(id),
  cast_id       uuid not null references public.casts(id) on delete cascade,   -- ★1（裁定295-7）: casts の削除で連鎖（demo の c_wipe）
  punch_id      uuid references public.punches(id) on delete set null,     -- ★1（裁定295-7）: null＝新規打刻の申請（確定後は insert した行の id・削除後は set null＝履歴を残す）
  biz_date      date not null,
  kind          text not null,
  before_at     timestamptz,
  after_at      timestamptz,                                               -- ★1: null＝削除
  reason        text not null,
  requested_by  uuid not null references public.users(id),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references public.users(id),
  decided_at    timestamptz,
  decision      text not null default 'pending',
  decide_reason text,                                                      -- ★1（裁定295-1）: 決裁側の理由（rejected は必須・approved は任意・本人が RLS で読める）
  ack           text not null default 'unconfirmed',
  ack_at        timestamptz,
  constraint punch_corrections_kind_ck     check (kind in ('in','out')),
  constraint punch_corrections_decision_ck check (decision in ('pending','approved','rejected')),
  constraint punch_corrections_ack_ck      check (ack in ('unconfirmed','confirmed','disputed')),
  constraint punch_corrections_reason_ck   check (length(trim(reason)) between 1 and 200),
  constraint punch_corrections_shape_ck    check (before_at is not null or after_at is not null),          -- ★1: 新規かつ削除は無い
  constraint punch_corrections_decided_ck  check ((decision = 'pending') = (decided_at is null))
);

create index if not exists punch_corrections_org_idx       on public.punch_corrections(org_id);
create index if not exists punch_corrections_store_biz_idx on public.punch_corrections(store_id, biz_date);
create index if not exists punch_corrections_cast_idx      on public.punch_corrections(cast_id);
create index if not exists punch_corrections_punch_idx     on public.punch_corrections(punch_id);

alter table public.punch_corrections enable row level security;

drop policy if exists punch_corrections_select on public.punch_corrections;
create policy punch_corrections_select on public.punch_corrections
  for select to authenticated
  using (
    (org_id = auth_org_id())
    and ((auth_role() = 'owner'::text) or (store_id = auth_store_id()))
    and ((auth_role() in ('owner'::text, 'manager'::text)) or (cast_id = auth_cast_id()))              -- ★1: 本人（punches_select と同型）＋自店 owner／manager
  );

revoke all on table public.punch_corrections from public, anon, authenticated;
grant select on table public.punch_corrections to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ★2 punch_correction_apply（内部専用ヘルパー・要裁定(5)）＝ 承認済み行を punches へ写す（update／insert／delete）＋ audit（6 引数）
--    呼び出し元（request の owner／manager 経路・decide の approve）が二重防御を済ませている前提（原則8）＝null guard なし
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.punch_correction_apply(p_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.punch_corrections%rowtype;
  v_before jsonb;
  v_after  jsonb;
  v_pid    uuid;
begin
  select * into r from public.punch_corrections where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.decision <> 'approved' then raise exception 'not approved'; end if;
  if r.punch_id is not null then
    select to_jsonb(p) into v_before from public.punches p where p.id = r.punch_id;
    if v_before is null then raise exception 'punch not found'; end if;
    if r.after_at is null then
      delete from public.punches where id = r.punch_id;                                                -- ★2: 削除（FK on delete set null → punch_corrections.punch_id は null・before_at で追跡）
      v_after := null;
    else
      update public.punches set punched_at = r.after_at, note = 'punch_correction:' || r.id::text
       where id = r.punch_id;                                                                          -- ★2: 元行を update（punches が唯一の読み口＝294-1）
      select to_jsonb(p) into v_after from public.punches p where p.id = r.punch_id;
    end if;
    v_pid := r.punch_id;
  else
    insert into public.punches (org_id, store_id, cast_id, punched_at, type, source, note)
    values (r.org_id, r.store_id, r.cast_id, r.after_at, r.kind, 'manager', 'punch_correction:' || r.id::text)   -- ★2: 新規＝insert（source CHECK 3 値は不変・要裁定(4)）
    returning id into v_pid;
    select to_jsonb(p) into v_after from public.punches p where p.id = v_pid;
    update public.punch_corrections set punch_id = v_pid where id = r.id;                                -- ★2: 確定後は insert した行を指す
  end if;
  perform public.audit_log_write('punch_correction_apply', 'punches:' || v_pid::text,
    v_before, v_after, r.store_id, coalesce(p_reason, r.reason));                                     -- ★2: staff_shift_cancel と同じ 6 引数形
  return v_pid;
end $function$;

revoke all on function public.punch_correction_apply(uuid, text) from public, anon, authenticated, service_role;   -- ★10: 内部専用＝4 ロール revoke・grant なし

-- ══════════════════════════════════════════════════════════════
-- ★2 punch_correction_request（裁定294-2）＝ punch_proxy／punch_self／staff_shift_cancel／payroll_adjustment_add の写経
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.punch_correction_request(p_cast_id uuid, p_punch_id uuid, p_biz_date date, p_kind text, p_after_at timestamp with time zone, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast      record;
  v_punch     record;
  v_actor     uuid;
  v_self      boolean;
  v_mgr       boolean;
  v_id        uuid;
  v_before_at timestamp with time zone;
  v_kind      text;
  v_row       jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_cast_id is null or p_biz_date is null then raise exception 'invalid_input'; end if;
  if p_punch_id is null and p_after_at is null then raise exception 'invalid_input'; end if;           -- ★2: 新規申請で削除は無い（shape_ck と同じ）
  if length(trim(coalesce(p_reason, ''))) not between 1 and 200 then raise exception 'reason required'; end if;   -- ★2（294-2＝staff_shift_cancel の形・上限は reason_ck）
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  v_self := coalesce(public.auth_cast_id() = p_cast_id, false);                                        -- ★2: cast 本人・staff 本人（要裁定(11)）
  v_mgr  := (public.auth_role() = 'owner'
             or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id()));         -- ★2: punch_proxy と同じ判定
  if not (v_self or v_mgr) then raise exception 'forbidden'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if p_punch_id is not null then
    select * into v_punch from public.punches where id = p_punch_id;
    if v_punch.id is null or v_punch.cast_id <> p_cast_id then raise exception 'punch not found'; end if;
    v_before_at := v_punch.punched_at;
    v_kind      := v_punch.type;
    if p_kind is not null and p_kind <> v_kind then raise exception 'bad type'; end if;
    if public.biz_date_of(v_cast.store_id, v_before_at) <> p_biz_date then raise exception 'out of biz window'; end if;   -- ★2: 営業日窓（要裁定(10)）
  else
    if p_kind is null or p_kind not in ('in','out') then raise exception 'bad type'; end if;
    v_kind := p_kind;
  end if;
  if p_after_at is not null and public.biz_date_of(v_cast.store_id, p_after_at) <> p_biz_date then
    raise exception 'out of biz window';                                                                -- ★2: 営業日窓（294-2）
  end if;
  if exists (select 1 from public.payroll_runs r, lateral public.period_bounds(r.period) pb
              where r.store_id = v_cast.store_id and r.status in ('finalized','paid')
                and p_biz_date between coalesce(r.period_start, pb.period_start) and coalesce(r.period_end, pb.period_end)) then
    raise exception 'period finalized';                                                                 -- ★2（294-2）
  end if;
  insert into public.punch_corrections (org_id, store_id, cast_id, punch_id, biz_date, kind, before_at, after_at, reason, requested_by,
                                        decided_by, decided_at, decision)
  values (v_cast.org_id, v_cast.store_id, p_cast_id, p_punch_id, p_biz_date, v_kind, v_before_at, p_after_at, trim(p_reason), v_actor,
          case when v_mgr then v_actor end, case when v_mgr then now() end, case when v_mgr then 'approved' else 'pending' end)   -- ★2: owner／manager＝申請＝確定・1 行
  returning id into v_id;
  if v_mgr then perform public.punch_correction_apply(v_id, p_reason); end if;                           -- ★2: 同 tx で punches へ
  select to_jsonb(pc) into v_row from public.punch_corrections pc where pc.id = v_id;
  perform public.audit_log_write('punch_correction_request', 'punch_corrections:' || v_id::text,
    null, v_row, v_cast.store_id, p_reason);                                                            -- ★2: 6 引数形
  return v_id;
end $function$;

revoke all on function public.punch_correction_request(uuid, uuid, date, text, timestamp with time zone, text)
  from public, anon;
grant execute on function public.punch_correction_request(uuid, uuid, date, text, timestamp with time zone, text)
  to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★3 punch_correction_decide（裁定294-3）＝ staff_shift_cancel／payroll_adjustment_delete の写経
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.punch_correction_decide(p_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.punch_corrections%rowtype;
  v_actor  uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_id is null or p_approve is null then raise exception 'invalid_input'; end if;
  select * into r from public.punch_corrections where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and r.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  if r.decision <> 'pending' then raise exception 'not pending'; end if;
  if not p_approve and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason required'; end if;   -- ★3: rejected は理由必須（294-3・置き場は要裁定(1)）
  if p_approve and exists (select 1 from public.payroll_runs pr, lateral public.period_bounds(pr.period) pb
              where pr.store_id = r.store_id and pr.status in ('finalized','paid')
                and r.biz_date between coalesce(pr.period_start, pb.period_start) and coalesce(pr.period_end, pb.period_end)) then
    raise exception 'period finalized';                                                                 -- ★3: 申請後に確定した期は承認できない
  end if;
  v_before := to_jsonb(r);
  update public.punch_corrections
     set decision = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_actor, decided_at = now(),
         decide_reason = nullif(trim(coalesce(p_reason, '')), '')                                       -- ★3（裁定295-1）: rejected は上の検査で必須・approved は任意
   where id = p_id;
  if p_approve then perform public.punch_correction_apply(p_id, p_reason); end if;                     -- ★3: punches を update／insert／delete
  select to_jsonb(pc) into v_after from public.punch_corrections pc where pc.id = p_id;
  perform public.audit_log_write('punch_correction_decide', 'punch_corrections:' || p_id::text,
    v_before, v_after, r.store_id, p_reason);                                                           -- ★3: 理由つき 6 引数の型
  return p_id;
end $function$;

revoke all on function public.punch_correction_decide(uuid, boolean, text) from public, anon;
grant execute on function public.punch_correction_decide(uuid, boolean, text) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★4 punch_correction_ack（裁定294-4）＝ punch_self／shift_open_periods_mine の actor 行・本人のみ
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.punch_correction_ack(p_id uuid, p_ack text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.punch_corrections%rowtype;
  v_cast   uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;
  if p_ack is null or p_ack not in ('confirmed','disputed') then raise exception 'bad ack'; end if;
  select * into r from public.punch_corrections where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.cast_id <> v_cast then raise exception 'forbidden'; end if;                                     -- ★4: 本人のみ（294-4）
  if r.decision = 'pending' then raise exception 'not decided'; end if;                                 -- ★4（要裁定(7)）
  v_before := to_jsonb(r);
  update public.punch_corrections set ack = p_ack, ack_at = now() where id = p_id;
  select to_jsonb(pc) into v_after from public.punch_corrections pc where pc.id = p_id;
  perform public.audit_log_write('punch_correction_ack', 'punch_corrections:' || p_id::text, v_before, v_after, r.store_id);
  return p_id;
end $function$;

revoke all on function public.punch_correction_ack(uuid, text) from public, anon;
grant execute on function public.punch_correction_ack(uuid, text) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★5 set_cast_plan（裁定294-5）＝ live 全文の機械写経＋白名単 3 キー・型分岐・employment 検査
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb, p_valid_from date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_key         text;
  v_num         numeric;
  v_cur_from    date;  -- ★mig0116: 現在行の valid_from
  v_emp         text;  -- ★5 0154: casts.employment（'委託'|'雇用'|null）
  v_rule        text;  -- ★5 0154: pay_rule（欠損＝'actual'）
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack',
                     'honBackMode','honBackRate','jonaiBackMode','jonaiBackRate',   -- ★5 0154: 末尾 ') then' → ','（3 キーを続ける）
                     'pay_rule','per_shift_amount','fixed_amount') then              -- ★5 0154: 裁定294-5 の 3 キー
      raise exception 'bad overrides';
    end if;
    if v_key in ('honBackMode','jonaiBackMode') then
      -- ★mig0086: 方式キーは文字列2値
      if jsonb_typeof(p_overrides -> v_key) <> 'string'
         or (p_overrides ->> v_key) not in ('per_count','rate') then
        raise exception 'bad overrides';
      end if;
    elsif v_key = 'pay_rule' then                                                     -- ★5 0154: 報酬型キーは文字列 4 値（honBackMode と同型）
      if jsonb_typeof(p_overrides -> v_key) <> 'string'                                -- ★5
         or (p_overrides ->> v_key) not in ('actual','shift_guarantee','fixed','per_shift') then   -- ★5
        raise exception 'bad overrides';                                                -- ★5
      end if;                                                                           -- ★5
    else
      if jsonb_typeof(p_overrides -> v_key) <> 'number' then raise exception 'bad overrides'; end if;
      v_num := (p_overrides ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad overrides'; end if;
      -- ★mig0086: 率キーは 0..100
      if v_key in ('honBackRate','jonaiBackRate') and v_num > 100 then
        raise exception 'bad overrides';
      end if;
    end if;
  end loop;
  -- ★mig0086: 原子性（設計v1）＝mode だけ上書きして値が plan 側から来る合成を拒否。
  --   mode='rate' → rate 必須／mode='per_count' → 円/本値必須／rate 単独（mode なし・mode≠rate）拒否。
  if (p_overrides ? 'honBackMode') then
    if (p_overrides ->> 'honBackMode') = 'rate' and not (p_overrides ? 'honBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'honBackMode') = 'per_count' and not (p_overrides ? 'honBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'honBackRate')
     and (not (p_overrides ? 'honBackMode') or (p_overrides ->> 'honBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  if (p_overrides ? 'jonaiBackMode') then
    if (p_overrides ->> 'jonaiBackMode') = 'rate' and not (p_overrides ? 'jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'jonaiBackMode') = 'per_count' and not (p_overrides ? 'jonaiBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'jonaiBackRate')
     and (not (p_overrides ? 'jonaiBackMode') or (p_overrides ->> 'jonaiBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id, employment into v_cast_org, v_cast_store, v_emp from public.casts where id = p_cast_id;   -- ★5 0154: employment を併読
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- plan の org/store 照合＋inactive 遮断（廃止プランへの新規割当は誤操作経路）
  -- 既存の cast_plan 行には触れない＝プラン廃止（is_active=false）で既割当は壊れない設計。
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = p_plan_id;
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;
  -- ★5 0154（裁定294-5）: 報酬型 × 雇用区分（shift_guarantee／fixed＝雇用のみ・per_shift＝委託のみ・欠損＝'actual'＝検査なし）
  v_rule := coalesce(p_overrides ->> 'pay_rule', 'actual');                                                                 -- ★5
  if v_rule in ('shift_guarantee','fixed') and v_emp is distinct from '雇用' then raise exception 'bad pay_rule for employment'; end if;   -- ★5
  if v_rule = 'per_shift' and v_emp is distinct from '委託' then raise exception 'bad pay_rule for employment'; end if;                    -- ★5

  select to_jsonb(cp) into v_before from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;

  if p_valid_from is null then
    -- ★mig0114/0116: null＝現在行の上書き（0114 と同値の経路・完全互換）
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
    values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
    on conflict (cast_id) where valid_to is null do update
      set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
          store_id = excluded.store_id;
  else
    -- ★mig0116（裁定96-④）: 履歴生成。過去日と現在行 valid_from 以前を拒否
    if p_valid_from < current_date then raise exception 'bad valid_from'; end if;
    v_cur_from := null;
    select cp.valid_from into v_cur_from from public.cast_plan cp
     where cp.cast_id = p_cast_id and cp.valid_to is null;
    if v_cur_from is not null then
      if p_valid_from <= v_cur_from then raise exception 'bad valid_from'; end if;
      update public.cast_plan
         set valid_to = p_valid_from - 1, updated_at = now()
       where cast_id = p_cast_id and valid_to is null;
    end if;
    insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json, valid_from)
    values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides, p_valid_from);
  end if;

  select to_jsonb(cp) into v_after from public.cast_plan cp
   where cp.cast_id = p_cast_id and cp.valid_to is null;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

revoke all on function public.set_cast_plan(uuid, uuid, jsonb, date)
  from public, anon;
grant execute on function public.set_cast_plan(uuid, uuid, jsonb, date)
  to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★6 payroll_adjustments 列 +2・source CHECK 4 値・payroll_adjustment_add 署名 +3（裁定294-6）
-- ══════════════════════════════════════════════════════════════
alter table public.payroll_adjustments add column if not exists basis text;                                                     -- ★6: 根拠（settlement／sanction は必須）
alter table public.payroll_adjustments add column if not exists target_shift_id uuid references public.shifts(id) on delete set null;   -- ★6: 対象シフト（任意）
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_source_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_source_ck
  check (source in ('manual','carryover','settlement','sanction'));                                                            -- ★6: 0148 の 2 値 → 4 値
alter table public.payroll_adjustments drop constraint if exists payroll_adjustments_basis_ck;
alter table public.payroll_adjustments add constraint payroll_adjustments_basis_ck
  check (source not in ('settlement','sanction') or length(trim(coalesce(basis, ''))) between 1 and 200);                      -- ★6: basis 必須（reason_ck と同型）
create index if not exists payroll_adjustments_target_shift_idx on public.payroll_adjustments(target_shift_id);

drop function if exists public.payroll_adjustment_add(uuid, uuid, text, integer, integer, boolean, boolean, text);            -- ★6: 旧 8 引数（同名の多重定義を残さない）

CREATE OR REPLACE FUNCTION public.payroll_adjustment_add(p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text, p_source text DEFAULT 'manual'::text, p_basis text DEFAULT NULL::text, p_target_shift_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := auth_org_id();
  v_role    text := auth_role();
  v_actor   uuid;
  v_store   uuid;
  v_status  text;
  v_cast_st uuid;
  v_id      uuid;
  v_period  text;   -- ★6 0154: run の period（直近 3 期の境界）
  v_emp     text;   -- ★6 0154: casts.employment
  v_gross   bigint; -- ★6 0154: gross 合計（平均賃金の分子）→ 当期 gross
  v_days    int;    -- ★6 0154: 暦日数（平均賃金の分母）
  v_avg     int;    -- ★6 0154: 平均賃金（floor）
  v_sum     int;    -- ★6 0154: 当期の sanction 合計
begin
  if v_org is null then
    raise exception 'forbidden';
  end if;
  if v_role is null or v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'forbidden';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason required';
  end if;
  if p_mode is null or p_mode not in ('fixed','rate') then
    raise exception 'bad mode';
  end if;
  if p_mode = 'fixed' and (p_amount is null or p_amount < 0 or p_rate_bp is not null) then
    raise exception 'bad amount';
  end if;
  if p_mode = 'rate' and (p_rate_bp is null or p_rate_bp < 0 or p_rate_bp > 10000 or p_amount is not null) then
    raise exception 'bad amount';
  end if;
  if p_source is null or p_source not in ('manual','settlement','sanction') then                       -- ★6 0154（裁定294-6）: carryover は payroll_carryover_sync 専用
    raise exception 'bad source';                                                                       -- ★6
  end if;                                                                                               -- ★6
  if p_source in ('settlement','sanction') and (p_basis is null or length(trim(p_basis)) not between 1 and 200) then   -- ★6: basis 必須
    raise exception 'basis required';                                                                   -- ★6
  end if;                                                                                               -- ★6
  if p_target_shift_id is not null and not exists (select 1 from public.shifts s where s.id = p_target_shift_id and s.cast_id = p_cast_id) then   -- ★6
    raise exception 'shift not found';                                                                  -- ★6
  end if;                                                                                               -- ★6

  select store_id, status, period into v_store, v_status, v_period                                     -- ★6 0154: period を併読
    from payroll_runs where id = p_run_id and org_id = v_org;
  if not found then
    raise exception 'run not found';
  end if;
  if v_role = 'manager' and v_store is distinct from auth_store_id() then
    raise exception 'forbidden';
  end if;
  if v_status <> 'draft' then
    raise exception 'run not draft';
  end if;

  select store_id, employment into v_cast_st, v_emp                                                    -- ★6 0154: employment を併読
    from casts where id = p_cast_id and org_id = v_org;
  if not found then
    raise exception 'cast not found';
  end if;
  if v_cast_st is distinct from v_store then
    raise exception 'cast store mismatch';
  end if;
  -- ★6 0154（裁定294-6）: settlement＝委託のみ・sanction＝雇用のみ＋労基法 91 条検査
  if p_source = 'settlement' and v_emp is distinct from '委託' then raise exception 'bad source for employment'; end if;   -- ★6
  if p_source = 'sanction' then                                                                         -- ★6
    if v_emp is distinct from '雇用' then raise exception 'bad source for employment'; end if;           -- ★6
    if p_mode <> 'fixed' then raise exception 'bad mode'; end if;                                       -- ★6: 1 件上限は額で比べる（要裁定(3)）
    -- ★6: 平均賃金＝直近 3 期（当期より前）の確定 payslip（finalized|paid）の gross 合計 ÷ 暦日数（calc_period_start／end・欠損は period_bounds）
    select coalesce(sum((ps.breakdown_json->'pay'->>'gross')::bigint), 0),                             -- ★6
           coalesce(sum(coalesce(ps.calc_period_end, pb.period_end) - coalesce(ps.calc_period_start, pb.period_start) + 1), 0)   -- ★6
      into v_gross, v_days                                                                              -- ★6
      from (select ps0.* from public.payslips ps0                                                       -- ★6
              join public.payroll_runs r0 on r0.id = ps0.run_id                                         -- ★6
             where ps0.cast_id = p_cast_id and r0.status in ('finalized','paid') and ps0.period < v_period   -- ★6
             order by ps0.period desc limit 3) ps,                                                      -- ★6
           lateral public.period_bounds(ps.period) pb;                                                  -- ★6
    if v_days = 0 then raise exception 'no basis for average wage'; end if;                             -- ★6（294-6）
    v_avg := floor(v_gross::numeric / v_days);                                                          -- ★6: 平均賃金（円未満切捨）
    if p_amount > v_avg / 2 then raise exception 'sanction cap'; end if;                                -- ★6: 1 件 ≦ floor(平均賃金/2)
    -- ★6: 当期 gross＝当 run の payslip（再確定前の凍結値）があればその pay.gross・無ければ平均賃金×当期暦日数（推計・要裁定(2)）
    select (ps.breakdown_json->'pay'->>'gross')::bigint into v_gross                                   -- ★6
      from public.payslips ps where ps.run_id = p_run_id and ps.cast_id = p_cast_id;                    -- ★6
    if v_gross is null then                                                                             -- ★6
      select v_avg::bigint * (coalesce(r.period_end, pb.period_end) - coalesce(r.period_start, pb.period_start) + 1) into v_gross   -- ★6
        from public.payroll_runs r, lateral public.period_bounds(r.period) pb where r.id = p_run_id;   -- ★6
    end if;                                                                                             -- ★6
    select coalesce(sum(a.amount), 0) into v_sum from public.payroll_adjustments a                      -- ★6
     where a.run_id = p_run_id and a.cast_id = p_cast_id and a.source = 'sanction';                     -- ★6
    if v_sum + p_amount > v_gross / 10 then raise exception 'sanction cap'; end if;                     -- ★6: 当期合計 ≦ floor(当期 gross/10)
  end if;                                                                                               -- ★6

  insert into payroll_adjustments(
    org_id, store_id, run_id, cast_id, mode, amount, rate_bp,
    before_withholding, show_detail, reason, created_by,                                              -- ★6 0154: 末尾 ')' → ','
    source, basis, target_shift_id)                                                                   -- ★6 0154: 列 +3
  values (
    v_org, v_store, p_run_id, p_cast_id, p_mode,
    case when p_mode = 'fixed' then p_amount else null end,
    case when p_mode = 'rate'  then p_rate_bp else null end,
    coalesce(p_before_withholding, true),
    coalesce(p_show_detail, true),
    p_reason, v_actor,                                                                                 -- ★6 0154: 末尾 ')' → ','
    p_source, nullif(trim(p_basis), ''), p_target_shift_id)                                            -- ★6 0154
  returning id into v_id;

  perform audit_log_write(
    'payroll_adjustment_add',
    'payroll_adjustments:' || v_id::text,
    null,
    jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id,
      'mode', p_mode, 'amount', p_amount, 'rate_bp', p_rate_bp,
      'before_withholding', coalesce(p_before_withholding, true),
      'show_detail', coalesce(p_show_detail, true),                                                   -- ★6 0154: 末尾 '),' → ','
      'source', p_source, 'basis', p_basis, 'target_shift_id', p_target_shift_id),                     -- ★6 0154
    v_store,
    p_reason);

  return v_id;
end $function$;

revoke all on function public.payroll_adjustment_add(uuid,uuid,text,integer,integer,boolean,boolean,text,text,text,uuid) from public, anon;
grant execute on function public.payroll_adjustment_add(uuid,uuid,text,integer,integer,boolean,boolean,text,text,text,uuid) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★7 set_store_profile（裁定294-7）＝ live 全文（0151 適用後）の機械写経＋白名単 'settlement_presets'・検証ブロック
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_store_profile(p_store_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_store    record;
  v_keys     text[] := array['name','short','ext_shimei_enabled','dohan_auto_hon',
                             'store_code','display_name','show_open_status','shift_cast_confirm',   -- ★1 0147: 末尾 '];' → ','（12 キーを続ける）
                             'biz_type','billing_mode','setup_done',                                  -- ★1 0147: 裁定269-1 の 12 キー（enum 2・bool 10）
                             'sys_hourly','sys_backs','sys_sales_rate','sys_points','sys_sales_slide',   -- ★1
                             'sys_point_slide','sys_norms','sys_penalties','sys_bonus',                   -- ★1（0151 ★4: 末尾 '];' → ','）
                             'slide_apply',                                                               -- ★4 0151: 裁定287-4 の 1 キー（0154 ★7: 末尾 '];' → ','）
                             'settlement_presets'];                                                       -- ★7 0154: 裁定294-7 の 1 キー
  v_k        text;
  v_before   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_name     text;
  v_short    text;
  v_code     text;
  v_disp     text;
  v_ext      boolean;
  v_dohan    boolean;
  v_open     boolean;
  v_confirm  boolean;
  v_settings jsonb;
  v_biz      text;      -- ★2 0147: biz_type（enum text 5 値）
  v_bill     text;      -- ★3 0147: billing_mode（enum text 3 値）
  v_setup_done boolean;   -- ★4 0147: setup_done（show_open_status と同型）
  v_s_hourly boolean;   -- ★4 0147: sys_hourly（show_open_status と同型）
  v_s_backs  boolean;   -- ★4 0147: sys_backs（show_open_status と同型）
  v_s_sales_rate boolean;   -- ★4 0147: sys_sales_rate（show_open_status と同型）
  v_s_points boolean;   -- ★4 0147: sys_points（show_open_status と同型）
  v_s_sales_slide boolean;   -- ★4 0147: sys_sales_slide（show_open_status と同型）
  v_s_point_slide boolean;   -- ★4 0147: sys_point_slide（show_open_status と同型）
  v_s_norms  boolean;   -- ★4 0147: sys_norms（show_open_status と同型）
  v_s_penalties boolean;   -- ★4 0147: sys_penalties（show_open_status と同型）
  v_s_bonus  boolean;   -- ★4 0147: sys_bonus（show_open_status と同型）
  v_slide    text;      -- ★4 0151: slide_apply（enum text 2 値・biz_type と同型）
  v_presets  jsonb;     -- ★7 0154: settlement_presets（配列・最大 10）
  v_pe       jsonb;     -- ★7 0154: settlement_presets の要素
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;   -- 店ポリシー＝owner 限定（cast_register と同格）
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch = '{}'::jsonb then raise exception 'bad patch'; end if;

  select id, org_id, name, short, ext_shimei_enabled, dohan_auto_hon, settings_json
    into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  -- 白名単外のキーは黙って無視せず拒否
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any(v_keys)) then raise exception 'bad key'; end if;
  end loop;

  v_settings := coalesce(v_store.settings_json, '{}'::jsonb);

  -- ── 列側 ────────────────────────────────────────────────
  if p_patch ? 'name' then
    if jsonb_typeof(p_patch->'name') <> 'string' then raise exception 'bad type'; end if;
    v_name := trim(p_patch->>'name');
    if length(v_name) < 1 or length(v_name) > 50 then raise exception 'bad name'; end if;
    v_before := v_before || jsonb_build_object('name', v_store.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;

  if p_patch ? 'short' then
    if jsonb_typeof(p_patch->'short') <> 'string' then raise exception 'bad type'; end if;
    v_short := trim(p_patch->>'short');
    if length(v_short) > 20 then raise exception 'bad short'; end if;
    if v_short = '' then v_short := null; end if;   -- 空欄は null（列は null 可）
    v_before := v_before || jsonb_build_object('short', v_store.short);
    v_after  := v_after  || jsonb_build_object('short', v_short);
  end if;

  if p_patch ? 'ext_shimei_enabled' then
    if jsonb_typeof(p_patch->'ext_shimei_enabled') <> 'boolean' then raise exception 'bad type'; end if;
    v_ext := (p_patch->>'ext_shimei_enabled')::boolean;
    v_before := v_before || jsonb_build_object('ext_shimei_enabled', v_store.ext_shimei_enabled);
    v_after  := v_after  || jsonb_build_object('ext_shimei_enabled', v_ext);
  end if;

  if p_patch ? 'dohan_auto_hon' then
    if jsonb_typeof(p_patch->'dohan_auto_hon') <> 'boolean' then raise exception 'bad type'; end if;
    v_dohan := (p_patch->>'dohan_auto_hon')::boolean;
    v_before := v_before || jsonb_build_object('dohan_auto_hon', v_store.dohan_auto_hon);
    v_after  := v_after  || jsonb_build_object('dohan_auto_hon', v_dohan);
  end if;

  -- ── settings_json 側 ───────────────────────────────────
  if p_patch ? 'store_code' then
    if jsonb_typeof(p_patch->'store_code') <> 'string' then raise exception 'bad type'; end if;
    v_code := trim(p_patch->>'store_code');
    if length(v_code) > 20 then raise exception 'bad store_code'; end if;
    v_before   := v_before || jsonb_build_object('store_code', coalesce(v_settings->>'store_code', ''));
    v_after    := v_after  || jsonb_build_object('store_code', v_code);
    v_settings := jsonb_set(v_settings, '{store_code}', to_jsonb(v_code), true);
  end if;

  if p_patch ? 'display_name' then
    if jsonb_typeof(p_patch->'display_name') <> 'string' then raise exception 'bad type'; end if;
    v_disp := trim(p_patch->>'display_name');
    if length(v_disp) > 50 then raise exception 'bad display_name'; end if;
    v_before   := v_before || jsonb_build_object('display_name', coalesce(v_settings->>'display_name', ''));
    v_after    := v_after  || jsonb_build_object('display_name', v_disp);
    v_settings := jsonb_set(v_settings, '{display_name}', to_jsonb(v_disp), true);
  end if;

  if p_patch ? 'show_open_status' then
    if jsonb_typeof(p_patch->'show_open_status') <> 'boolean' then raise exception 'bad type'; end if;
    v_open := (p_patch->>'show_open_status')::boolean;
    v_before   := v_before || jsonb_build_object('show_open_status',
                    coalesce(v_settings->>'show_open_status', '') = 'true');
    v_after    := v_after  || jsonb_build_object('show_open_status', v_open);
    v_settings := jsonb_set(v_settings, '{show_open_status}', to_jsonb(v_open), true);
  end if;

  if p_patch ? 'shift_cast_confirm' then
    if jsonb_typeof(p_patch->'shift_cast_confirm') <> 'boolean' then raise exception 'bad type'; end if;
    v_confirm := (p_patch->>'shift_cast_confirm')::boolean;
    v_before   := v_before || jsonb_build_object('shift_cast_confirm',
                    coalesce(v_settings->>'shift_cast_confirm', '') = 'true');
    v_after    := v_after  || jsonb_build_object('shift_cast_confirm', v_confirm);
    v_settings := jsonb_set(v_settings, '{shift_cast_confirm}', to_jsonb(v_confirm), true);
  end if;

  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────
  if p_patch ? 'biz_type' then                                                                             -- ★2 0147
    if jsonb_typeof(p_patch->'biz_type') <> 'string' then raise exception 'bad type'; end if;              -- ★2（text 4 キーの行型を写経）
    v_biz := p_patch->>'biz_type';                                                                         -- ★2
    if v_biz is null or v_biz not in ('cabaret','girlsbar','snack','lounge','bar') then raise exception 'bad biz_type'; end if;  -- ★2（mig0042:92 set_store_norm_config の not in (...) を写経）
    v_before   := v_before || jsonb_build_object('biz_type', coalesce(v_settings->>'biz_type', ''));       -- ★2
    v_after    := v_after  || jsonb_build_object('biz_type', v_biz);                                       -- ★2
    v_settings := jsonb_set(v_settings, '{biz_type}', to_jsonb(v_biz), true);                              -- ★2
  end if;                                                                                                  -- ★2

  if p_patch ? 'billing_mode' then                                                                         -- ★3 0147
    if jsonb_typeof(p_patch->'billing_mode') <> 'string' then raise exception 'bad type'; end if;          -- ★3（text 4 キーの行型を写経）
    v_bill := p_patch->>'billing_mode';                                                                    -- ★3
    if v_bill is null or v_bill not in ('table','individual','mixed') then raise exception 'bad billing_mode'; end if;  -- ★3（mig0042:92 写経・'bad billing_mode'）
    v_before   := v_before || jsonb_build_object('billing_mode', coalesce(v_settings->>'billing_mode', '')); -- ★3
    v_after    := v_after  || jsonb_build_object('billing_mode', v_bill);                                  -- ★3
    v_settings := jsonb_set(v_settings, '{billing_mode}', to_jsonb(v_bill), true);                         -- ★3
  end if;                                                                                                  -- ★3

  if p_patch ? 'setup_done' then                                                                               -- ★4 0147: setup_done（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'setup_done') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_setup_done := (p_patch->>'setup_done')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('setup_done',                                                  -- ★4
                    coalesce(v_settings->>'setup_done', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('setup_done', v_setup_done);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{setup_done}', to_jsonb(v_setup_done), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_hourly' then                                                                               -- ★4 0147: sys_hourly（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_hourly') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_hourly := (p_patch->>'sys_hourly')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_hourly',                                                  -- ★4
                    coalesce(v_settings->>'sys_hourly', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_hourly', v_s_hourly);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_hourly}', to_jsonb(v_s_hourly), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_backs' then                                                                               -- ★4 0147: sys_backs（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_backs') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_backs := (p_patch->>'sys_backs')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_backs',                                                  -- ★4
                    coalesce(v_settings->>'sys_backs', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_backs', v_s_backs);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_backs}', to_jsonb(v_s_backs), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_rate' then                                                                               -- ★4 0147: sys_sales_rate（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_rate') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_rate := (p_patch->>'sys_sales_rate')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_rate',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_rate', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_rate', v_s_sales_rate);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_rate}', to_jsonb(v_s_sales_rate), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_points' then                                                                               -- ★4 0147: sys_points（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_points') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_points := (p_patch->>'sys_points')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_points',                                                  -- ★4
                    coalesce(v_settings->>'sys_points', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_points', v_s_points);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_points}', to_jsonb(v_s_points), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_sales_slide' then                                                                               -- ★4 0147: sys_sales_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_sales_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_sales_slide := (p_patch->>'sys_sales_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_sales_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_sales_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_sales_slide', v_s_sales_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_sales_slide}', to_jsonb(v_s_sales_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_point_slide' then                                                                               -- ★4 0147: sys_point_slide（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_point_slide') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_point_slide := (p_patch->>'sys_point_slide')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_point_slide',                                                  -- ★4
                    coalesce(v_settings->>'sys_point_slide', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_point_slide', v_s_point_slide);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_point_slide}', to_jsonb(v_s_point_slide), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_norms' then                                                                               -- ★4 0147: sys_norms（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_norms') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_norms := (p_patch->>'sys_norms')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_norms',                                                  -- ★4
                    coalesce(v_settings->>'sys_norms', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_norms', v_s_norms);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_norms}', to_jsonb(v_s_norms), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_penalties' then                                                                               -- ★4 0147: sys_penalties（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_penalties') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_penalties := (p_patch->>'sys_penalties')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_penalties',                                                  -- ★4
                    coalesce(v_settings->>'sys_penalties', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_penalties', v_s_penalties);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_penalties}', to_jsonb(v_s_penalties), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'sys_bonus' then                                                                               -- ★4 0147: sys_bonus（show_open_status の 4 行型を写経）
    if jsonb_typeof(p_patch->'sys_bonus') <> 'boolean' then raise exception 'bad type'; end if;                -- ★4
    v_s_bonus := (p_patch->>'sys_bonus')::boolean;                                                                 -- ★4
    v_before   := v_before || jsonb_build_object('sys_bonus',                                                  -- ★4
                    coalesce(v_settings->>'sys_bonus', '') = 'true');                                          -- ★4
    v_after    := v_after  || jsonb_build_object('sys_bonus', v_s_bonus);                                           -- ★4
    v_settings := jsonb_set(v_settings, '{sys_bonus}', to_jsonb(v_s_bonus), true);                                  -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'slide_apply' then                                                                          -- ★4 0151（裁定287-4）: biz_type ブロックと同型
    if jsonb_typeof(p_patch->'slide_apply') <> 'string' then raise exception 'bad type'; end if;           -- ★4
    v_slide := p_patch->>'slide_apply';                                                                    -- ★4
    if v_slide is null or v_slide not in ('next','current') then raise exception 'bad slide_apply'; end if; -- ★4（'bad biz_type' と同型）
    v_before   := v_before || jsonb_build_object('slide_apply', coalesce(v_settings->>'slide_apply', ''));  -- ★4
    v_after    := v_after  || jsonb_build_object('slide_apply', v_slide);                                  -- ★4
    v_settings := jsonb_set(v_settings, '{slide_apply}', to_jsonb(v_slide), true);                         -- ★4
  end if;                                                                                                  -- ★4

  if p_patch ? 'settlement_presets' then                                                                   -- ★7 0154（裁定294-7）: 配列・最大 10・要素 {code,name,amount,basis,target}
    v_presets := p_patch->'settlement_presets';                                                            -- ★7
    if jsonb_typeof(v_presets) <> 'array' or jsonb_array_length(v_presets) > 10 then raise exception 'bad type'; end if;   -- ★7
    for v_pe in select e from jsonb_array_elements(v_presets) e loop                                       -- ★7
      if jsonb_typeof(v_pe) <> 'object'                                                                    -- ★7
         or coalesce(jsonb_typeof(v_pe->'code'), '') <> 'string' or length(trim(v_pe->>'code')) = 0       -- ★7: 欠損（null）も拒否
         or coalesce(jsonb_typeof(v_pe->'name'), '') <> 'string'                                           -- ★7
         or coalesce(jsonb_typeof(v_pe->'amount'), '') <> 'number'                                         -- ★7
         or (v_pe->>'amount')::numeric < 0 or (v_pe->>'amount')::numeric <> trunc((v_pe->>'amount')::numeric)   -- ★7: 整数 ≥0
         or coalesce(jsonb_typeof(v_pe->'basis'), '') <> 'string'                                          -- ★7
         or coalesce(jsonb_typeof(v_pe->'target'), '') <> 'string'                                         -- ★7
         or (v_pe->>'target') not in ('late','absent','early','other') then                                -- ★7
        raise exception 'bad type';                                                                        -- ★7
      end if;                                                                                              -- ★7
    end loop;                                                                                              -- ★7
    v_before   := v_before || jsonb_build_object('settlement_presets', coalesce(v_settings->'settlement_presets', '[]'::jsonb));   -- ★7
    v_after    := v_after  || jsonb_build_object('settlement_presets', v_presets);                         -- ★7
    v_settings := jsonb_set(v_settings, '{settlement_presets}', v_presets, true);                          -- ★7
  end if;                                                                                                  -- ★7

  -- ── 1 回で書く（patch に無い列は現値のまま） ──────────
  update public.stores set
    name               = case when p_patch ? 'name'               then v_name  else name end,
    short              = case when p_patch ? 'short'              then v_short else short end,
    ext_shimei_enabled = case when p_patch ? 'ext_shimei_enabled' then v_ext    else ext_shimei_enabled end,
    dohan_auto_hon     = case when p_patch ? 'dohan_auto_hon'     then v_dohan  else dohan_auto_hon end,
    settings_json      = v_settings
  where id = p_store_id;

  perform public.audit_log_write('set_store_profile', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

revoke execute on function public.set_store_profile(uuid, jsonb) from public, anon;
grant  execute on function public.set_store_profile(uuid, jsonb) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ★8 payslips.calc_period_start／calc_period_end（裁定294-8）＋埋め戻し＋ payroll_finalize（live 全文の機械写経＋insert 列 +2・形検査 +1）
-- ══════════════════════════════════════════════════════════════
alter table public.payslips add column if not exists calc_period_start date;                                                    -- ★8
alter table public.payslips add column if not exists calc_period_end   date;                                                    -- ★8
update public.payslips ps
   set calc_period_start = coalesce(r.period_start, pb.period_start),
       calc_period_end   = coalesce(r.period_end,   pb.period_end)
  from public.payroll_runs r, lateral public.period_bounds(r.period) pb
 where r.id = ps.run_id and ps.calc_period_start is null;                                                                       -- ★8: 既存行＝run の period で埋め戻し
alter table public.payslips drop constraint if exists payslips_calc_period_ck;
alter table public.payslips add constraint payslips_calc_period_ck
  check (calc_period_start is null or calc_period_end is null or calc_period_end >= calc_period_start);                       -- ★8（payroll_runs_check と同型）

CREATE OR REPLACE FUNCTION public.payroll_finalize(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_payslips jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid;
  v_store   uuid;
  v_period  text;
  v_status  text;
  v_idem    uuid;
  v_old_ps  date;
  v_old_pe  date;
  v_new_ps  date;
  v_new_pe  date;
  v_retired jsonb;
  v_count   int;
  v_next    text;      -- 繰越先 period（翌月）
  v_ps      jsonb;     -- payslip 要素
  v_arrec   jsonb;     -- 退避 breakdown.ar の1要素（巻き戻し用）
  v_advrec  jsonb;     -- 退避 breakdown.adv の1要素（巻き戻し用・F2e-2）
  v_okrec   jsonb;     -- 退避 breakdown.okuri の1要素（巻き戻し用・F2e-2）
  v_ar      jsonb;     -- 適用 ar 記録（凍結 breakdown へ注入）
  v_advarr  jsonb;     -- 適用 adv 記録（F2e-2）
  v_okarr   jsonb;     -- 適用 okuri 記録（F2e-2）
  v_arentry jsonb;     -- ar_deducted/ar_carried の1要素
  v_adentry jsonb;     -- adv_deducted/adv_carried の1要素（F2e-2）
  v_okentry jsonb;     -- okuri_deducted の1要素（F2e-2）
  v_cast    uuid;      -- payslip の cast_id（casts 照合済み）
  v_rid     uuid;      -- receivable id
  v_aid     uuid;      -- advance id（F2e-2）
  v_tid     uuid;      -- transport id（F2e-2）
  v_amt     int;       -- deducted 額
  v_recv    record;    -- receivable 現行行
  v_adv     record;    -- advance 現行行（F2e-2）
  v_tr      record;    -- transport 現行行（F2e-2）
  v_full    boolean;   -- 全額天引きか
  v_bd      jsonb;     -- 凍結 breakdown（ar/adv/okuri 注入後）
  v_applied     jsonb; -- audit: 適用 receivable 遷移
  v_applied_adv jsonb; -- audit: 適用 advance 遷移（F2e-2）
  v_applied_ok  jsonb; -- audit: 適用 transport 遷移（F2e-2）
  v_rolled      jsonb; -- audit: 巻き戻し receivable
  v_rolled_adv  jsonb; -- audit: 巻き戻し advance（F2e-2）
  v_rolled_ok   jsonb; -- audit: 巻き戻し transport（F2e-2）
begin
  -- run 取得＋org 照合（現行どおり）
  select org_id, store_id, period, status, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_period, v_status, v_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（現行どおり・replay は遷移も巻き戻しもしない＝二重実行防止のみ）
  if p_idem_key is not null and v_status = 'finalized' and v_idem is not distinct from p_idem_key then
    select count(*) into v_count from public.payslips where run_id = p_run_id;
    return v_count;
  end if;

  -- paid 後は再確定/差し替え不可（現行どおり・巻き戻し不可を含意）
  if v_status = 'paid' then raise exception 'run paid'; end if;

  -- 器の形式検証（現行どおり）
  if p_payslips is null or jsonb_typeof(p_payslips) <> 'array' then raise exception 'bad payslips'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payslips) e
    where e->>'cast_id' is null or e->>'net' is null
       or e->'breakdown'->'pay' is null
       or jsonb_typeof(e->'breakdown'->'extras') <> 'array'
  ) then raise exception 'bad payslip shape'; end if;
  -- 空配列拒否（現行どおり）
  if jsonb_array_length(p_payslips) = 0 then raise exception 'empty payslips'; end if;

  -- 差し替え前 breakdown_json を退避（現行どおり）
  select jsonb_agg(jsonb_build_object('cast_id', ps.cast_id, 'net', ps.net, 'breakdown', ps.breakdown_json))
    into v_retired from public.payslips ps where ps.run_id = p_run_id;

  -- 期間窓を単一ソース（現行どおり）
  select pb.period_start, pb.period_end into v_new_ps, v_new_pe from public.period_bounds(v_period) pb;
  -- ★8 0154（裁定294-8）: 計算期間（同名キー・欠損は run の期間）は run の期間内かつ逆転なし
  if exists (
    select 1 from jsonb_array_elements(p_payslips) e
    where coalesce((e->>'calc_period_start')::date, v_new_ps) < v_new_ps
       or coalesce((e->>'calc_period_end')::date, v_new_pe) > v_new_pe
       or coalesce((e->>'calc_period_start')::date, v_new_ps) > coalesce((e->>'calc_period_end')::date, v_new_pe)
  ) then raise exception 'bad calc period'; end if;                                                                             -- ★8

  -- (A) 繰越先 period（翌月）
  v_next := to_char((to_date(v_period || '-01', 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');

  -- (B) 巻き戻しフェーズ（再確定・未 paid）: 退避 payslip の breakdown.ar/.adv/.okuri を条件付き復元（drift は触らない）
  --   ── ar（receivables・mig0018 と一字一致）──
  v_rolled := '[]'::jsonb;
  for v_arrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'ar', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.receivables r
       set status = v_arrec->>'prev_status',
           deduct_period = nullif(v_arrec->>'prev_deduct_period', ''),
           deducted_amount = (v_arrec->>'prev_deducted_amount')::int
     where r.id = (v_arrec->>'receivable_id')::uuid
       and r.status = v_arrec->>'applied_status'
       and r.deducted_amount = (v_arrec->>'applied_deducted_amount')::int
       and r.deduct_period is not distinct from nullif(v_arrec->>'applied_deduct_period', '');
    if found then v_rolled := v_rolled || v_arrec; end if;
  end loop;
  --   ── adv（advances・ar と同型・F2e-2 追加）──
  v_rolled_adv := '[]'::jsonb;
  for v_advrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'adv', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.advances a
       set status = v_advrec->>'prev_status',
           deduct_period = nullif(v_advrec->>'prev_deduct_period', ''),
           deducted_amount = (v_advrec->>'prev_deducted_amount')::int
     where a.id = (v_advrec->>'advance_id')::uuid
       and a.status = v_advrec->>'applied_status'
       and a.deducted_amount = (v_advrec->>'applied_deducted_amount')::int
       and a.deduct_period is not distinct from nullif(v_advrec->>'applied_deduct_period', '');
    if found then v_rolled_adv := v_rolled_adv || v_advrec; end if;
  end loop;
  --   ── okuri（transport・繰越なし＝deduct_period 列なし・status/deducted_amount のみ・F2e-2 追加）──
  v_rolled_ok := '[]'::jsonb;
  for v_okrec in
    select ae from public.payslips ps,
      lateral jsonb_array_elements(coalesce(ps.breakdown_json->'okuri', '[]'::jsonb)) ae
    where ps.run_id = p_run_id
  loop
    update public.transport t
       set status = v_okrec->>'prev_status',
           deducted_amount = (v_okrec->>'prev_deducted_amount')::int
     where t.id = (v_okrec->>'transport_id')::uuid
       and t.status = v_okrec->>'applied_status'
       and t.deducted_amount = (v_okrec->>'applied_deducted_amount')::int;
    if found then v_rolled_ok := v_rolled_ok || v_okrec; end if;
  end loop;

  -- (C) 原子的差し替え（未 paid のみ）。delete 後 FOR ループで ar/adv/okuri 処理しつつ insert
  delete from public.payslips where run_id = p_run_id;
  v_count := 0;
  v_applied     := '[]'::jsonb;
  v_applied_adv := '[]'::jsonb;
  v_applied_ok  := '[]'::jsonb;
  for v_ps in select ae from lateral jsonb_array_elements(p_payslips) ae loop
    -- casts 照合（他 org/他店 cast 混入除去＝現行 join と同義・混入は落とす）
    select c.id into v_cast from public.casts c
      where c.id = (v_ps->>'cast_id')::uuid and c.org_id = v_org and c.store_id = v_store;
    if v_cast is null then continue; end if;
    v_ar     := '[]'::jsonb;
    v_advarr := '[]'::jsonb;
    v_okarr  := '[]'::jsonb;

    -- ═══ ar（receivables・mig0018 と一字一致）═══
    -- ar_deducted: {receivable_id, amount} を deducted_amount 加算・全額なら deducted・部分なら open+翌月繰越
    if jsonb_typeof(v_ps->'ar_deducted') = 'array' then
      for v_arentry in select ae from lateral jsonb_array_elements(v_ps->'ar_deducted') ae loop
        v_rid := (v_arentry->>'receivable_id')::uuid;
        v_amt := (v_arentry->>'amount')::int;
        select * into v_recv from public.receivables where id = v_rid for update;
        if v_recv.id is null or v_recv.org_id <> v_org or v_recv.cast_id is distinct from v_cast
           or v_recv.status <> 'open' or not v_recv.deduct_from_cast
           or v_amt <= 0 or v_recv.deducted_amount + v_amt > v_recv.amount - v_recv.collected_amount then  -- ★mig0092: 上限＝amount − collected_amount（現金回収済み分への天引き＝過消込を遮断）
          raise exception 'bad receivable';
        end if;
        v_full := (v_recv.deducted_amount + v_amt = v_recv.amount - v_recv.collected_amount);  -- ★mig0092: 完済判定も残高基準（deducted＋collected＝amount で 'deducted'）
        update public.receivables
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end,
               deduct_period = case when v_full then deduct_period else v_next end
         where id = v_rid;
        v_ar := v_ar || jsonb_build_object(
          'receivable_id', v_rid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_recv.status, 'prev_deduct_period', v_recv.deduct_period, 'prev_deducted_amount', v_recv.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deduct_period', case when v_full then v_recv.deduct_period else v_next end,
          'applied_deducted_amount', v_recv.deducted_amount + v_amt);
        v_applied := v_applied || jsonb_build_object('receivable_id', v_rid, 'amount', v_amt);
      end loop;
    end if;
    -- ar_carried: 引き当てゼロで deduct_period のみ翌月へ（amount 不変）
    if jsonb_typeof(v_ps->'ar_carried') = 'array' then
      for v_arentry in select ae from lateral jsonb_array_elements(v_ps->'ar_carried') ae loop
        v_rid := (v_arentry->>'receivable_id')::uuid;
        select * into v_recv from public.receivables where id = v_rid for update;
        if v_recv.id is null or v_recv.org_id <> v_org or v_recv.cast_id is distinct from v_cast
           or v_recv.status <> 'open' or not v_recv.deduct_from_cast then
          raise exception 'bad receivable';
        end if;
        v_ar := v_ar || jsonb_build_object(
          'receivable_id', v_rid, 'action', 'carried', 'amount', 0,
          'prev_status', v_recv.status, 'prev_deduct_period', v_recv.deduct_period, 'prev_deducted_amount', v_recv.deducted_amount,
          'applied_status', 'open', 'applied_deduct_period', v_next, 'applied_deducted_amount', v_recv.deducted_amount);
        update public.receivables set deduct_period = v_next where id = v_rid;
      end loop;
    end if;

    -- ═══ adv（advances・ar と同型・繰越あり・F2e-2 追加）═══
    if jsonb_typeof(v_ps->'adv_deducted') = 'array' then
      for v_adentry in select ae from lateral jsonb_array_elements(v_ps->'adv_deducted') ae loop
        v_aid := (v_adentry->>'advance_id')::uuid;
        v_amt := (v_adentry->>'amount')::int;
        select * into v_adv from public.advances where id = v_aid for update;
        if v_adv.id is null or v_adv.org_id <> v_org or v_adv.cast_id is distinct from v_cast
           or v_adv.status <> 'open'
           or v_amt <= 0 or v_adv.deducted_amount + v_amt > v_adv.amount then
          raise exception 'bad advance';
        end if;
        v_full := (v_adv.deducted_amount + v_amt = v_adv.amount);
        update public.advances
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end,
               deduct_period = case when v_full then deduct_period else v_next end
         where id = v_aid;
        v_advarr := v_advarr || jsonb_build_object(
          'advance_id', v_aid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_adv.status, 'prev_deduct_period', v_adv.deduct_period, 'prev_deducted_amount', v_adv.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deduct_period', case when v_full then v_adv.deduct_period else v_next end,
          'applied_deducted_amount', v_adv.deducted_amount + v_amt);
        v_applied_adv := v_applied_adv || jsonb_build_object('advance_id', v_aid, 'amount', v_amt);
      end loop;
    end if;
    if jsonb_typeof(v_ps->'adv_carried') = 'array' then
      for v_adentry in select ae from lateral jsonb_array_elements(v_ps->'adv_carried') ae loop
        v_aid := (v_adentry->>'advance_id')::uuid;
        select * into v_adv from public.advances where id = v_aid for update;
        if v_adv.id is null or v_adv.org_id <> v_org or v_adv.cast_id is distinct from v_cast
           or v_adv.status <> 'open' then
          raise exception 'bad advance';
        end if;
        v_advarr := v_advarr || jsonb_build_object(
          'advance_id', v_aid, 'action', 'carried', 'amount', 0,
          'prev_status', v_adv.status, 'prev_deduct_period', v_adv.deduct_period, 'prev_deducted_amount', v_adv.deducted_amount,
          'applied_status', 'open', 'applied_deduct_period', v_next, 'applied_deducted_amount', v_adv.deducted_amount);
        update public.advances set deduct_period = v_next where id = v_aid;
      end loop;
    end if;

    -- ═══ okuri（transport・繰越なし＝deduct_period なし・部分は open 据置・F2e-2 追加）═══
    if jsonb_typeof(v_ps->'okuri_deducted') = 'array' then
      for v_okentry in select ae from lateral jsonb_array_elements(v_ps->'okuri_deducted') ae loop
        v_tid := (v_okentry->>'transport_id')::uuid;
        v_amt := (v_okentry->>'amount')::int;
        select * into v_tr from public.transport where id = v_tid for update;
        if v_tr.id is null or v_tr.org_id <> v_org or v_tr.cast_id is distinct from v_cast
           or v_tr.status <> 'open'
           or v_amt <= 0 or v_tr.deducted_amount + v_amt > v_tr.amount then
          raise exception 'bad transport';
        end if;
        v_full := (v_tr.deducted_amount + v_amt = v_tr.amount);
        update public.transport
           set deducted_amount = deducted_amount + v_amt,
               status = case when v_full then 'deducted' else status end  -- 繰越なし＝部分は open 据置
         where id = v_tid;
        v_okarr := v_okarr || jsonb_build_object(
          'transport_id', v_tid, 'action', 'deducted', 'amount', v_amt,
          'prev_status', v_tr.status, 'prev_deducted_amount', v_tr.deducted_amount,
          'applied_status', case when v_full then 'deducted' else 'open' end,
          'applied_deducted_amount', v_tr.deducted_amount + v_amt);
        v_applied_ok := v_applied_ok || jsonb_build_object('transport_id', v_tid, 'amount', v_amt);
      end loop;
    end if;

    -- 凍結 breakdown = 入力 breakdown に ar/adv/okuri を注入
    v_bd := (v_ps->'breakdown') || jsonb_build_object('ar', v_ar, 'adv', v_advarr, 'okuri', v_okarr);
    insert into public.payslips (org_id, store_id, run_id, cast_id, period, breakdown_json, net,
                                 calc_period_start, calc_period_end)                                                          -- ★8 0154: 列 +2
    values (v_org, v_store, p_run_id, v_cast, v_period, v_bd, (v_ps->>'net')::int,
            coalesce((v_ps->>'calc_period_start')::date, v_new_ps),                                                           -- ★8: p_payslips の同名キーを写す・欠損は run の期間
            coalesce((v_ps->>'calc_period_end')::date, v_new_pe));                                                            -- ★8
    v_count := v_count + 1;
  end loop;

  -- run 更新（現行どおり）
  update public.payroll_runs
     set status = 'finalized', finalized_at = now(),
         finalize_idem_key = p_idem_key,
         period_start = v_new_ps, period_end = v_new_pe
   where id = p_run_id;

  -- (D) #6 service 経路監査: before に退避 breakdown＋旧窓＋巻き戻し(ar/adv/okuri)・after に新件数/新窓/idem＋適用(ar/adv/okuri)
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_finalize',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe,
                       'rolled_back_receivables', v_rolled,
                       'rolled_back_advances', v_rolled_adv,
                       'rolled_back_transport', v_rolled_ok),
    jsonb_build_object('cast_count', v_count, 'period_start', v_new_ps,
                       'period_end', v_new_pe, 'idem_key', p_idem_key,
                       'applied_receivables', v_applied,
                       'applied_advances', v_applied_adv,
                       'applied_transport', v_applied_ok),
    v_store);
  return v_count;
end $function$;

revoke all on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;   -- ★10: service_role 専任のまま（0092 と同じ）
grant execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) to service_role;

-- ══════════════════════════════════════════════════════════════
-- ★9 casts.employment_valid_from（裁定294-9）＋ set_cast_employment ＝ set_cast_plan 骨格の写経（owner のみ）
-- ══════════════════════════════════════════════════════════════
alter table public.casts add column if not exists employment_valid_from date;                                                  -- ★9: 既存行 null＝不定

CREATE OR REPLACE FUNCTION public.set_cast_employment(p_cast_id uuid, p_employment text, p_valid_from date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_before      jsonb;
  v_after       jsonb;
  v_last_end    date;   -- ★9: 自店で最後に確定した期の末日
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_employment is null or p_employment not in ('委託','雇用') then raise exception 'bad employment'; end if;   -- ★9（casts_employment_check と同じ 2 値）
  if p_valid_from is null or p_valid_from <> date_trunc('month', p_valid_from)::date then raise exception 'bad valid_from'; end if;   -- ★9: 給与期の初日のみ（要裁定(8)）
  -- cast の org 照合＋ロール判定（owner のみ＝294-9）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  select max(coalesce(r.period_end, pb.period_end)) into v_last_end
    from public.payroll_runs r, lateral public.period_bounds(r.period) pb
   where r.store_id = v_cast_store and r.status in ('finalized','paid');
  if v_last_end is not null and p_valid_from <= v_last_end then raise exception 'period finalized'; end if;   -- ★9: 最後に確定した期の翌日以降・過去分は付け替えない

  select to_jsonb(c) into v_before from public.casts c where c.id = p_cast_id;
  update public.casts
     set employment = p_employment, employment_valid_from = p_valid_from, updated_at = now()
   where id = p_cast_id;
  select to_jsonb(c) into v_after from public.casts c where c.id = p_cast_id;
  perform public.audit_log_write('set_cast_employment', 'casts:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

revoke all on function public.set_cast_employment(uuid, text, date)
  from public, anon;
grant execute on function public.set_cast_employment(uuid, text, date)
  to authenticated, service_role;

commit;

-- 貼付後の自己証明（先頭で実行した値と同じ・ロールバック時はここに来ない）:
-- select 'nox-project-proof', count(*) from public.orgs;                                                             -- 3
