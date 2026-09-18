# B6 分析 着手前調査（2026-09-11 第 2 次・読取のみ・HEAD c580311・ahead 0・origin/main c580311）

前提: 第 1 次（2026-09-10 18:43・HEAD b77961f・別チャット）は本書末尾の **付録 A** に逐語保持。第 2 次＝Agoora 指示の 5 観点（現状棚卸し／データ源と凍結値／既存集計の再利用／制約／候補指標表）を B3〜B5 の型で追加。
方法＝grep／git／cat のみ（BANZEN ゲート中＝verify・f0・node 起動なし・DB 直読なし）。RPC 本文は 9/10 の `docs/tmp/b6_dump.sql`（pg_get_functiondef 逐語・proof orgs=3）を参照。
B6 の定義（第 1 次 §1 踏襲）＝対応表 §A（A1〜A60）の「準備中」22 行のうち **mig 0・RPC 本文／引数不変・新規読取は既存経路の再呼び**で写せる行を UI に乗せる。金額計算は不触（golden 6 値不変）。

## 1. 現状棚卸し（/analytics・route と page・権限）

| 項目 | 実測（analytics-board.tsx 1,225 行・page.tsx 30 行） |
|---|---|
| route→page | `app/(manage)/analytics/page.tsx`（server）→ `analytics-board.tsx`（client）。`dynamic = "force-dynamic"` |
| 到達制御 | page: role なし→/login・owner／manager 以外→/register（payroll 同型）。cast は layout で /mine。ナビ導線＝dashboard の shortcuts（owner／manager のみ「分析」`dashboard/page.tsx:50`） |
| props | stores（RLS 越し＝owner 全店／manager 自店）・casts（全 cast・is_active 不問・photo_updated_at）・isOwner（全店合算トグルの表示ゲート） |
| 店切替 | `<select>` stores（`:113`）＋ owner∧複数店のみ「全店舗」チェック（`:545-547`）。allStores は **hourly／category／cohort の 3 RPC だけ** p_store_id null＝org 合算（`:284`）。KPI／日報系／ランキング／目標は選択店のまま（裁定 E8-6-4） |
| 期間切替 | nox-seg 今月／先月＋`<input type="month">`（period YYYY-MM・`:115`）。直近 30 日（A4）なし。前月比較は daily_reports の前月窓を常時取得（`:194`・prevDaily） |
| ビュー | nox-seg「サマリー／売上／キャスト／顧客」（`:132` view）＋売上推移 trendMode「日別／前月重ね／3ヶ月／6ヶ月」（`:134`） |
| KPI 帯（5 枚・全ビュー共通） | 売上（締め済み）／組数／組単価／人件費率（概算）／月間目標（`:569-596`）。売上＝daily_reports の salesOf（cash＋card_gross＋uri＋other・締め済みのみ）。人件費＝finalized／paid run の payslips.breakdown_json.pay.gross Σ（`:214-232`）・draft は「未確定」 |
| 節（h3・16） | 日別売上（`:628`）／売上内訳（`:670`）／売上カテゴリ 5 分類（`:686`・全店可）／注目ポイント（`:724`）／売上推移（`:782`）／決済構成（`:858`・4 分類＝売掛独立）／決済別実績（`:896`）／時間帯別売上（`:912`・全店可）／曜日別・時間帯別ヒートマップ 7×24（`:938`・全店可）／売上貢献ランキング 按分（`:981`）／指名件数ランキング（`:1015`）／主要客リスト（`:1047`）／客層の内訳（`:1132`）／初来店月ごとの再来店 6 ヶ月（`:1160`・全店可）／月間売上目標（`:1204`・設定モーダル） |
| ランキングの金額露出 | 売上貢献行＝按分売上 ¥・構成 %・**報酬率（確定給与 gross ÷ 按分売上・確定月のみ）**＝cast 個人の給与由来の値を owner／manager 同一に表示（`:990-1004`・castGross `:140`）。CSV（`:491-492`）にも報酬率列 |
| 出力 | CSV 2 本（月次・ランキング＝client 生成）。印刷隔離なし。ボタンは 242 適用後＝補助（青枠）＝`t.btnGhost` |
| owner／manager の可視範囲 | 表示上の分岐は「全店舗」トグルのみ。真の防御は RPC（8 本すべて owner 全店 or 自店・staff forbidden）＋RLS（下表）。manager は自店の全指標・全 cast の按分売上／報酬率を見る＝**B5-5（給与は owner／manager のみ）と同じ境界** |

## 2. データ源の候補と凍結値の所在（表・境界列・index・RLS）

読取専用の実測（migrations の create table／create index／最新 create policy）。「集計に使える index」＝店×期間で絞る走査に効くもの。**mig は手貼りしない＝index の追加は B6 で提案するだけ**。

