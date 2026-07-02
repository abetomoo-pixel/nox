# NOX — データモデル設計（Supabase + RLS 本番版）

> 出典：`SPEC.md`（モック仕様・state インベントリ）＋ `NOX-architecture.md` §4（テーブル叩き台）。
> 本書は**BANZEN（makanai-shift）で実証した Supabase + RLS + SECURITY DEFINER RPC パターンを NOX に適用**した本番データモデル設計。
> スタック確定（2026-06-25）：BANZEN と同じ **Supabase（Postgres + RLS + SECURITY DEFINER RPC）+ Next.js + Vercel**。Prisma/tRPC の叩き台は設計参考として活かし、実装は BANZEN 流に統一。
> 確定事項：①テナント = org→store→データの3階層（BANZEN の tenant→store と同型）／②キャストもログインする（cast は membership ロール・自分の行のみ操作）。
> ⚠ 認証・決済・税務・労務・風営法は**専門家レビュー前提**。本書は設計フラグを立てるのみ。

---

## 0. 設計の優先順位（architecture.md §0 継承）

1. **お金の正確性・改ざん耐性**
2. **認証/権限の堅さ**
3. **コンプラ（夜職特有：風営法・労基・源泉・マイナンバー）**
4. **体験**

**お金は必ず整数（円）。浮動小数禁止。**（BANZEN と同一原則）

---

## 1. BANZEN から継承する実装パターン（NOX に適用）

NOX 叩き台にまだ反映されていない、BANZEN で実証済みの教訓を全テーブル設計の前提とする。

### 1.1 マルチテナント認可ヘルパー（BANZEN 0002/0010 と同型）
NOX 用に以下を最初のマイグレーションで定義：
- `auth_org_id()` … 現在ユーザーの org（BANZEN の `auth_tenant_id()` に対応）
- `auth_role()` … 現在ユーザーの role（owner/manager/staff/cast）
- `auth_store_id()` … 現在ユーザーの所属 store
- `auth_cast_id()` … cast ロールのユーザーに紐づく casts.id（cast セルフ操作用・BANZEN の `auth_staff_id()` に対応）

### 1.2 二重防御（BANZEN の最重要教訓・全 RPC に適用）
- **冒頭で `auth_org_id() is null` 即拒否**（`<> auth_*()` の NULL 比較は anon・未所属ユーザーが素通りするため）。
- **`revoke execute from public, anon`**（public だけだと Supabase が anon に直 grant するため不足）＋ `grant to authenticated`。
- センシティブ操作（マイナンバー閲覧・給与確定・お金が動く操作）は SECURITY DEFINER RPC の内部ホワイトリスト経由のみ。client-direct 書き込み禁止。
- `auth_cast_id() is null` ガードは**入れる箇所を選ぶ**（cast セルフ操作のみ。manager 代理操作には入れない＝BANZEN の request_accept 教訓）。

### 1.3 RLS の基本形（BANZEN 0030-0033 踏襲）
- 全業務テーブルに `org_id`（必要に応じ `store_id`）。
- SELECT：`org_id = auth_org_id() and (auth_role()='owner' or store_id = auth_store_id())`（店スコープ）。owner は org 全店、それ以外は自店。
- **cast の特別扱い**：cast は他キャストの金額・店舗総額が見えない（プライバシー by ロール）。金額系テーブルの SELECT に `auth_role() <> 'cast' or cast_id = auth_cast_id()` を追加。
- 書き込みは RPC 経由（直 INSERT/UPDATE/DELETE ポリシーは原則作らない）。
- 物理削除を避け、`deleted_at`（ソフト削除）を使う（監査・凍結との整合）。

### 1.4 お金・給与の凍結（BANZEN payslip スナップショットと同一思想）
- 給与は期間で凍結：`payroll_runs` 確定時に `payslips.breakdown_json` へ確定値スナップショット。後からマスタを変えても確定済みは不変。
- マスタ凍結：確定済み期間の料金/商品/プランは編集不可（BANZEN の frozen_masters 思想）。
- 金額が動く操作は冪等キー＋サーバ再計算＋トランザクション。

### 1.5 監査（NOX 固有で重い・BANZEN より厳格）
- `audit_logs` に全特権操作を before→after で記録。NOX は風営法・労基・マイナンバーがあるため BANZEN より監査要件が重い。

---

## 2. テーブル定義（Supabase 版・マイグレーション単位で分割）

