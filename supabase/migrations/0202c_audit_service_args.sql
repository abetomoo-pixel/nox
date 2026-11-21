-- 0202c_audit_service_args.sql（2026-11-20 夜便 N4 起草・CC・相談役＝起草と試走まで・適用しない）
-- 名前: 0202c 0176 の audit_log_write_service の引数の取り違え 4 か所（店の id が行い手の欄に入り、店の欄が空）
-- 翻訳元: なし（NOX 独自・0176_people_line.sql の 288／363／569／872 行と同じ形が本番に残っている）
-- 前提: 0202a・0202b とは独立（どの順でもよい）。関数の数・表の数は変えない（create or replace 4 本）。
-- 変えるもの: set_line_secret・bind_line・staff_invite_accept・shift_periods_auto_close の監査の呼び出し 1 か所ずつ＝2 つ目（p_actor＝actor_user_id）を null・7 つ目（p_store_id）を店の id。ほかは 1 字も変えない（生成器 docs/tmp/gen_0202c.cjs で本番の今の本文から作った）。
-- 今までに書かれた 8 行（bind_line 4・set_line_secret 2・shift_period_auto_close 2＝actor_user_id が店の id・store_id が null）は直さない（直すかは判断＝docs/tmp/0202c_data_fix.sql を別に置いた）。
-- 検証クエリ（貼った後）: docs/tmp/0202c_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.set_line_secret(p_store_id uuid, p_kind text, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LINE のシークレット＝Supabase Vault（名前 nox_line_<kind>_<storeId>・冪等＝BANZEN 0015 と同じ）。kind＝channel_secret／access_token。
--   service_role だけ（route /api/stores/line-config が owner／manager を検査してから admin client で呼ぶ）。ref（vault.secrets.id）を stores.line_config に写す。値は audit に書かない
declare
  v_name text;
  v_ref  uuid;
  v_key  text;
begin
  if p_kind is null or p_kind not in ('channel_secret','access_token') then raise exception 'bad kind'; end if;
  if p_secret is null or length(trim(p_secret)) = 0 or length(p_secret) > 1000 then raise exception 'bad secret'; end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id) then raise exception 'not found'; end if;
  v_name := 'nox_line_' || p_kind || '_' || p_store_id::text;
  v_key  := p_kind || '_ref';
  select nullif(s.line_config->>v_key, '')::uuid into v_ref from public.stores s where s.id = p_store_id;
  if v_ref is not null and not exists (select 1 from vault.secrets v where v.id = v_ref) then v_ref := null; end if;
  if v_ref is null then
    select v.id into v_ref from vault.secrets v where v.name = v_name;
    if v_ref is null then
      v_ref := vault.create_secret(p_secret, v_name, 'NOX LINE secret');
    else
      perform vault.update_secret(v_ref, p_secret);
    end if;
  else
    perform vault.update_secret(v_ref, p_secret);
  end if;
  update public.stores set line_config = jsonb_set(coalesce(line_config, '{}'::jsonb), array[v_key], to_jsonb(v_ref::text), true), updated_at = now() where id = p_store_id;
  perform public.audit_log_write_service((select org_id from public.stores where id = p_store_id), null, 'set_line_secret', 'stores:' || p_store_id::text,
    null, jsonb_build_object('kind', p_kind, 'ref', v_ref), p_store_id);   -- ★0202c: 2 つ目は行い手（null）・7 つ目が店
end $function$;

-- 権限は create or replace で保たれる（今の proacl＝{postgres=X/postgres,service_role=X/postgres}）

