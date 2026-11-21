-- 0202e_line_verify.sql（2026-11-21 夜 起草・CC・相談役 22:10 の ■4＝起草と試走まで・適用しない・0202b の後に貼る）
-- 名前: 0202e LINE 連携の確かめを LINE に聞く形に（onb_line_verify 作り直し）＋ ops_org_list にオーナーの受諾と LINE の確かめの日時
-- 翻訳元: なし（NOX 独自・相談役 11/21 22:10 の判断 2・6）
-- 前提: 0202b の後（関数 478・表 126）。関数と表の数は変わらない（drop して create が 2 本）。
-- 変えるもの:
--   ★1 onb_line_verify(p_kind, p_ref, p_store_id, p_result jsonb) returns timestamptz：「つながった人が 1 人以上」を外す。
--       p_result＝service の route が Vault のトークンで LINE に聞いた結果の真偽だけ（bot_id_match・webhook_endpoint_ok・webhook_active・webhook_test_ok）。全部が真のときだけ line_config.line_verified_at に時刻・戻りはその時刻。1 つでも偽なら書かない・戻りは null。
--       監査（店の監査と運営の監査）には結果の真偽だけを残す（トークン・URL・ボットの ID は残さない）。service だけ（route が運営者を確かめてから admin で呼ぶ）。
--   ★2 ops_org_list に owner_accepted_at・line_verified_at（末尾に 2 列）。ほかの列と判定は 1 字も変えない（生成器 docs/tmp/gen_0202e.cjs で本番の今の本文から作った）。
-- 検証クエリ（貼った後）: docs/tmp/0202e_verify.sql（先頭は貼り先証明）
begin;
set local lock_timeout = '10s';

