# NOX F2e-1 完了 引き継ぎ（実装インベントリ正本・CC セッション切替用）

> 作成: 2026-07-07（F2e-1 締め）。F0＋F1＋F2a＋F2b＋F2c＋F2e-1 完了時点のスナップショット。
> 本書は**実装インベントリの正本（CC 作成）**＝相談役チャットには実体が届かないので CC が維持する。
> 設計・裁定の正本は相談役側「NOX_相談役引き継ぎ_F2e1完了.md」（F2c/F2e-1 の全裁定）。
> 前版 `NOX_F2b完了_引き継ぎ.md`（F0〜F2b）を本書が後継。新セッションはまず本書 → CLAUDE.md → 台帳（§4）→ 各設計書の順に読むこと。
> HEAD = 1adf874・mig 0001〜0018・origin 完全同期・verify:f0 = **710 assertions 全緑**。

---

## 0. いま何が終わっているか（1行）

F0（土台）＋F1（MVP）＋F2a（報酬マスタ・売上集計・打刻突合）＋F2b（機密分離）＋**F2c（給与確定＝payОf 結線の山場・payroll_runs/payslips 凍結・出勤インセンティブ #32）**＋**F2e-1（売掛天引き＝モデルP・partial・繰越）**まで完了・push 済み。**次候補は F2e-2（前借り/送り）・F2d（源泉/インボイス）・F2f（シミュレーター）**。

---

## 1. 設計書インベントリ（docs/・正本宣言）

| 文書 | 役割 | 正本性 |
|---|---|---|
| `NOX_データモデル設計_Supabase版.md` | テーブル・RLS・mig 分割 | **スキーマの正本**。F2a §2.2／F2b §2.2／**F2c §2.8（payroll_runs/payslips）／attendance_incentives／F2e-1（receivables 2列追加）**の実装確定追記が初版に優先 |
| `NOX_認可設計_RLS.md` | 2層認可・cast プライバシー・集計 RPC・キオスク | **認可の正本**。§2.3 F2a／§2.4 F2b／**§3.2 F2c-1（payslips 金額系＋staff 遮断）／パターン3（attendance_incentives）**の追記が初版に優先 |
| `NOX_計算ロジック設計_payOf.md` | payOf 配置（案1＝TS 純関数）・給与確定フロー | 配置方針の正本。**§4.3 F2c-1 結論（確定＝サーバ再計算→凍結）** |
| `NOX_payOf_精密仕様_モック抽出.md` | payOf 厳密式・分配規則・ゴールデン | **計算式の正本**。§4.1/§4.2（打刻突合）／§7-1（daily.sales） |
| `NOX_段階リリース計画.md` | F0〜F4 ロードマップ・コンプラゲート | フェーズ計画の正本（本書 §3 が現在の待ち行列） |
| `NOX_BANZEN流用マップ.md` | BANZEN 実ファイル→NOX 翻訳指示 | 流用の正本 |
| `NOX_F0_セキュリティセルフレビュー.md` | F0 レビュー＋**台帳の正本（§5）** | 台帳は本書 §4 にスナップショット・更新は F0 文書側で継続 |
| `NOX_F1_〜.md` / `NOX_F2a_〜.md` / `NOX_F2b_セキュリティセルフレビュー.md` | 各フェーズのセキュリティレビュー | F2b に教訓2件（array_append／signIn キャッシュ） |
| `NOX_F1f_UI確認チェックリスト.md` | UI 可視性の確認台帳 | 画面追加時に増補 |
| **`NOX_社労士確認事項.docx`／`NOX_税理士確認事項.docx`／`NOX_弁護士確認事項.docx`** | **専門家ゲート質問書（§5）** | 相談役 §5/§6 骨格の清書・**作成済み・未 git 追跡（要コミット判断）** |
| `mock/nox-nightwork-app.html` | モック実体 | **計算仕様の出典**（tsconfig exclude・参照専用） |

> **注**：F2c/F2e-1 のセキュリティセルフレビューは**独立 md 未作成**。代わりに verify 係留コミット（`eb23152`／`b824ad3`／`39ee614`）に吸収（実値照合・退職回帰・日ごと独立按分の係留）。独立レビュー md が要るならフェーズグループ push 前に起こす。

