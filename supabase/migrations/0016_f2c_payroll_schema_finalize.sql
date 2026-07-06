-- 0016_f2c_payroll_schema_finalize: F2c — 給与確定の中核
--   ① payroll_runs（給与計算実行・draft/finalized/paid の3状態・period_start/end 凍結列）
--   ② payslips（給与明細・breakdown_json={pay,extras[]} 器を確定時凍結・金額系＋staff 遮断）
--   ③ period_bounds（'YYYY-MM'→[月初,月末] date の単一ソース写像＝裁定点6）
--   ④ payroll_run_create（authenticated manager 以上・draft 作成・自然冪等・戻り値=(id,status)）
--   ⑤ payroll_finalize（service_role 限定・payslips 原子的差し替え・旧値を audit 退避・p_actor 明示）
--   ⑥ payroll_mark_paid（service_role 限定・finalized→paid・箱のみ／実運用結線は F2e・p_actor 明示）
--   ⑦ audit_log_write_service（内部専用・p_org_id/p_actor 明示の service 経路監査＝台帳 #6 の解）
--   ＋ get_cast_ranking を period_bounds 経由に再宣言（写像1行のみ変更・他は mig0011 実測 prosrc と一字一致）
--
-- 翻訳元・設計参照:
--  - データモデル §1.4/§2.8… payroll_runs 確定時に payslips.breakdown_json へ確定値スナップショット凍結。
--  - 計算ロジック §4… payOf は TS 純関数（案1・plpgsql 不可）。確定はサーバ再計算が権威（§4.3 の宿題を解決）。
--  - payOf 精密仕様 / lib/nox/pay.ts… PayResult が凍結対象・PayInput をサーバが組む（正本）。
--  - mig0011 get_cast_ranking… 'YYYY-MM'→[月初 cutoff, 翌月初 cutoff) の写像の初出（本 mig で単一ソース化）。
--  - mig0014 cast_sales_aggregate / mig0012 cast_norms… 給与期間は暦月 'YYYY-MM'（cast_norms が payOf の
--    直接入力＝(cast_id,'YYYY-MM') キーのため period 粒度は暦月にピン留め）。
--
-- F2c 設計ロック（相談役裁定・番号確定）:
--  【経路】service_role 限定 finalize/mark_paid RPC。サーバ（Next.js API・service_role）が DB 実績を読み→
--    payOf(TS) を cast ごとに実行→算出済み payslip 群を payroll_finalize に渡し原子的に凍結。
--    authenticated は payslip 値を注入不可（RPC は service_role のみ grant）。
--  【状態】draft→finalized→paid の3状態。finalize は paid でない限り再実行可＝payslips を原子的に差し替え、
--    差し替え前 breakdown_json を audit_log_write_service で退避（訂正痕跡）。冪等キーは二重実行防止のみ
--    （正当な再確定は別キーで通る）。paid 後は finalize/差し替えを RPC 側で拒否。
--  【器】breakdown_json = { pay: PayResult, extras: Extra[] }。extras は F2c では空配列（#32 出勤インセンティブ
--    等の独立行を後続で織り込む受け皿）。payslips.net = extras 込みの最終差引（F2c は extras 空＝pay.net と一致・
--    net はサーバ算出値を凍結＝サーバ権威）。
--  【period】列＝'YYYY-MM'（暦月ラベル・C案）。加えて period_start/period_end date を run に凍結。run_create では
--    確定しない（null）。finalize が period_bounds で解決して書く。再確定時は再解決し旧 period_start/end を audit 退避。
--  【写像単一ソース（点6）】'YYYY-MM'→絶対範囲は period_bounds を唯一の実装に。finalize は独自 cutoff 計算を
--    書かない。get_cast_ranking も v_first を period_bounds から取得する1行のみ差し替え（cutoff 適用と
--    v_end 導出はランキング固有として mig0011 のまま残置＝窓は数学的に不変・verify のランキング・ゴールデンで同値係留）。
--  【範囲】F2c 初回はコア給与のみ。マスタ凍結 guard（finalized period の set_* 拒否）と #32 出勤インセンティブは後続 mig。
--  【天引き】arDeduct/advanceDeduct/okuriDeduct は F2c では 0 凍結（供給元 advances/transport の消し込みと
--    二重控除ガード #8 は F2e で結線）。payOf はそのまま通る。
--  【専門家ゲート暫定既定】#7 源泉日数＝出勤日数（pay.ts withholdingOf 既定・暦日数かは税理士 TODO）／
--    #10 丸め＝round（money.ts 1箇所差替の構造維持）／#11 雇用係数＝1.0（pay.ts 既定）。TODO マーカー維持。
--
-- 実装ノート（意図的逸脱を明記）:
--  【1】payroll_runs は店スコープの管理オブジェクト＝閲覧 owner/manager のみ（cast/staff 0 行）。cast は自分の
--      payslip を /mine で読むため period を payslips に非正規化（run へのアクセス不要）。
--  【2】payslips は「金額系＋staff 遮断」。金額系 §3.2（auth_role()<>'cast' or cast_id=auth_cast_id()）に加え
--      staff を遮断＝個別賃金明細は黒服にも出さない（F2a 指摘A と同論拠・cast_plan と方向統一）。
--      owner=自店全・manager=自店・cast=本人のみ・staff=0 行。
--  【3】★逸脱: payroll_finalize/payroll_mark_paid は service_role 限定のため冒頭 auth_org_id() null guard を
--      置かず p_org_id を明示に受け run.org_id と照合する（service キーは auth.uid() 無し＝auth_org_id() が null）。
--      算出値の注入経路は service キー（サーバ）のみ＝authenticated からは実行不可で権威を担保。二重防御①の代替。
--      actor も auth.uid() から導出不能なため p_actor（確定操作をした authenticated ユーザーの users.id）を
--      サーバが明示に渡す＝service キーは信頼境界内でサーバが正直に actor を渡す前提。
--  【4】★台帳 #6 の解＝audit_log_write_service（p_org_id/p_actor 明示・完全内部専用＝4ロール revoke・grant なし）。
--      既存 audit_log_write は auth_org_id()/auth.uid() 依存で service キーでは死ぬため流用不可（mig0002 §方針で予告）。
--      payroll_finalize/mark_paid（SECURITY DEFINER・owner=postgres）内部の perform のみで通る＝service_role は
--      監査を「finalize/mark_paid 経由」でしか書けない（service キーに任意監査書込を許さない・mig0002 の 2案より tight）。
--  【5】冪等（原則9: org 照合の後・status 変更の前）。finalize は現行 finalize_idem_key と一致し finalized 済みなら
--      既存件数を返す（二重実行防止）。paid 済み run の再確定は 'run paid' で拒否。空 payslips は 'empty payslips' で
--      拒否（0人確定の正当ユースケース無し＝空配列誤渡しによる既存明細全消し防止）。未 paid は delete→再 insert で
--      原子的に再スナップショット（日報 reclose と同思想・差し替え前 breakdown は audit 退避）。
--  【6】payslips 挿入は casts への join で org_id/store_id を照合（他 org/他店の cast_id 混入を落とす防御）。
--  【7】★逸脱: 退避 breakdown（賃金明細）を audit_logs に格納する。audit_logs は owner 限定閲覧＝確定給与の訂正
--      履歴として意図的に保持（cast_sensitive の平文マスク方針とは別＝賃金は監査対象で平文保持が正）。
--  【8】★逸脱: mig0016 が get_cast_ranking（F1f）を create or replace で再宣言する。変更は v_first を
--      period_bounds から取得する **1行のみ**（正規表現 '^\d{4}-(0[1-9]|1[0-2])$'・v_start/v_end 導出・返却形・
--      ロール判定・件数定義・順位式・grant は現ファイル mig0011 と一字一致で無変更）。窓は数学的に同一
--      （v_first=月初／v_end=v_first+1month=翌月初）＝ランキング・ゴールデン（A rank1/B rank2）で回帰係留。
--      ★適用前に現行 get_cast_ranking の prosrc を実測し、正規表現が \d{4} であること・写像1行を除く一致を確認する
--      （孫引き事故の再発防止）。
--  【9】period_bounds は純カレンダー関数（テーブル非参照・cutoff 非依存＝biz_date が cutoff を既に正規化するため
--      暦月の date 境界は cutoff に依らず [月初,月末]）。cutoff の適用は各集計側（ランキングの timestamptz 窓／
--      cast_sales_aggregate の biz_date 範囲）に残る。period_bounds は authenticated＋service_role に grant
--      （サーバが窓解決に・将来シミュレーターも利用）。
--  【10】payslips.paid の位置づけ: F2c では **run.status が唯一の paid 判定ゲート**（finalize 再確定拒否も
--      run.status='paid' で判定）。payslips.paid は **F2e 部分支払いの予約列**で、F2c 時点では mark_paid が
--      一括で立てるのみ・単独では参照しない（列の意図がコメントだけに埋もれないよう本ヘッダーに明記）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) テーブル: RLS 有効・ポリシー（payroll_runs=SELECT 1本／payslips=SELECT 1本）
--   select relname, relrowsecurity from pg_class
--    where relnamespace='public'::regnamespace and relname in ('payroll_runs','payslips') order by relname;
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename in ('payroll_runs','payslips') order by tablename;
--   -- 2) ユニーク（1店1期間 run・1 run1 cast payslip）
--   select indexname, indexdef from pg_indexes where schemaname='public'
--    and indexname in ('payroll_runs_store_period_uidx','payslips_run_cast_uidx');
--   -- 3) grant 面: payroll_runs/payslips は authenticated=SELECT のみ（G1 自動確認）
--   select relname, coalesce(array_to_string(relacl,','),'(default)') from pg_class
--    where relnamespace='public'::regnamespace and relname in ('payroll_runs','payslips') order by relname;
--   -- 4) 写像単一ソース: period_bounds の値（cutoff 非依存の暦月境界）
--   select * from public.period_bounds('2026-07');  -- 期待 (2026-07-01, 2026-07-31)
--   select * from public.period_bounds('2024-02');  -- 期待 (2024-02-01, 2024-02-29) 閏
--   -- 4b) 写像1行のみ変更の確認: 適用前後の get_cast_ranking prosrc を diff し period_bounds 呼出の1行以外一致
--   select prosrc from pg_proc where proname='get_cast_ranking';
--   -- 5) RPC prosrc/ACL（承認版と一字照合）
--   select proname, prosrc from pg_proc where pronamespace='public'::regnamespace
--    and proname in ('period_bounds','audit_log_write_service','payroll_run_create',
--                    'payroll_finalize','payroll_mark_paid','get_cast_ranking') order by proname;
--   --   period_bounds … proacl に authenticated と service_role（anon 無し）
--   --   audit_log_write_service … proacl は owner(postgres) のみ（4ロール revoke の内部専用）
--   --   payroll_run_create … proacl に authenticated（service_role は Supabase 既定＝正常）・戻り値 (id,status)
--   --   payroll_finalize(uuid,uuid,uuid,uuid,jsonb) / payroll_mark_paid(uuid,uuid,uuid,uuid) … proacl に
--   --     service_role のみ（authenticated が無いこと）
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--    and proname in ('period_bounds','audit_log_write_service','payroll_run_create',
--                    'payroll_finalize','payroll_mark_paid') order by proname;
--   -- 6) 動作アンカー（JWT/service キーが要るため SQL Editor では不可・F2c verify 追記コミットで実施）:
--   --    anon-guard … payroll_run_create anon BLOCKED／payroll_finalize・payroll_mark_paid anon＋authenticated
--   --      BLOCKED（service_role 限定）／period_bounds anon BLOCKED／payroll_runs・payslips anon DENIED。
--   --    rls … payslips cast=本人のみ・staff=0 行・manager=自店・owner=自店全／payroll_runs=owner/manager のみ・
--   --      cast/staff 0 行／クロス org 拒否。
--   --    grants … payroll_finalize/mark_paid proacl=service_role のみ・audit_log_write_service=postgres のみ。
--   --    写像 … period_bounds ゴールデン＋get_cast_ranking の順位ゴールデン不変（A rank1/B rank2）で同値係留。

