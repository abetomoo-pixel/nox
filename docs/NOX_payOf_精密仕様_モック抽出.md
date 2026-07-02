# NOX — payOf 精密仕様（モック `nox-nightwork-app.html` 実装から抽出）

> `NOX_計算ロジック設計_payOf.md` §7「精密化 TODO」への回答。設計書が「叩き台・pay.ts を見て確定」としていた6項目を、モック本体の実装から確定させた。
> **これで F0 の payOf 移植ブロッカーは解消。** 本書＝`lib/nox/pay.ts` の実装元。
> 出典：モックの `te`（給与assembler）/ `Py`（時給・スライド）/ `Vy`（自由バック）/ `uS`（売上率）/ `vS`（商品バック）/ `iS`（日次分配）。変数名は難読化されているため、本書で意味を復元済み。

---

## 0. 最重要の発見（設計書の TODO への直接回答）

### 0.1 スライド時給の加重平均アルゴリズム（TODO 1）
モックの `Py(cast, plan, days)`：
1. 各キャストに **日次データ列**（`{d, hours, sales}`）を持つ（モックでは `iS` で days から生成。本番は実 punch＋実売上）。
2. その月の **本指名pt総量** `pts = hon*3 + jonai*1 + dohan*2 + 本指名商品pt` を、各日の売上比で日次に按分：`日次pt = round(pts * (日売上/月売上総額) * 10)/10`。
3. **各日で3候補の最大時給を採用**：
   - 売上スライド `salesSlide`：その日の売上が閾値 `at` 以上なら `wage`（3段・階段関数、最後にマッチした段が有効）
   - ポイントスライド `pointSlide`：その日の按分pt が `at` 以上なら `wage`
   - 保証時給 `base`
   - `その日の時給 = max(売上스ライド, ポイントスライド, base)`
4. **労働時間で加重平均**：`月時給 = round(Σ(日時給 × 日hours) / Σ日hours)`。
5. `timePay = round(Σ(日時給 × 日hours))`（＝加重平均前の素の積み上げ）。

★ポイント配分の重み＝**本指名3・同伴2・場内1**（`hon*3 + dohan*2 + jonai*1`）。設計書 §2.1 の記述と一致。加えて**本指名商品pt**（`honPt` 付き商品の本指名時加算）を足す。

### 0.2 シミュレーター係数 0.8979 の正体（TODO 3）
モック：`追加出勤分 = simDays × round(wage × hoursPerShift × 0.8979)`。
**0.8979 = 1 − 0.1021**（源泉 10.21% の控除後手取り率）。つまり「追加1出勤の増額（手取りベース概算）＝時給 × 1シフト時間 × (1−源泉率)」。
`hoursPerShift` はデフォルト **5**（`penalty_config` 相当に格納）。
→ 本番では「マジックナンバー」ではなく `1 - 源泉率` として実装すべき（源泉率が変われば連動）。雇用（源泉なし）の場合は係数 1.0 が理論的に正しい（モックは委託前提でハードコード）。

### 0.3 源泉の正確な式（TODO 4）
モック `te`：`withholding = (雇用区分==='委託') ? max(0, round((gross − 5000×days) × 0.1021)) : 0`。
- `days` は**出勤日数**（暦日数ではなくその月の出勤日数を使用）。設計書 §2.1 は「5000×暦日数」と書いていたが、**モック実装は出勤日数**。★税理士確認事項（ホステス報酬の源泉は「支払金額 − 5000×計算期間の日数」で、日数の定義は要確認。モックは出勤日数を採用）。
- 雇用（給与）は源泉を **0**（モックは社保・給与源泉を未計算）。★F2 で社労士確認。

### 0.4 二重控除ガードの実際（TODO 5）
モックには **明示的な okuri vs 送り代の二重控除ガードは実装されていない**。両者は独立に減算される：
- `fixedDed`（送り代×days ＋ 厚生費 ＋ 率控除）＝控除マスタ `Li` から計算
- `okuriDeduct`（送り実費）＝別テーブル `Ei` から合算
→ 設計書が「差別化の核」とした二重控除ガードは**モックには無く、本番で新規実装すべき論点**。F2 で「送り代（一律）と送り実費が重複する場合の控除」の仕様を決める（現状モックは両取り＝二重控除の可能性あり）。

### 0.5 丸めのタイミング（TODO 6）
モックの丸め箇所（すべて `Math.round`、整数円）：
- 日次時給採用後・加重平均で1回：`round(Σ(日時給×hours)/Σhours)`
- `timePay = round(Σ(日時給×hours))`
- 商品バック（率）：`round(price × rate/100)` を数量倍
- 売上バック：`round(sales × salesRate)`
- 自由バック（sales基準）：`round(sales × value/100)`
- 源泉：`round((gross − 5000×days) × 0.1021)`
- 日次pt按分：`round(pts × (日売上/月売上) × 10)/10`（0.1pt単位）
→ **中間値は保持し、上記の各ステップで round**。gross/net 自体は整数の加減算なので追加丸め無し。★税理士が floor 指定なら `payslip` 確定側で全 round を差し替え（BANZEN の payroll L82-84 と同じ集約方針）。

