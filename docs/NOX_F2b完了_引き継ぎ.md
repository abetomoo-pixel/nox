# NOX F2b 完了 引き継ぎ（相談役チャット・CC セッション切替用）

> 作成: 2026-07-06（F2b 締め）。F0＋F1＋F2a＋F2b 完了時点のスナップショット。
> 新セッションはまず本書 → CLAUDE.md → 台帳（§4）→ 各設計書の順に読むこと。
> F1 時点の引き継ぎは `NOX_F1完了_引き継ぎ.md`（本書がその後継・F2a/F2b を反映）。

---

## 0. いま何が終わっているか（1行）

F0（土台）＋F1（MVP・レジ/シフト/日報/cast 画面）＋F2a（報酬マスタ・売上集計・打刻突合の純関数と DB 結線）＋F2b（機密分離）まで完了・push 済み。**次は F2c（給与確定＝payОf 結線の山場）**。

## 1. 設計書インベントリ（docs/・正本宣言）

| 文書 | 役割 | 正本性 |
|---|---|---|
| `NOX_データモデル設計_Supabase版.md` | テーブル・RLS・mig 分割 | **スキーマの正本**。F1b/F1d/F1e／**F2a §2.2／F2b §2.2** の実装確定追記が初版に優先 |
| `NOX_認可設計_RLS.md` | 2層認可・cast プライバシー・集計 RPC・キオスク | **認可の正本**。§3.2 F1f／**§2.3 F2a／§2.4 F2b** の追記が初版に優先 |
| `NOX_計算ロジック設計_payOf.md` | payOf 配置（案1＝TS 純関数）・給与確定フロー | 配置方針の正本 |
| `NOX_payOf_精密仕様_モック抽出.md` | payOf 厳密式・分配規則・ゴールデン | **計算式の正本**。**§4.1/§4.2（打刻突合・#20）／§7-1（daily.sales・#21）** が F2a で追記 |
| `NOX_段階リリース計画.md` | F0〜F4 ロードマップ・コンプラゲート | フェーズ計画の正本 |
| `NOX_BANZEN流用マップ.md` | BANZEN 実ファイル→NOX 翻訳指示 | 流用の正本 |
| `NOX_F0_セキュリティセルフレビュー.md` | F0 レビュー＋**台帳の正本（§5）** | 台帳は本書 §4 にスナップショット・更新は F0 文書側で継続 |
| `NOX_F1_セキュリティセルフレビュー.md` | F1 レビュー | — |
| `NOX_F2a_セキュリティセルフレビュー.md` | F2a レビュー（二重防御9原則総点検・prosrc 実測） | — |
| `NOX_F2b_セキュリティセルフレビュー.md` | F2b レビュー（機密封鎖・**教訓2件＝array_append／signIn キャッシュ**） | — |
| `NOX_F1f_UI確認チェックリスト.md` | UI 可視性の確認台帳（確認①〜⑤＝F2a-4 まで） | 画面追加時に増補 |
| `mock/nox-nightwork-app.html` | モック実体 | **計算仕様の出典**（tsconfig exclude・参照専用） |

計算/純関数の正本（`lib/nox/`）: `pay.ts`（payOf/allocateQty）・`money.ts`（丸め集約）・`shift-time.ts`（日跨ぎ 0-47 域）・`biz-date.ts`（営業日境界）・`check-calc.ts`（請求額鏡像）・**`punch-match.ts`（打刻突合 raw/final/anomalies）**・**`punch-io.ts`（punches→0-47 域持ち上げ）**・**`sales-alloc.ts`（cast 売上按分の TS 鏡像）**。後ろ3本は verify で DB に係留。

## 2. 実装済みインベントリ