begin;

-- ══════════════════════════════════════════════════════════════
-- payroll_runs（給与計算実行・店スコープ管理オブジェクト・3状態）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.payroll_runs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id),
  store_id          uuid not null references public.stores(id),
  period            text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), -- 'YYYY-MM'（暦月ラベル）
  period_start      date,   -- finalize が period_bounds で解決し凍結（run_create では null）
  period_end        date,   -- 同上（再確定時は再解決・旧値は audit 退避）
  status            text not null default 'draft' check (status in ('draft','finalized','paid')),
  finalize_idem_key uuid,   -- finalize 二重実行防止（正当な再確定は別キー）
  finalized_at      timestamptz,
  paid_idem_key     uuid,   -- mark_paid 二重実行防止
  paid_at           timestamptz,
  created_by        uuid not null references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);
create unique index if not exists payroll_runs_store_period_uidx
  on public.payroll_runs (store_id, period);            -- 1店1期間1 run
create index if not exists payroll_runs_org_idx on public.payroll_runs (org_id);

-- payslips（給与明細・確定時凍結・金額系＋staff 遮断）
create table if not exists public.payslips (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id),
  store_id       uuid not null references public.stores(id),
  run_id         uuid not null references public.payroll_runs(id),
  cast_id        uuid not null references public.casts(id),
  period         text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), -- 非正規化（cast 自己表示用）
  breakdown_json jsonb not null,     -- { pay: PayResult, extras: Extra[] } を確定時点の値で凍結
  net            int  not null,      -- extras 込みの最終差引（サーバ算出値の凍結・照合用）
  paid           boolean not null default false, -- F2e 部分支払い予約列（実装ノート【10】・F2c は run.status がゲート）
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists payslips_run_cast_uidx on public.payslips (run_id, cast_id);
create index if not exists payslips_cast_idx on public.payslips (cast_id); -- /mine 自己閲覧
create index if not exists payslips_org_idx  on public.payslips (org_id);

