-- mig0088_r3: billing ゲート挿入（対象87本・機械生成／課金設計 v1.2 §4）
-- 生成 2026-08-17T03:10:32.940Z・live pg_get_functiondef を生成直前に再取得（採取 2026-08-17T03:10:32.568Z）
-- 生成物の性質: CC 生成（相談役起草物ではない）。Downloads リレー不要＝本ファイルから直接 SQL Editor へ貼付。
--
-- ★r3 の是正点（r2 は破棄）: pg_get_functiondef は **末尾セミコロンを返さない**。r2 は定義を
--   そのまま連結したため 87 関数が 1 文に融合し、SQL Editor が全体を reject した
--   （2026-08-17 実測・トランザクション外の全体失敗＝dev は無傷・検証バンドル全ゼロで確認済み）。
--   r3 は各定義の直後に ';' を付与して連結する。検証 (e) で文区切りを機械保証。
--
-- ══ 挿入規則（4種・1関数につき1行のみ・regex は1行形の厳密一致／行末コメントのみ許容）══
--   優先順 A > B > D > C（D は B の複合版ゆえ限定的な形を先に判定）
--   規則A（13本）: 「v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());」直後 → 引数 v_org
--   規則B（5本）: 「if v_org is null then raise exception 'forbidden'; end if;」直後 → 引数 v_org
--   規則D（30本）: 「if v_org is null or v_role is null then raise exception 'forbidden'; end if;」直後 → 引数 v_org
--   規則C（39本）: 「if public.auth_org_id() is null then raise exception 'forbidden'; end if;」直後
--                     → 引数は declare で v_org 初期化済みなら v_org・無ければ public.auth_org_id()
-- 【収録】計 87 本＝対象87本 全数（保留ゼロ）
-- 【挿入行】  if not public.billing_writable_of(<arg>) then raise exception 'billing locked'; end if;
--
-- ══ 機械検証5点（本確定版に対して再実行・結果転記）══
--   (a) 前後 diff = 当該1行のみ                        : PASS（全87本・位置対応で全行同一性を照合）
--   (b) 除外83本は無変換（diff ゼロ）                  : PASS（混入ゼロ。除外側でアンカーを持つ 36 本も無変換）
--   (c) 挿入行の直前行が各規則のアンカー行             : PASS（全87本）
--   (d) 挿入行が関数内の最初の INSERT/UPDATE/DELETE より前 : PASS（全87本・コメント行除外の位置比較）
--   (e) ★文区切り検証                                  : PASS
--       「$function$;」出現数 = 87（期待 87＝全関数が文として終端）
--       「$function$」総数     = 174（期待 174＝87×2・開始/終端の対）
--       「$function$;」で分割した文数 = 87（期待 87）／各文が CREATE OR REPLACE FUNCTION 始まり = 87
--   ＋二重挿入ガード: 生成時点で対象87本とも billing_writable_of 未挿入を確認
--
-- ══ 適用上の注意 ══
-- 【★begin/commit は付けない】各 CREATE OR REPLACE を独立実行とし、途中失敗時に prosrc の grep で
--   「どこまで入ったか」を確認できる形を優先する（進捗の可観測性）。
-- 【★ACL 再適用は不要】全て署名不変の CREATE OR REPLACE ゆえ既存 ACL は保持される
--   （0062 で ACL 再適用が要ったのは drop→create で署名が変わった場合）。
-- 【★再適用可・ただし手貼りは1回】本ファイルは全文 CREATE OR REPLACE のみ（DDL 変更・DML なし）＝
--   構造上は再実行しても同一結果に収束する。それでも運用は手貼り1回の原則に従う。
-- 【手貼り後】notify pgrst, 'reload schema';
-- 【検証】適用後は "Success" 表示を信用せず、prosrc で実測すること:
--   -- ① ゲート行そのものの本数（★本命・適用前 0 / 適用後 87）
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosrc like '%billing locked%';  -- 期待 87
--   -- ② 述語を参照する関数の総数（期待 88＝87 ＋ auth_org_billing_writable 自身の本文1本）
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosrc like '%billing_writable_of%';  -- 期待 88
-- 【貼り先証明】Run 前に URL の ref を目視し、先頭で:
--   select 'nox-project-proof', count(*) from public.orgs;
-- ══════════════════════════════════════════════════════════
-- 規則A（13 本）
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bottle_keep_register(p_store_id uuid, p_customer_id uuid, p_product_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid;  -- ★0057(2): 初期化は null guard 後の coalesce 代入へ
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_prod      record;
  v_id        uuid;
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- store の org 照合（クロステナント遮断・set_product 型）
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  -- ゲート（check_open 同型・can_register 準拠＝会計オペ）
  if (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (v_role = 'cast' and p_store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（bottle_keep_register 足す＝確定②）
          or (p_store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 顧客は同 org・同店（越境封鎖・null も不成立で raise）
  if not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  -- product 検証（check_add_line 同型: 同 org・同店・is_active）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> v_org
     or v_prod.store_id <> p_store_id then raise exception 'bad item'; end if;
  if not v_prod.is_active then raise exception 'inactive item'; end if;

  insert into public.bottle_keeps (org_id, store_id, customer_id, product_id, status, opened_at, note)
  values (v_org, p_store_id, p_customer_id, p_product_id, 'active', now(), p_note)
  returning id into v_id;

  perform public.audit_log_write('bottle_keep_register', 'bottle_keeps:' || v_id::text, null,
    (select to_jsonb(b) from public.bottle_keeps b where b.id = v_id), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_add_line(p_check_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_kind text DEFAULT NULL::text, p_pay_group text DEFAULT 'A'::text, p_name text DEFAULT NULL::text, p_unit_price integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_prod record; v_id uuid; v_grp text; v_sort int;
  v_kind text; v_name text; v_price int; v_back jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id;
    if v_prod.id is null or v_prod.org_id <> v_org
       or v_prod.store_id <> v_chk.store_id then raise exception 'bad item'; end if;
    if not v_prod.is_active then raise exception 'inactive item'; end if;
    v_kind := v_prod.type;             -- drink/champ/bottle
    v_name := v_prod.name;
    v_price := v_prod.price;
    -- ★mig0070: back_exempt を凍結（経路の分岐もマスタ現価でなく伝票の凍結値で決める）
    v_back := jsonb_build_object('back_mode', v_prod.back_mode, 'back_value', v_prod.back_value,
                                 'unit4', v_prod.unit4_json, 'hon_pt', v_prod.hon_pt,
                                 'back_exempt', coalesce(v_prod.back_exempt_from_split, false));
  else
    if p_kind is null or p_kind not in ('set','time','charge','custom') then raise exception 'bad kind'; end if;
    if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'bad price'; end if;
    v_kind := p_kind;
    v_name := trim(p_name);
    v_price := p_unit_price;
    v_back := null;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot, sort_order)
  values (v_chk.org_id, v_chk.store_id, p_check_id, p_product_id, v_kind, v_grp,
          v_name, v_price, p_qty, v_price * p_qty, v_back, v_sort)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_add_line', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_add_seat(p_check_id uuid, p_seat_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_seat record; v_actor uuid; v_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 追加先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  -- 占有チェック（ロック下）: 主席 open（自伝票の主席もここで拒否）∪ 追加席
  if exists (select 1 from public.checks where seat_id = p_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_seat_id) then
    raise exception 'seat occupied';
  end if;
  -- ★0057(4): actor＝operator 優先
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  begin
    insert into public.check_seats (org_id, store_id, check_id, seat_id, created_by)
    values (v_chk.org_id, v_chk.store_id, p_check_id, p_seat_id, v_actor)
    returning id into v_id;
  exception when unique_violation then
    -- backstop（check_seats_seat_occupancy）
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_add_seat', 'check_seats:' || v_id::text, null,
    (select to_jsonb(cs) from public.check_seats cs where cs.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_close(p_check_id uuid, p_idem_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_g record; v_due int; v_paid int; v_lines int;
  v_cast_ids uuid[]; v_weights int[]; v_n int; v_sumw int := 0;
  v_drink int[]; v_champ int[]; v_bottle int[]; v_pt int[];
  v_alloc int[]; v_rem int[]; v_used boolean[];
  v_line record; v_unit int; v_rest int; v_best int; i int; c int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  -- 冪等: 同一キーで closed 済みなら成功を返す
  if v_chk.status = 'closed' then
    if p_idem_key is not null and v_chk.close_idem_key = p_idem_key then return p_check_id; end if;
    raise exception 'not open';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_lines from public.check_lines where check_id = p_check_id;
  if v_lines = 0 then raise exception 'empty check'; end if;

  -- 全 group 充足（∀g: paid(g) ≥ due(g)）＋ total 確定
  perform public.check_recalc(p_check_id);
  for v_g in select distinct pay_group from public.check_lines where check_id = p_check_id
  loop
    v_due := public.check_group_due(p_check_id, v_g.pay_group);
    select coalesce(sum(amount), 0)::int into v_paid
      from public.payments where check_id = p_check_id and pay_group = v_g.pay_group;
    if v_paid < v_due then raise exception 'balance remaining'; end if;
  end loop;
  v_before := to_jsonb(v_chk);

  -- 分配（最大剰余法・精密仕様 §2.2.1・back_snapshot 凍結値・pt は nom_type='hon' のみ）
  select array_agg(cast_id order by position, created_at, id),
         array_agg(ratio_weight order by position, created_at, id)
    into v_cast_ids, v_weights
    from public.check_nominations where check_id = p_check_id;
  if v_cast_ids is not null then
    v_n := array_length(v_cast_ids, 1);
    for i in 1..v_n loop v_sumw := v_sumw + v_weights[i]; end loop;
    v_drink := array_fill(0, array[v_n]); v_champ := array_fill(0, array[v_n]);
    v_bottle := array_fill(0, array[v_n]); v_pt := array_fill(0, array[v_n]);
    for v_line in
      select * from public.check_lines
       where check_id = p_check_id and product_id is not null
         and kind in ('drink','champ','bottle') and back_snapshot is not null
         -- ★mig0070: キャストドリンクは按分から除外（凍結値で判定・キー無し=false=按分対象）
         and coalesce((check_lines.back_snapshot ->> 'back_exempt')::boolean, false) = false
    loop
      -- 分配単価（productBackOf と同一規則・凍結値）
      if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
        v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
      else
        v_unit := round(v_line.unit_price_snapshot
                        * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
      end if;
      -- 数量の最大剰余法分配（床=整数除算・剰余降順→position 昇順）
      v_alloc := array_fill(0, array[v_n]); v_rem := array_fill(0, array[v_n]);
      v_used := array_fill(false, array[v_n]);
      v_rest := v_line.qty;
      for i in 1..v_n loop
        v_alloc[i] := (v_line.qty * v_weights[i]) / v_sumw;
        v_rem[i]   := (v_line.qty * v_weights[i]) % v_sumw;
        v_rest := v_rest - v_alloc[i];
      end loop;
      for c in 1..v_rest loop
        v_best := 0;
        for i in 1..v_n loop
          if not v_used[i] and (v_best = 0 or v_rem[i] > v_rem[v_best]) then v_best := i; end if;
        end loop;
        v_used[v_best] := true;
        v_alloc[v_best] := v_alloc[v_best] + 1;
      end loop;
      -- 集計
      for i in 1..v_n loop
        if v_alloc[i] > 0 then
          if v_line.kind = 'drink'  then v_drink[i]  := v_drink[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'champ'  then v_champ[i]  := v_champ[i]  + v_unit * v_alloc[i]; end if;
          if v_line.kind = 'bottle' then v_bottle[i] := v_bottle[i] + v_unit * v_alloc[i]; end if;
          if v_chk.nom_type = 'hon' then
            v_pt[i] := v_pt[i] + coalesce((v_line.back_snapshot ->> 'hon_pt')::int, 0) * v_alloc[i];
          end if;
        end if;
      end loop;
    end loop;
    for i in 1..v_n loop
      if v_drink[i] + v_champ[i] + v_bottle[i] + v_pt[i] > 0 then
        insert into public.check_cast_backs
          (org_id, store_id, check_id, cast_id, drink_back, champ_back, bottle_back, hon_pt_alloc)
        values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_ids[i],
                v_drink[i], v_champ[i], v_bottle[i], v_pt[i]);
      end if;
    end loop;
  end if;

  update public.checks
     set status = 'closed', closed_at = now(), close_idem_key = p_idem_key
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_close', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
  return p_check_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_dohan_add(p_check_id uuid, p_count integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_id uuid; v_sort int; v_paycnt int; v_price int;
  v_org uuid;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_count is null or p_count <= 0 then raise exception 'bad count'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  select coalesce(v_chk.dohan_fee, st.dohan_fee) into v_price
    from public.stores st where st.id = v_chk.store_id;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          '同伴料', v_price, p_count, v_price * p_count, null, v_sort, 'dohan', null)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_dohan_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_move_seat(p_check_id uuid, p_to_seat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_seat record; v_before jsonb;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_to_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- ★裁定(c): 移動先 seats 行ロック（占有取得の直列化・一次防御）
  select s.id, s.org_id, s.store_id, s.is_active into v_seat
    from public.seats s where s.id = p_to_seat_id
    for update;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if v_seat.store_id <> v_chk.store_id then raise exception 'bad seat'; end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;
  if p_to_seat_id = v_chk.seat_id then raise exception 'same seat'; end if;
  -- 占有チェック（ロック下＝コミット済み状態が確定）: 主席 open ∪ 追加席（自伝票の追加席も含めて拒否＝
  -- 主席との入替は「解除→移動」の2手・org 非限定＝物理占有はより厳しく見る）
  if exists (select 1 from public.checks where seat_id = p_to_seat_id and status = 'open') then
    raise exception 'seat occupied';
  end if;
  if exists (select 1 from public.check_seats where seat_id = p_to_seat_id) then
    raise exception 'seat occupied';
  end if;
  v_before := to_jsonb(v_chk);
  begin
    update public.checks set seat_id = p_to_seat_id where id = p_check_id;
  exception when unique_violation then
    -- backstop（checks_one_open_per_seat）＝ロック迂回経路が万一あっても二重主席は構造不能
    raise exception 'seat occupied';
  end;
  perform public.audit_log_write('check_move_seat', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.check_open(p_seat_id uuid, p_people integer DEFAULT NULL::integer, p_nom_type text DEFAULT 'free'::text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seat record; v_id uuid; v_actor uuid;
  v_rate int; v_unit int; v_mode text;
  v_smin int; v_sfee int; v_emin int; v_efee int; v_tper text;
  v_org uuid;  -- ★0057(2)
  r_set record; r_ext record; r_doh record; v_dfee int;  -- ★0084
begin
  -- ★0057(1): null guard 二重化（認証者でも register kiosk でもない→遮断）
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_people is not null and p_people <= 0 then raise exception 'bad people'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  -- ★mig0053（裁定(c)）: seats 行ロック＝同一卓への占有変更（open/相席追加/移動/予約来店）を直列化。
  --   for update of s＝seats 行のみ（stores を巻き込まない）。org 不一致等は直後の raise で
  --   即 rollback＝ロックは解放される。
  select s.id, s.org_id, s.store_id, s.is_active, s.kind,
         st.service_rate, st.round_unit, st.round_mode,
         st.set_min, st.set_fee, st.ext_min, st.ext_fee, st.time_per,
         st.dohan_fee
    into v_seat
    from public.seats s join public.stores st on st.id = s.store_id
    where s.id = p_seat_id
    for update of s;
  if v_seat.id is null or v_seat.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_seat.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_seat.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_seat.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（register device × 有効 operator セッション＝裁定11 単一判定点）
          or (v_seat.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if not v_seat.is_active then raise exception 'inactive seat'; end if;

  -- 顧客紐付け（束2）: 同 org・卓の店と同店のみ許可（越境封鎖）
  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers cu
      where cu.id = p_customer_id
        and cu.org_id = v_org
        and cu.store_id = v_seat.store_id
    ) then
      raise exception 'invalid customer';
    end if;
  end if;

  -- 既存 open を再利用（0038/0040 型・自然冪等）
  -- ★mig0053（B1 相席）: 主席 ∪ 追加席の union＝追加席タップでもホスト伝票を返す（同一会計挙動）。
  --   追加席腕は open の check に限定（transient の防御深度）＋org 限定（返す伝票は org 内のみ）。
  select x.check_id into v_id from (
    select id as check_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
    union
    select cs.check_id from public.check_seats cs
      join public.checks c on c.id = cs.check_id
      where cs.seat_id = p_seat_id and c.status = 'open' and c.org_id = v_org
  ) x
  limit 1;
  if v_id is not null then return v_id; end if;

  -- ★mig0084: 料金ルール解決（設計書 v1.2・凍結=開栓時）。
  --   now() はトランザクション内不変＝下の insert の started_at (default now()) と
  --   同一時刻＝解決時刻と凍結時刻が厳密に一致（帯境界の競合なし）。
  --   0行＝各変数 null → 下の coalesce で stores フォールバック＝ルール0件の店は
  --   改稿前と完全同値（golden 構造保証）。dohan のみ nullable スナップ
  --   （ルール0件は null 凍結・check_dohan_add 時に stores 現在値へフォールバック）。
  --   ルール一致だが duration_min null の場合は額のみルール・分数は stores 既定。
  select * into r_set from public.pricing_resolve_core(v_seat.store_id, now(), 'set',       v_seat.kind, null);
  select * into r_ext from public.pricing_resolve_core(v_seat.store_id, now(), 'extension', v_seat.kind, null);
  select * into r_doh from public.pricing_resolve_core(v_seat.store_id, now(), 'dohan',     v_seat.kind, null);

  -- 【決定1】店設定のスナップショット（E1 mig0051: 読み元を settings_json から stores 列へ。
  --   既定 10/100/down は列 default と同値＝挙動不変。列 CHECK が正・下の raise は防御深度
  --   ＝列の型変更/削除事故の検知用に残置）
  --   B4 mig0052: 時間制5値（set_min/set_fee/ext_min/ext_fee/time_per）を同スナップへ追補
  --   （非遡及＝open 中伝票は旧料金表・time_mode は運用トグルゆえ非スナップ＝裁定(g)）
  --   ★mig0084: set/extension は pricing_rules 解決値を優先・0行は stores（＝「基本料金」）
  v_rate := v_seat.service_rate;
  v_unit := v_seat.round_unit;
  v_mode := v_seat.round_mode;
  v_smin := coalesce(r_set.duration_min, v_seat.set_min);
  v_sfee := coalesce(r_set.amount,       v_seat.set_fee);
  v_emin := coalesce(r_ext.duration_min, v_seat.ext_min);
  v_efee := coalesce(r_ext.amount,       v_seat.ext_fee);
  v_tper := v_seat.time_per;
  v_dfee := r_doh.amount;  -- ★0行= null（裁定②）
  if v_rate < 0 or v_unit < 1 or v_mode not in ('up','down','round') then
    raise exception 'bad store settings';
  end if;
  if v_smin < 1 or v_emin < 1 or v_sfee < 0 or v_efee < 0 or v_tper not in ('table','person') then
    raise exception 'bad store settings';
  end if;

  -- ★0057(4): actor＝operator 優先（checks.created_by NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.checks (org_id, store_id, seat_id, people, nom_type,
                             service_rate, round_unit, round_mode,
                             set_min, set_fee, ext_min, ext_fee, time_per,
                             dohan_fee,
                             created_by, customer_id)
  values (v_org, v_seat.store_id, p_seat_id, p_people, p_nom_type,
          v_rate, v_unit, v_mode,
          v_smin, v_sfee, v_emin, v_efee, v_tper,
          v_dfee,
          v_actor, p_customer_id)
  on conflict (seat_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    -- 競合＝先着の open を返す（0038 申し送り）
    select id into v_id from public.checks
      where seat_id = p_seat_id and status = 'open' and org_id = v_org
      limit 1;
    return v_id;
  end if;
  perform public.audit_log_write('check_open', 'checks:' || v_id::text, null,
    (select to_jsonb(c) from public.checks c where c.id = v_id), v_seat.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_pay(p_check_id uuid, p_method text, p_amount integer, p_pay_group text DEFAULT 'A'::text, p_tendered integer DEFAULT NULL::integer, p_idem_key uuid DEFAULT NULL::uuid, p_method_detail text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_grp text; v_due int; v_paid int; v_id uuid; v_actor uuid;
  v_recv uuid; v_first_cast uuid;
  v_detail text;  -- 【F4c】
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_method is null or p_method not in ('cash','card','ar','other') then raise exception 'bad method'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  -- 【F4c】detail は全 method で受理（card/other のみ表示は UI 責務）・空→null・50字
  v_detail := nullif(trim(coalesce(p_method_detail, '')), '');
  if v_detail is not null and char_length(v_detail) > 50 then raise exception 'bad detail'; end if;
  -- tendered は cash のみ・お預かり ≥ 充当額（レビュー指摘: 未満は矛盾）
  if p_tendered is not null then
    if p_method <> 'cash' or p_tendered < p_amount then raise exception 'bad tendered'; end if;
  end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;

  -- 冪等: 同一キー再送は既存 payment を返す（別伝票のキー再利用は拒否）。
  -- org/ロール照合の後に置く（照合前だと org 外ユーザーがキーの存在確認に使えてしまう＝レビュー指摘）。
  -- status 判定より前に置く（close 後に届いた正当な再送にも既存 id を返す）。
  if p_idem_key is not null then
    select id, check_id into v_id, v_recv from public.payments where idem_key = p_idem_key;
    if v_id is not null then
      if v_recv <> p_check_id then raise exception 'bad idem key'; end if;
      return v_id;
    end if;
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  -- 【決定3】残額検証は group 単位（過入金なし＝超過は明示拒否）
  v_due := public.check_group_due(p_check_id, v_grp);
  select coalesce(sum(amount), 0)::int into v_paid
    from public.payments where check_id = p_check_id and pay_group = v_grp;
  if v_due - v_paid <= 0 then raise exception 'no balance'; end if;
  if p_amount > v_due - v_paid then raise exception 'exceeds balance'; end if;

  -- ★0057(4): actor＝operator 優先（payments.by_user_id NOT NULL を kiosk でも充足）
  select coalesce(public.auth_kiosk_operator(),
                  (select id from public.users where auth_user_id = auth.uid() and is_active))
    into v_actor;
  insert into public.payments (org_id, store_id, check_id, pay_group, method, amount, tendered, idem_key, by_user_id, method_detail)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_method, p_amount, p_tendered, p_idem_key, v_actor, v_detail)
  returning id into v_id;
  perform public.audit_log_write('check_pay', 'payments:' || v_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = v_id), v_chk.store_id);

  -- 売掛: receivables を生成（cast は先頭指名・customer は伝票から＝サーバ導出）
  if p_method = 'ar' then
    select cast_id into v_first_cast from public.check_nominations
      where check_id = p_check_id order by position, created_at, id limit 1;
    insert into public.receivables (org_id, store_id, check_id, customer_id, cast_id, amount)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_chk.customer_id, v_first_cast, p_amount)
    returning id into v_recv;
    perform public.audit_log_write('receivable_open', 'receivables:' || v_recv::text, null,
      (select to_jsonb(r) from public.receivables r where r.id = v_recv), v_chk.store_id);
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_remove_line(p_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_paycnt int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> v_org then raise exception 'forbidden'; end if;
  select * into v_chk from public.checks where id = v_line.check_id;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（誤入力訂正は remove_line＝確定① の代替経路）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  delete from public.check_lines where id = p_line_id;
  perform public.check_recalc(v_chk.id);
  perform public.audit_log_write('check_remove_line', 'check_lines:' || p_line_id::text,
    to_jsonb(v_line), null, v_chk.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.check_remove_seat(p_check_id uuid, p_seat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_row record;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_seat_id is null then raise exception 'bad seat'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕（B1/B2 を kiosk に出す＝確定⑦）
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_seat_id = v_chk.seat_id then raise exception 'home seat'; end if;
  select * into v_row from public.check_seats
    where check_id = p_check_id and seat_id = p_seat_id;
  if v_row.id is null then raise exception 'not found'; end if;
  delete from public.check_seats where id = v_row.id;
  perform public.audit_log_write('check_remove_seat', 'check_seats:' || v_row.id::text,
    to_jsonb(v_row), null, v_chk.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nom_type text, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 1 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;
    if p_nom_type = 'free' and v_w <> 1 then raise exception 'bad weight'; end if; -- free は均等（モック準拠）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update public.checks set nom_type = p_nom_type where id = p_check_id;

  v_after := jsonb_build_object('nom_type', p_nom_type, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.check_shimei_add(p_check_id uuid, p_cast_id uuid, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_cast record; v_id uuid; v_sort int; v_paycnt int;
  v_seat_kind text; v_fee_kind text; v_name text; v_price int;
  v_org uuid; r_fee record;
begin
  -- ★0057(1)型
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)型
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_kind is null or p_kind not in ('hon','jonai') then raise exception 'bad kind'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3)型: kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 入金後に合計が動く経路を塞ぐ（check_time_charge_apply と同じ保守側）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;

  -- キャスト検証（同 org・伝票の店と同店・在籍）★A1: is_active は CC 照合対象
  select c.id, c.store_id, c.rank_id, c.is_active into v_cast
    from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if v_cast.id is null or v_cast.store_id <> v_chk.store_id then raise exception 'bad cast'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;

  -- 席種＝伝票の現在席（席移動後はその席の料率＝運用整合）・時間軸＝started_at（凍結）
  select s.kind into v_seat_kind from public.seats s where s.id = v_chk.seat_id;
  v_fee_kind := case p_kind when 'hon' then 'hon_shimei' else 'jonai_shimei' end;
  select * into r_fee from public.pricing_resolve_core(
    v_chk.store_id, v_chk.started_at, v_fee_kind, v_seat_kind, v_cast.rank_id);
  if r_fee.amount is not null then
    v_price := r_fee.amount;
  else
    select case when p_kind = 'hon' then st.hon_fee else st.jonai_fee end
      into v_price from public.stores st where st.id = v_chk.store_id;
  end if;
  v_name := case p_kind when 'hon' then '本指名料' else '場内指名料' end;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, fee_kind, cast_id)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'charge', 'A',
          v_name, v_price, 1, v_price, null, v_sort, v_fee_kind, p_cast_id)
  returning id into v_id;
  perform public.check_recalc(p_check_id);
  -- audit: 行 jsonb（name_snapshot は料金名・cast は id のみ＝PII なし既存流儀）
  perform public.audit_log_write('check_shimei_add', 'check_lines:' || v_id::text, null,
    (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_time_charge_apply(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_id uuid; v_sort int; v_paycnt int;
  v_d int; v_units int; v_blocks int; v_set_c int; v_ext_c int; v_total int;
  v_org uuid;  -- ★0057(2)
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 裁定(c): 入金後に合計が動く経路を塞ぐ（check_remove_line と同じ保守側。
  -- check_add_line の非対称は裁定台帳に既知事項として記録済み＝今回は触らない）
  select count(*) into v_paycnt from public.payments where check_id = v_chk.id;
  if v_paycnt > 0 then raise exception 'has payments'; end if;
  -- 防御深度: スナップ5値の妥当性（checks 列 CHECK が正・型/列事故の検知用＝E1【決定1】流儀）
  if v_chk.set_min < 1 or v_chk.ext_min < 1 or v_chk.set_fee < 0 or v_chk.ext_fee < 0
     or v_chk.time_per not in ('table','person') then
    raise exception 'bad time settings';
  end if;

  -- サーバ計算（モック Lp 写し・経過は「完了分」＝floor・浮動小数を金額に持ち込まない）
  v_d := floor(extract(epoch from (now() - v_chk.started_at)) / 60)::int;
  if v_d < 0 then v_d := 0; end if; -- 時計逆行の防御（blocks 負値化の芽を摘む）
  -- people CHECK 現物 = (people is null or people > 0) ＝下限あり → coalesce で十分（相談役指示1）
  v_units := case when v_chk.time_per = 'person' then coalesce(v_chk.people, 1) else 1 end;
  v_blocks := case when v_d <= v_chk.set_min then 0
                   else (v_d - v_chk.set_min + v_chk.ext_min - 1) / v_chk.ext_min end;
  v_set_c := v_chk.set_fee * v_units;
  v_ext_c := v_blocks * v_chk.ext_fee * v_units;
  v_total := v_set_c + v_ext_c;

  -- 自然冪等 upsert（部分ユニークインデックス check_lines_one_time_auto が1本を構造保証。
  -- 並行2呼びは片方 insert・片方 update に収束。update 時 sort_order は据置＝伝票内の位置不変）
  select to_jsonb(l) into v_before from public.check_lines l
    where l.check_id = p_check_id and l.time_auto;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.check_lines where check_id = p_check_id;
  insert into public.check_lines (org_id, store_id, check_id, product_id, kind, pay_group,
                                  name_snapshot, unit_price_snapshot, qty, line_total,
                                  back_snapshot, sort_order, time_auto)
  values (v_chk.org_id, v_chk.store_id, p_check_id, null, 'time', 'A',
          '時間料金(セット+延長)', v_total, 1, v_total, null, v_sort, true)
  on conflict (check_id) where time_auto do update
     set unit_price_snapshot = excluded.unit_price_snapshot,
         line_total          = excluded.line_total,
         name_snapshot       = excluded.name_snapshot
  returning id into v_id;

  perform public.check_recalc(p_check_id);
  perform public.audit_log_write('check_time_charge_apply', 'check_lines:' || v_id::text,
    v_before, (select to_jsonb(l) from public.check_lines l where l.id = v_id), v_chk.store_id);

  return jsonb_build_object('elapsed_min', v_d, 'units', v_units, 'blocks', v_blocks,
                            'set_c', v_set_c, 'ext_c', v_ext_c, 'total', v_total, 'line_id', v_id);
end $function$;

-- ══════════════════════════════════════════════════════════
-- 規則B（5 本）
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.kiosk_provision(p_auth_user_id uuid, p_store_id uuid, p_label text, p_purpose text DEFAULT 'punch'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_id        uuid;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  if p_purpose is null or p_purpose not in ('punch','register') then raise exception 'bad purpose'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;
  -- 実在人物の auth uid の kiosk 化を封じる（役職二重化封じの鏡像）
  if exists (select 1 from public.users u where u.auth_user_id = p_auth_user_id) then
    raise exception 'bad target';
  end if;
  -- 1店1kiosk×purpose（部分ユニークが物理 backstop）
  if exists (select 1 from public.kiosk_devices k
             where k.store_id = p_store_id and k.purpose = p_purpose and k.is_active) then
    raise exception 'already provisioned';
  end if;

  insert into public.kiosk_devices (org_id, store_id, auth_user_id, label, purpose)
  values (v_org, p_store_id, p_auth_user_id, nullif(trim(coalesce(p_label,'')), ''), p_purpose)
  returning id into v_id;

  perform public.audit_log_write('kiosk_provision', 'kiosk_devices:' || v_id::text,
    null, (select to_jsonb(k) from public.kiosk_devices k where k.id = v_id), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_pin(p_cast_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_cast public.casts;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  select c.* into v_cast from public.casts c
    where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.cast_pin (cast_id, org_id, store_id, pin_hash)
  values (p_cast_id, v_cast.org_id, v_cast.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (cast_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_cast_pin', 'cast_pin:' || p_cast_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'reset', true), v_cast.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_printer_config(p_store_id uuid, p_enabled boolean, p_serial text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_store_org uuid;
  v_before    jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'forbidden'; end if;

  select jsonb_build_object('printer_enabled', c.printer_enabled, 'printer_serial', c.printer_serial)
    into v_before from public.printer_config c where c.store_id = p_store_id;

  insert into public.printer_config (store_id, org_id, printer_enabled, printer_serial)
  values (p_store_id, v_store_org, p_enabled, nullif(trim(coalesce(p_serial,'')), ''))
  on conflict (store_id) do update
    set printer_enabled = excluded.printer_enabled,
        printer_serial  = excluded.printer_serial,
        updated_at      = now();

  perform public.audit_log_write('set_printer_config', 'printer_config:' || p_store_id::text,
    v_before,
    jsonb_build_object('printer_enabled', p_enabled,
                       'printer_serial', nullif(trim(coalesce(p_serial,'')), '')),
    p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_staff_pin(p_membership_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','manager') or (v_mem.role = 'staff' and v_mem.can_register)) then
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_receipt_profile(p_store_id uuid, p_address text, p_tel text, p_reg_no text, p_footer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := public.auth_org_id();
  v_store   record;
  v_addr    text := trim(coalesce(p_address, ''));
  v_tel     text := trim(coalesce(p_tel, ''));
  v_reg     text := trim(coalesce(p_reg_no, ''));
  v_footer  text := trim(coalesce(p_footer, ''));
  v_before  jsonb;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;
  if length(v_addr) > 200 then raise exception 'bad address'; end if;
  if length(v_tel) > 50 then raise exception 'bad tel'; end if;
  if length(v_footer) > 200 then raise exception 'bad footer'; end if;
  if v_reg <> '' and v_reg !~ '^T[0-9]{13}$' then raise exception 'bad reg_no'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> v_org then raise exception 'forbidden'; end if;

  v_before := jsonb_build_object(
    'receipt_address', coalesce(v_store.settings_json->>'receipt_address', ''),
    'receipt_tel',     coalesce(v_store.settings_json->>'receipt_tel', ''),
    'invoice_reg_no',  coalesce(v_store.settings_json->>'invoice_reg_no', ''),
    'receipt_footer',  coalesce(v_store.settings_json->>'receipt_footer', '')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(settings_json, '{}'::jsonb),
               '{receipt_address}', to_jsonb(v_addr), true),
             '{receipt_tel}',     to_jsonb(v_tel),    true),
           '{invoice_reg_no}',  to_jsonb(v_reg),    true),
         '{receipt_footer}',  to_jsonb(v_footer), true)
   where id = p_store_id;
  perform public.audit_log_write('set_store_receipt_profile', 'stores:' || p_store_id::text,
    v_before,
    jsonb_build_object('receipt_address', v_addr, 'receipt_tel', v_tel,
                       'invoice_reg_no', v_reg, 'receipt_footer', v_footer),
    p_store_id);
end $function$;

-- ══════════════════════════════════════════════════════════
-- 規則D（30 本）
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cast_create(p_store_id uuid, p_name text, p_birthday date, p_real_name text DEFAULT NULL::text, p_kind text DEFAULT NULL::text)
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
end $function$;

CREATE OR REPLACE FUNCTION public.cast_invite(p_auth_user_id uuid, p_email text, p_cast_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_email    text;
  v_cast     public.casts;
  v_user     public.users;
  v_user_id  uuid;
  v_existing public.memberships;
  v_result   uuid;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 入力検証（route でも検証するが RPC でも二重に守る）
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  if p_email is null or length(trim(p_email)) = 0 or length(p_email) > 255 then raise exception 'bad email'; end if;
  v_email := lower(trim(p_email));  -- 【12】正規化

  -- 対象 cast（org 照合＝他 org は not found・存在オラクル封じ・【14】）
  select c.* into v_cast from public.casts c where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if v_cast.user_id is not null then raise exception 'already linked'; end if;

  -- 権限差: owner=org 内全店の cast / manager=自店の cast のみ / staff・cast=forbidden（【3】）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★既存 user 判定（UNIQUE(org_id, email)・lower 比較＝【12】）
  select u.* into v_user
  from public.users u
  where u.org_id = v_org and lower(u.email) = v_email;

  if not found then
    -- 新規 user（通常ケース）: users INSERT（name は対象 cast の源氏名を初期値＝【4】・
    -- 重複 auth uid は UNIQUE(auth_user_id) が 23505 で物理拒否＝【13】）
    insert into public.users (org_id, email, name, auth_user_id)
    values (v_org, v_email, v_cast.name, p_auth_user_id)
    returning id into v_user_id;
  else
    -- 既存 user（同 org 同 email）: users は作らない・名前/auth_user_id は上書きしない（【4】）
    v_user_id := v_user.id;
    -- 【11】inactive user は明示拒否
    if not v_user.is_active then raise exception 'inactive user'; end if;
    -- 【10'】staff/manager/owner 人材への cast 結線を封じる（役職二重化の鏡像封じ）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.role <> 'cast'
    ) then
      raise exception 'bad target';
    end if;
  end if;

  -- ★1ユーザー1アクティブ membership: 既存 active がどの店にあっても不可（【15】）
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_user_id and m.is_active
  ) then
    raise exception 'already active elsewhere';
  end if;

  -- membership（store は対象 cast.store_id から導出＝store 整合を RPC が保証・【17】。
  -- 同店の既存 inactive 行は出戻り reactivate＝UNIQUE(user_id,store_id) 対応・【16】）
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_user_id and m.store_id = v_cast.store_id;

  if found then
    -- role<>'cast' 行の役職転換復帰を封じる（通常【10'】が先に捕捉＝二重防御）
    if v_existing.role <> 'cast' then raise exception 'bad target'; end if;
    update public.memberships
       set is_active = true
     where id = v_existing.id
     returning id into v_result;
  else
    insert into public.memberships (user_id, store_id, role, is_active)
    values (v_user_id, v_cast.store_id, 'cast', true)
    returning id into v_result;
  end if;

  -- ★casts.user_id 結線（当該 user の既存 active cast を明示チェック＝【15】・
  -- 物理 backstop は casts_one_active_per_user_idx の 23505）
  if exists (
    select 1 from public.casts c2
    where c2.user_id = v_user_id and c2.is_active
  ) then
    raise exception 'already a cast';
  end if;
  update public.casts set user_id = v_user_id where id = p_cast_id;

  -- audit（規約6・before は生成情報の疑似 jsonb・after は結線後 casts 行＝源氏名のみで PII なし）
  perform public.audit_log_write('cast_invite', 'casts:' || p_cast_id::text,
    jsonb_build_object('user_id', v_user_id, 'email', v_email, 'membership_id', v_result),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id),
    v_cast.store_id);

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.cast_rank_reorder(p_store_id uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_n    int;
  v_cnt  int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_cnt from public.cast_ranks cr
   where cr.id = any(p_ids) and cr.org_id = v_org and cr.store_id = p_store_id;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;

  select count(*) into v_cnt from public.cast_ranks cr
   where cr.org_id = v_org and cr.store_id = p_store_id;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;

  select jsonb_agg(jsonb_build_object('id', cr.id, 'sort_order', cr.sort_order)
                   order by cr.sort_order, cr.id)
    into v_before
    from public.cast_ranks cr
   where cr.org_id = v_org and cr.store_id = p_store_id;

  update public.cast_ranks cr
     set sort_order = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where cr.id = u.id;

  select jsonb_agg(jsonb_build_object('id', cr.id, 'sort_order', cr.sort_order)
                   order by cr.sort_order, cr.id)
    into v_after
    from public.cast_ranks cr
   where cr.org_id = v_org and cr.store_id = p_store_id;

  perform public.audit_log_write(
    p_action   => 'cast_rank_reorder',
    p_target   => 'cast_ranks:store:' || p_store_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.cast_rejoin(p_cast_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.casts;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  select c.* into v_row
  from public.casts c
  where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 既に在籍なら明示拒否
  if v_row.is_active then raise exception 'already active'; end if;

  -- 1ユーザー1アクティブ: 同一 user の他 active 行を検証（staff_reactivate 同型・
  -- casts_one_active_per_user_idx への抵触を例外文言で先取り）
  if v_row.user_id is not null and exists (
    select 1 from public.casts c
    where c.user_id = v_row.user_id and c.is_active and c.id <> p_cast_id
  ) then
    raise exception 'already active elsewhere';
  end if;

  update public.casts
     set is_active = true, left_on = null
   where id = p_cast_id;

  perform public.audit_log_write('cast_rejoin', 'casts:' || p_cast_id::text,
    to_jsonb(v_row),
    (select to_jsonb(c) from public.casts c where c.id = p_cast_id),
    v_row.store_id);
end $function$;

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

  perform public.audit_log_write('customer_assign_cast', 'customers:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(cu) from public.customers cu where cu.id = p_id), v_row.store_id);
end $function$;

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
              and public.auth_staff_can_crm())) then
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

  perform public.audit_log_write('customer_register', 'customers:' || v_id::text, null,
    (select to_jsonb(cu) from public.customers cu where cu.id = v_id), p_store_id);
  return v_id;
end $function$;

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

  update public.customers
     set name = trim(p_name), furigana = p_furigana, birthday = p_birthday,
         tel = p_tel, prefs = p_prefs, memo = p_memo,
         is_active = p_is_active
   where id = p_id;

  perform public.audit_log_write('customer_update', 'customers:' || p_id::text, to_jsonb(v_row),
    (select to_jsonb(cu) from public.customers cu where cu.id = p_id), v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.delete_cast_rank(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_row  public.cast_ranks%rowtype;
  v_ref  int;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_row from public.cast_ranks cr
   where cr.id = p_id and cr.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_row.store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;

  -- 参照ゼロ検証（casts.rank_id / pricing_rules.rank_id）。剥がしは UI 側
  -- （set_cast_rank_of(cast, null)・ルール編集）に委ね、RPC は保守側で拒否。
  select (select count(*) from public.casts c where c.rank_id = p_id)
       + (select count(*) from public.pricing_rules r where r.rank_id = p_id)
    into v_ref;
  if v_ref > 0 then raise exception 'in use'; end if;

  delete from public.cast_ranks where id = p_id;

  perform public.audit_log_write(
    p_action   => 'delete_cast_rank',
    p_target   => 'cast_ranks:' || p_id::text,
    p_before   => to_jsonb(v_row),
    p_after    => null,
    p_store_id => v_row.store_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.delete_pricing_rule(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_row  public.pricing_rules%rowtype;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_row from public.pricing_rules r
   where r.id = p_id and r.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_row.store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;

  delete from public.pricing_rules where id = p_id;

  perform public.audit_log_write(
    p_action   => 'delete_pricing_rule',
    p_target   => 'pricing_rules:' || p_id::text,
    p_before   => to_jsonb(v_row),
    p_after    => null,
    p_store_id => v_row.store_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.pricing_rule_reorder(p_store_id uuid, p_fee_kind text, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_n    int;
  v_cnt  int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;

  select count(*) into v_cnt from public.pricing_rules r
   where r.id = any(p_ids) and r.org_id = v_org
     and r.store_id = p_store_id and r.fee_kind = p_fee_kind;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;

  select count(*) into v_cnt from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id
     and r.fee_kind = p_fee_kind;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;

  select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority)
                   order by r.priority, r.id)
    into v_before
    from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id and r.fee_kind = p_fee_kind;

  update public.pricing_rules r
     set priority = u.ord, updated_at = now()
    from unnest(p_ids) with ordinality as u(id, ord)
   where r.id = u.id;

  select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority)
                   order by r.priority, r.id)
    into v_after
    from public.pricing_rules r
   where r.org_id = v_org and r.store_id = p_store_id and r.fee_kind = p_fee_kind;

  perform public.audit_log_write(
    p_action   => 'pricing_rule_reorder',
    p_target   => 'pricing_rules:store:' || p_store_id::text || ':' || p_fee_kind,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.product_bulk_insert(p_store_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_store  uuid := public.auth_store_id();
  v_n      int;
  v_item   jsonb;
  v_name   text;
  v_type   text;
  v_num    numeric;
  v_cat    text;
  v_cat_names text[] := '{}';
  v_cat_lc    text[] := '{}';
  v_created   text[] := '{}';
  v_names     text[] := '{}';
  v_map    jsonb := '{}'::jsonb;   -- lower(カテゴリ名) -> id
  v_cat_id uuid;
  v_active boolean;
  v_sort   int;
  v_pid    uuid;
  v_drink  int := 0;
  v_champ  int := 0;
  v_bottle int := 0;
  i        int;
begin
  -- 二重防御①: 冒頭 null guard
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 認可: owner ∨ manager 自店（set_product と同型・org 照合は両ロールで明示）
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_store is null or p_store_id is distinct from v_store then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 形と上限
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bad items';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 then raise exception 'bad items'; end if;
  if v_n > 300 then raise exception 'too many items'; end if;

  -- ===== 検証ループ（DML 一切なし・全件検証し切ってから書く）=====
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;

    v_name := trim(coalesce(v_item ->> 'name', ''));
    if length(v_name) < 1 or length(v_name) > 80 then
      raise exception 'bad name';
    end if;

    v_type := v_item ->> 'type';
    if v_type is null or v_type not in ('drink', 'champ', 'bottle') then
      raise exception 'bad type';
    end if;

    if v_item -> 'price' is null
       or jsonb_typeof(v_item -> 'price') <> 'number' then
      raise exception 'bad price';
    end if;
    v_num := (v_item ->> 'price')::numeric;
    if v_num < 0 or v_num <> trunc(v_num) then
      raise exception 'bad price';
    end if;

    if (v_item ? 'cost') and jsonb_typeof(v_item -> 'cost') <> 'null' then
      if jsonb_typeof(v_item -> 'cost') <> 'number' then
        raise exception 'bad cost';
      end if;
      v_num := (v_item ->> 'cost')::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then
        raise exception 'bad cost';
      end if;
    end if;

    -- カテゴリ: 空/null 可（未分類）。非空は distinct 収集（lower 比較）
    v_cat := nullif(trim(coalesce(v_item ->> 'category', '')), '');
    if v_cat is not null and not (lower(v_cat) = any (v_cat_lc)) then
      v_cat_names := array_append(v_cat_names, v_cat);
      v_cat_lc    := array_append(v_cat_lc, lower(v_cat));
    end if;
  end loop;

  if coalesce(array_length(v_cat_names, 1), 0) > 30 then
    raise exception 'too many categories';
  end if;

  -- ===== カテゴリ解決（unique (store_id, lower(name)) 前提）=====
  foreach v_cat in array v_cat_names loop
    v_cat_id := null;
    select c.id, c.is_active into v_cat_id, v_active
      from public.product_categories c
     where c.store_id = p_store_id
       and lower(c.name) = lower(v_cat);
    if v_cat_id is not null then
      -- ★無効カテゴリと同名: 暗黙の再利用も再有効化もしない（裁定1）
      if not v_active then raise exception 'duplicate name'; end if;
    else
      select coalesce(max(c.sort_order), 0) + 1 into v_sort
        from public.product_categories c
       where c.store_id = p_store_id;
      -- _r2: org_id を追加（NOT NULL・default なし）
      insert into public.product_categories (org_id, store_id, name, sort_order)
      values (v_org, p_store_id, v_cat, v_sort)
      returning id into v_cat_id;
      v_created := array_append(v_created, v_cat);
    end if;
    v_map := v_map || jsonb_build_object(lower(v_cat), v_cat_id::text);
  end loop;

  -- ===== INSERT ループ（既定値は裁定4）=====
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;
    v_name := trim(v_item ->> 'name');
    v_type := v_item ->> 'type';
    v_cat  := nullif(trim(coalesce(v_item ->> 'category', '')), '');
    v_cat_id := case when v_cat is null then null
                     else (v_map ->> lower(v_cat))::uuid end;

    insert into public.products
      (org_id, store_id, category_id, name, type, price,
       back_mode, back_value, hon_pt, back_exempt_from_split, reorder_point)
    values
      (v_org, p_store_id, v_cat_id, v_name, v_type,
       (v_item ->> 'price')::integer,
       'rate', 0, 0, false, null)
    returning id into v_pid;

    if (v_item ? 'cost') and jsonb_typeof(v_item -> 'cost') = 'number' then
      -- _r2: org_id / store_id を追加（NOT NULL・default なし）
      insert into public.product_costs (org_id, store_id, product_id, cost)
      values (v_org, p_store_id, v_pid, (v_item ->> 'cost')::integer);
    end if;

    v_names := array_append(v_names, v_name);
    if    v_type = 'drink' then v_drink  := v_drink  + 1;
    elsif v_type = 'champ' then v_champ  := v_champ  + 1;
    else                        v_bottle := v_bottle + 1;
    end if;
  end loop;

  -- ===== audit: 1操作1行（裁定2・PII なし）=====
  -- _r2: live 署名 (p_action, p_target, p_before, p_after, p_store_id) に整合。
  --      1操作1行のため単一 target は無い＝p_target/p_before は default(null)。
  perform public.audit_log_write(
    p_action   => 'product_bulk_insert',
    p_after    => jsonb_build_object(
                    'product_count',      v_n,
                    'by_type',            jsonb_build_object(
                                            'drink', v_drink, 'champ', v_champ,
                                            'bottle', v_bottle),
                    'categories_created', to_jsonb(coalesce(v_created, '{}'::text[])),
                    'products',           to_jsonb(v_names)),
    p_store_id => p_store_id
  );

  return jsonb_build_object(
    'products_created',   v_n,
    'categories_created', to_jsonb(coalesce(v_created, '{}'::text[])),
    'by_type',            jsonb_build_object(
                            'drink', v_drink, 'champ', v_champ,
                            'bottle', v_bottle)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.product_reorder(p_store_id uuid, p_category_id uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_store  uuid := public.auth_store_id();
  v_n      int;
  v_cnt    int;
  v_before jsonb;
  v_after  jsonb;
begin
  -- 二重防御①: 冒頭 null guard
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 配列検証: 空拒否・重複拒否（ordinality が非決定になるため）
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'bad ids';
  end if;
  v_n := array_length(p_ids, 1);
  if (select count(distinct x) from unnest(p_ids) x) <> v_n then
    raise exception 'duplicate ids';
  end if;

  -- 認可: owner ∨ manager 自店（org 照合は両ロールで明示）
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_store is null or p_store_id is distinct from v_store then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- カテゴリ実在（null=未分類は素通し・非 null は同店カテゴリ限定）
  if p_category_id is not null and not exists (
       select 1 from public.product_categories c
        where c.id = p_category_id and c.store_id = p_store_id) then
    raise exception 'forbidden';
  end if;

  -- ① 配列の全 id が同 org/store/スコープに実在
  select count(*) into v_cnt
    from public.products p
   where p.id = any(p_ids)
     and p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;
  if v_cnt <> v_n then raise exception 'forbidden'; end if;

  -- ② スコープ全行が配列に含まれる（is_active 不問・0077 同型）
  select count(*) into v_cnt
    from public.products p
   where p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;
  if v_cnt <> v_n then raise exception 'partial ids'; end if;

  -- audit 用 before
  select jsonb_agg(jsonb_build_object('id', p.id, 'sort_order', p.sort_order)
                   order by p.sort_order, p.id)
    into v_before
    from public.products p
   where p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;

  -- 一括 UPDATE（配列順 = 新しい sort_order）
  update public.products p
     set sort_order = u.ord
    from unnest(p_ids) with ordinality as u(id, ord)
   where p.id = u.id;

  -- audit 用 after
  select jsonb_agg(jsonb_build_object('id', p.id, 'sort_order', p.sort_order)
                   order by p.sort_order, p.id)
    into v_after
    from public.products p
   where p.org_id = v_org
     and p.store_id = p_store_id
     and p.category_id is not distinct from p_category_id;

  -- audit: 1操作1行・PII なし（0077 の疑似 target 流儀）
  perform public.audit_log_write(
    p_action   => 'product_reorder',
    p_target   => 'products:store:' || p_store_id::text
                  || ':category:' || coalesce(p_category_id::text, 'null'),
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.reservation_create(p_store_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid DEFAULT NULL::uuid, p_cast_id uuid DEFAULT NULL::uuid, p_guest_name text DEFAULT NULL::text, p_party_size integer DEFAULT NULL::integer, p_nom_type text DEFAULT NULL::text, p_memo text DEFAULT NULL::text, p_seat_id uuid DEFAULT NULL::uuid, p_stay_minutes integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_store_org   uuid;
  v_guest       text;
  v_actor       uuid;
  v_id          uuid;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  select org_id into v_store_org from public.stores where id = p_store_id;
  if v_store_org is null or v_store_org <> v_org then raise exception 'invalid store'; end if;

  -- ★B-5①: 定休日ハード拒否（時間外は拒否しない=UI 警告・未設定は通す）
  if public.reservation_is_closed_day(p_store_id, p_reserved_at) then
    raise exception 'closed day';
  end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and p_store_id = public.auth_store_id())
          or (v_role = 'staff' and p_store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = p_store_id
  ) then
    raise exception 'invalid customer';
  end if;

  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = p_store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> p_store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.reservations
    (org_id, store_id, customer_id, cast_id, guest_name, reserved_at, party_size, nom_type,
     status, memo, created_by, seat_id, stay)
  values
    (v_org, p_store_id, p_customer_id, p_cast_id, v_guest, p_reserved_at, p_party_size, p_nom_type,
     'booked', p_memo, v_actor, p_seat_id, v_stay)
  returning id into v_id;

  perform public.audit_log_write('reservation_create', 'reservations:' || v_id::text,
    null, (select to_jsonb(r) from public.reservations r where r.id = v_id), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.reservation_set_status(p_reservation_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_res    public.reservations;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 受け付ける値は cancelled/no_show のみ（visited への手動遷移・booked への復帰を封じる）
  if p_status is null or p_status not in ('cancelled','no_show') then raise exception 'bad status'; end if;

  -- 対象予約（org 照合）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限差（create と同型）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_res.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_res.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  -- 遷移制約: booked → cancelled/no_show のみ（visited/cancelled/no_show からの遷移は不可）
  if v_res.status <> 'booked' then raise exception 'bad transition'; end if;

  v_before := to_jsonb(v_res);
  update public.reservations
     set status = p_status, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_set_status', 'reservations:' || p_reservation_id::text,
    v_before, jsonb_build_object('status', p_status), v_res.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.reservation_to_check(p_reservation_id uuid, p_seat_id uuid DEFAULT NULL::uuid, p_nom_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org        uuid := public.auth_org_id();
  v_role       text := public.auth_role();
  v_res        public.reservations;
  v_seat       uuid;
  v_seat_store uuid;
  v_nom_type   text;
  v_check_id   uuid;
  v_cast_ok    boolean := false;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象予約（org 照合・reservations は org_id 列あり）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- status=booked のみ来店処理可（visited 再処理・cancelled/no_show は不可）
  if v_res.status <> 'booked' then raise exception 'not bookable'; end if;

  -- F3b-B: 卓の解決＝引数 > 予約卓（席予約）。卓なし予約は従来どおり引数必須（両 null は no seat）
  v_seat := coalesce(p_seat_id, v_res.seat_id);
  if v_seat is null then raise exception 'no seat'; end if;

  -- ★【10】卓の店＝予約の店（owner の org 全店権限で他店卓に開く誤接続を封じる。
  --   customer あり予約は内側 check_open の invalid customer でも止まるが、guest_name のみの
  --   フリー予約には関所が無いためここで一致を要求）
  -- ★mig0053（裁定(c)）: seats 行ロック＝占有変更の直列化（主席 open を作る経路として同ガード）
  select store_id into v_seat_store from public.seats where id = v_seat for update;
  if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;

  -- ★【5】発見1対策: 解決後の卓に既存 open があれば拒否（使用中の卓に予約客を着けない＝
  --   check_open の「既存 open 再利用」で他人の伝票が返る誤接続の封鎖）。
  --   確認(A): 予約卓が飛び込み客で埋まっている場合もここで 'seat occupied'
  --   → UI は p_seat_id を明示して別卓に通す（実来店が勝つ・audit に予約卓と実卓が両方残る）
  if exists (
    select 1 from public.checks
    where seat_id = v_seat and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;
  -- ★mig0053（B1 相席）: 追加席として占有中の卓も拒否（check_open の再利用が主席∪追加席 union に
  --   なったため、ここで塞がないと予約客が他組の伝票へ着く＝発見1 の相席版）
  if exists (
    select 1 from public.check_seats cs
    join public.checks c on c.id = cs.check_id
    where cs.seat_id = v_seat and c.status = 'open' and c.org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- 【8】nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・【4】権限=can_register・seat 検証・
  --    invalid customer は check_open が担う＝二重に書かない）
  v_check_id := public.check_open(v_seat, v_res.party_size, v_nom_type, v_res.customer_id);

  -- ② 指名引き継ぎ（cast_id あり ∧ ★【6】発見3: cast が is_active のときだけ）
  if v_res.cast_id is not null then
    select true into v_cast_ok from public.casts
    where id = v_res.cast_id and org_id = v_org and is_active
      and store_id = (select store_id from public.checks where id = v_check_id);
    if v_cast_ok then
      -- check_set_nominations を内部呼び（単一指名＝要素1の配列・weight=1・全置換）
      perform public.check_set_nominations(
        v_check_id, v_nom_type,
        jsonb_build_array(jsonb_build_object('cast_id', v_res.cast_id, 'weight', 1))
      );
    end if;
    -- cast inactive（v_cast_ok=false）なら指名スキップ・開店は成功（発見3 lock・不在表示は UI）
  end if;

  -- 予約を visited に・check_id を埋める（【7】visited⇔check_id 1:1）
  update public.reservations
     set status = 'visited', check_id = v_check_id, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_to_check', 'reservations:' || p_reservation_id::text,
    to_jsonb(v_res),
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',v_seat,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $function$;

CREATE OR REPLACE FUNCTION public.reservation_update(p_reservation_id uuid, p_reserved_at timestamp with time zone, p_customer_id uuid, p_cast_id uuid, p_guest_name text, p_party_size integer, p_nom_type text, p_memo text, p_seat_id uuid DEFAULT NULL::uuid, p_stay_minutes integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org         uuid := public.auth_org_id();
  v_role        text := public.auth_role();
  v_res         public.reservations;
  v_guest       text;
  v_before      jsonb;
  v_seat_store  uuid;
  v_seat_active boolean;
  v_stay        tstzrange;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  if p_reserved_at is null then raise exception 'bad reserved_at'; end if;
  if p_party_size is not null and p_party_size <= 0 then raise exception 'bad people'; end if;
  if p_nom_type is not null and p_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;
  if p_guest_name is not null and length(p_guest_name) > 80 then raise exception 'bad name'; end if;
  v_guest := nullif(trim(coalesce(p_guest_name, '')), '');

  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  if not (v_role = 'owner'
          or (v_role = 'manager' and v_res.store_id = public.auth_store_id())
          or (v_role = 'staff' and v_res.store_id = public.auth_store_id()
              and public.auth_staff_can_crm())) then
    raise exception 'forbidden';
  end if;

  if v_res.status <> 'booked' then raise exception 'not editable'; end if;

  -- ★B-5①: 定休日ハード拒否（店は既存行の store_id・時間外は UI 警告・未設定は通す）
  if public.reservation_is_closed_day(v_res.store_id, p_reserved_at) then
    raise exception 'closed day';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers cu
    where cu.id = p_customer_id and cu.org_id = v_org and cu.store_id = v_res.store_id
  ) then
    raise exception 'invalid customer';
  end if;
  if p_cast_id is not null and not exists (
    select 1 from public.casts c
    where c.id = p_cast_id and c.org_id = v_org and c.store_id = v_res.store_id and c.is_active
  ) then
    raise exception 'bad cast';
  end if;

  if (p_seat_id is null) <> (p_stay_minutes is null) then raise exception 'bad stay'; end if;
  if p_seat_id is not null then
    if p_stay_minutes not in (60, 90, 120, 180) then raise exception 'bad stay'; end if;
    select s.store_id, s.is_active into v_seat_store, v_seat_active
    from public.seats s where s.id = p_seat_id and s.org_id = v_org;
    if v_seat_store is null or v_seat_store <> v_res.store_id then raise exception 'invalid store'; end if;
    if not v_seat_active then raise exception 'bad seat'; end if;
    v_stay := tstzrange(p_reserved_at, p_reserved_at + make_interval(mins => p_stay_minutes), '[)');
    if exists (
      select 1 from public.reservations r
      where r.org_id = v_org and r.seat_id = p_seat_id and r.status = 'booked'
        and r.id <> p_reservation_id
        and r.stay && v_stay
    ) then
      raise exception 'seat time conflict';
    end if;
  end if;

  v_before := to_jsonb(v_res);
  update public.reservations
     set reserved_at = p_reserved_at,
         customer_id = p_customer_id,
         cast_id     = p_cast_id,
         guest_name  = v_guest,
         party_size  = p_party_size,
         nom_type    = p_nom_type,
         memo        = p_memo,
         seat_id     = p_seat_id,
         stay        = v_stay,
         updated_at  = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_update', 'reservations:' || p_reservation_id::text,
    v_before, (select to_jsonb(r) from public.reservations r where r.id = p_reservation_id),
    v_res.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_rank(p_id uuid, p_store_id uuid, p_name text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_name text;
  v_id   uuid;
  v_sort int;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception 'bad name';
  end if;
  if p_is_active is null then raise exception 'bad active'; end if;

  if exists (select 1 from public.cast_ranks cr
              where cr.store_id = p_store_id
                and lower(cr.name) = lower(v_name)
                and (p_id is null or cr.id <> p_id)) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    select coalesce(max(cr.sort_order), 0) + 1 into v_sort
      from public.cast_ranks cr where cr.store_id = p_store_id;
    insert into public.cast_ranks (org_id, store_id, name, sort_order, is_active)
    values (v_org, p_store_id, v_name, v_sort, p_is_active)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(cr) into v_before
      from public.cast_ranks cr
     where cr.id = p_id and cr.org_id = v_org and cr.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.cast_ranks
       set name = v_name, is_active = p_is_active, updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(cr) into v_after
    from public.cast_ranks cr where cr.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_cast_rank',
    p_target   => 'cast_ranks:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_rank_of(p_cast_id uuid, p_rank_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_cast_store uuid;
  v_old  uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select c.store_id, c.rank_id into v_cast_store, v_old
    from public.casts c
   where c.id = p_cast_id and c.org_id = v_org;
  if not found then raise exception 'not found'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or v_cast_store is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if p_rank_id is not null and not exists (
       select 1 from public.cast_ranks cr
        where cr.id = p_rank_id and cr.store_id = v_cast_store) then
    raise exception 'bad rank';
  end if;

  update public.casts
     set rank_id = p_rank_id
   where id = p_cast_id;

  -- audit は id のみ（源氏名・PII を載せない既存流儀）
  perform public.audit_log_write(
    p_action   => 'set_cast_rank_of',
    p_target   => 'casts:' || p_cast_id::text,
    p_before   => jsonb_build_object('rank_id', v_old),
    p_after    => jsonb_build_object('rank_id', p_rank_id),
    p_store_id => v_cast_store
  );
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_register(p_membership_id uuid, p_can_register boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 規約7: 明示値必須（coalesce 禁止・null は拒否）
  if p_can_register is null then raise exception 'bad flag'; end if;

  -- 対象 membership を org 内で取得（存在＋org 一致を同時確認）。
  -- memberships に org_id 列は無い（live 確認）＝stores join で org 照合。他 org は not found。
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限を配る権限＝owner/manager のみ。manager は自店のみ。
  -- （combined gate・set_staff_perms 同型・store_id NOT NULL で null 短絡は到達不能）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 対象は cast のみ（staff は set_staff_perms の管轄＝二重管理を防ぐ）
  if v_row.role <> 'cast' then raise exception 'not a cast'; end if;

  update public.memberships
     set can_register = p_can_register
   where id = p_membership_id;

  -- 規約6: 権限変更は audit（before/after を記録）
  perform public.audit_log_write('set_cast_register', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_st   uuid := public.auth_store_id();
  v_settings jsonb;
  v_cutoff   text;
  v_cut  integer;
  v_ef   integer;
  v_et   integer;
  v_id   uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_role = 'owner' then
    null;
  elsif v_role = 'manager' then
    if v_st is null or p_store_id is distinct from v_st then
      raise exception 'forbidden';
    end if;
  else
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.stores s
                  where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'forbidden';
  end if;

  -- 検証（テーブル CHECK と同値＋cutoff 跨ぎ禁止＝RPC 権威）
  if p_fee_kind is null
     or p_fee_kind not in ('set','extension','dohan','hon_shimei','jonai_shimei') then
    raise exception 'bad fee kind';
  end if;
  if p_seat_kind is not null and p_seat_kind not in ('卓','カウンター','VIP') then
    raise exception 'bad seat kind';
  end if;
  if p_dow_mask is not null and (p_dow_mask < 1 or p_dow_mask > 127) then
    raise exception 'bad dow';
  end if;
  if (p_time_from_min is null) <> (p_time_to_min is null) then
    raise exception 'bad time';
  end if;
  if p_time_from_min is not null then
    if p_time_from_min < 0 or p_time_from_min > 1439
       or p_time_to_min < 0 or p_time_to_min > 1439 then
      raise exception 'bad time';
    end if;
    select s.settings_json into v_settings
      from public.stores s where s.id = p_store_id;
    v_cutoff := coalesce(nullif(trim(coalesce(v_settings, '{}'::jsonb)->>'biz_cutoff_hm'), ''), '06:00');
    v_cut := split_part(v_cutoff, ':', 1)::int * 60 + split_part(v_cutoff, ':', 2)::int;
    v_ef := case when p_time_from_min <  v_cut then p_time_from_min + 1440 else p_time_from_min end;
    v_et := case when p_time_to_min   <= v_cut then p_time_to_min   + 1440 else p_time_to_min   end;
    if v_ef >= v_et then raise exception 'bad time'; end if;   -- 空帯・cutoff 跨ぎを一括拒否
  end if;
  if p_rank_id is not null then
    if p_fee_kind not in ('hon_shimei','jonai_shimei') then
      raise exception 'bad rank';
    end if;
    if not exists (select 1 from public.cast_ranks cr
                    where cr.id = p_rank_id and cr.store_id = p_store_id) then
      raise exception 'bad rank';
    end if;
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_duration_min is not null then
    if p_fee_kind not in ('set','extension') then raise exception 'bad duration'; end if;
    if p_duration_min < 1 then raise exception 'bad duration'; end if;
  end if;
  if p_priority is null then raise exception 'bad priority'; end if;
  if p_is_active is null then raise exception 'bad active'; end if;

  if p_id is null then
    insert into public.pricing_rules
      (org_id, store_id, fee_kind, seat_kind, dow_mask,
       time_from_min, time_to_min, rank_id, amount, duration_min,
       priority, is_active)
    values
      (v_org, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask,
       p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min,
       p_priority, p_is_active)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(r) into v_before
      from public.pricing_rules r
     where r.id = p_id and r.org_id = v_org and r.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.pricing_rules
       set fee_kind      = p_fee_kind,
           seat_kind     = p_seat_kind,
           dow_mask      = p_dow_mask,
           time_from_min = p_time_from_min,
           time_to_min   = p_time_to_min,
           rank_id       = p_rank_id,
           amount        = p_amount,
           duration_min  = p_duration_min,
           priority      = p_priority,
           is_active     = p_is_active,
           updated_at    = now()
     where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(r) into v_after
    from public.pricing_rules r where r.id = v_id;

  perform public.audit_log_write(
    p_action   => 'set_pricing_rule',
    p_target   => 'pricing_rules:' || v_id::text,
    p_before   => v_before,
    p_after    => v_after,
    p_store_id => p_store_id
  );
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_staff_perms(p_membership_id uuid, p_can_register boolean, p_can_crm boolean, p_can_shift boolean, p_can_view_backs boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 規約7: 4フラグとも明示値必須（coalesce 禁止・null は拒否）
  if p_can_register is null or p_can_crm is null or p_can_shift is null or p_can_view_backs is null then
    raise exception 'bad flag';
  end if;

  -- 対象 membership を org 内で取得（存在＋org 一致を同時確認）。
  -- memberships に org_id 列は無い（live 確認）＝stores join で org 照合。他 org は not found。
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限を配る権限＝owner/manager のみ。manager は自店のみ。
  -- （combined gate・check_open 同型・store_id NOT NULL で null 短絡は到達不能）
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 対象は staff（黒服）のみ。owner/manager/cast のフラグは触らせない（role 固定＝フラグ無意味）。
  if v_row.role <> 'staff' then raise exception 'not a staff'; end if;

  update public.memberships
     set can_register   = p_can_register,
         can_crm        = p_can_crm,
         can_shift      = p_can_shift,
         can_view_backs = p_can_view_backs
   where id = p_membership_id;

  -- 規約6: 権限変更は audit（before/after のフラグ・role・対象を記録）
  perform public.audit_log_write('set_staff_perms', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_change_role(p_membership_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- ★昇降格は owner のみ（権限昇格経路・確定3）
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  -- p_new_role は staff/manager のみ（owner 増殖・cast 混入を防ぐ）
  if p_new_role not in ('staff','manager') then raise exception 'bad role'; end if;

  -- 対象 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 現 role も staff/manager のみ対象（owner を降格させる/cast を昇格させる経路を封じる）
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- no-op（同 role）は弾く
  if v_row.role = p_new_role then raise exception 'no change'; end if;

  -- role を変更。フラグは現状維持。
  update public.memberships set role = p_new_role where id = p_membership_id;

  perform public.audit_log_write('staff_change_role', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_create(p_auth_user_id uuid, p_email text, p_name text, p_store_id uuid, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_email    text;
  v_new_org  uuid;
  v_user     public.users;
  v_user_id  uuid;
  v_existing public.memberships;
  v_result   uuid;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 入力検証（route でも検証するが RPC でも二重に守る）
  if p_auth_user_id is null then raise exception 'bad auth user'; end if;
  if p_email is null or length(trim(p_email)) = 0 or length(p_email) > 255 then raise exception 'bad email'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_role not in ('staff','manager') then raise exception 'bad role'; end if;
  v_email := lower(trim(p_email));  -- 【12】正規化（auth 側の小文字化保存と揃える）

  -- 配属先 store が同一 org であること（越境封じ・stores 経由で org 照合・他 org は invalid store）
  select org_id into v_new_org from public.stores where id = p_store_id;
  if v_new_org is null or v_new_org <> v_org then raise exception 'invalid store'; end if;

  -- 権限差: owner=org 全店 staff/manager 作成可 / manager=自店 staff のみ作成可（論点3）
  if v_role = 'owner' then
    null;  -- owner は staff/manager どちらも org 内全店に作成可
  elsif v_role = 'manager' then
    if p_store_id <> public.auth_store_id() then raise exception 'forbidden'; end if;  -- 自店のみ
    if p_role <> 'staff' then raise exception 'forbidden'; end if;                     -- manager は staff のみ（同格増殖封じ）
  else
    raise exception 'forbidden';  -- staff/cast は追加不可
  end if;

  -- ★既存 user 判定（UNIQUE(org_id, email) users レベル・確定D）。lower 比較（【12】）。
  select u.* into v_user
  from public.users u
  where u.org_id = v_org and lower(u.email) = v_email;

  if not found then
    -- 新規 user（通常ケース）: users INSERT（auth_user_id は route が生成したもの・
    -- 重複 auth uid は UNIQUE(auth_user_id) が 23505 で物理拒否＝【13】）
    insert into public.users (org_id, email, name, auth_user_id)
    values (v_org, v_email, trim(p_name), p_auth_user_id)
    returning id into v_user_id;
  else
    -- 既存 user（同 org 同 email）: users は作らない・名前/auth_user_id は上書きしない（【4】）
    v_user_id := v_user.id;
    -- 【11】inactive user は明示拒否（active membership を足しても auth ヘルパーが倒れたまま）
    if not v_user.is_active then raise exception 'inactive user'; end if;
    -- 【10】cast/owner 人材への staff/manager 追加付与を封じる
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.role not in ('staff','manager')
    ) then
      raise exception 'bad target';
    end if;
  end if;

  -- membership の出戻り分岐（UNIQUE(user_id, store_id) は active/inactive 問わず効く・Q-1 と同型）
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_user_id and m.store_id = p_store_id;

  if found then
    -- 【9】cast/owner 行の役職転換復帰を封じる（通常【10】が先に捕捉＝二重防御）
    if v_existing.role not in ('staff','manager') then raise exception 'bad target'; end if;
    -- 既存行あり: active なら重複追加＝拒否
    if v_existing.is_active then raise exception 'already member'; end if;
    -- ★1ユーザー1アクティブ: 他店に active があれば追加不可（先に異動/解除が要る）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.is_active
    ) then
      raise exception 'already active elsewhere';
    end if;
    -- 出戻り reactivate（フラグは既存値を維持＝Q-1 transfer と同じ・role は今回指定値）
    update public.memberships
       set is_active = true, role = p_role
     where id = v_existing.id
     returning id into v_result;
  else
    -- ★1ユーザー1アクティブ: 既存 user が他店に active を持つなら新規 membership 追加不可
    --  （完全新規 user はここに来た時点で membership 0行＝素通り。二重防御は部分ユニーク index）
    if exists (
      select 1 from public.memberships m
      where m.user_id = v_user_id and m.is_active
    ) then
      raise exception 'already active elsewhere';
    end if;
    -- 新規 membership INSERT（フラグ default false = fail-closed・【6】）
    insert into public.memberships (user_id, store_id, role, is_active)
    values (v_user_id, p_store_id, p_role, true)
    returning id into v_result;
  end if;

  -- audit（規約6・新規作成なので after のみ意味・before は生成情報の疑似 jsonb・【7】）
  perform public.audit_log_write('staff_create', 'memberships:' || v_result::text,
    jsonb_build_object('user_id', v_user_id, 'email', v_email, 'role', p_role, 'created', true),
    (select to_jsonb(m) from public.memberships m where m.id = v_result),
    p_store_id);

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_reactivate(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_row  public.memberships;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 対象 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- 対象は staff/manager のみ
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- 既に active なら明示拒否
  if v_row.is_active then raise exception 'already active'; end if;

  -- 1ユーザー1アクティブ: その user に他の active membership が無いことを検証
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_row.user_id and m.is_active and m.id <> p_membership_id
  ) then
    raise exception 'already active elsewhere';
  end if;

  -- is_active=true に戻す。フラグは残っていた値を維持（確定4・再雇用で設定が生きる）。
  update public.memberships set is_active = true where id = p_membership_id;

  perform public.audit_log_write('staff_reactivate', 'memberships:' || p_membership_id::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = p_membership_id),
    v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_transfer_store(p_membership_id uuid, p_new_store_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_row      public.memberships;   -- 異動元
  v_new_org  uuid;
  v_existing public.memberships;   -- 新店の既存行（出戻り判定）
  v_result   uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

  -- 異動元 membership を org 照合
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- ★異動は owner のみ（店を跨ぐ操作・確定3）。manager は自店しか見えないので不可。
  if v_role <> 'owner' then raise exception 'forbidden'; end if;

  -- 対象は staff/manager（cast は別・owner の異動は想定外）
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- 異動元は active であること（実装ノート【9】: inactive 行の異動は曖昧経路＝明示拒否。
  -- 復帰は staff_reactivate（同店）・別店への復帰は先に reactivate してから異動）。
  if not v_row.is_active then raise exception 'inactive membership'; end if;

  -- 異動先の店が同一 org であることを検証（org を跨ぐ異動は不可＝別会社）
  select org_id into v_new_org from public.stores where id = p_new_store_id;
  if v_new_org is null or v_new_org <> v_org then raise exception 'invalid store'; end if;

  -- 同店異動（新店 = 現店）は no-op として弾く
  if p_new_store_id = v_row.store_id then raise exception 'same store'; end if;

  -- 1ユーザー1アクティブ: 先に旧を is_active=false（枠を空ける・両方 active の瞬間を作らない）
  update public.memberships set is_active = false where id = p_membership_id;

  -- ★出戻り分岐: 新店に同 user の既存行（UNIQUE(user_id, store_id)）があるか
  select m.* into v_existing
  from public.memberships m
  where m.user_id = v_row.user_id and m.store_id = p_new_store_id;

  if found then
    -- 既存行を reactivate（role は異動元を引き継ぐ・フラグは既存値を維持）
    update public.memberships
       set is_active = true, role = v_row.role
     where id = v_existing.id
     returning id into v_result;
  else
    -- 新規 INSERT（フラグは default false = fail-closed で入る）
    insert into public.memberships (user_id, store_id, role, is_active)
    values (v_row.user_id, p_new_store_id, v_row.role, true)
    returning id into v_result;
  end if;

  perform public.audit_log_write('staff_transfer_store', 'memberships:' || v_result::text,
    to_jsonb(v_row),
    (select to_jsonb(m) from public.memberships m where m.id = v_result),
    p_new_store_id);
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_update_profile(p_membership_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := public.auth_org_id();
  v_role     text := public.auth_role();
  v_row      public.memberships;
  v_old_name text;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;

  -- 対象 membership を org 照合（stores join・memberships に org_id 列なし）
  select m.* into v_row
  from public.memberships m
  join public.stores s on s.id = m.store_id
  where m.id = p_membership_id and s.org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- 権限: owner || (manager && 自店)
  if not (v_role = 'owner'
          or (v_role = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.role not in ('staff','manager') then raise exception 'bad target'; end if;

  -- audit の old は UPDATE 前に確保（規約6・束2 customer_update 同型）
  select name into v_old_name from public.users where id = v_row.user_id;

  update public.users set name = trim(p_name) where id = v_row.user_id;

  perform public.audit_log_write('staff_update_profile', 'memberships:' || p_membership_id::text,
    jsonb_build_object('user_id', v_row.user_id, 'old_name', v_old_name),
    jsonb_build_object('user_id', v_row.user_id, 'new_name', trim(p_name)),
    v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.trial_hire(p_trial_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_row    public.trials;
  v_before jsonb;
  v_cast   uuid;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

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
end $function$;

CREATE OR REPLACE FUNCTION public.trial_register(p_store_id uuid, p_name text, p_birthday date, p_real_name text DEFAULT NULL::text, p_tier text DEFAULT NULL::text, p_trial_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_store_org uuid;
  v_today     date := (timezone('Asia/Tokyo', now()))::date;
  v_id        uuid;
begin
  -- fail-closed: 無所属/anon
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

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
end $function$;

CREATE OR REPLACE FUNCTION public.trial_reject(p_trial_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_row    public.trials;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

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
end $function$;

CREATE OR REPLACE FUNCTION public.trial_update(p_trial_id uuid, p_rating integer DEFAULT NULL::integer, p_documents jsonb DEFAULT NULL::jsonb, p_memo text DEFAULT NULL::text, p_tier text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org    uuid := public.auth_org_id();
  v_role   text := public.auth_role();
  v_row    public.trials;
  v_key    text;
  v_before jsonb;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;

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
end $function$;

-- ══════════════════════════════════════════════════════════
-- 規則C（39 本）
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.adv_cancel(p_advance_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row   record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.advances where id = p_advance_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 一部でも天引き済み（deducted_amount>0）or 既に deducted/cancelled は拒否（宙吊り防止・実装ノート【5】）
  if v_row.status <> 'open' or v_row.deducted_amount > 0 then raise exception 'advance settled'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.advances
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_advance_id;

  perform public.audit_log_write('adv_cancel', 'advances:' || p_advance_id::text,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'cancelled'), v_row.store_id);
  return p_advance_id;
end $function$;

CREATE OR REPLACE FUNCTION public.adv_issue(p_store_id uuid, p_cast_id uuid, p_amount integer, p_advanced_on date, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_cast  record;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_advanced_on is null then raise exception 'bad date'; end if;
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- paid 期間ガード（transport_issue 同型・凍結済み period に stranded 前借りを作らない・実装ノート【3】）
  --   前借りの period 帰属 = to_char(advanced_on,'YYYY-MM')（deduct_period は finalize が partial 時に設定）。
  --   paid 済み period に発行すると当該 period の finalize が 'run paid' で拒否され回収不能＝宙吊りになるため弾く。
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_advanced_on, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  -- cast は org+store 一致を server 照合（1 advance=1 cast）
  select id into v_cast from public.casts
    where id = p_cast_id and org_id = public.auth_org_id() and store_id = p_store_id;
  if v_cast.id is null then raise exception 'bad cast'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.advances (org_id, store_id, cast_id, amount, advanced_on, note, created_by)
  values (v_store.org_id, p_store_id, p_cast_id, p_amount, p_advanced_on, nullif(trim(coalesce(p_note,'')), ''), v_actor)
  returning id into v_id;

  perform public.audit_log_write('adv_issue', 'advances:' || v_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'advanced_on', p_advanced_on), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.approval_decide(p_approval_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ap record; v_actor uuid; v_before jsonb; v_cstatus text; v_line uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_ap from public.approvals where id = p_approval_id;
  if v_ap.id is null or v_ap.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_ap.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_ap.status <> 'pending' then raise exception 'already decided'; end if;
  v_before := to_jsonb(v_ap);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- 承認までに締められた/void 化された競合の防波堤（承認時点で check が open か再確認）
    select status into v_cstatus from public.checks where id = v_ap.check_id;
    if v_cstatus is null or v_cstatus <> 'open' then raise exception 'not applicable'; end if;
    v_line := public.approval_apply(p_approval_id);   -- discount line 挿入 + recalc（共通ヘルパー）
    update public.approvals
       set status = 'approved', line_id = v_line, decided_by = v_actor, decided_at = now()
     where id = p_approval_id;
    perform public.audit_log_write('approval_approve', 'approvals:' || p_approval_id::text, v_before,
      (select to_jsonb(a) from public.approvals a where a.id = p_approval_id), v_ap.store_id);
  else
    update public.approvals
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_approval_id;
    perform public.audit_log_write('approval_reject', 'approvals:' || p_approval_id::text, v_before,
      (select to_jsonb(a) from public.approvals a where a.id = p_approval_id), v_ap.store_id);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.approval_direct(p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid; v_line uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 直接承認は owner/manager のみ・自店
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 申請即承認: approved で INSERT → discount line 挿入 → line_id 記録（1トランザクション）
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status,
                                reason, requested_by, decided_by, decided_at)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'approved',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor, v_actor, now())
  returning id into v_id;
  v_line := public.approval_apply(v_id);           -- 共通ヘルパー（decide と同一 line 挿入）
  update public.approvals set line_id = v_line where id = v_id;
  perform public.audit_log_write('approval_direct', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.approval_request(p_check_id uuid, p_pay_group text, p_type text, p_amount integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_actor uuid; v_grp text; v_grp_sum int; v_amount int; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  -- 申請は黒服 can_register 以上（会計書込ゲート＝check_add_line と同一）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  if p_type is null or p_type not in ('discount','free') then raise exception 'bad type'; end if;
  v_grp := coalesce(nullif(trim(coalesce(p_pay_group, 'A')), ''), 'A');
  if length(v_grp) > 20 then raise exception 'bad group'; end if;
  if not exists (select 1 from public.check_lines where check_id = p_check_id and pay_group = v_grp) then
    raise exception 'no such group';
  end if;
  -- 割引前小計（既存 discount line は除外）
  select coalesce(sum(line_total), 0)::int into v_grp_sum
    from public.check_lines
   where check_id = p_check_id and pay_group = v_grp and kind <> 'discount';
  if v_grp_sum <= 0 then raise exception 'no group total'; end if;
  if p_type = 'free' then
    v_amount := v_grp_sum;                    -- free は小計を焼付け
  else
    if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
    if p_amount > v_grp_sum then raise exception 'amount exceeds group total'; end if;
    v_amount := p_amount;
  end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'bad reason'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.approvals (org_id, store_id, check_id, pay_group, type, amount, status, reason, requested_by)
  values (v_chk.org_id, v_chk.store_id, p_check_id, v_grp, p_type, v_amount, 'pending',
          nullif(trim(coalesce(p_reason, '')), ''), v_actor)
  returning id into v_id;
  perform public.audit_log_write('approval_request', 'approvals:' || v_id::text, null,
    (select to_jsonb(a) from public.approvals a where a.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.check_void(p_check_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_backs jsonb; v_actor uuid; v_settled int;
  v_pending_claims jsonb;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'bad reason'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_chk.status not in ('open','closed') then raise exception 'not voidable'; end if;

  -- 回収済み・一部でも給与天引き済み（deducted_amount>0）の売掛があれば void 拒否（宙吊り/幻影防止＝条件3＋partial）
  select count(*) into v_settled from public.receivables
    where check_id = p_check_id and (status in ('collected','deducted') or deducted_amount > 0);
  if v_settled > 0 then raise exception 'receivable settled'; end if;

  -- 監査痕跡: 削除する check_cast_backs を before に含める
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_backs
    from public.check_cast_backs b where b.check_id = p_check_id;
  -- 【F3f】監査痕跡: 自動 reject する pending claims も before に含める（cast_backs と同型・per-claim audit は書かない）
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_pending_claims
    from public.drink_claims d where d.check_id = p_check_id and d.status = 'pending';
  v_before := to_jsonb(v_chk) || jsonb_build_object('cast_backs', v_backs)
                              || jsonb_build_object('pending_claims', v_pending_claims);

  update public.receivables set status = 'voided'
    where check_id = p_check_id and status = 'open';
  delete from public.check_cast_backs where check_id = p_check_id;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 【F3f】void 時 pending claim 自動 reject（宙吊り防止＝receivables 'voided' と同型思想・approved は残置＝
  --        給与除外は collect.ts の void フィルタが単一責任点）
  update public.drink_claims
     set status = 'rejected', decided_by = v_actor, decided_at = now()
   where check_id = p_check_id and status = 'pending';
  update public.checks
     set status = 'void', voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_check_id;
  -- ★mig0053（B1 相席・transient）: 追加席の占有を解放（解放経路＝ロック不要・money 非干渉）
  delete from public.check_seats where check_id = p_check_id;
  perform public.audit_log_write('check_void', 'checks:' || p_check_id::text, v_before,
    (select to_jsonb(ch) from public.checks ch where ch.id = p_check_id), v_chk.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.drink_claim_decide(p_claim_id uuid, p_approve boolean, p_qty_override integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cl record; v_actor uuid; v_before jsonb; v_qty int; v_nom text; v_prod record; v_unit int; v_back int;
  v_chk_status text;  -- 【F3f】
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_approve is null then raise exception 'bad approve'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  -- 承認は黒服 can_register 以上・自店（代理型＝auth_cast_id チェックなし）
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
              and public.auth_staff_can_register())) then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'pending' then raise exception 'already decided'; end if;
  -- 【F3f】void 伝票への事後承認/却下を封じる（open/closed は従来どおり＝close 非依存思想は不変。
  --        check_void が pending を自動 reject するため本ガードは主にレース/残置行の backstop）
  select status into v_chk_status from public.checks where id = v_cl.check_id;
  if v_chk_status = 'void' then raise exception 'check voided'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_approve then
    -- 杯数修正（承認時訂正・null は申告 qty のまま）
    if p_qty_override is not null then
      if p_qty_override <= 0 then raise exception 'bad qty'; end if;
      v_qty := p_qty_override;
    else
      v_qty := v_cl.qty;
    end if;
    -- ★バック額焼付け（check_close の unit 計算と同一規則・products を承認時点で直読み）
    select nom_type into v_nom from public.checks where id = v_cl.check_id;
    select * into v_prod from public.products where id = v_cl.product_id;
    if v_prod.back_mode = 'unit4' then
      v_unit := coalesce((v_prod.unit4_json ->> v_nom)::int, 0);                             -- unit4[nom_type]（check_close 同一）
    else
      v_unit := round(v_prod.price * coalesce(v_prod.back_value, 0)::numeric / 100.0)::int;  -- rate（check_close 同一）
    end if;
    v_back := v_unit * v_qty;
    update public.drink_claims
       set status = 'approved', qty = v_qty, back_amount = v_back, decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_approve', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  else
    update public.drink_claims
       set status = 'rejected', decided_by = v_actor, decided_at = now()
     where id = p_claim_id;
    perform public.audit_log_write('drink_claim_reject', 'drink_claims:' || p_claim_id::text, v_before,
      (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.drink_claim_submit(p_check_id uuid, p_product_id uuid, p_qty integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast uuid; v_crow record; v_chk record; v_prod record; v_actor uuid; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  v_cast := public.auth_cast_id();
  if v_cast is null then raise exception 'no cast for caller'; end if;   -- cast セルフ専用
  if p_qty is null or p_qty <= 0 then raise exception 'bad qty'; end if;
  select org_id, store_id into v_crow from public.casts where id = v_cast;
  -- 対象 check（自店・open・cast は指名有無問わず申告可）
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() or v_chk.store_id <> v_crow.store_id then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;
  -- 対象 product（自 org・自店・drink/champ）
  select * into v_prod from public.products where id = p_product_id;
  if v_prod.id is null or v_prod.org_id <> public.auth_org_id() or v_prod.store_id <> v_crow.store_id
     or v_prod.type not in ('drink','champ') then
    raise exception 'bad product';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.drink_claims (org_id, store_id, check_id, cast_id, product_id, qty, back_amount, status, requested_by)
  values (v_crow.org_id, v_crow.store_id, p_check_id, v_cast, p_product_id, p_qty, 0, 'pending', v_actor)
  returning id into v_id;
  perform public.audit_log_write('drink_claim_submit', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_crow.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.drink_claim_submit_proxy(p_line_id uuid, p_cast_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record; v_chk record; v_cast record;
  v_actor uuid; v_unit int; v_back int; v_id uuid;
begin
  -- 冒頭 null ガード。kiosk 腕を意図的に持たない＝0059 非開示原則
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;

  select * into v_line from public.check_lines where id = p_line_id;
  if v_line.id is null or v_line.org_id <> public.auth_org_id() then
    raise exception 'forbidden';  -- 存在オラクル封じ
  end if;

  select * into v_chk from public.checks where id = v_line.check_id;
  if v_chk.id is null or v_chk.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;

  -- 黒服 can_register 以上（cast 腕なし＝代理起票は店側の行為）
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;

  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  if v_line.product_id is null or v_line.back_snapshot is null
     or v_line.kind not in ('drink','champ','bottle') then
    raise exception 'bad line';
  end if;

  -- ★mig0070: 経路排他の判定を凍結値へ（products の現価は読まない）
  if coalesce((v_line.back_snapshot ->> 'back_exempt')::boolean, false) is not true then
    raise exception 'not exempt product';
  end if;

  if exists (select 1 from public.drink_claims d
              where d.check_line_id = v_line.id and d.status = 'approved') then
    raise exception 'already claimed';
  end if;

  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id()
     or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
    raise exception 'bad cast';
  end if;

  -- ★焼付け＝伝票凍結値（check_close と同一の真実。マスタ現価では読まない）
  if v_line.back_snapshot ->> 'back_mode' = 'unit4' then
    v_unit := coalesce((v_line.back_snapshot -> 'unit4' ->> v_chk.nom_type)::int, 0);
  else
    v_unit := round(v_line.unit_price_snapshot
                    * coalesce((v_line.back_snapshot ->> 'back_value')::numeric, 0) / 100.0)::int;
  end if;
  v_back := v_unit * v_line.qty;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;

  insert into public.drink_claims
    (org_id, store_id, check_id, check_line_id, cast_id, product_id, qty, back_amount,
     status, requested_by, decided_by, decided_at)
  values
    (v_chk.org_id, v_chk.store_id, v_chk.id, v_line.id, p_cast_id, v_line.product_id,
     v_line.qty, v_back, 'approved', v_actor, v_actor, now())
  returning id into v_id;

  perform public.audit_log_write('drink_claim_submit_proxy', 'drink_claims:' || v_id::text, null,
    (select to_jsonb(d) from public.drink_claims d where d.id = v_id), v_chk.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.drink_claim_void(p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cl record; v_chk_status text; v_actor uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_cl from public.drink_claims where id = p_claim_id;
  if v_cl.id is null or v_cl.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
      or (public.auth_role() = 'manager' and v_cl.store_id = public.auth_store_id())
      or (public.auth_role() = 'staff' and v_cl.store_id = public.auth_store_id()
          and public.auth_staff_can_register())) is not true then
    raise exception 'forbidden';
  end if;
  if v_cl.status <> 'approved' then raise exception 'not approved'; end if;
  select status into v_chk_status from public.checks where id = v_cl.check_id;
  if v_chk_status <> 'open' then raise exception 'not open'; end if;
  v_before := to_jsonb(v_cl);
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.drink_claims
     set status = 'void', voided_by = v_actor, voided_at = now()
   where id = p_claim_id;
  perform public.audit_log_write('drink_claim_void', 'drink_claims:' || p_claim_id::text, v_before,
    (select to_jsonb(d) from public.drink_claims d where d.id = p_claim_id), v_cl.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.incentive_cancel(p_incentive_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row   record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.attendance_incentives where id = p_incentive_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'published' then raise exception 'not published'; end if;
  -- paid 期間ガード（凍結済み payslip との不整合防止・実装ノート【4】）
  if exists (select 1 from public.payroll_runs
             where store_id = v_row.store_id and period = to_char(v_row.biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.attendance_incentives
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_incentive_id;

  perform public.audit_log_write('incentive_cancel', 'attendance_incentives:' || p_incentive_id::text,
    jsonb_build_object('status', 'published'), jsonb_build_object('status', 'cancelled'), v_row.store_id);
  return p_incentive_id;
end $function$;

CREATE OR REPLACE FUNCTION public.incentive_publish(p_store_id uuid, p_biz_date date, p_kind text, p_amount_mode text, p_amount integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（drink_boost は予約値＝publish は bonus のみ受理・論点4）
  if p_biz_date is null then raise exception 'bad date'; end if;
  if p_kind is null or p_kind <> 'bonus' then raise exception 'kind reserved'; end if;
  if p_amount_mode is null or p_amount_mode not in ('per_head','pooled') then raise exception 'bad mode'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  -- store の org 照合＋ロール判定（owner 全店・manager 自店のみ・staff/cast 不可）
  select id, org_id into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- publish も paid 期間ガード（論点1・実装ノート【4】）
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  -- 同日 published は部分ユニークで原理的に排他（exists→insert の TOCTOU を閉じる）。
  -- on conflict のターゲットに部分ユニークインデックス述語を明示（insert は status='published' 固定＝必ずマッチ）。
  insert into public.attendance_incentives (org_id, store_id, biz_date, kind, amount_mode, amount, status, created_by)
  values (v_store.org_id, p_store_id, p_biz_date, 'bonus', p_amount_mode, p_amount, 'published', v_actor)
  on conflict (store_id, biz_date) where status = 'published' do nothing
  returning id into v_id;
  if v_id is null then raise exception 'already published'; end if; -- 競合で挿入されなかった＝同時発行

  perform public.audit_log_write('incentive_publish', 'attendance_incentives:' || v_id::text,
    null, jsonb_build_object('biz_date', p_biz_date, 'amount_mode', p_amount_mode, 'amount', p_amount), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.notice_create(p_title text, p_body text, p_audience text, p_pinned boolean, p_until date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid; v_title text; v_body text; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if not (public.auth_role() in ('owner','manager')) then raise exception 'forbidden'; end if;
  -- 検証（title 空/長さ・body 空・audience・pinned 明示値）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.notices (org_id, store_id, title, body, audience, pinned, until, created_by)
  values (public.auth_org_id(), public.auth_store_id(), v_title, v_body, p_audience, p_pinned, p_until, v_actor)
  returning id into v_id;
  perform public.audit_log_write('notice_create', 'notices:' || v_id::text, null,
    (select to_jsonb(n) from public.notices n where n.id = v_id), public.auth_store_id());
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.notice_delete(p_notice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.notices; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  v_before := to_jsonb(v_row);
  delete from public.notices where id = p_notice_id;
  perform public.audit_log_write('notice_delete', 'notices:' || p_notice_id::text, v_before, null, v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.notice_update(p_notice_id uuid, p_title text, p_body text, p_audience text, p_pinned boolean, p_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.notices; v_before jsonb; v_title text; v_body text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.notices where id = p_notice_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if; -- 存在オラクル封じ
  if not (public.auth_role() in ('owner','manager') and v_row.store_id = public.auth_store_id()) then
    raise exception 'forbidden';
  end if;
  -- 検証（create と同一）
  v_title := trim(coalesce(p_title, ''));
  if length(v_title) = 0 or length(v_title) > 80 then raise exception 'bad title'; end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 or length(v_body) > 4000 then raise exception 'bad body'; end if;
  if p_audience is null or p_audience not in ('all','cast','staff') then raise exception 'bad audience'; end if;
  if p_pinned is null then raise exception 'bad pinned'; end if;
  v_before := to_jsonb(v_row);
  update public.notices
     set title = v_title, body = v_body, audience = p_audience, pinned = p_pinned, until = p_until
   where id = p_notice_id;
  perform public.audit_log_write('notice_update', 'notices:' || p_notice_id::text, v_before,
    (select to_jsonb(n) from public.notices n where n.id = p_notice_id), v_row.store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.product_category_reorder(p_store_id uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_n     int;
  v_in    int;
  v_all   int;
  v_before jsonb;
  v_after  jsonb;
begin
  -- 二重防御①: 冒頭 null guard（NULL 比較の素通り防止）
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;

  v_n := coalesce(array_length(p_ids, 1), 0);
  if v_n = 0 then raise exception 'bad ids'; end if;

  -- 配列内の重複を拒否（同一 id が2回来ると ordinality が非決定になる）
  if v_n <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'duplicate ids';
  end if;

  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  -- ★件数一致を両方向で検証（BANZEN は片方向のみ＝部分配列が通り旧値と衝突する）
  --   ①配列の全 id が同 org/store に実在すること
  select count(*) into v_in
    from public.product_categories pc
   where pc.id = any(p_ids)
     and pc.store_id = p_store_id
     and pc.org_id = public.auth_org_id();
  if v_in <> v_n then raise exception 'forbidden'; end if;

  --   ②同 org/store の全行が配列に含まれること（欠けを拒否）
  select count(*) into v_all
    from public.product_categories pc
   where pc.store_id = p_store_id
     and pc.org_id = public.auth_org_id();
  if v_all <> v_n then raise exception 'partial ids'; end if;

  -- 監査: 並び替え前後の (id, sort_order) 一覧を記録（PII なし）
  select jsonb_agg(jsonb_build_object('id', pc.id, 'sort_order', pc.sort_order) order by pc.sort_order, pc.name)
    into v_before
    from public.product_categories pc
   where pc.store_id = p_store_id and pc.org_id = public.auth_org_id();

  update public.product_categories pc
     set sort_order = t.ord
    from unnest(p_ids) with ordinality as t(id, ord)
   where pc.id = t.id
     and pc.store_id = p_store_id
     and pc.org_id = public.auth_org_id();

  select jsonb_agg(jsonb_build_object('id', pc.id, 'sort_order', pc.sort_order) order by pc.sort_order, pc.name)
    into v_after
    from public.product_categories pc
   where pc.store_id = p_store_id and pc.org_id = public.auth_org_id();

  perform public.audit_log_write(
    'product_category_reorder',
    'product_categories:store:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.product_stock_add(p_product_id uuid, p_delta integer, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_store uuid;
  v_actor uuid;
  v_id    uuid;
  v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'bad delta'; end if;
  select org_id, store_id into v_org, v_store from public.products where id = p_product_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.stock_logs (org_id, store_id, product_id, delta, reason, by_user_id)
  values (v_org, v_store, p_product_id, p_delta, p_reason, v_actor)
  returning id into v_id;
  select to_jsonb(l) into v_after from public.stock_logs l where l.id = v_id;
  perform public.audit_log_write('product_stock_add', 'stock_logs:' || v_id::text, null, v_after, v_store);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_norm(p_cast_id uuid, p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org   uuid;
  v_cast_store uuid;
  v_id         uuid;
  v_before     jsonb;
  v_after      jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'bad period'; end if;
  if p_days_target is null or p_days_target < 0 then raise exception 'bad days_target'; end if;
  if p_dohan_target is null or p_dohan_target < 0 then raise exception 'bad dohan_target'; end if;
  if p_sales_target is null or p_sales_target < 0 then raise exception 'bad sales_target'; end if;
  if p_shimei_target is null or p_shimei_target < 0 then raise exception 'bad shimei_target'; end if;
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(n) into v_before from public.cast_norms n
    where n.cast_id = p_cast_id and n.period = p_period;
  insert into public.cast_norms
    (org_id, store_id, cast_id, period, days_target, dohan_target, sales_target, shimei_target)
  values
    (v_cast_org, v_cast_store, p_cast_id, p_period, p_days_target, p_dohan_target, p_sales_target, p_shimei_target)
  on conflict (cast_id, period) do update
    set days_target   = excluded.days_target,
        dohan_target  = excluded.dohan_target,
        sales_target  = excluded.sales_target,
        shimei_target = excluded.shimei_target,
        store_id      = excluded.store_id
  returning id into v_id;
  select to_jsonb(n) into v_after from public.cast_norms n where n.id = v_id;
  perform public.audit_log_write('set_cast_norm', 'cast_norms:' || v_id::text, v_before, v_after, v_cast_store);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_cast_plan(p_cast_id uuid, p_plan_id uuid, p_overrides jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast_org    uuid;
  v_cast_store  uuid;
  v_plan_org    uuid;
  v_plan_store  uuid;
  v_plan_active boolean;
  v_before      jsonb;
  v_after       jsonb;
  v_key         text;
  v_num         numeric;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- overrides 検証（②: キー制限＋値検証。null は {} と同義に正規化しない＝null 拒否）
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'bad overrides'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key not in ('base','honBack','jonaiBack','dohanBack',
                     'honBackMode','honBackRate','jonaiBackMode','jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if v_key in ('honBackMode','jonaiBackMode') then
      -- ★mig0086: 方式キーは文字列2値
      if jsonb_typeof(p_overrides -> v_key) <> 'string'
         or (p_overrides ->> v_key) not in ('per_count','rate') then
        raise exception 'bad overrides';
      end if;
    else
      if jsonb_typeof(p_overrides -> v_key) <> 'number' then raise exception 'bad overrides'; end if;
      v_num := (p_overrides ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad overrides'; end if;
      -- ★mig0086: 率キーは 0..100
      if v_key in ('honBackRate','jonaiBackRate') and v_num > 100 then
        raise exception 'bad overrides';
      end if;
    end if;
  end loop;
  -- ★mig0086: 原子性（設計v1）＝mode だけ上書きして値が plan 側から来る合成を拒否。
  --   mode='rate' → rate 必須／mode='per_count' → 円/本値必須／rate 単独（mode なし・mode≠rate）拒否。
  if (p_overrides ? 'honBackMode') then
    if (p_overrides ->> 'honBackMode') = 'rate' and not (p_overrides ? 'honBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'honBackMode') = 'per_count' and not (p_overrides ? 'honBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'honBackRate')
     and (not (p_overrides ? 'honBackMode') or (p_overrides ->> 'honBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  if (p_overrides ? 'jonaiBackMode') then
    if (p_overrides ->> 'jonaiBackMode') = 'rate' and not (p_overrides ? 'jonaiBackRate') then
      raise exception 'bad overrides';
    end if;
    if (p_overrides ->> 'jonaiBackMode') = 'per_count' and not (p_overrides ? 'jonaiBack') then
      raise exception 'bad overrides';
    end if;
  end if;
  if (p_overrides ? 'jonaiBackRate')
     and (not (p_overrides ? 'jonaiBackMode') or (p_overrides ->> 'jonaiBackMode') <> 'rate') then
    raise exception 'bad overrides';
  end if;
  -- cast の org/store 照合＋ロール判定（manager 以上・自店のみ）
  select org_id, store_id into v_cast_org, v_cast_store from public.casts where id = p_cast_id;
  if v_cast_org is null or v_cast_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast_store = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- plan の org/store 照合＋inactive 遮断（廃止プランへの新規割当は誤操作経路）
  -- 既存の cast_plan 行には触れない＝プラン廃止（is_active=false）で既割当は壊れない設計。
  select org_id, store_id, is_active into v_plan_org, v_plan_store, v_plan_active
    from public.comp_plans where id = p_plan_id;
  if v_plan_org is null or v_plan_org <> public.auth_org_id() or v_plan_store <> v_cast_store then
    raise exception 'forbidden';
  end if;
  if not v_plan_active then raise exception 'plan inactive'; end if;

  select to_jsonb(cp) into v_before from public.cast_plan cp where cp.cast_id = p_cast_id;
  insert into public.cast_plan (cast_id, org_id, store_id, plan_id, overrides_json)
  values (p_cast_id, v_cast_org, v_cast_store, p_plan_id, p_overrides)
  on conflict (cast_id) do update
    set plan_id = excluded.plan_id, overrides_json = excluded.overrides_json,
        store_id = excluded.store_id;
  select to_jsonb(cp) into v_after from public.cast_plan cp where cp.cast_id = p_cast_id;
  perform public.audit_log_write('set_cast_plan', 'cast_plan:' || p_cast_id::text, v_before, v_after, v_cast_store);
  return p_cast_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_comp_plan(p_id uuid, p_store_id uuid, p_name text, p_base integer, p_hon_back integer, p_jonai_back integer, p_dohan_back integer, p_sales_slide jsonb, p_point_slide jsonb, p_is_active boolean, p_hon_back_mode text DEFAULT 'per_count'::text, p_hon_back_rate integer DEFAULT NULL::integer, p_jonai_back_mode text DEFAULT 'per_count'::text, p_jonai_back_rate integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad base'; end if;
  if p_hon_back is null or p_hon_back < 0 then raise exception 'bad hon_back'; end if;
  if p_jonai_back is null or p_jonai_back < 0 then raise exception 'bad jonai_back'; end if;
  if p_dohan_back is null or p_dohan_back < 0 then raise exception 'bad dohan_back'; end if;
  -- ★mig0086: 方式（円/本｜率）検証＝列 CHECK と同値を RPC 権威でも実施
  if p_hon_back_mode is null or p_hon_back_mode not in ('per_count','rate') then
    raise exception 'bad hon_back_mode';
  end if;
  if p_hon_back_rate is not null and (p_hon_back_rate < 0 or p_hon_back_rate > 100) then
    raise exception 'bad hon_back_rate';
  end if;
  if (p_hon_back_mode = 'rate') <> (p_hon_back_rate is not null) then
    raise exception 'bad hon_back_rate';
  end if;
  if p_jonai_back_mode is null or p_jonai_back_mode not in ('per_count','rate') then
    raise exception 'bad jonai_back_mode';
  end if;
  if p_jonai_back_rate is not null and (p_jonai_back_rate < 0 or p_jonai_back_rate > 100) then
    raise exception 'bad jonai_back_rate';
  end if;
  if (p_jonai_back_mode = 'rate') <> (p_jonai_back_rate is not null) then
    raise exception 'bad jonai_back_rate';
  end if;
  perform public.comp_plan_slide_check(p_sales_slide);
  perform public.comp_plan_slide_check(p_point_slide);
  -- store の org 照合＋ロール判定（owner のみ＝D3a）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;

  if p_id is null then
    insert into public.comp_plans
      (org_id, store_id, name, base, hon_back, jonai_back, dohan_back, sales_slide, point_slide, is_active,
       hon_back_mode, hon_back_rate, jonai_back_mode, jonai_back_rate)
    values
      (public.auth_org_id(), p_store_id, trim(p_name), p_base, p_hon_back, p_jonai_back, p_dohan_back,
       p_sales_slide, p_point_slide, coalesce(p_is_active, true),
       p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(c) into v_before from public.comp_plans c
      where c.id = p_id and c.org_id = public.auth_org_id() and c.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.comp_plans
      set name = trim(p_name), base = p_base, hon_back = p_hon_back, jonai_back = p_jonai_back,
          dohan_back = p_dohan_back, sales_slide = p_sales_slide, point_slide = p_point_slide,
          is_active = coalesce(p_is_active, true),
          hon_back_mode = p_hon_back_mode, hon_back_rate = p_hon_back_rate,
          jonai_back_mode = p_jonai_back_mode, jonai_back_rate = p_jonai_back_rate
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(c) into v_after from public.comp_plans c where c.id = v_id;
  perform public.audit_log_write('set_comp_plan', 'comp_plans:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_custom_back_def(p_id uuid, p_store_id uuid, p_name text, p_basis text, p_value integer, p_cond jsonb, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
  v_min    numeric;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_basis not in ('hon','jonai','dohan','days','sales','pt','champCnt','bottleCnt','flat') then
    raise exception 'bad basis';
  end if;
  if p_value is null or p_value < 0 then raise exception 'bad value'; end if;
  if p_basis = 'sales' and p_value > 100 then raise exception 'bad value'; end if; -- sales は % 値
  if p_cond is not null then
    if jsonb_typeof(p_cond) <> 'object'
       or (select count(*) from jsonb_object_keys(p_cond)) <> 2
       or p_cond -> 'metric' is null or p_cond -> 'min' is null then
      raise exception 'bad cond';
    end if;
    if jsonb_typeof(p_cond -> 'metric') <> 'string'
       or (p_cond ->> 'metric') not in ('hon','jonai','dohan','days','sales','pt','champCnt','bottleCnt') then
      raise exception 'bad cond';
    end if;
    if jsonb_typeof(p_cond -> 'min') <> 'number' then raise exception 'bad cond'; end if;
    v_min := (p_cond ->> 'min')::numeric;
    if v_min < 0 or v_min <> trunc(v_min) then raise exception 'bad cond'; end if;
  end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.custom_back_defs (org_id, store_id, name, basis, value, cond_json, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_basis, p_value, p_cond, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(b) into v_before from public.custom_back_defs b
      where b.id = p_id and b.org_id = public.auth_org_id() and b.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.custom_back_defs
      set name = trim(p_name), basis = p_basis, value = p_value, cond_json = p_cond,
          is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(b) into v_after from public.custom_back_defs b where b.id = v_id;
  perform public.audit_log_write('set_custom_back_def', 'custom_back_defs:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_deduction(p_id uuid, p_store_id uuid, p_name text, p_amount integer, p_per text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_per not in ('day','month','rate') then raise exception 'bad per'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  if p_per = 'rate' and p_amount > 100 then raise exception 'bad amount'; end if; -- rate は % 値（100 超は設定ミス）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.deductions (org_id, store_id, name, amount, per, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_amount, p_per, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(d) into v_before from public.deductions d
      where d.id = p_id and d.org_id = public.auth_org_id() and d.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.deductions
      set name = trim(p_name), amount = p_amount, per = p_per, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(d) into v_after from public.deductions d where d.id = v_id;
  perform public.audit_log_write('set_deduction', 'deductions:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_penalty_config(p_store_id uuid, p_fine_absent integer, p_fine_late integer, p_hours_per_shift numeric, p_norm_on boolean, p_norm_days_flat integer, p_norm_days_per integer, p_norm_dohan_flat integer, p_norm_dohan_per integer, p_late_grace_min integer, p_early_grace_min integer, p_over_grace_min integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_fine_absent is null or p_fine_absent < 0 then raise exception 'bad fine_absent'; end if;
  if p_fine_late is null or p_fine_late < 0 then raise exception 'bad fine_late'; end if;
  if p_hours_per_shift is null or p_hours_per_shift <= 0 or p_hours_per_shift > 24 then raise exception 'bad hours_per_shift'; end if;
  if p_norm_on is null then raise exception 'bad norm_on'; end if;
  if p_norm_days_flat is null or p_norm_days_flat < 0 then raise exception 'bad norm_days_flat'; end if;
  if p_norm_days_per is null or p_norm_days_per < 0 then raise exception 'bad norm_days_per'; end if;
  if p_norm_dohan_flat is null or p_norm_dohan_flat < 0 then raise exception 'bad norm_dohan_flat'; end if;
  if p_norm_dohan_per is null or p_norm_dohan_per < 0 then raise exception 'bad norm_dohan_per'; end if;
  if p_late_grace_min is null or p_late_grace_min < 0 then raise exception 'bad late_grace_min'; end if;
  if p_early_grace_min is null or p_early_grace_min < 0 then raise exception 'bad early_grace_min'; end if;
  if p_over_grace_min is null or p_over_grace_min < 0 then raise exception 'bad over_grace_min'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;

  select to_jsonb(pc) into v_before from public.penalty_config pc where pc.store_id = p_store_id;
  insert into public.penalty_config
    (org_id, store_id, fine_absent, fine_late, hours_per_shift, norm_on,
     norm_days_flat, norm_days_per, norm_dohan_flat, norm_dohan_per,
     late_grace_min, early_grace_min, over_grace_min)
  values
    (public.auth_org_id(), p_store_id, p_fine_absent, p_fine_late, p_hours_per_shift, p_norm_on,
     p_norm_days_flat, p_norm_days_per, p_norm_dohan_flat, p_norm_dohan_per,
     p_late_grace_min, p_early_grace_min, p_over_grace_min)
  on conflict (store_id) do update
    set fine_absent = excluded.fine_absent, fine_late = excluded.fine_late,
        hours_per_shift = excluded.hours_per_shift, norm_on = excluded.norm_on,
        norm_days_flat = excluded.norm_days_flat, norm_days_per = excluded.norm_days_per,
        norm_dohan_flat = excluded.norm_dohan_flat, norm_dohan_per = excluded.norm_dohan_per,
        late_grace_min = excluded.late_grace_min, early_grace_min = excluded.early_grace_min,
        over_grace_min = excluded.over_grace_min
  returning id into v_id;
  select to_jsonb(pc) into v_after from public.penalty_config pc where pc.id = v_id;
  perform public.audit_log_write('set_penalty_config', 'penalty_config:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_product(p_id uuid, p_store_id uuid, p_type text, p_category text, p_name text, p_price integer, p_cost integer, p_back_mode text, p_back_value integer, p_unit4 jsonb, p_hon_pt integer, p_is_active boolean, p_reorder_point integer DEFAULT NULL::integer, p_category_id uuid DEFAULT NULL::uuid, p_back_exempt_from_split boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner    uuid;
  v_id       uuid;
  v_before   jsonb;
  v_after    jsonb;
  v_key      text;
  v_num      numeric;
  v_old_cost integer;
  v_exempt   boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 入力検証（DB CHECK と二段）
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if p_type not in ('drink','champ','bottle') then raise exception 'bad type'; end if;
  if p_price is null or p_price < 0 then raise exception 'bad price'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'bad cost'; end if;
  if p_back_mode not in ('rate','unit4') then raise exception 'bad back_mode'; end if;
  if p_back_mode = 'rate' and (p_back_value is null or p_back_value < 0) then raise exception 'bad back_value'; end if;
  -- unit4 は F2 給与計算の入力素材＝入口で値検証（4キーとも number・0以上・整数）
  if p_back_mode = 'unit4' then
    if p_unit4 is null then raise exception 'bad unit4'; end if;
    foreach v_key in array array['hon','jonai','dohan','free'] loop
      if jsonb_typeof(p_unit4 -> v_key) is distinct from 'number' then raise exception 'bad unit4'; end if;
      v_num := (p_unit4 ->> v_key)::numeric;
      if v_num < 0 or v_num <> trunc(v_num) then raise exception 'bad unit4'; end if;
    end loop;
  end if;
  if p_hon_pt is null or p_hon_pt < 0 then raise exception 'bad hon_pt'; end if;
  -- ★mig0069: キャストドリンク指定（按分除外）。null は false 扱い＝boolean を三値にしない
  v_exempt := coalesce(p_back_exempt_from_split, false);
  -- 按分ループを通らない＝hon_pt の分配経路も同時に失われるため、両立を入口で拒否
  -- （products_exempt_hon_pt_chk と二段。生の制約違反を UI に出さないための日本語化可能なエラー）
  if v_exempt and p_hon_pt <> 0 then raise exception 'exempt requires hon_pt 0'; end if;
  -- 発注点（在庫台帳 v1・null=しきい無し）
  if p_reorder_point is not null and p_reorder_point < 0 then raise exception 'bad reorder_point'; end if;
  -- カテゴリ（0063・null=未分類。同 org かつ同一店のカテゴリのみ許可＝クロス店割当遮断）
  if p_category_id is not null then
    if not exists (select 1 from public.product_categories pc
                    where pc.id = p_category_id
                      and pc.org_id = public.auth_org_id()
                      and pc.store_id = p_store_id) then
      raise exception 'bad category';
    end if;
  end if;
  -- store の org 照合＋ロール判定（クロステナント遮断）
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.products
      (org_id, store_id, type, category, name, price, back_mode, back_value, unit4_json, hon_pt, is_active, reorder_point, category_id, back_exempt_from_split)
    values
      (public.auth_org_id(), p_store_id, p_type, p_category, trim(p_name), p_price,
       p_back_mode, p_back_value, p_unit4, p_hon_pt, coalesce(p_is_active, true), p_reorder_point, p_category_id, v_exempt)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(p) into v_before from public.products p
      where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    -- 監査の形を #40 前と揃える：cost キーを合成（過去 audit 行との互換）
    select c.cost into v_old_cost from public.product_costs c where c.product_id = p_id;
    v_before := v_before || jsonb_build_object('cost', v_old_cost);
    update public.products
      set type = p_type, category = p_category, name = trim(p_name), price = p_price,
          back_mode = p_back_mode, back_value = p_back_value, unit4_json = p_unit4,
          hon_pt = p_hon_pt, is_active = coalesce(p_is_active, true), reorder_point = p_reorder_point,
          category_id = p_category_id, back_exempt_from_split = v_exempt
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  -- 原価は別テーブル（台帳#40）。null は「原価なし」＝行を消す（products.cost の null と同義）。
  if p_cost is null then
    delete from public.product_costs where product_id = v_id;
  else
    insert into public.product_costs (product_id, org_id, store_id, cost)
    values (v_id, public.auth_org_id(), p_store_id, p_cost)
    on conflict (product_id) do update
      set cost = excluded.cost, org_id = excluded.org_id, store_id = excluded.store_id;
  end if;

  select to_jsonb(p) into v_after from public.products p where p.id = v_id;
  v_after := v_after || jsonb_build_object('cost', p_cost);
  perform public.audit_log_write('set_product', 'products:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_product_active(p_id uuid, p_store_id uuid, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_id is null then raise exception 'bad id'; end if;
  if p_is_active is null then raise exception 'bad is_active'; end if;

  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(p) into v_before from public.products p
   where p.id = p_id and p.org_id = public.auth_org_id() and p.store_id = p_store_id;
  if v_before is null then raise exception 'not found'; end if;

  update public.products
     set is_active = p_is_active
   where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;

  select to_jsonb(p) into v_after from public.products p where p.id = p_id;

  perform public.audit_log_write(
    'set_product_active', 'products:' || p_id::text, v_before, v_after, p_store_id);
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_product_category(p_id uuid, p_store_id uuid, p_name text, p_sort_order integer, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 40 then raise exception 'bad name'; end if;
  if p_sort_order is null then raise exception 'bad sort_order'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 同店重複名の明示拒否（unique index は backstop）
  if exists (select 1 from public.product_categories pc
              where pc.store_id = p_store_id
                and lower(pc.name) = lower(trim(p_name))
                and pc.id is distinct from p_id) then
    raise exception 'duplicate name';
  end if;

  if p_id is null then
    insert into public.product_categories (org_id, store_id, name, sort_order, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_sort_order, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(pc) into v_before from public.product_categories pc
      where pc.id = p_id and pc.org_id = public.auth_org_id() and pc.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.product_categories
       set name = trim(p_name), sort_order = p_sort_order, is_active = coalesce(p_is_active, true)
     where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;

  select to_jsonb(pc) into v_after from public.product_categories pc where pc.id = v_id;
  perform public.audit_log_write('set_product_category', 'product_categories:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_seat(p_id uuid, p_store_id uuid, p_name text, p_kind text, p_sort_order integer, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner  uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 40 then raise exception 'bad name'; end if;
  if p_kind is not null and p_kind not in ('卓','カウンター','VIP') then raise exception 'bad kind'; end if;
  if p_sort_order is null or p_sort_order < 0 then raise exception 'bad sort'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  if p_id is null then
    insert into public.seats (org_id, store_id, name, kind, sort_order, is_active)
    values (public.auth_org_id(), p_store_id, trim(p_name), p_kind, p_sort_order, coalesce(p_is_active, true))
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.seats s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.store_id = p_store_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.seats
      set name = trim(p_name), kind = p_kind, sort_order = p_sort_order, is_active = coalesce(p_is_active, true)
      where id = p_id and org_id = public.auth_org_id() and store_id = p_store_id;
    v_id := p_id;
  end if;
  select to_jsonb(s) into v_after from public.seats s where s.id = v_id;
  perform public.audit_log_write('set_seat', 'seats:' || v_id::text, v_before, v_after, p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_staffing_need(p_store_id uuid, p_dow integer, p_required integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_before jsonb; v_id uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_required is null or p_required < 0 then raise exception 'bad required'; end if;
  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  select to_jsonb(n) into v_before from public.staffing_needs n
    where n.store_id = p_store_id and n.dow = p_dow;
  insert into public.staffing_needs (org_id, store_id, dow, required)
  values (public.auth_org_id(), p_store_id, p_dow, p_required)
  on conflict (store_id, dow) do update set required = excluded.required
  returning id into v_id;
  perform public.audit_log_write('set_staffing_need', 'staffing_needs:' || v_id::text, v_before,
    (select to_jsonb(n) from public.staffing_needs n where n.id = v_id), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_business_hours(p_store_id uuid, p_dow integer, p_is_closed boolean, p_open_hm text DEFAULT NULL::text, p_close_hm text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_before jsonb;
  v_id uuid;
  v_open_min int;
  v_close_min int;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_dow is null or p_dow < 0 or p_dow > 6 then raise exception 'bad dow'; end if;
  if p_is_closed is null then raise exception 'bad closed'; end if;

  if p_is_closed then
    if p_open_hm is not null or p_close_hm is not null then raise exception 'bad hours'; end if;
  else
    if p_open_hm is null or p_close_hm is null then raise exception 'bad hours'; end if;
    if p_open_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad hours'; end if;
    if p_close_hm !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad hours'; end if;
    v_open_min  := split_part(p_open_hm, ':', 1)::int * 60 + split_part(p_open_hm, ':', 2)::int;
    v_close_min := split_part(p_close_hm, ':', 1)::int * 60 + split_part(p_close_hm, ':', 2)::int;
    if v_close_min <= v_open_min then raise exception 'bad hours'; end if;
  end if;

  select org_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null or v_owner <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;

  select to_jsonb(bh) into v_before from public.store_business_hours bh
    where bh.store_id = p_store_id and bh.dow = p_dow;

  insert into public.store_business_hours (org_id, store_id, dow, is_closed, open_hm, close_hm)
  values (public.auth_org_id(), p_store_id, p_dow, p_is_closed, p_open_hm, p_close_hm)
  on conflict (store_id, dow) do update
    set is_closed = excluded.is_closed,
        open_hm   = excluded.open_hm,
        close_hm  = excluded.close_hm
  returning id into v_id;

  perform public.audit_log_write('set_store_business_hours', 'store_business_hours:' || v_id::text,
    v_before, (select to_jsonb(bh) from public.store_business_hours bh where bh.id = v_id), p_store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_cast_register(p_store_id uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  boolean;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_enabled is null then raise exception 'bad enabled'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(v_store.settings_json->>'cast_register_enabled', '') = 'true';
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{cast_register_enabled}', to_jsonb(p_enabled), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_cast_register', 'stores:' || p_store_id::text,
    jsonb_build_object('cast_register_enabled', v_prev), jsonb_build_object('cast_register_enabled', p_enabled), p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_norm_config(p_store_id uuid, p_sales_enabled boolean, p_shimei_enabled boolean, p_shimei_scope text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store  record;
  v_before jsonb;
  v_after  jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_sales_enabled is null then raise exception 'bad sales_enabled'; end if;
  if p_shimei_enabled is null then raise exception 'bad shimei_enabled'; end if;
  if p_shimei_scope is null or p_shimei_scope not in ('hon','hon_jonai') then raise exception 'bad shimei_scope'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_before := jsonb_build_object(
    'sales_norm_enabled',  coalesce(v_store.settings_json->>'sales_norm_enabled', '') = 'true',
    'shimei_norm_enabled', coalesce(v_store.settings_json->>'shimei_norm_enabled', '') = 'true',
    'shimei_norm_scope',   coalesce(nullif(trim(v_store.settings_json->>'shimei_norm_scope'), ''), 'hon')
  );
  update public.stores
     set settings_json =
       jsonb_set(
         jsonb_set(
           jsonb_set(coalesce(settings_json, '{}'::jsonb),
             '{sales_norm_enabled}',  to_jsonb(p_sales_enabled),  true),
           '{shimei_norm_enabled}', to_jsonb(p_shimei_enabled), true),
         '{shimei_norm_scope}',   to_jsonb(p_shimei_scope),   true)
   where id = p_store_id;
  v_after := jsonb_build_object(
    'sales_norm_enabled',  p_sales_enabled,
    'shimei_norm_enabled', p_shimei_enabled,
    'shimei_norm_scope',   p_shimei_scope
  );
  perform public.audit_log_write('set_store_norm_config', 'stores:' || p_store_id::text, v_before, v_after, p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_okuri_base(p_store_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（okuri_mode と同格）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_base_amount'), ''), '0');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_base_amount}', to_jsonb(p_amount), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_base', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_base_amount', v_prev), jsonb_build_object('okuri_base_amount', p_amount), p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_okuri_mode(p_store_id uuid, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_prev  text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_mode is null or p_mode not in ('flat','actual') then raise exception 'bad mode'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{okuri_mode}', to_jsonb(p_mode), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_okuri_mode', 'stores:' || p_store_id::text,
    jsonb_build_object('okuri_mode', v_prev), jsonb_build_object('okuri_mode', p_mode), p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_pricing(p_store_id uuid, p_hon_fee integer, p_jonai_fee integer, p_dohan_fee integer, p_service_rate integer, p_card_tax_rate integer, p_round_unit integer, p_round_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否（coalesce の null→既定リセット挙動を作らない）。
  -- 範囲は列 CHECK と同値＝二段（raise の方が PostgREST エラーが読みやすい）。
  if p_hon_fee is null or p_hon_fee < 0 then raise exception 'bad pricing'; end if;
  if p_jonai_fee is null or p_jonai_fee < 0 then raise exception 'bad pricing'; end if;
  if p_dohan_fee is null or p_dohan_fee < 0 then raise exception 'bad pricing'; end if;
  if p_service_rate is null or p_service_rate < 0 or p_service_rate > 100 then raise exception 'bad pricing'; end if;
  if p_card_tax_rate is null or p_card_tax_rate < 0 or p_card_tax_rate > 100 then raise exception 'bad pricing'; end if;
  if p_round_unit is null or p_round_unit < 1 or p_round_unit > 10000 then raise exception 'bad pricing'; end if;
  if p_round_mode is null or p_round_mode not in ('up','down','round') then raise exception 'bad pricing'; end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は料金7列のみの合成 jsonb（settings_json 全文を監査に混ぜない＝E1 設計 §2・過去 audit との形は
  -- to_jsonb(部分) 合成の #40 流儀と同型）
  select jsonb_build_object(
           'hon_fee', hon_fee, 'jonai_fee', jonai_fee, 'dohan_fee', dohan_fee,
           'service_rate', service_rate, 'card_tax_rate', card_tax_rate,
           'round_unit', round_unit, 'round_mode', round_mode)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set hon_fee = p_hon_fee, jonai_fee = p_jonai_fee, dohan_fee = p_dohan_fee,
         service_rate = p_service_rate, card_tax_rate = p_card_tax_rate,
         round_unit = p_round_unit, round_mode = p_round_mode
   where id = p_store_id;
  select jsonb_build_object(
           'hon_fee', hon_fee, 'jonai_fee', jonai_fee, 'dohan_fee', dohan_fee,
           'service_rate', service_rate, 'card_tax_rate', card_tax_rate,
           'round_unit', round_unit, 'round_mode', round_mode)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_pricing', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.set_store_time_pricing(p_store_id uuid, p_set_min integer, p_set_fee integer, p_ext_min integer, p_ext_fee integer, p_time_mode text, p_time_per text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_before jsonb; v_after jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  -- 原則7: UI は常に全値明示送信＝null は拒否（coalesce の null→既定リセット挙動を作らない）。
  -- 範囲は列 CHECK と同値＝二段（raise の方が PostgREST エラーが読みやすい）。
  if p_set_min is null or p_set_min < 1 or p_set_min > 1440 then raise exception 'bad time pricing'; end if;
  if p_set_fee is null or p_set_fee < 0 then raise exception 'bad time pricing'; end if;
  if p_ext_min is null or p_ext_min < 1 or p_ext_min > 1440 then raise exception 'bad time pricing'; end if;
  if p_ext_fee is null or p_ext_fee < 0 then raise exception 'bad time pricing'; end if;
  if p_time_mode is null or p_time_mode not in ('manual','auto') then raise exception 'bad time pricing'; end if;
  if p_time_per is null or p_time_per not in ('table','person') then raise exception 'bad time pricing'; end if;
  select org_id into v_org from public.stores where id = p_store_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- 監査は時間制6列のみの合成 jsonb（E1 の7キー合成と同型・settings_json 全文を監査に混ぜない）
  select jsonb_build_object(
           'set_min', set_min, 'set_fee', set_fee, 'ext_min', ext_min,
           'ext_fee', ext_fee, 'time_mode', time_mode, 'time_per', time_per)
    into v_before from public.stores where id = p_store_id;
  update public.stores
     set set_min = p_set_min, set_fee = p_set_fee, ext_min = p_ext_min,
         ext_fee = p_ext_fee, time_mode = p_time_mode, time_per = p_time_per
   where id = p_store_id;
  select jsonb_build_object(
           'set_min', set_min, 'set_fee', set_fee, 'ext_min', ext_min,
           'ext_fee', ext_fee, 'time_mode', time_mode, 'time_per', time_per)
    into v_after from public.stores where id = p_store_id;
  perform public.audit_log_write('set_store_time_pricing', 'stores:' || p_store_id::text,
    v_before, v_after, p_store_id);
end $function$;

CREATE OR REPLACE FUNCTION public.shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','confirmed') then raise exception 'bad status'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否（create/update 共通・ロール照合の後=他店曜日の probing 防止）
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.shift_wish_decide(p_wish_id uuid, p_accept boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  -- ★B-5②: accept のみ定休日ハード拒否（提出後に定休日設定された競合の防波堤・reject は定休日でも可・wish は pending のまま）
  if p_accept and public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
    raise exception 'closed day';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.shift_wishes
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = p_wish_id;
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
  perform public.audit_log_write('shift_wish_decide', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish),
    jsonb_build_object(
      'wish', (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id),
      'generated_shift_id', v_shift),
    v_wish.store_id);
  return v_shift; -- reject 時は null
end $function$;

CREATE OR REPLACE FUNCTION public.transport_cancel(p_transport_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row   record;
  v_actor uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  select * into v_row from public.transport where id = p_transport_id;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_row.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'open' or v_row.deducted_amount > 0 then raise exception 'transport settled'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.transport
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = p_transport_id;

  perform public.audit_log_write('transport_cancel', 'transport:' || p_transport_id::text,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'cancelled'), v_row.store_id);
  return p_transport_id;
end $function$;

CREATE OR REPLACE FUNCTION public.transport_issue(p_store_id uuid, p_cast_id uuid, p_amount integer, p_biz_date date, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store record;
  v_cast  record;
  v_mode  text;
  v_actor uuid;
  v_id    uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_biz_date is null then raise exception 'bad date'; end if;
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and p_store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- L3' 構造的排他: okuri_mode='actual' の店でのみ実費入力を受理（fail-closed＝flat/未設定/不正は拒否）
  v_mode := coalesce(nullif(trim(v_store.settings_json->>'okuri_mode'), ''), 'flat');
  if v_mode <> 'actual' then raise exception 'okuri not actual'; end if;
  -- paid 期間ガード（凍結済み period に stranded 送りを作らない・incentive_publish 同型）
  if exists (select 1 from public.payroll_runs
             where store_id = p_store_id and period = to_char(p_biz_date, 'YYYY-MM') and status = 'paid') then
    raise exception 'paid period';
  end if;
  select id into v_cast from public.casts
    where id = p_cast_id and org_id = public.auth_org_id() and store_id = p_store_id;
  if v_cast.id is null then raise exception 'bad cast'; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  insert into public.transport (org_id, store_id, cast_id, amount, biz_date, note, created_by)
  values (v_store.org_id, p_store_id, p_cast_id, p_amount, p_biz_date, nullif(trim(coalesce(p_note,'')), ''), v_actor)
  returning id into v_id;

  perform public.audit_log_write('transport_issue', 'transport:' || v_id::text,
    null, jsonb_build_object('cast_id', p_cast_id, 'amount', p_amount, 'biz_date', p_biz_date), p_store_id);
  return v_id;
end $function$;
