# NOX ← BANZEN 流用マップ（ファイル単位・CC 参照指示）

> **改訂 2026-07-17**：本マップは F0a（2026-07-02）から docs/ に収載済みだったが、2026-07-13 の
> 「BANZEN と NOX は別チャット」分離ルール（過剰・裁定台帳で再定義済み）により参照が途絶え、
> シフト等が BANZEN 資産を開かずに薄く実装された。§7（シフト詳細・ファイル単位）と §8（実測注記）を
> BANZEN repo の実測（読み取り専用）に基づき追補。参照ルール＝**BANZEN は読み取り専用・書込とコミットは一切禁止・
> 持ち込むのは実装パターンのみ（設計判断・推奨・課題は持ち込まない）**。
> 前提：CC は両リポジトリを参照可能。NOX 実装時、CC は「BANZEN の該当ファイルを読む → NOX に翻訳する」で進める。ゼロから書かない。
> 記法：◎そのまま翻訳（構造・命名を写して用語だけ tenant→org 等に置換）／○構造参考（骨格を借りて中身は NOX 仕様）／△新規（BANZEN に無い・NOX 固有）。
> 命名の基本置換：`tenant`→`org`、`auth_tenant_id`→`auth_org_id`、`auth_staff_id`→`auth_cast_id`、`staff`→`cast`（該当箇所）、`punch`→`punch`（同じ）、`makanai-shift`→`nox`。

---

## 0. まず CC がやること（翻訳前の調査）

各流用項目について、CC は BANZEN 側の**実ファイルを開いて構造を確認**してから翻訳する。メモリの mig 番号・RPC 名はヒントであり、実ファイルが正本。特に：
- 認可ヘルパーの実定義（BANZEN 0002/0010 系）
- セキュリティ修正の実装（BANZEN 0025/0026＝revoke・NULL guard パターン）
- verify スクリプトの構造（`verify:*` の書き方・rpc-anon-guard）
- キオスクの3層防御と UI 構造（K-a〜K-h・`app/kiosk/`）

---

## 1. F0 土台（今すぐ流用する範囲）

| NOX で作るもの | BANZEN 流用元 | 度 | 翻訳メモ |
|---|---|---|---|
| 認可ヘルパー `auth_org_id/role/store_id/cast_id` | 認可ヘルパー mig（0002/0010 系の `auth_tenant_id/role/store_id/staff_id`） | ◎ | tenant→org、staff_id→cast_id。memberships を真実にする点は同じ |
| 二重防御パターン（全 RPC 冒頭 null guard ＋ revoke from public,anon ＋ grant authenticated） | セキュリティ修正 mig 0025/0026 | ◎ | **そのまま写す**。`auth_org_id() is null` 冒頭 raise。revoke は必ず public,anon 両方 |
| 標準店スコープ RLS | BANZEN RLS 0030-0033 系 | ◎ | `org_id = auth_org_id() and (auth_role()='owner' or store_id = auth_store_id())` |
| gen_random_uuid の使用方針（pgcrypto 回避） | P4.5 mig0037 の教訓（gen_random_bytes→gen_random_uuid 切替） | ◎ | UUID は core を使う。pgcrypto 必要時のみ search_path=public,extensions |
| audit_logs ＋ 監査骨格 | BANZEN の監査・操作履歴系（K-f の append-only 監査テーブル wrapper パターンが近い） | ○ | NOX は before→after 記録・要件が重い。append-only wrapper の作りを参考 |
| verify スイート（rpc-anon-guard 相当・店スコープテスト） | BANZEN `verify:*`（rpc-anon-guard 26/26・verify:kiosk 等） | ◎ | スクリプト構造を写す。anon BLOCKED・他店0行の assert |
| リポジトリ雛形・Dropbox ignore・コミット規約 | BANZEN リポジトリ設定（.next/node_modules の com.dropbox.ignored） | ◎ | 同じ設定 |

---

## 2. F0 の心臓部：payOf（BANZEN の純関数思想を流用）

| NOX | BANZEN 流用元 | 度 | メモ |
|---|---|---|---|
| `lib/nox/pay.ts` の純関数化・DB非依存・テスト容易 | BANZEN の純関数（`buildReceiptXml`/`decidePunch`/`payroll` 系）の**設計思想** | ○ | コードは流用しない（計算内容が別物）。「純関数＋verify・サーバ再計算・凍結」の型を借りる |
| 給与確定＝サーバ再計算→凍結 | BANZEN `pos_order_checkout`（サーバ再計算）＋ payslip スナップショット | ◎(思想) | クライアント送信値を信用しない・確定値凍結 |
| 丸めの集約（税理士 floor 指定に一括差替できる形） | BANZEN payroll L82-84 / labor.roundYen の集約 | ◎ | 丸め箇所を1箇所に集約して後で差替可能に |
| 実装元の計算仕様 | （NOX 固有・モック抽出） | △ | `docs/NOX_payOf_精密仕様_モック抽出.md` が正本 |

