# NOX U-1 給与収斂設計書 v1（裁定99・2026-08-31）

底本＝相談役起草 `NOX_裁定99_U1給与収斂.md`（2026-08-31 受領・sha256
`7fa5e2a878dbb65ae386d051ced0c0bb410e0bcd99bcb7119e3b6735171df3f9`・3,430 bytes・17行）。
§1 は底本の**逐語転記**（1バイト改変なし）。§2 は 2026-08-31 の U-1 設計前調査（実測）を根拠として添付。

---

## 1. 裁定99 本文（逐語）

# 裁定99（2026-08-31）U-1 給与画面のモック収斂

正本モック: mock/pages-2026-08/nox-payroll-management.html（v2 差替予定・構造の正本であって配色の正本ではない＝実装は現行トークン）。
裁定18（デザイン移植 段D で payroll を対象外）の対象外指定を解除し、収斂対象とする（起票#40）。

1. **構造**: モックの組成を採用＝hero＋KPI 4枚＋4ステップ＋キャスト別表＋右パネル明細＋下段2枚（支払・明細／税務・出力）。現行8区画はこの中へ畳む（機能の削除なし）。
2. **確定単位は run のまま**（変更なし）。ヘッダ「この期を確定」＝payroll_finalize／「確定解除」＝payroll_reopen（既設・owner 限定）。キャスト単位の確定は作らない。キャスト別表の状態列は**支払状態のみ**（未確定／未払／一部／支払済＝ net − Σpaid から導出）。
3. **KPI 4種**（支給総額／控除合計／差引支給額／未支払）: finalized/paid 期＝凍結 payslips の Σ（現行 sum4）、draft 期＝プレビュー rows から表示層で合算（新設・純関数）。前月比は現行の算出範囲を維持。欠落キーは 0 円扱い（2026-07-28 既定）。
4. **要対応区画**: 「集計」ステップ直下に blockers（no_plan / no_tax / no_employment）＋ warnings（裁定98: sanction_capped / sanction_contractor / avg_wage_provisional）を一覧。0件なら「要対応なし」。
5. **右パネル明細**: 共有描画 PayslipSlip を拡張＝guaranteeAdd（支給側「最低保証加算」として表示・控除側に置かない）・achievementBonus・sanction（原額／適用額）・税区分バッジ（委託／雇用）で源泉行名を切替。データは凍結済みのため確定済み期も遡及表示可。cast 本人の mine ページは同一部品のため自動追随。
6. **手動調整は採用しない**（payslips / payroll_runs に器なし・money-core）。準備中表示もしない（金額画面に動かないボタンを置かない）。必要なら D レーンで器から設計。
7. **LINE 明細公開は出さない**（T3 後送りの既裁定を維持）。4段目のステップ名は「支払・明細」。明細プレビュー＝PayslipSlip。
8. **CSV／一括PDF／納付管理／インボイス集計**は現行機能を下段「税務・出力」へ移設（挙動不変・呼び出し経路不変）。
9. **verify**: route スイートは新設しない（route は薄いラッパ＝core 直叩き方針を維持）。新設する純関数（draft 期 KPI 合算・支払状態導出・要対応の整形）に assert＋逆張り。**各区画コミットごとに CC が dev で当該区画を開きスクショ＋console エラー 0 を報告**。ログインできなければ**停止して申告**（続行しない）。
10. **完了条件**＝ verify:f0 2連続緑（golden 6値不変）＋ CC スクショ全区画 ＋ Agoora 実機 OK の3点が揃って「済」。台帳の裁定行に「実機: 未／CC済／Agoora済」欄を持つ。

実装順（区画単位コミット）: ① hero＋KPI＋ステップ＋要対応 → ② キャスト別表＋右パネル（PayslipSlip 拡張） → ③ 下段2枚への移設 → ④ test → ⑤ docs。モデル: Opus（表示層のみ・money-core 不触）。

---

## 2. 根拠（U-1 設計前調査・2026-08-31 実測）

### 2-1. 現行8区画 → 経路表（畳み込みの対象＝裁定99-①）

