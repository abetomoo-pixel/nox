# 裁定244 レーン (c) 付け替え一覧（(a)(b) 以外の全画面＋共通部品・2026-09-11・HEAD 4bd3342 起点）

- inventory の対象（節・表・フォーム直下）71 行（26 画面＋共通部品 4）→ 実対象 **11 行**（inventory 上 13 行・billing は 1 div に 2 行）・除外 **59 行**＋重複計上 1。
- 置換＝marginLeft auto 1（staff 閉じる）・inline-flex span→div 1（payroll 確定）を外してクラスへ、div／section／grid 直下の単独ボタン 7 件は .nox-actions で包む／クラス追加、並び順の入替 4 行。(a)(b) 済みの行は不触。kiosk は下部固定・キーパッド・幅 100% を除いた節直下（保存・延長を追加）のみ。

## 実対象（変更前の配置・入替有無・変更内容）

| 画面 | 所在 | 変更前の配置 | 入替 | 変更 |
|---|---|---|---|---|
| /billing | billing-board.tsx:127（inventory 129・141） | 左寄せ | 入替あり（年払い←→月払い／変更・切替←→お支払い管理） | className=nox-actions 追加 |
| /customers | customers-board.tsx:485（inventory 442） | 左寄せ（grid 末尾） | 入替なし | .nox-actions で包む |
| /customers/[id] | customer-detail.tsx:330（inventory 295） | 左寄せ（grid 末尾） | 入替なし | .nox-actions で包む |
| /notices | notices-board.tsx:393 | 左寄せ | 入替あり（入力をクリア←→内容を確認して掲載） | className=nox-actions 追加 |
| /notices | notices-board.tsx:507 | 左寄せ | 入替あり（キャンセル←→保存） | className=nox-actions 追加 |
| /payroll | payment-panel.tsx:100（inventory 94） | 左寄せ（section 直下） | 入替なし | .nox-actions で包む |
| /payroll | payroll-board.tsx:642（inventory 547） | 左寄せ（inline-flex span） | 入替なし | span→div.nox-actions（gap 保存） |
| /kiosk-register | page.tsx:876 | 左寄せ（div 直下） | 入替なし | className=nox-actions 追加 |
| /kiosk-register | page.tsx:954（inventory 942） | 左寄せ（section 直下） | 入替なし | .nox-actions で包む |
| /mine | drink-claim-form.tsx:117 | 左寄せ（div 直下） | 入替なし | className=nox-actions 追加 |
| /staff | staff-board.tsx:263 | 右寄せ（閉じるの marginLeft auto） | 入替あり（在籍を解除→役職変更→閉じる→再雇用） | marginLeft auto を外して className=nox-actions 追加 |

## 除外（理由の分類別）

### 文言＋ボタンの左右分割（13）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /analytics | analytics-board.tsx:710 | h3＋CSV 出力（marginRight auto） |
| /analytics | analytics-board.tsx:1106 | h3＋CSV 出力 |
| /customers | customers-board.tsx:698 | 文言＋削除 |
| /master/cast-comp/plan | plan-editor.tsx:223 | 見出し＋{section} を保存 |
| /master/pricing | pricing-board.tsx:931 | 見出し＋区分を追加 |
| /master/pricing | pricing-board.tsx:990 | 見出し＋時間帯を追加 |
| /master/pricing | pricing-board.tsx:1666 | 注記文言（flex 1）＋税設定を保存 |
| /master/seats | seats-board.tsx:85 | 見出し＋席を追加 |
| /payroll | invoice-panel.tsx:98 | 見出し＋再読込 |
| /payroll | payment-tax-panel.tsx:73 | 見出し＋再読込 |
| /payroll | payroll-board.tsx:779 | 説明文＋給与明細CSVを出力（カード） |
| /report | report-board.tsx:759 | 日付・状態バッジ＋日報を締める（nox-repstate） |
| /kiosk-register | kiosk-register/page.tsx:712 | 見出し＋更新 |

### 入力と同行のインライン（10）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /master/cast-comp | comp-sections.tsx:410 | SegSelect・input＋更新／追加に戻す |
| /master/cast-comp/plan | plan-editor.tsx:87 | input・checkbox＋更新／追加に戻す |
| /master/cast-comp/plan | plan-editor.tsx:376 | label・input＋プリセットを保存 |
| /master/pricing | pricing-board.tsx:894 | nox-inset の select＋更新 |
| /master/pricing | pricing-board.tsx:1100 | datetime・select＋この条件で計算 |
| /master/stock | stock-board.tsx:217 | ProductCombo・input＋棚卸しを記録 |
| /payroll | invoice-panel.tsx:193 | 暦年 input＋支払調書CSVを出力 |
| /payroll | payroll-board.tsx:339 | 店舗・期間 select＋プレビュー |
| /report | report-board.tsx:652 | checkbox＋給与天引き／追加回収 |
| /kiosk-register | kiosk-register/page.tsx:884 | ×（配分行・入力同行） |

