-- 0229_anonymize_scrub（相談役 11/26 22:10・段イ・#204／#205・根 R31「お客様の匿名化と保持期限」の前半・裁定511-5（Agoora・#205）に沿って・起草と試走まで・適用はしない）
--   当たり（手元の BEGIN … ROLLBACK で再現）：
--     #204 customer_anonymize は customer_notes を消し customers の行を伏せるだけ。キープのタグ名（既定「{顧客名} {ボトル名}」＝登録のときの写し）とメモ、
--          予約の呼び名（guest_name）とメモは元の値のまま＝キープの一覧・予約に元の名前が出続ける。
--     #205 customer_register・customer_update・customer_assign_cast は監査に顧客の行まるごと（名前・電話・誕生日・好み・メモ）、customer_note_add はメモの本文を書く。匿名化はこれを消さない。
--   裁定511-5（Agoora・2026-11-26 夜）：これからは監査の記録にお客様の名前・電話・メモの値を書かない。匿名化のときは前の監査の記録の個人の値も伏せる
--     （行は残す・伏せたこと自体を記録する）。「監査の記録は編集・削除できない」の決めへの例外（台帳 裁定511-5）。
--   中身（作り直し 5 本・同じ署名・CREATE OR REPLACE・ACL は今と同じ文で言い直す）：
--     ★1 customer_anonymize：(a) キープ（この人の全部の状態）のタグ名を「削除済み顧客 {ボトル名}」（ボトル名＝bottle_name → 商品名・60 字）に組み直し、メモを null に。
--         (b) 予約（customer_id がこの人）の呼び名を「削除済み顧客」（空のものは空のまま）に、メモを null に。
--         (c) 前の監査の記録の個人の値を「（匿名化で伏せた）」に置き換える（行・キー・ほかの値は残す）：customers:<id> の name・furigana・tel・birthday・prefs・memo／
--             この人のメモ customer_notes:<id> の body／この人の予約 reservations:<id> の guest_name・memo／この人のキープ bottle_keeps:<id> の tag_label・note。値が null のキーは触らない。
--         (d) 匿名化の監査の after に keeps_relabelled・reservations_cleared・audit_rows_masked（伏せた監査の行の数）と audit_masked_actions（その action の名前）を足す。fields（7 個）は今のまま。
--     ★2 customer_register：監査の after＝id・店・担当・入れた個人の欄の名前（fields）だけ（値は書かない）。
--     ★3 customer_update：監査の before／after＝is_active と、変わった個人の欄の名前（fields）だけ。匿名化済みのお客様は 'anonymized' で断る（画面は閉じている＝関数でも閉じる）。
--     ★4 customer_note_add：監査の after＝メモの id・お客様・文字数だけ（本文は書かない）。匿名化済みのお客様は 'anonymized' で断る。
--     ★5 customer_assign_cast：監査の before／after＝cast_id だけ。
--   入れていないもの（READY.md の「残り」）：領収書の宛名（receipt_issues.recipient・会計の書類として残すかの決めが要る）。予約・キープ・領収書の関数がこれから書く監査の呼び名・タグ名・宛名
--     （reservation_create ほか 6 本・bottle_keep_register／update・receipt_issue＝裁定511-5 の「これから書かない」の対象を広げるなら次の mig）。
--     ★6 1 回だけの追い付き：もう匿名化したお客様（デモでない会社）にも ★1 の (a)〜(c) を同じ式で当てる。変えたお客様ごとに監査 1 行（mig0229.mask_anonymized・system）。
--         本番の今（2026-11-26 22 時台）：匿名化済み 1 人・キープ 0・予約 0・名前と電話のキーが残る監査の行 1（customer_register）＝伏せる行 1・監査 1。もう 1 回流しても何もしない。
--   変えないもの：表・列・索引・ほかの関数（関数 525・表 133 のまま）。監査の行は消さない（値を伏せるだけ）。
--   翻訳元：本番の定義（md5(prosrc)）customer_anonymize d73dad5ea60a15a0a21552c46ea9aa69・customer_register 205b056d974b354b46e269421be65a76・customer_update 9ba716cbd3d4c6272757c3243535573b・
--     customer_note_add 69b4aade21400c15a832397c2609bf51・customer_assign_cast 45a259f784d899f6ff6ceca1edb633ad（docs/tmp/anonymize_1126/live/）。
--   本番の今の定義との差分：docs/tmp/anonymize_1126/diff_live.md。
--   事前確認：docs/tmp/anonymize_1126/0229_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/anonymize_1126/0229_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ ★1 customer_anonymize（作り直し） ═══
CREATE OR REPLACE FUNCTION public.customer_anonymize(p_customer_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cu     record;
  v_reason text;
  v_notes  int;   -- 309 追補1 (d): 同時削除した customer_notes の件数
  v_note_ids uuid[];   -- ★0229: 消すメモの id（前の監査の記録を伏せるため・消す前に取る）
  v_keeps  int := 0;   -- ★0229（#204）: タグ名を組み直したキープの数
  v_resv   int := 0;   -- ★0229（#204）: 呼び名・メモを伏せた予約の数
  v_masked int := 0;   -- ★0229（#205・裁定511-5）: 個人の値を伏せた監査の行の数
  v_actions text[];    -- ★0229: 伏せた監査の行の action
  c_mask constant jsonb := to_jsonb('（匿名化で伏せた）'::text);
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;                              -- 起草判断 (c)
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) > 200 then raise exception 'bad reason'; end if;
  select id, org_id, store_id, anonymized_at into v_cu from public.customers where id = p_customer_id for update;
  if v_cu.id is null or v_cu.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if v_cu.anonymized_at is not null then raise exception 'already anonymized'; end if;
  select coalesce(array_agg(n.id), '{}') into v_note_ids from public.customer_notes n where n.customer_id = p_customer_id;   -- ★0229
  delete from public.customer_notes where customer_id = p_customer_id;                                   -- 309 追補1 (d): 本文は audit に残さない
  get diagnostics v_notes = row_count;
  update public.customers
     set name          = '削除済み顧客',
         furigana      = null,
         tel           = null,
         birthday      = null,
         prefs         = null,
         memo          = null,
         is_active     = false,
         anonymized_at = now(),
         updated_at    = now()
   where id = p_customer_id;
  -- ★0229（#204）: キープのタグ名を組み直す（bottle_keep_register の既定と同じ式・顧客名は「削除済み顧客」）・メモを消す。人が付けたタグ名も名前を含みうるので全部組み直す
  update public.bottle_keeps b
     set tag_label = left('削除済み顧客 ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), (select p.name from public.products p where p.id = b.product_id), ''), 60),
         note = null
   where b.customer_id = p_customer_id and b.org_id = v_cu.org_id;
  get diagnostics v_keeps = row_count;
  -- ★0229（#204）: 予約の呼び名とメモ（customer_id がこの人）
  update public.reservations r
     set guest_name = case when nullif(trim(coalesce(r.guest_name, '')), '') is null then r.guest_name else '削除済み顧客' end,
         memo = null
   where r.customer_id = p_customer_id and r.org_id = v_cu.org_id;
  get diagnostics v_resv = row_count;
  -- ★0229（#205・裁定511-5）: 前の監査の記録の個人の値を伏せる（行・キー・ほかの値は残す・値が null のキーと伏せ済みは触らない）
  with t(target, keys) as (
    select 'customers:' || p_customer_id::text, array['name','furigana','tel','birthday','prefs','memo']
    union all select 'customer_notes:' || x::text, array['body'] from unnest(v_note_ids) x
    union all select 'reservations:' || r.id::text, array['guest_name','memo'] from public.reservations r where r.customer_id = p_customer_id and r.org_id = v_cu.org_id
    union all select 'bottle_keeps:' || b.id::text, array['tag_label','note'] from public.bottle_keeps b where b.customer_id = p_customer_id and b.org_id = v_cu.org_id
  ), m as (
    update public.audit_logs a
       set before_json = case when jsonb_typeof(a.before_json) = 'object' then coalesce((select jsonb_object_agg(e.key, case when e.key = any(t.keys) and e.value <> 'null'::jsonb then c_mask else e.value end) from jsonb_each(a.before_json) e), a.before_json) else a.before_json end,
           after_json  = case when jsonb_typeof(a.after_json)  = 'object' then coalesce((select jsonb_object_agg(e.key, case when e.key = any(t.keys) and e.value <> 'null'::jsonb then c_mask else e.value end) from jsonb_each(a.after_json)  e), a.after_json) else a.after_json end
      from t
     where a.org_id = v_cu.org_id and a.target = t.target
       and exists (select 1 from jsonb_each(case when jsonb_typeof(a.before_json) = 'object' then a.before_json else '{}'::jsonb end || case when jsonb_typeof(a.after_json) = 'object' then a.after_json else '{}'::jsonb end) e
                    where e.key = any(t.keys) and e.value <> 'null'::jsonb and e.value <> c_mask)
    returning a.action
  )
  select count(*)::int, coalesce(array_agg(distinct m.action order by m.action), '{}') into v_masked, v_actions from m;
  -- 監査（個人情報の値は before にも残さない・消したフィールド名のみ・reason 列に理由）。★0229: キープ・予約・伏せた監査の行の数を足す（伏せたこと自体の記録＝裁定511-5）
  perform public.audit_log_write('customer_anonymize', 'customers:' || p_customer_id::text,
    null,
    jsonb_build_object('anonymized_at', now(),
                       'fields', to_jsonb(array['name','furigana','tel','birthday','prefs','memo','is_active']),
                       'notes_deleted', v_notes,
                       'keeps_relabelled', v_keeps,
                       'reservations_cleared', v_resv,
                       'audit_rows_masked', v_masked,
                       'audit_masked_actions', to_jsonb(v_actions)),
    v_cu.store_id, v_reason);
  return p_customer_id;
end $function$;

-- ═══ ★2 customer_register（作り直し） ═══
CREATE OR REPLACE FUNCTION public.customer_register(p_store_id uuid, p_name text, p_furigana text DEFAULT NULL::text, p_birthday date DEFAULT NULL::date, p_tel text DEFAULT NULL::text, p_prefs text DEFAULT NULL::text, p_memo text DEFAULT NULL::text, p_cast_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型＝store 不在/他 org も forbidden）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_crm 準拠）
  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and (public.auth_staff_can_crm() or public.auth_staff_can_register()))) then   -- ★4 0159（起票89・324 追補2-5）: レジ権限の staff にも開放（cast は含めない）
    raise exception 'forbidden';
  end if;

  -- 担当割当は owner/manager のみ。staff が p_cast_id を渡しても無視（null 化）
  if p_cast_id is not null and v_role not in ('owner','manager') then
    p_cast_id := null;
  end if;

  -- 割当先 cast は同 org・同店（越境割当封鎖）
  if p_cast_id is not null then
    if not exists (
      select 1 from public.casts c
      where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id
    ) then
      raise exception 'invalid cast';
    end if;
  end if;

  insert into public.customers (org_id, store_id, name, furigana, cast_id, birthday, tel, prefs, memo)
  values (v_org, p_store_id, trim(p_name), p_furigana, p_cast_id, p_birthday, p_tel, p_prefs, p_memo)
  returning id into v_id;

  -- ★0229（#205・裁定511-5）: 監査に名前・電話・メモの値を書かない＝入れた欄の名前だけ
  perform public.audit_log_write('customer_register', 'customers:' || v_id::text, null,
    jsonb_build_object('id', v_id, 'store_id', p_store_id, 'cast_id', p_cast_id,
      'fields', to_jsonb(array_remove(array[
        'name',
        case when p_furigana is not null then 'furigana' end,
        case when p_birthday is not null then 'birthday' end,
        case when p_tel is not null then 'tel' end,
        case when p_prefs is not null then 'prefs' end,
        case when p_memo is not null then 'memo' end], null))),
    p_store_id);
  return v_id;
