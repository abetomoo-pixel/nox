# 裁定244 レーン (b) 付け替え一覧（/shift・/master・/register・/casts・2026-09-11・HEAD 59f6e64 起点）

- inventory の対象（節・表・フォーム直下）70 行（/casts 14・/master 21・/register 16・/shift 19）→ 実対象 **15 行**・除外 **58 行**。
- 置換＝inline の justifyContent flex-end（1）／textAlign right（5）を外して className="nox-actions"・section／div 直下の保存ボタンは .nox-actions で包む（4）・並び順の入替 4 行（Danger 左端・補助・実行 右端）。ダイアログ脚（(a) 済み）は不触。

## 実対象（変更前の配置・入替有無・変更内容）

| 画面 | 所在 | 変更前の配置 | 入替 | 変更 |
|---|---|---|---|---|
| /casts | casts-board.tsx:775 | 左寄せ | 入替あり（見送り←→本採用）| className=nox-actions 追加（style 保存） | undefined |
| /casts | casts-board.tsx:1011 | 右寄せ（justifyContent flex-end） | 入替なし | flex-end を外して className=nox-actions |
| /master | kiosk-device-panel.tsx:247 | 右寄せ（textAlign right） | 入替なし | textAlign を外して className=nox-actions |
| /master | kiosk-pin-panel.tsx:251 | 右寄せ（textAlign right） | 入替なし | textAlign を外して className=nox-actions |
| /master | printer-panel.tsx:197 | 右寄せ（textAlign right） | 入替なし | textAlign を外して className=nox-actions |
| /master | sensitive-tax-panel.tsx:263 | 右寄せ（textAlign right） | 入替なし | textAlign を外して className=nox-actions（marginTop 保存） |
| /master | sensitive-tax-panel.tsx:285 | 右寄せ（textAlign right） | 入替なし | textAlign を外して className=nox-actions（marginTop 保存） |
| /master | pricing-panel.tsx:127 | 左寄せ（div 直下・marginTop 12） | 入替なし | .nox-actions で包む（marginTop をラッパへ） |
| /master | pricing-panel.tsx:146 | 左寄せ（section 直下・marginTop 14） | 入替なし | .nox-actions で包む |
| /master | time-pricing-panel.tsx:113 | 左寄せ（section 直下・marginTop 16） | 入替なし | .nox-actions で包む |
| /register | register-board.tsx:2474 | 左寄せ | 入替あり（席を移動←→相席を追加）| className=nox-actions 追加 | undefined |
| /register | register-board.tsx:2558 | 左寄せ（section 直下・三項 else） | 入替なし | .nox-actions で包む |
| /register | reservation-panel.tsx:582 | 左寄せ | 入替あり（閉じる←→保存）| className=nox-actions 追加 | undefined |
| /shift | day-add-panel.tsx:119 | 左寄せ（div 直下） | 入替なし | className=nox-actions 追加（margin 保存） |
| /shift | day-add-panel.tsx:168 | 左寄せ | 入替あり（すべて取り消す←→配置）| className=nox-actions 追加 | undefined |

## 除外（inventory 上の対象から外した行と理由）