| 表（作成 mig） | org／store 境界列 | 期間列 | 凍結／生 | 集計に使える index（実測） | RLS SELECT（最新） | B6 用途 |
|---|---|---|---|---|---|---|
| payslips（0016） | org_id・store_id・cast_id・run_id | period（YYYY-MM）| **凍結**（finalize 時 breakdown_json・net） | (run_id,cast_id) unique／cast_id／org_id。**store×period の index なし＝run_id 経由が正**（現行も payroll_runs→run_id で読む） | org∧(owner∨自店)∧staff 不可∧(cast は本人) | 人件費（A19）・報酬率（既存）。cast 別は PII 境界（§4） |
| payroll_runs（0016） | org_id・store_id | period | 状態（draft／finalized／paid）| org_id のみ（store×period の unique は create table 内の可能性＝**live DDL 照合が要る**・B5 一覧は eq(store,period) で読めている） | org∧(owner∨自店)∧owner／manager のみ | run 解決（凍結値の入口）・支払済み化の状態（#82 と同じ status=paid 判定） |
| payment_records（0021） | org_id・store_id・cast_id・run_id | paid_at（date） | 生（記録） | (run_id,cast_id)／cast_id／org_id／idem unique | org∧(owner∨自店)∧(cast は本人) | 支払進捗（B5 で表示済）＝B6 では**候補外**（分析ではなく給与運用） |
| checks（0006＋拡張） | org_id・store_id・seat_id・customer_id | started_at／closed_at（biz_date は cutoff 起点で導出） | 生（伝票）。status open／closed／void | (store_id,status)／(store_id,started_at)／org_id | org∧(owner∨自店)∧（staff can_register／cast は名簿行 0039） | T4 3 本・ranking・get_cast_sales の母体＝**直読しない**（RPC 経由のみ） |
| check_lines（0006＋拡張） | org_id・store_id・check_id・cast_id | （checks 経由） | 生。kind 7 種＋fee_kind・time_auto・category_id | (check_id,sort_order)／cast_id／org_id／idem partial | 同上 | category_aggregate の母体＝直読しない |
| payments（0006） | org_id・store_id・check_id | paid_at | 生。method・pay_group | (check_id,pay_group)／org_id | checks 同型 | 決済構成は **daily_reports の凍結列**で出しており payments 直読は report-board のみ＝B6 でも直読しない |
| check_nominations（0006＋ended_at） | org_id・store_id・check_id・cast_id | （checks 経由） | 生。nom_kind（名簿行）| (check_id,position)／org_id | 同上 | ranking／nom_counts の母体＝直読しない（A12: nom_type と nom_kind の 2 系統） |
| check_cast_backs（0006） | org_id・store_id・check_id・cast_id | created_at | 生（バック額＝販売額ではない・A11） | (cast_id,created_at)／org_id | 同上 | **候補外**（販売実績の器＝第 2 期） |
| daily_reports（0010） | org_id・store_id | biz_date | **凍結**（締め時 Σ・cash／card_gross／card_tax／uri／other／drink_sales／slips／guests・closed_at） | (store_id,biz_date)／org_id | org∧(owner∨自店)∧cast 不可（staff 可） | KPI 4 枚・日別・推移・決済・A4／A6／A28（曜日）／A33 の主材料 |
| shifts（0008＋拡張） | org_id・store_id・cast_id | date | 生（予定・status planned／confirmed・source・period_id） | (store_id,date)／(cast_id,date)／org_id／period_id partial | org∧(owner∨自店)∧(cast は本人) | A20／A33 概算人件費（forecastDay 入力） |
| attendance（0008） | org_id・store_id・cast_id | date | 生（状態 5 値） | (store_id,date)／org_id | 同上 | A39 出勤キャスト数・A43 出勤平均（現行は選択 cast 1 名の attDays `:142`） |
| punches（0008） | org_id・store_id・cast_id | punched_at | 生 | (cast_id,punched_at)／(store_id,punched_at)／org_id | 同上 | 候補外（B4 の領域） |
| receivables（0006＋拡張） | org_id・store_id・cast_id・check_id・customer_id | （status・due） | 生（残高） | (store_id,status)／(cast_id,status)／org_id | org∧(owner∨自店)∧(owner／manager／staff can_register) | 売掛残高（month-report `:84`・analytics `:205`）＝既存 |
| ar_collections（0055） | org_id・store_id・cast_id・customer_id | biz_date | 生（回収記録） | (store_id,biz_date)／receivable_id／org_id | 同上 | 回収額（analytics `:203`）＝既存 |
| store_sales_targets（0096） | org_id・store_id | period | 設定値 | org_id のみ（store×period unique は t4(13) で upsert 実証） | org∧(owner∨自店)∧owner／manager | 目標進捗（既存）・目標変更履歴は audit_logs（owner） |
| customers（0023＋grade） | org_id・store_id・cast_id | — | 生（属性） | (org_id,store_id)／cast_id | org∧(owner∨自店)∧(owner／manager／staff can_crm／cast 担当客) | customer_list_summary 経由のみ（A54〜A58）。**顧客別売上 ¥ は A52 論点＝不触** |

凍結値の所在（まとめ）: **payslips（給与）と daily_reports（日報）の 2 表だけが凍結**。checks 系・nominations・attendance は生＝既存 RPC（cast_sales_aggregate／T4 3 本／ranking／nom_counts）が再集計する。B6 は「凍結 2 表の client 再形」と「既存 RPC の from／to を変えて再呼び」の 2 経路に限れば式を増やさない。