### 切替（7）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /customers | customers-board.tsx:403 | ランクフィルタのチップ |
| /customers | customers-board.tsx:428 | 新しい順／掘り起こし順 |
| /customers | customers-board.tsx:610 | グレードのチップ |
| /master/cast-comp/plan | plan-editor.tsx:368 | {n}（登録済）チップ |
| /notices | notices-board.tsx:320 | 対象（grid のトグル） |
| /notices | notices-board.tsx:358 | {l} チップ |
| /notices | notices-board.tsx:387 | 今すぐ掲載／日時を予約／下書き保存（aria-pressed） |

### 表の行内操作列（5）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /customers | customers-board.tsx:654 | 編集（ボトル行 nox-btl） |
| /master/pricing | pricing-board.tsx:1692 | listrow（文言なし） |
| /notices | notices-board.tsx:533 | 編集／削除（一覧行） |
| /report | report-board.tsx:624 | listrow の期日ボタン |
| /mine/wishes | withdraw-button.tsx:21 | 取り下げ（一覧行・marginLeft auto） |

### 横幅いっぱい（据え置き）（5）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /kiosk | kiosk/page.tsx:207 | 出勤／退勤（grid 1fr 1fr） |
| /kiosk | kiosk/page.tsx:186 | もどる（幅 100%） |
| /kiosk-register | kiosk-register/page.tsx:619 | ログイン／もどる（幅 100%） |
| /login | login/page.tsx:42 | ログイン（幅 100%） |
| /mine | punch-actions.tsx:28 | 出勤／退勤（nox-punchrow grid 1fr 1fr） |

### 切替（月送り同型）（3）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /audit | audit-board.tsx:308 | ← 新しい方／古い方 →（ページ送り） |
| /master/stock | stock-board.tsx:298 | ← 新しい方／古い方 → |
| /receipts | receipts-board.tsx:148 | ← 新しい方／古い方 → |

### 文中のインライン（2）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /analytics | analytics-board.tsx:680 | 月間目標 KPI の設定（.sub 文言と同行） |
| /audit | audit-board.tsx:522 | 新しく出力＋準備中ピル |

### ドロワー閉じる（ヘッダ右上型）（2）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /customers | customers-board.tsx:549 | 見出し行の閉じる |
| /customers/[id] | customer-detail.tsx:284 | 見出し行の閉じる |

### 左右分割（244 逐語）（2）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /notices | notices-board.tsx:232 | LINE連携を管理（nox-alert・space-between） |
| components | simulator-panel.tsx:176 | 元に戻す（space-between） |

### 印刷（例外）（2）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /payroll | payroll-board.tsx:806 | 報酬明細を読み込む／印刷 |
| /kiosk-register | kiosk-register/page.tsx:682 | 見出し＋印刷／閉じる |

### 選択タイル（2）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /kiosk-register | kiosk-register/page.tsx:998 | 商品タイル |
| components | cast-picker.tsx:79 | キャストのタイル（grid） |

### 切替（ページ送り同型）（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /master/products | products-board.tsx:428 | もっと見る（一覧の続き表示） |

### 文言＋ボタンの左右分割（ツールバー）（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /staff | staff-board.tsx:182 | nox-ctoolbar の スタッフを追加 |

### 既に中央（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /kiosk | kiosk/page.tsx:222 | すぐ戻る（textAlign center） |

### ヘッダ右上型（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /kiosk-register | kiosk-register/page.tsx:543 | khead .op（交代／離席） |

### 固定バー（244）（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /kiosk-register | kiosk-register/page.tsx:775 | nox-backbar（← フロア） |

### 部品単体（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /mine | shift-confirm-button.tsx:35 | 部品単体（配置は呼び出し側） |

### 重複計上（1）

| 画面 | 所在 | 文言・型 |
|---|---|---|
| /billing | billing-board.tsx:141（inventory 2 行目） | ＝127 の div 内の 2 ブロック目（実対象で計上） |

## 画面別

| 画面 | 実対象 | 除外 |
|---|---|---|
| /analytics | 0 | 3 |
| /audit | 0 | 2 |
| /billing | 1 | 1 |
| /customers | 1 | 6 |
| /customers/[id] | 1 | 1 |
| /kiosk | 0 | 3 |
| /kiosk-register | 2 | 7 |
| /login | 0 | 1 |
| /master/cast-comp | 0 | 1 |
| /master/cast-comp/plan | 0 | 4 |
| /master/pricing | 0 | 6 |
| /master/products | 0 | 1 |
| /master/seats | 0 | 1 |
| /master/stock | 0 | 2 |
| /mine | 1 | 2 |
| /mine/wishes | 0 | 1 |
| /notices | 2 | 5 |
| /payroll | 2 | 6 |
| /receipts | 0 | 1 |
| /report | 0 | 3 |
| /staff | 1 | 1 |
| components | 0 | 2 |
