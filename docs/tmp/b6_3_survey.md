# B6 ③ 着手前調査（2026-09-11 14:38〜 JST・読取のみ・HEAD a4caf13・ahead 4・origin/main e5f40ba）

対象＝B6-10 ③「指名・出勤・商品売上」の 4 指標（B6-5／B6-7／B6-8）。何も変更していない。

## 2. 取得経路

| 指標 | 経路 | 期間引数／絞り | 既存画面での表示 | 粒度 |
|---|---|---|---|---|
| a. 指名（店合計） | RPC `get_store_nom_counts(p_store_id uuid, p_from date, p_to date)` → `(hon_count, jonai_count, dohan_count)` int（0054）。check_nominations × checks（closed・cutoff 窓・**checks.nom_type** で分類）を店集計。owner 全店／他は自店・92 日 guard | from／to（biz_date・月初〜月末で 1 回） | month-report `:98` のみ（前半／後半の「指名」＝hon＋jonai）。analytics 未結線 | 店×期間の 3 値 |
| b. 指名（ランキング） | RPC `get_cast_ranking(p_store_id, p_period text)` → cast 別 `hon_count／jonai_count／dohan_count`（**同じ nom_counts CTE を cast で group by**・`ca.is_active` の cast のみ）。analytics `:1073-1104`（表・`:1091-1093` が 3 列）。合算は現行なし（`:423` selTotalNom は選択 cast 1 名分） | period（月固定） | analytics 指名件数ランキング／dashboard 本指名（今月） | cast×月 |
| （参考）売上貢献行の 本／場内／同伴 | `get_cast_sales`→`cast_sales_aggregate`（0124）の `hon／jonai／dohan`＝**nom_kind・distinct check**（`:1059` 本{r.hon}…） | from／to | analytics 売上貢献ランキング | cast×月 |
| c. 出勤実績日数 | 表 `attendance`（0008: org_id／store_id／cast_id／date／status 5 値 shukkin／dohan／late／off／absent・unique(cast_id,date)・upsert＝`attendance_set`（manager）／`attendance_set_self`（cast＝late／absent のみ））。直 SELECT・RLS org∧(owner∨自店)∧cast 本人 | date 範囲（`gte/lte`）＋store_id | analytics キャスト詳細 attDays（`:403-409`・選択 cast 1 名・PRESENT＝{shukkin,dohan,late}）／dashboard 本日の出勤（`:40,128`・同 PRESENT）／shift-board todayCounts（`:761-777`） | 店×月の**人日**（cast×date 行の PRESENT 数） |
| d. 集中度 | 按分売上＝`get_cast_sales(p_store_id, p_from, p_to)`→`cast_sales_aggregate` 行（cast_id／biz_date／**sales＝check_group_due の ratio_weight 最大剰余按分**）。analytics は `sales` state（`:171`）→ `salesRanking`（`:431-438` cast 合算・降順）→ `salesRankTotal`（`:440`）→ 行の `share`（`:1051`＝小数 1 桁 %） | from／to（月初〜月末） | analytics 売上貢献ランキング（順位・名前・¥・構成 %・報酬率） | cast×月（**再利用可＝新規読取 0**） |
| e. 商品売上（明細）／時間料金 | RPC `store_category_aggregate(p_store_id, p_from, p_to)` → `(biz_date, kind, fee_kind, amount＝Σcheck_lines.line_total, line_count)`（closed 伝票の明細）→ `sumCategories`（category-map.ts）: **time**＝kind time／set（＋charge／custom の fee_kind set／extension／vip_charge）、**drink／champ／bottle**、other＝指名料等、discount 別掲。analytics `catSums`（`:483`）→ 売上カテゴリ節（`:746-783`） | from／to | analytics 売上カテゴリ（5 分類・ラベル time＝「セット・延長」） | 店×月（**再利用可＝新規読取 0**） |

### a と b の関係（B6-5 の実装形）

- `get_store_nom_counts` は `get_cast_ranking` の nom_counts CTE から `group by cast_id` を外したもの＝**分類基準は同一（checks.nom_type・cutoff 窓・closed）**。差が出る要因は 1 つ＝ranking は `casts.is_active` の cast のみ（退店 cast の指名が落ちる）。
- 真に別基準なのは売上貢献行の 本／場内／同伴（`cast_sales_aggregate`＝nom_kind・distinct check）。
- **混ぜない実装形**: 店合計は RPC の 3 値をそのまま出す（ランキング行を合算しない・売上貢献行の hon も足さない）。ラベルは「指名（店合計）」。ランキング節は現状維持（「指名（ランキング）」の注記文を追加するだけ）。合算値は画面に出さない＝B6-5「同じ KPI 枠に両方を出さない」。

### c の「実績」判定（現行コードの語彙）