記法：`型`、`FK→`、`*`=必須、金額は `int`（円）。`id uuid default gen_random_uuid()`、`created_at/updated_at timestamptz default now()`、`deleted_at timestamptz`（ソフト削除）は明記時のみ。全業務テーブルに `org_id`（多くに `store_id`）＋ RLS。

### 2.1 組織・ユーザー・認証（M01 相当）

**orgs**（運営会社＝BANZEN の tenants に対応）
- `id*`, `name*`, `plan`（early/standard/premium）, `status`（active/suspended）

**stores**
- `id*`, `org_id*→orgs`, `name*`, `short`, `open_time`, `settings_json`（時間制/カード手数料/控除既定）
- billing 関連列（BANZEN の billing gate を踏襲・Stripe 連携）

**users**（スタッフ＝owner/manager/staff。**cast も user を持つ**＝確定事項②）
- `id*`, `org_id*`, `auth_user_id*`（Supabase Auth の uid）, `email*`, `name`, `is_active`

**memberships**（user × store × role の多対多＝認可の真実・architecture.md §5）
- `id*`, `user_id*→users`, `store_id*→stores`, `role*`（owner/manager/staff/cast）, `is_active`
- ⚠ **認可の真実はこのテーブル**。`auth_role()`/`auth_store_id()` はここを引く。退職者は `is_active=false` で即時失効。

**casts**（キャスト＝業務データとしての存在。`user_id` で login ユーザーと紐付け）
- `id*`, `org_id*`, `store_id*`, `name`（源氏名）, `real_name`（**暗号化**）, `birthday`（**暗号化**）, `kind`, `employment`（委託/雇用）, `is_active`, `user_id?→users`（cast がログインする場合・確定事項②で必須運用）
- ⚠ real_name/birthday は at-rest 暗号化＋アクセスログ（コンプラ §9）。

### 2.2 報酬設計（M02 相当）

**comp_plans**（待遇プラン）
- `id*`, `store_id*`, `name`, `base`（保証時給）, `hon_back`, `jonai_back`, `dohan_back`, `slides_json`（時給スライド3段）, `sales_slide_json`, `point_slide_json`

**cast_plan**（キャスト×プラン割当）
- `cast_id*→casts`, `plan_id*→comp_plans`, `overrides_json`（base/各バック上書き）

**cast_norms**（ノルマ・期間別）
- `cast_id*`, `period`（YYYY-MM）, `days_target`, `dohan_target`

**cast_tax_profiles**（税務プロファイル）
- `cast_id*`, `mode`（報酬/給与）, `invoice`（課税/免税）, `reg_no`（適格請求書番号）, `mynumber`（**暗号化・閲覧は別権限＋アクセスログ必須**）

**deductions**（控除マスタ）
- `id*`, `store_id*`, `name`, `amount`, `per`（day/month/rate）… 送り代/厚生費

**penalty_config**（罰金・ノルマペナルティ設定）
- `store_id*`, `fine_absent`, `fine_late`, `norm_on`, `norm_days_flat`, `norm_days_per`, `norm_dohan_flat`, `norm_dohan_per`

### 2.3 商品・在庫（M03 相当）

**products**
- `id*`, `store_id*`, `type`（drink/champ/bottle）, `category`, `name`, `price`, `cost`, `back_mode`（unit/rate）, `back_value`, `is_active`

**bottle_keeps**（ボトルキープ）
- `id*`, `store_id*`, `customer_id?`, `product_id*`, `opened_at`, `status`, `note`

**stock_logs**（在庫増減ログ・append-only）
- `id*`, `product_id*`, `delta`, `reason`, `at`, `by_user_id`

### 2.4 来店・会計 POS（M04 相当・お金の中核）

**checks**（来店＝伝票）
- `id*`, `store_id*`, `seat_id`, `started_at`, `people`, `nom_type`, `customer_id?`, `status`（open/closed）, `merged_into?`（相席統合先）
- ⚠ お会計確定は冪等キー＋サーバ再計算＋トランザクション（BANZEN の pos_order_checkout と同思想）。

**check_nominations**（指名・複数指名の分配）
- `check_id*`, `cast_id*`, `ratio`（複数指名の分配比）

