# CC セッション引き継ぎメモ（2026-10-19・便 P173 再開〜P174〜まとめ便 P／G／H）

正本は台帳（docs/NOX_裁定台帳.md）。本書は次の CC セッションが最初に読む控え。値は本書作成時点の実測。

## 0. 現在地

| 項目 | 値 |
|---|---|
| HEAD＝origin/main | 本メモのコミット（直前 87ba69f＝GV-C docs）（GV-C docs）。直前 c09b92a（GV-C live 修正）・1c4c4d8（GV-C 本体）（GV-C feat） |
| 作業ツリー | 変更 0 の前提（新セッションの最初に `git status` で照合） |
| 本番 DB（ref hiqbfagmkrdpmlqhkmsu） | 0001〜0174 適用済み。**DB 恒久変更 0**（本日の CC は SELECT のみ・migration の起草なし） |
| compute | **Small**（2026-10-19 16:30 に Agoora が切替＝16:19 の ECHECKOUTTIMEOUT／DB 不通の後） |
| f0 | 124 段・2 連緑＝1c4c4d8 前 6,115（17:59／18:11）・c09b92a 前 6,116（18:31／18:41）。1 走 7〜9 分（compute Small・デモ操作なし時）。suite 新設 verify:nox-gvc（25） |
| golden | 玲奈 5170／5931・源泉 117241／125802・payroll 233 assertions＝不変 |
| Vercel | 1c4c4d8＝18:21 到達・c09b92a＝18:52 到達（nox-kappa-eight.vercel.app・hnd1） |
| デモ 6 店 | 18:21 にローカル reset（docs/tmp/q1019_d1_reset.mts・6 店 wipe+load ok）。翌 06:05 の無人 reset は未確認（10/17〜19 の load 失敗は P173 で payload 修正済み） |

## 1. 本日のコミット（時刻は JST）

- 87ba69f 18:53 docs: 便 GV-C 現在地（live 15 点・C-0・x13 状態更新・E-22 候補）
- c09b92a 18:50 fix: GV-C live（自分の情報のシートを body へ出す＝900px 未満で画面外・pt スライド OFF の店はスライド行の pt を出さない）
- 1c4c4d8 18:19 fix: GV-C（387／352 追補1／388／370 追補1・GV-43／44／48／50／52／53／54／58／59／60／61／64／65・C-14g・X-13-2）
- 59d826f 17:07 docs: P174 収載・ゲート訂正・起票118／119・408 追補1・初期設定 v4
- a22542f 17:00 feat: 0174 client（390／394／395）＋kiosk スタッフ群＋スタッフ勤怠
- 6faa94f 15:55 docs: 待遇プランの判定期間を月次にそろえる手貼り案内（本番 CLUB NOX・起草のみ）
- 44e32bd 14:21 docs: 395 追補2（判定の単位は月／半月を主・累計は詳細設定のみ）・407 追補1（pt の付け方はポイントスライドのときだけ）
- 1eb73ff 14:20 docs: 裁定407・398〜401 案・408・393 追補3・GV-64／65
- 0e3a3e4 14:12 docs: 便 P173 現在地・事故（デモ 6 店が空）・裁定404／405・393 追補2・教訓116・E-20／21・起票115〜117
- 6896939 14:12 fix: GV-63 追補＝下段の ?tab で上段の選択が外れる・p173 の live を構造の行に限る
- b442c3e 12:46 fix: GV-63 キャスト・報酬の上段タブと下段タブの分離
- 67c481c 11:58 fix: GV-62 今日タブの出勤記録 5 択＝カード表示なら幅に関係なくチップ
- f277ee8 11:58 feat: 0173 client（385／386／389／391／392／393）＋payload
- ebcdf26 11:58 feat: 達成ボーナス多段（起票110・裁定404 max）＝thresholds を {pct, amount} に一本化
- （本メモ）docs: CC セッション引き継ぎメモ 2026-10-19

## 2. 未了・持ち越し（番号ごと）

1. **③ ひなの ¥3,500（ACE・前期方式）＝NG（データ）**: payload に 10 月の勤務日が無い（P174 live ③）。前期（9 月）実績で 10 月の時給が決まる方式なので、10 月の勤務行を payload に足すか、検証日を 11 月に置くかの判断が要る（相談役）。
2. **カード手数料の税区分（393 追補3）**: check_pay がサーバ側で手数料行を taxable_10 で作る＝税抜き店で ¥310 ずれ。**0175** の対象。
3. **R-12（GV-58 ホームの再検証）**: GV-C C-12 の useLiveReload（focus／visibility／60 秒）で client 側は対処。kiosk 打刻後にホームへ戻って数が一致するかは live の目視が残り（本書 §4）。
4. **0175 の対象（client からは書けないもの）**:
   - 裁定396 本採用の在籍区分（casts.kind）更新＝書く RPC が無い（cast_create のみ）。GV-C は本採用＝set_cast_plan（店の既定プラン）だけ。体入タブは「区分 体入 ∧ プランが体験入店／なし」で絞る（仮決め）。
   - 裁定402 再発行の対応関係（R-000001→R-000003）・日付の訂正・操作者 membership＝receipt_issue に引数も列も無い。GV-C の再発行＝receipt_issue_void（理由「再発行のため」）→receipt_issue（同じ金額）の順呼び（非原子）。
   - 裁定356 スタッフ給与の確定 RPC・裁定397 availability・裁定409 売上配分の店設定。
5. **normPenaltyModeOf の 0 円トグル**（P174 live ② の癖＝金額 0 のまま方式を切り替えると戻る）＝GV-C では未着手。
6. **kiosk のスタッフ打刻（355）**: GV-C で payload に staff_pin（MUSE／LUNA の staff／manager）を追加。実打刻は PIN 入力＝Agoora（CC は本番で PIN を入れない）。
7. **f0 の外乱**: verify:nox-customers-keep ck(0-2) は check_lines／stock_logs を **DB 全体で**数える＝f0 中にデモ店を操作すると赤（2026-10-19 17:44 CLUB NOIR で発生・再走で緑）。f0 中はデモを触らない／suite を org 限定にする（起票候補）。

## 3. 次の便（順）

SH-UI → BZ-R → 0175／0176（起草・手貼り）→ OB（初期設定 v4）→ 0177 → 目視（x13 の「反映・目視待ち」一括）

## 4. 注意

- **DB 不通（select 1 が 15 秒超）は即停止して報告**（教訓85）。compute は Small。
- **f0 は 1 走 約 25 分**（124 段）。2 連緑の間は 180 秒以上空ける。単独走（教訓115）＝pin 型・走査型は f0 の前に。
- デモ（6 店）の可変データを live 照合で assert しない（E-21）。
- 本番で PIN・パスワードを入力しない。Vault の値はログ・ファイル・報告に出さない。
- 作業ツリーの未コミット分に reset／checkout／stash をしない。

## 5. GV-C の live 結果と C-0

台帳「便 GV-C 完了」欄が正。要点＝live 15 点はすべて OK（⑮アカウントの下シートは live で NG を発見→c09b92a で修正・再確認 OK）。追加修正＝/mine 明細の「／pt 0→¥0」（pt スライド OFF の店）。C-0＝X-13-2 は c09b92a で反映・GV-49 は書込が要るため live 未確認・#15／16 は赤入れ待ち・GV-45／51／57／62 は確認済み。x13 の状態列 21 行を「済（便 GV-C）・目視待ち」に更新。

残（GV-C 由来）＝normPenaltyModeOf の 0 円トグル・デモ 6 店の default_plan_id（payload）・デモに発行済み領収書が無い（台帳の行操作は live 未確認）。
