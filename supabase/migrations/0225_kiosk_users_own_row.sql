-- 0225_kiosk_users_own_row（食い違い #343・根 R02・相談役 11/26 22:10 の段イ・起草と試走まで・適用はしない）
--   経緯：users_select_kiosk（0190:3851）は「端末のセッションで操作者が解除されている間」、会社の全員の users の行を読ませる
--     （using: org_id = auth_kiosk_org_id() and auth_kiosk_operator() is not null）。行の全列＝ログインのメール（email）・連絡用メール（contact_email）・電話（phone）まで。
--     店で絞らず、PIN を入れたのがキャストでも同じ。画面には出ないが、端末のブラウザ（supabase-js の anon キー＋端末のセッション）から直に読める。
--   端末のセッションが users を読む道は今は無い（読んで確かめた）：
--     ・/kiosk の画面は RPC（kiosk_cast_list・kiosk_staff_list・kiosk_punch_state ほか）と route（/api/kiosk/*＝service_role）だけで、users を直に読まない。
--     ・レジ・シフト・在庫・日報は裁定469（M-128）から「本人セッション」（kiosk_person_claim＝本人のログイン）で開く＝users_select（本人の役割の幅）が効く。
--       端末のセッションは店側の画面に入れない（getSessionRole が auth_role() null → /login）。
--     ・users を読む invoker の関数は 0 本（全部 SECURITY DEFINER＝RLS を通らない）。
--   中身：users_select_kiosk を「解除している操作者の本人の行だけ」に絞る（名前は変えない＝verify:nox-grants G14 の名簿 users_select,users_select_kiosk のまま）。
--     using: org_id = auth_kiosk_org_id() and id = auth_kiosk_operator()
--     ＝端末のセッションで読めるのは、PIN を入れた本人の 1 行だけ（読み違いの条件「自分の行だけが返る」と同じ形）。解除していない間は 0 行（今と同じ）。
--   変えないもの：表・列・grant（authenticated は SELECT のみ＝0003 のまま）・ほかの *_select_kiosk（店で絞る 29 本）・関数（関数 525・表 133 のまま）。
--   翻訳元：0190_duty_gate_device_bind.sql:3850-3851（drop policy if exists → create policy の同じ形）。
--   本番の今の定義との差分：docs/tmp/kiosk_users_1126/diff_live.md。
--   事前確認：docs/tmp/kiosk_users_1126/0225_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/kiosk_users_1126/0225_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ users_select_kiosk：会社の全員 → 解除している操作者の本人の行だけ ═══
drop policy if exists users_select_kiosk on public.users;
create policy users_select_kiosk on public.users for select to authenticated using (org_id = public.auth_kiosk_org_id() and id = public.auth_kiosk_operator());   -- ★0225（#343）: 本人の 1 行だけ（メール・電話を同僚・他店に出さない）

commit;