**check_lines**（明細）
- `id*`, `check_id*`, `group`（伝票A/B 分割会計）, `product_id?`, `name`, `unit_price`, `qty`, `kind`（set/time/drink/champ/bottle/custom）
- ⚠ 会計時点の値をスナップショット（BANZEN の name_snapshot/unit_price_snapshot 踏襲）。

**payments**（入金・部分入金可）
- `id*`, `check_id*`, `group`, `method`（cash/card/ar/other）, `amount`, `paid_at`, `by_user_id`

**seats**（席マスタ）
- `id*`, `store_id*`, `name`, `kind`（卓/カウンター/VIP）

**receivables**（売掛＝ツケ）
- `id*`, `store_id*`, `customer_id?`, `cast_id?`, `amount`, `deduct_from_cast?`, `status`
- ⚠ **風営法 2025 改正の売掛規制**。settings で売掛可否・上限を制御（コンプラフラグ）。

**【F1b 実装確定（2026-07-02・mig0006/0007）】§2.4 の実装反映と逸脱の記録**
1. **checks.status に `void` を追加**（open/closed/void）。確定後の訂正は金額書換でなく void（BANZEN 教訓）。
2. **check_cast_backs を新設**：close 時に確定するキャスト別バック記録（drink/champ/bottle 額＋hon_pt_alloc）。
   F2 給与入力（productBack/pointProducts）の集計元であり、**cast が「自分のバックだけ」を見るパターン1テーブル**。
3. **check_lines.back_snapshot（jsonb）を追加**：add_line 時点の商品バック設定（back_mode/back_value/unit4/hon_pt）を
   コピーし、close 時の分配計算をマスタ変更から凍結（スナップショット原則の適用範囲拡大）。
4. **kind に `charge` を追加**（set/time/charge/drink/champ/bottle/custom）。時間制（セット/延長）・指名料・
   同伴料等の料金行はすべて明細行として計上（モック実測）。
5. **total の定義（モック実測）**：`total = Σ_pay_group Tp(Bx_g + round(Bx_g × service_rate%))`。
   Bx_g=group 内 Σ(unit_price_snapshot×qty)。消費税計算なし（内税表記）。Tp=round_unit×round_mode（up/down/round）の
   端数丸め。**サ料・丸めは pay_group 単位**。カードTAX は請求に乗せず日報集計（F1e）。
   **service_rate/round_unit/round_mode は check_open 時に stores.settings_json から checks へスナップショット**し、
   recalc・close 判定は凍結値のみを読む（open 中の設定変更で total が動く事故の防止）。
6. 命名・型の確定：`group`→`pay_group`（SQL 予約語回避・BANZEN 0038 踏襲）／明細は `name_snapshot`/`unit_price_snapshot`／
   `check_nominations.ratio`→**`ratio_weight int`（整数重み・6:4 等・正規化は計算時）**＋`position`（分配タイブレーク用）。
7. **receivables に `check_id`（来歴）と status `voided` を追加**：check_void 時、由来する open 売掛を連動 void。
   collected/deducted 済みの売掛が存在する伝票は void 拒否（回収済み売掛の宙吊り防止）。
8. 入金は**残額クリップ（過入金なし・モック準拠）**：amount ≤ group 残額を RPC で強制。現金の釣銭は tendered−amount。

### 2.5 勤怠・シフト（M05 相当・BANZEN シフト資産が効く）

**shift_wishes**（希望シフト）
- `cast_id*`, `date`, `start`, `end`, `status`

**shifts**（確定シフト）
- `id*`, `store_id*`, `cast_id*`, `date`, `start`, `end`, `status`（planned/confirmed）

**attendance**（出勤実績＋キャスト自己連絡）
- `id*`, `cast_id*`, `date`, `status`（出勤/同伴/遅刻/休み/当欠）, `eta?`, `reason?`, `source`（staff/self）
- ⚠ cast の自己連絡（遅刻/欠勤）もここ。`auth_cast_id()` で本人のみ source=self を書ける。

**punches**（打刻・append-only）
- `id*`, `cast_id*`, `clock_in`, `clock_out`
- ⚠ BANZEN の punches 踏襲：append-only（UPDATE/DELETE ポリシーなし）。ジオフェンス/IP 判定はソフト（フラグのみ・ハードブロックなし）。

**staffing_needs**（必要人数・曜日別）
- `store_id*`, `weekday`, `required`
- ⚠ BANZEN の T1.5（必要人数の曜日7値化）がそのまま参考になる。

### 2.6 申告・承認・通知・採用（M06 相当）