end $function$;

-- ═══ ★3 customer_update（作り直し） ═══
CREATE OR REPLACE FUNCTION public.customer_update(p_id uuid, p_name text, p_furigana text, p_birthday date, p_tel text, p_prefs text, p_memo text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.customers;
  v_fields text[];   -- ★0229: 変わった個人の欄の名前
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_is_active is null then raise exception 'bad is_active'; end if;

  -- 対象行を org 内で取得（存在＋org 一致を同時確認）
  select * into v_row from public.customers where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- ゲート（check_open 同型・can_crm 準拠・対象客の店＝自店）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_row.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;
  -- ★0229（#205 の仲間）: 匿名化済みは書き戻さない（画面は閉じている＝関数でも閉じる）
  if v_row.anonymized_at is not null then raise exception 'anonymized'; end if;

  update public.customers
     set name = trim(p_name), furigana = p_furigana, birthday = p_birthday,
         tel = p_tel, prefs = p_prefs, memo = p_memo,
         is_active = p_is_active
   where id = p_id;

  -- ★0229（#205・裁定511-5）: 監査に名前・電話・メモの値を書かない＝is_active と変わった欄の名前だけ
  v_fields := array_remove(array[
    case when trim(p_name) is distinct from v_row.name then 'name' end,
    case when p_furigana is distinct from v_row.furigana then 'furigana' end,
    case when p_birthday is distinct from v_row.birthday then 'birthday' end,
    case when p_tel is distinct from v_row.tel then 'tel' end,
    case when p_prefs is distinct from v_row.prefs then 'prefs' end,
    case when p_memo is distinct from v_row.memo then 'memo' end], null);
  perform public.audit_log_write('customer_update', 'customers:' || p_id::text,
    jsonb_build_object('is_active', v_row.is_active),
    jsonb_build_object('is_active', p_is_active, 'fields', to_jsonb(v_fields)), v_row.store_id);
end $function$;

-- ═══ ★4 customer_note_add（作り直し） ═══
CREATE OR REPLACE FUNCTION public.customer_note_add(p_customer_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid := public.auth_org_id();
  v_role  text := public.auth_role();
  v_cust  public.customers;
  v_actor uuid;
  v_id    uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(p_body) > 2000 then raise exception 'bad body'; end if;

  select * into v_cust from public.customers where id = p_customer_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- ゲート（customer_update 同型・can_crm 準拠・対象客の店＝自店）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_cust.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_cust.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;
  -- ★0229（#205 の仲間）: 匿名化済みのお客様にはメモを足さない（消したメモの代わりが残らないように）
  if v_cust.anonymized_at is not null then raise exception 'anonymized'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.customer_notes (org_id, store_id, customer_id, body, author_user_id)
  values (v_org, v_cust.store_id, p_customer_id, trim(p_body), v_actor)
  returning id into v_id;

  -- ★0229（#205・裁定511-5）: 監査にメモの本文を書かない＝id・お客様・文字数だけ
  perform public.audit_log_write('customer_note_add', 'customer_notes:' || v_id::text, null,
    jsonb_build_object('id', v_id, 'customer_id', p_customer_id, 'author_user_id', v_actor, 'chars', char_length(trim(p_body))), v_cust.store_id);
  return v_id;
end $function$;

-- ═══ ★5 customer_assign_cast（作り直し） ═══
CREATE OR REPLACE FUNCTION public.customer_assign_cast(p_id uuid, p_cast_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.customers;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  select * into v_row from public.customers where id = p_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 割当先 cast は同 org・同店（越境割当封鎖）
  if p_cast_id is not null then
    if not exists (
      select 1 from public.casts c
      where c.id = p_cast_id and c.org_id = v_org and c.store_id = v_row.store_id
    ) then
      raise exception 'invalid cast';
    end if;
  end if;

  update public.customers set cast_id = p_cast_id where id = p_id;

  -- ★0229（#205・裁定511-5）: 監査に顧客の行まるごとを書かない＝担当だけ
  perform public.audit_log_write('customer_assign_cast', 'customers:' || p_id::text,
    jsonb_build_object('cast_id', v_row.cast_id),
    jsonb_build_object('cast_id', p_cast_id), v_row.store_id);
end $function$;

-- ═══ ACL（今と同じ・言い直し） ═══
revoke execute on function public.customer_anonymize(uuid, text) from public, anon;
grant execute on function public.customer_anonymize(uuid, text) to authenticated;
revoke execute on function public.customer_register(uuid, text, text, date, text, text, text, uuid) from public, anon;
grant execute on function public.customer_register(uuid, text, text, date, text, text, text, uuid) to authenticated;
revoke execute on function public.customer_update(uuid, text, text, date, text, text, text, boolean) from public, anon;
grant execute on function public.customer_update(uuid, text, text, date, text, text, text, boolean) to authenticated;
revoke execute on function public.customer_note_add(uuid, text) from public, anon;
grant execute on function public.customer_note_add(uuid, text) to authenticated;
revoke execute on function public.customer_assign_cast(uuid, uuid) from public, anon;
grant execute on function public.customer_assign_cast(uuid, uuid) to authenticated;

-- ═══ ★6 1 回だけの追い付き（もう匿名化した人＝★1 の (a)〜(c) を同じ式で・デモでない会社だけ・無ければ何もしない） ═══
--   メモ（customer_notes）は匿名化で消えているので、customer_note_add の監査は after の customer_id で探す（前の関数は行まるごと＝customer_id のキーがある）。
--   変えたお客様ごとに監査 1 行（action 'mig0229.mask_anonymized'・actor_kind 'system'・actor_ref 'mig0229'・after に数）。本番の今（22 時台）は匿名化済み 1 人・監査の行 1（customer_register）。
do $mig0229$
declare
  r record;
  v_keeps int; v_resv int; v_masked int; v_actions text[];
  c_mask constant jsonb := to_jsonb('（匿名化で伏せた）'::text);
begin
  for r in
    select cu.id, cu.org_id, cu.store_id
      from public.customers cu join public.orgs o on o.id = cu.org_id
     where not o.is_demo and cu.anonymized_at is not null
     order by cu.org_id, cu.id
  loop
    update public.bottle_keeps b
       set tag_label = left('削除済み顧客 ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), (select p.name from public.products p where p.id = b.product_id), ''), 60),
           note = null
     where b.customer_id = r.id and b.org_id = r.org_id
       and (b.tag_label is distinct from left('削除済み顧客 ' || coalesce(nullif(trim(coalesce(b.bottle_name, '')), ''), (select p.name from public.products p where p.id = b.product_id), ''), 60) or b.note is not null);
    get diagnostics v_keeps = row_count;
    update public.reservations x
       set guest_name = case when nullif(trim(coalesce(x.guest_name, '')), '') is null then x.guest_name else '削除済み顧客' end,
           memo = null
     where x.customer_id = r.id and x.org_id = r.org_id
       and ((nullif(trim(coalesce(x.guest_name, '')), '') is not null and x.guest_name <> '削除済み顧客') or x.memo is not null);
    get diagnostics v_resv = row_count;
    with t(target, keys) as (
      select 'customers:' || r.id::text, array['name','furigana','tel','birthday','prefs','memo']
      union all select a2.target, array['body'] from public.audit_logs a2
        where a2.org_id = r.org_id and a2.action = 'customer_note_add' and a2.target like 'customer_notes:%'
          and (a2.after_json->>'customer_id' = r.id::text or a2.before_json->>'customer_id' = r.id::text)
      union all select 'reservations:' || x.id::text, array['guest_name','memo'] from public.reservations x where x.customer_id = r.id and x.org_id = r.org_id
      union all select 'bottle_keeps:' || b.id::text, array['tag_label','note'] from public.bottle_keeps b where b.customer_id = r.id and b.org_id = r.org_id
    ), m as (
      update public.audit_logs a
         set before_json = case when jsonb_typeof(a.before_json) = 'object' then coalesce((select jsonb_object_agg(e.key, case when e.key = any(t.keys) and e.value <> 'null'::jsonb then c_mask else e.value end) from jsonb_each(a.before_json) e), a.before_json) else a.before_json end,
             after_json  = case when jsonb_typeof(a.after_json)  = 'object' then coalesce((select jsonb_object_agg(e.key, case when e.key = any(t.keys) and e.value <> 'null'::jsonb then c_mask else e.value end) from jsonb_each(a.after_json)  e), a.after_json) else a.after_json end
        from (select distinct target, keys from t) t
       where a.org_id = r.org_id and a.target = t.target
         and exists (select 1 from jsonb_each(case when jsonb_typeof(a.before_json) = 'object' then a.before_json else '{}'::jsonb end || case when jsonb_typeof(a.after_json) = 'object' then a.after_json else '{}'::jsonb end) e
                      where e.key = any(t.keys) and e.value <> 'null'::jsonb and e.value <> c_mask)
      returning a.action
    )
    select count(*)::int, coalesce(array_agg(distinct m.action order by m.action), '{}') into v_masked, v_actions from m;
    if v_keeps + v_resv + v_masked > 0 then
      insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason, actor_kind, actor_ref)
      values (r.org_id, r.store_id, null, 'mig0229.mask_anonymized', 'customers:' || r.id::text, null,
              jsonb_build_object('keeps_relabelled', v_keeps, 'reservations_cleared', v_resv, 'audit_rows_masked', v_masked, 'audit_masked_actions', to_jsonb(v_actions)),
              '0229: 匿名化済みのお客様の残りを伏せる（#204・#205・裁定511-5）', 'system', 'mig0229');
    end if;
  end loop;
end $mig0229$;

commit;
