# NOX — 計算ロジック設計（payOf 配置・叩き台）

> `NOX_データモデル設計_Supabase版.md` の続編（§6 で予告した「計算ロジックの配置」）。
> 出典：`SPEC.md` §6（payOf の返り値一覧・源泉式）。**叩き台レベル**＝各バックの正確な計算式・スライド加重平均の厳密アルゴリズムは、CC 実装前に `pay.ts`（モックのお金ロジック）を見て精密化する。
> 確定（2026-06-25）：**案1＝payOf を TS 純関数に集約し、クライアント（シミュレーター表示）とサーバ（給与確定）で共有。お金が動く確定はサーバが再計算して凍結。**

---

## 0. 設計原則（BANZEN 実証パターンの適用）

| 原則 | BANZEN での実証 | NOX への適用 |
|---|---|---|
| 計算ロジックは純関数に集約 | buildReceiptXml / decidePunch | payOf を 1 つの TS 純関数に |
| お金が動く確定はサーバ権威 | pos_order_checkout がサーバ再計算 | 給与確定はサーバが payOf 再計算→凍結 |
| 純関数 ＋ verify スクリプトでテスト | verify:pos-p4 等 | payOf を全項目網羅テスト |
| シミュレーターと確定が一致 | （モックの payOf 共有を継承） | 同じ payOf を表示と確定で共有 |
| 確定値は凍結 | payslip スナップショット | payslips.breakdown_json に凍結 |

**お金は整数（円）。浮動小数禁止。中間値は保持し最終丸めのみ（SPEC §12 の金額精度原則）。**

---

## 1. payOf の責務分離

### 1.1 配置
- **`lib/nox/pay.ts`**（仮）に純関数 `payOf(input): PayResult` を 1 つ置く。
- **入力 `input`**：DB から読んだ確定済みデータをマッピングした plain object（プラン・各バック実績・勤怠日数・控除設定・ペナルティ設定・税プロファイル・天引き残高 等）。**payOf は DB を知らない**（BANZEN の純関数と同型・テスト容易）。
- **出力 `PayResult`**：SPEC §6.1 の返り値（下記 §2）。

### 1.2 2つの呼び出し経路
| 経路 | 誰が | 用途 | 書き込み |
|---|---|---|---|
| **シミュレーター** | クライアント（Mine 画面） | 「あと N 日出勤したら給与いくら」の表示 | なし（表示のみ） |
| **給与確定** | サーバ（Next.js API・service_role） | payroll_runs finalize 時に payslip 凍結 | あり（payslips へ） |

- **両経路が同じ `payOf`** を呼ぶ＝見積もりと実際が必ず一致。
- **確定の権威はサーバ**：クライアントの計算結果は表示専用。確定書き込みは**サーバが DB から実績を読んで payOf を再計算**し、その結果を凍結。クライアント送信値は使わない（改ざん耐性＝BANZEN 会計と同じ担保）。

### 1.3 なぜ案1か（案2 PL/pgSQL を採らない理由・記録）
- NOX の payOf は複雑（10種バック・スライド時給の日次最大→加重平均・源泉の雇用/委託分岐・二重控除ガード・ノルマ未達判定）。PL/pgSQL では長く・読みにくく・バグりやすく、PostgreSQL の罠（position 予約語・raise の全ロールバック・型キャスト）を踏む。
- テスト容易性が決定的（お金は正しさが命）。純関数なら DB 不要で全項目を verify できる。
- シミュレーターと確定の二重実装を避けられる（PL/pgSQL だとブラウザ用に TS で再実装が必要になり、片方修正漏れで見積もりズレ）。
- 案2 の利点「DB 内計算＝改ざん耐性」は、案1 でも「確定書き込みをサーバ API に限定＋サーバ再計算」で担保できる。

---

## 2. PayResult の構造（SPEC §6.1・叩き台）

