> 注: 本表は裁定240 の初期規則による機械走査（2026-09-11）。走査器の疑義（月送り「‹／›／今日」＝切替・register 会計操作バー＝固定バー・選択タイル＝切替・入力同行／文中インライン＝対象外・文言＋ボタンの左右分割＝例外・横幅いっぱい＝据え置き）は裁定244 で確定済み＝表 2 の該当行は例外側で読む。ダイアログ 64 行の内訳は docs/tmp/240_lane_a.md（レーン a）。

# 裁定240 ボタン中央配置 棚卸し（2026-09-11・読取のみ・実装なし・HEAD 2296319）

- 走査: app/**/*.tsx（design 除外）＋ components/**/*.tsx＝114 ファイル。単位＝<button> を束ねる親コンテナ（div／section／form／td…）＝「ボタン行」。
- 判定: 例外＝表の行内操作列／ログアウト（ヘッダ・kiosk）／印刷／リンク動作／切替（nav・seg・tab・"on" トグル）／キーパッド／kiosk の下部固定（nox-payrow sticky・nox-tabbar fixed）。対象＝節・表・フォーム直下（ダイアログの確定／キャンセルは別計上）。保留＝一覧の選択タイル・入力と同行・文中のインライン（240 の「直下」に当たるか要判断）。

## 表 1: 画面別（ボタン行の箇所数／対象（節・表・フォーム直下）／対象（ダイアログ確定・キャンセル）／例外／保留）

| 画面 | ボタン行 | 対象 | うちダイアログ | 例外 | 保留 |
|---|---|---|---|---|---|
| / | 1 | 0 | 0 | 1 | 0 |
| /analytics | 8 | 3 | 0 | 4 | 1 |
| /audit | 5 | 2 | 0 | 2 | 1 |
| /billing | 2 | 2 | 0 | 0 | 0 |
| /casts | 25 | 14 | 7 | 2 | 2 |
| /customers | 14 | 7 | 2 | 2 | 3 |
| /customers/[id] | 4 | 2 | 0 | 0 | 2 |
| /kiosk | 8 | 3 | 0 | 3 | 2 |
| /kiosk-register | 21 | 9 | 1 | 6 | 5 |
| /login | 1 | 1 | 0 | 0 | 0 |
| /master | 36 | 21 | 3 | 7 | 5 |
| /master/cast-comp | 9 | 1 | 0 | 7 | 1 |
| /master/cast-comp/plan | 6 | 4 | 0 | 2 | 0 |
| /master/categories | 5 | 0 | 2 | 2 | 1 |
| /master/pricing | 27 | 6 | 4 | 12 | 5 |
| /master/products | 14 | 1 | 7 | 5 | 1 |
| /master/seats | 3 | 1 | 0 | 2 | 0 |
| /master/stock | 5 | 2 | 0 | 0 | 3 |
| /master/system | 1 | 0 | 0 | 1 | 0 |
| /mine | 6 | 3 | 0 | 2 | 1 |
| /mine/wishes | 2 | 1 | 0 | 0 | 1 |
| /notices | 10 | 7 | 1 | 1 | 1 |
| /payroll | 18 | 8 | 1 | 7 | 2 |
| /receipts | 3 | 1 | 1 | 1 | 0 |
| /register | 52 | 16 | 14 | 13 | 9 |
| /report | 13 | 3 | 3 | 5 | 2 |
| /shift | 60 | 19 | 15 | 11 | 15 |
| /staff | 8 | 2 | 3 | 1 | 2 |
| components/nox/cast-picker.tsx | 2 | 1 | 0 | 1 | 0 |
| components/simulator-panel.tsx | 1 | 1 | 0 | 0 | 0 |
| components/ui/nav.tsx | 1 | 0 | 0 | 1 | 0 |
| components/ui/seg-select.tsx | 1 | 0 | 0 | 1 | 0 |
| **計** | **372** | **141** | **64** | **102** | **65** |

## 表 2: 対象（中央化）の一覧