---

## 1. PayResult の確定構造（モック `te` の返り値）

```ts
type PayResult = {
  // 適用プラン
  plan: CompPlan;          // マスタのプラン
  eplan: CompPlan;         // override 反映後（base/honBack/jonaiBack/dohanBack を上書き可）
  hasOv: boolean;          // override があるか

  // 時給・基本給
  wage: number;            // 加重平均時給（§0.1）
  timePay: number;         // 時給積み上げ（round(Σ日時給×hours)）
  wHours: number;          // 総労働時間（round(Σhours×10)/10）
  wbasis: Record<string,number>; // {売上:n, ポイント:n, 保証:n} 採用日数の内訳
  wdays: Array<{d,sales,pts,hours,hourly,basis}>; // 日次内訳（明細表示用）

  // バック
  honBack: number;         // hon × eplan.honBack
  jonaiBack: number;       // jonai × eplan.jonaiBack
  dohanBack: number;       // dohan × eplan.dohanBack
  drinkBack: number;       // 商品バック集計（drink）※後述
  champBack: number;       // 商品バック集計（champ）
  bottleBack: number;      // 商品バック集計（bottle）
  sRate: number;           // 売上バック率（uS）
  salesBack: number;       // round(sales × sRate)
  cbacks: Array<{id,name,basis,amount,met,cond}>; // 自由設計バック（Vy）
  customTotal: number;     // Σ cbacks.amount

  // 総支給
  gross: number;           // timePay + honBack + jonaiBack + dohanBack
                           //   + drinkBack + champBack + bottleBack + salesBack + customTotal

  // 控除
  fixedDed: number;        // 控除マスタ：per=day→amount×days / per=rate→round(sales×amount/100) / per=month→amount
  fine: number;            // absentN×fineAbsent + lateN×fineLate
  withholding: number;     // §0.3
  arDeduct: number;        // 売掛の給与天引き（deducted && deductFrom===cast の合算）
  advanceDeduct: number;   // 前借り天引き（castId 一致の合算）
  okuriDeduct: number;     // 送り実費天引き（castId 一致の合算）
  normPenalty: number;     // ノルマ未達（§後述）

  // 差引支給
  net: number;             // gross − fixedDed − fine − withholding
                           //   − arDeduct − advanceDeduct − okuriDeduct − normPenalty

  // メタ
  lateN: number; absentN: number; // 打刻照合で算出（late/absent 回数）
}
```

---

## 2. 各バックの正確な計算式（TODO 2）

### 2.1 指名系バック
- `honBack = hon（本指名本数） × eplan.honBack（円/本）`
- `jonaiBack = jonai × eplan.jonaiBack`
- `dohanBack = dohan × eplan.dohanBack`
- override があれば eplan（プラン×キャスト上書き）を優先。

### 2.2 商品バック（drink/champ/bottle）
モックは2モード：
- **rate モード**：`round(product.price × product.rate/100) × 数量`
- **unit4 モード**：`product.unit4[指名種別] × 数量`（指名種別＝hon/jonai/dohan/free で単価が違う）
モックの `te` では商品バックは**事前集計済みの `G1[cast]`（`{drink,champ,bottle}`）から読む**。会計時に指名キャストへ配分され accumulate される構造（`vS` はマスタ率での理論値計算用ヘルパー）。
→ 本番：会計確定（F1b）時に check_lines の商品を指名キャストへ配分し、期間集計を給与入力に渡す。

### 2.3 売上バック（率が売上帯でスライド）
`uS(sales)`：
```
sales >= 1,500,000 → 0.10
sales >=   800,000 → 0.07
sales >=   400,000 → 0.05
その他             → 0.03
```
`salesBack = round(sales × uS(sales))`。※この率テーブルはモックのハードコード。本番は店設定化を検討。

### 2.4 自由設計バック（cbacks / `Vy`）
バック種別マスタ `mm` の各エントリ：
- `basis`：hon/jonai/dohan/days/sales/pt/champCnt/bottleCnt/flat のいずれか
- `cond`（任意）：`{metric, min}` 達成条件。未達なら amount=0（met=false）
- 金額：`basis==='sales'` → `round(sales × value/100)` ／ `basis==='flat'` → `value` ／ その他 → `metric値 × value`
- pt = 本指名商品pt（`Ci`＝champ×10 + tower×30 等、`honPt` 由来）

---

## 3. ノルマ未達ペナルティ（`penalty_config` 相当 `ot`）

```
if (penalty.on) {
  if (norm.days  > 0 && days  < norm.days)  penalty += daysFlat  + (norm.days  − days ) × daysPer
  if (norm.dohan > 0 && dohan < norm.dohan) penalty += dohanFlat + (norm.dohan − dohan) × dohanPer
}
```
`norm`＝キャスト×期間のノルマ（`ut[cast]` = `{days, dohan}`）。達成で 0。

---

## 4. 罰金（遅刻・当欠）と打刻照合