### マイグレーション（nox-dev 適用済み・番号順で新環境再現可）
| mig | 内容 |
|---|---|
| 0001 | 認可ヘルパー4本＋コア5テーブル（orgs/stores/users/memberships/casts）＋RLS |
| 0002 | audit_logs＋audit_log_write（完全内部専用） |
| 0003 | 6テーブル grant 締め（テーブル標準型の確立） |
| 0004 | audit_log_write の service_role revoke（内部専用=4ロール明示） |
| 0005 | 方式A＋products/seats/bottle_keeps/stock_logs＋RPC3本 |
| 0006 | 会計6テーブル（checks/check_nominations/check_lines/payments/check_cast_backs/receivables） |
| 0007 | 会計 RPC 公開7＋内部3（分配=最大剰余法・冪等・void 連動） |
| 0008 | 勤怠5テーブル（shift_wishes/shifts/attendance/punches/staffing_needs） |
| 0009 | 勤怠 RPC 9本（cast セルフ4＋管理系5） |
| 0010 | daily_reports＋close/reclose＋daily_report_aggregate（内部・org 自衛） |
| 0011 | get_cast_ranking（金額列なし）＋attendance_set staff 開放 |
| 0012 | **F2a** 報酬マスタ6テーブル（comp_plans/cast_plan/cast_norms/deductions/penalty_config/custom_back_defs） |
| 0013 | **F2a** マスタ CRUD RPC 6本＋内部 comp_plan_slide_check |
| 0014 | **F2a** cast_sales_aggregate（内部）＋get_cast_sales（公開・staff 拒否） |
| 0015 | **F2b** cast_sensitive（ポリシー0＋grant0）／cast_tax_profiles（パターン2）＋RPC3本 |

### DB 関数（実測 44＝公開 RPC 32・内部 7・認可ヘルパー 4・trigger 1）
- 公開 RPC 32本:
  - F1a: set_product / set_seat / product_stock_add
  - F1b: check_open / check_set_nominations / check_add_line / check_remove_line / check_pay / check_close / check_void
  - F1d: shift_wish_submit / shift_wish_withdraw / punch_self / attendance_set_self / shift_wish_decide / shift_set / punch_proxy / attendance_set / set_staffing_need
  - F1e: daily_report_close / daily_report_reclose
  - F1f: get_cast_ranking
  - **F2a**: set_comp_plan / set_cast_plan / set_cast_norm / set_deduction / set_penalty_config / set_custom_back_def / get_cast_sales
  - **F2b**: set_cast_sensitive / get_cast_sensitive / set_cast_tax_profile
- 内部（4ロール revoke・grant なし）7本: audit_log_write / check_round_amount / check_group_due / check_recalc / daily_report_aggregate / **comp_plan_slide_check** / **cast_sales_aggregate**
- 認可ヘルパー4本（authenticated）: auth_org_id / auth_role / auth_store_id / auth_cast_id ／ trigger: touch_updated_at

### テーブル30本の cast プライバシー分類
- パターン1（自分の行のみ）: casts, check_cast_backs, shift_wishes, shifts, attendance, punches, **cast_norms**
- パターン1変形: **cast_plan（＋staff 0行）**, **comp_plans（割当プランのみ＝exists）**
- パターン2（cast 0行）: seats, stock_logs, bottle_keeps, checks, check_nominations, check_lines, payments, receivables, daily_reports, audit_logs（owner 限定）, staffing_needs, memberships（owner/manager）, **cast_tax_profiles**
- パターン3（共有）: products, **deductions, penalty_config, custom_back_defs**
- **最強封鎖（grant0・閲覧 RPC のみ）: cast_sensitive**（全ロール直 SELECT 不可）
- 標準店スコープ: orgs, stores, users

### 画面（Next.js 15・ポート3200）
/login ／ cast: /mine・/mine/wishes・/mine/ranking ／ 店側: /register・/shift・/report・**/master（F2a-4 で報酬マスタ6タブ追加＝プラン/割当/ノルマ/控除/罰金・閾値/自由バック・owner/manager の D3a 出し分け）**。3層防御（middleware=認証・layout=ロール分岐・DB=物理保証）。