CREATE OR REPLACE FUNCTION public.bind_line(p_token_hash text, p_line_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★1 0176（401）: LIFF からの紐付け＝未使用・期限内のトークン → 同じ LINE が org に既にあれば 'line already linked' → line_links 1 行 → トークンを使用済みに（1 回で行う・BANZEN 0012 と同じ）。
--   service_role だけ（route /api/line/bind が id_token を確かめてから呼ぶ）。戻り＝subject と store（route がセッションを作る材料）
declare
  v_t record;
begin
  if p_token_hash is null or p_line_user_id is null or p_line_user_id !~ '^U[0-9a-f]{32}$' then raise exception 'bad input'; end if;
  select * into v_t from public.line_bind_tokens where token_hash = p_token_hash for update;
  if v_t.id is null or v_t.used_at is not null or v_t.expires_at < now() then raise exception 'bad token'; end if;
  if exists (select 1 from public.line_links l where l.org_id = v_t.org_id and l.line_user_id = p_line_user_id and not (l.subject_kind = v_t.subject_kind and l.subject_id = v_t.subject_id)) then
    raise exception 'line already linked';
  end if;
  insert into public.line_links (org_id, store_id, subject_kind, subject_id, line_user_id)
  values (v_t.org_id, v_t.store_id, v_t.subject_kind, v_t.subject_id, p_line_user_id)
  on conflict (subject_kind, subject_id) do update set line_user_id = excluded.line_user_id, store_id = excluded.store_id, updated_at = now();
  update public.line_bind_tokens set used_at = now() where id = v_t.id;
  perform public.audit_log_write_service(v_t.org_id, null, 'bind_line', v_t.subject_kind || 's:' || v_t.subject_id::text, null, jsonb_build_object('purpose', v_t.purpose), v_t.store_id);   -- ★0202c: 2 つ目は行い手（null）・7 つ目が店
  return jsonb_build_object('subject_kind', v_t.subject_kind, 'subject_id', v_t.subject_id, 'store_id', v_t.store_id, 'org_id', v_t.org_id, 'purpose', v_t.purpose);
end $function$;

-- 権限は create or replace で保たれる（今の proacl＝{postgres=X/postgres,service_role=X/postgres}）

CREATE OR REPLACE FUNCTION public.staff_invite_accept(p_token_hash text, p_auth_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★2 0176（I-1）: 招待の受諾＝route（service_role）が Auth ユーザーを作ってから呼ぶ。users＋memberships（＋契約の下書きがあれば staff_contracts）を 1 回で作り、招待を使用済みに。戻り＝memberships.id
declare
  v_i record; v_user uuid; v_mem uuid; v_c jsonb;
begin
  if p_token_hash is null or p_auth_user_id is null then raise exception 'bad input'; end if;
  select * into v_i from public.staff_invites where token_hash = p_token_hash for update;
  if v_i.id is null or v_i.accepted_at is not null or v_i.expires_at < now() then raise exception 'bad token'; end if;
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then raise exception 'user exists'; end if;
  insert into public.users (org_id, auth_user_id, email, name) values (v_i.org_id, p_auth_user_id, v_i.email, v_i.name) returning id into v_user;
  insert into public.memberships (user_id, store_id, role) values (v_user, v_i.store_id, v_i.role) returning id into v_mem;
  v_c := coalesce(v_i.contract, '{}'::jsonb);
  insert into public.staff_contracts (membership_id, org_id, store_id, contract_kind, pay_kind, hourly, monthly, daily, fixed_allowance, tax_class, withholding_rate, valid_from)
  values (v_mem, v_i.org_id, v_i.store_id,
          coalesce(v_c->>'contract_kind', 'parttime'), coalesce(v_c->>'pay_kind', 'hourly'),
          coalesce((v_c->>'hourly')::int, 0), nullif(v_c->>'monthly', '')::int, nullif(v_c->>'daily', '')::int, coalesce((v_c->>'fixed_allowance')::int, 0),
          nullif(v_c->>'tax_class', ''), coalesce((v_c->>'withholding_rate')::numeric, case when v_c->>'contract_kind' = 'contractor' then 10.21 else 0 end), nullif(v_c->>'valid_from', '')::date);
  update public.staff_invites set accepted_at = now(), accepted_user_id = v_user where id = v_i.id;
  perform public.audit_log_write_service(v_i.org_id, null, 'staff_invite_accept', 'memberships:' || v_mem::text, null, jsonb_build_object('invite_id', v_i.id, 'role', v_i.role), v_i.store_id);   -- ★0202c: 2 つ目は行い手（null）・7 つ目が店
  return v_mem;
end $function$;

-- 権限は create or replace で保たれる（今の proacl＝{postgres=X/postgres,service_role=X/postgres}）

CREATE OR REPLACE FUNCTION public.shift_periods_auto_close()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★5 0176（SH-UI-b 0176 行き (b)）: 希望の締切（wish_deadline）を過ぎた募集中（open）の期間を配置中（closed）へ＝表示の実効段（effectiveStageOf）を正本化。
--   service_role だけ（Vercel cron route /api/cron/shift-periods-close＝毎日 JST 06:10 の見込み＝P176）。audit は org ごとに 1 行（service）。戻り＝遷移した件数
declare
  v_n int := 0; v_r record;
begin
  for v_r in
    update public.shift_periods p
       set status = 'closed', updated_at = now()
     where p.status = 'open' and p.wish_deadline is not null and p.wish_deadline < (now() at time zone 'Asia/Tokyo')::date
    returning p.id, p.org_id, p.store_id
  loop
    v_n := v_n + 1;
    perform public.audit_log_write_service(v_r.org_id, null, 'shift_period_auto_close', 'shift_periods:' || v_r.id::text, jsonb_build_object('status', 'open'), jsonb_build_object('status', 'closed'), v_r.store_id);   -- ★0202c: 2 つ目は行い手（null）・7 つ目が店
  end loop;
  return v_n;
end $function$;

-- 権限は create or replace で保たれる（今の proacl＝{postgres=X/postgres,service_role=X/postgres}）

commit;
