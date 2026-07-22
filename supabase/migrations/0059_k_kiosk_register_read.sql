-- 0059_k_kiosk_register_read.sql
-- レジ用キオスク K（裁定11/15・N1-b）＝read layer（3/3・★0056/0057/0058 適用済みが前提）。
--   kiosk register device は membership 非保有＝auth_org_id() null＝RLS 直読み 0行（anon-guard 段35 実測）の
--   ため、register UI の表示データを返す読取 RPC 2本のみを新設する。書込は 0057/0058 の kiosk 腕が既済・
--   本 mig は SELECT 集約のみ＝checks/check_lines/payments へ 1 文字も書かない（money-core 非接触）。
--
-- 設計正本＝相談役設計確定（2026-07-22）：
--  - RPC 2本のみ：kiosk_register_state()＝自店 open 伝票マップ（seat グリッド用・check id/seat ids/小計）／
--    kiosk_check_detail(p_check_id)＝明細/入金/指名/席/合計 jsonb。
--  - 認可＝★OR連鎖ゲート禁止（0058／F0 セキュリティセルフレビュー §7.1 教訓）。正ガード先行のみ：
--      v_store := public.auth_kiosk_register_store_id();
--      if v_store is null or public.auth_kiosk_operator() is null then raise exception 'forbidden';
--    （is null 述語は真偽二値＝三値化せず fail-closed。detail は対象 check の store 照合で
--     他店→'forbidden'・不存在→'not found'＝相談役指定のエラー写像）。
--  - kiosk 専用（人間ロールは開放しない＝register device 非保有ゆえ正ガードが弾く。人間の正経路は既存 RLS 直読み）。
--  - 返却列＝register UI 表示分のみ。back_amount/back_snapshot/給与系/cast 機微/顧客系は返さない（#34 同族禁止）。
--    合計（小計・入金計・残額）は RPC 内集約で返す。
--  - SECURITY DEFINER・set search_path=public・revoke public,anon・grant execute to authenticated。
--
-- 写経元（2026-07-22 現物・記憶再構成なし）：
--  - 認可ガード/ACL 形＝kiosk_operator_list（live prosrc）＋0058 の正ガード形。
--  - 返却列＝register UI の実 SELECT 列そのまま：
--    ・state 側＝app/(manage)/register/page.tsx の server props（seats: id,name,kind・is_active・order sort_order／
--      products: id,name,type,price・is_active・order type／casts: id,name・is_active・order name）
--      ＋register-board loadOpenMap（checks: id,seat_id の open のみ／check_seats: seat_id,check_id）
--      ＋小計＝checks.total（相談役 spec「check id/seat ids/小計」）。
--    ・detail 側＝register-board loadCheck の実列（check_lines: id,kind,pay_group,name_snapshot,
--      unit_price_snapshot,qty,line_total・order sort_order／payments: id,pay_group,method,amount,tendered,
--      method_detail・order paid_at／check_nominations: cast_id,ratio_weight・order position／
--      check_seats: seat_id／stores: time_mode）＋checks は表示使用列のみ（status/people/nom_type/started_at/
--      total/service_rate/round_unit/round_mode＝group due クライアント計算と経過表示の最小）。
--
-- ★レビュー明示点（相談役の全文承認で確定・差し替え容易な独立点）：
--  (a) state に seats/products/casts のマスタ3配列を含めた。spec の列挙は open 伝票マップだが、register-board は
--      これらを server props（member セッション RLS）で得ており kiosk には読取経路が無い。無いと
--      check_add_line（商品選択）/check_set_nominations（cast 選択）/seat グリッド描画が成立しない。
--      返却列は page.tsx server props と同一＝register UI 表示分の範囲内。過剰なら該当キー削除のみで縮小可。
--  (b) 読取ガードも auth_kiosk_operator() 経由＝呼ぶたび滑走 idle を touch（60秒スロットル）。
--      ★UI 契約：state/detail をタイマー自動ポーリングしない（読取だけで 15分 idle が失効しなくなるため・
--      読取は操作起点のみ）。非 touch 変種が要るなら別途裁定。
--  (c) detail は closed/void 伝票も返す（status 同梱）＝close 直後の print_enqueue（再発行含む）導線用。
--      kiosk に void 操作は無い（確定①）＝表示のみ。
--  (d) customer_id / approvals は返さない（承認系は kiosk 対象外＝確定②・顧客結線は kiosk v1 対象外）。
--  (e) 両 RPC とも VOLATILE（既定）＝auth_kiosk_operator() が VOLATILE（touch の UPDATE 内包・live 実測
--      provolatile='v'）のため STABLE 宣言不可（STABLE 内から UPDATE は runtime エラー）。
--  (f) 読取専用 RPC ゆえ audit_log_write なし（kiosk_cast_list/kiosk_operator_list と同じ流儀＝規約6 は全「書込」RPC）。
--
-- 適用後の検証（"Success" 表示だけを信用しない・貼り先 ref を目視確認）:
--   -- 0) 貼り先証明（1行返れば正・エラー/0件なら誤貼り先＝即中断）
--   select 'nox-project-proof', count(*) from public.orgs;
--   -- 1) 新 RPC 2本の存在＋署名一意（オーバーロード無し）
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where pronamespace='public'::regnamespace
--       and proname in ('kiosk_register_state','kiosk_check_detail') order by proname;
--   --   期待: kiosk_check_detail = p_check_id uuid / kiosk_register_state = （空）の各1行
--   -- 2) ACL: authenticated 保持・anon/public 不在
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_register_state','kiosk_check_detail') order by proname;
--   -- 3) ★正ガード形の逐語（OR連鎖ゲート不在）
--   select count(*) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_register_state','kiosk_check_detail')
--     and prosrc like '%if v_store is null or public.auth_kiosk_operator() is null then%';  -- 期待 2
--   select count(*) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_register_state','kiosk_check_detail')
--     and prosrc ilike '%if not (%';  -- 期待 0
--   -- 4) 機微トークン非含有（back 系/顧客/操作者列）
--   select count(*) from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_register_state','kiosk_check_detail')
--     and (prosrc ilike '%back%' or prosrc ilike '%customer%' or prosrc ilike '%by_user_id%');  -- 期待 0
--   -- 5) VOLATILE（(e) の根拠どおり）
--   select proname, provolatile from pg_proc where pronamespace='public'::regnamespace
--     and proname in ('kiosk_register_state','kiosk_check_detail') order by proname;  -- 期待 v / v
--   -- 6) money-core 非接触（本 mig が create or replace するのは新2本のみ＝check_* は不変。ハッシュ照合推奨）
--   -- 7) 手貼り後 notify pgrst, 'reload schema';