## 3. 既存の集計（RPC／純関数／画面）と B6 での再利用・二重計算

| 既存の数字 | 所在 | 元データ | 凍結／再計算 | B6 で再利用 | 二重計算の懸念 |
|---|---|---|---|---|---|
| 売上（締め済み）＝cash＋card_gross＋uri＋other | analytics `:90-91` salesOf／dashboard「今月売上（締め済み日報）」／month-report「売上（通期）」 | daily_reports | 凍結の再形 | **可**（同式） | ★同じ式が **3 画面に直書き**。B6 で 4 箇所目を作らず `lib/nox/analytics/` の純関数（dailySum）へ寄せる候補（DB 非依存 suite で守れる） |
| 人件費（確定 gross Σ）・人件費率 | analytics `:214-232`／month-report `:105-120` | payroll_runs（finalized／paid）→payslips.breakdown_json.pay.gross | 凍結の再形 | **可**（A19 前月比 pt＝2 期分を同式で） | ★同式が **2 画面に直書き**（月報は isManagerUp ゲート付き）。list.ts の gross は **pay.gross＋Σextras（CSV 定義）＝定義が違う**ので ListKpi.gross を人件費に流用しない |
| ListKpi（runs／castCount／gross／net／paidCount／paidTotal／paidRuns） | `lib/nox/payroll/list.ts` sumListKpi（純関数・B5-8） | payslips・payment_records・payroll_runs | 凍結の Σ | 部分可（castCount＝対象者数、paidRuns＝支払済み run 数） | gross 定義差（上記）。分析の人件費は pay.gross 側に統一 |
| kpiOfDraftRows／sum4（給与 KPI 4 枚） | `lib/nox/payroll/ui-calc.ts`／payroll-board `:370` | draft rows／凍結 sum4 | 表示層合算 | 不可（draft は未確定＝分析に出さない・裁定④） | — |
| daily_report_aggregate（RPC・mig0010） | register／report／kiosk-register が当日速報に使用 | checks 系の生 | **再集計（締め前）** | 不可（A7＝分析は締め済みのみ。速報導線は Link 済） | 締め前の数字を分析に混ぜない |
| get_store_nom_counts（0054） | **未結線**（month-report `:98` のみ・前半／後半の shimei） | check_nominations（92 日 guard・owner 全店／他は自店） | 再集計（RPC 既存） | **可**（A21／A37・引数は from／to のみ） | A12: ranking（checks.nom_type）と nom_counts（nom_kind）の 2 系統＝**画面に並べるなら定義を明記**（ラベルで分ける・現行の按分 vs 件数と同じ流儀） |
| get_cast_ranking（0011／0016） | analytics 指名件数／dashboard 本指名（今月）／主要客の母数 | checks（closed）・nominations | 再集計 | 可（A25 集中度・A41 上位 3 名＝返り行の再形のみ） | 呼び方不変 |
| get_cast_sales→cast_sales_aggregate（0014／0124） | analytics 売上貢献／month-report top／**payroll collect 共用** | checks・check_lines | 再集計（**golden 直結**） | 再形のみ（引数 store／月初〜月末を**変えない**） | ★直近 30 日（A4）で from／to を変えて呼ぶと給与側の関数を別窓で叩く＝数値は正だが範囲 guard なし（第 1 次 §9-6）。A4 では**ランキングは月固定のまま据え置く**案が安全 |
| store_hourly／category／cohort（0096 T4） | analytics 時間帯／ヒートマップ／カテゴリ／コホート | checks・check_lines（cutoff 店別・92 日／13 ヶ月 guard） | 再集計（golden 外・t4 suite 前提） | **可**（A4 直近 30 日＝92 日内・A23 前月窓再呼び・A28 dow 和） | 全店合算と選択店の混在（E8-6-4） |
| sumCategories（category-map.ts） | analytics 売上カテゴリ 5 分類 | category_aggregate の返り行 | 純関数 | **可**（A23 比率・A29 KPI・A30 割引・A38 近似） | 定義（drink＋champ＋bottle＝商品）を注記 |
| customer_list_summary（0030） | analytics 客層／customers | customers・checks・receivables・bottle_keeps | 再集計（顧客） | 可（A55／A57／A58＝churn_tier・cast_id 未設定） | visits は全期間（A46 不可）・churn は current_date 基準（A56 不可） |
| forecastDay（labor-forecast.ts） | shift-board 予想人件費 | shifts×comp（payOf 経由） | 概算（生） | 条件付き（A20／A33 の「概算」列） | 確定人件費（凍結）と並べるなら「概算」ラベル必須 |
| period_bounds（RPC） | month-report `:49` | — | 期間境界 | 可（直近 30 日の from／to は client 算出でも可） | — |

## 4. 制約

