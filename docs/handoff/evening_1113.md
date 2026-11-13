# 夕方の報告（2026-11-13 午後〜夕・CC）

> 相談役の指示（11/13 午後の 1 通【0】〜【12】・作り直し 4 の 1〜8・外出中の進める順 1〜8・Agoora が戻った後の指示）への報告。本番の DDL とデータに CC は触っていない（試走は BEGIN…ROLLBACK・読取は begin read only・デモ 6 店の書き込みと reset だけ）。番号は台帳の「次の番号」を正（**次の裁定＝500・M-195・起票135・教訓151**）。

## ① お金・権限・プライバシーの発見
1. **初期設定のカードの手数料で 2.5% と見せて 3% を保存**（B 相当・お客様に 0.5% 多く請求）：欄は step 0.5（app/(manage)/setup/setup-wizard.tsx:617）・保存は Math.round で整数（lib/nox/setup/v5.ts:280・319）・確認画面は丸める前の値（setup-wizard.tsx:658）。DB の列と検査は整数だけ・本番に小数の店 0（docs/tmp/read_settings_1113.log）。→ 通しの確かめ 2 回目の B として直す（§6）。
2. **初期設定は送りの方式に関係なく送りの基本額 1000 円を書く**（v5.ts:272・113）＝定額（区分 3 段を聞く）の店にも聞いていない 1000 が入り、本人の退勤と店の端末の送りの記録額になる（transport_issue_self・kiosk_transport_issue は区分を見ない＝M/0177:208-209・M/0192:769-770）。→ ⑤（直し方は判断）。
3. **プライバシーポリシーの約束と実装の食い違い 2 つ**（公開の前に）：監査ログの 7 年の消去は関数だけで定期実行が無い（M/0155:492-515）／デモの入場の記録は「毎日消去」と書いたが、毎日の cron が消すのは 30 日より前の行だけ（M/0163:61,70,100）。IP は塩なし sha256 の先頭 16 桁＝「復元できない形」は弱い。→ ⑤。
4. **0201g の試走の間、本番の店の端末の読取が待たされた**（教訓150）：本文の alter table kiosk_devices が試走の tx の間、表全体に錠（12:17〜12:22 の 5 回・各 0.2〜24 秒／10:46 の 4.9 秒も同じ）。
5. 店の端末で本人がログインしたときの無操作は、店が 10 分にしても 3 分で戻る（app/(manage)/layout.tsx:222 の Math.min(3, 店の値)）／端末の解除の有効時間は DB 900 秒・lib 180 秒（lib は使われていない）。全店とも未設定。
6. 0201g の穴 2 つ（相談役の照合）＝作り直し 4 で閉じ、本番に入った（起票134 を閉じた）。