- 出勤扱い＝`status ∈ {shukkin, dohan, late}`（PRESENT・analytics／dashboard で同一定義・**同じ Set が 2 画面に直書き**）。off（休み）・absent（当欠）は除外。
- attendance に「キャンセル」状態は無い（off が休み）。シフトの planned／confirmed／proposed は `shifts` 側で attendance と独立＝**予定は数えない**（B6-7 どおり）。
- 打刻（punches）は shift-board の当日速報の近似（記録なし∧打刻あり→出勤扱い）にのみ使用＝月次の日数には使わない（attendance の記録が正）。
- 月次の店集計は現行なし（analytics は選択 cast 1 名・dashboard は当日）→ **attendance を store_id＋date 範囲で 1 SELECT**（既存 attDays と同じ表・同じ RLS・period 差し替え）。cast 別に出さず人日の合計と PRESENT の cast 数（distinct cast_id）を出せる。

### e の「現行の売上 KPI」との関係

- KPI 売上（締め済み）＝daily_reports の cash＋card_gross＋uri＋other（**決済ベース・丸め後・サ料込**）。明細 Σ（sumCategories.total＝サ料前・丸め前）とは基準が違い非一致（A10 既注記 `:696-700`）。
- したがって KPI 売上は「商品売上（明細）＋時間料金」に**分解できない合算**。B6 ③ の 2 値は明細側の catSums から出し、KPI 売上とは別枠・別注記（「明細ベース・値引き別掲・サ料前」）にする。
- 商品売上（明細）＝cats.drink＋champ＋bottle（A38 の近似定義）／時間料金＝cats.time。ラベルは B6-8 どおり「商品売上（明細）」「時間料金」（既存カテゴリ節の「セット・延長」ラベルは触らない＝verify:nox-category-map 21 本の対象）。

## 3. B6-1 境界判定＝**4/4 取得可**

- a: 既存 RPC の from／to を月初〜月末で 1 回（前月比は前月窓でもう 1 回・92 日 guard 内）。analytics 初結線だが RPC 不変。
- b: 既存 `ranking` state の再利用（合算は出さない）。
- c: 既存表 attendance の直 SELECT を store×date 範囲へ広げるだけ（新規 SELECT 1・RLS 同一）。
- d: 既存 `salesRanking`／`salesRankTotal` の再形（新規読取 0）。
- e: 既存 `catSums` の再形（新規読取 0）。
- RPC 変更・mig・凍結表なし。金額の再計算なし（按分・明細 Σ は既存 RPC の出力を足すだけ）。

## 4. B6-2 判定＝**新規露出なし**

- 集中度＝上位 3 名の按分売上 ÷ 総按分売上（%）。分子・分母とも既存ランキングが owner／manager に出している値（各行の ¥ と構成 %）の合計＝新しい cast 個人の金額・順位は出ない。3 名の名前を添えても順位 1〜3 は既に表示済み。
- 指名（店合計）・出勤（人日）は店集計。出勤の distinct cast 数も個人特定なし。
- 差分＝0（既存の可視範囲の内側）。

## 5. 板の節と候補位置（現行・行番号は a4caf13）

view 切替（`:683 summary／:838 sales／:1037 casts／:1185 customers`）。節＝日別売上 688／売上内訳 730／売上カテゴリ 746／注目ポイント 784／売上推移 842／決済構成 918／決済別実績 956／時間帯別 972／曜日別・時間帯別 998／**売上貢献ランキング 1041／指名件数ランキング 1073／主要客リスト 1105**／客層 1190／初来店 1218／月間売上目標 1262。

候補:
- **casts ビューの先頭（`:1041` 売上貢献の前）**に小 KPI 3 枚＝指名（店合計・本／場内／同伴）・集中度（上位 3 名 占有 %）・出勤実績（人日・出勤 cast 数）。既存 `.nox-kpis` 部品を流用（B6-11 の差分行も同型で付けられる）。
- **sales ビューの売上カテゴリ節（`:746`）の直後**に 2 値＝商品売上（明細）・時間料金（catSums の再形・注記「明細ベース・KPI 売上とは基準が別」）。
- 新ページなし・dashboard／month-report 不触（B6-10）。

## 6. 純関数・suite の切り出し候補（DB 非依存・走数外）

`lib/nox/analytics/cast-stats.ts`（仮）:
- `top3ShareOf(rows: {sales:number}[]) → { pct: number|null, n: number }`＝上位 3 名（降順・3 行未満はある分）Σ ÷ 総和・小数 1 桁 %・総和 0 → null。
- `presentDaysOf(rows: {status:string, cast_id:string}[]) → { days: number, casts: number }`＝PRESENT の人日と distinct cast。**PRESENT の Set をここへ集約**（analytics／dashboard の直書き 2 箇所を参照に付け替えるかは裁定＝B6-4 同型）。
- `productTimeOf(sums: CategorySums) → { product: number, time: number }`＝drink＋champ＋bottle／time。
- `nomStoreOf(row) → { hon, jonai, dohan, total }`＝RPC 1 行の整形（null 行→「—」）。
- suite `verify:nox-cast-stats`（f0 44 本目・8〜12 本）: 3 行未満／同率／総和 0→null／丸め・PRESENT に off／absent を含めない・空→0／商品と時間の和が total−other に一致・nom 行 null。

## 7. 保存

本書＝`docs/tmp/b6_3_survey.md`（未追跡・コミットしない）。B6 ③ の実装ブロック（client 1 本・suite 1 本）は Agoora の裁定（ラベル・配置・PRESENT 集約の可否）後。