- **PII（cast 個人の金額）**: 現行 /analytics は owner／manager に**同一の**按分売上・報酬率（payslips 由来）を出しており、manager は RLS（payslips＝自店・staff 不可）と RPC（get_cast_sales staff forbidden・cast 本人のみ）で自店に閉じている＝**B5-5「給与は owner／manager のみ」の境界と一致**。B6 で cast 別の給与由来指標を増やす場合も同境界（owner 全店／manager 自店・staff／cast には出さない）。cast 別「販売実績 ¥」（A11／A40／A42）は器がなく第 2 期。顧客別売上 ¥（A52）は不触。
- **feature_flag**: key 白名単は staff_shift／reopen_flow／qr_order／notify の 4 つ（0135 CHECK）。B6 は表示と導線のみ＝**新設不要**（B5-4 同型）。分析面を機能公開で隠す要件が出た時のみ mig（列 CHECK＋flag_set＋panel の 3 箇所）。
- **裁定120（semantic 状態色のみ）**: 「見るべき変化」「前月比 pt」「目標未達」の色は Danger／Warning／Success の 3 値のみ（金・青不使用）。判定は「基準を割っているか」で機械的に＝目標未達（進捗 < 経過日率）＝Warning・達成＝Success・前月比マイナス＝Neutral か Warning かは裁定要（数値の増減は「異常」ではない）。実査差異（cash diff）は日報側＝分析は触らない。
- **238／239／242 のボタン階層**: 直近 30 日＝(4) 切替（既存 nox-seg に 1 項目）／月報へ・ホームへ・顧客管理へ＝(3) リンク .nox-link／CSV・印刷・モーダルを開く＝(2) 補助＝青枠（242 で定義差替え済＝新規ボタンは `t.btnGhost`）／目標 保存＝(1) 実行 青塗り。曜日別テーブル・見るべき変化＝押せない表示。
- **凍結／再計算**: get_cast_sales の引数は不変（golden）。新指標は daily_reports・payslips の凍結値の client 再形か、T4／nom_counts の from／to 再呼びに限る。RPC 本文・引数の変更が要る行（A46／A48／A49／A51／A56）は B6 から外す。
- **範囲 guard**: hourly／category／nom_counts＝92 日・cohort＝13 ヶ月・get_cast_sales＝guard なし（性能側）。直近 30 日と前月比較（2 窓）は guard 内。3／6 ヶ月推移は daily_reports 直読のまま。
- **全店合算の混在（E8-6-4）**: allStores は 3 RPC のみ。B6 で「全店舗」を前面に出すなら KPI／日報系との混在注記が要る（第 1 次 §9-2）。
- **生文言**: `setErr("読み込みに失敗: " + error.message)`（`:171／264／360`）は raw を出す。期間を広げる B6 では bad range の写像を saveTarget（`:324`）同型で足す（#80 系の小物）。

## 5. 候補指標（12 本）

| # | 指標 | 対応表 | データ源（経路） | 凍結／再計算 | 権限 | 想定レーン | 備考・裁定要 |
|---|---|---|---|---|---|---|---|
| 1 | 直近 30 日（期間 seg 3 項目目） | A4 | daily_reports（biz_date 範囲）＋hourly／category の from／to（92 日内） | 凍結の再形＋T4 再集計 | owner／manager | client | ranking 2 RPC は p_period 月固定＝直近 30 日では**ランキング・主要客を月固定のまま据え置く**か非表示か（裁定要①） |
| 2 | 比較「前月／前年同月／なし」 | A6 | daily_reports 2 窓（前年同月は month-report `:83` 前例） | 凍結 | 同上 | client | 前月重ねは実装済＝seg 化して前年同月を足すだけ |
| 3 | 人件費率 前月比 pt | A19 | payroll_runs（finalized／paid）→payslips pay.gross Σ ×2 期 | 凍結 | owner／manager（payslips RLS 自店） | client＋純関数 | analytics／month-report の同式を `laborOf` 純関数へ寄せる（二重の解消・裁定要②） |
| 4 | 本指名／場内／同伴（店合計）＋前月比 | A21／A37 | get_store_nom_counts（0054・未結線・from／to） | 再集計（RPC 既存） | 同上 | client | ranking 合算（nom_type）と別系統＝ラベルで分ける（A12・裁定要③） |
| 5 | 見るべき変化・カテゴリ比率（前月比） | A23 | store_category_aggregate 前月窓再呼び→sumCategories | 再集計（T4）＋純関数 | 同上 | client＋DB 非依存 suite | 色＝裁定120（裁定要④） |
| 6 | 見るべき変化・曜日（曜日別テーブル） | A24／A28 | hourly 返り行→dow 和（純関数） | 再集計（T4）＋純関数 | 同上 | 同上 | ヒートマップの列和＝新規読取 0 |
| 7 | 見るべき変化・キャスト集中度＋偏り 本指名上位 3 名 | A25／A41 | get_cast_ranking 返り行の再形（上位 3 名の share） | 再集計（既存） | 同上 | client | 「集中度」の定義（上位 3 名 ÷ 総件数）は裁定要⑤ |
| 8 | 売上ビュー KPI＋割引・調整（前月比） | A29／A30 | catSums（sumCategories）当月＋前月窓 | 再集計（T4）＋純関数 | 同上 | client | #5 と同じ再呼びを共有 |
| 9 | 商品販売実績（店合計） | A38 | catSums drink＋champ＋bottle | 近似（定義明記） | 同上 | client | cast 別（A11）とは母数が別＝注記必須（裁定要⑥） |
| 10 | 出勤キャスト数／出勤平均 | A39／A43 | attendance（store_date idx・status in shukkin／dohan／late） | 生（状態） | 同上 | client | 現行は選択 cast 1 名（attDays）＝店集計へ拡張。定義（late を含むか）は裁定要⑦ |
| 11 | 日別実績テーブル（人件費率列） | A33 | daily_reports 行（日別バーの表形）＋人件費率列は器なし（月次）＝forecastDay 概算のみ | 凍結＋概算 | 同上 | client | 人件費率列は「概算」ラベルで出すか列なしか（裁定要⑧） |
| 12 | 「月報へ」「ホームへ」導線 | A34 | Link | — | 同上 | client | .nox-link（238） |

