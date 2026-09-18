-- docs/tmp/live_c1_rpc2.sql — mig0115（set_comp_plan v2）起草の底本＋C1-2 材料
-- 貼り先証明: {"t":"nox-project-proof","n":3} / 取得日 2026-08-28 / dev DB mig0001〜0114

-- ============ 1a. comp_plan_slide_check（set_comp_plan v2 が呼び続ける依存） ============
--   comp_plan_slide_check(jsonb)  secdef=false  acl={postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.comp_plan_slide_check(p_slide jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_len  int;
  v_i    int;
  v_elem jsonb;
  v_at   numeric;
  v_wage numeric;
  v_prev numeric := null;
begin
  if p_slide is null or jsonb_typeof(p_slide) <> 'array' then raise exception 'bad slide'; end if;
  v_len := jsonb_array_length(p_slide);
  if v_len > 3 then raise exception 'bad slide'; end if;
  for v_i in 0 .. v_len - 1 loop
    v_elem := p_slide -> v_i;
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad slide'; end if;
    if (select count(*) from jsonb_object_keys(v_elem)) <> 2
       or v_elem -> 'at' is null or v_elem -> 'wage' is null then
      raise exception 'bad slide';
    end if;
    if jsonb_typeof(v_elem -> 'at') <> 'number' or jsonb_typeof(v_elem -> 'wage') <> 'number' then
      raise exception 'bad slide';
    end if;
    v_at   := (v_elem ->> 'at')::numeric;
    v_wage := (v_elem ->> 'wage')::numeric;
    if v_at < 0 or v_at <> trunc(v_at) or v_wage < 0 or v_wage <> trunc(v_wage) then
      raise exception 'bad slide';
    end if;
    if v_prev is not null and v_at <= v_prev then raise exception 'bad slide'; end if; -- 昇順 strict
    v_prev := v_at;
  end loop;
end $function$


-- ============ 1b. set_comp_plan の現行 ACL ============
--   set_comp_plan(uuid,uuid,text,integer,integer,integer,integer,jsonb,jsonb,boolean,text,integer,text,integer)  nargs=14  gated=true  acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

-- ============ 3. C1-2 材料: 控除経路（receivables/advances/transport）の全列 ============
-- ── receivables（17 列） ──
--   # 1 id                   uuid                       null=NO default=gen_random_uuid()
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 check_id             uuid                       null=YES default=-
--   # 5 customer_id          uuid                       null=YES default=-
--   # 6 cast_id              uuid                       null=YES default=-
--   # 7 amount               integer                    null=NO default=-
--   # 8 deduct_from_cast     boolean                    null=NO default=false
--   # 9 status               text                       null=NO default='open'::text
--   #10 created_at           timestamp with time zone   null=NO default=now()
--   #11 updated_at           timestamp with time zone   null=NO default=now()
--   #12 deduct_period        text                       null=YES default=-
--   #13 deducted_amount      integer                    null=NO default=0
--   #14 consent_at           timestamp with time zone   null=YES default=-
--   #15 consent_by           uuid                       null=YES default=-
--   #16 due                  date                       null=YES default=-
--   #17 collected_amount     integer                    null=NO default=0
-- ── advances（15 列） ──
--   # 1 id                   uuid                       null=NO default=gen_random_uuid()
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 cast_id              uuid                       null=NO default=-
--   # 5 amount               integer                    null=NO default=-
--   # 6 deducted_amount      integer                    null=NO default=0
--   # 7 status               text                       null=NO default='open'::text
--   # 8 deduct_period        text                       null=YES default=-
--   # 9 advanced_on          date                       null=NO default=-
--   #10 note                 text                       null=YES default=-
--   #11 created_by           uuid                       null=NO default=-
--   #12 created_at           timestamp with time zone   null=NO default=now()
--   #13 updated_at           timestamp with time zone   null=NO default=now()
--   #14 cancelled_by         uuid                       null=YES default=-
--   #15 cancelled_at         timestamp with time zone   null=YES default=-
-- ── transport（14 列） ──
--   # 1 id                   uuid                       null=NO default=gen_random_uuid()
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 cast_id              uuid                       null=NO default=-
--   # 5 amount               integer                    null=NO default=-
--   # 6 deducted_amount      integer                    null=NO default=0
--   # 7 status               text                       null=NO default='open'::text
--   # 8 biz_date             date                       null=NO default=-
--   # 9 note                 text                       null=YES default=-
--   #10 created_by           uuid                       null=NO default=-
--   #11 created_at           timestamp with time zone   null=NO default=now()
--   #12 updated_at           timestamp with time zone   null=NO default=now()
--   #13 cancelled_by         uuid                       null=YES default=-
--   #14 cancelled_at         timestamp with time zone   null=YES default=-
-- ── deductions（9 列） ──
--   # 1 id                   uuid                       null=NO default=gen_random_uuid()
--   # 2 org_id               uuid                       null=NO default=-
--   # 3 store_id             uuid                       null=NO default=-
--   # 4 name                 text                       null=NO default=-
--   # 5 amount               integer                    null=NO default=0
--   # 6 per                  text                       null=NO default=-
--   # 7 is_active            boolean                    null=NO default=true
--   # 8 created_at           timestamp with time zone   null=NO default=now()
--   # 9 updated_at           timestamp with time zone   null=NO default=now()
-- ── 該当 RPC（prosrc に receivables/advances/transport を含む・名前と arity のみ） ──
--   adv_cancel                       nargs=1  recv=false adv=true transport=false
--   adv_issue                        nargs=5  recv=false adv=true transport=false
--   check_pay                        nargs=7  recv=true adv=false transport=false
--   check_void                       nargs=2  recv=true adv=false transport=false
--   customer_list_summary            nargs=2  recv=true adv=false transport=false
--   customer_summary                 nargs=1  recv=true adv=false transport=false
--   payroll_finalize                 nargs=5  recv=true adv=true transport=true
--   payroll_reopen                   nargs=4  recv=true adv=true transport=true
--   receivable_collect               nargs=6  recv=true adv=false transport=false
--   receivable_mark_deduct           nargs=3  recv=true adv=false transport=false
--   receivable_set_due               nargs=2  recv=true adv=false transport=false
--   transport_cancel                 nargs=1  recv=false adv=false transport=true
--   transport_issue                  nargs=5  recv=false adv=false transport=true

-- ============ 1b-2/1c/1d. 名簿・pin・UI（repo 実測の注記） ============
-- 1b-2. 名簿の節: set_comp_plan は **A7. 待遇・報酬マスタ（11本）** に収載（A6 ではない）。
--   → v2 で新設する set_comp_component の収載先の当たりも **A7**（同節へ +1＝対象 106→107・全数 202→203）。
-- 1c. billing suite の pin 現在値（scripts/verify-nox-billing.ts 実測）:
--   :97  docTargets = 106 ／ :101 docExcluded = 96 ／ :116 liveGated = 106 ／
--   :135 述語参照 = 107（106+ラッパ）／ :142 shapes = 106
--   → mig0115（set_comp_component ゲート入り新設）時は 107/97?/107/108/107 系へ（除外は増えなければ 96 のまま・
--     全数 202→203）。set_comp_plan は 14→N 引数化でも名前不変＝本数不動（旧署名 DROP＋ACL 再適用が必須）。
-- 1d. /master 待遇タブの呼び出し箇所（repo grep）:
--   app/(manage)/master/cast-comp/comp-sections.tsx:202 … supabase.rpc("set_comp_plan", {...})（プラン編集フォーム）
--   同 :131 … cast_plan select（cast_id, plan_id, overrides_json）★mig0114 後は現在行のみへ要追随（valid_to 条件なし）
--   同 :285-292 … overrides UI **あり**（base/dohanBack 数値＋hon/jonai の mode/rate ペア送信＝mig0086 原子性準拠）
--   ＝v2（dohanBackMode/dohanBackRate・components）の UI 増設はこのフォームの延長線
