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

#### 2.2.1 会計時分配の端数規則（F1b 確定・2026-07-02・モック `zx` から抽出）

- **金額ではなく数量を分配する**（最大剰余法）。伝票の指名 n 人（重み w_i・フリー卓は全員 1）に対し：
  1. 床: `k_i = floor(qty × w_i / Σw)`
  2. 残数 `qty − Σk_i` を配布。**タイブレーク（決定的規則・TS/SQL 同一実装）**：
     整数剰余 `r_i = (qty × w_i) mod Σw` の**降順**、同値は指名 **position 昇順**。
     ※モックは浮動小数の小数部を不安定 sort しており同値時の挙動が未定義＝本規則で決定化。
  3. `バック額_i = バック単価 × k_i`（単価は §2.2 と同一：unit4[伝票nom_type] ／ rate は round(price×rate/100)）。
- **Σk_i = qty が構造的に成立**するため、Σ分配額 = 単価×qty（金額側に端数が発生しない）。verify で恒等 assert。
- **本指名商品pt（honPt×k_i）は伝票 nom_type='hon' のときのみ加算**（場内/同伴/フリー伝票では pt なし）。
- 正本は `lib/nox/pay.ts` の純関数 `allocateQty(qty, weights): number[]`。DB（check_close 内の分配）は同一規則で実装し、
  会計ゴールデン（verify）で TS/DB の一致を assert する。
- 分配単価は **check_lines.back_snapshot**（add_line 時点コピー）から読む＝close 時点のマスタ変更に影響されない。

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

### §4.1 実装確定追記：確定規則（モック `vp`/`lx`/`ux` 実測・2026-07-03・台帳 #20）

モック生コード（line 26 の `Zu`/`tx`/`vp`/`lx`/`hp`/`sx`/`ux`）を逐語抽出したハーネスで実測した確定規則。初版の2行（in 無し→absent／in−start>10分→late）に優先する。

- 判定対象＝**確定シフトが存在する営業日のみ**。shift 無し punch 有りの日は不算入（遅刻にも欠勤にもならない）。
- absent＝in 無し（**out の有無は不問**）。
- late＝`in − start > 10`（分・整数・**strict**）。h=10 ちょうどはセーフ・h=11 から late。`min` は超過素値（10 を引かない。例: 20:00 シフトに 20:44 着→min=44）。早出（負値）は ok。遅刻に上限なし（どれだけ遅くても late であり absent に転化しない）。
- `lx` 集計＝期間内の営業日を走査して late/absent を数える（ok は数えない）→ `fine = absentN×fineAbsent + lateN×fineLate`。
- 退勤側 `ux`＝noout／early（`close − out > 30` strict）／over（`out − close > 90` strict）／ok。−30/＋90 ちょうどは ok。**罰金に非接続・表示専用**（モックの `fa` は `lx` のみ参照）。
- 時刻単位＝分（'HH:MM' 粒度・秒なし）。in 側 `Zu` は「翌」非対応（深夜着は負差で ok に化ける fail-open＝モックの穴・§4.2 S4 で不採用）。out 側 `hp` のみ「翌」接頭辞＋正午ヒューリスティック（hour<12→+1440）。
- **`tx`/`sx` はデモデータ生成器＝翻訳対象外**。`ml[u][d].in || tx(u,d)` の `|| tx(u,d)` を逐語訳すると「欠勤日に in を捏造する」バグになる（実測で捏造動作を確認済み）。
- モックの打刻データは日次単一ペア `{in, out}`・UI は「in 未→出勤ボタンのみ／in 済→退勤ボタンのみ／両方済→ボタン消滅」の一方向状態機械。**in-in・孤立 out はモック上表現不能＝沈黙**（解決規則は §4.2 で NOX が確定）。

### §4.2 実装確定追記：NOX 確定（沈黙部の裁定・2026-07-03・台帳 #20 クローズ）

モックに分岐が存在しない箇所（S1〜S8）の裁定結果。punches はイベント列（append-only・timestamptz）であるため、日次ペアへの解決規則が必要になる。

- **S1 in-in**：最初の in を採用・後続 in は無視（イベントは全記録・anomaly 'in_in'）。後打ちで遅刻を消せない改ざん耐性＝punches 盲目記録の3層モデルと整合。
- **S2 孤立 out**：absent 維持（out を出勤の証拠と認めない）＋ anomaly 'orphan_out' で店側 UI に要確認表示。救済は F3 fix_requests（台帳 #22）の管轄。
- **S3 attendance（判断層）の参加**：**raw/final 二段**。raw＝shift×punch のみ（モック忠実）を常に算出し、attendance に明示 status がある日はそれを final として優先。raw≠final の日は anomaly 'attendance_conflict'＋audit 痕跡。**status→final 対応表（必須記載）**：

  | attendance.status | final | 備考 |
  |---|---|---|
  | shukkin / dohan | ok | punch 由来の late を打ち消し・conflict は anomaly＋audit 痕跡 |
  | late | late | min は punch 由来。punch 無しなら min=0（回数罰金のみ） |
  | absent | absent | punch があっても absent |
  | off | no_shift | 罰金不算入（店都合取り消し） |
  | （無し） | raw のまま | — |

  **適用条件（裁定追補 2026-07-03）**：S3 対応表は**確定シフトが存在する営業日のみ適用**。shift 無しの attendance は final に昇格せず final=no_shift＋anomaly 'attendance_conflict'（罰金は shift_set による予定の存在が前提・救済は F3 fix_requests）。

- **S4 深夜 in の遅刻判定**：比較は shift-time.ts の 0-47 域で行う（in の営業日帰属は biz-date.ts・cutoff。01:30 着＝25:30 として start と比較）。モックの fail-open（Zu 翌非対応で深夜着が ok 化・「翌」付きは NaN で ok 化）は**不採用**。
- **S5 集計窓**：payroll_runs の給与期間で走査。モックの `be`＝表示中の週7日（週切替で罰金回数が変わる quirk）は**不採用**。
- **S6 分丸め**：timestamptz→分未満切り捨て（floor to minute）で 'HH:MM' に落としてから突合（cast 有利側・秒差の罰金争いを作らない）。
- **S7 閾値の店設定化**：late_grace_min=10／early_grace_min=30／over_grace_min=90 を penalty_config（F2a マスタ・DB 化は F2a mig）に持たせる。既定値でモック忠実。punch-match.ts は config 引数に既定値を持つ。
- **S8 early/over/noout の金銭化**：F2 ではしない（モック忠実・表示/anomaly まで）。要否は実店舗ヒアリング案件＝**台帳 #31**。
- **配置**：`lib/nox/punch-match.ts`（DB を知らない純関数・pay.ts と同じ案1）。出力＝lateN/absentN（payOf の fine 入力）＋日次 DayResolution[]（raw/final/anomalies＝F3 fix_requests・店側 UI 警告の土台）。ゴールデン＝実測21ケース＋S3 対応表5分岐を verify に固定。

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