**drink_claims**（ドリンク自己申告）
- `id*`, `store_id*`, `cast_id*`, `product_id*`, `qty`, `status`（pending/approved/rejected）, `decided_by?`, `notified`（bool）

**approvals**（割引/無料の二重承認）
- `id*`, `store_id*`, `type`（discount/free）, `amount`, `reason`, `requested_by`, `status`, `decided_by?`
- ⚠ owner/manager のみ decide（BANZEN の二重承認パターン）。

**notices**（お知らせ・掲載期限）
- `id*`, `store_id*`, `title`, `body`, `audience`（all/cast/staff）, `pinned`, `publish_until`（掲載期限・期限切れ自動アーカイブ）, `created_by`
- ⚠ 期限切れアーカイブは BANZEN の遅延有効期限教訓：`raise` でなく `return`/フラグ判定で（raise は前の書き込みもロールバック）。

**trials**（体入→本採用）
- `id*`, `store_id*`, `name`, `kind`, `rating`, `docs_json`（身分証/契約/誓約/口座のチェック）, `status`
- ⚠ **採用時の年齢確認（18歳未満就業禁止）を体入フローに組込み**（風営法）。

**advances**（前借り）/ **transport_settlements**（送り実費）
- `id*`, `cast_id*`, `amount`, `status`（→給与天引き）
- ⚠ 天引きは本人同意の記録（労基法・全額払いの例外）。二重控除ガード（送り実費 vs 一律送り代）。

### 2.7 顧客 CRM（M07 相当）

**customers**
- `id*`, `store_id*`, `name`, `furigana`, `cast_id?`（担当）, `visits`, `last_visit`, `total_spend`, `birthday`, `tel`, `prefs`, `memo`
- ※ボトルは bottle_keeps、来店は checks から集計、離反は last_visit から算出。

### 2.8 給与・税務スナップショット（M08 相当・凍結の中核）

**payroll_runs**（給与計算実行）
- `id*`, `store_id*`, `period`（YYYY-MM）, `status`（draft/finalized）, `finalized_at`

**payslips**（給与明細・確定時凍結）
- `id*`, `run_id*→payroll_runs`, `cast_id*`, `breakdown_json`（wage/各バック/控除/罰金/ノルマ未達/源泉/天引き/net を**確定時点の値で凍結**）, `net`, `paid`（bool）
- ⚠ BANZEN payslip スナップショットと同一。確定後はマスタ変更の影響を受けない。

**payment_records**（支払調書）
- `id*`, `cast_id*`, `period`, `amount`, `withholding`, `reg_no`
- ⚠ 源泉(10.21%)・区分・支払調書は確定値から生成。**税率/計算は税理士確認**。

### 2.9 監査（M09 相当・全 org 横断）

**audit_logs**
- `id*`, `org_id*`, `store_id?`, `actor_user_id`, `action`, `target`, `before_json`, `after_json`, `at`, `ip`
- ⚠ 全特権操作を記録（改ざん不可運用）。NOX は BANZEN より監査要件が重い（風営法・労基・マイナンバー）。

---

## 3. RLS 設計の要点（テーブル横断）

### 3.1 標準店スコープ（大半のテーブル）
```
SELECT: org_id = auth_org_id()
        and (auth_role() = 'owner' or store_id = auth_store_id())
```

### 3.2 cast プライバシー（金額系テーブル：payslips/payments/receivables/cast 報酬系）
```
SELECT: 上記に加えて
        (auth_role() <> 'cast' or cast_id = auth_cast_id())
```
cast は自分の金額のみ。他キャストの金額・店舗総額は不可視（API/RLS 双方で強制）。

### 3.3 cast セルフ操作（attendance source=self / shift_wishes / drink_claims / mine 系）
```
RPC 内で auth_cast_id() を検証し、本人の行のみ操作可。
manager 代理操作には auth_cast_id() ガードを入れない。
```

### 3.4 マイナンバー（cast_tax_profiles.mynumber）
- **別権限＋アクセスログ必須**。閲覧専用 RPC を分離し、呼び出しを必ず audit_logs に記録。通常の cast SELECT では mynumber を返さない（列マスク or 別テーブル分離を検討）。

---

## 4. マイグレーション分割案（BANZEN の番号順手貼り運用）

NOX も BANZEN 同様、DB 先・コード後・番号順手貼り。フェーズに対応：

