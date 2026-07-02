# NOX ← BANZEN 流用マップ（ファイル単位・CC 参照指示）

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
| シフト（shift_wishes/shifts/attendance/staffing_needs・希望→確定→打刻） | BANZEN シフト機能群 T1-T4b（月カレンダー・必要人数曜日別 T1.5・自動配置 T2/T3・日跨ぎ T4a/b） | ○ | 構造参考。必要人数の曜日7値化（T1.5・方式X）と日跨ぎ（shift-time.ts の crossesMidnight 等）が特に効く |
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

## 7. CC への1行指示テンプレ（流用時に使う）

各サブフェーズで CC にこう投げる（スラッシュ始まり・パス風トークン禁止に注意）：

```
BANZEN の [認可ヘルパー mig / 0025-0026 セキュリティ / P5 会計 / K系キオスク / shift-time 純関数] を開いて構造を確認し、NOX に翻訳してください。用語は tenant を org、staff_id を cast_id に置換。二重防御（冒頭 null guard・revoke public と anon・grant authenticated）は写したうえで、NOX 固有の cast プライバシー RLS を追加してください。まず翻訳 plan を提示（実装はしない）。
```