-- ── updated_at トリガ ──────────────────────────────────────────
drop trigger if exists payroll_runs_touch_updated_at on public.payroll_runs;
drop trigger if exists payslips_touch_updated_at     on public.payslips;
create trigger payroll_runs_touch_updated_at before update on public.payroll_runs for each row execute function public.touch_updated_at();
create trigger payslips_touch_updated_at     before update on public.payslips     for each row execute function public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
alter table public.payroll_runs enable row level security;
alter table public.payslips     enable row level security;

-- payroll_runs = 店スコープ・owner/manager のみ（実装ノート【1】・cast/staff 0 行）
drop policy if exists payroll_runs_select on public.payroll_runs;
create policy payroll_runs_select on public.payroll_runs
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() in ('owner','manager')
  );

-- payslips = 金額系＋staff 遮断（実装ノート【2】）
drop policy if exists payslips_select on public.payslips;
create policy payslips_select on public.payslips
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'staff'
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );

-- ── grant 標準型（revoke all → SELECT のみ戻す）────────────────
revoke all on table public.payroll_runs from public, anon, authenticated;
grant select on table public.payroll_runs to authenticated;
revoke all on table public.payslips from public, anon, authenticated;
grant select on table public.payslips to authenticated;

-- ══════════════════════════════════════════════════════════════
-- period_bounds（'YYYY-MM'→[月初,月末] date の単一ソース写像＝裁定点6・実装ノート【9】）
-- 純カレンダー関数（テーブル非参照・cutoff 非依存）。finalize と get_cast_ranking の両者がこれを唯一の写像に。
-- ══════════════════════════════════════════════════════════════
create or replace function public.period_bounds(
  p_period text
) returns table (
  period_start date,
  period_end   date
) language plpgsql immutable set search_path = public as $$
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  period_start := (p_period || '-01')::date;
  period_end   := ((p_period || '-01')::date + interval '1 month' - interval '1 day')::date;
  return next;