| mig | 内容 | フェーズ |
|---|---|---|
| 0001 | 認可ヘルパー（auth_org_id/role/store_id/cast_id）＋ orgs/stores/users/memberships/casts ＋ RLS | F0 土台 |
| 0002 | 報酬設計（comp_plans/cast_plan/cast_norms/cast_tax_profiles/deductions/penalty_config） | F2 準備 |
| 0003 | 商品・在庫（products/bottle_keeps/stock_logs） | F1 |
| 0004 | POS（checks/check_nominations/check_lines/payments/seats/receivables）＋会計 RPC | F1 |
| 0005 | 勤怠・シフト（shift_wishes/shifts/attendance/punches/staffing_needs） | F1 |
| 0006 | 申告・承認・通知・採用（drink_claims/approvals/notices/trials/advances/transport_settlements） | F3 |
| 0007 | 顧客 CRM（customers） | F3 |
| 0008 | 給与・税務（payroll_runs/payslips/payment_records）＋給与確定 RPC | F2 |
| 0009 | 監査（audit_logs）＋監査トリガ/RPC | F0〜全般 |

※番号・分割は実装時に調整。お金の中核（0004 POS・0008 給与）は特に慎重に。

---

## 5. BANZEN との対応表（資産再利用マップ）

| NOX | BANZEN 対応 | 再利用度 |
|---|---|---|
| org→store→データ 3階層 | tenant→store→データ | ◎ そのまま |
| auth_org_id/role/store_id/cast_id | auth_tenant_id/role/store_id/staff_id | ◎ ほぼそのまま |
| memberships（認可の真実） | BANZEN の認可構造 | ◎ |
| 二重防御 RPC | 0025/0026/0035 パターン | ◎ |
| cast プライバシー RLS | （BANZEN にない・NOX 固有） | △ 新規 |
| payslips 凍結 | payslip スナップショット | ◎ 同思想 |
| punches append-only | punches（0028-0029） | ◎ |
| staffing_needs 曜日別 | T1.5 必要人数曜日7値 | ○ 参考 |
| シフト確定/希望 | シフト機能群（T1-T3） | ○ 参考 |
| お会計確定 RPC | pos_order_checkout | ○ 構造参考 |
| billing gate | auth_billing_writable | ◎ |
| マイナンバー暗号化・アクセスログ | （BANZEN にない・NOX 固有） | △ 新規 |
| 風営法/労基/源泉フラグ | （BANZEN にない・NOX 固有） | △ 新規 |

**◎ そのまま再利用 / ○ 構造参考 / △ NOX 固有で新規**

NOX 固有の新規部分は「cast プライバシー」「マイナンバー厳格管理」「夜職コンプラ（風営法・源泉・売掛規制）」に集中。それ以外の土台（マルチテナント・認可・二重防御・凍結・打刻）は BANZEN 資産がそのまま効く。

---

## 6. 次のステップ（データモデル翻訳の続き）

本書は**テーブル定義と RLS 設計の骨格**。次に詰めるべきは：
1. **計算ロジックの配置**（payOf を「サーバ RPC＝お金が動く」と「純関数＝表示計算」に振り分け）← 設計書の次パート
2. **認可設計の詳細**（capability マトリクス→RLS ポリシー具体化・cast セルフ操作の RPC 一覧）
3. **段階リリース計画**（F0 土台→F1 MVP→F2 報酬/税務→F3 CRM/AI→F4 連携）の BANZEN フェーズ式への再構成
4. 各 mig の具体 SQL（実装フェーズ・CC へ）

---

## 7. 専門家確認フラグ（NOX 固有・最重要）

- **風営法**：18歳未満就業禁止（採用時年齢確認を trials に組込）・2025改正売掛規制（receivables 上限制御）・営業時間。
- **労基法**：天引き本人同意（advances/transport/receivables の給与天引き）・減給上限（労基法91条・penalty_config）・賃金台帳・労働時間記録。
- **税務**：源泉(ホステス特例 10.21%)・インボイス（適格請求書・reg_no）・支払調書・マイナンバー（番号法）。
- **個人情報**：real_name/birthday/tel/mynumber の暗号化・アクセスログ・保持期間。
- **決済（PCI）**：PSP 委託で SAQ-A 範囲・夜職の加盟店審査に注意。

**いずれも AI 出力は補助・最終判断は税理士/社労士/弁護士。**
