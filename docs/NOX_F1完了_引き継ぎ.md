# NOX F1 完了 引き継ぎ（相談役チャット・CC セッション切替用）

> 作成: 2026-07-03（F1f-5）。F0＋F1 フェーズグループ完了時点のスナップショット。
> 新セッションはまず本書 → CLAUDE.md → 台帳（§4）→ 各設計書の順に読むこと。

---

## 1. 設計書インベントリ（docs/・正本宣言）

| 文書 | 役割 | 正本性 |
|---|---|---|
| `NOX_データモデル設計_Supabase版.md` | テーブル・RLS・mig 分割 | **スキーマの正本**。F1b/F1d/F1e の「実装確定」追記ブロック（§2.4/§2.4b/§2.5）が初版に優先 |
| `NOX_認可設計_RLS.md` | 2層認可・cast プライバシー3パターン・集計 RPC・キオスク（F4） | **認可の正本**。§3.2 の F1f 注記（ranking 全ロール同一形）が初版に優先 |
| `NOX_計算ロジック設計_payOf.md` | payOf 配置（案1＝TS 純関数）・給与確定フロー | 配置方針の正本 |
| `NOX_payOf_精密仕様_モック抽出.md` | payOf の厳密式・分配規則 §2.2.1・ゴールデン | **計算式の正本**（§6 追記: 正は本指名商品pt込み＝T1b 5931・T1a 5170 は pt除外回帰） |
| `NOX_段階リリース計画.md` | F0〜F4 ロードマップ・コンプラゲート | フェーズ計画の正本（F1f のドリンク申告は F3f へ移動＝台帳 #28） |
| `NOX_BANZEN流用マップ.md` | BANZEN 実ファイル→NOX の翻訳指示 | 流用の正本（F2 以降も「実ファイルを開いて翻訳」を継続） |
| `NOX_F0_セキュリティセルフレビュー.md` | F0 レビュー＋**引き継ぎ台帳（§5）＝台帳の正本** | 台帳は本文書 §4 にスナップショットあり・更新は F0 文書側で継続 |
| `NOX_F1_セキュリティセルフレビュー.md` | F1 レビュー（BANZEN 教訓対照・設計判断一覧） | — |
| `NOX_F1f_UI確認チェックリスト.md` | UI 可視性の確認台帳（4ロール×全画面・grep 機械確認） | 画面追加時に増補 |
| `mock/nox-nightwork-app.html` | モック実体 | **計算仕様の出典**（tsconfig exclude・参照専用） |

計算ロジックの実装上の正本: `lib/nox/pay.ts`（payOf/allocateQty）・`lib/nox/money.ts`（丸め集約）・`lib/nox/shift-time.ts`（日跨ぎ）・`lib/nox/biz-date.ts`（営業日境界）・`lib/nox/check-calc.ts`（請求額表示鏡像＝verify で DB に係留）。

## 2. 実装済みインベントリ

### マイグレーション（nox-dev 適用済み・番号順で新環境再現可）
| mig | 内容 |
|---|---|
| 0001 | 認可ヘルパー4本＋コア5テーブル（orgs/stores/users/memberships/casts）＋RLS |
| 0002 | audit_logs（append-only・before/after jsonb）＋audit_log_write（完全内部専用） |
| 0003 | 6テーブル grant 締め（authenticated=SELECT のみ・テーブル標準型の確立） |
| 0004 | audit_log_write の service_role revoke（内部専用=4ロール明示の確立） |
| 0005 | 方式A（auth_org_id=memberships join）＋products/seats/bottle_keeps/stock_logs＋RPC3本 |
| 0006 | 会計スキーマ6テーブル（checks/check_nominations/check_lines/payments/check_cast_backs/receivables） |
| 0007 | 会計 RPC 公開7本＋内部3本（分配=最大剰余法・冪等・void 連動） |
| 0008 | 勤怠スキーマ5テーブル（shift_wishes/shifts/attendance/punches/staffing_needs） |
| 0009 | 勤怠 RPC 9本（cast セルフ4＋管理系5） |
| 0010 | daily_reports＋close/reclose＋daily_report_aggregate（内部・org 自衛） |
| 0011 | get_cast_ranking（金額列なし）＋attendance_set staff 開放 |

