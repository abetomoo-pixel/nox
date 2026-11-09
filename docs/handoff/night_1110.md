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
（締めで追記）

## 3. M-126（裁定467）
（締めで追記）

## 4. メールテンプレ（4 本の文面差し替え）
（締めで追記）

## 5. launch_gate.md の更新
（締めで追記）

## 6. v61_draft
（締めで追記）