| 画面 | 所在 | 親 | ボタン数 | 文言 | 現クラス | 現在の配置 | 区分 |
|---|---|---|---|---|---|---|---|
| /analytics | app/(manage)/analytics/analytics-board.tsx:680 | div | 1 | 設定 | btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /analytics | app/(manage)/analytics/analytics-board.tsx:710 | div | 1 | CSV 出力 | btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /analytics | app/(manage)/analytics/analytics-board.tsx:1106 | div | 1 | CSV 出力 | btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /audit | app/(manage)/audit/audit-board.tsx:308 | div | 2 | ← 新しい方／古い方 → | btnGhost/btnSm／btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /audit | app/(manage)/audit/audit-board.tsx:522 | div | 1 | 新しく出力 | btnGold/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /billing | app/(manage)/billing/billing-board.tsx:129 | <> | 2 | checkout-m／checkout-y | btnGold／btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /billing | app/(manage)/billing/billing-board.tsx:141 | <> | 3 | portal／interval／switch | btnGold／btnGhost／btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:406 | div | 1 | {label} | btnGhost/gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:436 | div | 1 | × | btnGhost | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:477 | div | 1 | 体入 {tr.name} 体入 — 書類 完了 評価 {tr | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:499 | div | 1 | nox-ctag off ` : "退店"} } {c.na | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:536 | div | 1 | 閉じる | btnGhost | 右寄せ | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:537 | div | 1 | 写真を変更 | - | 既に中央 | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:566 | div | 1 | 編集 | btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:578 | div | 2 | 保存／やめる | btnGold/btnSm／btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:595 | div | 2 | 退店／復活 | btnGhost／btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:707 | div | 2 | PW再発行／招待 | btnGhost／btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:718 | div | 1 | 打刻PIN を設定 | btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:742 | div | 1 | 閉じる | btnGhost | 右寄せ | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:753 | div | 1 | ★ | btnGhost/gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:775 | div | 2 | 本採用／見送り | btnGold／btnGhost/danger | 左寄せ（既定） | 節・表・フォーム直下 |
| /casts | app/(manage)/casts/casts-board.tsx:811 | div | 2 | キャンセル／処理中… | btnGhost／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:826 | div | 2 | コピーしました ✓／閉じる | btnGhost／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:837 | div | 1 | 閉じる | btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:862 | div | 2 | キャンセル／処理中… | btnGhost／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:875 | div | 1 | 閉じる | btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:911 | div | 2 | キャンセル／処理中… | btnGhost／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /casts | app/(manage)/casts/casts-board.tsx:1011 | div | 1 | 追加 | btnGold | 右寄せ | 節・表・フォーム直下 |
| /customers/[id] | app/(manage)/customers/[id]/customer-detail.tsx:284 | div | 1 | 閉じる | btnGold/btnGhost/btnSm | 右寄せ | 節・表・フォーム直下 |
| /customers/[id] | app/(manage)/customers/[id]/customer-detail.tsx:295 | div | 1 | 保存中… | btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:403 | div | 1 | {label} | btnGhost/btnSm/gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:428 | div | 2 | 新しい順／掘り起こし順（来店が古い順） | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:442 | div | 1 | 登録中… | btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:549 | div | 1 | 閉じる | btnGhost/btnSm | 右寄せ | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:610 | div | 1 | {label} | btnGhost/btnSm/gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:654 | div | 1 | 編集 | btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:698 | div | 1 | 削除 | btnGhost/btnSm | 右寄せ | 節・表・フォーム直下 |
| /customers | app/(manage)/customers/customers-board.tsx:748 | div | 1 | {label} | btnGhost/btnSm/gold | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /customers | app/(manage)/customers/customers-board.tsx:764 | div | 2 | キャンセル／保存する | btnGhost/btnSm／btnGold/btnSm | 右寄せ | ダイアログの確定／キャンセル |
| /master | app/(manage)/master/business-hours-panel.tsx:277 | div | 1 | 週間設定を保存 | btnGold/btnSm | 右寄せ | 節・表・フォーム直下 |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:410 | div | 2 | 更新／追加に戻す | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/cast-comp/plan | app/(manage)/master/cast-comp/plan/plan-editor.tsx:87 | div | 2 | 更新／追加に戻す | btnGhost/btnSm／btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/cast-comp/plan | app/(manage)/master/cast-comp/plan/plan-editor.tsx:223 | div | 1 | {section} を保存 | btnGold/btnSm | 右寄せ | 節・表・フォーム直下 |
| /master/cast-comp/plan | app/(manage)/master/cast-comp/plan/plan-editor.tsx:368 | div | 1 | {n} （登録済） | btnGhost/btnSm/gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/cast-comp/plan | app/(manage)/master/cast-comp/plan/plan-editor.tsx:376 | <> | 1 | プリセットを保存 | btnGold/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/cast-register-panel.tsx:65 | div | 2 | 無効／有効 | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/categories | app/(manage)/master/categories/categories-board.tsx:186 | div | 1 | × | - | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/categories | app/(manage)/master/categories/categories-board.tsx:209 | div | 1 | 更新 | btnPrimaryLg | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル（nox-formmodal-foot・sticky 下端） |
| /master | app/(manage)/master/deduction-panel.tsx:81 | div | 2 | 一律送り代／実費 | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/deduction-panel.tsx:193 | div | 1 | 発行 | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/kiosk-device-panel.tsx:247 | div | 1 | アカウントを発行 | - | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/kiosk-device-panel.tsx:285 | div | 2 | コピーしました ✓／閉じる | -／- | 右寄せ | ダイアログの確定／キャンセル |
| /master | app/(manage)/master/kiosk-pin-panel.tsx:251 | div | 1 | ポリシーを保存 | - | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/kiosk-pin-panel.tsx:284 | div | 2 | キャンセル／PINを更新 | -／- | 右寄せ | ダイアログの確定／キャンセル |
| /master | app/(manage)/master/norm-config-panel.tsx:60 | div | 1 | 保存 | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/pricing-panel.tsx:124 | div | 1 | shimei | btnGold/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/pricing-panel.tsx:138 | section | 1 | 保存 | btnGold/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:894 | div | 1 | 更新 | btnLight | 右寄せ | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:931 | div | 1 | ＋ 区分を追加 | btnDark | 右寄せ | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:990 | div | 1 | ＋ 時間帯を追加 | btnDark | 右寄せ | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1100 | div | 1 | この条件で計算 | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1666 | div | 1 | 税設定を保存 | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1692 | div | 1 | (文言なし) | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1754 | div | 1 | × | - | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1773 | div | 2 | キャンセル／この区分を保存 | btnGhostLg／btnPrimaryLg | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル（nox-formmodal-foot・sticky 下端） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1783 | div | 1 | × | - | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1933 | div | 3 | 削除／キャンセル／この時間帯を保存 | btnGhostLg／btnGhostLg／btnPrimaryLg | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル（nox-formmodal-foot・sticky 下端） |
| /master | app/(manage)/master/printer-panel.tsx:126 | div | 1 | 保存 | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/printer-panel.tsx:137 | div | 1 | 再発行 | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/printer-panel.tsx:147 | div | 1 | 更新 | - | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/printer-panel.tsx:197 | div | 1 | ヘッダを保存 | - | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/printer-panel.tsx:235 | div | 2 | コピーしました ✓／閉じる | -／- | 右寄せ | ダイアログの確定／キャンセル |
| /master/products | app/(manage)/master/products/products-board.tsx:428 | section | 1 | もっと見る（残り {filtered.length - sh | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/products | app/(manage)/master/products/products-board.tsx:615 | div | 1 | × | - | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/products | app/(manage)/master/products/products-board.tsx:636 | div | 1 | 記録する | btnPrimaryLg | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル（nox-formmodal-foot・sticky 下端） |
| /master/products | app/(manage)/master/products/products-board.tsx:643 | Modal | 1 | ▾ 詳細（原価・発注点・バック） | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/products | app/(manage)/master/products/products-board.tsx:644 | div | 1 | × | - | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/products | app/(manage)/master/products/products-board.tsx:767 | div | 2 | 更新／登録して続けて入力 | btnPrimaryLg／btnGhostLg | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル（nox-formmodal-foot・sticky 下端） |
| /master/products | app/(manage)/master/products/products-board.tsx:874 | div | 1 | × | - | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /master/products | app/(manage)/master/products/products-board.tsx:966 | div | 2 | キャンセル／登録中… 件を登録`} | btnGhostLg／btnPrimaryLg | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル（nox-formmodal-foot・sticky 下端） |
| /master/seats | app/(manage)/master/seats/seats-board.tsx:85 | div | 1 | ＋ 席を追加 | btnDark | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/sensitive-tax-panel.tsx:247 | div | 1 | 表示 | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/sensitive-tax-panel.tsx:263 | div | 1 | 機密情報を保存 | btnDark | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/sensitive-tax-panel.tsx:285 | div | 1 | 税務情報を保存 | btnDark | 右寄せ | 節・表・フォーム直下 |
| /master | app/(manage)/master/staff-shift-panel.tsx:157 | section | 1 | 過去の行を隠す ）`} | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/stock | app/(manage)/master/stock/stock-board.tsx:217 | div | 1 | 棚卸しを記録 | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /master/stock | app/(manage)/master/stock/stock-board.tsx:298 | div | 2 | ← 新しい方／古い方 → | btnGhost/btnSm／btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/time-pricing-panel.tsx:64 | div | 2 | −／＋ | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/time-pricing-panel.tsx:71 | div | 2 | −／＋ | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/time-pricing-panel.tsx:86 | section | 1 | 保存 | btnGold/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /master | app/(manage)/master/time-pricing-panel.tsx:102 | div | 2 | 卓単位／人数単位 | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:232 | div | 1 | LINE連携を管理 | btnLight | 左右分割（space-between） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:320 | div | 1 | {nOr(audCount[v] ?? n} 名 {l} a | gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:358 | div | 1 | {l} | btnDark/btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:387 | div | 3 | 今すぐ掲載／日時を予約（ {SOON} ）／下書き保存（ {SOON} ） | btnDark／btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:393 | div | 2 | 内容を確認して掲載／入力をクリア | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:507 | div | 2 | 保存／キャンセル | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:533 | div | 2 | 編集／削除 | btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /notices | app/(manage)/notices/notices-board.tsx:563 | div | 2 | 戻る／この内容で掲載 | btnLight／btnDark | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /payroll | app/(manage)/payroll/invoice-panel.tsx:98 | div | 1 | 再読込 | btnGhost/btnSm | 右寄せ | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/invoice-panel.tsx:193 | div | 1 | 支払調書CSVを出力 | btnGold/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payment-panel.tsx:94 | section | 1 | 支払状況を表示 | btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payment-tax-panel.tsx:73 | div | 1 | 再読込 | btnGhost/btnSm | 右寄せ | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payroll-board.tsx:339 | section | 1 | プレビュー | btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payroll-board.tsx:547 | div | 1 | この期間を確定する | btnGold/btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payroll-board.tsx:779 | section | 1 | 給与明細CSVを出力 | btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payroll-board.tsx:806 | div | 2 | 報酬明細を読み込む／印刷 / PDFで保存 | btnGhost／btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /payroll | app/(manage)/payroll/payroll-list.tsx:217 | div | 2 | やめる／処理中… | btnLight／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /receipts | app/(manage)/receipts/receipts-board.tsx:148 | div | 2 | ← 新しい方／古い方 → | btnGhost/btnSm／btnGhost/btnSm | 左寄せ（既定） | 節・表・フォーム直下 |
| /receipts | app/(manage)/receipts/receipts-board.tsx:173 | div | 2 | やめる／取り消す | btnGhost/btnSm／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1531 | div | 3 | やめる／予約を入れる／開卓（セット開始） | btnLight／btnLight／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1570 | div | 2 | 指定しないで追加／閉じる | btnLight／btnLight | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1602 | div | 2 | やめる／削除中… 行を削除`} | btnLight／btnLight/danger | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1648 | div | 2 | やめる／合算中… | btnLight／btnLight | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1681 | div | 2 | やめる／取消する | btnLight／btnLight/danger | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1736 | div | 1 | カード手数料を追加（ {surchargeRate} %・  | btnGold/btnGhost/btnSm | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1751 | div | 1 | {l} | btnGold/btnGhost | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1768 | div | 1 | {n} 分割 | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1799 | div | 1 | ちょうど | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1856 | div | 1 | 閉じる | btnLight | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1869 | div | 2 | 会計 {g}／＋会計を分けてそこへ | btnGold/btnGhost/btnSm／btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1884 | div | 1 | 閉じる | btnLight | 右寄せ | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1891 | Modal | 1 | 閉じる | btnGold | 横幅いっぱい（width 100%／flex 1／Lg） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:1906 | div | 1 | {closeInfo.groups.len} のレシート印刷 | btnDark | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /register | app/(manage)/register/register-board.tsx:2052 | div | 6 | ← フロア／−／＋／延長（ person / {check.ext_min} 分／伝票取消／合算 | -／btnLight／btnLight／btnLight／btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2118 | <> | 2 | ▾／{m.label} | btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2418 | div | 1 | 均等に分配 | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2459 | div | 1 | × | btnLight/danger | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2474 | div | 2 | 相席を追加（同一会計）／席を移動 | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2527 | div | 1 | 延長を追加（ person / {check.ext_min | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2543 | div | 1 | {m.label} {units > 1 ? `（×${un | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2612 | div | 1 | nox-tile-badge } {p.name} {yen | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2633 | div | 1 | nox-tile-badge } {p.name} {yen | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2722 | div | 2 | 承認／却下 | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:2747 | div | 1 | 商品をクリア（ {n} 行） | btnLight | 右寄せ | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:3010 | div | 1 | 入金する A ）` : ""} | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/register-board.tsx:3081 | div | 2 | {printCard.groups.len} を印刷` : ／閉じる | btnDark／btnLight | 右寄せ | 節・表・フォーム直下 |
| /register | app/(manage)/register/reservation-panel.tsx:382 | div | 2 | 全件／{dt.getMonth() + 1} / {dt.getD | -／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /register | app/(manage)/register/reservation-panel.tsx:446 | div | 4 | 来店済／編集／no_show／取消 | btnDark／btnLight／btnLight／btnLight | 右寄せ | 節・表・フォーム直下 |
| /register | app/(manage)/register/reservation-panel.tsx:582 | div | 2 | 保存／閉じる | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /report | app/(manage)/report/report-board.tsx:542 | div | 2 | やめる／解除する | btnLight／btnDark | 右寄せ | ダイアログの確定／キャンセル |
| /report | app/(manage)/report/report-board.tsx:624 | div | 1 | {r.due ? `期日 ${r.due} $ （超過） ` | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /report | app/(manage)/report/report-board.tsx:652 | div | 2 | 給与天引き／追加回収 | btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /report | app/(manage)/report/report-board.tsx:721 | div | 2 | ? を回収`}／キャンセル | btnDark／btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /report | app/(manage)/report/report-board.tsx:759 | div | 1 | 日報を締める | btnDark | 右寄せ | 節・表・フォーム直下 |
| /report | app/(manage)/report/report-board.tsx:1190 | div | 2 | クリア／実査へ反映（ {yen(total)} ） | btnLight／btnDark | 右寄せ | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/day-add-panel.tsx:119 | div | 1 | ＋ キャストを追加 | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/day-add-panel.tsx:168 | div | 2 | 配置中… 名を配置（仮シフト）`}／すべて取り消す | btnDark／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/incentive-panel.tsx:123 | div | 2 | 全員／選択 {!targetAll && picked} 名）`  | btnDark/btnLight／btnDark/btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/incentive-panel.tsx:131 | div | 1 | {c.name} | btnDark/btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/incentive-panel.tsx:150 | div | 1 | 取消 | btnLight | 右寄せ | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-add-form.tsx:330 | div | 1 | × | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-add-form.tsx:358 | div | 2 | ‹／› | btnLight／btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-add-form.tsx:367 | div | 5 | 出勤不可以外を全部選択／毎週 金を選択／毎週 土を選択／毎週 金・土を選択／選択をすべて解除 | btnLight／btnLight／btnLight／btnLight／btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-add-form.tsx:421 | div | 2 | 出勤不可にする／不可を解除 | btnLight／btnLight | 右寄せ | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-add-form.tsx:466 | div | 1 | 全日に適用 | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-add-form.tsx:522 | div | 3 | キャンセル／保存して次のキャスト／保存中… 日分を保存して閉じる`} | btnLight／btnLight／btnDark | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:832 | div | 1 | 今日 `} {Number(ymd.slice(8))} 日 | gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:919 | div | 1 | ＋ 当日追加配置 | - | 右寄せ | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1062 | div | 1 | 時間帯を設定する | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1086 | div | 3 | ‹／›／今日 | btnLight／btnLight／btnLight | 右寄せ | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1189 | div | 1 | × | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1268 | div | 3 | {ids.length} 件の希望をまとめて承認／{planned.length} 件まとめてキャスト確認へ／{planned.length + pro} 件を一括確定 | btnLight／btnLight／btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1476 | div | 4 | 確定シフトへ／必要人数を設定／作成中に戻す／スタッフに公開して確定 | btnLight／btnLight／btnLight／btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1524 | div | 2 | 編集／削除 | btnLight／btnLight | 右寄せ | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1556 | div | 1 | ＋ キャスト別にまとめて追加 | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1677 | div | 2 | CSV出力／印刷 | btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1705 | div | 3 | ‹／›／今日 | btnLight／btnLight／btnLight | 右寄せ | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/shift-board.tsx:1895 | div | 1 | × | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:1932 | div | 1 | 時間帯を設定する | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:1992 | div | 1 | × | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:2006 | div | 1 | 時間を調整 | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:2047 | div | 1 | × | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:2067 | div | 1 | 調整 | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:2098 | div | 1 | × | btnLight | 左寄せ（既定） | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/shift-board.tsx:2138 | div | 2 | やめる／保存 | btnLight／btnDark | 右寄せ | ダイアログの確定／キャンセル |
| /shift | app/(manage)/shift/staff-shift-board.tsx:109 | div | 3 | ‹／›／今日 | btnLight／btnLight／btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/staff-shift-board.tsx:139 | div | 1 | {p.name} {mark} | gold | 横幅いっぱい（width 100%／flex 1／Lg） | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/staff-shift-manage.tsx:143 | div | 1 | この営業日を一括確定（ proposed 件） | btnDark | 右寄せ | 節・表・フォーム直下 |
| /shift | app/(manage)/shift/staff-shift-manage.tsx:238 | div | 2 | キャンセル／上書きする | btnLight／btnDark | 右寄せ | ダイアログの確定／キャンセル |
| /staff | app/(manage)/staff/staff-board.tsx:182 | div | 1 | ＋ スタッフを追加 | btnGold | 右寄せ | 節・表・フォーム直下 |
| /staff | app/(manage)/staff/staff-board.tsx:263 | div | 4 | staff／在籍を解除／再雇用（復帰）／閉じる | btnGhost／btnGhost/danger／btnGold／btnGhost | 右寄せ | 節・表・フォーム直下 |
| /staff | app/(manage)/staff/staff-board.tsx:338 | div | 2 | キャンセル／追加中… | btnGhost／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /staff | app/(manage)/staff/staff-board.tsx:352 | div | 2 | コピーしました ✓／閉じる | btnGhost／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /staff | app/(manage)/staff/staff-board.tsx:363 | div | 1 | 閉じる | btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /kiosk-register | app/kiosk-register/page.tsx:543 | div | 1 | 交代／離席 | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:619 | div | 2 | ログイン／もどる | btnGold／btnLight | 横幅いっぱい（width 100%／flex 1／Lg） | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:669 | div | 2 | やめる／開卓（セット開始） | btnLight／btnGold | 右寄せ | ダイアログの確定／キャンセル |
| /kiosk-register | app/kiosk-register/page.tsx:682 | div | 2 | {printCard.groups.len} を印刷` : ／閉じる | btnDark／btnLight | 右寄せ | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:712 | div | 1 | 更新 | btnLight | 右寄せ | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:775 | div | 1 | ← フロア | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:876 | div | 1 | 保存 | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:884 | div | 1 | × | btnLight | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:942 | div | 1 | 延長を追加（ person / {detail.check. | btnDark | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk-register | app/kiosk-register/page.tsx:998 | div | 1 | nox-tile-badge } {p.name} {yen | - | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk | app/kiosk/page.tsx:186 | div | 1 | もどる | btnGhost/btnSm | 横幅いっぱい（width 100%／flex 1／Lg） | 節・表・フォーム直下 |
| /kiosk | app/kiosk/page.tsx:207 | div | 2 | 出勤／退勤 | btnGold／- | 左寄せ（既定） | 節・表・フォーム直下 |
| /kiosk | app/kiosk/page.tsx:222 | div | 1 | すぐ戻る | btnGhost/btnSm | 既に中央 | 節・表・フォーム直下 |
| /login | app/login/page.tsx:42 | form | 1 | 確認中… | btnGold | 横幅いっぱい（width 100%／flex 1／Lg） | 節・表・フォーム直下 |
| /mine | app/mine/drink-claim-form.tsx:117 | div | 1 | 送信中… | btnGold | 左寄せ（既定） | 節・表・フォーム直下 |
| /mine | app/mine/punch-actions.tsx:28 | div | 2 | 出勤／退勤 | btnGold／btnGhost | 左寄せ（既定） | 節・表・フォーム直下 |
| /mine | app/mine/shift-confirm-button.tsx:35 | (root) | 1 | 確認中… | btnGold/gold | 左寄せ（既定） | 節・表・フォーム直下 |
| /mine/wishes | app/mine/wishes/withdraw-button.tsx:21 | (root) | 1 | 取り下げ | btnGhost/btnSm | 右寄せ | 節・表・フォーム直下 |
| components/nox/cast-picker.tsx | components/nox/cast-picker.tsx:79 | div | 1 | {c.name} var(--sub) }> {rank}  | gold | 左寄せ（既定） | 節・表・フォーム直下 |
| components/simulator-panel.tsx | components/simulator-panel.tsx:176 | div | 1 | 元に戻す | btnSm | 左右分割（space-between） | 節・表・フォーム直下 |

## 表 3: 例外（不触）の一覧

| 画面 | 所在 | ボタン数 | 文言 | 例外理由 | 現在の配置 |
|---|---|---|---|---|---|
| /analytics | app/(manage)/analytics/analytics-board.tsx:600 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /analytics | app/(manage)/analytics/analytics-board.tsx:699 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /analytics | app/(manage)/analytics/analytics-board.tsx:863 | 1 | 顧客を見る | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /analytics | app/(manage)/analytics/analytics-board.tsx:892 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /audit | app/(manage)/audit/audit-board.tsx:217 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /audit | app/(manage)/audit/audit-board.tsx:242 | 1 | {v.label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /casts | app/(manage)/casts/casts-board.tsx:394 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /casts | app/(manage)/casts/casts-board.tsx:554 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /customers | app/(manage)/customers/customers-board.tsx:381 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /customers | app/(manage)/customers/customers-board.tsx:563 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| / | app/(manage)/layout.tsx:115 | 1 | ログアウト | ヘッダ右上のログアウト | 左寄せ（既定） |
| /master | app/(manage)/master/business-hours-panel.tsx:314 | 1 | {BULK_LABEL[k]} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master | app/(manage)/master/business-hours-panel.tsx:360 | 1 | 保存 | 表の行内操作列 | 左寄せ（既定） |
| /master | app/(manage)/master/business-hours-panel.tsx:404 | 2 | 臨時休業／特別営業 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:652 | 1 | 履歴 ▾ | 表の行内操作列 | 左寄せ（既定） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:667 | 1 | num 件 : "—"} ▾ | 表の行内操作列 | 左寄せ（既定） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:675 | 1 | 変更 | 表の行内操作列 | 左寄せ（既定） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:779 | 1 | 保存 | 表の行内操作列 | インライン（入力と同行） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:849 | 2 | 更新／新規に戻す | 表の行内操作列 | インライン（入力と同行） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:912 | 1 | 保存 | 表の行内操作列 | 左寄せ（既定） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:971 | 2 | 更新／新規に戻す | 表の行内操作列 | インライン（入力と同行） |
| /master/cast-comp/plan | app/(manage)/master/cast-comp/plan/plan-board.tsx:108 | 3 | ＋ 報酬プランを追加／複製／有効化 | 固定バー（nox-tabbar／sticky）＝切替系 | 左寄せ（既定） |
| /master/cast-comp/plan | app/(manage)/master/cast-comp/plan/plan-board.tsx:145 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/categories | app/(manage)/master/categories/categories-board.tsx:148 | 2 | ∧／∨ | 表の行内操作列 | 左寄せ（既定） |
| /master/categories | app/(manage)/master/categories/categories-board.tsx:171 | 1 | 編集 | 表の行内操作列 | 左寄せ（既定） |
| /master | app/(manage)/master/kiosk-device-panel.tsx:204 | 1 | 無効化 | 表の行内操作列 | 左寄せ（既定） |
| /master | app/(manage)/master/kiosk-pin-panel.tsx:209 | 1 | 再設定 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:881 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:958 | 2 | ∧／∨ | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:975 | 1 | 編集 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1021 | 2 | ∧／∨ | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1051 | 1 | 有効 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1057 | 1 | 編集 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1280 | 2 | ∧／∨ | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1310 | 1 | 有効 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1320 | 1 | 保存 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1329 | 1 | 削除 | 表の行内操作列 | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1402 | 1 | ルールで設定 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1726 | 3 | 許可しない／管理者のみ／すべて許可 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/products | app/(manage)/master/products/products-board.tsx:449 | 2 | すべて {pool.length}／{h.label} {h.n} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/products | app/(manage)/master/products/products-board.tsx:552 | 1 | 有効 | 表の行内操作列 | 左寄せ（既定） |
| /master/products | app/(manage)/master/products/products-board.tsx:565 | 2 | 入荷／編集 | 表の行内操作列 | 左寄せ（既定） |
| /master/products | app/(manage)/master/products/products-board.tsx:573 | 2 | ∧／∨ | 表の行内操作列 | 左寄せ（既定） |
| /master/products | app/(manage)/master/products/products-board.tsx:768 | 2 | (文言なし)／新規に戻す | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/seats | app/(manage)/master/seats/seats-board.tsx:99 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master/seats | app/(manage)/master/seats/seats-board.tsx:131 | 3 | (文言なし)／更新／やめる | 切替（seg／tab／toggle） | インライン（入力と同行） |
| /master | app/(manage)/master/staff-shift-panel.tsx:152 | 1 | 削除 | 表の行内操作列 | 左寄せ（既定） |
| /master/system | app/(manage)/master/system/system-board.tsx:56 | 1 | {t.label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /master | app/(manage)/master/time-pricing-panel.tsx:94 | 2 | 手動／自動 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /notices | app/(manage)/notices/notices-board.tsx:459 | 1 | {l} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /payroll | app/(manage)/payroll/payment-panel.tsx:124 | 1 | 記録 | 表の行内操作列 | 左寄せ（既定） |
| /payroll | app/(manage)/payroll/payment-tax-panel.tsx:126 | 1 | 納付を記録 | 表の行内操作列 | 左寄せ（既定） |
| /payroll | app/(manage)/payroll/payroll-board.tsx:554 | 1 | {l} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /payroll | app/(manage)/payroll/payroll-board.tsx:688 | 1 | 明細プレビューを閉じる | 固定バー（nox-tabbar／sticky）＝切替系 | 左寄せ（既定） |
| /payroll | app/(manage)/payroll/payroll-list.tsx:108 | 1 | 印刷 | 印刷 | 右寄せ |
| /payroll | app/(manage)/payroll/payroll-list.tsx:109 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /payroll | app/(manage)/payroll/payroll-list.tsx:176 | 2 | CSV／支払済みにする | 表の行内操作列 | 左寄せ（既定） |
| /receipts | app/(manage)/receipts/receipts-board.tsx:129 | 2 | URL コピー／取消 | 表の行内操作列 | 左寄せ（既定） |
| /register | app/(manage)/register/drink-claim-queue.tsx:144 | 2 | 承認／却下 | 表の行内操作列 | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:1393 | 2 | 会計 {g}／＋会計を分ける | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:1461 | 2 | 卓席・会計／予約 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:1975 | 1 | URL コピー | リンク動作（router／location） | 右寄せ |
| /register | app/(manage)/register/register-board.tsx:1989 | 1 | 領収書を印刷 / PDF {rcptIssued.lengt | 印刷 | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:2185 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:2289 | 2 | {l}／× | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:2594 | 2 | すべて／{g.label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:2817 | 1 | 会計 {l.pay_group} ▾ | 表の行内操作列 | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:2861 | 2 | 取消／キャストに付ける | 表の行内操作列 | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:2884 | 1 | 削除 | 表の行内操作列 | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:3058 | 2 | 会計を完了／← フロア | 固定バー（nox-tabbar／sticky）＝切替系 | 左寄せ（既定） |
| /register | app/(manage)/register/reservation-panel.tsx:90 | 1 | {l} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /report | app/(manage)/report/report-board.tsx:557 | 1 | day | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /report | app/(manage)/report/report-board.tsx:600 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /report | app/(manage)/report/report-board.tsx:606 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /report | app/(manage)/report/report-board.tsx:1248 | 3 | 再締め／解除／差異を承認 | 表の行内操作列 | 左寄せ（既定） |
| /report | app/(manage)/report/report-board.tsx:1254 | 1 | 再締め | 表の行内操作列 | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:796 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:805 | 1 | today queue )} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:989 | 1 | {l} | 表の行内操作列 | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1022 | 3 | 調整／確認へ／確定 | 表の行内操作列 | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1364 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1407 | 8 | 希望どおり承認／見送り／時間調整／キャスト確認へ／削除／再調整／差し戻す／削除 | 表の行内操作列 | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1507 | 1 | 希望を処理 | 切替（seg／tab／toggle） | 左右分割（space-between） |
| /shift | app/(manage)/shift/shift-board.tsx:1565 | 2 | 月カレンダー／スタッフ別 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1686 | 2 | カレンダー／表で見る | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1783 | 3 | 時間を調整／＋／削除 | 表の行内操作列 | 左寄せ（既定） |
| /shift | app/(manage)/shift/staff-shift-manage.tsx:172 | 2 | 時刻を上書き／確定 | 表の行内操作列 | 左寄せ（既定） |
| /staff | app/(manage)/staff/staff-board.tsx:215 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /kiosk-register | app/kiosk-register/page.tsx:555 | 1 | 端末ログアウト | ログアウト（kiosk／端末） | 右寄せ |
| /kiosk-register | app/kiosk-register/page.tsx:589 | 1 | ログアウト | ログアウト（kiosk／端末） | 既に中央 |
| /kiosk-register | app/kiosk-register/page.tsx:631 | 4 | {d}／クリア／0／⌫ | キーパッド（グリッド・kiosk） | 左寄せ（既定） |
| /kiosk-register | app/kiosk-register/page.tsx:983 | 2 | すべて／{g.label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| /kiosk-register | app/kiosk-register/page.tsx:1047 | 1 | 削除 | 表の行内操作列 | 左寄せ（既定） |
| /kiosk-register | app/kiosk-register/page.tsx:1170 | 2 | 会計を締める（クローズ）／← フロア | kiosk の下部固定（nox-payrow sticky／nox-tabbar fixed） | 左寄せ（既定） |
| /kiosk | app/kiosk/page.tsx:121 | 1 | 端末ログアウト | ログアウト（kiosk／端末） | 左寄せ（既定） |
| /kiosk | app/kiosk/page.tsx:160 | 1 | ログアウト | ログアウト（kiosk／端末） | 既に中央 |
| /kiosk | app/kiosk/page.tsx:199 | 4 | {d}／クリア／0／⌫ | キーパッド（グリッド・kiosk） | 左寄せ（既定） |
| /mine | app/mine/layout.tsx:29 | 1 | ログアウト | ヘッダ右上のログアウト | 左寄せ（既定） |
| /mine | app/mine/print-payslip-button.tsx:9 | 1 | 印刷 / PDFで保存 | 印刷 | 左寄せ（既定） |
| components/nox/cast-picker.tsx | components/nox/cast-picker.tsx:73 | 1 | {label} | 切替（seg／tab／toggle） | 左寄せ（既定） |
| components/ui/nav.tsx | components/ui/nav.tsx:61 | 1 | その他 | 切替（seg／tab／toggle） | 左寄せ（既定） |
| components/ui/seg-select.tsx | components/ui/seg-select.tsx:30 | 1 | {l} | 切替（seg／tab／toggle） | 左寄せ（既定） |

## 表 4: 保留（相談役判断）

| 画面 | 所在 | ボタン数 | 文言 | 理由 | 現在の配置 |
|---|---|---|---|---|---|
| /analytics | app/(manage)/analytics/analytics-board.tsx:1329 | 2 | ?／閉じる | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /audit | app/(manage)/audit/audit-board.tsx:262 | 1 | 絞り込み解除 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /casts | app/(manage)/casts/casts-board.tsx:389 | 1 | ＋ trial | 入力と同行のインライン（フォーム直下ではない） | 右寄せ |
| /casts | app/(manage)/casts/casts-board.tsx:926 | 1 | 保存 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /customers/[id] | app/(manage)/customers/[id]/customer-detail.tsx:196 | 1 | 閉じる | 文中のインライン | インライン（文中） |
| /customers/[id] | app/(manage)/customers/[id]/customer-detail.tsx:211 | 1 | 保存中… | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /customers | app/(manage)/customers/customers-board.tsx:371 | 1 | 閉じる | 入力と同行のインライン（フォーム直下ではない） | 右寄せ |
| /customers | app/(manage)/customers/customers-board.tsx:499 | 1 | {r.name} 1px 7px }> {gradeOf[r | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /customers | app/(manage)/customers/customers-board.tsx:690 | 1 | 追記 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master | app/(manage)/master/business-hours-panel.tsx:305 | 1 | 適用 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master | app/(manage)/master/business-hours-panel.tsx:400 | 1 | 特別日を追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master/cast-comp | app/(manage)/master/cast-comp/comp-sections.tsx:354 | 2 | 更新／新規に戻す | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master/categories | app/(manage)/master/categories/categories-board.tsx:200 | 1 | (文言なし) | 文中のインライン | インライン（文中） |
| /master | app/(manage)/master/deduction-panel.tsx:99 | 1 | 保存 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1132 | 1 | (文言なし) | 文中のインライン | インライン（文中） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1350 | 1 | ＋ ランクを追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1765 | 1 | (文言なし) | 文中のインライン | インライン（文中） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1862 | 1 | {d} | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /master/pricing | app/(manage)/master/pricing/pricing-board.tsx:1924 | 1 | (文言なし) | 文中のインライン | インライン（文中） |
| /master/products | app/(manage)/master/products/products-board.tsx:472 | 1 | (文言なし) | 文中のインライン | 右寄せ |
| /master | app/(manage)/master/staff-shift-panel.tsx:192 | 1 | 追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master | app/(manage)/master/staff-shift-panel.tsx:214 | 1 | 設定 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master/stock | app/(manage)/master/stock/stock-board.tsx:64 | 1 | × | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /master/stock | app/(manage)/master/stock/stock-board.tsx:92 | 1 | {p.name} 現在 {stock[p.id] ?? 0} | 一覧の選択タイル（map 内・ボタン行ではない） | 横幅いっぱい（width 100%／flex 1／Lg） |
| /master/stock | app/(manage)/master/stock/stock-board.tsx:248 | 1 | 履歴を隠す | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /notices | app/(manage)/notices/notices-board.tsx:431 | 1 | {x.label} {x.title} | 一覧の選択タイル（map 内・ボタン行ではない） | 横幅いっぱい（width 100%／flex 1／Lg） |
| /payroll | app/(manage)/payroll/invoice-panel.tsx:210 | 1 | 保存 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /payroll | app/(manage)/payroll/payroll-board.tsx:743 | 1 | 確定を解除 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /register | app/(manage)/register/bottle-keep-panel.tsx:73 | 1 | 登録 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /register | app/(manage)/register/register-board.tsx:1711 | 1 | 入金する（ — ） | 入力と同行のインライン（フォーム直下ではない） | 横幅いっぱい（width 100%／flex 1／Lg） |
| /register | app/(manage)/register/register-board.tsx:1842 | 1 | {s.name} 空席 | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /register | app/(manage)/register/register-board.tsx:1959 | 1 | 発行 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /register | app/(manage)/register/register-board.tsx:2669 | 1 | 追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /register | app/(manage)/register/register-board.tsx:2689 | 1 | 適用 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /register | app/(manage)/register/register-board.tsx:3118 | 1 | {s.name} stay num 名 ` : ""} {o | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /register | app/(manage)/register/reservation-panel.tsx:484 | 2 | 伝票を開く／閉じる | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /register | app/(manage)/register/reservation-panel.tsx:668 | 1 | 予約を追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /report | app/(manage)/report/report-board.tsx:745 | 2 | 設定する／キャンセル | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /report | app/(manage)/report/report-board.tsx:1145 | 3 | 金種で数える／再締め／締め確定 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/day-add-panel.tsx:131 | 1 | {c.name} nox-stpill nox-stpill | 一覧の選択タイル（map 内・ボタン行ではない） | 横幅いっぱい（width 100%／flex 1／Lg） |
| /shift | app/(manage)/shift/day-add-panel.tsx:158 | 1 | × | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/incentive-panel.tsx:106 | 1 | 発行 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/shift-add-form.tsx:374 | 1 | {Number(ymd.slice(8))} var(--s | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-add-form.tsx:441 | 1 | それでも登録 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/shift-add-form.tsx:479 | 1 | × | 入力と同行のインライン（フォーム直下ではない） | 右寄せ |
| /shift | app/(manage)/shift/shift-board.tsx:1118 | 1 | {Number(ymd.slice(8))} {FILL_L | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1214 | 1 | 追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/shift-board.tsx:1534 | 2 | 更新／やめる | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/shift-board.tsx:1577 | 1 | {Number(ymd.slice(8))} nox-cal | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /shift | app/(manage)/shift/shift-board.tsx:1712 | 1 | {Number(ymd.slice(8))} {list.s | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /shift | app/(manage)/shift/staff-shift-board.tsx:166 | 1 | 備考を保存 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /shift | app/(manage)/shift/staff-shift-manage.tsx:116 | 1 | {Number(day.slice(8))} {e.map( | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /shift | app/(manage)/shift/staff-shift-manage.tsx:192 | 1 | {nameOf(w.staff_id)} — var(--v | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /shift | app/(manage)/shift/staff-shift-manage.tsx:209 | 1 | 配置 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /staff | app/(manage)/staff/staff-board.tsx:243 | 1 | 名前を更新 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /staff | app/(manage)/staff/staff-board.tsx:251 | 1 | 異動を実行 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /kiosk-register | app/kiosk-register/page.tsx:572 | 1 | 確認中… | 入力と同行のインライン（フォーム直下ではない） | 横幅いっぱい（width 100%／flex 1／Lg） |
| /kiosk-register | app/kiosk-register/page.tsx:604 | 1 | {o.user_name} {ROLE_LABEL[o.ro | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /kiosk-register | app/kiosk-register/page.tsx:723 | 1 | {s.name} stay num 分` : "使用中"}  | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /kiosk-register | app/kiosk-register/page.tsx:1015 | 1 | 追加 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /kiosk-register | app/kiosk-register/page.tsx:1127 | 1 | 入金 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /kiosk | app/kiosk/page.tsx:143 | 1 | 確認中… | 入力と同行のインライン（フォーム直下ではない） | 横幅いっぱい（width 100%／flex 1／Lg） |
| /kiosk | app/kiosk/page.tsx:173 | 1 | {c.cast_name} var(--sub) }>PIN | 一覧の選択タイル（map 内・ボタン行ではない） | 左寄せ（既定） |
| /mine | app/mine/attendance-form.tsx:37 | 1 | 送信 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |
| /mine/wishes | app/mine/wishes/wish-form.tsx:63 | 1 | 提出 | 入力と同行のインライン（フォーム直下ではない） | インライン（入力と同行） |

## 対象の現在配置の内訳

- 左寄せ（既定）: 127 行
- 右寄せ: 63 行
- 横幅いっぱい（width 100%／flex 1／Lg）: 11 行
- 既に中央: 2 行
- 左右分割（space-between）: 2 行

## 崩れ候補（横幅いっぱい／左右分割／3 個以上並び／sticky 脚・space-between 脚）

| 所在 | ボタン数 | 文言 | 配置 | 理由 |
|---|---|---|---|---|
| app/(manage)/billing/billing-board.tsx:141 | 3 | portal／interval／switch | 左寄せ（既定） | 3 個以上 |
| app/(manage)/master/categories/categories-board.tsx:209 | 1 | 更新 | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい・sticky 脚（formmodal-foot）・space-between 脚（.foot） |
| app/(manage)/master/pricing/pricing-board.tsx:1773 | 2 | キャンセル／この区分を保存 | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい・sticky 脚（formmodal-foot）・space-between 脚（.foot） |
| app/(manage)/master/pricing/pricing-board.tsx:1933 | 3 | 削除／キャンセル／この時間帯を保存 | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい・3 個以上・sticky 脚（formmodal-foot）・space-between 脚（.foot） |
| app/(manage)/master/products/products-board.tsx:636 | 1 | 記録する | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい・sticky 脚（formmodal-foot）・space-between 脚（.foot） |
| app/(manage)/master/products/products-board.tsx:767 | 2 | 更新／登録して続けて入力 | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい・sticky 脚（formmodal-foot）・space-between 脚（.foot） |
| app/(manage)/master/products/products-board.tsx:966 | 2 | キャンセル／登録中… 件を登録`} | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい・sticky 脚（formmodal-foot）・space-between 脚（.foot） |
| app/(manage)/notices/notices-board.tsx:232 | 1 | LINE連携を管理 | 左右分割（space-between） | 左右分割 |
| app/(manage)/notices/notices-board.tsx:387 | 3 | 今すぐ掲載／日時を予約（ {SOON} ）／下書き保存（ {SOON} ） | 左寄せ（既定） | 3 個以上 |
| app/(manage)/register/register-board.tsx:1531 | 3 | やめる／予約を入れる／開卓（セット開始） | 右寄せ | 3 個以上 |
| app/(manage)/register/register-board.tsx:1891 | 1 | 閉じる | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい |
| app/(manage)/register/register-board.tsx:2052 | 6 | ← フロア／−／＋／延長（ person / {check.ext_min} 分／伝票取消／合算 | 左寄せ（既定） | 3 個以上 |
| app/(manage)/register/reservation-panel.tsx:446 | 4 | 来店済／編集／no_show／取消 | 右寄せ | 3 個以上 |
| app/(manage)/shift/shift-add-form.tsx:367 | 5 | 出勤不可以外を全部選択／毎週 金を選択／毎週 土を選択／毎週 金・土を選択／選択をすべて解除 | 左寄せ（既定） | 3 個以上 |
| app/(manage)/shift/shift-add-form.tsx:522 | 3 | キャンセル／保存して次のキャスト／保存中… 日分を保存して閉じる`} | 左寄せ（既定） | 3 個以上 |
| app/(manage)/shift/shift-board.tsx:1086 | 3 | ‹／›／今日 | 右寄せ | 3 個以上 |
| app/(manage)/shift/shift-board.tsx:1268 | 3 | {ids.length} 件の希望をまとめて承認／{planned.length} 件まとめてキャスト確認へ／{planned.length + pro} 件を一括確定 | 左寄せ（既定） | 3 個以上 |
| app/(manage)/shift/shift-board.tsx:1476 | 4 | 確定シフトへ／必要人数を設定／作成中に戻す／スタッフに公開して確定 | 左寄せ（既定） | 3 個以上 |
| app/(manage)/shift/shift-board.tsx:1705 | 3 | ‹／›／今日 | 右寄せ | 3 個以上 |
| app/(manage)/shift/staff-shift-board.tsx:109 | 3 | ‹／›／今日 | 左寄せ（既定） | 3 個以上 |
| app/(manage)/shift/staff-shift-board.tsx:139 | 1 | {p.name} {mark} | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい |
| app/(manage)/staff/staff-board.tsx:263 | 4 | staff／在籍を解除／再雇用（復帰）／閉じる | 右寄せ | 3 個以上 |
| app/kiosk/page.tsx:186 | 1 | もどる | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい |
| app/kiosk-register/page.tsx:619 | 2 | ログイン／もどる | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい |
| app/login/page.tsx:42 | 1 | 確認中… | 横幅いっぱい（width 100%／flex 1／Lg） | 横幅いっぱい |
| components/simulator-panel.tsx:176 | 1 | 元に戻す | 左右分割（space-between） | 左右分割 |

## 例外の内訳

- 切替（seg／tab／toggle）: 45 行
- 表の行内操作列: 41 行
- ログアウト（kiosk／端末）: 4 行
- 固定バー（nox-tabbar／sticky）＝切替系: 3 行
- 印刷: 3 行
- ヘッダ右上のログアウト: 2 行
- キーパッド（グリッド・kiosk）: 2 行
- リンク動作（router／location）: 1 行
- kiosk の下部固定（nox-payrow sticky／nox-tabbar fixed）: 1 行