```
type PayResult = {
  // ── 時給・基本給 ──
  wage: number;          // 加重平均時給（スライド：日次の売上/ポイント/保証の最大→労働時間で加重平均）
  timePay: number;       // 時給×実労働時間（実打刻ベース。days 上書きでは変わらない）

  // ── バック（指名・商品・売上）──
  honBack: number;       // 本指名バック
  jonaiBack: number;     // 場内指名バック
  dohanBack: number;     // 同伴バック
  drinkBack: number;     // ドリンクバック
  champBack: number;     // シャンパンバック
  bottleBack: number;    // ボトルバック
  salesBack: number;     // 売上バック（salesRate）
  cbacks: Record<string, number>;  // 自由設計バック（バック種別マスタ）

  // ── 総支給 ──
  gross: number;         // = timePay + 全バック合計

  // ── 控除 ──
  fixedDed: number;      // 送り代×days + 厚生費 + 率控除
  fine: number;          // 遅刻・当欠罰金 = absent*fineAbsent + late*fineLate
  withholding: number;   // 源泉（委託時のみ）= round((gross - 5000*days) * 0.1021)
  arDeduct: number;      // 売掛天引き
  advanceDeduct: number; // 前借り天引き
  okuriDeduct: number;   // 送り実費天引き
  normPenalty: number;   // ノルマ未達ペナルティ

  // ── 差引支給 ──
  net: number;           // = gross - fixedDed - fine - withholding - arDeduct - advanceDeduct - okuriDeduct - normPenalty

  // ── メタ ──
  lateN: number; absentN: number;  // 遅刻・当欠回数
  plan: ...; eplan: ...;           // 適用プラン（override 反映後）
}
```

### 2.1 各項目の計算メモ（SPEC §6 から・精密化は pay.ts 参照）
- **スライド時給**：待遇プランに保証時給／売上スライド（日次売上→時給・3段）／ポイントスライド（日次pt→時給・3段）。**日ごとに最も高い時給を採用→その日の労働時間で加重平均**。ポイント＝本指名3・同伴2・場内1。
- **timePay と days 上書きの関係**：`wage/timePay = wageDetail(c, eplan, days)`。**days 上書きは timePay を変えない**（シミュレーターの追加出勤は別途加算・§3）。
- **バック**：複数指名は ratio で分配。バック種別は本指名/場内/同伴/ドリンク/シャンパン/ボトル/売上＋自由設計（cbacks）。
- **源泉（ホステス特例）**：委託（cast_tax_profiles.mode=報酬）時のみ `round((gross - 5000*暦日数) * 0.1021)`。雇用時は別（社保・給与源泉＝**税理士/社労士確認**）。
- **ノルマ未達ペナルティ**：penalty_config.norm_on 時のみ。出勤未達 `daysFlat + 不足日×daysPer`、同伴未達 `dohanFlat + 不足本×dohanPer`。
- **二重控除ガード**：送り実費（okuriDeduct）と一律送り代（fixedDed 内の送り代）が重なる場合の明示ガード（SPEC・差別化の核）。
- **net**：上記の差引。

---

## 3. シミュレーター（Mine 画面・表示のみ）

SPEC §6.2 準拠。クライアントで `payOf` を呼ぶ：
- `cur = payOf(me)`：現在の確定見込み。
- `simBase = payOf(me, {days: me.days + simDays, dohan: me.dohan + simDohan})`：追加出勤を想定。
- 追加出勤分 `simDays * round(wage * hoursPerShift * 0.8979)` を加算（timePay は days 上書きで変わらないため別途加算）。
- ノルマ達成で `normPenalty → 0` になり想定月給が跳ねる。現在の未達ペナルティも表示。

※ 0.8979 等の係数は SPEC のモック値。精密化時に pay.ts で確認。

