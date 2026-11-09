# 夜便 11/9→11/10（CC の報告・各便の締めに追記）

正本＝docs/NOX_裁定台帳.md（裁定465〜469・M-123〜M-128・起票 120〜122・教訓136）。本番の DDL／データは触らない（reset は route 経由・JST 03:00〜04:00 は避ける）。

## 0. 0198 フラグ true 便＋M-123（11/9 夕〜夜）
1. **0198 フラグ true 便＝完了。** MIG_0198_APPLIED=true・supabase/migrations/0198_cast_loans.sql 収蔵（sha16 ed90503b54b54acd）・verify:nox-0198 新設 28（live の検証 22 行＝Agoora の返りと同値・7 関数の md5・BEGIN…ROLLBACK の動作）・pin 張替え（関数 419→422・set_comp_plan 33 引数・advances 19 列・課金名簿・wipe-cover ほか）＝f0 2 連緑 AF／AG（178 段 7,453）→ push 1ad818f（18:00）・deploy 09:02Z・6 店 reset 6/6（18:03）。MIG_0198 配下の client（代行出勤直後の今日の控除・本人は「店が付けました」の表示だけ・待遇プランの同意・貸付の PIN）は有効化（M-119 は対象外）。
2. **M-123 の client が 1ad818f に入っていなかった（patch を実行していなかった＝私の見落とし）**＝19:2x に当て直し（d98cdfe・余白 f3a6424）＝M-128 と同じ f0 2 連緑 AJ／AK（178 段 7,454）→ push f3a6424（Vercel が deployment を作らず 75339a3 の docs push で deploy 10:41Z）→ reset 6/6（19:42）。撮影＝docs/tmp/shots_0198（NOIR・375／390）＝代行出勤直後の控除チェック群・/mine「今日の控除＝なし（店が付けました）の行」・貸付伝票（同意未の印・PIN なし 1,000 円＝ok／PIN 0000＝「PIN が違います（本人確認）」／PIN 1234＝2,000 円 ok）・給与の貸付台帳（同意未・返済済）・精算書（2026-10）の「貸付返済（前借り）」行。
3. **教訓136 採番**（新しい表・関数を足したら ACL／wipe の順序／LIFF の再ログインを verify に足す＝M-122 の wipe-cover が初例）・台帳に裁定465〜469・M-123〜M-128・起票 122 を収載（次＝裁定470／M-129／起票 123／教訓 137）。

- **課金名簿の 1 行**＝cast_loan_grant は本体に 'billing locked' を書かず、adv_issue（A・冒頭で課金ゲート）を呼ぶので柵はそこで効く＝A 節から外して B(x) に（cast_loan_repay だけ A19＝live の 'billing locked' 202→203）。名簿の判定ルール（suite の A＝prosrc に 'billing locked' を持つ関数・全数＝A∪B）は**変えていない**。直したのは説明文だけ（parser が行中の live の関数名を数えるため、説明に書いた billing_writable_of／adv_issue／demo_org_reset 等を語に置き換えた）＝起票 122。
- **0199 の報告**＝docs/tmp/0199_line_notify.sql **sha16 a68669f112662a19・954 行・93,584 B**（0198 適用後の live から再生成）・試走 **15/15・DB 変更 0**（★1 line_notify＝4 鍵 ok／知らない鍵・boolean 以外・object 以外＝'bad line_notify'／{} ok／manager forbidden・★2 kiosk_person_claim＝cast can_register false→forbidden・店 1→forbidden・店 2→ok・staff ok・owner forbidden）・handpaste_0199.md（事前確認＝md5 2 本・検証 9 行）。**貼っていない**（相談役の照合後の合図）。
- **0199 の変更対象＝2 関数だけ**＝本文の文は begin → set local lock_timeout → CREATE OR REPLACE FUNCTION set_store_profile（白名単に line_notify＋受理の節）→ CREATE OR REPLACE FUNCTION kiosk_person_claim（役割条件に cast ∧ can_register ∧ 店 ≥2）→ commit の 5 つだけ。表・列・view・policy・grant／revoke・comment・データの文は 0（ALTER／DROP／GRANT／REVOKE／INSERT／UPDATE なし）。署名不変＝ACL 不変（試走で set_store_profile anon/authenticated 0/1・kiosk_person_claim anon/authenticated/service_role 0/0/1・関数 422／表 120 不変）。