計算/純関数の正本（`lib/nox/`）:
- 基盤: `pay.ts`（payOf/allocateQty・**net = gross − fixedDed − fine − withholding − arDeduct − advanceDeduct − okuriDeduct − normPenalty**）・`money.ts`（丸め集約＋**`takeHomeFloor()`＝暫定0・social gate TODO**）・`shift-time.ts`・`biz-date.ts`・`check-calc.ts`・`punch-match.ts`・`punch-io.ts`・`sales-alloc.ts`・`auth.ts`。
- **payroll 系（F2c で新設・`lib/nox/payroll/`）**: `window.ts`（period_bounds 鏡像）・`authz.ts`（decidePayrollAccess 純関数）・`route-guard.ts`・`collect.ts`（対象 cast 列挙＋売上/打刻/マスタ/税区分/**receivables 収集 loadReceivables**）・`assemble.ts`（PayInput 組み立て）・`core.ts`（payOf 実行＋**二段 payOf の売掛引き当て**＋extras 結線＋net 恒等）。

---

## 2. 実装済みインベントリ

### マイグレーション（nox-dev 適用済み・番号順で新環境再現可）
| mig | 内容 |
|---|---|
| 0001〜0011 | F0/F1（認可ヘルパー・コア5＋会計6＋勤怠5＋daily_reports・RPC 群・ランキング） |
| 0012〜0014 | **F2a** 報酬マスタ6＋CRUD RPC6＋cast_sales_aggregate/get_cast_sales |
| 0015 | **F2b** cast_sensitive（grant0）／cast_tax_profiles（パターン2）＋RPC3本 |
| **0016** | **F2c-1** payroll_runs／payslips 新設＋確定基盤。period_bounds（写像単一ソース）・audit_log_write_service（#6 解・内部4ロール）・payroll_run_create（公開）・payroll_finalize／payroll_mark_paid（**service_role 限定**）・get_cast_ranking 再宣言（写像経由） |
| **0017** | **F2c-3** attendance_incentives（1行1 store×biz_date・パターン3・部分ユニーク published）＋incentive_publish／incentive_cancel（manager+・TOCTOU 排除・paid 期間ガード） |
| **0018** | **F2e-1** receivables に `deduct_period text`＋`deducted_amount int default 0`（check ≤ amount・索引 (cast_id,status)）／payroll_finalize 改修（receivable 遷移込み・巻き戻し・原子性・#8 ガード）／check_void 修正（deducted_amount>0 も settled 拒否） |

> **改修 mig の注意**：0018 は `payroll_finalize`(0016) と `check_void`(0007) を**再宣言（差分改修）**。0016 との差分は (A) v_next 算出 (B) 巻き戻しフェーズ (C) FOR ループ化＋ar 処理 (D) audit 追加のみ、他一字一致。改修 mig を再適用するときは現行 prosrc を控えて差分照合（孫引き事故対策）。

### DB 関数（migration DDL 基準・実測 51＝公開 RPC 35・service_role 限定 2・内部 8・authenticated 写像 1・認可ヘルパー 4・trigger 1）
- **公開 RPC（authenticated・35本）**: F2b 時点の 32本 ＋ **`payroll_run_create`（manager+・run 箱作成）／`incentive_publish`／`incentive_cancel`（manager+）**。
- **service_role 限定 RPC（authenticated revoke・2本）**: `payroll_finalize`（payslips 原子的差し替え＋receivable 遷移＋run 確定＋audit を1トランザクション・p_org_id 明示照合＝二重防御①代替）／`payroll_mark_paid`（finalized→paid・paid 後 finalize 拒否）。**route handler（service キー保持）が authenticated を manager+ 検証してから呼ぶ**。
- **内部（4ロール revoke・grant なし・8本）**: 既存7本（audit_log_write／check_round_amount／check_group_due／check_recalc／daily_report_aggregate／comp_plan_slide_check／cast_sales_aggregate）＋ **`audit_log_write_service`**（p_org_id/p_actor 明示・finalize/mark_paid 内部の perform 専用＝#6 解）。
- **authenticated 写像ヘルパー（1本）**: `period_bounds(p_period)`（'YYYY-MM'→[月初,月末] date・単一ソース・anon BLOCKED・ranking/finalize/collect が経由）。
- **認可ヘルパー4本**（auth_org_id/role/store_id/cast_id）／**trigger 1**（touch_updated_at）。

### テーブル33本の cast プライバシー分類（F2b の30 ＋ 3新設）
- **パターン1（自分の行のみ）**: casts, check_cast_backs, shift_wishes, shifts, attendance, punches, cast_norms ＋ **payslips（cast 本人のみ・金額系＋staff 0行＝F2c-1）**
- **パターン1変形**: cast_plan（＋staff 0行）, comp_plans（割当プランのみ＝exists）
- **パターン2（cast 0行）**: seats, stock_logs, bottle_keeps, checks, check_nominations, check_lines, payments, **receivables（F2e-1 でも維持＝客情報 customer_id 保護・cast は payslip.breakdown_json.ar で確定後天引きを見る）**, daily_reports, audit_logs（owner 限定）, staffing_needs, memberships（owner/manager）, cast_tax_profiles, **payroll_runs（owner/manager のみ・cast/staff 0行）**
- **パターン3（共有・全ロール可視・書込ポリシー0）**: products, deductions, penalty_config, custom_back_defs, **attendance_incentives（周知＝cast プライバシー条件なし・RPC 経由のみ書込）**
- **最強封鎖（grant0・閲覧 RPC のみ）**: cast_sensitive
- **標準店スコープ**: orgs, stores, users

### 画面（Next.js 15・ポート3200）
- /login ／ cast: /mine・/mine/wishes・/mine/ranking ／ 店側: /register・/shift・/report・/master（報酬マスタ6タブ）
- **/payroll（F2c＝給与確定3段 UI：期間選択→プレビュー→確定・anomaly 件数・**売掛天引き列 −¥X 繰越¥Y**・総配分額/受給者数サマリ）**
- **/shift に出勤インセンティブ発行パネル（発行/一覧/取消）**
- **/mine 拡張（受給インセンティブ表示・pooled 暫定明示・**確定給与明細セクション＝breakdown_json.ar の −¥X**）**
- API route（service キー保持・manager+ 検証）: **`/api/payroll/preview`（payOf のみ・書き込みなし）／`/api/payroll/finalize`（run_create→再計算→確定前ガード→finalize）／`/api/incentive/publish`／`/api/incentive/cancel`**
- 3層防御（middleware=認証・layout=ロール分岐・DB=物理保証）