---

## 3. F1 MVP（レジ・シフト・日報）

| NOX | BANZEN 流用元 | 度 | メモ |
|---|---|---|---|
| 会計確定 RPC（checks/check_lines/payments・冪等・トランザクション） | BANZEN POS P1-P3 ＋ P5 テーブル管理（orders/order_items/payments・open ライフサイクル・卓モード RPC・分割会計 group・部分入金） | ◎ | **NOX の checks 構造は BANZEN P5 とほぼ同型**（設計書が「拡張で到達」と判明済み）。P5 の open/add_line/pay/close＋group 分割を写す |
| 席マスタ seats | BANZEN P5 の seats | ◎ | そのまま |
| 名前スナップショット（会計時の値凍結） | BANZEN の name_snapshot/unit_price_snapshot | ◎ | check_lines に写す |
| シフト（shift_wishes/shifts/attendance/staffing_needs・希望→確定→打刻） | BANZEN シフト機能群 T1-T4b（月カレンダー・必要人数曜日別 T1.5・自動配置 T2/T3・日跨ぎ T4a/b） | ○ | **★§7 のファイル単位マップが正**（2026-07-17 追補）。F1d は「希望→確定→打刻」のみ実装済み＝月カレンダー/割当グリッド/自動配置は未輸入 |
| 打刻 punches（append-only・ジオフェンス/IPソフト判定） | BANZEN punches（0028-0029・append-only・ソフト判定） | ◎ | UPDATE/DELETE ポリシー無し。ハードブロックしない |
| 日跨ぎ時刻の単一ソース | BANZEN `lib/shift-time.ts`（crossesMidnight/spanMinutes/netMinutes/nominalSegment） | ◎ | NOX は営業が深夜帯中心＝日跨ぎ必須。この純関数を写す価値が高い |
| cast プライバシー RLS（パターン1/2/3） | （BANZEN に無い・NOX 固有） | △ | 新規。ただし staff セルフ RLS（自分の打刻/希望のみ）の型は流用可 |
| 課金ゲート（将来 F4 で Stripe） | BANZEN BP-a〜BP-c（pos_enabled/multi_store_enabled フラグ・auth_billing_writable・ソフトブロック・RLS WITH CHECK） | ◎ | フラグ＋ゲートヘルパー＋ソフトブロックの型を写す |

---

## 4. キオスク（設計 §7.5・時期は F4・流用前提）

★BANZEN のキオスク資産 **K-a〜K-h は完成済み**なので、NOX キオスクは実装時にほぼ流用で到達する。今は流用元を明記しておくだけ（実装は F4）。

| NOX キオスク | BANZEN 流用元（完成済み） | 度 | メモ |
|---|---|---|---|
| キオスク認証3層防御（Stage1 kiosk専用RPC の two-pass・Stage2 raw RPC でのkiosk拒否・Stage3 SELECT に auth_role()<>'kiosk'） | BANZEN K-a〜K-e（3層防御・case-Y two-pass・kiosk_pin_check 境界） | ◎ | **そのまま流用**。NOX は cast を除外する分むしろ単純 |
| キオスク監査（append-only wrapper） | BANZEN K-f | ◎ | wrapper パターン写す |
| キオスク読み取り RPC ＋ キオスク UI（別レイアウト・idle timeout・楽観更新） | BANZEN K-g（`app/kiosk/` 別レイアウト・90秒 idle・楽観更新） | ◎ | UI 構造を写す。NOX は黒服/店長のみ・レジ/シフトに限定 |
| キオスク検証スイート | BANZEN K-h（verify:kiosk 14/14・aggregate script） | ◎ | assert を NOX 用に |
| **NOX 固有の差分**：cast はキオスク不使用（個人スマホのみ）→ キオスク RLS で cast 経路ゼロ | （BANZEN は全 staff 使用） | △ | cast プライバシー（§2 RLS 物理保証）と完全整合。キオスクに cast 報酬が出る経路が構造的に無い |

**キオスク実装の勘所（BANZEN 教訓）**：
- キオスクアカウントは memberships に kiosk 相当ロールで乗る（NOX も memberships 構造なので素直）。
- 個人識別＝名前選択＋PIN オプション（夜職のレジは現金が大きいので PIN 推奨）。
- kiosk_pin_check が case-Y 境界：手前は raise、以降は jsonb 返却。
- **キオスクアカウントは Stage2（raw RPC 遮断）と Stage3（SELECT 制限）完了まで本番で provision しない**。