end $$;
revoke execute on function public.period_bounds(text) from public, anon;
grant  execute on function public.period_bounds(text) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- audit_log_write_service（内部専用・p_org_id/p_actor 明示の service 経路監査＝台帳 #6・実装ノート【4】）
-- 完全内部専用: 4ロール revoke・grant なし。payroll_finalize/mark_paid（definer=postgres）内部の perform のみ。
-- ══════════════════════════════════════════════════════════════
create or replace function public.audit_log_write_service(
  p_org_id   uuid,
  p_actor    uuid,
  p_action   text,
  p_target   text default null,
  p_before   jsonb default null,
  p_after    jsonb default null,
  p_store_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_org_id is null then raise exception 'forbidden'; end if; -- org 明示必須
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (p_org_id, p_store_id, p_actor, p_action, p_target, p_before, p_after, null)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.audit_log_write_service(uuid, uuid, text, text, jsonb, jsonb, uuid) from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- get_cast_ranking を period_bounds 経由に再宣言（写像1行のみ変更・実装ノート【8】）
-- v_first を period_bounds から取得する1行のみ差し替え。正規表現 '^\d{4}-(0[1-9]|1[0-2])$'・v_start/v_end・
-- 返却形・ロール判定・件数・順位式・grant は現ファイル mig0011 と一字一致で無変更。
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
  select pb.period_start into v_first from public.period_bounds(p_period) pb; -- ★写像単一ソース（1行差し替え）
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
         coalesce(ca.id = v_self, false) -- 非 cast 呼び出し（v_self=null）でも false
  from public.casts ca
  left join nom_counts nc on nc.cid = ca.id
  left join back_sums  bs on bs.cid = ca.id
  where ca.org_id = v_org and ca.store_id = p_store_id and ca.is_active;
end $$;
revoke execute on function public.get_cast_ranking(uuid, text) from public, anon;
grant  execute on function public.get_cast_ranking(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- payroll_run_create（draft 作成・authenticated manager 以上・自然冪等・戻り値=(id,status)）
-- 既存 run を掴んだ場合はその status を返す（サーバが finalized/paid を判別＝意図しない再確定防止）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.payroll_run_create(
  p_store_id uuid,
  p_period   text
) returns table (id uuid, status text) language plpgsql security definer set search_path = public as $$
declare
  v_store  record;
  v_actor  uuid;
  v_id     uuid;
  v_status text;
begin
  -- 二重防御①: 冒頭 null guard
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- 入力検証
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  -- store の org 照合＋ロール判定（owner 全店・manager 自店のみ・staff/cast 不可）
  select s.id, s.org_id into v_store from public.stores s where s.id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 自然冪等: 既存 run があれば id と status を返す（1店1期間・period_start/end は finalize が確定）
  select pr.id, pr.status into v_id, v_status from public.payroll_runs pr
   where pr.store_id = p_store_id and pr.period = p_period;
  if v_id is not null then
    id := v_id; status := v_status; return next; return;
  end if;

  select u.id into v_actor from public.users u where u.auth_user_id = auth.uid() and u.is_active;
  insert into public.payroll_runs (org_id, store_id, period, status, created_by)
  values (public.auth_org_id(), p_store_id, p_period, 'draft', v_actor)
  returning payroll_runs.id into v_id;

  perform public.audit_log_write('payroll_run_create', 'payroll_runs:' || v_id::text,
    null, jsonb_build_object('period', p_period, 'store_id', p_store_id), p_store_id);
  id := v_id; status := 'draft'; return next;
end $$;
revoke execute on function public.payroll_run_create(uuid, text) from public, anon;
grant  execute on function public.payroll_run_create(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- payroll_finalize（service_role 限定・payslips 原子的差し替え・旧値 audit 退避・実装ノート【3】【5】【6】【7】）
-- p_actor = 確定操作をした authenticated ユーザーの users.id（サーバが明示に渡す）。
-- p_payslips = jsonb array of { cast_id: uuid, net: int, breakdown: { pay: PayResult, extras: [] } }
-- ══════════════════════════════════════════════════════════════
create or replace function public.payroll_finalize(
  p_org_id   uuid,
  p_actor    uuid,
  p_run_id   uuid,
  p_idem_key uuid,
  p_payslips jsonb
) returns int language plpgsql security definer set search_path = public as $$
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
begin
  -- run 取得＋org 照合（service_role のため auth_org_id() でなく p_org_id 明示照合＝逸脱【3】）
  select org_id, store_id, period, status, finalize_idem_key, period_start, period_end
    into v_org, v_store, v_period, v_status, v_idem, v_old_ps, v_old_pe
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（原則9: org 照合の後・status 変更の前）: 二重実行防止のみ＝現行キー一致かつ finalized 済みなら既存件数を返す
  if p_idem_key is not null and v_status = 'finalized' and v_idem is not distinct from p_idem_key then
    select count(*) into v_count from public.payslips where run_id = p_run_id;
    return v_count;
  end if;

  -- paid 後は再確定/差し替え不可（確定給与の温存）
  if v_status = 'paid' then raise exception 'run paid'; end if;

  -- 器の形式検証（breakdown = {pay, extras[]}・cast_id/net 必須）
  if p_payslips is null or jsonb_typeof(p_payslips) <> 'array' then raise exception 'bad payslips'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payslips) e
    where e->>'cast_id' is null or e->>'net' is null
       or e->'breakdown'->'pay' is null
       or jsonb_typeof(e->'breakdown'->'extras') <> 'array'
  ) then raise exception 'bad payslip shape'; end if;
  -- 空配列拒否（形式検証の直後・delete の前＝空誤渡しによる既存明細全消し防止）
  if jsonb_array_length(p_payslips) = 0 then raise exception 'empty payslips'; end if;

  -- 差し替え前 breakdown_json を退避（監査に確定履歴を残す・再確定の訂正痕跡＝逸脱【7】）
  select jsonb_agg(jsonb_build_object('cast_id', ps.cast_id, 'net', ps.net, 'breakdown', ps.breakdown_json))
    into v_retired from public.payslips ps where ps.run_id = p_run_id;

  -- 期間窓を単一ソース（period_bounds）で解決＝finalize は独自 cutoff 計算を書かない（点6）
  select pb.period_start, pb.period_end into v_new_ps, v_new_pe from public.period_bounds(v_period) pb;

  -- 原子的差し替え（未 paid のみここに到達）。casts join で org/store 照合＝他 org/他店 cast 混入除去【6】
  delete from public.payslips where run_id = p_run_id;
  insert into public.payslips (org_id, store_id, run_id, cast_id, period, breakdown_json, net)
  select v_org, v_store, p_run_id, c.id, v_period, e->'breakdown', (e->>'net')::int
  from jsonb_array_elements(p_payslips) e
  join public.casts c on c.id = (e->>'cast_id')::uuid
   and c.org_id = v_org and c.store_id = v_store;
  get diagnostics v_count = row_count;

  update public.payroll_runs
     set status = 'finalized', finalized_at = now(),
         finalize_idem_key = p_idem_key,
         period_start = v_new_ps, period_end = v_new_pe
   where id = p_run_id;

  -- #6 service 経路監査: actor=p_actor・before に退避 breakdown＋旧窓・after に新件数/新窓/idem
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_finalize',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('retired_payslips', coalesce(v_retired, '[]'::jsonb),
                       'old_period_start', v_old_ps, 'old_period_end', v_old_pe),
    jsonb_build_object('cast_count', v_count, 'period_start', v_new_ps,
                       'period_end', v_new_pe, 'idem_key', p_idem_key),
    v_store);
  return v_count;
