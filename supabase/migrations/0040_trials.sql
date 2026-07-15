-- 0040_trials: F3d 体入採用 — trials テーブル＋体入フロー RPC 4本＋直接登録 cast_create（casts 生成の初経路）
-- ★★ 非idempotent（create table + grant を含む）・再適用厳禁 ★★
--   ① trials 新設（体入カード＝モック「体入・採用管理」準拠・RLS は owner/manager 限定の新形）
--   ② trial_register（体入登録・owner∨manager 自店・birthday 必須・満18歳未満拒否）
--   ③ trial_update（評価/書類/メモ/tier の部分更新・status='trial' のみ）
--   ④ trial_hire（本採用＝trials→'hired'・全書類 true 必須・18歳二重判定・casts＋cast_sensitive 生成・cast_id 焼付け）
--   ⑤ trial_reject（見送り＝'trial'→'rejected'・行は残置＝台帳 #35・削除 RPC は作らない）
--   ⑥ cast_create（体入を経ない直接登録＝モック「新規キャスト登録」・④と物理一致の内部ヘルパー共有）
--   （内部）cast_create_apply＝④⑥共通の casts＋cast_sensitive 生成（approval_apply 型・4ロール revoke）
--
-- 設計ロック（現物調査 2026-07-15 → 相談役確定）:
--  - モック逐語準拠: 体入カード＝源氏名・体入日・区分(tier)・評価(1-5)・書類4種＋メモ・[本採用/見送り]・
--    「本採用には全書類のチェックが必要です」。★モックに「日当」は無い（調査1）＝日当列は持たない。
--  - documents jsonb のキーは4固定（UI と共有する正本）: id_doc（身分証＝年齢確認・風営法）/
--    contract（雇用契約書）/ pledge（誓約書）/ bank（振込口座）。値は jsonb boolean。
--  - trials は real_name/birthday を持つ（体入時に身分証で確認する運用）＝機密度に応じ RLS を
--    owner/manager 限定（staff/cast 0行）の新形にする（P2 より狭い・完全一致前例なし＝相談役承認・調査5）。
--    マイナンバーは持たない（本採用後も cast_sensitive.mynumber_enc の管轄・F2d 経路のみ）。
--  - 本採用＝casts（源氏名・kind←tier・user_id null＝ログインなし）＋cast_sensitive（real_name/birthday・
--    mynumber_enc null）を生成し trials.cast_id に焼付け。casts への INSERT はこれが初のランタイム経路
--    （現状 seed のみ＝調査2）。cast のログインアカウント発行（users/memberships/casts.user_id 結線）は
--    別フェーズ（staff_create 同型の招待フロー・本 mig 対象外）。
--  - 見送り後の個人情報保持期間は弁護士ゲート後裁定＝削除 RPC は作らない（台帳 #35 起票済み）。
--  - audit_logs.action に CHECK なし（調査4）＝trial_* 新ラベルはそのまま通る。
--
-- 実装ノート:
--  【1】★audit の PII マスク: trials 行は real_name/birthday を含むため、audit の before/after は
--       to_jsonb(row) - 'real_name' - 'birthday' で剥がして記録（audit_logs へ平文 PII を増殖させない＝
--       mig0015 のマスク流儀の拡張）。cast_sensitive 生成の audit は {fields_changed:[…]} マスクのみ
--       （set_cast_sensitive 流儀・array_append を使う＝mig0015 の malformed array literal 教訓）。
--  【2】満18歳判定はカレンダー満年齢: v_today = (timezone('Asia/Tokyo', now()))::date・
--       p_birthday + interval '18 years' > v_today なら raise 'under 18'（誕生日当日から可）。
--       ②で入口判定＋（内部）cast_create_apply でも判定＝④⑥の二重判定（防御深度）。
--  【3】③は意図された部分更新（null=不変更・規約7 の boolean リセット問題は非該当＝boolean 引数なし）。
--       documents は non-null 時に全置換（UI はチェック状態の全量を送る）・キー/値は厳格検証
--       （4キー以外 or 非 boolean は 'bad documents'）。memo のクリアは空文字で行う（null は不変更）。
--  【4】書類完備判定は ->> = 'true' の文字列比較（キー欠落/null/不正値は false・::boolean の raise を
--       構造的に回避＝mig0039【1】と同じ流儀）。
--  【5】（内部）cast_create_apply は approval_apply 型＝④⑥の生成を物理一致させる共通ヘルパー。
--       4ロール明示 revoke（public/anon/authenticated/service_role）・grant なし＝直呼び経路なし。
--       行を書く内部関数のため冒頭 null guard を置く（規約8・防御深度）。
--  【6】casts_one_active_per_user_idx は user_id null 行に効かない（NULL は distinct）＝
--       user_id null の cast を何人生成しても部分ユニークに抵触しない（live 確認済みの構造）。
--  【7】★verify（STEP3）: trial_hire の casts 連鎖実走は段31 方式（service 動的生成→finally で
--       casts/cast_sensitive 含め全消し）必須＝rls の casts 固定カウント（A1=2人・ranking 2行）反転ゼロ。
--
-- 適用後の検証（"Success" だけ信用しない・Run 前に URL の ref 目視・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) テーブル＋制約＋RLS＋grant を1結果セットで:
--      select
--        (select string_agg(conname,' | ' order by conname) from pg_constraint where conrelid='public.trials'::regclass) as constraints,
--        (select string_agg(polname||':'||polcmd::text,' | ') from pg_policy where polrelid='public.trials'::regclass) as policies,
--        (select string_agg(grantee||'='||privilege_type,', ') from information_schema.role_table_grants where table_name='trials') as tbl_grants,
--        (select relrowsecurity from pg_class where oid='public.trials'::regclass) as rls_enabled;
--      -- 期待: policies = trials_select:r 1本のみ / tbl_grants = authenticated=SELECT のみ / rls_enabled=t
--   2) policy の roles と qual（owner/manager 限定の新形・to authenticated）:
--      select policyname, roles, cmd, qual from pg_policies where schemaname='public' and tablename='trials';
--   3) RPC 5本＋内部1本の ACL:
--      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--             coalesce(array_to_string(p.proacl,','),'default') as acl
--        from pg_proc p where p.pronamespace='public'::regnamespace
--         and p.proname in ('trial_register','trial_update','trial_hire','trial_reject','cast_create','cast_create_apply')
--       order by 1;
--      -- 期待: 公開5本= authenticated 保持・anon 不在 / cast_create_apply= anon/authenticated/service_role 不在（owner のみ）
--      select pg_get_functiondef('trial_hire(uuid)'::regprocedure);
--      select pg_get_functiondef('cast_create_apply(uuid, uuid, text, text, text, date)'::regprocedure);
--   4) notify pgrst, 'reload schema';
--   5) 動作アンカー（登録→評価/書類→本採用で casts＋cast_sensitive 実生成・書類不備 raise・under 18・
--      見送り・not trial・認可マトリクス・staff/cast 0行・anon BLOCKED・audit PII マスク）は
--      verify 新段で実測（STEP3・実装ノート【7】の動的生成方式）。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① trials（体入カード・owner/manager 限定 RLS の新形）
-- ══════════════════════════════════════════════════════════════
create table public.trials (
  id         uuid        not null default gen_random_uuid(),
  org_id     uuid        not null references public.orgs(id),
  store_id   uuid        not null references public.stores(id),
  name       text        not null,                    -- 源氏名（表に表示）
  real_name  text,                                    -- 本名（身分証確認・RLS で owner/manager 限定）
  birthday   date        not null,                    -- 生年月日（年齢確認＝風営法・満18歳以上のみ登録可）
  tier       text,                                    -- 区分（エース/人気/レギュラー/体入＝モック・自由 text）
  rating     integer,                                 -- 評価 1-5（null=未評価）
  documents  jsonb       not null default '{}'::jsonb, -- 書類チェック（id_doc/contract/pledge/bank の boolean）
  memo       text,
  status     text        not null default 'trial',    -- trial（体入中）/hired（本採用）/rejected（見送り）
  trial_date date,                                    -- 体入日
  cast_id    uuid        references public.casts(id), -- 本採用時に生成した cast（焼付け）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trials_pkey primary key (id),
  constraint trials_rating_check check (rating >= 1 and rating <= 5),
  constraint trials_status_check check (status in ('trial','hired','rejected'))
);

