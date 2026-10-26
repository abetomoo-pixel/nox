-- 0179_receipt_issue_reissue_fix.sql — 便 ON-1（2026-10-26 起草・適用は Agoora 手貼り）: 0175 v2 ★2（裁定402 再発行）の欠陥修正＝receipt_issue が全呼び出しで落ちる
-- 翻訳元: live（nox 本番 ref hiqbfagmkrdpmlqhkmsu・2026-10-26 読取＝pg_get_functiondef・md5 8f036095＝0175 v2 適用後の値）に★差分 1 か所（手打ちなし・node 置換）。
--   ★1 receipt_issue: v_amt の既定を `coalesce(p_amount, case when p_reissue_of is not null then v_old.amount else … end)` と 1 式で書いたため、
--      plpgsql が式の準備時に未代入の record v_old のフィールドを解決できず、再発行でない通常の発行（p_reissue_of null・p_amount 指定の有無を問わず）が
--      「record "v_old" is not assigned yet」で落ちていた（f0 receipt-ledger 段56(2) で発覚・本番で BEGIN…ROLLBACK 再現＝2026-10-26 12:1x JST）。
--      → if p_reissue_of is not null then v_amt := coalesce(p_amount, v_old.amount); else v_amt := coalesce(p_amount, v_chk.total - v_issued); end if;（意味は同じ・他は 1 バイトも変えない）
--   触らないもの: ACL（authenticated＝CREATE OR REPLACE で保たれる＋写経元どおり revoke／grant を明示）・引数 6・SECURITY DEFINER・search_path。
-- 検証（Success の後・別実行・select だけ）: 末尾 ===== verify =====。期待＝md5 c564a8d7・verify_0175_0176.sql の pin は receipt_issue だけ c564a8d7 に張替え（同梱）。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ ★1 receipt_issue（8f036095 → c564a8d7） ═══
CREATE OR REPLACE FUNCTION public.receipt_issue(p_check_id uuid, p_amount integer DEFAULT NULL::integer, p_recipient text DEFAULT NULL::text, p_proviso text DEFAULT NULL::text, p_biz_date date DEFAULT NULL::date, p_reissue_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := public.auth_org_id();
  v_role    text := public.auth_role();
  v_chk     record;
  v_actor   uuid;
  v_issued  int;
  v_amt     int;
  v_recip   text;
  v_prov    text;
  v_sname   text;
  v_cutoff  text;
  v_bdate   date;
  v_expires date;
  v_serial  int;
  v_id      uuid;
  v_token   uuid;
  v_try     int;
  v_old     record;   -- ★2 0175（裁定402）: 再発行の元の行
  v_mem     uuid;     -- ★2 0175: 操作者の membership
  v_tb      jsonb;    -- ★26 0175 v2（裁定422 候補）: 税率ごとの内訳
  v_snap    jsonb;    -- ★26: 発行者（法人名・屋号・店名・住所・電話・登録番号＝登録事業者のみ）
  v_pm      text;     -- ★26: 支払方法（cash／card／other／mixed＝印紙の判定）
  v_hash    text;     -- ★26: 改変検知（sha256）
  v_s10 int := 0; v_s8 int := 0; v_sx int := 0; v_stot int := 0; v_a10 int := 0; v_a8 int := 0; v_ax int := 0;  -- ★26: 税率別の構成比と按分
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象伝票（FOR UPDATE＝同一伝票の並行発行を一列化＝Σamount ガードの競合封鎖）
  select * into v_chk from public.checks where id = p_check_id for update;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_chk.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register() and public.auth_cast_register_level() >= 2)) then   -- ★25 0175 v2（裁定420）: 「会計まで」の cast は領収書も
    raise exception 'forbidden';
  end if;
  -- 発行は会計済み伝票のみ（open/void は不可）
  if v_chk.status <> 'closed' then raise exception 'not closed'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  v_mem := public.auth_membership_id();   -- ★2 0175（裁定402）: 発行者（users）と操作者（membership）を記録
  -- ★2 0175（裁定402）: 再発行＝元の行は同じ伝票のもの（取消済みでも元にできる）。未取消なら同一トランザクションで自動取消（void_note に理由）
  if p_reissue_of is not null then
    select * into v_old from public.receipt_issues where id = p_reissue_of for update;
    if v_old.id is null or v_old.check_id <> p_check_id then raise exception 'bad reissue_of'; end if;
    if not v_old.voided then
      update public.receipt_issues
         set voided = true, void_note = '再発行のため取消', voided_at = now(), voided_by = v_actor
       where id = p_reissue_of;
    end if;
  end if;
  -- ★2 0175（裁定402）: 日付の訂正＝元の取引日が既定・未来日は不可
  if p_biz_date is not null and p_biz_date > (now() at time zone 'Asia/Tokyo')::date then raise exception 'bad biz_date'; end if;

  -- 宛名・但し書き（trim・空は null・長さは CHECK と同値を関数側でも）
  v_recip := nullif(trim(coalesce(p_recipient, '')), '');
  v_prov  := coalesce(nullif(trim(coalesce(p_proviso, '')), ''),
                      (select nullif(trim(coalesce(s.receipt_default_desc, '')), '') from public.stores s where s.id = v_chk.store_id),
                      'ご飲食代として');   -- ★26 0175 v2（裁定422 候補）: 但し書きの既定＝店設定→「ご飲食代として」
  if v_recip is not null and length(v_recip) > 100 then raise exception 'bad recipient'; end if;
  if v_prov  is not null and length(v_prov)  > 100 then raise exception 'bad proviso';  end if;

  -- 金額（null=残額。Σ既発行（非void）＋今回 ≤ checks.total）
  select coalesce(sum(amount), 0)::int into v_issued
    from public.receipt_issues where check_id = p_check_id and not voided;
  -- ★0179（便 ON-1・2026-10-26）: 0175 ★2 の欠陥＝未代入の record v_old を CASE の中で参照（plpgsql は式の準備時にフィールドを解決するため分岐に入らなくても「record "v_old" is not assigned yet」）→ 再発行のときだけ v_old を読む
  if p_reissue_of is not null then v_amt := coalesce(p_amount, v_old.amount);   -- 再発行の既定＝元の行の金額（取消後の Σ に入る）
  else v_amt := coalesce(p_amount, v_chk.total - v_issued); end if;
  if v_amt <= 0 or v_issued + v_amt > v_chk.total then raise exception 'bad amount'; end if;

  -- 発行時スナップショット（店名・取引日＝closed_at の営業日・cutoff は core と同イディオム）
  select s.name,
         coalesce(nullif(trim(coalesce(s.settings_json, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00')
    into v_sname, v_cutoff
    from public.stores s where s.id = v_chk.store_id;
  if v_cutoff !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad store settings'; end if;
  v_bdate := coalesce(p_biz_date, (timezone('Asia/Tokyo', coalesce(v_chk.closed_at, v_chk.started_at))
              - (v_cutoff || ':00')::interval)::date);   -- ★2 0175（裁定402）: 訂正日があればそれ

  -- ★26 0175 v2（裁定422 候補）: 税率別の内訳＝伝票の行を税区分で集計（割引は負）し、受領額（v_amt＝税込）を構成比で按分→税率ごとに 1 回丸め（店の tax_rounding・check_tax_round と同じ流儀）
  select coalesce(sum(case when tax_category = 'taxable_10' then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0),
         coalesce(sum(case when tax_category = 'taxable_8'  then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0),
         coalesce(sum(case when coalesce(tax_category, '') not in ('taxable_10','taxable_8') then (case when kind = 'discount' then -line_total else line_total end) else 0 end), 0)
    into v_s10, v_s8, v_sx
    from public.check_lines where check_id = p_check_id;
  v_stot := v_s10 + v_s8 + v_sx;
  if v_stot <= 0 then v_a10 := v_amt; v_a8 := 0; v_ax := 0;
  else v_a10 := round(v_amt * v_s10::numeric / v_stot)::int; v_a8 := round(v_amt * v_s8::numeric / v_stot)::int; v_ax := v_amt - v_a10 - v_a8; end if;
  v_tb := '[]'::jsonb;
  if v_a10 > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 10, 'amount_incl', v_a10,
      'tax', (case coalesce(v_chk.tax_rounding, 'floor') when 'ceil' then ceil(v_a10 * 10.0 / 110.0) when 'round' then round(v_a10 * 10.0 / 110.0) else floor(v_a10 * 10.0 / 110.0) end)::int,
      'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  if v_a8 > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 8, 'amount_incl', v_a8,
      'tax', (case coalesce(v_chk.tax_rounding, 'floor') when 'ceil' then ceil(v_a8 * 8.0 / 108.0) when 'round' then round(v_a8 * 8.0 / 108.0) else floor(v_a8 * 8.0 / 108.0) end)::int,
      'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  if v_ax > 0 then v_tb := v_tb || jsonb_build_array(jsonb_build_object('rate', 0, 'amount_incl', v_ax, 'tax', 0, 'display', coalesce(v_chk.price_display, 'tax_included'))); end if;
  -- ★26: 発行者＝発行時点の店（登録番号は invoice_status='registered' のときだけ・未登録は null＝公開面は行ごと出さない）
  select jsonb_build_object('legal_name', nullif(trim(coalesce(s.legal_name, '')), ''), 'trade_name', nullif(trim(coalesce(s.trade_name, '')), ''), 'store_name', s.name,
                            'address', nullif(trim(coalesce(s.settings_json->>'receipt_address', '')), ''), 'tel', nullif(trim(coalesce(s.settings_json->>'receipt_tel', '')), ''),
                            'reg_no', case when s.invoice_status = 'registered' then nullif(trim(coalesce(s.invoice_reg_no, '')), '') else null end)
    into v_snap from public.stores s where s.id = v_chk.store_id;
  -- ★26: 支払方法＝伝票の入金が 1 種なら cash／card／other・複数なら mixed・無し（売掛等）は other
  select case when count(*) = 0 then 'other' when count(distinct method) = 1 then (case min(method) when 'cash' then 'cash' when 'card' then 'card' else 'other' end) else 'mixed' end
    into v_pm from public.payments where check_id = p_check_id;

  -- 有効期限 = 発行日（JST）+ 90日（正本B②・R2-9）
  v_expires := (now() at time zone 'Asia/Tokyo')::date + 90;

  -- ★2 0175: v_actor は上（再発行の取消の前）で読んだ

  -- ★R2-10 改訂: serial = max+1 を UNIQUE(store_id, serial) 衝突リトライ≤3 で採番（NOX 初の
  --   ループイディオム。max+1 の FOR UPDATE は範囲読み＝ファントムで直列化しない（0053 注記）ため
  --   一意制約に当てて弾き直す。begin..exception をループ内に置く＝サブトランザクション単位で捕捉）
  v_id := null;
  for v_try in 1..3 loop
    begin
      select coalesce(max(serial), 0) + 1 into v_serial
        from public.receipt_issues where store_id = v_chk.store_id;
      insert into public.receipt_issues
        (org_id, store_id, check_id, serial, amount, recipient, proviso,
         store_name_snap, biz_date, issued_by, expires_on, reissue_of, by_membership,   -- ★2 0175
         tax_breakdown, issuer_snapshot, payment_method)   -- ★26 v2
      values
        (v_chk.org_id, v_chk.store_id, p_check_id, v_serial, v_amt, v_recip, v_prov,
         v_sname, v_bdate, v_actor, v_expires, p_reissue_of, v_mem,
         v_tb, v_snap, v_pm)
      returning id, token into v_id, v_token;
      exit;
    exception when unique_violation then
      v_id := null;  -- 他店同時発行と衝突＝採り直し
    end;
  end loop;
  if v_id is null then raise exception 'busy'; end if;
  -- ★26 0175 v2（裁定422 候補）: 改変検知＝凍結した内容の sha256（番号・金額・宛名・但し書き・取引日・発行時刻・税内訳・発行者・支払方法）。以後は再発行（新番号＋元の行を取消）以外で変えない
  select encode(sha256(convert_to(jsonb_build_object('serial', v_serial, 'amount', v_amt, 'recipient', v_recip, 'proviso', v_prov, 'biz_date', v_bdate,
                                                     'issued_at', ri.issued_at, 'tax_breakdown', v_tb, 'issuer', v_snap, 'payment_method', v_pm)::text, 'UTF8')), 'hex')
    into v_hash from public.receipt_issues ri where ri.id = v_id;
  update public.receipt_issues set issued_hash = v_hash where id = v_id;

  -- 監査（token は記録しない＝公開アクセス鍵を audit へ漏らさない）
  perform public.audit_log_write('receipt_issue', 'receipt_issues:' || v_id::text, null,
    jsonb_build_object('check_id', p_check_id, 'serial', v_serial, 'amount', v_amt,
                       'recipient', v_recip, 'proviso', v_prov,
                       'biz_date', v_bdate, 'expires_on', v_expires,
                       'reissue_of', p_reissue_of, 'by_membership', v_mem, 'biz_date_corrected', p_biz_date is not null,   -- ★2 0175
                       'tax_breakdown', v_tb, 'payment_method', v_pm, 'issued_hash', v_hash),   -- ★26 v2
    v_chk.store_id);

  return jsonb_build_object('id', v_id, 'serial', v_serial, 'token', v_token,
                            'amount', v_amt, 'expires_on', v_expires, 'biz_date', v_bdate,
                            'store_name', v_sname, 'reissue_of', p_reissue_of,   -- ★2 0175
                            'proviso', v_prov, 'tax_breakdown', v_tb, 'issuer_snapshot', v_snap, 'payment_method', v_pm, 'issued_hash', v_hash);   -- ★26 v2
end $function$;

revoke all on function public.receipt_issue(uuid, integer, text, text, date, uuid) from public, anon;
grant execute on function public.receipt_issue(uuid, integer, text, text, date, uuid) to authenticated, service_role;   -- 写経元の proacl と同じ（postgres／authenticated／service_role）

commit;

-- ===== verify =====（Success の後に別実行・select だけ）
-- (1) 貼り先証明
-- select 'nox-project-proof', count(*) from public.orgs;
-- (2) md5（c564a8d7）と ★0179 の語・proacl（authenticated あり・anon なし）
-- select proname, left(md5(replace(prosrc, E'\r', '')), 8) md5, prosrc like '%★0179%' has_star, proacl from pg_proc where pronamespace='public'::regnamespace and proname='receipt_issue';
-- (3) 旧 1 式が残っていない
-- select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='receipt_issue' and prosrc like '%case when p_reissue_of is not null then v_old.amount%';   -- 期待 0