## ② 手順の誤り
1. **0201g の試走の作りの誤り（9 件→直した）**：作り直し 4 の段の最後にスタッフの PIN の行を消したまま後ろの段に入った／同時の段で「別の人」「別の端末」に同じ tx がすでに錠を持つものを選んだ／端末の行の錠を 2 本目の接続から見ようとした（表全体の錠で見られない）。関数の誤りではない。127/127 まで直した。
2. **検証 SQL の書き出しの誤り**：生成の途中で `\n` が本物の改行になり、正規表現の `\` が落ちた＝1 回目の試走で検証の行が壊れて止まった（tx 0.2 秒・ROLLBACK）。直して 16 行。
3. **通しの試走で、期待値の突き合わせの正規表現が爆発して node が 170 秒止まった**（DB 側ではない）。打ち切りの後、本番に残った接続 0・錠 0 を確かめた。
4. 0201f の試走の作りの誤り 3 件（体入の段で在籍の印を変えずに退店日を入れた・日付の 1 日ずれ・同じ時刻の監査の並び）＝直して 102/102。
5. **0201g のフラグ便の f0 が 3 回止まった（どれも verify の固定値・0201g の狙いどおりの変化）**：①試験の PIN が推測されやすい番号（1234・5678・4321・12345・98765）で set_*_pin が拒んだ＝anon-guard 段35 ほか ②見落とした 4444（ext-menu・pricing-apply）③課金ゲートの正本に新しい内部専用の 2 本（pin_guessable・pin_taken_in_store）が無かった（billing 段47-1）。**PIN を張り替えた 9 本＝anon-guard・categories・inventory・0158・daily-pay・punch-sequence・0191・ext-menu・pricing-apply**（値の決め方＝lib/nox/demo/pin.ts の guessablePinOf で推測されやすい PIN に当たらないことを機械で判定し、同じ店で人ごとに重ならないよう suite ごとに違う番号・同じ人は同じ番号＝オーナー 5273。verify と seed の PIN の設定を全部走査して残り 0）。張り替えて f0 2 連緑。
6. 本番の確かめで、デモの「出勤 19:03」（今より後の時刻の打刻）に 13 時台の退勤を押して「出勤中に戻る」と見えた＝デモのデータの性質（§6・通しの確かめ 2 回目で確かめ直す）。

## ③ 貼れる mig（貼る順）
| 順 | mig | sha256 | 行 | 事前確認の返り | 検証 | 試走 | 状態 |
|---|---|---|---|---|---|---|---|
| — | 0201g | 2d350815c91038659ab6159d3e0aaf8913fbff857df6a2225e5be9a3c62ce1b0 | 1,376 | 1 行 | 16 行 | try_0201g_r4 127/127 | **本番適用済み（11/13 夕・16 行一致）・収蔵済み・フラグ便 push 済み** |
| 1 | 0201f | 3a7e6d8272b2e0cbeb9bf108f82c97838a54e5588807e10ae41c606d9884362b | 1,197 | 1 行（proof 10・info none） | 22 行 | try_0201f 102/102・通し 31/31 | **相談役が本文を読んだ（SQL の直し無し）・合図待ち**・env 2 本は Production に入った（Redeploy 不要）・フラグ便（フラグ false）は用意（§6） |
| 2 | 0201f2 | afe761de9badaffd240b4d7fcd87a1105d995fbf34b668efbf0cc2a4d2a28d8e | 28 | 1 行（info: vault key rows 1） | 4 行 | try_0201f 段 9（4/4） | 0201f のフラグ便を本番で確かめた後 |
| 3 | 0201i | feeca3b712987c5bf7bc7c1090aa020186a85e5a3023338e503214b52fd36b27 | 380 | 1 行 | 18 行 | 通し 31/31 | 要るかは相談役 |
| 4 | 0201d | c519f42084e29b01d149d749e9c3f50cca28e2b239529016f85ec5d9ecac21eb | 522 | 1 行 | 18 行 | 通し 31/31 | 要るかは相談役 |
- 通しの試走（docs/tmp/try_chain_1113b.mjs・g→f→i→d・11/13 13:0x）＝31/31・各段の事前確認 1 行・検証は全行が期待値・ROLLBACK 後 440／121・5 秒。0201f は関数・表の数を変えない＝0201i・0201d の期待値の数字は変わらない（検証の見出しだけ数字に直した＝0201i_verify.sql・0201d_verify.sql・旧版は *_v1.sql）。
- 0201f の試走は 0201g を同じ tx で流した形（102/102）＝0201g が本番に入った後も前提は同じ（0201g の 3 本と set_store_profile の md5 は試走の版と一致）。流し直しは相談役の要否の判断で。

## ④ 相談役に添付するファイル（docs/tmp・Git に入らない）
- 0201g（本番適用済み・控え）：0201g_r3_to_r4.diff・0201g_pin_device.sql・0201g_precheck.sql・0201g_verify.sql・handpaste_0201g.md・try_0201g_r4.mjs（作り方 mk_try_0201g_r4.cjs）・ログ try_0201g_r4_1113.log・旧版 0201g_pin_device_r3_e5ea6ea8.sql。
- 0201f：0201f_v1_to_v2.diff・0201f_mynumber_key.sql・0201f_precheck.sql・0201f_verify.sql・handpaste_0201f.md・try_0201f.mjs（ログ try_0201f_1113.log）・**env_mynumber_keys.md（Agoora が Vercel に入れる環境変数の手順・鍵の値は書いていない）**・0201f_client_plan.md・旧版 0201f_mynumber_key_v1_87666b98.sql。
- 0201f2：0201f2_mynumber_vault_drop.sql・0201f2_precheck.sql・0201f2_verify.sql・handpaste_0201f2.md。
- 通しの試走：try_chain_1113b.mjs・try_chain_1113b.log。
- 0201i：0201i_notice_ack_rsvp.sql（feeca3b7…・380 行）・0201i_precheck.sql・0201i_verify.sql（18 行・見出しを数字に直した版／旧 0201i_verify_v1.sql）・handpaste_0201i.md。
- 0201d：0201d_special_open.sql（c519f420…・522 行）・0201d_precheck.sql・0201d_verify.sql（18 行・同上／旧 0201d_verify_v1.sql）・handpaste_0201d.md。
- 0201g の本番の確かめ：check_0201g_live_1113.mjs と .log（5/5）・read_demo_0201g_1113.mjs。所属の読取：read_memberships_1113.mjs と .log。
- 読取の報告：report_4_9EA_1113.md（【4】の 4 件・【9】E の 3 件・【9】A）・report_feature_defaults_1113.md（【12】）・report_line_richmenu_1113.md（【11】a〜d）・richmenu/（【11】e の絵 2 枚＋押せる範囲 areas_2500x843.json＋gen_richmenu.mjs）・proto_settings_1113/（【9】の試作＝index.html と 6 枚の絵 shot_register／punch_375／768／1440.png）・read_settings_1113.mjs と .log（本番の店ごとの設定）。

## ⑤ 判断が要るもの
相談役：
1. 0201f の合図（③・本文は相談役が読んだ）。
2. 無操作：決定が端末の解除（kiosk_idle_sec＝DB 900 秒）にも及ぶか・client だけで直すか mig も（report_4_9EA_1113.md §【4】1）。
3. /mine の遅さの直し方（cache()・段ごとの Promise.all・勤怠の表の 1 人用の経路＝report_4_9EA §【4】2）をどの便で入れるか。
4. 初期設定が定額の店に送りの基本額 1000 を書く件（① 2）：基本額を書かない（本人と端末の送りは記録されず店が締めで決める）か、区分の額を使う mig にするか。
5. 自動確定の時間：初期設定は自由な数値（36 など）・店舗設定は 4 択＝どちらかに揃える（report_4_9EA §【9】E2）。
6. 【12】初期設定で聞かないのに ON で始まるもの（report_feature_defaults_1113.md §2）・食い違い 4 つ（同 §3）。
7. 【11】リッチメニュー：登録は API（キャストだけ）か OA Manager（全員）か・LIFF の橋に行き先（?to=）の許可表を足すか・シフトの行き先（/mine/wishes 推し）。
8. 店舗設定の試作の確認（タブの並び・言葉）。
Agoora：
1. プライバシーポリシーの食い違い 2 つ（① 3）を、実装を直すか文を直すか。
2. テスター店舗の期限の持ち方（案 1 status='active'／案 2 期限を遠く＝report_4_9EA §【4】4）。
3. 略称・店舗コード・表示名はどこにも使われていない（report_4_9EA §【9】A）＝画面から外すか残すか。
4. リッチメニューの絵の文言と金の色（ロゴ #D4AF6A／画面 #d8ad55）。

## ⑥ 出した便と、本番で確かめた結果
- **28e5f8f9（client 便）**＝f0 2 連緑（f0_D1／D2_1113.log・**197 段 7,902**・golden 5931／125802）→ push → 本番で確かめ（13:2x）：/mine の勤怠の行＝「¥…/h × 6 時間 29 分」（小数の時間は出ない）・退勤を押す→0.5 秒で「反映中…」（今日のシフトとレジの理由の行）→2.8 秒で読み直し・知らせ「退勤を打刻しました」／/privacy＝404・LP・ログイン・規約に /privacy へのリンク 0 → **6 店 reset 13:30 6/6 ok**。
- **0201g のフラグ便（cb267b6f・3dd3c0a1・d910bab7・92ef596c・122342a4）**＝MIG_0201G_APPLIED=true・関数の数の pin 440→442・set_store_profile の md5・0201g の収蔵と台帳・試験の PIN の張替え 9 本・課金ゲートの正本 B(ab)＝f0 2 連緑（f0_D6／D7_1113.log・**197 段 7,902**）→ push 122342a4（14:56）→ 本番で確かめ（15:0x）：
  - 本人の PIN の変更（MUSE のスタッフ・店長・画面）＝「推測されやすい番号は使えません」／「この PIN は使えません。別の番号にしてください」（店長があやの PIN）／「PIN の変更は 1 日 5 回までです。店長に設定を頼んでください。」（使われている 1 回＋成功 4 回の後の 6 回目）＝3 つとも日本語。
  - 店の端末（MUSE）＝画面で誤った PIN を 4 回（失敗回数 4 を本番の読取で確認）→ ブラウザが開き直しになり端末が別の端末として固定され 5 回目は画面で押せず＝残りは本番 BEGIN…ROLLBACK（check_0201g_live_1113.mjs・5/5・0.5 秒・何も残さない）：5 回目で device_locked と 15 分後の locked_until／ロック中は正しい PIN でも PIN だけの入口は device_locked／名前を選んだ入口は端末のロックに関係なく入れる／時間が過ぎると戻る（失敗回数とロックが消える）／店長の打刻の許可 OFF で打刻の一覧に店長が出ない（ON は出る）。★名前を選んだ入口は、今の画面からは同じ PIN の人が複数いたときの選択からしか呼ばれない（0201g の後は複数一致を返さない＝画面から届かない）。
  - **6 店 reset 15:10 6/6 ok**（PIN の変更・端末の失敗回数と固定も戻った）。
- **0201f のフラグ便（フラグ false・push しない）**＝（下の最後の行に記録）。

## ⑦ 入らなかったものと理由
- 0201f のフラグ true の verify の張替え（rls・compliance・daily-pay・grants・anon-guard・m63・新しい 0201f の DB の段）：DB の 0201f が無いと流せない＝貼った後にフラグ true と一緒に（0201f_client_plan.md §2）。
- 通しの確かめ 2 回目：0201g の手貼りと 0201f の準備を優先（相談役の段取り）＝まだ入っていない。reset の直後に「退勤を押したあと出勤中に戻らない」ことから確かめる（相談役の指示 4）。
- 体入の式・店舗設定の実装・Yuiba の送信・無操作の時間の実装：相談役の合図まで着手しない。
- 0201g の「店長の打刻の許可」のスイッチを店舗設定に出す件（0201 のフラグ便で出さなかったもの）：店舗設定の作り直しと一緒に。

## 追記：所属の読取（相談役 0201f の準備 3）
- 1 人が有効な所属を 2 行以上持てるか＝**持てない**：部分ユニーク索引 memberships_one_active_per_user_idx（user_id where is_active＝supabase/migrations/0001_f0_auth_core.sql:89-90）。キャストも casts_one_active_per_user_idx（:109-110）。本番に両方の索引がある・**有効な所属が 2 行以上の利用者 0**・有効なキャストが 2 行以上 0（docs/tmp/read_memberships_1113.log・begin read only）。
- get_cast_mynumber_masked（0201f）が所属を 1 行だけ読む作り（order なし）でも、行は 1 行しか無い＝自店の店長が forbidden になる場合は無い。所属とキャストの両方を持つ利用者は 9 人（キャストの所属＝役割 cast の行・本人の確かめは casts で別に引く＝影響なし）。F4 のマルチ店舗で索引を外すときは、この関数も「今の店」を引く形に直す（台帳の 1 ユーザー 1 アクティブの注記と同じ）。

## 追記 2（2026-11-13 16:1x・0201f の本番適用の後）
### ■1 0201f のフラグ便
- フラグ true＋verify の張替え（rls F2d・grants G9／G10・anon-guard・compliance・daily-pay・b6・0158／0199／p172 の md5・store-systems の白名単 81→82）＝f0 2 連緑（f0_D9／D10_1113.log・**197 段 7,916**）→ **push c9ac0b3d**（16:06・夕方の報告 38693022 も一緒）→ deploy 16:08（新しい route が 404→401）→ **6 店 reset 16:09 6/6 ok**。0201f を supabase/migrations に収蔵（sha 一致）・台帳に本番適用（3383f0df・push していない）。
- 本番の確かめ（試験の会社 NOX-VERIFY-A1・架空の 12 桁・docs/tmp/check_0201f_live_1113.mts と .log・check_0201f_csv_1113.mts と .log）：
  - ① 登録が通る＝鍵が読めている（200）・DB の値は `nox1:v1:` で始まる 64 字・12 桁の数字なし・登録日 2026-11-13。
  - ② 末尾 4 桁＝オーナー・自店の店長・本人は 200（********＋末尾 4 桁）・ほかのキャストは 403。
  - ③ 全桁＝オーナーは一致・監査 read_cast_mynumber +1・店長は 403。
  - ④ 支払調書の CSV に番号が出る（A1a は税のプロファイルが無く CSV の対象外だった＝1 回目は NG→委託のプロファイルを一時的に作って確かめ・最後に消した）。
  - ⑤ 平文の 12 桁を set_cast_sensitive に直に渡す＝plaintext rejected。
  - ⑥ 廃棄の候補の RPC（オーナー）が新しい戻り値で動く（行 0）・店の年数＝7 は保存・21 は bad mynumber_retention_years。**画面（廃棄の候補の表示と店舗設定の欄）は Agoora がログインして見る**（CC は本番のログイン画面にパスワードを打たない）。
  - 後片付け＝廃棄の操作で暗号文を消した（mynumber_enc null・廃棄の日・方法 overwrite_null・監査 cast_mynumber_discard が残る）。
### ■2
- a 0201i r2＝docs/tmp/0201i_notice_ack_rsvp.sql（置き換え済み）・**sha256 f3336f3adec36ec03cef25b2cc5820fa90f1108efaff22f778b76f46b049b555・381 行**・差分 0201i_r1_to_r2.diff（本文 1 行＋見出しの注記 1 行）・notice_audience_has の md5 8d05b6c7→**3100f39a**・検証 0201i_verify.sql（18 行）・事前確認 0201i_precheck.sql（中身は同じ・期待の文だけ）・handpaste_0201i.md（r2）・前の版＝*_r1*。
- b 端末のロック＝docs/tmp/report_kiosk_lock_1113.md（名前を選ぶ入口は今の画面から届かない・案と食い違い 3 つ）。
### ■3（止まった）
- 0201i r2 の単独の試走（docs/tmp/try_0201i_r2.mjs＝1-13 forbidden・1-13b 読める・1-13c・6-10 キャストだけを張り替えた）と、0201i→0201d の通し（docs/tmp/try_chain_1113c.mjs）は**流していない**＝本番に BEGIN…ROLLBACK で接続する所で、CC の実行環境の権限の判定（本番の読取）が止めた。0201f2 の事前確認の読取も同じ理由で流していない。流すには Agoora の許可（または Agoora が流す）が要る。
### 本番への接続
- 0（DB・試走・ブラウザ・裏のエージェント）。

## 追記 3（2026-11-13 夕・Agoora の外出中の A〜D＝本番に接続しない・f0 なし・push なし）
### コミット（push していない・main は origin より 5 つ先＝3383f0df 台帳・b7fd1731 報告・53741f36 A・d470fda8 B・26f38733 C）
- **A 会計の画面＝53741f36**：残額 0 で「会計を完了」を画面の下に固定（.nox-paydone-bar＝下のナビのすぐ上・広い画面はサイドバーの右・safe-area・最後の行と重ならない 84px の余白）／緑の案内＝「入金は済んでいます。会計を完了してください。」＋同じボタン（「下の〜を押してください」は消した）／残額 0 のときは延長の表（自動・手動）・カスタム明細・割引を畳む（開けば使える・残額が戻れば今のまま）／いちばん下の今のボタンは残す。
  - ★375 の幅での重なりの目視は**していない**（dev サーバー 3200 は触らない決まり・本番には出していない）。CSS は .nox-st-bar（棚卸し）と同じ型。次の f0 のあとの push で本番で 375 を撮る。
- **B 初期設定のカードの手数料＝d470fda8**：欄を 1% 刻みの整数（小数は入らない＝「.」を打っても欄が変わらない）・確認の画面と保存で同じ値（cardFeePctOf＝lib/nox/setup/v5.ts）・Math.round の黙った丸めを外した。古い下書き（再開）に小数が残っている店は、欄には小数が出たまま・確認と保存は小数を切った整数になる（本番の店の下書きの小数は未計測＝読取は本番の接続が要る）。
- **C 店の端末のロック中に「名前を選んで入る」＝26f38733**：'device_locked' のあと PIN の画面に「名前を選んで入る」→ kiosk_staff_list（PIN を設定した人だけ）→ 名前 → 本人の PIN → kiosk_unlock に p_membership_id（DB は変えない）。
  - **実装しなかった（判断が要る）**：kiosk_staff_list は店長とスタッフだけ・店長の打刻の許可が OFF の店は店長が出ない（0201g_pin_device.sql:373-374）＝オーナー・レジに入れるキャストは名前で入れない／打刻の許可 OFF の店の店長も名前で入れない。直すには新しい読取の関数か kiosk_staff_list の引数（どちらも mig）＝相談役の判断（docs/tmp/report_kiosk_lock_1113.md）。
- 単独で流した suite（DB に接続しないものだけ・docs/tmp/presuite_ABC_1113.log）：b6 54（＋5＝c9）・b3・b4・b5・bend・gvb・m136（Fold の数 3→4・key の張替え）・m141・m144・m5・m5b・m63・m65・m6k2・ob・p175prep・payroll-view・s3・setup・su・w52a・x13g＝**全部緑**・tsc 0・lint 0。DB に接続する suite（0187・0197・0201・bene・night1110・ob2）は流していない。

### B の洗い出し＝「見せる値と保存する値が違う」型（初期設定・lib/nox/setup/v5.ts の保存の式と app/(manage)/setup/setup-wizard.tsx の確認の画面）
| 欄 | 欄の刻み | 保存の式 | 確認の画面 | 違う場合 |
|---|---|---|---|---|
| 給与の支払日 | 整数（小数も打てる） | Math.round＋1〜31 に寄せる（v5.ts:273） | `支払 ${pr.payday} 日`（そのまま） | 25.5→確認 25.5・保存 26／40→確認 40・保存 31 |
| 体入の日数 | 整数（小数も打てる） | Math.round＋1〜90（v5.ts:275） | `（${p.trialDays} 日）`（そのまま） | 7.5→確認 7.5・保存 8／120→保存 90 |
| 現金割引の率 | step 0.5（任意の小数も打てる） | 小数 1 桁に丸め＋0〜100（v5.ts:283） | 確認に出ない | 7.25→保存 7.3（欄は 7.25） |
| 送りの基本額 | 整数 | Math.round＋0〜99,999（v5.ts:274） | 確認に出ない | 小数・上限超えは黙って変わる |
| 自動確定の時間 | 自由な数値 | Math.round＋0〜168（v5.ts:276） | 確認に出ない | 店舗設定は 4 択＝36 などはどれも選ばれていない見た目（report_4_9EA §【9】E2） |
| 釣銭準備金 | 整数 | Math.round＋0〜9,999,999（v5.ts:289） | 確認に出ない | 小数は黙って丸め |
| VIP のサービス料 | 整数 | Math.round＋0〜100（v5.ts:296） | — | 小数は黙って丸め |
| 商品の値段・バック | 整数 | Math.round（v5.ts:338-339） | 品数だけ | 小数は黙って丸め |
- 案：B と同じ型（欄を integer にして小数を受けない・確認の画面は保存の式と同じ関数で出す）を、支払日・体入の日数・送りの基本額・釣銭準備金・VIP のサービス料・商品の値段とバックに当てる。現金割引は小数 1 桁を受ける欄（step 0.1）にして、保存の式と揃える。自動確定は 4 択に揃える（判断＝相談役）。

### D 体入の式の実装の前の読取（コードだけ）
- 今の cast_trial_decide（supabase/migrations/0201c_trial_product.sql:52-92）：本採用は `v_plan := coalesce(p_plan_id, 店の settings_json.default_plan_id)`（:69）→ 両方 null なら `raise 'no plan'`（:70＝set_cast_kind の前＝何も書かずに止まる）。p_plan_id が null でも既定があれば既定で本採用。既定が停止中のプランなら set_cast_plan の中で 'plan inactive'（0154:400）＝tx ごと戻る。見送りは p_plan_id を読まず cast_leave（:85）。どちらも監査を書く（:87-89）・p_from が null なら東京の今日（:67）。画面（casts-board.tsx:1112-1125）は既定のプランがあればその id を明示して渡し、無ければ選ぶまで押せない＝画面から本採用で null は渡らない（lib/nox/cast/trial-terms.ts:54-56）。
- casts に「体入の条件が終わる日」（例 trial_ends_on date・null 可・既定なし）を足す mig で作り直しが要る関数＝**cast_trial_decide だけ**（個人の上書きも手で直すなら set_cast_trial も＝署名が変わるので drop と ACL の付け直し）。demo_org_reset（0200b:81・102-107＝列の重なりだけを入れる）・cast_create_apply（0040:147＝列名つき）・`public.casts` 型の変数で読む関数・監査の to_jsonb は作り直し不要。casts を返す関数・固定の列の jsonb_populate_record は 0 件。
- 0201i（notice 系 5 本と demo_org_reset）・0201d（store_day_has_checks ほか 6 本）・0201j（org_signup_provision・set_my_contact）＝どれも cast_trial_decide・set_cast_trial・casts の列に触れない＝**順の制約は無い**（demo_org_reset を作り直すなら 0201i の後に、その版から）。demo の payload に列を足す必要は無い（null 可なら読み込みは通る）。verify-nox-b6.ts:61-68 は trialDecideArgsOf と trialCastColsOf の形を決め打ち＝引数や select の列を変えるならそこも張り替える。

### 本番への接続
- **0**（DB・試走・通しの確かめ・デモへの書き込み・ブラウザ・裏のエージェント＝この追記 3 の作業では一度も開いていない）。