## 1. M-128（裁定469）
1. **完了。** キオスクのホーム＝タイル（レジ／シフト／在庫／日報）は button（PIN の後に開く）・PIN なしで見えるのは出退勤の名前一覧だけ → タイルを押す → PIN（KioskPersonEntry の dest）→ 本人セッション（kiosk_person_claim）で本店の同じページ（/register・/shift・/master/stock・/report）。簡易画面 4 本（/kiosk-register・/kiosk-shift・/kiosk-inventory・/kiosk-report）は /kiosk へ redirect（本番で 307 を確認）・包み 3 部品（kiosk-workspace／kiosk-views／kiosk-feature-page）は削除・端末アカウントの / は /kiosk・manifest のショートカット＝/kiosk。帯のナビ＝ホーム／レジ／シフト／在庫／日報（staff は権限で絞る・cast はレジだけ＝0199 未適用の間は MIG_0199 false の器）・無操作 3 分（店設定が短ければ店設定）。
2. **f0 2 連緑 AJ／AK（178 段 7,454）**・push f3a6424＋75339a3・deploy 10:41Z・reset 6/6（19:42）。途中の赤＝AH（包みを読む suite の残り 4 本）・AI（picker の余白）＝直してコミット。pin 張替え＝k／m5／m6k2／qr／referral／p175prep／0196／bene／benf／0194c／actions-center／0193c／advance-okuri／customers-keep／c2。
3. **撮影＝docs/tmp/shots_m128（NOIR・375／390）**＝PIN なしのホーム（タイル 4 つ＝button・名前 8 人）・PIN の画面・レジ／シフト／在庫（店長）・日報（スタッフ＝ナビに在庫なし）＝帯 2 本（上の帯＋本体）・無操作 3 分 30 秒後に /kiosk（帯なし）。**気づき**＝ロックのお知らせ（/api/kiosk/lock-notice）は呼び手が 0 になった（人を選んで PIN の入口が無くなり、PIN だけの解除は誰のロックか分からない）＝route は残した・要否は相談役。

## 2. M-127（裁定468）
1. **完了。** キオスクのタブは店の設定に従う＝kioskHomeTilesOf（出退勤＝打刻方法「打刻端末」ON かつ打刻する店だけ・レジ／シフト／在庫／日報＝kiosk_features＝本店と同じ鍵）を /api/kiosk/punch-methods が返す・タブ 0 個＝「この端末で使える機能は店の設定で OFF です」＋PIN の入口だけ・打刻端末 OFF の端末は出退勤の名前一覧を出さず案内 1 行。/mine＝打刻カードは残し（今日のシフト・最終打刻・勤怠一覧・「店が付けました」）、出勤／退勤のボタンだけ「本人のスマホ」ON かつ打刻する店のときに出す。読取の 1 行＝タイルは kiosk_features だけを読んでいた（打刻方法は見ていなかった）・機能の公開（feature_flags）にタイル用の鍵は無い。
2. **f0 2 連緑 AM／AN（178 段 7,457）**・push 9edc2e3・deploy 12:08Z。撮ってみて「打刻端末 OFF でもキャストの名前一覧が出る」不具合（castPunchOff だけを見ていた）を見つけ、M-126 の便で直して push（c804726）。途中の赤＝AL（verify:nox-0198 3-1＝撮影でデモに貸付 2 件を発行したため ack none が 6/8）＝「none ≤ 全数」に直した。
3. **撮影＝docs/tmp/shots_m127（ACE・375／390）**＝打刻設定の API 応答だけを差し替えて撮影（デモの店の設定は変えていない）＝①打刻端末 OFF＝タイル 4 つ・名前 0・案内 1 行 ②タブ 0 個＝案内＋PIN の入口だけ。**/mine（本人打刻 OFF の店）は撮れていない**＝デモの「オーナー」は管理者で店舗設定の打刻方法の節が出ない・デモ 6 店はすべて打刻方法の既定（全 ON）＝本番データを変えずに OFF の店を作れない（判断は v61_draft §0-2 止まった点 2）。