対象外（理由）: A11／A40／A42（販売実績の器＝第 2 期）・A44（PII ゲート待ち）・A46／A48／A49／A51（月内 distinct 顧客＝RPC 変更＝mig）・A56（churn の時点再現不可）・A26（リピート率の定義未確定）・A50（軽微だが RPC 変更）・A14／A36（注記文言＝実装は A15 の裁定次第）。

想定レーン: **client 3 本＋DB 非依存 suite 1 本・mig 0・RPC 変更 0**。
- B6-a 期間と比較（#1・#2・#12）＝seg 拡張・from／to 算出・前年同月。
- B6-b 見るべき変化と売上ビュー（#3・#5・#6・#8・#9・#11）＝純関数 4〜5 本（dailySum／laborOf／dowTable／deltaPt／catShare）＋verify:nox-analytics-calc（走数外・裁定229 型）。
- B6-c 指名と出勤（#4・#7・#10）＝nom_counts 結線・ranking 再形・attendance 店集計。
- f0 影響＝純関数 suite を f0 末尾へ連結するなら本数が動く（B5-8 同型・pin 更新を伴う）。連結しない（走数外のみ）なら pin 不変。

## 6. 裁定要点（B6 着手前・8 点）

1. **A4 直近 30 日と月固定 RPC**: ランキング・主要客（p_period）は月固定のまま据え置き（seg が直近 30 日でも「対象月＝当月」と注記）か、直近 30 日では非表示か。推奨＝据え置き＋注記（RPC 不変）。
2. **人件費式の共通化**: analytics／month-report の同式（pay.gross Σ・draft は未確定）を純関数へ寄せて 2 画面から呼ぶ（B6 内で month-report にも触る＝レーン拡張の可否）。推奨＝寄せる（DB 非依存 suite で守れる）。
3. **指名 2 系統の表示**: 店合計（nom_counts＝名簿行 nom_kind）とランキング合算（checks.nom_type）を同じ画面に置く場合のラベル。推奨＝店合計は「指名（店合計）」・ランキングは現行「指名件数」のまま。
4. **見るべき変化の色**: 裁定120 に従い、前月比の増減は Neutral（色なし）・目標未達＝Warning・基準割れ（例: 人件費率 > 設定閾値）だけ Danger。閾値は器がない＝当面 Neutral のみ。
5. **キャスト集中度の定義**: 上位 3 名の本指名件数 ÷ 総件数（%）。推奨＝この定義で固定（按分売上ではなく件数）。
6. **商品販売実績（店合計）の語**: catSums（drink＋champ＋bottle）を「商品売上（明細）」と呼び、cast 別「販売実績」（第 2 期）と語を分ける。
7. **出勤の定義**: attendance.status in (shukkin, dohan, late) を出勤扱い（B4 H31 と同じ語彙）。
8. **日別人件費率列**: 器なし＝列を出さない（推奨）。概算（forecastDay）を出すなら「概算」ラベルと裁定④の色規則。

## 7. 欠陥候補（番号のみ・未起票・修正しない）

1. 売上式（salesOf）と人件費式が analytics／dashboard／month-report に直書きで重複（第 2 次で確認・§3）。
2. `setErr` の raw 文言露出（第 1 次 §9-1 と同じ・B6 で bad range が出得る）。
3. 全店合算の 2 スコープ混在（第 1 次 §9-2）。
4. get_cast_sales に範囲 guard なし（第 1 次 §9-6）。
5. payroll_runs の store×period unique が index 一覧に出ない（create table 内の制約か未設定か＝live DDL 照合待ち。B5 は eq で 1 件を前提に読んでいる）。

## 8. 保存

本書＝`docs/tmp/b6_survey.md`（未追跡・コミットしない）。第 1 次（2026-09-10）は付録 A に逐語保持。B6 設計書（v1）は第 1 次 §1〜§9＋第 2 次 §1〜§7 を入力に相談役が起草。

---

# 付録 A: 第 1 次調査（2026-09-10 18:40〜・逐語保持・HEAD b77961f 時点）

# B6 分析 着手前調査（2026-09-10 18:40〜 JST・読取のみ・HEAD b77961f・ahead 27・origin/main 59a8f98）