---

## 5. F2/F3 で流用するもの（参考・後日）

| NOX | BANZEN 流用元 | 度 |
|---|---|---|
| 給与確定・凍結（payroll_runs/payslips・breakdown_json） | BANZEN payslip スナップショット・W シリーズ（給与可視化 W0-W2） | ◎(思想) |
| 深夜割増の設定基盤（もし NOX でも使うなら） | BANZEN W0（night_premium 設定・payroll 改修） | ○ |
| マスタ凍結（確定期間は編集不可） | BANZEN frozen_masters 思想 | ◎ |
| 二重承認（approvals・割引/無料） | BANZEN の二重承認パターン | ◎ |
| 掲載期限アーカイブ（raise でなく return） | BANZEN 遅延有効期限教訓 | ◎ |
| 自己申告→承認（drink_claims） | BANZEN の申請→承認フロー | ○ |

---

## 6. 流用しない（NOX 固有・BANZEN に無い）

- cast プライバシーの行隔離（パターン1/2/3 の RLS）
- 集計の安全提供（順位/件数のみ返す SECURITY DEFINER RPC）
- マイナンバー厳格管理（cast_sensitive 別テーブル＋閲覧専用RPC＋アクセスログ）
- 夜職コンプラ（風営法の年齢確認・売掛規制、源泉ホステス特例、インボイス）
- payOf の計算内容（BANZEN の payroll とは別物・モック抽出が正本）

→ NOX 固有の新規は「cast プライバシー」「マイナンバー」「夜職コンプラ」「payOf 計算」の4点に集中。**それ以外の土台（マルチテナント認可・二重防御・凍結・打刻・会計・キオスク）は BANZEN 資産がそのまま効く。**

---

## 7. シフト再実装の詳細マップ（ファイル単位・2026-07-17 実測）

BANZEN 側は下記全ファイルを現物確認済み（読み取り専用）。翻訳時は必ず実ファイルを開くこと。
NOX 側の現状＝shift-board.tsx 285行（希望承認/1件フォーム/確定/出勤板/必要人数）のみ。

### UI（app/(app)/shift/）

| BANZEN ファイル | 行数 | 度 | NOX への翻訳メモ |
|---|---|---|---|
| `shift-planner.tsx` | 1211 | ○ | 親。月カレンダー＋確定バー（不足X日/充足Y日/余剰Z日=:768-770）＋自動配置3モード（チェック一括/優先順/1人ずつ仮置き=:158）＋一括取消（source='auto' のみ削除=:363）＋人件費見込み（:286・NOX は payOf sim 接続）。band/position 次元を落として縮退翻訳 |
| `_components/shift-month-grid.tsx` | 95 | ◎ | 月グリッド（次元非依存）。そのまま翻訳 |
| `_components/shift-month-pager.tsx` | 46 | ◎ | 月送り。そのまま |
| `_components/shift-date-utils.ts` | 35 | ◎ | 日付ユーティリティ。そのまま |
| `_components/shift-matrix-view.tsx` | 115 | ○ | スタッフ×日マトリクス（不足バッジ=:52）。staff→cast |
| `_components/shift-day-detail.tsx` | 139 | ○ | 日詳細シート。3状態の判定式は :63（assigned<required→不足 / >→余剰 / =→充足） |
| `_components/shift-request-processing.tsx` | 402 | ○ | 希望処理（配置済み/未処理の判定）。NOX shift_wishes へ写像 |
| `_components/req-config-editor.tsx` | 121 | ○ | 必要人数エディタ（band×position×dow→min・平日一括/週末一括=:48-51）。NOX は staffing_needs（dow×required）＝行次元を落とす |
| `_components/priority-reorder.tsx` | 144 | ○ | 自動配置モードB の優先順 D&D（@dnd-kit・遅延チャンク） |
| `_components/shift-swap-review.tsx` | 108 | △判断 | 交代申請。NOX モックに無い＝導入は裁定待ち |
| `_components/shift-types.ts` | 45 | △ | 型は NOX スキーマから書き直し |

### lib（純関数）

| BANZEN | 度 | メモ |
|---|---|---|
| `lib/shift-autoassign.ts` | ○ | 貪欲法・説明可能・純関数 DB 非依存（走査=日→帯→職種・候補=希望あり∧未割当・ソート=①最低月間時間未達②割当少=公平③目標金額・出力=割当+不足枠+希望過多）。NOX は帯/職種を落とし「日→必要数→候補→公平」へ縮退 |
| `lib/shift-time.ts` | ◎ | **実装済み**（NOX lib/nox/shift-time.ts・verify 44 緑・fmtBand30 等の夜職拡張差分あり） |
| `lib/shift-estimate.ts` | ○ | 人件費見込み。NOX は payOf sim（F2f）接続に差し替え |
| `lib/shift-month.ts` / `lib/shift-bridge.ts` | 未読 | 役割未確認＝翻訳着手時に開く（このマップの実測対象外だった） |
| `app/api/shift/auto-assign` route | ○ | planner:390 から fetch。サーバ側で lib を呼ぶ構造 |