- `fine = absentN × fineAbsent + lateN × fineLate`（デフォルト fineAbsent=10000, fineLate=3000）。
- `lateN/absentN` は**確定シフトと打刻の照合**で算出（モック `lx`/`vp`）：
  - 打刻 in が無い出勤予定日 → absent
  - 打刻 in − シフト start > 10分 → late
- ★本番：punches（append-only）× shifts の照合を給与前に確定させ、その回数を payOf 入力に渡す（payOf 自体は回数を受け取る純関数）。

---

## 5. 純関数化の境界（重要・BANZEN 教訓の適用）

モックの `te` は React state（`K`/`Li`/`ut`/`ot`/`zu`/`G1`/`vn`/`qi`/`Ei`/`N` 等）を直接読む。**本番 payOf は DB を知らない純関数**にするため、以下を**入力 object にマッピングして渡す**：

```ts
type PayInput = {
  cast: { hon, jonai, dohan, days, sales };      // 実績（集計済み）
  daily: Array<{d, hours, sales}>;               // 日次（実 punch＋実売上）
  plan: CompPlan;                                // マスタ
  override?: Partial<CompPlan>;                  // cast_plan.overrides_json
  productBack: { drink, champ, bottle };         // 会計から集計済み
  pointProducts: number;                          // 本指名商品pt（Ci 相当）
  customBackDefs: BackDef[];                      // バック種別マスタ
  deductions: Deduction[];                        // 控除マスタ
  penalty: PenaltyConfig;                         // 罰金・ノルマ設定
  norm: { days, dohan };                         // キャスト×期間ノルマ
  fine: { absentN, lateN };                      // 打刻照合の結果（回数）
  arDeduct: number; advanceDeduct: number; okuriDeduct: number; // 天引き残高（集計済み）
  taxMode: '委託'|'雇用';                        // cast_tax_profiles.mode
  hoursPerShift: number;                         // シミュレーター用
};
```

- **シミュレーター**（クライアント）と**給与確定**（サーバ）が同じ `payOf(input)` を呼ぶ。
- 確定はサーバが DB から実績を読んで input を組み、payOf 再計算→`payslips.breakdown_json` に凍結。クライアント送信値は使わない（BANZEN 会計と同じ改ざん耐性）。

---

## 6. verify:nox-pay のゴールデンケース（回帰テスト固定値）

モックのシードから固定回帰値を作る。玲奈（cast id=1）：
- 実績：days=22, hon=48, jonai=30, dohan=12, sales=1,850,000
- プラン p_hi（base=5000, honBack=4000, jonaiBack=1500, dohanBack=4000, salesSlide=[80k→4000,150k→5500,250k→7000], pointSlide=[5→4000,10→5500,16→7000]）
- これで `wage`（加重平均時給）・`gross`・`net` を算出し、**その値を verify のゴールデンに固定**（設計書 §6 が言及した「玲奈ケース」の具体化）。
- ★実装時に pay.ts 移植直後の出力を1回スナップショットして固定する運用（BANZEN verify と同じ）。

**【F0c 実装時の確定（2026-07-02）】ゴールデン値と本指名商品pt の関係**：
1. **正は §0.1 の式（本指名商品pt 込み）＝モック live 実装（`Py`・Ci[玲奈]=110pt）＝ `lib/nox/pay.ts` 実装。**
2. 従来記載の「加重¥5,170・総110.1h・売上0/pt7/保証15」は**本指名商品pt 除外時（pointProducts=0）の値**（SPEC の数値は pt 導入前の計算と判明。モック生コード実行で確認済み）。この値は verify:nox-pay **T1a** の回帰として維持する。
3. live 込みの回帰値は **wage 5931・110.1h・売上0/pt18/保証4・gross 1,387,150・net 1,187,753**＝verify:nox-pay **T1b** に固定。

その他のケース（設計書 §6 の網羅要件）：
- 源泉：委託時 `round((gross−5000×days)×0.1021)` ／ 雇用時 0
- ノルマ：未達時のみ加算・達成で 0
- 自由バック：cond 未達で 0・達成で加算
- 商品バック：rate と unit4 の両モード
- net：全項目の差引一致
- 凍結：確定後にマスタ変更しても breakdown_json 不変
- シミュレーター一致：追加出勤の係数 (1−源泉率) 込みで payOf と一致

---

## 7. 本番実装で「モックと変える」判断が要る点（相談役で決定）

| 論点 | モックの実装 | 本番の判断 |
|---|---|---|
| 源泉の日数 | 出勤日数 | 暦日数か出勤日数か → **税理士** |
| 二重控除ガード | 無し（両取り） | 送り代 vs 送り実費の重複制御を**新規実装**するか |
| 売上バック率テーブル | ハードコード（3/5/7/10%） | 店設定化するか |
| シミュレーター係数 | 0.8979 固定 | `1 − 源泉率` として実装（雇用は 1.0） |
| 雇用（給与）の源泉・社保 | 未計算（0） | F2 で**社労士**確認して実装 |
| 丸め | Math.round | floor か → **税理士**（確定側で集約差替） |

**いずれも AI 出力は補助。源泉・控除・最低賃金の最終判断は税理士/社労士。**（F2 ゲート）