方針（裁定案・未採番）: B6＝裁定125 の B 層最終。B3〜B5 と同型＝「A 層で作った分析面を店舗運用に乗せる」。金額計算は不触（golden 6 値不変）。
dump＝`docs/tmp/b6_dump.sql`（/analytics が呼ぶ RPC 8 本の pg_get_functiondef 逐語・23,633 B・proof orgs=3）。

## 1. 裁定125 の B 層本文（逐語）と第 2 期送りとの重なり

台帳「裁定125（2026-09-04）ローンチ範囲＝A層＋B層＋C層3件」の B 層原文:

> - **B層＝器あり・UI なし**（対応表 §6-16／§6-10 ほか）: cast_plan 適用履歴の表示（K34・期間化済み・読み取りのみ）／`ext_shimei_enabled`・
>   `dohan_auto_hon` の設定 UI（列あり・書込 RPC の有無で可否）／`shift_remove` の UI 露出（H30）／wish 一括承認（H19・ループ発行）／
>   会計後タイムライン（R57・audit_logs は owner 限定 RLS）。**既存 RPC の引数を増やす必要が出た項目は mig 領域＝B層から外す**。

→ B 層の原文 6 項目に **分析（A 系）は名指しされていない**。B3（レジ）・B4（シフト）・B5（給与）と同じ読み替え＝「対応表の A 系で『準備中』のうち器がある行を UI に乗せる」が B6 の定義になる。

