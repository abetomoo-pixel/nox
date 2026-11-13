-- 0201e3_policy_initplan.sql（2026-11-12 夜・CC 起草・貼らない＝合図は相談役）
-- 翻訳元: 本番の pg_policies（0201e2 適用後・docs/tmp/gen_0201e3.mjs が begin read only で読んだもの）
-- 事象: 0201e の後、キャストとキオスクの端末の伝票系の読取が遅い（本番の読取＝キャストの check_lines 0 行で 3.4 秒・0201e の前の形で 0.46 秒）。
--       ポリシーの auth_* が行ごとに評価される（STABLE でも行ごと）。(select f()) で包むと 1 回だけ（initPlan）＝同じ条件で 10 ms 前後（docs/tmp/q_policy_timing.mjs）。
-- 直し: 伝票系 6 表の SELECT ポリシーの auth_* の呼び出しを (select public.f()) で包む。式の意味・ロール・コマンドは不変（alter policy の using だけ）。関数の数は変えない。
-- 対象: 12 本
--   bottle_keeps.bottle_keeps_select（今の qual md5 69151743）
--   bottle_keeps.bottle_keeps_select_kiosk（今の qual md5 3fbc8505）
--   check_lines.check_lines_select（今の qual md5 9734758d）
--   check_lines.check_lines_select_kiosk（今の qual md5 3fbc8505）
--   check_nominations.check_nominations_select（今の qual md5 9734758d）
--   check_nominations.check_nominations_select_kiosk（今の qual md5 3fbc8505）
--   check_seats.check_seats_select（今の qual md5 69151743）
--   check_seats.check_seats_select_kiosk（今の qual md5 3fbc8505）
--   checks.checks_select（今の qual md5 aa12ceeb）
--   checks.checks_select_kiosk（今の qual md5 3fbc8505）
--   payments.payments_select（今の qual md5 69151743）
--   payments.payments_select_kiosk（今の qual md5 3fbc8505）
-- 検証クエリ: docs/tmp/0201e3_verify.sql（先頭に貼り先証明・1 回で全行）
-- ★教訓（2026-11-12）: 手貼りの間は、CC は本番の同じ表・関数に触る試走を流さない。
begin;
set local lock_timeout = '10s';

-- bottle_keeps.bottle_keeps_select（翻訳元の qual md5 69151743）
alter policy bottle_keeps_select on public.bottle_keeps
  using (((org_id = (select public.auth_org_id())) AND (((select public.auth_role()) = 'owner'::text) OR (store_id = (select public.auth_store_id()))) AND (((select public.auth_role()) = ANY (ARRAY['owner'::text, 'manager'::text])) OR (((select public.auth_role()) = 'staff'::text) AND (select public.auth_staff_can_register())) OR (((select public.auth_role()) = 'cast'::text) AND (select public.auth_cast_register_active())))));

-- bottle_keeps.bottle_keeps_select_kiosk（翻訳元の qual md5 3fbc8505）
alter policy bottle_keeps_select_kiosk on public.bottle_keeps
  using (((store_id = (select public.auth_kiosk_register_store_id())) AND ((select public.auth_kiosk_operator()) IS NOT NULL)));

-- check_lines.check_lines_select（翻訳元の qual md5 9734758d）
alter policy check_lines_select on public.check_lines
  using (((org_id = (select public.auth_org_id())) AND (((select public.auth_role()) = 'owner'::text) OR (store_id = (select public.auth_store_id()))) AND (((select public.auth_role()) = ANY (ARRAY['owner'::text, 'manager'::text])) OR (((select public.auth_role()) = 'staff'::text) AND (select public.auth_staff_can_register())) OR (((select public.auth_role()) = 'cast'::text) AND (select public.auth_cast_register_active()) AND auth_cast_check_allowed(check_id)))));

-- check_lines.check_lines_select_kiosk（翻訳元の qual md5 3fbc8505）
alter policy check_lines_select_kiosk on public.check_lines
  using (((store_id = (select public.auth_kiosk_register_store_id())) AND ((select public.auth_kiosk_operator()) IS NOT NULL)));

-- check_nominations.check_nominations_select（翻訳元の qual md5 9734758d）
alter policy check_nominations_select on public.check_nominations
  using (((org_id = (select public.auth_org_id())) AND (((select public.auth_role()) = 'owner'::text) OR (store_id = (select public.auth_store_id()))) AND (((select public.auth_role()) = ANY (ARRAY['owner'::text, 'manager'::text])) OR (((select public.auth_role()) = 'staff'::text) AND (select public.auth_staff_can_register())) OR (((select public.auth_role()) = 'cast'::text) AND (select public.auth_cast_register_active()) AND auth_cast_check_allowed(check_id)))));

-- check_nominations.check_nominations_select_kiosk（翻訳元の qual md5 3fbc8505）
alter policy check_nominations_select_kiosk on public.check_nominations
  using (((store_id = (select public.auth_kiosk_register_store_id())) AND ((select public.auth_kiosk_operator()) IS NOT NULL)));

-- check_seats.check_seats_select（翻訳元の qual md5 69151743）
alter policy check_seats_select on public.check_seats
  using (((org_id = (select public.auth_org_id())) AND (((select public.auth_role()) = 'owner'::text) OR (store_id = (select public.auth_store_id()))) AND (((select public.auth_role()) = ANY (ARRAY['owner'::text, 'manager'::text])) OR (((select public.auth_role()) = 'staff'::text) AND (select public.auth_staff_can_register())) OR (((select public.auth_role()) = 'cast'::text) AND (select public.auth_cast_register_active())))));

-- check_seats.check_seats_select_kiosk（翻訳元の qual md5 3fbc8505）
alter policy check_seats_select_kiosk on public.check_seats
  using (((store_id = (select public.auth_kiosk_register_store_id())) AND ((select public.auth_kiosk_operator()) IS NOT NULL)));

-- checks.checks_select（翻訳元の qual md5 aa12ceeb）
alter policy checks_select on public.checks
  using (((org_id = (select public.auth_org_id())) AND (((select public.auth_role()) = 'owner'::text) OR (store_id = (select public.auth_store_id()))) AND (((select public.auth_role()) = ANY (ARRAY['owner'::text, 'manager'::text])) OR (((select public.auth_role()) = 'staff'::text) AND (select public.auth_staff_can_register())) OR (((select public.auth_role()) = 'cast'::text) AND (select public.auth_cast_register_active()) AND auth_cast_check_allowed(id)))));

-- checks.checks_select_kiosk（翻訳元の qual md5 3fbc8505）
alter policy checks_select_kiosk on public.checks
  using (((store_id = (select public.auth_kiosk_register_store_id())) AND ((select public.auth_kiosk_operator()) IS NOT NULL)));

-- payments.payments_select（翻訳元の qual md5 69151743）
alter policy payments_select on public.payments
  using (((org_id = (select public.auth_org_id())) AND (((select public.auth_role()) = 'owner'::text) OR (store_id = (select public.auth_store_id()))) AND (((select public.auth_role()) = ANY (ARRAY['owner'::text, 'manager'::text])) OR (((select public.auth_role()) = 'staff'::text) AND (select public.auth_staff_can_register())) OR (((select public.auth_role()) = 'cast'::text) AND (select public.auth_cast_register_active())))));

-- payments.payments_select_kiosk（翻訳元の qual md5 3fbc8505）
alter policy payments_select_kiosk on public.payments
  using (((store_id = (select public.auth_kiosk_register_store_id())) AND ((select public.auth_kiosk_operator()) IS NOT NULL)));

commit;