### verify スイート（`npm run verify:f0`＝seed 後・全緑 **710 assertions**）
| スクリプト | assertions | 主対象 |
|---|---|---|
| verify:nox-pay | 83 | payOf 全項目・玲奈2系統・allocateQty |
| verify:nox-shift-time | 44 | 日跨ぎ・24h超表記・biz-date 境界 |
| verify:nox-punch-match | 75 | 打刻突合 S1〜S8・IO 段・DB 結線 |
| verify:nox-anon-guard | 92 | 公開 RPC anon BLOCKED・内部関数両ロール BLOCKED・全テーブル anon 遮断（段1〜11）・finalize/mark_paid=anon+authenticated BLOCKED・period_bounds anon BLOCKED |
| verify:nox-rls | 295 | 店スコープ・3パターン・退職回帰・会計/日報/ランキング/売上ゴールデン・冪等・TS/DB 同値・**F2c-1 finalize 動作アンカー・パターン3 可視/権限/部分ユニーク・cast 本人 payslip.ar 可視** |
| verify:nox-grants | 50 | スキーマ全体 SELECT ガード・cast_sensitive 0 grant・新テーブル/RPC の proacl 実測 |
| **verify:nox-payroll** | **71** | **PayInput 組み立て・champCnt ゴールデン・net 恒等両経路・権限拒否・プレビュー非書き込み・退職者確定・確定拒否ガード（税区分/プラン未登録 422）・per_head/pooled 按分・日ごと独立按分・extras 経由 net 恒等・売掛3回 finalize 段階遷移（3000→5000→10000）・原子性（bad receivable 全ロールバック）・paid 巻き戻し拒否・手取り0下限 net=0・古い順・#8・確約B 重複なし・cutoff 跨ぎ帰属・void 連動** |

### ゴールデン（回帰アンカー）
| 名称 | 値 |
|---|---|
| 玲奈 T1a（pt除外＝設計書値） | wage 5,170・110.1h・net 1,112,464 |
| 玲奈 T1b（モック忠実＝正） | wage 5,931・gross 1,387,150・withholding 130,397・net 1,187,753 |
| 会計 | total 54,400（A 37,900／B 16,500） |
| cast 売上（F2a） | castA1a 32,640・castA1b 21,760・Σ54,400＝checks.total 恒等・3-way 剰余 534/533/533 |
| **出勤インセンティブ（F2c-3）** | per_head=定額／pooled=最大剰余法（端数+1 は cast_id 最小）・日ごと独立按分（11-20 3人 333/334・11-22 2人 500/500・各日 Σ=1000） |
| **売掛天引き（F2e-1）** | 3回 finalize 段階遷移 3000→5000→10000/deducted・古い順 partial・手取り0下限 net=0・引ききれない分 deduct_period 翌 period 繰越・各 receivable は deducted か carried 一方に1回 |

