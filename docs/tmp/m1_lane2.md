# M1 第 2 レーン用: 横スクロール容器なしの残り表（2026-09-14・裁定251・HEAD 5543d9b）

第 1 レーン（report-board 699／991／1247）を除く「直親に横スクロール容器なし」の表＝21。包み方＝`<div className="nox-tablewrap plain">`（.nox-panel／t.card の中）または `nox-tablewrap`（枠を兼ねる場所）。潰れ型（width:100%・列数多）は th nowrap 併用。

| # | ファイル:行 | 型（width 100%＝潰れ型／幅なし＝はみ出し型） |
|---|---|---|
| 1 | app/(manage)/analytics/analytics-board.tsx:1142 | 潰れ型（width 100%） |
| 2 | app/(manage)/analytics/analytics-board.tsx:1214 | 潰れ型（width 100%） |
| 3 | app/(manage)/master/cast-comp/comp-sections.tsx:224 | 潰れ型（width 100%） |
| 4 | app/(manage)/master/cast-comp/comp-sections.tsx:336 | 潰れ型（width 100%） |
| 5 | app/(manage)/master/cast-comp/comp-sections.tsx:392 | 潰れ型（width 100%） |
| 6 | app/(manage)/master/cast-comp/comp-sections.tsx:615 | 潰れ型（width 100%） |
| 7 | app/(manage)/master/cast-comp/comp-sections.tsx:708 | 潰れ型（width 100%） |
| 8 | app/(manage)/master/cast-comp/comp-sections.tsx:762 | 潰れ型（width 100%） |
| 9 | app/(manage)/master/cast-comp/comp-sections.tsx:832 | 潰れ型（width 100%） |
| 10 | app/(manage)/master/cast-comp/comp-sections.tsx:956 | 潰れ型（width 100%） |
| 11 | app/(manage)/master/cast-comp/plan/plan-editor.tsx:72 | 潰れ型（width 100%） |
| 12 | app/(manage)/master/seats/seats-board.tsx:105 | 潰れ型（width 100%） |
| 13 | app/(manage)/payroll/payment-panel.tsx:106 | 潰れ型（width 100%） |
| 14 | app/(manage)/payroll/payroll-board.tsx:505 | 潰れ型（width 100%） |
| 15 | app/(manage)/payroll/payroll-board.tsx:561 | 潰れ型（width 100%） |
| 16 | app/(manage)/register/register-board.tsx:2810 | 潰れ型（width 100%） |
| 17 | app/(manage)/register/register-board.tsx:2983 | はみ出し型（幅なし） |
| 18 | app/kiosk-register/page.tsx:1037 | 潰れ型（width 100%） |
| 19 | app/kiosk-register/page.tsx:1096 | はみ出し型（幅なし） |
| 20 | app/mine/ranking/page.tsx:49 | 潰れ型（width 100%） |
| 21 | components/simulator-panel.tsx:395 | 潰れ型（width 100%） |

## .nox-ptwrap（overflow hidden＝切り落とし）の 8 表＝hidden→auto へ
- app/(manage)/master/categories/categories-board.tsx:134
- app/(manage)/master/pricing/pricing-board.tsx:947
- app/(manage)/master/pricing/pricing-board.tsx:1002
- app/(manage)/master/pricing/pricing-board.tsx:1268
- app/(manage)/master/pricing/pricing-board.tsx:1443
- app/(manage)/master/products/products-board.tsx:484
- app/(manage)/master/stock/stock-board.tsx:268
- app/(manage)/receipts/receipts-board.tsx:98

## 参考: 既存 .nox-tablewrap（枠つき）を既に使う 7 ファイル
- app/(manage)/audit/audit-board.tsx
- app/(manage)/master/business-hours-panel.tsx
- app/(manage)/master/feature-flags-panel.tsx
- app/(manage)/master/staff-shift-panel.tsx
- app/(manage)/register/drink-claim-queue.tsx
- app/(manage)/shift/shift-board.tsx
- app/(manage)/shift/staff-shift-manage.tsx