### DB 関数（公開22・内部6）
- 公開: set_product / set_seat / product_stock_add ／ check_open / check_set_nominations / check_add_line / check_remove_line / check_pay / check_close / check_void ／ shift_wish_submit / shift_wish_withdraw / punch_self / attendance_set_self / shift_wish_decide / shift_set / punch_proxy / attendance_set / set_staffing_need ／ daily_report_close / daily_report_reclose ／ get_cast_ranking ＋ 認可ヘルパー4本（authenticated）
- 内部（4ロール revoke）: audit_log_write / check_round_amount / check_group_due / check_recalc / daily_report_aggregate ＋ touch_updated_at

### テーブル22本の cast プライバシー分類
- パターン1（自分の行のみ）: casts, check_cast_backs, shift_wishes, shifts, attendance, punches
- パターン2（cast 0行）: seats, stock_logs, bottle_keeps, checks, check_nominations, check_lines, payments, receivables, daily_reports, audit_logs（owner 限定＝包含）, staffing_needs, memberships（owner/manager のみ）
- パターン3（共有）: products ／ 標準店スコープ: orgs, stores, users

### 画面（Next.js 15・ポート3200）
/login ／ cast: /mine・/mine/wishes・/mine/ranking ／ 店側: /register・/shift・/report・/master（middleware=認証・layout=ロール分岐・DB=物理保証の3層）

### verify スイート（`npm run verify:f0`＝seed 後・全緑 381 assertions）
| スクリプト | assertions | 主対象 |
|---|---|---|
| verify:nox-pay | 83 | payOf 全項目・玲奈2系統・allocateQty |
| verify:nox-shift-time | 44 | 日跨ぎ・24h超表記・biz-date 境界 |
| verify:nox-anon-guard | 59 | 公開22 RPC anon BLOCKED・内部4関数 両ロール BLOCKED・22テーブル anon 遮断 |
| verify:nox-rls | 159 | 店スコープ・3パターン・退職回帰・会計/日報/ランキングゴールデン・冪等・TS/DB 同値2種 |
| verify:nox-grants | 36 | G1 スキーマ全体 SELECT ガード・ACL・RLS 有効（DB 直結 introspection） |

### ゴールデン（回帰アンカー）
| 名称 | 値 |
|---|---|
| 玲奈 T1a（pt除外＝設計書値） | wage 5,170・110.1h・{売上0, pt7, 保証15}・net 1,112,464 |
| 玲奈 T1b（モック忠実＝正） | wage 5,931・{pt18, 保証4}・gross 1,387,150・net 1,187,753 |
| 会計 | total 54,400（A 37,900／B 16,500）・分配 A{drink1500, champ7000, pt14}／B{drink750, pt2} |
| 日報 | 上記シナリオ＋境界伝票で slips/guests/cash/card/tax/uri/drink・diff=counted−(float+cash−exp−payout) |
| ランキング | A rank1 hon1／B rank2 hon1（バック合計タイブレーク・返却7列のみ） |

### 環境
dev ポート 3200 固定・nox-dev（ref: hiqbfagmkrdpmlqhkmsu）・.env.local 5キー（URL/publishable/secret/DB_URL/SEED_PASSWORD）・seed:f0 は dev 専用・手貼りは ref 目視＋自己証明クエリ（CLAUDE.md）。

## 3. 未実装リスト（F2〜F4・設計書章＋台帳番号つき）

### F2 報酬/税務（ゲート: 税理士・社労士）
| 項目 | 設計書 | 台帳 |
|---|---|---|
| F2a 報酬設計マスタ（comp_plans/cast_plan/cast_norms/deductions/penalty_config） | データモデル §2.2・計画 §4 | — |
| F2a 打刻突合純関数（lx/vp 翻訳・in-in/孤立out の解決仕様） | 精密仕様 §4・§2.5 追記2 | **#20** |
| F2 冒頭 daily.sales（cast 日次売上）の定義 | 計算ロジック §7-1 | **#21** |
| F2b cast_tax_profiles＋cast_sensitive（mynumber 分離・閲覧RPC＋アクセスログ） | 認可 §2.4・データモデル §2.2 | **#14** |
| F2c 給与確定（payroll_runs/payslips 凍結・サーバ payOf 再計算） | 計算ロジック §4・データモデル §2.8 | #4（結線） |
| F2c service_role 監査経路（直 INSERT か p_org_id 付き RPC か） | mig0002 ヘッダー | **#6** |
| F2d 源泉・インボイス・支払調書（payment_records） | データモデル §2.8 | #7（源泉日数=税理士） |
| F2e 天引き（advances/transport/receivables・二重控除ガード） | データモデル §2.6 | #8・#14b（cast_id 索引） |
| F2f シミュレーター（Mine・payOf 共有） | 計算ロジック §3 | #12（雇用係数） |
| pay/castMng 用の金額込みランキング別 RPC | 認可 §3.2 注記 | — |
| その他 F2 判断 | — | #9（売上率テーブル店設定化）・#10（丸め floor）・#11（雇用の源泉社保）・#13（ゴールデン置換）・#25（カードTAX 請求上乗せ）・#26（charge_kind）・#27（reclose 実査 null）・#29（mine 集計期間表示）・#30（bottle_keeps 導線） |