### 環境
dev ポート3200固定・nox-dev（ref: **hiqbfagmkrdpmlqhkmsu**＝法人 org・BANZEN dev ffnkedomtspsjnuuykfg は誤貼り先）・.env.local 5キー・seed:f0 は dev 専用・手貼りは ref 目視＋自己証明クエリ `select 'nox-project-proof', count(*) from public.orgs;`。テストユーザー nox-verify-*＋SEED_PASSWORD。

---

## 3. 未実装リスト／次の待ち行列（F2e-2〜F4）

### 次候補（Agoora が選択）
- **F2e-2（前借り/送り）**：`advances`（前借り）・`transport`（送り実費）テーブル**新設**（現状存在せず）→ `advanceDeduct`/`okuriDeduct` 結線 → **#8 二重控除ガード（送り実費 vs 一律送り代の両取り防止・pay.ts 冒頭 TODO）**。**E9 の partial モデル（deducted_amount 累積・古い順・手取り0下限・繰越）を踏襲可**。**部分支払い**（payslips.paid の bool 拡張＝paid_amount or 別テーブル・現状 run.status が唯一の paid 判定）もここで検討。
- **F2d（源泉/インボイス）**：cast_sensitive の mynumber 暗号化（**pgcrypto トラップ＝search_path を public,extensions に**・鍵管理判断＝env or Supabase Vault）／cast_tax_profiles に invoice/reg_no／`payment_records`／支払調書。**#7 源泉日数＝税理士ゲート**。
- **F2f（シミュレーター）**：#12 雇用係数（現状 1.0）。

### payOf 天引き3入力の状態（F2e 進捗の中核）
| 入力 | 供給元 | 状態 |
|---|---|---|
| arDeduct（売掛） | receivables（会計結線・status/フラグ完備） | **F2e-1 で結線完了** |
| advanceDeduct（前借り） | テーブルなし | **F2e-2 で新設・結線** |
| okuriDeduct（送り実費） | テーブルなし | **F2e-2 で新設・結線** |

源泉は gross ベース（3天引きは源泉の後・net 側で並列減算）。payOf 内では3つとも集計済み単一整数の単純減算＝違いは供給元の意味論のみ。

### F2 残件・F3・F4
- **F2 残**：#25/#26（カードTAX/charge_kind）・#27（reclose 実査 null）・#29（/mine 集計期間注記）・#13（玲奈ゴールデン実データ化）・#9（売上バック率テーブル店設定化）・#10a（金額込みランキング別 RPC）。
- **F3**：CRM（customers）・離反DM（LLM）・二重承認・体入→本採用（年齢確認）・お知らせ・drink_claims（#28）・fix_requests（#22）・**売掛規制 enforcement（風営法2025・弁護士ゲート）**。
- **F4**：決済 PSP・プリンタ・会計ソフト・マルチ店舗（#15/#16/#17）・ジオフェンス（#23）・キオスク本格運用。

---

## 4. 台帳全件スナップショット（2026-07-07・正本は F0 セルフレビュー §5）

| # | 状態 | 要旨 |
|---|---|---|
| 1,2,3,24 | ✅クローズ | auth_org_id 方式A／middleware／cast 3パターン／staff=attendance_set のみ |
| 4 | ✅クローズ | **日次データの payОf 結線（F2c で完了・breakdown_json は #32 独立行 extras を受入）** |
| 5 | 運用定着 | 新 RPC ごとの anon-guard 追記 |
| **6** | **✅クローズ** | **service_role 監査経路＝audit_log_write_service（mig0016・内部4ロール・p_org_id/p_actor 明示）** |
| **8** | **売掛分クローズ／前借り・送りは F2e-2** | 二重控除ガード。F2e-1 で売掛（status='deducted' ガード・open のみ集計・部分天引き済みは残額繰越）を実装。**送り実費 vs 一律送り代の両取り防止は F2e-2（pay.ts 冒頭 TODO）** |
| 7 | F2d/税理士 | 源泉の日数定義（暫定=出勤日数）＝docx 税理士 Q1 |
| 9 | F2 | 売上バック率テーブル店設定化 |
| 10 | F2d/税理士 | 丸め round vs floor（money.ts 1箇所差替）＝docx 税理士 Q2 |
| 11 | F2/社労士 | 雇用の源泉・社保（係数 1.0）＝docx 社労士 Q5 |
| 12 | F2f | シミュ係数の雇用 1.0 |
| 13 | F2 | 玲奈ゴールデンの実データ置換検討 |
| 14 | ✅クローズ | cast_sensitive 分離（F2b・mynumber は null 運用） |
| **14b** | **✅クローズ** | **receivables の (cast_id, status) 索引（mig0018）** |
| 15,16,17,23 | F4 | マルチ店舗／kiosk ロール／billing 列／ジオフェンス |
| 18 | 任意 | 認可 audit 記載整合 |
| 20,21 | ✅クローズ | 打刻突合純関数（F2a）／daily.sales 定義（F2a） |
| 22 | F3 | fix_requests（打刻修正申請＝インセンティブ受給の当日ヘルプ救済もここ） |
| 25,26,27,29,30 | F2/F1f再訪 | カードTAX／charge_kind／reclose 実査 null／/mine 集計期間注記／bottle_keeps 導線 |
| 28 | F3f | drink_claims（kind='drink_boost' は enum 予約済み） |
| 31 | 起票済 | early/over/noout の金銭化要否（現状 anomaly/表示のみ） |
| **32** | **✅クローズ** | **出勤インセンティブ attendance_incentives（mig0017・per_head/pooled・extras 結線・TOCTOU 排除）** |
| — | **専門家ゲート（オープン）** | **#7/#10（税理士）・#11＋労務論点（社労士）・売掛規制（弁護士）＝docx 3本で照会（§5）** |