### verify スイート（`npm run verify:f0`＝seed 後・全緑 567 assertions）
| スクリプト | assertions | 主対象 |
|---|---|---|
| verify:nox-pay | 83 | payOf 全項目・玲奈2系統・allocateQty |
| verify:nox-shift-time | 44 | 日跨ぎ・24h超表記・biz-date 境界 |
| verify:nox-punch-match | 75 | 打刻突合 S1〜S8・S3 対応表・IO 段（punch-io）・DB 結線 |
| verify:nox-anon-guard | 81 | 公開 RPC anon BLOCKED・内部関数 両ロール BLOCKED・全テーブル anon 遮断（段1〜10） |
| verify:nox-rls | 246 | 店スコープ・3パターン・退職回帰・会計/日報/ランキング/売上ゴールデン・冪等・TS/DB 同値3種・F2a/F2b 分岐 |
| verify:nox-grants | 38 | G1 スキーマ全体 SELECT ガード・G7 cast_sensitive 0 grant・ACL・RLS 有効 |

### ゴールデン（回帰アンカー）
| 名称 | 値 |
|---|---|
| 玲奈 T1a（pt除外＝設計書値） | wage 5,170・110.1h・net 1,112,464 |
| 玲奈 T1b（モック忠実＝正） | wage 5,931・gross 1,387,150・net 1,187,753 |
| 会計 | total 54,400（A 37,900／B 16,500）・分配 A{drink1500,champ7000,pt14}/B{drink750,pt2} |
| 日報 | diff 500・reclose 追随・境界帰属 TS/DB 一致 |
| ランキング | A rank1／B rank2（バック合計タイブレーク・返却7列） |
| **cast 売上（F2a）** | castA1a 32,640・castA1b 21,760・Σ54,400＝checks.total 恒等・3-way 剰余 534/533/533 |
| **打刻突合（F2a）** | in-in 先着採用・孤立 out=absent・attendance final 昇格・IO cutoff ちょうど当日側 |

### 環境
dev ポート3200固定・nox-dev（ref: hiqbfagmkrdpmlqhkmsu＝法人 org）・.env.local 5キー・seed:f0 は dev 専用・手貼りは ref 目視＋自己証明クエリ（CLAUDE.md）。テストユーザー nox-verify-{owner-a/manager-a1/staff-a1/cast-a1a/cast-a1b/manager-b1}@example.com＋SEED_PASSWORD。

## 3. 未実装リスト（F2c〜F4）

### F2c 給与確定（次の着手・ゲート: 税理士・社労士）
- **payroll_runs/payslips 凍結＋確定フロー**（サーバが payОf 再計算→breakdown_json 凍結・冪等・トランザクション・天引き消し込み）＝台帳 #4 結線の山場。
- payОf 入力の結線元は全て F2a/F2b で用意済み: daily.sales=get_cast_sales／lateN・absentN=punch-match+punch-io／マスタ=comp_plans 系6／taxMode=cast_tax_profiles.mode。
- service_role 監査経路（#6）を決定。penalty_config の grace 3列を punch-match config へ供給。
- **#32 出勤インセンティブ**（設計ロック済み）を payslips.breakdown_json 独立行として実装。

### F2d 源泉・インボイス・支払調書（payment_records）
- cast_sensitive の **mynumber 暗号化**（pgp_sym・鍵管理確定・search_path=public,extensions へ変更＝pgcrypto トラップ回避の TODO 残置）＋cast_tax_profiles.invoice/reg_no。#7 源泉日数=税理士。

### F2e 天引き（advances/transport/receivables・二重控除ガード #8・#14b cast_id 索引）／F2f シミュレーター（#12 雇用係数）
### 金額込みランキング別 RPC（castMng・#10a／F2 内残件）
### F3 CRM/AI/統制（customers・drink_claims #28・approvals/notices/trials・fix_requests #22・売掛規制）
### F4 外部連携・キオスク（マルチ店舗 #15・kiosk ロール #16・stores billing #17・ジオフェンス #23・キオスク・連携）

