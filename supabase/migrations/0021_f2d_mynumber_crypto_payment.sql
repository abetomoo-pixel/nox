-- 0021_f2d_mynumber_crypto_payment: F2d — mynumber 暗号化（pgp_sym・Vault 鍵）＋インボイス仕上げ＋payment_records
--   ① set_cast_sensitive 改修（p_mynumber_enc bytea → p_mynumber text・DB 内 pgp_sym_encrypt with Vault 鍵）
--   ② get_cast_sensitive 改修（mynumber は mynumber_set boolean を返す＝enc/平文を API に晒さない）
--   ③ get_cast_mynumber（service_role 限定・full 平文復号・支払調書経路・全復号 audit）
--   ④ get_cast_mynumber_masked（cast 本人のみ・末尾4桁マスク・DB 内 decrypt・audit）
--   ⑤ set_cast_tax_profile 改修（reg_no に ^T[0-9]{13}$ 形式 check 追加・invoice 課税/免税 は既存）
--   ⑥ payment_records 新設（1確定給与 run_id/cast_id に複数行可・パターン1）＋payment_record_add（manager+）
--
--  ★★ 鍵は Vault に登録（本 mig とは別・Agoora 手作業・鍵値は SQL/repo/履歴に一切残さない）。手貼り順 ①→②:
--    ① 鍵登録（SQL Editor で1回・鍵は DB 内乱数生成＝人手で鍵を打たない）:
--         select vault.create_secret(
--           encode(extensions.gen_random_bytes(32), 'base64'), 'nox_mynumber_key', 'F2d mynumber 対称暗号鍵（pgp_sym）');
--         -- 確認: select name, created_at from vault.secrets where name='nox_mynumber_key';
--    ② 本 mig0021 を適用（RPC は鍵を名前 'nox_mynumber_key' で vault.decrypted_secrets から読む＝鍵値は本文に無い）。
--
-- 翻訳元・裁定参照:
--  - F2b（mig0015）: cast_sensitive は T1a=ポリシー0・grant0（最強封鎖・改修後も不変）。mynumber_enc bytea・null 運用。
--    real_name/birthday は casts に無く移行不要＝暗号化も「既存 null 列に新方式で書くだけ」で移行 SQL 不要。
--    set_cast_tax_profile は invoice 課税/免税 を既に check 済み（列 check＋RPC 検証）＝D2 残は reg_no 形式のみ。
--  - F2d plan 裁定（相談役ロック）:
--    D1-a 対称 pgp_sym／D1-b Vault 鍵（実測2で確定・env フォールバック不要・鍵が DB 内・関数だけが触る）。
--    D1-c full 平文復号=service_role 限定 get_cast_mynumber（支払調書経路）・全復号 audit・cast 本人も平文不可。
--      末尾4桁=案2: get_cast_mynumber_masked（cast 本人のみ・DB 内 decrypt→末尾4桁のみ・平文列を持たない）。
--      書込一本化=案(a): set_cast_sensitive を p_mynumber text 受け→DB 内暗号化（bytea 経路廃止・real_name/birthday 維持）。
--    D3-b 案1: payment_records は複数行可（paid_amount）＝L5 部分支払いを器で先取り。F2d は器＋全額記録の結線まで。
--    D4 源泉日数=現状維持（withholdingOf 触らない）。
--
-- 実装ノート:
--  【1】pgcrypto トラップ（実測4）: pgp_sym_encrypt/decrypt・gen_random_bytes は extensions スキーマ。
--      暗号化/復号を通す RPC は set search_path = public, extensions 必須。vault.decrypted_secrets は完全修飾。
--  【2】鍵取得: select decrypted_secret into v_key from vault.decrypted_secrets where name='nox_mynumber_key';
--      鍵未登録なら raise（fail-closed）。鍵リテラルは本 mig に一切無い（名前参照のみ）。
--  【3】シグネチャ変更ゆえ DROP 先行: set_cast_sensitive(uuid,text,date,bytea) と get_cast_sensitive(uuid)[戻り値 bytea]
--      を drop してから新シグネチャで create（create or replace は引数型/戻り値型を変えられず旧 overload が残るため）。
--  【4】非決定的暗号: pgp_sym_encrypt は毎回 IV 乱数＝同一平文でも enc が異なる。set の fields_changed の mynumber は
--      enc 比較でなく「p_mynumber 非 null なら provided」で検出（real_name/birthday は現行の is distinct from 維持）。
--      audit は平文を残さない（fields_changed マスク・F2b 踏襲）。get_cast_mynumber(_masked) は平文/末尾4桁を
--      関数外の audit に入れない（action と target のみ）。★null=保持: p_mynumber=null は mynumber を変更しない
--      （既存 enc を case で保持＝real_name/birthday 単独更新で誤消去しない。明示削除は必要時に別 RPC を後続）。
--  【5】封印不変: cast_sensitive の RLS（ポリシー0）・grant（0）は本 mig で触らない＝最強封鎖維持。
--      取得は SECURITY DEFINER RPC のみ（get_cast_sensitive=boolean／get_cast_mynumber=service full／masked=cast 本人）。
--  【6】payment_records: パターン1（cast 本人が自分の支払記録を見る・客情報 customer_id なし）。
--      payment_record_add は run が finalized/paid（payslip 凍結済み）・Σ paid_amount ≤ payslip.net（過払いガード）。
--      ★原子性（原則4/9）: 対象 payslip 行を FOR UPDATE ロックして sum→check→insert を直列化（Σ≤net の TOCTOU 排除）＋
--      idem_key 一意で二重挿入を排他（複数行可テーブルゆえ Σ 膨張を防ぐ・冪等リプレイは org/ロール照合の後）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref 目視・★適用前に現行 live prosrc を控えて差分照合）:
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 鍵が Vault に存在（②の前に①が済んでいること）
--   select name from vault.secrets where name='nox_mynumber_key';  -- 1行返れば OK
--   -- RPC prosrc/proacl（承認版と一字照合）
--   select proname, prosrc from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('set_cast_sensitive','get_cast_sensitive','get_cast_mynumber','get_cast_mynumber_masked','set_cast_tax_profile','payment_record_add') order by proname;
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('set_cast_sensitive','get_cast_sensitive','get_cast_mynumber','get_cast_mynumber_masked','set_cast_tax_profile','payment_record_add') order by proname;
--   -- search_path=public,extensions（暗号化/復号 RPC）
--   select proname, coalesce(array_to_string(proconfig,','),'(none)') from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('set_cast_sensitive','get_cast_mynumber','get_cast_mynumber_masked');
--   -- get_cast_mynumber は service_role のみ（authenticated/anon/public 不在）
--   -- cast_sensitive 封印不変: ポリシー0・authenticated grant 0
--   select count(*) from pg_policies where schemaname='public' and tablename='cast_sensitive';  -- 期待 0
--   -- reg_no 既存汚染の把握（not valid ゆえ mig は通るが、既存の非適合 reg_no を可視化＝0 が理想）
--   select count(*) as bad_reg_no from public.cast_tax_profiles where reg_no is not null and reg_no !~ '^T[0-9]{13}$';
--   -- payment_records: RLS 有効・SELECT 1本・idem 一意・cast_tax_profiles reg_no 制約
--   select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname='payment_records';
--   select indexname from pg_indexes where schemaname='public' and indexname='payment_records_idem_uidx';
--   -- 往復動作アンカー（service/JWT 要＝F2d verify 追記で実施）: set(text)→enc 生成→get_cast_mynumber で平文一致・
--   --   masked は末尾4桁のみ・cast 本人以外拒否・full は service のみ・reg_no 形式拒否・payment Σ≤net。