create index trials_org_idx   on public.trials (org_id);
create index trials_store_idx on public.trials (store_id, status);

create trigger trials_touch_updated_at
  before update on public.trials
  for each row execute function public.touch_updated_at();

alter table public.trials enable row level security;

-- SELECT（★新形＝owner/manager のみ・staff/cast 0行。real_name/birthday を含むため P2 より狭い＝相談役承認）
create policy trials_select on public.trials
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() in ('owner','manager')
  );

-- grant（標準型＝教訓4: authenticated は SELECT のみ・書込は RPC 経由）
revoke all on table public.trials from public, anon, authenticated;
grant select on table public.trials to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.trials from authenticated;

-- ══════════════════════════════════════════════════════════════
-- （内部）cast_create_apply — ④⑥共通の casts＋cast_sensitive 生成（approval_apply 型・物理一致）
--   満18歳判定（二重判定の実体）・casts INSERT（user_id null）・cast_sensitive INSERT（mynumber_enc null）・
--   audit は casts=全行（PII なし＝源氏名のみ）／cast_sensitive={fields_changed} マスク（実装ノート【1】）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_create_apply(
  p_org_id    uuid,
  p_store_id  uuid,
  p_name      text,
  p_kind      text,
  p_real_name text,
  p_birthday  date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_today  date := (timezone('Asia/Tokyo', now()))::date;
  v_fields text[] := array[]::text[];
begin
  -- 規約8（防御深度）: 行を書く内部関数の null guard（呼び手は公開 RPC の二重防御済み前提だが遮断を重ねる）
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;

  -- 満18歳（カレンダー満年齢・誕生日当日から可＝実装ノート【2】・④⑥の二重判定）
  if p_birthday is null then raise exception 'bad birthday'; end if;
  if p_birthday + interval '18 years' > v_today then raise exception 'under 18'; end if;

  insert into public.casts (org_id, store_id, user_id, name, kind, is_active)
  values (p_org_id, p_store_id, null, p_name, p_kind, true)
  returning id into v_id;

  insert into public.cast_sensitive (cast_id, org_id, store_id, real_name, birthday, mynumber_enc)
  values (v_id, p_org_id, p_store_id, p_real_name, p_birthday, null);

  -- audit: casts は全行（源氏名のみ＝PII なし）／cast_sensitive はマスク（array_append＝mig0015 教訓）
  perform public.audit_log_write('cast_create', 'casts:' || v_id::text, null,
    (select to_jsonb(c) from public.casts c where c.id = v_id), p_store_id);
  if p_real_name is not null then v_fields := array_append(v_fields, 'real_name'); end if;
  v_fields := array_append(v_fields, 'birthday');  -- birthday は not null 入力＝常に書かれる
  perform public.audit_log_write('cast_create_sensitive', 'cast_sensitive:' || v_id::text,
    null, jsonb_build_object('fields_changed', to_jsonb(v_fields)), p_store_id);
  return v_id;
end $$;

-- 内部専用＝4ロール明示 revoke・grant なし（教訓: 既定 grant は service_role にも付く）
revoke execute on function public.cast_create_apply(uuid, uuid, text, text, text, date)
  from public, anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- ② trial_register（体入登録・owner∨manager 自店・birthday 必須・満18歳未満拒否）
-- ══════════════════════════════════════════════════════════════
create or replace function public.trial_register(
  p_store_id   uuid,
  p_name       text,                      -- 源氏名（必須）
  p_birthday   date,                      -- 必須（年齢確認＝風営法）
  p_real_name  text default null,
  p_tier       text default null,
  p_trial_date date default null,
  p_memo       text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_today     date := (timezone('Asia/Tokyo', now()))::date;
  v_id        uuid;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 入力検証
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_real_name is not null and length(p_real_name) > 80 then raise exception 'bad real name'; end if;
  if p_birthday is null then raise exception 'bad birthday'; end if;
  if p_birthday + interval '18 years' > v_today then raise exception 'under 18'; end if;  -- 実装ノート【2】
  if p_tier is not null and length(p_tier) > 20 then raise exception 'bad tier'; end if;
  if p_memo is not null and length(p_memo) > 500 then raise exception 'bad memo'; end if;

  -- store の org 照合（クロステナント遮断）→ ロールゲート（owner∨manager 自店）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.trials (org_id, store_id, name, real_name, birthday, tier, trial_date, memo)
  values (v_org, p_store_id, trim(p_name), p_real_name, p_birthday, p_tier, p_trial_date, p_memo)
  returning id into v_id;

  -- 規約6: audit（★PII マスク＝real_name/birthday を剥がす・実装ノート【1】）
  perform public.audit_log_write('trial_register', 'trials:' || v_id::text, null,
    (select to_jsonb(t) - 'real_name' - 'birthday' from public.trials t where t.id = v_id), p_store_id);
  return v_id;
end $$;

revoke execute on function public.trial_register(uuid, text, date, text, text, date, text) from public, anon;
grant  execute on function public.trial_register(uuid, text, date, text, text, date, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ trial_update（評価/書類/メモ/tier の部分更新＝null は不変更・status='trial' のみ）
-- ══════════════════════════════════════════════════════════════
create or replace function public.trial_update(
  p_trial_id  uuid,
  p_rating    integer default null,
  p_documents jsonb   default null,       -- non-null 時は全置換（4キー・boolean 値のみ・実装ノート【3】）
  p_memo      text    default null,       -- クリアは空文字（null=不変更）
  p_tier      text    default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_row    public.trials;
  v_key    text;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 入力検証
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'bad rating'; end if;
  if p_documents is not null then
    if jsonb_typeof(p_documents) <> 'object' then raise exception 'bad documents'; end if;
    for v_key in select jsonb_object_keys(p_documents)
    loop
      if v_key not in ('id_doc','contract','pledge','bank') then raise exception 'bad documents'; end if;
      if jsonb_typeof(p_documents -> v_key) <> 'boolean' then raise exception 'bad documents'; end if;
    end loop;
  end if;
  if p_memo is not null and length(p_memo) > 500 then raise exception 'bad memo'; end if;
  if p_tier is not null and length(p_tier) > 20 then raise exception 'bad tier'; end if;

  -- 対象取得（org 一致を同時確認＝他 org は not found・存在オラクル封じ）→ ロールゲート
  select * into v_row from public.trials where id = p_trial_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'trial' then raise exception 'not trial'; end if;

  v_before := to_jsonb(v_row) - 'real_name' - 'birthday';
  update public.trials
     set rating    = coalesce(p_rating,    rating),
         documents = coalesce(p_documents, documents),
         memo      = coalesce(p_memo,      memo),
         tier      = coalesce(p_tier,      tier)
   where id = p_trial_id;

  perform public.audit_log_write('trial_update', 'trials:' || p_trial_id::text,
    v_before,
    (select to_jsonb(t) - 'real_name' - 'birthday' from public.trials t where t.id = p_trial_id),
    v_row.store_id);
end $$;

revoke execute on function public.trial_update(uuid, integer, jsonb, text, text) from public, anon;
grant  execute on function public.trial_update(uuid, integer, jsonb, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ④ trial_hire（本採用＝全書類 true 必須・casts＋cast_sensitive 生成・trials.cast_id 焼付け）
--    生成は cast_create_apply（⑥と物理一致）。18歳二重判定はヘルパー内（実装ノート【2】）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.trial_hire(
  p_trial_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_row    public.trials;
  v_before jsonb;
  v_cast   uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_row from public.trials where id = p_trial_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'trial' then raise exception 'not trial'; end if;

  -- ★全書類チェック（モック「本採用には全書類のチェックが必要です」・->> = 'true' 比較＝実装ノート【4】）
  if not (coalesce(v_row.documents->>'id_doc',   '') = 'true'
      and coalesce(v_row.documents->>'contract', '') = 'true'
      and coalesce(v_row.documents->>'pledge',   '') = 'true'
      and coalesce(v_row.documents->>'bank',     '') = 'true') then
    raise exception 'documents incomplete';
  end if;

  v_before := to_jsonb(v_row) - 'real_name' - 'birthday';

  -- casts＋cast_sensitive 生成（⑥と物理一致・18歳二重判定・kind←tier・実績ゼロから）
  v_cast := public.cast_create_apply(v_row.org_id, v_row.store_id, v_row.name, v_row.tier,
                                     v_row.real_name, v_row.birthday);

  update public.trials
     set status = 'hired', cast_id = v_cast
   where id = p_trial_id;

  perform public.audit_log_write('trial_hire', 'trials:' || p_trial_id::text,
    v_before,
    (select to_jsonb(t) - 'real_name' - 'birthday' from public.trials t where t.id = p_trial_id),
    v_row.store_id);
  return v_cast;
end $$;

revoke execute on function public.trial_hire(uuid) from public, anon;
grant  execute on function public.trial_hire(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑤ trial_reject（見送り＝'trial'→'rejected'・行は残置＝台帳 #35・削除 RPC は作らない）
-- ══════════════════════════════════════════════════════════════
create or replace function public.trial_reject(
  p_trial_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_row    public.trials;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  select * into v_row from public.trials where id = p_trial_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'trial' then raise exception 'not trial'; end if;

  v_before := to_jsonb(v_row) - 'real_name' - 'birthday';
  update public.trials set status = 'rejected' where id = p_trial_id;

  perform public.audit_log_write('trial_reject', 'trials:' || p_trial_id::text,
    v_before,
    (select to_jsonb(t) - 'real_name' - 'birthday' from public.trials t where t.id = p_trial_id),
    v_row.store_id);
end $$;

revoke execute on function public.trial_reject(uuid) from public, anon;
grant  execute on function public.trial_reject(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑥ cast_create（体入を経ない直接登録＝モック「新規キャスト登録」・owner∨manager 自店）
--    生成は cast_create_apply（④と物理一致・18歳判定込み）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.cast_create(
  p_store_id  uuid,
  p_name      text,                       -- 源氏名（必須・表に表示）
  p_birthday  date,                       -- 必須（年齢確認＝風営法・18歳以上のみ）
  p_real_name text default null,          -- 本名（給与・法定＝cast_sensitive へ）
  p_kind      text default null           -- 区分（エース/人気/レギュラー/体入）
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 入力検証（18歳判定は cast_create_apply 内＝④と同一実体）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_real_name is not null and length(p_real_name) > 80 then raise exception 'bad real name'; end if;
  if p_birthday is null then raise exception 'bad birthday'; end if;
  if p_kind is not null and length(p_kind) > 20 then raise exception 'bad kind'; end if;

  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  v_id := public.cast_create_apply(v_org, p_store_id, trim(p_name), p_kind, p_real_name, p_birthday);
  return v_id;
end $$;

revoke execute on function public.cast_create(uuid, text, date, text, text) from public, anon;
grant  execute on function public.cast_create(uuid, text, date, text, text) to authenticated;

commit;