### DB（supabase/migrations/）

| BANZEN | NOX 対応 | 度 | メモ |
|---|---|---|---|
| `shift_periods`（0003・期間/締切/status collecting→drafting→published） | 無し | △判断 | NOX は period 概念なし（shifts.status planned/confirmed のみ）。募集締切・一括公開を入れるなら新規 mig |
| `req_config`（0003 weekday_min/weekend_min → 0027 で dow 7値化・**min＝下限**） | staffing_needs（dow×required）実装済み | ○ | 概念差は §8。NOX は band/position 無し |
| `shift_requests`（pref 3値 preferred/available/unavailable＋req_from/to） | shift_wishes（date+start/end+status）実装済み | ○ | NOX に pref 概念なし（提出＝出たい日のみ）。「×の日」を扱うなら要拡張 |
| `shift_assignments`（band/position/break_min/**source auto\|manual**） | shifts 実装済み | ○ | NOX に source 列なし＝自動配置を入れるなら「auto のみ一括取消」のため source 列追加が必須 |
| RPC 群（submit_shift_requests/request_accept・reject・propose/requests_review/shift_request_store_propose・accept・reject/auto_submit_expired_drafts） | shift_wish_submit/decide/withdraw・shift_set 実装済み | ○ | 打診（store_propose）は NOX 未実装・モックにも無い＝裁定待ち |

## 8. 実測注記（2026-07-17・両 repo 現物）

**必要人数の概念差（実測で確定）**：
- NOX `staffing_needs` = dow×required の**下限のみ**。UI は編集のみで充足判定の表示なし。
- BANZEN `req_config` = band×position×dow の **min（同じく下限）**。ただし判定は**3状態**＝
  `assigned < required → 不足 / > → 余剰 / = → 充足`（shift-day-detail.tsx:63）で、**余剰（希望過多・人件費超過）も警告**する。
- 「NOX は最低・BANZEN は逆」という直感の実体は「両方とも下限。ただし BANZEN は余剰も出す（飲食＝人件費抑制）、
  NOX は出さない（夜職＝出勤は多いほど良い）」。翻訳時は余剰表示の要否を裁定してから。

**POS 追補（モック照合 2026-07-17 で判明した欠落の流用可否）**：
- 相席（同一会計）・席移動・時間料金自動計算 → **BANZEN に対応物なし**（相席 grep 0件・飲食に時間制なし）＝△NOX 新規。
- GPS/IP 在席判定 → `lib/geofence.ts` が**◎そのまま翻訳**。RestrictMode（gps/ip/both/either/tablet）は
  NOX モックの在席判定4値（GPSのみ/IPのみ/両方一致/いずれか一致）と完全対応。純関数・サーバ側判定・「抑止＋記録」思想も同じ。
- punches.lat/lng は NOX に受け口実装済み（punch_self が p_lat/p_lng を受ける・現状 null 送信＝判定なし）。

**実装済み注記（本マップの ◎/○ のうち検証済みのもの）**：
§1 認可ヘルパー/二重防御/RLS/verify＝実装済み（verify:f0 1785 緑）。§3 会計 RPC/seats/スナップショット＝実装済み（F1b）。
§4 キオスク＝実装済み（F4a mig0043・app/kiosk）。§5 給与確定・凍結・二重承認・自己申告承認＝実装済み（F2c/F3c/F3f）。

**BANZEN のモックは pack されていない**（\uXXXX エスケープ 0件・生 UTF-8 日本語＝grep 可能）。
NOX canonical のみが pack 済み（11,003件・grep 不能）＝**モック判定は必ずエスケープ復元後に行う**こと。

---

## 9. CC への1行指示テンプレ（流用時に使う）

各サブフェーズで CC にこう投げる（スラッシュ始まり・パス風トークン禁止に注意）：

```
BANZEN の [認可ヘルパー mig / 0025-0026 セキュリティ / P5 会計 / K系キオスク / shift-time 純関数] を開いて構造を確認し、NOX に翻訳してください。用語は tenant を org、staff_id を cast_id に置換。二重防御（冒頭 null guard・revoke public と anon・grant authenticated）は写したうえで、NOX 固有の cast プライバシー RLS を追加してください。まず翻訳 plan を提示（実装はしない）。
```