drop function public.onb_line_verify(text, text, uuid);
CREATE FUNCTION public.onb_line_verify(p_kind text, p_ref text, p_store_id uuid, p_result jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ★0202e: LINE の 4 段目＝LINE に聞いた結果で確かめる（つながった人の数は見ない）。結果は route が出す真偽だけ＝トークンはここに来ない
declare
  v_row record;
  v_ok boolean;
  v_at timestamptz := now();
  v_res jsonb;
begin
  select s.id, s.org_id, s.line_config into v_row from public.stores s where s.id = p_store_id for update;
  if v_row.id is null or not public.onb_can_write(p_kind, p_ref, v_row.org_id) then raise exception 'forbidden'; end if;
  if coalesce(v_row.line_config->>'access_token_ref', '') = '' or coalesce(v_row.line_config->>'liff_id', '') = '' then raise exception 'not configured'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object'   -- 鍵が欠けると jsonb_typeof が null＝coalesce で偽にする（null の比べはすり抜ける）
     or coalesce(jsonb_typeof(p_result->'bot_id_match'), '') <> 'boolean' or coalesce(jsonb_typeof(p_result->'webhook_endpoint_ok'), '') <> 'boolean'
     or coalesce(jsonb_typeof(p_result->'webhook_active'), '') <> 'boolean' or coalesce(jsonb_typeof(p_result->'webhook_test_ok'), '') <> 'boolean' then raise exception 'bad result'; end if;
  v_res := jsonb_build_object('bot_id_match', (p_result->>'bot_id_match')::boolean, 'webhook_endpoint_ok', (p_result->>'webhook_endpoint_ok')::boolean,
                              'webhook_active', (p_result->>'webhook_active')::boolean, 'webhook_test_ok', (p_result->>'webhook_test_ok')::boolean);   -- 真偽の 4 つだけ（ほかの鍵は捨てる）
  v_ok := (v_res->>'bot_id_match')::boolean and (v_res->>'webhook_endpoint_ok')::boolean and (v_res->>'webhook_active')::boolean and (v_res->>'webhook_test_ok')::boolean;
  if v_ok then
    update public.stores set line_config = jsonb_set(coalesce(line_config, '{}'::jsonb), '{line_verified_at}', to_jsonb(v_at), true), updated_at = now() where id = p_store_id;
  end if;
  perform public.onb_audit_write(p_kind, p_ref, v_row.org_id, p_store_id, 'onb.line_verify', 'stores:' || p_store_id::text, null, v_res || jsonb_build_object('ok', v_ok));
  return case when v_ok then v_at end;
end $function$;
revoke all on function public.onb_line_verify(text, text, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.onb_line_verify(text, text, uuid, jsonb) to service_role;

drop function public.ops_org_list(uuid);
CREATE FUNCTION public.ops_org_list(p_ops uuid)
 RETURNS TABLE(org_id uuid, org_name text, kind text, store_count integer, billing_status text, trial_ends_at timestamp with time zone, has_subscription boolean, agency_code text, onboarding_state text, onboarding_done_at timestamp with time zone, owner_email text, owner_invited_at timestamp with time zone, owner_accepted boolean, setup_done_stores integer, setup_step_max integer, setup_draft_at timestamp with time zone, line_login_stores integer, line_notify_stores integer, line_richmenu_stores integer, line_links integer, cast_count integer, staff_count integer, last_used_at timestamp with time zone, created_at timestamp with time zone, owner_accepted_at timestamp with time zone, line_verified_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.ops_operator_ok(p_ops) then raise exception 'forbidden'; end if;
  return query
  select o.id, o.name,
         case when o.is_demo then 'demo' when o.name like 'NOX-VERIFY-%' or o.name like 'NOX-CHECK-%' then 'verify'   -- 確かめ用の会社（コンソールで作る・予約の名前には入れない＝相談役 11/20 18:05 ④）
              when b.status = 'trialing' then 'trial'
              when b.status = 'active' and b.stripe_subscription_id is null then 'tester'
              else coalesce(b.status, 'none') end,
         (select count(*)::int from public.stores s where s.org_id = o.id),
         b.status, b.trial_ends_at, b.stripe_subscription_id is not null,
         o.agency_code, o.onboarding_state, o.onboarding_done_at,
         ow.email, ow.invited_at, (ow.last_sign_in_at is not null or ow.email_confirmed_at is not null),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.settings_json->>'setup_done', 'false') = 'true'),
         (select max(case when jsonb_typeof(d.data->'S'->'step') = 'number' then (d.data->'S'->>'step')::int end) from public.setup_drafts d where d.org_id = o.id),
         (select max(d.updated_at) from public.setup_drafts d where d.org_id = o.id),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'login_channel_id', '') <> '' and coalesce(s.line_config->>'liff_id', '') <> ''),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'access_token_ref', '') <> ''),
         (select count(*)::int from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'richmenu_id_default', '') <> ''),
         (select count(*)::int from public.line_links l where l.org_id = o.id and l.blocked_at is null),
         (select count(*)::int from public.casts c where c.org_id = o.id and c.is_active),
         (select count(*)::int from public.memberships m join public.stores s on s.id = m.store_id where s.org_id = o.id and m.is_active and m.role in ('manager', 'staff')),
         greatest((select max(a.last_sign_in_at) from public.users u join auth.users a on a.id = u.auth_user_id where u.org_id = o.id),
                  (select max(k.last_seen_at) from public.kiosk_sessions k where k.org_id = o.id)),
         o.created_at,
         case when ow.email is null then null else coalesce(ow.email_confirmed_at, ow.last_sign_in_at) end,   -- ★0202e: オーナーの受諾の日時（招待の確認か最初のログイン）
         (select max((s.line_config->>'line_verified_at')::timestamptz) from public.stores s where s.org_id = o.id and coalesce(s.line_config->>'line_verified_at', '') <> '')   -- ★0202e: LINE の確かめの日時（店の中で最新）
    from public.orgs o
    left join public.org_billing b on b.org_id = o.id
    left join lateral (
      select a.email::text, a.invited_at, a.last_sign_in_at, a.email_confirmed_at
        from public.memberships m join public.users u on u.id = m.user_id join public.stores s on s.id = m.store_id
        join auth.users a on a.id = u.auth_user_id
       where s.org_id = o.id and m.role = 'owner' and m.is_active
       order by m.created_at limit 1) ow on true
   order by o.created_at desc;
end $function$;
revoke all on function public.ops_org_list(uuid) from public, anon, authenticated, service_role;
grant execute on function public.ops_org_list(uuid) to service_role;

commit;