## 4. 台帳全件スナップショット（2026-07-06・正本は F0 セルフレビュー §5）

| # | 状態 | 要旨 |
|---|---|---|
| 1,2,3,24 | ✅クローズ | auth_org_id 方式A／middleware 拡張／cast 3パターン／staff=attendance_set のみ |
| 4 | F2c | 日次データの payОf 結線（**部品は F2a/F2b で全て完備**・breakdown_json は #32 独立行受入） |
| 5 | 運用定着 | 新 RPC ごとの anon-guard 追記 |
| 6 | F2c | service_role 監査経路 |
| 7 | F2c/税理士 | 源泉の日数定義（暫定=出勤日数） |
| 8 | F2e | 二重控除ガード |
| 9 | F2 | 売上バック率テーブル店設定化 |
| 10 | F2c/税理士 | 丸め round vs floor（money.ts 1箇所差替） |
| 11 | F2c/社労士 | 雇用の源泉・社保 |
| 12 | F2f | シミュ係数の雇用 1.0 |
| 13 | F2c | 玲奈ゴールデンの実データ置換検討 |
| 14 | ✅クローズ | **cast_sensitive 分離（F2b・mig0015・箱まで＝mynumber は null 運用）** |
| 14b | F2e | receivables の (cast_id, status) 索引 |
| 15,16,17,23 | F4 | マルチ店舗／kiosk ロール／billing 列／ジオフェンス |
| 18 | 任意 | 認可 §1.2/§2.3 audit 記載整合 |
| 20 | ✅クローズ | **打刻突合純関数（F2a・punch-match/punch-io・#20 裁定 S1〜S8）** |
| 21 | ✅クローズ | **daily.sales 定義（F2a・§7-1・SL1〜SL8・cast_sales_aggregate）** |
| 22 | F3 | fix_requests（打刻修正申請） |
| 25 | F2/ヒアリング | カードTAX の請求時上乗せ |
| 26 | F2 | charge_kind（金額分離） |
| 27 | F1f再訪→F2 | reclose 実査 null 戻し |
| 28 | F3f | drink_claims |
| 29 | F2c | /mine バック表示の集計期間明示 |
| 30 | F2+ | bottle_keeps UI 導線（customers 統合） |
| 31 | F2/ヒアリング | **early/over/noout の金銭化要否（起票済・現状 anomaly/表示のみ）** |
| 32 | F2c | **出勤インセンティブ attendance_incentives（設計ロック済・実装は F2c 完了後）** |

**クローズ済み: #1,2,3,14,20,21,24（7件）／オープン: 残り**。

## 5. 新 CC への申し送り（詳細は CLAUDE.md）

- **DB-first・単一トランザクション・手貼りは ref 目視＋自己証明クエリ・prosrc 一字照合**。二重防御9原則／テーブル標準型（revoke all→grant select）／全書込 RPC は audit_log_write（**唯一の例外＝get_cast_sensitive は読取でも §2.4 でログ**）／内部専用は4ロール revoke。
- **新規 mig 提示はメッセージ本文にコードブロック全文**（Read/ツール出力は相談役チャットに届かない）。
- verify 緑→コミット・push はフェーズグループ完了＋セルフレビュー通過後のみ。**着手時にまず `npm run verify:f0` を1回流して全緑（567）を確認**してから F2c へ。
- コミット規約: co-author 禁止・スラッシュ始まり禁止・パス風トークン禁止・Bash -m。
- **教訓（F2b）**: ①plpgsql の text array 連結は `array_append` を使う（`||` は array literal 誤解決）。②verify の DB 依存テストは認証をセッションキャッシュ化済み（レート制限＋退職回帰 finally スキップ破損の対策）。
- **F2c 着手の論点**: payroll_runs/payslips のスキーマ・凍結タイミング（payroll_run 時サーバ再計算＝§5/§7-1 準拠）・service_role 監査経路（#6）・専門家ゲート暫定既定（#7/#10/#11）・#32 出勤インセンティブの結線。