begin;

-- ══════════════════════════════════════════════════════════════
-- ① set_cast_sensitive 改修（p_mynumber text・DB 内 pgp_sym_encrypt・search_path=public,extensions）
--   旧 (uuid,text,date,bytea) を drop してから新 (uuid,text,date,text) を create（実装ノート【3】）。
--   real_name/birthday は現行と一字一致（p_real_name/p_birthday を直接 upsert）。
-- ══════════════════════════════════════════════════════════════
drop function if exists public.set_cast_sensitive(uuid, text, date, bytea);
create or replace function public.set_cast_sensitive(
  p_cast_id   uuid,
  p_real_name text,
  p_birthday  date,
  p_mynumber  text   -- 平文マイナンバー（TLS 経由）。DB 内で暗号化し mynumber_enc へ。★null は mynumber を変更しない
                     --   （既存 enc を保持＝real_name/birthday 単独更新で誤消去しない・相談役 provided 判定と整合）。
                     --   明示的な mynumber 削除経路は本 mig では設けない（必要時に別 RPC で後続）。
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cast_org       uuid;
  v_cast_store     uuid;
  v_fields         text[] := array[]::text[];
  v_old_real_name  text;
  v_old_birthday   date;
  v_key            text;
  v_enc            bytea;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- before 行（real_name/birthday の実値比較用・mynumber は非決定暗号ゆえ provided 判定）
  select cs.real_name, cs.birthday into v_old_real_name, v_old_birthday
    from public.cast_sensitive cs where cs.cast_id = p_cast_id;

  -- 平文を DB 内で対称暗号化（鍵は Vault・名前参照＝鍵リテラルなし・実装ノート【2】）。
  if p_mynumber is not null then
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
    if v_key is null then raise exception 'mynumber key missing'; end if; -- 鍵未登録は fail-closed（①未実行）
    v_enc := extensions.pgp_sym_encrypt(p_mynumber, v_key);
  else
    v_enc := null;
  end if;

  -- ★mynumber_enc は p_mynumber 非 null 時のみ更新（null は既存保持＝誤消去防止・破壊的 upsert を回避）。
  insert into public.cast_sensitive (cast_id, org_id, store_id, real_name, birthday, mynumber_enc)
  values (p_cast_id, v_cast_org, v_cast_store, p_real_name, p_birthday, v_enc)
  on conflict (cast_id) do update
    set real_name = excluded.real_name, birthday = excluded.birthday,
        mynumber_enc = case when p_mynumber is not null then excluded.mynumber_enc else public.cast_sensitive.mynumber_enc end,
        store_id = excluded.store_id;

  -- 監査（平文を入れない・変更フィールド名のみ＝マスク・array_append で連結）。
  --   real_name/birthday は実値比較（消去も検出）。mynumber は非決定暗号＋null=保持ゆえ provided 判定（相談役スペック）。
  if p_real_name is distinct from v_old_real_name then v_fields := array_append(v_fields, 'real_name'); end if;
  if p_birthday  is distinct from v_old_birthday  then v_fields := array_append(v_fields, 'birthday');  end if;
  if p_mynumber is not null then v_fields := array_append(v_fields, 'mynumber'); end if;
  perform public.audit_log_write('set_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, jsonb_build_object('fields_changed', to_jsonb(v_fields)), v_cast_store);
  return p_cast_id;
end $$;
revoke execute on function public.set_cast_sensitive(uuid, text, date, text) from public, anon;
grant  execute on function public.set_cast_sensitive(uuid, text, date, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ② get_cast_sensitive 改修（mynumber は mynumber_set boolean・enc/平文を晒さない）
--   戻り値型変更ゆえ drop 先行。owner＋cast 本人・全読取 audit は現行維持。search_path=public（復号しない）。
-- ══════════════════════════════════════════════════════════════
drop function if exists public.get_cast_sensitive(uuid);
create or replace function public.get_cast_sensitive(
  p_cast_id uuid
) returns table (
  cast_id      uuid,
  real_name    text,
  birthday     date,
  mynumber_set boolean   -- 平文/enc は返さない＝登録済みか否かのみ（末尾4桁は get_cast_mynumber_masked）
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
  if v_role = 'owner' then
    null;
  elsif v_role = 'cast' then
    v_self := public.auth_cast_id();
    if v_self is null then raise exception 'forbidden'; end if;
    if v_self <> p_cast_id then raise exception 'forbidden'; end if;
  else
    raise exception 'forbidden';
  end if;

  perform public.audit_log_write('read_cast_sensitive', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  return query
    select cs.cast_id, cs.real_name, cs.birthday, (cs.mynumber_enc is not null) as mynumber_set
    from public.cast_sensitive cs
    where cs.cast_id = p_cast_id;
end $$;
revoke execute on function public.get_cast_sensitive(uuid) from public, anon;
grant  execute on function public.get_cast_sensitive(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ③ get_cast_mynumber（service_role 限定・full 平文復号・支払調書経路・p_org_id 明示照合・全復号 audit）
--   authenticated には grant しない＝二重防御①の代替は p_org_id 明示照合（service キーは auth.uid() なし）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.get_cast_mynumber(
  p_org_id  uuid,
  p_actor   uuid,
  p_cast_id uuid
) returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_key        text;
  v_enc        bytea;
  v_plain      text;
begin
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
    where c.id = p_cast_id;
  if v_cast_org is null then raise exception 'not found'; end if;
  if p_org_id is null or v_cast_org <> p_org_id then raise exception 'forbidden'; end if; -- org 明示照合（service キー代替）

  -- 復号は必ず audit（平文値は記録しない・action/target のみ）。復号前に記録＝試行も残す。
  perform public.audit_log_write_service(p_org_id, p_actor, 'read_cast_mynumber',
    'cast_sensitive:' || p_cast_id::text, null, null, v_cast_store);

  if v_enc is null then return null; end if; -- 未登録
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
  if v_key is null then raise exception 'mynumber key missing'; end if;
  v_plain := extensions.pgp_sym_decrypt(v_enc, v_key);
  return v_plain;
end $$;
revoke execute on function public.get_cast_mynumber(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.get_cast_mynumber(uuid, uuid, uuid) to service_role;

-- ══════════════════════════════════════════════════════════════
-- ④ get_cast_mynumber_masked（cast 本人のみ・末尾4桁のみ・先頭は返さない・DB 内 decrypt・audit）
--   owner/manager もこの RPC で他 cast の末尾4桁は取れない（cast 本人限定）。full 平文は ③ service のみ。
-- ══════════════════════════════════════════════════════════════
create or replace function public.get_cast_mynumber_masked(
  p_cast_id uuid
) returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_self       uuid;
  v_key        text;
  v_enc        bytea;
  v_plain      text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'cast' then raise exception 'forbidden'; end if; -- cast 本人のみ（owner/manager 不可）
  v_self := public.auth_cast_id();
  if v_self is null or v_self <> p_cast_id then raise exception 'forbidden'; end if; -- 本人の cast_id のみ
  select c.org_id, c.store_id, cs.mynumber_enc into v_cast_org, v_cast_store, v_enc
    from public.casts c left join public.cast_sensitive cs on cs.cast_id = c.id
    where c.id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;

  -- 復号ゆえ audit（末尾4桁も含め値は記録しない）。
  perform public.audit_log_write('read_cast_mynumber_masked', 'cast_sensitive:' || p_cast_id::text,
    null, null, v_cast_store);

  if v_enc is null then return null; end if; -- 未登録
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'nox_mynumber_key';
  if v_key is null then raise exception 'mynumber key missing'; end if;
  v_plain := extensions.pgp_sym_decrypt(v_enc, v_key);
  -- ★末尾4桁のみ返す（先頭8桁は絶対に返さない・平文全体は関数外に出さない）。
  return '********' || right(v_plain, 4);
end $$;
revoke execute on function public.get_cast_mynumber_masked(uuid) from public, anon;
grant  execute on function public.get_cast_mynumber_masked(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑤ set_cast_tax_profile 改修（reg_no に ^T[0-9]{13}$ 形式 check 追加・他は mig0015 と一字一致）
--   invoice の課税/免税 check は既存（mig0015）。列 check 制約も defense で追加（直書き経路は無いが二重化）。
-- ══════════════════════════════════════════════════════════════
-- ★not valid＝既存行を遡及検証しない（既存に非適合 reg_no があっても mig 全ロールバックしない）。
--   新規/更新経路は RPC の !~ 検証と本 check（新規行に適用）で塞ぐ。既存汚染は下記事前チェックで把握。
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cast_tax_profiles_reg_no_fmt') then
    alter table public.cast_tax_profiles
      add constraint cast_tax_profiles_reg_no_fmt check (reg_no is null or reg_no ~ '^T[0-9]{13}$') not valid;
  end if;
end $$;

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
  if p_reg_no is not null and p_reg_no !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if; -- ★F2d 追加
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

-- ══════════════════════════════════════════════════════════════
-- ⑥ payment_records（1確定給与 run_id/cast_id に複数行可・パターン1・客情報なし）
-- ══════════════════════════════════════════════════════════════
create table if not exists public.payment_records (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  store_id    uuid not null references public.stores(id),
  run_id      uuid not null references public.payroll_runs(id),
  cast_id     uuid not null references public.casts(id),
  paid_amount int  not null check (paid_amount > 0),
  paid_at     date not null,
  method      text,   -- 現金/振込 等（任意）
  note        text,
  idem_key    uuid not null,   -- 冪等キー（UI 生成・二重挿入/リトライ防止・Σ を膨らませない直列化）
  created_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists payment_records_run_cast_idx on public.payment_records (run_id, cast_id);
create index if not exists payment_records_cast_idx      on public.payment_records (cast_id);
create index if not exists payment_records_org_idx       on public.payment_records (org_id);
create unique index if not exists payment_records_idem_uidx on public.payment_records (idem_key);

alter table public.payment_records enable row level security;
-- パターン1（cast は自分の支払記録のみ・客情報なし・adv/okuri と同型）
drop policy if exists payment_records_select on public.payment_records;
create policy payment_records_select on public.payment_records
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'owner' or store_id = public.auth_store_id())
    and (public.auth_role() <> 'cast' or cast_id = public.auth_cast_id())
  );
-- grant 標準型（revoke all → SELECT のみ・書込は RPC 経由）
revoke all on table public.payment_records from public, anon, authenticated;
grant select on table public.payment_records to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ⑦ payment_record_add（manager+・audit・run finalized/paid・Σ paid_amount ≤ payslip.net）
-- ══════════════════════════════════════════════════════════════
create or replace function public.payment_record_add(
  p_run_id   uuid,
  p_cast_id  uuid,
  p_amount   int,
  p_paid_at  date,
  p_method   text,
  p_note     text,
  p_idem_key uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run    record;
  v_net    int;
  v_paid   int;
  v_actor  uuid;
  v_id     uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_paid_at is null then raise exception 'bad date'; end if;
  if p_idem_key is null then raise exception 'idem required'; end if;
  select id, org_id, store_id, status into v_run from public.payroll_runs where id = p_run_id;
  if v_run.id is null or v_run.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_run.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_run.status not in ('finalized','paid') then raise exception 'run not finalized'; end if; -- payslip 凍結済みのみ

  -- 冪等リプレイ（原則9: org/ロール照合の後）＝同一 idem は既存を返す（Σ 再チェックせず・二重挿入なし）。
  select id into v_id from public.payment_records where idem_key = p_idem_key;
  if v_id is not null then return v_id; end if;

  -- ★対象 payslip（run×cast）行を FOR UPDATE でロック＝並行 payment_record_add を直列化（Σ≤net の TOCTOU 排除）。
  select net into v_net from public.payslips where run_id = p_run_id and cast_id = p_cast_id for update;
  if v_net is null then raise exception 'no payslip'; end if;
  -- ロック保持下で既存支払合計＋今回 ≤ net（過払いガード＝Σ≤net・原子的）。
  select coalesce(sum(paid_amount), 0) into v_paid from public.payment_records where run_id = p_run_id and cast_id = p_cast_id;
  if v_paid + p_amount > v_net then raise exception 'exceeds net'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- idem 一意で二重挿入を排他（並行同一 idem は do nothing→既存を返す）。
  insert into public.payment_records (org_id, store_id, run_id, cast_id, paid_amount, paid_at, method, note, idem_key, created_by)
  values (v_run.org_id, v_run.store_id, p_run_id, p_cast_id, p_amount, p_paid_at, nullif(trim(coalesce(p_method,'')),''), nullif(trim(coalesce(p_note,'')),''), p_idem_key, v_actor)
  on conflict (idem_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.payment_records where idem_key = p_idem_key; -- 並行競合で挿入されず＝既存を返す
    return v_id;
  end if;

  perform public.audit_log_write('payment_record_add', 'payment_records:' || v_id::text,
    null, jsonb_build_object('run_id', p_run_id, 'cast_id', p_cast_id, 'paid_amount', p_amount, 'paid_at', p_paid_at), v_run.store_id);
  return v_id;
end $$;
revoke execute on function public.payment_record_add(uuid, uuid, int, date, text, text, uuid) from public, anon;
grant  execute on function public.payment_record_add(uuid, uuid, int, date, text, text, uuid) to authenticated;

commit;