| 画面 | 所在 | 文言・型 | 理由（244） |
|---|---|---|---|
| /casts | casts-board.tsx:406 | ランクフィルタのチップ（gold トグル） | 切替 |
| /casts | casts-board.tsx:477 | 体入カード（nox-cardgrid） | 選択タイル |
| /casts | casts-board.tsx:499 | キャストカード（nox-cardgrid） | 選択タイル |
| /casts | casts-board.tsx:536 | ドロワーの閉じる（marginLeft auto・見出し右上型） | ヘッダ右上型（閉じる） |
| /casts | casts-board.tsx:537 | 写真を変更（textAlign center） | 既に中央＝不変 |
| /casts | casts-board.tsx:566 | 編集（nox-frow のキー／値行） | 入力と同行のインライン |
| /casts | casts-board.tsx:578 | 保存／やめる（nox-frow 編集行） | 入力と同行のインライン |
| /casts | casts-board.tsx:595 | 退店／復活（nox-frow） | 入力と同行のインライン |
| /casts | casts-board.tsx:707 | PW再発行／招待（nox-frow） | 入力と同行のインライン |
| /casts | casts-board.tsx:718 | 打刻PIN を設定（nox-frow） | 入力と同行のインライン |
| /casts | casts-board.tsx:742 | ドロワーの閉じる | ヘッダ右上型（閉じる） |
| /casts | casts-board.tsx:753 | ★（お気に入りトグル） | 切替 |
| /master | business-hours-panel.tsx:277 | 見出し＋週間設定を保存（marginLeft auto） | 文言＋ボタンの左右分割 |
| /master | cast-register-panel.tsx:65 | 無効／有効 | 切替 |
| /master | deduction-panel.tsx:81 | 一律送り代／実費 | 切替 |
| /master | deduction-panel.tsx:193 | キャスト select＋発行 | 入力と同行のインライン |
| /master | norm-config-panel.tsx:60 | checkbox＋保存 | 入力と同行のインライン |
| /master | printer-panel.tsx:126 | checkbox・input＋保存 | 入力と同行のインライン |
| /master | printer-panel.tsx:137 | 受信URL 文言＋発行 | 文中のインライン |
| /master | printer-panel.tsx:147 | h3＋更新（marginLeft auto） | 文言＋ボタンの左右分割 |
| /master | sensitive-tax-panel.tsx:247 | マイナンバー表示文言＋表示 | 文中のインライン |
| /master | staff-shift-panel.tsx:157 | 過去の行を隠す／表示 | 切替 |
| /master | time-pricing-panel.tsx:64 | −／＋（ステッパー） | 入力と同行のインライン |
| /master | time-pricing-panel.tsx:71 | −／＋（ステッパー） | 入力と同行のインライン |
| /master | time-pricing-panel.tsx:102 | 卓単位／人数単位 | 切替 |
| /master | pricing-panel.tsx:138（section） | ＝146 行の保存（実対象で計上） | 重複計上 |
| /master | time-pricing-panel.tsx:86（section） | ＝113 行の保存（実対象で計上） | 重複計上 |
| /register | register-board.tsx:2052 | nox-backbar（← フロア・−・＋・延長・伝票取消・合算） | 固定バー（244） |
| /register | register-board.tsx:2118 | ▾／{m.label}（メニュー開閉） | 切替 |
| /register | register-board.tsx:2418 | 均等に分配＋注記文言 | 文中のインライン |
| /register | register-board.tsx:2459 | ×（分配行の削除・入力同行） | 入力と同行のインライン |
| /register | register-board.tsx:2527（section） | ＝2558 行の延長を追加（実対象で計上） | 重複計上 |
| /register | register-board.tsx:2543 | {m.label}（延長メニュー） | 選択タイル |
| /register | register-board.tsx:2612 | 商品タイル（nox-tilegrid） | 選択タイル |
| /register | register-board.tsx:2633 | 商品タイル（nox-tilegrid） | 選択タイル |
| /register | register-board.tsx:2722 | 承認／却下（承認待ち行） | 表の行内操作列 |
| /register | register-board.tsx:2747 | 商品をクリア（marginLeft auto・見出し行） | 文言＋ボタンの左右分割 |
| /register | register-board.tsx:3010 | グループ seg＋入金する | 切替と同行 |
| /register | register-board.tsx:3081 | 見出し＋グループ別 印刷＋閉じる | 印刷（例外）・文言＋ボタン |
| /register | reservation-panel.tsx:382 | 全件／日付（フィルタ） | 切替 |
| /register | reservation-panel.tsx:446 | 来店済／編集／no_show／取消（予約行） | 表の行内操作列 |
| /shift | incentive-panel.tsx:123 | 全員／選択 | 切替 |
| /shift | incentive-panel.tsx:131 | {c.name}（対象キャストのチップ） | 選択タイル |
| /shift | incentive-panel.tsx:150 | 取消（listrow） | 表の行内操作列 |
| /shift | shift-board.tsx:832 | 日付ストリップ（gold トグル） | 切替 |
| /shift | shift-board.tsx:919 | 見出し＋当日追加配置（marginLeft auto） | 文言＋ボタンの左右分割 |
| /shift | shift-board.tsx:1062 | 注記文言＋時間帯を設定する（nox-inset） | 文言＋ボタン |
| /shift | shift-board.tsx:1086 | ‹／›／今日 | 月送り（244） |
| /shift | shift-board.tsx:1189 | ×（曜日行） | 表の行内操作列 |
| /shift | shift-board.tsx:1268 | 見出し＋一括承認 3 個（marginLeft auto span） | 文言＋ボタンの左右分割 |
| /shift | shift-board.tsx:1476 | 見出し＋計画操作 4 個（右側 span） | 文言＋ボタンの左右分割 |
| /shift | shift-board.tsx:1524 | 編集／削除（listrow） | 表の行内操作列 |
| /shift | shift-board.tsx:1556 | 見出し＋キャスト別にまとめて追加 | 文言＋ボタンの左右分割 |
| /shift | shift-board.tsx:1677 | CSV出力／印刷 | 印刷（例外） |
| /shift | shift-board.tsx:1705 | ‹／›／今日 | 月送り（244） |
| /shift | staff-shift-board.tsx:109 | ‹／›／今日 | 月送り（244） |
| /shift | staff-shift-board.tsx:139 | {p.name}（日セルのタイル） | 選択タイル |
| /shift | staff-shift-manage.tsx:143 | 日付・締切文言＋一括確定（marginLeft auto） | 文言＋ボタンの左右分割 |

## 画面別

| 画面 | 実対象 | 除外 |
|---|---|---|
| /casts | 2 | 12 |
| /master | 8 | 15 |
| /register | 3 | 14 |
| /shift | 2 | 17 |
