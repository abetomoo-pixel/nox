# 0200 手貼り案内（裁定470／M-129 お知らせの「個別に選ぶ」・裁定471／M-130 スタッフ給与の支払い済み→経費の支払い記録・裁定472 スマホのレジは出勤中だけ・裁定473／M-131 キャストのレジ設定を 1 か所に＝2026-11-10 起草）

**★2026-11-10 本番適用済み**（Agoora 手貼り・相談役の照合後・事前確認 1 行・Success・検証 32 行のうち 31 行一致＋「auth_cast_can_register device branch / level no legacy」は verify の書き方の誤りで no/no＝①作り直しで person_auth_session の判定を kiosk_person_active_of に移した ②level のコメントに not like が反応＝相談役が本番の関数で中身を確認・行を直して（own_phone と kiosk_person_active_of( を見る・旧キーの検査はコメントを除いた本文＝教訓137）Agoora の再確認 yes/yes＝関数 427・表 121）→ supabase/migrations/0200_notice_targets_staff_pay.sql に収蔵（sha16 caa775c91eaa0e24・3007 行）・MIG_0200_APPLIED=true（フラグ便）。

**手貼りは相談役の合図＝ここでは貼らない。**

**★注意（相談役 11/10）**＝0200 は旧キー cast_register_enabled を消すが、staff_pin_status（PIN の状態一覧）はまだ旧キーで判定する＝**0200 の適用から 0201 の適用までの間、レジを許可したキャストが PIN の状態一覧（マスタ › システムの PIN・スタッフの PIN チップ）から外れる（表示だけ・キオスクの解錠や会計には影響しない）**。直しは 0201 ★9＝順序は 0200 → 0200 フラグ便 → 0201 を間を空けずに貼る前提。 順序＝0199（2026-11-10 適用済み・関数 422／表 120）→ 0199 のフラグ便（push cc70caa）→ **0200**。裁定474（打刻設定＝BANZEN と同じ形）は **0201 に分ける案**（判定の lib／route／地図の client が主で DDL は punches の列 10 本＋関数 2＝別便の方が 0200 の試走と検証が軽い・docs/tmp/notice_payroll_scan.md §6／§8）。

## 内容（★1〜★15・4 裁定）
- ★1 裁定470＝notices に **staff_ids uuid[]**（宛先のスタッフ＝memberships.id）・audience の check に **'targets'**・RLS notices_select の作り直し（cast＝all／cast は cast_ids が null か本人・targets は本人を含むときだけ／staff＝all／cast／staff と targets の本人／manager＝owners 以外／owner＝全部）。
- ★2 notice_create_targets＝**6 引数**（p_title, p_body, p_cast_ids, p_staff_ids, p_pinned, p_until・旧 4 引数は drop＝シフト画面の呼び方は既定値で通る）＝audience 'targets'・合計 1〜200 人・スタッフは自店の有効な manager／staff。★3 notice_mark_read＝宛先の検査。★4 notice_update＝個別の行は宛先を変えない（'targets' のまま・区分の行を 'targets' にはしない）。
- ★5 裁定471＝新表 **staff_labor_payments**（店×月 1 行＝paid_on／method cash|transfer／amount＝確定額の合計のスナップショット／headcount／note／idem_key／paid_by・RLS SELECT＝owner／自店の manager・staff・grant SELECT のみ）。★6 **staff_labor_mark_paid**（店長以上・確定が前提・冪等・audit）／**staff_labor_unmark_paid**（店長以上・削除＝経費の行も消える・audit）。★7 staff_attendance_confirm＝支払い済みの月は解除も再確定も 'paid period'。★8 demo_org_reset＝c_wipe／c_load に staff_labor_payments／staff_labor_confirmed（prewipe から外す）。
- ★9 裁定472＝assert_on_duty の **duty_gate=false の例外を廃止**（cast／staff は常に on_duty_of＝打刻する店は最終打刻 in・打刻しない店は確定シフトの窓か今日だけ許可・店長以上は免除のまま）。★10 receipt_issue／bottle_keep_register にも assert_on_duty。★12 **auth_register_access()**（authenticated＝{allowed, reason, role}＝client の /mine ナビと /register の入場が同じ真実を読む）。
- ★16 **kiosk_person_active_of(p_membership_id)**（内部専用＝4 ロール revoke）＝本人セッション中の判定を 1 本に（相談役 11/10 の作り直し）＝kiosk_sessions.person_auth_session ∧ ended_at null ∧ **last_seen_at が店の kiosk_person_idle_minutes（既定 10・1〜120）以内**＝auth_cast_can_register と auth_register_access の 2 か所から呼ぶ。★17 **kiosk_person_touch(p_session_id, p_auth_user, p_device_fp)**（**EXECUTE は service_role だけ（anon/authenticated/service_role＝0/0/1）**＝本人セッションの画面の heartbeat＝route /api/kiosk/person-touch が本人の auth・cookie の session_id・端末の束縛 device_fp（kiosk_devices.device_fp と照合＝claim と同じ型）で、操作がある間だけ 1 分ごとに呼ぶ・無操作／端末へ戻る／ロックは kiosk_person_end（route）が ended_at を立てる・端末の fp 不一致／他人の auth／終了済みは false・audit なし）。読取＝本人セッション中は last_seen_at が更新されない（更新は claim の 1 回だけ・auth_kiosk_operator の更新は端末アカウント側）→ 担保＝①heartbeat（★17）②無操作の終了は今のとおり kiosk_person_end が ended_at を立てる（client の guard が route を呼ぶ）。
- ★11 裁定473＝set_store_profile の白名単に **cast_register_scope**（'all'＝既定／'own'）・sys_cast_register を書くとき旧キー cast_register_enabled を書かずに消す。★13 auth_cast_register_level／auth_cast_can_register＝旧キー互換を外す＋**操作端末（store_device）ならキオスクの本人セッション中（★16）だけ true**（M-131＝RPC 25 本と RLS に一度に効く）・**set_store_cast_register は drop**・既存の店の旧キーを消す（UPDATE 2 文＝2026-11-10 の本番は旧キー 2 店＝どちらも sys あり＝値は不変・sys 無しで旧キー true＝0 店）。★14 **auth_cast_check_allowed(p_check_id)**（会計できる卓＝'own' なら自分の指名行がある卓だけ・開卓は不可）を check_add_line／pay／close／extension_add／shimei_add／dohan_add／time_charge_apply／open の cast 枝に・check_close に段階 2 の検査。★15 RLS checks／check_lines／check_nominations の cast 枝に同じ柵。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0200_notice_targets_staff_pay.sql（LF）→ 手貼り後に supabase/migrations/0200_notice_targets_staff_pay.sql へ収蔵 |
| sha256 | 先頭 16 桁 **caa775c91eaa0e24**（3007 行）＝0199 適用後の live から生成（旧 3c775a37cfacb17f／0f1e5aadbefb589b＝仮置き 8 の作り直し前・touch の端末束縛前＝破棄） |
| 翻訳元 | live pg_get_functiondef（scratchpad/live0200＝notice_create_targets／notice_mark_read／notice_update／staff_attendance_confirm／demo_org_reset／assert_on_duty／receipt_issue／bottle_keep_register／set_store_profile／check_* 8 本）＋生成器 docs/tmp/gen_0200.cjs（★1〜★8）| gen_0200_b.cjs（★9〜★17）＝アンカー置換・手打ちは新設の表 1・関数 6・policy 4 |
| 試走 | docs/tmp/try_0200.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数と表数を tx の外で前後に）＝2026-11-10 **72/72・DB 変更 0**（★1〜★4 お知らせ 17 段・★5〜★7 支払い済み 16 段・★9〜★17 レジの柵と本人セッション 36 段＝①セッション中→スマホからも可 ②touch が止まり無操作 10 分（店設定 3 分）超→不可 ③ended_at（端末へ戻る／ロック）→不可・heartbeat で戻る・端末の fp が合わなければ touch 不可・他人の auth では不可・**authenticated（本人のスマホ）からは permission denied**） |
| 関数数・表数 | 422／120 → **427／121**（新設 6＝staff_labor_mark_paid／staff_labor_unmark_paid／auth_register_access／auth_cast_check_allowed／kiosk_person_active_of／kiosk_person_touch・drop 1＝set_store_cast_register・作り直し 18） |

## 仮置き 11 点＝相談役の裁定（2026-11-10）＝1〜7・9〜11 承認・8 作り直し（済）
1. ★1 個別の行の audience 値＝'targets'（既存の 'cast'＋cast_ids の行＝従来どおり・新規は 4 引数の呼び方でも 'targets'）＝承認。
2. ★1 staff_ids の実体＝memberships.id（役 manager／staff・自店・有効）＝承認。
3. ★5 支払い済みは店×月 1 行・額＝確定額の合計のスナップショット・社保の事業主負担は含めない＝承認（人ごとの支払い＝起票 124＝ローンチ後）。
4. ★7 支払い済みの月は確定の解除も再確定も拒否（'paid period'）＝承認。
5. 経費一覧は client で合成・利益には含めない＝承認。
6. ★6 支払い済みの取消は manager 以上＝承認。
7. ★9 duty_gate キー＝白名単に残し判定と UI からは外す・読取の RLS に出勤中は足さない＝承認。
8. ★13→**★16 作り直し（済）**＝本人セッション中の判定＝共通関数 kiosk_person_active_of 1 本（ended_at null ∧ last_seen_at が店の kiosk_person_idle_minutes 以内・started_at の窓は使わない）＋★17 heartbeat（kiosk_person_touch・service_role・route）。
9. ★13 kiosk_login／kiosk_operator_list の OR 旧キーは触らない＝承認。
10. ★14 'own'＝本人の指名行が着卓中か free 以外・開卓は不可＝承認（残りの check_* の RPC 側の柵＝起票 125＝ローンチ後）。
11. ★14 check_close に段階 2 の検査＝承認。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK（md5 は 2026-11-10 の本番＝0199 適用後の値）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || p.proname, left(md5(replace(p.prosrc, chr(13), '')), 8)
  from pg_proc p join (values ('notice_create_targets','9f407a40'),('notice_mark_read','b1329e24'),('notice_update','cf709e3e'),('staff_attendance_confirm','3fea3e3f'),('demo_org_reset','a3f58a25'),('assert_on_duty','09ca6016'),('receipt_issue','c564a8d7'),('bottle_keep_register','32270812'),('set_store_profile','287f6800'),('auth_cast_register_level','d5df4c21'),('auth_cast_can_register','d7eb1131'),('check_add_line','c22a417e'),('check_pay','7fbbcf6a'),('check_close','982ce1ca'),('check_extension_add','2aebf22c'),('check_shimei_add','a0034ff6'),('check_dohan_add','b72e0577'),('check_time_charge_apply','c31261e8'),('check_open','7a8eef42')) x(n, m) on x.n = p.proname
 where p.pronamespace='public'::regnamespace and left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already applied', 'yes' from pg_proc where pronamespace='public'::regnamespace and proname='staff_labor_mark_paid';
```

## 本文
docs/tmp/0200_notice_targets_staff_pay.sql の全文（begin〜commit を 1 回 Run）。URL の ref＝hiqbfagmkrdpmlqhkmsu を目視してから。

## 検証クエリ（貼った後）＝docs/tmp/0200_verify.sql（**31 行**＝貼り先証明＋30・期待値は各行の見出しに。★2026-11-10 フラグ便で数え直し＝起草時の「32 行」は数え違い・ファイルの行は不変）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 427 |
| table count | 121 |
| notices.staff_ids／audience check has targets／notices_select uses … | 1／yes／yes |
| notice_create_targets 6 args / 4 args・anon/authenticated | 1/0・0/1 |
| notice_mark_read targets guard／notice_update targets fixed | yes／yes |
| staff_labor_payments rls/grants・anon grants | true/SELECT・0 |
| mark/unmark paid anon/authenticated exec | 0/2 |
| staff_attendance_confirm paid period guard | yes |
| demo_org_reset wipe+load has staff_labor_payments・acl | 2・0/0/1 |
| no payments yet | 0 |
| assert_on_duty no duty_gate exception | yes |
| receipt_issue/bottle_keep_register call assert_on_duty | 2 |
| auth_register_access anon/authenticated exec | 0/1 |
| set_store_profile whitelist has cast_register_scope | yes |
| auth_cast_can_register device branch / level no legacy | yes/yes |
| set_store_cast_register gone・stores with legacy key | 0・0 |
| auth_cast_check_allowed anon/authenticated exec | 0/1 |
| check_* with auth_cast_check_allowed | 8 |
| check_close level guard | yes |
| select policies with auth_cast_check_allowed | 3 |
| kiosk_person_active_of anon/authenticated/service_role exec | 0/0/0（内部専用） |
| callers of kiosk_person_active_of | 2（auth_cast_can_register／auth_register_access） |
| kiosk_person_touch anon/authenticated/service_role exec | 0/0/1 |

## 手貼り後（CC＝0200 のフラグ便）
- MIG_0200_APPLIED=true・収蔵・verify:nox-0200（32 行・md5・BEGIN…ROLLBACK＝try の 70 段）・client＝本人セッションの guard から 1 分ごとに /api/kiosk/person-touch（heartbeat）・pin（0158／p172 の set_store_profile md5・0190 の「duty_gate=false＝cast も通る」を反転・0196 の kiosk_person_claim は不変・store-systems の白名単 80→81・grants／billing 名簿＝A（staff_labor_mark_paid／unmark・notice_create_targets 6 引数）・B(x)＝auth_register_access／auth_cast_check_allowed・wipe-cover＝prewipe から staff_labor_confirmed を外す・demo-reset の c_load 82→84）・client（MIG_0200 配下）＝M-129（個別選択）・M-130（支払い済み）・裁定472（/mine ナビ・入場）・M-131（設定の 1 画面・castOwnSessionRegisterOf）・gen-demo（個別送信 1 件・支払い済み 1 か月）・f0 2 連 → push → 6 店 reset → 撮影。
