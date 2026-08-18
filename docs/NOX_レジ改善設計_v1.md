# NOX レジ改善設計 v1（2026-08-18 起草）

要件5件（Agoora 実機所感 08-17）。正本=本書＋repo/live。

## ① 明細のセット/延長 行分離
- time_auto 合算1行を廃し **set 行＋extension 行の2行**へ:
  - set 行: kind='time'・fee_kind='set'・time_auto=true・name「セット料金(N分)」・
    unit_price=set_fee・qty=units（time_per=person は人数・table は1）
  - extension 行: fee_kind='extension'・unit_price=ext_fee・qty=blocks×units・
    name「延長料金(N分)」。blocks=0 なら行を立てない（qty>0 CHECK 整合）
- 部分ユニーク再定義: check_lines_one_time_auto を drop →
  **UNIQUE(check_id, fee_kind) WHERE time_auto** で2本を構造保証
- check_time_charge_apply 改稿: ★冒頭で legacy 行（time_auto ∧ fee_kind is null）を
  delete してから2行 upsert（既存 open 伝票の移行を apply 自身が吸収・closed は不触）
- recalc/group_due は行数非依存＝互換（プリフライト A4 確認済み）。レシートは素通し
  印字で自動的に2行出る＝要件「明細にセットが見える」を印字まで一気に充足

## ② manual 店の延長導線
- **check_open が set 行を自動で1行立てる（両モード共通）**: 開卓時点で明細に
  「セット料金」が見える＝分かりづらさの根治。auto 店は以後 apply が再計算 upsert・
  manual 店はこの行が固定
- 新 RPC **check_extension_add(p_check_id)**: 凍結値で延長1回分の行を追加
  （kind='time'・fee_kind='extension'・time_auto=false・unit=ext_fee・qty=units・
  1押し=1行＝客確認の記録が行数で残る・取消は既存 remove_line）。
  ガード=check_add_line 5腕逐語＋open＋payments 0＋billing gate（規則A形）。
  auto 店では UI 非表示（二重計上防止・RPC 側でも time_mode='auto' なら拒否）
- UI: manual 店のみ「延長を追加（¥N/30分）」ボタン＝時間ステータスと並置

## ③ 時間ステータス完全化
- manage 卓一覧: 常時カウントダウン「あとN分で延長」（セット内）→「延長N回目・
  次まであとN分」（超過・--bad 色）。両モード共通表示（凍結値は manual 店も保持済み）
- kiosk: 0059 読取2本へ加算的キー追加（set_min/ext_min/time_per/people）→
  kiosk 卓一覧・伝票にも同表示
- 表示計算は check-calc 純関数（既設）を共用・権威はサーバのまま

## ④ 入金モーダル（BANZEN 型移植・app のみ）
- 写経元 ../makanai-shift/app/(app)/register/register-table.tsx:360-483
- 残額大表示・支払方法4ボタン=**NOX 4値（現金/カード/売掛/その他＋detail 入力）**・
  均等割り2〜6（ceil(残額÷N) セット・Σ≥total 保証の案イ）・入金額既定=残額・
  お預かりプリセット（ちょうど/3,000/5,000/10,000）・お釣り表示・不足ガード
- pay_group 選択はモーダル外の現行位置を維持（モーダルは選択中 group の残額を扱う）
- check_pay 既存引数で完結（tendered=cash のみ・idem_key リプレイ既設）

## ⑤ キャスト選択パネル（app のみ）
- 共通部品 CastPicker 新設: 検索（源氏名部分一致）＋写真グリッド（CastAvatar 大判）＋
  並び=**着卓中→本日出勤（punches 由来）→その他**・出勤/着卓バッジ
- 置換4箇所: 指名料追加 select・按分チップ（manage/kiosk）・claimPick select

## 実装レーン構成
- **mig0089**（相談役起草・非冪等=index 再定義）: ①ユニーク再定義＋
  check_time_charge_apply 改稿＋check_open 改稿（set 行）＋②check_extension_add 新設＋
  ③0059 読取2本の列追加 → CC 照合1往復 → 手貼り → 段48
- **R-A（Fable 5）**: ①②③の app（apply 結線・延長ボタン・ステータス表示・kiosk）＋段48
  （行分離の金額一致=旧合算と総額同値・legacy 移行・manual 延長・拒否系・
  pricing-apply 段44 の張り替え・verify:f0 全緑）
- **R-B（Opus）**: ④⑤＋デモ旧 open 6卓の治癒（テーブル2=検収中は除外・
  カウンター1=payments ありは入金取消→void の分岐で処理）
- 裁定済み: 延長行の qty=blocks×units／1押し1行／auto 店の手動延長 RPC 拒否／
  set 行は開卓時から

## 段48 golden 影響（予告）
receipt 52 不変・pay/rate-back 不変（時間行は back 対象外）・pricing-apply 段44(3)(3b)
張り替え（合算1行→2行の期待値・総額同値 assert が要）