begin;

-- ══════════════════════════════════════════════════════════════
-- ① kiosk_register_state（自店 open 伝票マップ＋register UI マスタ3配列・kiosk 専用読取）
--    正ガード先行のみ（OR連鎖ゲート禁止＝0058 教訓）。マスタ列は page.tsx server props と同一。
--    checks 配列＝loadOpenMap の {id, seat_id}＋追加席 ids＋小計 total（spec）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_register_state()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_store uuid;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                       order by s.sort_order)
        from public.seats s
       where s.store_id = v_store and s.is_active), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'price', p.price)
                       order by p.type)
        from public.products p
       where p.store_id = v_store and p.is_active), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.casts c
       where c.store_id = v_store and c.is_active), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ck.id,
               'seat_id', ck.seat_id,
               'extra_seat_ids', coalesce((
                 select jsonb_agg(cs.seat_id order by cs.created_at)
                   from public.check_seats cs where cs.check_id = ck.id), '[]'::jsonb),
               'total', ck.total) order by ck.started_at)
        from public.checks ck
       where ck.store_id = v_store and ck.status = 'open'), '[]'::jsonb)
  );
end $$;
revoke execute on function public.kiosk_register_state() from public, anon;
grant  execute on function public.kiosk_register_state() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- ② kiosk_check_detail（伝票詳細＝明細/入金/指名/席/合計・kiosk 専用読取）
--    正ガード→不存在 'not found'→他店 'forbidden'（相談役指定のエラー写像）。
--    返却列＝loadCheck 実列のみ（back_snapshot/customer_id/approvals/by_user_id 非開示）。
-- ══════════════════════════════════════════════════════════════
create or replace function public.kiosk_check_detail(p_check_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_store uuid;
  v_chk   public.checks;
  v_paid  integer;
begin
  -- ★正ガード先行のみ（is null 述語は三値化しない＝fail-closed。F0 §7.1 教訓）
  v_store := public.auth_kiosk_register_store_id();
  if v_store is null or public.auth_kiosk_operator() is null then
    raise exception 'forbidden';
  end if;

  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null then raise exception 'not found'; end if;
  if v_chk.store_id <> v_store then raise exception 'forbidden'; end if;

  select coalesce(sum(pm.amount), 0)::int into v_paid
    from public.payments pm where pm.check_id = p_check_id;

  return jsonb_build_object(
    'check', jsonb_build_object(
      'id', v_chk.id, 'seat_id', v_chk.seat_id, 'status', v_chk.status,
      'people', v_chk.people, 'nom_type', v_chk.nom_type, 'started_at', v_chk.started_at,
      'total', v_chk.total,
      'service_rate', v_chk.service_rate, 'round_unit', v_chk.round_unit, 'round_mode', v_chk.round_mode),
    'time_mode', (select st.time_mode from public.stores st where st.id = v_chk.store_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'kind', l.kind, 'pay_group', l.pay_group,
               'name_snapshot', l.name_snapshot, 'unit_price_snapshot', l.unit_price_snapshot,
               'qty', l.qty, 'line_total', l.line_total) order by l.sort_order)
        from public.check_lines l where l.check_id = p_check_id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pm.id, 'pay_group', pm.pay_group, 'method', pm.method,
               'amount', pm.amount, 'tendered', pm.tendered, 'method_detail', pm.method_detail)
                       order by pm.paid_at)
        from public.payments pm where pm.check_id = p_check_id), '[]'::jsonb),
    'nominations', coalesce((
      select jsonb_agg(jsonb_build_object('cast_id', n.cast_id, 'ratio_weight', n.ratio_weight)
                       order by n.position)
        from public.check_nominations n where n.check_id = p_check_id), '[]'::jsonb),
    'extra_seat_ids', coalesce((
      select jsonb_agg(cs.seat_id order by cs.created_at)
        from public.check_seats cs where cs.check_id = p_check_id), '[]'::jsonb),
    'paid_total', v_paid,
    'balance', v_chk.total - v_paid
  );
end $$;
revoke execute on function public.kiosk_check_detail(uuid) from public, anon;
grant  execute on function public.kiosk_check_detail(uuid) to authenticated;

commit;
