# 裁定244 レーン (a) 付け替え一覧（2026-09-11・HEAD 2296319 起点）

- 定義: globals.css `.nox-actions`（.nox-btn.ghost:disabled 直後）／`.nox-formmodal-foot` に justify-content center 1 行／theme.ts `actionsRow`（btnGhostLg 直後）。新トークン 0・ui-tokens 56 不変。
- 付け替え 28 行（inline の justifyContent flex-end を外して className="nox-actions"＝27 行・nox-modalfoot にクラス追加＝1 行）。並び順はすべてキャンセル左・確定右で入れ替えなし。
- CSS で対応（行編集なし）＝.nox-formmodal-foot の 6 行（幅 100% ボタン＝244 据え置き・見た目不変）。
- 244 で除外＝2 行。走査の過剰計上（ダイアログ脚ではない）＝28 行（モーダル見出しの ×・Modal 直下・ダイアログ内の選択行）。inventory の「ダイアログ 64」＝28＋6＋2＋28。

## 付け替え 28 行（変更前 → 変更後）

| 所在 | 変更前の配置 | 親行の変更 |
|---|---|---|
| app/(manage)/casts/casts-board.tsx:811 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}> |
| app/(manage)/casts/casts-board.tsx:826 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/casts/casts-board.tsx:837 | 右寄せ | style={{ display: "flex", justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex" }}> |
| app/(manage)/casts/casts-board.tsx:862 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}> |
| app/(manage)/casts/casts-board.tsx:875 | 右寄せ | style={{ display: "flex", justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex" }}> |
| app/(manage)/casts/casts-board.tsx:911 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}> |
| app/(manage)/customers/customers-board.tsx:764 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}> |
| app/(manage)/master/kiosk-device-panel.tsx:285 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/master/kiosk-pin-panel.tsx:284 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/master/printer-panel.tsx:235 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/payroll/payroll-list.tsx:217 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/receipts/receipts-board.tsx:173 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/register/register-board.tsx:1531 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" } → className="nox-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}> |
| app/(manage)/register/register-board.tsx:1570 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}> |
| app/(manage)/register/register-board.tsx:1602 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/register/register-board.tsx:1648 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/register/register-board.tsx:1681 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/register/register-board.tsx:1856 | 右寄せ | style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}> → className="nox-actions" style={{ display: "flex", marginTop: 12 }}> |
| app/(manage)/register/register-board.tsx:1884 | 右寄せ | style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}> → className="nox-actions" style={{ display: "flex", marginTop: 12 }}> |
| app/(manage)/report/report-board.tsx:542 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/report/report-board.tsx:1190 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}> |
| app/(manage)/shift/shift-board.tsx:2138 | 右寄せ | style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 17 }}> → className="nox-actions" style={{ display: "flex", gap: 9, marginTop: 17 }}> |
| app/(manage)/shift/staff-shift-manage.tsx:238 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}> → className="nox-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}> |
| app/(manage)/staff/staff-board.tsx:338 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/staff/staff-board.tsx:352 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/staff/staff-board.tsx:363 | 右寄せ | style={{ display: "flex", justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex" }}> |
| app/kiosk-register/page.tsx:669 | 右寄せ | style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}> → className="nox-actions" style={{ display: "flex", gap: 8 }}> |
| app/(manage)/notices/notices-board.tsx:563 | 左寄せ（既定） | className="nox-modalfoot"> → className="nox-modalfoot nox-actions"> |

## CSS で対応（.nox-formmodal-foot）

| 所在 | 文言 | 配置 |
|---|---|---|
| app/(manage)/master/categories/categories-board.tsx:209 | 更新 | 横幅いっぱい（width 100%／flex 1／Lg） |
| app/(manage)/master/pricing/pricing-board.tsx:1773 | キャンセル／この区分を保存 | 横幅いっぱい（width 100%／flex 1／Lg） |
| app/(manage)/master/pricing/pricing-board.tsx:1933 | 削除／キャンセル／この時間帯を保存 | 横幅いっぱい（width 100%／flex 1／Lg） |
| app/(manage)/master/products/products-board.tsx:636 | 記録する | 横幅いっぱい（width 100%／flex 1／Lg） |
| app/(manage)/master/products/products-board.tsx:767 | 更新／登録して続けて入力 | 横幅いっぱい（width 100%／flex 1／Lg） |
| app/(manage)/master/products/products-board.tsx:966 | キャンセル／登録中… 件を登録`} | 横幅いっぱい（width 100%／flex 1／Lg） |

## 244 で除外

| 所在 | 理由 |
|---|---|
| app/(manage)/report/report-board.tsx:721 | 回収額 input と同行（244＝対象外）・順序は回収／キャンセルのまま |
| app/(manage)/shift/shift-add-form.tsx:522 | 文言（名前／日数）＋ボタンの左右分割（244＝例外） |

## 走査の過剰計上（脚ではない・不触）

| 所在 | 文言 | 型 |
|---|---|---|
| app/(manage)/casts/casts-board.tsx:436 | × | モーダル見出しの × |
| app/(manage)/customers/customers-board.tsx:748 | {label} | ダイアログ内の選択行・操作行 |
| app/(manage)/master/categories/categories-board.tsx:186 | × | モーダル見出しの × |
| app/(manage)/master/pricing/pricing-board.tsx:1754 | × | モーダル見出しの × |
| app/(manage)/master/pricing/pricing-board.tsx:1783 | × | モーダル見出しの × |
| app/(manage)/master/products/products-board.tsx:615 | × | モーダル見出しの × |
| app/(manage)/master/products/products-board.tsx:644 | × | モーダル見出しの × |
| app/(manage)/master/products/products-board.tsx:643 | ▾ 詳細（原価・発注点・バック） | Modal 直下（脚ではない） |
| app/(manage)/master/products/products-board.tsx:874 | × | モーダル見出しの × |
| app/(manage)/register/register-board.tsx:1736 | カード手数料を追加（ {surchargeRate} %・  | ダイアログ内の選択行・操作行 |
| app/(manage)/register/register-board.tsx:1751 | {l} | ダイアログ内の選択行・操作行 |
| app/(manage)/register/register-board.tsx:1768 | {n} 分割 | ダイアログ内の選択行・操作行 |
| app/(manage)/register/register-board.tsx:1799 | ちょうど | ダイアログ内の選択行・操作行 |
| app/(manage)/register/register-board.tsx:1869 | 会計 {g}／＋会計を分けてそこへ | ダイアログ内の選択行・操作行 |
| app/(manage)/register/register-board.tsx:1906 | {closeInfo.groups.len} のレシート印刷 | ダイアログ内の選択行・操作行 |
| app/(manage)/register/register-board.tsx:1891 | 閉じる | Modal 直下（脚ではない） |
| app/(manage)/shift/shift-add-form.tsx:330 | × | モーダル見出しの × |
| app/(manage)/shift/shift-add-form.tsx:358 | ‹／› | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-add-form.tsx:367 | 出勤不可以外を全部選択／毎週 金を選択／毎週 土を選択／毎週 金・土を選択／選択をすべて解除 | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-add-form.tsx:421 | 出勤不可にする／不可を解除 | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-add-form.tsx:466 | 全日に適用 | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-board.tsx:1895 | × | モーダル見出しの × |
| app/(manage)/shift/shift-board.tsx:1932 | 時間帯を設定する | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-board.tsx:1992 | × | モーダル見出しの × |
| app/(manage)/shift/shift-board.tsx:2006 | 時間を調整 | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-board.tsx:2047 | × | モーダル見出しの × |
| app/(manage)/shift/shift-board.tsx:2067 | 調整 | ダイアログ内の選択行・操作行 |
| app/(manage)/shift/shift-board.tsx:2098 | × | モーダル見出しの × |
