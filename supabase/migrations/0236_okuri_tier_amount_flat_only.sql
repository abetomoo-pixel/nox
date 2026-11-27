-- 0236d_okuri_tier_amount_flat_only（決め d 版＝区分の額は定額の店だけ・Agoora の承認 11/27・#64・重大 R15「送りの距離区分」・相談役 11/26 22:10 の段ウ・起草と試走まで・適用はしない）
--   経緯：控除・送り の「距離区分」とキャストの「送り区分」の説明は「退勤時の送りはその額が既定」と言うが、本人の退勤（transport_issue_self）と
--     店の端末（kiosk_transport_issue）は送りベース額をそのまま記録していた。区分の額を使うのは締めの前の窓（okuri_today_summary・0180 ★3）の未記録分だけ。
--   中身：作り直し 3 本（同じ署名・CREATE OR REPLACE・ACL は本番と同じ文で言い直す＝public／anon を revoke → authenticated／service_role）。
--     記録の額＝送りの方式が定額（flat）の店だけ、キャストの送り区分の額（okuri_flat_tiers の code 一致）→ 無ければ送りベース額。実費（actual）・店負担（store）の店はベース額（額 0 の区分も記録する）。
--     'no base amount' の止め・冪等・支払済みの止め・監査の形は前のまま（監査の amount は記録した額）。
--     ★Agoora の決め（相談役 11/26 22:50）: 定額の店で額 0 の区分のキャストは transport の行を作らない（締めの前の窓の 0 にそろえる）＝冪等の照合の後で null を返す（監査なし＝書いていない）。本番の額 0 の区分は 0 件。
--     ★3（11/27 12:25 の相談役の 1）: 締めの前の窓 okuri_today_summary の既定の額も同じ形（定額の店だけ区分の額・ほかはベース額）＝窓の額と記録の額が方式を問わず同じ。役の判定（0201v）・未記録の数え方は前のまま。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。transport_issue_bulk（店が額を入れる道）は触らない。給与の計算（pay.ts）は transport.amount をそのまま読む＝式は不変。
--   翻訳元：本番の transport_issue_self（md5(prosrc) 4d890524d567103df6862398bd45da15）・kiosk_transport_issue（md5(prosrc) 3e19adf94002de1aedd9264fe48161b8）・okuri_today_summary（md5(prosrc) fee3087c5ce100a6234bd735395140f2）。
--   当てた後の md5（CR を除く）：transport_issue_self 63a966ab0e79c4135d372e10e7b5985d・kiosk_transport_issue 458862230ddb4620362113a5f7478362・okuri_today_summary 8f315de12f80fc61d82e915b9095e61a。
--   本番の今の定義との差分：docs/tmp/okuri_tier_1126/diff_live.md（transport の 2 本）・new_d/okuri_today_summary.sql（★3 の 1 か所）。生成：gen-0236d.mjs。
--   事前確認：docs/tmp/okuri_tier_1126/0236d_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/okuri_tier_1126/0236d_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 transport_issue_self（作り直し） ═══
CREATE OR REPLACE FUNCTION public.transport_issue_self(p_punch_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast  uuid;
  v_p     record;
  v_store record;
  v_base  integer;
  v_amt   integer;   -- ★0236: 記録する額（区分の額 → ベース額）
  v_mode  text;    -- ★0177（裁定414）: 店の送り方式（記録に刻む）
  v_date  date;
  v_idem  uuid;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'forbidden'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at into v_p from public.punches p where p.id = p_punch_id;
  -- 他人の打刻・他 org・存在しない id は同じ 'forbidden'（存在の手掛かりを出さない）
  if v_p.id is null or v_p.org_id <> public.auth_org_id() or v_p.cast_id <> v_cast then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  -- ★0236（#64・起票 R15）＋決め d（11/27・Agoora に確認中・相談役の推し）: 送りの方式が定額（flat）の店だけ、記録の額＝キャストの送り区分の額（okuri_flat_tiers の code が casts.okuri_tier と一致・額 0 も含む）→ 無ければ送りベース額。
  --   実費（actual）・店負担（store）の店はベース額（区分の画面は定額の店だけに出る＝定額で区分を付けた後に方式を替えた店で、画面に出ない区分が額を決めない）。
  --   ★Agoora の決め（相談役 11/26 22:50）: 額 0 の区分は transport の行を作らない（窓の 0 にそろえる）＝冪等の照合の後で null を返す（定額の店だけ＝実費・店負担の店の額 0 の区分はベース額で記録する）
  v_amt := case when v_mode = 'flat' then coalesce((select nullif(trim(e->>'amount'), '')::int
                       from public.casts c, jsonb_array_elements(coalesce(v_store.settings_json->'okuri_flat_tiers', '[]'::jsonb)) e
                      where c.id = v_p.cast_id and c.okuri_tier is not null and e->>'code' = c.okuri_tier
                      limit 1), v_base) else v_base end;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  -- 冪等（org／本人照合の後）: 同じ打刻の再送＝既存 id（transport_issue_bulk(p_idem_key＝punch_id) と同じキー＝二重発行しない）
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if v_amt <= 0 then return null; end if;   -- ★0236（Agoora の決め 11/26 22:50）: 額 0 の区分＝送りの行を作らない・監査も無し（何も書いていない）
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'forbidden'; end if;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_amt, v_date, null, v_actor, v_idem, v_mode)   -- ★0236: v_base → v_amt
  returning id into v_id;
  perform public.audit_log_write('transport_issue_self', 'transport:' || v_id::text,
    null, jsonb_build_object('cast_id', v_p.cast_id, 'amount', v_amt, 'biz_date', v_date, 'punch_id', v_p.id, 'mode', v_mode), v_p.store_id);
  return v_id;