| 順 | 現行区画（payroll-board.tsx） | 呼ぶ経路（path:行・調査時点） |
|---|---|---|
| 1 | hero「給与」＋店/期間セレクタ | :339・payroll_runs 直読=:88 |
| 2 | run 状態バー＋合計サマリ4カード（総支給/控除計/うち源泉/差引支給）＋未支払・前月比 | 凍結 payslips Σ=:100-116・payment_records 直読=:96 |
| 3 | プレビュー（blockers→警告(裁定98)→出勤ボーナス→参考値表） | POST /api/payroll/preview=:239 → computePayrollDraft |
| 4 | 確定 | POST /api/payroll/finalize=:270（payroll_run_create→payroll_finalize） |
| 5 | 確定を解除 | :625・POST /api/payroll/reopen=:301（payroll_reopen pronargs=4・owner 限定） |
| 6 | 給与明細CSV | :650・lib/nox/payroll/csv.ts（純関数・クライアント組立） |
| 7 | 報酬明細（印刷/PDF）＝PayslipSlip 共有描画 | :677・:702（components/payslip-slip.tsx） |
| 8 | 支払記録パネル・納付管理パネル | payment-panel.tsx / payment-tax-panel.tsx（import :10-12） |

### 2-2. 器なし2件（裁定99-⑥⑦の根拠）

- **手動調整**: payslips live 列は `id, org_id, store_id, run_id, cast_id, period, breakdown_json, net, paid, created_at, updated_at`＝adjustment 系列なし。payroll_runs にもなし。RPC `%adjust%` は live pg_proc に **0本**（dev 実測）。→ 裁定99-⑥「採用しない・準備中表示もしない」。
- **LINE 明細公開**: 実装 0件。payroll-board.tsx:384 に「モックの4段目「公開」（LINE 明細公開）は T3 後送りのため出さない」の既裁定コメントが現存。cast 本人への表示は /mine の payslips 直近6期（RLS 本人スコープ・PayslipSlip 共有）で充足。→ 裁定99-⑦「出さない・4段目は支払・明細」。

### 2-3. KPI 4種の充足（裁定99-③の根拠）

- finalized/paid 期: **4種すべて既存集計で取れる**＝支給総額 sum4.gross（凍結Σ＋extras）／控除合計 sum4.ded／差引 sum4.net／未支払 net−Σpaid（payment_records・部分払い積上げ対応済み＝payment_record_add が Σpaid ≤ net を DB 強制）。
- **取れないのは draft 期のみ**＝sum4 系は finalized/paid 限定（:93 条件）。プレビュー rows からの合算は未実装 → 裁定99-③の「表示層で合算（新設・純関数）」がこの欠落を埋める。欠落キー0円の既定（2026-07-28）は流用。
- 前月比は前月 run（finalized/paid）1期の Σnet のみ（:118-126）＝裁定99-③「現行の算出範囲を維持」の現状値。

### 2-4. PayslipSlip 未追随キー（裁定99-⑤の根拠）

- preview API は `breakdown: { pay: PayResult 全キー, extras }` を返す（preview/route.ts:21）＝guaranteeAdd／achievementBonus／honBack／salesBack・sRate／withholding／okuriDeduct／sanction すべて**データは既にある**（確定済み期は payslips.breakdown_json に凍結済み＝遡及表示可）。
- 未追随は**表示層のみ**: components/payslip-slip.tsx:15-17 のローカル Pay 型と描画が `guaranteeAdd`／`achievementBonus`／`sanction` を持たない。税区分は PayResult.taxMode が凍結済み（裁定28）＝バッジと源泉行名切替の材料も既にある。

### 2-5. verify の現状（裁定99-⑨⑩の根拠）

- /api/payroll/* を叩くスイートは 0件（route は薄いラッパ＝core 直叩き方針・verify-nox-payroll.ts:5 注記）。給与系の係留＝verify-nox-payroll（computePayrollDraft/payOf 直叩き・174本）＋verify-nox-payroll-csv（純関数25本）。
- 調査時点の f0 基準＝28本/3329・golden 6値 5931/125802/55233/64/64/53。