## 3. M-126（裁定467）
1. **読取（先に）＝docs/tmp/m126_scan.md**＝DB（live の関数 422 本）の raise のコード **564 種**・client のどこかに写像あり **279 種**・無し **285 種**（多くは bad xxx の入力検査）・画面ごとの和文化関数（*ErrJa）**46 本**・和文化を通さず error.message を出す行 **42 行**。
2. **完了。** lib/nox/errors（ERR_DICT＝共通語・errJa＝日本語はそのまま／辞書／不明は「処理できませんでした（bad xxx）」・requiredNoteOf）・rpcErrJa（43 画面が使う）と compErrJa／issueErrJa／plan-switch／check-customers の「不明」を辞書へ・生の error.message 41 行を errJa で包む（console の 1 行は除く）・控除の名称が空なら登録を押せない＋欄の下に「名称を入力してください」。DB のコード・コードの pin は不変（文言の pin＝messages／advance-okuri／cast-guarantee の 3 本だけ張替え）。f0 2 連緑 AP／AQ（178 段 7,460）・push c804726・deploy 13:18Z・reset 6/6（22:19）。途中の赤＝AO（cast-guarantee の不明コードの文言）。
3. **撮影＝docs/tmp/shots_m126（375／390）**＝①控除の名称が空（LUNA の店長・登録が押せない・欄の下に 1 行）②PIN 不一致（キオスク・「PIN が違います」）③権限なし（オーナーは PIN の候補に出ない＝キオスクでは撮れない→キャストがレジの許可の無い店で /register を開く＝/mine に「この店ではキャストのレジ操作は使いません」）。

## 4. メールテンプレ（4 本の文面差し替え）
1. **止めた（文面の正本が repo に無い）。** 指示の「相談役チャットの文面（11/9 v60 チャットの最初の返答）」は CC から見えない（docs/handoff の v60_chat.md は 11/9 の断面の引き継ぎ書で、メールの文面は入っていない＝git の 55bca92 で確認）。差し替える 4 本（confirm_signup／invite／magic_link／recovery）の文面を、そのまま docs/demo/mail_templates に貼れる形で渡してもらえれば、差し込み位置（`<!-- ▼ -->` のコメントの直後）に入れるだけで済む。
2. **今の状態（読取）**＝4 本とも件名・見出し・本文・ボタンの文言・「このリンクは 1 時間有効です」（OTP 3600 秒と一致）・送信者名「NOX」（README の SMTP 設定）は入っている＝文面だけが仮。email_change は対象外（今のまま）。
3. **Supabase への設定は Agoora**（README の手順 1〜5＝Emails・Providers › Email の 3600・SMTP＝Resend・URL Configuration・/auth/forgot で 1 通）＝docs だけで止める。

## 5. launch_gate.md の更新
- 済＝11（M-116 の実機 OK でクローズ）・1（0198 本番済）・2（0198 まで true）・3（f0 2 連緑 AP／AQ（178 段 7,460））・4・12（デモの撮影＝shots_m128・手順 5 済）・17・18（0198 済＋M-123）・19（新設＝0199 起草済み）。切替の状態の 1 行＝手順 3・4・5 済／6〜9 未（手順 1・2 はゲート 7 のとおり）。

## 6. v61_draft
- docs/handoff/NOX_相談役引き継ぎ_2026-11-10_v61_draft.md＝§0（実測）・§0-2（成果 6・止まった点 4）・§1（朝の最初の仕事＝0199 の照合と合図・切替 6〜9（308 の可否）・SMTP）。