v26 §3 の第 2 期（逐語）: 「在籍5状態+履歴/入店時給保証+4段時給(payOf 改変)/販売実績の器(#57)/売掛手動登録/月次確定 CSV」。
対応表 A 系との重なり＝**A11 販売実績（¥）・A38 商品販売実績・A40 キャスト別 TOP（販売実績）・A42 偏り 販売実績上位**＝「販売実績の器（#57）」が第 2 期送り＝B6 対象外。A44 主要客リストは PII ゲート待ち（不触）。

対応表 A 系の現状（A1〜A58）: 実装済 22／準備中 22／新要件 14（うち器なし 1＝A11）。B6 候補＝「準備中」の 22 行（器あり＝RPC／列がある）。

## 2. 現行 /analytics の面構成

| 項目 | 現行（analytics-board.tsx 1,225 行・page.tsx） |
|---|---|
| 到達 | page.tsx: role なし→/login、owner／manager 以外→/register（payroll 同型）。cast は layout で /mine |
| props | stores（RLS）・casts（active・photo）・isOwner（全店合算トグルのゲート） |
| 期間切替 | nox-seg「今月／先月」＋`<input type="month">`（period YYYY-MM）。直近 30 日（A4）は無い |
| 店切替 | `<select>`（stores）＋ owner のみ「全店舗」チェック（allStores → hourly／category／cohort の 3 RPC だけ p_store_id null＝org 合算・KPI／日報系は選択店のまま＝裁定 E8-6-4） |
| ビュー | nox-seg「サマリー／売上／キャスト／顧客」（view state）＋ 売上推移の「日別／前月重ね／3ヶ月／6ヶ月」（trendMode） |
| KPI 帯 | 4 枚（締め済み daily_reports の再形・全ビュー共通）＋5 枚目 月間目標の進捗（store_sales_targets） |
| 節（h3） | 日別売上（締め済み）／売上内訳／売上カテゴリ（5 分類）／注目ポイント／売上推移／決済構成／決済別実績／時間帯別売上／曜日別・時間帯別（ヒートマップ 7×24）／売上貢献ランキング（按分）／指名件数ランキング／主要客リスト（キャスト別指名客）／客層の内訳／初来店月ごとの再来店（コホート 6 ヶ月）／月間売上目標 |
| 出力 | CSV 出力 2（月次・ランキング・client 生成）。印刷隔離なし |
| 目標 | 設定モーダル（store_sales_target_set・owner／manager 自店） |

## 3. データ経路（RPC／テーブル・権限・スコープ）

RPC（8 本・すべて SECURITY DEFINER・execute＝postgres／authenticated／service_role・view は無い）:

| RPC | 引数 | 読む表 | 店スコープ | org 合算 | 範囲 guard |
|---|---|---|---|---|---|
| get_cast_sales | (store, from, to) | cast_sales_aggregate（内部関数→checks／check_lines） | owner 全店 or manager 自店（forbidden） | なし | なし |
| get_cast_ranking | (store, period) | checks（closed）・check_nominations・check_cast_backs・casts | 同上 | なし | bad period |
| get_cast_customer_ranking | (store, period, cast) | checks（closed）・check_nominations・customers | 同上 | なし | bad period |
| customer_list_summary | (store, include_dormant) | customers・checks・receivables・bottle_keeps | auth_role／自店 | p_store_id null 可 | なし |
| store_hourly_aggregate | (store, from, to, customer) | checks（closed）・stores（cutoff） | 同上 | null＝org 合算（owner） | bad range（92 日超） |
| store_category_aggregate | (store, from, to) | checks（closed）・check_lines・stores | 同上 | null＝org 合算 | bad range |
| store_cohort_aggregate | (store, period, months) | checks（closed）・stores | 同上 | null＝org 合算 | bad period／bad range（13 ヶ月超） |
| store_sales_target_set | (store, period, amount) | store_sales_targets（upsert・audit） | owner∨manager 自店 | なし | bad period／bad amount |

直 select（RLS 越し・authenticated=SELECT のみ）: daily_reports（org∧店∧cast 除外）・ar_collections・receivables（owner／manager）・payroll_runs／payslips（KPI 5 枚目の人件費材料＝finalized run の breakdown 凍結値）・store_sales_targets・attendance（cast 出勤・キャスト別）。stores／casts は page.tsx。

## 4. 凍結値との関係（関数ごと）

| 経路 | 元データ | 判定 | B6 で触る場合の注意 |
|---|---|---|---|
| KPI 4 枚・日別売上・売上内訳・決済構成／決済別・売上推移 | daily_reports（締め時に凍結） | **凍結値** | 集計式は不触・表示の再形のみ可 |
| 月間目標の進捗 | daily_reports 売上 ÷ store_sales_targets | 凍結値÷設定値 | 同上 |
| 人件費（注目ポイント材料） | payslips.breakdown_json（finalize 凍結） | **凍結値** | 同上 |
| get_cast_sales（売上貢献ランキング） | cast_sales_aggregate → checks／check_lines を**再集計** | **★raw 再集計** | **payroll collect（給与の売上）と同じ関数＝golden 5931／125802 に直結**。B6 では呼び方（引数）も変えない |
| get_cast_ranking／get_cast_customer_ranking | checks（closed）・nominations・cast_backs を再集計 | ★raw 再集計 | 指名件数・按分は給与に効く（check_cast_backs）＝式不触・表示のみ |
| store_hourly／category／cohort | checks（closed）・check_lines を再集計（mig0096・T4） | ★raw 再集計 | 給与非依存（golden 外）だが verify:nox-analytics-t4 の fixture 前提（cutoff 境界・92 日／13 ヶ月 guard）を崩さない |
| customer_list_summary | customers・checks・receivables・bottle_keeps | ★raw 再集計（顧客） | PII ゲート（A44）と裁定「顧客按分禁止」に抵触しない範囲で表示のみ |

→ B6 の「金額計算不触」は **RPC 本文と引数を変えない**ことで担保できる（B3〜B5 と同型）。新しい集計（A4 直近 30 日・A6 比較・A19 人件費率・A28 曜日別テーブル等）は **既存 RPC の期間引数を変えて 2 回呼ぶ／client で凍結値を割る**の範囲なら golden 外。**新しい SQL 集計や引数追加は mig 領域＝B 層から外す**（裁定125 の但し書き）。

## 5. feature_flag

分析関連のフラグは無い。key の白名単（列 CHECK＋flag_set）は staff_shift／reopen_flow／qr_order／notify の 4 つ。B6 は表示と導線のみ（既存 RPC・既存 select）のため **B5 と同じく新設不要の見込み**＝可。機能公開で分析面を隠す要件が出た場合のみ、列 CHECK＋flag_set 白名単＋feature-flags-panel の 3 箇所（＋payroll_reopen 型の直読みが増えれば 4 箇所目）へ key を足す mig が要る（#74 注記）。

## 6. モックとの差分・押せる要素の分類

モック＝`mock/pages-2026-08/nox-analytics-dashboard.html`（36,224 B・A 系対応表の正本）＋`mock/pages-2026-09/nox-analysis-redesign-v2_1.html`（21,743 B・再設計版）。

| モック節（v2_1） | 現行 | 差分 |
|---|---|---|
| seg 今月／先月／**直近30日** | 今月／先月＋month 入力 | A4 直近 30 日が無い（既存 RPC の from/to で可＝日報は daily_reports 範囲、hourly は 92 日 guard 内） |
| サマリー／売上／キャスト／顧客 | 同名 4 ビュー | 一致 |
| 売上推移／**見るべき変化**／売上カテゴリ／**曜日別**／時間帯別売上／**支払方法**／**日別実績**／**月報へ** | 売上推移／注目ポイント／売上カテゴリ／ヒートマップ／時間帯別／決済構成・決済別／日別売上 | 「見るべき変化」（A23〜A26＝比率・曜日・集中度・リピート率）は準備中・「曜日別テーブル」（A28）は準備中（ヒートマップの列和で可）・「日別実績（人件費率列）」（A33）は新要件・「月報へ」（A34）は Link 新要件（=.nox-link） |
| **キャスト別 TOP**／**偏り** | 売上貢献・指名件数ランキング | A40／A41〜A43（偏り 上位 3 名・出勤平均）は準備中・販売実績列は第 2 期 |
| **新規／リピート**／**来店頻度**／**顧客アクション候補**／**顧客管理へ** | 客層の内訳・コホート・主要客リスト | A46〜A51（来店顧客・新規・リピート・平均来店間隔・未紐付け・来店頻度）は新要件・A55〜A58（アクション候補）は準備中・「顧客管理へ」は既に .nox-link |

238／239 適用後の押せる要素（docs/238_inventory.md の /analytics 12 行）:

| 要素 | 分類 |
|---|---|
| 営業中の速報値はホーム・日報で確認 ›／顧客管理 | (3) リンク＝.nox-link 済 |
| 目標 保存（btnGold） | (1) 実行＝青塗り（239） |
| CSV 出力 ×2・閉じる・設定（モーダル開く） | (2) 補助 |
| 今月／先月・サマリー等 4 ビュー・顧客を見る・売上推移 4 モード | (4) 切替（nox-seg／"on" トグル） |

B6 で足す要素の分類＝直近 30 日（4）・月報へ（3）・曜日別テーブル／見るべき変化（表示のみ・押せない）・印刷（2）。

## 7. 写せる部品と新規部品

| B3〜B5 の部品 | B6 での使い道 |
|---|---|
| KPI 4 枚（B4 H18／B5 一覧）＝nox-inset grid | 既存 nox-kpi 帯があるため**不要**（現行のまま）。売上ビュー KPI（A29）を足すなら同型 |
| nox-seg 切替（B4 H20／B5 店舗別・月別） | 直近 30 日（A4）を既存 seg へ 1 項目追加・比較（A6）を seg 化 |
| 印刷隔離 nox-printpage（B4 H37／B5） | 分析面の印刷（現行なし）＝1 節ずつ nox-print |
| 履歴列（B4 H39／B5 一覧・owner 限定 audit_logs） | 目標設定の変更履歴（store_sales_target_set の audit・owner）に流用可 |
| status バッジ（nox-runbadge） | 不要（分析に状態遷移なし） |
| .nox-link／btnGold（238／239） | 月報へ（A34）・顧客管理へ（既存）・ホームへ |
| **新規に要る部品** | 曜日別テーブル（ヒートマップ heat Map の列和＝純関数）・前月比 pt 表示（2 期間の凍結値差分＝純関数）・見るべき変化カード（比率・曜日・集中度・リピート率＝純関数 4 本）・来店頻度バケット（customer_list_summary の visit 系列→区分け＝純関数） |

## 8. 既存 suite と B6 で要る観点

| suite | assertions | f0 段 | 内容 |
|---|---|---|---|
| verify:nox-analytics-t4 | 34 | 26 段目 | mig0096 T4 集計 3 本＋targets setter の runtime（cutoff 境界・92 日／13 ヶ月 guard・org 合算・category-map 結線・cohort 初来店月・upsert／null 削除） |
| verify:nox-category-map | 21 | 16 段目 | 5 分類の純関数 |
| anon-guard／rls／billing／r2b／payroll | 40／23／3／5／6 箇所 | 6／7／36／31／9 段目 | RPC の anon BLOCKED・他店 0 行・課金ゲート・get_cast_sales の店スコープ（payroll 9 段目「確認1」） |

B6 で新設が要る観点（純関数化できるものは DB 非依存 suite＝走数外）:
- 集計の整形＝曜日別テーブル（heat→dow 和）・前月比 pt・見るべき変化 4 指標・来店頻度バケット・直近 30 日の from/to 算出（cutoff 越しの境界）
- RLS スコープ＝manager は他店の daily_reports／targets／payslips を読まない（B5 A1 同型）
- 期間境界＝月初／月末・直近 30 日が hourly の 92 日 guard 内・cohort の 13 ヶ月 guard・前月比較で 2 回呼ぶときの引数（既存 t4 の guard assertion と矛盾しない）
- golden 6 値不変（get_cast_sales の呼び方不変＝静的に引数の同一を assert）

## 9. 欠陥候補（番号のみ・未起票・修正しない）

1. 生文言の露出＝analytics-board の `setErr("読み込みに失敗: " + error.message)`（171／264／360 行）は RPC の raw（bad period／bad range／forbidden）をそのまま出す。saveTarget（324 行）だけ写像あり。B6 で期間を広げると bad range が出得る（直近 30 日は 92 日内で安全）。
2. 全店合算（allStores）は hourly／category／cohort の 3 RPC だけ org 合算で、同じ画面の KPI／日報系／ランキングは選択店のまま（裁定 E8-6-4）＝1 画面に 2 スコープが混在。B6 で「全店舗」を前面に出すなら注記か分離が要る。
3. get_cast_sales は payroll collect と共用（cast_sales_aggregate）＝分析面の呼び方（p_from／p_to）を変えると給与側に影響し得る。B6 は呼び方不変で。
4. key 警告（#81 同型）: analytics-board の map 直下で key の無い要素は **0 件**（機械走査）。
5. NOT NULL／unique: store_sales_targets の unique（store×period）は t4（13）で upsert を実証済み・本調査で新たな疑義なし。
6. get_cast_sales に範囲 guard が無い（from/to 自由）＝直近 30 日や前年同月比較で長期間を渡しても RPC は拒否しない（性能側の疑義・数値は正）。

## 10. 保存・起動

本書＝`docs/tmp/b6_survey.md`（未追跡）。9/11 朝の起動ブロックは v30 §8 のまま（HEAD は #81 後の **b77961f**・ahead **27** に読み替え）で変わらない。B6 の設計書（v1）は本調査 1〜9 を入力に相談役が起草し、B5 と同じく「設計書収蔵→裁定 B6-1〜n→CC 実装ブロック」の順。