### F3 CRM/AI/統制（ゲート: 弁護士・風営法）
customers（§2.7・bottle_keeps FK 追加）／drink_claims=**#28**／approvals・notices（パターン3）・trials（年齢確認）＝§2.6／fix_requests=**#22**／売掛規制の上限制御（§2.4 receivables 注記）

### F4 外部連携・キオスク
マルチ店舗切替（部分ユニーク drop＋ヘルパー差替）=**#15**／memberships.role への 'kiosk' 追加=**#16**／stores billing 列=**#17**／ジオフェンス（0028 翻訳）=**#23**／キオスク（認可 §7.5・BANZEN K-a〜K-h 流用）／プリンタ・PSP・会計ソフト連携（計画 §6）

### 設計書整合（任意）
認可設計 §2.3 パターン2の audit_logs 記載 vs §1.2 owner 限定＝**#18**（実装は owner 限定済み・注記提案のみ残）

## 4. 台帳全件スナップショット（2026-07-03・正本は F0 セルフレビュー §5）

| # | 状態 | 要旨 |
|---|---|---|
| 1 | ✅クローズ | auth_org_id 方式A（mig0005・退職回帰 verify） |
| 2 | ✅クローズ | middleware 5パス拡張（F1f-1） |
| 3 | ✅クローズ | cast プライバシー3パターン＋集計 RPC（notices は F3） |
| 4 | F2 | 日次データの payOf 結線（器は完了） |
| 5 | 運用定着 | 新 RPC ごとの anon-guard 追記 |
| 6 | F2c | service_role 監査経路 |
| 7 | F2/税理士 | 源泉の日数定義 |
| 8 | F2 | 二重控除ガード |
| 9 | F2 | 売上バック率テーブル店設定化 |
| 10 | F2/税理士 | 丸め round vs floor（money.ts 1箇所差替） |
| 11 | F2/社労士 | 雇用（給与）の源泉・社保 |
| 12 | F2 | シミュ係数の雇用 1.0 確認 |
| 13 | F2 | 玲奈ゴールデンの実データ置換検討 |
| 14 | F2b | cast_sensitive 分離（mynumber・アクセスログ） |
| 14b | F2 | receivables の (cast_id, status) 索引 |
| 15 | F4 | マルチ店舗切替（index drop＋ヘルパー差替） |
| 16 | F4 | memberships.role check に 'kiosk' 追加 |
| 17 | F4 | stores billing 列 |
| 18 | 任意 | 認可設計 §1.2/§2.3 の audit 記載整合 |
| 20 | F2a | 打刻突合純関数（in-in/孤立 out の正本） |
| 21 | F2 冒頭 | daily.sales の定義 |
| 22 | F3 | fix_requests（打刻修正申請） |
| 23 | F4/顕在化時 | ジオフェンス設定・ハードモード（0028） |
| 24 | ✅クローズ | staff 開放＝attendance_set のみ（mig0011） |
| 25 | F2/ヒアリング | カードTAX の請求時上乗せ |
| 26 | F1f/F2 | charge_kind（同伴料等の金額分離） |
| 27 | F1f 再訪→F2 | reclose で実査を null に戻す経路 |
| 28 | F3f | drink_claims（ドリンク申告） |
| 29 | F2 | /mine バック表示の created_at 近似・集計期間明示 |
| 30 | F2+ | bottle_keeps の UI 導線（customers と統合設計） |

## 5. 運用の約束事（新セッションへの申し送り・詳細は CLAUDE.md）

DB-first・単一トランザクション・手貼りは ref 目視＋自己証明クエリ・prosrc 検証／二重防御9原則（CLAUDE.md）／テーブル標準型（revoke all→grant select）／全書込 RPC は audit_log_write／verify 緑→コミット・push はフェーズグループ完了後／UI は「対応表→grep 機械確認→2層＋DB 物理保証」の型／コミット規約（co-author 禁止・スラッシュ始まり禁止・パス風トークン禁止）。
