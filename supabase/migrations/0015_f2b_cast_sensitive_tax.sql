-- 0015_f2b_cast_sensitive_tax: F2b — 機密分離（cast_sensitive）＋税務プロファイル（cast_tax_profiles）
--                              ＋RPC3本（set_cast_sensitive/get_cast_sensitive/set_cast_tax_profile）
--
-- 翻訳元・裁定参照:
--  - 認可設計 §2.4（機密設計の正本）… real_name/mynumber は別テーブル分離・閲覧専用 RPC＋アクセスログ必須。
--  - 裁定 T1a=cast_sensitive は RLS 有効＋SELECT ポリシー無し＋grant 0（全ロール直読み不可・閲覧 RPC のみ）／
--    T2a=mynumber_enc bytea・F2b は null 運用（暗号化は F2d・鍵管理確定後）／T3a=casts.employment 残置・
--    cast_tax_profiles.mode が payOf 正本／T4a=cast_tax_profiles はパターン2／T5a=verify G1 は「SELECT 以下」・
--    cast_sensitive は 0 grant の明示例外／T6a=get＝owner＋cast 本人自己閲覧・set＝manager 以上／
--    T7a=アクセスログは audit_logs 流用（action='read_cast_sensitive'・値なし）／T8a=箱まで（暗号化往復は F2d）。
--  - 補強2: search_path は public のみ（T2a では extensions 不要＝攻撃面を広げない）。
--    get_cast_sensitive の cast 自己閲覧は auth_cast_id() is null fail-closed・本人閲覧も例外なく記録。
--
-- 設計書の整合（§2.2/§2.4 に同時追記＝本コミットに含める・plan 承認済み）:
--  ① mynumber の置き場を §2.4 に整合（cast_tax_profiles でなく cast_sensitive）。§2.2 初版を上書き。
--  ② cast_tax_profiles.mode は「委託/雇用」に統一（初版「報酬/給与」表記・payOf taxMode と一致）。
--  ③ casts.employment は残置（非正規化表示用・drop しない＝非冪等 mig を避ける）。real_name/birthday は
--     casts に元々無い（mig0001 が意図的に除外）ため**データ移行は不要**＝本 mig は新規 INSERT 経路のみ。
--
-- 実装ノート:
--  【1】cast_sensitive は「ポリシー書き忘れ」ではなく意図的にポリシー0・grant0。RLS 有効＋ポリシー無し＝
--      全ロール0行。加えて grant を SELECT すら戻さない＝直 SELECT は permission denied。取得は
--      SECURITY DEFINER の get_cast_sensitive のみ（definer が RLS/grant をバイパス）。
--  【2】get_cast_sensitive は読取だが §2.4 が記録を要求する唯一の例外（原則6 脚注）。返す前に必ず
--      audit_log_write('read_cast_sensitive', 'cast_sensitive:'||id, null, null, store)＝値なしログ。
--      owner でも cast 本人でも全経路で記録（補強2・例外なし）。
--  【3】set_cast_sensitive の audit は平文を残さない＝before/after 値なし・after に {fields_changed:[…]}
--      のマスクのみ（audit_logs に real_name/mynumber 平文をリークさせない・本 mig 固有の逸脱）。
--      fields_changed は upsert 前の before 行との**実値比較（is distinct from＝null 安全）**で算出し、
--      **消去（null 上書き）も changed として載る**（fields_provided＝non-null 引数の列挙だと機密消去が
--      監査から漏れるため）。値は一切ログに入れない（マスク原則は維持）。
--  【4】F2d 暗号化導入時: set/get_cast_sensitive の search_path を public,extensions へ変更し
--      pgp_sym_encrypt/decrypt を通す（pgcrypto は extensions スキーマ＝search_path 未指定だと
--      function does not exist になる BANZEN トラップの回避）。★F2d TODO（各 RPC ヘッダーにも明記）。
--
-- 適用後の検証（"Success" 表示だけを信用しない）:
--   -- 0) 貼り先証明（1行返れば正・エラーなら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) cast_sensitive は RLS 有効・ポリシー0行が正（0行＝意図どおり・存在したら誤り）
--   select relname, relrowsecurity from pg_class
--    where relnamespace='public'::regnamespace and relname in ('cast_sensitive','cast_tax_profiles') order by relname;
--   select count(*) as cast_sensitive_policies from pg_policies
--    where schemaname='public' and tablename='cast_sensitive';   -- 期待 0
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename='cast_tax_profiles'; -- 期待 SELECT 1本
--   -- 2) ACL: cast_sensitive の relacl が authenticated を含まないこと（0 grant の明示例外）
--   select relname, coalesce(array_to_string(relacl,','),'(default=owner only)') as acl from pg_class
--    where relnamespace='public'::regnamespace and relname in ('cast_sensitive','cast_tax_profiles') order by relname;
--   -- 3) RPC の prosrc/ACL（set_cast_sensitive/get_cast_sensitive/set_cast_tax_profile・承認版と一字照合）
--   select proname, prosrc from pg_proc where pronamespace='public'::regnamespace
--    and proname in ('set_cast_sensitive','get_cast_sensitive','set_cast_tax_profile') order by proname;
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--    and proname in ('set_cast_sensitive','get_cast_sensitive','set_cast_tax_profile') order by proname;
--   -- 4) 動作アンカー（JWT が要るため SQL Editor では不可・F2b verify 追記コミットで実施）:
--   --    anon-guard … set/get_cast_sensitive/set_cast_tax_profile anon BLOCKED・cast_sensitive/cast_tax_profiles anon DENIED。
--   --    rls … 全ロール cast_sensitive 直 SELECT 遮断・get の全閲覧でログ+1（本人自己閲覧含む）・平文非リーク・
--   --      T6a 分岐（manager は get 拒否/set 成功・cast 本人のみ get・staff 全拒否・クロス org 拒否）・
--   --      null 消去アンカー（値投入後 set_cast_sensitive(cast,null,null,null)→audit fields_changed に
--   --      'real_name' 等が載る・かつ audit に平文値が無い）。
--   --    grants … cast_sensitive の authenticated 権限 0（T5a 明示例外の positive assert）。