**クローズ済み: #1,2,3,4,6,14,14b,20,21,24,32／#8 は売掛分のみクローズ／残りオープン。**

---

## 5. 専門家質問リスト（docx 3本・作成済み・未 git 追跡）

相談役 §5/§6 の骨格を清書済み。各 docx は**共通背景（初見向け・厚め）＋各設問「①現状の決め打ち ②確定してほしい点 ③補足」＋【ご回答】欄**。

| docx | 設問 | 差し替え先 |
|---|---|---|
| `NOX_社労士確認事項.docx` | Q1 天引き労使協定（賃金控除協定・雇用/委託差）／Q2 手取り下限（差押禁止 3/4）→takeHomeFloor()／Q3 減給制限（労基法91条）／Q4 深夜割増（0.25・22時起算・委託除外）／Q5 社会保険→#11／Q6 雇用/委託区分（偽装請負） | money.takeHomeFloor()・pay.ts 罰金上限・雇用係数 |
| `NOX_税理士確認事項.docx` | Q1 源泉日数（暦日 or 実出勤）→#7・pay.ts withholdingOf／Q2 丸め方向→#10・money.roundYen／Q3 インボイス・支払調書→cast_tax_profiles.invoice/reg_no | pay.ts／money.ts／F2d 設計 |
| `NOX_弁護士確認事項.docx` | Q1 2025改正売掛規制（上限/可否の設定義務・給与天引きの適否）／Q2 記録保持（保存期間） | F3 売掛規制 enforcement・データ保持ポリシー |

> **要判断（Agoora）**：この3 docx を今コミットに含めるか（binary を docs/ に）。設計逸脱ではないので判断は運用のみ。専門家確定は long lead time＝早めに投げる。

---

## 6. 新 CC への申し送り（詳細は CLAUDE.md）

- **DB-first・単一トランザクション・手貼りは ref 目視＋自己証明クエリ・"Success" を信用せず prosrc/ポリシー/ACL 実測・既存 RPC 改修は現行 prosrc を控えて差分照合**。
- 二重防御9原則／テーブル標準型（revoke all→grant select）／全書込 RPC は audit（唯一の読取例外＝get_cast_sensitive も §2.4 でログ）／内部専用は4ロール revoke／**service_role 限定 RPC は p_org_id 明示照合＝auth.uid() なしの二重防御①代替（意図的逸脱・payroll_finalize/mark_paid）**。
- **新規/改修 mig 提示はメッセージ本文にコードブロック全文**（Read/ツール出力は相談役チャットに届かない）。改修は変更箇所最小形式可。**plpgsql の text[]||'literal' 禁止＝array_append**。
- verify 緑→コミット・push はフェーズグループ完了＋セルフレビュー通過後のみ。**着手時にまず `npm run verify:f0` を1回流して全緑（710）を確認**。
- コミット規約: co-author 禁止・スラッシュ始まり禁止・パス風トークン禁止・Bash -m。
- 教訓（継続）: ①array_append（plpgsql array literal 誤解決の罠）②verify signIn セッションキャッシュ化（レート制限＋退職回帰 finally スキップ破損の対策）。
- **F2e-2 着手の論点**: advances/transport スキーマ（E9 partial 踏襲）・advanceDeduct/okuriDeduct の pay.ts 結線・#8 送り両取りガード・部分支払い（paid_amount 設計）・collect/core の二段 payOf への追加天引き入力の織り込み。