**【F2f 実装確定（2026-07-08）＝報酬シミュレーター・mig ゼロ・payOf 再利用】**
- **純経路の再利用**：`lib/nox/payroll/sim.ts` の `simulate(SimInput)＝仮パラメータ→CastRaw→buildPayInput→payOf`（DB 非依存・確定と同じ payOf を共有＝表示と確定でズレない）。collect/computePayrollDraft（DB 層）は通さない。daily は「days 個の均等シフト（各 hours=hoursPerDay・sales=総売上÷days）」に合成し、wageDetail の per-day slide 判定に載せる。**保存なし（使い捨て・mig ゼロ）**。
- **用途C（cast/店 両対応・1画面役割分岐）**：cast＝自分のプラン(pattern1変形)＋override・店マスタを RLS client 読取でマスタ固定・**open 前借り/送り残（adv/okuri）を pattern1 で反映**。店(manager/owner)＝プラン選択＋base/バック編集で任意プラン試算・天引きなし。実データは server 側 `sim-data.ts`（loadCastSimData/loadStoreSimData・**store_id 明示スコープ**＝owner の org 全店 RLS 対策）で読む。
- **(a) 裁定：売掛(ar)は反映しない**＝receivables はパターン2 で cast 読取不可（客情報 customer_id 保護）。cast 向け ar 残 RPC は F2e-1 で延期・弁護士ゲート後が安全ゆえ F2f では扱わず、確定給与明細（payslip.breakdown_json.ar）参照へ注記誘導。
- **#12 雇用係数は暫定 1.0（S5）**＝payOf 内 `withholdingOf`（委託 10.21%／雇用 0）と `simAddedPay`（委託 1−0.1021／雇用 1.0）が既に taxMode 分岐済み。社労士回答は pay.ts 当該1箇所差替で自動追従。
- **セルフレビュー是正**：当初の「あと1日 +¥X」限界額表示は full-model（days 変更で per-day sales/slide が再計算される）と不整合（hours 基準ズレ・売上スライド段落ちで符号反転）のため**撤去**。marginal は将来「同一 per-night レート据置」モデルで再検討可（留保）。

---

## 4. 給与確定（サーバ・お金が動く・凍結）

### 4.1 フロー
```
1. manager が payroll_runs を作成（period 指定・status=draft）
2. サーバ（Next.js API・service_role）が対象店の全 cast について：
   - DB から確定済み実績を読む（勤怠日数・各バック実績・天引き残高・プラン・税プロファイル・控除/ペナルティ設定）
   - payOf(input) を実行（サーバ側で再計算＝権威）
   - 結果 PayResult を payslips.breakdown_json に凍結（net も保存）
3. status=finalized・finalized_at セット
4. 確定後はマスタ（プラン/商品/控除）を変えても payslip は不変
```

### 4.2 BANZEN 教訓の適用
- **冪等性**：確定は冪等キー＋トランザクション（二重確定で payslip が重複しない）。
- **凍結**：payslips.breakdown_json は確定時点の値（BANZEN payslip スナップショットと同一）。
- **マスタ凍結**：finalized な period の comp_plans/products/deductions は編集不可（編集 RPC で period 確定チェック）。
- **天引き残高の整合**：advances/transport/receivables を給与天引きしたら、その消し込みも同一トランザクションで（二重天引き防止）。
- **二重控除ガード**：okuri vs 一律送り代が重なる場合のガードを payOf 内で明示。

### 4.3 確定 RPC か サーバ API か
- payOf は TS（案1）なので、**計算は Next.js サーバ側**で実行。
- 書き込みは **service_role でトランザクション**（payslips INSERT ＋ 天引き消し込み ＋ run status 更新を 1 トランザクション）。
- ⚠ BANZEN メモリ：「給与/課金/確定系は RPC 非経由（RLS+直書込）で穴なし」とあるが、NOX は計算が TS にあるため**サーバ API（service_role）経由が自然**。RLS で cast/manager の閲覧を守りつつ、確定書き込みはサーバ権威。この方式の是非は CC 実装時に再確認。