begin;

-- ══════════════════════════════════════════════════════════════
-- cast_sensitive（最高機密・T1a: ポリシー0・grant0＝直 SELECT 全ロール不可）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.cast_sensitive (
  cast_id      uuid primary key references public.casts(id),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  real_name    text,
  birthday     date,
  mynumber_enc bytea,   -- T2a: F2b は null 運用（暗号化は F2d・鍵管理確定後）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists cast_sensitive_org_idx on public.cast_sensitive (org_id);

-- cast_tax_profiles（税区分・T4a パターン2）
create table if not exists public.cast_tax_profiles (
  cast_id    uuid primary key references public.casts(id),
  org_id     uuid not null references public.orgs(id),
  store_id   uuid not null references public.stores(id),
  mode       text not null check (mode in ('委託','雇用')), -- payOf taxMode の正本
  invoice    text check (invoice in ('課税','免税')),        -- F2d
  reg_no     text,                                            -- 適格請求書番号（F2d）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cast_tax_profiles_org_idx on public.cast_tax_profiles (org_id);

-- ── updated_at トリガ（書込は SECURITY DEFINER RPC 経由＝grant0 でも owner 権限で通る）──
drop trigger if exists cast_sensitive_touch_updated_at     on public.cast_sensitive;
drop trigger if exists cast_tax_profiles_touch_updated_at  on public.cast_tax_profiles;
create trigger cast_sensitive_touch_updated_at    before update on public.cast_sensitive    for each row execute function public.touch_updated_at();
create trigger cast_tax_profiles_touch_updated_at before update on public.cast_tax_profiles for each row execute function public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
alter table public.cast_sensitive     enable row level security;
alter table public.cast_tax_profiles  enable row level security;

-- ★cast_sensitive は SELECT ポリシーを「意図的に」作らない（T1a・実装ノート【1】）。
--   RLS 有効＋ポリシー0＝全ロール0行。これは書き忘れではない（ポリシー0行が正）。
--   ↓ ポリシーを1本も create しないことがこのブロックの意図。

-- cast_tax_profiles = パターン2（cast 0行・manager 以上・T4a）
drop policy if exists cast_tax_profiles_select on public.cast_tax_profiles;
create policy cast_tax_profiles_select on public.cast_tax_profiles
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and public.auth_role() <> 'cast'
  );

-- ── grant ──────────────────────────────────────────────────────
-- cast_sensitive: revoke all のみ・SELECT すら戻さない（T1a・T5a 明示例外）。
revoke all on table public.cast_sensitive from public, anon, authenticated;
-- ↑ grant を1つも戻さない＝authenticated は権限皆無。直 SELECT は permission denied。

-- cast_tax_profiles: 標準型（SELECT のみ）
revoke all on table public.cast_tax_profiles from public, anon, authenticated;
grant select on table public.cast_tax_profiles to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_cast_sensitive（upsert・manager 以上・T6a）
-- ★F2d TODO: 暗号化導入時に search_path を public, extensions へ変更（pgcrypto トラップ回避）。
-- audit は平文を残さない＝{fields_changed:[…]} マスク（実装ノート【3】）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_cast_sensitive(
  p_cast_id      uuid,
  p_real_name    text,
  p_birthday     date,
  p_mynumber_enc bytea
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast_org       uuid;
  v_cast_store     uuid;
  v_fields         text[] := array[]::text[];
  v_old_real_name  text;
  v_old_birthday   date;
  v_old_mynumber   bytea;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- before 行を取得（definer＝owner 権限で読める・upsert 前）＝実値比較で fields_changed を算出するため
  select cs.real_name, cs.birthday, cs.mynumber_enc
    into v_old_real_name, v_old_birthday, v_old_mynumber
    from public.cast_sensitive cs where cs.cast_id = p_cast_id;

  insert into public.cast_sensitive (cast_id, org_id, store_id, real_name, birthday, mynumber_enc)
  values (p_cast_id, v_cast_org, v_cast_store, p_real_name, p_birthday, p_mynumber_enc)
  on conflict (cast_id) do update
    set real_name = excluded.real_name, birthday = excluded.birthday,
        mynumber_enc = excluded.mynumber_enc, store_id = excluded.store_id;

  -- 監査（平文を入れない・変更フィールド名のみ＝マスク）。
  -- ★実値比較（is distinct from＝null 安全）: null への消去も changed として検出する。
  --   新規 INSERT 時は v_old_* が null＝non-null 引数のみ changed になり従来挙動と一致。
  -- array_append を使う（text[] || text は array||array に解決され 'real_name' を配列リテラルへ
  -- キャストして malformed array literal になるため・2026-07-06 修正）。
  if p_real_name    is distinct from v_old_real_name then v_fields := array_append(v_fields, 'real_name'); end if;
  if p_birthday     is distinct from v_old_birthday  then v_fields := array_append(v_fields, 'birthday'); end if;
  if p_mynumber_enc is distinct from v_old_mynumber  then v_fields := array_append(v_fields, 'mynumber'); end if;
  perform public.audit_log_write('set_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, jsonb_build_object('fields_changed', to_jsonb(v_fields)), v_cast_store);
  return p_cast_id;
end $$;
revoke execute on function public.set_cast_sensitive(uuid, text, date, bytea) from public, anon;
grant  execute on function public.set_cast_sensitive(uuid, text, date, bytea) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- get_cast_sensitive（owner＋cast 本人自己閲覧・T6a・全閲覧を記録＝原則6 の唯一の例外）
-- ★F2d TODO: 暗号化導入時に search_path を public, extensions へ変更し復号を通す。
-- ══════════════════════════════════════════════════════════════
create or replace function public.get_cast_sensitive(
  p_cast_id uuid
) returns table (
  cast_id      uuid,
  real_name    text,
  birthday     date,
  mynumber_enc bytea
) language plpgsql security definer set search_path = public as $$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_role       text;
  v_self       uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  v_role := public.auth_role();
  -- T6a: owner は org 全 cast・cast は本人のみ・manager/staff は閲覧不可
  if v_role = 'owner' then
    null; -- 許可
  elsif v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if; -- 補強2: fail-closed
    if v_self <> p_cast_id then raise exception 'forbidden'; end if; -- 本人のみ
  else
    raise exception 'forbidden'; -- manager/staff は get 不可
  end if;

  -- ★全閲覧を記録（補強2・本人自己閲覧も例外なく・値なしログ）。返す前に必ず記録する。
  perform public.audit_log_write('read_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  return query
    select cs.cast_id, cs.real_name, cs.birthday, cs.mynumber_enc
    from public.cast_sensitive cs
    where cs.cast_id = p_cast_id;
end $$;
revoke execute on function public.get_cast_sensitive(uuid) from public, anon;
grant  execute on function public.get_cast_sensitive(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- set_cast_tax_profile（upsert・manager 以上・通常 audit）
-- ══════════════════════════════════════════════════════════════
create or replace function public.set_cast_tax_profile(
  p_cast_id uuid,
  p_mode    text,
  p_invoice text,
  p_reg_no  text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_before     jsonb;
  v_after      jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_mode not in ('委託','雇用') then raise exception 'bad mode'; end if;
  if p_invoice is not null and p_invoice not in ('課税','免税') then raise exception 'bad invoice'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(t) into v_before from public.cast_tax_profiles t where t.cast_id = p_cast_id;
  insert into public.cast_tax_profiles (cast_id, org_id, store_id, mode, invoice, reg_no)
  values (p_cast_id, v_cast_org, v_cast_store, p_mode, p_invoice, p_reg_no)
  on conflict (cast_id) do update
    set mode = excluded.mode, invoice = excluded.invoice, reg_no = excluded.reg_no,
        store_id = excluded.store_id;
  select to_jsonb(t) into v_after from public.cast_tax_profiles t where t.cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_tax_profile', 'cast_tax_profiles:' || p_cast_id::text,
    v_before, v_after, v_cast_store);
  return p_cast_id;
end $$;
revoke execute on function public.set_cast_tax_profile(uuid, text, text, text) from public, anon;
grant  execute on function public.set_cast_tax_profile(uuid, text, text, text) to authenticated;

commit;