end $$;
-- service_role 限定（authenticated も含めて revoke・server キーのみ実行可）
revoke execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.payroll_finalize(uuid, uuid, uuid, uuid, jsonb) to service_role;

-- ══════════════════════════════════════════════════════════════
-- payroll_mark_paid（service_role 限定・finalized→paid・箱のみ／実運用結線は F2e・実装ノート【3】【10】）
-- p_actor = 支払確定操作をした authenticated ユーザーの users.id（サーバが明示に渡す）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.payroll_mark_paid(
  p_org_id   uuid,
  p_actor    uuid,
  p_run_id   uuid,
  p_idem_key uuid
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid;
  v_store  uuid;
  v_status text;
  v_idem   uuid;
begin
  select org_id, store_id, status, paid_idem_key
    into v_org, v_store, v_status, v_idem
    from public.payroll_runs where id = p_run_id;
  if v_org is null then raise exception 'run not found'; end if;
  if p_org_id is null or v_org <> p_org_id then raise exception 'forbidden'; end if;

  -- 冪等（原則9 順序）: 既に paid で同一キーなら成功を返す（二重実行防止）
  if p_idem_key is not null and v_status = 'paid' and v_idem is not distinct from p_idem_key then
    return 'paid';
  end if;

  -- finalized→paid のみ許可（draft/paid からは不可）
  if v_status <> 'finalized' then raise exception 'not finalized'; end if;

  update public.payroll_runs
     set status = 'paid', paid_at = now(), paid_idem_key = p_idem_key
   where id = p_run_id;
  update public.payslips set paid = true where run_id = p_run_id; -- F2e 予約列を一括で立てる（実装ノート【10】）

  -- #6 service 経路監査（actor=p_actor・箱のみ＝実消し込みは F2e）
  perform public.audit_log_write_service(v_org, p_actor, 'payroll_mark_paid',
    'payroll_runs:' || p_run_id::text,
    jsonb_build_object('status', 'finalized'),
    jsonb_build_object('status', 'paid', 'idem_key', p_idem_key), v_store);
  return 'paid';
end $$;
revoke execute on function public.payroll_mark_paid(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.payroll_mark_paid(uuid, uuid, uuid, uuid) to service_role;

commit;