**【F2c 実装確定（2026-07-06・mig0016）＝§4.3 の結論（裁定 F1c〜F4c）】**
- **F1c 確定経路**：サーバ（Next.js API・service_role）が DB 実績を読み→payOf(TS) を cast ごとに再計算→算出済み payslip 群を **service_role 限定 RPC `payroll_finalize(p_org_id, p_actor, p_run_id, p_idem_key, p_payslips jsonb)`** に渡し、payslips 差し替え＋run 確定＋監査を**1トランザクションで原子的に**書く。純 service 直書き（原子性/監査形式をアプリ側で担保）でも authenticated 経由 RPC（値偽造余地）でもなく、この形＝authenticated は payslip 値を注入不可・原子性は RPC 本体で担保。`payroll_mark_paid` も service_role 限定（finalized→paid・箱のみ・実消し込みは F2e）。
- **F2c 状態**：draft→finalized→paid の3状態。finalize は paid でない限り再実行可（payslips 原子的差し替え・差し替え前 breakdown を `audit_log_write_service` に退避）。冪等キーは二重実行防止のみ（正当な再確定は別キー）。
- **F3c 器**：`breakdown_json = { pay: PayResult, extras: Extra[] }`。extras は F2c 空配列（#32 出勤インセンティブ等の独立行受け皿）。`payslips.net` は extras 込みの最終差引（F2c は extras 空＝pay.net と一致）。
- **F4c period**：'YYYY-MM'（暦月ラベル・C案）＋ `period_start`/`period_end`（解決済み窓）を run に凍結。'YYYY-MM'→date の写像は `period_bounds` を単一ソースに（finalize が窓解決に使い、get_cast_ranking も period_bounds 経由に再宣言＝窓は数学的に不変）。
- **#6 service 監査経路**：`audit_log_write_service`（p_org_id/p_actor 明示・完全内部専用）＝mig0002 の宿題をクローズ。
- 天引き（arDeduct/advanceDeduct/okuriDeduct）は F2c では 0 凍結（供給元 advances/transport の消し込み・二重控除ガード #8 は F2e）。専門家ゲート暫定既定は #7 源泉日数=出勤日数・#10 丸め=round・#11 雇用係数=1.0（pay.ts 既定・TODO 維持）。

---

## 5. 源泉・支払調書（確定値から生成）

- 源泉（委託 10.21%）・インボイス区分・支払調書は **payslip の確定値から生成**（SPEC §6・architecture §7）。
- payment_records（支払調書）に period・amount・withholding・reg_no を記録。
- ⚠ **税率・計算・区分は税理士確認**。雇用区分（委託/雇用）で源泉・社保・労務の扱いが全く変わる（要決定事項・architecture §12-3）。

---

## 6. テスト設計（BANZEN の verify 思想）

payOf 純関数を全項目網羅でテスト（DB 不要・`verify:nox-pay` 相当）：
- **スライド時給**：日次で売上/ポイント/保証の最大が採用され、労働時間で加重平均される（SPEC の玲奈ケース＝加重¥5,170・総110.1h・売上0/pt7/保証15日 を回帰テストに）。
- **各バック**：本指名/場内/同伴/ドリンク/シャンパン/ボトル/売上＋自由設計が正しく計算・複数指名 ratio 分配。
- **源泉**：委託時 `round((gross-5000*days)*0.1021)`／雇用時は出さない（or 別計算）。
- **控除**：送り代×days＋厚生費＋率控除／罰金（遅刻・当欠）／ノルマ未達ペナルティ（未達時のみ・達成で 0）。
- **天引き**：売掛/前借り/送り実費／**二重控除ガード**（okuri vs 一律送り代）。
- **net**：全項目の差引が一致。
- **凍結整合**：確定後にマスタを変えても payslip（breakdown_json）が不変。
- **シミュレーター一致**：payOf がシミュレーターと確定で同じ結果（追加出勤加算の係数含む）。

---

## 7. 精密化 TODO（CC 実装前に pay.ts を見て確定）

本書は SPEC §6 ベースの叩き台。以下は `pay.ts`（または nox-app.jsx の payOf 実装）を見て厳密化：
1. スライド時給の加重平均の正確なアルゴリズム（日次データの作り方・労働時間の重み）。
2. 各バックの正確な計算式（unit/rate モード・対象範囲・自由設計バックの定義）。
3. シミュレーターの係数（0.8979・hoursPerShift 等）の意味と本番での扱い。
4. 雇用区分（委託/雇用）での源泉・社保の分岐ロジック（**社労士確認**）。
5. 二重控除ガードの正確な条件。
6. 中間値保持・最終丸めの丸め単位（円）と各ステップの丸めタイミング。

---

## 8. 専門家確認フラグ（再掲・お金まわり）

- **源泉**：ホステス特例 10.21%・委託/雇用分岐・支払調書 → 税理士。
- **労務**：天引き本人同意・減給上限（労基法91条）・賃金台帳・労働時間記録 → 社労士。
- **インボイス**：適格請求書・区分・reg_no → 税理士。
- **AI 出力は補助・最終判断は専門家。**