end $function$;

revoke all on function public.transport_issue_self(uuid) from public, anon;
grant execute on function public.transport_issue_self(uuid) to authenticated, service_role;

-- ═══ ★2 kiosk_transport_issue（作り直し） ═══
CREATE OR REPLACE FUNCTION public.kiosk_transport_issue(p_punch_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device public.kiosk_devices;
  v_org    uuid;   -- ★5 0159（起票91）: 端末の org を受けてゲート行を規約形（billing_writable_of(v_org)）に
  v_p      record;
  v_store  record;
  v_base   integer;
  v_amt    integer;   -- ★0236: 記録する額（区分の額 → ベース額）
  v_mode   text;   -- ★0177（裁定414）: 店の送り方式（記録に刻む）
  v_date   date;
  v_idem   uuid;
  v_actor  uuid;
  v_id     uuid;
  v_ip     text;
begin
  select k.* into v_device from public.kiosk_devices k
    where k.auth_user_id = auth.uid() and k.is_active /* ★0192 M-47: 用途を見ない（1 台で全タイル） */;
  if not found then raise exception 'forbidden'; end if;
  v_org := v_device.org_id;   -- ★5 0159
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;   -- ★5 0159: 規約形（billing 段47-1「挿入行の形」）
  if p_punch_id is null then raise exception 'invalid_input'; end if;
  select p.id, p.org_id, p.store_id, p.cast_id, p.type, p.okuri, p.punched_at, p.source into v_p from public.punches p where p.id = p_punch_id;
  -- 他店・他 org・存在しない id・kiosk 以外の打刻は同じ 'forbidden'
  if v_p.id is null or v_p.org_id <> v_device.org_id or v_p.store_id <> v_device.store_id or v_p.source <> 'kiosk' then raise exception 'forbidden'; end if;
  if v_p.type <> 'out' or v_p.okuri is not true then raise exception 'not okuri punch'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = v_p.store_id;
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode = 'none' then raise exception 'okuri none'; end if;                                  -- ★0177（裁定414）: なし＝拒否
  if v_mode not in ('actual','flat','store') then raise exception 'bad okuri mode'; end if;                   -- ★0177: 不正値は拒否（fail-closed）
  v_base := nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::integer;
  if v_base is null or v_base <= 0 then raise exception 'no base amount'; end if;
  -- ★0236（#64・起票 R15）＋決め d（11/27・Agoora に確認中・相談役の推し）: 送りの方式が定額（flat）の店だけ、記録の額＝キャストの送り区分の額（okuri_flat_tiers の code が casts.okuri_tier と一致・額 0 も含む）→ 無ければ送りベース額。
  --   実費（actual）・店負担（store）の店はベース額（区分の画面は定額の店だけに出る＝定額で区分を付けた後に方式を替えた店で、画面に出ない区分が額を決めない）。
  --   ★Agoora の決め（相談役 11/26 22:50）: 額 0 の区分は transport の行を作らない（窓の 0 にそろえる）＝冪等の照合の後で null を返す（定額の店だけ＝実費・店負担の店の額 0 の区分はベース額で記録する）
  v_amt := case when v_mode = 'flat' then coalesce((select nullif(trim(e->>'amount'), '')::int
                       from public.casts c, jsonb_array_elements(coalesce(v_store.settings_json->'okuri_flat_tiers', '[]'::jsonb)) e
                      where c.id = v_p.cast_id and c.okuri_tier is not null and e->>'code' = c.okuri_tier
                      limit 1), v_base) else v_base end;
  v_date := public.biz_date_of(v_p.store_id, v_p.punched_at);
  v_idem := md5(v_p.id::text || ':' || v_p.cast_id::text)::uuid;
  select t.id into v_id from public.transport t where t.store_id = v_p.store_id and t.idem_key = v_idem;
  if v_id is not null then return v_id; end if;
  if v_amt <= 0 then return null; end if;   -- ★0236（Agoora の決め 11/26 22:50）: 額 0 の区分＝送りの行を作らない・監査も無し（何も書いていない）
  if v_p.punched_at < now() - interval '10 minutes' then raise exception 'punch expired'; end if;   -- 端末は cast を識別しない＝打刻直後だけ（起草判断 (h)）
  if exists (select 1 from public.payroll_runs
             where store_id = v_p.store_id and period = to_char(v_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select c.user_id into v_actor from public.casts c where c.id = v_p.cast_id;   -- 操作者なし＝cast の user（無ければ null）
  begin
    v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by, idem_key, mode)   -- ★0177: 記録時の店の方式を刻む
  values (v_p.org_id, v_p.store_id, v_p.cast_id, v_amt, v_date, null, v_actor, v_idem, v_mode)   -- ★0236: v_base → v_amt
  returning id into v_id;
  insert into public.audit_logs
    (org_id, store_id, actor_user_id, action, target, before_json, after_json, ip)
  values
    (v_device.org_id, v_device.store_id, null, 'kiosk_transport_issue',
     'transport:' || v_id::text, null,
     jsonb_build_object('kiosk_device_id', v_device.id, 'cast_id', v_p.cast_id, 'amount', v_amt,
                        'biz_date', v_date, 'punch_id', v_p.id, 'mode', v_mode),
     v_ip);
  return v_id;
end $function$;

revoke all on function public.kiosk_transport_issue(uuid) from public, anon;
grant execute on function public.kiosk_transport_issue(uuid) to authenticated, service_role;

-- ═══ ★3 okuri_today_summary（作り直し・締めの前の窓の既定の額） ═══
CREATE OR REPLACE FUNCTION public.okuri_today_summary(p_store_id uuid, p_biz_date date)
 RETURNS TABLE(punch_id uuid, cast_id uuid, cast_name text, punched_at timestamp with time zone, idem_key uuid, base_amount integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  select s.id, s.org_id, s.settings_json into v_store from public.stores s where s.id = p_store_id;
  if v_store.id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and p_store_id = public.auth_store_id()
              and (public.auth_staff_can_close() or public.auth_staff_can_shift()))) then   -- ★0201v（2026-11-20・相談役 ①）: 自店のスタッフで、締めの許可（can_close）か シフトの許可（can_shift）がある人も一覧を読める（締めの前の「今日の送り」の窓）。記録（transport_issue_bulk）は 0201u のまま＝シフトの許可がある人だけ。許可の無いスタッフ・キャストは今までどおり拒否
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.cast_id, c.name, p.punched_at,
           md5(p.id::text || ':' || p.cast_id::text)::uuid,
           -- ★0236d（決め d・相談役 11/27 12:25 の 1）: 区分の額は送りの方式が定額（flat）の店だけ（transport_issue_self・kiosk_transport_issue の v_amt と同じ）。実費・店負担の店はベース額＝窓の額と記録の額をそろえる
           case when coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat') = 'flat' then
           coalesce((select nullif(trim(e->>'amount'), '')::int                                           -- ★3 0180（裁定414 追補）: 区分の額を既定に（当日の金額は発行時に変更可）
                       from jsonb_array_elements(coalesce(v_store.settings_json->'okuri_flat_tiers', '[]'::jsonb)) e
                      where c.okuri_tier is not null and e->>'code' = c.okuri_tier limit 1),
                    nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::int)
           else nullif(trim(v_store.settings_json->>'okuri_base_amount'), '')::int end
      from public.punches p
      join public.casts c on c.id = p.cast_id
     where p.store_id = p_store_id and p.type = 'out' and p.okuri = true
       and public.biz_date_of(p_store_id, p.punched_at) = p_biz_date
       and not exists (select 1 from public.transport t
                        where t.store_id = p_store_id and t.idem_key = md5(p.id::text || ':' || p.cast_id::text)::uuid)
     order by p.punched_at;
end $function$;

revoke all on function public.okuri_today_summary(uuid, date) from public, anon;
grant execute on function public.okuri_today_summary(uuid, date) to authenticated, service_role;

commit;
