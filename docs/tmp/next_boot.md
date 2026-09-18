# 明日の起動報告用メモ（2026-09-01 終業 v2・CC 作成）

## 現在地
- HEAD = `0b32b76`・origin/main より **ahead 7（未 push・Agoora 実機ゲート）**・作業ツリー clean
  （untracked＝docs/tmp と ★新着モック `mock/pages-2026-08/nox-pos-nomination-autocharge-v1.html`＝裁定111 素材と推定・未収蔵のまま）
- migrations 末尾＝0122／0123／**0123b**（0123 と 0123b はセット適用・手貼りリスト両行に注記済み）

## 未 push コミット（7本・push は Agoora 実機 OK 後）
- `0f5f55f` feat: mig0123と0123bを収蔵する（裁定110・セット適用）
- `b7080dd` test: r2b(12) を裁定110へ（w0正例/全0負例/実締め2伝票・INVERT19全赤）
- `3107b7d` feat: 分配率に既定分配と自動補完（裁定110 A2・nom-shares 共用）
- `116e68b` docs: 台帳 裁定110＋教訓50・手貼り 0123/0123b・設計書 §2-7（★B6 の台帳分＝106実装欄/#42/#46 も同乗）
- `c9c061d` feat: 待遇画面 6タブの殻（裁定106 B1）
- `5318e11` feat: 6タブの中身（裁定106 B2/B3）
- `0b32b76` docs: live 逐語5本を docs/dp へ収蔵（v20 §7 消化）

## f0 最終値（2連続緑・2026-09-01 夜）
- **29本・総 assert 3,369**・golden 6値不変＝5931／125802／55233／64／64／53
- 台帳最終番号＝**裁定110／教訓50／起票#46**・手貼りリスト末尾＝`0123b_ratio_weight_check`

## Agoora 実機の依頼点
**A（裁定110・レジ/kiosk 分配率）**
1. 3 cast（本・場内・フリー）を名簿へ→**既定 100/0/0**（本が 100）
2. 場内を 30 に→**本が 70 に自動**（フリー 0 のまま・合計常に 100）
3. 種別を変えると既定分配に戻る／0% 行に「按分なし」バッジ
4. w=0 のまま保存→締め→給与プレビューで 0% キャストに金額が付かない（本数は種別どおり）
**B（裁定106・/master/cast-comp/plan）**
1. 6タブが開く・固定ヘッダのプラン select/状態バッジ/適用中
2. 各タブで保存→開き直して反映・**タブ移動で未保存が消えない**（右パネル「保存状態」）
3. 割当タブの進捗列（当月売上/目標）・自由バックの計算方法3種・最低月額保証「使う」トグル
（過去分の追認: 0121 レジ4点・104/105 待遇・108 シフト2段・109 /casts 編集）

## D 調査要約（裁定111＝種別・課金・自動保存の設計材料）
- **check_extension_add は指名料/同伴料を再計上しない**（prosrc に言及ゼロ）・stores に「延長時再計上」設定列なし（settings_json keys＝biz_cutoff_hm/cast_register_enabled/okuri_mode のみ）→ 再計上を入れるなら**新設定＋RPC 改修＝器から**
- register-board: 種別トグル/同伴チェックは**ローカル state のみ**（保存＝「分配を保存」or 課金ボタン押下時の全置換）。裁定110 で種別変更→既定分配リセットが入った点に注意（自動保存化すると変更のたび RPC が飛ぶ）
- 課金行の取消＝**check_remove_line 1本**（owner/manager 自店/staff can_register/cast can_register/kiosk 腕・入金後は不可）。行削除→名簿追随は UI 側 dropNomAfterShimeiRemoval
- kiosk: 種別 select・同伴・重みは**あり**／**指名料・同伴料ボタンはなし**（check_shimei_add/check_dohan_add 呼びゼロ）・detail に fee_kind/cast_id なし（起票#45）
- **変更が要る面（裁定111 実装時）**: check_set_nominations（自動保存の頻度設計）・register-board（種別＝課金の結線＝addShimeiUnified の逆向き）・kiosk（課金ボタン新設なら #45 の detail 拡張が前提）・check_extension_add（再計上オプション）・stores 設定列（新 mig）
- ★新着モック `nox-pos-nomination-autocharge-v1.html`（Downloads→mock/ に手動配置済み・未収蔵）＝裁定111 の正本候補・README/sha 台帳未登録

## 再開手順
1. 新着モックの収蔵可否を確認（裁定111 の設計と対）→ B/D の続き or 裁定111 レーン
2. push は Agoora 実機 OK 後（上の依頼点）
