-- 0035_approvals_discount_kind: F3c — 二重承認の土台①（会計中核）
-- ★★ 非idempotent（drop constraint → add constraint を含む）・再適用厳禁 ★★
--    再流すと drop 時点で 'constraint "check_lines_kind_check" ... does not exist' で全体 rollback。
--
-- 目的（F3c 二重承認 approvals の前提）:
--  ① check_lines.kind CHECK に 'discount' を追加（承認された割引/無料を専用 kind の line として持てるように）。
--     ★他の CHECK（line_total>=0 / unit_price_snapshot>=0 / qty>0）は一切触らない
--       ＝案X（正の値の discount line・check_group_due 側で減算）なのでこれらに抵触しない。
--  ② check_group_due を「割引後小計にサービス料」へ改修（順序(i)＝割引→サービス料）。
--     v_bx=通常小計(kind<>'discount')・v_disc=割引合計(kind='discount')・v_net=greatest(0, v_bx-v_disc)。
--     ★discount line が無い group は v_disc=0 → v_net=v_bx ＝ 従来と完全に同一（回帰ゼロ・下記検証で証明）。
--     create or replace＝現行 ACL 維持（grant 再付与なし・mig0033 の流儀）。
--  ★ripple: check_group_due は check_recalc/check_close/check_pay に加え cast_sales_aggregate(F2a) も使う。
--    discount 存在時は cast 売上の due も割引後になる（0件なら不変）。相談役確認事項。
--
-- 適用後の検証（"Success" だけ信用しない・先頭に貼り先証明）:
--   0) select 'nox-project-proof', count(*) from public.orgs;
--   1) kind CHECK に discount が入ったか:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--        where conrelid='public.check_lines'::regclass and conname='check_lines_kind_check';
--      （ARRAY[... 'custom','discount'] を目視）
--   2) check_group_due prosrc:
--      select pg_get_functiondef('check_group_due(uuid, text)'::regprocedure);
--      （v_bx=kind<>'discount' / v_disc=kind='discount' / greatest(0, v_bx-v_disc) を目視）
--   3) notify pgrst, 'reload schema';
--   4) ★回帰ゼロの実測: 適用後に会計 verify 群（check_close/check_pay/レジ会計の段・cast_sales）を全て流し、
--      discount line が1件も無い既存 fixture で期待値が1つも変わらないことを確認（本 mig 単体の回帰ゲート）。

begin;

-- ① kind CHECK 拡張（drop → add・非idempotent）
alter table public.check_lines drop constraint check_lines_kind_check;
alter table public.check_lines add constraint check_lines_kind_check
  check (kind = any (array['set','time','charge','drink','champ','bottle','custom','discount']));

-- ② check_group_due 改修（割引後小計にサービス料・案X 順序(i)・ACL は create or replace で維持）
create or replace function public.check_group_due(p_check_id uuid, p_pay_group text)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
begin
  select service_rate, round_unit, round_mode into v_rate, v_unit, v_mode
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount';
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount';
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  return public.check_round_amount(v_net + round(v_net * v_rate / 100.0), v_unit, v_mode);
end $function$;

commit;
